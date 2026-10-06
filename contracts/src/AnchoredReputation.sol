// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IIdentityRegistry8004, IReputationRegistry8004} from "./interfaces/IERC8004.sol";

/// @title AnchoredReputation — ANCRE verifier (certificate by sub-solution, D26 + D32)
/// @notice Reader-anchored personalised PageRank over ERC-8004 feedback. The contract never solves the
///         fixed point: it receives k columns t^(a) (one per anchor), recomputes y = F(t) over the submitted
///         graph with every term rounded DOWN, and requires t <= y node by node. By monotonicity of F,
///         t is then a lower bound of the fixed point of the committed graph, coordinate by coordinate,
///         and of the true registry graph as long as the committed graph is dominated by it
///         (C_committed <= C_true entry by entry, D32). Two certification levels (D32):
///           - Registry-verified: every committed edge is re-read in the registry at submission, so a
///             fabricated or inflated edge cannot be committed; open submission is allowed only here;
///           - Submitter-attested: the submitters are committed in the setId; discrepancy proofs are
///             the only guard against fabrication.
///         Domination can still break after submission (revocation, newer feedback, wallet change) or, at
///         both levels, through an under-declared row budget B+ (the registry has no per-client index, so
///         a row's completeness is never checkable on-chain). Each such fact is provable (`proveEdge`,
///         `proveWallet`) and widens eLow (lower bound, trust) or eUp (upper bound, distrust) by an exact,
///         per-row capped amount.
///         ENCODING.md gives the calldata layout and the exact integer arithmetic (normative interface
///         with the off-chain solver).
/// @dev    Decisions (docs/conseil/CR-conseil.md): D1/D39 policy committed in the setId, D2/D24 alpha per
///         set, D4 one-hop distrust, D5 absorbing convention, D7 separate budgets B+/B-, D8 leave-one-out m
///         and veto quorum q, D11-reversed stored vectors + append-only node table, D12 tag schema per set,
///         D14 last non-revoked per (client, agent, tag1) + negative dominance, D15 endorsement tags only,
///         D16/D20 current controllers of the target rejected, shared wallets by row copy (alias rows),
///         D44 owner fallback as a committed policy option (VIA_OWNER rows, off unless the set says so),
///         D17 registry version committed, D18 int16 weights, D21/D33 veto = last anchor feedback read
///         live + certified bit as a complement, D22 per-row widening caps, D26 sub-solution, D32 levels,
///         declared B+, fabrication proof, D35 strict transfer mode, D36 eLow budget.
///         Monad: only block.number is used, never block.timestamp.
contract AnchoredReputation {
    // ------------------------------------------------------------------ constants
    uint256 public constant K_MAX = 16;
    uint256 public constant TAGS_MAX = 16; // D24
    uint256 public constant SUBMITTERS_MAX = 8; // D32, Submitter-attested level
    uint256 public constant ROW_MAX = 256;
    uint256 public constant WAD = 1e18;
    /// weight grid: w in [-GRID, GRID] \ {0} represents w / GRID in [-1, 1] (1e-4 steps)
    int256 public constant GRID = 10_000;
    /// gas forwarded to each registry call made from a view: a broken or hostile registry cannot
    /// burn the caller's whole gas limit (on Monad the limit is what is paid)
    uint256 public constant VIEW_CALL_GAS = 120_000;

    uint256 internal constant LANE_MASK = (1 << 63) - 1;
    uint256 internal constant SENTINEL = 1 << 255; // keeps every vector slot non-zero (x->y SSTORE pricing)
    uint256 internal constant KIND_AGENT = 1;
    uint256 internal constant KIND_ADDRESS = 2;
    uint256 internal constant KIND_ANCHOR = 3;
    uint256 internal constant ID_MASK = (1 << 248) - 1;
    /// ERC721NonexistentToken(uint256) (OpenZeppelin v5): the registry's answer for an agent that does not exist
    /// (measured on the v2.0.0 registry, Monad mainnet, 2026-10-06). Any other failure is an unreadable registry.
    uint256 internal constant NONEXISTENT = 0x7e273289;
    uint256 internal constant R_OK = 0; // registry call outcomes (_idCall)
    uint256 internal constant R_NONE = 1;
    uint256 internal constant R_FAIL = 2;
    uint8 internal constant TAG_ENDORSEMENT = 0;
    uint8 internal constant TAG_MEASUREMENT = 1;

    /// row header flags (ENCODING.md §3.2, unified v1 format of 2026-10-01)
    uint256 internal constant H_SRC = 0x8000; // source client present (agent rows)
    uint256 internal constant H_SPLUS = 0x4000; // declared true positive sum present (D32)
    uint256 internal constant H_ALIAS = 0x2000; // copy of an earlier agent row (D20)
    uint256 internal constant H_VIA_OWNER = 0x1000; // source = ownerOf(u), agentWallet(u) = 0 (D44)
    uint256 internal constant H_NE = 0x0fff;
    /// flags lane of a node: bits 0..15 certified veto mask (bit a = anchor a), bit 16 transferred (proof)
    uint256 internal constant F_TRANSFERRED = 1 << 16;

    bytes32 internal constant SET_DOMAIN = keccak256("ANCRE.set.v1");
    bytes32 internal constant COL_DOMAIN = keccak256("ANCRE.col.v1");
    bytes32 internal constant VEC_DOMAIN = keccak256("ANCRE.vec.v1");
    bytes32 internal constant KEY_DOMAIN = keccak256("ANCRE.key.v1");

    // ------------------------------------------------------------------ types
    enum Status {
        OK,
        NO_CERT,
        STALE,
        TRANSFERRED,
        VETOED,
        REGISTRY_CHANGED
    }

    struct TagSpec {
        string tag; // ERC-8004 tag1, any non-empty length (only keccak256(tag) is stored, AM-04.2)
        int128 min; // bounds in WAD (value * 10^(18 - valueDecimals)), compared exactly, before rounding
        int128 neutral;
        int128 max;
        uint8 kind; // 0 = endorsement (creates edges), 1 = measurement (never creates edges, D15)
    }

    /// Everything a payer needs to decide is committed here, hence in the setId (D1, D39): a status OK
    /// only says the certificate is usable, `passesAnchorPolicy` says whether the agent may be paid.
    struct Policy {
        uint64 theta; // WAD, > 0: trustLow >= theta (an unknown agent has trust 0)
        uint32 rhoN; // distrust ratio: rhoD * distrustUp <= rhoN * trustLow
        uint32 rhoD; // > 0
        uint8 minAnchors; // leave-one-out m (D8), 1 <= m <= k, recommended 2
        uint8 vetoQuorum; // q (D8): VETOED iff at least q anchors veto, 1 <= q <= k, recommended 1
        int16 vetoMax; // an anchor feedback of grid weight <= vetoMax is a veto, in [-GRID, -1] (D21, D33)
        uint64 maxAge; // blocks > 0
        uint64 minRefresh; // blocks, see replacement rule
        uint64 slackRefresh; // WAD, see replacement rule
        uint64 eLowMax; // WAD: widening budget of the lower bound, beyond it the set is STALE (D36)
        bool strictTransfer; // D35: live ownerOf in assess (recommended) instead of a proof-set flag
        bool registryVerified; // D32: every committed edge is re-read in the registry at submission
        bool ownerFallback; // D44: an agent with agentWallet = 0 emits its owner's row (VIA_OWNER rows)
        address[] submitters; // D32: strictly increasing, <= SUBMITTERS_MAX; empty = open (requires registryVerified)
    }

    struct SetParams {
        address[] anchors; // strictly increasing, 1..K_MAX (demo: plain addresses, no pre-rotation yet)
        uint64[] lambdas; // WAD, sum == 1e18
        uint32 alphaN; // alpha = alphaN / alphaD, 0 < alphaN < alphaD
        uint32 alphaD;
        bytes32 tagSchemaHash; // hash of the full off-chain schema document
        TagSpec[] tags; // the on-chain tag filter, <= TAGS_MAX, strictly increasing by keccak(tag)
        Policy policy;
    }

    struct TagStored {
        bytes32 hash; // keccak256(bytes(tag)): the registry is matched by hash, so any tag length works
        int128 min;
        int128 neutral;
        int128 max;
        uint8 kind;
    }

    /// Per-set state, placed at a page-aligned storage base so that every field lives in ONE
    /// MIP-8 page (8 100 gas cold for the whole struct instead of one page per field): 84 slots.
    struct SetState {
        // slot 0
        bool registered;
        uint8 k;
        uint8 minAnchors;
        uint8 numTags;
        bool registryChanged;
        uint8 idxWidth; // 2 or 4 bytes per node index in rows
        uint32 alphaN;
        uint32 alphaD;
        uint32 nodeCount;
        uint32 nCert;
        uint32 numRows;
        uint8 vetoQuorum;
        bool strictTransfer;
        bool registryVerified;
        bool ownerFallback; // D44
        // slot 1
        uint64 certBlock;
        uint64 maxAge;
        uint64 minRefresh;
        uint64 certNonce;
        // slot 2
        uint64 slackRefresh;
        uint32 reservedChunks; // vector chunks known to be non-zero (written or reserved)
        uint64 theta;
        uint32 rhoN;
        uint32 rhoD;
        int16 vetoMax;
        // slot 3
        uint64 eLowMax;
        uint8 numSubmitters;
        uint16 endoMask; // bit i = tag i is an endorsement tag (cached at registration)
        uint32 facts; // proven facts of this set (edges and sources): 0 => the submission skips every lookup
        // slots 4..
        uint256 eEff; // eUp aggregated: sum_a ceil(lambda_a * eUp[a] / WAD)   (distrust, replacement rule)
        uint256 eLowEff; // eLow aggregated: sum_a ceil(lambda_a * eLow[a] / WAD) (trust lower bound)
        bytes32 graphRoot;
        bytes32 vectorRoot;
        bytes32 tagSchemaHash;
        bytes32 versionHash; // keccak(identity, keccak(getVersion()), reputation, keccak(getVersion()))
        // replacement rule (AM-04.1, AM-5.16): quality of the incumbent, see submitCertificate
        uint256 mass; // sum_a floor(lambda_a * sum_v t_v^(a) / WAD): total certified lower-bound mass
        uint256 eFloor; // rounding-floor part of eEff at submission: q = eEff - eFloor (widened by proofs)
        uint256 distrustMass; // sum_v d_v: the distrust side of the quality (negative edges, certified vetoes)
        uint256 eSubmitted; // eEff at submission: eEff > eSubmitted or eLowEff > 0 <=> the incumbent was proven wrong
        uint256[16] anchors; // address | lambda << 160
        TagStored[16] tags;
        address[8] submitters; // D32 (inline: same page, no extra cold page at submission)
    }

    /// Per-column bounds (second page: read by submissions and proofs only, never by assess).
    struct ColState {
        uint256[16] eUp; // WAD, t-space: || t*^(a) - t^(a) ||_1 <= eUp[a]
        uint256[16] eLow; // WAD, t-space: || (t^(a) - t*^(a))^+ ||_1 <= eLow[a]
    }

    /// State of a committed row after discrepancy proofs (D22 caps, all WAD, rounded up).
    struct RowState {
        bytes32 h; // keccak(leaf, amends); 0 = never amended
        uint64 dim; // cumulated positive-side decrease of the normalised row (billed to eLow)
        uint64 incP; // cumulated positive-side increase (billed to eUp)
        uint64 incN; // cumulated negative-side increase (billed to eUp)
        bool voided; // the row's client changed (proveWallet): nothing more to prove on it
    }

    struct Assessment {
        Status status;
        uint256 trust; // sum_a floor(lambda_a t^(a)_i / WAD)        (WAD)
        uint256 trustRobust; // trust minus the (m-1) largest anchor contributions (D8)
        uint256 distrust; // one-hop distrust d_i                  (WAD, rounded up)
        uint256 e; // eUp aggregated (upper-bound error)            (WAD, rounded up)
        uint64 certBlock;
        uint8 vetoCount; // anchors whose veto holds (live last feedback or certified bit); VETOED iff >= q
        bytes32 triggerTag; // keccak256(tag1) of the most negative live veto (0 if only certified bits), AM-04.2
        uint256 trustLow; // trustRobust - eLow: lower bound used by the policy (WAD)
        uint256 distrustUp; // distrust + e: upper bound used by the policy (WAD)
        uint256 eLow; // eLow aggregated (widening by discrepancy proofs, D22/D36)
        bool passesPolicy; // D39: status OK, veto checked, and the committed policy (theta, rho) holds
    }

    struct RowRef {
        uint256 pos; // rank of the row in the certificate (Merkle leaf index)
        bytes row; // committed row bytes
        bytes32[] path; // Merkle siblings to graphRoot (may be empty once the row is amended)
    }

    // ------------------------------------------------------------------ storage
    IIdentityRegistry8004 public immutable identity;
    IReputationRegistry8004 public immutable reputation;

    /// (setId, nodeKey) -> index + 1. Written once per node (append-only table, D11 reversed).
    mapping(bytes32 => mapping(bytes32 => uint256)) public nodeIndexPlus1;
    /// keccak(setId, certNonce, u) -> state of the committed row of u after proofs.
    mapping(bytes32 => RowState) internal _rows;
    /// Proven facts (D48-C), per set, outliving every certificate. An EDGE fact (client, agentJ) -> w is the weight
    /// that proveEdge read in the registry; every later row of that client must carry exactly it (a fact is about
    /// the registry, not about one encoding of a row, so no re-encoding, sPlus tweak or dropped edge gets around it).
    /// A SOURCE fact keccak(u, src, via) marks a source claim proven false by proveWallet. refreshFact and
    /// clearSourceFact re-read the registry when it changes again (liveness).
    mapping(bytes32 => mapping(address => mapping(uint256 => uint256))) internal _edgeFact; // 0 = none, else 1 | uint16(w) << 1
    mapping(bytes32 => mapping(address => uint32[])) internal _factAgents;
    mapping(bytes32 => mapping(bytes32 => bool)) public provenSource;

    // ------------------------------------------------------------------ events / errors
    event AnchorSetRegistered(bytes32 indexed setId, address[] anchors, uint64[] lambdas, uint32 alphaN, uint32 alphaD);
    event NodesAdded(bytes32 indexed setId, uint256 fromIndex, uint256 count);
    event CertificateSubmitted(
        bytes32 indexed setId,
        uint64 indexed certBlock,
        uint256 eEff,
        bytes32 graphRoot,
        bytes32 vectorRoot,
        bytes32 versionHash,
        uint32 nCert,
        uint32 numRows,
        bool registryVerified
    );
    event EdgeProven(
        bytes32 indexed setId, uint256 indexed node, uint256 indexed agentId, int256 wOld, int256 wNew, uint256 eLowEff, uint256 eEff
    );
    event RowVoided(bytes32 indexed setId, uint256 indexed node, uint256 eLowEff, uint256 eEff);
    event TransferFlagged(bytes32 indexed setId, uint256 indexed agentId);
    event RegistryChanged(bytes32 indexed setId, bytes32 certifiedVersionHash, bytes32 currentVersionHash);
    event ApprovalProven(bytes32 indexed setId, uint256 indexed agentId, uint256 anchor);
    event EdgeFact(bytes32 indexed setId, address indexed client, uint256 indexed agentId, int256 w);
    event SourceFactCleared(bytes32 indexed setId, uint256 indexed node);

    error BadParams(uint256 code);
    error AlreadyRegistered();
    error UnknownSet();
    error NodeExists(bytes32 key);
    error BadNodes();
    error BadNCert();
    error BadVectors();
    error BadRows(uint256 code);
    error BadEdge(uint256 row);
    error NotSubSolution(uint256 column, uint256 node); // t > y: D26
    error EdgeMismatch(uint256 row, uint256 edge); // Registry-verified: committed != registry (D32)
    error ValueTooLarge();
    error RegistryUnreadable();
    error ResidualTooLarge(uint256 eEff, uint256 eMax);
    error NotBetter(uint256 qNew, uint256 qCur, uint256 massNew, uint256 massCur);
    error NoCert();
    error BadProof(uint256 code);
    error NothingToProve();
    error NotSubmitter();
    error AnchorAsSource(uint256 node); // AM-08.14: an agent row's source is an anchor of the set (D48-A)
    error ProvenRowResubmitted(uint256 node); // AM-08.16: a row already proven false in this set (D48-C)
    error NotCanonical(uint256 row); // two encodings of one row would have two hashes (D48-C, R4)

    constructor(IIdentityRegistry8004 identity_, IReputationRegistry8004 reputation_) {
        identity = identity_;
        reputation = reputation_;
    }

    // ================================================================== anchor sets
    function computeSetId(SetParams calldata p) public pure returns (bytes32) {
        return keccak256(abi.encode(p.anchors, p.lambdas, p.alphaN, p.alphaD, p.tagSchemaHash, p.tags, p.policy));
    }

    /// Immutable anchor set. Anchor nodes get indices 0..k-1 (anchor a is node a).
    function registerAnchorSet(SetParams calldata p) external returns (bytes32 setId) {
        uint256 k = p.anchors.length;
        if (k == 0 || k > K_MAX || p.lambdas.length != k) revert BadParams(1);
        if (p.alphaN == 0 || p.alphaN >= p.alphaD) revert BadParams(2);
        if (p.tags.length == 0 || p.tags.length > TAGS_MAX) revert BadParams(3);
        _checkPolicy(p.policy, k);
        setId = computeSetId(p);
        SetState storage s = _set(setId);
        if (s.registered) revert AlreadyRegistered();

        uint256 sum;
        address prev;
        uint256 kb = _keyBase(setId);
        for (uint256 a; a < k; ++a) {
            address an = p.anchors[a];
            if (an <= prev) revert BadParams(5); // strictly increasing, non-zero
            prev = an;
            uint256 l = p.lambdas[a];
            if (l == 0) revert BadParams(6);
            sum += l;
            s.anchors[a] = uint256(uint160(an)) | (l << 160);
            bytes32 key = _anchorKey(an);
            nodeIndexPlus1[setId][key] = a + 1;
            assembly ("memory-safe") {
                sstore(add(kb, a), key)
            }
        }
        if (sum != WAD) revert BadParams(7);

        bytes32 prevHash;
        for (uint256 i; i < p.tags.length; ++i) {
            TagSpec calldata t = p.tags[i];
            bytes calldata tb = bytes(t.tag);
            if (tb.length == 0) revert BadParams(8); // no upper bound: only the hash is stored (AM-04.2)
            bytes32 h = keccak256(tb);
            if (i > 0 && h <= prevHash) revert BadParams(9);
            prevHash = h;
            if (!(t.min <= t.neutral && t.neutral <= t.max && t.min < t.max)) revert BadParams(10);
            if (t.kind > TAG_MEASUREMENT) revert BadParams(11);
            TagStored storage ts = s.tags[i];
            ts.hash = h;
            ts.min = t.min;
            ts.neutral = t.neutral;
            ts.max = t.max;
            ts.kind = t.kind;
            if (t.kind == TAG_ENDORSEMENT) s.endoMask |= uint16(1 << i);
        }

        s.registered = true;
        s.k = uint8(k);
        _storePolicy(s, p.policy);
        s.numTags = uint8(p.tags.length);
        s.alphaN = p.alphaN;
        s.alphaD = p.alphaD;
        s.nodeCount = uint32(k);
        s.tagSchemaHash = p.tagSchemaHash;
        emit AnchorSetRegistered(setId, p.anchors, p.lambdas, p.alphaN, p.alphaD);
    }

    function _checkPolicy(Policy calldata q, uint256 k) internal pure {
        // theta = 0 would trust unknown agents (D39); rhoN = 0 would trust nobody
        if (q.theta == 0 || q.rhoN == 0 || q.rhoD == 0) revert BadParams(4);
        if (q.minAnchors == 0 || q.minAnchors > k || q.vetoQuorum == 0 || q.vetoQuorum > k) revert BadParams(12);
        if (q.vetoMax > -1 || q.vetoMax < -GRID) revert BadParams(13);
        if (q.maxAge == 0) revert BadParams(14);
        uint256 ns = q.submitters.length;
        if (ns > SUBMITTERS_MAX || (ns == 0 && !q.registryVerified)) revert BadParams(15); // open => verified (D32)
        for (uint256 i = 1; i < ns; ++i) {
            if (q.submitters[i] <= q.submitters[i - 1]) revert BadParams(16);
        }
        if (ns != 0 && q.submitters[0] == address(0)) revert BadParams(16);
    }

    function _storePolicy(SetState storage s, Policy calldata q) internal {
        s.minAnchors = q.minAnchors;
        s.vetoQuorum = q.vetoQuorum;
        s.strictTransfer = q.strictTransfer;
        s.registryVerified = q.registryVerified;
        s.ownerFallback = q.ownerFallback;
        s.maxAge = q.maxAge;
        s.minRefresh = q.minRefresh;
        s.slackRefresh = q.slackRefresh;
        s.theta = q.theta;
        s.rhoN = q.rhoN;
        s.rhoD = q.rhoD;
        s.vetoMax = q.vetoMax;
        s.eLowMax = q.eLowMax;
        s.numSubmitters = uint8(q.submitters.length);
        for (uint256 i; i < q.submitters.length; ++i) {
            s.submitters[i] = q.submitters[i];
        }
    }

    /// Committed policy of a set (D39), for payers and screens.
    function policyOf(bytes32 setId) external view returns (Policy memory q) {
        SetState storage s = _set(setId);
        q.theta = s.theta;
        q.rhoN = s.rhoN;
        q.rhoD = s.rhoD;
        q.minAnchors = s.minAnchors;
        q.vetoQuorum = s.vetoQuorum;
        q.vetoMax = s.vetoMax;
        q.maxAge = s.maxAge;
        q.minRefresh = s.minRefresh;
        q.slackRefresh = s.slackRefresh;
        q.eLowMax = s.eLowMax;
        q.strictTransfer = s.strictTransfer;
        q.registryVerified = s.registryVerified;
        q.ownerFallback = s.ownerFallback;
        q.submitters = new address[](s.numSubmitters);
        for (uint256 i; i < q.submitters.length; ++i) {
            q.submitters[i] = s.submitters[i];
        }
    }

    function _isSubmitter(SetState storage s, address who) internal view returns (bool) {
        uint256 ns = s.numSubmitters;
        for (uint256 i; i < ns; ++i) {
            if (s.submitters[i] == who) return true;
        }
        return false;
    }

    /// Submitter-attested sets: only listed submitters touch the table (closes AM-R5.7 at this level).
    function _gate(SetState storage s) internal view {
        if (!s.registered) revert UnknownSet();
        if (s.numSubmitters != 0 && !_isSubmitter(s, msg.sender)) revert NotSubmitter();
    }

    // ================================================================== node table
    /// Append. Entry = kind u8 (1 agent | 2 address) + u32 agentId | 20-byte address.
    /// Open sets: permissionless (AM-R5.7 stays open there, D23 staging zone not implemented).
    function addNodes(bytes32 setId, bytes calldata entries) external {
        SetState storage s = _set(setId);
        _gate(s);
        _appendNodes(s, setId, entries);
    }

    /// Pre-writes the SENTINEL in vector slots so that a later certificate pays x->y (100 gas/slot)
    /// instead of 0->x (17 100). Lets a large first certificate be split across transactions.
    function reserveCapacity(bytes32 setId, uint32 uptoNodes) external {
        SetState storage s = _set(setId);
        _gate(s);
        uint256 stride = uint256(s.k) + 3;
        uint256 from = s.reservedChunks;
        uint256 to = (uint256(uptoNodes) + 3) / 4;
        if (to <= from) return;
        uint256 base = _vecBase(setId);
        uint256 sent = SENTINEL;
        assembly ("memory-safe") {
            for { let sl := add(base, mul(from, stride)) let e := add(base, mul(to, stride)) } lt(sl, e) { sl := add(sl, 1) } {
                sstore(sl, sent)
            }
        }
        s.reservedChunks = uint32(to);
    }

    function nodeCount(bytes32 setId) external view returns (uint256) {
        return _set(setId).nodeCount;
    }

    /// key of node i (0 if i >= nodeCount)
    function nodeKeyAt(bytes32 setId, uint256 i) external view returns (bytes32 key) {
        uint256 kb = _keyBase(setId);
        assembly ("memory-safe") {
            key := sload(add(kb, i))
        }
    }

    function agentKey(uint256 agentId) public pure returns (bytes32) {
        return bytes32((KIND_AGENT << 248) | agentId);
    }

    function addressKey(address a) public pure returns (bytes32) {
        return bytes32((KIND_ADDRESS << 248) | uint256(uint160(a)));
    }

    function _anchorKey(address a) internal pure returns (bytes32) {
        return bytes32((KIND_ANCHOR << 248) | uint256(uint160(a)));
    }

    function _appendNodes(SetState storage s, bytes32 setId, bytes calldata entries) internal {
        uint256 n = s.nodeCount;
        uint256 from = n;
        uint256 off;
        uint256 len = entries.length;
        uint256 kb = _keyBase(setId);
        mapping(bytes32 => uint256) storage m = nodeIndexPlus1[setId];
        while (off < len) {
            uint256 kind = uint8(entries[off]);
            bytes32 key;
            if (kind == KIND_AGENT) {
                if (off + 5 > len) revert BadNodes();
                key = agentKey(uint32(bytes4(entries[off + 1:off + 5])));
                off += 5;
            } else if (kind == KIND_ADDRESS) {
                if (off + 21 > len) revert BadNodes();
                address a = address(bytes20(entries[off + 1:off + 21]));
                if (a == address(0)) revert BadNodes(); // R1: no client 0 (it marks a source-less row)
                key = addressKey(a);
                off += 21;
            } else {
                revert BadNodes();
            }
            if (m[key] != 0) revert NodeExists(key);
            assembly ("memory-safe") {
                sstore(add(kb, n), key)
            }
            m[key] = ++n;
        }
        if (n > type(uint32).max) revert BadNodes();
        s.nodeCount = uint32(n);
        if (n > from) emit NodesAdded(setId, from, n - from);
    }

    // ================================================================== certificate
    /// @param nCert   nodes [0, nCert) are certified; nCert is non-decreasing across certificates
    /// @param eMax    the submitter's claimed bound: reverts if the computed eEff exceeds it
    /// @param newNodes optional node entries appended before verification (same format as addNodes)
    /// @param vectors nCert records of (k x u64 t^(a)_i, u64 ownerFp_i), big-endian, WAD
    /// @param rows    [u8 W][u32 numRows] then rows, see ENCODING.md
    function submitCertificate(
        bytes32 setId,
        uint32 nCert,
        uint256 eMax,
        bytes calldata newNodes,
        bytes calldata vectors,
        bytes calldata rows
    ) external {
        SetState storage s = _set(setId);
        _gate(s);
        // G-11 / AM-03.3: on an open set the rows must be readable from the transaction itself (Monad has no
        // traces): a certificate sent through a contract could not be audited, nor its rows proven
        if (s.numSubmitters == 0 && msg.sender != tx.origin) revert NotSubmitter();
        if (newNodes.length != 0) {
            // A1d (review 06/10): on an open set anyone may append nodes; inline nodes would get the indices of the
            // table AT EXECUTION, which an interleaved addNodes shifts. The certifier adds them in its own
            // transaction, reads the table, then submits.
            if (s.numSubmitters == 0) revert BadNodes();
            _appendNodes(s, setId, newNodes);
        }
        uint256 k = s.k;
        uint256 n = nCert;
        if (n < s.nCert || n > s.nodeCount || n < k) revert BadNCert();
        if (vectors.length != n * (k + 1) * 8) revert BadVectors();

        (bool vok, bytes32 vh) = _versionHash();
        if (!vok) revert RegistryUnreadable();

        Pass memory P = _verifyPass(s, n, vectors, rows);
        _verifyRows(s, setId, n, vectors, rows, P.W, s.registryVerified);

        uint256 eNew = _aggregate(s, P.eUp, k);
        if (eNew > eMax) revert ResidualTooLarge(eNew, eMax);
        _replacementRule(s, eNew, P);

        _storeVectors(s, setId, n, k, vectors, P.d, P.veto);

        ColState storage cs = _cols(setId);
        for (uint256 a; a < k; ++a) {
            cs.eUp[a] = P.eUp[a];
            cs.eLow[a] = 0;
        }
        s.eEff = eNew;
        s.eLowEff = 0;
        s.graphRoot = P.root;
        s.vectorRoot = keccak256(vectors);
        s.versionHash = vh;
        s.certBlock = uint64(block.number);
        s.certNonce += 1;
        s.nCert = uint32(n);
        s.numRows = uint32(P.numRows);
        s.idxWidth = uint8(P.W);
        s.registryChanged = false;
        emit CertificateSubmitted(
            setId, uint64(block.number), eNew, P.root, s.vectorRoot, vh, uint32(n), uint32(P.numRows), s.registryVerified
        );
    }

    /// Checks the replacement rule against the incumbent, then records the newcomer's quality.
    function _replacementRule(SetState storage s, uint256 eNew, Pass memory P) internal {
        uint256 qNew = _aggregate(s, P.q, s.k);
        uint256 mNew = _massOf(s, P.mass, s.k);
        uint256 dNew;
        uint256[] memory d = P.d;
        assembly ("memory-safe") {
            // d values are < 2^256 / n (each is a sum of ceil terms bounded by T_u <= 2^64 per row): no overflow
            for { let p := add(d, 32) let e := add(p, shl(5, mload(d))) } lt(p, e) { p := add(p, 32) } {
                dNew := add(dNew, mload(p))
            }
        }

        // Replacement rule (AM-04.1, AM-5.16, AM-02.2). Submitter-attested: the listed submitters always
        // replace (D27: the set owner pays and decides). Open (Registry-verified) sets compare two qualities:
        //   q    = eUp without its rounding floor E+ + 1 (an honest certificate at its integer fixed point
        //          has q = 0 whatever the graph size: comparing eUp itself blocked every honest update of a
        //          growing graph, and rewarded the omission of edges, since fewer edges = smaller E+);
        //   mass = total certified lower-bound mass. Two valid sub-solutions of the same graph satisfy
        //          ||t* - t||_1 = ||t*||_1 - ||t||_1: more mass is more precise on the trust side, and a
        //          certificate that omits (censors) endorsements loses mass. eLowEff of the incumbent (its
        //          proven overstatement) is credited to the newcomer.
        // Accepted iff: absent | registry changed | stale | widening budget exhausted
        //   | (mass_new + eLow_cur >= mass_cur  and  q_new <= q_cur)      (at least as good on both sides)
        //   | (age > minRefresh  and  q_new <= q_cur + slackRefresh)      (refresh window: decreases w/o proof)
        // with q_cur = eEff - eFloor + eLowEff (the incumbent widened by its proofs). A zero vector (AM-5.16)
        // has q ~ 1 WAD: it never replaces a live certificate, and any honest certificate replaces it at once.
        // Distrust side (review 01/10): an omitted negative edge changes neither mass nor q, so the fast path
        // also requires the newcomer's distrust mass sum_v d_v not to drop (a forgiven slash waits for the window).
        // A row proven false cannot come back in any form (provenFalse, D48-C, checked in _verifyRows before this
        // rule, under every state of the set): resubmitting a proven certificate to erase its proofs is refused there.
        if (s.certBlock != 0 && !s.registryChanged && s.numSubmitters == 0) {
            uint256 age = block.number - s.certBlock;
            uint256 qCur = s.eEff - s.eFloor + s.eLowEff;
            bool ok = age > s.maxAge || s.eLowEff > s.eLowMax
                || (mNew + s.eLowEff >= s.mass && qNew <= qCur && dNew >= s.distrustMass)
                || (age > s.minRefresh && qNew <= qCur + s.slackRefresh);
            if (!ok) revert NotBetter(qNew, qCur, mNew, s.mass);
        }
        s.mass = mNew;
        s.eFloor = eNew - qNew;
        s.distrustMass = dNew;
        s.eSubmitted = eNew;
    }

    /// Dry run for certifiers (no state change, no registry read): the per-column upper bounds, eEff and
    /// graphRoot a submission would produce, after every check that needs no registry read. The registry
    /// checks of a Registry-verified set are exercised by an eth_call of submitCertificate itself
    /// (EdgeMismatch names the failing row and edge).
    function dryRun(bytes32 setId, uint32 nCert, bytes calldata vectors, bytes calldata rows)
        external
        view
        returns (uint256[] memory eUp, uint256 eEff, bytes32 graphRoot)
    {
        SetState storage s = _set(setId);
        if (!s.registered) revert UnknownSet();
        uint256 k = s.k;
        if (nCert < s.nCert || nCert > s.nodeCount || nCert < k) revert BadNCert();
        if (vectors.length != uint256(nCert) * (k + 1) * 8) revert BadVectors();
        Pass memory P = _verifyPass(s, nCert, vectors, rows);
        // R5: every check of a submission that needs no registry read (shape, canonical form, anchors as
        // sources, proven rows, fingerprints < 2^63)
        _verifyRows(s, setId, nCert, vectors, rows, P.W, false);
        for (uint256 i; i < nCert; ++i) {
            if (uint64(bytes8(vectors[i * (k + 1) * 8 + k * 8:i * (k + 1) * 8 + k * 8 + 8])) > LANE_MASK) {
                revert ValueTooLarge();
            }
        }
        return (P.eUp, _aggregate(s, P.eUp, k), P.root);
    }

    struct Pass {
        uint256[] eUp; // per column, WAD
        uint256[] q; // per column: eUp without the rounding floor E+ + 1 (replacement rule)
        uint256[] mass; // per column: sum_v t_v^(a)
        uint256[] d; // distrust per node
        uint256[] veto; // certified veto mask per node
        bytes32 root;
        uint256 numRows;
        uint256 W;
    }

    /// One pass over the rows (D26): y = F(t) rounded down, t <= y required for every node and column;
    /// eUp[a] = ceil(r[a] / alpha) with r[a] = sum (y - t) + E+ + 1 + truncation and declared-budget margins.
    function _verifyPass(SetState storage s, uint256 n, bytes calldata vectors, bytes calldata rows)
        internal
        view
        returns (Pass memory P)
    {
        uint256 k = s.k;
        uint256 aD = s.alphaD;
        uint256 om = aD - s.alphaN; // (1 - alpha) * alphaD
        uint256 rec = (k + 1) * 8;
        uint256 vecOff;
        assembly ("memory-safe") {
            vecOff := vectors.offset
        }
        uint256[] memory lam = new uint256[](k);
        for (uint256 a; a < k; ++a) {
            lam[a] = s.anchors[a] >> 160;
        }

        if (rows.length < 5) revert BadRows(0);
        P.W = uint8(rows[0]);
        if (!(P.W == 2 || P.W == 4) || (P.W == 2 && n > 0xffff)) revert BadRows(1);
        P.numRows = uint32(bytes4(rows[1:5]));
        if (P.numRows > n) revert BadRows(2);

        uint256[] memory y = new uint256[](n * k); // y[a*n + j]
        P.d = new uint256[](n);
        P.veto = new uint256[](n);
        bytes memory hasRow = new bytes(n);
        uint256[] memory num = new uint256[](k);
        uint256[] memory marg = new uint256[](k);
        bytes32[] memory leaves = new bytes32[](P.numRows);
        uint256[] memory info = new uint256[](n);
        bytes memory scratch = new bytes(4 + 2 + 20 + 4 + ROW_MAX * 10);

        uint256 ePos = _rowLoop(
            RowCtx({
                n: n,
                k: k,
                W: P.W,
                aD: aD,
                om: om,
                rec: rec,
                vecOff: vecOff,
                vetoMax: uint256(int256(s.vetoMax)),
                numRows: P.numRows,
                ptrY: _dataPtr(y),
                ptrD: _dataPtr(P.d),
                ptrH: _bytesPtr(hasRow),
                ptrNum: _dataPtr(num),
                ptrLam: _dataPtr(lam),
                ptrLeaves: _dataPtr32(leaves),
                ptrScratch: _bytesPtr(scratch),
                ptrMarg: _dataPtr(marg),
                ptrVeto: _dataPtr(P.veto),
                ptrInfo: _dataPtr(info)
            }),
            rows
        );

        // sub-solution check and upper bound, per column
        P.eUp = new uint256[](k);
        P.q = new uint256[](k);
        P.mass = new uint256[](k);
        uint256 aN = s.alphaN;
        uint256 alphaW = (aN * WAD) / aD;
        for (uint256 a; a < k; ++a) {
            y[a * n + a] += alphaW;
            uint256 sum = ePos + 1 + marg[a]; // floor slack: < 1 per positive edge, < 1 for the alpha term
            uint256 badNode;
            bool tooBig;
            uint256 msum;
            assembly ("memory-safe") {
                let yp := add(add(y, 32), mul(mul(a, n), 32))
                let hp0 := add(hasRow, 32)
                let hp := hp0
                let he := add(hp, n)
                let cp := add(vecOff, mul(a, 8))
                let orAll := 0
                for {} lt(hp, he) {
                    hp := add(hp, 1)
                    yp := add(yp, 32)
                    cp := add(cp, rec)
                } {
                    let t := shr(192, calldataload(cp))
                    let yv := mload(yp)
                    if gt(t, yv) {
                        badNode := add(sub(hp, hp0), 1)
                        break
                    }
                    sum := add(sum, sub(yv, t))
                    msum := add(msum, t)
                    orAll := or(orAll, t)
                    // truncated node (no row): margin (1 - alpha) t_u, rounded up
                    if t {
                        if iszero(byte(0, mload(hp))) {
                            let q := mul(t, om)
                            sum := add(sum, add(div(q, aD), gt(mod(q, aD), 0)))
                        }
                    }
                }
                tooBig := gt(orAll, LANE_MASK)
            }
            if (badNode != 0) revert NotSubSolution(a, badNode - 1);
            if (tooBig) revert ValueTooLarge();
            P.eUp[a] = (sum * aD + aN - 1) / aN; // eUp = ceil(r / alpha)
            P.q[a] = ((sum - ePos - 1) * aD + aN - 1) / aN; // same, without the rounding floor
            P.mass[a] = msum;
        }

        P.root = _merkleRoot(leaves, P.numRows);
    }

    struct RowCtx {
        uint256 n; // 0x00
        uint256 k; // 0x20
        uint256 W; // 0x40
        uint256 aD; // 0x60
        uint256 om; // 0x80
        uint256 rec; // 0xa0
        uint256 vecOff; // 0xc0
        uint256 vetoMax; // 0xe0 (int16 as two's complement)
        uint256 numRows; // 0x100
        uint256 ptrY; // 0x120
        uint256 ptrD; // 0x140
        uint256 ptrH; // 0x160
        uint256 ptrNum; // 0x180
        uint256 ptrLam; // 0x1a0
        uint256 ptrLeaves; // 0x1c0
        uint256 ptrScratch; // 0x1e0
        uint256 ptrMarg; // 0x200
        uint256 ptrVeto; // 0x220
        uint256 ptrInfo; // 0x240
    }

    /// The hot loop. Per row: (A) header (wallet, declared B+, alias), validation + budgets B+ / B-,
    /// (B) per-column factors, (C) scatter y[a][dst] += floor(t_u (1-a) w / B+) and
    /// d[dst] += ceil(T_u (1-a) |w| / B-), declared-budget margin, certified veto bits of anchor rows,
    /// (D) leaf hash. Edge = [dst: W bytes][w: int16][feedbackIndex: u32]. Returns E+ (positive edges,
    /// alias copies included). Small Yul functions specialised for W = 2 / 4 and k = 1 (AM-R5.4).
    function _rowLoop(RowCtx memory c, bytes calldata rows) internal pure returns (uint256 ePos) {
        assembly ("memory-safe") {
            function failRows(code) {
                mstore(0, shl(224, 0x9f1b671d)) // BadRows(uint256)
                mstore(4, code)
                revert(0, 36)
            }
            function failEdge(row) {
                mstore(0, shl(224, 0xa6a549a4)) // BadEdge(uint256)
                mstore(4, row)
                revert(0, 36)
            }
            function failCanon(row) {
                mstore(0, shl(224, 0x3a128c73)) // NotCanonical(uint256)
                mstore(4, row)
                revert(0, 36)
            }
            // ---- W = 2: dst = 16-bit index, edge = 8 bytes
            function validate2(eo, e, n, u) -> sP, sN, bad, cnt {
                let pp := 0
                for { let p := eo } lt(p, e) { p := add(p, 8) } {
                    let wd := calldataload(p)
                    let dst := shr(240, wd)
                    let w := signextend(1, and(shr(224, wd), 0xffff))
                    // dst < n, dst != u, dst strictly increasing, w != 0, |w| <= GRID
                    bad := or(bad, or(or(iszero(lt(dst, n)), eq(dst, u)),
                        or(or(iszero(w), gt(add(w, 10000), 20000)), iszero(gt(add(dst, 1), pp)))))
                    pp := add(dst, 1)
                    switch sgt(w, 0)
                    case 1 {
                        sP := add(sP, w)
                        cnt := add(cnt, 1)
                    }
                    default { sN := sub(sN, w) }
                }
            }
            function scatterPos1_2(eo, e, cell0, nm, denP) {
                for { let p := eo } lt(p, e) { p := add(p, 8) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(224, wd), 0xffff))
                    if sgt(w, 0) {
                        let cell := add(cell0, shl(5, shr(240, wd)))
                        mstore(cell, add(mload(cell), div(mul(nm, w), denP)))
                    }
                }
            }
            function scatterPosK_2(eo, e, cell0, ptrNum, numEnd, denP, colBytes) {
                for { let p := eo } lt(p, e) { p := add(p, 8) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(224, wd), 0xffff))
                    if sgt(w, 0) {
                        let cell := add(cell0, shl(5, shr(240, wd)))
                        for { let q := ptrNum } lt(q, numEnd) { q := add(q, 32) } {
                            let nm := mload(q)
                            if nm { mstore(cell, add(mload(cell), div(mul(nm, w), denP))) }
                            cell := add(cell, colBytes)
                        }
                    }
                }
            }
            function scatterNeg2(eo, e, ptrD, numC, denN) {
                for { let p := eo } lt(p, e) { p := add(p, 8) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(224, wd), 0xffff))
                    if slt(w, 0) {
                        let q := mul(numC, sub(0, w))
                        let cd := add(ptrD, shl(5, shr(240, wd)))
                        mstore(cd, add(mload(cd), add(div(q, denN), gt(mod(q, denN), 0))))
                    }
                }
            }
            function vetoMark2(eo, e, ptrV, vmax, bit) {
                for { let p := eo } lt(p, e) { p := add(p, 8) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(224, wd), 0xffff))
                    if iszero(sgt(w, vmax)) {
                        let cv := add(ptrV, shl(5, shr(240, wd)))
                        mstore(cv, or(mload(cv), bit))
                    }
                }
            }

            // ---- W = 4: dst = 32-bit index, edge = 10 bytes
            function validate4(eo, e, n, u) -> sP, sN, bad, cnt {
                let pp := 0
                for { let p := eo } lt(p, e) { p := add(p, 10) } {
                    let wd := calldataload(p)
                    let dst := shr(224, wd)
                    let w := signextend(1, and(shr(208, wd), 0xffff))
                    bad := or(bad, or(or(iszero(lt(dst, n)), eq(dst, u)),
                        or(or(iszero(w), gt(add(w, 10000), 20000)), iszero(gt(add(dst, 1), pp)))))
                    pp := add(dst, 1)
                    switch sgt(w, 0)
                    case 1 {
                        sP := add(sP, w)
                        cnt := add(cnt, 1)
                    }
                    default { sN := sub(sN, w) }
                }
            }
            function scatterPos1_4(eo, e, cell0, nm, denP) {
                for { let p := eo } lt(p, e) { p := add(p, 10) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(208, wd), 0xffff))
                    if sgt(w, 0) {
                        let cell := add(cell0, shl(5, shr(224, wd)))
                        mstore(cell, add(mload(cell), div(mul(nm, w), denP)))
                    }
                }
            }
            function scatterPosK_4(eo, e, cell0, ptrNum, numEnd, denP, colBytes) {
                for { let p := eo } lt(p, e) { p := add(p, 10) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(208, wd), 0xffff))
                    if sgt(w, 0) {
                        let cell := add(cell0, shl(5, shr(224, wd)))
                        for { let q := ptrNum } lt(q, numEnd) { q := add(q, 32) } {
                            let nm := mload(q)
                            if nm { mstore(cell, add(mload(cell), div(mul(nm, w), denP))) }
                            cell := add(cell, colBytes)
                        }
                    }
                }
            }
            function scatterNeg4(eo, e, ptrD, numC, denN) {
                for { let p := eo } lt(p, e) { p := add(p, 10) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(208, wd), 0xffff))
                    if slt(w, 0) {
                        let q := mul(numC, sub(0, w))
                        let cd := add(ptrD, shl(5, shr(224, wd)))
                        mstore(cd, add(mload(cd), add(div(q, denN), gt(mod(q, denN), 0))))
                    }
                }
            }
            function vetoMark4(eo, e, ptrV, vmax, bit) {
                for { let p := eo } lt(p, e) { p := add(p, 10) } {
                    let wd := calldataload(p)
                    let w := signextend(1, and(shr(208, wd), 0xffff))
                    if iszero(sgt(w, vmax)) {
                        let cv := add(ptrV, shl(5, shr(224, wd)))
                        mstore(cv, or(mload(cv), bit))
                    }
                }
            }

            // per-row factors: num[a] = t_u^(a) om ; returns any = OR of t, numC = ceil(sum lambda t / WAD) om
            function factors(rp, k, om, ptrNum, lp) -> any, numC {
                let tsum := 0
                for { let a := 0 } lt(a, k) { a := add(a, 1) } {
                    let t := shr(192, calldataload(add(rp, shl(3, a))))
                    mstore(add(ptrNum, shl(5, a)), mul(t, om))
                    tsum := add(tsum, mul(mload(add(lp, shl(5, a))), t))
                    any := or(any, t)
                }
                numC := mul(add(div(tsum, 1000000000000000000), gt(mod(tsum, 1000000000000000000), 0)), om)
            }
            // declared budget: positive mass (B - S+) / B of the row may be omitted -> margin in every column
            function margins(k, ptrNum, ptrMarg, gap, denB) {
                for { let a := 0 } lt(a, k) { a := add(a, 1) } {
                    let nm := mload(add(ptrNum, shl(5, a)))
                    if nm {
                        let q := mul(nm, gap)
                        let cm := add(ptrMarg, shl(5, a))
                        mstore(cm, add(mload(cm), add(div(q, denB), gt(mod(q, denB), 0))))
                    }
                }
            }
            function processRow(c_, ri, eo, e, u, sDecl) -> cnt {
                let W := mload(add(c_, 0x40))
                let n := mload(c_)
                let sP, sN, bad
                switch W
                case 2 { sP, sN, bad, cnt := validate2(eo, e, n, u) }
                default { sP, sN, bad, cnt := validate4(eo, e, n, u) }
                if bad { failEdge(ri) }
                let hasNeg := gt(sN, 0)
                // B+ = max(GRID, sPlus): sPlus = declared true positive sum (>= committed one), else committed
                let bP := sP
                if sDecl {
                    if lt(sDecl, sP) { failRows(7) }
                    if eq(sDecl, sP) { failCanon(ri) } // canonical: SPLUS only when sPlus > S+ (D48-C)
                    bP := sDecl
                }
                if lt(bP, 10000) { bP := 10000 }
                if lt(sN, 10000) { sN := 10000 }
                let k := mload(add(c_, 0x20))
                let ptrNum := mload(add(c_, 0x180))
                let any, numC := factors(
                    add(mload(add(c_, 0xc0)), mul(u, mload(add(c_, 0xa0)))), k, mload(add(c_, 0x80)), ptrNum,
                    mload(add(c_, 0x1a0))
                )
                let aD := mload(add(c_, 0x60))
                if any {
                    let denP := mul(aD, bP)
                    let cell0 := mload(add(c_, 0x120))
                    switch k
                    case 1 {
                        switch W
                        case 2 { scatterPos1_2(eo, e, cell0, mload(ptrNum), denP) }
                        default { scatterPos1_4(eo, e, cell0, mload(ptrNum), denP) }
                    }
                    default {
                        switch W
                        case 2 { scatterPosK_2(eo, e, cell0, ptrNum, add(ptrNum, shl(5, k)), denP, shl(5, n)) }
                        default { scatterPosK_4(eo, e, cell0, ptrNum, add(ptrNum, shl(5, k)), denP, shl(5, n)) }
                    }
                    if and(hasNeg, gt(numC, 0)) {
                        switch W
                        case 2 { scatterNeg2(eo, e, mload(add(c_, 0x140)), numC, mul(aD, sN)) }
                        default { scatterNeg4(eo, e, mload(add(c_, 0x140)), numC, mul(aD, sN)) }
                    }
                    // declared omission: (sPlus - S+) / B+ of the row's positive mass is not committed
                    if gt(sDecl, sP) { margins(k, ptrNum, mload(add(c_, 0x200)), sub(sDecl, sP), denP) }
                }
                // certified veto bit (D21/D33 complement): anchor rows, combined weight <= vetoMax
                if and(hasNeg, lt(u, k)) {
                    switch W
                    case 2 { vetoMark2(eo, e, mload(add(c_, 0x220)), mload(add(c_, 0xe0)), shl(u, 1)) }
                    default { vetoMark4(eo, e, mload(add(c_, 0x220)), mload(add(c_, 0xe0)), shl(u, 1)) }
                }
            }
            // header of the row at `off`: returns the edge range [eo, e), the declared sPlus (0 = none) and
            // the offset after the row. Alias rows (D20) take the edges and sPlus of an earlier source row.
            function header(c_, ri, off, prevU) -> u, eo, e, sDecl, next {
                let W := mload(add(c_, 0x40))
                let shU := sub(256, shl(3, W))
                let wd := calldataload(off)
                u := shr(shU, wd)
                let hdr := and(shr(sub(shU, 16), wd), 0xffff)
                if or(iszero(lt(u, mload(c_))), and(gt(ri, 0), iszero(gt(u, prevU)))) { failRows(3) }
                let nE := and(hdr, 0x0fff)
                if gt(nE, 256) { failRows(4) }
                next := add(off, add(W, 2))
                let wal := 0
                let hasW := iszero(iszero(and(hdr, 0x8000)))
                if hasW {
                    wal := shr(96, calldataload(next))
                    next := add(next, 20)
                }
                if and(hdr, 0x4000) {
                    sDecl := shr(224, calldataload(next)) // declared sPlus
                    next := add(next, 4)
                    if iszero(sDecl) { failRows(7) }
                }
                let infoP := mload(add(c_, 0x240))
                switch and(hdr, 0x2000)
                case 0 {
                    eo := next
                    next := add(next, mul(nE, add(W, 6)))
                    e := next
                    // eo (32) | nE (16) | sDecl (32) | hasWallet (1, bit 80) | wallet (160, bits 96..255)
                    mstore(add(infoP, shl(5, u)),
                        or(or(eo, shl(32, nE)), or(shl(48, sDecl), or(shl(80, hasW), shl(96, wal)))))
                }
                default {
                    // alias: no own edge, no own budget; same client (wallet) as the source row
                    if or(nE, sDecl) { failRows(8) }
                    let src := shr(shU, calldataload(next))
                    next := add(next, W)
                    if or(iszero(lt(src, u)), lt(u, mload(add(c_, 0x20)))) { failRows(9) }
                    let inf := mload(add(infoP, shl(5, src)))
                    if iszero(inf) { failRows(9) } // the source is an earlier, non-alias row
                    if or(iszero(hasW), or(iszero(and(shr(80, inf), 1)), iszero(eq(shr(96, inf), wal)))) {
                        failRows(10)
                    }
                    eo := and(inf, 0xffffffff)
                    e := add(eo, mul(and(shr(32, inf), 0xffff), add(W, 6)))
                    sDecl := and(shr(48, inf), 0xffffffff)
                }
            }

            let off := add(rows.offset, 5)
            let end := add(rows.offset, rows.length)
            let numRows := mload(add(c, 0x100))
            let prevU := 0
            for { let ri := 0 } lt(ri, numRows) { ri := add(ri, 1) } {
                let rowStart := off
                let u, eo, e, sDecl, next := header(c, ri, off, prevU)
                if gt(next, end) { failRows(5) }
                prevU := u
                off := next
                mstore8(add(mload(add(c, 0x160)), u), 1)
                ePos := add(ePos, processRow(c, ri, eo, e, u, sDecl))
                // (D) leaf = keccak256(row bytes)
                let len := sub(off, rowStart)
                let sp := mload(add(c, 0x1e0))
                calldatacopy(sp, rowStart, len)
                mstore(add(mload(add(c, 0x1c0)), shl(5, ri)), keccak256(sp, len))
            }
            if iszero(eq(off, end)) { failRows(6) }
        }
    }

    function _dataPtr(uint256[] memory a) internal pure returns (uint256 p) {
        assembly ("memory-safe") {
            p := add(a, 32)
        }
    }

    function _dataPtr32(bytes32[] memory a) internal pure returns (uint256 p) {
        assembly ("memory-safe") {
            p := add(a, 32)
        }
    }

    function _bytesPtr(bytes memory a) internal pure returns (uint256 p) {
        assembly ("memory-safe") {
            p := add(a, 32)
        }
    }

    function _merkleRoot(bytes32[] memory leaves, uint256 cnt) internal pure returns (bytes32 root) {
        if (cnt == 0) return bytes32(0);
        assembly ("memory-safe") {
            let p := add(leaves, 32)
            for {} gt(cnt, 1) {} {
                let half := shr(1, cnt)
                for { let i := 0 } lt(i, half) { i := add(i, 1) } {
                    mstore(0, mload(add(p, mul(shl(1, i), 32))))
                    mstore(32, mload(add(p, add(mul(shl(1, i), 32), 32))))
                    mstore(add(p, mul(i, 32)), keccak256(0, 64))
                }
                if and(cnt, 1) { mstore(add(p, mul(half, 32)), mload(add(p, mul(sub(cnt, 1), 32)))) }
                cnt := add(half, and(cnt, 1))
            }
            root := mload(p)
        }
    }

    // ================================================================== Registry-verified (D32)
    /// Second pass over the rows, at both levels: shape, canonical form, sources and proven rows. It parses the
    /// rows on its own and must end exactly where `_rowLoop` ended (R1: a row skipped without its edges once let
    /// every later row escape the registry re-read).
    ///   - shape (both levels, so that every committed row and edge stays provable): every target is an agent
    ///     node; an anchor or address row carries neither SRC nor VIA_OWNER; an agent row is SRC (wallet), SRC +
    ///     VIA_OWNER (ownerFallback sets), or source-less and empty (sets without ownerFallback);
    ///   - canonical form (D48-C, R4): the SRC bit carries a non-zero address, an alias refers to an agent row,
    ///     SPLUS only when sPlus > S+ (`_rowLoop`); the row hash is computed on decoded values, so W and the
    ///     feedbackIndex (unchecked at the attested level) cannot be used to re-encode a row;
    ///   - AnchorAsSource (D48-A): the source of an agent row is never an anchor of the set: its row would be the
    ///     anchor's row spread with the agent's mass in the OTHER columns, which voids the leave-one-out;
    ///   - ProvenRowResubmitted (D48-C): a row proven false in this set never comes back, whatever the state of the
    ///     set (REGISTRY_CHANGED included) and the level;
    ///   - `reads` (Registry-verified): the source of every agent row and every edge are re-read. Edge rule
    ///     (D48-B): a current controller of the target (isAuthorizedOrOwner, agentWallet) gives no POSITIVE edge;
    ///     its negative edge is kept. (w, feedbackIndex) = the D14 combination recomputed from the registry.
    /// Not checkable (no per-client index): that a row is complete, and that a declared B+ is the true sum.
    function _verifyRows(
        SetState storage s,
        bytes32 setId,
        uint256 n,
        bytes calldata vectors,
        bytes calldata rows,
        uint256 W,
        bool reads
    ) internal view {
        uint256 kb = _keyBase(setId);
        uint256 k = s.k;
        address[] memory anc = new address[](k);
        for (uint256 a; a < k; ++a) {
            anc[a] = address(uint160(s.anchors[a]));
        }
        // D48-C lookups only once a fact was proven in this set (an honest set never pays them)
        bool check = s.facts != 0;
        uint256[] memory span = new uint256[](check ? n : 0); // edge offset | nE << 128 of each non-alias row
        uint256 numRows = uint32(bytes4(rows[1:5]));
        uint256 off = 5;
        for (uint256 ri; ri < numRows; ++ri) {
            uint256 u = _be(rows, off, W);
            uint256 hdr = _be(rows, off + W, 2);
            off += W + 2;
            address src;
            if (hdr & H_SRC != 0) {
                src = address(bytes20(rows[off:off + 20]));
                off += 20;
                if (src == address(0)) revert NotCanonical(ri);
                for (uint256 a; a < k; ++a) {
                    if (anc[a] == src) revert AnchorAsSource(u); // SRC is only allowed on agent rows
                }
            }
            uint256 sDecl;
            if (hdr & H_SPLUS != 0) {
                sDecl = uint32(bytes4(rows[off:off + 4]));
                off += 4;
            }
            address client = _clientOf(s, kb, u, src, hdr, ri, reads);
            uint256 sp; // edges of the row (an alias: its ref's, the shape of the ref is checked by _rowLoop)
            if (hdr & H_ALIAS != 0) {
                uint256 ref = _be(rows, off, W);
                off += W;
                if (check) sp = span[ref];
            } else {
                uint256 nE = hdr & H_NE;
                if (check) {
                    sp = off | (nE << 128);
                    span[u] = sp;
                }
                for (uint256 e; e < nE; ++e) {
                    uint256 dst = _be(rows, off, W);
                    int256 w = int16(uint16(bytes2(rows[off + W:off + W + 2])));
                    uint256 fIdx = uint32(bytes4(rows[off + W + 2:off + W + 6]));
                    off += W + 6;
                    uint256 dk = _keyAtBase(kb, dst);
                    if (dk >> 248 != KIND_AGENT) revert EdgeMismatch(ri, e);
                    if (reads && !_edgeHolds(s, client, dk & ID_MASK, w, fIdx)) revert EdgeMismatch(ri, e);
                }
            }
            if (check) _checkFacts(setId, kb, n, rows, W, u, hdr, src, client, sp, sDecl);
        }
        if (off != rows.length) revert BadRows(6); // the same bytes as the arithmetic pass (R1)
        // R5: anchors carry a zero fingerprint (other nodes: _verifyOwners at Registry-verified)
        uint256 rec = (k + 1) * 8;
        for (uint256 a; a < k; ++a) {
            if (bytes8(vectors[a * rec + k * 8:a * rec + k * 8 + 8]) != 0) revert EdgeMismatch(type(uint256).max, a);
        }
        if (reads) _verifyOwners(s, kb, n, vectors);
    }
    /// Registry-verified re-read of one committed edge (client -> agent j): (w, fIdx) is the D14 combination,
    /// and a current controller of j (isAuthorizedOrOwner: owner, operator, approved; or its agentWallet) gives
    /// no positive edge (D48-B: its negative edge is kept). An agent that does not exist holds no edge.
    function _edgeHolds(SetState storage s, address client, uint256 j, int256 w, uint256 fIdx)
        internal
        view
        returns (bool)
    {
        (bool ok, int256 wt, uint256 idx,) = _pairEdge(s, client, j);
        if (!ok) revert RegistryUnreadable();
        if (wt != w || idx != fIdx) return false;
        (uint256 rA, uint256 auth) = _idCall(abi.encodeCall(IIdentityRegistry8004.isAuthorizedOrOwner, (client, j)));
        if (rA == R_FAIL) revert RegistryUnreadable(); // R6: never read as "not a controller"
        if (rA == R_NONE) return false;
        if (w < 0) return true;
        (uint256 rW, uint256 wal) = _idCall(abi.encodeCall(IIdentityRegistry8004.getAgentWallet, (j)));
        if (rW == R_FAIL) revert RegistryUnreadable();
        return auth == 0 && address(uint160(wal)) != client;
    }

    /// Client of a row (ENCODING.md §3.2, R7 of FORMAT.md). Agent row: SRC = agentWallet(u) (VIA_OWNER clear),
    /// or ownerOf(u) with agentWallet(u) = 0 (VIA_OWNER set, sets with ownerFallback only, D44). An agent row
    /// without SRC means src(u) = none (agentWallet = 0, no fallback): it must be empty and returns client 0;
    /// it stays challengeable by proveWallet once a wallet appears. Anchor and address rows carry no SRC.
    /// `src` is non-zero iff the SRC bit is set (checked by the caller).
    function _clientOf(SetState storage s, uint256 kb, uint256 u, address src, uint256 hdr, uint256 ri, bool reads)
        internal
        view
        returns (address)
    {
        uint256 key = _keyAtBase(kb, u);
        bool via = hdr & H_VIA_OWNER != 0;
        if (key >> 248 != KIND_AGENT) {
            if (src != address(0) || via) revert EdgeMismatch(ri, ROW_MAX);
            address client = address(uint160(key));
            if (u < s.k && client != address(uint160(s.anchors[u]))) revert EdgeMismatch(ri, ROW_MAX); // invariant
            return client;
        }
        uint256 j = key & ID_MASK;
        if (src == address(0)) {
            if (via || s.ownerFallback || hdr & (H_ALIAS | H_SPLUS | H_NE) != 0) revert EdgeMismatch(ri, ROW_MAX);
        } else if (via && !s.ownerFallback) {
            revert EdgeMismatch(ri, ROW_MAX); // VIA_OWNER (D44) only on ownerFallback sets
        }
        if (!reads) return src;
        // capped registry reads (VIEW_CALL_GAS, R6): a failure reverts RegistryUnreadable, a nonexistent agent
        // is a mismatch of this row
        address wantWallet = via ? address(0) : src;
        if (_idAddr(abi.encodeCall(IIdentityRegistry8004.getAgentWallet, (j)), ri) != wantWallet) {
            revert EdgeMismatch(ri, ROW_MAX);
        }
        if (via && _idAddr(abi.encodeCall(IIdentityRegistry8004.ownerOf, (j)), ri) != src) revert EdgeMismatch(ri, ROW_MAX);
        return src;
    }

    /// _idCall for an address getter at submission: R_FAIL reverts, R_NONE is a mismatch of row ri
    function _idAddr(bytes memory data, uint256 ri) internal view returns (address) {
        (uint256 r, uint256 w) = _idCall(data);
        if (r == R_FAIL) revert RegistryUnreadable();
        if (r == R_NONE) revert EdgeMismatch(ri, ROW_MAX);
        return address(uint160(w));
    }

    /// Every agent node with mass carries the fingerprint of its current owner; address nodes carry 0. The
    /// fingerprint of an agent without mass is not read (one ownerOf per node) and has no effect (R7: the
    /// transfer check needs mass).
    function _verifyOwners(SetState storage s, uint256 kb, uint256 n, bytes calldata vectors) internal view {
        uint256 k = s.k;
        uint256 rec = (k + 1) * 8;
        for (uint256 i = k; i < n; ++i) {
            uint256 o = i * rec;
            uint256 fp = uint64(bytes8(vectors[o + k * 8:o + k * 8 + 8]));
            uint256 key = _keyAtBase(kb, i);
            if (key >> 248 != KIND_AGENT) {
                if (fp != 0) revert EdgeMismatch(type(uint256).max, i);
                continue;
            }
            bool mass;
            for (uint256 a; a < k; ++a) {
                if (bytes8(vectors[o + a * 8:o + a * 8 + 8]) != 0) {
                    mass = true;
                    break;
                }
            }
            if (mass && fp != uint160(identity.ownerOf(key & ID_MASK)) & LANE_MASK) {
                revert EdgeMismatch(type(uint256).max, i);
            }
        }
    }

    /// D48-C at submission: the row of node u (client `client`, edges at `sp`) agrees with every proven fact of
    /// the set. Source fact: the claim (u, src, via) was proven false. Edge facts of the client: the row carries
    /// exactly the proven weight to that agent (0 = no edge), except to u's own agent (no self-loop exists), and a
    /// proven positive edge may be left out only under a declared sPlus that covers it.
    function _checkFacts(
        bytes32 setId,
        uint256 kb,
        uint256 n,
        bytes calldata rows,
        uint256 W,
        uint256 u,
        uint256 hdr,
        address src,
        address client,
        uint256 sp,
        uint256 sDecl
    ) internal view {
        uint256 key = _keyAtBase(kb, u);
        if (key >> 248 == KIND_AGENT && provenSource[setId][sourceHash(u, src, hdr)]) revert ProvenRowResubmitted(u);
        if (client == address(0)) return;
        uint32[] storage fa = _factAgents[setId][client];
        uint256 nf = fa.length;
        if (nf == 0) return;
        uint256 self = key >> 248 == KIND_AGENT ? key & ID_MASK : type(uint256).max;
        uint256 eo = sp & type(uint128).max;
        uint256 nE = sp >> 128;
        uint256 sPos; // committed positive sum, then + the proven positive edges left out
        for (uint256 e; e < nE; ++e) {
            int256 w = int16(uint16(bytes2(rows[eo + e * (W + 6) + W:eo + e * (W + 6) + W + 2])));
            if (w > 0) sPos += uint256(w);
        }
        uint256 sCommitted = sPos;
        for (uint256 f; f < nf; ++f) {
            uint256 j = fa[f];
            if (j == self) continue;
            int256 want = int16(uint16(_edgeFact[setId][client][j] >> 1));
            uint256 ip1 = nodeIndexPlus1[setId][agentKey(j)];
            int256 have;
            if (ip1 != 0 && ip1 <= n) {
                for (uint256 e; e < nE; ++e) {
                    uint256 o = eo + e * (W + 6);
                    if (_be(rows, o, W) == ip1 - 1) {
                        have = int16(uint16(bytes2(rows[o + W:o + W + 2])));
                        break;
                    }
                }
            }
            if (have == want) continue;
            // a proven positive edge left out under a declared sPlus: a declared omission, if the declared sum
            // covers ALL the proven positive edges left out (summed, security review of 06/10)
            if (have == 0 && want > 0) {
                sPos += uint256(want);
                continue;
            }
            revert ProvenRowResubmitted(u);
        }
        if (sPos > sCommitted && sDecl < sPos) revert ProvenRowResubmitted(u); // no or too small a declaration
    }

    /// Key of a source claim (D48-C): node u resolves to `src` (0: source-less), through its wallet or its owner.
    function sourceHash(uint256 u, address src, uint256 hdr) public pure returns (bytes32) {
        return keccak256(abi.encode(u, src, hdr & H_VIA_OWNER != 0));
    }

    /// The proven weight of (client -> agentId) in this set, if any (D48-C).
    function edgeFact(bytes32 setId, address client, uint256 agentId) external view returns (bool proven, int256 w) {
        uint256 v = _edgeFact[setId][client][agentId];
        return (v != 0, int16(uint16(v >> 1)));
    }

    /// Liveness of D48-C: re-reads a proven edge NOW (the registry changed again since the proof, e.g. a revocation
    /// resurrected the older feedback) and updates the fact. Permissionless: it only ever stores a registry reading.
    function refreshFact(bytes32 setId, address client, uint256 agentId) external {
        SetState storage s = _set(setId);
        uint256 v = _edgeFact[setId][client][agentId];
        if (v == 0) revert BadProof(28);
        int256 w = _currentEdge(s, client, agentId);
        if (w == int16(uint16(v >> 1))) revert NothingToProve();
        _edgeFact[setId][client][agentId] = 1 | (uint256(uint16(int16(w))) << 1);
        emit EdgeFact(setId, client, agentId, w);
    }

    /// Liveness of D48-C: a source claim proven false that holds again (the wallet came back) is cleared.
    function clearSourceFact(bytes32 setId, uint256 u, address src, bool via) external {
        uint256 hdr = (src != address(0) ? H_SRC : 0) | (via ? H_VIA_OWNER : 0);
        bytes32 h = sourceHash(u, src, hdr);
        if (!provenSource[setId][h]) revert BadProof(28);
        uint256 key = _keyAtBase(_keyBase(setId), u);
        RowView memory v;
        v.wallet = src;
        v.hdr = hdr;
        if (!_sourceHolds(key & ID_MASK, v)) revert NothingToProve();
        provenSource[setId][h] = false;
        emit SourceFactCleared(setId, u);
    }

    /// big-endian unsigned read of `len` (<= 32) bytes of `b` at `off`
    function _be(bytes calldata b, uint256 off, uint256 len) internal pure returns (uint256 v) {
        assembly ("memory-safe") {
            v := shr(sub(256, shl(3, len)), calldataload(add(b.offset, off)))
        }
    }

    /// Chunk c holds nodes 4c..4c+3; slot(c, v) = base + c*(k+3) + v; v < k: t^(v), v = k: d,
    /// v = k+1: ownerFp, v = k+2: flags (certified veto mask; transferred bit set by proveTransfer).
    function _storeVectors(
        SetState storage s,
        bytes32 setId,
        uint256 n,
        uint256 k,
        bytes calldata vectors,
        uint256[] memory d,
        uint256[] memory veto
    ) internal {
        uint256 base = _vecBase(setId);
        uint256 rec = (k + 1) * 8;
        uint256 chunks = (n + 3) / 4;
        uint256 stride = k + 3;
        bool tooBig;
        assembly ("memory-safe") {
            // 4 lanes of column o (byte offset in a record) for the records at p0, p0 + rec, ...
            function pack4(p0, rl, o) -> v {
                let p := add(p0, o)
                let hi := shl(192, 0xffffffffffffffff)
                v := or(or(shr(192, calldataload(p)), shr(128, and(calldataload(add(p, rl)), hi))),
                    or(shr(64, and(calldataload(add(p, mul(2, rl))), hi)), and(calldataload(add(p, mul(3, rl))), hi)))
            }
            function capLane(x) -> y {
                y := x
                if gt(x, 0x7fffffffffffffff) { y := 0x7fffffffffffffff } // LANE_MASK
            }
            let vo := vectors.offset
            let dp := add(d, 32)
            let fl := add(veto, 32)
            let full := shr(2, n) // chunks with 4 certified nodes
            let orAll := 0 // OR of every written lane: bit 63 of a lane set => value >= 2^63
            let sl := base
            let rp := vo // record of node 4c
            for { let c := 0 } lt(c, full) { c := add(c, 1) } {
                // t columns, then ownerFp (column k of the record)
                for { let v := 0 } lt(v, add(k, 1)) { v := add(v, 1) } {
                    let x := pack4(rp, rec, shl(3, v))
                    orAll := or(orAll, x)
                    sstore(add(sl, add(v, eq(v, k))), or(SENTINEL, x))
                }
                // distrust lanes (computed on-chain, capped)
                {
                    let q := add(dp, shl(7, c))
                    sstore(add(sl, k), or(or(SENTINEL, or(capLane(mload(q)), shl(64, capLane(mload(add(q, 32)))))),
                        or(shl(128, capLane(mload(add(q, 64)))), shl(192, capLane(mload(add(q, 96)))))))
                }
                // flags lanes (certified veto masks, < 2^16)
                {
                    let q := add(fl, shl(7, c))
                    sstore(add(sl, add(k, 2)), or(or(SENTINEL, or(mload(q), shl(64, mload(add(q, 32))))),
                        or(shl(128, mload(add(q, 64))), shl(192, mload(add(q, 96))))))
                }
                sl := add(sl, stride)
                rp := add(rp, shl(2, rec))
            }
            // last partial chunk: lanes beyond n stay 0 (never read calldata past `vectors`)
            if lt(full, chunks) {
                for { let v := 0 } lt(v, stride) { v := add(v, 1) } {
                    let val := SENTINEL
                    for { let l := 0 } lt(l, 4) { l := add(l, 1) } {
                        let i := add(shl(2, full), l)
                        if lt(i, n) {
                            let x := 0
                            switch lt(v, k)
                            case 1 { x := shr(192, calldataload(add(vo, add(mul(i, rec), shl(3, v))))) }
                            default {
                                switch sub(v, k)
                                case 0 { x := capLane(mload(add(dp, shl(5, i)))) }
                                case 1 { x := shr(192, calldataload(add(vo, add(mul(i, rec), shl(3, k))))) }
                                default { x := mload(add(fl, shl(5, i))) }
                            }
                            orAll := or(orAll, x)
                            val := or(val, shl(shl(6, l), x))
                        }
                    }
                    sstore(add(sl, v), val)
                }
            }
            // a lane value >= 2^63 would set the bit of the next lane (or the sentinel): refuse it
            tooBig := iszero(iszero(and(orAll, or(or(shl(63, 1), shl(127, 1)), or(shl(191, 1), shl(255, 1))))))
        }
        if (tooBig) revert ValueTooLarge();
        if (chunks > s.reservedChunks) s.reservedChunks = uint32(chunks);
    }

    /// sum_a ceil(lambda_a * e[a] / WAD)
    function _aggregate(SetState storage s, uint256[] memory e, uint256 k) internal view returns (uint256 agg) {
        for (uint256 a; a < k; ++a) {
            uint256 l = s.anchors[a] >> 160;
            agg += (l * e[a] + WAD - 1) / WAD;
        }
    }

    /// sum_a floor(lambda_a * m[a] / WAD) (a lower bound: rounded down)
    function _massOf(SetState storage s, uint256[] memory m, uint256 k) internal view returns (uint256 agg) {
        for (uint256 a; a < k; ++a) {
            agg += ((s.anchors[a] >> 160) * m[a]) / WAD;
        }
    }

    // ================================================================== reading (never reverts)
    function trustOf(uint256 agentId, bytes32 setId)
        external
        view
        returns (Status status, uint256 trustRobust, uint256 distrust, uint256 e, uint64 certBlock)
    {
        Assessment memory x = assess(agentId, setId, true);
        return (x.status, x.trustRobust, x.distrust, x.e, x.certBlock);
    }

    /// D39: the only answer a payer may act on. Applies the policy committed in the setId
    /// (theta, rho, m, q, maxAge, eLowMax, veto, transfer mode); status OK alone is not enough (an unknown
    /// agent is OK with trust 0). Cheap refusal: when the bounds already fail, no registry is read.
    /// Named for what it says (AM-9.5, D48): the agent passes the policy of THESE anchors, not "is trusted".
    function passesAnchorPolicy(uint256 agentId, bytes32 setId) external view returns (bool) {
        return _assess(agentId, setId, true, true).passesPolicy;
    }

    function assess(uint256 agentId, bytes32 setId, bool withVeto) public view returns (Assessment memory x) {
        return _assess(agentId, setId, withVeto, false);
    }

    /// @param lazy stop before any registry read when the policy bounds already fail (passesAnchorPolicy)
    function _assess(uint256 agentId, bytes32 setId, bool withVeto, bool lazy) internal view returns (Assessment memory x) {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) {
            x.status = Status.NO_CERT;
            return x;
        }
        uint256 k = s.k;
        x.e = s.eEff;
        x.eLow = s.eLowEff;
        x.certBlock = s.certBlock;
        uint256 ownerFp;
        uint256 flags;
        bool known;
        bool massive; // some t^(a) > 0 (R7: trust is rounded down per column and may be 0)
        uint256 ownerRead = type(uint256).max; // ownerOf already read by the approval veto (outcome), else max
        uint256 ownerWord;
        if (agentId <= ID_MASK) {
            uint256 ip1 = nodeIndexPlus1[setId][agentKey(agentId)];
            if (ip1 != 0 && ip1 <= s.nCert) {
                known = true;
                uint256 i = ip1 - 1;
                uint256 sb = _vecBase(setId) + (i >> 2) * (k + 3);
                uint256 sh = (i & 3) * 64;
                uint256[] memory c = new uint256[](k);
                for (uint256 a; a < k; ++a) {
                    uint256 t;
                    assembly ("memory-safe") {
                        t := and(shr(sh, sload(add(sb, a))), LANE_MASK)
                    }
                    c[a] = ((s.anchors[a] >> 160) * t) / WAD;
                    x.trust += c[a];
                    if (t != 0) massive = true;
                }
                x.trustRobust = _leaveOut(c, s.minAnchors, x.trust);
                uint256 dv;
                assembly ("memory-safe") {
                    dv := and(shr(sh, sload(add(sb, k))), LANE_MASK)
                    ownerFp := and(shr(sh, sload(add(sb, add(k, 1)))), LANE_MASK)
                    flags := and(shr(sh, sload(add(sb, add(k, 2)))), LANE_MASK)
                }
                x.distrust = dv;
            }
        }
        x.trustLow = x.trustRobust > x.eLow ? x.trustRobust - x.eLow : 0;
        x.distrustUp = x.distrust + x.e;
        bool bounds = x.trustLow >= s.theta && uint256(s.rhoD) * x.distrustUp <= uint256(s.rhoN) * x.trustLow;

        if (s.registryChanged) {
            x.status = Status.REGISTRY_CHANGED;
            return x;
        }
        if (block.number - s.certBlock > s.maxAge || x.eLow > s.eLowMax) {
            x.status = Status.STALE; // D36: widening budget exhausted
            return x;
        }
        if (lazy && !bounds) return x; // status OK, trusted false: no registry read wasted on a refusal
        if (withVeto) {
            uint256 mask = flags & 0xffff; // certified bits (complement, D33)
            int256 worst;
            for (uint256 a; a < k; ++a) {
                (bool ok, int256 w, bytes32 tag) = _lastFeedback(s, address(uint160(s.anchors[a])), agentId);
                if (!ok) {
                    x.status = Status.REGISTRY_CHANGED; // unreadable registry: fail closed, never revert
                    return x;
                }
                if (w <= s.vetoMax) {
                    mask |= 1 << a;
                    if (w < worst) {
                        worst = w;
                        x.triggerTag = tag;
                    }
                }
            }
            // D48-B, strict mode: an anchor approved for the agent or operator of its owner cannot post on it
            // (preventive censorship): it counts as that anchor's veto (fast mode: proveApproval, certified bit)
            if (s.strictTransfer && mask != (1 << k) - 1) {
                (uint256 res, uint256 am, uint256 o) = _approvalVetoes(s, agentId, ((1 << k) - 1) & ~mask);
                if (res == R_FAIL) {
                    x.status = Status.REGISTRY_CHANGED;
                    return x;
                }
                mask |= am;
                ownerRead = res; // R_OK: o is ownerOf(agentId); R_NONE: the agent does not exist
                ownerWord = o;
            }
            uint256 cnt;
            for (; mask != 0; mask &= mask - 1) {
                ++cnt;
            }
            x.vetoCount = uint8(cnt);
            if (cnt >= s.vetoQuorum) {
                x.status = Status.VETOED;
                return x;
            }
        }
        if (known) {
            bool moved = flags & F_TRANSFERRED != 0;
            // strict mode (D35): live ownerOf, only when it can matter (a node without mass is never trusted)
            if (!moved && s.strictTransfer && massive) {
                (uint256 rO, uint256 o) = ownerRead != type(uint256).max
                    ? (ownerRead, ownerWord)
                    : _idCall(abi.encodeCall(IIdentityRegistry8004.ownerOf, (agentId)));
                if (rO == R_FAIL) {
                    x.status = Status.REGISTRY_CHANGED; // unreadable registry: fail closed (R6), never revert
                    return x;
                }
                moved = rO == R_NONE || (o & LANE_MASK) != ownerFp;
            }
            if (moved) {
                x.status = Status.TRANSFERRED;
                return x;
            }
        }
        x.status = Status.OK;
        x.passesPolicy = withVeto && bounds;
    }

    /// trust minus the (m - 1) largest contributions; k <= 16 so a selection loop is fine.
    function _leaveOut(uint256[] memory c, uint256 m, uint256 total) internal pure returns (uint256) {
        if (m <= 1) return total;
        uint256 k = c.length;
        if (m - 1 >= k) return 0;
        uint256 removed;
        for (uint256 it; it < m - 1; ++it) {
            uint256 best;
            uint256 bi;
            for (uint256 a; a < k; ++a) {
                if (c[a] > best) {
                    best = c[a];
                    bi = a;
                }
            }
            removed += best;
            c[bi] = 0;
        }
        return total - removed;
    }

    // ================================================================== registry version (D17)
    function checkRegistry(bytes32 setId) external returns (bool changed) {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) return false;
        (bool ok, bytes32 vh) = _versionHash();
        if (!ok || vh != s.versionHash) {
            if (!s.registryChanged) {
                s.registryChanged = true;
                emit RegistryChanged(setId, s.versionHash, vh);
            }
            return true;
        }
        return s.registryChanged;
    }

    function _versionHash() internal view returns (bool ok, bytes32 h) {
        (bool o1, bytes32 h1) = _versionOf(address(identity));
        (bool o2, bytes32 h2) = _versionOf(address(reputation));
        return (o1 && o2, keccak256(abi.encode(address(identity), h1, address(reputation), h2)));
    }

    function _versionOf(address target) internal view returns (bool ok, bytes32 h) {
        (bool s, bytes memory ret) = target.staticcall{gas: VIEW_CALL_GAS}(abi.encodeWithSignature("getVersion()"));
        if (!s || ret.length < 64) return (false, 0);
        uint256 o;
        uint256 len;
        assembly ("memory-safe") {
            o := mload(add(ret, 32))
        }
        if (o > ret.length - 32) return (false, 0);
        assembly ("memory-safe") {
            len := mload(add(add(ret, 32), o))
        }
        if (len > ret.length - 32 - o) return (false, 0);
        assembly ("memory-safe") {
            h := keccak256(add(add(ret, 64), o), len)
        }
        ok = true;
    }

    // ================================================================== registry edge (D14/D15/D33)
    /// Combined weight of the (client -> agentId) edge read from the registry, over the WHOLE history of
    /// the pair (no scan window): per endorsement tag of the filter, the last non-revoked feedback; out of
    /// bounds -> that tag gives nothing (no fallback to an older one); then negative dominance: the most
    /// negative weight if any, else the largest. idx = index of the feedback that gives w (ties: highest
    /// index), 0 if w = 0. The scan stops once every endorsement tag has been seen; it is unbounded
    /// otherwise, at the caller's expense (submitters and provers, never assess).
    /// ok = false only if the registry could not be read.
    function _pairEdge(SetState storage s, address client, uint256 agentId)
        internal
        view
        returns (bool ok, int256 w, uint256 idx, bytes32 tag)
    {
        uint256 last;
        (ok, last) = _staticWord(address(reputation), abi.encodeCall(IReputationRegistry8004.getLastIndex, (agentId, client)));
        if (!ok || last == 0) return (ok, 0, 0, 0);
        uint256 nt = s.numTags;
        uint256 allMask = s.endoMask;
        if (allMask == 0) return (true, 0, 0, 0);
        uint256 seen;
        int256 minW;
        int256 maxW;
        uint256 minIdx;
        uint256 maxIdx;
        bytes32 minTag;
        bytes32 maxTag;
        for (uint256 j = last; j >= 1; --j) {
            // E1 (review 06/10): paying paths only (submissions, proofs): no VIEW_CALL_GAS cap on readFeedback,
            // whose cost grows with the tags' length (a client could make its own pair unreadable with a long tag2)
            (bool rok, int256 value, uint256 dec, bytes32 th, bool revoked) = _readFb(agentId, client, uint64(j), gasleft());
            if (!rok) return (false, 0, 0, 0);
            if (!revoked) {
                for (uint256 i; i < nt; ++i) {
                    uint256 bit = 1 << i;
                    if (allMask & bit == 0 || seen & bit != 0) continue;
                    TagStored storage ts = s.tags[i];
                    if (ts.hash != th) continue;
                    seen |= bit;
                    (bool valid, int256 wt) = _normalize(value, dec, ts);
                    if (valid) {
                        if (wt < minW) (minW, minIdx, minTag) = (wt, j, ts.hash);
                        if (wt > maxW) (maxW, maxIdx, maxTag) = (wt, j, ts.hash);
                    }
                    break;
                }
                if (seen == allMask) break;
            }
            if (j == 1) break;
        }
        if (minW < 0) return (true, minW, minIdx, minTag);
        if (maxW > 0) return (true, maxW, maxIdx, maxTag);
        return (true, 0, 0, 0);
    }

    /// D33 live veto: weight of the LAST feedback of `client` on `agentId` only (one getLastIndex and one
    /// readFeedback), 0 if it is revoked, of a measurement tag, out of the filter or out of bounds.
    function _lastFeedback(SetState storage s, address client, uint256 agentId)
        internal
        view
        returns (bool ok, int256 w, bytes32 tag)
    {
        uint256 last;
        (ok, last) = _staticWord(address(reputation), abi.encodeCall(IReputationRegistry8004.getLastIndex, (agentId, client)));
        if (!ok || last == 0) return (ok, 0, 0);
        (bool rok, int256 value, uint256 dec, bytes32 th, bool revoked) =
            _readFb(agentId, client, uint64(last), VIEW_CALL_GAS);
        if (!rok) return (false, 0, 0);
        if (revoked) return (true, 0, 0);
        uint256 nt = s.numTags;
        for (uint256 i; i < nt; ++i) {
            TagStored storage ts = s.tags[i];
            if (ts.hash != th) continue;
            if (ts.kind != TAG_ENDORSEMENT) return (true, 0, 0);
            (bool valid, int256 wt) = _normalize(value, dec, ts);
            return (true, valid ? wt : int256(0), ts.hash);
        }
        return (true, 0, 0);
    }

    /// value / 10^dec -> grid weight in [-GRID, GRID], exact bound comparison, truncation toward zero.
    function _normalize(int256 value, uint256 dec, TagStored storage ts) internal view returns (bool, int256) {
        if (dec > 18) return (false, 0);
        int256 x = value * int256(10 ** (18 - dec)); // |value| <= 1e38 in the registry -> fits in int256
        int256 mn = ts.min;
        int256 nu = ts.neutral;
        int256 mx = ts.max;
        if (x < mn || x > mx) return (false, 0); // rejected, never clamped
        if (x > nu) return (true, ((x - nu) * GRID) / (mx - nu));
        if (x < nu) return (true, -(((nu - x) * GRID) / (nu - mn)));
        return (true, 0);
    }

    function _staticWord(address target, bytes memory data) internal view returns (bool ok, uint256 w) {
        assembly ("memory-safe") {
            ok := staticcall(VIEW_CALL_GAS, target, add(data, 32), mload(data), 0, 32)
            if lt(returndatasize(), 32) { ok := 0 }
            if ok { w := mload(0) }
        }
    }

    /// staticcall to the identity registry: R_OK with the first return word; R_NONE if it reverted with
    /// ERC721NonexistentToken (a real answer: the agent does not exist); R_FAIL otherwise (R6: out of gas
    /// after an upgrade, empty revert, short return data), never read as an answer.
    function _idCall(bytes memory data) internal view returns (uint256 res, uint256 w) {
        address t = address(identity);
        assembly ("memory-safe") {
            res := R_FAIL
            switch staticcall(VIEW_CALL_GAS, t, add(data, 32), mload(data), 0, 0)
            case 1 {
                if iszero(lt(returndatasize(), 32)) {
                    returndatacopy(0, 0, 32)
                    w := mload(0)
                    res := R_OK
                }
            }
            default {
                if iszero(lt(returndatasize(), 4)) {
                    returndatacopy(0, 0, 4)
                    if eq(shr(224, mload(0)), NONEXISTENT) { res := R_NONE }
                }
            }
        }
    }

    /// readFeedback(agentId, client, idx): value, decimals, keccak256(tag1), revoked. Only the head and tag1 are
    /// copied out of the return data (tag2 can be arbitrarily long, E1). `g` = gas forwarded: VIEW_CALL_GAS in
    /// views (assess), all the remaining gas in paying paths.
    function _readFb(uint256 agentId, address client, uint64 idx, uint256 g)
        internal
        view
        returns (bool ok, int256 value, uint256 dec, bytes32 tagHash, bool revoked)
    {
        bytes memory cd = abi.encodeCall(IReputationRegistry8004.readFeedback, (agentId, client, idx));
        address rep = address(reputation);
        assembly ("memory-safe") {
            let success := staticcall(g, rep, add(cd, 32), mload(cd), 0, 0)
            let sz := returndatasize()
            if and(success, iszero(lt(sz, 160))) {
                let p := mload(0x40)
                returndatacopy(p, 0, 160)
                value := mload(p)
                dec := mload(add(p, 32))
                let o1 := mload(add(p, 64))
                revoked := iszero(iszero(mload(add(p, 128))))
                if lt(o1, sub(sz, 31)) {
                    returndatacopy(p, o1, 32)
                    let len := mload(p)
                    if iszero(gt(len, sub(sub(sz, o1), 32))) {
                        returndatacopy(p, add(o1, 32), len)
                        tagHash := keccak256(p, len)
                        ok := 1
                    }
                }
                if iszero(eq(signextend(15, value), value)) { ok := 0 }
                if gt(dec, 255) { ok := 0 }
            }
        }
    }

    // ================================================================== discrepancy proofs (D6, D22, D32)
    /// One proof for every edge-level discrepancy: the contract recomputes, from the registry NOW, the D14
    /// combined weight wNew of (client_u -> agentJ) (0 if the client is a current controller of agentJ,
    /// D16/D20) and compares it with the weight wOld that the row of u currently carries (committed edge,
    /// or previous amendment, or 0 if absent). Every discrepancy type of the CR is a special case:
    ///   (i)   OMISSION           wOld = 0,  wNew != 0   (with dilution of B+ if the row sum overflows B+)
    ///   (ii)  STALE, (iii) REVOKED, controller change   wNew != wOld after the certificate
    ///   (v)   FABRICATION / INFLATION                   wNew < wOld at any time (Submitter-attested)
    /// The exact change of the normalised row (B+ and B- recomputed on the amended row) is billed per
    /// column: positive-side decreases to eLow, positive- and negative-side increases to eUp, each
    /// ceil(t_u^(a) (1 - alpha) Delta / alpha), with per-row caps (D22). Proofs on a row accumulate in
    /// its RowState; each fact is billed once.
    /// @param r      the committed row of u (Merkle path to graphRoot while the row is not amended)
    /// @param src    for an alias row: the committed source row (Merkle path required); ignored otherwise
    /// @param amends the row's amendments so far: (agentId:u32, wCommitted:int16, wNow:int16)*
    function proveEdge(bytes32 setId, RowRef calldata r, RowRef calldata src, bytes calldata amends, uint256 agentJ)
        external
    {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) revert NoCert();
        if (agentJ > type(uint32).max) revert BadProof(20);
        (RowView memory v, bytes32 sk) = _openRow(s, setId, r, amends);
        RowView memory e = v;
        if (v.isAlias) e = _openSource(s, src, v.srcU);
        address client = _rowClient(s, setId, v);
        bytes calldata eb = v.isAlias ? src.row : r.row;
        // no row carries an edge to its own agent (dst != u): with D48-B a wallet's negative feedback on its own
        // agent would otherwise be provable on every certificate, forever (review 06/10)
        if (_keyAtBase(_keyBase(setId), v.u) == uint256(agentKey(agentJ))) revert BadProof(27);

        EdgeSums memory m = _sums(s, setId, e, eb, amends, agentJ);
        int256 wNew = _currentEdge(s, client, agentJ);
        if (wNew == m.wOld) revert NothingToProve();

        RowState storage st = _rows[sk];
        bytes memory am = _amend(amends, agentJ, m.wCommitted, wNew);
        // bounds of the amended row against the COMMITTED row (R3), billed beyond what is already billed
        (uint256 dimNeed, uint256 pNeed, uint256 nNeed) = _needs(am, m.s0, m.n0, e.sDecl);
        (uint256 dim, uint256 inc) = _bill(st, dimNeed, pNeed, nNeed, m, e.sDecl);
        st.h = keccak256(abi.encodePacked(v.leaf, am));
        _recordEdgeFact(s, setId, client, agentJ, wNew);
        _widen(s, setId, v.u, dim, inc);
        // V13: an anchor row now holding a veto on a certified agent sets its certified bit (never cleared
        // before recertification, D21)
        if (v.u < s.k && wNew <= s.vetoMax && m.jp1 != 0 && m.jp1 <= s.nCert) _setFlag(setId, s, m.jp1 - 1, 1 << v.u);
        emit EdgeProven(setId, v.u, agentJ, m.wOld, wNew, s.eLowEff, s.eEff);
    }

    function _recordEdgeFact(SetState storage s, bytes32 setId, address client, uint256 agentJ, int256 w) internal {
        mapping(uint256 => uint256) storage m = _edgeFact[setId][client];
        if (m[agentJ] == 0) {
            _factAgents[setId][client].push(uint32(agentJ));
            s.facts += 1;
        }
        m[agentJ] = 1 | (uint256(uint16(int16(w))) << 1);
        emit EdgeFact(setId, client, agentJ, w);
    }

    /// D14 weight of (client -> agentJ) read NOW, with the D48-B controller rule: a current controller of agentJ
    /// (isAuthorizedOrOwner, agentWallet) gives no positive edge, its negative edge is kept. An agent that does
    /// not exist holds no edge (ERC721NonexistentToken); any other registry failure reverts (R6).
    function _currentEdge(SetState storage s, address client, uint256 agentJ) internal view returns (int256 w) {
        (uint256 rA, uint256 auth) = _idCall(abi.encodeCall(IIdentityRegistry8004.isAuthorizedOrOwner, (client, agentJ)));
        if (rA == R_FAIL) revert RegistryUnreadable();
        if (rA == R_NONE) return 0;
        bool ok;
        (ok, w,,) = _pairEdge(s, client, agentJ);
        if (!ok) revert RegistryUnreadable();
        if (w <= 0) return w;
        if (auth != 0) return 0;
        (uint256 rW, uint256 wal) = _idCall(abi.encodeCall(IIdentityRegistry8004.getAgentWallet, (agentJ)));
        if (rW == R_FAIL) revert RegistryUnreadable();
        return address(uint160(wal)) == client ? int256(0) : w;
    }

    /// (iv) SOURCE: the committed source of an agent row is no longer src(u) (R7): the agentWallet changed
    /// (it is cleared on every transfer, so this also freezes the OUTGOING edges of a transferred agent,
    /// D44), the owner of a VIA_OWNER row changed or the agent got a wallet (D44 (iv-a)), or a source-less
    /// row's agent got a wallet. The row's client changed: worst case, all its committed positive mass is
    /// lost (eLow, capped at S0/B0 for a full row, at 1 for an alias) and the new client's row is unknown
    /// (eUp, both sides, capped). The row is then void.
    /// @param src for an alias row: the committed source row (Merkle path required); ignored otherwise
    function proveWallet(bytes32 setId, RowRef calldata r, RowRef calldata src, bytes calldata amends) external {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) revert NoCert();
        (RowView memory v, bytes32 sk) = _openRow(s, setId, r, amends);
        uint256 key = _keyAtBase(_keyBase(setId), v.u);
        if (key >> 248 != KIND_AGENT) revert BadProof(21);
        if (_sourceHolds(key & ID_MASK, v)) revert NothingToProve();
        RowState storage st = _rows[sk];
        RowView memory e = v;
        if (v.isAlias) e = _openSource(s, src, v.srcU);
        bytes calldata eb = v.isAlias ? src.row : r.row;
        EdgeSums memory m = _sums(s, setId, e, eb, amends, 0);
        // the row's client changed: worst case on every side (all committed positive mass lost, a full unknown row)
        (uint256 dim, uint256 inc) = _bill(st, WAD, WAD, WAD, m, e.sDecl);
        st.voided = true;
        bytes32 sh = sourceHash(v.u, v.wallet, v.hdr);
        if (!provenSource[setId][sh]) {
            provenSource[setId][sh] = true;
            s.facts += 1;
        }
        _widen(s, setId, v.u, dim, inc);
        emit RowVoided(setId, v.u, s.eLowEff, s.eEff);
    }

    /// Fast transfer mode (D25/D35 option): flags a certified agent whose current owner differs from the
    /// committed fingerprint; assess then returns TRANSFERRED in both modes.
    function proveTransfer(bytes32 setId, uint256 agentId) external {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) revert NoCert();
        uint256 ip1 = agentId <= ID_MASK ? nodeIndexPlus1[setId][agentKey(agentId)] : 0;
        if (ip1 == 0 || ip1 > s.nCert) revert BadProof(22);
        uint256 i = ip1 - 1;
        uint256 sb = _vecBase(setId) + (i >> 2) * (uint256(s.k) + 3);
        uint256 sh = (i & 3) * 64;
        uint256 fp;
        uint256 fl;
        uint256 k = s.k;
        assembly ("memory-safe") {
            fp := and(shr(sh, sload(add(sb, add(k, 1)))), LANE_MASK)
            fl := and(shr(sh, sload(add(sb, add(k, 2)))), LANE_MASK)
        }
        if (fl & F_TRANSFERRED != 0) revert NothingToProve();
        (uint256 rO, uint256 o) = _idCall(abi.encodeCall(IIdentityRegistry8004.ownerOf, (agentId)));
        if (rO == R_FAIL) revert RegistryUnreadable(); // R6: a failed read is not a burnt agent
        if (rO == R_OK && (o & LANE_MASK) == fp) revert NothingToProve(); // nonexistent (burnt) = moved
        _setFlag(setId, s, i, F_TRANSFERRED);
        emit TransferFlagged(setId, agentId);
    }

    /// Fast mode of the D48-B veto (strict mode reads it live in assess): anchor `a` is approved for the
    /// certified agent (getApproved) or an operator of its owner (isApprovedForAll). The registry then forbids
    /// the anchor to post on the agent (preventive censorship), so the approval counts as the anchor's veto: it
    /// sets the certified veto bit of anchor a, until the next certificate.
    function proveApproval(bytes32 setId, uint256 agentId, uint256 a) external {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) revert NoCert();
        uint256 ip1 = agentId <= ID_MASK ? nodeIndexPlus1[setId][agentKey(agentId)] : 0;
        if (ip1 == 0 || ip1 > s.nCert) revert BadProof(22);
        if (a >= s.k) revert BadProof(26);
        uint256 bit = 1 << a;
        if (vectorAt(setId, ip1 - 1, uint256(s.k) + 2) & bit != 0) revert NothingToProve();
        (uint256 res, uint256 mask,) = _approvalVetoes(s, agentId, bit);
        if (res == R_FAIL) revert RegistryUnreadable();
        if (mask == 0) revert NothingToProve();
        _setFlag(setId, s, ip1 - 1, bit);
        emit ApprovalProven(setId, agentId, a);
    }

    /// D48-B: mask of the anchors (among `which`) that are getApproved(j) or isApprovedForAll(ownerOf(j), anchor).
    /// R_NONE (agent does not exist: no approval) or R_FAIL (unreadable) are reported to the caller.
    function _approvalVetoes(SetState storage s, uint256 agentId, uint256 which)
        internal
        view
        returns (uint256 res, uint256 mask, uint256 o)
    {
        (uint256 rA, uint256 appr) = _idCall(abi.encodeCall(IIdentityRegistry8004.getApproved, (agentId)));
        if (rA != R_OK) return (rA, 0, 0);
        uint256 rO;
        (rO, o) = _idCall(abi.encodeCall(IIdentityRegistry8004.ownerOf, (agentId)));
        if (rO != R_OK) return (rO, 0, 0);
        uint256 k = s.k;
        for (uint256 a; a < k; ++a) {
            if (which & (1 << a) == 0) continue;
            address an = address(uint160(s.anchors[a]));
            if (address(uint160(appr)) == an) {
                mask |= 1 << a;
                continue;
            }
            (uint256 rF, uint256 op) =
                _idCall(abi.encodeCall(IIdentityRegistry8004.isApprovedForAll, (address(uint160(o)), an)));
            if (rF != R_OK) return (R_FAIL, 0, 0);
            if (op != 0) mask |= 1 << a;
        }
    }

    struct RowView {
        uint256 u;
        uint256 hdr;
        address wallet;
        uint256 sDecl;
        bool isAlias;
        uint256 srcU;
        uint256 edgesOff; // offset of the first edge in the row bytes
        uint256 nE;
        bytes32 leaf;
    }

    struct EdgeSums {
        int256 wOld; // current weight of the edge to agentJ (amended, else committed, else 0)
        int256 wCommitted; // committed weight of the edge to agentJ (0 if absent)
        uint256 s0; // committed positive sum
        uint256 n0; // committed negative sum (absolute)
        uint256 b0; // committed B+
        uint256 jp1; // node index + 1 of agentJ (0 if not in the table)
    }

    function _parseRow(uint256 W, bytes calldata row) internal pure returns (RowView memory v) {
        if (row.length < W + 2) revert BadProof(0);
        v.u = _be(row, 0, W);
        v.hdr = _be(row, W, 2);
        v.nE = v.hdr & H_NE;
        uint256 o = W + 2;
        if (v.hdr & H_SRC != 0) {
            v.wallet = address(bytes20(row[o:o + 20]));
            o += 20;
        }
        if (v.hdr & H_SPLUS != 0) {
            v.sDecl = uint32(bytes4(row[o:o + 4]));
            o += 4;
        }
        if (v.hdr & H_ALIAS != 0) {
            v.isAlias = true;
            v.srcU = _be(row, o, W);
            o += W;
        }
        v.edgesOff = o;
        if (row.length != o + v.nE * (W + 6)) revert BadProof(1);
        v.leaf = keccak256(row);
    }

    /// authenticates the row of u: Merkle path to graphRoot, or the amended state of this certificate
    function _openRow(SetState storage s, bytes32 setId, RowRef calldata r, bytes calldata amends)
        internal
        view
        returns (RowView memory v, bytes32 sk)
    {
        v = _parseRow(s.idxWidth, r.row);
        if (amends.length % 8 != 0) revert BadProof(6);
        sk = keccak256(abi.encode(setId, s.certNonce, v.u));
        RowState storage st = _rows[sk];
        if (st.voided) revert BadProof(23);
        if (st.h == 0) {
            if (amends.length != 0) revert BadProof(3);
            if (!_verifyMerkle(v.leaf, r.pos, s.numRows, r.path, s.graphRoot)) revert BadProof(4);
        } else if (keccak256(abi.encodePacked(v.leaf, amends)) != st.h) {
            revert BadProof(5);
        }
    }

    function _openSource(SetState storage s, RowRef calldata src, uint256 srcU) internal view returns (RowView memory e) {
        e = _parseRow(s.idxWidth, src.row);
        if (e.u != srcU || e.isAlias) revert BadProof(24);
        if (!_verifyMerkle(e.leaf, src.pos, s.numRows, src.path, s.graphRoot)) revert BadProof(4);
    }

    /// client address of the row's node: anchor / address node key, or the committed source of an agent,
    /// which must still be src(u) (otherwise proveWallet applies). A source-less agent row has no client.
    function _rowClient(SetState storage s, bytes32 setId, RowView memory v) internal view returns (address) {
        uint256 key = _keyAtBase(_keyBase(setId), v.u);
        if (key >> 248 == KIND_AGENT) {
            if (v.wallet == address(0)) revert BadProof(7); // nothing to prove edge-wise: see proveWallet
            if (!_sourceHolds(key & ID_MASK, v)) revert BadProof(25); // -> proveWallet
            return v.wallet;
        }
        if (key == 0 || v.u >= s.nCert) revert BadProof(2);
        return address(uint160(key)); // anchors and address nodes: the key holds the address
    }

    /// true iff the committed source of agent row v still resolves from the registry (R7): agentWallet = SRC;
    /// VIA_OWNER: agentWallet = 0 and ownerOf = SRC; no SRC: agentWallet = 0. R6: an unreadable registry reverts
    /// (it is not a burnt agent); a nonexistent agent has no owner (getAgentWallet answers 0 for it).
    function _sourceHolds(uint256 j, RowView memory v) internal view returns (bool) {
        (uint256 rW, uint256 wal) = _idCall(abi.encodeCall(IIdentityRegistry8004.getAgentWallet, (j)));
        if (rW == R_FAIL) revert RegistryUnreadable();
        if (v.wallet == address(0) || v.hdr & H_VIA_OWNER != 0) {
            if (wal != 0) return false; // the wallet always wins (D44)
            if (v.wallet == address(0)) return true;
            (uint256 rO, uint256 o) = _idCall(abi.encodeCall(IIdentityRegistry8004.ownerOf, (j)));
            if (rO == R_FAIL) revert RegistryUnreadable();
            return rO == R_OK && address(uint160(o)) == v.wallet;
        }
        return address(uint160(wal)) == v.wallet;
    }

    /// @param eb the bytes of the row that holds the edges (the row itself, or the source of an alias)
    function _sums(SetState storage s, bytes32 setId, RowView memory e, bytes calldata eb, bytes calldata amends, uint256 agentJ)
        internal
        view
        returns (EdgeSums memory m)
    {
        uint256 W = s.idxWidth;
        uint256 jp1 = nodeIndexPlus1[setId][agentKey(agentJ)];
        m.jp1 = jp1;
        for (uint256 i; i < e.nE; ++i) {
            uint256 o = e.edgesOff + i * (W + 6);
            int256 w = int16(uint16(bytes2(eb[o + W:o + W + 2])));
            if (jp1 != 0 && _be(eb, o, W) == jp1 - 1) m.wCommitted = w;
            if (w > 0) m.s0 += uint256(w);
            else m.n0 += uint256(-w);
        }
        uint256 sp = e.sDecl != 0 ? e.sDecl : m.s0; // B+ = max(GRID, declared sPlus or committed S+)
        m.b0 = sp > uint256(GRID) ? sp : uint256(GRID);
        m.wOld = m.wCommitted;
        for (uint256 o; o < amends.length; o += 8) {
            if (uint32(bytes4(amends[o:o + 4])) == agentJ) {
                m.wCommitted = int16(uint16(bytes2(amends[o + 4:o + 6])));
                m.wOld = int16(uint16(bytes2(amends[o + 6:o + 8])));
            }
        }
    }

    /// Bounds of an amended row against its COMMITTED row (R3, PROOFS.md L6), WAD, rounded up:
    ///   dim  >= sum_v (C0_v - C_v)^+ on the positive side (lower bound, eLow),
    ///   incP >= sum_v (C_v - C0_v)^+ on the positive side, the not-yet-revealed omitted mass included (eUp),
    ///   incN >= the same on the negative side (eUp, distrust).
    /// C0 = committed row, budget B0 = max(GRID, sPlus or S0). C = amended row, budget max(GRID, X) with X its
    /// largest possible true positive sum: X = dEff - cOut + pIn = Scur + (dEff - S0), dEff = sPlus or S0: every
    /// revealed uncommitted edge may be NEW (A2b, review 06/10: assuming it within the declared sum let a new
    /// positive edge bill nothing to eLow). Both bounds grow with X, so it covers every true sum in [Scur, X];
    /// the omitted mass not yet revealed is at most X - Scur.
    function _needs(bytes memory am, uint256 s0, uint256 n0, uint256 d)
        internal
        pure
        returns (uint256 dim, uint256 incP, uint256 incN)
    {
        uint256 G = uint256(GRID);
        uint256 cOut; // sum of committed w+ of the amended edges
        uint256 pIn; // sum of current w+ of every amended edge
        uint256 nOut; // same, negative side (absolute values)
        uint256 nIn;
        uint256 len = am.length;
        for (uint256 o; o < len; o += 8) {
            (int256 wc, int256 wn) = _entry(am, o);
            cOut += _pos(wc);
            nOut += _pos(-wc);
            pIn += _pos(wn);
            nIn += _pos(-wn);
        }
        uint256 dEff = d != 0 ? d : s0;
        uint256 scur = s0 - cOut + pIn;
        uint256 x = dEff - cOut + pIn; // >= scur since dEff >= s0
        uint256 b0 = dEff > G ? dEff : G;
        uint256 bh = x > G ? x : G;
        uint256 su = s0 - cOut; // committed positive mass of the edges never amended
        uint256 def = bh > b0 ? su * (bh - b0) : 0;
        uint256 exc = (b0 > bh ? su * (b0 - bh) : 0) + (x - scur) * b0;
        uint256 ncur = n0 - nOut + nIn;
        uint256 bn0 = n0 > G ? n0 : G;
        uint256 bnh = ncur > G ? ncur : G;
        uint256 excN = bn0 > bnh ? (n0 - nOut) * (bn0 - bnh) : 0;
        for (uint256 o; o < len; o += 8) {
            (int256 wc, int256 wn) = _entry(am, o);
            def += _sat(_pos(wc) * bh, _pos(wn) * b0);
            exc += _sat(_pos(wn) * b0, _pos(wc) * bh);
            excN += _sat(_pos(-wn) * bn0, _pos(-wc) * bnh);
        }
        dim = _ceilDiv(def * WAD, b0 * bh);
        incP = _ceilDiv(exc * WAD, b0 * bh);
        incN = _ceilDiv(excN * WAD, bn0 * bnh);
    }

    /// Bills a row's bounds beyond what it already paid (RowState keeps the largest bound billed, per side).
    /// Caps (D22): dim <= the committed positive mass S0/B0, each increase <= 1. A declared sPlus already put the
    /// omitted positive mass (sPlus - S0)/B0 into eUp's margin at submission: it is not billed twice.
    function _bill(RowState storage st, uint256 dimNeed, uint256 pNeed, uint256 nNeed, EdgeSums memory m, uint256 sDecl)
        internal
        returns (uint256 dim, uint256 inc)
    {
        uint256 capDim = _ceilDiv(m.s0 * WAD, m.b0);
        if (dimNeed > capDim) dimNeed = capDim;
        if (pNeed > WAD) pNeed = WAD;
        if (nNeed > WAD) nNeed = WAD;
        uint256 prepaid = sDecl != 0 ? ((sDecl - m.s0) * WAD) / m.b0 : 0;
        dim = _sat(dimNeed, st.dim);
        if (pNeed > st.incP) {
            inc = _sat(pNeed, prepaid) - _sat(st.incP, prepaid);
            st.incP = uint64(pNeed);
        }
        if (nNeed > st.incN) {
            inc += nNeed - st.incN;
            st.incN = uint64(nNeed);
        }
        st.dim += uint64(dim);
    }

    /// (wCommitted, wNow) of the amendment entry at byte `o` of a memory amendment list
    function _entry(bytes memory am, uint256 o) internal pure returns (int256 wc, int256 wn) {
        assembly ("memory-safe") {
            let word := mload(add(add(am, 32), o))
            wc := signextend(1, and(shr(208, word), 0xffff))
            wn := signextend(1, and(shr(192, word), 0xffff))
        }
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    /// new amendment list: the entry of agentJ replaced (or appended)
    function _amend(bytes calldata amends, uint256 agentJ, int256 wc, int256 wn) internal pure returns (bytes memory out) {
        bytes memory entry = abi.encodePacked(uint32(agentJ), int16(wc), int16(wn));
        for (uint256 o; o < amends.length; o += 8) {
            if (uint32(bytes4(amends[o:o + 4])) == agentJ) {
                return bytes.concat(amends[:o], entry, amends[o + 8:]);
            }
        }
        return bytes.concat(amends, entry);
    }

    function _sat(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }

    function _setFlag(bytes32 setId, SetState storage s, uint256 i, uint256 bit) internal {
        uint256 slot = _vecBase(setId) + (i >> 2) * (uint256(s.k) + 3) + s.k + 2;
        uint256 sh = (i & 3) * 64;
        assembly ("memory-safe") {
            sstore(slot, or(sload(slot), shl(sh, bit)))
        }
    }

    function _pos(int256 w) internal pure returns (uint256) {
        return w > 0 ? uint256(w) : 0;
    }

    /// eLow[a] += ceil(t_u^(a) om dim / (aN WAD)) and eUp[a] += ceil(t_u^(a) om inc / (aN WAD)), then the
    /// aggregates. (1 - alpha) t_u Delta is the L1 change of F(t); dividing by alpha bounds the fixed point.
    function _widen(SetState storage s, bytes32 setId, uint256 u, uint256 dim, uint256 inc) internal {
        uint256 k = s.k;
        uint256 om = uint256(s.alphaD) - s.alphaN;
        uint256 den = uint256(s.alphaN) * WAD;
        uint256 sb = _vecBase(setId) + (u >> 2) * (k + 3);
        uint256 sh = (u & 3) * 64;
        ColState storage cs = _cols(setId);
        uint256[] memory lo = new uint256[](k);
        uint256[] memory up = new uint256[](k);
        for (uint256 a; a < k; ++a) {
            uint256 t;
            assembly ("memory-safe") {
                t := and(shr(sh, sload(add(sb, a))), LANE_MASK)
            }
            lo[a] = cs.eLow[a] + (t * om * dim + den - 1) / den;
            up[a] = cs.eUp[a] + (t * om * inc + den - 1) / den;
            cs.eLow[a] = lo[a];
            cs.eUp[a] = up[a];
        }
        s.eLowEff = _aggregate(s, lo, k);
        s.eEff = _aggregate(s, up, k);
    }

    function _verifyMerkle(bytes32 leaf, uint256 pos, uint256 cnt, bytes32[] calldata proof, bytes32 root)
        internal
        pure
        returns (bool)
    {
        if (pos >= cnt) return false;
        bytes32 h = leaf;
        uint256 i;
        while (cnt > 1) {
            if (pos & 1 == 1) {
                if (i >= proof.length) return false;
                h = keccak256(abi.encode(proof[i++], h));
            } else if (pos + 1 < cnt) {
                if (i >= proof.length) return false;
                h = keccak256(abi.encode(h, proof[i++]));
            }
            pos >>= 1;
            cnt = (cnt + 1) >> 1;
        }
        return i == proof.length && h == root;
    }

    // ================================================================== views / storage helpers
    function certificate(bytes32 setId)
        external
        view
        returns (
            uint64 certBlock,
            uint256 eEff,
            uint256 eLowEff,
            bytes32 graphRoot,
            bytes32 vectorRoot,
            bytes32 versionHash,
            uint32 nCert,
            uint32 numRows,
            bool registryChanged
        )
    {
        SetState storage s = _set(setId);
        return (s.certBlock, s.eEff, s.eLowEff, s.graphRoot, s.vectorRoot, s.versionHash, s.nCert, s.numRows, s.registryChanged);
    }

    /// Quality of the current certificate for the replacement rule (ENCODING.md §5): its mass, its
    /// q_cur = eEff - eFloor + eLowEff (widened by proofs), its distrust mass sum_v d_v, and whether a proof widened it. A certifier compares its own (qEff, mass) before paying.
    function quality(bytes32 setId)
        external
        view
        returns (uint256 mass, uint256 qCur, uint256 distrustMass, bool proven)
    {
        SetState storage s = _set(setId);
        if (s.certBlock == 0) return (0, 0, 0, false);
        return (s.mass, s.eEff - s.eFloor + s.eLowEff, s.distrustMass, s.eLowEff != 0 || s.eEff > s.eSubmitted);
    }

    /// per-column bounds (t-space, WAD)
    function columnBounds(bytes32 setId, uint256 a) external view returns (uint256 eUp, uint256 eLow) {
        ColState storage cs = _cols(setId);
        return (cs.eUp[a], cs.eLow[a]);
    }

    function rowStateOf(bytes32 setId, uint256 u) external view returns (RowState memory) {
        return _rows[keccak256(abi.encode(setId, _set(setId).certNonce, u))];
    }

    /// raw lane read: v < k -> t^(v), v = k -> distrust, v = k+1 -> owner fingerprint, v = k+2 -> flags
    function vectorAt(bytes32 setId, uint256 i, uint256 v) public view returns (uint256 x) {
        SetState storage s = _set(setId);
        uint256 sl = _vecBase(setId) + (i >> 2) * (uint256(s.k) + 3) + v;
        uint256 sh = (i & 3) * 64;
        assembly ("memory-safe") {
            x := and(shr(sh, sload(sl)), LANE_MASK)
        }
    }

    function _set(bytes32 setId) internal pure returns (SetState storage s) {
        uint256 base = uint256(keccak256(abi.encode(SET_DOMAIN, setId))) & ~uint256(127);
        assembly ("memory-safe") {
            s.slot := base
        }
    }

    function _cols(bytes32 setId) internal pure returns (ColState storage c) {
        uint256 base = uint256(keccak256(abi.encode(COL_DOMAIN, setId))) & ~uint256(127);
        assembly ("memory-safe") {
            c.slot := base
        }
    }

    function _vecBase(bytes32 setId) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(VEC_DOMAIN, setId))) & ~uint256(127);
    }

    /// node keys, contiguous (128 per MIP-8 page): slot keyBase + i = key of node i
    function _keyBase(bytes32 setId) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(KEY_DOMAIN, setId))) & ~uint256(127);
    }

    function _keyAtBase(uint256 kb, uint256 i) internal view returns (uint256 key) {
        assembly ("memory-safe") {
            key := sload(add(kb, i))
        }
    }

    /// owner fingerprint committed in the vector (63 low bits of the owner address, D10)
    function ownerFingerprint(address owner) public pure returns (uint64) {
        return uint64(uint160(owner) & LANE_MASK);
    }
}

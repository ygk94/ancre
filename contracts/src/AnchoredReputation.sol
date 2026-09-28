// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import {IIdentityRegistry8004, IReputationRegistry8004} from "./interfaces/IERC8004.sol";

/// @title AnchoredReputation — ANCRE verifier, level "Residual-verified"
/// @notice Reader-anchored personalised PageRank over ERC-8004 feedback, certified in one pass.
///         The contract never solves the fixed point: it receives k columns t^(a) (one per anchor),
///         recomputes F(t^(a)) = alpha·e_a + (1-alpha)·C^T t^(a) over the submitted graph with
///         rounding that can only increase the residual, and stores
///           r[a] >= || t^(a) - F_true(t^(a)) ||_1   (for the committed graph),  e[a] = ceil(r[a]/alpha).
///         See ENCODING.md for the calldata layout and the exact integer arithmetic (normative
///         interface with the off-chain solver).
/// @dev    Decisions implemented (docs/conseil/CR-conseil.md): D1 WAD mass shares, D2 alpha committed,
///         D4 one-hop distrust + direct anchor veto, D5 absorbing convention, D6 growing-bound
///         certificate (omission proofs widen r, no slashing), D7 separate budgets B+ / B-, D8 veto q=1
///         + leave-one-out (minAnchors), D10 pause on transfer, D11-reversed stored vectors + append-only
///         node table, D12 tag schema committed per set, D14 last non-revoked per (client, agent, tag1)
///         + negative dominance, D15 only `endorsement` tags create edges, D17 registry version
///         committed + checkRegistry(), D18 int16 weights on a 1e-4 grid, truncation toward zero.
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
    /// max feedback entries scanned per (client, agent) when reading the registry on-chain
    uint256 public constant MAX_SCAN = 32;
    /// gas forwarded to each registry call made from a view: a broken or hostile registry cannot
    /// burn the caller's whole gas limit (on Monad the limit is what is paid)
    uint256 public constant VIEW_CALL_GAS = 120_000;

    uint256 internal constant LANE_MASK = (1 << 63) - 1;
    uint256 internal constant SENTINEL = 1 << 255; // keeps every vector slot non-zero (x->y SSTORE pricing)
    uint256 internal constant KIND_AGENT = 1;
    uint256 internal constant KIND_ADDRESS = 2;
    uint256 internal constant KIND_ANCHOR = 3;
    uint8 internal constant TAG_ENDORSEMENT = 0;
    uint8 internal constant TAG_MEASUREMENT = 1;

    bytes32 internal constant SET_DOMAIN = keccak256("ANCRE.set.v1");
    bytes32 internal constant VEC_DOMAIN = keccak256("ANCRE.vec.v1");

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
        string tag; // ERC-8004 tag1, <= 32 bytes
        int128 min; // bounds in WAD (value * 10^(18 - valueDecimals)), compared exactly, before rounding
        int128 neutral;
        int128 max;
        uint8 kind; // 0 = endorsement (creates edges), 1 = measurement (never creates edges, D15)
    }

    /// Everything a payer needs to decide is committed here, hence in the setId (D1, D39): a status OK
    /// only says the certificate is usable, `isTrusted` says whether the agent may be paid.
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
        bool strictTransfer; // D35: live ownerOf in assess (default true) instead of a proof-set flag
        bool registryVerified; // D32: every committed edge is re-read in the registry at submission
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
        bytes32 name; // short string (left-aligned)
        bytes32 hash; // keccak256(bytes(tag))
        int128 min;
        int128 neutral;
        int128 max;
        uint8 kind;
    }

    /// Per-set state, placed at a page-aligned storage base so that every field lives in ONE
    /// MIP-8 page (8 100 gas cold for the whole struct instead of one page per field): 113 slots.
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
        // slots 4..
        uint256 eEff; // sum_a ceil(lambda_a * e[a] / WAD)
        bytes32 graphRoot;
        bytes32 vectorRoot;
        bytes32 tagSchemaHash;
        bytes32 versionHash; // keccak(identity, keccak(getVersion()), reputation, keccak(getVersion()))
        uint256[16] anchors; // address | lambda << 160
        uint256[16] r; // residual per column, WAD
        TagStored[16] tags;
        address[8] submitters; // D32 (inline: same page as the rest, no extra cold page at submission)
    }

    struct Assessment {
        Status status;
        uint256 trust; // sum_a lambda_a t^(a)_i            (WAD)
        uint256 trustRobust; // trust minus the (m-1) largest anchor contributions (D8)
        uint256 distrust; // one-hop distrust d_i         (WAD, rounded up)
        uint256 e; // eEff, L1 error bound                 (WAD, rounded up)
        uint64 certBlock;
        uint8 vetoCount;
        bytes32 triggerTag; // tag of the most negative vetoing anchor feedback — E's request, tour 3
        // vetoCount counts anchors whose feedback is a veto; the status is VETOED iff vetoCount >= q
        uint256 trustLow; // lower bound used by the policy: trustRobust minus the widening eLow (WAD)
        uint256 distrustUp; // upper bound used by the policy: distrust + e (WAD)
        uint256 eLow; // widening of the lower bound by discrepancy proofs (WAD, D22/D36)
        bool trusted; // D39: status OK, veto checked, and the committed policy (theta, rho) holds
    }

    // ------------------------------------------------------------------ storage
    IIdentityRegistry8004 public immutable identity;
    IReputationRegistry8004 public immutable reputation;

    /// (setId, nodeKey) -> index + 1. Written once per node (append-only table, D11 reversed).
    mapping(bytes32 => mapping(bytes32 => uint256)) public nodeIndexPlus1;
    /// keccak(setId, certNonce, u) -> keccak(leaf, added edges) after omission proofs.
    mapping(bytes32 => bytes32) public rowState;

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
        uint32 numRows
    );
    event OmissionProven(bytes32 indexed setId, uint256 indexed node, uint256 indexed agentId, int256 weight, uint256 eEff);
    event RegistryChanged(bytes32 indexed setId, bytes32 certifiedVersionHash, bytes32 currentVersionHash);

    error BadParams(uint256 code);
    error AlreadyRegistered();
    error UnknownSet();
    error NodeExists(bytes32 key);
    error BadNodes();
    error BadNCert();
    error BadVectors();
    error BadRows(uint256 code);
    error BadEdge(uint256 row);
    error ValueTooLarge();
    error RegistryUnreadable();
    error ResidualTooLarge(uint256 eEff, uint256 eMax);
    error NotBetter(uint256 eNew, uint256 eCur);
    error NoCert();
    error BadProof(uint256 code);
    error NotSubmitter();

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
        }
        if (sum != WAD) revert BadParams(7);

        bytes32 prevHash;
        for (uint256 i; i < p.tags.length; ++i) {
            TagSpec calldata t = p.tags[i];
            bytes memory tb = bytes(t.tag);
            if (tb.length == 0 || tb.length > 32) revert BadParams(8);
            bytes32 h = keccak256(tb);
            if (i > 0 && h <= prevHash) revert BadParams(9);
            prevHash = h;
            if (!(t.min <= t.neutral && t.neutral <= t.max && t.min < t.max)) revert BadParams(10);
            if (t.kind > TAG_MEASUREMENT) revert BadParams(11);
            TagStored storage ts = s.tags[i];
            ts.name = bytes32(tb);
            ts.hash = h;
            ts.min = t.min;
            ts.neutral = t.neutral;
            ts.max = t.max;
            ts.kind = t.kind;
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
        if (q.registryVerified) revert BadParams(17); // TODO(E2): registry verification not implemented yet
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
        q.submitters = new address[](s.numSubmitters);
        for (uint256 i; i < q.submitters.length; ++i) {
            q.submitters[i] = s.submitters[i];
        }
    }

    // ================================================================== node table
    /// Permissionless append. Entry = kind u8 (1 agent | 2 address) + u32 agentId | 20-byte address.
    function addNodes(bytes32 setId, bytes calldata entries) external {
        SetState storage s = _set(setId);
        if (!s.registered) revert UnknownSet();
        _appendNodes(s, setId, entries);
    }

    /// Pre-writes the SENTINEL in vector slots so that a later certificate pays x->y (100 gas/slot)
    /// instead of 0->x (17 100). Lets a large first certificate be split across transactions.
    function reserveCapacity(bytes32 setId, uint32 uptoNodes) external {
        SetState storage s = _set(setId);
        if (!s.registered) revert UnknownSet();
        uint256 stride = uint256(s.k) + 2;
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
        while (off < len) {
            uint256 kind = uint8(entries[off]);
            bytes32 key;
            if (kind == KIND_AGENT) {
                if (off + 5 > len) revert BadNodes();
                key = agentKey(uint32(bytes4(entries[off + 1:off + 5])));
                off += 5;
            } else if (kind == KIND_ADDRESS) {
                if (off + 21 > len) revert BadNodes();
                key = addressKey(address(bytes20(entries[off + 1:off + 21])));
                off += 21;
            } else {
                revert BadNodes();
            }
            mapping(bytes32 => uint256) storage m = nodeIndexPlus1[setId];
            if (m[key] != 0) revert NodeExists(key);
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
        if (!s.registered) revert UnknownSet();
        if (s.numSubmitters != 0 && !_isSubmitter(s, msg.sender)) revert NotSubmitter();
        if (newNodes.length != 0) _appendNodes(s, setId, newNodes);
        uint256 k = s.k;
        uint256 n = nCert;
        if (n < s.nCert || n > s.nodeCount || n < k) revert BadNCert();
        if (vectors.length != n * (k + 1) * 8) revert BadVectors();

        (bool vok, bytes32 vh) = _versionHash();
        if (!vok) revert RegistryUnreadable();

        (uint256[] memory r, uint256[] memory d, bytes32 root, uint256 numRows, uint256 W) =
            _verifyPass(s, n, vectors, rows);

        uint256 eNew = _eEff(s, r, k);
        if (eNew > eMax) revert ResidualTooLarge(eNew, eMax);

        // replacement rule (AM-2.3): absent | stale | registry changed | at least as precise |
        // refresh window with slack (honest densification, relecture A sur D)
        if (s.certBlock != 0 && !s.registryChanged) {
            uint256 age = block.number - s.certBlock;
            uint256 eCur = s.eEff;
            bool ok = age > s.maxAge || eNew <= eCur || (age > s.minRefresh && eNew <= eCur + s.slackRefresh);
            if (!ok) revert NotBetter(eNew, eCur);
        }

        _storeVectors(s, setId, n, k, vectors, d);

        for (uint256 a; a < k; ++a) {
            s.r[a] = r[a];
        }
        s.eEff = eNew;
        s.graphRoot = root;
        s.vectorRoot = keccak256(vectors);
        s.versionHash = vh;
        s.certBlock = uint64(block.number);
        s.certNonce += 1;
        s.nCert = uint32(n);
        s.numRows = uint32(numRows);
        s.idxWidth = uint8(W);
        s.registryChanged = false;
        emit CertificateSubmitted(setId, uint64(block.number), eNew, root, s.vectorRoot, vh, uint32(n), uint32(numRows));
    }

    function _isSubmitter(SetState storage s, address who) internal view returns (bool) {
        uint256 ns = s.numSubmitters;
        for (uint256 i; i < ns; ++i) {
            if (s.submitters[i] == who) return true;
        }
        return false;
    }

    /// Dry run for certifiers (no state change): the residuals, eEff and graphRoot a submission would
    /// produce, so that a certifier knows e before paying the gas limit of a submission.
    function dryRun(bytes32 setId, uint32 nCert, bytes calldata vectors, bytes calldata rows)
        external
        view
        returns (uint256[] memory r, uint256 eEff, bytes32 graphRoot)
    {
        SetState storage s = _set(setId);
        if (!s.registered) revert UnknownSet();
        uint256 k = s.k;
        if (nCert < s.nCert || nCert > s.nodeCount || nCert < k) revert BadNCert();
        if (vectors.length != uint256(nCert) * (k + 1) * 8) revert BadVectors();
        (r,, graphRoot,,) = _verifyPass(s, nCert, vectors, rows);
        eEff = _eEff(s, r, k);
    }

    /// One pass over the rows. Returns residuals r[a], distrust d[j], graphRoot.
    function _verifyPass(SetState storage s, uint256 n, bytes calldata vectors, bytes calldata rows)
        internal
        view
        returns (uint256[] memory r, uint256[] memory d, bytes32 root, uint256 numRows, uint256 W)
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
        W = uint8(rows[0]);
        if (!(W == 2 || W == 4) || (W == 2 && n > 0xffff)) revert BadRows(1);
        numRows = uint32(bytes4(rows[1:5]));
        if (numRows > n) revert BadRows(2);

        uint256[] memory y = new uint256[](n * k); // y[a*n + j]
        d = new uint256[](n);
        bytes memory hasRow = new bytes(n);
        uint256[] memory num = new uint256[](k);
        bytes32[] memory leaves = new bytes32[](numRows);
        bytes memory scratch = new bytes(4 + 2 + 20 + ROW_MAX * 10);

        uint256 ePos = _rowLoop(
            RowCtx({
                n: n,
                k: k,
                W: W,
                aD: aD,
                om: om,
                rec: rec,
                vecOff: vecOff,
                off: 0,
                end: 0,
                numRows: numRows,
                ptrY: _dataPtr(y),
                ptrD: _dataPtr(d),
                ptrH: _bytesPtr(hasRow),
                ptrNum: _dataPtr(num),
                ptrLam: _dataPtr(lam),
                ptrLeaves: _dataPtr32(leaves),
                ptrScratch: _bytesPtr(scratch)
            }),
            rows
        );

        // residual per column: r[a] = sum_j |t_j - y_j| + E+ + 1 + sum_{j without row} ceil((1-alpha) t_j)
        r = new uint256[](k);
        uint256 alphaW = (uint256(s.alphaN) * WAD) / aD;
        for (uint256 a; a < k; ++a) {
            y[a * n + a] += alphaW;
            uint256 sum = ePos + 1; // floor slack: < 1 per positive edge, < 1 for the alpha term
            bool tooBig;
            assembly ("memory-safe") {
                let yp := add(add(y, 32), mul(mul(a, n), 32))
                let hp := add(hasRow, 32)
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
                    switch gt(t, yv)
                    case 1 { sum := add(sum, sub(t, yv)) }
                    default { sum := add(sum, sub(yv, t)) }
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
            if (tooBig) revert ValueTooLarge();
            r[a] = sum;
        }

        root = _merkleRoot(leaves, numRows);
    }

    struct RowCtx {
        uint256 n;
        uint256 k;
        uint256 W;
        uint256 aD;
        uint256 om;
        uint256 rec;
        uint256 vecOff;
        uint256 off;
        uint256 end;
        uint256 numRows;
        uint256 ptrY;
        uint256 ptrD;
        uint256 ptrH;
        uint256 ptrNum;
        uint256 ptrLam;
        uint256 ptrLeaves;
        uint256 ptrScratch;
    }

    /// The hot loop. Per row: (A) validation + budgets B+ / B-, (B) per-column factors,
    /// (C) scatter y[a][dst] += floor(t_u (1-a) w / B+) and d[dst] += ceil(T_u (1-a) |w| / B-),
    /// (D) leaf hash. Edge = [dst: W bytes][w: int16][feedbackIndex: u32]. Returns E+ (positive edges).
    /// Written as small Yul functions specialised for W = 2 / 4 and k = 1: the first version (one big block,
    /// Solidity-level per-row code) cost ~1.6x more (GAS.md, AM-R5.4).
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

            // ---- W = 4: dst = 32-bit index, edge = 10 bytes
            function validate4(eo, e, n, u) -> sP, sN, bad, cnt {
                let pp := 0
                for { let p := eo } lt(p, e) { p := add(p, 10) } {
                    let wd := calldataload(p)
                    let dst := shr(224, wd)
                    let w := signextend(1, and(shr(208, wd), 0xffff))
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
            function processRow(c_, ri, eo, e, u) -> cnt {
                let W := mload(add(c_, 0x40))
                let n := mload(c_)
                let sP, sN, bad
                switch W
                case 2 { sP, sN, bad, cnt := validate2(eo, e, n, u) }
                default { sP, sN, bad, cnt := validate4(eo, e, n, u) }
                if bad { failEdge(ri) }
                let hasNeg := gt(sN, 0)
                if lt(sP, 10000) { sP := 10000 }
                if lt(sN, 10000) { sN := 10000 }
                let k := mload(add(c_, 0x20))
                let ptrNum := mload(add(c_, 0x1a0))
                let any, numC := factors(
                    add(mload(add(c_, 0xc0)), mul(u, mload(add(c_, 0xa0)))), k, mload(add(c_, 0x80)), ptrNum,
                    mload(add(c_, 0x1c0))
                )
                let aD := mload(add(c_, 0x60))
                if any {
                    let denP := mul(aD, sP)
                    let cell0 := mload(add(c_, 0x140))
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
                        case 2 { scatterNeg2(eo, e, mload(add(c_, 0x160)), numC, mul(aD, sN)) }
                        default { scatterNeg4(eo, e, mload(add(c_, 0x160)), numC, mul(aD, sN)) }
                    }
                }
            }

            let W := mload(add(c, 0x40))
            let shU := sub(256, shl(3, W))
            let off := add(rows.offset, 5)
            let end := add(rows.offset, rows.length)
            let numRows := mload(add(c, 0x120))
            let prevU := 0
            for { let ri := 0 } lt(ri, numRows) { ri := add(ri, 1) } {
                let rowStart := off
                let wd := calldataload(off)
                let u := shr(shU, wd)
                let hdr := and(shr(sub(shU, 16), wd), 0xffff)
                if or(iszero(lt(u, mload(c))), and(gt(ri, 0), iszero(gt(u, prevU)))) { failRows(3) }
                prevU := u
                let nE := and(hdr, 0x7fff)
                if gt(nE, 256) { failRows(4) }
                off := add(off, add(W, 2))
                if and(hdr, 0x8000) { off := add(off, 20) }
                let eo := off
                off := add(off, mul(nE, add(W, 6)))
                if gt(off, end) { failRows(5) }
                mstore8(add(mload(add(c, 0x180)), u), 1)
                ePos := add(ePos, processRow(c, ri, eo, off, u))
                // (D) leaf = keccak256(row bytes)
                let len := sub(off, rowStart)
                let sp := mload(add(c, 0x200))
                calldatacopy(sp, rowStart, len)
                mstore(add(mload(add(c, 0x1e0)), shl(5, ri)), keccak256(sp, len))
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

    /// Chunk c holds nodes 4c..4c+3; slot(c, v) = base + c*(k+2) + v; v < k: t^(v), v = k: d, v = k+1: ownerFp.
    function _storeVectors(
        SetState storage s,
        bytes32 setId,
        uint256 n,
        uint256 k,
        bytes calldata vectors,
        uint256[] memory d
    ) internal {
        uint256 base = _vecBase(setId);
        uint256 rec = (k + 1) * 8;
        uint256 chunks = (n + 3) / 4;
        uint256 stride = k + 2;
        bool tooBig;
        assembly ("memory-safe") {
            let vo := vectors.offset
            let dp := add(d, 32)
            let full := shr(2, n) // chunks with 4 certified nodes
            let orAll := 0
            let sl := base
            let rp := vo // record of node 4c
            for { let c := 0 } lt(c, full) { c := add(c, 1) } {
                let r1 := add(rp, rec)
                let r2 := add(r1, rec)
                let r3 := add(r2, rec)
                // t columns, then ownerFp (column k of the record)
                for { let v := 0 } lt(v, k) { v := add(v, 1) } {
                    let o := shl(3, v)
                    let x0 := shr(192, calldataload(add(rp, o)))
                    let x1 := shr(192, calldataload(add(r1, o)))
                    let x2 := shr(192, calldataload(add(r2, o)))
                    let x3 := shr(192, calldataload(add(r3, o)))
                    orAll := or(orAll, or(or(x0, x1), or(x2, x3)))
                    sstore(add(sl, v), or(or(SENTINEL, or(x0, shl(64, x1))), or(shl(128, x2), shl(192, x3))))
                }
                {
                    let o := shl(3, k)
                    let x0 := shr(192, calldataload(add(rp, o)))
                    let x1 := shr(192, calldataload(add(r1, o)))
                    let x2 := shr(192, calldataload(add(r2, o)))
                    let x3 := shr(192, calldataload(add(r3, o)))
                    orAll := or(orAll, or(or(x0, x1), or(x2, x3)))
                    sstore(add(sl, add(k, 1)), or(or(SENTINEL, or(x0, shl(64, x1))), or(shl(128, x2), shl(192, x3))))
                }
                // distrust lanes (computed on-chain, capped)
                {
                    let q := add(dp, shl(7, c))
                    let d0 := mload(q)
                    let d1 := mload(add(q, 32))
                    let d2 := mload(add(q, 64))
                    let d3 := mload(add(q, 96))
                    if gt(d0, LANE_MASK) { d0 := LANE_MASK }
                    if gt(d1, LANE_MASK) { d1 := LANE_MASK }
                    if gt(d2, LANE_MASK) { d2 := LANE_MASK }
                    if gt(d3, LANE_MASK) { d3 := LANE_MASK }
                    sstore(add(sl, k), or(or(SENTINEL, or(d0, shl(64, d1))), or(shl(128, d2), shl(192, d3))))
                }
                sl := add(sl, stride)
                rp := add(r3, rec)
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
                                switch eq(v, k)
                                case 1 {
                                    x := mload(add(dp, shl(5, i)))
                                    if gt(x, LANE_MASK) { x := LANE_MASK }
                                }
                                default { x := shr(192, calldataload(add(vo, add(mul(i, rec), shl(3, k))))) }
                            }
                            orAll := or(orAll, x)
                            val := or(val, shl(shl(6, l), x))
                        }
                    }
                    sstore(add(sl, v), val)
                }
            }
            tooBig := gt(orAll, LANE_MASK)
        }
        if (tooBig) revert ValueTooLarge();
        if (chunks > s.reservedChunks) s.reservedChunks = uint32(chunks);
    }

    function _eEff(SetState storage s, uint256[] memory r, uint256 k) internal view returns (uint256 e) {
        uint256 aN = s.alphaN;
        uint256 aD = s.alphaD;
        for (uint256 a; a < k; ++a) {
            uint256 ea = (r[a] * aD + aN - 1) / aN; // e[a] = ceil(r[a] / alpha)
            uint256 l = s.anchors[a] >> 160;
            e += (l * ea + WAD - 1) / WAD;
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
    /// (theta, rho, m, q, maxAge, eLowMax, veto); status OK alone is not enough (an unknown agent is OK
    /// with trust 0).
    function isTrusted(uint256 agentId, bytes32 setId) external view returns (bool) {
        return assess(agentId, setId, true).trusted;
    }

    function assess(uint256 agentId, bytes32 setId, bool withVeto) public view returns (Assessment memory x) {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) {
            x.status = Status.NO_CERT;
            return x;
        }
        uint256 k = s.k;
        x.e = s.eEff;
        x.certBlock = s.certBlock;
        uint256 ownerFp;
        if (agentId < (1 << 248)) {
            uint256 ip1 = nodeIndexPlus1[setId][agentKey(agentId)];
            if (ip1 != 0 && ip1 <= s.nCert) {
                uint256 i = ip1 - 1;
                uint256 sb = _vecBase(setId) + (i >> 2) * (k + 2);
                uint256 sh = (i & 3) * 64;
                uint256[] memory c = new uint256[](k);
                for (uint256 a; a < k; ++a) {
                    uint256 t;
                    assembly ("memory-safe") {
                        t := and(shr(sh, sload(add(sb, a))), LANE_MASK)
                    }
                    c[a] = ((s.anchors[a] >> 160) * t) / WAD;
                    x.trust += c[a];
                }
                x.trustRobust = _leaveOut(c, s.minAnchors, x.trust);
                assembly ("memory-safe") {
                    let dv := and(shr(sh, sload(add(sb, k))), LANE_MASK)
                    mstore(add(x, 96), dv)
                    ownerFp := and(shr(sh, sload(add(sb, add(k, 1)))), LANE_MASK)
                }
            }
        }

        if (s.registryChanged) {
            x.status = Status.REGISTRY_CHANGED;
            return x;
        }
        if (block.number - s.certBlock > s.maxAge) {
            x.status = Status.STALE;
            return x;
        }
        if (withVeto) {
            int256 worst;
            for (uint256 a; a < k; ++a) {
                (bool ok, int256 w, bytes32 tag) = _registryEdge(s, address(uint160(s.anchors[a])), agentId);
                if (!ok) {
                    x.status = Status.REGISTRY_CHANGED; // unreadable registry: fail closed, never revert
                    return x;
                }
                if (w <= s.vetoMax) {
                    if (w < worst) {
                        worst = w;
                        x.triggerTag = tag;
                    }
                    x.vetoCount += 1;
                }
            }
            if (x.vetoCount >= s.vetoQuorum) {
                x.status = Status.VETOED;
                return x;
            }
        }
        if (ownerFp != 0) {
            (bool ok, uint256 o) = _staticWord(address(identity), abi.encodeCall(IIdentityRegistry8004.ownerOf, (agentId)));
            if (!ok || (o & LANE_MASK) != ownerFp) {
                x.status = Status.TRANSFERRED;
                return x;
            }
        }
        x.status = Status.OK;
        x.trustLow = x.trustRobust > x.e ? x.trustRobust - x.e : 0;
        x.distrustUp = x.distrust + x.e;
        x.trusted = withVeto && x.trustLow >= s.theta
            && uint256(s.rhoD) * x.distrustUp <= uint256(s.rhoN) * x.trustLow;
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

    // ================================================================== registry edge (D14/D15)
    /// Combined weight of the (client -> agentId) edge read from the registry:
    /// last non-revoked feedback per tag1 of the filter (endorsement tags only), values out of bounds
    /// rejected, then negative dominance: the most negative weight if any, else the largest.
    /// ok = false only if the registry could not be read (callers fail closed).
    function _registryEdge(SetState storage s, address client, uint256 agentId)
        internal
        view
        returns (bool ok, int256 w, bytes32 tag)
    {
        uint256 last;
        (ok, last) = _staticWord(address(reputation), abi.encodeCall(IReputationRegistry8004.getLastIndex, (agentId, client)));
        if (!ok || last == 0) return (ok, 0, 0);
        uint256 nt = s.numTags;
        uint256 allMask;
        for (uint256 i; i < nt; ++i) {
            if (s.tags[i].kind == TAG_ENDORSEMENT) allMask |= 1 << i;
        }
        uint256 seen;
        int256 minW;
        int256 maxW;
        bytes32 minTag;
        bytes32 maxTag;
        uint256 lo = last > MAX_SCAN ? last - MAX_SCAN + 1 : 1;
        for (uint256 idx = last; idx >= lo; --idx) {
            (bool rok, int256 value, uint256 dec, bytes32 th, bool revoked) = _readFb(agentId, client, uint64(idx));
            if (!rok) return (false, 0, 0);
            if (!revoked) {
                for (uint256 i; i < nt; ++i) {
                    uint256 bit = 1 << i;
                    if (allMask & bit == 0 || seen & bit != 0) continue;
                    TagStored storage ts = s.tags[i];
                    if (ts.hash != th) continue;
                    seen |= bit;
                    (bool valid, int256 wt) = _normalize(value, dec, ts);
                    if (valid) {
                        if (wt < minW) {
                            minW = wt;
                            minTag = ts.name;
                        }
                        if (wt > maxW) {
                            maxW = wt;
                            maxTag = ts.name;
                        }
                    }
                    break;
                }
                if (seen == allMask) break;
            }
            if (idx == 1) break;
        }
        if (minW < 0) return (true, minW, minTag);
        return (true, maxW, maxTag);
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

    function _readFb(uint256 agentId, address client, uint64 idx)
        internal
        view
        returns (bool ok, int256 value, uint256 dec, bytes32 tagHash, bool revoked)
    {
        bytes memory cd = abi.encodeCall(IReputationRegistry8004.readFeedback, (agentId, client, idx));
        address rep = address(reputation);
        assembly ("memory-safe") {
            let success := staticcall(VIEW_CALL_GAS, rep, add(cd, 32), mload(cd), 0, 0)
            let sz := returndatasize()
            if and(success, iszero(lt(sz, 160))) {
                let p := mload(0x40)
                returndatacopy(p, 0, sz)
                value := mload(p)
                dec := mload(add(p, 32))
                let o1 := mload(add(p, 64))
                revoked := iszero(iszero(mload(add(p, 128))))
                if lt(o1, sub(sz, 31)) {
                    let len := mload(add(p, o1))
                    if iszero(gt(len, sub(sub(sz, o1), 32))) {
                        tagHash := keccak256(add(add(p, o1), 32), len)
                        ok := 1
                    }
                }
                if iszero(eq(signextend(15, value), value)) { ok := 0 }
                if gt(dec, 255) { ok := 0 }
            }
        }
    }

    // ================================================================== discrepancy proofs (D6)
    /// Type (i) OMISSION: the committed row of node u lacks the edge (client_u -> agentJ) that the
    /// registry supports. Widens r[a] by ceil(t_u^(a) (1-alpha) Delta_u) where Delta_u is the exact L1
    /// distance between the committed row (B+/B- normalised) and the row with the edge added.
    /// @param rowPos     position of the row among the certificate's rows (Merkle leaf index)
    /// @param row        the committed row bytes (as in the certificate)
    /// @param proof      Merkle siblings to graphRoot (ignored if the row was already amended)
    /// @param added      edges added by previous proofs in this certificate: (u32 agentId, int16 w)*
    /// @param nodeKeyU   key of node u (its client address comes from the key, or from the row's
    ///                   wallet for an agent node)
    /// TODO(R5+): types (ii) STALE, (iii) REVOKED, (iv) WALLET; D16 former-owner rule (needs
    ///            Transfer history, not readable on-chain); rows of nodes absent from the table.
    struct OmissionCtx {
        uint256 u;
        address client;
        uint256 sumP;
        uint256 sumN;
        bytes32 sk;
        bytes32 leaf;
    }

    function proveOmission(
        bytes32 setId,
        uint256 rowPos,
        bytes calldata row,
        bytes32[] calldata proof,
        bytes calldata added,
        bytes32 nodeKeyU,
        uint256 agentJ
    ) external {
        SetState storage s = _set(setId);
        if (!s.registered || s.certBlock == 0) revert NoCert();
        OmissionCtx memory c = _omissionRow(s, setId, rowPos, row, proof, added, nodeKeyU, agentJ);

        // D16 rejection rules readable on-chain: controllers and agentWallet of j cannot create edges
        if (identity.isAuthorizedOrOwner(c.client, agentJ)) revert BadProof(10);
        if (identity.getAgentWallet(agentJ) == c.client) revert BadProof(11);

        (bool ok, int256 w,) = _registryEdge(s, c.client, agentJ);
        if (!ok) revert RegistryUnreadable();
        if (w == 0) revert BadProof(12);

        uint256 eNew = _widen(s, setId, c, w);
        rowState[c.sk] = keccak256(abi.encodePacked(c.leaf, added, uint32(agentJ), int16(w)));
        emit OmissionProven(setId, c.u, agentJ, w, eNew);
    }

    function _omissionRow(
        SetState storage s,
        bytes32 setId,
        uint256 rowPos,
        bytes calldata row,
        bytes32[] calldata proof,
        bytes calldata added,
        bytes32 nodeKeyU,
        uint256 agentJ
    ) internal view returns (OmissionCtx memory c) {
        uint256 W = s.idxWidth;
        if (row.length < W + 2) revert BadProof(0);
        uint256 u;
        uint256 hdr;
        assembly ("memory-safe") {
            let wd := calldataload(row.offset)
            u := shr(sub(256, mul(W, 8)), wd)
            hdr := and(shr(sub(256, mul(add(W, 2), 8)), wd), 0xffff)
        }
        c.u = u;
        uint256 nE = hdr & 0x7fff;
        bool hasWallet = hdr & 0x8000 != 0;
        uint256 edgesOff = W + 2 + (hasWallet ? 20 : 0);
        if (row.length != edgesOff + nE * (W + 6)) revert BadProof(1);
        if (nodeIndexPlus1[setId][nodeKeyU] != u + 1) revert BadProof(2);

        // row authenticity: graphRoot, or the amended state of this row in this certificate
        c.leaf = keccak256(row);
        c.sk = keccak256(abi.encode(setId, s.certNonce, u));
        bytes32 cur = rowState[c.sk];
        if (cur == 0) {
            if (added.length != 0) revert BadProof(3);
            if (!_verifyMerkle(c.leaf, rowPos, s.numRows, proof, s.graphRoot)) revert BadProof(4);
        } else if (keccak256(abi.encodePacked(c.leaf, added)) != cur) {
            revert BadProof(5);
        }
        if (added.length % 6 != 0) revert BadProof(6);

        // client address of node u
        if (uint256(nodeKeyU) >> 248 == KIND_AGENT) {
            if (!hasWallet) revert BadProof(7);
            c.client = address(bytes20(row[W + 2:W + 22]));
        } else {
            c.client = address(uint160(uint256(nodeKeyU)));
        }

        // the edge must be absent from the committed row and from previous amendments
        uint256 jp1 = agentJ < (1 << 248) ? nodeIndexPlus1[setId][agentKey(agentJ)] : 0;
        (c.sumP, c.sumN) = _rowSums(row, edgesOff, nE, W, jp1);
        for (uint256 o; o < added.length; o += 6) {
            if (uint32(bytes4(added[o:o + 4])) == agentJ) revert BadProof(9);
            int256 aw = int16(uint16(bytes2(added[o + 4:o + 6])));
            if (aw > 0) c.sumP += uint256(aw);
            else c.sumN += uint256(-aw);
        }
    }

    /// Delta = |w|/B' + S (B' - B) / (B B') on the side (+ or -) that changes;
    /// r[a] += ceil(t_u^(a) (1 - alpha) Delta).
    function _widen(SetState storage s, bytes32 setId, OmissionCtx memory c, int256 w) internal returns (uint256 eNew) {
        uint256 aw = uint256(w > 0 ? w : -w);
        uint256 S = w > 0 ? c.sumP : c.sumN;
        uint256 B = S > uint256(GRID) ? S : uint256(GRID);
        uint256 B2 = S + aw > uint256(GRID) ? S + aw : uint256(GRID);
        uint256 dNum = aw * B + S * (B2 - B);
        uint256 den = uint256(s.alphaD) * B * B2;
        uint256 k = s.k;
        uint256 om = uint256(s.alphaD) - s.alphaN;
        uint256 sb = _vecBase(setId) + (c.u >> 2) * (k + 2);
        uint256 sh = (c.u & 3) * 64;
        uint256[] memory r = new uint256[](k);
        for (uint256 a; a < k; ++a) {
            uint256 t;
            assembly ("memory-safe") {
                t := and(shr(sh, sload(add(sb, a))), LANE_MASK)
            }
            r[a] = s.r[a] + (t * om * dNum + den - 1) / den;
            s.r[a] = r[a];
        }
        eNew = _eEff(s, r, k);
        s.eEff = eNew;
    }

    function _rowSums(bytes calldata row, uint256 edgesOff, uint256 nE, uint256 W, uint256 jp1)
        internal
        pure
        returns (uint256 sumP, uint256 sumN)
    {
        uint256 esz = W + 6;
        for (uint256 e; e < nE; ++e) {
            uint256 o = edgesOff + e * esz;
            uint256 dst = W == 2 ? uint16(bytes2(row[o:o + 2])) : uint32(bytes4(row[o:o + 4]));
            if (jp1 != 0 && dst == jp1 - 1) revert BadProof(8);
            int256 w = int16(uint16(bytes2(row[o + W:o + W + 2])));
            if (w > 0) sumP += uint256(w);
            else sumN += uint256(-w);
        }
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
            bytes32 graphRoot,
            bytes32 vectorRoot,
            bytes32 versionHash,
            uint32 nCert,
            uint32 numRows,
            bool registryChanged
        )
    {
        SetState storage s = _set(setId);
        return (s.certBlock, s.eEff, s.graphRoot, s.vectorRoot, s.versionHash, s.nCert, s.numRows, s.registryChanged);
    }

    function residual(bytes32 setId, uint256 a) external view returns (uint256) {
        return _set(setId).r[a];
    }

    /// raw lane read: v < k -> t^(v), v = k -> distrust, v = k+1 -> owner fingerprint
    function vectorAt(bytes32 setId, uint256 i, uint256 v) external view returns (uint256 x) {
        SetState storage s = _set(setId);
        uint256 sl = _vecBase(setId) + (i >> 2) * (uint256(s.k) + 2) + v;
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

    function _vecBase(bytes32 setId) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(VEC_DOMAIN, setId))) & ~uint256(127);
    }

    /// owner fingerprint committed in the vector (63 low bits of the owner address, D10)
    function ownerFingerprint(address owner) public pure returns (uint64) {
        return uint64(uint160(owner) & LANE_MASK);
    }
}

# ENCODING — `ancre-cert-v1` (unified), interface between the solver and `AnchoredReputation.sol`

> **Unified v1 format, 2026-10-01** (integration session 02 + 04, branch `chantier/integration-02-04`). It replaces the two
> "v1" formats written in parallel on 28/09: `contracts/ENCODING.md` v1 (chantier 02) and `solver/FORMAT.md` v1 (chantier 04).
> **This file is the single normative source for the binary layout, the integer arithmetic, the replacement rule and the
> proofs.** `solver/FORMAT.md` holds the graph rules R1-R8 (what an edge is), the JSON vector fields and the solver
> policy, and refers here for everything else. Source of truth: `src/AnchoredReputation.sol`; test-side mirror:
> `test/utils/CertLib.sol`; solver-side mirror: `solver/export.py` + `solver/ppr.py`.
> Every arbitration below is justified in `docs/chantiers/rapports/integration.md` §1.
> Big-endian everywhere. `WAD = 1e18`. `GRID = 10 000` (weight grid of 1e-4).

## 0. What changed from the two 28/09 drafts

| # | Point | 02 draft | 04 draft | **Unified** |
|---|---|---|---|---|
| F-1 | declared positive budget | `bPlus` = max(10 000, true Σw⁺) | `sPlus` = true Σw⁺ | **`sPlus` = true Σw⁺**, B⁺ = max(GRID, sPlus) (§3.2) |
| F-2 | header bits | 0x8000 wallet, 0x4000 B⁺, 0x2000 alias, nE 13 bits | 0x8000 SRC, 0x4000 ALIAS, 0x2000 VIA_OWNER, 0x1000 SPLUS, nE 12 bits | **0x8000 SRC, 0x4000 SPLUS, 0x2000 ALIAS, 0x1000 VIA_OWNER, nE 12 bits** |
| F-3 | alias row | `u ‖ hdr ‖ wallet ‖ src` | `u ‖ hdr ‖ ref` | **`u ‖ hdr ‖ src:20 ‖ ref:W`** (the source is repeated and checked) |
| F-4 | owner fallback D44 | not implemented | VIA_OWNER behind a flag | **VIA_OWNER**, allowed only if the set commits `policy.ownerFallback = true` |
| F-5 | agent row without source | refused | allowed if empty | **allowed if empty** (agentWallet = 0, no fallback); challengeable by `proveWallet` |
| F-6 | tie between tags of equal weight | highest `feedbackIndex` | tag1 code-point order | **highest `feedbackIndex`** (the contract only stores tag hashes) |
| F-7 | tags > 32 bytes (AM-04.2) | refused | needed | **any non-empty length**; only `keccak256(tag)` is stored |
| F-8 | vectors | `setId` with policy (own generator) | no policy, no `setId` | **every vector carries `set.policy` and `set.setId`** (solver/FORMAT.md §1) |
| — | replacement rule (AM-04.1) | eUp + eLow, strict | — | **quality (q, mass)**, §5 |

## 0bis. Lot 02-bis (2026-10-06, D48): what changed — INTERFACE

| # | Point | Before (01/10) | **02-bis** |
|---|---|---|---|
| G-1 | read function | `isTrusted(agentId, setId)`, `Assessment.trusted` | **`passesAnchorPolicy(agentId, setId)`, `Assessment.passesPolicy`** (AM-9.5) |
| G-2 | anchor as a source (AM-08.A) | allowed | **`AnchorAsSource(u)`**: no row with SRC ∈ anchors (wallet or VIA_OWNER owner), both levels (§3.2) |
| G-3 | controller edge rule (AM-08.B) | rejected whatever the sign | **w > 0 rejected, w < 0 KEPT** (§3.4); approved / operator anchor = veto (§6, `proveApproval` §7.4) |
| G-4 | proven row resubmitted (AM-08.C, R2) | raw (vectorRoot, graphRoot) equality, open sets only, skipped under REGISTRY_CHANGED | **`ProvenRowResubmitted(u)`**: `provenFalse[setId][rowHash]` on the DECODED row, both levels, every state (§3.5) |
| G-5 | canonical form (R4) | SRC bit tested by value; SPLUS ≥ S⁺ | **`NotCanonical(row)`**: SRC ⇒ src ≠ 0; SPLUS ⇒ sPlus > S⁺ (strict); alias ⇒ `ref` is an agent row |
| G-6 | node table (R1) | `address(0)` node accepted | **refused (`BadNodes`)**; the second pass must end where the first ended (`BadRows(6)`) |
| G-7 | anchor fingerprint (R5) | unchecked | **`ownerFp = 0` for anchors, both levels** (`EdgeMismatch(2^256−1, a)`); `dryRun` runs every check without registry reads |
| G-8 | registry failures (R6) | a revert = a burnt agent | **only `ERC721NonexistentToken(uint256)` means "does not exist"**; any other failure: proofs revert `RegistryUnreadable`, `assess` returns `REGISTRY_CHANGED` |
| G-9 | strict transfer (R7) | live `ownerOf` iff trust ≠ 0 | **iff some t^(a) > 0** (mass) |
| G-10 | proof amounts (R3) | incremental, budget floor max(GRID, sPlus) kept | **cumulative bounds against the committed row**, budget follows the committed edges (§7.1) |
| G-11 | submission path (AM-03.3) | — | **`submitCertificate` MUST be called directly by an EOA** (no relay, multicall or Safe): the indexer audits certificates from the transaction calldata (no traces on Monad) |

The solver mirrors G-2, G-3 and G-5 (04-bis: R6 for w < 0, rows of anchors-as-sources dropped); the indexer (`edges.ts`) and the ERC (§3.3) take G-3. Joint vectors: `solver/vectors/common/*.json`, replayed by `test/CommonVectors.t.sol`.

## 1. Anchor set (`registerAnchorSet`, once, immutable)

```
setId = keccak256(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy))
  anchors  address[]  strictly increasing, 1..K_MAX = 16. Anchor a is node a (indices 0..k-1).
  lambdas  uint64[]   WAD, none zero, sum = 1e18 exactly
  alphaN/alphaD uint32  0 < alphaN < alphaD (D2/D24: RECOMMENDED 1/3)
  tagSchemaHash bytes32  hash of the full off-chain schema (D12)
  tags     TagSpec[]  1..TAGS_MAX = 16 (D24), sorted by keccak256(tag) strictly increasing
           TagSpec = (string tag, int128 min, int128 neutral, int128 max, uint8 kind)
           tag: ANY non-empty length (unified v1, AM-04.2: "requester_rating:knowledge_access" is 33 bytes)
           bounds in WAD; min <= neutral <= max, min < max; kind 0 = endorsement, 1 = measurement
  policy   Policy (tuple, in this order):
           uint64  theta            WAD, > 0            trustLow >= theta
           uint32  rhoN, uint32 rhoD  rhoN, rhoD > 0    rhoD * distrustUp <= rhoN * trustLow
           uint8   minAnchors       m, 1 <= m <= k      leave-one-out (D8)
           uint8   vetoQuorum       q, 1 <= q <= k      VETOED iff >= q anchors veto
           int16   vetoMax          [-10 000, -1]       grid weight <= vetoMax => veto (D21/D33)
           uint64  maxAge           blocks, > 0
           uint64  minRefresh       blocks              replacement rule (§5)
           uint64  slackRefresh     WAD                 replacement rule (§5)
           uint64  eLowMax          WAD                 widening budget of the lower bound (D36)
           bool    strictTransfer   D35: live ownerOf in assess (true recommended)
           bool    registryVerified D32: every committed edge re-read in the registry at submission
           bool    ownerFallback    D44: agents with agentWallet = 0 emit their owner's row (VIA_OWNER rows).
                                    Part of the edge rule, hence of the setId. Default false (Hugo's decision).
           address[] submitters     D32: <= 8, strictly increasing, non-zero; empty = open, requires registryVerified
```
ABI: standard `abi.encode`. Python (no web3 needed): `solver/export.py::set_id` (hand-written ABI encoder, checked
against `computeSetId` on chain by `simulate.py` and `test/SolverVectors.t.sol`). Type string:
`(address[],uint64[],uint32,uint32,bytes32,(string,int128,int128,int128,uint8)[],(uint64,uint32,uint32,uint8,uint8,int16,uint64,uint64,uint64,uint64,bool,bool,bool,address[]))`.
`policyOf(setId)` returns the committed policy. Demo anchors are plain addresses (no D9/D43 pre-rotation yet).

## 2. Node table (append-only)

Node key (bytes32): `kind << 248 | value`, `kind` = 1 agent (agentId), 2 address, 3 anchor. Stable index, written once.
`newNodes` (argument of `submitCertificate`) and `addNodes(setId, entries)`: entries `0x01 ‖ agentId:u32` or
`0x02 ‖ address:20` (**`address(0)` is refused**, R1: client 0 marks a source-less row). Canonical order of a first certificate: anchors, agents by increasing agentId, addresses increasing
(solver/FORMAT.md §0). Later nodes are appended at the end. Submitter-attested sets: only listed submitters append.

## 3. `submitCertificate(setId, nCert:u32, eMax:u256, newNodes, vectors, rows)`

- Certified nodes: `[0, nCert)`, `nCert` non-decreasing across certificates, `k <= nCert <= nodeCount`.
- `eMax`: reverts `ResidualTooLarge(eEff, eMax)` if the recomputed eEff exceeds it. `dryRun(setId, nCert, vectors, rows)`
  (view) returns eUp per column, eEff and graphRoot without reading the registry.

### 3.1 `vectors` — `nCert × (k+1) × 8` bytes
```
for i in [0, nCert): t_i^(0):u64 ‖ … ‖ t_i^(k-1):u64 ‖ ownerFp_i:u64
```
- `t` in WAD, each `< 2^63` (`ValueTooLarge`). **Sub-solution (D26)**: `t_i^(a) <= y_i^(a)` for every i, a
  (`NotSubSolution(a, i)`). The solver MUST iterate from 0 with the arithmetic of §4 (lemma L3).
- `ownerFp_i = uint160(ownerOf(agentId)) & (2^63 − 1)` for an agent node; 0 for other nodes. In strict mode an agent of
  mass > 0 with a wrong or zero fingerprint is `TRANSFERRED`. Registry-verified checks it for every agent of mass > 0
  and every address node; **anchors (i < k) MUST carry 0 at both levels** (02-bis, R5). The fingerprint of an agent
  without mass is not checked and has no effect (no reader uses it: G-9).
- `vectorRoot = keccak256(vectors)`.

### 3.2 `rows`
```
rows  = W:u8 ‖ numRows:u32 ‖ row*                      W = 2 if nCert <= 65 535, else 4
row   = u:W ‖ hdr:u16 ‖ [src:20] ‖ [sPlus:u32] ‖ [ref:W] ‖ edge*nE
hdr   = nE                (bits 0..11, nE <= ROW_MAX = 256)
      | 0x8000 SRC        source client present (agent rows only)
      | 0x4000 SPLUS      declared TRUE positive sum present (D32)
      | 0x2000 ALIAS      copy of the earlier row `ref` (D20): nE = 0, no SPLUS, SRC required
      | 0x1000 VIA_OWNER  the source is ownerOf(u), agentWallet(u) = 0 (D44): SRC required, set with ownerFallback only
edge  = dst:W ‖ w:int16 ‖ feedbackIndex:u32            (8 bytes if W = 2, 10 if W = 4)
```
Checked at every submission (revert otherwise):
- rows by strictly increasing `u`, `u < nCert`, `numRows <= nCert`, exact end of buffer (`BadRows(3..6)`);
- in a row: `dst < nCert`, `dst != u`, `dst` strictly increasing, `w != 0`, `|w| <= 10 000` (`BadEdge(row)`);
- **SPLUS**: `sPlus >= max(1, Σ committed w⁺)` (`BadRows(7)`), and **`sPlus > Σ committed w⁺`** (`NotCanonical(row)`,
  02-bis: an SPLUS equal to the committed sum is the same row as no SPLUS);
- **SRC**: the bit carries a non-zero address (`NotCanonical(row)`), and **that address is never an anchor of the set**
  (`AnchorAsSource(u)`, D48-A: the row would be the anchor's row spread with u's mass in the OTHER columns, which
  voids the leave-one-out m ≥ 2). This covers the wallet and the VIA_OWNER owner, and aliases (same SRC as `ref`).
  An agent whose source is an anchor emits no row (it is absorbing and pays the truncation margin);
- **ALIAS**: `ref < u`, row `ref` already emitted and not an alias (`BadRows(9)`), `ref` is an agent row
  (`NotCanonical(row)`, R4), `u >= k`, both rows carry SRC and
  it is the same address (`BadRows(10)`), `nE = 0` and no SPLUS (`BadRows(8)`). The alias inherits the edges and the
  sPlus of `ref` and spreads them with **its own mass** t_u; each copy counts its positive edges in E⁺. Its own
  VIA_OWNER bit says how agent u resolves to that source (it may differ from `ref`'s).
- **Shape, at both levels** (otherwise some row or edge could never be challenged, `EdgeMismatch(row, 256)`):
  every target is an agent node (an ERC-8004 feedback targets an agent); an anchor or address row carries neither SRC
  nor VIA_OWNER; an agent row is either (a) SRC without VIA_OWNER, (b) SRC with VIA_OWNER on an `ownerFallback` set,
  or (c) **without SRC: empty (nE = 0, no SPLUS, not an alias), on a set without ownerFallback** (src(u) = none).

Semantics (normative, solver/FORMAT.md §0 for the full edge rules R1-R8):
- **An edge is the D14 combination of the feedback of the row's client on agent dst over the WHOLE history of the
  pair**: per endorsement tag of the filter, the non-revoked feedback of highest index; out of bounds ⇒ that tag gives
  nothing (no fallback); then `w = min` if some weight < 0, else `max`; `w = 0` ⇒ no edge.
- **`feedbackIndex`** = index of the feedback that gives `w`. **Ties between tags of equal weight: the HIGHEST
  feedbackIndex** (unified v1, F-6). `decidingTag` is the tag1 of that feedback.
- **Client of a row** (R7): anchor row → the anchor address; address row → the node's address; agent row → SRC, which
  MUST be `agentWallet(u)` (VIA_OWNER clear) or `ownerOf(u)` with `agentWallet(u) = 0` (VIA_OWNER set). **The wallet
  always wins.** An agent row without SRC has no client (src(u) = none) and MUST be empty.
- **Every agent node with mass that has a source carries its row, even empty** (an empty row with SRC stays
  challengeable by omission). A massive absorbing node MUST be provided with an (empty) row, otherwise it pays the
  truncation margin. A row of a zero-mass node SHOULD NOT be provided (it only adds its edges to E⁺).
- **sPlus (D32)**: the TRUE positive sum of the full row (all pair edges of the client, before any omission). Absent ⇒
  sPlus = committed Σw⁺. B⁺ = max(GRID, sPlus). A certifier MAY omit POSITIVE edges of a row (ROW_MAX, expensive pairs)
  if it declares sPlus: the remaining edges keep their true normalised weight (no dilution) and the omitted mass
  (sPlus − S⁺)/B⁺ goes into the margin of eUp. **An under-declared sPlus is undetectable at submission at both levels**
  (no per-client index) and provable by `proveEdge` (dilution).
- **Negative edges are never omitted** (nothing declares the negative sum: an omitted negative makes distrustUp
  unsound). It is a provable fault (`proveEdge`, eUp widened), not an honest option. A row with more than ROW_MAX
  negative edges cannot be certified honestly. **Anchor rows are never truncated** (D21).
- **Certified veto bit**: every edge of an anchor row (u = a < k) of weight <= vetoMax sets bit a of the target's veto
  mask (complement of D33; restored by `proveEdge` if omitted, V13).

### 3.3 `graphRoot`
Leaf = `keccak256(row bytes, from u to its last byte)` (optional fields included: for an alias, `u ‖ hdr ‖ src ‖ ref`).
Pairwise `keccak256(left ‖ right)`; an odd last element goes up unchanged; 0 if no row.

### 3.4 Registry-verified (D32): what the contract re-reads

| Object | Read | Refusal |
|---|---|---|
| agent row, SRC without VIA_OWNER (alias included) | `getAgentWallet(u) == SRC` | `EdgeMismatch(row, 256)` |
| agent row, VIA_OWNER | `getAgentWallet(u) == 0 && ownerOf(u) == SRC` | `EdgeMismatch(row, 256)` |
| agent row without SRC | `getAgentWallet(u) == 0` | `EdgeMismatch(row, 256)` |
| each edge of a non-alias row | target is agent j (it exists: `isAuthorizedOrOwner` does not revert `ERC721NonexistentToken`); `(w, feedbackIndex)` = D14 combination re-read (`getLastIndex`, then `readFeedback` from the highest index down until every endorsement tag of the filter has been seen); **if w > 0**: `isAuthorizedOrOwner(client, j)` false and `getAgentWallet(j) != client` (D48-B: a current controller's NEGATIVE edge is kept) | `EdgeMismatch(row, rank)` |
| each agent of mass > 0 | `ownerFp == ownerOf(j) & (2^63−1)`; 0 for other nodes | `EdgeMismatch(2^256−1, node)` |

Not checkable (no per-client index): that a row is complete, and that a declared sPlus is the true sum.

The contract parses the rows twice (the arithmetic pass, then this one); the second pass MUST end exactly at the end of
`rows` (`BadRows(6)`, R1).

### 3.5 Proven rows (D48-C)

```
content(row) = keccak256( client:32 ‖ sPlus:32 (0 if absent) ‖ for each edge: (dst << 16 | uint16(w)):32 )
               (an alias has the content of its ref; the feedbackIndex is NOT included, W does not matter)
rowHash(u, hdr, content) = keccak256(abi.encode(u, VIA_OWNER bit of hdr, content))      (public: rowHash)
```
`proveEdge` and `proveWallet` set `provenFalse[setId][rowHash]` (public mapping) for the row they prove. Every later
submission to the set, at both levels and whatever its state (REGISTRY_CHANGED included), reverts
`ProvenRowResubmitted(u)` if one of its rows has a proven hash. The lookups are skipped while no row of the set was
ever proven (`provenRows = 0`): an honest set never pays them. The decoded form makes re-encoding useless (another W,
another feedbackIndex, an alias instead of a copy, other vectors, other rows elsewhere). Known limit (AM-02bis.3): a row
proven false that becomes true again (a revocation resurrects the older feedback) cannot be recommitted identically in
this set; the certifier drops the row (truncation margin) or, if it has positive edges, declares an sPlus.

## 4. Exact integer arithmetic (what the contract recomputes)
```
om      = alphaD − alphaN
B⁺_u    = max(10 000, sPlus_u)  (sPlus_u = declared, else committed Σ_{w>0} w)      B⁻_u = max(10 000, Σ_{w<0} |w|)  (D7)
y_v^(a) = [v = a]·⌊alphaN·WAD / alphaD⌋ + Σ_{rows u (aliases included), w_uv > 0} ⌊ t_u^(a)·om·w_uv / (alphaD·B⁺_u) ⌋
REQUIRE : t_v^(a) <= y_v^(a) for every v < nCert and every a                          (D26, NotSubSolution)
r_a     = Σ_v (y_v^(a) − t_v^(a))  +  E⁺ + 1
          + Σ_{v without row, t_v^(a) != 0} ⌈ t_v^(a)·om / alphaD ⌉                                (truncation)
          + Σ_{rows u with sPlus_u > S⁺_u, t_u^(a) != 0} ⌈ t_u^(a)·om·(sPlus_u − S⁺_u) / (alphaD·B⁺_u) ⌉   (declared omission)
          (E⁺ = positive edges of all provided rows, alias rows counted with their inherited edges)
eUp_a   = ⌈ r_a·alphaD / alphaN ⌉        ⇒ ‖t*^(a) − t^(a)‖₁ <= eUp_a                   (L5; t <= t* by L2)
q_a     = ⌈ (r_a − E⁺ − 1)·alphaD / alphaN ⌉   (eUp without its rounding floor: replacement rule only, §5)
eEff    = Σ_a ⌈ λ_a·eUp_a / WAD ⌉       qEff = Σ_a ⌈ λ_a·q_a / WAD ⌉       mass = Σ_a ⌊ λ_a·Σ_v t_v^(a) / WAD ⌋
eLow_a  = 0 at submission, widened by proofs (§7)     eLowEff = Σ_a ⌈ λ_a·eLow_a / WAD ⌉
T_u     = ⌈ Σ_a λ_a·t_u^(a) / WAD ⌉
d_v     = Σ_{rows u, w_uv < 0} ⌈ T_u·om·|w_uv| / (alphaD·B⁻_u) ⌉                             (D4, rounded up)
reading: c_a = ⌊λ_a·t^(a)/WAD⌋ ; trustRobust = Σ c_a − (m−1 largest c_a) ;
         trustLow = trustRobust − eLowEff ; distrustUp = d + eEff
passesAnchorPolicy ⇔ status OK ∧ veto checked ∧ trustLow >= θ ∧ ρD·distrustUp <= ρN·trustLow
```
Rounding: every term of y DOWN (error < 1 wei per term, counted in `E⁺ + 1`); margins, eUp, q, eEff, eLow, T, d UP;
c_a and mass DOWN. Proof sketch: `t <= y <= F_committed(t)` and F is monotone, so t <= t*_committed (L1, L2); if
C_committed <= C_true entry by entry (domination, D32), t*_committed <= t*_true. eUp: `contracts/PROOFS.md` L5.

Normalisation of a feedback (veto, re-read, proofs and solver, = `graph.quantize`):
```
x = value · 10^(18 − valueDecimals)       (exact in int256; valueDecimals > 18 ⇒ rejected)
x ∉ [min, max] ⇒ rejected (never clamped)
x > neutral ⇒ w =  trunc((x − neutral)·10 000 / (max − neutral))
x < neutral ⇒ w = −trunc((neutral − x)·10 000 / (neutral − min))
x = neutral ⇒ w = 0
```

## 5. Replacement rule (unified v1, AM-04.1, AM-5.16, AM-02.2)

Submitter-attested sets: a listed submitter always replaces (D27). Open (Registry-verified) sets: a new certificate is
accepted iff
```
REFUSED first (02-bis, §3.5, before this rule and under every state): any row of the newcomer already proven false
         (this replaces the raw-root comparison of 01/10, which re-encoding and REGISTRY_CHANGED bypassed: AM-08.16, R2)
then accepted iff:
no certificate | registryChanged | age > maxAge | eLowEff_cur > eLowMax
| ( mass_new + eLowEff_cur >= mass_cur  AND  qEff_new <= q_cur  AND  D_new >= D_cur )   at least as good on every side
| ( age > minRefresh                    AND  qEff_new <= q_cur + slackRefresh )        refresh window
with q_cur = eEff_cur − eFloor_cur + eLowEff_cur,   eFloor = eEff − qEff at submission (stored),
     D = Σ_v d_v (distrust mass: an omitted negative edge changes neither mass nor q, but lowers D)
```
otherwise `NotBetter(qNew, qCur, massNew, massCur)`. `quality(setId)` returns (mass, q_cur, D, proven). Why (details in the integration report §2):
- comparing eUp itself (the 28/09 rule) blocked every honest update of a growing graph (each new positive edge adds
  one wei of floor slack to r) and **rewarded censorship**: fewer edges = smaller E⁺ = smaller eUp;
- for two valid sub-solutions of the same graph, `‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁`: **more mass is more precise** on the
  trust side, and a certificate that omits endorsements loses mass. A proven overstatement of the incumbent (eLow) is
  credited to the newcomer;
- `q` keeps the distrust side honest: a certificate that truncates massive rows (huge margin) is refused even with the
  same mass;
- AM-5.16: a zero vector has q ≈ 1 WAD: it never replaces a live certificate, and any honest one replaces it at once;
- D keeps the negative edges and the certified vetoes: a forgiven slash (lower D) waits for the window;
- the refresh window lets an unproven decrease (revocation) through after `minRefresh`; `minRefresh = maxAge`
  disables it (censorship resistance first). A certificate that slipped through it is re-replaced by the honest one
  at once (more mass, same q); Dilution (under-declared sPlus) still passes: AM-02.2, only a watcher
  with `proveEdge` closes it.

## 6. Storage (MIP-8) and reading

- Set state: one page-aligned struct (`keccak("ANCRE.set.v1", setId) & ~127`), 84 slots in one page (tags store
  `keccak256(tag)` and bounds only: 3 slots per tag). Column bounds (eUp, eLow) in a second page
  (`keccak("ANCRE.col.v1", setId) & ~127`), read by submissions and proofs only.
- Contiguous node keys: `slot(keccak("ANCRE.key.v1", setId) & ~127) + i` = key of node i.
- Vectors: base `keccak("ANCRE.vec.v1", setId) & ~127`. **Chunk c** = nodes `4c..4c+3`; `slot(c, v) = base + c·(k+3) + v`,
  v < k: t^(v), v = k: d, v = k+1: ownerFp, v = k+2: flags (bits 0..15 certified veto mask, bit 16 transfer proven).
  Lane `l` = bits `[64l, 64l+64)`. Bit 255 always set (sentinel). `reserveCapacity(setId, uptoNodes)` pre-writes it.
- **Live veto (D33)**: for each anchor, `getLastIndex(j, anchor)` then ONE `readFeedback`; veto iff not revoked, tag
  endorsement in the filter, weight <= vetoMax. `vetoCount` = anchors whose veto holds (live OR certified bit);
  `VETOED` iff `vetoCount >= q`. `Assessment.triggerTag` = **keccak256(tag1)** of the most negative live veto.
- **Veto by approval (D48-B)**, strict mode: an anchor that is `getApproved(j)` or `isApprovedForAll(ownerOf(j), anchor)`
  cannot post on j (the registry forbids a controller's feedback): it counts as that anchor's veto. Read only for the
  anchors that do not already veto (one `getApproved`, one `ownerOf`, at most k `isApprovedForAll`). Fast mode: posted by
  `proveApproval` (§7.4). `triggerTag` stays that of the live feedback veto (0 if none).
- **Transfer (D35)**: strict = live `ownerOf` for an agent of mass > 0 (some t^(a) > 0, R7); both modes: proven bit ⇒
  `TRANSFERRED`. `ERC721NonexistentToken` ⇒ `TRANSFERRED`; any other registry failure ⇒ `REGISTRY_CHANGED` (R6).

## 7. Discrepancy proofs — `proveEdge`, `proveWallet`, `proveTransfer`

Permissionless, the prover pays; on the current certificate (`certNonce`).

### 7.1 `proveEdge(setId, r, src, amends, agentJ)` — every edge-level discrepancy
- `r = (pos, row, path)`: the committed row of u and its Merkle path (ignored once amended: `rowState.h =
  keccak(leaf ‖ amends)` holds). `src`: for an alias, the committed source row (path required). `amends`:
  `(agentId:u32 ‖ wCommitted:int16 ‖ wNow:int16)*`.
- The contract re-reads NOW `wNew` = D14 combination of (client_u → agentJ), with the D48-B rule: 0 if w > 0 and the
  client is a current controller of agentJ (`isAuthorizedOrOwner`) or its agentWallet (a controller's negative edge is
  kept); 0 if agentJ does not exist (`ERC721NonexistentToken`); **any other registry failure reverts
  `RegistryUnreadable`** (R6: an upgrade that exceeds the 120 000 gas per call must not read as burnt agents). It
  compares `wNew` with `wOld` (amended, else committed, else 0). `wNew = wOld` ⇒ `NothingToProve`. The row's source
  must still hold (§3.4 reads, else `BadProof(25)`: use `proveWallet`); a source-less agent row has no edge to prove
  (`BadProof(7)`). The proven row is marked `provenFalse` (§3.5).
- Covers (i) OMISSION with or without dilution, (ii) STALE, (iii) REVOKED, a new controller, (v) FABRICATION / INFLATION.
- **Amount (02-bis, R3): cumulative bounds of the amended row A against the COMMITTED row C⁰**, billed beyond what the
  row already paid (`RowState` keeps the largest bound per side). With the amendment list after this proof, entries
  (wc, wn) (committed, current):
```
S0, N0  = committed positive / |negative| sums        dEff = sPlus if declared, else S0        B0 = max(GRID, dEff)
cOut = Σ wc⁺   cIn = Σ_{wc ≠ 0} wn⁺   pIn = Σ wn⁺      Scur = S0 − cOut + pIn                    Su = S0 − cOut
X    = max(dEff − cOut + cIn, Scur)                     Bh = max(GRID, X)        (largest possible true positive sum)
dim  = ⌈ WAD·[ Su·(Bh − B0)⁺ + Σ (wc⁺·Bh − wn⁺·B0)⁺ ] / (B0·Bh) ⌉                  >= Σ_v (C⁰ − C)⁺, positive side
incP = ⌈ WAD·[ Su·(B0 − Bh)⁺ + Σ (wn⁺·B0 − wc⁺·Bh)⁺ + (X − Scur)·B0 ] / (B0·Bh) ⌉  >= Σ_v (C − C⁰)⁺, omitted mass included
incN = same as incP on the negative side, no declaration: Bn0 = max(GRID, N0), Bnh = max(GRID, Ncur), no omitted term
caps (D22): dim <= ⌈WAD·S0/B0⌉, incP <= WAD, incN <= WAD
prepaid⁺ = ⌊WAD·(sPlus − S0)/B0⌋ if sPlus declared (already in eUp's margin): only incP beyond it is billed
bill: eLow_a += ⌈ t_u^(a)·om·(dim − billed dim) / (alphaN·WAD) ⌉
      eUp_a  += ⌈ t_u^(a)·om·[ (incP − prepaid⁺)⁺ − (billed incP − prepaid⁺)⁺ + (incN − billed incN) ] / (alphaN·WAD) ⌉
```
  Why: before 02-bis the positive budget of a declared row stayed at max(GRID, sPlus) when a COMMITTED edge was revoked,
  so the true budget drop (all other entries, omitted ones included, grow) was never billed to eUp (R3). X follows the
  committed edges; a revealed uncommitted edge is assumed within the declared sum while it fits (it cannot be told from
  a declared omission: AM-02bis.4). Both bounds grow with the budget, so the largest X covers every true sum in
  [Scur, X] (PROOFS.md L6). Bills are monotone: returning to the committed state bills nothing more and refunds nothing.
Then eLowEff and eEff are recomputed; `eLowEff > eLowMax` ⇒ `STALE` (D36).

### 7.2 `proveWallet(setId, r, src, amends)` — (iv) SOURCE
An agent row whose committed source no longer resolves (§3.4): agentWallet changed (cleared at every transfer: this
freezes the OUTGOING edges of a transferred agent, D44), owner of a VIA_OWNER row changed or the agent got a wallet
(D44 (iv-a)), or a source-less row's agent got a wallet (a burnt agent's source-less row has nothing to prove). `src`:
for an alias, its committed source row (Merkle path), as in `proveEdge`. Billed: eLow += the not-yet-billed part of the
committed positive mass `⌈WAD·S⁰/B⁰⌉` (of the source row for an alias); eUp += (1 − prepaid⁺) not yet billed on the
positive side + the rest of 1 on the negative side. The row becomes void and is marked `provenFalse` (§3.5). A new
wallet that is an anchor is covered (the source changed; the next certificate cannot carry the row: `AnchorAsSource`).
A registry failure other than `ERC721NonexistentToken` reverts `RegistryUnreadable` (R6).

### 7.3 `proveTransfer(setId, agentId)` — fast mode (D25/D35)
Certified agent whose `ownerOf` no longer matches `ownerFp` (or reverts `ERC721NonexistentToken`): sets the transfer
bit; `assess` returns `TRANSFERRED`. Any other registry failure reverts `RegistryUnreadable` (R6).

### 7.4 `proveApproval(setId, agentId, a)` — veto by approval, fast mode (D48-B)
Anchor `a` (< k) is `getApproved(agentId)` or `isApprovedForAll(ownerOf(agentId), anchor_a)` for a certified agent:
sets the certified veto bit a of the agent (flags lane) until the next certificate (the watcher re-proves it after a
recertification). `NothingToProve` if not approved or the bit is already set. Event `ApprovalProven(setId, agentId, a)`.
Strict mode reads the same fact live in `assess` (§6).

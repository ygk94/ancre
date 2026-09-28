# Certificate format `ancre-cert-v1` and normative edge rules

> Owner: chantier 04 (solver). Counterpart: `contracts/ENCODING.md` (chantier 02). Updated **2026-09-28**.
> Produced by `export.py`, re-read and re-verified by `export.check_file` (and `tests/test_solver.py::test_published_vectors_verify`).
> Vectors: `vectors/*.json` (command: `cd solver && .venv/bin/python export.py`).
> **Status versus the contract.** `contracts/ENCODING.md` is still `ancre-cert-v0` (27/09). Everything marked
> **[v1, PROPOSED to 02]** below is not in the contract yet. The v1 vectors do NOT verify against the v0 contract
> (header bits, sPlus, t ≤ y). D39 (`setId` with the policy) is not published by 02 yet: the `set` block of the
> vectors carries no policy and no `setId`; it will be aligned when 02-E1 lands.

All integers > 2^53 are **decimal strings** in JSON.

## 0. Normative edge rules (reference for the indexer, chantier 03)

Implemented in `graph.py` (`combine_pairs`, `Identity.source_of`, `Identity.controllers`, `build_graph`).
The indexer ports them; `tests/test_indexer_parity.py` compares the pair edges `(client, agentId, w, decidingTag, feedbackIndex)`.

| # | Decision | Rule |
|---|---|---|
| R1 | D12, D24 | Tag schema per set: `tag → (min, neutral, max, kind)`, bounds in WAD, `min ≤ neutral ≤ max`. Filter ≤ **TAGS_MAX = 16**. |
| R2 | D15 | Only `kind = endorsement` tags create edges. |
| R3 | D14 | Per `(client, agent, tag1)`: the non-revoked feedback with the **highest `feedbackIndex`**. If that feedback is out of bounds, the tag yields nothing (**no fallback** to an older feedback: "latest then reject"). |
| R4 | D18 | `x = value·10^(18−dec)` exact; `x ∉ [min, max]` ⇒ rejected (never clamped); `x > n ⇒ w = ⌊(x−n)·10⁴/(max−n)⌋`; `x < n ⇒ w = −⌊(n−x)·10⁴/(n−min)⌋`; `x = n ⇒ 0`. (Floor of a non-negative quotient; in TypeScript use `bigint` on non-negative operands only.) |
| R5 | D14 | Per `(client, agent)`: `w = min` over the filter's tags if some `w < 0`, else `max`. Ties broken by `tag1` in code-point order (= UTF-8 byte order; NOT JavaScript's default UTF-16 order): smallest tag for a negative, largest for a positive. Ties only change `decidingTag`/`feedbackIndex`, never `w`. `w = 0` ⇒ no edge. |
| R6 | D20 | Reject the pair if `client` is a **current** controller of the agent at the certificate block: `ownerOf`, `agentWallet`, `getApproved`, or an operator approved-for-all by the owner. **The "past owner" rule of D16 is removed** (AM-4.2, AM-6.4). |
| R7 | D20, D44 | **Emitter resolution.** `src(j) = agentWallet(j)` if non-zero; else `ownerOf(j)` **if the owner fallback is on (D44)**; else none. **The wallet always wins.** `A(c) = {j : src(j) = c}`. **Row copy**: every agent `j ∈ A(c)` that is a graph node carries the row of `c` (all pair edges of client `c`), each with its own mass. A client with `A(c) = ∅` is an **address node**. |
| R8 | D9 | The anchor row (edges of the anchor address) is carried by the anchor node, in addition to any agent copy. An anchor address never also becomes an address node. |

Graph nodes, canonical order: anchors (addresses strictly increasing), **rated** agents (agentId increasing), address nodes (increasing).
Only rated agents are agent nodes: an agent nobody rates has no incoming edge, is not an anchor, so its mass is 0 and its copy would carry nothing (D20). **Owner fallback (D44)** is behind the flag `owner_fallback`, **default OFF** pending Hugo's confirmation.

`TRANSFERRED` freeze of outgoing edges (D44): no solver action. A certificate is a snapshot computed with the current owner and wallet; freezing the outgoing mass of a transferred agent between two certificates is a read-side rule of the contract (02-E6).

## 1. JSON fields

| Field | Content |
|---|---|
| `format` | `"ancre-cert-v1"` |
| `label`, `notes`, `alignedWith` | case name, what it shows, alignment status |
| `identityBlock` | block of the IdentityRegistry state used (owner, agentWallet, operators), `null` for toys |
| `set.anchors` | anchor addresses, **strictly increasing**; anchor `a` is node `a` |
| `set.lambdas` | λ_a in WAD, Σ = 1e18, none zero |
| `set.alphaN`, `set.alphaD` | α = αN/αD, 0 < αN < αD |
| `set.minAnchors` | m of the leave-one-out |
| `set.tags` | filter ≤ 16 tags sorted by `keccak(tag)`; `min`/`neutral`/`max` in WAD; `kind` 0 = endorsement, 1 = measurement |
| `nCert` | certified nodes `[0, nCert)` |
| `nodes[i]` | `kind ∈ {anchor, agent, address}`, `agentId` or `address`, `owner`/`agentWallet` (agents), `hasRow` |
| `rows[]` | provided rows, `u` strictly increasing: `source` (client whose feedback forms the row, agents only), `via ∈ {anchor, address, wallet, owner}`, `aliasOf` (u of the row it copies, or null), `sPlus`, `bPlus`, `bMinus`, `edges[]` (expanded, also for alias rows) |
| `rows[].edges[]` | `dst`, `w` (int16), `feedbackIndex` (u32), plus `client`/`agentId`/`tag1` for humans (not encoded) |
| `vectors.t[a][i]` | t_i^(a) in WAD, < 2^63, **a sub-solution** |
| `vectors.ownerFp[i]` | `uint160(owner) & (2^63−1)` for an agent node, 0 otherwise |
| `expected.subSolution` | always `true` (t ≤ y everywhere) |
| `expected.iterationsFromZero` | integer power iterations until the integer fixed point |
| `expected.r[a]`, `expected.e[a]` | residual and upper bound (distrust side) expected from the contract, in wei |
| `expected.eEff` | Σ_a ⌈λ_a·e_a / WAD⌉ |
| `expected.d[i]` | combined distrust (§3) |
| `expected.graphRoot` | Merkle root of the row bytes (§2) |
| `expected.vectorRoot` | keccak256 of the `vectors` calldata |
| `expected.tight` | r, e with the tighter R4 variant (information only) |
| `calldata.newNodes`, `.vectors`, `.rows` | bytes for `submitCertificate(setId, nCert, eMax, newNodes, vectors, rows)` |

## 2. Binary encoding (big-endian)

- `newNodes`: for each node `i ≥ k` in order: `0x01 ‖ agentId:u32` or `0x02 ‖ address:20`. Unchanged from v0.
- `vectors`: `nCert` records of `(k+1) × u64`: `t^(0..k-1)_i`, then `ownerFp_i`. Unchanged from v0.
- `rows`: `W:u8` (2 if nCert ≤ 65 535, else 4) ‖ `numRows:u32`, then for each row, `u` strictly increasing:

```
full row  = u:W ‖ hdr:u16 ‖ [source:20 if SRC] ‖ [sPlus:u32 if SPLUS] ‖ nE × (dst:W ‖ w:int16 ‖ feedbackIndex:u32)
alias row = u:W ‖ hdr:u16 ‖ ref:W                                                   [v1, PROPOSED to 02]

hdr bits   0x8000 SRC        source address present (agent row; v0 name: "wallet")
           0x4000 ALIAS      [v1] the row is a copy of row `ref`
           0x2000 VIA_OWNER  [v1] D44: source = ownerOf(agent u), with agentWallet(u) = 0
           0x1000 SPLUS      [v1] declared positive sum present (D32)
           0x0FFF nE         number of edges (≤ ROW_MAX = 256)
```

**Full row.** `source` is the client whose feedback forms the row: `agentWallet(u)` (VIA_OWNER clear) or `ownerOf(u)` (VIA_OWNER set, only with the owner fallback). **Every agent row with `src(u) ≠ none` carries SRC, even when empty** (an absorbing agent's empty row stays challengeable by omission). An agent row without SRC means `src(u) = none` (agentWallet = 0, fallback off): it MUST be empty, and is checked by `getAgentWallet(u) == 0`. Anchor rows and address rows have no `source` (the client is the node's address). Edge rules: `dst < nCert`, `dst ≠ u`, `dst` strictly increasing, `w ≠ 0`, |w| ≤ 10 000.

**sPlus [v1, D32].** Declared **true** positive sum of the row: Σ of `w > 0` over ALL pair edges of the source client (before any omission). Absent ⇒ `sPlus = Σ committed w⁺`. The contract MUST require `sPlus ≥ Σ committed w⁺`, and uses `B⁺ = max(10 000, sPlus)`. With sPlus declared, omitting positive edges of a row never inflates the others (V4/V7 dilution closed). An under-declared sPlus is a *decrease* fault, provable by (i) (an omitted edge that makes the committed sum exceed sPlus).
The honest solver omits edges only when a row exceeds ROW_MAX (`ppr.cap_row`): it keeps **all negative edges**, then the largest positive weights. **Negative edges are never omitted**: nothing declares the negative sum, so `distrustUp = d + eEff` is only an upper bound when every negative edge of a provided row is committed. An omitted negative is a fault (omission proof, eUp widened, D22), not an honest option; a row with more than ROW_MAX negatives cannot be certified (`cap_row` raises; none on the mainnet). **Anchor rows are never truncated** (D21, AM-4.8): `certify` raises instead.

**Alias [v1, D20].** An agent row whose source, edges and sPlus are identical to an **earlier agent row** (same source client) is encoded as `ALIAS`: `nE = 0`, SRC and SPLUS clear, followed by `ref:W`. Rules: `ref < u`; row `ref` is a full agent row (SRC set, not an alias); the alias row inherits edges, source and sPlus of `ref`; its own VIA_OWNER bit says how agent `u` resolves to that source (it may differ from `ref`'s). `dst ≠ u` still holds for the inherited edges (guaranteed by R6: the source controls `u`). Only agent rows are aliased (never anchor or address rows).

**Registry-verified (D32, for 02).** Per agent row (full or alias): `getAgentWallet(u) == source` if VIA_OWNER clear; `getAgentWallet(u) == 0 && ownerOf(u) == source` if set. The edges of an alias row are read once for its `ref`. **ROW_ALIAS_MAX = 64** (D44, choice): at most 64 alias rows share one ref; the 65th copy is emitted as a new full row, which later copies reference.

- `graphRoot`: leaves = keccak(bytes of the row, from `u` to its last byte — for an alias, `u ‖ hdr ‖ ref`); pairwise keccak(l‖r), an odd element goes up unchanged; 0 if no row.

## 3. Normative arithmetic (what the contract recomputes)

```
om  = αD − αN
B⁺_u = max(10000, sPlus_u)          B⁻_u = max(10000, Σ |w⁻| committed)
y_v^(a) = [v = a]·⌊αN·WAD/αD⌋ + Σ_{rows u, w_uv>0} ⌊ t_u^(a)·om·w_uv / (αD·B⁺_u) ⌋        (floor)
REQUIRE t_v^(a) ≤ y_v^(a) for every v < nCert and every a                                 [v1, D26]
r_a = Σ_v (y_v^(a) − t_v^(a)) + E⁺ + 1
      + Σ_{v listed without row, t_v^(a) ≠ 0} ⌈ t_v^(a)·om / αD ⌉                         (truncated node)
      + Σ_{rows u with sPlus_u > Σw⁺_u} ⌈ t_u^(a)·om·(sPlus_u − Σw⁺_u) / (αD·B⁺_u) ⌉       [v1] (declared omission)
      (E⁺ = number of positive edges of ALL provided rows, alias rows counted with their inherited edges)
e_a = ⌈ r_a·αD / αN ⌉          ⇒ ‖t^(a) − t*^(a)‖₁ ≤ e_a (wei): upper side, used for the distrust bound only (D26)
d_v = Σ_{rows u, w_uv<0} ⌈ ⌈Σ_a λ_a t_u^(a) / WAD⌉ · om · |w_uv| / (αD·B⁻_u) ⌉               (ceil)
reading: c_a = ⌊λ_a·t^(a)/WAD⌋ ; trustLow = Σ c_a − (m−1 largest c_a) − eLow ; distrustUp = d + eEff
```

**Rounding directions.** Every term of y is rounded **down** (so F_down is monotone and t ≤ y implies t ≤ t*, lemma L1-L2); the floor losses are counted in `E⁺ + 1`. Truncation margins, e, eEff and d are rounded **up**. No rounding can reduce a bound.

**How the solver builds t (D26, AM-5.12).** `ppr.certify`: committed rows = full rows capped by `cap_row`, sPlus = true sums; `t⁰ = 0`, `t^{i+1} = F_down(t^i)` until `t^{i+1} = t^i` (`ppr.power_from_zero`). The sequence is non-decreasing, so every iterate is a sub-solution. Measured (28/09, `export.py`): 4 iterations on the mainnet vectors, 99 on `mainnet_em_d44`, 32-45 on the toys.

**Normative consequences for any certifier** (measured in R4, still true):
1. A massive absorbing node MUST be provided with an empty row (nE = 0), otherwise it pays the truncation margin (on the mainnet, forgetting #18's empty row moved e from 9 wei to 0.44 WAD).
2. A zero-mass row should not be provided: it does not change y but adds its positive edges to E⁺.

## 4. Changes from v0 (to mirror in `contracts/ENCODING.md`)

| # | Change | Why |
|---|---|---|
| V1-1 | `REQUIRE t ≤ y` replaces `|t − y|` as the acceptance test (r keeps the same formula) | D26, D32 |
| V1-2 | Header bits ALIAS, VIA_OWNER, SPLUS; nE on 12 bits | D20, D44, D32 |
| V1-3 | `sPlus` declared, `B⁺ = max(10000, sPlus)`, declared-omission margin in r | D32 (B⁺ declared per row) |
| V1-4 | Past-owner rule removed from edge rules; R6 = current controllers only | D20 |
| V1-5 | TAGS_MAX = 16 | D24 |
| V1-6 | Vectors regenerated from 0 (the R4 `toy_alpha_1_3` violated t ≤ y by 1 wei) | AM-5.12 |
| V1-7 | Vectors on the 9 283-feedback mainnet state at block 108 835 675 (`data/`) | CR vagues 1-2 |

## 5. Vectors (28/09, MEASURED by `export.py`)

| vector | nCert | edges | rows | alias | iterations | e (wei) | shows |
|---|---|---|---|---|---|---|---|
| mainnet_honest_d20 | 6 | 5 | 5 | 0 | 4 | [15, 15] | D20 restores the honest chain (#18 carries 0xea0b's row) |
| mainnet_slash_anchor | 6 | 7 | 5 | 0 | 4 | [18, 18] | D14 slash; anchor row + agent copy of the same client (D9 + D20) |
| mainnet_scanner_preD15 | 35 | 58 | 34 | 0 | 4 | [174, 174] | leak without D15 |
| mainnet_em_d44 | 13 | 48 | 13 | 0 | 99 | [147, 147] | VIA_OWNER rows (execution.market workers, agentWallet = 0) |
| toy_alias_owner_rowmax | 264 | 268 | 264 | 1 | 4 | [2.2e15, 801] | alias, VIA_OWNER, wallet-wins, ROW_MAX cap with sPlus |
| toy_alpha_1_{4,3,2} | 5 | 7 | 5 | 0 | 45 / 39 / 32 | [28,28] / [21,21] / [14,14] | α per set |
| toy_truncated | 5 | 6 | 4 | 0 | 41 | [3.9e16, 18] | truncated node margin |

The large `e[0]` of `toy_alias_owner_rowmax` is the declared-omission margin of the capped row (44 positive edges omitted): expected, and harmless for trust (t stays a lower bound).

## 6. Violation vectors (D37) — `vectors/violations/*.json`

Arithmetically valid certificates (they pass `verify`, t ≤ y) whose committed graph is **not dominated** by the
registry, built on the real `mainnet_slash_anchor` graph. Registry-verified MUST reject them at submission;
Submitter-attested MUST make them provable. Extra JSON block `violation`: `kind`, `graphNode {u, dst}`,
`wRegistry`, `wCommitted`, `feedbackIndex`, `affects` (`t` = Σλt of dst, `d` = distrust of dst), `honestValue`,
`committedValue` (WAD, MEASURED 28/09).

| kind | what is wrong | honest → committed |
|---|---|---|
| fabricated (V5) | 0x0730 → #4 (+10000, index 7) with no feedback | t(#4) 0 → 0.0556 |
| dilution (V4) | #18 → #3 omitted, sPlus not declared | t(#2) 0.0926 → 0.1296 |
| inflated (V6) | #18 → #4 slash committed as −1 | d(#4) 0.1852 → 0.1111 |
| omitted_negative (V13) | the slash 0xea0b → #4 omitted (anchor row and copy) | d(#4) 0.1852 → 0 |

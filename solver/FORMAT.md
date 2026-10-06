# Certificate format `ancre-cert-v1` (unified) and normative edge rules

> Owner: solver. Updated **2026-10-01** by the integration session 02 + 04 (branch `chantier/integration-02-04`),
> then **2026-10-06** by chantier 04-bis (D48: rule B in R6, rule A in R8, AM-9.3 diagnostic; vectors regenerated),
> then **2026-10-06** by `chantier/solver-relais` (relays of the indexer review: R1 bis tag identity by hash, NUL;
> REGCB in the identity replay; vectors unchanged, MEASURED).
> **Single source for the binary layout, the integer arithmetic, the replacement rule and the proofs:
> `contracts/ENCODING.md` (unified v1).** This file holds what ENCODING.md does not: the edge rules R1-R8 (what an
> edge is, reference for the indexer), the JSON vector fields, and the solver's own policy. Where both files speak
> of the same thing, this one only points to ENCODING.md; there is no second definition to contradict.
> Produced by `export.py`, re-read and re-verified by `export.check_file` (and `tests/test_solver.py`); replayed on
> the contract by `contracts/test/SolverVectors.t.sol` (forge) and `simulate.py` (anvil fork of the mainnet).
> Vectors: `vectors/*.json` (command: `cd solver && .venv/bin/python export.py`).

All integers > 2^53 are **decimal strings** in JSON.

## 0. Normative edge rules (reference for the indexer, chantier 03)

Implemented in `graph.py` (`combine_pairs`, `Identity.source_of`, `Identity.controllers`, `build_graph`).
The indexer ports them; `tests/test_indexer_parity.py` compares the pair edges `(client, agentId, w, decidingTag, feedbackIndex)`.

| # | Decision | Rule |
|---|---|---|
| R1 | D12, D24 | Tag schema per set: `tag → (min, neutral, max, kind)`, bounds in WAD, `min ≤ neutral ≤ max`. Filter ≤ **TAGS_MAX = 16**. |
| R1 bis | AM-04.2, NUL (06/10) | **A tag is identified by keccak256 of its bytes**, as the contract compares it. A feedback that carries its hash (`h` in the feedbacks file: the indexer's `tagHash`, the NewFeedback `indexedTag1` topic) is matched to a schema tag `T` iff `h = keccak256(utf8(T))`, **never by its text**; the edge's `decidingTag` is then the schema text `T`. A feedback without a hash (readAllFeedback relays) is matched by exact text. An indexer row with `tag1Exact = false` (NUL, ill-formed UTF-16, > 1 KiB: display text only) is NOT excluded: a schema tag longer than 1 KiB or containing U+0000 is matched on chain and only has such rows. |
| R2 | D15 | Only `kind = endorsement` tags create edges. |
| R3 | D14 | Per `(client, agent, tag1)`: the non-revoked feedback with the **highest `feedbackIndex`**. If that feedback is out of bounds, the tag yields nothing (**no fallback** to an older feedback: "latest then reject"). |
| R4 | D18 | `x = value·10^(18−dec)` exact; `x ∉ [min, max]` ⇒ rejected (never clamped); `x > n ⇒ w = ⌊(x−n)·10⁴/(max−n)⌋`; `x < n ⇒ w = −⌊(n−x)·10⁴/(n−min)⌋`; `x = n ⇒ 0`. (Floor of a non-negative quotient; in TypeScript use `bigint` on non-negative operands only.) |
| R5 | D14 | Per `(client, agent)`: `w = min` over the filter's tags if some `w < 0`, else `max`. **Ties between tags of equal weight: the feedback with the HIGHEST `feedbackIndex` decides** (unified v1, F-6; the contract stores only tag hashes and keeps the first one met scanning from the last index down). Ties only change `decidingTag`/`feedbackIndex`, never `w`. `w = 0` ⇒ no edge. MEASURED on `mainnet_em_d44`: 7 edges change index with this rule. |
| R6 | D20, **D48-B** | If `client` is a **current** controller of the agent at the certificate block (`ownerOf`, `agentWallet`, `getApproved`, or an operator approved-for-all by the owner), the pair is rejected **only if its R5-combined weight is positive** (self-endorsement). **A negative combined weight of a controller is kept** (AM-08.B: otherwise an owner silences a critic or an anchor with `setApprovalForAll`, then the registry guard stops them from rating). The test is on the sign of the R5 combination, not per tag. **The "past owner" rule of D16 is removed** (AM-4.2, AM-6.4); a past controller who rates after the transfer is only **reported** (AM-9.3 diagnostic, below). |
| R7 | D20, D44 | **Emitter resolution.** `src(j) = agentWallet(j)` if non-zero; else `ownerOf(j)` **if the owner fallback is on (D44)**; else none. **The wallet always wins.** `A(c) = {j : src(j) = c}`. **Row copy**: every agent `j ∈ A(c)` that is a graph node carries the row of `c` (all pair edges of client `c`), each with its own mass. A client with `A(c) = ∅` is an **address node**. |
| R8 | D9, **D48-A** | The anchor row (edges of the anchor address) is carried by the anchor node **only**. **An agent whose source `src(j)` (R7: wallet, or owner under D44) is an anchor of the set carries no row at all, not even an empty one** (AM-08.A: its copy would import the mass of the other columns into a row the anchor controls, and defeat the leave-one-out). It is listed without a row (absorbing; it pays the truncation margin on eUp only, t stays a lower bound). The contract refuses any agent row whose source is an anchor (`AnchorAsSource`), and `proveWallet` voids a row whose new source is an anchor. An anchor address never also becomes an address node. |

Graph nodes, canonical order: anchors (addresses strictly increasing), **rated** agents (agentId increasing), address nodes (increasing).
Only rated agents are agent nodes: an agent nobody rates has no incoming edge, is not an anchor, so its mass is 0 and its copy would carry nothing (D20). **Owner fallback (D44)** is behind the flag `owner_fallback`, **default OFF** pending Hugo's confirmation; it is part of the edge rule, so a set commits it in its policy (`policy.ownerFallback`, ENCODING §1) and the contract refuses VIA_OWNER rows on a set without it.

**AM-9.3 diagnostic (D48, shown, no effect).** `build_graph` reports in `Graph.diagnostics` every retained pair whose
client is a past owner (or a past agentWallet) of the target and not a current controller: `{kind: pastOwner |
pastWallet, client, agentId, w, tag1, feedbackIndex, feedbackBlock, transferBlock, firstFeedbackAfterTransfer,
blocksAfterTransfer}` ("past controller, N blocks after the transfer", N measured on the FIRST feedback of the pair
after the transfer, any tag). The transfer block comes from `Identity.past_owner_until` (identity.json
`pastOwnerUntil`, optional); the feedback block from the snapshot (`b`), when known. Real case: #10255 (`out/mainnet.md`).

`TRANSFERRED` freeze of outgoing edges (D44): no solver action. A certificate is a snapshot computed with the current owner and wallet; freezing the outgoing mass of a transferred agent between two certificates is a read-side rule of the contract (02-E6).

## 1. JSON fields

| Field | Content |
|---|---|
| `format` | `"ancre-cert-v1"` |
| `label`, `notes`, `alignedWith` | case name, what it shows, alignment status |
| `identityBlock` | block of the IdentityRegistry state used (owner, agentWallet, operators); 0 for toys (synthetic identity `toy_wallet(j)`) |
| `set.anchors` | anchor addresses, **strictly increasing**; anchor `a` is node `a` |
| `set.lambdas` | λ_a in WAD, Σ = 1e18, none zero |
| `set.alphaN`, `set.alphaD` | α = αN/αD, 0 < αN < αD |
| `set.minAnchors` | m of the leave-one-out (= `set.policy.minAnchors`) |
| `set.tagSchemaHash` | `keccak256("ancre-vector:" + label)`: one setId per vector |
| `set.tags` | filter ≤ 16 tags sorted by `keccak(tag)`, any length; `min`/`neutral`/`max` in WAD; `kind` 0 = endorsement, 1 = measurement |
| `set.policy` | the D39 policy (ENCODING §1, field names of the Solidity struct). **Reference test values, not a recommendation**: θ = 1e-3, ρ = 1/2, q = 1, vetoMax = −1, maxAge 288 000, minRefresh 600, slack 0, eLowMax 0.01, strict. Mainnet vectors: Registry-verified, open; toys: Submitter-attested by `0xf39f…2266` (Foundry/anvil default account 0, a public test key) |
| `set.setId` | `keccak256(abi.encode(..., policy))` = `computeSetId` (export.set_id, checked against `cast abi-encode` and on chain) |
| `nCert` | certified nodes `[0, nCert)` |
| `nodes[i]` | `kind ∈ {anchor, agent, address}`, `agentId` or `address`, `owner`/`agentWallet` (agents), `hasRow` |
| `rows[]` | provided rows, `u` strictly increasing: `source` (client whose feedback forms the row, agents only), `via ∈ {anchor, address, wallet, owner, none}`, `aliasOf` (u of the row it copies, or null), `sPlus` (true positive sum), `bPlus` = max(GRID, sPlus), `bMinus`, `edges[]` (expanded, also for alias rows) |
| `rows[].edges[]` | `dst`, `w` (int16), `feedbackIndex` (u32), plus `client`/`agentId`/`tag1` for humans (not encoded) |
| `vectors.t[a][i]` | t_i^(a) in WAD, < 2^63, **a sub-solution** |
| `vectors.ownerFp[i]` | `uint160(owner) & (2^63−1)` for an agent node, 0 otherwise |
| `expected.subSolution` | always `true` (t ≤ y everywhere) |
| `expected.iterationsFromZero` | integer power iterations until the integer fixed point |
| `expected.r[a]`, `expected.e[a]` | residual and upper bound (distrust side) expected from the contract, in wei |
| `expected.eEff` | Σ_a ⌈λ_a·e_a / WAD⌉ |
| `expected.qEff`, `expected.mass`, `expected.distrustMass` | quality of the replacement rule (ENCODING §4-§5), = `quality(setId)` on chain after submission |
| `expected.d[i]` | combined distrust (§3) |
| `expected.graphRoot` | Merkle root of the row bytes (§2) |
| `expected.vectorRoot` | keccak256 of the `vectors` calldata |
| `expected.tight` | r, e with the tighter R4 variant (information only) |
| `calldata.newNodes`, `.vectors`, `.rows` | bytes for `submitCertificate(setId, nCert, eMax, newNodes, vectors, rows)` |

## 2. Binary encoding — see `contracts/ENCODING.md` §2-§3

Summary only (ENCODING.md is normative): `newNodes`, `vectors` unchanged since v0; `rows` = `W ‖ numRows ‖ row*`,
`row = u:W ‖ hdr:u16 ‖ [src:20] ‖ [sPlus:u32] ‖ [ref:W] ‖ edge*nE`, hdr bits **0x8000 SRC, 0x4000 SPLUS,
0x2000 ALIAS, 0x1000 VIA_OWNER, 0x0FFF nE**. How the solver fills them (`export.row_bytes`):
- SRC on every agent row whose source resolves (via wallet or owner), **even when empty**; VIA_OWNER when it resolves
  through the owner (D44); an agent row with `via = none` (agentWallet = 0, fallback off) is written without SRC and
  MUST be empty (`NotEncodable` otherwise);
- SPLUS only when the declared true sum exceeds the committed one (canonical: never for a complete row);
- ALIAS (D20) for an agent row identical to an earlier agent row of the same source (same edges, same sPlus), with
  SRC repeated; **ROW_ALIAS_MAX = 64** copies per ref (D44, a solver canonicalisation; the contract does not check it).

## 3. Arithmetic — see `contracts/ENCODING.md` §4

`ppr.py` mirrors it exactly (`_int_pass`, `_residual`, `verify`, `budgets`): B⁺ = max(GRID, sPlus), t ≤ y required,
r with the truncation and declared-omission margins, e = ⌈r·αD/αN⌉, d rounded up; `export.quality` computes the
(qEff, mass) of the replacement rule.

**How the solver builds t (D26, AM-5.12).** `ppr.certify`: committed rows = full rows capped by `cap_row`, sPlus = true sums; `t⁰ = 0`, `t^{i+1} = F_down(t^i)` until `t^{i+1} = t^i` (`ppr.power_from_zero`). The sequence is non-decreasing, so every iterate is a sub-solution, and at the integer fixed point Σ(y − t) = 0, hence q = 0 unless rows are truncated or capped. Measured (01/10, `export.py`): 4 iterations on the mainnet vectors, 99 on `mainnet_em_d44`, 32-45 on the toys.

**Solver policy (honest certifier).** `cap_row` omits only POSITIVE edges, the smallest first, and declares sPlus;
**negative edges are never omitted** (a row with more than ROW_MAX negatives raises), **anchor rows are never
truncated** (D21, raises). These are the ENCODING §3.2 rules seen from the solver.

**Normative consequences for any certifier** (measured in R4, still true):
1. A massive absorbing node MUST be provided with an empty row (nE = 0), otherwise it pays the truncation margin (on the mainnet, forgetting #18's empty row moved e from 9 wei to 0.44 WAD).
2. A zero-mass row should not be provided: it does not change y but adds its positive edges to E⁺.

## 4. Changes of the integration (01/10) from the 04 draft of 28/09

| # | Change | Why (integration report §1) |
|---|---|---|
| I-1 | header bits 0x8000 SRC, **0x4000 SPLUS, 0x2000 ALIAS, 0x1000 VIA_OWNER** (were 0x1000 SPLUS, 0x4000 ALIAS, 0x2000 VIA_OWNER) | the 02 layout is kept (contract changed least); VIA_OWNER added |
| I-2 | alias row = `u ‖ hdr ‖ src ‖ ref` (src repeated) | each Merkle leaf names its client; proveWallet on an alias needs no source row |
| I-3 | sPlus semantics kept (true sum, B⁺ = max(GRID, sPlus)) | exact omission margin below GRID; the 02 draft's B⁺ was correct but looser |
| I-4 | ties between tags: highest feedbackIndex (R5) | the contract only stores tag hashes; the code-point rule made Registry-verified refuse 7 honest edges of `mainnet_em_d44` |
| I-5 | vectors carry `set.policy`, `set.setId`, `set.tagSchemaHash`, `expected.qEff`, `expected.mass` | D39; replacement rule |
| I-6 | toys get synthetic wallets (`toy_wallet(j)`): an agent row with edges needs SRC | ENCODING §3.2 shape rule |
| I-7 | v0 encoding removed (`encode(..., version=)`) | the R5 contract is superseded |
| I-8 | `expected.distrustMass`; a row without recorded source is `NotEncodable`; anchors sorted WITH their lambdas (`make_set_block`, shared by export and certifier) | code review 01/10 |

## 5. Vectors (06/10, MEASURED by `export.py`; mainnet vectors on the 108 835 675 snapshot until E2 of 04-bis)

> 06/10 (04-bis, D48): `mainnet_slash_anchor` changed anchors and `mainnet_em_d44` changed filter and lost two rows
> (rule A through VIA_OWNER). Contract replay against the 02-bis contract: see `docs/chantiers/journal/04bis.md`.

| vector | nCert | edges | rows | alias | iterations | e (wei) | level | shows |
|---|---|---|---|---|---|---|---|---|
| mainnet_honest_d20 | 6 | 5 | 5 | 0 | 4 | [15, 15] | Registry-verified | D20 restores the honest chain (#18 carries 0xea0b's row) |
| mainnet_slash_anchor | 6 | 5 | 6 | 0 | 4 | [15, 15] | Registry-verified | **anchors {0x0730, 0x794c}, none is an agent's wallet (D48-A; the old {0xea0b, 0x0730} made the anchor the wallet of #18, AM-08.A)**. D14 slash 0xea0b → #4 carried by #18's copy (D20); #4 also has the `quality` endorsement of 0x794c (one column): t = 0.222 in one column, trustRobust 0, distrust 0.074 |
| mainnet_scanner_preD15 | 35 | 58 | 34 | 0 | 4 | [174, 174] | Registry-verified | leak without D15 |
| mainnet_em_d44 | 13 | 36 | 11 | 0 | 78 | [1.84e17, 2.04e17] | Registry-verified, ownerFallback | VIA_OWNER rows (9, execution.market workers, agentWallet = 0); 33-byte tag `requester_rating:knowledge_access` (AM-04.2). **Rule A through the owner (real data)**: the two anchors own #10184 and #10181, which are massive and carry NO row (truncation margin: the large e, distrust side only). Filter = the 8 tags of the tour-6 measurement, shared with `run_mainnet.em_schema` (review 05/10) |
| toy_alias_owner_rowmax | 264 | 268 | 264 | 1 | 4 | [2.2e15, 801] | attested, ownerFallback | alias, VIA_OWNER, wallet-wins, ROW_MAX cap with sPlus |
| toy_alpha_1_{4,3,2} | 5 | 7 | 5 | 0 | 45 / 39 / 32 | [28,28] / [21,21] / [14,14] | attested | α per set |
| toy_truncated | 5 | 6 | 4 | 0 | 41 | [3.9e16, 18] | attested | truncated node margin |

The large `e[0]` of `toy_alias_owner_rowmax` is the declared-omission margin of the capped row (44 positive edges omitted): expected, and harmless for trust (t stays a lower bound).

## 6. Violation vectors (D37) — `vectors/violations/*.json`

Arithmetically valid certificates (they pass `verify`, t ≤ y) whose committed graph is **not dominated** by the
registry, built on the real `mainnet_slash_anchor` graph (anchors 0x0730 / 0x794c since 06/10), each with its own
Registry-verified setId. MEASURED on the
contract (01/10): Registry-verified **refuses fabricated and inflated at submission** (`EdgeMismatch`) and accepts
dilution and omitted_negative (completeness is not checkable on-chain); the watcher proves them (`proveEdge`).
Submitter-attested accepts all four and the watcher proves all four, proof (v) included (`simulate.py`, scenario B). Extra JSON block `violation`: `kind`, `graphNode {u, dst}`,
`wRegistry`, `wCommitted`, `feedbackIndex`, `affects` (`t` = Σλt of dst, `d` = distrust of dst), `honestValue`,
`committedValue` (WAD, MEASURED 06/10).

| kind | what is wrong | honest → committed |
|---|---|---|
| fabricated (V5) | 0x0730 → #4 (+10000, index 7) with no feedback | Σλt(#4) 0.1111 → 0.1667 |
| dilution (V4) | #18 → #3 omitted, sPlus not declared | Σλt(#2) 0.0370 → 0.0741 |
| inflated (V6) | #18 → #4 slash committed as −1 | d(#4) 0.0741 → 0.0000074 |
| omitted_negative (V13) | the slash 0xea0b → #4 omitted from #18's copy (no anchor row carries it any more, D48-A) | d(#4) 0.0741 → 0 |

The certified veto bit (anchor row negative) is exercised by the toy common vectors of 04-bis (§8), not by these:
on the mainnet the only useful negative is posted by 0xea0b, which cannot be an anchor without being an agent's
wallet (D48-A).

## 7. Indexer interface (chantier 03 → 04), `from_indexer.py`

Read side of `docs/ressources/design-indexeur-envio.md` §5/§7. **To be relayed to chantier 03 by the pilot.**

- **Entities and fields read** (Hasura names; a relation `agent` is read as `agent_id`): `Feedback {id, agent_id, client, feedbackIndex, value, valueDecimals, tag1, tagHash, tag1Exact, tag2, blockNumber, logIndex, revokedAtBlock}` (`tagHash`, `tag1Exact`: indexer schema v3; a dump without them keeps the text identity; `tagHash` is exported as `h`, R1 bis; a row `tag1Exact = false` without `tagHash`, or `tag1Exact` true with `keccak(tag1) != tagHash`, is refused), `OwnerChange {id, agent_id, from, to, isMint, blockNumber, logIndex}`, `WalletChange {id, agent_id, wallet, blockNumber, logIndex}`, `ApprovalChange {id, agent_id, approved, blockNumber, logIndex}`, `OperatorChange {id, owner, operator, approved, blockNumber, logIndex}`, `SetEdge {id, set_id, client, agent_id, w, decidingTag, feedbackIndex, rejected, updatedAtBlock}`. Filters used: `blockNumber: {_lte}`, `set_id: {_eq}`, keyset `id: {_gt}` with `order_by: {id: asc}`, `limit: 1000`.
- **Per chain.** Every query filters `chainId: {_eq: C}` (multichain indexer, ids are `(id, chainId)`); rows of other chains must never mix (block numbers are not comparable across chains).
- **Head check.** The export refuses a block the indexer has not processed: it reads `chain_metadata(where: {chain_id: {_eq: C}}) { latest_processed_block }` (Envio table, field names NON VÉRIFIÉ against a live endpoint) and fails if head < B. A fixture declares its block in `BLOCK`.
- **Pagination** stops on an empty page (a server-side row cap below 1 000 must not truncate silently).
- `value` MUST be the exact int128 as a decimal string (never `1.00E+38`); addresses lowercase.
- **Identity replay** in `(blockNumber, logIndex)` order: an `OwnerChange` clears the approval and removes the new
  holder from the past owners (A → B → A leaves `pastOwners = {B}`; `pastOwnerUntil` keeps the block of each past
  holder's last transfer out, AM-9.3); the registry's own `MetadataSet(agentWallet, "")` at transfer MUST be indexed as a `WalletChange` to `0x0` (MEASURED 72/72, design §5).
- **REGCB (normative, 06/10).** `register()` of the v2.0.0 registry writes `agentWallet = msg.sender` before
  `_safeMint` and emits `MetadataSet(agentWallet, msg.sender)` after the `onERC721Received` callback (logs:
  `Transfer(0, C)`, [callback], `Registered`, `MetadataSet(C)`). If an agentWallet `MetadataSet` or a `Transfer` of the
  same agent occurs between its mint and its `Registered` in the registration transaction, the late `MetadataSet(C)`
  is **ignored** (the registry keeps the callback's state). The indexer filters it (no `WalletChange` row,
  `identity.ts` regTx/regPhase); `graph.replay_identity_events` applies the same rule on raw logs, keyed by
  `transactionHash` (`tx`) or, when absent, by the block (same answer on a complete log list: a transaction's logs are
  contiguous). Real data (108 835 675, 110 994 810]: 19 registrations, 0 with a callback change, identity unchanged
  (MEASURED 06/10).
- **SetEdge semantics expected by the parity test.** One row per `(set, client, agent)`: retained iff `rejected == null` and `w != 0`; `w`, `decidingTag`, `feedbackIndex` = R3-R5 (**tie rule changed on 01/10: highest feedbackIndex**, §0 R5; the TypeScript string-order risk AM-04.12 is gone). `OUT_OF_BOUNDS` is a **per-tag** outcome in R3: a pair is `OUT_OF_BOUNDS` only if no tag of the filter yields a weight; one out-of-bounds tag next to a valid tag still gives an edge. `CONTROLLER_*` = R6 on **current** controllers (no past-owner reason), **and only when the combined weight is positive (D48-B, 06/10): a controller's negative pair is retained** (`rejected == null`, w < 0). The emitter (R7) is **not** part of SetEdge: the solver resolves it.
- **When parity is meaningful**: SetEdge is current state only, so compare at the indexer's head (or with the indexer stopped at B).
- **Handing over a dump from another machine**: one `<Entity>.json` per entity (list of rows, GraphQL shape) plus a `BLOCK` file, in `solver/tests/fixtures/indexer/`; `test_parity_real_indexer_dump` then runs automatically. CLI: `.venv/bin/python from_indexer.py --fixture DIR --block B --out OUT --parity` (exit code 1 on any difference).

## 8. Common vectors 02-bis / 04-bis (D48, D50, R1) — `vectors/common/*.json`

Produced by `common_vectors.py` (normative pipeline, then `check_file_obj`), tested by `tests/test_common_vectors.py`.
Extra blocks on top of §1: `registry` (agents `{agentId, owner, agentWallet, approved}`, `operators`, `feedbacks` in
index order per pair, for `contracts/test/utils/Mocks.sol`), `expect.submission` (`ACCEPTED` or the custom error),
`expect.read[agentId]` (`contributions`, `trustRobust`, `distrust`, `vetoBits`, `vetoByApproval`,
`passesAnchorPolicy`), `attack` (what makes a refused vector a real attack). Policy: Registry-verified (mocks) except C
(Submitter-attested); θ = 1e-3, ρ = 1/2, m = 2, strict.

| vector | expect | shows |
|---|---|---|
| common_A_anchor_not_source | ACCEPTED | anchor X = wallet of S: S listed without row; F (endorsed by X only) trustRobust 0 |
| common_A_attack_anchor_copy | `AnchorAsSource(2)` | S carries X's row: F would get mass in two columns |
| common_A_mainnet_old_slash_anchor | `AnchorAsSource(5)` | the 01/10 demo vector (0xea0b anchor and wallet of #18), real registry, fork at 110 994 810 |
| common_B_controller_negative | ACCEPTED | anchor made operator (A2) and approved address (P) slash #30: kept; veto bit + vetoByApproval; #31 passes |
| common_C_proven_row_resubmitted | ACCEPTED, then `proveEdge` (A1 row, agentJ 41), then `ProvenRowResubmitted(0)` on `resubmission` | same false row, other bytes (empty row of #40 dropped); `control` (honest) ACCEPTED |
| common_2hop | ACCEPTED | H2 (#51) trustRobust 2/27 ≈ 0.0741: passes; a one-hop list says unknown (D50) |
| common_2hop_one_anchor | ACCEPTED | H1 endorsed by one anchor: H2 trustRobust 0, refused (AM-10.6) |
| common_R1_address_zero_node | `BadNodes()` | address node 0x0 with a row (R1 of the 05/10 review) |

The canonical row hash of C is defined by the contract (02-bis), not carried by the vector.

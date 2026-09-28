# ancre-indexer — output format (for the solver, chantier 04, and the demo screen, chantier 07)

Status: **v0, 2026-09-28** (chantier 03, E2). Entities are defined in `schema.graphql`; this file says what
they mean and how to read them. Change log at the bottom.

## Access

- GraphQL (Hasura). Local: `http://localhost:8080/v1/graphql` after `pnpm dev` (admin secret `testing`).
  Envio Cloud: `https://indexer.dev.hyperindex.xyz/<deployment-id>/v1/graphql` (id given after the 1st deploy, ≥ 01/10).
- **Per-chain rows.** The indexer runs with `disable_default_cross_chain: true`: every table has a `chainId`
  column and the key is `(id, chainId)`. **Always filter on `chainId`** (143 = Monad, 10143 = Monad testnet,
  3rd chain TBD). The same `id` (e.g. agent `"4"`) exists independently on several chains.
- Addresses are **lowercase** hex. Big integers are strings in JSON (`BigInt`).
- Pagination: `order_by: {id: asc}` with `where: {id: {_gt: $last}}`, pages of 1 000.

## Layer 1 — append-only history (replay any past block)

Nothing is ever deleted from these tables; each row carries `blockNumber` and `logIndex`.
To rebuild the state at block `B`, filter `blockNumber <= B` and replay in `(blockNumber, logIndex)` order.

| Entity | One row per | Key fields |
|---|---|---|
| `Feedback` | `NewFeedback` (id `agentId-client-feedbackIndex`) | `value` (exact int128), `valueDecimals`, `tag1`, `tag2`, `triple`, `txFrom` (signer, ≠ client when relayed), `revokedAtBlock` (null = active), `clientWasController` (at the feedback's block) |
| `WalletChange` | `MetadataSet(key = "agentWallet")` | `wallet` (`0x000…0` = cleared, emitted on every transfer) |
| `OwnerChange` | ERC-721 `Transfer` | `from`, `to`, `isMint` |
| `ApprovalChange` | ERC-721 `Approval` | `approved` |
| `OperatorChange` | `ApprovalForAll` | `owner`, `operator`, `approved` |
| `RegistryEvent` | `Upgraded` / `OwnershipTransferred` of either proxy (D17 watch) | `registry`, `kind`, `implementation`, `newOwner` |

**Solver input equivalents** (what `solver/from_indexer.py` should produce):
- `onchain_feedbacks.json` ← `Feedback` with `blockNumber <= B`: `{a: agent_id, c: client, i: feedbackIndex, v: value, d: valueDecimals, t1: tag1, t2: tag2, r: revokedAtBlock != null && revokedAtBlock <= B}`.
- identity at `B` ← replay of `OwnerChange`, `WalletChange`, `ApprovalChange` (reset by each `Transfer`), `OperatorChange`.
  Or, for the current head only, read layer 2 directly.

## Layer 2 — current state (head of the chain)

| Entity | Meaning |
|---|---|
| `Agent` (id = agentId) | `owner`, `wallet` (`0x0` if cleared), `approved` (`0x0` if none), `registeredBlock`, `registeredTxFrom`, `transferCount`, `lastTransferBlock` |
| `WalletAgents` (id = wallet) | reverse index wallet → `agentIds` (not available on-chain). `count > 1` = shared wallet (D20 row copy) |
| `Operator` (id = `owner-operator`) | `active` operator approvals |

## Layer 3 — normative edges of the reference set

`RefEdge` (id = `client-agentId`): one row per (client, agent) pair that has at least one feedback under a
reference-filter tag. Rules = `solver/graph.py` (reference): D14 latest non-revoked per (client, agent, tag1),
negative dominance across tags; D15 endorsement tags only; out-of-bounds rejected, never capped, no fallback
to an older feedback; rejection of the target's **current** controllers (owner, operator, agentWallet,
approved — the past-owner rule is removed by D20). Schema and filter: `src/lib/schema_reference.json`
(copy of `solver/schema_reference.json`), filter `reference`.

| Field | Meaning |
|---|---|
| `w` | int16 weight on the 1e-4 grid (`graph.quantize`); **0 = no edge** |
| `decidingTag`, `feedbackIndex` | the feedback that decided `w` |
| `rejected` | `NONE` (edge kept) · `OUT_OF_BOUNDS_ONLY` · `ZERO_WEIGHT` · `CONTROLLER_OWNER` · `CONTROLLER_OPERATOR` · `CONTROLLER_WALLET` · `CONTROLLER_APPROVED` |
| `updatedAtBlock` | last block where the row changed |

**Not decided here: the emitter node.** `RefEdge` is keyed by the client *address*. Which node emits the
row (D16/D20: every agent whose `wallet` = client, row copy; D44: owner fallback when `wallet = 0`) is
resolved by the consumer from `Agent` + `WalletAgents`, so that D44 or an encoding change does not require
re-indexing.

`TripleLatest` (id = `client-agentId-tag1`): the latest non-revoked feedback of each triple for reference tags.

## Stats

`ChainStats` (id = `"stats"`, one row per chain): `agents`, `transfers`, `feedbacks`, `revoked`,
`selfRatings` (feedback given while the client controlled the target), `outOfRange` (|value| ≥ 1e38),
`refEdges` (RefEdge with `w ≠ 0`), `sharedWallets`, `agentsOnSharedWallets`, `lastBlock`.

## Guarantees and tests

- `test/parity.test.ts` (`pnpm test:parity`): replaying Monad 143 up to block 108 434 518 yields exactly the
  11 reference edges of `solver/graph.py` and the brief 03 §7 figures (9 188 feedbacks, 7 771 couples,
  10 261 mints, 72 transfers, 178 shared wallets / 1 773 agents, 78 self-ratings by agentWallet). MESURÉ 28/09.
- `test/rules.test.ts` (`pnpm test`): D14 slash/review on #4, #8317 self-rating, 1e38, D15, transfer, revocation.

## Example queries

```graphql
# Reference edges kept on Monad
query { RefEdge(where: {chainId: {_eq: 143}, w: {_neq: 0}}) { client agent_id w decidingTag feedbackIndex } }

# Agents sharing one wallet
query { WalletAgents(where: {chainId: {_eq: 143}, count: {_gt: 1}}, order_by: {count: desc}, limit: 5) { id count agentIds } }

# Stats of every indexed chain in one request
query { ChainStats { chainId agents feedbacks refEdges selfRatings outOfRange lastBlock } }
```

## Change log

- v0 (28/09): layers 1–3 for the reference set, ChainStats. Coming: certificate audit (`Certificate`,
  `CertificateAudit`, `Discrepancy`, `SetHealth`) once `contracts/ENCODING.md` is published (E4).

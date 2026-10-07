# Test vectors

Normative test vectors for the ERC "Anchored Reputation for Trustless Agents". Every expected value is an exact integer; every rational quantity can be recomputed in exact arithmetic.

```
python3 verify.py        # standard library only; exit code 0 = every vector passes
python3 verify.py -v     # per-file details
```

`verify.py` is an independent checker written from the specification text. It does not use the reference implementation. It includes its own Keccak-256 and ABI encoder.

## Files

| File | Section | Content |
|---|---|---|
| `vectors/quantization.json` | 3.2 | `(tag, value, decimals) → weight` or `invalid` |
| `vectors/pair-edge.json` | 3.1, 3.3 | feedback history of one `(client, agent)` pair → `(w, feedbackIndex)` or no edge; `controller` marks a client that is a current controller of the agent |
| `vectors/certificates/*.json` | 2.1, 4, 5 | complete certificates: anchor set, node table, rows, vectors, expected bounds and roots, calldata |
| `vectors/violations/*.json` | 5, 6 | certificates that pass the arithmetic but whose graph is not dominated by the registry, with the discrepancy proofs that restore the bounds |
| `vectors/common/*.json` | 3.3, 3.5, 5.1, 5.10, 8 | self-contained vectors: a certificate plus the registry state it was built from, the expected outcome of the submission and the expected readings |
| `vectors/sequences/*.json` | 5.10, 6 | self-contained proof sequences: registry changes, proofs and resubmissions in order, with the bounds measured after each proof |
| `vectors/refusals.json` | 5.1, 5.3, 5.4 | submissions derived from `common/common_2hop.json` that MUST be refused, with the expected error |

## Certificate vectors

| Field | Meaning |
|---|---|
| `set` | `SetParams` (section 2.1), every integer above 2^53 as a decimal string, and the expected `setId` |
| `nCert` | certified nodes `[0, nCert)` |
| `nodes[i]` | `kind` (`anchor`, `agent`, `address`), `agentId` or `address`, the agent's `owner` and `agentWallet` at `identityBlock`, `hasRow` |
| `rows[]` | `u`, `source` (the row's client for an agent row), `via` (`anchor`, `address`, `wallet`, `owner`, `none`), `aliasOf` (the `u` of the copied row, or `null`), `sPlus` (true positive sum), `bPlus`, `bMinus`, `edges[]` (`dst`, `w`, `feedbackIndex`, plus `client`, `agentId`, `tag1` for readers; alias rows list their inherited edges) |
| `vectors.t[a][i]` | `t_i^(a)` in WAD |
| `vectors.ownerFp[i]` | owner fingerprint (section 5.3) |
| `expected` | `r[a]`, `e[a]` (= `eUp_a`), `eEff`, `qEff`, `mass`, `distrustMass` (= `D`), `d[i]`, `graphRoot`, `vectorRoot`, and `iterationsFromZero` and `tight` (informative) |
| `calldata` | hex of `vectors` and `rows` for `submitCertificate`; `nodeEntries`, the node entries of the table after the anchors; `newNodes`, what to pass inline: empty on an open set, where `nodeEntries` go through `addNodes` first (section 5.1) |
| `acceptedBy` | where the reference implementation accepted the vector with identical `setId`, `eEff`, roots, mass and `q`, and refused a mutated copy of its vectors (`NotSubSolution`) |

A row header carries `SPLUS` exactly when `sPlus` exceeds the positive sum of the committed edges. `VIA_OWNER` corresponds to `via = owner`, `ALIAS` to a non-null `aliasOf`, and `SRC` to a non-null `source`. `W = 2` in every vector.

`tagSchemaHash` in these vectors is an opaque test value (`keccak256("ancre-vector:" + id)`), not the hash of a schema document. The aggregator never reads the document (section 2.4). The policies are test values, not recommendations (`theta = 10^15`, that is 0.1 %; `rhoN/rhoD = 1/2`).

Vectors whose `identityBlock` is non-zero use real registry state of chain 143 at that block. The others use a synthetic identity.

## Violation vectors

Each one is built on the graph of `certificates/<honestVector>` (the true registry state). It contains:
- `violation.atSubmission`: what each level does at submission (fabricated or inflated edges are refused at `RegistryVerified`);
- `violation.proofs[]`: per level, the `proveEdge` calls (`row` = node index of the proven row, `agentId`, `wNew` = the weight re-read in the registry), in order, and the `eLowEff` and `eEff` measured after them on the reference implementation.

`verify.py` checks four things for each violation vector:
1. the guarantee fails for the true graph: `t > t*` somewhere, or `d* > d + eEff`;
2. the proof amounts of section 6.1 (formula X) reproduce the measured `eLowEff` and `eEff` to the wei;
3. after the proofs, `‖(t − t*)⁺‖₁ ≤ eLow_a` holds for each column;
4. after the proofs, `d* ≤ d + eEff` holds.

## Self-contained vectors (`common/`, `sequences/`)

| Field | Meaning |
|---|---|
| `registry.agents[]` | `{agentId, owner, agentWallet, approved}` |
| `registry.operators[]` | `{owner, operator}`: `isApprovedForAll(owner, operator)` |
| `registry.feedbacks[]` | `{client, agentId, value, decimals, tag1, tag2, revoked}`; the feedback index of an entry is its rank among the entries of the same `(client, agentId)` pair, from 1 |
| `expect.submission` | `ACCEPTED`, or the refusal of section 10 with its arguments, for example `AnchorAsSource(2)` |
| `expect.read[agentId]` | after an accepted submission: `contributions` (`c_a`), `trustRobust`, `distrust`, `vetoBits` (certified veto bit per anchor), `vetoByApproval` (anchors approved for the agent or operators of its owner), `passesAnchorPolicy` |
| `expect.then`, `resubmission`, `control` | `common_C` only: the proof to apply after the submission, then a resubmission that MUST be refused and an honest certificate that MUST be accepted |
| `sequence[]` | `sequences/` only, in order: `submit` (with `expect`), `revoke {client, agentId, index}`, `feedback {client, agentId, value, decimals, tag1}`, `setWallet {agentId, wallet}`, `proveEdge {row, pos, agentId, wNew, amends}`, `proveWallet {row, pos, amends}`, `clearSourceFact {node, src, viaOwner}`; `measured` holds what the reference implementation returned and the `eLowEff` and `eEff` after the step |

`row` is the node index of the proven row and `pos` its rank among the rows (its Merkle leaf index). `amends` is the amendment list of section 6 before the proof.

For each self-contained vector, `verify.py` replays the registry, re-reads every committed edge of a `RegistryVerified` certificate, computes the outcome of the submission (sections 3.5, 5.1, 5.4, 5.7, 5.10), and compares the readings. For the sequences, it recomputes every proof amount, and checks after each proof that the bounds hold for the registry's graph in exact arithmetic.

## Provenance

Generated on 2026-10-07 from the reference solver's vectors (the normative pipeline of the reference implementation). The certificates, violations and self-contained vectors were replayed on the reference contract on an anvil fork of chain 143 at block 110,994,810 (the toy registries at the `SubmitterAttested` level there), and the self-contained vectors also on mock registries at the `RegistryVerified` level. The sequences and refusals were replayed on the reference contract with mock registries. The unit cases (`quantization.json`, `pair-edge.json`, 17 cases since 2026-10-07) were cross-checked against the reference solver.

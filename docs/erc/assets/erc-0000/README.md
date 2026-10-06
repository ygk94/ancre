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
| `vectors/pair-edge.json` | 3.3 | feedback history of one `(client, agent)` pair → `(w, feedbackIndex)` or no edge |
| `vectors/certificates/*.json` | 2.1, 4, 5 | complete certificates: anchor set, node table, rows, vectors, expected bounds and roots, calldata |
| `vectors/violations/*.json` | 5, 6 | certificates that pass the arithmetic but whose graph is not dominated by the registry, with the discrepancy proofs that restore the bounds |

## Certificate vectors

| Field | Meaning |
|---|---|
| `set` | `SetParams` (section 2.1), every integer above 2^53 as a decimal string, and the expected `setId` |
| `nCert` | certified nodes `[0, nCert)` |
| `nodes[i]` | `kind` (`anchor`, `agent`, `address`), `agentId` or `address`, the agent's `owner` and `agentWallet` at `identityBlock`, `hasRow` |
| `rows[]` | `u`, `source` (the row's client for an agent row), `via` (`anchor`, `address`, `wallet`, `owner`, `none`), `aliasOf` (the `u` of the copied row, or `null`), `sPlus` (true positive sum), `bPlus`, `bMinus`, `edges[]` (`dst`, `w`, `feedbackIndex`, plus `client`, `agentId`, `tag1` for readers; alias rows list their inherited edges) |
| `vectors.t[a][i]` | `t_i^(a)` in WAD |
| `vectors.ownerFp[i]` | owner fingerprint (section 5.3) |
| `expected` | `r[a]`, `e[a]` (= `eUp_a`), `eEff`, `qEff`, `mass`, `distrustMass` (= `D`), `d[i]`, `graphRoot`, `vectorRoot`, and `iterationsFromZero` (informative) |
| `calldata` | hex of `newNodes`, `vectors`, `rows` for `submitCertificate` |
| `acceptedBy` | where the reference implementation accepted the vector with identical `setId`, `eEff`, roots, mass and `q` |

A row header carries `SPLUS` exactly when `sPlus` exceeds the positive sum of the committed edges. `VIA_OWNER` corresponds to `via = owner`, `ALIAS` to a non-null `aliasOf`, and `SRC` to a non-null `source`. `W = 2` in every vector.

`tagSchemaHash` in these vectors is an opaque test value (`keccak256("ancre-vector:" + id)`), not the hash of a schema document. The aggregator never reads the document (section 2.4).

Vectors whose `identityBlock` is non-zero use real registry state of chain 143 at that block. The others use a synthetic identity in which agent `j` has owner and wallet `0x…a00j`.

## Violation vectors

Each one is built on the graph of `certificates/mainnet_slash_anchor.json` (the true registry state). It contains:
- `violation.atSubmission`: what a `RegistryVerified` set does at submission (fabricated or inflated edges are refused there);
- `violation.proofs[]`: per level, the `proveEdge` calls (`row` = node index of the proven row, `agentId`, `wNew` = the weight re-read in the registry) and the `eLowEff` and `eEff` measured after them on the reference implementation.

`verify.py` checks four things for each violation vector:
1. the guarantee fails for the true graph: `t > t*` somewhere, or `d* > d + eEff`;
2. the proof amounts of section 6.1 reproduce the measured `eLowEff` and `eEff` to the wei;
3. after the proofs, `‖(t − t*)⁺‖₁ ≤ eLow_a` holds for each column;
4. after the proofs, `d* ≤ d + eEff` holds.

## Provenance

Generated on 2026-10-01 from the reference solver's export. The certificates were accepted by the reference contract on an anvil fork of chain 143 at block 108 835 675, at the level stated in each file. The unit cases (`quantization.json`, `pair-edge.json`) were cross-checked against the reference solver.

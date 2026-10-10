# ANCRE — anchored reputation for ERC-8004 agents, checked by the contract that pays

> **A receipt can be true and still come from a farm.** ANCRE doesn't ask whether a payment happened. It asks whether anyone **you** trust vouches for the agent, possibly through someone they vouched for, and your contract reads the answer before it pays.

ANCRE is a reputation layer for AI agents registered under [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004). Each reader picks a few **anchors** it already trusts. ANCRE propagates trust from those anchors through the ERC-8004 feedback graph (personalized PageRank), publishes a **certificate** that an on-chain contract verifies, and lets a payer contract refuse to pay an agent that the reader's anchors do not reach, or that one of them has vetoed.

It is the reference implementation of a draft ERC, *Anchored Reputation for Trustless Agents* ([`docs/erc/anchored-reputation.md`](docs/erc/anchored-reputation.md)).

| | |
|---|---|
| Hackathon | Monad Metropolis, track 04 — Trust, Identity & AI Infra |
| Network | Monad mainnet (143) and testnet (10143), next to the canonical ERC-8004 registries |
| Certificate level used in the demo | **Registry-verified** (every edge re-read from the registry at submission) |
| Status at submission | **[TBD: contracts deployed on testnet / mainnet — see §7]** |

**How to read the numbers.** Every figure below links to the file that produced it, with its date and one of four labels: **MEASURED** (output of a script or test in this repository, or an on-chain read we made), **DOC** (official documentation), **ESTIMATED**, **UNVERIFIED**.

---

## Contents

1. [The problem, measured on Monad mainnet](#1-the-problem-measured-on-monad-mainnet)
2. [What ANCRE adds: trust beyond one hop, with a bound and a certificate](#2-what-ancre-adds)
3. [How it works](#3-how-it-works)
4. [Architecture](#4-architecture)
5. [Replay act 1 in five minutes](#5-replay-act-1-in-five-minutes)
6. [Run the tests](#6-run-the-tests)
7. [Deployed addresses](#7-deployed-addresses)
8. [Gas measurements](#8-gas-measurements)
9. [Honest limits](#9-honest-limits)
10. [Why Monad](#10-why-monad)
11. [Prior art and complementary projects](#11-prior-art-and-complementary-projects)
12. [Repository map](#12-repository-map)
13. [AI tool disclosure](#13-ai-tool-disclosure)
14. [Licenses](#14-licenses)

---

## 1. The problem, measured on Monad mainnet

ERC-8004 lets anyone rate any agent, for free. The standard says so itself, and leaves Sybil filtering to the reader: `getSummary` **reverts** unless the caller supplies the list of raters it trusts. The reader is expected to know whom to trust, and is given no tool to work it out.

We re-read the canonical registries on Monad mainnet directly on-chain (never through a third-party API, which mis-reports decimals on 24 entries — `solver/out/mainnet.md`).

| Fact | Value | Status and source |
|---|---|---|
| Registries | Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, version 2.0.0 | MEASURED, `cast`, 2026-09-27 |
| Agents / feedback entries | **10,262 / 9,283** at block 108,835,675 | MEASURED, 2026-09-28, [`solver/out/mainnet.md`](solver/out/mainnet.md) (snapshot in `solver/data/`) **[TBD: refreshed snapshot, lot 04-bis]** |
| Feedback pointing to one agent, Eve-8004 (#182) | **7,665 (83 %)**, from agents registered on 16–17 Feb 2026 at about 300 per hour | MEASURED, `solver/out/mainnet.md` |
| Entries set to `1e38` | **117**, all on Eve-8004 | MEASURED, same file |
| Naive average of Eve-8004 | **1.526 × 10³⁶** (`getSummary(182, all 7,665 clients)`) | MEASURED live, block 110,993,179, 2026-10-06 (commands in §5) |
| `getSummary(182, [], "", "")` | reverts: `clientAddresses required` | MEASURED live, 2026-10-06 |
| Feedback that survives as a usable trust edge | **11 edges out of 9,283 entries (0.12 %)** under the reference schema | MEASURED, `solver/out/mainnet.md` §0; `indexer` survival scan |

Any application that ranks agents by average rating puts Eve-8004 first. Requiring proof of payment does not fix it: the farm paid, and the raters' funds came from the same owner. We checked a random sample of 150 of Eve's raters: each one received its first MON from Eve's owner, always 11.0 MON (MEASURED, 2026-10-06, then re-run on 2026-10-10 with a new random sample of 150, same result: Alchemy Transfers API, script [`solver/funders.py`](solver/funders.py), output [`solver/out/alchemy-funders-182-sample.json`](solver/out/alchemy-funders-182-sample.json); shown on the agent page of the screen, see [`docs/ressources/alchemy-integration.md`](docs/ressources/alchemy-integration.md)).

The registry's self-rating guard checks the agent's owner and operators, not its `agentWallet`: agent #8317 received 78 ratings from its own agent wallet, all accepted by the registry. ANCRE drops all 78 (MEASURED, `solver/out/mainnet.md` §c).

**The same pattern on other chains.** We ran the same edge rules over seven ERC-8004 deployments with Envio HyperSync (MEASURED, 2026-09-28, [`indexer/analytics/survival_scan.py`](indexer/analytics/survival_scan.py), report `docs/chantiers/rapports/03.md` §3):

| Chain | Agents | Feedback | Edges kept | Survival |
|---|---|---|---|---|
| Monad 143 | 10,262 | 9,283 | 11 | 0.12 % |
| Monad testnet | 1,949 | 1,862 | 28 | 1.5 % |
| Arbitrum | 1,545 | 498 | 22 | 4.4 % |
| Optimism | 545 | 334 | 10 | 3.0 % |
| Polygon | 680 | 508 | 10 | 2.0 % |
| Ethereum | 51,586 | 17,682 | 519 | 2.9 % |
| Base | 97,351 | 531,500 | 9,857 | 1.9 % |

> **Caveat.** The reference tag schema was built from Monad's tags, and an unknown tag never creates an edge. Outside Monad, these figures are a **lower bound under our schema**, not a verdict on those chains.

---

## 2. What ANCRE adds

A list of trusted raters, which ERC-8004 already accepts, tells you **whose ratings count**. ANCRE tells you whose ratings count **because someone you trust vouched for them**, and proves it to your contract. Three properties together:

1. **Trust propagates beyond one hop.** An agent that none of your anchors rated directly can still earn trust, if an agent your anchors rated vouches for it. A one-hop list would call it unknown.
2. **A formal Sybil bound.** Trust enters a group of accounts only through ratings given by accounts that already hold trust. A farm of thousands of agents rating each other receives nothing unless someone the anchors reach vouches for it. The bound is the classical one for personalized PageRank: π(S) ≤ ((1−α)/α) · Σ_{u∉S} π(u) · C(u, S).
3. **A certificate checked on-chain.** The trust vector is computed off-chain, but the contract only accepts it if it is a provable lower bound of the true value (§3.2). At the Registry-verified level, the contract also re-reads every edge from the live ERC-8004 registry.

On the real Monad registry, with two independent anchors (`0x0730…`, `0xf7d5…`), α = 1/3 (MEASURED, `solver/out/mainnet.md` §a and §d, **[TBD: recompute after lots 02-bis and 04-bis]**):

| Agent | Naive view | ANCRE |
|---|---|---|
| Eve-8004 (#182) | average 1.526 × 10³⁶ | **trust mass 0** on the whole 7,666-agent farm region |
| #18 | — | 0.222 per anchor, robust trust 0.111 (rated by both anchors) |
| #2, #3 | — | 0.074 per anchor (**second hop**: rated by #18's wallet, not by any anchor) |
| #4 | — | trust 0, distrust 0.148 (a `slash −100` from #18's wallet dominates a later `+1`) |

That honest graph is tiny: ANCRE answers "unknown" for almost every agent on mainnet today, which is the correct answer. The positive side of our demo uses our own agent traffic (§5, act 2).

ANCRE is relative to the reader, by design. A reader who picks two farm wallets as anchors gets the farm's view (t(#182) = 0.222, MEASURED, same file, control case). There is no global score.

---

## 3. How it works

### 3.1 From feedback to a graph

- **Nodes** are ERC-8004 agents. A rating from address `c` to agent `j` becomes an edge from every agent whose `agentWallet` is `c` (row copy for shared wallets, D20), or from an address node if `c` controls no agent.
- **One edge per (rater, agent, tag)**: the latest non-revoked entry, then the most negative across the tags of the set's filter (a negative dominates).
- **Tags are declared in a schema** committed in the anchor set. Only tags of kind `endorsement` create edges. `measurement` tags (liveness, uptime, risk scans) never do. Without this rule, an automated risk-screening service that pings every agent leaks **34.6 %** of its trust into the farm; with it, **0** (MEASURED, `solver/out/mainnet.md` §b).
- **Values outside the declared bounds are rejected, not clipped.** Otherwise a `1e38` lands at the top of the scale.
- An agent's controllers (owner, operators, wallet) cannot endorse it. Their negative ratings still count.
- Normative rules R1–R8: [`solver/FORMAT.md`](solver/FORMAT.md). The indexer re-implements them in TypeScript and matches the solver exactly on three chains (MEASURED, 2026-10-05, `docs/chantiers/rapports/03.md`).

### 3.2 The certificate

For each anchor `a`, the solver iterates `t ← F(t) = (1−α)·Cᵀt + α·e_a` from zero, with the contract's own rounding. The contract accepts the column only if **t ≤ F(t) coordinate by coordinate**. Because `F` is monotone, any such sub-solution is below the true fixed point: every published trust value is an exact **lower bound**, with no error term to trust. This is a classical property of PageRank; what is new is enforcing it inside the contract that pays. Proofs and lemmas: [`contracts/PROOFS.md`](contracts/PROOFS.md).

Two verification levels (decision D32), named in every set and on screen:

- **Registry-verified**: at submission, the contract re-reads each committed edge in the ERC-8004 registry (latest index of the tag, rater's wallet, target's controllers). A fabricated or inflated edge is **refused**. Anyone may submit.
- **Submitter-attested**: only the submitters listed in the set may submit. Any deviation from the registry, fabrication included, can be proven afterwards.

At both levels, an omitted or diluted edge can be proven by anyone with `proveEdge` / `proveWallet`. A proof widens the certificate's bounds; it never moves funds (no slashing, because the registry does not store the block of a rating, so "this rating existed before the certificate" cannot be proven).

### 3.3 The policy, and the payer

An anchor set is content-addressed: its `setId` commits the anchors, the tag schema, α (1/3 recommended) and the whole payment policy — threshold θ, distrust ratio, minimum anchors `m`, veto quorum, maximum age, transfer mode. The single question a contract asks is:

```solidity
bool ok = anchoredReputation.passesAnchorPolicy(agentId, setId);
```

`passesAnchorPolicy` (named `isTrusted` before lot 02-bis, decision D48) never reverts, and returns true only if:

- **leave-one-out trust** clears θ: the largest single anchor's contribution is removed, so **no single stolen anchor key can make the payer pay** (m = 2);
- the agent's distrust stays below the committed ratio;
- **no anchor has vetoed it**: the anchor's latest feedback on the agent is read **live from the registry**, so a veto stops the very next payment, without recertification;
- the certificate is fresh, the registry has not been upgraded since (`REGISTRY_CHANGED`), and the agent has not changed owner (`TRANSFERRED`).

[`TrustGatedPayer`](contracts/src/TrustGatedPayer.sol) is an ERC-1271 smart account that holds the USDC used to pay other agents over x402 (`exact` via EIP-3009, `upto` via Permit2). Its `isValidSignature` calls `passesAnchorPolicy`: if the provider fails, the signature is invalid and the payment cannot settle. **The refusal comes from the contract, not from an interface that could be bypassed.** Flow, messages and refusal reasons: [`contracts/PAYER.md`](contracts/PAYER.md).

### 3.4 Agent-side guard and human-only override

The `mm ancre` plugin for the MetaMask Agent Wallet ([`plugin/`](plugin/)) checks the same policy before the agent signs anything (`check`, `inspect`, `pay`). When ANCRE refuses, the plugin shows the verdict and offers an override **reserved to a human**: it pays from the human's own wallet, signed in their browser extension, never from the agent wallet nor from the payer. The command requires an interactive terminal and has no access to the agent wallet's executor; 17 tests check that no code path lets an agent run it. Every refusal and override is logged. This guard is a convenience on the client side; the hard guarantee is the payer contract.

---

## 4. Architecture

```
 ERC-8004 registries (Monad 143 / 10143)       NewFeedback · FeedbackRevoked · MetadataSet · Transfer · Upgraded
        │                                       │
        │                    ┌──────────────────┴───────────────────┐
        │                    │ indexer/  Envio HyperIndex + HyperSync │  edges (R1–R8), survival scan,
        │                    │ Monad 143, 10143, Optimism             │  certificate audit
        │                    └──────────────────┬───────────────────┘
        │                                       ▼
        │                    solver/  PPR per anchor, from zero ──► certifier (submit on every graph change)
        │                                       │                      watcher (audit, proofs)
        │                                       ▼
        └──── re-read every edge ──► contracts/AnchoredReputation.sol
                                         │ submitCertificate · proveEdge · proveWallet · assess
                                         ▼
                              passesAnchorPolicy(agentId, setId)
                                 │                         │
                 contracts/TrustGatedPayer.sol      plugin/ mm ancre (agent-side check,
                 ERC-1271, holds USDC, x402          human-only override)
```

| Component | What it is | Tests (MEASURED, 2026-10-06 on this commit unless stated) |
|---|---|---|
| [`contracts/`](contracts/) | `AnchoredReputation` (verifier, v1) and `TrustGatedPayer` (ERC-1271 payer), Solidity 0.8.28, Foundry ≥ 1.8 with `network = "monad"` | **147 passing**, including forks of Monad mainnet and testnet against the real registries |
| [`solver/`](solver/) | Edge rules, PPR solver, certificate encoder (`ancre-cert-v1`), certifier service, watcher, Python | **135 passing** |
| [`indexer/`](indexer/) | Envio HyperIndex indexer, three chains, parity with the solver | 28 passing (2026-10-05, reported by the indexer session; not re-run here) |
| [`plugin/`](plugin/) | `mm ancre` plugin for the MetaMask Agent Wallet | 48 passing (2026-10-01, `docs/chantiers/rapports/05.md`) |
| [`docs/erc/`](docs/erc/) | Draft ERC, 15 test vectors, an independent verifier (`verify.py`, Python standard library only) | `eipw` lint: 0 errors; `verify.py`: 0 failures (2026-10-01) |

The certificate is a single transaction sent directly from an account (not through a relayer or multicall), so the indexer can decode it from calldata and audit it.

---

## 5. Replay act 1 in five minutes

Act 1 is the measurement on the real registry. You need Python 3 (tested with 3.14) and, for the live part, [Foundry](https://book.getfoundry.sh/) (`cast`).

**Offline, from the versioned snapshot** (about one second once installed; MEASURED from a fresh virtual environment, 2026-10-06):

```bash
git clone https://github.com/ygk94/ancre.git && cd ancre/solver
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python run_mainnet.py      # rewrites and prints out/mainnet.md
```

It prints, for the snapshot of 9,283 entries: the edges that survive the schema (§0), Eve-8004 naive versus ANCRE (§a), the risk-screening leak with and without the measurement rule (§b), the honest chain and the second hop (§d), and the `slash` that dominates a later `+1` (§e).

**Live, on Monad mainnet** (read-only; `rpc1.monad.xyz` accepts long argument lists and full-history log queries):

```bash
R=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63; RPC=https://rpc1.monad.xyz
# the standard refuses to average without a list of trusted raters
cast call $R "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 182 "[]" "" "" --rpc-url $RPC
# → execution reverted: clientAddresses required
# the naive answer: average over every rater of Eve-8004
C=$(cast call $R "getClients(uint256)(address[])" 182 --rpc-url $RPC)
cast call $R "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 182 "$C" "" "" --rpc-url $RPC
# → 7665, 1526418786692759295499021526418786791 [1.526e36], 0      (block 110,993,179, 2026-10-06)
```

**Then on-chain** **[TBD: once deployed, §7]**: `passesAnchorPolicy(182, <demo setId>)` on our contract returns `false`, for 29,231 gas.

**Act 2** is our own traffic: honest providers, a scripted Sybil farm that pays its target for real, an anchor whose key is stolen, an anchor that vetoes a provider, and the second hop. Runbook: **[TBD: `demo/RUNBOOK.md`, lot 06]**. Transaction hashes: **[TBD]**.

---

## 6. Run the tests

```bash
cd contracts && forge test                     # 147 tests; fork tests need network access
cd solver && .venv/bin/python -m pytest -q tests
cd indexer && pnpm install && pnpm test
cd plugin && npm install && npm test
python3 docs/erc/assets/erc-0000/verify.py    # independent check of the ERC test vectors
```

Gas report: `cd contracts && forge test --match-contract "GasTest|RegistryBenchTest" -vv`.

---

## 7. Deployed addresses

| Contract | Monad testnet (10143) | Monad mainnet (143) |
|---|---|---|
| `AnchoredReputation` | **[TBD]** | **[TBD]** |
| `TrustGatedPayer` | **[TBD]** | **[TBD]** |
| Demo anchor set (`setId`) | **[TBD]** | **[TBD]** |
| ERC-8004 Identity (canonical, not ours) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 Reputation (canonical, not ours) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| Indexer GraphQL (Envio Cloud) | **[TBD]** | |

Source verification: **[TBD: MonadVision / Sourcify links]**.

---

## 8. Gas measurements

Foundry 1.8.3, solc 0.8.28 via-IR, `network = "monad"`, forks against the real registries. MON amounts at 102 gwei (MEASURED gas price, 2026-09-28). Source: [`contracts/GAS.md`](contracts/GAS.md) and [`contracts/PAYER.md`](contracts/PAYER.md). **[TBD: re-measure after lot 02-bis.]**

| Operation | Gas | ≈ MON | Status |
|---|---|---|---|
| Demo certificate, 300 edges, 100 nodes, 3 anchors, **Registry-verified** | 14,974,802 | 1.53 | MEASURED 2026-10-01 |
| Same, Submitter-attested | 1,351,917 | 0.14 | MEASURED 2026-10-01 |
| Real mainnet graph (6 nodes, 5 edges), Registry-verified, first certificate | 1,028,760 | 0.10 | MEASURED 2026-10-01, fork of mainnet |
| Register an anchor set (4 tags) | 423,614 | 0.04 | MEASURED 2026-10-01 |
| `passesAnchorPolicy` on an unknown agent (a farm is refused) | 29,231 | 0.003 | MEASURED 2026-10-01 |
| `assess`, no veto, strict transfer check | 80,609 | | MEASURED 2026-09-28 |
| `assess` with live veto | 139,055 – 165,888 | | MEASURED 2026-09-28 |
| x402 settlement through `TrustGatedPayer`, `exact` | 327,909 (EOA baseline 144,605) | 0.033 | MEASURED 2026-10-01 |
| x402 settlement through `TrustGatedPayer`, `upto` | 385,876 | 0.039 | MEASURED 2026-10-01 |
| A proof (`proveEdge`, omission, dilution, fabrication) | 258,685 – 304,293 | ≈ 0.03 | MEASURED 2026-10-01 |
| Deployment (simulation) | 8,804,333 | 0.90 | MEASURED 2026-09-28 |

- A Registry-verified certificate costs about 45 k gas per edge re-read; the 30 M transaction limit (DOC) caps it at about 630 edges with 3 anchors (CALCULATED, `docs/chantiers/rapports/02.md` §3).
- The trust check adds about 183 k gas to an x402 payment, paid by the facilitator: 2.3 times an ordinary transfer.
- Recomputation to on-chain receipt: 157 to 390 ms on a local fork, measured with the earlier v0 contract (MEASURED 2026-09-28, `docs/chantiers/rapports/04.md`). **[TBD: testnet latency.]**

---

## 9. Honest limits

- **Registry-verified does not close omission or dilution.** The registry has no index by rater, so the contract cannot check that a row is complete. A certificate that leaves out edges, or under-declares a row's total, is accepted and only corrected once someone proves the gap. The lower bound holds once every gap has been proven, not before. We never call the certificate "unforgeable" (`contracts/PROOFS.md`, "Guarantees").
- **An open set needs a watcher.** On a set where anyone may submit, a diluted certificate can replace an honest one until it is proven wrong. For the judging period, our watcher audits every certificate **[TBD: watcher running, lot 04-E5]**; a set owner can also restrict submission to attested submitters.
- **The honest graph on mainnet is tiny.** Eleven edges survive. ANCRE kills the farm but says "unknown" for nearly everyone. It does not rank honest agents on today's data.
- **Relative to the reader.** ANCRE protects a reader from anchors it did not choose, not from its own choice of anchors.
- **Fail-closed liveness.** If nobody recertifies, payments stop after the set's maximum age. ANCRE becomes a liveness dependency of every payer that uses it.
- **The registries are upgradeable proxies.** The certificate commits the registry version; after an upgrade, the status becomes `REGISTRY_CHANGED` and payments stop until recertification (tested against the pending upstream v2.1.0 on a fork, `contracts/test/Upgrade.t.sol`).
- **A live veto is the anchor's latest rating.** Any later rating by the same anchor on the same agent lifts the live veto; only the certified veto bit remains. Anchors must re-post a veto rather than rate the agent again.
- **Recertification, not every block.** We recompute on every change of the graph, not on every block.
- **A former owner can rate an agent right after transferring it.** The rule set accepts it (the alternative was unverifiable on-chain); the screen shows it as a diagnostic.
- **The contract is 33,527 bytes.** It fits Monad's 128 KB limit (DOC) but not Ethereum's 24 KB (EIP-170). The ERC's reference implementation will need splitting before it targets Ethereum.
- **The x402 facilitator path is tested on forks**, with a facilitator emulated after the open-source `x402-rs`. **[TBD: result of the real testnet settlement through `x402-facilitator.molandak.org` (test T1).]**

---

## 10. Why Monad

ANCRE runs next to the canonical ERC-8004 registries on Monad, where we measured the farm it defeats. The registries exist on both mainnet and testnet, so every test and the act-2 rehearsals run against the real contracts. Three properties of the chain make the design practical rather than theoretical:

1. **Short blocks.** We measured 0.302 s per block over 1,000 blocks (MEASURED, 2026-09-27; the documentation says 300 ms). An anchor's veto is read live, so the next payment, one block later, is refused.
2. **Cheap contiguous storage (MIP-8).** Trust vectors are stored as contiguous arrays, so any contract reads a decision without a proof, for 29 k gas when the agent is unknown and 80–166 k when it has trust.
3. **Large, cheap transactions, and a 128 KB code limit.** Re-reading every edge from the registry costs 15 M gas for a 300-edge graph and still fits in one transaction; on the real mainnet graph a certificate costs about 0.1 MON. That makes the strongest verification level routine, and lets us recertify on every graph change.

The standard itself is chain-agnostic, since ERC-8004 is deployed on many chains; Monad is where its strongest level is cheap enough to run continuously.

---

## 11. Prior art and complementary projects

- **OpenRank (Karma3)** already prototyped verifying an EigenTrust fixed point on-chain. We do not claim that idea.
- **trustgraphs** (AInima-Collective) computes anchored PageRank with zero-knowledge proofs, on EAS rather than ERC-8004.
- Personalized PageRank and its Sybil bound are classical (EigenTrust's pre-trusted peers; Cheng and Friedman, 2005). What ANCRE adds is the combination: anchors chosen by the reader, unmodified ERC-8004 as the data source, an on-chain certificate re-read against the registry, and the score read by the paying contract itself.
- A post in the ERC-8004 discussion thread (ethereum-magicians #25098, post #309) asked for reputation relative to reader-chosen anchors.

**Complementary layers.** Several projects answer other questions about the same agents: whether a cited payment really happened (receipts), where a rater's funds came from (payment provenance), whether a task was validated, whether an action fits a policy. ANCRE answers a different one: does someone **you** trust vouch for this agent, directly or transitively? In the draft ERC, such signals plug in as optional edge filters (`edgeFilterId`). We do not enable a "receipt is real" filter by default, because a farm that pays itself would pass it.

---

## 12. Repository map

```
contracts/   AnchoredReputation.sol, TrustGatedPayer.sol; ENCODING.md (format v1), PROOFS.md, GAS.md, PAYER.md
solver/      graph.py (edge rules), ppr.py (certificate), certifier.py, watcher.py, run_mainnet.py, data/ (snapshot)
indexer/     Envio HyperIndex: config.yaml, schema.graphql, src/, analytics/ (survival scan)
plugin/      mm ancre: src/, skills/ancre/SKILL.md, DEMO.md
docs/erc/    draft ERC, test vectors, verify.py
docs/        design notes and decision log (D1–D55), in French
```

Research before the first commit (a private notes vault on ERC-8004, Monad and reputation algorithms, from early September 2026) is summarized in `docs/` and is identified as such; all code in this repository was written during the hackathon.

---

## 13. AI tool disclosure

This project was built with heavy use of an AI coding agent, **Claude Code** (Anthropic). The agent drafted most of the research notes; the design-review "council" documents in `docs/conseil/`, where five expert voices are **simulated by a single model** (their independence is a writing discipline, not a guarantee); the PPR solver and its tests; the verifier and payer contracts, their tests and gas measurements; the Envio indexer; the MetaMask plugin; the draft ERC; and this README.

The human team set the goals, took every design decision recorded in the decision log (D1–D55 in `docs/conseil/CR-conseil.md`), chose what to measure, and reviewed **[TO FILL by the team: which parts were reviewed line by line — e.g. contract logic, certificate verification, payer — and which parts only at the level of tests and runs]**.

Every number in this README was produced by a script or test in this repository, or by an on-chain read whose command is given, and can be re-run. AI-generated text was checked against those outputs.

---

## 14. Licenses

- Code (`contracts/`, `solver/`, `indexer/`, `plugin/`, `app/`, `demo/`): **MIT**, see [`LICENSE`](LICENSE).
- The draft ERC text (`docs/erc/anchored-reputation.md`): **CC0-1.0**, as required by EIP-1.
- Dependencies keep their own licenses: `forge-std` (MIT / Apache-2.0); the MetaMask Agent Wallet SDK is a peer dependency and is not vendored.

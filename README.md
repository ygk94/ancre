# ANCRE — Anchored Reputation for Trustless Agents

> Reader-anchored, Sybil-resistant, on-chain-certified aggregation of **ERC-8004** agent feedback — readable by contracts before they pay.
>
> Built for **Monad Metropolis** (track 04 — Trust, Identity & AI Infra, submissions close **2026-10-13**). Reference implementation of a proposed ERC.

*Research snapshot: 2026-09-21/23. Every number below was measured, not assumed. Unverified items are labelled.*

---

## 1. The problem, measured on Monad mainnet

ERC-8004 registries are live on **Monad mainnet (chainId 143)**, both at version `2.0.0`, and **absent from the testnet** (verified via `eth_getCode` + `getVersion()`):

- IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

| Measurement (2026-09-21) | Value |
|---|---|
| Agents registered on Monad | **10,171** |
| Feedback entries | **9,188**, about **84 agents** only |
| Share coming from a single farm | **83 %** — 7,665 `monad://Spawn-8004` agents, registered on 16–17 Feb 2026 at ~300/hour, each rating `monad://Eve-8004` (#182) at 100 |
| Entries at `1e38` (max `int128` range used) | **117**, all on Eve-8004 |
| Naive mean of Eve-8004 | **1.5 × 10³⁶** |
| Agents #9 / #87 | 518 / 508 entries, **each from one single wallet** (tag `elo`, values ≈1,600) |
| Mixed units in one registry | 0–100 scores, Elo ≈1,600, ±1 votes, `1e38` |
| Useful graph | only **36 edges** where the rater is itself a rated agent |
| Revoked entries | 0 |

Data source: `https://www.8004scan.io/api/v1/{feedbacks,agents}?chain_id=143` (no key; `offset` pagination for feedback, `cursor` for agents). ⚠️ This is 8004scan's index, not a direct log read — **cross-check with HyperSync on day 1**.

### What the standard itself says
- `getSummary(agentId, [], ...)` **reverts** (tested on mainnet): *"clientAddresses MUST be provided (non-empty); results without filtering by clientAddresses are subject to Sybil/spam attacks"*.
- *"Sybil attacks are possible… We expect many players to build reputation systems"*.
- There is **no `feedbackAuth`** in v2.0.0: anyone can rate any agent, for free, without the agent's consent. The only guard, `!isAuthorizedOrOwner(msg.sender, agentId)`, blocks the owner but not a second wallet.
- The off-chain feedback file has an optional `proofOfPayment {fromAddress, toAddress, chainId, txHash}`, and **nothing verifies it**.

**The standard delegates Sybil filtering to the reader and gives the reader no tool to do it.** That is the gap.

External corroboration: arXiv 2606.26028 reports coordinated Sybil behaviour among **73.5 % (Ethereum), 59.2 % (BSC), 90.6 % (Base)** of raters.

---

## 2. Prior art (measured 2026-09-21)

| Project | What it does | State | Delta with ANCRE |
|---|---|---|---|
| **ColinkaMir/monad-agent-trust** ⚠️ | Payment provenance on **Monad, same dataset**: did the rater pay, and did the agent owner fund the rater? Finds **16 clean entries out of 9,188** | ★0, created 2026-09-18, pushed daily | Heuristics, no graph algorithm, not contract-readable → **use as an edge filter, do not compete** |
| **Pfand**, **Agent Veil** | EigenTrust / TrustRank over 8004, **off-chain** | ★0 / ★15 | Nothing verifiable on-chain |
| **RNWY**, **TrustLayer** | Multi-chain scoring, signed oracle on Base / daily heuristics | ★0 | Operator trust, daily refresh |
| **AInima-Collective/trustgraphs** | Seeded PageRank **proven in ZK (SP1)**, verified on-chain | ★8, Sepolia | Built on **EAS, not 8004**; their own notes refuse to claim "proven" while completeness of an external registry is unsolved |
| **OpenRank PoC** (Karma3) | EigenTrust iteration verification + Merkle challenge | archived 2025 | ⚠️ **Fixed-point verification is not a new idea** — do not pitch it as one |
| **zk-eigentrust** | Halo2 circuit | archived 2023, 4 neighbours max | Unusable at scale |
| **Reputation-Slasher**, **Veylux** | Staked/slashable reviews, SybilRank | ★1 | Different mechanism |

**No ERC covers aggregation.** Checked in `ethereum/ERCs`: neighbouring agent ERCs are about other things (8033 councils, 8122 minimal registry, 8126 verification, 8217 NFT bindings, 8257 tools, 8273 attestations, 8354 ZK verdicts). Three "reputation" PRs were closed unmerged (#1757, #1631, #1229).

**Open and unanswered:** ethereum-magicians thread #25098 (390 posts), **post #309 (2026-07-23)** asks for reputation relative to *reader-chosen anchors*, citing "personalised PageRank and EigenTrust's pre-trusted peers". No author replied. Repo issues #99 (x402-backed feedback), #90 (capital-backed disputes), #78 (link to ERC-8183): nothing shipped.

### What is genuinely new here
1. **Reader-relative trust, readable by a contract**: `trustOf(agentId, anchorSetId)`.
2. **Certification at chain cadence** — everything else refreshes daily; a negative signal from an anchor propagates in **~0.6 s**.
3. **An exposed error bound**, not just a score.
4. **Trust as a payment condition**: the router refuses below threshold. *The refusal comes from the contract, not the app.*

---

## 3. Mechanism

**Personalized PageRank (the EigenTrust family)** — the only classical scheme with *both* a formal Sybil bound and a **one-pass certificate**.

- Fixed point: `t = (1 − α)·Cᵀt + α·p`, where `p` is the reader's anchor distribution.
- **Sybil bound**: mass entering a Sybil region only crosses attack edges — `π(S) ≤ ((1−α)/α)·Σ π(u)·c_uv` (Cheng & Friedman 2005: only anchored, asymmetric functions can be Sybil-resistant). A farm of 7,665 mutually-rating accounts receives **nothing** unless an anchor trusts it.
- **Certificate**: `F` is a contraction, so `‖t − t*‖₁ ≤ ‖t − F(t)‖₁ / α`. Verifying = **one** sparse matrix–vector product, O(edges).
- **Linearity in `p`**: precompute one vector per anchor; any anchor set is a combination, no recomputation.

**Graph construction from 8004** (the registry graph is bipartite wallet→agent):
- node = agent; edge `A → B` if a controller (ERC-721 owner or `agentWallet`) of A rated B;
- weight = value **normalized per tag** (declared scale), times an optional provenance filter (drop the edge if the rater was funded by the rated agent's region — ColinkaMir's signal);
- `FeedbackRevoked` removes the edge; feedback from accounts controlling no node and not anchored **carries zero weight**. That is the core Sybil property.

```
NewFeedback / FeedbackRevoked  (ReputationRegistry 0x8004BAa1…)
        │  indexer (Envio HyperSync — public getLogs is capped at 100 blocks)
        ▼
 off-chain solver: PPR per anchor ──► publish(epoch, edges in calldata, t, root) + bond
        ▼
 AnchoredReputation.sol : recompute keccak(edges), check residual ≤ ε, store t per anchor set
        │                 ▲ challenge: readFeedback(agent, client, idx) proves an omitted edge → slash
        ▼
 trustOf(agentId, anchorSetId) ──► TrustGatedRouter (x402 `upto`, USDC) / any third-party contract
```

---

## 4. Feasibility numbers

Gas estimates below are **estimates, not benchmarks** — replace with `forge test --gas-report` (Foundry ≥ 1.8, `network = "monad"`) on day 1.

- Edge as `(uint32 i, uint32 j, uint64 w)` = 16 bytes calldata ≈ 256 gas, plus arithmetic ⇒ **~350–400 gas/edge**.
- **30M gas/tx ⇒ ~60–75k edges per tx**; the **real 9,188-entry graph fits in one tx** (~3.7M gas), ≈ **0.37 MON** at the 100 gwei floor.
- ⚠️ Reading feedback from the registry's **storage** is impractical (~20k gas/edge under MIP-8: 8,100 per cold page) → **calldata is mandatory**, and the link back to the registry is an optimistic challenge.

**What Monad actually changes**
- ❌ Not "recompute every block forever": 3.7M gas × 288k blocks/day is not viable. Recompute **on graph change** — that is what makes a negative signal sub-second.
- ✅ **Optimistic challenge windows in seconds, not days** (watchers are bots; finality ~0.6 s).
- ✅ **Several anchor columns per update**: 20 anchors × 1,000 edges ≈ 8M gas, trivial inside a 150M block.

**Payments** (Dwork–Naor 1992: make the cost land in someone's pocket instead of a radiator) — verified live:
- Monad x402 facilitator `https://x402-facilitator.molandak.org/supported` → v2, `exact` + `upto`, `eip155:143` and `eip155:10143`
- native USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 decimals), `@x402/evm ≥ 2.22.0`
- ⚠️ **Payment alone fails**: the Eve farm paid, and the owner had funded the raters. Payment weights an edge; it never replaces anchoring.

**Monad gotchas to code from day 1**: you pay the gas *limit*, not gas used (set it tight) · epochs in `block.number`, not `timestamp` (3–4 blocks share a second) · never draw anchors/auditors from `prevrandao` (leader knows it) · 10 MON reserve balance per account (matters when spawning a demo farm) · **registries are mainnet-only** → deploy your own 8004 registries on testnet for development, read mainnet read-only · `eth_getLogs` ≤ 100 blocks.

---

## 5. The demo — "trust circuit breaker"

A buyer agent pays provider agents per call over x402 `upto`, through a `TrustGatedRouter`.

1. **Tonight's real Monad registry.** Naive ranking puts Eve-8004 first (7,665 reviews, mean 1.5e36). ANCRE puts it at zero. *No synthetic data — that is mainnet.*
2. **Live attack.** Spawn a Sybil farm rating a malicious provider. The naive leaderboard explodes on screen; the ANCRE score does not move; the router **refuses to pay**.
3. **Live betrayal.** An honest provider starts returning garbage. **One** anchor rates it negatively → at the next block, **every other agent's router stops paying it**. On-screen counter: losses bounded to N calls / X ms.
4. **Relativity.** Two readers with different anchors see two different rankings **of the same registry** — the visible answer to #309.

Optional: the router charges a price **inversely proportional to trust** — unknowns pay, trusted agents pass nearly free.

> **Pitch:** *ERC-8004 says its own reputation is Sybil-attackable and leaves filtering to the reader. On Monad mainnet, 83 % of all feedback comes from one farm of 7,665 fake agents. We give the reader the tool the standard promised: reputation relative to their anchors, certified on-chain, readable by a contract before it pays.*

---

## 6. Known weaknesses (say them before the jury does)

1. **Fixed-point verification already exists** (OpenRank PoC). The novelty is the combination: reader anchors + contract-readable + Monad cadence + 8004 graph.
2. **The real graph is too thin to rank honest agents** — 36 useful edges. ANCRE kills the farm but says "unknown" for almost everyone. The positive demo needs our own agent traffic; that is also the message: *today, 99 % of Monad's agent reputation is worthless.*
3. **Completeness is optimistic, not proven** — no registry hook (see §7 ask).
4. **Anchor choice is political.** That is the thesis: the reader chooses. Ship transparent default sets.
5. **ColinkaMir is active on the same dataset.** Position as complementary; consider reaching out.
6. **Identity/reputation themes convert poorly in demo-vote formats** (×0.77 in the Monad Blitz dataset). Without the live attack + circuit breaker, this is a slide, not a project.

---

## 7. The proposed ERC — full draft

Chain-agnostic on purpose: ERC-8004 sits at identical addresses on 40+ chains, and a chain-specific standard would read as a local hack. **Monad is where the strongest conformance level becomes cheap**, not a clause in the text.

| | Ethereum L1 / slow L2s | Monad |
|---|---|---|
| Interface, tags, certificate | identical | identical |
| Achievable level | `Optimistic` in practice | **`Verified` on every graph change** |
| Freshness (`block.number − epoch`) | minutes to hours | **1–2 blocks, < 1 s** |
| Challenge window | hours/days | seconds |

Closest EVM competitor is Base (150 Mgas/s, ~200 ms Flashblocks preconfirmations) — but a preconfirmation is a single sequencer's promise, and for a standard about *not* trusting operators, building `Verified` on that is self-defeating. Monad: 500 Mgas/s, ~0.6 s BFT finality, ~200 validators. Watch Denim (Base, 200 ms canonical blocks, targeting Nov 2026), ZKsync Atlas, and Monad's own Cadence (100 ms) — the edge is real today, not permanent.

<details>
<summary><b>ERC draft (working text, 2026-09-21)</b></summary>

```
eip: TBD
title: Anchored Reputation for Trustless Agents
description: Reader-anchored, certifiable aggregation of ERC-8004 feedback, readable by contracts
author: TBD
discussions-to: https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098
status: Draft
type: Standards Track
category: ERC
created: 2026-09-21
requires: 8004
```

### Abstract
ERC-8004 records feedback about agents but explicitly leaves aggregation and Sybil filtering to readers: `getSummary` requires a caller-supplied list of `clientAddresses`, and the specification states that "Sybil attacks are possible". This ERC standardizes the missing layer in three parts: **tag schemas** giving feedback values a declared scale; an **aggregator interface** returning a score relative to reader-chosen anchors, with an error bound and an observation block; and a **certificate format** with two conformance levels, `Verified` (fixed point checked on-chain) and `Optimistic` (bonded and challengeable). The standard is chain-agnostic; freshness is an explicit, reader-checkable property of every result.

### Specification
RFC 2119 / RFC 8174 keywords apply.

**1. Definitions.** *Registry*: an ERC-8004 Identity Registry and its Reputation Registry, identified by `(chainId, identityRegistry)`. *Node*: an agent `(registry, agentId)` or an anchor address. *Controller*: the ERC-721 owner and, if set, `agentWallet`, as of the epoch. *Anchor set*: sorted, de-duplicated nodes; `anchorSetId = keccak256(abi.encode(nodes))`. *Epoch*: block number up to which feedback was observed. Fixed-point unit: `1e18`.

**2. Tag schemas.**
```solidity
struct TagSchema { string tag; int256 min; int256 max; uint8 decimals; bool higherIsBetter; }
```
Normalization: rescale `value` to `decimals`; if outside `[min, max]` the feedback MUST be **discarded** (aggregators MUST NOT clamp); else `x = (v − min)·1e18/(max − min)`, inverted if `!higherIsBetter`. Feedback whose `tag1` has no schema in the certificate's schema set MUST be ignored. A schema set is committed as `schemaRoot` (Merkle root of `keccak256(abi.encode(TagSchema))`, leaves sorted by `keccak256(bytes(tag))`). Optional shared registry:
```solidity
interface ITagSchemaRegistry {
    event TagSchemaRegistered(bytes32 indexed schemaId, address indexed registrant, TagSchema schema);
    /// schemaId = keccak256(abi.encode(registrant, schema.tag))
    function registerTagSchema(TagSchema calldata schema) external returns (bytes32 schemaId);
    function tagSchema(bytes32 schemaId) external view returns (TagSchema memory);
}
```
Keying by `(registrant, tag)` prevents tag squatting; the choice is visible in `schemaRoot`.

**3. Graph construction.** For every non-revoked feedback with index ≤ the committed last index, from `clientAddress` about agent `B`, and for every node `A` controlled by `clientAddress` (or `A = clientAddress` if it is an anchor address), add `x` to `w(A → B)`. Self-edges MUST be excluded. Feedback from addresses controlling no node and not anchored creates no edge. Extra edge filters (e.g. payment provenance) MUST be reflected in the `algorithm` identifier.

**4. Algorithm `PPR-v1`** (MUST be supported). With `C` row-normalized and `p` uniform over the anchor set, `t` (entries in `1e18`, `Σt = 1e18`) is the unique fixed point of `F(t) = (1 − α)·Cᵀt + α·p`; dangling mass goes to `p`; `α ∈ (0, 1e18)` is committed. `F` is a contraction of factor `(1 − α)` in L1, so `r = ‖t − F(t)‖₁ ⇒ ‖t − t*‖₁ ≤ r/α`. Implementations MUST add `nnz(C)` units to `r` for fixed-point rounding. `trustOf` MUST return `score = t_i·N` (so `1e18` = uniform baseline) and `errorBound = (r/α)·N`; consumers SHOULD use `score − errorBound`.

**5. Certificate.**
```solidity
enum Level { Optimistic, Verified }
struct Certificate {
    uint256 chainId; address reputationRegistry; uint64 epoch;
    bytes32 feedbackRoot;   // Merkle root of edge leaves keccak256(abi.encode(from,to,weight)), sorted by (from,to)
    bytes32 lastIndexRoot;  // (agentId, client, lastIndex) observed at epoch
    bytes32 schemaRoot; bytes32 algorithm; uint64 alpha;
    uint32  nodeCount; bytes32 scoresRoot; uint256 residual; Level level;
}
```
`Verified`: the contract received the full edge list and `t` in calldata, recomputed `feedbackRoot` and checked `residual` in the same transaction. `Optimistic`: posted with a bond; during a window of `W` blocks anyone MAY challenge — *omission* (a non-revoked feedback with index ≤ committed `lastIndex`, absent from `feedbackRoot`), *fabrication* (an edge the registry does not support), or *residual* (a row of `F(t)` disagreeing beyond `residual`, proven by Merkle proofs). A successful challenge MUST slash the bond and invalidate the certificate.

**6. Aggregator interface.**
```solidity
interface IAnchoredReputation {
    event AnchorSetRegistered(bytes32 indexed anchorSetId, bytes32[] nodes);
    event CertificatePublished(bytes32 indexed anchorSetId, uint64 indexed epoch, Certificate cert);
    /// nodes: keccak256(abi.encode(chainId, identityRegistry, agentId)) or bytes32(uint256(uint160(addr)))
    function registerAnchorSet(bytes32[] calldata nodes) external returns (bytes32 anchorSetId);
    function trustOf(uint256 agentId, bytes32 anchorSetId)
        external view returns (uint256 score, uint256 errorBound, uint64 epoch, Level level);
    function certificate(bytes32 anchorSetId) external view returns (Certificate memory);
    function supportsInterface(bytes4 interfaceId) external view returns (bool); // ERC-165
}
```
`trustOf` MUST revert without a valid certificate, and MUST NOT serve a certificate still inside its challenge window unless `level == Verified`. Consumers SHOULD enforce `block.number − epoch ≤ maxAge` and a minimum level; this ERC deliberately fixes no `maxAge`.

### Rationale
Only anchored, asymmetric functions can be Sybil-resistant (Cheng & Friedman 2005); reader-chosen anchors also answer the "no single score" objection raised by ERC-8004 contributors. Among EigenTrust (2003), Advogato (1999), SybilGuard/SybilLimit and SybilRank, PPR alone has both a formal bound and a one-pass certificate (Advogato's max-flow certificate is binary; SybilRank needs `log n` early-stopped iterations). PPR is linear in `p`, so anchor sets compose. Two levels keep one text across fast and slow chains. Discarding rather than clamping stops a single `1e38` from reaching the top of the scale. Prior art: OpenRank PoC (iteration verification with fraud proofs), trustgraphs (ZK seeded PageRank over EAS).

### Backwards Compatibility
No ERC-8004 change required. **Requested for a future revision**: record `block.number` per feedback, or a cumulative per-agent counter — without it, feedback from a `(agentId, client)` pair first seen near the epoch cannot be proven to predate it, so `Optimistic` omission proofs are incomplete.

### Security Considerations
Anchor capture (use several independent anchors; leakage is bounded by the anchor's out-weight) · completeness gap (above) · stale reads (consumers MUST check `epoch`) · controller changes between epochs · **payment is not honesty** (self-funded rings observed on-chain) · fixed-point rounding (the `nnz(C)` term) · gas: `Verified` is O(edges); implementations MUST bound calldata per tx and MAY split verification across transactions.

### Copyright
CC0.
</details>

**Before submitting the ERC:** fill `author`; publish the reference implementation; re-check the maths (the `score = t·N` and `errorBound = (r/α)·N` conventions and the edge weighting are design choices, not settled).

---

## 8. Plan (3 weeks to 2026-10-13)

| Week | Deliverable |
|---|---|
| **W1 (Sep 22–28)** | 8004 indexer (HyperSync) + PPR solver + per-tag normalization + mainnet snapshot · `AnchoredReputation.sol` + **real gas report** |
| **W2 (Sep 29–Oct 5)** | Own 8004 registries on testnet · `TrustGatedRouter` + x402 `upto` via the Monad facilitator · omission challenge · Sybil-farm script |
| **W3 (Oct 6–12)** | Live demo screen (`monadLogs`): naive vs ANCRE, circuit breaker · **mainnet (143)** deploy · video · project profile · **ERC draft published** (PR to `ethereum/ERCs` + reply to thread post #309) |

**Stackable bounties:** Envio 1k$ (indexer) · MetaMask 2.5k$ (agent wallet plugin — ship the router as a snap) · Monad Foundation 2.5k$ (passkeys — anchors as P256 accounts via precompile `0x0100`).

---

## 9. Data

`data/` is **not** in this repo yet. Reproduce with the endpoints in §1; the 2026-09-21 snapshot (`fb.json`, 9,188 entries; `agents.json`, 10,171 agents) lives in the research vault under `2 - EVM/Monad (L1)/Hackathons/_data-metropolis/`.

## 10. Status

Research and specification complete; **no code written yet**. Next action: `AnchoredReputation.sol` with a real gas report, to replace the estimates in §4.

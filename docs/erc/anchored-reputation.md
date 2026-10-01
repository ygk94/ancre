---
eip: TBD
title: Anchored Reputation for Trustless Agents
description: Reader-anchored, Sybil-bounded aggregation of ERC-8004 feedback, certified on-chain and readable by a contract before it pays
author: TBD
discussions-to: TBD
status: Draft
type: Standards Track
category: ERC
created: 2026-10-01
requires: 721, 8004
---

⟦Texte du chantier 08, 2026-10-01, réécrit à partir du draft R6 (27/09) pour l'aligner sur les décisions D20 à D46 du CR et sur l'implémentation v1 (`contracts/ENCODING.md` unifié du 01/10, `solver/FORMAT.md`, `contracts/PROOFS.md`). Les notes en français entre ⟦ ⟧ sont internes et DOIVENT être retirées avant soumission. ⟦OPEN⟧ marque un point que le CR n'a pas tranché. La correspondance ancien texte → nouveau texte est dans `docs/erc/CHANGES.md` (section 08). Avant soumission : `author` (🧑 Hugo), `discussions-to` (fil dédié à ouvrir, voir `drafts/`), numéro attribué par les éditeurs.⟧

## Abstract

[ERC-8004](./eip-8004.md) records feedback about agents but leaves aggregation and Sybil filtering to readers: `getSummary` requires a caller-supplied list of clients, and the ERC states that Sybil attacks are possible. This ERC standardizes that missing layer.

An **anchor set** is an immutable, content-addressed description of *whom the reader trusts to start with* (anchors and their weights), *how feedback becomes edges* (a tag schema with declared scales and kinds), and *when an agent may be paid* (a policy). For each anchor set, a **certificate** publishes, per anchor, a personalized-PageRank trust column over the ERC-8004 feedback graph and a one-hop distrust vector. The aggregator contract accepts a certificate only if every submitted trust value is a **sub-solution** of the committed graph (`t ≤ F(t)` coordinate by coordinate), which makes it an exact per-agent **lower bound** of the true trust as long as the committed graph is dominated by the registry. At the `RegistryVerified` level, the contract re-reads every committed edge in the registry at submission, so fabricated or inflated edges are refused. Edges that are omitted, diluted or changed after submission can be proven by anyone. A proof only widens the certificate's bounds. It never moves funds.

Contracts read the result synchronously. `isTrusted(agentId, setId)` applies the policy committed in the set: leave-one-anchor-out trust, distrust ratio, live anchor veto, freshness and transfer. It never reverts. Anchors veto an agent with immediate effect by posting negative feedback in the registry.

## Motivation

- **Aggregation is required by ERC-8004 but unspecified.** ERC-8004 expects "many players to build reputation systems" and leaves Sybil filtering to the reader, but defines no interface for the result. As of 2026-09-21, at least eight independent aggregators existed, each with its own API. A contract cannot consume reputation without trusting one vendor's off-chain service.

- **Raw feedback is not comparable.** On Monad mainnet (chain ID 143), which runs ERC-8004 v2.0.0, one registry mixed 0–100 ratings, Elo ratings around 1,600, ±1 votes and 117 values of `1e38`. The naive mean of the most-rated agent was about 1.5 × 10³⁶ *(measured 2026-09-21, unchanged on 2026-09-27)*. Without a declared scale per tag, every average is meaningless.

- **Sybil farms dominate unfiltered data.** On the same deployment, 7,665 of 9,188 feedback entries (83 %) came from agents registered within about 48 hours, all rating one agent at the maximum *(measured 2026-09-21; 82.6 % of 9,283 on 2026-09-27, after 95 entries posted by one automated relayer)*.

- **Payment is not a defence.** The farm above paid for its interactions, and the raters were funded by the rated agent's owner. A third-party analysis of the same data found 16 entries out of 9,188 with clean payment provenance *(reported 2026-09-21, not re-verified)*. Another third-party service reports that 73 of 85 payment claims in ERC-8004 evidence documents on that chain cite a transaction absent from the chain they name *(self-reported, read 2026-09-28)*. A receipt, true or false, says nothing about whether the payer is independent of the payee.

- **The registry's own guard is bypassed in practice.** `giveFeedback` rejects the owner and operators of an agent, but not its `agentWallet`. On the same deployment, one agent received 78 entries from its own `agentWallet`, 178 wallets are each the `agentWallet` of several agents (1,773 agents in total, up to 762 per wallet), and the wallet was cleared at each of the 72 historical transfers *(measured and checked against the deployed source, 2026-09-27)*.

- **Measurement tags create attack edges.** A monitoring service that pings endpoints and posts `liveness` or `trust` feedback endorses whatever it pings. On the same deployment, such a scanner rated farm agents, which rated the farm's target. With the scanner as the only trusted source, 34.6 % of its trust mass reached the farm *(measured 2026-09-27, reference solver)*.

- **A single global score is undesirable.** Contributors to the ERC-8004 discussion called a single aggregated score dangerous, and one post in that thread asked for reputation *relative to reader-chosen anchors* (personalized PageRank, EigenTrust pre-trusted peers). No specification provides it.

- **Contracts need to act on trust, not just display it.** Payment routers, escrow and access control need a synchronous answer, a freshness indicator, and fail-closed behaviour, computed on-chain and not served by an API.

- **The real graph is thin, and that is the point.** On the deployment above, 84 agents had received feedback *(snapshot of 2026-09-21)*. Under the edge rules of this ERC and a minimal endorsement schema, a single honest endorsement chain remains: one client endorses three agents through the wallet it shares with them. An aggregator conforming to this ERC gives the farm's target zero trust, and almost every other agent is unknown *(measured 2026-10-01, reference implementation)*. That is the correct answer, and a reader-anchored certificate states it verifiably.

⟦Sources : CR tour 3 « Faits vérifiés » (bloc ≈ 108,43 M), AM-6.11 (9 283 avis, relayer `0x10304054`), R4 (34,6 %), résultats du chantier 04 (chaîne honnête rétablie par D20, Eve à 0), tour 6 (Kanmani, auto-déclaré, 28/09). « Huit agrégateurs » : fiche projet du vault, 21/09, NON REVÉRIFIÉ depuis. Les tiers (ColinkaMir, Kanmani) ne sont pas nommés dans le texte, conformément à D29 (« ne jamais présenter un tiers comme attaquant ») et à la consigne de C au tour 6 (« jamais de positionnement contre un concurrent dans l'ERC ») : ils sont nommés en Rationale, comme exemples d'`edgeFilterId` (D46). L'étude arXiv « 59-91 % » du draft R6 est retirée : EIP-1 n'autorise pas ce lien et le chiffre n'était pas revérifié. Le scanner n'est pas nommé (AM-5.2 : service automatique, pas complice).⟧

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### 1. Conventions

- `WAD = 10**18`. Trust, distrust, mass and bound values are unsigned integers in WAD. All divisions are integer divisions, and the rounding direction is stated at each step: ⌊x⌋ rounds down, ⌈x⌉ rounds up.
- `GRID = 10_000`. Edge weights are integers in `[−GRID, GRID]` (a grid of 10⁻⁴).
- All byte strings are big-endian.
- **Registries.** An aggregator is bound, for its whole life, to one ERC-8004 Identity Registry and the Reputation Registry linked to it, on the chain where the aggregator is deployed. It MUST NOT read registries on another chain.
- **Feedback.** A tuple `(agentId, client, feedbackIndex, value, valueDecimals, tag1, tag2, isRevoked)` as returned by `readFeedback(agentId, client, feedbackIndex)`. `feedbackIndex` starts at 1 and is ordered per `(agentId, client)` pair, across all tags. `getLastIndex(agentId, client)` returns the highest index. `tag2` is ignored by this ERC.
- **Controllers of an agent `j`.** Read through the [ERC-721](./eip-721.md) interface of the Identity Registry: `ownerOf(j)`, `getAgentWallet(j)`, `getApproved(j)`, and every address `o` with `isApprovedForAll(ownerOf(j), o)`, all read at the time of the check. Former owners are not controllers.
- **Blocks.** All ages and delays are counted in blocks (`block.number`), never in seconds.

### 2. Anchor sets

#### 2.1 Parameters and identifier

```solidity
struct TagSpec {
    string tag;     // ERC-8004 tag1, any non-empty length
    int128 min;     // bounds in WAD: a value v with d decimals is compared as v · 10^(18 − d)
    int128 neutral;
    int128 max;
    uint8  kind;    // 0 = endorsement, 1 = measurement
}

struct Policy {
    uint64    theta;            // WAD, > 0
    uint32    rhoN;             // distrust ratio ρ = rhoN / rhoD, both > 0
    uint32    rhoD;
    uint8     minAnchors;       // m, 1 ≤ m ≤ k
    uint8     vetoQuorum;       // q, 1 ≤ q ≤ k
    int16     vetoMax;          // in [−GRID, −1]
    uint64    maxAge;           // blocks, > 0
    uint64    minRefresh;       // blocks
    uint64    slackRefresh;     // WAD
    uint64    eLowMax;          // WAD
    bool      strictTransfer;
    bool      registryVerified;
    bool      ownerFallback;
    address[] submitters;       // ≤ SUBMITTERS_MAX = 8, strictly increasing, non-zero
}

struct SetParams {
    address[] anchors;          // 1 ≤ k ≤ K_MAX = 16, strictly increasing, non-zero
    uint64[]  lambdas;          // λ_a in WAD, each > 0, Σ λ_a = WAD exactly
    uint32    alphaN;           // α = alphaN / alphaD, 0 < alphaN < alphaD
    uint32    alphaD;
    bytes32   tagSchemaHash;    // keccak256 of the schema document (§2.4)
    TagSpec[] tags;             // 1 ≤ length ≤ TAGS_MAX = 16, strictly increasing by keccak256(bytes(tag))
    Policy    policy;
}
```

```
setId = keccak256(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy))
```

- An anchor set is **immutable**. Changing any parameter (an anchor, a weight, `α`, a tag bound, the policy, the schema document) yields a new `setId`.
- Registration is permissionless. The aggregator MUST revert registration if any constraint stated in the comments above, in §2.2 or in §3.1 is violated, or if the `setId` is already registered.
- `α` is a parameter of the set. The RECOMMENDED value is `1/3`.
- A set is identified globally by `(chainId, aggregator address, setId)`. The aggregator address binds the registries (§1). The `setId` alone does not.
- This ERC defines **no default anchor set**.

⟦D1, D24, D39. Le préimage est celui de l'implémentation v1 (`computeSetId`, ENCODING §1), pas celui du draft R6 (`chainId`, registres, `metadataURI`, `edgeFilterId`, `anchorKeyRegistry`) : AM-08.1. α par ensemble : D24, ce qui ferme le désaccord 6 du tour 2 (⟦OPEN⟧ retiré). TAGS_MAX = 16 : D24. `K_MAX = 16`, `SUBMITTERS_MAX = 8` : constantes v1.⟧

#### 2.2 Policy

Everything a payer needs in order to decide is committed in the `setId`. The status returned by the reading functions describes the certificate, not the agent; `isTrusted` applies the policy (§8).

| Field | Meaning | Constraint |
|---|---|---|
| `theta` | minimum lower-bound trust `trustLow` for an agent to be trusted | `> 0`, so an unknown agent is never trusted |
| `rhoN/rhoD` | an agent is refused if `rhoD · distrustUp > rhoN · trustLow` | both `> 0`; RECOMMENDED `1/2` |
| `minAnchors` | `m`: trust that `m − 1` anchors cannot produce alone (§4.4) | `1 ≤ m ≤ k`; see Security Considerations |
| `vetoQuorum` | `q`: number of vetoing anchors that make an agent `VETOED` | `1 ≤ q ≤ k`; RECOMMENDED `1` |
| `vetoMax` | an anchor edge or feedback of grid weight `≤ vetoMax` is a veto | `[−GRID, −1]` |
| `maxAge` | a certificate older than `maxAge` blocks is `STALE` | `> 0` |
| `minRefresh`, `slackRefresh` | refresh window of the replacement rule (§5.9) | — |
| `eLowMax` | widening budget of the lower bound: beyond it the certificate is `STALE` | — |
| `strictTransfer` | if `true`, reads compare `ownerOf` live with the committed owner | RECOMMENDED `true` |
| `registryVerified` | certification level (§2.3) | — |
| `ownerFallback` | emitter resolution through the owner when `agentWallet` is zero (§3.5) | — |
| `submitters` | certifiers allowed to submit; empty means open | empty requires `registryVerified` |

⟦D35 (mode strict par défaut, RECOMMENDED), D36 (eLowMax), D39 (statut ≠ confiance), D33 (vetoMax), D44 (ownerFallback, défaut false = décision de Hugo en attente, AM-INT.8).⟧

#### 2.3 Certification levels

- **`RegistryVerified`** (`registryVerified = true`). At submission, the aggregator re-reads every committed edge, every row source and every committed owner in the registries (§5.7), and refuses the certificate on any mismatch. Submission MAY be open to anyone (`submitters` empty) or restricted to the listed submitters.
- **`SubmitterAttested`** (`registryVerified = false`, `submitters` non-empty). Only listed submitters may submit or append nodes. The aggregator checks the arithmetic and the shape of the submission, but not its content against the registry.

At both levels, discrepancy proofs (§6) are permissionless and remain available for the life of the certificate. A set MUST NOT be open unless it is `RegistryVerified`.

⟦D32 remplace les trois niveaux R6 (ResidualVerified / RegistryContested / Optimistic). Le niveau Optimistic et son `optimisticCertifier` (AM-R6.17) disparaissent : Submitter-attested est leur version saine (preuves actives, preuve (v)). D27 : le propriétaire de l'ensemble est le soumetteur attesté par défaut.⟧

#### 2.4 Schema document

`tagSchemaHash` is the keccak256 of a UTF-8 JSON document that the set's author publishes off-chain. The document MUST contain:

- `tags`: the full tag list, identical to `SetParams.tags`, with each tag in clear text;
- `name`, `author` and `rationale`: who the anchors are, who chose them and why;
- `edgeFilterId`: the 32-byte identifier of the edge filter (§3.8), or the zero value.

The document SHOULD state whether the set is for demonstration. Consumers SHOULD read the schema document before relying on a set. The aggregator does not read it.

⟦Le `metadataURI` du draft R6 et l'`edgeFilterId` n'existent pas dans le `SetParams` v1. Ils sont rattachés au document engagé par `tagSchemaHash`, ce qui les met dans le `setId` sans changer le contrat (AM-08.1, AM-08.2). Le format exact du document (clés JSON, canonicalisation avant hachage) n'est pas fixé par le CR : je propose un JSON canonique (RFC 8785) dans E2, à valider.⟧

### 3. Graph

For an anchor set and a registry state, the **graph** is a set of weighted, directed edges between nodes. The rules in this section are normative. Two conforming implementations MUST derive the same edges, with the same weights, from the same registry state and the same set.

#### 3.1 Tags and kinds

- Each `TagSpec` MUST satisfy `min ≤ neutral ≤ max` and `min < max`, and `kind ∈ {0, 1}`.
- **Only `endorsement` tags create edges.** Feedback whose `tag1` is a `measurement` tag MUST NOT create an edge and MUST NOT propagate trust or distrust. A consumer MAY use measurement feedback in its own policy, outside the quantities defined by this ERC.
- Feedback whose `tag1` is not in `tags` MUST be ignored. Tags are matched by `keccak256(bytes(tag1))`.

#### 3.2 Normalization

Let a feedback have `value` (int128) and `valueDecimals` `d`, and let `s` be the `TagSpec` of its `tag1`.

1. If `d > 18`, the feedback is invalid. Otherwise `x = value · 10^(18 − d)`, computed exactly in `int256`.
2. If `x < s.min` or `x > s.max`, the feedback is **invalid**. Implementations MUST NOT clamp out-of-range values.
3. The weight `w ∈ [−GRID, GRID]` is truncated toward zero:
   - if `x > s.neutral`: `w = ⌊(x − s.neutral) · GRID / (s.max − s.neutral)⌋`;
   - if `x < s.neutral`: `w = −⌊(s.neutral − x) · GRID / (s.neutral − s.min)⌋`;
   - if `x = s.neutral`: `w = 0`.

The quantized weight is normative: it defines the graph and is not an approximation covered by any bound.

#### 3.3 Pair edge

For a client address `c` and an agent `j`, the **pair weight** `w(c, j)` is computed over the whole history of the pair:

1. For each endorsement tag `τ` of the set, take the feedback from `c` about `j` with `tag1 = τ` that has the **highest `feedbackIndex` among the non-revoked ones**. If that feedback is invalid (§3.2), the tag yields nothing. An older feedback of the same tag is **not** used instead.
2. **Negative dominance.** If at least one tag yields a negative weight, `w(c, j)` is the most negative one; otherwise it is the largest one. If no tag yields a non-zero weight, there is no edge.
3. **Deciding feedback.** The `feedbackIndex` of the pair edge is the index of the feedback that gives `w(c, j)`. Between tags of equal weight, the feedback with the **highest** `feedbackIndex` decides.
4. **Rejection.** There is no edge if `c` is a controller of `j` (§1), read at the time the edge is evaluated.

⟦D14, R3, R5, R6 de FORMAT.md. Deux changements par rapport au draft R6 : (a) un avis hors bornes ne laisse plus passer l'avis précédent du même tag (R3 « latest then reject », choisi par le 04 et le contrat ; R6 avait pris « latest valid », AM-R6.21) ; (b) l'égalité entre tags se départage par l'index le plus grand (F-6 de l'intégration : le contrat ne stocke que des hashes de tags) et non par le plus petit tag (AM-R6.24 fermé). La règle « ancien owner » de D16 est retirée par D20 (AM-R6.4 fermé).⟧

#### 3.4 Nodes

There are three kinds of nodes:

- **Anchor nodes**: one per anchor address of the set.
- **Agent nodes**: ERC-8004 agents.
- **Address nodes**: client addresses that resolve to no agent (§3.5).

Only agent nodes receive edges. An anchor node is distinct from every agent node, even when the anchor address is also the source of an agent.

#### 3.5 Emitter resolution and row copy

The **source** of an agent `j` is:

- `getAgentWallet(j)`, if it is non-zero;
- otherwise `ownerOf(j)`, if the set's `ownerFallback` is `true`;
- otherwise none.

The wallet always takes precedence: an agent whose `agentWallet` is non-zero never emits its owner's row.

For a client address `c`, let `A(c)` be the set of agents whose source is `c`. The **row of `c`** is the list of pair edges `c → j` (§3.3) over all agents `j`. Then:

- every agent of `A(c)` emits the row of `c` with its **own** trust mass (**row copy**);
- if `c` is an anchor address, the anchor node also emits the row of `c`, in addition to any agent copy;
- if `A(c)` is empty and `c` is not an anchor, the row of `c` belongs to the address node of `c`. That node receives no edge and no anchor mass, so its trust is zero and its row propagates nothing.

An edge `u → j` whose destination `j` is the emitting agent `u` itself is never committed (§5.4).

⟦D20 (copie de ligne, confirmée par D34 : masse Sybil identique pour M = 1 ou 100), D44 (repli owner, ordre de priorité), R7 et R8 de FORMAT.md. R8 (ligne d'ancre portée par le nœud-ancre EN PLUS de la copie d'agent) tranche AM-R6.14 dans le sens du solveur, contre le choix exclusif de R6.⟧

#### 3.6 Budgets

For a node `u` emitting edges with weights `w_uj`:

```
S⁺_u = Σ_j max(w_uj, 0)            B⁺_u = max(GRID, sPlus_u)        C_uj = max(w_uj, 0) / B⁺_u
S⁻_u = Σ_j max(−w_uj, 0)           B⁻_u = max(GRID, S⁻_u)           D_uj = max(−w_uj, 0) / B⁻_u
```

`sPlus_u` is the true positive sum of the row (§5.4). When the full row is committed, `sPlus_u = S⁺_u`. Every row of `C` and of `D` sums to at most 1. Endorsement and distrust have **separate budgets**: criticizing an agent costs a node none of its endorsement capacity.

#### 3.7 Measurement tags in the policy

This ERC does not define any use of measurement tags. A consumer that refuses an agent on a measurement (for example, an uptime threshold) does so outside `isTrusted`.

#### 3.8 Edge filters (reserved)

An edge filter removes edges from the graph according to a property of the feedback or of its client (for example, payment provenance or payment-claim verification). This version defines **no** edge filter: the schema document's `edgeFilterId` MUST be zero, and conforming aggregators compute every quantity on the unfiltered graph. A future version that defines a filter MUST also define its on-chain predicate, because discrepancy proofs (§6) would otherwise widen honest certificates for every edge that the filter legitimately removed. A filter MUST only remove edges. It MUST NOT add edges or increase weights. Payment MUST NOT be an edge weight or a pass condition of the core algorithm.

⟦D3, D46. Pas de filtre « reçu vrai » par défaut (D46, AM-7.5). Le draft R6 autorisait un `edgeFilterId` non nul hors du niveau contesté ; c'est intenable en v1, où les preuves sont actives à tous les niveaux (AM-08.2).⟧

### 4. Trust, distrust and bounds

#### 4.1 Columns

Let `α = alphaN / alphaD` and `om = alphaD − alphaN`. For each anchor `a` (a **column**), with `p^(a)` the unit vector on the anchor node of `a`, the trust column `t*^(a)` is the unique fixed point of

```
F^(a)(t)_v = α · [v = a] · WAD + (1 − α) · Σ_u t_u · C_uv
```

**Absorbing convention.** Mass that a node does not pass on (a row of `C` summing to less than 1, or no row) is lost, not returned to `p`. Hence `Σ_v t*^(a)_v ≤ WAD`, and the map `p ↦ t*` is exactly linear: the trust of a weighted anchor set is the weighted sum of its columns.

`t*^(a)_v` is the share of anchor `a`'s unit mass that reaches node `v`, in WAD. It is not multiplied by a node count or by any other quantity chosen by the certifier.

#### 4.2 Certified columns are sub-solutions

The aggregator computes, with every term rounded down,

```
y_v^(a) = [v = a] · ⌊alphaN · WAD / alphaD⌋ + Σ_{rows u, w_uv > 0} ⌊ t_u^(a) · om · w_uv / (alphaD · B⁺_u) ⌋
```

and accepts submitted columns `t^(a)` only if `t_v^(a) ≤ y_v^(a)` for every node `v` and every column `a`. Because `F` is monotone, such a `t` satisfies `t ≤ t*` coordinate by coordinate for the committed graph. It is also a lower bound for the registry's graph whenever the committed graph is **dominated** by it, that is, when every committed `C_uv` is at most the true one (Rationale).

A certifier MUST compute `t` by iterating `t⁰ = 0`, `t^{n+1} = F_bas(t^n)` with exactly the arithmetic above. Every iterate is a sub-solution, and the certifier MAY stop at any iterate. A floating-point fixed point rounded to integers is not guaranteed to be a sub-solution.

#### 4.3 Distrust

Distrust propagates one hop and does not feed back into trust. With `T_u = ⌈Σ_a λ_a · t_u^(a) / WAD⌉`, the aggregator computes

```
d_v = Σ_{rows u, w_uv < 0} ⌈ T_u · om · |w_uv| / (alphaD · B⁻_u) ⌉
```

The submitter does not supply `d`.

#### 4.4 Values of an agent for a set

```
c_a(i)      = ⌊λ_a · t_i^(a) / WAD⌋
trust(i)    = Σ_a c_a(i)
trustRobust(i) = trust(i) − (sum of the m − 1 largest c_a(i))         // 0 if m − 1 ≥ k
trustLow(i)    = max(trustRobust(i) − eLowEff, 0)
distrust(i)    = d_i
distrustUp(i)  = d_i + eEff
```

`trustRobust` is the trust that no `m − 1` anchors can produce alone. It remains a lower bound because removing the largest contributions is non-decreasing in each contribution. Distrust is not leave-one-out, because it only pushes toward refusal.

An agent outside the certificate has zero trust and zero distrust: *unknown* is expressed as zero trust, not as an error.

#### 4.5 Bounds

Each certificate carries two bounds per column, in WAD and in `t`-space:

- **`eUp_a`**, an upper bound on `‖t*^(a) − t^(a)‖₁`. It bounds the error of distrust (§5.6). Proofs that show an omitted or increased edge widen it (§6).
- **`eLow_a`**, an upper bound on `‖(t^(a) − t*^(a))⁺‖₁`. It is `0` at submission and is widened by proofs that show a decrease (revocation, lower weight, dilution, source change).

```
eEff    = Σ_a ⌈λ_a · eUp_a / WAD⌉
eLowEff = Σ_a ⌈λ_a · eLow_a / WAD⌉
```

Both are global over the set: a widening on one row lowers `trustLow`, or raises `distrustUp`, for every agent of the set.

⟦D26 (sous-solution), D32 (domination), D37 (lemmes L1-L5 de PROOFS.md, L6-L7 ajoutés par 02 et l'intégration). Le désaccord 5 du tour 2 (borne globale) est en partie tranché par D26 : la borne inférieure de confiance est exacte par agent à la soumission. Il reste global après une preuve (eLow, AM-02.4) : écrit en Security, ⟦OPEN⟧ retiré. La méfiance est calculée sur T combiné (ENCODING §4), pas colonne par colonne comme dans R6 : d n'a plus de colonnes.⟧

### 5. Certificates

#### 5.1 Node table

For each set, the aggregator keeps an **append-only node table**. Node `i` has a 32-byte key `kind << 248 | value`: kind `1` agent (`agentId`), `2` address, `3` anchor (address). Anchors are nodes `0 … k−1`, in the order of `SetParams.anchors`, and are inserted at registration. Indices are stable: a node keeps its index for the life of the set.

Nodes are appended as entries `0x01 ‖ agentId:u32` or `0x02 ‖ address:20`, either through `submitCertificate(…, newNodes, …)` or beforehand through `addNodes`. An entry whose key already exists MUST be refused. At the `SubmitterAttested` level, only listed submitters may append. Certifiers SHOULD order the nodes of a first certificate as anchors, then agents by increasing `agentId`, then addresses by increasing value.

A certificate covers the nodes `[0, nCert)`. `nCert` MUST satisfy `k ≤ nCert ≤ nodeCount` and MUST NOT decrease from one certificate to the next.

⟦Choix de rédaction : l'encodage binaire `ancre-cert-v1` devient NORMATIF (§5.3-§5.5), alors que R6 le laissait à l'implémentation. Raison : `graphRoot` et `vectorRoot` sont des hachages de ces octets, les preuves d'écart les rouvrent, et les vecteurs de test les fixent. AM-R6.12 (feuilles en `nodeKey` contre indices) est tranché en faveur des indices : un certificat n'a de sens que pour un agrégateur donné (§2.1), la portabilité des feuilles n'achetait rien.⟧

#### 5.2 Submission

```
submitCertificate(setId, nCert:u32, eMax:u256, newNodes, vectors, rows)
```

The aggregator appends `newNodes`, verifies the submission (§5.6, §5.7), computes `eEff`, reverts if `eEff > eMax`, applies the replacement rule (§5.9), and stores the vectors, `d`, the certified veto bits, the bounds, `graphRoot`, `vectorRoot`, the registry version hash (§7) and `certBlock = block.number`. It then emits `CertificateSubmitted`.

#### 5.3 Vectors

```
vectors = for i in [0, nCert): t_i^(0):u64 ‖ … ‖ t_i^(k−1):u64 ‖ ownerFp_i:u64        (nCert · (k+1) · 8 bytes)
vectorRoot = keccak256(vectors)
```

- Each `t_i^(a)` is in WAD and MUST be `< 2^63`.
- `ownerFp_i = uint160(ownerOf(agentId)) & (2^63 − 1)` for an agent node, and `0` for any other node. It records the owner at certification for the transfer check (§8.3).

#### 5.4 Rows

```
rows  = W:u8 ‖ numRows:u32 ‖ row*                          W ∈ {2, 4}; W = 2 only if nCert ≤ 65 535
row   = u:W ‖ hdr:u16 ‖ [src:20] ‖ [sPlus:u32] ‖ [ref:W] ‖ edge*nE
hdr   = nE (bits 0..11, nE ≤ ROW_MAX = 256)
      | 0x8000 SRC        the row's client address follows (agent rows only)
      | 0x4000 SPLUS      the declared true positive sum follows (non-zero)
      | 0x2000 ALIAS      copy of the earlier row `ref`: nE = 0, no SPLUS, SRC required
      | 0x1000 VIA_OWNER  the client is ownerOf(u) and getAgentWallet(u) = 0 (sets with ownerFallback only)
edge  = dst:W ‖ w:int16 ‖ feedbackIndex:u32
```

**Client of a row.** For an anchor row (`u < k`), the anchor address. For an address row, the node's address. For an agent row, `src`: the agent's `agentWallet` (VIA_OWNER clear) or, with VIA_OWNER, its owner. An agent row without SRC has no client: it MUST be empty, and it is allowed only on a set without `ownerFallback` when the agent's `agentWallet` is zero.

**Edges.** Each edge is the pair edge (§3.3) of the row's client on the agent `dst`, with its combined weight `w` and the `feedbackIndex` of the deciding feedback.

**Alias rows.** An alias row `u` (`u ≥ k`) repeats the client `src` of the earlier, non-alias row `ref < u`, and inherits its edges and its `sPlus`. It spreads them with its **own** mass `t_u`. This is how row copy (§3.5) is encoded without duplicating calldata. Each copy counts its positive edges in `E⁺` (§5.6).

**sPlus.** The true positive sum of the client's full row, over all its pair edges. A certifier MAY omit **positive** edges of a row, for example to stay within `ROW_MAX` or to skip pairs that are expensive to re-read, provided it declares `sPlus`. The remaining edges then keep their true normalized weight (`B⁺ = max(GRID, sPlus)`), and the omitted mass enters the margin of `eUp` (§5.6). Without SPLUS, `sPlus = S⁺` of the committed edges.

**Certifier obligations.**
- Negative edges MUST NOT be omitted. Nothing declares the negative sum, so an omitted negative edge makes `distrustUp` unsound. It is a provable fault (§6), not an option.
- Anchor rows MUST NOT be truncated or have edges omitted. The certified veto bit depends on them.
- Every agent node with non-zero trust that has a source MUST carry its row, even when it is empty. Otherwise the node is **truncated**: it pays the truncation margin, and its edges cannot be challenged.
- A row of a zero-trust node SHOULD NOT be provided. It adds nothing to `y` and adds its positive edges to `E⁺`.

⟦D20, D32 (sPlus déclaré, preuve (v)), D21/D33 (lignes d'ancres jamais tronquées), D44 (VIA_OWNER). Le ROW_ALIAS_MAX = 64 de D44 est une canonicalisation du solveur, que le contrat ne vérifie pas et qui ne borne rien on-chain (AM-INT.7) : il n'est pas repris comme règle normative, il est cité en Rationale. Écart avec D44 noté AM-08.3.⟧

#### 5.5 Graph root

Leaf `ℓ` = `keccak256` of the row's bytes, from `u` to its last byte, optional fields included. Leaves are in row order. A parent is `keccak256(left ‖ right)`. An odd last element moves up unchanged. The root of zero rows is `bytes32(0)`.

`graphRoot` and `vectorRoot` commit one submission. Two certifiers that use the same node table, the same rows and the same vectors obtain the same roots. A certifier MAY submit any sub-solution: the vectors, and therefore the roots, are not a canonical function of the registry state.

#### 5.6 Arithmetic verification

The aggregator MUST revert unless all of the following hold, and computes the bounds as shown.

```
for every row: rows strictly increasing by u, u < nCert, numRows ≤ nCert, exact end of buffer;
               dst < nCert, dst ≠ u, dst strictly increasing within the row;
               w ≠ 0, |w| ≤ GRID; nE ≤ ROW_MAX;
               SPLUS ⇒ sPlus ≥ max(1, Σ committed w⁺)
for every v < nCert, every column a:    t_v^(a) ≤ y_v^(a)                 // §4.2

r_a   = Σ_v (y_v^(a) − t_v^(a))  +  E⁺ + 1
        + Σ_{v < nCert without row, t_v^(a) ≠ 0}  ⌈ t_v^(a) · om / alphaD ⌉                         // truncation
        + Σ_{rows u with sPlus_u > S⁺_u, t_u^(a) ≠ 0}  ⌈ t_u^(a) · om · (sPlus_u − S⁺_u) / (alphaD · B⁺_u) ⌉   // declared omission
eUp_a = ⌈ r_a · alphaD / alphaN ⌉
q_a   = ⌈ (r_a − E⁺ − 1) · alphaD / alphaN ⌉
mass  = Σ_a ⌊ λ_a · Σ_v t_v^(a) / WAD ⌋
D     = Σ_v d_v
eEff = Σ_a ⌈λ_a · eUp_a / WAD⌉        qEff = Σ_a ⌈λ_a · q_a / WAD⌉        eLow_a = 0
```

`E⁺` is the number of positive edges of all provided rows, alias rows counted with their inherited edges. `E⁺ + 1` covers the floor of each positive term of `y` and of the `α` term. `q` is `eUp` without that rounding floor. It is used only by the replacement rule.

**Certified veto bits.** Every edge of an anchor row `a` whose weight is `≤ vetoMax` sets bit `a` of the destination's certified veto mask.

#### 5.7 Shape and registry checks

**Shape, at both levels.** Every edge targets an agent node. An anchor or address row carries neither SRC nor VIA_OWNER. An agent row is either (a) SRC without VIA_OWNER, (b) SRC with VIA_OWNER on a set with `ownerFallback`, or (c) without SRC: empty, not an alias, without SPLUS, on a set without `ownerFallback`. An alias row satisfies §5.4. (In strict mode, an agent of non-zero trust whose `ownerFp` is zero or wrong reads as `TRANSFERRED`, §8.1.)

**`RegistryVerified` only.** In the submitting transaction, the aggregator MUST check:

| Object | Check |
|---|---|
| agent row, SRC without VIA_OWNER (aliases included) | `getAgentWallet(u) == src` |
| agent row with VIA_OWNER | `getAgentWallet(u) == 0` and `ownerOf(u) == src` |
| agent row without SRC | `getAgentWallet(u) == 0` |
| each edge of a non-alias row | the client is not a controller of `dst`, and `(w, feedbackIndex)` equals the pair edge (§3.3) re-read in the Reputation Registry |
| each agent node of non-zero trust | `ownerFp == uint160(ownerOf(agentId)) & (2^63 − 1)` |
| each other node | `ownerFp == 0` |

Re-reading a pair edge requires `getLastIndex`, then `readFeedback` from the highest index downward until every endorsement tag of the set has been seen or index 1 is reached. The cost is proportional to the history of the pair and is borne by the submitter.

What cannot be checked at submission, at any level, because ERC-8004 has no per-client index: that a row is complete, and that a declared `sPlus` is the true sum.

⟦ENCODING §3.2 et §3.4. La relecture coûte ≈ 45,5 k gas par arête à avis unique et ≈ 13 k par avis supplémentaire du couple (MESURÉ 28/09, GAS.md) : chiffres déplacés en Reference Implementation, hors texte normatif.⟧

#### 5.8 Certifier procedure (informative)

A certifier reads the registries at a recent block, derives the edges (§3), resolves emitters (§3.5), selects the support (nodes reachable from the anchors), iterates from zero (§4.2), encodes, and checks the result with `dryRun` or an `eth_call` of `submitCertificate` before sending it.

#### 5.9 Replacement

At the `SubmitterAttested` level, and on any set with a non-empty `submitters` list, a listed submitter always replaces the current certificate.

On an open set, the aggregator MUST refuse a new certificate whose `vectorRoot` and `graphRoot` both equal those of a current certificate that has been widened by a proof. Otherwise it MUST accept the new certificate if and only if one of these holds:

```
no current certificate
∨ the current certificate is REGISTRY_CHANGED (§7)
∨ block.number − certBlock > maxAge
∨ eLowEff_cur > eLowMax
∨ ( mass_new + eLowEff_cur ≥ mass_cur  ∧  qEff_new ≤ q_cur  ∧  D_new ≥ D_cur )
∨ ( block.number − certBlock > minRefresh  ∧  qEff_new ≤ q_cur + slackRefresh )

with  q_cur = eEff_cur − eFloor_cur + eLowEff_cur,  eFloor = eEff − qEff at submission
```

The fourth clause accepts a certificate that is at least as good on every side. More mass is more precision on the trust side: two sub-solutions of the same graph satisfy `‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁`. A smaller `q` is more precision on the distrust side. And a larger distrust mass `D` keeps negative edges and certified vetoes from being dropped. The refresh window lets an unproven decrease (for example, a revocation) through after `minRefresh` blocks. Setting `minRefresh = maxAge` disables it.

⟦AM-04.1, AM-5.16, AM-02.2, lemme L7 (intégration du 01/10). Remplace la règle R6 par `eEff` (eNew ≤ eCur), qui bloquait la croissance honnête et récompensait la censure. La clause REGISTRY_CHANGED du draft R6 est conservée (elle est dans le code).⟧

### 6. Discrepancy proofs

A discrepancy proof shows that a committed row differs from the registry **now**. It never invalidates a certificate and never moves funds: it widens `eLow` and/or `eUp`. Proofs are permissionless, apply to the current certificate, and are paid by the prover. Each fact is billed once: a row carries its **amendments** (`(agentId:u32 ‖ wCommitted:int16 ‖ wNow:int16)*`) and each proof starts from the amended state, `keccak256(leaf ‖ amends)`.

#### 6.1 `proveEdge`

`proveEdge(setId, row, src, amends, agentJ)` opens the committed row of `u` (with its Merkle path, or the stored amended state), and for an alias row its committed source row. It re-reads **now** the pair weight `wNew` of the row's client on `agentJ` (§3.3; `0` if the client is a controller of `agentJ`, or if the Identity Registry reverts for `agentJ`; the proof reverts if the Reputation Registry cannot be read). It reverts if `wNew` equals the current weight `wOld` (amended, else committed, else 0), or if the row's source no longer holds (§5.7 reads; use `proveWallet`). This one proof covers:

- (i) **omission** of an edge, with or without dilution of the others;
- (ii) a **stale** edge (a later feedback changed the weight);
- (iii) a **revoked** deciding feedback;
- a new **controller** relation;
- (v) **fabrication** or **inflation** of a committed edge (needed at the `SubmitterAttested` level).

**Amount.** Per side of the normalized row (positive side with `G = max(GRID, sPlus)`, negative side with `G = GRID`), with sum `S → S' = S − wo + wn`, `B = max(G, S)`, `B' = max(G, S')`, `rest = S − wo`:

```
dec = ⌈ WAD · [ rest · (B' − B)⁺ + (wo · B' − wn · B)⁺ ] / (B · B') ⌉
inc = ⌈ WAD · [ rest · (B − B')⁺ + (wn · B − wo · B')⁺ ] / (B · B') ⌉
caps per row:  Σ dec⁺ ≤ ⌈WAD · S⁰ / B⁰⌉,  Σ inc⁺ ≤ WAD,  Σ inc⁻ ≤ WAD           (B⁰ = max(GRID, sPlus or S⁰))
prepaid⁺ = ⌊WAD · (sPlus − S⁰) / B⁰⌋ if sPlus was declared: only inc⁺ beyond it is billed
eLow_a += ⌈ t_u^(a) · om · dec⁺ / (alphaN · WAD) ⌉
eUp_a  += ⌈ t_u^(a) · om · (billed inc⁺ + inc⁻) / (alphaN · WAD) ⌉
```

`eLowEff` and `eEff` are then recomputed. If the proven edge belongs to an anchor row, now has a weight `≤ vetoMax`, and its destination is a certified node, the destination's certified veto bit is set.

#### 6.2 `proveWallet`

`proveWallet(setId, row, src, amends)` proves (iv): the committed source of an agent row no longer holds. The `agentWallet` changed (ERC-8004 clears it at every transfer), the owner of a VIA_OWNER row changed, the agent obtained a wallet, or the agent of a source-less row obtained a wallet. The aggregator bills to `eLow` the not-yet-billed part of the committed positive mass `⌈WAD · S⁰ / B⁰⌉`, and to `eUp` the not-yet-billed rest of `1 − prepaid⁺` on the positive side and of `1` on the negative side. The row is then void: no further proof applies to it.

This is how the **outgoing** edges of a transferred agent are frozen until the next certificate.

#### 6.3 `proveTransfer`

`proveTransfer(setId, agentId)` sets the transfer flag of a certified agent whose current owner no longer matches `ownerFp`, or whose `ownerOf` reverts. Reads then return `TRANSFERRED` for that agent in both transfer modes.

#### 6.4 Exhausted budget

If `eLowEff > eLowMax`, the certificate is `STALE` (§8), and the replacement rule accepts any new certificate (§5.9).

⟦D22 (plafonds par ligne), D32 (preuve (v)), D36 (eLowMax), D44 (gel des arêtes sortantes par (iv-a)), lemme L6. Le `dispute(kind, evidence)` R6 à cinq types devient trois fonctions ; (i), (ii), (iii), contrôleur et (v) sont fusionnés dans `proveEdge`, qui compare un poids relu avec le poids courant. La règle R6 « une preuve n'est acceptée que sur le niveau RegistryContested » disparaît : les preuves sont actives à tous les niveaux (D32). Écart avec D44 : le gel des arêtes sortantes n'est pas automatique en mode strict, il faut un `proveWallet` (AM-08.4).⟧

### 7. Registry versions

The registries are typically upgradeable proxies, and a contract cannot read another contract's implementation slot.

- `versionHash = keccak256(abi.encode(identityRegistry, keccak256(bytes(identity.getVersion())), reputationRegistry, keccak256(bytes(reputation.getVersion()))))`. If either `getVersion()` call fails or returns malformed data, the registry is unreadable: submission MUST revert.
- Every certificate stores the `versionHash` read in its submitting transaction.
- `checkRegistry(setId)` is callable by anyone. It recomputes the hash and, if it differs from the certificate's hash or cannot be read, marks the set's certificate `REGISTRY_CHANGED` and emits `RegistryChanged`. A new certificate clears the mark.
- Certifiers MUST check the registry versions before each certification. Operators SHOULD monitor the registries' [ERC-1967](./eip-1967.md) `Upgraded` events off-chain and call `checkRegistry` for every set they rely on when one is emitted.

An upgrade that keeps the same version string is invisible on-chain (Security Considerations).

⟦D17. `checkRegistry` est par ensemble dans la v1 (R6 : global) : une upgrade doit être signalée ensemble par ensemble (AM-08.5). `getVersion()` ne fait pas partie de l'interface ERC-8004 (AM-R6.10) : demande 5 en Backwards Compatibility. Le désaccord 2 du tour 3 (suffisance de la vérification de version) est maintenu en Security comme limite, sans marqueur ⟦OPEN⟧ : le texte ne prend aucune position qu'un tour ultérieur pourrait renverser.⟧

### 8. Reading

#### 8.1 Statuses

```solidity
enum Status { OK, NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED }
```

`assess(agentId, setId, withVeto)` MUST evaluate, in this order, and stop at the first that applies:

1. `NO_CERT`: the set is unknown or has no certificate. All values are zero.
2. `REGISTRY_CHANGED`: the certificate is marked by `checkRegistry` (§7).
3. `STALE`: `block.number − certBlock > maxAge`, or `eLowEff > eLowMax`.
4. `VETOED` (only if `withVeto`): at least `vetoQuorum` anchors veto the agent (§8.2). If a registry read needed for the veto fails, the status is `REGISTRY_CHANGED` instead.
5. `TRANSFERRED`: the agent is certified, and either its transfer flag is set (§6.3), or `strictTransfer` is on, the agent has non-zero trust, and `ownerOf(agentId)` reverts or no longer matches `ownerFp`.
6. `OK`.

Under every status except `NO_CERT`, the value fields (`trust`, `trustRobust`, `distrust`, `e`, `eLow`, `trustLow`, `distrustUp`, `certBlock`) MUST be filled as in §4.4.

#### 8.2 Veto

An anchor `a` vetoes agent `j` if **either**:

- **live**: the feedback of index `getLastIndex(j, anchor_a)` is not revoked, has an endorsement tag of the set, is valid (§3.2), and has weight `≤ vetoMax`; **or**
- **certified**: bit `a` of `j`'s certified veto mask is set (§5.6, §6.1).

`vetoCount` is the number of anchors that veto. The live check reads one feedback per anchor, so a veto takes effect in the block after the anchor posts it, without recertification. `triggerTag` is the `keccak256(tag1)` of the most negative live veto, or zero if only certified bits apply.

#### 8.3 Trust decision

```
trusted ⇔ withVeto ∧ status = OK ∧ trustLow ≥ theta ∧ rhoD · distrustUp ≤ rhoN · trustLow
```

`isTrusted(agentId, setId)` returns `trusted` with `withVeto = true`. It MAY skip the registry reads, and return `false`, as soon as the bounds already fail.

**A payer MUST decide with `isTrusted`, or with `assess(…, true)` and its `trusted` field.** `status = OK` alone does not mean the agent may be paid: an unknown agent has status `OK` and trust zero.

A payer MUST NOT authorize a transfer of value on a set whose `minAnchors` is below 2. A payer that caches a decision MUST bound the cache's lifetime in blocks and MUST NOT reuse a decision across certificates.

#### 8.4 Robustness of reads

`trustOf`, `assess` and `isTrusted` MUST NOT revert, whatever the registries return. Every external call they make MUST be gas-capped, and a failed call MUST resolve toward refusal (`REGISTRY_CHANGED`, `TRANSFERRED`, or `trusted = false`). `trustOf(agentId, setId)` returns `(status, trustRobust, distrust, e, certBlock)` from `assess(agentId, setId, true)`.

⟦D21 et D33 (veto au dernier avis + bit certifié), D35, D39. Écarts avec R6 : plus de `UNKNOWN_SET` (fusionné dans `NO_CERT`), plus de `REGISTRY_ERROR` (un registre illisible donne `REGISTRY_CHANGED` au veto et `TRANSFERRED` sur `ownerOf`, AM-08.6) ; l'ordre veto avant transfert suit le code. Désaccord 2 du tour 5 (deux règles pour un même avis d'ancre : le veto en direct lit le dernier avis, D14 lit la dominance par tag) : ⟦OPEN⟧ ci-dessous.⟧

⟦OPEN — tour 5, désaccord 2 : pour une même ancre, le veto en direct ne lit que le DERNIER avis (tous tags confondus), tandis que le graphe et le bit certifié appliquent la dominance du négatif par tag (D14). Un avis ultérieur de l'ancre, même de mesure, lève le veto en direct (AM-02.6) ; seul le bit certifié le maintient jusqu'au certificat suivant. Le texte suit D33 (le dernier avis fait foi en direct) et compense par la règle normative du §9. Non tranché par le conseil.⟧

### 9. Obligations of anchors

The live veto reads only an anchor's **last** feedback on an agent. Therefore:

- An anchor that wants a veto to hold MUST NOT post any later feedback on the same agent, under any tag, until it intends to lift the veto.
- An anchor SHOULD post vetoes under a dedicated endorsement tag named `veto`. The RECOMMENDED schema entry is `veto` with `kind = 0`, `min = −1·WAD`, `neutral = 0`, `max = 0`, so that a feedback of value `−1` has weight `−GRID`. An anchor SHOULD NOT post measurement feedback on agents it may veto.
- To lift a veto, an anchor revokes it. The certified bit stays set until the next certificate.

⟦D33 : « règle normative pour les ancres (republier le veto) ; tag `veto` RECOMMENDED ». AM-02.6. L'ancre qui doit poster autre chose sur l'agent DOIT reposter son veto en dernier ; formulé ici comme interdiction de poster après le veto, plus simple à suivre.⟧

### 10. Interface

```solidity
interface IAnchoredReputation {
    event AnchorSetRegistered(bytes32 indexed setId, address[] anchors, uint64[] lambdas, uint32 alphaN, uint32 alphaD);
    event NodesAdded(bytes32 indexed setId, uint256 fromIndex, uint256 count);
    event CertificateSubmitted(bytes32 indexed setId, uint64 indexed certBlock, uint256 eEff, bytes32 graphRoot,
        bytes32 vectorRoot, bytes32 versionHash, uint32 nCert, uint32 numRows, bool registryVerified);
    event EdgeProven(bytes32 indexed setId, uint256 indexed node, uint256 indexed agentId, int256 wOld, int256 wNew,
        uint256 eLowEff, uint256 eEff);
    event RowVoided(bytes32 indexed setId, uint256 indexed node, uint256 eLowEff, uint256 eEff);
    event TransferFlagged(bytes32 indexed setId, uint256 indexed agentId);
    event RegistryChanged(bytes32 indexed setId, bytes32 certifiedVersionHash, bytes32 currentVersionHash);

    struct Assessment {
        Status  status;
        uint256 trust;
        uint256 trustRobust;
        uint256 distrust;
        uint256 e;          // eEff
        uint64  certBlock;
        uint8   vetoCount;
        bytes32 triggerTag; // keccak256(tag1) of the most negative live veto, or 0
        uint256 trustLow;
        uint256 distrustUp;
        uint256 eLow;       // eLowEff
        bool    trusted;
    }

    struct RowRef {
        uint256   pos;      // rank of the row in the certificate (Merkle leaf index)
        bytes     row;      // committed row bytes
        bytes32[] path;     // Merkle siblings to graphRoot (may be empty once the row is amended)
    }

    // anchor sets
    function computeSetId(SetParams calldata p) external pure returns (bytes32);
    function registerAnchorSet(SetParams calldata p) external returns (bytes32 setId);
    function policyOf(bytes32 setId) external view returns (Policy memory);

    // node table and certificates
    function addNodes(bytes32 setId, bytes calldata entries) external;
    function submitCertificate(bytes32 setId, uint32 nCert, uint256 eMax, bytes calldata newNodes,
        bytes calldata vectors, bytes calldata rows) external;
    function certificate(bytes32 setId) external view returns (uint64 certBlock, uint256 eEff, uint256 eLowEff,
        bytes32 graphRoot, bytes32 vectorRoot, bytes32 versionHash, uint32 nCert, uint32 numRows, bool registryChanged);
    function quality(bytes32 setId) external view returns (uint256 mass, uint256 qCur, uint256 distrustMass, bool proven);

    // discrepancy proofs
    function proveEdge(bytes32 setId, RowRef calldata r, RowRef calldata src, bytes calldata amends, uint256 agentJ) external;
    function proveWallet(bytes32 setId, RowRef calldata r, RowRef calldata src, bytes calldata amends) external;
    function proveTransfer(bytes32 setId, uint256 agentId) external;
    function checkRegistry(bytes32 setId) external returns (bool changed);

    // reading: MUST NOT revert
    function isTrusted(uint256 agentId, bytes32 setId) external view returns (bool);
    function assess(uint256 agentId, bytes32 setId, bool withVeto) external view returns (Assessment memory);
    function trustOf(uint256 agentId, bytes32 setId) external view
        returns (Status status, uint256 trustRobust, uint256 distrust, uint256 e, uint64 certBlock);
}
```

Implementations MAY add functions (for example a dry run, capacity reservation, or raw storage views). They MAY implement [ERC-165](./eip-165.md).

⟦Signatures recopiées de `AnchoredReputation.sol` v1 (intégration du 01/10). Les types `Status`, `SetParams`, `Policy` sont ceux du §2 et du §8. `dryRun`, `reserveCapacity`, `columnBounds`, `rowStateOf`, `vectorAt`, `nodeCount`, `nodeKeyAt` restent hors interface normative (optimisations propres à l'implémentation, `reserveCapacity` sert le stockage de MIP-8). ERC-165 passe de MUST à MAY : le contrat v1 ne l'implémente pas (AM-08.7) ; `requires: 165` retiré du préambule.⟧

### 11. Extensions outside this version

**Rotating anchors.** This version names anchors by address. An anchor that loses its key must be replaced in a new set. A future version MAY name anchors by a self-certifying identifier with key pre-rotation: `anchorId = keccak256(abi.encode(key0, nextKeyDigest1))`, where each rotation reveals the committed next key and commits the following one. Only feedback from the anchor's current key would count, and the veto would read the current key. Such a version changes the `setId` preimage and the anchor-row client.

**Edge filters.** See §3.8.

⟦OPEN — D9 (identité d'ancre à pré-rotation, confiance 0,6) et D43 (concept Mera : clés d'époque pré-rotées, `rotateBySig`) sont décidées mais pas implémentées : la v1 nomme les ancres par adresse, et le `setId` n'a pas de champ pour un registre de clés. Réintroduire `IAnchorKeyRegistry` dans le texte normatif contredirait le code ; le retirer contredirait D9. Je le mets en extension future, avec la forme décidée, en attendant 02-E8 (`AnchorRegistry`, conditionné par la porte P4 Mera). AM-08.8. À trancher par le pilote ou le conseil : (a) attendre 02-E8 et réintégrer, (b) publier la v1 avec ancres par adresse.⟧

## Rationale

**Anchors instead of a global score.** Only asymmetric, seed-anchored reputation functions can resist Sybil attacks[^1]. With a walk that restarts at the anchors and absorbs lost mass, the mass that reaches a region `X` containing no anchor is bounded by the mass that crosses its attack edges: `π(X) ≤ ((1 − α)/α) · Σ_{u∉X, v∈X} π(u) · C_uv`. A farm of any size that no anchor-reachable node endorses receives exactly zero. Letting the reader choose the anchors also answers the objection to a single score.

**Personalized PageRank.** EigenTrust with pre-trusted peers[^2] is personalized PageRank under another name. Among the classical schemes (EigenTrust, Advogato, SybilGuard[^5], SybilRank), it is the only one that has both a formal Sybil bound and a certificate checkable in **one pass** over the graph. Advogato's certificate is a binary max-flow, and SybilRank depends on an early-stopped iteration.

**A share of mass, not a rescaled score.** An earlier draft exposed `t_i · N`, with `N` the number of nodes. `N` is chosen by the certifier and can be inflated for free by registering agents. A share of a unit mass has no free parameter, and each entry fits in 64 bits.

**Absorbing convention.** Sending lost mass back to `p` makes `t` depend non-linearly on `p`. Absorbing it keeps the trust of a weighted set exactly equal to the weighted sum of its columns. A certificate can therefore carry one column per anchor, and leave-one-anchor-out is computable.

**Sub-solution certificates: a classical bound used on-chain.** The certificate relies on four elementary facts. None of them is new: they are the comparison principle for non-negative matrices of spectral radius below 1[^4], and the lower-bound property of approximate personalized PageRank vectors that local "push" algorithms use[^3]. What this ERC adds is their use as an on-chain acceptance test.
- *L1, monotonicity.* `F` has non-negative coefficients (distrust does not enter trust), and flooring is non-decreasing, so `x ≤ x′` implies `F(x) ≤ F(x′)` and `F_bas(x) ≤ F_bas(x′)`.
- *L2, a sub-solution is a lower bound.* If `C′ ≤ C` entrywise and `t ≤ F′_bas(t)`, then `t ≤ F(t) ≤ F²(t) ≤ … → t*`, so `t ≤ t*` coordinate by coordinate.
- *L3, iteration from zero.* `t⁰ = 0`, `t^{n+1} = F_bas(tⁿ)` is non-decreasing, bounded and integer, hence stationary, and every iterate is a sub-solution. A floating-point fixed point rounded to integers can exceed `F_bas(t)` by one unit. This is why §4.2 requires iteration from zero.
- *L4, leave-one-out.* `trust − (sum of the m − 1 largest contributions)` is non-decreasing in each contribution, so it remains a lower bound.

The aggregator only checks `t_v ≤ y_v` once per node and column. The result is a per-agent lower bound with no error term, whatever rows the certifier truncated. An earlier draft certified an L1 norm of the residual instead. Its single global bound forced certifiers to submit almost the whole support so that the error stayed below the threshold.

**Domination, and why two levels.** L2 only holds for the registry's graph if the committed graph is dominated by it (`C′ ≤ C`). A certificate that fabricates an edge, inflates a weight or shrinks a budget passes the arithmetic, and the test vectors include one of each. At the `RegistryVerified` level, fabrication and inflation become impossible: every committed edge, row source and owner is re-read in the submitting transaction. Two things stay impossible to check at submission, because ERC-8004 has no per-client index:
- a row's **completeness**;
- the truth of a declared `sPlus`.

Dilution (an under-declared positive budget) and omitted negative edges therefore remain provable after the fact, not refusable at submission. `SubmitterAttested` trades the re-reads for a list of accountable submitters, with the same proofs. The re-read costs roughly ten times the attested submission on the measured deployment (Reference Implementation).

**Declared `sPlus`.** Without it, omitting a positive edge would shrink `B⁺` and raise every other edge of the row: omission would become dilution. Declaring the true sum keeps the remaining edges at their true weight. The omitted mass becomes an explicit margin of `eUp` and costs nothing on the trust side. A certifier can then drop expensive or excess edges safely. Nothing declares the negative sum, so negative edges are never omissible.

**Two bounds.** `eUp` (L5) bounds `‖t* − t‖₁`. It is what makes `distrustUp = d + eEff` an upper bound on the true distrust, since distrust is linear in trust with coefficients at most `1 − α`. `eLow` (L6) bounds `‖(t − t*)⁺‖₁` after proofs of decreases. Each proof bills the exact change of the normalized row, multiplied by `(1 − α)·t_u / α`. Per-row caps bound the total, and successive amendments add up by the triangle inequality.

**Replacement by quality.** Two valid sub-solutions of the same graph satisfy `‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁` (L7). More mass is therefore more precision, and omitting endorsements (censorship) loses mass. An earlier rule compared error bounds. It blocked every honest update of a growing graph, since each new positive edge adds a rounding unit, and it rewarded censorship, since fewer edges give a smaller bound. `q`, the bound without its rounding floor, keeps truncation honest. The distrust mass `D` keeps negative edges. A zero vector has `q ≈ 1 WAD` and can never displace a live certificate.

**Growing bounds instead of slashing.** ERC-8004 does not record when feedback was given, so "this feedback existed before the certificate" cannot be proven. With slashing, anyone could post feedback just after an honest certificate, "prove" an omission and collect a bond. Widening a bound needs no dates, no bond and no challenge window. It also doubles as the recertification signal.

**Separate budgets, one-hop distrust, leave-one-out, veto.** The distrust a region `X` can emit is `(1 − α)·Σ_{u∈X} t_u·Σ_j D_uj ≤ (1 − α)·π(X)` whenever rows of `D` sum to at most 1, whether or not `D` shares a budget with `C`. A shared budget would only buy a factor of 2, and it would make honest criticism cost endorsement capacity. Distrust that propagated would let a Sybil region smear honest agents through chains of negative feedback. A stolen anchor key is used to **approve** Sybils (theft), not to veto (denial of service). With `minAnchors ≥ 2`, no single anchor can make an agent pass. The live veto reads one feedback per anchor, so a veto takes effect in the next block at a bounded cost. The certified bit keeps a veto that a later feedback of the same anchor would hide.

**Tags and edges.** A liveness ping delegates no trust. If measurement feedback propagated, anyone running an automated scanner would manufacture attack edges, and the Sybil bound would be worthless. On the deployment of Motivation, this is how trust leaked into the farm. Keeping the latest feedback per tag, then the worst across tags, is monotone toward refusal: under "latest feedback of the pair", a `+1` under another tag erased the only useful negative edge of that registry. When the latest feedback of a tag is invalid, the tag yields nothing. That is the client's current statement. Falling back to an older one would let a stale opinion speak for the client, and would need an unbounded scan in the live veto. Ties are broken by feedback index because the aggregator stores only tag hashes.

**Row copy and owner fallback.** Merging every agent that shares a wallet would pool hundreds of agents' mass behind one address. Treating such a wallet as a massless address node would silence honest agents that share a platform wallet. Copying the row into every agent that has the wallet as its source lets each agent speak with its own mass: agents without mass transmit nothing, and the measured Sybil mass is the same with one copy or a hundred. The owner fallback lets agents whose wallet was cleared by a transfer speak through their owner, who can set the wallet anyway. Because it changes the edges, it is committed in the `setId`. Certifiers can bound the copies of one row (the reference solver uses 64), but nothing on-chain depends on that bound.

**Normative encoding.** The roots hash the submitted bytes, proofs reopen rows by those bytes, and the vectors fix them. Leaving the encoding to implementations would make two conforming certifiers produce incompatible commitments. Node indices are local to an aggregator. That is enough, because a certificate is meaningful only to the aggregator that verified it.

**Proof-free reads.** A read that required the payee to supply a Merkle proof would change payment protocols on the provider side and add a proof service to operate. On storage priced per page, contiguous vectors rewritten in place are cheap, so `isTrusted` reads stored state.

**Normative quantization.** Quantization changes `C`, and therefore the fixed point. A grid of 10⁻⁴ fits an `int16` and keeps rows small.

**Edge filters.** Payment provenance and payment-claim verification are useful, orthogonal signals. One project scores the provenance of the funds behind a feedback (monad-agent-trust). Another checks whether the payment cited in an ERC-8004 evidence document happened (Kanmani). Either could become an `edgeFilterId` once its predicate can be evaluated on-chain. No filter "the receipt is true" is suggested as a default: a farm that pays itself has only true receipts.

**Constants.**
- `K_MAX = 16` anchors and `TAGS_MAX = 16` tags bound the per-set storage and the live veto.
- `ROW_MAX = 256` bounds a row in calldata. Anchor rows cannot exceed it, because they cannot be truncated.
- `α = 1/3` is the recommended value, not a fixed one: no value dominates. On synthetic graphs with known ground truth (degree 5, 100 attack edges), the honest coverage after leave-one-out at a threshold admitting 1 % of Sybils was 0.752 / 0.712 / 0.668 for `α` = 1/4 / 1/3 / 1/2. At a fixed threshold, the Sybils admitted were 0.7 % / 0.3 % / 0 %. These figures depend on the model.

**Prior art.**
- Verification of an EigenTrust computation with fraud proofs over Merkle commitments appears in the OpenRank proof of concept (Karma3 Labs), whose settlement layer is simulated off-chain.
- A seeded PageRank proven in zero knowledge over EAS attestations appears in the trustgraphs project.
- A payer that constrains itself with a policy before paying, without changing x402, is proposed in x402 issue 2641.

This ERC does not claim the on-chain verification of a fixed point, nor policy-gated payment. It contributes their combination for ERC-8004: the graph construction (tag kinds, per-tag edge unit, emitter resolution, current-controller rejection), reader-chosen anchors with leave-one-out and a live veto, the sub-solution certificate with registry re-reads and growing bounds, and a non-reverting interface that a paying contract reads in the same transaction.

⟦Sources : PROOFS.md L1-L7 (D37), présentés selon D30 comme usage on-chain d'une borne classique, pas comme résultat nouveau. Mesures α : R4 / tour 4 (synthétique, deg = 5, g = 100). D34 : masse Sybil 0,1481 pour M = 1 ou 100 copies. ROW_ALIAS_MAX = 64 (D44) : AM-08.3. Antériorités : OpenRank et trustgraphs (CLAUDE.md §6, D30), x402 #2641 (`docs/ressources/x402.md`, issue ouverte, maj 2026-09-11). D46 : Kanmani et ColinkaMir nommés comme exemples d'`edgeFilterId`, sans dépendance. EIP-1 interdit les liens GitHub : projets cités par leur nom seulement. DOI des notes 1 à 5 : vérification dans la note qui suit les références.⟧

[^1]:
    ```csl-json
    {
      "type": "paper-conference",
      "id": 1,
      "author": [{"family": "Cheng", "given": "Alice"}, {"family": "Friedman", "given": "Eric"}],
      "DOI": "10.1145/1080192.1080202",
      "title": "Sybilproof reputation mechanisms",
      "container-title": "Proceedings of the 2005 ACM SIGCOMM Workshop on Economics of Peer-to-Peer Systems",
      "original-date": {"date-parts": [[2005]]},
      "URL": "https://doi.org/10.1145/1080192.1080202"
    }
    ```

[^2]:
    ```csl-json
    {
      "type": "paper-conference",
      "id": 2,
      "author": [{"family": "Kamvar", "given": "Sepandar D."}, {"family": "Schlosser", "given": "Mario T."}, {"family": "Garcia-Molina", "given": "Hector"}],
      "DOI": "10.1145/775152.775242",
      "title": "The EigenTrust algorithm for reputation management in P2P networks",
      "container-title": "Proceedings of the 12th International Conference on World Wide Web",
      "original-date": {"date-parts": [[2003]]},
      "URL": "https://doi.org/10.1145/775152.775242"
    }
    ```

[^3]:
    ```csl-json
    {
      "type": "paper-conference",
      "id": 3,
      "author": [{"family": "Andersen", "given": "Reid"}, {"family": "Chung", "given": "Fan"}, {"family": "Lang", "given": "Kevin"}],
      "DOI": "10.1109/FOCS.2006.44",
      "title": "Local Graph Partitioning using PageRank Vectors",
      "container-title": "47th Annual IEEE Symposium on Foundations of Computer Science (FOCS'06)",
      "original-date": {"date-parts": [[2006]]},
      "URL": "https://www.math.ucsd.edu/~fan/wp/localpartition.pdf"
    }
    ```

[^4]:
    ```csl-json
    {
      "type": "book",
      "id": 4,
      "author": [{"family": "Berman", "given": "Abraham"}, {"family": "Plemmons", "given": "Robert J."}],
      "DOI": "10.1137/1.9781611971262",
      "title": "Nonnegative Matrices in the Mathematical Sciences",
      "publisher": "Society for Industrial and Applied Mathematics",
      "original-date": {"date-parts": [[1994]]},
      "URL": "https://doi.org/10.1137/1.9781611971262"
    }
    ```

[^5]:
    ```csl-json
    {
      "type": "paper-conference",
      "id": 5,
      "author": [{"family": "Yu", "given": "Haifeng"}, {"family": "Kaminsky", "given": "Michael"}, {"family": "Gibbons", "given": "Phillip B."}, {"family": "Flaxman", "given": "Abraham"}],
      "DOI": "10.1145/1159913.1159945",
      "title": "SybilGuard: Defending Against Sybil Attacks via Social Networks",
      "container-title": "Proceedings of the 2006 Conference on Applications, Technologies, Architectures, and Protocols for Computer Communications",
      "original-date": {"date-parts": [[2006]]},
      "URL": "https://doi.org/10.1145/1159913.1159945"
    }
    ```

⟦DOI vérifiés via Crossref le 01/10 (agent). EIP-1 demande un DOI et au moins une URL, de préférence vers une copie libre. Seule la note 3 a une copie libre vérifiée. Pour les autres, l'URL est celle du DOI : à confirmer au lint (eipw). SybilRank (NSDI 2012) n'a pas de DOI, donc il est cité sans note. OpenRank : le PoC (`openrankprotocol/openrank-poc`, Rust) simule la couche de règlement et ne déploie aucun contrat. L'affirmation « première vérification déployée sur un contrat EVM » n'est PAS faite dans le texte (non vérifiée au-delà de deux organisations GitHub).⟧

## Backwards Compatibility

This ERC requires no change to ERC-8004. Aggregators only read the registries: `ownerOf`, `getApproved`, `isApprovedForAll`, `getAgentWallet`, `getLastIndex`, `readFeedback` and `getVersion`. Certifiers also read the events `NewFeedback`, `FeedbackRevoked`, `MetadataSet`, `Registered` and `Transfer`.

**Requested for a future ERC-8004 revision.** Each request removes a limitation stated in Security Considerations:

1. **Record `block.number` with each feedback.** Omissions, transfers and anchor key rotations would become datable. Discrepancy proofs could then be limited to facts that predate a certificate, and reputation received before a transfer could be separated from reputation received after it.
2. **Extend the `giveFeedback` guard to `agentWallet`.** The current guard rejects the owner and approved operators, but not the agent's own wallet.
3. **Make `agentWallet` unique and add a reverse lookup.** Emitter resolution and row completeness would become verifiable on-chain.
4. **Timelock registry upgrades.** Upgrades should be announced on-chain, with a delay, before they take effect.
5. **Standardize `getVersion()`** in the ERC-8004 interfaces, so that aggregators can commit to a registry version without relying on an implementation detail.

If the registries change the semantics of `agentWallet`, of `feedbackIndex` or of the guard, existing certificates become `REGISTRY_CHANGED` (§7) once the version string changes, and sets need recertification.

⟦D17, tour 3 Q3 C. Demande 1 déjà dans le draft du 21/09 ; 2 à 4 ajoutées au tour 3 ; 5 proposée par R6 (AM-R6.10). Une v2.1.0 (unicité du wallet, index inverse) existe en amont (PR #80, ouverte, non déployée au 27/09). `isAuthorizedOrOwner`, utilisé par l'implémentation, est une fonction de l'implémentation de référence d'ERC-8004 : la norme ne cite que les fonctions ERC-721.⟧

## Test Cases

The vectors are in the [assets directory](../assets/erc-0000/README.md), as JSON with a field-by-field description. They are normative for the quantities they fix:
- the weight of a feedback;
- the pair edge;
- the `setId`;
- the row bytes, `graphRoot` and `vectorRoot`;
- the sub-solution check, `r`, `eUp`, `q`, `eEff`, `qEff`, mass, `d`, `D`;
- the amounts of the discrepancy proofs.

Every expected value is an exact integer. An independent checker, `verify.py`, recomputes each one from this specification with the Python standard library, and also checks `t ≤ t*` and `‖t* − t‖₁ ≤ eUp` in exact rational arithmetic. The reference implementation accepts every certificate vector with identical values.

### TC-1 Normalization (§3.2): `quantization.json`, 19 cases

| tag (min, neutral, max) | value | decimals | weight |
|---|---|---|---|
| `starred` (0, 50, 100) | 87 | 0 | 7400 |
| `starred` | 33 | 0 | −3400 |
| `starred` | 4999 | 2 | −2 |
| `starred` | 10³⁸ | 0 | invalid (discarded, not clamped) |
| `third` (0, 0, 3) | 1 | 0 | 3333 |
| `minusthird` (−3, 0, 0) | −1 | 0 | −3333 (toward zero) |
| `vouch` (0, 0, 1) | 1 | 19 | invalid (`valueDecimals > 18`) |

### TC-2 Pair edge (§3.3): `pair-edge.json`, 13 cases

| history of one (client, agent) pair, oldest first | expected |
|---|---|
| `slash −100` (1), `review +1` (2) | `w = −10000`, index 1 (negative dominance) |
| `vouch 1` (1), `vouch 0` (2) | no edge (the latest `vouch` is neutral) |
| `vouch 1` (1), `vouch 1` revoked (2) | `w = 10000`, index 1 |
| `vouch 1` (1), `vouch 5` out of bounds (2) | no edge: the latest feedback of the tag is invalid, and the older one is not used |
| `vouch 1` (1), `uptime 100` measurement (2) | `w = 10000`, index 1 |
| `vouch 1` (1), `review +1` (2) | `w = 10000`, index 2 (tie: highest index) |
| `vouch 1` from a controller of the agent | no edge |
| `veto −1` (1), `review +1` (2) | `w = −10000`, index 1 (the live veto of §8.2 reads only index 2) |

### TC-3 Reference certificate: `certificates/mainnet_slash_anchor.json`

The state of a real registry at a fixed block, with `α = 1/3` and two anchors `A1`, `A2` weighted `1/2` each. `A2` is also the `agentWallet` of agent 18. Edges after §3:
- `A1 → 18`: `+10000`;
- `A2 → 2`: `+10000`;
- `A2 → 3`: `+10000`;
- `A2 → 4`: `−10000`.

`A2`'s row is carried by the anchor node and copied into agent 18 (§3.5). Exact values:

| node | `t^(A1)` | `t^(A2)` | `trust` | `trustRobust` (m = 2) | `d` |
|---|---|---|---|---|---|
| `A1` | 1/3 | 0 | — | — | 0 |
| `A2` | 0 | 1/3 | — | — | 0 |
| 18 | 2/9 | 0 | 1/9 | 0 | 0 |
| 2 | 2/27 | 1/9 | 5/54 | 1/27 | 0 |
| 3 | 2/27 | 1/9 | 5/54 | 1/27 | 0 |
| 4 | 0 | 0 | 0 | 0 | 5/27 |

The certified integers are the floors of these values, reached in 4 iterations from zero. Expected results:
- `r = (6, 6)`, `eUp = (18, 18)`, `eEff = 18`, `qEff = 0`, mass `629629629629629628`;
- `D = 185185185185185186`, that is 5/27 rounded up;
- `graphRoot` and `vectorRoot` as in the file.

The slash makes agent 4's distrust positive although a later `+1` exists under another tag, and sets `A2`'s certified veto bit on agent 4.

### TC-4 Other certificates: `certificates/`

| vector | nodes | edges | level | what it fixes |
|---|---|---|---|---|
| `mainnet_honest_d20` | 6 | 5 | `RegistryVerified` | row copy restores a two-hop honest chain |
| `mainnet_scanner_preD15` | 35 | 58 | `RegistryVerified` | a set that declares a scanner's measurement tags as endorsements leaks trust into a farm |
| `mainnet_em_d44` | 13 | 48 | `RegistryVerified` | `ownerFallback` and VIA_OWNER rows, a 33-byte tag, ties resolved by index |
| `toy_alias_owner_rowmax` | 264 | 266 | `SubmitterAttested` | alias rows, wallet precedence, a row capped at `ROW_MAX` with declared `sPlus` (`eUp_A1 ≈ 2.2·10¹⁵` wei from the declared-omission margin) |
| `toy_alpha_1_2`, `_1_3`, `_1_4` | 5 | 7 | `SubmitterAttested` | the same graph under three values of `α` |
| `toy_truncated` | 5 | 6 | `SubmitterAttested` | truncation margin of a node without a row |

### TC-5 Violations and proofs (§5, §6): `violations/`

Four certificates satisfy `t ≤ F_bas(t)` for their committed graph, but that graph is not dominated by the registry. All four are built on TC-3.

| violation | effect on the true graph | `RegistryVerified` at submission | proof (`proveEdge`) | `eLowEff` / `eEff` after |
|---|---|---|---|---|
| fabricated edge `A1 → 4` | `t(4)`: 0 → 0.0556 | refused (`EdgeMismatch`) | `SubmitterAttested`: row `A1`, agent 4, `wNew = 0` | 166666666666666667 / 166666666666666688 |
| inflated slash (`−1` instead of `−10000`) | `d(4)`: 0.1852 → 0.1111 | refused (`EdgeMismatch`) | `SubmitterAttested`: row 18, agent 4, `wNew = −10000` | 0 / 222200000000000018 |
| dilution: `18 → 3` omitted, no `sPlus` | `t(2)`: 0.0926 → 0.1296 | accepted | row 18, agent 3, `wNew = 10000` | 111111111111111111 / 111111111111111127 |
| slash omitted (anchor row and copy) | `d(4)`: 0.1852 → 0 | accepted | row `A2`, then row 18, agent 4, `wNew = −10000` | 0 / 555555555555555573 |

After the proofs, `‖(t − t*)⁺‖₁ ≤ eLow` and `d* ≤ d + eEff` hold again for the true graph. Resubmitting a proven certificate unchanged reverts (§5.9).

### TC-6 Behaviour (§5.9, §7, §8)

These cases need a chain. Their expected outcomes are normative:

1. `assess` on an unknown `setId`, or on a set without a certificate, returns `NO_CERT` with every value zero, and does not revert.
2. At `certBlock + maxAge + 1`, the status is `STALE`. It is also `STALE` as soon as proofs push `eLowEff` above `eLowMax`.
3. After a registry version string changes and `checkRegistry(setId)` is called, the status is `REGISTRY_CHANGED`, and `RegistryChanged` is emitted. The next accepted certificate clears it.
4. Transfers:
   - strict mode: after `transferFrom` of a certified agent with non-zero trust, the agent is `TRANSFERRED`, and also if `ownerOf` reverts;
   - fast mode: the agent is `TRANSFERRED` only after `proveTransfer`.
5. An anchor's current key posts `veto −1` on agent `j`:
   - in the next block, `assess(j, set, true)` returns `VETOED`, with `vetoCount = 1` and `triggerTag = keccak256("veto")`, without recertification;
   - if the anchor then posts any other feedback on `j`, the live veto lapses. The agent stays `VETOED` only if the certificate carries the anchor's veto bit.
6. An agent outside the certificate has status `OK`, zero trust, and `isTrusted = false`.
7. An agent endorsed by a single anchor of a set with `minAnchors = 2` has `trustRobust = 0` and is not trusted.
8. Open set, replacement:
   - a certificate that omits endorsements (less mass) is refused;
   - a certificate for a graph that gained an edge (more mass, same `q`) is accepted;
   - the zero vector is refused against a live certificate;
   - a certificate that omits a negative edge (lower `D`) is refused;
   - a widened certificate resubmitted unchanged is refused.
9. With a registry that reverts or returns malformed data, `assess`, `trustOf` and `isTrusted` do not revert, and `isTrusted` returns `false`.

⟦Tests de l'implémentation de référence correspondants (`contracts/test/`) :
1. `test_statuses` ;
2. `test_statuses`, `test_dilutionProvenWidensLowerBound` ;
3. `test_registryChanged`, `test_fork_upgradeDetected`, `test_fork_upgradeToPR80` ;
4. `test_statuses`, `test_fastTransferMode` ;
5. `test_vetoIsLastAnchorFeedback`, `test_certifiedVetoBit`, `test_fork_vetoOnRealSlash` ;
6. `test_isTrusted` ;
7. `test_leaveOneOut` ;
8. `test_openReplacementRule`, `test_replacementRefusesOmittedNegative`, `test_replacementRefusesResubmittingProvenCertificate` ;
9. `test_neverRevertsOnBrokenRegistry`.

Ces cas ne sont pas dans `verify.py` : ils exigent un registre. Le chemin `assets/erc-0000` suit l'usage du dépôt ERCs (numéro provisoire 0000, à renommer quand un éditeur attribue le numéro).⟧

## Reference Implementation

The reference implementation has four parts:
- an aggregator contract that implements §2 to §10;
- an off-chain solver that applies the edge rules of §3 and iterates from zero;
- a certifier service;
- a watcher that audits each certificate against the registry and submits `proveEdge`, `proveWallet` or `proveTransfer`.

It passes every vector of the Test Cases. On the deployment described in Motivation, measured on a fork of that chain on 2026-10-01:

| operation | gas |
|---|---|
| certificate of 300 edges, 100 nodes, 3 anchors, `RegistryVerified` (update) | 14,974,802 |
| same certificate, `SubmitterAttested` | 1,351,917 |
| re-read of one edge in the registry (single feedback in the pair) | ≈ 45,500 |
| each further feedback in the same pair | ≈ 13,000 |
| `isTrusted` on an unknown agent | 29,231 |
| `assess` without veto, strict transfer mode | 80,609 |
| `assess` with veto | 139,055 – 165,888 |
| one discrepancy proof | 258,685 – 304,293 |

With a 30 M gas transaction limit, a `RegistryVerified` certificate holds about 630 single-feedback edges at `k = 3`. Splitting verification across transactions is not specified.

The contract's runtime bytecode is 33,527 bytes. That is above the 24,576-byte limit of [EIP-170](./eip-170.md), so it cannot be deployed unchanged on a chain that enforces that limit. A deployment on such a chain has to move the proof functions (`proveEdge`, `proveWallet`, `proveTransfer`) into a separate contract that shares the aggregator's storage, or move the verification pass into libraries. Either split leaves the interface of §10 unchanged.

⟦Chiffres : `contracts/GAS.md` (MESURÉ, intégration 02 + 04, 01/10 ; 630 arêtes CALCULÉ). Le dépôt est privé (décision de Hugo) : avant la PR, il faut soit le rendre public et le citer (EIP-1 n'autorise pas le lien GitHub, mais l'implémentation peut être copiée dans `assets/`), soit copier `AnchoredReputation.sol` dans `assets/erc-0000/`. Taille : AM-INT.9 et AM-08.13 ; ma recommandation est de découper APRÈS la soumission du hackathon (hors chemin critique : Monad accepte 128 Ko), mais AVANT la PR d'ERC si Hugo veut une implémentation de référence déployable sur Ethereum.⟧

## Security Considerations

**What a certificate guarantees.**
- At submission, `t ≤ t*` holds for the committed graph.
- For the registry's graph, it holds only if the committed graph is dominated by it (Rationale).
- At the `RegistryVerified` level, fabricated and inflated edges are refused, but dilution (an under-declared `sPlus`) and omitted negative edges are not, because completeness cannot be checked without a per-client index. At the `SubmitterAttested` level, all four are possible for a listed submitter.

In every case, the lower bound is guaranteed for the registry's graph only once every existing discrepancy has been proven. No level makes a certificate unforgeable. A consumer relying on a set should know who watches it.

**Open sets need a watcher.** On a set without listed submitters, anyone can submit. A diluted certificate that does not lower the mass, `q` or `D` passes the replacement rule and can displace an honest one before `maxAge`. A proof corrects it, and the honest certificate then replaces it at once. A slightly different variant can be resubmitted, though, and has to be proven again: each round costs the submitter about a full certificate and the watcher one proof. Nothing on-chain bounds the number of rounds. A set that cannot guarantee an active watcher should list its submitters.

**Bounds are global over a set.** `eLowEff` and `eEff` aggregate over all agents. One proof on a high-trust row lowers `trustLow`, or raises `distrustUp`, for every agent of the set until recertification.
- On the deployment of Motivation, proving one omitted negative edge on an anchor row raised `eEff` from 18 wei to 0.556 WAD. With `ρ = 1/2`, no agent passed `isTrusted` until the next certificate.
- Only the client of a committed row can create such facts, and the replacement rule lets recertification follow at once. This is fail-closed by design, and it is also a denial-of-service lever.
- The owner of an endorsed agent can make its endorser an approved operator (`setApprovalForAll`), which turns the endorsement into a controller relation, and then prove the decrease.
- `eLowMax` caps the widening of the lower bound: beyond it, the set is `STALE` and any certificate can replace the current one.

**Cost asymmetries.** Re-reading a pair edge scans the pair's history from its latest index downward. The client of a row can stack feedback on a pair to make a `RegistryVerified` submission, or a proof, more expensive. On the deployment of Motivation, each stacked feedback costs its author about 20 times what it costs a reader to skip it. A certifier can also omit such a positive edge under a declared `sPlus`.

**Anchors.**
- With `minAnchors ≥ 2` and `vetoQuorum = 1`, a stolen anchor key yields at most a denial of service: vetoes, distrust, and the loss of the endorsements it held. It never yields a payment to an agent that the other anchors do not endorse. With `minAnchors = 1`, one stolen key suffices to make a Sybil agent pass.
- This version names anchors by address. A compromised anchor cannot rotate its key: it has to be replaced in a new set, and consumers have to migrate.
- The live veto reads only an anchor's last feedback on an agent. Any later feedback from the anchor, even a measurement, lifts the live veto. Only the certified bit keeps it until the next certificate. Anchors therefore have to follow §9.
- A slash followed by a positive feedback from the same anchor, both posted between two certificates, is seen neither live nor by the certificate.

**Consumer as anchor.** A consumer can be one of the anchors of the sets it uses, and rate the providers that delivered. Combined with `minAnchors ≥ 2`, the consumer alone never makes a provider pass. A consumer plus one complacent anchor does, so the second anchor matters.

**Liveness.** Every consumer that fails closed depends on someone recertifying before `maxAge`. Submission is permissionless on open sets, so a consumer that runs the published solver can recertify itself. Listed submitters are a liveness dependency.

⟦OPEN — désaccord 1 du tour 2 (dépendance de vivacité, AM-2.12) : E exige un mode dégradé ; A et D refusent tout mode qui paie sans certificat frais. Le texte ne définit aucun mode dégradé. Maintenu ouvert : D27 dit qui paie la recertification, pas ce qui arrive s'il ne paie plus.⟧

**Transfers and reputation purchase.**
- ERC-8004 clears `agentWallet` on transfer.
- A transferred agent reads as `TRANSFERRED`, live in strict mode, after `proveTransfer` in fast mode, until the next certificate.
- Its **outgoing** edges stay in the certified vectors until someone submits `proveWallet` or a new certificate is accepted. Until then, a bought agent keeps propagating the mass it had.
- Feedback is undated, so reputation received before the transfer cannot be separated from reputation received after it: buying a reputable agent costs a pause, not a reset.
- The committed owner is a 63-bit fingerprint. A transfer to an address that shares those 63 bits goes unnoticed. Finding one takes about 2⁶³ attempts.

**Registry governance.** The registries of the deployment in Motivation are upgradeable proxies controlled by a single externally owned account, with no timelock *(verified 2026-09-27)*. Their owner can change any semantics this ERC relies on.
- The version hash detects an upgrade only if the version string changes, and only for the sets on which someone calls `checkRegistry`. An upgrade that keeps the version string is detectable only off-chain, through `Upgraded` events.
- Consumers of high-value flows should monitor those events.
- `getVersion` and the reference registry's `isAuthorizedOrOwner` are not part of the ERC-8004 interface. An aggregator on a registry without them refuses every submission. It can use the ERC-721 functions of §1 instead of `isAuthorizedOrOwner`.

**The registry guard and shared wallets.**
- The ERC-8004 guard does not reject an agent's own `agentWallet`: one agent of the deployment in Motivation received 78 feedback entries from it. §3.3 rejects every current controller, `agentWallet` included.
- Former owners are not rejected, because past ownership cannot be checked on-chain. A seller can rate the agent it sold, with the weight of its own mass, like any third party.
- A wallet shared by several agents makes each of them emit the same row with its own mass. A platform wallet whose agents are all reputable therefore speaks with their combined mass. That is concentration, not a Sybil gain, and it is visible in the certificate.

**Permanent negatives.** Negative feedback dominates until its author revokes it, and only its author can revoke it. If the author loses its key, the negative is permanent. The provider's recourse is out of protocol: ERC-8004 `appendResponse`, and the consumer's choice of set.

⟦OPEN — désaccord 1 du tour 3 (négatif permanent) : A et E veulent une échéance ou une levée ; D refuse toute échéance (l'attaquant attendrait l'expiration). Rien n'est tranché : la révocation par l'auteur reste le seul mécanisme, et le texte n'en définit pas d'autre.⟧

**Refusal oracle.** `triggerTag` tells any caller which tag caused a veto. The state is public anyway.

**Measurement leakage.** A set that declares an automated measurement tag as an endorsement recreates attack edges. On the deployment of Motivation, taking a scanner as the only anchor leaked 34.6 % of its mass into the farm. Reference schemas should classify every tag posted by automated monitors as a measurement.

**Payment is not honesty.** Payment-backed feedback raises the cost of an attack but does not prevent self-funded rings, as observed on-chain. Payment is neither a weight nor a pass condition in this ERC.

**Rounding.** Every term of `y` and every contribution `c_a` is rounded down. Margins, bounds, proof amounts and distrust are rounded up. Rounding never helps an agent pass.

**Gas.** Every external call made by a read is gas-capped, so a hostile registry cannot exhaust the caller's gas. A decision can still cost more than a micropayment. Payers may cache decisions per payee for a bounded number of blocks (§8.3), and should call reads with an explicit gas limit, treating out-of-gas as untrusted.

**Same chain.** All registry reads are same-chain. Using a certificate on another chain would reintroduce trust in a bridge.

⟦Correspondance : AM-02.1 (« ce que garantit un certificat »), AM-02.2 / AM-INT.1 / AM-INT.15 (ensembles ouverts), AM-02.4 / AM-INT.4 (bornes globales, 18 wei → 0,556 WAD MESURÉ sur fork le 01/10), AM-02.3 (asymétrie ≈ 20×, 13 k contre 271 k MESURÉS), AM-02.6 et AM-4.7 (veto), AM-08.4 (gel des sortantes), AM-08.9 (empreinte 63 bits), AM-3.5 / D17 / AM-08.5 (gouvernance), AM-08.10 (fonctions non standard), AM-3.3 / AM-2.8 (78 cas), D20 (anciens owners), désaccord 1 du tour 4 (concentration), désaccord 3 du tour 2 (consommateur-ancre), R4 (34,6 %), D25 (cache), AM-R5.9 (appels plafonnés). Aucun mot-clé RFC 2119 hors de la Specification (EIP-1) : les MUST de sécurité (minAnchors ≥ 2, cache borné) sont passés en §8.3.⟧

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).

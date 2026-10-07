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

⟦Texte du chantier 08, 2026-10-01, réécrit à partir du draft R6 (27/09) pour l'aligner sur les décisions D20 à D46 du CR et sur l'implémentation v1 ; **mis à jour par le chantier 08-bis le 2026-10-07** pour D47 à D56, le lot 02-bis (corrections A, B, C, R1 à R8, renommage), la revue maximale du 06/10 et les relais de 04-bis (`contracts/ENCODING.md` §0bis, `solver/FORMAT.md` R1 bis, R6, R8). Les notes en français entre ⟦ ⟧ sont internes et DOIVENT être retirées avant soumission (`drafts/strip-notes.py`). ⟦OPEN⟧ marque un point que le CR n'a pas tranché. Les blocs `<!-- DISCLOSURE-GATE:start -->` … `<!-- DISCLOSURE-GATE:end -->` contiennent ce qui dépend de la divulgation aux mainteneurs d'ERC-8004 (D29, non encore envoyée au 07/10) : ils restent hors de toute version publique tant que Hugo ne l'a pas faite. La correspondance ancien texte → nouveau texte est dans `docs/erc/CHANGES.md` (sections 08 et 08-bis). Avant soumission : `author` (🧑 Hugo), `discussions-to` (fil dédié à ouvrir, voir `drafts/`), numéro attribué par les éditeurs.⟧

## Abstract

[ERC-8004](./eip-8004.md) records feedback about agents but leaves aggregation and Sybil filtering to readers: `getSummary` requires a caller-supplied list of clients, and the ERC states that Sybil attacks are possible. This ERC standardizes that missing layer.

An **anchor set** is an immutable, content-addressed description of *whom the reader trusts to start with* (anchors and their weights), *how feedback becomes edges* (a tag schema with declared scales and kinds), and *when an agent may be paid* (a policy). For each anchor set, a **certificate** publishes, per anchor, a personalized-PageRank trust column over the ERC-8004 feedback graph and a one-hop distrust vector. Trust therefore propagates **beyond the first hop**: an agent endorsed by an agent that the anchors endorse receives trust, with a bound on what a Sybil region can capture. The aggregator contract accepts a certificate only if every submitted trust value is a **sub-solution** of the committed graph (`t ≤ F(t)` coordinate by coordinate), which makes it a per-agent **lower bound** of the true trust, with no error term, as long as the committed graph is dominated by the registry's graph. At the `RegistryVerified` level, the contract re-reads every committed edge in the registry at submission, so fabricated or inflated edges are refused. Edges that are omitted, diluted or changed after submission can be proven by anyone. A proof only widens the certificate's bounds and records the proven fact, so that no later certificate can bring the false row back. It never moves funds.

Contracts read the result synchronously. `passesAnchorPolicy(agentId, setId)` applies the policy committed in the set: leave-one-anchor-out trust, distrust ratio, live anchor veto, freshness and transfer. It never reverts. Anchors veto an agent, without recertification, by posting negative feedback in the registry.

## Motivation

- **Aggregation is required by ERC-8004 but unspecified.** ERC-8004 expects "many players to build reputation systems" and leaves Sybil filtering to the reader, but defines no interface for the result. As of 2026-09-21, at least eight independent aggregators existed, each with its own API. A contract cannot consume reputation without trusting one vendor's off-chain service.

- **Raw feedback is not comparable.** On Monad mainnet (chain ID 143), which runs ERC-8004 v2.0.0, one registry mixed 0–100 ratings, Elo ratings around 1,600, ±1 votes and 117 values of `1e38`. The naive mean of the most-rated agent was about 1.5 × 10³⁶ *(measured 2026-09-21, unchanged on 2026-09-27)*. Without a declared scale per tag, every average is meaningless.

- **Sybil farms dominate unfiltered data.** On the same deployment, 7,665 of 9,188 feedback entries (83 %) came from agents registered within about 48 hours, all rating one agent at the maximum *(measured 2026-09-21; 82.5 % of 9,291 on 2026-10-06, block 110,994,810)*.

- **Payment is not a defence.** The farm above paid for its interactions, and the raters were funded by the rated agent's owner: in a random sample of 150 of its raters, each one received its first native-token transfer from that owner, always for the same amount *(measured 2026-10-06)*. A third-party analysis of the same data found 16 entries out of 9,188 with clean payment provenance *(reported 2026-09-21, not re-verified)*. Another third-party service reports that 73 of 85 payment claims in ERC-8004 evidence documents on that chain cite a transaction absent from the chain they name *(self-reported, read 2026-09-28)*. A receipt, true or false, says nothing about whether the payer is independent of the payee.

<!-- DISCLOSURE-GATE:start — keep only once the ERC-8004 maintainers have been notified (decision D29) -->
- **The registry's own guard is bypassed in practice.** `giveFeedback` rejects the owner and operators of an agent, but not its `agentWallet`. On the same deployment, one agent received 78 entries from its own `agentWallet` *(measured and checked against the deployed source, 2026-09-27)*.
<!-- DISCLOSURE-GATE:end -->

- **Wallets are shared and transient.** On the same deployment, 178 wallets are each the `agentWallet` of several agents (1,773 agents in total, up to 762 per wallet), and the wallet was cleared at each of the 72 historical transfers *(measured, 2026-09-27)*. An aggregator cannot equate a wallet with an agent.

- **Measurement tags create attack edges.** A monitoring service that pings endpoints and posts `liveness` or `trust` feedback endorses whatever it pings. On the same deployment, such a scanner rated farm agents, which rated the farm's target. With the scanner as the only trusted source, 34.6 % of its trust mass reached the farm *(measured 2026-09-27, reference solver)*.

- **A single global score is undesirable.** Contributors to the ERC-8004 discussion called a single aggregated score dangerous, and one post in that thread asked for reputation *relative to reader-chosen anchors* (personalized PageRank, EigenTrust pre-trusted peers). No specification provides it.

- **One hop is not enough.** A reader-supplied list of trusted clients, which is what `getSummary` accepts, answers only for the agents those clients rated themselves. An agent one step further away reads as unknown, however well it is endorsed. A reputation layer has to carry trust along endorsement chains, and then has to bound what a Sybil region can capture along them. Test vector TC-7 shows an agent two hops from the anchors that a one-hop reading calls unknown and that this ERC accepts.

- **Contracts need to act on trust, not just display it.** Payment routers, escrow and access control need a synchronous answer, a freshness indicator, and fail-closed behaviour, computed on-chain and not served by an API.

- **The real graph is thin, and that is the point.** On the deployment above, 84 agents had received feedback *(snapshot of 2026-09-21)*. Under the edge rules of this ERC and a minimal endorsement schema, a single honest endorsement chain remains: one client endorses three agents through the wallet it shares with them. An aggregator conforming to this ERC gives the farm's target zero trust, and almost every other agent is unknown *(measured 2026-10-01, reference implementation; no new usable edge on 2026-10-06, 9,291 entries)*. That is the correct answer, and a reader-anchored certificate states it verifiably.

⟦Sources : CR tour 3 « Faits vérifiés » (bloc ≈ 108,43 M), AM-6.11 (9 283 avis, relayer `0x10304054`), 04-bis E2 (snapshot roulé au bloc 110 994 810 le 06/10 : 9 291 avis, 82,50 %, 0 arête nouvelle au schéma de référence, MESURÉ), D55 (150 noteurs d'Eve financés par `0x97cD…0996`, 11,0 MON chacun, MESURÉ 06/10, Transfers API ; le montant et l'adresse ne sont pas repris, la norme ne nomme pas la ferme), D50 (« un saut ne suffit pas » : en avant ; vecteur commun `common_2hop`), R4 (34,6 %), résultats du chantier 04 (chaîne honnête rétablie par D20, Eve à 0), tour 6 (Kanmani, auto-déclaré, 28/09). « Huit agrégateurs » : fiche projet du vault, 21/09, NON REVÉRIFIÉ depuis. Les tiers (ColinkaMir, Kanmani) ne sont pas nommés dans le texte, conformément à D29 (« ne jamais présenter un tiers comme attaquant ») et à la consigne de C au tour 6 (« jamais de positionnement contre un concurrent dans l'ERC ») : ils sont nommés en Rationale, comme exemples d'`edgeFilterId` (D46). L'étude arXiv « 59-91 % » du draft R6 est retirée : EIP-1 n'autorise pas ce lien et le chiffre n'était pas revérifié. Le scanner n'est pas nommé (AM-5.2 : service automatique, pas complice).⟧

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### 1. Conventions

- `WAD = 10**18`. Trust, distrust, mass and bound values are unsigned integers in WAD. All divisions are integer divisions, and the rounding direction is stated at each step: ⌊x⌋ rounds down, ⌈x⌉ rounds up.
- `GRID = 10_000`. Edge weights are integers in `[−GRID, GRID]` (a grid of 10⁻⁴).
- All byte strings are big-endian.
- **Registries.** An aggregator is bound, for its whole life, to one ERC-8004 Identity Registry and the Reputation Registry linked to it, on the chain where the aggregator is deployed. It MUST NOT read registries on another chain.
- **Feedback.** A tuple `(agentId, client, feedbackIndex, value, valueDecimals, tag1, tag2, isRevoked)` as returned by `readFeedback(agentId, client, feedbackIndex)`. `feedbackIndex` starts at 1 and is ordered per `(agentId, client)` pair, across all tags. `getLastIndex(agentId, client)` returns the highest index. `tag2` is ignored by this ERC.
- **Controllers of an agent `j`.** Read through the [ERC-721](./eip-721.md) interface of the Identity Registry: `ownerOf(j)`, `getAgentWallet(j)`, `getApproved(j)`, and every address `o` with `isApprovedForAll(ownerOf(j), o)`, all read at the time of the check. Former owners are not controllers.
- **Registry answers.** A call to the Identity Registry that reverts with `ERC721NonexistentToken(uint256)` (the [ERC-6093](./eip-6093.md) error) means that the agent does not exist. Any other revert, an out-of-gas failure or malformed return data means that the registry is **unreadable**, never that the agent does not exist. Each function states what it does with an unreadable registry.
- **Blocks.** All ages and delays are counted in blocks (`block.number`), never in seconds.
- **Mass.** A node has *mass* if `t_i^(a) ≠ 0` for at least one column `a`.
- **Ranges.** This version supports `agentId < 2^32` and `feedbackIndex < 2^32`. An agent with a larger `agentId` cannot be a node, and is read as unknown.
- **Registry functions.** Besides the ERC-8004 and ERC-721 functions named above, this version requires the registries to expose `getVersion()` (§7). An aggregator MUST be bound to its registries immutably: it MUST NOT be upgradeable in a way that changes the registries it reads.
- **Precedence.** If this specification and a test vector disagree, this specification prevails.

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
- An anchor address MAY also be the source (§3.5) of agents. Such agents emit no row (§3.5): an anchor speaks only through its anchor node, in its own column.

⟦08-bis : le SHOULD NOT « ancre ≠ source d'un agent » du 01/10 devient une règle du graphe (§3.5) et un refus du contrat (`AnchorAsSource`, §5.6), D48-A, PROOFS L8. D1, D24, D39. Le préimage est celui de l'implémentation v1 (`computeSetId`, ENCODING §1), pas celui du draft R6 (`chainId`, registres, `metadataURI`, `edgeFilterId`, `anchorKeyRegistry`) : AM-08.1. α par ensemble : D24, ce qui ferme le désaccord 6 du tour 2 (⟦OPEN⟧ retiré). TAGS_MAX = 16 : D24. `K_MAX = 16`, `SUBMITTERS_MAX = 8` : constantes v1.⟧

#### 2.2 Policy

Everything a payer needs in order to decide is committed in the `setId`. The status returned by the reading functions describes the certificate, not the agent; `passesAnchorPolicy` applies the policy (§8). The answer says that the agent passes the policy of *these* anchors, not that it is trustworthy in general.

| Field | Meaning | Constraint |
|---|---|---|
| `theta` | minimum lower-bound trust `trustLow` for an agent to pass | `> 0`, so an unknown agent never passes; no recommended value (Rationale, *Constants*) |
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
| `submitters` | certifiers allowed to submit and to append nodes; empty means open | empty requires `registryVerified` |

⟦D35 (mode strict par défaut, RECOMMENDED), D36 (eLowMax), D39 (statut ≠ confiance), D33 (vetoMax), D44 (ownerFallback, défaut false = décision de Hugo en attente, AM-INT.8). D48/AM-9.5 : le nom `passesAnchorPolicy` dit ce que la réponse affirme. D56 : θ = 1 % est la valeur de la démo, aucune valeur n'est recommandée par la norme ; les vecteurs gardent θ = 10⁻³, valeur de test (FORMAT §1).⟧

#### 2.3 Certification levels

- **`RegistryVerified`** (`registryVerified = true`). At submission, the aggregator re-reads every committed edge, every row source and every committed owner in the registries (§5.7), and refuses the certificate on any mismatch. Submission MAY be open to anyone (`submitters` empty) or restricted to the listed submitters.
- **`SubmitterAttested`** (`registryVerified = false`, `submitters` non-empty). Only listed submitters may submit or append nodes. The aggregator checks the arithmetic and the shape of the submission, but not its content against the registry.

At both levels, discrepancy proofs (§6) are permissionless and remain available for the life of the certificate, and the facts they establish bind every later certificate of the set (§5.10). A set MUST NOT be open unless it is `RegistryVerified`.

⟦D32 remplace les trois niveaux R6 (ResidualVerified / RegistryContested / Optimistic). Le niveau Optimistic et son `optimisticCertifier` (AM-R6.17) disparaissent : Submitter-attested est leur version saine (preuves actives, preuve (v)). D27 : le propriétaire de l'ensemble est le soumetteur attesté par défaut.⟧

#### 2.4 Schema document

`tagSchemaHash` is the keccak256 of a UTF-8 JSON document that the set's author publishes off-chain. The document MUST contain:

- `setParams`: the complete `SetParams` of the set, from which any reader can recompute the `setId` (§2.1) and therefore check that the document describes the registered set;
- `name`, `author` and `rationale`: who the anchors are, who chose them and why.

`tagSchemaHash` is the keccak256 of the document's RFC 8785 canonical JSON serialization, with `setParams.tagSchemaHash` set to the zero value. The document SHOULD state whether the set is for demonstration and SHOULD be published at a content-addressed location. Consumers SHOULD recompute the `setId` from the document before relying on a set. The aggregator does not read the document. How a consumer discovers sets is out of scope.

⟦Le `metadataURI` du draft R6 et l'`edgeFilterId` n'existent pas dans le `SetParams` v1. Ils sont rattachés au document engagé par `tagSchemaHash`, ce qui les met dans le `setId` sans changer le contrat (AM-08.1, AM-08.2). Le format exact du document (clés JSON, canonicalisation avant hachage) n'est pas fixé par le CR : je propose un JSON canonique (RFC 8785) dans E2, à valider.⟧

### 3. Graph

For an anchor set and a registry state, the **graph** is a set of weighted, directed edges between nodes. The rules in this section are normative. Two conforming implementations MUST derive the same edges, with the same weights, from the same registry state and the same set.

#### 3.1 Tags and kinds

- Each `TagSpec` MUST satisfy `min ≤ neutral ≤ max` and `min < max`, and `kind ∈ {0, 1}`.
- **Only `endorsement` tags create edges.** Feedback whose `tag1` is a `measurement` tag MUST NOT create an edge and MUST NOT propagate trust or distrust. A consumer MAY use measurement feedback in its own policy, outside the quantities defined by this ERC.
- **Tag identity.** A tag is identified by `keccak256` of its exact bytes. A feedback matches a `TagSpec` if and only if `keccak256(bytes(tag1)) == keccak256(bytes(spec.tag))`. Implementations MUST NOT match tags by a decoded, normalized, re-encoded or truncated text: a `tag1` MAY be arbitrarily long and MAY contain any bytes, NUL bytes and invalid UTF-8 included. ERC-8004 emits this hash as the indexed `tag1` topic of `NewFeedback`, so an indexer can match without storing the text.
- Feedback whose `tag1` matches no `TagSpec` of the set MUST be ignored.

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
4. **Self-endorsement.** If `w(c, j) > 0` and `c` is a controller of `j` (§1), read at the time the edge is evaluated, there is no edge. A controller's **negative** pair weight is kept. The test applies to the sign of the combined weight of step 2, not to each tag.
5. **Existence.** An agent that does not exist (§1) has no incoming edge.

Keeping a controller's negative edge matters because an owner can make any address a controller with one approval. If controllers lost their negative edges, an owner could erase its critics' distrust, and the registry guard would then also stop them from posting new feedback. An approval given to an anchor is also read as that anchor's veto (§8.2).

⟦08-bis : règle B (D48-B, AM-08.15, FORMAT R6 du 06/10, relais de 04-bis vers ce paragraphe) : seul le positif d'un contrôleur est rejeté. R1 bis (relais solver-relais, revue NUL et LONGTAG) : identité d'un tag = keccak de ses octets, jamais son texte. Existence (R6 du lot 02-bis) : seule `ERC721NonexistentToken` dit « inexistant ». D14, R3, R5, R6 de FORMAT.md. Deux changements par rapport au draft R6 : (a) un avis hors bornes ne laisse plus passer l'avis précédent du même tag (R3 « latest then reject », choisi par le 04 et le contrat ; R6 avait pris « latest valid », AM-R6.21) ; (b) l'égalité entre tags se départage par l'index le plus grand (F-6 de l'intégration : le contrat ne stocke que des hashes de tags) et non par le plus petit tag (AM-R6.24 fermé). La règle « ancien owner » de D16 est retirée par D20 (AM-R6.4 fermé).⟧

#### 3.4 Nodes

There are three kinds of nodes:

- **Anchor nodes**: one per anchor address of the set.
- **Agent nodes**: ERC-8004 agents.
- **Address nodes**: client addresses that resolve to no agent (§3.5). The zero address is never a node.

Only agent nodes receive edges. An anchor node is distinct from every agent node, even when the anchor address is also the source of an agent.

#### 3.5 Emitter resolution and row copy

The **source** of an agent `j` is:

- `getAgentWallet(j)`, if it is non-zero;
- otherwise `ownerOf(j)`, if the set's `ownerFallback` is `true`;
- otherwise none.

The wallet always takes precedence: an agent whose `agentWallet` is non-zero never emits its owner's row.

For a client address `c`, let `A(c)` be the set of agents whose source is `c`. The **row of `c`** is the list of pair edges `c → j` (§3.3) over all agents `j`. Then:

- if `c` is an anchor address, the row of `c` is emitted by the anchor node **only**. An agent whose source is an anchor emits **no row**, not even an empty one: it is absorbing (§4.1);
- otherwise, every agent of `A(c)` emits the row of `c` with its **own** trust mass (**row copy**);
- if `A(c)` is empty and `c` is not an anchor, the row of `c` belongs to the address node of `c`. That node receives no edge and no anchor mass, so its trust is zero and its row propagates nothing.

An edge `u → j` whose destination `j` is the emitting agent `u` itself is never committed (§5.4).

The anchor rule keeps each anchor inside its own column. Copying an anchor's row into an agent would spread it with the agent's mass, which that agent may have received from the *other* anchors. A single stolen anchor key could then endorse a Sybil in several columns and defeat `minAnchors` (Rationale, *Leave-one-out*).

⟦D48-A (AM-08.14, PROOFS L8, FORMAT R8 du 06/10) : une ancre n'émet que comme nœud-ancre ; l'agent dont la source est une ancre n'a aucune ligne et paie la marge de troncature sur eUp seulement (AM-02bis.5), t reste une borne inférieure. Cela remplace la règle R8 du 01/10 (« ligne d'ancre portée par le nœud-ancre EN PLUS de la copie d'agent »), qui rendait m ≥ 2 inopérant. Adresse nulle : R1 de la revue du 05/10 (K6), `BadNodes`. D20 (copie de ligne, confirmée par D34 : masse Sybil identique pour M = 1 ou 100), D44 (repli owner, ordre de priorité), R7 de FORMAT.md.⟧

#### 3.6 Budgets

For a node `u` emitting edges with weights `w_uj`:

```
S⁺_u = Σ_j max(w_uj, 0)            B⁺_u = max(GRID, sPlus_u)        C_uj = max(w_uj, 0) / B⁺_u
S⁻_u = Σ_j max(−w_uj, 0)           B⁻_u = max(GRID, S⁻_u)           D_uj = max(−w_uj, 0) / B⁻_u
```

`sPlus_u` is the true positive sum of the row (§5.4). When the full row is committed, `sPlus_u = S⁺_u`. Every row of `C` and of `D` sums to at most 1. Endorsement and distrust have **separate budgets**: criticizing an agent costs a node none of its endorsement capacity.

#### 3.7 Measurement tags in the policy

This ERC does not define any use of measurement tags. A consumer that refuses an agent on a measurement (for example, an uptime threshold) does so outside `passesAnchorPolicy`.

#### 3.8 Edge filters (reserved)

An edge filter removes edges from the graph according to a property of the feedback or of its client (for example, payment provenance or payment-claim verification). This version defines **no** edge filter and no field to name one: conforming certifiers and aggregators compute every quantity on the unfiltered graph. A future version that defines a filter MUST also define its on-chain predicate, because discrepancy proofs (§6) would otherwise widen honest certificates for every edge that the filter legitimately removed. A filter MUST only remove edges. It MUST NOT add edges or increase weights. Payment MUST NOT be an edge weight or a pass condition of the core algorithm.

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

A certifier SHOULD compute `t` by iterating `t⁰ = 0`, `t^{n+1} = F_bas(t^n)` with exactly the arithmetic above. Every iterate is a sub-solution, and the certifier MAY stop at any iterate. A floating-point fixed point rounded to integers is not guaranteed to be a sub-solution, and is refused if it is not.

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
trustRobust(i) = trust(i) − (sum of the m − 1 largest c_a(i))
trustLow(i)    = max(trustRobust(i) − eLowEff, 0)
distrust(i)    = min(d_i, 2^63 − 1)          // stored in 63 bits
distrustUp(i)  = distrust(i) + eEff
```

`trustRobust` is the trust that no `m − 1` anchors can produce alone. It remains a lower bound because removing the largest contributions is non-decreasing in each contribution. Distrust is not leave-one-out, because it only pushes toward refusal.

An agent outside the certificate has zero trust and zero distrust: *unknown* is expressed as zero trust, not as an error.

#### 4.5 Bounds

Each certificate carries two bounds per column, in WAD and in `t`-space:

- **`eUp_a`**, an upper bound on `‖t*^(a) − t^(a)‖₁` for the committed graph (and for the registry's graph when it differs only by truncated rows and positive edges omitted under an exact `sPlus`). It bounds the error of distrust (§5.6). Proofs that show an omitted or increased edge widen it (§6).
- **`eLow_a`**, an upper bound on `‖(t^(a) − t*^(a))⁺‖₁` for the graph whose rows are the committed rows amended by every proof so far. It is `0` at submission and is widened by proofs that show a decrease (revocation, lower weight, dilution, source change).

```
eEff    = Σ_a ⌈λ_a · eUp_a / WAD⌉
eLowEff = Σ_a ⌈λ_a · eLow_a / WAD⌉
```

Both are global over the set: a widening on one row lowers `trustLow`, or raises `distrustUp`, for every agent of the set.

⟦D26 (sous-solution), D32 (domination), D37 (lemmes L1-L5 de PROOFS.md, L6-L7 ajoutés par 02 et l'intégration). Le désaccord 5 du tour 2 (borne globale) est en partie tranché par D26 : la borne inférieure de confiance est exacte par agent à la soumission. Il reste global après une preuve (eLow, AM-02.4) : écrit en Security, ⟦OPEN⟧ retiré. La méfiance est calculée sur T combiné (ENCODING §4), pas colonne par colonne comme dans R6 : d n'a plus de colonnes.⟧

### 5. Certificates

#### 5.1 Node table

For each set, the aggregator keeps an **append-only node table**. Node `i` has a 32-byte key `kind << 248 | value`: kind `1` agent (`agentId`), `2` address, `3` anchor (address). Anchors are nodes `0 … k−1`, in the order of `SetParams.anchors`, and are inserted at registration. Indices are stable: a node keeps its index for the life of the set.

Nodes are appended as entries `0x01 ‖ agentId:u32` or `0x02 ‖ address:20`, either through `submitCertificate(…, newNodes, …)` or beforehand through `addNodes`. An entry whose key already exists MUST be refused, and so MUST an address entry for the zero address (in a row, a zero client marks a row without a source). On any set with a non-empty `submitters` list, only listed submitters may append. On an open set, appending through `addNodes` is permissionless (see Security Considerations), and `newNodes` MUST be empty: anyone can append between the moment a certifier computes its indices and the moment its submission executes, so inline nodes would land at shifted indices. A certifier on an open set appends its nodes in a transaction of its own, reads the table back (`nodeKeyAt`), then submits. Certifiers SHOULD order the nodes of a first certificate as anchors, then agents by increasing `agentId`, then addresses by increasing value.

A certificate covers the nodes `[0, nCert)`. `nCert` MUST satisfy `k ≤ nCert ≤ nodeCount` and MUST NOT decrease from one certificate to the next.

⟦Choix de rédaction : l'encodage binaire `ancre-cert-v1` devient NORMATIF (§5.3-§5.5), alors que R6 le laissait à l'implémentation. Raison : `graphRoot` et `vectorRoot` sont des hachages de ces octets, les preuves d'écart les rouvrent, et les vecteurs de test les fixent. AM-R6.12 (feuilles en `nodeKey` contre indices) est tranché en faveur des indices : un certificat n'a de sens que pour un agrégateur donné (§2.1), la portabilité des feuilles n'achetait rien.⟧

#### 5.2 Submission

```
submitCertificate(setId, nCert:u32, eMax:u256, newNodes, vectors, rows)
```

The aggregator appends `newNodes`, verifies the submission (§5.6, §5.7), checks the proven facts of the set (§5.10), computes `eEff`, reverts if `eEff > eMax`, applies the replacement rule (§5.9), and stores the vectors, `d`, the certified veto bits, the bounds, `graphRoot`, `vectorRoot`, the registry version hash (§7) and `certBlock = block.number`. It then emits `CertificateSubmitted`.

On an open set, the submission MUST be the top-level call of its transaction, sent by an externally owned account (`msg.sender == tx.origin`). The committed rows exist only in calldata, and proofs need them: a submission made from inside another contract's execution would leave the rows readable only by re-executing the transaction. Listed submitters MAY submit through any path, a multisig wallet for example.

#### 5.3 Vectors

```
vectors = for i in [0, nCert): t_i^(0):u64 ‖ … ‖ t_i^(k−1):u64 ‖ ownerFp_i:u64        (nCert · (k+1) · 8 bytes)
vectorRoot = keccak256(vectors)
```

- Each `t_i^(a)` is in WAD. Every u64 field, `ownerFp` included, MUST be `< 2^63`.
- `ownerFp_i = uint160(ownerOf(agentId)) & (2^63 − 1)` for an agent node, and `0` for any other node. It records the owner at certification for the transfer check (§8.1). The aggregator MUST refuse a non-zero `ownerFp` on an anchor node, at both levels.

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

**Client of a row.** For an anchor row (`u < k`), the anchor address. For an address row, the node's address. For an agent row, `src`: the agent's `agentWallet` (VIA_OWNER clear) or, with VIA_OWNER, its owner. `src` MUST NOT be an anchor address of the set (§3.5). An agent row without SRC has no client: it MUST be empty, and it is allowed only on a set without `ownerFallback` when the agent's `agentWallet` is zero.

**Edges.** Each edge is the pair edge (§3.3) of the row's client on the agent `dst`, with its combined weight `w` and the `feedbackIndex` of the deciding feedback.

**Alias rows.** An alias row `u` (`u ≥ k`) repeats the client `src` of the earlier, non-alias row `ref < u`, and inherits its edges and its `sPlus`. It spreads them with its **own** mass `t_u`. This is how row copy (§3.5) is encoded without duplicating calldata. `ref` MUST be an agent row that carries SRC: an anchor or address row cannot be aliased. The alias's own VIA_OWNER bit states how agent `u` resolves to the client, and MAY differ from that of `ref`. Each copy counts its positive edges in `E⁺` (§5.6).

**sPlus.** The true positive sum of the client's full row, over all its pair edges. A certifier MAY omit **positive** edges of a row, for example to stay within `ROW_MAX` or to skip pairs that are expensive to re-read, provided it declares `sPlus`. The remaining edges then keep their true normalized weight (`B⁺ = max(GRID, sPlus)`), and the omitted mass enters the margin of `eUp` (§5.6). Without SPLUS, `sPlus = S⁺` of the committed edges.

**Canonical form.** The aggregator MUST refuse a row whose SRC field is the zero address, a row with SPLUS whose `sPlus` does not exceed the positive sum of its committed edges (a row without SPLUS says the same thing), and an alias whose `ref` is not an agent row. Certifiers SHOULD use `W = 2` whenever `nCert ≤ 65 535`; `W = 4` is accepted, but only `W = 2` reproduces the roots of the test vectors. No rule of this ERC depends on the bytes of a row: proven facts (§5.10) are about the registry, so a row cannot escape them by being encoded differently.

**Certifier obligations.**
- Negative edges MUST NOT be omitted. Nothing declares the negative sum, so an omitted negative edge makes `distrustUp` unsound. It is a provable fault (§6), not an option.
- Anchor rows MUST NOT be truncated or have edges omitted. The certified veto bit depends on them.
- Every agent node with non-zero trust that has a source other than an anchor MUST carry its row, even when it is empty. Otherwise the node is **truncated**: it pays the truncation margin, and its edges cannot be challenged. An agent whose source is an anchor carries no row (§3.5) and pays that margin.
- A row of a zero-trust node SHOULD NOT be provided. It adds nothing to `y` and adds its positive edges to `E⁺`.

⟦08-bis : forme canonique (R4, `NotCanonical`) ; SRC jamais une ancre (D48-A, `AnchorAsSource`) ; nœud nul refusé (R1, `BadNodes`) ; `newNodes` vide sur un ensemble ouvert (A1d, `BadNodes`) ; soumission directe sur un ensemble ouvert (G-11, `NotSubmitter`) ; empreinte nulle des ancres (R5). W = 4 reste permis (rapport 02-bis §3, décision 2). D20, D32 (sPlus déclaré, preuve (v)), D21/D33 (lignes d'ancres jamais tronquées), D44 (VIA_OWNER). Le ROW_ALIAS_MAX = 64 de D44 est une canonicalisation du solveur, que le contrat ne vérifie pas et qui ne borne rien on-chain (AM-INT.7) : il n'est pas repris comme règle normative, il est cité en Rationale. Écart avec D44 noté AM-08.3.⟧

#### 5.5 Graph root

Leaf `ℓ` = `keccak256` of the row's bytes, from `u` to its last byte, optional fields included. Leaves are in row order. A parent is `keccak256(left ‖ right)`. An odd last element moves up unchanged. The root of zero rows is `bytes32(0)`.

`graphRoot` and `vectorRoot` commit one submission. Two certifiers that use the same node table, the same rows and the same vectors obtain the same roots. A certifier MAY submit any sub-solution: the vectors, and therefore the roots, are not a canonical function of the registry state.

#### 5.6 Arithmetic verification

The aggregator MUST revert unless all of the following hold, and computes the bounds as shown.

```
for every row: rows strictly increasing by u, u < nCert, numRows ≤ nCert, exact end of buffer;
               dst < nCert, dst ≠ u, dst strictly increasing within the row;
               w ≠ 0, |w| ≤ GRID; nE ≤ ROW_MAX;
               SPLUS ⇒ sPlus > Σ committed w⁺;  SRC ⇒ src ≠ 0 and src ∉ anchors
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

**Shape, at both levels.** Every edge targets an agent node. An anchor or address row carries neither SRC nor VIA_OWNER. An agent row is either (a) SRC without VIA_OWNER, (b) SRC with VIA_OWNER on a set with `ownerFallback`, or (c) without SRC: empty, not an alias, without SPLUS, on a set without `ownerFallback`. An alias row satisfies §5.4. No SRC is an anchor address, and anchors carry `ownerFp = 0`. If the aggregator parses the rows more than once, every pass MUST consume exactly the same bytes. (In strict mode, an agent with mass whose `ownerFp` is zero or wrong reads as `TRANSFERRED`, §8.1.)

**`RegistryVerified` only.** In the submitting transaction, the aggregator MUST check:

| Object | Check |
|---|---|
| agent row, SRC without VIA_OWNER (aliases included) | `getAgentWallet(u) == src` |
| agent row with VIA_OWNER | `getAgentWallet(u) == 0` and `ownerOf(u) == src` |
| agent row without SRC | `getAgentWallet(u) == 0` |
| each edge of a non-alias row | `dst` exists; if `w > 0`, the client is not a controller of `dst`; and `(w, feedbackIndex)` equals the pair edge (§3.3) re-read in the Reputation Registry |
| each agent node with mass | `ownerFp == uint160(ownerOf(agentId)) & (2^63 − 1)` |
| each address node | `ownerFp == 0` |

Re-reading a pair edge requires `getLastIndex`, then `readFeedback` from the highest index downward until every endorsement tag of the set has been seen or index 1 is reached. The cost is proportional to the history of the pair and is borne by the submitter. In submissions and proofs, the aggregator MUST NOT cap the gas forwarded to `readFeedback` at a fixed amount: the cost of a call grows with the length of the stored tags, and a client could otherwise make its own pair unreadable with one long `tag2`, which would block every certificate that commits the pair.

An edge to an agent that does not exist, or an agent with mass that does not exist, fails the check: certifiers have to exclude burned agents. An unreadable registry (§1) makes the submission revert. What cannot be checked at submission, at any level, because ERC-8004 has no per-client index: that a row is complete, and that a declared `sPlus` is the true sum.

⟦08-bis : règle B dans le tableau (D48-B), existence de la cible (R6), gas non plafonné vers `readFeedback` sur les chemins payants (E1 de la revue du 06/10 : un `tag2` d'environ 13 ko suffisait à bloquer un couple, MESURÉ), passes calées sur les mêmes octets (R1 / K6). ENCODING §3.2 et §3.4. La relecture coûte ≈ 45,5 k gas par arête à avis unique et ≈ 13 k par avis supplémentaire du couple (MESURÉ 28/09, GAS.md) : chiffres déplacés en Reference Implementation, hors texte normatif.⟧

#### 5.8 Certifier procedure (informative)

A certifier reads the registries at a recent block, derives the edges (§3), resolves emitters (§3.5), selects the support (nodes reachable from the anchors), iterates from zero (§4.2), encodes, and checks the result with `dryRun` or an `eth_call` of `submitCertificate` before sending it.

#### 5.9 Replacement

At the `SubmitterAttested` level, and on any set with a non-empty `submitters` list, a listed submitter always replaces the current certificate.

At every level and whatever the state of the current certificate, `REGISTRY_CHANGED` included, a new certificate that contradicts a proven fact of the set is refused first (§5.10). On an open set, the aggregator MUST then accept the new certificate if and only if one of these holds:

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

#### 5.10 Proven facts

A discrepancy proof (§6) establishes a fact about the registry, and the aggregator keeps it for the life of the set:

- an **edge fact** `(client, agentJ) → w`, recorded by `proveEdge`: the pair weight (§3.3) of `client` on `agentJ` read at the time of the proof;
- a **source fact** `(u, src, viaOwner)`, recorded by `proveWallet`: node `u` does not resolve to the client `src` by that path.

At every later submission to the set, at both levels and whatever the state of its current certificate, the aggregator MUST refuse the certificate if:

- an agent row claims a source `(u, src, viaOwner)` that is a source fact; or
- a row whose client is `c` (for an alias, the edges of its `ref`) does not carry exactly the proven weight `w` on `agentJ`, for an edge fact `(c, agentJ) → w`. An absent edge counts as `0`. A fact on the row's own agent is skipped, since no row has a self-loop. A proven **positive** edge MAY be left out only as a declared omission: the row declares an `sPlus` of at least the committed positive sum plus every proven positive weight left out.

A fact concerns the registry, not the bytes of a row, so no re-encoding, `sPlus` adjustment or dropped edge brings a proven-false row back. A set without any fact performs none of these lookups.

The registry can change again after a proof, for example when a revocation brings an older feedback back into force, or when a wallet is set back. A fact would then refuse an honest row. Two permissionless functions keep facts live:

- `refreshFact(setId, client, agentJ)` re-reads the pair weight and replaces the fact. It reverts if nothing changed;
- `clearSourceFact(setId, u, src, viaOwner)` clears a source fact whose claim holds again in the registry, and reverts otherwise.

Both only ever store a registry reading. A certifier whose honest row is refused because the registry changed after a proof calls one of them, then submits again.

⟦AM-04.1, AM-5.16, AM-02.2, lemme L7 (intégration du 01/10). Remplace la règle R6 par `eEff` (eNew ≤ eCur), qui bloquait la croissance honnête et récompensait la censure. La clause REGISTRY_CHANGED du draft R6 est conservée (elle est dans le code). **08-bis** : la garde « racines brutes égales » du 01/10 (AM-08.16, contournée par réencodage K7/K10 et sautée sous REGISTRY_CHANGED) est remplacée par les faits prouvés (D48-C, ENCODING §3.5). D48-C demandait un « hash canonique » de ligne ; la revue de code du 06/10 a montré qu'un hash se contourne en retouchant le contenu (sPlus = S⁺ + 1), d'où des faits, qui gardent l'intention de D48-C (rapport 02-bis §3, décision 1). Le refus vaut désormais aux deux niveaux, y compris pour un soumetteur listé. Dernière phrase : procédure tirée d'AM-02bis.2 (sinon la ligne honnête est refusée) ; pas de MUST, invérifiable on-chain.⟧

### 6. Discrepancy proofs

A discrepancy proof shows that a committed row differs from the registry **now**. It never invalidates a certificate and never moves funds: it widens `eLow` and/or `eUp`, and records the proven fact (§5.10). Proofs are permissionless, apply to the current certificate, and are paid by the prover. Each fact is billed once: a row carries its **amendments** (`(agentId:u32 ‖ wCommitted:int16 ‖ wNow:int16)*`) and each proof starts from the amended state, `keccak256(leaf ‖ amends)`. The first proof on an agent appends its entry at the end of the list; a later proof on the same agent replaces that entry in place. Any party can rebuild the list from the `EdgeProven` events of the current certificate.

A proof that needs a registry reading MUST revert if the registry is unreadable (§1). An unreadable registry is never read as an absent edge or a burned agent.

#### 6.1 `proveEdge`

`proveEdge(setId, row, src, amends, agentJ)` opens the committed row of `u` (with its Merkle path, or the stored amended state), and for an alias row its committed source row. It re-reads **now** the pair weight `wNew` of the row's client on `agentJ` (§3.3, the self-endorsement rule included; `0` if `agentJ` does not exist). It reverts if `wNew` equals the current weight `wOld` (amended, else committed, else 0), if the row's source no longer holds (§5.7 reads; use `proveWallet`), if the row has no source, or if `agentJ` is the row's own agent. This one proof covers:

- (i) **omission** of an edge, with or without dilution of the others;
- (ii) a **stale** edge (a later feedback changed the weight);
- (iii) a **revoked** deciding feedback;
- a new **controller** relation on a positive edge;
- (v) **fabrication** or **inflation** of a committed edge (needed at the `SubmitterAttested` level).

**Amount.** The aggregator bounds the distance between the **committed** row `C⁰` and the row amended by every proof so far, `C`, directly (not as a sum of successive changes), and bills only what the row has not paid yet. With the amendment list after this proof, each entry `(wc, wn)` (committed weight, current weight):

```
S0, N0 = committed positive sum, committed |negative| sum
dEff   = sPlus if declared, else S0                 B0  = max(GRID, dEff)
cOut   = Σ wc⁺                pIn = Σ wn⁺           Su  = S0 − cOut        Scur = S0 − cOut + pIn
X      = dEff − cOut + pIn                          Bh  = max(GRID, X)        // largest possible true positive sum

dim  = ⌈ WAD · [ Su·(Bh − B0)⁺ + Σ (wc⁺·Bh − wn⁺·B0)⁺ ] / (B0·Bh) ⌉                    // positive decrease
incP = ⌈ WAD · [ Su·(B0 − Bh)⁺ + Σ (wn⁺·B0 − wc⁺·Bh)⁺ + (X − Scur)·B0 ] / (B0·Bh) ⌉    // positive increase, omitted mass included
incN = the same as incP on the negative side, with Bn0 = max(GRID, N0), Bnh = max(GRID, Ncur), and no omitted term

caps per row:  dim ≤ ⌈WAD · S0 / B0⌉,   incP ≤ WAD,   incN ≤ WAD
prepaid⁺ = ⌊WAD · (sPlus − S0) / B0⌋ if sPlus was declared, else 0      // already in the margin of eUp (§5.6)

eLow_a += ⌈ t_u^(a) · om · (dim − billed dim) / (alphaN · WAD) ⌉
eUp_a  += ⌈ t_u^(a) · om · [ (incP − prepaid⁺)⁺ − (billed incP − prepaid⁺)⁺ + (incN − billed incN) ] / (alphaN · WAD) ⌉
```

The row keeps the largest `dim`, `incP` and `incN` billed so far. Bills never decrease: returning to the committed state bills nothing more and refunds nothing.

`X` is the largest true positive sum compatible with the declaration. The aggregator cannot tell an edge omitted under the declared `sPlus` from an edge that appeared after the certificate, so every revealed edge is assumed to be new: revealing an honest declared omission bills the worst case. Both bounds grow with the budget, so they hold for every true sum between `Scur` and `X` (Rationale, *Two bounds*).

`eLowEff` and `eEff` are then recomputed. If the proven edge belongs to an anchor row, now has a weight `≤ vetoMax`, and its destination is a certified node, the destination's certified veto bit is set. The fact `(client, agentJ) → wNew` is recorded (§5.10).

#### 6.2 `proveWallet`

`proveWallet(setId, row, src, amends)` proves (iv): the committed source of an agent row no longer holds. The `agentWallet` changed (ERC-8004 clears it at every transfer), the owner of a VIA_OWNER row changed, the agent obtained a wallet, or the agent of a source-less row obtained a wallet. The aggregator bills to `eLow` the not-yet-billed part of the committed positive mass `⌈WAD · S0 / B0⌉`, and to `eUp` the not-yet-billed rest of `1 − prepaid⁺` on the positive side and of `1` on the negative side. The row is then void: no further proof applies to it, and its source claim becomes a fact (§5.10). A new wallet that is an anchor address is covered: the source changed, and no later certificate can carry the row (§3.5).

This is how the **outgoing** edges of a transferred agent are frozen until the next certificate.

#### 6.3 `proveTransfer`

`proveTransfer(setId, agentId)` sets the transfer flag of a certified agent whose current owner no longer matches `ownerFp`, or that no longer exists. Reads then return `TRANSFERRED` for that agent in both transfer modes.

#### 6.4 `proveApproval`

`proveApproval(setId, agentId, a)` proves that anchor `a` is `getApproved(agentId)` or an operator of the agent's owner (`isApprovedForAll(ownerOf(agentId), anchor_a)`), for a certified agent. It sets bit `a` of the agent's certified veto mask until the next certificate (§8.2). It reverts if the anchor is not approved or if the bit is already set. In strict mode, reads see the same approval live, and the proof is not needed.

#### 6.5 Exhausted budget

If `eLowEff > eLowMax`, the certificate is `STALE` (§8), and the replacement rule accepts any new certificate (§5.9).

⟦08-bis : formule X d'ENCODING §7.1 (R3 du lot 02-bis, puis K8 et A2b de la revue du 06/10) : bornes cumulées contre la ligne engagée, toute arête révélée supposée nouvelle (facture au pire cas d'une omission déclarée honnête, conservatrice). Elle remplace la formule incrémentale du 01/10, qui gardait le plancher max(GRID, sPlus) quand une arête engagée tombait (K8 : eUp 0,111 au lieu de 0,333 WAD, MESURÉ) et ne facturait rien à eLow pour une arête positive nouvelle sur une ligne déclarée (A2b). PROOFS L6 réécrit. `BadProof(27)` : pas de preuve vers l'agent de la ligne (AM-04bis.1, sinon un négatif d'un wallet sur son propre agent se prouverait à chaque certificat). R6 : registre illisible ⇒ revert `RegistryUnreadable`. `proveApproval` : D48-B, mode rapide. D22 (plafonds par ligne), D32 (preuve (v)), D36 (eLowMax), D44 (gel des arêtes sortantes par (iv-a)). Écart avec D44 maintenu : le gel des arêtes sortantes n'est pas automatique en mode strict, il faut un `proveWallet` (AM-08.4). ALT8 (arrondis prépayé contre preuves) : corrigé côté contrat par 02-bis (rapport §8, « moyennes ») ; non vérifié ici sur un vecteur.⟧

### 7. Registry versions

The registries are typically upgradeable proxies, and a contract cannot read another contract's implementation slot.

- `versionHash = keccak256(abi.encode(identityRegistry, keccak256(bytes(identity.getVersion())), reputationRegistry, keccak256(bytes(reputation.getVersion()))))`. If either `getVersion()` call fails or returns malformed data, the registry is unreadable: submission MUST revert. This version therefore cannot be used with registries that do not implement `getVersion()` (Backwards Compatibility, request 4).
- Every certificate stores the `versionHash` read in its submitting transaction.
- `checkRegistry(setId)` is callable by anyone. It recomputes the hash and, if it differs from the certificate's hash or cannot be read, marks the set's certificate `REGISTRY_CHANGED` and emits `RegistryChanged`. A new certificate clears the mark.
- Certifiers MUST check the registry versions before each certification. Operators SHOULD monitor the registries' [ERC-1967](./eip-1967.md) `Upgraded` events off-chain and call `checkRegistry` for every set they rely on when one is emitted.

An upgrade that keeps the same version string is invisible on-chain (Security Considerations).

⟦D17. `checkRegistry` est par ensemble dans la v1 (R6 : global) : une upgrade doit être signalée ensemble par ensemble (AM-08.5). `getVersion()` ne fait pas partie de l'interface ERC-8004 (AM-R6.10) : demande 4 en Backwards Compatibility. Le désaccord 2 du tour 3 (suffisance de la vérification de version) est maintenu en Security comme limite, sans marqueur ⟦OPEN⟧ : le texte ne prend aucune position qu'un tour ultérieur pourrait renverser.⟧

### 8. Reading

#### 8.1 Statuses

```solidity
enum Status { OK, NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED }
```

`assess(agentId, setId, withVeto)` MUST evaluate, in this order, and stop at the first that applies:

1. `NO_CERT`: the set is unknown or has no certificate. All values are zero.
2. `REGISTRY_CHANGED`: the certificate is marked by `checkRegistry` (§7).
3. `STALE`: `block.number − certBlock > maxAge`, or `eLowEff > eLowMax`.
4. `VETOED` (only if `withVeto`): at least `vetoQuorum` anchors veto the agent (§8.2).
5. `TRANSFERRED`: the agent is certified, and either its transfer flag is set (§6.3), or `strictTransfer` is on, the agent has mass (§1), and `ownerOf(agentId)` no longer matches `ownerFp` or the agent no longer exists.
6. `OK`.

If a registry reading needed by step 4 or step 5 is unreadable (§1), the status is `REGISTRY_CHANGED`, without marking the set. Under every status except `NO_CERT`, the value fields (`trust`, `trustRobust`, `distrust`, `e`, `eLow`, `trustLow`, `distrustUp`, `certBlock`) MUST be filled as in §4.4.

#### 8.2 Veto

An anchor `a` vetoes agent `j` if **any** of these holds:

- **live**: the feedback of index `getLastIndex(j, anchor_a)` is not revoked, has an endorsement tag of the set, is valid (§3.2), and has weight `≤ vetoMax`;
- **certified**: bit `a` of `j`'s certified veto mask is set (§5.6, §6.1, §6.4);
- **approval** (only if `strictTransfer` is on): `anchor_a` is `getApproved(j)`, or `isApprovedForAll(ownerOf(j), anchor_a)` holds. ERC-8004 refuses feedback from an approved address, so an owner who approves an anchor stops it from posting a veto: the approval itself counts as that anchor's veto. When `strictTransfer` is off, the same fact is posted by `proveApproval` (§6.4).

`vetoCount` is the number of anchors that veto. The live check reads one feedback per anchor, so a veto takes effect from the next transaction after the anchor posts it, without recertification. The approval check is needed only for the anchors that do not already veto. `triggerTag` is the `keccak256(tag1)` of the most negative live veto (between equal weights, the anchor with the smallest index), or zero if only certified bits or approvals apply.

#### 8.3 Decision

```
passesPolicy ⇔ withVeto ∧ status = OK ∧ trustLow ≥ theta ∧ rhoD · distrustUp ≤ rhoN · trustLow
```

`passesAnchorPolicy(agentId, setId)` returns `passesPolicy` with `withVeto = true`. It MAY skip the registry reads, and return `false`, as soon as the bounds already fail.

**A payer MUST decide with `passesAnchorPolicy`, or with `assess(…, true)` and its `passesPolicy` field.** `status = OK` alone does not mean the agent may be paid: an unknown agent has status `OK` and trust zero.

A payer MUST NOT authorize a transfer of value on a set whose `minAnchors` is below 2: `passesAnchorPolicy` does not enforce it. A payer SHOULD NOT authorize a transfer of value on a set whose `strictTransfer` is off: in that mode, a transfer or an approval of an anchor is seen only after someone proves it, and a recertification erases a proven approval (§6.4). A payer that pays an address on behalf of an agent MUST check that the address is `getAgentWallet(agentId)` and is non-zero. A payer that caches a decision MUST bound the cache's lifetime in blocks and MUST key it by `certBlock`, `eEff` and `eLowEff`, so that a new certificate or a proof invalidates it. A payer MUST pin the aggregator address it trusts.

#### 8.4 Robustness of reads

`trustOf`, `assess` and `passesAnchorPolicy` MUST NOT revert, whatever the registries return. Every external call they make MUST be capped at 120,000 gas, so that two implementations give the same answer on the same state, and an unreadable registry MUST resolve toward refusal (`REGISTRY_CHANGED`, or `passesPolicy = false`). `trustOf(agentId, setId)` returns `(status, trustRobust, distrust, e, certBlock)` from `assess(agentId, setId, true)`.

⟦08-bis : renommage (D48, AM-9.5 : `trustset` utilisait aussi `isTrusted` ; le nom dit « passe la politique de ces ancres », pas « digne de confiance »). Veto par approbation (D48-B) : lu en direct quand `strictTransfer` est vrai (le code lie le « mode strict » des deux lectures à ce seul champ), posé par `proveApproval` sinon ; +41,6 k gas par `assess` avec veto, MESURÉ 06/10. R7 : transfert strict déclenché par la masse. R6 : seule `ERC721NonexistentToken` vaut « inexistant », un `ownerOf` illisible donne `REGISTRY_CHANGED` (avant 02-bis : `TRANSFERRED`, AM-08.6 corrigé). SHOULD NOT sur le mode rapide : R8 du lot 02-bis, que le payeur de référence applique comme un refus (`FastTransferSet`) ; AM-02bis.7. D21 et D33 (veto au dernier avis + bit certifié), D35, D39.⟧

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
    enum Status { OK, NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED }

    struct TagSpec { string tag; int128 min; int128 neutral; int128 max; uint8 kind; }

    struct Policy {
        uint64 theta; uint32 rhoN; uint32 rhoD; uint8 minAnchors; uint8 vetoQuorum; int16 vetoMax;
        uint64 maxAge; uint64 minRefresh; uint64 slackRefresh; uint64 eLowMax;
        bool strictTransfer; bool registryVerified; bool ownerFallback; address[] submitters;
    }

    struct SetParams {
        address[] anchors; uint64[] lambdas; uint32 alphaN; uint32 alphaD;
        bytes32 tagSchemaHash; TagSpec[] tags; Policy policy;
    }

    event AnchorSetRegistered(bytes32 indexed setId, address[] anchors, uint64[] lambdas, uint32 alphaN, uint32 alphaD);
    event NodesAdded(bytes32 indexed setId, uint256 fromIndex, uint256 count);
    event CertificateSubmitted(bytes32 indexed setId, uint64 indexed certBlock, uint256 eEff, bytes32 graphRoot,
        bytes32 vectorRoot, bytes32 versionHash, uint32 nCert, uint32 numRows, bool registryVerified);
    event EdgeProven(bytes32 indexed setId, uint256 indexed node, uint256 indexed agentId, int256 wOld, int256 wNew,
        uint256 eLowEff, uint256 eEff);
    event RowVoided(bytes32 indexed setId, uint256 indexed node, uint256 eLowEff, uint256 eEff);
    event TransferFlagged(bytes32 indexed setId, uint256 indexed agentId);
    event RegistryChanged(bytes32 indexed setId, bytes32 certifiedVersionHash, bytes32 currentVersionHash);
    event ApprovalProven(bytes32 indexed setId, uint256 indexed agentId, uint256 anchor);
    event EdgeFact(bytes32 indexed setId, address indexed client, uint256 indexed agentId, int256 w);
    event SourceFactCleared(bytes32 indexed setId, uint256 indexed node);

    // refusals named by the test vectors (§5, §6)
    error BadNodes();                       // §5.1: zero address, malformed entry, or newNodes on an open set
    error NodeExists(bytes32 key);          // §5.1: key already in the table
    error NotSubmitter();                   // not a listed submitter, or not a top-level call on an open set
    error NotCanonical(uint256 row);        // §5.4 canonical form
    error AnchorAsSource(uint256 node);     // §3.5: an agent row whose source is an anchor
    error EdgeMismatch(uint256 row, uint256 edge); // §5.7 registry re-read
    error NotSubSolution(uint256 column, uint256 node); // §4.2
    error ProvenRowResubmitted(uint256 node);      // §5.10
    error NotBetter(uint256 qNew, uint256 qCur, uint256 massNew, uint256 massCur); // §5.9
    error RegistryUnreadable();             // §1, §6

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
        bool    passesPolicy;
    }

    struct RowRef {
        uint256   pos;      // rank of the row in the certificate (Merkle leaf index)
        bytes     row;      // committed row bytes
        bytes32[] path;     // Merkle siblings to graphRoot (may be empty once the row is amended)
    }

    // registries and node table
    function identity() external view returns (address);
    function reputation() external view returns (address);
    function nodeCount(bytes32 setId) external view returns (uint256);
    function nodeKeyAt(bytes32 setId, uint256 i) external view returns (bytes32);

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
    function proveApproval(bytes32 setId, uint256 agentId, uint256 anchorIndex) external;
    function checkRegistry(bytes32 setId) external returns (bool changed);

    // proven facts (§5.10)
    function edgeFact(bytes32 setId, address client, uint256 agentId) external view returns (bool proven, int256 w);
    function sourceHash(uint256 node, address src, uint256 hdr) external pure returns (bytes32);
    function provenSource(bytes32 setId, bytes32 sourceHash) external view returns (bool);
    function refreshFact(bytes32 setId, address client, uint256 agentId) external;
    function clearSourceFact(bytes32 setId, uint256 node, address src, bool viaOwner) external;

    // reading: MUST NOT revert
    function passesAnchorPolicy(uint256 agentId, bytes32 setId) external view returns (bool);
    function assess(uint256 agentId, bytes32 setId, bool withVeto) external view returns (Assessment memory);
    function trustOf(uint256 agentId, bytes32 setId) external view
        returns (Status status, uint256 trustRobust, uint256 distrust, uint256 e, uint64 certBlock);
}
```

Implementations MAY add functions (for example a dry run, capacity reservation, or raw storage views). They MAY implement [ERC-165](./eip-165.md). An implementation MUST revert in every case where this specification says that a submission or a proof is refused. It SHOULD use the error names above, which the test vectors expect; an implementation that uses other errors still conforms if it refuses the same inputs.

`sourceHash(node, src, hdr)` is `keccak256(abi.encode(node, src, hdr & 0x1000 != 0))`: the key of a source fact, with the VIA_OWNER bit of the row header.

⟦08-bis : renommage (G-1), `proveApproval`, faits (`edgeFact`, `sourceHash`, `provenSource`, `refreshFact`, `clearSourceFact`) et leurs events, recopiés du contrat de `main` du 07/10. Les erreurs sont listées parce que les vecteurs communs attendent des refus nommés ; leur nom est un SHOULD (une autre implémentation peut nommer autrement ses erreurs, c'est le refus qui est normatif). `BadProof(code)`, `BadRows(code)`, `BadEdge`, `BadParams` gardent des codes propres à l'implémentation : hors interface. Signatures recopiées de `AnchoredReputation.sol` v1 (intégration du 01/10). Les types `Status`, `SetParams`, `Policy` sont ceux du §2 et du §8. `dryRun`, `reserveCapacity`, `columnBounds`, `rowStateOf`, `vectorAt`, `nodeCount`, `nodeKeyAt` restent hors interface normative (optimisations propres à l'implémentation, `reserveCapacity` sert le stockage de MIP-8). ERC-165 passe de MUST à MAY : le contrat v1 ne l'implémente pas (AM-08.7) ; `requires: 165` retiré du préambule.⟧

### 11. Extensions outside this version

**Rotating anchors.** This version names anchors by address. An anchor address MAY be a smart contract account that posts its feedback itself, which lets the anchor rotate its signing keys without a new set; after a compromise, such an anchor revokes the feedback posted with the stolen key, since it is their author. An anchor that is a plain key and loses it must be replaced in a new set. A future version MAY name anchors by a self-certifying identifier with key pre-rotation: `anchorId = keccak256(abi.encode(key0, nextKeyDigest1))`, where each rotation reveals the committed next key and commits the following one. Only feedback from the anchor's current key would count, and the veto would read the current key. Such a version changes the `setId` preimage and the anchor-row client.

**Edge filters.** See §3.8.

⟦OPEN — D9 (identité d'ancre à pré-rotation, confiance 0,6) et D43 (concept Mera : clés d'époque pré-rotées, `rotateBySig`) sont décidées mais pas implémentées : la v1 nomme les ancres par adresse, et le `setId` n'a pas de champ pour un registre de clés. Réintroduire `IAnchorKeyRegistry` dans le texte normatif contredirait le code ; le retirer contredirait D9. Je le mets en extension future, avec la forme décidée, en attendant 02-E8 (`AnchorRegistry`, conditionné par la porte P4 Mera). AM-08.8. À trancher par le pilote ou le conseil : (a) attendre 02-E8 et réintégrer, (b) publier la v1 avec ancres par adresse.⟧

## Rationale

**Anchors instead of a global score.** No non-trivial symmetric reputation function is Sybil-proof[^1]; seed-anchored functions avoid that impossibility. With a walk that restarts at the anchors and absorbs lost mass, the mass that reaches a region `X` containing no anchor is bounded by the mass that crosses its attack edges: `π(X) ≤ ((1 − α)/α) · Σ_{u∉X, v∈X} π(u) · C_uv`. A farm of any size that no anchor-reachable node endorses receives exactly zero. Letting the reader choose the anchors also answers the objection to a single score.

**Beyond one hop, with a bound.** A list of trusted raters, which is what ERC-8004's `getSummary` accepts, already gives a reader-relative answer, but only one hop deep: an agent endorsed by an agent that the reader's raters endorse is unknown. Propagating further is what makes reputation useful on a sparse graph, and it is also what a Sybil region exploits. Personalized PageRank does both: trust decays by `1 − α` per hop, and the bound above caps what a region captures, whatever its depth. The test vector TC-7 shows the difference. An agent two hops from the anchors passes the policy when the agent between them is endorsed by two anchors, and gets zero trust after leave-one-out when that agent is endorsed by a single anchor.

**Personalized PageRank.** EigenTrust with pre-trusted peers[^2] is personalized PageRank under another name. Among the classical schemes (EigenTrust, Advogato, SybilGuard[^5], SybilRank), it combines a formal Sybil bound, a certificate checkable in one pass over the graph, and **linearity in the seed**, which makes per-anchor columns and leave-one-anchor-out possible. Advogato yields a binary max-flow, and SybilRank depends on an early-stopped iteration. Personalized PageRank is not Sybil-proof in the strong sense of Cheng and Friedman: the bound limits the mass a region receives through its attack edges, not the rank of a compromised node.

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

**Two bounds.** `eUp` (L5) bounds `‖t* − t‖₁`. It is what makes `distrustUp = d + eEff` an upper bound on the distrust of the committed graph, since distrust is linear in trust with coefficients at most `1 − α`. An omitted negative edge breaks this until it is proven. `eLow` (L6) bounds `‖(t − t*)⁺‖₁` after proofs of decreases. A proof bounds the distance between the committed row and the amended row directly, multiplied by `(1 − α)·t_u / α`, and bills only what the row has not paid yet. The true positive sum of a row with a declared `sPlus` is unknown: an edge revealed by a proof may have been omitted under the declaration or may be new. The bounds therefore use the largest true sum compatible with both readings, `X = sPlus − (committed positive weights of the amended edges) + (their current positive weights)`. Both bounds grow with the budget, so they hold for every true sum up to `X`. An earlier formula kept the declared budget when a committed edge was revoked, and missed the growth of every other entry of the row. It also billed nothing to `eLow` for a positive edge that appeared after the certificate, although that edge dilutes all the others.

**Replacement by quality.** Two valid sub-solutions of the same graph satisfy `‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁` (L7). More mass is therefore more precision, and omitting endorsements from an otherwise identical graph (censorship) loses mass. On a graph that grows between two certificates, a certifier can omit one endorsement and still gain mass elsewhere: the rule compares aggregates, not agents. An earlier rule compared error bounds. It blocked every honest update of a growing graph, since each new positive edge adds a rounding unit, and it rewarded censorship, since fewer edges give a smaller bound. `q`, the bound without its rounding floor, keeps truncation honest. The distrust mass `D` keeps negative edges. A zero vector has `q ≈ 1 WAD` and can never displace a live certificate.

**Facts instead of bytes.** A proven certificate must not come back and erase its proofs. Comparing the roots of the new certificate with the proven one does not prevent this, because one content has many encodings: an extra empty row, a wider index, a declared `sPlus` one unit above the committed sum. A hash of the decoded row fails the same way: changing one weight slightly gives a new hash. The aggregator therefore stores what the proof established about the registry (§5.10) and checks every later row against it, whatever its encoding, at both levels and even after a registry change. A fact can become stale when the registry changes again. Refreshing it is permissionless, since it only stores a new registry reading.

**Approvals.** ERC-8004 refuses feedback from the owner's approved addresses. Rejecting every edge of a controller would let an owner erase its critics' negative edges, and its anchors' vetoes, with one `setApprovalForAll`. This ERC rejects only the positive edges of controllers, which is the self-endorsement the rule is meant to stop, and counts an approved anchor as vetoing. The approval cannot be undone by the anchor, and the anchor can no longer post, so the approval is the only signal left.

**Growing bounds instead of slashing.** ERC-8004 does not record when feedback was given, so "this feedback existed before the certificate" cannot be proven. With slashing, anyone could post feedback just after an honest certificate, "prove" an omission and collect a bond. Widening a bound needs no dates, no bond and no challenge window. It also doubles as the recertification signal.

**Separate budgets, one-hop distrust, leave-one-out, veto.** The distrust a region `X` can emit is `(1 − α)·Σ_{u∈X} t_u·Σ_j D_uj ≤ (1 − α)·π(X)` whenever rows of `D` sum to at most 1, whether or not `D` shares a budget with `C`. A shared budget would only buy a factor of 2, and it would make honest criticism cost endorsement capacity. Distrust that propagated would let a Sybil region smear honest agents through chains of negative feedback. A stolen anchor key is used to **approve** Sybils (theft), not to veto (denial of service). With `minAnchors ≥ 2`, no single anchor can make an agent pass, provided each anchor's mass stays in its own column. That is why an anchor's row is emitted by the anchor node only (§3.5): an agent whose wallet is an anchor address would otherwise copy the anchor's row with the mass it received from the other anchors, and one stolen key would endorse a Sybil in every column that reaches that agent. The live veto reads one feedback per anchor, so a veto takes effect in the next block at a bounded cost. The certified bit keeps a veto that a later feedback of the same anchor would hide.

**Tags and edges.** A liveness ping delegates no trust. If measurement feedback propagated, anyone running an automated scanner would manufacture attack edges, and the Sybil bound would be worthless. On the deployment of Motivation, this is how trust leaked into the farm. Keeping the latest feedback per tag, then the worst across tags, is monotone toward refusal: under "latest feedback of the pair", a `+1` under another tag erased the only useful negative edge of that registry. When the latest feedback of a tag is invalid, the tag yields nothing. That is the client's current statement. Falling back to an older one would let a stale opinion speak for the client, and would need an unbounded scan in the live veto. Ties are broken by feedback index because the aggregator stores only tag hashes.

**Row copy and owner fallback.** Merging every agent that shares a wallet would pool hundreds of agents' mass behind one address. Treating such a wallet as a massless address node would silence honest agents that share a platform wallet. Copying the row into every agent that has the wallet as its source lets each agent speak with its own mass: agents without mass transmit nothing, and the measured Sybil mass is the same with one copy or a hundred. Anchor addresses are the exception (see *Separate budgets, one-hop distrust, leave-one-out, veto*). The owner fallback lets agents whose wallet was cleared by a transfer speak through their owner, who can set the wallet anyway. Because it changes the edges, it is committed in the `setId`. Certifiers can bound the copies of one row (the reference solver uses 64), but nothing on-chain depends on that bound.

**Normative encoding.** The roots hash the submitted bytes, proofs reopen rows by those bytes, and the vectors fix them. Leaving the encoding to implementations would make two conforming certifiers produce incompatible commitments. Node indices are local to an aggregator. That is enough, because a certificate is meaningful only to the aggregator that verified it.

**Proof-free reads.** A read that required the payee to supply a Merkle proof would change payment protocols on the provider side and add a proof service to operate. On storage priced per page, contiguous vectors rewritten in place are cheap, so `passesAnchorPolicy` reads stored state.

**Normative quantization.** Quantization changes `C`, and therefore the fixed point. A grid of 10⁻⁴ fits an `int16` and keeps rows small.

**Edge filters.** Payment provenance and payment-claim verification are useful, orthogonal signals. One project scores the provenance of the funds behind a feedback (monad-agent-trust). Another checks whether the payment cited in an ERC-8004 evidence document happened (Kanmani). Either could become an `edgeFilterId` once its predicate can be evaluated on-chain. No filter "the receipt is true" is suggested as a default: a farm that pays itself has only true receipts.

**Constants.**
- `K_MAX = 16` anchors and `TAGS_MAX = 16` tags bound the per-set storage and the live veto.
- `ROW_MAX = 256` bounds a row in calldata. Anchor rows cannot exceed it, because they cannot be truncated.
- `theta` has no recommended value. Trust is a share of a unit mass, so its scale depends on how many agents the anchors reach and how far. In a test deployment of the reference implementation with three anchors, honest providers had a `trustRobust` of 2.30 % to 3.95 % of the unit mass, the farm had 0, and a threshold of 5 % refused the honest providers *(measured 2026-10-06, fork of a test network)*. That deployment used 1 %. A set author chooses `theta` from the graph it expects, and documents the choice in the schema document (§2.4).
- `α = 1/3` is the recommended value, not a fixed one: no value dominates. On synthetic graphs with known ground truth (degree 5, 100 attack edges), the honest coverage after leave-one-out at a threshold admitting 1 % of Sybils was 0.752 / 0.712 / 0.668 for `α` = 1/4 / 1/3 / 1/2. At a fixed threshold, the Sybils admitted were 0.7 % / 0.3 % / 0 %. These figures depend on the model.

**Prior art.**
- Verification of an EigenTrust computation with fraud proofs over Merkle commitments appears in the OpenRank proof of concept (Karma3 Labs), whose settlement layer is simulated off-chain.
- A seeded PageRank proven in zero knowledge over EAS attestations appears in the trustgraphs project.
- A payer that constrains itself with a policy before paying, without changing x402, is proposed in x402 issue 2641.

This ERC does not claim the on-chain verification of a fixed point, nor policy-gated payment. It contributes their combination for ERC-8004: the graph construction (tag kinds, per-tag edge unit, emitter resolution, current-controller rejection), reader-chosen anchors with leave-one-out and a live veto, the sub-solution certificate with registry re-reads and growing bounds, and a non-reverting interface that a paying contract reads in the same transaction.

⟦08-bis : « Beyond one hop » = D50 (en avant), vecteurs communs `common_2hop` et `common_2hop_one_anchor` (AM-10.6). Masse des honnêtes et ferme : D56 et rapport 06 (MESURÉ en fork du testnet, 06/10) ; « fork of a test network » sans nommer Monad (règle de neutralité). Formule X : K8, A2b, PROOFS L6 réécrit. Faits : D48-C, revue de code du 06/10. Approbations : D48-B. Ancre ≠ source : D48-A, L8. Sources : PROOFS.md L1-L7 (D37), présentés selon D30 comme usage on-chain d'une borne classique, pas comme résultat nouveau. Mesures α : R4 / tour 4 (synthétique, deg = 5, g = 100). D34 : masse Sybil 0,1481 pour M = 1 ou 100 copies. ROW_ALIAS_MAX = 64 (D44) : AM-08.3. Antériorités : OpenRank et trustgraphs (CLAUDE.md §6, D30), x402 #2641 (`docs/ressources/x402.md`, issue ouverte, maj 2026-09-11). D46 : Kanmani et ColinkaMir nommés comme exemples d'`edgeFilterId`, sans dépendance. EIP-1 interdit les liens GitHub : projets cités par leur nom seulement. DOI des notes 1 à 5 : vérification dans la note qui suit les références.⟧

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
2. **Make `agentWallet` unique and add a reverse lookup.** Emitter resolution and row completeness would become verifiable on-chain.
3. **Timelock registry upgrades.** Upgrades should be announced on-chain, with a delay, before they take effect.
4. **Standardize `getVersion()`** in the ERC-8004 interfaces, so that aggregators can commit to a registry version without relying on an implementation detail.
5. **Emit the registration events in state order.** `register()` should emit `MetadataSet` for `agentWallet` before the ERC-721 receiver callback, so that an indexer that replays events obtains the state the registry stores (Security Considerations, *Indexers*).
<!-- DISCLOSURE-GATE:start — keep only once the ERC-8004 maintainers have been notified (decision D29) -->
6. **Extend the `giveFeedback` guard to `agentWallet`.** The current guard rejects the owner and approved operators, but not the agent's own wallet.
<!-- DISCLOSURE-GATE:end -->

If the registries change the semantics of `agentWallet`, of `feedbackIndex` or of the guard, existing certificates become `REGISTRY_CHANGED` (§7) once the version string changes, and sets need recertification.

⟦08-bis : renumérotation. La demande sur le garde-fou passe en dernier (n° 6, sous DISCLOSURE-GATE, D29) pour que la liste reste numérotée 1-5 si le bloc est retiré. Demande 5 = REGCB (revue du 06/10, constat 34). Correspondance avec le 01/10 : 1 → 1, 3 → 2, 4 → 3, 5 → 4, 2 → 6. D17, tour 3 Q3 C. Une v2.1.0 (unicité du wallet, index inverse) existe en amont (PR #80, ouverte, non déployée au 27/09). `isAuthorizedOrOwner`, utilisé par l'implémentation, est une fonction de l'implémentation de référence d'ERC-8004 : la norme ne cite que les fonctions ERC-721.⟧

## Test Cases

The vectors are in the [assets directory](../assets/erc-0000/README.md), as JSON with a field-by-field description. They are normative for the quantities they fix:
- the weight of a feedback;
- the pair edge;
- the `setId`;
- the row bytes, `graphRoot` and `vectorRoot`;
- the sub-solution check, `r`, `eUp`, `q`, `eEff`, `qEff`, mass, `d`, `D`;
- the amounts of the discrepancy proofs;
- the refusals of §3.5, §5.1, §5.3, §5.4 and §5.10;
- the readings of §8 for the vectors that carry their registry state.

Every expected value is an exact integer. An independent checker, `verify.py`, recomputes each one from this specification with the Python standard library. It also checks `t ≤ t*` and `‖t* − t‖₁ ≤ eUp` in exact rational arithmetic, and, after every proof of a sequence, that the bounds hold again for the registry's graph. The reference implementation accepts every certificate vector with identical values, refuses every refusal vector with the expected error, and produced every measured proof amount.

On an open set, the node entries of a vector (`calldata.nodeEntries`) go through `addNodes` before the submission, and `newNodes` is empty (§5.1).

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

### TC-2 Pair edge (§3.1, §3.3): `pair-edge.json`, 17 cases

| history of one (client, agent) pair, oldest first | expected |
|---|---|
| `slash −100` (1), `review +1` (2) | `w = −10000`, index 1 (negative dominance) |
| `vouch 1` (1), `vouch 0` (2) | no edge (the latest `vouch` is neutral) |
| `vouch 1` (1), `vouch 1` revoked (2) | `w = 10000`, index 1 |
| `vouch 1` (1), `vouch 5` out of bounds (2) | no edge: the latest feedback of the tag is invalid, and the older one is not used |
| `vouch 1` (1), `uptime 100` measurement (2) | `w = 10000`, index 1 |
| `vouch 1` (1), `review +1` (2) | `w = 10000`, index 2 (tie: highest index) |
| `vouch 1` from a controller of the agent | no edge (self-endorsement) |
| `slash −100` from a controller of the agent | `w = −10000`, index 1 (a controller's negative edge is kept) |
| `vouch 1` (1), `slash −50` (2) from a controller | `w = −5000`, index 2 (the sign test applies to the combined weight) |
| `veto −1` (1), `review +1` (2) | `w = −10000`, index 1 (the live veto of §8.2 reads only index 2) |
| `vouch` followed by a NUL byte, value 1 | no edge: that tag is not `vouch` (§3.1) |
| a 33-byte tag of the set, value 100 | `w = 10000`, index 1 |

### TC-3 Reference certificate: `certificates/mainnet_slash_anchor.json`

The state of a real registry at a fixed block, with `α = 1/3`, two anchors `A1`, `A2` weighted `1/2` each, and `minAnchors = 2`. Neither anchor is the source of an agent. A client `C` is the `agentWallet` of agent 18. Edges after §3:
- `A1 → 18`: `+10000`;
- `A2 → 4`: `+10000`;
- `C → 2`: `+10000`, `C → 3`: `+10000` (under another tag), `C → 4`: `−10000`.

`C`'s row is emitted by agent 18 (§3.5). Exact values:

| node | `t^(A1)` | `t^(A2)` | `trust` | `trustRobust` | `d` |
|---|---|---|---|---|---|
| `A1` | 1/3 | 0 | — | — | 0 |
| `A2` | 0 | 1/3 | — | — | 0 |
| 18 | 2/9 | 0 | 1/9 | 0 | 0 |
| 2 | 2/27 | 0 | 1/27 | 0 | 0 |
| 3 | 2/27 | 0 | 1/27 | 0 | 0 |
| 4 | 0 | 2/9 | 1/9 | 0 | 2/27 |

The certified integers are the floors of these values, reached in 4 iterations from zero. Expected results:
- `r = (5, 5)`, `eUp = (15, 15)`, `eEff = 16`, `qEff = 0`, mass `629629629629629628`;
- `D = 74074074074074074`;
- `graphRoot` and `vectorRoot` as in the file.

The slash makes agent 4's distrust positive although a later `+1` from the same client exists under another tag. Every agent is reached through one anchor only, so no agent has a positive `trustRobust`: on this registry, a reader-anchored aggregator says "unknown" for everyone and "distrusted" for agent 4.

### TC-4 Other certificates: `certificates/`

| vector | nodes | edges | level | what it fixes |
|---|---|---|---|---|
| `mainnet_honest_d20` | 6 | 5 | `RegistryVerified` | row copy restores a two-hop honest chain |
| `mainnet_scanner_preD15` | 35 | 58 | `RegistryVerified` | a set that declares a scanner's measurement tags as endorsements leaks trust into a farm |
| `mainnet_em_d44` | 14 | 38 | `RegistryVerified` | `ownerFallback` and VIA_OWNER rows; two massive agents whose owner is an anchor emit no row (§3.5); a 33-byte tag; ties resolved by index |
| `toy_alias_owner_rowmax` | 264 | 266 | `SubmitterAttested` | alias rows, wallet precedence, a row capped at `ROW_MAX` with declared `sPlus` (`eUp_A1 ≈ 2.2·10¹⁵` wei from the declared-omission margin) |
| `toy_alpha_1_2`, `_1_3`, `_1_4` | 5 | 7 | `SubmitterAttested` | the same graph under three values of `α` |
| `toy_truncated` | 5 | 6 | `SubmitterAttested` | truncation margin of a node without a row |

### TC-5 Violations and proofs (§5, §6): `violations/`

Five certificates satisfy `t ≤ F_bas(t)` for their committed graph, but that graph is not dominated by the registry. The first four are built on TC-3.

| violation | effect on the true graph | `RegistryVerified` at submission | proofs (`proveEdge`) | `eLowEff` / `eEff` after |
|---|---|---|---|---|
| fabricated edge `A1 → 4` | `Σλt(4)`: 0.1111 → 0.1667 | refused (`EdgeMismatch`) | `SubmitterAttested`: row `A1`, agent 4, `wNew = 0` | 166666666666666667 / 166666666666666685 |
| inflated slash (`−1` instead of `−10000`) | `d(4)`: 0.0741 → 0.0000074 | refused (`EdgeMismatch`) | `SubmitterAttested`: row 18, agent 4, `wNew = −10000` | 0 / 222200000000000016 |
| dilution: `18 → 3` omitted, no `sPlus` | `Σλt(2)`: 0.0370 → 0.0741 | accepted | row 18, agent 3, `wNew = 10000` | 111111111111111111 / 111111111111111123 |
| slash `18 → 4` omitted | `d(4)`: 0.0741 → 0 | accepted | row 18, agent 4, `wNew = −10000` | 0 / 222222222222222238 |
| two omissions on one row (slash on 4, endorsement of 2) | both | accepted | row 18, agent 4, then agent 2 with the first amendment | 222222222222222222 / 666666666666666678 |

After the proofs, `‖(t − t*)⁺‖₁ ≤ eLow` and `d* ≤ d + eEff` hold again for the true graph.

### TC-6 Behaviour (§5.9, §7, §8)

These cases need a chain. Their expected outcomes are normative:

1. `assess` on an unknown `setId`, or on a set without a certificate, returns `NO_CERT` with every value zero, and does not revert.
2. At `certBlock + maxAge + 1`, the status is `STALE`. It is also `STALE` as soon as proofs push `eLowEff` above `eLowMax`.
3. After a registry version string changes and `checkRegistry(setId)` is called, the status is `REGISTRY_CHANGED`, and `RegistryChanged` is emitted. The next accepted certificate clears it.
4. Transfers:
   - strict mode: after `transferFrom` of a certified agent with mass, the agent is `TRANSFERRED`, and also if it no longer exists;
   - fast mode: the agent is `TRANSFERRED` only after `proveTransfer`.
5. An anchor's current key posts `veto −1` on agent `j`:
   - in the next block, `assess(j, set, true)` returns `VETOED`, with `vetoCount = 1` and `triggerTag = keccak256("veto")`, without recertification;
   - if the anchor then posts any other feedback on `j`, the live veto lapses. The agent stays `VETOED` only if the certificate carries the anchor's veto bit.
6. An agent outside the certificate has status `OK`, zero trust, and `passesAnchorPolicy` returns `false`.
7. An agent endorsed by a single anchor of a set with `minAnchors = 2` has `trustRobust = 0` and does not pass.
8. Open set, replacement:
   - a certificate that omits endorsements (less mass) is refused;
   - a certificate for a graph that gained an edge (more mass, same `q`) is accepted;
   - the zero vector is refused against a live certificate;
   - a certificate that omits a negative edge (lower `D`) is refused;
   - a proven certificate resubmitted, unchanged or re-encoded, is refused, also under `REGISTRY_CHANGED` (TC-7, TC-8).
9. With a registry that reverts or returns malformed data, `assess`, `trustOf` and `passesAnchorPolicy` do not revert, and `passesAnchorPolicy` returns `false`.
10. Strict mode: the owner of a certified agent approves an anchor of the set; `assess(j, set, true)` returns `VETOED` with no feedback from that anchor. Fast mode: the same holds only after `proveApproval`.
11. On an open set, a submission made from inside another contract's execution reverts (§5.2).

### TC-7 Self-contained vectors (§3.3, §3.5, §5.1, §5.10, §8): `common/`

Each vector carries the registry state it was built from (`registry`: agents with owner, wallet and approved address, operators, feedback in index order). A checker can therefore re-read every committed edge, compute the outcome of the submission, and compute the readings of §8 without a chain.

| vector | level | expected | what it fixes |
|---|---|---|---|
| `common_A_anchor_not_source` | `RegistryVerified` | accepted | anchor `X` is the wallet of agent 10, which emits no row; an agent endorsed by `X` alone has `trustRobust = 0` |
| `common_A_attack_anchor_copy` | `RegistryVerified` | `AnchorAsSource(2)` | the same graph with agent 10 carrying `X`'s row |
| `common_A_mainnet_old_slash_anchor` | `RegistryVerified` | `AnchorAsSource(5)` | the same refusal on real data (needs the registry at `expect.forkBlock`) |
| `common_B_controller_negative` | `RegistryVerified` | accepted | an anchor made operator, and the agent's approved address, both slash agent 30: both negative edges are kept; agent 30 is vetoed by the certified bit and by approval; agent 31 passes |
| `common_C_proven_row_resubmitted` | `SubmitterAttested` | accepted, then `ProvenRowResubmitted(0)` | a fabricated anchor edge is proven false; the same false row with other bytes is refused; the honest certificate is accepted |
| `common_2hop` | `RegistryVerified` | accepted | agent 51, two hops from the anchors, has `trustRobust = 2/27` and passes; a one-hop list of trusted raters says "unknown" |
| `common_2hop_one_anchor` | `RegistryVerified` | accepted | the same chain through an agent endorsed by one anchor: `trustRobust = 0` |
| `common_R1_address_zero_node` | `RegistryVerified` | `BadNodes()` | a node for the zero address |

### TC-8 Proof sequences (§5.10, §6): `sequences/`

Registry changes, proofs and resubmissions, in order, with `eLowEff` and `eEff` after each proof:

| vector | sequence | `eLowEff` / `eEff` after each proof |
|---|---|---|
| `seq_declared_omission` | a row commits `{62: +10000, 63: +5000}` under a declared `sPlus = 20000` (64 omitted); the client revokes its feedback on 62, proven; the omission of 64 is revealed; the client endorses a new agent 65, proven; the original certificate is resubmitted | 0.2222 / 0.3333, then unchanged, then 0.2444 / 0.3556 (exact values in the file); resubmission refused (`ProvenRowResubmitted(2)`) |
| `seq_prove_wallet` | the wallet of agent 70 changes, `proveWallet`; the same certificate is resubmitted; the wallet is set back, `clearSourceFact`; the same certificate is resubmitted | 0.4444 / 0.8889; refused (`ProvenRowResubmitted(2)`); then accepted |

The first sequence fixes formula X. Keeping the declared budget when the committed edge on 62 falls would leave `eEff` at 0.111 instead of 0.333 after the first proof, and billing nothing to `eLow` for the new edge on 65 would leave `eLowEff` at 0.2222 after the last one.

### TC-9 Refusals (§5.1, §5.3, §5.4): `refusals.json`

Each case changes the certificate of `common_2hop` in one way, and MUST be refused:

| change | expected |
|---|---|
| a row declares `sPlus` equal to its committed positive sum | `NotCanonical(2)` |
| a row carries SRC with the zero address | `NotCanonical(2)` |
| the node entries are passed inline (`newNodes`) on an open set | `BadNodes()` |
| an anchor node carries a non-zero `ownerFp` | `EdgeMismatch(2²⁵⁶ − 1, 0)` |

⟦Tests de l'implémentation de référence correspondants (`contracts/test/`) :
1. `test_statuses` ;
2. `test_statuses`, `test_dilutionProvenWidensLowerBound` ;
3. `test_registryChanged`, `test_fork_upgradeDetected`, `test_fork_upgradeToPR80` ;
4. `test_statuses`, `test_fastTransferMode` ;
5. `test_vetoIsLastAnchorFeedback`, `test_certifiedVetoBit`, `test_fork_vetoOnRealSlash` ;
6. `test_isTrusted` (nom historique, il appelle `passesAnchorPolicy`) ;
7. `test_leaveOneOut` ;
8. `test_openReplacementRule`, `test_replacementRefusesOmittedNegative`, `test_replacementRefusesResubmittingProvenCertificate`, `test_C_provenRowResubmittedReencoded`, `test_C_provenRowResubmittedUnderRegistryChanged` ;
9. `test_neverRevertsOnBrokenRegistry` ;
10. `test_B_approvedAnchorVetoesStrict`, `test_B_operatorAnchorVetoesStrict`, `test_B_proveApprovalFastMode` ;
11. G-11 dans `Bis.t.sol` (soumission par un contrat refusée sur un ensemble ouvert).

TC-7 : rejoués par `CommonVectors.t.sol` (mocks, Registry-verified) et par `simulate.py` sur fork (07/10, 27/27). TC-8 et TC-9 : construits par `docs/erc/drafts/build-x08.py` (pipeline du solveur), rejoués sur le contrat de `main` avec les mocks dans une copie de travail (test `X08Vectors.t.sol`, copie dans `drafts/measurements/`), journal `forge-08bis-2026-10-07.log`. Ces séquences ne sont pas encore dans `contracts/test/` : relais au 02 (AM-08bis.6). Le chemin `assets/erc-0000` suit l'usage du dépôt ERCs (numéro provisoire 0000, à renommer quand un éditeur attribue le numéro).⟧

## Reference Implementation

The reference implementation has four parts:
- an aggregator contract that implements §2 to §10;
- an off-chain solver that applies the edge rules of §3 and iterates from zero;
- a certifier service;
- a watcher that audits each certificate against the registry and submits `proveEdge`, `proveWallet` or `proveTransfer`.

It passes every vector of the Test Cases. On the deployment described in Motivation, measured on a fork of that chain on 2026-10-06 and 2026-10-07:

| operation | gas |
|---|---|
| certificate of 300 edges, 100 nodes, 3 anchors, `RegistryVerified` (update, set without facts) | 15,024,552 |
| same certificate, `SubmitterAttested` | 1,449,205 |
| re-read of one edge in the registry (single feedback in the pair; 2026-09-28) | ≈ 45,500 |
| each further feedback in the same pair (2026-09-28) | ≈ 13,000 |
| `passesAnchorPolicy` on an unknown agent | 28,882 |
| `assess` without veto, strict transfer mode | 80,983 |
| `assess` with veto, strict mode (live feedback and approval veto) | 180,758 – 208,728 |
| one discrepancy proof (`proveEdge`) | 340,800 – 392,502 |

The fact checks of §5.10 cost nothing on a set without facts. Since they were introduced, a proof costs about 80,000 gas more (+26 % to +29 %), mostly for recording the fact *(estimated attribution)*. The approval veto adds about 41,600 gas to an `assess` with veto. With a 30 M gas transaction limit, a `RegistryVerified` certificate holds about 600 single-feedback edges at `k = 3`. Splitting verification across transactions is not specified.

The contract's runtime bytecode is 39,261 bytes. That is above the 24,576-byte limit of [EIP-170](./eip-170.md), so it cannot be deployed unchanged on a chain that enforces that limit. A deployment on such a chain has to move the proof functions (`proveEdge`, `proveWallet`, `proveTransfer`, `proveApproval`, `refreshFact`, `clearSourceFact`) into a separate contract that shares the aggregator's storage, or move the verification pass into libraries. Either split leaves the interface of §10 unchanged.

⟦Chiffres : `contracts/GAS.md`, lot 02-bis (MESURÉ le 06/10, forge, fork du mainnet au bloc 108 445 171) ; preuves remesurées par 08-bis le 07/10 avec `solver/simulate.py --scenarios vectors,violations,common` (fork anvil de rpc1.monad.xyz au bloc 110 994 810, contrat de `main`) : 340 800 à 392 502, identiques au gas près à GAS.md ; 27 vérifications sur 27 conformes (sortie dans le scratchpad de la session, reprise dans `assets/erc-0000/vectors/`). Taille : `forge build --sizes`, 39 261 octets (MESURÉ 07/10). « ≈ 600 arêtes » : CALCULÉ (15,02 M pour 300 arêtes). Le dépôt est privé (décision de Hugo) : avant la PR, il faut soit le rendre public et le citer (EIP-1 n'autorise pas le lien GitHub, mais l'implémentation peut être copiée dans `assets/`), soit copier `AnchoredReputation.sol` dans `assets/erc-0000/`. ⚠️ Le contrat est en MIT depuis le 07/10 (`LICENSE`) : une copie dans `assets/` du dépôt ethereum/ERCs devra être placée sous CC0 (règle du dépôt), ce qui est une décision de Hugo (🧑, rapport §7). Taille : AM-INT.9, AM-08.13 ; recommandation inchangée : découper APRÈS la soumission du hackathon, AVANT la PR d'ERC si une implémentation déployable sur Ethereum est voulue.⟧

## Security Considerations

**What a certificate guarantees.**
- At submission, `t ≤ t*` holds for the committed graph.
- For the registry's graph, it holds only if the committed graph is dominated by it (Rationale).
- At the `RegistryVerified` level, fabricated and inflated edges are refused, but dilution (an under-declared `sPlus`) and omitted negative edges are not, because completeness cannot be checked without a per-client index. At the `SubmitterAttested` level, all four are possible for a listed submitter.

In every case, the lower bound is guaranteed for the registry's graph only once every existing discrepancy has been proven. No level makes a certificate unforgeable. A consumer relying on a set should know who watches it.

**Open sets need a watcher.** On a set without listed submitters, anyone can submit. A diluted certificate that does not lower the mass, `q` or `D` passes the replacement rule and can displace an honest one before `maxAge`. A proof corrects it and records the fact (§5.10). That false row can then never come back, whatever its encoding, and the honest certificate replaces the diluted one at once. A dishonest submitter can still dilute *another* pair in each round. Each round costs it about a full certificate, and the watcher one proof plus, to restore the honest state, a full certificate. The number of rounds is bounded only by the number of committed pairs. A set that cannot guarantee an active watcher should list its submitters, and should set `minRefresh = maxAge`: inside the refresh window, the replacement rule checks neither mass nor `D`, so a certificate that drops negative edges and certified veto bits passes.

**Node-table inflation on open sets.** On an open set, anyone can append nodes through `addNodes`, including agent identifiers that do not exist. Every later certificate has to cover them as soon as `nCert` passes them, and `nCert` never decreases. Anyone can also resubmit the current certificate padded with zero-trust nodes, which passes the replacement rule with the same quality and raises `nCert` for good. In the reference implementation, each junk node adds about 3,975 gas to every `RegistryVerified` certificate at `k = 3` (1,608 at the `SubmitterAttested` level), while appending it costs the attacker about 46,000 gas once *(measured 2026-10-06)*. Past roughly 2,100 to 7,500 junk nodes, depending on the size of the honest certificate, no certificate fits in a 30 M gas transaction, and the set is frozen for good *(calculated)*. Appending is not rate-limited in this version. A set exposed to this should list its submitters.

⟦OPEN — A1b (revue du 06/10), à trancher par Hugo ou le conseil (CR, « Ce qui reste ouvert après la revue »). D23 a décidé une zone de transit : un nœud n'entrerait dans la table que par un certificat accepté qui lui donne de la masse. Elle n'est pas implémentée, et `addNodes` reste ouvert sur un ensemble ouvert. Une alternative est une caution par nœud. Le texte décrit le code et chiffre le risque. Il ne normalise ni la zone de transit (ce serait contredire le code), ni l'ouverture (ce serait contredire D23).⟧

**Bounds are global over a set.** `eLowEff` and `eEff` aggregate over all agents. One proof on a high-trust row lowers `trustLow`, or raises `distrustUp`, for every agent of the set until recertification.
- On the deployment of Motivation, proving one omitted negative edge raised `eEff` from 16 wei to 0.222 WAD (TC-5). With `ρ = 1/2`, an agent then needed a `trustLow` of at least 0.444 WAD to pass, until the next certificate. With two anchors of weight 1/2 and `minAnchors = 2`, `trustLow` is at most `(1 − α)/2 = 1/3` WAD, so no agent could pass.
- Only the client of a committed row can create such facts, and the replacement rule lets recertification follow at once. This is fail-closed by design, and it is also a denial-of-service lever.
- The owner of an endorsed agent can make its endorser an approved operator (`setApprovalForAll`), which turns a positive endorsement into a self-endorsement (§3.3), and then prove the decrease.
- `eLowMax` caps the widening of the lower bound: beyond it, the set is `STALE` and any certificate can replace the current one.
- Revealing a positive edge that was honestly omitted under a declared `sPlus` bills the worst case (§6.1), because the aggregator cannot tell it from a new edge. Anyone can therefore widen an honest certificate with a declared omission. The honest certificate comes back at once, since nothing contradicts a fact.

**Cost asymmetries.** Re-reading a pair edge scans the pair's whole history from its latest index downward, and nothing bounds that history. The client of a committed row can stack feedback on a pair to make every `RegistryVerified` submission, and every proof on that pair, more expensive. In the reference implementation, each stacked feedback adds about 12,900 gas to every re-read *(measured 2026-10-06)*. The certificate of the deployment of Motivation stops fitting in a 25 M gas certifier budget after about 640 stacked feedback entries on one committed pair *(calculated)*. An honest client that rates after every interaction gets there too. A certifier can omit such a positive edge under a declared `sPlus`. A negative edge cannot be omitted: if its pair has been poisoned beyond what one transaction can re-read, the row has to be truncated, and its margin widens `eUp` for the whole set. Because submissions and proofs forward all their gas to `readFeedback` (§5.7), long tags make each re-read more expensive too. A discrepancy proof costs 340,800 to 392,502 gas in the reference implementation, about 27 % more since proven facts were introduced *(measured 2026-10-06 and 2026-10-07)*. A fact on a row copied into `N` agents has to be proven `N` times.

⟦OPEN — EFF1 (revue du 06/10), à trancher par Hugo ou le conseil. La revue propose d'engager dans la politique une fenêtre de relecture `scanMax` : D14 ne porterait plus que sur les `scanMax` derniers avis du couple, avec la même règle dans le contrat, le solveur et l'indexeur. C'est un changement de la règle d'arête normative (§3.3), donc du `setId` et des vecteurs. Le texte décrit la règle actuelle (historique entier, aucune borne) et chiffre le coût.⟧

**Anchors.**
- With `minAnchors ≥ 2` and `vetoQuorum = 1`, a stolen anchor key yields a denial of service (vetoes, distrust, loss of the endorsements it held), and no payment to an agent that the other anchors do not reach. This holds because no agent row may have an anchor as its source (§3.5). Without that rule, an agent whose wallet is the anchor address would carry the anchor's row with mass from the other columns: in the TC-7 vector `common_A_attack_anchor_copy`, an agent endorsed with the stolen key alone would reach two columns, and the aggregator refuses that certificate. With `minAnchors = 1`, one stolen key suffices to make a Sybil agent pass.
- An agent whose source is an anchor emits no row. Its own outgoing endorsements are lost, and its mass counts in the truncation margin of `eUp` (§5.6).
- Leave-one-out protects against one compromised anchor, not against one compromised node. A reputable agent reached from every anchor that turns malicious can endorse Sybils in every column: the mass it passes is bounded by `(1 − α)/α` times the mass of its outgoing edges, and two agents endorsing each other amplify their own trust by up to `1/(1 − (1 − α)²)` (1.8 for `α = 1/3`).
- A region `X` can concentrate up to `(1 − α)·π(X)` of distrust on a single agent.
- This version names anchors by address. A compromised anchor cannot rotate its key: it has to be replaced in a new set, and consumers have to migrate.
- The live veto reads only an anchor's last feedback on an agent. Any later feedback from the anchor, even a measurement, lifts the live veto. Only the certified bit keeps it until the next certificate. Anchors therefore have to follow §9.
- A slash followed by a positive feedback from the same anchor, both posted between two certificates, is seen neither live nor by the certificate.

**Consumer as anchor.** A consumer can be one of the anchors of the sets it uses, and rate the providers that delivered. Combined with `minAnchors ≥ 2`, the consumer alone never makes a provider pass. A consumer plus one complacent anchor does, so the second anchor matters.

**Liveness.** Every consumer that fails closed depends on someone recertifying before `maxAge`. Submission is permissionless on open sets, so a consumer that runs the published solver can recertify itself. Listed submitters are a liveness dependency.

⟦OPEN — désaccord 1 du tour 2 (dépendance de vivacité, AM-2.12) : E exige un mode dégradé ; A et D refusent tout mode qui paie sans certificat frais. Le texte ne définit aucun mode dégradé. Maintenu ouvert : D27 dit qui paie la recertification, pas ce qui arrive s'il ne paie plus.⟧

**Liveness of proven facts.** Facts never expire (§5.10). When the registry changes after a proof, for example because a revocation brings an older feedback back into force or because a wallet is set back, the fact refuses the honest row until someone calls `refreshFact` or `clearSourceFact`. A client can force that step at will: it posts a feedback, waits for a watcher to prove the omission, then revokes it. Each cycle costs the client two feedback transactions and the certifier one extra transaction. Both functions are permissionless, so the certifier never depends on anyone else to unblock itself.

**Approvals.** A controller's positive edge is not an endorsement (§3.3), and ERC-8004 also refuses feedback from approved addresses. An owner can therefore call `setApprovalForAll` for its critics and for the anchors of a set. The critics' existing negative edges are kept (§3.3), but they can no longer post new feedback on the agent. An approved anchor counts as vetoing (§8.2). In strict mode the aggregator reads approvals live. When `strictTransfer` is off, an approval is seen only once someone calls `proveApproval`, and the next certificate erases the proven bit until it is proven again, which is why payers should avoid that mode (§8.3). The veto by approval applies only to addresses that are anchors of the set: approving a critic that is not an anchor stops its future feedback, and the set's anchors have to step in.

**Transfers and reputation purchase.**
- ERC-8004 clears `agentWallet` on transfer.
- A transferred agent with mass reads as `TRANSFERRED`, live in strict mode, after `proveTransfer` in fast mode, until the next certificate.
- Its **outgoing** edges stay in the certified vectors until someone submits `proveWallet` or a new certificate is accepted. Until then, a bought agent keeps propagating the mass it had.
- Feedback is undated, so reputation received before the transfer cannot be separated from reputation received after it: buying a reputable agent costs a pause, not a reset.
- A purchase that does not change `ownerOf` goes unseen: selling the owner's key, adding an operator, or an owner that is a contract account controlled by others. The pause on transfer only covers transfers of the token.
- The committed owner is a 63-bit fingerprint. A transfer to an address that shares those 63 bits goes unnoticed. Finding one takes about 2⁶³ attempts.

**Registry governance.**
<!-- DISCLOSURE-GATE:start — keep only once the ERC-8004 maintainers have been notified (decision D29) -->
The registries of the deployment in Motivation are upgradeable proxies controlled by a single externally owned account, with no timelock *(verified 2026-09-27)*.
<!-- DISCLOSURE-GATE:end -->
Registries are typically upgradeable. Whoever controls an upgrade can change any semantics this ERC relies on, including making any certificate pass the `RegistryVerified` re-reads, without changing the version string.
- The version hash detects an upgrade only if the version string changes, and only for the sets on which someone calls `checkRegistry`. An upgrade that keeps the version string is detectable only off-chain, through `Upgraded` events.
- Consumers of high-value flows should monitor those events.
- A registry call that fails after an upgrade, for example because it now costs more than the 120,000-gas cap of reads, makes the registry unreadable (§1): reads return `REGISTRY_CHANGED` for every agent whose answer needs it, and proofs and submissions revert. It is never read as a burned agent or an absent edge.
- `getVersion` and the reference registry's `isAuthorizedOrOwner` are not part of the ERC-8004 interface. On a registry without them, the reference implementation refuses every submission and every proof that needs them. An implementation can use the ERC-721 functions of §1 instead of `isAuthorizedOrOwner`.

**Controllers, former owners and shared wallets.**
<!-- DISCLOSURE-GATE:start — keep only once the ERC-8004 maintainers have been notified (decision D29) -->
- The ERC-8004 guard does not reject an agent's own `agentWallet`: one agent of the deployment in Motivation received 78 feedback entries from it. §3.3 rejects the positive edges of every current controller, `agentWallet` included.
<!-- DISCLOSURE-GATE:end -->
- Former owners are not rejected, because past ownership cannot be checked on-chain. A seller can rate the agent it sold, with the weight of its own mass, like any third party, including right after the transfer.
- A wallet shared by several agents makes each of them emit the same row with its own mass. A platform wallet whose agents are all reputable therefore speaks with their combined mass. That is concentration, not a Sybil gain, and it is visible in the certificate.

**Permanent negatives.** Negative feedback dominates until its author revokes it, and only its author can revoke it. If the author loses its key, the negative is permanent. The provider's recourse is out of protocol: ERC-8004 `appendResponse`, and the consumer's choice of set.

⟦OPEN — désaccord 1 du tour 3 (négatif permanent) : A et E veulent une échéance ou une levée ; D refuse toute échéance (l'attaquant attendrait l'expiration). Rien n'est tranché : la révocation par l'auteur reste le seul mécanisme, et le texte n'en définit pas d'autre.⟧

**Refusal oracle.** `triggerTag` tells any caller which tag caused a veto. The state is public anyway.

**Measurement leakage.** A set that declares an automated measurement tag as an endorsement recreates attack edges. On the deployment of Motivation, taking a scanner as the only anchor leaked 34.6 % of its mass into the farm. Reference schemas should classify every tag posted by automated monitors as a measurement.

**Payment is not honesty.** Payment-backed feedback raises the cost of an attack but does not prevent self-funded rings, as observed on-chain. Payment is neither a weight nor a pass condition in this ERC.

**Rounding.** Every term of `y` and every contribution `c_a` is rounded down. Margins, bounds, proof amounts and distrust are rounded up. Rounding never helps an agent pass.

**Data availability.** The committed rows exist only in the calldata of the submitting transaction. Proofs need them. On an open set, the submission has to be the top-level call of a transaction sent by an externally owned account (§5.2), so the rows can be read from the transaction itself. An account delegated under [EIP-7702](./eip-7702.md) passes that check while it runs its delegated code, which can then call the aggregator from an internal call. The rows are then in no transaction's calldata: they can be recovered only by re-executing the transaction on a node that holds the state of its block. A watcher that cannot re-execute cannot prove omissions in such a certificate. Listed submitters can use any path, and should publish their rows.

**Indexers.** Certifiers and watchers derive the graph from events, and the registry's events do not always follow its state.
- In ERC-8004 v2.0.0, `register()` stores `agentWallet = msg.sender` before minting the token, but emits `MetadataSet` for `agentWallet` after the ERC-721 receiver callback. If the callback changes the wallet or transfers the agent, the late event reports a wallet that the registry no longer stores. An indexer that replays events in order keeps that wallet. Its certifier then commits a source that the `RegistryVerified` re-read refuses (§5.7), at every round, and anyone who registers an agent from a contract can cause this. An indexer has to ignore that late `MetadataSet` when a wallet change or a transfer of the same agent occurred between the mint and `Registered` in the registration transaction.
- An indexer that keys feedback by the text of `tag1` can be halted by a single tag longer than the key limit of its database, and one that drops NUL bytes merges distinct tags into one. Keying by `keccak256(tag1)`, as §3.1 does, avoids both.

**Gas.** Every external call made by a read is capped at 120,000 gas, so a hostile registry costs a caller at most about `(2k + 1)` such calls, roughly 4 million gas at `k = 16` (estimated). A decision can cost more than a micropayment. Payers may cache decisions per payee for a bounded number of blocks (§8.3), and should call reads with an explicit gas limit, treating out-of-gas as a refusal.

Chains with a lower per-transaction gas cap (for example 2²⁴ under [EIP-7825](./eip-7825.md)) hold proportionally fewer `RegistryVerified` edges per certificate.

**Same chain.** All registry reads are same-chain. Using a certificate on another chain would reintroduce trust in a bridge.

⟦08-bis, sources des paragraphes nouveaux ou réécrits (chiffres MESURÉS par la revue maximale du 06/10, sauf mention) :
- *Open sets* : la garde à l'octet près (AM-08.16) est remplacée par les faits (D48-C). Le reste vaut toujours : AM-02.2, AM-INT.1, la dilution d'une autre paire à chaque tour.
- *Node-table inflation* : A1b. 3 975 et 1 608 gas par nœud parasite (k = 3) ; ≈ 45,9 k gas par nœud ajouté (GAS.md, scénario D) ; 2 100 à 7 500 nœuds, CALCULÉ par la revue. La zone de transit D23 n'est pas implémentée : ⟦OPEN⟧ ci-dessous.
- *Bounds* : facture au pire cas (formule X, ENCODING §7.1). ALT8 (griefing par des preuves honnêtes) : 02-bis l'a traité ; avec les faits, le titulaire honnête revient tout de suite.
- *Cost asymmetries* : EFF1. 12,9 k gas par avis empilé ; 640 avis pour le certificat de démo sous le plafond de 25 M du certificateur (CALCULÉ ; 1 900 pour un petit certificat). Coût des preuves : GAS.md, après 02-bis (+26 à +29 %, MESURÉ 06/10, remesuré à l'identique par 08-bis le 07/10). La fenêtre `scanMax` normative proposée par la revue n'est pas tranchée : ⟦OPEN⟧ ci-dessous.
- *Anchors* : D48-A, L8, vecteur `common_A_attack_anchor_copy` (`AnchorAsSource(2)`).
- *Liveness of proven facts* : AM-02bis.2 ; question de Hugo n° 3 du rapport 02-bis (permissionless ou réservé aux soumetteurs) : le texte suit le code (permissionless).
- *Approvals* : D48-B ; AM-02bis.1 (l'approbation ne vaut veto que pour une adresse déjà ancre ; la scène « approbation préventive » n'est pas encore jouée sur le vrai registre) ; AM-02bis.7 (mode rapide).
- *Registry governance* : première phrase sous DISCLOSURE-GATE (D29) ; R6 (registre illisible, plus de `TRANSFERRED` ni de preuve « arête absente »).
- *Guard* : première puce sous DISCLOSURE-GATE (D29) ; AM-9.3 (ancien owner qui note 918 blocs après le transfert, cas réel #10255) assumé par D48.
- *Data availability* : G-11 (`msg.sender == tx.origin`) et AM-02bis.6 (EOA délégué EIP-7702 ; confiance 6 dans la revue de sécurité ; non corrigé ; question de Hugo n° 2 du rapport 02-bis).
- *Indexers* : REGCB (revue, constat 34 ; FORMAT §7 ; MESURÉ sur le mainnet du 06/10 : 19 enregistrements, aucun touché). NUL et LONGTAG (revue, constats 12 et 13 ; jugés sur la limite documentée de Postgres, NON VÉRIFIÉS sur un vrai Postgres).
Correspondance du 01/10, toujours valable : AM-02.1, AM-02.4 / AM-INT.4 (01/10 : 18 wei → 0,556 WAD sur l'ancien vecteur, dont l'ancre était la source de #18 ; 07/10 : 16 wei → 0,222 WAD sur le nouveau TC-5, MESURÉ), AM-02.3, AM-02.6 et AM-4.7, AM-08.4, AM-08.9, AM-3.5 / D17 / AM-08.5, AM-08.10, D20, désaccord 1 du tour 4 (concentration), désaccord 3 du tour 2 (consommateur-ancre), R4 (34,6 %), D25 (cache), AM-R5.9. Aucun mot-clé RFC 2119 hors de la Specification (EIP-1).⟧

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).

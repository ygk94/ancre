---
eip: TBD
title: Anchored Reputation for Trustless Agents
description: Reader-anchored, certified, Sybil-bounded aggregation of ERC-8004 feedback that contracts can read before they pay
author: TBD
discussions-to: https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098
status: Draft
type: Standards Track
category: ERC
created: 2026-09-27
requires: 165, 721, 8004
---

⟦Texte R6 du 2026-09-27, réécrit à partir du draft du 2026-09-21 selon le CR du conseil (tours 1 à 3, décisions D1 à D19). Les notes en français entre ⟦ ⟧ sont internes et DOIVENT être retirées avant soumission. ⟦OPEN⟧ marque un désaccord non résolu du CR : le texte donne la position retenue par la synthèse du conseil, sans trancher le désaccord. Avant soumission : remplir `author` (au moins un auteur avec pseudo GitHub), ouvrir un fil dédié sur ethereum-magicians et y pointer `discussions-to` (le fil #25098 est celui d'ERC-8004), retirer les liens externes non autorisés par EIP-1, vérifier que `description` fait ≤ 140 caractères (actuellement 114).⟧

## Abstract

[ERC-8004](./eip-8004.md) records feedback about agents but leaves aggregation and Sybil filtering to readers: `getSummary` requires a caller-supplied list of clients, and its Security Considerations state that Sybil attacks are possible. This ERC standardizes that missing layer.

An **anchor set** is an immutable, content-addressed description of *whom the reader trusts to start with* (anchors and their weights), *how feedback is read* (a tag schema with declared scales and kinds), and *how results are used* (a policy). For each anchor set, a **certificate** publishes, per anchor, a personalized-PageRank trust vector over the ERC-8004 feedback graph, expressed as a share of a unit mass, together with a one-hop distrust vector and a global error bound. The error bound is verified on-chain in a single pass over the committed graph. It can only **grow** when anyone proves a discrepancy between the committed graph and the registry; there is no bond and no slashing.

Contracts read the result synchronously through `trustOf` and `assess`. These functions never revert: they return a status (`OK`, `STALE`, `TRANSFERRED`, `VETOED`, `REGISTRY_CHANGED`, …), a leave-one-anchor-out robust trust value, the distrust value, the error bound and the certificate block. Anchors can veto an agent directly, with immediate effect, by posting negative feedback in the registry.

## Motivation

- **Aggregation is required by ERC-8004 but unspecified.** ERC-8004 states that "more complex reputation aggregation will happen off-chain" and that "we expect many players to build reputation systems". At least eight independent aggregators existed as of 2026-09-21, each with its own interface. No contract can consume reputation without trusting one vendor's API.

- **Raw feedback is not comparable.** On one production deployment of ERC-8004 v2.0.0 (EIP-155 chain ID 143), a single registry mixed 0–100 ratings, Elo ratings around 1,600, ±1 votes, and 117 values of `1e38`. The naive mean for the most-rated agent was about 1.5 × 10³⁶. *(Measured 2026-09-21; re-measured identical on 2026-09-27.)* Without a declared scale per tag, every average is meaningless.

- **Sybil farms dominate unfiltered data.** On the same deployment, 7,665 of 9,188 feedback entries (83 %) came from agents registered within about 48 hours, all rating one agent at the maximum. *(Measured 2026-09-21.)* An external study reports coordinated Sybil behaviour among 59–91 % of raters on three other chains. *(Reported by the study, not re-verified by the authors of this ERC.)*

- **Payment is not a defence.** The farm above paid for its interactions, and the raters were funded by the rated agent's owner. An independent analysis of the same data found 16 feedback entries out of 9,188 with clean payment provenance. *(Reported 2026-09-21 by a third-party project, not re-verified.)*

- **The registry's own guard is bypassed in practice.** `giveFeedback` rejects the owner and operators of an agent, but not its `agentWallet`. On the same deployment, one agent received 78 feedback entries from its own `agentWallet`; `agentWallet` is not unique (178 wallets are shared by 1,773 agents, up to 762 agents per wallet); and after each of the 72 historical transfers, the wallet was cleared while the former owner regained the right to rate the agent. *(Measured and verified against the deployed source on 2026-09-27.)*

- **Measurement tags create attack edges.** A monitoring service that pings every endpoint and posts "liveness" or "trust" feedback effectively endorses whatever it pings. On the same deployment, such a scanner rated farm agents, which in turn rated the farm's target. Taking that scanner as a trusted source leaks trust into the farm. *(Measured 2026-09-27.)*

- **A single global score is undesirable.** Contributors to the ERC-8004 discussion called a single aggregated score dangerous, and one post in that thread asked for reputation *relative to reader-chosen anchors* (personalized PageRank / EigenTrust pre-trusted peers). No specification provides it.

- **Contracts need to act on trust, not just display it.** Payment routers, escrow and access control need a synchronous answer with a bounded error, a freshness indicator, and a fail-closed behaviour.

- **The real graph is thin, and that is the point.** On the deployment above, 84 agents had received feedback (10 of them absent from the most-used public indexer), no feedback had been posted since 2026-09-10, and only 3 edges survived a minimal endorsement schema. *(Measured 2026-09-27.)* An aggregator conforming to this ERC reports the farm's target at zero trust and almost every other agent as unknown. That is the correct answer, and a reader-anchored aggregator is the tool that lets it be stated verifiably.

⟦Toutes ces mesures concernent Monad mainnet (143), registres `0x8004A169…a432` / `0x8004BAa1…9b63`. Le nom de la chaîne reste hors du texte (norme chain-agnostique, décision CLAUDE.md §5). Sources : snapshot 8004scan du 21/09 + relecture on-chain du 27/09 au bloc ≈ 108,43 M (CR tour 3, « Faits vérifiés »). L'étude externe est arXiv 2606.26028 (73,5 % / 59,2 % / 90,6 %) : EIP-1 interdit le lien arXiv, citer par DOI si elle en a un. L'analyse de provenance est celle de ColinkaMir/monad-agent-trust. Le post est le #309 du fil #25098 (2026-07-23). Vérifier avant publication qui détient le scanner `0xa06f907f` (question 1 du tour 3) et trancher la divulgation responsable pour #8317 (question 5 du tour 3) : le texte public ne nomme ni l'un ni l'autre.⟧

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

### 1. Conventions and definitions

- `WAD = 10**18`. All trust, distrust, residual and error values are unsigned integers in WAD. Division is integer division; the rounding direction is stated at every step.
- `GRID = 10**4`. Edge weights are quantized on a grid of `1/GRID` (§3.4).
- **Registries**: an ERC-8004 Identity Registry and the Reputation Registry bound to it, on the chain where the aggregator is deployed. An aggregator conforming to this ERC MUST be deployed on the same chain as the registries it reads.
- **Feedback**: a tuple `(agentId, client, feedbackIndex, value, valueDecimals, tag1, tag2, isRevoked)` as returned by `readFeedback`. `feedbackIndex` starts at 1 and is ordered per `(agentId, client)` pair across all tags. `tag2` is ignored by this ERC.
- **Certificate block** (`certBlock`): the block number at which a certificate was accepted on-chain. All ages and delays in this ERC are counted in blocks, never in seconds.
- **Controllers of an agent `j`**: `ownerOf(j)`, `getAgentWallet(j)`, `getApproved(j)`, and every address `o` with `isApprovedForAll(ownerOf(j), o)`.
- **Former owners of `j`**: every address that has been `ownerOf(j)` before the current owner, as recorded by ERC-721 `Transfer` events.

#### 1.1 Nodes

The graph has three kinds of nodes. Each has a 32-byte `nodeKey`:

| Kind | Identifier | `nodeKey` |
|---|---|---|
| `AGENT` (1) | `agentId` | `keccak256(abi.encode(uint8(1), agentId))` |
| `ADDRESS` (2) | `address` | `keccak256(abi.encode(uint8(2), addr))` |
| `ANCHOR` (3) | `anchorId` (§2) | `keccak256(abi.encode(uint8(3), anchorId))` |

Only `AGENT` nodes receive edges. `ADDRESS` nodes never receive edges or anchor mass, so their trust is identically zero; they exist so that ambiguous senders are never merged into an agent (§3.2). Implementations MAY omit `ADDRESS` nodes from certificates. An `ANCHOR` node is always distinct from every `AGENT` node, even when the anchor's key is also an agent's wallet.

### 2. Anchors

An anchor is identified by a self-certifying `anchorId` with key pre-rotation, so that an anchor set can stay immutable while the anchor rotates its signing key.

- **Inception.** The anchor's first key `key0` chooses a secret `salt1` and a next key `key1`, and publishes `nextKeyDigest1 = keccak256(abi.encode(key1, salt1))`. Then `anchorId = keccak256(abi.encode(key0, nextKeyDigest1))`.
- **Rotation.** To rotate from key `n` to key `n+1`, key `n+1` itself calls `rotate`, revealing `salt(n+1)` and committing `nextKeyDigest(n+2)`. The call MUST succeed only if `keccak256(abi.encode(msg.sender, salt)) == nextKeyDigest(n+1)`. A stolen current key therefore cannot rotate the anchor. A `nextKeyDigest` of zero makes the current key final.
- **Current key.** Only feedback posted by the anchor's **current key** counts, both in the graph and in vetoes. After a rotation, the anchor re-posts whatever feedback it wants to keep. Feedback posted by a former key MUST be ignored.

```solidity
interface IAnchorKeyRegistry {
    event AnchorIncepted(bytes32 indexed anchorId, address indexed key, bytes32 nextKeyDigest);
    event AnchorKeyRotated(bytes32 indexed anchorId, address indexed newKey, uint64 sequence, bytes32 nextKeyDigest);

    /// key0 = msg.sender; anchorId = keccak256(abi.encode(msg.sender, nextKeyDigest)).
    /// MUST revert if anchorId already exists.
    function incept(bytes32 nextKeyDigest) external returns (bytes32 anchorId);

    /// msg.sender is the new key. MUST revert unless
    /// keccak256(abi.encode(msg.sender, salt)) == the committed nextKeyDigest (which MUST be non-zero).
    function rotate(bytes32 anchorId, bytes32 salt, bytes32 newNextKeyDigest) external;

    /// MUST NOT revert; returns (address(0), 0) for an unknown anchorId.
    function currentKey(bytes32 anchorId) external view returns (address key, uint64 sequence);
}
```

The anchor key registry is identified by its address inside each anchor set (§5). The key is an address because ERC-8004 feedback is attributed to `msg.sender`.

⟦D9, tour 2 Q2. Motif KERI. La démo du 13/10 n'implémente pas la pré-rotation (adresses fixes étiquetées « demo », découpage AM-2.13) : l'implémentation de référence ne sera pas conforme sur ce point à la soumission.⟧

### 3. Graph construction

For an anchor set `S` (§5) with schema `schema(S)`, the trust graph is built from the registries' state as follows. Certifiers compute it off-chain from registry events. The rules are normative, because two conforming certifiers MUST produce the same graph from the same state.

#### 3.1 Tag schema

```solidity
enum TagKind { Endorsement, Measurement }

struct TagSchema {
    string  tag;      // exact ERC-8004 tag1 (MAY be the empty string)
    TagKind kind;
    int256  min;      // lowest valid value, scaled to WAD (18 decimals)
    int256  neutral;  // value that carries no opinion, scaled to WAD
    int256  max;      // highest valid value, scaled to WAD
}
```

- A schema is an array of `TagSchema` sorted by `keccak256(bytes(tag))` in strictly ascending order. `schemaHash = keccak256(abi.encode(schema))`.
- Each entry MUST satisfy `min ≤ neutral ≤ max` and `min < max`.
- The schema MUST contain at most `TAGS_MAX = 8` entries of kind `Endorsement`.
- **Only `Endorsement` tags create edges.** Feedback with a `Measurement` tag MUST NOT create edges and MUST NOT propagate trust or distrust. A consumer MAY use measurement feedback in its own policy (for example, to refuse an agent whose reported uptime is below a threshold), outside the quantities defined by this ERC.
- Feedback whose `tag1` is not in the schema MUST be ignored.
- There is no global schema registry. The schema is committed per anchor set, and anyone MAY publish a reference schema for others to adopt.

⟦D12, D15. `higherIsBetter` du draft du 21/09 est supprimé : le couple min/neutral/max le remplace (un tag où « plus bas est mieux » se déclare avec neutral = max). Le `ITagSchemaRegistry` global est supprimé (D12 : pas d'autorité).⟧

#### 3.2 Sender resolution

For an anchor set `S`, the sender node of a feedback posted by address `c` is:

1. the `ANCHOR` node of `a`, if `c` is the current key (§2) of an anchor `a` of `S`; otherwise
2. the `AGENT` node `i`, if `i` is the **unique** agent with `getAgentWallet(i) == c`; otherwise
3. the `ADDRESS` node of `c`, when no agent or several agents have `agentWallet == c`.

Rule 1 takes precedence: feedback from an anchor's current key is attributed to the anchor node only, never also to an agent node. The ERC-721 owner of an agent is not a sender for that agent unless it is also its `agentWallet`. This follows ERC-8004's recommendation that agents acting as clients use their `agentWallet`. Senders MUST NOT be merged across agents.

⟦D16, D9, relecture D→A du tour 3 (« à écrire explicitement »). La précédence exclusive de la règle 1 est un choix R6 : le CR dit « nœud-ancre distinct » sans dire si l'avis est aussi attribué à l'agent. Le solveur R4 (solver/graph.py) l'attribue AUX DEUX nœuds : voir AM-R6.14. Pas d'index inverse wallet → agent on-chain (AM-3.4) : l'unicité est établie hors chaîne par l'indexeur à partir de `MetadataSet(agentWallet)`, `Transfer` et `Registered`.⟧

#### 3.3 Edge rejection

A feedback from `c` about agent `j` MUST be discarded if any of these holds:

- `c` is a controller of `j` (§1);
- `c` is a former owner of `j`;
- the sender node of `c` is the `AGENT` node of `j` (self-edge).

#### 3.4 Normalization and quantization

Let a feedback have `value` (int128) and `valueDecimals` `d` (0 ≤ `d` ≤ 18), and let `s` be the schema entry for its `tag1`.

1. `V = value · 10^(18 − d)`. This conversion is exact.
2. If `V < s.min` or `V > s.max`, the feedback is **invalid** and MUST be discarded. Aggregators MUST NOT clamp out-of-range values.
3. The quantized weight `q ∈ [−GRID, GRID]` is computed with truncation toward zero:
   - if `V ≥ s.neutral`: `q = (s.max == s.neutral) ? 0 : ((V − s.neutral) · GRID) / (s.max − s.neutral)`;
   - otherwise: `q = −(((s.neutral − V) · GRID) / (s.neutral − s.min))`.

The quantized weight is normative. It defines the graph and is not an approximation covered by the error bound. The weight in WAD is `q · 10^14`.

⟦D18 + tour 2 Q5. La règle du tour 2 « troncature vers zéro de value/10^dec → WAD » n'a plus d'objet : d ≤ 18 (VÉRIFIÉ) rend la conversion exacte ; la seule troncature est celle de q (AM-R6.6). |V| ≤ 1e56 et |V − neutral|·GRID ≤ ~2e60 tiennent dans un int256.⟧

#### 3.5 Edge unit and combination

For each triple `(c, j, τ)`, with `c` a client, `j` an agent and `τ` an `Endorsement` tag of the schema, the **current feedback** is the one with the highest `feedbackIndex` among the feedback from `c` about `j` with `tag1 == τ` that is **not revoked and valid** (§3.4). If there is none, the triple contributes nothing. An invalid or revoked feedback never supersedes an earlier valid one. Revoking the latest feedback therefore restores the previous valid one.

The pair `(c, j)` then receives one combined weight, from the current feedback of each tag (**negative dominance**):

- if at least one per-tag `q` is negative, `w(c, j)` is the most negative `q`;
- otherwise, `w(c, j)` is the largest `q`.

Ties are broken by the smallest `tag1` in byte order. The tie-break selects which feedback is recorded (§6.1); the weight is the same either way. A combined weight of zero creates no edge.

The edge `u → j` then has weight `w(c, j)`, where `u` is the sender node of `c` (§3.2) and the feedback passed §3.3. Since each node has exactly one sender address, each pair `(u, j)` has at most one edge.

⟦D14. « Dernier avis non révoqué » lu littéralement : le dernier parmi les non révoqués ET valides. C'est aussi le mode par défaut du solveur (`selection="latest_valid"`). L'autre lecture possible (« le dernier avis, s'il n'est pas révoqué ») est notée AM-R6.21. Le tie-break est un choix R6 ; le solveur départage par `max((q, tag1))` côté positif, donc par le plus grand tag (AM-R6.24).⟧

#### 3.6 Weight matrices (separate budgets)

For each node `u` with out-edges:

```
S⁺_u = Σ_j max(w_uj, 0)        B⁺_u = max(GRID, S⁺_u)        C_uj = max(w_uj, 0) / B⁺_u
S⁻_u = Σ_j max(−w_uj, 0)       B⁻_u = max(GRID, S⁻_u)        D_uj = max(−w_uj, 0) / B⁻_u
```

Every row of `C` and every row of `D` sums to at most 1. Endorsement and distrust use **separate budgets**: criticizing an agent costs a node none of its endorsement capacity.

#### 3.7 Edge filters (extension point)

An anchor set MAY commit a non-zero `edgeFilterId`. Its semantics are defined by a separate specification. An edge filter MUST only remove edges; it MUST NOT add edges or increase weights. Payment provenance MUST NOT be a weight or a condition in the core algorithm; it MAY be an edge filter. When `edgeFilterId ≠ 0` and the filter has no on-chain predicate, disputes of kind `OMISSION` (§7) cannot be checked, and the set MUST NOT be certified at level `RegistryContested`.

⟦D3. Le signal de provenance de paiement (ColinkaMir) est le premier filtre d'extension envisagé.⟧

### 4. Algorithm `PPR-v1`

Let `α = alphaNum / alphaDen` with `0 < alphaNum < alphaDen`, committed in the anchor set. For each anchor `a` of the set (a *column*), let `p^(a)` be the unit vector on the `ANCHOR` node of `a`. The trust column `t^(a)` is the unique fixed point of

```
F^(a)(t) = (1 − α) · Cᵀ t + α · p^(a)
```

**Absorbing convention.** Mass that a node does not pass on (a row of `C` summing to less than 1, or no out-edge) is lost. It is **not** redistributed to `p`. Hence `Σ_i t^(a)_i ≤ 1` (in WAD, `≤ WAD`), each entry fits in 64 bits, and the map `p ↦ t` is exactly linear.

**Trust as a share of mass.** `t^(a)_i` is the share of anchor `a`'s unit mass that reaches node `i`. It is exposed as is, in WAD. It is not multiplied by the number of nodes or by any other quantity chosen by the certifier.

**Distrust (one hop).** `d^(a)_j = (1 − α) · Σ_u t^(a)_u · D_uj`. Distrust does not propagate further, and it does not feed back into trust.

**Anchor-set values.** With anchor weights `λ_a` (in WAD, summing to `WAD`):

```
contribution_a(i) = λ_a · t^(a)_i / WAD
trust(i)          = Σ_a contribution_a(i)
trustRobust(i)    = trust(i) − (sum of the (m − 1) largest contribution_a(i))     // m = minAnchors; 0 if k < m
distrust(i)       = Σ_a λ_a · d^(a)_i / WAD
```

`trustRobust` is the trust that no set of `m − 1` anchors can produce alone. Distrust is **not** leave-one-out, because it only ever pushes toward refusal.

**Error bound.** `F^(a)` is a contraction of factor `(1 − α)` in L1. For any submitted column `t`, if `r_a ≥ ‖t − F^(a)(t)‖₁`, then `‖t − t*^(a)‖₁ ≤ r_a / α`. The per-column bound is `e_a = ⌈r_a · alphaDen / alphaNum⌉`, and the set-level bound is

```
eEff = Σ_a ⌈λ_a · e_a / WAD⌉
```

`eEff` bounds the error of `trust`, `trustRobust` and `distrust` for every agent simultaneously (§ Rationale). It is a single global bound: widening it affects every agent of the set by the same amount.

⟦OPEN — désaccord 5 du tour 2 (borne globale) : A et E constatent qu'un élargissement touche tout le monde ; une borne par coordonnée n'a pas été trouvée en une passe. Le texte garde la borne globale.⟧

⟦D1 (part de masse WAD, plus de `score = t·N` ni de `errorBound = (r/α)·N`, AM-1.1), D5 (convention absorbante : le draft du 21/09 renvoyait la masse sans issue vers p, AM-1.2), D4 (méfiance à un saut ; la formule d = (1−α)Dᵀt est implicite dans l'analyse de A au tour 2 et explicite dans solver/ppr.py), D7, D8.⟧

### 5. Anchor sets

```solidity
enum Level { None, Optimistic, ResidualVerified, RegistryContested }

struct Policy {
    uint8   minAnchors;          // m ≥ 1; RECOMMENDED default 2 (see Security Considerations)
    uint8   vetoQuorum;          // q ≥ 1; RECOMMENDED default 1
    uint64  threshold;           // θ, WAD
    uint64  rhoNum;              // distrust ratio ρ = rhoNum / rhoDen; RECOMMENDED 1/2
    uint64  rhoDen;
    uint64  maxAge;              // blocks after which a certificate is STALE
    uint64  minRefresh;          // blocks, see §6.3
    uint64  slackRefresh;        // WAD, see §6.3
    uint16  rowMax;              // maximum out-edges per committed row; RECOMMENDED 256
    Level   minLevel;            // lowest certificate level accepted for this set
    address optimisticCertifier; // sole certifier allowed at level Optimistic; address(0) disables Optimistic
}

struct AnchorSet {
    address   identityRegistry;
    address   reputationRegistry;
    address   anchorKeyRegistry;
    bytes32[] anchorIds;         // strictly ascending, 1 ≤ k ≤ K_MAX = 16
    uint64[]  weights;           // λ_a in WAD, each > 0, Σ = WAD
    uint64    alphaNum;          // α = alphaNum / alphaDen, 0 < alphaNum < alphaDen
    uint64    alphaDen;
    bytes32   schemaHash;        // §3.1
    bytes32   edgeFilterId;      // §3.7; bytes32(0) = none
    Policy    policy;
    string    metadataURI;       // human-readable name, author, rationale for the anchors
}
```

- `setId = keccak256(abi.encode(block.chainid, set))`. An anchor set is **immutable**. Changing any field (an anchor, a weight, `α`, the schema, the filter, the policy, the registries, the metadata) yields a new `setId`.
- Registration is permissionless. The full schema MUST be supplied at registration, and its hash MUST equal `schemaHash`.
- The anchors are named by `anchorId`, not by address, so keys can rotate without a new set.
- This ERC defines **no default anchor set**. Sets published for demonstration SHOULD say so in `metadataURI`.
- An implementation MAY restrict the values of `α` it accepts. A set whose `α` is not accepted MUST be rejected at registration.

⟦D1 (politique engagée dans le setId), D2 (α = 1/3 pour ANCRE), D12, D13. Le CR se contredit sur α (« unique par déploiement » en D2, « la norme autorise α par certificat » au tour 2 Q4, « engagé dans le setId » dans la consigne R6) : le texte l'engage dans le setId et laisse un déploiement le restreindre (AM-R6.7).⟧

⟦OPEN — désaccord 6 du tour 2 (α) : aucune donnée ; R4 le mesure sur des graphes synthétiques à vérité connue (D19). α n'est pas fixé par la norme.⟧

### 6. Certificates

#### 6.1 Commitments

```solidity
struct Certificate {
    bytes32   setId;
    Level     level;
    address   certifier;
    uint64    certBlock;              // block.number at acceptance
    uint64    snapshotBlock;          // block at which the certifier read the registries (informative, ≤ certBlock)
    bytes32   identityVersionHash;    // §8
    bytes32   reputationVersionHash;  // §8
    bytes32   graphRoot;              // Merkle root of row leaves
    bytes32   vectorRoot;             // Merkle root of vector leaves
    uint256[] residual;               // r_a per column, WAD, including rounding, truncation and widening
    uint256   errorBound;             // eEff, WAD
}
```

**Row leaf.** For every node `u` whose trust is non-zero in at least one column:

```solidity
struct RowEntry {
    bytes32 dst;            // nodeKey of the destination AGENT node
    bytes32 tagHash;        // keccak256(bytes(tag1)) of the feedback selected by §3.5
    uint64  feedbackIndex;  // index of that feedback
    uint64  lastIndex;      // getLastIndex(agentId(dst), sender) at snapshotBlock
    int16   q;              // combined weight w(sender, dst), non-zero
}
// entries strictly ascending by dst; at most policy.rowMax entries
rowLeaf = keccak256(abi.encode(nodeKey, truncated, sender, bPlus, bMinus, entries));
```

- `sender` is the address resolved in §3.2: the anchor's current key, the agent's `agentWallet`, or `address(0)` when the agent has no sender (wallet unset or ambiguous).
- `bPlus` and `bMinus` are `B⁺_u` and `B⁻_u` in grid units (`uint32`).
- `truncated` is `true` for a node in the truncation set `T` (§6.2). A truncated row has no entries.
- A node whose row would exceed `policy.rowMax` entries MUST be truncated.

**Vector leaf.** For every node with non-zero trust in at least one column:

```solidity
vectorLeaf = keccak256(abi.encode(nodeKey, owner, uint64[] t, uint64[] d));
// owner = ownerOf(agentId) at certBlock for AGENT nodes, address(0) otherwise
```

**Trees.** Leaves are sorted by `nodeKey`, in ascending order. A parent is `keccak256(abi.encodePacked(left, right))`. An odd last node is promoted unchanged. The root of an empty set is `bytes32(0)`. Leaves are never 64 bytes long, so a leaf cannot be confused with an inner node.

The calldata encoding of a submission is implementation-defined. Only the leaves and roots above are normative.

⟦D18, tour 3 Q2 C (« l'encodage des feuilles de graphRoot doit être normé ; celui du calldata est un détail d'implémentation »). Le draft du 21/09 avait un `lastIndexRoot` séparé, que le tour 3 demande de conserver. Il est replié ici dans chaque `RowEntry.lastIndex` : sous D6, il ne sert plus à la solidité de la borne, seulement à classer une preuve d'écart comme antérieure ou postérieure au snapshot (AM-R6.9). `nodeCount` est supprimé (tour 3). Les feuilles utilisent des `nodeKey` et non les indices stables de la table du contrat : c'est portable d'un déploiement à l'autre, mais plus coûteux en hachage. À aligner avec contracts/ENCODING.md quand il existera (AM-R6.12).⟧

#### 6.2 Residual verification (normative pseudo-code)

A certificate at level `ResidualVerified` or `RegistryContested` MUST be accepted only if the following verification succeeds in the transaction that submits it. `k` is the number of anchors, `αN/αD = alphaNum/alphaDen`, and `ΔA = αD − αN`.

```
CERTIFY(setId, submission):
  S ← anchorSet(setId)                                   // revert if unknown
  require submission.level ≥ S.policy.minLevel
  vI, vR ← versionHash(S.identityRegistry), versionHash(S.reputationRegistry)   // §8
  observe(vI, vR)                                        // updates observed hashes, may emit RegistryChanged

  // --- submission content (logical) ---
  // N : nodes (nodeKey, kind, id), strictly ascending by nodeKey; MUST contain every anchor node
  //     of S and every dst of every row
  // t[a][n] : uint64, 0 ≤ t ≤ WAD, for a ∈ 1..k, n ∈ N
  // row[n] : for every n with max_a t[a][n] > 0, either TRUNCATED or (sender, entries)
  // T : the set of truncated nodes

  for a in 1..k:  lo[a][·] ← 0; cnt[a][·] ← 0; dist[a][·] ← 0; marg[a] ← 0
  for a in 1..k:  lo[a][anchorNode(a)] += ⌊αN · WAD / αD⌋;  cnt[a][anchorNode(a)] += 1

  for n in N with row[n] not TRUNCATED:
     E ← row[n].entries
     require |E| ≤ S.policy.rowMax
     require E strictly ascending by dst; every dst ∈ N, kind(dst) = AGENT, dst ≠ n
     require every e.q ∈ [−GRID, GRID] \ {0}
     require every e.tagHash names an Endorsement tag of the schema
     B⁺ ← max(GRID, Σ_{e.q>0} e.q);  B⁻ ← max(GRID, Σ_{e.q<0} −e.q)
     require B⁺ == row[n].bPlus ∧ B⁻ == row[n].bMinus
     for a in 1..k with t[a][n] > 0, for e in E:
        if e.q > 0:  lo[a][e.dst]   += ⌊t[a][n] · e.q · ΔA / (B⁺ · αD)⌋;  cnt[a][e.dst] += 1
        else:        dist[a][e.dst] += ⌈t[a][n] · (−e.q) · ΔA / (B⁻ · αD)⌉

  for n in T, a in 1..k:  marg[a] += ⌈t[a][n] · ΔA / αD⌉            // truncation margin (1 − α)·t_n

  for a in 1..k:
     r[a] ← Σ_{n∈N} max(lo[a][n] + cnt[a][n] − t[a][n],  t[a][n] − lo[a][n])  +  marg[a]
     e[a] ← ⌈r[a] · αD / αN⌉
  eEff ← Σ_a ⌈λ_a · e[a] / WAD⌉

  require REPLACEMENT_ALLOWED(S, current(setId), eEff)              // §6.3
  for every AGENT node n with max_a t[a][n] > 0:  owner[n] ← ownerOf(agentId(n))   // read, not submitted
  store t, dist as d, owner; graphRoot, vectorRoot computed from the leaves (§6.1)
  store Certificate{…, certBlock = block.number, residual = r, errorBound = eEff}
  emit CertificatePublished
```

Notes:

- For every node `n`, `F(t)_n ∈ [lo_n, lo_n + cnt_n]` in exact arithmetic, because each floored term loses less than one unit. So `r[a]` is an upper bound on `‖t − F(t)‖₁`.
- The truncation margin `(1 − α)·t_n` covers both the endorsement row and the distrust row of a truncated node (see Rationale, *One error bound for trust and distrust*).
- Nodes outside `N` have trust zero in every column. Every node of `N` with non-zero trust MUST have either a row, possibly with no entries, or be in `T`.
- The certifier does not submit `d`. The contract computes it, rounding up.

⟦Pseudo-code aligné sur l'en-tête de solver/ppr.py (arrondi majoré `max(hi − t, t − lo)`, marge `⌈t_u·(αD−αN)/αD⌉`). Deux écarts assumés, à signaler au chantier R4 : (1) le solveur arrondit `d` à l'entier inférieur, le texte à l'entier supérieur (échec fermé) : AM-R6.13 ; (2) le solveur porte les lignes par indice de nœud et non par `nodeKey`.⟧

**Level `Optimistic`.** The contract does not verify the residual. The certificate MUST be submitted by `S.policy.optimisticCertifier`. Consumers relying on it trust that certifier.

⟦Conséquence de D6 (pas de caution, pas de slashing) et du niveau « Optimistic : rien n'est vérifié » (C, tour 2) : sans restriction, n'importe qui publierait t = 1 pour ses Sybil. La restriction à un certificateur engagé dans la politique est un ajout R6, pas une décision du CR (AM-R6.17).⟧

#### 6.3 Replacement

Certification is permissionless, except at level `Optimistic`. A new certificate replaces the current one if and only if one of these holds:

```
REPLACEMENT_ALLOWED(S, cur, eEffNew) ⇔
     cur is absent
  ∨  block.number − cur.certBlock > S.policy.maxAge
  ∨  status(cur) = REGISTRY_CHANGED
  ∨  eEffNew ≤ cur.errorBound                                   // errorBound includes every widening so far
  ∨  (block.number − cur.certBlock > S.policy.minRefresh ∧ eEffNew ≤ cur.errorBound + S.policy.slackRefresh)
```

The last clause lets an honest certifier refresh a graph that has legitimately become denser (and so has a larger bound). The rule stops a sloppy certificate (for example, one that truncates everything) from replacing a precise one.

⟦Tour 2 Q1 et spec Q1 (relecture A→D). La clause REGISTRY_CHANGED est un ajout R6 : sans elle, un certificat rendu faux par une upgrade bloquerait son remplacement jusqu'à maxAge.⟧

### 7. Discrepancy proofs (level `RegistryContested`)

A discrepancy proof shows that a committed row differs from the registry. It never invalidates the certificate and never moves funds: it only **widens** the residual. It is permissionless.

A row has a **state**. Its initial state is the committed row, proven against `graphRoot`. After a proof, its state is `rowState[u] = rowLeaf(L′_u)`. Each proof starts from the row's current state.

| Kind | Fact read from the registries | New row `L′` |
|---|---|---|
| (i) `OMISSION` | Feedback `(c = L.sender, j, idx)` that is not revoked, valid, has an `Endorsement` tag, and passes §3.3 as far as checkable on-chain. `L` has no entry for `j`, **or** `L`'s entry for `j` has a different `tagHash` and the new `q` dominates it under §3.5 | the entry for `j` becomes `(j, tag, idx, q)`, combined with the existing weight by §3.5 |
| (ii) `STALE` | `L` has entry `(j, τ, idx, ·)`; feedback `(L.sender, j, idx2)` with `idx2 > idx`, `tag1` hashing to `τ`, valid and not revoked | the entry takes `idx2` and its `q`; if the new `q` is 0, the entry is removed |
| (iii) `REVOKED` | `L` has entry `(j, τ, idx, ·)` and `readFeedback(j, L.sender, idx).isRevoked` | the entry is removed |
| (iv-a) `SENDER` | For an `AGENT` row: `getAgentWallet(agentId(u)) ≠ L.sender`. For an `ANCHOR` row: `currentKey(anchorId(u)) ≠ L.sender` | empty row, `sender` = the current value |
| (iv-b) `CONTROLLER` | `L` has an entry for `j`, and `L.sender` is currently a controller of `j` | the entry for `j` is removed |

```
DISPUTE(setId, kind, evidence):
  cur ← current(setId); S ← anchorSet(setId)
  require cur.level = RegistryContested ∧ status(cur) ∉ {STALE, REGISTRY_CHANGED}
  (u, L, proof) ← evidence
  require (rowState[u] = 0 ∧ proof shows rowLeaf(L) ∈ graphRoot) ∨ rowLeaf(L) = rowState[u]
  require ¬L.truncated ∧ ¬capped[u]
  L′ ← APPLY(kind, L, fact)                      // table above; revert if the fact does not hold
  if |L′.entries| > S.policy.rowMax:  L′ ← TRUNCATED
  require rowLeaf(L′) ∉ seen[u]                  // each row state is charged at most once
  Δ ← ⌈‖C(L) − C(L′)‖₁⌉ + ⌈‖D(L) − D(L′)‖₁⌉      // WAD, B⁺ and B⁻ recomputed on L and L′
  if first proof on u:  cap[u] ← ⌈‖C(L⁰)‖₁⌉ + ⌈‖D(L⁰)‖₁⌉ + 2·WAD     // L⁰ = committed row
  if spent[u] + Δ ≥ cap[u]:  Δ ← cap[u] − spent[u];  capped[u] ← true
  spent[u] += Δ
  for a in 1..k:  r[a] += ⌈t[a][u] · ΔA · Δ / (αD · WAD)⌉
  recompute e[a] and eEff; cur.residual ← r; cur.errorBound ← eEff
  seen[u] ∪= {rowLeaf(L′)};  rowState[u] ← rowLeaf(L′)
  emit BoundWidened(setId, nodeKeyOf(u), kind, rowState[u], eEff, fact.index > entry.lastIndex)
```

- **Soundness.** Replacing row `u` by `L′` changes `F^(a)(t)` by at most `(1 − α)·t_u·‖C(L) − C(L′)‖₁` in L1, and `d^(a)` by at most `(1 − α)·t_u·‖D(L) − D(L′)‖₁`. By the triangle inequality, successive states add up. After any sequence of proofs, `t` remains within the widened bound of the fixed point of the graph whose rows are the current row states.
- **Cap.** Two rows `L⁰` and `X` satisfy `‖C(L⁰) − C(X)‖₁ + ‖D(L⁰) − D(X)‖₁ ≤ ‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2`. Once a row has been charged `cap[u]`, it is covered whatever its content, and further proofs on it MUST be rejected. This bounds the widening that any party, including the node's own controller posting new feedback after certification, can inflict on one row.
- **Timing.** Proofs are accepted whether the fact predates the snapshot or not: ERC-8004 does not record when feedback was given. `BoundWidened` reports whether `idx > lastIndex`, so that observers can tell certifier omissions from post-snapshot activity. This has no effect on the bound.
- **Truncated rows.** A proof on a row of `T` MUST be rejected: the truncation margin already covers it.
- **Former owners.** Past ownership cannot be established on-chain. A proof of kind (i) cannot check the "former owner" rule of §3.3, so an edge a certifier correctly rejected under that rule can be re-added by a proof. The only effect is a wider bound, since a proof never raises trust.
- **Ambiguous senders.** Whether a wallet is unique cannot be established on-chain. A row with `sender = address(0)` cannot receive proofs of kind (i), (ii) or (iii).

⟦D6, spec Q1 du tour 2, adaptée à D14 et D16. Écarts avec le CR (voir CHANGES.md) : (ii) exige le MÊME tag, et non « tag1 ∈ filtre » (AM-R6.3) ; (iv) est scindé en (iv-a) émetteur, qui couvre aussi la rotation d'une ancre (AM-R6.22), et (iv-b) contrôleur ; la règle « ancien owner », annoncée comme « contestable par (iv) » en D16, n'est pas prouvable on-chain (AM-R6.4) ; `seen[u]` implémente « une fois par état » ; le plafond `cap[u]` est un ajout R6 contre l'élargissement sans fin (AM-R6.2). Les lignes ne portent que l'avis dominant par destination, comme le solveur. Une représentation par (destination, tag) serait plus précise pour (ii) et (iii), au prix de calldata (AM-R6.11). La démo du 13/10 n'implémente que (i) (découpage AM-2.13).⟧

### 8. Registry versions

The registries are typically upgradeable proxies, and a contract cannot read another contract's implementation slot.

- `versionHash(r) = keccak256(bytes(r.getVersion()))` if the static call succeeds and returns a string, and `bytes32(0)` otherwise.
- Every certificate MUST commit the version hashes of both registries, read in the certifying transaction.
- The contract keeps the last observed pair. `checkRegistry()` is callable by anyone. It reads both hashes, updates the observed pair, and emits `RegistryChanged` for each registry whose hash changed. Every `CERTIFY` performs the same observation.
- A certificate whose committed hashes differ from the observed pair has status `REGISTRY_CHANGED`.
- Certifiers MUST check the registry versions before each certification. Operators SHOULD monitor the registries' ERC-1967 `Upgraded` events off-chain and call `checkRegistry()` when one is emitted.

An upgrade that keeps the same version string is invisible on-chain. See Security Considerations.

⟦D17. `getVersion()` ne fait PAS partie de l'interface ERC-8004 : il existe dans l'implémentation de référence déployée (« 2.0.0 », VÉRIFIÉ 27/09). Une norme chain-agnostique ne peut donc pas l'exiger, d'où le repli `bytes32(0)` et la demande ajoutée à la section Backwards Compatibility (AM-R6.10).⟧

⟦OPEN — désaccord 2 du tour 3 (coût et suffisance de la vérification de version) : B veut vérifier à la certification plus `checkRegistry()`, C juge que c'est de la vivacité par bonne volonté, E veut un event. La synthèse retient les trois, sans protection contre une upgrade qui garde la même version.⟧

### 9. Reading interface

```solidity
enum Status {
    OK,                // certificate current and applicable
    UNKNOWN_SET,       // setId not registered
    NO_CERT,           // no certificate for this set
    STALE,             // block.number − certBlock > policy.maxAge
    REGISTRY_CHANGED,  // committed registry versions differ from the observed ones
    TRANSFERRED,       // ownerOf(agentId) differs from the owner committed for this agent, or reverts
    VETOED,            // at least vetoQuorum anchors currently hold negative feedback on the agent (assess only)
    REGISTRY_ERROR     // a registry call needed for the answer failed (fail closed)
}

enum Reason { NONE, STATUS, VETO, BELOW_THRESHOLD, DISTRUST }

struct TrustView {
    Status  status;
    Level   level;
    uint64  certBlock;
    uint256 trust;         // Σ_a contribution_a, WAD
    uint256 trustRobust;   // leave-(m−1)-anchors-out, WAD
    uint256 distrust;      // WAD
    uint256 errorBound;    // eEff, WAD
}

struct Assessment {
    TrustView view_;
    bool      trusted;
    Reason    reason;
    uint8     vetoCount;
    bytes32   triggerTag;  // keccak256(tag1) of the feedback behind a veto; bytes32(0) otherwise
}

interface IAnchoredReputation /* is IERC165 */ {
    event AnchorSetRegistered(bytes32 indexed setId, address indexed registrant, AnchorSet set, TagSchema[] schema);
    event CertificatePublished(bytes32 indexed setId, uint64 indexed certBlock, Level level,
                               bytes32 graphRoot, bytes32 vectorRoot, uint256 errorBound, address certifier);
    event BoundWidened(bytes32 indexed setId, bytes32 indexed nodeKey, uint8 kind,
                       bytes32 rowState, uint256 errorBound, bool postdatesSnapshot);
    event RegistryChanged(address indexed registry, bytes32 oldVersionHash, bytes32 newVersionHash);

    function registerAnchorSet(AnchorSet calldata set, TagSchema[] calldata schema) external returns (bytes32 setId);
    function anchorSet(bytes32 setId) external view returns (AnchorSet memory set, TagSchema[] memory schema);

    /// Reverts if verification (§6.2) or replacement (§6.3) fails. Encoding of `payload` is implementation-defined.
    function certify(bytes32 setId, Level level, bytes calldata payload) external;
    /// Reverts if the proof is invalid (§7). kind: 1 OMISSION, 2 STALE, 3 REVOKED, 4 SENDER, 5 CONTROLLER.
    function dispute(bytes32 setId, uint8 kind, bytes calldata evidence) external returns (uint256 errorBound);
    function checkRegistry() external returns (bool changed);

    function certificate(bytes32 setId) external view returns (Certificate memory);

    /// MUST NOT revert. Certified values only; performs no veto read.
    function trustOf(uint256 agentId, bytes32 setId) external view returns (TrustView memory);
    /// MUST NOT revert. trustOf + live anchor veto + the set's policy.
    function assess(uint256 agentId, bytes32 setId) external view returns (Assessment memory);
    /// MUST NOT revert. Per-column certified values, for export and audit; empty arrays if unknown.
    function columns(uint256 agentId, bytes32 setId) external view returns (uint256[] memory t, uint256[] memory d);
}
```

**`trustOf`** MUST return, in this order of precedence: `UNKNOWN_SET`, `NO_CERT`, `REGISTRY_CHANGED`, `STALE`, then, for an agent with a committed owner, `TRANSFERRED` if `ownerOf(agentId)` differs or reverts, and `OK` otherwise. An agent outside the certificate's support has `trust = trustRobust = distrust = 0` and status `OK`: *unknown* is expressed as zero trust, not as an error. Every value field MUST be filled even when the status is not `OK`, except under `UNKNOWN_SET` and `NO_CERT`, where they are zero.

**`assess`** MUST compute:

```
ASSESS(agentId, setId):
  v ← trustOf(agentId, setId);  P ← policy(setId)
  if v.status ≠ OK:                         return (v, false, STATUS, 0, 0)
  // live veto: read now, not certified
  vetoes ← 0; trigger ← 0; worst ← 0
  for each anchor a of the set:
     key ← currentKey(anchorId_a)                        // REGISTRY_ERROR if the call fails
     w_a ← combined weight (§3.5) of key's current feedback on agentId, over the Endorsement tags
     if w_a < 0: vetoes += 1; if w_a < worst: worst ← w_a; trigger ← tagHash of that feedback
  if vetoes ≥ P.vetoQuorum:                 v.status ← VETOED; return (v, false, VETO, vetoes, trigger)
  if v.trustRobust < P.threshold + v.errorBound:                        return (v, false, BELOW_THRESHOLD, vetoes, 0)
  if P.rhoDen·(v.distrust + v.errorBound) > P.rhoNum·(v.trustRobust − v.errorBound):
                                                                        return (v, false, DISTRUST, vetoes, 0)
  return (v, true, NONE, vetoes, 0)
```

- A registry or key-registry call that reverts or returns malformed data MUST yield `REGISTRY_ERROR` and `trusted = false`. Neither function may revert.
- A veto takes effect in the block after the anchor's feedback, without recertification. It uses the anchor's current key only.
- Consumers MUST treat any status other than `OK` as untrusted. They MAY apply a stricter threshold or a lower `maxAge` than the set's policy by computing from `TrustView`.
- The storage layout is implementation-defined. `trustOf` MUST be answerable from contract state, without a proof supplied by the caller.

⟦D11 renversée au tour 3 : vecteurs stockés, lecture sans preuve. Le statut `BAD_PROOF` et la lecture à preuve portée du tour 2 disparaissent. `REGISTRY_ERROR` et `Reason` sont des ajouts R6 pour tenir « ne revert jamais » face à un `ownerOf` qui revert (jeton brûlé) ou à un registre indisponible (AM-R6.16). Le veto relit le registre à chaque appel : son coût est proportionnel au nombre d'avis de l'ancre sur l'agent, borné par k ≤ 16 et TAGS_MAX = 8 (estimation de B au tour 3, non mesurée).⟧

⟦OPEN — désaccord 4 du tour 3 (oracle de refus) : `triggerTag` aide l'attaquant selon D, il est indispensable à l'exploitation selon E. La synthèse le retient parce que l'état est public.⟧

⟦OPEN — désaccord 4 du tour 2 (une lecture ou deux) : C voulait un cache lisible sans preuve, B craignait qu'il devienne l'implémentation copiée. Depuis D11 renversée, la lecture stockée EST la lecture normative et le cache disparaît. Le désaccord semble caduc, mais le CR ne le clôt pas : à confirmer au prochain tour (AM-R6.8).⟧

### 10. ERC-165

A conforming aggregator MUST implement [ERC-165](./eip-165.md) and return `true` for the interface ID of `IAnchoredReputation`. An anchor key registry MUST return `true` for the interface ID of `IAnchorKeyRegistry`.

⟦Les identifiants d'interface seront calculés sur l'implémentation de référence une fois les signatures figées.⟧

## Rationale

**Anchors instead of a global score.** Only asymmetric, seed-anchored reputation functions can resist Sybil attacks (Cheng and Friedman, *Sybilproof reputation mechanisms*, 2005). With an absorbing walk restarted at the anchors, the mass that reaches a Sybil region `X` containing no anchor is bounded by the mass crossing its attack edges: `π(X) ≤ ((1 − α)/α) · Σ_{u∉X, v∈X} π(u)·C_uv`. A farm of any size that no anchor-reachable node endorses receives exactly zero. Letting the reader choose the anchors also answers the objection to a single score.

**Personalized PageRank.** Among the classical schemes (EigenTrust 2003, Advogato, SybilGuard/SybilLimit, SybilRank), PPR is the only one with both a formal Sybil bound and a **one-pass certificate**. Advogato's max-flow certificate is binary, and SybilRank relies on early-stopped iterations.

**Share of mass, not a rescaled score.** An earlier draft exposed `t_i · N`, with `N` the number of nodes. `N` is chosen by the certifier and can be inflated for free by registering agents. A share of a unit mass has no free parameter. Every column entry is at most `WAD`, so it fits in 64 bits.

**Absorbing convention.** Sending lost mass back to `p` makes `t` depend non-linearly on `p`. Absorbing it keeps `t = Σ_a λ_a t^(a)` exact. A certificate therefore carries one column per anchor, any weighting is a linear combination, and leave-one-out is computable.

**Separate budgets.** The distrust a region `X` can emit is `(1 − α)·Σ_{u∈X} t_u·Σ_j D_uj ≤ (1 − α)·π(X)`, as long as the rows of `D` sum to at most 1, whether or not `D` shares a budget with `C`. A shared budget would only buy a factor of at most 2, and it would make honest criticism cost endorsement capacity.

**One-hop distrust, anchor veto, leave-one-out.** Distrust that propagates would let a Sybil region smear honest agents through chains of negative feedback. One hop keeps it bounded by the emitter's own trust. A stolen anchor key is used for **approving** Sybils (theft), not for vetoes (denial of service). `trustRobust` with `minAnchors = m` removes the `m − 1` largest per-anchor contributions, so no `m − 1` anchors can make an agent pass alone. Vetoes and distrust fail closed, so they need no such protection.

**One error bound for trust and distrust.** Let `e_t = r/α`. Distrust computed from `t` differs from distrust computed from `t*` by at most `(1 − α)·e_t`. The distrust rows of truncated nodes add at most `Σ_T (1 − α)·t_u ≤ r`, and `r ≤ α·e_t`. So the total distrust error is at most `(1 − α)·e_t + α·e_t = e_t`. This is why the truncation margin is `(1 − α)·t_u`, even though a truncated row hides both an endorsement row and a distrust row. Discrepancy proofs add the change in both rows, which is conservative.

**Growing bound instead of slashing.** ERC-8004 does not record when feedback was given. A proof that "this feedback existed before the certificate" is therefore impossible. With slashing, an attacker could post feedback right after an honest certificate, "prove" an omission and collect the bond. Widening the bound needs no dating, no bond and no challenge window. It remains true for the registry as far as anyone has proven. The permissionless replacement rule stops a sloppy certificate from displacing a precise one.

**Stored vectors, proof-free reads.** A read that requires the payee to supply a Merkle proof would change payment protocols on the provider side and would add a proof service to operate. This ERC fixes the behaviour (`trustOf` answerable without a proof) and leaves the storage layout to implementations. `vectorRoot` is kept for export and audit.

**Normative quantization.** Quantization changes `C`, and therefore the fixed point. If it were left to implementations, two honest certifiers would certify different vectors for the same set. A grid of `10^-4` fits an `int16` and keeps calldata small.

**Tag kinds.** A liveness ping delegates no trust. If measurement feedback propagated, anyone running an automated scanner would manufacture attack edges, and the Sybil bound would be worthless. The kind is part of the committed schema, so no implementation can make it propagate by accident.

**Per-tag edge unit and negative dominance.** Taking "the latest feedback of the pair" lets any later positive feedback under another tag erase a negative one. On the deployment studied, this erased the only useful negative edge (a `−100` under one tag followed by `+1` under another). Keeping the latest feedback per tag, then the worst across tags, is the only combination that is monotone toward refusal.

**Sender resolution.** Merging every agent that shares a wallet would pool the mass of up to hundreds of agents behind one address. Treating an ambiguous sender as an address node, which has no mass, costs nothing to honest agents with a unique wallet.

**Pre-rotated anchor identifiers.** Naming anchors by address makes key rotation require a new set, and therefore a migration by every consumer. Naming them by ERC-8004 `agentId` puts anchors up for sale with the NFT. Pre-rotation, as in the KERI key event model, reconciles immutable sets with rotating keys.

**Three levels.** The same text applies to every chain. Only the level that is economical to maintain differs. `ResidualVerified` proves the fixed point of the committed graph. `RegistryContested` also lets anyone widen the bound against the registry. `Optimistic` proves nothing and names its certifier.

**Prior art.** On-chain verification of an EigenTrust iteration with Merkle challenges appears in the OpenRank proof of concept (Karma3 Labs). A seeded PageRank proven in zero knowledge over EAS attestations appears in the trustgraphs project. This ERC contributes the ERC-8004 graph construction (tag schemas and kinds, per-tag edge unit, sender resolution, controller rejection), reader-chosen anchors with pre-rotation, the growing-bound certificate, and a contract-facing, non-reverting interface.

⟦Références à convertir au format EIP-1 (DOI + métadonnées CSL-JSON, sinon texte sans lien) : Cheng & Friedman 2005 (P2PECON), Kamvar et al. 2003 (EigenTrust), KERI (Smith). Ne PAS présenter la vérification on-chain du point fixe comme nouvelle (CLAUDE.md §6).⟧

## Backwards Compatibility

This ERC requires no change to ERC-8004. Aggregators only read the registries, through `ownerOf`, `getApproved`, `isApprovedForAll`, `getAgentWallet`, `readFeedback`, `readAllFeedback` and `getLastIndex`, plus `getVersion` when it is available. Certifiers additionally read the events `NewFeedback`, `FeedbackRevoked`, `MetadataSet`, `Registered` and `Transfer`.

**Requested for a future ERC-8004 revision.** Each request removes a limitation stated in Security Considerations:

1. **Record `block.number` with each feedback.** This would make omissions, key rotations and transfers datable, allow discrepancy proofs to be restricted to facts that predate the snapshot, and allow reputation received before a transfer to be separated from reputation received after it.
2. **Extend the `giveFeedback` guard to `agentWallet`.** The current guard rejects the owner and approved operators, but not the agent's own wallet.
3. **Make `agentWallet` unique and add a reverse lookup.** This would make sender resolution verifiable on-chain. ⟦Une v2.1.0 en ce sens existe en amont, branche `feat/unique-reverse-lookup`, non déployée au 27/09 (VÉRIFIÉ source).⟧
4. **Timelock registry upgrades.** Upgrades should be announced on-chain, with a delay, before they take effect.
5. ⟦Proposition R6, hors CR :⟧ **Standardize `getVersion()`** in the ERC-8004 interfaces, so that aggregators can commit to a registry version without relying on an implementation detail.

If the registries change the semantics of `agentWallet` or of `feedbackIndex`, existing certificates become `REGISTRY_CHANGED` (§8), and sets need recertification under an updated version of this ERC.

⟦D17, tour 3 Q3 C. Demande 1 déjà présente dans le draft du 21/09. Demandes 2 à 4 ajoutées par le tour 3. Aucune ne sera en place le 13/10 : le produit fonctionne sans elles (relecture E→C).⟧

## Test Cases

The test vectors are **normative**. Two conforming implementations MUST produce the same quantized weights, the same graph, and the same `graphRoot` for the same registry state and anchor set. For a given submitted `t`, they MUST produce the same `r`, `e`, `d`, statuses and assessments. The vectors are published as JSON in `../assets/erc-TBD/vectors/`. Each vector gives its inputs (registry state as a list of feedback and identity facts, anchor set, schema) and its expected outputs. Exact rational values are given below; WAD values are floors.

⟦Les fichiers de vecteurs seront produits par le solveur R4 (solver/) et rejoués par les tests Foundry R5 (contracts/). À la date de ce texte, solver/FORMAT.md et contracts/ENCODING.md n'existent pas encore : le format JSON reste à aligner. Les valeurs ci-dessous ont été calculées en rationnels exacts le 27/09 (script jetable), pas encore rejouées par le solveur ni par le contrat.⟧

### TC-1 Quantization (§3.4)

Schema `starred`: min 0, neutral 50, max 100. `vouch`: min 0, neutral 0, max 1. `slash`: min −100, neutral 0, max 0. `review`: min −1, neutral 0, max 1. `third`: min 0, neutral 0, max 3. `minusthird`: min −3, neutral 0, max 0. All bounds are WAD-scaled.

| tag | value | decimals | expected `q` |
|---|---|---|---|
| starred | 87 | 0 | 7400 |
| starred | 33 | 0 | −3400 |
| starred | 4999 | 2 | −2 |
| starred | 5001 | 2 | 2 |
| starred | 1e38 | 0 | invalid (discarded, not clamped) |
| vouch | 1 | 0 | 10000 |
| slash | −100 | 0 | −10000 |
| review | 1 | 0 | 10000 |
| third | 1 | 0 | 3333 (truncated toward zero) |
| minusthird | −1 | 0 | −3333 (toward zero, not −3334) |

### TC-2 Edge unit and dominance (§3.5)

- Client `c` (unique wallet of agent 18) about agent 4: `slash −100` (index 1), then `review +1` (index 2). Expected: one edge of weight `−10000`, recorded feedback index 1. Under the superseded rule "latest feedback of the pair", the edge would be `+10000`. ⟦Cas réel mainnet (0xea0b… → #4), MESURÉ 27/09 : c'était la seule arête négative utile du registre.⟧
- Same client: `vouch 1` (index 1), `vouch 0` (index 2). Expected: no edge (current `vouch` is neutral).
- Same client: `vouch 1` (index 1), `vouch 1` revoked (index 2). Expected: weight `10000`, index 1 (a revoked feedback does not supersede).
- Same client: `vouch 1` (index 1), `vouch 5` (index 2, out of range). Expected: weight `10000`, index 1 (an invalid feedback does not supersede).

### TC-3 Tag kinds (§3.1)

A scanner address that is the unique wallet of an agent posts `uptime` (kind `Measurement`) feedback on 10 agents. Expected: no edges from the scanner, and the scanner node has no row. ⟦Cas réel : scanner noté sur des agents de la ferme, MESURÉ 27/09. Le classement de `trust` / `oracle-screening` en `measurement` est un choix du schéma de référence ANCRE, pas un fait.⟧

### TC-4 Sender resolution and rejection (§3.2, §3.3)

- Wallet `w` is `agentWallet` of agents 7 and 8. Feedback from `w` on agent 9. Expected: edge from the `ADDRESS` node of `w`, which has zero trust. Agents 7 and 8 have no out-edge.
- Agent 5's `agentWallet` posts `vouch 1` on agent 5. Expected: rejected (controller). ⟦Cas réel : 78 avis d'un agent par son propre agentWallet, MESURÉ 27/09.⟧
- Agent 6 transferred from `o1` to `o2`; `o1` then posts `vouch 1` on agent 6. Expected: rejected (former owner).
- Anchor `A` has current key `k`, and `k` is also the unique `agentWallet` of agent 11. Feedback from `k` on agent 12. Expected: the edge is on `A`'s row only; agent 11 has no out-edge from it. ⟦Choix R6, diverge du solveur actuel (AM-R6.14).⟧
- Anchor `A` rotated from `k0` to `k1`. Earlier feedback from `k0` on agent 12. Expected: ignored.

### TC-5 Reference graph: absorbing mass, separate budgets, linearity, leave-one-out (§3.6, §4)

`α = 1/3`, anchors `A1`, `A2` with `λ = (1/2, 1/2)`, `minAnchors = 2`. Edges (quantized):
`A1 → 1 : 10000`; `A2 → 1 : 10000`; `A2 → 2 : 10000`; `1 → 3 : 5000`; `2 → 3 : −10000`.

Row budgets: `B⁺(A1) = 10000`, `B⁺(A2) = 20000`, `B⁺(1) = 10000` (so half of agent 1's mass is absorbed), `B⁻(2) = 10000`.

| | `t^(A1)` | `t^(A2)` | `d^(A1)` | `d^(A2)` |
|---|---|---|---|---|
| A1 | 1/3 | 0 | 0 | 0 |
| A2 | 0 | 1/3 | 0 | 0 |
| agent 1 | 2/9 (222222222222222222) | 1/9 (111111111111111111) | 0 | 0 |
| agent 2 | 0 | 1/9 | 0 | 0 |
| agent 3 | 2/27 (74074074074074074) | 1/27 (37037037037037037) | 0 | 2/27 |

Total mass of column `A1`: `17/27 < 1` (absorbing). Expected set values:

| agent | trust | trustRobust (m = 2) | distrust |
|---|---|---|---|
| 1 | 1/6 (166666666666666666) | 1/18 (55555555555555555) | 0 |
| 2 | 1/18 | 0: endorsed by one anchor only | 0 |
| 3 | 1/18 | 1/54 (18518518518518518) | 1/27 (37037037037037037) |

With `θ = 0.01 WAD`, `ρ = 1/2` and an exact submission (`eEff` = rounding only): agent 1 is `trusted`; agent 2 fails with `BELOW_THRESHOLD`; agent 3 fails with `DISTRUST`.

Linearity check: the set `{A1}` alone (`λ = 1`, `minAnchors = 1`) MUST give `trust(1) = 2/9`, equal to column `A1` above.

### TC-6 Residual and truncation (§6.2)

- Submitting TC-5's floors MUST yield per-column residuals equal to the rounding terms only (at most `nnz + 1` per column plus the floor gaps). The expected integers are in the vector file.
- Truncating agent 1 in TC-5 MUST contribute a margin term of `⌈t^(a)_1 · 2/3⌉` to `r_a` (so `4/27` to `r_A1` and `2/27` to `r_A2`). The residual also includes the mismatch on agent 3, whose `F` no longer receives agent 1's mass unless the certifier resubmits `t_3`.
- A row with `rowMax + 1` entries MUST be rejected unless it is truncated.
- A weight off the grid (`|q| > 10000`, or `q = 0` in a row entry) MUST be rejected.

### TC-7 Discrepancy proof and widening (§7)

On TC-5 certified at level `RegistryContested`, agent 1's wallet has also posted `vouch 1` on agent 2 (a valid feedback absent from row 1). Proof of kind `OMISSION`:
- new row 1: `1 → 3 : 5000`, `1 → 2 : 10000`, `B⁺ = 15000`; `Δ = |1/2 − 1/3| + 2/3 = 5/6`;
- `r_A1 += (2/3)·(2/9)·(5/6) = 10/81`; `r_A2 += (2/3)·(1/9)·(5/6) = 5/81`;
- `eEff` grows by `(1/2)·(10/27) + (1/2)·(5/27) = 5/18` (277777777777777777 WAD).

Resubmitting the same proof MUST revert (state already charged). Agent 1's `assess` becomes `BELOW_THRESHOLD`: one proven omission lowers everyone's verdict. This is the intended behaviour of a global bound (see ⟦OPEN⟧ §4).

Cap: repeated proofs on row 1 MUST stop widening once the row has been charged `‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2 = 5/2` (in units of Δ).

### TC-8 Statuses and veto (§9)

- `UNKNOWN_SET`, `NO_CERT`: as named, with zeroed values and no revert.
- `STALE`: at `certBlock + maxAge + 1`.
- `TRANSFERRED`: after `transferFrom` of agent 1; `ownerOf` reverting (burned token) also yields `TRANSFERRED`.
- `REGISTRY_CHANGED`: the registry version string changes and `checkRegistry()` is called; `RegistryChanged` is emitted.
- `VETOED`: `A2`'s current key posts `slash −100` on agent 1. In the next block, `assess(1)` returns `VETOED`, `vetoCount = 1`, `triggerTag = keccak256("slash")`, with no recertification. Then `A2` posts `review +1` on agent 1: the result stays `VETOED` (negative dominance). After `A2` revokes the slash, it returns to `trusted`.
- Leave-one-out: if `A1`'s key is compromised and endorses a fresh Sybil agent `X` (`A1 → X : 10000`), then after recertification `trustRobust(X) = 0` and `assess(X)` fails with `BELOW_THRESHOLD`.

### TC-9 Mainnet replay (informative)

Replay of the deployment studied in Motivation, at a fixed block, with the reference schema (`vouch`, `review`, `slash` endorsement) and any anchor set that does not endorse the farm. Expected: the farm's target has `trust = 0`, and at most 3 edges survive. ⟦MESURÉ 27/09 au bloc ≈ 108,43 M ; registre sans nouvel avis depuis le bloc 103 696 240 (2026-09-10). Informatif : dépend d'un état de chaîne, pas de la norme.⟧

## Reference Implementation

⟦ANCRE, dépôt privé jusqu'à décision de Hugo :
- `contracts/`: `AnchoredReputation.sol` au niveau ResidualVerified (k colonnes jointes, table de nœuds append-only, vecteurs tassés 4 × uint64 par slot, `vectorRoot`, `assess`), preuve (i) OMISSION seulement pour la démo. Chantier R5, en cours le 27/09.
- `solver/`: solveur PPR hors chaîne en Python, arithmétique entière identique au contrat. Chantier R4, en cours le 27/09.
- Indexeur (R7), `TrustGatedRouter` d'exemple (R8).
Déploiement et coûts : AUCUN chiffre de gas dans ce texte avant `forge test --gas-report`. Cible ESTIMÉE au tour 3 : ≈ 320 gas par arête au plancher de calldata (≈ 8 octets par arête). L'estimation de 350-400 gas par arête du 21/09 était fausse d'un facteur 4 à 7 (AM-3.6).
À remplacer, avant soumission, par un lien vers les fichiers dans `../assets/erc-TBD/`.⟧

## Security Considerations

**Anchor-set parameters.**
- **`minAnchors` MUST be at least 2 for any set used to authorize a transfer of value**, and implementations MUST compute `trustRobust` and `assess` as specified. With `minAnchors = 1`, one stolen anchor key suffices to make a Sybil agent pass. With `minAnchors ≥ 2` and `vetoQuorum = 1`, a stolen key yields at most a denial of service (vetoes, distrust, loss of the endorsements it held), never a payment to a Sybil the other anchors do not endorse.
- A stolen current key can veto, criticize and withdraw endorsements until the anchor rotates. Rotation requires the pre-committed next key, which anchors SHOULD keep offline and SHOULD NOT have used anywhere else.
- Consumers SHOULD read a set's `metadataURI` and schema before relying on it. A set with a lax schema (for example, measurement tags declared as endorsements) is valid but leaks trust. There are no default sets.

⟦OPEN — désaccord 3 du tour 2 (m = 2 contre goulot d'intégration) : E n'accepte m = 2 qu'avec le motif « consommateur-ancre » (le client note ceux qui ont livré) ; C objecte que le client devient la cible de corruption, et qu'un client plus une ancre complaisante suffisent. Le texte recommande m = 2 et mentionne le motif sans le trancher.⟧

**Consumer-as-anchor.** A consumer MAY be one of the anchors of the sets it uses, and rate the providers that delivered. Combined with `minAnchors ≥ 2`, a consumer alone never suffices to make a provider pass.

**Completeness and watchers.** ERC-8004 indexes feedback by `(agentId, client)`, not by client, and does not date it. The completeness of a committed row cannot be verified on-chain; it can only be contested. An omission nobody proves stays invisible. The party with an interest in proving it is the consumer about to pay, and a proof costs one transaction per row. There is no reward. A certifier can also front-run a precise certificate with one of equal `eEff` that omits a negative edge; only a discrepancy proof reveals it.

**Global bound.** Widening is global. One proven discrepancy on a high-trust row can make every agent of the set fail its threshold until recertification. This is fail-closed by design and it is also a lever for denial of service. The per-row cap (§7) bounds it, and permissionless recertification ends it.

**Liveness dependency.** Every consumer that fails closed depends on someone recertifying before `maxAge`. Certification is permissionless, so a consumer that runs the published indexer and solver can recertify itself.

⟦OPEN — désaccord 1 du tour 2 (dépendance de vivacité, AM-2.12) : E exige un mode dégradé ; A et D refusent tout mode qui paie sans certificat frais. Le texte ne définit aucun mode dégradé.⟧

**Agent transfers and reputation purchase.** ERC-8004 clears `agentWallet` on transfer, so a transferred agent loses its outgoing edges until the new owner re-verifies a wallet. Its incoming reputation is paused (`TRANSFERRED`) until recertification. The recertifier then decides what to reintegrate: since feedback is undated, reputation received before the transfer cannot be separated on-chain from reputation received after it. Buying a reputable agent therefore costs a pause, not a reset. Anchors can react with a veto.

⟦OPEN — désaccord 2 du tour 2 (rachat de réputation) : D juge la pause inutile, car elle ne coûte qu'un délai ; B et C disent qu'on ne peut rien faire de mieux sans bloc dans le registre. La seule vraie solution est la demande 1 à ERC-8004.⟧

**Registry governance.** The registries studied are upgradeable proxies controlled by a single externally owned account, with no timelock *(verified 2026-09-27 on the deployment of Motivation)*. Their owner can change any semantics this ERC relies on. The committed version hash detects a version change only if the version string changes, and only once someone calls `checkRegistry()` or certifies. An upgrade that keeps the version string is detectable only off-chain, through `Upgraded` events. Consumers of high-value flows SHOULD monitor those events.

**Guard bypass and shared wallets.** The ERC-8004 guard does not cover `agentWallet` or former owners (78 self-ratings observed; former owners regain the right to rate after each transfer). §3.3 rejects both, but the former-owner rule is enforced off-chain only (§7). Wallet uniqueness is established off-chain. A certifier that wrongly declares a unique wallet ambiguous silences that agent's outgoing edges, and no on-chain proof can contest it.

**Permanent negatives.** Negative feedback dominates until its author revokes it, and only its author can revoke it. If the author loses its key, the negative is permanent. The provider's recourse is out of protocol, through ERC-8004 `appendResponse`, and the consumer's choice of set.

⟦OPEN — désaccord 1 du tour 3 (négatif permanent) : A et E veulent une échéance ou une levée ; D refuse toute échéance (l'attaquant attendrait l'expiration). Rien n'est tranché : la révocation par l'auteur reste le seul mécanisme.⟧

**Refusal oracle.** `triggerTag` tells a caller which tag caused a veto. The state is public anyway.

**Measurement leakage.** A set that declares an automated measurement tag as `Endorsement` recreates attack edges (see Motivation). Reference schemas SHOULD classify every tag posted by automated monitors as `Measurement`.

**Payment is not honesty.** Payment-backed feedback raises cost but does not prevent self-funded rings, as observed on-chain. Payment MUST NOT be used as an edge weight or as a pass condition in the core algorithm. It MAY be an edge filter (§3.7).

**Rounding.** All divisions are floored for trust (with the count of divisions added to the residual) and rounded up for distrust and error terms, so rounding never favours passing.

**Gas and denial of service.**
- `certify` is linear in the number of committed edges times the number of columns. Implementations MUST bound calldata per transaction.
- Rows are bounded by `rowMax`. Larger rows are truncated at the cost of the margin `(1 − α)·t_u`. An anchor's own row with more than `rowMax` endorsements would be truncated at a margin of about `(1 − α)·α` per column, which saturates the bound. Anchors SHOULD keep their rows within `rowMax`.
- `assess` makes external calls proportional to the number of anchors and to each anchor's feedback on the agent. Only the anchors control that count.
- Consumers SHOULD call `assess` with an explicit gas limit, and treat an out-of-gas as untrusted.
- An append-only node table grows only with support nodes, and entering the support requires trust mass.

**Same chain.** All reads of registry state are same-chain. Cross-chain use of certificates (through `vectorRoot`) is out of scope, and would reintroduce trust in a bridge.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).

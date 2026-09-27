# Envio : HyperIndex, HyperSync, HyperRPC, Envio Cloud

> Vague 1 de recherche documentaire, **2026-09-27**. Source : docs.envio.dev, lue en markdown brut (chaque page existe en `.md`, index : https://docs.envio.dev/llms.txt), envio.dev/pricing, GitHub enviodev, plus des mesures faites depuis la machine (curl, `cast`).
> Légende : **DOC** = écrit dans la doc officielle · **EXEMPLE** = observé dans un dépôt tiers · **MESURÉ** = testé par nous le 27/09 · **AUTO-DÉCLARÉ** = chiffre d'un tiers non vérifié · **ESTIMÉ** = calcul de notre part · **NON TROUVÉ**.
> Sert au chantier `docs/chantiers/03-indexeur.md` et au bounty « Best Use of Envio » (`docs/conseil/bounties-sponsors.md`).

---

## 0. L'essentiel en 12 lignes

1. **Monad mainnet (143) et testnet (10143) sont supportés** par HyperSync, HyperRPC et HyperIndex, sans passer par un RPC (DOC). HyperSync suit la tête de chaîne à ~1 bloc près (MESURÉ).
2. **Il faut un token API** pour HyperSync et HyperRPC. Sans token, on reçoit un 401 (MESURÉ). Le token est **gratuit**, mais on ne peut le créer qu'**à la main**, avec un compte GitHub, sur https://envio.dev/app/api-tokens (DOC). **Exception** : un indexeur déployé sur Envio Cloud n'a pas besoin de token (DOC).
3. HyperIndex **v3.13.0** est sortie le 23/09/2026 (GitHub). Sur npm, le tag `latest` est encore 3.12.1 (MESURÉ). Prérequis : Node ≥ 22 (24 recommandé pour le Cloud), pnpm, Docker (Postgres + Hasura en local).
4. Un seul indexeur peut couvrir plusieurs chaînes (liste `chains:`). Le mode `disable_default_cross_chain: true` rend les entités propres à chaque chaîne, et `@crossChain` marque celles qu'on veut partager (DOC, v3.6+).
5. Les appels on-chain depuis un handler passent par l'**Effect API** (`createEffect` + viem), avec cache et limite de débit (DOC). Sur Monad, l'état historique n'est **pas** lisible au-delà de ~40 k blocs : il faut reconstruire depuis les **events**, pas depuis `eth_call` (doc Monad).
6. Les **reorgs sont gérées automatiquement**, par défaut jusqu'à 200 blocs, et leur détection est garantie avec HyperSync (DOC).
7. **Les registres 8004 ont du bytecode sur 20 chaînes mainnet testées, dont 19 ont HyperSync** (MESURÉ). Taiko n'a pas HyperSync : il faudrait passer par RPC.
8. ⚠️ **Correction du CLAUDE.md §3** : ERC-8004 v2.0.0 **est déployé sur Monad testnet**, aux adresses « testnet » `0x8004A818…` / `0x8004B663…`, avec au moins 1 001 agents (MESURÉ). Seules les adresses *mainnet* manquent sur le testnet.
9. **Envio Cloud gratuit (plan Development)** : 3 indexeurs par organisation, durée de vie de 30 jours, soft limit de **100 000 events** (DOC). Base (~490 k avis) et BSC (~330 k agents) la font sauter (AUTO-DÉCLARÉ, 8004scan). Monad seul tient dedans (ESTIMÉ, ~40 k events).
10. Envio fournit des **skills Claude Code** (`envio skills update` → `.claude/skills/`), un serveur MCP de docs et `envio tools search-docs` (DOC).
11. **Concurrent direct sur le bounty** : `Sireadell/headwater-indexer` (EXEMPLE). C'est un indexeur Envio des registres 8004 de Monad + AUSD, construit pour Metropolis (provenance de financement, recoupement Nansen). Il a été poussé le 23/09.
12. Licence : l'EULA d'Envio **n'est pas open source** (reconnu par Envio). L'auto-hébergement est autorisé, mais pas la concurrence avec Envio Cloud (DOC). Ça ne pose pas de problème pour nous.

---

## 1. Support de Monad et endpoints

| Produit | Monad mainnet (143) | Monad testnet (10143) | Statut |
|---|---|---|---|
| HyperSync | `https://monad.hypersync.xyz` ou `https://143.hypersync.xyz` | `https://monad-testnet.hypersync.xyz` ou `https://10143.hypersync.xyz` | DOC ([networks](https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks.md)) |
| HyperRPC | `https://monad.rpc.hypersync.xyz` ou `https://143.rpc.hypersync.xyz` | `https://monad-testnet.rpc.hypersync.xyz` ou `https://10143.rpc.hypersync.xyz` | DOC ([networks](https://docs.envio.dev/docs/HyperRPC/hyperrpc-supported-networks.md)) |
| HyperIndex | natif via HyperSync, sans `rpc` à fournir | idem | DOC ([supported chains](https://docs.envio.dev/docs/HyperIndex/supported-networks.md)) |
| `envio init` (import depuis un explorateur) | `-b monad` | `-b monad-testnet` | DOC ([CLI](https://docs.envio.dev/docs/HyperIndex/cli-commands.md)) |

Mesures du 2026-09-27 vers 21:18 UTC :
- `GET https://monad.hypersync.xyz/height` → `{"height":108570507}` au moment où `rpc.monad.xyz` renvoyait 108570508. **Retard d'un bloc.** Côté testnet : 66231157 contre 66231158. **`/height` répond sans token.**
- `POST https://monad.hypersync.xyz/query` sans token → **HTTP 401** `"Your token is malformed. API Tokens can be created at https://app.envio.dev/api-tokens"`.
- `POST https://143.rpc.hypersync.xyz` (`eth_blockNumber`) sans token → **HTTP 401**, même message.
- La page de doc des tiers annonce que les niveaux de service (« Tier ») seront bientôt rendus publics, mais n'en donne aucun pour Monad (NON TROUVÉ).

**Token** (DOC, [api-tokens](https://docs.envio.dev/docs/HyperSync/api-tokens.md), [quickstart-with-ai](https://docs.envio.dev/docs/HyperIndex/quickstart-with-ai.md)) :
- Un token est obligatoire pour HyperSync et HyperRPC. Il se crée sur https://envio.dev/app/api-tokens après connexion (GitHub). Il **ne peut pas être créé de façon programmatique**.
- Il se place dans `ENVIO_API_TOKEN` (`.env` de l'indexeur). HyperSync le reçoit en bearer, HyperRPC le reçoit **dans l'URL** (`https://143.rpc.hypersync.xyz/<token>`).
- On en a besoin pour le dev local et l'auto-hébergement, **pas sur Envio Cloud**. Si l'indexeur n'utilise qu'un RPC externe, on peut s'en passer (chaîne vide).
- Limite de débit : chaque token a un **budget par fenêtre de 60 s, partagé entre toutes les chaînes**, compté en « unités » et non en requêtes. Au-delà, on reçoit un 429. Les clients streaming attendent alors et réessaient. Les headers `x-ratelimit-*` indiquent le budget restant.
- Plans HyperSync (DOC, [pricing/hypersync](https://envio.dev/pricing/hypersync), lu via un résumé WebFetch) : **Free à 0 $, limite « fair use »** ; Starter à 70 $/mois pour 100 rpm (burst 250) ; Pro à 480 $/mois pour 1 000 rpm ; Custom. « Toutes les données de toutes les chaînes, sans limite stricte de volume. »
- **Action humaine requise** : Hugo (ou un membre de l'équipe) doit créer le token. Nous ne l'avons pas fait, conformément à la consigne.

---

## 2. HyperIndex

### 2.1 Version, prérequis, licence
- **Dernière release : v3.13.0, publiée le 2026-09-23T11:48Z** (https://github.com/enviodev/hyperindex/releases). Les précédentes : 3.12.1 le 18/09 et 3.12.0 le 16/09. Sur npm, `envio` a `latest = 3.12.1` et `next = 3.13.0` (MESURÉ, registry.npmjs.org). → **Épingler une version exacte**, puisque le Cloud refuse `~`, `^`, `latest` et `workspace:*` (DOC, [deployment](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment.md)).
- Prérequis (DOC, [quickstart](https://docs.envio.dev/docs/HyperIndex/quickstart.md)) : Node ≥ 22 (le Cloud recommande ≥ 24), pnpm (recommandé), Docker ou Podman pour le local. Sous Windows, WSL est obligatoire.
- Machine d'Hugo (MESURÉ) : Node v24.21.0 et Docker 29.8.0 sont installés.
- Licence : EULA propriétaire, « public and open » mais **pas OSI**. Elle autorise l'auto-hébergement et interdit de concurrencer Envio Cloud (DOC, [licensing](https://docs.envio.dev/docs/HyperIndex/licensing.md)).

### 2.2 Structure d'un projet et commandes
```
config.yaml        # chaînes, contrats, events (schéma : node_modules/envio/evm.schema.json)
schema.graphql     # entités → tables Postgres → API GraphQL (Hasura)
src/handlers/      # handlers TypeScript, auto-découverts (V3)
.env               # ENVIO_API_TOKEN=...
.envio/            # code généré (V3) — relancer codegen après chaque modif de config/schema
```
| Commande | Rôle | Source |
|---|---|---|
| `pnpx envio init` | Assistant interactif : Contract Import (explorateur ou ABI locale) ou Template (`greeter`, `erc20`, `feature-external-calls`, `feature-factory`). Détecte un agent et imprime alors des consignes adaptées aux IA | DOC [quickstart](https://docs.envio.dev/docs/HyperIndex/quickstart.md) |
| `envio init contract-import local -a abi.json --contract-name X -b monad --single-contract --all-events` | Initialisation non interactive | DOC [CLI](https://docs.envio.dev/docs/HyperIndex/cli-commands.md) |
| `pnpm codegen` (`envio codegen`) | Régénère les types après une modification de `config.yaml`, `schema.graphql` ou d'une ABI | DOC |
| `pnpm dev` (`envio dev`) | Lance Postgres et Hasura (Docker) puis l'indexeur, avec rechargement à chaud des handlers. **En V3, ne remet plus la base à zéro** : il faut passer `-r` | DOC [running-locally](https://docs.envio.dev/docs/HyperIndex/running-locally.md) |
| `envio start [-r]` | Mode production (codegen automatique) | DOC |
| `envio stop` | Supprime la base et arrête Docker | DOC |
| `envio local docker up/down`, `envio local db-migrate up/down/setup` | Gestion de l'environnement local | DOC |
| `envio config view` | Affiche la config résolue en JSON | DOC |
| `envio metrics` | Métriques Prometheus | DOC [observability](https://docs.envio.dev/docs/HyperIndex/observability.md) |
| `pnpm test` | `createTestIndexer()` + Vitest, avec des events synthétiques et sans réseau | DOC [testing](https://docs.envio.dev/docs/HyperIndex/testing.md) |

- Hasura en local : http://localhost:8080, admin secret `testing` (DOC, [navigating-hasura](https://docs.envio.dev/docs/HyperIndex/navigating-hasura.md)). Un endpoint Cloud a la forme `https://indexer.dev.hyperindex.xyz/<deployment-id>/v1/graphql` (DOC, [common-issues](https://docs.envio.dev/docs/HyperIndex/common-issues.md)). Les souscriptions WebSocket sont disponibles (DOC, [websockets](https://docs.envio.dev/docs/HyperIndex/websockets.md)).
- Stockage : Postgres par défaut. **ClickHouse en option (expérimental)**, par entité via `@storage`, mais uniquement sur le plan Dedicated côté Cloud (DOC, [configuration-file](https://docs.envio.dev/docs/HyperIndex/configuration-file.md)).

### 2.3 Extraits de config minimaux (ANCRE)

Signatures d'events reprises **telles quelles** des sources vérifiées des registres v2.0.0 (`ReputationRegistryUpgradeable.sol` et `IdentityRegistryUpgradeable.sol`, récupérés au tour 3). `Transfer`/`Approval` viennent d'ERC-721, et `Upgraded` d'ERC-1967.

```yaml
# yaml-language-server: $schema=./node_modules/envio/evm.schema.json
name: ancre-indexer
disable_default_cross_chain: true      # entités par chaîne, clé primaire (id, chainId)
address_format: lowercase              # jointures simples avec le solveur
contracts:
  - name: IdentityRegistry
    events:
      - event: "Registered(uint256 indexed agentId, string agentURI, address indexed owner)"
      - event: "MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)"
      - event: "URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)"
      - event: "Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
      - event: "Upgraded(address indexed implementation)"
  - name: ReputationRegistry
    events:
      - event: "NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)"
      - event: "FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)"
      - event: "ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)"
      - event: "Upgraded(address indexed implementation)"
chains:
  - id: 143                      # Monad mainnet — HyperSync natif, pas de rpc requis
    start_block: 0               # HyperSync saute directement au 1er bloc utile
    contracts:
      - name: IdentityRegistry
        address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"   # proxy, pas l'implémentation
      - name: ReputationRegistry
        address: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
  - id: 10143                    # Monad testnet — adresses "testnet" de 8004 (MESURÉ)
    start_block: 0
    contracts:
      - name: IdentityRegistry
        address: "0x8004A818BFB912233c491871b3d84c89A494BD9e"
      - name: ReputationRegistry
        address: "0x8004B663056A597Dffe9eCcC1965A193B7388713"
  # - id: 42161 / 10 / 137 ...   mêmes adresses que 143 (voir §8)
```
- Le nom d'event `Transfer` doit être unique par contrat, ce qui ne pose pas de problème ici. Si deux signatures portent le même nom, `name:` permet de les renommer (DOC).
- À partir de v3.9, une même adresse peut être déclarée sous plusieurs contrats (DOC). Pratique pour décoder le proxy à la fois avec l'ABI ERC-1967 et avec l'ABI métier, mais pas nécessaire si on met `Upgraded` dans la même définition, comme ci-dessus.
- Champs de bloc et de transaction : ils sont minimaux par défaut (`number`, `timestamp`, `hash`). Depuis v3.7, on demande ce qu'il faut via `fields: { transaction: ["hash","from"] }` dans `onEvent` (DOC, [event-handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers.md)). `event.logIndex` est toujours présent, ce qui est utile pour ordonner plusieurs `MetadataSet` dans un même bloc.

### 2.4 Schéma, entités dérivées et agrégées
DOC, [schema](https://docs.envio.dev/docs/HyperIndex/schema.md) :
- Chaque type a un `id` obligatoire (`ID!`, `String!`, `Int!` ou `BigInt!`, ces deux derniers depuis v3.5). Scalaires : `BigInt`, `BigDecimal`, `Bytes`, `Timestamp`, `Json`, enums.
- Relations : `b: B!` côté enfant, qu'on remplit avec `b_id` dans le handler. `[X!]! @derivedFrom(field: "…")` est un champ virtuel inverse.
- `@index` ne sert que pour les filtres GraphQL : les index utilisés par `getWhere` sont créés automatiquement depuis v3.5.
- `@internal` (v3.8+) : entité stockée mais absente de l'API. Adapté aux curseurs et aux agrégats intermédiaires.
- **Il n'existe pas de vue ni d'agrégat déclaratif** (NON TROUVÉ) : on maintient les agrégats à la main dans les handlers (`get` → calcul → `set`). C'est exactement ce que valorise le critère « entités dérivées ou agrégées » du bounty.

Idée de schéma côté ANCRE (à valider avec le chantier 04) :
```graphql
type Agent { id: ID!  owner: String!  wallet: String  feedbacks: [Feedback!]! @derivedFrom(field: "agent") }
type OwnerChange { id: ID!  agent: Agent!  from: String!  to: String!  blockNumber: BigInt!  logIndex: Int! }
type Feedback { id: ID!  agent: Agent!  client: String! @index  feedbackIndex: BigInt!  value: BigInt!
                valueDecimals: Int!  tag1: String!  tag2: String!  revoked: Boolean!  blockNumber: BigInt! }
type Edge { id: ID!  client: String!  agent: Agent!  tag1: String!  lastFeedback: Feedback!  selfFunded: Boolean! } # D14 : dernier avis non révoqué par (client, agent, tag1)
type WalletAgents { id: ID!  agentIds: [String!]!  count: Int! }   # D16 : index wallet → agents
type ChainStats @crossChain { id: ID!  feedbacks: Int!  revoked: Int!  distinctClients: Int! }
```

### 2.5 Handlers
DOC, [event-handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers.md) :
```ts
import { indexer } from "envio";
indexer.onEvent({ contract: "ReputationRegistry", event: "NewFeedback" }, async ({ event, context }) => {
  const id = `${event.params.agentId}-${event.params.clientAddress}-${event.params.feedbackIndex}`;
  context.Feedback.set({ id, agent_id: event.params.agentId.toString(), client: event.params.clientAddress,
    feedbackIndex: event.params.feedbackIndex, value: event.params.value, valueDecimals: Number(event.params.valueDecimals),
    tag1: event.params.tag1, tag2: event.params.tag2, revoked: false, blockNumber: BigInt(event.block.number) });
});
```
- API : `context.X.get`, `getOrThrow`, `getOrCreate`, `getWhere({champ: {_eq|_gt|_in…}})` (multi-champs depuis v3.2), `set`, et `deleteUnsafe`, expérimental.
- Plusieurs handlers peuvent porter sur un même event, chacun avec son filtre `where` (v3.4+). L'`await` au niveau supérieur du module est permis.
- **Preload optimization toujours active en V3 : chaque handler s'exécute DEUX fois.** Il ne faut jamais appeler `fetch` ou un RPC directement : on passe par `context.effect`, ou on protège l'appel avec `context.isPreload` (DOC, [preload-optimization](https://docs.envio.dev/docs/HyperIndex/preload-optimization.md)).
- Le `tag1` indexé n'arrive dans `event.params` que sous forme de hash (`indexedTag1`), mais la signature v2 **réémet `tag1` en clair** dans les données non indexées. On lit donc `event.params.tag1`.

### 2.6 Effect API : appels RPC depuis un handler (lire `readFeedback` / `getAgentWallet`)
DOC, [effect-api](https://docs.envio.dev/docs/HyperIndex/effect-api.md) et [contract-state](https://docs.envio.dev/docs/HyperIndex/contract-state.md) :
```ts
import { createEffect, S } from "envio";
import { createPublicClient, http } from "viem";
const client = createPublicClient({ transport: http(process.env.ENVIO_MONAD_RPC, { batch: true }) });
export const readFeedback = createEffect({
  name: "readFeedback",
  input: { agentId: S.bigint, client: S.string, index: S.bigint, blockNumber: S.bigint },
  output: { value: S.bigint, valueDecimals: S.number, isRevoked: S.boolean },
  rateLimit: { calls: 20, per: "second" },   // rpc.monad.xyz = 25 rps
  cache: true,
  crossChain: false,                           // cache par chaîne (même adresse sur N chaînes !)
}, async ({ input, context }) => { /* client.readContract({..., blockNumber: input.blockNumber}) */ });
// dans le handler : const fb = await context.effect(readFeedback, {...});
```
- Les appels sont regroupés, mémoïsés et dédoublonnés. `cache: true` crée une table `envio_effect_<name>`. `context.cache = false` évite de mettre une erreur en cache.
- **`crossChain: false` est indispensable** : avec la même adresse sur plusieurs chaînes, un cache partagé servirait à une chaîne le résultat d'une autre. La doc cite exactement ce cas.
- **Le cache d'effects n'est pas annulé en cas de reorg** (DOC), et les effets de bord externes non plus.
- **Piège Monad** : les nœuds complets ne servent **pas** d'état historique arbitraire. `eth_call` ne remonte qu'à environ 40 000 blocs, selon le disque du fournisseur (DOC Monad, https://docs.monad.xyz/developer-essentials/historical-data). Un `readFeedback` ou `getAgentWallet` **au bloc de l'event** échouera donc pendant le rattrapage historique. **Conséquences** :
  - reconstruire le wallet et l'owner **depuis les events** (`MetadataSet` avec la clé `agentWallet`, `Transfer`) ;
  - réserver l'Effect API au **contrôle de cohérence à la tête** (`getLastIndex`, `getClients`, `readAllFeedback` sur l'état courant), comme le prévoit le §7 du brief 03.

### 2.7 Plusieurs chaînes, adresses fixes, wildcard
- Plusieurs chaînes (DOC, [multichain-indexing](https://docs.envio.dev/docs/HyperIndex/multichain-indexing.md)) : on définit les contrats une fois, on les liste sous chaque `chains[].contracts` avec l'adresse, et on réutilise les mêmes handlers. Les chaînes sont indexées en parallèle.
  - **V3 ne fonctionne qu'en mode non ordonné** entre chaînes, et c'est volontaire. L'ordre reste garanti *à l'intérieur* d'une chaîne.
  - Depuis v3.10, avec `disable_default_cross_chain: true` et sans entité `@crossChain`, une reorg ne fait reculer **que la chaîne concernée**.
  - Ajouter une chaîne impose de **tout réindexer**, en local comme sur le Cloud.
- Wildcard (DOC, [wildcard-indexing](https://docs.envio.dev/docs/HyperIndex/wildcard-indexing.md)) : `onEvent({ …, wildcard: true, where: () => ({ params: [{ clientAddress: [...] }] }) })` indexe l'event quelle que soit l'adresse émettrice. On peut filtrer par topic et mettre plusieurs filtres (OU entre eux, ET à l'intérieur d'un filtre), avec un filtre différent par chaîne.
  - **Usage possible pour ANCRE** : trouver des déploiements 8004 *non canoniques* (forks et clones) en indexant `NewFeedback` en wildcard. Ça reste accessoire.
- `start_block: latest` est disponible (v3.11+). `end_block` permet de figer un instantané, ce qui sert à reproduire l'état au bloc 108 434 518 du brief 03. `block_lag` permet de rester N blocs derrière la tête.

### 2.8 Reorgs
DOC, [reorgs-support](https://docs.envio.dev/docs/HyperIndex/reorgs-support.md) :
- `rollback_on_reorg: true` par défaut. `max_reorg_depth` vaut **200 blocs** par défaut sur toutes les chaînes, sauf Arbitrum et OP, où il vaut 0 (**pas de rollback par défaut : à fixer à la main** si on indexe ces chaînes).
- Toutes les entités sont annulées. Les appels externes, les fichiers et le cache d'effects ne le sont pas.
- **Détection garantie avec HyperSync**, parce que logs et blocs arrivent de façon atomique. Avec un RPC, certains cas limites échappent à la détection.
- Rien de spécifique à Monad dans la doc Envio : ni blocs spéculatifs, ni `monadLogs` (NON TROUVÉ). Deux hypothèses restent à vérifier : HyperSync ne servirait que des blocs au moins « voted », d'où le retard d'un bloc mesuré ; et avec 200 blocs de profondeur (~80 s à 0,4 s par bloc), la finalité Monad (~2 blocs) est largement couverte.
- En HyperSync direct, la réponse porte un `rollback_guard` : on compare `first_parent_hash` avec le `hash` précédent (DOC, [hypersync-query](https://docs.envio.dev/docs/HyperSync/hypersync-query.md#rollback-guard)).

---

## 3. HyperSync (usage direct, analytique)

- Définition : couche de données en Rust qui remplace JSON-RPC. On filtre logs, transactions, traces et blocs, on choisit les champs, on règle les jointures (DOC, [overview](https://docs.envio.dev/docs/HyperSync/overview.md)).
- Débit annoncé : « jusqu'à 1000x / 2000x plus rapide que RPC » ; « scanner Arbitrum pour des logs épars en 2 s » ; 30 000+ events/s en rattrapage pour HyperIndex (**AUTO-DÉCLARÉ**). Envio cite aussi son propre benchmark ouvert du 16/09/2026 (4 scénarios gagnés sur 5), lui aussi AUTO-DÉCLARÉ ([benchmarks](https://docs.envio.dev/docs/HyperIndex/benchmarks.md)).
- Clients (DOC, [clients](https://docs.envio.dev/docs/HyperSync/hypersync-clients.md)) ; versions MESURÉES le 27/09 :

| Langage | Paquet | Version |
|---|---|---|
| Node/TS | `@envio-dev/hypersync-client` | 1.4.1 |
| Python | `hypersync` (PyPI) | 1.2.1 |
| Rust | `hypersync-client` (crates.io) | 1.4.1 |
| Go | `hypersync-client-go` | communautaire, WIP |

- Formats de sortie : JSON et Parquet (plus CSV en Python), ce qui convient à l'analytique pandas du profil quant.
- Pagination « au temps » : environ **5 s** de calcul par requête. La réponse donne `next_block` et `archive_height` ; `stream()` enchaîne les pages tout seul. Plafonds : `max_num_*`, taille de réponse. `to_block` est exclusif.
- Toute l'histoire en une requête (ne peut pas être exécutée sans token) :
```bash
curl -X POST https://monad.hypersync.xyz/query -H "Authorization: Bearer $ENVIO_API_TOKEN" -H 'Content-Type: application/json' -d '{
  "from_block": 0,
  "logs": [{ "address": ["0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"],
             "topics": [["<keccak NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)>"]] }],
  "field_selection": { "log": ["block_number","log_index","transaction_hash","topic0","topic1","topic2","topic3","data"] }
}'
```
- Autres outils : Query Builder dans le navigateur (https://builder.hypersync.xyz), `pnpx logtui <preset> <chain>`, dépôt `enviodev/hypersync-quickstart`, [curl examples](https://docs.envio.dev/docs/HyperSync/hypersync-curl-examples.md), [stream tuning](https://docs.envio.dev/docs/HyperSync/stream-config-tuning.md).
- **Usage « analytique créatif » pour le bounty** : un script HyperSync (Python ou Node) qui balaie **les 8004 de toutes les chaînes** en quelques secondes et calcule les statistiques de ferme (concentration des avis par wallet, valeurs aberrantes à 1e38, rafales de création d'agents). Ça couvre l'écosystème entier sans passer par Envio Cloud, qui serait limité à 100 k events.

## 4. HyperRPC
DOC, [overview-hyperrpc](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc.md) :
- JSON-RPC **en lecture seule**, qui s'appuie sur HyperSync. Annoncé jusqu'à 5x plus rapide que geth, erigon ou reth (AUTO-DÉCLARÉ).
- Méthodes : `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber/ByHash`, `eth_getBlockReceipts`, `eth_getTransactionByHash/…ByBlockHashAndIndex/…ByBlockNumberAndIndex`, `eth_getTransactionReceipt`, `eth_getLogs`, et `trace_block` sur quelques chaînes.
- **Pas d'`eth_call`** : il ne peut donc pas lire `readFeedback` ou `getAgentWallet`. Pas d'envoi de transaction.
- Token dans l'URL. **Facturation : 4 $ par million d'appels, 1 $ minimum par mois.** La doc indique aussi qu'un token peut « ne pas avoir accès à ce produit » (erreur 403). → HyperRPC n'est **probablement pas couvert par le token gratuit** (à vérifier en créant le token).
- Pas encore audité, en développement actif (DOC).
- Pour ANCRE : c'est un simple remplaçant d'`eth_getLogs` sans la limite de 100 blocs de `rpc.monad.xyz`. HyperSync fait mieux et gratuitement, donc c'est secondaire.

## 5. Envio Cloud et auto-hébergement
DOC, [hosted-service](https://docs.envio.dev/docs/HyperIndex/hosted-service.md), [deployment](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment.md), [billing](https://docs.envio.dev/docs/HyperIndex/hosted-service-billing.md) :
- **Déploiement par git**, à la Vercel : on se connecte avec GitHub sur https://envio.dev/app/login, on installe la GitHub App « Envio Deployments », on choisit le dépôt, le dossier racine, le chemin de la config et la branche, puis chaque push déclenche un déploiement.
  - **Chaque déploiement réindexe depuis `start_block`.** L'ancien déploiement continue de servir pendant ce temps, donc sans coupure. L'endpoint de production reste fixe.
- CLI : `npm i -g envio-cloud` (v1.0.0, MESURÉ), puis `envio-cloud login` (navigateur, ou `--token` GitHub avec les scopes `read:org`, `read:user`, `user:email`), `indexer add`, `deployment status … --watch-till-synced`, `-o json` (DOC, [envio-cloud-cli](https://docs.envio.dev/docs/HyperIndex/envio-cloud-cli.md)).
- **Plan Development (gratuit)** :
  - 3 indexeurs de dev par organisation, 3 déploiements par indexeur.
  - **Durée de vie maximale : 30 jours**. Au-delà, ou au-delà de 20 Go, le déploiement est supprimé d'office.
  - **Soft limits**, la première atteinte déclenche la procédure : **100 000 events traités**, 5 Go, ou 7 jours sans requête. S'ensuivent 7 jours de grâce, 3 jours en lecture seule, puis la suppression.
  - La page pricing mentionne aussi « 800 indexing hours per month ».
  - Aucune garantie de disponibilité.
- Plans payants : Production Small, Medium et Large, puis Dedicated (tarifs non lus : la page renvoie vers des sous-pages). Le cache Effect sur le Cloud demande au moins le plan Medium, les alertes un plan payant.
- Contraintes de build :
  - dépôt ≤ 100 Mo ;
  - `envio` en version **exacte** dans le `package.json` du dossier de l'indexeur ;
  - le `pnpm-lock.yaml` est ignoré, donc toutes les dépendances doivent être épinglées ;
  - les dossiers `generated`, `node_modules` et les dotfiles sont ignorés ;
  - pas d'import hors du dossier de l'indexeur (attention au monorepo) ;
  - les variables d'env doivent être préfixées `ENVIO_` et se configurent dans l'UI, pas via un `.env` ;
  - pnpm 10.32.0 ; version minimale 2.21.5.
- Sécurité de l'endpoint : liste blanche d'IP et/ou clé API, avec un 429 selon le plan (DOC, [features](https://docs.envio.dev/docs/HyperIndex/hosted-service-features.md)).
- **Calendrier** : le jugement se termine le 27/10. Un déploiement gratuit fait le 13/10 expire le 12/11, ce qui passe. Un déploiement fait avant le 27/09 aurait expiré pendant le jugement. → **Déployer la version finale après le 28/09** et prévoir d'en redéployer une.
- **Auto-hébergement** : docker-compose avec Postgres, Hasura et l'indexeur ; exemple sur https://github.com/enviodev/local-docker-example. **Il faut alors `ENVIO_API_TOKEN`**. Aucune limite d'events. C'est le repli si on dépasse 100 k events (DOC, [self-hosting](https://docs.envio.dev/docs/HyperIndex/self-hosting.md)).

## 6. IA : quickstart, skills Claude Code, MCP
- [Quickstart with AI](https://docs.envio.dev/docs/HyperIndex/quickstart-with-ai.md) (DOC) : « we've seen the best results with Claude Code ». Quand `pnpx envio init` est lancé par un agent, il imprime des consignes adaptées aux IA.
- **Skills Claude Code** : `envio skills update` extrait les skills de la version de la CLI dans `.claude/skills/` (DOC). La liste réelle, observée dans le dépôt `Sireadell/headwater-indexer` (EXEMPLE) : `envio-cloud-cli`, `envio-docs`, `indexer-blocks`, `indexer-configuration`, `indexer-external-calls`, `indexer-factory`, `indexer-filters`, `indexer-handlers`, `indexer-local-parallel`, `indexer-multichain`, `indexer-performance`, `indexer-schema`, `indexer-testing`, `indexer-traces`, `indexer-transactions`, `indexer-troubleshooting`, `indexer-wildcard`.
  - ⚠️ Ces skills s'écrivent dans `.claude/skills/` **du dossier courant**. Il faut les lancer depuis `indexer/` pour ne pas mélanger avec nos propres skills (`llm-council`…).
- **MCP docs** : `claude mcp add --transport http envio-docs https://docs.envio.dev/mcp` expose deux outils, `docs_search` et `docs_fetch` (DOC, [mcp-server](https://docs.envio.dev/docs/HyperIndex/mcp-server.md)). Équivalent en CLI (≥ 3.1) : `envio tools search-docs "<q>"` et `envio tools fetch-docs <url>`.
- Toutes les pages de doc existent en markdown brut : ajouter `.md` à l'URL. Il existe aussi https://docs.envio.dev/llms-full.txt (887 Ko).

## 7. Exemples et templates proches
| Dépôt | Contenu | Pertinence |
|---|---|---|
| **`Sireadell/headwater-indexer`** (créé le 18/09, poussé le 23/09/2026) | HyperIndex 3.12.1 sur **Monad 143** : `Registered`, `NewFeedback`, `FeedbackRevoked` + AUSD `Transfer`. Entités agrégées `CrossAgentOverlap`, `CircularFunding`, `DirectedFundingEdge`, `FunderFanOut`, `WalletLabel` (Nansen). Envio Cloud gratuit, endpoint encore « TODO » | **Concurrent direct sur le bounty Envio et sur la track**. Angle provenance de financement, complémentaire de ColinkaMir. Commentaire de leur `config.yaml` : AUSD depuis le bloc 101 M « a dépassé le quota d'environ 100 000 events du tier gratuit en quelques heures », et un rattrapage AUSD depuis 0 a planté en OOM en local (EXEMPLE) |
| `dmihal/erc-8004-indexer` (10/2025) | Identity, Reputation et Validation sur 3 testnets, syntaxe V2 (`networks:`), ABI de la v1 | Obsolète (v1, anciennes adresses) : ne sert que de modèle de structure |
| `fraserbrownirl/envio-8004` (02/2026) | V2, Sepolia et Base Sepolia, pré-v2.0.0 (`uint8 score`) | Obsolète |
| `ice3ice/envio-erc8004-indexer` | README seul | Vide |
| Template `erc20` / `feature-external-calls` / `feature-factory` (`envio init template -t …`) | ERC-20 multichain, Effect API, factories | `feature-external-calls` sert de base pour les contrôles `eth_call` |
| [`enviodev/rpc-token-data-example`](https://github.com/enviodev/rpc-token-data-example) | Effect + viem multicall | Modèle pour les contrôles à la tête |
| [Uniswap v4 multichain](https://docs.envio.dev/docs/HyperIndex/example-uniswap-v4-multi-chain-indexer.md) (10 chaînes, alimente v4.xyz) | Référence multichain de production | Modèle d'architecture |
| Showcase **x402stats** (https://docs.envio.dev/showcase/x402stats) | Statistiques x402 construites avec Envio | À regarder pour l'écran de démo (non lu en détail) |

**Aucun indexeur Envio des registres 8004 v2.0.0 sur plusieurs chaînes** n'a été trouvé (NON TROUVÉ, recherche GitHub du 27/09 : « 8004 envio », « erc8004 indexer », « 8004 hyperindex »). Autres indexeurs 8004 hors Envio : `0xbits/8004-indexer` (Ponder), `PaulieB14/erc8004-substreams` (Substreams, Base), `marsakahenry14-lab/erc8004-forensics` (Base + Ethereum).

## 8. Faisabilité : les registres 8004 sur plusieurs chaînes

`cast code` le 2026-09-27 sur des RPC publics (MESURÉ). « Oui » signifie bytecode présent (proxy ERC-1967, 263 caractères hex, identique partout).

| Chaîne | chainId | Adresses mainnet `0x8004A169…` / `0x8004BAa1…` | Adresses testnet `0x8004A818…` / `0x8004B663…` | HyperSync | Volume 8004scan (agents / avis, AUTO-DÉCLARÉ) |
|---|---|---|---|---|---|
| **Monad** | 143 | oui | non | oui | 10 179 / 9 283 |
| **Monad testnet** | 10143 | non | **oui** (`name()`="AgentIdentity", `getVersion()`="2.0.0", `ownerOf(1000)` existe) | oui | 1 849 / 1 530 |
| Ethereum | 1 | oui | oui | oui | 31 532 / 17 681 |
| Base | 8453 | oui | oui (mais `getVersion()`="0.0.1" : autre contrat) | oui | 70 166 / **491 828** |
| BSC | 56 | oui | oui | oui | **327 666** / 11 895 |
| Arbitrum | 42161 | oui | non | oui (reorg 0 par défaut) | 1 460 / 495 |
| Optimism | 10 | oui | non | oui (reorg 0 par défaut) | 534 / 334 |
| Polygon | 137 | oui | non | oui | 564 / 508 |
| Avalanche | 43114 | oui | non | oui | 229 / 14 528 |
| Gnosis, Celo, Linea, Scroll, Mantle, Abstract, Ink, Soneium, MegaETH, HyperEVM (999) | — | oui | non | oui | non mesuré |
| Taiko | 167000 | oui | non | **RPC only** | — |
| Berachain, Sonic, Unichain, Plasma | — | **non** | non | oui | — |
| Sepolia / Base Sepolia / Arbitrum Sepolia | — | non | oui | oui | Sepolia 10 354 / 14 069 ; Base Sepolia 8 833 / 36 715 |

Conclusions :
- **Techniquement trivial** : il suffit d'un bloc `chains:` par chaîne avec les mêmes adresses, et HyperSync couvre 19 des 20 chaînes mainnet qui ont 8004.
- **Le volume est la vraie contrainte.** Base et BSC dépassent à eux seuls la soft limit gratuite de 100 k events. Estimation d'un périmètre qui tient en gratuit : **Monad + Monad testnet + Arbitrum + Optimism + Polygon ≈ 50-60 k events** (ESTIMÉ, en comptant environ 4 events par agent (Registered, Transfer de mint, MetadataSet) plus un par avis). À valider en comptant par HyperSync une fois le token obtenu.
- **Recommandation** :
  - (a) indexeur HyperIndex **multichain restreint** (Monad 143 comme chaîne principale, plus 10143 et 2 ou 3 petites chaînes) sur Envio Cloud gratuit ;
  - (b) script **HyperSync direct** pour le panorama complet (Base, BSC, Ethereum), qui coûte zéro event Cloud ;
  - (c) en repli, l'auto-hébergement pour tout mettre dans un seul indexeur.
- Selon l'ERC-8004, un `agentId` n'est unique **que sur sa chaîne** (couple registre + chaîne) : `disable_default_cross_chain: true` est donc le bon réglage, et seules les statistiques inter-chaînes passent en `@crossChain`.
- Le rattrapage de Monad depuis le bloc 0 avec HyperSync ne fait qu'une poignée de requêtes (NON MESURÉ, faute de token). Il remplace le pari sur `rpc1.monad.xyz` noté au §4 du brief 03.

## 9. Pièges connus

1. **Token manuel** : sans lui, pas de dev local sur HyperSync (401). À créer par un humain avant de commencer le chantier 03.
2. **Double exécution des handlers** (preload) : aucun appel réseau direct, uniquement `context.effect`.
3. **État historique Monad non disponible** : un `eth_call` à un vieux bloc échoue. On reconstruit par les events.
4. **Cache d'effects multichain** : `crossChain: false` est obligatoire, puisque les adresses sont identiques d'une chaîne à l'autre.
5. **Reorgs non gérées sur Arbitrum et OP par défaut** (`max_reorg_depth: 0`) : à fixer à la main.
6. **`envio dev` ne remet plus la base à zéro en V3** : après une modification de schéma ou de config, lancer `pnpm dev -r` (ou `envio start -r`). Relancer aussi `pnpm codegen`.
7. **Chaque push sur le Cloud réindexe tout.** C'est rapide ici (petits volumes), mais les appels d'effects sont refaits (pas de cache sur le plan gratuit) : attention au quota de 25 rps de `rpc.monad.xyz`.
8. **Plan gratuit** : il **compte les events**, pas les entités, et supprime tout au bout de 30 jours ou en cas d'inactivité (7 jours sans requête). Il faut interroger l'endpoint régulièrement jusqu'au 27/10.
9. **Versions** : la version d'`envio` doit être exacte et toutes les dépendances épinglées, car le Cloud ignore le lockfile. Le dossier de l'indexeur doit se suffire à lui-même : dans notre monorepo (`indexer/`), rien ne doit être importé depuis `solver/`.
10. **Dossier `generated` ignoré par le Cloud** : ne pas y ranger d'ABI.
11. **Dépôt privé (décision du CLAUDE.md §5)** : le Cloud s'y connecte par la GitHub App, mais le bounty **exige un dépôt public** (`config.yaml`, `schema.graphql`, handlers). Il faudra rendre `indexer/` public au plus tard à la soumission, par exemple sous forme d'un dépôt séparé.
12. **Headwater a déjà pris l'angle « provenance de financement par Envio »** sur les mêmes registres Monad. Notre originalité doit venir de la **reconstruction des arêtes PPR (D14/D16) + multichain + certificat vérifié on-chain** consommé par un contrat, pas de la simple indexation.
13. **DNS** : les résolveurs de certains FAI échouent sur `*.hypersync.xyz` (SERVFAIL). Il faut alors passer sur 1.1.1.1 ou 8.8.8.8 (DOC, [troubleshooting](https://docs.envio.dev/docs/HyperSync/troubleshooting.md)).
14. **Windows** : la CLI n'a pas de binaire natif (EXEMPLE, README de Headwater), il faut WSL. Ça ne nous concerne pas sur macOS.
15. **Contradiction de chiffres** : 8004scan compte 10 179 agents et 9 283 avis sur Monad au 27/09, contre 10 261 mints et 9 188 avis on-chain au bloc 108 434 518 (brief 03). 8004scan reste AUTO-DÉCLARÉ et non fiable ; seule la mesure on-chain fait foi.

## 10. Ce qui compte pour le bounty « Best Use of Envio » (1 000 $)

| Critère (fiche officielle) | Ce qu'on peut montrer avec ANCRE | Niveau |
|---|---|---|
| **Usage réel, fonctionnalité centrale** | L'indexeur est **la source unique** du solveur PPR (04) et de l'écran (07). Sans lui, pas de certificat. Ce n'est pas un gadget | fort par construction |
| **Profondeur : multichain** | Un seul indexeur Monad 143 + Monad 10143 + 2 ou 3 chaînes 8004 (Arbitrum, Optimism, Polygon), `disable_default_cross_chain`, `ChainStats @crossChain` | à faire, faisable (§8) |
| **Schéma non trivial, entités dérivées ou agrégées** | `Edge` (règle D14 : dernier avis non révoqué par (client, agent, tag1), maintenu en continu), `WalletAgents` (D16), `OwnerChange` (historique des owners), marqueurs de ferme (concentration par wallet, valeurs hors bornes rejetées) | fort, et **différent de Headwater** |
| **Usage créatif de HyperSync pour l'analytique** | Script HyperSync (Python ou Node) qui scanne **8004 sur les 19 chaînes** et mesure les fermes Sybil de tout l'écosystème en quelques secondes (Base : environ 490 k avis). Graphique « part des avis venant de fermes par chaîne » | original, et hors quota Cloud |
| **Produit qui marche, données live et correctes** | Contrôles de cohérence du brief 03 §7 (Σ `getLastIndex`, `getClients`, `_lastId`) via l'Effect API à la tête, affichés en vert dans l'écran | fort, et ça répond au « 8004scan n'est pas fiable » |
| **Originalité** | Les données indexées alimentent un **certificat PPR vérifié on-chain** qu'un contrat (`TrustGatedRouter`) lit avant de payer. Personne d'autre ne boucle ainsi indexeur → preuve → paiement | fort |
| **Qualité, reprenable par un tiers** | Dossier `indexer/` autonome, `SCHEMA.md`, tests `createTestIndexer` + Vitest, versions épinglées, README avec l'endpoint | à tenir |
| **Livrables** | Dépôt **public** (voir le piège 11), endpoint Envio Cloud (ou auto-hébergé), frontend ou agent consommateur, vidéo | à planifier |

Actions à faire dans l'ordre :
1. Un humain crée le token (envio.dev/app/api-tokens), l'ajoute dans `indexer/.env` (gitignored), et vérifie au passage si HyperRPC est inclus.
2. `pnpx envio init contract-import local` depuis `indexer/`, puis `envio skills update`.
3. Monad 143 seul, avec `end_block: 108434518`, pour **valider les chiffres du brief 03 §7** ; ensuite on retire `end_block`.
4. Ajouter 10143 et les petites chaînes, et mesurer le nombre d'events avant de déployer sur le Cloud.
5. Déployer sur le Cloud **après le 28/09**, en gardant un déploiement actif jusqu'au 27/10.

---

### Liens directs (doc lue le 2026-09-27)
- Index : https://docs.envio.dev/llms.txt · Full : https://docs.envio.dev/llms-full.txt · MCP : https://docs.envio.dev/mcp
- HyperIndex : [overview](https://docs.envio.dev/docs/HyperIndex/overview.md) · [quickstart](https://docs.envio.dev/docs/HyperIndex/quickstart.md) · [quickstart-with-ai](https://docs.envio.dev/docs/HyperIndex/quickstart-with-ai.md) · [config](https://docs.envio.dev/docs/HyperIndex/configuration-file.md) · [config reference](https://docs.envio.dev/docs/HyperIndex/config-schema-reference.md) · [schema](https://docs.envio.dev/docs/HyperIndex/schema.md) · [handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers.md) · [effect-api](https://docs.envio.dev/docs/HyperIndex/effect-api.md) · [contract-state](https://docs.envio.dev/docs/HyperIndex/contract-state.md) · [preload](https://docs.envio.dev/docs/HyperIndex/preload-optimization.md) · [multichain](https://docs.envio.dev/docs/HyperIndex/multichain-indexing.md) · [wildcard](https://docs.envio.dev/docs/HyperIndex/wildcard-indexing.md) · [reorgs](https://docs.envio.dev/docs/HyperIndex/reorgs-support.md) · [block-handlers](https://docs.envio.dev/docs/HyperIndex/block-handlers.md) · [testing](https://docs.envio.dev/docs/HyperIndex/testing.md) · [CLI](https://docs.envio.dev/docs/HyperIndex/cli-commands.md) · [env vars](https://docs.envio.dev/docs/HyperIndex/environment-variables.md) · [hasura](https://docs.envio.dev/docs/HyperIndex/navigating-hasura.md) · [websockets](https://docs.envio.dev/docs/HyperIndex/websockets.md) · [rpc-sync](https://docs.envio.dev/docs/HyperIndex/rpc-sync.md) · [common issues](https://docs.envio.dev/docs/HyperIndex/common-issues.md) · [migrate-to-v3](https://docs.envio.dev/docs/HyperIndex/migrate-to-v3.md) · [supported chains](https://docs.envio.dev/docs/HyperIndex/supported-networks.md) · [licensing](https://docs.envio.dev/docs/HyperIndex/licensing.md)
- Cloud : [hosted-service](https://docs.envio.dev/docs/HyperIndex/hosted-service.md) · [deployment](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment.md) · [billing](https://docs.envio.dev/docs/HyperIndex/hosted-service-billing.md) · [features](https://docs.envio.dev/docs/HyperIndex/hosted-service-features.md) · [cloud CLI](https://docs.envio.dev/docs/HyperIndex/envio-cloud-cli.md) · [self-hosting](https://docs.envio.dev/docs/HyperIndex/self-hosting.md) · https://envio.dev/pricing · https://envio.dev/pricing/hypersync
- HyperSync : [overview](https://docs.envio.dev/docs/HyperSync/overview.md) · [quickstart](https://docs.envio.dev/docs/HyperSync/hypersync-quickstart.md) · [clients](https://docs.envio.dev/docs/HyperSync/hypersync-clients.md) · [query](https://docs.envio.dev/docs/HyperSync/hypersync-query.md) · [usage](https://docs.envio.dev/docs/HyperSync/hypersync-usage.md) · [curl](https://docs.envio.dev/docs/HyperSync/hypersync-curl-examples.md) · [stream tuning](https://docs.envio.dev/docs/HyperSync/stream-config-tuning.md) · [api-tokens](https://docs.envio.dev/docs/HyperSync/api-tokens.md) · [networks](https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks.md) · [troubleshooting](https://docs.envio.dev/docs/HyperSync/troubleshooting.md)
- HyperRPC : [overview](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc.md) · [networks](https://docs.envio.dev/docs/HyperRPC/hyperrpc-supported-networks.md)
- GitHub : https://github.com/enviodev/hyperindex (releases) · https://github.com/enviodev/local-docker-example · https://github.com/enviodev/hypersync-quickstart · https://github.com/enviodev/hypersync-client-python · https://github.com/enviodev/hypersync-client-node · https://github.com/Sireadell/headwater-indexer
- Monad : https://docs.monad.xyz/developer-essentials/historical-data · https://docs.monad.xyz/guides/erc-8004

# Design de l'indexeur ANCRE sur Envio (vague 2)

> **2026-09-27**, suite de `docs/ressources/envio.md` (vague 1). Chantier 03, bounty « Best Use of Envio » (D38).
> Légende : **DOC** = lu ce jour dans docs.envio.dev (pages `.md`, copies dans `scratchpad/envio_w2/`) · **MESURÉ** = appel RPC fait ce jour, en lecture seule · **PROPOSÉ** = choix de design, à valider · **ESTIMÉ** = calcul de notre part · **NON VÉRIFIÉ**.
> Aucun compte créé, aucun token, aucun commit.

---

## 0. En bref

**L'idée, en 3 phrases.**
1. L'indexeur ANCRE ne se contente pas de stocker les avis ERC-8004 : il **compile, au fil des events, le graphe signé exact que le contrat doit certifier**. Il applique D14, D15, D16 et D20 dans des entités dérivées, par ensemble d'ancres et sur 5 chaînes 8004.
2. Il indexe aussi **le contrat ANCRE lui-même**. À chaque `CertificateSubmitted`, il décode le calldata (`rows`), recalcule `graphRoot` et compare chaque arête engagée au graphe du registre **dans l'état exact du bloc du certificat**. Toute arête fabriquée, gonflée ou omise devient une entité `Discrepancy`, avec la preuve prête à soumettre.
3. Un pipeline HyperSync balaie les registres 8004 des 19 chaînes qui ont HyperSync et mesure partout la même signature de ferme, ainsi que la part des avis qui ne survivent pas aux règles d'ANCRE.

**Pourquoi ça marque sur chaque critère du bounty** (fiche officielle copiée par Hugo, `bounties-sponsors.md`) :

| Critère | Ce qu'on montre | Pourquoi c'est fort |
|---|---|---|
| Usage réel, fonctionnalité centrale | L'indexeur est la **seule source** du solveur (04) et de l'écran (07). Il est aussi le **surveillant** du certificat (D32, preuve (v) FABRICATION) | Sans lui, ni certificat ni contestation. Il répond à la question « qui surveille pendant le jugement ? » (tour 5, question 2) |
| Profondeur : multichain | Un seul indexeur sur 143, 10143, Arbitrum, Optimism et Polygon, en mode par chaîne (`disable_default_cross_chain`). La même adresse de registre est déclarée partout | Les registres sont en v2.0.0 sur les 5 chaînes (MESURÉ, `getVersion()`) |
| Schéma non trivial, entités dérivées | Environ 25 entités. Historique en ajout seul, état courant, arêtes par (ensemble, client, agent), wallets partagés, contrôleurs, audit de certificat, indicateurs de ferme | Ce sont les **règles normatives d'une norme** exécutées dans l'indexeur, pas des compteurs |
| HyperSync pour l'analytique | Un scan de 19 chaînes (logs joints aux transactions) produit du Parquet : part des avis de ferme, rafales d'enregistrement par déployeur, acteurs présents sur plusieurs chaînes, valeurs à 1e38 | Le scan ne coûte aucun event Cloud et couvre Base (~490 k avis) et BSC, qui ne tiennent pas dans le plan gratuit |
| Produit qui marche, données correctes | Contrôles de cohérence chiffrés contre la chaîne, au bloc 108 434 518. Test différentiel entre les arêtes TS de l'indexeur et `solver/graph.py` | Le « 8004scan est faux » (AM-3.8, AM-R4.2) devient une preuve de justesse |
| Originalité | Un indexeur qui **audite une affirmation on-chain** au bloc exact où elle a été faite. Sur Monad, aucun RPC ne peut le faire après ~40 000 blocs, faute d'état historique | Headwater fait de la provenance de financement ; personne ne fait indexeur → preuve → paiement → contre-audit |
| Qualité | Dépôt autonome, versions épinglées, tests `createTestIndexer` qui rejouent les vecteurs normatifs `solver/vectors/*.json` | Reprenable par un tiers ; les vecteurs sont ceux de la norme |

**Deux alternatives écartées.**
- **Provenance de financement et labels de wallets** (qui a financé les noteurs ; Nansen). C'est exactement Headwater (AUSD, `CircularFunding`, `SharedFunder`, `WalletBirth`, Nansen) et ColinkaMir. De plus, CLAUDE.md §6 rappelle qu'une preuve de paiement ne suffit pas contre les Sybil, puisque la ferme d'Eve payait. On arriverait second, sur un angle déjà dit insuffisant.
- **Score de réputation multichain unique** (« passeport » agrégé par adresse sur toutes les chaînes). Ça contredit D13 et l'avis des auteurs d'ERC-8004, qui jugent un score global « dangerous ». Ça nous rangerait parmi les 18 clones de passeport de la track (CLAUDE.md §6). Le multichain sert ici à **compiler et auditer par chaîne**, pas à fusionner des scores.
- (Accessoire, non retenu comme idée centrale : repérer les déploiements 8004 non canoniques par indexation wildcard de `NewFeedback`.)

---

## 1. Ce que fait Headwater, pour ne pas le refaire

Dépôt `Sireadell/headwater-indexer`, lu le 27/09. Dernier push le 2026-09-23T14:32Z, 0 étoile (MESURÉ via l'API GitHub).

- **Périmètre** : Monad 143 seulement. Events : `Registered`, `NewFeedback`, `FeedbackRevoked`, plus `Transfer` AUSD depuis le bloc 106 160 000. Ils avaient d'abord pris 101 M, ce qui a fait sauter le quota de 100 k events « within hours ».
- **Ce qui manque chez eux** : `MetadataSet`, `Transfer` ERC-721 et `ApprovalForAll`. Ils n'ont donc **ni wallet, ni owner courant, ni contrôleurs**.
- **Entités** : `Agent`, `Reviewer`, `Feedback`, `FundingTransfer`, `CrossAgentOverlap`, `DirectedFundingEdge`, `CircularFunding`, `FunderFanOut`, `WalletLabel` (Nansen), `ReviewCadence` (coefficient de variation des intervalles entre avis, détection de rafale), `SharedFunder`, `WalletBirth`, `WalletFunder`, `FunderProfile`.
- Ils utilisent une Effect qui interroge HyperSync pour l'historique de chaque wallet (`src/effects/walletHistory.ts`).
- Leur README dit « no tests for this repo specifically ». L'endpoint Cloud est encore « TODO ».

**Ce qu'on évite donc** :
- tout ce qui touche au financement (AUSD, MON natif, funders) ;
- les labels Nansen ;
- la cadence des avis.

**Ce qu'on fait et qu'ils n'ont pas** :
- l'identité complète (wallets, transferts, opérateurs) ;
- les arêtes normatives par ensemble ;
- l'indexation du contrat ANCRE et l'audit de ses certificats ;
- le multichain ;
- des tests sur les vecteurs de la norme.

On peut **citer** leurs signaux comme un `edgeFilterId` possible, dans l'esprit de D30 pour ColinkaMir, sans les réimplémenter.

---

## 2. Faits vérifiés pour ce design (27/09)

### 2.1 Blocs de départ (start blocks)

| Chaîne | Identity | Reputation | Méthode | Statut |
|---|---|---|---|---|
| Monad 143 | **52 952 790** (tx `0xdb77a904…`) | **52 952 794** (tx `0xc1dfcca5…`) | premier `Upgraded` des proxys, `eth_getLogs` sur `rpc1.monad.xyz` | MESURÉ |
| Monad 143, premiers events utiles | premier `Registered` au bloc 53 006 722 | premier `NewFeedback` au bloc 53 567 903 | idem | MESURÉ |
| Monad testnet 10143 | déployé **avant 52 390 133** | idem | `eth_getCode` par dichotomie. Le code est déjà présent au plus vieux bloc servi par `rpc-testnet.monadinfra.com` et `testnet-rpc.monad.xyz` ; en dessous, erreur « historical state not available ». `eth_getLogs` est limité à 100 blocs sur les 3 RPC testnet | MESURÉ (borne), bloc exact **NON VÉRIFIÉ** |
| Arbitrum 42161 | **428 895 443** (4 `Upgraded` : 0x19906cd3, cda, e1d, e28) | idem | `eth_getLogs` sur toute l'histoire, `arb1.arbitrum.io` | MESURÉ |
| Optimism 10 | **147 514 947** | déployé après Identity (pas de code au bloc 147 514 946) | `eth_getCode` par dichotomie, `mainnet.optimism.io` | MESURÉ |
| Polygon 137 | **82 458 484** | déployé après Identity | idem, `polygon.drpc.org` | MESURÉ |

- `getVersion()` vaut « 2.0.0 » pour les deux registres sur les 5 chaînes (MESURÉ). Les signatures d'events v2.0.0 valent donc partout.
- **Réglage PROPOSÉ** : `start_block` au bloc de déploiement du proxy Identity (qui précède Reputation), et 0 sur le testnet.
  - HyperSync ne fait que peu de requêtes sur une plage vide (DOC overview, AUTO-DÉCLARÉ côté performance).
  - Le bloc exact du testnet sera relevé par une requête HyperSync `Upgraded` dès que le token existera.

### 2.2 Volume d'events sur Monad 143 (budget Cloud)

MESURÉ le 27/09 par `eth_getLogs` sur `rpc1.monad.xyz`, par signature, sur toute l'histoire (découpée au bloc 0x5000000 quand la réponse dépassait 10 000 logs).

| Contrat | Event | Nombre |
|---|---|---|
| Identity | `Registered` | 10 262 |
| Identity | `Transfer` | 10 335 (10 262 mints + 73 transferts) |
| Identity | `MetadataSet` | 11 809 |
| Identity | `URIUpdated` | 85 |
| Identity | `ApprovalForAll` | 32 |
| Identity | `Approval` | 0 |
| Identity | `OwnershipTransferred` | 1 |
| Identity | `Upgraded` | 2 |
| Reputation | `NewFeedback` | 9 283 |
| Reputation | `FeedbackRevoked` | 0 |
| Reputation | `ResponseAppended` | 0 |
| Reputation | `OwnershipTransferred` | 1 |
| Reputation | `Upgraded` | 2 |
| **Total** | | **≈ 41 812 events** |

- **Le registre n'est plus dormant** (corrige AM-3.9) : **95 `NewFeedback`** entre les blocs 108 483 651 et 108 552 157. Ils viennent de 20 clients et portent sur 12 agents récents (#10167 à #10261). Il y a aussi un `Registered` de plus (10 262 contre 10 261 au bloc de référence). C'est probablement le trafic d'un concurrent (NON VÉRIFIÉ). Sortie brute : `scratchpad/nf_after.json`.
  - Conséquence : les chiffres de référence du brief 03 §7 ne valent plus qu'**avec `end_block: 108434518`**.
- **Chaque transfert émet `MetadataSet("agentWallet", vide)` dans la même transaction** : 72 transferts sur 72 au bloc de référence (MESURÉ, `scratchpad/logs.json`). L'état du wallet se reconstruit donc depuis `MetadataSet` seul ; `Transfer` sert à l'owner et à l'historique.

### 2.3 Envio : ce qui est confirmé dans la doc (DOC, pages relues ce jour)

- **Versions** : `envio` a `latest = 3.12.1` et `next = 3.13.0`. `@envio-dev/hypersync-client` est en 1.4.1, `hypersync` (PyPI) en 1.2.1 (MESURÉ, registres npm et PyPI).
- **Mode par chaîne** : `disable_default_cross_chain: true` donne une clé `(id, chainId)`. `@crossChain` n'est valide qu'avec ce drapeau.
  - **Depuis v3.10, une reorg ne fait reculer que sa chaîne, à condition qu'aucune entité ne soit `@crossChain`.**
  - Le multichain est toujours non ordonné entre chaînes, et ordonné à l'intérieur d'une chaîne (multichain-indexing).
- **Double exécution** : un handler tourne deux fois, une phase de préchargement puis une phase de traitement.
  - Pendant le préchargement, les écritures et les logs sont ignorés, et les exceptions n'interrompent que ce préchargement.
  - Jamais de `fetch` direct : on passe par `context.effect`, ou on garde le code derrière `context.isPreload` (preload-optimization).
- **Effect API** : `createEffect({name, input, output, rateLimit (obligatoire), cache, crossChain})`.
  - Avec `disable_default_cross_chain`, une Effect qui ne précise pas `crossChain` a un cache par chaîne, et `context.chain.id` est disponible.
  - `context.cache = false` évite de mettre une erreur en cache.
  - Le cache des Effects sur le Cloud demande au moins le plan Medium (effect-api, hosted-service-billing).
- **Champs de transaction par handler** (v3.7) : `fields: { transaction: ["input","from","to","hash"] }`. La liste des champs disponibles inclut `input` (config-schema-reference, FieldSelection). **C'est ce qui rend l'audit du calldata possible.**
- **Schéma** :
  - `@internal` (v3.8) : entité absente de GraphQL ; une entité exposée ne peut pas la référencer.
  - `@index` : pour les filtres GraphQL.
  - Pour `getWhere`, les index sont créés à la demande (v3.5+). Les filtres multi-champs sont en ET (v3.2).
  - Scalaires disponibles : enums, `BigInt`, `BigDecimal`, `Json`.
- **Block handlers** : `indexer.onBlock({name, where: ({chain}) => ({block:{number:{_gte,_lte,_every}}})})`. Ils sont eux aussi exécutés deux fois.
- **Config d'une chaîne** : `start_block` (entier ou `latest`), `end_block`, `max_reorg_depth` (200 par défaut, 0 sur Arbitrum et OP), `block_lag`, `rpc` avec `for: sync|fallback|realtime` et `ws`, `hypersync_config.url`, `skip`.
- **Tests** : `createTestIndexer().process({chains:{143:{startBlock,endBlock}}})`, ou `simulate: [...]` avec `block`, `transaction`, `srcAddress` et `logIndex` surchargeables. En mode par chaîne, `indexer.X.getWhere({chainId:{_eq:143}})`.
- **Plan gratuit du Cloud** (hosted-service-deployment) :
  - limites dures : 20 Go et 30 jours ;
  - limites souples, la première atteinte déclenche la suppression : 100 000 events traités, 5 Go, ou 7 jours sans requête ;
  - suppression en deux étapes.
- **HyperSync** :
  - modes de jointure `Default` (logs → transactions → traces → blocs), `JoinAll` et `JoinNothing` ;
  - limite d'exécution de 5 s par requête ;
  - client Python `HypersyncClient(ClientConfig(url, bearer_token))`, `Query`, `LogSelection`, `FieldSelection`, `stream()`, `Decoder`.
  - **Pas de traces pour Monad** : la table des réseaux n'en liste que pour Base, Ethereum et Gnosis, sur demande.
- **Non trouvé dans la doc** :
  - une API d'état à un bloc passé (« time travel ») : `save_full_history` n'est décrit que comme une option de débogage ;
  - si les block handlers comptent dans les « events processed » ;
  - une limite de lignes par requête GraphQL sur le Cloud.

---

## 3. Architecture (PROPOSÉ)

```
            ┌─────────────── ancre-indexer (HyperIndex, 1 déploiement) ───────────────┐
 HyperSync →│ 143 · 10143 · 42161 · 10 · 137                                           │
            │  couche 1  historique en ajout seul (Feedback, WalletChange, OwnerChange…)│
            │  couche 2  état courant (Agent, WalletAgents, Operator, Controllers)      │
            │  couche 3  arêtes normatives par ensemble (TripleLatest → SetEdge)        │
            │  couche 4  contrat ANCRE : AnchorSet, Node, Certificate → CertificateAudit│
            │  couche 5  indicateurs (AgentProfile, RegistrationBurst, ChainStats)      │
            └──────────────┬───────────────────────────────┬───────────────────────────┘
                     GraphQL (Hasura)                 Effect (viem, tête de chaîne)
                           │                                │  getVersion, getLastIndex
          solver/from_indexer.py → fichiers d'entrée R4     │
          écran 07 (tables à Finalized)                     │
                                                            │
 HyperSync direct (analytics/, Python) : 19 chaînes, Parquet, zéro event Cloud
```

- **Règle d'or : aucune lecture d'état historique.** Tout se reconstruit depuis les events. Seules des vérifications ponctuelles lisent la tête via Effect. Sur Monad, l'état n'est gardé que ~40 000 blocs (doc Monad, piège 3 de la vague 1).
- **L'ordre est garanti à l'intérieur d'une chaîne** (DOC). Au moment où le handler traite `CertificateSubmitted`, les entités reflètent donc exactement l'état du registre **au bloc du certificat**. C'est la propriété qui rend l'audit possible sans archive.

---

## 4. `config.yaml` proposé

```yaml
# yaml-language-server: $schema=./node_modules/envio/evm.schema.json
name: ancre-indexer
description: ERC-8004 trust-graph compiler and ANCRE certificate auditor (multichain)
disable_default_cross_chain: true     # clé (id, chainId) ; reorg isolée par chaîne (v3.10) tant qu'aucun @crossChain
address_format: lowercase             # jointures directes avec le solveur (adresses en minuscules)
contracts:
  - name: IdentityRegistry
    events:
      - event: "Registered(uint256 indexed agentId, string agentURI, address indexed owner)"
      - event: "MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)"
      - event: "Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
      - event: "Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)"
      - event: "ApprovalForAll(address indexed owner, address indexed operator, bool approved)"
      - event: "Upgraded(address indexed implementation)"
      - event: "OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
      # URIUpdated volontairement omis (85 events, sans usage pour le graphe)
  - name: ReputationRegistry
    events:
      - event: "NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)"
      - event: "FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)"
      - event: "ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)"
      - event: "Upgraded(address indexed implementation)"
      - event: "OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
  - name: AnchoredReputation            # notre contrat (contracts/src/AnchoredReputation.sol, l.146-159)
    events:
      - event: "AnchorSetRegistered(bytes32 indexed setId, address[] anchors, uint64[] lambdas, uint32 alphaN, uint32 alphaD)"
      - event: "NodesAdded(bytes32 indexed setId, uint256 fromIndex, uint256 count)"
      - event: "CertificateSubmitted(bytes32 indexed setId, uint64 indexed certBlock, uint256 eEff, bytes32 graphRoot, bytes32 vectorRoot, bytes32 versionHash, uint32 nCert, uint32 numRows)"
      - event: "OmissionProven(bytes32 indexed setId, uint256 indexed node, uint256 indexed agentId, int256 weight, uint256 eEff)"
      - event: "RegistryChanged(bytes32 indexed setId, bytes32 certifiedVersionHash, bytes32 currentVersionHash)"
chains:
  - id: 143                                  # Monad mainnet
    start_block: 52952790                    # proxy Identity (MESURÉ) ; Reputation au bloc 52952794
    # end_block: 108434518                   # mode validation (brief 03 §7) ; retirer ensuite
    rpc:
      - url: ${ENVIO_MONAD_RPC}              # rpc-mainnet.monadinfra.com ou endpoint privé : repli + Effects
        for: fallback
    contracts:
      - name: IdentityRegistry
        address: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"
      - name: ReputationRegistry
        address: "0x8004baa17c55a88189ae136b182e5fda19de9b63"
      - name: AnchoredReputation
        address: "${ENVIO_ANCRE_143}"        # à remplir au déploiement (chantier 02)
        start_block: 0                       # à remplacer par le bloc de déploiement
  - id: 10143                                # Monad testnet : registres 8004 aux adresses "testnet"
    start_block: 0                           # déployé avant 52390133 (MESURÉ) ; bloc exact via HyperSync
    contracts:
      - name: IdentityRegistry
        address: "0x8004a818bfb912233c491871b3d84c89a494bd9e"
      - name: ReputationRegistry
        address: "0x8004b663056a597dffe9eccc1965a193b7388713"
      - name: AnchoredReputation
        address: "${ENVIO_ANCRE_10143}"      # répétitions de la démo (chantier 06)
  - id: 42161                                # Arbitrum
    start_block: 428895443                   # MESURÉ
    max_reorg_depth: 200                     # 0 par défaut sur Arbitrum (DOC) : à fixer
    contracts: &canon
      - name: IdentityRegistry
        address: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"
      - name: ReputationRegistry
        address: "0x8004baa17c55a88189ae136b182e5fda19de9b63"
  - id: 10                                   # Optimism
    start_block: 147514947                   # MESURÉ
    max_reorg_depth: 200                     # 0 par défaut sur OP (DOC)
    contracts: *canon
  - id: 137                                  # Polygon
    start_block: 82458484                    # MESURÉ
    contracts: *canon
```

**Points à vérifier au premier `pnpm codegen`** :
- **Ancres YAML** (`&canon`/`*canon`) : acceptées par le parseur ? NON VÉRIFIÉ. Sinon, dupliquer les blocs.
- **Variables `${ENV}` dans `address`** : la doc ne montre l'interpolation que pour `headers`. NON VÉRIFIÉ. Sinon, écrire les adresses en dur après le déploiement.
- **Chaînes sans `AnchoredReputation`** (42161, 10, 137) : le contrat est défini au niveau racine mais absent de leurs listes. C'est permis, puisque les contrats sont déclarés par chaîne (DOC multichain).
- **Filtrer `MetadataSet` par clé** : on pourrait ne garder que la clé `agentWallet`, via un filtre `where` sur le topic `indexedMetadataKey` (keccak de la chaîne). L'effet sur le décompte d'events n'est pas documenté. Le gain serait faible (~1 400 events) : on ne filtre pas.

---

## 5. `schema.graphql` proposé

Tous les identifiants sont **par chaîne** (clé `(id, chainId)`, DOC). Les adresses sont en minuscules. Les ids composés utilisent `-`.

```graphql
############ Couche 1 — historique en ajout seul (sert à rejouer l'état à n'importe quel bloc)

type Feedback {                        # id = agentId-client-feedbackIndex
  id: ID!
  agent: Agent!
  client: String! @index
  feedbackIndex: BigInt!               # 1-indexé, par couple, tous tags confondus
  value: BigInt!                       # int128 exact (jamais la notation 1.00E+38 de 8004scan)
  valueDecimals: Int!
  tag1: String! @index                 # en clair : la v2 le réémet hors topic
  tag2: String!
  endpoint: String!
  feedbackURI: String!
  feedbackHash: String!
  blockNumber: BigInt! @index
  logIndex: Int!
  txHash: String!
  txFrom: String!                      # EOA qui a signé ; ≠ client si l'appel passe par un contrat
  revokedAtBlock: BigInt               # null = actif
  clientWasController: String          # raison D16 évaluée AU BLOC de l'avis (owner|agentWallet|approved|operator), sinon null
}

type Response {                        # id = txHash-logIndex
  id: ID!
  feedback: Feedback!
  responder: String!
  responseURI: String!
  blockNumber: BigInt!
}

type WalletChange {                    # id = txHash-logIndex ; MetadataSet(key = agentWallet)
  id: ID!
  agent: Agent!
  wallet: String!                      # 0x0 si valeur vide (effacement, émis à chaque Transfer : MESURÉ 72/72)
  blockNumber: BigInt! @index
  logIndex: Int!
}

type OwnerChange {                     # id = txHash-logIndex ; Transfer ERC-721
  id: ID!
  agent: Agent!
  from: String!
  to: String!
  isMint: Boolean!
  blockNumber: BigInt! @index
  logIndex: Int!
}

type ApprovalChange { id: ID!  agent: Agent!  approved: String!  blockNumber: BigInt!  logIndex: Int! }
type OperatorChange { id: ID!  owner: String! @index  operator: String!  approved: Boolean!  blockNumber: BigInt!  logIndex: Int! }

type RegistryEvent {                   # Upgraded / OwnershipTransferred des deux proxys (D17)
  id: ID!
  registry: String!                    # "identity" | "reputation"
  kind: String!                        # "Upgraded" | "OwnershipTransferred"
  implementation: String
  newOwner: String
  versionAtHead: String                # Effect getVersion() lue à la tête (l'état historique n'est pas lisible)
  blockNumber: BigInt!
}

############ Couche 2 — état courant (dérivé, mis à jour dans l'ordre de la chaîne)

type Agent {                           # id = agentId (décimal)
  id: ID!
  owner: String! @index
  wallet: String! @index               # 0x0 si effacé
  approved: String!                    # getApproved reconstruit : dernier Approval, remis à 0x0 par Transfer
  uri: String!
  registeredBlock: BigInt!
  registeredTxFrom: String!            # déployeur (ferme Spawn : même EOA ou même factory)
  registeredTxTo: String!
  transferCount: Int!
  lastTransferBlock: BigInt            # D10 / D35 (TRANSFERRED)
  feedbacks: [Feedback!]! @derivedFrom(field: "agent")
  profile: AgentProfile
}

type WalletAgents {                    # D16 / D20 : index inverse wallet → agents (absent on-chain)
  id: ID!                              # wallet
  agentIds: [String!]!
  count: Int! @index
  shared: Boolean! @index              # count > 1 (178 wallets / 1 773 agents au bloc 108 434 518)
}

type Operator {                        # id = owner-operator ; actif si approved
  id: ID!
  owner: String! @index
  operator: String!
  active: Boolean!
}

type Actor {                           # une adresse vue sur une chaîne (noteur, owner ou wallet)
  id: ID!
  feedbacksGiven: Int!
  distinctAgentsRated: Int!
  agentsOwned: Int!
  walletOf: Int!                       # nombre d'agents dont c'est l'agentWallet
  selfRatings: Int!                    # avis donnés alors qu'il contrôlait la cible (cas #8317 : 78)
}

############ Couche 3 — arêtes normatives

type TripleLatest {                    # D14 : dernier avis non révoqué par (client, agent, tag1)
  id: ID!                              # client-agentId-keccak(tag1)
  client: String! @index
  agent: Agent!
  tag1: String!
  feedback: Feedback                   # null si tous révoqués
  maxIndexSeen: BigInt!
}

type TagSchema {                       # D12 : schéma engagé par ensemble (min/neutre/max/kind en WAD)
  id: ID!                              # setId-tag1
  set: AnchorSet!
  tag1: String!
  minWad: BigInt!
  neutralWad: BigInt!
  maxWad: BigInt!
  kind: TagKind!
}
enum TagKind { endorsement measurement }

type SetEdge {                         # arête combinée par (ensemble, client, agent) : D14 + D15 + rejet hors bornes
  id: ID!                              # setId-client-agentId
  set: AnchorSet!
  client: String! @index
  agent: Agent!
  w: Int!                              # int16, grille 1e-4 (graph.quantize) ; 0 = pas d'arête
  decidingTag: String
  feedbackIndex: BigInt
  rejected: EdgeReject                 # null si l'arête est retenue
  updatedAtBlock: BigInt! @index       # alimente SetFreshness
}
enum EdgeReject { OUT_OF_BOUNDS MEASUREMENT_TAG NOT_IN_FILTER CONTROLLER_OWNER CONTROLLER_WALLET CONTROLLER_APPROVED CONTROLLER_OPERATOR ZERO_WEIGHT }
# L'émetteur (D16/D20) n'est pas figé ici : il dépend de WalletAgents au bloc du certificat.
# Il est résolu à l'export et pendant l'audit (§6.3).

############ Couche 4 — contrat ANCRE et audit

type AnchorSet {                       # id = setId
  id: ID!
  anchors: [String!]!
  lambdas: [BigInt!]!
  alphaN: Int!
  alphaD: Int!
  tagsDecoded: Boolean!                # false si registerAnchorSet n'a pas été appelé directement (calldata illisible)
  registeredBlock: BigInt!
  lastCertBlock: BigInt
  freshness: SetFreshness
}

type Node {                            # table append-only du contrat ; id = setId-index
  id: ID!
  set: AnchorSet!
  index: Int!
  kind: NodeKind!
  agentId: BigInt
  address: String
}
enum NodeKind { anchor agent address }

type Certificate {                     # id = setId-certBlock-logIndex
  id: ID!
  set: AnchorSet!
  certBlock: BigInt!
  eEff: BigInt!
  graphRoot: String!
  vectorRoot: String!
  versionHash: String!
  nCert: Int!
  numRows: Int!
  submitter: String!                   # tx.from
  txHash: String!
  audit: CertificateAudit
}

type CertificateAudit {                # calculé au bloc exact du certificat (ordre intra-chaîne)
  id: ID!                              # = certificate id
  certificate: Certificate!
  decoded: Boolean!                    # calldata décodé (appel direct au contrat)
  graphRootRecomputed: String          # doit valoir Certificate.graphRoot (contrôle du décodeur)
  edgesChecked: Int!
  fabricated: Int!                     # arête engagée absente du registre (D32, preuve (v))
  inflated: Int!                       # w engagé > w registre (casse C_engagé ≤ C_vrai)
  omittedNegative: Int!                # arête négative du registre absente d'une ligne fournie
  walletMismatch: Int!                 # wallet engagé ≠ WalletAgents au certBlock (F4)
  controllerEdges: Int!                # arête qui aurait dû être rejetée par D16
  verdict: AuditVerdict!
  discrepancies: [Discrepancy!]! @derivedFrom(field: "audit")
}
enum AuditVerdict { MATCH DISCREPANCY UNDECODABLE }

type Discrepancy {
  id: ID!                              # auditId-u-dst
  audit: CertificateAudit!
  kind: String!                        # FABRICATED | INFLATED | OMITTED_NEG | WALLET | CONTROLLER
  u: Int!
  dst: Int!
  client: String!
  agentId: BigInt!
  wCommitted: Int!
  wRegistry: Int!
  feedbackIndex: BigInt
  proofHint: Json!                     # arguments prêts pour la fonction de preuve du chantier 02
}

type SetFreshness {                    # répond à « recalculer à chaque changement du graphe » (CLAUDE §6)
  id: ID!                              # setId
  edgesChangedSinceCert: Int!
  lastEdgeChangeBlock: BigInt
  status: String!                      # FRESH | DRIFTING | REGISTRY_CHANGED
}

type OmissionProof { id: ID!  set: AnchorSet!  node: BigInt!  agentId: BigInt!  weight: BigInt!  eEff: BigInt!  blockNumber: BigInt! }

############ Couche 5 — indicateurs (acte 1 : naïf contre ANCRE)

type AgentProfile {                    # id = agentId
  id: ID!
  agent: Agent!
  feedbackCount: Int!
  distinctClients: Int!
  topClient: String
  topClientShare: BigDecimal!          # #9 et #87 : 1 seul wallet
  outOfBounds: Int!                    # |value| = 1e38, etc. (117 sur Eve)
  naiveSumWad: BigInt!                 # ce que voit un getSummary sur tous les clients
  refEdgesIn: Int!                     # arêtes retenues sous le schéma de référence
  survival: BigDecimal!                # refEdgesIn / distinctClients
}

type RegistrationBurst {               # rafales d'enregistrement : id = txFrom-bucket (seau de 10 000 blocs, ~50 min)
  id: ID!
  txFrom: String! @index
  txTo: String!
  bucket: BigInt!
  agents: Int!
}

type ChainStats {                      # id = "stats" (une ligne par chaîne)
  id: ID!
  agents: Int!
  feedbacks: Int!
  revoked: Int!
  transfers: Int!
  sharedWallets: Int!
  agentsOnSharedWallets: Int!
  refEdges: Int!
  lastBlock: BigInt!
}

############ Interne (hors API)
type SetRegistry @internal { id: ID!  setIds: [String!]! }   # liste des ensembles à maintenir (+ "ref")
```

**Choix sur `@crossChain` (PROPOSÉ : ne pas l'utiliser).**
- Une entité `@crossChain` (par exemple `CrossChainActor`) annulerait l'isolation des reorgs par chaîne (v3.10, DOC).
- Ses mises à jour arriveraient en ordre non déterministe entre chaînes.
- La vue inter-chaînes, par exemple « cette adresse a noté sur 3 chaînes », se calcule donc **au moment de la requête** : un `Actor` par chaîne, groupé par id côté client. On la calcule aussi dans le scan HyperSync (§8).
- Si le jury veut voir `@crossChain`, on n'ajoute qu'un compteur commutatif (`GlobalStats`), et on documente ce que ça coûte.

**Ensemble « ref ».** L'indexeur calcule toujours les arêtes d'un ensemble virtuel `ref` :
- schéma : `solver/schema_reference.json`, **copié** dans `ancre-indexer/src/schema_reference.json`, puisque le Cloud refuse les imports hors du dossier ;
- filtre : `reference`, 8 tags.

Ainsi, l'acte 1 fonctionne sans aucun ensemble enregistré on-chain.

---

## 6. Handlers (squelette TS, PROPOSÉ)

`src/handlers/identity.ts`, `reputation.ts`, `ancre.ts`, `effects.ts`, `rules.ts` (portage de `graph.quantize` et de la combinaison D14).

### 6.1 Règles

- **Pas de logique non idempotente en préchargement.** Les écritures y sont ignorées (DOC). Les compteurs s'incrémentent dans la phase de traitement à partir de l'état relu (`get` → calcul → `set`), ce qui les rend corrects même si le handler tourne deux fois.
- **Lectures en parallèle** (`Promise.all`) pour profiter du regroupement du préchargement (DOC).
- **Aucun `fetch` ni RPC direct.** Tout passe par `context.effect`. Les Effects lisent la **tête** (`blockTag: "latest"`), jamais un vieux bloc.
- **Arithmétique en `bigint`**, identique au Python :
  - WAD = 10n ** 18n ;
  - la troncature vers zéro se code à la main, puisque la division `bigint` de JS tronque déjà vers zéro, alors que le `//` de Python arrondit vers le bas. On garde donc la forme de `graph.quantize`, qui n'applique la division qu'à des quantités positives.

### 6.2 Identité

```ts
import { indexer } from "envio";
const ZERO = "0x0000000000000000000000000000000000000000";

indexer.onEvent({ contract: "IdentityRegistry", event: "Registered",
                  fields: { transaction: ["from", "to"] } }, async ({ event, context }) => {
  const id = event.params.agentId.toString();
  const a = await context.Agent.get(id);            // le mint Transfer peut précéder dans la même tx
  context.Agent.set({ ...(a ?? blankAgent(id)), uri: event.params.agentURI,
    registeredBlock: BigInt(event.block.number),
    registeredTxFrom: event.transaction.from!.toLowerCase(), registeredTxTo: (event.transaction.to ?? ZERO).toLowerCase() });
  await bumpBurst(context, event.transaction.from!, event.transaction.to, event.block.number);
});

indexer.onEvent({ contract: "IdentityRegistry", event: "MetadataSet" }, async ({ event, context }) => {
  if (event.params.metadataKey !== "agentWallet") return;
  const v = event.params.metadataValue;                        // bytes : 20 octets ou vide
  const wallet = v.length === 42 ? v.toLowerCase() : ZERO;     // "0x" + 40 hex
  const id = event.params.agentId.toString();
  const agent = await context.Agent.getOrThrow(id);
  await moveWallet(context, id, agent.wallet, wallet);         // met à jour WalletAgents (retrait/ajout), Actor.walletOf
  context.Agent.set({ ...agent, wallet });
  context.WalletChange.set({ id: `${event.transaction.hash}-${event.logIndex}`, agent_id: id, wallet,
    blockNumber: BigInt(event.block.number), logIndex: event.logIndex });
});

indexer.onEvent({ contract: "IdentityRegistry", event: "Transfer" }, async ({ event, context }) => {
  // owner courant, approved remis à 0x0 (ERC-721), historique OwnerChange, transferCount, lastTransferBlock
  // + recalcul des SetEdge.rejected de cet agent (contrôleurs changés) : getWhere({ agent_id: { _eq: id } })
});
// Approval → Agent.approved ; ApprovalForAll → Operator ; Upgraded/OwnershipTransferred → RegistryEvent + Effect getVersion
```

### 6.3 Réputation : compilation des arêtes

```ts
indexer.onEvent({ contract: "ReputationRegistry", event: "NewFeedback",
                  fields: { transaction: ["hash", "from"] } }, async ({ event, context }) => {
  const p = event.params, agentId = p.agentId.toString(), client = p.clientAddress;
  const [agent, reg] = await Promise.all([context.Agent.getOrThrow(agentId), context.SetRegistry.get("all")]);
  const ctl = await controllerReason(context, agent, client);   // owner | agentWallet | approved | operator | null
  const fb = { id: `${agentId}-${client}-${p.feedbackIndex}`, agent_id: agentId, client,
    feedbackIndex: p.feedbackIndex, value: p.value, valueDecimals: Number(p.valueDecimals),
    tag1: p.tag1, tag2: p.tag2, endpoint: p.endpoint, feedbackURI: p.feedbackURI, feedbackHash: p.feedbackHash,
    blockNumber: BigInt(event.block.number), logIndex: event.logIndex,
    txHash: event.transaction.hash, txFrom: event.transaction.from!.toLowerCase(),
    revokedAtBlock: undefined, clientWasController: ctl ?? undefined };
  context.Feedback.set(fb);
  await updateTriple(context, fb);                               // D14 : index maximal non révoqué par tag1
  for (const setId of ["ref", ...(reg?.setIds ?? [])])            // 1 à 3 ensembles : O(1) par avis
    await recomputeSetEdge(context, setId, client, agentId, event.block.number);  // D15, bornes, D14, rejet D16
  await bumpProfileAndStats(context, fb, ctl);
});
// FeedbackRevoked : revokedAtBlock ; recalcul du TripleLatest (repli sur l'index précédent non révoqué) puis des SetEdge
```

`recomputeSetEdge` porte à l'identique la sélection `latest_then_reject` et la combinaison `neg_dominance` de `solver/graph.py`.
- Pour chaque tag du filtre de l'ensemble : lire `TripleLatest(client, agent, tag)` et quantifier avec `TagSchema`. Un avis hors bornes ne donne rien pour ce tag, sans repli sur un avis plus ancien.
- Combiner : le poids le plus négatif s'il en existe un, sinon le plus grand.
- Rejeter si le client fait partie des **contrôleurs courants** (D20 : owner, wallet, approved, opérateurs ; pas les anciens owners).
- Incrémenter `SetFreshness.edgesChangedSinceCert` si `w` a changé.

### 6.4 Contrat ANCRE : audit du certificat

```ts
indexer.onEvent({ contract: "AnchoredReputation", event: "CertificateSubmitted",
                  fields: { transaction: ["input", "to", "from", "hash"] } }, async ({ event, context }) => {
  const cert = toCertificate(event);                             // Certificate.set(...)
  if (event.transaction.to?.toLowerCase() !== event.srcAddress.toLowerCase()) {
    return setAudit(context, cert, { decoded: false, verdict: "UNDECODABLE" });   // appel indirect (multicall, Safe…)
  }
  const { args } = decodeFunctionData({ abi: ancreAbi, data: event.transaction.input });   // viem, pur, sans réseau
  const rows = decodeRows(args[5]);                              // solver/FORMAT.md §2 : W, numRows, u, hdr, wallet, edges
  const root = merkleRoot(rows);                                 // doit valoir event.params.graphRoot
  const nodes = await loadNodes(context, cert.set_id, args[3]);  // table Node + newNodes du calldata
  const disc = [];
  for (const r of rows) {
    const emitter = await emitterAddress(context, nodes[r.u], r.wallet);        // D16/D20, WalletAgents à ce bloc
    for (const e of r.edges) {
      const reg = await context.SetEdge.get(`${cert.set_id}-${emitter}-${nodes[e.dst].agentId}`);
      const wReg = reg && !reg.rejected ? reg.w : 0;
      if (wReg === 0 && e.w !== 0) disc.push(fabricated(r, e));             // D32 preuve (v) FABRICATION
      else if (e.w > wReg) disc.push(inflated(r, e, wReg));                 // GONFLEMENT
    }
    disc.push(...await omittedNegatives(context, cert.set_id, emitter, r));  // arête < 0 du registre absente de la ligne
  }
  writeAudit(context, cert, root, disc);                        // CertificateAudit + Discrepancy[] ; SetFreshness remis à 0
});
```

- **Pourquoi c'est juste sans état historique.** Les events d'une chaîne sont traités dans l'ordre (DOC). Quand ce handler s'exécute, `SetEdge`, `WalletAgents` et `Agent` sont exactement dans l'état du bloc `certBlock`, logs antérieurs du même bloc compris. Les logs postérieurs du même bloc restent un cas limite, à documenter.
- **Poids du calldata.** Un certificat Registry-verified peut porter plusieurs centaines de Ko de calldata (ESTIMÉ, 13,6 M gas). On ne le stocke pas : on le décode dans le handler, puis on le jette. `input` n'est demandé que pour cet event, grâce à `fields` par handler (DOC v3.7).
- **`AnchorSetRegistered`** : même mécanique. On décode `registerAnchorSet(SetParams)` depuis `input` pour obtenir les tags et leurs bornes, qui ne sont pas dans l'event. On crée `TagSchema`, puis on ajoute le `setId` à `SetRegistry`.
  - **Rattrapage** : les avis déjà indexés doivent alimenter le nouvel ensemble. On parcourt les `TripleLatest` dont le `tag1` est dans le filtre (`getWhere({ tag1: { _in: [...] } })`, ~10 k lignes sur Monad) et on crée les `SetEdge`.

### 6.5 Effects (Effect API)

```ts
import { createEffect, S } from "envio";
import { createPublicClient, http } from "viem";

export const readVersion = createEffect({
  name: "readVersion",
  input: { registry: S.string },                     // lu à la tête : pas d'état historique sur Monad
  output: S.nullable(S.string),
  rateLimit: { calls: 5, per: "second" },
  cache: false,                                      // une upgrade doit être vue : pas de cache
}, async ({ input, context }) => {                   // crossChain par défaut = false (disable_default_cross_chain) → context.chain.id
  try { return await clients[context.chain.id].readContract({ address: input.registry as `0x${string}`,
          abi: versionAbi, functionName: "getVersion" }); }
  catch { context.cache = false; return null; }
});

export const headLastIndex = createEffect({          // contrôle de cohérence : getLastIndex(agent, client) == max index indexé
  name: "headLastIndex", input: { agentId: S.bigint, client: S.string }, output: S.nullable(S.bigint),
  rateLimit: { calls: 15, per: "second" }, cache: false,
}, async ({ input, context }) => { /* readContract getLastIndex, blockTag "latest" */ });

export const alertDiscrepancy = createEffect({       // webhook vers l'écran / Discord ; cache:true ⇒ une alerte par id (DOC)
  name: "alertDiscrepancy", input: { id: S.string, body: S.string }, output: S.boolean,
  rateLimit: { calls: 2, per: "second" }, cache: true,
}, async ({ input }) => { /* POST ENVIO_ALERT_URL */ return true; });
```

- **Usage.**
  - `readVersion` n'est appelée que dans le handler `Upgraded` (4 appels sur Monad).
  - `headLastIndex` ne sert qu'aux avis récents : on n'appelle pas l'Effect si le bloc est plus vieux que ~10 000 blocs par rapport à la tête. La tête est connue par un `onBlock` peu fréquent, ou, c'est le plus simple, par une heuristique `Date.now() − block.timestamp < 1 h`. On n'utilise ce timestamp que pour décider d'un contrôle, jamais pour une époque (CLAUDE.md §7).
  - `alertDiscrepancy` se déclenche à chaque `Discrepancy`.
- **Plan gratuit** : il n'a **pas** de cache d'Effects persistant (Medium et au-dessus, DOC). Chaque redéploiement relance donc les appels, mais ils sont très peu nombreux.

### 6.6 Contrôles de cohérence

Script externe `scripts/check.ts`, plutôt qu'un block handler (PROPOSÉ). La doc ne dit pas si les block handlers comptent dans le quota, et Monad produit ~286 000 blocs par jour.
- Il interroge GraphQL et le RPC et vérifie :
  - Σ `getLastIndex` = nombre de `Feedback` ;
  - `getClients(agentId)` = ensemble des clients indexés, pour un échantillon d'agents ;
  - `_lastId` (dernier agentId) = nombre de mints ;
  - `ownerOf` et `getAgentWallet` sur un échantillon.
- L'écran 07 affiche le résultat en vert ou en rouge.

---

## 7. Interface avec le solveur

**Décision PROPOSÉE : lecture GraphQL, puis export en fichiers.** Pas d'appel du solveur vers Postgres, et pas d'import croisé : le Cloud exige un dossier d'indexeur autonome.

`solver/from_indexer.py --endpoint <URL GraphQL> --chain 143 --block B --out DIR` écrit :

| Fichier | Format | Source GraphQL | Lecteur existant |
|---|---|---|---|
| `onchain_feedbacks.json` | `{"block": B, "feedbacks": [{a, c, i, v, d, t1, t2, r}]}` avec `r = revokedAtBlock ≤ B` | `Feedback(where:{blockNumber:{_lte:B}})` | `graph.load_feedbacks_onchain`, **inchangé** |
| `identity.json` | `{"block": B, "owner": {id: addr}, "wallet": {id: addr}, "approved": {…}, "operators": {owner: [op]}, "pastOwners": {id: [addr]}, "pastWallets": {id: [addr]}}` | historique `OwnerChange`, `WalletChange`, `ApprovalChange` et `OperatorChange` filtré `≤ B`, rejoué dans l'ordre (bloc, logIndex) | **nouveau** `graph.load_identity_json` (~20 lignes) : remplace `load_identity(state, logs, approved)`, qui attend des logs bruts |
| `set_edges.json` (contrôle) | `[{setId, client, agentId, w, decidingTag, feedbackIndex, rejected}]` | `SetEdge` pour l'ensemble `ref` | test différentiel `tests/test_indexer_parity.py` : `build_graph(...)` doit donner les mêmes arêtes |

- **Point-in-time sans « time travel ».** Aucune API d'état historique n'est documentée. C'est pourquoi la couche 1 est **en ajout seul et datée par bloc** : n'importe quel état passé se rejoue par filtre `blockNumber ≤ B`. `SetEdge` n'est que l'état courant ; le solveur recalcule ses arêtes depuis les fichiers.
- **Pagination** : Hasura accepte `limit` / `offset` et `order_by`. On pagine par clé (`id_gt`) par tranches de 1 000. La limite de lignes du Cloud est NON TROUVÉE.
- **Écart à trancher avec le chantier 04.** `graph.py` applique encore la règle « ancien owner » (`past_owners`) et les modes `address` / `relay`. Or **D20 a supprimé l'ancien owner et impose la copie de ligne**. L'export fournit quand même `pastOwners`, pour un `edgeFilterId` facultatif, et `WalletAgents` rend la copie de ligne directe. C'est le chantier 04 qui met `build_graph` à jour.
- **Écran 07** : il lit directement GraphQL (souscriptions WebSocket, DOC) pour les tables à l'état `Finalized`. Le verdict du disjoncteur passe par `monadLogs` à `Voted` (voir `monad-dev-et-soumission.md` §A2). HyperSync ayant ~1 bloc de retard sur la tête (MESURÉ en vague 1), l'indexeur ne fait **pas** l'affichage à la milliseconde.

---

## 8. Analytique HyperSync (hors Cloud, zéro event consommé)

Dossier `ancre-indexer/analytics/`, Python (`hypersync` 1.2.1) + pandas, sorties en Parquet (DOC : clients). Le token est nécessaire (401 sinon, MESURÉ en vague 1).

**Q1 : tous les avis 8004, par chaîne (19 chaînes)**
```python
q = hypersync.Query(
  from_block=DEPLOY[chain],
  logs=[hypersync.LogSelection(address=[REP], topics=[[TOPIC_NEWFEEDBACK]])],
  field_selection=hypersync.FieldSelection(
    log=[LogField.BLOCK_NUMBER, LogField.LOG_INDEX, LogField.TRANSACTION_HASH, LogField.TOPIC1, LogField.TOPIC2, LogField.DATA],
    transaction=[TransactionField.HASH, TransactionField.FROM, TransactionField.TO]))   # join Default : tx des logs
```
Mesures par chaîne :
- concentration (part du premier noteur par agent, indice de Gini) ;
- part des valeurs hors bornes (`|v| = 1e38`) ;
- part des avis dont le `tx.from` ≠ `client` (appel relayé par un contrat) ;
- **taux de survie ANCRE** : `solver/graph.build_graph` sous le schéma de référence, appliqué au snapshot de chaque chaîne.

**Q2 : rafales d'enregistrement.** Logs `Registered` joints aux transactions, groupés par (`tx.from`, `tx.to`, seau de blocs). Ça détecte les fermes à déployeur unique ou à factory, du type Spawn (~300 agents/h, CLAUDE.md §3). C'est le cas AM-5.5 : on le détecte, mais ce n'est **pas** ce qu'ANCRE démontre.

**Q3 : acteurs multichain.** Intersection, par adresse, des ensembles {noteurs, owners, wallets} entre chaînes. Graphique : « N adresses notent ou possèdent des agents sur ≥ 3 chaînes ». C'est la vue inter-chaînes qu'on refuse de mettre en `@crossChain` (§5).

**Q4 : bloc de déploiement exact** de chaque registre (premier `Upgraded`), en particulier Monad testnet (§2.1).

**Livrable visuel** : un graphique « part des avis 8004 qui ne créent aucune arête ANCRE, par chaîne ».
- Sur Monad : 7 arêtes pour 9 188 avis sous le filtre `reference` (MESURÉ, R4).
- C'est la phrase de l'acte 1 étendue à tout l'écosystème, avec des données que le Cloud gratuit ne pourrait pas contenir (Base ~490 k avis).
- Outils de mise au point : Query Builder (builder.hypersync.xyz), `curl` avec bearer (vague 1 §3).

---

## 9. Déploiement et publicité

### 9.1 Budget d'events sur le Cloud gratuit

| Chaîne | Events | Statut |
|---|---|---|
| Monad 143 | ≈ 41 800 | MESURÉ §2.2 |
| Monad 10143 | ≈ 8 000 à 12 000 | ESTIMÉ, 8004scan : 1 849 agents / 1 530 avis, environ 4 events par agent + 1 par avis |
| Arbitrum | ≈ 6 300 | ESTIMÉ, 1 460 agents / 495 avis |
| Optimism | ≈ 2 500 | ESTIMÉ, 534 / 334 |
| Polygon | ≈ 2 800 | ESTIMÉ, 564 / 508 |
| **Sous-total** | **≈ 62 000** | ESTIMÉ |
| Marge restante | ≈ 38 000, à partager entre notre trafic de démo (ferme, chantier 06) et le trafic tiers qui a repris sur Monad (95 avis en 24 h) | ESTIMÉ |

- **Règle** : la ferme de démo tourne sur **10143**, ou sur le mainnet avec au plus quelques milliers d'events.
- **Repli** : retirer 42161, 10 et 137 du déploiement Cloud (`skip: true`, DOC) et garder le multichain complet en auto-hébergement et dans la vidéo.

### 9.2 Calendrier (PROPOSÉ)

1. **28/09 à 30/09, en local** (Node v24.21, Docker 29.8, MESURÉ en vague 1) :
   - initialisation : `pnpx envio init` depuis `ancre-indexer/`, puis `envio skills update` **depuis ce dossier** ;
   - validation sur 143 avec `end_block: 108434518` contre les critères du brief 03 §7 : 9 188 avis, 7 771 couples, 10 261 mints, 72 transferts, 178 wallets / 1 773 agents, 78 avis de #8317 ;
   - puis ajout des 4 autres chaînes et **décompte réel des events** (métriques `envio metrics`).
2. **01/10, déploiement Cloud n° 1** : validation du build (version exacte `envio` 3.12.1, toutes les dépendances épinglées, pnpm, variables `ENVIO_*` saisies dans l'interface).
3. **Après déploiement du contrat ANCRE (chantier 02), déploiement n° 2** : ajout de l'adresse et de son `start_block`.
   - Chaque push réindexe depuis `start_block`, sans coupure (vague 1).
   - Plafond de 3 déploiements par indexeur : grouper les pushs sur une branche `deploy`.
4. **Déploiement final entre le 06 et le 10/10.** À 30 jours de durée de vie, il expire entre le 05 et le 09/11, donc après la fin du jugement (27/10) et les résultats (03/11).
   - **Une requête au moins tous les 7 jours** (cron ou écran de démo), pour ne pas déclencher la suppression pour inactivité.
5. **Repli** : auto-hébergement (docker-compose de `enviodev/local-docker-example`), sans limite d'events, avec `ENVIO_API_TOKEN`.

### 9.3 Ce qui doit être public

Le bounty exige un dépôt public avec `config.yaml`, `schema.graphql` et les handlers.

**Recommandation : un dépôt séparé `ancre-indexer`**, licence MIT ou Apache-2.0 (CHOIX de Hugo), contenant :
- `config.yaml`, `schema.graphql`, `src/`, `test/` ;
- `abis/` : seulement l'ABI d'`AnchoredReputation`, **pas** le code source du contrat ;
- `src/schema_reference.json` (copie) ;
- `analytics/`, `README.md` (endpoint, déclaration de l'usage d'outils IA, Rules §4.1.4, SECONDAIRE) ;
- **rien** du CR du conseil.

Pourquoi un dépôt séparé :
1. le Cloud interdit les imports hors du dossier de l'indexeur ;
2. le monorepo peut rester privé (CLAUDE.md §5) sans bloquer le bounty ;
3. Headwater et ColinkaMir ne voient pas le solveur.

**Quand le rendre public : à trancher par Hugo.** Les Rules §7.2 (SECONDAIRE) diraient « public throughout ». La recommandation du tour 5 est « public à la soumission ». Un dépôt privé connecté au Cloud via la GitHub App semble possible, puisque l'app demande l'accès aux dépôts choisis, mais ce n'est NON VÉRIFIÉ pour un dépôt privé.

---

## 10. Tests (qualité, critère du bounty)

Tests `createTestIndexer` + Vitest, avec `simulate` (DOC) :
1. **#4, slash puis review** (`0xea0b` : `slash −100` à l'index 1, `review +1` à l'index 2) → `SetEdge(ref).w = −10000` (D14).
2. **#8317** : 78 avis de son propre `agentWallet` → `clientWasController = agentWallet`, `SetEdge.rejected = CONTROLLER_WALLET`, `Actor.selfRatings = 78`.
3. **Transfert** : `MetadataSet(agentWallet, vide)` puis `Transfer` → wallet 0x0, `WalletAgents` mis à jour, approved à 0x0.
4. **1e38** → `OUT_OF_BOUNDS`, sans repli sur un avis plus ancien.
5. **Audit** : on rejoue `solver/vectors/mainnet_slash_anchor.json`.
   - Avec `calldata.rows` en `transaction.input`, on attend `graphRootRecomputed == expected.graphRoot` et `verdict = MATCH`.
   - Avec la variante fabriquée (0x0730 → #4, AM-5.9), on attend `FABRICATED = 1`.
6. **Test E2E** sur 143 sur une plage fixée, avec instantané.
7. **Parité avec le solveur** (§7) : mêmes arêtes que `build_graph` sur le snapshot du bloc 108 434 518.

---

## 11. Risques et inconnues

| # | Risque ou inconnue | Effet | Parade |
|---|---|---|---|
| 1 | **Pas de token HyperSync** (création manuelle) | Pas de dev local, pas d'analytique | Hugo le crée (§12). Sur le Cloud, pas de token nécessaire (DOC) |
| 2 | Quota de 100 k events dépassé (trafic tiers qui reprend, ferme de démo) | Suppression du déploiement après 7 + 3 jours | Décompte après le premier run local ; `skip` sur les petites chaînes ; ferme sur le testnet ; repli en auto-hébergement |
| 3 | `submitCertificate` appelé via un contrat (Safe, multicall, relais) | `tx.input` n'est pas l'appel décodable → `UNDECODABLE` | Appel direct imposé dans nos scripts ; sinon auditeur Python hors ligne. Pas de traces HyperSync pour Monad (DOC) |
| 4 | Encodage des lignes alias (D20) pas encore dans `FORMAT.md` | Le décodeur TS devra suivre | Décodeur généré depuis la même spec que R5 ; test sur les vecteurs |
| 5 | Plusieurs events dans le bloc du certificat, après le log `CertificateSubmitted` | L'état « au bloc » est en réalité l'état « au log » | Documenter : le contrat lit le registre pendant l'exécution de la tx, donc « au log » est la bonne sémantique (à confirmer au chantier 02) |
| 6 | Portage TS des règles, différent du Python (arrondis, tri des tags) | Faux positifs dans l'audit | Test de parité (§10.7) ; même vecteurs normatifs |
| 7 | Ancres YAML ou `${ENV}` dans `address` refusés par la config | Config verbeuse | Dupliquer ; adresses en dur |
| 8 | Block handlers comptés dans le quota (NON TROUVÉ) | Épuisement du quota | Pas de block handler en production ; contrôles par script externe |
| 9 | Upgrade des registres (v2.1.0, PR #80) pendant la fenêtre | Signatures d'events changées ? | `RegistryEvent` + alerte ; D28 (plan B) ; l'indexeur ne bloque pas, il signale |
| 10 | Bloc exact de déploiement du testnet inconnu | Aucun (start 0 avec HyperSync) | Requête Q4 |
| 11 | DNS `*.hypersync.xyz` en SERVFAIL chez certains FAI (DOC troubleshooting) | Échec en local | Résolveur 1.1.1.1 |
| 12 | Headwater publie un endpoint et ajoute l'identité avant nous | Moins d'écart | Notre écart tient à l'audit du contrat et au multichain, pas au simple fait d'indexer |

---

## 12. Ce que Hugo doit faire

1. **Créer le token Envio** : https://envio.dev/app/api-tokens (connexion GitHub ; impossible à créer par programme, DOC).
   - Le placer dans `ancre-indexer/.env` (`ENVIO_API_TOKEN=…`, fichier gitignored).
   - Dire s'il donne accès à HyperRPC (403 probable, vague 1). Ce n'est pas bloquant : on n'en a pas besoin.
2. **Autoriser la création du dépôt `ancre-indexer`** (privé d'abord) et choisir la licence.
3. **Trancher la date de publication** du dépôt (Rules §7.2, à relire dans la modale de la plateforme).
4. **Au moment du déploiement Cloud (≥ 01/10)** :
   - se connecter à https://envio.dev/app/login ;
   - installer la GitHub App « Envio Deployments » sur `ancre-indexer` ;
   - saisir `ENVIO_MONAD_RPC` et l'éventuelle `ENVIO_ALERT_URL` dans l'interface.
5. **Valider le budget d'events** de la ferme de démo avec le chantier 06 : testnet par défaut.
6. **Dire si le trafic des 95 nouveaux avis** sur Monad (§2.2) doit être signalé au conseil, puisqu'il invalide AM-3.9 (« registre dormant »).

---

### Sources (lues le 27/09/2026)

- Envio : [effect-api](https://docs.envio.dev/docs/HyperIndex/effect-api.md) · [event-handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers.md) · [preload-optimization](https://docs.envio.dev/docs/HyperIndex/preload-optimization.md) · [multichain-indexing](https://docs.envio.dev/docs/HyperIndex/multichain-indexing.md) · [schema](https://docs.envio.dev/docs/HyperIndex/schema.md) · [config-schema-reference](https://docs.envio.dev/docs/HyperIndex/config-schema-reference.md) · [block-handlers](https://docs.envio.dev/docs/HyperIndex/block-handlers.md) · [testing](https://docs.envio.dev/docs/HyperIndex/testing.md) · [reorgs-support](https://docs.envio.dev/docs/HyperIndex/reorgs-support.md) · [hosted-service-deployment](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment.md) · [hosted-service-billing](https://docs.envio.dev/docs/HyperIndex/hosted-service-billing.md) · [hosted-service-features](https://docs.envio.dev/docs/HyperIndex/hosted-service-features.md) · [hypersync-query](https://docs.envio.dev/docs/HyperSync/hypersync-query.md) · [hypersync-clients](https://docs.envio.dev/docs/HyperSync/hypersync-clients.md) · [hypersync-supported-networks](https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks.md) · exemple Python `enviodev/hypersync-client-python/examples/all_erc20_transfers.py`.
- Concurrent : https://github.com/Sireadell/headwater-indexer (`config.yaml`, `schema.graphql`, `README.md`, `src/effects/walletHistory.ts`).
- Mesures : `eth_getLogs` sur `rpc1.monad.xyz` et `arb1.arbitrum.io`, `eth_getCode` sur `mainnet.optimism.io`, `polygon.drpc.org` et `rpc-testnet.monadinfra.com`, `getVersion()` sur les 5 chaînes, registres npm et PyPI. Fichiers : `scratchpad/nf_after.json`, `scratchpad/logs.json`.
- Projet : `CLAUDE.md`, `docs/conseil/CR-conseil.md` (D14 à D38, tour 5), `docs/chantiers/03-indexeur.md`, `solver/FORMAT.md`, `solver/graph.py`, `contracts/src/AnchoredReputation.sol` (events l.146-159).

# Alchemy sur Monad : ce qui existe, et 3 intégrations pour ANCRE

> Rédigé le **2026-10-06** pour le bounty « Best Projects using Alchemy » (D54, fiche officielle dans `docs/conseil/bounties-sponsors.md`). Aucun compte créé, aucune clé utilisée. Les sondes ont été faites **sans clé** sur `https://rpc1.monad.xyz`.
> Légende : **MESURÉ** (sonde ce jour), **DOC** (page Alchemy lue ce jour), **NON VÉRIFIÉ**.
> Critères du bounty : qualité de l'intégration, exécution technique, utilité et innovation. Une intégration « significative » est exigée, avec une vidéo optionnelle de 2 minutes au plus. Date limite : 14/10, 05:59 GMT+2.

---

## 1. Ce qu'Alchemy sert sur Monad au 06/10

### 1.1 `rpc1.monad.xyz` est bien Alchemy (MESURÉ, 06/10)

- Les réponses portent l'en-tête **`x-alchemy-trace-id`**. `eth_getProof` renvoie `"eth_getProof is not available on the MONAD_MAINNET. For more information see our docs: https://docs.alchemy.com/..."`. `eth_chainId` vaut `0x8f` (143). **Ce que dit CLAUDE.md est confirmé.**
- `rpc2.monad.xyz` (passerelle eRPC, en-têtes `x-erpc-*`) a renvoyé **le même message d'erreur Alchemy**. Alchemy fait donc partie de ses fournisseurs amont, au moins pour cette méthode.
- Sur ce point d'accès public, **sans clé**, ces méthodes répondent :
  - `alchemy_getAssetTransfers` (Transfers API) : `external`, `erc20` et `erc721` ;
  - `alchemy_getTokenBalances` et `alchemy_getTokenMetadata` (Token API) : USDC `0x7547…b603` renvoie 6 décimales ;
  - `alchemy_getTransactionReceipts` ;
  - les méthodes de bundler : `eth_supportedEntryPoints` renvoie les EntryPoints v0.6 `0x5FF1…2789`, v0.7 `0x0000…a032`, `0x4337084D…F108` et `0x43370900…D009`, et `rundler_maxPriorityFeePerGas` répond.
- **Refusés** :
  - `debug_traceTransaction` et `trace_block` : « not available on the public rpc - upgrade to Pay As You Go, or Enterprise » ;
  - `alchemy_simulateExecution` et `alchemy_simulateAssetChanges` : « Unsupported method … on monad ».
- Les Webhooks, le Gas Manager et les Smart Wallets passent par un compte Alchemy. Ils ne se testent pas sans clé.

### 1.2 Tableau des services

| Service | Mainnet 143 | Testnet 10143 | Source | Remarque |
|---|---|---|---|---|
| Node API (JSON-RPC, WSS) | oui | oui | DOC [alchemy.com/rpc/monad](https://www.alchemy.com/rpc/monad), [/rpc/monad-testnet](https://www.alchemy.com/rpc/monad-testnet) ; MESURÉ sur rpc1 | `https://monad-{mainnet,testnet}.g.alchemy.com/v2/KEY`. `monadLogs` et `monadNewHeads` sont documentés ([monadlogs](https://www.alchemy.com/docs/reference/monadlogs)) |
| **Webhooks** (Custom GraphQL, Address Activity, NFT Activity) | oui | oui | DOC : « Webhooks » listé sur les 2 pages ; `MONAD_MAINNET` et `MONAD_TESTNET` dans l'énumération `network` de [Create webhook](https://www.alchemy.com/docs/data/webhooks/webhooks-api-endpoints/notify-api-endpoints/create-webhook.md) | Le détail par type de webhook n'est donné que sur le tableau de bord (page « Chains », derrière une connexion). **Custom sur Monad : NON VÉRIFIÉ type par type**, à confirmer avec le bouton « Test Webhook ». Latence et état de commit (Proposed ou Finalized) : NON VÉRIFIÉ |
| Bundler (ERC-4337) | oui | oui | DOC [wallets/supported-chains](https://www.alchemy.com/docs/wallets/supported-chains) ; MESURÉ (`eth_supportedEntryPoints` sur rpc1) | |
| Gas Manager (sponsoring, paiement du gas en ERC-20) | oui | oui | DOC, même page | **Offre gratuite : sponsoring sur le testnet seulement.** Sur le mainnet, il faut l'offre Pay As You Go, avec **8 % de frais** (DOC [pricing](https://www.alchemy.com/pricing)) |
| Smart Wallets / Account Kit, « Wallet APIs » | oui | oui | DOC (supported-chains) | |
| Transfers API | oui | **non** | DOC (rpc/monad, rpc/monad-testnet) ; MESURÉ sur le mainnet | |
| Token API | oui | **non** | DOC ; MESURÉ | |
| NFT API, Prices API | oui | non | DOC | |
| Debug API | oui (offre payante) | oui | DOC ; MESURÉ : refusé sur le point d'accès public | Gratuit : non. Pay As You Go : oui (DOC pricing) |
| Trace API | **contradictoire** | non | DOC rpc/monad : « not supported » ; [Monad API Overview](https://www.alchemy.com/docs/monad/monad-api-overview.md) : listé | Absent même de Pay As You Go (DOC pricing). À considérer comme **absent** |
| UserOp Simulation API | oui | oui | DOC | |
| Subgraphs | non mentionné | non mentionné | DOC (aucune des pages) | |

**Offre gratuite** (DOC pricing, 06/10) : 30 M CU par mois, 25 rps, **5 apps et 5 webhooks**, sponsoring de gas sur le testnet seulement, pas de Debug ni de Trace.

---

## 2. Trois intégrations significatives, classées

Le filtre appliqué à chaque piste : **qu'est-ce qui casse, ou n'existe pas, si on retire Alchemy ?** Si la réponse est « rien », la piste est décorative (CLAUDE.md §2).

### ① Custom Webhook sur les registres : le déclencheur de la recertification et du surveillant

- **Service** : Alchemy **Custom Webhook** (`webhook_type: GRAPHQL`), un par réseau (143, et 10143 pour les répétitions). Le filtre `logs(filter: {addresses: [...], topics: [[...]]})` porte sur :
  - le registre Reputation `0x8004BAa1…9b63` (testnet `0x8004B663…8713`), topics `NewFeedback` = `0x6a4a6174…58febc` et `FeedbackRevoked` = `0x25156fd3…e6d09d` ;
  - le registre Identity `0x8004A169…a432` (testnet `0x8004A818…BD9e`), topic `Transfer` = `0xddf252ad…b3ef` (D35) ;
  - le contrat `AnchoredReputation` (soumissions de certificats, à auditer).
- **Rôle dans ANCRE** : il répond à la question ouverte n° 6 d'ANCRE.md (« qui surveille pendant le jugement, et qui finance la recertification », D27, AM-02.2). Aujourd'hui, `solver/watcher.py` **interroge le RPC à intervalle fixe** (`time.sleep(a.interval)`). Avec le webhook, Alchemy pousse chaque nouvel événement des registres vers un point d'accès HTTPS signé (HMAC, en-tête `X-Alchemy-Signature`). Le service lance alors l'une de ces actions :
  - un nouvel avis ou une révocation sur une ligne d'ancre : **recertification**, conforme au principe « à chaque changement du graphe » (CLAUDE.md §6) ;
  - un `Transfer` d'un agent certifié : statut TRANSFERRED, puis recertification ;
  - un certificat soumis par un tiers : `audit()`, puis une **preuve d'écart** si besoin (proveEdge (v)). C'est la défense contre AM-5.9 et AM-02.2 pendant les 14 jours de jugement, où personne ne surveille l'écran.
- **Ce qui casse sans Alchemy** : rien d'impossible, mais il faut faire tourner en permanence une boucle de lecture sur un RPC public limité (25 rps, `eth_getLogs` à 100 blocs sur `rpc.monad.xyz`). Le webhook est **la** pièce « temps réel côté serveur » qui manque à l'architecture §4.6.
- **Partage avec Envio** : Envio reste la base historique et l'auditeur (03, D42). Alchemy sert de **déclencheur** (le surveillant 04). Les deux rôles ne se recouvrent pas. Il faut le dire tel quel dans les deux soumissions.
- **Chantiers** : 04, à titre principal (un récepteur dans `watcher.py` : vérification HMAC → `watch_once(from_block=lg.block-1, to_block=lg.block)`) ; 06 pour la répétition sur le testnet.
- **Coût** : **0,5 à 1 jour**. La boucle d'audit existe déjà ; il reste le récepteur HTTP, la vérification de signature, la déduplication (idempotence par `txHash:logIndex`) et un repli sur la lecture périodique si le webhook se tait.
- **🧑 Ce qu'il faut à Hugo** :
  - un compte Alchemy (offre gratuite suffisante : 5 webhooks) ;
  - une **clé d'authentification Notify** (`X-Alchemy-Token`) et la **clé de signature** du webhook ;
  - une **URL HTTPS publique** pour le récepteur : un petit VPS, ou un tunnel (Cloudflare Tunnel ou ngrok) pendant la démo. Pour la période du 13 au 27/10, ce doit être un hôte permanent.
- **À mesurer avant de le pitcher** : le délai entre le bloc et la réception du webhook sur Monad, et l'état de commit au moment de l'envoi. S'il s'agit de Finalized, il faut compter environ 2 blocs en plus de `monadLogs`. **Ne pas** s'en servir pour l'écran 07 : `monadLogs` en WSS reste plus rapide (Proposed).
- **Vidéo (≤ 2 min)** :
  - 0:00 : une ancre pose un `slash` sur le testnet ou le mainnet ;
  - 0:05 : le journal du récepteur affiche « Alchemy webhook · NewFeedback · bloc N · signature OK » ;
  - 0:10 : le certificateur recalcule et soumet le certificat, `assess` passe à VETOED ;
  - 0:20 : un tiers soumet un certificat fabriqué (le script de la faille AM-5.9) ;
  - 0:30 : le webhook se déclenche, `audit` trouve FABRICATED, `proveEdge` est envoyé, le certificat est corrigé.
  - En surimpression : la configuration GraphQL du webhook dans le tableau de bord Alchemy (5 secondes).

### ② Transfers API : la provenance des fonds de la ferme, mesurée, dans `explain()` et à l'écran

- **Service** : `alchemy_getAssetTransfers`, catégorie `external`, sur le mainnet uniquement (pas de Transfers API sur le testnet). Il **fonctionne déjà sans clé sur rpc1** (MESURÉ). Une clé donne 25 rps au lieu de 15.
- **Mesure du jour (MESURÉ, 06/10, 150 noteurs tirés au hasard parmi les 7 665 clients d'Eve-8004 #182)** :
  - **150 sur 150** ont reçu leur **premier transfert de MON** de `0x97cD97CF…0996` ;
  - ce wallet est **`ownerOf(182)`**, c'est-à-dire le propriétaire d'Eve (MESURÉ, `cast call`) ;
  - le montant est **toujours 11,0 MON**, soit exactement la réserve de 10 MON plus 1 MON de frais (CLAUDE.md §7) ;
  - environ 0,4 s par appel ;
  - l'échantillon de 12 tiré juste avant donne le même résultat.
  - On retrouve la mesure de ColinkaMir, en plus précis.
- **Rôle dans ANCRE** : ce n'est **pas** un filtre d'arêtes. PPR tue déjà la ferme, et une preuve de financement ne suffit pas contre les Sybil (CLAUDE.md §6). C'est l'**explication causale** de `explain()` et de l'écran 07 : « 7 665 avis, 1 seul financeur, qui est le propriétaire noté ; ANCRE donne 0 sans avoir eu besoin de le savoir ». La phrase montre au jury que le score correspond à une réalité du terrain. Elle n'est pas affirmée.
  - Usage secondaire : vérifier la parité de l'historique des propriétaires (D35) contre les `Transfer` ERC-721 de l'Identity registry (`category: ["erc721"]`, MESURÉ, la requête répond).
- **Chantiers** : 07 (panneau « pourquoi 0 ? ») et 04 ou 09 (un tableau dans `solver/RESULTS.md`, avec le chiffre sur les 7 665 noteurs).
- **Coût** : **0,5 jour**. Un script Python de 30 lignes, le scan complet (≈ 50 min à 15 rps, ou 7 665 appels avec une clé), un JSON figé pour l'écran.
- **🧑 Ce qu'il faut à Hugo** : rien pour la mesure (rpc1 suffit). Une clé si l'on veut que la soumission montre « notre app Alchemy », ce qui est plus défendable devant le jury Alchemy qu'un point d'accès public.
- **Limite honnête** : prise seule, c'est une intégration **de données**, qui convainc moins qu'① sur le critère « qualité de l'intégration ». Elle ne vaut que comme complément.
- **Vidéo** : un plan de 10 s. Le graphe de la ferme se replie sur un seul nœud financeur, avec le compteur « 7 665 / 7 665 financés par l'owner (Alchemy Transfers API) », et le score ANCRE de #182 est à 0.

### ③ Smart Wallet + Gas Manager pour les ancres : poser un veto sans MON

- **Service** : Account Kit, Modular Account v2 (ERC-4337) et le Bundler, avec une politique **Gas Manager** limitée à `giveFeedback` et `revokeFeedback` sur le registre Reputation.
- **Rôle dans ANCRE** : une ancre (un auditeur, un assureur) peut poster un veto **sans détenir de MON**, donc sans immobiliser la réserve de 10 MON par compte (CLAUDE.md §7). Le propriétaire de l'ensemble paie le gas de ses ancres (D27). L'adresse du noteur devient celle du smart account ; le garde-fou du registre (owner, opérateurs) n'est pas affecté.
- **Risques réels** :
  1. **AM-03.3 en plus grand** : l'indexeur et `decode_submission` lisent le `tx.input` d'un appel direct (journal 03). Une UserOp arrive sous la forme `handleOps` et l'appel n'est plus décodable sans `debug_traceTransaction`, qui est payant (Debug API, Pay As You Go). Il faut donc **ne jamais faire passer `submitCertificate` par un smart account**, et vérifier que l'indexeur se fie aux events et non à l'input.
  2. **Mainnet = Pay As You Go, avec 8 % de frais** : il faut une carte bancaire. Le sponsoring gratuit ne marche que sur le testnet.
  3. Chevauchement avec Mera : les clés d'ancre sont censées venir du passkey (D43), et le bounty Mera **exclut** la signature de transactions depuis un wallet.
- **Chantiers** : 06 (scène du disjoncteur), 02 ou 05 (aucun changement de contrat).
- **Coût** : **1 jour, voire plus** (SDK, politique, débogage des UserOps sur Monad).
- **🧑 Ce qu'il faut à Hugo** : un compte, une politique Gas Manager, une **offre payante** pour le mainnet.
- **Vidéo** : l'ancre a un solde de 0 MON, elle pose le veto, le paiement est refusé au bloc suivant, et on montre la ligne « gas sponsorisé par Alchemy Gas Manager ».

### Écartées

- **Debug API pour auditer les certificats relayés (AM-03.3)** : utile, mais payante (Pay As You Go), et le cas ne se présente pas tant qu'on impose l'appel direct (ENCODING.md).
- **Trace API** : absente sur Monad (le DOC est contradictoire, la sonde dit non).
- **Subgraphs** : aucune trace de support de Monad.
- **Utiliser seulement `rpc1`** (« acquis » selon la fiche du 27/09) : c'est un point d'accès public, sans compte et sans service propre à Alchemy. C'est **insuffisant** pour « intègre de façon significative ».

---

## 3. Recommandation

**Faire ① (Custom Webhook → surveillant et recertification), et y joindre ② (Transfers API) dans la même soumission.** Budget total ≤ 1,5 jour, dans le chantier 04.

- ① est la seule piste où Alchemy **tient un rôle d'architecture**. Elle comble un trou que le projet a déjà reconnu (« qui recertifie, qui surveille du 13 au 27/10 »). Elle reste vraie après la soumission, puisque le surveillant tourne pendant le jugement, et elle tient dans l'offre gratuite.
- ② coûte une demi-journée. Elle apporte un **chiffre mesuré** (150/150 noteurs financés à 11 MON par l'owner d'Eve) qui rend la démo sensible. La mesure est déjà faite à moitié et ne demande aucune clé.
- ③ est écartée à 6 jours de la fin : elle est payante sur le mainnet, elle aggrave AM-03.3 et elle frotte avec Mera.

**🧑 Action pour Hugo** : créer un compte Alchemy (offre gratuite), une app « ANCRE » sur Monad mainnet et testnet, puis transmettre :

1. la clé d'API ;
2. la clé d'authentification Notify ;
3. l'URL HTTPS du récepteur (VPS ou tunnel) ; la clé de signature est générée à la création du webhook.

Avant d'écrire le pitch, mesurer la latence du webhook et son état de commit sur le testnet.

---

## Sources (consultées le 2026-10-06)

- https://www.alchemy.com/monad : RPC, Gas Manager et Webhooks listés
- https://www.alchemy.com/rpc/monad et https://www.alchemy.com/rpc/monad-testnet : listes de produits, avec Trace « not supported »
- https://www.alchemy.com/docs/wallets/supported-chains : Bundler, Gas Sponsorship, ERC20 Gas Payments, BSOs, avec ✅ sur 143 et 10143
- https://www.alchemy.com/docs/monad/monad-api-overview.md : méthodes, et une liste « Related APIs » qui inclut Trace (contradiction)
- https://www.alchemy.com/docs/data/webhooks/webhooks-api-endpoints/notify-api-endpoints/create-webhook.md : énumération `network` (MONAD_MAINNET, MONAD_TESTNET) et `webhook_type: GRAPHQL`
- https://www.alchemy.com/docs/reference/custom-webhook.md et https://www.alchemy.com/docs/reference/custom-webhook-filters.md : filtres `logs(filter:{addresses, topics})`, un réseau par webhook
- https://www.alchemy.com/pricing : offre gratuite (5 webhooks, sponsoring sur le testnet seulement, pas de Debug ni de Trace) ; Pay As You Go (0,525 $ par million de CU, 8 % de frais sur le gas sponsorisé, Debug oui, Trace non)
- Sondes `curl` et `cast` sur `https://rpc1.monad.xyz`, `rpc2`, `rpc3`, `rpc.monad.xyz` et `testnet-rpc.monad.xyz` ; snapshot `solver/data/mainnet-108835675.feedbacks.json.gz` pour l'échantillon de noteurs d'Eve

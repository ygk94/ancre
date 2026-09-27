# Remix `llm-cross-idea` : bounty Envio × ANCRE

> **Vague 3, 2026-09-27.** Protocole `llm-cross-idea` : 5 explorateurs, anonymisation, 4 juges, 1 président. Les 9 rôles sont joués par un seul modèle.
> **Idée de base** : `design-indexeur-envio.md`.
> **Sources** :
> - fiche officielle Envio (`docs/conseil/bounties-sponsors.md`) ;
> - `docs/ressources/envio.md` ;
> - le dépôt Headwater, tel que résumé dans le design ;
> - `ANCRE.md` (décisions D1 à D38).
>
> **Statut des chiffres** : MESURÉ ou DOC quand ils viennent de ces sources ; **NON VÉRIFIÉ** pour tout ce qui porte sur d'autres chaînes que Monad.

## Entrées (condensées)

### Idée de base
Un indexeur HyperIndex qui fait trois choses :
1. il **compile en continu le graphe signé que le contrat doit certifier**, avec les règles D14, D15, D16 et D20, par ensemble d'ancres, sur 5 chaînes (143, 10143, Arbitrum, Optimism, Polygon) ;
2. il **audite chaque certificat ANCRE** : il décode le calldata et compare chaque arête au registre dans l'état exact du bloc du certificat, puis produit des entités `Discrepancy` avec la preuve (v) prête à soumettre ;
3. il lance un scan HyperSync sur 19 chaînes, hors Cloud.

### Jury et critères (fiche officielle)
- Profondeur : multichain, schéma non trivial, entités dérivées ou agrégées, analytique HyperSync.
- Produit live et correct.
- Originalité.
- Qualité du code.
- Livrables : dépôt public avec `config.yaml`, `schema.graphql` et les handlers ; un consommateur des données ; une démo de bout en bout.

### Contraintes dures
- 16 jours avant la clôture.
- Plan Cloud gratuit : 100 k events et 30 jours. Monad 143 ≈ 41,8 k events (MESURÉ), les 5 chaînes ≈ 62 k (ESTIMÉ).
- Les handlers s'exécutent deux fois ; les appels RPC passent par l'Effect API.
- Pas d'état historique au-delà de ~40 k blocs sur Monad : tout se reconstruit depuis les events.
- Un token doit être créé par Hugo.
- **Pas de score global (D13).**
- **Fait nouveau** : 95 nouveaux avis sur Monad depuis le bloc 108 483 651, venant de 20 clients. Le registre n'est plus dormant.

### Source d'enrichissement : primitives Envio (DOC)
- HyperIndex v3.13 : `config.yaml`, `schema.graphql`, handlers TypeScript, GraphQL (Hasura).
- Multichain parallèle, avec `disable_default_cross_chain`.
- `@derivedFrom`, `@internal`. Aucun agrégat déclaratif : on les maintient à la main.
- Effect API (`createEffect`, cache, limite de débit).
- Reorgs gérées jusqu'à 200 blocs, détection garantie avec HyperSync.
- **Wildcard indexing** : indexer un event quelle que soit l'adresse, avec des filtres par topic et par chaîne.
- Block handlers.
- `createTestIndexer` pour les tests.
- HyperSync : scan de logs par topic sur tout l'historique, jointures logs × transactions × blocs, 19 chaînes où les registres existent. Les requêtes ne consomment aucun event Cloud.
- HyperRPC : payant.
- Envio Cloud : GitHub App, plan gratuit.
- Skills Claude Code (`envio skills update`) et serveur MCP de docs.

### Ce qu'on ne veut pas
- La provenance de financement et les labels Nansen : c'est Headwater et ColinkaMir.
- Un score ou passeport multichain unique : contraire à D13.
- Une brique IA décorative.

---

## Étape 1 : cinq explorateurs

### Le Minimaliste : « Le compilateur de normes »

**Pitch en une ligne :** L'indexeur exécute la norme ANCRE, et un test prouve que ses arêtes sont identiques, octet pour octet, à celles du solveur.

**Le remix :**
- De l'idée de base, on garde seulement la compilation des arêtes normatives.
- D'Envio, on garde HyperIndex, les entités dérivées et `createTestIndexer`.
- Le tout **sur Monad 143 seul**.
- Tout le reste est coupé : audit des certificats, scan de 19 chaînes, testnet.

**Éléments intégrés :**
- `Feedback` en historique append-only, puis `EdgeState` par (ensemble, client, agent, tag), puis `CombinedEdge` (dominance du négatif).
- `Controller` et `WalletShare` (copie de ligne D20), reconstruits depuis `Transfer` et `MetadataSet`.
- `createTestIndexer` rejoue les vecteurs `solver/vectors/*.json`.
- Un export GraphQL vers `solver/from_indexer.py`.

**Pourquoi cet angle :** le critère « produit live et correct » est le seul qu'on ne peut pas rattraper à la fin. Un indexeur mono-chaîne juste et testé bat un indexeur multichain à moitié fini. Les 95 nouveaux avis fournissent des données vraiment live, sans rien inventer.

**Périmètre du premier jet :**
- `config.yaml` avec les deux registres Monad 143 et les 7 events.
- Environ 10 entités.
- Un test de parité indexeur/solveur au bloc 108 434 518.
- Un déploiement Cloud.

### Le Tendance : « La tour de guet agentique »

**Pitch en une ligne :** Un agent veille l'indexeur, repère chaque certificat frauduleux et soumet lui-même la preuve de fabrication, sans humain.

**Le remix :**
- L'indexeur devient la mémoire d'un **agent surveillant**.
- Cet agent lit le GraphQL Envio. Dès qu'une `Discrepancy` apparaît, il prépare la preuve (v) et la soumet.
- Il est exposé en outil MCP, pour que d'autres agents (le plugin MetaMask) interrogent l'état des arêtes avant de payer.
- La tendance, c'est la combinaison agents, MCP et x402 ; Envio fournit la donnée fiable.

**Éléments intégrés :**
- Une entité `Discrepancy`, avec un block handler qui la marque « à contester ».
- Un bot (TS) qui s'abonne au GraphQL et soumet `proveFabrication`.
- Un serveur MCP minimal : `ancre.edges(agentId)`, `ancre.discrepancies()`.
- Les skills Envio pour construire l'indexeur.

**Pourquoi cet angle :** la question « qui surveille pendant le jugement ? » (tour 5) reste ouverte, et un agent qui y répond est dans l'air du temps. Le jury de la track 04 attend des agents.

**Périmètre du premier jet :**
- La `Discrepancy` sur le testnet.
- Un bot qui soumet une preuve.
- Un outil MCP en lecture seule.

### Le Franc-tireur : « Le recensement de la norme »

**Pitch en une ligne :** Nous avons indexé tous les registres ERC-8004 de 19 chaînes, et trouvé la même ferme partout où la norme vit.

**Le remix :**
- L'élément **le moins évident** de la source, c'est le **wildcard indexing** : indexer `NewFeedback` quelle que soit l'adresse qui l'émet.
- On le croise avec l'angle le plus inattendu de l'idée : **ERC-8004 est déployé à la même adresse partout, mais il existe peut-être des forks et des clones ailleurs**.
- L'indexeur devient le premier **recensement** de la norme : où elle est déployée, quelle part de ses avis survit aux règles d'ANCRE, et quelles **signatures de ferme reviennent d'une chaîne à l'autre** (rafales d'enregistrement par déployeur, valeurs à 1e38, un même noteur sur plusieurs chaînes).
- **Pourquoi c'est non évident** : tout le monde indexe *son* registre. Personne n'indexe la norme comme un objet d'étude. Et le wildcard, pensé pour les usines de contrats, sert ici à découvrir des déploiements inconnus.

**Éléments intégrés :**
- Wildcard `NewFeedback` et `Registered`, filtré par topic, sur 5 chaînes en Cloud.
- Scan HyperSync sur 19 chaînes, hors Cloud : part de ferme, rafales, noteurs communs à plusieurs chaînes.
- Entités `Deployment`, `FarmSignature` et `CrossChainActor`.
- Un tableau « survie des avis sous ANCRE, chaîne par chaîne ».

**Pourquoi cet angle :** le critère d'originalité récompense ce qu'on n'a jamais vu. Un recensement transforme l'acte 1 (« le mainnet Monad ment ») en « **la norme ment partout** », ce qui est plus fort pour le pitch de la norme. **Aucun chiffre sur les autres chaînes n'est vérifié.**

**Périmètre du premier jet :**
- Le scan HyperSync de 19 chaînes, avec un tableau de survie.
- L'indexeur wildcard sur 2 chaînes.
- Une carte des déploiements.

### L'Architecte : « Le certificat contre-audité »

**Pitch en une ligne :** Chaque certificat ANCRE est recompilé et contre-audité, au bloc près, par un indexeur multichain qui produit la preuve de fraude.

**Le remix :** c'est l'idée de base poussée au bout.
- Les 5 chaînes sont indexées en parallèle.
- Environ 25 entités : historique append-only, état courant, arêtes normatives par ensemble, identité complète, audit de certificat.
- Le contrat ANCRE est indexé lui-même : on décode les `rows` du calldata et on recalcule `graphRoot`.
- On produit des `Discrepancy` typées (fabrication, gonflement, omission, dilution).
- L'Effect API sert uniquement aux contrôles de cohérence à la tête.
- Un test différentiel TS/Python compare l'indexeur au solveur.
- Le scan HyperSync de 19 chaînes vient en complément.

**Éléments intégrés :**
- Multichain parallèle avec `disable_default_cross_chain`.
- Décodage du calldata du certificat dans un handler (via la transaction).
- Des entités dérivées, qui sont les règles normatives de la norme.
- `createTestIndexer` sur les vecteurs normatifs.
- Des contrôles de cohérence chiffrés : Σ `getLastIndex`, `getClients`.

**Pourquoi cet angle :** c'est la réponse la plus profonde au critère de profondeur. C'est aussi la seule qui **ferme la faille AM-5.9** (le certificat fabriqué) avec un composant existant au lieu de 13,6 M gas on-chain.

**Périmètre du premier jet :**
- L'identité et les arêtes sur 143 et 10143.
- L'audit de certificat sur le testnet.
- Le test différentiel.
- Arbitrum, Optimism et Polygon ensuite.

### Le Stratège : « Le chien de garde des ensembles »

**Pitch en une ligne :** Le propriétaire d'un ensemble d'ancres achète un chien de garde : fraîcheur, fraudes détectées et santé du graphe, en temps réel.

**Le remix :**
- D27 dit que le propriétaire d'un ensemble paie la certification. Il lui faut donc un **produit** : un tableau de bord par `setId`.
- Ce tableau montre l'âge du certificat, les écarts détectés, les nouveaux avis qui toucheraient le support, les agents qui changeraient de statut et la fraîcheur contractuelle.
- L'indexeur Envio est ce produit. C'est le modèle « oracle de réputation » (D27) rendu concret.

**Éléments intégrés :**
- Des entités `SetHealth`, `SupportDelta` et `PendingRecert` par ensemble.
- Des block handlers pour l'âge des certificats.
- Une API GraphQL publique par ensemble.
- Des alertes (webhook) quand eLow approche eLow_max (D36).

**Pourquoi cet angle :** un jury de VC demande « qui paie ? ». Le chien de garde montre que la surveillance a un client identifié, le propriétaire de l'ensemble.

**Périmètre du premier jet :**
- `SetHealth` pour l'ensemble de démo.
- Un écran de santé.
- L'alerte « recertifier ».

---

## Étape 2 : anonymisation

| Version | A | B | C | D | E |
|---|---|---|---|---|---|
| Explorateur | Architecte | Franc-tireur | Minimaliste | Stratège | Tendance |

Correspondance révélée ici au lecteur, pas aux juges.

---

## Étape 3 : quatre juges

### Juge : l'Historien — dimension : nouveauté

| Version | Note | Raison |
|---|---|---|
| A | 8 | Personne, à notre connaissance, n'audite une affirmation on-chain au bloc près avec un indexeur. Headwater indexe les avis, pas les certificats. Des watchtowers existent pour les rollups (NON VÉRIFIÉ pour Envio) |
| B | 9 | Un recensement inter-chaînes d'une norme par wildcard : aucun projet connu. La proximité avec 8004scan est réelle (multi-chaînes), mais 8004scan n'applique aucune règle normative |
| C | 4 | Un indexeur de registre bien testé, c'est classique. La nouveauté tient aux règles appliquées, pas au geste |
| D | 5 | Les tableaux de bord de santé existent partout (monitoring d'oracles). Nouveau seulement par l'objet (`setId`) |
| E | 5 | Un bot qui soumet des preuves de fraude, c'est le motif des watchtowers. Le MCP par-dessus est à la mode, pas neuf |

**Observation transversale :** la vraie nouveauté est dans A et B, et elle est **complémentaire** : A audite *nos* certificats, B audite *la norme*.

### Juge : le Pragmatique — dimension : utilité réelle

| Version | Note | Raison |
|---|---|---|
| A | 9 | Il ferme une faille réelle et mesurée (AM-5.9), sans laquelle ANCRE est falsifiable. Douleur aiguë |
| B | 6 | Utile pour la norme et pour les chercheurs. Aucun utilisateur ne paie pour un recensement |
| C | 7 | Indispensable (le solveur en dépend), mais invisible |
| D | 7 | Le propriétaire d'un ensemble en a besoin, s'il existe. Aujourd'hui, c'est nous seuls |
| E | 6 | L'automatisation des preuves est utile. L'outil MCP est une solution en quête de problème |

**Observation transversale :** l'utilité se concentre sur A. Les autres versions en sont des vues : santé, recensement, bot.

### Juge : l'Ingénieur — dimension : faisabilité

| Version | Note | Raison |
|---|---|---|
| A | 5 | Décoder le calldata depuis la transaction dans un handler est à vérifier : champs `transaction.input` exposés par HyperIndex, et **cas de soumission via un autre contrat** (risque §11 du design). L'état au bloc exact se reconstruit depuis les events, ce qui est faisable mais demande du soin avec la double exécution. Le multichain sur 5 chaînes multiplie les cas |
| B | 6 | Le scan HyperSync est simple, et le wildcard est documenté. Risques : le quota Cloud si le wildcard attrape trop d'events, et **des volumes inconnus** sur les autres chaînes |
| C | 9 | Des briques mûres, un seul réseau, des tests fournis |
| D | 7 | Simple au-dessus de A ou de C. Les block handlers comptent-ils dans le quota ? Inconnu |
| E | 6 | Le bot est simple ; le MCP ajoute une dépendance sans gain ; la soumission automatique exige des clés et du MON |

**Observation transversale :** C est le socle sûr. A est l'ambition risquée, parce que le décodage du calldata est la brique à prouver en premier.

### Juge : le Vétéran — dimension : faisable ET démontrable à temps

| Version | Note | Raison |
|---|---|---|
| A | 7 | La scène « un certificat frauduleux est démasqué en quelques blocs » est **le moment fort**. À condition de couper à 2 chaînes, puis d'étendre |
| B | 7 | « La même ferme sur N chaînes, trouvée en 10 secondes par HyperSync » est **visuellement fort** et quasi gratuit en Cloud. Mais c'est risqué si les données des autres chaînes ne montrent rien |
| C | 6 | Solide, mais il faut un moment fort. Montrer des données justes ne fait pas lever un jury |
| D | 5 | Un tableau de bord sans événement ne produit pas de moment fort |
| E | 5 | Un bot qui soumet une preuve se montre en 20 secondes. Le MCP ne se montre pas |

**Observation transversale :** deux moments forts sont disponibles, **la fraude démasquée (A)** et **la ferme partout (B)**, sur un socle **C**.

---

## Étape 4 : verdict du président

### Rappel des entrées
Un bounty qui récompense la profondeur, du live, de l'originalité et de la qualité. 16 jours. 100 k events. Pas de score global. Une faille réelle (AM-5.9) à fermer. Un registre Monad de nouveau actif (95 avis).

### Matrice des notes

| Version (explorateur) | Nouveauté | Utilité | Faisabilité | Démo à temps | Total |
|---|---|---|---|---|---|
| A (Architecte) | 8 | 9 | 5 | 7 | **29** |
| B (Franc-tireur) | 9 | 6 | 6 | 7 | **28** |
| C (Minimaliste) | 4 | 7 | 9 | 6 | 26 |
| D (Stratège) | 5 | 7 | 7 | 5 | 24 |
| E (Tendance) | 5 | 6 | 6 | 5 | 22 |

### Les 3 versions à poursuivre

1. **A, « Le certificat contre-audité »** (Architecte).
   - **Pourquoi elle note bien** : c'est la seule qui ferme une faille mesurée, et le moment fort d'une fraude démasquée.
   - **Risque** : la faisabilité (5), à cause du décodage du calldata.
   - **Piste** : prouver ce décodage **dès le premier jour** sur le testnet. Si `transaction.input` n'est pas disponible dans le handler, le contrat ANCRE émet les `rows` dans l'event `CertificateSubmitted`, ou leur hash plus une URI. C'est un coût en gas, à mesurer dans le chantier 02. Les soumissions via un autre contrat sont hors périmètre, et on le documente.
2. **B, « Le recensement de la norme »** (Franc-tireur).
   - **Pourquoi elle note bien** : c'est la plus nouvelle, et elle a un moment fort visuel gratuit en Cloud.
   - **Risque** : l'utilité (6) et des données incertaines.
   - **Piste** : la réduire à un **scan HyperSync hors Cloud** sur les chaînes où les registres existent, et la présenter comme de **l'analytique au service de la norme** (chantier 08, motivation de l'ERC) et de l'acte 1. Pas de wildcard en Cloud en v1. **Lancer le scan avant de le promettre** : si aucune ferme n'apparaît ailleurs, le résultat « la norme est surtout vide » reste publiable.
3. **C, « Le compilateur de normes »** (Minimaliste).
   - **Pourquoi elle note bien** : faisabilité maximale, et elle couvre le critère « correct ».
   - **Risque** : la nouveauté (4).
   - **Piste** : on ne la pitche pas seule, **c'est le socle** de A.

### Les versions écartées
- **D, « Le chien de garde »** : son idée survit comme **une seule entité** `SetHealth` et une zone de l'écran 07. Ce n'est pas un produit à part.
- **E, « La tour de guet agentique »** : on garde le bot de preuve (il est dans A et dans le chantier 04). Le serveur MCP est coupé : c'est la brique décorative que CLAUDE.md §6 interdit.

### Ma recommandation : l'hybride C → A + le scan de B

**Concept final : « un indexeur qui exécute la norme et contre-audite chaque certificat, plus un scan HyperSync qui mesure la norme sur toutes les chaînes ».**

- **Socle C**, sur 143 et 10143 : identité complète (wallets, owners, opérateurs, transferts), arêtes normatives D14, D15, D16 et D20, test de parité avec le solveur.
- **Cœur A** : l'indexation de `AnchoredReputation` sur le testnet, puis sur le mainnet, avec audit de chaque certificat et entités `Discrepancy` typées, consommées par le bot de preuve (chantier 04) et par l'écran (07).
- **Multichain en Cloud** : 143, 10143 et **une** chaîne de plus (Arbitrum ou Optimism), soit environ 50 à 55 k events estimés, pour démontrer le multichain sans faire sauter le quota. Les autres chaînes seulement si le budget mesuré le permet.
- **Scan B, hors Cloud** : un script HyperSync (client TS ou Python) sur les chaînes où les registres existent. Il produit « la part des avis qui survivent aux règles ANCRE, chaîne par chaîne » et les signatures de ferme. Le tableau alimente l'acte 1 et la motivation de l'ERC.

**Périmètre coupé** :
- le wildcard en Cloud ;
- le serveur MCP ;
- le tableau de bord « produit » (réduit à `SetHealth`) ;
- les 5 chaînes Cloud dès le départ ;
- les soumissions de certificat via un contrat tiers.

**Ce qui montre la « profondeur » dans la démo**, en environ 40 secondes sur les 3 minutes :
1. **Live** : un des nouveaux avis Monad arrive, et l'arête normative change dans l'indexeur (entité dérivée visible dans le GraphQL), le tout **au bloc suivant**.
2. **Audit** : sur le testnet, on soumet un certificat qui fabrique une arête (celle de 0x0730 → #4, vecteur réel). L'indexeur crée une `Discrepancy(FABRICATION)` en quelques blocs, et le bot soumet la preuve (v).
3. **Multichain** : une seule requête GraphQL renvoie les mêmes entités sur 2 à 3 chaînes.
4. **HyperSync** : le tableau de survie par chaîne, calculé en quelques secondes pendant la démo, sans consommer un seul event Cloud.
5. **Qualité** : `pnpm test` montre la parité avec les vecteurs normatifs.

### La première chose à faire
**Jour 1** (après le token Envio) : prouver sur le testnet que le handler de `CertificateSubmitted` accède aux données de la transaction (`input`), ou décider d'émettre les `rows` dans l'event. **Toute la version A en dépend.** En parallèle, lancer le scan HyperSync de B sur 3 chaînes, pour savoir s'il y a une histoire à raconter.

### Questions ouvertes pour Hugo
1. Faut-il émettre les `rows` (ou leur hash plus une URI) dans l'event `CertificateSubmitted`, si le calldata n'est pas lisible depuis le handler ? Cela coûte du gas, à mesurer dans le chantier 02.
2. Quelle 3e chaîne en Cloud : Arbitrum ou Optimism ? À choisir selon le volume mesuré.
3. Le dépôt séparé `ancre-indexer` est-il autorisé, et avec quelle licence ?
4. Faut-il publier le tableau de survie par chaîne (résultat de B) dans la motivation de l'ERC, même s'il dit « la norme est surtout vide » ?

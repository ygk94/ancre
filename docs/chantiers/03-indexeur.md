# Chantier 03 — Indexeur


> **Bounty visé (D38)** : *Envio, Best Use of Envio* (1 k$). **Construire l'indexeur avec Envio (HyperIndex / HyperSync)**, sauf blocage mesuré et documenté. Critères détaillés à récupérer sur hackathon.monad.xyz (connexion requise). Voir `docs/conseil/bounties-sponsors.md`.


## Méthode d'exécution et références (vague 3, 27/09)

**Concept (D42)** : l'**indexeur de la norme** est aussi l'**auditeur de certificats**. Design dans `docs/ressources/design-indexeur-envio.md` ; le verdict du cross-idea est dans `docs/ressources/cross-idea-envio.md`.

**Jour 1, les deux premières vérifications**
1. **Un handler HyperIndex a-t-il accès au calldata de la transaction** (pour décoder `submitCertificate`) ?
   - Si oui, on le décode directement.
   - Si non, le contrat émet les `rows` dans un event. C'est un surcoût de gas à mesurer avec le chantier 02, et une décision de Hugo.
2. **Scan HyperSync sur 3 chaînes** : quelle part des avis survit aux règles d'ANCRE ? Il faut savoir s'il y a une histoire à raconter.

**Construction**
1. `config.yaml` : Monad 143 (bloc de départ 52 952 790 pour Identity, 52 952 794 pour Reputation), 10143, et une 3e chaîne (Arbitrum ou Optimism, choix de Hugo).
2. `schema.graphql` :
   - les entités brutes ;
   - les entités dérivées : arête combinée par (client, agent, tag), contrôleurs courants, wallets partagés ;
   - `Discrepancy` et `SetHealth`.
3. Handlers en TypeScript.
   - Ils s'exécutent deux fois : on relit avant de réécrire.
   - Les appels réseau passent par l'**Effect API**, et seulement en tête de chaîne.
   - Wallets et owners se reconstruisent **à partir des events** : l'état historique ne remonte qu'environ 40 000 blocs.
4. **Tests de parité** entre les arêtes de l'indexeur et celles du solveur : `solver/from_indexer.py`, avec le chantier 04.
5. **Bot de preuves** : sur une `Discrepancy`, il soumet la preuve (v) (chantier 04).
6. **Déploiement** :
   - en local, du 28 au 30/09 ;
   - sur Envio Cloud à partir du 01/10 ;
   - déploiement final entre le 06 et le 10/10, dans un **dépôt public séparé `ancre-indexer`**.
   - Il faut une requête au moins tous les 7 jours, sinon le déploiement est supprimé.

**Coupé** : le wildcard en Cloud, le serveur MCP, un tableau de bord complet.

**Démo, environ 40 s** :
- un vrai avis modifie une arête au bloc suivant ;
- un certificat fabriqué est démasqué et prouvé ;
- une requête GraphQL renvoie les données de 2 à 3 chaînes ;
- le tableau HyperSync ;
- les tests de parité qui passent.

**Skills** : les skills Envio (`envio skills update`) et le MCP de docs Envio, **pour développer** (pas dans le produit), plus `/code-review`.

**Références**
- `docs/ressources/envio.md` (toutes les pages de doc utiles, en `.md`).
- Effect API : https://docs.envio.dev/docs/HyperIndex/effect-api.md.
- Configuration : https://docs.envio.dev/docs/HyperIndex/configuration-file.md.
- Déploiement Cloud : https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment.md.
- HyperSync : `https://143.hypersync.xyz`, `https://10143.hypersync.xyz`.

## 1. Objectif et résultat final attendu

Construire une **base locale fidèle aux registres ERC-8004 du mainnet (chainId 143)**, reconstruite depuis la chaîne et jamais depuis 8004scan. Elle doit être tenue à jour en continu, et c'est la source unique du solveur (04) et de l'écran (07).

**Livrables** : un dossier `indexer/` contenant :
- le code ;
- `indexer/SCHEMA.md`, qui décrit le format de sortie consommé par le solveur ;
- un mode **rattrapage** (depuis le bloc de déploiement) et un mode **suivi** (nouveaux blocs) ;
- un **contrôle de cohérence automatique** contre la chaîne (voir §7) ;
- un rapport de validation sur l'état au 27/09.

## 2. Contexte minimal

Faits mesurés le 27/09 (CR, tour 3, et `solver/RESULTS.md`) :
- **8004scan n'est pas fiable** : 10 agents notés absents de son index (AM-3.8), et 24 `valueDecimals` faux (AM-R4.2).
- Référence on-chain au bloc 108 434 518 : 9 188 avis ; Σ `getLastIndex` = 9 188 ; 10 261 mints (`_lastId`) ; 72 transferts hors mint.
- `rpc1.monad.xyz` a accepté un `eth_getLogs` sur tout l'historique, alors que `rpc.monad.xyz` est limité à 100 blocs. **À revérifier** : ça dépend du fournisseur.
- Les events à suivre, avec leurs signatures exactes, sont dans le CR (« Faits vérifiés ») :
  - ReputationRegistry : `NewFeedback`, `FeedbackRevoked`, `ResponseAppended` ;
  - IdentityRegistry : `Registered`, `Transfer`, `MetadataSet` (en particulier la clé `agentWallet` ; valeur vide = effacement), `Approval`, `ApprovalForAll` ;
  - les deux proxys : `Upgraded`, `OwnershipTransferred`.
- `NewFeedback` : `agentId`, `clientAddress` et `keccak(tag1)` sont indexés, `feedbackIndex` ne l'est pas. `endpoint`, `feedbackURI` et `feedbackHash` ne se trouvent que dans l'event.
- Le registre ne date pas les avis : **seul le bloc du log date un avis**.

## 3. Ce qui est déjà tranché

- Unité d'arête : dernier avis non révoqué par (client, agent, tag1) (D14). C'est le solveur qui l'applique, mais l'indexeur doit conserver **tous** les avis.
- Index wallet → agents reconstruit hors chaîne : il n'existe pas d'index inverse on-chain, et un même wallet peut appartenir à plusieurs agents (D16).
- Il faut conserver l'**historique des owners** de chaque agent (règle « ancien owner », sous réserve du tour 4).

## 4. Pistes à creuser

- **Source des logs** : `eth_getLogs` en grande plage sur `rpc1`, en découpant par plage si une limite apparaît. Alternatives : Envio HyperSync (le CR note qu'il faut une clé), ou un nœud tiers. Mesurer le débit et les limites réelles, avec la date.
- **Monad** : finalité ~0,6 s, blocs spéculatifs, `monadLogs` / WebSocket pour le suivi. Chercher dans la doc Monad comment traiter les réorganisations et les blocs spéculatifs (« dédoublonner les blocs spéculatifs », CLAUDE.md §9). Ne rien considérer comme définitif avant la finalité.
- **Relecture on-chain** : `readAllFeedback` pour les valeurs, puisque 8004scan fausse les décimales. Faire un contrôle croisé event par event.
- **Stockage** : SQLite suffit probablement (un seul processus, ~10 k lignes). Justifier le choix.
- **Pistes de contrôle** : Σ `getLastIndex` par agent = nombre d'avis indexés ; `getClients(agentId)` = clients indexés ; `_lastId` = nombre de mints.
- **Surveillance** : alerte sur `Upgraded` (D17) et sur tout changement de `getVersion()`.

## 5. Pièges connus

- `eth_getLogs` : 25 rps sur `rpc.monad.xyz` ; ne pas saturer.
- Le décodage d'un `tag1` indexé ne donne que son keccak : il faut lire `tag1` dans les données non indexées.
- Plusieurs `MetadataSet(agentWallet)` peuvent tomber dans un même bloc ; les ordonner par `logIndex`.
- Le temps de bloc est incertain (0,3 ou 0,4 s) : raisonner en blocs.

## 6. Questions ouvertes

- Faut-il indexer aussi les `ResponseAppended` pour l'écran (le recours d'un fournisseur contre un slash) ?
- Faut-il exposer une API (HTTP locale) ou un simple fichier ou une base partagée ? Ça dépend des besoins de 04 et 07 : à coordonner.

## 7. Critères d'acceptation

- Au bloc 108 434 518, on retrouve exactement : 9 188 avis ; les 7 771 couples ; 10 261 mints ; 72 transferts ; 178 wallets partagés par 1 773 agents ; les 78 avis de #8317 par son propre wallet (tous les chiffres viennent du CR et de `solver/RESULTS.md`).
- Le mode suivi tourne 30 minutes sans dérive, avec des contrôles de cohérence verts.
- `SCHEMA.md` est accepté par le chantier 04 : le solveur lit la base sans adaptation ad hoc.

## 8. Interfaces

- Produit la base décrite dans `indexer/SCHEMA.md`, pour 04 et 07.
- Consomme les règles D14 et D16 (et celles du tour 4) pour la vue « arêtes », si elle est calculée ici plutôt que dans le solveur. Décider avec le chantier 04.

## 9. Règles

Voir `README.md`. Lecture seule sur la chaîne.

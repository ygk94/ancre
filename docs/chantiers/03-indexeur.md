# Chantier 03 — Indexeur

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

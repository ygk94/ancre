# Journal du chantier 02bis

> Une entrée par étape terminée (ou par blocage). Format : date/heure, étape, fait, mesures (statut + commande), décisions et pourquoi, écarts, blocages, prochaine étape.


## 2026-10-06 — E0 : démarrage (ce que j'ai compris, mon plan)

**Lu** (AM-3.13) : CLAUDE.md, CR (D1-D55 en tête), tour7.md (D-7.1), brief 02bis, `contracts/` (src entier, ENCODING, PROOFS, tests), relecture-conseil.md, PoC R1 de la revue maximale (`scratchpad/angleD/contracts/test/PocD.t.sol`).

**Compris.**
- R1 (critique) : dans `_verifyRows`, `if (client == address(0)) continue;` saute la ligne sans avancer `off` au-delà de ses arêtes. Un nœud adresse `address(0)` (accepté par `addNodes`, ouvert à tous) porte une ligne d'arêtes : le parseur de la relecture se désynchronise, et toutes les lignes suivantes sont relues de travers, donc une arête fabriquée passe en Registry-verified. `_rowLoop` (la passe arithmétique) et `_verifyRows` (la relecture) parsent les lignes séparément : rien ne vérifie qu'ils lisent la même chose.
- A, B, C : comme D-7.1. Pour C, la garde actuelle compare (vectorRoot, graphRoot) bruts et elle est sautée sous `registryChanged` (R2) ; la forme canonique (R4 : la règle de forme lit la valeur décodée, pas le bit SRC) doit passer avant le hash.
- R3 : avec un sPlus déclaré, `proveEdge` garde le plancher de budget à max(GRID, sPlus) même quand une arête positive engagée est révoquée : la vraie somme baisse, les autres poids normalisés montent, et eUp ne le voit pas.
- R5-R8 : contrôles d'empreinte incomplets, échec de lecture pris pour un agent brûlé, mode strict sur trust ≠ 0, deux défauts du payeur (strictTransfer = false, trésorerie = opérateur).

**Plan.**
1. E1 : tests qui reproduisent R1 (PoC), A (y compris `mainnet_slash_anchor` en fork), B, C (réencodage + REGISTRY_CHANGED), R3, R4, R5, R6 sur le contrat actuel ; ils doivent ÉCHOUER. Commit séparé, daté.
2. R1 en premier (critique), puis A, B, C + R2/R4 (forme canonique), R3, R5-R7, R8 (payeur + scripts), renommage, docs.
3. Mesures gas : veto par approbation en mode strict, coût de C, taille du contrat (EIP-170 : le contrat dépasse déjà, il faut le vérifier).
4. Vecteurs communs avec 04-bis (lecture seule de leur branche), revue `/code-review high` puis `/security-review` sur ce worktree, script de déploiement testnet simulé.

**Mesure de départ** (MESURÉ, 06/10, `forge test --no-match-contract "Fork|SolverVectors|Upgrade|TrustGatedPayerFork|RegistryBench|ToolingProbe"`) : 117 tests hors fork, tous verts.

**Prochaine étape** : E1.

## 2026-10-06 — E1 : tests qui reproduisent les attaques (contrat de `main`, bc2d911)

**Fait.** `contracts/test/Bis.t.sol` (25 tests), `contracts/test/BisPayer.t.sol` (2), `SolverVectors.t.sol::test_A_mainnetSlashAnchorRefused` (fork). Chaque test rejoue l'attaque et affirme le comportement corrigé : sur le contrat actuel ils **échouent**, et c'est voulu (trace datée). Les sélecteurs d'erreurs nouvelles (`AnchorAsSource`, `ProvenRowResubmitted`, `NotCanonical`) sont écrits en chaînes pour que le fichier compile avant la correction.
Mock d'identité étendu : `getApproved`, `isApprovedForAll`, `approve`, `isAuthorizedOrOwner` inclut l'approuvé, et un agent inexistant revert avec l'erreur personnalisée `ERC721NonexistentToken(uint256)`.

**Mesures.**
- MESURÉ (06/10, `cast call` sur `rpc.monad.xyz`, agent 99 999 999 inexistant) : `ownerOf`, `getApproved` et `isAuthorizedOrOwner` revert avec `0x7e273289` = `ERC721NonexistentToken(uint256)` ; `getAgentWallet` renvoie 0 sans revert ; `isApprovedForAll` répond. C'est ce qui permet de séparer « l'agent n'existe pas » (une vraie réponse) d'un échec de lecture (R6).
- MESURÉ (`forge test --match-contract "BisTest|BisPayerTest"`, puis `--match-test test_A_mainnetSlashAnchorRefused` en fork au bloc 108 835 675) : **24 tests d'attaque en échec** sur le contrat actuel, 4 gardes de non-régression vertes (positif d'un contrôleur rejeté, ligne corrigée acceptée, certificat honnête sans la ligne d'ancre, agent inexistant toujours prouvable). Les 117 tests existants restent verts avec le nouveau mock.
- Le PoC R1 est reproduit à l'identique : une arête fabriquée X → Z est acceptée en Registry-verified derrière une ligne `address(0)`, alors que X n'a jamais noté Z.
- `mainnet_slash_anchor` (vecteur de démo du 01/10) : le nœud 5 (#18) a pour agentWallet l'ancre `0xea0b` : il est accepté aujourd'hui, il doit être refusé par `AnchorAsSource(5)`.

**Écart.** La règle « tests verts avant chaque commit » ne peut pas s'appliquer à ce commit : le brief demande justement des tests qui échouent, commités à part. Tous les autres tests sont verts.

**Prochaine étape** : R1, puis A, B, C, R3 à R8.

## 2026-10-06 — E2-E5 en cours : corrections écrites, NON commitées (limite d'usage de la session atteinte)

**État du worktree** (modifications locales, pas encore commitées, car 7 tests restent rouges) :
- **R1** : `address(0)` refusé dans la table ; `_verifyRows` ne saute plus de ligne et exige `off == rows.length`.
- **A** : `AnchorAsSource(u)` dès qu'un SRC est une ancre (les deux niveaux). `proveWallet` couvre déjà le nouveau wallet devenu ancre (la source change).
- **B** : un contrôleur ne donne plus d'arête positive, mais son arête négative est conservée (à la soumission et dans `proveEdge`) ; veto par approbation en mode strict (`_approvalVetoes`) ; `proveApproval` pour le mode rapide.
- **C / R2 / R4** : `NotCanonical` (SRC = 0, SPLUS = S⁺, alias vers une ligne non agent). `provenFalse[setId][rowHash]` est calculé sur la ligne décodée, sans feedbackIndex et indépendant de W. Il est vérifié à chaque soumission, sous REGISTRY_CHANGED et au niveau attesté. L'ancienne garde sur les racines brutes est retirée.
- **R3** : la facturation de `proveEdge` est cumulée depuis la ligne engagée (`_needs`, `_bill`), avec X = max(dEff + Δc, Scur).
- **R5** : empreinte des ancres = 0 ; `dryRun` applique la forme et la borne 2⁶³.
- **R6** : `_idCall` sépare `ERC721NonexistentToken` d'un échec de lecture ; les preuves revert `RegistryUnreadable` ; `assess` renvoie REGISTRY_CHANGED.
- **R7** : le transfert en mode strict dépend de la masse, plus de trust.
- **R8** : le payeur refuse un set en mode rapide (`FastTransferSet`) et une trésorerie opératrice (`OperatorIsTreasury`). T1Oracle est adapté, mais **le script T1 déploie encore owner = trésorerie = opérateur : à séparer**.
- **Renommage** : `passesAnchorPolicy` et `Assessment.passesPolicy`, dans le contrat, le payeur, T1Oracle et les tests.

**Mesure** (MESURÉ, `forge test` hors fork) : 137 verts, **7 rouges**.
- `test_B_*` (3) : le veto par approbation ne déclenche pas. Cause probable : la boucle de veto direct (`_lastFeedback`) tourne avant, alors que le jeu `_trustedX` n'a pas de feedback d'ancre → à déboguer.
- `test_neverRevertsOnBrokenRegistry` : le statut attendu est TRANSFERRED (3), on obtient REGISTRY_CHANGED (5). C'est l'effet voulu de R6 : le test est à mettre à jour.
- `test_burntSourcelessRowNothingToProve` : le test simule un `getAgentWallet` qui revert, ce que le vrai registre ne fait pas (mesuré). À réécrire avec un vrai burn.
- `test_replacementRefusesResubmittingProvenCertificate` : l'erreur est maintenant `ProvenRowResubmitted` et non `NotBetter`. Le test est à mettre à jour.
- `test_revocationAndNewerFeedback` : avec la facturation cumulée, `incP` vaut 0 quand on revient à l'état engagé, au lieu de 0,5. C'est attendu, le test est à mettre à jour.

**INTERFACE** (à relayer) :
- renommage ABI `isTrusted` → `passesAnchorPolicy` et `trusted` → `passesPolicy` ;
- règle d'arête B (négatif d'un contrôleur conservé) ;
- erreurs `AnchorAsSource`, `ProvenRowResubmitted`, `NotCanonical` ;
- SPLUS seulement si sPlus > S⁺ ;
- `provenFalse(setId, h)` et `rowHash` publics ;
- `proveApproval`, event `ApprovalProven` ;
- montants de `proveEdge` changés (ENCODING §7.1, à réécrire) ;
- getters ERC-721 ajoutés à l'interface ;
- vecteur `mainnet_slash_anchor` désormais refusé : 04-bis doit le régénérer sans la ligne de #18.

**Reste** :
- corriger les 7 tests, puis commiter ;
- vecteur de démo en fork et `SolverVectors` ;
- mesures de gas : veto par approbation, coût de C, taille du contrat ;
- ENCODING, PROOFS et GAS ;
- E6 (vecteurs 04-bis), E7 (`/code-review high`, `/security-review`), E8 (script testnet simulé, rôles séparés), rapport 02bis.

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

## 2026-10-06 (après-midi) — E2 à E6 terminés, E8 simulé

**Fait.**
- Les 7 tests rouges de l'entrée précédente sont corrigés :
  - `test_B_*` : le défaut était dans **le test**, pas dans le contrat. Le jeu `_trustedX` n'avait pas de ligne vide pour X, donc la marge de troncature faisait échouer la règle ρ avant même l'approbation. En E1, ces 3 tests échouaient donc pour une autre raison que l'attaque : écart noté. Avec la ligne vide, ils passent après la correction.
  - 4 tests existants sont mis à jour pour la nouvelle sémantique : R6 (REGISTRY_CHANGED au lieu de TRANSFERRED sur un registre illisible), C (`ProvenRowResubmitted`), R3 (retour à l'état engagé : plus de facture), burn réel au lieu d'un `getAgentWallet` qui revert.
- **Optimisation C** : `SetState.provenRows`. Tant qu'aucune ligne du set n'est prouvée fausse, la soumission ne fait aucune recherche `provenFalse` ni aucun hash.
- **E6, test différentiel** sur les vecteurs de 04-bis, lus en lecture seule : `git archive chantier/04bis-solveur solver/vectors` vers `contracts/.v04bis/` (ignoré par git), avec `ANCRE_VECTORS=.v04bis/solver/vectors/`.
  - `test/CommonVectors.t.sol` rejoue les 8 vecteurs communs : registre rejoué sur les mocks, soumission, lectures attendues, et séquence C (preuve, resoumission, REGISTRY_CHANGED, contrôle honnête).
  - `SolverVectors.t.sol` rejoue les vecteurs régénérés (snapshot 110 994 810).
  - `VectorBase.sol` regroupe les helpers communs.
- **R8, scripts** : T1 sépare owner (D), trésorerie (`T1_TREASURY`) et opérateur (`T1_OPERATOR`) ; nouveau `script/testnet/Deploy.s.sol` (étapes `ancre` puis `payer`).
- **Documentation** :
  - `ENCODING.md` : §0bis INTERFACE (G-1 à G-11, dont AM-03.3, l'appel direct obligatoire), §3.2, §3.4, §3.5 (hash des lignes prouvées), §5, §6, §7.1 (nouveaux montants), §7.2 à §7.4 ;
  - `PROOFS.md` : L6 réécrit, L8 ajouté (ancre ≠ source) ;
  - `GAS.md` : section 02-bis ;
  - `PAYER.md`.
- Forks : `foundry.toml` pointe sur `rpc1.monad.xyz`. MESURÉ le 06/10 : `rpc.monad.xyz` ne sert plus l'état du bloc 108 445 171.

**Mesures** (MESURÉ le 06/10, commandes dans GAS.md §02-bis) :
- Tests :
  - 170 tests hors vecteurs (fork compris) ;
  - 12 tests de vecteurs (`ANCRE_VECTORS=.v04bis/solver/vectors/ forge test --match-contract "CommonVectors|SolverVectors"`) ;
  - **182 tests au total, tous verts**.
- Veto par approbation, mode strict, k = 3 : **+43 k gas** par `assess` (139 138 → 182 127). Le tour 7 estimait ≈ 32 k.
- C : **+27 k** sur la démo Registry-verified pour un set jamais prouvé (14 974 802 → 15 001 792), et **≈ 9,3 k par ligne** pour un set déjà prouvé (+0,93 M pour 100 lignes). Le tour 7 estimait 0,8 M.
- `proveEdge` : +41 k (médiane sur les mocks).
- Taille du contrat : **37 121 octets** (33 462 avant ; limite Monad 131 072).
- Déploiement testnet simulé (`DEPLOY_STEP=ancre forge script script/testnet/Deploy.s.sol --rpc-url monad_testnet --sender …`) : **10 580 519 gas estimés**, soit ≈ 1,06 MON à 100 gwei et 2,15 MON au plafond affiché de 203 gwei. Monad facture la gas limit.

**Décisions.**
- **Hash des lignes sur la forme DÉCODÉE**, sans le feedbackIndex (non vérifié au niveau attesté) et indépendant de W. W = 4 reste donc permis, ce qui garde le chemin W = 4 testable (AM-08.22) : dans ce hash, W ne permet aucun réencodage.
- Le hash d'une ligne d'alias = le contenu de sa référence : un alias et une copie complète équivalente ont le même hash.
- L'ancienne garde sur les racines brutes est supprimée : `provenFalse` la couvre entièrement, puisque toute preuve qui élargit marque une ligne.
- **R3** : bornes cumulées contre la ligne engagée, au lieu d'une somme d'écarts successifs. La preuve est plus simple et la borne plus serrée ; elle reste conservatrice sur les révélations ambiguës (AM-02bis.4).
- **R6** : seule `ERC721NonexistentToken` vaut « agent inexistant » (mesuré sur le vrai registre).
- **R8** : interdiction dans le contrat (constructeur, `setPolicy`, `setOperator`), plutôt que simple documentation.
- `proveApproval` réutilise le bit de veto certifié.

**INTERFACE** : voir ENCODING.md §0bis (renommage ABI, règle d'arête B, nouvelles erreurs, SPLUS strict, `rowHash` et `provenFalse` publics, `proveApproval` et `ApprovalProven`, montants §7.1, appel direct).
- Le vecteur `mainnet_slash_anchor` du 01/10 (sur `main`) est refusé, comme attendu.
- Les vecteurs de `main` ne passent plus `SolverVectors` sans `ANCRE_VECTORS` : ce sera réglé quand le pilote aura fusionné 04-bis.

**Prochaine étape** : E7, `/code-review high` puis `/security-review` sur tout `contracts/src`.

## 2026-10-06 (soir) — E7 (1/2) : `/code-review high` sur tout `contracts/src` de ce worktree

**Fait.** La revue a porté sur `/Users/hugo/Projet/ancre-02bis/contracts/src` (chemin absolu passé en argument, AM-02.9), fichiers entiers et pas seulement le diff. 8 constats ; tous sont traités.

| # | Constat | Suite |
|---|---|---|
| 1 | **C se contourne en retouchant le contenu** (sPlus = S⁺ + 1, ou une petite arête positive en moins) : nouveau hash, et l'omission revient | **C est refait** : on stocke les FAITS prouvés (arête (client, agent) → poids, réclamation de source (u, src, via)) et on les vérifie sur toute ligne ultérieure. Liveness : `refreshFact` et `clearSourceFact`. ENCODING §3.5 réécrit |
| 2 | **Auto-boucle** : le wallet d'un agent poste un négatif sur cet agent (gardé par B), et la preuve se rejoue sur chaque certificat (DoS) | `proveEdge` refuse une arête vers l'agent même de la ligne (`BadProof(27)`) ; la vérification des faits saute l'agent lui-même |
| 3 | `_edgeHolds` ignorait l'échec de lecture de `isAuthorizedOrOwner` (une auto-recommandation pouvait passer après une upgrade) | `RegistryUnreadable` |
| 4 | G-11 (appel direct) annoncé mais pas appliqué | appliqué sur les sets ouverts : `msg.sender == tx.origin`, sinon `NotSubmitter`. Les tests soumettent par `_direct()`, car en isolation la config `tx_origin` est ignorée (MESURÉ par une sonde) |
| 5 | `_clientOf` appelait le registre sans plafond de gas et sans séparer inexistant et échec | `_idAddr` : plafond, `RegistryUnreadable` ou `EdgeMismatch(row, 256)` |
| 6 | `ownerOf` lu deux fois en mode strict | lu une seule fois |
| 7 | La garde « alias → ligne d'agent » ne pouvait jamais échouer | retirée (la forme est déjà vérifiée) |
| 8 | Chiffre non sourcé dans un commentaire du payeur | remplacé par la mesure, datée et sourcée |

**Mesures** (MESURÉ le 06/10) :
- Tests : `ANCRE_VECTORS=.v04bis/solver/vectors/ forge test` → **187 tests, tous verts** (16 suites, forks compris). Les 5 nouveaux tests sont dans `Bis.t.sol` (`test_review_*`).
- Banc démo k = 3 :
  - mise à jour Registry-verified **15 024 552** (+0,33 % par rapport à `bc2d911`) ;
  - veto par approbation **+41,6 k** ;
  - taille **38 992 octets**.
- Le banc d'un set qui a des faits n'est **pas encore mesuré** dans la version par faits (ESTIMÉ du même ordre que les 9,3 k par ligne de la première version).

**INTERFACE** :
- `provenFalse` et `rowHash` disparaissent ;
- nouveaux : `edgeFact`, `provenSource`, `sourceHash`, `refreshFact`, `clearSourceFact`, events `EdgeFact` et `SourceFactCleared` ;
- **soumission directe obligatoire sur les sets ouverts** ;
- `BadProof(27)` pour une auto-boucle, `BadProof(28)` quand il n'y a pas de fait.

Le relais vers l'indexeur et le certificateur (04) : avant de soumettre sur un set qui a des faits, rafraîchir les faits périmés.

**Prochaine étape** : `/security-review` (E7, 2/2).

## 2026-10-06 (soir) — E7 (2/2) : `/security-review` sur ce worktree

**Piège AM-02.9 confirmé.** Le contexte git que la commande injecte venait de `/Users/hugo/Projet/ancre` (`main`, propre, diff vide). J'ai lancé la revue sur `/Users/hugo/Projet/ancre-02bis` : diff `bc2d911..HEAD` de `contracts/src` et `contracts/script`, plus les trois fichiers source en entier.

**Résultat.** Aucun constat à confiance ≥ 8. Le seuil du skill étant 8, le rapport final de la revue est vide. Deux candidats MEDIUM, à 6-7 :
1. **Confiance 7.** `_checkFacts` testait chaque arête positive prouvée et omise **séparément** contre le sPlus déclaré : un seul petit sPlus « couvrait » plusieurs arêtes prouvées, et la dilution prouvée revenait. **Corrigé malgré le seuil**, parce que le correctif est trivial : les omissions sont sommées et doivent tenir sous sPlus. Test : `test_review_omittedProvenEdgesAreSummed`.
2. **Confiance 6.** Un EOA délégué par EIP-7702 passe `msg.sender == tx.origin` et peut cacher ses lignes dans un appel interne. **Non corrigé.** Refuser `tx.origin.code.length != 0` exclurait aussi tout EOA 7702 légitime, et les lignes restent récupérables en rejouant la transaction sur un fork. Documenté en AM-02bis.6.

**Mesure** (MESURÉ, `ANCRE_VECTORS=.v04bis/solver/vectors/ forge test`) : **188 tests, tous verts**.

**Prochaine étape** : rapport 02bis, puis 🧑 accord de Hugo pour le déploiement testnet.

🧑 BLOQUÉ : accord de Hugo pour déployer sur le testnet. Le script `script/testnet/Deploy.s.sol` est prêt et simulé : 10,58 M gas, soit ≈ 1,06 MON à 100 gwei (2,15 MON au plafond de 203 gwei). Il faut le keystore et du MON de testnet ; le payeur doit être déployé avec trois adresses distinctes (owner, trésorerie, opérateur).

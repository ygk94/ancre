# Rapport du chantier 02-bis — corrections A, B, C, R1 à R8 et renommage (D48)

> Session du 2026-10-06, worktree `/Users/hugo/Projet/ancre-02bis`, branche `chantier/02bis-corrections` (base `bc2d911`). Pas de push, pas de transaction réelle. Le journal détaillé est `docs/chantiers/journal/02bis.md`.

## 1. Livré

| Point | Livré | Où |
|---|---|---|
| **R1** (critique) | `address(0)` refusé dans la table ; la seconde passe finit exactement où finit la passe arithmétique. Le PoC de la revue maximale est rejoué (une arête fabriquée était acceptée en Registry-verified) | `_appendNodes`, `_verifyRows` |
| **A** (AM-08.14) | `AnchorAsSource(u)` : aucune ligne n'a pour SRC une ancre (wallet, owner VIA_OWNER, alias), aux deux niveaux. `proveWallet` couvre le wallet qui devient une ancre | `_verifyRows`, PROOFS L8 |
| **B** (AM-08.15) | Le négatif d'un contrôleur est conservé (le positif reste rejeté), à la soumission comme dans les preuves. Une ancre approuvée ou opératrice vaut veto : lu en direct en mode strict, posé par `proveApproval` en mode rapide | `_edgeHolds`, `_currentEdge`, `_approvalVetoes`, `proveApproval` |
| **C** (AM-08.16), **R2**, **R4** | Forme canonique (`NotCanonical`) et **faits prouvés** : poids d'une arête (client, agent) ou réclamation de source. Ils sont vérifiés sur toute ligne ultérieure, aux deux niveaux et sous REGISTRY_CHANGED (`ProvenRowResubmitted`). Liveness assurée par `refreshFact` et `clearSourceFact` | `_checkFacts`, ENCODING §3.5 |
| **R3** | Bornes des preuves calculées depuis la ligne engagée, de façon cumulative ; le budget suit les arêtes engagées | `_needs`, `_bill`, ENCODING §7.1, PROOFS L6 |
| **R5** | Empreinte des ancres à 0 aux deux niveaux ; `dryRun` applique tous les contrôles sans lecture du registre | `_verifyRows`, `dryRun` |
| **R6** | Seule `ERC721NonexistentToken` vaut « inexistant » (MESURÉ sur le vrai registre). Toute autre erreur : `RegistryUnreadable` pour les preuves, `REGISTRY_CHANGED` pour `assess`. Lectures plafonnées à `VIEW_CALL_GAS` partout | `_idCall`, `_idAddr` |
| **R7** | Le transfert strict se déclenche sur la masse (un t > 0), plus sur le trust arrondi | `_assess` |
| **R8** | Le payeur refuse un set en mode rapide (`FastTransferSet`) et une trésorerie opératrice (`OperatorIsTreasury`) ; les scripts séparent les trois rôles | `TrustGatedPayer`, `script/t1/T1.s.sol`, `script/testnet/Deploy.s.sol` |
| **Renommage** | `isTrusted` → `passesAnchorPolicy`, et `Assessment.trusted` → `passesPolicy`, dans le contrat, le payeur, T1Oracle et les tests | — |
| **G-11** (AM-03.3) | Set ouvert : soumission directe (`msg.sender == tx.origin`) | `submitCertificate` |
| **Vecteurs communs** (E6) | Les 8 vecteurs de 04-bis rejoués (registre sur les mocks, soumission, lectures, séquence C), plus les vecteurs du solveur régénérés | `test/CommonVectors.t.sol`, `test/SolverVectors.t.sol`, `test/utils/VectorBase.sol` |
| **Tests d'attaque** (E1) | Commit `aa655bb`, daté : 24 tests qui échouaient sur `bc2d911`, puis 6 tests de la revue de code et 1 de la revue de sécurité | `test/Bis.t.sol`, `test/BisPayer.t.sol` |
| **Docs** | ENCODING §0bis (INTERFACE G-1 à G-11), §3.2, §3.4, §3.5, §5, §6, §7 ; PROOFS L6 et L8 ; GAS §02-bis ; PAYER | `contracts/*.md` |
| **E8** | Script de déploiement testnet, simulé seulement | `script/testnet/Deploy.s.sol` |

## 2. Mesures (MESURÉ le 06/10 sauf mention)

- **Tests** : `ANCRE_VECTORS=.v04bis/solver/vectors/ forge test` → **188 tests verts** (16 suites, forks sur `rpc1.monad.xyz` compris).
- **Veto par approbation**, mode strict, k = 3, fork mainnet : **+41,6 k gas** par `assess` (139 138 → 180 758). Le tour 7 l'estimait à ≈ 32 k.
- **C** :
  - set sans fait prouvé : la démo Registry-verified passe de 14 974 802 à **15 024 552** (+0,33 %) ;
  - set avec des faits : ≈ 9,3 k gas par ligne, mesuré sur la 1ʳᵉ version (hash de ligne). La version par faits n'a pas de banc dédié (ESTIMÉ du même ordre).
- **Taille du contrat** : **38 992 octets** (33 462 avant ; limite Monad 131 072).
- **Déploiement testnet simulé** : **10 580 519 gas**, soit ≈ 1,06 MON à 100 gwei (2,15 MON au plafond de 203 gwei affiché par forge).
- **Registre réel** (`cast`, agent inexistant) : `ownerOf`, `getApproved` et `isAuthorizedOrOwner` revert `0x7e273289` ; `getAgentWallet` renvoie 0.
- **Forks** : `rpc.monad.xyz` ne sert plus l'état du bloc 108 445 171 ; `rpc1` le sert.

## 3. Décisions et raisons

1. **C par faits prouvés, et non par hash de ligne.** La `/code-review high` a montré qu'un hash, même calculé sur la forme décodée, se contourne en retouchant le contenu (sPlus = S⁺ + 1). Un fait porte sur le registre, pas sur un encodage : aucune variante ne passe. C'est un écart justifié avec la lettre de D-7.1 (« hash canonique »), qui garde son intention.
2. **W = 4 reste permis.** Avec les faits, l'encodage n'importe plus ; on garde le chemin W = 4 testable (AM-08.22).
3. **Les recherches de faits sont sautées si le set n'en a aucun** : un set honnête ne paie rien.
4. **R3 : bornes cumulées contre la ligne engagée.** La preuve est directe, sans somme d'écarts. Un retour à l'état engagé ne facture plus rien, ce qui a changé une assertion de `test_revocationAndNewerFeedback`.
5. **R8 interdit dans le contrat** plutôt que seulement documenté.
6. **G-11 seulement sur les sets ouverts** : les soumetteurs listés peuvent passer par un Safe.
7. **L'ancienne garde sur les racines brutes est supprimée** : les faits la couvrent entièrement.

## 4. Angles morts AM-02bis

| Id | Angle mort | Suite |
|---|---|---|
| AM-02bis.1 | Une ancre approuvée ne vaut veto que si elle était déjà ancre : un `setId` est immuable, mais la scène « approbation préventive » n'a pas encore été jouée sur le vrai registre | à jouer en 06 sur le testnet |
| AM-02bis.2 | Les faits sont gardés **pour toujours** par set. Si le registre change encore, le certificateur doit d'abord appeler `refreshFact` ou `clearSourceFact`, sinon sa ligne honnête est refusée | relais vers le certificateur (04) |
| AM-02bis.3 | Le coût de C sur un set qui a des faits n'est pas mesuré dans la version par faits | banc à écrire |
| AM-02bis.4 | R3 : une arête non engagée révélée est supposée comprise dans le sPlus déclaré tant qu'elle y tient (on ne la distingue pas d'une omission déclarée). Une arête **nouvelle** sur une ligne déclarée sous-facture eLow d'au plus S0·w/(d(d+w)) | documenté (ENCODING §7.1) ; sans gain Sybil |
| AM-02bis.5 | Un agent dont la source est une ancre n'a plus de ligne : il paie la marge de troncature (1 − α)t_u | conforme à D-7.1 |
| AM-02bis.6 | G-11 : un EOA délégué par EIP-7702 passe `msg.sender == tx.origin` et peut cacher ses lignes dans un appel interne (revue de sécurité, confiance 6) | non corrigé ; les lignes restent récupérables en rejouant la transaction sur un fork |
| AM-02bis.7 | Mode rapide : le bit posé par `proveApproval` est effacé par la recertification suivante, et la surveillance doit le reprouver | le payeur refuse de toute façon les sets en mode rapide (R8) |
| AM-02bis.8 | Les vecteurs de `main` (01/10) ne passent plus `SolverVectors` : 3 d'entre eux ont une ancre comme source. Ceux de 04-bis passent | se règle à la fusion de 04-bis |
| AM-02bis.9 | Les tests de E1 pour B échouaient en partie pour une autre raison : il manquait une ligne vide, donc une marge, dans le jeu de test | corrigé, noté au journal |

## 5. Écarts

- E1 commité avec des tests rouges, à la demande du brief.
- C par faits, au lieu du hash (§3, décision 1).
- `foundry.toml` pointe sur `rpc1.monad.xyz` pour les forks.
- `isTrusted` reste cité dans les tableaux historiques de GAS.md.

## 6. Questions pour Hugo

1. 🧑 **Accord pour déployer sur le testnet** ? Il faut ≈ 1,1 MON (jusqu'à 2,2 MON au plafond), le keystore, et trois adresses distinctes pour le payeur (owner, trésorerie, opérateur).
2. G-11 : faut-il aussi refuser les EOA délégués par 7702 sur les sets ouverts (AM-02bis.6), au prix d'exclure un wallet 7702 honnête ?
3. Liveness des faits (AM-02bis.2) : on la garde permissionless ou on la réserve aux soumetteurs listés ?

## 7. Reste à faire

- **Pilote**, à la fusion :
  - prendre les vecteurs de 04-bis avec cette branche ;
  - relayer l'ABI : renommage ; `edgeFact`, `refreshFact`, `clearSourceFact`, `proveApproval` ; nouvelles erreurs ; soumission directe ;
  - consommateurs touchés : plugin, indexeur (`edges.ts` règle B), écran, ERC §3.3.
- **04-bis** : `simulate.py` sur fork contre ce contrat (montants des preuves ENCODING §7.1) ; `refreshFact` dans le certificateur.
- **02-E9** : déploiement testnet et vérification Sourcify / MonadVision, après l'accord de Hugo.
- Banc C pour un set qui a des faits (AM-02bis.3).

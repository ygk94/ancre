# Rapport de la session d'intégration 02 + 04

> Session du 2026-10-01. Worktree `/Users/hugo/Projet/ancre-int`, branche `chantier/integration-02-04`.
> Les branches `chantier/02-contrat` et `chantier/04-solveur` ont été fusionnées au départ (`d406299`, `ae4c153`) ; tout le travail est sur cette branche. Journal détaillé : `docs/chantiers/journal/integration.md`.
> **Aucun push, aucune transaction réelle, aucune fusion** dans `feat/conseil-solveur-contrat`. Toutes les transactions citées ont eu lieu dans Foundry ou sur un fork local anvil.
> Chiffres **MESURÉS** le 01/10 par les commandes indiquées, sauf mention contraire.

## 0. En bref

- **Format unique.** `contracts/ENCODING.md` est la seule définition du format binaire, de l'arithmétique, de la règle de remplacement et des preuves. `solver/FORMAT.md` garde les règles d'arêtes R1-R8, les champs JSON et la politique du solveur, et renvoie à ENCODING.md pour le reste. Il n'y a plus deux définitions qui pourraient se contredire.
- **Contrat corrigé.**
  - AM-04.1 : la règle de remplacement compare désormais une **qualité** (q, masse). L'ancienne règle bloquait la croissance honnête du graphe, et récompensait la censure.
  - AM-04.2 : tags de longueur quelconque. Seul `keccak256(tag)` est stocké ; l'enregistrement d'un ensemble coûte 14 % de moins.
  - D44 : lignes VIA_OWNER, permises seulement si l'ensemble l'engage dans sa politique.
  - Lignes d'agent sans source, quand elles sont vides.
- **Différentiel réel : 9 vecteurs sur 9** acceptés par le contrat v1, avec eEff, graphRoot, vectorRoot, masse et q identiques. Les mainnet tournent en Registry-verified, sur un fork du mainnet avec les vrais registres. Les 4 violations se comportent comme attendu aux deux niveaux. C'est mesuré deux fois, par Foundry et par `simulate.py`.
- **Tests** : `forge test` **91 verts** (78 au départ), fork compris ; `pytest` **134 verts, 1 sauté** (128 au départ).
- **`/code-review high`** relancé sur ce worktree (la branche est vérifiée en tête du rapport de revue, AM-02.9) : 10 constats, 9 corrigés, 1 assumé (§7).

## 1. Le format unifié, et la justification de chaque arbitrage

Règle de décision : **correction de la borne d'abord, gas ensuite, puis ce qui change le moins de code audité** (le contrat).

| # | Divergence | 02 | 04 | **Tranché** | Pourquoi |
|---|---|---|---|---|---|
| F-1 | budget positif déclaré | `bPlus` = max(10 000, Σ vraie) | `sPlus` = Σ vraie | **sPlus** (sémantique du 04, bit 0x4000 du 02) | Les deux donnent une borne **correcte**. Sous 10 000, la marge du 02, (B⁺ − S)/B⁺, compte aussi la masse absorbée (D5), qui n'est pas omise : elle est juste, mais trop large. Sur le test `test_declaredSPlusBelowGrid`, elle vaut 0,7·t_A au lieu de 0,2·t_A. sPlus détermine B⁺ ; l'inverse est faux. Même coût (u32). **L'argument du 04, « B⁺ seul ne permet pas la marge d'omission quand Σ < 10 000 », est trop fort** : la marge est permise, seulement moins précise |
| F-2 | bits d'en-tête | 0x8000 wallet, 0x4000 B⁺, 0x2000 alias, nE 13 bits | 0x8000 SRC, 0x4000 ALIAS, 0x2000 VIA_OWNER, 0x1000 SPLUS | **0x8000 SRC, 0x4000 SPLUS, 0x2000 ALIAS, 0x1000 VIA_OWNER, nE 12 bits** | On garde la disposition du contrat et on ajoute VIA_OWNER dans le bit libre. Aucune boucle Yul ne change de forme. 12 bits suffisent : ROW_MAX = 256 |
| F-3 | ligne alias | `u ‖ hdr ‖ wallet ‖ src` | `u ‖ hdr ‖ ref` | **`u ‖ hdr ‖ src:20 ‖ ref:W`** (02) | Chaque feuille Merkle nomme son client, et `proveWallet` sur un alias n'a pas besoin de la ligne source. Coût : 20 octets par alias, soit 1 alias sur les 9 vecteurs et 0 sur le mainnet. La version du 04 n'était pas fausse |
| F-4 | repli owner D44 | non implémenté | VIA_OWNER derrière un drapeau | **implémenté, engagé dans la politique** (`policy.ownerFallback`, dans le `setId`) | C'est une règle d'arête. Un ensemble sans repli qui accepterait des lignes VIA_OWNER accepterait des arêtes que sa propre règle refuse, ce qui casse la domination (D32). Le défaut est false : **la décision d'activer reste à Hugo**, mais le format ne bougera plus |
| F-5 | ligne d'agent sans source | refusée | permise si vide | **permise si vide** (04) | Sans elle, un agent absorbant de masse > 0 sans wallet paie la marge de troncature. Sur le mainnet, oublier la ligne vide de #18 fait passer e de 9 wei à 0,44 WAD (R4), ce qui ruine toute la méfiance. Elle reste contestable : `proveWallet` étendu dès qu'un wallet apparaît. Le refus du 02 n'était pas faux, mais trop coûteux |
| F-6 | égalité de poids entre tags | `feedbackIndex` le plus grand | ordre des code points du tag1 | **index le plus grand** (02) | Hors brief, trouvé à la lecture du code. Le contrat ne garde plus que des hashes de tags (F-7) : il ne peut pas comparer des chaînes. **La règle du 04 était incompatible avec la vérification on-chain** : sur `mainnet_em_d44`, 7 arêtes réelles changent d'index, et le vecteur du 04 aurait été refusé en Registry-verified (`EdgeMismatch`). L'angle mort AM-04.12 (UTF-8 contre UTF-16 dans l'indexeur TypeScript) disparaît |
| F-7 | tags > 32 octets (AM-04.2) | refusés (`BadParams(8)`) | nécessaires | **longueur quelconque, `keccak256(tag)` stocké** | La correspondance avec le registre se faisait déjà par hash. Le nom ne servait qu'à `triggerTag`, qui devient le hash. Gas : −1 slot par tag, `registerAnchorSet` −14 % |
| F-8 | vecteurs | `setId` D39 (générateur du 02) | ni politique ni `setId` | **chaque vecteur porte `set.policy`, `set.setId`, `set.tagSchemaHash`, `expected.qEff`, `expected.mass`** | D39. L'encodeur ABI Python, écrit à la main sans dépendance, est vérifié contre `cast abi-encode` et contre `computeSetId` on-chain |
| — | négatifs jamais omis, ancres jamais tronquées | « faute prouvable » | « interdit au solveur honnête » | **les deux, écrits une fois** (ENCODING §3.2) | Pas de désaccord de fond |
| — | ligne d'agent qui engage sa source même vide | (permis) | exigé | **exigé dès que la source existe** | Une ligne vide sans source effacerait les slashs d'un agent sans pouvoir être contestée |
| — | ROW_ALIAS_MAX = 64 | — | règle du solveur | **canonicalisation du solveur, non vérifiée par le contrat** | Elle ne borne rien on-chain : le nombre total de copies, donc de preuves par fait (AM-02.5), reste le même. Voir AM-INT.7 |

Format complet : `contracts/ENCODING.md` (tableau F-1 à F-8 en tête). Changements côté solveur : `solver/FORMAT.md` §4 (I-1 à I-7).

## 2. Corrections du contrat

### AM-04.1 : règle de remplacement (ENCODING §5, PROOFS L7)

**Ce qui était faux dans la règle du 02** (eUp + eLow, strictement meilleur) :
1. Elle bloquait la croissance honnête : chaque arête positive ajoute 1 wei au plancher d'arrondi de r. Le 04 avait mesuré un report de 601 blocs.
2. **Elle récompensait la censure.** Un certificat qui omet des arêtes a moins d'arêtes positives, donc un eUp plus petit, et il remplaçait le certificat honnête. Mesuré : `test_openReplacementRule` vérifie que l'eEff de la censure est inférieur à celui du certificat honnête.

**Nouvelle règle** (ensembles ouverts). Un certificat est accepté si l'une des conditions suivantes tient :
- pas de certificat, registre changé, certificat périmé, ou budget eLow épuisé ;
- (masse_new + eLow_cur ≥ masse_cur et q_new ≤ q_cur) ;
- (âge > minRefresh et q_new ≤ q_cur + slackRefresh).

Deux compléments, ajoutés après la revue de code :
- la voie rapide exige aussi **D_new ≥ D_cur**, où D = Σ_v d_v est la masse de méfiance (une arête négative omise ne change ni la masse ni q) ;
- un certificat **déjà prouvé faux** ne peut pas être resoumis à l'identique, ce qui effacerait ses preuves.

Définitions : q = eUp sans le plancher E⁺ + 1 ; masse = Σ_a ⌊λ_a·Σ_v t_v⌋ ; q_cur = eEff − eFloor + eLowEff (le titulaire élargi par ses preuves). Les Submitter-attested remplacent toujours (D27).

Justification (PROOFS L7) :
- pour deux sous-solutions valides, ‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁ : la plus massive est la plus précise ;
- q garde le côté méfiance : r ≥ α‖t* − t‖₁ − (E⁺ + 1), donc une sous-solution peu massive a un q grand ;
- le vecteur nul (AM-5.16) a q ≈ 1 WAD : il ne remplace jamais un certificat vivant, et tout certificat honnête le remplace aussitôt ;
- au point fixe entier, q = 0 quelle que soit la taille du graphe.

| Cas (`test_openReplacementRule`, et `simulate.py` sur le mainnet) | Règle du 02 | Règle intégrée |
|---|---|---|
| graphe qui grandit (nouvel avis d'ancre) | reporté (601 blocs sur le fork du 04) | **accepté aussitôt** (fork : eEff 16 → 24, certifié en 395 ms) |
| censure par omission, sans dilution | **acceptée** (eUp plus petit) | **refusée** (masse plus faible) |
| révocation honnête, sans preuve | refusée jusqu'à minRefresh | refusée jusqu'à minRefresh, **ou acceptée aussitôt après une preuve** sur le titulaire (eLow crédité) |
| vecteur nul (AM-5.16) | refusé (eUp ≈ 1 WAD) | refusé, même dans la fenêtre |
| omission d'une arête négative (même masse, même q) | refusée (eUp égal, règle stricte) | refusée (D plus faible) |
| resoumission à l'identique d'un certificat prouvé faux | acceptée si plus précise après élargissement | refusée |
| dilution (sPlus sous-déclaré, ou arête sœur omise) | acceptée | **acceptée** si elle ne touche ni la masse ni D : AM-02.2 reste ouvert, le surveillant la prouve (voir AM-INT.1) |

Coût : quatre slots (`mass`, `eFloor`, `distrustMass`, `eSubmitted`), l'accumulation de la masse dans la passe (≈ 15 gas par nœud et par colonne) et la somme de D. Vue `quality(setId)` → (masse, q_cur, D, prouvé), pour que le service vérifie la règle avant de payer.

### AM-04.2 : tags de plus de 32 octets
`TagSpec.tag` peut avoir n'importe quelle longueur non vide ; seul le hash est stocké (3 slots par tag au lieu de 4). `requester_rating:knowledge_access` (33 octets) est accepté. Le vecteur `mainnet_em_d44` (VIA_OWNER, tag de 33 octets) passe en Registry-verified sur le fork du mainnet : 3,70 M gas. `Assessment.triggerTag` = keccak256(tag1). Coût : `registerAnchorSet` passe de 492 634 à 423 614 (médiane du gas report).

### Autres corrections
- **`proveWallet(setId, r, src, amends)`** facture eLow à hauteur de la masse positive engagée ⌈S⁰/B⁰⌉, et non plus WAD. C'est l'invariant de plafond de `proveEdge` (L6). Pour un alias, c'est la ligne source qui compte, passée comme dans `proveEdge`. La part déjà prépayée par un sPlus déclaré n'est plus facturée deux fois. Une ligne vide qui change de source ne coûte plus rien à la borne basse. Le 02 n'était pas faux (c'était un majorant), mais l'élargissement était inutilement global (AM-02.4) et pouvait rendre un ensemble STALE à tort.
- **Agent brûlé avec une ligne sans source** : `proveWallet` répond `NothingToProve`. Avant, le revert du registre valait « source changée », ce qui permettait un élargissement fictif de 2 WAD sur eUp.
- **Tests vides du 02.** Avec un appel bas niveau, `vm.expectRevert` ne fait pas échouer le test si l'appel passe : il met seulement `ok` à faux. `_expectSubmitRevert` ignorait `ok` : 10 appels et 3 `expectRevert` bas niveau ne vérifiaient rien. Corrigé par `assertTrue(ok)`. **Les 10 refus tiennent réellement** ; seuls les 2 du test de remplacement ne tenaient plus avec la nouvelle règle, et ce test a été réécrit.

## 3. Test différentiel réel

| Banc | Commande | Résultat |
|---|---|---|
| Foundry, jouets (bouchons, Submitter-attested) | `cd contracts && forge test --mc SolverVectorsTest -vv` | **5/5** acceptés ; setId, eEff, graphRoot, vectorRoot, masse et q égaux ; copie mutée refusée par `NotSubSolution` |
| Foundry, mainnet (fork du bloc 108 835 675, vrais registres, Registry-verified) | idem | **4/4**, avec les mêmes égalités |
| Foundry, violations, Registry-verified | idem | fabrication et gonflement refusés (`EdgeMismatch`) ; dilution et négatif omis acceptés (indétectables à la soumission) |
| Foundry, violations, Submitter-attested | idem | 4/4 acceptés |
| anvil `--network monad`, fork du mainnet | `cd solver && ANCRE_SIM_DIR=… .venv/bin/python simulate.py` → `solver/out/simulation.json` | **9/9** acceptés, valeurs égales, 9 copies mutées refusées ; violations prouvées par le surveillant aux deux niveaux, **preuve (v) comprise** |

Détail des violations sur le fork (scénario B, vrai registre) :

| Violation | Registry-verified | Submitter-attested |
|---|---|---|
| fabrication 0x0730 → #4 | refusée, `EdgeMismatch(0, 0)` | acceptée ; `proveEdge` (v), 281 585 gas ; eLowEff 0 → 0,167 WAD |
| gonflement du slash #18 → #4 (−1 au lieu de −10 000) | refusée, `EdgeMismatch(4, 2)` | acceptée ; `proveEdge` (v), 285 182 gas ; eEff → 0,222 WAD |
| dilution #18 → #3 | acceptée ; `proveEdge`, 304 293 gas ; eLowEff → 0,111 WAD | idem |
| négatif omis (ligne d'ancre et copie) | acceptée ; 2 × `proveEdge` (275 k, 284 k) ; eEff 18 wei → 0,556 WAD | idem |
| deux omissions sur la même ligne | acceptée ; 2 preuves chaînées par les amendements (279 k, 259 k) | idem |

Cycle du service (scénario C, ensemble ouvert Registry-verified, état réel) :
- premier certificat : 390 ms ;
- recalcul identique : ignoré ;
- **graphe qui grandit : certifié sans attente** ;
- **un tiers republie l'ancien graphe**, qui est une dilution. Avant la revue de code, il était accepté (même masse, même q), puis prouvé par le surveillant (294 k) et remplacé aussitôt par le certificat honnête. **Depuis la revue, il est refusé à la soumission** (`NotBetter`) : sans l'avis sur #22, la copie par #22 de la ligne de 0xea0b (qui porte le slash de #4) perd sa masse, donc D baisse ;
- `addNodes` d'un tiers : absorbé ;
- rafraîchissement par âge : republié.

Découpage (scénario D, 1 237 nœuds) : crash puis reprise, certifié.

Non fait : le fork du testnet. Les vecteurs viennent du mainnet, et le banc P1 du 02 tourne déjà sur le testnet.

## 4. Tests

| Suite | Départ (fusion) | Fin |
|---|---|---|
| `cd contracts && forge test` (fork mainnet et fork testnet compris) | 78 | **91** (+ `SolverVectorsTest` ×4, 4 tests de la revue, `test_viaOwnerRows`, `test_viaOwnerRowFollowsTransfer`, `test_sourcelessEmptyRow`, `test_longTagsAccepted`, `test_declaredSPlusBelowGrid` ; `test_openReplacementRule` réécrit) |
| `cd solver && .venv/bin/python -m pytest -q tests` | 128 + 1 sauté | **134 + 1 sauté** (égalité par index, setId contre `cast`, SOURCE par `proveWallet`, 3 tests de la revue ; tests du certificateur et du surveillant passés en v1) |
| `contracts/test/diff/gen.py` (48 vecteurs du 02) | verts | verts en sémantique sPlus : 61 lignes déclarées, dont 16 sous GRID |

## 5. Gas modifié (`contracts/GAS.md`, section « Intégration 02 + 04 »)

| Cas | Avant | Après |
|---|---|---|
| `registerAnchorSet` (4 tags) | 492 634 | 423 614 (−14 %) |
| Démo P1, 300 arêtes, k = 3, mise à jour, Registry-verified | 14 970 695 | 14 974 802 (0 %) |
| idem, Submitter-attested | 1 321 852 | 1 351 917 (+2,3 %) |
| Mises à jour GasTest (E de 10 à 10 000, k de 1 à 8) | — | environ +0,1 % à +3 % |
| Premiers certificats | — | environ +40 k à +400 k (4 slots neufs, plus le même calcul) |
| Mainnet réel, 3 arêtes, premier certificat | 645 080 | 719 202 |
| Taille du contrat | 30 847 o | 33 527 o (limite Monad 128 Ko) |

Ajouts mesurés sur le fork : soumissions des vecteurs (1,03 M à 6,10 M en Registry-verified), preuves (259 k à 304 k), découpage (`addNodes` ≈ 45,9 k par nœud en v1, contre 28,8 k en v0 : deux slots par nœud depuis le 02).

## 6. Angles morts

| Id | Angle mort | Statut |
|---|---|---|
| **AM-INT.1** | **Une dilution qui ne change ni la masse ni la méfiance passe la règle de remplacement** (AM-02.2). Sur le fork, la republication de l'ancien graphe par un tiers est passée à masse et q égaux (omettre l'avis de 0x0730 sur #22 redistribue la masse entre #18 et #22, qui portent la même ligne). `proveEdge` l'a corrigée (294 k gas), puis le certificat honnête l'a remplacée aussitôt. Depuis la revue, ce cas précis est refusé par D, mais une dilution purement positive passe encore (`test_replacementRefusesResubmittingProvenCertificate`, première soumission). **Sur un ensemble ouvert, la démo a besoin d'un surveillant actif**, sinon il faut un ensemble Submitter-attested | mesuré ; boucle de défense testée sur le fork (avant la revue) et en Foundry |
| AM-INT.2 | La fenêtre de rafraîchissement (âge > minRefresh) laisse passer une baisse de masse non prouvée, donc aussi une censure, une fois par minRefresh. Prix de la vivacité des révocations ; `minRefresh = maxAge` la ferme | choix documenté (ENCODING §5) ; valeur à fixer par ensemble |
| AM-INT.3 | La masse est un scalaire : deux certificats valides de même masse sont jugés équivalents, même si l'un est moins bon pour un agent donné (le maximum point par point des deux serait meilleur) | accepté |
| AM-INT.4 | Nuisance par avis négatif (AM-04.4 et 04.5 chiffrés en v1). Une preuve de négatif omis sur une ligne d'ancre porte eEff de 18 wei à 0,556 WAD. Avec ρ = 1/2, plus aucun agent ne passe `isTrusted` jusqu'à la recertification. Seul le client d'une ligne fournie peut le faire (ancre ou wallet d'un agent massif), et la recertification est maintenant immédiate (q_cur est élargi) | mesuré ; à dire dans l'ERC |
| AM-INT.5 | `vm.expectRevert` suivi d'un appel bas niveau ne vérifie rien si `ok` est ignoré (13 cas chez le 02). Le motif peut exister dans d'autres chantiers | corrigé ici ; **à relayer aux chantiers 05 et 06** |
| AM-INT.6 | via-IR met `block.number` en cache dans une fonction de test : `vm.roll(block.number + x)` peut faire reculer le bloc | contourné (numéros explicites) |
| AM-INT.7 | ROW_ALIAS_MAX = 64 (D44) n'est vérifié par rien et ne borne rien on-chain : c'est une canonicalisation du solveur. Le coût des preuves par copie (AM-02.5) est inchangé | documenté |
| AM-INT.8 | VIA_OWNER est implémenté avant la décision de Hugo sur D44 (désactivé par défaut, engagé par ensemble) | 🧑 question 1 |
| AM-INT.9 | Taille 32,8 Ko : plus loin encore des 24 Ko d'Ethereum (question 3 du 02) | ouvert pour l'implémentation de référence de l'ERC |
| AM-INT.10 | Les noms de tags ne sont plus on-chain. `triggerTag` est un hash : l'écran (07) et le payeur (05) doivent le résoudre avec la configuration de l'ensemble | 🧑 question 4 |
| AM-INT.11 | `simulate.py` dépend de rpc1.monad.xyz et de délais longs (`ETH_RPC_TIMEOUT=900`) : deux vecteurs ont échoué au premier passage sur un délai d'attente entre `cast` et anvil | contourné, documenté |
| AM-INT.12 | Interface de l'indexeur (03) modifiée : règle d'égalité R5 (index le plus grand) et `via = none` dans les vecteurs | **à relayer au 03 par le pilote** (FORMAT §0, §7) |
| AM-INT.13 | Le certificateur écrit les `SetParams` comme un littéral `cast` : un tag qui contient `, ( ) [ ] "` ou une espace est refusé par l'outil (le contrat, lui, l'accepte) | limite d'outillage, lève une erreur explicite |
| AM-INT.14 | Le gas d'une mise à jour augmente de 1 à 3 % (masse, méfiance, contrôle de la source). Deux pistes non faites : sortir la masse de la boucle chaude, et écrire `_verifyRows` en Yul | optimisation possible |
| AM-INT.15 | Après une preuve, un tiers peut resoumettre une **variante** du certificat dilué (1 wei de moins quelque part) : il faut la reprouver. Chaque tour coûte environ 1 M gas au tiers et 0,3 M au surveillant ; rien ne le borne on-chain | ouvert ; mémoriser les faits prouvés par ligne serait la fermeture |

## 7. Revue de code

Relancée après la coupure de la machine, avec la cible explicite `/Users/hugo/Projet/ancre-int`, diff `ae4c153..230be35`. Le rapport de revue affiche `chantier/integration-02-04` et ne cite que des chemins de ce worktree : AM-02.9 évité.

Validé sans remarque : réécriture de `_storeVectors`, encodeur ABI contre `computeSetId`, lecture des 9 champs de `certificate()`, chaînage des amendements, miroir de la règle.

| # | Constat | Suite |
|---|---|---|
| 1 | La fenêtre de rafraîchissement laisse passer une baisse de masse sans preuve (censure pendant minRefresh blocs) | **assumé** (AM-INT.2) : prix de la vivacité des révocations. Le certificat honnête re-remplace aussitôt (plus de masse, même q) ; `minRefresh = maxAge` ferme la fenêtre |
| 2a | Omission d'arêtes négatives acceptée à qualité égale | **corrigé** : masse de méfiance D ; test `test_replacementRefusesOmittedNegative` |
| 2b | Resoumission d'un certificat prouvé faux, qui efface ses preuves | **corrigé** : refus si prouvé et contenu identique ; test `test_replacementRefusesResubmittingProvenCertificate`. Une variante modifiée doit être reprouvée (AM-INT.15) |
| 3 | `proveWallet` sur un alias facture 1 au lieu de S⁰/B⁰ | **corrigé** : paramètre `src` ; test `test_proveWalletAliasAndPrepaid` |
| 4 | Agent brûlé, ligne sans source : élargissement fictif | **corrigé** ; test `test_burntSourcelessRowNothingToProve` |
| 5 | `proveWallet` facture deux fois la marge sPlus prépayée | **corrigé** (même test que 3) |
| 6 | Le surveillant prouve une DILUTION devenue inoffensive après une preuve antérieure | **corrigé** : `still_dilutes` sur la ligne amendée ; test `test_dilution_rechecked_after_earlier_proofs` |
| 7 | Ligne sans `row_src` encodée comme ligne d'adresse | **corrigé** : `NotEncodable` ; test `test_encode_refuses_row_without_source` |
| 8 | Ancres triées sans leurs lambdas dans `SetConfig` | **corrigé** : tri conjoint, `make_set_block` partagé par export et certificateur ; test `test_set_config_sorts_lambdas_with_anchors` |
| 9 | Sonde mutée creuse, débordement possible, aucune seconde soumission | **corrigé** : sonde après enregistrement, garde, resoumission vérifiée (et `quality()` comparé, D et « prouvé » compris) |
| 10 | Nettoyage (`quality` calculé deux fois, ternaire mort, bloc `set` dupliqué) | **corrigé** |

## 8. Ce qu'il reste à faire

1. 🧑 **Déploiement sur le testnet** du contrat intégré (le script du 02 reste valable : `script/Deploy.s.sol`) ; accord de Hugo, keystore, ≥ 12 MON de testnet.
2. **03 (indexeur)** : règle d'égalité R5, `via = none`, ENCODING §3.2 ; parité réelle avec `from_indexer.py`.
3. **05 (payeur)** : `isTrusted(agentId, setId)` inchangé ; `triggerTag` est un hash.
4. **07 (écran)** : le journal du certificateur porte maintenant `qEff`, `mass`, `qCur`, `massCur`, `eLowCur` ; résolution des hashes de tags.
5. **08 (ERC)** : remplacer B⁺ par sPlus ; reprendre la règle de remplacement (ENCODING §5) et le lemme L7 ; AM-INT.1 et AM-INT.4 dans les Security Considerations ; règle d'égalité par index.
6. Surveillant pour la période de jugement : il devient indispensable sur un ensemble ouvert (AM-INT.1). Une preuve coûte environ 0,3 M gas.
7. Optionnel : fuzz de L6 et L7 en fractions exactes ; simulation sur un fork du testnet ; optimisations de gas (AM-INT.14).

## 9. Questions pour Hugo

1. **D44 (repli owner)** : faut-il l'activer dans les ensembles de démo ? C'est prêt dans le format, le contrat et le solveur. Effet mesuré par le 04 : nul sur le graphe de référence, +37 arêtes portées sur execution.market.
2. **minRefresh des ensembles de démo** : court, pour que les révocations passent sans preuve (la censure passe alors aussi une fois par fenêtre), ou égal à maxAge, pour résister à la censure (chaque baisse demande alors une preuve) ?
3. **Niveau de la démo** (déjà posée par le 02, et elle change de poids) : un ensemble ouvert exige un surveillant actif pendant le jugement (AM-INT.1). Faut-il un ensemble Submitter-attested pour la démo, et qui paie les preuves ?
4. **Noms des tags** : faut-il les émettre dans `AnchorSetRegistered` (ESTIMÉ : quelques milliers de gas par tag, une seule fois), pour que l'écran et les payeurs les lisent on-chain ?
5. **Langue** : `contracts/ENCODING.md` est désormais en anglais (consigne de session ; il alimentera l'ERC). Ça vous convient ?

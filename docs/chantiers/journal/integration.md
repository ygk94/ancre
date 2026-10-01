# Journal de la session d'intégration 02 + 04

> Une entrée par étape, la plus récente en bas. Worktree `/Users/hugo/Projet/ancre-int`, branche `chantier/integration-02-04` (fusion sans conflit de `chantier/02-contrat` et `chantier/04-solveur`). Aucun push, aucune transaction réelle : tout ce qui touche une chaîne tourne sur un fork local anvil ou dans Foundry.

---

## 2026-10-01 — Démarrage : état de la fusion et divergences relevées

**Lu** : CLAUDE.md ; rapports et journaux 02 et 04 en entier ; `contracts/ENCODING.md`, `solver/FORMAT.md`, `contracts/PROOFS.md` ; journal D1-D46 et angles morts du CR ; le contrat v1 en entier ; `solver/{export,ppr,graph,certifier,watcher,simulate}.py`.

**État de départ** (MESURÉ le 01/10) :
- `cd contracts && forge test` : **78 verts** (fork mainnet et fork testnet compris) ;
- `cd solver && .venv/bin/python -m pytest -q tests` : **128 verts, 1 sauté** (venv recréé depuis `requirements.txt`).

**Divergences entre les deux formats v1** (les cinq du brief, plus trois que la lecture du code a fait apparaître) :

| # | Point | 02 (contrat) | 04 (solveur) |
|---|---|---|---|
| F-1 | budget positif déclaré | `bPlus` = max(10 000, Σ vraie), drapeau 0x4000 | `sPlus` = Σ vraie, drapeau 0x1000 |
| F-2 | bits d'en-tête | 0x8000 wallet, 0x4000 B⁺, 0x2000 alias, nE sur 13 bits | 0x8000 SRC, 0x4000 ALIAS, 0x2000 VIA_OWNER, 0x1000 SPLUS, nE sur 12 bits |
| F-3 | ligne alias | `u ‖ hdr ‖ wallet ‖ src` (wallet répété, vérifié égal) | `u ‖ hdr ‖ ref` (source héritée) |
| F-4 | repli owner D44 | absent (E6 en attente), ligne d'agent sans wallet refusée | VIA_OWNER, derrière un drapeau |
| F-5 | ligne d'agent sans source | refusée aux deux niveaux | permise si vide (`agentWallet = 0`) |
| F-6 | **égalité de poids entre tags** | `feedbackIndex` le plus grand | ordre des code points du tag1 |
| F-7 | tags > 32 octets (AM-04.2) | refusés (`BadParams(8)`) | exigés par execution.market |
| F-8 | vecteurs | `setId` D39 avec politique | ni politique ni `setId` |

F-6 n'était pas dans le brief : au niveau Registry-verified, le contrat compare le `feedbackIndex` engagé à celui qu'il relit. Une égalité entre deux tags du filtre aurait donc fait refuser un certificat honnête du solveur (`EdgeMismatch`).

**Plan** : (1) trancher F-1 à F-8 et écrire un format unique ; (2) contrat : format, AM-04.1, AM-04.2 ; (3) solveur aligné, vecteurs régénérés ; (4) différentiel réel (Foundry et `simulate.py` sur fork) ; (5) tests, `/code-review high` sur ce worktree, rapport.

---

## 2026-10-01 — Étapes 1 et 2 : format unifié tranché, contrat corrigé (AM-04.1, AM-04.2, D44)

**Arbitrages du format** (justification complète dans le rapport, §1 ; tableau en tête de `contracts/ENCODING.md`) :
- **F-1, sPlus contre B⁺ : sPlus (04).** Les deux sont des bornes correctes : quand Σ < 10 000, B⁺ = 10 000 ne dit pas combien de masse a été omise, et la marge (B⁺ − S)/B⁺ facture aussi la masse absorbée. La marge reste donc juste, mais trop large. L'argument du 04 (« B⁺ ne permet pas la marge ») est trop fort : B⁺ la permet, en moins précis. sPlus détermine B⁺ ; l'inverse est faux. Même coût (u32). On garde le bit 0x4000 du 02 avec la sémantique du 04.
- **F-2, F-3 : disposition du 02**, avec VIA_OWNER à 0x1000 et nE sur 12 bits. La ligne alias répète sa source (20 octets) : chaque feuille Merkle dit qui est son client, et `proveWallet` sur un alias n'a pas besoin de la ligne source. Le surcoût est faible : une seule ligne alias dans les 9 vecteurs, aucune sur le mainnet.
- **F-4, D44 : VIA_OWNER implémenté**, mais seulement si l'ensemble engage `policy.ownerFallback = true` dans son `setId`. C'est une règle d'arête : un ensemble sans repli qui accepterait des lignes VIA_OWNER accepterait des arêtes que sa propre règle refuse. Défaut false : la décision d'activer reste à Hugo, mais le format ne changera plus.
- **F-5, ligne d'agent sans source : 04.** Sans elle, un agent absorbant de masse > 0 sans wallet paie la marge de troncature (sur le mainnet, 9 wei → 0,44 WAD : toute la méfiance de l'ensemble). Elle reste contestable : `proveWallet` étendu dès qu'un wallet apparaît.
- **F-6, égalité entre tags : 02 (index le plus grand).** Le contrat ne stocke plus que des hashes de tags (F-7) : il ne peut pas comparer des code points. Le solveur est corrigé. L'angle mort AM-04.12 (UTF-8 contre UTF-16 dans l'indexeur TypeScript) disparaît.
- **F-7 (AM-04.2)** : tag de longueur quelconque, seul `keccak256(tag)` est stocké ; `triggerTag` = hash.
- **Négatifs jamais omis, ancres jamais tronquées** : les deux sessions étaient d'accord sur le fond (le 02 le dit « prouvable », le 04 « interdit au solveur honnête »). C'est écrit une seule fois dans ENCODING §3.2.

**AM-04.1, règle de remplacement** (ENCODING §5, PROOFS L7). L'ancienne règle comparait eUp + eLow, de façon stricte. Deux défauts :
- **elle bloquait la croissance honnête** : chaque arête positive ajoute 1 wei à r ;
- **elle récompensait la censure** : un certificat qui omet des arêtes a un E⁺ plus petit, donc un eUp plus petit, et remplaçait le certificat honnête. **Je l'ai mesuré** (`test_openReplacementRule` : eEff de la censure < eEff de l'honnête).

Nouvelle règle :
- q = eUp sans le plancher E⁺ + 1 ;
- masse = Σ λ t ;
- acceptée si masse_new + eLow_cur ≥ masse_cur et q_new ≤ q_cur, ou dans la fenêtre de rafraîchissement (q seul).

Justification : pour deux sous-solutions valides, ‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁ (L7). Le vecteur nul (AM-5.16) a q ≈ 1 WAD : il est refusé.

**Corrections et ajouts dans le contrat** :
- `proveWallet` facture eLow à hauteur de la masse engagée S⁰/B⁰, et non plus WAD : une ligne vide ne coûte plus rien à la borne basse ;
- `_clientOf` est coupé en un chemin rapide et un chemin rare ;
- `_storeVectors` est réécrit sans trois variables, sinon la pile était trop profonde en via-IR.

**Tests** (MESURÉ, `cd contracts && forge test`, 01/10) : **83 verts** (78 → 83).
- Nouveaux : `test_viaOwnerRows`, `test_viaOwnerRowFollowsTransfer`, `test_sourcelessEmptyRow`, `test_longTagsAccepted`, `test_declaredSPlusBelowGrid`.
- Réécrit : `test_openReplacementRule`.
- `gen.py` passe à sPlus : 48 vecteurs, 61 lignes déclarées, dont 16 sous GRID, verts.

**Trouvé en route** :
- (a) **avec un appel bas niveau, `vm.expectRevert` ne fait pas échouer le test si l'appel passe** : il met seulement `ok` à faux. `_expectSubmitRevert` du 02 ignorait `ok` : ses 10 appels, plus 3 `expectRevert` bas niveau de `Verified.t.sol`, ne vérifiaient rien (13 vérifications creuses). Corrigé par `assertTrue(ok)`. Les 10 refus tiennent réellement ; les 2 du test de remplacement ne tenaient plus avec la nouvelle règle (réécrit). MESURÉ par une sonde jetable.
- (b) via-IR met `block.number` en cache dans une fonction de test : `vm.roll(block.number + x)` peut faire reculer le bloc. J'utilise des numéros explicites.

**Gas** (MESURÉ, mêmes bancs sur une copie de HEAD dans le scratchpad, `forge test --match-contract "GasTest|RegistryBenchTest|UpgradeTest" -vv`) :
- `registerAnchorSet` : −14 % (médiane du gas report : 492 634 → 423 614 ; un slot de moins par tag) ;
- mises à jour Submitter-attested : +0,1 % à +2,7 % (démo E = 300, k = 3 : 1 352 488 → 1 374 409, soit +1,6 %), dû à l'accumulation de masse et à `_clientOf` ;
- premiers certificats : +37 k à +400 k (deux slots neufs, masse et eFloor, plus le même calcul) ;
- Registry-verified de la démo : 14 970 695 → 14 967 758 (inchangé) ;
- mainnet réel (3 arêtes, premier certificat) : 645 080 → 684 201 ;
- taille : 32 814 octets (30 847 avant ; la limite Monad est 128 Ko).

**Langue** : ENCODING.md est réécrit en anglais (consigne de session : docs techniques en anglais ; il alimentera l'ERC). PROOFS.md reste en français, comme l'a écrit le 02.

---

## 2026-10-01 — Étape 3 : solveur aligné, vecteurs régénérés

**Fait**
- `graph.py` : règle d'égalité R5 = `feedbackIndex` le plus grand.
- `export.py` :
  - en-têtes unifiés, ligne alias avec SRC répété ;
  - ligne d'agent sans source vide, sinon `NotEncodable` ;
  - **encodeur ABI écrit à la main** pour le `setId` D39 (sans dépendance web3), vérifié octet pour octet contre `cast abi-encode` sur les 13 vecteurs (test `test_set_id_of_published_vectors_matches_cast`) ;
  - `set.policy`, `set.setId`, `set.tagSchemaHash`, `expected.qEff` et `expected.mass` dans chaque vecteur ;
  - jouets avec des wallets synthétiques ;
  - encodage v0 supprimé.
- `certifier.py` :
  - ABI v1 : `SetParams` avec la politique, `certificate()` à 9 champs, vue `quality`, événement à 9 champs, nouvelles erreurs ;
  - `replacement_wait` reproduit la règle du §5 ;
  - stride k + 3 pour `reserveCapacity` ;
  - `SetConfig` porte la politique.
- `watcher.py` :
  - toutes les classes d'écart sont prouvables en v1 : `proveEdge` couvre FABRICATED et INFLATED (preuve (v)), SIGN_FLIP, DEFLATED, OMITTED_NEGATIVE et DILUTION ; `proveWallet` couvre SOURCE ;
  - les amendements sont chaînés dans l'ordre du `_amend` du contrat ;
  - les lignes alias passent avec leur ligne source ;
  - les écarts inoffensifs (OMITTED_POSITIVE sans dilution, DEFLATED sans dilution) sont signalés mais jamais prouvés : les prouver n'élargirait que eUp d'un ensemble honnête.
- `contracts/` : vue `quality(setId)` ajoutée pour que le service vérifie la règle avant de payer.
- Docs : `solver/FORMAT.md` réécrit. Il garde R1-R8, les champs JSON et la politique du solveur, et renvoie à ENCODING.md pour le binaire, l'arithmétique, le remplacement et les preuves.

**Mesures** (MESURÉ, 01/10, `cd solver && .venv/bin/python export.py`)
- Mêmes e, mêmes itérations et mêmes t que le 04 sur les 9 vecteurs.
- **F-6 confirmé sur les données réelles** : 7 arêtes de `mainnet_em_d44` changent de `feedbackIndex` (égalités entre tags `executor_rating:*` / `requester_rating:*`). Le vecteur du 04 aurait été refusé en Registry-verified (`EdgeMismatch`).
- Les octets des lignes de `mainnet_honest_d20`, `mainnet_slash_anchor` et `mainnet_scanner_preD15` sont identiques à ceux du 04 (même graphRoot) : ces vecteurs n'utilisent ni alias, ni sPlus, ni VIA_OWNER.
- `out/mainnet.md` (acte 1) est inchangé à l'octet.

**Tests** : `cd solver && .venv/bin/python -m pytest -q tests` → **131 verts, 1 sauté** (128 → 131 : égalité par index, setId contre cast, SOURCE prouvé par `proveWallet`).

---

## 2026-10-01 — Étape 4 : test différentiel réel

**Foundry** (`contracts/test/SolverVectors.t.sol`, dans `forge test`) : chaque vecteur du solveur est rejoué avec sa politique.
- Jouets : sur les bouchons, au niveau Submitter-attested.
- Mainnet : sur un **fork du mainnet au bloc 108 835 675**, vrais registres, Registry-verified.
- Pour chaque vecteur, on vérifie : `computeSetId` = `setId` du JSON ; la copie mutée (t + 1e6 wei) est refusée par `NotSubSolution` ; le vecteur est accepté ; eEff, graphRoot, vectorRoot, masse et q sont égaux à l'attendu.

MESURÉ : **9/9**. Violations :
- Registry-verified : fabrication et gonflement refusés (`EdgeMismatch`) ; dilution et négatif omis acceptés ;
- Submitter-attested : les 4 acceptés.

**Fork anvil** (`cd solver && ANCRE_SIM_DIR=<scratchpad>/sim .venv/bin/python simulate.py`, ≈ 5 min, `--network monad`, rpc1, bloc 108 835 675) → `solver/out/simulation.json`. MESURÉ :
- **9/9 vecteurs acceptés**, toutes les valeurs égales, 9 copies mutées refusées (`NotSubSolution`).
- Gas des soumissions : 0,99 M (mainnet_honest_d20) à 6,06 M (scanner, 58 arêtes relues) en Registry-verified ; 19,7 M pour `toy_alias_owner_rowmax` (264 nœuds, premier certificat).
- Violations, Registry-verified :
  - fabrication refusée par `EdgeMismatch(0, 0)`, gonflement par `EdgeMismatch(4, 2)` ;
  - dilution prouvée (304 k gas) : eLowEff 0 → 0,111 WAD ;
  - négatif omis : 2 preuves (275 k et 284 k), eEff 18 wei → 0,556 WAD ;
  - deux omissions sur une ligne : 2 preuves chaînées.
- Violations, Submitter-attested : les 4 acceptées, puis **prouvées, preuve (v) comprise** :
  - fabrication : 282 k, eLowEff → 0,167 WAD ;
  - gonflement : 285 k, eEff → 0,222 WAD.
- Service (ensemble ouvert Registry-verified, état réel) :
  - premier certificat en 390 ms ;
  - recalcul identique ignoré ;
  - **graphe qui grandit (nouvel avis de l'ancre 0x0730 sur #22) : certifié immédiatement (eEff 16 → 24)**, là où le contrat v0 l'avait reporté de 601 blocs (AM-04.1 fermé) ;
  - **un tiers republie l'ancien graphe** (sans le nouvel avis) : accepté. Masse et q sont égaux, parce que #18 et #22 portent la même ligne (wallet 0xea0b) et que l'omission est une **dilution**, que la règle ne voit pas (AM-02.2). Le surveillant la prouve (294 k), eLow est crédité, et le certificat honnête la remplace aussitôt ;
  - `addNodes` d'un tiers absorbé ;
  - rafraîchissement par âge.
- Découpage, 1 237 nœuds : crash puis reprise, certifié (`addNodes` ≈ 45,9 k par nœud ; certificat 14,25 M).

Remarque de mesure : il faut `ETH_RPC_TIMEOUT=900` et `anvil --timeout 120000 --retries 10`. Sans eux, deux vecteurs ont échoué au premier passage sur un délai d'attente entre `cast` et anvil (état distant lu slot par slot), sans rapport avec le contrat.

**Non fait** : la simulation sur un fork du testnet. Le banc P1 du 02 (`RegistryBenchTest`) tourne déjà sur le testnet. Les vecteurs du solveur viennent du mainnet, donc le fork du mainnet est le bon juge.

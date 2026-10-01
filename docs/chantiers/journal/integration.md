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

# GAS — mesures réelles d'`AnchoredReputation.sol`

Légende : **MESURÉ** = sorti de `forge test` (commande donnée) · **CALCULÉ** = formule appliquée aux mesures · **DOC** = documentation Monad · **ESTIMÉ (CR)** = chiffre du CR du conseil, pour comparaison.
Environnement : Foundry 1.8.3, solc 0.8.28 via-IR, optimizer 200, `network = "monad"`. Limite par transaction : **30 M gas** (DOC, `developer-essentials`, tableau « Transaction gas limit ») ; prix du gas **102 gwei** (MESURÉ, `cast gas-price --rpc-url https://rpc.monad.xyz`, 28/09 ; base fee 100 gwei).

## Porte P1 (chantier 02, 2026-09-28) : coût du niveau Registry-verified — contrat v1

Banc : `test/RegistryBench.t.sol`, **fork du testnet 10143 au bloc 66 494 673, vrais registres ERC-8004 v2.0.0** (même bytecode que le mainnet). Les agents (`register`) et les avis (`giveFeedback`) du graphe sont écrits dans le fork ; le même certificat est soumis à trois ensembles. Chaque soumission est une transaction isolée (21 000 + calldata + plancher EIP-7623 compris, pages MIP-8 froides à chaque transaction).
Commande : `forge test --match-contract RegistryBenchTest -vv | grep 'P1|'` (≈ 100 s, RPC du testnet).

| Cas (k = 3) | Submitter-attested | Registry-verified | Surcoût | Par arête |
|---|---|---|---|---|
| **Démo acte 2 : 300 arêtes, 100 nœuds, 1 avis par couple** — mise à jour | 1 321 852 | **14 970 695** | 13,65 M | **45,5 k** |
| idem, premier certificat (après `addNodes` + `reserveCapacity`) | 1 449 082 | 15 097 925 | 13,65 M | 45,5 k |
| 30 arêtes, 10 nœuds, 1 avis par couple — mise à jour | 266 928 | 1 561 536 | 1,29 M | 43,2 k |
| 30 arêtes, 10 nœuds, **5 avis par couple** (même tag) — mise à jour | 266 693 | 3 131 181 | 2,86 M | 95,5 k |
| Mainnet réel (fork 108 445 171) : 3 arêtes de 0xea0b… sur #2/#3/#4, premier certificat | — | 645 080 | — | — |
| Recertification après l'upgrade vers la PR #80 (D28), même graphe | — | 367 312 | — | — |

(MESURÉ, `forge test --match-contract "RegistryBenchTest|UpgradeTest" -vv | grep 'P1\|D28'`, 28/09. « verified-open » coûte la même chose à 500 gas près.)
Submitter-attested coûte maintenant 1,32 M au lieu de 0,87 M (v0) : **les contrôles de forme** (cible = agent, wallet sur les lignes d'agents), exigés aux deux niveaux pour que toute arête reste contestable, coûtent ≈ 1,5 k par arête (boucle Solidity sur le calldata, à passer en Yul si besoin).

**Décomposition CALCULÉE du coût par arête** (≈ 45 k, avis unique) : `getLastIndex` à travers le proxy (page du couple, froide) + un `readFeedback` (page de l'avis) + `isAuthorizedOrOwner(client, j)` (pages owner, opérateurs, approbation) + `getAgentWallet(j)` ; plus, par ligne d'agent, `getAgentWallet(u)`, et par agent de masse, `ownerOf`. **Chaque avis supplémentaire du couple à relire coûte ≈ 13 k** (CALCULÉ : (95,5 − 43,2) / 4). La relecture « dernier index du tag » n'est donc pas bornée : un couple à 100 avis sous un seul tag coûte ≈ 1,3 M à relire (CALCULÉ).

**Taille maximale en une transaction** (CALCULÉ, pente mesurée, avis unique) : (30 M − 1,3 M) / 45,5 k ≈ **630 arêtes à k = 3**. En MON au prix mesuré : certificat de la démo ≈ 15,0 M × 102 gwei ≈ **1,53 MON**, 1,64 MON avec 7,5 % de marge de gas limit (sur Monad on paie la limite). Submitter-attested : 0,13 MON.

### Verdict P1

**Registry-verified passe pour la démo, et c'est le niveau que je recommande pour la démo** :
- le certificat de l'acte 2 tient dans une transaction avec une marge de ×2 (15,0 M sur 30 M) ;
- sur le testnet (D40 : ferme et répétitions), le coût est nul en vrai MON ;
- sur le mainnet, les graphes réels sont minuscules (3 arêtes utiles de 0xea0b… : 0,65 M MESURÉ, ≈ 0,07 MON).

**Limites franches** :
1. ×11 par rapport à Submitter-attested sur le graphe de la démo ; au-delà d'environ 630 arêtes (k = 3), un seul certificat ne passe plus en une transaction, et la vérification répartie n'est pas implémentée.
2. Un couple avec beaucoup d'avis coûte ≈ 13 k par avis relu : le certificateur doit **omettre** ces arêtes et déclarer B⁺ (sûr pour la borne basse, D32), ou passer au niveau Submitter-attested.
3. **Registry-verified ne ferme pas la dilution** (B⁺ sous-déclaré) : c'est invérifiable faute d'index par client, et seul `proveEdge` la corrige. Voir `PROOFS.md`, « Garanties ».

### Lectures (même banc, vrais registres, via `Consumer`, AM-R5.1)

| Lecture (k = 3, mode strict) | Gas marginal |
|---|---|
| `assess` avec veto, agent de masse, ancres avec avis sur lui | 139 055 à 165 888 |
| `assess` sans veto, strict (`ownerOf` en direct) | 80 609 |
| `isTrusted`, **refus bon marché** (bornes déjà fausses : aucune lecture du registre) | **41 904** |
| `isTrusted`, agent inconnu | **29 211** |

(MESURÉ, `forge test --match-contract RegistryBenchTest -vv`.) Le refus d'un inconnu (une ferme) ne coûte plus que 29 k au payeur, au lieu de 115 à 190 k en R5. Un agent qui passe les bornes paie le chemin complet (≈ `assess` avec veto).

---

## Historique R5 (contrat v0, 27/09) — conservé pour comparaison

## Verdict

**Le projet tient pour la démo, avec une marge large. En revanche, l'estimation du CR (~320 gas/arête) est fausse d'un facteur 5 à 13, parce que c'est l'exécution qui domine, pas le calldata.**

| Cas | Taille | Gas facturé | MON à 100 gwei |
|---|---|---|---|
| Support mainnet réel (≤ 5 nœuds), mise à jour | E = 10, k = 1..3 | 133-146 k (MESURÉ) | ≈ 0,014 |
| Démo acte 2, mise à jour | E = 300, n = 100, k = 3 | **840 k** (MESURÉ) | ≈ 0,084 |
| Démo acte 2, premier certificat (nœuds + réserve + certificat) | idem | 2,82 M + 2,21 M + 0,95 M (MESURÉ) | ≈ 0,6, une seule fois |
| Hypothèse R4 : support de 2 000 nœuds, mise à jour | E = 6 000, k = 3 | **14,8 M** (MESURÉ ; R4 estimait 7,6 M) | ≈ 1,5 |

**Taille maximale certifiable dans 30 M gas par transaction** (CALCULÉ par extrapolation linéaire des deux dernières mesures, degré sortant 3) :

| | k = 1 | k = 3 | k = 8 |
|---|---|---|---|
| Mise à jour x→y | ~18 700 arêtes / ~6 200 nœuds | **~12 100 arêtes / ~4 000 nœuds** | ~7 000 arêtes / ~2 350 nœuds |
| Premier certificat 0→x, sans réserve | ~5 100 arêtes | ~3 100 arêtes | ~1 600 arêtes |
| `addNodes` | ~1 040 nouveaux nœuds par tx (28,7 k/nœud) | idem | idem |

Au-delà, le premier déploiement **doit** être découpé : `addNodes` par lots de ≤ 1 000, `reserveCapacity` par lots, puis le certificat. C'est implémenté et mesuré. La mise à jour, elle, casse vers **12 k arêtes à k = 3** : il faudra alors une vérification répartie sur plusieurs transactions (non implémentée). Recertifier **à chaque bloc** reste exclu (CLAUDE.md §6) ; **à chaque changement du graphe**, c'est banal jusqu'à quelques milliers d'arêtes.

## 0. Ce que forge compte vraiment (vérifié, `test/ToolingProbe.t.sol`)

Commande : `forge test --match-contract ToolingProbeTest -vv`

1. **MIP-8 est reproduit** par `network = "monad"`. Mesures (surcoût de la sonde de 8 à 14 gas inclus) : SSTORE 0→x 27 908 / 17 108 ; x→y 10 908 / 108 ; SLOAD 8 114 / 111. Accès de compte froid 10 100 : un `getVersion()` à travers le vrai proxy ERC-1967 coûte 29 485 à froid, 1 490 à chaud (MESURÉ en fork).
2. `network = "monad"` implique **`isolate = true`** : chaque appel **non-view** du test est une transaction à part, et `vm.lastCallGas().gasTotalUsed` **inclut 21 000 + le calldata + le plancher EIP-7623**. Vérifié à l'unité près : `noop(1 000 octets non nuls)` facture 62 130 = 21 000 + 10 × (85 + 4 × 1 007). Toutes les lignes `GAS|` sont en plus recoupées par un comptage octet par octet (`CertLib.calldataCost`).
3. ⚠️ **Les appels `view` depuis un test ne sont PAS isolés** (AM-R5.1) : pas de 21 000, et les pages restent chaudes d'un appel à l'autre (−8 000 par page). Les chiffres « gas » d'un `view` dans forge sont donc faux pour un routeur. Les lectures sont mesurées ici à travers un contrat consommateur non-view (`Consumer` dans `test/Base.t.sol`), en différence avec un appel témoin de même calldata.
4. Plafond mémoire Monad de 8 Mo par transaction (MONAD_NINE) : forge l'applique aussi au test, d'où une configuration par fonction pour E ≥ 3 000. Côté contrat, la mémoire vaut ≈ 32·n·(k+1) + 32·numRows octets : cette limite ne mord qu'au-delà de n·(k+1) ≈ 250 000, bien après la limite de gas.

Formule du gas facturé (EIP-7623, actif sur Monad, 40 gas par octet non nul) :
`facturé = 21 000 + max(4·z + 16·nz + exécution, 10·(z + 4·nz))`. Sur Monad on paie la **gas limit** : la limite à coder = facturé du pire cas + ~7,5 %.

## 1. `submitCertificate` — mesures paramétrées

Commande : `forge test --match-contract GasTest -vv | grep 'GAS|'` (registres = proxys ERC-1967 locaux calés sur le vrai coût de `getVersion()` : 29 297 contre 29 485, test `test_gas_versionProbe`).
Graphe aléatoire : E arêtes réparties sur n nœuds (degré ~3, ancres comprises), destinations distinctes, 85 % de poids positifs, point fixe à 25 itérations, ownerFp non nul pour chaque agent (pire cas réaliste : presque tous les octets de t sont non nuls).
`exec` = facturé − 21 000 − calldata standard. **Le plancher n'est jamais atteint** : la colonne « plancher » montre de combien il reste en dessous.

| E | n | k | octets calldata | plancher 7623 | **premier 0→x** | **mise à jour x→y** | exec de la mise à jour | mise à jour / arête |
|---|---|---|---|---|---|---|---|---|
| 10 | 5 | 1 | 580 | 13 960 | 336 734 | 132 771 | 106 187 | — |
| 10 | 5 | 3 | 612 | 13 200 | 452 047 | 146 096 | 119 816 | — |
| 50 | 17 | 1 | 1 380 | 39 930 | 546 981 | 190 030 | 153 058 | 3 800 |
| 50 | 17 | 3 | 1 604 | 47 660 | 802 646 | 241 683 | 201 619 | 4 830 |
| 50 | 17 | 8 | 2 212 | 66 250 | 1 415 223 | 344 248 | 296 748 | 6 880 |
| 100 | 34 | 1 | 2 468 | 75 860 | 833 157 | 272 194 | 220 850 | 2 720 |
| 100 | 34 | 3 | 2 948 | 91 850 | 1 263 915 | 362 976 | 305 236 | 3 630 |
| 100 | 34 | 8 | 4 228 | 134 380 | 2 313 345 | 562 382 | 487 630 | 5 620 |
| 300 | 100 | 1 | 6 692 | 215 600 | 1 959 804 | 582 853 | 475 613 | 1 940 |
| 300 | 100 | 3 | 8 260 | 263 590 | 3 101 092 | **840 105** | 713 669 | 2 800 |
| 300 | 100 | 8 | 12 164 | 388 280 | 5 852 270 | 1 381 319 | 1 205 007 | 4 600 |
| 1 000 | 334 | 1 | 21 668 | 711 200 | 6 069 949 | 1 684 046 | 1 378 566 | 1 680 |
| 1 000 | 334 | 3 | 26 948 | 877 400 | 9 839 621 | 2 563 682 | 2 191 722 | 2 560 |
| 1 000 | 334 | 8 | 40 228 | 1 268 860 | 18 807 010 | 4 306 011 | 3 777 467 | 4 310 |
| 1 000 | 1 000 | 3 | 64 260 | 1 739 760 | 25 628 597 | 4 214 646 | 3 497 742 | 4 210 |
| 1 000 | 100 | 3 | 13 860 | 412 920 | 3 951 918 | 1 690 919 | 1 504 751 | 1 690 |
| 3 000 | 1 000 | 1 | 64 292 | 2 181 500 | 17 747 665 | 4 895 558 | 4 001 958 | 1 630 |
| 3 000 | 1 000 | 3 | 80 260 | 2 655 700 | 28 794 217 | 7 408 278 | 6 324 998 | 2 470 |
| 3 000 | 1 000 | 8 | 120 164 | 3 861 350 | 55 526 719 ✗ | 12 805 720 | 11 240 180 | 4 270 |
| 4 000 | 2 000 | 2 | 128 260 | 4 177 630 | 44 234 255 ✗ | 10 116 601 | 8 424 549 | 2 530 |
| 6 000 | 2 000 | 3 | 160 260 | 5 316 090 | 57 470 797 ✗ | **14 834 702** | 12 687 266 | 2 470 |
| 10 000 | 3 334 | 1 | 213 668 | 7 264 190 | 58 694 240 ✗ | 16 058 193 | 13 131 517 | 1 610 |
| 10 000 | 3 334 | 3 | 266 948 | 8 863 910 | 95 694 659 ✗ | 24 668 792 | 21 102 228 | 2 470 |

✗ = au-dessus de 30 M : infaisable en une transaction sans découpage.
Pente marginale d'une mise à jour, arête et part de nœud comprises (CALCULÉ entre E = 3 000 et E = 10 000) : **1 595 gas/arête à k = 1, 2 466 à k = 3, ~4 250 à k = 8**.

Variantes du premier certificat (E = 300, n = 100, k = 3, MESURÉ, `test_gas_firstCertVariants`) :

| Étape | Gas facturé |
|---|---|
| `addNodes` de 97 agents | 2 820 044 (29,1 k/nœud : une page de mapping par clé, 27 900) |
| `reserveCapacity(100)` | 2 205 897 (125 slots, 17,5 k/slot = 0→x sur page chaude) |
| certificat après réserve | **953 854** (≈ mise à jour + 13 %) |
| tout-en-un (`newNodes` dans la même tx) | 5 882 836 |
| mise à jour à valeurs identiques | 843 309 (x→x coûte comme x→y) |

## 2. Où part le gas (profil, `test/Profile.t.sol`, E = 1 002, n = 334, mise à jour)

Commande : `forge test --match-contract ProfileTest -vv` (le détail par section vient d'une copie instrumentée dans le scratchpad).

| Poste | k = 1 | k = 3 | k = 8 |
|---|---|---|---|
| `getVersion()` × 2 (proxys) | 49 k | 49 k | 49 k |
| passe de vérification (validation, budgets, dispersion, feuilles, résidu, Merkle) | 1 068 k | 1 784 k | 3 262 k |
| écriture des vecteurs (x→y) | 145 k | 238 k | 456 k |

- Stockage Monad CALCULÉ pour cette mise à jour : slots = ⌈n/4⌉·(k+2) = 252 / 420 / 840 ; pages ≈ slots/128 ; coût SSTORE ≈ pages × 10 900 + slots × 100 = 47 k / 76 k / 152 k. Le reste de la ligne « écriture » est du calcul d'emballage des lanes. **MIP-8 rend bien le stockage marginal** en mise à jour (tour 3 confirmé). Au premier certificat, en revanche, 0→x coûte 17 100 par slot : 125 slots ≈ 2,14 M CALCULÉ, contre 2,26 M MESURÉ (premier − mise à jour).
- **Validation d'une arête ≈ 270 gas, dispersion ≈ 250 + ~130 par colonne supplémentaire, résidu ≈ 230 gas par nœud et par colonne** (micro-mesures ; une boucle calldata vide coûte déjà 65 gas par itération). C'est ce plancher de calcul que le CR n'avait pas compté.
- Première version (logique par ligne en Solidity, une seule grande boucle) : 1,6 à 2,7 fois plus chère. La réécriture en fonctions Yul spécialisées (W = 2/4, k = 1) a fait passer la vérification de 1 719 k à 1 068 k (k = 1) et l'écriture de 385 k à 145 k (AM-R5.4).

## 3. Lectures (fork mainnet, vrais registres, via `Consumer`)

Commande : `forge test --match-contract ForkTest -vv | grep 'READ|\|TX|'`. Coût marginal pour un contrat consommateur : accès froid à ANCRE (10 100) compris, 21 000 et calldata exclus.

| Lecture | k = 1 | k = 2 | k = 3 | k = 8 |
|---|---|---|---|---|
| `assess` sans veto (dont contrôle TRANSFERRED via `ownerOf`) | 76 449 | 77 188 | 77 926 | 81 619 |
| `assess` avec veto, ancres sans avis sur l'agent | 114 551 | 125 320 | 136 088 | 189 931 |
| `assess` #3 avec veto (0xea0b… : 1 avis) | | 140 526 | | |
| `assess` #4 avec veto, **VETOED par le vrai `slash −100`** (2 avis lus, arrêt avant `ownerOf`) | | 117 098 | | |
| `trustOf` (= `assess` avec veto) | | 140 338 | | |
| Transaction `checkRegistry` | | 90 582 facturé | | |
| Transaction `proveOmission`, vrai avis | | 220 541 facturé | | |

Décomposition CALCULÉE d'un `assess` sans veto : compte ANCRE 10 100 + page de l'ensemble 8 100 + page du mapping de nœud 8 100 + page des vecteurs 8 100 + **`ownerOf` à travers le proxy ≈ 36 k** (compte proxy 10 100 + implémentation 10 100 + slot d'implémentation 8 100 + page owner 8 100). **Le veto coûte ~28 k pour la première ancre** (proxy du registre de réputation), **~11 k par ancre supplémentaire** (`getLastIndex`) et **~15 k par avis lu**. Le CR estimait une lecture à ~16 k (ESTIMÉ) ; la mesure est 77 k sans veto et 115 à 190 k avec.

## 4. Comparaison avec le CR

| Poste | CR (ESTIMÉ) | Mesure | Écart |
|---|---|---|---|
| Coût par arête (mise à jour) | ~320 gas/arête, plancher calldata dominant | 1 600 (k = 1) · 2 470 (k = 3) · 4 250 (k = 8) ; **plancher jamais atteint** | ×5 à ×13 |
| Écriture sur place | ~100 gas/slot | 100 gas/slot SSTORE + ~400 de calcul par slot | tient pour le SSTORE |
| Premier certificat | 17 100-27 900 par slot neuf | confirmé ; + **28,7 k par nœud** pour le mapping | le mapping n'était pas compté |
| Lecture `trustOf` | ~16 k | 77 k sans veto, 115-190 k avec | ×5 à ×12 |
| 2 000 nœuds (R4) | 7,6 M | 10,1 M (k = 2) · 14,8 M (k = 3) en mise à jour ; 44-57 M au premier certificat | ×1,3 à ×2 |
| README §4 : « 60-75 k arêtes par tx » | — | ~12 k arêtes à k = 3 | ×5 |

**Conséquence sur une décision du CR (D18, encodage)** : réduire le calldata (u32 → u16, suppression de `feedbackIndex`) ne sert à rien tant que l'exécution domine ; le plancher EIP-7623 reste à 35-40 % du facturé. Le levier est le calcul par arête et par colonne. La décision elle-même n'est pas rouverte, mais son argument de coût ne tient plus.

## 5. Angles morts découverts

| Id | Angle mort | Statut |
|---|---|---|
| AM-R5.1 | Dans forge (`network = "monad"`), les appels `view` d'un test ne sont pas isolés : pas de 21 000, pages chaudes d'un appel à l'autre. Mesurer une lecture directement sous-estime son coût (−8 000 par page). | contourné (`Consumer`) ; à signaler à quiconque mesure une lecture |
| AM-R5.2 | **L'exécution domine, pas le calldata** : le plancher EIP-7623 n'est jamais atteint (au plus 40 % du facturé). L'estimation du CR à ~320 gas/arête est fausse d'un facteur 5 à 13. | mesuré |
| AM-R5.3 | **Premier certificat** : 28,7 k par nouveau nœud (une page de mapping par clé) et 17,1 k par slot de vecteur. Un premier certificat de plus de ~1 000 nœuds (k = 3) ne tient pas en une tx. | `addNodes` et `reserveCapacity` implémentés et mesurés |
| AM-R5.4 | Génération de code via-IR : la première version, avec la logique par ligne en Solidity, était 1,6 à 2,7 fois plus lente (variables déversées en mémoire, `memoryguard(0x340)`). Non bloquant : boucle chaude réécrite en fonctions Yul. Le mode legacy ne compile pas (pile trop profonde). | contourné |
| AM-R5.5 | **Le contrôle TRANSFERRED coûte ~36 k** sur un `assess` de 77 k, parce que `ownerOf` passe par un proxy froid. Le veto ajoute 28 k + 11 k par ancre + 15 k par avis lu. Un routeur x402 paie donc 115 à 190 k par décision de paiement. | mesuré ; option : politique « transfert vérifié hors chaîne » |
| AM-R5.6 | **Veto borné à `MAX_SCAN = 32` avis par couple** (divergence F2 de R4). Cas réel : 0x443cbff0 → #4, 73 avis. Un `slash` plus ancien que les 32 derniers avis de l'ancre sur l'agent est ignoré, ce qui donne un faux OK. | **ouvert** : relever à 128, ou exiger que l'ancre re-publie son veto ; à trancher |
| AM-R5.7 | `addNodes` est sans permission : un attaquant intercale des nœuds inutiles, que chaque certificat doit ensuite réécrire (≈ (k+1)·8 octets + ~100-400 gas par nœud et par certificat, à vie). `nCert` en préfixe ne protège que la fin de la table. | ouvert (table par certificateur ou caution) |
| AM-R5.8 | `ownerFp` est fourni par le certificateur, non vérifié ; `ownerFp = 0` désactive TRANSFERRED. | preuve (iv) en TODO |
| AM-R5.9 | Un registre cassé ou hostile pouvait consommer 63/64 du gas de l'appelant pendant un `assess` « qui ne revert jamais » (sur Monad, on paie la limite). | corrigé : `VIEW_CALL_GAS = 120 000` par appel (test `test_neverRevertsOnBrokenRegistry`) |
| AM-R5.10 | Stockage entrelacé par tranche de 4 nœuds au lieu de « contigu par colonne » (CR) : une page par lecture au lieu de k. | écart assumé, documenté dans ENCODING.md §5 |
| AM-R5.11 | La preuve d'omission ne vérifie ni la règle « ancien owner » de D16 ni la fraîcheur du wallet. Un certificateur honnête qui a écarté l'avis d'un ancien owner peut voir sa borne élargie à tort (élargissement seulement, pas de slashing). | TODO documenté |
| AM-R5.12 | `vectorRoot` est un keccak plat du calldata, pas un Merkle : les preuves lisent t dans le stockage, un arbre n'apporterait rien on-chain. | écart assumé par rapport au CR |

## 6. Questions ouvertes

1. **MAX_SCAN** (AM-R5.6) : 32, 128, ou un veto qui ne lit que le dernier avis de chaque tag via un index hors chaîne contesté ? À mesurer : ~15 k par avis lu, donc 128 avis ≈ 2 M gas dans une vue, ce qui est trop pour un routeur.
2. Faut-il un mode `assess` **sans contrôle TRANSFERRED** (−36 k) pour les routeurs très sollicités, en contrepartie d'un `maxAge` court ?
3. Vérification répartie sur plusieurs transactions pour dépasser ~12 k arêtes (k = 3) : utile pour la norme, pas pour la démo.
4. Réduire le calcul par colonne : sauter les colonnes nulles d'une ligne (déjà fait par ligne entière), ou mettre à jour seulement les colonnes d'ancres dont le graphe a changé.
5. Quel `feedbackIndex` pour une arête de relais (R4 : 0, variante non décidée) ?

## 7. Reproduire

```bash
export PATH="$PATH:$HOME/.foundry/bin"; cd contracts
forge test --match-contract "AnchoredReputationTest|ToolingProbeTest"     # unitaires + sondes d'outillage
forge test --match-contract ForkTest -vv                                  # fork mainnet (RPC https://rpc.monad.xyz)
forge test --match-contract GasTest -vv | grep 'GAS|'                     # tableau §1 (~1 min, local)
forge test --match-contract "AnchoredReputationTest|ForkTest" --gas-report
```

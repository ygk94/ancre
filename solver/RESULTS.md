# R4 — Solveur PPR hors chaîne : résultats (2026-09-27)

Tous les chiffres sont **MESURÉS** par les commandes indiquées, lancées depuis `solver/`, sauf mention **ESTIMÉ**. Sorties complètes : `out/mainnet.md`, `out/synthetic.md`, `vectors/*.json`.

Données : avis relus **on-chain** par `readAllFeedback` au bloc 108 434 518 (script `scratchpad/fetch_readall_r4.py`, sortie `onchain_feedbacks_r4.json`), identité au même bloc (`agents_state.json`, `logs.json`, `approved_r4.json` produit par `scratchpad/fetch_approved_r4.py`). Les 9 188 clés (agent, client, index) sont identiques à celles du snapshot 8004scan du 21/09.

| Commande | Rôle | Durée |
|---|---|---|
| `.venv/bin/python run_mainnet.py` | acte 1 (D19) → `out/mainnet.md` | < 1 s |
| `.venv/bin/python run_mainnet.py --tags` | inventaire des tag1 et couverture du schéma | < 1 s |
| `.venv/bin/python synthetic.py` | α sur graphes à vérité connue → `out/synthetic.md` | ~17 s |
| `.venv/bin/python export.py` | vecteurs de test → `vectors/` | < 1 s |
| `.venv/bin/python -m pytest -q tests` | 95 tests | < 1 s |

## 1. Acte 1 sur le mainnet (`run_mainnet.py`)

Paramètres : α = 1/3, m = 2, λ uniformes, schéma `schema_reference.json`.

**(a) Eve-8004 (#182).**
- getSummary naïf, tous clients : 7 665 avis, **moyenne 1,5264·10^36**, dont 117 valeurs à 1e38 (valeur exacte 10^38 vérifiée par `readFeedback`).
- Région ferme S (#182 ∪ agents contrôlés par un noteur d'Eve) : **7 666 agents**.
- ANCRE avec ancres {0x07305360, 0xf7d5543d} :
  - schéma de référence : masse sur S = **0 exact** ; #182 absent du support ; certificat de 3 nœuds, e = 9 wei.
  - schéma « stress » (tout tag = endorsement, 7 589 arêtes dans le graphe) : masse sur S toujours **0**.
  - La résistance vient donc des ancres, pas du schéma.
- Contrôle : si le lecteur ancre dans la ferme (2 wallets Spawn), t(#182) = 0,222 dans une colonne, mais trustRobust = 0. ANCRE est relatif aux ancres.

**(b) Scanner 0xa06f907f comme ancre.** Il a posté 32 avis (24 `trust`, 8 `liveness`) sur 28 agents, dont 30 vers S.

| Ancres | Sans D15 : masse sur S | Sans D15 : trustRobust max sur S | Avec D15 : masse sur S |
|---|---|---|---|
| {scanner} | 0,3456 | 0 (une seule ancre) | 0 |
| {scanner, 0x0730} | 0,3456 / 0 | 0 | 0 |
| {scanner, scanner 0xc71a15fc} | 0,3456 / 0,3704 | **0,0691 : #182 passe θ = 1e-3** | 0 |

- Borne ((1−α)/α)·Σπ(u)C(u,S) pour la colonne scanner = **0,6221**, pour une masse mesurée de 0,3456. La borne tient ; S absorbe.

**(c) #8317.**
- 78 avis, tous de 0x44985413, qui est son agentWallet (l'owner est 0x656df648). Le garde-fou du registre ne voit pas le wallet.
- Schéma de référence : 0 arête, les 78 avis sont écartés par **D15** (`trade_execution` = measurement).
- Schéma stress : 0 arête, rejet par **D16** (`controleur_agentWallet`, un couple après sélection).

**(d) Chaîne honnête.**
- **0xea0b21fb est owner ET agentWallet de #18, #22 et #23.** Sous D16, c'est donc un nœud-adresse sans masse.
- Résultat : #18 reçoit t = 0,2222 par colonne (trustRobust 0,1111), et **#2, #3, #4 reçoivent 0**. La chaîne à 2 sauts du tour 3 **n'existe pas sous D16**.
- Variante « relais » (non décidée : #18, #22, #23 → nœud-adresse, poids 1), α = 1/3 :
  - #2 et #3 : 0,0494 par colonne (trustRobust 0,0247) ;
  - #4 : méfiance 0,0988 (le slash) ;
  - support de 6 nœuds, e = 18 wei.
- Avec α = 1/4 : 0,0527 ; avec α = 1/2 : 0,0313.

**(e) 0xea0b → #4 (slash −100 à l'index 1, review +1 à l'index 2).**
- Règle du tour 2 : arête +10 000 (le review efface le slash).
- **D14** : arête −10 000 (le slash domine).
- Avec les ancres {0xea0b, 0x0730} : d(#4) = **0,1111** et t(#4) = 0, alors que la règle du tour 2 donnait t = 0,0741.
- Avec les ancres honnêtes seules, d(#4) = 0, puisque 0xea0b n'a pas de masse (cf. (d)).

**Survie des arêtes sur tout le registre (9 188 avis)**, sous D14 + D15 + D16.

| Filtre | Arêtes | Détail |
|---|---|---|
| `core` (vouch, review, slash) | **5** | toutes émises par des nœuds-adresses |
| `reference` (8 tags) | **7** | dont 2 émises par des nœuds-agents (#11 → #1, #122 → #118) qui ne reçoivent aucune arête |
| `execution-market-8` | **1** | 9 couples rejetés comme « ancien owner » |

Aucune arête ne part d'un nœud qui peut recevoir de la masse, sauf si son émetteur est lui-même pris comme ancre.

**Support mainnet selon α** (ancres 0x0730 et 0xf7d5, filtre `reference`) : 3 nœuds pour les trois valeurs de α (6 en variante relais). **α n'a aucun effet mesurable sur le mainnet**, ce qui confirme AM-3.10.

## 2. α sur graphes synthétiques (`synthetic.py`)

**Modèle.**
- N_H = 1 000 honnêtes, avec un degré sortant deg ∈ {2, 5, 10} et des poids de 0,5 à 1.
- 3 ancres, chacune approuvant 5 honnêtes.
- N_S = 1 000 Sybil denses (10 arêtes internes chacun).
- g arêtes d'attaque, aléatoires ou ciblées sur les honnêtes centraux, plus un scénario « ancre compromise ».
- θ = 1e-4 (choix).
- 5 graines par case.

**Le résultat dépend de ce modèle.**

Extrait, deg = 5 :

| Scénario | α | Fuite π(S) | LOO H à θ | H passants au seuil « 1 % des Sybil passent » | Sybil LOO à θ |
|---|---|---|---|---|---|
| aléatoire, g = 10 | 1/4 · 1/3 · 1/2 | 0,0025 · 0,0012 · 0,0003 | 0,775 · 0,521 · 0,087 | 0,990 · 0,990 · 0,990 | 0 · 0 · 0 |
| aléatoire, g = 100 | 1/4 · 1/3 · 1/2 | 0,041 · 0,0245 · 0,0092 | 0,730 · 0,467 · 0,078 | 0,752 · 0,712 · 0,668 | 0,007 · 0,003 · 0 |
| ciblée, g = 10 | 1/4 · 1/3 · 1/2 | 0,085 · 0,066 · 0,037 | 0,717 · 0,435 · 0,071 | 0,640 · 0,546 · 0,437 | 0,010 · 0,009 · 0,002 |
| ancre compromise, g = 10 | 1/4 · 1/3 · 1/2 | 0,127 · 0,112 · 0,084 | 0,679 · 0,399 · 0,068 | 0,981 · 0,974 · 0,951 | 0,001 · 0 · 0 |

**Constats.**
- La fuite décroît avec α. Le **rapport fuite/borne vaut 1,00 dans toutes les cases** : la borne ((1−α)/α)·Σπ(u)c_uS est **atteinte** quand S recycle toute sa masse. Ce n'est pas une borne lâche.
- **À seuil θ fixe, α = 1/2 détruit la couverture honnête sous m = 2** : 1 à 17 % des honnêtes passent (tableau complet).
- **Au point de fonctionnement indépendant de θ** (seuil oracle qui laisse passer 1 % des Sybil), l'ordre est **1/4 ≥ 1/3 ≥ 1/2 dans tous les scénarios**.
- Le leave-one-out tient contre l'ancre compromise : au plus 0,1 % de Sybil passent, contre 5 à 24 % sans LOO.
- **Support** : quasiment tous les nœuds atteignables, pour les trois α (1 996 sur 2 003 à deg = 5). AM-2.10 (« petit α ⇒ support plus grand ») n'est pas visible à la résolution d'1 wei.
- **Lignes nécessaires pour tenir e ≤ θ** : 1 802 à 1 983 sur 1 996 à α = 1/3, deg = 5. La troncature ne fait presque rien gagner (AM-R4.5).
- Certificat entier en mode contract sur un graphe réduit (301 nœuds, 2 264 arêtes) : r = 2 265 wei (= E⁺ + 1) ; e = 6 795 wei à α = 1/3.

## 3. Ce qui confirme ou contredit le CR

| Décision | Verdict | Preuve |
|---|---|---|
| D2 α = 1/3 | **Pas contredite au point de la rouvrir, mais pas soutenue non plus.** Sur ce modèle, α = 1/4 domine 1/3 sur la séparation honnête/Sybil (0,640 contre 0,546 en attaque ciblée), au prix d'une fuite 1,3 à 2,1 fois plus forte et d'un e multiplié par 4/3. α = 1/2 est dominé partout. | §2 |
| D5, D7 | Confirmées : linéarité exacte en p, et borne ‖t−t*‖₁ ≤ e vérifiée contre la solution rationnelle, y compris pour des t arbitraires et avec troncature | tests |
| D8 LOO m = 2 | Confirmée contre une ancre compromise. **Insuffisante contre deux ancres corrélées** (deux scanners) : #182 passe sans D15 | §1 (b) |
| D14 | Confirmée : le slash de #4 survit | §1 (e) |
| D15 | Confirmée et **nécessaire** : c'est la seule règle qui arrête le cas des deux scanners | §1 (b) |
| D16 | Rejet des auto-notations confirmé (#8317). **Contredite sur l'effet démo : elle coupe la seule chaîne honnête** (0xea0b ambigu) et rejette 9 couples d'execution.market (« ancien owner ») | §1 (c)(d) |
| D18 | Quantification implémentée ; identique à `_normalize` de R5 | tests |
| D19 | Acte 1 reproductible en < 1 s. Mais la scène « chaîne honnête » doit être réécrite | §1 |
| Fait CR tour 3 « 100 % des avis ont valueDecimals = 0 » | **Faux** : 24 avis ont 2 décimales on-chain (uptime 20, helpful 2, fast 2). 8004scan les affiche à 0 | `run_mainnet.py` |
| Fait CR « 3 arêtes utiles, une chaîne honnête à 2 sauts » | Faux sous D16 : 0 arête ne part d'un nœud massique ; la chaîne s'arrête à 1 saut | §1 |

## 4. Angles morts découverts

- **AM-R4.1** — D16 casse la seule chaîne honnête : 0xea0b21fb est le wallet de 3 agents (#18, #22, #23), donc un nœud-adresse sans masse. Piste mesurée, non décidée : le « relais » (agent → nœud-wallet, un saut de plus), qui rétablit #2 et #3 à 0,049 et rend le slash de #4 visible (0,099). À trancher au tour 4.
- **AM-R4.2** — 8004scan fausse `valueDecimals` (24 avis). L'indexeur R7 doit lire les events ou `readAllFeedback`, jamais 8004scan. Le fait du CR est à corriger.
- **AM-R4.3** — La règle « ancien owner » de D16 rejette les notes d'une plateforme qui mint puis transfère les agents de ses exécutants (execution.market, 9 couples). C'est un faux négatif. À documenter, ou à restreindre (par exemple aux anciens owners postérieurs au mint).
- **AM-R4.4** — TAGS_MAX = 8 est trop petit : execution.market utilise 9 tag1 pour une même sémantique, et le schéma de référence compte 15 tags endorsement.
- **AM-R4.5** — Avec une borne L1 globale, **e doit être < θ**, ce qui interdit la troncature en pratique : il faut fournir presque tout le support. Coût **ESTIMÉ** pour 2 000 nœuds et 15 000 arêtes (deg = 5) : 15 000 × 8 o + 2 000 × 32 o ≈ 190 ko de calldata, soit ≈ 7,6 M gas au plancher EIP-7623. À mesurer en R5.
- **AM-R4.6** — La fenêtre `MAX_SCAN = 32` du veto R5 masque des tags. Cas réel : 0x443cbff0 → #4, 14 tags sur 26 hors fenêtre. Une ancre active qui poste des mesures peut pousser son propre slash hors de la fenêtre.
- **AM-R4.7** — Un nœud absorbant sans ligne vide est traité comme tronqué. Sur le mainnet, e passe de 9 wei à 0,44 WAD. C'est désormais normatif (FORMAT §3).
- **AM-R4.8** — Le leave-one-out ne protège pas contre des ancres **corrélées** : deux scanners automatiques font passer #182 si D15 est absent. D15 n'est donc pas redondant avec D8.
- **AM-R4.9** — Pour une échelle 0-100 à neutre 50, la dominance du négatif transforme une note de 40/100 en méfiance −0,2. Les échelles non documentées (helpful et fast, 5,00 on-chain) sont classées measurement par défaut.
- **AM-R4.10** — La preuve d'écart (ii) du CR (« feedback valide plus récent ») ne correspond pas à la règle implémentée par R5 (dernier avis, puis rejet s'il est invalide). Aucun cas sur le mainnet, mais le texte est à aligner.

## 5. Questions ouvertes

1. Relais, fusion ou statu quo pour les wallets partagés (AM-R4.1) ? Décision nécessaire avant d'écrire la scène « chaîne honnête ».
2. Passer α à 1/4 ? La mesure le permet, mais le gain est modéré et propre au modèle. Proposition : garder 1/3 pour la démo et noter 1/4 comme candidat.
3. TAGS_MAX à 16 ? Ou des filtres par préfixe (`worker_rating:*`), ce qui obligerait à changer le hash de tag on-chain ?
4. Restreindre la règle « ancien owner » (AM-R4.3) ?
5. R5 : augmenter `MAX_SCAN`, ou lire par tag (`readAllFeedback` filtré) pour le veto ?
6. Le fait « valueDecimals = 0 » du CR et la « chaîne à 2 sauts » sont à corriger dans le CR (non modifié par R4 : hors périmètre).

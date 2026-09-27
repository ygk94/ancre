# Tour 5B — contre-expertise adversariale du tour 4 (D20 à D26)

> 2026-09-27. Rédigé par le même modèle que le tour 4. **Consigne : casser le tour 4, pas le confirmer.**
> À consolider dans `CR-conseil.md` par la session principale. Ce fichier ne modifie pas le CR, ni `solver/`, ni `contracts/`.
> Scripts dans le scratchpad de la session, dossier `tour5B/` (`model.py`, `t1` à `t7`).
> Le modèle entier **importe** `solver/ppr.py::_int_pass`, la passe entière identique au contrat, sans la modifier. La référence exacte est une élimination de Gauss en `Fraction`.
> Commande : `/Users/hugo/Projet/ancre/solver/.venv/bin/python tN_*.py`.

## 0. Vérifications numériques (toutes MESURÉES le 27/09 sur ce modèle)

| # | Test | Résultat |
|---|---|---|
| V1 | Itération de puissance entière depuis 0, arrondi vers le bas. 300 graphes aléatoires (3 à 25 nœuds ; cycles ; nœuds absorbants ; lignes pleines Σq⁺ > GRID ; arêtes négatives ; α ∈ {1/4, 1/3, 1/2}) — `t1_subsolution.py` | **0 violation de t ≤ F_bas(t)**, **0 violation de t ≤ t\*** exact, suite monotone. Point fixe entier atteint en 2 / 26 / 141 itérations (min / médiane / max). Écart ‖t\* − t‖₁ ≤ 83 wei, et au plus **0,667 × la borne** (Σ(y−t) + ops)/α |
| V2 | Troncature d'une **ligne entière** (400 cas) — `t2_omissions.py` | **0 violation** |
| V3 | Omission d'une arête positive **sans dilution** (106 cas) | **0 violation** |
| V4 | Omission d'une arête positive **avec dilution** de B⁺ (294 cas) | **164 violations (56 %)** |
| V5 | **Arête fabriquée** ancre → nœud (400 cas) | **341 violations** |
| V6 | **Poids gonflé** sur une arête existante (147 cas) | **88 violations** |
| V7 | Contre-exemple de dilution (AM-4.4). Ancre 0 → {1 : +1, 2 : +1}, arête vers 2 omise, α = 1/3 | Nœud 1 : **t publié 0,2222 contre t\* vrai 0,1111**. Violation d'un facteur 2 |
| V8 | Monotonie de « somme privée des m−1 plus grandes » (`ppr.trust_robust`), 200 000 paires — `t3_loo.py` | **0 violation** |
| V9 | Leave-one-out sur colonnes-sous-solutions, 150 graphes, m ∈ {1, 2, 3}, 4 461 cas | **0 cas où la borne inférieure dépasse la vraie valeur** |
| V10 | Les vecteurs R4 existants (`solver/vectors/*.json`) sont-ils des sous-solutions ? — `t4_convergence.py` | 7 sur 8 oui. **`toy_alpha_1_3.json` : 1 composante t > y (1 wei)**. Le `certify` de R4, qui arrondit un flottant puis raffine, **ne produit pas toujours une sous-solution** |
| V11 | Convergence depuis 0, mainnet (vecteurs `mainnet_*`) | Point fixe entier en **3 à 5 itérations** |
| V12 | Convergence, graphe de démo (100 nœuds, 300 arêtes, 3 colonnes) | Point fixe entier en 92-96 itérations (α = 1/4), 79-82 (α = 1/3) et 48-49 (α = 1/2). ‖y − t‖₁ ≤ 1e6 wei à 62 / 54 / 33 itérations |
| V13 | **Veto certifié omis**, vecteur réel `mainnet_slash_anchor` (0xea0b → #4 : slash −1) — `t5_veto_fab.py` | Le certificat **sans l'arête négative** est une sous-solution valide. d(#4) passe de 0,1111 à 0, et **eUp = [3, 3] wei, identique à l'honnête** : la règle de remplacement « eNew ≤ eCur » **l'accepte**. Même résultat avec la ligne d'ancre absente |
| V14 | **Certificat fabriqué**, même vecteur : arête 0x0730 → #4 (+1) inventée | Sous-solution valide. **t(#4) = 0,1111 contre t\* vrai = 0**, avec **eUp = [3, 3], identique**. Le certificat remplacerait l'honnête |
| V15 | Code R5, `submitCertificate` (`contracts/src/AnchoredReputation.sol` l. 323-373) | **Aucune lecture du registre par arête à la soumission** : seul `_versionHash()` est appelé. La soumission est ouverte à tous |
| V16 | Réparation locale d'une sous-solution après révocation (« push négatif » : abaisser tout nœud tel que t_v > y_v), 20 graphes de démo — `t6_incremental_copyrow.py` | Toujours valide et ≤ t\*, mais **93 nœuds sur 100 touchés (médiane)** et **0 à 14 % de masse perdue** par rapport à un recalcul complet |
| V17 | Réparation avec marge (t publié = t·(1−ε)), ε ∈ {0,1 %, 1 %, 5 %} — `t7_slack.py` | Encore 92 à 94 nœuds touchés, et la marge coûte ε de masse. **La réparation incrémentale n'est pas locale** sur un graphe connexe |
| V18 | Copie de ligne (D20). Un wallet W porte M agents approuvés par une ancre, et W note un Sybil | Masse du Sybil = **0,1481 pour M = 1, 3, 10 et 100**, soit (1−α)·Σ masse des agents de W (0,2222). Borne ((1−α)/α)·Σπ(u)c_us = 0,4444, **respectée**. Même résultat avec 3 ancres : 1 agent ou 3 agents de W donnent 0,1481 par colonne |

**Lecture.**
- La mathématique de D26 est **juste** (V1, V2, V3, V8, V9).
- Mais **l'affirmation du tour 4, « borne inférieure exacte pour le vrai graphe », est fausse telle qu'écrite.** Elle ne vaut que si le graphe engagé est **dominé** par le vrai graphe, c'est-à-dire C_engagé ≤ C_vrai entrée par entrée. Trois opérations cassent cette domination : la dilution (V4), la fabrication (V5) et le gonflement (V6).
- Or R5 ne vérifie **aucune** arête à la soumission (V15), et la soumission est ouverte à tous (D23). **N'importe qui peut remplacer le certificat honnête par un faux de même précision** (V13, V14). Ce défaut existait avant D26, puisque le mode résidu du tour 2 avait le même trou. Mais D26 l'aggrave dans le texte, en promettant l'exactitude.

## Reformulation

Q1 est mal posée si on la lit « la preuve de D26 est-elle juste ? ». Elle l'est. La vraie question est : **qu'est-ce qui garantit que le graphe engagé est dominé par le registre, au moment où quelqu'un paie ?** Q3 (veto) en dépend directement. La fenêtre « slash puis +1 » n'est pas un cas marginal : c'est **exactement** la seule arête négative utile du mainnet (0xea0b → #4, slash à l'index 1 puis review à l'index 2).

## Phase 1 — Analyses indépendantes

### A. Théoricien
- **Q1.** Lemme : F monotone et contractant, et C' ≤ C entrée par entrée, entraînent F'(x) ≤ F(x) pour x ≥ 0. Donc t ≤ F'(t) implique t ≤ t\*. C'est tout, et c'est juste (V1-V3). La normalisation par budget B⁺ = max(1, Σw⁺) **fait dépendre chaque entrée de la ligne entière** : omettre une arête *augmente* les autres (V7). Il faut donc engager le **dénominateur déclaré** B⁺_u, supérieur ou égal à la somme engagée et censé égaler la vraie somme. On peut alors omettre des arêtes d'une ligne sans rien gonfler. Une sous-déclaration de B⁺ devient une faute prouvable, de type diminution.
- **Q2.** V18 : la copie de ligne n'amplifie rien, la masse sortante vaut Σ t_j des agents de W. La borne Sybil tient, en comptant chaque copie comme une arête d'attaque pondérée par la masse de son agent. Le seul effet nouveau est qu'**une clé contrôle la sortie de M nœuds**.
- **Q4.** V16 et V17 : sur un graphe fortement connexe, une diminution se propage partout d'au moins 1 wei, et une sous-solution exacte oblige à toucher chaque nœud. Une réparation « locale » n'existe pas sans relâcher l'exactitude.
- **Q5.** Il y a cinq lemmes à écrire, voir D-B6. Tous sont élémentaires.

### B. Ingénieur EVM
- **Q1.** Vérifier chaque arête à la soumission coûte, ESTIMÉ à partir des composantes mesurées par R5 (`getLastIndex` ≈ 11 k, lecture d'avis ≈ 15 k, `ownerOf` ≈ 36 k) :
  - ≈ 26 k par arête ;
  - ≈ 50 k par cible (contrôleurs) et par ligne copiée (wallet).
  - Pour la démo (300 arêtes, 100 nœuds) : 300 × 26 k + 100 × 50 k + 840 k ≈ **13,6 M gas**, soit ≈ 1,4 MON à 100 gwei. Ça tient dans 30 M jusqu'à environ 600-900 arêtes.
  - Une arête trop chère à vérifier (noteur avec beaucoup d'avis sur la cible) **peut simplement être omise** : c'est sans risque côté confiance, à condition de déclarer B⁺.
- **Q3.** Le veto en direct (dernier avis) est infalsifiable par un certificateur, parce qu'il est lu dans le registre. Le bit certifié, lui, est falsifiable par omission (V13). La source de vérité du veto doit être le registre, et le bit ne peut être qu'un complément.
- **Q3 bis.** Mode strict pour `TRANSFERRED` : 36 k (MESURÉ). Avec le cache de décision du router sur W blocs, ce coût s'amortit sur tous les paiements de la fenêtre.
- **Q1 ter.** Le contrat R5 vérifie |t − y| et non t ≤ y. D26 exige de changer ce test, et `certify` (R4) doit passer à l'itération depuis 0 (V10).

### C. Concepteur de normes
- **Q1.** Le niveau « Residual-verified » ment depuis le tour 2 : il ne vérifie aucune arête. La norme doit distinguer deux niveaux :
  - **Registry-verified** : chaque arête engagée est relue dans le registre à la soumission, et la soumission est ouverte à tous ;
  - **Submitter-attested** : la liste des soumetteurs autorisés est engagée dans le `setId`, et les preuves d'écart servent de responsabilité.

  La soumission ouverte à tous n'est permise qu'au premier niveau.
- **Q3.** Il faut une règle de norme pour les ancres : « le veto d'une ancre est son **dernier** avis sur l'agent ». C'est simple et lisible. D14 (dominance du négatif) reste la règle du graphe, pour la méfiance.
- **Q5.** Il faut mettre le lemme et sa preuve dans Rationale, avec des vecteurs de test pour chacun des trois cas de violation (V4 à V6).

### D. Attaquant
- **Q1.** Aujourd'hui, je n'ai même pas besoin d'une clé d'ancre. Je soumets un certificat qui invente une arête ancre → mon Sybil (V14). Sa précision est égale à celle du certificat honnête, donc il le remplace. Je suis payé jusqu'à ce que quelqu'un prouve la fabrication, et **la preuve de fabrication n'existe pas dans R5** (seule l'omission (i) est codée).
- **Q3.** Je veux lever le veto sur le fournisseur 0xea0b → #4 : je republie le certificat sans l'arête négative (V13). Le veto en direct ne voit que le dernier avis de l'ancre, qui est un +1. Personne ne me voit.
- **Q2.** Pour la copie de ligne, je dois contrôler W. Or `setAgentWallet` exige l'owner de l'agent et la signature de W (vérifié au tour 3). Je ne peux pas capturer les agents des autres. Pas d'attaque nouvelle.
- **Q4.** Le levier ×4 du griefing (220 k contre 840 k) reste, et la réparation incrémentale ne le réduit pas (V16).
- **Q3 bis.** En mode rapide, j'achète un agent réputé et je me fais payer avant la preuve. En mode strict avec cache, ma fenêtre dure W blocs : je préfère le mode rapide.

### E. Intégrateur
- **Q1.** Je n'intègre pas un score que n'importe qui peut remplacer par un faux sans rien dépenser. Il me faut Registry-verified, ou au minimum une liste de soumetteurs que je choisis.
- **Q3.** Le disjoncteur doit être infalsifiable. Le dernier avis d'ancre lu dans le registre me va, à condition que les ancres sachent qu'elles ne doivent rien poster après un veto.
- **Q4.** Qu'on recertifie complètement, peu importe, tant que le robot est financé. Je veux un « budget d'élargissement » dans la politique : au-delà, recertification forcée.
- **Q5.** Pour moi, les tests comptent plus que les preuves formelles : un harnais de fuzz dans la CI.

## Phase 2 — Relecture croisée à l'aveugle

Ordre anonyme : 1 = E, 2 = A, 3 = D, 4 = C, 5 = B.

- **A relit D (3)** : juste, et plus grave que ce que le tour 4 a vu. *Oubli* : la même fabrication marchait avec le certificat résiduel du tour 2 ; D26 n'a rien créé. Ne pas en conclure qu'il faut abandonner D26.
- **A relit B (5)** : B⁺ déclaré, oui, mais une sous-déclaration n'est détectée que si une preuve (i) montre **une** arête omise qui fait dépasser la somme. Il faut autoriser la preuve (i) à faire exactement ça.
- **B relit C (4)** : Registry-verified à ~13,6 M estimés, c'est **la moitié d'une transaction** pour la démo. Tant qu'on ne l'a pas mesuré, on ne l'annonce pas.
- **B relit A (2)** : le lemme est juste. *Faux* : « tout est élémentaire ». Les arrondis de `_int_pass` (arrondi vers le haut pour la méfiance, vers le bas pour la confiance) sont une deuxième source de bugs, qui exige un test différentiel entre Python et Solidity.
- **C relit E (1)** : le « budget d'élargissement » est de la politique, et il faut l'engager dans le `setId`.
- **C relit D (3)** : *vu* le veto 0xea0b → #4. *Oubli* : si le veto ne tient qu'au dernier avis, la scène 5 de la démo (« le +1 n'efface pas le slash ») devient **fausse pour le veto**. Il faut la réécrire.
- **D relit B (5)** : « omettre les arêtes chères » me donne un levier : je poste mille avis sur la cible pour que mon arête *honnête* soit omise… ce qui ne fait que me retirer de la masse. Pas d'attaque.
- **D relit E (1)** : la liste de soumetteurs revient à faire confiance à un opérateur. C'est acceptable seulement si ce n'est pas présenté comme « sans confiance ».
- **E relit A (2)** : l'absence de réparation locale, c'est un vrai résultat négatif. Il faut le dire, pas l'enterrer.
- **E relit C (4)** : deux niveaux de norme, d'accord. La démo doit montrer le plus fort.

## Phase 3 — Décisions

### D-B1 — D26 est confirmé comme mathématique, et **amendé** comme garantie *(Q1)*

**Décision.**
1. On reformule D26 : « t ≤ F_engagé(t) entraîne t ≤ t\*_vrai **si et seulement si** C_engagé ≤ C_vrai entrée par entrée ». Le tour 4 disait « pour le vrai graphe » sans condition, ce qui est faux (V4 à V7).
2. **B⁺ est déclaré par ligne**, supérieur ou égal à la somme engagée, et représente la vraie somme. Des arêtes positives peuvent alors être omises dans une ligne. Une sous-déclaration est une faute de type diminution, prouvable par (i).
3. **Niveau Registry-verified** : `submitCertificate` relit **chaque arête engagée** dans le registre. Il vérifie :
   - `readFeedback(j, c, idx)` : existe, non révoqué, tag dans le filtre, poids recalculé on-chain par `_normalize` ;
   - que idx est bien le dernier avis de ce tag : `getLastIndex == idx`, ou lecture des index intermédiaires, à la charge du soumetteur ;
   - que le wallet de la ligne correspond (`getAgentWallet`) ;
   - que c n'est pas un contrôleur actuel de j.

   **La soumission ouverte à tous (D23) n'est permise qu'à ce niveau.**
4. **Niveau Submitter-attested** : une liste de soumetteurs est engagée dans le `setId`, et les preuves d'écart restent actives. C'est le repli si Registry-verified dépasse le budget de gas.
5. Contrat : `t ≤ y` remplace `|t − y|`. Solveur : itération depuis 0 obligatoire (V10).
6. Il faut ajouter une preuve **(v) FABRICATION / GONFLEMENT**, qui manque dans R5 et dans le tour 4 (arête engagée sans avis correspondant, ou poids supérieur). Elle est de type diminution. Au niveau Registry-verified, elle devient inutile.

**Argument décisif.** V14 : un certificat faux et exactement aussi précis remplace aujourd'hui le vrai.

**Ce qu'on perd.** Environ 13,6 M gas (ESTIMÉ, à mesurer par le chantier 02) par certificat de démo au lieu de 0,84 M ; au plus ~600-900 arêtes par transaction.

**Confiance.** 0,8.

### D-B2 — Veto : le registre fait foi, le bit est un complément *(Q3, amende D21)*

**Décision.**
- `vetoed = dernierAvisDirect(ancre) ∨ bitCertifié`.
- **La norme dit que seul le premier est garanti.** Le bit certifié est explicitement « best effort » (falsifiable par omission, V13), sauf au niveau Registry-verified, où il reste falsifiable quand même, faute d'index par client.
- **Règle normative pour les ancres** : « le veto d'une ancre sur un agent est son dernier avis sur cet agent. Une ancre qui publie autre chose ensuite doit republier le veto. » Le tag réservé `veto` est RECOMMENDED (kind endorsement, max = neutre = 0) pour la lisibilité, mais n'est pas nécessaire.
- **Démo** : la scène 5 est réécrite. Le +1 est posté par **un autre noteur**, pour montrer que la méfiance certifiée persiste (D14) ; le veto de l'ancre, lui, reste son dernier avis.
- **Mainnet** : le seul cas réel (0xea0b → #4) est un slash puis un +1 posté par la même adresse. Le veto en direct ne le voit pas ; seule la méfiance certifiée le voit. Il faut le dire dans l'acte 1.

**Argument décisif.** Un disjoncteur que le certificateur peut désarmer n'est pas un disjoncteur.

**Ce qu'on perd.** La sémantique « un slash n'est jamais effacé par un +1 de la même ancre », côté veto.

**Confiance.** 0,75.

### D-B3 — D20 (copie de ligne) confirmé *(Q2)*

**Décision.**
- On garde D20.
- MESURÉ (V18) : aucune amplification. La masse sortante vaut (1−α)·Σ t_j, indépendante de M, et la borne Sybil est respectée.
- La concentration par clé est documentée en Security Considerations : compromettre W, c'est compromettre la sortie de A(W).
- Registry-verified vérifie le wallet par ligne copiée.
- La preuve (iv) porte sur la copie : si le wallet de j change, la copie disparaît (diminution) et une nouvelle copie apparaît (sans effet).

**Confiance.** 0,75.

### D-B4 — `TRANSFERRED` : mode **strict** par défaut *(Q3, amende D25)*

**Décision.**
- `ownerOf` en direct par défaut.
- Le cache de décision du router sur W blocs amortit les 36 k (MESURÉ).
- Le mode rapide (indicateur posé par preuve) est optionnel, engagé dans la politique.

**Argument décisif.** En mode rapide, la fenêtre dure le temps que le surveillant réagisse. En mode strict avec cache, elle dure au plus W blocs, choisis par l'intégrateur.

**Confiance.** 0,6.

### D-B5 — Pas de recertification incrémentale ; budget d'élargissement *(Q4, complète D22)*

**Décision.**
- La recertification reste complète (V16, V17 : réparation non locale, avec perte de masse).
- La politique engage un **budget d'élargissement** eLow_max. Au-delà, le statut passe à `STALE` jusqu'à recertification.
- Le levier ×4 du griefing est accepté en v1 et documenté.
- La recertification est financée par le propriétaire de l'ensemble.

**Confiance.** 0,6.

### D-B6 — Plan de vérification *(Q5)*

**À prouver** (preuve écrite en Rationale, une page) :
- **L1** : F_bas est monotone.
- **L2** : C' ≤ C et t ≤ F'(t) entraînent t ≤ t\*.
- **L3** : l'itération depuis 0 avec F_bas termine sur une sous-solution entière.
- **L4** : la somme privée des m−1 plus grandes est monotone.
- **L5** : d\* ≤ d(t) + (1−α)·eUp, et eUp majore ‖t\* − t‖₁ (arrondis compris).

**À tester :**
- promouvoir `tour5B/t1-t3` dans `solver/tests` (fuzz Python contre des fractions exactes) ;
- test **différentiel** Foundry : `CertLib` / contrat contre les vecteurs Python ;
- un vecteur de test normatif pour chaque violation (V4 dilution, V5 fabrication, V6 gonflement, V13 omission du veto).

**Pas de Lean ni de Coq avant le 13/10** : le rapport coût / bénéfice est mauvais.

**Coût** : environ 1 à 1,5 jour (ESTIMÉ).

## Désaccords non résolus

1. **Registry-verified ou Submitter-attested pour la démo.** B attend la mesure (~13,6 M estimés). E et D exigent Registry-verified. C accepte les deux s'ils sont nommés honnêtement.
2. **La sémantique du veto** (dernier avis) contredit D14 (dominance) pour une même ancre. C et B l'acceptent ; A juge que deux règles pour un même avis prêtent à confusion.
3. **Mode strict ou rapide** : D préfère le strict, E le rapide pour les micropaiements, même avec le cache.
4. **Qui fixe eLow_max**, et comment le calibrer sans données réelles.

## Ce que vous auriez dû me demander

1. **Pourquoi un certificat a-t-il pu être accepté depuis le tour 2 sans qu'une seule arête soit relue dans le registre ?** Le nom « Residual-verified » a masqué la question pendant trois tours.
2. **Faut-il vraiment une soumission ouverte à tous pour la démo ?** Si non, Submitter-attested suffit et coûte 16 fois moins cher (0,84 M contre ~13,6 M ESTIMÉ).
3. **Qui surveille et prouve, pendant la période de jugement du 13 au 27/10 ?** Sans surveillant, les preuves d'écart ne protègent rien.

## Angles morts découverts (AM-5B)

| Id | Angle mort | Statut |
|---|---|---|
| AM-5B.1 | **Un certificat fabriqué, de même précision, remplace le certificat honnête** (V14, eUp identique). `submitCertificate` ne relit aucune arête (V15). Le défaut existe depuis le tour 2 ; D26 l'aggrave dans le texte | D-B1 |
| AM-5B.2 | **Le bit de veto certifié est désarmable par omission** (V13). Et la seule arête négative utile du mainnet est exactement le cas que le veto en direct ne voit pas | D-B2 |
| AM-5B.3 | La dilution n'est pas un cas limite : **56 %** des omissions avec dilution violent t ≤ t\* (V4). Violation d'un facteur 2 dans le contre-exemple minimal (V7) | D-B1 (B⁺ déclaré) |
| AM-5B.4 | Le `certify` de R4 ne produit pas toujours une sous-solution (V10, 1 wei) : avec D26, le contrat rejetterait un certificat honnête | D-B1 |
| AM-5B.5 | Réparation incrémentale non locale : 93 % des nœuds touchés, jusqu'à 14 % de masse perdue (V16, V17) | D-B5 |
| AM-5B.6 | La preuve (v) FABRICATION / GONFLEMENT n'existe ni dans R5 ni dans le tour 4 | D-B1 |
| AM-5B.7 | La phrase du tour 4 « lignes tronquées ou omises ne peuvent que l'augmenter » n'est vraie que pour des **lignes entières** (ou avec B⁺ déclaré) | D-B1 |
| AM-5B.8 | Un vecteur nul est une sous-solution valide. Après `registryChanged` ou maxAge, n'importe qui peut publier t = 0 et tout le monde tombe en échec fermé, jusqu'à ce qu'un vrai certificat (eUp plus petit) le remplace | noté (fenêtre de déni de service) |
| AM-5B.9 | La borne eUp est confortable : écart réel ≤ 2/3 de la borne (V1), et point fixe entier atteint en un nombre fini d'itérations (V1, V11, V12) | confirmé |

## Résumé (15 lignes)

1. **D26 tient mathématiquement** : 0 violation sur 300 graphes, leave-one-out valide sur 4 461 cas, monotonie vérifiée sur 200 000 paires (MESURÉ).
2. **Mais sa garantie est fausse telle qu'écrite au tour 4.** Elle ne vaut que si le graphe engagé est dominé par le vrai (C_engagé ≤ C_vrai).
3. La dilution casse cette domination dans 56 % des cas d'omission concernés, la fabrication et le gonflement la cassent presque toujours (MESURÉ).
4. **Faille critique** : R5 ne relit aucune arête à la soumission, qui est ouverte à tous. Un certificat faux et aussi précis que le vrai le remplace (MESURÉ sur le vecteur mainnet 0xea0b → #4).
5. Même trou pour le veto : l'omission de l'arête négative désarme le bit certifié, et le seul négatif réel du mainnet est invisible au veto en direct.
6. D-B1 : B⁺ déclaré par ligne ; niveau Registry-verified (chaque arête relue, ~13,6 M gas ESTIMÉ pour la démo) ou Submitter-attested ; ajout d'une preuve (v).
7. D-B1 aussi : le contrat doit tester t ≤ y, et le solveur doit itérer depuis 0 (un vecteur R4 viole de 1 wei).
8. D-B2 : le veto fait foi par le dernier avis lu dans le registre ; le bit certifié n'est qu'un complément ; règle normative pour les ancres ; scène 5 réécrite.
9. D-B3 : la copie de ligne (D20) est confirmée, sans amplification (masse du Sybil constante de M = 1 à 100, MESURÉ).
10. D-B4 : `TRANSFERRED` en mode strict par défaut, avec le cache du router.
11. D-B5 : pas de recertification incrémentale (93 % des nœuds touchés, MESURÉ) ; budget d'élargissement engagé dans la politique.
12. D-B6 : cinq lemmes écrits, fuzz et test différentiel, 1 à 1,5 jour, pas de Lean avant le 13/10.
13. Convergence : 3 à 5 itérations sur le mainnet, 79 à 82 sur le graphe de démo à α = 1/3 (MESURÉ).
14. Désaccord principal : payer ~13,6 M (à mesurer) pour une démo sans confiance, ou assumer une liste de soumetteurs.
15. **Verdict : D26 tient comme lemme. Il ne tient comme garantie qu'avec D-B1.** Sans D-B1, ANCRE est falsifiable aujourd'hui, avec ou sans D26.

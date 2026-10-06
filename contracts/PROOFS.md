# PROOFS — lemmes L1 à L5 (D37) et garanties du contrat v1

> Chantier 02, 2026-09-28. Texte destiné au Rationale de l'ERC (chantier 08, `docs/erc/anchored-reputation.md`), en français ici ; les notations sont celles d'ENCODING.md §4.
> Statut : **preuves écrites à la main, non vérifiées formellement** (D37 : pas de Lean avant le 13/10). Chaque lemme est accompagné du test qui l'exerce.

## Notations

- Une colonne a (ancre a). α = αN/αD, om = αD − αN. Tous les vecteurs sont en WAD, ≥ 0.
- Ligne u : poids w_uv ∈ [−10 000, 10 000] \ {0}. Budget positif B⁺_u = max(10 000, sPlus_u), sPlus_u = vraie somme positive déclarée, sinon S⁺_u engagée (format v1 unifié du 01/10) ; C_uv = w_uv / B⁺_u pour w_uv > 0, donc Σ_v C_uv ≤ 1 (ligne sous-stochastique ; la masse restante est absorbée, D5).
- F exact : F(x)_v = α·[v = a]·WAD + (1 − α)·Σ_u x_u·C_uv.
- F_bas (le contrat) : même formule, chaque terme arrondi vers le bas : F_bas(x)_v = [v = a]·⌊αN·WAD/αD⌋ + Σ_u ⌊x_u·om·w_uv / (αD·B⁺_u)⌋. Donc F_bas ≤ F.
- t* = point fixe de F (unique : F est contractante de facteur 1 − α en norme L1 sur les vecteurs positifs).
- Domination : C' ≤ C entrée par entrée (C' = graphe engagé, C = vrai graphe du registre).

## L1 — F et F_bas sont monotones

**Énoncé.** x ≤ x' (coordonnée par coordonnée) ⇒ F(x) ≤ F(x') et F_bas(x) ≤ F_bas(x').
**Preuve.** Chaque terme x_u·C_uv a un coefficient C_uv ≥ 0 (seules les arêtes positives entrent dans F) ; ⌊·⌋ est croissante. ∎
**Test.** `test/Diff.t.sol` (itération depuis 0 croissante), fuzz Python du tour 5B (V1, 300 graphes).

## L2 — une sous-solution est une borne inférieure

**Énoncé.** Si C' ≤ C et t ≤ F'_bas(t) (F' construit sur C'), alors t ≤ t*, où t* est le point fixe de F sur C.
**Preuve.** F'_bas ≤ F' ≤ F (arrondi vers le bas, puis domination et L1). Donc t ≤ F(t). Par L1 et récurrence, t ≤ F(t) ≤ F²(t) ≤ … ; la suite Fⁿ(t) est croissante et converge vers t* (contraction). Donc t ≤ t*. ∎
**Ce que le contrat vérifie.** t ≤ F'_bas(t) pour chaque nœud et chaque colonne (`NotSubSolution`). La domination C' ≤ C n'est **pas** vérifiable en entier (voir « Garanties » ci-dessous).
**Test.** `test/Diff.t.sol` (48 cas : t ≤ ⌊t*⌋ exact, en fractions), `test_notSubSolutionRejected`.

## L3 — l'itération depuis 0 termine sur une sous-solution entière

**Énoncé.** La suite t⁰ = 0, t^{n+1} = F_bas(tⁿ) est croissante, entière, bornée, et **chaque itéré** est une sous-solution : t^{n+1} ≤ F_bas(t^{n+1}).
**Preuve.** t⁰ = 0 ≤ F_bas(0) = t¹. Si tⁿ ≤ t^{n+1}, alors par L1 t^{n+1} = F_bas(tⁿ) ≤ F_bas(t^{n+1}) = t^{n+2}. La suite est croissante, bornée par t* (L2 avec C' = C), à valeurs entières : elle est stationnaire en un nombre fini de pas. Et t^{n+1} ≤ t^{n+2} = F_bas(t^{n+1}). ∎
**Conséquence normative.** Le solveur DOIT itérer depuis 0 (un point fixe flottant arrondi peut violer t ≤ y d'un wei, V10) ; il PEUT s'arrêter à n'importe quel itéré, au prix d'un eUp plus grand.
**Test.** `test_solverMatchesContract`, `test/Diff.t.sol` (itérés de 3 à 120 pas).

## L4 — le leave-one-out préserve la borne inférieure

**Énoncé.** Soit g(c) = Σ_a c_a − (somme des m − 1 plus grands c_a). g est croissante en chaque c_a. Donc c ≤ c* ⇒ g(c) ≤ g(c*).
**Preuve.** Augmenter une coordonnée c_a de δ ≥ 0 : si c_a reste hors des m − 1 plus grands, g augmente de δ ; sinon la somme retirée augmente d'au plus δ et le total de δ, donc g ne baisse pas. ∎
**Arrondi.** Le contrat utilise c_a = ⌊λ_a·t^(a)/WAD⌋ ≤ λ_a·t*^(a)/WAD.
**Test.** `test_leaveOneOut` ; fuzz Python du tour 5B (V8 : 200 000 paires, V9 : 4 461 cas).

## L5 — borne supérieure et méfiance

**Énoncé.** Avec r_a = Σ_v (y_v − t_v) + E⁺ + 1 + Σ_{v sans ligne} ⌈(1−α)t_v⌉ + Σ_{u à sPlus déclaré} ⌈(1−α)t_u(sPlus_u − S⁺_u)/B⁺_u⌉ et eUp_a = ⌈r_a/α⌉ :
(a) ‖t* − t‖₁ ≤ eUp_a pour le point fixe du graphe engagé, et pour le vrai graphe si les seules différences sont des lignes tronquées ou des arêtes positives omises sous un sPlus déclaré exact ;
(b) d*_j ≤ d_j + (1 − α)·Σ_a λ_a·eUp_a/WAD ≤ d_j + eEff (le contrat utilise la seconde forme, plus large).
**Preuve.** (a) F(t) − t ≥ 0 (L2) et F(t) − t ≤ (y − t) + (erreurs de plancher : < 1 wei par terme positif et par colonne, et < 1 pour le terme α) + (masse des lignes absentes du graphe engagé, au plus (1 − α)t_u chacune) + (masse omise d'une ligne à sPlus déclaré : les entrées omises valent w/B⁺ avec B⁺ = max(10 000, sPlus) = le vrai budget, donc au plus (1 − α)t_u(sPlus − S⁺)/B⁺). Donc ‖F(t) − t‖₁ ≤ r_a. Or t* − t = Σ_{n≥0} ((1 − α)Cᵀ)ⁿ (F(t) − t), vecteurs positifs, et ‖(1 − α)Cᵀx‖₁ ≤ (1 − α)‖x‖₁ pour x ≥ 0 : ‖t* − t‖₁ ≤ r_a/α. (b) d est linéaire en T = Σ λ_a t^(a) avec des coefficients (1 − α)|w|/B⁻ ≤ 1 − α par ligne, arrondis vers le haut. ∎
**Test.** `test/Diff.t.sol` (⌈Σ(t* − t)⌉ ≤ eUp, 48 cas), `test_truncationMargin`, `test_declaredBudgetOmissionIsSafe`.

## L6 — les preuves d'écart restaurent les bornes (chantier 02, **réécrit en 02-bis le 06/10, R3**)

**Énoncé.** Soit une ligne u, engagée C⁰ (budget B0 = max(GRID, dEff), dEff = sPlus déclaré sinon S0), dont l'état vrai C diffère de C⁰ par la liste d'amendements prouvés, plus des arêtes omises non révélées. Avec dim, incP, incN calculés par ENCODING.md §7.1 sur la liste après la preuve : ‖(C⁰ − C)⁺‖₁ ≤ dim (côté positif) et ‖(C − C⁰)⁺‖₁ ≤ incP (positif, masse omise comprise) et ≤ incN (négatif). Donc, une fois tout écart prouvé, ‖(t − t*_A)⁺‖₁ ≤ eLow_a et ‖t*_A − t‖₁ ≤ eUp_a.
**Preuve (esquisse).**
1. *Somme vraie.* La vraie somme positive X_vrai vaut Scur + U, où U est la masse omise non révélée. Sous un sPlus honnête, une arête non engagée révélée est soit dans la somme déclarée, soit nouvelle : X_vrai ≤ X = max(dEff − cOut + cIn, Scur), l'hypothèse « dans la somme tant qu'elle y tient » étant documentée en AM-02bis.4.
2. *Monotonie en X.* Posons z = 1/max(GRID, X).
   - Le déficit Σ(c_i − a_i z)⁺ croît quand z décroît.
   - Pour X ≥ GRID, l'excès vaut Σ(a_i z − c_i)⁺ + U z = 1 − S0/B0 + déficit(z) (calcul direct, avec U = X − Scur). Il croît donc aussi avec X.
   - Sous GRID, le budget est constant et l'excès croît avec U.
   - Les deux bornes sont donc maximales en X, et valent pour toute somme vraie dans [Scur, X].
3. *Contrat.* On mesure directement l'écart à la ligne engagée (pas de somme d'écarts successifs). F_vrai(t) − F_engagé(t) = (1 − α)Σ_u t_u (C_u − C⁰_u), puis on applique L5 pour eUp (facture incP − prépayé, le prépayé (sPlus − S0)/B0 étant déjà dans la marge) et le même argument pour eLow sur le déficit de sous-solution.
4. *Monotonie des factures.* Le contrat garde la plus grande borne facturée par côté : la facture ne baisse jamais, et elle ne paie qu'au-delà du déjà payé.

∎
**Ce qui a changé.** L'ancienne formule incrémentale gardait le plancher max(GRID, sPlus) quand une arête **engagée** était révoquée : la vraie somme baisse, toutes les autres entrées montent (les omises comprises), et eUp ne voyait rien (R3, revue maximale du 05/10).
**Test.**
- `test/Bis.t.sol::test_R3_revokedEdgeOfDeclaredRowWidensUpperBound` : eUp croît de 1/3 de la ligne ; avant le correctif, il ne croissait pas du tout.
- `test/Verified.t.sol` : dilution (V7 : trustLow ≤ t* après la preuve), fabrication, péremption, révocation (le retour à l'état engagé ne facture plus rien), plafond, wallet.

## L8 — une ancre n'est jamais la source d'une ligne d'agent (02-bis, D48-A)

**Énoncé.** Sans la règle, une seule ancre compromise a peut faire passer m = 2. Avec `AnchorAsSource`, la contribution d'une clé d'ancre volée reste confinée à sa colonne.
**Contre-exemple.** La clé de a fait de l'adresse de a l'agentWallet d'un agent U qui a de la masse dans la colonne b ≠ a. La ligne de U est alors la ligne de a (copie D20), étalée avec la masse t_U^(b) : les endossés de a reçoivent de la masse dans la colonne b, et le leave-one-out (L4), qui suppose qu'une colonne ne contamine pas les autres, ne retire que la plus grande contribution.
**Preuve.**
- Sans aucune ligne d'agent de source a, toute masse qui transite par une arête de client a part du nœud d'ancre a. Or ce nœud n'a de masse que dans sa colonne : t_a^(b) = 0 pour b ≠ a, car aucune arête ne cible une ancre (règle de forme).
- Les adresses-nœuds n'ont jamais de masse : les arêtes ne ciblent que des agents.
- La masse que a injecte reste donc dans la colonne a, que le leave-one-out retire. ∎
**Test.** `test_A_anchorAsSourceRefused` (les deux niveaux), `CommonVectorsTest::test_common_A_*`, et en fork le vecteur de démo du 01/10 (`AnchorAsSource(5)`).

## L7 — la règle de remplacement compare des précisions (ajout de l'intégration, 01/10)

**Énoncé.** Si t et t' sont deux sous-solutions du même graphe vrai (t, t' ≤ t* composante par composante, L2), alors ‖t* − t‖₁ = ‖t*‖₁ − ‖t‖₁ par colonne : la plus massive est la plus proche de t* en norme L1. De plus, si ‖(t − t*)⁺‖₁ ≤ eLow (borne prouvée sur le titulaire), alors ‖min(t, t*)‖₁ ≥ ‖t‖₁ − eLow.
**Preuve.** t* − t ≥ 0 coordonnée par coordonnée, donc sa norme L1 est la somme des différences. Pour la seconde partie, ‖min(t, t*)‖₁ = ‖t‖₁ − ‖(t − t*)⁺‖₁. ∎
**Conséquence.** La règle « masse_new + eLowEff_cur ≥ masse_cur » (ENCODING.md §5) n'accepte, hors fenêtre de rafraîchissement, qu'un certificat au moins aussi précis que la part prouvée-valide du titulaire, tant que les deux sont dominés par le registre. Une omission (censure) baisse la masse et est refusée ; une dilution peut l'augmenter et passe (AM-02.2, fermée seulement par `proveEdge`). q (eUp sans le plancher d'arrondi E⁺ + 1) borne le côté méfiance : r_a ≥ α‖t*_engagé − t‖₁ − (E⁺ + 1), car ‖(I − (1 − α)Cᵀ)x‖₁ ≥ α‖x‖₁ ; une sous-solution peu massive a donc un q grand (le vecteur nul : q ≈ 1 WAD, AM-5.16).
Le côté méfiance a aussi sa masse : D = Σ_v d_v. Omettre une arête négative ne change ni la masse ni q, mais baisse D ; la voie rapide exige donc D_new ≥ D_cur (ajout après la revue de code du 01/10). Un certificat déjà prouvé faux ne peut pas revenir, même réencodé (02-bis, D48-C) : toute ligne qui contredit un fait prouvé (poids d'une arête (client, agent), ou réclamation de source) est refusée (ENCODING.md §3.5), aux deux niveaux et sous REGISTRY_CHANGED. Un premier essai par hash de ligne se contournait en retouchant le contenu (revue de code du 06/10).
**Test.** `test/Verified.t.sol::test_openReplacementRule` (censure refusée, croissance acceptée, révocation acceptée après preuve, vecteur nul refusé), `test_replacementRefusesOmittedNegative`, `test_replacementRefusesResubmittingProvenCertificate`.

## Garanties du contrat v1, et ce qu'elles ne couvrent pas

| Niveau | Fabrication / gonflement | Dilution (sPlus sous-déclaré) | Omission d'arête négative | Changement après la soumission |
|---|---|---|---|---|
| Registry-verified | **impossible** à la soumission (chaque arête relue ; avant le 06/10, un nœud `address(0)` désynchronisait la relecture : R1, corrigé) | possible, **indétectable** à la soumission (pas d'index par client) ; prouvable par `proveEdge` | possible ; prouvable par `proveEdge` (eUp) | prouvable (`proveEdge`, `proveWallet`, `proveTransfer`) |
| Submitter-attested | possible pour un soumetteur listé ; prouvable par `proveEdge` (preuve (v)) | idem | idem | idem |

Autrement dit, **t ≤ t* n'est garanti qu'après que tout écart existant a été prouvé**. Sans surveillant, la garantie tient à Registry-verified contre la fabrication et le gonflement, pas contre la dilution. Le contrat ne promet pas plus.

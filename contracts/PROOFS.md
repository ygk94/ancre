# PROOFS — lemmes L1 à L5 (D37) et garanties du contrat v1

> Chantier 02, 2026-09-28. Texte destiné au Rationale de l'ERC (chantier 08, `docs/erc/anchored-reputation.md`), en français ici ; les notations sont celles d'ENCODING.md §4.
> Statut : **preuves écrites à la main, non vérifiées formellement** (D37 : pas de Lean avant le 13/10). Chaque lemme est accompagné du test qui l'exerce.

## Notations

- Une colonne a (ancre a). α = αN/αD, om = αD − αN. Tous les vecteurs sont en WAD, ≥ 0.
- Ligne u : poids w_uv ∈ [−10 000, 10 000] \ {0}. Budget positif B⁺_u = bPlus_u déclaré, sinon max(10 000, S⁺_u) ; C_uv = w_uv / B⁺_u pour w_uv > 0, donc Σ_v C_uv ≤ 1 (ligne sous-stochastique ; la masse restante est absorbée, D5).
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

**Énoncé.** Avec r_a = Σ_v (y_v − t_v) + E⁺ + 1 + Σ_{v sans ligne} ⌈(1−α)t_v⌉ + Σ_{u à B⁺ déclaré} ⌈(1−α)t_u(B⁺_u − S⁺_u)/B⁺_u⌉ et eUp_a = ⌈r_a/α⌉ :
(a) ‖t* − t‖₁ ≤ eUp_a pour le point fixe du graphe engagé, et pour le vrai graphe si les seules différences sont des lignes tronquées ou des arêtes positives omises sous un B⁺ déclaré exact ;
(b) d*_j ≤ d_j + (1 − α)·Σ_a λ_a·eUp_a/WAD ≤ d_j + eEff (le contrat utilise la seconde forme, plus large).
**Preuve.** (a) F(t) − t ≥ 0 (L2) et F(t) − t ≤ (y − t) + (erreurs de plancher : < 1 wei par terme positif et par colonne, et < 1 pour le terme α) + (masse des lignes absentes du graphe engagé, au plus (1 − α)t_u chacune) + (masse omise d'une ligne à B⁺ déclaré, au plus (1 − α)t_u(B⁺ − S⁺)/B⁺). Donc ‖F(t) − t‖₁ ≤ r_a. Or t* − t = Σ_{n≥0} ((1 − α)Cᵀ)ⁿ (F(t) − t), vecteurs positifs, et ‖(1 − α)Cᵀx‖₁ ≤ (1 − α)‖x‖₁ pour x ≥ 0 : ‖t* − t‖₁ ≤ r_a/α. (b) d est linéaire en T = Σ λ_a t^(a) avec des coefficients (1 − α)|w|/B⁻ ≤ 1 − α par ligne, arrondis vers le haut. ∎
**Test.** `test/Diff.t.sol` (⌈Σ(t* − t)⌉ ≤ eUp, 48 cas), `test_truncationMargin`, `test_declaredBudgetOmissionIsSafe`.

## L6 — les preuves d'écart restaurent les bornes (ajout du chantier 02)

**Énoncé.** Soit une ligne u dont le vrai état diffère de l'état engagé (amendements successifs). Pour chaque preuve, avec dec⁺, inc⁺, inc⁻ calculés par ENCODING.md §6.1 : après la preuve, pour le graphe amendé A, ‖(t − t*_A)⁺‖₁ ≤ eLow_a et ‖t*_A − t‖₁ ≤ eUp_a.
**Preuve (esquisse).** Entre l'état avant et après la preuve, F change seulement par la ligne u : F_après(t) ≥ F_avant(t) − (1 − α)t_u·dec⁺·𝟙 en norme L1 du déficit, et ≤ F_avant(t) + (1 − α)t_u·inc⁺ en norme L1 de l'excédent. Le déficit de sous-solution δ = (t − F_après(t))⁺ vérifie ‖δ‖₁ ≤ Σ des (1 − α)t_u·dec⁺ facturés ; comme au L5, (t − t*)⁺ ≤ Σ_n ((1 − α)Cᵀ)ⁿ δ, d'où ‖(t − t*)⁺‖₁ ≤ ‖δ‖₁/α = Σ ⌈t_u·om·dec⁺/αN⌉. Les montants s'additionnent d'une preuve à l'autre (inégalité triangulaire sur les états successifs) ; les plafonds sont des majorants valides de la variation totale depuis l'état engagé (la masse positive engagée ‖C⁰_u‖₁ = S⁰/B⁰ pour dec⁺, 1 pour chaque inc). ∎
**Test.** `test/Verified.t.sol` : dilution (V7 : trustLow ≤ t* après preuve), fabrication, péremption, révocation, plafond, wallet.

## Garanties du contrat v1, et ce qu'elles ne couvrent pas

| Niveau | Fabrication / gonflement | Dilution (B⁺ sous-déclaré) | Omission d'arête négative | Changement après la soumission |
|---|---|---|---|---|
| Registry-verified | **impossible** à la soumission (chaque arête relue) | possible, **indétectable** à la soumission (pas d'index par client) ; prouvable par `proveEdge` | possible ; prouvable par `proveEdge` (eUp) | prouvable (`proveEdge`, `proveWallet`, `proveTransfer`) |
| Submitter-attested | possible pour un soumetteur listé ; prouvable par `proveEdge` (preuve (v)) | idem | idem | idem |

Autrement dit, **t ≤ t* n'est garanti qu'après que tout écart existant a été prouvé**. Sans surveillant, la garantie tient à Registry-verified contre la fabrication et le gonflement, pas contre la dilution. Le contrat ne promet pas plus.

# Journal : rejeu `simulate.py` contre le contrat de 02-bis

> Branche `chantier/simulate-02bis` (= main avec 02-bis et 04-bis fusionnés). Périmètre : `solver/simulate.py` seul.

## 2026-10-06 : rejeu vectors, violations, common au vert (27/27)

**Avant** (`simulate-avant.json`, contrat 02-bis, harnais de main) : vectors[0..3], violations RV[0..4] et
common[4] tombaient en `BadNodes()`. common[3] et common[6].resubmission sortaient en sélecteur brut
(`0x8b0f2b23(2)`, `0x47d8ecb1(0)`), sans comparaison avec `expect`.

**Diagnostic**
- `BadNodes()` : 02-bis (A1d) refuse les `newNodes` en ligne sur un set OUVERT. C'était la cause de tous les
  échecs des vecteurs mainnet, qui sont en Registry-verified ouvert.
- common[3] `common_A_attack_anchor_copy` → `AnchorAsSource(2)` : c'est le refus ATTENDU (`expect.submission`).
  common[4] `common_A_mainnet_old_slash_anchor` (0xea0b, ancre et wallet de #18) donne bien `AnchorAsSource(5)`
  une fois les nœuds ajoutés à part. `vectors/mainnet_slash_anchor` (ancres 0x0730/0x794c, D48-A) est ACCEPTÉ.
- common[6] : `ProvenRowResubmitted(0)` est le résultat ATTENDU (`expect.resubmission`, même assertion que
  `CommonVectors.t.sol`). La resoumission ne doit donc pas être « adaptée ». `refreshFact` ne s'applique pas ici,
  puisque le registre n'a pas changé : le contrat répond `NothingToProve`.
- `certifier.ERROR_SIGS` ne connaît pas les erreurs ajoutées par 02-bis (AnchorAsSource, ProvenRowResubmitted…).

**Changements (`solver/simulate.py`)**
- `nodes_first` : sur un set ouvert, `addNodes` part dans sa propre transaction, puis `submitCertificate` est
  envoyé avec des `newNodes` vides. C'est la séquence de `certifier.py` et de `CommonVectors._call`. La fonction
  est idempotente et sert aussi à la copie mutée du scénario A.
- `_learn_errors` : la table des erreurs en mémoire (`C.ERRORS`) est complétée depuis l'ABI compilée. Le fichier
  `certifier.py` n'est pas modifié.
- Chaque ligne porte maintenant `expect` et `pass`. A : accepté, copie mutée refusée en `NotSubSolution`, valeurs
  on-chain égales aux valeurs attendues. B : RV fabricated et inflated refusés en `EdgeMismatch`, le reste accepté
  puis prouvé (types détectés = types prouvés). common : comparaison exacte avec `expect.submission`, nom de
  l'erreur ET argument.
- C : la preuve FABRICATED est envoyée. Le harnais vérifie ensuite `edgeFact(a1, #41) = (true, 0)`, que
  `refreshFact` répond `NothingToProve()`, que la resoumission est refusée en `ProvenRowResubmitted(0)` et que le
  certificat de contrôle est accepté.
- Code de sortie 1 si une ligne échoue, avec un résumé `N pass, M fail`.

**Mesures** (MESURÉ le 06/10, fork rpc1.monad.xyz au bloc 110994810, anvil `--network monad`, 2 rejeux
identiques, aucune erreur 429)
`ANCRE_SIM_DIR=<scratch> .venv/bin/python simulate.py --scenarios vectors,violations,common` → **27 pass, 0 fail**.
- A (9) : gasUsed de submit : em_d44 3 103 219 (addNodes 596 139), honest_d20 836 469 (230 003),
  scanner_preD15 4 607 208 (1 557 236), slash_anchor 856 265 (229 991). Les toys n'ont pas changé.
- B, gas des preuves : DILUTION 392 502, OMITTED_NEGATIVE 364 641, two_omissions 361 691 + 340 800,
  FABRICATED 359 885, INFLATED 365 713. Sur main : 281 596 à 304 506. Le contrat de 02-bis coûte donc environ
  80 000 gas de plus par preuve (+26 à +29 %). Ce surcoût vient de `_checkFacts` et de l'écriture des faits.
- C : proveEdge 358 798, contrôle 260 563.

**Écarts vecteur/contrat** : aucun. Tous les `expect` des vecteurs communs sont tenus tels quels.
**Relais** : ajouter les erreurs de 02-bis à `certifier.ERROR_SIGS` (hors périmètre ici). Mesurer le surcoût
des preuves dans GAS.md.

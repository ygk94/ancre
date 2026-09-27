# Chantier 01 — Tour 4 du conseil

## 1. Objectif et résultat final attendu

Trancher les **7 questions bloquantes** listées à la fin du CR (« Questions pour le tour 4 »). Sans ces réponses, les chantiers 02, 03 et 04 codent sur des règles instables.

**Livrable** : une section « Tour 4 » dans `docs/conseil/CR-conseil.md`, au format des tours précédents. Elle contient :
- les faits utilisés ;
- les phases 1 à 3 (5 experts, relecture croisée à l'aveugle, synthèse tranchée) ;
- une décision numérotée (D20 et suivantes) par question, avec argument, perte et confiance ;
- une **spécification implémentable** pour chaque décision qui touche le contrat ou le solveur ;
- les changements à reporter dans `docs/erc/anchored-reputation.md` ;
- les désaccords non résolus ;
- « ce que vous auriez dû me demander » ;
- les angles morts `AM-4.n`, reportés aussi dans le tableau cumulatif du CR.

Enfin, mettre à jour le journal des décisions et la feuille de route.

## 2. Contexte minimal

- Protocole : la skill `llm-council`, ou le protocole décrit en tête du CR.
- Les 7 questions : fin du CR, section « Questions pour le tour 4 ».
- Sources à **lire avant de délibérer** (règle AM-3.13) :
  - `solver/RESULTS.md` (AM-R4.1 à .10, résultats α) ;
  - `contracts/GAS.md` (AM-R5.1 à .12, coûts mesurés) ;
  - `contracts/ENCODING.md` ;
  - `docs/erc/CHANGES.md` (AM-R6.1 à .28, en particulier AM-R6.2 et AM-R6.4) ;
  - `docs/erc/anchored-reputation.md` (points ⟦OPEN⟧).

## 3. Ce qui est déjà tranché

D1 à D19 du CR. En particulier :
- PPR avec convention absorbante ;
- part de masse en WAD ;
- budgets séparés ;
- méfiance à un saut ;
- veto direct ;
- leave-one-out m = 2 ;
- certificat à borne croissante ;
- stockage contigu ;
- D14 et D15 sur les tags.

**Mesures qui s'imposent au tour 4** : les coûts de `GAS.md` et les résultats de `RESULTS.md`, qui remplacent toutes les estimations des tours précédents.

## 4. Pistes à creuser (points de départ, pas des réponses)

- **Q1, relais (D16).** R4 a mesuré une variante où l'agent transmet sa masse à son wallet partagé. À examiner :
  - le coût Sybil : un wallet partagé par 762 agents agrège-t-il 762 masses ?
  - l'effet sur la borne ;
  - l'alternative « relais seulement si le wallet partagé est aussi owner de tous les agents ».
- **Q2, veto.** Le coût mesuré est de 15 k par avis lu. À examiner :
  - un tag réservé (par exemple `ancre.veto`) lu en O(1) via `getLastIndex` ;
  - `readAllFeedback` filtré par tag, dont le coût est à mesurer ;
  - un veto certifié hors chaîne, avec seul le dernier avis lu en direct ;
  - l'objection du tour 1 : pas de second protocole.
- **Q3, élargissement non borné.** Plafond par ligne proposé par R6 : `cap = ‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2`. Vérifier sa solidité par l'inégalité triangulaire, et le risque de déni de service qui reste.
- **Q4, permissions.** `addNodes` et `submitCertificate` sans permission : quel coût de griefing, mesuré dans `GAS.md` ? Faut-il une caution, un plafond de nœuds par certificat, ou une permission par ensemble ?
- **Q5, α.** Voir `solver/out/synthetic.md` : l'ordre 1/4 ≥ 1/3 ≥ 1/2 dépend-il du modèle de graphe ? Question séparée : TAGS_MAX, sachant qu'execution.market utilise 9 tag1.
- **Q6, lecture.** 77 à 190 k par `assess`, dont ~36 k pour `ownerOf`. Pistes :
  - owner en cache dans le certificat, avec preuve (iv) ;
  - un budget de gas acceptable pour un routeur x402 (voir chantier 05).
- **Q7, e < θ.** Une borne par coordonnée est-elle certifiable en une passe ? Chercher dans la littérature sur la PPR locale (push de type Andersen-Chung-Lang) : un résidu par nœud donne-t-il une borne par nœud ?

## 5. Pièges connus

- Délibérer sans relire les livrables R4, R5 et R6 (c'est arrivé : AM-3.13).
- Reprendre un chiffre d'un tour ancien sans vérifier qu'il n'a pas été corrigé, comme l'estimation de 320 gas/arête ou « 100 % à 0 décimale ».
- Une décision qui casse la démo : toujours vérifier contre la chaîne honnête réelle et contre les scènes de l'acte 2 (D19).

## 6. Questions ouvertes que la session doit trancher

Les 7 questions du CR. Pour chacune : une décision, pas un menu.

## 7. Critères d'acceptation

- Chaque décision précise ce que les chantiers 02, 03 et 04 doivent changer, par fichier et par fonction.
- Aucune décision ne contredit une mesure de R4 ou R5 sans l'expliquer.
- Le journal des décisions et le tableau des angles morts du CR sont à jour.

## 8. Interfaces

Consomme R4, R5 et R6. Produit les règles que 02, 03, 04 et 08 appliquent.

## 9. Règles

Voir `README.md`. Pas de modification de code dans ce chantier.

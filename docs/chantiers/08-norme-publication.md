# Chantier 08 — Norme et publication


> **Amendements du tour 5 (27/09)** :
> - Niveaux **Registry-verified** et **Submitter-attested**, qui remplacent Residual-verified / Registry-contested (D32).
> - Condition de domination de D26 ; preuve (v) ; B⁺ déclaré ; règle normative du veto pour les ancres, avec le tag `veto` RECOMMENDED (D33) ; mode strict par défaut (D35) ; eLow_max (D36).
> - Rationale : lemmes L1-L5 (D37) ; ColinkaMir comme exemple d'`edgeFilterId`, trustgraphs en antériorité (D30).
> - Brouillon de divulgation aux auteurs d'ERC-8004 (D29), non envoyé.


> **Tour 6 (D46)** : dans la Rationale, citer Kanmani et ColinkaMir comme exemples d'`edgeFilterId`. Dans la Motivation, citer le constat de Kanmani (73 sur 85, auto-déclaré, daté). **Pas de filtre « reçu vrai » par défaut.**

## 1. Objectif et résultat final attendu

Amener `docs/erc/anchored-reputation.md` (R6, 775 lignes) à un **état soumettable** sur `ethereum/ERCs`, et préparer les publications **sans les publier**.

**Livrables** :
- `docs/erc/anchored-reputation.md` :
  - intègre le tour 4 ;
  - ⟦OPEN⟧ résolus ou explicitement maintenus ;
  - notes ⟦ ⟧ prêtes à retirer ;
  - conforme à EIP-1 (lint : `eipw` si disponible, **à vérifier**).
- **Vecteurs de test normatifs** (`docs/erc/assets/` ou équivalent), générés par le solveur (04) et acceptés par le contrat (02).
- Brouillons, dans `docs/erc/drafts/` :
  - (a) la description de la PR sur `ethereum/ERCs` ;
  - (b) la **réponse au post #309** du fil ethereum-magicians #25098 ;
  - (c) les **demandes à ERC-8004** : `block.number` par avis, garde-fou étendu à `agentWallet`, unicité du wallet, timelock d'upgrade ;
  - (d) un message à ColinkaMir/monad-agent-trust.
- **Rien n'est publié** : c'est l'étape R10, sur décision de Hugo.

## 2. Contexte minimal

- `docs/erc/CHANGES.md` : ancien → nouveau, AM-R6.1 à .28.
- Faits vérifiés (CR, tour 3), avec leurs sources :
  - dépôt `erc-8004/erc-8004-contracts`, branche master ;
  - fichier de spec `ERC8004SPEC.md` ;
  - branche `feat/unique-reverse-lookup` (v2.1.0) en amont.
- CLAUDE.md §3 : aucun ERC ne couvre l'agrégation de réputation (vérifié : 3 PR fermées sans merge). Le post #309 est resté **sans réponse des auteurs**. **À revérifier** avant de répondre, parce que le fil a pu bouger.
- Décision : la norme est **indépendante de la chaîne**, Monad n'y est pas cité (sauf comme exemple daté dans Motivation).

## 3. Ce qui est déjà tranché

D1 à D19, et le tour 4. La norme ne tranche pas un point que le conseil a laissé ouvert : elle le marque.

## 4. Pistes à creuser

- **Processus EIP** : EIP-1, puis le guide de contribution du dépôt `ethereum/ERCs`. Un fil ethereum-magicians dédié est-il requis (`discussions-to`) ? Faut-il réutiliser #25098 ou créer un fil ? Numérotation, bot et relecteurs : aller lire les règles actuelles, qui changent.
- **Antériorité** : le PoC OpenRank (Karma3) et AInima-Collective/trustgraphs sont déjà cités. Chercher d'autres travaux récents (EAS, Gitcoin Passport, Ceramic…) pour que la section Rationale ne soit pas prise en défaut.
- **Vecteurs de test** : leur format doit être lisible sans notre code (JSON plus description), et reproductible en fractions exactes (R6 l'a fait pour 9 cas).
- **Réponse au #309** : courte, factuelle, avec les chiffres mesurés et datés, un lien vers le draft (quand il sera public) et **aucune promesse**.
- **Divulgation responsable** : le contournement du garde-fou et l'EOA d'upgrade sont publics dans le code source. Faut-il prévenir l'équipe ERC-8004 **avant** le pitch ? C'est une question du tour 3 ; la poser à Hugo.

## 5. Pièges connus

- Le README du dépôt (§7) contient une **ancienne copie du draft** : aligner, ou remplacer par un lien.
- Le dépôt est privé (CLAUDE.md §5) : un lien dans une PR publique exige de le rendre public, ou d'y inclure l'implémentation. **Décision de Hugo.**

## 6. Questions ouvertes

- Faut-il soumettre avant le 13/10 (et donc montrer au jury une PR ouverte) ou après ?
- Nom de la norme et nom du projet (ANCRE est provisoire).

## 7. Critères d'acceptation

- Aucun ⟦OPEN⟧ non listé ; aucune incohérence AM-R6 non traitée ou non justifiée.
- Les vecteurs de test passent dans le solveur et dans le contrat.
- Les 4 brouillons sont prêts et relus. Hugo décide de la publication.

## 8. Interfaces

Consomme 01 (décisions), 02 (implémentation de référence) et 04 (vecteurs de test).

## 9. Règles

Voir `README.md`. **Aucune publication externe, aucune PR, aucun post** sans décision explicite de Hugo.

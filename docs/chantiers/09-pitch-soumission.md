# Chantier 09 — Pitch, vidéo, soumission


> **Amendements du tour 5 (27/09)** :
> - Le scanner est un **service automatique de filtrage de risque**, jamais un complice (D29).
> - D26 se présente comme **l'usage on-chain d'une borne classique**, pas comme un lemme nouveau (D30).
> - **On ne pitche la garantie qu'avec son niveau** (Registry-verified ou Submitter-attested, voir D32).
> - Modèle économique : le propriétaire de l'ensemble paie ; ANCRE opérateur = « oracle de réputation » (D27).
> - Le règlement n'impose ni l'open source ni le mainnet (AM-5.7).
> - Divulgation aux auteurs d'ERC-8004 : décision de Hugo (D29).


## Méthode d'exécution et références (vague 3, 27/09)

- **Storyboard de la vidéo**, 11 plans en 2:55, et **grille des 5 critères** avec la preuve associée à chacun : `docs/ressources/design-demo-et-soumission.md`. Il contient aussi la checklist en 15 points, le write-up, la tagline, la déclaration IA et un paragraphe « Why Monad ».
- **Chiffres à recalculer au tournage** :
  - la chaîne honnête, sous D20 ;
  - les nouveaux avis du mainnet (AM-6.3) ;
  - les latences mesurées sur le mainnet.
- **Règles à confirmer par Hugo** : dépôt public sous licence OSI (le code passe alors en MIT ou Apache-2.0, AM-6.6), vidéo de 3 minutes maximum, inscriptions avant le 06/10.

**Skills** : `/dataviz` pour les figures du pitch. `anthropic-skills:pptx` seulement si un deck `.pptx` est demandé ; sinon, un artefact.

## 1. Objectif et résultat final attendu

Préparer un **dossier de soumission Monad Metropolis complet, déposé le 12/10** (clôture le 13/10), qui gagne des points sur les critères du jury.

**Livrables**
- **Pitch** : le texte du profil de projet et un deck court.
- **Vidéo de démo**. La durée maximale est à vérifier dans le règlement.
- **Script « acte 1 reproductible »** : le jury rejoue en 5 minutes, avec `cast` et le solveur, le constat du mainnet (Eve 1,53e36 → 0, fuite par le scanner, #8317).
- **README du dépôt** en anglais : le README est la vitrine du projet (CLAUDE.md §5).
- La soumission elle-même, **déposée par Hugo**.

## 2. Contexte minimal

**Hackathon** (CLAUDE.md §1)
- Track 04 : Trust, Identity & AI Infra.
- Jury : cofondateurs de Monad, Paradigm, Dragonfly, Electric Capital, Galaxy, Nansen, Pantera, Castle Island.
- 30 k$ par track, plus 25 k$ pour le Grand Champion.
- **Track saturée** : environ 18 clones de type « passeport d'agent » repérés le 18/09.

**Retour d'un jury précédent** (CLAUDE.md §2) : « pas assez novateur ; l'analyse n'a rien apporté ». Il faut donc que l'argument se **sente** : un paiement refusé, pas un tableau.

**Ce qu'on peut affirmer, parce que c'est mesuré** (CR, tour 3, et R4)
- 83 % des avis viennent d'une ferme.
- La moyenne naïve d'Eve vaut 1,53·10³⁶ ; sa masse ANCRE vaut 0.
- Le garde-fou anti-auto-notation est contourné dans les faits (78 cas).
- Une seule clé contrôle les deux registres.
- ~~Le registre est dormant depuis le 10/09~~ : faux depuis le 27/09 (⚠️ corrigé le 27/09 (vague 2) : **le registre n'est plus dormant**, 95 nouveaux avis de 20 clients depuis le bloc 108 483 651 (analyse : `docs/ressources/nouveaux-avis-mainnet.md`)).
- Il ne reste que 3 arêtes utiles.

**Ce qu'il ne faut PAS dire** (CLAUDE.md §6)
- « Première vérification de point fixe on-chain » : le PoC OpenRank le faisait déjà.
- « Le paiement suffit contre les Sybil. »
- « Recalcul à chaque bloc. »
- « Classement positif des agents honnêtes à partir du graphe réel. »

**Coûts mesurés utilisables dans le pitch** (`contracts/GAS.md`)
- Environ 0,084 MON par mise à jour d'un graphe de 300 arêtes.
- 77 à 190 k gas par décision de paiement.

## 3. Ce qui est déjà tranché

- La démo suit la structure de D19 : acte 1 sur le mainnet réel, acte 2 sur notre propre trafic.
- **Annoncer d'emblée** que le graphe honnête est presque vide (le registre, lui, n'est plus dormant : chiffres à recalculer au tournage).
- ANCRE est la couche que la norme ERC-8004 délègue au lecteur, pas un registre de plus.

## 4. Pistes à creuser

- **Règlement** : critères de notation exacts, format de soumission, durée de la vidéo, obligation de déploiement sur le mainnet, dépôt public ou non. Aller lire la page officielle du hackathon. Le vault contient `Metropolis — event, tracks et concurrence.md`, mais **il est daté** : revérifier.
- **Concurrence** : relire la liste des concurrents (vault) et vérifier l'état actuel de ColinkaMir/monad-agent-trust et d'AInima-Collective/trustgraphs. Les positionner **honnêtement** : ColinkaMir est complémentaire (CLAUDE.md §3).
- **Narration** : partir d'une question qu'un contrat se pose (« dois-je payer cet agent ? »), puis montrer pourquoi la moyenne ment (acte 1), puis la réponse d'ANCRE (acte 2), puis la norme.
- **Bounties annexes** : le bounty P256 / passkey de la Monad Foundation (2,5 k$ d'après CLAUDE.md) si les ancres utilisent des passkeys. Vérifier que le bounty existe toujours et ses conditions.
- **Nom du projet** : ANCRE est provisoire. Décision de Hugo.

## 5. Pièges connus

- Ne jamais citer un chiffre sans sa date ni son statut. Le jury compte des fonds data : Nansen et Electric Capital.
- Nommer publiquement le scanner `0xa06f907f` comme attaquant sans vérification (question du tour 3).
- Montrer du « live » qui n'en est pas.

## 6. Questions ouvertes (décisions de Hugo)

- Faut-il rendre le dépôt public, et quand ?
- Nom du projet.
- Faut-il divulguer d'abord à l'équipe ERC-8004 (voir le chantier 08) ?

## 7. Critères d'acceptation

- Un tiers qui n'a jamais vu le projet comprend la démo en 3 minutes de vidéo et peut rejouer l'acte 1 en 5 minutes.
- Chaque chiffre du pitch renvoie à sa source dans le dépôt.
- La soumission est déposée le 12/10, avec une marge d'un jour.

## 8. Interfaces

Consomme tous les chantiers, en particulier les captures de 07, le runbook de 06, les chiffres de 02 et 04, et le draft de 08.

## 9. Règles

Voir `README.md`. Seul Hugo dépose la soumission et publie.

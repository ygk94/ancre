# Tour 7 du conseil — 2026-10-05 — défauts du contrat, périmètre, bounties, démo finale, plan jusqu'au 12/10

> Protocole `llm-council` : 5 experts indépendants, relecture croisée à l'aveugle, synthèse tranchée.
> Les cinq voix sont simulées par un seul modèle.
> Statuts : MESURÉ / DOC / ESTIMÉ / NON VÉRIFIÉ.
> Il reste environ 6 jours de travail. Soumission visée le 12/10, clôture le 14/10 à 05:59 (heure de Paris).

## Faits utilisés (relus avant de délibérer, règle AM-3.13)

**Défauts du contrat** (rapport 08, `docs/erc/relecture-conseil.md`, `CHANGES.md`)
- **AM-08.14 (= AM-08.A)**. Une ancre dont l'adresse est la source (SRC) d'une ligne d'agent rend la règle m ≥ 2 inopérante : la Sybil obtient trustRobust = 0,0247, autant que l'agent honnête #2. MESURÉ en fractions exactes sur TC-3. Le vecteur de démo `mainnet_slash_anchor` est dans ce cas.
- **AM-08.15 (= AM-08.B)**. Le contrat rejette les arêtes des contrôleurs **quel que soit le signe** (l. 1130). Ensuite, le garde-fou d'ERC-8004 empêche ces contrôleurs de poster. Faire taire une ancre coûte environ 0,08 MON (ESTIMÉ).
- **AM-08.16 (= AM-08.C)**. Le refus de resoumettre un certificat prouvé faux est exact à l'octet près, et il est sauté sous `REGISTRY_CHANGED` (l. 572-576).

**Veille du 05/10** (`docs/ressources/veille-2026-10-05-*.md`)
- **Éligibilité des bounties** (DOC, `/tracks`) : « each one names its track, and the ones marked All tracks pair with any ». Le bounty MetaMask est classé en track 01. Envio et Mera sont ouverts à toutes les tracks.
- **Prix** (DOC, `/prizes`) : track et bounties se cumulent, sans plafond.
  - BlockVision 8 k$ est un **prix automatique pour les gagnants de track** (3 mois de Pro), pas un bounty.
  - Envio Cloud : 2 mois gratuits.
  - Jury de track (16 personnes) et jury de bounties (10) sont distincts.
  - Un DevRel de MetaMask est listé parmi les « Judges », mais pas parmi les « Bounty Judges ». C'est incohérent sur la page.
- **Réseau et données** : registres et owner inchangés, Monad 0.16.4, bloc à 300 ms (DOC).
  - **7 nouveaux avis** entre le 28/09 et le 04/10, soit 3 arêtes candidates (MESURÉ). Le snapshot est périmé.
  - **Ancien owner** : `0x4947…` note #10255 environ 4,6 minutes après l'avoir transféré (MESURÉ).
  - **Registre Validation** déployé sur Monad : `0x8004Cc84…` sur le mainnet, une seule requête (MESURÉ).
- **Concurrence** :
  - **trudransh/Assay** : `gradeOf(model, host, trusted[])`, avec des noteurs choisis par le lecteur et une lecture par un contrat avant paiement, mais **sur un seul saut**.
  - **norbert351/merit** : résistant aux Sybil, avec une démo de ferme.
  - **zakyirsyaad/monagent** : plugin `mm` sur la piste 05 de MetaMask, avec une moyenne naïve.
  - **trustset** expose aussi `isTrusted`.

**État du code** (rapports 02 à 08, revérifié le 05/10 par le pilote)
- Tests : contrat 147, solveur 135, indexeur 28, plugin 48, tous verts.
- Registry-verified pour la démo : 14,97 M gas (MESURÉ).
- Un paiement gardé coûte 327 909 gas (MESURÉ, fork). Le test T1 réel n'est pas fait.
- Déploiement du contrat : 8,8 M gas (MESURÉ, simulation).
- Acte 2 complet : environ 40 M gas, soit environ 4,1 MON. Exécution minimale sur le mainnet : environ 0,9 MON (ESTIMÉ, vague 2).

**ARCHITECTURE.md** (26/09) : réconciliation dans le CR, section du 05/10.

## Reformulation

- **Q3 est en partie mal posée.** BlockVision n'est pas un bounty à viser : c'est un prix pour les gagnants de track. La vraie question est : *que vaut encore le plugin MetaMask pour le jury principal, s'il ne compte pas pour le bounty ?*
- **Q2 mélange deux choses** : ce qui renforce la démo, et ce qui renforce la norme. Elles sont tranchées séparément.

## Phase 1 — Analyses indépendantes (condensées)

### A. Théoricien graphes et Sybil
- **Q1-A.** La copie de ligne (D20) fait entrer la masse des **autres colonnes** dans une ligne contrôlée par une ancre. Le leave-one-out suppose qu'une colonne ne contamine pas les autres, et ici elle les contamine. La seule correction saine est structurelle : **une adresse d'ancre ne peut jamais être la source d'une ligne d'agent**, ni par `agentWallet`, ni par VIA_OWNER si l'ensemble l'active.
- **Q1-B.** Rejeter les contrôleurs ne sert qu'à empêcher l'**auto-recommandation**, c'est-à-dire w > 0. Un négatif d'un contrôleur sur son propre agent ne nuit qu'à cet agent : le garder ne crée aucun gain Sybil.
- **Q3.** Le seul attribut qu'aucun concurrent n'a, c'est la **propagation bornée** : la masse de rang 2 et plus, avec la borne (1−α)/α. Il faut la montrer, pas l'affirmer.

### B. Ingénieur EVM
- **Q1-A.** Contrôle à la soumission : pour chaque ligne d'agent, refuser si SRC ∈ ancres. C'est une boucle sur k ≤ 16 ancres, déjà en mémoire, donc un coût négligeable (ESTIMÉ). Après la soumission, un `setAgentWallet` peut faire du wallet une ancre : `proveWallet` doit traiter « nouveau wallet ∈ ancres » comme une ligne invalide.
- **Q1-B.** Le veto par approbation coûte environ k + 1 lectures de pages froides (`getApproved(j)` et `isApprovedForAll(owner(j), a)`), soit environ 32 k gas pour k = 3. C'est ESTIMÉ à partir des 8 100 gas mesurés par page : acceptable en mode strict.
- **Q1-C.** La comparaison à l'octet est inutile. Il faut garder les **hash canoniques des lignes prouvées fausses** (la forme canonique existe, §5.4 du draft) et refuser toute soumission qui en contient une, y compris sous `REGISTRY_CHANGED`. Coût : une lecture de mapping par ligne, soit environ 0,8 M gas pour 100 lignes (ESTIMÉ). Ça tient dans le budget de 15 M.
- **Q5.** Le renommage d'`isTrusted` touche l'ABI : il faut le faire **dans le même lot** que les corrections, pour ne casser le payeur, le plugin et l'indexeur qu'une fois.

### C. Concepteur de normes
- **Q1.** Les trois corrections deviennent normatives dans l'ERC : SRC ∉ ancres en MUST, contrôleurs rejetés pour w > 0 seulement, refus des lignes prouvées.
- **Renommage** : `passesAnchorPolicy(agentId, setId)`. Il est explicite, sans collision avec trustset, et il dit qu'on lit une politique d'ancres, pas une vérité.
- **Q2.** VouchBond et TrustDomain sont des **extensions** de la norme, à écrire comme exemples dans la Rationale, pas comme du code avant le 12/10. Le registre Validation devient une source d'arête future, citée en une ligne.

### D. Attaquant
- **Q1-A.** Sans la correction, je vole une clé d'ancre, je fais rattacher son adresse comme wallet d'un agent que je contrôle (`setAgentWallet` exige la signature du wallet, que j'ai), et j'hérite des autres colonnes. **C'est bloquant pour la démo**, puisque la scène « une ancre compromise ne fait pas payer » est fausse sur le vecteur actuel.
- **Q1-B.** Approuver une ancre **avant** qu'elle sanctionne, c'est la censure préventive. La rendre équivalente à un veto me retire tout intérêt à le faire.
- **Q1-C.** Avec les hash de lignes, je dois changer **la ligne mensongère elle-même**. Ce sera donc un nouveau mensonge, qui devra être prouvé à son tour. C'est acceptable.
- **AM-9.3.** Un ancien owner qui note juste après le transfert, c'est le rachat discret. Il pèse zéro s'il n'a pas de masse. À montrer comme diagnostic, pas comme règle.

### E. Intégrateur et jury
- **Q2.** Le « poids effectif d'une revue » (« cette revue compte pour 0,00 chez vous ») est l'image la plus parlante du produit. C'est un **affichage**, sans contrat : à mettre dans l'écran.
- **Q3.** Le plugin reste dans la vidéo comme **preuve d'intégration** (6 s). Un DevRel de MetaMask figure parmi les juges listés. On arrête d'y investir tant que le support n'a pas répondu.
- **Q4.** Une seule vidéo de 3 minutes, plus le dépôt. Il faut le « 2ᵉ saut » contre Assay, et le disjoncteur. L'override est trop long pour la vidéo : il va dans le README.
- **Q5.** Soumettre **une version complète d'assurance dès le 06/10**, puisque le formulaire est modifiable jusqu'à l'échéance.

## Phase 2 — Relecture croisée (ordre anonyme : 1 = E, 2 = C, 3 = A, 4 = D, 5 = B)

- **A relit B (5)** : *vu* le cas de `proveWallet` après soumission. *Oubli* : VIA_OWNER (D44). Si l'ensemble l'active, l'owner d'un agent devient une source : il faut aussi exclure les ancres sur ce chemin.
- **B relit C (2)** : *faux* que le renommage soit « sans coût ». Il touche le payeur (`isValidSignature`), le plugin, l'écran et l'ERC. Le faire en un seul lot, et avant le déploiement sur le testnet, sinon il faudra redéployer.
- **C relit D (4)** : *vu* la censure préventive. *Trop optimiste* sur C : sans **forme canonique stricte** à l'encodage (alias, ordre, zéros), deux encodages d'une même ligne mensongère ont deux hash. Il faut un contrôle de forme canonique à la soumission.
- **D relit E (1)** : *vu* la soumission d'assurance. *Oubli* : soumettre tôt avec un **dépôt public** expose le contournement **avant** la divulgation (D29). Il faut soumettre d'abord avec le dépôt privé, ou après la divulgation.
- **E relit A (3)** : *vu* la propagation bornée. *Oubli* : avec m = 2, l'agent de 2ᵉ saut doit recevoir de la masse **dans deux colonnes**. Le maillon intermédiaire doit donc être approuvé par **deux** ancres, sinon la scène échoue au leave-one-out.
- **A relit C (2)** : VouchBond « en extension » : d'accord, mais la limite écrite dans ARCHITECTURE.md (la responsabilité est économique, pas algorithmique) doit figurer dans le texte.
- **B relit E (1)** : « poids effectif » : il se calcule hors chaîne, à partir de la masse du noteur et de sa part sur la ligne. Il doit être présenté comme une **lecture du certificat**, pas comme une mesure on-chain.
- **C relit B (5)** : 0,8 M gas pour C reste une estimation. Il faut la mesurer dans le lot de correction.
- **D relit A (3)** : la règle « SRC ∉ ancres » doit aussi couvrir les **ancres ajoutées** à un ensemble. Comme un `setId` est immuable, la vérification à la soumission suffit.
- **E relit D (4)** : AM-9.3 en diagnostic : d'accord. Le pitch ne doit pas en parler.

## Phase 3 — Décisions

### D-7.1 — Corriger les trois défauts dans un seul lot « 02-bis », avec le renommage *(Q1, la question la plus critique)*

**Spécification.**
```
SOUMISSION (submitCertificate), avant la passe :
  require(forme canonique de chaque ligne)                        // alias, ordre, pas de zéro de bourrage
  pour chaque ligne d'agent u, de source SRC (agentWallet, ou owner si VIA_OWNER) :
     if SRC ∈ anchors(set) : revert AnchorAsSource(u)            // AM-08.A
  pour chaque ligne, h = keccak(forme canonique décodée) :
     if provenFalse[setId][h] : revert ProvenRowResubmitted(u)    // AM-08.C, y compris sous REGISTRY_CHANGED

RÈGLE D'ARÊTE (contrat, solveur R6, indexeur edges.ts, ERC §3.3) :
  c contrôleur de j (owner, agentWallet, approved, opérateur) :
     w > 0 → pas d'arête (inchangé)
     w < 0 → arête CONSERVÉE                                      // AM-08.B

PREUVES :
  proveEdge / proveWallet, quand une ligne est prouvée fausse : provenFalse[setId][h_ligne] = true
  proveWallet : si le nouveau wallet (ou owner, si VIA_OWNER) ∈ anchors → la ligne est invalide (charge totale)

ASSESS, veto (mode strict) :
  pour chaque ancre a :
     if getApproved(j) == a or isApprovedForAll(ownerOf(j), a) : veto(a) = vrai   // AM-08.B, censure préventive
  (mode rapide : le même fait est posé par une preuve, proveApproval)

RENOMMAGE (AM-9.5) : isTrusted(agentId, setId) → passesAnchorPolicy(agentId, setId)
  dans le même lot : payeur, plugin, indexeur (ABI), ERC, écran
```

**On assume :**
- **AM-9.3**, l'ancien owner qui note juste après le transfert : il pèse zéro sans masse. L'indexeur l'affiche comme diagnostic (« ancien contrôleur, N blocs après le transfert »).
- AM-08.17 (`addNodes` ouvert) et AM-08.18 (fenêtre de rafraîchissement) sont documentés. La démo fixe `minRefresh = maxAge` et liste ses soumetteurs.

**Ce qu'on perd** : un redéploiement, et une passe sur le payeur, le plugin et l'indexeur. Le veto par approbation coûte environ 32 k gas par `assess` en mode strict (ESTIMÉ, à mesurer). La mesure de C reste à faire.

**Confiance** : 0,85 pour A, 0,75 pour B, 0,7 pour C.

### D-7.2 — Périmètre face à ARCHITECTURE.md *(Q2)*

| Élément | Décision | Raison |
|---|---|---|
| **Surface 4 : poids effectif d'une revue** | **Dans la démo** (chantier 07) : un affichage calculé à partir du certificat | C'est l'image la plus parlante. Environ 0,5 jour (ESTIMÉ) |
| TrustDomain (appartenance) | **ERC en extension et slide** ; le `setId` couvre déjà ancres, schéma et politique | 2 jours ou plus, et pas nécessaire au mécanisme |
| PermissionedRegistry | **Après le hackathon** | Hors du mécanisme jugé |
| VouchBond (parrainage cautionné) | **ERC en extension et slide**, avec sa limite (responsabilité économique, pas algorithmique) | Environ 2 à 3 jours (ESTIMÉ), avec du slashing à sécuriser : trop risqué |
| Registre Validation ERC-8004 | **Une ligne dans l'ERC** (source d'arête future) | Une seule requête on-chain : aucune donnée |

### D-7.3 — Bounties et positionnement *(Q3)*

- **MetaMask** :
  - on **gèle tout nouvel investissement** jusqu'à la réponse du support ;
  - le plugin reste dans la vidéo (6 s) et dans le README, comme preuve d'intégration pour le jury principal ;
  - D38 est amendée : on vise **Envio et Mera**, et MetaMask seulement si l'éligibilité est confirmée.
- **BlockVision** : rien à viser. Utiliser MonadVision (Sourcify) pour la vérification des contrats.
- **Positionnement** :
  - la phrase de D45, à laquelle on ajoute : *« trust that propagates beyond one hop, with a Sybil bound, certified on-chain »* ;
  - on ne revendique plus « un contrat vérifie avant de payer » ni « résistant aux Sybil » seuls : ils sont partagés avec Assay, merit et trustset.
- **Scène « 2ᵉ saut »** :
  - H1 est approuvé par **deux** ancres ;
  - H1 approuve H2 ;
  - H2 n'est noté par personne d'autre ;
  - résultat : ANCRE dit **OK** (masse dans deux colonnes), alors qu'une liste à un saut dirait « inconnu ».
  - Ne jamais nommer Assay.

### D-7.4 — Script final et réseau *(Q4)*

- **Une seule vidéo de 3 minutes**, à partir du storyboard de 2:55 (`design-demo-et-soumission.md` §3) :
  - le plan 5 (« dormant ») est remplacé par « honest graph: 3 edges, so act two is our own traffic » ;
  - un plan de **12 s « 2ᵉ saut »** est ajouté entre les scènes 2 et 3, en raccourcissant les scènes 3 et 8 ;
  - le plan 10b (plugin) est conservé à 6 s ;
  - le plan 10c (Mera) suit D43, avec rotation de clé ou coffre selon la porte P4 ;
  - l'override (D47) va dans le README, pas dans la vidéo.
- **Réseau** (D40, H-B) :
  - l'acte 2 complet se joue sur le **testnet** ;
  - **une seule exécution minimale sur le mainnet** : déploiement plus disjoncteur, soit environ 0,9 MON plus environ 0,9 MON de déploiement (ESTIMÉ) ;
  - les adresses mainnet vont dans le README (critère Monad Integration).
- **Live ou figé** :
  - la vidéo est tournée sur des exécutions **réelles** ;
  - le mode rejeu et l'état anvil exporté sont joints, au cas où ;
  - une démo live pour les juges est optionnelle.
- **À recalculer le jour du tournage** :
  - le snapshot (9 283 + 7 = 9 290 avis, NON VÉRIFIÉ en total) ;
  - la part de la ferme ;
  - la chaîne honnête sous D20 ;
  - le gas du contrat corrigé ;
  - la latence entre le veto et le refus, en blocs.

### D-7.5 — Plan du 06 au 12/10 *(Q5)*

**Ordre de coupe**, du premier sacrifié au dernier :
1. le code Mera de rotation (repli : coffre seul) ;
2. le plan plugin de la vidéo ;
3. l'écran live (repli : mode rejeu seul) ;
4. la mesure du coût de C (documentée seulement).

**On ne coupe jamais :**
- l'acte 1 reproductible ;
- la ferme refusée ;
- l'ancre compromise qui ne fait pas payer (**donc la correction A**) ;
- le disjoncteur au bloc suivant ;
- le 2ᵉ saut ;
- la démo figée ;
- la soumission d'assurance.

## Plan daté (sessions sur cette machine, une par worktree, le journal comme seul canal)

| Jour | Hugo | Sessions et agents | Skills |
|---|---|---|---|
| **Lun 06/10** | **Avant tout** : inscription et projet (track 04, Envio, Mera, et MetaMask en attente), recopie de la modale Rules, question au support (MetaMask, vidéo par bounty), **décision de divulgation** et envoi du brouillon (c) si oui. **Soumission d'assurance, dépôt encore privé** (D-7.4). Keystore chiffré, faucet testnet (≥ 15 MON, 1 USDC). Domaine HTTPS et `rpId` pour Mera | **02-bis** (nouvelle session, 2 agents) : D-7.1 complet + vecteurs AM-08.22. **04** (1 agent) : snapshot rafraîchi, vecteurs « 2ᵉ saut » et « ancre ≠ source », règle R6 pour w < 0. **06-E1/E2** (1 session) : budget et scripts des scènes sur fork, sur l'ABI renommée | `/code-review high`, `/llm-council` (si une décision bloque) |
| **Mar 07/10** | Feu vert T1, mise à disposition du MON de testnet. Prototype Mera sur 2 appareils (06-E3, avec un agent) | **02-bis** : fin, `/security-review`, mesures de gas (C, veto par approbation). **03** : handler `CertificateSubmitted` sur l'ABI finale, règle w < 0, diagnostic « ancien contrôleur ». **05** : T1 réel (une seule exécution), adaptation au renommage. **07** démarre (1 session) : Vite + React + viem, mode rejeu, poids effectif | `/security-review`, `/code-review`, `/dataviz` |
| **Mer 08/10** | Autoriser le **déploiement testnet** (environ 0,9 MON de testnet) | **02** : déploiement testnet et vérification (MonadVision et Sourcify). **06** : scènes 1 à 6 et 2ᵉ saut **sur le testnet**. **07** : branchement GraphQL (03) et flux `monadLogs`. **02-E8 / Mera** si P4 est passée, sinon coffre seul. **08** : ERC mis à jour (D-7.1, renommage, extensions) | `/run`, `/code-review` |
| **Jeu 09/10** | **Valider le budget mainnet** (environ 2 MON, ESTIMÉ) puis l'exécution minimale. Décider du dépôt public et de la licence (MIT ou Apache-2.0, en remplaçant les SPDX CC0) | **06** : répétition complète, export de l'état figé, exécution mainnet minimale. **03** : déploiement Cloud final. **09** démarre : write-up, README public, nettoyage avant publication | `/run`, `/simplify` |
| **Ven 10/10** | Relecture du README et du write-up | **09** : enregistrement de répétition, figures. **07** : finitions, mode rejeu validé hors ligne. Mise à jour de la soumission d'assurance | `/dataviz`, `/code-review` |
| **Sam 11/10** | **Voix et tournage** de la vidéo de 3 minutes, publication YouTube ou Loom. **Dépôt rendu public** (après la divulgation) | **09** : montage, chiffres recalculés au tournage, champs Envio et Mera du formulaire | — |
| **Dim 12/10** | **Soumission finale** | Pilote : vérification de la soumission, gel de `main`, publication de `ancre-indexer` | — |
| Lun 13/10 | Marge (clôture le 14/10 à 05:59) | Surveillant actif à partir du 13/10, pendant le jugement | — |

**Dépendances critiques envers Hugo**
- Le 06 : l'inscription, la divulgation et le keystore avec le MON de testnet. Sans eux, 02-bis ne peut pas déployer et 06 ne peut pas jouer sur le testnet.
- Le 07 : T1 et les appareils Mera.
- Le 09 : le budget mainnet et le dépôt public.

## Désaccords non résolus

1. **Veto par approbation : en direct ou par preuve.** B l'accepte en mode strict (environ 32 k gas, ESTIMÉ). E trouve le coût trop lourd pour un micropaiement, et préfère le mode rapide par preuve.
2. **Code Mera** : D veut couper la rotation et ne garder que le coffre. E y tient, parce que la scène est forte. La porte P4 tranche.
3. **Exécution sur le mainnet** : C trouve le risque de dernière minute trop élevé pour une scène. E l'exige pour le critère Monad Integration.
4. **Le plugin dans la vidéo, s'il est inéligible au bounty.** Gardé à 6 s, mais A le juge hors sujet.
5. **Soumission d'assurance avec un dépôt privé** : est-ce accepté par la plateforme ? Ce n'est pas vérifié.

## Ce que vous auriez dû me demander

1. **La soumission d'assurance accepte-t-elle un lien de dépôt privé ?** Si non, la divulgation (D29) doit partir **avant le 06/10 au soir**.
2. **Combien d'agents tiers utilisent les registres du testnet en ce moment ?** (1 941 agents mesurés en vague 2.) L'acte 2 sur le testnet cohabite avec ce trafic : les arêtes tierces peuvent-elles polluer nos scènes ? Réponse attendue : non, puisque les ancres sont à nous. À vérifier.
3. **Qui tourne et monte la vidéo, et sur quelle machine ?** Le planning suppose Hugo seul le 11/10.
4. **Le renommage casse-t-il le déploiement Cloud de l'indexeur ?** Il faut un nouvel ABI, donc un redéploiement, à faire avant le déploiement final.

## Angles morts (AM-10)

| Id | Angle mort | Suite |
|---|---|---|
| AM-10.1 | La page officielle liste un DevRel de MetaMask parmi les juges, mais pas parmi les juges de bounty : c'est incohérent | ne pas en tirer de conclusion ; attendre le support |
| AM-10.2 | BlockVision 8 k$ est un prix pour les gagnants de track, pas un bounty | corriger `bounties-sponsors.md` |
| AM-10.3 | La correction B modifie un détail de D20, donc la règle d'arête normative, dans 4 implémentations (contrat, solveur, indexeur, ERC) | un seul lot 02-bis, avec des vecteurs communs |
| AM-10.4 | Le renommage casse l'ABI de 4 consommateurs (payeur, plugin, indexeur, écran) | à faire avant tout déploiement testnet |
| AM-10.5 | Sans forme canonique stricte, la correction C se contourne par un encodage équivalent | contrôle de forme canonique à la soumission |
| AM-10.6 | La scène « 2ᵉ saut » échoue au leave-one-out si le maillon intermédiaire n'est approuvé que par une ancre | H1 approuvé par deux ancres |
| AM-10.7 | Une soumission d'assurance avec un dépôt public exposerait le contournement avant la divulgation | soumettre avec le dépôt privé, ou divulguer avant |
| AM-10.8 | Le coût du veto par approbation et celui de C sont estimés, pas mesurés | à mesurer dans 02-bis |

# Remix d'idée (llm-cross-idea) — bounty Mera « One Passkey, Many Keys »

> Vague 3, 2026-09-27. Protocole de la skill `llm-cross-idea` : 5 explorateurs, anonymisation, 4 juges (une dimension chacun), 1 président. Les neuf voix sont simulées par un seul modèle.
> **Entrées** : l'idée de base de `docs/ressources/design-mera.md` ; les sources d'enrichissement, à savoir la fiche officielle (`docs/conseil/bounties-sponsors.md`), `docs/ressources/mera.md`, le concurrent `aliveevie/mandate` (lu par la vague 2) et ANCRE (`ANCRE.md`, D1-D38).
> Chiffres et coûts : ESTIMÉ, sauf mention contraire. Rien n'est codé.

## Entrées remplies

**Idée de base.** « La clé suivante naît sur l'autre appareil ».
- Chaque époque de clé d'une ancre ANCRE a son propre sel PRF.
- Le Mac engage on-chain l'empreinte de la clé n+1 (pré-rotation, D9).
- L'iPhone, avec le seul passkey, fait naître cette clé, et c'est le contrat qui la valide en acceptant la rotation.
- Scène : une clé d'ancre volée pose un veto sur un fournisseur honnête. On fait tourner la clé depuis l'iPhone, et au bloc suivant le veto ne compte plus (D33 lit la clé courante).
- Secours : un dossier de veto scellé.

**Contraintes dures**
- 16 jours avant la clôture ; 1,5 jour au plus pour tout ce qui touche à Mera.
- 3 devs Solidity/TypeScript et un quant.
- Il faut un domaine HTTPS fixe et deux appareils avec PRF (iCloud Keychain ou 1Password).
- La pré-rotation avait été coupée de la démo (AM-2.13). La rétablir est une décision de Hugo.

**Source d'enrichissement**, primitives disponibles (DOC, v0.2.0 lue) :
- **PRF** : une sortie de 32 octets par sel. Seule la sortie `first` est exposée, donc un sel coûte une cérémonie, soit un prompt.
- **Sels comme espaces de noms** : le cloisonnement est garanti par l'authenticator.
- **Coffres AES-256-GCM** : HKDF, un sel aléatoire par coffre, et la recette « use an existing secret ».
- **Sessions de signature** secp256k1 et Ed25519 : la session copie la clé, c'est à l'appelant de mettre la sienne à zéro.
- **Pas d'exposition** de la clé publique P-256 du passkey.
- **Multi-appareils** : via passkeys synchronisés.
- **Critères du bounty** :
  - nouveauté (s'éloigner du « passkey wallet ») ;
  - usage correct des primitives ;
  - test multi-appareils en live ;
  - au moins un espace de noms qui fait un travail autre que celui d'un compte.

**Ce qu'on ne veut pas**
- Un passkey qui possède l'agent, ou une politique chiffrée : c'est Mandate.
- Des identités non reliables : ce serait une fabrique de Sybil.
- Une brique décorative, ou un wallet déguisé.

---

## Étape 1 — Cinq explorateurs

### Le minimaliste — « Le Dossier Du Slash »
**Pitch en une ligne :** Chaque veto d'ancre arrive avec sa preuve, scellée sous le passkey. Elle se rouvre sur n'importe quel appareil et n'est lisible par personne d'autre.
**Le remix :** On prend le secours de l'idée de base et on en fait le sujet principal. L'ancre joint à son `slash` un dossier (captures, logs x402, reçus) chiffré dans un coffre Mera. Le coffre est pointé par `feedbackURI`, et `feedbackHash` engage le clair. Quand le fournisseur fait appel, l'ancre rouvre le dossier sur un second appareil et le révèle.
**Éléments intégrés :**
- coffre AES-256-GCM, avec l'API telle quelle ;
- `feedbackURI` et `feedbackHash` d'ERC-8004, qui existent déjà ;
- un sel de coffre aléatoire, donc un cloisonnement par dossier ;
- une seule cérémonie par ouverture ;
- zéro contrat nouveau.
**Pourquoi cet angle :** C'est la plus petite surface qui fasse un usage « hors compte » incontestable. Il n'y a que du chiffrement, aucune signature, et donc aucun risque de wallet déguisé.
**Périmètre du premier jet :**
- une page `/dossier` qui chiffre un fichier, publie le coffre et affiche le hash ;
- un `slash` de démo avec `feedbackURI` ;
- la réouverture sur l'iPhone, avec comparaison du hash au `feedbackHash` on-chain ;
- 0,5 jour.

### Le tendance — « Mémoire De L'Agent Payeur »
**Pitch en une ligne :** L'agent qui paie via x402 garde ses reçus et ses constats de livraison chiffrés sous le passkey de son humain, et s'en sert pour noter.
**Le remix :** ANCRE recommande le motif « consommateur-ancre » (D13) : celui qui paie note ce qu'il a reçu. On en fait un agent avec une mémoire chiffrée par fournisseur (un sel par fournisseur), synchronisée entre le laptop et le téléphone. L'agent MetaMask (bounty 3) la relit avant de payer, puis note.
**Éléments intégrés :**
- un sel par fournisseur, donc des mémoires isolées ;
- des coffres pour les reçus x402 et les constats de livraison ;
- le plugin `mm ancre` qui lit la mémoire ;
- `giveFeedback` après la livraison ;
- des passkeys synchronisés.
**Pourquoi cet angle :** Agents IA, x402 et « mémoire d'agent » sont exactement ce qui circule en ce moment, et c'est une piste officielle du bounty.
**Périmètre du premier jet :**
- la mémoire chiffrée d'un agent sur 2 fournisseurs ;
- la même mémoire relue depuis un navigateur neuf ;
- un avis posé à partir de cette mémoire.

### Le franc-tireur — « Ancres Qui Ne Copient Pas »
**Pitch en une ligne :** Deux ancres doivent juger sans se voir : chacune scelle son verdict avec une clé que seul son passkey refait, puis on révèle tout ensemble.
**Le remix :** L'élément le moins évident de la source, c'est « une sortie déterministe par sel, reconstructible sans rien stocker ». On le croise avec l'hypothèse la moins défendue d'ANCRE : le leave-one-out (m = 2) suppose des ancres **indépendantes**, et R4 a mesuré que deux ancres corrélées le contournent (AM-R4.8). Chaque ancre engage `hash(verdict, nonce)`, où le nonce est dérivé du passkey avec un sel par (fournisseur, tour). Le contrat n'accepte les révélations qu'une fois tous les engagements reçus.
**Éléments intégrés :**
- un sel par (fournisseur, tour), ce qui donne un nonce reconstructible sans secret stocké ;
- un contrat de dépôt en deux phases ;
- une révélation qui peut se faire depuis un autre appareil ;
- le leave-one-out appliqué aux seules ancres qui ont révélé.
**Pourquoi cet angle :** Personne n'utilise le PRF pour garantir l'**indépendance** entre évaluateurs. La combinaison n'a rien d'évident, parce qu'elle vise une faiblesse du modèle Sybil lui-même, pas la gestion des clés.
**Périmètre du premier jet :**
- `SealedRound.sol` (engagement, révélation) ;
- 2 ancres, 1 fournisseur ;
- une révélation depuis l'iPhone ;
- le leave-one-out calculé sur les révélations.

### L'architecte — « Journal D'Événements De Clé »
**Pitch en une ligne :** Un journal complet des événements de clé d'une ancre (inception, rotations, capacités, dossiers), entièrement dérivé d'un passkey et vérifié par le contrat.
**Le remix :** On empile toutes les primitives, sur le modèle KERI :
- des époques pré-rotées (l'idée de base) ;
- `rotateBySig`, une signature d'attestation sans transaction ;
- des clés de capacité par `setId` pour le niveau Submitter-attested (D32) ;
- des dossiers de veto scellés ;
- une clé de révocation d'urgence pré-engagée.

Chaque famille a son préfixe de sel : `epoch`, `cap`, `dossier`, `kill`.
**Éléments intégrés :**
- 4 familles de sels cloisonnées ;
- HKDF à l'intérieur d'une époque ;
- `AnchorRegistry` avec incept, rotate, `rotateBySig` et kill ;
- des coffres pour les dossiers ;
- une clé de soumetteur par ensemble ;
- un journal d'events rejoué par l'indexeur.
**Pourquoi cet angle :** C'est la version la plus profonde. Elle montre qu'un passkey peut porter toute l'identité opérationnelle d'une ancre sans aucun secret stocké.
**Périmètre du premier jet :**
- `AnchorRegistry` complet ;
- 4 espaces de noms ;
- rotation et kill en live ;
- un dossier ;
- une page de journal.

### Le stratège — « Ancre Récupérable Sans Garde »
**Pitch en une ligne :** Une ancre, c'est un curateur qui engage sa réputation. Si sa clé est volée, il reprend la main en un Face ID, sans coffre, sans custody, sans recertifier.
**Le remix :** D27 fait des ensembles d'ancres l'actif payant d'ANCRE. Le risque principal pour un curateur est simple : **une clé d'ancre volée peut bloquer n'importe quel fournisseur** (veto q = 1). C'est un risque de responsabilité. L'idée de base, avec la clé suivante qui naît sur l'autre appareil, est la réponse commerciale. Le dossier scellé s'y ajoute comme preuve de bonne foi du curateur en cas de recours.
**Éléments intégrés :**
- des époques pré-rotées, un sel chacune ;
- `rotateBySig`, sans financement préalable de la nouvelle clé ;
- la vérification on-chain de l'empreinte, qui arbitre le test multi-appareils ;
- un veto qui lit la clé courante (D33), donc une récupération au bloc suivant ;
- en option, un dossier scellé pour le recours.
**Pourquoi cet angle :** Le jury achète « qui paie et pourquoi ». Un curateur n'engagera pas sa réputation sur une clé qu'il ne sait pas récupérer. C'est aussi la seule version qui prolonge une scène que D31 interdit de couper (la scène de l'ancre compromise).
**Périmètre du premier jet :**
- `AnchorRegistry` avec incept, `rotateBySig` et `currentKey` ;
- la page `/anchor` (Mera), avec 2 prompts par rotation ;
- la scène du veto volé suivi de la rotation sur l'iPhone ;
- 1,5 jour.

## Étape 2 — Anonymisation

A = franc-tireur · B = stratège · C = minimaliste · D = architecte · E = tendance.
(Correspondance révélée seulement au verdict.)

## Étape 3 — Quatre juges

### Juge : l'historien. Dimension : nouveauté

| Version | Note | Raison |
|---|---|---|
| A | 7 | Le commit-reveal est classique. Un nonce PRF reconstructible au service de l'indépendance entre évaluateurs : aucun projet repéré (NON VÉRIFIÉ au-delà de nos lectures) |
| B | 8 | La pré-rotation KERI existe ; ses clés futures qui ne sont stockées nulle part, et la vérification par le contrat : non repéré. Mandate n'a pas de rotation (lu en vague 2) |
| C | 5 | Une preuve chiffrée derrière un avis, ça existe ailleurs ; sur ERC-8004 avec un passkey, pas repéré |
| D | 7 | Mêmes briques que B, en plus nombreuses. L'empilement n'ajoute pas de nouveauté |
| E | 3 | C'est la piste officielle « mémoire d'agent », très proche de Mandate |

**Observation transversale :** ce qui est neuf ici n'est jamais le chiffrement. C'est **la vérification on-chain d'une clé que personne n'a stockée**.

### Juge : le pragmatique. Dimension : utilité réelle

| Version | Note | Raison |
|---|---|---|
| A | 3 | La corrélation entre ancres est réelle, mais le veto doit être immédiat (D33), et deux phases ralentissent tout |
| B | 8 | Une clé d'ancre volée bloque des paiements honnêtes : la douleur est aiguë et elle tombe sur celui qui paie (D27) |
| C | 6 | Le recours d'un fournisseur contre un slash est un vrai besoin, mais il arrive rarement |
| D | 5 | Utile, mais la moitié des espaces de noms ne résout aucun problème de la démo |
| E | 5 | Aide à noter, mais le consommateur peut aussi garder ses reçus en clair |

**Observation transversale :** l'utilité se concentre là où ANCRE a un point de défaillance réel, **la clé d'ancre**.

### Juge : l'ingénieur. Dimension : constructibilité

| Version | Note | Raison |
|---|---|---|
| A | 5 | Un nouveau contrat en deux phases, et une synchronisation des révélations |
| B | 7 | `AnchorRegistry` et `ecrecover` sont éprouvés ; Mera v0.2.0 est jeune ; 2 prompts ; `rotateBySig` évite l'attente de 3 blocs pour financer la clé |
| C | 9 | L'API de coffre s'utilise telle quelle, sans contrat |
| D | 4 | 4 familles de sels, une clé kill et des capacités D32 : risque d'intégration élevé |
| E | 7 | Coffres simples, plus l'intégration avec le plugin |

**Observation transversale :** la jeunesse de Mera (v0.2.0) et l'absence d'exemple officiel sur Monad (vague 1) pénalisent tout ce qui dépasse deux prompts.

### Juge : le vétéran. Dimension : démontrable en 1,5 jour et en 3 minutes

| Version | Note | Raison |
|---|---|---|
| A | 3 | Démo abstraite (des engagements, puis des révélations), sans moment fort |
| B | 9 | Veto volé, fournisseur honnête refusé, Face ID sur l'iPhone, payé au bloc suivant. Le multi-appareils est **arbitré par la chaîne**, c'est le critère n° 3 en direct |
| C | 6 | « Je déchiffre un PDF sur mon téléphone » : correct, mais pas marquant |
| D | 3 | Trop long à la fois pour 1,5 jour et pour 3 minutes |
| E | 4 | Rien qui se voie à l'écran |

**Observation transversale :** une seule version a un **moment fort intégré** qui prolonge une scène déjà obligatoire de la démo.

## Étape 4 — Verdict du président

# Verdict

## Rappel des entrées
- **Idée de base** : la clé suivante naît sur l'autre appareil.
- **Source** : les primitives de Mera v0.2.0 et les critères du bounty.
- **Écarté d'avance** : Mandate, les identités non reliables, les wallets déguisés.

## Matrice des notes

| Version (explorateur) | Nouveauté | Utilité | Constructible | Démontrable | Total |
|---|---|---|---|---|---|
| B, stratège | 8 | 8 | 7 | 9 | **32** |
| C, minimaliste | 5 | 6 | 9 | 6 | 26 |
| D, architecte | 7 | 5 | 4 | 3 | 19 |
| E, tendance | 3 | 5 | 7 | 4 | 19 |
| A, franc-tireur | 7 | 3 | 5 | 3 | 18 |

## Les 3 versions à poursuivre

1. **« Ancre récupérable sans garde »** (stratège).
   - **Pitch** : une clé d'ancre volée se récupère en un Face ID, sans custody ni recertification.
   - **Pourquoi elle a bien noté** : le meilleur moment de démo, une douleur réelle, et une nouveauté que Mandate n'a pas.
   - **Risque principal**, le « wallet déguisé » (critère n° 1) : la clé courante signe ensuite des avis.
   - **Correction** :
     1. rotation par `rotateBySig`, c'est-à-dire une attestation et pas une transaction ;
     2. **dire explicitement** que l'espace de noms montré n'est pas un compte : les époques futures ne sont jamais utilisées pour signer, elles servent à engager et à révéler ;
     3. ajouter un espace de noms chiffrant (voir 2).
2. **« Le dossier du slash »** (minimaliste), en **second espace de noms** sur le même passkey.
   - **Pourquoi** : c'est l'usage « hors compte » le plus incontestable (chiffrement pur, rien de persisté), pour environ 0,3 jour.
   - **Risque** : il marque peu seul. Couplé à 1, il illustre le critère « chiffrement contre dérivation employés à bon escient ».
3. **« Ancres qui ne copient pas »** (franc-tireur), **mise de côté pour la norme**, pas pour la démo.
   - **Pourquoi** : elle vise une vraie faiblesse mesurée (AM-R4.8, ancres corrélées).
   - **Risque** : utilité immédiate faible. À noter dans l'ERC comme extension, en Rationale.

## Les versions écartées, et pourquoi
- **Architecte** : trop pour 1,5 jour. La clé kill et les capacités par ensemble peuvent revenir après le hackathon.
- **Tendance** : c'est la piste officielle et le terrain de Mandate. Nouveauté 3.

## Ma recommandation

**Un hybride de B et C, sur un seul passkey, avec deux familles de sels :**
- `ancre.v1|anchor-epoch|<label>|<n>` : **dérivation**. Les clés d'époque sont pré-rotées, et l'empreinte est vérifiée par le contrat.
- les coffres de dossier de veto, avec un sel aléatoire par coffre : **chiffrement**.

**Scène de démo exacte**, qui prolonge la scène 3 et la scène 6, avec l'ancre C parmi 3 ancres honnêtes et le fournisseur P noté par A, B et C :

| t | Appareil | Action | Ce que voit le jury |
|---|---|---|---|
| 0 | écran | P est payé | `assess` = OK |
| 1 | terminal « attaquant » (demo) | la clé `k_0` de C approuve la ferme **et** slashe P | ferme toujours refusée (leave-one-out) ; **P refusé au bloc suivant** (veto) |
| 2 | attaquant | tente de faire tourner la clé vers la sienne | **revert** : il n'a ni `k_1` ni `s_1` |
| 3 | iPhone, Safari neuf | scan du descripteur, Face ID | « clé 1 reconstruite, empreinte = celle engagée par le Mac au bloc X ✓ », avant tout envoi |
| 4 | iPhone | 2e Face ID (époque 2), `rotateBySig` relayé | event `AnchorKeyRotated` |
| 5 | écran | au bloc suivant, le veto volé ne compte plus | **P de nouveau payé**, sans recertification |
| 6 (option) | iPhone | P fait appel ; C rouvre le **dossier** de son slash légitime précédent (un 3e prompt) | le hash du clair = `feedbackHash` on-chain ✓ |

La phrase pour le jury : *« Cette clé n'existait sur aucun appareil. Le Mac a engagé son empreinte hier ; l'iPhone vient de la faire naître avec le même passkey, et c'est le contrat qui a vérifié qu'elle était la bonne. »*

**Ce qu'on perd**
- On rouvre la coupe AM-2.13 : la pré-rotation revient dans la démo (décision de Hugo).
- Environ 1,5 jour, plus 0,3 jour pour le dossier. **Le dossier se coupe en premier** en cas de retard.
- 2 prompts par rotation.
- Une dépendance à un domaine HTTPS fixe et à iCloud Keychain.
- Les approbations de la clé morte restent comptées jusqu'à la recertification, bornées par le leave-one-out.
- Je recommande de **ne pas** passer en `STALE` à la rotation, pour que la scène reste lisible.

## La première chose à faire
Réserver le domaine HTTPS et le `rpId`, qu'on ne changera plus. Puis faire un prototype d'une page qui dérive deux époques et compare l'empreinte sur deux appareils, **avant** toute ligne de contrat. S'il échoue, on se replie sur C seul.

## Questions ouvertes pour moi
1. Hugo rétablit-il la pré-rotation dans la démo (AM-2.13) ?
2. `rotateBySig` passe-t-il dans l'ERC en option (chantier 08) ?
3. Quel domaine, et quel hébergement pour l'écran ?
4. Faut-il faire valider le discours « ce n'est pas un wallet » par une question aux organisateurs du bounty ?

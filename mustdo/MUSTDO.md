# MUSTDO — ce que Hugo doit faire lui-même

> **État au ven 10/10 après-midi.** Clôture : **14/10 à 05:59 (Paris)**. **Objectif : soumettre le 12/10**, avec le lundi 13/10 en marge.
> Le retard du 09/10 est **rattrapé** : la divulgation et le « privé » sont tranchés, le mainnet est fait, et Alchemy est intégré.
>
> Ce fichier ne garde que ce qui reste, **par ordre de priorité** : un point en haut débloque souvent ceux d'en dessous. Anciennes versions : `mustdo/archive/`. La version cochable est l'artefact MUSTDO ANCRE.

## 🔴 Ven 10/10 (aujourd'hui)

1. [x] **Webhook Alchemy** ✅ : 18 livraisons signées, bloc → réception en 1,3 s (médiane), puis **de bout en bout en réel à 13:16 UTC** : avis → webhook 1,06 s → certificat on-chain +17 blocs / 6,3 s, audité CLEAN. **Le certificat officiel du testnet est rafraîchi.**
2. [x] ✅ **Netlify : variable `ALCHEMY_API_KEY`** (vérifiée en ligne), en cochant « Contains secret values ». En cours. Si la variable est créée après le dernier push, fais un *Trigger deploy* : les fonctions ne lisent la variable qu'au déploiement.
3. [x] **Push** ✅ (mainnet, Alchemy, scripts vidéo, écran mainnet).
4. [x] **Écran mainnet (option 1)** ✅ : lecture directe du contrat, avec le certificat, son âge et `STALE` (à partir du 11/10 vers midi UTC, estimé), les liens monadscan, le libellé « live · minimal run 10/10 » et 61 tests.
5. [ ] **Relire le README public et le write-up.** Les textes de la plateforme sont dans `docs/soumission/textes-plateforme.txt` (adresses mainnet et mesures Alchemy déjà ajoutées).
6. [ ] **Laisser l'onglet du récepteur Alchemy ouvert** si tu veux qu'il continue à recertifier. Pour la vidéo, relance `node trigger.ts --send --keystore ~/.foundry/keystores/ancre-demo` (depuis `demo/`).

## 🟠 Sam 11/10 : la mise en public et le tournage

1. [x] **Dépôt public** ✅ 10/10 : https://github.com/ygk94/ancre (MIT, 262 commits datés d'origine, une seule identité perso, adresses pro et consignes internes retirées). Le dépôt privé de travail devient `ygk94/ancre-dev`. Je republie après chaque changement avec `~/.ancre-publish/publish.sh --push`. L'indexeur `ygk94/ancre-indexerv2` a sa branche `main` réécrite sous l'adresse perso ; `envio` est inchangée (option a).
   - [x] **Site public** ✅ 10/10 : https://ancre-xyz.netlify.app répond sans mot de passe ; `/api/funders` (Transfers API, clé côté Netlify) répond en direct.
   - [ ] **Sur l'autre machine** : `git remote set-url origin git@github.com:ygk94/ancre-dev.git`.
2. [ ] **Voix et tournage de la vidéo de 3 minutes** : `demo/VIDEO-SHOTS.md`, avec sa checklist d'honnêteté.
   - Elle doit montrer de vraies interactions Monad (§9.4). On a maintenant **le testnet (07/10) et le mainnet (10/10)**, avec les liens vers l'explorateur.
   - Au tournage, ré-exporter l'acte 1 (AM-07.1).
   - La partie sur le garde-fou et les registres upgradables est à expliquer de vive voix (D57), comme des faits, sans accusation.
3. [ ] **Vidéos des bounties, 1 min chacune** (D60) :
   - Alchemy : `docs/soumission/video-alchemy.md`. Il faut le récepteur en mode réel pour la scène en direct.
   - Envio : `docs/soumission/video-envio.md` (chiffres lus en direct le 10/10).

## 🟡 Dim 12/10 : la soumission

1. [ ] **Soumission finale**, avec :
   - le profil et le write-up ;
   - le lien vers le code public et les vidéos ;
   - la déclaration des outils IA ;
   - les champs des bounties Envio et Alchemy. Mera est en pause, donc pas de champ Mera.
2. [ ] **Le surveillant pendant le jugement, du 13 au 27/10.** Les certificats expirent au bout d'environ 24 h (`maxAge`) et s'affichent alors `STALE`. Que fait-on ?
   - (a) Laisser tourner le récepteur Alchemy sur ton Mac. Il faut le Mac allumé et le tunnel stable.
   - (b) Un petit hôte gratuit, à décider.
   - (c) Rien ne tourne : l'écran explique `STALE`, et `JUDGES.md` garde les transactions.

## 🧑 À toi seul, quand tu peux

- [ ] **Clause de cession des inventions** de ton contrat de travail (§4.3 des règles). À relire **avant la mise en public**.
- [ ] **Sur l'autre machine** : `git pull`, puis `git config user.email hugo.thomas.perso@gmail.com`.
- [ ] **Régénérer le token Envio** (envio.dev/app/api-tokens) : l'ancien est apparu en clair (AM-03.7).
- [ ] Option : récupérer les **0,02 USDC** restés dans le payeur mainnet, depuis ton MetaMask principal, avec `sweep(USDC, amount)` (RUNBOOK §7). Ce n'est pas urgent.

## Ce que je fais de mon côté (pilote), sans action de ta part

- Mettre les **adresses mainnet** dans le README et dans `docs/soumission/textes-plateforme.txt`.
- Ajouter **le mainnet à `demo/VIDEO-SHOTS.md`** : le refus d'Eve en vrai et le disjoncteur à 332 ms.
- Relire la ligne `TIMELINE` du premier vrai webhook, et la recopier dans la doc Alchemy et les textes de la plateforme.

## Décisions en attente

- [ ] « **Donate** » sur l'écran : affiché « soon ». Que veux-tu dedans, ou faut-il le retirer ?
- [ ] La lentille « A reader who anchors inside the farm » : la garder dans le sélecteur, ou seulement dans le README ? (07-bis)
- [ ] Les points de la revue laissés au conseil, sans effet sur la démo : A1b, EFF1, G-11 (EOA 7702), liveness des faits, AM-08bis.11 et .12 côté norme.
- [ ] Le repli owner (D44), le mode de l'ensemble (ouvert ou soumetteur attesté), le plugin MetaMask dans la vidéo, et la langue des docs techniques.
- [ ] **Après le 13/10 :** la PR sur ethereum/ERCs avec un fil Magicians dédié, et les contacts ColinkaMir et Kanmani (brouillons dans `docs/erc/drafts/`).

## En pause ou abandonné

- **Prototype Mera (porte P4)** : ✅ **porte P4 passée le 12/10 vers 00:30** (Mac Safari + iPhone, même passkey iCloud : adresses d'epoch 0 et 1 et empreintes identiques). Le prototype est en ligne sur `/mera/`. **Intégration faite le 12/10 vers 01:30** : ensemble « mera » `0x2d11…4f2f` (anchor-A, anchor-B, ancre-passkey `0xe3c8…309b`) sur l'instance officielle, payeur dédié `0x7CB3…bd1B` (owner = ton MetaMask), provider-1 payé (0.01 USDC). Le veto se pose depuis `/mera/` section 4 (Face ID, Mera signe). **À faire pendant la vidéo** : le veto, puis `node mera.ts after --keystore ~/.foundry/keystores/ancre-demo` (depuis `demo/`) qui montre le refus. Répété sur fork : refus 1 bloc après le veto.
- **Bounty MetaMask** : abandonné, car réservé à la track 01 (D53). Le plugin reste dans le dépôt.

## ✅ Ce qui est fait

**Le 10/10**
- **Décisions de Hugo** (D57 à D60) :
  - pas de divulgation préalable, et les marqueurs DISCLOSURE-GATE sont retirés ;
  - tout le dépôt sera public ;
  - mainnet oui ;
  - bounty Alchemy avec sa vidéo.
- **Mainnet : MAINNET ACT PASS** (12:30 UTC, scènes 0, 1, 2 et 4) :
  - ANCRE `0x0Da1579233E7Cb07a174986D059D59B1F293b30E` ;
  - payeur `0x52f361A14A49fAB267703203f833b997B9cF5Dc0`, avec l'owner `0xD6Fa…4071`, la trésorerie `0x0146…05B9` et l'opérateur `ancre-demo` ;
  - le fournisseur #10330 a été **payé 0,01 USDC par le vrai facilitator** ;
  - Eve-8004 a été refusée sans aucune transaction ;
  - disjoncteur en **1 bloc / 332 ms** ;
  - 1,548 MON dépensés, après l'échange de 100 MON contre 2,455 USDC sur Uniswap v3 ;
  - tout est dans `demo/JUDGES.md` et `docs/chantiers/rapports/act-mainnet/`.
- **Alchemy** :
  - le Custom Webhook est créé sur Monad testnet et les clés sont dans `solver/.env` ;
  - le récepteur tourne derrière un tunnel cloudflared et refuse les requêtes non signées ;
  - le chemin webhook → Envio → recalcul → certificat est fusionné (3,6 s en rejeu, MESURÉ) ;
  - le panneau « Who funded the raters? » utilise la Transfers API (150/150, 11,0 MON, MESURÉ), avec `solver/funders.py` et `docs/ressources/alchemy-integration.md`.
- **Scripts des vidéos Alchemy et Envio**, d'une minute chacune.
- **AM-08bis.12 vérifié pour la démo** : aucune des 3 ancres ne possède d'agent.
- **Tests** : solveur 223 et écran 43, verts après les fusions.

**Du 06 au 08/10**
- **Revue maximale** corrigée et poussée (contrat 197, plugin 76, indexeur 75, vecteurs de l'ERC 27/0).
- **Keystore** `ancre-demo`, avec un mot de passe changé, et les fonds de testnet.
- **Site** https://ancre-xyz.netlify.app (protégé).
- **Règles, licence et identité** : règles v3.0 résumées, licence MIT (ERC en CC0), commits sous l'adresse perso.
- **Porte P3 (T1) ouverte**, en `exact` comme en `upto`.
- **Acte 2 PASS 8/8 sur le vrai testnet** : l'instance officielle est ANCRE `0x8bE6…da9B` et le payeur `0xC9Db…5870`, avec un disjoncteur en 1 bloc / 260 ms.
- **Front 07-bis et norme 08-bis** fusionnés.
- **Indexeur Envio** redéployé (`ygk94/ancre-indexerv2`, `…/38cf597/v1/graphql`), avec un audit CLEAN.

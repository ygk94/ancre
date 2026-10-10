# MUSTDO — ce que Hugo doit faire lui-même

> **État au ven 10/10.** Clôture : **14/10 à 05:59 (Paris)**. **Objectif : soumettre le 12/10**, avec le lundi 13/10 en marge.
> On a **un jour de retard** : rien n'a bougé le 09/10. Le mainnet, la décision sur ce qui reste privé et la relecture sont donc regroupés aujourd'hui.
>
> Ce fichier ne garde que ce qui reste, **par ordre de priorité** : un point en haut débloque souvent ceux d'en dessous. L'ancienne version est dans `mustdo/archive/MUSTDO-avant-2026-10-10.md`. La version cochable est l'artefact MUSTDO ANCRE.

## ✅ Ce qui est fait (06 → 08/10)

- **Code :** revue maximale corrigée, fusionnée et poussée. Tous les tests sont verts :

  | Partie | Tests |
  |---|---|
  | contrat | 197 |
  | solveur | 213 |
  | plugin | 76 |
  | indexeur | 75 |
  | écran | 28 |
  | vecteurs de l'ERC | 27/0 |

- **Comptes :**
  - keystore `ancre-demo` (`0x8107…3c3F`) créé, avec un mot de passe changé ;
  - 15 MON et 20 USDC de testnet ;
  - Alchemy : clé d'API dans `solver/.env`.
- **Site :** https://ancre-xyz.netlify.app (protégé par mot de passe), via `netlify.toml`.
- **Règles et licence :**
  - règles v3.0 résumées dans `docs/ressources/regles-metropolis-v3.md` ;
  - licence MIT, l'ERC restant en CC0 ;
  - commits sous l'adresse perso.
- **Porte P3 (T1) ouverte**, en `exact` comme en `upto`, avec le vrai facilitator.
- **Acte 2 PASS 8/8 :**
  - en fork et sur le **vrai testnet** ;
  - ANCRE `0x8bE6…da9B` et payeur `0xC9Db…5870` = **instance officielle** ;
  - disjoncteur en 1 bloc / 260 ms ;
  - adresses et transactions dans `demo/JUDGES.md`.
- **Front 07-bis** (Discover, Leaderboard, page agent D49/D50, feed, Live demo) et **norme 08-bis** (eipw à 0 erreur) : fusionnés et poussés.
- **Indexeur Envio** (bounty Envio) :
  - redéployé sous `ygk94/ancre-indexerv2` ;
  - endpoint `https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql` ;
  - audit de l'ensemble officiel **CLEAN** (5 certificats).
- **Trésorerie du payeur mainnet :** `0x0146…05B9`.
- **AM-08bis.12 vérifié pour la démo** (10/10) : aucune des 3 ancres de l'instance officielle ne possède d'agent. Pas besoin d'en changer avant le tournage.

## 🔴 Ven 10/10 (aujourd'hui) : ce qui bloque la mise en public

1. [x] **Divulgation : on ne la fait pas** (D57, Hugo, 10/10). Les observations sont publiées comme faits on-chain et expliquées dans la vidéo. Les marqueurs DISCLOSURE-GATE sont retirés.
2. [x] **On garde tout public**, `mustdo/` et `docs/conseil/` compris (D58, 10/10).
3. [ ] **Mainnet : oui** (D59, 10/10).
   - **Envoie 4 MON et environ 1 USDC** (USDC natif du mainnet) sur **`0x810724967b0d895d087b991304385720d4903c3F`**, le keystore `ancre-demo`, **réseau Monad mainnet**.
   - **Donne-moi l'adresse de ton MetaMask principal** : ce sera l'owner du payeur.
   - Un agent prépare le script et le répète sur un fork du mainnet. Tu lanceras le run réel toi-même, dans Terminal.app.
4. [ ] **Webhook Alchemy** (bounty Alchemy, D60 : on le fait, avec une vidéo d'1 min, script dans `docs/soumission/video-alchemy.md`). Le tunnel tourne. Il reste :
   1. je lance le récepteur et un tunnel ;
   2. tu crées le Custom Webhook sur Monad testnet avec le filtre `docs/ressources/alchemy-webhook-testnet.graphql` ;
   3. tu mets le jeton Notify et la clé de signature dans `solver/.env`.

   Si on manque de temps, on abandonne le bounty Alchemy sans dommage pour le reste.
5. [ ] **Relire le README public et le write-up.** Les textes de la plateforme sont dans `docs/soumission/textes-plateforme.txt`.

## 🟠 Sam 11/10 : le tournage et la mise en public

1. [ ] **Rendre le dépôt public**, dès que les points 1 et 2 sont réglés : la règle §7.2 demande un code public « throughout ».
   - Je prépare le **clone filtré** sous ton adresse perso (mailmap, `publication-checklist.md` §4) : il faut installer `git-filter-repo` (`brew install git-filter-repo`).
   - Tu le pousses vers un dépôt public, puis tu retires la protection Netlify.
2. [ ] **Voix et tournage de la vidéo de 3 minutes** : `demo/VIDEO-SHOTS.md`, mis à jour par 07-bis, avec sa checklist d'honnêteté.
   - Elle doit montrer de vraies interactions Monad (§9.4) : le run testnet du 07/10 et les liens vers l'explorateur.
   - Au tournage, ré-exporter l'acte 1 (AM-07.1).
3. [ ] Option : **vidéo Alchemy** de 2 minutes au plus, seulement si le webhook est fait.

## 🟡 Dim 12/10 : la soumission

1. [ ] **Soumission finale**, avec :
   - le profil et le write-up ;
   - le lien vers le code public et la vidéo ;
   - la déclaration des outils IA ;
   - les champs des bounties : Envio, et Alchemy si le webhook est fait. Mera est en pause, donc pas de champ Mera sauf reprise.
2. [ ] **Le surveillant pendant le jugement, du 13 au 27/10** : qui fait tourner le bot de preuves, et avec quels fonds (D27). Pour l'acte 2 la réponse minimale est simple : rien ne tourne, et l'audit Envio reste visible.

## 🧑 À toi seul, quand tu peux

- [ ] **Clause de cession des inventions** de ton contrat de travail (§4.3 des règles). À relire **avant la mise en public**.
- [ ] **Sur l'autre machine** : `git pull`, puis `git config user.email hugo.thomas.perso@gmail.com`.
- [ ] **Régénérer le token Envio** (envio.dev/app/api-tokens) : l'ancien est apparu en clair (AM-03.7).

## En pause ou abandonné

- **Prototype Mera (porte P4)** : en pause depuis le 07/10, branche `chantier/mera-proto` non fusionnée. Sans lui, pas de bounty Mera.
- **Bounty MetaMask** : abandonné, car réservé à la track 01 (D48). Le plugin reste dans le dépôt.

## Décisions en attente, sans effet sur la soumission

- [ ] « **Donate** » sur l'écran : affiché « soon ». Que veux-tu dedans, ou faut-il le retirer ?
- [ ] La lentille « A reader who anchors inside the farm » : la garder dans le sélecteur, ou seulement dans le README ? (07-bis)
- [ ] Les points de la revue laissés au conseil, sans effet sur la démo : A1b, EFF1, G-11 (EOA 7702), liveness des faits, AM-08bis.11 et .12 côté norme.
- [ ] Le repli owner (D44), le mode de l'ensemble (ouvert ou soumetteur attesté), le plugin MetaMask dans la vidéo, et la langue des docs techniques.
- [ ] **Après le 13/10 :** la PR sur ethereum/ERCs avec un fil Magicians dédié, et les contacts ColinkaMir et Kanmani (brouillons dans `docs/erc/drafts/`).

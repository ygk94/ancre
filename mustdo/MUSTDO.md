# MUSTDO — ce que Hugo doit faire lui-même

> **État au 06/10 au soir.** La revue maximale (93 constats) est corrigée et fusionnée sur `main`, et tous les tests passent :
> - contrat 197 ;
> - solveur 213 ;
> - plugin 76 ;
> - indexeur 75 ;
> - démo 8/8 en fork et hors ligne.
>
> Ce fichier ne garde que ce qui reste, **par ordre de priorité dans chaque journée** : un point en haut débloque souvent ceux d'en dessous. L'ancienne version, avec l'historique des décisions, est dans `mustdo/archive/MUSTDO-avant-2026-10-06-soir.md`.
>
> Clôture : **14/10 à 05:59 (Paris)**. **Objectif : soumettre le 12/10.** Version cochable : l'artefact MUSTDO ANCRE. Dis-moi ce qui est fait, je mets à jour.

## 🔴 Maintenant (lun 06/10 au soir) : ce qui bloque le reste

1. [ ] **Autoriser le push de `main`** (42 commits).
   - Ce que ça contient : toutes les corrections de la revue et la démo adaptée.
   - Pourquoi c'est bloquant : sans ce push, l'autre machine et l'acte 2 travaillent sur l'ancien contrat, celui qui a le défaut critique du nœud `address(0)`.
2. [x] **Créer le keystore de démo.** ✅ 06/10 : `~/.foundry/keystores/ancre-demo`, adresse **`0x810724967b0d895d087b991304385720d4903c3F`**. Commande, à taper dans la conversation pilote :
   ```
   ! ~/.foundry/bin/cast wallet new ~/.foundry/keystores ancre-demo
   ```
   - La commande demande un mot de passe et n'affiche que l'adresse.
   - **C'est la graine de tous les comptes de la démo** : ne t'en sers pour rien d'autre.
3. [ ] **Faucet testnet sur `0x810724967b0d895d087b991304385720d4903c3F`**, à faire au fur et à mesure (07/10 : **15 MON ✅**, **20 USDC ✅**) :
   - au moins **15 MON** sur https://faucet.monad.xyz ;
   - **1 USDC** sur https://faucet.circle.com (réseau Monad testnet).
4. [x] **Hébergement et domaine HTTPS.** ✅ 07/10 : **`https://ancre-xyz.netlify.app`** (Netlify, déployé depuis `main` par `netlify.toml`, qui ne publie que `app/dist`).
   - **`rpId` de Mera = `ancre-xyz.netlify.app`**, définitif : ne plus renommer le site.
   - **Protection d'accès Netlify active (401)** : la garder jusqu'à la mise en public.
   - Le webhook Alchemy n'ira **pas** sur Netlify : il doit arriver là où tourne le certificateur (tunnel pour la démo ; hôte du 13 au 27/10 à décider).
6. [x] **Modale « Rules & Guidelines »** ✅ 07/10. Les règles v3.0 sont résumées dans `docs/ressources/regles-metropolis-v3.md` ; elles ajoutent les points 6a et 6b.
6a. [x] **Licence : MIT** ✅ 07/10. Fichier `LICENSE` à la racine, en-têtes SPDX des contrats passés en MIT, README §14 à jour. L'ERC reste en CC0.
6b. [x] **Identité des commits : ton adresse perso** ✅ 07/10.
   - Ce dépôt commite désormais en `Hugo Thomas <hugo.thomas.perso@gmail.com>` (`git config`, valable dans tous les worktrees).
   - **Sur l'autre machine**, tape la même chose : `git config user.email hugo.thomas.perso@gmail.com`.
   - L'historique **public** passera entièrement sous cette identité au moment de la publication : clone filtré avec un mailmap, procédure `docs/soumission/publication-checklist.md` §4, qui garde les dates d'origine. Le dépôt de travail n'est pas réécrit, donc pas de force-push et rien de cassé sur l'autre machine.
   - Ce qui reste à toi seul : relire la clause de cession des inventions de ton contrat (§4.3 des règles).
7. [x] **Compte Alchemy gratuit (D54, D55).** ✅ 07/10 : Monad testnet et Monad mainnet sont activés, et la clé d'API est dans `solver/.env` (ignoré par git, droits 600).
   - Vérifié par `eth_chainId` : le testnet répond `0x279f` (10143) et le mainnet `0x8f` (143).
   - **Reste à faire le 08/10** : le jeton Notify, la clé de signature et l'URL du webhook (voir le point 4 de ce jour-là).

## 🟠 Mar 07/10 : les tests réels sur le testnet

0. [ ] **Divulgation aux auteurs d'ERC-8004 (D29) : tu l'envoies aujourd'hui** (décidé le 07/10). Il faut qu'elle parte avant la mise en public du dépôt.
   - Le dépôt passe public le 12/10, et il décrit le contournement du garde-fou et l'EOA d'upgrade.
   - Brouillon (c) prêt dans `docs/erc/drafts/`. Dis-moi quand c'est parti : je débloque la publication (bloc DISCLOSURE-GATE du README).
1. [x] **Répétition générale de l'acte 2** ✅ 07/10 : `ACT 2 PASS`, 8 scènes sur 8, avec le vrai keystore sur un fork du testnet ; le `--sweep` récupère 2,23 MON.
   - Le contrat corrigé passe déjà en fork : 8/8, mesuré le 06/10.
   - Avant de lancer : `git pull`, puis `cd contracts && forge build`.
   - Commande, qui doit afficher `ACT 2 PASS` :
     ```
     cd demo && npm ci && node run.ts --rehearse-testnet --keystore ~/.foundry/keystores/ancre-demo --sweep
     ```
1b. [x] **Changer le mot de passe du keystore** ✅ 07/10 : il a été tapé par erreur dans la conversation le 07/10. Commande, dans Terminal.app : `~/.foundry/bin/cast wallet change-password ancre-demo`.
2. [x] **Test T1 (porte P3)** ✅ 07/10 : **ouverte, en `exact` comme en `upto`**. Le vrai facilitator a réglé avec la garde à 78 k puis à 190 k, ainsi qu'en `upto` (après correction de notre script), et a refusé l'agent non fiable ainsi que le disjoncteur. Détails dans le CR, « Porte P3 ».
3. [x] **Acte 2 sur le vrai testnet** ✅ 07/10 : `ACT 2 PASS`, 8 scènes sur 8. ANCRE `0x8bE6…da9B`, payeur `0xC9Db…5870` ; disjoncteur à **1 bloc et 260 ms** ; environ 3,3 MON. Adresses et transactions dans `demo/JUDGES.md`.
4. [ ] **Prototype Mera sur tes deux appareils (porte P4).**
   - Appareils : un Mac sous macOS 15 et un iPhone sous iOS 18.4 ou plus, avec le même trousseau iCloud.
   - Il se fait sur le domaine du point 4.
5. [x] **Session 07-bis, la refonte du front** ✅ finie, fusionnée et poussée le 07/10 (Discover, Leaderboard, page agent D49/D50, feed, Live demo). L'écran affiche le **vrai run testnet** (on-chain). À retoucher plus tard si besoin. Lancée le 07/10 (`chantier-07bis-front.txt`, worktree `../ancre-07bis`).
   - **Refonte du front** demandée par Hugo le 07/10.
   - Ce qui reste aussi : D49, le poids effectif d'une revue (à faire en premier), puis D50, la vue du 2ᵉ saut.
   - Le site se met à jour à chaque push sur `main` (`ancre-xyz.netlify.app`).
   - L'écran est déjà adapté au contrat corrigé.
6. [x] **Session 08-bis, la norme** ✅ finie, fusionnée et poussée le 07/10 (texte aligné sur 02-bis, eipw à 0 erreur, vecteurs 27/0, relecture adversariale). Lancée le 07/10 (`chantier-08bis-norme.txt`, worktree `../ancre-08bis`). Elle doit mettre l'ERC à jour avec :
   - les décisions D48 à D56 ;
   - le renommage `passesAnchorPolicy` / `passesPolicy` ;
   - la formule §7.1 (K8, A2b) ;
   - les nouvelles erreurs de 02-bis.

   Prompt : `mustdo/prompts/chantier-08-norme.txt`.

## 🟡 Mer 08/10 (avancé au 07/10) : l'instance officielle du testnet

1. [x] **Instance officielle = celle de l'acte 2** ✅ validée par Hugo le 07/10 : ANCRE `0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B` (bloc 68 978 842), payeur `0xC9Db7a72960189e933a6B876A9359b5c605a5870`. Pas de redéploiement. Le payeur à trois adresses distinctes ne sera nécessaire que pour le mainnet (D40).
2. [x] **Indexeur branché sur cette adresse** ✅ 07/10 (`indexer/config.yaml`, 75 tests verts, poussé).
3. [ ] **Publier et redéployer l'indexeur sur Envio Cloud** : c'est le 2ᵉ des 3 déploiements gratuits, et il embarque aussi le schéma v3.
   - (a) **Régénère ton token Envio** sur envio.dev/app/api-tokens, car l'ancien est apparu en clair (AM-03.7). Si le déploiement Cloud en a besoin, mets le nouveau dans ses variables d'environnement, jamais dans le dépôt.
   - (b) ✅ **Publié et déployé le 07/10** : `ygk94/ancre-indexerv2` est poussé sur `main` et `envio` (d48dbd4), ce qui déclenche le déploiement Cloud (le 2ᵉ des 3). Les tests du clone passent (63 verts).
   - (c) **08/10 : Envio n'a pas pris le push** (l'indexeur est encore rattaché à `hugothomas9`, l'ancien nom du compte GitHub). Crée un **nouvel indexeur** sur `ygk94/ancre-indexerv2`, branche `envio`. **Attends qu'il soit « synced » avant de supprimer l'ancien** (`6107d0a`). Puis donne-moi la **nouvelle URL GraphQL**.
   - Ancien texte : vérifier « synced » sur envio.dev/app, puis me donner la nouvelle URL GraphQL. L'ancienne (`…/433cc83/…`) sert encore l'ancien schéma, et je mettrai à jour l'écran, le README et la CI de keepalive.
4. [ ] **Webhook Alchemy** (après le point 3) :
   - Crée un Custom Webhook sur Monad testnet, sur `0x8bE6…da9B` et sur le registre de réputation `0x8004B663…`.
   - Mets le jeton Notify et la clé de signature dans `solver/.env`.
   - L'URL du webhook est un tunnel vers le certificateur ; je te donne la commande.

## Jeu 09/10 : le mainnet et le dépôt public

0. [x] **Adresses du payeur mainnet (D40)** ✅ 08/10 :
   - **trésorerie** = `0x0146082951DE0C4d09fca1e1277ACa8963a305B9` (2ᵉ compte MetaMask de Hugo, réception seule) ;
   - **opérateur** = le keystore `ancre-demo` (`0x8107…3c3F`), qui signe les paiements ;
   - **owner** = ton compte MetaMask principal, le seul qui pourra forcer un paiement (D47). **Donne-moi son adresse** le jour du déploiement mainnet.

1. [ ] **Valider le budget mainnet** (environ 2 MON, ESTIMÉ), puis l'exécution minimale (D40).
2. [ ] **Décider ce qui reste privé.** Candidats : `mustdo/` et `docs/conseil/`. Liste : chantier 09.
   - **L'historique part avec le dépôt, et il est obligatoire (§4.1).** Retirer un fichier ne l'efface donc pas des anciens commits.
   - Garde en tête la règle §5.3 : rien de confidentiel dans la soumission.

## Ven 10/10 : la relecture

1. [ ] **Relire le README public et le write-up.** Les textes de la plateforme sont dans `docs/soumission/textes-plateforme.txt`.

## Sam 11/10 : le tournage

1. [ ] **Voix et tournage de la vidéo de 3 minutes** : `demo/VIDEO-SHOTS.md`, et sa checklist d'honnêteté. Au tournage, ré-exporter l'acte 1 (AM-07.1).
2. [ ] Option : **vidéo Alchemy** de 2 minutes au plus.
3. [ ] **Rendre le dépôt public**, seulement après la divulgation ou le retrait des passages sensibles.
   - La règle §7.2 demande un code public « **throughout** and after the Hackathon ». Plus tôt vaut donc mieux que le 12/10.
   - Il faut d'abord régler la divulgation, la licence (6a) et ton contrat de travail (6b).

## Dim 12/10 : la soumission

1. [ ] **Soumission finale**, avec :
   - le profil et le write-up ;
   - le lien vers le code et la vidéo ;
   - la déclaration des outils IA ;
   - les champs des bounties Envio, Mera et Alchemy.

   Le lundi 13/10 sert de marge.
2. [ ] **Prévoir le surveillant pendant le jugement, du 13 au 27/10** : qui fait tourner le bot de preuves, et avec quels fonds (D27).

## Décisions en attente, quand tu peux (aucune ne bloque la démo)

- [ ] **Points de la revue laissés au conseil.** Détail dans le CR, section « Revue maximale du 06/10 » :
  - A1b, la zone de transit D23 ;
  - EFF1, la fenêtre `scanMax` ;
  - les comptes 7702 sur un ensemble ouvert (G-11) ;
  - la liveness des faits ;
  - l'ancre 0x794c du vecteur `mainnet_slash_anchor`.
- [ ] **Activer le repli owner (D44) ?** Il est prêt, sans effet mesuré sur la démo.
- [ ] **Ensemble de démo ouvert, ou avec soumetteur attesté ?**
  - Sur un ensemble ouvert, une dilution reste possible (AM-INT.1) : il faut un surveillant actif.
  - Avec un soumetteur attesté, il faut quelqu'un pour payer les preuves.
  - À confirmer aussi : `minRefresh = maxAge`.
- [ ] **Le plugin MetaMask dans la vidéo ?**
  - Il est hors bounty, mais ses 18 constats sont corrigés (76 tests).
  - Deux options : 6 secondes au plus dans la vidéo, ou seulement dans le README.
- [ ] **Langue des docs techniques.** FORMAT.md et ENCODING.md sont en anglais, alors que CLAUDE.md dit « le reste en français ».
- [ ] **Contacter ColinkaMir ? Kanmani ?** Le brouillon pour ColinkaMir est prêt dans `docs/erc/drafts/`.
- [ ] **Quand ouvrir la PR sur ethereum/ERCs ?** Recommandé : après le 13/10, avec un fil Magicians dédié et les auteurs désignés.

## Déjà fait

- Projet créé sur la plateforme, avec le lien du dépôt (privé) dans l'inscription. Track 04 ; bounties Envio, Mera et Alchemy.
- Bounty MetaMask abandonné (réservé à la track 01) ; le plugin est gardé hors bounty.
- Indexeur : 3ᵉ chaîne = Optimism ; dépôt `ancre-indexer` en MIT.
- GitHub renommé en `ygk94`.
- Chantiers livrés et fusionnés : 02, 02-bis, 03, 04, 04-bis, 05, 06, 07, 08 et 09.
- Revue maximale : corrigée et fusionnée.

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
3. [ ] **Faucet testnet sur `0x810724967b0d895d087b991304385720d4903c3F`** (solde au 06/10 : 0 MON, 0 USDC) :
   - au moins **15 MON** sur https://faucet.monad.xyz ;
   - **1 USDC** sur https://faucet.circle.com (réseau Monad testnet).
4. [ ] **Choisir l'hébergement et le domaine HTTPS, une seule fois.**
   - Ce même domaine sert l'écran, le `rpId` de Mera (définitif : les passkeys y sont liés) et l'URL des webhooks Alchemy.
   - Netlify est recommandé : gratuit, et il marche avec un dépôt privé.
   - Donne-moi le nom d'hôte.
5. [ ] **Trancher la divulgation aux auteurs d'ERC-8004 (D29).**
   - Le dépôt passe public le 12/10, et il décrit le contournement du garde-fou et l'EOA d'upgrade.
   - Deux options : envoyer le brouillon (c) de `docs/erc/drafts/` avant le 12/10 (recommandé), ou retirer ces passages de la version publique.
6. [ ] **Me recopier la modale « Rules & Guidelines »** de la plateforme. Elle tranche quatre points : dépôt public obligatoire ou non, durée de la vidéo, déclaration des outils IA, critères.
7. [ ] **Compte Alchemy gratuit (D54, D55).** Mets ces trois éléments dans `solver/.env`, jamais dans le dépôt :
   - la **clé d'API** ;
   - le **jeton Notify** et la clé de signature du webhook ;
   - l'**URL HTTPS publique** (sur le domaine du point 4).

## 🟠 Mar 07/10 : les tests réels sur le testnet

1. [ ] **Répéter l'acte 2 sur fork, sans aucune transaction réelle.**
   - Le contrat corrigé passe déjà en fork : 8/8, mesuré le 06/10.
   - Avant de lancer : `git pull`, puis `cd contracts && forge build`.
   - Commande, qui doit afficher `ACT 2 PASS` :
     ```
     cd demo && npm ci && node run.ts --rehearse-testnet --keystore ~/.foundry/keystores/ancre-demo --sweep
     ```
2. [ ] **Feu vert au test T1, celui du facilitator x402 (porte P3).**
   - Coût : environ 0,40 MON de testnet pour nous.
   - Il décide si le facilitator accepte le payeur ERC-1271. S'il le refuse, les paiements honnêtes de l'acte 2 s'arrêtent.
3. [ ] **Acte 2 sur le vrai testnet**, après la répétition, T1 et ton feu vert. Commande :
   ```
   node run.ts --network testnet --keystore ~/.foundry/keystores/ancre-demo --sweep
   ```
   - Coût :
     - environ 3,15 MON de frais (4,1 avec la marge) ;
     - 2,25 MON prêtés, dont 0,8 récupérés ;
     - 0,11 USDC ;
     - 3 à 5 minutes.
   - Pour ce run seulement, le payeur a owner = trésorerie = opérateur. C'est acceptable pour 0,1 USDC de testnet.
   - Si T1 échoue : on filme sur le fork ou sur l'état figé (`node run.ts --frozen`).
   - Donne-moi le résultat ensuite : les adresses vont dans `demo/JUDGES.md`.
4. [ ] **Prototype Mera sur tes deux appareils (porte P4).**
   - Appareils : un Mac sous macOS 15 et un iPhone sous iOS 18.4 ou plus, avec le même trousseau iCloud.
   - Il se fait sur le domaine du point 4.
5. [ ] **Relancer une session pour l'écran (chantier 07).**
   - Ce qui reste : D49, le poids effectif d'une revue (à faire en premier), puis D50, la vue du 2ᵉ saut.
   - L'écran est déjà adapté au contrat corrigé.
6. [ ] **Relancer une session pour la norme (chantier 08).** Elle doit mettre l'ERC à jour avec :
   - les décisions D48 à D56 ;
   - le renommage `passesAnchorPolicy` / `passesPolicy` ;
   - la formule §7.1 (K8, A2b) ;
   - les nouvelles erreurs de 02-bis.

   Prompt : `mustdo/prompts/chantier-08-norme.txt`.

## 🟡 Mer 08/10 : le déploiement persistant sur le testnet

1. [ ] **Choisir les trois adresses du payeur : owner, trésorerie, opérateur, toutes distinctes.**
   - Pourquoi distinctes : la revue a montré qu'une trésorerie aussi opératrice vide le payeur en une transaction.
   - L'owner est **le seul qui pourra signer un override (D47)**. Ce doit être un compte de ton extension MetaMask, distinct du wallet de l'agent, et sans délégation EIP-7702.
2. [ ] **Autoriser le déploiement du contrat sur le testnet** : environ 0,9 MON de testnet.
3. [ ] **Brancher et redéployer l'indexeur Envio**, juste après le déploiement :
   1. Donne-moi l'adresse du contrat et son bloc de déploiement.
   2. Fais pointer ton clone vers le bon dépôt :
      ```
      git -C <clone> remote set-url origin https://github.com/ygk94/ancre-indexer.git
      ```
   3. **Utilise un nouveau token Envio** : l'ancien est apparu en clair (AM-03.7).
   4. Publie et redéploie :
      ```
      cd indexer && scripts/publish.sh <clone> --deploy
      ```
      Ce déploiement embarque aussi le **nouveau schéma v3** de la revue : l'endpoint actuel ne marche plus avec le solveur. C'est le **2ᵉ des 3 déploiements gratuits**.
   5. Vérifie « synced » sur envio.dev/app, puis donne-moi l'URL GraphQL.

## Jeu 09/10 : le mainnet et le dépôt public

1. [ ] **Valider le budget mainnet** (environ 2 MON, ESTIMÉ), puis l'exécution minimale (D40).
2. [ ] **Licence du code** : MIT ou Apache-2.0, à la place de CC0, qui n'est pas une licence OSI. L'ERC reste en CC0.
3. [ ] **Décider ce qui reste privé** : `mustdo/`, `docs/conseil/`, l'historique git (emails, chemins machine). Liste : chantier 09.

## Ven 10/10 : la relecture

1. [ ] **Relire le README public et le write-up.** Les textes de la plateforme sont dans `docs/soumission/textes-plateforme.txt`.

## Sam 11/10 : le tournage

1. [ ] **Voix et tournage de la vidéo de 3 minutes** : `demo/VIDEO-SHOTS.md`, et sa checklist d'honnêteté. Au tournage, ré-exporter l'acte 1 (AM-07.1).
2. [ ] Option : **vidéo Alchemy** de 2 minutes au plus.
3. [ ] **Rendre le dépôt public**, seulement après la divulgation ou le retrait des passages sensibles.

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

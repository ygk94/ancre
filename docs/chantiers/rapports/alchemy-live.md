# Chantier « Alchemy live » — rapport (2026-10-10)

> Bounty Alchemy (D55, D60). Branche `worktree-agent-a4f5df43579a8f8d1`, non poussée. Aucune transaction réelle,
> aucun déploiement. Doc pour le jury (anglais) : `docs/ressources/alchemy-integration.md`.

## 1. Livré

**T1 — Webhook → recertification sur l'instance officielle du testnet**
- `solver/alchemy_hook.py serve` rafraîchit les données à chaque événement pertinent : il attend que la tête de
  l'**indexeur Envio** atteigne le bloc de l'événement (borné, `--indexer-wait`, 60 s), exporte le registre à cette
  tête (`from_indexer.export`, mêmes fichiers et mêmes règles que l'export vérifié en parité), puis
  `Certifier.run_once`. L'ancien mode `--data DIR` (export figé, toujours `data_behind`) reste disponible.
- **Choix Envio plutôt que le RPC Alchemy pour les données**, justifié par une mesure : l'offre gratuite d'Alchemy
  limite `eth_getLogs` à **10 blocs par appel** (MESURÉ 10/10, erreur -32600 sur `monad-testnet.g.alchemy.com`) et le
  registre n'a pas d'index par client ; reconstruire le graphe exigerait tout l'historique. L'export Envio du
  testnet entier prend **≈ 2 s** (MESURÉ 10/10 : 2 349 avis, 2 107 agents). Répartition des rôles : Envio =
  l'historique et l'audit, Alchemy = le déclencheur et tout l'accès chaîne du certificateur (table des nœuds,
  certificat, `eth_estimateGas`, envoi).
- **Mode sec = « préparé »** : `run_once(prepare=True)` fait tout ce que fait un envoi réel (relit la table et le
  certificat on-chain, aligne, règle de remplacement, contrôle du soumetteur, `eth_estimateGas` depuis le
  propriétaire du set) puis s'arrête : action `prepared`, rien n'est signé. `--send` exige `--from`, `--keystore`
  et `--password-env` (jamais de repli silencieux).
- `--rpc alchemy` construit l'URL Alchemy avec `ALCHEMY_API_KEY` du `.env` ; l'URL à clé passe à `cast` par
  `ETH_RPC_URL` dans l'environnement du processus fils (jamais dans `ps`), et le journal comme la console sont
  expurgés (test dédié). `ANCRE_ENV=<chemin>` permet de lire le `.env` d'un autre checkout sans le copier.
- **Horodatages** : nouvelle action de journal `timeline` (bloc de l'événement et son horodatage, réception du
  webhook en ms, tête à la réception, état de commit, tête de l'indexeur, attente, durée d'export, certificat
  préparé ou soumis, bloc de la transaction, écarts en blocs et en ms) et **une ligne console lisible par étape**
  pour la vidéo (`LiveJournal`).
- `solver/sets/testnet-official.json` : la config de l'ensemble officiel (dérivée de l'état du run du 07/10 ;
  setId recalculé = `0x627c…3e10`, vérifié par test).
- `watcher.py` : un audit propre ne balaye plus les logs de preuves depuis le bloc du certificat (sur un RPC à
  10 blocs par `eth_getLogs`, c'était ~10⁵ appels pour un vieux certificat ; constaté pendant l'essai).
- `demo/trigger.ts` : le déclencheur de la vidéo (écrit, **non exécuté**) : anchor-A vouche 90 pour provider-3
  (#2052). Sec par défaut (simule par `eth_estimateGas`), `--send` réel avec phrase de confirmation tapée.
- Tests : `solver/tests/test_alchemy_live.py` (10 tests, fixtures réelles du testnet). **Solveur : 222 passés,
  1 ignoré** (213 avant + 10 nouveaux).

**T2 — Transfers API dans l'écran**
- `solver/funders.py` (le script manquant du README) : `alchemy_getAssetTransfers` (external, depuis le bloc 0,
  ordre croissant, maxCount 1) pour le premier MON reçu par chaque noteur d'Eve-8004, `ownerOf(182)` lu en direct.
  Reprise sur coupure (cache ignoré par git), attente sur 429. Sorties commitées :
  `solver/out/alchemy-funders-182-sample.json` (150 noteurs tirés au hasard, graine 20261010), copié en version
  allégée dans `app/src/data/funders-182.json`. Le balayage complet (`--all`) a été **interrompu** à 1 135 / 7 665
  (Free tier : 1 à 4 appels/s, 429 au-delà, MESURÉ) ; il reprend là où il s'est arrêté (voir §3.5).
- Fonction Netlify `app/netlify/functions/funders.mts` (`/api/funders?address=0x…`) : clé lue dans les variables
  d'environnement Netlify, **un seul paramètre** validé, requête amont fixe, réponse à cinq champs, cache 10 min en
  instance + 1 h au CDN, erreurs amont jamais renvoyées telles quelles. `netlify.toml` : section `[functions]`.
- Panneau « Who funded the raters? » sur la page agent (mainnet, #182 ; générique par table `MEASURES`) : la mesure
  commitée (source « Alchemy Transfers API », date, graine) + re-vérification en direct de 6 noteurs via la
  fonction ; sans fonction (dev local, clé absente), le panneau le dit et n'affiche que la mesure commitée. Phrase
  explicite : ANCRE n'utilise pas ces transferts pour la masse. Aucune accusation.
- `npx tsc -b`, `npm run build`, `npm test` verts : **43 tests** (dont 13 nouveaux : liste blanche, parsing,
  fonction avec `fetch` simulé, clé absente de la réponse, repli, rendu du panneau). Clé absente de `app/dist`
  (vérifié par grep).

**T3 — Doc** : `docs/ressources/alchemy-integration.md` (anglais, schéma ASCII, mesures datées, commandes) ;
section Alchemy de `docs/soumission/textes-plateforme.txt` mise à jour ; ligne 55 du README corrigée.

## 2. Mesures (toutes du 10/10)

| Mesure | Valeur | Statut |
|---|---|---|
| Rejeu signé de 3 charges utiles reconstruites depuis de vrais logs du testnet (68 979 070 → 68 979 110) vers un récepteur local (port 8797), en sec | 3 × 200 ; les mêmes avec une mauvaise clé : 3 × 401 | MESURÉ |
| Réception du webhook → certificat **préparé** (export Envio + recalcul + `eth_estimateGas` via Alchemy) | **3,6 s** (3 587,6 ms ; export 1,97 s) | MESURÉ, `docs/chantiers/rapports/alchemy-live/e2e-replay-20261010.*` |
| Certificat recalculé vs certificat on-chain | même `graphRoot` `0xc370…abb2` et même `vectorRoot` | MESURÉ |
| `eth_estimateGas` de `submitCertificate` | 560 952 gas, limite 608 024 (≈ 0,062 MON à 102 gwei) | MESURÉ |
| Retard de l'indexeur Envio sur la tête du testnet | 0 à 95 blocs (5 lectures) | MESURÉ |
| Certificat officiel | bloc 68 979 094, âge > 836 000 blocs > maxAge 288 000 : **périmé**, toute recertification sera soumise | MESURÉ |
| Déclencheur : `giveFeedback` d'anchor-A | `eth_estimateGas` 278 436 à 102 gwei ; solde d'anchor-A 0,00042 MON (balayé le 07/10) : `--send` l'approvisionne d'abord de 0,1 MON depuis l'opérateur (16,27 MON) | MESURÉ |
| Transfers API, Eve-8004, échantillon aléatoire de 150 (graine 20261010) | **150 / 150** premiers MON venus de `0x97cD…0996` = `ownerOf(182)`, **150 × 11,0 MON** | MESURÉ (52 s) |
| Transfers API, balayage complet interrompu (1 135 premiers noteurs par adresse, pas un échantillon) | 1 135 / 1 135 du même financeur ; 1 134 × 11,0 MON et **1 × 0,165 MON** : « toujours 11,0 » ne vaut que pour l'échantillon | MESURÉ, partiel, non publié comme total |
| Délai bloc on-chain → webhook, état de commit à l'envoi, webhook → certificat **soumis** | journalisés par la ligne `TIMELINE` au premier vrai événement | **NON MESURÉ** |

## 3. Commandes pour Hugo

**État constaté** : le tunnel `cloudflared` tourne (`http://127.0.0.1:8787`, URL publique dans
`solver/out/alchemy/tunnel.log`), mais **aucun récepteur n'écoute sur 8787** : `solver/out/alchemy/serve.log` montre
que le `serve` précédent s'est arrêté au démarrage (« ALCHEMY_SIGNING_KEY missing » ; la clé est présente dans
`.env` depuis). Rien n'a été tué ni lancé sur 8787.

0. Fusionner la branche, puis vérifier dans le tableau de bord Alchemy que l'URL du webhook testnet est bien
   `https://<URL du tunnel>/alchemy` (l'URL `trycloudflare.com` change à chaque redémarrage du tunnel).

1. **Récepteur sur l'instance officielle, envois réels** (terminal 1, depuis `solver/`) :
   ```bash
   cd /Users/hugo/Projet/ancre/solver
   read -s ANCRE_DEMO_PASSWORD && export ANCRE_DEMO_PASSWORD
   .venv/bin/python -u alchemy_hook.py serve --port 8787 --chain 10143 --rpc alchemy --ancre 0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B --set-config sets/testnet-official.json --set-id 0x627c8afe36b03432b280723a7170357333ded4d9ce56a78467c5829739653e10 --indexer https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql --data-dir out/alchemy-live/data --state out/alchemy-live/certifier_state.json --journal out/alchemy-live/alchemy.jsonl --send --from 0x810724967b0d895d087b991304385720d4903c3F --keystore ~/.foundry/keystores/ancre-demo --password-env ANCRE_DEMO_PASSWORD
   ```
   (Sans les quatre dernières options : même chose en sec, `PREPARED`.)

2. **Déclencheur pendant le tournage** (terminal 2, depuis `demo/`) :
   ```bash
   cd /Users/hugo/Projet/ancre/demo
   node trigger.ts                                                    # sec : vérifie, n'envoie rien
   node trigger.ts --send --keystore ~/.foundry/keystores/ancre-demo  # RÉEL : phrase + mot de passe
   ```
   Le premier `--send` envoie d'abord 0,1 MON à anchor-A (transfert sans log : pas de webhook), puis le
   `giveFeedback`. Pour un plan propre, faire un premier `--send` hors caméra n'est pas nécessaire : l'approvisionnement
   ne déclenche rien côté récepteur.

3. **Ce que le terminal 1 affiche** (format réel de l'essai) :
   ```
   13:51:19.710  Alchemy webhook  NewFeedback  block …  signature OK  notFinalized  head … (+k blocks)
   13:51:21.733  Envio indexer at block … (waited … ms): … feedbacks exported in … ms
   …             certificate SUBMITTED: 7 nodes, 7 rows, mass …  tx 0x…  block …
   …             TIMELINE  event block N -> webhook at head +k blocks (… s after the block timestamp) -> certificate in block M (+d blocks, … ms after the webhook)
   …             Alchemy webhook  CertificateSubmitted  block M  signature OK
   …             watcher audit of certificate tx 0x…: CLEAN
   ```
   Recopier ensuite les valeurs de la ligne `TIMELINE` (journal `out/alchemy-live/alchemy.jsonl`, action
   `timeline`) dans `docs/ressources/alchemy-integration.md` §2 et dans `textes-plateforme.txt` (⟦CHECK⟧ restants).

4. **Netlify** : *Site configuration → Environment variables → Add a variable* : clé `ALCHEMY_API_KEY`, valeur =
   la clé de l'app Alchemy (la même que `solver/.env`), portée « Functions » (au moins), tous les contextes de
   déploiement. Puis redéployer (« Trigger deploy »). Vérifier :
   `curl -s "https://<site>/api/funders?address=0x006fec3115243f18c3220af299b091915c22a4e0"` → JSON avec
   `"from": "0x97cd…0996"`. Sans la variable : HTTP 503 `not configured`, et le panneau affiche « live re-check
   unavailable » avec la seule mesure commitée.

5. **Facultatif, balayage complet de la Transfers API** (≈ 1 h 30 à 2 h sur l'offre gratuite ; reprend sur coupure) :
   ```bash
   cd /Users/hugo/Projet/ancre/solver
   .venv/bin/python funders.py --all --workers 3 --app-out ../app/src/data/funders-182.json
   ```
   Le cache des 1 135 premiers noteurs est dans le worktree
   (`.claude/worktrees/agent-a4f5df43579a8f8d1/solver/out/.funders-182.cache.jsonl`, ignoré par git) : le copier dans
   `solver/out/` évite de les redemander. Le panneau et le test du panneau acceptent les deux formats (échantillon
   ou complet). Si 7 665 / 7 665 sort, mettre à jour README l.55, `alchemy-integration.md` §3 et
   `textes-plateforme.txt`, sans écrire « toujours 11,0 MON » (au moins un noteur a reçu 0,165 MON).

## 4. Limites

- **Le délai réel bloc → webhook et l'état de commit à l'envoi ne sont pas mesurés** : il faut le vrai webhook
  (tunnel + récepteur de Hugo). Le rejeu mesure tout le reste de la chaîne ; il ne mesure pas Alchemy.
- Le délai webhook → certificat soumis dépend de l'inclusion de la transaction (non mesuré ; le préparé est à 3,6 s).
- L'indexeur Envio peut être en retard : mesuré jusqu'à 95 blocs (~30 s). Le récepteur attend jusqu'à
  `--indexer-wait` (60 s) puis journalise `data_behind` ; le sondeur de repli retente.
- Le sondeur de repli passe par Alchemy à 10 blocs par `eth_getLogs` : ≈ 90 requêtes par tour de 30 s (≈ 100 blocs).
  Acceptable pour la démo ; pour la période de jugement, `--poll-interval` plus long ou un RPC sans cette limite.
- La Transfers API ne voit que les transferts `external` : un MON reçu par appel interne apparaîtrait « no external
  MON transfer » (aucun cas dans la mesure).
- `demo/trigger.ts --send` n'a pas été exécuté (consigne) ; le mode sec a été exécuté (simulation OK).
- Le routage `/api/funders` avant la redirection SPA `/*` de `netlify.toml` est le comportement documenté des
  fonctions à `path` (DOC) mais **NON VÉRIFIÉ** sur le site : à contrôler par le `curl` du §3.4.
- Le certificat officiel est périmé depuis le ~08/10 : tant qu'aucune recertification n'est soumise, `isTrusted`
  refuse sur l'instance officielle. Le premier événement pertinent avec `--send` le remet à jour pour ~24 h.

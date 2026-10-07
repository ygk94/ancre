# Journal du chantier 07-bis : refonte du front

> Une entrée par étape terminée (ou par blocage), la plus récente en bas. Format : date/heure, étape, fait, décisions et raisons, AM-07bis.n, blocages, prochaine étape.
> Statuts des chiffres : MESURÉ (commande, date), DOC, CALCULÉ, ENREGISTRÉ (journal du 06), CITÉ (tiers daté), ESTIMÉ, NON VÉRIFIÉ.

---

## 2026-10-07 — Démarrage : ce que j'ai compris, mon plan d'écrans

**Machine** `/Users/hugo`, worktree `/Users/hugo/Projet/ancre-07bis`, branche `chantier/07bis-front` (tête `58ef3af`). Node v24.21.0 (`/usr/local/bin`). Chrome système pour les captures (Playwright 1.59 dans mon scratchpad, `executablePath` = Chrome).

**Lu** : CLAUDE.md, ANCRE.md, rapport et journal 07, `demo/SCREEN.md`, `demo/VIDEO-SHOTS.md`, CR D47 à D56 et la revue maximale du 06/10, règles v3 (§9.4), `app/` en entier, `indexer/schema.graphql`, `demo/lib/ancre.ts`.

**Ce que je retiens**
1. L'écran 07 met deux colonnes « explorer / contract » côte à côte, avec des chiffres héros de 48 px et 4 tuiles par colonne, plus des badges et des citations. C'est ce que Hugo trouve trop gros et trop chargé. La refonte garde **les mêmes sources** (aucun nouveau calcul inventé) et change la mise en scène.
2. **Sources disponibles, MESURÉ le 07/10** (`curl` sur l'endpoint Envio de `config/networks.ts`) :
   - Envio répond pour 143, 10143 et 10. Têtes : 143 au bloc 111 295 885 (10 310 agents, 9 291 avis, 117 hors bornes, 78 auto-notations), 10143 au bloc 68 942 340 (2 043 agents, 2 094 avis, 1 révoqué).
   - **L'endpoint déployé est antérieur au schéma v3** : `Certificate`, `Discrepancy`, `SetHealth` et `SetNode` n'existent pas (« field 'Certificate' not found »). Il sert `Feedback`, `Agent`, `OwnerChange` (mint = Registered, transferts), `WalletChange`, `SetEdge` (ensemble `ref`, avec la raison de rejet), `ChainStats`. → Le feed lit ces entités ; nos propres events (certificat, preuve, veto) viendront d'Envio une fois l'indexeur redéployé sur l'adresse du contrat (INTERFACE), et en attendant du journal du 06, étiquetés comme tels.
   - `Agent.uri` est souvent un `data:application/json;base64,…` : le nom de l'agent se décode dans le navigateur, sans appeler 8004scan.
   - Nouveau run du 06 dans `demo/sample/run-fork.json` (`run-20261006T121308Z`, 121 événements, 8 scènes **dont la scène 7 « second hop »**, θ = 1 % conforme à D56). Les runs de `app/public/runs/` datent d'avant (6 scènes, θ = 2 %). → Je synchronise ce run.
3. **Piège** (AM-07bis.1) : les agents du run sont sur un **fork** du testnet. Leurs numéros (#2022 à #2035) existent aussi sur le vrai testnet, mais ce sont d'autres agents. **Ne jamais croiser un agent du run avec Envio 10143.** Le jour où l'acte 2 tourne sur le vrai testnet, le croisement devient légitime (mode `testnet` dans l'en-tête).
4. **8004scan** (capture headless de `8004scan.io/agents/bsc/365534`, `rapports/07bis/ref-8004scan-agent.png`) : carte d'identité (chaîne, nom, statut, `Agent #`, owner, dates, score à droite), puis onglets Overview / Services / Statistics / Quality / Feedback / Metadata, colonne principale et panneau latéral « Score breakdown » + « Basic Information ». Son menu : *Mainnet* (réseau), Agents, Networks, Leaderboard, **Donate**, Builder Hub. **Donate** est une page de don x402 en USDC (Base et X Layer), wallet de l'utilisateur.

**Plan d'écrans** (thème clair et sombre, 1080p et iPhone)

```
┌ ANCRE ─ Discover · Leaderboard · Live demo · Donate(?) ──────── [Network: Monad testnet ▾] [◐] ┐
│ FEED (gauche, 320 px)        │ DISCOVER (droite)                                                 │
│ Latest ERC-8004 activity     │ Agents that pass your anchor policy                               │
│ ● live via Envio · 10143     │ anchors: A, B, C · m=2 · θ=1 % · Registry-verified   [change ▾]   │
│ ───────────────────────────  │ ┌──────────────┬──────────┬────────┬─────────┬──────────────┐     │
│ ★ NewFeedback  #2022  +80    │ │ agent        │ status   │ mass   │ distrust│ reach        │     │
│   vouch · 0x7b10… · 2 blk    │ │ provider-1   │ ✓ PASSES │ 3.95 % │ 0       │ ⚓ 2 anchors  │     │
│ ⛨ Registered #2043           │ │ provider-3   │ ✓ PASSES │ 2.30 % │ 0       │ 2 hops       │     │
│ ⟲ FeedbackRevoked #1762      │ │ provider-2   │ ⛔ VETOED │ 3.05 % │ …       │ slash        │     │
│ ◆ certificate (run log)      │ │ farm target  │ ✕ 0      │ 0      │ 0       │ unreachable  │     │
│ …                            │ └──────────────┴──────────┴────────┴─────────┴──────────────┘     │
│ (mobile : le feed passe      │ ▸ The contrast: naive avg 100 on the explorer · 0 here (1 ligne)  │
│  sous Discover, replié)      │ ▸ How to read this (repliable)                                    │
└──────────────────────────────┴────────────────────────────────────────────────────────────────────┘

PAGE AGENT (clic sur une ligne du feed ou de Discover)
┌ ← Back ───────────────────────────────────────────────────────────────────────────────┐
│ [id] provider-3 #2024 · Monad testnet · owner 0x3b83… · wallet 0x06b8…   ✓ PASSES     │
│       view on 8004scan ↗                                     policy θ 1 % · m 2        │
│ Overview · Reviews (D49) · Trust path (D50) · Certificates · Payments                  │
│ ┌ main ─────────────────────────────────────┐ ┌ side ────────────────────────────┐    │
│ │ Overview: verdict + 1 phrase              │ │ Anchor policy (setId, θ, ρ, m,   │    │
│ │ trustLow / trustRobust / trust / distrust │ │ anchors, level)                  │    │
│ │ e, certBlock (rangée sobre, 16 px)        │ │ Identity (id, owner, wallet)     │    │
│ │ Reviews: chaque avis → poids effectif     │ │ Sources (une ligne par chiffre)  │    │
│ │  "counts" / "counts for 0: author not     │ └──────────────────────────────────┘    │
│ │  reachable" / "rejected: out of bounds"   │                                          │
│ │ Trust path: ⚓A ⚓B → provider-1 → p-3     │                                          │
│ └───────────────────────────────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Typo : 14-15 px le texte, 13 px les légendes, titres 18-22 px, chiffres en 15-16 px tabulaires. **Pas de chiffre géant**. Une seule information principale par bloc : le verdict.
- Routes (History API, la redirection SPA de `netlify.toml` les sert déjà) : `/` Discover, `/leaderboard`, `/agent/:network/:id`, `/live` (l'acte 2), `/donate` selon ta réponse, et `/mera` réservée pour plus tard. Les anciens `?act=1` / `?act=2` restent redirigés.
- Feed : Envio (`Feedback` récents, révocations, `OwnerChange` mint/transfert, `WalletChange`), sondé toutes les 5 s, plus le WebSocket public `monadLogs`/`eth_subscribe logs` sur les deux registres pour le temps réel (aucune clé). Alchemy : clé serveur seulement, donc pas dans ce front statique ; une fonction Netlify serait possible (INTERFACE).
- Données Discover : testnet = le run du 06 (ENREGISTRÉ, fork du testnet tant que le run testnet n'a pas eu lieu, et l'écran le dit) ; lecture `assess()` en direct dès qu'une adresse persistante du contrat est configurée (`VITE_ANCRE_TESTNET`, `VITE_SET_TESTNET`). Mainnet = solveur de référence (CALCULÉ, jamais « certified »).

**Questions posées à Hugo** (🧑) : sens de « Donation » ; tension testnet/mainnet (ma proposition : mainnet sélectionnable en « preview · solver analysis, not certified on-chain »).

**Prochaine étape** : socle (routes, en-tête, thèmes, sélecteur de réseau), puis feed, puis Discover.

---

## 2026-10-07 12:40 — Étape 1 : refonte livrée (Discover, Leaderboard, page agent, feed, Live demo) — ✅ avant revue

**Réponses de Hugo (07/10)** : *Donate* = onglet « soon » désactivé (aucun wallet, aucune transaction) ; *réseau* = mainnet sélectionnable en « preview » (« read by our reference solver · on-chain certification soon »), testnet actif par défaut, Ethereum « soon ».

**Fait**
- Routes History API : `/` Discover, `/leaderboard`, `/agent/{testnet|mainnet|demo}/:id?tab=…`, `/live`, `/donate` (soon). `?network=mainnet&anchors=<lentille>`. Les anciens `?act=1` / `?act=2` sont réécrits. `/mera` tombe sur « Not found » côté SPA, mais un futur `public/mera/index.html` passe avant la redirection de `netlify.toml` (fichier existant servi en priorité). `vite base` passe de `./` à `/` (obligatoire pour des routes profondes), surchargeable par `ANCRE_BASE`.
- **Feed** (gauche) : onglet « ERC-8004 registry » = Envio (`Feedback`, révocations, `OwnerChange` mint/transfert, sondé toutes les 8 s) + WebSocket public `eth_subscribe logs` sur les deux registres (ligne provisoire « ● », remplacée par la ligne Envio de même clé). Onglet « ANCRE » = certificats, certificat fabriqué rejeté, veto d'ancre, décisions du payeur, tirés du run enregistré. Aucune clé d'API dans le bundle.
- **Discover** : « Pass » (statut, masse leave-one-out, méfiance, « reached from your anchors ») puis « Most rated, refused » (avis du registre et moyenne naïve en gris, masse ANCRE, raison). Une ligne de provenance (RECORDED / COMPUTED), le reste dans « How to read this ».
- **Page agent** calquée sur 8004scan (carte d'identité, onglets, panneau latéral) : Overview (jauge θ, masses, e, bloc du certificat, contraste registre / ANCRE en une rangée), **Ratings = D49**, **Trust path = D50**, Certificates, Payments (decide / explain ; « only a human can override, from their own wallet (D47) », aucun bouton). Lien « view on 8004scan » pour les vrais agents seulement.
- **Live demo** : l'acte 2, même réducteur, finalité et relecture `assess()` / `decide()` inchangées ; un seul agent focalisé, chiffres à 20 px, scène 7 « Second hop » ajoutée.
- Thèmes clair et sombre (préférence OS + bouton, `localStorage` sous try/catch). iPhone : feed sous le contenu, plafonné à 8 lignes, tableaux sans débordement.
- Run du 06 synchronisé : `run-20261006T121308Z` (8 scènes, θ = 1 %, 2ᵉ saut) remplace les deux runs du 06 au matin (6 scènes, θ = 2 %, avant 02-bis).

**Données et mesures**
- `export_act1.py` : θ = 1 % (D56), `is_trusted` → `passes_anchor_policy` (renommage 04-bis), snapshot `run_mainnet.BLOCK` = **110 994 810** (9 291 avis, aligné sur Envio : AM-07.1 levé). **D49 calculé par le solveur** : chaque avis non révoqué est classé (R2-R6) et sa contribution lue dans le certificat, (1 − α)·Σλt_u·q/B⁺_u ; auto-contrôle : somme des contributions = masse brute certifiée (assert). CALCULÉ 07/10 : sous « Two independent raters », #18 = 2 avis d'ancre à 11,11 % chacun ; #2 = 1 avis via #18, +7,41 % ; Eve = 7 662 + 3 avis hors schéma. **Complément « every tag accepted »** (mêmes ancres, schéma permissif, 16 tags les plus fréquents) : Eve = **7 548 compteraient pour 0 (auteurs injoignables), 117 rejetés hors bornes** (114 `eve` + 3 `plague`).
- Testnet (run du 06) : D49 recalculé par l'écran avec le schéma engagé dans l'en-tête (`set.tags`) ; poids normalisé w affiché, contribution « — » (pas de B⁺ dans le journal). α = 1/3 et ρ = 1/2 viennent de `demo/lib/config.ts` (absents de l'en-tête).
- WebSocket MESURÉ 07/10 (`scratchpad/ws-logs.mjs`, 20 s) : `wss://testnet-rpc.monad.xyz` et `wss://rpc.monad.xyz` acceptent `eth_subscribe logs` ; 66 têtes en 20 s ; 0 log de registre pendant la fenêtre.
- 8004scan : URL `8004scan.io/agents/monad/<id>` et `testnet.8004scan.io/agents/monad-testnet/<id>` (relevé headless 07/10). Le vrai #2022 du testnet s'appelle « Ship » : confirme AM-07bis.1.
- Tests : **24/24** (10 anciens + 14 : passe / refus, D49, D50, R4, feed, routes). `tsc -b` et build verts. Captures 1920×1080 clair et sombre, iPhone 390 px : `rapports/07bis/`, 0 erreur de console.

**Décisions et raisons**
- Pas de skill « frontend-design » disponible dans cette session : design fait à la main, sobre (texte 15 px, chiffres 17-20 px au plus).
- Les agents du run sur fork ont la route `/agent/demo/:id` et jamais de lien 8004scan ni de croisement avec Envio 10143 (AM-07bis.1). Un vrai agent du testnet cliqué dans le feed affiche « No certificate », ses avis listés sans poids.
- Feed en deux onglets plutôt que mélangé : les blocs du fork (~68,68 M) ne sont pas des blocs du testnet ; les trier ensemble mentirait sur la chronologie.
- Le chiffre d'Eve sous le schéma de référence est « hors schéma » (vrai mais faible) ; la ligne « even if every tag counted » donne la raison de fond (auteurs injoignables), calculée et non affirmée.

**AM-07bis**
- AM-07bis.1 : collision des numéros d'agents entre le fork et le vrai testnet (voir plus haut).
- AM-07bis.2 : l'endpoint Envio déployé (`433cc83`) est **antérieur au schéma v3** : pas de `Certificate` ni de `Discrepancy`. Les events ANCRE du feed viennent du run. → INTERFACE indexeur.
- AM-07bis.3 : sur le testnet, la masse ANCRE est celle du **run enregistré sur fork**, pas une lecture en direct : le bandeau le dit (« recorded on a fork of the testnet »). Dès qu'un run `mode: testnet` existe, l'écran le prend tel quel (route `/agent/testnet/…`, `policy.onchain = true`).
- AM-07bis.4 : noms du feed : seuls les `agentURI` en `data:` sont décodés ; les autres s'affichent « #id » (aucune requête vers une URI distante).

**INTERFACE (indexeur, solveur : non modifiés)**
- Indexeur : redéployer le schéma v3 sur Envio Cloud avec l'adresse persistante d'`AnchoredReputation` (testnet) ; l'écran ajoutera `Certificate` / `Discrepancy` au feed ANCRE (requête prête à écrire, même format).
- Alchemy (D55) : la Transfers API exige la clé, donc un serveur ; une fonction Netlify (`ALCHEMY_KEY` en variable d'environnement Netlify) serait la voie la plus courte. Non fait.

**Prochaine étape** : `/code-review high`, corrections, puis VIDEO-SHOTS.md et SCREEN.md.

---

## 2026-10-07 13:00 — `/code-review high` de l'étape 1 : 10 constats, tous corrigés ; VIDEO-SHOTS et SCREEN réécrits — ✅

**Constats et corrections**
1. **Mémo d'atteignabilité dépendant de l'ordre** (`runset.ts`) : un agent pouvait être gardé « unreachable » à tort sur un cycle. → `reachOf` unique dans `core/path.ts`, BFS depuis la cible sans mémo, partagé par testnet et mainnet (`mainnetReach` réduit à un appel). Test sur un cycle A → p1 → p2 ⇄ p3.
2. **Révocations et lots ignorés** : les events `revoke` et `feedback-batch` (EVENTS.md §3.2) sont maintenant appliqués avant la classification D49. Test.
3. **Auto-contrôle de l'export toujours vrai** (`assert … or (…)`, tuple non vide) : remplacé par un vrai contrôle avec une tolérance d'arrondi ; l'export repasse (contributions = masse brute certifiée pour tous les agents exportés).
4. **`inbound` tronqué à 8** alors que l'écran en tire l'atteignabilité et D50 : liste complète.
5. **⌘-clic sur un nom** : ouvrait l'onglet ET naviguait la page. → `rowClick` ignore les clics tombés sur un lien.
6. **Égalité R5 par ordre d'insertion** : départagée par le `feedbackIndex` le plus haut (FORMAT.md R5). Test.
7. Gras sur tous les certificats sans bloc quand l'agent n'a pas de certificat : corrigé.
8. Logique d'atteignabilité dupliquée : voir 1.
9. **Run chargé sur toutes les pages** : `useDataset` ne le charge que sur le testnet, et pas sur Live demo (qui a son propre chargeur).
10. **CLAUDE.md §6** (« ne pas annoncer un classement positif des agents honnêtes à partir du graphe réel ») : sur le mainnet, la section s'appelle « Reached from these anchors · of 10,281 agents: every other one is unknown to them », avec la phrase « Not a ranking of honest agents… the positive demo is our own traffic, on Monad testnet » (Discover et Leaderboard).

**Ajouts**
- Discover mainnet : « Mass reaching Eve's farm (7,666 agents): 34.56 % » sous la lentille du scanner, 0 sous D15 (CALCULÉ, `massOnFarmWeighted` de l'export) : le plan 3 de l'ancien acte 1 retrouve son chiffre.
- `sync-runs.mjs` : un run `testnet` passe devant les runs `fork` dans `index.json` (c'est le premier run que Discover affiche).
- `demo/VIDEO-SHOTS.md` réécrit pour le nouvel écran (11 plans, 2:55, indices `at=` du run `run-20261006T121308Z`, checklist d'honnêteté) ; `demo/SCREEN.md` réécrit (routes, source et statut de chaque chiffre, mocks, clés).

**Vérifié** : `tsc -b`, **27/27 tests**, build ; captures 1920×1080 refaites, 0 erreur de console.

**Prochaine étape** : rapport `docs/chantiers/rapports/07bis.md`.

---

## 2026-10-07 13:15 — Fin de session : rapport `docs/chantiers/rapports/07bis.md` — ✅

Rapport écrit (livrables, captures, sources, mocks et « — », décisions, AM-07bis.1 à 6, INTERFACE, état de VIDEO-SHOTS, questions). 🧑 en attente : run de l'acte 2 sur le vrai testnet, choix de la lentille « inside the farm », fonction Netlify pour Alchemy, fusion dans `main`.

---

## 2026-10-07 15:30 — Retour de Hugo : page Network, Live demo plus lisible — ✅

Hugo : « t'as oublié la page d'info de network et la page live demo pas sûr. Pk pas une page consigne si vraiment la prise en main a l'air compliqué ».

- **Page `/network`** (onglet « Network » + lien « Network details → » dans le sélecteur) : une carte par réseau. Testnet : registres ERC-8004, `AnchoredReputation` et `TrustGatedPayer` lus dans l'en-tête du run (pill « recorded on a fork of the testnet » tant que le run testnet n'existe pas), ensemble d'ancres (3, m = 2, θ = 1 %), tête Envio et comptes lus en direct. Mainnet : registres, « ANCRE contracts: not deployed », bloc du snapshot du solveur (110 994 810), date de l'instantané 8004scan. Ethereum : « soon », « — » partout (aucune adresse vérifiée par nous).
- **Live demo** : à l'ouverture (rejeu), une carte « How to follow this demo » remplace « waiting for the first agent event… » (qui est qui, ce que fait le payeur, boutons « Start with scene 1 » / « Jump to the Sybil farm », touches). Une ligne par scène sous la barre des scènes : ce qui se passe + « Watch: … ». Les 10 puces farm-01…10 regroupées en une seule « farm ×10 ».
- **Pas de page « consigne » séparée** : la prise en main tient dans la carte d'accueil de la Live demo et le « How to read this » de Discover.

**Vérifié** : `tsc -b`, 27/27 tests, build ; captures 1920×1080 et iPhone (`network.png`, `iphone-network.png`, `live-intro.png`, `live-farm-caption.png`), 0 erreur de console.

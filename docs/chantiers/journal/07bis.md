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

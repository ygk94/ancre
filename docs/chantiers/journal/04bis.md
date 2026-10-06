# Journal du chantier 04bis

> Une entrée par étape terminée (ou par blocage). Format : date/heure, étape, fait, mesures (statut + commande), décisions et pourquoi, écarts, blocages, prochaine étape.


## 2026-10-06 ~11:00 — Démarrage : ce que j'ai compris, mon plan

**Lu** (AM-3.13) : CLAUDE.md, ANCRE.md, CR (D1-D55, tour 7, résultats 08, veille du 05/10), `tour7.md` (D-7.1), ROADMAP, README des chantiers, `solver/` en entier (FORMAT, RESULTS, graph, ppr, export, certifier, watcher, from_indexer, run_mainnet, snapshot, simulate), rapports 04 et intégration, ENCODING.md, veille technique du 05/10, `docs/ressources/alchemy.md`, brief 02-bis, revue maximale partielle.

**Compris**
- Règle B (D48) : R6 ne rejette un contrôleur que si w > 0 ; un négatif d'un contrôleur sur sa cible est conservé (anti-censure par `setApprovalForAll`, AM-08.B).
- Règle A côté solveur : une ligne d'agent dont la source (wallet, ou owner si VIA_OWNER) est une ancre de l'ensemble n'est jamais émise (le contrat la refuse, `AnchorAsSource`). L'ancre n'émet que comme nœud-ancre (AM-08.A).
- AM-9.3 : l'ancien owner qui note juste après le transfert (#10255) est assumé ; diagnostic affiché, sans effet sur les arêtes.
- Snapshot périmé : 7 avis depuis le bloc 108 835 675 (veille du 05/10), à relire on-chain (`readAllFeedback`), pas 8004scan.
- Vecteurs communs avec 02-bis : A, B, C, 2ᵉ saut (H1 approuvé par deux ancres, H1 → H2), puis « nœud address(0) » quand R1 de 02-bis est corrigé. `mainnet_slash_anchor` doit changer d'ancres (0xea0b est le wallet de #18, #22, #23).
- État de 02-bis au démarrage : **aucun commit** sur `chantier/02bis-corrections` (même tête que main, journal vide). Je travaille donc contre ENCODING.md de main et je relirai leur branche avant E3/E4.

**Mesure de départ** : `cd solver && .venv/bin/python -m pytest -q tests` → **135 passed** (MESURÉ, 06/10, venv créé dans le worktree).

**Plan**
1. E1 : `graph.py` (R6 signé, A, diagnostic AM-9.3) + FORMAT.md + tests ; corriger au passage `replay_identity_events` (A→B→A, constat de la revue) avec un test.
2. E2 : relecture on-chain des avis depuis le bloc 108 835 675 (`eth_getLogs` rpc1 puis `readAllFeedback`), rejeu de l'identité, nouveau snapshot versionné, acte 1 recalculé.
3. Alchemy (D55) : récepteur de webhook (HMAC, déduplication, repli sur le sondage), codé contre des événements rejoués ; 🧑 clés et URL de Hugo.
4. E3 : vecteurs communs v1 + `mainnet_slash_anchor` régénéré ; unification `export.main` / `run_mainnet` (revue).
5. E4 : renommage `passesAnchorPolicy` dès le commit de 02-bis ; `simulate.py` sur fork contre leur contrat.
6. E5 : `/code-review high` sur ce worktree. Puis rapport `04bis.md`.

**Prochaine étape** : E1.

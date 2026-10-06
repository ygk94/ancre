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

## 2026-10-06 ~12:30 — E1 : règles A et B (D48), diagnostic AM-9.3, rejeu A→B→A

**Fait**
- `graph.py` : **R6 signée (D48-B)** : un contrôleur courant n'est rejeté que si le poids **combiné R5** du couple est > 0 ; son négatif est gardé (compteur `negatif_controleur_garde_<raison>`). Option `reject_controllers="any"` conservée pour mesurer l'ancienne règle.
- `graph.py` + `ppr.certify` : **règle A (D48-A)** : un agent dont la source (wallet, ou owner sous D44) est une ancre ne porte **aucune ligne, même vide** (`Graph.anchor_sourced`, pas de `row_src`) ; il est listé sans ligne (marge de troncature côté eUp seulement).
- **Diagnostic AM-9.3** (`Graph.diagnostics`) : couple retenu dont le client est un ancien owner/wallet de la cible, avec « N blocs après le transfert » (`Identity.past_owner_until`, champ optionnel `pastOwnerUntil` d'identity.json). Aucun effet sur les arêtes.
- **Revue du 05/10** : `apply_transfer` retire le nouveau détenteur des anciens owners (A→B→A ⇒ {B}), comme `load_identity` ; `from_indexer` n'a plus de correction a posteriori. Test croisé `replay_identity_events` / `from_indexer.identity_file`.
- **Revue du 05/10** : `export.main` réutilise `run_mainnet` (`schema_variant("pre_d15")`, `FARM_FILTER`, `em_schema`, `EM_RATERS`) au lieu de refaire l'expérience à la main.
- `watcher.audit` : une ligne d'agent dont la source est une ancre est une discordance SOURCE (`proveWallet`).
- Tests : `tests/test_d48.py` (10 tests). Chaque test de refus montre aussi que l'attaque **réussissait avant** (AM-INT.2) : l'ancre rendue opératrice perd son slash sous l'ancienne règle ; la copie de ligne de l'ancre volée fait passer la ferme au leave-one-out sans A.

**Mesures** (MESURÉ, 06/10, `cd solver && .venv/bin/python -m pytest -q tests` → **146 passed** ; `export.py`, `run_mainnet.py`, snapshot du bloc 108 835 675)
- Mainnet, schéma de référence : **0 négatif de contrôleur** ; la règle B ne change aucune arête réelle. Schéma stress : 1 (`0x4498…` → #8317, son propre agentWallet, négatif combiné) ; c'est une **boucle** (la ligne du wallet est portée par #8317 lui-même), donc non encodable.
- Règle A sur le mainnet, ancres {0xea0b, 0x0730} (ancien vecteur de démo) : #18 perd sa copie ; d(#4) passe de 0,1852 à 0,1111, et sous la règle du tour 2, t(#4) dans la colonne 0xea0b passe de 0,049 à 0.
- `mainnet_em_d44` (D44) : les deux ancres EM sont owners de #10184 et #10181 ⇒ ces agents perdent leur ligne (A par VIA_OWNER, sur données réelles) ; 36 arêtes, 11 lignes (9 VIA_OWNER), e = 1,84e17 / 2,04e17 wei (marge de troncature, côté méfiance seulement), 78 itérations.

**Décisions**
- Test de signe sur la **combinaison R5**, pas par tag : c'est ce que relit le contrat (une combinaison D14 puis le contrôle). Un vouch +1 et un slash −1 d'un opérateur donnent −1 : gardé.
- Agent sourcé par une ancre : **pas de ligne du tout** plutôt qu'une ligne vide. Une ligne vide avec SRC = ancre serait refusée (`AnchorAsSource`), et une ligne vide sans SRC exige `agentWallet = 0` (ENCODING §3.4). La marge ne touche que eUp.
- `mainnet_slash_anchor` : **ancres {0x0730, 0x794c}**. 0x794c n'est le wallet ni l'owner d'aucun agent et approuve #4 (`quality`, filtre `reference`). Le seul négatif utile du mainnet vient de 0xea0b, wallet de #18, #22, #23 : **aucun vecteur mainnet ne peut montrer le bit de veto certifié sans violer A**. Le veto passe donc dans les vecteurs jouets communs (E3). Les 4 vecteurs de violation et `two_omissions` de `simulate.py` sont reconstruits sur ce graphe (le négatif omis est celui de la copie de #18).

**INTERFACE**
- **Règle d'arête R6 (normative)** : contrôleur rejeté seulement si w combiné > 0. À reporter dans l'indexeur (`edges.ts`, SetEdge : un négatif de contrôleur a `rejected = null`) et dans l'ERC §3.3. FORMAT.md R6, R8, §7 mis à jour.
- **R8** : aucune ligne d'agent dont la source est une ancre (le solveur ne l'émet pas ; le contrat 02-bis la refuse).
- **Pour 02-bis** : sous B, un client peut garder un couple négatif vers **l'agent qui porte sa propre ligne** (wallet de l'agent) ; l'arête est une boucle, jamais encodée (dst ≠ u). `proveEdge` ne doit **rien** prouver quand agentJ est l'agent de la ligne (sinon omission prouvable d'une arête impossible à encoder). Le surveillant l'ignore déjà.
- identity.json : champ optionnel `pastOwnerUntil` (indexeur : bloc du dernier transfert sortant par ancien owner).
- Vecteurs régénérés : `mainnet_slash_anchor` (nouvelles ancres, nouveau setId), `mainnet_em_d44` (filtre à 8 tags, 2 lignes en moins), `violations/*`.

**Écarts** : la régénération de `mainnet_slash_anchor` (prévue en E3) est faite ici, parce que la règle A rendait l'ancien vecteur invalide pour le surveillant (5 tests rouges sans elle).

**Prochaine étape** : E2, snapshot rafraîchi depuis la chaîne.

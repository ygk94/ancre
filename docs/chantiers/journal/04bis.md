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

## 2026-10-06 ~13:15 — E2 : snapshot rafraîchi depuis la chaîne (AM-9.2), acte 1 recalculé

**Fait**
- `solver/refresh.py` (nouveau) : `eth_getLogs` sur rpc1 (Reputation : NewFeedback, FeedbackRevoked, Upgraded ; Identity : Transfer, Approval, ApprovalForAll, MetadataSet, Registered, Upgraded) sur (108 835 675, H], puis **relecture complète par `readAllFeedback(agent, [], "", "", true)` au bloc H** de chaque agent touché, dont la liste remplace celle du snapshot (valeurs, décimales, tags, révocations tels que stockés ; les logs ne servent qu'à dater). Contrôle croisé log ↔ registre sur chaque nouvel avis. Identité roulée par `replay_identity_events`. Refus si un `Upgraded` apparaît (D17).
- Nouveau snapshot versionné `solver/data/mainnet-110994810.{feedbacks,identity}.json.gz` + `mainnet-110994810.refresh.json` (provenance, liste des avis). L'ancien est gardé (base de la provenance).
- `run_mainnet.BLOCK = 110 994 810` ; acte 1 recalculé (`out/mainnet.md`), nouvelle section **(g) D48** ; les blocs des avis (`b`) sont chargés et exportés par `from_indexer` (diagnostic AM-9.3).

**Mesures** (MESURÉ le 06/10 à 08:50 UTC, `cd solver && .venv/bin/python refresh.py --to-block 110994810`, 3,6 s, 10 appels `eth_getLogs` + 4 `cast call`)
- **8 nouveaux avis** (la veille du 05/10 en comptait 7 : +1 au bloc 110 872 159, `0x77a5…` → #10280, `agenttrace-outcome` = 100), **0 révocation, 0 `Upgraded`**. Identité : 21 Transfer, 19 Registered, 22 MetadataSet ; 10 281 agents.
- **Total : 9 291 avis** au bloc 110 994 810 (le « 9 290, NON VÉRIFIÉ » du tour 7 est remplacé). **Part de la ferme : 7 665 / 9 291 = 82,50 %** (7 665 clients distincts vers #182).
- Arêtes nouvelles au **schéma de référence : 0** (les tags `requester_rating:knowledge_access`, `tab` et `agenttrace-outcome` n'y sont pas). En schéma stress : 4 couples ; en schéma execution.market d'essai : 2 (#10188, #10262, w = 8000). **L'acte 1 ne change pas** : chaîne honnête #18 → {#2, #3}, slash de #4, Eve à 0, fuite du scanner, #8317 — mêmes valeurs (`out/mainnet.md` §a-§e).
- **AM-9.3 sur données réelles** : `0x4947…` transfère #10255 au bloc 109 331 923 et le note **918 blocs plus tard** (bloc 109 332 841, ≈ 4,6 min à 0,302 s/bloc), 5 avis `tab` = 100. Visible seulement si `tab` propage (schéma stress) ; affiché, sans effet.
- **Constat** : 0x794c (nouvelle ancre de `mainnet_slash_anchor`) est un **ancien owner de #4** (diagnostic AM-9.3, bloc de transfert inconnu : il précède l'historique daté du snapshot). Il note #4 `quality` = 100. Ce n'est pas un contrôleur courant, donc l'arête est légale sous D20 ; mais ce n'est pas une ancre « exemplaire ». Le vecteur reste un vecteur de test ; la démo positive (acte 2) se fait sur notre trafic.

**Décisions**
- Relecture **par agent touché** et remplacement de toute sa liste, plutôt qu'un ajout des seuls nouveaux logs : une révocation ou un avis manqué sur cet agent est rattrapé, et ce qui entre dans le snapshot est ce que le registre stocke (règle « readAllFeedback, jamais 8004scan »).
- Diagnostic AM-9.3 daté sur le **premier** avis du couple après le transfert (918 blocs), pas sur l'avis décisif de la combinaison (le 5ᵉ, 1 161 252 blocs après).
- `refresh.py` envoie un User-Agent explicite : rpc1 renvoie **HTTP 403** à l'User-Agent par défaut de urllib (MESURÉ).

**Tests** : `.venv/bin/python -m pytest -q tests` → **146 passed** (MESURÉ). Vecteurs mainnet régénérés sur le nouveau snapshot (`mainnet_em_d44` : 14 nœuds, 38 arêtes, 76 itérations ; les autres inchangés en contenu).

**INTERFACE** : `onchain_feedbacks.json` gagne le champ optionnel `b` (bloc du NewFeedback) ; `from_indexer` l'exporte depuis `Feedback.blockNumber`.

**Prochaine étape** : intégration Alchemy (D55), puis E3.

## 2026-10-06 ~14:00 — Intégration Alchemy (D55) : récepteur de Custom Webhook, codé contre des événements rejoués

**Fait** (`solver/alchemy_hook.py`, `solver/tests/test_alchemy.py`, `solver/.env.example`)
- `query` : le filtre GraphQL du Custom Webhook à coller dans le tableau de bord (un par réseau, 143 et 10143) : Reputation (NewFeedback, FeedbackRevoked), Identity (Transfer, MetadataSet, Approval, ApprovalForAll), Upgraded sur les deux, `CertificateSubmitted` du contrat ANCRE. Topics dérivés des signatures que la boucle de sondage utilise déjà (une seule source).
- `serve` : récepteur HTTP `POST /alchemy`. **Signature vérifiée avant tout parsing** (HMAC-SHA256 du corps brut, comparaison à temps constant ; 401 sinon), réponse immédiate (Alchemy relance les non-200 pendant 10 min, DOC), traitement dans un thread, **déduplication par (txHash, logIndex)**. Les événements passent par le **même code** que le sondage : `certifier.relevant` → `Certifier.run_once` (recertification), `CertificateSubmitted` du set surveillé → `watcher.watch_once` (audit + preuves). À blanc par défaut, `--send` pour du réel.
- **Repli conservé** : un sondeur `eth_getLogs` (`poll_once`) couvre en continu les blocs non traités, via le même dédoublonneur (le webhook donne la latence, le sondage la complétude) ; alarme `webhook_silent`.
- **Mesures journalisées à chaque webhook** : `latencyS` = réception − timestamp du bloc (résolution 1 s) ; **état du bloc à la réception** lu par les étiquettes RPC juste après le POST (`Finalized` si bloc ≤ `finalized`, sinon `notFinalized`), et l'écart à `latest` en blocs. Si l'export de l'indexeur est en retard sur le bloc de l'événement : `data_behind`, rattrapé au tour de sondage suivant.
- `payloads` / `replay` : charges utiles au format Alchemy **reconstruites à partir de vrais logs du mainnet**, signées et rejouées. Fixture : `tests/fixtures/alchemy/mainnet-108835676-110994810.jsonl`.
- Secrets : `ALCHEMY_SIGNING_KEY`, `ALCHEMY_NOTIFY_TOKEN`, `ALCHEMY_API_KEY` depuis l'environnement ou `solver/.env` (ignoré par git, `*.env`, vérifié par `git check-ignore`). Aucune clé dans le dépôt.

**Mesures**
- MESURÉ (06/10, rpc1) : les étiquettes `latest`, `safe`, `finalized` répondent ; à l'instant de la sonde, `safe = latest` et `finalized = latest − 1` (`cast block <tag> --field number`).
- MESURÉ (06/10) : fixture = **29 blocs, 51 logs** (8 NewFeedback, 21 Transfer, 22 MetadataSet) sur (108 835 675, 110 994 810], en un seul `eth_getLogs` par adresse sur rpc1 (2,6 s). Les 8 NewFeedback décodés = les 8 avis relus par `refresh.py`.
- MESURÉ (local, à blanc, mainnet 9 291 avis, set honnête 0x0730/0xf7d5, filtre core) : **POST signé → plan du certificateur : médiane 1,2 ms, p90 1,3 ms, max 8,4 ms** sur 20 POST (`run_once` seul : 3,2 ms à froid).
- **NON MESURÉ** : le délai réel bloc → réception du webhook et l'état du bloc à l'envoi par Alchemy. Il faut le webhook de Hugo (voir blocage). La syntaxe `topics: [[…]]` (OU en position 0) est **NON VÉRIFIÉE** sur Monad tant que « Test Webhook » ne l'a pas acceptée.
- Tests : `.venv/bin/python -m pytest -q tests` → **155 passed** (dont 9 Alchemy). Le test de refus de signature vérifie aussi que le **même corps est accepté** avec la bonne signature, et qu'un POST refusé n'atteint jamais le dispatcher (AM-INT.2).

**Décisions**
- Le webhook est un **déclencheur**, pas une source de données : les avis eux-mêmes sont relus depuis l'export de l'indexeur (Envio, 03) ou le registre. Envio reste la base historique et l'auditeur (D42) ; Alchemy pousse l'événement. Les deux rôles ne se recouvrent pas.
- Réponse 200 **avant** le traitement : une recertification lente ne doit pas provoquer de relances en rafale.
- État de commit classé en deux valeurs seulement (`Finalized` / `notFinalized`) : le RPC public ne distingue pas Proposed de Voted (`safe = latest` mesuré).

🧑 **BLOQUÉ (Hugo)** : compte Alchemy (offre gratuite, 5 webhooks), app « ANCRE » sur Monad mainnet + testnet, puis : (1) la **clé de signature** du Custom Webhook, (2) le **jeton Notify** (seulement pour créer le webhook par API), (3) une **URL HTTPS publique** pour le récepteur (tunnel pendant la démo, hôte permanent pour le 13 → 27/10). À mettre dans `solver/.env` (jamais commité). Ensuite : `alchemy_hook.py query --chain 10143 --ancre <adresse>` → coller dans le tableau de bord → « Test Webhook » → `serve`, puis mesurer délai et état sur le testnet.

**Phrase pour le README et la vidéo Alchemy** (vérifiable dans `solver/alchemy_hook.py`) :
> *Every ERC-8004 feedback, transfer or certificate submission on Monad reaches ANCRE through an Alchemy Custom Webhook; the receiver checks the HMAC signature, then recertifies the anchor set or audits the new certificate with the same code as the polling loop, which now only fills gaps.*
(À compléter par le délai mesuré quand le webhook existe ; ne pas annoncer de chiffre avant.)

**Prochaine étape** : E3, vecteurs communs.

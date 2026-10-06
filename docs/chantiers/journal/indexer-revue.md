# Journal indexer-revue

> Chantier : corrections de la revue maximale du 06/10 sur l'indexeur Envio (`indexer/`). Worktree
> `/Users/hugo/Projet/ancre-indexer-revue`, branche `chantier/indexer-revue` (depuis `main` 89c959e).
> Source des constats : `docs/revue/revue-max-2026-10-06-complete.md` et relais `docs/chantiers/relais/vers-03.md`.
> Statuts : **MESURÉ** (commande rejouable), **DOC**, **ESTIMÉ**, **NON VÉRIFIÉ**.

## 2026-10-06 — Contexte et références

- Contrat de référence : `chantier/02bis-corrections` @ `46f7764` (non modifié). ABI compilée par `forge build` dans le
  scratchpad (`ir-02bis/`). **Events et calldata utilisés par l'indexeur inchangés** (MESURÉ : l'ancien sous-ensemble de
  31 entrées est inclus tel quel dans la nouvelle ABI). Nouveautés : `nodeKeyAt`, `nodeCount`, events `ApprovalProven`,
  `EdgeFact`, `SourceFactCleared`, erreurs `AnchorAsSource`, `NotCanonical`, `ProvenRowResubmitted`. `abis/AnchoredReputation.json`
  est réaligné (39 entrées) ; les trois nouveaux events ne sont pas indexés (aucun besoin pour l'audit).
- Règles d'arêtes de référence : `chantier/04bis-solveur` @ `f4117f9` (`solver/graph.py`, R6 + règle B, R8 + règle A).
- **Pas de `ENVIO_API_TOKEN` sur cette machine** : `pnpm test:parity` (HyperSync) ne peut pas tourner (MESURÉ : « An Envio
  API token is required »). Remplacé par un **rejeu hors ligne** du dump réel de l'indexeur
  (`solver/tests/fixtures/indexer/`, bloc 110 813 936) à travers les handlers actuels : `test/replay.ts`,
  `test/offline.test.ts` (signalé au pilote).

## Constats traités

### SW2 (haute) — alphaN / alphaD hors Int32
- Correctif : `AnchorSet.alphaN`, `alphaD` en `BigInt` (schéma + handler). Revue des autres colonnes `Int` alimentées par
  le contrat : `Discrepancy.bCommitted` / `bRegistry` passent aussi en `BigInt` (un `sPlus` déclaré est un uint32, donc
  B⁺ peut dépasser 2³¹). Restent `Int`, bornés par la table de nœuds (`nCert`, `numRows`, `u`, `dst`, `index`,
  `nodeCount` : plus de 2³¹ nœuds demanderaient > 10 Go de calldata) ou par la grille (`w` int16).
- Test : `test/review.test.ts` « SW2 » (schéma lu : les 4 champs sont `BigInt` ; alphaD = 3 000 000 000 stocké exact).
  Limite : le store en mémoire du test ne reproduit pas l'INTEGER de Postgres ; le test vérifie donc le type déclaré.

### NUL et LONGTAG (hautes) — tag brut dans les clés
- Correctif (`src/lib/text.ts`) : l'identité d'un tag est **keccak256(octets du tag)**, prise du topic `indexedTag1`
  (exact même si le texte décodé est lossy), sinon calculée. `Feedback.triple` et `TripleLatest.id` =
  `client-agentId-tagHash` (longueur fixe). Le texte reste en colonne non indexée `tag1`, **normalisé** : U+0000 et
  surrogates isolés échappés (`\u0000`), coupé à 1 Kio, et `tag1Exact = false` dans ces cas (ou si le texte ne redonne
  pas le hash). `tag2`, `endpoint`, `feedbackURI`, `uri` passent par la même normalisation (Envio ne réécrit plus jamais
  une ligne en retirant les NUL). Le filtre de référence et l'audit comparent **par hash** (`refTagOfHash`,
  `storeView.latest`) : « vouch\0 » n'est jamais un vouch.
- Tests : `review.test.ts` « NUL / LONGTAG » (« x » et « x\0 » = deux triples ; « vouch\0 » sans arête, texte échappé,
  `tag1Exact` false ; tag de 4 Kio → clé de longueur fixe, texte ≤ 1 Kio ; sans topic, hash calculé ; surrogate isolé).
  Mutation (clé reconstruite avec le texte brut) : 14 tests échouent.
- Relais 04-bis : `from_indexer.py` exporte `tag1` ; il doit ignorer les lignes `tag1Exact = false` (ou comparer
  `tagHash`). Aujourd'hui leur texte échappé ne peut de toute façon égaler un tag de filtre qu'avec un filtre
  contenant `\u0000` littéral.

### OUTERCALL (moyenne) — appels via un contrat
- Stratégie documentée (`src/handlers/ancre.ts`, `SCHEMA.md`) — Monad ne sert pas de traces d'appels :
  1. **Schéma et lignes** : `registerAnchorSet` / `submitCertificate` cherchés aussi **imbriqués** dans l'input
     (sélecteur repéré, décodage borné à 16 candidats / 64 essais, `src/lib/calls.ts`). Acceptés seulement si
     `computeSetId(params) == setId` ou si les lignes redonnent `graphRoot` (+ `nCert`, `numRows`).
  2. **Table de nœuds** : appel direct sinon **relecture `nodeKeyAt(setId, i)` à la tête via l'Effect API**
     (`src/lib/nodekeys.ts`, clés immuables, `crossChain: false`, 10 appels/s, jamais de cache pour une clé nulle ou une
     erreur). Un trou est réessayé au `NodesAdded` suivant **et** à chaque certificat : `nodesComplete` ne reste plus faux
     pour toujours. RPC : `ENVIO_MONAD_RPC`, `ENVIO_MONAD_TESTNET_RPC`, `ENVIO_OPTIMISM_RPC` (mêmes noms que `check.ts`).
- Tests (`test/ancre.test.ts`, serveur JSON-RPC local `test/rpcmock.ts`, aucun RPC public) : certificat imbriqué dans
  Multicall3 → AUDITED et table relue ; leurre imbriqué → ROOT_MISMATCH ; `addNodes` relayé → table complète tout de
  suite ; RPC en panne → NODES_MISSING puis AUDITED au certificat suivant ; set enregistré via Multicall3 → schéma connu ;
  input opaque → UNDECODABLE. Mutation (pas de réparation au `NodesAdded`) : 1 test échoue.
- Limite : un input compressé ou chiffré (aucun appel imbriqué lisible) reste UNDECODABLE ; le cache d'effets n'existe
  qu'à partir du plan Medium du Cloud (DOC, `docs/ressources/envio.md` §2.6) : sur le plan gratuit, les relectures sont
  refaites à chaque réindexation (quelques appels par `addNodes` relayé).

### REGCB (moyenne) — wallet émis après le callback ERC-721
- Correctif (`identity.ts`) : phase d'enregistrement par agent (`Agent.regTx`, `regPhase` : minted → callback →
  registered / registeredStale → done). Le `MetadataSet(agentWallet)` tardif de `register()` est ignoré (ni état, ni
  ligne `WalletChange`) si un changement de wallet ou d'owner a eu lieu dans le callback, même transaction.
- Tests : `review.test.ts` « REGCB » (unset dans le callback → wallet 0 et une seule `WalletChange` ; register simple →
  msg.sender ; transfert dans le callback → owner D, wallet 0). Mutation : 2 tests échouent.
- Relais 04-bis : même règle à porter dans `graph.py` `replay_identity_events` (et `from_indexer.py` hérite déjà du bon
  historique, puisque la ligne fautive n'est plus écrite).

### SW1 (moyenne) — dilution signalée sur la mauvaise arête
- Correctif (`src/lib/audit.ts`) : comparaison **par poids** arête par arête (FABRICATED / INFLATED / OVERSTATED_NEG /
  WRONG_INDEX, chacune prouvable par `proveEdge` sur elle) ; la dilution est jugée **par ligne** (B⁺ engagé < B⁺ vrai,
  cumulée, ce qui couvre aussi W1) et signalée **sur chaque arête positive omise (DILUTION) ou dégonflée (DEFLATED)**,
  jamais sur les sœurs. Omission couverte par un `sPlus` déclaré : non signalée (comme `watcher.py`). La preuve est
  calculée par l'audit : sur une ligne SOURCE / UNKNOWN_AGENT, toutes les trouvailles d'arête portent `proveWallet`.
  `remedy()` : `RowVoided` ferme la ligne ; `EdgeProven(u, agentJ)` ferme **ce couple** (et seulement les trouvailles
  `proveEdge`, jamais un SHAPE) puis réévalue les DILUTION / DEFLATED restantes de la ligne sur la ligne amendée
  (borne X d'ENCODING §7.1 : `max(GRID, max(déclaré, S))` ≥ B⁺ vrai ⇒ fermée).
- Tests : `review.test.ts` « SW1 » (W1 → #2 et #3, seule #2 engagée : [DILUTION, u 2, #3, proveEdge] ; la preuve
  (2, #3) rend le set CLEAN ; une preuve sur la sœur ne ferme rien ; sPlus déclaré → rien ; deux omissions, la 1re
  preuve laisse l'autre ouverte puis la 2e ferme ; SHAPE jamais fermé par un EdgeProven ; ligne SOURCE → proveWallet).
  Vecteur normatif `violations/dilution.json` : désormais **[DILUTION, #3]** (l'arête omise #18 → #3), au lieu de
  [INFLATED, #2] (`audit.test.ts`, `ancre.real.test.ts`, `offline.test.ts`). Mutations : 3 tests échouent (audit), 1
  (fermeture par couple).

### DECODE (faible) — SRC nul
- Correctif (`certificate.ts`) : un SRC de 20 octets nuls se lit « sans source » (comme le contrat) ; les ruptures de
  forme et de forme canonique 02-bis (SRC nul, SRC/VIA_OWNER sur une ancre, VIA_OWNER sans SRC, `sPlus` égal à la somme
  engagée) ne lèvent plus : elles vont dans `row.notes`, et l'audit les rapporte en **SHAPE** (« refused at submission »).
  L'audit ajoute les règles 02-bis qu'il est seul à pouvoir juger (il connaît la table) : SRC égal à une ancre
  (**AnchorAsSource**, D48-A), alias d'une ligne non-agent, ligne sans source sur un set `ownerFallback`. Un nœud
  `address(0)` est refusé au décodage (R1, `BadNodes`).
- Tests : `review.test.ts` « DECODE » (ligne d'ancre à SRC nul → AUDITED + SHAPE ; ligne d'agent à SRC nul → SHAPE, plus
  de faux SOURCE ; agent dont le wallet est une ancre → SHAPE). Mutation : 1 test échoue.

### Règle B (D48-B) et DEC18 — `edges.ts`, `rules.ts`
- Règle B : un contrôleur courant n'est rejeté que si le poids combiné R5 est **positif** ; son arête négative est
  gardée (parité `graph.py` 04-bis et `_edgeHolds` 02-bis). DEC18 : `valueDecimals > 18` → le tag ne donne rien
  (`undefined`, comme `_normalize`), plus d'exception.
- Tests : `review.test.ts` (slash de l'owner gardé à −10 000, vouch du wallet rejeté, l'owner repasse en positif →
  rejeté ; DEC18 sur `quantize` et `combine`) ; `test/common.test.ts` : les **vecteurs communs 02-bis / 04-bis** rejoués
  comme événements → `common_B_controller_negative` ACCEPTED et audité à 0 écart, `common_C` → [FABRICATED, u 0, #41]
  (la preuve attendue), `common_A_attack_anchor_copy` → SHAPE AnchorAsSource, `common_R1_address_zero_node` jamais
  audité propre. Mutation règle B : 1 test échoue sur les vecteurs communs.

### SEQ (nettoyage) — `recomputeEdgesInto`
- Correctif (`state.ts`) : décisions lues en parallèle (`Promise.all`), écritures puis **un seul** delta de stats ;
  `nextEdge` partagé avec `recomputeRefEdge`.
- Test : `review.test.ts` « SEQ » (3 arêtes vers #4, `ApprovalForAll` d'un client → CONTROLLER_OPERATOR et
  `refEdges` 3 → 2).

### K22 et CHECKCOV (faibles) — `scripts/check.ts`
- K22 : `paginate` s'arrête sur une page **vide** (même règle que `from_indexer.py`, FORMAT §7).
- CHECKCOV : `getClients` pour **chaque agent minté** (historique d'identité), plus seulement les agents notés ;
  `readFeedback` comparé (valeur, décimales, keccak256 des octets de `tag1` = `tagHash`, révocation au bloc vérifié)
  pour le dernier avis de chaque triple, ou chaque avis avec `--full`. `tag1` lu en `bytes` (même encodage ABI que
  `string`) : hash exact même en UTF-8 invalide. `main()` ne tourne que si le script est lancé directement.
- Tests : `test/check.test.ts` (serveur plafonné à 700 lignes : 2 345 lignes lues en 5 pages ; révocation manquée, tag
  tronqué par NUL, valeur/décimales, révocation postérieure au bloc, échec d'appel). NON VÉRIFIÉ contre le Cloud :
  l'endpoint déployé (`433cc83`) a l'ancien schéma (pas de `tagHash`).

### PUBLISH et QUOTA (faible, nettoyage) — `scripts/publish.sh`
- PUBLISH : `DST` doit être **la racine** du work tree (`git rev-parse --show-toplevel` comparé en `pwd -P`) et l'URL
  d'origine doit valoir exactement `ygk94/ancre-indexer` (https, ssh ou scp, `.git` optionnel). `PUBLISH_CHECK_ONLY=1`
  n'exécute que la garde.
- QUOTA : « 3 per indexer on the free plan » sourcé (DOC Envio hosted-service-billing, lu le 2026-09-27,
  `docs/ressources/envio.md` §5).
- Test : `test/publish.test.ts` (racine acceptée ; `.git`, sous-dossier, origine sosie, dossier absent refusés).
  Aucune copie, aucun push.

## Parité et audit sur données réelles (MESURÉ 06/10, sans HyperSync)

- `test/offline.test.ts` (dans `pnpm test`, ~1 s) : rejeu du dump jusqu'au bloc 108 434 518 → **11 arêtes identiques**
  à `ref_edges_143_108434518.json`, 10 261 mints, 9 188 avis, 78 auto-notations. Aucune négative de contrôleur sur les
  données réelles : la règle B ne change rien à ce bloc.
- Rejeu jusqu'au bloc du dump (110 813 936), `SetEdge` réécrit dans une copie du dump, puis `from_indexer.py --parity`
  **de la branche 04-bis** : « 11 solver pairs, 0 differences ».
- Audit des vecteurs : vecteurs de `main` (108 835 675) → 4 honnêtes à 0 écart, sauf **`mainnet_slash_anchor` : SHAPE
  AnchorAsSource sur #18** (l'ancre 0xea0b est le wallet de #18 ; le contrat 02-bis le refuse, c'est le vecteur
  `common_A_mainnet_old_slash_anchor`) ; violations reconnues, dilution sur #3. Vecteurs **04-bis** (110 994 810,
  dump complété par l'instantané `solver/data/mainnet-110994810.*` : 1 mint, 1 wallet, 1 avis) via
  `ANCRE_VECTORS=<solver 04-bis>` → **4 honnêtes à 0 écart, 4 violations reconnues**.
- Décodeur sur les 13 vecteurs 04-bis : 14/14 (copie temporaire dans `test/vectors`, retirée).
- `pnpm test:parity` (HyperSync) : **non exécuté** (pas de token). Ses attentes sont mises à jour (bloc lu dans les
  vecteurs, SHAPE pré-D48 filtré, DILUTION #3).

## Écarts / à noter

- Changement de schéma GraphQL (v3) : le prochain déploiement Cloud réindexe tout (comme à chaque push). Ne pas
  déployer avant la fusion de 02-bis (adresse du contrat) ; `scripts/publish.sh` non lancé.
- `solver/tests/fixtures/indexer/` **non modifié** (la parité n'en avait pas besoin).

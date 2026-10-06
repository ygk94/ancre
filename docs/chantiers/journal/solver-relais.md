# Journal solver-relais

> Chantier : relais de la revue indexeur (`docs/chantiers/rapports/indexer-revue.md` §5) vers le solveur, référence
> normative des règles d'arêtes. Worktree `/Users/hugo/Projet/ancre-solver-relais`, branche `chantier/solver-relais`
> (depuis `main` 0f95933). Rien hors de `solver/` et de ce journal. Statuts : **MESURÉ**, **DOC**, **NON VÉRIFIÉ**.

## 2026-10-06 — REGCB (moyenne) : wallet émis après le callback ERC-721

- Source : constat REGCB (`docs/revue/revue-max-2026-10-06-complete.json`), code amont v2.0.0
  `IdentityRegistryUpgradeable.sol` l.60-86 (wallet écrit avant `_safeMint`, `MetadataSet` émis après `Registered`) et
  l.188-196 (`_update` : `MetadataSet("")` avant le `Transfer` d'un transfert, rien au mint) (DOC, copie du scratchpad).
- Correctif : `graph.replay_identity_events` porte la machine de `indexer/src/handlers/identity.ts` (minted → callback →
  registered | registeredStale → done) ; le `MetadataSet` tardif est ignoré si un `MetadataSet(agentWallet)` ou un
  `Transfer` du même agent a eu lieu entre son mint et son `Registered`. Clé de transaction : `tx`
  (`transactionHash`, déjà posé par `refresh.decode`) ; **sans hash, le bloc** : même réponse sur une liste de logs
  complète (logs d'une transaction contigus, `register()` émet le `MetadataSet` juste après `Registered`, un agent n'est
  minté qu'une fois). Les autres clés de métadonnées n'ouvrent pas la phase.
- `from_indexer.identity_file` : inchangé, l'indexeur n'écrit pas de `WalletChange` pour l'event ignoré (vérifié dans
  `indexer/test/review.test.ts`) ; docstring et FORMAT §7 le disent. `snapshot.py` (base 108 835 675, logs sans
  `tx`) : repli sur le bloc.
- Mesure sur le réel (MESURÉ, rpc1, 5 appels `eth_getLogs`) : (108 835 675, 110 994 810], 62 logs d'identité,
  19 enregistrements, **0 avec changement dans le callback** ; identité rejouée **identique** au fichier versionné
  `data/mainnet-110994810.identity.json.gz`.
- Tests (`tests/test_relais.py`) : unset dans le callback (avec et sans `tx`), transfert dans le callback (owner D,
  wallet 0, l'avis de C n'est plus rejeté comme contrôleur), `setAgentWallet(W2)` dans le callback, clé de
  métadonnées tierce, logs bruts via `refresh.decode`, accord avec l'export indexeur.

## 2026-10-06 — NUL (haute) : identité du tag quand `tag1Exact = false`

- Comment le solveur identifiait les tags : **par texte** (`f.tag1 in filtre ∩ schéma`) ; le contrat compare
  `keccak256(tag1)` (`AnchoredReputation.sol` `ts.hash != th`). Un texte d'affichage de l'indexeur (`vouch` stocké
  pour `vouch\0`) formait une arête fantôme.
- Choix : **identité par hash** (nouvelle règle R1 bis, FORMAT §0), pas d'exclusion. L'exclusion n'est **pas**
  prouvable sûre : un tag de schéma de plus de 1 KiB (FORMAT : « any length ») ou contenant U+0000 n'a que des avis
  `tag1Exact = false` et forme des arêtes on-chain (test `test_nul_long_tag_matched_by_hash`).
- Correctif : `Feedback.tag_hash` (champ `h` du fichier d'avis, optionnel) ; `combine_pairs` apparie un avis qui a un
  hash **par hash seulement** contre `keccak(utf8(T))` des tags du filtre, et `decidingTag` = texte du schéma (même
  sortie que `rules.ts` `REF_BY_HASH` : parité). Sans hash : texte, comme avant (relectures `readAllFeedback`).
  `from_indexer` lit `tagHash`, `tag1Exact` (schéma v3), exporte `h`, refuse une ligne non exacte sans hash ou exacte
  dont le texte ne hache pas en `tagHash`. Dumps sans ces champs (`tests/fixtures/indexer/`) : comportement inchangé
  (parité réelle toujours à 0 différence). `refresh.decode` garde le topic `indexedTag1` (`tagHash`) et `refresh`
  l'écrit en `h` pour les avis dont le log est dans la fenêtre (le texte y est décodé avec perte sur UTF-8 invalide).
- Tests : `vouch\0` affiché `vouch` ou échappé → pas d'arête ; tag long et tag de schéma avec NUL → arête par hash,
  parité avec un `SetEdge` de l'indexeur ; lignes exactes avec hash = mêmes arêtes ; lignes incohérentes refusées ;
  topic gardé par `refresh.decode`. `test_indexer_parity` : l'aller-retour du stub ignore le hash (le stub écrit
  désormais `tagHash`/`tag1Exact`).

## 2026-10-06 — `/code-review high` (porte bien sur `ancre-solver-relais`, diff `main...HEAD`)

8 constats, tous traités :
1. Dump pré-v3 sans `tagHash` apparié par texte (`vouch\0` stocké `vouch`) : **accepté et documenté**
   (compatibilité exigée avec `tests/fixtures/indexer/`) ; docstring de `from_indexer._tag_identity` et FORMAT R1 bis :
   ne jamais certifier depuis un tel dump ; la source live exige `tagHash`. Mesure sourcée : fixture au bloc
   110 813 936, 9 290 tags, 0 U+0000, 0 U+FFFD (MESURÉ 06/10 ; un NUL retiré est invisible).
2. et 3. `refresh` : `readAllFeedback` lu en `bytes[]` (même encodage ABI que `string[]` ; MESURÉ par `cast` sur
   l'agent #2 : `0x766f756368`), `h` = keccak des octets sur chaque avis relu, assertion de `main()` sur le hash du
   topic au lieu de deux textes décodés avec perte. **Rejeu réel complet** (108 835 675 → 110 994 810, rpc1, 10
   appels, dans le scratchpad) : avis identiques au fichier versionné hors `h`, 8 avis avec `h` = keccak(t1),
   identité identique (MESURÉ). Les avis gardés de la base n'ont pas de `h` (0 NUL, 0 U+FFFD sur 9 291, MESURÉ).
4. Liste d'events mêlant `tx` et sans `tx` : refusée (`ValueError`), test.
5. Altitude : une seule identité de tag, `_tag_resolver` apparie toujours par hash (hash de la source, sinon
   keccak du texte, mis en cache par texte).
6. Machine REGCB : table `_REGCB` (transfer / wallet / registered → phase suivante, `ignore`) et un seul helper.
7. Test d'accord indexeur : compare désormais `identity_file` et `replay_identity_events` sur le même scénario, et
   renvoie à l'assertion de `indexer/test/review.test.ts` (l'indexeur lui-même n'est pas exécuté ici).
8. Le test utilise `graph.tag_hash` ; `make_stub` ne hache plus deux fois.

## Vérifications

- Avant correctif (code de `main` + `tests/test_relais.py` final, `tag_hash` défini localement) : **14 échecs,
  3 succès** (gardes de non-changement : clé de métadonnées tierce, NUL échappé, lignes exactes) (MESURÉ).
- Après : `pytest` complet **212 verts** (195 avant + 17 de `test_relais.py`) (MESURÉ). `export.py` et `common_vectors.py` régénérés :
  **vecteurs identiques** (`git status` propre) (MESURÉ).

## Écarts et restes

- Parité indexeur : aucune différence de règle connue. Le solveur accepte un filtre quelconque par hash ; l'indexeur
  ne connaît que le filtre `reference` (inchangé, pas un écart de règle).
- `GraphQLSource` demande `tagHash` et `tag1Exact` : contre l'endpoint Cloud actuel (ancien schéma, AM-IR.4) la
  requête échouera jusqu'au redéploiement v3 (voulu : l'ancien schéma a le défaut NUL).
- `run_mainnet.py` (rapports) compte les tags par texte : sans effet sur les arêtes (données sans hash, 0 NUL).

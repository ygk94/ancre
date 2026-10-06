# Rapport du chantier indexer-revue — corrections de la revue maximale du 06/10 sur l'indexeur

> Session du 06/10/2026. Worktree `/Users/hugo/Projet/ancre-indexer-revue`, branche `chantier/indexer-revue` (depuis
> `main` 89c959e), **non poussée, rien déployé**. Détail pas à pas : `docs/chantiers/journal/indexer-revue.md`.
> Statuts : **MESURÉ**, **DOC**, **ESTIMÉ**, **NON VÉRIFIÉ**.

## 1. Bilan

**Les 12 constats du chantier 03 sont corrigés, plus DEC18 côté `rules.ts` et la règle B (D48-B).** Chacun a un test de
non-régression ; les correctifs principaux ont été vérifiés par mutation (le test échoue quand on retire le correctif).

| Constat | Gravité | Correctif | Test |
|---|---|---|---|
| SW2 | haute | `alphaN`/`alphaD` (et `bCommitted`/`bRegistry`) en `BigInt` | `review.test.ts` |
| NUL | haute | clés par `keccak256(tag)` (topic `indexedTag1`) ; texte échappé, `tag1Exact` | `review.test.ts` |
| LONGTAG | haute | `triple` / `TripleLatest.id` = `client-agentId-tagHash` ; texte coupé à 1 Kio, non indexé | `review.test.ts` |
| OUTERCALL | moyenne | appels imbriqués (Safe, Multicall3, 4337, 7702) lus dans l'input et vérifiés par hash ; table de nœuds relue par `nodeKeyAt` (Effect API), trous réessayés | `ancre.test.ts` (RPC local) |
| REGCB | moyenne | `MetadataSet` tardif de `register()` ignoré après un changement dans le callback | `review.test.ts` |
| SW1 | moyenne | dilution signalée sur l'arête **omise** (DILUTION / DEFLATED) ; `remedy()` ferme le bon couple et réévalue la ligne | `review.test.ts`, vecteur `dilution.json` |
| K22 | faible | pagination arrêtée sur page vide | `check.test.ts` |
| CHECKCOV | faible | `getClients` de chaque agent minté ; `readFeedback` comparé (valeur, décimales, hash du tag, révocation) | `check.test.ts` |
| PUBLISH | faible | garde : racine du work tree + origine exacte | `publish.test.ts` |
| DECODE | faible | SRC nul = sans source ; formes non canoniques → SHAPE au lieu d'UNDECODABLE | `review.test.ts` |
| QUOTA | nettoyage | quota Envio sourcé et daté | — |
| SEQ | nettoyage | `recomputeEdgesInto` en parallèle, un seul delta | `review.test.ts` |
| DEC18 | faible | `valueDecimals > 18` → tag ignoré, plus d'exception | `review.test.ts` |
| Règle B | relais 04-bis | négatif d'un contrôleur gardé (`edges.ts`) | `review.test.ts`, `common.test.ts` |

## 2. Alignement sur 02-bis et 04-bis

- **ABI** (02-bis @ `46f7764`, `forge build` dans le scratchpad) : events et fonctions lus par l'indexeur **inchangés**
  (MESURÉ). `abis/AnchoredReputation.json` réaligné (+ `nodeKeyAt`, `nodeCount`, 3 events, 3 erreurs). Forme canonique
  02-bis, AnchorAsSource, nœud `address(0)` refusé : reproduits par le décodeur et l'audit (SHAPE).
- **Règles d'arêtes** (04-bis @ `f4117f9`) : règle B portée. **Parité MESURÉE** : rejeu du dump réel jusqu'au bloc
  110 813 936 puis `from_indexer.py --parity` de 04-bis → **0 différence** (11 arêtes) ; rejeu au bloc 108 434 518 →
  11 arêtes identiques à la fixture du solveur.
- **Vecteurs** : vecteurs 04-bis (110 994 810) → 4 honnêtes à 0 écart, 4 violations reconnues ; vecteurs communs
  02-bis/04-bis rejoués comme événements → verdict identique au contrat sur les 7 qui ont un registre simulé.
- Vecteurs de `main` (01/10) : `mainnet_slash_anchor` ressort **SHAPE AnchorAsSource** (ancre 0xea0b = wallet de #18) :
  c'est attendu, le contrat 02-bis le refuse (`common_A_mainnet_old_slash_anchor`).

## 3. Tests (MESURÉ 06/10)

- `pnpm test` : **69 verts, 5 sautés** (les 5 sautés sont les tests HyperSync `PARITY=1`) ; `tsc --noEmit` propre.
- `ANCRE_VECTORS=<solver 04-bis> vitest run test/offline.test.ts test/common.test.ts` : 9 verts, 2 sautés.
- `pnpm test:parity` (HyperSync) : **NON EXÉCUTÉ**, pas d'`ENVIO_API_TOKEN` sur cette machine. Remplacé par
  `test/offline.test.ts` (rejeu du dump réel, dans `pnpm test`, ~1 s) ; attentes de `parity`/`audit`/`ancre.real`
  mises à jour (bloc lu dans les vecteurs, DILUTION #3, SHAPE pré-D48 filtré).

## 4. Angles morts

| Id | Angle mort | Statut |
|---|---|---|
| AM-IR.1 | Postgres non exécuté : SW2, NUL, LONGTAG sont corrigés au niveau du schéma et des clés ; le store en mémoire des tests ne reproduit ni l'INTEGER ni la limite btree | à confirmer par `pnpm dev` local (Docker) avant le déploiement |
| AM-IR.2 | `pnpm test:parity` non rejoué (pas de token HyperSync) | 🧑 token dans `indexer/.env` du worktree, puis `pnpm test:parity` |
| AM-IR.3 | Un input compressé (aucun appel imbriqué lisible) reste UNDECODABLE ; sur le plan gratuit du Cloud, le cache d'effets n'existe pas (DOC) : chaque réindexation refait les `nodeKeyAt` | accepté ; quelques appels par `addNodes` relayé, 10/s |
| AM-IR.4 | Le schéma GraphQL change (v3) : `check.ts` ne marche plus contre l'endpoint Cloud actuel (`433cc83`, ancien schéma) | se règle au prochain déploiement |
| AM-IR.5 | Les events 02-bis `ApprovalProven`, `EdgeFact`, `SourceFactCleared` ne sont pas indexés | pas nécessaires à l'audit ; à ajouter si l'écran 07 veut les montrer |

## 5. Relais

- **04-bis** : (1) `from_indexer.py` doit ignorer les avis `tag1Exact = false` ou comparer `tagHash` ; (2) REGCB à porter
  dans `graph.py` `replay_identity_events` ; (3) les attentes du watcher et de l'indexeur sont désormais les mêmes
  pour la dilution (arête omise).
- **Pilote** : `pnpm test:parity` à rejouer avec un token ; déploiement Cloud seulement après la fusion de 02-bis
  (adresse + `start_block`), schéma v3 (réindexation complète).

## 6. `/code-review high`

Lancée sur ce worktree (AM-02.9 vérifié : les constats citent les fichiers d'`ancre-indexer-revue`). **8 constats, 8
traités**, chacun avec un test (détail au journal) : arête inventée qui masquait une omission (dilution jugée sur le
budget après preuves, haute) ; leurres imbriqués qui épuisaient le plafond (filtre `setId` avant décodage, haute) ;
garde du `main` de `check.ts` contournée par un lien symbolique ; SOURCE_MISSING → `proveWallet` ; cache `nodeKeyAt`
lu au tag `finalized` ; `NodesAdded` sans relecture de table dans le cas courant ; tags de schéma non UTF-8 hachés sur
leurs octets ; sélecteurs précalculés.

## 7. Commits

Branche `chantier/indexer-revue`, non poussée : corrections de la revue, puis traitement de `/code-review` et rapport.
Rien hors de `indexer/`, du journal et de ce rapport ; `solver/tests/fixtures/indexer/` non modifié.

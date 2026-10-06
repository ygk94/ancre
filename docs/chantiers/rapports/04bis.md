# Rapport du chantier 04-bis — solveur aligné sur le tour 7, snapshot rafraîchi, vecteurs communs, Alchemy

> Session du 2026-10-06, branche `chantier/04bis-solveur` (worktree `/Users/hugo/Projet/ancre-04bis`). Journal détaillé : `docs/chantiers/journal/04bis.md`.
> Chiffres **MESURÉS** le 06/10 par les commandes citées, sauf mention contraire. Aucune transaction réelle, aucun push, aucune publication. Les transactions citées ont eu lieu sur un **fork local anvil**.

## 1. Ce qui est livré

| Étape | Livrable | État |
|---|---|---|
| E1 | `graph.py` : **règle B** (R6 sur le signe combiné : un contrôleur n'est rejeté que pour w > 0), **règle A** (un agent dont la source est une ancre ne porte aucune ligne), **diagnostic AM-9.3** (`Graph.diagnostics`, « ancien contrôleur, N blocs après le transfert », sans effet). Correctif de la revue : `apply_transfer` (A→B→A). Unification `export.main` ↔ `run_mainnet` (revue). `watcher.audit` : ligne sourcée par une ancre = SOURCE. FORMAT.md R6, R8, §5-§7 | ✅ |
| E2 | `refresh.py` : snapshot roulé depuis la chaîne (logs rpc1 + `readAllFeedback` au bloc cible). Snapshot `data/mainnet-110994810.*`, acte 1 recalculé (`out/mainnet.md`, section (g) D48) | ✅ |
| D55 | `alchemy_hook.py` : récepteur de Custom Webhook (HMAC, dédup, file, mesures de délai et d'état de commit), branché sur le certificateur et le surveillant existants, sondage en repli ; filtre GraphQL généré ; charges utiles rejouées depuis de vrais logs | ✅ en local ; 🧑 webhook réel |
| E3 | `common_vectors.py` → `vectors/common/` (8 vecteurs autonomes pour les mocks de 02-bis : A ×3, B, C, 2ᵉ saut ×2, address(0)) ; `mainnet_slash_anchor` régénéré (ancres 0x0730 / 0x794c) ; FORMAT.md §8 | ✅ |
| E4 | Renommage solveur `is_trusted` → `passes_anchor_policy` ; scénario `common` dans `simulate.py` ; rejeu fork contre le contrat de `main` | ✅ côté solveur ; ⏳ rejeu contre 02-bis (pas encore commité) |
| E5 | `/code-review high` sur ce worktree | voir §6 |

Tests : **169 verts** (`cd solver && .venv/bin/python -m pytest -q tests`), contre 135 au démarrage.

## 2. Mesures

**Snapshot (E2)** — `refresh.py --to-block 110994810`, 06/10 08:50 UTC, 3,6 s.
- **8 nouveaux avis** depuis le bloc 108 835 675 (7 dans la veille du 05/10, plus `0x77a5…` → #10280 au bloc 110 872 159), **0 révocation, 0 `Upgraded`**. **Total : 9 291 avis.** 10 281 agents.
- **Part de la ferme : 7 665 / 9 291 = 82,50 %.**
- **0 arête nouvelle au schéma de référence** : l'acte 1 ne change pas (chaîne #18 → {#2, #3}, slash de #4, Eve à 0, fuite du scanner, #8317).
- **AM-9.3 réel** : `0x4947…` transfère #10255 au bloc 109 331 923 et le note **918 blocs après** (≈ 4,6 min à 0,302 s/bloc).

**Règles A et B sur le mainnet** (E1) — schéma de référence : **0 négatif de contrôleur** (B ne change aucune arête réelle). Ancien vecteur de démo {0xea0b, 0x0730} : #18 perd sa copie (A), eUp = 0,44 WAD (marge de troncature).

**Fork** (`anvil --network monad`, bloc 110 994 810, contrat de `main`)
- 9/9 vecteurs acceptés, différentiel exact (setId, eEff, racines, masse, q) ; copies mutées rejetées.
- Violations : comportement inchangé (Registry-verified refuse fabriquée et gonflée ; le reste est prouvé).
- **Vecteurs communs : toutes les attaques passent sur le contrat actuel** (A copie, A mainnet à 1 039 953 gas, address(0), C : preuve à 280 509 gas puis resoumission de la même ligne fausse acceptée). Le contrat 02-bis doit les refuser.

**Alchemy** — local, à blanc : POST signé → plan du certificateur, **médiane 1,2 ms** (20 POST). RPC : `latest`, `safe`, `finalized` répondent (`safe = latest`, `finalized = latest − 1` à la sonde). **NON MESURÉ** : délai réel bloc → webhook, état du bloc à l'envoi.

## 3. Décisions et raisons

| Décision | Raison |
|---|---|
| B testée sur le **signe de la combinaison R5** | C'est ce que relit le contrat (combinaison D14, puis contrôle) |
| Agent sourcé par une ancre : **aucune ligne**, même vide | Ligne vide avec SRC = ancre : `AnchorAsSource` ; sans SRC : exige wallet = 0. La marge ne touche que eUp |
| `mainnet_slash_anchor` : ancres {0x0730, 0x794c} | Aucune n'est le wallet d'un agent. Le seul négatif utile du mainnet vient de 0xea0b (wallet de #18) : **le bit de veto d'ancre n'existe que dans les vecteurs jouets** |
| `mainnet_em_d44` gardé avec ses ancres EM | Elles sont owners de #10184 / #10181 : c'est la règle A par VIA_OWNER sur données réelles (2 lignes en moins, marge sur eUp) |
| Relecture **par agent touché** (`readAllFeedback`), liste remplacée | Ce qui entre dans le snapshot est ce que le registre stocke, révocations comprises |
| Webhook = **déclencheur**, pas source de données ; 200 avant traitement ; sondage gardé | Envio reste la base (D42) ; pas de relances en rafale ; complétude |
| Vecteurs communs **autonomes** (registre + attendus) | Rejouables par 02-bis sur ses mocks en Registry-verified, sans fork |

## 4. Angles morts

| Id | Angle mort | Statut |
|---|---|---|
| AM-04bis.1 | Sous B, un wallet peut garder un **négatif vers l'agent qui porte sa propre ligne** (#8317 en schéma stress) : boucle jamais encodable. `proveEdge` ne doit rien prouver si agentJ est l'agent de la ligne | relayé à 02-bis (journal, INTERFACE) |
| AM-04bis.2 | **0x794c, ancre du vecteur `mainnet_slash_anchor`, est un ancien owner de #4** qu'il note. Légal (D20), mais pas une ancre exemplaire. Le mainnet n'offre aucune autre adresse-nœud utile | documenté ; la démo positive reste notre trafic (acte 2) |
| AM-04bis.3 | **Aucun vecteur mainnet ne montre le bit de veto d'une ancre** sans violer A | couvert par `common_B_controller_negative` (jouet) |
| AM-04bis.4 | Le diagnostic AM-9.3 n'a pas de bloc de transfert pour l'historique antérieur au 21/09 (le snapshot de base ne date pas les transferts) | « blocs inconnus » affiché ; l'indexeur (03) peut fournir `pastOwnerUntil` |
| AM-04bis.5 | Syntaxe `topics: [[…]]` du filtre Alchemy et format exact de la charge utile sur Monad : **NON VÉRIFIÉS** (doc générique, pas de compte) | à valider par « Test Webhook » |
| AM-04bis.6 | Résolution de `latencyS` = 1 s (timestamp Monad en secondes) pour des blocs de 0,3 s ; l'écart en blocs (`behindLatest`) est le meilleur indicateur | documenté |
| AM-04bis.7 | Le rejeu fork échoue parfois sur un `cast send` sans message (délai cast ↔ anvil, AM-INT.11) : un passage sur deux le 06/10 | relancer ; ne pas conclure sur un seul échec |
| AM-04bis.8 | Les vecteurs communs jouets ne passent sur le fork qu'en Submitter-attested (leurs registres n'y sont pas) : le niveau Registry-verified n'est testable que sur les mocks de 02-bis | à faire par 02-bis (E6) |

## 5. Écarts

- `mainnet_slash_anchor` régénéré dès E1 (prévu en E3) : la règle A rendait l'ancien invalide pour le surveillant.
- Le rejeu contre le contrat corrigé n'est pas fait : **02-bis n'a pas commité son contrat** (7 tests rouges en local au moment de ce rapport). Le rejeu contre `main` établit l'état « avant correction ».
- Le nettoyage optionnel de `synthetic.py` (solveur flottant, `WAD` redéfini) n'est pas fait.

## 6. Revue `/code-review high` (06/10, worktree 04-bis, `git diff bc2d911..HEAD -- solver/`)

10 constats ; 9 corrigés, 1 relayé. Tests de non-régression : `tests/test_review_04bis.py`.

| # | Constat | Suite |
|---|---|---|
| 1 | Webhook : événements marqués « vus » **avant** la recertification ; un `data_behind` ou une exception n'était jamais rejoué par le sondage | **corrigé** : marqués vus seulement après succès ; le sondeur reprend au premier bloc en attente |
| 2 | Surveillant : une ligne sourcée par une ancre était classée SOURCE (`proveWallet` revertirait `NothingToProve`) et ses arêtes n'étaient plus auditées | **corrigé** : constat ANCHOR_SOURCE (info), arêtes auditées (une arête fabriquée reste prouvable) |
| 3 | Webhook et sondeur pouvaient lancer `run_once` en parallèle | **corrigé** : verrou d'exécution |
| 4 | L'indexeur (`indexer/src/lib/edges.ts`) applique encore l'ancienne R6 (rejet de tout contrôleur) | **relayé au chantier 03** (hors périmètre : `indexer/` non modifié ici) |
| 5 | `refresh.get_logs` ne découpait une plage refusée qu'après 6 relances, et jamais sur une erreur HTTP | **corrigé** : erreur JSON-RPC ou 4xx = refus déterministe, découpage immédiat |
| 6 | Diagnostic AM-9.3 : premier avis pris parmi tous les avis (révoqués, hors filtre) ; balayage complet par couple | **corrigé** : seuls les avis qui peuvent faire une arête ; index construit une fois |
| 7 | Mémoire de dédup et liste de résultats sans borne | **corrigé** : élagage sous (bloc max − 20 000), liste supprimée |
| 8 | `scenario_common` reconstruisait le registre à la main (sans approbations ni opérateurs) | **corrigé** : `Reg.from_block` |
| 9 | Signatures d'events et clients JSON-RPC dupliqués (`refresh`, `alchemy_hook`) | **corrigé** : topics dérivés de `certifier.REGISTRY_EVENTS`, un seul client (`refresh.Rpc`) |
| 10 | Chiffres tiers non sourcés (relances Alchemy « 10 min », plafond « 10 k logs ») | **corrigé** : DOC datée / source et NON MESURÉ |


## 7. Questions pour Hugo

1. 🧑 **Alchemy** : compte, app « ANCRE » (mainnet + testnet), clé de signature du webhook, jeton Notify, URL HTTPS publique (tunnel pour la démo, hôte permanent du 13 au 27/10), dans `solver/.env`.
2. Garder 0x794c comme ancre du vecteur de test `mainnet_slash_anchor` (ancien owner de #4), ou revenir aux ancres honnêtes {0x0730, 0xf7d5} (le vecteur ferait alors doublon avec `mainnet_honest_d20`) ?
3. D44 (repli owner) : toujours en attente. Effet nouveau : avec D44, la règle A retire leur ligne aux agents dont l'owner est une ancre (cas réel `mainnet_em_d44`).

## 8. Ce qui reste à faire

1. Rejouer `simulate.py --scenarios vectors,violations,common` contre le contrat de 02-bis dès son commit ; vérifier `expect.submission` de chaque vecteur commun.
2. Webhook Alchemy réel sur le testnet : `alchemy_hook.py query --chain 10143 --ancre <adresse>`, « Test Webhook », `serve`, puis mesure du délai et de l'état de commit avant de le pitcher.
3. Relais au pilote : règle B pour l'indexeur (`edges.ts`, SetEdge) et l'ERC §3.3 ; `pastOwnerUntil` et `b` dans le format d'export de l'indexeur ; test de 02-bis à pointer sur `common_A_mainnet_old_slash_anchor.json`.
4. Optionnel : nettoyage de `synthetic.py`.

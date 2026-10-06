# Rapport du chantier plugin-revue : les 18 constats de la revue maximale sur `plugin/`

> Session du 2026-10-06, branche `chantier/plugin-revue` (worktree `/Users/hugo/Projet/ancre-plugin-revue`, depuis `main` 89c959e).
> Journal détaillé (id, correction, test) : `docs/chantiers/journal/plugin-revue.md`. Source des constats : `docs/revue/revue-max-2026-10-06-complete.md`.
> **Aucune transaction réelle, aucun push, aucune publication npm.** Rien de modifié hors de `plugin/` et des fichiers du chantier.

## 1. Bilan

**18 constats sur 18 corrigés côté plugin, chacun avec un test de non-régression. `npm test` : 76 tests verts** (48 au départ).

| Id | Gravité | État | En une ligne |
|---|---|---|---|
| M4 | Moyenne | ✅ corrigé, limites écrites | L'override lit le payeur par la passerelle MetaMask seulement (`eth_chainId` vérifié, plus de `--rpc-url`) et exige un payeur **épinglé** par l'Agent Wallet : mode serveur, opérateur du payeur, adresse dans sa politique Guard Mode |
| K15 | Moyenne | ✅ | `PAYMENT-RESPONSE success:true` + hash = payé, quel que soit le statut HTTP (flux upfront) |
| A4a | Moyenne | ✅ | Sans preuve, `USDC.authorizationState(autorisant, nonce)` décide ; « non payé » seulement si `/verify` a refusé ou si le payeur refuse à ce bloc, sinon `UNKNOWN` |
| K21 | Moyenne | ✅ | `payer status` et l'override partagent `payerRoles()` sur toutes les adresses du wallet hôte |
| M3 | Moyenne | ✅ | `ancreGuard` applique la règle d'offre du CLI (`offerProblem`), exige `chainId`, refuse un `agentWallet` nul |
| D3e | Faible | ✅ | Un montant vide est une erreur |
| K17 | Faible | ✅ | Erreur RPC sur `getAgentWallet` = `ANCRE_RPC_ERROR` |
| K16 | Faible | ✅ | L'échec de `--naive` ne masque plus le verdict |
| M1 | Faible | ✅ | Chaque sortie de `pay` est journalisée (`pay_aborted`, `unknown`) |
| K18 | Faible | ✅ | Note d'override seulement pour un refus que l'override accepte |
| K20 | Faible | ✅ | `eth_chainId` du lecteur comparé à `--chain-id` |
| A4g | Faible | ✅ | Ctrl-C ferme la page de signature |
| A4d | Faible | ✅ | Modèles gardés par nonce, « Signed » seulement après acceptation |
| A4e | Faible | ✅ | `io.isInteractive` de l'hôte + `-f` |
| A4f | Faible | ✅ | Owner **ou** trésorerie de l'agent = refus |
| K19 | Faible | ✅ | `maxPerPayment` n'est plus un filtre : `OVER_LIMIT` journalisé, avec la note d'override |
| K5 | Faible (PLAUSIBLE) | ✅ | Signature high-s ramenée en low-s |
| SIMP7 | Nettoyage | ✅ | `AncreError` unique, `ANCRE_INTERNAL` pour le reste, doublons et code mort retirés |

## 2. M4 : ce qui tient, ce qui ne tient pas

**Solution retenue.** La « config signée de l'Agent Wallet » que le plugin peut atteindre est la **politique Guard Mode** du server wallet : elle vit chez MetaMask, et sa modification passe par le flux de politique de l'hôte (MFA possible). Le contexte de plugin n'expose pas la session, donc la politique est lue par `mm wallet policy get --json`, lancé avec le même Node et le même point d'entrée que le processus courant (un faux `mm` dans le PATH n'est pas utilisé). L'override refuse avant toute requête si : le lecteur n'est pas sur la chaîne demandée ; l'état du wallet hôte est illisible ; le wallet sélectionné n'est pas en mode serveur ; il n'est pas opérateur du payeur ; l'adresse du payeur n'est pas dans une allowlist d'adresses de contrats de la politique **de ce wallet** (JSON `{ policy, address }` parsé, une adresse sous token recipients, deny ou block ne compte pas) ; la politique est illisible ou d'un format inconnu. Owner et trésorerie sont ensuite lus par la passerelle seule.

**Ce que ça ferme.** Le PoC de la revue (faux RPC ou payeur déployé par l'agent, owner = trésorerie = clé K financée par l'agent, page pilotée sans navigateur) : la commande n'accepte plus de RPC, et un payeur hors de la politique Guard Mode est refusé.

**Limites (écrites dans le README).**
- Un agent qui exécute du code arbitraire sous l'utilisateur peut lancer une copie modifiée du plugin et écrire ce qu'il veut dans le journal local. Aucun contrôle local n'y peut rien. Ce qui reste vrai on-chain : un override ne dépense que l'adresse du signataire, jamais le payeur ni l'Agent Wallet ; un agent qui « force » avec sa propre clé paie avec son propre argent, ce qu'il pourrait faire sans le plugin.
- **NON VÉRIFIÉ** : que la modification de la politique Guard Mode exige la 2FA de l'humain (mm 7.0.0 sait répondre `mfaRequired`), et le format réel de `mm wallet policy get --json` (le schéma YAML n'est pas public : le plugin suppose `{ policy, address }` et une clé d'allowlist, et refuse tout le reste). À essayer avec la session de Hugo, en même temps que le vrai `mm ancre override` déjà en attente (rapport 05, étape 🧑 2). Si le format ne contient pas l'adresse, l'override refusera avec `ANCRE_OVERRIDE_UNPINNED` : c'est l'échec sûr.
- Une garantie plus forte serait on-chain (par exemple un registre de l'override signé par l'owner du payeur) : hors périmètre du plugin, à décider au conseil si l'override doit compter dans le pitch (D53 : le plugin n'est plus visé par un bounty).

## 3. ABI 02-bis

`src/lib/payerAbi.ts` est régénéré depuis `chantier/02bis-corrections` (build forge dans le scratchpad, branche non modifiée) : `passesAnchorPolicy`, `Assessment.passesPolicy`, `Policy.strictTransfer`. Le plugin et ses tests parlent cette ABI. Conséquences à traiter à la fusion de 02-bis (chantier d'intégration) :
- `scripts/demo-local.mjs` est adapté aux rôles séparés de 02-bis (`T1_TREASURY` = humain, `T1_OPERATOR` = clé d'agent) et à `T1Oracle.passesAnchorPolicy` ; il ne tourne qu'avec les contrats 02-bis (il n'a pas été exécuté ici).
- Sur `main`, `scripts/setup-fork.mjs` et `t1.mjs` restent compatibles en lecture (champs renommés seulement).

## 4. Tests

- `cd plugin && npm test` : 76 tests, 0 échec. Nouveaux tests nommés par identifiant de constat (`flows.test.mjs`, `override.test.mjs`, `guard.test.mjs`, `lib.test.mjs`), dont trois PoC de la revue repris : `guard_net.mjs` (M3), `poc_dblclick.mjs` (A4d, sur le vrai serveur de page), faux RPC de K20 (vrai client viem).
- `/code-review high` sur ce worktree (chemin et branche vérifiés, AM-02.9) : 9 constats, 8 corrigés avec test (REFUSED exige un nonce lu et inutilisé ; politique Guard Mode vraiment parsée : wallet vérifié, clé d'allowlist ; offre sous `maxPerPayment` préférée ; page de signature qui reste ouverte après un refus ; trous de journal bouchés ; un seul contrôle `eth_chainId` ; une seule vérification de la signature ; une seule clé de nonce). Le 9e (ABI en avance sur `main`) est voulu, voir §3.

## 5. Non corrigé côté plugin

Aucun des 18. À reporter ailleurs :
- **K5, côté contrat** : accepter aussi high-s dans `_recover` serait la défense en profondeur (les nonces du jeton bornent le rejeu) ; chantier 02-bis, facultatif depuis la normalisation du plugin.
- **M4, garantie on-chain** : voir §2, décision de conseil.

# Journal plugin-revue

> Chantier : corriger les 18 constats de la revue maximale du 06/10 sur `plugin/` (relais `docs/chantiers/relais/revue-vers-plugin.md`). Worktree `/Users/hugo/Projet/ancre-plugin-revue`, branche `chantier/plugin-revue` depuis `main` 89c959e. Tests : `cd plugin && npm test` (build compris).

## 2026-10-06

### ABI 02-bis

- `scripts/gen-abi.mjs` prend le dossier `out` en argument et exige `passesAnchorPolicy`. ABI régénérée depuis `chantier/02bis-corrections` (`git archive` de `contracts/src` dans le scratchpad, `forge build`, 3 fichiers) : `isTrusted` → `passesAnchorPolicy`, `Assessment.trusted` → `passesPolicy`, `Policy.strictTransfer` (affiché par `payer status`), erreurs `FastTransferSet` et `OperatorIsTreasury`. La branche 02-bis n'a pas été modifiée.
- `scripts/demo-local.mjs` préparé pour les contrats 02-bis (rôles séparés : `T1_TREASURY` = humain, `T1_OPERATOR` = clé fraîche qui tient lieu d'Agent Wallet). Il ne tourne qu'après la fusion de 02-bis (il déploie `../contracts`).

### Constats

| Id | Correction | Test de non-régression |
|---|---|---|
| **M4** | L'override ne lit plus le payeur que par la passerelle MetaMask (`ctx.publicClient`) : plus de `--rpc-url`, `ANCRE_RPC_URL` ignoré, `eth_chainId` vérifié. Le payeur doit être **épinglé par la configuration de l'Agent Wallet** : wallet sélectionné en mode serveur, opérateur du payeur, et adresse du payeur présente dans sa politique Guard Mode (lue par `mm wallet policy get --json`, avec le même Node et le même point d'entrée que le processus, pas un `mm` du PATH). État de l'hôte illisible, BYOK, politique illisible : refus (`ANCRE_OVERRIDE_UNPINNED`). Commande : `requiresAuth`/`requiresInit` à vrai. Limites écrites dans le README (code modifié, journal local, 2FA de la politique et format de sortie non vérifiés en session réelle) | `override.test.mjs` : « M4: the payer must be pinned… » (6 cas, aucune requête, journalisé), « M4 PoC: a fake reader… » (PoC de la revue : clé K de l'agent comme owner et trésorerie, payeur hors politique → refus ; pas de flag `rpc-url` dans la commande), « M4: readGuardPolicy runs… » (sous-processus réel, PATH vidé) |
| **K15** | `paidResponseEvidence` : `PAYMENT-RESPONSE success:true` avec hash = payé quel que soit le statut HTTP, dans `pay` et `override` | `flows.test.mjs` « K15: upfront flow, HTTP 500… » ; `override.test.mjs` « K15 (override)… » |
| **A4a** | Sans preuve dans la réponse, lecture de `USDC.authorizationState(autorisant, nonce)` : utilisé → `PAID` ; sinon `REFUSED` seulement si le serveur a refusé à `/verify` (402 + nouveau `PAYMENT-REQUIRED`) ou si `explain` refuse à ce bloc ; tout le reste (5xx, 504, `settlement_pending`, `/settle` en échec, nonce illisible) → `UNKNOWN` avec `liveAuthorization`. Même règle pour l'override (autorisant = l'humain) et pour un GET payé qui lève | `flows.test.mjs` « A4a… » (pending avec hash, délai du facilitateur, 504 de proxy, 2xx sans preuve, GET coupé) ; « an RPC failure after sending… » ; `override.test.mjs` « A4a (override)… » |
| **K21** | Un seul helper `payerRoles()` pour `payer status` et `override` ; `payer status` reçoit toutes les adresses du wallet hôte (`allWalletAddresses`) et vérifie le solde USDC de chacune | `flows.test.mjs` « K21: payer status covers every host wallet address… » |
| **M3** | `offerProblem()` partagé avec `selectOffer` : `ancreGuard` exige désormais `chainId` (143/10143), refuse réseau, schéma, actif, domaine EIP-712, méthode et montant hors règle, et un `agentWallet` nul ; `getChainId` optionnel vérifié une fois ; appelle `passesAnchorPolicy` | `guard.test.mjs` « M3… » (PoC `guard_net.mjs` : Base, Ethereum, Solana, upto, autre actif, 1e9, wallet 0x0, lecteur sur 10143, chaîne non prise en charge) |
| **K5** | `normalizeSignature` ramène s dans la moitié basse (s' = n − s, v inversé), rejette s nul ou ≥ n ; codes `ANCRE_BAD_SIGNATURE` | `lib.test.mjs` « K5… » (jumeau high-s d'une vraie signature viem : même signataire, normalisé à l'identique, aussi dans le blob de 246 octets) |
| **D3e** | `optionalUsdc()` : un flag de montant présent mais vide lève `ANCRE_BAD_AMOUNT` (check, inspect, pay, override) | `lib.test.mjs` « D3e… » (helper + les quatre commandes compilées) |
| **K17** | `check` ne transforme plus une erreur de `getAgentWallet` en adresse nulle : `ANCRE_RPC_ERROR` | `flows.test.mjs` « K17… » (aucun `decide(agentId, 0x0)`) |
| **K16** | Partie `--naive` isolée : en cas d'échec, `naive.error` et le verdict ANCRE est rendu | `flows.test.mjs` « K16… » |
| **M1** | `journaler()` commun : chaque sortie de `pay` est journalisée une fois (nouveau type `pay_aborted` : RPC, HTTP, refus du wallet, signataire non opérateur ; `unknown` pour un GET payé qui lève) ; l'override passe par le même mécanisme | `flows.test.mjs` « M1… » (5 cas, dont le refus « payer unfunded » resté unique) |
| **K18** | `overridable()` : la note d'override n'accompagne que les refus que `decide()` peut rendre (ceux que l'override accepte), jamais `SETTLEMENT_FAILED` ni une erreur de signature ou de blob | `flows.test.mjs` « K18… », « a /verify refusal whose explain says OK… » |
| **K20** | `hostDeps` vérifie `eth_chainId` du lecteur (`--rpc-url` ou passerelle) contre `--chain-id` : `ANCRE_WRONG_CHAIN` | `flows.test.mjs` « K20… » (vrai client viem sur un faux RPC qui répond 10143) |
| **A4g** | `humanSign` prend `signal` (io.signal) : Ctrl-C ferme la page, annule le minuteur et rejette ; vérification de `signal.aborted` après la signature ; la question au terminal écoute aussi le signal | `override.test.mjs` « A4g… » (page fermée, < 5 s, journal `override_failed`) |
| **A4d** | Chaque modèle émis est gardé par nonce, la page renvoie le nonce signé, la vérification du signataire (`accept`) a lieu **avant** de répondre « Signed » ; un refus est affiché sur la page | `override.test.mjs` « A4d: a double click… » (PoC `poc_dblclick.mjs` : deux `/template`, le premier signé → payé avec ce nonce), « A4d: a refused signature is reported on the page… » |
| **A4e** | `isInteractive` exige aussi `io.isInteractive` de l'hôte (faux dès que mm choisit le rendu sans tête : `-f`, `--format`, `mm config set format json`) et reconnaît `-f`, `-f=json`, `-fjson` | `override.test.mjs` « isInteractive… » |
| **A4f** | Override refusé si l'owner **ou** la trésorerie est une adresse de l'agent (payeur, opérateur, n'importe quelle adresse du wallet hôte) | `override.test.mjs` « A4f… » (3 combinaisons) |
| **K19** | `selectOffer` ne filtre plus sur `maxPerPayment` : `decide` répond `OVER_LIMIT`, journalisé, avec la note d'override | `flows.test.mjs` « K19… » ; `lib.test.mjs` « selectOffer… » |
| **SIMP7** | Une seule classe `AncreError` (`errors.ts`), `identityAbi` partagé, `CHAINS[*].rpc` supprimé, `toCommandError` laisse passer une `CommandError` de l'hôte et enveloppe tout le reste en `ANCRE_INTERNAL` ; plus d'`Error` brute dans `payer.ts`. `HumanSignature.template` est désormais lu (A4d). Helpers upto gardés (`scripts/t1.mjs`) | `lib.test.mjs` « SIMP7… » |

### Docs

- `plugin/README.md` : override (épinglage, passerelle seule, limites écrites honnêtement, plus de « any freshly funded key is refused » absolu), issues d'un paiement (PAID / REFUSED / UNKNOWN), journal (`pay_aborted`), garde SDK (`chainId`, `register("eip155:143")`), statut (ABI 02-bis, override non essayé en session réelle), 70 tests.
- `plugin/skills/ancre/SKILL.md` : agir sur `outcome` (UNKNOWN = peut-être payé, ne rien re-signer avant `validBefore`), note d'override absente hors refus d'ANCRE, `OVER_LIMIT`.

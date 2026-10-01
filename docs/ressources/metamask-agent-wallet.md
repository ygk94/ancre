# MetaMask Agent Wallet : plugins `mm` et skills (ressource, vague 1)

> Recherche documentaire du **2026-09-27** pour le bounty *MetaMask, Best Agent Wallet Plugin* (2 500 $, fiche dans `docs/conseil/bounties-sponsors.md`, chantier `docs/chantiers/05-router-x402.md`).
> Étiquettes : **DOC** = doc officielle ou code source publié par MetaMask · **EXEMPLE** = dépôt d'exemple officiel ou plugin tiers · **TIERS** = source non officielle (auto-déclaré) · **DÉDUIT** = lu dans le code compilé, non testé · **NON TROUVÉ**.
> Rien n'a été **mesuré** par nous : pas d'installation de `mm`, pas de compte, pas de transaction. Les dépôts et paquets npm ont été téléchargés et lus dans le scratchpad, sans rien exécuter.

## 0. En bref

- L'Agent Wallet est un **CLI Node** (`mm`, paquet npm `@metamask/agent-wallet`, **v7.0.0** du 16/09/2026) qu'un agent IA (Claude Code, Codex, Cursor…) pilote grâce à des **skills**. Les clés vivent soit dans un **server-wallet en TEE** chez MetaMask, avec politique Guard/Beast et MFA, soit en local (BYOK, mnémonique).
- **Monad mainnet (143) et Monad testnet (10143) sont dans la liste des chaînes préconfigurées.** Monad 143 bénéficie même de Transaction Shield (scan Blockaid). On ne peut pas ajouter de chaîne : `network-manage` est « réservé ».
- Un **plugin** est un **paquet npm oclif** qui ajoute des commandes `mm <topic> <cmd>`. Il déclare un bloc `mm` dans `package.json` (capabilities par commande) et étend `PluginCommand`. Pour lire, il utilise `this.ctx.publicClient(chainId)` (viem : `readContract` sur `assess` fonctionne). Pour signer, il passe par `this.ctx.walletExecutor(io, id)`, qui route **toute** requête par la politique et le MFA de MetaMask. Le plugin ne voit jamais de clé.
- **Le `SKILL.md` n'est pas dans le paquet npm** : c'est un fichier de skill d'agent (frontmatter YAML `name` + `description`), distribué à part, dans le dépôt, comme `MetaMask/agent-skills`.
- **x402** : c'est la skill officielle qui le prend en charge, avec un script Python, pas le CLI. Seul le schéma **`exact`** (EIP-3009) est accepté ; **`upto` ne l'est pas**. Aucune mention d'ERC-8004 dans la doc ni dans les skills MetaMask.
- **Point clé pour ANCRE** : Guard Mode ne sait exprimer que des allowlists (réseaux, adresses, destinataires de tokens) et un plafond de sortie sur 24 h. **Les signatures ne comptent pas dans ce plafond** (DOC), et un tiers rapporte que les signatures EIP-712 passent **sans MFA** (TIERS). Un paiement x402 (une signature EIP-3009) échappe donc presque à tous les garde-fous : c'est exactement le trou qu'un garde ANCRE vient combler.
- **Piège majeur** (DÉDUIT) : le template et les exemples déclarent `minCliVersion: "^6.2.0"`, or le CLI vérifie cette plage avec `semver.satisfies`. `^6.2.0` **exclut la 7.0.0** actuelle, et l'installation doit échouer avec `PLUGIN_CLI_VERSION`. Utiliser `">=6.2.0 <8"`.
- Concurrence directe sur ce bounty : **Beltran12138/warrant**, un plugin `mm`, sur Monad, qui écrit dans ERC-8004 Reputation (§7).

## 1. Ce qu'est l'Agent Wallet

| Fait | Source | Statut |
|---|---|---|
| « fully self-custodial agent wallet that lets AI agents trade autonomously ». On installe le CLI `mm` et les skills, puis on parle en langage naturel dans Claude Code, Codex, Cursor… | https://docs.metamask.io/agent-wallet/ · https://metamask.io/agent-wallet | DOC |
| `npm install -g @metamask/agent-wallet@latest` donne le binaire `mm`. Il faut **Node ≥ 22.18**. Parcours : `mm doctor`, `mm login` (navigateur Google/e-mail, ou QR MetaMask Mobile), `mm init`, puis `mm doctor` | https://docs.metamask.io/agent-wallet/cli-setup/ | DOC |
| Le CLI s'appuie sur `@metamask/agent-sdk`. Session dans `~/.metamask/session.json`, wallets dans `~/.metamask/wallets.json` | https://docs.metamask.io/agent-wallet/reference/architecture/ | DOC |
| Deux modes de wallet : **server-wallet** (clés en TEE côté MetaMask, modèle asynchrone avec `pollingId`, `--wait`) et **BYOK** (mnémonique via `MM_MNEMONIC`, jamais en argument) | idem | DOC |
| Chaque transaction passe par une **simulation**, un **scan Blockaid** (sur les chaînes « Covered »), un **relais gasless EIP-7702** si l'agent manque de gas natif, et un **batch ERC-7821** (approve + trade) quand c'est possible | idem | DOC |
| **Attention aux trois modes de connexion** (Google, e-mail, QR) : chacun donne une **adresse de server-wallet différente** | cli-setup | DOC |
| Versions npm : 6.0.0 (06/08), 6.1.x (11 au 27/08), **6.2.0 (02/09, arrivée des plugins)**, 6.2.1 (14/09), **7.0.0 (16/09, `latest`)** | https://registry.npmjs.org/@metamask/agent-wallet | DOC |
| **7.0.0, changement cassant de licence** : on passe de MIT/Apache à une « MetaMask source-view license », qui limite l'usage à l'inspection et à l'étude du code. Importer le SDK en `peerDependency` ne le redistribue pas, mais **ne rien vendoriser** | `CHANGELOG.md` du paquet 7.0.0 | DOC |
| Le dépôt source `MetaMask/agentic` (et son `docs/plugin-system.md`, cité par l'exemple `sample`) est **privé** : on obtient un 404 | GitHub | NON TROUVÉ |

### Chaînes : Monad est supporté

| Fait | Source | Statut |
|---|---|---|
| La table « Mainnets » contient **Monad `143`**, avec Transaction Shield « Covered ». La table « Testnets » contient **Monad Testnet `10143`** | https://docs.metamask.io/agent-wallet/reference/supported-chains/ | DOC |
| La liste qui fait foi est `mm chains list --json` : `key`, `caip2`, `chainId`, `relaySupported`, `features` | idem | DOC |
| La 6.1.2 corrige `mm transfer` sur Monad (143), qui échouait avec `UNSUPPORTED_EVM_CHAIN` | CHANGELOG 6.1.2 | DOC |
| **Pas de commande pour ajouter une chaîne.** `network-manage` / `ctx.networkRegistry` sont « Reserved for future network management ». Pour une chaîne hors liste, seul `mm wallet balance` retombe sur du RPC direct (Multicall3) | reference/plugins · supported-chains | DOC |
| La table interne `tx-sentinel` (simulation) contient `143: monad-mainnet` mais **pas 10143**. La simulation et le scan sont donc probablement indisponibles sur le testnet Monad | `dist/chunks/*.js` du paquet 7.0.0 | DÉDUIT |
| **Monad testnet, avec mm 6.2.0** : le proxy RPC de MetaMask répond `Invalid chainId` pour 10143, et `mm wallet send-transaction --chain-id 10143` échoue. Le contournement est un shim local (`MM_INFURA_RPC_BASE_URL=http://127.0.0.1:…`, qui relaie vers `testnet-rpc.monad.xyz`) | `scripts/mm-rpc-shim.mjs` et README de Beltran12138/warrant (poussé le 27/09) | TIERS |
| Guard Mode demande **un MFA par e-mail à chaque transaction** sur une chaîne absente des `allowed_chains` par défaut, ce qui est le cas des testnets Monad et Fuji | README warrant | TIERS |

## 2. L'architecture de plugins

### 2.1 Nature et cycle de vie

| Fait | Source | Statut |
|---|---|---|
| Un plugin est un **paquet npm** qui ajoute des commandes natives, visibles dans `mm help` et dans le REPL (exemple de la doc : `mm ens resolve`, « or `mm x402` ») | https://docs.metamask.io/agent-wallet/plugins/ | DOC |
| **Bêta, désactivée par défaut.** Il faut `mm config set experimentalPlugins true`, et en plus `experimentalAllowUnverifiedInstalls true` pour une source `file:`, git ou `mm plugins link` | idem · install-a-plugin | DOC |
| **Modèle de confiance** : le plugin tourne **dans le même processus, sans bac à sable**. Les vraies frontières sont le **consentement à l'installation** et la **signature de politique côté MetaMask**. Les scripts `postinstall` ne sont jamais exécutés (`npm_config_ignore_scripts`) | plugins/index · references/plugins.md de la skill | DOC |
| L'installation échoue fermée (`PLUGIN_METADATA_UNAVAILABLE`). Un paquet qui déclare `oclif.hooks` ou `oclif.plugins` est refusé (`PLUGIN_HOOKS_FORBIDDEN`) | reference/plugins | DOC |
| L'approbation est stockée dans `~/.metamask/config.json`, clé `plugins` : version, intégrité, hash du manifeste, capabilities et ids de commandes approuvés. **Tout changement de version ou de manifeste redemande le consentement** ; en attendant, les commandes tournent avec zéro capability (`PERMISSION_DENIED`) | reference/plugins · skill references/plugins.md | DOC |

### 2.2 Manifeste (`package.json`)

Obligatoire : le mot-clé `oclif-plugin`, une `peerDependency` sur `@metamask/agent-wallet` (**pas** une dépendance normale : le CLI crée un lien symbolique vers lui-même dans son répertoire de données), un bloc `oclif` qui pointe vers `./dist/commands`, et un `oclif.manifest.json` **généré et livré** (sinon `PLUGIN_MANIFEST_FILE_MISSING`).

| Champ `mm` | Rôle |
|---|---|
| `schemaVersion` | vaut `1` |
| `minCliVersion` | plage semver, vérifiée par `semver.satisfies(cliVersion, range, {includePrerelease:true})` (DÉDUIT, `loader-*.js`) |
| `capabilities` | liste globale, fusionnée dans chaque commande. **La laisser vide** |
| `commands[].id` | par exemple `ancre:assess` ; doit correspondre au `pluginCommandId` de la classe. Collision avec une commande intégrée → `PLUGIN_ID_COLLISION` |
| `commands[].capabilities` | `wallet-read`, `wallet-submit` ou `network-manage`. `mnemonic-read` et `config-write` sont réservés : le manifeste est rejeté |
| `commands[].dataAccess` | informatif, affiché au consentement : `accounts`, `balances`, `prices`, `tokens`, `network`, `fees`, `swap-quotes`, `session`, `mnemonic` |
| `commands[].targetChains` | `"any"` ou une liste de chainIds. **Aucune application trouvée dans le code 7.0.0** : ce champ semble purement déclaratif (DÉDUIT) |

Sources : https://docs.metamask.io/agent-wallet/reference/plugins/ (DOC) · `runtime/plugins/manifestSchema.d.ts` du paquet (DOC).

### 2.3 L'API exposée au plugin (`this.ctx`)

| Membre | Capability | Usage |
|---|---|---|
| `logger`, `args`, `flags`, `argv` | aucune | toujours disponibles |
| `accountService`, `authService`, `priceService`, `tokenService`, `feesService`, `walletStateManager`, `swapQuoteStore` | `wallet-read` | lectures du wallet. `walletStateManager.read()` donne `byokWallets` et `remoteWallets` avec `address` |
| **`publicClient(chainId)`** | `wallet-read` | **client viem public, authentifié, par chaîne**, passant par la même passerelle RPC que l'hôte : `readContract`, `multicall`, `getBalance`… Attention, il n'a pas de définition de chaîne attachée : il faut passer les adresses explicitement (remarque de l'exemple ENS) |
| **`walletExecutor(io, commandId)`** | `wallet-submit` | renvoie un exécuteur `(request, opts?) => Promise<EvmWalletResult>` |
| `networkRegistry` | `network-manage` | réservé |

La session, le token CLI et la mnémonique ne sont **jamais** exposés (`PERMISSION_DENIED`). Sources : reference/plugins (DOC), `restrictedContext.d.ts` (DOC).

**Forme exacte des requêtes de l'exécuteur** (DOC, `@metamask/agent-sdk` 7.0.0, `walletExecutor-*.d.ts`) :

```ts
type EvmWalletRequest =
  | { kind: "transaction"; chainId: number; transaction: EVMTransaction /* {to,data,value,…} */; intent?: WalletIntent }
  | { kind: "message";     chainId: number; message: string; intent?: WalletIntent }
  | { kind: "typed-data";  chainId: number; typedData: EVMTypedData; allowDomainChainIdMismatch?: boolean; intent?: WalletIntent };
type WalletIntent = { summary: string; action: "transfer"|"swap"|…|"call"|"custom"; details?: Record<string,string|undefined> };
// opts : { signal?, noAwait?, waitForReceipt? }
// résultat : { kind: "transaction", hash, status, failureCode?, pendingJob?, finalJob? } | { kind: "signature", signature, status, … }
```

L'`intent.summary` est ce qui part au service de signature, et donc ce que l'humain voit dans la demande de MFA. Exemple réel d'usage (EXEMPLE, `estmcmxci/mm-plugin-ensv2`, `src/lib/hostjobs.ts`) :

```ts
const execute = await this.ctx.walletExecutor(io, "ensv2:register");
const r = await execute(
  { kind: "transaction", chainId, transaction: { to, data, value },
    intent: { summary, action: "call", details } },
  { waitForReceipt: true, signal: io.signal });
```

### 2.4 La classe de commande

- Elle étend `PluginCommand` (import depuis `@metamask/agent-wallet/plugin`) et implémente `execute(io)`. Les hooks optionnels sont `afterExecute`, `successHint` et `analyticsOutcome`.
- **Le cycle de vie est scellé** : surcharger `run`, `init`, `beforeExecute`, `withPluginIsolation`… déclenche `PLUGIN_SEALED_OVERRIDE`.
- `requiresAuth` et `requiresInit` valent `true` par défaut.
- Les entrées sont décrites **une seule fois** dans un schéma : `schemaToFlags`, `schemaToArgs`, puis `io.resolveInputs(inputs)`. Les flags `--json`, `--format`, `--toon` et `--verbose` sont hérités.
- Le chemin du fichier fait la commande : `src/commands/ancre/assess.ts` donne `mm ancre assess`, d'id `ancre:assess`.
- Pour les erreurs : `CommandError(code, message, hint)`.

Source : https://docs.metamask.io/agent-wallet/plugins/build-a-plugin/ (DOC) · `PluginCommand.d.ts` (DOC).

### 2.5 Installer et tester

```bash
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true      # dev uniquement
npm run build                                               # tsc && oclif manifest
mm plugins install "file:$PWD" --accept-permissions         # depuis le dossier, pas un .tgz (sinon pas d'écran de consentement complet)
mm plugins link /chemin/plugin                              # alternative sans copie
mm plugins ; mm plugins inspect <pkg> ; mm plugins uninstall <pkg>   # à faire entre deux itérations
npm publish  →  mm plugins install <pkg>                    # chemin « vérifié » pour les utilisateurs
```

- Les commandes `mm plugins …` viennent d'oclif : `--toon` et `--format` n'y fonctionnent pas. `--help` s'écrit `mm plugins:install --help`.
- Côté tests, **aucun harnais officiel**. Le template n'a pas de tests. `mm-plugin-ensv2` teste sa logique pure avec `node:test` et une chaîne simulée, et range l'exécuteur derrière une fonction `Submit` injectable (EXEMPLE). `mm-plugin-allowances` remplace `node_modules/@metamask/agent-wallet` par un lien vers l'installation globale (EXEMPLE).

## 3. Format de `skills/<name>/SKILL.md`

| Fait | Source | Statut |
|---|---|---|
| Le frontmatter YAML contient `name` (identique au nom du dossier), `description` (quand l'utiliser : c'est ce qui déclenche la skill), puis en option `license` et `metadata` (`author`, `version`, `cliVersion`) | https://github.com/MetaMask/agent-skills/blob/main/skills/metamask-agent-wallet/SKILL.md (dernier commit le 24/09) | DOC |
| Structure de la skill officielle : titre, **table de routage** intention → commande → fichier de référence, workflows, flags globaux, **Preflight** (version, puis `mm doctor` jusqu'à `authenticated` et `initialized`), **Safety Rules** (validation des entrées, confirmations par type d'opération, secrets), modèle asynchrone, **pauses MFA** (détecter le jeton `AWAITING_MFA`), règles de sortie. Fichiers annexes dans `references/`, `workflows/` et `scripts/` | idem | DOC |
| Distribution : `npx skills add metaMask/agent-skills`, ou un plugin Claude Code / Codex / Cursor (`.claude-plugin/plugin.json` avec `"skills": "./skills/"`) | README de agent-skills | DOC |
| Le template et les exemples officiels de plugin **ne contiennent aucun `SKILL.md`**. Le bounty l'exige quand même : il faut donc l'ajouter au dépôt du plugin | dépôts template et exemples | DOC |
| Exemple tiers minimal : `warrant/skills/warrant/SKILL.md`. Frontmatter `name` + `description` (« Use whenever you are about to run `mm swap`… »), puis « Before every swap » (étapes numérotées et table verdict → action) et « Never » (interdits, dont « Never try to bypass … Guard Mode or 2FA ») | https://github.com/Beltran12138/warrant | EXEMPLE |

Squelette recommandé pour `skills/ancre/SKILL.md` :

```markdown
---
name: ancre
description: Use before paying or trading with another AI agent through the MetaMask Agent Wallet (mm) — any x402 payment, paid tool call or transfer to an ERC-8004 agent. Runs `mm ancre assess` and refuses to pay when ANCRE returns anything but OK.
license: MIT
metadata: { version: "0.1.0", cliVersion: "7.0.0" }
---
# ANCRE trust gate
## When to use            (x402 402, MCP x402 challenge, transfer to an agent wallet)
## Before every payment   (1. resolve agentId  2. mm ancre assess --json  3. table status → action)
## Status → action        (OK: pay · NO_CERT/STALE: ask human · VETOED/TRANSFERRED/REGISTRY_CHANGED: refuse)
## Paying                 (mm ancre pay … ; never call x402_pay.py directly on a non-OK agent)
## Never                  (bypass Guard Mode/2FA, retry a refused payment, pay on a stale cert)
```

## 4. x402 et ERC-8004

| Fait | Source | Statut |
|---|---|---|
| x402 est porté par la **skill** : `scripts/x402_pay.py` (Python stdlib) avec `inspect <url>` puis `pay <url> --confirm`. La signature EIP-3009 est déléguée à `mm wallet sign-typed-data`. Ce n'est **pas** une sous-commande `mm` | https://docs.metamask.io/agent-wallet/guides/pay-for-apis-x402/ · skill `references/x402.md` | DOC |
| **Accepté** : le schéma `exact` sur `eip155:*` via EIP-3009, protocole v1 et v2, en transport HTTP ou **MCP** (v2 : `_meta["x402/payment"]`, commande `mcp-sign --confirm`). **Refusé** : Permit2, **`upto`**, les réseaux non EVM, les offres sans `name`/`version` EIP-712 | idem · workflows/x402-mcp.md | DOC |
| Règle de la skill : « One payment attempt per resource, never auto-retry. **Autonomous auto-pay is not supported** » | SKILL.md, Confirmation Requirements | DOC |
| En server-wallet, la signature est synchrone (`--wait`). **« Guard Mode permits EIP-712 signing »**. La fenêtre d'autorisation x402 est courte : un MFA lent la fait expirer | guide x402 | DOC |
| La politique de sortie précise : **« Signatures (for example, Permit2) are not included in the outflow calculation as of now »** | https://docs.metamask.io/agent-wallet/reference/outflow-policy/ | DOC |
| Signatures EIP-712 en Guard Mode : « none [approval]: signed immediately, in every attempt » (test sur Fuji et sur le testnet Monad) | README warrant | TIERS |
| **ERC-8004** : aucune occurrence dans la doc Agent Wallet, la skill, le template ou les exemples officiels | grep sur les 4 dépôts | NON TROUVÉ |
| La seule trace d'ERC-8004 est la piste n° 05 de la fiche du bounty (« paid tool calls via x402 payments + ERC-8004 … registry ») | `bounties-sponsors.md` | DOC (fiche) |
| Le facilitator Monad accepte `exact` **et** `upto` (CLAUDE.md §3, vérifié le 23/09). La skill MetaMask ne sait faire que `exact` : **un plugin ANCRE qui paierait en `upto` devrait signer lui-même le typed-data via l'exécuteur**, ce qui est possible avec `kind: "typed-data"` | CLAUDE.md, types de l'exécuteur | DÉDUIT |

## 5. Plugins existants (pour juger ce que « tout le monde fera »)

| Plugin | Contenu | Chaînes | `SKILL.md` | Statut |
|---|---|---|---|---|
| `MetaMask/agent-wallet-plugin-template` (commit du 03/09) | `mm hello ping` | — | non | DOC |
| `MetaMask/agent-wallet-plugin-examples/sample` (02/09) | `ping`, `demo balance` (`publicClient(1)`), `demo submit` (obtient l'exécuteur sans rien envoyer), capabilities réservées | 1 | non | EXEMPLE |
| `…/ens` | `mm ens resolve` via `publicClient(1)` | 1 | non | EXEMPLE |
| `@estmcmxci/mm-plugin-ensv2` 0.8.0 (npm, 04/09) | ENSv2 plus **mint d'agent ERC-8004** lié à un nom, enregistrements ENSIP-25/26, tâches reprenables, 22 commandes | Sepolia seulement | non | EXEMPLE |
| `akugone/mm-plugin-allowances` (15/09) | audit et révocation d'allowances ERC-20 et Permit2 | multi | non | EXEMPLE |
| `CNSLabs/shodai-subscriptions-agent-wallet-plugin` (17/09) | abonnements via un **schéma x402 maison** `shodai-subscription` ; `minCliVersion: ">=6.2.0 <8"` | Base Sepolia | non | EXEMPLE |
| **`Beltran12138/warrant`** (créé le 26/09, poussé le 27/09, ★1) | `mm warrant preflight` : note un swap selon sept critères et atteste on-chain. **`WarrantReputation` → `giveFeedback` dans ERC-8004 Reputation.** Dépôt sur le testnet Monad et Fuji, vidéo et deck. Revendique explicitement « reveals, does not enforce » | 10143, 43113 | **oui** | EXEMPLE |

Ce qu'on en tire :

- Les « super-pouvoirs de trading » attendus (préflight de swap, allowances, ENS) sont déjà pris.
- Personne ne fait de **garde de contrepartie avant paiement** fondé sur l'agrégation d'ERC-8004.
- Warrant **produit** des avis 8004 ; ANCRE les **consomme** et les agrège. C'est complémentaire, mais c'est le même bounty et la même chaîne.

## 6. Politiques : peut-on dire « refuser de payer si ANCRE dit non » ?

| Question | Réponse | Statut |
|---|---|---|
| Une **policy Guard Mode native** peut-elle appeler un contrat ? | **Non.** Le YAML (`mm wallet policy get/set/template`, `schema_version` en tête) n'exprime que l'allowlist de réseaux, l'allowlist d'adresses, l'allowlist de destinataires de tokens et le plafond de sortie sur 24 h glissantes. Le schéma exact n'est pas publié ; il faut un compte pour lire `policy template` | DOC (trading-modes) · TIERS pour la liste des champs (warrant, lue le 14/09) |
| Un **garde dans le plugin** ? | **Oui.** La commande `mm ancre pay` lit `assess` via `publicClient(143)` et **n'appelle pas** l'exécuteur si le statut n'est pas OK. Mais ce garde est **consultatif** : l'agent peut toujours appeler `x402_pay.py` ou `mm wallet sign-typed-data` directement. Seule la skill (« Never … ») le retient | DOC (API) · DÉDUIT |
| Un garde **appliqué** ? | En combinant deux choses : (1) le paiement passe par **`TrustGatedRouter`** (chantier 05, architecture (a)), qui appelle `assess` on-chain et revert si le statut n'est pas OK ; (2) en Guard Mode, l'**allowlist d'adresses et de destinataires ne contient que le router**. Toute autre transaction déclenche alors un MFA humain. Limite : une **signature** EIP-3009 vers un tiers n'est ni une transaction ni une sortie comptée. Rien n'indique que l'allowlist s'applique aux signatures | DÉDUIT, à tester |
| Argument de pitch | « Guard Mode plafonne la dépense, il ne juge pas la contrepartie ; et les paiements x402 sont des signatures, hors du plafond de sortie. ANCRE ajoute la question manquante : *à qui* je paie ? » | DOC (outflow-policy) |

## 7. Éligibilité hors track « Onchain Finance & Trading »

| Fait | Source | Statut |
|---|---|---|
| La page officielle liste « $2,500 Best Agent Wallet Plugin » (MetaMask) parmi des « Bounties and perks for every team in the build », **sans restriction de track visible**. La FAQ dit qu'on choisit **une** track à l'inscription | https://monad.xyz/developers/hackathons/metropolis | DOC |
| Aucune règle publique trouvée sur le cumul track + bounties, ni sur l'éligibilité d'un projet d'une autre track. hackathon.monad.xyz exige une connexion ; risein.com n'en dit rien | hackathon.monad.xyz · risein.com | NON TROUVÉ |
| Un résumé de moteur de recherche affirme « each submission competes in exactly one track; can't win multiple main-track prizes ». **Aucune page source n'a été retrouvée** | WebSearch | NON VÉRIFIÉ |
| Indice : le dépôt `s0urledd/plumb` (PR #8) vise « the entry and both Perpl bounties » avec un seul projet | GitHub | TIERS |
| **À faire** : demander aux organisateurs (Discord) si la mention « track affichée » est un filtre ou une simple suggestion | — | — |

## 8. Structure d'un plugin minimal ANCRE

```
mm-plugin-ancre/
├── package.json            # voir ci-dessous
├── tsconfig.json           # ES2022, module ESNext, moduleResolution Bundler, outDir dist, rootDir src
├── src/commands/ancre/
│   ├── assess.ts           # mm ancre assess <agentId> [--set <setId>] [--chain-id 143]   (wallet-read)
│   └── pay.ts              # mm ancre pay <url> --confirm                                  (wallet-read + wallet-submit)
├── skills/ancre/SKILL.md   # exigé par le bounty ; hors paquet npm ("files": ["dist","oclif.manifest.json"])
└── README.md               # installation, démo ≤ 5 min
```

```json
{
  "name": "mm-plugin-ancre", "type": "module", "keywords": ["oclif-plugin","mm-plugin","erc-8004","x402"],
  "files": ["dist", "oclif.manifest.json"],
  "scripts": { "build": "tsc -p tsconfig.json && oclif manifest", "prepack": "npm run build" },
  "oclif": { "bin": "mm", "commands": "./dist/commands", "topicSeparator": " ",
             "topics": { "ancre": { "description": "Sybil-resistant ERC-8004 trust gate before paying an agent" } } },
  "mm": { "schemaVersion": 1, "minCliVersion": ">=6.2.0 <8", "capabilities": [],
    "commands": [
      { "id": "ancre:assess", "capabilities": ["wallet-read"], "dataAccess": ["network"], "targetChains": [143, 10143] },
      { "id": "ancre:pay", "capabilities": ["wallet-read","wallet-submit"], "dataAccess": ["accounts","network"], "targetChains": [143, 10143] }
    ] },
  "peerDependencies": { "@metamask/agent-wallet": ">=6.2.0 <8" },
  "dependencies": { "viem": "^2.21.0" },
  "devDependencies": { "@metamask/agent-wallet": "^7.0.0", "oclif": "^4", "typescript": "^5" }
}
```

```ts
// src/commands/ancre/assess.ts — esquisse, non compilée
import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand,
         schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { parseAbi } from "viem";
const ANCRE = "0x…" as const;                       // AnchoredReputation déployé
const abi = parseAbi(["function assess(uint256 agentId, bytes32 setId, bool withVeto) view returns ((uint8 status,uint256 trust,uint256 trustRobust,uint256 distrust,uint256 e,uint64 certBlock,uint8 vetoCount,bytes32 triggerTag))"]);
const STATUS = ["OK","NO_CERT","STALE","TRANSFERRED","VETOED","REGISTRY_CHANGED"] as const;
const inputs = {
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId", required: true, index: 0 },
  setId:   { type: InputFieldType.Text, flag: "set", message: "Anchor set id (bytes32)", required: true },
} satisfies InputSchema;
export default class AncreAssess extends PluginCommand<{ status: string; trustRobust: string; triggerTag: string }> {
  static override description = "Ask ANCRE whether an ERC-8004 agent is trusted by your anchor set.";
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:assess";
  async execute(io: CommandIO) {
    const { agentId, setId } = await io.resolveInputs(inputs);
    const x = await this.ctx.publicClient(143).readContract({ address: ANCRE, abi, functionName: "assess",
      args: [BigInt(agentId), setId as `0x${string}`, true] })
      .catch((e) => { throw new CommandError("ANCRE_RPC_ERROR", String(e), "Check connectivity"); });
    return { status: STATUS[x.status], trustRobust: x.trustRobust.toString(), triggerTag: x.triggerTag };
  }
}
```

`pay.ts` : faire `assess`, et seulement si le statut est `OK`, appeler `(await this.ctx.walletExecutor(io, "ancre:pay"))(...)`, de deux façons possibles :
- soit `{ kind: "transaction", chainId: 143, transaction: { to: ROUTER, data } }`, pour que le router re-vérifie on-chain ;
- soit `{ kind: "typed-data", … }` pour une autorisation EIP-3009 x402 `exact`.

Mettre un `intent.summary` lisible (« Pay 0.10 USDC to agent #182 — ANCRE: OK ») : c'est ce que l'humain lit dans le MFA.

## 9. Pièges

1. **`minCliVersion: "^6.2.0"` ne couvre pas la 7.0.0** (`semver.satisfies`) : on obtient `PLUGIN_CLI_VERSION`. Le template, les exemples, ensv2, allowances et warrant ont tous ce défaut. Mettre `">=6.2.0 <8"`, comme shodai (DÉDUIT, à confirmer au premier `mm plugins install`).
2. Il faut `@metamask/agent-wallet` en **peerDependency**, pas en dependency, sinon on charge une seconde copie du CLI (DOC).
3. Ne pas déclarer `oclif.hooks` ou `oclif.plugins`. Livrer `oclif.manifest.json` (DOC).
4. Installer **depuis le dossier**, pas depuis une archive `.tgz`, sinon l'écran de consentement est incomplet (DOC).
5. **Testnet Monad** : le proxy RPC de MetaMask rejette 10143 en 6.2.0 (shim nécessaire), un MFA est demandé à chaque transaction (chaîne hors `allowed_chains`), et la simulation est probablement absente (TIERS / DÉDUIT). À tester en 7.0.0. ~~Les registres 8004 sont absents du testnet~~ **FAUX** (vérifié par `cast` le 27/09) : ils existent à `0x8004A818…BD9e` (Identity) et `0x8004B663…8713` (Reputation).
6. **Mainnet 143** : on paie la gas limit (CLAUDE.md §7). L'exécuteur estime lui-même le gas, et l'on ne sait pas si l'on peut imposer une limite serrée via `transaction` (champ `gas` d'`EVMTransaction` non vérifié).
7. La fenêtre `validBefore` d'un x402 **expire si le MFA est lent**. Pour la démo, choisir un parcours sans MFA : destinataire en allowlist, ou signature (DOC).
8. Trois modes de connexion donnent trois adresses de server-wallet. Toujours vérifier avec `mm wallet address` avant de financer (DOC).
9. La licence 7.0.0 est « source-view » : ne pas copier de code du CLI dans notre dépôt (DOC).
10. `publicClient(chainId)` n'a pas d'objet `chain` : passer toutes les adresses explicitement (EXEMPLE ENS).

## 10. Ce qui compte pour le bounty

- **Critère n° 1 (fiche)** : « toutes les transactions passent par l'Agent Wallet, sans contourner signature, politique ou MFA ». Donc : **jamais de clé privée** dans le plugin, ni de `cast send` ou de relayeur maison dans le parcours de démo. Tout passe par `walletExecutor`. Warrant signe sa démo sans surveillance avec une EOA séparée : à ne pas imiter.
- **Livrables** : un paquet installable par `mm plugins install` (le **publier sur npm**, puisque c'est le seul chemin « vérifié » sans mode dev), `skills/ancre/SKILL.md`, un README et une vidéo de 5 minutes au plus sur un vrai parcours.
- **Récit** qui colle à la piste n° 05 et au « trading super-power » : *l'agent reçoit un 402 ou un défi x402 MCP d'un autre agent → `mm ancre assess` → OK : il paie via le wallet (MFA/policy intacts) ; ferme Sybil ou agent veto : il refuse, avec le statut et le tag déclencheur*. La scène du disjoncteur (D19) s'y prête directement.
- **Différenciation** face à Warrant : Warrant *révèle* l'adéquation d'un swap et *écrit* dans 8004. ANCRE *décide* d'un paiement à partir d'une agrégation 8004 résistante aux Sybil, et, avec le router et l'allowlist, *applique* la décision on-chain. Montrer le trou documenté : les signatures ne comptent pas dans l'outflow.
- **Coût estimé** : environ 1 jour pour `assess` + `pay` + la skill, si le router (chantier 05) existe. Il faut en plus un compte MetaMask (`mm login`, donc Hugo) pour la démo live, et du MON et de l'USDC sur l'adresse du server-wallet.
- **Question ouverte** : la mention de track « Onchain Finance & Trading » est-elle un filtre ? (§7, à demander aux organisateurs.)

## Liens directs

- Doc : https://docs.metamask.io/agent-wallet/ · plugins/ · plugins/build-a-plugin/ · plugins/install-a-plugin/ · reference/plugins/ · reference/supported-chains/ · reference/trading-modes/ · reference/outflow-policy/ · guides/pay-for-apis-x402/ · index LLM : https://docs.metamask.io/llms.txt
- Source de la doc : https://github.com/MetaMask/metamask-docs/tree/main/agent-wallet (dernier commit sur ce dossier le 24/09/2026)
- Template : https://github.com/MetaMask/agent-wallet-plugin-template · Exemples : https://github.com/MetaMask/agent-wallet-plugin-examples
- Skills : https://github.com/MetaMask/agent-skills (`skills/metamask-agent-wallet/SKILL.md`, `references/plugins.md`, `references/x402.md`)
- npm : https://www.npmjs.com/package/@metamask/agent-wallet · https://www.npmjs.com/package/@metamask/agent-sdk
- Plugins tiers : https://github.com/Beltran12138/warrant · https://github.com/estmcmxci/mm-plugin-ensv2 · https://github.com/akugone/mm-plugin-allowances · https://github.com/CNSLabs/shodai-subscriptions-agent-wallet-plugin

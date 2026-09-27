# Plugin MetaMask Agent Wallet « ANCRE » : design (vague 2)

> Rédigé le **2026-09-27** pour le bounty *MetaMask, Best Agent Wallet Plugin* (D38, piste n° 05 de la fiche : « Agent-to-agent commerce — paid tool calls via x402 payments + ERC-8004 »). S'appuie sur la vague 1 : `metamask-agent-wallet.md` et `x402.md` (même dossier).
> Étiquettes : **DOC** = lu dans la doc, le code ou les types publiés (lien ou chemin donné) · **MESURÉ** = appel réel fait aujourd'hui · **TIERS** = affirmé par un tiers, non vérifié · **DÉDUIT** = raisonnement, à tester · **PROPOSÉ** = choix de design, à valider par Hugo.
> Rien n'a été installé, compilé ni signé. Les types ont été lus dans les archives npm téléchargées dans le scratchpad : `@metamask/agent-wallet` 7.0.0, `@metamask/agent-sdk` 7.0.0, `@metamask/fox-sdk` 2.9.0 (publié le 23/09).

---

## 0. En bref

1. **Thèse du plugin** (PROPOSÉ) : Guard Mode plafonne *combien* on dépense, pas *à qui*. De plus, un paiement x402 est une **signature**, et les signatures sont hors du plafond de sortie (DOC, `reference/outflow-policy.md` l. 52). Le plugin ajoute la question manquante, *à qui je paie ?*, et la rend **exécutoire** au lieu de consultative.
2. **Deux gardes, une seule logique** (PROPOSÉ) :
   - **garde douce** : le plugin appelle ANCRE avant de demander une signature. Pas de signature, pas de paiement ;
   - **garde dure** : l'argent ne vit pas sur le wallet de l'agent mais dans un **compte-contrat payeur ERC-1271** (`TrustGatedPayer`, le `TrustGatedRouter` du chantier 05 dans sa version x402). USDC n'accepte l'autorisation EIP-3009 que si `isValidSignature` renvoie OK, donc si ANCRE dit OK **au moment du règlement**. Le plugin interroge `payer.decide(...)`, la même fonction que celle appelée par `isValidSignature` : il n'y a **aucun seuil dupliqué en TypeScript**.
3. **Toutes les signatures et transactions passent par `ctx.walletExecutor`** (DOC, types) : c'est ce qui satisfait le critère n° 1 du bounty. Le plugin ne voit aucune clé. Le compte-contrat n'a pas de clé privée.
4. **Réponse à Warrant** : Warrant écrit « an `mm` plugin cannot intercept native commands, so an enforcement layer would be bypassable by construction » (README, section *AI disclosure*). C'est vrai pour un préflight de swap. **Pour un paiement, c'est faux dès que les fonds sont dans un contrat qui juge la contrepartie.** C'est notre différence, et elle ne contredit pas Warrant : les deux projets sont complémentaires.
5. **Fait nouveau (MESURÉ ce soir, 21:37 UTC, bloc 10143 n° 66 234 849)** : les registres ERC-8004 v2.0.0 **existent sur le testnet Monad** à d'autres adresses que sur le mainnet : Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e` (`name()` = « AgentIdentity », `getVersion()` = « 2.0.0 »), Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` (`getVersion()` = « 2.0.0 »). Tous deux sont des proxys ERC-1967. CLAUDE.md §3 (« absents du testnet ») n'est vrai que pour les adresses du mainnet. **Conséquence** : le chantier 02 n'a pas besoin de déployer ses propres registres sur 10143. À reporter dans CLAUDE.md.
6. **Pièges confirmés dans les types** : `minCliVersion` est vérifié par `semver.satisfies(cliVersion, range, {includePrerelease:true})` (DOC, `dist/chunks/loader-BVO9wPXX.js`, fonction `at`). `"^6.2.0"` rejette donc la 7.0.0 : il faut écrire `">=6.2.0 <8"`, dans le bloc `mm` **et** dans `peerDependencies`. Autre point : `EVMTransaction` accepte un champ `gas?: bigint` (DOC, `fox-sdk/dist/wallets/evm/types/EVMTransaction.d.ts`). La question ouverte n° 6 de la vague 1 est tranchée : on peut imposer une gas limit serrée, ce qui compte sur Monad.

---

## 1. Architecture

```
                     ┌──────────── mm (Agent Wallet CLI, même processus) ─────────────┐
 agent IA ──skill──▶ │ mm ancre pay <url>                                             │
                     │   1. GET url → 402 + PAYMENT-REQUIRED (x402 v2)                │
                     │   2. ctx.publicClient(143).readContract(payer.decide(...))     │  lecture
                     │        └─▶ TrustGatedPayer.decide ─▶ AnchoredReputation.assess │  (eth_call)
                     │   3. si refus : STOP, aucune signature demandée                │
                     │   4. ctx.walletExecutor(io,"ancre:pay")({kind:"typed-data"})   │  signature
                     │        └─▶ politique Guard Mode / MFA / Shield de MetaMask     │  (TEE MetaMask)
                     │   5. GET url + PAYMENT-SIGNATURE (from = payer, sig = blob)    │
                     └────────────────────────────────────────────────────────────────┘
                                      │
       serveur x402 ──/verify,/settle──▶ facilitator Monad ──tx──▶ USDC.transferWithAuthorization(..., bytes blob)
                                                                     └─▶ payer.isValidSignature(digest, blob)
                                                                            └─▶ decide(...) == PAY ? 0x1626ba7e : 0xffffffff
```

### 1.1 Garde douce (plugin) — DOC pour l'API, PROPOSÉ pour le flux

- `this.ctx.publicClient(chainId)` : client viem authentifié, capability `wallet-read` (DOC, `runtime/context.d.ts` : `publicClient: (chainId: number) => PublicClient`).
- `this.ctx.walletExecutor(io, source)` → `EvmWalletExecutor = (request, opts?) => Promise<EvmWalletResult>`, capability `wallet-submit` (DOC, `agent-sdk/dist/lib.cjs/walletExecutor-*.d.ts`).
- Seule, cette garde est **consultative** : l'agent peut toujours appeler `x402_pay.py` ou `mm wallet sign-typed-data`. D'où la garde dure.

### 1.2 Garde dure (contrat payeur + Guard Mode) — PROPOSÉ, DÉDUIT pour la faisabilité

**Principe** : le wallet de l'agent (server-wallet `mm`) est l'**opérateur** du payeur. Il ne détient pas d'USDC, seulement le MON nécessaire au gas, voire rien du tout si le relais gasless EIP-7702 s'applique (DOC, architecture). Les USDC sont dans `TrustGatedPayer`, qui :

| Règle | Pourquoi |
|---|---|
| `isValidSignature(hash, blob)` recalcule le digest EIP-3009 `TransferWithAuthorization(from = this, to, value, validAfter, validBefore, nonce)` à partir de `USDC.DOMAIN_SEPARATOR()` et exige `== hash` | sans cette étape, le contrat « signerait » n'importe quel hash (x402.md §6.2) |
| vérifie `opSig`, signature EIP-712 de l'opérateur sur `AncrePayment{to,value,validAfter,validBefore,nonce,agentId}`, domaine `{name:"ANCRE TrustGatedPayer", version:"1", chainId, verifyingContract: this}`, avec `SignatureChecker` | l'humain lit « AncrePayment to agent #12 » dans l'écran de signature ou de MFA, pas un hash opaque |
| exige `identity.getAgentWallet(agentId) == to` | un serveur qui mentirait sur `agentId` ne peut revendiquer qu'un agent dont il contrôle déjà le wallet (x402.md §7.3) |
| exige `value <= maxPerPayment` | plafond par paiement, lisible on-chain |
| exige `isTrusted(agentId, setId, θ, ρN, ρD)` d'ANCRE, donc `status == OK` **et** les seuils | voir §1.3 : `OK` ≠ « fiable » |
| `sweep()` n'envoie les fonds **qu'à une adresse `treasury` immuable** (celle de l'humain) ; `setPolicy` réservé à `owner` (l'humain, **pas** le wallet `mm`) | l'agent ne peut ni récupérer les fonds sur son EOA pour payer en direct, ni remplacer l'ensemble d'ancres par le sien |

**Ce que fait Guard Mode en plus** (PROPOSÉ, schéma YAML non publié : à lire avec `mm wallet policy template`) :
- allowlist d'adresses : `USDC` et `TrustGatedPayer` ;
- allowlist de destinataires de tokens : `TrustGatedPayer` ;
- conséquence : toute autre transaction de l'agent déclenche un MFA humain (DOC, `reference/trading-modes.md` : « Anything outside your allowlists → 2FA »).

**Ce qui reste possible pour un agent qui contourne le plugin, et pourquoi c'est inoffensif** (DÉDUIT) :

| Contournement | Résultat |
|---|---|
| `x402_pay.py pay <url_ferme> --confirm` (signature EIP-3009 depuis l'EOA) | l'EOA n'a pas d'USDC → `insufficient_funds` au `/verify` |
| Signer lui-même un `AncrePayment` vers la ferme et le joindre en `from = payer` | `isValidSignature` → `decide` ≠ PAY → `0xffffffff` → USDC revert au règlement |
| Transférer des USDC du payeur vers son EOA | impossible : aucune fonction ne le permet, `sweep` va à `treasury` |
| Changer `setId` ou θ | `onlyOwner` ; l'owner n'est pas le wallet `mm` |
| Faire approuver une ferme par ANCRE | c'est exactement ce contre quoi ANCRE est conçu : leave-one-out m = 2, veto des ancres (D8, D33) |

**Limites honnêtes** :
- `isValidSignature` est `view` (appel en STATICCALL par USDC) : **un plafond cumulé est impossible dans ce chemin**, et aucun event « refusé » ne peut y être émis (x402.md §6.2). Le plafond cumulé, c'est **le solde du payeur** : on l'alimente par petites sommes, et chaque `fund` est une transaction comptée dans l'outflow de Guard Mode.
- Pour l'écran de démo (chantier 07), la version « transaction » du même contrat (`payDirect(agentId, value)`, non-view) émet `Paid` / `Refused(status, triggerTag)` : c'est le `TrustGatedRouter` du chantier 05. Le même `decide` sert aux deux chemins.
- Un opérateur compromis peut **vider le payeur vers des agents jugés fiables par ANCRE**. C'est le risque résiduel assumé, borné par `maxPerPayment` et par le solde.

### 1.3 `status == OK` ne veut pas dire « fiable » (DOC, `contracts/src/AnchoredReputation.sol` l. 876-943)

`assess` renvoie `OK` pour un agent **absent du support**, avec `trust = trustRobust = 0` : `OK` signifie « certificat valide, pas de veto, pas de transfert ». La décision de paiement doit donc passer par `isTrusted(agentId, setId, theta, rhoN, rhoD)` (l. 865), qui exige `trustRobust ≥ θ + e` et `ρD·(distrust + e) ≤ ρN·(trustRobust − e)`. θ et ρ **ne sont pas engagés dans le `setId`** (la struct `Policy` ne contient que `minAnchors`, `maxAge`, `minRefresh` et `slackRefresh`). C'est donc au payeur de les fixer (PROPOSÉ : stockés dans `TrustGatedPayer.policy()`, modifiables par l'owner seul).
**La vague 1 se trompait sur ce point** : son squelette et sa table « OK → payer » sont à corriger. Le verdict « inconnu » est d'ailleurs le cas le plus fréquent sur le graphe réel (CLAUDE.md §6).

Table de décision (PROPOSÉ, codes renvoyés par `decide`) :

| Code | Condition | Action de l'agent |
|---|---|---|
| `PAY` (0) | OK + `isTrusted` + wallet correct + `value ≤ maxPerPayment` | payer |
| `UNTRUSTED` (1) | OK mais sous θ ou ρ (dont l'agent **inconnu**, trust = 0) | refuser ; dire « ANCRE ne connaît pas assez cet agent » |
| `WALLET_MISMATCH` (2) | `getAgentWallet(agentId) ≠ payTo` | refuser ; offre suspecte |
| `OVER_CAP` (3) | `value > maxPerPayment` | refuser ; demander à l'humain |
| `NO_CERT` / `STALE` / `REGISTRY_CHANGED` (10 + statut) | ANCRE ne peut pas conclure | refuser, échec fermé (AM-2.12) ; prévenir l'humain |
| `VETOED` | une ancre a posé un avis négatif | refuser ; afficher `triggerTag` |
| `TRANSFERRED` | l'owner ERC-721 a changé depuis le certificat | refuser |

---

## 2. Commandes `mm` proposées (PROPOSÉ)

Le chemin du fichier fait la commande : `src/commands/ancre/payer/fund.ts` → `mm ancre payer fund`, id `ancre:payer:fund` (DOC, build-a-plugin).

| Commande | Capabilities | Rôle |
|---|---|---|
| `mm ancre check <agentId> [--payer 0x…] [--set 0x… --theta … --rho …] [--naive]` | `wallet-read` | Verdict ANCRE et détail (`trust`, `trustRobust`, `distrust`, `e`, `certBlock`, `vetoCount`, `triggerTag`). Avec `--naive`, affiche à côté `getSummary(agentId, getClients(agentId), "", "")` : la scène « naïf contre ANCRE » dans le terminal |
| `mm ancre inspect <url> [--agent-id N]` | `wallet-read` | Lit le 402, choisit l'offre, résout l'agent, lance `decide` et **montre ce qui serait signé**. Aucune signature |
| `mm ancre pay <url> [--agent-id N] --confirm [--max-amount 0.10]` | `wallet-read`, `wallet-submit` | Flux complet (§4). Sans `--confirm`, refuse, comme la skill officielle |
| `mm ancre payer status [--payer 0x…]` | `wallet-read` | Solde USDC du payeur, opérateur (= le wallet `mm` ?), `treasury`, `owner`, politique (`setId`, θ, ρ, `maxPerPayment`), et **checklist Guard Mode** (allowlist attendue, à comparer avec `mm wallet policy get`) |
| `mm ancre payer fund <amount> --confirm` | `wallet-read`, `wallet-submit` | `USDC.transfer(payer, amount)` via l'exécuteur, avec `gas` explicite. C'est la seule transaction du parcours, et elle est comptée dans l'outflow |

Reportés : `mm ancre pay-direct <agentId> <amount>` (chemin transaction vers `payDirect`, pour l'écran 07) et `mm ancre mcp-sign` (transport MCP x402 v2). Aucun des deux n'est nécessaire à la démo.

Choix délibéré : **pas de commande de déploiement du payeur dans le plugin**. `EVMTransaction.to` est obligatoire (DOC, type `to: string`), donc une création de contrat par l'exécuteur n'est pas prévue par le type. Le payeur est créé par une `PayerFactory.create(...)`, appelée par l'humain (owner), hors du parcours de l'agent. Si l'on tient à ce que ce soit fait depuis `mm`, on ajoutera `mm ancre payer create` (appel de la factory, `to` = factory).

---

## 3. `package.json` (PROPOSÉ ; champs vérifiés contre `manifestSchema.d.ts`, DOC)

```json
{
  "name": "mm-plugin-ancre",
  "version": "0.1.0",
  "description": "ANCRE trust gate for the MetaMask Agent Wallet: pay another agent over x402 only if its Sybil-resistant ERC-8004 reputation, relative to your anchors, says so.",
  "license": "MIT",
  "type": "module",
  "keywords": ["oclif-plugin", "mm-plugin", "metamask", "agent-wallet", "x402", "erc-8004", "monad"],
  "files": ["dist", "oclif.manifest.json"],
  "engines": { "node": ">=22.18" },
  "scripts": {
    "build": "tsc -p tsconfig.json && oclif manifest",
    "prepack": "npm run build",
    "relink": "node scripts/relink.cjs",
    "test": "node --test test/*.test.mjs"
  },
  "oclif": {
    "bin": "mm",
    "commands": "./dist/commands",
    "topicSeparator": " ",
    "topics": {
      "ancre": { "description": "Refuse to pay an agent that ANCRE does not trust (x402 + ERC-8004)" },
      "ancre:payer": { "description": "Inspect and fund the ERC-1271 payer contract that enforces the gate" }
    }
  },
  "mm": {
    "schemaVersion": 1,
    "minCliVersion": ">=6.2.0 <8",
    "capabilities": [],
    "commands": [
      { "id": "ancre:check",       "capabilities": ["wallet-read"],                  "dataAccess": ["network"],              "targetChains": [143, 10143] },
      { "id": "ancre:inspect",     "capabilities": ["wallet-read"],                  "dataAccess": ["network", "accounts"],  "targetChains": [143, 10143] },
      { "id": "ancre:pay",         "capabilities": ["wallet-read", "wallet-submit"], "dataAccess": ["network", "accounts"],  "targetChains": [143, 10143] },
      { "id": "ancre:payer:status","capabilities": ["wallet-read"],                  "dataAccess": ["network", "accounts", "balances"], "targetChains": [143, 10143] },
      { "id": "ancre:payer:fund",  "capabilities": ["wallet-read", "wallet-submit"], "dataAccess": ["network", "accounts", "balances"], "targetChains": [143, 10143] }
    ]
  },
  "peerDependencies": { "@metamask/agent-wallet": ">=6.2.0 <8" },
  "dependencies": { "viem": "^2.56.0" },
  "devDependencies": { "@metamask/agent-wallet": "^7.0.0", "oclif": "^4", "typescript": "^5" }
}
```

Notes :
- La liste globale `capabilities` reste vide, sinon elle se fusionne dans chaque commande (DOC, `ot()` dans `loader-*.js`). `wallet-submit` n'est demandé que là où l'on signe : au consentement, l'utilisateur voit que `check` ne peut rien signer.
- Pas de `oclif.hooks` ni de `oclif.plugins` (`PLUGIN_HOOKS_FORBIDDEN`), et le `oclif.manifest.json` est livré (DOC).
- `targetChains` n'est appliqué nulle part dans le code 7.0.0 (DÉDUIT, vague 1) : ce champ est déclaratif, on le garde pour le consentement.
- Le dossier `skills/ancre/SKILL.md` est dans le dépôt, hors du paquet npm, comme `MetaMask/agent-skills`. On peut aussi l'ajouter à `files` : ça ne coûte rien.
- **`scripts/relink.cjs`** : `npm install` crée une seconde copie physique de `@metamask/agent-wallet`, et le test `instanceof PluginCommand` de l'hôte échoue alors avec `PLUGIN_INVALID_BASE` (TIERS, README de Warrant, section *Quick start*). À écrire nous-mêmes, sans copier leur fichier.
- Licence 7.0.0 « source-view » : ne rien vendoriser du CLI. La skill officielle `agent-skills` est sous licence **MIT** (DOC, `LICENSE`) : on peut s'inspirer de `x402_pay.py` en citant la source.

---

## 4. Flux x402 exact : implémentation propre en TypeScript (PROPOSÉ)

### 4.1 Pourquoi ne pas appeler le script Python officiel

| Critère | `x402_pay.py` (DOC, agent-skills) | Implémentation dans le plugin |
|---|---|---|
| Où s'insère la garde | nulle part entre la lecture du 402 et `mm wallet sign-typed-data` | entre les étapes 2 et 4, dans le même processus |
| Payeur | `from` = l'EOA du wallet (`wallet_address()`) | `from` = le **contrat payeur**, et la signature est un blob ERC-1271 |
| Signature | sous-processus `mm wallet sign-typed-data`, hors `ctx` | `ctx.walletExecutor`, donc la même politique, le même MFA et le même `intent` |
| Schéma | `exact` seulement ; `upto` refusé | `exact` / EIP-3009 (USDC v2.2 accepte ERC-1271, MESURÉ vague 1) |
| « Autonomous auto-pay is not supported » | règle de la skill | même règle : `--confirm` obligatoire. Le plafond on-chain rend un futur mode `--auto` défendable, sans le promettre |

Le code à écrire fait environ 200 lignes : analyse du 402 v2, choix de l'offre, typed-data, blob, retry, lecture de `PAYMENT-RESPONSE`. On reprend les choix éprouvés du script officiel : `validAfter = now − 600`, `validBefore = now + maxTimeoutSeconds`, nonce aléatoire de 32 octets, une seule tentative, pas de retry automatique. On teste ensuite la conformité contre un serveur `@x402/express` réel (§7).

### 4.2 Étapes

1. `GET <url>` → attendu : **402** avec l'en-tête `PAYMENT-REQUIRED` = base64(JSON `PaymentRequired{x402Version:2, resource, accepts[]}`) (DOC, x402.md §1). La v1 (`accepts` dans le corps, `X-PAYMENT`) est détectée et refusée avec un message clair : le facilitator Monad parle v2.
2. Choix de l'offre : `scheme == "exact"`, `network == "eip155:143"` (ou `10143`), `asset` == l'USDC du payeur, `extra.name == "USDC"`, `extra.version == "2"` (fournis en dur : `eip712Domain()` revert, MESURÉ vague 1), `amount ≤ --max-amount` et `≤ maxPerPayment`. S'il n'y a aucune offre éligible : `CommandError("ANCRE_NO_OFFER", …)`.
3. Résolution de l'`agentId`, dans cet ordre : `--agent-id` ; puis un champ d'extension `extra.erc8004` ou `extensions.erc8004.agentId`, **non standard et à proposer**. Sinon, erreur : on ne devine pas. Il n'existe **aucun index inverse on-chain** wallet → agent, et `agentWallet` n'est pas unique (AM-3.4). Un indexeur (chantier 03, Envio) pourra servir plus tard, mais c'est de toute façon le contrat qui revérifie `getAgentWallet(agentId) == payTo`.
4. `decide(agentId, payTo, amount)` via `publicClient(chainId).readContract`. Si le code est ≠ `PAY` : on renvoie le verdict **sans rien signer** (sortie JSON `{paid:false, verdict, assessment}`).
5. Construction de `AncrePayment{to: payTo, value: amount, validAfter, validBefore, nonce, agentId}` dans le domaine du payeur, puis `executor({kind:"typed-data", chainId, typedData, intent:{summary:"Pay 0.10 USDC to ERC-8004 agent #12 via ANCRE payer (verdict PAY)", action:"transfer", details:{…}}})`.
6. Contrôle local : `recoverTypedDataAddress(typedData, sig) == payer.operator()`. Sinon, on arrête : le mauvais wallet est sélectionné, piège des 3 modes de connexion (DOC).
7. `blob = abi.encode(address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint256 agentId, bytes opSig)`. Il fait plus de 65 octets, donc x402-rs le classe `EIP1271` et appelle `transferWithAuthorization(…, bytes)` (DOC, x402.md §6.1).
8. `PaymentPayload = {x402Version:2, resource, accepted: offre, payload:{signature: blob, authorization:{from: payer, to, value, validAfter, validBefore, nonce}}}`, puis `GET <url>` avec `PAYMENT-SIGNATURE: base64(JSON)`.
9. En cas de **200** : décoder `PAYMENT-RESPONSE` (`{success, transaction, network, payer}`) et afficher le hash. En cas de **402 ou 500** : relire `decide` pour expliquer le refus. Le facilitator Monad renvoie `500 unexpected_error`, avec la raison dans `invalidReasonDetails` (MESURÉ vague 1) : on ne s'appuie pas sur `invalidReason`. **Aucun retry.**

La différence avec le script officiel est donc minime : seuls `from` et `signature` changent. Le serveur, le facilitator et le token restent **inchangés**.

---

## 5. Squelette TypeScript (PROPOSÉ ; imports et signatures vérifiés dans les `.d.ts`, DOC ; non compilé)

```
mm-plugin-ancre/
├── package.json · tsconfig.json (ES2022, module ESNext, moduleResolution Bundler, rootDir src, outDir dist)
├── src/lib/abi.ts          # ABI ANCRE (assess, isTrusted) + ITrustGatedPayer + USDC (balanceOf, transfer)
├── src/lib/config.ts       # adresses par chainId (ANCRE, payer par défaut, USDC, Identity), --payer / env ANCRE_PAYER
├── src/lib/verdict.ts      # codes decide → libellés, actions ; pur, testé
├── src/lib/x402.ts         # parse402, selectOffer, buildPaymentPayload, decodePaymentResponse ; pur, testé
├── src/lib/payer.ts        # ancrePaymentTypedData, encodeBlob ; pur, testé en différentiel avec Solidity
├── src/lib/wallet.ts       # selectedEvmAddress(snapshot) (motif ensv2)
├── src/commands/ancre/{check,inspect,pay}.ts
└── src/commands/ancre/payer/{status,fund}.ts
```

`src/lib/abi.ts` (extrait) :

```ts
import { parseAbi } from "viem";
export const ancreAbi = parseAbi([
  "struct Assessment { uint8 status; uint256 trust; uint256 trustRobust; uint256 distrust; uint256 e; uint64 certBlock; uint8 vetoCount; bytes32 triggerTag; }",
  "function assess(uint256 agentId, bytes32 setId, bool withVeto) view returns (Assessment)",
  "function isTrusted(uint256 agentId, bytes32 setId, uint256 theta, uint256 rhoN, uint256 rhoD) view returns (bool)",
]);
// Interface du payeur : PROPOSÉE, à écrire dans contracts/src/TrustGatedPayer.sol (chantier 05)
export const payerAbi = parseAbi([
  "struct Assessment { uint8 status; uint256 trust; uint256 trustRobust; uint256 distrust; uint256 e; uint64 certBlock; uint8 vetoCount; bytes32 triggerTag; }",
  "function operator() view returns (address)",
  "function owner() view returns (address)",
  "function treasury() view returns (address)",
  "function usdc() view returns (address)",
  "function ancre() view returns (address)",
  "function policy() view returns (bytes32 setId, uint256 theta, uint256 rhoN, uint256 rhoD, uint256 maxPerPayment)",
  "function decide(uint256 agentId, address to, uint256 value) view returns (uint8 code, Assessment a)",
  "function isValidSignature(bytes32 hash, bytes blob) view returns (bytes4)",
]);
export const identityAbi = parseAbi(["function getAgentWallet(uint256 agentId) view returns (address)"]);
```

`src/commands/ancre/check.ts` :

```ts
import { CommandError, type CommandIO, InputFieldType, type InputSchema, PluginCommand,
         schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { type Address, isAddress } from "viem";
import { identityAbi, payerAbi } from "../../lib/abi.js";
import { resolveConfig } from "../../lib/config.js";
import { describe, type Verdict } from "../../lib/verdict.js";

const inputs = {
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId", required: true, index: 0,
             validate: (v: string) => /^\d+$/.test(v) || "agentId must be a decimal integer" },
  payer:   { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address", required: false, prompt: false,
             env: "ANCRE_PAYER", validate: (v: string) => isAddress(v) || "not an address" },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "Chain id (143 or 10143)", required: false, prompt: false },
  // amount utilisé seulement pour le test de plafond ; 0 = « pourrais-je lui payer quelque chose ? »
  amount:  { type: InputFieldType.Text, flag: "amount", message: "Amount in USDC base units (6 decimals)", required: false, prompt: false },
} satisfies InputSchema;

export default class AncreCheck extends PluginCommand<Verdict> {
  static override description = "Ask ANCRE (via your payer's policy) whether you may pay this ERC-8004 agent.";
  static override examples = ["<%= config.bin %> ancre check 12", "<%= config.bin %> ancre check 182 --json"];
  static override requiresInit = false;          // requiresAuth reste true : publicClient passe par la passerelle authentifiée (DÉDUIT)
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:check";

  async execute(io: CommandIO): Promise<Verdict> {
    const inp = await io.resolveInputs(inputs);
    const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
    const client = this.ctx.publicClient(cfg.chainId);               // pas d'objet chain attaché : adresses explicites
    const agentId = BigInt(inp.agentId);
    const to = (await client.readContract({ address: cfg.identity, abi: identityAbi, functionName: "getAgentWallet",
                                            args: [agentId] })) as Address;
    const [code, a] = await client.readContract({ address: cfg.payer, abi: payerAbi, functionName: "decide",
                                                  args: [agentId, to, BigInt(inp.amount ?? "0")] })
      .catch((e: unknown) => { throw new CommandError("ANCRE_RPC_ERROR", `decide() failed: ${String(e)}`,
                                                      "Check --payer and --chain-id; ANCRE never reverts, the payer should not either"); });
    return describe(agentId, to, code, a, cfg);                     // { verdict: "PAY"|"UNTRUSTED"|…, action, assessment }
  }
  override successHint(v: Verdict) { return `${v.verdict}: ${v.action}`; }
}
```

`src/commands/ancre/pay.ts` (cœur) :

```ts
export default class AncrePay extends PluginCommand<PayResult> {
  static override description = "Pay an x402 resource only if ANCRE trusts the receiving ERC-8004 agent; signs through the Agent Wallet.";
  protected readonly pluginCommandId = "ancre:pay";
  // flags : url (index 0), agent-id, payer, max-amount, confirm (Boolean), chain-id

  async execute(io: CommandIO): Promise<PayResult> {
    const inp = await io.resolveInputs(inputs);
    if (!inp.confirm) throw new CommandError("ANCRE_CONFIRM_REQUIRED", "Refusing to pay without --confirm",
                                             "Run `mm ancre inspect <url>` first and get the human's approval");
    const cfg = resolveConfig(inp);
    const client = this.ctx.publicClient(cfg.chainId);

    const challenge = await fetch402(inp.url, { signal: io.signal });                 // lib/x402.ts
    const offer = selectOffer(challenge, { chainId: cfg.chainId, asset: cfg.usdc, max: parseUsdc(inp.maxAmount) });
    const agentId = resolveAgentId(inp.agentId, offer);                               // pas de devinette
    const [code, a] = await client.readContract({ address: cfg.payer, abi: payerAbi, functionName: "decide",
                                                  args: [agentId, offer.payTo, BigInt(offer.amount)] });
    if (code !== CODE.PAY) return { paid: false, ...describe(agentId, offer.payTo, code, a, cfg) };   // ← garde douce : rien n'est signé

    const auth = newAuthorization(offer);                                             // validAfter now-600, validBefore now+maxTimeout, nonce 32 o
    const typedData = ancrePaymentTypedData(cfg, { ...auth, to: offer.payTo, agentId });
    const execute = await this.ctx.walletExecutor(io, "ancre:pay");
    const r = await execute({ kind: "typed-data", chainId: cfg.chainId, typedData,
      intent: { summary: `Pay ${fmtUsdc(offer.amount)} USDC to ERC-8004 agent #${agentId} via ANCRE payer (verdict PAY)`,
                action: "transfer", details: { payTo: offer.payTo, payer: cfg.payer, setId: cfg.setId, resource: inp.url } } },
      { signal: io.signal });
    if (r.kind !== "signature" || !r.signature)
      throw new CommandError("ANCRE_SIGN_FAILED", `Wallet did not sign (status ${r.status}${r.failureCode ? ", " + r.failureCode : ""})`,
                             "If it is AWAITING_MFA, approve it; the x402 window may have expired, re-run inspect");
    await assertOperator(typedData, r.signature, cfg, client);                        // recoverTypedDataAddress == payer.operator()

    const blob = encodeBlob({ ...auth, to: offer.payTo, agentId, opSig: r.signature as `0x${string}` });
    const res = await retryWithPayment(inp.url, challenge, offer, { from: cfg.payer, ...auth, to: offer.payTo }, blob, io.signal);
    if (!res.ok) {                                                                    // 402/500 : ré-expliquer via decide, sans retry
      const [code2, a2] = await client.readContract({ address: cfg.payer, abi: payerAbi, functionName: "decide",
                                                      args: [agentId, offer.payTo, BigInt(offer.amount)] });
      return { paid: false, settlementError: res.error, ...describe(agentId, offer.payTo, code2, a2, cfg) };   // ← garde dure (ex. veto entre verify et settle)
    }
    return { paid: true, transaction: res.settlement.transaction, body: res.body, ...describe(agentId, offer.payTo, code, a, cfg) };
  }
}
```

`src/commands/ancre/payer/fund.ts` (la seule transaction) :

```ts
const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [cfg.payer, amount] });
const execute = await this.ctx.walletExecutor(io, "ancre:payer:fund");
const r = await execute({ kind: "transaction", chainId: cfg.chainId,
  transaction: { to: cfg.usdc, data, value: 0n, gas: 80_000n },          // gas explicite : Monad facture la gas limit (champ DOC fox-sdk)
  intent: { summary: `Fund ANCRE payer ${short(cfg.payer)} with ${fmtUsdc(amount)} USDC`, action: "transfer" } },
  { waitForReceipt: true, signal: io.signal });
```

La gas limit de 80 k est une **estimation à mesurer**. Un `transfer` USDC coûte environ 35 à 60 k selon l'état des slots, et MIP-8 change ces coûts sur Monad.

Règle de repli (PROPOSÉ) : si `publicClient(10143)` échoue (TIERS : le proxy RPC de MetaMask répondait `Invalid chainId` en 6.2.0), le plugin accepte `--rpc-url` **pour les lectures uniquement**, via un `createPublicClient` viem. Jamais pour signer ni envoyer. Les signatures typed-data n'ont pas besoin du RPC (TIERS, Warrant : chemin signature sans shim sur 10143).

---

## 6. Brouillon complet de `skills/ancre/SKILL.md` (anglais : livrable du dépôt, lu par l'agent et le jury)

```markdown
---
name: ancre
description: Use before paying another AI agent with the MetaMask Agent Wallet (mm): any HTTP 402 / x402 payment, paid tool call or payment to an ERC-8004 agent. Runs `mm ancre inspect` / `mm ancre pay`, which ask ANCRE (Sybil-resistant ERC-8004 reputation relative to anchors your principal chose) and pay from an ERC-1271 payer contract that refuses untrusted agents on-chain. Never pay an agent that ANCRE does not return PAY for.
license: MIT
metadata:
  author: ANCRE team
  version: "0.1.0"
  cliVersion: "7.0.0"
---

# ANCRE trust gate

You pay other agents on behalf of a principal. Guard Mode limits how much you spend; it does not
judge who you pay, and x402 payments are signatures, which are not counted in the outflow limit.
ANCRE answers "who": it reads ERC-8004 feedback, keeps only trust that flows from anchors your
principal chose (so a farm of fake reviewers counts for nothing), and certifies the result on-chain.
Funds live in a payer contract that re-checks ANCRE when the payment settles. You cannot pay
around it, and you must not try.

## When to use

| Situation | Command |
|---|---|
| An HTTP request returns 402 with a `PAYMENT-REQUIRED` header | `mm ancre inspect <url>` then `mm ancre pay <url> --confirm` |
| The principal asks "can I trust / pay agent #N?" | `mm ancre check <N>` |
| Before any payment, if you have not checked the payer this session | `mm ancre payer status` |
| The payer balance is too low | ask the human, then `mm ancre payer fund <amount> --confirm` |

Do not use the generic x402 script (`x402_pay.py`) or `mm wallet sign-typed-data` to pay an agent
while this skill is active. Your own wallet holds no USDC for that, by design.

## Preflight (once per session)

1. `mm --version` is 6.2.0 or later, and `mm doctor` shows `authenticated` and `initialized`.
2. `mm ancre payer status --json`: `operator` must equal your wallet address (`mm wallet address`).
   If it does not, stop: you are signed in with a different login method than the one the payer was set up for.
3. Note the payer's `setId`, `theta` and `maxPerPayment`: you will quote them to the human.

## Before every payment

1. `mm ancre inspect <url> --json` (add `--agent-id <N>` if the server does not declare it).
   You get the offer (amount, asset, payTo), the agent id and a `verdict`.
2. Act on `verdict`:

   | verdict | what you do |
   |---|---|
   | `PAY` | Show the human: amount, agent id, resource. With their approval, run `mm ancre pay <url> --agent-id <N> --confirm --max-amount <amount>`. |
   | `UNTRUSTED` | Do not pay. Say: "ANCRE does not know this agent well enough (trust below the threshold of your anchor set)". Unknown is the normal case for new agents. |
   | `VETOED` | Do not pay. Report `triggerTag`: one of your anchors flagged this agent. |
   | `WALLET_MISMATCH` | Do not pay. The offer's `payTo` is not the wallet of the agent it claims to be. |
   | `OVER_CAP` | Do not pay. Tell the human the amount exceeds `maxPerPayment`. |
   | `NO_CERT`, `STALE`, `REGISTRY_CHANGED` | Do not pay. ANCRE cannot conclude right now (no fresh certificate or the ERC-8004 registry was upgraded). Tell the human; do not retry in a loop. |
   | `TRANSFERRED` | Do not pay. The agent changed owner since it was certified. |

3. `mm ancre pay` re-checks ANCRE itself, and the payer contract checks again at settlement.
   If `pay` returns `paid: false`, report the verdict it returns; the situation changed between
   inspect and pay (for example an anchor just vetoed the agent). That is the gate working.

## Async and MFA

- A payment is one EIP-712 signature by your wallet (`AncrePayment`, domain "ANCRE TrustGatedPayer").
  If the output contains `AWAITING_MFA`, tell the human to approve it and wait. x402 authorizations
  expire (`validBefore`); if it expired, run `inspect` again instead of retrying `pay`.
- `mm ancre payer fund` is a normal transaction and goes through Guard Mode policy and 2FA.

## Output

Always report: verdict, agent id, amount and asset, and for a payment the settlement transaction hash.
For a refusal, quote the verdict and, if present, `triggerTag` and `trustRobust` against `theta`.

## Never

- Never pay an agent whose verdict is not `PAY`, and never ask the human to lower the threshold
  so that a payment goes through.
- Never try to move USDC to your own wallet to pay outside the payer, and never use another
  payment path for an agent ANCRE refused.
- Never retry a refused or failed payment automatically. One attempt per resource.
- Never split an amount to fit under `maxPerPayment`.
- Never try to bypass or pre-empt Guard Mode, 2FA or Transaction Shield.
- Never guess an agent id from a name or URL; use the one the server declares or the human gives.

## Works with

- **Warrant** (`mm warrant preflight`): checks whether a *swap* suits the principal. ANCRE checks
  whether a *counterparty* deserves a payment. Different questions, run both when both apply.
- The official MetaMask x402 workflow: same protocol (x402 v2, `exact`, EIP-3009); ANCRE only
  changes who the payer is (the payer contract) and adds the trust check.
```

---

## 7. Démo de 5 minutes au plus : « refus » et « acceptation » (PROPOSÉ)

**Décor** : Monad **mainnet 143**, recommandé pour la démo :
- chaîne dans la liste par défaut, avec Transaction Shield (DOC) ;
- pas de shim RPC (TIERS : le shim n'est nécessaire que sur 10143) ;
- pas de MFA à chaque transaction, contrairement à 10143, absent des `allowed_chains` par défaut (TIERS) ;
- ANCRE déployé le 09/10 au plus tard (feuille de route).

Montants : 0,01 USDC par appel. Le développement se fait sur 10143, où les registres 8004 sont présents (MESURÉ, §0).
Acteurs :
- deux fournisseurs x402, `good` et `farm`, derrière un serveur `@x402/express` local : un seul serveur, deux routes, deux `payTo` ;
- `good` = un agent 8004 approuvé par deux ancres (m = 2, D8) ;
- `farm` = un agent de la ferme du chantier 06 ;
- en option pour `check` : le vrai **Eve-8004 #182** et ses 7 665 avis (CLAUDE.md §3).

| t | Scène | Ce qu'on voit |
|---|---|---|
| 0:00-0:30 | Le trou | Deux lignes de doc à l'écran : l'outflow ne compte pas les signatures, et Guard Mode ne juge pas la contrepartie |
| 0:30-1:15 | **Naïf contre ANCRE** | `mm ancre check 182 --naive` : `getSummary` naïf flatteur, contre `UNTRUSTED` et `trustRobust = 0`. La ferme ne vaut rien |
| 1:15-2:00 | **Refus (garde douce)** | L'agent (Claude Code + skill) reçoit un 402 de `/farm` → `mm ancre pay` → `UNTRUSTED`, **aucune signature demandée** |
| 2:00-2:45 | **Refus (garde dure)** | On force le contournement : `x402_pay.py pay /farm --confirm` → `insufficient_funds` (l'EOA n'a pas d'USDC). Puis un blob signé à la main pour `from = payer` vers la ferme → le règlement revert : `isValidSignature` renvoie `0xffffffff`. Le hash de la tx en échec (ou le `invalidReasonDetails`) est à l'écran |
| 2:45-3:45 | **Acceptation** | `mm ancre pay /good --confirm` → `PAY` → signature `AncrePayment` par le wallet `mm` (intent lisible) → 200 + `PAYMENT-RESPONSE`, hash du transfert USDC `payer → good` sur l'explorateur |
| 3:45-4:40 | **Disjoncteur** | Une ancre poste un avis `veto` sur `good`, depuis sa propre clé, hors de l'agent. Le paiement suivant renvoie `VETOED`, avec `triggerTag = "veto"`. Sans recertification (D33 : dernier avis lu en direct) |
| 4:40-5:00 | Résumé | « Guard Mode : combien. ANCRE : à qui. Le contrat applique, le wallet signe, personne ne détient de clé. » |

Pré-requis matériels : un compte `mm` (Hugo, `mm login`), USDC et MON sur le payeur et le server-wallet, et la politique Guard Mode posée avant l'enregistrement. **Tout paiement mainnet et tout budget en MON attendent l'accord de Hugo.** Plan B si le facilitator Monad tombe : notre propre facilitator TS (`@x402/core` + `@x402/evm`), qui gère aussi ERC-1271 (DOC, x402.md §6.1), et une démo figée (D28).

---

## 8. Ce qui nous distingue (DOC pour les autres, PROPOSÉ pour nous)

| Projet | Question traitée | Applique ? | ERC-8004 |
|---|---|---|---|
| Skill officielle x402 (`x402_pay.py`) | « comment payer un 402 » | non : `--confirm` humain, EOA payeuse | aucun |
| **Warrant** (Beltran12138, ★1, poussé le 27/09) | « ce swap convient-il au mandant ? » | **non, par choix** (« reveals, does not enforce ») | **écrit** un avis (`tag1 = "warrant-preflight"`) sur l'identité de l'agent |
| `mm-plugin-ensv2` | noms ENSv2 + mint d'agent 8004 | — | **crée** des identités |
| `mm-plugin-allowances` | audit et révocation d'allowances | — | aucun |
| `shodai-subscriptions` | abonnements, schéma x402 maison | — | aucun |
| **ANCRE** | « cet agent mérite-t-il mon paiement ? » | **oui** : contrat payeur ERC-1271, refus au règlement | **lit et agrège**, résistant aux Sybil, relatif aux ancres, certifié on-chain |

**Articulation avec Warrant** (PROPOSÉ ; ne pas le refaire, ne pas l'attaquer) :
- nos schémas de tags classent `warrant-preflight` en **`measurement`** (D15). Il ne crée donc jamais d'arête : le README de Warrant admet lui-même que ce compteur « can be inflated by an agent that grants itself warrants » ;
- la skill ANCRE renvoie vers Warrant pour les swaps (§6, *Works with*) ;
- dans le pitch, on cite leur limite (« bypassable by construction ») comme **le problème que la garde dure résout pour les paiements**, sans prétendre qu'elle le résout pour les swaps.
- Remarque : leur agent de test #1937 sur 10143 porte des avis `warrant-preflight`. Il peut servir de cas de test réel « measurement ignoré » dans le graphe testnet.

---

## 9. Tests (PROPOSÉ)

Aucun harnais officiel n'existe (DOC, vague 1). On suit le motif d'ensv2 : logique pure testée avec `node:test`, exécuteur injecté.

| Niveau | Contenu | Outil |
|---|---|---|
| Manifeste | `PluginManifestSchema.parse(pkg.mm)` (import depuis `@metamask/agent-wallet/plugin`) ; `semver.satisfies("7.0.0", minCliVersion)` **et** `"6.2.0"` ; chaque `commands[].id` correspond à un fichier `dist/commands/...` et à un `pluginCommandId` | node:test |
| x402 pur | analyse du 402 v2 (en-tête base64), rejet v1 explicite, sélection (schéma, réseau, asset, plafond), `PaymentPayload` identique à celui de `@x402/core` pour une EOA (vecteurs croisés), décodage de `PAYMENT-RESPONSE` | node:test + vecteurs `@x402/core` 2.27.0 |
| Différentiel TS ↔ Solidity | `ancrePaymentTypedData` + `hashTypedData` en TS = `paymentDigest` du contrat ; `encodeBlob` décodé par le contrat ; digest EIP-3009 TS = celui recalculé par le payeur avec le vrai `DOMAIN_SEPARATOR` de l'USDC 143 (`0xfe22123e…93c6`, MESURÉ vague 1) | forge (fork 143) + fichiers de vecteurs JSON |
| Verdicts | chaque statut d'`assess` et chaque code de `decide` → libellé et action de la skill ; seuils θ/ρ au bord (égalité) | node:test + forge |
| Exécuteur simulé | `pay` n'appelle **jamais** l'exécuteur si le verdict ≠ PAY (espion) ; `AWAITING_MFA`, signature absente, mauvais signataire → `CommandError` ; aucun retry | node:test |
| Contrat payeur | `isValidSignature` : OK, UNTRUSTED, VETOED (avis de veto posé dans le fork), WALLET_MISMATCH, OVER_CAP, mauvais opSig, hash ≠ digest ; `sweep` → treasury seulement ; `setPolicy` onlyOwner ; **gas d'`isValidSignature` mesuré via un contrat consommateur non-view** (piège AM-R5.1 : les `view` ne sont pas isolés dans forge) | forge, fork 143 |
| Bout en bout local | serveur `@x402/express` + facilitator TS local + anvil (fork 143) : paiement `good` réglé, `farm` refusé, veto entre `/verify` et `/settle` → échec au règlement | script node |
| Bout en bout réel (**bloquant, avec accord**) | sur 10143 : `mm plugins install file:$PWD` avec la 7.0.0, puis `mm ancre pay` contre le **facilitator Monad** avec un payeur 1271 réel. Mesures : gas facturé au facilitator, acceptation par x402-rs du blob de plus de 65 octets | manuel, consigné |

---

## 10. Risques (du plus bloquant au moins bloquant)

1. **Le facilitator Monad (x402-rs) plafonne-t-il le gas de `transferWithAuthorization` ?** `isValidSignature` appelle `isTrusted` → `assess` (77 à 190 k, `contracts/GAS.md`), plus `getAgentWallet`, `ownerOf` et un ecrecover. Si le facilitator fixe une limite trop basse, **la garde dure tombe sur ce facilitator** (NON TROUVÉ dans le code lu). C'est le test bloquant de x402.md §10. Repli : notre facilitator TS, et le chemin transaction `payDirect`.
2. **ERC-1271 côté x402-rs, jamais testé de bout en bout** (DOC par lecture de code, non testé).
3. **Plugins en bêta** : `experimentalPlugins` est requis, `experimentalAllowUnverifiedInstalls` aussi pour `file:`. Le chemin « vérifié » passe par `npm publish`, ce qui rend le paquet public alors que le dépôt est privé (CLAUDE.md §5). → Décision de Hugo, et question aux organisateurs (§11).
4. **`minCliVersion`** : corrigé en `">=6.2.0 <8"`, à confirmer au premier `mm plugins install` (DÉDUIT).
5. **Blockaid ou Guard Mode sur la typed-data `AncrePayment`** : comportement inconnu face à un domaine EIP-712 inconnu. Warrant signe un domaine maison sans approbation, ce qui est encourageant (TIERS).
6. **Le schéma YAML de Guard Mode n'est pas public.** L'allowlist « payeur seul » est à valider avec `mm wallet policy template` (compte requis). Modifier la politique demande probablement un MFA : à faire avant l'enregistrement.
7. **Trois modes de connexion = trois adresses** : l'opérateur du payeur doit être le bon. Le préflight de la skill et `assertOperator` le vérifient.
8. **Dépendance de vivacité** (AM-2.12) : pas de recertification = `STALE` = plus aucun paiement. Pour la démo, recertifier avant l'enregistrement, avec `maxAge` large.
9. **`getClients(182)` pour `--naive`** peut renvoyer des milliers d'adresses : taille de l'`eth_call` à mesurer. Repli : afficher le chiffre naïf depuis le snapshot de l'indexeur.
10. **Opérateur compromis** : il peut dépenser le solde vers des agents fiables. Risque borné par `maxPerPayment` et le solde, et documenté.
11. **Délai** : environ 1 jour pour le contrat payeur et ses tests en fork, 1 jour pour le plugin et la skill, 0,5 jour pour la démo. Tout cela vient **après D32 et après la démo figée** (D38). Dépend de 02 (ANCRE déployé), 04 (certificat), 06 (ferme).

---

## 11. Éligibilité : question à poser aux organisateurs (Discord Monad Metropolis, en anglais)

> Hi team! A question about the **MetaMask "Best Agent Wallet Plugin"** bounty.
> The bounty card shows the track *Onchain Finance & Trading*. Our project is registered in **Track 04 (Trust, Identity & AI Infra)**, and the MetaMask plugin is one of its components: it implements suggested direction **#05, agent-to-agent commerce (x402 payments + ERC-8004 reputation)**. It lets an agent pay another agent only when a Sybil-resistant ERC-8004 reputation check passes, with every signature going through the Agent Wallet.
> 1. Is a project whose main track is 04 **eligible** for this bounty, or is the displayed track a filter?
> 2. Can a single submission compete for a **main-track prize and several sponsor bounties** (Envio, MetaMask, Mera)?
> 3. For "installable via the Agent Wallet": is `mm plugins install file:<repo>` / git (with `experimentalAllowUnverifiedInstalls`) acceptable for judging, or do you expect an **npm-published** package?
> 4. Can the plugin live in a **subfolder of our main repository**, or should it be a separate repo? And must the repository be **public** at submission time?
> 5. Is a demo on **Monad mainnet with small USDC amounts** fine, or do you prefer testnet?
> Thanks!

---

## 12. Ce qui reste à trancher par Hugo

- Garde dure (payeur ERC-1271) **dans le périmètre** du bounty, ou garde douce seule ? Recommandation : garde dure. C'est ce qui nous distingue, et c'est le même contrat que le `TrustGatedRouter` du chantier 05.
- `AncrePayment` (domaine du payeur, lisible) **ou** signature directe de la typed-data USDC `TransferWithAuthorization(from = payer)` ? Recommandation : `AncrePayment`. Le digest est plus clair pour l'humain et le domaine est cloisonné.
- Publication npm du paquet, alors que le dépôt reste privé.
- Owner et treasury du payeur de démo : quelle adresse humaine (MetaMask Mobile de Hugo ?).
- Envoi de la question du §11, et par qui.

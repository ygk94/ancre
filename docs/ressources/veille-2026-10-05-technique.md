# Veille technique du 2026-10-05 : ce qui a changé depuis le 27/09

> Mesures faites le **2026-10-05 entre 20:16 et 20:40 UTC**. Bloc mainnet de référence : **110 845 250** ; testnet : **68 494 368**.
> Statuts : **MESURÉ** (commande lancée par nous), **DOC** (page officielle lue ce jour), **NON TROUVÉ** / **NON MESURÉ**.
> Outils : `cast` (Foundry 1.8.3), `curl` sur l'API GitHub publique, API Discourse d'ethereum-magicians, registre npm.
> Aucune transaction envoyée.

## 0. Ce qui contredit CLAUDE.md ou le code

| # | Fait nouveau | Ce qu'il contredit / rend périmé | Gravité |
|---|---|---|---|
| C1 | **7 nouveaux avis sur le mainnet** depuis le bloc 108 835 675 (28/09 → 04/10), voir §A.6 | `solver/snapshot.py` (« no log to 108835675 ») et les chiffres de CLAUDE §3 : le graphe a bougé | moyenne : relancer l'indexeur / le solveur |
| C2 | **Premier cas mainnet daté d'auto-notation après transfert** : `0x4947…783a` mint #10254 et #10255, transfère #10255 au bloc 109 331 923, puis lui met **5 notes à 100** à partir du bloc 109 332 841 (≈ 4,6 min plus tard). Il possède toujours #10254 | Décision **D20** (règle « ancien owner » supprimée de la norme). Le registre accepte ces avis, et `clientWasController` (indexeur) vaut `false` au bloc de l'avis. L'arête #10254 → #10255 entre donc dans le graphe | **à arbitrer** : ce n'est pas un bug de code, c'est le prix de D20, désormais observable |
| C3 | **Le registre Validation ERC-8004 v2.0.0 est déployé sur Monad**, mainnet `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`, testnet `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`, depuis le **2026-02-03** | CLAUDE §3 ne cite que Identity et Reputation. Aucune mention dans `contracts/`, `plugin/`, `solver/` ni `indexer/`. Ce n'est pas nouveau, c'est un **angle mort** | faible (1 seule requête en 8 mois) |
| C4 | DOC `current-facts` : **temps de bloc 300 ms** (« mean block time about 302 ms in September 2026 ») | CLAUDE §7 : « Temps de bloc 0,3 s ou 0,4 s selon la doc (non tranché) ». C'est tranché (déjà noté dans `docs/ressources/monad-dev-et-soumission.md`, mais pas reporté dans CLAUDE.md) | faible : corriger CLAUDE §7 |
| C5 | Clients RPC mainnet tous en **Monad/0.16.4** (y compris `rpc1`), testnet en **0.16.3** | `monad-dev-et-soumission.md` (27/09 : `rpc` 0.16.2, `rpc1` 0.16.1). `current-facts` est lui-même périmé (annonce v0.16.1 mainnet / v0.16.2 testnet) | faible |
| C6 | `@x402/*` **2.28.0** (29/09) ; `envio` **3.13.0** (23/09) puis **3.14.0** (05/10, dist-tag `next`) | `plugin/package-lock.json` est figé en 2.27.0 ; `indexer/package.json` épinglé à `envio` 3.12.1. Rien de cassant repéré pour nous | faible : pas de mise à jour nécessaire avant la soumission |

Rien de ce qui suit ne contredit les adresses, les versions de registre, l'owner, le facilitator ou l'USDC utilisés dans le code.

## A. ERC-8004

### A.1 Proxys on-chain : inchangés (MESURÉ)

Commande : `cast storage <proxy> 0x360894a1…382bbc`, `cast call <proxy> "getVersion()(string)"`, `cast call <proxy> "owner()(address)"`.

| Réseau | Proxy | Implémentation ERC-1967 | `getVersion()` | `owner()` |
|---|---|---|---|---|
| mainnet 143 | Identity `0x8004A169…a432` | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` (= 27/09) | 2.0.0 | `0x5472…2603` |
| mainnet 143 | Reputation `0x8004BAa1…9b63` | `0x16e0fa7f7c56b9a767e34b192b51f921be31da34` (= 27/09) | 2.0.0 | `0x5472…2603` |
| testnet 10143 | Identity `0x8004A818…BD9e` | `0x7274e874…9c02` (**même adresse d'impl. que le mainnet**) | 2.0.0 | `0x5472…2603` |
| testnet 10143 | Reputation `0x8004B663…8713` | `0x16e0fa7f…da34` (idem) | 2.0.0 | `0x5472…2603` |

Logs `Upgraded(address)` sur les deux proxys mainnet depuis le bloc 108 835 675 : **0** (MESURÉ, `eth_getLogs` sur `rpc1.monad.xyz`). Pas de v2.1.0 déployée.

### A.2 Dépôt `erc-8004/erc-8004-contracts` (MESURÉ, API GitHub, 05/10)

- **Aucun commit sur `master` depuis le 2026-08-15** (dernier : `b9e466c250` « Fixed typo »). Donc `ERC8004SPEC.md` n'a pas changé.
- Aucune release publiée.
- **PR #80** « Reverse lookup and unique agentWallet » (v2.1.0) : **toujours ouverte, non fusionnée**, dernier commit `80305be7b4` le 2026-06-04, 6 commentaires de revue. Branche `feat/unique-reverse-lookup` inchangée.
- **PR #84** « block contract owners from self-feedback in giveFeedback() » : **fermée sans fusion le 2026-08-17** (pas de changement).
- Nouveautés depuis le 20/09 :
  - **PR #100** (22/09, ouverte) : adresses Arc Mainnet. Sans objet pour nous.
  - **Issue #99** (predge-ai, ouverte le 14/09, active jusqu'au 04/10) : « Grounding feedback in verifiable payment-proof (x402) as a Sybil-resistance primitive ». Le fil a abouti à un schéma (`x402-grounded-feedback-v0`) publié chez predgeAI (`github.com/predgeAI/erc8004-outcome-validator`, commit `2c4d745`, dossier `grounded-feedback/`, 5 vecteurs signés). Points convergés : `ratee` séparé du `payee`, **« tag = méthode de vérification, poids = politique du lecteur »**, au plus un avis par paiement réglé. Trois questions posées aux mainteneurs, **sans réponse au 05/10**.
    - **Pertinent pour ANCRE** : le commentaire de vadium-dev (26/09) décrit le contournement « un financeur arrose N wallets qui paient puis notent » (la ferme d'Eve) et propose de pondérer par indépendance des noteurs. MuhammedAkinci répond qu'un **contrat ne peut pas parcourir un graphe pendant un règlement**. C'est exactement le trou que comble un certificat lisible par contrat. On peut s'y appuyer dans le pitch et dans une réponse publique.
  - Aucune nouvelle PR ni issue sur l'auto-notation, `agentWallet` ou l'upgrade.

### A.3 Spec EIP-8004 (MESURÉ, API GitHub `ethereum/ERCs`, chemin `ERCS/erc-8004.md`)

- Dernier commit sur le fichier : **2026-01-25** (`503591a6e8`). **Aucune modification de la spec** depuis le 27/09.
- Nouvelles PR d'ERC proches (aucune ne fait d'agrégation de réputation) : #2044 « Agent Identity (AID) » (30/09), #2046 « Agent Collective Decision Framework » (04/10), #2012 « Know-Your-Agent » (19/09, active le 01/10), #1808 « Validation Network for ERC-8004 » (Pocket Network, active le 05/10). Le constat « aucun ERC d'agrégation » de CLAUDE §3 **tient toujours**.

### A.4 Fil ethereum-magicians #25098 (MESURÉ, `https://ethereum-magicians.org/t/25098.json`, 05/10)

- 396 posts visibles, numéro le plus haut **#409**, dernier post le 2026-10-05 12:59 UTC. Depuis le 27/09 : **#403 à #409** (le #405 est masqué ou supprimé). Aucun post entre le 18/09 (#402) et le 02/10 (#403).
  - #403 (yaojin0609, 02/10) : corrige ses propres chiffres du #390. Les « 62 % d'avis avec URI sans hash » venaient à 99 % d'un seul agent sur Base (#25975, 300 339 avis `miner-vouch` de 62 adresses). **Utile comme exemple de concentration** (même motif qu'Eve-8004 chez nous).
  - #404 (Zetav1, 02/10) : adaptateur Validation Registry adossé à Verdikta.
  - #406-#409 (babyblueviper1, predge-ai) : schéma « grounded feedback » (voir A.2) et états d'oracle proposé / contesté / final.
- **Le #309 (clai-mach, ancres choisies par le lecteur) n'a toujours aucune réponse des auteurs.** Réponses existantes : #310, #311, #320 (juillet, pas des auteurs). Les auteurs (davidecrapis.eth, Marco-MetaMask) n'ont rien posté depuis le 03/11/2025. → **Le créneau de réponse au #309 reste libre.**

### A.5 Registre Validation sur Monad (MESURÉ)

| Réseau | Proxy | Impl. ERC-1967 | `getVersion()` | `getIdentityRegistry()` | `owner()` |
|---|---|---|---|---|---|
| mainnet 143 | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` | `0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99` | 2.0.0 | Identity mainnet | `0x5472…2603` |
| testnet 10143 | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `0xdb31f5d9…7f99` | 2.0.0 | Identity testnet | `0x5472…2603` |

Source de l'adresse mainnet : issue #99, commentaire de predge-ai du 29/09 (« v2.0.0 at `0x8004Cc84…`, same address on Arc and Celo »). Vérifiée par `cast codesize` (130 octets, proxy). L'adresse mainnet n'a pas de code sur le testnet, et inversement.

Activité mainnet (`eth_getLogs`, tout l'historique, `rpc1`) : 7 logs. Ce sont le déploiement et l'init le **2026-02-03** (bloc 52 952 798, impl. `0xcb7a…f067`, puis `0xdb31…7f99` au bloc 52 952 906), puis **1 `ValidationRequest` + 1 `ValidationResponse`** le **2026-09-20** (blocs 106 470 714 / 718), validateur `0xdb6c…7777`, agent **#10252**, réponse 100. Activité testnet : **NON MESURÉE** (voir A.7).

→ Même EOA owner que les deux autres registres, donc même risque d'upgrade. Pratiquement vide : **ne pas construire la démo dessus**. En revanche, c'est la cible naturelle du schéma « grounded feedback » (A.2) ; à citer dans l'ERC comme source d'arêtes possible, pas plus.

### A.6 Nouveaux avis mainnet (MESURÉ)

Commande : `eth_getLogs` sur `rpc1.monad.xyz`, topic `NewFeedback` = `0x6a4a6174…58febc`, adresse Reputation, du bloc 108 835 675 à `latest`. Contrôle de cohérence : la fenêtre 108 483 651 → 108 835 675 redonne bien **95** logs (= CLAUDE §3).

**7 nouveaux avis, 0 révocation** (`FeedbackRevoked` : 0), tous `valueDecimals = 0` :

| Bloc | Date (UTC) | Agent noté | Noteur | Idx | Valeur | tag1 / tag2 | Noteur owner d'un agent ? |
|---|---|---|---|---|---|---|---|
| 108 878 432 | 28/09 23:11 | #10188 | `0x9456…8f09` | 1 | 90 | `requester_rating:knowledge_access` / `0x945659f0` | oui, #10167 |
| 108 878 568 | 28/09 | #10262 | `0x5975…500d` | 1 | 90 | idem / `0x5975442e` | oui, #10169 |
| 109 332 841 → 110 493 175 | 30/09 13:22 → 04/10 14:42 | #10255 | `0x4947…783a` | 1-5 | 100 ×5 | `tab` / `settled` | oui, #10254 (et **ex-owner de #10255**, voir C2) |

- Les deux premiers viennent d'**execution.market** (feedbackURI `https://execution.market/feedback/…`). Les 4 agents concernés (#10167, #10169, #10188, #10262) sont mintés par `0x1030…` puis transférés : c'est le motif plateforme qui avait justifié D20.
- Les cinq derniers pointent vers `gateway-mainnet-production.up.railway.app/reputation/…`. Le noteur a signé lui-même (tx `from` = client).
- Ces 3 noteurs possèdent chacun un agent, donc **3 arêtes agent → agent potentielles de plus** (à passer dans le schéma de tags et les filtres D16/D20 avant de conclure quoi que ce soit).
- Agents enregistrés depuis le bloc 108 835 675 : **18** (`Registered`), dernier id **#10279**.
- Total cumulé (CALCULÉ, en supposant comme CLAUDE §3 aucun avis entre le snapshot du 21/09 et le bloc 108 483 651) : 9 188 + 95 + 7 = **9 290 avis**.

### A.7 Testnet

- Proxys et versions : voir A.1 (inchangés).
- Comptage des `NewFeedback` : **NON MESURÉ**. `testnet-rpc.monad.xyz` limite `eth_getLogs` à 100 blocs (erreur `-32614`), et HyperSync exige maintenant un jeton API (« Your token is malformed »), absent du dépôt (`indexer/.env.example` seulement). Il faut soit un jeton Envio, soit un balayage par tranches de 100 blocs (~23 000 appels par semaine de blocs).

## B. Réseau Monad et outillage

### B.1 Versions et changelog

- `web3_clientVersion` (MESURÉ 05/10) : `rpc`, `rpc1`, `rpc2`, `rpc3`, `rpc-mainnet.monadinfra.com` → **Monad/0.16.4** ; `testnet-rpc` → **Monad/0.16.3**.
- `https://docs.monad.xyz/networks.json` (DOC 05/10) : mainnet `0.16.4`, testnet `0.16.3`, MIP-8 `hardfork_timestamp` mainnet 1 788 359 400 (= 02/09/2026), testnet 1 786 545 000.
- Changelog `https://docs.monad.xyz/developer-essentials/changelog/releases` (DOC 05/10) :
  - **v0.16.4** (date de sortie « N/A » sur la page) : uniquement `[Node ops]` (flag `--snapshot-format`, log `gas_used`). **Aucun changement de gas, d'opcode ni de paramètre.**
  - **v0.16.3** (« N/A ») : nœuds archive sans double écriture après MIP-8 ; `get_storage_at` choisit l'encodage page/slot selon le bloc demandé ; les méthodes de filtre renvoient `InvalidParams` au lieu d'une erreur interne ; P-256 mis en cache par thread (perf, **pas de changement de prix**) ; **EIP-7981** (coût d'access list accru) implémentée mais **active seulement à partir de `MONAD_ETH_AMSTERDAM`, inatteignable sur les réseaux actuels**. Statesync v0/v1 retirés.
  - v0.16.2 (mainnet 10/09, testnet 03/09) : déjà connue. Codes d'erreur JSON-RPC corrigés ; `eth_call` à `maxFeePerGas = 0` n'est plus relevé au base fee.
  - **Pas de nouvelle révision** (on reste en `MONAD_TEN`), pas de nouveau MIP.
- `https://docs.monad.xyz/ai/current-facts` (DOC 05/10) : bloc **300 ms** (moyenne ≈ 302 ms en septembre), finalité spéculative 1 slot, finalité 600 ms, **150 M gas/bloc**, **30 M gas/tx**. La page annonce encore v0.16.1 / v0.16.2 (périmé par rapport à `networks.json`).
- Paramètres mesurés (05/10) : base fee **100 gwei**, `eth_gasPrice` **102 gwei**, gas limit du bloc 150 000 000 (identiques au 28/09). `rpc.monad.xyz` : `eth_getLogs` toujours limité à 100 blocs ; `eth_getProof` toujours « Method not found ».

### B.2 Facilitator x402 (MESURÉ)

`curl -i https://x402-facilitator.molandak.org/supported`, 2026-10-05 20:19:07 UTC, HTTP 200 :

```json
{"extensions":[],"kinds":[
 {"network":"eip155:10143","scheme":"batch-settlement","x402Version":2},
 {"network":"eip155:143","scheme":"batch-settlement","x402Version":2},
 {"extra":{"facilitatorAddress":"0x7f6a2850669202519f0fe8aa912451238820db86"},"network":"eip155:10143","scheme":"upto","x402Version":2},
 {"extra":{},"network":"eip155:10143","scheme":"exact","x402Version":2},
 {"extra":{},"network":"eip155:143","scheme":"exact","x402Version":2},
 {"extra":{"facilitatorAddress":"0x7f6a2850669202519f0fe8aa912451238820db86"},"network":"eip155:143","scheme":"upto","x402Version":2}],
 "signers":{"eip155:10143":["0x7f6a2850669202519f0FE8aa912451238820Db86"],"eip155:143":["0x7f6a2850669202519f0FE8aa912451238820Db86"]}}
```

**Inchangé** depuis le 27/09 et le 01/10 (cf. `docs/ressources/x402.md`, `docs/chantiers/journal/05.md`). Note : CLAUDE §3 ne liste que `exact` + `upto` ; `batch-settlement` est déjà documenté ailleurs dans le dépôt.

Dépôt `monad-developers/x402-rs` (MESURÉ, API GitHub) : dernier commit `a150a8a0` le **2026-09-23** « feat: add EVM batch settlement (#7) », `pushed_at` identique. **Rien depuis le 27/09.**

SDK x402 de référence : `@x402/core|evm|fetch` **2.28.0** publié le 29/09 (npm). Changement lié à Monad : commit `a9955ae5` (28/09) « add Monad testnet USDC default asset », qui fixe `eip155:10143` → `0x534b2f3A21130d7a60830c2Df862319e593943A3` (USDC, version « 2 », 6 décimales, EIP-3009) et le nom v1 `monad-testnet`. **C'est la même adresse que `plugin/src/lib/config.ts`**, donc aucun conflit. Le dépôt est figé en 2.27.0 par le lockfile, ce qui convient.

### B.3 USDC (MESURÉ)

- Mainnet `0x754704Bc…b603` : `name` = « USDC », `version` = « 2 », 6 décimales, `paused` = false, impl. (slot zOS) `0xbd520ea8…0b6d`, **identique** à `docs/ressources/x402.md`.
- Testnet `0x534b2f3A…43A3` : impl. `0x21240161…42fb`, **identique**.

### B.4 Envio HyperSync / HyperIndex

- HyperSync `/height` (MESURÉ 05/10) : `monad.hypersync.xyz` et `143.hypersync.xyz` → 110 845 853 ; `monad-testnet` / `10143.hypersync.xyz` → 68 494 972, à jour. **Les requêtes `/query` sans jeton sont refusées** (message ci-dessus).
- `envio` (npm / GitHub `enviodev/hyperindex`, MESURÉ) : **3.13.0** (23/09 : multiprocess automatique, source RPC réécrite en Rust), **3.14.0** (05/10, dist-tag `next` : nouveau TUI en Rust, ajout de chaînes à chaud). `latest` reste **3.12.1**, la version épinglée dans `indexer/package.json`. Pas de raison de bouger avant le 13/10.

### B.5 MetaMask Agent Wallet (MESURÉ, npm)

`@metamask/agent-wallet` : dist-tag `latest` = **7.0.0** (16/09), **aucune version publiée depuis le 20/09**. Pas de changement d'API plugin. Le lockfile du plugin est en 7.0.0.

### B.6 Mera (MESURÉ, npm)

`@category-labs/mera` : `latest` = **0.2.0** (12/08), **aucune version depuis**.

## C. Actions suggérées (pas exécutées)

1. **Relancer l'indexeur et le solveur** au-delà du bloc 108 835 675 (7 avis, 3 arêtes candidates), puis mettre à jour `solver/snapshot.py` et CLAUDE §3.
2. **Trancher C2** : le cas #10255 (transfert puis auto-notation au bout de 4,6 min) est l'exemple qui manquait pour expliquer D20. Soit on assume (la règle « ancien owner » était invérifiable, et ANCRE ne donne de masse à #10254 que s'il est relié aux ancres), soit on l'expose dans la démo comme un cas que le registre laisse passer.
3. Corriger CLAUDE §7 (bloc 300 ms, DOC) et ajouter les adresses du registre Validation à CLAUDE §3.
4. Pour la réponse au #309 : citer l'issue #99. Le fil y conclut que « le poids relève du lecteur » et qu'« un contrat ne peut pas parcourir le graphe en règlement ». ANCRE répond aux deux.
5. Demander un jeton Envio si l'on veut compter les avis du testnet.

# Monad : développement, déploiement, et règles de soumission Metropolis

> Vague 1 de recherche documentaire, **2026-09-27**. Tous les faits portent un statut :
> **DOC** (doc officielle lue ce jour), **MESURÉ** (appel RPC fait ce jour, lecture seule), **SECONDAIRE** (source tierce, à confirmer), **NON TROUVÉ**.
> Aucune transaction, aucun compte créé. Les pièges de CLAUDE.md §7 ne sont pas re-vérifiés, sauf s'il y a contradiction (signalée).
> Sources de base : vault `Docs-officielles/Réseaux, RPC, faucet & tooling Monad.md` et `Temps réel — WebSocket & lecture live sur Monad.md`, testés sur le **testnet** le 15/09. Ce document y ajoute le mainnet et les règles.

---

## 0. Ce qui change nos plans (à lire en premier)

| # | Fait | Statut | Conséquence |
|---|---|---|---|
| 1 | Selon les **Rules v3.0 (§7.2)**, citées par un concurrent : *« All submissions must be open source under an OSI-approved license… Code must be publicly accessible on GitHub throughout and after the Hackathon. »* La page publique dit au contraire « encouraged but not required ». | SECONDAIRE | **Contredit la décision « dépôt privé »** (CLAUDE.md §5). Hugo doit relire la modale Rules sur hackathon.monad.xyz. Si c'est confirmé : il faut une licence OSI et un dépôt public au plus tard à la soumission. Le texte dit même « throughout » : à trancher. |
| 2 | Vidéo de démo **≤ 3 min, plafond strict** (Rules §4.1, §9.4), hébergée publiquement (YouTube, Loom, Vimeo), qui montre le produit qui tourne et des interactions Monad, pas des maquettes. | SECONDAIRE | Le script du chantier 09 doit tenir en 3:00. |
| 3 | Les outils de code IA sont permis, mais **doivent être déclarés dans le README** (Rules §4.1.4). | SECONDAIRE | Ajouter une section « AI disclosure » au README (on utilise Claude Code massivement). |
| 4 | Grille de jugement (Rules §5.2), 5 critères à **20 % chacun** : Product Quality & Completeness, Technical Excellence, Monad Integration, Track Fit & Problem Relevance, Innovation & Impact. Grille des bounties : respect des exigences 40 %, implémentation technique 30 %, intégration Monad 20 %, innovation 10 %. | SECONDAIRE | Le critère « Monad Integration » vaut 20 % : il faut montrer à l'écran des adresses de contrats et des tx, et dire pourquoi Monad est nécessaire. |
| 5 | Date limite : **13/10/2026, 23:59 ET** = **14/10 03:59 UTC** = **14/10 05:59 heure de Paris**. | SECONDAIRE (Rules §4.2), cohérent avec les fiches bounty copiées par Hugo | Concorde avec le « 14/10 05:59 GMT+2 ». Garder la cible de soumission du 12/10. |
| 6 | Le mainnet **ou** le testnet sont acceptés (Rules §9.2). | SECONDAIRE | Le mainnet reste notre choix (les registres 8004 n'existent que là), mais ce n'est pas obligatoire. |
| 7 | Sur `rpc1.monad.xyz` (Alchemy), un `eth_getLogs` sur **tout l'historique** du registre Reputation renvoie **9 288 logs** en un seul appel. La doc annonce pourtant « 1 000 blocs et 10 000 logs ». | MESURÉ (27/09 ~21 h UTC) | Confirme la mesure du README des chantiers. **On est à 712 logs du plafond annoncé de 10 000** : l'indexeur (chantier 03) doit prévoir le découpage en tranches, sans compter sur cet appel unique. |
| 8 | Hors fournisseur spécial, l'état historique (`eth_call` à un vieux bloc) n'est pas garanti : **~40 000 blocs (~3,3 h)** pour un SSD de 2 To. | DOC | Pour reconstruire `getAgentWallet` / owner à un bloc passé, utiliser `rpc-mainnet.monadinfra.com` ou `rpc2`, ou bien les events. |

Source des lignes SECONDAIRE : README de `precious-akpan/monad-metropolis-merchant-rails` (concurrent de la track 02), section « Binding facts — from the official "Metropolis Hackathon Rules & Guidelines" modal, v3.0, last updated 3 Sep 2026 », lue par son auteur le 22/09. Dernier commit du dépôt : 23/09. https://github.com/precious-akpan/monad-metropolis-merchant-rails

---

## A1. Déployer et vérifier sur le mainnet (143) avec Foundry

**Version** (DOC, https://docs.monad.xyz/tooling-and-infra/toolkits/foundry) : Foundry **≥ 1.8.0** obligatoire (« Foundry releases before v1.8 do not include Monad execution support »). Le fork `category-labs/foundry` est déprécié : il s'arrête à MonadNine, sans MIP-8. Le hardfork local par défaut est `MonadTen`. En fork d'un RPC Monad, le hardfork est choisi via le chainId et le timestamp du bloc. Il existe une action CI : `foundry-rs/foundry-toolchain@v1` avec `version: v1.8.0`.

**`foundry.toml` recommandé** (vault, compilé et testé en 1.8.3 le 15/09, adapté au mainnet) :
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.31"
evm_version = "osaka"
optimizer = true
optimizer_runs = 200
network = "monad"            # règles Monad en local : gas, opcodes, precompiles, 128 Ko de code, 256 Ko d'initcode
use_literal_content = true   # sources littérales dans les métadonnées (vérification)

[rpc_endpoints]
monad = "https://rpc.monad.xyz"
monad_testnet = "https://testnet-rpc.monad.xyz"
```
Piège (vault, MESURÉ le 15/09) : les clés `metadata = true` et `metadata_hash = "none"` du guide officiel de vérification et du template `foundry-monad` **n'existent pas** dans Foundry. Elles produisent un warning et sont ignorées. Les vraies clés sont `bytecode_hash` et `cbor_metadata`.

**Déploiement** (DOC, https://docs.monad.xyz/guides/deploy-smart-contract/foundry ; le guide cible le testnet, il suffit de changer le RPC) :
```bash
export PATH="$PATH:$HOME/.foundry/bin"
cast wallet import monad-deployer --private-key $(cast wallet new | grep 'Private key:' | awk '{print $3}')   # keystore recommandé
cast wallet address --account monad-deployer

# variante 1 : forge create (sans --broadcast, c'est un simple dry-run)
forge create src/AnchoredReputation.sol:AnchoredReputation \
  --rpc-url monad --account monad-deployer --broadcast \
  --constructor-args <args>

# variante 2 (préférée) : forge script. vm.startBroadcast() sans adresse
forge script script/Deploy.s.sol:Deploy --rpc-url monad --account monad-deployer \
  --broadcast --gas-estimate-multiplier 110   # défaut 130 = +30 % de gas limit PAYÉ sur Monad
```

**Vérificateurs** (DOC, https://docs.monad.xyz/guides/verify-smart-contract/foundry et https://docs.monad.xyz/tooling-and-infra/block-explorers) :

| Explorer | Moteur | Vérificateur | Clé ? |
|---|---|---|---|
| MonadVision (monadvision.com) | BlockVision | Sourcify `https://sourcify-api-monad.blockvision.org` | non |
| Monadscan (monadscan.com) | Etherscan | Etherscan API v2 (`--verifier etherscan`). La page explorers cite `https://api.monadscan.com/api` | clé Etherscan (une clé v2 couvre toutes les chaînes) |
| sourcify.dev | Sourcify | défaut de `--verifier sourcify` (le vault a constaté que 143 et 10143 sont supportés) | non |
| Tenderly, Blocksec Phalcon | — | traces détaillées, pas de vérification | — |

```bash
# MonadVision (Sourcify BlockVision)
forge verify-contract <ADRESSE> src/AnchoredReputation.sol:AnchoredReputation \
  --chain 143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(address)" 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63)

# Monadscan (Etherscan v2)
forge verify-contract <ADRESSE> src/AnchoredReputation.sol:AnchoredReputation \
  --chain 143 --verifier etherscan --etherscan-api-key $ETHERSCAN_API_KEY --watch

# en une passe : forge create … --broadcast --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```
Statut : le vault a vérifié le 15/09 la syntaxe sur le **testnet** (un job Sourcify est soumis, et la requête atteint Etherscan). Un succès réel sur le **mainnet** n'a pas été testé (il faudrait une tx). La doc Foundry annonce une « Monad-aware bytecode replay for Forge verification workflows ». Il existe aussi une vérification manuelle : https://monadvision.com/verify-contract.
Conseil : vérifier sur **les deux** explorers. Le jury cliquera sur l'un ou l'autre.

**Adresses canoniques utiles sur le mainnet** (DOC, https://docs.monad.xyz/developer-essentials/network-information) : Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`, CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`, Permit2 `0x000000000022d473030f116ddee9f6b43ac78ba3`, WMON `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`, **x402 ExactPermit2Proxy `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`**, **x402 UptoPermit2Proxy `0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002`**. Ces deux proxys x402 concernent le chantier 05 (`upto`).

**Versions client** (MESURÉ, `web3_clientVersion`, 27/09) : `rpc.monad.xyz` 0.16.2, `rpc1` 0.16.1, `rpc2` 0.16.4, `rpc3` 0.16.2, `rpc-mainnet.monadinfra.com` 0.16.4. La doc se contredit : « current-facts » annonce v0.16.1 / MONAD_TEN, la page Network Information annonce v0.15.2 / MONAD_NINE (page périmée). Source à croire : `https://docs.monad.xyz/networks.json`.

---

## A2. Temps réel : WebSocket, blocs spéculatifs, temps de bloc

**Temps de bloc : la contradiction entre 0,3 s et 0,4 s est tranchée.**

MESURÉ le 27/09 à ~21:17 UTC via `cast block <n> --field timestamp` sur `https://rpc.monad.xyz`, bloc de tête 108 570 301. Le timestamp est à la seconde, donc une moyenne sur 1 000 blocs a une précision d'environ ±1 ms :

| Fenêtre | Δt | Moyenne |
|---|---|---|
| 1 000 blocs | 302 s | **0,302 s** |
| 5 000 blocs | 1 509 s | 0,3018 s |
| 10 000 blocs | 3 020 s | 0,3020 s |
| 100 000 blocs | 30 216 s | 0,3022 s |
| 1 000 000 blocs (~3,5 jours) | 302 126 s | 0,3021 s |

→ **0,302 s**, identique à la DOC (« mean block time was about 302 ms in September 2026 », https://docs.monad.xyz/ai/current-facts). Le « 400 ms » vient de `viem/chains` (`blockTime: 400`, périmé) et d'anciens articles. Ordres de grandeur : ~3,3 blocs/s, **~286 000 blocs/jour** (CLAUDE.md dit 288 000, c'est cohérent). La DOC donne aussi : finalité spéculative 1 slot (300 ms), finalité 2 slots (600 ms), 150M gas/bloc, 30M gas/tx.

**Souscriptions** (DOC, https://docs.monad.xyz/reference/json-rpc/overview#websocket-subscriptions) :
- `newHeads` et `logs` : émis au stade `Proposed`, c'est-à-dire exécutés de façon spéculative ;
- `monadNewHeads` et `monadLogs` : même contenu, plus des mises à jour successives avec `blockId` et `commitState` ∈ {`Proposed`, `Voted`, `Finalized`, `Verified`} ;
- un bloc peut sauter `Voted` ;
- un bloc abandonné ne produit **aucun événement** : c'est la finalisation d'un autre bloc à la même hauteur qui le remplace ;
- `syncing` et `newPendingTransactions` ne sont pas supportés ;
- page de fond : https://docs.monad.xyz/monad-arch/realtime-data/spec-realtime (« Geth-style reorganizations don't occur in monadNewHeads or monadLogs »).

**Block tags** (DOC) : `latest` = Proposed, `safe` = Voted, `finalized` = Finalized, `pending` = latest. Toute réponse qui touche un bloc non finalisé peut changer.

**Ce que doit faire l'écran de démo** (vault, testé le 15/09 sur le testnet : 794 blocs, 0 abandon, 0 log manquant malgré une coupure WS de 4 s) :
1. Ouvrir une seule WSS avec deux souscriptions : `monadLogs` filtré sur nos adresses (router et vérificateur) et sur les deux registres, plus `monadNewHeads`.
2. Dédoublonner par `transactionHash:logIndex` : un log arrive jusqu'à 4 fois.
3. Afficher à `Proposed` (~50-150 ms), considérer comme acquis à `Voted` (~0,3 s), compter à `Finalized` (~0,6 s). Pour ANCRE : le **verdict du disjoncteur** (paiement refusé ou accepté) s'affiche à `Voted`, et le **tableau officiel** à `Finalized`.
4. Purger : à chaque `Finalized` de hauteur N, supprimer les entrées de hauteur N dont le `blockHash` diffère du hash finalisé.
5. Reconnecter : mémoriser le dernier bloc finalisé **avant** de resouscrire, puis faire un backfill `eth_getLogs` par tranches de 100 blocs sur `rpc.monad.xyz`.
6. Mesurer le temps en blocs, jamais en `timestamp`.
7. Lire les résultats avec `eth_call` au tag `"finalized"`.

Mesures du vault à reprendre : Proposed→Voted en 300 ms médian, →Finalized en 582 ms, →Verified en 1 491 ms. Le code `chain.ts` et `liveFeed.ts` est dans la note vault « Temps réel » (§ Code), à adapter au mainnet : `monad` de viem **a** des URL WSS (`wss://rpc.monad.xyz`, `wss://rpc1.monad.xyz`), mais garde `blockTime: 400`.
Côté tx : `eth_sendRawTransactionSync` (EIP-7966) est supporté (DOC). Le timeout doit être un **entier**, pas de l'hex (vault, MESURÉ testnet). Aucun exemple officiel d'écran live : NON TROUVÉ au-delà de la spec. Le dépôt `monad-developers/monode` concerne l'Execution Events SDK et exige un nœud.

---

## A3. Fournisseurs RPC

**RPC publics mainnet** (DOC network-information + reference/json-rpc/overview ; colonne getLogs MESURÉE le 27/09 sur le registre Reputation) :

| URL (HTTP et WSS) | Opérateur | Débit (DOC) | Batch | getLogs (DOC) | getLogs (MESURÉ) | Notes |
|---|---|---|---|---|---|---|
| `rpc.monad.xyz` | QuickNode | 25 rps | 100 | 100 blocs | 100 OK, 999 → `-32614` | défaut, WSS `monadLogs` OK |
| `rpc1.monad.xyz` | Alchemy | 15 rps | 100 | 1 000 blocs / 10 000 logs | **tout l'historique OK (9 288 logs, 15 Mo)** | `debug_`/`trace_` coupés |
| `rpc2.monad.xyz` | Goldsky Edge | 300/10 s | 10 | — | réponses vides (99 blocs compris), 100 000 → `-32012` | état historique pour `eth_call`. Non concluant |
| `rpc3.monad.xyz` | Ankr | 300/10 s | 10 | 1 000 | 999 OK, 1 000 → `-32062`, 5 000 → `-32062` | `debug_` coupé |
| `rpc-mainnet.monadinfra.com` | Monad Foundation | 20 rps | 1 | 100 | 100 OK, 999 → `-32602` | **état historique** (`eth_call`, `getStorageAt`…) |

Limite `eth_call` / `estimateGas` (DOC) : 200M gas (QuickNode, Alchemy, MF), 1B (Ankr). Pool « low-gas » ≤ 8,1M. Au-delà, le pool « high-gas » a une concurrence limitée. **Utile pour `assess` en simulation sur un gros graphe.**

**Privés** (DOC, https://docs.monad.xyz/tooling-and-infra/rpc-providers : 18 fournisseurs) :

| Fournisseur | Ce qui est connu (27/09) | Statut |
|---|---|---|
| **QuickNode** | offert aux participants : **Build Plan 3 mois**. Tarif public : 49 $/mois, 80M crédits, **50 rps**, 10 endpoints, archive, trace/debug, Streams (https://www.quicknode.com/pricing) | DOC (page Metropolis + tarifs) |
| **Dwellir** | offert : **Developer plan 3 mois** = 49 $/mois, 25M réponses, **100 réponses/s**, HTTP + WS, Trace et Debug APIs (https://www.dwellir.com/pricing) | DOC |
| **Spectrum** | offert : Business plan 2 mois ; limites NON TROUVÉ | DOC partielle |
| **Chainstack** | 143 et 10143 supportés ; limites Monad NON TROUVÉ. Plans Pro dans les prix des gagnants | NON TROUVÉ |
| **Envio HyperRPC** | lecture seule (getLogs, blocks, receipts, tx) ; **token obligatoire** (sans token : « Your token is malformed ») ; **payant : 4 $ par million d'appels, minimum 1 $/mois** (https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc). La doc Monad le dit « free » : c'est périmé | MESURÉ + DOC |
| **Envio HyperSync** | `https://monad.hypersync.xyz` (aussi `143.hypersync.xyz`) ; `/height` répond sans token (108 570 738) ; les requêtes exigent un token (401 sinon), limité par fenêtre de 60 s selon le plan ; les indexeurs hébergés sur Envio Cloud n'en ont pas besoin | MESURÉ + DOC |
| Tenderly Node RPC | `https://monad.gateway.tenderly.co` / `wss://…` (143) | DOC |

**Recommandation**
- **Indexeur (chantier 03)** : backfill avec HyperSync (token gratuit à créer, compte le bounty Envio) ou `rpc1` en tranches. Suivi live avec `wss://rpc.monad.xyz` `monadLogs`. Pour l'état historique, utiliser `rpc-mainnet.monadinfra.com`.
- **Démo live** : une WSS sur un endpoint **privé** (QuickNode Build ou Dwellir, offerts), avec `wss://rpc1.monad.xyz` en secours. Ne pas faire tourner la démo sur le quota public de 25 rps.

---

## A4. Testnet (10143)

- Faucet officiel : **https://faucet.monad.xyz** (DOC). Le hub https://testnet.monad.xyz est cité par le guide de déploiement. Dans un navigateur uniquement : le vault a rencontré un checkpoint Vercel. Montant et cooldown : NON TROUVÉ.
- API faucet non officielle : `POST https://agents.devnads.com/v1/faucet {"chainId":10143,"address":…}`, 1 MON annoncé (vault, gist portdeveloper, non testée avec succès). USDC testnet : https://faucet.circle.com.
- RPC : `testnet-rpc.monad.xyz` (QuickNode, 50 rps dont 25 rps pour `eth_call`), `rpc.ankr.com/monad_testnet`, `rpc-testnet.monadinfra.com` (20 rps, WSS `monadLogs` OK).
- Testnet **réinitialisé depuis la genèse le 2025-12-16** (DOC).
- ~~Rappel : les registres ERC-8004 sont absents du testnet~~ **FAUX** (vérifié par `cast` le 27/09) : ils existent à `0x8004A818…BD9e` / `0x8004B663…8713`. Il faut y déployer les nôtres. Le facilitator x402 molandak accepte `eip155:10143`.
- Selon les Rules (SECONDAIRE), une soumission testnet est acceptée. Elle ne sert pas notre thèse, qui s'appuie sur les données réelles du mainnet.

---

## A5. Outils et explorers

- **Tenderly** (DOC, https://docs.tenderly.co/supported-networks, JSON de la page) : `monad` (143) et `monad-testnet` (10143) ont tous deux `isVNetSupported`, `isDevToolsEnabled`, `isMonitoringEnabled`, `isNodeEnabled` = true.
  - Donc Virtual TestNets (fork du mainnet), simulateur/debugger, alertes et Node RPC sont disponibles sur Monad.
  - **Tenderly Pro offert** à tous les participants (« A free license to simulate, debug and monitor your build »).
  - Usage conseillé : un **Virtual TestNet forké du mainnet** pour répéter la ferme Sybil et le router contre les vrais registres 8004, sans dépenser de MON ni polluer le mainnet.
  - Limite NON VÉRIFIÉE : rien n'indique que Tenderly applique le modèle de gas Monad (gas limit facturée, MIP-8). Les chiffres de gas se mesurent donc avec `forge test --network monad` ou `anvil --fork-url https://rpc.monad.xyz`, pas avec Tenderly.
- **Anvil** : `anvil --fork-url https://rpc.monad.xyz` détecte Monad et le bon hardfork (DOC). C'est l'alternative gratuite et locale.
- **Explorers** : MonadVision, Monadscan, Tenderly Explorer (https://dashboard.tenderly.co/explorer), Phalcon, JiffyScan (4337), gmonads.com (visualisation du réseau).
- **Autres offres aux participants** (page Metropolis) : Zerion API 1 mois, Spectrum 2 mois, Dwellir 3 mois, QuickNode 3 mois.
- **Pour l'IA** : https://docs.monad.xyz/llms.txt ; chaque page a une version `.md` (ajouter `.md` à l'URL) ; voir aussi https://docs.monad.xyz/ai/current-facts.md.

---

## B1. Règles de soumission Metropolis

**Page publique** (DOC, https://monad.xyz/developers/hackathons/metropolis, FAQ lue le 27/09) :
- « What do I submit? **A working product with a public project profile: a demo, a short write-up, and a link to the code.** » Le mot « vidéo » n'apparaît pas sur la page publique : il vient des Rules (voir ci-dessous).
- « Can I submit an existing project? Yes, if the work you submit is new… **what you show on 13 Oct should have been built during the six weeks.** »
- « Does my project need to be open source? Open sourcing is encouraged but not required. **Judges need to be able to verify what you built during the six weeks.** » (contredit par les Rules, voir §0.)
- Une track, choisie à l'inscription. Jugement **par track** du 14 au 27/10, résultats le **3/11**.
- 30 000 $ par track, « evenly between 3 teams » (donc 10 000 $ par équipe). Grand champion 25 000 $, choisi toutes tracks confondues.
- « **plus sponsor bounties awarded on top** » ; « Sponsored prizes… awarded on top to the winners ». Le cumul d'une track et de bounties est donc **explicitement prévu** (DOC).
- Après : « Top teams… invited to a residency program ». « Your project profile stays live, and any team can carry it into **DeltaV**, where 800+ Monad startups already get credits, intros, and office hours. »
- Restrictions de pays : « listed in the official rules on the application platform ».
- Plateforme : https://hackathon.monad.xyz (connexion par GitHub, Google ou Discord ; contenu fermé sans compte). Activations : https://luma.com/monad-metropolis (Londres 2/10, Buenos Aires 3/10, Singapour 6/10).
- Prix en nature pour les gagnants : scan de sécurité (15 k$), RPC illimité 3 mois, Envio Cloud gratuit, etc.

**Rules v3.0 de la plateforme** (SECONDAIRE via le README concurrent cité au §0, **à confirmer par Hugo dans la modale « Rules & Guidelines »**) :
- Dotation garantie de **145 000 $** : 25 k$ pour l'Overall Winner et 4 × 30 k$ pour les tracks. Les « 250 k$+ » incluent les bounties sponsors, qui ont chacun leurs propres conditions.
- Équipe de **1 à 5** personnes, avec un contact principal qui reçoit les prix (en USDC, KYC possible, sous 30 jours).
- Un projet par participant et **une seule track**. Impossible de gagner plusieurs prix de track principale avec le même projet. Le cumul du Grand Champion avec un prix de track : NON TROUVÉ.
- **Open source OSI obligatoire, sur GitHub public** (§7.2).
- **Vidéo ≤ 3:00**, publique, qui montre le produit réel et les interactions Monad (§4.1, §9.4).
- **Outils IA à déclarer dans le README** (§4.1.4).
- L'historique de commits doit couvrir la fenêtre. Le code antérieur est admis comme base s'il est identifié dans le README.
- Il faut fournir les adresses de contrats ou les hashes de tx, et expliquer pourquoi Monad (§9.2).
- Revue **non confidentielle** (§5.3) : ne rien mettre dans le dépôt qu'on refuse de rendre public.
- Âge 18+, exclusions OFAC/UE/ONU.
- La soumission reste modifiable jusqu'à la date limite ; c'est la version à l'échéance qui est jugée.
- Grille à 5 × 20 % et grille bounties 40/30/20/10 (voir §0).

**Encore NON TROUVÉ** :
- l'éligibilité au bounty MetaMask (affiché en track 01) d'un projet soumis en track 04 ;
- le nombre maximal de bounties par projet ;
- les critères du jury propres à la track 04.

À demander sur la plateforme, où le concurrent a posté ses questions (« Awaiting organizer »).

---

## Pièges récapitulés

1. **Dépôt privé contre open source obligatoire** : à trancher vite (Rules §7.2, SECONDAIRE). Il faudra une licence et un nettoyage du dépôt (secrets, CR du conseil ?) avant de le rendre public.
2. `rpc1` sert aujourd'hui tout l'historique en un appel, mais on est à **9 288 logs sur un plafond annoncé de 10 000**. L'indexeur doit découper.
3. `eth_call` historique limité à ~40 000 blocs sauf sur `rpc-mainnet.monadinfra.com` / `rpc2`.
4. `forge script` gonfle la gas limit de 30 % par défaut, et on la paie : `--gas-estimate-multiplier 110`.
5. `metadata*` dans `foundry.toml` : clés inopérantes. Garder `bytecode_hash` par défaut pour une vérification Sourcify complète.
6. `viem/chains.monad` : `blockTime: 400` périmé (mesure : 302 ms). Le surcharger avec `defineChain`.
7. HyperRPC n'est plus gratuit (4 $/M). HyperSync exige un token.
8. Un bloc spéculatif abandonné n'est jamais annoncé : purger à `Finalized`.
9. Vidéo ≤ 3 min, et la déclaration IA dans le README.
10. Doc Monad incohérente sur les versions (v0.15.2, v0.16.1, et 0.16.2 mesuré) : croire `networks.json` et `web3_clientVersion`.

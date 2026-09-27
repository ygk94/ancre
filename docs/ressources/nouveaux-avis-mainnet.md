# Nouveaux avis ERC-8004 sur Monad mainnet (27/09/2026)

> Vérification on-chain du signalement « 95 nouveaux avis depuis le bloc 108 483 651, 20 clients ».
> Mesure faite le **2026-09-27**. Tête de chaîne lue : **bloc 108 576 697**, horodaté 2026-09-27 21:49:34 UTC.
> Source : `eth_getLogs` sur `https://rpc1.monad.xyz`, sans filtre de topic, sur les deux registres, du bloc 103 696 240 à 108 576 697. Contrôle par sondage sur `https://rpc.monad.xyz` (4 tranches de 100 blocs) : mêmes comptes. 8004scan n'a pas servi.
> Scripts et données brutes dans le scratchpad, sous `nv/` : `dec.py` (décodage), `impact.py` (solveur), `rep.json`, `id.json`, `dec.json`, `txs.json`, `fburi.json`, `pay.json`.

## 1. Verdict

- **Confirmé (MESURÉ).** 95 `NewFeedback` entre le bloc **108 483 651** (2026-09-27 14:00:58 UTC) et le bloc **108 552 157** (19:45:52 UTC), puis plus rien jusqu'à la tête. Ils viennent de **20 clients**. On compte aussi 0 `FeedbackRevoked` et 0 `ResponseAppended`. Entre le 10/09 et le 27/09, le registre n'a émis que l'avis du bloc 103 696 240 (2026-09-10 19:38:45, `0x7fd9f9e5 → #10223`), déjà connu.
- **Une seule source (MESURÉ) : execution.market.** Chaque `feedbackURI` pointe sur `execution.market/feedback/…` et chaque `endpoint` a la forme `task:<uuid>`. C'est la plateforme déjà présente dans le snapshot du 21/09, avec 84 avis signés à l'époque par `0x10304054`.
- **Ce n'est ni une ferme ni un concurrent qui teste (MESURÉ + interprétation).** C'est un **rattrapage automatique** (« backfill ») d'anciennes tâches payées, soumis par **un seul relayer** : `0x10304054`, le wallet de la plateforme.
- **Impact sur ANCRE (MESURÉ avec le solveur) : zéro.** Aucune arête nouvelle sous le schéma de référence. La chaîne honnête et l'acte 1 restent identiques au bit près. En revanche, ces avis mettent au jour une **faille de couverture dans D16** : l'identité passe par `agentWallet`, et le registre met ce champ à zéro à chaque transfert. Voir §5.

## 2. Ce que contiennent les 95 avis (MESURÉ, décodé depuis les logs)

| Champ | Valeur |
|---|---|
| Avis | 95, dans 95 tx distinctes. Aucun révoqué. |
| Fenêtre | blocs 108 483 651 → 108 552 157, soit 2026-09-27 14:00:58 → 19:45:52 UTC (5 h 45) |
| Clients | 20. Le seul qui existait déjà est `0x7fd9f9e5`. Répartition : `0x3aebb73a` 13, `0xaf95b213` 12, `0x3a3f992d` 10, `0xc059b9cd` / `0x7fd9f9e5` / `0x09c32b8f` / `0xa3279f74` 6 chacun, puis 5, 5, 5, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1 |
| Agents notés | 12 : #10182 (36), #10181 (18), #10261 (12), #10180 (6), #10184 (5), #10220 (5), #10169 (4), #10168 (3), #10221 (2), #10189 (2), #10190 (1), #10167 (1). Six étaient déjà notés au 21/09 (#10168, #10169, #10180, #10181, #10182, #10221), les six autres pas encore |
| Valeurs | **deux valeurs seulement**. `90` (47 avis, tous du côté demandeur : `requester_rating` ou `buyer_rating`) et `100` (48 avis, côté exécutant : `executor_rating` ou `seller_rating`) |
| Décimales | `valueDecimals = 0` partout |
| tag1 (11 nouveaux) | `executor_rating:data_collection` 26, `requester_rating:data_collection` 18, `requester_rating:research` 15, `executor_rating:research` 8, `executor_rating:knowledge_access` 8, `buyer_rating:knowledge_access` 6, `seller_rating:data_collection` 5, `buyer_rating:data_collection` 4, `requester_rating:knowledge_access` 3, `requester_rating:verification` 1, `executor_rating:verification` 1 |
| tag2 | toujours égal aux 10 premiers caractères de l'adresse du client (95 sur 95) |
| Sens | 43 `executor_rates_requester`, 37 `requester_rates_executor`, 10 `buyer_rates_seller`, 5 `seller_rates_buyer` |
| Réciprocité | 85 tâches distinctes, dont 10 notées des deux côtés. Au niveau des owners, on compte **50 couples (owner → agent) distincts, dont 20 couples orientés réciproques** (A note B et B note A) |
| Auto-notation | **0.** Aucun client n'est owner, `agentWallet`, approuvé ni opérateur de l'agent qu'il note |

Des 11 tag1 nouveaux, **un seul figure dans `schema_reference.json`** : `executor_rating:data_collection`, déclaré `endorsement`. Il n'entre pourtant dans aucun filtre (`reference`, `execution-market-8`). Execution.market utilise désormais **20 tag1** (9 au 21/09, 11 nouveaux), bien au-delà de `TAGS_MAX = 8` (voir AM-R4.4).

## 3. Qui a émis ces avis, et comment (MESURÉ)

- **Tous les clients sont des EOA délégués en EIP-7702.** Leur code on-chain vaut `0xef0100 ‖ 0x794c907fdfc71bfaf0b86d0e463bbd6e949a31ba` (délégué non vérifié sur Sourcify). Leur nonce est à 1 : la seule opération qu'ils aient signée eux-mêmes est l'autorisation 7702.
- **Les 95 tx ont le même `tx.from` : `0x103040545ac5031a11e8c03dd11324c7333a13c7`**, le relayer d'execution.market. C'est aussi l'owner et l'`agentWallet` de #8335 et #8337, et le noteur des 84 avis du 21/09. Chaque tx appelle le compte du client (`to = client`, sélecteur `0x802b2246`) avec un appel vers le ReputationRegistry, une échéance et une signature. Le `msg.sender` vu par le registre est donc bien le client.
  - 19 tx sont de type 4 : la première action de chaque nouveau client porte son autorisation 7702. Les 76 autres sont de type 2.
  - Les nonces du relayer se suivent de **487 à 583**, sans autre trou que 488 et 489. Ces deux nonces correspondent au mint de #10261 (bloc 108 484 042) et à son transfert (108 484 066), eux aussi envoyés par le relayer. Gas price fixe : 202 gwei. Dans la rafale de 19:11 à 19:17, un avis part toutes les ~13 s environ, chaque fois d'un client différent. **Il s'agit d'un lot scripté.**
  - Solde du relayer à la tête : 72,26 MON. Soldes des clients : 0 ou 0,01 MON.
- **Qui détient les clés des clients : NON VÉRIFIÉ.** Rien on-chain ne dit si la plateforme les garde (wallets embarqués) ou si chaque utilisateur signe lui-même. On sait seulement que **toute l'orchestration passe par une seule entité**.
- **Les agents notés sont tous des « workers » execution.market.** Leur `tokenURI` vaut `https://execution.market/workers/<owner>`. Les 18 agents du cluster ont pour **ancien owner et ancien wallet `0x10304054`** : la plateforme les mint puis les transfère au wallet de l'utilisateur. #10261 suit le même chemin sous nos yeux : mint à 14:02:56, transfert à `0xa3279f74` à 14:03:03, puis `MetadataSet(agentWallet, "")` émis par le registre au transfert. **À la tête, les 19 agents concernés ont `getAgentWallet = 0x0`.** Chaque client (sauf `0x04eaeddb`, qui ne possède rien) est owner d'un seul worker, lui-même noté par d'autres.

### Documents `feedbackURI` et paiements

- Les 95 documents sont servis par execution.market et contiennent `type = execution_market_feedback`. 94 portent un `target_agent_id` égal à l'agent on-chain. Le 95ᵉ porte la même valeur sous forme de chaîne, `"10261"`.
- **Le commentaire dit ce qu'est le lot.** On trouve deux textes seulement : « *Backfill firmado (cumplió los 6 criterios: escrow, liquidación, sin reembolso, pago sobre el piso,…)* » (48 avis, côté exécutant) et « *Entrega verificada y liquidada. Rating del publisher.* » (47 avis). **Ce sont des notes produites par une règle** (la tâche a été réglée : note fixe), pas des jugements de qualité.
- Primes des tâches : 0,01 à 0,08 $, 0,02 $ dans 77 cas sur 95. Les 72 titres distincts sont des tâches de collecte ou d'analyse, surtout en espagnol (« Compro: … »).
- **Paiements on-chain (MESURÉ en partie).** Les documents citent 85 `payment_tx`, tous annoncés `network: monad`.
  - **35 existent sur Monad**, entre les blocs 90 290 603 (2026-07-25) et 102 944 295 (2026-09-08). Tous sont envoyés par `0x10304054` au contrat `0x9620dbe2…`. L'USDC y part d'un clone d'escrow (`0x54b0e2ea…`) : environ 87 % au worker, environ 13 % à `0x9620dbe2`.
  - **50 sont introuvables sur Monad** (`eth_getTransactionReceipt` renvoie null). Plusieurs titres portent la mention `[BASE]` : ces tx sont probablement sur une autre chaîne, **non vérifié**.
  - Chaque paiement retrouvé précède sa note de 19 à 64 jours : ce sont bien des rattrapages.
  - Le noteur n'est jamais le payeur, qui est l'escrow.

## 4. Les autres enregistrements sur la période (MESURÉ, IdentityRegistry)

Du bloc 103 696 240 à la tête, on relève 11 `Registered` (#10251 à #10261), 4 `URIUpdated`, 15 `MetadataSet`, 12 `Transfer` (11 mints et le transfert de #10261), et des `MetadataUpdate` ERC-4906 (topic `0xf8e1a15a…`, 14). Le registre compte désormais **10 262 agents** (ids 0 à 10 261). Aucun de ces nouveaux agents n'a reçu d'avis, sauf #10261.

| # | Bloc / date (UTC) | Owner | Nom, d'après l'agentURI | Lien avec Metropolis |
|---|---|---|---|---|
| 10251 | 103 845 082 · 11/09 08:09 | `0x8a3c7524` | **Curb Market Agent** (ADEXTO, bonding curve, x402) | **adexto** figure dans la liste des concurrents (vault) |
| 10252 | 106 470 711 · 20/09 13:06 | `0xdb6c…7777777` | **Kanmani** : vérifie qu'un paiement cité par un document de preuve ERC-8004 a bien eu lieu. Refuse de « ranking agents by a score that is not published » | nouveau, track 04 probable |
| 10253 | 107 001 060 · 22/09 09:36 | `0x9e66867a` | **Agent Trust on Monad** (prooflines.org). La source pointe sur `github.com/ColinkaMir/monad-agent-trust` | **ColinkaMir** : il reprend notre mesure « 16 avis propres, 2 wallets » et achète Nansen via x402 |
| 10254-10255 | 107 094 754-756 · 22/09 17:28 | `0x49472ef9` | **Tab** demo Service / Agent (facturation post-payée, USDC/AUSD, Permit2) | nouveau |
| 10256 | 107 753 908 · 25/09 00:48 | `0xdb6c…7777777` | **Sentinel** (Kanmani) : « a pre-hire verdict on one agent, stamped with the block it was measured at », avec une borne de fraîcheur. Bond sur contrat `0x57aF4e4B…` | **concurrent direct de l'angle « lisible avant de payer »** |
| 10257 | 107 753 914 · 25/09 00:48 | `0xdb6c…7777777` | **Assay** (Kanmani) : prix du bond d'un agent à partir de son « claim-truth rate » | adjacent (pricing du risque) |
| 10258 | 107 765 816 · 25/09 01:48 | `0xbbfcf117` | URI vide | — |
| 10259 | 107 945 312 · 25/09 16:51 | `0xbbfcf117` | **Proof of Reason** (DJZS AI, LLC) : vérifie les prémisses d'un allocateur avant un mouvement de fonds, avec un gate on-chain | nouveau, track 04 probable |
| 10260 | 108 289 775 · 26/09 21:45 | `0xfa72da61` | **Letterlock memory agent** (notes chiffrées HPKE, clé dérivée d'une passkey) | nouveau |
| 10261 | 108 484 042 · 27/09 14:02 | `0x10304054` puis `0xa3279f74` | worker execution.market | lot du §3 |

Aucune agentURI ne mentionne warrant, headwater ou mandate. **Aucun concurrent du hackathon n'a noté qui que ce soit** sur la période.

## 5. Impact sur ANCRE (MESURÉ, `nv/impact.py` avec `solver/graph.py` et `ppr.py`)

Entrées : les 9 188 avis relus on-chain au bloc 108 434 518 (`onchain_feedbacks_r4.json`) et les 95 nouveaux. L'identité est celle du bloc 108 434 518, mise à jour pour #10261 : owner `0xa3279f74`, wallet 0, ancien owner `0x10304054`. α = 1/3. Ancres honnêtes {`0x07305360`, `0xf7d5543d`}.

| Scénario | Arêtes émises par un agent | Arêtes émises par un nœud-adresse | Arêtes issues des 95 nouveaux avis | dont émises par un agent | Masse sur le cluster EM |
|---|---|---|---|---|---|
| avant, filtre `reference` | 2 | 5 | 0 | 0 | 0 |
| **après, filtre `reference`** | 2 | 5 | **0** | 0 | **0** |
| avant / après, filtre `execution-market-8` | 0 | 1 | **0** | 0 | 0 |
| après, schéma étendu (8 des nouveaux tags en `endorsement`), ancres honnêtes | 0 | 49 | 49 | **0** | **0** |
| idem, ancres = 2 clients EM (`0x3aebb73a`, `0xaf95b213`) | 0 | 49 | 49 | 0 | 0,222 par ancre (1 saut, puis arrêt) |
| *variante non décidée* : owner = émetteur quand `agentWallet = 0`, ancres honnêtes | 48 | 1 | 49 | 48 | **0** |
| *variante*, ancres = 2 clients EM | 48 | 1 | 49 | 48 | 0,658 et 0,644 (11 agents positifs) |

- **Chaîne honnête : inchangée.** #18 garde t = 0,222 par ancre, et #2, #3, #4 restent absents sous D16. Avant comme après, e = 9 wei.
- **Acte 1 : inchangé.** Aucun des 95 avis ne touche #182 ni la région de la ferme. Le total d'avis passe de 9 188 à **9 283** (MESURÉ). Le bandeau « 83 % of all 9,188 ratings come from one farm » doit donc être daté (21/09) ou recalculé : 7 665 / 9 283 = **82,6 %**.
- **Pourquoi zéro, trois causes indépendantes :**
  1. **D15.** Les 10 tags hors schéma valent `measurement` par défaut, et le 11ᵉ n'appartient à aucun filtre.
  2. **D16.** Aucun des 20 clients n'est l'`agentWallet` d'un agent, puisque le registre efface ce champ au transfert. Tous deviennent donc des nœuds-adresses sans masse.
  3. **Topologie.** Le cluster (18 workers, 20 wallets) n'a **aucun lien** avec les ancres honnêtes. Même la variante « owner » lui apporte 0.

### Ce qu'il faut en retenir

1. **Il y a désormais sur mainnet un graphe où les noteurs sont eux-mêmes notés.** On passe de 36 couples le 21/09 à 36 + 50 couples owner → agent, denses et réciproques. **D16 ne le voit pas** : le registre ERC-8004 v2 met `agentWallet` à zéro à chaque `Transfer` (`IdentityRegistryUpgradeable._update`), et toute plateforme qui mint puis transfère produit donc des agents sans wallet. **Question pour le conseil, non tranchée** : faut-il un repli « owner, si `agentWallet = 0` et si l'owner possède un seul agent » ? Côté Sybil, le coût est le même, car l'owner est un contrôleur aussi gratuit que le wallet. Le texte de l'ERC y gagnerait en couverture.
2. **Ce graphe est un bon contre-exemple pour la démo, pas une chaîne positive.** Vingt wallets distincts, des paiements réels mais minuscules (0,01-0,08 $), 20 couples réciproques, deux valeurs constantes (90 et 100), tout soumis par un seul relayer. Des ancres qui ne touchent pas ce graphe lui donnent **0**. Des ancres placées dedans lui donnent de la masse. C'est exactement la relativité aux ancres que défend ANCRE. **Ne pas le présenter comme de la « confiance organique »** : on voit une plateforme qui se note elle-même, par procuration.
3. **Classer ces tags en `measurement` est justifié par leur contenu.** Une note fixe tirée d'une règle de règlement (« cumplió los 6 criterios ») atteste un paiement, pas un jugement. C'est le principe du schéma : « dans le doute, measurement ». Il faudra ajouter les 11 tags au schéma avec `kind: measurement`, et une ligne `origin`.
4. **Nouveau signal de provenance, facile pour l'indexeur.** Avec la 7702 et un relayer, `msg.sender` (le client) diffère de `tx.from` (la plateforme). L'indexeur voit `tx.from`, le contrat ne le voit pas. Qu'une seule adresse ait soumis les avis de 20 noteurs est un signal gratuit, dans la lignée de ColinkaMir (provenance) : à proposer comme filtre de politique, pas comme règle du certificat.
5. **Veille concurrence.** Kanmani/Sentinel (verdict avant embauche, daté par bloc, avec borne de fraîcheur) est **l'angle le plus proche d'ANCRE repéré à ce jour**, et il n'apparaît pas dans la liste du vault. ColinkaMir est désormais inscrit on-chain (#10253). Proof of Reason et Tab sont nouveaux eux aussi. À ajouter à `Metropolis — event, tracks et concurrence.md`.

## 6. Reproduire

```bash
export PATH="$PATH:$HOME/.foundry/bin"
SCR=/private/tmp/claude-501/-Users-hugo-Projet-ancre/d7aaa033-3225-48a1-9564-a90ffb1f1a63/scratchpad
# logs bruts (une requête par registre, 96 + 56 logs)
curl -s -X POST https://rpc1.monad.xyz -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getLogs","params":[{"address":"0x8004BAa17C55a88189AE136b182e5fdA19dE9b63","fromBlock":"0x62e4770","toBlock":"0x678bfb9"}]}'
$SCR/venv/bin/python $SCR/nv/dec.py                       # décodage -> nv/dec.json
cd solver && .venv/bin/python $SCR/nv/impact.py           # tableau du §5
cast tx <hash> from --rpc-url https://rpc.monad.xyz       # -> 0x10304054… pour les 95
cast code 0x3aebb73a33377f0d6fc2195f83559635adee8408 --rpc-url https://rpc.monad.xyz   # 0xef0100794c90…
```

Statut des chiffres : tout ce qui vient des logs, des tx, des soldes et du solveur est **MESURÉ** aux blocs indiqués. Le contenu des `feedbackURI` est **auto-déclaré** par execution.market. La garde des clés des clients et la chaîne des 50 paiements introuvables sont **non vérifiées**. Les liens avec la track 04 sont **estimés** d'après les descriptions.

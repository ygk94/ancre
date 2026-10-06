# Veille concurrence — 2026-10-05

> Track 04 (Trust, Identity & AI Infra), Monad Metropolis. Clôture le 13/10.
> Relevé fait le 05/10/2026 entre 19:30 et 20:30 UTC.
> Sources :
> - API publique GitHub (`/repos`, `/commits?since=2026-09-27`, `/search/repositories` filtré sur `pushed:>2026-09-20`) ;
> - README bruts (`raw.githubusercontent.com`) ;
> - `kanmani.xyz` (`/llms.txt`, `/hire`, `/agents.md`, `/method`) ;
> - events `Registered` de l'IdentityRegistry `0x8004A169…a432`, lus via `rpc1.monad.xyz` du bloc 108 835 675 au bloc 110 845 744.
>
> Statuts : **MESURÉ** (lu on-chain ou dans le code), **AUTO-DÉCLARÉ** (README ou site du projet), **NON VÉRIFIÉ**.
> Règle de rédaction : on décrit, on n'attaque personne. Aucune des affirmations ci-dessous ne doit apparaître telle quelle dans le pitch sans être reformulée en « complementary layers ».

## 1. Tableau

**Notre angle**, en 5 éléments :
- (a) des ancres choisies par le lecteur ;
- (b) un certificat vérifié on-chain ;
- (c) une lecture par un contrat avant de payer ;
- (d) un veto ;
- (e) une garde x402.

| Projet | Dernier push | Ce qui a changé depuis le 27/09 | Touche notre angle ? | Bounties visés |
|---|---|---|---|---|
| **ColinkaMir/monad-agent-trust** (ProofLines) | 04/10 12:46 | 10 commits. Achat Nansen « counterparties » cross-chain à 0,05 $ ; verdict unique servi en HTTP et en MCP ; 2 vidéos de soumission enregistrées et narrées (01/10) ; nouveau verdict `ring` pour la vague du 27/09 (95 avis, 20 wallets, aucun transfert). Enregistré comme agent **#10253**. AUTO-DÉCLARÉ | Partiel. Verdict en mots, hors chaîne, servi par une API : (c) non. Ni ancres ni graphe. Reconnaît que ses filtres de paiement « ne voient pas » la vague du 27/09, qu'il ne traite que par heuristique (`ring`, plancher de 5 noteurs) | **Envio** (HyperIndex + HyperSync), Nansen, Dynamic |
| **AInima-Collective/trustgraphs** | 15/09 | Rien | Antériorité sur le PageRank ancré (ZK, EAS, Sepolia). Pas de Monad, pas d'ERC-8004 | — |
| **Sireadell/headwater-indexer** (et `headwater`) | 23/09 | Rien (0 commit depuis le 27/09) | Non : provenance des fonds (AUSD, MON), détection `CrossAgentOverlap`, `CircularFunding`, `FunderFanOut` | **Envio** |
| **aliveevie/mandate** | 01/10 | 1 commit : la simulation CRE découvre les agents depuis l'API de référence. **PR #12 ouverte le 04/10 par trudransh (Assay)** : `@ibxlab/mandate/assay` fait que l'agent ne paie que les hôtes que **ses** vérificateurs de confiance notent `pass`, en un appel de vue, *fail closed*. MESURÉ (PR non fusionnée au 05/10) | **Oui, sur (c)**, et sur (a) à un saut, via Assay | **Mera** (PRF, passkey), Chainlink CRE, Privy |
| **Beltran12138/warrant** | 05/10 15:56 | 28 commits. `WarrantReputation` écrit des avis ERC-8004 ; lecture via `getSummary(agentId, [WarrantReputation], …)`, soit une liste de noteurs à **un seul** élément ; contrôle ERC-8226 (RAMS) en preflight (28/09) ; **déployé sur Arc mainnet** (05/10). AUTO-DÉCLARÉ | Non. Il **produit** des avis (« reveals, does not enforce ») ; il ne bloque aucun paiement | **MetaMask** (plugin `mm`) |
| **Kanmani** (owner `0xDB6c…7777`) | pas de dépôt public (recherche GitHub « kanmani » : rien) | **De 3 à 12 agents** : #10263 à #10272 enregistrés au bloc 109 072 991 (Locator, Notary, Registrar, Ledger, Twin, Pulse, Doctor, Linter, Bondsman, Scribe), en plus de #10252, #10256 et #10257. MESURÉ on-chain. Constat passé de « 73/85 » à **« 123 of 187 payment claims »** faux, mesuré le 05/10 à 20:19 UTC sur leur index au bloc 110 840 000 (AUTO-DÉCLARÉ). Paiement x402 **`upto`**. Caution « Sclera » (Bondsman). Indexeur Envio (requête GraphQL sur `:8081` dans `/method`). Scribe utilise **Qwen 3.8 Max**. Twin = signal Sybil par document partagé | Partiel. Verdict daté par bloc avec `maxAgeBlocks`, mais **servi hors chaîne et payant** : (c) non, sauf la caution. Pas d'ancres. Refuse explicitement les scores (« We will not return a score ») | Probablement **Envio** (indexeur visible) et Alibaba/Qwen. Mera et MetaMask non repérés |
| **trudransh/Assay** *(nouveau, distinct de Kanmani-Assay #10257)* | 05/10 12:22 (créé le 29/09) | Reçus signés de réponses d'IA, ancrés sur Monad (`ReceiptAnchor`, P256). Agents **#10278** (host) et **#10279** (verifier), enregistrés au bloc 110 682 707. MESURÉ. 442 tests. Interop avec MonadGuard. PR vers mandate | **Oui, le plus proche** : `VerifierRegistry.gradeOf(model, host, trusted[])` — *« You decide whose grades count »*. C'est un ensemble de confiance choisi par le lecteur, **lu par un contrat**, branché sur un paiement (PR mandate #12). Mais à **un saut** (filtre sur les vérificateurs), sans propagation, sans borne Sybil, sur un autre objet (qualité d'hôte d'inférence) | **Envio**, **Mera** (PRF), Chainlink CRE |
| **zakyirsyaad/monagent** *(nouveau)* | 05/10 13:20 (créé le 04/10) | Plugin `mm` pour le commerce A2A ; `mm monad reputation check` renvoie HIGH, MEDIUM, LOW ou UNRATED | Sur (c) côté CLI. Code lu : `getClients(agentId)` → `getSummary(agentId, tousLesClients)` → moyenne ≥ 80 ⇒ HIGH. C'est **exactement la moyenne naïve**, cf. §2.3 | **MetaMask** |
| **DavidMatheusSouza/Chancela** *(nouveau)* | 04/10 | Moteur de politiques déterministe, prouvé on-chain, appliqué par la venue ; `mm-plugin-chancela` sur npm ; agent **#10277** sur le mainnet (MESURÉ) | Garde avant action (politique, pas réputation) | **MetaMask** |
| **AmitChowdary122/attest8004** *(nouveau)* | 05/10 | Couche Validation ERC-8004 ; `AttestGate` refuse une action sans verdict de validateurs (`mandate-v1` déterministe, `risk-v1` LLM) ; mandats approuvés par passkey P256 ; boîte de réception Mera ; indexeur Envio (05/10). AUTO-DÉCLARÉ | Sur (c) : un contrat refuse avant d'agir, mais sur un verdict de validation et non sur la réputation | **Envio**, **Mera** |
| **Silk-Nodes/trustset** *(nouveau)* | 05/10 | 8 primitives immuables (kill switch, garants, battement de cœur, P256) ; **`isTrusted(id)`** en un appel de vue ; testnet | Sur (c), **et collision de nom** avec notre `isTrusted` (D41). Pas de réputation | Mera mentionné (6 occurrences dans le README) |
| **norbert351/merit** *(nouveau)* | 02/10 | « Sybil-resistant, settled-money-weighted agent reputation », track 04 ; 13 tests ; démo « 50 sock puppets → score 0 » | **Oui sur le message** (« sybil-resistant », démo de ferme), non sur la méthode : pondération par l'argent réglé et par les clients vérifiés distincts. C'est précisément ce que la ferme d'Eve contourne (CLAUDE.md §6). Ni ancres ni contrat lecteur. Stade précoce (README de 2,6 ko) | x402 |
| poteshniy/monadguard | 05/10 | Agent #10274 (MESURÉ). Verdicts signés sur les outils MCP, interop avec Assay | Non (sécurité des outils) | — |
| Autres nouveaux en track 04 | 02-05/10 | grmkris/agent-jobs (*« Reputation is not Sybil-resistant »*, AUTO-DÉCLARÉ), ubongn/sentinel (garde-fous EIP-7702), Cubiczan/aegis (disjoncteur hors chaîne), zuemen/agent-passport, santittan07/TrustAI-Oracle, 0xcuy/adexto (#10276), twzrd-sol/monid-x402 (garde de dépense avant signature x402) | Non, ou seulement sur la garde x402 générique | MetaMask et x402 pour certains |

**Registre ERC-8004 du mainnet** : 18 agents enregistrés depuis le bloc 108 835 675 (#10262 à #10279). MESURÉ.
- 10 sont à Kanmani.
- Les autres : 1 execution.market, 1 Dreamloom, MonadGuard, 2 ADEXTO, Chancela, 2 Assay.
- Aucun ne se présente comme un agrégateur de réputation à ancres.

## 2. Menaces

1. **trudransh/Assay est le seul projet qui fait désormais une partie de « relatif au lecteur + lu par un contrat + avant de payer »** (`gradeOf(…, trusted[])` + PR mandate #12).
   - Il le fait à un saut, sans propagation ni borne Sybil, et sur des hôtes d'inférence.
   - Mais un juré pressé peut lire « you decide whose grades count » comme notre promesse.
   - Il est très soigné (442 tests, mainnet) et il **chasse les mêmes bounties Envio et Mera** que nous, avec des alliances visibles (mandate, MonadGuard).
2. **Kanmani passe à 12 agents** et occupe le vocabulaire « before money moves » : fraîcheur par bloc, x402 `upto`, caution, signal Sybil Twin, « a star rating averages away the one fact a buyer needs ».
   - Leur narration « trust becomes a price » est forte.
   - Probable concurrent **Envio** (indexeur visible dans `/method`).
   - Toujours pas d'ancres, et le verdict n'est pas lisible par un contrat (MESURÉ le 28/09, non recontrôlé le 05/10).
3. **La « moyenne naïve » est désormais livrée par un concurrent du bounty MetaMask.** `monagent` agrège tous les clients de `getClients`. Nous avons rejoué la même formule à la main, sans lancer leur plugin, et sur #182 (Eve) :
   - `getClients` renvoie **7 665** clients et `getSummary` renvoie un `summaryValue` de **1,526e36** (MESURÉ le 05/10).
   - La moyenne dépasse donc le seuil de 80, quelle que soit la sémantique (somme ou moyenne). Leur code produirait HIGH (déduit).
   - Pour nous, c'est une **preuve que le problème est réel**, pas une cible à pointer.
4. **Saturation des « gardes avant action »** : trustset (`isTrusted`), attest8004 (`AttestGate`), Chancela, ubongn/sentinel, monid-x402. L'argument « un contrat lit la décision avant de payer » **n'est plus distinctif à lui seul**.
5. **Le mot « Sybil-resistant » est pris** par Merit (« 50 sock puppets → score 0 »), en track 04. Leur démo ressemble à notre scène D-6.2.
6. **ColinkaMir est prêt à soumettre** : vidéos faites, et il est agent #10253. Il reste complémentaire, mais il a déjà affiné le constat « 16 avis sur 9 288 », un chiffre que le jury aura vu avant nous.

## 3. Ce qu'il faut changer dans le positionnement

1. **Ne plus vendre seuls (c) ni « Sybil-resistant ».** Le différenciateur tient en une chose : **la confiance se propage au-delà d'un saut depuis les ancres du lecteur, avec une borne formelle, et le contrat vérifie le certificat**.
   - Formulation proposée (en anglais) : *« A trusted list tells you whose ratings count. ANCRE tells you whose ratings count **because someone you trust vouched for them**, and proves it to your contract. »*
   - Elle couvre Assay, Warrant (`getSummary` à 1 client) et toute liste de confiance à un saut, **sans les nommer**.
2. **Scène de démo : rendre le 2ᵉ saut visible.** Il faut un agent honnête qu'aucune ancre n'a noté directement, mais qui reçoit de la masse via un agent noté par une ancre. Une liste `trusted[]` à un saut le dirait inconnu. C'est le seul plan qu'aucun concurrent ne peut reproduire.
3. **Nouvelle diapositive « complementary layers »**, sans attaque : reçus (Kanmani), provenance (ColinkaMir, Headwater), validation (Attest8004), politique et kill switch (trustset, Chancela), qualité d'inférence (Assay), **garants transitifs relatifs au lecteur (ANCRE)**. Le contraste « moyenne naïve » se montre sur nos propres chiffres, jamais sur l'outil d'un concurrent.
4. **Renommer `isTrusted` dans l'interface publique** (ou le préfixer, par exemple `isAnchoredTrusted` / `trustOf`), à cause de la collision avec trustset. À trancher avant le gel de l'ERC (chantier 08).
5. **Bounty MetaMask** : 3 plugins `mm` concurrents de plus (monagent, Chancela, Warrant). Notre plugin doit montrer **un refus** que les autres ne savent pas produire : un agent HIGH à la moyenne et 0 chez ANCRE, sur notre ferme de démo et non sur leurs outils.
6. **Bounties Envio et Mera** : la concurrence est maintenant dense. Sur Envio : ColinkaMir, Headwater, Assay, Attest8004 et probablement Kanmani. Sur Mera : mandate, Assay, Attest8004.
   - Pour Envio, insister sur ce que notre indexeur calcule et que les autres ne calculent pas : l'audit des certificats et les preuves d'écart.
   - Pour Mera, la récupération d'ancre (D-6.2), et non la possession de l'agent.
7. **Mettre à jour ANCRE.md §9** : ajouter trudransh/Assay, Merit et les gardes avant action ; remplacer « Kanmani / Sentinel / Assay » par « Kanmani (12 agents) ».
   - Si on cite leur constat, utiliser **123/187, mesuré le 05/10 et AUTO-DÉCLARÉ**, et non plus 73/85.
   - Attention à l'homonymie : « Assay » désigne deux projets différents (Kanmani #10257 et trudransh #10278/#10279).

## 4. Non vérifié, à relancer avant le 13/10

- Inscription effective à Metropolis de Kanmani, Assay et Merit (aucun formulaire public consulté).
- Le verdict Sentinel est-il devenu lisible on-chain ? Non recontrôlé le 05/10.
- Merge de mandate#12.
- Dépôts privés : la recherche GitHub ne les voit pas.
- Recherche faite sur 6 requêtes (53 + 19 + 6 + 16 + 1 + 1 résultats). Un projet qui ne cite ni Monad ni Metropolis ni ERC-8004 dans sa description échappe à ce relevé.

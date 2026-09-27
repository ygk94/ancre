# Écran de démo, vidéo et soumission Metropolis

> Vague 2 (éléments clés), **2026-09-27**. Sert aux chantiers `07-ecran-demo.md` et `09-pitch-soumission.md`.
> Statuts : **DOC** (source officielle ou fait mesuré dans le dépôt, avec référence) · **PROPOSÉ** (choix de conception de ce document, à valider) · **NON CONFIRMÉ** (source secondaire, ou règle non relue par Hugo) · **NON TROUVÉ**.
> Rien n'a été publié, commité ni envoyé. Aucune transaction.
> Bases : CLAUDE.md, journal D1-D38 et Tour 5 de `docs/conseil/CR-conseil.md`, `docs/ressources/monad-dev-et-soumission.md` (vague 1), `solver/out/mainnet.md` (R4), `contracts/GAS.md` (R5), `docs/conseil/tour5A-fond.md` (D30), `docs/conseil/bounties-sponsors.md` (D38), les fiches `envio.md`, `metamask-agent-wallet.md`, `mera.md`, `x402.md`, et la note du vault `Docs-officielles/Temps réel — WebSocket & lecture live sur Monad.md` (code testé sur le testnet le 15/09).

---

## 0. À lire en premier

| # | Fait | Statut | Conséquence |
|---|---|---|---|
| 1 | La source des règles est retrouvée : README de `precious-akpan/monad-metropolis-merchant-rails`, section « Binding facts ». L'auteur y dit avoir lu la modale **« Metropolis Hackathon Rules & Guidelines » v3.0, mise à jour le 3 Sep 2026**, le **22/09**. Dernier commit du dépôt : **2026-09-23 07:52 UTC**. Nous avons relu ce README le **27/09** (raw.githubusercontent, branche par défaut). Texte recopié au §1. | NON CONFIRMÉ (source secondaire) | Hugo doit relire la modale et la recopier (§6). |
| 2 | **Les fichiers Solidity du dépôt portent `SPDX-License-Identifier: CC0-1.0`** (10 fichiers, `contracts/src`, `test`, `script`). **CC0 n'est pas une licence approuvée par l'OSI** (l'OSI n'a jamais approuvé CC0 ; la demande a été retirée en 2012). | DOC (grep du dépôt, 27/09) ; statut OSI de CC0 : NON CONFIRMÉ ici, connu de longue date | Si §7.2 est confirmé, **le code doit passer en MIT ou Apache-2.0**. Seul le texte de l'ERC reste en CC0 (exigé par EIP-1). |
| 3 | Selon le même README : le **formulaire de soumission ouvre le 2 oct.**, **l'inscription est ouverte jusqu'au 6 oct.**, et le champ « one-line description » a une limite de longueur non documentée (erreur `400` silencieuse). | NON CONFIRMÉ (tableau de bord vu par le concurrent le 22/09) | L'équipe et le projet doivent être créés **avant le 06/10**. Garder la tagline courte. |
| 4 | Les Rules exigeraient que le code soit public « **throughout and after** the Hackathon », et que l'historique de commits couvre la période. | NON CONFIRMÉ | Conflit direct avec la décision « dépôt privé » (CLAUDE.md §5). Rendre le dépôt public publie aussi **tout l'historique** (CR du conseil, CLAUDE.md, veille concurrentielle). Réécrire l'historique pour nettoyer contredirait l'exigence sur l'historique. **Décision de Hugo** (§5.2). |
| 5 | Publier le dépôt, c'est publier le contournement du garde-fou sur #8317 et le constat « une seule clé contrôle les deux registres ». | DOC (R4, tour 3) | La divulgation privée aux auteurs d'ERC-8004 (D29, cible 05/10) doit **précéder** la mise en public. |
| 6 | La fiche MetaMask affiche la track « Onchain Finance & Trading ». Le concurrent classe ce bounty comme « out of scope (wrong track…) » pour sa track 02. | DOC (fiche copiée par Hugo) + NON CONFIRMÉ (lecture du concurrent) | L'éligibilité d'un projet de la track 04 est **douteuse**. À demander sur le forum de support avant d'investir (§6). |

---

## 1. Les règles, recopiées de la source secondaire

Source : https://github.com/precious-akpan/monad-metropolis-merchant-rails, `README.md`, section « Binding facts — from the official "Metropolis Hackathon Rules & Guidelines" modal, v3.0, last updated 3 Sep 2026 ». Lue par son auteur le 22/09/2026, relue par nous le 27/09/2026. Dernier commit : 2026-09-23T07:52:15Z. Le dépôt est public, sous licence MIT. **Statut global : NON CONFIRMÉ.** C'est la transcription d'un tiers, pas la modale elle-même.

Extraits verbatim (anglais d'origine, mise en forme conservée) :

> Read in full from the onboarding page on 2026-09-22. **This modal is the actual Terms & Conditions and overrides the public marketing page and the platform's Prizes page wherever they conflict.**

| | |
|---|---|
| **Total prize pool** | **$145,000** (Rules §3.2) — $25,000 Overall Winner + $120,000 across 4 tracks ($30,000 each, $10,000 to each of the top 3). The "$250,000+" headline on the marketing/Prizes pages includes *sponsor-funded bounties, which "may be added and announced during the Hackathon period, each with their own terms."* Treat sponsor bounties as unconfirmed upside, not part of the $145k. |
| **Submission deadline** | **October 13, 2026, 11:59 PM ET**, stated explicitly (Rules §4.2). Matches the platform countdown (Oct 14, 03:59 UTC). Rolling submission from Sept 1; late submissions not accepted; a submission may be edited until the deadline, and the version at the deadline is what's judged. |
| **Team size** | **1–5 members** (Rules §2.4), not "no stated limit." One primary contact designated; prize money goes to them and they're responsible for distributing it. |
| **One submission, one track** | One project per participant; each submission competes in exactly one track; can't win multiple main-track prizes for the same project (Rules §2.5, §3.3). |
| **Open source is MANDATORY** | Rules §7.2: *"All submissions must be open source under an OSI-approved license... Code must be publicly accessible on GitHub throughout and after the Hackathon."* This **contradicts** the marketing page's "encouraged but not required" — the Rules control. `LICENSE` (MIT) added to this repo. |
| **Demo video** | **Hard cap: no more than 3 minutes** (Rules §4.1, §9.4), not a default assumption. Publicly accessible (YouTube/Loom/Vimeo), must show the product actually operating and show Monad blockchain interactions — not mockups or slides. |
| **AI coding tools** | Permitted, but **"must be disclosed in the README"** (Rules §4.1.4). We're using one heavily — add a disclosure section before submitting (see checklist). |
| **Commit history** | Must cover the build window; "the substantial majority of the work" must be created during the Hackathon period. Pre-existing code may be a foundation only if identified in the README, with substantial new functionality added during the window. |
| **Monad integration requirements** | Contract addresses or tx hashes; mainnet **or** testnet (either is fine); document why Monad's capabilities are used (Rules §9.2). |
| **Eligibility** | 18+; standard OFAC/EU/UN sanctioned-jurisdiction exclusions; Monad Foundation/Sponsor/judge employees and immediate family can participate but can't win. |
| **Prize payment** | USDC or equivalent, within 30 days of winner announcement or KYC completion, whichever is later, to the primary contact's wallet. KYC may be required. Winners are solely responsible for taxes. |
| **Non-confidential review** | Rules §5.3: judges/mentors include investors and operators who may independently build similar products; submissions are reviewed non-confidentially. **Don't put anything in the repo we're not willing to make fully public — no trade secrets, keys, or credentials.** |

> ### Judging criteria — now published verbatim (Rules §5.2)
> **All tracks, evenly weighted 20% each:**
> 1. Product Quality & Completeness
> 2. Technical Excellence
> 3. Monad Integration
> 4. Track Fit & Problem Relevance
> 5. Innovation & Impact
>
> **Sponsor bounties (if we pursue any), weighted differently:**
> 1. Adherence to the published bounty requirements — 40%
> 2. Technical Implementation — 30%
> 3. Monad Integration — 20%
> 4. Innovation — 10%

Extrait de leur calendrier (même README, NON CONFIRMÉ) : « Dashboard confirms: registration open through 6 Oct; **submission form itself opens Oct 2**, closes **14 Oct, 04:59 GMT+1** (= Oct 13, 11:59 PM ET — same deadline, different timezone display, no conflict). » Et : « the platform's "one-line description" field has an undocumented length limit — a full-sentence pitch got a silent `400` on save ».

**Ce qui contredit la page publique** (DOC, https://monad.xyz/developers/hackathons/metropolis, lue le 27/09) : « Open sourcing is encouraged but not required. » D'après le concurrent, la modale prime. Le CR du tour 5 (« le règlement n'impose ni l'open source ni le mainnet », AM-5.7) ne s'appuie que sur la page publique : **il est à corriger si Hugo confirme la modale.**

**Toujours NON TROUVÉ** : la définition officielle de la track 04 (le concurrent ne cite que celle de la track 02, §3.3) ; le nombre maximal de bounties par projet ; le cumul du Grand Champion avec un prix de track ; la question de savoir si une vidéo YouTube « non répertoriée » compte comme « publicly accessible ».

---

## 2. Les 5 critères : ce qu'ANCRE montre, et la preuve

Grille : NON CONFIRMÉ (§1). Contenu des colonnes « montre » et « preuve » : PROPOSÉ. Les chiffres sont DOC (mesurés dans le dépôt, fichier cité).

| Critère (20 % chacun) | Ce qu'ANCRE montre | Preuve livrée | Risque à éviter |
|---|---|---|---|
| **Product Quality & Completeness** | Une chaîne complète qui tourne : indexeur → solveur → certificat on-chain → le router **refuse de payer** → écran live. Plus un mode rejeu hors ligne et l'acte 1 rejouable par un tiers. | `demo/RUNBOOK.md` ; script « acte 1 reproductible » en 5 min (`cast` + `solver/run_mainnet.py`) ; hashes des tx de l'acte 2 ; URL de l'écran (si Hugo accepte de l'héberger) | Un maillon « mocké » en vidéo. La vidéo doit montrer le produit, « not mockups or slides » (§1). |
| **Technical Excellence** | Solveur : 95 tests. Contrat : 49 tests, dont 6 en fork mainnet. Gas **mesuré** avec `network = "monad"`. Lemmes L1-L5 (D37), fuzz contre des fractions exactes, test différentiel. Honnêteté sur le niveau de certificat (D32). | `contracts/GAS.md`, `solver/RESULTS.md`, commandes `forge test` / `pytest` dans le README ; contrat vérifié sur MonadVision **et** Monadscan | Pitcher la garantie sans son niveau (D32). Dire « premier point fixe vérifié on-chain » (CLAUDE.md §6, OpenRank l'a fait). |
| **Monad Integration** | Contrats sur le **mainnet 143**, à côté des vrais registres ERC-8004. Veto lu en direct, donc un paiement refusé **au bloc suivant**. États `Proposed` / `Voted` / `Finalized` affichés à l'écran via `monadLogs`. Recertification à **chaque changement du graphe** (pas à chaque bloc). | Adresses et tx dans le README et le profil ; paragraphe « Why Monad » (§4.3) ; badges d'état à l'écran ; mesures de latence en blocs | Chiffres de temps de bloc périmés : c'est **0,302 s** (MESURÉ, vague 1), pas 0,4 s (valeur de `viem/chains`). |
| **Track Fit & Problem Relevance** | Track 04 « Trust, Identity & AI Infra » : la couche de filtrage Sybil que la norme ERC-8004 **délègue au lecteur**. Elle est lisible par un contrat avant de payer (x402). Elle répond au post #309 d'ethereum-magicians. | Citation de l'EIP (« filtrage délégué au lecteur ») ; revert de `getSummary(agentId, [], "", "")` montré en vidéo ; lien vers le draft d'ERC | Dériver vers un « passeport d'agent » (les ~18 clones). |
| **Innovation & Impact** | La **combinaison** : ancres choisies par le lecteur, borne inférieure PPR utilisée comme certificat on-chain (D30 : borne classique, usage neuf), veto, lecture par un contrat avant paiement. Et une mesure sur le mainnet réel : la moyenne ment (83 % des avis viennent d'une ferme). | Draft d'ERC (chain-agnostic, 8004 est déployé sur plus de 40 chaînes) ; antériorités citées (OpenRank, trustgraphs) ; ColinkaMir cité comme exemple d'`edgeFilterId` | Annoncer un classement positif des agents honnêtes sur le graphe réel (support de 3 nœuds). |

**Bounties (grille 40/30/20/10, NON CONFIRMÉE)** : 40 % sur le **respect des exigences de chaque fiche**. Les fiches sont donc des cahiers des charges à cocher ligne à ligne (§5.3). La démo de chaque bounty peut devoir dépasser les 3 minutes de la vidéo principale (MetaMask : « live ou vidéo ≤ 5 min »). Une vidéo séparée par bounty est-elle admise ? NON TROUVÉ, à demander.

---

## 3. Storyboard de la vidéo (≤ 3:00, cible 2:55)

PROPOSÉ. Voix en anglais, ~2,5 mots/s, donc chaque phrase tient dans la durée de son plan. L'écran est celui du §4, enregistré en live. Le mode rejeu ne sert qu'en secours, et il est alors **annoncé à l'écran** (« replay of block N…M, recorded 2026-10-xx ») : ne rien présenter comme live qui ne l'est pas (chantier 07 §3).

Règles de tournage :
- chaque chiffre affiché porte sa date et sa source en petit (ex. « snapshot 21/09, bloc 108 434 518 ») ;
- le scanner apparaît sous une adresse tronquée, `0xa06f…43a4`, sans nom de projet (D29) ;
- le niveau de certificat est **nommé** à l'écran (Registry-verified ou Submitter-attested, D32).

| # | Temps | À l'écran | Phrase dite (EN) |
|---|---|---|---|
| 1 | 0:00-0:10 | Terminal : `cast call` sur le Reputation Registry mainnet → `getSummary(182, [tous les clients], "", "")` → **1.5264e36**. Puis `getSummary(182, [], "", "")` → revert. | "Should a contract pay this agent? Monad mainnet says its average rating is 1.5 times ten to the thirty-six. And the standard won't average without a list of raters you trust." |
| 2 | 0:10-0:30 | Écran, acte 1, onglet Eve. À gauche : **1,5264·10³⁶**, 7 665 avis, dont 117 à 1e38. À droite : ancres {0x0730…, 0xf7d5…}, masse sur la région de la ferme (**7 666 agents**) = **0**, e = 9 wei. Bandeau : « 83 % of all 9,188 ratings come from one farm ». | "Eve-8004: seven thousand ratings, eighty-three percent of the whole registry, from agents created at three hundred an hour. ANCRE, anchored on two independent raters: its trust mass is zero. Not low. Zero." |
| 3 | 0:30-0:50 | Onglet scanner. Interrupteur « measurements as trust » activé : **34,6 %** de la masse passe vers la ferme (flèches animées). Interrupteur désactivé (schéma D15) : **0**. Légende : « automated risk-screening service; score 85 = "risk low, unverified" ». | "This address is an automated risk-screening service. Its scores mean 'low risk, unverified'. Read them as trust and thirty-five percent of its mass leaks into the farm. ANCRE's schema separates measurements from endorsements: the leak is zero." |
| 4 | 0:50-1:02 | Onglet #8317 : 78 avis, un seul noteur = son propre `agentWallet`. « accepted by the registry: 78 » → « edges in ANCRE: 0 ». | "Agent 8317 rated itself seventy-eight times, from its own agent wallet. The registry's guard doesn't check that wallet. ANCRE drops all seventy-eight." |
| 5 | 1:02-1:10 | Bandeau d'honnêteté : « Registry dormant since 10 Sep · honest graph: 3 nodes ». Transition vers l'acte 2. | "Honest reputation on mainnet is almost empty, so act two is our own traffic, on mainnet." |
| 6 | 1:10-1:28 | Acte 2, scène 2. Trois ancres, des fournisseurs, une ferme scriptée. La moyenne naïve de la cible monte en direct. Colonne ANCRE : 0. Fil du router : paiement x402 → **REFUSED (below threshold)**, avec hash de tx et badge d'état. | "Three anchors, honest providers, a scripted Sybil farm. Our router is a contract that asks ANCRE before every x402 payment. The farm pumps its target's average; ANCRE gives it nothing; the payment is refused on-chain." |
| 7 | 1:28-1:43 | Scène 3 : une ancre compromise approuve la ferme. Sa colonne s'allume ; `trustRobust` (leave-one-out, m = 2) reste à 0. REFUSED. | "Now one anchor is compromised and endorses the farm. Trust is computed leaving any one anchor out, so no single key can make us pay. Still refused." |
| 8 | 1:43-2:10 | Scène 4, le disjoncteur. Une ancre poste `slash` sur un fournisseur jusque-là payé. Chronologie en blocs : slash au bloc **N**, badge Proposed (~100 ms), Voted (~300 ms), Finalized (~600 ms). Paiement suivant au bloc **N+1** : **REFUSED — VETOED**. Scène 5 en 5 s : un `+1` posté par un autre noteur ne lève pas le veto. | "A provider goes bad; an anchor slashes it. Watch the blocks: slash in block N, voted three hundred milliseconds later. The very next payment, block N plus one: refused, vetoed. No recertification: the veto is read live from the registry. A plus-one from someone else doesn't erase it." |
| 9 | 2:10-2:30 | Page du draft d'ERC, puis panneau « certificate » : niveau, `certBlock`, coût d'une mise à jour, gas d'un `assess`. Adresses des contrats (MonadVision). | "ANCRE is the reference implementation of a draft ERC for anchored ERC-8004 reputation, chain-agnostic. The certificate is [Registry-verified / Submitter-attested]: a classic PageRank lower bound, checked on-chain. Updating it costs [0.08] MON; on Monad, recertifying on every graph change is routine." |
| 10 | 2:30-2:48 | Trois vignettes de 6 s : (a) `schema.graphql` d'Envio et la requête GraphQL qui alimente l'écran ; (b) terminal `mm ancre pay …` → refus avant signature ; (c) deuxième appareil qui ouvre le coffre Mera → même ensemble d'ancres, même verdict. | "The graph and this screen are indexed with Envio. A MetaMask Agent Wallet plugin refuses before it signs. And the reader's private anchor set lives in a Mera passkey vault: same verdict on a second device." |
| 11 | 2:48-2:55 | Carte finale : nom, tagline, URL du dépôt, adresses. | "The standard leaves Sybil filtering to the reader. ANCRE is that reader, and it refuses to pay." |

Chiffres du storyboard :
- plans 1 à 4 : DOC, `solver/out/mainnet.md` (snapshot du 21/09, relu on-chain au bloc 108 434 518) ;
- plan 5 : DOC, CR tour 3 ;
- plans 6 à 8 : à mesurer (chantiers 05 et 06). Les latences sont celles du vault (testnet, 15/09 : Voted en 300 ms médian, Finalized en 582 ms). **Les remplacer par la mesure mainnet du jour du tournage** ;
- plan 9 : 0,084 MON (840 k gas à 100 gwei) pour une mise à jour de 300 arêtes, **au niveau actuel sans relecture du registre**. En Registry-verified, c'est ≈ 13,6 M gas ESTIMÉ : **ne dire que le chiffre mesuré du niveau réellement déployé** ;
- plan 10 : conditionné à D38 et aux exigences des fiches (§5.3). Couper une vignette plutôt que la montrer mockée.

Ordre de coupe si ça dépasse (PROPOSÉ, cohérent avec D31) : d'abord la scène 5 dans le plan 8, puis le plan 4, puis la vignette du bounty le moins avancé. **Jamais coupés** : plans 2, 7 et 8 (ferme, ancre compromise, disjoncteur).

---

## 4. Écran de démo

### 4.1 Maquette textuelle (PROPOSÉ)

Un seul écran, deux modes (Acte 1 statique / Acte 2 live), et une source de données affichée en permanence.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ANCRE · Monad mainnet (143)      bloc 108 7xx xxx  ● P  ◐ V  ■ F      [ACTE 1][ACTE 2] │
│ source : LIVE wss://… (Dwellir)  |  ou REJEU journal 2026-10-xx, blocs N…M  (bandeau) │
├──────────────────────────────┬──────────────────────────────────────────────────────┤
│ NAÏF — getSummary            │ ANCRE — assess(agentId, setId, withVeto)             │
│                              │ ensemble : demo-anchors-v1  α = 1/3  m = 2           │
│ Eve-8004 #182                │ niveau : Registry-verified | Submitter-attested      │
│   1,5264 × 10³⁶              │ Eve-8004 #182                                        │
│   7 665 avis · 117 à 1e38    │   trustRobust 0   distrust 0   e 9 wei               │
│                              │   masse sur la ferme (7 666 agents) : 0              │
│ [liste des cibles de l'acte] │   status OK · certBlock 108 xxx xxx                  │
├──────────────────────────────┴──────────────────────────────────────────────────────┤
│ DISJONCTEUR — paiements x402 via TrustGatedRouter                                   │
│ bloc     état  payeur→agent        montant   décision  raison            tx         │
│ N+1      ■ F   router→#fourn-2     0,05 USDC REFUSÉ    VETOED (ancre B)  0x9c…e1 ↗  │
│ N        ◐ V   ancre B → #fourn-2  —         slash −100 (NewFeedback)    0x41…7a ↗  │
│ N−3      ■ F   router→#cible-ferme 0,05 USDC REFUSÉ    below θ (0 < 1e-3) 0x…     ↗ │
├──────────────────────────────┬──────────────────────────────────────────────────────┤
│ GRAPHE DU SUPPORT (≤ ~100 nœuds) │ PREUVES                                          │
│ taille/opacité ∝ masse ANCRE     │ contrats : AnchoredReputation 0x… ↗ Router 0x… ↗ │
│ ancres en contour épais          │ registres 8004 : 0x8004A169… 0x8004BAa1…         │
│ ferme = nuage gris, masse 0      │ chaque chiffre : date · bloc · fichier source     │
└──────────────────────────────┴──────────────────────────────────────────────────────┘
```

**Acte 1**, quatre onglets. Données **statiques**, exportées par le solveur, avec leur date. Aucun badge « live ».

| Onglet | Chiffres affichés (DOC, `solver/out/mainnet.md`) |
|---|---|
| Eve #182 | naïf 1,5264e36 (7 665 avis, 117 à 1e38) ; ANCRE : masse 0 sur S (7 666 agents), e = [9, 9] wei, 3 nœuds certifiés ; contrôle « ancres dans la ferme » : t = 0,222. On le montre, parce qu'ANCRE est relatif aux ancres |
| Scanner | 32 avis sur 28 agents ; sans D15 : masse sur S = 0,3456 ; avec D15 : 0 ; borne théorique 0,6221 ; deux scanners corrélés sans D15 font passer 1 agent (AM-R4.8) |
| #8317 | 78 avis d'un seul noteur (`agentWallet` = 0x4498…) ; arêtes retenues = 0 |
| Chaîne honnête | #18 : t = 0,222, trustRobust = 0,111 (α = 1/3) ; #2, #3, #4 : absents sous D16 strict. **Chiffres antérieurs à D20 (copie de ligne) : à recalculer** avant d'être affichés |

**Acte 2** : les scènes 1 à 5 du chantier 06, alimentées en live. Pour chaque ligne du disjoncteur, le badge change d'état sur place (P → V → F), sans créer de nouvelle ligne.

Règles d'affichage (PROPOSÉ, dérivées de la vague 1 §A2) :
- **Proposed** : ligne en italique, pastille creuse. Elle apparaît ~50-150 ms après le bloc.
- **Voted** : le verdict du disjoncteur (REFUSÉ / PAYÉ) s'affiche. Réversible en théorie, jamais observé sur 794 blocs.
- **Finalized** : ligne pleine, comptée dans les totaux « officiels ». Les valeurs ANCRE sont lues par `eth_call` au tag `"finalized"`.
- Une ligne purgée (bloc spéculatif abandonné) **disparaît avec une animation barrée** et un compteur « speculative blocks dropped: k ». C'est un bon effet visuel, expliqué par une infobulle.
- Le temps s'affiche **en blocs** (« refusé à N+1 »), et en ms seulement comme mesure d'arrivée locale. Jamais `block.timestamp`, qui est à la seconde et partagé par 3-4 blocs.

### 4.2 Flux temps réel : `monadLogs` + `monadNewHeads`

Faits (DOC, vague 1 §A2, et doc Monad `reference/json-rpc/overview#websocket-subscriptions`) :
- `monadLogs` et `monadNewHeads` émettent à chaque changement de `commitState` ∈ {Proposed, Voted, Finalized, Verified} ;
- un bloc peut sauter `Voted` ;
- **un bloc abandonné ne produit aucun événement** : on le purge quand une autre proposition est finalisée à la même hauteur ;
- un log arrive jusqu'à 4 fois ;
- à la souscription, on reçoit aussi des états de blocs antérieurs.

Le code ci-dessous est PROPOSÉ. Il adapte `liveFeed.ts` du vault (testé sur le testnet le 15/09 : 0 manquant, 0 doublon, coupure de 4 s) en un **réducteur pur**, pour que le live et le rejeu passent par **le même code**. Écarts avec le vault :
- mainnet ;
- plusieurs adresses et plusieurs events ;
- journal d'enregistrement.

Le filtre `address: [..]` en tableau sur `monadLogs` est **NON VÉRIFIÉ**. Solution de repli : une souscription par adresse, dans la limite de 100 par connexion.

```ts
// chain.ts — mainnet, temps de bloc corrigé (viem livre blockTime: 400)
import { defineChain } from "viem";
import { monad as base } from "viem/chains";
export const MONAD_HTTP = "https://rpc.monad.xyz";           // 25 rps, getLogs ≤ 100 blocs
export const MONAD_WSS  = import.meta.env.VITE_WSS ?? "wss://rpc.monad.xyz"; // démo : endpoint privé (Dwellir/QuickNode)
export const monad = defineChain({ ...base, blockTime: 302 }); // MESURÉ 27/09 sur 1 M blocs
```

```ts
// feedCore.ts — réducteur pur : même code en live et en rejeu
import { decodeEventLog, type Abi, type Hex } from "viem";

export type CommitState = "Proposed" | "Voted" | "Finalized" | "Verified";
const RANK: Record<CommitState, number> = { Proposed: 0, Voted: 1, Finalized: 2, Verified: 3 };

export type Entry = {
  key: string; blockNumber: bigint; blockHash: Hex; state: CommitState;
  address: Hex; eventName: string; args: Record<string, unknown>; txHash: Hex; logIndex: number;
};
export type FeedState = { entries: Map<string, Entry>; finalizedHead: bigint; dropped: number };
export type Msg =                                     // exactement ce qu'on enregistre dans le journal
  | { kind: "log";  t: number; raw: any }             // params.result d'un monadLogs (ou log de backfill)
  | { kind: "head"; t: number; raw: any };            // params.result d'un monadNewHeads

export const initial = (): FeedState => ({ entries: new Map(), finalizedHead: 0n, dropped: 0 });

export function reduce(s: FeedState, m: Msg, abi: Abi, fromBlock: bigint): FeedState {
  if (m.kind === "log") {
    const r = m.raw, n = BigInt(r.blockNumber);
    if (n < fromBlock) return s;                      // états de blocs antérieurs reçus à la souscription
    let ev; try { ev = decodeEventLog({ abi, data: r.data, topics: r.topics }); } catch { return s; }
    const key = `${r.transactionHash}:${Number(r.logIndex)}`;
    const state: CommitState = r.commitState ?? (n <= s.finalizedHead ? "Finalized" : "Proposed"); // backfill sans commitState
    const prev = s.entries.get(key);
    if (prev && prev.blockHash === r.blockHash && RANK[prev.state] >= RANK[state]) return s; // doublon (jusqu'à 4×)
    const entries = new Map(s.entries);
    entries.set(key, { key, blockNumber: n, blockHash: r.blockHash, state, address: r.address,
      eventName: ev.eventName as string, args: (ev.args ?? {}) as Record<string, unknown>,
      txHash: r.transactionHash, logIndex: Number(r.logIndex) });
    return { ...s, entries };
  }
  // head : seule la finalisation compte ; elle purge les propositions concurrentes abandonnées
  const h = m.raw;
  if (h.commitState !== "Finalized") return s;
  const n = BigInt(h.number);
  let dropped = s.dropped; const entries = new Map(s.entries);
  for (const [k, e] of entries) {
    if (e.blockNumber === n && e.blockHash !== h.hash) { entries.delete(k); dropped++; }  // bloc spéculatif abandonné
    else if (e.blockNumber <= n && RANK[e.state] < RANK.Finalized) entries.set(k, { ...e, state: "Finalized" });
  }
  return { entries, finalizedHead: n > s.finalizedHead ? n : s.finalizedHead, dropped };
}

// sélecteurs de l'écran
export const verdictVisible = (e: Entry) => RANK[e.state] >= RANK.Voted;      // disjoncteur affiché à Voted
export const official       = (e: Entry) => RANK[e.state] >= RANK.Finalized;  // totaux / tableau à Finalized
```

```ts
// source.ts — live (WSS) avec enregistrement, ou rejeu d'un journal JSONL
import type { Msg } from "./feedCore";

export function live(wss: string, filter: { address: string[]; topics?: unknown[] },
                     onMsg: (m: Msg) => void, record?: (line: string) => void, onOpen?: () => void) {
  let ws: WebSocket, retry = 0, stopped = false, id = 1;
  const subs = new Map<string, Msg["kind"]>(), pending = new Map<number, Msg["kind"]>();
  const connect = () => {
    ws = new WebSocket(wss);
    ws.onopen = () => {
      retry = 0;
      onOpen?.();   // l'appelant fige son curseur (dernier Finalized vu) AVANT de souscrire, puis lance le backfill
      for (const [p, k] of [[["monadLogs", filter], "log"], [["monadNewHeads"], "head"]] as const) {
        pending.set(id, k); ws.send(JSON.stringify({ jsonrpc: "2.0", id: id++, method: "eth_subscribe", params: p }));
      }
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== undefined) { if (!msg.error) subs.set(msg.result, pending.get(msg.id)!); pending.delete(msg.id); return; }
      const kind = subs.get(msg.params?.subscription); if (!kind) return;
      const m: Msg = { kind, t: performance.now(), raw: msg.params.result };
      record?.(JSON.stringify(m, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
      onMsg(m);
    };
    ws.onclose = () => { if (!stopped) setTimeout(connect, Math.min(500 * 2 ** retry++, 5_000)); };
    ws.onerror = () => ws.close();
  };
  connect();
  return () => { stopped = true; ws.close(); };
}

export async function replay(lines: string[], onMsg: (m: Msg) => void, speed = 1) {
  const msgs = lines.map((l) => JSON.parse(l) as Msg);
  const t0 = msgs[0]?.t ?? 0, start = performance.now();
  for (const m of msgs) {                              // on respecte le rythme enregistré (P→V→F visibles)
    const wait = (m.t - t0) / speed - (performance.now() - start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    onMsg(m);
  }
}
```

Reconnexion et backfill : reprendre `backfill()` du vault tel quel. Deux points :
- **figer le curseur avant de souscrire** : c'est un bug rencontré en test ;
- `eth_getLogs` par tranches de 100 blocs sur `rpc.monad.xyz`, en injectant chaque log dans `reduce` comme un message `log` sans `commitState`.

Les valeurs ANCRE (`assess`, `getSummary`) se lisent en `eth_call` au tag `"finalized"`, **uniquement sur événement** (un `CertificateSubmitted`, un `NewFeedback` d'une ancre, une décision du router). Jamais en boucle : 25 rps sur le RPC public (chantier 07 §5).

Events écoutés (PROPOSÉ) :

| Adresse | Event | Rôle à l'écran |
|---|---|---|
| Reputation Registry `0x8004BAa1…9b63` | `NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` (DOC, `envio.md` §2.3) | slash ou endorsement d'une ancre, avis de la ferme. Filtrer `clientAddress` sur nos comptes de démo pour ne pas afficher le reste du registre |
| idem | `FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)` | révocation |
| `AnchoredReputation` | `CertificateSubmitted(bytes32 indexed setId, uint64 indexed certBlock, …)` (DOC, `contracts/src`) | recertification : relire `assess` au tag finalized |
| `TrustGatedRouter` | `PaymentDecided(agentId, setId, status, amount, reason)` : **nom et champs à fixer dans le chantier 05** | ligne du disjoncteur |

### 4.3 Paragraphe « Why Monad » (PROPOSÉ, pour le README et le profil, exigé par §9.2 d'après le concurrent)

> ANCRE runs next to the canonical ERC-8004 registries on Monad mainnet (chain 143), where we measured the Sybil farm it defeats. Three Monad properties make it practical rather than theoretical:
> (1) ~0.3 s blocks and ~0.6 s finality: an anchor's veto blocks the very next payment, one block later;
> (2) cheap contiguous storage (MIP-8): a certified trust vector is readable by any contract without a proof, for 77–190k gas per payment decision;
> (3) cheap large transactions: re-certifying a 300-edge graph costs ~840k gas (≈0.084 MON at 100 gwei), so the certificate is refreshed on every graph change.
> The standard itself is chain-agnostic; Monad is where the strongest verification level is routine.

Réserves :
- (2) et (3) sont DOC, mesurés dans `contracts/GAS.md`, **au niveau actuel** ;
- en Registry-verified, (3) devient ≈ 13,6 M gas ESTIMÉ : remplacer le chiffre par la mesure du chantier 02 ;
- le prix du gas (100 gwei) est une convention du dépôt, NON VÉRIFIÉE comme prix courant.

### 4.4 Mode rejeu (obligatoire, chantier 07 §5)

PROPOSÉ :
- chaque session live écrit un **journal JSONL** des messages bruts (`Msg` ci-dessus, horodatés en `performance.now()`) ;
- les réponses `eth_call` (`assess`, `getSummary`) sont enregistrées dans le même journal, sous la forme `{kind:"call", block, req, res}` ;
- le rejeu relit le journal au rythme d'origine, ou accéléré, et passe par le **même `reduce`** : l'affichage est identique, badge « REJEU » compris ;
- la démo figée sur un bloc (D28, état anvil exporté) produit elle aussi un journal. Le rejeu fonctionne donc sans aucun RPC.
- Critère : l'écran se lance hors ligne (`?source=replay&log=acte2-2026-10-xx.jsonl`) et affiche les mêmes lignes, dans le même ordre, que la session enregistrée.

### 4.5 Stack recommandée

PROPOSÉ : **Vite + React + TypeScript + viem**, build statique, sans backend.
- **viem** plutôt qu'ethers : le code temps réel du vault est déjà en viem (2.56.5, testé), et `decodeEventLog` / `defineChain` suffisent.
- **Pas de wagmi** : l'écran est en lecture seule. Les paiements sont faits par les scripts du chantier 06 et par le plugin `mm`, pas par un wallet de navigateur.
- **WebSocket natif** pour `monadLogs` : le typage viem ne connaît pas cette méthode (`as any` dans le vault).
- **Historique** : l'API GraphQL de l'indexeur Envio (Hasura). C'est ce qui rend le bounty Envio réel, puisque la fiche demande un frontend qui consomme ces données.
- **Acte 1** : un JSON exporté par le solveur, à ajouter à `solver/run_mainnet.py`, avec pour chaque chiffre son bloc, sa date et son fichier source.
- **Graphe** : un SVG maison, ou une petite lib de force (d3-force). Moins de 100 nœuds, donc pas besoin de Cytoscape. Le contraste 1,5e36 contre 0 compte plus que le graphe (chantier 07 §4).
- **Secrets** : l'URL WSS privée (Dwellir ou QuickNode, offerts) reste dans `.env` et n'entre **jamais** dans un build public. Un build public démarre en mode rejeu par défaut, ou sur `wss://rpc.monad.xyz`.
- Hébergement public : décision de Hugo (chantier 07 §9).

---

## 5. Checklist de soumission

### 5.1 Dates, heure de Paris

Paris est en CEST (UTC+2) jusqu'au 25/10, puis en CET (UTC+1). New York est en EDT (UTC−4) jusqu'au 01/11.

| Date (Paris) | Événement | Statut |
|---|---|---|
| **jeu. 02/10** | Ouverture du formulaire de soumission | NON CONFIRMÉ |
| **dim. 05/10** | Cible de la divulgation privée aux auteurs d'ERC-8004 (D29), **avant** toute mise en public | recommandation du CR |
| **lun. 06/10** | Fin des inscriptions : équipe créée, projet créé, track choisie | NON CONFIRMÉ, **critique** |
| **dim. 12/10** | Soumission cible, avec un jour de marge (chantier 09) ; dépôt public ; vidéo en ligne | PROPOSÉ |
| **mar. 14/10, 05:59** | **Clôture** (= 13/10 23:59 EDT = 14/10 03:59 UTC). Les fiches bounty affichent « 14/10 05:59 GMT+2 » | NON CONFIRMÉ (Rules §4.2) ; heure bounties DOC |
| 14/10 → 27/10 | Jugement par track. Surveiller les preuves d'écart pendant ce temps (question du tour 5) | DOC (page publique) |
| **lun. 03/11** | Résultats | DOC (page publique) |

### 5.2 Checklist

| # | Élément | Contenu attendu | Statut | Responsable |
|---|---|---|---|---|
| 1 | Inscription et équipe | 1 à 5 membres ; contact principal = celui qui reçoit les prix (USDC, KYC possible) | NON CONFIRMÉ | **Hugo** |
| 2 | Projet sur la plateforme | nom, one-line description (**courte**), description complète, lien du dépôt, **track 04 Trust, Identity & AI Infra** | NON CONFIRMÉ (parcours du concurrent) | **Hugo** |
| 3 | Bounties sélectionnés | Envio · MetaMask (éligibilité track 04 à confirmer) · Mera (D38) | DOC (fiches) / NON CONFIRMÉ | **Hugo** |
| 4 | Profil de projet public | « a demo, a short write-up, and a link to the code » | DOC (page publique) | Hugo |
| 5 | Write-up | voir le texte proposé ci-dessous | PROPOSÉ | 09 |
| 6 | Vidéo | ≤ 3:00, plafond strict, publique (YouTube, Loom ou Vimeo), montre le produit qui tourne et des interactions Monad | NON CONFIRMÉ | 09 + Hugo |
| 7 | **Lien de code public** | dépôt GitHub public **à la soumission au plus tard**. « throughout » : peut-être dès maintenant. **Conflit avec la décision « dépôt privé »** (CLAUDE.md §5) : décision de Hugo | NON CONFIRMÉ | **Hugo** |
| 8 | Nettoyage avant publication | revue non confidentielle (§5.3). À trancher : CLAUDE.md (adresse e-mail, chemins personnels, règles internes), `docs/conseil/` (délibérations, veille concurrentielle, plan de divulgation), scripts qui visent des tiers. **L'historique git publie tout** : un retrait n'efface rien, et réécrire l'historique se heurte à l'exigence sur l'historique de commits. Options : tout assumer (transparence) ou déplacer le sensible *avant* de le committer | PROPOSÉ | **Hugo** |
| 9 | Licences | `LICENSE` à la racine en **MIT** ou **Apache-2.0** (CHOIX de Hugo ; Apache-2.0 couvre les brevets). **Remplacer `SPDX: CC0-1.0` dans les 10 fichiers Solidity** (CC0 n'est pas OSI). ERC : **CC0**, déjà écrit (`docs/erc/anchored-reputation.md` §Copyright ; le lien `../LICENSE.md` suit la convention du dépôt `ethereum/ERCs`). `forge-std` : MIT/Apache, compatible. SDK MetaMask 7.0.0 : licence « source-view », donc **ne rien vendoriser** (en `peerDependency` uniquement). Envio : EULA non OSI, mais c'est un outil, pas notre code | DOC (grep) + PROPOSÉ | Hugo |
| 10 | Déclaration des outils IA | section « AI tool disclosure » du README, texte ci-dessous | NON CONFIRMÉ (§4.1.4) | Hugo complète |
| 11 | Historique de commits | commits réguliers d'ici au 13/10, pas de squash final. Le travail de recherche antérieur (vault, avant le premier commit du 23/09) est à **identifier dans le README** comme base | NON CONFIRMÉ | équipe |
| 12 | Intégration Monad | adresses des contrats (mainnet 143), hashes des tx de l'acte 2, paragraphe « Why Monad » (§4.3), contrats vérifiés sur MonadVision **et** Monadscan | NON CONFIRMÉ (§9.2) | 02, 06 |
| 13 | Reproductibilité | script « acte 1 » en 5 min ; `demo/RUNBOOK.md` ; journal de rejeu joint | PROPOSÉ (chantier 09) | 04, 06, 07 |
| 14 | Fiches bounty | Envio : `config.yaml`, `schema.graphql`, handlers publics, frontend qui consomme, démo de bout en bout. MetaMask : plugin installable, `skills/ancre/SKILL.md`, README, démo ≤ 5 min, **toutes** les tx via l'Agent Wallet, `minCliVersion` `">=6.2.0 <8"`. Mera : un espace de noms PRF qui **ne sert pas de compte**, test multi-appareils en live, rien de sensible persisté | DOC (fiches, 27/09) | 03, 05, 06 |
| 15 | Vérification finale | après dépôt, le statut affiché est « submitted », pas « draft » ; relire le profil public déconnecté | PROPOSÉ | **Hugo** |

**Write-up proposé** (EN, PROPOSÉ, ~150 mots ; chiffres DOC) :

> **ANCRE — anchored, Sybil-resistant reputation for ERC-8004, readable by a contract before it pays.**
> ERC-8004 lets anyone rate any agent for free and explicitly leaves Sybil filtering to the reader, without giving the reader a tool. On Monad mainnet (snapshot 21 Sep 2026), 83% of the 9,188 ratings come from a single farm; its target's naive average is 1.5·10³⁶. ANCRE computes personalized PageRank from anchors *the reader chooses*, certifies a lower bound on-chain, and exposes `assess(agentId, setId)`; a payment router refuses x402 payments below threshold or under an anchor's veto — one block after the veto. On the real registry, the farm's trust mass is exactly 0. ANCRE is the reference implementation of a chain-agnostic draft ERC. Certificate level: [Registry-verified | Submitter-attested]. Prior art credited: OpenRank (on-chain fixed-point check), trustgraphs (anchored PageRank with ZK).

Tagline (one-line, courte à cause du `400` signalé) : « Sybil-resistant ERC-8004 reputation a contract can check before paying. » (PROPOSÉ)

**Déclaration IA proposée** (EN, PROPOSÉ, à compléter par Hugo : il faut dire honnêtement ce que les humains ont relu) :

> ## AI tool disclosure
> This project was built with heavy use of an AI coding agent (Claude Code, Anthropic). The agent drafted most of the research notes, the simulated design-review "council" documents in `docs/conseil/`, the PPR solver and its tests (`solver/`), the verifier contract, tests and gas measurements (`contracts/`), the draft ERC (`docs/erc/`), the demo screen and scripts, and this README. Humans on the team set the goals, took every design decision recorded in the decision log (D1–D38), chose what to measure, and reviewed [TO FILL: which parts line by line — e.g. contract logic, certificate verification, payment router — and which parts at test/run level only]. All numbers quoted in this README were produced by scripts in this repository and can be re-run; AI-generated text was checked against those outputs. Research predating the first commit (a private notes vault) is summarized in `docs/` and identified as such.

### 5.3 Bounties : ce que la fiche exige, et où c'est livré

| Bounty (D38) | Exigence de la fiche (DOC, 27/09) | Où ANCRE la remplit | Point dur |
|---|---|---|---|
| **Envio**, Best Use of Envio (1 k$) | usage réel de HyperIndex / HyperSync pour une fonctionnalité centrale ; schéma non trivial, entités dérivées ; dépôt public avec `config.yaml`, `schema.graphql`, handlers ; frontend qui consomme ; démo de bout en bout | indexeur du chantier 03 (arêtes ANCRE dérivées : dernier avis par (client, agent, tag1), contrôleurs, wallets partagés) → solveur et écran §4.5 | token HyperSync à créer à la main (compte GitHub) ; concurrent direct : `Sireadell/headwater-indexer` |
| **MetaMask**, Best Agent Wallet Plugin (2,5 k$) | plugin installable via l'Agent Wallet ; `skills/<name>/SKILL.md` ; README ; démo ≤ 5 min ; **toutes** les tx via l'Agent Wallet | `mm ancre assess` / `mm ancre pay` qui refuse avant signature (fiche `metamask-agent-wallet.md` §8). Vignette 10b de la vidéo | **track affichée 01** ; skill x402 officielle en `exact` seulement (pas `upto`) ; garde consultatif, pas imposé ; concurrent : `Beltran12138/warrant` |
| **Mera**, One Passkey, Many Keys (2,5 k$) | usage **hors wallet** du PRF ; sels cloisonnés ; rien de sensible persisté ; **test multi-appareils en live** ; exclu : signer des tx depuis un compte wallet | espace de noms « ensemble d'ancres privé du lecteur », chiffré dans un coffre Mera (`mera.md` §5, point 3) ; éventuellement pré-rotation des clés d'ancre (D9), présentée comme une identité de rôle | une clé d'ancre qui signe `giveFeedback` **ressemble à un compte** : ne pas en faire le cœur du bounty. Concurrent proche : `aliveevie/mandate`. Seuil du tour 5A : moins d'une journée d'intégration |

---

## 6. Ce que Hugo doit faire lui-même

1. **Relire la modale « Rules & Guidelines »** sur hackathon.monad.xyz et recopier dans le dépôt, avec la date, les §2.4, 2.5, 3.3 (track 04), 4.1, 4.1.4, 4.2, 5.2, 5.3, 7.2, 9.2 et 9.4. Tout le §1 passe alors de NON CONFIRMÉ à DOC. Corriger aussi AM-5.7 dans le CR s'il le faut.
2. **S'inscrire et créer l'équipe et le projet avant le 06/10** (NON CONFIRMÉ) : choisir le contact principal, la track 04, cocher l'accord. La plateforme exige de créer le projet avant de choisir les bounties.
3. **Décider du dépôt public** : quand (dès maintenant si « throughout » est confirmé, sinon au 12/10), ce qui y reste (§5.2 n° 8), et sous quelle licence (MIT ou Apache-2.0). Remplacer les en-têtes CC0 du code. Rendre le dépôt public exige un geste de Hugo, et la divulgation D29 doit passer **avant**.
4. **Poser les questions sur le forum de support** (hackathon.monad.xyz/support?tab=forum, là où le concurrent a posté les siennes) :
   - le bounty MetaMask est-il ouvert à la track 04 ?
   - combien de bounties un projet peut-il viser ?
   - une vidéo séparée par bounty est-elle admise, en plus de la vidéo de 3 min ?
   - pour Mera, une clé de rôle (attestation d'ancre) compte-t-elle comme un « wallet account » ?
5. **Créer les comptes et tokens** qui exigent une personne : token HyperSync (envio.dev, GitHub), `mm login` pour l'Agent Wallet, endpoint WSS privé (Dwellir ou QuickNode offerts), clé Etherscan v2 pour Monadscan.
6. **Autoriser les transactions mainnet** (déploiement, acte 2) et le budget MON en deux enveloppes (recommandation du tour 5).
7. **Trancher le nom** (ANCRE, Keel, Mooring) avant d'enregistrer la vidéo et le profil.
8. **Enregistrer ou valider la voix** de la vidéo, la mettre en ligne publiquement, et vérifier qu'elle dure moins de 3:00.
9. **Compléter la déclaration IA** (partie « TO FILL ») : ce que l'équipe a relu ligne à ligne, et ce qui ne l'a été qu'au niveau des tests.
10. **Déposer la soumission le 12/10**, vérifier le statut « submitted », et désigner qui surveille les preuves d'écart du 14 au 27/10.

---

**Sources consultées le 27/09/2026** :
- https://github.com/precious-akpan/monad-metropolis-merchant-rails (README, API GitHub : `pushed_at` 2026-09-23T07:52:18Z, licence MIT) ;
- https://monad.xyz/developers/hackathons/metropolis (via la vague 1 et le tour 5A) ;
- fichiers du dépôt ANCRE cités en tête ;
- note du vault `Temps réel — WebSocket & lecture live sur Monad.md` (code testé le 15/09, testnet).

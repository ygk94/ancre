# Veille Metropolis : ce qui a changé depuis le 27/09

> Consultations faites le **2026-10-05, entre 20 h et 21 h UTC**, sans compte et sans inscription. Aucune modification ailleurs dans le dépôt.
> Statuts : **DOC** (page officielle Monad ou plateforme, lue ce jour) · **MESURÉ** (appel RPC en lecture seule, ce jour) · **TIERS** (concurrent, agrégateur, newsletter) · **NON TROUVÉ**.
> Référence de comparaison : `docs/conseil/bounties-sponsors.md` (page officielle lue le 27/09) et `docs/ressources/design-demo-et-soumission.md` §1 (règles de source tierce).

---

## 0. À lire en premier

| # | Fait | Statut | Conséquence pour ANCRE |
|---|---|---|---|
| 1 | Page « Tracks & Bounties » de la plateforme (en-tête public, sans connexion) : *« Choose one primary track, then add as many sponsor bounties as you'd like. Each bounty lists what it needs. You complete those fields when you submit. »* et *« Sponsor bounties — Optional awards. **Each one names its track, and the ones marked All tracks pair with any.** »* https://hackathon.monad.xyz/tracks | DOC | **Contredit notre hypothèse sur MetaMask.** La fiche « Best Agent Wallet Plugin » affiche la track « Onchain Finance & Trading », pas « All tracks » (fiche copiée par Hugo le 27/09). Lecture littérale : **elle ne se combine pas avec un projet soumis en track 04.** D38 vise ce bounty : à confirmer **avant** de continuer à y investir (voir §5). |
| 2 | Page « Prizes » de la plateforme (publique) : *« Choose one main track to qualify for any bounty. Main-track prizes are separate and stack with sponsor bounties. »* et *« Every sponsor bounty stacks on top of a main track prize. Pick one track, then claim as many bounties as your project earns. »* https://hackathon.monad.xyz/prizes | DOC | **Cumul track + bounties confirmé, sans plafond du nombre de bounties.** Ce qui était NON TROUVÉ le 27/09 est réglé. La phrase reste ambiguë sur MetaMask (« any bounty » d'un côté, « names its track » de l'autre) : le point 1 l'emporte tant que les organisateurs n'ont pas répondu. |
| 3 | Les champs propres à chaque bounty se remplissent **dans le formulaire de soumission** (« You complete those fields when you submit »). | DOC (même page) | Chaque bounty visé (Envio, Mera, peut-être MetaMask) ajoute des champs. Il faut ouvrir le formulaire tôt pour voir ce qu'ils exigent (vidéo séparée ? lien de dépôt ?). |
| 4 | Le formulaire de soumission est **ouvert depuis le 02/10** et reste modifiable jusqu'à l'échéance (« the form opened Oct 2 and stays editable until the deadline »). Le même concurrent recommande de **soumettre une version complète tout de suite**, puis de l'améliorer. | TIERS (README de precious-akpan, commit `67238b1` du 05/10) | Confirme l'hypothèse « formulaire ouvert le 02/10 ». À faire cette semaine : une soumission complète « d'assurance », puis des mises à jour. |
| 5 | **Inscriptions closes le 06/10** : aucune nouvelle source. La seule reste le tableau de bord vu par le concurrent le 22/09 (« registration open through 6 Oct »). La page officielle ne donne aucune date de clôture des inscriptions. | TIERS (inchangé) / NON TROUVÉ côté DOC | **Hypothèse ni confirmée ni infirmée.** Par prudence : équipe et projet créés sur la plateforme **avant le 06/10, 23:59 UTC au plus tard**. Le fuseau de cette date est inconnu, donc viser le 06/10 au matin heure de Paris. |
| 6 | **Aucune prolongation.** Le compte à rebours de la plateforme affiche toujours **« Oct 14 · 03:59 UTC »** (= 13/10, 23:59 ET = **14/10, 05:59 heure de Paris**). Un résumé de moteur de recherche parlait d'un report « depuis le 3 octobre » : aucune page consultée ne le dit (risein, web3voyager, Monad Pulse). C'est une invention du résumé. | DOC (compte à rebours) ; « report » : NON TROUVÉ | Échéance inchangée. Garder la cible de soumission du 12/10. |
| 7 | Concurrent direct sur le bounty MetaMask : **zakyirsyaad/monagent**, créé le 04/10, publié sur npm (`@zakyirsyaad/monagent-plugin`), licence MIT, mainnet 143. Commandes `mm monad reputation check` / `give` sur les registres ERC-8004, x402, escrow. C'est **exactement la piste n° 05** de la fiche MetaMask. | TIERS (README lu le 05/10, dernier commit 05/10 13:20 UTC) | Sur le bounty MetaMask, on n'est plus seuls. Notre angle : son `reputation check` lit le registre tel quel, et ANCRE montre que c'est la ferme qui parle (à vérifier dans son code avant de le dire). |

---

## 1. Page officielle https://monad.xyz/developers/hackathons/metropolis (relue le 05/10)

Comparaison avec `bounties-sponsors.md` (27/09). Aucune date de mise à jour n'est affichée sur la page.

**Inchangé (DOC)**
- Dates : inscriptions ouvertes le 1/09 ; fenêtre de build du 1/09 au 13/10 ; échéance le 13/10 ; jugement du 14 au 27/10 ; résultats le 3/11.
- 4 tracks à 30 k$ (10 k$ par équipe, 3 équipes) ; Grand Champion 25 k$.
- Bounties ouverts à tous : **liste identique à celle du 27/09**, montants compris. Envio 1 k$, Cleanverse 2 k$, Kuru 5 k$ ×2, Dynamic 5 k$, Alchemy 1 k$ en crédits, Chainlink CRE 3 k$, Perpl 5 k$ + 3 k$, Privy 5 k$, Nansen 5 k$, Agora 10 k$ ×2, Tencent / Kimi / Qwen 2 / 3 / 5 k$ en crédits, Mera UX 2,5 k$, **Mera One Passkey Many Keys 2,5 k$**, **MetaMask Agent Wallet Plugin 2,5 k$**, Community 5 k$, Aurora 5 k$. Toujours suivie de « And more, listed in full on the platform ».
- FAQ mot pour mot identique, y compris « **Open sourcing is encouraged but not required.** Judges need to be able to verify what you built during the six weeks. » et « What do I submit? A working product with a public project profile: a demo, a short write-up, and a link to the code. »
- Activations : Londres 2/10, Buenos Aires 3/10, Singapour 6/10 (inchangé).
- Définition de la track 04 : « AI has made identity, provenance, data ownership, and agent trust urgent infrastructure problems », exemples « Agent identity and reputation under ERC-8004 », P256/WebAuthn, provenance des médias.

**Ajouté ou absent de notre fiche du 27/09**
- **BlockVision, 8 000 $** : « Three months of the Pro plan for every track winner » (prix automatique pour les gagnants). DOC. Absent de `bounties-sponsors.md`. Ajouté depuis, ou oublié le 27/09 : impossible à trancher.
- **BlockVision Lite, 2 mois gratuits** pour toutes les équipes (ressources participants). DOC, absent de notre fiche. Utile en marge : BlockVision opère MonadVision et son Sourcify (vérification de contrats, voir `monad-dev-et-soumission.md` A1).
- **Jury** : la page affiche « 18 of 73 » personnes en filtre « Judges », avec de nouveaux noms par rapport à CLAUDE.md §1 : CoinFund, IOSG, Eigen Foundation, Prelude, Primitive Ventures, 6th Man Ventures, Alchemy, Perpl, Tencent et **Francesco Andreoli (MetaMask, Director of DevRel)**. DOC. @monad_dev a publié une « Judge Spotlight » sur lui : « works on agentic wallets, scoped delegation… trust boundaries between AI agents and money » (https://x.com/monad_dev/status/2097682107321700819, TIERS : extrait du moteur de recherche, X n'est pas lisible sans compte).

## 2. Plateforme https://hackathon.monad.xyz (partie publique)

Sans connexion, la coque de chaque page s'affiche. Le contenu (fiches de bounties, calendrier, FAQ, forum) se charge après connexion : **NON LU**.

| Page | Ce qui est public | Statut |
|---|---|---|
| `/` | « Intake · Open 1 Sep to 13 Oct », connexion GitHub / Google / Discord. **Un compte par fournisseur** (« If you registered with the other one, continue with that one instead »). | DOC |
| `/prizes` | Voir §0 (points 2 et 3). Tracks décrites autrement que sur la page marketing. Track 04 : *« Trust, provenance, and user-owned data primitives that make AI useful without one platform capturing the value. »* Grand Champion « awarded at the judges' discretion ». | DOC |
| `/prizes`, « Prize Pool Contributions » (montants donnés comme des plafonds estimés) | ack3 15 k$ ; Chainstack 10 k$ (**gagnants de la track 01 et Grand Champion seulement**) ; Crouton 10 k$ ; Zerion 6 k$ ; **Envio : 2 mois de Cloud gratuits puis un 3e à -50 % (et non « Free Envio Cloud hosting »)**, jusqu'à 5 k$ ; **PingBusiness : remise marchande selon le volume de transactions cumulé, jusqu'à 20 k$ (absent de la page marketing et de notre fiche)** ; BlockVision 8 k$. Mercuryo (10 k$ sur la page marketing) n'apparaît pas ici. | DOC |
| `/prizes`, « Judges » | Deux jurys distincts : **16 « Main Track Judges »** (Electric Capital, Nansen, Castle Island, Prelude, IOSG, CoinFund, Paradigm, Eigen, Monad Foundation ×3, Dragonfly, Pantera, Auros, Galaxy, Layer3) et **10 « Bounty Judges »** (Quicknode, Envio [Denham, fondateur], Dynamic ×2, Alchemy, Perpl, Category Labs [Haythem Sellami], Tencent, Aurora ×2). **Aucun juge MetaMask n'apparaît dans la liste des Bounty Judges**, alors que la page marketing le présente comme juge. | DOC |
| `/tracks` | Voir §0, point 1. | DOC |
| `/calendar` | « Online workshops, IRL events, due dates, and **office hours** across the six-week program from 1 Sep to 14 Oct. All times are UTC. » Le contenu est derrière la connexion. | DOC (en-tête) ; office hours datées : NON TROUVÉ |
| `/project` | Onglets « Overview · Team · **Progress Updates** · Submission ». « Manage project details and collaborators until the deadline. This workspace stays private to your team and organizers. » | DOC |
| `/support` | FAQ + forum catégorisé, bouton « Ask AI ». Contenu NON LU. | DOC |
| `/showcase` | « The projects appear here after judging closes. » | DOC |
| Avertissement anti-arnaque (toutes pages) | « The hackathon team will never request your wallet's private key or seed phrase… » ; méfiance envers les dépôts GitHub et les scripts qui imitent la marque. | DOC |

Pas de page Rules publique (`/rules` renvoie 404). **La modale « Rules & Guidelines » reste NON LUE par nous.**

## 3. Le README de precious-akpan/monad-metropolis-merchant-rails (source des règles citées)

https://github.com/precious-akpan/monad-metropolis-merchant-rails, consulté le 05/10. **Mis à jour : 3 commits le 05/10** (`67238b1` 15:46 UTC, `98071bc` 16:15 UTC, `9a6cfff` 17:59 UTC), après un trou du 23/09 au 05/10. Statut de tout ce qui suit : TIERS.

- **Section « Binding facts » (Rules v3.0 du 3 Sep 2026) : inchangée.** Pas de version v3.1 signalée, aucune règle corrigée. Les hypothèses OSI obligatoire (§7.2), vidéo ≤ 3:00 (§4.1, §9.4), déclaration IA (§4.1.4), grille 5 × 20 % et grille bounties 40/30/20/10 ne sont ni renforcées ni contredites par lui.
- Nouveau : « the form opened Oct 2 and stays editable until the deadline » (voir §0, point 4).
- Nouveau : « Post the dashboard progress update (**also unlocks mentor support access**) ». L'onglet « Progress Updates » de la plateforme rend la chose plausible (DOC). **Conséquence : publier une mise à jour d'avancement pour accéder aux mentors.**
- Nouveau : **réponses des organisateurs sur le forum de support**, données le 23/09 environ 90 min après la question, et lues par lui seulement le 05/10. « Does a responsive/PWA web checkout qualify as 'mobile app' for the Agora… bounty? » → **« Yes, a PWA qualifies. »** Leçon : **le forum répond vite. Relire les fils après avoir posté.**
- Il relance Mera (UX 2,5 k$ + Agora 10 k$) après avoir lu le paquet npm `@category-labs/mera@0.2.0` : sources TypeScript incluses, `toViemAccount(session)`, peer `viem ^2.28.0`. Test PRF réussi sur Chrome 154 / Linux / Google Password Manager, via `mera.category.xyz/demo/` (et non `/prf-demo/`, qui n'est qu'une page explicative). Utile pour notre bounty Mera (D38) : **le même test de go/no-go vaut pour nous.**
- Il a **abandonné Envio** (manque de temps), donc un concurrent de moins sur ce bounty.

## 4. Annonces Monad et écosystème

| Source | Ce qui est nouveau depuis le 27/09 | Statut |
|---|---|---|
| Blog https://www.monad.xyz/announcements | 28/09 « Monad's post-quantum roadmap » ; 01/10 « Monad Ecosystem Highlights: September 2026 » ; 01/10 « StraitsX to bring XSGD and XUSD to Monad ». **Rien sur Metropolis.** | DOC |
| X @monad / @monad_dev | Illisible sans compte (HTTP 402). Le moteur de recherche ne remonte que des « Judge Spotlight » (MetaMask, Alchemy), sans date lisible. Aucune annonce de report ni de changement de règle trouvée. | TIERS / NON TROUVÉ |
| Luma https://luma.com/monad-metropolis | Un seul événement à venir : **« Open », Singapour, 06/10 01:00-09:00 UTC, 50 $** (luma.com/open-2026). Monad.xyz/events ajoute le même jour à Singapour la **DeltaV Demo Day** et « Burning Mon ». Les journées LATAM du 03/10 annonçaient des « rotating mentor office hours » sur place. Aucun office hour en ligne visible sans compte. | DOC |
| The Monad Pulse (Chainflow) #048 (24/09) et #049 (01/10) | Aucune mention de Metropolis. v0.16.3 sur le testnet, puis **v0.16.4 sur le mainnet** (sans cohortes). Fin de la migration MIP-8 Phase C. « Category Labs will unveil new privacy infrastructure at Open on October 6. » | TIERS |
| Docs https://docs.monad.xyz/developer-essentials/changelog/releases.md | v0.16.3 et v0.16.4 : **aucun changement de protocole ni de révision** (toujours `MONAD_TEN`). Seuls changements côté RPC : `get_storage_at` routé selon MIP-8, `InvalidParams` sur un filtre mal formé. Rien qui touche nos contrats. | DOC |
| `web3_clientVersion` | mainnet `rpc.monad.xyz` → **Monad/0.16.4** ; testnet → **Monad/0.16.3**. Concorde avec https://docs.monad.xyz/networks.json. | MESURÉ |
| https://docs.monad.xyz/ai/current-facts.md | **Block time 300 ms (observé sur le mainnet), « mean block time was about 302 ms in September 2026 »**, finalité 600 ms (2 slots), limite de gas par bloc 150 M, par tx 30 M. La même page indique encore v0.16.1 / v0.16.2 (périmé, comme déjà noté). | DOC |
| Envio, « Developer Update September 2026 » | Rappelle le bounty à 1 k$ et les 5 k$ d'Envio Cloud. Rien de neuf sur les tarifs HyperSync / HyperRPC. | DOC (Envio) |

Le point de CLAUDE.md §7, « Temps de bloc 0,3 s ou 0,4 s selon la doc (non tranché) », est **tranché par la doc : 300 ms, 302 ms en moyenne en septembre**, ce qui concorde avec notre mesure du 27/09.

## 5. Nouveaux projets concurrents (track 04 et bounty MetaMask)

Liste repérée par une recherche GitHub sur « metropolis monad » poussés après le 27/09 (45 dépôts). Statut TIERS, READMEs lus le 05/10.

- **norbert351/merit** (créé le 02/10) : « Sybil-resistant, settled-money-weighted agent reputation… (Metropolis Track 04) ». Score calculé seulement sur l'argent réglé via x402, clusters Sybil mis à zéro, plafond d'autorité. 13 tests, aucun contrat on-chain annoncé. **C'est l'angle le plus proche d'ANCRE apparu à ce jour**, version « preuve de paiement ». CLAUDE.md §6 rappelle pourquoi ça ne suffit pas : la ferme d'Eve payait.
- **zakyirsyaad/monagent** (créé le 04/10) : voir §0, point 7.
- nickthelegend/xorr-metropolis : propose aussi un plugin `mm`, mais pour du trading (Perpl), donc piste track 01.
- AmitChowdary122/attest8004 (track 04, couche Validation ERC-8004 + passkey, commencé le 02/10) ; nel349/pod (track 04) ; zuemen/agent-passport ; santittan07/TrustAI-Oracle-Monad ; catchmeifyoucaan/witness (compte P256, track 04). Ce sont les clones déjà attendus.
- Planckify-Labs/monad-submission : vidéo « Technical Demo (3 min) » et « Mandatory disclosure under **Section 4.1 Clause 4** of Metropolis Hackathon Rules ». **Deuxième source tierce indépendante** pour la déclaration IA obligatoire et la vidéo de 3 min.

## 6. Bilan par hypothèse

| Hypothèse (NON CONFIRMÉE au 27/09) | État au 05/10 |
|---|---|
| Inscriptions closes le 06/10 | **Toujours TIERS, une seule source (22/09).** Rien de contraire. Agir comme si c'était vrai. |
| Formulaire ouvert le 02/10 | **Confirmé par un tiers le 05/10** (il l'a utilisé). |
| Clôture le 13/10 23:59 ET = 14/10 05:59 Paris | **Confirmé (DOC)** par le compte à rebours de la plateforme. Aucune prolongation. |
| Vidéo ≤ 3 min | TIERS, avec désormais deux sources (precious-akpan, Planckify). La modale n'a pas été relue par nous. |
| Dépôt public OSI | **Toujours en conflit** : la page officielle dit « encouraged but not required » (DOC, inchangé), les Rules citées disent obligatoire (TIERS, inchangé). Décision de Hugo toujours requise. |
| 5 critères à 20 % | TIERS, inchangé. La plateforme confirme seulement que jurys de track et jurys de bounties sont **distincts** (DOC). |
| Mainnet ou testnet acceptés | TIERS, inchangé. |
| Cumul track + bounties, nombre de bounties | **Confirmé (DOC)** : cumul autorisé, « as many bounties as your project earns ». |
| Bounty MetaMask éligible en track 04 | **Fragilisé (DOC)** : « Each one names its track, and the ones marked All tracks pair with any ». Envio et Mera sont « toutes tracks » (fiches du 27/09) ; MetaMask ne l'est pas. |

## 7. Actions qui en découlent (pour Hugo, rien n'a été fait)

1. **Avant le 06/10** : se connecter, créer l'équipe et le projet (track 04), et recopier la modale Rules dans le dépôt.
2. **Poster deux questions sur le forum de support** (réponse en ~90 min observée), puis relire les fils :
   - « The Best Agent Wallet Plugin bounty is labelled Onchain Finance & Trading. Can a Track 04 project claim it? »
   - « Is a separate demo video per bounty allowed (MetaMask asks for ≤ 5 min, the main video is ≤ 3 min)? »
3. Ouvrir le formulaire de soumission pour lire les **champs propres à chaque bounty**, puis déposer une soumission complète « d'assurance ».
4. Publier une **progress update** (elle donnerait accès aux mentors, TIERS).
5. Geler les investissements sur le plugin MetaMask (chantier 05) tant que le point 2 n'a pas de réponse.
6. Mettre à jour CLAUDE.md §7 (temps de bloc tranché, 300 ms) et `bounties-sponsors.md` (BlockVision, PingBusiness, conditions d'Envio Cloud, jurys distincts) : à faire dans un commit séparé, sur décision de Hugo.

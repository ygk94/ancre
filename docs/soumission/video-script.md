# Vidéo de soumission — script plan par plan (3:00 au plus)

> Rédigé le **2026-10-06** par la session du chantier 09. Base : storyboard de 2:55 (`docs/ressources/design-demo-et-soumission.md` §3), amendé par **D51** (3 minutes, 2ᵉ saut de 12 s, override hors vidéo), **D50** (2ᵉ saut), **D45** (la ferme se paie vraiment), **D53** (plugin 6 s au plus, hors bounty), **D52** (ordre de coupe), **D29** (scanner jamais présenté comme attaquant), **D33** (veto lu en direct), **D55** (Transfers API d'Alchemy).
> Règle (NON CONFIRMÉE, modale v3.0 lue par un tiers) : **3 minutes au plus**, vidéo publique (YouTube, Loom ou Vimeo), qui montre **le produit qui tourne et des interactions avec Monad**, pas des maquettes ni des diapositives.
> Voix en anglais. Cadence cible ≤ 2,6 mots par seconde (contrôlée par script, colonne « mots/s »). **Durée totale : 2:54**, soit 6 s de marge.

## Règles de tournage

1. **Chaque chiffre affiché porte sa date et sa source en petit** (ex. « snapshot 28 Sep 2026 · block 108,835,675 · solver/out/mainnet.md »).
2. **Réseau toujours affiché** : badge « Monad mainnet (143) » ou « Monad testnet (10143) ». L'acte 2 tourne sur le **testnet**, avec une exécution minimale sur le mainnet (D40, D51) : ne jamais laisser croire que l'acte 2 est sur le mainnet s'il ne l'est pas.
3. **Rien de faux en « live »** : si un plan vient du mode rejeu, le bandeau « REPLAY of blocks N…M, recorded 2026-10-xx » reste visible tout le plan.
4. **Le niveau du certificat est nommé à l'écran** : « Registry-verified ».
5. **Le scanner** apparaît sous `0xa06f…43a4`, sans nom de projet, avec la légende « automated risk-screening service ».
6. **Aucun plan ne montre l'override humain** (D51 : README seulement), ni un concurrent, ni son outil.
7. **Le temps se dit en blocs** (« block N + 1 »), les millisecondes ne sont qu'une mesure locale affichée à côté.
8. Plan 4 : **variante B par défaut**. La variante A (#8317) n'est tournée **que si la divulgation (D29) est faite** (`publication-checklist.md` §2.1).

## Plans

| # | Temps | Durée | À l'écran | Texte dit (EN) | Mots/s |
|---|---|---|---|---|---|
| 1 | 0:00-0:10 | 10 s | Terminal, mainnet. `cast call … getSummary(182, $(getClients 182), "", "")` → **1.526e36**. Puis `getSummary(182, [], "", "")` → `execution reverted: clientAddresses required` (commandes du README §5) | "Should a contract pay this agent? Its average rating on Monad: ten to the thirty-six. Without a list of trusted raters, the standard won't even answer." | 2,60 |
| 2 | 0:10-0:28 | 18 s | Écran, acte 1, onglet Eve. À gauche : **1.526 × 10³⁶**, 7,665 ratings, 117 at 1e38. Bandeau « 83 % of all 9,283 ratings point to one agent ». À droite : ancres `0x0730…`, `0xf7d5…`, α = 1/3, masse sur la région de la ferme (**7,666 agents**) = **0**, e = 15 wei, « Registry-verified » | "Eve-8004: seven thousand six hundred ratings, eighty-three percent of the whole registry, from agents created at three hundred an hour. ANCRE, anchored on two independent raters: its trust is zero. Not low. Zero." | 1,83 |
| 3 | 0:28-0:44 | 16 s | Onglet scanner (`0xa06f…43a4`, « automated risk-screening service »). Interrupteur « measurements as trust » activé : **34.6 %** de sa masse passe dans la ferme (flèches). Désactivé (schéma de référence) : **0** | "This address is an automated risk-screening service. Read its scores as trust, and a third of its trust leaks into the farm. ANCRE's schema keeps measurements apart from endorsements: the leak is zero." | 2,06 |
| 4B | 0:44-0:54 | 10 s | Panneau « why zero? » : `alchemy_getAssetTransfers` sur le premier financement des noteurs d'Eve → **150 / 150** financés par `ownerOf(182)`, **11.0 MON** chacun (échantillon aléatoire) | "And who paid the raters? Of a hundred and fifty we sampled, every one was funded by Eve's own owner. ANCRE never needed to know." | 2,50 |
| *4A* | *0:44-0:54* | *10 s* | *Seulement si D29 est faite.* Onglet #8317 : 78 avis, un seul noteur = son propre `agentWallet`. « accepted by the registry: 78 » → « edges in ANCRE: 0 » | *"Agent 8317 rated itself seventy-eight times, from its own agent wallet. The registry accepted every one. ANCRE keeps none."* | *1,90* |
| 5 | 0:54-1:02 | 8 s | Bandeau d'honnêteté : « honest graph on mainnet: **[N] edges · [M] nodes** (snapshot [date]) ». Transition vers l'acte 2, badge **« Monad testnet (10143) »** | "The honest graph on mainnet is just a handful of edges, so act two is our own traffic, on testnet." | 2,50 |
| 6 | 1:02-1:20 | 18 s | Acte 2. Trois ancres, des fournisseurs, notre ferme scriptée **qui paie vraiment sa cible** (compteur « receipts: [K] / [K] genuine »). La moyenne naïve de la cible monte en direct ; colonne ANCRE : 0. Fil du payeur : paiement x402 → **REFUSED (below threshold)**, hash de tx, badge d'état | "Our own Sybil farm pays its target for real: every receipt is genuine. Its average climbs. Its ANCRE trust stays at zero, and our payer contract refuses the payment on-chain. A receipt can be true and still come from a farm." | 2,28 |
| 7 | 1:20-1:33 | 13 s | Une ancre compromise (clé « volée », script étiqueté demo) approuve la ferme. Sa colonne s'allume ; `trustRobust` (leave-one-out, m = 2) reste à 0. **REFUSED** | "Now one anchor's key is stolen, and it endorses the farm. Trust is counted leaving any single anchor out, so one key can't make us pay. Still refused." | 2,15 |
| 8 | 1:33-1:45 | 12 s | **2ᵉ saut (D50)**. Graphe : ancres A et B → **H1** ; H1 → **H2**. Encadré : « rated by an anchor: no ». Colonne « one-hop trusted list » : H2 = **unknown** ; colonne ANCRE : H2 = **[t]**, au-dessus de θ → **PAID**, hash de tx | "Here's what a list of trusted raters can't do. No anchor ever rated this provider. Two anchors vouch for H1, H1 vouches for it, and it gets paid." | 2,33 |
| 9 | 1:45-2:10 | 25 s | **Disjoncteur**. Une ancre poste `slash` sur un fournisseur jusque-là payé. Chronologie en blocs : slash au bloc **N**, badges Proposed → Voted → Finalized ([ms] mesurées). Paiement suivant au bloc **N + 1** : **REFUSED — VETOED**. Puis, 5 s : un `+1` posté **par un autre noteur** ne lève pas le veto (D33) | "A provider goes bad, and an anchor slashes it. Watch the blocks: slash in block N, final in under a second. The very next payment, block N plus one: refused, vetoed. No recertification: the veto is read live from the registry. A plus-one from someone else doesn't lift it." | 1,96 |
| 10 | 2:10-2:28 | 18 s | Page du draft d'ERC (titre, Abstract), puis panneau « certificate » : **Registry-verified**, `certBlock`, gas du certificat ([G] gas, [X] MON), gas d'une décision. Adresses des contrats sur l'explorateur | "ANCRE implements a chain-agnostic draft ERC. This certificate is Registry-verified: the contract re-read every edge from the registry and accepted the trust only as a proven lower bound. On Monad that fits in one transaction, so we recertify on every graph change." | 2,33 |
| 11 | 2:28-2:46 | 18 s | Trois vignettes de 6 s : (a) `schema.graphql` d'Envio et une requête GraphQL sur 3 chaînes, une `Discrepancy` d'audit ; (b) **Mera** : variante A, iPhone, Face ID, `rotateBySig` → le veto volé ne compte plus au bloc suivant ; variante B, coffre rouvert sur un 2ᵉ appareil, `keccak(clair) == feedbackHash` ; (c) terminal `mm ancre pay …` → refus **avant** signature (**6 s au plus**, D53) | "Envio indexes the graph on three chains and audits every certificate. A stolen anchor key is rotated from a passkey on a second device, with Mera. And the agent's wallet plugin refuses before it signs." *(variante B de Mera : "The evidence behind a veto is sealed in a Mera passkey vault, and reopened on a second device.")* | 1,94 |
| 12 | 2:46-2:54 | 8 s | Carte finale : nom, tagline, URL du dépôt, adresses, « Monad mainnet & testnet » | "The standard leaves Sybil filtering to the reader. ANCRE is that reader, and it refuses to pay." | 2,12 |

**Total : 2:54** (174 s).

## Écarts au storyboard de 2:55, et pourquoi

| Écart | Raison |
|---|---|
| **+ plan 8, 2ᵉ saut (12 s)** | D50, D51 : c'est le seul plan qu'aucune liste de confiance à un saut ne peut reproduire (veille du 05/10). H1 est approuvé par **deux** ancres, sinon le leave-one-out échoue (AM-10.6) |
| Plan 4 : variante B (financement de la ferme, Alchemy) par défaut, #8317 en variante | #8317 décrit le contournement du garde-fou : dépend de la divulgation (D29). Le fait D55 (150/150) est mesuré, sans risque, et sert le bounty Alchemy |
| Plan 5 : « a handful of edges », chiffre au tournage | D51 demandait « honest graph: 3 edges ». La mesure courante dit **5 arêtes, 6 nœuds** (filtre `core`) ou 11 arêtes (filtre `reference`), `solver/out/mainnet.md` §0, §d. Le « 3 » date d'avant D20 (CLAUDE.md §3). On dit « a handful » et on **affiche** le chiffre recalculé |
| Plan 5 : « on testnet » | D40, D51 : acte 2 sur le testnet, plus une exécution minimale sur le mainnet. Le storyboard disait « on mainnet » |
| Plan 6 : la ferme se paie vraiment | D45 : « 100 % de reçus vrais, masse nulle, `passesAnchorPolicy` refuse » ; l'ancienne version ne le montrait pas |
| Plan 9 : « final in under a second » au lieu de « voted three hundred milliseconds later » | les 300 ms venaient du testnet (vault, 15/09). À remplacer par la mesure du jour **seulement si** elle est confirmée ; sinon garder la formulation prudente |
| Plan 10 : coût du certificat non dit à voix haute | le chiffre de 0,084 MON du storyboard date d'avant Registry-verified ; le vrai coût (≈ 1,5 MON pour 300 arêtes, ≈ 0,1 MON pour le graphe réel) se montre à l'écran, il ne se vend pas comme « bon marché » |
| Plan 11 : plugin réduit à 6 s, sans « MetaMask » dans la voix | D53 : hors bounty. « wallet plugin » suffit ; le nom s'affiche à l'écran |
| Override humain absent | D51 : dans le README seulement |
| Plan 3 : « a third » au lieu de « thirty-five percent » | plus facile à dire ; 34,6 % reste affiché à l'écran |

## Ordre de coupe si ça déborde (D52, appliqué à ce script)

1. Vignette Mera (plan 11b) si la porte P4 a échoué et que le coffre n'est pas prêt.
2. Vignette du plugin (plan 11c).
3. Plan 4.
4. La phrase « A plus-one from someone else… » du plan 9.

**Jamais coupés** : plans 2 (acte 1), 6 (ferme refusée), 7 (ancre compromise), 8 (2ᵉ saut), 9 (disjoncteur).

## Chiffres à recalculer le jour du tournage

| Plan | Chiffre | Valeur actuelle | Commande ou source |
|---|---|---|---|
| 1 | moyenne naïve d'Eve, nombre de clients | 1.526e36, 7 665 (bloc 110 993 179, 06/10) | README §5 (`cast`) |
| 2 | total d'avis, part d'Eve, région de la ferme, masse, e | 9 283 ; 83 % ; 7 666 ; 0 ; 15 wei (snapshot du 28/09) | `solver/run_mainnet.py` après le snapshot rafraîchi (04-bis) |
| 3 | fuite du scanner sans / avec D15 | 34,6 % → 0 | `solver/out/mainnet.md` §b |
| 4B | noteurs financés par l'owner | 150 / 150, 11,0 MON (06/10) | script Transfers API (D55, à committer) |
| 4A | auto-notations de #8317 | 78 | `solver/out/mainnet.md` §c, après D29 |
| 5 | arêtes et nœuds du graphe honnête | 5 arêtes, 6 nœuds (`core`) | `solver/out/mainnet.md` §0 et §d |
| 6 | taille de la ferme, reçus vrais, hash du refus | — | runbook du chantier 06 |
| 7 | `trustRobust` de la cible avec l'ancre compromise | — | chantier 06, scène 3 |
| 8 | t(H1), t(H2), θ, hash du paiement | — | vecteur « 2ᵉ saut » (04-bis) et scène 06 |
| 9 | blocs N et N + 1, latences Proposed / Voted / Finalized | testnet 15/09 : Voted ≈ 300 ms, Finalized ≈ 582 ms (vault, non vérifié sur le mainnet) | écran 07, journal de session |
| 10 | gas du certificat de démo et coût en MON au prix du jour ; gas d'une décision | 14 974 802 gas (01/10) ; 29 231 à 165 888 | `contracts/GAS.md` après 02-bis ; `cast gas-price` |
| 10, 12 | adresses des contrats | — | déploiement 02 (README §7) |
| 11a | chaînes indexées, entités d'audit | 3 chaînes | GraphQL Envio Cloud |

## Après le tournage

- Durée réelle ≤ **3:00** (vérifier le fichier exporté, pas la timeline).
- Mise en ligne **publique** (non répertoriée ? règle NON TROUVÉE : préférer « publique »).
- Sous-titres anglais (les jurés regardent souvent sans le son) : générer à partir de la colonne « Texte dit ».
- Coller le lien dans la soumission, le README (en tête) et le profil.

## Vidéos de bounty facultatives (si la plateforme les accepte)

- **Alchemy** (2 minutes au plus, facultative selon la fiche) : 0:00-0:20 le problème (plan 1) ; 0:20-1:00 webhook → recertification, horodatage de l'event et du certificat en blocs ; 1:00-1:40 panneau « why zero? » (Transfers API) ; 1:40-2:00 carte. **Seulement si D55 est livrée.**
- **Envio** et **Mera** : la vidéo principale suffit si les plans 11a et 11b sont nets ; sinon 60 s chacun, montés à partir des mêmes prises.

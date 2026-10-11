# Les deux vidéos de la soumission : pitch (2 min) et démo (3 min)

> Écrit le **2026-10-11** par la session pilote. Ce fichier remplace le découpage de `demo/VIDEO-SHOTS.md`, qui reste la référence pour le détail des états d'écran et la **checklist d'honnêteté** : relis-la avant chaque prise.
>
> **Format (Hugo, 11/10)** :
> - **Pitch, 2:00 au plus** : les slides Figma avec ta caméra (https://www.figma.com/slides/VjxdyFjgY3HldMFZKx5Ug5).
> - **Démo, 3:00 au plus** : seulement l'écran, avec ta voix par-dessus.
>
> **Règle §9.4** : la vidéo de démo montre le produit **en fonctionnement réel**, sans maquette ni slides, avec des interactions Monad visibles. **Aucune slide dans la démo**, même pas en carte de fin.
>
> Voix en anglais, notes de réalisation en français. Viser **1:50** pour le pitch et **2:50** pour la démo.

---

## Vidéo 1 : pitch (slides et caméra, 1:50)

Le pitch répond à trois questions : quel problème, pourquoi c'est nouveau, pourquoi ça compte. La démo prouve le reste. Ton texte, à environ 150 mots par minute :

| Slide | Temps | Voix |
|---|---|---|
| 1 · ANCRE | 0:00-0:12 | "Hi, I'm Hugo. This is ANCRE. AI agents are starting to pay each other, and before an agent pays, someone has to answer one question: can I trust this agent? ANCRE lets the paying contract answer it, and refuse." |
| 2 · 83 % | 0:12-0:32 | "Agents get their reputation from ERC-8004, the standard registry. Anyone can rate any agent, for free, and the standard explicitly leaves Sybil filtering to the reader. Here is what that gives on Monad mainnet today: eighty-three percent of all ratings point to a single agent, with an average of ten to the thirty-six. Only eleven ratings out of nine thousand are usable trust." |
| 3 · 150/150 | 0:32-0:47 | "The usual fix is to count only paid ratings. It doesn't work: the farm really paid. Every rater we sampled got its first MON from the same address, eleven MON each. A receipt can be true and still come from a farm." |
| 4 · L'idée | 0:47-1:10 | "So ANCRE asks a different question: does anyone you trust vouch for this agent? You pick a few anchors. Trust flows from them through the rating graph, personalized PageRank, even two hops away. A farm that only rates itself gets exactly zero, because nothing flows in from your anchors. And we leave the largest anchor out of every score, so one stolen key is never enough." |
| 5 · Le contrat refuse | 1:10-1:30 | "The result is a certificate checked on-chain against the registry, and it's read by the contract that pays, before every x402 payment. The refusal isn't in an interface you can bypass, it's in the payer's signature. And an anchor's veto is read live: on Monad, the next payment is refused one block later, three hundred and thirty-two milliseconds." |
| 6 · Running for real | 1:30-1:50 | "This isn't a mock-up. It runs on Monad testnet and mainnet with real transactions. Envio indexes the registries and audits every certificate, Alchemy triggers recertification on each new rating. And ANCRE is the reference implementation of a draft ERC: the layer ERC-8004 leaves to the reader, made a standard. The demo shows it working." |

Si tu dépasses 2:00, raccourcis d'abord la slide 3 en ne gardant que la dernière phrase, puis la fin de la slide 6.

---

## Vidéo 2 : démo (écran seul, voix par-dessus, 2:50)

**Préparation :**
- Chrome en 1920×1080, zoom 100 %, thème clair, sur **https://ancre-xyz.netlify.app** (le site public).
- Les indices `at=` correspondent au run **testnet du 07/10** (`run-20261007T131141Z`) que l'écran affiche. Vérifie-les avec le compteur `n/121` en haut de la Live demo avant la prise.
- Pour D8 : le récepteur Alchemy tourne en mode réel, et la commande `node trigger.ts --send --keystore ~/.foundry/keystores/ancre-demo` est prête dans un terminal (depuis `demo/`).
- Pour D1 : un terminal avec `cast` et la commande `getSummary` de `README.md` §5.

| # | Temps | À l'écran | Voix |
|---|---|---|---|
| D1 | 0:00-0:12 | Terminal : `getSummary(182, all clients)` donne **1.5e36**, puis `getSummary(182, [])` **revert** | "Monad mainnet, the ERC-8004 registry. This agent's average rating is ten to the thirty-six. And the standard won't even compute it without a list of raters you trust." |
| D2 | 0:12-0:30 | **Discover**, réseau **Monad mainnet**. Le tableau des refusés : **Eve-8004, 7,665 ratings → 0** | "This is ANCRE's screen: the layer we want to add to explorers like 8004scan. They list every agent. We show which ones are reachable from anchors you choose. Eve: seven thousand six hundred ratings. Zero." |
| D3 | 0:30-0:45 | Clic sur **Eve-8004**, onglet **Ratings** (« 0 of 7,665 carry weight »), puis le panneau **« Who funded the raters? »** | "Every rating is accounted for, and none comes from anyone your anchors reach. The panel shows why, through Alchemy's Transfers API: the raters were all funded by the same address." |
| D4 | 0:45-0:55 | Sélecteur d'ancres : **« A risk screener read as trust »** (34.56 % de fuite vers la ferme), puis **« Same screener, schema D15 »** (0) | "If you read an automated risk scanner as trust, a third of its mass leaks into the farm. ANCRE separates measurements from endorsements: zero." (premier plan à couper) |
| D5 | 0:55-1:10 | Réseau **Monad testnet**, Discover : provider-1 et provider-3 passent, la cible de la ferme est refusée. Clic sur **provider-3**, onglet **Trust path** | "On testnet we run our own agents. Provider-3 was never rated by an anchor, only by a provider they trust, and it still passes. That's trust beyond one hop, with a Sybil bound." |
| D6 | 1:10-1:30 | **Live demo**, `at=87` → `at=90` : la cible de la ferme affiche **100** dans l'explorateur et **0** chez ANCRE, **Refused · UNTRUSTED**. Ensuite l'ancre C, compromise, l'endosse : toujours refusée | "The payer is a contract that asks ANCRE before every x402 payment. The farm pumps its target to a hundred: refused. Now one anchor is compromised and vouches for it. Trust is computed leaving any one anchor out: still refused." |
| D7 | 1:30-1:50 | `at=106` → `at=111` : provider-2 est **Paid**, l'ancre B le sanctionne (slash), puis le paiement suivant est **Refused · ANCRE_STATUS**. Encadré du disjoncteur : **1 block, 260 ms** | "A provider goes bad and an anchor slashes it. The very next payment is refused: one block, two hundred and sixty milliseconds on Monad testnet. No recertification needed: the veto is read live." |
| D8 | 1:50-2:15 | **En direct, écran partagé** : à gauche le terminal `node trigger.ts --send`, à droite la console du récepteur (webhook → `submitCertificate` → `TIMELINE`). Ensuite le feed de l'écran, onglet **ANCRE**, où le nouveau certificat apparaît | "Live now: an anchor rates an agent. Alchemy's webhook pushes the event to our certifier in about a second, and a new certificate lands on-chain a few seconds later. Then our Envio indexer audits it against the registry. Clean." |
| D9 | 2:15-2:27 | `at=118` → `at=120`, ou la page agent, onglet **Certificates** : **rejected · EdgeMismatch** | "A forged certificate fails: every edge is re-read in the ERC-8004 registry at submission." |
| D10 | 2:27-2:45 | Réseau **Monad mainnet**, agent **#10330**, encadré « READ ON-CHAIN », onglets **Payments** et **Certificates**. Clic sur le lien **monadscan** du paiement réglé `0xa099…a60c` | "And on Monad mainnet: the same contract, a real x402 payment settled by the facilitator, then refused after a veto, three hundred and thirty-two milliseconds later. Every address and transaction is in the repo." |
| D11 | 2:45-2:50 | Le README sur GitHub, section « Deployed addresses » (pas de slide) | "ANCRE: the reader ERC-8004 asks for, and it refuses to pay." |

**Ordre de coupe**, si la prise dépasse 2:55 :
1. D4 ;
2. la fin de D3 (le panneau Alchemy, qui a sa propre vidéo) ;
3. D9 ;
4. D8 raccourci à l'apparition du certificat dans le feed.

**Ne jamais couper** D2, D6 et D7 : la ferme refusée, l'ancre compromise et le disjoncteur (D52). Garde aussi au moins une interaction Monad réelle visible, D8 ou D10 (§9.4).

---

## Ce qu'il faut dire tel quel, et ce qu'il ne faut jamais dire

- **Les latences** : dis seulement celles affichées et mesurées en vrai, soit 260 ms sur le testnet le 07/10 et 332 ms sur le mainnet le 10/10. Jamais une latence de fork.
- **Les chiffres mainnet de Discover** viennent du solveur de référence, étiquetés « COMPUTED », sauf l'encadré on-chain de #10330 et #182. Ne dis pas « certified » pour un chiffre du solveur.
- **Le garde-fou du registre et les registres upgradables** (D57) : si tu en parles, présente-les comme des faits on-chain publics (« the registry's self-rating guard checks the owner, not the agent wallet »). Jamais comme une attaque, et sans nommer personne.
- **Les adresses de tiers**, comme l'owner d'Eve ou le scanner, sont des faits on-chain : pas d'accusation, et pas d'adresse lue à voix haute.
- **Le plugin MetaMask** : pas dans les vidéos (D53).
- **L'override humain** : pas dans les vidéos, seulement dans le README (D51).

## Les vidéos des bounties (une minute chacune)

- Alchemy : `docs/soumission/video-alchemy.md`. Le plan D8 peut être tourné une seule fois et réutilisé.
- Envio : `docs/soumission/video-envio.md`.

Ces deux vidéos doivent aussi montrer le produit, pas des slides. Leur carte de fin passe en simple écran du README.

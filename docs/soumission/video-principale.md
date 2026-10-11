# Les deux vidéos de la soumission : pitch (2 min) et démo (3 min)

> Écrit le **2026-10-11** par la session pilote. Ce fichier remplace le découpage de `demo/VIDEO-SHOTS.md`, qui reste la référence pour le détail des états d'écran et la **checklist d'honnêteté** : relis-la avant chaque prise.
>
> **Format (Hugo, 11/10)** :
> - **Pitch, 2:00 au plus** : les slides Figma avec ta caméra (https://www.figma.com/slides/VjxdyFjgY3HldMFZKx5Ug5).
> - **Démo, 3:00 au plus** : seulement l'écran, avec ta voix par-dessus.
>
> **Règle §9.4** : la vidéo de démo montre le produit **en fonctionnement réel**, sans maquette ni slides, avec des interactions Monad visibles. **Aucune slide dans la démo**, même pas en carte de fin.
>
> Voix en anglais, notes de réalisation en français. Viser **1:35** pour le pitch et **2:50** pour la démo.

---

## Vidéo 1 : pitch (slides et caméra, 1:35)

Ta trame (11/10) : qui tu es, le problème, « payer ne suffit pas », ce que fait ANCRE, le résultat, pourquoi Monad et les outils. Environ 240 mots, soit **1:35** à 150 mots par minute : tu gardes 25 s de marge sous les 2:00. Les temps de la colonne sont indicatifs.

| Slide | Temps | Voix |
|---|---|---|
| 1 · ANCRE | 0:00-0:10 | "Hi, I'm Hugo Thomas from Devinci Blockchain, and today I'm presenting my submission: ANCRE. When you want to answer the question *can I trust this agent?*, you use ERC-8004, the agent reputation registry." |
| 2 · 83 % | 0:10-0:22 | "But on Monad mainnet, I found a farm of good ratings: eighty-three percent of all ratings, seven thousand six hundred out of nine thousand three hundred, point to one single agent, with an average score of ten to the thirty-six." |
| 3 · 150/150 | 0:22-0:35 | "ERC-8004 ratings are free, so you might think: just count the paid ones. That doesn't work, the farm paid. In a random sample of a hundred and fifty raters, every single one got its first MON from the same address. Paying doesn't stop a farm." |
| 4 · L'idée | 0:35-0:50 | "So I built ANCRE. You choose a few anchors you trust, and ANCRE measures how much of their trust reaches each agent through the rating graph: a farm that only rates itself gets exactly zero." |
| 5 · Le contrat refuse | 0:50-1:05 | "That result is certified on-chain, and the contract that pays reads it before every x402 payment. On Monad mainnet, the farm's agent was refused, an honest provider was paid, and an anchor's veto blocked the next payment one block later: three hundred and thirty-two milliseconds." |
| 6 · Why Monad | 1:05-1:22 | "Why Monad? A check before every payment only makes sense with fast blocks and cheap verification, and the agent registry and x402 are already live here. ANCRE uses ERC-8004, x402, Envio to index and audit every certificate, and Alchemy webhooks to recertify on each new rating. So ERC-8004 tells you who rated an agent; ANCRE tells your contract whether to pay it. Let me show you, live, in the demo." |

Les chiffres dits viennent des slides : 7 665 sur 9 283 avis (bloc 108 835 675, 28/09, recompté par Envio le 10/10), 150/150 (Alchemy Transfers API, 10/10), 332 ms (mainnet, 10/10). Ne dis pas « the owner » : dis « the same address » (fait on-chain, sans accusation).

---

## Vidéo 2 : démo (écran seul, voix par-dessus, 2:50)

### Mise en place (10 min avant)

Le terminal occupe la **moitié gauche** de l'écran, Chrome la **moitié droite** (ou en plein écran pour les plans sans terminal). Tu enregistres l'écran entier, en 1920×1080, avec le thème clair de Chrome.

**Les onglets de Chrome, à ouvrir dans cet ordre** (un onglet par plan, tu passes à l'onglet suivant avec ⌘⌥→) :

| Onglet | URL | Plan |
|---|---|---|
| 1 | https://ancre-xyz.netlify.app/?network=mainnet | D2 |
| 2 | https://ancre-xyz.netlify.app/agent/mainnet/182?tab=ratings | D3 |
| 3 | https://ancre-xyz.netlify.app/agent/mainnet/182 (faire défiler jusqu'au panneau « Who funded the raters? ») | D3 |
| 4 | https://ancre-xyz.netlify.app/?network=mainnet&anchors=screener-as-trust | D4 |
| 5 | https://ancre-xyz.netlify.app/?network=mainnet&anchors=screener-d15 | D4 |
| 6 | https://ancre-xyz.netlify.app/ (testnet) | D5 et D8 (le feed) |
| 7 | https://ancre-xyz.netlify.app/agent/testnet/2052?tab=path | D5 |
| 8 | https://ancre-xyz.netlify.app/live?at=87 | D6 |
| 9 | https://ancre-xyz.netlify.app/live?at=106 | D7 |
| 10 | https://ancre-xyz.netlify.app/live?at=118 | D9 |
| 11 | https://ancre-xyz.netlify.app/agent/mainnet/10330?tab=payments | D10 |
| 12 | https://monadscan.com/tx/0xa099331e10ae31327e54d53b78a3c24277e140f235fe2373f33946d06853a60c | D10 |

Recharge chaque onglet juste avant la prise : `at=` ne s'applique qu'au premier chargement. Dans la Live demo, la touche **→** avance d'un événement, et le compteur `n/121` en haut te dit où tu en es.

**Le terminal, 3 onglets :**
1. **D1**, prêt à taper (ou à coller) :
   ```bash
   export PATH="$PATH:$HOME/.foundry/bin"; R=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63; RPC=https://rpc1.monad.xyz
   C=$(cast call $R "getClients(uint256)(address[])" 182 --rpc-url $RPC)
   cast call $R "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 182 "$C" "" "" --rpc-url $RPC
   cast call $R "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 182 "[]" "" "" --rpc-url $RPC
   ```
   Lance la ligne `C=$(…)` **avant** l'enregistrement : elle met quelques secondes. Pendant la prise, tu ne lances que les deux `getSummary`.
2. **D8, le récepteur Alchemy** en mode réel, déjà lancé (commande dans le MUSTDO). Il affiche ses lignes au fil des événements.
3. **D8, le déclencheur**, dans `demo/`, prêt à lancer :
   ```bash
   cd /Users/hugo/Projet/ancre/demo && node trigger.ts --send --keystore ~/.foundry/keystores/ancre-demo
   ```
   Il demande une phrase puis ton mot de passe : **tape-les avant de lancer l'enregistrement**, ou coupe ce passage au montage.

### Plans

| # | Temps | Où | Ce que tu fais | Voix |
|---|---|---|---|---|
| D1 | 0:00-0:12 | Terminal, onglet 1 | Lance le 1er `getSummary` : **1.5e36**. Puis le 2ᵉ : **revert** | "Monad mainnet, the ERC-8004 registry. This agent's average rating is ten to the thirty-six. And the standard won't even compute it without a list of raters you trust." |
| D2 | 0:12-0:30 | Chrome, onglet 1 | Montre le tableau des refusés : **Eve-8004, 7,665 ratings → 0** | "This is ANCRE's screen: the layer we want to add to explorers like 8004scan. They list every agent. We show which ones are reachable from anchors you choose. Eve: seven thousand six hundred ratings. Zero." |
| D3 | 0:30-0:45 | Onglets 2, puis 3 | Onglet 2 : « 0 of 7,665 carry weight ». Onglet 3 : le panneau **Who funded the raters?** | "Every rating is accounted for, and none comes from anyone your anchors reach. The panel shows why, through Alchemy's Transfers API: the raters were all funded by the same address." |
| D4 | 0:45-0:55 | Onglets 4, puis 5 | Onglet 4 : **34.56 %** de fuite vers la ferme. Onglet 5 : **0** | "Read an automated risk scanner as trust, and a third of its mass leaks into the farm. ANCRE separates measurements from endorsements: zero." *(premier plan à couper)* |
| D5 | 0:55-1:10 | Onglets 6, puis 7 | Onglet 6 : provider-1 et provider-3 passent, la cible de la ferme est refusée. Onglet 7 : le **Trust path** de provider-3 | "On testnet we run our own agents. Provider-3 was never rated by an anchor, only by a provider they trust, and it still passes. That's trust beyond one hop, with a Sybil bound." |
| D6 | 1:10-1:30 | Onglet 8 | La cible de la ferme : **100** dans l'explorateur, **0** chez ANCRE, **Refused · UNTRUSTED**. Puis **→** jusqu'à `90` : l'ancre C, compromise, l'endosse, et le paiement est encore refusé | "The payer is a contract that asks ANCRE before every x402 payment. The farm pumps its target to a hundred: refused. Now one anchor is compromised and vouches for it. Trust is computed leaving any one anchor out: still refused." |
| D7 | 1:30-1:50 | Onglet 9 | **→** de `106` à `111` : provider-2 est **Paid**, l'ancre B le sanctionne (slash), puis **Refused · ANCRE_STATUS**, et l'encadré du disjoncteur affiche **1 block, 260 ms** | "A provider goes bad and an anchor slashes it. The very next payment is refused: one block, two hundred and sixty milliseconds on Monad testnet. No recertification needed: the veto is read live." |
| D8 | 1:50-2:15 | Terminal, onglets 3 et 2, puis Chrome, onglet 6 | Lance le déclencheur. Dans la console du récepteur : webhook, puis `submitCertificate`, puis `TIMELINE`. Puis l'onglet 6, feed, onglet **ANCRE** : le nouveau certificat | "Live now: an anchor rates an agent. Alchemy's webhook pushes the event to our certifier in about a second, and a new certificate lands on-chain a few seconds later. Then our Envio indexer audits it against the registry. Clean." |
| D9 | 2:15-2:27 | Onglet 10 | **→** jusqu'à `120` : **rejected · EdgeMismatch** | "A forged certificate fails: every edge is re-read in the ERC-8004 registry at submission." |
| D10 | 2:27-2:50 | Onglets 11, puis 12 | Onglet 11 : encadré **READ ON-CHAIN**, le paiement réglé puis refusé. Onglet 12 : la transaction sur monadscan | "And on Monad mainnet: the same contract, a real x402 payment settled by the facilitator, then refused after an anchor's veto, three hundred and thirty-two milliseconds later. ANCRE: the reader ERC-8004 asks for, and it refuses to pay." |

### Texte final de la démo (prise du 11/10, montage de 2:36)

La prise du 11/10 à 19:07 (souris pilotée, D4 et D9 coupés au montage) sert de base. Valeurs réelles de D8, mesurées pendant la prise : webhook **0,87 s** après le bloc 70 167 232, certificat on-chain **18 blocs plus tard, 6,3 s** après le webhook (tx `0x4976…afd7`), audit Envio **CLEAN**. Le mainnet affiche STALE depuis le 11/10 (certificat de plus de 24 h) : on dit « settled on October 10th », jamais « passes ».

| Plan | Début | Voix |
|---|---|---|
| D1 | 0:00 | "Monad mainnet, the ERC-8004 reputation registry. This agent, Eve-8004, has seven thousand six hundred ratings, with an average of ten to the thirty-six. And the registry won't even compute it without a list of raters you trust." |
| D2 | 0:15 | "This is ANCRE's screen. An explorer lists every agent; we show who your anchors actually reach. Eve: seven thousand six hundred ratings, mass zero. Refused." |
| D3 | 0:28 | "Not one of those ratings carries weight: none comes from anyone your anchors reach. Alchemy's Transfers API shows why: a hundred and fifty raters sampled, all first funded by the same address." |
| D5 | 0:43 | "On testnet we run our own agents. Provider-1 and provider-3 pass. Provider-3 was never rated by an anchor, only by provider-1: trust two hops away. The farm's target: refused." |
| D6 | 1:00 | "This is our recorded testnet run of October 7th, every event a real transaction. Ten fake agents pump their target to a hundred. ANCRE gives it zero. Then one anchor is compromised and vouches for it: still refused. No single anchor is enough." |
| D7 | 1:17 | "Now a provider goes bad and an anchor slashes it. The very next payment is refused by the payer contract itself, one block later: two hundred and sixty milliseconds on Monad testnet. No recertification needed: the veto is read live." |
| D8 | 1:38 | "And this part is live, today. An anchor rates an agent on testnet. Alchemy's webhook reaches our certifier less than a second after the block, and a new certificate is on-chain eighteen blocks later, about six seconds. Envio's indexer audits it against the registry: clean. Here it is on the explorer." |
| D10 | 2:13 | "And on Monad mainnet: the same contract settled a real x402 payment through the facilitator on October 10th, then refused the next one three hundred and thirty-two milliseconds after an anchor's veto. Here is that payment on monadscan. ANCRE: the reader ERC-8004 asks for. And it refuses to pay." |

**Ordre de coupe**, si la prise dépasse 2:55 :
1. D4 ;
2. la fin de D3 (le panneau Alchemy, qui a sa propre vidéo) ;
3. D9 ;
4. D8 raccourci à l'apparition du certificat dans le feed.

**Ne jamais couper** D2, D6 et D7 : la ferme refusée, l'ancre compromise et le disjoncteur (D52). Garde aussi au moins une interaction Monad réelle visible, D8 ou D10 (§9.4). La vidéo s'arrête sur D10 : pas de README ni de carte de fin.

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

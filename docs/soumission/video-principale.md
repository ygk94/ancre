# Vidéo principale : 3 minutes au plus (slides face caméra, puis démo en voix off)

> Écrit le **2026-10-11** par la session pilote. Remplace le découpage de `demo/VIDEO-SHOTS.md` pour la vidéo principale. Ce fichier garde les états d'écran détaillés et la checklist d'honnêteté : **relis-la avant chaque prise**.
>
> Format choisi par Hugo :
> - **partie A**, slides Figma avec la caméra (https://www.figma.com/slides/VjxdyFjgY3HldMFZKx5Ug5) ;
> - **partie B**, enregistrement de l'écran sans caméra, avec la voix par-dessus.
>
> **Limite stricte : 3:00** (règle §9.4, D51). Objectif : **2:55**. Voix en anglais. Notes en français.

## Le fil en une phrase

> *ERC-8004 lets anyone rate any agent and leaves Sybil filtering to the reader. ANCRE is that reader, and the contract that pays reads it first.*

---

## Partie A : slides face caméra (0:00 → 0:45)

Les notes de présentation sont dans Figma, en mode Présentateur. Ce qui suit est le texte à dire, court et calé.

| Slide | Temps | Voix |
|---|---|---|
| 1 · ANCRE | 0:00-0:07 | "I'm Hugo, this is ANCRE: a contract that refuses to pay a farm." |
| 2 · 83 % | 0:07-0:17 | "ERC-8004 lets anyone rate any agent, for free. On Monad mainnet, eighty-three percent of all ratings point to one agent. Its average is ten to the thirty-six." |
| 3 · 150/150 | *(à couper si tu dépasses)* | "Proof of payment doesn't help: every rater we sampled was funded by the same address." |
| 4 · L'idée | 0:17-0:30 | "With ANCRE, you pick a few anchors you trust. Trust flows only from them, even two hops away. A farm that rates itself gets exactly zero. And one stolen anchor key is never enough." |
| 5 · Le contrat refuse | 0:30-0:40 | "The answer is read by the contract that pays, before every x402 payment. An anchor's veto stops the next payment: one block later." |
| 6 · Running for real | 0:40-0:45 | "It runs on Monad testnet and mainnet, with Envio and Alchemy, and it's the reference implementation of a draft ERC. Let me show you." |

**Conseil :** la slide 3 est la première à couper, puisque le 150/150 réapparaît dans la démo, plan B2. Sans elle, la partie A tient en 45 s.

---

## Partie B : démo, écran seul, voix par-dessus (0:45 → 2:55)

**Préparation :**
- Chrome en 1920×1080, zoom 100 %, thème clair, sur **https://ancre-xyz.netlify.app** (le site public).
- Les indices `at=` correspondent au run **testnet du 07/10** (`run-20261007T131141Z`) que l'écran affiche. Vérifie-les avec le compteur `n/121` en haut de la Live demo avant la prise.
- Pour B7 : le récepteur Alchemy tourne en mode réel (MUSTDO), et la commande `node trigger.ts --send …` est prête dans un terminal.

| # | Temps | À l'écran | Voix |
|---|---|---|---|
| B1 | 0:45-1:00 | **Discover**, réseau **Monad mainnet**. Le tableau « refused » : **Eve-8004, 7,665 ratings → 0** | "This is the layer we want to add to explorers like 8004scan. They list every agent. ANCRE shows which ones are reachable from anchors you choose. Eve: seven thousand six hundred ratings. Zero." |
| B2 | 1:00-1:12 | Clic sur **Eve-8004**, puis onglet **Ratings**, puis le panneau **« Who funded the raters? »** (Transfers API d'Alchemy) | "Every rating is accounted for: none comes from anyone your anchors reach. And here's why it's a farm: the raters were all funded by the same address." |
| B3 | 1:12-1:24 | Réseau **Monad testnet**, Discover : provider-1 et provider-3 passent, la cible de la ferme est refusée. Clic sur **provider-3**, onglet **Trust path** | "On testnet we run our own traffic. Provider-3 was never rated by an anchor, only by a provider they trust: it still passes. That's trust beyond one hop, with a Sybil bound." |
| B4 | 1:24-1:42 | **Live demo** (`/live`), `at=87`, puis `→` jusqu'à `at=90` : la cible de la ferme affiche **100** dans l'explorateur et **0** chez ANCRE, **Refused · UNTRUSTED**. Ensuite l'ancre C, compromise, l'endosse, et le paiement est encore refusé | "The payer is a contract that asks ANCRE before every payment. The farm pumps its target to a hundred: refused. Now one anchor is compromised and vouches for it. Trust is computed leaving any one anchor out: still refused." |
| B5 | 1:42-2:02 | `at=106` → `at=111` : provider-2 est **Paid**, l'ancre B le sanctionne (slash), puis le paiement suivant est **Refused · ANCRE_STATUS**. Encadré du disjoncteur : **1 block, 260 ms** | "A provider goes bad, an anchor slashes it. The very next payment is refused. One block, two hundred and sixty milliseconds on Monad testnet. On mainnet, three hundred and thirty-two." |
| B6 | 2:02-2:14 | `at=118` → `at=120`, ou la page agent, onglet **Certificates** : **rejected · EdgeMismatch**, le faux certificat | "Certificates are re-read against the ERC-8004 registry. A fabricated edge is rejected at submission." |
| B7 | 2:14-2:34 | **En direct :** écran partagé entre le terminal `node trigger.ts --send` et la console du récepteur (webhook, puis `submitCertificate`, puis `TIMELINE`), puis le feed de l'écran (onglet ANCRE) où le nouveau certificat apparaît | "Every rating is pushed to us by an Alchemy webhook, and our certifier resubmits the certificate on-chain: a few seconds, no polling. Our Envio indexer then audits every certificate. Clean." |
| B8 | 2:34-2:48 | Réseau **Monad mainnet**, agent **#10330**, onglets **Payments** et **Certificates**. Clic sur un lien **monadscan** (le paiement réglé `0xa099…a60c`) | "And on Monad mainnet: the same contract, a real x402 payment settled, then refused after a veto. Every transaction is in the repo." |
| B9 | 2:48-2:55 | Retour sur la slide 1, ou une carte de fin avec l'URL du dépôt | "The standard leaves Sybil filtering to the reader. ANCRE is that reader, and it refuses to pay." |

**Ordre de coupe**, si la prise dépasse 2:55 :
1. la slide 3 ;
2. la fin de B2 (le panneau Alchemy, qui sert surtout à la vidéo Alchemy) ;
3. B6 ;
4. raccourcir B7 à l'apparition du certificat dans le feed.

**Ne jamais couper** B1, B4 et B5 : la ferme refusée, l'ancre compromise et le disjoncteur (D52).

---

## Ce qu'il faut dire tel quel, et ce qu'il ne faut jamais dire

- **Les latences** : dis seulement celles affichées et mesurées en vrai, soit 260 ms sur le testnet le 07/10 et 332 ms sur le mainnet le 10/10. Jamais une latence de fork.
- **Les chiffres mainnet de Discover** viennent du solveur de référence, étiquetés « COMPUTED », sauf l'encadré on-chain de #10330 et #182. Ne dis pas « certified » pour un chiffre du solveur.
- **Le garde-fou du registre et les registres upgradables** (D57) : si tu en parles, présente-les comme des faits on-chain publics (« the registry's self-rating guard checks the owner, not the agent wallet »). Jamais comme une attaque, et sans nommer personne.
- **Les adresses de tiers**, comme l'owner d'Eve ou le scanner, sont des faits on-chain : pas d'accusation.
- **Le plugin MetaMask** : pas dans la vidéo (D53).
- **L'override humain** : pas dans la vidéo, seulement dans le README (D51).

## Les autres vidéos (une minute chacune)

- Alchemy : `docs/soumission/video-alchemy.md`.
- Envio : `docs/soumission/video-envio.md`.

Le plan B7 peut être tourné une seule fois et réutilisé dans la vidéo Alchemy.

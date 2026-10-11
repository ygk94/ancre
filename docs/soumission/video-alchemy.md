# Vidéo du bounty Alchemy : environ 1 min 26

> Réécrit le **2026-10-11** par la session pilote (remplace la version d'une minute du 10/10).
> - **Fiche du bounty** : 2 minutes au plus. Elle doit montrer comment le projet intègre un ou plusieurs services Alchemy.
> - **Angle** : **à quel moment Alchemy intervient dans le flux** d'ANCRE, en direct, plutôt qu'une liste de fonctionnalités.
> - Même méthode que la démo et Envio : je pilote l'écran et j'enregistre, puis tu poses ta voix sur la version prompteur.

## Le message

> *Alchemy keeps ANCRE's certificate fresh, and explains its zeros.*

Alchemy intervient à deux endroits :

```
ERC-8004 registry ──event──▶ ① Alchemy Custom Webhook ──▶ certifier ──▶ certificate on-chain ──▶ the payer reads it
                                                    (reads and sends through the Alchemy Monad RPC)
agent page "why zero?" ◀── ② Alchemy Transfers API (who funded the raters), via a Netlify Function
```

## Les plans

| # | Temps | À l'écran | Voix (anglais) |
|---|---|---|---|
| A1 | 0:00-0:09 | Le site, page de provider-3 sur le testnet, onglet Certificates | "ANCRE checks, before an agent pays, whether anyone you trust vouches for it. That answer lives in an on-chain certificate, and a certificate is only useful if it's fresh." |
| A2 | 0:09-0:21 | `solver/alchemy_hook.py` sur GitHub : le filtre GraphQL du webhook (les 3 adresses et les événements) | "So we don't recompute on a timer. An Alchemy Custom Webhook watches the two ERC-8004 registries and our contract on Monad, and pushes every relevant event to our certifier, signed." |
| A3 | 0:20-0:46 | **En direct.** Onglet 3 : le déclencheur envoie une vraie tx testnet (l'ancre A note provider-3). Onglet 2 : la console du récepteur, avec `NewFeedback · signature OK`, puis `Envio indexer…`, `certificate SUBMITTED` et `TIMELINE` | "Live: an anchor rates an agent. Alchemy's webhook reaches us in about a second, signature checked. The certifier recomputes trust and submits a new certificate about six seconds later. Every read and every transaction goes through Alchemy's Monad RPC." |
| A4 | 0:47-0:56 | La tx du nouveau certificat sur monadscan testnet (Success) | "Here it is on chain. No polling on the critical path: a poller only stays as a safety net, in case a delivery is missed." |
| A5 | 0:56-1:16 | Mainnet, page d'Eve-8004 (#182) : la moyenne naïve énorme, ANCRE à 0, puis le panneau « Who funded the raters? » avec la vérification en direct | "Alchemy's second job: explaining a zero. Eve has seven thousand ratings and a score of zero. The Transfers API shows why: every rater we sampled got its first MON from the same address. And this panel re-checks it live, through a Netlify function that keeps our key server-side." |
| A6 | 1:16-1:26 | Retour sur la console du récepteur (le `TIMELINE`) | "Event-driven certificates, and explainable zeros. That's how ANCRE uses Alchemy, on Monad." |

Environ 200 mots, soit environ 1:26 à un rythme posé.

## Les chiffres (lus pendant la prise, rien d'écrit à l'avance)

- **A3** : « under a second » et « about six seconds » viennent des deux prises du 11/10 : 0,58 s et 0,87 s pour le webhook, 6,35 s et 6,29 s pour le certificat. Prise de la vidéo Alchemy (11/10, 23:04) : webhook 1,26 s après le bloc 70 213 970, certificat on-chain au bloc 70 213 986, 6,38 s après le webhook (tx `0x762e…3eb6`), d'où « about a second ».
- **A5** : la mesure de la Transfers API du 10/10 (150 sur 150, 11,0 MON, MESURÉ). On dit « we sampled », pas « all raters ». L'adresse est un fait on-chain : pas d'accusation, et on ne la lit pas à voix haute.
- **RPC Alchemy** : le récepteur tourne avec `--rpc alchemy` (11/10), ce qui est vrai pendant la prise.

## À dire sur la plateforme (champ « How does your project integrate Alchemy? »)

> ANCRE uses an **Alchemy Custom Webhook** (GraphQL filter on the ERC-8004 Identity and Reputation registries and on our AnchoredReputation contract, Monad testnet) as the trigger of its certifier: each relevant event wakes the certifier, which recomputes anchored trust and resubmits the on-chain certificate, with an `eth_getLogs` poller kept only as a fallback. Every chain read and transaction of the certifier goes through the **Alchemy Monad RPC**. Measured on 2026-10-11 on the official testnet instance: webhook received 0.58 s and 0.87 s after the block, certificate on-chain 6.3 s later, audited CLEAN by our Envio indexer. It also uses the **Alchemy Transfers API** to explain why a farmed agent scores zero: on Eve-8004, every rater we sampled was first funded by the same address, re-checked live on the agent page through a Netlify Function that holds the key server-side. Details: `docs/ressources/alchemy-integration.md`.

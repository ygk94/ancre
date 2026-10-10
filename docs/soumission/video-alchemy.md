# Vidéo du bounty Alchemy : 1 minute

> Écrit le **2026-10-10** par la session pilote (D60).
> - **Fiche du bounty** : 2 minutes au plus, facultative. Elle doit montrer comment le projet intègre un ou plusieurs services Alchemy (`docs/conseil/bounties-sponsors.md`, fiche officielle).
> - **Angle choisi par Hugo** : montrer **à quel moment Alchemy intervient dans le flux** d'ANCRE, et non faire une liste de fonctionnalités.
> - **Voix off en anglais.** Notes de réalisation en français.

## Le message en une phrase

> *ANCRE certifies who you can trust before an agent pays. Alchemy is how the certificate stays fresh, and how we explain a zero.*

Alchemy intervient à deux moments du flux, et chacun a son plan :

```
ERC-8004 registry ──event──▶ ① Alchemy Custom Webhook ──▶ ANCRE certifier ──▶ certificate on-chain ──▶ payer reads it before paying
                                                                                        │
           agent page "why zero?" ◀── ② Alchemy Transfers API (who funded the raters)  ◀┘
```

## Plan de tournage

| # | Temps | Durée | À l'écran | Voix off (anglais) | Service Alchemy |
|---|---|---|---|---|---|
| 1 | 0:00-0:08 | 8 s | L'écran ANCRE, Discover, sur Monad testnet. La carte de l'instance officielle, avec l'audit Envio CLEAN | "ANCRE tells an agent who it can trust before it pays: reputation computed from anchors you choose, certified on Monad." | — |
| 2 | 0:08-0:14 | 6 s | Le schéma ci-dessus, avec le ① en surbrillance | "A certificate is only useful if it's fresh. That's Alchemy's first job." | Custom Webhook |
| 3 | 0:14-0:34 | 20 s | **Écran partagé, en direct.**<br>• À gauche : le terminal du déclencheur, qui envoie une vraie tx de testnet (une ancre endosse un fournisseur).<br>• Au centre : le dashboard Alchemy, onglet *Webhook deliveries*, où la livraison apparaît.<br>• À droite : la console du récepteur, ligne par ligne : `NewFeedback · block N`, `webhook received +X ms`, `recertify`, `submitCertificate → tx 0x…` | "An anchor vouches for a provider. Alchemy's webhook pushes the event to our certifier. It recomputes trust and resubmits the certificate on-chain: block N to block N plus K." | Custom Webhook (GraphQL filter on the two ERC-8004 registries and the ANCRE contract) |
| 4 | 0:34-0:40 | 6 s | Le feed de l'écran : le nouveau certificat apparaît. Clic sur la tx dans l'explorateur | "No polling loop on the critical path. The poller stays only as a safety net." | — |
| 5 | 0:40-0:54 | 14 s | Mainnet, page agent d'**Eve-8004** (#182) : la moyenne naïve est énorme, ANCRE affiche 0. Le panneau **"Who funded the raters?"** s'ouvre : *150 / 150 first funded by the same address, 11.0 MON each*, source « Alchemy Transfers API », avec la date | "Alchemy's second job: explaining a zero. Eve has thousands of five-star ratings. The Transfers API shows who paid the raters: every one we sampled got its first MON from the same address. ANCRE never needed that to say zero, but now you can see why." | Transfers API (`alchemy_getAssetTransfers`) |
| 6 | 0:54-1:00 | 6 s | La carte de fin : le schéma complet, le lien du dépôt et « Built on Monad · Alchemy Webhooks · Transfers API » | "Event-driven certificates, explainable zeros. ANCRE, on Monad, with Alchemy." | — |

**Total : 60 s.** Si on dépasse, on coupe d'abord le plan 4, puis le plan 2.

## À remplir le jour du tournage (rien d'inventé)

- **Plan 3 :** `N`, `K` et `+X ms` sont **lus dans la console pendant la prise**, jamais écrits à l'avance. Si la prise est mauvaise, on la refait ; on ne retouche pas les chiffres.
- **Plan 3 :** si le webhook arrive avant le bloc final, la console l'affiche (`notFinalized`). On le dit tel quel, ou on ne dit rien, mais on ne dit pas « finalized ».
- **Plan 5 :** c'est la mesure du 06/10 (150 sur 150, 11,0 MON, MESURÉ), relancée et datée par le chantier Alchemy. On dit « we sampled », pas « all raters ». L'adresse est un fait on-chain : pas d'accusation, et on ne la nomme pas à voix haute.
- **Mention d'un RPC Alchemy** : seulement si le certificateur tourne vraiment sur `monad-testnet.g.alchemy.com` le jour du tournage (le chantier Alchemy le dira).

## Préparation, dans l'ordre

1. Le récepteur et le tunnel tournent, et le webhook existe dans le dashboard Alchemy (MUSTDO). La commande `serve --send` est fournie par le chantier Alchemy.
2. La commande du déclencheur (une tx de testnet) est prête dans un second terminal.
3. Ouvrir l'écran https://ancre-xyz.netlify.app sur Discover (testnet), et un 2ᵉ onglet sur la page agent mainnet #182.
4. Ouvrir le dashboard Alchemy sur *Webhook deliveries*.
5. Enregistrer en 1080p. La police du terminal doit être assez grande pour se lire en vidéo, autour de 18 pt.

## À dire sur la plateforme (champ « How does your project integrate Alchemy? »)

> ANCRE uses an **Alchemy Custom Webhook** (GraphQL filter on the ERC-8004 Identity and Reputation registries and on our AnchoredReputation contract, Monad testnet) as the trigger of its certifier: each relevant event wakes the certifier, which recomputes anchored trust and resubmits the on-chain certificate, with an `eth_getLogs` poller kept only as a fallback. It also uses the **Alchemy Transfers API** to explain why a farmed agent scores zero: on Eve-8004, every rater we sampled was first funded by the same address. Latency and commit state of each webhook are journaled (see `docs/ressources/alchemy-integration.md`).

⟦Les chiffres de latence sont à recopier depuis le rapport du chantier Alchemy une fois mesurés.⟧

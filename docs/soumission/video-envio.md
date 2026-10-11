# Vidéo du bounty Envio : 1 min 30 au plus

> Réécrit le **2026-10-11** par la session pilote (remplace la version d'une minute du 10/10).
> Fiche du bounty (`docs/conseil/bounties-sponsors.md`, « Envio : Best Use of Envio ») :
> - **condition** : HyperIndex, HyperSync ou HyperRPC doit alimenter une fonctionnalité centrale ;
> - **critères** : profondeur d'usage (multichaîne, schéma non trivial, entités dérivées, HyperSync pour l'analytique), produit qui marche sur des données live et correctes, originalité, qualité ;
> - **livrables** : un dépôt public, un frontend qui consomme les données, une courte démo de bout en bout.
>
> Même méthode que la démo : je pilote l'écran et j'enregistre, puis tu poses ta voix avec la version prompteur.
> Voix en anglais, notes de réalisation en français.

## Le message

> *Envio is ANCRE's data layer and its auditor: it compiles the trust graph the certificates are computed from, and it re-checks every certificate that lands on-chain.*

Envio intervient **deux fois** dans le flux, avant et après le contrat. C'est ce que la vidéo doit faire comprendre :

```
ERC-8004 registries + ANCRE contract (Monad 143, Monad testnet, Optimism)
        │  HyperIndex on Envio Cloud (ygk94/ancre-indexerv2)
        ▼
 ① trust graph compiled in the handlers ──▶ the ANCRE screen, and the certifier computes from it
        │                                              │
        │                                              ▼ submitCertificate (Monad)
 ② CertificateSubmitted ──▶ decoded and re-checked in the handler ──▶ SetHealth: CLEAN / typed discrepancies
        │
 ③ HyperSync scan, 7 chains ──▶ how much ERC-8004 feedback survives the rules
```

## Les plans

| # | Temps | À l'écran | Voix (anglais) |
|---|---|---|---|
| E1 | 0:00-0:10 | Le site, Discover testnet. Le fil « Latest activity » à gauche, avec « Envio · head … » en direct. La souris souligne la ligne Envio | "ANCRE decides, before an agent pays, whether anyone you trust vouches for it. Everything on this screen, every agent, rating and certificate, comes from one place: our Envio indexer." |
| E2 | 0:10-0:22 | GitHub `ygk94/ancre-indexerv2`, `config.yaml` : les 3 chaînes (143, 10143, 10), puis `schema.graphql` | "It's a HyperIndex project on Envio Cloud, open source, indexing the ERC-8004 registries and our own contract on three chains: Monad mainnet, Monad testnet and Optimism." |
| E3 | 0:22-0:40 | Terminal : la requête `ChainStats`. La souris montre la ligne 143 : **9300 → 13** | "The handlers don't just store events, they compile ANCRE's trust graph. Only a rater's latest rating counts, an agent's own controllers can't rate it, and out-of-range values are rejected. On Monad mainnet, nine thousand three hundred ratings become thirteen usable trust edges." |
| E4 | 0:40-0:55 | Extrait réel de la prise du 11/10 : la console du récepteur, ligne « Envio indexer at block … exported in … ms », puis « certificate SUBMITTED » | "That graph is what our certifier computes from. When a new rating arrives, the certifier waits for Envio to reach that block, exports the graph in about two seconds, and certifies." |
| E5 | 0:55-1:15 | Terminal : `SetHealth` et le dernier `Certificate`. La souris montre `AUDITED`, `graphRootMatches: true`, `discrepancyCount: 0`, puis `certificates: 10`, `CLEAN` | "Then Envio closes the loop. When a certificate lands on-chain, the indexer decodes it inside the event handler and re-checks every edge against the registry. This is the certificate from our demo today: audited, root matching, zero discrepancies. Ten certificates so far, all clean." |
| E6 | 1:15-1:25 | Le README, tableau « The same pattern on other chains » | "And with HyperSync, we ran the same rules on seven ERC-8004 deployments. Everywhere, only a few percent of ratings survive." |
| E7 | 1:25-1:30 | Retour sur `ygk94/ancre-indexerv2` | "ANCRE's data layer, and its auditor: Envio." |

Environ 210 mots, soit environ 1:25 à un rythme posé. Si ça dépasse 1:30, coupe d'abord E6 : le tableau reste dans le README.

## Les chiffres (lus en direct le 11/10 vers 22:10, à relire au tournage)

| Chaîne | Agents | Feedbacks | Arêtes gardées | Auto-notations | Hors bornes |
|---|---|---|---|---|---|
| 143 (Monad mainnet) | 10 376 | 9 300 | 13 | 78 | 117 |
| 10143 (Monad testnet) | 2 194 | 2 474 | 79 | 0 | 0 |
| 10 (Optimism) | 565 | 340 | 10 | 0 | 0 |

- `SetHealth` du set officiel `0x627c…3e10` : **10 certificats, CLEAN, 0 écart ouvert**, dernier certificat au bloc 70 167 250 (MESURÉ, 11/10).
- Dernier `Certificate` : tx `0x4976…afd7` (celle de la prise de la démo, 11/10), `AUDITED`, `graphRootMatches: true`, `discrepancyCount: 0`.
- E4 : image réelle du récepteur pendant la prise de la démo (11/10, 19:09:33) : « Envio indexer at block 70167234 (waited 609 ms): 2466 feedbacks exported in 1976 ms ».
- E6 : scan HyperSync du 28/09/2026 (MESURÉ, `indexer/analytics/survival_scan.py`). Dire « we ran », au passé.
- **Pas d'accusation** : « an agent's own controllers can't rate it » décrit une règle, pas un agent. On ne nomme personne.

## À dire sur la plateforme (champ Envio)

> ANCRE's data layer is an **Envio HyperIndex** indexer on **Envio Cloud** (`ygk94/ancre-indexerv2`, three chains: Monad mainnet, Monad testnet, Optimism). Its handlers compile the normative ANCRE trust graph from raw ERC-8004 events (latest feedback per rater and tag, controller self-ratings and out-of-range values rejected, wallets and owners rebuilt from events only). The certifier computes every certificate from this graph, and the indexer then **audits every ANCRE certificate inside the event handler**: the calldata is decoded and each committed edge is checked against the registry, producing typed discrepancies and a live `SetHealth` per anchor set (10 certificates, CLEAN, on 2026-10-11). **HyperSync** powers a seven-chain scan of how much ERC-8004 feedback survives the rules. The ANCRE screen reads the endpoint directly: `https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql`.

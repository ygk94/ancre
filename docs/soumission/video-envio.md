# Vidéo du bounty Envio : 1 minute

> Écrit le **2026-10-10** par la session pilote (D60 : une vidéo courte par bounty).
> Fiche du bounty (`docs/conseil/bounties-sponsors.md`, « Envio : Best Use of Envio ») :
> - **condition** : HyperIndex, HyperSync ou HyperRPC doit alimenter une fonctionnalité centrale ;
> - **critères** : profondeur d'usage (multichaîne, schéma non trivial, entités dérivées, HyperSync pour l'analytique), produit qui marche sur des données live et correctes, originalité, qualité ;
> - **livrables** : un dépôt public, un frontend qui consomme les données, et une courte démo de bout en bout.
>
> Angle : montrer **à quel moment Envio intervient dans le flux** d'ANCRE. Voix off en anglais, notes de réalisation en français.

## Le message en une phrase

> *Envio doesn't just store ERC-8004 events for ANCRE: it runs our trust-graph rules and audits every on-chain certificate, live, on three chains.*

Envio intervient à trois moments du flux, et chacun a son plan :

```
ERC-8004 registries (Monad 143, Monad testnet, Optimism)
        │  HyperIndex (Envio Cloud)
        ▼
 ① normative trust graph ──▶ ANCRE screen: feed, Discover, agent pages
        │
 ② CertificateSubmitted ──▶ in-handler audit: every committed edge vs the registry ──▶ SetHealth: CLEAN / discrepancies
        │
 ③ HyperSync scan, 7 chains ──▶ "how much of ERC-8004 survives the rules"
```

## Plan de tournage

| # | Temps | Durée | À l'écran | Voix off (anglais) | Brique Envio |
|---|---|---|---|---|---|
| 1 | 0:00-0:08 | 8 s | L'écran ANCRE, Discover, avec le **feed** à gauche (onglet « ERC-8004 registry ») qui défile en direct | "ANCRE tells an agent who it can trust before it pays. Every row on this screen comes from our Envio indexer." | HyperIndex, Envio Cloud |
| 2 | 0:08-0:22 | 14 s | Le playground GraphQL de l'endpoint Envio, avec la requête `ChainStats`. On surligne la ligne du mainnet : **9 297 feedbacks → 11 edges kept**, 78 self-ratings, 117 out-of-range | "The indexer doesn't just store feedback. Its handlers apply the ANCRE edge rules: latest feedback per rater, controllers can't praise themselves, out-of-range values rejected. On Monad mainnet, nine thousand feedbacks become eleven usable edges." | Entités dérivées : `Agent`, `RefEdge`, `ChainStats` |
| 3 | 0:22-0:42 | 20 s | **Le cœur de la vidéo.** Un certificat ANCRE est soumis sur le testnet (la tx dans l'explorateur, ou le terminal de l'acte 2). Ensuite, dans le playground : `Certificate` (statut, racine de Merkle vérifiée) puis `SetHealth` → **CLEAN, 5 certificates, 0 open discrepancies** | "When a certificate lands on-chain, the indexer decodes its calldata inside the event handler and checks every committed edge against the registry. A fabricated or inflated edge would show up here as a typed discrepancy, filed on the exact edge a proof can correct. Our official set: clean." | Décodage et audit dans le handler, Effect API |
| 4 | 0:42-0:52 | 10 s | Le tableau de survie du README : 7 chaînes, de 0,12 % sur Monad à 4,4 % sur Arbitrum | "And with HyperSync we ran the same rules across seven ERC-8004 deployments: on every chain, only a few percent of feedback survives." | HyperSync, analytique multichaîne |
| 5 | 0:52-1:00 | 8 s | La carte de fin : le schéma, `ygk94/ancre-indexerv2` et l'endpoint | "Three chains live on Envio Cloud, one schema, open source. ANCRE's data layer is Envio." | — |

**Total : 60 s.** Si on dépasse, on coupe d'abord le plan 4 : le chiffre reste dans le README.

## Chiffres : à relire le jour du tournage (rien d'inventé)

- **Plan 2** : `ChainStats` lu en direct le **10/10/2026** (MESURÉ) :

  | Chaîne | Agents | Feedbacks | Arêtes gardées | Auto-notations | Valeurs hors bornes |
  |---|---|---|---|---|---|
  | 143 | 10 330 | 9 297 | 11 | 78 | 117 |
  | 10143 | 2 107 | 2 349 | 59 | — | — |
  | 10 (Optimism) | 565 | 340 | 10 | — | — |

  Le registre bouge : **relance la requête juste avant la prise** et dis les chiffres affichés. Si tu veux une formule qui reste juste, dis « nine thousand… eleven ».
- **Plan 3** : `SetHealth` lu le 10/10 : `certificates: 5`, `status: CLEAN`, `openDiscrepancies: 0`, `lastCertBlock: 68979094` (MESURÉ). Si le webhook Alchemy a soumis entre-temps un nouveau certificat, le compteur aura augmenté : tant mieux, ça montre que l'audit est live.
- **Plan 4** : scan HyperSync du 28/09/2026 (MESURÉ, `indexer/analytics/survival_scan.py`, rapport `docs/chantiers/rapports/03.md` §3). Dis bien « we ran », au passé.
- **Pas d'accusation** : « controllers can't praise themselves » décrit une règle, pas un agent. On ne nomme ni #8317 ni aucune adresse dans cette vidéo.

## Préparation, dans l'ordre

1. Un onglet sur https://ancre-xyz.netlify.app (Discover, testnet), avec le feed visible.
2. Un onglet sur le playground de `https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql`, avec ces deux requêtes prêtes :
   ```graphql
   { ChainStats { chainId agents feedbacks refEdges selfRatings outOfRange } }
   ```
   ```graphql
   { SetHealth { certificates status openDiscrepancies lastCertBlock }
     Certificate(order_by: {blockNumber: desc}, limit: 1) { txHash blockNumber status graphRootMatches discrepancyCount } }
   ```
   Requête vérifiée sur l'endpoint le 10/10 : le dernier certificat est au bloc 68 979 094, avec `graphRootMatches: true`.
3. Le README ouvert sur le tableau « The same pattern on other chains ».
4. Enregistrer en 1080p, avec une police autour de 18 pt dans le playground.

## À dire sur la plateforme (champ Envio)

> ANCRE's data layer is an **Envio HyperIndex** indexer on **Envio Cloud** (`ygk94/ancre-indexerv2`, three chains: Monad mainnet, Monad testnet, Optimism). Its handlers compile the normative ANCRE trust graph from raw ERC-8004 events (latest feedback per rater and tag, controller self-ratings and out-of-range values rejected, wallets and owners rebuilt from events only), and **audit every ANCRE certificate inside the event handler**: the calldata is decoded and each committed edge is checked against the registry, producing typed discrepancies and a live `SetHealth` per anchor set. **HyperSync** powers a seven-chain scan of how much ERC-8004 feedback survives the rules. The ANCRE screen (feed, Discover, agent pages) reads the endpoint directly: `https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql`.

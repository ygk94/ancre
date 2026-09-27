# Chantier 05 — Router x402 et politique consommateur


> **Bounty visé (D38)** : *MetaMask, Best Agent Wallet Plugin* (2,5 k$). Le wallet d'un agent consulte ANCRE (`assess`) avant de payer. Trouver le format exact du « plugin » (Snap ? kit de délégation ?) dans la doc MetaMask et sur la fiche du bounty (connexion requise). Voir `docs/conseil/bounties-sponsors.md`.

## 1. Objectif et résultat final attendu

Montrer ANCRE **là où il sert** : un contrat qui **refuse de payer** un fournisseur non fiable et paie un fournisseur fiable, via x402 sur Monad, en USDC.

**Livrables** :
- `contracts/src/TrustGatedRouter.sol` (ou le nom retenu) ;
- ses tests : unitaires, en fork et de bout en bout avec le facilitator ;
- un client de démo (script) qui achète une ressource x402 à un fournisseur, avec et sans ANCRE ;
- `ROUTER.md`, qui décrit le flux exact, les messages signés, le budget de gas par paiement et les cas de refus.

## 2. Contexte minimal

- **Vérifié le 23/09 (CLAUDE.md §3)** : facilitator x402 Monad `https://x402-facilitator.molandak.org/supported` → v2, schémas `exact` et `upto`, réseaux `eip155:143` et `eip155:10143`. USDC natif `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, 6 décimales. **À revérifier avant usage** : un service tiers peut changer.
- Lecture ANCRE : `assess(agentId, setId)` coûte **77 k gas sans veto, 115 à 190 k avec** (mesuré, `contracts/GAS.md`). Il ne revert jamais et renvoie un statut et le tag déclencheur.
- Décisions : D8 (m = 2, veto q = 1), D13 (motif consommateur-ancre : le consommateur est l'une des ancres, jamais la seule), D19 (scènes de l'acte 2).

## 3. Ce qui est déjà tranché

- Le paiement **n'entre pas** dans le poids des arêtes (D3). Le router utilise ANCRE comme **garde**, pas comme source de poids.
- La politique (θ, ρ, m, q, maxAge) est engagée dans le `setId`. Le router ne code aucun seuil en dur.

## 4. Pistes à creuser (vérifier dans la spec x402 v2 et chez le facilitator)

- **Où placer la garde ?** Dans x402, le client signe une autorisation (EIP-3009 `transferWithAuthorization` pour `exact` ? Permit2 ou autre pour `upto` ? **à vérifier dans la spec**), et c'est le facilitator qui règle. Deux architectures à comparer :
  - **(a)** le payeur est un contrat (compte ou router) qui appelle `assess` puis autorise ou règle lui-même ;
  - **(b)** la garde est côté serveur ou facilitator.

  Seule (a) donne « un contrat refuse de payer », ce qui est le message du pitch. Regarder aussi EIP-1271, pour qu'un contrat « signe » une autorisation x402.
- **`upto`** : c'est un montant plafonné, réglé au montant réel. Faut-il dimensionner le plafond selon `trustRobust` ? L'idée est intéressante, mais la part de masse n'a pas d'unité commune d'un ensemble à l'autre (tour 1). Tester avant d'en faire un argument.
- **Budget de gas** : 77 à 190 k par décision. Sur Monad, on paie la gas limit : fixer une limite serrée. Est-ce acceptable pour un micropaiement ? Chiffrer en MON à 100 gwei.
- **Motif consommateur-ancre** : après livraison, le router poste un avis ERC-8004 sur le fournisseur (`giveFeedback`, tag de type endorsement). Mesurer le coût, et vérifier que le router n'est pas bloqué par le garde-fou anti-auto-notation (il n'est pas owner du fournisseur).
- **Disjoncteur** : un veto d'ancre (slash) fait-il refuser **le paiement suivant**, au bloc suivant ? C'est la scène centrale de D19. Mesurer.

## 5. Pièges connus

- USDC à 6 décimales, pas 18.
- Réserve de 10 MON pour chaque compte qui envoie des transactions.
- Le facilitator est un tiers : prévoir le cas où il est indisponible pendant la démo (mode dégradé documenté, par exemple un règlement direct).
- Ne jamais utiliser `block.timestamp` pour une époque (sauf là où x402 ou EIP-3009 l'imposent : `validAfter` et `validBefore` sont en secondes, à vérifier).

## 6. Questions ouvertes

- Architecture (a) ou (b), ou les deux : (a) pour la démo, (b) comme intégration « réaliste » ?
- Le router est-il générique (n'importe quel `setId`) ou dédié à la démo ?

## 7. Critères d'acceptation

- En fork mainnet :
  - un paiement vers un fournisseur `OK` passe ;
  - un paiement vers un agent de la ferme est refusé avec `status` et raison ;
  - après un slash d'ancre, le paiement suivant est refusé.
- Au moins un paiement réel sur le **testnet** via le facilitator (`eip155:10143`), avec l'accord de Hugo pour la transaction.
- `ROUTER.md` chiffre le gas et le coût en MON par paiement.

## 8. Interfaces

- Consomme `assess` et les statuts de 02.
- Produit des events de paiement (accepté ou refusé, raison) pour l'écran (07).

## 9. Règles

Voir `README.md`.

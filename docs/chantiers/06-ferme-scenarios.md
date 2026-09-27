# Chantier 06 — Ferme Sybil et scénarios de démo (acte 2)

## 1. Objectif et résultat final attendu

L'**acte 2 de la démo** (D19) doit être scripté, rejouable et chiffré, **sur le mainnet**, puisque les registres ERC-8004 n'existent que là. Les scènes sont les suivantes :
1. **Fournisseurs honnêtes** : notés par au moins deux ancres (m = 2), ils sont payés.
2. **Une ferme Sybil** crée N agents qui se notent entre eux et notent une cible au maximum. La moyenne naïve de la cible explose, sa masse ANCRE reste à 0, et le router refuse de payer.
3. **Une ancre compromise** approuve la ferme. Grâce au leave-one-out, la ferme n'est toujours pas payée.
4. **Disjoncteur** : une ancre dépose un `slash` sur un fournisseur honnête qui a mal tourné. Il est refusé au bloc suivant, via le veto.
5. **Anti-effacement** : un `review +1` posté ensuite sous un autre tag n'efface pas le slash (D14).
6. **Recours** : le fournisseur répond par `appendResponse`, ce qui est visible mais ne rétablit pas le score. C'est facultatif.

**Livrables** :
- `demo/` : scripts (Foundry `script/` ou TypeScript avec viem, à justifier), configuration des comptes, des ancres, des fournisseurs et de la ferme ;
- `demo/BUDGET.md` : coût complet en MON, mesuré en fork puis confirmé ;
- `demo/RUNBOOK.md` : procédure pas à pas pour rejouer l'acte 2, avec une durée cible ;
- un **journal d'événements** pour l'écran (07).

## 2. Contexte minimal

- Mesures du 27/09 :
  - `register()` ≈ 146 k gas estimés ;
  - `setAgentWallet` 83 727 ;
  - une mise à jour de certificat pour l'acte 2 (300 arêtes, 100 nœuds, k = 3) ≈ 840 k ;
  - `assess` 77 à 190 k.
- **Monad** (doc officielle, vérifiée le 27/09) :
  - réserve de 10 MON par compte ;
  - le gas des transactions en attente d'un compte est plafonné à min(10 MON, solde vu 3 blocs plus tôt) ;
  - une transaction de 30 M gas à 100 gwei coûte 3 MON ;
  - **on paie la gas limit**.
- La ferme réelle, Spawn-8004, a créé environ 300 agents à l'heure (CLAUDE.md). Notre ferme doit être **visiblement plus petite et étiquetée « demo »** : ne pas polluer le registre public plus que nécessaire.

## 3. Ce qui est déjà tranché

- L'acte 2 se joue sur le mainnet, pas sur le testnet (D19).
- Au moins **3 ancres honnêtes** (m = 2), plus l'ancre qui dépose le slash.
- Tout est étiqueté « demo » : les tags, les URI des agents et les métadonnées.

## 4. Pistes à creuser

- **Budget** : nombre de comptes (la réserve de 10 MON s'applique **par compte**, donc financer plusieurs comptes coûte du capital immobilisé, pas seulement des frais) ; gas limits serrées ; MON récupérable en fin de démo. Chiffrer le capital immobilisé et les frais séparément.
- **Taille de la ferme** : juste assez pour que la moyenne naïve soit spectaculaire. Faut-il reproduire des valeurs de 1e38 ? Elles sont à la borne autorisée (vérifié). C'est spectaculaire, mais réfléchir à l'image donnée.
- **Ordonnancement** : scènes idempotentes et rejouables. Que se passe-t-il si une scène échoue au milieu de la démo ?
- **Répétitions en fork** d'abord : toutes les scènes en fork mainnet (anvil `--fork-url`), puis une seule exécution réelle, avec l'accord de Hugo.
- **Le scanner `0xa06f907f`** : ne pas le nommer publiquement comme attaquant sans vérification (question du tour 3). En acte 1, le présenter comme « une ancre plausible qui fait fuir la confiance ».

## 5. Pièges connus

- Le garde-fou anti-auto-notation bloque l'owner, les opérateurs et le token approuvé, pas `agentWallet` : notre ferme ne doit pas s'appuyer sur ce trou.
- La règle `setAgentWallet` impose une deadline d'au plus 5 minutes sur `block.timestamp` (vérifié).
- Les blocs spéculatifs : l'écran doit attendre la finalité avant d'afficher « refusé » (voir 07).

## 6. Questions ouvertes

- Qui sont les ancres de démo : nos propres clés, des passkeys (P256 à `0x0100`, bounty Monad Foundation d'après CLAUDE.md), ou des tiers consentants ?
- Faut-il **nettoyer** après la démo (révoquer les avis de la ferme) ? Cela laisse une trace de révocation publique.

## 7. Critères d'acceptation

- Les 5 scènes obligatoires passent en fork mainnet, enchaînées, avec les statuts attendus d'`assess` et du router.
- `BUDGET.md` : un coût total mesuré en fork, avec une marge, validé par Hugo **avant** toute exécution réelle.
- `RUNBOOK.md` : un tiers peut rejouer l'acte 2 en fork en moins de 15 minutes (objectif à confirmer).

## 8. Interfaces

- Consomme 02 (contrat), 04 (certificateur) et 05 (router).
- Produit le journal d'événements de démo pour 07 et la matière de la vidéo (09).

## 9. Règles

Voir `README.md`. **Aucune transaction mainnet sans validation explicite du budget par Hugo.**

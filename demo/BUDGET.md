# Budget de l'acte 2 sur le testnet Monad (10143)

> Chantier 06, E1. Rédigé le 2026-10-06. **Rien n'a été dépensé** : tous les chiffres viennent d'exécutions sur un
> fork local (`anvil 1.8.3 --network monad`, modèle de gas Monad : pages MIP-8, gas limit facturée), sur les vrais
> registres ERC-8004 v2.0.0 du testnet. Étiquettes : **MESURÉ-FORK** (mesuré sur le fork), **MESURÉ** (réseau réel),
> **DOC** (documentation Monad), **ESTIMÉ**, **NON VÉRIFIÉ**.
> Commande qui produit les mesures : `cd demo && node run.ts --sweep` → `demo/out/run-<ts>.budget.json`.

## 1. Hypothèses

| | Valeur | Statut |
|---|---|---|
| Prix du gas testnet | **102 gwei** (`cast gas-price`), base fee 100 gwei (`cast base-fee`) | MESURÉ 2026-10-06 07:34 UTC |
| Facturation | sur la **gas limit**, pas sur le gas consommé | DOC (CLAUDE.md §7) |
| Gas limit de chaque tx | `ceil(eth_estimateGas × 1,10) + 5 000` | choix (`lib/chain.ts`) |
| Taille de la ferme | 10 agents + 1 cible, 5 paiements internes (D45) | choix (`lib/config.ts`, `ANCRE_FARM_SIZE`) |
| Réserve Monad | sous 10 MON, un transfert de valeur qui fait descendre sous la réserve revert, sauf une fois par fenêtre de 3 blocs (compte non délégué) ; le consensus contrôle les frais contre le solde vu 3 blocs plus tôt | DOC (docs.monad.xyz/developer-essentials/reserve-balance, note du vault) |

## 2. Coût unitaire mesuré (gas limit facturée)

MESURÉ-FORK le 2026-10-06, fork du bloc 68 628 2xx, exécution complète des 7 scènes (`run-20261006T074828Z`).

| Transaction | n | Gas limit moyenne (min-max) | gasUsed moyen | MON à 102 gwei (total) |
|---|---|---|---|---|
| Déploiement `AnchoredReputation` + `TrustGatedPayer` | 2 | 8 015 569 et 2 385 083 | 4 723 023 | 1,061 |
| `registerAnchorSet` (k = 3, 3 tags) | 1 | 552 467 | 497 697 | 0,056 |
| `register(agentURI)` (URI `data:` de ~230 octets) | 13 | 376 803 (373 869-392 919) | 333 444 | 0,500 |
| `setAgentWallet` | 13 | 96 777 | 82 808 | 0,128 |
| `giveFeedback` | 27 | 314 845 (222 939-326 950) | 277 954 | 0,867 |
| `submitCertificate` (certificateur du 04, ≤ 20 nœuds) | 4 | 569 467 (488 139-657 250) | 525 085 | 0,232 |
| Transferts MON (15) et USDC (6) | 21 | 53 022 | 43 436 | 0,114 |
| **Total de nos transactions** | **81** | **29 001 846** | | **2,958** |

Écart avec les chiffres antérieurs : `register` coûte 377 k de limite ici, contre 221 k de gas mesuré par le chantier 05. Deux causes : notre URI `data:` est plus longue (elle décrit l'agent comme « demo », lisible dans un explorateur), et la limite inclut la marge de 10 %. Une URI courte économiserait ≈ 0,2 MON. On garde la version autodescriptive.

## 3. Les deux enveloppes

### Enveloppe 1 : frais (dépensés)

| Poste | MON |
|---|---|
| Nos 81 transactions, toutes scènes (§2) | 2,958 (MESURÉ-FORK, limites × 102 gwei) |
| Balayage final (`--sweep`) : 15 transferts × 21 000 gas | 0,032 (CALCULÉ) |
| **Total des frais** | **≈ 2,99 MON** |
| Avec une marge de 30 % (prix du gas, une scène rejouée) | **≈ 3,9 MON** |

### Enveloppe 2 : capital immobilisé (prêté puis récupéré)

Chaque compte émetteur reçoit de l'opérateur le MON de ses propres frais : limites mesurées × 1,5 à 102 gwei (`run.ts`). Le reste est **renvoyé à l'opérateur par `--sweep`** à la fin.

| Compte | Transactions | Prêté (MON) |
|---|---|---|
| anchor-A / anchor-B / anchor-C | 1 / 3 / 2 avis | 0,051 / 0,151 / 0,101 |
| Owner de la ferme | 11 `register` + 11 `setAgentWallet` | 0,833 |
| 10 wallets de la ferme | 2 avis chacun | 10 × 0,101 = 1,010 |
| Noteur tiers (scène 5) | 1 avis | 0,050 |
| **Total prêté** | | **2,196 MON** (MESURÉ-FORK, `capitalLentToEmittersMon`) |
| Dépensé par ces comptes (inclus dans l'enveloppe 1) | | ≈ 1,40 MON |
| **Récupérable après la démo** | | **≈ 0,80 MON** (ESTIMÉ : prêté − dépensé − balayage) |

La **réserve de 10 MON n'immobilise rien en plus** : aucun compte n'a besoin de rester au-dessus de 10 MON. Sous la réserve, la règle impose seulement d'espacer les transferts de valeur. `lib/chain.ts` attend 3 blocs entre deux transferts d'un même compte, et 3 blocs après l'approvisionnement d'un compte avant sa première transaction. Sur le testnet, ça ajoute ≈ 15 × 1,2 s.

### Ce que l'opérateur doit détenir au départ

| | MON |
|---|---|
| Frais de l'opérateur lui-même (déploiements, ensemble, 2 fournisseurs, certificats, transferts) | 1,56 (MESURÉ-FORK, par compte) |
| Capital prêté aux 15 autres émetteurs | 2,20 |
| Marge | 1,24 |
| **Solde de départ recommandé** | **5 MON testnet** |
| **USDC testnet** | **0,11 USDC** (0,1 déposé dans le payeur + 5 × 0,002 pour la ferme) ; demander 1 USDC au faucet |

## 4. Ce que paient les autres

- **Facilitator x402** (`x402-facilitator.molandak.org`, signataire `0x7f6a…Db86`). Il règle 3 paiements du payeur et 5 paiements internes à la ferme : **1 843 982 gas de limites ≈ 0,19 MON**, à sa charge (MESURÉ-FORK, facilitator émulé comme x402-rs). Les refus au `/verify` ne coûtent rien : aucune transaction n'est envoyée.
- **Envio** (plan gratuit, 100 000 events, ~55 800 déjà consommés selon le pilote) : une exécution complète émet **92 events des registres** (65 sur l'Identity : `Registered`, `Transfer`, `MetadataSet` ; 27 `NewFeedback` sur la Reputation), MESURÉ-FORK (`eventsByContract`). Plafond fixé : 25 000, soit **plus de 250 exécutions**. Aucun risque.

## 5. Nombre de comptes

**16 comptes émetteurs** (MESURÉ-FORK : `sendingAccounts`) :
- l'opérateur ;
- 3 ancres (m = 2 exige au moins 2 ancres honnêtes, plus une compromise à la scène 2) ;
- l'owner de la ferme ;
- 10 wallets de ferme ;
- 1 noteur tiers.

Les wallets des fournisseurs, de la cible et l'opérateur du payeur **signent seulement**, sans MON.

Minimum absolu : 6 + N, où N est la taille de la ferme. La ferme coûte ≈ 0,11 MON par agent (`register`, `setAgentWallet`, 2 avis), soit ≈ 1,1 MON pour N = 10. Avec N = 5 (`ANCRE_FARM_SIZE=5`), la scène reste lisible (moyenne naïve 100 sur 5 avis) et coûte ≈ 0,55 MON de moins. On garde N = 10 pour le contraste visuel.

## 6. Ce qui n'est pas mesurable en fork

- **Le prix du gas le jour J** (102 gwei MESURÉ le 06/10 ; la base fee peut monter) : la marge de 30 % le couvre.
- **`eth_estimateGas` du vrai testnet** contre celui d'anvil `--network monad` : un écart supérieur à la marge de 10 % ferait échouer une transaction (elle paie quand même sa limite). Non observé au chantier 05 (T1 préparé, pas exécuté). NON VÉRIFIÉ.
- **Le faucet** (https://faucet.monad.xyz, https://faucet.circle.com) : montant et délai entre deux demandes NON VÉRIFIÉS.
- **Le facilitator réel avec le payeur ERC-1271** : c'est la porte P3 (test T1), toujours en attente de Hugo. Si elle échoue, les scènes 1 et 4 (paiements honnêtes réglés) échouent sur le testnet. Les refus, eux, se constatent sans transaction.

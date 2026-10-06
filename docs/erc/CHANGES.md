# R6 : correspondance entre le draft d'ERC du 21/09 et le texte du 27/09

- **Ancien texte** : `dataBlockchain/2 - EVM/Monad (L1)/Hackathons/📜 ERC draft — Anchored Reputation for Trustless Agents.md`, identique au README §7.
- **Nouveau texte** : `docs/erc/anchored-reputation.md`.
- **Source des décisions** : `docs/conseil/CR-conseil.md`, décisions D1 à D19, spécifications des tours 2 et 3, listes « Changements dans le draft ».
- **Rédaction** : chantier R6, 2026-09-27. Aucun commit, aucune publication.

## 1. Table de correspondance

| Ancien draft (21/09) | Nouveau texte (27/09) | Ce qui change | Pourquoi | Décision |
|---|---|---|---|---|
| Préambule : `requires: 8004`, `created: 2026-09-21` | `requires: 165, 721, 8004`, `created: 2026-09-27`, description réécrite (114 car.) | L'ERC s'appuie désormais sur ERC-165 et ERC-721 (`ownerOf`, `getApproved`, `isApprovedForAll`) | Lecture des contrôleurs et pause sur transfert | D10, D16 |
| Abstract : score relatif + deux niveaux `Verified` / `Optimistic` avec caution | Part de masse, méfiance, borne qui ne fait que croître, statuts qui ne revert pas, veto des ancres | Réécriture complète | Nouveau modèle de certificat | D1, D4, D6, D11 |
| Motivation : chiffres du 21/09 (9 188 avis, 83 %, 117 × 1e38, 1,5e36) | Mêmes chiffres, datés et marqués mesuré ; ajouts : garde-fou contourné (78), 178 wallets partagés par 1 773 agents, 72 transferts avec effacement, fuite par un scanner, 84 agents notés dont 10 hors index, registre dormant depuis le 10/09, 3 arêtes utiles | Les faits du tour 3 sont intégrés. Monad n'est pas nommé : « chain ID 143 » seulement | Tour 3, « Changements », Motivation ; norme chain-agnostique | CLAUDE.md §5, D19 |
| §1 *Node* = agent ou adresse d'ancre | §1.1 : trois types `AGENT` / `ADDRESS` / `ANCHOR`, `nodeKey` normatif | Nœud-adresse sans masse pour un wallet ambigu ; nœud-ancre toujours distinct | AM-3.4, tour 2 Q2 | D9, D16 |
| §1 *Controller* = owner + agentWallet | §1 : contrôleurs = owner, agentWallet, approved, opérateurs ; anciens owners définis à part | Liste élargie | AM-3.3 | D16 |
| §1 *Anchor set* = liste de nœuds, `anchorSetId = keccak(nodes)` | §5 `AnchorSet` : ancres par `anchorId`, poids λ, α, `schemaHash`, `edgeFilterId`, `Policy`, registres, `metadataURI` ; `setId` immuable | Le setId engage toute la politique | AM-1.1, tour 2 Q2 | D1, D9, D12 |
| §1 *Epoch* | `certBlock` (acceptation on-chain) et `snapshotBlock` (informatif) | L'âge se compte en blocs depuis `certBlock` | AM-3.12 ; spec Q1 du tour 2 | D6 |
| (absent) | §2 `anchorId` à pré-rotation + `IAnchorKeyRegistry` | Nouveau | Rotation sans migration ni mise en vente des ancres | D9 |
| §2 `TagSchema {tag, min, max, decimals, higherIsBetter}` | §3.1 `TagSchema {tag, kind, min, neutral, max}` en WAD | `kind` ajouté, `neutral` ajouté, `higherIsBetter` et `decimals` supprimés | AM-3.2 ; tour 3, « Changements » §2 | D12, D15 |
| §2 normalisation `x = (v − min)/(max − min)` dans [0, 1] | §3.4 : poids signé dans [−1, 1] autour de `neutral`, quantifié `q` int16 sur la grille 1e-4, troncature vers zéro | Poids signé et normatif | Les avis négatifs deviennent de la méfiance ; interopérabilité des certificats | D4, D18 |
| §2 rejet hors bornes, pas de plafonnement | §3.4, étape 2 : inchangé | Conservé | — | CLAUDE.md §5 |
| §2 `schemaRoot` (Merkle) + `ITagSchemaRegistry` global | §3.1 : `schemaHash` à plat, engagé par ensemble, schéma fourni en entier à l'enregistrement ; registre global supprimé | Plus d'autorité sur les tags | Tour 2 Q5 | D12 |
| §3 arête : tout avis non révoqué, tout nœud contrôlé par `clientAddress`, somme des x | §3.2 à §3.5 : dernier avis non révoqué et valide par (client, agent, tag1), dominance du négatif, émetteur = wallet unique, sinon nœud-adresse, précédence de l'ancre, rejet des contrôleurs et des anciens owners | Règle réécrite ; suppression de « every node A controlled by clientAddress », qui fusionnait les agents | AM-3.1, AM-3.3, AM-3.4 | D14, D16 |
| §3 filtres d'arêtes identifiés par `algorithm` | §3.7 : `edgeFilterId` en extension ; un filtre ne fait que retirer ; le paiement n'est ni poids ni condition | Paiement hors du cœur | Tour 2, désaccord 6 fermé | D3 |
| (absent) | §3.6 : budgets séparés B⁺ / B⁻ | Nouveau | AM-2.4 | D7 |
| §4 masse sans issue renvoyée vers p | §4 : convention absorbante, Σt ≤ 1, linéarité exacte | Inversé | AM-1.2 | D5 |
| §4 `Σt = 1e18`, `score = t·N`, `errorBound = (r/α)·N` | §4 : t en WAD (part de masse), `eEff = Σ λ_a ⌈r_a/α⌉` | N supprimé | AM-1.1 | D1 |
| §4 « ajouter nnz(C) unités à r » | §6.2 : arrondi majoré par nœud `max(lo + cnt − t, t − lo)` et marge de troncature `(1 − α)·t_u` | Même idée, formalisée | Aligné sur solver/ppr.py | tour 1 |
| (absent) | §4 : méfiance à un saut `d = (1 − α)·Dᵀt`, `trustRobust` leave-(m−1)-out | Nouveau | AM-2.5 | D4, D8 |
| §5 `Certificate {chainId, reputationRegistry, epoch, feedbackRoot, lastIndexRoot, schemaRoot, algorithm, alpha, nodeCount, scoresRoot, residual, level}` | §6.1 `Certificate {setId, level, certifier, certBlock, snapshotBlock, identityVersionHash, reputationVersionHash, graphRoot, vectorRoot, residual[k], errorBound}` | `nodeCount` supprimé ; versions des registres ajoutées ; `feedbackRoot` → `graphRoot` (feuilles = lignes) ; `scoresRoot` → `vectorRoot` (owner + k colonnes t et d) ; `lastIndexRoot` replié dans les entrées de ligne | Tour 3, « Changements » §5 | D6, D11, D17, D18 |
| §5.1 feuille d'arête `(from, to, weight)` | §6.1 : feuille de ligne `(nodeKey, truncated, sender, B⁺, B⁻, entries[dst, tagHash, feedbackIndex, lastIndex, q])`, arbre normatif | Feuille normative, encodage du calldata libre | Tour 3 Q2 C | D18 |
| §5 `Verified` / `Optimistic` (caution, fenêtre W, contestations omission / fabrication / résidu, slashing) | §6 et §7 : `ResidualVerified`, `RegistryContested`, `Optimistic` ; plus de caution, de fenêtre ni de slashing ; preuves d'écart (i) à (iv) qui élargissent la borne ; règle de remplacement par `eEff` | Modèle inversé | AM-2.1, AM-2.3 | D6 |
| (absent) | §8 : engagement des versions des registres, `checkRegistry()`, statut `REGISTRY_CHANGED`, event `RegistryChanged` | Nouveau | AM-3.5 | D17 |
| §6 `registerAnchorSet(bytes32[] nodes)` | §9 `registerAnchorSet(AnchorSet, TagSchema[])` | Engage toute la politique | — | D1, D12 |
| §6 `trustOf → (score, errorBound, epoch, level)`, **revert** sans certificat | §9 : `trustOf → TrustView` et `assess → Assessment`, qui **ne revert jamais** ; statuts `OK`, `UNKNOWN_SET`, `NO_CERT`, `STALE`, `REGISTRY_CHANGED`, `TRANSFERRED`, `VETOED`, `REGISTRY_ERROR` ; `triggerTag` ; `columns()` | Réécrit | Tour 3, « Changements » §6 | D10, D11, D17 |
| §6 fraîcheur laissée au consommateur, pas de `maxAge` normé | §5 : `maxAge` dans la politique engagée (utilisé aussi par la règle de remplacement) ; le consommateur peut être plus strict | Déplacé dans le setId | Tour 2, « Changements », Politique | D1, D6 |
| §6 : ne pas servir un certificat en fenêtre de contestation | Supprimé (plus de fenêtre) | — | — | D6 |
| Rationale : ancres, PPR, linéarité, deux niveaux, rejet sans plafonnement, antériorités | Rationale : mêmes points, plus part de masse, convention absorbante, budgets séparés, méfiance à un saut, veto, leave-one-out, borne unique pour t et d, borne croissante, lecture stockée, quantification, kinds, unité d'arête, émetteur, pré-rotation, trois niveaux | Étendu | — | D1 à D18 |
| Backwards Compatibility : demande `block.number` par avis | + garde-fou étendu à `agentWallet`, unicité du wallet et index inverse, timelock d'upgrade ; + proposition R6 : normaliser `getVersion()` | 3 demandes du CR + 1 proposition R6 | Tour 3 Q3 C | D17 |
| (absent) | Test Cases : vecteurs normatifs TC-1 à TC-8, TC-9 informatif (mainnet) | Nouveau | Tour 2 Q5 (relecture C→A) | D12 |
| Reference Implementation : Verified, déployé sur Monad | Note interne : niveau ResidualVerified, preuve (i) seule, chantiers R4 et R5 en cours, aucun chiffre de gas avant mesure | Monad hors texte normatif | CLAUDE.md §5 ; AM-3.6 | D18 |
| Security : capture d'ancre, trou de complétude, lectures périmées, changements de contrôleur, le paiement n'est pas l'honnêteté, arrondi, gas | + `minAnchors` ≥ 2 **MUST**, clé d'ancre volée, consommateur-ancre, surveillants, borne globale, vivacité, rachat, gouvernance du registre (EOA unique), contournement du garde-fou, wallets partagés, négatif permanent et recours `appendResponse`, oracle de refus, fuite par les mesures, lignes d'ancre > rowMax, même chaîne | Étendu | Tours 2 et 3, « Changements », Security | D8, D10, D14, D16, D17 |

**Points ⟦OPEN⟧ repris dans le texte** : les 9 désaccords normatifs listés ci-dessous, sans les trancher.
- **Tour 2** :
  - n° 1 vivacité ;
  - n° 2 rachat ;
  - n° 3 m = 2 contre consommateur-ancre ;
  - n° 4 une lecture ou deux (probablement caduc) ;
  - n° 5 borne globale ;
  - n° 6 α.
- **Tour 3** :
  - n° 1 négatif permanent ;
  - n° 2 vérification de version ;
  - n° 4 oracle de refus.

Le désaccord n° 3 du tour 3 (acte 2 de la démo sur mainnet) n'est pas normatif : il reste hors du texte.

## 2. Incohérences trouvées

Chaque ligne indique où l'incohérence se trouve (CR, ancien draft, solveur R4, dépôt) et ce que R6 en a fait. Aucune n'est tranchée silencieusement : chaque choix R6 porte une note ⟦ ⟧ dans le texte.

| Id | Où | Incohérence | Traitement R6 |
|---|---|---|---|
| AM-R6.1 | CLAUDE.md contre CR | La feuille de route marque R3 ✅ (« Mettre à jour CLAUDE.md »), mais le CLAUDE.md lu le 27/09 date encore du 23/09. Il garde le vault sous `/Users/famillethomas/...`, `cast` et `python3.12` au §8, `eth_getLogs ≤ 100 blocs` au §7 (contredit par AM-3.11), « Deux niveaux Verified/Optimistic » au §5 et `score = t·N` au §4. Soit R3 n'a pas été écrit, soit il l'a été ailleurs | Signalé ; CLAUDE.md non modifié (hors périmètre) |
| AM-R6.2 | CR, spec Q1 du tour 2 | « Facturée une fois par état » n'empêche pas les états **nouveaux**. Le contrôleur d'un nœud à forte masse peut poster un avis après chaque certification et le contester : e croît sans limite, et l'ensemble tombe en déni de service. La relecture de D (« spam facturé une fois ») ne couvre que la répétition | Ajout d'un plafond par ligne `cap = ‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2`, dont la solidité découle de l'inégalité triangulaire. **À valider par le conseil** |
| AM-R6.3 | CR, spec Q1 (ii) contre D14 | La preuve PÉRIMÉ exige « tag1 ∈ filtre ». Depuis D14, un avis plus récent sous un **autre** tag ne périme pas l'entrée : il change la combinaison, ce qui relève de (i) | (ii) exige le même tag ; (i) couvre un autre tag qui domine |
| AM-R6.4 | D16 contre spec (iv) | D16 dit le rejet des contrôleurs « contestable par une preuve de type (iv) », mais (iv) est défini comme WALLET (le wallet de l'émetteur a changé). Et la règle « ancien owner » n'est pas prouvable on-chain : pas d'accès à l'historique, pas d'`eth_getProof` (MESURÉ) | (iv) scindé en (iv-a) SENDER et (iv-b) CONTROLLER (contrôleur **actuel**). La règle « ancien owner » n'est appliquée que hors chaîne ; une preuve (i) peut réintroduire l'arête, au prix d'un simple élargissement |
| AM-R6.5 | D16 contre le modèle de preuve | L'unicité de `agentWallet` n'est pas prouvable on-chain (pas d'index inverse, AM-3.4). Le CR ne dit pas comment une preuve (i) établit que `node(c) = u`, ni ce qui arrive si le certificateur déclare ambigu un wallet unique | La ligne engage son `sender` : (i), (ii) et (iii) exigent `c == sender` ; un `sender = 0` est incontestable. Écrit en Security |
| AM-R6.6 | CR, tour 2 Q5 | « La conversion value/10^dec → WAD se fait par troncature vers zéro. » Comme `valueDecimals ≤ 18` (VÉRIFIÉ), la conversion `value·10^(18−d)` est exacte ; la seule troncature est celle de la quantification (D18) | Règle réduite à la troncature de q. Le solveur fait de même (`value_to_wad`) |
| AM-R6.7 | D2 contre tour 2 Q4 contre D1 | α est dit « unique par déploiement » (D2), « autorisé par certificat » par la norme (tour 2 Q4), et « engagé dans le setId » (D1, consigne R6) | α engagé dans le setId, répété dans le certificat ; un déploiement MAY restreindre les valeurs (ANCRE : 1/3) |
| AM-R6.8 | CR, tour 2 contre tour 3 | D11 est renversée au tour 3, mais trois passages du tour 2 n'ont pas suivi : les « Changements » du tour 2 exigent toujours un `assess` à preuve portée REQUIRED, avec `BAD_PROOF` et un cache en extension ; le tableau de découpage hackathon dit encore « `assess` à preuve portée : oui » ; le désaccord 4 du tour 2 (cache ou non) reste ouvert alors que son objet a disparu | Texte aligné sur le tour 3 (lecture stockée, sans preuve) ; désaccord 4 marqué ⟦OPEN⟧ « probablement caduc » |
| AM-R6.9 | Tour 3 « Changements » §5 contre D6 | « `lastIndexRoot` est conservé comme base des preuves d'écart. » Sous D6, une preuve élargit la borne quelle que soit la date du fait : `lastIndex` ne sert plus à la solidité, seulement à dire si le fait est postérieur au snapshot | Replié dans `RowEntry.lastIndex` ; `BoundWidened.postdatesSnapshot` |
| AM-R6.10 | D17 contre ERC-8004 | `getVersion()` n'est **pas** dans l'interface ERC-8004 (vérifié dans ERC8004SPEC.md, master). Il n'existe que dans l'implémentation déployée. Une norme chain-agnostique ne peut pas l'exiger | `versionHash = 0` si l'appel échoue ; 5e demande à ERC-8004 marquée « proposition R6, hors CR » |
| AM-R6.11 | D14 contre forme des lignes (CR, solveur) | Une ligne ne porte que l'avis dominant par destination (spec du tour 2, solveur `Edge`). Or (ii) et (iii) ne peuvent viser que cet avis. La révocation du dominant perd l'avis suivant, qu'il faut réintroduire par une preuve (i) | Représentation « dominant seul » conservée (alignée sur R4). L'alternative par (destination, tag) est notée : plus précise, plus de calldata. **À trancher avec R5** |
| AM-R6.12 | D18 contre interopérabilité (C, tour 3) | D18 encode les destinations par indices stables de la table du contrat, ce qui les rend propres au déploiement. C veut des feuilles normées et portables. Le coût de hachage des deux arbres de Merkle n'est toujours ni estimé ni mesuré (tour 2, « Ce que vous auriez dû me demander » n° 3) | Feuilles normatives en `nodeKey` ; indices réservés au calldata. **À aligner avec contracts/ENCODING.md** (absent le 27/09) |
| AM-R6.13 | solver/ppr.py contre texte | Le solveur arrondit `d` à l'entier **inférieur** ; le texte l'arrondit à l'entier supérieur, pour que l'arrondi n'aide jamais à passer. L'écart est de quelques wei, mais il casse l'égalité exacte des vecteurs de test | Texte : arrondi supérieur. **À signaler à R4** |
| AM-R6.14 | solver/graph.py contre CR (muet) | Quand la clé d'une ancre est aussi l'`agentWallet` unique d'un agent, le solveur attribue l'arête **aux deux** nœuds (émetteur et ancre). Le CR dit seulement « nœud-ancre distinct ». Cela change le graphe, donc `graphRoot` | Texte : attribution exclusive à l'ancre (une ligne par émetteur, plus simple pour les preuves). **À trancher avec R4** |
| AM-R6.15 | CR | Le veto renvoie à « tour 1 §6 », et la troncature à la « spec Q4 du tour 1 », mais le détail du tour 1 n'est pas dans le CR (« détail dans la conversation d'origine »). R6 a reconstruit le veto : tags `Endorsement`, clé courante, dominance, q = 1 | Reconstruction signalée ; comparer avec la conversation du tour 1 |
| AM-R6.16 | Tour 3 contre « ne revert jamais » | La liste des statuts du tour 3 n'a pas de cas d'erreur. Or `ownerOf` revert sur un jeton brûlé, et un registre peut échouer | Ajout de `REGISTRY_ERROR` (échec fermé) ; `ownerOf` qui revert → `TRANSFERRED`. Ajout de `UNKNOWN_SET` et de `Reason` |
| AM-R6.17 | D6 contre niveau Optimistic | Sans caution ni slashing, un certificat Optimistic « où rien n'est vérifié » et sans permission permettrait à quiconque de publier t = 1 pour ses Sybil | `Optimistic` réservé à `policy.optimisticCertifier` (ajout R6) |
| AM-R6.18 | D10 et tour 3 Q3 contre stockage | (a) La pause sur transfert exige un owner par agent du support : un slot par agent, qui ne se tasse pas dans les 4 × uint64 et n'entre dans aucune estimation. (b) « Le wallet effacé supprime les arêtes sortantes » n'est vrai qu'après recertification ou preuve (iv-a) : entre-temps, la masse déjà propagée par les anciennes arêtes sortantes reste dans les vecteurs stockés | (a) Signalé à R5. (b) Écrit tel quel en Security, avec la preuve (iv-a) comme correctif |
| AM-R6.19 | Vérification, **pas d'incohérence** | On aurait pu croire que la marge de troncature `(1 − α)·t_u` du tour 1 (budget partagé) devient insuffisante avec les budgets séparés, puisqu'une ligne tronquée cache une ligne C **et** une ligne D. Elle suffit : l'erreur totale sur d vaut au plus `(1 − α)·e + r ≤ e`, puisque `r = α·e` | Démonstration ajoutée au Rationale, pour que personne ne la « corrige » |
| AM-R6.20 | D14, D12, D3 : vocabulaire | « Filtre » désigne trois choses : les tags du filtre de l'ensemble (D14, TAGS_MAX), le schéma (D12) et `edgeFilterId` (D3). Le solveur distingue `filter_tags ⊂ schema` | Texte : le filtre de tags = les tags `Endorsement` du schéma (TAGS_MAX s'y applique) ; `edgeFilterId` à part. **À aligner avec R4** |
| AM-R6.21 | D14 | « Dernier avis non révoqué » peut se lire « le dernier parmi les non révoqués » ou « le dernier, s'il n'est pas révoqué ». De même, un avis hors bornes efface-t-il le précédent ? Le solveur a les deux modes (`latest_valid` / `latest_then_reject`) | Texte : dernier parmi les non révoqués **et valides**. C'est le mode par défaut de R4, cohérent avec « valide » en (ii) |
| AM-R6.22 | D9 contre certificat | Après la rotation d'une clé d'ancre, la ligne engagée de l'ancre (avis de l'ancienne clé) reste dans le certificat. Le CR dit « seuls les avis de la clé courante comptent » sans le relier au certificat | (iv-a) couvre les ancres. Une rotation élargit la borne d'environ `(1 − α)·α` par colonne et sature la borne : de fait, échec fermé jusqu'à recertification |
| AM-R6.23 | ROW_MAX contre consommateur-ancre (D13) | Une ancre qui approuve plus de 256 fournisseurs voit sa ligne tronquée, avec une marge `(1 − α)·α` par colonne qui sature la borne. Le motif consommateur-ancre y mène vite | Écrit en Security (SHOULD garder les lignes d'ancre sous rowMax) ; lignes découpées à étudier |
| AM-R6.24 | solver/graph.py contre texte | Le départage à poids égal diffère : le solveur prend `min((q, tag1))` côté négatif et `max((q, tag1))` côté positif, donc le plus grand tag. Le texte prend le plus petit tag dans les deux cas. Le poids est identique, mais le `feedbackIndex` enregistré, donc `graphRoot`, change | Texte : le plus petit `tag1`. **À aligner avec R4** |
| AM-R6.25 | README contre CR | Le README (§3 schéma avec « bond / slash », §4 « ~350–400 gas/edge », « 3,7M gas », « `eth_getLogs` ≤ 100 blocks », §7 draft du 21/09) est entièrement dépassé par les tours 2 et 3 | Signalé ; README non modifié (consigne) |
| AM-R6.26 | Spec Q1 du tour 2 | L'âge se compte depuis `certBlock` et non depuis le bloc de lecture du registre. Un certificateur peut donc certifier un snapshot ancien dans un bloc récent et « rajeunir » les données | Conservé (CR) ; `snapshotBlock` ajouté, à titre informatif. Question pour le conseil |
| AM-R6.27 | Tour 2 (pitch) contre TC-9 | « Masse ANCRE à 0 pour tout ensemble qui n'approuve pas la ferme » est marqué **supposé** au tour 2 ; TC-9 l'attend | TC-9 marqué informatif, à confirmer par la mesure R4 |
| AM-R6.28 | CLAUDE.md §3 et tour 3 contre D16 | « 36 arêtes » et « 3 arêtes utiles » sont définies comme « noteur **owner** d'un agent noté ». D16 définit l'émetteur par l'**agentWallet** unique. Les deux coïncident pour 10 189 agents sur 10 261 (MESURÉ), mais les chiffres doivent être remesurés sous D16 | Chiffres repris avec leur définition d'origine ; **remesure par R4** |

## 3. Choix propres à R6, à faire valider

Ce ne sont pas des désaccords du CR. Chacun est marqué d'une note dans le texte :
- le plafond d'élargissement par ligne (AM-R6.2) ;
- l'attribution exclusive à l'ancre (AM-R6.14) ;
- le certificateur nommé pour le niveau Optimistic (AM-R6.17) ;
- les statuts `REGISTRY_ERROR` et `UNKNOWN_SET` et l'enum `Reason` (AM-R6.16) ;
- la clause REGISTRY_CHANGED dans la règle de remplacement ;
- les feuilles en `nodeKey` (AM-R6.12) ;
- le départage par le plus petit tag (AM-R6.24) ;
- l'arrondi supérieur de d (AM-R6.13) ;
- le sel dans `nextKeyDigest` ;
- l'exigence « même chaîne que les registres » (le draft du 21/09 admettait implicitement le cross-chain avec `chainId`) ;
- la 5e demande à ERC-8004 (`getVersion`).

---

# Chantier 08 (2026-10-01) : alignement sur les tours 4 à 6 et sur l'implémentation v1

- **Ancien texte** : draft R6 du 27/09 (copie dans le scratchpad de la session 08, et dans l'historique git, commit `e00f0cf`).
- **Sources** : CR (D20 à D46, résultats 02/04, intégration), `contracts/ENCODING.md` (v1 unifié du 01/10), `solver/FORMAT.md` (R1-R8), `contracts/PROOFS.md` (L1-L7), `AnchoredReputation.sol` (interface et `_assess`).
- **Principe** : le texte normatif décrit ce que fait le contrat v1. Quand le code s'écarte d'une décision du CR, l'écart est noté AM-08.n ci-dessous et dans une note ⟦ ⟧.

## 4. Correspondance R6 → 08

| R6 (27/09) | 08 (01/10) | Décision |
|---|---|---|
| `requires: 165, 721, 8004` ; `discussions-to` = fil d'ERC-8004 | `requires: 721, 8004` ; `discussions-to: TBD` (un fil dédié est attendu) | AM-08.7 |
| §1.1 `nodeKey = keccak(kind, id)` | §5.1 clé `kind << 248 \| value`, table append-only, indices stables | D11 renversée, ENCODING §2 |
| §2 `anchorId` à pré-rotation, `IAnchorKeyRegistry` | §11 extension hors version, ⟦OPEN⟧ | D9, D43 ; AM-08.8 |
| §3.1 `TagSchema` (tag, kind, min, neutral, max), `TAGS_MAX = 8` (endorsement) | §2.1 `TagSpec` (idem, `uint8 kind`), `TAGS_MAX = 16` (tous tags), tags de longueur quelconque, appariés par hash | D24, AM-04.2 |
| §3.2 émetteur = wallet unique, sinon nœud-adresse ; précédence exclusive de l'ancre | §3.5 source = wallet, sinon owner si `ownerFallback` ; copie de ligne ; ligne d'ancre en plus de la copie d'agent | D20, D34, D44 ; R7, R8 ; AM-R6.14 fermé |
| §3.3 rejet des contrôleurs et des anciens owners | §3.3 rejet des contrôleurs actuels seulement | D20 ; AM-R6.4 fermé |
| §3.4 normalisation | §3.2, inchangée (d > 18 invalide) | D18 |
| §3.5 dernier avis valide par tag ; égalité par le plus petit tag | §3.3 dernier avis non révoqué par tag, hors bornes ⇒ le tag ne donne rien ; égalité par l'index le plus grand | D14 ; R3, R5 ; AM-R6.21 et AM-R6.24 fermés |
| §3.6 B⁺ = max(GRID, S⁺) | §3.6 B⁺ = max(GRID, sPlus), sPlus = vraie somme déclarée | D32, F-1 |
| §3.7 `edgeFilterId` non nul permis hors niveau contesté | §3.8 réservé, nul dans cette version ; dans le document de schéma | D3, D46 ; AM-08.2 |
| §4 borne d'erreur L1 globale `eEff` sur trust | §4.2 sous-solution `t ≤ F_bas(t)` ⇒ borne inférieure par agent ; §4.5 `eUp` (méfiance) et `eLow` (preuves de diminution) | D26, D32 |
| §4 méfiance par colonne `d^(a)` | §4.3 méfiance calculée sur T combiné, arrondie vers le haut | ENCODING §4 ; AM-R6.13 fermé (arrondi vers le haut) |
| §5 `AnchorSet` (registres, anchorKeyRegistry, edgeFilterId, Policy à 11 champs, metadataURI), `setId = keccak(chainid, set)` | §2.1 `SetParams` v1, `setId = keccak(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy))` ; identité globale (chainId, agrégateur, setId) ; §2.4 document de schéma | D1, D39 ; AM-08.1 |
| §5 `Policy` (minAnchors, vetoQuorum, threshold, rho, maxAge, minRefresh, slackRefresh, rowMax, minLevel, optimisticCertifier) | §2.2 `Policy` v1 (+ vetoMax, eLowMax, strictTransfer, registryVerified, ownerFallback, submitters ; − rowMax, minLevel, optimisticCertifier) | D33, D35, D36, D39, D32, D44 |
| §6 niveaux ResidualVerified / RegistryContested / Optimistic | §2.3 RegistryVerified (ouvert ou listé) / SubmitterAttested (listé) | D32 ; AM-R6.17 fermé |
| §6.1 feuilles normatives en `nodeKey`, encodage du calldata libre | §5.3-§5.5 encodage `ancre-cert-v1` normatif, `graphRoot` = Merkle des octets de ligne, `vectorRoot` = keccak des vecteurs | AM-R6.12 fermé |
| §6.2 vérification du résidu `max(lo + cnt − t, t − lo)` | §5.6 `t ≤ y`, `r = Σ(y − t) + E⁺ + 1 + marges`, `eUp`, `q`, masse, D | D26, ENCODING §4 |
| (absent) | §5.7 contrôles de forme (deux niveaux) et relectures Registry-verified | D32 |
| §6.3 remplacement par `eEff` | §5.9 remplacement par qualité (masse, q, D), refus de resoumettre un certificat prouvé | AM-04.1, L7 |
| §7 `dispute(kind)` (i)-(iv-b), plafond `‖C‖ + ‖D‖ + 2`, seulement en RegistryContested | §6 `proveEdge` ((i), (ii), (iii), contrôleur, (v)), `proveWallet` ((iv)), `proveTransfer` ; plafonds par côté ; actifs à tous les niveaux | D22, D32, D36, L6 |
| §8 `checkRegistry()` global, `versionHash` par registre | §7 `checkRegistry(setId)`, un hash qui lie les deux registres et leurs versions | D17 ; AM-08.5 |
| §9 statuts `OK, UNKNOWN_SET, NO_CERT, STALE, REGISTRY_CHANGED, TRANSFERRED, VETOED, REGISTRY_ERROR` ; `Reason` ; `trustOf` sans veto | §8 `OK, NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED` ; `isTrusted` ; `assess(…, withVeto)` ; `trustOf` = assess avec veto | D39 ; AM-08.6 |
| §9 veto en direct = dominance des avis de la clé courante | §8.2 veto = dernier avis de l'ancre (direct) OU bit certifié ; `vetoMax` ; `triggerTag` = hash | D21, D33 |
| (absent) | §9 obligations des ancres (veto en dernier, tag `veto` RECOMMENDED) | D33, AM-02.6 |
| §10 ERC-165 MUST | §10 MAY | AM-08.7 |

## 5. Traitement des ⟦OPEN⟧ du draft R6

| ⟦OPEN⟧ R6 | Traitement | Raison |
|---|---|---|
| Tour 2 n° 1, vivacité | **maintenu** (Security, E3) | Aucun tour ne l'a tranché ; D27 dit qui paie, pas ce qui se passe s'il ne paie pas |
| Tour 2 n° 2, rachat | **retiré** | Tranché autant que possible par D35 (strict) et D44 (gel des sortantes, via `proveWallet`) ; la limite restante est écrite en Security et liée à la demande 1 à ERC-8004 |
| Tour 2 n° 3, m = 2 contre consommateur-ancre | **retiré** | Pas de choix normatif en attente : `minAnchors ≥ 2` est un MUST pour un transfert de valeur ; le compromis est décrit en Security |
| Tour 2 n° 4, une lecture ou deux | **retiré** | Caduc depuis D11 renversée (AM-R6.8) : la lecture stockée est la seule |
| Tour 2 n° 5, borne globale | **retiré** | D26 rend la borne de confiance exacte par agent à la soumission ; ce qui reste global (eLow, eUp après preuve) est écrit en Security |
| Tour 2 n° 6, α | **retiré** | D24 : α par ensemble, RECOMMENDED 1/3 |
| Tour 3 n° 1, négatif permanent | **maintenu** (Security, E3) | Toujours non tranché ; le texte ne définit aucune échéance |
| Tour 3 n° 2, vérification de version | **retiré** comme marqueur | La synthèse retient les trois mécanismes ; la limite (upgrade à version inchangée) est en Security |
| Tour 3 n° 4, oracle de refus | **retiré** | Tranché par la synthèse du tour 3 et par D33 (`triggerTag`) |
| **Nouveau** : tour 5 n° 2, veto au dernier avis contre dominance | **ouvert** (§8) | Normatif, non tranché |
| **Nouveau** : D9/D43 non implémentés | **ouvert** (§11) | Le code contredit une décision ; AM-08.8 |

## 6. Incohérences trouvées par le chantier 08 (AM-08.n)

| Id | Où | Incohérence | Traitement |
|---|---|---|---|
| AM-08.1 | D1/R6 contre `computeSetId` | Le `setId` v1 n'engage ni `chainId`, ni les adresses des registres, ni `metadataURI`, ni `edgeFilterId`, ni registre de clés d'ancre. Deux agrégateurs liés à des registres différents donnent le même `setId` à deux politiques qui ne lisent pas le même graphe | Texte aligné sur le code ; identité globale = (chainId, agrégateur, setId) ; `metadataURI` et `edgeFilterId` déplacés dans le document de schéma engagé par `tagSchemaHash` |
| AM-08.2 | D3/D46 contre code | Pas d'`edgeFilterId` dans la v1. Et un filtre non nul sans prédicat on-chain rendrait les preuves d'écart abusives : un tiers « prouverait » l'omission de chaque arête légitimement filtrée | Réservé, MUST être nul dans cette version ; une version future devra définir le prédicat on-chain |
| AM-08.3 | D44 contre code | ROW_ALIAS_MAX = 64 n'est pas vérifié par le contrat et ne borne rien on-chain (déjà AM-INT.7) | Non normatif ; cité en Rationale |
| AM-08.4 | D44 contre code | D44 : « Pendant `TRANSFERRED`, on gèle aussi les arêtes **sortantes** ». En v1, le statut `TRANSFERRED` ne touche que la lecture de l'agent transféré. Ses arêtes sortantes restent dans les vecteurs stockés jusqu'à un `proveWallet` (le wallet est effacé au transfert) ou une recertification. Le gel dépend donc d'un surveillant, même en mode strict | Écrit tel quel (§6.2) ; à signaler au pilote |
| AM-08.5 | D17/R6 contre code | `checkRegistry` est par ensemble : une upgrade doit être signalée ensemble par ensemble, et un ensemble que personne ne signale reste OK | Écrit (§7) ; Security |
| AM-08.6 | R6 contre code | Pas de statut d'erreur : un registre illisible pendant le veto renvoie `REGISTRY_CHANGED` (sans marquer l'ensemble), un `ownerOf` qui revert renvoie `TRANSFERRED`. L'échec est bien fermé, mais un moniteur qui lit `REGISTRY_CHANGED` croira à une upgrade | Écrit (§8.1, §8.4) ; à documenter côté écran (07) |
| AM-08.7 | R6 contre code | Le contrat v1 n'implémente pas ERC-165 | MUST → MAY |
| AM-08.8 | D9/D43 contre code | Ancres par adresse, pas d'`anchorId` ni de registre de clés : la décision D9 n'est pas implémentée, et le `setId` n'a pas de champ pour elle | Extension hors version (§11), ⟦OPEN⟧ |
| AM-08.9 | D10 contre code | Le certificat n'engage pas l'owner mais une empreinte de 63 bits (`ownerFp`). Un transfert vers une adresse qui partage ces 63 bits n'est pas vu ; il faut ≈ 2⁶³ essais pour en fabriquer une | Security (E3) |
| AM-08.10 | norme contre code | L'implémentation appelle `isAuthorizedOrOwner` et `getVersion`, qui sont des fonctions de l'implémentation de référence d'ERC-8004, pas de son interface. Sur un déploiement d'ERC-8004 qui ne les a pas, la soumission revert (`getVersion`) ou toute arête paraît rejetée | La norme définit les contrôleurs par ERC-721 (§1) ; demande 5 à ERC-8004 ; Security |

## 7. Incohérences et défauts trouvés en E2 et E5 (relecture `/llm-council`, 01/10)

| Id | Où | Constat | Traitement |
|---|---|---|---|
| AM-08.11 | vecteurs du solveur | `tagSchemaHash` = `keccak("ancre-vector:" + label)` n'est le hash d'aucun document de schéma | Signalé dans le README des vecteurs ; le certificateur (04) devra produire le document de §2.4 |
| AM-08.12 | `simulate.py` | Les violations sont rejouées en Submitter-attested sur un `setId` absent des vecteurs | Noté dans le JSON |
| AM-08.13 | contrat | 33 527 octets > EIP-170 (= AM-INT.9) | Reference Implementation ; découpage avant la PR d'ERC |
| **AM-08.14** | D20/R8 contre D8 | **Une ancre dont l'adresse est la source d'un agent rend m ≥ 2 inopérant** : sa ligne copiée dans l'agent porte la masse des autres colonnes. Vérifié en fractions exactes sur TC-3 : la Sybil obtient trustRobust = 0,0247, comme l'honnête #2 | Texte : SHOULD en §2.1, plus un paragraphe Security. **Code (02)** : refuser SRC ∈ ancres à la soumission. **Démo (06)** : aucune ancre qui soit le wallet d'un agent |
| **AM-08.15** | R6/D20 contre le garde-fou d'ERC-8004 | **Mise sous silence par `setApprovalForAll`** : les critiques et les ancres rendus opérateurs perdent leurs négatifs (rejet des contrôleurs quel que soit le signe, l. 1130) et ne peuvent plus poster | Texte : Security, avec renvoi depuis §3.3. **Conseil** : rejeter les contrôleurs seulement pour w > 0, et compter comme veto une ancre approuvée. Ajouté aux brouillons (c) et (d) |
| **AM-08.16** | §5.9 contre code l. 572-576 | Le refus de resoumettre un certificat prouvé est exact à l'octet près (une ligne vide de plus ou W = 4 le contournent) et sauté sous REGISTRY_CHANGED | Texte : portée exacte écrite, plus Security. **Code (02)** : amélioration stricte exigée si prouvé |
| AM-08.17 | D23 contre code l. 406 | `addNodes` ouvert sur un ensemble ouvert : gonflement de la table, gel de l'ensemble | Security ; zone de préparation D23 non implémentée |
| AM-08.18 | §5.9 | La fenêtre de rafraîchissement ne vérifie ni la masse ni D ; `minRefresh = 0` est permis | Security ; démo : `minRefresh = maxAge` |
| AM-08.19 | §1 contre `proveEdge` l. 1652 | Un registre sans `isAuthorizedOrOwner` fait « prouver » l'absence de toute arête | Security ; code : quatre appels ERC-721 |
| AM-08.20 | §7 | `getVersion` est requis, alors qu'il n'est pas dans ERC-8004 : la norme est inapplicable à un registre ERC-8004 minimal | Écrit en §1 et §7 ; demande 5 |
| AM-08.21 | interface | Ni `certNonce` exposé, ni vue des paramètres d'un ensemble, ni tags dans l'event | §8.3 : clé de cache (certBlock, eEff, eLowEff) ; §2.4 : `setParams` dans le document |
| AM-08.22 | vecteurs | Non couverts : k = 1, W = 4, croissance de nCert, `proveWallet`/`proveTransfer`, suite d'amendements, veto, remplacement | À produire (04/08) avant la PR |
| AM-08.23 | ENCODING.md | La règle de W (« W = 2 if nCert ≤ 65 535 ») et « 0 if the registry reverts » (§7.1) sont périmés face au code | Relais vers le 02 |

## 8. Corrections du texte après la relecture (01/10)

Abstract : « exact » retiré, veto « sans recertification ». §1 : masse, plages u32, `getVersion` requis, agrégateur non upgradable, préséance. §2.1 : recommandation « ancre ≠ source ». §2.4 : `setParams` dans le document, RFC 8785, plus d'`edgeFilterId`. §3.3 : renvoi vers D2-a. §3.8 : aucun champ. §4.2 : SHOULD. §4.4 : plafond de d en 63 bits. §4.5 : bornes qualifiées. §5.1 : soumetteurs listés à tous les niveaux. §5.3 : u64 < 2⁶³. §5.4 : alias seulement vers une ligne d'agent, forme canonique. §5.7 : « address node », agents brûlés. §5.9 : portée du refus. §6 : ordre des amendements, ligne sans source. §7 : `getVersion` requis. §8.2 : égalité et timing. §8.3 : `payTo`, clé de cache, m ≥ 2 non appliqué, agrégateur épinglé. §8.4 : 120 000 gas. §10 : types déclarés, `identity`, `reputation`, `nodeCount`, `nodeKeyAt`. §11 : ancres en compte-contrat. Rationale : Cheng-Friedman, linéarité, limites de L7 et de « Two bounds ». Security : AM-08.14 à .19, compromission d'un nœud, concentration de méfiance, rachat discret, empoisonnement de paire, disponibilité des données, coût d'un registre hostile, EIP-7825. TC-3 : écart avec §2.1 signalé.

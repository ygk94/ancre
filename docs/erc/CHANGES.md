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

# ENCODING — contrat d'interface entre le solveur (R4) et `AnchoredReputation.sol` (R5)

> Version `ancre-cert-v0` (lignes et vecteurs) + `setId` v1 (28/09, §1). Rédigé le 2026-09-27, tenu par le chantier 02. Source de vérité : `src/AnchoredReputation.sol`. Implémentation de référence côté test : `test/utils/CertLib.sol` (même arithmétique, octet pour octet).
> Alignement vérifié avec `solver/FORMAT.md` (R4, lu le 27/09 vers 13:30) : **aucune divergence d'encodage ni d'arithmétique**. Les divergences de sémantique registre (F2, F3, F4) sont tranchées ou ouvertes au §7.
> Big-endian partout. `WAD = 1e18`. `GRID = 10 000` (grille de poids de 1e-4).

## 1. Ensemble d'ancres (`registerAnchorSet`, une fois, immuable)

> **v1, 2026-09-28 (D39, D24, D32)** : la politique complète est engagée dans le `setId`. Tout vecteur ou payeur qui calcule un `setId` doit utiliser ce format.

```
setId = keccak256(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy))
  anchors  address[]  strictement croissantes, 1..K_MAX = 16. L'ancre a est le nœud a (indices 0..k-1).
  lambdas  uint64[]   WAD, aucun nul, somme = 1e18 exactement
  alphaN/alphaD uint32  0 < alphaN < alphaD (défaut D2 : 1/3)
  tagSchemaHash bytes32  hash du schéma complet hors chaîne (D12)
  tags     TagSpec[]  1..TAGS_MAX = 16 (D24), triés par keccak256(tag) strictement croissant
           TagSpec = (string tag ≤ 32 octets, int128 min, int128 neutral, int128 max, uint8 kind)
           bornes en WAD ; min ≤ neutral ≤ max, min < max ; kind 0 = endorsement, 1 = measurement
  policy   Policy (tuple, dans cet ordre) :
           uint64  theta            WAD, > 0            trustLow ≥ theta
           uint32  rhoN, uint32 rhoD  rhoD > 0          rhoD·distrustUp ≤ rhoN·trustLow
           uint8   minAnchors       m, 1 ≤ m ≤ k        leave-one-out (D8)
           uint8   vetoQuorum       q, 1 ≤ q ≤ k        VETOED ssi ≥ q ancres opposent un veto
           int16   vetoMax          [−10 000, −1]       poids de grille ≤ vetoMax ⇒ veto (D21/D33)
           uint64  maxAge           blocs, > 0
           uint64  minRefresh       blocs               règle de remplacement
           uint64  slackRefresh     WAD                 règle de remplacement
           uint64  eLowMax          WAD                 budget d'élargissement de la borne basse (D36)
           bool    strictTransfer   D35 : ownerOf en direct dans assess (true recommandé)
           bool    registryVerified D32 : chaque arête relue dans le registre à la soumission
           address[] submitters     D32 : ≤ 8, strictement croissantes, non nulles ;
                                    vide = soumission ouverte, exige registryVerified
```
Encodage : `abi.encode` standard de Solidity (la struct `Policy` est un tuple dynamique à cause de `submitters`). En Python : `eth_abi.encode(["address[]","uint64[]","uint32","uint32","bytes32","(string,int128,int128,int128,uint8)[]","(uint64,uint32,uint32,uint8,uint8,int16,uint64,uint64,uint64,uint64,bool,bool,address[])"], [...])`.
Lecture : `policyOf(setId)` renvoie la politique engagée.
Démo : les ancres sont des adresses (pas de pré-rotation D9/D43, E8).

## 2. Table de nœuds (append-only)

Clé de nœud (bytes32) : `kind << 248 | valeur`, `kind` = 1 agent (agentId), 2 adresse, 3 ancre. Index stable, écrit une fois (`nodeIndexPlus1[setId][key] = index + 1`).

`newNodes` (argument de `submitCertificate`) et `addNodes(setId, entries)` : suite d'entrées
```
0x01 ‖ agentId:u32        (agent ; agentId ≥ 2^32 non supporté en v0)
0x02 ‖ address:20         (nœud-adresse : wallet ambigu ou sans agent, D16)
```
Ordre canonique d'un premier certificat (FORMAT.md) : ancres, agents par agentId croissant, adresses croissantes. Les nœuds suivants s'ajoutent à la fin.

## 3. `submitCertificate(setId, nCert:u32, eMax:u256, newNodes, vectors, rows)` — format **v1** (28/09)

- Nœuds certifiés : `[0, nCert)`. `nCert` est **non décroissant** d'un certificat à l'autre, `k ≤ nCert ≤ nodeCount`.
- `eMax` : borne annoncée par le soumetteur ; revert `ResidualTooLarge(eEff, eMax)` si l'`eEff` (= eUp agrégé) recalculé la dépasse. `dryRun(setId, nCert, vectors, rows)` (vue) renvoie les eUp par colonne, eEff et graphRoot sans lire le registre ; un `eth_call` de `submitCertificate` exerce aussi la relecture du registre (Registry-verified).
- Niveau Submitter-attested : seuls les soumetteurs listés appellent `submitCertificate`, `addNodes` et `reserveCapacity` (`NotSubmitter`).

### 3.1 `vectors` — `nCert × (k+1) × 8` octets (inchangé)
```
pour i dans [0, nCert) : t_i^(0) : u64 ‖ … ‖ t_i^(k-1) : u64 ‖ ownerFp_i : u64
```
- `t_i^(a)` en WAD, **< 2^63** (sinon `ValueTooLarge`). **Sous-solution (D26)** : le contrat exige `t_i^(a) ≤ y_i^(a)` pour tout i et tout a, sinon `NotSubSolution(a, i)`. Le solveur DOIT itérer depuis 0 avec la même arithmétique (§4) : tout itéré `t^(n) = F_bas^n(0)` est une sous-solution (lemme L3).
- `ownerFp_i = uint160(ownerOf(agentId)) & (2^63 − 1)` pour un nœud-agent de masse > 0. **v1 : 0 ne désactive plus le contrôle `TRANSFERRED`** ; en mode strict un agent de masse > 0 dont l'empreinte est fausse ou nulle est `TRANSFERRED` (échec fermé). Au niveau Registry-verified, le contrat vérifie l'empreinte de chaque agent de masse > 0 (`ownerOf`) et exige 0 pour tout nœud non-agent.
- `vectorRoot = keccak256(vectors)`.

### 3.2 `rows` (v1 : drapeaux B⁺ déclaré et alias)
```
rows  = W:u8 ‖ numRows:u32 ‖ row*          W = 2 si nCert ≤ 65 535, sinon 4
row   = u:W ‖ hdr:u16 ‖ [wallet:20] ‖ [bPlus:u32] ‖ [src:W] ‖ edge*nE
hdr   = nE (bits 0..12, ≤ ROW_MAX = 256)
        | 0x8000  wallet présent
        | 0x4000  B⁺ déclaré (bPlus présent)
        | 0x2000  ligne alias (src présent, nE = 0, pas de bPlus)
edge  = dst:W ‖ w:int16 ‖ feedbackIndex:u32  (8 octets si W = 2, 10 si W = 4)
```
Règles vérifiées à chaque soumission (revert sinon) :
- lignes par `u` strictement croissant, `u < nCert`, `numRows ≤ nCert`, fin exacte du tampon (`BadRows(3..6)`) ;
- dans une ligne : `dst < nCert`, `dst ≠ u`, `dst` strictement croissant, `w ≠ 0`, `|w| ≤ 10 000` (`BadEdge(rang)`) ;
- **B⁺ déclaré** : `bPlus ≥ max(10 000, Σ w⁺ engagés)` (`BadRows(7)`) ;
- **alias** (D20, copie de ligne d'un wallet partagé) : `src < u`, la ligne de `src` est déjà émise et n'est pas un alias (`BadRows(9)`), `u ≥ k` (une ancre n'est jamais une copie), les deux lignes portent un wallet et c'est le même (`BadRows(10)`), `nE = 0` et pas de bPlus (`BadRows(8)`). L'alias prend les arêtes **et** le B⁺ de la source, et les disperse avec **sa propre masse** t_u. Chaque copie compte ses arêtes positives dans E⁺.

Sémantique (normative, à respecter par le solveur) :
- **Une arête = la combinaison D14 des avis du client de u sur l'agent dst**, sur **tout l'historique** du couple : par tag `endorsement` du filtre, l'avis non révoqué d'index maximal ; s'il est hors bornes, ce tag ne donne rien (pas de repli sur un plus ancien) ; puis `w = min` si un poids < 0, sinon `max` ; `w = 0` ⇒ pas d'arête.
- **`feedbackIndex` (v1, vérifié au niveau Registry-verified)** = index de l'avis qui donne `w` ; **à égalité de poids entre tags, l'index le plus grand**.
- **Client de la ligne** : l'adresse de l'ancre (u < k) ou du nœud-adresse, sans wallet ; pour un nœud-agent, le `wallet` engagé, qui DOIT être son `agentWallet` au bloc de certification. Registry-verified refuse une ligne d'agent sans wallet (le repli owner D44 n'est pas implémenté, E6 sur accord de Hugo).
- **Forme exigée aux deux niveaux** (sinon une arête ou une ligne ne pourrait jamais être contestée) : toute cible est un nœud-agent (un avis ERC-8004 vise un agent) ; une ligne de nœud-agent porte son wallet ; une ligne d'ancre ou de nœud-adresse n'en porte pas (`EdgeMismatch(ligne, rang | 256)`). Le client ne DOIT être ni un contrôleur actuel de la cible (`isAuthorizedOrOwner`) ni son `agentWallet` (D16/D20) ; relu seulement au niveau Registry-verified.
- **B⁺ déclaré (D32)** : le certificateur PEUT omettre des arêtes positives d'une ligne (par exemple trop chères à relire) à condition de déclarer `bPlus` = la vraie somme `max(10 000, Σ w⁺ du vrai graphe)`. Les arêtes restantes gardent leur vrai poids normalisé : l'omission ne fait que baisser y (sûr pour la borne basse) et la masse omise `(bPlus − Σ w⁺ engagés)/bPlus` est ajoutée à la marge de eUp. **Une sous-déclaration n'est détectable par aucun des deux niveaux** (pas d'index par client) : elle est contestable par `proveEdge` (dilution, §6).
- **Ligne listée** : complète, ou partielle avec B⁺ déclaré. **Nœud sans ligne et de masse > 0 = tronqué**, payé par la marge `(1−α)·t`. Un nœud absorbant de masse non nulle DOIT être fourni avec une ligne vide (`nE = 0`) ; une ligne de masse nulle ne doit pas être fournie. **Chaque ancre DEVRAIT avoir une ligne complète** (veto certifié, D21).
- **Bit de veto certifié** : toute arête d'une ligne d'ancre a (u = a < k) de poids ≤ `vetoMax` pose le bit a dans le masque de veto de la cible (complément « best effort » de D33, falsifiable par omission au niveau Submitter-attested).

### 3.3 `graphRoot`
Feuille = `keccak256(octets de la ligne, de u au dernier edge)` (en-têtes optionnels compris). Réduction par paires `keccak256(g ‖ d)` ; un élément impair remonte tel quel ; 0 si aucune ligne.

### 3.4 Registry-verified (D32) : ce que le contrat relit

| Objet | Lecture | Refus |
|---|---|---|
| chaque ligne d'agent (alias compris) | `getAgentWallet(u) == wallet` | `EdgeMismatch(ligne, 256)` |
| chaque arête d'une ligne non alias | clé de `dst` = agent j ; `isAuthorizedOrOwner(client, j)` faux ; `getAgentWallet(j) ≠ client` ; `(w, feedbackIndex)` = combinaison D14 relue (`getLastIndex`, puis `readFeedback` de l'index maximal vers 1 jusqu'à avoir vu tous les tags endorsement du filtre) | `EdgeMismatch(ligne, rang)` |
| chaque agent de masse > 0 | `ownerFp == ownerOf(j) & (2^63−1)` ; 0 pour les autres nœuds | `EdgeMismatch(2^256−1, nœud)` |

Non vérifiable (pas d'index par client) : qu'une ligne soit complète, et qu'un `bPlus` déclaré soit la vraie somme.

## 4. Arithmétique entière exacte (ce que le contrat recalcule) — v1 (D26)

```
om      = alphaD − alphaN
B⁺_u    = bPlus_u si déclaré, sinon max(10 000, Σ_{w>0} w)        B⁻_u = max(10 000, Σ_{w<0} |w|)   (D7)
y_v^(a) = [v = a]·⌊alphaN·WAD / alphaD⌋ + Σ_{lignes u (alias compris), w_uv > 0} ⌊ t_u^(a)·om·w_uv / (alphaD·B⁺_u) ⌋
EXIGÉ   : t_v^(a) ≤ y_v^(a) pour tout v < nCert et tout a                          (D26, sinon NotSubSolution)
r_a     = Σ_v (y_v^(a) − t_v^(a))  +  E⁺ + 1
          + Σ_{v sans ligne, t_v^(a) ≠ 0} ⌈ t_v^(a)·om / alphaD ⌉                   (troncature)
          + Σ_{lignes u à B⁺ déclaré, B⁺_u > S⁺_u, t_u^(a) ≠ 0} ⌈ t_u^(a)·om·(B⁺_u − S⁺_u) / (alphaD·B⁺_u) ⌉   (masse omise)
eUp_a   = ⌈ r_a·alphaD / alphaN ⌉        ⇒ ‖t*^(a) − t^(a)‖₁ ≤ eUp_a                (L5 ; t ≤ t* par L2)
eEff    = Σ_a ⌈ λ_a·eUp_a / WAD ⌉                                                   (stocké ; règle de remplacement, méfiance)
eLow_a  = 0 à la soumission, élargi par les preuves (§6)     eLowEff = Σ_a ⌈ λ_a·eLow_a / WAD ⌉
T_u     = ⌈ Σ_a λ_a·t_u^(a) / WAD ⌉
d_v     = Σ_{lignes u, w_uv < 0} ⌈ T_u·om·|w_uv| / (alphaD·B⁻_u) ⌉                  (D4, arrondi au-dessus)
lecture : c_a = ⌊λ_a·t^(a)/WAD⌋ ; trustRobust = Σ c_a − (m−1 plus grands c_a) ;
          trustLow = trustRobust − eLowEff ; distrustUp = d + eEff
isTrusted ⇔ statut OK ∧ veto vérifié ∧ trustLow ≥ θ ∧ ρD·distrustUp ≤ ρN·trustLow
```
Sens des arrondis : chaque terme de y vers le bas (erreur < 1 wei par terme, comptée dans `E⁺ + 1`), les marges, eUp, eEff, eLow, T et d vers le haut, c_a vers le bas.

Pourquoi c'est une borne : `t ≤ y ≤ F_engagé(t)` et F_engagé est monotone, donc t ≤ t*_engagé (L1, L2) ; si C_engagé ≤ C_vrai entrée par entrée (domination, D32), t*_engagé ≤ t*_vrai. Pour eUp : `F_vrai(t) − t ≤ (y − t) + erreurs de plancher + marges`, et `(1−α)C^T` contracte la norme L1 des vecteurs positifs, d'où `‖t* − t‖₁ ≤ ‖F(t) − t‖₁/α`.

Normalisation d'un avis (veto, relecture, preuves et solveur, identique à `graph.quantize` de R4) :
```
x = value · 10^(18 − valueDecimals)       (exact en int256 ; valueDecimals > 18 ⇒ rejet)
x ∉ [min, max]  ⇒ rejet (jamais plafonné)
x > neutral ⇒ w =  trunc((x − neutral)·10 000 / (max − neutral))
x < neutral ⇒ w = −trunc((neutral − x)·10 000 / (neutral − min))
x = neutral ⇒ w = 0
```

## 5. Stockage (MIP-8) et lecture

- État de l'ensemble : une struct à une base **alignée sur une page** (`keccak("ANCRE.set.v1", setId) & ~127`), 98 slots, une seule page (8 100 gas à froid). Bornes par colonne (eUp, eLow) dans une seconde page (`keccak("ANCRE.col.v1", setId) & ~127`), lue seulement par les soumissions et les preuves.
- Clés de nœuds contiguës : `slot(keccak("ANCRE.key.v1", setId) & ~127) + i = clé du nœud i` (128 clés par page ; lues par la relecture du registre et les preuves).
- Vecteurs : base `keccak("ANCRE.vec.v1", setId) & ~127`. **Tranche c** = nœuds `4c..4c+3` ; `slot(c, v) = base + c·(k+3) + v`, avec v < k pour t^(v), v = k pour d, v = k+1 pour ownerFp, **v = k+2 pour les drapeaux** (bits 0..15 : masque de veto certifié, bit 16 : transfert prouvé). Lane `l` = bits `[64l, 64l+64)`. **Bit 255 toujours à 1** (sentinelle).
- ⚠️ Écart avec le CR (« contigus par colonne ») : colonnes entrelacées par tranche de 4 nœuds (AM-R5.10).
- `reserveCapacity(setId, uptoNodes)` écrit la sentinelle à l'avance.
- **Veto en direct (D33)** : pour chaque ancre, `getLastIndex(j, ancre)` puis **un seul** `readFeedback` ; veto ssi l'avis n'est pas révoqué, que son tag est `endorsement` dans le filtre et que son poids ≤ `vetoMax`. `vetoCount` = nombre d'ancres dont le veto tient (direct OU bit certifié) ; `VETOED` ssi `vetoCount ≥ q`. `MAX_SCAN` est supprimé.
- **Transfert (D35)** : mode strict = `ownerOf` en direct pour un agent de masse > 0 ; dans les deux modes, le bit « transfert prouvé » (`proveTransfer`) donne `TRANSFERRED`.

## 6. Preuves d'écart (v1, 28/09) — `proveEdge`, `proveWallet`, `proveTransfer`

Toutes sont **sans permission** ; le prouveur paie le gas. Elles portent sur le certificat courant (`certNonce`).

### 6.1 `proveEdge(setId, r, src, amends, agentJ)` — une preuve pour tous les écarts d'arête
- `r = (pos, row, path)` : la ligne engagée de u et son chemin Merkle vers `graphRoot` (le chemin est ignoré dès que la ligne a été amendée : `rowState.h = keccak(leaf ‖ amends)` fait foi).
- `src` : pour une ligne alias, la ligne source engagée (chemin Merkle obligatoire) ; ignoré sinon.
- `amends` : amendements précédents de la ligne dans ce certificat, `(agentId:u32 ‖ wEngagé:int16 ‖ wActuel:int16)*`, une entrée par agent.
- Le contrat relit **maintenant** `wNew` = combinaison D14 de (client_u → agentJ) sur tout l'historique (0 si le client est un contrôleur actuel de agentJ ou son `agentWallet`), et la compare à `wOld` (poids courant de la ligne : amendement, sinon arête engagée, sinon 0). `wNew = wOld` ⇒ `NothingToProve`. Pour une ligne d'agent, le `wallet` engagé doit encore être son `agentWallet` (sinon `proveWallet`).
- Cas couverts : (i) OMISSION (wOld = 0), avec ou sans dilution de B⁺ ; (ii) PÉRIMÉ et (iii) RÉVOQUÉ (wNew ≠ wOld après coup) ; contrôleur apparu ; **(v) FABRICATION / GONFLEMENT** (wNew < wOld), indispensable au niveau Submitter-attested.
- Montant, par côté de la ligne normalisée (+ avec `G = bPlus` déclaré ou 10 000 ; − avec `G = 10 000`), somme courante S → S' = S − wo + wn, `B = max(G, S)`, `B' = max(G, S')`, `rest = S − wo` :
```
dec = ⌈ WAD · [ rest·(B' − B)⁺ + (wo·B' − wn·B)⁺ ] / (B·B') ⌉      (baisse de la masse normalisée du côté)
inc = ⌈ WAD · [ rest·(B − B')⁺ + (wn·B − wo·B')⁺ ] / (B·B') ⌉      (hausse)
plafonds par ligne (D22) : Σ dec⁺ ≤ ⌈WAD·S⁰/B⁰⌉ (masse positive engagée), Σ inc⁺ ≤ WAD, Σ inc⁻ ≤ WAD
eLow_a += ⌈ t_u^(a)·om·dec⁺ / (alphaN·WAD) ⌉            (seules les baisses du côté + touchent la borne basse)
eUp_a  += ⌈ t_u^(a)·om·(inc⁺ + inc⁻) / (alphaN·WAD) ⌉  (hausses des deux côtés : borne haute, méfiance)
```
  `(1−α)·t_u·Δ` est la variation L1 de F(t) ; la division par α majore l'effet sur le point fixe (contraction). Les baisses du côté − (méfiance surestimée) sont sans effet (sûr).
- Puis `eLowEff`, `eEff` sont recalculés ; `eLowEff > eLowMax` ⇒ `STALE` (D36).

### 6.2 `proveWallet(setId, r, amends)` — (iv) WALLET
Ligne d'agent dont le `wallet` engagé n'est plus l'`agentWallet` de l'agent (effacé à chaque transfert : cela **gèle les arêtes sortantes** d'un agent transféré, D44). Pire cas : toute la masse positive restante est perdue (`dim` porté à WAD) et la nouvelle ligne est inconnue (`inc⁺`, `inc⁻` portés à WAD) ; la ligne devient `voided` (plus aucune preuve dessus).

### 6.3 `proveTransfer(setId, agentId)` — mode rapide (D25/D35)
Agent certifié dont `ownerOf` ne correspond plus à `ownerFp` : pose le bit « transfert prouvé » ; `assess` rend alors `TRANSFERRED` dans les deux modes.

## 7. Divergences R4/R5 et décisions (mis à jour le 28/09, contrat v1)

| # | Point | Décision |
|---|---|---|
| F1 | résidu « tight » de R4 | sans objet en v1 : D26 exige t ≤ y, eUp = ⌈r/α⌉ avec r du §4 |
| F2 | veto borné à `MAX_SCAN = 32` | **fermé** : `MAX_SCAN` supprimé. Veto en direct = dernier avis de l'ancre (D33) ; les arêtes (relecture, preuves) balaient tout l'historique du couple, sans fenêtre |
| F3 | « dernier puis rejet » contre « dernier valide » | **dernier puis rejet** (par tag : le dernier avis non révoqué ; hors bornes ⇒ le tag ne donne rien) |
| F4 | sémantique du wallet | §3.2 : obligatoire sur une ligne d'agent, interdit ailleurs |
| F5 | méfiance combinée λ, arrondie au-dessus | aligné |
| F6 | `feedbackIndex` | v1 : index de l'avis qui donne w, égalité ⇒ index le plus grand ; vérifié au niveau Registry-verified |
| F7 | arêtes de relais (R4, `feedbackIndex = 0`) | **non supportées** en v1 : toute arête est un avis réel d'un client sur un agent |

### Changements v0 → v1 à reporter dans `solver/` (chantier 04)
1. `setId` v1 (§1, politique complète).
2. Itération **depuis 0** obligatoire, le contrat exige t ≤ y (§3.1, lemme L3).
3. Drapeaux de ligne 0x4000 (B⁺ déclaré) et 0x2000 (alias D20) (§3.2), marge de masse omise dans r (§4).
4. `ownerFp` : 0 n'est plus un contournement ; vérifié au niveau Registry-verified pour les agents de masse > 0.
5. Cibles = agents uniquement ; lignes d'ancres et d'adresses sans wallet ; lignes d'agents avec wallet.
6. Stockage : 4e lane de drapeaux (stride k+3) ; `certificate()` renvoie aussi `eLowEff` ; `residual()` remplacé par `columnBounds()`.

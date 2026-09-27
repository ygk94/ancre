# ENCODING — contrat d'interface entre le solveur (R4) et `AnchoredReputation.sol` (R5)

> Version `ancre-cert-v0`, 2026-09-27. Source de vérité : `src/AnchoredReputation.sol`. Implémentation de référence côté test : `test/utils/CertLib.sol` (même arithmétique, octet pour octet).
> Alignement vérifié avec `solver/FORMAT.md` (R4, lu le 27/09 vers 13:30) : **aucune divergence d'encodage ni d'arithmétique**. Les divergences de sémantique registre (F2, F3, F4) sont tranchées ou ouvertes au §7.
> Big-endian partout. `WAD = 1e18`. `GRID = 10 000` (grille de poids de 1e-4).

## 1. Ensemble d'ancres (`registerAnchorSet`, une fois, immuable)

```
setId = keccak256(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy))
  anchors  address[]  strictement croissantes, 1..K_MAX = 16. L'ancre a est le nœud a (indices 0..k-1).
  lambdas  uint64[]   WAD, aucun nul, somme = 1e18 exactement
  alphaN/alphaD uint32  0 < alphaN < alphaD (défaut D2 : 1/3)
  tagSchemaHash bytes32  hash du schéma complet hors chaîne (D12)
  tags     TagSpec[]  ≤ TAGS_MAX = 8, triés par keccak256(tag) strictement croissant
           TagSpec = (string tag ≤ 32 octets, int128 min, int128 neutral, int128 max, uint8 kind)
           bornes en WAD ; min ≤ neutral ≤ max, min < max ; kind 0 = endorsement, 1 = measurement
  policy   (uint8 minAnchors ≥ 1, uint64 maxAge > 0, uint64 minRefresh, uint64 slackRefresh WAD)
```
Démo : les ancres sont des adresses (pas de pré-rotation D9, TODO).

## 2. Table de nœuds (append-only)

Clé de nœud (bytes32) : `kind << 248 | valeur`, `kind` = 1 agent (agentId), 2 adresse, 3 ancre. Index stable, écrit une fois (`nodeIndexPlus1[setId][key] = index + 1`).

`newNodes` (argument de `submitCertificate`) et `addNodes(setId, entries)` : suite d'entrées
```
0x01 ‖ agentId:u32        (agent ; agentId ≥ 2^32 non supporté en v0)
0x02 ‖ address:20         (nœud-adresse : wallet ambigu ou sans agent, D16)
```
Ordre canonique d'un premier certificat (FORMAT.md) : ancres, agents par agentId croissant, adresses croissantes. Les nœuds suivants s'ajoutent à la fin.

## 3. `submitCertificate(setId, nCert:u32, eMax:u256, newNodes, vectors, rows)`

- Nœuds certifiés : `[0, nCert)`. `nCert` est **non décroissant** d'un certificat à l'autre, `k ≤ nCert ≤ nodeCount`.
- `eMax` : borne annoncée par le soumetteur ; revert `ResidualTooLarge(eEff, eMax)` si l'`eEff` recalculé la dépasse. Pour obtenir `eEff` avant d'envoyer, appeler `dryRun(setId, nCert, vectors, rows)` (vue).

### 3.1 `vectors` — `nCert × (k+1) × 8` octets
```
pour i dans [0, nCert) : t_i^(0) : u64 ‖ … ‖ t_i^(k-1) : u64 ‖ ownerFp_i : u64
```
- `t_i^(a)` en WAD, **< 2^63** (sinon `ValueTooLarge`).
- `ownerFp_i = uint160(ownerOf(agentId)) & (2^63 − 1)` pour un nœud-agent, **0 sinon**. 0 désactive le contrôle `TRANSFERRED` : un certificateur honnête DOIT le remplir pour chaque agent (D10).
- `vectorRoot = keccak256(vectors)` (engagement plat, pas un Merkle : les preuves d'écart lisent t dans le stockage).

### 3.2 `rows`
```
rows  = W:u8 ‖ numRows:u32 ‖ row*          W = 2 si nCert ≤ 65 535, sinon 4
row   = u:W ‖ hdr:u16 ‖ [wallet:20] ‖ edge*nE
hdr   = nE | 0x8000 si wallet présent        nE ≤ ROW_MAX = 256
edge  = dst:W ‖ w:int16 ‖ feedbackIndex:u32  (8 octets si W = 2, 10 si W = 4)
```
Règles vérifiées on-chain (revert sinon) :
- lignes par `u` strictement croissant, `u < nCert`, `numRows ≤ nCert`, fin exacte du tampon ;
- dans une ligne : `dst < nCert`, `dst ≠ u`, `dst` strictement croissant, `w ≠ 0`, `|w| ≤ 10 000` (c'est le contrôle « hors grille » : l'int16 est la grille, D18).

Sémantique (normative, à respecter par le solveur) :
- **Une arête = la combinaison D14 des avis du client de u sur l'agent dst** : par tag `endorsement` du filtre, l'avis non révoqué d'index maximal ; s'il est hors bornes, ce tag ne donne rien ; puis `w = min` si un poids < 0, sinon `max` ; `w = 0` ⇒ pas d'arête. `feedbackIndex` = index de l'avis retenu (non vérifié on-chain en v0 ; sert aux preuves (ii)/(iii)).
- **wallet (F4)** : présent pour la ligne d'un **nœud-agent** et égal à l'`agentWallet` de cet agent à la certification (c'est le client dont on lit les avis). Absent pour les nœuds-adresse et les ancres, dont le client est l'adresse de la clé. Une ligne d'agent sans wallet ne peut pas être contestée par omission (`BadProof(7)`).
- **Ligne listée = ligne complète** (contestable par omission). **Nœud sans ligne et de masse > 0 = tronqué**, payé par la marge `(1−α)·t`. Donc (FORMAT.md §3.1) : un nœud absorbant de masse non nulle DOIT être fourni avec une **ligne vide** (`nE = 0`) ; une ligne de masse nulle ne doit pas être fournie (elle ajoute ses arêtes positives à E⁺).
- Coût : ~8 octets/arête à W = 2 (dont 3 octets nuls si `feedbackIndex < 256`), + `W + 2` (+20 avec wallet) par ligne.

### 3.3 `graphRoot`
Feuille = `keccak256(octets de la ligne, de u au dernier edge)`. Réduction par paires `keccak256(g ‖ d)` ; un élément impair remonte tel quel ; 0 si aucune ligne. La preuve Merkle de `proveOmission` suit la même règle (position = rang de la ligne).

## 4. Arithmétique entière exacte (ce que le contrat recalcule)

```
om      = alphaD − alphaN
B⁺_u    = max(10 000, Σ_{w>0} w)         B⁻_u = max(10 000, Σ_{w<0} |w|)          (budgets séparés, D7)
y_v^(a) = [v = a]·⌊alphaN·WAD / alphaD⌋ + Σ_{lignes u, w_uv > 0} ⌊ t_u^(a)·om·w_uv / (alphaD·B⁺_u) ⌋   (convention absorbante, D5)
r_a     = Σ_{v<nCert} |t_v^(a) − y_v^(a)|  +  E⁺ + 1  +  Σ_{v sans ligne} ⌈ t_v^(a)·om / alphaD ⌉
          E⁺ = nombre d'arêtes positives de toutes les lignes fournies ; +1 = plancher du terme alpha
e_a     = ⌈ r_a·alphaD / alphaN ⌉        ⇒ ‖t^(a) − t*^(a)‖₁ ≤ e_a   (contraction de facteur 1−α en L1)
eEff    = Σ_a ⌈ λ_a·e_a / WAD ⌉
T_u     = ⌈ Σ_a λ_a·t_u^(a) / WAD ⌉
d_v     = Σ_{lignes u, w_uv < 0} ⌈ T_u·om·|w_uv| / (alphaD·B⁻_u) ⌉          (méfiance à un saut, D4, combinée λ, arrondie au-dessus)
```
Sens des arrondis : chaque terme de y est arrondi vers le bas, avec une erreur < 1 wei comptée dans `E⁺ + 1`. Les marges de troncature, e, eEff et d sont arrondies vers le haut. Aucun arrondi ne peut réduire la borne.

Pourquoi la borne tient : `‖t − F_vrai(t)‖₁ ≤ Σ|t − ŷ| + (erreur de plancher) + Σ_{tronqués} (1−α)·t_u`, puisqu'une ligne manquante déplace au plus `(1−α)·t_u` de masse en L1.

Normalisation d'un avis (veto, preuve d'omission et solveur, identique à `graph.quantize` de R4) :
```
x = value · 10^(18 − valueDecimals)       (exact en int256 ; valueDecimals > 18 ⇒ rejet)
x ∉ [min, max]  ⇒ rejet (jamais plafonné)
x > neutral ⇒ w =  trunc((x − neutral)·10 000 / (max − neutral))
x < neutral ⇒ w = −trunc((neutral − x)·10 000 / (neutral − min))
x = neutral ⇒ w = 0
```

## 5. Stockage (MIP-8) et lecture

- État de l'ensemble : une struct à une base **alignée sur une page** (`keccak("ANCRE.set.v1", setId) & ~127`), donc une seule page de 128 slots (8 100 gas à froid).
- Vecteurs : base `keccak("ANCRE.vec.v1", setId) & ~127`. **Tranche c** = nœuds `4c..4c+3` ; `slot(c, v) = base + c·(k+2) + v`, avec v < k pour t^(v), v = k pour d, v = k+1 pour ownerFp. Lane `l` = bits `[64l, 64l+64)`. **Bit 255 toujours à 1** (sentinelle) : un slot n'est jamais nul, donc une réécriture coûte le tarif x→y.
- ⚠️ **Écart avec le CR** (« contigus par colonne ») : les colonnes sont entrelacées par tranche de 4 nœuds. Une lecture de k colonnes touche ainsi une page au lieu de k (économie de (k−1)·8 100 gas par `assess`). En écriture, les slots restent contigus.
- `reserveCapacity(setId, uptoNodes)` écrit la sentinelle à l'avance, ce qui permet d'étaler le coût 0→x d'un premier gros certificat sur plusieurs transactions.

## 6. Preuve d'écart (i) OMISSION — `proveOmission(setId, rowPos, row, proof, added, nodeKeyU, agentJ)`

- `row` : octets de la ligne engagée ; `proof` : chemin Merkle vers `graphRoot`, tant que la ligne n'a pas été amendée dans ce certificat.
- `added` : amendements précédents de la ligne dans ce certificat, `(agentId:u32 ‖ w:int16)*`. `rowState = keccak(leaf ‖ added)` ; chaque arête ajoutée n'est facturée qu'une fois.
- Client : l'adresse de `nodeKeyU` (ancre ou adresse), ou le `wallet` de la ligne pour un agent.
- Rejets : arête déjà présente, `isAuthorizedOrOwner(client, j)`, `agentWallet(j) == client` (D16, partie lisible on-chain), poids D14 nul.
- Élargissement : sur le côté qui change (S = somme de ce côté, `B = max(G, S)`, `B' = max(G, S + |w|)`),
  `Δ = (|w|·B + S·(B' − B)) / (B·B')`, puis `r_a += ⌈ t_u^(a)·om·Δ / alphaD ⌉` pour chaque a, et `eEff` est recalculé.
- TODO documentés : (ii) PÉRIMÉ, (iii) RÉVOQUÉ, (iv) WALLET ; règle « ancien owner » de D16 (l'historique `Transfer` n'est pas lisible on-chain).

## 7. Divergences R4/R5 et décisions

| # | Point | Décision R5 |
|---|---|---|
| F1 | résidu « tight » de R4 | non adopté on-chain (quelques wei d'écart) ; R4 exporte déjà la valeur R5 |
| F2 | veto limité à `MAX_SCAN = 32` avis par couple | **ouvert** (AM-R5.6) : cas réel 0x443cbff0 → #4 avec 73 avis |
| F3 | « dernier puis rejet » contre « dernier valide » | **dernier puis rejet**, identique chez R4 et R5 ; le texte de la preuve (ii) du CR est à réécrire en conséquence |
| F4 | sémantique du wallet | tranché au §3.2 |
| F5 | méfiance combinée λ, arrondie au-dessus | aligné |

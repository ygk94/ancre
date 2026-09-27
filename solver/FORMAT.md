# Format de certificat `ancre-cert-v0` (vecteurs de test R4 → R5)

Produit par `export.py`, relu et revérifié par `export.check_file` (et par `tests/test_solver.py::test_published_vectors_verify`).
Vecteurs publiés : `vectors/*.json` (commande : `.venv/bin/python export.py`).

**Alignement.** Aligné sur `contracts/src/AnchoredReputation.sol` tel que lu le 2026-09-27 vers 12:55 (`submitCertificate`, `_verifyPass`, `_pass1`, `_pass2`, `_merkleRoot`, `_eEff`, `_registryEdge`, `_normalize`). `contracts/ENCODING.md` **n'était pas publié** : si R5 le publie, ce document doit être réaligné. Divergences relevées en fin de fichier.

Tous les entiers > 2^53 sont des **chaînes décimales**.

## 1. Champs JSON

| Champ | Contenu |
|---|---|
| `format` | `"ancre-cert-v0"` |
| `label`, `notes` | nom du cas et ce qu'il illustre |
| `identityBlock` | bloc de l'état IdentityRegistry utilisé (owner, agentWallet, opérateurs), `null` pour les jouets |
| `set.anchors` | adresses des ancres, **strictement croissantes** ; l'ancre `a` est le nœud `a` |
| `set.lambdas` | λ_a en WAD, Σ = 1e18, aucun nul |
| `set.alphaN`, `set.alphaD` | α = αN/αD, 0 < αN < αD |
| `set.minAnchors` | m du leave-one-out (2) |
| `set.tags` | filtre ≤ 8 tags, trié par `keccak(tag)` croissant ; `min`/`neutral`/`max` en WAD ; `kind` 0 = endorsement, 1 = measurement |
| `nCert` | nombre de nœuds certifiés `[0, nCert)` |
| `nodes[i]` | `kind ∈ {anchor, agent, address}`, `agentId` ou `address`, `owner`/`agentWallet` (agents), `hasRow` |
| `rows[]` | lignes fournies, `u` strictement croissant : `wallet` engagé (ou `null`), `bPlus`, `bMinus`, `edges[]` |
| `rows[].edges[]` | `dst` (index), `w` (int16, grille 1e-4), `feedbackIndex` (u32 ; 0 = arête de relais, variante non décidée), plus `client`/`agentId`/`tag1` pour la relecture humaine (non encodés) |
| `vectors.t[a][i]` | t_i^(a) en WAD, < 2^63 (lane du contrat) |
| `vectors.ownerFp[i]` | `uint160(owner) & (2^63−1)` pour un nœud-agent, 0 sinon (0 désactive le contrôle `TRANSFERRED`) |
| `expected.r[a]`, `expected.e[a]` | résidu et borne L1 attendus du contrat, en wei |
| `expected.eEff` | Σ_a ⌈λ_a·e_a / WAD⌉ |
| `expected.d[i]` | méfiance combinée (voir §3) |
| `expected.graphRoot` | Merkle des lignes (feuille = keccak des octets de la ligne, §2) |
| `expected.vectorRoot` | keccak256 du calldata `vectors` |
| `expected.tight` | r, e selon la variante R4 plus serrée (information, non stockée on-chain) |
| `calldata.newNodes`, `.vectors`, `.rows` | octets prêts pour `submitCertificate(setId, nCert, eMax, newNodes, vectors, rows)` |

## 2. Encodage binaire (big-endian)

- `newNodes` : pour chaque nœud `i ≥ k`, dans l'ordre : `0x01 ‖ agentId:u32` (agent) ou `0x02 ‖ address:20` (adresse). Les ancres sont créées par `registerAnchorSet`. Ordre canonique d'un premier certificat : ancres, puis agents par agentId croissant, puis adresses croissantes. La table on-chain est append-only : un certificat suivant réutilise les indices existants.
- `vectors` : `nCert` enregistrements de `(k+1) × u64` : `t^(0..k-1)_i`, puis `ownerFp_i`.
- `rows` : `W:u8` (2 si nCert ≤ 65 535, sinon 4) ‖ `numRows:u32`, puis pour chaque ligne :
  `u:W` ‖ `hdr:u16` (= nE | 0x8000 si wallet engagé) ‖ [`wallet:20`] ‖ nE × (`dst:W` ‖ `w:int16` ‖ `feedbackIndex:u32`).
  Règles : `dst < nCert`, `dst ≠ u`, `dst` strictement croissant dans la ligne, `w ≠ 0`, |w| ≤ 10 000, nE ≤ ROW_MAX = 256.
- `graphRoot` : feuilles = keccak(octets de la ligne, de `u` au dernier edge) ; réduction par paires keccak(g‖d), l'élément impair remonte tel quel ; 0 si aucune ligne.

## 3. Arithmétique normative (ce que le contrat recalcule)

```
B⁺_u = max(10000, Σ w⁺)      B⁻_u = max(10000, Σ |w⁻|)          om = αD − αN
y_v^(a) = [v = a]·⌊αN·WAD/αD⌋ + Σ_{lignes u, w_uv>0} ⌊ t_u^(a)·om·w_uv / (αD·B⁺_u) ⌋
r_a     = Σ_v |t_v^(a) − y_v^(a)|  +  E⁺ + 1  +  Σ_{v listé sans ligne, t_v^(a) ≠ 0} ⌈ t_v^(a)·om / αD ⌉
          (E⁺ = nombre d'arêtes positives de TOUTES les lignes fournies, y compris celles de masse nulle)
e_a     = ⌈ r_a·αD / αN ⌉                        =>  ‖t^(a) − t*^(a)‖₁ ≤ e_a  (wei)
d_v     = Σ_{lignes u, w_uv<0} ⌈ ⌈Σ_a λ_a t_u^(a) / WAD⌉ · om · |w_uv| / (αD·B⁻_u) ⌉
lecture : c_a = ⌊λ_a·t^(a)/WAD⌋ ; trustRobust = Σ c_a − (m−1 plus grands c_a)
```

**Conséquences normatives à respecter par tout certificateur** (mesurées dans R4) :
1. **Un nœud absorbant de masse non nulle DOIT être fourni avec une ligne vide (nE = 0).** Sinon il est compté comme tronqué et paie la marge (1−α)·t_v. Sur le mainnet, oublier la ligne vide de #18 fait passer e de 9 wei à 4,4·10^17 wei (0,44 WAD), mesuré pendant le développement de `ppr.certify`.
2. Une ligne de masse nulle ne doit pas être fournie : elle ne change pas y mais ajoute ses arêtes positives à E⁺.
3. Le poids est calculé par `graph.quantize` : v = value·10^(18−dec) exact, rejet si v ∉ [min, max] (jamais plafonné), w = trunc((v−n)·1e4/(max−n)) si v > n, −trunc((n−v)·1e4/(n−min)) si v < n, 0 si v = n. Identique à `_normalize` de R5.
4. Unité d'arête : par (client, agent, tag1), l'avis non révoqué d'index maximal ; s'il est hors bornes, ce tag ne donne rien (pas de repli sur un avis plus ancien, comme `_registryEdge` de R5). Puis dominance du négatif entre tags : w = min si un poids < 0, sinon max ; w = 0 ⇒ pas d'arête.

## 4. Divergences avec R5 (à trancher)

| # | Point | R4 | R5 (code du 27/09) | Avis |
|---|---|---|---|---|
| F1 | Résidu | mode `tight` disponible : Σ max(y+n_v−t, t−y), n_v = planchers inexacts | Σ\|t−y\| + E⁺ + 1 | Les deux sont sûrs. Écart négligeable (quelques wei). R4 exporte la valeur R5. |
| F2 | Veto on-chain | historique complet du couple | fenêtre `MAX_SCAN = 32` avis | **Cas réel** : 0x443cbff0 → #4, 73 avis, 14 tags sur 26 dont le dernier avis sort de la fenêtre (AM-R4.6). |
| F3 | Choix « dernier puis rejet » contre « dernier valide » | défaut aligné sur R5 | dernier puis rejet | La preuve d'écart (ii) du CR dit « feedback valide plus récent » : à réécrire. 0 triplet concerné sur le mainnet. |
| F4 | Wallet engagé dans la ligne | engagé pour toute ligne d'un nœud-agent dont le wallet ≠ 0, même vide ou ambigu | drapeau 0x8000, sémantique non documentée | à confirmer dans ENCODING.md |
| F5 | Méfiance | combinée λ, arrondie au-dessus (aligné) | idem | R4 ne produit plus de d par colonne |

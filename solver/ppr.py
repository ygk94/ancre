"""ANCRE R4 — PPR (EigenTrust personnalisé) signé, certificat à résidu vérifié en entiers.

Conventions (CR) :
  D5   absorbante : une ligne sans arête positive ne redistribue rien (Σt <= 1, linéarité exacte en p).
  D7   budgets séparés : C_uv = q⁺_uv / B⁺_u, D_uv = |q⁻_uv| / B⁻_u, B± = max(GRID, Σ|q±|) (i.e. max(1, Σw±)).
       t = (1-α) Cᵀ t + α p ;  d = (1-α) Dᵀ t (un seul saut).
  D8   une colonne par ancre ; leave-one-out : on retire les m-1 plus grosses contributions λ_a·t^(a).
  D2   α = αN/αD rationnel, engagé dans le certificat.

Vérification (ce que le contrat refait, en entiers, t en uint64 WAD ; détail normatif dans FORMAT.md) :
  pour chaque colonne a, chaque nœud listé v :
    y_v = [v == a]·⌊αN·WAD/αD⌋ + Σ_{u avec ligne, q_uv>0} ⌊ t_u·(αD−αN)·q_uv / (αD·B⁺_u) ⌋
  mode "contract" (R5) : r_a = Σ_v |t_v − y_v| + E⁺ + 1 + Σ_{u listé sans ligne} ⌈ t_u·(αD−αN)/αD ⌉
                         (E⁺ = nombre d'arêtes positives fournies : chaque plancher perd < 1 wei)
  mode "tight"   (R4) : r_a = Σ_v max(y_v + n_v − t_v, t_v − y_v) + marge, n_v = planchers inexacts vers v
  e_a = ⌈ r_a·αD/αN ⌉      => ‖t^(a) − t*^(a)‖₁ <= e_a (en wei), car F est (1−α)-contractante en L1.
  d_v = Σ_{u avec ligne, q_uv<0} ⌈ ⌈Σ_a λ_a t_u^(a) / WAD⌉·(αD−αN)·|q_uv| / (αD·B⁻_u) ⌉   (méfiance combinée, majorée)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction

import numpy as np

from graph import GRID, WAD, ROW_MAX, Graph

U64_MAX = 2**64 - 1


def ceil_div(a: int, b: int) -> int:
    return -((-a) // b)


# ----------------------------------------------------------------------------- solveurs


def _arrays(g: Graph):
    src, dst, cw, dw = [], [], [], []
    for u, row in g.rows.items():
        bp, bm = g.bplus(u), g.bminus(u)
        for e in row:
            src.append(u); dst.append(e.dst)
            cw.append(e.q / bp if e.q > 0 else 0.0)
            dw.append(-e.q / bm if e.q < 0 else 0.0)
    return (np.array(src, dtype=np.int64), np.array(dst, dtype=np.int64),
            np.array(cw, dtype=np.float64), np.array(dw, dtype=np.float64))


def solve_float(g: Graph, alpha: Fraction, p: np.ndarray, tol: float = 1e-17, max_iter: int = 100000,
                arrays=None) -> np.ndarray:
    """Point fixe t = (1-α)Cᵀt + αp par itération (float64). p : vecteur (ou matrice n×k) de masse d'amorce."""
    src, dst, cw, _ = arrays if arrays is not None else _arrays(g)
    a = float(alpha)
    P = p if p.ndim == 2 else p[:, None]
    t = a * P.copy()
    for _ in range(max_iter):
        flow = t[src] * cw[:, None]
        nt = a * P + (1 - a) * np.stack([np.bincount(dst, weights=flow[:, j], minlength=g.n)
                                          for j in range(P.shape[1])], axis=1)
        diff = np.abs(nt - t).sum()
        t = nt
        if diff < tol:
            break
    return t if p.ndim == 2 else t[:, 0]


def distrust_float(g: Graph, alpha: Fraction, t: np.ndarray, arrays=None) -> np.ndarray:
    src, dst, _, dw = arrays if arrays is not None else _arrays(g)
    T = t if t.ndim == 2 else t[:, None]
    flow = T[src] * dw[:, None]
    d = (1 - float(alpha)) * np.stack([np.bincount(dst, weights=flow[:, j], minlength=g.n)
                                        for j in range(T.shape[1])], axis=1)
    return d if t.ndim == 2 else d[:, 0]


def solve_exact(g: Graph, alpha: Fraction, anchor: int) -> list[Fraction]:
    """Solution exacte en rationnels de (I − (1−α)Cᵀ) t = α e_anchor (Gauss, petits graphes)."""
    n = g.n
    A = [[Fraction(0)] * n for _ in range(n)]
    for i in range(n):
        A[i][i] = Fraction(1)
    for u, row in g.rows.items():
        bp = g.bplus(u)
        for e in row:
            if e.q > 0:
                A[e.dst][u] -= (1 - alpha) * Fraction(e.q, bp)
    b = [Fraction(0)] * n
    b[anchor] = alpha
    # élimination de Gauss avec pivot non nul
    for c in range(n):
        piv = next(r for r in range(c, n) if A[r][c] != 0)
        A[c], A[piv] = A[piv], A[c]
        b[c], b[piv] = b[piv], b[c]
        inv = 1 / A[c][c]
        for r in range(n):
            if r != c and A[r][c] != 0:
                f = A[r][c] * inv
                A[r] = [x - f * y for x, y in zip(A[r], A[c])]
                b[r] -= f * b[c]
    return [b[i] / A[i][i] for i in range(n)]


# ----------------------------------------------------------------------------- certificat entier

MODES = ("contract", "tight")
# "contract" = arithmétique de contracts/src/AnchoredReputation.sol (R5, état du 27/09 12:55, _verifyPass) :
#     r_a = Σ_v |t_v − y_v| + (#arêtes positives des lignes fournies) + 1 + Σ_{u listé sans ligne, t_u≠0} ⌈t_u(αD−αN)/αD⌉
# "tight"    = variante R4 plus serrée : r_a = Σ_v max(y_v + n_v − t_v, t_v − y_v) + marge, n_v = divisions inexactes.
# Les deux sont sûres (majorent ‖F(t) − t‖₁) ; seule "contract" reproduit la valeur stockée on-chain.


@dataclass
class Certificate:
    n: int
    anchors: list[int]                       # nœuds 0..k-1 (convention R5 : l'ancre a est le nœud a)
    alphaN: int
    alphaD: int
    lambdas: list[int]                       # WAD, Σ = WAD
    rows: dict[int, list[tuple[int, int, int]]]   # u -> [(dst, q, feedbackIndex)] ; u sans ligne = tronqué
    bplus: dict[int, int]
    bminus: dict[int, int]
    t: list[list[int]]                       # [k][n] uint64 WAD
    node_map: list[int] = field(default_factory=list)   # index certificat -> index du graphe
    mode: str = "contract"
    r: list[int] = field(default_factory=list)
    e: list[int] = field(default_factory=list)
    d: list[int] = field(default_factory=list)          # méfiance combinée (λ), arrondie vers le haut

    @property
    def k(self) -> int:
        return len(self.anchors)

    @property
    def truncated(self) -> set[int]:
        """T : nœuds listés, de masse non nulle, sans ligne fournie."""
        return {v for v in range(self.n) if v not in self.rows and any(self.t[a][v] for a in range(self.k))}


def _int_pass(n, anchors, aN, aD, rows, bplus, bminus, t, lambdas):
    """Une passe entière (identique au contrat) : y (plancher) par colonne, n_v (divisions inexactes),
    nombre d'arêtes positives, et méfiance combinée d (plafond)."""
    k = len(anchors)
    y = [[0] * n for _ in range(k)]
    inexact = [[0] * n for _ in range(k)]
    d = [0] * n
    pa, pr = divmod(aN * WAD, aD)
    for a, s in enumerate(anchors):
        y[a][s] += pa
        inexact[a][s] += 1 if pr else 0
    om = aD - aN
    e_pos = 0
    for u, row in rows.items():
        bp, bm = bplus.get(u, GRID), bminus.get(u, GRID)
        e_pos += sum(1 for _, q, _ in row if q > 0)
        tu = [t[a][u] for a in range(k)]
        if not any(tu):
            continue
        tsum = sum(lambdas[a] * tu[a] for a in range(k))
        numC = ceil_div(tsum, WAD) * om
        for dst, q, _ in row:
            if q > 0:
                for a in range(k):
                    if tu[a]:
                        quo, rem = divmod(tu[a] * om * q, aD * bp)
                        y[a][dst] += quo
                        if rem:
                            inexact[a][dst] += 1
            else:
                d[dst] += ceil_div(numC * (-q), aD * bm)
    return y, inexact, e_pos, d


def _residual(mode, n, k, aN, aD, rows, t, y, inexact, e_pos):
    r = []
    om = aD - aN
    for a in range(k):
        ra = 0
        for v in range(n):
            tv, yv = t[a][v], y[a][v]
            if mode == "contract":
                ra += abs(tv - yv)
            else:
                ra += max(yv + inexact[a][v] - tv, tv - yv)
            if tv and v not in rows:                      # tronqué : marge (1−α)·t_u arrondie au-dessus
                ra += ceil_div(tv * om, aD)
        if mode == "contract":
            ra += e_pos + 1
        r.append(ra)
    return r


def verify(cert: Certificate) -> tuple[list[int], list[int], list[int], list[str]]:
    """Recalcule r, e, d exactement comme le contrat. Renvoie (r, e, d, erreurs de format)."""
    errs = []
    n, aN, aD, k = cert.n, cert.alphaN, cert.alphaD, cert.k
    if not (0 < aN < aD):
        errs.append("alpha hors ]0,1[")
    if sum(cert.lambdas) != WAD or len(cert.lambdas) != k or any(l == 0 for l in cert.lambdas):
        errs.append("lambdas : Σ != WAD ou λ nul")
    if cert.anchors != list(range(k)):
        errs.append("les ancres doivent être les nœuds 0..k-1")
    for a in range(k):
        for v in range(n):
            if not 0 <= cert.t[a][v] < 2**63:
                errs.append(f"t[{a}][{v}] hors lane 63 bits")
    for u, row in cert.rows.items():
        if not 0 <= u < n:
            errs.append(f"ligne {u} hors table")
        if len(row) > ROW_MAX:
            errs.append(f"ligne {u} > ROW_MAX")
        prev = -1
        for dst, q, _ in row:
            if not (-GRID <= q <= GRID) or q == 0:
                errs.append(f"poids hors grille {u}->{dst}: {q}")
            if not 0 <= dst < n or dst == u:
                errs.append(f"dst invalide {u}->{dst}")
            if dst <= prev:
                errs.append(f"ligne {u} non triée strictement par dst")
            prev = dst
        if cert.bplus[u] != max(GRID, sum(q for _, q, _ in row if q > 0)):
            errs.append(f"B+ faux ligne {u}")
        if cert.bminus[u] != max(GRID, sum(-q for _, q, _ in row if q < 0)):
            errs.append(f"B- faux ligne {u}")
    y, inexact, e_pos, d = _int_pass(n, cert.anchors, aN, aD, cert.rows, cert.bplus, cert.bminus, cert.t, cert.lambdas)
    r = _residual(cert.mode, n, k, aN, aD, cert.rows, cert.t, y, inexact, e_pos)
    e = [ceil_div(ra * aD, aN) for ra in r]
    return r, e, d, errs


def certify(g: Graph, alpha: Fraction, *, lambdas: list[int] | None = None, truncate_below: int = 0,
            refine_iters: int = 200, t_float: np.ndarray | None = None, mode: str = "contract") -> Certificate:
    """Calcule un certificat : t flottant -> arrondi uint64 WAD -> raffinage par l'application entière.

    Lignes omises (T) : t_u == 0 dans toutes les colonnes (gratuit, et évite de payer leurs arêtes dans la
    marge « contract »), lignes > ROW_MAX (obligatoire), t_u <= truncate_below partout (optionnel, coûte la marge).
    Les ancres doivent être les nœuds 0..k-1 du graphe (build_graph les place en tête).
    """
    assert mode in MODES
    alpha = Fraction(alpha)
    aN, aD = alpha.numerator, alpha.denominator
    k = len(g.anchors)
    assert g.anchors == list(range(k)), "ancres attendues en tête de la table"
    if lambdas is None:
        lambdas = [WAD // k] * k
        lambdas[0] += WAD - sum(lambdas)
    P = np.zeros((g.n, k))
    for a, s in enumerate(g.anchors):
        P[s, a] = 1.0
    arr = _arrays(g)
    tf = t_float if t_float is not None else solve_float(g, alpha, P, arrays=arr)
    t = [[min(WAD, max(0, int(round(tf[v, a] * WAD)))) for v in range(g.n)] for a in range(k)]
    rows_all = {u: [(e.dst, e.q, e.feedback_index) for e in row] for u, row in g.rows.items()}
    bplus = {u: g.bplus(u) for u in g.rows}
    bminus = {u: g.bminus(u) for u in g.rows}

    def provided(t):
        # un nœud absorbant (aucune arête) de masse > 0 DOIT être fourni avec une ligne vide (nE = 0),
        # sinon le contrat le traite comme tronqué et ajoute la marge (1−α)·t_u (cf. FORMAT.md)
        out = {}
        for u in range(g.n):
            if not any(t[a][u] > truncate_below for a in range(k)):
                continue
            r = rows_all.get(u, [])
            if len(r) <= ROW_MAX:
                out[u] = r
        return out

    best = None
    for _ in range(refine_iters):
        rows = provided(t)
        y, inexact, e_pos, _ = _int_pass(g.n, g.anchors, aN, aD, rows, bplus, bminus, t, lambdas)
        r = _residual(mode, g.n, k, aN, aD, rows, t, y, inexact, e_pos)
        if best is None or sum(r) < best[0]:
            best = (sum(r), [col[:] for col in t])
        if mode == "contract":
            nt = [[min(WAD, y[a][v]) for v in range(g.n)] for a in range(k)]
        else:
            nt = [[min(WAD, y[a][v] + inexact[a][v] // 2) for v in range(g.n)] for a in range(k)]
        if nt == t:
            break
        t = nt
    t = best[1]
    rows = provided(t)
    # compaction : ancres, nœuds de masse > 0, destinations des lignes fournies
    keep = set(g.anchors) | {v for v in range(g.n) if any(t[a][v] > 0 for a in range(k))}
    for u, row in rows.items():
        keep.add(u)
        keep.update(dst for dst, _, _ in row)
    order = sorted(keep)
    new = {v: i for i, v in enumerate(order)}
    cert = Certificate(n=len(order), anchors=[new[s] for s in g.anchors], alphaN=aN, alphaD=aD, lambdas=lambdas,
                       rows={new[u]: [(new[d], q, fi) for d, q, fi in r] for u, r in rows.items()},
                       bplus={new[u]: bplus.get(u, GRID) for u in rows}, bminus={new[u]: bminus.get(u, GRID) for u in rows},
                       t=[[t[a][v] for v in order] for a in range(k)], node_map=order, mode=mode)
    cert.r, cert.e, cert.d, errs = verify(cert)
    if errs:
        raise AssertionError(errs[:5])
    return cert


def leak_bound(g: Graph, alpha: Fraction, t_col, region: set[int]) -> float:
    """Borne ((1−α)/α)·Σ_{u∉S} π(u)·C(u,S) sur la masse de la région S (p nul sur S).
    t_col : vecteur de masse (float ou int WAD, indexé comme le graphe) ; renvoie la borne dans la même unité."""
    a = float(alpha)
    flow = 0.0
    for u, row in g.rows.items():
        if u in region:
            continue
        bp = g.bplus(u)
        cs = sum(e.q for e in row if e.q > 0 and e.dst in region) / bp
        flow += float(t_col[u]) * cs
    return (1 - a) / a * flow


# ----------------------------------------------------------------------------- lecture


def contributions(cert: Certificate, v: int) -> list[int]:
    return [(cert.lambdas[a] * cert.t[a][v]) // WAD for a in range(cert.k)]


def trust_robust(contribs: list[int], m: int) -> int:
    """Σ_a c_a − somme des (m−1) plus grandes contributions (D8)."""
    s = sorted(contribs, reverse=True)
    return sum(s[m - 1:]) if m >= 1 else sum(s)


def distrust(cert: Certificate, v: int) -> int:
    """Méfiance combinée d_v (déjà pondérée par λ et arrondie au-dessus, convention du contrat R5)."""
    return cert.d[v]


def e_eff(cert: Certificate) -> int:
    """Σ_a ⌈λ_a·e_a / WAD⌉ (convention du contrat R5, _eEff)."""
    return sum(ceil_div(cert.lambdas[a] * cert.e[a], WAD) for a in range(cert.k))


def is_trusted(cert: Certificate, v: int, *, theta: int, m: int = 2, rhoN: int = 1, rhoD: int = 2) -> bool:
    """isTrusted de la spec Q1 (tour 2), hors statuts (veto, transfert, fraîcheur) qui relèvent du contrat."""
    tr = trust_robust(contributions(cert, v), m)
    e = e_eff(cert)
    di = distrust(cert, v)
    return tr >= theta + e and rhoD * (di + e) <= rhoN * (tr - e)

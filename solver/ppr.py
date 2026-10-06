"""ANCRE — signed personalised PageRank (EigenTrust), integer sub-solution certificate (D26, D32).

Conventions (CR):
  D5   absorbing: a row without positive edge redistributes nothing (Σt <= 1, exact linearity in p).
  D7   separate budgets: C_uv = q⁺_uv / B⁺_u, D_uv = |q⁻_uv| / B⁻_u.
       B⁺_u = max(GRID, sPlus_u) with sPlus_u the DECLARED true positive sum of the row (D32);
       B⁻_u = max(GRID, Σ|q⁻| committed).   t = (1-α) Cᵀ t + α p ;  d = (1-α) Dᵀ t (one hop).
  D8   one column per anchor; leave-one-out removes the m-1 largest contributions λ_a·t^(a).
  D2/D24  α = αN/αD rational, per set.
  D26  the certificate is a SUB-SOLUTION: t ≤ y = F_down(t) componentwise (floor rounding). F_down is monotone,
       so t ≤ t* for the true graph as long as the committed graph is dominated by it (D32). The solver gets
       such a t by integer power iteration from 0 (AM-5.12).

Verification (what the contract recomputes, integers, t as uint64 WAD; normative detail in FORMAT.md):
    y_v = [v == a]·⌊αN·WAD/αD⌋ + Σ_{u with row, q_uv>0} ⌊ t_u·(αD−αN)·q_uv / (αD·B⁺_u) ⌋
    require t_v ≤ y_v for every listed v and column
    r_a = Σ_v (y_v − t_v) + E⁺ + 1 + Σ_{u listed without row} ⌈ t_u·(αD−αN)/αD ⌉
          + Σ_{rows with sPlus > Σw⁺} ⌈ t_u·(αD−αN)·(sPlus − Σw⁺) / (αD·B⁺_u) ⌉
    e_a = ⌈ r_a·αD/αN ⌉   => ‖t^(a) − t*^(a)‖₁ <= e_a (wei): upper side, used for the distrust bound only.
    d_v = Σ_{u with row, q_uv<0} ⌈ ⌈Σ_a λ_a t_u^(a) / WAD⌉·(αD−αN)·|q_uv| / (αD·B⁻_u) ⌉   (combined, rounded up)
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


# ----------------------------------------------------------------------------- integer certificate

MODES = ("contract", "tight")
# "contract" = arithmetic of the contract (R5 _verifyPass, amended by D26/D32):
#     r_a = Σ_v |t_v − y_v| + E⁺ + 1 + Σ_{u listed without row, t_u≠0} ⌈t_u·om/αD⌉
#           + Σ_{rows with sPlus > Σ committed w⁺} ⌈t_u·om·(sPlus − Σw⁺)/(αD·B⁺)⌉          (declared omissions)
# "tight"    = tighter R4 variant: Σ_v max(y_v + n_v − t_v, t_v − y_v) instead of Σ|t − y| (information only).
# Under D26 the contract requires t ≤ y, so Σ|t − y| = Σ(y − t); r only bounds the distrust side (eUp).


@dataclass
class Certificate:
    n: int
    anchors: list[int]                       # nodes 0..k-1 (contract convention: anchor a is node a)
    alphaN: int
    alphaD: int
    lambdas: list[int]                       # WAD, Σ = WAD
    rows: dict[int, list[tuple[int, int, int]]]   # committed rows u -> [(dst, q, feedbackIndex)]; u absent = truncated
    splus: dict[int, int]                    # D32: DECLARED positive sum of the full row (>= committed Σw⁺)
    t: list[list[int]]                       # [k][n] uint64 WAD, a sub-solution: t ≤ F_down(t) (D26)
    node_map: list[int] = field(default_factory=list)   # certificate index -> graph index
    mode: str = "contract"
    r: list[int] = field(default_factory=list)
    e: list[int] = field(default_factory=list)
    d: list[int] = field(default_factory=list)          # combined distrust (λ), rounded up
    row_src: dict[int, tuple[str, str]] = field(default_factory=dict)  # u -> (source client, via), for encoding
    iterations: int = 0                      # integer power iterations from 0 (last pass)

    @property
    def k(self) -> int:
        return len(self.anchors)

    @property
    def bplus(self) -> dict[int, int]:
        return budgets(self.rows, self.splus)[0]

    @property
    def bminus(self) -> dict[int, int]:
        return budgets(self.rows, self.splus)[1]

    @property
    def truncated(self) -> set[int]:
        """T: listed nodes with non-zero mass and no row."""
        return {v for v in range(self.n) if v not in self.rows and any(self.t[a][v] for a in range(self.k))}


def budgets(rows, splus) -> tuple[dict[int, int], dict[int, int]]:
    """D7/D32: B⁺_u = max(GRID, declared sPlus_u), B⁻_u = max(GRID, Σ|q⁻| committed)."""
    return ({u: max(GRID, splus[u]) for u in rows},
            {u: max(GRID, sum(-q for _, q, _ in r if q < 0)) for u, r in rows.items()})


def _int_pass(n, anchors, aN, aD, rows, bplus, bminus, t, lambdas):
    """One integer pass (identical to the contract): y (floor) per column, n_v (inexact divisions),
    number of positive edges, and combined distrust d (ceil)."""
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


def _residual(mode, n, k, aN, aD, rows, t, y, inexact, e_pos, splus=None):
    r = []
    om = aD - aN
    omitted = {}                                              # u -> (sPlus − committed Σw⁺, B⁺) when > 0
    for u, row in rows.items():
        s = (splus or {}).get(u)
        if s is not None:
            c = sum(q for _, q, _ in row if q > 0)
            if s > c:
                omitted[u] = (s - c, max(GRID, s))
    for a in range(k):
        ra = 0
        for v in range(n):
            tv, yv = t[a][v], y[a][v]
            if mode == "contract":
                ra += abs(tv - yv)
            else:
                ra += max(yv + inexact[a][v] - tv, tv - yv)
            if tv and v not in rows:                      # truncated: margin (1−α)·t_u rounded up
                ra += ceil_div(tv * om, aD)
        for u, (miss, bp) in omitted.items():             # declared omission inside a row (D32)
            if t[a][u]:
                ra += ceil_div(t[a][u] * om * miss, aD * bp)
        if mode == "contract":
            ra += e_pos + 1
        r.append(ra)
    return r


def verify(cert: Certificate, *, require_subsolution: bool = True) -> tuple[list[int], list[int], list[int], list[str]]:
    """Recompute r, e, d exactly as the contract. Returns (r, e, d, errors). Errors include every format
    error and, if require_subsolution, every component with t > y (D26: the contract reverts)."""
    errs = []
    n, aN, aD, k = cert.n, cert.alphaN, cert.alphaD, cert.k
    if not (0 < aN < aD):
        errs.append("alpha outside ]0,1[")
    if sum(cert.lambdas) != WAD or len(cert.lambdas) != k or any(l == 0 for l in cert.lambdas):
        errs.append("lambdas: Σ != WAD or zero λ")
    if cert.anchors != list(range(k)):
        errs.append("anchors must be nodes 0..k-1")
    for a in range(k):
        for v in range(n):
            if not 0 <= cert.t[a][v] < 2**63:
                errs.append(f"t[{a}][{v}] outside the 63-bit lane")
    if set(cert.splus) != set(cert.rows):
        errs.append("sPlus must be declared for exactly the provided rows")
    for u, row in cert.rows.items():
        if not 0 <= u < n:
            errs.append(f"row {u} outside the table")
        if len(row) > ROW_MAX:
            errs.append(f"row {u} > ROW_MAX")
        prev = -1
        for dst, q, _ in row:
            if not (-GRID <= q <= GRID) or q == 0:
                errs.append(f"weight off grid {u}->{dst}: {q}")
            if not 0 <= dst < n or dst == u:
                errs.append(f"bad dst {u}->{dst}")
            if dst <= prev:
                errs.append(f"row {u} not strictly sorted by dst")
            prev = dst
        if cert.splus.get(u, 0) < sum(q for _, q, _ in row if q > 0):
            errs.append(f"row {u}: declared sPlus < committed Σw⁺")
    y, inexact, e_pos, d = _int_pass(n, cert.anchors, aN, aD, cert.rows, cert.bplus, cert.bminus, cert.t, cert.lambdas)
    if require_subsolution:
        bad = [(a, v) for a in range(k) for v in range(n) if cert.t[a][v] > y[a][v]]
        if bad:
            errs.append(f"not a sub-solution (t > y) at {len(bad)} components, first {bad[:3]}")
    r = _residual(cert.mode, n, k, aN, aD, cert.rows, cert.t, y, inexact, e_pos, cert.splus)
    e = [ceil_div(ra * aD, aN) for ra in r]
    return r, e, d, errs


def power_from_zero(n, anchors, aN, aD, rows, splus, lambdas, max_iter: int = 1_000_000):
    """D26/AM-5.12: t⁰ = 0, t^{i+1} = F_down(t^i) until the integer fixed point. F_down is monotone, so the
    sequence is non-decreasing and every iterate is a sub-solution (t ≤ F_down(t)). Returns (t, iterations).
    y-only pass: same floors as _int_pass (y part), without the inexact counts and the distrust that the
    iteration never uses (~3.4× faster, measured on 1 300 / 5 000 agents)."""
    k = len(anchors)
    om = aD - aN
    bplus = budgets(rows, splus)[0]
    pos = [(u, [(dst, om * q) for dst, q, _ in r if q > 0], aD * bplus[u]) for u, r in rows.items()]
    pos = [p for p in pos if p[1]]
    pa = aN * WAD // aD
    t = [[0] * n for _ in range(k)]
    for it in range(1, max_iter + 1):
        y = [[0] * n for _ in range(k)]
        for a, s in enumerate(anchors):
            y[a][s] += pa
        for u, edges, den in pos:
            for a in range(k):
                tu = t[a][u]
                if tu:
                    ya = y[a]
                    for dst, num in edges:
                        ya[dst] += tu * num // den
        if y == t:
            return t, it
        t = y
    return t, max_iter


def cap_row(row: list[tuple[int, int, int]], *, is_anchor: bool) -> list[tuple[int, int, int]]:
    """ROW_MAX cap. With sPlus declared (D32), omitting POSITIVE edges keeps t a lower bound. Negative edges are
    never omitted: nothing declares the negative sum, so an omitted negative would make distrustUp unsound (it is
    a provable fault, not an honest option). Anchor rows MUST NOT be truncated (D21, AM-4.8)."""
    if len(row) <= ROW_MAX:
        return row
    if is_anchor:
        raise ValueError(f"anchor row of {len(row)} edges > ROW_MAX={ROW_MAX}: anchor rows must not be truncated (D21)")
    neg = [e for e in row if e[1] < 0]
    if len(neg) > ROW_MAX:
        raise ValueError(f"row with {len(neg)} negative edges > ROW_MAX={ROW_MAX}: cannot be certified honestly")
    pos = sorted((e for e in row if e[1] > 0), key=lambda e: (-e[1], e[0]))[:ROW_MAX - len(neg)]
    return sorted(neg + pos)


def certify(g: Graph, alpha: Fraction, *, lambdas: list[int] | None = None, truncate_below: int = 0,
            mode: str = "contract", max_iter: int = 1_000_000) -> Certificate:
    """Sub-solution certificate (D26, D32), by integer power iteration from 0 on the committed graph.

    1. Committed rows: the full row of every node (ROW_MAX-capped, cap_row), with sPlus = TRUE positive sum.
       An absorbing node gets an empty row (FORMAT: otherwise it pays the truncation margin), except an agent whose
       source is an anchor (D48-A), which gets none.
    2. Iterate from 0 on the committed graph -> t (exact integer fixed point, a sub-solution).
    3. Optional truncation: rows of nodes whose mass stays <= truncate_below everywhere are dropped (anchors
       never), and the iteration is redone from 0 on that smaller graph (F only decreases, t stays a lower bound).
    4. Rows of zero-mass nodes are not provided (they do not change y, but would add their edges to E⁺).
    5. Compaction: anchors, massive nodes, destinations of provided rows.
    The anchors must be nodes 0..k-1 of the graph (build_graph puts them first).
    """
    assert mode in MODES
    alpha = Fraction(alpha)
    aN, aD = alpha.numerator, alpha.denominator
    k = len(g.anchors)
    assert g.anchors == list(range(k)), "anchors expected first in the node table"
    if lambdas is None:
        lambdas = [WAD // k] * k
        lambdas[0] += WAD - sum(lambdas)
    anchors = set(g.anchors)
    # an agent whose source is an anchor (D48-A) gets NO row, not even an empty one (the contract refuses any agent
    # row sourced by an anchor): it is listed without a row and pays the truncation margin (eUp side only)
    committed = {u: cap_row([(e.dst, e.q, e.feedback_index) for e in g.rows.get(u, [])], is_anchor=u in anchors)
                 for u in range(g.n) if u not in g.anchor_sourced}
    splus = {u: g.splus(u) for u in range(g.n)}
    t, iters = power_from_zero(g.n, g.anchors, aN, aD, committed, splus, lambdas, max_iter)
    if truncate_below > 0:
        keep = {u for u in range(g.n) if u in anchors or any(t[a][u] > truncate_below for a in range(k))}
        committed = {u: r for u, r in committed.items() if u in keep}
        t, iters = power_from_zero(g.n, g.anchors, aN, aD, committed, splus, lambdas, max_iter)
    rows = {u: r for u, r in committed.items() if any(t[a][u] for a in range(k))}
    keep = set(g.anchors) | {v for v in range(g.n) if any(t[a][v] > 0 for a in range(k))}
    for u, row in rows.items():
        keep.add(u)
        keep.update(dst for dst, _, _ in row)
    order = sorted(keep)
    new = {v: i for i, v in enumerate(order)}
    cert = Certificate(n=len(order), anchors=[new[s] for s in g.anchors], alphaN=aN, alphaD=aD, lambdas=lambdas,
                       rows={new[u]: [(new[d], q, fi) for d, q, fi in r] for u, r in rows.items()},
                       splus={new[u]: splus[u] for u in rows},
                       t=[[t[a][v] for v in order] for a in range(k)], node_map=order, mode=mode,
                       row_src={new[u]: g.row_src[u] for u in rows if u in g.row_src}, iterations=iters)
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


def passes_anchor_policy(cert: Certificate, v: int, *, theta: int, m: int = 2, rhoN: int = 1, rhoD: int = 2,
               e_low: int = 0) -> bool:
    """Solver mirror of the contract's passesAnchorPolicy (renamed from isTrusted, D48 / AM-9.5).
    D26 reading (tour 4 spec), without the statuses (veto, transfer, freshness) that belong to the contract:
    trustLow = trustRobust − eLow (t is already a lower bound; eLow only from proven decreases),
    distrustUp = d + eEff ; OK ⇔ trustLow ≥ θ ∧ ρD·distrustUp ≤ ρN·trustLow."""
    tr = trust_robust(contributions(cert, v), m) - e_low
    return tr >= theta and rhoD * (distrust(cert, v) + e_eff(cert)) <= rhoN * tr

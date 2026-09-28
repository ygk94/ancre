"""Tour 5B checks promoted into the suite (D37): t1 sub-solution, t2 omissions, t3 leave-one-out.

Model: the integer pass of ppr (identical to the contract) and an exact reference by Gaussian elimination in
Fractions. Same seeds and sizes as the scratchpad scripts (300 / 400 / 150 graphs, 200 000 pairs), ~2.5 s.
"""
import random
import sys
from fractions import Fraction
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph import GRID, WAD
from ppr import _int_pass, power_from_zero, trust_robust


def splus_of(rows):
    return {u: sum(q for _, q, _ in r if q > 0) for u, r in rows.items()}


def f_down(n, anchor, aN, aD, rows, t):
    bp = {u: max(GRID, s) for u, s in splus_of(rows).items()}
    bm = {u: max(GRID, sum(-q for _, q, _ in r if q < 0)) for u, r in rows.items()}
    return _int_pass(n, [anchor], aN, aD, rows, bp, bm, [t], [WAD])[0][0]


def from_zero(n, anchor, aN, aD, rows, splus=None):
    t, _ = power_from_zero(n, [anchor], aN, aD, rows, splus or splus_of(rows), [WAD])
    return t[0]


def exact_star(n, anchor, aN, aD, rows):
    """t* in WAD units (Fractions) of t = (1-α)Cᵀt + α e_anchor, absorbing convention, B⁺ from the rows."""
    al = Fraction(aN, aD)
    bp = {u: max(GRID, s) for u, s in splus_of(rows).items()}
    A = [[Fraction(int(i == j)) for j in range(n)] for i in range(n)]
    for u, r in rows.items():
        for dst, q, _ in r:
            if q > 0:
                A[dst][u] -= (1 - al) * Fraction(q, bp[u])
    b = [Fraction(0)] * n
    b[anchor] = al * WAD
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


def rand_rows(rng, n, deg, neg_p=0.15, full_rows_p=0.4):
    rows = {}
    for u in range(n):
        if rng.random() < 0.15:
            continue                                          # absorbing node
        dsts = rng.sample([v for v in range(n) if v != u], min(rng.randint(1, deg), n - 1))
        r = []
        for v in sorted(dsts):
            if rng.random() < neg_p:
                q = -rng.randint(1, GRID)
            elif rng.random() < full_rows_p:
                q = GRID                                      # full rows -> Σq⁺ > GRID
            else:
                q = rng.randint(1, GRID // 3)
            r.append((v, q, 1))
        rows[u] = r
    return rows


def test_t1_subsolution_from_zero():
    """V1: the integer iteration from 0 is monotone, ends on t ≤ F_down(t) and t ≤ t* (exact)."""
    rng = random.Random(5)
    for _ in range(300):
        n = rng.randint(3, 25)
        aN, aD = rng.choice([(1, 4), (1, 3), (1, 2)])
        rows = rand_rows(rng, n, deg=rng.randint(1, 6))
        anchor = rng.randrange(n)
        t = [0] * n
        while True:
            y = f_down(n, anchor, aN, aD, rows, t)
            assert all(a <= b for a, b in zip(t, y))          # monotone, hence each iterate is a sub-solution
            if y == t:
                break
            t = y
        assert t == from_zero(n, anchor, aN, aD, rows)
        ts = exact_star(n, anchor, aN, aD, rows)
        assert all(Fraction(tv) <= sv for tv, sv in zip(t, ts))


def _check(n, anchor, aN, aD, rows_true, rows_commit, splus=None):
    t = from_zero(n, anchor, aN, aD, rows_commit, splus)
    ts = exact_star(n, anchor, aN, aD, rows_true)
    return any(Fraction(tv) > sv for tv, sv in zip(t, ts))


def test_t2_omissions_and_the_three_violations():
    """V2, V3 hold; V4 (dilution), V5 (fabrication), V6 (inflation) break t ≤ t*_true; D32's declared sPlus
    closes V4 (the committed graph is then dominated by the true one)."""
    rng = random.Random(11)
    viol = {k: 0 for k in ("row", "edge_nodil", "edge_dil", "edge_dil_splus", "fabricated", "inflated")}
    for _ in range(400):
        n = rng.randint(4, 20)
        aN, aD = rng.choice([(1, 4), (1, 3), (1, 2)])
        anchor = rng.randrange(n)
        rows = rand_rows(rng, n, deg=rng.randint(2, 6), full_rows_p=0.6)
        rows.setdefault(anchor, [])
        true_splus = splus_of(rows)
        rc = {u: r for u, r in rows.items() if u == anchor or rng.random() > 0.4}
        viol["row"] += _check(n, anchor, aN, aD, rows, rc)
        cand = [(u, i) for u, r in rows.items() for i, (_, q, _) in enumerate(r) if q > 0]
        if cand:
            u, i = rng.choice(cand)
            rc = dict(rows)
            rc[u] = [e for j, e in enumerate(rows[u]) if j != i]
            dil = max(GRID, true_splus[u]) > max(GRID, sum(q for _, q, _ in rc[u] if q > 0))
            if dil:
                viol["edge_dil"] += _check(n, anchor, aN, aD, rows, rc)
                viol["edge_dil_splus"] += _check(n, anchor, aN, aD, rows, rc, {**splus_of(rc), u: true_splus[u]})
            else:
                viol["edge_nodil"] += _check(n, anchor, aN, aD, rows, rc)
        v = rng.choice([x for x in range(n) if x != anchor])
        rc = dict(rows)
        rc[anchor] = sorted([e for e in rows[anchor] if e[0] != v] + [(v, GRID, 99)])
        viol["fabricated"] += _check(n, anchor, aN, aD, rows, rc)
        if cand:
            u, i = rng.choice(cand)
            r = list(rows[u])
            d_, q, ix = r[i]
            if q < GRID:
                r[i] = (d_, GRID, ix)
                viol["inflated"] += _check(n, anchor, aN, aD, rows, {**rows, u: r})
    print("\nt2 violations (t > t*_true):", viol)
    assert viol["row"] == viol["edge_nodil"] == viol["edge_dil_splus"] == 0, viol
    assert viol["edge_dil"] > 0 and viol["fabricated"] > 0 and viol["inflated"] > 0, viol


def test_t2_dilution_counterexample_v7():
    """V7: anchor 0 → {1: +1, 2: +1}, edge to 2 omitted, α = 1/3: t(1) = 0.2222 against t*(1) = 0.1111.
    With sPlus declared (D32), t(1) = t*(1)."""
    rows_true = {0: [(1, GRID, 1), (2, GRID, 1)]}
    rows_commit = {0: [(1, GRID, 1)]}
    ts = exact_star(3, 0, 1, 3, rows_true)
    t = from_zero(3, 0, 1, 3, rows_commit)
    assert t[1] > ts[1] and abs(t[1] - 2 * ts[1]) <= 1
    t2 = from_zero(3, 0, 1, 3, rows_commit, {0: 2 * GRID})
    assert Fraction(t2[1]) <= ts[1] and ts[1] - t2[1] < 1


def test_t3_leave_one_out_monotone_and_valid():
    """V8: trust_robust is non-decreasing in each argument; V9: on sub-solution columns it stays ≤ the true value."""
    rng = random.Random(3)
    for _ in range(200_000):
        k = rng.randint(1, 8)
        m = rng.randint(1, k + 1)
        c = [rng.randint(0, 10**6) for _ in range(k)]
        c2 = list(c)
        c2[rng.randrange(k)] += rng.randint(0, 10**6)
        assert trust_robust(c2, m) >= trust_robust(c, m)
    for _ in range(150):
        n = rng.randint(4, 16)
        k = rng.randint(2, 4)
        rows = rand_rows(rng, n, deg=4)
        anchors = rng.sample(range(n), k)
        for a in anchors:
            rows.setdefault(a, [])
        lam = [WAD // k] * k
        lam[0] += WAD - sum(lam)
        tl = [from_zero(n, a, 1, 3, rows) for a in anchors]
        ts = [exact_star(n, a, 1, 3, rows) for a in anchors]
        for v in range(n):
            for m in (1, 2, 3):
                lo = trust_robust([lam[a] * tl[a][v] // WAD for a in range(k)], m)
                hi = trust_robust([Fraction(lam[a]) * ts[a][v] / WAD for a in range(k)], m)
                assert lo <= hi

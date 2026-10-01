#!/usr/bin/env python3
"""Differential vectors for AnchoredReputation (chantier 02, E5 / D37).

Pure standard library. For random small graphs (truncated nodes, declared B+, alias rows, negative
edges, k = 1..3, alpha in {1/4, 1/3, 1/2}) it computes, independently of the Solidity code:
  - the certificate t = F_floor^N(0) with the contract's integer arithmetic (ENCODING.md §4),
  - the expected eUp per column and the distrust d per node,
  - the EXACT fixed point t* of the committed graph (Fractions, Gaussian elimination),
and writes one JSON file per case. test/Diff.t.sol replays each case on the contract and checks
  (1) the contract accepts, and its eUp and d equal the values below (differential),
  (2) L2: t <= floor(t*) coordinate by coordinate,
  (3) L5: ceil(sum_j (t*_j - t_j)) <= eUp per column.
Run: python3 test/diff/gen.py  (from contracts/)
"""
import json, os, random
from fractions import Fraction

WAD = 10**18
GRID = 10_000
OUT = os.path.join(os.path.dirname(__file__), "vectors")


def ceil_div(a, b):
    return -((-a) // b)


def gen_case(rng, idx):
    k = rng.choice([1, 1, 2, 3])
    n = rng.randint(k + 2, 12)
    aN, aD = rng.choice([(1, 4), (1, 3), (1, 2)])
    lam = [WAD // k] * k
    lam[-1] = WAD - sum(lam[:-1])
    rows = []  # dict(u, edges[(dst, w)], bDecl, alias(row index or None))
    for u in range(n):
        r = rng.random()
        if u >= k and r < 0.2:
            continue  # truncated node (no row)
        if u >= k + 1 and rows and r < 0.35:
            # alias of an earlier non-alias agent row
            cands = [i for i, x in enumerate(rows) if x["alias"] is None and x["u"] >= k]
            if cands:
                rows.append(dict(u=u, edges=[], bDecl=0, alias=rng.choice(cands)))
                continue
        targets = [v for v in range(k, n) if v != u]  # feedback targets agents only
        deg = rng.randint(0, min(4, len(targets)))
        dsts = sorted(rng.sample(targets, deg))
        edges = []
        for d in dsts:
            w = rng.randint(1, GRID)
            if rng.random() < 0.2:
                w = -w
            edges.append((d, w))
        sp = sum(w for _, w in edges if w > 0)
        bDecl = 0
        if rng.random() < 0.25:
            bDecl = max(GRID, sp) + rng.randint(0, 2 * GRID)
        rows.append(dict(u=u, edges=edges, bDecl=bDecl, alias=None))
    # alias rows must not self-loop: drop the alias if its source has an edge to it
    clean = []
    for x in rows:
        if x["alias"] is not None and any(d == x["u"] for d, _ in rows[x["alias"]]["edges"]):
            continue
        clean.append(x)
    # re-point aliases after the filter (sources are never dropped: only aliases are)
    pos = {id(x): i for i, x in enumerate(clean)}
    for x in clean:
        if x["alias"] is not None:
            x["alias"] = pos[id(rows[x["alias"]])]
    return dict(n=n, k=k, aN=aN, aD=aD, lam=lam, rows=clean)


def span(c, r):
    x = c["rows"][r]
    src = c["rows"][x["alias"]] if x["alias"] is not None else x
    return src["edges"], src["bDecl"]


def budget(edges, bDecl):
    sp = sum(w for _, w in edges if w > 0)
    return sp, (bDecl if bDecl else max(GRID, sp))


def apply_f(c, t):
    n, k, aN, aD = c["n"], c["k"], c["aN"], c["aD"]
    om = aD - aN
    y = [[0] * n for _ in range(k)]
    for r, x in enumerate(c["rows"]):
        edges, bDecl = span(c, r)
        _, bP = budget(edges, bDecl)
        for a in range(k):
            num = t[a][x["u"]] * om
            if num == 0:
                continue
            for d, w in edges:
                if w > 0:
                    y[a][d] += (num * w) // (aD * bP)
    for a in range(k):
        y[a][a] += (aN * WAD) // aD
    return y


def certify(c, iters):
    t = [[0] * c["n"] for _ in range(c["k"])]
    for _ in range(iters):
        t = apply_f(c, t)
    return t


def e_up(c, t):
    n, k, aN, aD = c["n"], c["k"], c["aN"], c["aD"]
    om = aD - aN
    y = apply_f(c, t)
    has = [False] * n
    epos = 0
    marg = [0] * k
    for r, x in enumerate(c["rows"]):
        has[x["u"]] = True
        edges, bDecl = span(c, r)
        epos += sum(1 for _, w in edges if w > 0)
        sp, bP = budget(edges, bDecl)
        if bDecl and bP > sp:
            for a in range(k):
                q = t[a][x["u"]] * om * (bP - sp)
                marg[a] += ceil_div(q, aD * bP)
    out = []
    for a in range(k):
        s = epos + 1 + marg[a]
        for j in range(n):
            assert t[a][j] <= y[a][j], "not a sub-solution"
            s += y[a][j] - t[a][j]
            if t[a][j] and not has[j]:
                s += ceil_div(t[a][j] * om, aD)
        out.append(ceil_div(s * aD, aN))
    return out


def distrust(c, t):
    n, k, aN, aD = c["n"], c["k"], c["aN"], c["aD"]
    om = aD - aN
    d = [0] * n
    for r, x in enumerate(c["rows"]):
        edges, _ = span(c, r)
        sn = max(GRID, sum(-w for _, w in edges if w < 0))
        T = ceil_div(sum(c["lam"][a] * t[a][x["u"]] for a in range(k)), WAD)
        if T == 0:
            continue
        for dd, w in edges:
            if w < 0:
                d[dd] += ceil_div(T * om * (-w), aD * sn)
    return d


def exact_fixed_point(c, a):
    """t* = alpha e_a + (1-alpha) C^T t*, committed graph, in WAD units (Fractions)."""
    n = c["n"]
    alpha = Fraction(c["aN"], c["aD"])
    A = [[Fraction(int(i == j)) for j in range(n)] for i in range(n)]
    for r, x in enumerate(c["rows"]):
        edges, bDecl = span(c, r)
        _, bP = budget(edges, bDecl)
        for d, w in edges:
            if w > 0:
                A[d][x["u"]] -= (1 - alpha) * Fraction(w, bP)
    b = [Fraction(0)] * n
    b[a] = alpha * WAD
    # Gaussian elimination
    for col in range(n):
        piv = next(i for i in range(col, n) if A[i][col] != 0)
        A[col], A[piv] = A[piv], A[col]
        b[col], b[piv] = b[piv], b[col]
        for i in range(n):
            if i != col and A[i][col] != 0:
                f = A[i][col] / A[col][col]
                for j in range(col, n):
                    A[i][j] -= f * A[col][j]
                b[i] -= f * b[col]
    return [b[i] / A[i][i] for i in range(n)]


def main():
    rng = random.Random(20260928)
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    count = 0
    while count < 48:
        c = gen_case(rng, count)
        t = certify(c, rng.choice([3, 10, 40, 120]))
        eu = e_up(c, t)
        dd = distrust(c, t)
        star = [exact_fixed_point(c, a) for a in range(c["k"])]
        for a in range(c["k"]):
            for j in range(c["n"]):
                assert Fraction(t[a][j]) <= star[a][j], "L2 violated in the generator"
        gap = [ceil_div((sum(star[a]) - sum(t[a])).numerator, (sum(star[a]) - sum(t[a])).denominator) for a in range(c["k"])]
        rows = c["rows"]
        doc = {
            "n": c["n"], "k": c["k"], "aN": c["aN"], "aD": c["aD"],
            "rowU": [x["u"] for x in rows],
            "rowBDecl": [x["bDecl"] for x in rows],
            "rowAlias": [(x["alias"] + 1) if x["alias"] is not None else 0 for x in rows],
            "rowLen": [len(x["edges"]) for x in rows],
            "eDst": [d for x in rows for d, _ in x["edges"]],
            "eW": [w for x in rows for _, w in x["edges"]],
            "t": [str(t[a][j]) for a in range(c["k"]) for j in range(c["n"])],
            "tStarFloor": [str(star[a][j].numerator // star[a][j].denominator) for a in range(c["k"]) for j in range(c["n"])],
            "eUp": [str(x) for x in eu],
            "gapCeil": [str(x) for x in gap],
            "d": [str(x) for x in dd],
        }
        with open(os.path.join(OUT, f"case_{count:02d}.json"), "w") as fh:
            json.dump(doc, fh)
        count += 1
    print(f"{count} vectors written to {OUT}")


if __name__ == "__main__":
    main()

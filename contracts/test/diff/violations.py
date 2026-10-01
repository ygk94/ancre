#!/usr/bin/env python3
"""Normative vectors of the 4 violations of D26 found by tour 5B (V4 dilution, V5 fabrication,
V6 inflation, V13 veto omission), for the ERC (chantier 08) and the certifier (chantier 04).
Each vector: the TRUE graph (registry), the COMMITTED graph (certificate), the certificate t (integer
iteration from 0 on the committed graph, contract arithmetic), the exact fixed point t*_true of the true
graph, the coordinates where t > t*_true, and what contract v1 does about it.
Run (from contracts/): python3 test/diff/violations.py  -> test/diff/violations.json
"""
import json, os
from fractions import Fraction
import importlib.util

spec = importlib.util.spec_from_file_location("gen", os.path.join(os.path.dirname(__file__), "gen.py"))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
WAD = gen.WAD


def case(n, k, rows, bdecl=None):
    lam = [WAD // k] * k
    lam[-1] = WAD - sum(lam[:-1])
    rs = [dict(u=u, edges=e, bDecl=(bdecl or {}).get(u, 0), alias=None) for u, e in rows]
    return dict(n=n, k=k, aN=1, aD=3, lam=lam, rows=rs)


def evaluate(name, true_rows, committed_rows, n, k, contract, bdecl=None):
    tc = case(n, k, committed_rows, bdecl)
    tt = case(n, k, true_rows)
    t = gen.certify(tc, 200)
    star = [gen.exact_fixed_point(tt, a) for a in range(k)]
    viol = [dict(column=a, node=j, t=str(t[a][j]), tStarTrue=str(star[a][j].numerator // star[a][j].denominator))
            for a in range(k) for j in range(n) if Fraction(t[a][j]) > star[a][j]]
    dT = gen.distrust(tt, [[s.numerator // s.denominator for s in star[a]] for a in range(k)])
    dC = gen.distrust(tc, t)
    return dict(name=name, n=n, k=k, alpha="1/3", trueRows=true_rows, committedRows=committed_rows,
                declaredBPlus=bdecl or {}, t=[[str(x) for x in col] for col in t], violations=viol,
                distrustCommitted=[str(x) for x in dC], distrustTrue=[str(x) for x in dT], contractV1=contract)


def main():
    out = []
    # V4/V7 dilution: anchor 0 -> {1: +1, 2: +1}; the certificate omits 0 -> 2 without declaring B+
    out.append(evaluate("V4-dilution", [(0, [(1, 10000), (2, 10000)])], [(0, [(1, 10000)])], 3, 1,
        "Accepted at both levels (completeness is not checkable). proveEdge(anchor row, agent of node 2) "
        "bills dec = 1/2 to eLow: trustLow(1) <= t*_true(1). With bPlus = 20000 declared, no violation."))
    # V5 fabrication: the certificate invents 0 -> 2
    out.append(evaluate("V5-fabrication", [(0, [(1, 10000)])], [(0, [(1, 10000), (2, 10000)])], 3, 1,
        "Registry-verified: refused at submission (EdgeMismatch). Submitter-attested: accepted, then "
        "proveEdge (wNew = 0 < wOld) bills the decrease to eLow."))
    # V6 inflation: true weight 0.2, committed 1.0
    out.append(evaluate("V6-inflation", [(0, [(1, 2000), (2, 10000)])], [(0, [(1, 10000), (2, 10000)])], 3, 1,
        "Registry-verified: refused (EdgeMismatch). Submitter-attested: proveEdge bills the decrease."))
    # V13 veto omission: anchor 0 -> 1 is negative in the registry (slash then +1 of the same anchor)
    out.append(evaluate("V13-veto-omission", [(0, [(1, -10000), (2, 10000)])], [(0, [(2, 10000)])], 3, 1,
        "Lower bound unaffected (negative edges are not in F); distrust of node 1 under-reported and the "
        "certified veto bit missing. The live veto (last anchor feedback) does not see it if the anchor's "
        "last feedback is positive (D33). proveEdge(anchor row, agent of node 1) bills inc- to eUp and "
        "sets the certified veto bit."))
    path = os.path.join(os.path.dirname(__file__), "violations.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1)
    for v in out:
        print(v["name"], "violations of t <= t*_true:", len(v["violations"]),
              "| d_committed", v["distrustCommitted"], "d_true", v["distrustTrue"])


if __name__ == "__main__":
    main()

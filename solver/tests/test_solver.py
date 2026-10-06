"""Solver tests. Run: cd solver && .venv/bin/python -m pytest -q tests"""
import json
import random
import sys
from fractions import Fraction
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph import (ADDR, AGENT, ANCHOR, GRID, WAD, ZERO, Edge, Feedback, Graph, Identity, TagSpec, build_graph,
                   dec_to_wad, quantize)
from ppr import (Certificate, certify, contributions, solve_exact, solve_float, trust_robust, verify, e_eff,
                 leak_bound)
import export as X

ALPHAS = [Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)]


# ----------------------------------------------------------------------------- fabriques

def rand_graph(seed, n_agents=8, k=2, p_edge=0.3, p_neg=0.15, empty_anchor=False):
    rng = random.Random(seed)
    anchors = [f"0x{(i + 1):040x}" for i in range(k)]
    nodes = [(ANCHOR, a) for a in anchors] + [(AGENT, i) for i in range(n_agents)]
    index = {kk: i for i, kk in enumerate(nodes)}
    rows = {}
    for u in range(len(nodes)):
        if empty_anchor and u == 0:
            continue
        row = []
        for j in range(n_agents):
            v = index[(AGENT, j)]
            if v == u or rng.random() > p_edge:
                continue
            q = rng.randint(1, GRID) * (-1 if rng.random() < p_neg else 1)
            row.append(Edge(dst=v, q=q, client="c", agent_id=j, tag1="t", feedback_index=rng.randint(1, 9)))
        if row:
            rows[u] = row
    return Graph(nodes=nodes, index=index, rows=rows, anchors=list(range(k)), log={}, rejected=[])


def exact_cols(g, alpha):
    return [solve_exact(g, alpha, s) for s in g.anchors]


def l1_err(cert, g, exact, a):
    """‖t_cert^(a) − t*^(a)‖₁ en WAD (rationnel exact), sur tous les nœuds du graphe."""
    inv = {gi: ci for ci, gi in enumerate(cert.node_map)}
    tot = Fraction(0)
    for gi in range(g.n):
        tc = Fraction(cert.t[a][inv[gi]]) if gi in inv else Fraction(0)
        tot += abs(tc - exact[a][gi] * WAD)
    return tot


def F_float(g, alpha, x, p):
    src, dst, cw = [], [], []
    for u, row in g.rows.items():
        bp = g.bplus(u)
        for e in row:
            if e.q > 0:
                src.append(u); dst.append(e.dst); cw.append(e.q / bp)
    y = np.zeros(g.n)
    np.add.at(y, np.array(dst, dtype=int), x[np.array(src, dtype=int)] * np.array(cw)) if src else None
    return float(alpha) * p + (1 - float(alpha)) * y


# ----------------------------------------------------------------------------- PPR

@pytest.mark.parametrize("seed", range(6))
@pytest.mark.parametrize("alpha", ALPHAS)
def test_contraction(seed, alpha):
    g = rand_graph(seed, n_agents=10)
    rng = np.random.default_rng(seed)
    p = np.zeros(g.n); p[0] = 1
    for _ in range(20):
        x, y = rng.random(g.n), rng.random(g.n)
        lhs = np.abs(F_float(g, alpha, x, p) - F_float(g, alpha, y, p)).sum()
        assert lhs <= (1 - float(alpha)) * np.abs(x - y).sum() + 1e-12


@pytest.mark.parametrize("seed", range(6))
def test_linearity_in_p(seed):
    g = rand_graph(seed, n_agents=12, k=3)
    alpha = Fraction(1, 3)
    P = np.zeros((g.n, 3))
    for a in range(3):
        P[a, a] = 1
    cols = solve_float(g, alpha, P)
    lam = np.array([0.5, 0.3, 0.2])
    direct = solve_float(g, alpha, P @ lam)
    assert np.abs(cols @ lam - direct).sum() < 1e-12
    # version entière : combinaison des colonnes certifiées vs certificat direct à une colonne,
    # écart borné par les e (chaque certificat est à e près du point fixe exact)
    cert = certify(g, alpha)
    lam_w = [WAD // 2, 3 * WAD // 10, WAD - WAD // 2 - 3 * WAD // 10]
    comb = [sum(lam_w[a] * cert.t[a][v] for a in range(3)) // WAD for v in range(cert.n)]
    ex = exact_cols(g, alpha)
    for v, gi in enumerate(cert.node_map):
        star = sum(Fraction(lam_w[a], WAD) * ex[a][gi] for a in range(3)) * WAD
        assert abs(comb[v] - star) <= sum(cert.e) + 3


@pytest.mark.parametrize("mode", ["contract", "tight"])
@pytest.mark.parametrize("alpha", ALPHAS)
@pytest.mark.parametrize("seed", range(8))
def test_residual_bound_vs_exact(seed, alpha, mode):
    """‖t − t*‖₁ ≤ e = ⌈r/α⌉ contre la solution exacte en rationnels, y compris avec troncature."""
    g = rand_graph(seed, n_agents=9, k=2, empty_anchor=(seed % 3 == 0))
    ex = exact_cols(g, alpha)
    for tb in (0, WAD // 50):
        cert = certify(g, alpha, mode=mode, truncate_below=tb)
        for a in range(cert.k):
            assert l1_err(cert, g, ex, a) <= cert.e[a], (seed, alpha, mode, tb)


@pytest.mark.parametrize("mode", ["contract", "tight"])
@pytest.mark.parametrize("seed", range(6))
def test_bound_holds_for_arbitrary_t(seed, mode):
    """Soundness : la borne doit valoir pour N'IMPORTE QUEL t soumis, pas seulement près du point fixe."""
    g = rand_graph(seed, n_agents=7, k=2)
    alpha = Fraction(1, 3)
    ex = exact_cols(g, alpha)
    base = certify(g, alpha, mode=mode)
    rng = random.Random(seed)
    for _ in range(10):
        rows = {u: r for u, r in base.rows.items() if rng.random() < 0.8}
        c = Certificate(n=base.n, anchors=base.anchors, alphaN=1, alphaD=3, lambdas=base.lambdas,
                        rows=rows, splus={u: base.splus[u] for u in rows},
                        t=[[rng.randint(0, WAD // 3) for _ in range(base.n)] for _ in range(2)],
                        node_map=base.node_map, mode=mode)
        c.r, c.e, c.d, errs = verify(c, require_subsolution=False)
        assert not errs
        for a in range(2):
            # nœuds hors liste : t = 0 implicite ; la borne ne couvre que si toute destination est listée,
            # ce que certify garantit (base.node_map contient toutes les destinations)
            assert l1_err(c, g, ex, a) <= c.e[a]


def test_contract_mode_never_tighter():
    for seed in range(5):
        g = rand_graph(seed)
        c1, c2 = certify(g, Fraction(1, 3), mode="contract"), certify(g, Fraction(1, 3), mode="tight")
        assert all(x >= 0 for x in c1.r + c2.r)


# ----------------------------------------------------------------------------- cas limites

def test_empty_row_and_absorbing_node_no_margin():
    g = Graph(nodes=[(ANCHOR, "0xa"), (AGENT, 1)], index={(ANCHOR, "0xa"): 0, (AGENT, 1): 1},
              rows={0: [Edge(1, GRID, "0xa", 1, "vouch", 1)]}, anchors=[0], log={}, rejected=[])
    c = certify(g, Fraction(1, 2))
    assert 1 in c.rows and c.rows[1] == []          # ligne vide fournie : pas de marge
    assert c.truncated == set()
    assert c.t[0] == [WAD // 2, WAD // 4]
    assert c.e[0] <= 4
    # si on retire la ligne vide, le contrat compte la marge (1−α)·t_1
    c2 = Certificate(**{**c.__dict__, "rows": {0: c.rows[0]}, "splus": {0: c.splus[0]}})
    r, e, d, _ = verify(c2)
    assert r[0] >= WAD // 8


def test_anchor_without_edges():
    g = Graph(nodes=[(ANCHOR, "0xa"), (ANCHOR, "0xb"), (AGENT, 1)],
              index={(ANCHOR, "0xa"): 0, (ANCHOR, "0xb"): 1, (AGENT, 1): 2},
              rows={0: [Edge(2, GRID, "0xa", 1, "vouch", 1)]}, anchors=[0, 1], log={}, rejected=[])
    c = certify(g, Fraction(1, 3))
    assert c.t[1][1] == WAD // 3 and c.t[1][2] == 0
    v = c.node_map.index(2)
    assert trust_robust(contributions(c, v), 2) == 0   # une seule ancre l'approuve : m = 2 le refuse
    assert trust_robust(contributions(c, v), 1) > 0


def schema():
    return {"vouch": TagSpec(0, 0, dec_to_wad(100), "endorsement"),
            "review": TagSpec(dec_to_wad(-1), 0, dec_to_wad(1), "endorsement"),
            "slash": TagSpec(dec_to_wad(-100), 0, 0, "endorsement"),
            "starred": TagSpec(0, dec_to_wad(50), dec_to_wad(100), "endorsement"),
            "liveness": TagSpec(0, 0, dec_to_wad(100), "measurement")}


def test_quantize_rules():
    S = schema()
    assert quantize(100, 0, S["vouch"]) == GRID
    assert quantize(0, 0, S["vouch"]) == 0                      # neutre : poids nul
    assert quantize(10**38, 0, S["vouch"]) is None              # 1e38 rejeté, pas plafonné
    assert quantize(101, 0, S["vouch"]) is None
    assert quantize(10000, 2, S["vouch"]) == GRID               # 100,00 avec 2 décimales : borne incluse
    assert quantize(-1, 0, S["vouch"]) is None
    assert quantize(1, 0, S["slash"]) is None                   # un positif ne peut pas effacer un slash
    assert quantize(-100, 0, S["slash"]) == -GRID
    assert quantize(-33333, 3, S["slash"]) == -3333             # -33,333 -> -0,33333 -> troncature vers zéro
    assert quantize(1, 6, S["vouch"]) == 0                      # 1e-6/100 -> 0 (grille 1e-4)
    assert quantize(40, 0, S["starred"]) == -2000               # sous le neutre : négatif
    assert quantize(77777, 3, S["starred"]) == 5555             # 77,777 -> 0,55554 -> 5555
    with pytest.raises(ValueError):
        quantize(1, 19, S["vouch"])


def ident(owner, wallet, **kw):
    return Identity(block=0, owner=owner, wallet=wallet, **kw)


def fb(agent, client, idx, value, tag, dec=0, revoked=False):
    return Feedback(agent_id=agent, client=client, index=idx, value=value, decimals=dec, tag1=tag, tag2="", revoked=revoked)


def test_graph_rules_d14_d15_d20():
    A, B, C, D, E, O, OP, AP, PO = ("0x" + c * 40 for c in "abcde0f12")
    idn = ident(owner={1: O, 2: B, 3: B, 4: E}, wallet={1: O, 2: B, 3: B, 4: E},
                operators={O: {OP}}, approved={1: AP}, past_owners={1: {PO}})
    fbs = [
        fb(1, A, 1, -100, "slash"), fb(1, A, 2, 1, "review"),         # D14: the slash dominates
        fb(1, C, 1, 100, "vouch"), fb(1, C, 2, 10**38, "vouch"),      # latest out of bounds -> nothing (latest_then_reject)
        fb(1, D, 1, 100, "liveness"),                                 # D15: measurement, no edge
        fb(1, O, 1, 100, "vouch"), fb(1, OP, 1, 100, "vouch"),        # owner, operator: rejected (R6)
        fb(1, AP, 1, 100, "vouch"),                                   # approved: rejected (R6)
        fb(1, PO, 1, 100, "vouch"),                                   # PAST owner: kept (rule removed by D20)
        fb(1, B, 1, 100, "vouch"),                                    # B = wallet of #2 AND #3, none rated: no carrier
        fb(1, E, 1, 50, "vouch"), fb(1, E, 2, 0, "review"),           # E = wallet of #4 -> agent node #4
        fb(1, E, 3, 0, "vouch", revoked=True),                        # revoked: ignored, the 50 stays
        fb(4, A, 1, 100, "vouch"),                                    # #4 is rated, so it carries E's row (R7)
    ]
    g = build_graph(fbs, idn, schema(), ["vouch", "review", "slash", "liveness"], [A, E])
    by_client = {(e.client, g.nodes[u][0]): e for u, e in g.edges()}
    assert g.pairs[(A, 1)].q == -GRID and g.pairs[(A, 1)].tag1 == "slash"
    assert (A, ADDR) not in by_client and (ADDR, A) not in g.index    # R8: no duplicate address node for an anchor
    assert not any(e.client in (C, D, O, OP, AP) for _, e in g.edges())
    assert g.pairs[(PO, 1)].q == GRID and (PO, ADDR) in by_client     # D20: no past-owner rejection
    assert (B, 1) in g.pairs and not any(e.client == B for _, e in g.edges())
    assert g.log["emetteur_agents_non_notes"] == 1                    # B's agents #2, #3 have no mass
    # D48-A: E is an anchor AND the wallet of #4: the anchor row is carried by the anchor node only, #4 carries none
    assert (E, ANCHOR) in by_client and (E, AGENT) not in by_client
    assert by_client[(E, ANCHOR)].q == 5000
    u4 = g.index[(AGENT, 4)]
    assert g.anchor_sourced == {u4} and u4 not in g.rows and u4 not in g.row_src
    c = certify(g, Fraction(1, 3))
    assert u4 in c.node_map and c.node_map.index(u4) not in c.rows      # listed (massive), no row, not even empty
    assert g.log["rejet_measurement_D15"] == 1
    assert sum(v for k, v in g.log.items() if k.startswith("rejet_controleur")) == 3
    # alternative selection: latest VALID -> the C = 100 edge comes back
    g2 = build_graph(fbs, idn, schema(), ["vouch", "review", "slash"], [A], selection="latest_valid")
    assert g2.pairs[(C, 1)].q == GRID
    # tour-2 rule (last of the pair, any tag): the review +1 erases the slash
    g3 = build_graph(fbs, idn, schema(), ["vouch", "review", "slash"], [A], combine="latest_pair")
    assert g3.pairs[(A, 1)].q == GRID


def test_row_copy_d20_and_owner_fallback_d44():
    A, W, P, X = ("0x" + c * 40 for c in "abcd")
    O = lambda i: "0x" + f"{i:040x}"
    idn = ident(owner={1: O(1), 2: O(2), 3: P, 4: P, 5: O(5)}, wallet={1: W, 2: W, 3: ZERO, 4: X, 5: O(5)})
    fbs = [fb(1, A, 1, 100, "vouch"), fb(2, A, 1, 100, "vouch"), fb(3, A, 1, 100, "vouch"), fb(4, A, 1, 100, "vouch"),
           fb(5, W, 1, 100, "vouch"), fb(5, P, 1, 50, "vouch"), fb(5, X, 1, 1, "review")]
    g = build_graph(fbs, idn, schema(), ["vouch", "review"], [A])
    rows = {g.nodes[u]: [(g.nodes[e.dst], e.q, e.client) for e in r] for u, r in g.rows.items()}
    # D20: #1 and #2 both carry W's row, each with its own mass
    assert rows[(AGENT, 1)] == rows[(AGENT, 2)] == [((AGENT, 5), GRID, W)]
    assert g.row_src[g.index[(AGENT, 1)]] == (W, "wallet")
    # without D44, #3 (agentWallet = 0) is silent and P is not an address node (P owns agents... but only via owner)
    assert (AGENT, 3) not in rows and (ADDR, P) in rows
    assert rows[(AGENT, 4)] == [((AGENT, 5), GRID, X)]                # #4 emits its WALLET's row
    g44 = build_graph(fbs, idn, schema(), ["vouch", "review"], [A], owner_fallback=True)
    r44 = {g44.nodes[u]: [(g44.nodes[e.dst], e.q, e.client) for e in r] for u, r in g44.rows.items()}
    assert r44[(AGENT, 3)] == [((AGENT, 5), 5000, P)] and g44.row_src[g44.index[(AGENT, 3)]] == (P, "owner")
    assert r44[(AGENT, 4)] == [((AGENT, 5), GRID, X)]                 # the wallet wins over the owner
    assert (ADDR, P) not in r44                                       # A(P) = {#3} is not empty any more
    # no mass is created: #5 gets (1-α)·Σ over its carriers, one copy per carrier
    c = certify(g44, Fraction(1, 3))
    inv = {gi: ci for ci, gi in enumerate(c.node_map)}
    t5 = c.t[0][inv[g44.index[(AGENT, 5)]]]
    ex = solve_exact(g44, Fraction(1, 3), 0)
    assert t5 <= ex[g44.index[(AGENT, 5)]] * WAD


def test_certify_is_a_subsolution_from_zero():
    """D26 / AM-5.12: every published certificate satisfies t <= F_down(t), and t <= t* (exact rationals)."""
    for seed in range(12):
        for alpha in ALPHAS:
            g = rand_graph(seed, n_agents=10, k=2, p_edge=0.4)
            c = certify(g, alpha)
            assert not verify(c)[3]
            ex = exact_cols(g, alpha)
            for a in range(c.k):
                for ci, gi in enumerate(c.node_map):
                    assert c.t[a][ci] <= ex[a][gi] * WAD


def test_row_max_cap_with_declared_splus():
    """A row longer than ROW_MAX keeps its negatives and largest positives; sPlus declares the true sum, so t stays
    a lower bound of the FULL graph, and e still bounds ‖t − t*‖₁ (declared-omission margin)."""
    from ppr import cap_row
    from graph import ROW_MAX
    n_out = ROW_MAX + 40
    nodes = [(ANCHOR, "0xa"), (AGENT, 0)] + [(AGENT, j) for j in range(1, n_out + 1)]
    index = {k: i for i, k in enumerate(nodes)}
    rng = random.Random(4)
    big = [Edge(index[(AGENT, j)], rng.randint(1, GRID) * (-1 if j % 50 == 0 else 1), "m", j, "t", 1)
           for j in range(1, n_out + 1)]
    g = Graph(nodes=nodes, index=index, rows={0: [Edge(1, GRID, "0xa", 0, "t", 1)], 1: big}, anchors=[0], log={}, rejected=[])
    c = certify(g, Fraction(1, 3))
    u = c.node_map.index(1)
    assert len(c.rows[u]) == ROW_MAX and c.splus[u] == g.splus(1) > sum(q for _, q, _ in c.rows[u] if q > 0)
    assert sum(1 for _, q, _ in c.rows[u] if q < 0) == sum(1 for e in big if e.q < 0)   # negatives all kept
    ex = solve_exact(g, Fraction(1, 3), 0)
    assert all(c.t[0][ci] <= ex[gi] * WAD for ci, gi in enumerate(c.node_map))
    assert l1_err(c, g, [ex], 0) <= c.e[0]
    with pytest.raises(ValueError):
        cap_row([(i, 1, 1) for i in range(ROW_MAX + 1)], is_anchor=True)                # D21


def test_verify_rejects_non_subsolution_and_underdeclared_splus():
    g = rand_graph(2, n_agents=6, k=2)
    c = certify(g, Fraction(1, 3))
    bad = Certificate(**{**c.__dict__, "t": [[x + 1 for x in col] for col in c.t]})
    assert any("sub-solution" in e for e in verify(bad)[3])
    u = next(u for u, r in c.rows.items() if any(q > 0 for _, q, _ in r))
    under = Certificate(**{**c.__dict__, "splus": {**c.splus, u: 0}})
    assert any("sPlus" in e for e in verify(under)[3])


def test_alias_encoding_roundtrip():
    fbs_t, idn_t, anc_t = X.toy_identity_graph()
    sch = {k: v for k, v in schema().items() if k in ("vouch", "review", "slash")}
    g = build_graph(fbs_t, idn_t, sch, ["vouch", "review", "slash"], anc_t, owner_fallback=True)
    c = certify(g, Fraction(1, 3))
    obj = X.export_certificate(g, c, idn_t, schema=sch, filter_tags=["vouch", "review", "slash"])
    al = {r["u"]: r["aliasOf"] for r in obj["rows"] if r["aliasOf"] is not None}
    u1, u2 = (c.node_map.index(g.index[(AGENT, j)]) for j in (1, 2))
    assert al == {u2: u1}
    rows, splus, meta, _ = X.decode_rows(obj["calldata"]["rows"])
    assert rows == c.rows and splus == c.splus
    u3, u4 = (c.node_map.index(g.index[(AGENT, j)]) for j in (3, 4))
    assert meta[u3][1] is True and meta[u4][1] is False               # VIA_OWNER bit
    assert meta[u2] == (meta[u1][0], False, u1)


def test_zero_weight_no_edge():
    A = "0x" + "a" * 40
    idn = ident(owner={1: "0x" + "b" * 40}, wallet={1: "0x" + "b" * 40})
    g = build_graph([fb(1, A, 1, 0, "review")], idn, schema(), ["review"], [A])
    assert g.n_edges() == 0 and g.log["poids_nul"] == 1


def test_tags_max():
    with pytest.raises(ValueError):
        build_graph([], ident({}, {}), schema(), [f"t{i}" for i in range(17)], [])


def test_leave_one_out():
    assert trust_robust([5, 3, 1], 2) == 4
    assert trust_robust([5, 3, 1], 3) == 1
    assert trust_robust([5, 3, 1], 4) == 0
    assert trust_robust([5, 3, 1], 1) == 9


def test_leak_bound_holds():
    rng = random.Random(1)
    for seed in range(5):
        g = rand_graph(seed, n_agents=12, k=1, p_neg=0)
        S = {g.index[(AGENT, j)] for j in range(6, 12)}
        for alpha in ALPHAS:
            t = solve_float(g, alpha, np.eye(g.n)[:, 0])
            assert t[list(S)].sum() <= leak_bound(g, alpha, t, S) + 1e-12


# ----------------------------------------------------------------------------- export

def test_export_roundtrip(tmp_path):
    g = rand_graph(3, n_agents=10, k=2)
    for kind, v in g.nodes:                          # ENCODING §3.2: an agent row with edges carries its source
        g.row_src[g.index[(kind, v)]] = (X.toy_wallet(v), "wallet") if kind == AGENT else (v, "anchor")
    cert = certify(g, Fraction(1, 3))
    obj = X.export_certificate(g, cert, None, schema=schema(), filter_tags=["vouch", "slash"])
    assert obj["set"]["setId"] == X.set_id(obj["set"]) and obj["set"]["policy"]["submitters"]
    p = tmp_path / "c.json"
    p.write_text(json.dumps(obj))
    X.check_file(p)
    assert X.decode_rows(obj["calldata"]["rows"])[0] == cert.rows
    assert len(bytes.fromhex(obj["calldata"]["vectors"][2:])) == cert.n * (cert.k + 1) * 8


def test_published_vectors_verify():
    vdir = Path(__file__).resolve().parents[1] / "vectors"
    files = sorted(vdir.glob("*.json"))
    if not files:
        pytest.skip("lancer export.py d'abord")
    for p in files:
        X.check_file(p)


# ----------------------------------------------------------------------------- code-review fixes (E1)

def test_alias_cap_and_empty_agent_row_keeps_source():
    """ROW_ALIAS_MAX aliases per ref at most; an absorbing agent row still commits its source (challengeable)."""
    A, W = "0x" + "a" * 40, "0x" + "b" * 40
    n = X.ROW_ALIAS_MAX + 5
    idn = ident(owner={j: "0x" + f"{j:040x}" for j in range(1, n + 2)},
                wallet={**{j: W for j in range(1, n + 1)}, n + 1: "0x" + "c" * 40})
    fbs = [fb(j, A, 1, 100, "vouch") for j in range(1, n + 1)] + [fb(n + 1, W, 1, 100, "vouch")]
    g = build_graph(fbs, idn, schema(), ["vouch"], [A])
    c = certify(g, Fraction(1, 3))
    obj = X.export_certificate(g, c, idn, schema=schema(), filter_tags=["vouch"])
    refs = [r["aliasOf"] for r in obj["rows"] if r["aliasOf"] is not None]
    assert max(refs.count(x) for x in set(refs)) == X.ROW_ALIAS_MAX and len(set(refs)) == 2
    sink = next(r for r in obj["rows"] if obj["nodes"][r["u"]].get("agentId") == n + 1)
    assert sink["edges"] == [] and sink["source"] == "0x" + "c" * 40 and sink["via"] == "wallet"
    X.check_file_obj(obj)


def test_cap_row_never_drops_negatives():
    from ppr import cap_row
    from graph import ROW_MAX
    row = [(i, -1, 1) for i in range(ROW_MAX + 1)]
    with pytest.raises(ValueError):
        cap_row(row, is_anchor=False)
    row = [(i, -1 if i < 10 else 5, 1) for i in range(ROW_MAX + 30)]
    kept = cap_row(row, is_anchor=False)
    assert len(kept) == ROW_MAX and sum(1 for e in kept if e[1] < 0) == 10


def test_replay_refuses_undecoded_approval():
    from graph import replay_identity_events, TOPIC_APPROVAL
    idn = ident(owner={1: "0x" + "a" * 40}, wallet={1: ZERO})
    with pytest.raises(ValueError):
        replay_identity_events(idn, [{"ev": TOPIC_APPROVAL, "block": 5, "li": 0}], 0, 10)
    replay_identity_events(idn, [{"ev": "Approval", "block": 5, "li": 0, "agent": 1, "approved": "0x" + "B" * 40}], 0, 10)
    assert idn.approved[1] == "0x" + "b" * 40


def test_violation_vectors_are_valid_but_false():
    """D37: each violation vector passes the arithmetic (t ≤ y) yet moves trust up or distrust down."""
    vdir = Path(__file__).resolve().parents[1] / "vectors" / "violations"
    files = sorted(vdir.glob("*.json"))
    assert {p.stem for p in files} == {"dilution", "fabricated", "inflated", "omitted_negative"}
    for p in files:
        X.check_file(p)
        v = json.loads(p.read_text())["violation"]
        h, c = int(v["honestValue"]), int(v["committedValue"])
        assert (c > h) if v["affects"] == "t" else (c < h), p


def test_tie_between_tags_highest_feedback_index_decides():
    """Unified v1 (F-6): equal weights from two tags -> the feedback with the HIGHEST index decides, whatever the tag
    names (the contract stores tag hashes only and scans from the last index down)."""
    from graph import combine_pairs
    A = "0x" + "a" * 40
    idn = ident(owner={1: "0x" + "1" * 40}, wallet={1: "0x" + "1" * 40})
    sch = schema()
    for first, second in (("vouch", "review"), ("review", "vouch")):
        fbs = [fb(1, A, 1, 100 if first == "vouch" else 1, first), fb(1, A, 2, 100 if second == "vouch" else 1, second)]
        pe = combine_pairs(fbs, idn, sch, ["vouch", "review"])[(A, 1)]
        assert pe.q == 10_000 and pe.feedback_index == 2 and pe.tag1 == second
    fbs = [fb(1, A, 1, -100, "slash"), fb(1, A, 2, -1, "review")]          # negative tie: -10000 both
    pe = combine_pairs(fbs, idn, sch, ["slash", "review"])[(A, 1)]
    assert pe.q == -10_000 and pe.feedback_index == 2


def test_set_id_of_published_vectors_matches_cast():
    """The hand-written ABI encoder of export.set_id equals `cast abi-encode` (when Foundry is installed)."""
    import shutil
    import subprocess
    cast = shutil.which("cast") or str(Path.home() / ".foundry" / "bin" / "cast")
    if not Path(cast).exists():
        pytest.skip("cast not installed")
    import certifier as C
    for p in sorted((Path(__file__).resolve().parents[1] / "vectors").rglob("*.json")):
        obj = json.loads(p.read_text())
        st = obj["set"]
        assert X.set_id(st) == st["setId"]
        pol = st["policy"]
        tags = ",".join(f"({t['tag']},{t['min']},{t['neutral']},{t['max']},{t['kind']})" for t in st["tags"])
        pv = ",".join(f"[{','.join(pol[f])}]" if f == "submitters" else str(pol[f]).lower()
                      if isinstance(pol[f], bool) else str(pol[f]) for f, _ in X.POLICY_FIELDS)
        out = subprocess.run([cast, "abi-encode", "f(address[],uint64[],uint32,uint32,bytes32,"
                              "(string,int128,int128,int128,uint8)[]," + C.POLICY_SIG + ")",
                              f"[{','.join(st['anchors'])}]", f"[{','.join(st['lambdas'])}]", str(st["alphaN"]),
                              str(st["alphaD"]), st["tagSchemaHash"], f"[{tags}]", f"({pv})"],
                             capture_output=True, text=True, check=True).stdout.strip()
        assert out == "0x" + X.abi_encode(X.SET_T, X.set_params_values(st)).hex(), p.name

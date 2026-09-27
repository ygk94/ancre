"""Tests R4. Lancer : cd solver && .venv/bin/python -m pytest -q tests"""
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
        c = Certificate(n=base.n, anchors=base.anchors, alphaN=1, alphaD=3, lambdas=base.lambdas,
                        rows={u: r for u, r in base.rows.items() if rng.random() < 0.8},
                        bplus=base.bplus, bminus=base.bminus,
                        t=[[rng.randint(0, WAD // 3) for _ in range(base.n)] for _ in range(2)],
                        node_map=base.node_map, mode=mode)
        c.bplus = {u: base.bplus[u] for u in c.rows}
        c.bminus = {u: base.bminus[u] for u in c.rows}
        c.r, c.e, c.d, errs = verify(c)
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
    c2 = Certificate(**{**c.__dict__, "rows": {0: c.rows[0]}, "bplus": {0: c.bplus[0]}, "bminus": {0: c.bminus[0]}})
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


def test_graph_rules_d14_d15_d16():
    A, B, C, D, E, O, OP, AP, PO = ("0x" + c * 40 for c in "abcde0f12")
    idn = ident(owner={1: O, 2: B, 3: B, 4: E}, wallet={1: O, 2: B, 3: B, 4: E},
                operators={O: {OP}}, approved={1: AP}, past_owners={1: {PO}})
    fbs = [
        fb(1, A, 1, -100, "slash"), fb(1, A, 2, 1, "review"),         # D14 : le slash domine
        fb(1, C, 1, 100, "vouch"), fb(1, C, 2, 10**38, "vouch"),      # dernier hors bornes -> rien (latest_then_reject)
        fb(1, D, 1, 100, "liveness"),                                 # D15 : measurement, pas d'arête
        fb(1, O, 1, 100, "vouch"), fb(1, OP, 1, 100, "vouch"),        # owner, opérateur
        fb(1, AP, 1, 100, "vouch"), fb(1, PO, 1, 100, "vouch"),       # approved, ancien owner
        fb(1, B, 1, 100, "vouch"),                                    # B = wallet de #2 ET #3 -> nœud-adresse
        fb(1, E, 1, 50, "vouch"), fb(1, E, 2, 0, "review"),           # E = wallet unique de #4 -> nœud-agent
        fb(1, E, 3, 0, "vouch", revoked=True),                        # révoqué : ignoré, le 50 reste
    ]
    g = build_graph(fbs, idn, schema(), ["vouch", "review", "slash", "liveness"], [A, E])
    by_client = {(e.client, g.nodes[u][0]): e for u, e in g.edges()}
    assert by_client[(A, ANCHOR)].q == -GRID and by_client[(A, ANCHOR)].tag1 == "slash"
    assert (A, ADDR) in by_client                                     # l'ancre A émet aussi comme nœud-adresse
    assert not any(e.client == C for _, e in g.edges())
    assert not any(e.client == D for _, e in g.edges())
    for x in (O, OP, AP, PO):
        assert not any(e.client == x for _, e in g.edges())
    assert (B, ADDR) in by_client
    assert (E, AGENT) in by_client and (E, ANCHOR) in by_client       # ancre distincte du nœud-agent #4
    assert g.nodes[[u for u, e in g.edges() if e.client == E and g.nodes[u][0] == AGENT][0]] == (AGENT, 4)
    assert by_client[(E, AGENT)].q == 5000
    assert g.log["rejet_measurement_D15"] == 1
    assert sum(v for k, v in g.log.items() if k.startswith("rejet_controleur")) == 4
    # sélection alternative : dernier VALIDE -> l'arête C = 100 réapparaît
    g2 = build_graph(fbs, idn, schema(), ["vouch", "review", "slash"], [A], selection="latest_valid")
    assert any(e.client == C and e.q == GRID for _, e in g2.edges())
    # règle du tour 2 (dernier du couple, tous tags) : le review +1 efface le slash
    g3 = build_graph(fbs, idn, schema(), ["vouch", "review", "slash"], [A], combine="latest_pair")
    assert [e.q for u, e in g3.edges() if e.client == A and g3.nodes[u][0] == ANCHOR] == [GRID]


def test_zero_weight_no_edge():
    A = "0x" + "a" * 40
    idn = ident(owner={1: "0x" + "b" * 40}, wallet={1: "0x" + "b" * 40})
    g = build_graph([fb(1, A, 1, 0, "review")], idn, schema(), ["review"], [A])
    assert g.n_edges() == 0 and g.log["poids_nul"] == 1


def test_tags_max():
    with pytest.raises(ValueError):
        build_graph([], ident({}, {}), schema(), [f"t{i}" for i in range(9)], [])


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
    cert = certify(g, Fraction(1, 3))
    obj = X.export_certificate(g, cert, None, schema=schema(), filter_tags=["vouch", "slash"])
    p = tmp_path / "c.json"
    p.write_text(json.dumps(obj))
    X.check_file(p)
    assert X.decode_rows(obj["calldata"]["rows"]) == cert.rows
    assert len(bytes.fromhex(obj["calldata"]["vectors"][2:])) == cert.n * (cert.k + 1) * 8


def test_published_vectors_verify():
    vdir = Path(__file__).resolve().parents[1] / "vectors"
    files = sorted(vdir.glob("*.json"))
    if not files:
        pytest.skip("lancer export.py d'abord")
    for p in files:
        X.check_file(p)

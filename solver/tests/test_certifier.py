"""Offline tests of the certifier service (no chain): alignment, planning, triggers, replacement rule."""
import sys
from fractions import Fraction
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import certifier as C
import export as X
import run_mainnet as R
from graph import AGENT, ANCHOR, Feedback, build_graph
from ppr import certify, e_eff, verify

RAW = __import__("json").load(open(Path(__file__).resolve().parents[1] / "schema_reference.json"))


def honest_cfg(fbs, **kw):
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    return C.SetConfig(name="t", anchors=[h1, h2], lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3,
                       filter_tags=RAW["filters"]["core"], **kw)


@pytest.fixture(scope="module")
def mainnet():
    return R.load_mainnet()


def test_align_on_existing_table_keeps_indices_and_values(mainnet):
    fbs, idn = mainnet
    cfg = honest_cfg(fbs)
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors)
    cert = certify(g, cfg.alpha)
    anchors = C.anchor_table(cfg.anchors)
    table = anchors + [(AGENT, 999_999), (AGENT, 4), (AGENT, 12_345)]     # older nodes, some unrelated
    al = C.align(g, cert, table, prev_ncert=len(table))
    assert al.nodes[:len(table)] == table and al.cert.n == len(al.nodes)
    assert not verify(al.cert)[3] and al.cert.r == cert.r and e_eff(al.cert) == e_eff(cert)
    i4 = al.nodes.index((AGENT, 4))
    assert i4 == 3 and al.cert.d[i4] == cert.d[cert.node_map.index(g.index[(AGENT, 4)])]
    assert al.cert.t[0][al.nodes.index((AGENT, 999_999))] == 0
    assert len(al.new_nodes) == 5 * (cert.n - 3)                            # #4 already known, anchors registered
    with pytest.raises(ValueError):
        C.align(g, cert, table, prev_ncert=len(al.nodes) + 1)


def test_encode_v0_expands_alias_and_refuses_splus():
    fbs, idn, anc = X.toy_identity_graph()
    sch = {k: v for k, v in C.SetConfig(name="x", anchors=[], lambdas=[], alphaN=1, alphaD=3,
                                         filter_tags=[]).schema().items() if k in ("vouch", "review", "slash")}
    g = build_graph(fbs, idn, sch, list(sch), anc, owner_fallback=True)
    cert = certify(g, Fraction(1, 3))
    nodes = [g.nodes[i] for i in cert.node_map]
    with pytest.raises(X.NotEncodable):
        X.encode(cert, nodes, idn, version="v0")
    fbs2 = [f for f in fbs if f.client != "0x" + "f" * 40]                   # drop the ROW_MAX row
    g2 = build_graph(fbs2, idn, sch, list(sch), anc, owner_fallback=True)
    c2 = certify(g2, Fraction(1, 3))
    enc = X.encode(c2, [g2.nodes[i] for i in c2.node_map], idn, version="v0")
    rows, splus, meta, _ = X.decode_rows("0x" + enc["rows"].hex())
    assert rows == c2.rows and all(m[2] is None for m in meta.values())    # no alias in v0


def test_plan_splits_large_first_certificate(mainnet):
    fbs, idn = mainnet
    cfg = honest_cfg(fbs, gas=C.GasPolicy(add_nodes_per_tx=2))
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors)
    al = C.align(g, certify(g, cfg.alpha), C.anchor_table(cfg.anchors), 0)
    cfg.gas.inline_nodes_max = 1
    cfg.gas.reserve_slots_per_tx = 4                                        # k = 2: 1 chunk of 4 nodes per tx
    txs = C.plan(cfg, "0x" + "00" * 32, al, X.encode(al.cert, al.nodes, idn, version="v0"), 0, 16)
    assert [t.fn for t in txs] == ["addNodes", "addNodes", "reserveCapacity", "reserveCapacity",
                                   "submitCertificate"]
    assert [t.args[1] for t in txs if t.fn == "reserveCapacity"] == ["4", "6"]
    assert txs[-1].args[3] == "0x"                                          # nodes already added
    small = C.plan(honest_cfg(fbs), "0x" + "00" * 32, al, X.encode(al.cert, al.nodes, idn, version="v0"), 0, 16)
    assert [t.fn for t in small] == ["submitCertificate"] and small[0].args[3] == "0x" + al.new_nodes.hex()


def test_triggers_ignore_zero_mass_clients(mainnet):
    fbs, idn = mainnet
    cfg = honest_cfg(fbs)
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors)
    sup = C.Support.of(g, certify(g, cfg.alpha))
    ea0b, sc = R.resolve(R.EA0B, fbs), R.resolve(R.SCANNER, fbs)
    assert C.relevant({"kind": "NewFeedback", "client": ea0b, "agentId": 99}, sup)      # source of #18's row
    assert not C.relevant({"kind": "NewFeedback", "client": sc, "agentId": 2}, sup)
    assert C.relevant({"kind": "Transfer", "agentId": 18}, sup)
    assert not C.relevant({"kind": "MetadataSet", "agentId": 182}, sup)
    assert C.relevant({"kind": "Upgraded"}, sup)


def test_replacement_wait_and_gas_limit(tmp_path):
    cfg = C.SetConfig(name="w", anchors=["0x" + "1" * 40], lambdas=[10**18], alphaN=1, alphaD=3, filter_tags=["vouch"],
                      min_refresh=600, max_age=10_000, slack_refresh=10)
    oc = lambda blk, e, rc=False: C.OnChain(blk, e, "", "", 0, rc)
    assert C.replacement_wait(oc(0, 0), 100, 50, cfg) == 0                  # no certificate yet
    assert C.replacement_wait(oc(100, 16), 150, 16, cfg) == 0               # not worse
    assert C.replacement_wait(oc(100, 16), 150, 24, cfg) == 551             # within slack: wait minRefresh
    assert C.replacement_wait(oc(100, 16), 150, 99, cfg) == 9951            # beyond slack: wait maxAge
    assert C.replacement_wait(oc(100, 16, True), 150, 99, cfg) == 0         # REGISTRY_CHANGED lifts the rule
    assert C.replacement_wait(oc(100, 40), 150, 30, cfg) == 0               # a proof widened eCur on chain
    short = C.SetConfig(**{**cfg.__dict__, "max_age": 300})
    assert C.replacement_wait(oc(100, 16), 150, 24, short) == 251           # maxAge < minRefresh: the earlier wins
    assert C.GasPolicy(margin_bps=200, margin_abs=5000).limit(1_000_000) == 1_025_000
    st = C.State.load(tmp_path / "s.json", "0xaa", "0xbb")
    st.save(tmp_path / "s.json")
    with pytest.raises(RuntimeError):
        C.State.load(tmp_path / "s.json", "0xcc", "0xbb")


def test_cast_argv_order_and_error_selectors():
    ch = C.Chain("http://x", C.Signer("0x" + "1" * 40), cast="/bin/echo")
    out = ch._run("send", "--gas-limit", "500000", "--json", "0xto", "f(uint256)", "500000", sign=True)
    assert out.split() == ["send", "--rpc-url", "http://x", "--unlocked", "--from", "0x" + "1" * 40, "--gas-limit",
                           "500000", "--json", "0xto", "f(uint256)", "500000"]
    assert C.ERRORS["0x0cb49808"] == "BadProof" and C.ERRORS["0xee3f07f1"] == "NotBetter"


def test_trigger_on_transfer_of_a_controller_rejected_target():
    """R6 rejects A -> #1 while A owns #1; a transfer of #1 must trigger (the edge comes back)."""
    from graph import Identity
    A, B = "0x" + "a" * 40, "0x" + "b" * 40
    idn = Identity(block=0, owner={1: A, 2: "0x" + "2" * 40}, wallet={1: A, 2: "0x" + "2" * 40})
    fbs = [Feedback(1, A, 1, 100, 0, "vouch", "", False), Feedback(2, A, 1, 100, 0, "vouch", "", False)]
    cfg = C.SetConfig(name="r", anchors=[A, B], lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3, filter_tags=["vouch"])
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors)
    assert (A, 1) not in g.pairs and (AGENT, 1) not in g.index
    sup = C.Support.of(g, certify(g, cfg.alpha))
    assert C.relevant({"kind": "Transfer", "agentId": 1}, sup)

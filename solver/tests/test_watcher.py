"""Offline tests of the watcher: Merkle paths match the contract's _verifyMerkle, audit classifies D37 vectors."""
import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import certifier as C
import run_mainnet as R
import simulate as S
import watcher as Wt
from export import keccak, merkle_root

HERE = Path(__file__).resolve().parents[1]


def verify_merkle(leaf, pos, cnt, proof, root):
    """Python transcription of AnchoredReputation._verifyMerkle."""
    if pos >= cnt:
        return False
    h, i = leaf, 0
    while cnt > 1:
        if pos & 1:
            h, i = keccak(proof[i] + h), i + 1
        elif pos + 1 < cnt:
            h, i = keccak(h + proof[i]), i + 1
        pos, cnt = pos >> 1, (cnt + 1) >> 1
    return i == len(proof) and h == root


def test_merkle_proof_matches_contract_rule():
    rng = random.Random(0)
    for n in range(1, 40):
        leaves = [keccak(rng.randbytes(8)) for _ in range(n)]
        root = merkle_root(leaves)
        for pos in range(n):
            assert verify_merkle(leaves[pos], pos, n, Wt.merkle_proof(leaves, pos), root)


@pytest.mark.parametrize("name,kinds", [("fabricated", {"FABRICATED"}), ("inflated", {"INFLATED"}),
                                        ("dilution", {"DILUTION"}), ("omitted_negative", {"OMITTED_NEGATIVE"})])
def test_audit_classifies_violation_vectors(name, kinds, tmp_path, monkeypatch):
    monkeypatch.setattr(S, "SCR", tmp_path)
    fbs, idn = R.load_mainnet()
    obj = json.loads((HERE / "vectors" / "violations" / f"{name}.json").read_text())
    cert, nodes, enc = S.vector_calldata(obj)
    cfg = S.cfg_from_vector(obj, name)
    disc = Wt.audit("0x" + enc["rows"].hex(), nodes, fbs, idn, cfg)
    assert {d.kind for d in disc if d.kind != "OMITTED_POSITIVE"} == kinds
    for d in disc:
        if d.provable_v0:
            p = d.proof
            leaf = keccak(bytes.fromhex(p["row"][2:]))
            assert verify_merkle(leaf, p["rowPos"], len(cert.rows), [bytes.fromhex(x[2:]) for x in p["proof"]],
                                 enc["graphRoot"])


def test_audit_of_honest_vector_is_clean(tmp_path, monkeypatch):
    monkeypatch.setattr(S, "SCR", tmp_path)
    fbs, idn = R.load_mainnet()
    obj = json.loads((HERE / "vectors" / "mainnet_slash_anchor.json").read_text())
    cert, nodes, enc = S.vector_calldata(obj)
    disc = Wt.audit("0x" + enc["rows"].hex(), nodes, fbs, idn, S.cfg_from_vector(obj, "honest"))
    assert [d for d in disc if d.kind != "OMITTED_POSITIVE"] == []


def test_liveness_alerts():
    cfg = C.SetConfig(name="l", anchors=["0x" + "1" * 40], lambdas=[10**18], alphaN=1, alphaD=3, filter_tags=["vouch"],
                      max_age=1000, refresh_lead=100)
    oc = lambda blk, rc=False: C.OnChain(blk, 1, "", "", 0, rc)
    assert Wt.liveness(oc(0), 10, cfg) == "NO_CERT"
    assert Wt.liveness(oc(100), 500, cfg) is None
    assert Wt.liveness(oc(100), 1050, cfg).startswith("REFRESH_DUE")
    assert Wt.liveness(oc(100), 1200, cfg).startswith("STALE")
    assert Wt.liveness(oc(100, True), 500, cfg) == "REGISTRY_CHANGED"


def test_audit_sign_flip_deflated_and_prepared_proof(tmp_path, monkeypatch):
    """Lowered weights in a full row and flipped signs are reported; without a signer a proof is only prepared."""
    from export import encode
    from graph import Identity, Feedback, build_graph
    from ppr import certify
    from fractions import Fraction
    A, W = "0x" + "a" * 40, "0x" + "b" * 40
    idn = Identity(block=0, owner={1: W, 2: "0x" + "2" * 40, 3: "0x" + "3" * 40, 4: "0x" + "4" * 40},
                   wallet={1: W, 2: "0x" + "2" * 40, 3: "0x" + "3" * 40, 4: "0x" + "4" * 40})
    f = lambda a, c, v: Feedback(a, c, 1, v, 0, "vouch", "", False)
    fbs = [f(1, A, 100), f(2, W, 90), f(3, W, 80), f(4, W, 30)]
    cfg = C.SetConfig(name="s", anchors=[A, "0x" + "c" * 40], lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3,
                      filter_tags=["vouch"])
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors)
    c = certify(g, Fraction(1, 3))
    nodes = [g.nodes[i] for i in c.node_map]
    u1 = nodes.index(("agent", 1))
    i2, i3 = nodes.index(("agent", 2)), nodes.index(("agent", 3))
    c.rows[u1] = [(d, (-9000 if d == i2 else 5000 if d == i3 else q), fi) for d, q, fi in c.rows[u1]]
    c.splus[u1] = sum(q for _, q, _ in c.rows[u1] if q > 0)
    enc = encode(c, nodes, idn, version="v0")
    kinds = {d.kind for d in Wt.audit("0x" + enc["rows"].hex(), nodes, fbs, idn, cfg)}
    assert {"SIGN_FLIP"} <= kinds
    c.rows[u1] = [(d, q, fi) for d, q, fi in c.rows[u1] if d != i2]           # now committed S+ = 5000 + 3000 < GRID
    c.rows[u1] = [(d, (9500 if d == i3 else q), fi) for d, q, fi in c.rows[u1]]
    c.splus[u1] = sum(q for _, q, _ in c.rows[u1] if q > 0)
    enc = encode(c, nodes, idn, version="v0")
    disc = Wt.audit("0x" + enc["rows"].hex(), nodes, fbs, idn, cfg)
    assert {d.kind for d in disc} >= {"INFLATED", "DILUTION"}
    om = next(d for d in disc if d.kind == "DILUTION")
    r = Wt.prove(C.Chain("http://unused"), "0x0", "0x0", om, C.GasPolicy())
    assert r["status"] == "prepared" and r["args"][6] == "2"

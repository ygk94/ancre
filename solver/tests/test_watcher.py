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

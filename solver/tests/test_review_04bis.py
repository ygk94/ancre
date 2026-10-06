"""Regressions of the /code-review high of 04-bis (06/10)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import alchemy_hook as A
import refresh as F
import simulate as S
import watcher as Wt
import common_vectors as CV
from export import keccak

HERE = Path(__file__).resolve().parents[1]


def ev(i, block=100):
    return {"kind": "NewFeedback", "block": block, "tx": "0x" + f"{i:064x}", "logIndex": 0, "agentId": 1,
            "client": "0x" + "aa" * 20}


def test_failed_or_lagging_recertification_is_retried_by_the_next_round():
    answers = [{"action": "data_behind"}, RuntimeError("boom"), {"action": "planned"}]
    calls = []

    def recert(evs, b):
        calls.append(b)
        a = answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a
    d = A.Dispatcher(on_recertify=recert)
    r1 = d.handle([ev(1)], "webhook", 100)
    assert r1["pending"] == 1                                    # data_behind: not marked seen
    with pytest.raises(RuntimeError):
        d.handle([ev(1)], "poll", 100)                           # handler raised: still not seen
    r3 = d.handle([ev(1)], "poll", 100)
    assert r3["pending"] == 0 and calls == [100, 100, 100]
    assert d.handle([ev(1)], "poll", 100)["fresh"] == 0          # now it is a duplicate


def test_dedup_memory_is_pruned():
    d = A.Dispatcher(on_recertify=lambda e, b: {"action": "planned"}, keep_blocks=10)
    for i in range(50_010):
        d.seen[("0x%x" % i, 0)] = i // 1000
    d.handle([ev(1, block=60)], "poll", 60)
    assert len(d.seen) < 15_000 and max(d.seen.values()) == 60


def test_anchor_sourced_row_edges_are_still_audited(tmp_path, monkeypatch):
    """A contract without AnchorAsSource accepts the copy row; a FABRICATED edge in it must still be found (proveEdge),
    and the row itself is reported ANCHOR_SOURCE (not provable: proveWallet would revert NothingToProve)."""
    monkeypatch.setattr(S, "SCR", tmp_path)
    obj = json.loads((HERE / "vectors" / "common" / "common_A_attack_anchor_copy.json").read_text())
    cert, nodes, enc = S.vector_calldata(obj)
    cfg = S.cfg_from_vector(obj, "a_attack")
    reg = CV.Reg.from_block(obj["registry"])
    fbs, idn = reg.build()
    disc = Wt.audit("0x" + enc["rows"].hex(), nodes, fbs, idn, cfg)
    kinds = {d.kind for d in disc}
    assert "ANCHOR_SOURCE" in kinds and "SOURCE" not in kinds
    # the copy faithfully mirrors X's registry edge: nothing provable on its edges; now drop the registry edge
    fbs2 = [f for f in fbs if f.agent_id != 20]
    disc2 = Wt.audit("0x" + enc["rows"].hex(), nodes, fbs2, idn, cfg)
    assert any(d.kind == "FABRICATED" and d.provable and d.agent_id == 20 and nodes[d.u] == ("agent", 10)
               for d in disc2)


def test_get_logs_halves_a_refused_range():
    calls = []

    class Fake:
        def __call__(self, m, p):
            lo, hi = int(p[0]["fromBlock"], 16), int(p[0]["toBlock"], 16)
            calls.append(hi - lo + 1)
            if hi - lo + 1 > 250_000:
                raise F.RpcError({"code": -32005, "message": "query returned more than 10000 results"})
            return []
    F.get_logs(Fake(), "0x0", ["0x0"], 1, 1_000_000)
    assert calls[0] == 500_000 and max(c for c in calls[1:] if c) <= 250_000


def test_refresh_topics_are_the_polling_loop_topics():
    assert F.T["NewFeedback"] == A.TOPICS["NewFeedback"] == \
        "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc"
    assert all(F.T[k] == A.TOPICS[k] for k in A.TOPICS if k != "CertificateSubmitted")
    assert F.T["Registered"] == "0x" + keccak(b"Registered(uint256,string,address)").hex()

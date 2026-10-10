"""alchemy-live (10/10): webhook -> fresh data (Envio) -> recertification PREPARED, on the official testnet instance.

Offline. Fixtures:
  tests/fixtures/alchemy/testnet-68979070-68979110.jsonl   Alchemy-shaped payloads rebuilt from REAL testnet logs
      (`alchemy_hook.py payloads --rpc https://testnet-rpc.monad.xyz --chain 10143 --from-block 68979070
      --to-block 68979110 --ancre 0x8bE6…da9B`, 10/10): anchor-B's slash of provider-2 (68 979 076), the certificate
      that followed (68 979 094), a third party's review (68 979 105);
  tests/fixtures/indexer-testnet/   Envio rows of the demo agents (make_fixture.py), head 69 817 592.
The official set config is solver/sets/testnet-official.json (setId 0x627c…3e10)."""
import argparse
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import alchemy_hook as A
import certifier as C
from export import node_key
from from_indexer import FixtureSource
from test_review_max_04bis import TableChain

HERE = Path(__file__).resolve().parents[1]
FIX = HERE / "tests" / "fixtures" / "alchemy" / "testnet-68979070-68979110.jsonl"
IDX = HERE / "tests" / "fixtures" / "indexer-testnet"
CFG = HERE / "sets" / "testnet-official.json"
ANCRE = "0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B"
SET_ID = "0x627c8afe36b03432b280723a7170357333ded4d9ce56a78467c5829739653e10"
GRAPH_ROOT = "0xc370141fd91741489161fdacc30d6dfe8399aef6680e68bf331586431e33abb2"   # certificate(setId), 10/10
VECTOR_ROOT = "0x4c83d065488cdde4f0e1af2e25f84d8809f20ce09ebe5dc6fd97e48a5b1bf70f"
ANCHOR_A = "0xc016278eedaa2c73878bd28279c7f8d0ab2f5619"
KEY = "whsec_test_only_not_a_real_key"
PAYLOADS = [json.loads(l) for l in FIX.read_text().splitlines() if l.strip()]
HEAD = 69_817_600


class OfficialChain(TableChain):
    """The official instance as read on 10/10: node table (7 nodes), certificate of block 68 979 094 (stale: age
    > maxAge 288 000), quality view; eth_estimateGas answers 560 952 (MEASURED through Alchemy, 10/10)."""

    def __init__(self, nodes, head=HEAD):
        super().__init__([node_key(n) for n in nodes])
        self.signer = C.Signer("0x810724967b0d895d087b991304385720d4903c3f")
        self.sender, self.head, self.sent, self.estimated = self.signer.address, head, [], []

    def block_number(self):
        return self.head

    def call(self, to, sig, *args):
        if sig == C.CERT_VIEW:
            return f"68979094\n19\n0\n{GRAPH_ROOT}\n{VECTOR_ROOT}\n0x0\n7\n7\nfalse"
        return "592592592592592590\n0\n74074074074074074\nfalse"

    def estimate(self, to, sig, *args):
        self.estimated.append(sig)
        return 560_952

    def send(self, *a, **k):
        raise AssertionError("prepare mode must never send")


def official_nodes():
    cfg = C.SetConfig.load(CFG)
    src = IndexerSource()
    import tempfile
    d = Path(tempfile.mkdtemp())
    from from_indexer import export
    from graph import load_feedbacks_onchain, load_identity_json
    f = export(src, src.head(), d)
    svc = C.Certifier(cfg, None, ANCRE, SET_ID, d / "s.json", C.Journal(None))
    _, al, enc = svc.compute(load_feedbacks_onchain(f["feedbacks"]), load_identity_json(f["identity"]),
                             C.anchor_table(cfg.anchors), 0)
    return al.nodes, "0x" + enc["graphRoot"].hex()


class IndexerSource(FixtureSource):
    """The fixture, with a head that can lag (to test the wait) and optional extra feedback rows (the trigger)."""

    def __init__(self, heads=None, extra=None):
        super().__init__(IDX, 10143)
        self.heads, self.extra, self.last = list(heads or []), list(extra or []), None

    def head(self):
        if self.heads:
            self.last = self.heads.pop(0)
        return self.last if self.last is not None else super().head()

    def rows(self, entity, block=None, where=None):
        rows = super().rows(entity, block, where)
        return rows + [r for r in self.extra if entity == "Feedback" and (block is None or int(r["blockNumber"]) <= block)]


def args(tmp_path, **kw):
    a = argparse.Namespace(set_id=SET_ID, set_config=str(CFG), ancre=ANCRE, data=None, indexer=None, chain=10143,
                           rpc="http://unused", sender=None, keystore=None, password_env=None, send=False,
                           state=str(tmp_path / "state.json"), data_dir=str(tmp_path / "data"), indexer_wait=5.0)
    for k, v in kw.items():
        setattr(a, k, v)
    return a


def test_official_config_is_the_official_set():
    assert C.SetConfig.load(CFG).set_id == SET_ID


def test_fixture_reproduces_the_certificate_on_chain():
    """The Envio rows of the demo agents give exactly the certificate the official instance holds."""
    nodes, root = official_nodes()
    assert root == GRAPH_ROOT and len(nodes) == 7


def test_replayed_testnet_webhooks_prepare_a_recertification(tmp_path, capsys):
    """End to end, offline: signed POSTs -> signature -> dedup -> relevant? -> Envio export at its head ->
    Certifier.run_once(prepare) on the official chain state -> `prepared` + `timeline`, nothing sent."""
    nodes, _ = official_nodes()
    ch = OfficialChain(nodes)
    jr = A.LiveJournal(tmp_path / "j.jsonl")
    src = A.IndexerData(IndexerSource(), tmp_path / "data", jr, wait_s=1)
    d, svc = A.build_service(args(tmp_path), jr, source=src, chain=ch)
    d.on_audit = lambda frm, to: ["audited"]                 # the watcher path is covered by test_watcher
    rec = A.Receiver(d, KEY, None, jr)
    for p in PAYLOADS:
        body = json.dumps(p).encode()
        assert rec.accept(body, A.sign(body, KEY), 1791378790.0) == 200
    out = [rec.work_once(timeout=1) for _ in PAYLOADS]
    lines = [json.loads(l) for l in (tmp_path / "j.jsonl").read_text().splitlines()]
    prep = [e for e in lines if e["action"] == "prepared"]
    assert len(prep) == 1 and prep[0]["graphRoot"] == GRAPH_ROOT and prep[0]["stale"] is True
    assert prep[0]["txs"][0] == {"fn": "submitCertificate", "note": "nCert 7, rows 7", "calldataBytes": 417,
                                 "estimate": 560_952, "gasLimit": 608_024}
    assert ch.estimated == [C.SUBMIT_SIG]
    assert out[0]["relevant"] == 1 and out[1]["certificates"] == 1
    assert out[2]["relevant"] == 0                           # a third party's review carries no mass
    tl = [e for e in lines if e["action"] == "timeline"]
    assert len(tl) == 1 and tl[0]["eventBlock"] == 68_979_076 and tl[0]["certAction"] == "prepared"
    assert tl[0]["headAtPrepare"] == HEAD and tl[0]["blocksEventToCert"] == HEAD - 68_979_076
    assert tl[0]["indexerHead"] == 69_817_592 and tl[0]["webhookToCertMs"] >= 0
    shown = capsys.readouterr().out
    assert "signature OK" in shown and "PREPARED (dry, not sent)" in shown and "TIMELINE" in shown
    assert "nothing to recompute" in shown


def test_trigger_feedback_changes_the_certificate(tmp_path):
    """The video trigger (demo/trigger.ts): anchor-A vouches 90 for provider-3. The webhook arrives before the indexer
    has the block: the receiver waits for the head, then prepares a DIFFERENT certificate."""
    nodes, _ = official_nodes()
    blk = 69_817_700
    row = {"id": f"2052-{ANCHOR_A}-1", "agent_id": "2052", "client": ANCHOR_A, "feedbackIndex": "1", "value": "90",
           "valueDecimals": 0, "tag1": "vouch", "tag2": "demo", "blockNumber": str(blk), "logIndex": 1,
           "revokedAtBlock": None, "chainId": 10143}
    waits = []
    jr = C.Journal(tmp_path / "j.jsonl")
    src = A.IndexerData(IndexerSource(heads=[blk - 2, blk - 1, blk], extra=[row]), tmp_path / "data", jr, wait_s=5,
                        sleep=waits.append)
    d, _ = A.build_service(args(tmp_path), jr, source=src, chain=OfficialChain(nodes, head=blk + 3))
    p = {"webhookId": "wh", "id": "whevt", "event": {"sequenceNumber": "1", "data": {"block": {
        "number": blk, "hash": "0x" + "11" * 32, "timestamp": 1791640000, "logs": [{
            "index": 1, "topics": [A.TOPICS["NewFeedback"], "0x" + f"{2052:064x}", "0x" + "00" * 12 + ANCHOR_A[2:],
                                   "0x" + "00" * 32],
            "data": "0x", "account": {"address": A.REGISTRIES[10143][1]}, "transaction": {"hash": "0x" + "ab" * 32}}]}}}}
    rec = A.Receiver(d, KEY, None, jr)
    body = json.dumps(p).encode()
    assert rec.accept(body, A.sign(body, KEY), 1791640001.0) == 200
    rec.work_once(timeout=1)
    lines = [json.loads(l) for l in (tmp_path / "j.jsonl").read_text().splitlines()]
    ready = next(e for e in lines if e["action"] == "data_ready")
    prep = next(e for e in lines if e["action"] == "prepared")
    assert len(waits) == 2 and ready["indexerHead"] == blk
    assert prep["graphRoot"] != GRAPH_ROOT and prep["nCert"] == 7
    tl = next(e for e in lines if e["action"] == "timeline")
    assert tl["blocksEventToCert"] == 3


def test_indexer_behind_gives_data_behind_and_the_events_stay_fresh(tmp_path):
    clock = iter(range(0, 1000, 10))
    jr = C.Journal(None)
    src = A.IndexerData(IndexerSource(heads=[1, 1, 1, 1]), tmp_path / "d", jr, wait_s=15, sleep=lambda s: None,
                        clock=lambda: next(clock))
    assert src.load(10) is None and src.last == 1
    nodes, _ = official_nodes()
    d, _ = A.build_service(args(tmp_path), jr, source=src, chain=OfficialChain(nodes))
    meta, evs = A.parse_payload(PAYLOADS[0])
    src.heads = [1] * 10
    res = d.handle(evs, "webhook", meta["number"])
    assert res["recertify"]["action"] == "data_behind" and res["pending"] == 1     # the poller will retry


def test_send_without_keystore_is_refused(tmp_path):
    with pytest.raises(SystemExit):
        A.build_service(args(tmp_path, send=True, sender="0x" + "81" * 20), C.Journal(None), source=A.StaticData(IDX))


def test_wrong_set_config_is_refused(tmp_path):
    with pytest.raises(SystemExit):
        A.build_service(args(tmp_path, set_id="0x" + "00" * 32), C.Journal(None), source=A.StaticData(IDX))


def test_alchemy_rpc_key_stays_out_of_argv_and_journal(tmp_path, monkeypatch):
    monkeypatch.setenv("ALCHEMY_API_KEY", "k3y_" + "x" * 22)
    url = A.resolve_rpc("alchemy", 10143)
    assert url == "https://monad-testnet.g.alchemy.com/v2/k3y_" + "x" * 22
    assert A.resolve_rpc("https://rpc1.monad.xyz", 143) == "https://rpc1.monad.xyz"
    ch = C.Chain(url)
    assert ch.log_chunk == 10 and ch.rpc_env                 # Free tier: eth_getLogs <= 10 blocks (MEASURED 10/10)
    seen = {}

    class P:
        returncode, stdout, stderr = 0, "123", ""

    def fake_run(argv, **kw):
        seen["argv"], seen["env"] = argv, kw["env"]
        return P()
    monkeypatch.setattr(C.subprocess, "run", fake_run)
    assert ch.block_number() == 123
    assert not any("k3y_" in x for x in seen["argv"]) and seen["env"]["ETH_RPC_URL"] == url
    assert C.Chain("http://x").log_chunk == 0 and not C.Chain("http://x").rpc_env
    jr = A.LiveJournal(tmp_path / "j.jsonl", echo=False)
    jr.log(action="error", error=f"cast failed for {url}", nested={"u": [url]})
    text = (tmp_path / "j.jsonl").read_text()
    assert "k3y_" not in text and "<ALCHEMY_API_KEY>" in text
    monkeypatch.delenv("ALCHEMY_API_KEY")
    with pytest.raises(SystemExit):
        A.resolve_rpc("alchemy", 143)


def test_timeline_of_a_submitted_certificate():
    meta = {"number": 100, "timestamp": 1000}
    m = {"latencyS": 1.5, "head": {"latest": 103}, "state": "notFinalized"}
    res = {"recertify": {"action": "certified", "txBlock": 109, "lastTx": "0xabc",
                         "data": {"indexerHead": 101, "waitMs": 300, "exportMs": 2000}}}
    tl = A.timeline(meta, m, res, 1001.5, 1005.0)
    assert tl["blocksEventToWebhook"] == 3 and tl["certBlock"] == 109 and tl["blocksEventToCert"] == 9
    assert tl["webhookToCertMs"] == 3500.0 and tl["tx"] == "0xabc" and tl["indexerWaitMs"] == 300
    assert "certificate in block 109" in A.console_line({"action": "timeline", "ts": 1005.0, **tl})
    assert A.timeline(meta, m, {"recertify": None}, 1, 2) is None


def test_console_lines_are_readable():
    assert "listening on :8787" in A.console_line({"action": "alchemy_serve", "port": 8787, "chain": 10143,
                                                   "send": True, "ts": 1.0})
    line = A.console_line({"action": "certified", "ts": 1.0, "nCert": 7, "rows": 7, "mass": 592592592592592590,
                           "lastTx": "0xab", "txBlock": 5})
    assert "SUBMITTED" in line and "59.26 %" in line and "block 5" in line
    assert A.console_line({"action": "audit", "ts": 1.0, "tx": "0x" + "1" * 64, "discrepancies": []}).endswith("CLEAN")
    assert A.console_line({"action": "something_else"}) is None

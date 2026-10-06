"""Alchemy Custom Webhook receiver (D55), offline: real mainnet logs replayed in the Alchemy payload shape.

Fixture: tests/fixtures/alchemy/mainnet-108835676-110994810.jsonl, built by
`alchemy_hook.py payloads --from-block 108835676 --to-block 110994810` (06/10, rpc1.monad.xyz): 29 blocks, 51 logs
(8 NewFeedback, 21 Transfer, 22 MetadataSet) — the window of the 06/10 snapshot refresh."""
import json
import sys
import threading
from fractions import Fraction
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import alchemy_hook as A
import certifier as C
import run_mainnet as R

HERE = Path(__file__).resolve().parents[1]
FIX = HERE / "tests" / "fixtures" / "alchemy" / "mainnet-108835676-110994810.jsonl"
KEY = "whsec_test_only_not_a_real_key"
PAYLOADS = [json.loads(l) for l in FIX.read_text().splitlines() if l.strip()]


def body_sig(obj, key=KEY):
    b = json.dumps(obj).encode()
    return b, A.sign(b, key)


def test_payloads_decode_to_the_refresh_feedbacks():
    evs = [e for p in PAYLOADS for e in A.parse_payload(p)[1]]
    assert len(evs) == 51
    nf = sorted((e["block"], e["agentId"], e["client"]) for e in evs if e["kind"] == "NewFeedback")
    ref = json.loads((HERE / "data" / "mainnet-110994810.refresh.json").read_text())["newFeedbacks"]
    assert nf == sorted((x["block"], x["agent"], x["client"]) for x in ref)
    assert {e["kind"] for e in evs} == {"NewFeedback", "Transfer", "MetadataSet"}


def test_signature_refusal_is_real():
    """AM-INT.2: the same body is ACCEPTED with the right signature, REFUSED with a wrong one or a tampered body,
    and a refused POST never reaches the dispatcher."""
    calls = []
    d = A.Dispatcher(on_recertify=lambda evs, b: calls.append(len(evs)))
    rec = A.Receiver(d, KEY)
    body, sig = body_sig(PAYLOADS[0])
    assert rec.accept(body, A.sign(body, "other-key"), 0.0) == 401
    assert rec.accept(body.replace(b'"number"', b'"numbex"'), sig, 0.0) == 401     # tampered after signing
    assert rec.accept(body, None, 0.0) == 401
    assert rec.q.empty() and calls == []
    assert rec.accept(body, sig, 0.0) == 200
    assert rec.work_once(timeout=1)["fresh"] > 0 and calls


def test_dedup_between_webhook_and_poller():
    calls = []
    d = A.Dispatcher(on_recertify=lambda evs, b: calls.append([e["tx"] for e in evs]))
    meta, evs = A.parse_payload(PAYLOADS[-1])
    first = d.handle(evs, "webhook", meta["number"])
    again = d.handle(evs, "webhook", meta["number"])            # Alchemy retry after a lost 200
    poll = d.handle([dict(e) for e in evs], "poll", meta["number"])   # the fallback poller sees the same logs
    assert first["fresh"] == len(evs) and again["fresh"] == 0 and poll["fresh"] == 0 and len(calls) == 1


def test_only_events_of_the_support_trigger_a_recertification():
    """certifier.relevant: a feedback matters only if its client is the source of a provided row."""
    fbs, idn = R.load_mainnet()
    evs = [e for p in PAYLOADS for e in A.parse_payload(p)[1]]
    calls = []
    sup = C.Support(clients={"0x49472ef9ed99f30d4ead45ac9e1c16c31f70783a"}, agents=set())
    d = A.Dispatcher(on_recertify=lambda e, b: calls.append(e), support_of=lambda: sup)
    res = d.handle(evs, "webhook", None)
    assert res["relevant"] == 5 and [e["agentId"] for e in calls[0]] == [10255] * 5
    d2 = A.Dispatcher(on_recertify=lambda e, b: calls.append(e), support_of=lambda: C.Support(set(), set()))
    assert d2.handle(evs, "webhook", None)["relevant"] == 0 and len(calls) == 1


def test_certificate_submitted_goes_to_the_watcher_of_its_set_only():
    S1, S2 = "0x" + "11" * 32, "0x" + "22" * 32
    audits = []
    d = A.Dispatcher(on_audit=lambda f, t: audits.append((f, t)), set_id=S1)
    mk = lambda s, li: {"index": li, "topics": [A.TOPICS["CertificateSubmitted"], s, "0x" + "00" * 31 + "07"],
                        "data": "0x", "account": {"address": "0x" + "ab" * 20}, "transaction": {"hash": "0x" + "cd" * 32}}
    p = {"event": {"data": {"block": {"number": 500, "logs": [mk(S1, 0), mk(S2, 1)]}}}}
    res = d.handle(A.parse_payload(p)[1], "webhook", 500)
    assert res["certificates"] == 1 and audits == [(500, 500)]


def test_http_end_to_end_and_measures(monkeypatch):
    """A local HTTPS-less receiver: signed POST -> 200 -> worker -> journal with the latency and the commit state
    (RPC tags faked here; the real measure needs Hugo's webhook)."""
    monkeypatch.setattr(A, "_rpc", lambda url, m, p: {"number": hex({"latest": 108878440, "safe": 108878440,
                                                                     "finalized": 108878439}[p[0]])})
    d = A.Dispatcher()
    rec = A.Receiver(d, KEY, rpc="http://fake")
    srv = ThreadingHTTPServer(("127.0.0.1", 0), rec.http_handler())
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{srv.server_port}/alchemy"
        p = next(x for x in PAYLOADS if x["event"]["data"]["block"]["number"] == 108878432)
        assert A.post(url, p, "wrong") == 401 and rec.q.empty()
        assert A.post(url, p, KEY) == 200
        ev = rec.work_once(timeout=5)
        assert ev["action"] == "webhook" and ev["state"] == "Finalized" and ev["behindLatest"] == 8
        assert ev["latencyS"] > 0 and ev["blockTimestamp"] == p["event"]["data"]["block"]["timestamp"]
        assert A.post(url.replace("/alchemy", "/other"), p, KEY) == 404
    finally:
        srv.shutdown()


def test_webhook_drives_the_real_certifier_dry():
    """The webhook path calls the SAME Certifier.run_once as the polling loop (dry plan, no chain): a NewFeedback of
    0xea0b (source of #18's row on the honest set) triggers a recomputation; the scanner's does not."""
    fbs, idn = R.load_mainnet()
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    raw = json.load(open(HERE / "schema_reference.json"))
    cfg = C.SetConfig(name="honest", anchors=[h1, h2], lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3,
                      filter_tags=raw["filters"]["core"])
    jr = C.Journal(None)
    svc = C.Certifier(cfg, None, "0x" + "00" * 20, cfg.set_id, Path("/nonexistent/state.json"), jr)
    svc.run_once(fbs, idn, reason="start", dry=True)           # computes the support
    runs = []
    d = A.Dispatcher(on_recertify=lambda e, b: runs.append(svc.run_once(fbs, idn, reason="alchemy", block=b, dry=True)),
                     support_of=lambda: svc.support)
    ea0b, sc = R.resolve(R.EA0B, fbs), R.resolve(R.SCANNER, fbs)
    mk = lambda client, li: {"index": li, "topics": [A.TOPICS["NewFeedback"], "0x" + f"{4:064x}",
                                                     "0x" + "00" * 12 + client[2:], "0x" + "00" * 32],
                             "data": "0x", "account": {"address": A.REGISTRIES[143][1]},
                             "transaction": {"hash": "0x" + f"{li:064x}"}}
    p = {"event": {"data": {"block": {"number": 111_000_000, "logs": [mk(sc, 1)]}}}}
    assert d.handle(A.parse_payload(p)[1], "webhook", 111_000_000)["relevant"] == 0 and runs == []
    p["event"]["data"]["block"]["logs"] = [mk(ea0b, 2)]
    res = d.handle(A.parse_payload(p)[1], "webhook", 111_000_000)
    assert res["relevant"] == 1 and runs[0]["action"] == "planned" and runs[0]["txs"][-1] == "submitCertificate"


def test_graphql_query_covers_every_trigger():
    q = A.graphql_query(10143, "0x" + "ab" * 20)
    for k in ("NewFeedback", "FeedbackRevoked", "Transfer", "MetadataSet", "Approval", "ApprovalForAll", "Upgraded",
              "CertificateSubmitted", "EdgeProven", "RowVoided"):
        assert A.TOPICS[k] in q
    assert A.REGISTRIES[10143][0] in q and A.REGISTRIES[10143][1] in q and "0x" + "ab" * 20 in q
    assert A.TOPICS["NewFeedback"] == "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc"


def test_env_file_is_read_without_overriding(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("# local secrets\nALCHEMY_SIGNING_KEY='abc'\nALCHEMY_API_KEY=x\n")
    monkeypatch.delenv("ALCHEMY_SIGNING_KEY", raising=False)
    monkeypatch.setenv("ALCHEMY_API_KEY", "kept")
    A.load_env(f)
    import os
    assert os.environ["ALCHEMY_SIGNING_KEY"] == "abc" and os.environ["ALCHEMY_API_KEY"] == "kept"

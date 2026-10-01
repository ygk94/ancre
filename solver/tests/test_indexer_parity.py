"""Parity between the indexer's SetEdge rows and the solver's pair edges (ROADMAP 03-E3 ⇄ 04-E3).

Until chantier 03 delivers, the indexer is a stub built from the versioned snapshot: these tests check the
pipeline (fixture/GraphQL shape, block filter, identity replay, parity diff), not the TypeScript port. Drop a real
dump of the indexer in solver/tests/fixtures/indexer/ (one <Entity>.json per entity, block in BLOCK) to test it.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import from_indexer as FI
import run_mainnet as R
from graph import build_graph, load_feedbacks_onchain, load_identity_json, load_schema

HERE = Path(__file__).resolve().parents[1]
RAW = json.load(open(HERE / "schema_reference.json"))
SCHEMA, FILT = load_schema(RAW), RAW["filters"]["reference"]


@pytest.fixture(scope="module")
def stub(tmp_path_factory):
    fbs, idn = R.load_mainnet()
    pairs = build_graph(fbs, idn, SCHEMA, FILT, []).pairs
    d = FI.make_stub(fbs, idn, pairs, tmp_path_factory.mktemp("stub"), block=R.BLOCK)
    return fbs, idn, pairs, d


def test_stub_roundtrip_identity_and_feedbacks(stub, tmp_path):
    fbs, idn, _, d = stub
    files = FI.export(FI.FixtureSource(d), R.BLOCK, tmp_path)
    fb2 = load_feedbacks_onchain(files["feedbacks"])
    assert sorted(fb2, key=lambda f: (f.agent_id, f.client, f.index)) == \
        sorted(fbs, key=lambda f: (f.agent_id, f.client, f.index))
    id2 = load_identity_json(files["identity"])
    assert id2.owner == idn.owner and id2.wallet == idn.wallet
    assert id2.approved == idn.approved and id2.operators == idn.operators
    assert {a: s for a, s in id2.past_owners.items() if s} == {a: s for a, s in idn.past_owners.items() if s}


def test_parity_on_stub_and_diff_detection(stub, tmp_path):
    fbs, idn, pairs, d = stub
    files = FI.export(FI.FixtureSource(d), R.BLOCK, tmp_path)
    edges = json.loads(files["set_edges"].read_text())
    p2 = build_graph(load_feedbacks_onchain(files["feedbacks"]), load_identity_json(files["identity"]),
                     SCHEMA, FILT, []).pairs
    assert FI.parity(edges, p2) == [] and len(p2) == len(pairs) == 11
    bad = [dict(e) for e in edges]
    bad[0]["w"] += 1                                          # weight mismatch
    gone = bad.pop(1)                                          # edge missing in the indexer
    bad.append({**bad[2], "client": "0x" + "9" * 40})          # extra edge
    bad.append({**gone, "w": 0})                               # w = 0 is not retained
    kinds = sorted(x["kind"] for x in FI.parity(bad, p2))
    assert kinds == ["EXTRA_IN_INDEXER", "MISMATCH", "MISSING_IN_INDEXER"]


def test_block_filter_and_revocation(tmp_path):
    rows = [{"id": "1-0xa-1", "agent_id": "1", "client": "0xA", "feedbackIndex": "1", "value": "100",
             "valueDecimals": 0, "tag1": "vouch", "tag2": "", "blockNumber": "10", "logIndex": 0, "revokedAtBlock": "30"},
            {"id": "1-0xa-2", "agent_id": "1", "client": "0xA", "feedbackIndex": "2", "value": "5",
             "valueDecimals": 0, "tag1": "vouch", "tag2": "", "blockNumber": "40", "logIndex": 0, "revokedAtBlock": None}]
    rows.append({**rows[1], "id": "1-0xa-2", "chainId": 10143, "value": "77"})     # other chain: ignored
    (tmp_path / "Feedback.json").write_text(json.dumps(rows))
    src = FI.FixtureSource(tmp_path, 143)
    assert FI.feedbacks_file(src, 20)["feedbacks"] == [{"a": 1, "c": "0xa", "i": 1, "v": "100", "d": 0, "t1": "vouch",
                                                        "t2": "", "r": False}]
    at50 = FI.feedbacks_file(src, 50)["feedbacks"]
    assert [f["r"] for f in at50] == [True, False]


def test_identity_replay_transfer_clears_approval_and_wallet(tmp_path):
    (tmp_path / "BLOCK").write_text("9")
    Z, A, B, W, X = FI.ZERO, "0x" + "a" * 40, "0x" + "b" * 40, "0x" + "c" * 40, "0x" + "d" * 40
    ev = {"OwnerChange": [{"id": "1", "agent_id": "7", "from": Z, "to": A, "isMint": True, "blockNumber": "1", "logIndex": 0},
                          {"id": "2", "agent_id": "7", "from": A, "to": B, "isMint": False, "blockNumber": "5", "logIndex": 1}],
          "WalletChange": [{"id": "3", "agent_id": "7", "wallet": W, "blockNumber": "1", "logIndex": 1},
                           {"id": "4", "agent_id": "7", "wallet": Z, "blockNumber": "5", "logIndex": 0}],
          "ApprovalChange": [{"id": "5", "agent_id": "7", "approved": X, "blockNumber": "2", "logIndex": 0}]}
    for k, v in ev.items():
        (tmp_path / f"{k}.json").write_text(json.dumps(v))
    src = FI.FixtureSource(tmp_path)
    at3, at9 = FI.identity_file(src, 3), FI.identity_file(src, 9)
    assert (at3["owner"]["7"], at3["wallet"]["7"], at3["approved"]) == (A, W, {"7": X})
    assert (at9["owner"]["7"], at9["wallet"]["7"], at9["approved"]) == (B, Z, {})
    assert at9["pastOwners"] == {"7": [A]}


REAL = HERE / "tests" / "fixtures" / "indexer"


@pytest.mark.skipif(not (REAL / "BLOCK").exists(), reason="no dump of the real indexer yet (chantier 03)")
def test_parity_real_indexer_dump(tmp_path):
    block = int((REAL / "BLOCK").read_text())
    files = FI.export(FI.FixtureSource(REAL), block, tmp_path)
    pairs = build_graph(load_feedbacks_onchain(files["feedbacks"]), load_identity_json(files["identity"]),
                        SCHEMA, FILT, []).pairs
    assert FI.parity(json.loads(files["set_edges"].read_text()), pairs) == []


def test_graphql_source_keyset_pagination(stub, monkeypatch):
    """GraphQLSource against a local fake Hasura: pages of PAGE rows ordered by id, id_gt cursor, block filter."""
    import http.server
    import threading
    _, _, _, d = stub
    fx = FI.FixtureSource(d)
    seen = []

    class H(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            ent = body["query"].split("{ ")[1].split("(")[0]
            if ent == "chain_metadata":
                out = json.dumps({"data": {"chain_metadata": [{"latest_processed_block": R.BLOCK}]}}).encode()
                self.send_response(200)
                self.send_header("content-length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)
                return
            w = body["variables"]["w"]
            assert w["chainId"] == {"_eq": 143}
            seen.append(w)
            blk = int(w["blockNumber"]["_lte"]) if "blockNumber" in w else None
            rows = [r for r in fx.rows(ent, blk) if r["id"] > w["id"]["_gt"]][:700]     # server cap < PAGE
            out = json.dumps({"data": {ent: rows}}).encode()
            self.send_response(200)
            self.send_header("content-length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        def log_message(self, *a):
            pass

    monkeypatch.setattr(FI, "PAGE", 1000)
    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        src = FI.GraphQLSource(f"http://127.0.0.1:{srv.server_port}/v1/graphql", 143)
        got = src.rows("Feedback", R.BLOCK)
        assert [r["id"] for r in got] == [r["id"] for r in fx.rows("Feedback", R.BLOCK)] and len(got) == 9283
        assert len(seen) == 15                              # 14 pages capped at 700 rows + 1 empty page
        assert src.head() == R.BLOCK
        with pytest.raises(RuntimeError):
            FI.export(src, R.BLOCK + 1, Path(str(d)) / "never")
    finally:
        srv.shutdown()

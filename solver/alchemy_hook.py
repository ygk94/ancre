"""ANCRE x Alchemy (D55): a Custom Webhook pushes the registry and ANCRE events; the certifier and the watcher react.

One Alchemy Custom Webhook (GraphQL, one per network: MONAD_MAINNET, MONAD_TESTNET) filters the logs of
  - the ERC-8004 ReputationRegistry: NewFeedback, FeedbackRevoked          -> recertification (certifier, D27);
  - the ERC-8004 IdentityRegistry: Transfer, MetadataSet, Approval, ApprovalForAll
                                                                           -> recertification (R6/R7 inputs);
  - both registries: Upgraded                                              -> REGISTRY_CHANGED (D17), recertification;
  - the AnchoredReputation contract: CertificateSubmitted                  -> audit + proofs (watcher, AM-5.9, AM-02.2).
Alchemy POSTs a signed JSON (header X-Alchemy-Signature = hex HMAC-SHA256 of the raw body with the webhook's signing
key) for each block that has a matching log. This module verifies the signature, answers 200 at once (Alchemy retries
non-200 answers with backoff for up to 10 minutes), deduplicates by (txHash, logIndex), and hands the events to the
SAME code paths as the polling loops (certifier.relevant / Certifier.run_once, watcher.watch_once).

Fallback (kept on purpose): a poller reads the registries with eth_getLogs every `poll_interval` seconds over the
blocks not yet covered. The webhook gives latency, the poller gives completeness: a block the webhook never delivered
is still processed, and nothing is processed twice (same dedup key). If the webhook is silent for `silence` seconds,
the journal says so.

Measures journaled for every webhook (D55, "to measure before pitching"): reception time minus the block timestamp
(second resolution on Monad), and the commit state of the block AT RECEPTION, read from the RPC block tags right after
the POST arrives: block <= finalized -> "Finalized", else "notFinalized" (Proposed or Voted: the public RPC does not
tell them apart), plus the head distance in blocks (latest − block).

Secrets: ALCHEMY_SIGNING_KEY, ALCHEMY_NOTIFY_TOKEN, ALCHEMY_API_KEY come from the environment or a local .env file
(gitignored), never from the repository nor the command line.

Usage:
  .venv/bin/python alchemy_hook.py query   --chain 143 [--ancre 0x...]      # GraphQL filter to paste in the dashboard
  .venv/bin/python alchemy_hook.py serve   --port 8787 --rpc URL [--ancre 0x... --set-config cfg.json --set-id 0x...
                                           --data DIR] [--send]           # receiver + fallback poller (dry by default)
  .venv/bin/python alchemy_hook.py payloads --from-block A --to-block B --out FILE   # Alchemy-shaped payloads rebuilt
                                           from real chain logs (replay until Hugo's webhook exists)
  .venv/bin/python alchemy_hook.py replay  --file FILE --url http://127.0.0.1:8787/alchemy   # sign + POST them
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import queue
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import certifier as C
from export import keccak

HERE = Path(__file__).parent
NETWORKS = {143: "MONAD_MAINNET", 10143: "MONAD_TESTNET"}
REGISTRIES = {   # chain -> (IdentityRegistry, ReputationRegistry), CLAUDE.md §3 (verified 27/09)
    143: ("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"),
    10143: ("0x8004A818BFB912233c491871b3d84c89A494BD9e", "0x8004B663056A597Dffe9eCcC1965A193B7388713"),
}


def canonical(sig: str) -> str:
    """'Ev(uint256 indexed,address)' -> 'Ev(uint256,address)' (the topic preimage)."""
    name, args = sig.split("(", 1)
    return name + "(" + ",".join(a.split()[0] for a in args.rstrip(")").split(",") if a) + ")"


def topic(sig: str) -> str:
    return "0x" + keccak(canonical(sig).encode()).hex()


# event kind -> topic0, from the signatures the polling loop already uses (one source of truth)
TOPICS = {k: topic(s) for k, s in C.REGISTRY_EVENTS.items()}
TOPICS["CertificateSubmitted"] = topic(C.CERT_SUBMITTED)
KIND_OF = {v: k for k, v in TOPICS.items()}


def load_env(path: Path = HERE / ".env") -> None:
    """KEY=VALUE lines of a local, gitignored .env into os.environ (existing variables win)."""
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def graphql_query(chain: int, ancre: str | None = None) -> str:
    """The Custom Webhook filter. Alchemy replaces the block filter by `latest` (one POST per matching block).
    Topic OR-list syntax `topics: [[...]]`: NON VÉRIFIÉ on Monad until the dashboard's "Test Webhook" accepts it."""
    ident, rep = REGISTRIES[chain]
    addrs = [ident, rep] + ([ancre] if ancre else [])
    t0 = [TOPICS[k] for k in ("NewFeedback", "FeedbackRevoked", "Transfer", "MetadataSet", "Approval",
                              "ApprovalForAll", "Upgraded")] + ([TOPICS["CertificateSubmitted"]] if ancre else [])
    return ("{\n  block {\n    number\n    hash\n    timestamp\n"
            f"    logs(filter: {{addresses: {json.dumps(addrs)}, topics: [{json.dumps(t0)}]}}) {{\n"
            "      index\n      topics\n      data\n      account { address }\n"
            "      transaction { hash index status }\n    }\n  }\n}")


# ----------------------------------------------------------------------------- payload -> events


def verify_signature(body: bytes, signature: str | None, key: str) -> bool:
    """X-Alchemy-Signature: hex HMAC-SHA256(signing key, raw body). Constant-time comparison."""
    if not signature or not key:
        return False
    digest = hmac.new(key.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature.strip().lower())


def sign(body: bytes, key: str) -> str:
    return hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


def _int(x) -> int:
    return int(x, 16) if isinstance(x, str) and x.startswith("0x") else int(x)


def log_to_event(address: str, topics: list[str], block: int, tx: str, log_index: int) -> dict | None:
    """One raw log as a `certifier.relevant` / journal event (indexed topics only, as registry_events does)."""
    kind = KIND_OF.get(topics[0].lower()) if topics else None
    if kind is None:
        return None
    ev = {"kind": kind, "block": block, "tx": tx.lower(), "logIndex": log_index, "address": address.lower()}
    if kind in ("NewFeedback", "FeedbackRevoked"):
        ev.update(agentId=int(topics[1], 16), client="0x" + topics[2][-40:].lower())
    elif kind in ("Transfer", "Approval"):
        ev["agentId"] = int(topics[3], 16)
    elif kind == "MetadataSet":
        ev["agentId"] = int(topics[1], 16)
    elif kind == "CertificateSubmitted":
        ev["setId"] = topics[1].lower()
    return ev


def parse_payload(obj: dict) -> tuple[dict, list[dict]]:
    """(block {number, hash, timestamp}, events) of a Custom Webhook POST. Accepts both shapes of the doc: logs at
    `event.data.block.logs[]` (each with its `transaction`) and logs nested in `block.logs[].transaction.logs[]`."""
    blk = obj["event"]["data"]["block"]
    number = _int(blk["number"]) if "number" in blk else None
    meta = {"number": number, "hash": blk.get("hash"), "timestamp": _int(blk["timestamp"]) if "timestamp" in blk else None,
            "eventId": obj.get("id"), "webhookId": obj.get("webhookId"),
            "sequenceNumber": obj["event"].get("sequenceNumber")}
    out, seen = [], set()
    for lg in blk.get("logs", []):
        inner = lg.get("transaction", {}).get("logs") if "topics" not in lg else None
        for x in (inner if inner else [lg]):
            tx = x.get("transaction", lg.get("transaction", {})).get("hash", "")
            key = (tx.lower(), _int(x["index"]))
            if key in seen:
                continue
            seen.add(key)
            ev = log_to_event(x["account"]["address"], x["topics"], number, tx, _int(x["index"]))
            if ev:
                out.append(ev)
    return meta, out


# ----------------------------------------------------------------------------- dispatch


@dataclass
class Dispatcher:
    """Single entry point of both sources (webhook, poller). Dedup by (txHash, logIndex); then:
      - any event relevant to the certificate's support (certifier.relevant)  -> on_recertify(events, block)
      - a CertificateSubmitted of the watched set                            -> on_audit(block)
    `support` is refreshed by the certifier after each run (Certifier.support)."""
    on_recertify: callable = None
    on_audit: callable = None
    set_id: str | None = None
    support_of: callable = None           # () -> certifier.Support | None
    journal: C.Journal = field(default_factory=lambda: C.Journal(None))
    seen: set = field(default_factory=set)
    covered: int = -1                     # highest block fully handled by the poller
    last_webhook: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def handle(self, events: list[dict], source: str, block: int | None) -> dict:
        with self.lock:
            fresh = [e for e in events if (e["tx"], e["logIndex"]) not in self.seen]
            self.seen.update((e["tx"], e["logIndex"]) for e in fresh)
        sup = self.support_of() if self.support_of else None
        rel = [e for e in fresh if e["kind"] != "CertificateSubmitted" and (sup is None or C.relevant(e, sup))]
        aud = [e for e in fresh if e["kind"] == "CertificateSubmitted" and (self.set_id is None or e.get("setId") ==
                                                                           self.set_id.lower())]
        res = {"source": source, "block": block, "events": len(events), "fresh": len(fresh),
               "duplicates": len(events) - len(fresh), "relevant": len(rel), "certificates": len(aud)}
        if rel and self.on_recertify:
            res["recertify"] = self.on_recertify(rel, max(e["block"] for e in rel))
        if aud and self.on_audit:
            res["audit"] = self.on_audit(min(e["block"] for e in aud), max(e["block"] for e in aud))
        return res


def commit_state(rpc: str, block: int) -> dict:
    """Head tags right after reception (Monad: latest / safe / finalized), and the derived state of `block`."""
    tags = {}
    for t in ("latest", "safe", "finalized"):
        tags[t] = _int(_rpc(rpc, "eth_getBlockByNumber", [t, False])["number"])
    return {"head": tags, "state": "Finalized" if block <= tags["finalized"] else "notFinalized",
            "behindLatest": tags["latest"] - block}


def _rpc(url: str, method: str, params: list):
    req = urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                                                       "params": params}).encode(),
                                 headers={"content-type": "application/json", "user-agent": "ancre-solver/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    if "error" in out:
        raise RuntimeError(out["error"])
    return out["result"]


class Receiver:
    """HTTP receiver: POST /alchemy. Verifies the signature BEFORE parsing, answers at once, works in a thread."""

    def __init__(self, dispatcher: Dispatcher, signing_key: str, rpc: str | None = None, journal: C.Journal | None = None):
        self.d, self.key, self.rpc = dispatcher, signing_key, rpc
        self.journal = journal or dispatcher.journal
        self.q: queue.Queue = queue.Queue()
        self.results: list[dict] = []

    def accept(self, body: bytes, signature: str | None, t_recv: float) -> int:
        """HTTP status for one POST (the work itself is queued)."""
        if not verify_signature(body, signature, self.key):
            self.journal.log(action="webhook_rejected", reason="bad signature", bytes=len(body))
            return 401
        try:
            obj = json.loads(body)
            meta, events = parse_payload(obj)
        except (ValueError, KeyError, TypeError) as e:
            self.journal.log(action="webhook_rejected", reason=f"bad payload: {e}"[:200])
            return 400
        self.q.put((t_recv, meta, events))
        return 200

    def work_once(self, timeout: float | None = None) -> dict | None:
        try:
            t_recv, meta, events = self.q.get(timeout=timeout)
        except queue.Empty:
            return None
        self.d.last_webhook = t_recv
        m = {"blockTimestamp": meta["timestamp"], "recvTs": round(t_recv, 3)}
        if meta["timestamp"] is not None:
            m["latencyS"] = round(t_recv - meta["timestamp"], 3)       # >= 0 up to clock skew; 1 s resolution
        if self.rpc and meta["number"] is not None:
            try:
                m.update(commit_state(self.rpc, meta["number"]))
            except Exception as e:                                      # a measure must never block the trigger
                m["commitStateError"] = str(e)[:200]
        res = self.d.handle(events, "webhook", meta["number"])
        ev = self.journal.log(action="webhook", eventId=meta["eventId"], sequenceNumber=meta["sequenceNumber"],
                              blockHash=meta["hash"], **m, **res)
        self.results.append(ev)
        return ev

    def work_forever(self):
        while True:
            try:
                self.work_once()
            except Exception as e:                      # a failed recertification must not kill the receiver
                self.journal.log(action="error", where="webhook worker", error=str(e)[:500])

    def http_handler(self):
        rec = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                t = time.time()
                if self.path.rstrip("/") != "/alchemy":
                    self.send_response(404)
                    self.end_headers()
                    return
                n = int(self.headers.get("content-length") or 0)
                if n > 5_000_000:
                    self.send_response(413)
                    self.end_headers()
                    return
                code = rec.accept(self.rfile.read(n), self.headers.get("x-alchemy-signature"), t)
                self.send_response(code)
                self.send_header("content-length", "0")
                self.end_headers()

            def log_message(self, *a):
                pass
        return H


def poll_once(d: Dispatcher, chain: C.Chain, chain_id: int, ancre: str | None, head: int, start: int) -> dict:
    """Fallback: eth_getLogs over the blocks not covered yet, through the same dispatcher (dedup)."""
    frm = max(d.covered + 1, start)
    if frm > head:
        return {"source": "poll", "skipped": True}
    ident, rep = REGISTRIES[chain_id]
    evs = []
    for kind, sig in C.REGISTRY_EVENTS.items():
        for addr in ((rep,) if kind in ("NewFeedback", "FeedbackRevoked") else
                     (ident, rep) if kind == "Upgraded" else (ident,)):
            for lg in chain.logs(addr, sig, frm, to_block=head):
                e = log_to_event(addr, lg["topics"], int(lg["blockNumber"], 16), lg["transactionHash"],
                                 int(lg["logIndex"], 16))
                if e:
                    evs.append(e)
    if ancre:
        for lg in chain.logs(ancre, C.CERT_SUBMITTED, frm, to_block=head):
            e = log_to_event(ancre, lg["topics"], int(lg["blockNumber"], 16), lg["transactionHash"],
                             int(lg["logIndex"], 16))
            if e:
                evs.append(e)
    res = d.handle(evs, "poll", head)
    d.covered = head
    return {**res, "fromBlock": frm}


# ----------------------------------------------------------------------------- replay material


def payloads_from_chain(rpc_url: str, chain_id: int, frm: int, to: int, ancre: str | None = None) -> list[dict]:
    """Alchemy-shaped payloads (one per block with matching logs) rebuilt from REAL logs of the chain. Used to test
    the receiver end to end until the real webhook exists; the shape follows the doc example (NON VÉRIFIÉ on Monad)."""
    ident, rep = REGISTRIES[chain_id]
    addrs = [ident, rep] + ([ancre] if ancre else [])
    logs = []
    for a in addrs:
        logs += _rpc(rpc_url, "eth_getLogs", [{"address": a, "topics": [list(TOPICS.values())],
                                               "fromBlock": hex(frm), "toBlock": hex(to)}])
    by_block: dict[int, list] = {}
    for lg in logs:
        by_block.setdefault(int(lg["blockNumber"], 16), []).append(lg)
    out = []
    for b in sorted(by_block):
        hdr = _rpc(rpc_url, "eth_getBlockByNumber", [hex(b), False])
        out.append({"webhookId": "wh_replay", "id": f"whevt_replay_{b}", "createdAt": None, "type": "GRAPHQL",
                    "event": {"data": {"block": {
                        "number": b, "hash": hdr["hash"], "timestamp": _int(hdr["timestamp"]),
                        "logs": [{"index": _int(lg["logIndex"]), "topics": lg["topics"], "data": lg["data"],
                                  "account": {"address": lg["address"]},
                                  "transaction": {"hash": lg["transactionHash"], "index": _int(lg["transactionIndex"]),
                                                  "status": 1}}
                                 for lg in sorted(by_block[b], key=lambda l: _int(l["logIndex"]))]}},
                              "sequenceNumber": str(b)}})
    return out


def post(url: str, payload: dict, key: str) -> int:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"content-type": "application/json",
                                                          "x-alchemy-signature": sign(body, key)})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


# ----------------------------------------------------------------------------- service


def build_service(a, journal: C.Journal) -> tuple[Dispatcher, C.Certifier | None]:
    """Wire the dispatcher to the existing certifier and watcher (dry unless --send)."""
    svc = None
    d = Dispatcher(set_id=a.set_id, journal=journal)
    if a.set_config and a.set_id and a.ancre and a.data:
        from graph import load_feedbacks_onchain, load_identity_json
        import watcher as Wt
        cfg = C.SetConfig.load(a.set_config)
        signer = C.Signer(a.sender, "keystore", a.keystore, a.password_env) if a.send else (
            C.Signer(a.sender) if a.sender else None)
        chain = C.Chain(a.rpc, signer)
        svc = C.Certifier(cfg, chain, a.ancre, a.set_id, Path(a.state), journal)
        load = lambda: (load_feedbacks_onchain(Path(a.data) / "onchain_feedbacks.json"),
                        load_identity_json(Path(a.data) / "identity.json"))

        def recertify(events, block):
            fbs, idn = load()
            if idn.block < block:                       # the registry export lags the event: say it, retry on poll
                return journal.log(action="data_behind", dataBlock=idn.block, eventBlock=block)
            return svc.run_once(fbs, idn, reason=f"alchemy: {len(events)} relevant event(s)", block=block,
                                dry=not a.send)

        def audit(frm, to):
            fbs, idn = load()
            nodes = C.chain_table(chain, a.ancre, a.set_id, cfg.anchors)
            return [e.get("action") for e in Wt.watch_once(chain, a.ancre, cfg, a.set_id, nodes, fbs, idn, journal,
                                                           frm, to, send=a.send and signer is not None)]
        d.on_recertify, d.on_audit, d.support_of = recertify, audit, (lambda: svc.support)
    return d, svc


def main(argv=None):
    load_env()
    ap = argparse.ArgumentParser(description="ANCRE x Alchemy Custom Webhook")
    sub = ap.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("query")
    q.add_argument("--chain", type=int, default=143)
    q.add_argument("--ancre")
    s = sub.add_parser("serve")
    s.add_argument("--port", type=int, default=8787)
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--chain", type=int, default=143)
    s.add_argument("--rpc", default="https://rpc1.monad.xyz")
    s.add_argument("--ancre", help="AnchoredReputation address")
    s.add_argument("--set-config")
    s.add_argument("--set-id")
    s.add_argument("--data", help="from_indexer.py export directory")
    s.add_argument("--state", default="certifier_state.json")
    s.add_argument("--journal", default="alchemy.jsonl")
    s.add_argument("--poll-interval", type=float, default=30.0)
    s.add_argument("--silence", type=float, default=300.0)
    s.add_argument("--from-block", type=int, help="first block of the fallback poller (default: head at start)")
    s.add_argument("--from", dest="sender")
    s.add_argument("--keystore")
    s.add_argument("--password-env")
    s.add_argument("--send", action="store_true", help="REAL transactions (Hugo's agreement)")
    p = sub.add_parser("payloads")
    p.add_argument("--rpc", default="https://rpc1.monad.xyz")
    p.add_argument("--chain", type=int, default=143)
    p.add_argument("--from-block", type=int, required=True)
    p.add_argument("--to-block", type=int, required=True)
    p.add_argument("--ancre")
    p.add_argument("--out", required=True)
    r = sub.add_parser("replay")
    r.add_argument("--file", required=True)
    r.add_argument("--url", default="http://127.0.0.1:8787/alchemy")
    a = ap.parse_args(argv)
    if a.cmd == "query":
        print(graphql_query(a.chain, a.ancre))
        return 0
    if a.cmd == "payloads":
        pl = payloads_from_chain(a.rpc, a.chain, a.from_block, a.to_block, a.ancre)
        Path(a.out).write_text("\n".join(json.dumps(x) for x in pl) + "\n")
        print(f"{len(pl)} payloads, {sum(len(x['event']['data']['block']['logs']) for x in pl)} logs -> {a.out}")
        return 0
    key = os.environ.get("ALCHEMY_SIGNING_KEY", "")
    if a.cmd == "replay":
        if not key:
            raise SystemExit("ALCHEMY_SIGNING_KEY is not set (.env): replay signs with the receiver's key")
        for line in Path(a.file).read_text().splitlines():
            if line.strip():
                print(post(a.url, json.loads(line), key))
        return 0
    if not key:
        raise SystemExit("🧑 ALCHEMY_SIGNING_KEY missing: create the webhook (Hugo), put its signing key in solver/.env")
    journal = C.Journal(Path(a.journal))
    d, _ = build_service(a, journal)
    rec = Receiver(d, key, a.rpc, journal)
    srv = ThreadingHTTPServer((a.host, a.port), rec.http_handler())
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    threading.Thread(target=rec.work_forever, daemon=True).start()
    chain = C.Chain(a.rpc)
    start = a.from_block if a.from_block is not None else chain.block_number()
    d.covered = start - 1
    journal.log(action="alchemy_serve", port=a.port, chain=a.chain, fromBlock=start, send=a.send)
    while True:                                          # fallback poller + silence alarm
        time.sleep(a.poll_interval)
        try:
            head = chain.block_number()
            res = poll_once(d, chain, a.chain, a.ancre, head, start)
            if res.get("fresh"):
                journal.log(action="poll_caught", **res)  # the webhook missed (or has not yet sent) these events
            if d.last_webhook and time.time() - d.last_webhook > a.silence:
                journal.log(action="webhook_silent", seconds=round(time.time() - d.last_webhook))
        except Exception as e:
            journal.log(action="error", error=str(e)[:500])


if __name__ == "__main__":
    raise SystemExit(main())

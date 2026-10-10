"""ANCRE x Alchemy (D55): a Custom Webhook pushes the registry and ANCRE events; the certifier and the watcher react.

One Alchemy Custom Webhook (GraphQL, one per network: MONAD_MAINNET, MONAD_TESTNET) filters the logs of
  - the ERC-8004 ReputationRegistry: NewFeedback, FeedbackRevoked          -> recertification (certifier, D27);
  - the ERC-8004 IdentityRegistry: Transfer, MetadataSet, Approval, ApprovalForAll
                                                                           -> recertification (R6/R7 inputs);
  - both registries: Upgraded                                              -> REGISTRY_CHANGED (D17), recertification;
  - the AnchoredReputation contract: CertificateSubmitted                  -> audit + proofs (watcher, AM-5.9, AM-02.2).
Alchemy POSTs a signed JSON (header X-Alchemy-Signature = hex HMAC-SHA256 of the raw body with the webhook's signing
key) for each block that has a matching log. This module verifies the signature, answers 200 at once (Alchemy retries
non-200 answers with backoff for up to 10 minutes on the Free / PAYG tiers: DOC, alchemy.com/docs/reference/
notify-api-quickstart, read 06/10, NOT MEASURED), deduplicates by (txHash, logIndex), and hands the events to the
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
(gitignored), never from the repository nor the command line; journal and console lines are redacted.

Fresh data on every trigger (alchemy-live, 10/10): the webhook says WHICH block changed; the registry content at that
block comes from the Envio indexer (chantier 03, D42), exported at its head once the head has reached the event's
block (from_indexer.export: the same files and rules as the parity-checked export). Why not the Alchemy RPC itself:
the ERC-8004 registry has no per-client index, so rebuilding the graph needs the full NewFeedback / identity history,
and Alchemy's Free tier caps eth_getLogs at 10 blocks per call (MEASURED 10/10, monad-testnet), i.e. millions of
calls for the testnet history. The indexer exports the whole testnet registry in ~2 s (MEASURED 10/10: 2 349
feedbacks, 2 107 agents) and trailed the chain head by 2 blocks when measured. Alchemy carries the trigger and every
chain read of the certifier (node table, certificate, eth_estimateGas, submission).

Timeline (journal action `timeline`, and one console line per step for the video): event block and its timestamp,
webhook reception (ms), head at reception, indexer ready, certificate prepared or submitted (tx block), as deltas in
blocks and in ms.

Usage:
  .venv/bin/python alchemy_hook.py query   --chain 143 [--ancre 0x...]      # GraphQL filter to paste in the dashboard
  .venv/bin/python alchemy_hook.py serve   --port 8787 --chain 10143 --rpc alchemy --ancre 0x... --set-config cfg.json
                                           --set-id 0x... --indexer URL [--send --from 0x.. --keystore F --password-env V]
                                           # receiver + fallback poller; without --send every recertification is
                                           # PREPARED (chain re-read, eth_estimateGas), never signed
  (`--rpc alchemy` = https://monad-{mainnet,testnet}.g.alchemy.com/v2/$ALCHEMY_API_KEY; `--data DIR` instead of
   `--indexer` keeps the former static export, which lags every new event: data_behind)
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
# review THIRD / ONCE: the contract's own proof events wake the certifier and the watcher too
TOPICS["EdgeProven"] = topic("EdgeProven(bytes32 indexed,uint256 indexed,uint256 indexed,int256,int256,uint256,uint256)")
TOPICS["RowVoided"] = topic("RowVoided(bytes32 indexed,uint256 indexed,uint256,uint256)")
CONTRACT_KINDS = ("CertificateSubmitted", "EdgeProven", "RowVoided")
KIND_OF = {v: k for k, v in TOPICS.items()}


def load_env(path: Path | None = None) -> None:
    """KEY=VALUE lines of a local, gitignored .env into os.environ (existing variables win). Default: solver/.env,
    or the file named by ANCRE_ENV (a git worktree reads the main checkout's .env without copying it)."""
    path = Path(path or os.environ.get("ANCRE_ENV") or HERE / ".env")
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


ALCHEMY_RPC = {143: "https://monad-mainnet.g.alchemy.com/v2/", 10143: "https://monad-testnet.g.alchemy.com/v2/"}
SECRET_VARS = ("ALCHEMY_API_KEY", "ALCHEMY_SIGNING_KEY", "ALCHEMY_NOTIFY_TOKEN")


def resolve_rpc(spec: str, chain: int) -> str:
    """`alchemy` -> the keyed Alchemy URL of the chain (the key never appears on the command line)."""
    if spec != "alchemy":
        return spec
    key = os.environ.get("ALCHEMY_API_KEY", "")
    if not key:
        raise SystemExit("--rpc alchemy: ALCHEMY_API_KEY is not set (solver/.env)")
    return ALCHEMY_RPC[chain] + key


def redact(x):
    """Secrets out of anything that is printed or journaled (a cast error can quote the keyed RPC URL)."""
    if isinstance(x, str):
        for v in SECRET_VARS:
            sec = os.environ.get(v)
            if sec and len(sec) >= 8:
                x = x.replace(sec, f"<{v}>")
        return x
    if isinstance(x, dict):
        return {k: redact(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [redact(v) for v in x]
    return x


def graphql_query(chain: int, ancre: str | None = None) -> str:
    """The Custom Webhook filter. Alchemy replaces the block filter by `latest` (one POST per matching block).
    Topic OR-list syntax `topics: [[...]]`: NON VÉRIFIÉ on Monad until the dashboard's "Test Webhook" accepts it."""
    ident, rep = REGISTRIES[chain]
    addrs = [ident, rep] + ([ancre] if ancre else [])
    t0 = [TOPICS[k] for k in ("NewFeedback", "FeedbackRevoked", "Transfer", "MetadataSet", "Approval",
                              "ApprovalForAll", "Upgraded")] + ([TOPICS[k] for k in CONTRACT_KINDS] if ancre else [])
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
    elif kind in CONTRACT_KINDS:
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
    seen: dict = field(default_factory=dict)   # (tx, logIndex) -> block, for events HANDLED successfully only
    covered: int = -1                     # highest block fully handled by the poller
    last_webhook: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)       # dedup state
    run_lock: threading.Lock = field(default_factory=threading.Lock)   # one recertification / audit at a time
    keep_blocks: int = 20_000             # dedup memory: keys older than (highest block seen − keep_blocks) are pruned

    def handle(self, events: list[dict], source: str, block: int | None) -> dict:
        """Events are marked as seen only AFTER their handler succeeded: a recertification that fails, or that
        reports `data_behind`, leaves them fresh, so the next poll (or an Alchemy retry) processes them again.
        Handlers are serialised (webhook worker and fallback poller never run the certifier concurrently)."""
        with self.run_lock:
            with self.lock:
                fresh = [e for e in events if (e["tx"], e["logIndex"]) not in self.seen]
            sup = self.support_of() if self.support_of else None
            rel = [e for e in fresh if e["kind"] not in CONTRACT_KINDS and (sup is None or C.relevant(e, sup))]
            aud = [e for e in fresh if e["kind"] in CONTRACT_KINDS and
                   (self.set_id is None or e.get("setId") == self.set_id.lower())]
            res = {"source": source, "block": block, "events": len(events), "fresh": len(fresh),
                   "duplicates": len(events) - len(fresh), "relevant": len(rel), "certificates": len(aud)}
            blk = lambda lst, f: f([e["block"] for e in lst if e.get("block") is not None] or [block or 0])
            done = [e for e in fresh if e not in rel and e not in aud]          # nothing to do: handled
            if rel and self.on_recertify:
                r = self.on_recertify(rel, blk(rel, max))                      # raises -> stays fresh
                res["recertify"] = r
                if not (isinstance(r, dict) and r.get("action") in ("data_behind", "error")):
                    done += rel
            else:
                done += rel
            if aud and self.on_audit:
                res["audit"] = self.on_audit(blk(aud, min), blk(aud, max))
            done += aud
            with self.lock:
                for e in done:
                    self.seen[(e["tx"], e["logIndex"])] = e.get("block") or block or 0
                top = max(self.seen.values(), default=0)
                if len(self.seen) > 50_000:
                    self.seen = {k: b for k, b in self.seen.items() if b >= top - self.keep_blocks}
            res["pending"] = len(fresh) - len(done)
            return res


def commit_state(rpc: str, block: int) -> dict:
    """Head tags right after reception (Monad: latest / safe / finalized), and the derived state of `block`."""
    tags = {}
    for t in ("latest", "safe", "finalized"):
        tags[t] = _int(_rpc(rpc, "eth_getBlockByNumber", [t, False])["number"])
    return {"head": tags, "state": "Finalized" if block <= tags["finalized"] else "notFinalized",
            "behindLatest": tags["latest"] - block}


def _rpc(url: str, method: str, params: list):
    from refresh import Rpc                             # the solver's single JSON-RPC client
    return Rpc(url)(method, params)


class Receiver:
    """HTTP receiver: POST /alchemy. Verifies the signature BEFORE parsing, answers at once, works in a thread."""

    def __init__(self, dispatcher: Dispatcher, signing_key: str, rpc: str | None = None, journal: C.Journal | None = None):
        self.d, self.key, self.rpc = dispatcher, signing_key, rpc
        self.journal = journal or dispatcher.journal
        self.q: queue.Queue = queue.Queue()

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
                m["commitStateError"] = redact(str(e))[:200]
        self.journal.log(action="webhook_received", block=meta["number"], kinds=sorted({e["kind"] for e in events}),
                         events=len(events), signature="ok", **m)
        res = self.d.handle(events, "webhook", meta["number"])
        t_done = time.time()
        out = self.journal.log(action="webhook", eventId=meta["eventId"], sequenceNumber=meta["sequenceNumber"],
                               blockHash=meta["hash"], **m, **res)
        tl = timeline(meta, m, res, t_recv, t_done)
        if tl:
            self.journal.log(action="timeline", **tl)
        return out

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


def timeline(meta: dict, m: dict, res: dict, t_recv: float, t_done: float) -> dict | None:
    """Event block -> webhook -> data -> certificate, in blocks and in ms (None if nothing was recertified).
    Block times are the header's (1 s resolution on Monad); webhook and certificate times are this host's clock."""
    rc = res.get("recertify")
    if not isinstance(rc, dict) or meta.get("number") is None:
        return None
    ev = meta["number"]
    tl = {"eventBlock": ev, "eventBlockTime": meta.get("timestamp"), "webhookAt": round(t_recv, 3),
          "blockToWebhookS": m.get("latencyS"), "headAtWebhook": (m.get("head") or {}).get("latest"),
          "commitState": m.get("state"), "certAction": rc.get("action"), "certDoneAt": round(t_done, 3),
          "webhookToCertMs": round((t_done - t_recv) * 1000, 1)}
    if tl["headAtWebhook"] is not None:
        tl["blocksEventToWebhook"] = tl["headAtWebhook"] - ev
    data = rc.get("data") or {}
    if data:
        tl.update(indexerHead=data.get("indexerHead"), indexerWaitMs=data.get("waitMs"),
                  exportMs=data.get("exportMs"))
    certified = rc.get("action") == "certified"
    end = rc.get("txBlock") if certified else rc.get("head")
    if end is not None:
        tl["certBlock" if certified else "headAtPrepare"] = end
        tl["blocksEventToCert"] = end - ev
    if rc.get("lastTx"):
        tl["tx"] = rc["lastTx"]
    return tl


def _hms(ts: float | None) -> str:
    if not ts:
        return "--:--:--.---"
    return time.strftime("%H:%M:%S", time.localtime(ts)) + f".{int((ts % 1) * 1000):03d}"


def _pct(wad) -> str:
    return f"{int(wad) / 1e16:.2f} %" if wad is not None else "?"


def console_line(ev: dict) -> str | None:
    """One readable line per step of the live flow (filmed for the Alchemy video). None: not shown."""
    a, t = ev.get("action"), _hms(ev.get("ts"))
    if a == "alchemy_serve":
        mode = "SEND (real transactions)" if ev.get("send") else "dry: certificates are prepared, never sent"
        return f"{t}  ANCRE x Alchemy  listening on :{ev.get('port')}  chain {ev.get('chain')}  {mode}"
    if a == "webhook_received":
        head = (ev.get("head") or {}).get("latest")
        lag = f"  head {head} (+{head - ev['block']} blocks)" if head is not None and ev.get("block") else ""
        state = f"  {ev['state']}" if ev.get("state") else ""
        return (f"{t}  Alchemy webhook  {', '.join(ev.get('kinds') or [])}  block {ev.get('block')}  "
                f"signature OK{state}{lag}")
    if a == "webhook_rejected":
        return f"{t}  Alchemy webhook REJECTED: {ev.get('reason')}"
    if a == "data_ready":
        return (f"{t}  Envio indexer at block {ev.get('indexerHead')} (waited {ev.get('waitMs')} ms): "
                f"{ev.get('feedbacks')} feedbacks exported in {ev.get('exportMs')} ms")
    if a == "data_behind":
        return f"{t}  data behind the event block {ev.get('eventBlock')}: the poller retries"
    if a == "skip_identical":
        return f"{t}  recomputed: same certificate as on chain, nothing to submit"
    if a in ("prepared", "certified", "planned"):
        what = {"prepared": "submitCertificate PREPARED (dry, not sent)", "certified": "certificate SUBMITTED",
                "planned": "certificate planned (offline)"}[a]
        extra = ""
        if a == "prepared" and ev.get("txs"):
            last = ev["txs"][0]
            extra = (f"  eth_estimateGas {last['estimate']}, gas limit {last['gasLimit']}" if "gasLimit" in last
                     else f"  {last.get('error', '')}")
        if a == "certified":
            extra = f"  tx {ev.get('lastTx')}  block {ev.get('txBlock')}"
        return (f"{t}  {what}: {ev.get('nCert')} nodes, {ev.get('rows')} rows, mass {_pct(ev.get('mass'))}{extra}")
    if a == "deferred_replacement_rule":
        return f"{t}  certificate deferred {ev.get('waitBlocks')} blocks (replacement rule)"
    if a == "timeline":
        if "certBlock" in ev:
            end = f"certificate in block {ev['certBlock']}"
        else:
            end = f"prepared at head {ev.get('headAtPrepare')}"
        return (f"{t}  TIMELINE  event block {ev.get('eventBlock')} -> webhook at head +{ev.get('blocksEventToWebhook')}"
                f" blocks ({ev.get('blockToWebhookS')} s after the block timestamp) -> {end} "
                f"(+{ev.get('blocksEventToCert')} blocks, {ev.get('webhookToCertMs')} ms after the webhook)")
    if a == "webhook" and ev.get("fresh") and not ev.get("relevant") and not ev.get("certificates"):
        return f"{t}  no event touches the certificate (its client carries no mass): nothing to recompute"
    if a == "audit":
        n = len(ev.get("discrepancies") or [])
        return (f"{t}  watcher audit of certificate tx {str(ev.get('tx'))[:12]}…: "
                f"{'CLEAN' if not n else str(n) + ' discrepancies (proofs follow)'}")
    if a == "poll_caught":
        return f"{t}  fallback poller caught {ev.get('fresh')} event(s) the webhook had not delivered"
    if a == "webhook_silent":
        return f"{t}  webhook silent for {ev.get('seconds')} s (the poller keeps covering the blocks)"
    if a == "error":
        return f"{t}  ERROR {ev.get('where', '')} {str(ev.get('error', ''))[:200]}"
    return None


class LiveJournal(C.Journal):
    """The service journal: redacted, and echoed to the console in readable lines (console_line)."""

    def __init__(self, path, echo: bool = True):
        super().__init__(path)
        self.echo = echo

    def log(self, **ev):
        ev = super().log(**redact(ev))
        line = console_line(ev) if self.echo else None
        if line:
            print(line, flush=True)
        return ev


class IndexerData:
    """Registry data for one trigger, from the Envio indexer (module docstring): wait until the indexer's head has
    reached the event's block (bounded by wait_s), then export at that head into `out` (atomic files) and load."""

    def __init__(self, src, out: Path, journal: C.Journal, wait_s: float = 60.0, poll_s: float = 0.5,
                 sleep=time.sleep, clock=time.monotonic):
        self.src, self.out, self.journal = src, Path(out), journal
        self.wait_s, self.poll_s, self.sleep, self.clock = wait_s, poll_s, sleep, clock
        self.last = None

    def load(self, block: int):
        """(feedbacks, identity, info), or None if the indexer is still behind `block` after wait_s."""
        from from_indexer import export
        from graph import load_feedbacks_onchain, load_identity_json
        t0 = self.clock()
        head = self.src.head()
        while head < block:
            if self.clock() - t0 > self.wait_s:
                self.last = head
                return None
            self.sleep(self.poll_s)
            head = self.src.head()
        t1 = self.clock()
        files = export(self.src, head, self.out)
        fbs, idn = load_feedbacks_onchain(files["feedbacks"]), load_identity_json(files["identity"])
        info = {"indexerHead": head, "waitMs": round((t1 - t0) * 1000),
                "exportMs": round((self.clock() - t1) * 1000), "feedbacks": len(fbs)}
        self.last = head
        self.journal.log(action="data_ready", eventBlock=block, **info)
        return fbs, idn, info


class StaticData:
    """The former source: a from_indexer.py export directory, read as is (it lags new events: data_behind)."""

    def __init__(self, directory: str | Path):
        self.dir, self.last = Path(directory), None

    def load(self, block: int):
        from graph import load_feedbacks_onchain, load_identity_json
        fbs = load_feedbacks_onchain(self.dir / "onchain_feedbacks.json")
        idn = load_identity_json(self.dir / "identity.json")
        self.last = idn.block
        if idn.block < block:
            return None
        return fbs, idn, {"indexerHead": idn.block, "static": True}


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
    if res.get("pending"):                              # retry these blocks next round (data_behind / failure)
        d.covered = min(e["block"] for e in evs if (e["tx"], e["logIndex"]) not in d.seen) - 1
    else:
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


def build_service(a, journal: C.Journal, source=None, chain=None) -> tuple[Dispatcher, C.Certifier | None]:
    """Wire the dispatcher to the existing certifier and watcher. Without --send a recertification is PREPARED
    (node table and certificate re-read, eth_estimateGas from the set owner) and never signed; --send is Hugo's."""
    svc = None
    d = Dispatcher(set_id=a.set_id, journal=journal)
    if source is None and a.set_config and a.set_id and a.ancre:
        if getattr(a, "indexer", None):
            from from_indexer import GraphQLSource
            source = IndexerData(GraphQLSource(a.indexer, a.chain), Path(a.data_dir), journal, wait_s=a.indexer_wait)
        elif a.data:
            source = StaticData(a.data)
    if a.set_config and a.set_id and a.ancre and source is not None:
        import watcher as Wt
        cfg = C.SetConfig.load(a.set_config)
        if cfg.set_id.lower() != a.set_id.lower():
            raise SystemExit(f"--set-config gives setId {cfg.set_id}, not --set-id {a.set_id}")
        if a.send and not (a.sender and a.keystore and a.password_env):
            raise SystemExit("--send needs --from, --keystore and --password-env (never a silent dry run)")
        signer = C.Signer.build(a.sender or cfg.owner, a.keystore if a.send else None, a.password_env)
        chain = chain or C.Chain(a.rpc, signer)        # (tests inject a fake chain)
        svc = C.Certifier(cfg, chain, a.ancre, a.set_id, Path(a.state), journal)

        def recertify(events, block):
            got = source.load(block)
            if got is None:                             # the data lags the event: say it, the poller retries
                return journal.log(action="data_behind", dataBlock=source.last, eventBlock=block)
            fbs, idn, info = got
            kinds = ", ".join(sorted({e["kind"] for e in events}))
            r = svc.run_once(fbs, idn, reason=f"alchemy: {len(events)} relevant event(s) ({kinds})", block=block,
                             prepare=not a.send)
            return {**r, "data": info}

        def audit(frm, to):
            got = source.load(to)
            if got is None:
                return ["data_behind"]
            fbs, idn, _ = got
            nodes = C.chain_table(chain, a.ancre, a.set_id, cfg.anchors)
            out = [e.get("action") for e in Wt.watch_once(chain, a.ancre, cfg, a.set_id, nodes, fbs, idn, journal,
                                                          frm, to, send=a.send)]
            if svc.contract_changed(C.OnChain.read(chain, a.ancre, a.set_id)):   # review THIRD: a third party moved
                out.append(svc.run_once(fbs, idn, reason="alchemy: contract state changed", block=to,
                                        prepare=not a.send).get("action"))
            return out
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
    s.add_argument("--rpc", default="https://rpc1.monad.xyz", help="URL, or `alchemy` (keyed URL from .env)")
    s.add_argument("--ancre", help="AnchoredReputation address")
    s.add_argument("--set-config")
    s.add_argument("--set-id")
    s.add_argument("--data", help="static from_indexer.py export directory (lags new events; prefer --indexer)")
    s.add_argument("--indexer", help="Envio GraphQL endpoint: a fresh export at each trigger")
    s.add_argument("--indexer-wait", type=float, default=60.0, help="max seconds to wait for the indexer head")
    s.add_argument("--data-dir", default="out/alchemy-live/data", help="where --indexer exports are written")
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
        pl = payloads_from_chain(resolve_rpc(a.rpc, a.chain), a.chain, a.from_block, a.to_block, a.ancre)
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
    a.rpc = resolve_rpc(a.rpc, a.chain)
    Path(a.journal).parent.mkdir(parents=True, exist_ok=True)
    journal = LiveJournal(Path(a.journal))
    d, _ = build_service(a, journal)
    rec = Receiver(d, key, a.rpc, journal)
    srv = ThreadingHTTPServer((a.host, a.port), rec.http_handler())
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    threading.Thread(target=rec.work_forever, daemon=True).start()
    chain = C.Chain(a.rpc)
    start = a.from_block if a.from_block is not None else chain.block_number()
    d.covered = start - 1
    journal.log(action="alchemy_serve", port=a.port, chain=a.chain, fromBlock=start, send=a.send,
                rpc="alchemy" if C.ALCHEMY_HOST in a.rpc else a.rpc, ancre=a.ancre, setId=a.set_id,
                data="indexer" if getattr(a, "indexer", None) else a.data)
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
            journal.log(action="error", where="poller", error=str(e)[:500])


if __name__ == "__main__":
    raise SystemExit(main())

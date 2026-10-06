"""Roll the versioned mainnet snapshot forward from the chain (AM-9.2): solver/data/mainnet-<B>.* -> mainnet-<H>.*.

Provenance (all on-chain, never 8004scan, AM-R4.2):
  1. eth_getLogs over (B, H] on an RPC that accepts the range (rpc1.monad.xyz, Alchemy: full history MEASURED 27/09;
     10 k logs cap per call per ANCRE.md §5, NOT re-measured here; chunked, a refused chunk is halved): ReputationRegistry NewFeedback / FeedbackRevoked, IdentityRegistry Transfer / Approval /
     ApprovalForAll / MetadataSet / Registered, and Upgraded on both proxies (must be 0: a new implementation would
     change the edge rules' inputs, D17);
  2. every agent touched by a NewFeedback or a FeedbackRevoked is RE-READ at block H with
     readAllFeedback(agentId, [], "", "", includeRevoked = true): its feedback list in the snapshot is REPLACED by the
     registry's (values, decimals, tags and revocations exactly as stored; the logs only date the new feedbacks);
  3. the identity of block B is rolled forward with the decoded IdentityRegistry events (graph.replay_identity_events:
     owner, past owners with their transfer block, agentWallet, approvals, operators; the late MetadataSet of
     register() after a callback change is ignored, REGCB, keyed by each log's transactionHash).
A feedback whose NewFeedback log is in the window carries `h` = its indexedTag1 topic (graph R1 bis: matched by hash).
Usage: .venv/bin/python refresh.py --to-block H [--from-snapshot B] [--rpc URL]   (writes data/mainnet-H.*.json.gz)
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

from export import keccak
from graph import ZERO, identity_to_json, load_identity_json, replay_identity_events

HERE = Path(__file__).parent
IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
REPUTATION = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
CAST = os.path.expanduser("~/.foundry/bin/cast")


def topic(sig: str) -> str:
    """keccak of the canonical signature ('indexed' words dropped)."""
    name, args = sig.split("(", 1)
    canon = name + "(" + ",".join(a.split()[0] for a in args.rstrip(")").split(",") if a) + ")"
    return "0x" + keccak(canon.encode()).hex()


def _topics() -> dict[str, str]:
    """Event topics from the signatures of the polling loop (certifier.REGISTRY_EVENTS: one source of truth), plus
    the IdentityRegistry `Registered`."""
    import certifier as C
    t = {k: topic(s) for k, s in C.REGISTRY_EVENTS.items()}
    t["Registered"] = topic("Registered(uint256 indexed,string,address indexed)")
    return t


T = _topics()
NAME = {v: k for k, v in T.items()}
READ_ALL = ("readAllFeedback(uint256,address[],string,string,bool)"
            "(address[],uint64[],int128[],uint8[],string[],string[],bool[])")


class RpcError(RuntimeError):
    """A deterministic refusal by the node (JSON-RPC error, HTTP 4xx): never retried as such."""


class Rpc:
    def __init__(self, url: str):
        self.url, self.calls = url, 0

    def __call__(self, method: str, params: list, retries: int = 6):
        """A JSON-RPC error answer is DETERMINISTIC (range too large, revert): raised at once as RpcError. Transport
        failures (timeout, HTTP 429/5xx) are retried with backoff; HTTP 4xx other than 429 is raised as RpcError.
        rpc1 answers HTTP 403 to urllib's default User-Agent (MEASURED 06/10): an explicit one is sent."""
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        for attempt in range(retries):
            try:
                req = urllib.request.Request(self.url, data=body, headers={"content-type": "application/json",
                                                                          "user-agent": "ancre-solver/1"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    out = json.load(r)
            except urllib.error.HTTPError as e:
                if e.code != 429 and e.code < 500:
                    raise RpcError(f"HTTP {e.code}") from e
                if attempt == retries - 1:
                    raise
            except OSError:
                if attempt == retries - 1:
                    raise
            else:
                self.calls += 1
                if "error" in out:
                    raise RpcError(out["error"])
                return out["result"]
            time.sleep(1.5 * (attempt + 1))


def get_logs(rpc: Rpc, address: str, topics0: list[str], frm: int, to: int, step: int = 500_000) -> list[dict]:
    """All logs of (frm..to] in chunks; a chunk that hits the provider's cap is split in two."""
    out, lo = [], frm
    while lo <= to:
        hi = min(to, lo + step - 1)
        try:
            out += rpc("eth_getLogs", [{"address": address, "topics": [topics0], "fromBlock": hex(lo), "toBlock": hex(hi)}])
            lo = hi + 1
        except (RpcError, OSError):                       # cap hit / range refused / timeout on a huge range: split
            if step <= 1000:
                raise
            step //= 2
    return out


def _word(data: bytes, i: int) -> int:
    return int.from_bytes(data[32 * i:32 * i + 32], "big")


def _dyn(data: bytes, i: int) -> bytes:
    off = _word(data, i)
    n = int.from_bytes(data[off:off + 32], "big")
    return data[off + 32:off + 32 + n]


def decode(lg: dict) -> dict:
    """A raw log as a replay event ({ev, block, li, agent, ...}, the format of graph.replay_identity_events)."""
    tp, data = lg["topics"], bytes.fromhex(lg["data"][2:])
    ev = {"ev": NAME[tp[0]], "block": int(lg["blockNumber"], 16), "li": int(lg["logIndex"], 16),
          "tx": lg["transactionHash"]}
    a = lambda t: "0x" + t[-40:].lower()
    if ev["ev"] == "NewFeedback":
        v = _word(data, 1)
        ev.update(agent=int(tp[1], 16), client=a(tp[2]), idx=_word(data, 0),
                  value=v - 2**256 if v >= 2**255 else v, dec=_word(data, 2),
                  tag1=_dyn(data, 3).decode(errors="replace"), tag2=_dyn(data, 4).decode(errors="replace"),
                  tagHash=tp[3].lower())               # indexedTag1 = keccak256(tag1 bytes): exact even when the
        #                                                text above is lossy (R1 bis, NUL review 06/10)
    elif ev["ev"] == "FeedbackRevoked":
        ev.update(agent=int(tp[1], 16), client=a(tp[2]), idx=int(tp[3], 16))
    elif ev["ev"] == "Transfer":
        ev.update(frm=a(tp[1]), to=a(tp[2]), agent=int(tp[3], 16))
    elif ev["ev"] == "Approval":
        ev.update(owner=a(tp[1]), approved=a(tp[2]), agent=int(tp[3], 16))
    elif ev["ev"] == "ApprovalForAll":
        ev.update(owner=a(tp[1]), operator=a(tp[2]), approved_all=_word(data, 0) != 0)
    elif ev["ev"] == "MetadataSet":
        val = _dyn(data, 1)
        ev.update(agent=int(tp[1], 16), key=_dyn(data, 0).decode(errors="replace"),
                  val=("0x" + val.hex()) if len(val) == 20 else ZERO if not val else "0x" + val.hex())
    elif ev["ev"] == "Registered":
        ev.update(agent=int(tp[1], 16), owner=a(tp[2]))
    return ev


def read_all(agent: int, block: int, rpc_url: str) -> list[dict]:
    """readAllFeedback(agent, [], "", "", true) at `block`, through cast --json (exact int128, strings as stored)."""
    p = subprocess.run([CAST, "call", "--rpc-url", rpc_url, "--block", str(block), "--json", REPUTATION, READ_ALL,
                        str(agent), "[]", "", "", "true"], capture_output=True, text=True, check=True)
    cl, ix, vs, ds, t1, t2, rv = json.loads(p.stdout)
    return [{"a": agent, "c": c.lower(), "i": int(i), "v": str(int(v)), "d": int(d), "t1": a1, "t2": a2, "r": bool(r)}
            for c, i, v, d, a1, a2, r in zip(cl, ix, vs, ds, t1, t2, rv)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--from-snapshot", type=int, default=108_835_675)
    ap.add_argument("--to-block", type=int, required=True)
    ap.add_argument("--rpc", default="https://rpc1.monad.xyz")
    a = ap.parse_args(argv)
    B, H = a.from_snapshot, a.to_block
    rpc = Rpc(a.rpc)
    with gzip.open(HERE / "data" / f"mainnet-{B}.feedbacks.json.gz", "rt") as fh:
        base = json.load(fh)
    idn = load_identity_json(HERE / "data" / f"mainnet-{B}.identity.json.gz")
    t0 = time.time()
    rep = [decode(l) for l in get_logs(rpc, REPUTATION, [T["NewFeedback"], T["FeedbackRevoked"], T["Upgraded"]],
                                       B + 1, H)]
    ide = [decode(l) for l in get_logs(rpc, IDENTITY, [T[k] for k in ("Transfer", "Approval", "ApprovalForAll",
                                                                       "MetadataSet", "Registered", "Upgraded")],
                                       B + 1, H)]
    upgraded = [e for e in rep + ide if e["ev"] == "Upgraded"]
    if upgraded:
        raise SystemExit(f"Upgraded on a registry in ({B}, {H}]: {upgraded} — the snapshot rules no longer apply (D17)")
    touched = sorted({e["agent"] for e in rep})
    fresh = {ag: read_all(ag, H, a.rpc) for ag in touched}
    blocks = {(e["agent"], e["client"], e["idx"]): e["block"] for e in rep if e["ev"] == "NewFeedback"}
    old_b = {(f["a"], f["c"], f["i"]): f.get("b") for f in base["feedbacks"]}
    hashes = {(e["agent"], e["client"], e["idx"]): e["tagHash"] for e in rep if e["ev"] == "NewFeedback"}
    old_h = {(f["a"], f["c"], f["i"]): f.get("h") for f in base["feedbacks"]}
    for e in rep:                                         # every NewFeedback log is found by readAllFeedback
        if e["ev"] == "NewFeedback":
            row = next((f for f in fresh[e["agent"]] if (f["c"], f["i"]) == (e["client"], e["idx"])), None)
            assert row and (int(row["v"]), row["d"], row["t1"]) == (e["value"], e["dec"], e["tag1"]), (e, row)
    kept = [f for f in base["feedbacks"] if f["a"] not in fresh]
    new = []
    for ag, lst in fresh.items():
        for f in lst:
            b = blocks.get((ag, f["c"], f["i"])) or old_b.get((ag, f["c"], f["i"]))
            h = hashes.get((ag, f["c"], f["i"])) or old_h.get((ag, f["c"], f["i"]))
            new.append({**f, **({"b": b} if b else {}), **({"h": h} if h else {})})
    fbs = sorted(kept + new, key=lambda f: (f["a"], f["c"], f["i"]))
    keys = {(f["a"], f["c"], f["i"]) for f in fbs}
    assert len(keys) == len(fbs)
    assert {(f["a"], f["c"], f["i"]) for f in base["feedbacks"]} <= keys, "a feedback of the snapshot disappeared"
    replay_identity_events(idn, ide, B, H)
    fo = {"block": H, "source": f"mainnet-{B} + readAllFeedback@{H} for the {len(touched)} agents touched by "
                                f"NewFeedback/FeedbackRevoked logs in ({B}, {H}] (rpc1); identity rolled with "
                                f"{len(ide)} IdentityRegistry logs", "feedbacks": fbs}
    with gzip.open(HERE / "data" / f"mainnet-{H}.feedbacks.json.gz", "wt") as fh:
        json.dump(fo, fh, separators=(",", ":"))
    with gzip.open(HERE / "data" / f"mainnet-{H}.identity.json.gz", "wt") as fh:
        json.dump(identity_to_json(idn), fh, separators=(",", ":"))
    report = {"from": B, "to": H, "seconds": round(time.time() - t0, 1), "rpcCalls": rpc.calls,
              "reputationLogs": dict(Counter(e["ev"] for e in rep)), "identityLogs": dict(Counter(e["ev"] for e in ide)),
              "touchedAgents": touched, "feedbacks": {"before": len(base["feedbacks"]), "after": len(fbs)},
              "revoked": sum(f["r"] for f in fbs), "agents": len(idn.owner),
              "newFeedbacks": [{k: e[k] for k in ("block", "agent", "client", "idx", "value", "dec", "tag1", "tag2")}
                               for e in rep if e["ev"] == "NewFeedback"]}
    (HERE / "data" / f"mainnet-{H}.refresh.json").write_text(json.dumps(report, indent=1))
    print(json.dumps({k: v for k, v in report.items() if k != "newFeedbacks"}, indent=1))
    return report


if __name__ == "__main__":
    main()

"""ANCRE — HyperSync survival scan of ERC-8004 feedback, per chain (chantier 03, E1b).

For each chain, streams every ERC-8004 registry log through HyperSync (no RPC, no historical state),
rebuilds the IdentityRegistry state from events only (owner, agentWallet, approved, operators), then
applies the reference edge rules of `solver/graph.py` (D14, D15, D16) with the reference schema and filter.

Output: one JSON per chain (raw counters) and a markdown table on stdout.

Usage (from indexer/):
    python3.12 analytics/survival_scan.py --chains 143,42161,10 [--to-block 143:108434519] [--out DIR]

Needs ENVIO_API_TOKEN (read from indexer/.env if not in the environment).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "solver"))
import graph  # noqa: E402  (reference rules; the solver is the source of truth)

ZERO = graph.ZERO
MAINNET_IDENTITY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"
MAINNET_REPUTATION = "0x8004baa17c55a88189ae136b182e5fda19de9b63"
TESTNET_IDENTITY = "0x8004a818bfb912233c491871b3d84c89a494bd9e"
TESTNET_REPUTATION = "0x8004b663056a597dffe9eccc1965a193b7388713"

# chainId -> (name, HyperSync url, identity, reputation, start block). Start blocks: design-indexeur-envio.md §2.1 (MESURÉ 27/09).
CHAINS = {
    143: ("monad", "https://143.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 52_952_790),
    10143: ("monad-testnet", "https://10143.hypersync.xyz", TESTNET_IDENTITY, TESTNET_REPUTATION, 0),
    42161: ("arbitrum", "https://42161.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 428_895_443),
    10: ("optimism", "https://10.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 147_514_947),
    137: ("polygon", "https://137.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 82_458_484),
    1: ("ethereum", "https://1.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 0),
    8453: ("base", "https://base.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 0),
    56: ("bsc", "https://56.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 0),
    43114: ("avalanche", "https://43114.hypersync.xyz", MAINNET_IDENTITY, MAINNET_REPUTATION, 0),
}

T_NEW_FEEDBACK = "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc"
T_REVOKED = "0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d"
T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
T_APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
T_APPROVAL_ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31"
T_METADATA = "0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b"
K_AGENT_WALLET = "0x2ac6109326e720d1435c0db66f7e35eda7839f52b6f1f5520a60788e132b4e39"  # keccak("agentWallet")
OUT_OF_RANGE = 10**38


def token() -> str:
    t = os.environ.get("ENVIO_API_TOKEN")
    if not t:
        env = HERE.parent / ".env"
        for line in env.read_text().splitlines():
            if line.startswith("ENVIO_API_TOKEN="):
                t = line.split("=", 1)[1].strip().strip('"')
    if not t:
        sys.exit("ENVIO_API_TOKEN missing (indexer/.env)")
    return t


PAUSE = 0.0  # seconds between pages (--pause), to stay under the free token's per-60 s budget


def stream_logs(url: str, selections: list[dict], from_block: int, to_block: int | None, tok: str):
    """Yield raw HyperSync logs (all pages) for the given log selections."""
    fb = from_block
    while True:
        body = {"from_block": fb, "logs": selections, "join_mode": "JoinNothing",
                "field_selection": {"log": ["block_number", "log_index", "transaction_hash",
                                            "address", "topic0", "topic1", "topic2", "topic3", "data"]}}
        if to_block is not None:
            body["to_block"] = to_block
        req = urllib.request.Request(url + "/query", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
        for attempt in range(6):
            try:
                d = json.load(urllib.request.urlopen(req, timeout=120))
                break
            except urllib.error.HTTPError as e:  # 429 (token budget per 60 s window) and 5xx are retried
                if (e.code != 429 and e.code < 500) or attempt == 5:
                    raise
                time.sleep(10 * (attempt + 1))
            except (urllib.error.URLError, TimeoutError):
                if attempt == 5:
                    raise
                time.sleep(10 * (attempt + 1))
        for b in d["data"]:
            yield from b.get("logs", [])
        nb = d["next_block"]
        end = to_block if to_block is not None else d["archive_height"]
        if nb >= end:
            return
        fb = nb
        if PAUSE:
            time.sleep(PAUSE)


def word(data: bytes, i: int) -> int:
    return int.from_bytes(data[32 * i:32 * i + 32], "big")


def dyn_bytes(data: bytes, off: int) -> bytes:
    n = int.from_bytes(data[off:off + 32], "big")
    return data[off + 32:off + 32 + n]


def signed(x: int, bits: int = 256) -> int:
    return x - (1 << bits) if x >> (bits - 1) else x


def addr(topic: str) -> str:
    return "0x" + topic[-40:].lower()


def decode_feedback(log: dict) -> dict:
    data = bytes.fromhex(log["data"][2:])
    s = lambda i: dyn_bytes(data, word(data, i)).decode("utf-8", errors="replace")
    return {"agent": int(log["topic1"], 16), "client": addr(log["topic2"]), "index": word(data, 0),
            "value": signed(word(data, 1)), "decimals": word(data, 2), "tag1": s(3), "tag2": s(4),
            "block": log["block_number"]}


def scan(chain_id: int, to_block: int | None, tok: str) -> dict:
    name, url, idr, rep, start = CHAINS[chain_id]
    t0 = time.time()
    sel = [
        {"address": [rep], "topics": [[T_NEW_FEEDBACK, T_REVOKED]]},
        {"address": [idr], "topics": [[T_TRANSFER, T_APPROVAL, T_APPROVAL_ALL]]},
        {"address": [idr], "topics": [[T_METADATA], [], [K_AGENT_WALLET]]},
    ]
    logs = list(stream_logs(url, sel, start, to_block, tok))
    logs.sort(key=lambda l: (l["block_number"], l["log_index"]))
    fetch_s = time.time() - t0

    feedbacks: list[dict] = []
    revoked: set[tuple[int, str, int]] = set()
    owner: dict[int, str] = {}
    wallet: dict[int, str] = {}
    approved: dict[int, str] = {}
    ops: dict[tuple[str, str], bool] = {}
    mints = transfers = wallet_sets = 0
    for l in logs:
        t = l["topic0"]
        if t == T_NEW_FEEDBACK:
            feedbacks.append(decode_feedback(l))
        elif t == T_REVOKED:
            revoked.add((int(l["topic1"], 16), addr(l["topic2"]), int(l["topic3"], 16)))
        elif t == T_TRANSFER:
            frm, to, tid = addr(l["topic1"]), addr(l["topic2"]), int(l["topic3"], 16)
            if frm == ZERO:
                mints += 1
            else:
                transfers += 1
            owner[tid] = to
            approved.pop(tid, None)  # ERC-721: approval cleared on transfer
        elif t == T_APPROVAL:
            approved[int(l["topic3"], 16)] = addr(l["topic2"])
        elif t == T_APPROVAL_ALL:
            data = bytes.fromhex(l["data"][2:])
            ops[(addr(l["topic1"]), addr(l["topic2"]))] = word(data, 0) != 0
        elif t == T_METADATA:
            data = bytes.fromhex(l["data"][2:])
            v = dyn_bytes(data, word(data, 1))
            wallet[int(l["topic1"], 16)] = ("0x" + v.hex()) if len(v) == 20 else ZERO
            wallet_sets += 1

    operators: dict[str, set[str]] = defaultdict(set)
    for (o, op), on in ops.items():
        if on:
            operators[o].add(op)
    # D20: the "past owner" rule is removed from the norm -> past_owners left empty on purpose.
    ident = graph.Identity(block=to_block or 0, owner=owner, wallet=wallet, approved=approved,
                           operators=dict(operators))
    fbs = [graph.Feedback(agent_id=f["agent"], client=f["client"], index=f["index"], value=f["value"],
                          decimals=f["decimals"], tag1=f["tag1"], tag2=f["tag2"],
                          revoked=(f["agent"], f["client"], f["index"]) in revoked, block=f["block"])
           for f in feedbacks]

    schema = graph.load_schema(HERE.parents[1] / "solver" / "schema_reference.json")
    filt = json.load(open(HERE.parents[1] / "solver" / "schema_reference.json"))["filters"]["reference"]
    g = graph.build_graph(fbs, ident, schema, filt, anchors=[], keep_detail=False)

    w2a = ident.wallet_to_agents()
    shared = {w: a for w, a in w2a.items() if len(a) > 1}
    by_client = Counter(f.client for f in fbs)
    by_agent = Counter(f.agent_id for f in fbs)
    tags = Counter(f.tag1 for f in fbs)
    in_filter = [f for f in fbs if f.tag1 in set(filt)]
    edges = [(u, e) for u, e in g.edges()]
    emitter_kinds = Counter(g.nodes[u][0] for u, _ in edges)
    ctl_self = Counter()
    for f in fbs:
        ctl = ident.controllers(f.agent_id)
        if f.client in ctl:
            ctl_self[ctl[f.client]] += 1
    top_agent, top_agent_n = by_agent.most_common(1)[0] if by_agent else (None, 0)
    top_client, top_client_n = by_client.most_common(1)[0] if by_client else (None, 0)
    return {
        "chainId": chain_id, "chain": name, "toBlock": to_block, "lastLogBlock": logs[-1]["block_number"] if logs else None,
        "measuredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "fetchSeconds": round(fetch_s, 1),
        "logs": len(logs),
        "agentsMinted": mints, "transfers": transfers, "walletSets": wallet_sets,
        "agentsWithOwner": len(owner),
        "sharedWallets": len(shared), "agentsOnSharedWallets": sum(len(a) for a in shared.values()),
        "feedbacks": len(fbs), "revoked": sum(f.revoked for f in fbs),
        "couples": len({(f.client, f.agent_id) for f in fbs}),
        "distinctClients": len(by_client), "agentsRated": len(by_agent),
        "topClient": top_client, "topClientShare": round(top_client_n / len(fbs), 4) if fbs else 0,
        "topAgent": top_agent, "topAgentShare": round(top_agent_n / len(fbs), 4) if fbs else 0,
        "absValueGe1e38": sum(abs(f.value) >= OUT_OF_RANGE for f in fbs),
        "emptyTag1": tags.get("", 0), "distinctTag1": len(tags), "topTags": tags.most_common(8),
        "feedbacksInReferenceFilter": len(in_filter),
        "selfRatingsByController": dict(ctl_self),
        "graphLog": g.log,
        "edges": len(edges), "edgesByEmitterKind": dict(emitter_kinds),
        "negativeEdges": sum(e.q < 0 for _, e in edges),
        "survivalFeedbackToEdge": round(len(edges) / len(fbs), 6) if fbs else 0,
        "edgeList": [{"client": e.client, "agent": e.agent_id, "tag1": e.tag1, "q": e.q, "idx": e.feedback_index,
                      "emitter": list(map(str, g.nodes[u]))} for u, e in edges],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chains", default="143,42161,10")
    ap.add_argument("--to-block", action="append", default=[], help="chain:block (exclusive), e.g. 143:108434519")
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--pause", type=float, default=0.0, help="seconds between HyperSync pages (rate limit)")
    a = ap.parse_args()
    global PAUSE
    PAUSE = a.pause
    stops = {int(c): int(b) for c, b in (x.split(":") for x in a.to_block)}
    tok = token()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for c in (int(x) for x in a.chains.split(",")):
        r = scan(c, stops.get(c), tok)
        suffix = f"_{stops[c]}" if c in stops else ""
        (out / f"survival_{r['chain']}{suffix}.json").write_text(json.dumps(r, indent=1))
        rows.append(r)
        print(f"# {r['chain']} ({c}) done in {r['fetchSeconds']} s, {r['logs']} logs", file=sys.stderr)
    print("| chain | agents | feedbacks | revoked | top client share | top agent share | |v|>=1e38 | in ref filter | edges (neg) | survival |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['chain']} | {r['agentsMinted']} | {r['feedbacks']} | {r['revoked']} | {r['topClientShare']:.1%} | "
              f"{r['topAgentShare']:.1%} | {r['absValueGe1e38']} | {r['feedbacksInReferenceFilter']} | "
              f"{r['edges']} ({r['negativeEdges']}) | {r['survivalFeedbackToEdge']:.3%} |")


if __name__ == "__main__":
    main()

"""Who funded the raters? First MON received by the raters of an agent, from the Alchemy Transfers API (D55 ②).

For each rater (client) of the agent in the versioned snapshot (default: Eve-8004, #182, on Monad mainnet), one
`alchemy_getAssetTransfers` call: category `external` (native MON), toAddress = rater, from block 0, ascending,
maxCount 1, zero values excluded. That is the rater's FIRST incoming native transfer. The agent's owner is read
live (`ownerOf(agentId)` on the IdentityRegistry, same endpoint). Facts only: who sent the first MON, how much, when.

What it does NOT see: MON received through an internal call (a contract sending value) is not a top-level
`external` transfer; a rater funded that way shows `firstFunding: null` and is counted apart, never guessed.

Usage (key in solver/.env, ALCHEMY_API_KEY; the JSON never contains it):
  .venv/bin/python funders.py                         # random sample of 150 raters, seed 20261010
  .venv/bin/python funders.py --all                   # every rater (7 665 calls for #182)
  .venv/bin/python funders.py --sample 50 --seed 1 --out out/x.json
Output: out/alchemy-funders-<agent>.json (or --out), MEASURED with its date, endpoint (no key) and parameters.
"""
from __future__ import annotations

import argparse
import gzip
import json
import random
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
IDENTITY = {143: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"}
SNAPSHOT = HERE / "data" / "mainnet-110994810.feedbacks.json.gz"
WEI = 10**18


def raters(snapshot: Path, agent: int) -> tuple[int, list[str]]:
    d = json.load(gzip.open(snapshot)) if snapshot.suffix == ".gz" else json.loads(snapshot.read_text())
    return d["block"], sorted({f["c"].lower() for f in d["feedbacks"] if int(f["a"]) == agent})


def transfers_query(rater: str) -> dict:
    """The one Transfers API request per rater (kept in the output, so the measure can be replayed)."""
    return {"fromBlock": "0x0", "toBlock": "latest", "toAddress": rater, "category": ["external"], "order": "asc",
            "maxCount": "0x1", "withMetadata": True, "excludeZeroValue": True}


def first_funding(rpc, rater: str, patience: int = 12) -> dict | None:
    """One rater. HTTP 429 (the Free tier throttles by compute units per second: this method costs more than a
    plain call), 5xx and timeouts are waited out with a growing pause, up to `patience` times; a JSON-RPC error
    (RpcError) is raised at once."""
    for k in range(patience):
        try:
            res = rpc("alchemy_getAssetTransfers", [transfers_query(rater)], retries=1)
            break
        except OSError:                                 # urllib HTTPError 429/5xx, URLError, timeouts
            if k == patience - 1:
                raise
            time.sleep(2.0 * (k + 1))
    ts = res.get("transfers") or []
    if not ts:
        return None
    t = ts[0]
    return {"from": t["from"].lower(), "wei": str(int(t["rawContract"]["value"], 16)), "asset": t.get("asset"),
            "block": int(t["blockNum"], 16), "tx": t["hash"], "time": (t.get("metadata") or {}).get("blockTimestamp")}


def owner_of(rpc, chain: int, agent: int) -> str:
    out = rpc("eth_call", [{"to": IDENTITY[chain], "data": "0x6352211e" + f"{agent:064x}"}, "latest"])
    return "0x" + out[-40:].lower()


def summarize(rows: list[dict], owner: str) -> dict:
    funded = [r for r in rows if r["firstFunding"]]
    by_from = Counter(r["firstFunding"]["from"] for r in funded)
    amounts = Counter(r["firstFunding"]["wei"] for r in funded)
    from_owner = [r for r in funded if r["firstFunding"]["from"] == owner]
    return {
        "raters": len(rows),
        "withFirstFunding": len(funded),
        "noExternalFunding": len(rows) - len(funded),
        "firstFundedByOwner": len(from_owner),
        "distinctFirstFunders": len(by_from),
        "topFirstFunders": [{"address": a, "raters": n} for a, n in by_from.most_common(5)],
        "amounts": [{"wei": w, "mon": int(w) / WEI, "raters": n} for w, n in amounts.most_common(5)],
        "firstFundingBlocks": [min(r["firstFunding"]["block"] for r in funded), max(r["firstFunding"]["block"] for r in funded)]
        if funded else None,
    }


def measure(rpc, chain: int, agent: int, snapshot: Path, sample: int | None, seed: int, workers: int = 6,
            cache: Path | None = None) -> dict:
    block, everyone = raters(snapshot, agent)
    chosen = everyone if sample is None or sample >= len(everyone) else sorted(random.Random(seed).sample(everyone, sample))
    owner = owner_of(rpc, chain, agent)
    t0 = time.time()
    done = {}
    if cache and cache.exists():                        # resume a long scan (one JSON line per rater)
        for line in cache.read_text().splitlines():
            r = json.loads(line)
            done[r["rater"]] = r["firstFunding"]
    todo = [c for c in chosen if c not in done]

    def one(c):
        f = first_funding(rpc, c)
        if cache:
            with lock, open(cache, "a") as fh:
                fh.write(json.dumps({"rater": c, "firstFunding": f}) + "\n")
        return c, f
    import threading
    lock = threading.Lock()
    with ThreadPoolExecutor(workers) as ex:
        done.update(dict(ex.map(one, todo)))
    rows = [{"rater": c, "firstFunding": done[c]} for c in chosen]
    return {
        "status": "MEASURED",
        "measuredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0)),
        "source": "Alchemy Transfers API (alchemy_getAssetTransfers)",
        "endpoint": "https://monad-mainnet.g.alchemy.com/v2/<key>" if chain == 143 else str(chain),
        "chainId": chain,
        "agentId": agent,
        "owner": owner,
        "ownerSource": "ownerOf(agentId) on the IdentityRegistry, block 'latest' at measuredAt",
        "ratersSource": f"solver/data/{snapshot.name} (block {block}): distinct clients of the agent",
        "population": len(everyone),
        "sample": None if chosen is everyone else {"size": len(chosen), "seed": seed, "method": "random.Random(seed).sample"},
        "query": {**transfers_query("<rater>")},
        "durationS": round(time.time() - t0, 1),
        "resumedRows": len(chosen) - len(todo),
        "summary": summarize(rows, owner),
        "rows": rows,
    }


def app_view(res: dict, keep: int = 150, seed: int = 20261010) -> dict:
    """The slim copy bundled in the screen (app/src/data/funders-<agent>.json): the summary of the whole measure and
    at most `keep` rows (seeded pick), which the screen re-checks live through its Netlify function."""
    rows = res["rows"]
    if len(rows) > keep:
        rows = sorted(random.Random(seed).sample(rows, keep), key=lambda r: r["rater"])
    head = {k: res[k] for k in ("status", "measuredAt", "source", "chainId", "agentId", "owner", "ratersSource",
                                "population", "sample", "summary")}
    return {**head, "rowsKept": len(rows), "rows": rows}


def main(argv=None):
    from alchemy_hook import load_env, resolve_rpc
    from refresh import Rpc
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--agent", type=int, default=182)
    ap.add_argument("--chain", type=int, default=143)
    ap.add_argument("--snapshot", default=str(SNAPSHOT))
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--sample", type=int, default=150)
    g.add_argument("--all", action="store_true")
    ap.add_argument("--seed", type=int, default=20261010)
    ap.add_argument("--workers", type=int, default=6, help="parallel calls (Free tier: 25 rps)")
    ap.add_argument("--rpc", default="alchemy")
    ap.add_argument("--out")
    ap.add_argument("--app-out", help="also write the slim copy for the screen (app/src/data/funders-<agent>.json)")
    ap.add_argument("--from-json", help="no new measure: write --app-out from an existing output")
    a = ap.parse_args(argv)
    if a.from_json:
        Path(a.app_out).write_text(json.dumps(app_view(json.loads(Path(a.from_json).read_text())), indent=1) + "\n")
        return 0
    load_env()
    rpc = Rpc(resolve_rpc(a.rpc, a.chain))
    cache = HERE / "out" / f".funders-{a.agent}.cache.jsonl" if a.all else None    # gitignored, resumable
    res = measure(rpc, a.chain, a.agent, Path(a.snapshot), None if a.all else a.sample, a.seed, a.workers, cache)
    out = Path(a.out or HERE / "out" / f"alchemy-funders-{a.agent}{'' if a.all else '-sample'}.json")
    out.write_text(json.dumps(res, indent=1) + "\n")
    if a.app_out:
        Path(a.app_out).write_text(json.dumps(app_view(res), indent=1) + "\n")
    s = res["summary"]
    print(f"{s['firstFundedByOwner']} / {s['raters']} raters of #{a.agent} got their first MON from its owner "
          f"{res['owner']}; amounts {[(x['mon'], x['raters']) for x in s['amounts']]}; "
          f"no external funding: {s['noExternalFunding']} ({res['durationS']} s) -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

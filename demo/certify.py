"""Demo adapter around the chantier 04 certifier (solver/certifier.py), used by the act 2 scene scripts.

The Envio indexer does not see a local fork, so the scene scripts read the registry themselves (readAllFeedback,
ownerOf, getAgentWallet on the demo agents) and hand this script a data file. Everything else is the certifier's
own code path: build_graph -> certify (sub-solution, D26) -> align on the on-chain node table -> encode -> plan ->
eth_estimateGas x margin -> send. Nothing in solver/ is modified.

Two departures from `certifier.main`, both on the adapter side:
  * the node table is read from the contract's views (nodeCount / nodeKeyAt) instead of NodesAdded logs: the
    public testnet RPC limits eth_getLogs ranges, and a fork forwards pre-fork ranges to it;
  * `--fabricate` adds a feedback that does NOT exist in the registry before computing, and only SIMULATES the
    submission (eth_estimateGas): scene 6 shows that a Registry-verified set rejects a fabricated edge at
    submission. Nothing is ever broadcast in this mode.

Usage (called by demo/lib/certify.ts; prints one JSON object on stdout):
  solver/.venv/bin/python demo/certify.py --config set.json --print-set
  solver/.venv/bin/python demo/certify.py --rpc URL --ancre 0x.. --config set.json --data data.json \
      --signer unlocked:0xADDR | keystore:/path/to/keystore:PASSWORD_ENV_VAR  [--journal f.jsonl] [--fabricate JSON]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "solver"))

import certifier as C  # noqa: E402
from export import quality  # noqa: E402
from graph import ADDR, AGENT, ANCHOR, Feedback, load_identity_json  # noqa: E402
from ppr import e_eff  # noqa: E402

KINDS = {1: AGENT, 2: ADDR, 3: ANCHOR}


def onchain_table(chain: C.Chain, ancre: str, set_id: str) -> list:
    """Node table from the views: key = kind << 248 | id (agentId or address)."""
    n = int(chain.call(ancre, "nodeCount(bytes32)(uint256)", set_id).split()[0])
    out = []
    for i in range(n):
        key = int(chain.call(ancre, "nodeKeyAt(bytes32,uint256)(bytes32)", set_id, str(i)), 16)
        kind, ident = key >> 248, key & ((1 << 248) - 1)
        if kind == 1:
            out.append((AGENT, ident))
        else:
            out.append((KINDS[kind], "0x" + format(ident, "040x")))
    return out


def load_data(path: Path):
    obj = json.loads(path.read_text())
    fbs = [Feedback(agent_id=int(x["a"]), client=x["c"].lower(), index=int(x["i"]), value=int(x["v"]),
                    decimals=int(x["d"]), tag1=x["t1"], tag2=x["t2"], revoked=bool(x["r"]))
           for x in obj["feedbacks"]]
    return fbs, load_identity_json(obj["identity"]), int(obj["block"])


def signer_of(spec: str) -> C.Signer:
    mode, _, rest = spec.partition(":")
    if mode == "unlocked":
        return C.Signer(rest)
    if mode == "keystore":
        path, _, env = rest.rpartition(":")
        addr = json.loads(Path(path).read_text()).get("address", "")
        return C.Signer("0x" + addr.removeprefix("0x"), "keystore", path, env)
    raise SystemExit(f"bad --signer {spec}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True, help="SetConfig JSON written by the scene scripts")
    ap.add_argument("--print-set", action="store_true", help="print the set block and setId, then exit")
    ap.add_argument("--rpc")
    ap.add_argument("--ancre")
    ap.add_argument("--data")
    ap.add_argument("--signer")
    ap.add_argument("--state", help="certifier cache file (reserved capacity)")
    ap.add_argument("--journal")
    ap.add_argument("--reason", default="demo")
    ap.add_argument("--fabricate", help='JSON {"a": agentId, "c": client, "v": value, "d": dec, "t1": tag}')
    a = ap.parse_args(argv)

    cfg = C.SetConfig.load(a.config)
    if a.print_set:  # one source for the set: the scene scripts register exactly what the certifier certifies
        print(json.dumps({"setId": cfg.set_id, "set": cfg.set_block()}))
        return 0
    chain = C.Chain(a.rpc, signer_of(a.signer))
    set_id = cfg.set_id
    fbs, idn, block = load_data(Path(a.data))
    jr = C.Journal(Path(a.journal) if a.journal else None)
    svc = C.Certifier(cfg, chain, a.ancre, set_id, Path(a.state), jr)
    svc.table = lambda head: onchain_table(chain, a.ancre, set_id)   # see module docstring

    if a.fabricate:
        fake = json.loads(a.fabricate)
        last = max((f.index for f in fbs if f.agent_id == int(fake["a"]) and f.client == fake["c"].lower()),
                   default=0)
        fbs = fbs + [Feedback(agent_id=int(fake["a"]), client=fake["c"].lower(), index=last + 1, value=int(fake["v"]),
                              decimals=int(fake.get("d", 0)), tag1=fake["t1"], tag2="demo", revoked=False)]
        oc = C.OnChain.read(chain, a.ancre, set_id)
        g, al, enc = svc.compute(fbs, idn, svc.table(0), oc.n_cert)
        txs = C.plan(cfg, set_id, al, enc, max(svc.state.reserved, oc.n_cert), e_eff(al.cert))
        tx = txs[-1]
        out = {"action": "fabricated", "fn": tx.fn, "nCert": al.cert.n, "rows": len(al.cert.rows),
               "mass": quality(al.cert)[1], "graphRoot": "0x" + enc["graphRoot"].hex()}
        try:
            est = chain.estimate(a.ancre, tx.sig, *tx.args)
            out.update(rejected=False, estimate=est)
        except C.ChainError as e:
            out.update(rejected=True, error=e.reason)
        print(json.dumps(out))
        return 0

    try:
        ev = svc.run_once(fbs, idn, reason=a.reason, block=block)
    except Exception as e:  # journal it and let the caller decide (resume)
        ev = jr.log(action="error", set=cfg.name, error=str(e)[-800:])
        print(json.dumps(ev))
        return 1
    print(json.dumps(ev))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Demo adapter around the chantier 04 certifier (solver/certifier.py), used by the act 2 scene scripts.

The Envio indexer does not see a local fork, so the scene scripts read the registry themselves (readAllFeedback,
ownerOf, getAgentWallet on the demo agents, and the set's node table) and hand this script a data file. Everything
else is the certifier's own code path: build_graph -> certify (sub-solution, D26) -> align on the on-chain node table
-> encode -> plan -> eth_estimateGas x margin -> send. Nothing in solver/ is modified.

Departures from `certifier.main`, all on the adapter side:
  * the node table comes from the data file (read through the contract's views nodeCount / nodeKeyAt by the scenes)
    instead of NodesAdded logs: the public testnet RPC limits eth_getLogs ranges, and a fork forwards pre-fork
    ranges to it;
  * `--fabricate` adds a feedback that does NOT exist in the registry before computing, and only SIMULATES the
    submission (eth_estimateGas): scene 6 shows that a Registry-verified set rejects a fabricated edge at
    submission. Nothing is ever broadcast in this mode;
  * Foundry >= 1.8 reads ETH_PASSWORD as a password FILE path, not as the password (INTERFACE note, journal/06.md).

Usage (called by demo/lib/certify.ts; prints one JSON object on stdout, with this call's certifier journal lines):
  solver/.venv/bin/python demo/certify.py --config set.json --print-set
  solver/.venv/bin/python demo/certify.py --rpc URL --ancre 0x.. --config set.json --data data.json --state f.json \
      --signer unlocked:0xADDR | keystore:/path/to/keystore:PASSWORD_ENV_VAR:0xADDR  [--journal f.jsonl] [--fabricate JSON]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import traceback
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "solver"))

import certifier as C  # noqa: E402
from export import KIND_BYTE, quality  # noqa: E402
from graph import AGENT, Feedback, load_feedbacks_onchain, load_identity_json  # noqa: E402
from ppr import e_eff  # noqa: E402

KINDS = {v: k for k, v in KIND_BYTE.items()}   # contract node kind byte -> solver kind
ID_MASK = (1 << 248) - 1


def node_key(key_hex: str):
    """Contract node key kind << 248 | id -> the solver's (kind, agentId | address)."""
    key = int(key_hex, 16)
    kind, ident = KINDS[key >> 248], key & ID_MASK
    return (kind, ident) if kind == AGENT else (kind, "0x" + format(ident, "040x"))


class DemoCertifier(C.Certifier):
    """The certifier, with the node table of the data file (see module docstring)."""

    def __init__(self, *a, table: list, **kw):
        super().__init__(*a, **kw)
        self._demo_table = table

    def table(self, head: int) -> list:
        return self._demo_table


class CollectingJournal(C.Journal):
    """Also keeps this call's journal lines, returned on stdout (the caller then needs no file re-read)."""

    def __init__(self, path):
        super().__init__(path)
        self.lines = []

    def log(self, **ev):
        ev = super().log(**ev)
        self.lines.append(ev)
        return ev


@contextmanager
def password_file(signer: C.Signer):
    """certifier.Signer puts the password itself in ETH_PASSWORD; Foundry >= 1.8 reads a file path there. The password
    goes to a 0600 file in a private temp dir, removed as soon as the certifier returns."""
    if signer.mode != "keystore":
        yield
        return
    pw = os.environ.get(signer.password_env, "")
    if not pw:
        raise SystemExit(f"env var {signer.password_env} not set")
    d = tempfile.mkdtemp(prefix="ancre-pw-")
    try:
        path = os.path.join(d, "pw")
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as fh:
            fh.write(pw)
        os.environ["ANCRE_PASSWORD_FILE"] = path
        signer.password_env = "ANCRE_PASSWORD_FILE"
        yield
    finally:
        shutil.rmtree(d, ignore_errors=True)
        os.environ.pop("ANCRE_PASSWORD_FILE", None)


def signer_of(spec: str) -> C.Signer:
    mode, _, rest = spec.partition(":")
    if mode == "unlocked":
        return C.Signer(rest)
    if mode == "keystore":  # keystore:<path>:<password env var>:<address> (Foundry keystores carry no address)
        rest, _, addr = rest.rpartition(":")
        path, _, env = rest.rpartition(":")
        return C.Signer(addr.lower(), "keystore", path, env)
    raise SystemExit(f"bad --signer {spec}")


def fabricated(svc: C.Certifier, chain: C.Chain, cfg: C.SetConfig, ancre: str, fbs: list, idn, fake: dict) -> dict:
    """Scene 6: certify a graph with one edge the registry does not hold, and simulate its submission."""
    last = max((f.index for f in fbs if f.agent_id == int(fake["a"]) and f.client == fake["c"].lower()), default=0)
    fbs = fbs + [Feedback(agent_id=int(fake["a"]), client=fake["c"].lower(), index=last + 1, value=int(fake["v"]),
                          decimals=int(fake.get("d", 0)), tag1=fake["t1"], tag2="demo", revoked=False)]
    oc = C.OnChain.read(chain, ancre, cfg.set_id)
    _, al, enc = svc.compute(fbs, idn, svc.table(0), oc.n_cert)
    tx = C.plan(cfg, cfg.set_id, al, enc, max(svc.state.reserved, oc.n_cert), e_eff(al.cert))[-1]
    out = {"action": "fabricated", "fn": tx.fn, "nCert": al.cert.n, "rows": len(al.cert.rows),
           "mass": quality(al.cert)[1], "graphRoot": "0x" + enc["graphRoot"].hex()}
    try:
        out.update(rejected=False, estimate=chain.estimate(ancre, tx.sig, *tx.args))
    except C.ChainError as e:
        out.update(rejected=True, error=e.reason)
    return out


def run(a, cfg: C.SetConfig, signer: C.Signer) -> int:
    chain = C.Chain(a.rpc, signer)
    data = json.loads(Path(a.data).read_text())
    fbs, idn = load_feedbacks_onchain(a.data), load_identity_json(data["identity"])
    jr = CollectingJournal(Path(a.journal) if a.journal else None)
    svc = DemoCertifier(cfg, chain, a.ancre, cfg.set_id, Path(a.state), jr, table=[node_key(k) for k in data["table"]])
    if a.fabricate:
        print(json.dumps(fabricated(svc, chain, cfg, a.ancre, fbs, idn, json.loads(a.fabricate))))
        return 0
    code = 0
    try:
        ev = svc.run_once(fbs, idn, reason=a.reason, block=int(data["block"]))
    except Exception as e:  # journal it and let the caller decide (resume)
        ev = jr.log(action="error", set=cfg.name, error=f"{type(e).__name__}: {e}"[-800:], trace=traceback.format_exc()[-1500:])
        code = 1
    print(json.dumps({**ev, "journal": jr.lines}))
    return code


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
    signer = signer_of(a.signer)
    with password_file(signer):
        return run(a, cfg, signer)


if __name__ == "__main__":
    sys.exit(main())

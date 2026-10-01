"""Simulation of the certifier against a local anvil fork (chantier 04-E4). No real transaction.

  anvil --network monad --fork-url <rpc> --fork-block-number B   (Monad gas model: MIP-8, gas limit charged)
  deploy the R5 contract (v0 encoding, contracts/ is compiled into the scratchpad, never modified)
  scenario A  every v0-encodable vector of solver/vectors/ is ACCEPTED, and a mutated copy is REJECTED
  scenario B  the service cycle on the real mainnet state: first certificate, identical recompute (skipped),
              a new feedback by a support client (relevant trigger, update), a feedback by a zero-mass client
              (ignored by the trigger filter)
  scenario C  a large first certificate is split (addNodes chunks, reserveCapacity, submitCertificate)
Every transaction records eth_estimateGas, the gas limit sent and gasUsed: the estimate/used gap is MEASURED here.

Usage: .venv/bin/python simulate.py [--fork-url URL] [--fork-block B] [--out report.md]
"""
from __future__ import annotations

import argparse
import json
import os
import random
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import certifier as C
import run_mainnet as R
from export import NotEncodable, encode, load_certificate, node_entry
from graph import ADDR, AGENT, ANCHOR, ZERO, Feedback, Identity

HERE = Path(__file__).parent
ROOT = HERE.parent
SCR = Path(os.environ.get("ANCRE_SIM_DIR", Path(tempfile.gettempdir()) / "ancre-sim"))
FOUNDRY = Path.home() / ".foundry" / "bin"
# anvil dev accounts, used UNLOCKED against the local fork only (no key handled at all)
DEV_ADDR = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
OTHER_ADDR = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
IDENTITY, REPUTATION = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def start_anvil(fork_url: str, block: int) -> tuple[subprocess.Popen, str]:
    port = free_port()
    p = subprocess.Popen([str(FOUNDRY / "anvil"), "--network", "monad", "--fork-url", fork_url,
                          "--fork-block-number", str(block), "--port", str(port), "--silent"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rpc = f"http://127.0.0.1:{port}"
    for _ in range(120):
        try:
            subprocess.run([str(FOUNDRY / "cast"), "block-number", "--rpc-url", rpc], check=True, capture_output=True)
            return p, rpc
        except subprocess.CalledProcessError:
            time.sleep(0.5)
    p.kill()
    raise RuntimeError("anvil did not start")


def build_contract() -> str:
    out = SCR / "forge-out"
    subprocess.run([str(FOUNDRY / "forge"), "build", "--root", str(ROOT / "contracts"), "--out", str(out),
                    "--cache-path", str(SCR / "forge-cache"), "src/AnchoredReputation.sol"], check=True,
                   capture_output=True)
    return json.loads((out / "AnchoredReputation.sol" / "AnchoredReputation.json").read_text())["bytecode"]["object"]


def deploy(chain: C.Chain, bytecode: str) -> str:
    args = subprocess.run([str(FOUNDRY / "cast"), "abi-encode", "c(address,address)", IDENTITY, REPUTATION],
                          check=True, capture_output=True, text=True).stdout.strip()
    rc = chain.deploy(bytecode + args[2:], gas_limit=12_000_000)
    assert rc["ok"], rc
    return rc["contractAddress"]


def register(chain: C.Chain, contract: str, cfg: C.SetConfig) -> tuple[str, dict]:
    tup = cfg.set_params_tuple()
    set_id = chain.call(contract, f"computeSetId({C.SET_PARAMS_SIG})(bytes32)", tup)
    est = chain.estimate(contract, f"registerAnchorSet({C.SET_PARAMS_SIG})", tup)
    rc = chain.send(contract, f"registerAnchorSet({C.SET_PARAMS_SIG})", tup, gas_limit=cfg.gas.limit(est))
    return set_id, {"fn": "registerAnchorSet", "estimate": est, "gasUsed": int(rc["gasUsed"], 16)}


def cfg_from_vector(obj: dict, name: str) -> C.SetConfig:
    tags = obj["set"]["tags"]
    schema = {"tags": {t["tag"]: {"min": _dec(t["min"]),
                                  "neutral": _dec(t["neutral"]), "max": _dec(t["max"]),
                                  "kind": "endorsement" if t["kind"] == 0 else "measurement"} for t in tags}}
    sp = SCR / f"schema_{name}.json"
    sp.write_text(json.dumps(schema))
    return C.SetConfig(name=name, anchors=obj["set"]["anchors"], lambdas=[int(x) for x in obj["set"]["lambdas"]],
                       alphaN=obj["set"]["alphaN"], alphaD=obj["set"]["alphaD"], filter_tags=[t["tag"] for t in tags],
                       schema_path=str(sp), min_anchors=obj["set"]["minAnchors"], owner=DEV_ADDR,
                       tag_schema_hash="0x" + C.keccak(name.encode()).hex())     # one setId per vector


def _dec(wad: str) -> str:
    from decimal import Decimal
    return str(Decimal(int(wad)) / Decimal(10**18))


def vector_calldata(obj: dict) -> tuple[C.Certificate, list, dict]:
    """v0 calldata of a published vector (aliases expanded, sources in the wallet field)."""
    cert = load_certificate(obj)
    nodes = []
    for nd in obj["nodes"]:
        nodes.append((ANCHOR, nd["address"]) if nd["kind"] == "anchor" else
                     (AGENT, nd["agentId"]) if nd["kind"] == "agent" else (ADDR, nd["address"]))
    idn = Identity(block=0, owner={nd["agentId"]: nd.get("owner") or ZERO for nd in obj["nodes"] if nd["kind"] == "agent"},
                   wallet={})
    enc = encode(cert, nodes, idn if obj["identityBlock"] is not None else None, version="v0")
    return cert, nodes, enc




def scenario_vectors(chain: C.Chain, contract: str) -> list[dict]:
    res = []
    for p in sorted((HERE / "vectors").glob("*.json")):
        obj = json.loads(p.read_text())
        name = p.stem
        try:
            cert, nodes, enc = vector_calldata(obj)
        except NotEncodable as e:
            res.append({"vector": name, "result": f"not v0-encodable ({e})"})
            continue
        cfg = cfg_from_vector(obj, name)
        try:
            set_id, reg = register(chain, contract, cfg)
        except C.ChainError as e:
            res.append({"vector": name, "result": "set NOT registrable on v0: " + C.revert_reason(str(e)),
                        "tagsOver32Bytes": [t for t in cfg.filter_tags if len(t.encode()) > 32]})
            continue
        e_max = int(obj["expected"]["eEff"])
        # mutated copy first (must revert): t of the last massive node of column 0 raised by 1e6 wei
        bad = bytearray(enc["vectors"])
        rec = (cert.k + 1) * 8
        v = max(i for i in range(cert.n) if cert.t[0][i] > 0)
        bad[v * rec:v * rec + 8] = (cert.t[0][v] + 10**6).to_bytes(8, "big")
        args = [set_id, str(cert.n), str(e_max), "0x" + enc["newNodes"].hex()]
        try:
            chain.estimate(contract, C.SUBMIT_SIG, *args, "0x" + bytes(bad).hex(), "0x" + enc["rows"].hex())
            mutated = "ACCEPTED (bug)"
        except C.ChainError as e:
            mutated = "rejected: " + C.revert_reason(str(e))
        est = chain.estimate(contract, C.SUBMIT_SIG, *args, "0x" + enc["vectors"].hex(), "0x" + enc["rows"].hex())
        rc = chain.send(contract, C.SUBMIT_SIG, *args, "0x" + enc["vectors"].hex(), "0x" + enc["rows"].hex(),
                        gas_limit=cfg.gas.limit(est))
        ok = rc["ok"]
        root = chain.call(contract, "dryRun(bytes32,uint32,bytes,bytes)(uint256[],uint256,bytes32)", set_id,
                          str(cert.n), "0x" + enc["vectors"].hex(), "0x" + enc["rows"].hex()).split("\n")
        res.append({"vector": name, "result": "ACCEPTED" if ok else "REVERTED", "mutated": mutated,
                    "estimate": est, "gasLimit": cfg.gas.limit(est), "gasUsed": int(rc["gasUsed"], 16),
                    "eEffOnChain": int(root[1].split()[0]), "eEffExpected": e_max,
                    "graphRootMatch": root[2].strip() == "0x" + enc["graphRoot"].hex()})
    return res


def scenario_service(chain: C.Chain, contract: str) -> list[dict]:
    fbs, idn = R.load_mainnet()
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    raw = json.load(open(HERE / "schema_reference.json"))
    cfg = C.SetConfig(name="mainnet-honest", anchors=[h1, h2], lambdas=[5 * 10**17, 5 * 10**17], alphaN=1, alphaD=3,
                      filter_tags=raw["filters"]["core"], owner=DEV_ADDR, min_refresh=600, slack_refresh=10**6,
                      max_age=30_000, refresh_lead=5_000,
                      tag_schema_hash="0x" + C.keccak(b"service").hex())
    set_id, reg = register(chain, contract, cfg)
    st = SCR / "state_service.json"
    st.unlink(missing_ok=True)
    jr = SCR / "journal_service.jsonl"
    jr.unlink(missing_ok=True)
    svc = C.Certifier(cfg, chain, contract, set_id, st, C.Journal(jr))
    out = [reg, svc.run_once(fbs, idn, reason="first certificate")]
    out.append(svc.run_once(fbs, idn, reason="recompute, nothing changed"))
    # a new vouch from anchor 0x0730 to #22 (a support client): relevant -> update, #22 appended to the table
    ev1 = Feedback(agent_id=22, client=h1, index=2, value=100, decimals=0, tag1="vouch", tag2="", revoked=False)
    rel1 = C.relevant({"kind": "NewFeedback", "client": h1, "agentId": 22}, svc.support)
    out.append({"trigger": "NewFeedback 0x0730 -> #22", "relevant": rel1})
    r = svc.run_once(fbs + [ev1], idn, reason="new feedback by a support client")
    out.append(r)
    if r["action"] == "deferred_replacement_rule":        # wait out minRefresh on the fork, then retry
        chain._run("rpc", "anvil_mine", hex(r["waitBlocks"]))
        out.append(svc.run_once(fbs + [ev1], idn, reason="retry after minRefresh"))
    # a feedback by the scanner (zero mass in this set): the trigger filter ignores it
    sc = R.resolve(R.SCANNER, fbs)
    out.append({"trigger": "NewFeedback scanner -> #2", "relevant": C.relevant(
        {"kind": "NewFeedback", "client": sc, "agentId": 2}, svc.support)})
    # a third party front-runs with addNodes (a junk agent, then #3 which we also need): the service re-reads
    # the table from the chain and still certifies (review E4, finding 1)
    other = C.Chain(chain.rpc, C.Signer(OTHER_ADDR))
    junk = node_entry((AGENT, 999_999)) + node_entry((AGENT, 23))         # junk, then a node we will need
    rc = other.send(contract, C.ADD_NODES_SIG, set_id, "0x" + junk.hex(), gas_limit=500_000)
    assert rc["ok"], "the third-party addNodes must succeed for the scenario to mean anything"
    out.append({"frontRun": "third party addNodes(#999999, #23)", "tx": rc["transactionHash"]})
    ev2 = Feedback(agent_id=23, client=h2, index=1, value=100, decimals=0, tag1="vouch", tag2="", revoked=False)
    chain._run("rpc", "anvil_mine", hex(cfg.min_refresh + 1))
    out.append(svc.run_once(fbs + [ev1, ev2], idn, reason="after a third-party addNodes"))
    # nothing changes for maxAge − refreshLead blocks: the identical graph is republished (refresh)
    chain._run("rpc", "anvil_mine", hex(cfg.max_age - cfg.refresh_lead + 1))
    out.append(svc.run_once(fbs + [ev1, ev2], idn, reason="age refresh, identical graph"))
    out.append({"journal": [json.loads(l) for l in jr.read_text().splitlines()]})
    return out


def scenario_split(chain: C.Chain, contract: str, n_agents: int = 1300) -> list[dict]:
    """Synthetic registry large enough to need addNodes / reserveCapacity chunks."""
    rng = random.Random(1)
    A, B = "0x" + "a1" * 20, "0x" + "b2" * 20
    wal = {j: "0x" + f"{j + 0x1000:040x}" for j in range(1, n_agents + 1)}
    idn = Identity(block=0, owner=dict(wal), wallet=dict(wal))
    fbs, idx = [], {}

    def fb(a, c, v):
        idx[(a, c)] = idx.get((a, c), 0) + 1
        fbs.append(Feedback(agent_id=a, client=c, index=idx[(a, c)], value=v, decimals=0, tag1="vouch", tag2="",
                            revoked=False))
    for j in range(1, 21):
        fb(j, A, 100)
        fb(j, B, 100)
    for j in range(1, n_agents + 1):
        for d in rng.sample(range(1, n_agents + 1), 3):
            if d != j:
                fb(d, wal[j], rng.randint(20, 100))
    cfg = C.SetConfig(name="split", anchors=[A, B], lambdas=[5 * 10**17, 5 * 10**17], alphaN=1, alphaD=3,
                      filter_tags=["vouch"], owner=DEV_ADDR,
                      gas=C.GasPolicy(add_nodes_per_tx=500, reserve_slots_per_tx=600))
    set_id, reg = register(chain, contract, cfg)
    st = SCR / "state_split.json"
    st.unlink(missing_ok=True)
    jr = SCR / "journal_split.jsonl"
    jr.unlink(missing_ok=True)
    svc = C.Certifier(cfg, chain, contract, set_id, st, C.Journal(jr))

    class Crash(Exception):
        pass
    real_send, sent = chain.send, []

    def crashing_send(*a, **kw):                        # the process "dies" after the first mined addNodes
        if sent:
            raise Crash()
        sent.append(1)
        return real_send(*a, **kw)
    chain.send = crashing_send
    try:
        svc.run_once(fbs, idn, reason="first large certificate (crashes)")
    except Crash:
        pass
    chain.send = real_send
    st.unlink(missing_ok=True)                          # the local state is lost too
    svc = C.Certifier(cfg, chain, contract, set_id, st, C.Journal(jr))
    last = svc.run_once(fbs, idn, reason="restart after crash, state file lost")
    return [reg, {"journal": [json.loads(l) for l in jr.read_text().splitlines()]}, last]


def two_omissions_vector(fbs, idn) -> dict:
    """The anchor row of 0xea0b with BOTH its slash (#4) and its vouch (#2) omitted: two proofs on one row, the
    second one chained with `added` (review E5, finding 7)."""
    import copy
    from export import export_certificate
    from graph import build_graph, load_schema
    from ppr import certify
    from fractions import Fraction
    raw = json.load(open(HERE / "schema_reference.json"))
    ref, core = load_schema(raw), raw["filters"]["core"]
    ea0b, h1 = R.resolve(R.EA0B, fbs), R.resolve(R.HONEST1, fbs)
    g = copy.deepcopy(build_graph(fbs, idn, ref, core, [ea0b, h1]))
    ua, n2, n4 = g.index[(ANCHOR, ea0b)], g.index[(AGENT, 2)], g.index[(AGENT, 4)]
    g.rows[ua] = [e for e in g.rows[ua] if e.dst not in (n2, n4)]
    return export_certificate(g, certify(g, Fraction(1, 3)), idn, schema=ref, filter_tags=core, label="two_omissions")


def scenario_watch(chain: C.Chain, contract: str) -> list[dict]:
    """Violation vectors (D37) published on the fork, then audited by the watcher; the v0-provable ones are
    proven ON THE FORK (send=True against anvil only): OmissionProven, eEff widened."""
    import watcher as Wt
    fbs, idn = R.load_mainnet()
    out = []
    objs = {n: json.loads((HERE / "vectors" / "violations" / f"{n}.json").read_text())
            for n in ("fabricated", "omitted_negative", "inflated", "dilution")}
    objs["two_omissions_one_row"] = two_omissions_vector(fbs, idn)
    for name, obj in objs.items():
        cert, nodes, enc = vector_calldata(obj)
        cfg = cfg_from_vector(obj, "viol_" + name)
        set_id, _ = register(chain, contract, cfg)
        start = chain.block_number()
        args = [set_id, str(cert.n), obj["expected"]["eEff"], "0x" + enc["newNodes"].hex(),
                "0x" + enc["vectors"].hex(), "0x" + enc["rows"].hex()]
        chain.send(contract, C.SUBMIT_SIG, *args, gas_limit=cfg.gas.limit(chain.estimate(contract, C.SUBMIT_SIG, *args)))
        before = str(C.OnChain.read(chain, contract, set_id).e_eff)
        ev = Wt.watch_once(chain, contract, cfg, set_id, nodes, fbs, idn, C.Journal(SCR / "journal_watch.jsonl"),
                           start, send=True)
        after = str(C.OnChain.read(chain, contract, set_id).e_eff)
        out.append({"vector": name, "detected": [d["kind"] for e in ev for d in e["discrepancies"]],
                    "proofs": [p for e in ev for p in e.get("proofs", [])],
                    "eEffBefore": before, "eEffAfter": after})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fork-url", default="https://rpc1.monad.xyz")
    ap.add_argument("--fork-block", type=int, default=R.BLOCK)
    ap.add_argument("--out", default=str(HERE / "out" / "simulation.json"))
    args = ap.parse_args(argv)
    SCR.mkdir(parents=True, exist_ok=True)
    bytecode = build_contract()
    anvil, rpc = start_anvil(args.fork_url, args.fork_block)
    try:
        chain = C.Chain(rpc, C.Signer(DEV_ADDR))
        contract = deploy(chain, bytecode)
        report = {"fork": {"url": args.fork_url, "block": args.fork_block, "network": "monad (anvil)"},
                  "contract": contract,
                  "vectors": scenario_vectors(chain, contract),
                  "service": scenario_service(chain, contract),
                  "split": scenario_split(chain, contract),
                  "watch": scenario_watch(chain, contract)}
    finally:
        anvil.kill()
    Path(args.out).parent.mkdir(exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1)[:6000])


if __name__ == "__main__":
    sys.exit(main())

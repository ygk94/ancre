"""Simulation of the certifier and the watcher against AnchoredReputation v1 on a local anvil fork. No real transaction.

  anvil --network monad --fork-url <rpc> --fork-block-number B   (Monad gas model: MIP-8, gas limit charged)
  deploy contracts/src/AnchoredReputation.sol (compiled into the scratchpad; contracts/ is never modified)
  scenario A  every vector of solver/vectors/ is registered with ITS policy (setId recomputed on chain = the JSON setId),
              a mutated copy (t + 1e6 wei) is REJECTED (NotSubSolution), the vector itself is ACCEPTED, and the
              on-chain eEff, graphRoot, vectorRoot, mass and q equal the expected values (the differential test)
  scenario B  the 4 violation vectors (D37): Registry-verified rejects fabrication and inflation at submission,
              accepts dilution and the omitted negative, which the watcher then proves (proveEdge); the same 4 at the
              Submitter-attested level are all accepted, and all proven (proof (v) included)
  scenario C  the service cycle on the real mainnet state (open Registry-verified set): first certificate, identical
              recompute (skipped), a growing graph (AM-04.1), a censoring certificate by a third party (refused), a
              zero-mass client (ignored), a third-party addNodes front-run, an age refresh
  scenario D  a large first certificate split (addNodes chunks, reserveCapacity, submitCertificate) with a crash
Every transaction records eth_estimateGas, the gas limit sent and gasUsed.

Usage: .venv/bin/python simulate.py [--fork-url URL] [--fork-block B] [--out report.json]
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import random
import socket
import subprocess
import sys
import tempfile
import time
from fractions import Fraction
from pathlib import Path

import certifier as C
import run_mainnet as R
import watcher as Wt
from export import (VECTOR_SUBMITTER, export_certificate, load_certificate, node_entry, reference_policy,
                    vector_schema_hash)
from graph import ADDR, AGENT, ANCHOR, Feedback, Identity

HERE = Path(__file__).parent
ROOT = HERE.parent
SCR = Path(os.environ.get("ANCRE_SIM_DIR", Path(tempfile.gettempdir()) / "ancre-sim"))
FOUNDRY = Path.home() / ".foundry" / "bin"
# anvil dev accounts, used UNLOCKED against the local fork only (no key handled at all). DEV_ADDR is also the listed
# submitter of the Submitter-attested vectors (export.VECTOR_SUBMITTER, a public test key).
DEV_ADDR = VECTOR_SUBMITTER
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
                          "--fork-block-number", str(block), "--port", str(port), "--silent",
                          "--timeout", "120000", "--retries", "10"],
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
    """registerAnchorSet; the setId computed on chain MUST equal the off-chain one (export.set_id, D39)."""
    tup = cfg.set_params_tuple()
    on_chain = chain.call(contract, f"computeSetId({C.SET_PARAMS_SIG})(bytes32)", tup).lower()
    assert on_chain == cfg.set_id, (on_chain, cfg.set_id)
    est = chain.estimate(contract, f"registerAnchorSet({C.SET_PARAMS_SIG})", tup)
    rc = chain.send(contract, f"registerAnchorSet({C.SET_PARAMS_SIG})", tup, gas_limit=cfg.gas.limit(est))
    assert rc["ok"], rc
    return on_chain, {"fn": "registerAnchorSet", "estimate": est, "gasUsed": int(rc["gasUsed"], 16)}


def cfg_from_vector(obj: dict, name: str, **override) -> C.SetConfig:
    """SetConfig reproducing the vector's `set` block exactly (same setId), or a variant via `override`."""
    st = obj["set"]
    tags = st["tags"]
    schema = {"tags": {t["tag"]: {"min": _dec(t["min"]), "neutral": _dec(t["neutral"]), "max": _dec(t["max"]),
                                  "kind": "endorsement" if t["kind"] == 0 else "measurement"} for t in tags}}
    SCR.mkdir(parents=True, exist_ok=True)
    sp = SCR / f"schema_{name}.json"
    sp.write_text(json.dumps(schema))
    pol = st["policy"]
    kw = dict(name=name, anchors=st["anchors"], lambdas=[int(x) for x in st["lambdas"]], alphaN=st["alphaN"],
              alphaD=st["alphaD"], filter_tags=[t["tag"] for t in tags], schema_path=str(sp),
              min_anchors=pol["minAnchors"], owner=DEV_ADDR, tag_schema_hash=st["tagSchemaHash"],
              theta=int(pol["theta"]), rho_n=pol["rhoN"], rho_d=pol["rhoD"], veto_quorum=pol["vetoQuorum"],
              veto_max=pol["vetoMax"], max_age=pol["maxAge"], min_refresh=pol["minRefresh"],
              slack_refresh=int(pol["slackRefresh"]), e_low_max=int(pol["eLowMax"]),
              strict_transfer=pol["strictTransfer"], registry_verified=pol["registryVerified"],
              owner_fallback=pol["ownerFallback"], submitters=list(pol["submitters"]))
    kw.update(override)
    return C.SetConfig(**kw)


def _dec(wad: str) -> str:
    from decimal import Decimal
    return str(Decimal(int(wad)) / Decimal(10**18))


def vector_calldata(obj: dict) -> tuple[C.Certificate, list, dict]:
    """The published v1 calldata of a vector, its certificate and its node table (FORMAT.md §1)."""
    cert = load_certificate(obj)
    nodes = [(ANCHOR, nd["address"]) if nd["kind"] == "anchor" else
             (AGENT, nd["agentId"]) if nd["kind"] == "agent" else (ADDR, nd["address"]) for nd in obj["nodes"]]
    cd = obj["calldata"]
    enc = {k: bytes.fromhex(cd[k][2:]) for k in ("newNodes", "vectors", "rows")}
    enc["W"] = cd["W"]
    enc["graphRoot"] = bytes.fromhex(obj["expected"]["graphRoot"][2:])
    return cert, nodes, enc


def _submit_args(set_id: str, obj: dict, enc: dict, vectors: bytes | None = None) -> list[str]:
    return [set_id, str(obj["nCert"]), obj["expected"]["eEff"], "0x" + enc["newNodes"].hex(),
            "0x" + (vectors if vectors is not None else enc["vectors"]).hex(), "0x" + enc["rows"].hex()]


def submit_vector(chain: C.Chain, contract: str, set_id: str, obj: dict, cfg: C.SetConfig) -> dict:
    """Submit one vector; returns the outcome with the on-chain values to compare (eEff, roots, quality)."""
    cert, nodes, enc = vector_calldata(obj)
    args = _submit_args(set_id, obj, enc)
    try:
        est = chain.estimate(contract, C.SUBMIT_SIG, *args)
    except C.ChainError as e:
        return {"result": "REJECTED", "reason": C.revert_reason(str(e))}
    rc = chain.send(contract, C.SUBMIT_SIG, *args, gas_limit=cfg.gas.limit(est))
    oc = C.OnChain.read(chain, contract, set_id)
    exp = obj["expected"]
    return {"result": "ACCEPTED" if rc["ok"] else "REVERTED", "estimate": est, "gasLimit": cfg.gas.limit(est),
            "gasUsed": int(rc["gasUsed"], 16), "eEffOnChain": oc.e_eff, "eEffExpected": int(exp["eEff"]),
            "graphRootMatch": oc.graph_root == exp["graphRoot"], "vectorRootMatch": oc.vector_root == exp["vectorRoot"],
            "massMatch": oc.mass == int(exp["mass"]), "qMatch": oc.q_cur == int(exp["qEff"])}


def scenario_vectors(chain: C.Chain, contract: str) -> list[dict]:
    res = []
    for p in sorted((HERE / "vectors").glob("*.json")):
        obj = json.loads(p.read_text())
        name = p.stem
        cfg = cfg_from_vector(obj, name)
        set_id, reg = register(chain, contract, cfg)
        assert set_id == obj["set"]["setId"]
        cert, nodes, enc = vector_calldata(obj)
        bad = bytearray(enc["vectors"])                 # mutated copy first: t of the last massive node of column 0
        rec = (cert.k + 1) * 8
        v = max(i for i in range(cert.n) if cert.t[0][i] > 0)
        bad[v * rec:v * rec + 8] = (cert.t[0][v] + 10**6).to_bytes(8, "big")
        try:
            chain.estimate(contract, C.SUBMIT_SIG, *_submit_args(set_id, obj, enc, bytes(bad)))
            mutated = "ACCEPTED (bug)"
        except C.ChainError as e:
            mutated = "rejected: " + C.revert_reason(str(e))
        out = submit_vector(chain, contract, set_id, obj, cfg)
        res.append({"vector": name, "level": "Registry-verified" if cfg.registry_verified else "Submitter-attested",
                    "ownerFallback": cfg.owner_fallback, "setIdMatch": True, "registerGas": reg["gasUsed"],
                    "mutated": mutated, **out})
    return res


def _prove_all(chain, contract, cfg, set_id, nodes, fbs, idn, start) -> dict:
    before = C.OnChain.read(chain, contract, set_id)
    ev = Wt.watch_once(chain, contract, cfg, set_id, nodes, fbs, idn, C.Journal(SCR / "journal_watch.jsonl"),
                       start, send=True)
    after = C.OnChain.read(chain, contract, set_id)
    return {"detected": [d["kind"] for e in ev for d in e.get("discrepancies", [])],
            "proofs": [{k: p.get(k) for k in ("kind", "fn", "status", "gasUsed", "error", "reason")} for e in ev
                       for p in e.get("proofs", [])],
            "eLowEffBefore": str(before.e_low_eff), "eLowEffAfter": str(after.e_low_eff),
            "eEffBefore": str(before.e_eff), "eEffAfter": str(after.e_eff)}


def two_omissions_vector(fbs, idn) -> dict:
    """#18's copy of 0xea0b's row (D20) with BOTH its slash (#4) and its vouch (#2) omitted: two proofs on one row,
    the second one chained with the amendments of the first (review E5, finding 7). Anchors 0x0730 / 0xf7d5: no
    anchor is an agent's wallet (D48-A)."""
    from graph import build_graph, load_schema
    from ppr import certify
    raw = json.load(open(HERE / "schema_reference.json"))
    ref, core = load_schema(raw), raw["filters"]["core"]
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    g = copy.deepcopy(build_graph(fbs, idn, ref, core, [h1, h2]))
    ua, n2, n4 = g.index[(AGENT, 18)], g.index[(AGENT, 2)], g.index[(AGENT, 4)]
    g.rows[ua] = [e for e in g.rows[ua] if e.dst not in (n2, n4)]
    return export_certificate(g, certify(g, Fraction(1, 3)), idn, schema=ref, filter_tags=core, label="two_omissions",
                              policy=reference_policy(2, registry_verified=True),
                              tag_schema_hash=vector_schema_hash("two_omissions"))


def scenario_violations(chain: C.Chain, contract: str) -> list[dict]:
    """D37 violation vectors at both levels, then the watcher (proofs sent ON THE FORK only)."""
    fbs, idn = R.load_mainnet()
    objs = {n: json.loads((HERE / "vectors" / "violations" / f"{n}.json").read_text())
            for n in ("fabricated", "inflated", "dilution", "omitted_negative")}
    objs["two_omissions_one_row"] = two_omissions_vector(fbs, idn)
    out = []
    for level in ("Registry-verified", "Submitter-attested"):
        for name, obj in objs.items():
            if level == "Registry-verified":
                cfg = cfg_from_vector(obj, "viol_" + name)
            else:                                       # same graph, attested policy, its own setId
                cfg = cfg_from_vector(obj, "viol_att_" + name, registry_verified=False, submitters=[DEV_ADDR],
                                      tag_schema_hash=vector_schema_hash("attested:" + name))
            set_id, _ = register(chain, contract, cfg)
            start = chain.block_number()
            r = submit_vector(chain, contract, set_id, obj, cfg)
            row = {"vector": name, "level": level, "submission": r["result"], "reason": r.get("reason"),
                   "gasUsed": r.get("gasUsed")}
            if r["result"] == "ACCEPTED":
                _, nodes, _ = vector_calldata(obj)
                row.update(_prove_all(chain, contract, cfg, set_id, nodes, fbs, idn, start))
            out.append(row)
    return out


def scenario_common(chain: C.Chain, contract: str) -> list[dict]:
    """Common vectors 02-bis / 04-bis (vectors/common/). The toy registries are not on the fork, so the toys run at the
    Submitter-attested level (own setId); the mainnet one runs Registry-verified. Against the contract of `main` this
    records the state BEFORE the D48/R1 fixes (attacks expected to pass); against 02-bis, `expect.submission` holds."""
    import common_vectors as CV
    from graph import Feedback, Identity
    out = []
    for p in sorted((HERE / "vectors" / "common").glob("*.json")):
        obj = json.loads(p.read_text())
        name = p.stem
        real = name == "common_A_mainnet_old_slash_anchor"
        cfg = cfg_from_vector(obj, name) if real else cfg_from_vector(
            obj, "att_" + name, registry_verified=False, submitters=[DEV_ADDR],
            tag_schema_hash=vector_schema_hash("attested:" + name))
        row = {"vector": name, "level": "Registry-verified" if real else "Submitter-attested",
               "expectAfterFix": obj["expect"]["submission"]}
        try:
            set_id, _ = register(chain, contract, cfg)
            start = chain.block_number()
            r = submit_vector(chain, contract, set_id, obj, cfg)
            row.update(result=r["result"], reason=r.get("reason"), gasUsed=r.get("gasUsed"))
            if "resubmission" in obj and r["result"] == "ACCEPTED":      # C: prove the false row, then resubmit
                reg = obj["registry"]
                fbs, idx = [], {}
                for f in reg["feedbacks"]:
                    k = (f["client"], f["agentId"])
                    idx[k] = idx.get(k, 0) + 1
                    fbs.append(Feedback(f["agentId"], f["client"], idx[k], f["value"], f["decimals"], f["tag1"],
                                        f["tag2"], f["revoked"]))
                idn = Identity(block=0, owner={a["agentId"]: a["owner"] for a in reg["agents"]},
                               wallet={a["agentId"]: a["agentWallet"] for a in reg["agents"]})
                _, nodes, _ = vector_calldata(obj)
                row["proof"] = _prove_all(chain, contract, cfg, set_id, nodes, fbs, idn, start)["proofs"]
                again = {**obj, "calldata": obj["resubmission"]["calldata"], "nCert": obj["resubmission"]["nCert"],
                         "expected": {**obj["expected"], **obj["resubmission"]["expected"]}}
                r2 = submit_vector(chain, contract, set_id, again, cfg)
                row["resubmission"] = {"result": r2["result"], "reason": r2.get("reason"),
                                       "expectAfterFix": obj["expect"]["resubmission"]}
                ctl = submit_vector(chain, contract, set_id, {**obj, "calldata": obj["control"]["calldata"]}, cfg)
                row["control"] = {"result": ctl["result"], "reason": ctl.get("reason"), "expectAfterFix": "ACCEPTED"}
        except Exception as e:                                           # one vector never stops the scenario
            row.update(result="ERROR", reason=C.revert_reason(str(e)) if isinstance(e, C.ChainError) else str(e)[:300])
        out.append(row)
    return out


def scenario_service(chain: C.Chain, contract: str) -> list[dict]:
    fbs, idn = R.load_mainnet()
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    raw = json.load(open(HERE / "schema_reference.json"))
    cfg = C.SetConfig(name="mainnet-honest", anchors=[h1, h2], lambdas=[5 * 10**17, 5 * 10**17], alphaN=1, alphaD=3,
                      filter_tags=raw["filters"]["core"], owner=DEV_ADDR, min_refresh=600, slack_refresh=10**6,
                      max_age=30_000, refresh_lead=5_000, registry_verified=True, submitters=[],
                      tag_schema_hash="0x" + C.keccak(b"service").hex())
    set_id, reg = register(chain, contract, cfg)
    st = SCR / "state_service.json"
    st.unlink(missing_ok=True)
    jr = SCR / "journal_service.jsonl"
    jr.unlink(missing_ok=True)
    svc = C.Certifier(cfg, chain, contract, set_id, st, C.Journal(jr))
    out = [reg, svc.run_once(fbs, idn, reason="first certificate")]
    out.append(svc.run_once(fbs, idn, reason="recompute, nothing changed"))
    # growing graph (AM-04.1): a new vouch from anchor 0x0730 to #22 (a support client), written in the fork's registry
    other = C.Chain(chain.rpc, C.Signer(OTHER_ADDR))
    rc = C.Chain(chain.rpc, C.Signer(h1)).send(REPUTATION, "giveFeedback(uint256,int128,uint8,string,string,string,"
                                                           "string,bytes32)", "22", "100", "0", "vouch", "", "", "",
                                                           "0x" + "00" * 32, gas_limit=1_000_000) \
        if _impersonate(chain, h1) else None
    out.append({"registryWrite": "anchor 0x0730 vouches #22 (impersonated on the fork)", "ok": bool(rc and rc["ok"])})
    ev1 = Feedback(agent_id=22, client=h1, index=_last_index(chain, 22, h1), value=100, decimals=0, tag1="vouch",
                   tag2="", revoked=False)
    out.append({"trigger": "NewFeedback 0x0730 -> #22",
                "relevant": C.relevant({"kind": "NewFeedback", "client": h1, "agentId": 22}, svc.support)})
    r = svc.run_once(fbs + [ev1], idn, reason="growing graph: new feedback by an anchor (AM-04.1)")
    out.append(r)
    if r["action"] == "deferred_replacement_rule":        # wait out the window on the fork, then retry
        chain._run("rpc", "anvil_mine", hex(r["waitBlocks"]))
        out.append(svc.run_once(fbs + [ev1], idn, reason="retry after the wait"))
    # a third party resubmits the previous graph (without the new endorsement of #22). In this graph that omission
    # is a DILUTION (0x0730's row has S+ >= GRID): same mass, q = 0, so the replacement rule cannot see it (AM-02.2).
    # The defense loop: the watcher proves it (proveEdge), which credits eLow, and the honest service replaces at once.
    start = chain.block_number()
    cens = _censor_attempt(chain, other, contract, set_id, cfg, fbs, idn, h1, send=True)
    out.append(cens)
    if cens["result"].startswith("ACCEPTED"):
        nodes = C.chain_table(chain, contract, set_id, cfg.anchors)
        ev = Wt.watch_once(chain, contract, cfg, set_id, nodes, fbs + [ev1], idn,
                           C.Journal(SCR / "journal_watch_service.jsonl"), start, send=True)
        oc = C.OnChain.read(chain, contract, set_id)
        out.append({"watcherEvents": [e.get("action") for e in ev],
                    "watcher": [d["kind"] for e in ev for d in e.get("discrepancies", [])],
                    "proofs": [{k: p.get(k) for k in ("kind", "fn", "status", "gasUsed")} for e in ev
                               for p in e.get("proofs", [])], "eLowEffAfter": oc.e_low_eff, "massCur": oc.mass})
        out.append(svc.run_once(fbs + [ev1], idn, reason="honest certificate after the dilution proof"))
    # a feedback by the scanner (zero mass in this set): the trigger filter ignores it
    sc = R.resolve(R.SCANNER, fbs)
    out.append({"trigger": "NewFeedback scanner -> #2", "relevant": C.relevant(
        {"kind": "NewFeedback", "client": sc, "agentId": 2}, svc.support)})
    # a third party front-runs with addNodes (a junk agent, then #23 which we also need): the service re-reads
    # the table from the chain and still certifies (review E4, finding 1)
    junk = node_entry((AGENT, 999_999)) + node_entry((AGENT, 23))
    rc = other.send(contract, C.ADD_NODES_SIG, set_id, "0x" + junk.hex(), gas_limit=500_000)
    assert rc["ok"], "the third-party addNodes must succeed for the scenario to mean anything"
    out.append({"frontRun": "third party addNodes(#999999, #23)", "tx": rc["transactionHash"]})
    _impersonate(chain, h2)
    C.Chain(chain.rpc, C.Signer(h2)).send(REPUTATION, "giveFeedback(uint256,int128,uint8,string,string,string,string,"
                                                      "bytes32)", "23", "100", "0", "vouch", "", "", "",
                                          "0x" + "00" * 32, gas_limit=1_000_000)
    ev2 = Feedback(agent_id=23, client=h2, index=_last_index(chain, 23, h2), value=100, decimals=0, tag1="vouch",
                   tag2="", revoked=False)
    out.append(svc.run_once(fbs + [ev1, ev2], idn, reason="after a third-party addNodes"))
    # nothing changes for maxAge − refreshLead blocks: the identical graph is republished (refresh)
    chain._run("rpc", "anvil_mine", hex(cfg.max_age - cfg.refresh_lead + 1))
    out.append(svc.run_once(fbs + [ev1, ev2], idn, reason="age refresh, identical graph"))
    out.append({"journal": [json.loads(l) for l in jr.read_text().splitlines()]})
    return out


def _impersonate(chain: C.Chain, who: str) -> bool:
    chain._run("rpc", "anvil_impersonateAccount", who)
    chain._run("rpc", "anvil_setBalance", who, hex(100 * 10**18))
    return True


def _last_index(chain: C.Chain, agent: int, client: str) -> int:
    return int(chain.call(REPUTATION, "getLastIndex(uint256,address)(uint64)", str(agent), client).split()[0])


def _censor_attempt(chain, other, contract, set_id, cfg, fbs, idn, h1, send=False) -> dict:
    """A third party submits the honest certificate of the PREVIOUS graph (without the new endorsement of #22): a
    valid sub-solution with fewer positive edges, hence a smaller eUp (the 28/09 rule accepted it on eUp alone)."""
    from graph import build_graph
    from ppr import certify, e_eff
    from export import encode, quality
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors)
    table = C.chain_table(chain, contract, set_id, cfg.anchors)
    oc = C.OnChain.read(chain, contract, set_id)
    al = C.align(g, certify(g, cfg.alpha, lambdas=cfg.lambdas), table, oc.n_cert)
    enc = encode(al.cert, al.nodes, idn)
    args = [set_id, str(al.cert.n), str(e_eff(al.cert)), "0x" + al.new_nodes.hex(), "0x" + enc["vectors"].hex(),
            "0x" + enc["rows"].hex()]
    q, m, _ = quality(al.cert)
    try:
        est = other.estimate(contract, C.SUBMIT_SIG, *args)
        res = "ACCEPTED (same mass and q: the omission is a dilution, AM-02.2)"
        if send:
            _impersonate(chain, OTHER_ADDR)
            assert other.send(contract, C.SUBMIT_SIG, *args, gas_limit=cfg.gas.limit(est))["ok"]
    except C.ChainError as e:
        res = "refused: " + C.revert_reason(str(e))
    return {"censorship": "third party resubmits without the new endorsement of #22", "result": res,
            "eEffCensor": e_eff(al.cert), "eEffCurrent": oc.e_eff, "qCensor": q, "massCensor": m,
            "massCurrent": oc.mass}


def scenario_split(chain: C.Chain, contract: str, n_agents: int = 1300) -> list[dict]:
    """Synthetic registry large enough to need addNodes / reserveCapacity chunks (Submitter-attested: the synthetic
    agents do not exist in the forked registry)."""
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
                      filter_tags=["vouch"], owner=DEV_ADDR, registry_verified=False, submitters=[DEV_ADDR],
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


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fork-url", default="https://rpc1.monad.xyz")
    ap.add_argument("--fork-block", type=int, default=R.BLOCK)
    ap.add_argument("--out", default=str(HERE / "out" / "simulation.json"))
    ap.add_argument("--scenarios", default="vectors,violations,common,service,split")
    args = ap.parse_args(argv)
    todo = args.scenarios.split(",")
    SCR.mkdir(parents=True, exist_ok=True)
    # the first registry reads of a fork go to the remote RPC slot by slot: give cast -> anvil time (MEASURED 01/10:
    # the default timeout failed on the scanner vector, 58 edges re-read)
    os.environ.setdefault("ETH_RPC_TIMEOUT", "900")
    bytecode = build_contract()
    anvil, rpc = start_anvil(args.fork_url, args.fork_block)
    try:
        chain = C.Chain(rpc, C.Signer(DEV_ADDR))
        contract = deploy(chain, bytecode)
        report = {"fork": {"url": args.fork_url, "block": args.fork_block, "network": "monad (anvil)"},
                  "contract": contract}
        for name, fn in (("vectors", scenario_vectors), ("violations", scenario_violations),
                         ("common", scenario_common), ("service", scenario_service), ("split", scenario_split)):
            if name in todo:
                report[name] = fn(chain, contract)
    finally:
        anvil.kill()
    Path(args.out).parent.mkdir(exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=1))
    print(json.dumps({k: report[k] for k in ("vectors", "violations") if k in report}, indent=1)[:12000])


if __name__ == "__main__":
    sys.exit(main())

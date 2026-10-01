"""ANCRE watcher and proof bot (chantier 04-E5): audit every published certificate against the registry.

For one certificate (decoded rows + node table) and the registry state (feedbacks + identity), `audit` returns
the discrepancies, classified by what they break (D32, tour 4 spec):
  FABRICATED        committed edge with no registry edge (or a pair rejected by R6)   -> breaks t <= t* (V5)
  INFLATED          committed w > registry w                                            -> breaks t <= t* (V6) or d
  OMITTED_NEGATIVE  registry negative edge absent from a provided row                  -> breaks d (V13)
  DILUTION          registry positive edge absent, and the committed B⁺ is below the true one -> breaks t (V4)
  SOURCE            agent row whose committed source is not src(j) (R7)                 -> the whole row is wrong
  (INFO) OMITTED_POSITIVE without dilution: harmless for trust (t stays a lower bound), reported, not proven.
Provable on the v0 contract: OMITTED_NEGATIVE and DILUTION (proveOmission widens r). FABRICATED / INFLATED /
SOURCE need proof (v) of chantier 02 (D32): the bot emits the discrepancy with a `proofHint`, never a fake proof.

The registry is read at AUDIT time, not at the certificate block: ERC-8004 stores no block per feedback (AM-2.1),
and proveOmission itself reads the live registry. An edge created after the certificate is therefore reported as an
omission; it is provable (D6: widening, no slashing), and it is also what makes recertification due.

Sending a proof is a real transaction: `prove(..., send=False)` only estimates. Nothing is sent without --send
(and on the mainnet or testnet, without Hugo's agreement).
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import certifier as C
from export import decode_rows, keccak, merkle_proof, node_key
from graph import AGENT, GRID, Identity, build_graph


@dataclass
class Discrepancy:
    kind: str
    u: int
    dst: int | None
    client: str
    agent_id: int | None
    w_committed: int | None
    w_registry: int | None
    feedback_index: int | None = None
    provable_v0: bool = False
    proof: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        return dict(self.__dict__)


MAX_SCAN_V0 = 32     # AnchoredReputation v0 _registryEdge reads only the last 32 feedbacks of a (client, agent) pair


def audit(rows_hex: str, nodes: list, fbs, idn: Identity, cfg: C.SetConfig) -> list[Discrepancy]:
    """nodes: on-chain node table (index -> (kind, value)). v0 rows: bit 0x8000 = source present, no alias/sPlus.

    Committed edge vs registry edge q (R1-R6, full history):
      no registry edge                    FABRICATED
      w > q                               INFLATED   (t or d no longer bounded)
      q > 0 > w                           SIGN_FLIP  (invented distrust, and the row's B⁺ shrinks)
      0 < w < q and committed S⁺ > GRID   DEFLATED   (B⁺ shrinks: the other edges of the row are inflated)
    Registry edge missing from a provided row: OMITTED_NEGATIVE, DILUTION (committed S⁺ + q > GRID, the
    condition of the contract's _widen), OMITTED_POSITIVE. On v0 every omission widens r (proveOmission), so all
    are provable, except pairs with more than MAX_SCAN_V0 feedbacks (the contract may see another weight)."""
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors, owner_fallback=cfg.owner_fallback)
    pairs = g.pairs
    rejected = g.r6_pairs
    by_client: dict[str, dict[int, object]] = {}
    for (c, a), pe in pairs.items():
        by_client.setdefault(c, {})[a] = pe
    history = Counter((f.client, f.agent_id) for f in fbs)
    rows, splus, meta, slices = decode_rows(rows_hex)
    leaves = [keccak(x) for x in slices]
    out: list[Discrepancy] = []
    for pos, u in enumerate(sorted(rows)):
        kind, val = nodes[u]
        src = meta[u][0]
        if kind == AGENT:
            want, _ = idn.source_of(int(val), cfg.owner_fallback)
            if src != want:
                out.append(Discrepancy("SOURCE", u, None, str(src), int(val), None, None))
            client = src
        else:
            client = str(val)
        if client is None:                             # agent without source: its row must be empty
            if rows[u]:
                out.append(Discrepancy("SOURCE", u, None, "none", int(val), None, None))
            continue
        reg = by_client.get(client, {})
        committed = {}
        s_plus = sum(w for _, w, _ in rows[u] if w > 0)
        for dst, w, fi in rows[u]:
            a = nodes[dst][1] if nodes[dst][0] == AGENT else None
            committed[a] = w
            pe = reg.get(a)
            if pe is None:
                why = "controller (R6)" if (client, a) in rejected else "no registry edge"
                out.append(Discrepancy("FABRICATED", u, dst, client, a, w, 0, fi,
                                       proof={"hint": f"proof (v): {why}", "feedbackIndex": fi}))
            elif w > pe.q:
                out.append(Discrepancy("INFLATED", u, dst, client, a, w, pe.q, fi,
                                       proof={"hint": "proof (v): readFeedback gives a lower weight",
                                              "feedbackIndex": pe.feedback_index}))
            elif pe.q > 0 > w:
                out.append(Discrepancy("SIGN_FLIP", u, dst, client, a, w, pe.q, fi,
                                       proof={"hint": "proof (v)/(ii): registry weight is positive"}))
            elif 0 < w < pe.q and s_plus > GRID:
                out.append(Discrepancy("DEFLATED", u, dst, client, a, w, pe.q, fi,
                                       proof={"hint": "proof (ii): lower committed weight shrinks B⁺"}))
        for a, pe in sorted(reg.items()):
            if a in committed or (AGENT, a) == nodes[u]:
                continue
            if pe.q < 0:
                k = "OMITTED_NEGATIVE"
            elif s_plus + pe.q > GRID:
                k = "DILUTION"
            else:
                k = "OMITTED_POSITIVE"
            scan_ok = history.get((client, a), 0) <= MAX_SCAN_V0
            d = Discrepancy(k, u, None, client, a, None, pe.q, pe.feedback_index,
                            provable_v0=scan_ok and meta[u][2] is None)
            if not scan_ok:
                d.proof = {"hint": f"more than {MAX_SCAN_V0} feedbacks on the pair: v0 may read another weight"}
            elif d.provable_v0:
                d.proof = {"fn": "proveOmission", "rowPos": pos, "row": "0x" + slices[pos].hex(),
                           "proof": ["0x" + p.hex() for p in merkle_proof(leaves, pos)], "added": "0x",
                           "nodeKeyU": node_key(nodes[u]), "agentJ": a, "w": pe.q}
            out.append(d)
    return out


PROVE_SIG = "proveOmission(bytes32,uint256,bytes,bytes32[],bytes,bytes32,uint256)"
PRIORITY = {"OMITTED_NEGATIVE": 0, "DILUTION": 1, "OMITTED_POSITIVE": 2}


def prove(chain: C.Chain, contract: str, set_id: str, d: Discrepancy, gas: C.GasPolicy, *, added: bytes = b"",
          send: bool = False) -> dict:
    """Estimate (and only with send=True, submit) the v0 proof of one omission. `added` = the amendments already
    proven on this row in this certificate, (agentId:u32 ‖ w:int16)*, as the contract chains them. Without a
    signer the proof is only prepared (estimating needs a sender)."""
    p = d.proof
    args = [set_id, str(p["rowPos"]), p["row"], "[" + ",".join(p["proof"]) + "]", "0x" + added.hex(),
            p["nodeKeyU"], str(p["agentJ"])]
    res = {"kind": d.kind, "agentJ": d.agent_id, "u": d.u}
    if chain.signer is None:
        return {**res, "status": "prepared", "args": args}
    est = chain.estimate(contract, PROVE_SIG, *args)
    res.update(estimate=est, gasLimit=gas.limit(est))
    if send:
        rc = chain.send(contract, PROVE_SIG, *args, gas_limit=gas.limit(est))
        res.update(tx=rc["transactionHash"], status=rc["ok"], gasUsed=int(rc["gasUsed"], 16))
    return res


def decode_submission(chain: C.Chain, tx_hash: str) -> dict:
    """submitCertificate arguments of a transaction (direct call only; a call through a multisig is undecodable)."""
    out = chain.decode(C.SUBMIT_SIG, chain.tx_input(tx_hash))
    return {"setId": out[0], "nCert": int(out[1].split()[0]), "eMax": int(out[2].split()[0]), "newNodes": out[3],
            "vectors": out[4], "rows": out[5]}


def watch_once(chain: C.Chain, contract: str, cfg: C.SetConfig, set_id: str, nodes: list, fbs, idn: Identity,
               journal: C.Journal, from_block: int, to_block: int | None = None, *, send: bool = False) -> list[dict]:
    """One polling round over (from_block, to_block]: only the CURRENT certificate of the set is audited (a
    replaced one can no longer be proven: its graphRoot is gone). Every error is journaled, never fatal: the
    round goes on and the caller advances from_block. Omissions of a row are proven in priority order (negative,
    dilution, positive), chaining `added` after each success."""
    to_block = to_block if to_block is not None else chain.block_number()
    logs = chain.logs(contract, C.CERT_SUBMITTED, from_block, set_id, to_block=to_block)
    current = C.OnChain.read(chain, contract, set_id).graph_root
    events = []
    for lg in logs:
        root = "0x" + lg["data"][2 + 64:2 + 128].lower()
        if root != current:
            events.append(journal.log(action="skip_replaced", set=cfg.name, tx=lg["transactionHash"]))
            continue
        try:
            sub = decode_submission(chain, lg["transactionHash"])
        except Exception as e:                          # multisig / router: not decodable
            events.append(journal.log(action="undecodable", set=cfg.name, tx=lg["transactionHash"], error=str(e)[:300]))
            continue
        disc = audit(sub["rows"], nodes, fbs, idn, cfg)
        ev = journal.log(action="audit", set=cfg.name, tx=lg["transactionHash"], block=int(lg["blockNumber"], 16),
                         discrepancies=[d.to_json() for d in disc], proofs=[])
        by_row: dict[int, list[Discrepancy]] = {}
        for d in disc:
            if d.provable_v0 and d.proof.get("fn"):
                by_row.setdefault(d.u, []).append(d)
        for u, lst in by_row.items():
            added = b""
            for d in sorted(lst, key=lambda d: (PRIORITY[d.kind], -abs(d.w_registry or 0))):
                try:
                    r = prove(chain, contract, set_id, d, cfg.gas, added=added, send=send)
                except Exception as e:
                    r = {"kind": d.kind, "agentJ": d.agent_id, "u": u, "status": "error",
                         "error": C.revert_reason(str(e))}
                ev["proofs"].append(r)
                if r.get("status") is not True:
                    break                               # later proofs of this row depend on this one
                added += int(d.agent_id).to_bytes(4, "big") + (d.proof["w"] & 0xFFFF).to_bytes(2, "big")
        journal.log(action="proofs", set=cfg.name, tx=lg["transactionHash"], proofs=ev["proofs"])
        events.append(ev)
    return events


def liveness(oc: C.OnChain, head: int, cfg: C.SetConfig) -> str | None:
    """AM-2.12: every payer fails closed after maxAge. Alert well before."""
    if oc.cert_block == 0:
        return "NO_CERT"
    age = head - oc.cert_block
    if age > cfg.max_age:
        return f"STALE (age {age} > maxAge {cfg.max_age})"
    if age > cfg.max_age - cfg.refresh_lead:
        return f"REFRESH_DUE (age {age})"
    if oc.registry_changed:
        return "REGISTRY_CHANGED"
    return None


def main(argv=None):
    """Judging-period loop (13 → 27/10): audit each new certificate of the set, estimate the v0 proofs, alert on
    liveness. Registry data: a from_indexer.py export directory (re-read every round) or the versioned snapshot."""
    import argparse
    import time
    from graph import load_feedbacks_onchain, load_identity_json
    ap = argparse.ArgumentParser(description="ANCRE watcher / proof bot")
    ap.add_argument("--rpc", required=True)
    ap.add_argument("--contract", required=True)
    ap.add_argument("--set-config", required=True, help="SetConfig JSON (certifier.SetConfig.load)")
    ap.add_argument("--set-id", required=True)
    ap.add_argument("--data", help="from_indexer.py output directory; default: versioned snapshot")
    ap.add_argument("--from-block", type=int, required=True, help="start of the watched window (e.g. deployment)")
    ap.add_argument("--interval", type=float, default=30.0)
    ap.add_argument("--journal", default="watch.jsonl")
    ap.add_argument("--from", dest="sender", help="address of the prover (keystore signer)")
    ap.add_argument("--keystore")
    ap.add_argument("--password-env")
    ap.add_argument("--send", action="store_true", help="REALLY send proofs (a real transaction: Hugo's agreement)")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args(argv)
    cfg = C.SetConfig.load(a.set_config)
    signer = C.Signer(a.sender, "keystore", a.keystore, a.password_env) if a.sender and a.keystore else \
        (C.Signer(a.sender) if a.sender else None)
    chain = C.Chain(a.rpc, signer)
    jr = C.Journal(Path(a.journal))
    frm = a.from_block
    table, table_block = None, -1                       # append-only node table, synced incrementally
    while True:
        if a.data:
            fbs = load_feedbacks_onchain(Path(a.data) / "onchain_feedbacks.json")
            idn = load_identity_json(Path(a.data) / "identity.json")
        else:
            import run_mainnet as R
            fbs, idn = R.load_mainnet()
        head = chain.block_number()
        try:
            nodes = C.chain_table(chain, a.contract, a.set_id, cfg.anchors, table_block + 1, head, table)
            table, table_block = nodes, head
            watch_once(chain, a.contract, cfg, a.set_id, nodes, fbs, idn, jr, frm, head,
                       send=a.send and signer is not None)
            alert = liveness(C.OnChain.read(chain, a.contract, a.set_id), head, cfg)
            if alert:
                jr.log(action="alert", set=cfg.name, alert=alert, head=head)
        except Exception as e:                          # never die: journal and retry the same window next round
            jr.log(action="error", set=cfg.name, error=str(e)[:500], fromBlock=frm, head=head)
            time.sleep(a.interval)
            continue
        frm = head + 1                                  # logs were read up to head exactly: no double processing
        if a.once:
            return 0
        time.sleep(a.interval)


if __name__ == "__main__":
    import sys
    sys.exit(main())

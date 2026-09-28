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

import json
from dataclasses import dataclass, field
from pathlib import Path

import certifier as C
from export import decode_rows, keccak
from graph import ADDR, AGENT, ANCHOR, GRID, Identity, build_graph

KIND = {ANCHOR: 3, AGENT: 1, ADDR: 2}


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
        return {k: v for k, v in self.__dict__.items()}


def node_key(key) -> str:
    kind, v = key
    val = int(v) if kind == AGENT else int(str(v), 16)
    return "0x" + ((KIND[kind] << 248) | val).to_bytes(32, "big").hex()


def merkle_proof(leaves: list[bytes], pos: int) -> list[bytes]:
    """Path for AnchoredReputation._verifyMerkle (pairs keccak(l ‖ r), an odd last element goes up unhashed)."""
    proof, level = [], list(leaves)
    while len(level) > 1:
        if pos & 1:
            proof.append(level[pos - 1])
        elif pos + 1 < len(level):
            proof.append(level[pos + 1])
        nxt = [keccak(level[2 * i] + level[2 * i + 1]) for i in range(len(level) // 2)]
        if len(level) % 2:
            nxt.append(level[-1])
        level, pos = nxt, pos >> 1
    return proof


def row_slices(rows_hex: str) -> list[bytes]:
    """Raw bytes of each row in the calldata (leaves are keccak of these), v0 and v1 layouts."""
    from export import HDR_ALIAS, HDR_NE_MASK, HDR_SPLUS, HDR_SRC
    b = bytes.fromhex(rows_hex[2:])
    W, n = b[0], int.from_bytes(b[1:5], "big")
    off, out = 5, []
    for _ in range(n):
        start = off
        hdr = int.from_bytes(b[off + W:off + W + 2], "big")
        off += W + 2
        if hdr & HDR_ALIAS:
            off += W
        else:
            off += (20 if hdr & HDR_SRC else 0) + (4 if hdr & HDR_SPLUS else 0) + (hdr & HDR_NE_MASK) * (W + 6)
        out.append(b[start:off])
    return out


def audit(rows_hex: str, nodes: list, fbs, idn: Identity, cfg: C.SetConfig) -> list[Discrepancy]:
    """nodes: on-chain node table (index -> (kind, value)). v0 rows: bit 0x8000 = source present, no alias/sPlus."""
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors, owner_fallback=cfg.owner_fallback)
    pairs = g.pairs
    rejected = {(r["client"], r["agent"]) for r in g.rejected if r["raison"].startswith("controleur")}
    by_client: dict[str, dict[int, object]] = {}
    for (c, a), pe in pairs.items():
        by_client.setdefault(c, {})[a] = pe
    rows, splus, meta, leaves = decode_rows(rows_hex)
    slices = row_slices(rows_hex)
    order = sorted(rows)
    out: list[Discrepancy] = []
    for pos, u in enumerate(order):
        kind, val = nodes[u]
        src = meta[u][0]
        if kind == AGENT:
            want, _ = idn.source_of(int(val), cfg.owner_fallback)
            client = src
            if src != want:
                out.append(Discrepancy("SOURCE", u, None, str(src), int(val), None, None))
        else:
            client = str(val)
        if client is None:                             # agent without source: its row must be empty
            if rows[u]:
                out.append(Discrepancy("SOURCE", u, None, "none", int(val), None, None))
            continue
        reg = by_client.get(client, {})
        committed = {}
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
        true_plus = sum(pe.q for pe in reg.values() if pe.q > 0)
        committed_bplus = max(GRID, splus[u])
        for a, pe in sorted(reg.items()):
            if a in committed or (AGENT, a) == nodes[u]:
                continue
            if pe.q < 0:
                k = "OMITTED_NEGATIVE"
            elif committed_bplus < max(GRID, true_plus):
                k = "DILUTION"
            else:
                k = "OMITTED_POSITIVE"
            d = Discrepancy(k, u, None, client, a, None, pe.q, pe.feedback_index, provable_v0=k != "OMITTED_POSITIVE")
            if d.provable_v0 and meta[u][2] is None:
                d.proof = {"fn": "proveOmission", "rowPos": pos, "row": "0x" + slices[pos].hex(),
                           "proof": ["0x" + p.hex() for p in merkle_proof(leaves, pos)], "added": "0x",
                           "nodeKeyU": node_key(nodes[u]), "agentJ": a}
            out.append(d)
    return out


PROVE_SIG = "proveOmission(bytes32,uint256,bytes,bytes32[],bytes,bytes32,uint256)"


def prove(chain: C.Chain, contract: str, set_id: str, d: Discrepancy, gas: C.GasPolicy, *, send: bool = False) -> dict:
    """Estimate (and only with send=True, submit) the v0 proof of one discrepancy. Several omissions on the same
    row need the `added` chain of previous amendments: this bot proves the first one per row per certificate."""
    p = d.proof
    args = [set_id, str(p["rowPos"]), p["row"], "[" + ",".join(p["proof"]) + "]", p["added"], p["nodeKeyU"],
            str(p["agentJ"])]
    est = chain.estimate(contract, PROVE_SIG, *args)
    res = {"kind": d.kind, "agentJ": d.agent_id, "estimate": est, "gasLimit": gas.limit(est)}
    if send:
        rc = chain.send(contract, PROVE_SIG, *args, gas_limit=gas.limit(est))
        res.update(tx=rc["transactionHash"], status=rc["status"] in ("0x1", 1), gasUsed=int(rc["gasUsed"], 16))
    return res


def decode_submission(chain: C.Chain, tx_hash: str) -> dict:
    """submitCertificate arguments of a transaction (direct call only; a call through a multisig is undecodable)."""
    inp = chain._run("tx", tx_hash, "input")
    import subprocess
    out = subprocess.run([chain.cast, "decode-calldata", C.SUBMIT_SIG, inp], check=True, capture_output=True,
                         text=True).stdout.strip().split("\n")
    return {"setId": out[0], "nCert": int(out[1].split()[0]), "eMax": int(out[2].split()[0]), "newNodes": out[3],
            "vectors": out[4], "rows": out[5]}


def watch_once(chain: C.Chain, contract: str, cfg: C.SetConfig, set_id: str, nodes: list, fbs, idn: Identity,
               journal: C.Journal, from_block: int, *, send: bool = False) -> list[dict]:
    """One polling round: every CertificateSubmitted of the set since from_block is audited; provable
    discrepancies are estimated (sent only with send=True)."""
    logs = chain.logs(contract, "CertificateSubmitted(bytes32 indexed,uint64 indexed,uint256,bytes32,bytes32,"
                                "bytes32,uint32,uint32)", from_block)
    events = []
    for lg in logs:
        if lg["topics"][1].lower() != set_id.lower():
            continue
        sub = decode_submission(chain, lg["transactionHash"])
        disc = audit(sub["rows"], nodes, fbs, idn, cfg)
        ev = journal.log(action="audit", set=cfg.name, tx=lg["transactionHash"], block=int(lg["blockNumber"], 16),
                         discrepancies=[d.to_json() for d in disc if d.kind != "OMITTED_POSITIVE"],
                         info=sum(1 for d in disc if d.kind == "OMITTED_POSITIVE"))
        proved_rows = set()
        for d in disc:
            if d.provable_v0 and d.proof and d.u not in proved_rows:
                proved_rows.add(d.u)
                ev.setdefault("proofs", []).append(prove(chain, contract, set_id, d, cfg.gas, send=send))
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
    ap.add_argument("--from-block", type=int, default=0)
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
    while True:
        if a.data:
            fbs = load_feedbacks_onchain(Path(a.data) / "onchain_feedbacks.json")
            idn = load_identity_json(Path(a.data) / "identity.json")
        else:
            import run_mainnet as R
            fbs, idn = R.load_mainnet()
        head = chain.block_number()
        nodes = C.chain_table(chain, a.contract, a.set_id, cfg.anchors)
        watch_once(chain, a.contract, cfg, a.set_id, nodes, fbs, idn, jr, frm, send=a.send and signer is not None)
        alert = liveness(C.OnChain.read(chain, a.contract, a.set_id), head, cfg)
        if alert:
            jr.log(action="alert", set=cfg.name, alert=alert, head=head)
        frm = head + 1
        if a.once:
            return 0
        time.sleep(a.interval)


if __name__ == "__main__":
    import sys
    sys.exit(main())

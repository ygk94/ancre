"""ANCRE watcher and proof bot (chantier 04-E5, aligned on AnchoredReputation v1 by the integration session, 01/10).

For one certificate (decoded rows + node table) and the registry state (feedbacks + identity), `audit` returns
the discrepancies, classified by what they break (D32, tour 4 spec), each with the v1 proof that corrects it:
  FABRICATED        committed edge with no registry edge (or a pair rejected by R6)   -> breaks t <= t* (V5)   proveEdge (v)
  INFLATED          committed w > registry w                                            -> breaks t or d (V6)   proveEdge (v)
  SIGN_FLIP         committed w < 0 < registry w                                        -> invented distrust    proveEdge
  OVERSTATED_NEG    committed w < registry q < 0 (review W7): B⁻ inflated, siblings' distrust divided  proveEdge
  DEFLATED          0 < committed w < registry w, committed S⁺ > GRID                   -> siblings inflated    proveEdge
  OMITTED_NEGATIVE  registry negative edge absent from a provided row                  -> breaks d (V13)       proveEdge (i)
  DILUTION          registry positive edge absent, committed S⁺ + q above max(GRID, sPlus) -> breaks t (V4)    proveEdge (i)
  SOURCE            agent row whose committed source is not src(j) (R7)                 -> whole row wrong      proveWallet (iv)
  (INFO) ANCHOR_SOURCE  agent row sourced by an anchor (D48-A): refused at submission by the corrected contract, not
                    provable afterwards (the source holds); its edges are still audited
  (INFO) OMITTED_POSITIVE without dilution, DEFLATED_HARMLESS: t stays a lower bound; proving them would only widen
  eUp (the distrust side) of an honest set, so the bot reports them and never proves them.

The registry is read at AUDIT time, not at the certificate block: ERC-8004 stores no block per feedback (AM-2.1),
and proveEdge itself reads the live registry. An edge created after the certificate is therefore reported as an
omission; it is provable (D6: widening, no slashing), and it is also what makes recertification due.

Sending a proof is a real transaction: `prove(..., send=False)` only estimates. Nothing is sent without --send
(and on the mainnet or testnet, without Hugo's agreement).
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import certifier as C
from export import decode_rows, keccak, merkle_proof
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
    provable: bool = False
    proof: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        return dict(self.__dict__)


PROVE_EDGE_SIG = "proveEdge(bytes32,(uint256,bytes,bytes32[]),(uint256,bytes,bytes32[]),bytes,uint256)"
PROVE_WALLET_SIG = "proveWallet(bytes32,(uint256,bytes,bytes32[]),(uint256,bytes,bytes32[]),bytes)"
# proof order on one row: distrust first (V13), then what inflates trust, then dilution and deflation
PRIORITY = {"SOURCE": -1, "OMITTED_NEGATIVE": 0, "FABRICATED": 1, "INFLATED": 1, "SIGN_FLIP": 2,
            "OVERSTATED_NEG": 2, "DILUTION": 3, "DEFLATED": 4}
# a failed proof that leaves the row unchanged must not stop the row (review BREAK), except these
ROW_FATAL = ("BadProof(5)", "BadProof(23)")


def _ref(pos: int, slices, leaves) -> dict:
    return {"pos": pos, "row": "0x" + slices[pos].hex(), "path": ["0x" + p.hex() for p in merkle_proof(leaves, pos)]}


def audit(rows_hex: str, nodes: list, fbs, idn: Identity, cfg: C.SetConfig) -> list[Discrepancy]:
    """nodes: on-chain node table (index -> (kind, value)); rows: unified v1 calldata (ENCODING.md §3.2).

    Committed edge vs registry edge q (R1-R6, full history):
      no registry edge                    FABRICATED
      w > q                               INFLATED   (t or d no longer bounded)
      q > 0 > w                           SIGN_FLIP  (invented distrust, and the row's B⁺ shrinks)
      0 < w < q and committed S⁺ > GRID   DEFLATED   (B⁺ shrinks: the other edges of the row are inflated)
    Registry edge missing from a provided row: OMITTED_NEGATIVE, DILUTION (committed S⁺ + q > max(GRID, sPlus): the
    renormalisation lowers the committed entries), OMITTED_POSITIVE (info). Every row of the certificate is audited,
    alias copies included: a fact on a shared wallet is proven once per copy (AM-02.5)."""
    g = build_graph(fbs, idn, cfg.schema(), cfg.filter_tags, cfg.anchors, owner_fallback=cfg.owner_fallback)
    pairs = g.pairs
    anchors = {a.lower() for a in cfg.anchors}
    rejected = g.r6_pairs
    by_client: dict[str, dict[int, object]] = {}
    for (c, a), pe in pairs.items():
        by_client.setdefault(c, {})[a] = pe
    history = Counter((f.client, f.agent_id) for f in fbs)
    rows, splus, meta, slices = decode_rows(rows_hex)
    leaves = [keccak(x) for x in slices]
    order = sorted(rows)
    pos_of = {u: i for i, u in enumerate(order)}
    out: list[Discrepancy] = []
    for pos, u in enumerate(order):
        kind, val = nodes[u]
        src, via_owner, ref = meta[u]
        r = _ref(pos, slices, leaves)
        srow = _ref(pos_of[ref], slices, leaves) if ref is not None else {"pos": 0, "row": "0x", "path": []}
        if kind == AGENT:
            want = idn.source_of(int(val), cfg.owner_fallback)
            have = (src, "owner" if via_owner else "wallet") if src is not None else (None, "")
            if have != want:                           # the row's client changed: void it (the edges are moot)
                out.append(Discrepancy("SOURCE", u, None, str(src), int(val), None, None, provable=True,
                                       proof={"fn": "proveWallet", "r": r, "src": srow, "committed": have,
                                              "registry": want}))
                continue
            if src is not None and src.lower() in anchors:
                # D48-A: such a row must not exist, but its source HOLDS in the registry, so proveWallet would revert
                # NothingToProve (only a contract without AnchorAsSource accepts it). Report it, and keep auditing
                # its edges below: a fabricated or inflated edge of that row is still provable by proveEdge.
                out.append(Discrepancy("ANCHOR_SOURCE", u, None, str(src), int(val), None, None, provable=False,
                                       proof={"hint": "agent row sourced by an anchor: refused at submission by a "
                                                      "D48 contract (AnchorAsSource); not provable afterwards"}))
            client = src
        else:
            client = str(val)
        if client is None:                             # agent without source: an empty row, nothing else to audit
            continue
        reg = by_client.get(client, {})
        committed = {}
        s_plus = sum(w for _, w, _ in rows[u] if w > 0)
        b_plus = max(GRID, splus[u])
        # the contract's positive floor gP = max(GRID, DECLARED sPlus); an undeclared sPlus is GRID, not S⁺ (review W6)
        g_floor = max(GRID, splus[u]) if splus[u] != s_plus else GRID

        def disc(k, dst, a, w, q, fi, provable=True, hint=""):
            d = Discrepancy(k, u, dst, client, a, w, q, fi, provable=provable)
            d.proof = {"fn": "proveEdge", "r": r, "src": srow, "agentJ": a, "wCommitted": w or 0, "wRegistry": q or 0,
                       "feedbacksOnPair": history.get((client, a), 0), "rowSPlus": s_plus,
                       "rowBPlus": b_plus, "rowG": g_floor} if provable else {"hint": hint}
            out.append(d)
        for dst, w, fi in rows[u]:
            a = nodes[dst][1] if nodes[dst][0] == AGENT else None
            committed[a] = w
            pe = reg.get(a)
            if pe is None:
                disc("FABRICATED", dst, a, w, 0, fi)
            elif w > pe.q:
                disc("INFLATED", dst, a, w, pe.q, fi)
            elif pe.q > 0 > w:
                disc("SIGN_FLIP", dst, a, w, pe.q, fi)
            elif w < pe.q < 0:                         # review W7: a slash committed too negative inflates B⁻ and
                disc("OVERSTATED_NEG", dst, a, w, pe.q, fi)   # divides the distrust of the row's other negatives
            elif 0 < w < pe.q:
                if s_plus - w + pe.q > b_plus:
                    disc("DEFLATED", dst, a, w, pe.q, fi)
                else:
                    disc("DEFLATED_HARMLESS", dst, a, w, pe.q, fi, provable=False, hint="t stays a lower bound")
        omitted = [(a, pe) for a, pe in sorted(reg.items()) if a not in committed and (AGENT, a) != nodes[u]]
        # review W1: dilution is a property of the ROW: omissions that each fit under B⁺ can exceed it together, and
        # the contract bills them through a chain of proofs (the first ones amend, the last ones bill)
        dilutes = side(s_plus, 0, sum(pe.q for _, pe in omitted if pe.q > 0), g_floor)[0] > 0
        for a, pe in omitted:
            if pe.q < 0:
                disc("OMITTED_NEGATIVE", None, a, 0, pe.q, pe.feedback_index)
            elif dilutes:
                disc("DILUTION", None, a, 0, pe.q, pe.feedback_index)
            else:
                disc("OMITTED_POSITIVE", None, a, 0, pe.q, pe.feedback_index, provable=False,
                     hint="no dilution: t stays a lower bound; proving it only widens eUp")
    return out


def _tuple(ref: dict, amended: bool) -> str:
    path = [] if amended else ref["path"]           # the path is ignored once the row is amended
    return f"({ref['pos']},{ref['row']},[{','.join(path)}])"


def prove(chain: C.Chain, contract: str, set_id: str, d: Discrepancy, gas: C.GasPolicy, *,
          amends: list[tuple[int, int, int]] = (), send: bool = False) -> dict:
    """Estimate (and only with send=True, submit) the v1 proof of one discrepancy. `amends` = the amendments already
    proven on this row in this certificate, [(agentId, wCommitted, wNow)] in the contract's order. Without a signer
    the proof is only prepared (estimating needs a sender)."""
    p = d.proof
    am = "0x" + b"".join(a.to_bytes(4, "big") + (wc & 0xFFFF).to_bytes(2, "big") + (wn & 0xFFFF).to_bytes(2, "big")
                         for a, wc, wn in amends).hex()
    if p["fn"] == "proveWallet":
        sig, args = PROVE_WALLET_SIG, [set_id, _tuple(p["r"], bool(amends)), _tuple(p["src"], False), am]
    else:
        sig, args = PROVE_EDGE_SIG, [set_id, _tuple(p["r"], bool(amends)), _tuple(p["src"], False), am,
                                     str(p["agentJ"])]
    res = {"kind": d.kind, "agentJ": d.agent_id, "u": d.u, "fn": p["fn"]}
    if chain.signer is None:
        return {**res, "status": "prepared", "args": args}
    est = chain.estimate(contract, sig, *args)
    res.update(estimate=est, gasLimit=gas.limit(est))
    if send:
        rc = chain.send(contract, sig, *args, gas_limit=gas.limit(est))
        res.update(tx=rc["transactionHash"], status=rc["ok"], gasUsed=int(rc["gasUsed"], 16))
    return res


WAD = 10**18


def side(S: int, wo: int, wn: int, G: int) -> tuple[int, int]:
    """Python transcription of AnchoredReputation._side: (dec, inc) of a normalised row side whose sum goes from S to
    S − wo + wn with budget max(G, sum), WAD, rounded up."""
    B, S2 = max(S, G), S - wo + wn
    B2, rest = max(S2, G), S - wo
    den = B * B2
    dn = (rest * (B2 - B) if B2 > B else 0) + (wo * B2 - wn * B if wo * B2 > wn * B else 0)
    up = (rest * (B - B2) if B > B2 else 0) + (wn * B - wo * B2 if wn * B > wo * B2 else 0)
    return -(-dn * WAD // den), -(-up * WAD // den)


def still_dilutes(amends: list[tuple[int, int, int]], d: Discrepancy, pending: int = 0) -> bool:
    """DILUTION / DEFLATED were classified on the COMMITTED row; earlier proofs may have changed its positive sum.
    Prove iff the contract would bill a positive-side DECREASE (`_side`, review W6: budget max(gP, S_amended) with
    gP = max(GRID, declared sPlus), not the committed B⁺) for this edge, or for this edge plus the `pending` positive
    weight of the other dilutions still to prove on the row (review W1: the first links of a chain bill nothing)."""
    s = d.proof["rowSPlus"]
    cur = {}
    for a, wc, wn in amends:
        s += max(wn, 0) - max(wc, 0)
        cur[a] = wn
    wo = max(cur.get(d.agent_id, d.w_committed or 0), 0)
    wn = max(d.w_registry or 0, 0)
    g = d.proof.get("rowG", d.proof["rowBPlus"])
    return side(s, wo, wn, g)[0] > 0 or (pending > 0 and side(s, wo, wn + pending, g)[0] > 0)


def amend(amends: list[tuple[int, int, int]], d: Discrepancy) -> list[tuple[int, int, int]]:
    """The contract's _amend: the entry of agentJ replaced in place (keeping its committed weight), else appended."""
    out = list(amends)
    for i, (a, wc, _) in enumerate(out):
        if a == d.agent_id:
            out[i] = (a, wc, d.w_registry or 0)
            return out
    return out + [(d.agent_id, d.w_committed or 0, d.w_registry or 0)]


EDGE_PROVEN = "EdgeProven(bytes32 indexed,uint256 indexed,uint256 indexed,int256,int256,uint256,uint256)"
ROW_VOIDED = "RowVoided(bytes32 indexed,uint256 indexed,uint256,uint256)"
ROW_STATE = "rowStateOf(bytes32,uint256)((bytes32,uint64,uint64,uint64,bool))"


def amends_bytes(amends: list[tuple[int, int, int]]) -> bytes:
    return b"".join(a.to_bytes(4, "big") + (wc & 0xFFFF).to_bytes(2, "big") + (wn & 0xFFFF).to_bytes(2, "big")
                    for a, wc, wn in amends)


def rebuild_amends(events: list[tuple[int, int, int, int]]) -> dict[int, list[tuple[int, int, int]]]:
    """The contract's amendment list of each row, replayed from its EdgeProven events (node u, agentJ, wNew,
    committed weight of agentJ in the row or 0), in chain order: an entry keeps the committed weight and takes the
    latest wNew (the contract's _amend)."""
    out: dict[int, list[tuple[int, int, int]]] = {}
    for u, agent_j, w_new, committed in events:
        out[u] = amend(out.get(u, []), Discrepancy("", u, None, "", agent_j, committed, w_new))
    return out


def chain_amends(chain: C.Chain, contract: str, set_id: str, rows_hex: str, nodes: list, cert_block: int,
                 journal: C.Journal) -> dict[int, tuple[list[tuple[int, int, int]], bool]]:
    """Review AMENDS: {u: (amends, voided)} of the CURRENT certificate, rebuilt from EdgeProven / RowVoided since its
    block and checked against rowStateOf(setId, u).h = keccak(leaf ‖ amends). A row whose rebuilt list does not match
    is reported and left out (a proof built on it would revert BadProof(5))."""
    rows, _, _, slices = decode_rows(rows_hex)
    order = sorted(rows)
    committed_w = {u: {nodes[d][1]: w for d, w, _ in rows[u] if nodes[d][0] == AGENT} for u in rows}
    evs, voided = [], set()
    for lg in sorted(chain.logs(contract, EDGE_PROVEN, cert_block, set_id) +
                     chain.logs(contract, ROW_VOIDED, cert_block, set_id),
                     key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16))):
        u = int(lg["topics"][2], 16)
        if len(lg["topics"]) == 3:                      # RowVoided
            voided.add(u)
            continue
        a = int(lg["topics"][3], 16)
        w_new = int(lg["data"][2 + 64:2 + 128], 16)
        w_new -= (1 << 256) if w_new >= 1 << 255 else 0
        evs.append((u, a, w_new, committed_w.get(u, {}).get(a, 0)))
    rebuilt = rebuild_amends(evs)
    out = {}
    for u in set(rebuilt) | voided:
        am = rebuilt.get(u, [])
        if u not in voided and am:
            leaf = keccak(slices[order.index(u)])
            h = chain.call(contract, ROW_STATE, set_id, str(u)).strip("()").split(",")[0].strip()
            if "0x" + keccak(leaf + amends_bytes(am)).hex() != h.lower():
                journal.log(action="amends_mismatch", set=set_id, u=u, rebuilt=am)
                out[u] = ([], True)                     # cannot extend this row safely: skip it
                continue
        out[u] = (am, u in voided)
    return out


def decode_submission(chain: C.Chain, tx_hash: str) -> dict:
    """submitCertificate arguments of a transaction (direct call only; a call through a multisig is undecodable)."""
    return decode_input(chain, chain.tx_input(tx_hash))


def decode_input(chain: C.Chain, inp: str) -> dict:
    if inp[:10] != C._selector(C.SUBMIT_SIG):
        raise ValueError("not a direct submitCertificate call")
    out = chain.decode(C.SUBMIT_SIG, inp)
    return {"setId": out[0], "nCert": int(out[1].split()[0]), "eMax": int(out[2].split()[0]), "newNodes": out[3],
            "vectors": out[4], "rows": out[5]}


def watch_once(chain: C.Chain, contract: str, cfg: C.SetConfig, set_id: str, nodes: list, fbs, idn: Identity,
               journal: C.Journal, from_block: int, to_block: int | None = None, *, send: bool = False,
               reaudit: bool = True) -> list[dict]:
    """One polling round over (from_block, to_block]: only the CURRENT certificate of the set is audited (a
    replaced one can no longer be proven: its graphRoot is gone). Every error is journaled, never fatal: the
    round goes on and the caller advances from_block. The discrepancies of a row are proven in priority order
    (source, negative, fabrication/inflation, dilution), chaining the amendments after each success."""
    to_block = to_block if to_block is not None else chain.block_number()
    logs = chain.logs(contract, C.CERT_SUBMITTED, from_block, set_id, to_block=to_block)
    oc = C.OnChain.read(chain, contract, set_id)
    current = oc.graph_root
    root_of = lambda lg: "0x" + lg["data"][2 + 64:2 + 128].lower()
    if reaudit and oc.cert_block and not any(root_of(lg) == current for lg in logs):
        # review ONCE: the CURRENT certificate is re-audited every round against fresh data (revocations, softened
        # feedbacks, controller or wallet changes after its submission); proofs already on chain are skipped (AMENDS)
        logs = logs + [lg for lg in chain.logs(contract, C.CERT_SUBMITTED, oc.cert_block, set_id,
                                               to_block=oc.cert_block) if root_of(lg) == current]
    events = []
    for lg in logs:
        root = root_of(lg)
        if root != current:
            events.append(journal.log(action="skip_replaced", set=cfg.name, tx=lg["transactionHash"]))
            continue
        inp = chain.tx_input(lg["transactionHash"])     # review SWALLOW: a transport error RAISES (window kept)
        try:
            sub = decode_input(chain, inp)
        except Exception as e:                          # multisig / router: the input itself is not decodable
            events.append(journal.log(action="undecodable", set=cfg.name, tx=lg["transactionHash"], error=str(e)[:300]))
            continue
        disc = audit(sub["rows"], nodes, fbs, idn, cfg)
        ev = journal.log(action="audit", set=cfg.name, tx=lg["transactionHash"], block=int(lg["blockNumber"], 16),
                         discrepancies=[d.to_json() for d in disc], proofs=[])
        by_row: dict[int, list[Discrepancy]] = {}
        for d in disc:
            if d.provable:
                by_row.setdefault(d.u, []).append(d)
        # the amendments on chain matter only for a row with something to prove: a clean audit scans no proof logs
        # (alchemy-live: on a 10-block eth_getLogs RPC, the scan since an old certificate is ~10^5 calls)
        onchain = chain_amends(chain, contract, set_id, sub["rows"], nodes, int(lg["blockNumber"], 16),
                               journal) if by_row else {}
        for u, lst in by_row.items():
            amends, voided = onchain.get(u, ([], False))  # review AMENDS: start from the proofs already on chain
            if voided:
                ev["proofs"].append({"u": u, "status": "skipped", "reason": "row voided on chain (RowVoided)"})
                continue
            done = {a: wn for a, _, wn in amends}
            todo = sorted((d for d in lst if not (d.agent_id in done and done[d.agent_id] == (d.w_registry or 0))),
                          key=lambda d: (PRIORITY[d.kind], -abs(d.w_registry or 0)))
            for i, d in enumerate(todo):
                pending = sum(max(x.w_registry or 0, 0) for x in todo[i + 1:] if x.kind == "DILUTION") \
                    if d.kind == "DILUTION" else 0
                if d.kind in ("DILUTION", "DEFLATED") and not still_dilutes(amends, d, pending):
                    ev["proofs"].append({"kind": d.kind, "agentJ": d.agent_id, "u": u, "status": "skipped",
                                         "reason": "no dilution any more on the amended row"})
                    continue
                try:
                    r = prove(chain, contract, set_id, d, cfg.gas, amends=amends, send=send)
                except Exception as e:
                    r = {"kind": d.kind, "agentJ": d.agent_id, "u": u, "status": "error",
                         "error": C.revert_reason(str(e))}
                ev["proofs"].append(r)
                if r.get("status") == "error" and not any(f in r.get("error", "") for f in ROW_FATAL):
                    continue                            # review BREAK: a reverted estimate changed nothing on chain
                if r.get("status") is not True or d.kind == "SOURCE":
                    break                               # later proofs of this row depend on this one (or it is void)
                amends = amend(amends, d)
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
    """Judging-period loop (13 → 27/10): audit each new certificate of the set, estimate the v1 proofs, alert on
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
    signer = C.Signer.build(a.sender, a.keystore, a.password_env)
    chain = C.Chain(a.rpc, signer)
    jr = C.Journal(Path(a.journal))
    frm = a.from_block
    table, table_block = None, -1                       # append-only node table, synced incrementally
    head = None
    while True:
        try:                                            # review DIES: reading the export and the head inside the try
            if a.data:
                fbs = load_feedbacks_onchain(Path(a.data) / "onchain_feedbacks.json")
                idn = load_identity_json(Path(a.data) / "identity.json")
            else:
                import run_mainnet as R
                fbs, idn = R.load_mainnet()
            head = chain.block_number()
            nodes = C.chain_table(chain, a.contract, a.set_id, cfg.anchors, table_block + 1, head, table)
            table, table_block = nodes, head
            watch_once(chain, a.contract, cfg, a.set_id, nodes, fbs, idn, jr, frm, head,
                       send=a.send and signer is not None)
            alert = liveness(C.OnChain.read(chain, a.contract, a.set_id), head, cfg)
            if alert:
                jr.log(action="alert", set=cfg.name, alert=alert, head=head)
        except Exception as e:                          # never die: journal and retry the same window next round
            jr.log(action="error", set=cfg.name, error=str(e)[:500], fromBlock=frm, head=head)
            if a.once:
                return 1                                # review DIES: --once reports the failed round
            time.sleep(a.interval)
            continue
        frm = head + 1                                  # logs were read up to head exactly: no double processing
        if a.once:
            return 0
        time.sleep(a.interval)


if __name__ == "__main__":
    import sys
    sys.exit(main())

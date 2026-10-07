#!/usr/bin/env python3
"""08-bis vectors (internal tool): proof sequences and refusals that the 02-bis / 04-bis vectors do not cover
(AM-08.22: amendments, proveWallet, declared omissions under formula X; canonical form; A1d).

Built with the reference solver's normative pipeline (solver/common_vectors.py: graph.build_graph -> ppr.certify ->
export.export_certificate), read only. Output: docs/erc/drafts/measurements/x08/*.json, then replayed on the
reference contract with mock registries (scratch copy of contracts/, test X08Vectors.t.sol, see journal 08bis E2),
whose results go to measurements/forge-08bis-2026-10-07.json and are merged by build-assets.py.

    solver/.venv/bin/python docs/erc/drafts/build-x08.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "solver"))
import common_vectors as CV  # noqa: E402
from graph import AGENT, GRID  # noqa: E402
from ppr import power_from_zero, verify  # noqa: E402

OUT = ROOT / "docs" / "erc" / "drafts" / "measurements" / "x08"
A1, A2, W = CV.A1, CV.A2, CV.W


def node_of(obj: dict, agent: int) -> int:
    return next(n["i"] for n in obj["nodes"] if n.get("agentId") == agent)


def amend_bytes(amends: list[tuple[int, int, int]]) -> str:
    return "0x" + "".join(f"{a:08x}{wc % 65536:04x}{wn % 65536:04x}" for a, wc, wn in amends)


def seq_declared_omission() -> dict:
    """Formula X (section 6.1). Row of agent 60 (client W(60)): true row {62: +10000, 63: +5000, 64: +5000}; the
    certificate commits {62, 63} and declares sPlus = 20000 (64 omitted under the declaration, honest). Then:
    (1) W(60) revokes its feedback on 62 -> proveEdge(62): the committed edge fell; the budget may shrink, so every
        other entry, the omitted one included, may grow (K8);
    (2) proveEdge(64): the declared omission is revealed; the aggregator cannot tell it from a new edge: worst case;
    (3) W(60) endorses agent 65, which did not exist at certification -> proveEdge(65): a new positive edge dilutes
        every committed entry (A2b);
    (4) the original certificate is resubmitted: it contradicts the fact (W(60), 62) -> 0: ProvenRowResubmitted."""
    reg = (CV.Reg().agent(60).agent(62).agent(63).agent(64).agent(65)
           .rate(A1, 60, 100, "vouch").rate(A2, 60, 100, "vouch")
           .rate(W(60), 62, 100, "vouch").rate(W(60), 63, 50, "vouch").rate(W(60), 64, 50, "vouch"))

    def omit_64(g, cert):
        u = cert.node_map.index(g.index[(AGENT, 60)])
        j = cert.node_map.index(g.index[(AGENT, 64)])
        cert.rows[u] = [e for e in cert.rows[u] if e[0] != j]
        assert cert.splus[u] == 2 * GRID
        cert.t, cert.iterations = power_from_zero(cert.n, cert.anchors, cert.alphaN, cert.alphaD, cert.rows,
                                                  cert.splus, cert.lambdas)
    v = CV.vector("seq_declared_omission", reg, [A1, A2], "08-bis: formula X, see build-x08.py", [],
                  mutate_cert=omit_64, registry_verified=False)
    u = node_of(v, 60)
    row = next(r for r in v["rows"] if r["u"] == u)
    assert int(row["sPlus"]) == 20000 and sum(e["w"] for e in row["edges"] if e["w"] > 0) == 15000
    v["sequence"] = [
        {"op": "submit", "calldata": "calldata", "expect": "ACCEPTED"},
        {"op": "revoke", "client": W(60), "agentId": 62, "index": 1},
        {"op": "proveEdge", "row": u, "agentId": 62, "wNew": 0, "amends": amend_bytes([])},
        {"op": "proveEdge", "row": u, "agentId": 64, "wNew": 5000, "amends": amend_bytes([(62, 10000, 0)])},
        {"op": "feedback", "client": W(60), "agentId": 65, "value": 100, "decimals": 0, "tag1": "vouch"},
        {"op": "proveEdge", "row": u, "agentId": 65, "wNew": 10000,
         "amends": amend_bytes([(62, 10000, 0), (64, 0, 5000)])},
        {"op": "submit", "calldata": "calldata", "expect": f"ProvenRowResubmitted({u})"},
    ]
    return v


def seq_prove_wallet() -> dict:
    """Section 6.2 and the liveness of a source fact (section 5.10). Agent 70 (wallet W(70)) is endorsed by both
    anchors and endorses 71. Its wallet changes: proveWallet voids the row and records the source fact; the same
    certificate is then refused; the wallet comes back, clearSourceFact clears the fact, and the same certificate
    is accepted again."""
    reg = (CV.Reg().agent(70).agent(71).rate(A1, 70, 100, "vouch").rate(A2, 70, 100, "vouch")
           .rate(W(70), 71, 100, "vouch"))
    v = CV.vector("seq_prove_wallet", reg, [A1, A2], "08-bis: proveWallet and clearSourceFact", [70, 71],
                  registry_verified=False)
    u = node_of(v, 70)
    other = "0x" + "c7" * 20
    v["sequence"] = [
        {"op": "submit", "calldata": "calldata", "expect": "ACCEPTED"},
        {"op": "setWallet", "agentId": 70, "wallet": other},
        {"op": "proveWallet", "row": u, "amends": "0x"},
        {"op": "submit", "calldata": "calldata", "expect": f"ProvenRowResubmitted({u})"},
        {"op": "setWallet", "agentId": 70, "wallet": W(70)},
        {"op": "clearSourceFact", "node": u, "src": W(70), "viaOwner": False},
        {"op": "submit", "calldata": "calldata", "expect": "ACCEPTED"},
    ]
    return v


def _rows_split(blob: bytes):
    W_ = blob[0]
    n = int.from_bytes(blob[1:5], "big")
    off, out = 5, []
    for _ in range(n):
        hdr = int.from_bytes(blob[off + W_:off + W_ + 2], "big")
        ln = W_ + 2 + (20 if hdr & 0x8000 else 0) + (4 if hdr & 0x4000 else 0) + (W_ if hdr & 0x2000 else 0) \
            + (hdr & 0x0FFF) * (W_ + 6)
        out.append(bytearray(blob[off:off + ln]))
        off += ln
    return W_, out


def _rows_join(W_: int, rows: list[bytearray]) -> str:
    return "0x" + (bytes([W_]) + len(rows).to_bytes(4, "big") + b"".join(rows)).hex()


def refusals() -> dict:
    """Single submissions built from common_2hop (Registry-verified, open), each one changed in one way."""
    base = json.loads((ROOT / "solver" / "vectors" / "common" / "common_2hop.json").read_text())
    W_, rows = _rows_split(bytes.fromhex(base["calldata"]["rows"][2:]))
    u50 = node_of(base, 50)
    ri = next(i for i, r in enumerate(base["rows"]) if r["u"] == u50)
    cases = []
    # (a) SPLUS equal to the committed positive sum
    r = rows[ri]
    hdr = int.from_bytes(r[W_:W_ + 2], "big")
    assert hdr & 0x8000 and not hdr & 0x4000
    s_pos = sum(e["w"] for e in base["rows"][ri]["edges"] if e["w"] > 0)
    na = r[:W_] + (hdr | 0x4000).to_bytes(2, "big") + r[W_ + 2:W_ + 22] + s_pos.to_bytes(4, "big") + r[W_ + 22:]
    cases.append({"id": "splus_equal_to_committed_sum", "section": "5.4",
                  "change": f"row {ri} (agent 50) declares SPLUS = {s_pos}, its committed positive sum",
                  "rows": _rows_join(W_, rows[:ri] + [na] + rows[ri + 1:]), "expect": f"NotCanonical({ri})"})
    # (b) SRC bit with the zero address
    nb = r[:W_ + 2] + b"\x00" * 20 + r[W_ + 22:]
    cases.append({"id": "src_zero_address", "section": "5.4",
                  "change": f"row {ri} (agent 50) carries SRC = 0x0", "rows": _rows_join(W_, rows[:ri] + [nb] +
                                                                                       rows[ri + 1:]),
                  "expect": f"NotCanonical({ri})"})
    # (c) inline newNodes on an open set
    cases.append({"id": "inline_nodes_on_open_set", "section": "5.1",
                  "change": "the node entries are passed as newNodes of submitCertificate on an open set",
                  "rows": base["calldata"]["rows"], "newNodes": base["calldata"]["newNodes"], "expect": "BadNodes()"})
    # (d) non-zero fingerprint on an anchor
    vec = bytearray(bytes.fromhex(base["calldata"]["vectors"][2:]))
    k = len(base["set"]["anchors"])
    vec[k * 8 + 7] = 1
    cases.append({"id": "anchor_fingerprint_not_zero", "section": "5.3",
                  "change": "ownerFp of anchor node 0 set to 1", "rows": base["calldata"]["rows"],
                  "vectors": "0x" + vec.hex(),
                  "expect": "EdgeMismatch(115792089237316195423570985008687907853269984665640564039457584007913129639935, 0)"})
    return {"base": "common_2hop", "cases": cases}


def add_pos(v: dict) -> dict:
    """`pos` = rank of the row in the certificate (Merkle leaf index), next to `row` (its node index u)."""
    rank = {r["u"]: i for i, r in enumerate(v["rows"])}
    for st in v.get("sequence", []):
        if "row" in st:
            st["pos"] = rank[st["row"]]
    return v


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in (("seq_declared_omission", add_pos(seq_declared_omission())),
                      ("seq_prove_wallet", add_pos(seq_prove_wallet())),
                      ("refusals", refusals())):
        (OUT / f"{name}.json").write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n")
        print("wrote", name)


if __name__ == "__main__":
    main()

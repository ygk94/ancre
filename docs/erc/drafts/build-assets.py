#!/usr/bin/env python3
"""Build docs/erc/assets/erc-0000/vectors/ from the reference solver's vectors (internal tool, not shipped).

Chantier 08-bis, 2026-10-07. Sources (read only):
  solver/vectors/*.json                 certificates (ancre-cert-v1)
  solver/vectors/violations/*.json      violation vectors (D37)
  solver/vectors/common/*.json          common vectors 02-bis / 04-bis (D48 A, B, C, R1, D50)
  docs/erc/drafts/measurements/simulate-2026-10-07.json
                                        what the reference contract did with them on an anvil fork of chain 143
                                        (solver/simulate.py --scenarios vectors,violations,common, 2026-10-07)
  docs/erc/drafts/measurements/forge-08bis-2026-10-07.json  (optional)
                                        08-bis vectors replayed on the mock registries (see journal 08bis, E2)
Every output file is JSON with English descriptions; nothing in it needs the reference code to be read.

    python3 docs/erc/drafts/build-assets.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOLVER = ROOT / "solver" / "vectors"
OUT = ROOT / "docs" / "erc" / "assets" / "erc-0000" / "vectors"
MEAS = ROOT / "docs" / "erc" / "drafts" / "measurements"
SIM = json.loads((MEAS / "simulate-2026-10-07.json").read_text())
FORK = SIM["fork"]["block"]

IMPL = "reference AnchoredReputation (lot 02-bis, main of 2026-10-07)"
NET = "anvil fork of chain 143"

CERT_DESC = {
    "mainnet_honest_d20": "Real registry state (chain 143, identity block in `identityBlock`). Two demo anchors, neither "
    "of which is the source of an agent. The client 0xea0b... is the agentWallet of agent 18 (and of two other agents) "
    "and endorses agents 2 and 3, and slashes agent 4: row copy (section 3.5) gives agent 18 that row, which restores "
    "the only honest two-hop chain. Registry-verified, open.",
    "mainnet_slash_anchor": "Real registry state. Anchors 0x0730... and 0x794c..., neither of which is an agent's "
    "source (section 3.5). 0x0730... endorses agent 18, which carries the row of its wallet 0xea0b... (row copy): "
    "+10000 to agents 2 and 3, and a slash -10000 on agent 4 that dominates a later positive feedback under another "
    "tag (section 3.3). 0x794c... endorses agent 4. With minAnchors = 2 no agent has a positive trustRobust; agent 4 "
    "has distrust 2/27. Registry-verified, open. The violation vectors are built on this graph.",
    "mainnet_scanner_preD15": "Real registry state with an automated scanner as anchor and its measurement tags "
    "declared as ENDORSEMENT: the set is valid but leaks trust into farm agents (Security Considerations, "
    "measurement leakage). Registry-verified, open.",
    "mainnet_em_d44": "Real registry state of a platform whose worker agents have agentWallet = 0 after transfer: with "
    "ownerFallback = true their rows resolve through their owner (VIA_OWNER rows, section 5.4). The two anchors own "
    "two massive agents, which therefore carry no row (section 3.5) and pay the truncation margin on eUp. Includes a "
    "33-byte tag and ties between tags resolved by the highest feedbackIndex. Registry-verified, open.",
    "toy_alias_owner_rowmax": "Synthetic identity. One wallet shared by several agents (alias rows), a VIA_OWNER row, "
    "the wallet-wins rule, and a row capped at ROW_MAX = 256 positive edges with a declared sPlus (declared-omission "
    "margin in eUp). Submitter-attested.",
    "toy_alpha_1_2": "Synthetic. alpha = 1/2. One anchor without edges (trivial column), a negative edge, non-round "
    "weights, a 2-cycle. Submitter-attested.",
    "toy_alpha_1_3": "Synthetic. Same graph with alpha = 1/3. Submitter-attested.",
    "toy_alpha_1_4": "Synthetic. Same graph with alpha = 1/4. Submitter-attested.",
    "toy_truncated": "Synthetic. A node with trust and no row (truncated): its margin (1 - alpha) t_u enters r. "
    "Submitter-attested.",
}

VIOL_DESC = {
    "fabricated": "An endorsement 0x0730... -> agent 4 that does not exist in the registry (feedbackIndex 7).",
    "inflated": "The slash of 0xea0b... on agent 4 committed with weight -1 instead of -10000 in agent 18's copy.",
    "dilution": "Edge 18 -> 3 omitted from agent 18's row without declaring sPlus: B+ shrinks from 20000 to 10000 and "
    "agent 2 receives twice its share.",
    "omitted_negative": "The slash of 0xea0b... on agent 4 omitted from agent 18's copy: distrust on agent 4 drops "
    "to 0.",
    "two_omissions_one_row": "Agent 18's copy of 0xea0b...'s row with BOTH its slash on agent 4 and its endorsement of "
    "agent 2 omitted (no sPlus declared): two proofs on one row, the second one starting from the amendments of the "
    "first (section 6). Anchors: the two demo anchors of mainnet_honest_d20.",
}

COMMON_DESC = {
    "common_A_anchor_not_source": "Section 3.5. Anchor X is also the agentWallet of agent 10 (S). S carries NO row; "
    "agent 20 (F), endorsed by X alone, has mass in X's column only: trustRobust(F) = 0 with minAnchors = 2.",
    "common_A_attack_anchor_copy": "Section 3.5 (attack). Same registry; the certificate gives S the row of its wallet, "
    "the anchor X. It is arithmetically valid (t <= F(t)), and F would get mass in A1's column through S, defeating "
    "the leave-one-out. MUST be refused (AnchorAsSource).",
    "common_A_mainnet_old_slash_anchor": "Section 3.5 (attack, real data). An earlier demonstration set used "
    "0xea0b... as an anchor although it is the agentWallet of agent 18, which carried the copy of the anchor's row. "
    "MUST be refused (AnchorAsSource). Needs the real registry at `expect.forkBlock`.",
    "common_B_controller_negative": "Section 3.3 rule 4 and section 8.2. Anchor A2 is an operator of the owner of agent "
    "30 and slashes it; P, the approved address of agent 30, slashes it too. Both are current controllers: their "
    "negative edges are KEPT. A2's anchor row sets the certified veto bit, and the approval of A2 is also a veto "
    "(strict mode). Agent 31 passes.",
    "common_C_proven_row_resubmitted": "Section 5.10. Step 1: the anchor row of A1 carries a fabricated edge to agent 41 "
    "(Submitter-attested: accepted), then proveEdge(row of A1, agentJ = 41) proves it false and records the fact "
    "(A1, 41) -> 0. Step 2 (`resubmission`): the same false row with other bytes (one empty row dropped) MUST be "
    "refused (ProvenRowResubmitted). `control`: the honest certificate is accepted.",
    "common_2hop": "Motivation and Rationale (beyond one hop). H1 (agent 50) is endorsed by both anchors and endorses "
    "H2 (agent 51) through its agentWallet; no anchor rates H2. H2 has mass in both columns and passes the policy, "
    "while a one-hop list of trusted raters says 'unknown'.",
    "common_2hop_one_anchor": "Control: H1 endorsed by ONE anchor only. H2 has mass in one column: trustRobust = 0, "
    "it does not pass.",
    "common_R1_address_zero_node": "Section 5.1. The node table of common_2hop plus an address node for the zero "
    "address with a row. MUST be refused (BadNodes).",
}


def level(v: dict) -> str:
    return "RegistryVerified" if v["set"]["policy"]["registryVerified"] else "SubmitterAttested"


def keep(v: dict, keys=("identityBlock", "set", "nCert", "nodes", "rows", "vectors", "expected", "calldata")) -> dict:
    out = {}
    for k in keys:
        if k in v:
            out[k] = v[k]
    out.get("expected", {}).pop("residualMode", None)
    return out


def node_entries(v: dict) -> None:
    """Open sets: inline newNodes are refused (section 5.1). Expose the entries under `calldata.nodeEntries`
    (for addNodes, or for newNodes on a set with listed submitters) and leave `newNodes` empty when the set is open."""
    cd = v.get("calldata")
    if not cd:
        return
    cd["nodeEntries"] = cd.get("newNodes", "0x")
    if not v["set"]["policy"]["submitters"]:
        cd["newNodes"] = "0x"


def sim(kind: str, name: str, lvl: str | None = None) -> dict:
    for r in SIM[kind]:
        if r["vector"] == name and (lvl is None or r["level"] == lvl):
            return r
    raise KeyError((kind, name, lvl))


def certificates() -> None:
    d = OUT / "certificates"
    d.mkdir(parents=True, exist_ok=True)
    for name, desc in CERT_DESC.items():
        v = json.loads((SOLVER / f"{name}.json").read_text())
        s = sim("vectors", name)
        assert s["pass"] and s["result"] == "ACCEPTED", name
        o = {"format": "anchored-reputation-cert-v1", "id": name, "description": desc, "level": level(v),
             "acceptedBy": {"implementation": IMPL, "network": NET, "block": FORK, "date": "2026-10-07",
                            "submitCertificateGas": s["gasUsed"], "eEffOnChain": str(s["eEffOnChain"]),
                            "rootsMassAndQEqual": bool(s["graphRootMatch"] and s["vectorRootMatch"] and s["massMatch"]
                                                       and s["qMatch"]),
                            "mutatedVectorRejected": s["mutated"]}}
        o.update(keep(v))
        node_entries(o)
        (d / f"{name}.json").write_text(json.dumps(o, indent=1, ensure_ascii=False) + "\n")


def _key(nd: dict):
    return nd.get("agentId", nd.get("address"))


def proof_steps(v: dict, honest: dict) -> list[dict]:
    """The proveEdge calls that a watcher sends: for every committed row, each agent whose committed weight differs
    from the honest (registry) row of the same client."""
    hn = {nd["i"]: _key(nd) for nd in honest["nodes"]}
    vn = {nd["i"]: _key(nd) for nd in v["nodes"]}
    hrows = {hn[r["u"]]: {hn[e["dst"]]: e["w"] for e in r["edges"]} for r in honest["rows"]}
    steps = []
    for r in v["rows"]:
        want = hrows.get(vn[r["u"]], {})
        have = {vn[e["dst"]]: e["w"] for e in r["edges"]}
        for agent in sorted(set(want) | set(have), key=lambda a: (want.get(a, 0) >= 0, a)):
            if want.get(agent, 0) != have.get(agent, 0):
                steps.append({"row": r["u"], "agentId": agent, "wNew": want.get(agent, 0)})
    return steps


def violations() -> None:
    d = OUT / "violations"
    d.mkdir(parents=True, exist_ok=True)
    honest = json.loads((SOLVER / "mainnet_slash_anchor.json").read_text())
    objs = {n: json.loads((SOLVER / "violations" / f"{n}.json").read_text()) for n in
            ("fabricated", "inflated", "dilution", "omitted_negative")}
    honest_of = {n: "mainnet_slash_anchor.json" for n in objs}
    sys.path.insert(0, str(ROOT / "solver"))
    import run_mainnet as R  # noqa: E402  (reads solver/data, no network)
    import simulate as S  # noqa: E402
    fbs, idn = R.load_mainnet()
    objs["two_omissions_one_row"] = S.two_omissions_vector(fbs, idn)
    honest_of["two_omissions_one_row"] = "mainnet_honest_d20.json"
    for name, v in objs.items():
        h = json.loads((SOLVER / honest_of[name]).read_text())
        steps = proof_steps(v, h)
        proofs = []
        for lvl, tag in (("Registry-verified", "RegistryVerified"), ("Submitter-attested", "SubmitterAttested")):
            s = sim("violations", name, lvl)
            assert s["pass"], (name, lvl)
            if s["submission"] != "ACCEPTED":
                continue
            assert len(s["proofs"]) == len(steps), (name, s["proofs"], steps)
            proofs.append({"level": tag, "steps": steps,
                           "measured": {"eLowEffBefore": s["eLowEffBefore"], "eLowEffAfter": s["eLowEffAfter"],
                                        "eEffBefore": s["eEffBefore"], "eEffAfter": s["eEffAfter"],
                                        "proofGas": [p["gasUsed"] for p in s["proofs"]]}})
        rv = sim("violations", name, "Registry-verified")
        at_sub = ("refused: " + rv["reason"]) if rv["submission"] == "REJECTED" else \
            "accepted at both levels (completeness is not checkable)"
        o = {"format": "anchored-reputation-cert-v1", "id": name,
             "description": "Arithmetically valid certificate (t <= F(t)) whose committed graph is NOT dominated by "
                            "the registry. " + VIOL_DESC[name],
             "level": "RegistryVerified"}
        o.update(keep(v))
        node_entries(o)
        o["violation"] = {"kind": name, "honestVector": honest_of[name],
                          "atSubmission": {"RegistryVerified": at_sub, "SubmitterAttested": "accepted"},
                          "proofs": proofs,
                          "measuredOn": {"implementation": IMPL, "network": NET, "block": FORK, "date": "2026-10-07"},
                          "note": "SubmitterAttested runs use the same rows and vectors on a set with "
                                  "registryVerified = false and one listed submitter; their setId differs."}
        (d / f"{name}.json").write_text(json.dumps(o, indent=1, ensure_ascii=False) + "\n")


def common() -> None:
    d = OUT / "common"
    d.mkdir(parents=True, exist_ok=True)
    for name, desc in COMMON_DESC.items():
        v = json.loads((SOLVER / "common" / f"{name}.json").read_text())
        s = sim("common", name)
        assert s["pass"], name
        o = {"format": "anchored-reputation-cert-v1", "id": name, "description": desc, "level": level(v)}
        o.update(keep(v, ("identityBlock", "set", "nCert", "nodes", "rows", "vectors", "expected", "calldata",
                          "registry", "expect", "attack", "resubmission", "control")))
        node_entries(o)
        o["replayedBy"] = {
            "implementation": IMPL,
            "mockRegistries": "contracts/test/CommonVectors.t.sol (Registry-verified on mocks, 2026-10-06)",
            "fork": {"network": NET, "block": FORK, "date": "2026-10-07",
                     "level": s["level"], "result": s.get("result"), "reason": s.get("reason")},
        }
        if "resubmission" in s:
            o["replayedBy"]["fork"]["resubmission"] = s["resubmission"]["reason"]
        (d / f"{name}.json").write_text(json.dumps(o, indent=1, ensure_ascii=False) + "\n")


ERRORS = ["NotCanonical(uint256)", "AnchorAsSource(uint256)", "ProvenRowResubmitted(uint256)", "BadNodes()",
          "EdgeMismatch(uint256,uint256)", "NodeExists(bytes32)", "NotSubmitter()", "NotSubSolution(uint256,uint256)"]


def decode_error(hexs: str) -> str:
    sys.path.insert(0, str(OUT.parent))
    from verify import keccak256  # the independent checker's own Keccak
    b = bytes.fromhex(hexs[2:])
    for sig in ERRORS:
        if keccak256(sig.encode())[:4] == b[:4]:
            n = sig.count(",") + 1 if "()" not in sig else 0
            args = [int.from_bytes(b[4 + 32 * i:36 + 32 * i], "big") for i in range(n)]
            return sig.split("(")[0] + "(" + ", ".join(str(a) for a in args) + ")"
    raise ValueError(hexs)


def forge_log() -> dict:
    out: dict = {}
    for line in (MEAS / "forge-08bis-2026-10-07.log").read_text().splitlines():
        line = line.strip()
        if not line.startswith("X08|"):
            continue
        _, name, step, key, val = line.split("|")
        if val.startswith("0x") and key in ("submit", "proveEdge", "proveWallet", "clearSourceFact"):
            val = decode_error(val)
        out.setdefault(name, {}).setdefault(int(step), {})[key] = val
    return out


X08_DESC = {
    "seq_declared_omission": "Section 6.1, formula X. The row of agent 60 (client W60) truly endorses 62 (+10000), 63 "
    "(+5000) and 64 (+5000); the certificate commits 62 and 63 and declares sPlus = 20000 (64 omitted under the "
    "declaration, honest). Then W60 revokes its feedback on 62 and the decrease is proven (the budget may shrink, so "
    "every other entry may grow); the declared omission of 64 is revealed (indistinguishable from a new edge: worst "
    "case); W60 endorses agent 65, created after certification, and that new edge is proven (it dilutes every "
    "committed entry); finally the original certificate is resubmitted and refused by the proven facts (section "
    "5.10). Submitter-attested; the registry block is replayed, then the sequence.",
    "seq_prove_wallet": "Sections 6.2 and 5.10. Agent 70 (wallet W70), endorsed by both anchors, endorses 71. Its "
    "agentWallet changes: proveWallet voids the row and records the source fact; the same certificate is then refused "
    "(ProvenRowResubmitted). The wallet is set back, clearSourceFact clears the fact, and the same certificate is "
    "accepted again. Submitter-attested.",
}


def x08() -> None:
    """08-bis sequences and refusals, with the outcomes measured on the reference contract (mock registries)."""
    log = forge_log()
    d = OUT / "sequences"
    d.mkdir(parents=True, exist_ok=True)
    src = MEAS / "x08"
    for name, desc in X08_DESC.items():
        v = json.loads((src / f"{name}.json").read_text())
        o = {"format": "anchored-reputation-cert-v1", "id": name, "description": desc, "level": level(v)}
        o.update(keep(v, ("identityBlock", "set", "nCert", "nodes", "rows", "vectors", "expected", "calldata",
                          "registry")))
        node_entries(o)
        seq = []
        for i, st in enumerate(v["sequence"]):
            st = dict(st)
            m = log[name].get(i)
            if m:
                st["measured"] = {k: m[k] for k in ("submit", "proveEdge", "proveWallet", "clearSourceFact", "eLowEff",
                                                    "eEff") if k in m}
            if st["op"] == "submit":
                assert st["measured"]["submit"] == st["expect"], (name, i, st)
            seq.append(st)
        o["sequence"] = seq
        o["measuredOn"] = {"implementation": IMPL, "registries": "mock ERC-8004 registries (contracts/test/utils/Mocks.sol)",
                           "date": "2026-10-07", "log": "docs/erc/drafts/measurements/forge-08bis-2026-10-07.log"}
        (d / f"{name}.json").write_text(json.dumps(o, indent=1, ensure_ascii=False) + "\n")
    ref = json.loads((src / "refusals.json").read_text())
    for i, c in enumerate(ref["cases"]):
        got = log[c["id"]][i]["submit"]
        assert got == c["expect"], (c["id"], got)
        c["measured"] = got
    ref["description"] = ("Single submissions, each one the certificate of common/common_2hop.json changed in one way "
                          "(`change`). Every case MUST be refused with the error in `expect` (section 10). `rows`, "
                          "`vectors` and `newNodes`, when present, replace the base calldata; otherwise the base "
                          "calldata is used and the node entries go through addNodes first (open set).")
    ref["base"] = "common/common_2hop.json"
    ref["measuredOn"] = {"implementation": IMPL, "registries": "mock ERC-8004 registries", "date": "2026-10-07"}
    (OUT / "refusals.json").write_text(json.dumps(ref, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    certificates()
    violations()
    common()
    x08()
    print("written to", OUT)

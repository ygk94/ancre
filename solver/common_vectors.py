"""Common vectors of chantiers 02-bis and 04-bis (D48, D50): solver/vectors/common/*.json, format ancre-cert-v1.

Each vector is SELF-CONTAINED, so the contract tests can replay it on mock registries (contracts/test/utils/Mocks.sol)
at the Registry-verified level:
  registry.agents[]     {agentId, owner, agentWallet, approved}            -> MockIdentity.mint / setWallet / approve
  registry.operators[]  {owner, operator}                                  -> MockIdentity.setOperator
  registry.feedbacks[]  {client, agentId, value, decimals, tag1, tag2, revoked}, in feedbackIndex order per pair
                        (index = rank of the feedback among those of the same (client, agentId), from 1)
                                                                           -> vm.prank(client); giveFeedback(...)
  expect.submission     "ACCEPTED" or the custom error the contract must revert with (e.g. "AnchorAsSource(5)")
  expect.read[agentId]  {contributions, trustRobust, distrust, vetoBits, vetoByApproval, passesAnchorPolicy}: what
                        assess / passesAnchorPolicy must say after an accepted submission (policy of the set: θ = 1e-3,
                        ρ = 1/2, m = 2, strict; vetoBits = certified veto bit per anchor column (anchor row w <= vetoMax);
                        vetoByApproval = an anchor is getApproved(j) or an operator of ownerOf(j) (D48-B, strict mode))
  attack                for a refused vector: what was changed from the honest certificate and why it must fail
The certificate part (set, nodes, rows, vectors, expected, calldata) is the usual vector (FORMAT.md §1), produced by the
normative pipeline graph.build_graph -> ppr.certify -> export.export_certificate, then re-verified by export.check_file.

Cases (D48 A/B/C, D50 second hop):
  common_A_anchor_not_source          X is an anchor AND the wallet of S; the solver gives S no row (ACCEPTED)
  common_A_attack_anchor_copy         same graph + S carrying X's row (the pre-D48 copy): AnchorAsSource(u_S)
  common_A_mainnet_old_slash_anchor   the 01/10 demo vector rebuilt on the 06/10 snapshot: #18 carries the row of the
                                      anchor 0xea0b (its wallet): AnchorAsSource(u_18); fork only (real registry)
  common_B_controller_negative        an anchor made operator of the owner, and the agent's own approved address, both
                                      slash it: both negative edges kept, veto bit + vetoByApproval (ACCEPTED)
  common_C_proven_row_resubmitted     first: a fabricated edge in the anchor row (Submitter-attested, provable by
                                      proveEdge (v)); second: the same false row with other bytes changed (an extra
                                      empty row, other vectors): ProvenRowResubmitted(u) once the first is proven
  common_2hop                         H1 endorsed by TWO anchors, H1 endorses H2, nobody else rates H2: H2 passes
                                      (mass in both columns) while a one-hop trust list says "unknown" (D50)
  common_2hop_one_anchor              control: H1 endorsed by ONE anchor: H2 fails the leave-one-out (AM-10.6)
Usage: .venv/bin/python common_vectors.py   (writes and re-checks vectors/common/)
"""
from __future__ import annotations

import copy
import json
from fractions import Fraction
from pathlib import Path

from export import check_file_obj, export_certificate, reference_policy, vector_schema_hash
from graph import ADDR, AGENT, ANCHOR, GRID, WAD, ZERO, Edge, Feedback, Identity, build_graph, load_schema
from ppr import certify, contributions, distrust, e_eff, trust_robust, verify

HERE = Path(__file__).parent
OUT = HERE / "vectors" / "common"
RAW = json.load(open(HERE / "schema_reference.json"))
SCHEMA, CORE = load_schema(RAW), RAW["filters"]["core"]
ALPHA = Fraction(1, 3)
A1, A2, X = "0x" + "a1" * 20, "0x" + "a2" * 20, "0x" + "a3" * 20          # anchors (never an agent's wallet, but X)
O = lambda i: "0x" + f"{0xB000 + i:040x}"                                # owners
W = lambda i: "0x" + f"{0xC000 + i:040x}"                                # agent wallets


class Reg:
    """A tiny registry: agents + feedbacks, turned into (Feedback list, Identity) and into the `registry` block."""

    def __init__(self):
        self.agents: dict[int, dict] = {}
        self.ops: list[tuple[str, str]] = []
        self.fbs: list[dict] = []

    def agent(self, j: int, owner: str | None = None, wallet: str | None = None, approved: str = ZERO):
        self.agents[j] = {"agentId": j, "owner": owner or O(j), "agentWallet": wallet if wallet is not None else W(j),
                          "approved": approved}
        return self

    def operator(self, owner: str, op: str):
        self.ops.append((owner, op))
        return self

    def rate(self, client: str, j: int, value: int, tag: str, decimals: int = 0, revoked: bool = False):
        self.fbs.append({"client": client, "agentId": j, "value": value, "decimals": decimals, "tag1": tag, "tag2": "",
                         "revoked": revoked})
        return self

    def build(self) -> tuple[list[Feedback], Identity]:
        idx: dict[tuple[str, int], int] = {}
        fbs = []
        for f in self.fbs:
            k = (f["client"], f["agentId"])
            idx[k] = idx.get(k, 0) + 1
            fbs.append(Feedback(agent_id=f["agentId"], client=f["client"], index=idx[k], value=f["value"],
                                decimals=f["decimals"], tag1=f["tag1"], tag2="", revoked=f["revoked"]))
        idn = Identity(block=0, owner={j: a["owner"] for j, a in self.agents.items()},
                       wallet={j: a["agentWallet"] for j, a in self.agents.items()},
                       approved={j: a["approved"] for j, a in self.agents.items() if a["approved"] != ZERO})
        for o, op in self.ops:
            idn.apply_operator(o, op, True)
        return fbs, idn

    def block(self) -> dict:
        return {"agents": list(self.agents.values()),
                "operators": [{"owner": o, "operator": op} for o, op in self.ops], "feedbacks": self.fbs}


def read_expectations(g, cert, idn: Identity, policy: dict, agents: list[int]) -> dict:
    """What the contract must read after submission (ppr reading + veto, D8/D33/D39/D48-B)."""
    inv = {gi: ci for ci, gi in enumerate(cert.node_map)}
    anchors = [str(g.nodes[s][1]) for s in g.anchors]
    theta, m = int(policy["theta"]), policy["minAnchors"]
    rho_n, rho_d, veto_max = policy["rhoN"], policy["rhoD"], policy["vetoMax"]
    out = {}
    for j in agents:
        ci = inv.get(g.index.get((AGENT, j)))
        c = contributions(cert, ci) if ci is not None else [0] * cert.k
        tr = trust_robust(c, m)
        d = distrust(cert, ci) if ci is not None else 0
        bits = [ci is not None and any(dst == ci and w <= veto_max for dst, w, _ in cert.rows.get(a, []))
                for a in range(cert.k)]                  # anchor a is certificate node a
        ops = idn.operators.get(idn.owner.get(j, ""), set())
        by_appr = [a for a in anchors if a == idn.approved.get(j) or a in ops]
        ok = (not any(bits) and not by_appr and tr >= theta and rho_d * (d + e_eff(cert)) <= rho_n * tr)
        out[str(j)] = {"contributions": [str(x) for x in c], "trustRobust": str(tr), "distrust": str(d),
                       "vetoBits": bits, "vetoByApproval": by_appr, "passesAnchorPolicy": ok}
    return out


def vector(label: str, reg: Reg, anchors: list[str], notes: str, read: list[int], *, mutate=None,
           mutate_cert=None, expect: str = "ACCEPTED", attack: dict | None = None, registry_verified: bool = True,
           extra: dict | None = None) -> dict:
    fbs, idn = reg.build()
    g = build_graph(fbs, idn, SCHEMA, CORE, anchors)
    if mutate:
        g = mutate(copy.deepcopy(g))
    cert = certify(g, ALPHA)
    if mutate_cert:
        mutate_cert(g, cert)
        cert.r, cert.e, cert.d, errs = verify(cert)
        assert not errs, errs
    pol = reference_policy(2, registry_verified=registry_verified)
    obj = export_certificate(g, cert, idn, schema=SCHEMA, filter_tags=CORE, policy=pol, label=label, notes=notes,
                             tag_schema_hash=vector_schema_hash(label))
    obj["registry"] = reg.block()
    obj["expect"] = {"submission": expect}
    if expect == "ACCEPTED":
        obj["expect"]["read"] = read_expectations(g, cert, idn, pol, read)
    if attack:
        obj["attack"] = attack
    if extra:
        obj.update(extra)
    check_file_obj(obj, label)
    return obj


def node_u(obj: dict, agent: int) -> int:
    return next(n["i"] for n in obj["nodes"] if n.get("agentId") == agent)


def cases() -> dict[str, dict]:
    out = {}
    # ---------------------------------------------------------------- A: an anchor never emits through an agent
    # X (anchor, stolen key) is the agentWallet of S (#10); A1 endorses S; X endorses the farm agent F (#20)
    rA = Reg().agent(10, wallet=X).agent(20).rate(A1, 10, 100, "vouch").rate(X, 20, 100, "vouch")
    out["common_A_anchor_not_source"] = vector(
        "common_A_anchor_not_source", rA, [A1, X],
        "D48-A: X is an anchor and the agentWallet of S (#10). The solver gives S NO row (listed, absorbing, truncation "
        "margin on eUp only). F (#20) is endorsed by X alone: mass in X's column only, trustRobust(F) = 0.", [10, 20])

    def copy_x_row(g):                                   # the pre-D48 copy: S carries the row of its wallet X
        us, uf = g.index[(AGENT, 10)], g.index[(AGENT, 20)]
        g.anchor_sourced.discard(us)
        g.rows[us] = [Edge(uf, GRID, X, 20, "vouch", 1)]
        g.row_src[us] = (X, "wallet")
        return g
    att = vector("common_A_attack_anchor_copy", rA, [A1, X],
                 "D48-A attack: S (#10, wallet = anchor X) carries X's row. Arithmetically valid (t <= y), and F gets "
                 "mass in A1's column through S: the leave-one-out is defeated. The contract MUST refuse.", [],
                 mutate=copy_x_row, expect="AnchorAsSource")
    u = node_u(att, 10)
    att["expect"]["submission"] = f"AnchorAsSource({u})"
    att["attack"] = {"row": u, "source": X, "why": "agent row whose SRC is an anchor of the set (AM-08.A)",
                     "withoutTheCheck": "F passes m = 2 (mass in two columns), see tests/test_d48.py"}
    out["common_A_attack_anchor_copy"] = att

    # ---------------------------------------------------------------- B: a controller's negative is kept
    # #30 (owner O30) has approved P as its token's spender, and its owner made the anchor A2 an operator
    # (setApprovalForAll): the censorship of AM-08.B. A2 slashes #30, P slashes #30, A1 endorses #30 and #31.
    P = "0x" + "b5" * 20
    rB = (Reg().agent(30, approved=P).agent(31).operator(O(30), A2)
          .rate(A1, 30, 100, "vouch").rate(A1, 31, 100, "vouch").rate(A2, 31, 100, "vouch")
          .rate(A2, 30, -100, "slash").rate(P, 30, -100, "slash").rate(P, 31, 100, "vouch"))
    out["common_B_controller_negative"] = vector(
        "common_B_controller_negative", rB, [A1, A2],
        "D48-B: A2 is an operator of the owner of #30 and slashes it; P, the approved address of #30, slashes it too. "
        "Both are CURRENT controllers of #30: their negative edges are KEPT (only positive ones are rejected). The "
        "anchor row of A2 carries -10000 to #30: certified veto bit; strict mode also vetoes by approval. P is an "
        "address node without mass (no anchor endorses it), so its slash adds no distrust; it must still be "
        "accepted at submission (Registry-verified re-reads it: isAuthorizedOrOwner(P, 30) is TRUE).", [30, 31])

    # ---------------------------------------------------------------- C: a row proven false is never resubmitted
    rC = Reg().agent(40).agent(41).rate(A1, 40, 100, "vouch").rate(A2, 40, 100, "vouch").rate(A2, 41, 100, "vouch")

    def fabricate(g):                                    # A1 -> #41 (+10000, index 1): no such feedback
        ua, u41 = g.index[(ANCHOR, A1)], g.index[(AGENT, 41)]
        g.rows[ua] = sorted(g.rows[ua] + [Edge(u41, GRID, A1, 41, "vouch", 1)], key=lambda e: e.dst)
        return g

    def drop_empty_row(g, cert):                         # same false row + other bytes: #40's empty row removed
        u40 = cert.node_map.index(g.index[(AGENT, 40)])  # (listed without a row: truncation margin, t unchanged)
        assert cert.rows.pop(u40) == [] and cert.splus.pop(u40) == 0
    first = vector("common_C_proven_row_resubmitted", rC, [A1, A2],
                   "D48-C, step 1: the anchor row of A1 carries a FABRICATED edge A1 -> #41 (+10000, index 1). "
                   "Submitter-attested: accepted, then proven false by proveEdge (v) on (row of A1, agentJ = 41).", [],
                   mutate=fabricate, registry_verified=False)
    second = vector("common_C_proven_row_resubmitted", rC, [A1, A2], "step 2", [],
                    mutate=fabricate, mutate_cert=drop_empty_row, registry_verified=False)
    ua = next(n["i"] for n in first["nodes"] if n.get("address") == A1)
    first["expect"] = {"submission": "ACCEPTED", "then": {"proveEdge": {"row": ua, "agentJ": 41, "kind": "FABRICATED"}},
                       "resubmission": f"ProvenRowResubmitted({ua})"}
    assert second["calldata"]["rows"] != first["calldata"]["rows"]
    assert second["set"]["setId"] == first["set"]["setId"]
    first["resubmission"] = {"why": "the same false row of A1 (same canonical content) with other bytes changed: the "
                                    "empty row of #40 is dropped (#40 listed without a row), hence other rows bytes, "
                                    "graphRoot and e. MUST revert ProvenRowResubmitted once step 1 is proven, "
                                    "including under REGISTRY_CHANGED (not expressible in a static vector).",
                             "calldata": {**second["calldata"], "newNodes": "0x"},   # nodes exist since step 1
                             "nCert": second["nCert"],
                             "expected": {k: second["expected"][k] for k in ("graphRoot", "vectorRoot", "eEff")}}
    first["control"] = {"why": "the honest certificate (no fabricated edge) on the same set must be ACCEPTED after "
                               "the proof",
                        "calldata": {**vector("common_C_control", rC, [A1, A2], "control", [],
                                              registry_verified=False)["calldata"], "newNodes": "0x"}}
    out["common_C_proven_row_resubmitted"] = first

    # ---------------------------------------------------------------- D50: second hop
    # H1 (#50) endorsed by A1 AND A2; H1's wallet endorses H2 (#51); nobody else rates H2
    r2 = Reg().agent(50).agent(51).rate(A1, 50, 100, "vouch").rate(A2, 50, 100, "vouch").rate(W(50), 51, 100, "vouch")
    v2 = vector("common_2hop", r2, [A1, A2],
                "D50 second hop: H1 (#50) is endorsed by both anchors; H1 (through its agentWallet) endorses H2 (#51); "
                "no anchor rates H2. ANCRE: H2 has mass in BOTH columns (4/27 each), trustRobust = 2/27 > θ: passes. "
                "A one-hop trust list {A1, A2} says 'unknown' for H2.", [50, 51])
    v2["expect"]["oneHopList"] = {"trusted": [A1, A2], "51": "unknown (no rating by a trusted rater)",
                                  "50": "rated by 2 trusted raters"}
    out["common_2hop"] = v2
    r1 = Reg().agent(50).agent(51).rate(A1, 50, 100, "vouch").rate(W(50), 51, 100, "vouch")
    out["common_2hop_one_anchor"] = vector(
        "common_2hop_one_anchor", r1, [A1, A2],
        "Control (AM-10.6): H1 endorsed by ONE anchor only. H2 has mass in A1's column only: trustRobust = 0 with "
        "m = 2, it does NOT pass. The second hop needs an intermediary endorsed by two anchors.", [50, 51])
    # ---------------------------------------------------------------- R1 of 02-bis: an address(0) node
    def zero_node(g):                                    # an address node 0x0 (addNodes is open), appended
        from graph import ADDR                           # to the node table; its row is injected after certify
        g.nodes.append((ADDR, ZERO))
        g.index[(ADDR, ZERO)] = len(g.nodes) - 1
        return g

    def zero_row(g, cert):                               # row of client 0 -> #51 (the pre-fix parser skipped it and
        gi = g.index[(ADDR, ZERO)]                       # re-read every later row out of phase)
        n = cert.n
        cert.node_map.append(gi)
        cert.n = n + 1
        for col in cert.t:
            col.append(0)
        cert.rows[n] = [(cert.node_map.index(g.index[(AGENT, 51)]), GRID, 1)]
        cert.splus[n] = GRID
        cert.row_src[n] = (ZERO, "address")
    z = vector("common_R1_address_zero_node", r2, [A1, A2],
               "R1 (review 05/10, critical): the 2nd-hop certificate plus an address node 0x0 with a row. Before the "
               "fix, _verifyRows skipped the row of client 0 without advancing past its edges, every later row was "
               "re-read out of phase and a fabricated edge passed Registry-verified. The node itself MUST be refused.",
               [], mutate=zero_node, mutate_cert=zero_row, expect="BadNodes()")
    z["attack"] = {"node": next(n["i"] for n in z["nodes"] if n.get("address") == ZERO), "address": ZERO,
                   "why": "address(0) marks a source-less row; as a node it desynchronised the re-read (R1)"}
    out["common_R1_address_zero_node"] = z
    return out


def mainnet_old_slash_anchor() -> dict:
    """The 01/10 demo vector rebuilt on the current snapshot: anchors {0xea0b, 0x0730}; #18 (wallet = 0xea0b) carries
    the copy of the anchor row. Refused by the contract (AnchorAsSource). Real registry: fork replay only."""
    import run_mainnet as R
    fbs, idn = R.load_mainnet()
    ea0b, h1 = R.resolve(R.EA0B, fbs), R.resolve(R.HONEST1, fbs)
    g = build_graph(fbs, idn, SCHEMA, CORE, [ea0b, h1])
    u18 = g.index[(AGENT, 18)]
    assert g.anchor_sourced == {u18}
    ua = g.index[(ANCHOR, ea0b)]
    g.anchor_sourced = set()
    g.rows[u18] = [Edge(e.dst, e.q, ea0b, e.agent_id, e.tag1, e.feedback_index) for e in g.rows[ua]]
    g.row_src[u18] = (ea0b, "wallet")
    cert = certify(g, ALPHA)
    label = "common_A_mainnet_old_slash_anchor"
    obj = export_certificate(g, cert, idn, schema=SCHEMA, filter_tags=CORE,
                             policy=reference_policy(2, registry_verified=True), label=label,
                             notes=f"D48-A on real data (snapshot {idn.block}): the demo vector of 01/10. 0xea0b is an "
                                   "anchor AND the agentWallet of #18, which carries the copy of its row. Before D48 "
                                   "the contract accepted it (Registry-verified, fork). It MUST now revert.",
                             tag_schema_hash=vector_schema_hash(label))
    check_file_obj(obj, label)
    u = next(n["i"] for n in obj["nodes"] if n.get("agentId") == 18)
    obj["expect"] = {"submission": f"AnchorAsSource({u})", "forkBlock": idn.block}
    obj["attack"] = {"row": u, "source": ea0b, "why": "agent row whose SRC is an anchor of the set (AM-08.A)"}
    return obj


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.json"):
        p.unlink()
    objs = cases()
    objs["common_A_mainnet_old_slash_anchor"] = mainnet_old_slash_anchor()
    print("| vector | nCert | rows | edges | expect | read |")
    print("|---|---|---|---|---|---|")
    for name, obj in objs.items():
        (OUT / f"{name}.json").write_text(json.dumps(obj, indent=1, ensure_ascii=False))
        rd = {j: (r["trustRobust"], r["distrust"], r["passesAnchorPolicy"]) for j, r in
              obj["expect"].get("read", {}).items()}
        print(f"| {name} | {obj['nCert']} | {len(obj['rows'])} | {sum(len(r['edges']) for r in obj['rows'])} | "
              f"{obj['expect']['submission']} | {rd} |")


if __name__ == "__main__":
    main()

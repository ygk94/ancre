"""Act 1 export for the demo screen: the reference solver on the versioned Monad mainnet snapshot.

Usage (from app/):  ../solver/.venv/bin/python scripts/export_act1.py   ->  src/data/act1.json

Nothing is deployed on mainnet: every number written here is COMPUTED by the reference solver
(solver/graph.py + solver/ppr.py, rules D20) on the versioned snapshot of run_mainnet.BLOCK, reproducible with this
command. The screen must say so ("computed by the reference solver, reproducible"), never "certified on-chain".
This script only imports the solver; it changes nothing in solver/.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOLVER = HERE.parent.parent / "solver"
sys.path.insert(0, str(SOLVER))

import run_mainnet as rm  # noqa: E402
from graph import ANCHOR, AGENT, WAD, _tag_resolver, load_schema, quantize  # noqa: E402
from ppr import contributions, distrust, e_eff, passes_anchor_policy, trust_robust  # noqa: E402

OUT = HERE.parent / "src" / "data" / "act1.json"
ALPHA = rm.ALPHA
M = 2
THETA = WAD // 100  # 1 %: the theta committed by the chantier 06 demo set (D56, header.set.theta), a policy illustration
RHO_N, RHO_D = 1, 2  # solver/ppr.passes_anchor_policy defaults (the pay bit itself comes from passes_anchor_policy)

# Agents the screen features (ids on Monad 143), in display order. The ONE list: written to act1.json["featured"],
# read by scripts/snapshot-8004scan.mjs and by the screen.
FEATURED = [182, 4, 8317, 18, 2, 3, 9, 87, 19, 10279, 10278]


def wad_str(x: int) -> str:
    return str(int(x))


def node_stats(g, cert, inv, agent_id: int):
    gi = g.index.get((AGENT, agent_id))
    if gi is None or gi not in inv:
        return {"inSupport": False, "t": ["0"] * cert.k, "trust": "0", "trustRobust": "0", "distrust": "0"}
    ci = inv[gi]
    c = contributions(cert, ci)
    return {"inSupport": True, "t": [wad_str(cert.t[a][ci]) for a in range(cert.k)], "trust": wad_str(sum(c)),
            "trustRobust": wad_str(trust_robust(c, M)), "distrust": wad_str(distrust(cert, ci))}


def verdict(cert, ci, st) -> dict:
    """Pay bit from the reference solver (ppr.passes_anchor_policy, D26 reading); the detail is display text only."""
    if cert.k < M:
        return {"pay": False, "reason": "UNTRUSTED", "detail": f"one anchor: leave-one-out (m = {M}) leaves 0"}
    if ci is not None and passes_anchor_policy(cert, ci, theta=THETA, m=M, rhoN=RHO_N, rhoD=RHO_D):
        return {"pay": True, "reason": "OK", "detail": "trustLow >= theta, distrust within rho"}
    tl = int(st["trustRobust"])
    if tl >= THETA:
        detail = "distrust too high"
    elif tl:
        detail = "leave-one-out mass below theta"
    elif int(st["trust"]):
        detail = "reached by one anchor only: leave-one-out mass 0"
    elif int(st["distrust"]):
        detail = f"slashed by a trusted rater: distrust {int(st['distrust']) / WAD:.2%}, no mass"
    else:
        detail = "unknown to these anchors (mass 0)"
    return {"pay": False, "reason": "UNTRUSTED", "detail": detail}


def reviews_of(g, cert, inv, fbs_of, schema, filt, agent_id: int) -> dict:
    """D49: the effective weight of every non-revoked rating of `agent_id` under this lens, grouped by reason.
    Mirrors solver/graph.combine_pairs (R1-R6) rating by rating, then reads each retained edge's contribution in
    the certificate: (1 - alpha) * sum_a lambda_a t_a[u] * q / B+_u (q > 0; distrust uses B-_u). The sum of the
    contributions is checked against the certified raw mass (they are the same certificate)."""
    tag_of = _tag_resolver(set(filt), schema)
    one_minus_a = Fraction(cert.alphaD - cert.alphaN, cert.alphaD)
    bplus = cert.bplus
    bminus = {u: max(10_000, sum(-q for _, q, _ in row if q < 0)) for u, row in cert.rows.items()}
    mass_of = lambda ci: sum(cert.lambdas[a] * cert.t[a][ci] for a in range(cert.k)) // WAD  # noqa: E731
    fl = fbs_of.get(agent_id, [])
    latest = {}
    for f in fl:
        t = tag_of(f)
        if t is not None and schema[t].kind == "endorsement":
            k = (f.client, t)
            if k not in latest or f.index > latest[k].index:
                latest[k] = f
    # retained edges into the agent, with their source nodes and contribution
    gj = g.index.get((AGENT, agent_id))
    edge_src = {}  # client -> [(source label, contribution WAD, sign)]
    for u, row in g.rows.items():
        for e in row:
            if e.agent_id != agent_id:
                continue
            kind, key = g.nodes[u]
            cu = inv.get(u)
            m = mass_of(cu) if cu is not None else 0
            if e.q > 0:
                contrib = int(one_minus_a * m * e.q / bplus.get(cu, 10_000)) if cu is not None else 0
            else:
                contrib = -int(one_minus_a * m * (-e.q) / bminus.get(cu, 10_000)) if cu is not None else 0
            src = "anchor" if kind == ANCHOR else ("agent:" + str(key) if kind == AGENT else "address")
            edge_src.setdefault(e.client, []).append((src, contrib, e.q, e.tag1))
    groups = {}
    for f in fl:
        t = tag_of(f)
        via, contrib, w = None, 0, None
        if t is None:
            why = "outside"
        elif schema[t].kind != "endorsement":
            why = "measurement"
        elif latest.get((f.client, t)) is not f:
            why = "superseded"
        elif quantize(f.value, f.decimals, schema[t]) is None:
            why = "out_of_bounds"
        elif (f.client, agent_id) in g.r6_pairs:
            why = "controller"
        elif (f.client, agent_id) not in g.pairs:
            why = "zero_weight"
        elif g.pairs[(f.client, agent_id)].tag1 != t:
            why = "combined"
        else:
            srcs = edge_src.get(f.client, [])
            w = g.pairs[(f.client, agent_id)].q
            contrib = sum(c for _, c, _, _ in srcs)
            if any(s == "anchor" for s, *_ in srcs):
                why = "anchor" if w > 0 else "anchor_negative"
            elif contrib != 0:
                why = "hop" if w > 0 else "hop_negative"
                via = ",".join(sorted({s.split(":")[1] for s, c, *_ in srcs if c and s.startswith("agent:")}))
            else:
                why = "unreachable"
        k = (why, t or f.tag1[:40], via)
        gr = groups.setdefault(k, {"why": why, "tag": t or f.tag1[:40], "via": via, "count": 0, "contribution": 0,
                                   "w": w, "sampleRater": f.client})
        gr["count"] += 1
        gr["contribution"] += contrib
    out = sorted(groups.values(), key=lambda x: (-abs(x["contribution"]), -x["count"]))
    for x in out:
        x["contribution"] = wad_str(x["contribution"])
    # self-check: the positive contributions of the retained edges ARE the certified raw mass, up to the integer
    # rounding of each term (one wei per anchor column and per edge)
    if gj is not None and gj in inv:
        raw = sum(contributions(cert, inv[gj]))
        pos = sum(c for lst in edge_src.values() for _, c, q, _ in lst if q > 0)
        n_terms = sum(1 for lst in edge_src.values() for *_, q, _ in lst if q > 0)
        if abs(raw - pos) > (cert.k + 1) * (n_terms + 1) * 10:
            raise AssertionError(f"D49 contributions of #{agent_id} sum to {pos}, certified raw mass {raw}")
    inbound = [{"from": s, "contribution": wad_str(c), "w": q, "tag": tg, "client": cl}
               for cl, lst in edge_src.items() for s, c, q, tg in lst if c]
    inbound.sort(key=lambda x: -abs(int(x["contribution"])))
    # every non-zero inbound edge: the screen derives reach and trust paths from this list (never truncated)
    return {"total": len(fl), "groups": out[:12], "groupsOmitted": max(0, len(out) - 12), "inbound": inbound}


def lens(lid, title, blurb, fbs, idn, schema, filt, anchors, anchor_labels, farm, _schema_name="", **kw):
    g, cert, inv = rm.run(fbs, idn, schema, filt, anchors, **kw)
    fbs_of = {}
    for f in fbs:
        if not f.revoked:
            fbs_of.setdefault(f.agent_id, []).append(f)
    eeff = e_eff(cert)
    agents = {}
    for a in FEATURED:
        st = node_stats(g, cert, inv, a)
        gi = g.index.get((AGENT, a))
        st["verdict"] = verdict(cert, inv.get(gi) if gi is not None else None, st)
        agents[str(a)] = st
    ranking = []
    for ci, gi in enumerate(cert.node_map):
        kind, key = g.nodes[gi]
        if kind != AGENT:
            continue
        c = contributions(cert, ci)
        if sum(c) == 0 and distrust(cert, ci) == 0:
            continue
        st = {"agentId": str(key), "trust": wad_str(sum(c)), "trustRobust": wad_str(trust_robust(c, M)),
              "distrust": wad_str(distrust(cert, ci))}
        st["verdict"] = verdict(cert, ci, st)
        ranking.append(st)
    ranking.sort(key=lambda r: (-int(r["trustRobust"]), -int(r["trust"]), int(r["agentId"])))
    mass = rm.mass_in(g, cert, inv, farm)
    shown = {int(a) for a in agents} | {int(r["agentId"]) for r in ranking}
    reviews = {str(a): reviews_of(g, cert, inv, fbs_of, schema, filt, a) for a in sorted(shown)}
    return {
        "id": lid, "title": title, "blurb": blurb,
        "anchors": [{"address": a, "label": l} for a, l in zip(anchors, anchor_labels)],
        "alpha": f"{ALPHA.numerator}/{ALPHA.denominator}", "m": M,
        "schema": _schema_name, "filter": filt,
        "edges": len(g.pairs), "certifiedNodes": cert.n, "iterations": cert.iterations,
        "e": [wad_str(x) for x in cert.e], "eEff": wad_str(eeff),
        "massOnFarm": [wad_str(x) for x in mass],  # per anchor column t^(a)(S)
        "massOnFarmWeighted": wad_str(sum(cert.lambdas[a] * mass[a] // WAD for a in range(cert.k))),  # Σλ_a t^(a)(S)
        "agents": agents, "ranking": ranking, "reviews": reviews,
    }


def main():
    fbs, idn = rm.load_mainnet()
    raw_ref = json.load(open(SOLVER / "schema_reference.json"))
    ref = load_schema(raw_ref)
    filters = raw_ref["filters"]
    scanner = rm.resolve(rm.SCANNER, fbs)
    h1, h2 = rm.resolve(rm.HONEST1, fbs), rm.resolve(rm.HONEST2, fbs)
    w2a = idn.wallet_to_agents()

    # registry-side stats of the featured agents, from the same snapshot (the "explorer" facts at that block)
    reg = {}
    for a in FEATURED:
        l = [f for f in fbs if f.agent_id == a and not f.revoked]
        mean = (sum(Fraction(f.value, 10 ** f.decimals) for f in l) / len(l)) if l else None
        reg[str(a)] = {"feedbacks": len(l), "clients": len({f.client for f in l}),
                       "naiveAverage": (f"{float(mean):.4e}" if mean is not None and abs(mean) >= 1e6
                                        else (f"{float(mean):.4f}" if mean is not None else None)),
                       "outOfRange": sum(1 for f in l if abs(f.value) >= 10 ** 38),
                       "topClientShare": (max(Counter(f.client for f in l).values()) / len(l)) if l else None,
                       "owner": idn.owner.get(a), "wallet": idn.wallet.get(a)}

    eve_clients = {f.client for f in fbs if f.agent_id == rm.EVE and not f.revoked}
    farm = {rm.EVE} | {a for c in eve_clients for a in w2a.get(c, [])} | \
           {a for a, o in idn.owner.items() if o in eve_clients}
    farm_anchors = sorted(c for c in eve_clients if len(w2a.get(c, [])) == 1)[:2]
    ffarm = ["eve", "plague", "vouch", "review", "slash", "trust", "liveness"]
    fb_filter = ["trust", "liveness", "eve", "plague", "vouch", "review", "slash"]

    lenses = [
        lens("independent", "Two independent raters",
             "Anchors: two addresses outside the farm that rated the one honest chain (#18 -> #2, #3). Reference schema (D15).",
             fbs, idn, ref, filters["reference"], [h1, h2], ["0x0730…", "0xf7d5…"], farm,
             _schema_name="reference"),
        lens("screener-as-trust", "A risk screener read as trust",
             "Anchor: an automated risk-screening service (score 85 = 'risk low, unverified'). Its measurements are "
             "read as endorsements, as if D15 did not exist: the mass leaks into the farm region.",
             fbs, idn, rm.schema_variant(ref, "pre_d15"), fb_filter, [scanner],
             [scanner[:6] + "…" + scanner[-4:]], farm, _schema_name="no-D15 (measurements propagate)"),
        lens("screener-d15", "Same screener, schema D15",
             "Same single anchor, reference schema: measurements never create edges (D15). The leak is zero.",
             fbs, idn, ref, fb_filter, [scanner], [scanner[:6] + "…" + scanner[-4:]], farm,
             _schema_name="reference"),
        lens("inside-farm", "A reader who anchors inside the farm",
             "Anchors: two wallets of the farm itself, every tag read as an endorsement. ANCRE is relative to the "
             "reader's anchors: it does not protect a reader who trusts the farm.",
             fbs, idn, rm.stress_schema(fbs), ffarm, farm_anchors,
             [a[:6] + "…" + a[-4:] for a in farm_anchors], farm, _schema_name="stress (every tag = endorsement)"),
    ]

    # D49 complement: the same two independent anchors with EVERY tag read as an endorsement in [-100, 100]
    # (stress schema). Shown only as "even if every tag counted": who would still count for 0, and why.
    # filter: the 16 (TAGS_MAX) most frequent tags among the featured agents' ratings
    tag_freq = Counter(f.tag1 for f in fbs if f.agent_id in FEATURED and not f.revoked)
    perm_filter = [t for t, _ in tag_freq.most_common(16)]
    perm = lens("independent-any-tag", "Two independent raters, every tag accepted", "", fbs, idn,
                rm.stress_schema(fbs), perm_filter, [h1, h2], ["0x0730…", "0xf7d5…"],
                farm, _schema_name="stress (every tag = endorsement)")
    permissive = {"schema": perm["schema"], "filter": perm_filter, "edges": perm["edges"],
                  "reviews": {a: perm["reviews"][a] for a in perm["reviews"] if a in {str(x) for x in FEATURED}}}

    # #8317: what the registry accepted vs what ANCRE keeps (reference schema)
    g8317 = rm.build_graph(fbs, idn, ref, ["trade_execution"], [])
    self_rating = {"received": reg["8317"]["feedbacks"],
                   "edgesKept": sum(1 for p in g8317.pairs.values() if p.agent_id == 8317),
                   "rejectedMeasurementD15": g8317.log.get("rejet_measurement_D15", 0)}

    rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=SOLVER, capture_output=True, text=True).stdout.strip()
    doc = {
        "format": "ancre-screen-act1-v1",
        "status": "COMPUTED by the reference solver (not deployed on mainnet), reproducible",
        "command": "cd app && ../solver/.venv/bin/python scripts/export_act1.py",
        "solverCommit": rev,
        "chainId": 143,
        "featured": [str(a) for a in FEATURED],
        "snapshotBlock": idn.block,
        "snapshotFeedbacks": len(fbs),
        "snapshotAgents": len(idn.owner),
        "source": f"solver/data/mainnet-{rm.BLOCK}.{{feedbacks,identity}}.json.gz (re-read on-chain, solver/snapshot.py)",
        "rules": "D20, alpha = 1/3, m = 2, uniform lambdas, integer certificate from 0 (D26)",
        "policy": {"theta": wad_str(THETA), "thetaPct": THETA / WAD * 100, "rhoN": RHO_N, "rhoD": RHO_D,
                   "note": "theta of the chantier 06 demo set, applied off-chain to illustrate the payment verdict"},
        "farm": {"agents": len(farm), "eveFeedbacks": reg["182"]["feedbacks"],
                 "eveOutOfRange": reg["182"]["outOfRange"], "eveNaiveAverage": reg["182"]["naiveAverage"]},
        "selfRating8317": self_rating,
        "registry": reg,
        "lenses": lenses,
        "permissive": permissive,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT}: {len(lenses)} lenses, block {idn.block}")
    for L in lenses:
        print(f"  {L['id']}: edges {L['edges']}, nodes {L['certifiedNodes']}, mass on farm {L['massOnFarm']}, "
              f"ranking {[(r['agentId'], int(r['trustRobust']) / WAD) for r in L['ranking'][:5]]}")


if __name__ == "__main__":
    main()

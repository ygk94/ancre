"""Act 1 export for the demo screen: the reference solver on the versioned Monad mainnet snapshot.

Usage (from app/):  ../solver/.venv/bin/python scripts/export_act1.py   ->  src/data/act1.json

Nothing is deployed on mainnet: every number written here is COMPUTED by the reference solver
(solver/graph.py + solver/ppr.py, rules D20) on solver/data/mainnet-108835675.*, reproducible with this
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
from graph import AGENT, WAD, load_schema  # noqa: E402
from ppr import contributions, distrust, e_eff, trust_robust  # noqa: E402

OUT = HERE.parent / "src" / "data" / "act1.json"
ALPHA = rm.ALPHA
M = 2
THETA = WAD // 50  # 2 %: the theta committed by the chantier 06 demo set (header.set.theta), used as a policy illustration
RHO_N, RHO_D = 1, 2  # contract defaults in solver/ppr.is_trusted

# Agents the screen features (ids on Monad 143). Labels are names published in the registry / 8004scan.
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


def verdict(st, eeff: int) -> dict:
    tl = int(st["trustRobust"])
    du = int(st["distrust"]) + eeff
    if tl < THETA:
        return {"pay": False, "reason": "UNTRUSTED", "detail": "trustLow below theta" if tl else "unknown to these anchors (mass 0)"}
    if RHO_D * du > RHO_N * tl:
        return {"pay": False, "reason": "UNTRUSTED", "detail": "distrust too high"}
    return {"pay": True, "reason": "OK", "detail": "trustLow >= theta, distrust within rho"}


def lens(lid, title, blurb, fbs, idn, schema, filt, anchors, anchor_labels, farm, w2a, _schema_name="", **kw):
    g, cert, inv = rm.run(fbs, idn, schema, filt, anchors, **kw)
    eeff = e_eff(cert)
    agents = {}
    for a in FEATURED:
        st = node_stats(g, cert, inv, a)
        st["verdict"] = verdict(st, eeff) if len(anchors) >= M else {"pay": False, "reason": "UNTRUSTED",
                                                                    "detail": f"one anchor: leave-one-out (m = {M}) leaves 0"}
        agents[str(a)] = st
    ranking = []
    for ci, gi in enumerate(cert.node_map):
        kind, key = g.nodes[gi]
        if kind != AGENT:
            continue
        c = contributions(cert, ci)
        if sum(c) == 0 and distrust(cert, ci) == 0:
            continue
        ranking.append({"agentId": str(key), "trust": wad_str(sum(c)), "trustRobust": wad_str(trust_robust(c, M)),
                        "distrust": wad_str(distrust(cert, ci))})
    ranking.sort(key=lambda r: (-int(r["trustRobust"]), -int(r["trust"]), int(r["agentId"])))
    mass = rm.mass_in(g, cert, inv, farm)
    return {
        "id": lid, "title": title, "blurb": blurb,
        "anchors": [{"address": a, "label": l} for a, l in zip(anchors, anchor_labels)],
        "alpha": f"{ALPHA.numerator}/{ALPHA.denominator}", "m": M,
        "schema": _schema_name, "filter": filt,
        "edges": len(g.pairs), "certifiedNodes": cert.n, "iterations": cert.iterations,
        "e": [wad_str(x) for x in cert.e], "eEff": wad_str(eeff),
        "massOnFarm": [wad_str(x) for x in mass],
        "agents": agents, "ranking": ranking,
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
             fbs, idn, ref, filters["reference"], [h1, h2], ["0x0730…", "0xf7d5…"], farm, w2a,
             _schema_name="reference"),
        lens("screener-as-trust", "A risk screener read as trust",
             "Anchor: an automated risk-screening service (score 85 = 'risk low, unverified'). Its measurements are "
             "read as endorsements, as if D15 did not exist: the mass leaks into the farm region.",
             fbs, idn, rm.schema_variant(ref, "pre_d15"), fb_filter, [scanner],
             [scanner[:6] + "…" + scanner[-4:]], farm, w2a, _schema_name="no-D15 (measurements propagate)"),
        lens("screener-d15", "Same screener, schema D15",
             "Same single anchor, reference schema: measurements never create edges (D15). The leak is zero.",
             fbs, idn, ref, fb_filter, [scanner], [scanner[:6] + "…" + scanner[-4:]], farm, w2a,
             _schema_name="reference"),
        lens("inside-farm", "A reader who anchors inside the farm",
             "Anchors: two wallets of the farm itself, every tag read as an endorsement. ANCRE is relative to the "
             "reader's anchors: it does not protect a reader who trusts the farm.",
             fbs, idn, rm.stress_schema(fbs), ffarm, farm_anchors,
             [a[:6] + "…" + a[-4:] for a in farm_anchors], farm, w2a, _schema_name="stress (every tag = endorsement)"),
    ]

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
        "snapshotBlock": idn.block,
        "snapshotFeedbacks": len(fbs),
        "snapshotAgents": len(idn.owner),
        "source": "solver/data/mainnet-108835675.{feedbacks,identity}.json.gz (re-read on-chain, solver/snapshot.py)",
        "rules": "D20, alpha = 1/3, m = 2, uniform lambdas, integer certificate from 0 (D26)",
        "policy": {"theta": wad_str(THETA), "thetaPct": THETA / WAD * 100, "rhoN": RHO_N, "rhoD": RHO_D,
                   "note": "theta of the chantier 06 demo set, applied off-chain to illustrate the payment verdict"},
        "farm": {"agents": len(farm), "eveFeedbacks": reg["182"]["feedbacks"],
                 "eveOutOfRange": reg["182"]["outOfRange"], "eveNaiveAverage": reg["182"]["naiveAverage"]},
        "selfRating8317": self_rating,
        "registry": reg,
        "lenses": lenses,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT}: {len(lenses)} lenses, block {idn.block}")
    for L in lenses:
        print(f"  {L['id']}: edges {L['edges']}, nodes {L['certifiedNodes']}, mass on farm {L['massOnFarm']}, "
              f"ranking {[(r['agentId'], int(r['trustRobust']) / WAD) for r in L['ranking'][:5]]}")


if __name__ == "__main__":
    main()

"""Freeze the solver's reference edges from a survival_scan JSON into a parity fixture for test/parity.test.ts.

Usage: python3.12 analytics/export_fixture.py out/survival_optimism.json test/fixtures/ref_edges_10_<block>.json
The fixture block is the scan's `toBlock - 1` when bounded, else its last log block (nothing after it was scanned).
"""
import json
import sys

r = json.load(open(sys.argv[1]))
block = r["toBlock"] - 1 if r["toBlock"] else r["lastLogBlock"]
out = {
    "source": "solver/graph.py build_graph via indexer/analytics/survival_scan.py (HyperSync, events only), past_owners empty (D20)",
    "chainId": r["chainId"], "block": block, "measuredAt": r["measuredAt"],
    "schema": "solver/schema_reference.json filter reference",
    "counts": {k: r[k] for k in ["agentsMinted", "transfers", "sharedWallets", "agentsOnSharedWallets",
                                 "feedbacks", "revoked", "couples", "absValueGe1e38"]},
    "selfRatingsByController": r["selfRatingsByController"],
    "edges": sorted([{"client": e["client"], "agent": str(e["agent"]), "w": e["q"], "tag1": e["tag1"],
                      "feedbackIndex": str(e["idx"])} for e in r["edgeList"]],
                    key=lambda e: (e["client"], int(e["agent"]))),
}
json.dump(out, open(sys.argv[2], "w"), indent=1)
print(sys.argv[2], block, len(out["edges"]))

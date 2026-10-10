"""Rebuild this fixture: the Envio indexer rows (GraphQL shape, from_indexer.FixtureSource) of the demo agents of the
official testnet instance (ANCRE 0x8bE6…da9B, agents 2050..2063), at the indexer head of the run.

  cd solver && .venv/bin/python tests/fixtures/indexer-testnet/make_fixture.py

Only the demo agents and their owners' operator rows are kept: nothing else of the testnet registry is reachable from
the official anchors (test_alchemy_live checks that the certificate computed from this fixture has the graphRoot of
the certificate on chain, 0xc370…abb2, MEASURED 10/10)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2]))

from from_indexer import GraphQLSource  # noqa: E402

ENDPOINT = "https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql"
AGENTS = set(range(2050, 2064))


def main():
    src = GraphQLSource(ENDPOINT, 10143)
    head = src.head()
    keep = lambda rows: [r for r in rows if int(r["agent_id"]) in AGENTS]
    tables = {e: keep(src.rows(e, head)) for e in ("Feedback", "OwnerChange", "WalletChange", "ApprovalChange")}
    owners = {r["to"].lower() for r in tables["OwnerChange"]}
    tables["OperatorChange"] = [r for r in src.rows("OperatorChange", head) if r["owner"].lower() in owners]
    for e, rows in tables.items():
        for r in rows:
            r["chainId"] = 10143
        (HERE / f"{e}.json").write_text(json.dumps(rows, indent=0, sort_keys=True))
    (HERE / "BLOCK").write_text(str(head))
    print(head, {e: len(r) for e, r in tables.items()})


if __name__ == "__main__":
    main()

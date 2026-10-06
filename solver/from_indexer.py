"""Read the ANCRE indexer (chantier 03, Envio HyperIndex, Hasura GraphQL) into the solver's input files.

Interface: docs/ressources/design-indexeur-envio.md §5 (schema.graphql) and §7. Writes, for a block B:
  onchain_feedbacks.json  {"block", "feedbacks": [{a, c, i, v, d, t1, t2, r, b}]}, r = revokedAtBlock <= B,
                          b = blockNumber of the NewFeedback (AM-9.3 diagnostic)
                          (read by graph.load_feedbacks_onchain)
  identity.json           {"block", "owner", "wallet", "approved", "operators", "pastOwners", "pastWallets"},
                          rebuilt by replaying OwnerChange / WalletChange / ApprovalChange / OperatorChange <= B
                          in (blockNumber, logIndex) order (read by graph.load_identity_json)
  set_edges.json          the indexer's SetEdge rows for one set (default "ref"), for the parity check

Point-in-time without time travel: the history layer is append-only and dated by block, so any past state is a
filter blockNumber <= B (design §7). SetEdge is only the CURRENT state: parity is meaningful only when B is the
indexer's head (or the indexer is stopped at B).

Sources: GraphQLSource (live endpoint, keyset pagination id_gt, 1 000 rows per page) or FixtureSource (one JSON
file per entity, same row shape as GraphQL: the stub used until the indexer exists, and a way for chantier 03 to
hand over a dump from another machine).

Usage:
  .venv/bin/python from_indexer.py --endpoint URL --block B --out DIR [--set ref] [--parity]
  .venv/bin/python from_indexer.py --fixture DIR --block B --out DIR --parity
  .venv/bin/python from_indexer.py --make-stub DIR       # stub fixture from the versioned mainnet snapshot
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from graph import ZERO, Feedback, Identity, PairEdge, identity_to_json, tag_hash

PAGE = 1000
CHAIN_FIELD = "chainId"          # per-chain key of the multichain indexer (design §5: ids are (id, chainId))

# Entity -> fields, as in design-indexeur-envio.md §5. Relations are exposed by Hasura as `<field>_id`.
ENTITIES = {
    "Feedback": ["id", "agent_id", "client", "feedbackIndex", "value", "valueDecimals", "tag1", "tagHash",
                 "tag1Exact", "tag2", "blockNumber", "logIndex", "revokedAtBlock"],   # tagHash, tag1Exact: schema v3
    "OwnerChange": ["id", "agent_id", "from", "to", "isMint", "blockNumber", "logIndex"],
    "WalletChange": ["id", "agent_id", "wallet", "blockNumber", "logIndex"],
    "ApprovalChange": ["id", "agent_id", "approved", "blockNumber", "logIndex"],
    "OperatorChange": ["id", "owner", "operator", "approved", "blockNumber", "logIndex"],
    "SetEdge": ["id", "set_id", "client", "agent_id", "w", "decidingTag", "feedbackIndex", "rejected",
                "updatedAtBlock"],
}
BLOCK_FILTERED = {"Feedback", "OwnerChange", "WalletChange", "ApprovalChange", "OperatorChange"}


# ----------------------------------------------------------------------------- sources


class GraphQLSource:
    def __init__(self, endpoint: str, chain: int, timeout: float = 30.0):
        self.endpoint, self.chain, self.timeout = endpoint, chain, timeout

    def _post(self, query: str, variables: dict) -> dict:
        req = urllib.request.Request(self.endpoint, data=json.dumps({"query": query, "variables": variables}).encode(),
                                     headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            body = json.load(r)
        if body.get("errors"):
            raise RuntimeError(body["errors"])
        return body["data"]

    def rows(self, entity: str, block: int | None = None, where: dict | None = None) -> list[dict]:
        """All rows of an entity for this chain (keyset pagination on id), optionally blockNumber <= block.
        Stops on an EMPTY page, not on a short one: a server-side row cap below PAGE must not truncate silently."""
        fields = " ".join(ENTITIES[entity])
        cond = {**(where or {}), CHAIN_FIELD: {"_eq": self.chain}}
        if block is not None and entity in BLOCK_FILTERED:
            cond["blockNumber"] = {"_lte": str(block)}
        out, last = [], ""
        while True:
            w = {**cond, "id": {"_gt": last}}
            q = (f"query Q($w: {entity}_bool_exp!) {{ {entity}(where: $w, order_by: {{id: asc}}, limit: {PAGE}) "
                 f"{{ {fields} }} }}")
            page = self._post(q, {"w": w})[entity]
            if not page:
                return out
            out += page
            last = page[-1]["id"]

    def head(self) -> int:
        """Last block processed by the indexer for this chain. Envio's `chain_metadata` table (field names
        NON VÉRIFIÉ against a live endpoint: check when chantier 03 deploys)."""
        q = ("query H($c: Int!) { chain_metadata(where: {chain_id: {_eq: $c}}) { latest_processed_block } }")
        rows = self._post(q, {"c": self.chain})["chain_metadata"]
        if not rows:
            raise RuntimeError(f"indexer has no metadata for chain {self.chain}")
        return int(rows[0]["latest_processed_block"])


class FixtureSource:
    """One `<Entity>.json` file (list of rows, GraphQL shape) per entity in a directory."""

    def __init__(self, directory: str | Path, chain: int | None = None):
        self.dir, self.chain = Path(directory), chain

    def head(self) -> int:
        """A dump declares the block it was taken at in a `BLOCK` file."""
        return int((self.dir / "BLOCK").read_text())

    def rows(self, entity: str, block: int | None = None, where: dict | None = None) -> list[dict]:
        p = self.dir / f"{entity}.json"
        rows = json.loads(p.read_text()) if p.exists() else []
        if self.chain is not None:
            rows = [r for r in rows if int(r.get(CHAIN_FIELD, self.chain)) == self.chain]
        if block is not None and entity in BLOCK_FILTERED:
            rows = [r for r in rows if int(r["blockNumber"]) <= block]
        for k, cond in (where or {}).items():
            rows = [r for r in rows if r.get(k) == cond["_eq"]]
        return sorted(rows, key=lambda r: r["id"])


# ----------------------------------------------------------------------------- conversion


def _order(r: dict) -> tuple[int, int]:
    return int(r["blockNumber"]), int(r["logIndex"])


def _tag_identity(r: dict) -> str | None:
    """NUL (review 06/10): the tag's identity is `tagHash` = keccak256(tag1 bytes), exported as `h`; graph matches a
    feedback that has `h` by hash ONLY (R1 bis), so a `tag1Exact = false` display text (NUL, ill-formed UTF-16,
    > 1 KiB) is never matched. Excluding those feedbacks instead would be wrong: a schema tag longer than 1 KiB, or
    containing U+0000, is matched by hash on chain and only has non-exact texts. A dump without these fields (schema
    before v3, solver/tests/fixtures/indexer/) keeps the text (its tags are exact: 0 NUL in the real data). An
    inconsistent row (non-exact text without hash, or an exact text that does not hash to tagHash) is refused."""
    h, exact = r.get("tagHash"), r.get("tag1Exact")
    if not h:
        if exact is False:
            raise ValueError(f"Feedback {r.get('id')}: tag1Exact = false without tagHash, the tag cannot be identified")
        return None
    h = h.lower()
    if exact is not False:
        try:
            same = tag_hash(r["tag1"]) == h
        except UnicodeEncodeError:
            same = False
        if not same:
            raise ValueError(f"Feedback {r.get('id')}: tag1 claimed exact but keccak(tag1) != tagHash {h}")
    return h


def feedbacks_file(src, block: int) -> dict:
    fbs = []
    for r in src.rows("Feedback", block):
        rev = r.get("revokedAtBlock")
        h = _tag_identity(r)
        fbs.append({"a": int(r["agent_id"]), "c": r["client"].lower(), "i": int(r["feedbackIndex"]),
                    "v": str(int(r["value"])), "d": int(r["valueDecimals"]), "t1": r["tag1"], "t2": r["tag2"],
                    "r": rev is not None and int(rev) <= block, "b": int(r["blockNumber"]),
                    **({"h": h} if h else {})})
    return {"block": block, "feedbacks": sorted(fbs, key=lambda f: (f["a"], f["c"], f["i"]))}


def identity_file(src, block: int) -> dict:
    """Replay the identity history up to `block` (inclusive), in chain order. A Transfer clears getApproved
    (ERC-721); the registry itself emits MetadataSet(agentWallet, "") on transfer, indexed as a WalletChange.
    REGCB: the late MetadataSet of register() after a callback change is filtered by the indexer (identity.ts writes
    no WalletChange for it), so this replay applies every row; it has no transaction hash to apply the rule itself
    (graph.replay_identity_events does it on raw logs)."""
    ev = [("owner", r) for r in src.rows("OwnerChange", block)]
    ev += [("wallet", r) for r in src.rows("WalletChange", block)]
    ev += [("approval", r) for r in src.rows("ApprovalChange", block)]
    ev += [("operator", r) for r in src.rows("OperatorChange", block)]
    idn = Identity(block=block, owner={}, wallet={})
    for kind, r in sorted(ev, key=lambda x: _order(x[1])):          # same transitions as graph.Identity (R6/R7)
        if kind == "operator":
            idn.apply_operator(r["owner"], r["operator"], r["approved"])
            continue
        a = int(r["agent_id"])
        if kind == "owner":
            idn.apply_transfer(a, r["from"], r["to"], int(r["blockNumber"]))
            idn.wallet.setdefault(a, ZERO)
        elif kind == "wallet":
            idn.apply_wallet(a, r["wallet"])
        else:
            idn.apply_approval(a, r["approved"])
    return identity_to_json(idn)                          # apply_transfer keeps the current owner out of past owners


def set_edges_file(src, set_id: str = "ref") -> list[dict]:
    return [{"setId": set_id, "client": r["client"].lower(), "agentId": int(r["agent_id"]), "w": int(r["w"]),
             "decidingTag": r.get("decidingTag"),
             "feedbackIndex": None if r.get("feedbackIndex") is None else int(r["feedbackIndex"]),
             "rejected": r.get("rejected")}
            for r in src.rows("SetEdge", where={"set_id": {"_eq": set_id}})]


def export(src, block: int, out: Path, set_id: str = "ref") -> dict[str, Path]:
    """Refuses a block the indexer has not processed yet: `blockNumber <= B` would silently return the head state
    labelled B. SetEdge is current state: set_edges.json is exact only if the head equals B."""
    if block is None:
        raise ValueError("block is required")
    head = src.head()
    if head < block:
        raise RuntimeError(f"indexer head {head} < requested block {block}")
    out.mkdir(parents=True, exist_ok=True)
    files = {"feedbacks": out / "onchain_feedbacks.json", "identity": out / "identity.json",
             "set_edges": out / "set_edges.json"}
    import os
    for k, obj in (("feedbacks", feedbacks_file(src, block)), ("identity", identity_file(src, block)),
                   ("set_edges", set_edges_file(src, set_id))):
        tmp = files[k].with_suffix(".tmp")              # review DIES: readers never see a half-written export
        tmp.write_text(json.dumps(obj))
        os.replace(tmp, files[k])
    return files


# ----------------------------------------------------------------------------- parity


def parity(set_edges: list[dict], pairs: dict[tuple[str, int], PairEdge]) -> list[dict]:
    """Differences between the indexer's retained SetEdge rows and the solver's pair edges (R1-R6).
    A SetEdge is retained iff rejected is null and w != 0. Empty list = parity."""
    idx = {(e["client"], e["agentId"]): e for e in set_edges if e["rejected"] is None and e["w"] != 0}
    diffs = []
    for k in sorted(set(idx) | set(pairs)):
        a, b = idx.get(k), pairs.get(k)
        if a is None:
            diffs.append({"kind": "MISSING_IN_INDEXER", "client": k[0], "agentId": k[1], "solver": b.q})
        elif b is None:
            diffs.append({"kind": "EXTRA_IN_INDEXER", "client": k[0], "agentId": k[1], "indexer": a["w"]})
        elif (a["w"], a["decidingTag"], a["feedbackIndex"]) != (b.q, b.tag1, b.feedback_index):
            diffs.append({"kind": "MISMATCH", "client": k[0], "agentId": k[1],
                          "indexer": [a["w"], a["decidingTag"], a["feedbackIndex"]],
                          "solver": [b.q, b.tag1, b.feedback_index]})
    return diffs


# ----------------------------------------------------------------------------- stub


def make_stub(fbs: list[Feedback], idn: Identity, pairs: dict[tuple[str, int], PairEdge], out: Path,
              set_id: str = "ref", block: int = 3) -> Path:
    """Fixture in the indexer's GraphQL shape, built from a snapshot. The identity history is synthetic: one mint
    (and one WalletChange) per agent at block 1, then the past holders as earlier transfers, then approvals and
    operators. SetEdge rows come from the solver's own pairs: a stub CANNOT prove parity, it tests the pipeline
    (pagination, replay, mapping) until chantier 03 delivers."""
    out.mkdir(parents=True, exist_ok=True)
    li = defaultdict(int)

    def nxt(b):
        li[b] += 1
        return li[b]
    owners, wallets, approvals, operators = [], [], [], []
    for a in sorted(idn.owner):
        hist = sorted(idn.past_owners.get(a, ())) + [idn.owner[a]]
        prev = ZERO
        for h in hist:
            owners.append({"id": f"o-{a}-{len(owners)}", "agent_id": str(a), "from": prev, "to": h,
                           "isMint": prev == ZERO, "blockNumber": "1", "logIndex": nxt(1)})
            prev = h
        wallets.append({"id": f"w-{a}", "agent_id": str(a), "wallet": idn.wallet.get(a, ZERO), "blockNumber": "1",
                        "logIndex": nxt(1)})
    for a, ap in sorted(idn.approved.items()):
        approvals.append({"id": f"a-{a}", "agent_id": str(a), "approved": ap, "blockNumber": "2", "logIndex": nxt(2)})
    for o, ops in sorted(idn.operators.items()):
        for op in sorted(ops):
            operators.append({"id": f"op-{o}-{op}", "owner": o, "operator": op, "approved": True, "blockNumber": "2",
                              "logIndex": nxt(2)})
    feed = [{"id": f"{f.agent_id}-{f.client}-{f.index}", "agent_id": str(f.agent_id), "client": f.client,
             "feedbackIndex": str(f.index), "value": str(f.value), "valueDecimals": f.decimals, "tag1": f.tag1,
             "tagHash": f.tag_hash or tag_hash(f.tag1), "tag1Exact": f.tag_hash in (None, tag_hash(f.tag1)),
             "tag2": f.tag2, "blockNumber": str(f.block or 3), "logIndex": nxt(3),
             "revokedAtBlock": "4" if f.revoked else None}
            for f in fbs]
    edges = [{"id": f"{set_id}-{p.client}-{p.agent_id}", "set_id": set_id, "client": p.client,
              "agent_id": str(p.agent_id), "w": p.q, "decidingTag": p.tag1, "feedbackIndex": str(p.feedback_index),
              "rejected": None, "updatedAtBlock": "3"} for p in pairs.values()]
    (out / "BLOCK").write_text(str(block))
    for name, rows in (("Feedback", feed), ("OwnerChange", owners), ("WalletChange", wallets),
                       ("ApprovalChange", approvals), ("OperatorChange", operators), ("SetEdge", edges)):
        (out / f"{name}.json").write_text(json.dumps(rows))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--endpoint")
    g.add_argument("--fixture")
    g.add_argument("--make-stub")
    ap.add_argument("--block", type=int, help="required except with --make-stub")
    ap.add_argument("--chain", type=int, default=143)
    ap.add_argument("--out")
    ap.add_argument("--set", default="ref")
    ap.add_argument("--filter", default="reference", help="filter of schema_reference.json for the parity check")
    ap.add_argument("--parity", action="store_true")
    ap.add_argument("--owner-fallback", action="store_true", help="D44 (default off)")
    args = ap.parse_args(argv)
    from graph import build_graph, load_feedbacks_onchain, load_identity_json, load_schema
    raw = json.load(open(Path(__file__).parent / "schema_reference.json"))
    schema, filt = load_schema(raw), raw["filters"][args.filter]
    if args.make_stub:
        import run_mainnet as R
        fbs, idn = R.load_mainnet()
        pairs = build_graph(fbs, idn, schema, filt, [], owner_fallback=args.owner_fallback).pairs
        print(make_stub(fbs, idn, pairs, Path(args.make_stub), args.set, R.BLOCK))
        return 0
    if args.block is None:
        ap.error("--block is required")
    src = GraphQLSource(args.endpoint, args.chain) if args.endpoint else FixtureSource(args.fixture, args.chain)
    files = export(src, args.block, Path(args.out), args.set)
    print({k: str(v) for k, v in files.items()})
    if args.parity:
        fbs, idn = load_feedbacks_onchain(files["feedbacks"]), load_identity_json(files["identity"])
        pairs = build_graph(fbs, idn, schema, filt, [], owner_fallback=args.owner_fallback).pairs
        diffs = parity(json.loads(files["set_edges"].read_text()), pairs)
        print(f"parity: {len(pairs)} solver pairs, {len(diffs)} differences")
        for d in diffs[:20]:
            print(d)
        return 1 if diffs else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Independent checker for the test vectors of "Anchored Reputation for Trustless Agents".

Standard library only. It does not import the reference implementation: every quantity is recomputed from
the specification text and compared with the expected values stored in the vectors.

    python3 verify.py            # all vectors in ./vectors
    python3 verify.py -v         # with details

What it checks:
  quantization.json      section 3.2   weight of a single feedback
  pair-edge.json         section 3.3   combined pair weight and deciding feedback (rule 4, tag identity by hash)
  certificates/*.json    sections 2.1, 4, 5   setId, row bytes, canonical form, graphRoot, vectorRoot, sub-solution,
                                       r, eUp, q, eEff, qEff, mass, d, D; then, in exact rational arithmetic,
                                       t <= t* and ||t* - t||_1 <= eUp for the committed graph
  violations/*.json      sections 5, 6       the committed graph is not dominated by the true graph (the guarantee
                                       fails), then the discrepancy proofs restore it, with the exact eLowEff and
                                       eEff measured on the reference implementation (formula X of section 6.1)
  common/*.json          sections 3.3, 3.5, 5, 5.10, 8   self-contained vectors with their registry state: the
                                       outcome of the submission (accepted, or the refusal named in section 10),
                                       the re-read of every committed edge against the registry, the readings
                                       (contributions, trustRobust, distrust, veto bits, veto by approval,
                                       passesAnchorPolicy), and the proven-fact sequence of common_C
  sequences/*.json       sections 5.10, 6   registry changes, proofs and resubmissions in order, with eLowEff
                                       and eEff after each proof as measured on the reference implementation
  refusals.json          sections 5.1, 5.3, 5.4   submissions that MUST be refused, with the expected error
"""
from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

WAD = 10**18
GRID = 10_000
LANE = (1 << 63) - 1
U256_MAX = (1 << 256) - 1
ZERO = "0x" + "00" * 20

# ----------------------------------------------------------------------------------------------- keccak256
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000, 0x000000000000808B,
    0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008A, 0x0000000000000088,
    0x0000000080008009, 0x000000008000000A, 0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_M = (1 << 64) - 1


def _rol(x: int, n: int) -> int:
    return ((x << n) | (x >> (64 - n))) & _M if n else x


def _keccak_f(s: list[list[int]]) -> None:
    for rc in _RC:
        c = [s[x][0] ^ s[x][1] ^ s[x][2] ^ s[x][3] ^ s[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                s[x][y] ^= d[x]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(s[x][y], _ROT[x][y])
        for x in range(5):
            for y in range(5):
                s[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y])
        s[0][0] ^= rc


def keccak256(data: bytes) -> bytes:
    rate = 136
    msg = bytearray(data) + b"\x01"
    msg += b"\x00" * ((-len(msg)) % rate)
    msg[-1] |= 0x80
    s = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off:off + rate]
        for i in range(rate // 8):
            s[i % 5][i // 5] ^= int.from_bytes(block[8 * i:8 * i + 8], "little")
        _keccak_f(s)
    out = b"".join(s[i % 5][i // 5].to_bytes(8, "little") for i in range(4))
    return out


assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"

# ----------------------------------------------------------------------------------------------- ABI encoding
# Types: ("uint", bits) ("int", bits) ("address",) ("bool",) ("bytes32",) ("string",) ("array", T) ("tuple", [T...])


def _dynamic(t) -> bool:
    if t[0] in ("string", "array"):
        return True
    if t[0] == "tuple":
        return any(_dynamic(x) for x in t[1])
    return False


def _word(t, v) -> bytes:
    k = t[0]
    if k == "uint":
        return int(v).to_bytes(32, "big")
    if k == "int":
        return (int(v) % (1 << 256)).to_bytes(32, "big")
    if k == "address":
        return int(v, 16).to_bytes(32, "big")
    if k == "bool":
        return (1 if v else 0).to_bytes(32, "big")
    if k == "bytes32":
        return bytes.fromhex(v[2:] if v.startswith("0x") else v)
    raise ValueError(k)


def abi_encode(types: list, values: list) -> bytes:
    head, tail = b"", b""
    hlen = 32 * len(types)  # every static type used here is one word
    for t, v in zip(types, values):
        if _dynamic(t):
            head += (hlen + len(tail)).to_bytes(32, "big")
            tail += _encode_one(t, v)
        else:
            head += _encode_one(t, v)
    return head + tail


def _encode_one(t, v) -> bytes:
    k = t[0]
    if k == "string":
        b = v.encode()
        return len(b).to_bytes(32, "big") + b + b"\x00" * ((-len(b)) % 32)
    if k == "array":
        return len(v).to_bytes(32, "big") + abi_encode([t[1]] * len(v), v)
    if k == "tuple":
        return abi_encode(t[1], v)
    return _word(t, v)


TAG_T = ("tuple", [("string",), ("int", 128), ("int", 128), ("int", 128), ("uint", 8)])
POLICY_T = ("tuple", [("uint", 64), ("uint", 32), ("uint", 32), ("uint", 8), ("uint", 8), ("int", 16), ("uint", 64),
                      ("uint", 64), ("uint", 64), ("uint", 64), ("bool",), ("bool",), ("bool",), ("array", ("address",))])


def set_id(s: dict) -> str:
    p = s["policy"]
    pol = [p["theta"], p["rhoN"], p["rhoD"], p["minAnchors"], p["vetoQuorum"], p["vetoMax"], p["maxAge"],
           p["minRefresh"], p["slackRefresh"], p["eLowMax"], p["strictTransfer"], p["registryVerified"],
           p["ownerFallback"], p["submitters"]]
    tags = [[t["tag"], t["min"], t["neutral"], t["max"], t["kind"]] for t in s["tags"]]
    enc = abi_encode([("array", ("address",)), ("array", ("uint", 64)), ("uint", 32), ("uint", 32), ("bytes32",),
                      ("array", TAG_T), POLICY_T],
                     [s["anchors"], s["lambdas"], s["alphaN"], s["alphaD"], s["tagSchemaHash"], tags, pol])
    return "0x" + keccak256(enc).hex()

# ----------------------------------------------------------------------------------------------- section 3


def tag_key(tag: str) -> bytes:
    """Section 3.1: a tag is identified by keccak256 of its exact bytes, never by its text."""
    return keccak256(tag.encode("utf-8"))


def tag_specs(tags) -> dict:
    """{keccak256(tag): spec} from the `tags` of a set (list) or of pair-edge.json (dict keyed by the tag text)."""
    items = tags.items() if isinstance(tags, dict) else ((t["tag"], t) for t in tags)
    return {tag_key(name): {"min": int(t["min"]), "neutral": int(t["neutral"]), "max": int(t["max"]),
                            "kind": int(t["kind"])} for name, t in items}


def quantize(value: int, decimals: int, mn: int, neutral: int, mx: int) -> int | None:
    """Section 3.2. None = invalid feedback."""
    if decimals > 18:
        return None
    x = value * 10 ** (18 - decimals)
    if x < mn or x > mx:
        return None
    if x > neutral:
        return (x - neutral) * GRID // (mx - neutral)
    if x < neutral:
        return -((neutral - x) * GRID // (neutral - mn))
    return 0


def pair_edge(history: list[dict], specs: dict, controller: bool) -> tuple[int, int] | None:
    """Section 3.3. history: feedback of one (client, agent) pair {tag1, value, decimals, index, revoked}.
    Returns (w, feedbackIndex) or None (no edge)."""
    latest: dict[bytes, dict] = {}
    for f in history:
        h = tag_key(f["tag1"])
        t = specs.get(h)
        if f["revoked"] or t is None or t["kind"] != 0:
            continue
        if h not in latest or f["index"] > latest[h]["index"]:
            latest[h] = f
    ws = []
    for h, f in latest.items():
        t = specs[h]
        w = quantize(int(f["value"]), f["decimals"], t["min"], t["neutral"], t["max"])
        if w is not None and w != 0:
            ws.append((w, f["index"]))
    neg = [x for x in ws if x[0] < 0]
    if neg:
        best = min(neg, key=lambda x: (x[0], -x[1]))
    elif ws:
        best = max(ws, key=lambda x: (x[0], x[1]))
    else:
        return None
    if controller and best[0] > 0:  # rule 4: only a controller's POSITIVE weight is rejected
        return None
    return best


class Registry:
    """The registry state of a self-contained vector (`registry` block): agents, operators, feedback. Feedback
    indices are per (client, agent) pair, from 1, in the order of the block."""

    def __init__(self, blk: dict):
        self.agents = {a["agentId"]: {"owner": a["owner"].lower(), "wallet": a["agentWallet"].lower(),
                                      "approved": a["approved"].lower()} for a in blk["agents"]}
        self.ops = {(o["owner"].lower(), o["operator"].lower()) for o in blk["operators"]}
        self.fb: dict[tuple[str, int], list[dict]] = {}
        for f in blk["feedbacks"]:
            self.give(f["client"], f["agentId"], f["value"], f["decimals"], f["tag1"], f["revoked"])

    def give(self, client: str, j: int, value, decimals: int, tag1: str, revoked: bool = False) -> int:
        lst = self.fb.setdefault((client.lower(), j), [])
        lst.append({"tag1": tag1, "value": str(value), "decimals": decimals, "index": len(lst) + 1,
                    "revoked": revoked})
        return len(lst)

    def revoke(self, client: str, j: int, index: int) -> None:
        self.fb[(client.lower(), j)][index - 1]["revoked"] = True

    def exists(self, j: int) -> bool:
        return j in self.agents

    def controllers(self, j: int) -> set[str]:
        a = self.agents[j]
        out = {a["owner"], a["wallet"], a["approved"]} | {op for (o, op) in self.ops if o == a["owner"]}
        out.discard(ZERO)
        return out

    def pair(self, client: str, j: int, specs: dict) -> tuple[int, int] | None:
        if not self.exists(j):
            return None
        return pair_edge(self.fb.get((client.lower(), j), []), specs, client.lower() in self.controllers(j))

    def last_feedback(self, client: str, j: int) -> dict | None:
        lst = self.fb.get((client.lower(), j), [])
        return lst[-1] if lst else None

# ----------------------------------------------------------------------------------------------- section 5


def row_bytes(r: dict, W: int, committed_splus: int) -> bytes:
    """Section 5.4, canonical encoding of a row given as JSON. committed_splus = positive sum of the row's own edges
    (or of its source for an alias)."""
    is_alias = r["aliasOf"] is not None
    hdr = 0
    out = b""
    src = r["source"]
    if src is not None:
        hdr |= 0x8000
    declare = (not is_alias) and int(r["sPlus"]) > committed_splus
    if declare:
        hdr |= 0x4000
    if is_alias:
        hdr |= 0x2000
    if r["via"] == "owner":
        hdr |= 0x1000
    if not is_alias:
        hdr |= len(r["edges"])
    out += r["u"].to_bytes(W, "big") + hdr.to_bytes(2, "big")
    if src is not None:
        out += bytes.fromhex(src[2:])
    if declare:
        out += int(r["sPlus"]).to_bytes(4, "big")
    if is_alias:
        out += r["aliasOf"].to_bytes(W, "big")
    else:
        for e in r["edges"]:
            out += e["dst"].to_bytes(W, "big") + (e["w"] % 65536).to_bytes(2, "big") + e["feedbackIndex"].to_bytes(4, "big")
    return out


def decode_rows(blob: bytes) -> tuple[int, list[dict]]:
    """Section 5.4, the other way: rows calldata -> [{u, hdr, src, sPlus, ref, edges[(dst, w, fidx)], raw}]."""
    W = blob[0]
    n = int.from_bytes(blob[1:5], "big")
    off, rows = 5, []
    for _ in range(n):
        start = off
        u = int.from_bytes(blob[off:off + W], "big")
        hdr = int.from_bytes(blob[off + W:off + W + 2], "big")
        off += W + 2
        r = {"u": u, "hdr": hdr, "src": None, "sPlus": None, "ref": None, "edges": []}
        if hdr & 0x8000:
            r["src"] = "0x" + blob[off:off + 20].hex()
            off += 20
        if hdr & 0x4000:
            r["sPlus"] = int.from_bytes(blob[off:off + 4], "big")
            off += 4
        if hdr & 0x2000:
            r["ref"] = int.from_bytes(blob[off:off + W], "big")
            off += W
        else:
            for _ in range(hdr & 0x0FFF):
                dst = int.from_bytes(blob[off:off + W], "big")
                w = int.from_bytes(blob[off + W:off + W + 2], "big", signed=True)
                fi = int.from_bytes(blob[off + W + 2:off + W + 6], "big")
                r["edges"].append((dst, w, fi))
                off += W + 6
        r["raw"] = blob[start:off]
        rows.append(r)
    if off != len(blob):
        raise ValueError("rows: trailing bytes")
    return W, rows


def json_rows(v: dict) -> list[dict]:
    """The JSON rows of a vector in the decoded form."""
    out = []
    for r in v["rows"]:
        is_alias = r["aliasOf"] is not None
        sp = sum(e["w"] for e in r["edges"] if e["w"] > 0)
        out.append({"u": r["u"], "hdr": (0x8000 if r["source"] else 0) | (0x2000 if is_alias else 0)
                    | (0x1000 if r["via"] == "owner" else 0) | (0 if is_alias else len(r["edges"]))
                    | (0x4000 if (not is_alias and int(r["sPlus"]) > sp) else 0),
                    "src": r["source"].lower() if r["source"] else None,
                    "sPlus": int(r["sPlus"]) if (not is_alias and int(r["sPlus"]) > sp) else None,
                    "ref": r["aliasOf"], "edges": [] if is_alias else [(e["dst"], e["w"], e["feedbackIndex"])
                                                                       for e in r["edges"]]})
    return out


def merkle(leaves: list[bytes]) -> bytes:
    if not leaves:
        return b"\x00" * 32
    lv = list(leaves)
    while len(lv) > 1:
        nxt = [keccak256(lv[2 * i] + lv[2 * i + 1]) for i in range(len(lv) // 2)]
        if len(lv) % 2:
            nxt.append(lv[-1])
        lv = nxt
    return lv[0]


def ceil_div(a: int, b: int) -> int:
    return -((-a) // b)


def parse_vectors(blob: bytes, n: int, k: int) -> tuple[list[list[int]], list[int]]:
    rec = (k + 1) * 8
    t = [[int.from_bytes(blob[i * rec + 8 * a:i * rec + 8 * a + 8], "big") for i in range(n)] for a in range(k)]
    fp = [int.from_bytes(blob[i * rec + 8 * k:i * rec + 8 * k + 8], "big") for i in range(n)]
    return t, fp


class Cert:
    """A certificate: rows (alias edges expanded), t, and the set parameters. Built from the JSON fields of a vector,
    or from calldata (`rows`, `vectors`) for the refusal and resubmission cases."""

    def __init__(self, v: dict, rows: list[dict] | None = None, t=None, fp=None, n: int | None = None):
        s = v["set"]
        self.v = v
        self.k = len(s["anchors"])
        self.anchors = [a.lower() for a in s["anchors"]]
        self.n = v["nCert"] if n is None else n
        self.aN, self.aD = s["alphaN"], s["alphaD"]
        self.om = self.aD - self.aN
        self.lam = [int(x) for x in s["lambdas"]]
        self.t = t if t is not None else [[int(x) for x in col] for col in v["vectors"]["t"]]
        self.fp = fp if fp is not None else [int(x) for x in v["vectors"]["ownerFp"]]
        self.W = 2 if self.n <= 0xFFFF else 4
        self.drows = rows if rows is not None else json_rows(v)
        by_u = {r["u"]: r for r in self.drows}
        self.rows = []  # (u, edges[(dst, w)], sPlus declared or 0, committed S+, S-)
        for r in self.drows:
            src = by_u[r["ref"]] if r["ref"] is not None else r
            edges = [(d, w) for d, w, _ in src["edges"]]
            sp = sum(w for _, w in edges if w > 0)
            sn = sum(-w for _, w in edges if w < 0)
            decl = src["sPlus"] or 0
            self.rows.append((r["u"], edges, decl, sp, sn))

    def verify(self) -> dict:
        """Section 5.6. Returns the recomputed quantities; raises AssertionError('NotSubSolution(a, i)')."""
        k, n, aN, aD, om = self.k, self.n, self.aN, self.aD, self.om
        y = [[0] * n for _ in range(k)]
        d = [0] * n
        marg = [0] * k
        epos = 0
        has_row = [False] * n
        veto = [0] * n
        for (u, edges, decl, sp, sn) in self.rows:
            has_row[u] = True
            bp = max(GRID, decl if decl else sp)
            bm = max(GRID, sn)
            T = ceil_div(sum(self.lam[a] * self.t[a][u] for a in range(k)), WAD)
            for (j, w) in edges:
                if w > 0:
                    epos += 1
                    for a in range(k):
                        y[a][j] += self.t[a][u] * om * w // (aD * bp)
                else:
                    d[j] += ceil_div(T * om * (-w), aD * bm)
                    if u < k and w <= self.v["set"]["policy"]["vetoMax"]:
                        veto[j] |= 1 << u
            if decl > sp:
                for a in range(k):
                    if self.t[a][u]:
                        marg[a] += ceil_div(self.t[a][u] * om * (decl - sp), aD * bp)
        r, eup, q, mass = [], [], [], []
        for a in range(k):
            y[a][a] += aN * WAD // aD
            s = epos + 1 + marg[a]
            for i in range(n):
                if self.t[a][i] > y[a][i]:
                    raise AssertionError(f"NotSubSolution({a}, {i})")
                s += y[a][i] - self.t[a][i]
                if self.t[a][i] and not has_row[i]:
                    s += ceil_div(self.t[a][i] * om, aD)
            r.append(s)
            eup.append(ceil_div(s * aD, aN))
            q.append(ceil_div((s - epos - 1) * aD, aN))
            mass.append(sum(self.t[a]))
        agg = lambda e: sum(ceil_div(self.lam[a] * e[a], WAD) for a in range(k))
        return {"r": r, "e": eup, "eEff": agg(eup), "qEff": agg(q), "d": d,
                "mass": sum(self.lam[a] * mass[a] // WAD for a in range(k)), "distrustMass": sum(d), "veto": veto}

    def roots(self) -> tuple[str, str, bytes]:
        rows_by_u = {r["u"]: r for r in self.v["rows"]}
        blob = self.W.to_bytes(1, "big") + len(self.v["rows"]).to_bytes(4, "big")
        leaves = []
        for r in self.v["rows"]:
            src = rows_by_u[r["aliasOf"]] if r["aliasOf"] is not None else r
            sp = sum(e["w"] for e in src["edges"] if e["w"] > 0)
            rb = row_bytes(r, self.W, sp)
            leaves.append(keccak256(rb))
            blob += rb
        vec = b""
        for i in range(self.n):
            for a in range(self.k):
                vec += self.t[a][i].to_bytes(8, "big")
            vec += self.fp[i].to_bytes(8, "big")
        return "0x" + merkle(leaves).hex(), "0x" + keccak256(vec).hex(), blob


def node_table(v: dict) -> list[dict]:
    return sorted(v["nodes"], key=lambda nd: nd["i"])


def refusal(v: dict, cert: Cert, *, inline_nodes: bool = False, reg: Registry | None = None,
            facts: "Facts | None" = None) -> str | None:
    """What a conforming aggregator does with a submission: None (accepted) or the refusal of section 10, checked
    in the order of the reference implementation (node table, arithmetic pass, second pass, fingerprints)."""
    pol = v["set"]["policy"]
    open_set = not pol["submitters"]
    nodes = node_table(v)
    kind = {nd["i"]: nd["kind"] for nd in nodes}
    agent_of = {nd["i"]: nd["agentId"] for nd in nodes if nd["kind"] == "agent"}
    addr_of = {nd["i"]: nd["address"].lower() for nd in nodes if nd["kind"] in ("anchor", "address")}
    # section 5.1: the node table
    if any(nd["kind"] == "address" and nd["address"].lower() == ZERO for nd in nodes):
        return "BadNodes()"
    if inline_nodes and open_set:
        return "BadNodes()"
    # section 5.4 / 5.6, arithmetic pass: declared sPlus strictly above the committed positive sum
    for ri, r in enumerate(cert.drows):
        if r["sPlus"] is not None and r["ref"] is None:
            if r["sPlus"] <= sum(w for _, w, _ in r["edges"] if w > 0):
                return f"NotCanonical({ri})"
    try:
        out = cert.verify()
    except AssertionError as x:
        return str(x)
    specs = tag_specs(v["set"]["tags"])
    by_u = {r["u"]: r for r in cert.drows}
    # second pass: canonical SRC, anchors never a source, shape, registry re-reads, proven facts
    for ri, r in enumerate(cert.drows):
        if r["hdr"] & 0x8000:
            if r["src"] == ZERO:
                return f"NotCanonical({ri})"
            if r["src"] in cert.anchors:
                return f"AnchorAsSource({r['u']})"
        if r["ref"] is not None and kind.get(r["ref"]) != "agent":
            return f"NotCanonical({ri})"
        if r["u"] < cert.k:
            client = cert.anchors[r["u"]]
        elif kind[r["u"]] == "address":
            client = addr_of[r["u"]]
        else:
            client = r["src"]
        if reg is not None and pol["registryVerified"] and kind[r["u"]] == "agent":
            a = reg.agents.get(agent_of[r["u"]])
            via = bool(r["hdr"] & 0x1000)
            ok = a is not None and ((r["src"] is None and a["wallet"] == ZERO)
                                    or (r["src"] is not None and not via and a["wallet"] == r["src"])
                                    or (r["src"] is not None and via and a["wallet"] == ZERO and a["owner"] == r["src"]))
            if not ok:
                return f"EdgeMismatch({ri}, 256)"
        for e, (dst, w, fi) in enumerate(r["edges"]):
            if kind.get(dst) != "agent":
                return f"EdgeMismatch({ri}, {e})"
            if reg is not None and pol["registryVerified"]:
                if reg.pair(client, agent_of[dst], specs) != (w, fi):
                    return f"EdgeMismatch({ri}, {e})"
        if facts is not None:
            edges = by_u[r["ref"]]["edges"] if r["ref"] is not None else r["edges"]
            bad = facts.contradicts(v, r, client, edges, agent_of)
            if bad:
                return f"ProvenRowResubmitted({r['u']})"
    for a in range(cert.k):
        if cert.fp[a] != 0:
            return f"EdgeMismatch({U256_MAX}, {a})"
    if reg is not None and pol["registryVerified"]:
        for i in range(cert.k, cert.n):
            massive = any(cert.t[a][i] for a in range(cert.k))
            if kind[i] == "address" and cert.fp[i] != 0:
                return f"EdgeMismatch({U256_MAX}, {i})"
            if kind[i] == "agent" and massive:
                ag = reg.agents.get(agent_of[i])
                if ag is None or cert.fp[i] != int(ag["owner"], 16) & LANE:
                    return f"EdgeMismatch({U256_MAX}, {i})"
    return None


class Facts:
    """Section 5.10: edge facts (client, agentId) -> w and source facts (u, src, viaOwner)."""

    def __init__(self):
        self.edge: dict[tuple[str, int], int] = {}
        self.source: set[tuple[int, str, bool]] = set()

    def contradicts(self, v: dict, r: dict, client: str | None, edges: list, agent_of: dict) -> bool:
        kind_u = "agent" if r["u"] in agent_of else "other"
        if kind_u == "agent" and (r["u"], r["src"] or ZERO, bool(r["hdr"] & 0x1000)) in self.source:
            return True
        if client is None:
            return False
        node_of = {j: i for i, j in agent_of.items()}
        self_agent = agent_of.get(r["u"])
        s_committed = sum(w for _, w, _ in edges if w > 0)
        s_pos = s_committed
        for (c, j), want in self.edge.items():
            if c != client or j == self_agent:
                continue
            have = next((w for d, w, _ in edges if d == node_of.get(j)), 0)
            if have == want:
                continue
            if have == 0 and want > 0:
                s_pos += want
                continue
            return True
        decl = r["sPlus"] or 0
        return s_pos > s_committed and decl < s_pos


def exact_fixed_point(n: int, k: int, alpha: Fraction, rows: list) -> list[list[Fraction]]:
    """t*^(a) of section 4.1, exactly: solve (I - (1 - alpha) C^T) t = alpha * e_a by sparse elimination.
    rows: (u, edges[(dst, w)], bplus). Returns t*[a][v] in WAD units (Fractions)."""
    A = [dict() for _ in range(n)]
    for v in range(n):
        A[v][v] = Fraction(1)
    for (u, edges, bp) in rows:
        for (j, w) in edges:
            if w > 0:
                A[j][u] = A[j].get(u, Fraction(0)) - (1 - alpha) * Fraction(w, bp)
    out = []
    for a in range(k):
        M = [dict(r) for r in A]
        b = [Fraction(0)] * n
        b[a] = alpha * WAD
        for p in range(n):  # diagonally dominant by column: no pivoting needed
            piv = M[p][p]
            for i in range(p + 1, n):
                f = M[i].get(p)
                if f:
                    f = f / piv
                    for c, val in M[p].items():
                        M[i][c] = M[i].get(c, Fraction(0)) - f * val
                    del M[i][p]
                    b[i] -= f * b[p]
        x = [Fraction(0)] * n
        for p in range(n - 1, -1, -1):
            acc = b[p] - sum(val * x[c] for c, val in M[p].items() if c > p)
            x[p] = acc / M[p][p]
        out.append(x)
    return out


def exact_distrust(n: int, k: int, alpha: Fraction, lam: list, tstar: list, rows: list) -> list[Fraction]:
    d = [Fraction(0)] * n
    for (u, edges, bm) in rows:
        T = sum(Fraction(lam[a], WAD) * tstar[a][u] for a in range(k))
        for (j, w) in edges:
            if w < 0:
                d[j] += (1 - alpha) * T * Fraction(-w, bm)
    return d

# ----------------------------------------------------------------------------------------------- section 6


class Proofs:
    """Section 6: per-column bounds of the current certificate and the state of each row after proofs."""

    def __init__(self, cert: Cert, eup: list[int]):
        self.cert = cert
        self.elow = [0] * cert.k
        self.eup = list(eup)
        self.state: dict[int, dict] = {}

    def eff(self) -> tuple[int, int]:
        c = self.cert
        return (sum(ceil_div(c.lam[a] * self.elow[a], WAD) for a in range(c.k)),
                sum(ceil_div(c.lam[a] * self.eup[a], WAD) for a in range(c.k)))

    def _row(self, u: int):
        return next(r for r in self.cert.rows if r[0] == u)

    def _bill(self, u: int, dim_need: int, p_need: int, n_need: int) -> None:
        c = self.cert
        _, _, decl, s0, _ = self._row(u)
        b0 = max(GRID, decl if decl else s0)
        st = self.state.setdefault(u, {"am": {}, "dim": 0, "incP": 0, "incN": 0, "voided": False})
        dim_need = min(dim_need, ceil_div(s0 * WAD, b0))
        p_need, n_need = min(p_need, WAD), min(n_need, WAD)
        prepaid = (decl - s0) * WAD // b0 if decl else 0
        sat = lambda a, b: a - b if a > b else 0
        dim = sat(dim_need, st["dim"])
        inc = 0
        if p_need > st["incP"]:
            inc = sat(p_need, prepaid) - sat(st["incP"], prepaid)
            st["incP"] = p_need
        if n_need > st["incN"]:
            inc += n_need - st["incN"]
            st["incN"] = n_need
        st["dim"] += dim
        for a in range(c.k):
            t = c.t[a][u]
            self.elow[a] += ceil_div(t * c.om * dim, c.aN * WAD)
            self.eup[a] += ceil_div(t * c.om * inc, c.aN * WAD)

    def amends(self, u: int) -> list[tuple[int, int, int]]:
        st = self.state.get(u)
        return [(j, wc, wn) for j, (wc, wn) in st["am"].items()] if st else []

    def prove_edge(self, u: int, agent_id: int, agent_node: int | None, w_new: int) -> None:
        """Section 6.1, formula X: bounds of the amended row against the COMMITTED row, billed beyond what the row
        already paid."""
        _, edges, decl, s0, n0 = self._row(u)
        st = self.state.setdefault(u, {"am": {}, "dim": 0, "incP": 0, "incN": 0, "voided": False})
        assert not st["voided"], "row voided"
        w_committed = next((w for (j, w) in edges if j == agent_node), 0) if agent_node is not None else 0
        w_old = st["am"][agent_id][1] if agent_id in st["am"] else w_committed
        assert w_new != w_old, "nothing to prove"
        wc0 = st["am"][agent_id][0] if agent_id in st["am"] else w_committed
        st["am"][agent_id] = (wc0, w_new)
        pos = lambda w: w if w > 0 else 0
        c_out = sum(pos(wc) for wc, _ in st["am"].values())
        p_in = sum(pos(wn) for _, wn in st["am"].values())
        n_out = sum(pos(-wc) for wc, _ in st["am"].values())
        n_in = sum(pos(-wn) for _, wn in st["am"].values())
        d_eff = decl if decl else s0
        s_cur = s0 - c_out + p_in
        x = d_eff - c_out + p_in
        b0, bh = max(GRID, d_eff), max(GRID, x)
        su = s0 - c_out
        sat = lambda a, b: a - b if a > b else 0
        dfc = (su * (bh - b0) if bh > b0 else 0) + sum(sat(pos(wc) * bh, pos(wn) * b0) for wc, wn in st["am"].values())
        exc = (su * (b0 - bh) if b0 > bh else 0) + (x - s_cur) * b0 \
            + sum(sat(pos(wn) * b0, pos(wc) * bh) for wc, wn in st["am"].values())
        n_cur = n0 - n_out + n_in
        bn0, bnh = max(GRID, n0), max(GRID, n_cur)
        exc_n = ((n0 - n_out) * (bn0 - bnh) if bn0 > bnh else 0) \
            + sum(sat(pos(-wn) * bn0, pos(-wc) * bnh) for wc, wn in st["am"].values())
        self._bill(u, ceil_div(dfc * WAD, b0 * bh), ceil_div(exc * WAD, b0 * bh), ceil_div(exc_n * WAD, bn0 * bnh))

    def prove_wallet(self, u: int) -> None:
        """Section 6.2: worst case on every side, then the row is void."""
        self._bill(u, WAD, WAD, WAD)
        self.state[u]["voided"] = True

def true_bounds_hold(v: dict, cert: Cert, reg: Registry, pr: "Proofs") -> tuple[bool, str]:
    """Lemma L6 after proofs, in exact arithmetic: rebuild the TRUE graph from the registry (every client of a
    committed row, with its current source; agents absent from the node table get extra nodes), then check
    ||(t - t*)+||_1 <= eLow_a and ||t* - t||_1 <= eUp_a for every column, and d* <= d + eEff."""
    specs = tag_specs(v["set"]["tags"])
    kind = {nd["i"]: nd["kind"] for nd in v["nodes"]}
    agent_of = {nd["i"]: nd["agentId"] for nd in v["nodes"] if nd["kind"] == "agent"}
    node_of = {j: i for i, j in agent_of.items()}
    n = cert.n
    extra: dict[int, int] = {}
    rows_t, rows_n = [], []
    for r in cert.drows:
        u = r["u"]
        if u < cert.k:
            client = cert.anchors[u]
        elif kind[u] == "address":
            client = next(nd["address"].lower() for nd in v["nodes"] if nd["i"] == u)
        else:
            a = reg.agents[agent_of[u]]
            client = a["wallet"] if a["wallet"] != ZERO else None
            if client in cert.anchors:
                client = None
        edges = []
        if client is not None:
            for (c, j) in sorted(reg.fb):
                if c != client or j == agent_of.get(u):
                    continue
                pe = reg.pair(c, j, specs)
                if pe is None:
                    continue
                if j not in node_of and j not in extra:
                    extra[j] = n + len(extra)
                edges.append((node_of.get(j, extra.get(j)), pe[0]))
        sp = sum(w for _, w in edges if w > 0)
        sn = sum(-w for _, w in edges if w < 0)
        rows_t.append((u, edges, max(GRID, sp)))
        rows_n.append((u, edges, max(GRID, sn)))
    N = n + len(extra)
    alpha = Fraction(cert.aN, cert.aD)
    tstar = exact_fixed_point(N, cert.k, alpha, rows_t)
    dstar = exact_distrust(N, cert.k, alpha, cert.lam, tstar, rows_n)
    t = [cert.t[a] + [0] * len(extra) for a in range(cert.k)]
    out = cert.verify()
    _, e_eff = pr.eff()
    d = out["d"] + [0] * len(extra)
    for a in range(cert.k):
        over = sum(max(Fraction(t[a][i]) - tstar[a][i], 0) for i in range(N))
        gap = sum(abs(tstar[a][i] - t[a][i]) for i in range(N))
        if over > pr.elow[a]:
            return False, f"||(t - t*)+|| {float(over)} > eLow {pr.elow[a]} (column {a})"
        if gap > pr.eup[a]:
            return False, f"||t* - t|| {float(gap)} > eUp {pr.eup[a]} (column {a})"
    if any(dstar[i] > d[i] + e_eff for i in range(N)):
        return False, "d* > d + eEff"
    return True, ""

# ----------------------------------------------------------------------------------------------- section 8


def readings(v: dict, cert: Cert, out: dict, reg: Registry | None, agent: int) -> dict:
    """Section 4.4 and 8: what assess / passesAnchorPolicy return for `agent` after an accepted submission."""
    pol = v["set"]["policy"]
    specs = tag_specs(v["set"]["tags"])
    idx = {nd.get("agentId"): nd["i"] for nd in v["nodes"] if nd["kind"] == "agent"}
    i = idx.get(agent)
    c = [cert.lam[a] * cert.t[a][i] // WAD if i is not None else 0 for a in range(cert.k)]
    m = pol["minAnchors"]
    tr = sum(c) - sum(sorted(c, reverse=True)[:m - 1]) if m > 1 else sum(c)
    d = out["d"][i] if i is not None else 0
    bits = [bool(i is not None and out["veto"][i] >> a & 1) for a in range(cert.k)]
    live, by_appr = [False] * cert.k, []
    if reg is not None and reg.exists(agent):
        for a, anc in enumerate(cert.anchors):
            f = reg.last_feedback(anc, agent)
            if f and not f["revoked"]:
                t = specs.get(tag_key(f["tag1"]))
                if t and t["kind"] == 0:
                    w = quantize(int(f["value"]), f["decimals"], t["min"], t["neutral"], t["max"])
                    live[a] = w is not None and w <= pol["vetoMax"]
            ag = reg.agents[agent]
            if pol["strictTransfer"] and (anc == ag["approved"] or (ag["owner"], anc) in reg.ops):
                by_appr.append(anc)
    vetoes = sum(1 for a in range(cert.k) if bits[a] or live[a] or cert.anchors[a] in by_appr)
    passes = (vetoes < pol["vetoQuorum"] and tr >= int(pol["theta"])
              and pol["rhoD"] * (d + out["eEff"]) <= pol["rhoN"] * tr)
    return {"contributions": [str(x) for x in c], "trustRobust": str(tr), "distrust": str(d), "vetoBits": bits,
            "vetoByApproval": by_appr, "passesAnchorPolicy": passes}

# ----------------------------------------------------------------------------------------------- runners


def check(cond: bool, what: str, errors: list) -> None:
    if not cond:
        errors.append(what)


def run_quantization(path: Path, verbose: bool) -> list:
    errs = []
    data = json.loads(path.read_text())
    for c in data["cases"]:
        t = data["tags"][c["tag"]]
        got = quantize(int(c["value"]), c["decimals"], int(t["min"]), int(t["neutral"]), int(t["max"]))
        exp = None if c["expected"] == "invalid" else c["expected"]
        check(got == exp, f"{path.name}: {c['id']} got {got} expected {exp}", errs)
    return errs


def run_pair_edges(path: Path, verbose: bool) -> list:
    errs = []
    data = json.loads(path.read_text())
    specs = tag_specs(data["tags"])
    for c in data["cases"]:
        got = pair_edge(c["feedback"], specs, c.get("controller", False))
        exp = None if c["expected"] is None else (c["expected"]["w"], c["expected"]["feedbackIndex"])
        check(got == exp, f"{path.name}: {c['id']} got {got} expected {exp}", errs)
    return errs


def run_certificate(path: Path, verbose: bool, exact: bool = True, v: dict | None = None) -> tuple[list, Cert, dict]:
    errs = []
    v = v if v is not None else json.loads(path.read_text())
    cert = Cert(v)
    ex = v["expected"]
    check(set_id(v["set"]) == v["set"]["setId"], f"{path.name}: setId", errs)
    out = cert.verify()
    for key in ("eEff", "qEff", "mass", "distrustMass"):
        check(str(out[key]) == str(ex[key]), f"{path.name}: {key} got {out[key]} expected {ex[key]}", errs)
    check([str(x) for x in out["r"]] == [str(x) for x in ex["r"]], f"{path.name}: r {out['r']} vs {ex['r']}", errs)
    check([str(x) for x in out["e"]] == [str(x) for x in ex["e"]], f"{path.name}: e {out['e']} vs {ex['e']}", errs)
    check([str(x) for x in out["d"]] == [str(x) for x in ex["d"]], f"{path.name}: d", errs)
    groot, vroot, blob = cert.roots()
    check(groot == ex["graphRoot"], f"{path.name}: graphRoot {groot}", errs)
    check(vroot == ex["vectorRoot"], f"{path.name}: vectorRoot {vroot}", errs)
    if "calldata" in v:
        check("0x" + blob.hex() == v["calldata"]["rows"], f"{path.name}: rows calldata", errs)
        _, dec = decode_rows(blob)
        strip = lambda rs: [{k: r[k] for k in ("u", "hdr", "src", "sPlus", "ref", "edges")} for r in rs]
        check(strip(dec) == strip(json_rows(v)), f"{path.name}: decoded rows differ from the JSON rows", errs)
    if exact and cert.n <= 300:
        alpha = Fraction(cert.aN, cert.aD)
        rows_c = [(u, e, max(GRID, decl if decl else sp)) for (u, e, decl, sp, sn) in cert.rows]
        tstar = exact_fixed_point(cert.n, cert.k, alpha, rows_c)
        for a in range(cert.k):
            for i in range(cert.n):
                check(cert.t[a][i] <= tstar[a][i], f"{path.name}: t > t* at ({a},{i})", errs)
            gap = sum(tstar[a][i] - cert.t[a][i] for i in range(cert.n))
            check(gap <= out["e"][a], f"{path.name}: ||t*-t|| {float(gap)} > eUp {out['e'][a]}", errs)
        if verbose:
            print(f"   exact: t <= t*, max gap {max(float(sum(tstar[a][i] - cert.t[a][i] for i in range(cert.n))) for a in range(cert.k)):.1f} wei")
    return errs, cert, out


def run_accepted_certificate(path: Path, verbose: bool) -> list:
    errs, cert, _ = run_certificate(path, verbose)
    v = json.loads(path.read_text())
    got = refusal(v, cert)
    check(got is None, f"{path.name}: a conforming aggregator refuses it: {got}", errs)
    return errs


def run_violation(path: Path, honest_dir: Path, verbose: bool) -> list:
    errs, cert, out = run_certificate(path, verbose, exact=False)
    v = json.loads(path.read_text())
    honest = json.loads((honest_dir / v["violation"]["honestVector"]).read_text())
    key = lambda nd: nd.get("agentId", nd.get("address"))
    idx = {key(nd): nd["i"] for nd in v["nodes"]}
    hn = {nd["i"]: key(nd) for nd in honest["nodes"]}
    # honest nodes absent from this certificate get extra indices >= nCert, where t and d are zero
    N = cert.n
    for i in sorted(hn):
        if hn[i] not in idx:
            idx[hn[i]] = N
            N += 1
    # the TRUE graph = the honest vector's rows, re-indexed on this certificate's node table
    true_rows, true_neg = [], []
    for r in honest["rows"]:
        if hn[r["u"]] not in idx:
            continue
        u = idx[hn[r["u"]]]
        edges = [(idx[hn[e["dst"]]], e["w"]) for e in r["edges"] if hn[e["dst"]] in idx]
        true_rows.append((u, edges, max(GRID, int(r["sPlus"]))))
        true_neg.append((u, edges, max(GRID, sum(-w for _, w in edges if w < 0))))
    alpha = Fraction(cert.aN, cert.aD)
    tstar = exact_fixed_point(N, cert.k, alpha, true_rows)
    dstar = exact_distrust(N, cert.k, alpha, cert.lam, tstar, true_neg)
    t_ext = [cert.t[a] + [0] * (N - cert.n) for a in range(cert.k)]
    d_ext = out["d"] + [0] * (N - cert.n)
    over = [sum(max(Fraction(t_ext[a][i]) - tstar[a][i], 0) for i in range(N)) for a in range(cert.k)]
    under_d = max(dstar[i] - (d_ext[i] + out["eEff"]) for i in range(N))
    check(any(o > 0 for o in over) or under_d > 0, f"{path.name}: the committed graph should violate the guarantee", errs)
    for scen in v["violation"]["proofs"]:
        pr = Proofs(cert, out["e"])
        for p in scen["steps"]:
            j = idx.get(p["agentId"])
            pr.prove_edge(p["row"], p["agentId"], j if j is not None and j < cert.n else None, p["wNew"])
        elow_eff, eup_eff = pr.eff()
        m = scen["measured"]
        check(str(elow_eff) == m["eLowEffAfter"], f"{path.name} [{scen['level']}]: eLowEff {elow_eff} vs {m['eLowEffAfter']}", errs)
        check(str(eup_eff) == m["eEffAfter"], f"{path.name} [{scen['level']}]: eEff {eup_eff} vs {m['eEffAfter']}", errs)
        for a in range(cert.k):  # after the proofs, the bounds hold again for the true graph
            check(over[a] <= pr.elow[a], f"{path.name}: ||(t - t*)+|| > eLow in column {a}", errs)
        check(all(dstar[i] <= d_ext[i] + eup_eff for i in range(N)), f"{path.name}: d* > d + eEff after proofs", errs)
        if verbose:
            print(f"   {scen['level']}: eLowEff {elow_eff}, eEff {eup_eff} (measured: {m['eLowEffAfter']}, {m['eEffAfter']})")
    if verbose:
        print(f"   violation: overstatement {[float(o) for o in over]} wei, distrust shortfall {float(max(under_d, 0)):.0f} wei")
    return errs


def _cert_from_calldata(v: dict, cd: dict, n: int | None = None) -> Cert:
    n = v["nCert"] if n is None else n
    _, rows = decode_rows(bytes.fromhex(cd["rows"][2:]))
    t, fp = parse_vectors(bytes.fromhex(cd["vectors"][2:]), n, len(v["set"]["anchors"]))
    return Cert(v, rows=rows, t=t, fp=fp, n=n)


def run_common(path: Path, verbose: bool) -> list:
    v = json.loads(path.read_text())
    errs: list = []
    reg = Registry(v["registry"]) if "registry" in v else None
    cert = _cert_from_calldata(v, v["calldata"])
    check(set_id(v["set"]) == v["set"]["setId"], f"{path.name}: setId", errs)
    expect = v["expect"]["submission"]
    got = refusal(v, cert, reg=reg)
    check((got or "ACCEPTED") == expect, f"{path.name}: submission {got or 'ACCEPTED'} expected {expect}", errs)
    if got is None:
        e2, _, out = run_certificate(path, verbose, v=v)
        errs += e2
        for agent, want in v["expect"].get("read", {}).items():
            have = readings(v, cert, out, reg, int(agent))
            for key in want:
                check(have[key] == want[key], f"{path.name}: #{agent} {key} {have[key]} expected {want[key]}", errs)
        then = v["expect"].get("then", {}).get("proveEdge")
        if then:  # section 5.10: the proof records the fact, then the resubmission is refused
            u = then["row"]
            client = cert.anchors[u] if u < cert.k else next(r["src"] for r in cert.drows if r["u"] == u)
            w_now = (reg.pair(client, then["agentJ"], tag_specs(v["set"]["tags"])) or (0, 0))[0]
            facts = Facts()
            facts.edge[(client, then["agentJ"])] = w_now
            n2 = v["resubmission"]["nCert"]
            re = _cert_from_calldata(v, v["resubmission"]["calldata"], n2)
            got2 = refusal(v, re, reg=reg, facts=facts)
            check(got2 == v["expect"]["resubmission"], f"{path.name}: resubmission {got2}", errs)
            ctl = _cert_from_calldata(v, v["control"]["calldata"], n2)
            got3 = refusal(v, ctl, reg=reg, facts=facts)
            check(got3 is None, f"{path.name}: control refused: {got3}", errs)
            if verbose:
                print(f"   fact ({client[:8]}…, {then['agentJ']}) -> {w_now}; resubmission {got2}; control accepted")
    if verbose:
        print(f"   submission: {got or 'ACCEPTED'}")
    return errs


def run_sequence(path: Path, verbose: bool) -> list:
    v = json.loads(path.read_text())
    errs: list = []
    reg = Registry(v["registry"])
    specs = tag_specs(v["set"]["tags"])
    cert = Cert(v)
    facts = Facts()
    pr = None
    agent_of = {nd["i"]: nd["agentId"] for nd in v["nodes"] if nd["kind"] == "agent"}
    node_of = {j: i for i, j in agent_of.items()}
    for i, st in enumerate(v["sequence"]):
        op, m = st["op"], st.get("measured", {})
        where = f"{path.name} step {i} ({op})"
        if op == "submit":
            got = refusal(v, cert, reg=reg, facts=facts) or "ACCEPTED"
            check(got == st["expect"], f"{where}: {got} expected {st['expect']}", errs)
            if got == "ACCEPTED":
                out = cert.verify()
                pr = Proofs(cert, out["e"])
        elif op == "revoke":
            reg.revoke(st["client"], st["agentId"], st["index"])
        elif op == "feedback":
            reg.give(st["client"], st["agentId"], st["value"], st["decimals"], st["tag1"])
        elif op == "setWallet":
            reg.agents[st["agentId"]]["wallet"] = st["wallet"].lower()
        elif op == "proveEdge":
            u = st["row"]
            r = next(x for x in cert.drows if x["u"] == u)
            client = cert.anchors[u] if u < cert.k else r["src"]
            w_now = (reg.pair(client, st["agentId"], specs) or (0, 0))[0]
            check(w_now == st["wNew"], f"{where}: registry weight {w_now} vs {st['wNew']}", errs)
            am = "0x" + "".join(f"{a:08x}{wc % 65536:04x}{wn % 65536:04x}" for a, wc, wn in pr.amends(u))
            check(am == st["amends"], f"{where}: amendment list {am} vs {st['amends']}", errs)
            pr.prove_edge(u, st["agentId"], node_of.get(st["agentId"]), w_now)
            facts.edge[(client, st["agentId"])] = w_now
        elif op == "proveWallet":
            u = st["row"]
            r = next(x for x in cert.drows if x["u"] == u)
            check(reg.agents[agent_of[u]]["wallet"] != r["src"], f"{where}: the source still holds", errs)
            pr.prove_wallet(u)
            facts.source.add((u, r["src"] or ZERO, bool(r["hdr"] & 0x1000)))
        elif op == "clearSourceFact":
            key = (st["node"], st["src"].lower(), st["viaOwner"])
            holds = reg.agents[agent_of[st["node"]]]["wallet"] == st["src"].lower()
            check(key in facts.source and holds, f"{where}: nothing to clear", errs)
            facts.source.discard(key)
        if op in ("proveEdge", "proveWallet"):
            ok, why = true_bounds_hold(v, cert, reg, pr)
            check(ok, f"{where}: bounds do not hold for the registry graph: {why}", errs)
        if "eLowEff" in m:
            lo, up = pr.eff()
            check(str(lo) == m["eLowEff"] and str(up) == m["eEff"],
                  f"{where}: eLowEff/eEff {lo}/{up} vs measured {m['eLowEff']}/{m['eEff']}", errs)
            if verbose:
                print(f"   step {i} {op}: eLowEff {lo}, eEff {up}")
    return errs


def run_refusals(path: Path, root: Path, verbose: bool) -> list:
    data = json.loads(path.read_text())
    base = json.loads((root / data["base"]).read_text())
    reg = Registry(base["registry"])
    errs: list = []
    for c in data["cases"]:
        cd = {"rows": c.get("rows", base["calldata"]["rows"]), "vectors": c.get("vectors", base["calldata"]["vectors"])}
        cert = _cert_from_calldata(base, cd)
        got = refusal(base, cert, inline_nodes="newNodes" in c, reg=reg)
        check(got == c["expect"], f"{path.name}: {c['id']} got {got} expected {c['expect']}", errs)
        if verbose:
            print(f"   {c['id']}: {got}")
    return errs


def main() -> int:
    verbose = "-v" in sys.argv
    root = Path(__file__).resolve().parent / "vectors"
    errors, count = [], 0

    def run(p: Path, fn, *a):
        nonlocal errors, count
        if verbose:
            print(f"-- {p.relative_to(root)}")
        try:
            errors += fn(p, *a, verbose)
        except (AssertionError, KeyError, ValueError) as x:
            errors.append(f"{p.name}: {type(x).__name__} {x}")
        count += 1

    for name, fn in (("quantization.json", run_quantization), ("pair-edge.json", run_pair_edges)):
        if (root / name).exists():
            run(root / name, fn)
    for p in sorted((root / "certificates").glob("*.json")):
        run(p, run_accepted_certificate)
    for p in sorted((root / "violations").glob("*.json")):
        run(p, run_violation, root / "certificates")
    for p in sorted((root / "common").glob("*.json")):
        run(p, run_common)
    for p in sorted((root / "sequences").glob("*.json")):
        run(p, run_sequence)
    if (root / "refusals.json").exists():
        run(root / "refusals.json", run_refusals, root)
    for e in errors:
        print("FAIL", e)
    print(f"{count} files, {len(errors)} failures")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

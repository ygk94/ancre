#!/usr/bin/env python3
"""Independent checker for the test vectors of "Anchored Reputation for Trustless Agents".

Standard library only. It does not import the reference implementation: every quantity is recomputed from
the specification text (sections 2-6) and compared with the expected values stored in the vectors.

    python3 verify.py            # all vectors in ./vectors
    python3 verify.py -v         # with details

What it checks:
  quantization.json   section 3.2   weight of a single feedback
  pair-edge.json      section 3.3   combined pair weight and deciding feedback
  certificates/*.json sections 2.1, 4, 5   setId, row bytes, graphRoot, vectorRoot, sub-solution, r, eUp, q,
                                           eEff, qEff, mass, d, D; then, in exact rational arithmetic,
                                           t <= t* and ||t* - t||_1 <= eUp for the committed graph
  violations/*.json   sections 5, 6       the committed graph is not dominated by the true graph (the
                                           guarantee fails), then the discrepancy proofs restore it, with the
                                           exact eLowEff and eEff measured on the reference implementation
"""
from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

WAD = 10**18
GRID = 10_000
LANE = (1 << 63) - 1

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


def pair_edge(history: list[dict], tags: dict, controller: bool) -> tuple[int, int] | None:
    """Section 3.3. history: feedback of one (client, agent) pair. Returns (w, feedbackIndex) or None."""
    if controller:
        return None
    latest: dict[str, dict] = {}
    for f in history:
        t = tags.get(f["tag1"])
        if f["revoked"] or t is None or t["kind"] != 0:
            continue
        if f["tag1"] not in latest or f["index"] > latest[f["tag1"]]["index"]:
            latest[f["tag1"]] = f
    ws = []
    for tag, f in latest.items():
        t = tags[tag]
        w = quantize(int(f["value"]), f["decimals"], int(t["min"]), int(t["neutral"]), int(t["max"]))
        if w is not None and w != 0:
            ws.append((w, f["index"]))
    neg = [x for x in ws if x[0] < 0]
    if neg:
        return min(neg, key=lambda x: (x[0], -x[1]))
    if ws:
        return max(ws, key=lambda x: (x[0], x[1]))
    return None

# ----------------------------------------------------------------------------------------------- section 5


def row_bytes(r: dict, W: int, committed_splus: int) -> bytes:
    """Section 5.4. committed_splus = positive sum of the row's own edges (or of its source for an alias)."""
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


class Cert:
    """A certificate decoded from a vector: rows (alias edges expanded), t, and the set parameters."""

    def __init__(self, v: dict):
        s = v["set"]
        self.v = v
        self.k = len(s["anchors"])
        self.n = v["nCert"]
        self.aN, self.aD = s["alphaN"], s["alphaD"]
        self.om = self.aD - self.aN
        self.lam = [int(x) for x in s["lambdas"]]
        self.t = [[int(x) for x in col] for col in v["vectors"]["t"]]
        self.fp = [int(x) for x in v["vectors"]["ownerFp"]]
        self.W = 2 if self.n <= 0xFFFF else 4
        rows = {r["u"]: r for r in v["rows"]}
        self.rows = []  # (u, edges[(dst, w)], sPlus_declared_or_0, committed S+, S-)
        for r in v["rows"]:
            src = rows[r["aliasOf"]] if r["aliasOf"] is not None else r
            edges = [(e["dst"], e["w"]) for e in src["edges"]]
            sp = sum(w for _, w in edges if w > 0)
            sn = sum(-w for _, w in edges if w < 0)
            decl = int(src["sPlus"]) if int(src["sPlus"]) > sp else 0
            self.rows.append((r["u"], edges, decl, sp, sn))

    def verify(self) -> dict:
        """Section 5.6. Returns the recomputed quantities; raises on a failed check."""
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
                    raise AssertionError(f"not a sub-solution: column {a}, node {i}")
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


def exact_fixed_point(n: int, k: int, alpha: Fraction, rows: list) -> list[list[Fraction]]:
    """t*^(a) of section 4.1, exactly: solve (I - (1 - alpha) C^T) t = alpha * e_a by sparse elimination.
    rows: (u, edges[(dst, w)], bplus). Returns t*[a][v] in WAD units (Fractions)."""
    # A[v] = {u: coeff}: t_v - (1 - alpha) * sum_u C_uv t_u
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


def prove_edge(cert: Cert, state: dict, u: int, agent_node: int | None, w_new: int, elow: list, eup: list) -> None:
    """Section 6.1 on row u. agent_node = node index of agentJ in the certificate (None if absent)."""
    k, om, aN = cert.k, cert.om, cert.aN
    row = next(r for r in cert.rows if r[0] == u)
    _, edges, decl, s0, _ = row
    st = state.setdefault(u, {"dim": 0, "incP": 0, "incN": 0, "amend": {}})
    sP = s0
    sN = sum(-w for _, w in edges if w < 0)
    w_committed = next((w for (j, w) in edges if j == agent_node), 0)
    for j, (wc, wn) in st["amend"].items():
        sP += max(wn, 0) - max(wc, 0)
        sN += max(-wn, 0) - max(-wc, 0)
    w_old = st["amend"][agent_node][1] if agent_node in st["amend"] else w_committed
    assert w_new != w_old, "nothing to prove"
    b0 = max(GRID, decl if decl else s0)

    def side(S, wo, wn, G):
        B, S2 = max(G, S), S - wo + wn
        B2, rest = max(G, S2), S - wo
        den = B * B2
        dn = (rest * (B2 - B) if B2 > B else 0) + max(wo * B2 - wn * B, 0)
        up = (rest * (B - B2) if B > B2 else 0) + max(wn * B - wo * B2, 0)
        return ceil_div(dn * WAD, den), ceil_div(up * WAD, den)

    decP, incP = side(sP, max(w_old, 0), max(w_new, 0), max(GRID, decl))
    _, incN = side(sN, max(-w_old, 0), max(-w_new, 0), GRID)
    cap = lambda cur, add, c: 0 if cur >= c else min(add, c - cur)
    dim = cap(st["dim"], decP, ceil_div(s0 * WAD, b0))
    addP = cap(st["incP"], incP, WAD)
    addN = cap(st["incN"], incN, WAD)
    prepaid = (decl - s0) * WAD // b0 if decl else 0
    sat = lambda a, b: a - b if a > b else 0
    billP = sat(st["incP"] + addP, prepaid) - sat(st["incP"], prepaid)
    st["dim"] += dim
    st["incP"] += addP
    st["incN"] += addN
    st["amend"][agent_node] = (w_committed if agent_node not in st["amend"] else st["amend"][agent_node][0], w_new)
    for a in range(k):
        t = cert.t[a][u]
        elow[a] += ceil_div(t * om * dim, aN * WAD)
        eup[a] += ceil_div(t * om * (billP + addN), aN * WAD)

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
    for c in data["cases"]:
        got = pair_edge(c["feedback"], data["tags"], c.get("controller", False))
        exp = None if c["expected"] is None else (c["expected"]["w"], c["expected"]["feedbackIndex"])
        check(got == exp, f"{path.name}: {c['id']} got {got} expected {exp}", errs)
    return errs


def run_certificate(path: Path, verbose: bool, exact: bool = True) -> tuple[list, Cert]:
    errs = []
    v = json.loads(path.read_text())
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
    return errs, cert


def run_violation(path: Path, honest_dir: Path, verbose: bool) -> list:
    errs, cert = run_certificate(path, verbose, exact=False)
    v = json.loads(path.read_text())
    honest = json.loads((honest_dir / v["violation"]["honestVector"]).read_text())
    # map nodes by identity so that the two node tables can differ
    key = lambda nd: nd.get("agentId", nd.get("address"))
    idx = {key(nd): nd["i"] for nd in v["nodes"]}
    hn = {nd["i"]: key(nd) for nd in honest["nodes"]}
    # honest nodes absent from this certificate (for example the slashed agent) get extra indices >= nCert,
    # where the certificate's t and d are zero
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
        sp = int(r["sPlus"])
        true_rows.append((u, edges, max(GRID, sp)))
        true_neg.append((u, edges, max(GRID, sum(-w for _, w in edges if w < 0))))
    alpha = Fraction(cert.aN, cert.aD)
    tstar = exact_fixed_point(N, cert.k, alpha, true_rows)
    dstar = exact_distrust(N, cert.k, alpha, cert.lam, tstar, true_neg)
    out = cert.verify()
    t_ext = [cert.t[a] + [0] * (N - cert.n) for a in range(cert.k)]
    d_ext = out["d"] + [0] * (N - cert.n)
    over = [sum(max(Fraction(t_ext[a][i]) - tstar[a][i], 0) for i in range(N)) for a in range(cert.k)]
    under_d = max(dstar[i] - (d_ext[i] + out["eEff"]) for i in range(N))
    broken = any(o > 0 for o in over) or under_d > 0
    check(broken, f"{path.name}: the committed graph should violate the guarantee", errs)
    for scen in v["violation"]["proofs"]:
        elow, eup = [0] * cert.k, list(out["e"])
        state: dict = {}
        for p in scen["steps"]:
            j = idx.get(p["agentId"])
            prove_edge(cert, state, p["row"], j, p["wNew"], elow, eup)
        elow_eff = sum(ceil_div(cert.lam[a] * elow[a], WAD) for a in range(cert.k))
        eup_eff = sum(ceil_div(cert.lam[a] * eup[a], WAD) for a in range(cert.k))
        m = scen["measured"]
        check(str(elow_eff) == m["eLowEffAfter"], f"{path.name} [{scen['level']}]: eLowEff {elow_eff} vs {m['eLowEffAfter']}", errs)
        check(str(eup_eff) == m["eEffAfter"], f"{path.name} [{scen['level']}]: eEff {eup_eff} vs {m['eEffAfter']}", errs)
        # after the proofs, the bounds hold again for the true graph (lemma L6)
        for a in range(cert.k):
            check(over[a] <= elow[a], f"{path.name}: ||(t - t*)+|| > eLow in column {a}", errs)
        check(all(dstar[i] <= d_ext[i] + eup_eff for i in range(N)), f"{path.name}: d* > d + eEff after proofs", errs)
        if verbose:
            print(f"   {scen['level']}: eLowEff {elow_eff}, eEff {eup_eff} (measured: {m['eLowEffAfter']}, {m['eEffAfter']})")
    if verbose:
        print(f"   violation: overstatement {[float(o) for o in over]} wei, distrust shortfall {float(max(under_d, 0)):.0f} wei")
    return errs


def main() -> int:
    verbose = "-v" in sys.argv
    root = Path(__file__).resolve().parent / "vectors"
    errors, count = [], 0
    for name, fn in (("quantization.json", run_quantization), ("pair-edge.json", run_pair_edges)):
        p = root / name
        if p.exists():
            errors += fn(p, verbose)
            count += 1
            if verbose:
                print(f"-- {name}")
    for p in sorted((root / "certificates").glob("*.json")):
        if verbose:
            print(f"-- {p.name}")
        try:
            e, _ = run_certificate(p, verbose)
        except AssertionError as x:
            e = [f"{p.name}: {x}"]
        errors += e
        count += 1
    for p in sorted((root / "violations").glob("*.json")):
        if verbose:
            print(f"-- {p.name}")
        try:
            errors += run_violation(p, root / "certificates", verbose)
        except AssertionError as x:
            errors.append(f"{p.name}: {x}")
        count += 1
    for e in errors:
        print("FAIL", e)
    print(f"{count} files, {len(errors)} failures")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

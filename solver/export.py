"""ANCRE R4 — export d'un certificat au format JSON documenté dans FORMAT.md (vecteurs de test pour R5).

Usage :
  .venv/bin/python export.py            # écrit vectors/*.json (mainnet + cas synthétiques) et les revérifie
"""
from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

from Crypto.Hash import keccak as _k

from graph import ADDR, AGENT, ANCHOR, GRID, ROW_MAX, WAD, ZERO, Graph, Identity, TagSpec
from ppr import Certificate, certify, e_eff, verify, MODES, _int_pass, _residual, ceil_div

HERE = Path(__file__).parent
LANE_MASK = (1 << 63) - 1
FORMAT = "ancre-cert-v1"


def keccak(b: bytes) -> bytes:
    h = _k.new(digest_bits=256)
    h.update(b)
    return h.digest()


def owner_fp(owner: str | None) -> int:
    """ownerFingerprint(owner) = uint160(owner) & (2^63 − 1) (contrat R5) ; 0 = pas de contrôle de transfert."""
    return (int(owner, 16) & LANE_MASK) if owner and owner != ZERO else 0


def merkle_levels(leaves: list[bytes]) -> list[list[bytes]]:
    """Levels of the contract's tree (_merkleRoot / _verifyMerkle): pairs keccak(l ‖ r), an odd last element goes
    up unhashed. levels[0] = leaves, levels[-1] = [root]."""
    levels = [list(leaves)]
    while len(levels[-1]) > 1:
        p = levels[-1]
        nxt = [keccak(p[2 * i] + p[2 * i + 1]) for i in range(len(p) // 2)]
        if len(p) % 2:
            nxt.append(p[-1])
        levels.append(nxt)
    return levels


def merkle_root(leaves: list[bytes]) -> bytes:
    """_merkleRoot of the contract; 0 if there is no row."""
    return merkle_levels(leaves)[-1][0] if leaves else b"\x00" * 32


def merkle_proof(leaves: list[bytes], pos: int) -> list[bytes]:
    """Path checked by AnchoredReputation._verifyMerkle for leaf `pos`."""
    proof = []
    for level in merkle_levels(leaves)[:-1]:
        if pos & 1:
            proof.append(level[pos - 1])
        elif pos + 1 < len(level):
            proof.append(level[pos + 1])
        pos >>= 1
    return proof


def sorted_tags(tags: list[str]) -> list[str]:
    """Order required by registerAnchorSet: keccak(tag) strictly increasing."""
    return sorted(tags, key=lambda t: keccak(t.encode()))


# ----------------------------------------------------------------------------- setId (D39): minimal ABI encoder
# setId = keccak256(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy)), ENCODING.md §1.
# Types: "uintN" | "intN" | "address" | "bool" | "bytes32" | "string" | ("array", T) | [T, ...] (tuple).
TAGSPEC_T = ["string", "int128", "int128", "int128", "uint8"]
POLICY_FIELDS = [("theta", "uint64"), ("rhoN", "uint32"), ("rhoD", "uint32"), ("minAnchors", "uint8"),
                 ("vetoQuorum", "uint8"), ("vetoMax", "int16"), ("maxAge", "uint64"), ("minRefresh", "uint64"),
                 ("slackRefresh", "uint64"), ("eLowMax", "uint64"), ("strictTransfer", "bool"),
                 ("registryVerified", "bool"), ("ownerFallback", "bool"), ("submitters", ("array", "address"))]
POLICY_T = [t for _, t in POLICY_FIELDS]
SET_T = [("array", "address"), ("array", "uint64"), "uint32", "uint32", "bytes32", ("array", TAGSPEC_T), POLICY_T]


def _dynamic(t) -> bool:
    if isinstance(t, list):
        return any(_dynamic(x) for x in t)
    return t == "string" or isinstance(t, tuple)


def _static_word(t: str, v) -> bytes:
    if t == "address":
        return int(v, 16).to_bytes(32, "big")
    if t == "bool":
        return int(bool(v)).to_bytes(32, "big")
    if t == "bytes32":
        b = bytes.fromhex(v[2:])
        assert len(b) == 32
        return b
    if t.startswith("uint"):
        n = int(v)
        assert 0 <= n < 2 ** int(t[4:]), (t, v)
        return n.to_bytes(32, "big")
    if t.startswith("int"):
        n, bits = int(v), int(t[3:])
        assert -2 ** (bits - 1) <= n < 2 ** (bits - 1), (t, v)
        return (n % 2**256).to_bytes(32, "big")
    raise ValueError(t)


def abi_encode(types: list, values: list) -> bytes:
    """abi.encode of a tuple (head/tail). Static tuples are not needed here (TagSpec and Policy are dynamic)."""
    assert len(types) == len(values)
    head, tail = b"", b""
    base = 32 * len(types)
    for t, v in zip(types, values):
        if _dynamic(t):
            head += (base + len(tail)).to_bytes(32, "big")
            tail += _encode_one(t, v)
        else:
            assert not isinstance(t, list), "static tuples are not supported"
            head += _static_word(t, v)
    return head + tail


def _encode_one(t, v) -> bytes:
    if isinstance(t, list):
        return abi_encode(t, v)
    if t == "string":
        b = v.encode()
        return len(b).to_bytes(32, "big") + b + b"\0" * (-len(b) % 32)
    if isinstance(t, tuple):
        return len(v).to_bytes(32, "big") + abi_encode([t[1]] * len(v), v)
    return _static_word(t, v)


def set_params_values(st: dict) -> list:
    """Values of SetParams from the JSON `set` block of a vector (ENCODING.md §1)."""
    tags = [[x["tag"], int(x["min"]), int(x["neutral"]), int(x["max"]), x["kind"]] for x in st["tags"]]
    pol = st["policy"]
    return [st["anchors"], [int(x) for x in st["lambdas"]], st["alphaN"], st["alphaD"], st["tagSchemaHash"], tags,
            [pol[f] for f, _ in POLICY_FIELDS]]


def make_set_block(anchors: list[str], lambdas: list[int], alphaN: int, alphaD: int, tag_schema_hash: str,
                   schema: dict[str, TagSpec], filter_tags: list[str], policy: dict) -> dict:
    """The JSON `set` block (FORMAT.md §1), shared by export_certificate and certifier.SetConfig so that the two
    can never build different setIds. Anchors are sorted WITH their lambdas (registerAnchorSet order)."""
    pairs = sorted(zip((a.lower() for a in anchors), lambdas))
    return {"anchors": [a for a, _ in pairs], "lambdas": [str(l) for _, l in pairs], "alphaN": alphaN,
            "alphaD": alphaD, "minAnchors": policy["minAnchors"], "tagSchemaHash": tag_schema_hash,
            "tags": [{"tag": t, "min": str(schema[t].min_wad), "neutral": str(schema[t].neutral_wad),
                      "max": str(schema[t].max_wad), "kind": 0 if schema[t].kind == "endorsement" else 1}
                     for t in sorted_tags(filter_tags)],
            "policy": policy}


def set_id(st: dict) -> str:
    """setId of a JSON `set` block: keccak256(abi.encode(..., policy)), identical to computeSetId (D39)."""
    return "0x" + keccak(abi_encode(SET_T, set_params_values(st))).hex()


# reference policies of the published vectors (NOT a recommendation: test values, see FORMAT.md §1)
VECTOR_SUBMITTER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"   # Foundry/anvil default account 0: public test key


def vector_schema_hash(label: str) -> str:
    """tagSchemaHash of a published vector: keccak256("ancre-vector:" + label), so that every vector has its own setId
    (simulate.py registers them all on one contract)."""
    return "0x" + keccak(("ancre-vector:" + label).encode()).hex()


def reference_policy(min_anchors: int, *, registry_verified: bool, owner_fallback: bool = False) -> dict:
    return {"theta": str(10**15), "rhoN": 1, "rhoD": 2, "minAnchors": min_anchors, "vetoQuorum": 1, "vetoMax": -1,
            "maxAge": 288_000, "minRefresh": 600, "slackRefresh": "0", "eLowMax": str(10**16),
            "strictTransfer": True, "registryVerified": registry_verified, "ownerFallback": owner_fallback,
            "submitters": [] if registry_verified else [VECTOR_SUBMITTER]}


# unified v1 header bits (contracts/ENCODING.md §3.2, 2026-10-01)
HDR_SRC, HDR_SPLUS, HDR_ALIAS, HDR_VIA_OWNER = 0x8000, 0x4000, 0x2000, 0x1000
HDR_NE_MASK = 0x0FFF
ROW_ALIAS_MAX = 64          # D44 (solver canonical choice, not checked by the contract): max alias rows per ref


class NotEncodable(Exception):
    pass


def row_bytes(cert: Certificate, u: int, W: int, alias_of: dict[int, int]) -> bytes:
    """Bytes of one row (contracts/ENCODING.md §3.2): u ‖ hdr ‖ [src:20] ‖ [sPlus:u32] ‖ [ref:W] ‖ edges.
    SRC for agent rows whose source resolves (via wallet or owner), VIA_OWNER when it resolves through the owner (D44),
    SPLUS when the declared true positive sum exceeds the committed one, ALIAS (with SRC repeated) for a copy."""
    if u not in cert.row_src:
        raise NotEncodable(f"row {u} has no recorded source (row_src): its client is unknown")
    src, via = cert.row_src[u]
    edges = cert.rows[u]
    has_src = via in ("wallet", "owner")
    owner_bit = HDR_VIA_OWNER if via == "owner" else 0
    if u in alias_of:
        if not has_src:
            raise NotEncodable(f"alias row {u} without a source")
        return (u.to_bytes(W, "big") + (HDR_SRC | HDR_ALIAS | owner_bit).to_bytes(2, "big") + bytes.fromhex(src[2:])
                + alias_of[u].to_bytes(W, "big"))
    has_splus = cert.splus[u] != sum(q for _, q, _ in edges if q > 0)
    if not has_src and (edges or has_splus) and via not in ("anchor", "address"):
        raise NotEncodable(f"agent row {u} without a source must be empty (ENCODING §3.2)")
    hdr = owner_bit | len(edges) | (HDR_SRC if has_src else 0) | (HDR_SPLUS if has_splus else 0)
    rb = u.to_bytes(W, "big") + hdr.to_bytes(2, "big")
    if has_src:
        rb += bytes.fromhex(src[2:])
    if has_splus:
        rb += cert.splus[u].to_bytes(4, "big")
    for dst, q, fi in edges:
        rb += dst.to_bytes(W, "big") + (q & 0xFFFF).to_bytes(2, "big") + fi.to_bytes(4, "big")
    return rb


def aliases(cert: Certificate) -> dict[int, int]:
    """D20 row copy: an agent row identical to an EARLIER agent row with the same source client is encoded
    as an alias of the first one (same edges, same source, same sPlus)."""
    first: dict[str, int] = {}
    count: dict[int, int] = {}
    out = {}
    for u in sorted(cert.rows):
        src, via = cert.row_src.get(u, (None, "missing"))
        if via not in ("wallet", "owner"):
            continue
        f = first.get(src)
        if f is not None and cert.rows[f] == cert.rows[u] and cert.splus[f] == cert.splus[u] \
                and count[f] < ROW_ALIAS_MAX:
            out[u] = f
            count[f] += 1
            continue
        first[src], count[u] = u, 0
    return out


KIND_BYTE = {AGENT: 1, ADDR: 2, ANCHOR: 3}             # contract node kinds (KIND_AGENT / KIND_ADDRESS / KIND_ANCHOR)


def node_entry(key: tuple[str, object]) -> bytes:
    """newNodes / addNodes entry: 0x01 ‖ agentId:u32 or 0x02 ‖ address:20."""
    kind, v = key
    if kind == AGENT:
        return bytes([KIND_BYTE[AGENT]]) + int(v).to_bytes(4, "big")
    if kind == ADDR:
        return bytes([KIND_BYTE[ADDR]]) + bytes.fromhex(str(v)[2:])
    raise ValueError("anchors are created by registerAnchorSet, not as new nodes")


def node_key(key: tuple[str, object]) -> str:
    """bytes32 node key of the contract: kind << 248 | agentId or address."""
    kind, v = key
    val = int(v) if kind == AGENT else int(str(v), 16)
    return "0x" + ((KIND_BYTE[kind] << 248) | val).to_bytes(32, "big").hex()


def encode(cert: Certificate, nodes: list[tuple[str, object]], identity: Identity | None):
    """Calldata of submitCertificate (contracts/ENCODING.md §3): newNodes, vectors, rows; + graphRoot, vectorRoot."""
    n, k = cert.n, cert.k
    W = 2 if n <= 0xFFFF else 4
    new_nodes = b"".join(node_entry(x) for x in nodes[k:])
    fps = [owner_fp(identity.owner.get(int(key))) if (kind == AGENT and identity) else 0 for kind, key in nodes]
    vectors = b"".join(b"".join(cert.t[a][v].to_bytes(8, "big") for a in range(k)) + fps[v].to_bytes(8, "big")
                       for v in range(n))
    al = aliases(cert)
    rows = bytes([W]) + len(cert.rows).to_bytes(4, "big")
    leaves = []
    for u in sorted(cert.rows):
        rb = row_bytes(cert, u, W, al)
        rows += rb
        leaves.append(keccak(rb))
    return {"W": W, "newNodes": new_nodes, "vectors": vectors, "rows": rows, "aliases": al,
            "graphRoot": merkle_root(leaves), "vectorRoot": keccak(vectors), "ownerFp": fps}


def quality(cert: Certificate) -> tuple[int, int, int]:
    """(qEff, mass, distrustMass) of the replacement rule (ENCODING.md §4-§5): q_a = ⌈(r_a − E⁺ − 1)·αD/αN⌉
    aggregated with ⌈λ·/WAD⌉; mass = Σ_a ⌊λ_a·Σ_v t_v^(a) / WAD⌋; distrustMass = Σ_v d_v."""
    e_pos = sum(1 for r in cert.rows.values() for _, q, _ in r if q > 0)
    q = [ceil_div((ra - e_pos - 1) * cert.alphaD, cert.alphaN) for ra in cert.r]
    q_eff = sum(ceil_div(l * qa, WAD) for l, qa in zip(cert.lambdas, q))
    mass = sum(l * sum(col) // WAD for l, col in zip(cert.lambdas, cert.t))
    return q_eff, mass, sum(cert.d)


def export_certificate(g: Graph, cert: Certificate, identity: Identity | None, *, schema: dict[str, TagSpec],
                       filter_tags: list[str], policy: dict | None = None, tag_schema_hash: str = "0x" + "00" * 32,
                       label: str = "", notes: str = "") -> dict:
    """JSON vector (FORMAT.md §1). `policy`: the D39 policy committed in the setId (default: the Submitter-attested
    reference_policy with m = 2)."""
    policy = policy if policy is not None else reference_policy(2, registry_verified=False)
    nodes = [g.nodes[gi] for gi in cert.node_map]
    enc = encode(cert, nodes, identity)
    orig = {(u, e.dst, e.feedback_index): e for u, e in g.edges()}      # (client, agent, tag1) for human review
    back = dict(enumerate(cert.node_map))
    tight_r = _residual("tight", cert.n, cert.k, cert.alphaN, cert.alphaD, cert.rows, cert.t,
                        *(_int_pass(cert.n, cert.anchors, cert.alphaN, cert.alphaD, cert.rows, cert.bplus,
                                    cert.bminus, cert.t, cert.lambdas)[:3]), cert.splus)
    out = {
        "format": FORMAT,
        "label": label,
        "notes": notes,
        "alignedWith": "contracts/ENCODING.md unified v1 (2026-10-01), AnchoredReputation v1 (integration 02+04)",
        "identityBlock": identity.block if identity else None,
        "set": make_set_block([str(g.nodes[s][1]) for s in g.anchors], cert.lambdas, cert.alphaN, cert.alphaD,
                              tag_schema_hash, schema, filter_tags, policy),
        "nCert": cert.n,
        "nodes": [],
        "rows": [],
        "vectors": {"t": [[str(x) for x in col] for col in cert.t], "ownerFp": [str(x) for x in enc["ownerFp"]]},
        "expected": {
            "residualMode": cert.mode,
            "subSolution": True,
            "iterationsFromZero": cert.iterations,
            "r": [str(x) for x in cert.r], "e": [str(x) for x in cert.e], "eEff": str(e_eff(cert)),
            **dict(zip(("qEff", "mass", "distrustMass"), map(str, quality(cert)))),
            "d": [str(x) for x in cert.d],
            "graphRoot": "0x" + enc["graphRoot"].hex(), "vectorRoot": "0x" + enc["vectorRoot"].hex(),
            "tight": {"r": [str(x) for x in tight_r],
                      "e": [str(ceil_div(x * cert.alphaD, cert.alphaN)) for x in tight_r]},
        },
        "calldata": {"W": enc["W"], "newNodes": "0x" + enc["newNodes"].hex(), "vectors": "0x" + enc["vectors"].hex(),
                     "rows": "0x" + enc["rows"].hex()},
    }
    out["set"]["setId"] = set_id(out["set"])
    for i, (kind, key) in enumerate(nodes):
        nd = {"i": i, "kind": {"anchor": "anchor", "agent": "agent", "addr": "address"}[kind]}
        if kind == AGENT:
            nd["agentId"] = int(key)
            if identity:
                nd["owner"] = identity.owner.get(int(key))
                nd["agentWallet"] = identity.wallet.get(int(key))
        else:
            nd["address"] = str(key)
        nd["hasRow"] = i in cert.rows
        out["nodes"].append(nd)
    bplus, bminus = cert.bplus, cert.bminus                 # properties rebuild a dict: read them once
    for u in sorted(cert.rows):
        erow = []
        for dst, q, fi in cert.rows[u]:
            e = orig.get((back[u], back[dst], fi))
            erow.append({"dst": dst, "w": q, "feedbackIndex": fi,
                         **({"client": e.client, "agentId": e.agent_id, "tag1": e.tag1} if e else {})})
        src, via = cert.row_src.get(u, (None, "anchor" if u < cert.k else "address"))
        out["rows"].append({"u": u, "source": src if via in ("wallet", "owner") else None, "via": via,
                            "aliasOf": enc["aliases"].get(u), "sPlus": cert.splus[u], "bPlus": bplus[u],
                            "bMinus": bminus[u], "edges": erow})
    return out


def load_certificate(obj: dict, mode: str | None = None) -> Certificate:
    """Read an exported JSON back into a Certificate (cross re-verification)."""
    k = len(obj["set"]["anchors"])
    rows = {r["u"]: [(e["dst"], e["w"], e["feedbackIndex"]) for e in r["edges"]] for r in obj["rows"]}
    return Certificate(n=obj["nCert"], anchors=list(range(k)), alphaN=obj["set"]["alphaN"], alphaD=obj["set"]["alphaD"],
                       lambdas=[int(x) for x in obj["set"]["lambdas"]], rows=rows,
                       splus={r["u"]: r["sPlus"] for r in obj["rows"]},
                       t=[[int(x) for x in col] for col in obj["vectors"]["t"]],
                       mode=mode or obj["expected"]["residualMode"],
                       row_src={r["u"]: (r["source"], r["via"]) for r in obj["rows"]})


def decode_rows(hexrows: str) -> tuple[dict[int, list[tuple[int, int, int]]], dict[int, int], dict[int, tuple]]:
    """Independent decoder of the `rows` calldata (ENCODING.md §3.2; encoder check). Returns (rows with aliases
    expanded, declared sPlus per row, {u: (source | None, via_owner, alias_ref | None)}, raw bytes of each row = the
    preimages of the Merkle leaves)."""
    b = bytes.fromhex(hexrows[2:])
    W, nrows = b[0], int.from_bytes(b[1:5], "big")
    off, rows, splus, meta, slices = 5, {}, {}, {}, []
    prev = -1
    for _ in range(nrows):
        start = off
        u = int.from_bytes(b[off:off + W], "big"); off += W
        hdr = int.from_bytes(b[off:off + 2], "big"); off += 2
        assert u > prev, "rows must be strictly increasing"
        prev = u
        via_owner = bool(hdr & HDR_VIA_OWNER)
        assert not (via_owner and not hdr & HDR_SRC), "VIA_OWNER without a source"
        src = None
        if hdr & HDR_SRC:
            src = "0x" + b[off:off + 20].hex(); off += 20
        sp = None
        if hdr & HDR_SPLUS:
            sp = int.from_bytes(b[off:off + 4], "big"); off += 4
        if hdr & HDR_ALIAS:
            assert src is not None and sp is None and hdr & HDR_NE_MASK == 0, "alias row: SRC, no sPlus, no edge"
            ref = int.from_bytes(b[off:off + W], "big"); off += W
            assert ref < u and ref in rows and meta[ref][2] is None and meta[ref][0] == src, "bad alias ref"
            rows[u], splus[u], meta[u] = list(rows[ref]), splus[ref], (src, via_owner, ref)
            slices.append(b[start:off])
            continue
        edges = []
        assert hdr & HDR_NE_MASK <= ROW_MAX, "nE > ROW_MAX"
        for _ in range(hdr & HDR_NE_MASK):
            dst = int.from_bytes(b[off:off + W], "big")
            assert dst != u and (not edges or dst > edges[-1][0]), "dst must differ from u and increase"
            q = int.from_bytes(b[off + W:off + W + 2], "big", signed=True)
            fi = int.from_bytes(b[off + W + 2:off + W + 6], "big")
            edges.append((dst, q, fi)); off += W + 6
        slices.append(b[start:off])
        rows[u] = edges
        committed = sum(q for _, q, _ in edges if q > 0)
        assert sp is None or sp >= max(1, committed), "sPlus below the committed positive sum"
        splus[u] = sp if sp is not None else committed
        meta[u] = (src, via_owner, None)
    assert off == len(b)
    return rows, splus, meta, slices


def check_file(path: Path) -> None:
    check_file_obj(json.loads(path.read_text()), path)


def check_file_obj(obj: dict, path=None) -> None:
    cert = load_certificate(obj)
    r, e, d, errs = verify(cert)                         # includes t <= y (D26)
    assert not errs, (path, errs)
    cert.r = r
    assert [str(x) for x in r] == obj["expected"]["r"], (path, r)
    assert [str(x) for x in d] == obj["expected"]["d"], path
    assert [str(x) for x in e] == obj["expected"]["e"], path
    assert str(sum(ceil_div(l * ex, WAD) for l, ex in zip(cert.lambdas, e))) == obj["expected"]["eEff"], path
    rows, splus, meta, slices = decode_rows(obj["calldata"]["rows"])
    assert rows == cert.rows and splus == cert.splus, path
    assert "0x" + merkle_root([keccak(x) for x in slices]).hex() == obj["expected"]["graphRoot"], path
    for r in obj["rows"]:                                # decoded header meta == published JSON meta
        src, via_owner, ref = meta[r["u"]]
        assert (src, via_owner, ref) == (r["source"], r["via"] == "owner", r["aliasOf"]), (path, r["u"])
    vec = bytes.fromhex(obj["calldata"]["vectors"][2:])
    assert "0x" + keccak(vec).hex() == obj["expected"]["vectorRoot"]
    assert set_id(obj["set"]) == obj["set"]["setId"], path              # D39: policy committed in the setId
    cert.d = d
    assert [str(x) for x in quality(cert)] == [obj["expected"][k] for k in ("qEff", "mass", "distrustMass")], path


# ----------------------------------------------------------------------------- génération des vecteurs


def toy_wallet(j: int) -> str:
    return "0x" + f"{0xA000 + j:040x}"


def _toy_graph(spec_rows: dict, anchors: list[str], agents: list[int], addrs: list[str] = ()) -> tuple[Graph, Identity]:
    """Graphe jouet construit à la main : spec_rows = {clé_src: [(agentId_dst, q, fbIdx)]}. Each agent j gets the
    synthetic wallet = owner toy_wallet(j), so that its row carries a source (ENCODING §3.2: an agent row with edges
    needs SRC). Returns (graph, identity)."""
    from graph import Edge
    nodes = [(ANCHOR, a) for a in sorted(anchors)] + [(AGENT, a) for a in sorted(agents)] + [(ADDR, a) for a in sorted(addrs)]
    index = {k: i for i, k in enumerate(nodes)}
    idn = Identity(block=0, owner={j: toy_wallet(j) for j in agents}, wallet={j: toy_wallet(j) for j in agents})
    rows, row_src = {}, {}
    for kind, v in nodes:
        row_src[index[(kind, v)]] = (toy_wallet(v), "wallet") if kind == AGENT else (str(v), "anchor" if kind == ANCHOR
                                                                                      else "address")
    for src, lst in spec_rows.items():
        u = index[src]
        client = toy_wallet(src[1]) if src[0] == AGENT else str(src[1])
        rows[u] = sorted([Edge(dst=index[(AGENT, j)], q=q, client=client, agent_id=j, tag1="vouch" if q > 0 else "slash",
                               feedback_index=fi) for j, q, fi in lst], key=lambda e: e.dst)
    return Graph(nodes=nodes, index=index, rows=rows, anchors=list(range(len(anchors))), log={}, rejected=[],
                 row_src=row_src), idn


def toy_identity_graph():
    """Hand-made registry exercising R7 (FORMAT v1): shared wallet W (alias row), owner fallback (VIA_OWNER),
    wallet-wins priority, and a row longer than ROW_MAX (declared sPlus). Returns (feedbacks, identity, anchors)."""
    from graph import Feedback
    A, B, W, P, X4, M = ("0x" + c * 40 for c in "abcdef")
    O = lambda i: "0x" + f"{i:040x}"
    owner = {1: O(101), 2: O(102), 3: P, 4: P, 5: O(105), 6: O(106)}
    wallet = {1: W, 2: W, 3: ZERO, 4: X4, 5: O(105), 6: M}
    for j in range(10, 310):
        owner[j], wallet[j] = O(1000 + j), O(1000 + j)
    idn = Identity(block=0, owner=owner, wallet=wallet)
    f = lambda a, c, i, v, t: Feedback(agent_id=a, client=c, index=i, value=v, decimals=0, tag1=t, tag2="", revoked=False)
    fbs = [f(1, A, 1, 100, "vouch"), f(2, A, 1, 50, "vouch"), f(3, A, 1, 100, "vouch"), f(4, A, 1, 100, "vouch"),
           f(6, A, 1, 100, "vouch"), f(1, B, 1, 100, "vouch"),
           f(5, W, 1, 80, "vouch"), f(3, W, 1, -100, "slash"),        # W's row, copied into #1 and #2 (alias)
           f(5, P, 1, 100, "vouch"),                                  # P's row: #3 via owner (D44); #4 has a wallet
           f(5, X4, 1, 1, "review")]
    fbs += [f(j, M, 1, 1 + (j * 37) % 100, "vouch") for j in range(10, 310)]   # 300 edges > ROW_MAX
    return fbs, idn, [A, B]


def violation_vectors(fbs, idn, schema, filt, anchors, outdir: Path) -> list[Path]:
    """D37: one normative vector per violation of C_committed ≤ C_true (V4 dilution, V5 fabrication,
    V6 inflation, V13 omitted negative), on the real mainnet_slash_anchor graph. Each certificate is
    ARITHMETICALLY valid (it passes verify: t ≤ y), but its committed graph is not dominated by the registry.
    Registry-verified must reject it at submission; Submitter-attested must make it provable (proof (v) or (i))."""
    import copy
    from graph import Edge, build_graph
    outdir.mkdir(exist_ok=True)
    for p in outdir.glob("*.json"):
        p.unlink()
    g0 = build_graph(fbs, idn, schema, filt, anchors)
    honest = certify(g0, Fraction(1, 3))
    n18, n2, n3, n4 = (g0.index[(AGENT, j)] for j in (18, 2, 3, 4))
    a0730 = g0.index[(ANCHOR, "0x0730536018541c5149a049d35528a76c2c8f1e6b")]
    aea0b = g0.index[(ANCHOR, "0xea0b21fb2441464f4920ce3e34d478235605816b")]

    def value(c, gi, what):
        ci = c.node_map.index(gi) if gi in c.node_map else None
        if ci is None:
            return 0
        return c.d[ci] if what == "d" else sum(c.lambdas[a] * c.t[a][ci] for a in range(c.k)) // WAD

    cases = []
    g = copy.deepcopy(g0)                                      # V5 fabrication: 0x0730 -> #4, +1, no such feedback
    g.rows[a0730] = sorted(g.rows[a0730] + [Edge(n4, GRID, g0.nodes[a0730][1], 4, "vouch", 7)], key=lambda e: e.dst)
    cases.append(("fabricated", g, a0730, n4, None, GRID, 7, "t", "committed edge with no registry feedback: "
                  "readFeedback(4, 0x0730, 7) does not exist"))
    g = copy.deepcopy(g0)                                      # V13 omitted negative: the slash disappears everywhere
    for u in (aea0b, n18):
        g.rows[u] = [e for e in g.rows[u] if e.dst != n4]
    cases.append(("omitted_negative", g, aea0b, n4, -GRID, None, 1, "d", "the anchor's slash (index 1) is omitted: "
                  "distrust of #4 falls to 0 and the certified veto bit is disarmed (V13)"))
    g = copy.deepcopy(g0)                                      # V6 inflation: slash -10000 committed as -1
    g.rows[n18] = [Edge(e.dst, -1, e.client, e.agent_id, e.tag1, e.feedback_index) if e.dst == n4 else e
                   for e in g.rows[n18]]
    cases.append(("inflated", g, n18, n4, -GRID, -1, 1, "d", "committed weight above the registry weight "
                  "(-1 > -10000): distrust of #4 shrinks"))
    g = copy.deepcopy(g0)                                      # V4 dilution: omit #18 -> #3 without declaring sPlus
    g.rows[n18] = [e for e in g.rows[n18] if e.dst != n3]
    cases.append(("dilution", g, n18, n2, GRID, GRID, 1, "t", "edge #18 -> #3 omitted and sPlus NOT declared: "
                  "B⁺ shrinks from 20000 to 10000 and #2 receives twice its share (V4/V7)"))
    out = []
    for kind, g, u, dst, w_reg, w_com, fi, what, why in cases:
        c = certify(g, Fraction(1, 3))
        obj = export_certificate(g, c, idn, schema=schema, filter_tags=filt, label=f"violation_{kind}",
                                 notes="D37 normative violation vector (mainnet_slash_anchor). " + why,
                                 policy=reference_policy(2, registry_verified=True),
                                 tag_schema_hash=vector_schema_hash(f"violation_{kind}"))
        obj["violation"] = {"kind": kind, "graphNode": {"u": g.nodes[u][1], "dst": g.nodes[dst][1]},
                            "wRegistry": w_reg, "wCommitted": w_com, "feedbackIndex": fi, "affects": what,
                            "honestValue": str(value(honest, dst, what)), "committedValue": str(value(c, dst, what)),
                            "mustBe": "rejected at submission (Registry-verified) or provable (Submitter-attested)"}
        p = outdir / f"{kind}.json"
        p.write_text(json.dumps(obj, indent=1, ensure_ascii=False))
        check_file(p)
        out.append(p)
    return out


def main():
    import run_mainnet as R
    from graph import build_graph, load_schema
    outdir = HERE / "vectors"
    outdir.mkdir(exist_ok=True)
    for p in outdir.glob("*.json"):
        p.unlink()
    fbs, idn = R.load_mainnet()
    raw = json.load(open(HERE / "schema_reference.json"))
    ref = load_schema(raw)
    core = raw["filters"]["core"]
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    ea0b, sc = R.resolve(R.EA0B, fbs), R.resolve(R.SCANNER, fbs)
    written = []

    def dump(name, g, cert, schema, filt, notes, idn_=idn, *, verified=True, fallback=False):
        obj = export_certificate(g, cert, idn_, schema=schema, filter_tags=filt, label=name, notes=notes,
                                 policy=reference_policy(2, registry_verified=verified, owner_fallback=fallback),
                                 tag_schema_hash=vector_schema_hash(name))
        p = outdir / f"{name}.json"
        p.write_text(json.dumps(obj, indent=1, ensure_ascii=False))
        check_file(p)
        written.append((p.name, cert.n, sum(len(r) for r in cert.rows.values()), len(obj["rows"]),
                        sum(1 for r in obj["rows"] if r["aliasOf"] is not None), cert.iterations, cert.e))

    g = build_graph(fbs, idn, ref, core, [h1, h2])
    dump("mainnet_honest_d20", g, certify(g, Fraction(1, 3)), ref, core,
         "Acte 1 (d), 9 283 avis, bloc 108 835 675 : ancres 0x0730/0xf7d5, filtre core, D20. #18 porte la copie de la "
         "ligne de 0xea0b (wallet de #18, #22, #23) : #2 et #3 reçoivent de la masse, #4 de la méfiance (slash).")
    g = build_graph(fbs, idn, ref, core, [ea0b, h1])
    dump("mainnet_slash_anchor", g, certify(g, Fraction(1, 3)), ref, core,
         "Acte 1 (e) : ancres {0xea0b, 0x0730}, D14 : l'arête 0xea0b->#4 vaut -10000 (slash), le review +1 ne l'efface "
         "pas. La ligne de 0xea0b est portée par le nœud-ancre ET par la copie de #18 (D9 + D20).")
    pre = {t: TagSpec(s.min_wad, s.neutral_wad, s.max_wad, "endorsement") for t, s in ref.items()}
    filt = ["trust", "liveness", "eve", "plague", "vouch", "review", "slash"]
    g = build_graph(fbs, idn, pre, filt, [sc, h1])
    dump("mainnet_scanner_preD15", g, certify(g, Fraction(1, 3)), pre, filt,
         "Acte 1 (b) SANS D15 (schéma modifié : tout propage) : fuite du scanner vers la ferme. Grand certificat.")
    em = sorted({f.tag1 for f in fbs if f.tag1.split(":")[0] in ("executor_rating", "requester_rating")})
    ext = {t: TagSpec(0, 50 * WAD, 100 * WAD, "endorsement") for t in em}
    efilt = [t for t in em if not t.endswith("verification")]
    a1, a2 = R.resolve("0x3aebb73a", fbs), R.resolve("0xaf95b213", fbs)
    g = build_graph(fbs, idn, ext, efilt, [a1, a2], owner_fallback=True)
    dump("mainnet_em_d44", g, certify(g, Fraction(1, 3)), ext, efilt,
         "D44 (repli owner, drapeau en attente de Hugo) : execution.market, schéma d'essai (tags executor/requester en "
         "endorsement [0,50,100], NON normatif), ancres = 2 noteurs EM. Lignes VIA_OWNER : les workers ont "
         "agentWallet = 0 après transfert.", fallback=True)
    fb_t, idn_t, anc_t = toy_identity_graph()
    sch_t = {k: v for k, v in ref.items() if k in core}
    g = build_graph(fb_t, idn_t, sch_t, core, anc_t, owner_fallback=True)
    dump("toy_alias_owner_rowmax", g, certify(g, Fraction(1, 3)), sch_t, core,
         "Jouet R7 : wallet partagé W (#1, #2 : ligne alias), repli owner (#3 VIA_OWNER ; #4 a un wallet, qui "
         "l'emporte), ligne de #6 à 300 arêtes plafonnée à ROW_MAX = 256 avec sPlus déclaré.", idn_=idn_t,
         verified=False, fallback=True)
    violation_vectors(fbs, idn, ref, core, [ea0b, h1], outdir / "violations")
    A1, A2 = "0x" + "11" * 20, "0x" + "22" * 20
    toy, toy_idn = _toy_graph({(ANCHOR, A1): [(1, 10000, 1), (2, 5000, 1)], (AGENT, 1): [(2, 3333, 2), (3, -10000, 1)],
                      (AGENT, 2): [(1, 7777, 1), (3, 2500, 4)], (AGENT, 3): [(1, 1, 1)]},
                     [A1, A2], [1, 2, 3])
    for al in (Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)):
        dump(f"toy_alpha_{al.numerator}_{al.denominator}", toy, certify(toy, al), ref, core,
             "Jouet : ancre A2 sans arête (colonne triviale), arête négative, poids non ronds, cycle 1<->2.",
             idn_=toy_idn, verified=False)
    c = certify(toy, Fraction(1, 3), truncate_below=WAD // 10)
    dump("toy_truncated", toy, c, ref, core, "Jouet, troncature des lignes de t <= 0,1 WAD : marge (1−α)·t_u ajoutée à r.",
         idn_=toy_idn, verified=False)
    print("| vecteur | nCert | arêtes | lignes | alias | itérations depuis 0 | e (wei) |")
    print("|---|---|---|---|---|---|---|")
    for name, n, ne, nr, na, it, e in written:
        print(f"| {name} | {n} | {ne} | {nr} | {na} | {it} | {e} |")


if __name__ == "__main__":
    sys.exit(main())

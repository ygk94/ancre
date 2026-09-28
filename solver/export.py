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


def merkle_root(leaves: list[bytes]) -> bytes:
    """_merkleRoot du contrat R5 : paires keccak(g || d), l'élément impair remonte tel quel."""
    if not leaves:
        return b"\x00" * 32
    p = list(leaves)
    while len(p) > 1:
        nxt = [keccak(p[2 * i] + p[2 * i + 1]) for i in range(len(p) // 2)]
        if len(p) % 2:
            nxt.append(p[-1])
        p = nxt
    return p[0]


HDR_SRC, HDR_ALIAS, HDR_VIA_OWNER, HDR_SPLUS = 0x8000, 0x4000, 0x2000, 0x1000
HDR_NE_MASK = 0x0FFF
ROW_ALIAS_MAX = 64          # D44 (choice): max alias rows sharing one ref; beyond, a new full row starts


def row_bytes(cert: Certificate, u: int, W: int, alias_of: dict[int, int]) -> bytes:
    """Bytes of one row (FORMAT.md §2). Alias row: u ‖ hdr ‖ ref. Full row: u ‖ hdr ‖ [source] ‖ [sPlus] ‖ edges."""
    src, via = cert.row_src.get(u, (None, "address"))
    hdr = HDR_VIA_OWNER if via == "owner" else 0
    if u in alias_of:
        return u.to_bytes(W, "big") + (hdr | HDR_ALIAS).to_bytes(2, "big") + alias_of[u].to_bytes(W, "big")
    edges = cert.rows[u]
    has_src = via in ("wallet", "owner")
    committed_plus = sum(q for _, q, _ in edges if q > 0)
    has_splus = cert.splus[u] != committed_plus
    hdr |= len(edges) | (HDR_SRC if has_src else 0) | (HDR_SPLUS if has_splus else 0)
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
        src, via = cert.row_src.get(u, (None, "address"))
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


def encode(cert: Certificate, nodes: list[tuple[str, object]], identity: Identity | None):
    """Calldata (FORMAT.md §2, v1): newNodes, vectors, rows; + graphRoot, vectorRoot."""
    n, k = cert.n, cert.k
    W = 2 if n <= 0xFFFF else 4
    new_nodes = b""
    for kind, key in nodes[k:]:
        if kind == AGENT:
            new_nodes += bytes([1]) + int(key).to_bytes(4, "big")
        elif kind == ADDR:
            new_nodes += bytes([2]) + bytes.fromhex(str(key)[2:])
        else:
            raise ValueError("an anchor outside the first k nodes")
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


def export_certificate(g: Graph, cert: Certificate, identity: Identity | None, *, schema: dict[str, TagSpec],
                       filter_tags: list[str], min_anchors: int = 2, label: str = "", notes: str = "") -> dict:
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
        "alignedWith": "solver/FORMAT.md v1 (2026-09-28). contracts/ENCODING.md still v0 (27/09): alias rows, "
                       "VIA_OWNER, sPlus and t <= y are PROPOSED to chantier 02, not yet in the contract.",
        "identityBlock": identity.block if identity else None,
        "set": {
            "anchors": [str(g.nodes[s][1]) for s in g.anchors],
            "lambdas": [str(x) for x in cert.lambdas],
            "alphaN": cert.alphaN, "alphaD": cert.alphaD,
            "minAnchors": min_anchors,
            "tags": [{"tag": t, "min": str(schema[t].min_wad), "neutral": str(schema[t].neutral_wad),
                      "max": str(schema[t].max_wad), "kind": 0 if schema[t].kind == "endorsement" else 1}
                     for t in sorted(filter_tags, key=lambda t: keccak(t.encode()))],
        },
        "nCert": cert.n,
        "nodes": [],
        "rows": [],
        "vectors": {"t": [[str(x) for x in col] for col in cert.t], "ownerFp": [str(x) for x in enc["ownerFp"]]},
        "expected": {
            "residualMode": cert.mode,
            "subSolution": True,
            "iterationsFromZero": cert.iterations,
            "r": [str(x) for x in cert.r], "e": [str(x) for x in cert.e], "eEff": str(e_eff(cert)),
            "d": [str(x) for x in cert.d],
            "graphRoot": "0x" + enc["graphRoot"].hex(), "vectorRoot": "0x" + enc["vectorRoot"].hex(),
            "tight": {"r": [str(x) for x in tight_r],
                      "e": [str(ceil_div(x * cert.alphaD, cert.alphaN)) for x in tight_r]},
        },
        "calldata": {"W": enc["W"], "newNodes": "0x" + enc["newNodes"].hex(), "vectors": "0x" + enc["vectors"].hex(),
                     "rows": "0x" + enc["rows"].hex()},
    }
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
    for u in sorted(cert.rows):
        erow = []
        for dst, q, fi in cert.rows[u]:
            e = orig.get((back[u], back[dst], fi))
            erow.append({"dst": dst, "w": q, "feedbackIndex": fi,
                         **({"client": e.client, "agentId": e.agent_id, "tag1": e.tag1} if e else {})})
        src, via = cert.row_src.get(u, (None, "anchor" if u < cert.k else "address"))
        out["rows"].append({"u": u, "source": src if via in ("wallet", "owner") else None, "via": via,
                            "aliasOf": enc["aliases"].get(u), "sPlus": cert.splus[u], "bPlus": cert.bplus[u],
                            "bMinus": cert.bminus[u], "edges": erow})
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
    """Independent decoder of the `rows` calldata (encoder check). Returns (rows with aliases expanded,
    declared sPlus per row, {u: (source | None, via_owner, alias_ref | None)}, Merkle leaves)."""
    b = bytes.fromhex(hexrows[2:])
    W, nrows = b[0], int.from_bytes(b[1:5], "big")
    off, rows, splus, meta, leaves = 5, {}, {}, {}, []
    prev = -1
    for _ in range(nrows):
        start = off
        u = int.from_bytes(b[off:off + W], "big"); off += W
        hdr = int.from_bytes(b[off:off + 2], "big"); off += 2
        assert u > prev, "rows must be strictly increasing"
        prev = u
        via_owner = bool(hdr & HDR_VIA_OWNER)
        if hdr & HDR_ALIAS:
            assert hdr & (HDR_SRC | HDR_SPLUS | HDR_NE_MASK) == 0, "alias row carries no payload"
            ref = int.from_bytes(b[off:off + W], "big"); off += W
            assert ref < u and ref in rows and meta[ref][2] is None and meta[ref][0] is not None, "bad alias ref"
            rows[u], splus[u], meta[u] = list(rows[ref]), splus[ref], (meta[ref][0], via_owner, ref)
            leaves.append(keccak(b[start:off]))
            continue
        assert not (via_owner and not hdr & HDR_SRC), "VIA_OWNER without a source"
        src = None
        if hdr & HDR_SRC:
            src = "0x" + b[off:off + 20].hex(); off += 20
        sp = None
        if hdr & HDR_SPLUS:
            sp = int.from_bytes(b[off:off + 4], "big"); off += 4
        edges = []
        assert hdr & HDR_NE_MASK <= ROW_MAX, "nE > ROW_MAX"
        for _ in range(hdr & HDR_NE_MASK):
            dst = int.from_bytes(b[off:off + W], "big")
            assert dst != u and (not edges or dst > edges[-1][0]), "dst must differ from u and increase"
            q = int.from_bytes(b[off + W:off + W + 2], "big", signed=True)
            fi = int.from_bytes(b[off + W + 2:off + W + 6], "big")
            edges.append((dst, q, fi)); off += W + 6
        leaves.append(keccak(b[start:off]))
        rows[u] = edges
        splus[u] = sp if sp is not None else sum(q for _, q, _ in edges if q > 0)
        meta[u] = (src, via_owner, None)
    assert off == len(b)
    return rows, splus, meta, leaves


def check_file(path: Path) -> None:
    check_file_obj(json.loads(path.read_text()), path)


def check_file_obj(obj: dict, path=None) -> None:
    cert = load_certificate(obj)
    r, e, d, errs = verify(cert)                         # includes t <= y (D26)
    assert not errs, (path, errs)
    assert [str(x) for x in r] == obj["expected"]["r"], (path, r)
    assert [str(x) for x in d] == obj["expected"]["d"], path
    assert [str(x) for x in e] == obj["expected"]["e"], path
    assert str(sum(ceil_div(l * ex, WAD) for l, ex in zip(cert.lambdas, e))) == obj["expected"]["eEff"], path
    rows, splus, meta, leaves = decode_rows(obj["calldata"]["rows"])
    assert rows == cert.rows and splus == cert.splus, path
    assert "0x" + merkle_root(leaves).hex() == obj["expected"]["graphRoot"], path
    for r in obj["rows"]:                                # decoded header meta == published JSON meta
        src, via_owner, ref = meta[r["u"]]
        assert (src, via_owner, ref) == (r["source"], r["via"] == "owner", r["aliasOf"]), (path, r["u"])
    vec = bytes.fromhex(obj["calldata"]["vectors"][2:])
    assert "0x" + keccak(vec).hex() == obj["expected"]["vectorRoot"]


# ----------------------------------------------------------------------------- génération des vecteurs


def _toy_graph(spec_rows: dict, anchors: list[str], agents: list[int], addrs: list[str] = ()) -> Graph:
    """Graphe jouet construit à la main : spec_rows = {clé_src: [(agentId_dst, q, fbIdx)]}."""
    from graph import Edge
    nodes = [(ANCHOR, a) for a in sorted(anchors)] + [(AGENT, a) for a in sorted(agents)] + [(ADDR, a) for a in sorted(addrs)]
    index = {k: i for i, k in enumerate(nodes)}
    rows = {}
    for src, lst in spec_rows.items():
        u = index[src]
        rows[u] = sorted([Edge(dst=index[(AGENT, j)], q=q, client=str(src[1]), agent_id=j, tag1="vouch" if q > 0 else "slash",
                               feedback_index=fi) for j, q, fi in lst], key=lambda e: e.dst)
    return Graph(nodes=nodes, index=index, rows=rows, anchors=list(range(len(anchors))), log={}, rejected=[])


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

    def dump(name, g, cert, schema, filt, notes, idn_=idn):
        obj = export_certificate(g, cert, idn_, schema=schema, filter_tags=filt, label=name, notes=notes)
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
         "agentWallet = 0 après transfert.")
    fb_t, idn_t, anc_t = toy_identity_graph()
    sch_t = {k: v for k, v in ref.items() if k in core}
    g = build_graph(fb_t, idn_t, sch_t, core, anc_t, owner_fallback=True)
    dump("toy_alias_owner_rowmax", g, certify(g, Fraction(1, 3)), sch_t, core,
         "Jouet R7 : wallet partagé W (#1, #2 : ligne alias), repli owner (#3 VIA_OWNER ; #4 a un wallet, qui "
         "l'emporte), ligne de #6 à 300 arêtes plafonnée à ROW_MAX = 256 avec sPlus déclaré.", idn_=idn_t)
    A1, A2 = "0x" + "11" * 20, "0x" + "22" * 20
    toy = _toy_graph({(ANCHOR, A1): [(1, 10000, 1), (2, 5000, 1)], (AGENT, 1): [(2, 3333, 2), (3, -10000, 1)],
                      (AGENT, 2): [(1, 7777, 1), (3, 2500, 4)], (AGENT, 3): [(1, 1, 1)]},
                     [A1, A2], [1, 2, 3])
    for al in (Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)):
        dump(f"toy_alpha_{al.numerator}_{al.denominator}", toy, certify(toy, al), ref, core,
             "Jouet : ancre A2 sans arête (colonne triviale), arête négative, poids non ronds, cycle 1<->2.", idn_=None)
    c = certify(toy, Fraction(1, 3), truncate_below=WAD // 10)
    dump("toy_truncated", toy, c, ref, core, "Jouet, troncature des lignes de t <= 0,1 WAD : marge (1−α)·t_u ajoutée à r.",
         idn_=None)
    print("| vecteur | nCert | arêtes | lignes | alias | itérations depuis 0 | e (wei) |")
    print("|---|---|---|---|---|---|---|")
    for name, n, ne, nr, na, it, e in written:
        print(f"| {name} | {n} | {ne} | {nr} | {na} | {it} | {e} |")


if __name__ == "__main__":
    sys.exit(main())

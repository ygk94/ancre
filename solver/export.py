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

from graph import ADDR, AGENT, ANCHOR, GRID, WAD, ZERO, Graph, Identity, TagSpec
from ppr import Certificate, certify, e_eff, verify, MODES, _int_pass, _residual, ceil_div

HERE = Path(__file__).parent
LANE_MASK = (1 << 63) - 1
FORMAT = "ancre-cert-v0"


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


def encode(cert: Certificate, nodes: list[tuple[str, object]], identity: Identity | None):
    """Calldata au format R5 (submitCertificate) : newNodes, vectors, rows ; + graphRoot, vectorRoot."""
    n, k = cert.n, cert.k
    W = 2 if n <= 0xFFFF else 4
    new_nodes = b""
    for kind, key in nodes[k:]:
        if kind == AGENT:
            new_nodes += bytes([1]) + int(key).to_bytes(4, "big")
        elif kind == ADDR:
            new_nodes += bytes([2]) + bytes.fromhex(str(key)[2:])
        else:
            raise ValueError("une ancre hors des k premiers nœuds")
    fps = []
    for kind, key in nodes:
        fps.append(owner_fp(identity.owner.get(int(key))) if (kind == AGENT and identity) else 0)
    vectors = b"".join(b"".join(cert.t[a][v].to_bytes(8, "big") for a in range(k)) + fps[v].to_bytes(8, "big")
                       for v in range(n))
    rows = bytes([W]) + len(cert.rows).to_bytes(4, "big")
    leaves = []
    wallets = {}
    for u in sorted(cert.rows):
        kind, key = nodes[u]
        wallet = identity.wallet.get(int(key)) if (kind == AGENT and identity) else None
        has_w = bool(wallet and wallet != ZERO)
        edges = cert.rows[u]
        hdr = len(edges) | (0x8000 if has_w else 0)
        rb = u.to_bytes(W, "big") + hdr.to_bytes(2, "big") + (bytes.fromhex(wallet[2:]) if has_w else b"")
        for dst, q, fi in edges:
            rb += dst.to_bytes(W, "big") + (q & 0xFFFF).to_bytes(2, "big") + fi.to_bytes(4, "big")
        rows += rb
        leaves.append(keccak(rb))
        wallets[u] = wallet if has_w else None
    return {"W": W, "newNodes": new_nodes, "vectors": vectors, "rows": rows,
            "graphRoot": merkle_root(leaves), "vectorRoot": keccak(vectors), "ownerFp": fps, "wallets": wallets}


def export_certificate(g: Graph, cert: Certificate, identity: Identity | None, *, schema: dict[str, TagSpec],
                       filter_tags: list[str], min_anchors: int = 2, label: str = "", notes: str = "") -> dict:
    nodes = [g.nodes[gi] for gi in cert.node_map]
    enc = encode(cert, nodes, identity)
    # clefs d'arêtes d'origine (client, agent, tag1) pour la relecture humaine
    orig = {}
    for u, row in g.rows.items():
        for e in row:
            orig[(u, e.dst, e.feedback_index)] = e
    inv = {gi: ci for ci, gi in enumerate(cert.node_map)}
    back = {ci: gi for gi, ci in inv.items()}
    tight_r = _residual("tight", cert.n, cert.k, cert.alphaN, cert.alphaD, cert.rows, cert.t,
                        *(_int_pass(cert.n, cert.anchors, cert.alphaN, cert.alphaD, cert.rows, cert.bplus,
                                    cert.bminus, cert.t, cert.lambdas)[:3]))
    out = {
        "format": FORMAT,
        "label": label,
        "notes": notes,
        "alignedWith": "contracts/src/AnchoredReputation.sol (R5), état lu le 2026-09-27 ~12:55 ; ENCODING.md non publié",
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
        row = cert.rows[u]
        erow = []
        for dst, q, fi in row:
            e = orig.get((back[u], back[dst], fi))
            erow.append({"dst": dst, "w": q, "feedbackIndex": fi,
                         **({"client": e.client, "agentId": e.agent_id, "tag1": e.tag1} if e else {})})
        out["rows"].append({"u": u, "wallet": enc["wallets"][u], "bPlus": cert.bplus[u], "bMinus": cert.bminus[u],
                            "edges": erow})
    return out


def load_certificate(obj: dict, mode: str | None = None) -> Certificate:
    """Relit un JSON exporté en Certificate (pour la revérification croisée)."""
    k = len(obj["set"]["anchors"])
    rows = {r["u"]: [(e["dst"], e["w"], e["feedbackIndex"]) for e in r["edges"]] for r in obj["rows"]}
    return Certificate(n=obj["nCert"], anchors=list(range(k)), alphaN=obj["set"]["alphaN"], alphaD=obj["set"]["alphaD"],
                       lambdas=[int(x) for x in obj["set"]["lambdas"]], rows=rows,
                       bplus={r["u"]: r["bPlus"] for r in obj["rows"]}, bminus={r["u"]: r["bMinus"] for r in obj["rows"]},
                       t=[[int(x) for x in col] for col in obj["vectors"]["t"]],
                       mode=mode or obj["expected"]["residualMode"])


def decode_rows(hexrows: str) -> dict[int, list[tuple[int, int, int]]]:
    """Décodeur indépendant du calldata `rows` (contrôle de l'encodeur)."""
    b = bytes.fromhex(hexrows[2:])
    W, nrows = b[0], int.from_bytes(b[1:5], "big")
    off, out = 5, {}
    for _ in range(nrows):
        u = int.from_bytes(b[off:off + W], "big"); off += W
        hdr = int.from_bytes(b[off:off + 2], "big"); off += 2
        if hdr & 0x8000:
            off += 20
        edges = []
        for _ in range(hdr & 0x7FFF):
            dst = int.from_bytes(b[off:off + W], "big")
            q = int.from_bytes(b[off + W:off + W + 2], "big", signed=True)
            fi = int.from_bytes(b[off + W + 2:off + W + 6], "big")
            edges.append((dst, q, fi)); off += W + 6
        out[u] = edges
    assert off == len(b)
    return out


def check_file(path: Path) -> None:
    obj = json.loads(path.read_text())
    cert = load_certificate(obj)
    r, e, d, errs = verify(cert)
    assert not errs, errs
    assert [str(x) for x in r] == obj["expected"]["r"], (path, r)
    assert [str(x) for x in d] == obj["expected"]["d"], path
    assert decode_rows(obj["calldata"]["rows"]) == cert.rows, path
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


def main():
    import run_mainnet as R
    from graph import build_graph, load_feedbacks_onchain, load_identity, load_schema
    outdir = HERE / "vectors"
    outdir.mkdir(exist_ok=True)
    fbs = load_feedbacks_onchain(R.FB_ONCHAIN)
    idn = load_identity(R.STATE, R.LOGS, R.APPR)
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
        written.append((p.name, cert.n, sum(len(r) for r in cert.rows.values()), cert.r, cert.e))

    g = build_graph(fbs, idn, ref, core, [h1, h2])
    dump("mainnet_honest_d16", g, certify(g, Fraction(1, 3)), ref, core,
         "Acte 1 (d) : ancres 0x0730/0xf7d5, filtre core, D16 strict. La chaîne s'arrête à #18 (wallet 0xea0b ambigu).")
    g = build_graph(fbs, idn, ref, core, [h1, h2], ambiguous_wallet="relay")
    dump("mainnet_honest_relay", g, certify(g, Fraction(1, 3)), ref, core,
         "Variante relais (non décidée) : #18,#22,#23 -> nœud-adresse 0xea0b (poids 1, feedbackIndex 0). Contient une arête négative (slash -> #4).")
    g = build_graph(fbs, idn, ref, core, [ea0b, h1])
    dump("mainnet_slash_anchor", g, certify(g, Fraction(1, 3)), ref, core,
         "Acte 1 (e) : ancres {0xea0b, 0x0730}, D14 : l'arête 0xea0b->#4 vaut -10000 (slash), le review +1 ne l'efface pas.")
    pre = {t: TagSpec(s.min_wad, s.neutral_wad, s.max_wad, "endorsement") for t, s in ref.items()}
    filt = ["trust", "liveness", "eve", "plague", "vouch", "review", "slash"]
    g = build_graph(fbs, idn, pre, filt, [sc, h1])
    dump("mainnet_scanner_preD15", g, certify(g, Fraction(1, 3)), pre, filt,
         "Acte 1 (b) SANS D15 (schéma modifié : tout propage) : fuite du scanner vers la ferme. Grand certificat (lignes Spawn -> #182).")
    # cas jouets : troncature avec marge, ancre sans arête, poids fractionnaires, α = 1/4 et 1/2
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
    for name, n, ne, r, e in written:
        print(f"{name}: nCert={n}, arêtes={ne}, r={r}, e={e}")


if __name__ == "__main__":
    sys.exit(main())

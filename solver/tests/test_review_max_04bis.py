"""Regressions of the complete maximal review of 06/10 (docs/revue/revue-max-2026-10-06-complete.md), HIGH findings
of chantier 04-bis (TBL, STUCK, THIRD, L3, W1, AMENDS) and AM-06.1. Each test reproduces the failure scenario."""
import json
import os
import stat
import sys
from fractions import Fraction
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import certifier as C
import run_mainnet as R
import watcher as Wt
from export import keccak, node_key
from graph import ADDR, AGENT, ANCHOR, GRID, ROW_MAX, build_graph, load_schema
from ppr import certify, verify
from test_solver import fb, ident, schema

HERE = Path(__file__).resolve().parents[1]


# ----------------------------------------------------------------------------- TBL
class TableChain:
    """nodeCount / nodeKeyAt answered from a list of keys; any log or calldata read is a failure (the old reader)."""

    def __init__(self, keys):
        self.keys = keys

    def eth_call(self, to, data):
        sel = data[:10]
        if sel == "0x" + keccak(b"nodeCount(bytes32)").hex()[:8]:
            return hex(len(self.keys))
        i = int(data[10 + 64:], 16)
        return "0x" + (int(self.keys[i], 16) if i < len(self.keys) else 0).to_bytes(32, "big").hex()

    def logs(self, *a, **k):
        raise AssertionError("TBL: the table must not be rebuilt from logs / calldata")

    tx_input = logs


def test_tbl_table_read_from_contract_storage_not_calldata():
    """A relayed addNodes (Multicall3, Safe, 4337, 7702) used to raise 'cannot decode the transaction behind
    NodesAdded' at every round. The table now comes from nodeKeyAt, whoever added the nodes."""
    A1, A2 = "0x" + "a1" * 20, "0x" + "a2" * 20
    nodes = [(ANCHOR, A1), (ANCHOR, A2), (AGENT, 18), (ADDR, "0x" + "cd" * 20), (AGENT, 999_999)]
    ch = TableChain([node_key(n) for n in nodes])
    t = C.chain_table(ch, "0xc", "0x" + "11" * 32, [A2, A1])
    assert t == nodes
    ch.keys.append(node_key((AGENT, 4)))                       # incremental: only the new index is read
    assert C.chain_table(ch, "0xc", "0x" + "11" * 32, [A1, A2], table=t) == nodes + [(AGENT, 4)]
    with pytest.raises(RuntimeError):                          # wrong set: anchors differ
        C.chain_table(ch, "0xc", "0x" + "11" * 32, ["0x" + "a3" * 20, A1])


# ----------------------------------------------------------------------------- STUCK, THIRD
def honest_cert():
    fbs, idn = R.load_mainnet()
    raw = json.load(open(HERE / "schema_reference.json"))
    g = build_graph(fbs, idn, load_schema(raw), raw["filters"]["core"],
                    [R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)])
    return g, certify(g, Fraction(1, 3))


def test_stuck_distinct_variant_is_valid_and_differs_only_in_vectors():
    from export import encode
    g, cert = honest_cert()
    var = C.distinct_variant(cert)
    assert var is not None and not verify(var)[3] and var.d == cert.d
    nodes = [g.nodes[i] for i in cert.node_map]
    e0, e1 = encode(cert, nodes, None), encode(var, nodes, None)
    assert e0["graphRoot"] == e1["graphRoot"] and e0["vectorRoot"] != e1["vectorRoot"]
    assert sum(map(sum, cert.t)) - sum(map(sum, var.t)) == 1


class FakeChain:
    """Just enough chain for Certifier.run_once: the incumbent is IDENTICAL to the recomputation and was PROVEN."""

    def __init__(self, oc_tuple, table):
        self.oc, self.table, self.sent = oc_tuple, table, []
        self.signer = C.Signer("0x" + "f3" * 20)
        self.sender = self.signer.address

    def block_number(self):
        return 1_000_000

    def eth_call(self, to, data):
        return TableChain([node_key(n) for n in self.table]).eth_call(to, data)

    def call(self, to, sig, *args):
        return self.oc[0] if sig == C.CERT_VIEW else self.oc[1]

    def estimate(self, *a):
        return 100_000

    def send(self, to, sig, *args, gas_limit):
        self.sent.append(sig)
        return {"ok": True, "gasUsed": "0x1", "transactionHash": "0xab", "blockNumber": "0x1"}


def test_stuck_proven_incumbent_identical_to_recomputation_is_replaced(tmp_path):
    """Before: run_once returned skip_identical (or replacement_wait raised) and the set stayed STALE for good."""
    from export import encode, quality
    fbs, idn = R.load_mainnet()
    raw = json.load(open(HERE / "schema_reference.json"))
    h1, h2 = R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)
    cfg = C.SetConfig(name="s", anchors=[h1, h2], lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3,
                      filter_tags=raw["filters"]["core"], max_age=288_000)
    svc0 = C.Certifier(cfg, None, "0xc", cfg.set_id, tmp_path / "s0.json", C.Journal(None))
    g, al, enc = svc0.compute(fbs, idn, C.anchor_table(cfg.anchors), 0)
    q, mass, d = quality(al.cert)
    gr, vr = "0x" + enc["graphRoot"].hex(), "0x" + enc["vectorRoot"].hex()
    cert_view = f"999000\n{C.e_eff(al.cert) + 10**17}\n{10**17}\n{gr}\n{vr}\n0x0\n{al.cert.n}\n{len(al.cert.rows)}\nfalse"
    q_view = f"{mass}\n{10**17}\n{d}\ntrue"                  # proven = true, eLowEff = 1e17
    ch = FakeChain((cert_view, q_view), al.nodes)
    svc = C.Certifier(cfg, ch, "0xc", cfg.set_id, tmp_path / "s.json", C.Journal(None))
    r = svc.run_once(fbs, idn, reason="test")
    assert r["action"] == "certified" and ch.sent == [C.SUBMIT_SIG]


def test_third_contract_change_is_news_our_own_is_not():
    svc = C.Certifier.__new__(C.Certifier)
    svc.last_seen = None
    oc = lambda gr, el: C.OnChain(1, 10, gr, "0xv", 6, False, el)
    assert not svc.contract_changed(oc("0xa", 0))              # first look
    assert not svc.contract_changed(oc("0xa", 0))
    assert svc.contract_changed(oc("0xb", 0))                  # a third-party certificate
    assert svc.contract_changed(oc("0xb", 5))                  # a proof widened the incumbent


# ----------------------------------------------------------------------------- L3
def test_l3_address_with_257_slashes_does_not_stop_the_certifier():
    """Before: ValueError 'row with 257 negative edges > ROW_MAX' on EVERY recomputation (a massless address)."""
    A, X = "0x" + "a1" * 20, "0x" + "e7" * 20
    agents = list(range(1, ROW_MAX + 3))
    idn = ident(owner={j: "0x" + f"{0xB000 + j:040x}" for j in agents}, wallet={j: "0x" + f"{0xC000 + j:040x}"
                                                                                 for j in agents})
    fbs = [fb(1, A, 1, 100, "vouch")] + [fb(j, X, 1, -100, "slash") for j in agents]
    g = build_graph(fbs, idn, schema(), ["vouch", "review", "slash"], [A])
    cert = certify(g, Fraction(1, 3))                          # no raise
    assert g.index[(ADDR, X)] not in cert.node_map or not cert.rows.get(cert.node_map.index(g.index[(ADDR, X)]))
    # the same 257 slashes by an ANCHOR (massive) still cannot be certified honestly
    g2 = build_graph(fbs, idn, schema(), ["vouch", "review", "slash"], [A, X])
    with pytest.raises(ValueError):
        certify(g2, Fraction(1, 3))


# ----------------------------------------------------------------------------- W1, W6
def test_w1_cumulated_dilution_is_provable():
    """The wallet of #1 endorses 10 agents at +5 000; the certificate keeps only #1 -> #2. Before: 9 OMITTED_POSITIVE,
    nothing provable, t(#2) x5."""
    from types import SimpleNamespace
    from export import encode
    A = "0x" + "a1" * 20
    W1 = "0x" + "c1" * 20
    agents = list(range(1, 12))
    idn = ident(owner={j: "0x" + f"{0xB000 + j:040x}" for j in agents}, wallet={**{j: "0x" + f"{0xC000 + j:040x}"
                                                                                   for j in agents}, 1: W1})
    fbs = [fb(1, A, 1, 100, "vouch")] + [fb(j, W1, 1, 50, "vouch") for j in range(2, 12)]
    sch = schema()
    filt = ["vouch", "review", "slash"]
    g = build_graph(fbs, idn, sch, filt, [A])
    u1 = g.index[(AGENT, 1)]
    keep = g.index[(AGENT, 2)]
    g.rows[u1] = [e for e in g.rows[u1] if e.dst == keep]
    cert = certify(g, Fraction(1, 3))
    cert.splus = {u: sum(w for _, w, _ in r if w > 0) for u, r in cert.rows.items()}   # sPlus NOT declared
    cert.r, cert.e, cert.d, _ = verify(cert, require_subsolution=False)
    nodes = [g.nodes[i] for i in cert.node_map]
    enc = encode(cert, nodes, idn)
    cfg = SimpleNamespace(schema=lambda: sch, filter_tags=filt, anchors=[A], owner_fallback=False)
    disc = Wt.audit("0x" + enc["rows"].hex(), nodes, fbs, idn, cfg)
    dil = [d for d in disc if d.kind == "DILUTION"]
    assert len(dil) == 9 and all(d.provable for d in dil) and not [d for d in disc if d.kind == "OMITTED_POSITIVE"]
    # the chain: the first link alone does not exceed B⁺ (5000 + 5000 <= 10000) but is proven, because more follow
    first = sorted(dil, key=lambda d: -d.w_registry)[0]
    assert not Wt.still_dilutes([], first) and Wt.still_dilutes([], first, pending=8 * 5000)


def test_w6_budget_is_the_contracts_current_one():
    """Review W6 (a6/w6_cycle.py shape): committed #2 +10 000 (inflated, registry +5 000), #3 +5 000, #4 omitted
    (+5 000), sPlus NOT declared. After the INFLATED proof the amended sum is 10 000; the contract's floor is GRID (not
    the committed 15 000), so the omission of #4 is still billed. The old test (S + q > committed B⁺) skipped it."""
    d = Wt.Discrepancy("DILUTION", 0, None, "0x", 4, 0, 5000)
    d.proof = {"rowSPlus": 15_000, "rowBPlus": 15_000, "rowG": GRID}
    after_inflated = [(2, 10_000, 5000)]
    assert Wt.still_dilutes(after_inflated, d)
    assert not (15_000 - 5000 + 5000 > 15_000)                 # what the old rule computed: skipped
    assert Wt.side(10_000, 0, 5000, GRID)[0] > 0 and Wt.side(5000, 0, 5000, GRID)[0] == 0


def test_side_matches_the_contract_on_known_values():
    # S = 9000 -> 14000 under GRID: B 10000 -> 14000; dec = 9000 * 4000 / (10000 * 14000)
    assert Wt.side(9000, 0, 5000, GRID)[0] == -(-9000 * 4000 * 10**18 // (10_000 * 14_000))


# ----------------------------------------------------------------------------- AMENDS
def test_amends_rebuilt_from_edge_proven_events_match_the_contract_hash():
    """Before: every row restarted from amends = [], so any proof already on the row (third party, cheating
    submitter, restart) made the watcher's next proof revert BadProof(5)."""
    rows_hex = "0x" + "02" + (1).to_bytes(4, "big").hex() + (0).to_bytes(2, "big").hex() + "0000"
    # row u = 0 (anchor), no edge: a 2-byte W, 1 row, u = 0, hdr = 0
    from export import decode_rows
    _, _, _, slices = decode_rows(rows_hex)
    leaf = keccak(slices[0])
    am = [(7, 0, 10_000), (9, 0, -5000)]
    h = "0x" + keccak(leaf + Wt.amends_bytes(am)).hex()
    sid = "0x" + "11" * 32
    w = lambda x: (x % (1 << 256)).to_bytes(32, "big").hex()

    class AmChain:
        def logs(self, contract, sig, frm, *topics, to_block="latest"):
            if sig == Wt.ROW_VOIDED:
                return []
            mk = lambda a, wn, li: {"blockNumber": "0x10", "logIndex": hex(li),
                                    "topics": ["0x0", sid, "0x" + w(0), "0x" + w(a)],
                                    "data": "0x" + w(0) + w(wn) + w(0) + w(0)}
            return [mk(7, 5000, 0), mk(9, -5000, 1), mk(7, 10_000, 2)]   # #7 proven twice: replaced in place

        def call(self, contract, sig, *args):
            return f"({self.h}, 0, 0, 0, false)"
    ch = AmChain()
    ch.h = h
    out = Wt.chain_amends(ch, "0xc", sid, rows_hex, [(ANCHOR, "0xa")], 1, C.Journal(None))
    assert out == {0: (am, False)}
    ch.h = "0x" + "00" * 32                                    # mismatch: the row is skipped, never extended blindly
    assert Wt.chain_amends(ch, "0xc", sid, rows_hex, [(ANCHOR, "0xa")], 1, C.Journal(None)) == {0: ([], True)}


# ----------------------------------------------------------------------------- AM-06.1
def test_am061_keystore_password_reaches_cast_as_a_0600_file(monkeypatch):
    monkeypatch.setenv("ANCRE_PW", "s3cret")
    s = C.Signer.build("0xAB", keystore="/k.json", password_env="ANCRE_PW")
    path = s.env()["ETH_PASSWORD"]
    assert path != "s3cret" and open(path).read() == "s3cret"
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600 and stat.S_IMODE(os.stat(os.path.dirname(path)).st_mode) == 0o700
    assert s.env()["ETH_PASSWORD"] == path                     # written once
    assert "s3cret" not in " ".join(s.args())
    monkeypatch.setenv("ANCRE_PASSWORD_FILE", path)            # demo/certify.py convention: a *_FILE variable
    assert C.Signer.build("0xab", "/k.json", "ANCRE_PASSWORD_FILE").env() == {"ETH_PASSWORD": path}
    assert C.Signer.build("0xab", "/k.json", password_file="/pw").env() == {"ETH_PASSWORD": "/pw"}
    assert C.Signer.build(None) is None and C.Signer.build("0xAB").mode == "unlocked"


def test_am061_cast_error_on_stdout_is_not_lost(tmp_path):
    fake = tmp_path / "cast"
    fake.write_text("#!/bin/sh\necho '{\"error\":\"wrong password\"}'\nexit 1\n")
    fake.chmod(0o755)
    with pytest.raises(C.ChainError, match="wrong password"):
        C.Chain("http://x", cast=str(fake)).block_number()


# ============================================================================= MEDIUM findings
def test_nodes600_chunks_fit_under_the_cap():
    g = C.GasPolicy()
    assert g.add_nodes_per_tx == 450 and g.limit(450 * 45_900) < g.tx_cap      # v1: ~45.9 k/node (GAS.md 01/10)
    assert g.limit(600 * 45_900) > g.tx_cap                                    # the old default broke


def test_logs_split_on_public_rpcs(tmp_path):
    fake = tmp_path / "cast"
    fake.write_text('#!/bin/sh\necho "$@" > "' + str(tmp_path / "argv") + '"\necho "[]"\n')
    fake.chmod(0o755)
    C.Chain("https://rpc.monad.xyz", cast=str(fake)).logs("0xc", "E()", 0)
    assert "--query-size 100" in (tmp_path / "argv").read_text()
    C.Chain("https://rpc1.monad.xyz", cast=str(fake)).logs("0xc", "E()", 0)
    assert "--query-size" not in (tmp_path / "argv").read_text()                 # full-history RPC: one query


def test_chkreg_registry_changed_is_a_trigger():
    svc = C.Certifier.__new__(C.Certifier)
    svc.last_seen = None
    svc.contract_changed(C.OnChain(1, 10, "0xa", "0xv", 6, False))
    assert svc.contract_changed(C.OnChain(1, 10, "0xa", "0xv", 6, True))       # checkRegistry flagged it


class GasChain(FakeChain):
    """Empty table and no certificate yet; the first submitCertificate estimate is above the cap."""

    def __init__(self, table):
        super().__init__(("0\n0\n0\n0x0\n0x0\n0x0\n0\n0\nfalse", "0\n0\n0\nfalse"), table)
        self.estimates = []

    def estimate(self, to, sig, *args):
        self.estimates.append(sig)
        return 30_000_000 if len(self.estimates) == 1 else 100_000


def test_gascap_falls_back_to_truncation(tmp_path):
    fbs, idn = R.load_mainnet()
    raw = json.load(open(HERE / "schema_reference.json"))
    cfg = C.SetConfig(name="s", anchors=[R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)],
                      lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3, filter_tags=raw["filters"]["core"],
                      submitters=["0x" + "f3" * 20], registry_verified=False)
    ch = GasChain(C.anchor_table(cfg.anchors))
    jr = tmp_path / "j.jsonl"
    r = C.Certifier(cfg, ch, "0xc", cfg.set_id, tmp_path / "s.json", C.Journal(jr)).run_once(fbs, idn, reason="t")
    acts = [json.loads(l)["action"] for l in jr.read_text().splitlines()]
    assert "gas_cap_truncate" in acts and r["action"] == "certified" and r.get("truncateBelow") == 10**12


def test_defer_sets_a_retry_block(tmp_path):
    fbs, idn = R.load_mainnet()
    raw = json.load(open(HERE / "schema_reference.json"))
    cfg = C.SetConfig(name="s", anchors=[R.resolve(R.HONEST1, fbs), R.resolve(R.HONEST2, fbs)],
                      lambdas=[5 * 10**17] * 2, alphaN=1, alphaD=3, filter_tags=raw["filters"]["core"])
    svc0 = C.Certifier(cfg, None, "0xc", cfg.set_id, tmp_path / "s0.json", C.Journal(None))
    g, al, enc = svc0.compute(fbs, idn, C.anchor_table(cfg.anchors), 0)
    from export import quality
    q, mass, d = quality(al.cert)
    # incumbent: young (age 100 < minRefresh 600), MORE mass than ours -> NotBetter, wait until minRefresh
    cert_view = f"999900\n10\n0\n0xdead\n0xbeef\n0x0\n{al.cert.n}\n1\nfalse"
    ch = FakeChain((cert_view, f"{mass + 10**17}\n0\n{d}\nfalse"), al.nodes)
    svc = C.Certifier(cfg, ch, "0xc", cfg.set_id, tmp_path / "s.json", C.Journal(None))
    r = svc.run_once(fbs, idn, reason="t")
    assert r["action"] == "deferred_replacement_rule" and svc.retry_at == 1_000_000 + r["waitBlocks"]


def test_w7_overstated_negative_is_provable():
    from types import SimpleNamespace
    from export import encode
    A = "0x" + "a1" * 20
    idn = ident(owner={2: "0x" + "b2" * 20, 3: "0x" + "b3" * 20}, wallet={2: "0x" + "c2" * 20, 3: "0x" + "c3" * 20})
    fbs = [fb(2, A, 1, -100, "slash"), fb(3, A, 1, -1, "slash")]               # registry: #2 -10000, #3 -100
    sch, filt = schema(), ["vouch", "review", "slash"]
    g = build_graph(fbs, idn, sch, filt, [A])
    from graph import Edge
    ua = g.index[(ANCHOR, A)]
    g.rows[ua] = [Edge(e.dst, -GRID, e.client, e.agent_id, e.tag1, e.feedback_index) for e in g.rows[ua]]
    cert = certify(g, Fraction(1, 3))
    nodes = [g.nodes[i] for i in cert.node_map]
    cfg = SimpleNamespace(schema=lambda: sch, filter_tags=filt, anchors=[A], owner_fallback=False)
    disc = Wt.audit("0x" + encode(cert, nodes, idn)["rows"].hex(), nodes, fbs, idn, cfg)
    ov = [d for d in disc if d.kind == "OVERSTATED_NEG"]
    assert len(ov) == 1 and ov[0].agent_id == 3 and ov[0].provable and ov[0].proof["fn"] == "proveEdge"


class WatchChain:
    """watch_once inputs: one CertificateSubmitted (current root) in the window or only at certBlock."""

    def __init__(self, root, in_window=True, tx_error=False):
        self.root, self.in_window, self.tx_error = root, in_window, tx_error
        self.signer = None

    def block_number(self):
        return 200

    def logs(self, contract, sig, frm, *topics, to_block="latest"):
        if sig != C.CERT_SUBMITTED:
            return []
        lg = {"data": "0x" + "00" * 32 + self.root[2:] + "00" * 32 * 6, "transactionHash": "0xaa",
              "blockNumber": hex(100), "logIndex": "0x0"}
        return [lg] if (self.in_window or frm == 100) else []

    def call(self, to, sig, *a):
        return f"100\n1\n0\n{self.root}\n0xv\n0x0\n6\n1\nfalse" if sig == C.CERT_VIEW else "0\n0\n0\nfalse"

    def tx_input(self, h):
        if self.tx_error:
            raise C.ChainError("HTTP 502")
        return "0x" + C._selector(C.SUBMIT_SIG)[2:] + "00"


def _dilution_setup(monkeypatch, tmp_path):
    import simulate as S
    monkeypatch.setattr(S, "SCR", tmp_path)
    fbs, idn = R.load_mainnet()
    obj = json.loads((HERE / "vectors" / "violations" / "dilution.json").read_text())
    cert, nodes, enc = S.vector_calldata(obj)
    monkeypatch.setattr(Wt, "decode_input", lambda chain, inp: {"rows": "0x" + enc["rows"].hex()})
    return fbs, idn, nodes, S.cfg_from_vector(obj, "dil"), "0x" + enc["graphRoot"].hex()


def test_once_current_certificate_is_reaudited_every_round(monkeypatch, tmp_path):
    fbs, idn, nodes, cfg, root = _dilution_setup(monkeypatch, tmp_path)
    ev = Wt.watch_once(WatchChain(root, in_window=False), "0xc", cfg, cfg.set_id, nodes, fbs, idn,
                       C.Journal(None), 150, 200)
    assert [e["action"] for e in ev] == ["audit"] and any(d["kind"] == "DILUTION" for d in ev[0]["discrepancies"])
    assert Wt.watch_once(WatchChain(root, in_window=False), "0xc", cfg, cfg.set_id, nodes, fbs, idn,
                         C.Journal(None), 150, 200, reaudit=False) == []      # the old behaviour


def test_swallow_transport_error_keeps_the_window(monkeypatch, tmp_path):
    fbs, idn, nodes, cfg, root = _dilution_setup(monkeypatch, tmp_path)
    with pytest.raises(C.ChainError):                                           # the caller keeps from_block
        Wt.watch_once(WatchChain(root, tx_error=True), "0xc", cfg, cfg.set_id, nodes, fbs, idn, C.Journal(None), 90)


def test_break_a_reverted_estimate_does_not_stop_the_row(monkeypatch, tmp_path):
    fbs, idn, nodes, cfg, root = _dilution_setup(monkeypatch, tmp_path)
    # two provable discrepancies on one row: the first estimate reverts NothingToProve (stale export)
    real_audit = Wt.audit

    def audit2(*a, **k):
        out = real_audit(*a, **k)
        d = next(x for x in out if x.kind == "DILUTION")
        fake = Wt.Discrepancy("FABRICATED", d.u, None, d.client, 999, GRID, 0, provable=True,
                              proof={**d.proof, "agentJ": 999})
        return out + [fake]
    monkeypatch.setattr(Wt, "audit", audit2)
    seen = []

    def prove(chain, contract, set_id, d, gas, amends=(), send=False):
        seen.append(d.kind)
        if d.kind == "FABRICATED":
            raise C.ChainError('data: "' + C._selector("NothingToProve()") + '"')
        return {"kind": d.kind, "status": True}
    monkeypatch.setattr(Wt, "prove", prove)
    Wt.watch_once(WatchChain(root), "0xc", cfg, cfg.set_id, nodes, fbs, idn, C.Journal(None), 90)
    assert seen == ["FABRICATED", "DILUTION"]                                  # before: stopped after FABRICATED


# ============================================================================= LOW (trivial)
def test_dec18_and_dec28():
    from graph import TagSpec, dec_to_wad, quantize
    spec = TagSpec(0, 50 * 10**18, 100 * 10**18, "endorsement")
    assert quantize(100, 19, spec) is None                      # was: ValueError (stops the certifier)
    assert dec_to_wad("123456789012345678901234567890.5") == 123456789012345678901234567890500000000000000000

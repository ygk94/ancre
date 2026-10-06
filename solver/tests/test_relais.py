"""Relays of the indexer review (06/10) to the solver, the normative reference of the edge rules:

  REGCB  register() (ERC-8004 v2.0.0) writes agentWallet before _safeMint but emits MetadataSet(agentWallet) after the
         onERC721Received callback: the late event must not overwrite a wallet or owner change made in the callback
         (same rule as indexer/src/handlers/identity.ts, regTx / regPhase).
  NUL    a feedback whose tag text is not exact (tag1Exact = false: NUL, ill-formed UTF-16, > 1 KiB) is identified by
         its tagHash = keccak256(tag1 bytes), as the contract does; its text is never matched.
"""
import json

import pytest

from export import keccak
from from_indexer import feedbacks_file, identity_file, parity
from graph import (GRID, ZERO, Feedback, Identity, TagSpec, build_graph, dec_to_wad, load_feedbacks_onchain,
                   replay_identity_events, tag_hash)
import refresh as RF
from test_solver import ident, schema

C, D, W2, H1 = ("0x" + c * 40 for c in "cde1")
FILT = ["vouch", "review", "slash"]


# ----------------------------------------------------------------------------- REGCB

def _reg(agent, tx, callback=(), *, block=10, start_li=0, with_tx=True):
    """Logs of register() by contract C, in emission order: Transfer(0, C), [callback events], Registered,
    MetadataSet(agentWallet, C) (upstream IdentityRegistryUpgradeable.sol l.60-66)."""
    evs = [{"ev": "Transfer", "agent": agent, "frm": ZERO, "to": C}, *callback,
           {"ev": "Registered", "agent": agent, "owner": C},
           {"ev": "MetadataSet", "agent": agent, "key": "agentWallet", "val": C}]
    return [{**e, "block": block, "li": start_li + i, **({"tx": tx} if with_tx else {})} for i, e in enumerate(evs)]


def _replay(evs):
    return replay_identity_events(Identity(block=0, owner={}, wallet={}), evs, 0, 100)


@pytest.mark.parametrize("with_tx", [True, False])
def test_regcb_wallet_unset_in_callback_stays_unset(with_tx):
    unset = {"ev": "MetadataSet", "agent": 7, "key": "agentWallet", "val": ZERO}
    evs = _reg(7, "0x01", [unset], with_tx=with_tx) + _reg(8, "0x02", start_li=10, with_tx=with_tx)
    idn = _replay(evs)
    assert idn.wallet[7] == ZERO                          # registry: getAgentWallet(7) = 0 (fork, review 06/10)
    assert idn.wallet[8] == C                             # a plain register() keeps msg.sender
    # a later wallet change, in another transaction, applies normally
    later = {"ev": "MetadataSet", "agent": 7, "key": "agentWallet", "val": W2, "block": 11, "li": 0, "tx": "0x03"}
    assert replay_identity_events(idn, [later], 10, 100).wallet[7] == W2


@pytest.mark.parametrize("with_tx", [True, False])
def test_regcb_transfer_in_callback(with_tx):
    """transferFrom(C, D) in the callback: _update clears the wallet (MetadataSet "" BEFORE Transfer), owner D."""
    cb = [{"ev": "MetadataSet", "agent": 9, "key": "agentWallet", "val": ZERO},
          {"ev": "Transfer", "agent": 9, "frm": C, "to": D}]
    idn = _replay(_reg(9, "0x04", cb, with_tx=with_tx))
    assert (idn.owner[9], idn.wallet[9]) == (D, ZERO)
    assert idn.past_owners[9] == {C}
    # C's feedback on #9 is not a controller's: it is kept (it was wrongly rejected as CONTROLLER_WALLET)
    g = build_graph([Feedback(9, C, 1, 100, 0, "vouch", "", False)], idn, schema(), FILT, [H1])
    assert g.pairs[(C, 9)].q == GRID


def test_regcb_wallet_set_in_callback_wins():
    """setAgentWallet(j, W2) in the callback: W2 is the wallet; W2's self-endorsement is rejected (R6), C is free."""
    cb = [{"ev": "MetadataSet", "agent": 5, "key": "agentWallet", "val": W2}]
    idn = _replay(_reg(5, "0x05", cb))
    assert idn.wallet[5] == W2
    g = build_graph([Feedback(5, W2, 1, 100, 0, "vouch", "", False)], idn, schema(), FILT, [H1])
    assert (W2, 5) in g.r6_pairs


def test_regcb_other_metadata_keys_do_not_open_the_callback():
    """register(uri, metadata[]) emits MetadataSet(key) for its entries after MetadataSet(agentWallet): no effect."""
    evs = _reg(6, "0x06") + [{"ev": "MetadataSet", "agent": 6, "key": "name", "val": "0x", "block": 10, "li": 4,
                              "tx": "0x06"}]
    assert _replay(evs).wallet[6] == C


def test_regcb_raw_logs_through_refresh_decode():
    """refresh.py path: raw eth_getLogs entries carry transactionHash; decode keeps it, the replay uses it."""
    T, word = RF.T, lambda n: n.to_bytes(32, "big").hex()
    topic_addr = lambda a: "0x" + "00" * 12 + a[2:]
    agent = "0x" + word(7)

    def ms(val: bytes, li):
        key = b"agentWallet"
        data = (word(64) + word(128) + word(len(key)) + key.ljust(32, b"\0").hex() + word(len(val))
                + (val.ljust(32, b"\0").hex() if val else ""))
        return {"topics": [T["MetadataSet"], agent, "0x" + keccak(key).hex()], "data": "0x" + data,
                "blockNumber": "0xa", "logIndex": hex(li), "transactionHash": "0xaa"}
    logs = [{"topics": [T["Transfer"], topic_addr(ZERO), topic_addr(C), agent], "data": "0x", "blockNumber": "0xa",
             "logIndex": "0x0", "transactionHash": "0xaa"},
            ms(b"", 1),
            {"topics": [T["Registered"], agent, topic_addr(C)], "data": "0x" + word(32) + word(0), "blockNumber": "0xa",
             "logIndex": "0x2", "transactionHash": "0xaa"},
            ms(bytes.fromhex(C[2:]), 3)]
    evs = [RF.decode(lg) for lg in logs]
    assert [e["ev"] for e in evs] == ["Transfer", "MetadataSet", "Registered", "MetadataSet"]
    assert _replay(evs).wallet[7] == ZERO


def test_regcb_indexer_export_agrees():
    """from_indexer replays WalletChange rows; it cannot apply REGCB (no tx hash) and relies on identity.ts writing NO
    WalletChange for the ignored late event (asserted by indexer/test/review.test.ts "REGCB": changes == [ZERO]).
    Given those rows, the export and replay_identity_events on the raw logs give the same identity."""
    unset = {"ev": "MetadataSet", "agent": 7, "key": "agentWallet", "val": ZERO}
    raw = _reg(7, "0x01", [unset])
    rows = {"OwnerChange": [{"agent_id": "7", "from": ZERO, "to": C, "blockNumber": "10", "logIndex": 0}],
            "WalletChange": [{"agent_id": "7", "wallet": ZERO, "blockNumber": "10", "logIndex": 1}]}

    class Src:
        def rows(self, entity, block=None, where=None):
            return rows.get(entity, [])
    exp, rep = identity_file(Src(), 10), _replay(raw)
    assert (exp["wallet"], exp["owner"]) == ({"7": rep.wallet[7]}, {"7": rep.owner[7]}) == ({"7": ZERO}, {"7": C})


def test_regcb_mixed_tx_keys_refused():
    """Events with and without transactionHash in one list: the keys never match, REGCB would be silently off."""
    evs = _reg(7, "0x01", [{"ev": "MetadataSet", "agent": 7, "key": "agentWallet", "val": ZERO}])
    evs[0] = {k: v for k, v in evs[0].items() if k != "tx"}
    with pytest.raises(ValueError, match="mix"):
        _replay(evs)


# ----------------------------------------------------------------------------- NUL / tag1Exact

class _Src:
    def __init__(self, feedback_rows):
        self.fr = feedback_rows

    def rows(self, entity, block=None, where=None):
        return self.fr if entity == "Feedback" else []


def _row(tag1, *, tag_hash_=None, exact=None, value=100, idx=1, client=C):
    r = {"id": f"1-{client}-{idx}", "agent_id": "1", "client": client, "feedbackIndex": str(idx), "value": str(value),
         "valueDecimals": 0, "tag1": tag1, "tag2": "", "blockNumber": "5", "logIndex": idx, "revokedAtBlock": None}
    if tag_hash_ is not None:
        r["tagHash"] = tag_hash_
    if exact is not None:
        r["tag1Exact"] = exact
    return r


def _graph(rows, tmp_path, sch=None, filt=FILT):
    p = tmp_path / "fb.json"
    p.write_text(json.dumps(feedbacks_file(_Src(rows), 10)))
    fbs = load_feedbacks_onchain(p)
    return build_graph(fbs, ident(owner={1: D}, wallet={1: ZERO}), sch or schema(), filt, [H1])


@pytest.mark.parametrize("display", ["vouch", "vouch\\u0000"])
def test_nul_tag_is_not_matched_by_its_text(display, tmp_path):
    """A 'vouch\\0' feedback (stored 'vouch' by Envio's NUL retry before the fix, escaped since): the contract hashes
    the bytes, keccak('vouch\\0') != keccak('vouch'), so it is NOT a vouch. The old export made a phantom edge
    (EdgeMismatch on every Registry-verified submission)."""
    g = _graph([_row(display, tag_hash_=tag_hash("vouch\0"), exact=False)], tmp_path)
    assert (C, 1) not in g.pairs


def test_nul_long_tag_matched_by_hash(tmp_path):
    """Exclusion would be WRONG: a schema tag longer than the indexer's 1 KiB display limit has tag1Exact = false on
    every feedback, yet the contract matches it by hash. The edge exists, decidingTag = the schema text."""
    long_tag = "L" * 1100
    sch = {long_tag: TagSpec(0, 0, dec_to_wad(100), "endorsement")}
    row = _row("L" * 1021 + "...", tag_hash_=tag_hash(long_tag), exact=False)
    g = _graph([row], tmp_path, sch, [long_tag])
    pe = g.pairs[(C, 1)]
    assert (pe.q, pe.tag1, pe.feedback_index) == (GRID, long_tag, 1)
    # parity with the indexer, whose SetEdge.decidingTag is the schema text (rules.ts REF_BY_HASH)
    se = [{"client": C, "agentId": 1, "w": GRID, "decidingTag": long_tag, "feedbackIndex": 1, "rejected": None}]
    assert parity(se, g.pairs) == []


def test_nul_tag_in_schema_matched_by_hash(tmp_path):
    """A schema may name a tag containing U+0000: its feedbacks are tag1Exact = false and still make edges."""
    sch = {"vouch\0": TagSpec(0, 0, dec_to_wad(100), "endorsement")}
    g = _graph([_row("vouch\\u0000", tag_hash_=tag_hash("vouch\0"), exact=False)], tmp_path, sch, ["vouch\0"])
    assert g.pairs[(C, 1)].tag1 == "vouch\0"


def test_exact_rows_with_hash_unchanged(tmp_path):
    """tag1Exact = true rows (all of the real data): same edges as without the hash."""
    rows = [_row("vouch", tag_hash_=tag_hash("vouch"), exact=True),
            _row("slash", tag_hash_=tag_hash("slash"), exact=True, value=-100, idx=2)]
    old = [{k: v for k, v in r.items() if k not in ("tagHash", "tag1Exact")} for r in rows]
    assert _graph(rows, tmp_path).pairs == _graph(old, tmp_path).pairs
    assert _graph(rows, tmp_path).pairs[(C, 1)].tag1 == "slash"


def test_inconsistent_rows_refused(tmp_path):
    with pytest.raises(ValueError, match="tagHash"):
        _graph([_row("vouch", exact=False)], tmp_path)                                  # no identity at all
    with pytest.raises(ValueError, match="tagHash"):
        _graph([_row("vouch", tag_hash_=tag_hash("vouch\0"), exact=True)], tmp_path)    # exact text, other hash


def test_nul_refresh_decode_keeps_the_topic_hash():
    """refresh.py: a NewFeedback log carries its tag identity in the indexedTag1 topic; decode keeps it as tagHash
    (the text is decoded with errors='replace', lossy on invalid UTF-8)."""
    word = lambda n: n.to_bytes(32, "big").hex()
    raw = b"vouch\xff"                                    # invalid UTF-8: the text decodes to 'vouch�'
    th = "0x" + keccak(raw).hex()
    dyn = lambda b: word(len(b)) + b.ljust(32, b"\0").hex() if b else word(0)
    heads = [word(1), word(100), word(0)]
    tails = [dyn(raw), dyn(b""), dyn(b""), dyn(b"")]
    offs, o = [], 32 * (len(heads) + 4 + 1)
    for t in tails:
        offs.append(word(o))
        o += len(t) // 2
    data = "0x" + "".join(heads + offs + [word(0)] + tails)
    lg = {"topics": [RF.T["NewFeedback"], "0x" + word(1), "0x" + "00" * 12 + C[2:], th], "data": data,
          "blockNumber": "0x1", "logIndex": "0x0", "transactionHash": "0xbb"}
    e = RF.decode(lg)
    assert (e["tag1"], e["tagHash"], e["idx"], e["value"]) == ("vouch�", th, 1, 100)
    assert tag_hash(e["tag1"]) != th                      # the text is not the tag: only the hash identifies it


def test_nul_refresh_read_all_hashes_the_bytes(monkeypatch):
    """refresh.read_all reads the tags as bytes[]: every row carries h = keccak(tag1 bytes); main() checks it against
    the NewFeedback topic instead of comparing two lossy texts."""
    out = json.dumps([[C], [1], ["100"], [0], ["0x" + b"vouch\xff".hex()], ["0x"], [False]])

    class P:
        stdout = out
    monkeypatch.setattr(RF.subprocess, "run", lambda *a, **k: P)
    (row,) = RF.read_all(1, 10, "http://x")
    assert (row["t1"], row["t2"], row["h"]) == ("vouch\ufffd", "", "0x" + keccak(b"vouch\xff").hex())
    assert "bytes[],bytes[]" in RF.READ_ALL

"""D48 (tour 7, chantier 04-bis): rule B (R6 on the combined sign), rule A (an anchor never emits through an agent),
AM-9.3 diagnostic (past controller, shown, no effect), and the A -> B -> A past-owner replay (review 05/10)."""
from fractions import Fraction

import pytest

from graph import (AGENT, ANCHOR, GRID, WAD, ZERO, Feedback, Identity, build_graph, identity_to_json,
                   load_identity_json, replay_identity_events)
from ppr import certify, contributions, trust_robust
from test_solver import fb, ident, schema

H1, H2, X, S, F, O, OP, AP, CR = ("0x" + c * 40 for c in "123456789")
FILT = ["vouch", "review", "slash"]


def node_values(g, cert, agent):
    inv = {gi: ci for ci, gi in enumerate(cert.node_map)}
    ci = inv.get(g.index.get((AGENT, agent)))
    if ci is None:
        return [0] * cert.k, 0, 0
    c = contributions(cert, ci)
    return [cert.t[a][ci] for a in range(cert.k)], trust_robust(c, 2), cert.d[ci]


# ----------------------------------------------------------------------------- rule B (AM-08.B)

@pytest.mark.parametrize("ctl", ["owner", "operator", "approved", "agentWallet"])
def test_rule_b_controller_negative_kept_positive_rejected(ctl):
    W = "0x" + "ab" * 20
    idn = ident(owner={1: O}, wallet={1: W}, operators={O: {OP}}, approved={1: AP})
    c = {"owner": O, "operator": OP, "approved": AP, "agentWallet": W}[ctl]
    neg = build_graph([fb(1, c, 1, -100, "slash")], idn, schema(), FILT, [H1])
    pos = build_graph([fb(1, c, 1, 100, "vouch")], idn, schema(), FILT, [H1])
    assert neg.pairs[(c, 1)].q == -GRID and neg.log[f"negatif_controleur_garde_{ctl}"] == 1
    assert (c, 1) not in neg.r6_pairs
    assert (c, 1) not in pos.pairs and (c, 1) in pos.r6_pairs and pos.log[f"rejet_controleur_{ctl}"] == 1
    # the pre-D48 rule ("any") rejected both: this is the censorship by setApprovalForAll of AM-08.B
    old = build_graph([fb(1, c, 1, -100, "slash")], idn, schema(), FILT, [H1], reject_controllers="any")
    assert (c, 1) not in old.pairs


def test_rule_b_uses_the_combined_sign():
    """A controller's vouch +1 and slash -1 on the same agent: D14 makes the pair negative, so it is KEPT; a vouch
    alone (positive) is rejected. The sign test is on the R5 combination, as in the contract."""
    idn = ident(owner={1: O}, wallet={1: ZERO}, operators={O: {OP}})
    g = build_graph([fb(1, OP, 1, 100, "vouch"), fb(1, OP, 2, -100, "slash")], idn, schema(), FILT, [H1])
    assert g.pairs[(OP, 1)].q == -GRID and g.pairs[(OP, 1)].tag1 == "slash"


def test_rule_b_anchor_made_operator_keeps_its_slash_and_distrust():
    """AM-08.B attack: the owner of #1 approves the anchor H1 as operator; H1's slash must still count (distrust of #1,
    certified veto bit of the anchor row)."""
    idn = ident(owner={1: O, 2: "0x" + "aa" * 20}, wallet={1: ZERO, 2: ZERO}, operators={O: {H1}})
    fbs = [fb(1, H1, 1, -100, "slash"), fb(1, H2, 1, 100, "vouch"), fb(2, H1, 1, 100, "vouch")]
    g = build_graph(fbs, idn, schema(), FILT, [H1, H2])
    assert g.pairs[(H1, 1)].q == -GRID
    a_h1 = g.index[(ANCHOR, H1)]
    assert [(g.nodes[e.dst], e.q) for e in g.rows[a_h1]] == [((AGENT, 1), -GRID), ((AGENT, 2), GRID)]
    cert = certify(g, Fraction(1, 3))
    _, _, d1 = node_values(g, cert, 1)
    assert d1 > 0
    gold = build_graph(fbs, idn, schema(), FILT, [H1, H2], reject_controllers="any")
    assert node_values(gold, certify(gold, Fraction(1, 3)), 1)[2] == 0     # the old rule silenced it


# ----------------------------------------------------------------------------- rule A (AM-08.A)

def test_rule_a_anchor_wallet_of_an_agent_does_not_defeat_leave_one_out():
    """AM-08.A, minimal: anchors {H1, X}; X (stolen key) is the agentWallet of S; H1 rates S (S gets mass in the H1
    column); X vouches for the farm agent F. Before D48-A, S carried X's row with its H1-column mass, so F had mass in
    TWO columns and passed m = 2. After: F only has mass in X's own column -> trustRobust(F) = 0."""
    idn = ident(owner={10: S, 20: "0x" + "ff" * 20}, wallet={10: X, 20: "0x" + "ff" * 20})
    fbs = [fb(10, H1, 1, 100, "vouch"), fb(20, X, 1, 100, "vouch")]
    g = build_graph(fbs, idn, schema(), FILT, [H1, X])
    u_s = g.index[(AGENT, 10)]
    assert g.anchor_sourced == {u_s} and u_s not in g.rows
    cert = certify(g, Fraction(1, 3))
    t_f, robust_f, _ = node_values(g, cert, 20)
    k_h1, k_x = g.index[(ANCHOR, H1)], g.index[(ANCHOR, X)]
    assert t_f[k_h1] == 0 and t_f[k_x] > 0 and robust_f == 0
    # what the contract would have accepted before the correction: a copy of X's row on S
    from graph import Edge
    g.rows[u_s] = [Edge(g.index[(AGENT, 20)], GRID, X, 20, "vouch", 1)]
    g.anchor_sourced = set()
    g.row_src[u_s] = (X, "wallet")
    t_old, robust_old, _ = node_values(g, certify(g, Fraction(1, 3)), 20)
    assert t_old[k_h1] > 0 and robust_old > 0                          # the attack worked


def test_rule_a_through_the_owner_fallback():
    """With D44 on, an agent whose wallet is 0 and whose OWNER is an anchor is sourced by the anchor: no row either."""
    idn = ident(owner={10: X, 20: "0x" + "ff" * 20}, wallet={10: ZERO, 20: "0x" + "ff" * 20})
    fbs = [fb(10, H1, 1, 100, "vouch"), fb(20, X, 1, 100, "vouch")]
    g = build_graph(fbs, idn, schema(), FILT, [H1, X], owner_fallback=True)
    assert g.anchor_sourced == {g.index[(AGENT, 10)]}
    g0 = build_graph(fbs, idn, schema(), FILT, [H1, X])                   # fallback off: no source at all
    assert not g0.anchor_sourced and g0.row_src[g0.index[(AGENT, 10)]] == (None, "none")


def test_rule_a_massive_agent_pays_only_the_truncation_margin():
    idn = ident(owner={10: S}, wallet={10: X})
    g = build_graph([fb(10, H1, 1, 100, "vouch")], idn, schema(), FILT, [H1, X])
    cert = certify(g, Fraction(1, 3))
    assert cert.truncated == {cert.node_map.index(g.index[(AGENT, 10)])}


# ----------------------------------------------------------------------------- AM-9.3 diagnostic

def test_am93_past_controller_reported_not_rejected():
    """#10255 pattern (veille 05/10): the minter transfers the agent, then rates it 100 a few blocks later. The edge is
    kept (D20), the diagnostic says 'past owner, N blocks after the transfer'."""
    P, NEW = "0x" + "49" * 20, "0x" + "50" * 20
    idn = Identity(block=0, owner={}, wallet={})
    replay_identity_events(idn, [
        {"ev": "Registered", "block": 100, "li": 0, "agent": 1, "owner": P},
        {"ev": "Transfer", "block": 100, "li": 1, "agent": 1, "frm": ZERO, "to": P},
        {"ev": "Transfer", "block": 1000, "li": 0, "agent": 1, "frm": P, "to": NEW},
    ], 0, 2000)
    mk = lambda i, b: Feedback(agent_id=1, client=P, index=i, value=100, decimals=0, tag1="vouch", tag2="",
                               revoked=False, block=b)
    g = build_graph([mk(1, 1917), mk(2, 5000)], idn, schema(), FILT, [H1])
    assert g.pairs[(P, 1)].q == GRID                                    # no effect on the edge
    assert g.diagnostics == [{"kind": "pastOwner", "client": P, "agentId": 1, "w": GRID, "tag1": "vouch",
                              "feedbackIndex": 2, "feedbackBlock": 5000, "transferBlock": 1000,
                              "firstFeedbackAfterTransfer": 1917, "blocksAfterTransfer": 917}]
    # the block of the transfer survives the identity.json round trip
    assert load_identity_json(identity_to_json(idn)).past_owner_until == {1: {P: 1000}}


# ----------------------------------------------------------------------------- A -> B -> A (review 05/10)

def test_replay_a_b_a_past_owners_excludes_current_owner():
    A, B = "0x" + "aa" * 20, "0x" + "bb" * 20
    idn = Identity(block=0, owner={}, wallet={})
    replay_identity_events(idn, [
        {"ev": "Transfer", "block": 1, "li": 0, "agent": 7, "frm": ZERO, "to": A},
        {"ev": "Transfer", "block": 2, "li": 0, "agent": 7, "frm": A, "to": B},
        {"ev": "Transfer", "block": 3, "li": 0, "agent": 7, "frm": B, "to": A},
    ], 0, 10)
    assert idn.owner[7] == A and idn.past_owners[7] == {B}
    assert idn.past_owner_until[7] == {B: 3}
    # same answer as the indexer export (from_indexer.identity_file) on the same history
    from from_indexer import identity_file

    class Src:
        def rows(self, entity, block=None, where=None):
            if entity != "OwnerChange":
                return []
            return [{"agent_id": "7", "from": ZERO, "to": A, "blockNumber": "1", "logIndex": 0},
                    {"agent_id": "7", "from": A, "to": B, "blockNumber": "2", "logIndex": 0},
                    {"agent_id": "7", "from": B, "to": A, "blockNumber": "3", "logIndex": 0}]
    js = identity_file(Src(), 10)
    assert js["pastOwners"] == {"7": [B]} and js["pastOwnerUntil"] == {"7": {B: 3}}

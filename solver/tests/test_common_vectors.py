"""Common vectors 02-bis / 04-bis (vectors/common/): up to date, valid, and saying what D48 / D50 require."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import common_vectors as CV
from export import check_file_obj, decode_rows, load_certificate
from ppr import contributions, trust_robust

DIR = Path(__file__).resolve().parents[1] / "vectors" / "common"
FILES = {p.stem: json.loads(p.read_text()) for p in sorted(DIR.glob("*.json"))}


def test_files_are_up_to_date():
    fresh = CV.cases()
    fresh["common_A_mainnet_old_slash_anchor"] = CV.mainnet_old_slash_anchor()
    assert set(fresh) == set(FILES)
    for k, obj in fresh.items():
        assert json.loads(json.dumps(obj)) == FILES[k], k


@pytest.mark.parametrize("name", sorted(FILES))
def test_every_certificate_is_arithmetically_valid(name):
    check_file_obj(FILES[name], name)              # t <= y, roots, setId: a refusal can only come from D48 / R1


def r(name, j):
    return FILES[name]["expect"]["read"][str(j)]


def test_second_hop_passes_only_with_two_anchors():
    assert r("common_2hop", 51)["passesAnchorPolicy"] and int(r("common_2hop", 51)["trustRobust"]) == 2 * 10**18 // 27
    assert FILES["common_2hop"]["expect"]["oneHopList"]["51"].startswith("unknown")
    assert not r("common_2hop_one_anchor", 51)["passesAnchorPolicy"]
    assert r("common_2hop_one_anchor", 51)["trustRobust"] == "0"


def test_controller_negative_kept_and_vetoes():
    b = r("common_B_controller_negative", 30)
    assert int(b["distrust"]) > 0 and b["vetoByApproval"] == [CV.A2] and any(b["vetoBits"])
    assert not b["passesAnchorPolicy"] and r("common_B_controller_negative", 31)["passesAnchorPolicy"]


def test_anchor_copy_attack_would_pass_without_the_check():
    """AM-INT.2: the refused vector is a REAL attack (F gets a robust trust), the accepted one is not."""
    assert r("common_A_anchor_not_source", 20)["trustRobust"] == "0"
    att = FILES["common_A_attack_anchor_copy"]
    cert = load_certificate(att)
    f = next(n["i"] for n in att["nodes"] if n.get("agentId") == 20)
    assert trust_robust(contributions(cert, f), 2) > 0
    assert att["expect"]["submission"].startswith("AnchorAsSource(")


def test_resubmission_keeps_the_false_row_and_changes_other_bytes():
    c = FILES["common_C_proven_row_resubmitted"]
    ua = c["expect"]["then"]["proveEdge"]["row"]
    r1, _, _, _ = decode_rows(c["calldata"]["rows"])
    r2, _, _, _ = decode_rows(c["resubmission"]["calldata"]["rows"])
    assert c["resubmission"]["calldata"]["rows"] != c["calldata"]["rows"] and r1 != r2
    assert r1[ua] == r2[ua] and any(w > 0 for _, w, _ in r1[ua])          # the same false anchor row


def test_zero_address_node_is_in_the_node_table():
    z = FILES["common_R1_address_zero_node"]
    assert z["expect"]["submission"] == "BadNodes()" and "02" + "00" * 20 in z["calldata"]["newNodes"]

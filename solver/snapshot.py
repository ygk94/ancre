"""Build the versioned mainnet snapshot solver/data/mainnet-<block>.{feedbacks,identity}.json.gz.

Provenance (all on-chain, never 8004scan, AM-R4.2):
  - 9 188 feedbacks re-read by readAllFeedback at block 108 434 518 (R4, scratchpad onchain_feedbacks_r4.json);
  - 95 NewFeedback logs from block 108 483 651 to 108 552 157 (eth_getLogs on rpc1.monad.xyz, 27/09, nv/dec.json);
  - identity at block 108 434 518 (agents_state.json, logs.json, approved_r4.json), rolled forward with the decoded
    IdentityRegistry logs of (108 434 518, 108 576 697] (nv/dec.json) ;
  - getApproved of the 6 agents first rated after 108 434 518, read at block 108 835 675 (approved_head.json);
  - no ReputationRegistry nor IdentityRegistry log between 108 576 698 and 108 835 675 (eth_getLogs, 28/09),
    so the state is valid at 108 835 675.
Usage: .venv/bin/python snapshot.py   (needs the scratchpads; the output is committed)
Superseded as the CURRENT snapshot on 06/10 by refresh.py (AM-9.2), which rolls this one forward from the chain:
data/mainnet-110994810.* (9 291 feedbacks). This file stays the provenance of the 108 835 675 base.
"""
import gzip
import json
import os
from pathlib import Path

from graph import ZERO, identity_to_json, load_identity, replay_identity_events

HERE = Path(__file__).parent
SCR = Path(os.environ.get("ANCRE_SCRATCH", "/private/tmp/claude-501/-Users-hugo-Projet-ancre/"
                                         "d7aaa033-3225-48a1-9564-a90ffb1f1a63/scratchpad"))
SCR04 = Path(os.environ.get("ANCRE_SCRATCH04", "/private/tmp/claude-501/-Users-hugo-Projet-ancre/"
                                               "50c47a4e-27e7-44f5-a31a-478b2353f69b/scratchpad"))
BLOCK_R4, BLOCK_LOGS, BLOCK = 108_434_518, 108_576_697, 108_835_675


def main():
    old = json.load(open(SCR / "onchain_feedbacks_r4.json"))
    dec = json.load(open(SCR / "nv/dec.json"))
    new = [{"a": x["agent"], "c": x["client"].lower(), "i": x["idx"], "v": str(x["value"]), "d": x["dec"],
            "t1": x["tag1"], "t2": x["tag2"], "r": False, "b": x["block"]}
           for x in dec["rep"] if x["block"] > BLOCK_R4]
    fbs = [{**f, "v": str(f["v"])} for f in old["feedbacks"]] + new
    keys = {(f["a"], f["c"], f["i"]) for f in fbs}
    assert len(keys) == len(fbs) == 9283, len(fbs)
    idn = load_identity(SCR / "agents_state.json", SCR / "logs.json", SCR / "approved_r4.json")
    replay_identity_events(idn, dec["id"], BLOCK_R4, BLOCK_LOGS)
    ap = json.load(open(SCR04 / "approved_head.json"))["approved"]
    for k, v in ap.items():
        v = v.lower()
        assert v.startswith("0x") and len(v) == 42, (k, v)
        if v == ZERO:
            idn.approved.pop(int(k), None)
        else:
            idn.approved[int(k)] = v
    idn.block = BLOCK
    (HERE / "data").mkdir(exist_ok=True)
    fo = {"block": BLOCK, "source": "readAllFeedback@108434518 + NewFeedback logs to 108576697; no log to 108835675",
          "feedbacks": sorted(fbs, key=lambda f: (f["a"], f["c"], f["i"]))}
    with gzip.open(HERE / "data" / f"mainnet-{BLOCK}.feedbacks.json.gz", "wt") as fh:
        json.dump(fo, fh, separators=(",", ":"))
    with gzip.open(HERE / "data" / f"mainnet-{BLOCK}.identity.json.gz", "wt") as fh:
        json.dump(identity_to_json(idn), fh, separators=(",", ":"))
    print(len(fbs), "feedbacks,", len(idn.owner), "agents")


if __name__ == "__main__":
    main()

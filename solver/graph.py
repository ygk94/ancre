"""ANCRE — signed trust graph built from ERC-8004 feedback. NORMATIVE REFERENCE for the edge rules.

This module is the reference implementation of the edge rules (chantier 04). The indexer (chantier 03)
ports them to TypeScript; `tests/test_indexer_parity.py` is the judge. Decisions cited by number (CR du conseil).

  R1 (D12)  Tag schema per anchor set: tag -> (min, neutral, max, kind), bounds in WAD. Filter <= TAGS_MAX = 16 (D24).
  R2 (D15)  Only tags of kind `endorsement` create edges. `measurement` tags never propagate.
  R3 (D14)  Per (client, agent, tag1): the non-revoked feedback with the highest feedbackIndex.
            If that feedback is out of bounds, this tag yields nothing (no fallback to an older feedback).
  R4 (D18)  Weight q = quantize(value, decimals, spec): int16 on the 1e-4 grid, truncated toward zero.
            Out of bounds => rejected, never clamped.
  R5 (D14)  Per (client, agent): combine the tags of the filter by negative dominance:
            q = min over tags if some q < 0, else max. q == 0 => no edge. Ties between tags of equal weight:
            the feedback with the HIGHEST feedbackIndex decides (feedbackIndex, decidingTag). Unified v1 (01/10).
  R6 (D20, D48-B)  If the client is a CURRENT controller of the target agent (owner, agentWallet, getApproved, or an
            approved-for-all operator of the owner), the pair is rejected ONLY IF its combined weight is POSITIVE
            (self-endorsement). A NEGATIVE combined weight of a controller is KEPT (AM-08.B: otherwise an owner
            silences a critic or an anchor with setApprovalForAll). The sign is the one of the R5 combination.
            (The "past owner" rule of D16 is REMOVED: unverifiable on-chain, false for platforms, AM-4.2. A past
            controller who rates right after the transfer is only REPORTED, never rejected: AM-9.3, D48.)
  R7 (D20, D44)  Emitter resolution. For an agent j:
                src(j) = agentWallet(j)            if agentWallet(j) != 0
                       = ownerOf(j)                if agentWallet(j) == 0 and OWNER FALLBACK is on (D44)
                       = none                      otherwise
            The wallet always wins: an agent with a wallet never emits its owner's row (D44).
            A(c) = {j : src(j) = c}. ROW COPY (D20): every agent j of A(c) that is a node of the graph carries
            the row of c (the combined edges of client c), each with its own mass. No mass is created (D34).
            A client with A(c) empty is an ADDRESS node (never rated, hence never massive unless an anchor).
  R8 (D9, D48-A)  Anchor nodes are distinct from agent nodes: the anchor row is the row of the anchor address,
            carried by the anchor node ONLY. An agent whose source src(j) is an anchor of the set NEVER carries a
            row (no copy of the anchor row, AM-08.A: the copy would import the mass of the OTHER columns into a row
            the anchor controls, and defeat the leave-one-out). Such an agent is listed without a row (absorbing;
            the contract refuses its row, AnchorAsSource).

OWNER FALLBACK (D44) is behind the `owner_fallback` flag, default OFF until Hugo confirms (tour 6, conf. 0,65).

All normative arithmetic is integer (WAD = 1e18), exactly as the contract does it.
"""
from __future__ import annotations

import gzip
import json
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

WAD = 10**18
GRID = 10**4                 # 1 unité de poids = 1e-4 ; poids WAD = q * 1e14
GRID_WAD = WAD // GRID       # 1e14
Q_MAX = GRID                 # |q| <= 10000 tient dans un int16
ZERO = "0x" + "0" * 40
VALUE_ABS_MAX = 10**38       # borne du registre v2.0.0 (incluse)
TAGS_MAX = 16                # D24: max tags in the filter of a set
ROW_MAX = 256                # spec Q1 tour 2 : longueur max d'une ligne (choix)

# ----------------------------------------------------------------------------- données


@dataclass(frozen=True)
class Feedback:
    agent_id: int
    client: str           # adresse en minuscules
    index: int            # feedbackIndex, 1-indexé, ordonné par couple (client, agent) tous tags confondus
    value: int            # int128
    decimals: int         # 0..18
    tag1: str             # "" si absent
    tag2: str
    revoked: bool
    block: int = 0


def _parse_value(s) -> int:
    """8004scan renvoie `value` brut (int128) en chaîne, parfois en notation scientifique ('1.00E+38').
    ATTENTION : cette notation arrondit ; un indexeur maison (R7) doit lire l'int128 de l'event."""
    d = Decimal(str(s))
    if d != d.to_integral_value():
        raise ValueError(f"value non entière : {s}")
    return int(d)


def load_feedbacks(path: str | Path) -> list[Feedback]:
    """Charge un snapshot 8004scan (liste JSON) en Feedback."""
    raw = json.load(open(path))
    out = []
    for f in raw:
        out.append(Feedback(
            agent_id=int(f["agent"]["token_id"]),
            client=f["user_address"].lower(),
            index=int(f["feedback_index"]),
            value=_parse_value(f["value"]),
            decimals=int(f["value_decimals"]),
            tag1=f["tag1"] or "",
            tag2=f["tag2"] or "",
            revoked=bool(f["is_revoked"]),
            block=int(f.get("block_number") or 0),
        ))
    return out


def load_feedbacks_onchain(path: str | Path) -> list[Feedback]:
    """Relecture on-chain (readAllFeedback, includeRevoked = true) : {"block", "feedbacks": [{a, c, i, v, d, t1, t2, r[, b]}]}
    (b = bloc du log NewFeedback, quand il est connu ; il ne sert qu'au diagnostic AM-9.3).
    Source à préférer : 8004scan écrit valueDecimals = 0 pour 24 avis qui ont 2 décimales on-chain (AM-R4.2)."""
    p = Path(path)
    with (gzip.open if p.suffix == ".gz" else open)(p, "rt") as fh:
        raw = json.load(fh)
    return [Feedback(agent_id=int(x["a"]), client=x["c"].lower(), index=int(x["i"]), value=int(x["v"]),
                     decimals=int(x["d"]), tag1=x["t1"], tag2=x["t2"], revoked=bool(x["r"]), block=int(x.get("b") or 0))
            for x in raw["feedbacks"]]


@dataclass
class Identity:
    """État de l'IdentityRegistry au bloc du certificat."""
    block: int
    owner: dict[int, str]
    wallet: dict[int, str]
    approved: dict[int, str] = field(default_factory=dict)
    operators: dict[str, set[str]] = field(default_factory=dict)     # owner -> opérateurs actifs
    past_owners: dict[int, set[str]] = field(default_factory=dict)   # agentId -> past holders (reports only, not a rule)
    past_owner_until: dict[int, dict[str, int]] = field(default_factory=dict)  # agentId -> {past holder: block of
    #                                                  its LAST transfer out} (AM-9.3 diagnostic only; may be missing)
    past_wallets: dict[int, set[str]] = field(default_factory=dict)  # agentId -> wallets déclarés un jour
    _w2a: dict[str, list[int]] | None = None

    def wallet_to_agents(self) -> dict[str, list[int]]:
        if self._w2a is None:
            m: dict[str, list[int]] = defaultdict(list)
            for a, w in self.wallet.items():
                if w and w != ZERO:
                    m[w].append(a)
            self._w2a = {k: sorted(v) for k, v in m.items()}
        return self._w2a

    # --- state transitions (R6/R7 inputs), shared by every replayer (snapshot, indexer export) ---------------
    def apply_transfer(self, agent_id: int, frm: str, to: str, block: int | None = None) -> None:
        """Transfer: the previous holder becomes a past owner, the new holder is never one (A -> B -> A leaves {B},
        as load_identity does). `block` dates the transfer out, for the AM-9.3 diagnostic."""
        frm, to = frm.lower(), to.lower()
        if frm != ZERO:
            self.past_owners.setdefault(agent_id, set()).add(frm)
            if block is not None:
                self.past_owner_until.setdefault(agent_id, {})[frm] = block
        if agent_id in self.past_owners:
            self.past_owners[agent_id].discard(to)
            self.past_owner_until.get(agent_id, {}).pop(to, None)
        self.owner[agent_id] = to
        self.approved.pop(agent_id, None)               # ERC-721: a transfer clears getApproved
        self._w2a = None

    def apply_wallet(self, agent_id: int, wallet: str | None) -> None:
        w = (wallet or ZERO).lower()
        w = w if len(w) == 42 else ZERO                 # empty metadata value = cleared
        self.wallet[agent_id] = w
        if w != ZERO:
            self.past_wallets.setdefault(agent_id, set()).add(w)
        self._w2a = None

    def apply_approval(self, agent_id: int, approved: str | None) -> None:
        ap = (approved or ZERO).lower()
        if ap == ZERO:
            self.approved.pop(agent_id, None)
        else:
            self.approved[agent_id] = ap

    def apply_operator(self, owner: str, operator: str, on: bool) -> None:
        ops = self.operators.setdefault(owner.lower(), set())
        (ops.add if on else ops.discard)(operator.lower())

    def source_of(self, agent_id: int, owner_fallback: bool = False) -> tuple[str | None, str]:
        """R7: (src(j), "wallet" | "owner" | ""). The wallet always wins over the owner (D44)."""
        w = self.wallet.get(agent_id, ZERO) or ZERO
        if w != ZERO:
            return w, "wallet"
        if owner_fallback:
            o = self.owner.get(agent_id)
            if o and o != ZERO:
                return o, "owner"
        return None, ""

    def controllers(self, agent_id: int) -> dict[str, str]:
        """R6: {address: reason} of the CURRENT controllers of the agent at the certificate block (D20)."""
        c: dict[str, str] = {}
        o = self.owner.get(agent_id)
        if o:
            c[o] = "owner"
            for op in self.operators.get(o, ()):
                c.setdefault(op, "operator")
        w = self.wallet.get(agent_id)
        if w and w != ZERO:
            c.setdefault(w, "agentWallet")
        ap = self.approved.get(agent_id)
        if ap and ap != ZERO:
            c.setdefault(ap, "approved")
        return c


def _topic_addr(t: str) -> str:
    return "0x" + t[-40:].lower()


def load_identity(state_path, logs_path=None, approved_path=None) -> Identity:
    """agents_state.json (owner, wallet par agent), logs.json (Transfer, ApprovalForAll, MetadataSet),
    approved_r4.json (getApproved) — tous au bloc 108 434 518."""
    st = json.load(open(state_path))
    owner = {int(r["id"]): r["owner"].lower() for r in st["rows"]}
    wallet = {int(r["id"]): (r["wallet"] or ZERO).lower() for r in st["rows"]}
    idn = Identity(block=int(st["block"]), owner=owner, wallet=wallet)
    if approved_path:
        ap = json.load(open(approved_path))["approved"]
        idn.approved = {int(k): v.lower() for k, v in ap.items() if not v.startswith("ERR")}
    if logs_path:
        lg = json.load(open(logs_path))
        key = lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16))
        past: dict[int, set[str]] = defaultdict(set)
        until: dict[int, dict[str, int]] = defaultdict(dict)
        for l in sorted(lg.get("tr", []), key=key):
            frm, to, tid = _topic_addr(l["topics"][1]), _topic_addr(l["topics"][2]), int(l["topics"][3], 16)
            for a in (frm, to):
                if a != ZERO:
                    past[tid].add(a)
            if frm != ZERO:
                until[tid][frm] = key(l)[0]
        # past_owners = détenteurs passés, hors owner courant (qui est déjà un contrôleur)
        idn.past_owners = {t: {a for a in s if a != owner.get(t)} for t, s in past.items()}
        idn.past_owner_until = {t: {a: b for a, b in d.items() if a != owner.get(t)} for t, d in until.items()}
        ops: dict[tuple[str, str], bool] = {}
        for l in sorted(lg.get("ap", []), key=key):
            ops[(_topic_addr(l["topics"][1]), _topic_addr(l["topics"][2]))] = int(l["data"], 16) != 0
        opm: dict[str, set[str]] = defaultdict(set)
        for (o, op), on in ops.items():
            if on:
                opm[o].add(op)
        idn.operators = dict(opm)
        pw: dict[int, set[str]] = defaultdict(set)
        for l in lg.get("ms", []):
            data = bytes.fromhex(l["data"][2:])
            # abi.encode(string key, bytes value) : offset clé, offset valeur
            ko, vo = int.from_bytes(data[0:32]), int.from_bytes(data[32:64])
            kl = int.from_bytes(data[ko:ko + 32])
            k = data[ko + 32:ko + 32 + kl].decode(errors="replace")
            if k != "agentWallet":
                continue
            vl = int.from_bytes(data[vo:vo + 32])
            v = data[vo + 32:vo + 32 + vl]
            if len(v) == 20:
                pw[int(l["topics"][1], 16)].add("0x" + v.hex())
        idn.past_wallets = dict(pw)
    return idn


TOPIC_APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
TOPIC_APPROVAL_FOR_ALL = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31"


def replay_identity_events(idn: Identity, events: list[dict], after_block: int, to_block: int) -> Identity:
    """Roll an Identity forward with decoded IdentityRegistry events (scratchpad nv/dec.json format:
    {ev, block, li, agent, frm/to | key/val | owner}). Applies Transfer (owner, approval reset, past holder)
    MetadataSet(agentWallet) (20 bytes or empty = cleared), Approval and ApprovalForAll (R6 inputs); an
    undecoded approval topic raises. URIUpdated / MetadataUpdate / other metadata keys do not change R6/R7.
    Events must cover (after_block, to_block] completely; the caller vouches for that."""
    for e in sorted(events, key=lambda e: (e["block"], e["li"])):
        if not after_block < e["block"] <= to_block:
            continue
        a = e.get("agent")
        if e["ev"] == "Transfer":
            idn.apply_transfer(a, e["frm"], e["to"], e["block"])
        elif e["ev"] == "MetadataSet" and e.get("key") == "agentWallet":
            idn.apply_wallet(a, e["val"])
        elif e["ev"] == "Approval":                       # approve(approved, tokenId)
            idn.apply_approval(a, e["approved"])
        elif e["ev"] == "ApprovalForAll":
            idn.apply_operator(e["owner"], e["operator"], e["approved_all"])
        elif e["ev"] in (TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL):
            raise ValueError(f"undecoded approval event at block {e['block']}: decode it before replaying (R6 input)")
        elif e["ev"] == "Registered":
            idn.owner.setdefault(a, e["owner"].lower())
            idn.wallet.setdefault(a, ZERO)
    idn.block = to_block
    return idn


def load_identity_json(path_or_obj) -> Identity:
    """identity.json of the indexer interface (design-indexeur-envio.md §7), also the format of the versioned
    snapshot solver/data/: {"block", "owner": {id: addr}, "wallet": {id: addr}, "approved": {id: addr},
    "operators": {owner: [op]}, "pastOwners": {id: [addr]}, "pastWallets": {id: [addr]},
    "pastOwnerUntil": {id: {addr: block}} (optional: block of the last transfer out, AM-9.3 diagnostic only)}."""
    if isinstance(path_or_obj, (str, Path)):
        p = Path(path_or_obj)
        op = gzip.open if p.suffix == ".gz" else open
        with op(p, "rt") as fh:
            obj = json.load(fh)
    else:
        obj = path_or_obj
    lo = lambda d: {int(k): v.lower() for k, v in d.items()}
    return Identity(block=int(obj["block"]), owner=lo(obj["owner"]), wallet=lo(obj["wallet"]),
                    approved={k: v for k, v in lo(obj.get("approved", {})).items() if v != ZERO},
                    operators={o.lower(): {x.lower() for x in ops} for o, ops in obj.get("operators", {}).items() if ops},
                    past_owners={int(k): {x.lower() for x in v} for k, v in obj.get("pastOwners", {}).items()},
                    past_owner_until={int(k): {x.lower(): int(b) for x, b in v.items()}
                                      for k, v in obj.get("pastOwnerUntil", {}).items()},
                    past_wallets={int(k): {x.lower() for x in v} for k, v in obj.get("pastWallets", {}).items()})


def identity_to_json(idn: Identity) -> dict:
    return {"block": idn.block,
            "owner": {str(k): v for k, v in sorted(idn.owner.items())},
            "wallet": {str(k): v for k, v in sorted(idn.wallet.items())},
            "approved": {str(k): v for k, v in sorted(idn.approved.items()) if v != ZERO},
            "operators": {o: sorted(s) for o, s in sorted(idn.operators.items()) if s},
            "pastOwners": {str(k): sorted(s) for k, s in sorted(idn.past_owners.items()) if s},
            "pastOwnerUntil": {str(k): dict(sorted(d.items())) for k, d in sorted(idn.past_owner_until.items()) if d},
            "pastWallets": {str(k): sorted(s) for k, s in sorted(idn.past_wallets.items()) if s}}


# ----------------------------------------------------------------------------- schéma


@dataclass(frozen=True)
class TagSpec:
    min_wad: int
    neutral_wad: int
    max_wad: int
    kind: str  # "endorsement" | "measurement"


def dec_to_wad(s) -> int:
    d = Decimal(str(s)) * WAD
    if d != d.to_integral_value():
        raise ValueError(f"borne non représentable en WAD : {s}")
    return int(d)


def load_schema(path_or_obj) -> dict[str, TagSpec]:
    obj = json.load(open(path_or_obj)) if isinstance(path_or_obj, (str, Path)) else path_or_obj
    out = {}
    for tag, s in obj["tags"].items():
        spec = TagSpec(dec_to_wad(s["min"]), dec_to_wad(s["neutral"]), dec_to_wad(s["max"]), s["kind"])
        if not (spec.min_wad <= spec.neutral_wad <= spec.max_wad):
            raise ValueError(f"{tag}: il faut min <= neutre <= max")
        if spec.kind not in ("endorsement", "measurement"):
            raise ValueError(f"{tag}: kind inconnu {spec.kind}")
        out[tag] = spec
    return out


def value_to_wad(value: int, decimals: int) -> int:
    """value / 10^dec en WAD, exact (dec <= 18 garanti par le registre)."""
    if not 0 <= decimals <= 18:
        raise ValueError("valueDecimals hors [0,18]")
    return value * 10 ** (18 - decimals)


def quantize(value: int, decimals: int, spec: TagSpec) -> int | None:
    """Poids normatif q ∈ [-10000, 10000] (int16, grille 1e-4), ou None si hors bornes.

    w = (v - neutre)/(max - neutre) si v >= neutre, sinon -(neutre - v)/(neutre - min) ;
    q = troncature vers zéro de w * 1e4. Comparaison aux bornes en valeur exacte avant arrondi.
    """
    if abs(value) > VALUE_ABS_MAX:
        return None
    v = value_to_wad(value, decimals)
    if v < spec.min_wad or v > spec.max_wad:
        return None
    if v >= spec.neutral_wad:
        den = spec.max_wad - spec.neutral_wad
        if den == 0:
            return 0
        return ((v - spec.neutral_wad) * GRID) // den          # >= 0 : floor == troncature
    den = spec.neutral_wad - spec.min_wad                        # > 0 puisque min <= v < neutre
    return -(((spec.neutral_wad - v) * GRID) // den)            # troncature vers zéro du négatif


# ----------------------------------------------------------------------------- graph

AGENT, ADDR, ANCHOR = "agent", "addr", "anchor"


@dataclass(frozen=True)
class Edge:
    dst: int            # destination node index (always an agent node)
    q: int              # int16 weight on the 1e-4 grid, != 0
    client: str
    agent_id: int
    tag1: str           # tag that decided q (negative dominance)
    feedback_index: int


@dataclass(frozen=True)
class PairEdge:
    """Combined edge of a (client, agent) pair after R2-R6, independent of emitter resolution.
    This is the unit compared with the indexer's `SetEdge` (parity test)."""
    client: str
    agent_id: int
    q: int
    tag1: str
    feedback_index: int


@dataclass
class Graph:
    nodes: list[tuple[str, object]]                 # (kind, agentId | address)
    index: dict[tuple[str, object], int]
    rows: dict[int, list[Edge]]                     # src node -> edges sorted by dst (the FULL row)
    anchors: list[int]                              # anchor node indices (one column each)
    log: dict[str, int]                             # filtering counters
    rejected: list[dict]                            # rejected feedback/pairs (reports)
    row_src: dict[int, tuple[str | None, str]] = field(default_factory=dict)  # u -> (client, anchor|address|wallet|owner|none)
    pairs: dict[tuple[str, int], PairEdge] = field(default_factory=dict)
    r6_pairs: set[tuple[str, int]] = field(default_factory=set)   # (client, agent) rejected by R6 (controllers, w > 0)
    anchor_sourced: set[int] = field(default_factory=set)         # agent nodes whose source is an anchor: no row (A)
    diagnostics: list[dict] = field(default_factory=list)         # AM-9.3 past controllers (shown, no effect)

    @property
    def n(self) -> int:
        return len(self.nodes)

    def splus(self, u: int) -> int:
        """True positive sum of the full row of u (the value declared as sPlus in a certificate, D32)."""
        return sum(e.q for e in self.rows.get(u, ()) if e.q > 0)

    def bplus(self, u: int) -> int:
        return max(GRID, self.splus(u))

    def bminus(self, u: int) -> int:
        return max(GRID, sum(-e.q for e in self.rows.get(u, ()) if e.q < 0))

    def edges(self):
        for u, row in self.rows.items():
            for e in row:
                yield u, e

    def n_edges(self) -> int:
        return sum(len(r) for r in self.rows.values())

    def node_of_agent(self, a: int) -> int | None:
        return self.index.get((AGENT, a))


def combine_pairs(feedbacks: list[Feedback], identity: Identity, schema: dict[str, TagSpec],
                  filter_tags: list[str] | None, *, selection: str = "latest_then_reject",
                  combine: str = "neg_dominance", reject_controllers: bool = True,
                  log: dict | None = None, rejected: list | None = None,
                  r6: set | None = None, diagnostics: list | None = None) -> dict[tuple[str, int], PairEdge]:
    """R1-R6: one combined edge per (client, agent). Normative defaults; the options exist only to measure
    the rules that were replaced (tour 2 `latest_pair`, `latest_valid` reading of proof (ii), and
    reject_controllers="any": the pre-D48 R6 that rejected a controller whatever the sign).
    `diagnostics` receives the AM-9.3 report: retained pairs whose client is a PAST owner or wallet of the target
    ("past controller, N blocks after the transfer"). It is shown, it changes no edge (D48)."""
    assert reject_controllers in (True, False, "any")
    if filter_tags is None:
        filter_tags = sorted(schema)
    if len(filter_tags) > TAGS_MAX:
        raise ValueError(f"filter of {len(filter_tags)} tags > TAGS_MAX={TAGS_MAX}")
    ftags = set(filter_tags)
    log = log if log is not None else defaultdict(int)
    rejected = rejected if rejected is not None else []

    if combine == "latest_pair":                     # tour-2 rule: last non-revoked feedback of the pair, any tag
        best: dict[tuple[str, int], Feedback] = {}
        for f in feedbacks:
            if not f.revoked:
                k = (f.client, f.agent_id)
                if k not in best or f.index > best[k].index:
                    best[k] = f
        cand = list(best.values())
    else:
        cand = feedbacks
    # R3: latest per (client, agent, tag1)
    per_triple: dict[tuple[str, int, str], Feedback] = {}
    for f in cand:
        log["avis_lus"] += 1
        if f.revoked:
            log["rejet_revoque"] += 1
            continue
        if f.tag1 not in ftags or f.tag1 not in schema:
            log["hors_filtre_ou_schema"] += 1
            continue
        if schema[f.tag1].kind != "endorsement":                           # R2
            log["rejet_measurement_D15"] += 1
            continue
        k = (f.client, f.agent_id, f.tag1)
        if selection == "latest_valid" and quantize(f.value, f.decimals, schema[f.tag1]) is None:
            log["rejet_hors_bornes"] += 1
            continue
        if k not in per_triple or f.index > per_triple[k].index:
            per_triple[k] = f
    by_pair: dict[tuple[str, int], list[tuple[int, Feedback]]] = defaultdict(list)
    for (c, a, t), f in per_triple.items():
        q = quantize(f.value, f.decimals, schema[t])                        # R4
        if q is None:
            log["rejet_hors_bornes"] += 1
            rejected.append({"raison": "hors_bornes", "client": c, "agent": a, "tag1": t,
                             "index": f.index, "value": str(f.value)})
            continue
        by_pair[(c, a)].append((q, f))
    out: dict[tuple[str, int], PairEdge] = {}
    for (c, a), lst in by_pair.items():
        if c == ZERO:                                   # no feedback can come from address(0) (msg.sender); it marks a
            log["client_zero_ignore"] += 1              # source-less row in ENCODING and is refused as a node (R1)
            continue
        neg = [x for x in lst if x[0] < 0]                                  # R5
        # ties between tags of equal weight: the HIGHEST feedbackIndex (unified v1, F-6: the contract stores only
        # tag hashes, so it cannot compare tag strings; it scans from the last index down and keeps the first)
        q, f = min(neg, key=lambda x: (x[0], -x[1].index)) if neg else max(lst, key=lambda x: (x[0], x[1].index))
        if reject_controllers:                                              # R6 on the COMBINED sign (D48-B)
            ctl = identity.controllers(a)
            if c in ctl:
                if q > 0 or reject_controllers == "any":
                    log[f"rejet_controleur_{ctl[c]}"] += 1
                    rejected.append({"raison": "controleur_" + ctl[c], "client": c, "agent": a, "avis": len(lst)})
                    if r6 is not None:
                        r6.add((c, a))
                    continue
                if q < 0:
                    log[f"negatif_controleur_garde_{ctl[c]}"] += 1
        if q == 0:
            log["poids_nul"] += 1
            continue
        out[(c, a)] = PairEdge(c, a, q, f.tag1, f.index)
        if diagnostics is not None and c not in identity.controllers(a):    # AM-9.3: report only
            kind = ("pastOwner" if c in identity.past_owners.get(a, ()) else
                    "pastWallet" if c in identity.past_wallets.get(a, ()) else None)
            if kind:
                tb = identity.past_owner_until.get(a, {}).get(c) if kind == "pastOwner" else None
                after = [x.block for x in feedbacks if x.client == c and x.agent_id == a and x.block
                         and tb is not None and x.block >= tb]
                first = min(after) if after else None
                diagnostics.append({"kind": kind, "client": c, "agentId": a, "w": q, "tag1": f.tag1,
                                    "feedbackIndex": f.index, "feedbackBlock": f.block or None, "transferBlock": tb,
                                    "firstFeedbackAfterTransfer": first,
                                    "blocksAfterTransfer": first - tb if first is not None else None})
    log["aretes_couple"] = len(out)
    return out


def build_graph(feedbacks: list[Feedback], identity: Identity, schema: dict[str, TagSpec],
                filter_tags: list[str] | None, anchors: list[str], *, owner_fallback: bool = False,
                selection: str = "latest_then_reject", combine: str = "neg_dominance",
                reject_controllers: bool = True, keep_detail: bool = True) -> Graph:
    """Signed graph of one anchor set (R1-R8).

    Nodes, in canonical order: anchors (addresses ascending), rated agents (agentId ascending), address nodes
    (ascending). Only RATED agents are agent nodes: an agent nobody rates has no incoming edge and is not an
    anchor, so its mass is 0 and its copy of a row would carry nothing (D20: "un agent de masse nulle n'a pas
    besoin de ligne").
    owner_fallback  D44 (default OFF, pending Hugo): src(j) = owner(j) when agentWallet(j) == 0.
    """
    log: dict[str, int] = defaultdict(int)
    rejected: list[dict] = []
    anchors = sorted({a.lower() for a in anchors})     # contract: anchor addresses strictly increasing
    r6: set[tuple[str, int]] = set()
    diag: list[dict] = []
    pairs = combine_pairs(feedbacks, identity, schema, filter_tags, selection=selection, combine=combine,
                          reject_controllers=reject_controllers, log=log, rejected=rejected, r6=r6, diagnostics=diag)
    anchor_set = set(anchors)

    out_rows: dict[str, list[PairEdge]] = defaultdict(list)                # client -> combined edges
    for (c, _), pe in pairs.items():
        out_rows[c].append(pe)
    rated = sorted({a for (_, a) in pairs})
    # R7: A(c) restricted to graph nodes (rated agents)
    carriers: dict[str, list[tuple[int, str]]] = defaultdict(list)
    sources = {j: identity.source_of(j, owner_fallback) for j in rated}
    for j, (s, via) in sources.items():
        if s in anchor_set:                             # D48-A: an anchor address never emits through an agent
            continue
        if s is not None and s in out_rows:
            carriers[s].append((j, via))
    # a client is an address node iff A(c) is empty over ALL agents (not only rated ones)
    has_agent = set(identity.wallet_to_agents())
    if owner_fallback:
        has_agent |= {o for a, o in identity.owner.items() if (identity.wallet.get(a, ZERO) or ZERO) == ZERO}
    # R8: an anchor address is carried by its anchor node, never by an extra address node
    addrs = sorted(c for c in out_rows if c not in has_agent and c not in anchors)
    for c in out_rows:
        if c in has_agent and c not in carriers and c not in anchor_set:
            log["emetteur_agents_non_notes"] += 1       # row of c carried by nobody: its agents have no mass
    nodes: list[tuple[str, object]] = [(ANCHOR, a) for a in anchors]
    nodes += [(AGENT, a) for a in rated] + [(ADDR, c) for c in addrs]
    index = {k: i for i, k in enumerate(nodes)}

    def row_of(c: str, u: int) -> list[Edge]:
        r = []
        for pe in out_rows[c]:
            v = index[(AGENT, pe.agent_id)]
            if v == u:                                  # a client rating the very agent that carries its row: under
                log["boucle_ignoree"] += 1              # D48-B only a NEGATIVE self-pair survives R6 (src(j) controls j);
                continue                                # it is never encodable (dst != u) and never provable
            r.append(Edge(v, pe.q, c, pe.agent_id, pe.tag1, pe.feedback_index))
        return sorted(r, key=lambda e: e.dst)

    rows: dict[int, list[Edge]] = {}
    row_src: dict[int, tuple[str, str]] = {}
    anchor_sourced: set[int] = set()
    for j, (s, via) in sources.items():                 # every agent node records src(j), even with an empty row:
        u = index[(AGENT, j)]                           # it stays challengeable (SRC)
        if s in anchor_set:                             # D48-A: listed WITHOUT a row (no row_src: never encodable)
            anchor_sourced.add(u)
            log["agent_source_ancre_sans_ligne"] += 1
            continue
        row_src[u] = (s, via) if s is not None else (None, "none")
    for a in anchors:                                   # R8; every anchor has a row_src, even with an empty row
        u = index[(ANCHOR, a)]
        row_src[u] = (a, "anchor")
        if a in out_rows:
            rows[u] = row_of(a, u)
    for c, lst in carriers.items():                     # R7 row copy
        for j, via in lst:
            u = index[(AGENT, j)]
            rows[u], row_src[u] = row_of(c, u), (c, via)
            log["ligne_" + via] += 1
        if len(lst) > 1:
            log["lignes_copiees_D20"] += len(lst) - 1
    for c in addrs:
        u = index[(ADDR, c)]
        rows[u], row_src[u] = row_of(c, u), (c, "address")
    log["emetteur_adresse"] = len(addrs)
    for row in rows.values():
        if len(row) > ROW_MAX:
            log["lignes_sup_ROW_MAX"] += 1
    return Graph(nodes=nodes, index=index, rows=rows, anchors=[index[(ANCHOR, a)] for a in anchors],
                 log=dict(log), rejected=rejected if keep_detail else [], row_src=row_src, pairs=pairs,
                 r6_pairs=r6, anchor_sourced=anchor_sourced, diagnostics=diag)

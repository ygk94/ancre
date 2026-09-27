"""ANCRE R4 — construction du graphe de confiance à partir des avis ERC-8004.

Règles appliquées (CR du conseil, décisions citées par numéro) :
  D14  unité d'arête = dernier avis non révoqué par (client, agent, tag1) ; puis, entre les tags
       du filtre, dominance du négatif (un poids < 0 => le plus négatif ; sinon le plus grand).
  D15  seuls les tags `kind = endorsement` du schéma créent des arêtes.
  D12  schéma (tag -> min, neutre, max, kind) engagé par ensemble, chargé depuis un JSON.
  D16  nœud émetteur = l'unique agentId dont agentWallet == client, sinon nœud-adresse ;
       rejet si client ∈ {owner, agentWallet, approved, opérateurs de l'owner} de la cible,
       ou si client a été owner de la cible (logs Transfer).
  D9   nœud-ancre toujours distinct d'un nœud-agent.
  D18  poids quantifié normatif : int16 sur la grille 1e-4, troncature vers zéro.
  CR   valeur hors bornes => rejetée (jamais plafonnée) ; comparaison aux bornes en valeur exacte.

Toute l'arithmétique normative est en entiers (WAD = 1e18), comme le fera le contrat.
"""
from __future__ import annotations

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
TAGS_MAX = 8                 # D14 : taille max du filtre d'un ensemble (choix)
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
    """Relecture on-chain (readAllFeedback, includeRevoked = true) : {"block", "feedbacks": [{a, c, i, v, d, t1, t2, r}]}.
    Source à préférer : 8004scan écrit valueDecimals = 0 pour 24 avis qui ont 2 décimales on-chain (AM-R4.2)."""
    raw = json.load(open(path))
    return [Feedback(agent_id=int(x["a"]), client=x["c"].lower(), index=int(x["i"]), value=int(x["v"]),
                     decimals=int(x["d"]), tag1=x["t1"], tag2=x["t2"], revoked=bool(x["r"]))
            for x in raw["feedbacks"]]


@dataclass
class Identity:
    """État de l'IdentityRegistry au bloc du certificat."""
    block: int
    owner: dict[int, str]
    wallet: dict[int, str]
    approved: dict[int, str] = field(default_factory=dict)
    operators: dict[str, set[str]] = field(default_factory=dict)     # owner -> opérateurs actifs
    past_owners: dict[int, set[str]] = field(default_factory=dict)   # agentId -> détenteurs passés
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

    def controllers(self, agent_id: int) -> dict[str, str]:
        """{adresse: raison} des adresses qui contrôlent l'agent au bloc du certificat (D16)."""
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
        for po in self.past_owners.get(agent_id, ()):
            c.setdefault(po, "past_owner")
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
        for l in sorted(lg.get("tr", []), key=key):
            frm, to, tid = _topic_addr(l["topics"][1]), _topic_addr(l["topics"][2]), int(l["topics"][3], 16)
            for a in (frm, to):
                if a != ZERO:
                    past[tid].add(a)
        # past_owners = détenteurs passés, hors owner courant (qui est déjà un contrôleur)
        idn.past_owners = {t: {a for a in s if a != owner.get(t)} for t, s in past.items()}
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


# ----------------------------------------------------------------------------- graphe

AGENT, ADDR, ANCHOR = "agent", "addr", "anchor"


@dataclass(frozen=True)
class Edge:
    dst: int            # index du nœud destination (toujours un nœud-agent)
    q: int              # poids int16, grille 1e-4, != 0
    client: str
    agent_id: int
    tag1: str           # tag qui a déterminé q (dominance du négatif)
    feedback_index: int


@dataclass
class Graph:
    nodes: list[tuple[str, object]]                 # (kind, agentId | adresse)
    index: dict[tuple[str, object], int]
    rows: dict[int, list[Edge]]                     # src -> arêtes (triées par dst)
    anchors: list[int]                              # indices des nœuds-ancres (une colonne chacun)
    log: dict[str, int]                             # compteurs de filtrage
    rejected: list[dict]                            # détail des avis/couples rejetés (pour les rapports)

    @property
    def n(self) -> int:
        return len(self.nodes)

    def bplus(self, u: int) -> int:
        return max(GRID, sum(e.q for e in self.rows.get(u, ()) if e.q > 0))

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


def build_graph(feedbacks: list[Feedback], identity: Identity, schema: dict[str, TagSpec],
                filter_tags: list[str] | None, anchors: list[str],
                *, selection: str = "latest_then_reject", combine: str = "neg_dominance",
                reject_controllers: bool = True, ambiguous_wallet: str = "address",
                keep_detail: bool = True) -> Graph:
    """Construit le graphe signé.

    selection      "latest_then_reject" (défaut, = contrat R5 _registryEdge) : par (client, agent, tag1), l'avis
                                     non révoqué d'index maximal ; s'il est hors bornes, ce tag ne donne rien ;
                   "latest_valid"  : l'avis non révoqué ET dans les bornes d'index maximal (lecture littérale
                                     de la preuve d'écart (ii) « un feedback valide plus récent »).
    combine        "neg_dominance" (D14) | "latest_pair" (règle du tour 2 : dernier avis du couple, tous tags).
    ambiguous_wallet "address" (D16) | "relay" (variante étudiée AM-R4.1, pas une décision du CR).
    filter_tags    tags du filtre de l'ensemble (<= TAGS_MAX) ; None = tous les tags du schéma.
    """
    if filter_tags is None:
        filter_tags = sorted(schema)
    if len(filter_tags) > TAGS_MAX:
        raise ValueError(f"filtre de {len(filter_tags)} tags > TAGS_MAX={TAGS_MAX}")
    ftags = set(filter_tags)
    log: dict[str, int] = defaultdict(int)
    rejected: list[dict] = []
    anchors = sorted({a.lower() for a in anchors})     # R5 : adresses d'ancres strictement croissantes

    # 1. sélection par (client, agent, tag1)
    per_triple: dict[tuple[str, int, str], Feedback] = {}
    if combine == "latest_pair":
        # règle du tour 2 : dernier avis non révoqué par couple, tous tags confondus
        best: dict[tuple[str, int], Feedback] = {}
        for f in feedbacks:
            if f.revoked:
                continue
            k = (f.client, f.agent_id)
            if k not in best or f.index > best[k].index:
                best[k] = f
        cand = list(best.values())
    else:
        cand = feedbacks
    for f in cand:
        log["avis_lus"] += 1
        if f.revoked:
            log["rejet_revoque"] += 1
            continue
        if f.tag1 not in ftags or f.tag1 not in schema:
            log["hors_filtre_ou_schema"] += 1
            continue
        spec = schema[f.tag1]
        if spec.kind != "endorsement":
            log["rejet_measurement_D15"] += 1
            continue
        q = quantize(f.value, f.decimals, spec)
        k = (f.client, f.agent_id, f.tag1)
        if selection == "latest_valid":
            if q is None:
                log["rejet_hors_bornes"] += 1
                if keep_detail:
                    rejected.append({"raison": "hors_bornes", "client": f.client, "agent": f.agent_id,
                                     "tag1": f.tag1, "index": f.index, "value": str(f.value)})
                continue
            if k not in per_triple or f.index > per_triple[k].index:
                per_triple[k] = f
        else:
            if k not in per_triple or f.index > per_triple[k].index:
                per_triple[k] = f
    # 2. rejet des contrôleurs (D16) puis combinaison entre tags (D14)
    pairs: dict[tuple[str, int], list[tuple[int, Feedback]]] = defaultdict(list)
    for (c, a, t), f in per_triple.items():
        q = quantize(f.value, f.decimals, schema[t])
        if q is None:                                   # seulement en mode latest_then_reject
            log["rejet_hors_bornes"] += 1
            continue
        pairs[(c, a)].append((q, f))
    combined: dict[tuple[str, int], tuple[int, Feedback]] = {}
    for (c, a), lst in pairs.items():
        if reject_controllers:
            ctl = identity.controllers(a)
            if c in ctl:
                log[f"rejet_controleur_{ctl[c]}"] += 1
                if keep_detail:
                    rejected.append({"raison": "controleur_" + ctl[c], "client": c, "agent": a,
                                     "avis": len(lst)})
                continue
        neg = [x for x in lst if x[0] < 0]
        if neg:
            q, f = min(neg, key=lambda x: (x[0], x[1].tag1))
        else:
            q, f = max(lst, key=lambda x: (x[0], x[1].tag1))
        if q == 0:
            log["poids_nul"] += 1
            continue
        combined[(c, a)] = (q, f)
    log["aretes_couple"] = len(combined)

    # 3. nœuds : ancres d'abord (ordre donné), puis agents triés, puis adresses triées
    w2a = identity.wallet_to_agents()
    nodes: list[tuple[str, object]] = [(ANCHOR, a) for a in anchors]
    agents_needed: set[int] = set()
    addrs_needed: set[str] = set()
    emitter: dict[str, tuple[str, object]] = {}
    for (c, a) in combined:
        agents_needed.add(a)
        if c not in emitter:
            owners = w2a.get(c, [])
            if len(owners) == 1:
                emitter[c] = (AGENT, owners[0])
                agents_needed.add(owners[0])
            else:
                emitter[c] = (ADDR, c)
                addrs_needed.add(c)
                log["emetteur_adresse_ambigu" if len(owners) > 1 else "emetteur_adresse_sans_agent"] += 1
    relay_edges: list[tuple[int, str]] = []
    if ambiguous_wallet == "relay":
        # variante : chaque agent X dont le wallet ambigu c émet vers le nœud-adresse c (poids 1)
        for c, (kind, _) in emitter.items():
            if kind == ADDR and len(w2a.get(c, [])) > 1:
                for x in w2a[c]:
                    agents_needed.add(x)
                    relay_edges.append((x, c))
    nodes += [(AGENT, a) for a in sorted(agents_needed)]
    nodes += [(ADDR, c) for c in sorted(addrs_needed)]
    index = {k: i for i, k in enumerate(nodes)}

    rows: dict[int, list[Edge]] = defaultdict(list)
    for (c, a), (q, f) in combined.items():
        e = Edge(dst=index[(AGENT, a)], q=q, client=c, agent_id=a, tag1=f.tag1, feedback_index=f.index)
        rows[index[emitter[c]]].append(e)
        if c in anchors:                                  # D9 : la ligne de l'ancre est portée par son nœud-ancre
            rows[index[(ANCHOR, c)]].append(e)
    for x, c in relay_edges:
        # arête de relais : poids plein, pas un avis (feedbackIndex = 0)
        # le nœud-adresse c n'est pas un nœud-agent : dst pointe vers le nœud-adresse
        rows[index[(AGENT, x)]].append(Edge(dst=index[(ADDR, c)], q=Q_MAX, client=c, agent_id=x,
                                            tag1="<relay>", feedback_index=0))
    for u in rows:
        rows[u].sort(key=lambda e: (e.dst, e.feedback_index))
    for u, row in rows.items():
        if len(row) > ROW_MAX:
            log["lignes_sup_ROW_MAX"] += 1
    return Graph(nodes=nodes, index=index, rows=dict(rows), anchors=[index[(ANCHOR, a)] for a in anchors],
                 log=dict(log), rejected=rejected)

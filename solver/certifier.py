"""ANCRE certifier service (chantier 04-E4): recompute, align on the on-chain node table, submit.

Per anchor set:
  1. triggers (`relevant`): only events that can change the certificate. A feedback or a revocation matters only
     if its client is the source of a PROVIDED row (anchor, or source of a massive node): any other client has
     zero mass and changes nothing (tour 1). Identity events matter for graph agents and for the targets of pairs
     rejected by R6 (a transfer can bring the edge back). `Upgraded` always matters (REGISTRY_CHANGED, D17/D28).
     Age > maxAge − refreshLead forces a refresh, even with an identical graph.
  2. recompute (graph.build_graph + ppr.certify: sub-solution from 0, D26);
  3. SYNC the node table from the chain (NodesAdded logs + calldata of their transactions) and read the current
     certificate (`certificate(setId)`): the local state file is only a cache, never the truth. This makes the
     service restart-safe, robust to a crash mid-plan, and robust to third-party `addNodes`;
  4. align the certificate on the APPEND-ONLY table (existing indices reused, new nodes appended, nCert
     non-decreasing);
  5. idempotence: skip if (graphRoot, vectorRoot) equal the certificate on chain, unless a refresh is due;
  6. replacement rule of the contract checked BEFORE any transaction (no gas spent on a doomed plan);
  7. plan: addNodes chunks + reserveCapacity chunks (sized in slots, k-aware) for a large first certificate,
     then submitCertificate; gas limit = eth_estimateGas × (1 + margin) + abs, because on Monad the LIMIT is paid;
  8. submitter = owner of the set (D27, Submitter-attested). No raw private key ever: an encrypted keystore whose
     password reaches cast through the CHILD environment (ETH_PASSWORD), or an unlocked account on a local fork;
  9. JSONL journal (one event per line) for the demo screen (chantier 07), with latencies.

Encodings: "v1" (solver/FORMAT.md, proposed) or "v0" (contracts/ENCODING.md, the deployable R5 contract).
Chain access goes through Foundry's `cast` (no web3 dependency); `simulate.py` runs everything on an anvil fork.
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
import time
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path

from export import NotEncodable, encode, keccak, node_entry  # noqa: F401  (NotEncodable re-exported)
from graph import ADDR, AGENT, ANCHOR, Graph, Identity, build_graph, load_schema
from ppr import Certificate, certify, e_eff, verify

HERE = Path(__file__).parent
SUBMIT_SIG = "submitCertificate(bytes32,uint32,uint256,bytes,bytes,bytes)"
ADD_NODES_SIG = "addNodes(bytes32,bytes)"
RESERVE_SIG = "reserveCapacity(bytes32,uint32)"
CERT_VIEW = "certificate(bytes32)(uint64,uint256,bytes32,bytes32,bytes32,uint32,uint32,bool)"
NODES_ADDED = "NodesAdded(bytes32 indexed,uint256,uint256)"
SET_PARAMS_SIG = ("(address[],uint64[],uint32,uint32,bytes32,(string,int128,int128,int128,uint8)[],"
                  "(uint8,uint64,uint64,uint64))")


# ----------------------------------------------------------------------------- configuration


@dataclass
class GasPolicy:
    margin_bps: int = 750            # contracts/GAS.md: "limite = facturé du pire cas + ~7,5 %". State can drift
    margin_abs: int = 5_000          # between estimate and inclusion; a fork cannot measure that drift
    tx_cap: int = 25_000_000         # never send a transaction above this limit
    inline_nodes_max: int = 100      # new nodes carried by submitCertificate itself (29.1 k/node, GAS.md)
    add_nodes_per_tx: int = 600      # ~17.5 M per full addNodes chunk
    reserve_slots_per_tx: int = 800  # 17.5 k per 0→x slot (GAS.md): ~14 M per reserveCapacity chunk

    def limit(self, estimate: int) -> int:
        return math.ceil(estimate * (10_000 + self.margin_bps) / 10_000) + self.margin_abs


@dataclass
class SetConfig:
    name: str
    anchors: list[str]
    lambdas: list[int]
    alphaN: int
    alphaD: int
    filter_tags: list[str]
    schema_path: str = "schema_reference.json"
    min_anchors: int = 2
    max_age: int = 288_000           # blocks (~1 day at the MEASURED 0.302 s; parameters stay in blocks)
    min_refresh: int = 600
    slack_refresh: int = 0
    refresh_lead: int = 20_000       # recertify when age > maxAge − refreshLead
    owner: str = ""                  # D27: the set owner is the attested submitter
    owner_fallback: bool = False     # D44, pending Hugo
    encoding: str = "v0"
    tag_schema_hash: str = "0x" + "00" * 32
    gas: GasPolicy = field(default_factory=GasPolicy)

    @classmethod
    def load(cls, path) -> "SetConfig":
        obj = json.loads(Path(path).read_text())
        return cls(**{**obj, "gas": GasPolicy(**obj.get("gas", {}))})

    @property
    def alpha(self) -> Fraction:
        return Fraction(self.alphaN, self.alphaD)

    def schema(self):
        p = Path(self.schema_path)
        return load_schema(p if p.is_absolute() else HERE / p)

    def set_params_tuple(self) -> str:
        """SetParams of the v0 contract as a cast tuple literal."""
        sch = self.schema()
        tags = sorted(self.filter_tags, key=lambda t: keccak(t.encode()))
        ts = ",".join(f"({t},{sch[t].min_wad},{sch[t].neutral_wad},{sch[t].max_wad},"
                      f"{0 if sch[t].kind == 'endorsement' else 1})" for t in tags)
        anchors = sorted(a.lower() for a in self.anchors)
        return (f"([{','.join(anchors)}],[{','.join(str(x) for x in self.lambdas)}],{self.alphaN},{self.alphaD},"
                f"{self.tag_schema_hash},[{ts}],({self.min_anchors},{self.max_age},{self.min_refresh},"
                f"{self.slack_refresh}))")


# ----------------------------------------------------------------------------- chain adapter (cast)


class ChainError(Exception):
    @property
    def reason(self) -> str:
        return revert_reason(str(self))


# custom errors of AnchoredReputation (R5), selector -> name (cast sig)
ERRORS = {"0xf0064498": "ResidualTooLarge", "0xee3f07f1": "NotBetter", "0xcc34a05a": "BadParams",
          "0x9f1b671d": "BadRows", "0xa6a549a4": "BadEdge", "0x1078df5d": "BadVectors", "0x62687f6f": "BadNCert",
          "0x2b3ddb29": "UnknownSet", "0x3a81d6fc": "AlreadyRegistered", "0x2ad907fb": "ValueTooLarge",
          "0xd7e4e29d": "RegistryUnreadable", "0x44a37e44": "NoCert", "0x7ae39e67": "BadNodes"}


def revert_reason(err: str) -> str:
    m = re.search(r'data: "(0x[0-9a-f]{8})([0-9a-f]*)"', err)
    if not m:
        return err[:160]
    args = [int(m.group(2)[i:i + 64], 16) for i in range(0, len(m.group(2)), 64)]
    return f"{ERRORS.get(m.group(1), m.group(1))}({', '.join(map(str, args))})"


VALUE_FLAGS = {"--gas-limit", "--from", "--address", "--from-block", "--to-block", "--keystore"}


@dataclass
class Signer:
    """Who signs. `unlocked`: an anvil dev account (local fork only). `keystore`: an encrypted keystore file,
    password in the env var `password_env`, handed to cast through the CHILD environment (ETH_PASSWORD), so the
    secret never appears on a command line (`ps`) nor in a log."""
    address: str
    mode: str = "unlocked"          # "unlocked" | "keystore"
    keystore: str = ""
    password_env: str = ""

    def args(self) -> list[str]:
        if self.mode == "unlocked":
            return ["--unlocked", "--from", self.address]
        return ["--keystore", self.keystore]

    def env(self) -> dict:
        if self.mode != "keystore":
            return {}
        pw = os.environ.get(self.password_env, "")
        if not pw:
            raise RuntimeError(f"env var {self.password_env} not set")
        return {"ETH_PASSWORD": pw}


class Chain:
    def __init__(self, rpc: str, signer: Signer | None = None, cast: str | None = None):
        self.rpc, self.signer = rpc, signer
        self.cast = cast or os.path.expanduser("~/.foundry/bin/cast")

    def _run(self, *args: str, sign: bool = False) -> str:
        """`cast <sub> [options] [positionals]`: options (and the value after a VALUE_FLAG) are moved in front,
        split by POSITION (never by value), because `cast send --create CODE` takes everything after CODE."""
        sub, *rest = args
        flags, pos, i = [], [], 0
        while i < len(rest):
            if rest[i].startswith("--"):
                flags.append(rest[i])
                if rest[i] in VALUE_FLAGS and i + 1 < len(rest):
                    flags.append(rest[i + 1])
                    i += 1
            else:
                pos.append(rest[i])
            i += 1
        env = dict(os.environ)
        if sign:
            if self.signer is None:
                raise RuntimeError("no signer configured")
            flags = self.signer.args() + flags          # before any `--create`, which must come last
            env.update(self.signer.env())
        p = subprocess.run([self.cast, sub, "--rpc-url", self.rpc, *flags, *pos], capture_output=True, text=True,
                           env=env)
        if p.returncode != 0:
            raise ChainError(p.stderr.strip()[-2000:])
        return p.stdout.strip()

    @property
    def sender(self) -> str:
        if self.signer is None:
            raise RuntimeError("no signer configured")
        return self.signer.address.lower()

    def block_number(self) -> int:
        return int(self._run("block-number"))

    def call(self, to: str, sig: str, *args: str) -> str:
        return self._run("call", to, sig, *args)

    def estimate(self, to: str, sig: str, *args: str) -> int:
        return int(self._run("estimate", to, sig, *args, "--from", self.sender))

    def send(self, to: str, sig: str, *args: str, gas_limit: int) -> dict:
        return json.loads(self._run("send", to, sig, *args, "--gas-limit", str(gas_limit), "--json", sign=True))

    def logs(self, address: str, event_sig: str, from_block: int, *topics: str) -> list[dict]:
        out = self._run("logs", "--address", address, "--from-block", str(from_block), "--to-block", "latest",
                        "--json", event_sig, *topics)
        return json.loads(out) if out else []

    def tx_input(self, tx_hash: str) -> str:
        return self._run("tx", tx_hash, "input")

    def decode(self, sig: str, data: str) -> list[str]:
        p = subprocess.run([self.cast, "decode-calldata", sig, data], capture_output=True, text=True, check=True)
        return p.stdout.strip().split("\n")


# ----------------------------------------------------------------------------- node table and alignment

NodeKey = tuple[str, object]          # (ANCHOR|AGENT|ADDR, address | agentId)


def parse_entries(b: bytes) -> list[NodeKey]:
    out, i = [], 0
    while i < len(b):
        if b[i] == 1:
            out.append((AGENT, int.from_bytes(b[i + 1:i + 5], "big")))
            i += 5
        elif b[i] == 2:
            out.append((ADDR, "0x" + b[i + 1:i + 21].hex()))
            i += 21
        else:
            raise ValueError(f"bad node entry kind {b[i]}")
    return out


def _selector(sig: str) -> str:
    return "0x" + keccak(sig.encode()).hex()[:8]


def chain_table(chain: Chain, contract: str, set_id: str, anchors: list[str], from_block: int = 0) -> list[NodeKey]:
    """The on-chain node table, rebuilt from NodesAdded logs and the calldata of their transactions (addNodes or
    submitCertificate newNodes), checked for continuity. A transaction that is not a direct call to the contract
    (multisig, router) cannot be decoded and raises."""
    table: list[NodeKey] = [(ANCHOR, a) for a in sorted(x.lower() for x in anchors)]
    logs = chain.logs(contract, NODES_ADDED, from_block, set_id)
    for lg in sorted(logs, key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16))):
        data = bytes.fromhex(lg["data"][2:])
        start, count = int.from_bytes(data[:32], "big"), int.from_bytes(data[32:64], "big")
        if start != len(table):
            raise RuntimeError(f"node table gap: NodesAdded from {start}, table has {len(table)}")
        inp = chain.tx_input(lg["transactionHash"])
        if inp[:10] == _selector(ADD_NODES_SIG):
            entries = chain.decode(ADD_NODES_SIG, inp)[1]
        elif inp[:10] == _selector(SUBMIT_SIG):
            entries = chain.decode(SUBMIT_SIG, inp)[3]
        else:
            raise RuntimeError(f"cannot decode the transaction behind NodesAdded {lg['transactionHash']}")
        keys = parse_entries(bytes.fromhex(entries[2:]))
        if len(keys) != count:
            raise RuntimeError("NodesAdded count does not match the decoded entries")
        table += keys
    return table


@dataclass
class Aligned:
    cert: Certificate
    nodes: list[NodeKey]              # full on-chain table order after the append
    appended: list[NodeKey]           # nodes to append (addNodes / newNodes)

    @property
    def new_nodes(self) -> bytes:
        return b"".join(node_entry(x) for x in self.appended)


def align(g: Graph, cert: Certificate, table: list[NodeKey], prev_ncert: int) -> Aligned:
    """Re-index a solver certificate on the append-only table: existing nodes keep their index, the certificate's
    other nodes are appended in canonical order, nCert = full table (>= prev_ncert). Table nodes absent from the
    certificate get t = 0 and no row (valid: 0 <= y, and not truncated)."""
    keys = [g.nodes[gi] for gi in cert.node_map]
    k = cert.k
    if table[:k] != keys[:k]:
        raise ValueError("anchor nodes differ from the on-chain set")
    known = set(table)
    appended = [key for key in keys if key not in known]
    nodes = table + appended
    pos = {key: i for i, key in enumerate(nodes)}
    n = len(nodes)
    if n < prev_ncert:
        raise ValueError("nCert would decrease")
    m = [pos[key] for key in keys]                     # certificate index -> table index
    t = [[0] * n for _ in range(k)]
    for ci, ti in enumerate(m):
        for a in range(k):
            t[a][ti] = cert.t[a][ci]
    rows = {m[u]: sorted((m[d], q, fi) for d, q, fi in r) for u, r in cert.rows.items()}
    out = Certificate(n=n, anchors=list(range(k)), alphaN=cert.alphaN, alphaD=cert.alphaD, lambdas=cert.lambdas,
                      rows=rows, splus={m[u]: s for u, s in cert.splus.items()}, t=t,
                      node_map=[None] * n, mode=cert.mode,
                      row_src={m[u]: v for u, v in cert.row_src.items()}, iterations=cert.iterations)
    out.r, out.e, out.d, errs = verify(out)
    if errs:
        raise AssertionError(errs[:3])
    return Aligned(out, nodes, appended)


def encode_v0(cert: Certificate, nodes: list[NodeKey], identity: Identity | None) -> dict:
    return encode(cert, nodes, identity, version="v0")


# ----------------------------------------------------------------------------- triggers


@dataclass
class Support:
    """What a certificate depends on: clients whose rows are provided; agents whose identity matters."""
    clients: set[str]
    agents: set[int]

    @classmethod
    def of(cls, g: Graph, cert: Certificate) -> "Support":
        clients = set()
        for ci in cert.rows:
            gi = cert.node_map[ci]
            src = g.row_src.get(gi, (None, ""))[0]
            clients.add(src if src else str(g.nodes[gi][1]))
        agents = {int(v) for kind, v in g.nodes if kind == AGENT}
        # a pair rejected by R6 (client controls the target) comes back if the target changes hands
        agents |= {int(r["agent"]) for r in g.rejected
                   if r["raison"].startswith("controleur") and r["client"] in clients}
        return cls(clients=clients, agents=agents)


def relevant(ev: dict, sup: Support) -> bool:
    """ev: {"kind": NewFeedback|FeedbackRevoked|MetadataSet|Transfer|Approval|ApprovalForAll|Upgraded, ...}."""
    k = ev["kind"]
    if k == "Upgraded":
        return True
    if k in ("NewFeedback", "FeedbackRevoked"):
        return ev["client"].lower() in sup.clients
    if k in ("MetadataSet", "Transfer", "Approval"):
        return int(ev["agentId"]) in sup.agents
    if k == "ApprovalForAll":
        return True                     # operator of an owner: rare (32 on the mainnet), cheap to recompute
    return False


# ----------------------------------------------------------------------------- planning and submission


@dataclass
class Tx:
    fn: str
    sig: str
    args: list[str]
    note: str = ""


def plan(cfg: SetConfig, set_id: str, al: Aligned, enc: dict, reserved_nodes: int, e_max: int, k: int) -> list[Tx]:
    """Transactions for one certificate.
    Small case: newNodes inline in submitCertificate. Large case (more than inline_nodes_max new nodes, or more
    unreserved vector slots than one reserve chunk): addNodes chunks, then reserveCapacity chunks up to nCert
    (the certificate then pays x→y, 100 gas/slot, instead of 0→x), then submitCertificate. Chunks follow the slot
    count ⌈n/4⌉·(k+2) of the contract's vector layout (ENCODING.md §5), so k is taken into account."""
    n = al.cert.n
    stride = k + 2
    unreserved_slots = max(0, (n + 3) // 4 - (reserved_nodes + 3) // 4) * stride
    large = len(al.appended) > cfg.gas.inline_nodes_max or unreserved_slots > cfg.gas.reserve_slots_per_tx
    txs: list[Tx] = []
    inline = al.new_nodes
    if large:
        per = cfg.gas.add_nodes_per_tx
        for i in range(0, len(al.appended), per):
            chunk = b"".join(node_entry(x) for x in al.appended[i:i + per])
            txs.append(Tx("addNodes", ADD_NODES_SIG, [set_id, "0x" + chunk.hex()],
                          f"nodes {i}..{i + len(al.appended[i:i + per]) - 1}"))
        inline = b""
        nodes_per_reserve = max(4, (cfg.gas.reserve_slots_per_tx // stride) * 4)
        upto = reserved_nodes
        while upto < n:
            upto = min(n, upto + nodes_per_reserve)
            txs.append(Tx("reserveCapacity", RESERVE_SIG, [set_id, str(upto)], f"upto {upto}"))
    txs.append(Tx("submitCertificate", SUBMIT_SIG,
                  [set_id, str(n), str(e_max), "0x" + inline.hex(), "0x" + enc["vectors"].hex(),
                   "0x" + enc["rows"].hex()], f"nCert {n}, rows {len(al.cert.rows)}"))
    return txs


class Journal:
    """JSONL journal, one event per line (read by the demo screen)."""

    def __init__(self, path: Path | None):
        self.path = path

    def log(self, **ev):
        ev = {"ts": round(time.time(), 3), **ev}
        if self.path:
            with open(self.path, "a") as fh:
                fh.write(json.dumps(ev) + "\n")
        return ev


@dataclass
class OnChain:
    cert_block: int
    e_eff: int
    graph_root: str
    vector_root: str
    n_cert: int
    registry_changed: bool

    @classmethod
    def read(cls, chain: Chain, contract: str, set_id: str) -> "OnChain":
        v = [x.split()[0] for x in chain.call(contract, CERT_VIEW, set_id).split("\n")]
        return cls(int(v[0]), int(v[1]), v[2].lower(), v[3].lower(), int(v[5]), v[7] == "true")


@dataclass
class State:
    """Local cache (what this service did). The chain is re-read before every plan."""
    set_id: str
    contract: str
    reserved: int = 0
    last_tx: list[str] = field(default_factory=list)

    def save(self, path: Path):
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.__dict__))
        os.replace(tmp, path)                           # atomic: a crash never leaves a truncated state file

    @classmethod
    def load(cls, path: Path, set_id: str, contract: str) -> "State":
        if not path.exists():
            return cls(set_id=set_id, contract=contract)
        st = cls(**json.loads(path.read_text()))
        if (st.set_id, st.contract.lower()) != (set_id, contract.lower()):
            raise RuntimeError(f"state file {path} belongs to another set or contract")
        return st


def replacement_wait(oc: OnChain, head: int, e_new: int, cfg: SetConfig) -> int:
    """Blocks to wait before submitCertificate's replacement rule accepts e_new (0 = now):
    no cert | registryChanged | age > maxAge | eNew <= eCur | (age > minRefresh and eNew <= eCur + slackRefresh).
    Read from the chain: proofs widen eCur, other submitters replace the certificate."""
    if oc.cert_block == 0 or oc.registry_changed or e_new <= oc.e_eff:
        return 0
    age = head - oc.cert_block
    waits = [cfg.max_age + 1 - age]
    if e_new <= oc.e_eff + cfg.slack_refresh:
        waits.append(cfg.min_refresh + 1 - age)
    return max(0, min(waits))


class Certifier:
    def __init__(self, cfg: SetConfig, chain: Chain | None, contract: str, set_id: str, state_path: Path,
                 journal: Journal):
        self.cfg, self.chain, self.contract, self.set_id = cfg, chain, contract, set_id
        self.state_path, self.journal = state_path, journal
        self.state = State.load(state_path, set_id, contract)
        self.support: Support | None = None

    def compute(self, fbs, idn: Identity, table: list[NodeKey], prev_ncert: int):
        g = build_graph(fbs, idn, self.cfg.schema(), self.cfg.filter_tags, self.cfg.anchors,
                        owner_fallback=self.cfg.owner_fallback)
        cert = certify(g, self.cfg.alpha, lambdas=self.cfg.lambdas)
        al = align(g, cert, table, prev_ncert)
        enc = encode(al.cert, al.nodes, idn, version=self.cfg.encoding)
        self.support = Support.of(g, cert)
        return g, al, enc

    def check_submitter(self):
        """D27: the attested submitter is the set owner."""
        if self.cfg.owner and self.chain.sender != self.cfg.owner.lower():
            raise RuntimeError("submitter is not the set owner (D27)")

    def due_refresh(self, oc: OnChain, head: int) -> bool:
        return oc.cert_block > 0 and head - oc.cert_block > self.cfg.max_age - self.cfg.refresh_lead

    def run_once(self, fbs, idn: Identity, *, reason: str, block: int | None = None, dry: bool = False) -> dict:
        t0 = time.perf_counter()
        if self.chain is None or dry:
            table, oc, head = [(ANCHOR, a) for a in sorted(x.lower() for x in self.cfg.anchors)], None, None
        else:
            head = self.chain.block_number()
            table = chain_table(self.chain, self.contract, self.set_id, self.cfg.anchors)
            oc = OnChain.read(self.chain, self.contract, self.set_id)
        g, al, enc = self.compute(fbs, idn, table, oc.n_cert if oc else 0)
        gr, vr = "0x" + enc["graphRoot"].hex(), "0x" + enc["vectorRoot"].hex()
        base = dict(set=self.cfg.name, reason=reason, block=block, nCert=al.cert.n, rows=len(al.cert.rows),
                    newNodes=len(al.appended), eEff=e_eff(al.cert), iterations=al.cert.iterations, graphRoot=gr,
                    computeMs=round((time.perf_counter() - t0) * 1000, 1))
        e_max = e_eff(al.cert)
        reserved = max(self.state.reserved, oc.n_cert if oc else 0)
        txs = plan(self.cfg, self.set_id, al, enc, reserved, e_max, al.cert.k)
        if oc is None:
            return self.journal.log(action="planned", txs=[t.fn for t in txs], **base)
        refresh = self.due_refresh(oc, head)
        if (gr, vr) == (oc.graph_root, oc.vector_root) and not refresh and not oc.registry_changed:
            return self.journal.log(action="skip_identical", **base)
        wait = replacement_wait(oc, head, e_max, self.cfg)
        if wait:                                        # the contract would revert NotBetter: do not pay for it
            return self.journal.log(action="deferred_replacement_rule", waitBlocks=wait, eCur=oc.e_eff, head=head,
                                    **base)
        self.check_submitter()
        last = None
        for tx in txs:
            est = self.chain.estimate(self.contract, tx.sig, *tx.args)
            lim = self.cfg.gas.limit(est)
            if lim > self.cfg.gas.tx_cap:
                raise RuntimeError(f"{tx.fn}: gas limit {lim} > cap {self.cfg.gas.tx_cap} (GAS.md: an update breaks "
                                   "around 12 k edges at k = 3; beyond, the verification must be split)")
            rc = self.chain.send(self.contract, tx.sig, *tx.args, gas_limit=lim)
            ok = rc.get("status") in ("0x1", 1, "1")
            last = self.journal.log(action=tx.fn, note=tx.note, estimate=est, gasLimit=lim,
                                    gasUsed=int(rc["gasUsed"], 16), tx=rc.get("transactionHash"), status=ok,
                                    txBlock=int(rc["blockNumber"], 16), **base)
            self.state.last_tx = [rc.get("transactionHash")]
            if tx.fn == "reserveCapacity" and ok:
                self.state.reserved = int(tx.args[1])
            self.state.save(self.state_path)            # progress is on chain; the cache follows every step
            if not ok:
                raise ChainError(f"{tx.fn} reverted: {rc.get('transactionHash')}")
        self.state.reserved = max(self.state.reserved, al.cert.n)
        self.state.save(self.state_path)
        return self.journal.log(action="certified", latencyMs=round((time.perf_counter() - t0) * 1000, 1),
                                txs=len(txs), refresh=refresh, lastTx=last["tx"], txBlock=last["txBlock"], **base)

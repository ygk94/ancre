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

Encoding: the unified v1 format of contracts/ENCODING.md (AnchoredReputation v1, integration 02+04, 01/10).
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

from export import POLICY_FIELDS, encode, keccak, make_set_block, node_entry, node_key, quality, set_id
from graph import ADDR, AGENT, ANCHOR, Graph, Identity, build_graph, load_schema
from ppr import Certificate, certify, e_eff, verify

HERE = Path(__file__).parent
SUBMIT_SIG = "submitCertificate(bytes32,uint32,uint256,bytes,bytes,bytes)"
ADD_NODES_SIG = "addNodes(bytes32,bytes)"
RESERVE_SIG = "reserveCapacity(bytes32,uint32)"
CERT_VIEW = "certificate(bytes32)(uint64,uint256,uint256,bytes32,bytes32,bytes32,uint32,uint32,bool)"
QUALITY_VIEW = "quality(bytes32)(uint256,uint256,uint256,bool)"
NODES_ADDED = "NodesAdded(bytes32 indexed,uint256,uint256)"
CERT_SUBMITTED = ("CertificateSubmitted(bytes32 indexed,uint64 indexed,uint256,bytes32,bytes32,bytes32,uint32,uint32,"
                  "bool)")
POLICY_SIG = "(uint64,uint32,uint32,uint8,uint8,int16,uint64,uint64,uint64,uint64,bool,bool,bool,address[])"
SET_PARAMS_SIG = "(address[],uint64[],uint32,uint32,bytes32,(string,int128,int128,int128,uint8)[]," + POLICY_SIG + ")"


# ----------------------------------------------------------------------------- configuration


@dataclass
class GasPolicy:
    margin_bps: int = 750            # contracts/GAS.md: "limite = facturé du pire cas + ~7,5 %". State can drift
    margin_abs: int = 5_000          # between estimate and inclusion; a fork cannot measure that drift
    tx_cap: int = 25_000_000         # never send a transaction above this limit
    inline_nodes_max: int = 100      # new nodes carried by submitCertificate itself (29.1 k/node, GAS.md)
    add_nodes_per_tx: int = 450      # review NODES600: addNodes costs ~45.9 k/node in v1 (GAS.md, MEASURED 01/10):
    #                                  450 x 45.9 k = 20.7 M, x 1.075 + margin = 22.2 M < tx_cap (600 gave 29.6 M)
    truncate_levels: tuple = (0, 10**12, 10**14, 10**16)   # review GASCAP: rows of nodes of mass <= level dropped
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
    owner: str = ""                  # D27: the set owner pays and submits
    owner_fallback: bool = False     # D44, pending Hugo: committed in the setId (policy.ownerFallback)
    tag_schema_hash: str = "0x" + "00" * 32
    # D39 policy (committed in the setId, ENCODING.md §1)
    theta: int = 10**15
    rho_n: int = 1
    rho_d: int = 2
    veto_quorum: int = 1
    veto_max: int = -1
    e_low_max: int = 10**16
    strict_transfer: bool = True
    registry_verified: bool = True   # D32: open sets require it
    submitters: list = field(default_factory=list)   # D32: empty = open submission (Registry-verified)
    gas: GasPolicy = field(default_factory=GasPolicy)

    def __post_init__(self):
        # anchors are nodes 0..k-1 in increasing address order (registerAnchorSet): sort the lambdas WITH them,
        # so that build_graph / certify and the committed setId give each anchor the same lambda
        if len(self.anchors) == len(self.lambdas):
            pairs = sorted(zip((a.lower() for a in self.anchors), self.lambdas))
            self.anchors, self.lambdas = [a for a, _ in pairs], [l for _, l in pairs]

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

    def policy(self) -> dict:
        """D39 policy in the JSON shape of a vector's `set.policy` (export.POLICY_FIELDS order)."""
        return {"theta": self.theta, "rhoN": self.rho_n, "rhoD": self.rho_d, "minAnchors": self.min_anchors,
                "vetoQuorum": self.veto_quorum, "vetoMax": self.veto_max, "maxAge": self.max_age,
                "minRefresh": self.min_refresh, "slackRefresh": self.slack_refresh, "eLowMax": self.e_low_max,
                "strictTransfer": self.strict_transfer, "registryVerified": self.registry_verified,
                "ownerFallback": self.owner_fallback, "submitters": sorted(a.lower() for a in self.submitters)}

    def set_block(self) -> dict:
        """The `set` block of a vector for this configuration (export.make_set_block: one builder for both)."""
        return make_set_block(self.anchors, self.lambdas, self.alphaN, self.alphaD, self.tag_schema_hash,
                              self.schema(), self.filter_tags, self.policy())

    @property
    def set_id(self) -> str:
        return set_id(self.set_block())

    def set_params_tuple(self) -> str:
        """SetParams (v1, with the D39 policy) as a cast tuple literal."""
        st = self.set_block()
        for t in st["tags"]:                            # cast tuple literals have no escaping
            if any(c in t["tag"] for c in ',()[]" '):
                raise ValueError(f"tag {t['tag']!r} cannot be written as a cast literal")
        ts = ",".join(f"({t['tag']},{t['min']},{t['neutral']},{t['max']},{t['kind']})" for t in st["tags"])
        pol = st["policy"]
        pv = []
        for f, _ in POLICY_FIELDS:
            v = pol[f]
            pv.append(f"[{','.join(v)}]" if f == "submitters" else str(v).lower() if isinstance(v, bool) else str(v))
        return (f"([{','.join(st['anchors'])}],[{','.join(st['lambdas'])}],{self.alphaN},{self.alphaD},"
                f"{self.tag_schema_hash},[{ts}],({','.join(pv)}))")


# ----------------------------------------------------------------------------- chain adapter (cast)


class ChainError(Exception):
    @property
    def reason(self) -> str:
        return revert_reason(str(self))


# custom errors of AnchoredReputation (R5): selectors derived from the declarations, never copied by hand
ERROR_SIGS = ["BadParams(uint256)", "AlreadyRegistered()", "UnknownSet()", "NodeExists(bytes32)", "BadNodes()",
              "BadNCert()", "BadVectors()", "BadRows(uint256)", "BadEdge(uint256)", "NotSubSolution(uint256,uint256)",
              "EdgeMismatch(uint256,uint256)", "ValueTooLarge()", "RegistryUnreadable()",
              "ResidualTooLarge(uint256,uint256)", "NotBetter(uint256,uint256,uint256,uint256)", "NoCert()",
              "BadProof(uint256)", "NothingToProve()", "NotSubmitter()",
              # 02-bis (review 06/10): anchor used as a row source, non-canonical row/node order, proven row resubmitted
              "AnchorAsSource(uint256)", "NotCanonical(uint256)", "ProvenRowResubmitted(uint256)"]


def _selector(sig: str) -> str:
    return "0x" + keccak(sig.encode()).hex()[:8]


ERRORS = {_selector(sig): sig.split("(")[0] for sig in ERROR_SIGS}


def revert_reason(err: str) -> str:
    m = re.search(r'data: "(0x[0-9a-f]{8})([0-9a-f]*)"', err)
    if not m:
        return err[:160]
    args = [int(m.group(2)[i:i + 64], 16) for i in range(0, len(m.group(2)), 64)]
    return f"{ERRORS.get(m.group(1), m.group(1))}({', '.join(map(str, args))})"


@dataclass
class Signer:
    """Who signs. `unlocked`: an anvil dev account (local fork only). `keystore`: an encrypted keystore file.

    AM-06.1: Foundry >= 1.8 reads ETH_PASSWORD as a password FILE PATH (`--password-file`, env ETH_PASSWORD), not as
    the password. The password is therefore given either as a 0600 file (`password_file`, or an env var whose name
    ends in `_FILE` holding that path), or as the password itself in the env var `password_env`, which this class
    writes ONCE to a 0600 file in a private 0700 temp dir (removed at exit). Only the PATH reaches cast, through the
    CHILD environment: the secret never appears on a command line (`ps`) nor in a log."""
    address: str
    mode: str = "unlocked"          # "unlocked" | "keystore"
    keystore: str = ""
    password_env: str = ""
    password_file: str = ""
    _tmp: str = field(default="", repr=False)

    @classmethod
    def build(cls, address: str | None, keystore: str | None = None, password_env: str | None = None,
              password_file: str | None = None) -> "Signer | None":
        """The one constructor of the CLIs (certifier, watcher, alchemy_hook: review SIGNER)."""
        if not address:
            return None
        if keystore:
            return cls(address.lower(), "keystore", keystore, password_env or "", password_file or "")
        return cls(address.lower())

    def args(self) -> list[str]:
        if self.mode == "unlocked":
            return ["--unlocked", "--from", self.address]
        return ["--keystore", self.keystore]

    def _path(self) -> str:
        if self.password_file:
            return self.password_file
        if self.password_env.endswith("_FILE"):        # the variable already holds a file path
            p = os.environ.get(self.password_env, "")
            if not p or not os.path.isfile(p):
                raise RuntimeError(f"env var {self.password_env} is not a password file path")
            return p
        if not self._tmp:
            pw = os.environ.get(self.password_env, "")
            if not pw:
                raise RuntimeError(f"env var {self.password_env} not set")
            import atexit
            import shutil
            import tempfile
            d = tempfile.mkdtemp(prefix="ancre-pw-")    # 0700
            path = os.path.join(d, "pw")
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as fh:
                fh.write(pw)
            atexit.register(shutil.rmtree, d, True)
            self._tmp = path
        return self._tmp

    def env(self) -> dict:
        if self.mode != "keystore":
            return {}
        return {"ETH_PASSWORD": self._path()}


PUBLIC_RANGE_100 = ("rpc.monad.xyz", "testnet-rpc.monad.xyz")   # eth_getLogs <= 100 blocks (CLAUDE.md §7, MEASURED)


class Chain:
    def __init__(self, rpc: str, signer: Signer | None = None, cast: str | None = None, log_chunk: int | None = None):
        self.rpc, self.signer = rpc, signer
        self.cast = cast or os.path.expanduser("~/.foundry/bin/cast")
        # review LOGS: split eth_getLogs on the public RPCs (range limited to 100 blocks, error -32614)
        self.log_chunk = log_chunk if log_chunk is not None else (
            100 if any(h in rpc for h in PUBLIC_RANGE_100) and "rpc1" not in rpc else 0)

    def _run(self, sub: str, *args: str, sign: bool = False) -> str:
        """`cast <sub> --rpc-url RPC [signer options] <args>`. Callers pass their options before the positionals
        (cast stops parsing options after `--create CODE`)."""
        env, sig = dict(os.environ), []
        if sign:
            if self.signer is None:
                raise RuntimeError("no signer configured")
            sig = self.signer.args()
            env.update(self.signer.env())
        p = subprocess.run([self.cast, sub, "--rpc-url", self.rpc, *sig, *args], capture_output=True, text=True,
                           env=env)
        if p.returncode != 0:                           # with --json cast writes some errors on STDOUT (AM-06.1)
            raise ChainError((p.stderr.strip() or p.stdout.strip())[-2000:] or f"cast {sub} exited {p.returncode}")
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
        return int(self._run("estimate", "--from", self.sender, to, sig, *args))

    @staticmethod
    def _receipt(out: str) -> dict:
        rc = json.loads(out)
        rc["ok"] = rc.get("status") in ("0x1", 1, "1")
        return rc

    def send(self, to: str, sig: str, *args: str, gas_limit: int) -> dict:
        return self._receipt(self._run("send", "--gas-limit", str(gas_limit), "--json", to, sig, *args, sign=True))

    def deploy(self, code: str, gas_limit: int) -> dict:
        return self._receipt(self._run("send", "--gas-limit", str(gas_limit), "--json", "--create", code, sign=True))

    def logs(self, address: str, event_sig: str, from_block: int, *topics: str,
             to_block: int | str = "latest") -> list[dict]:
        chunk = ["--query-size", str(self.log_chunk)] if self.log_chunk else []
        out = self._run("logs", "--address", address, "--from-block", str(from_block), "--to-block", str(to_block),
                        *chunk, "--json", event_sig, *topics)
        return json.loads(out) if out else []

    def eth_call(self, to: str, data: str) -> str:
        """Raw eth_call through the solver's JSON-RPC client (no process per call: the node table can be long)."""
        from refresh import Rpc
        return Rpc(self.rpc)("eth_call", [{"to": to, "data": data}, "latest"])

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


def anchor_table(anchors: list[str]) -> list[NodeKey]:
    """Nodes 0..k-1 of a set: its anchors, addresses strictly increasing (registerAnchorSet)."""
    return [(ANCHOR, a) for a in sorted(x.lower() for x in anchors)]


def key_to_node(key: int) -> NodeKey:
    """bytes32 node key of the contract (kind << 248 | agentId or address) -> NodeKey."""
    kind, val = key >> 248, key & ((1 << 160) - 1)
    if kind == 1:
        return (AGENT, val)
    if kind == 2:
        return (ADDR, "0x" + f"{val:040x}")
    if kind == 3:
        return (ANCHOR, "0x" + f"{val:040x}")
    raise ValueError(f"unknown node kind {kind}")


def chain_table(chain: Chain, contract: str, set_id: str, anchors: list[str], from_block: int = 0,
                to_block: int | str = "latest", table: list[NodeKey] | None = None) -> list[NodeKey]:
    """The on-chain node table, read from the contract's own storage (`nodeCount`, `nodeKeyAt`): review TBL, an
    `addNodes` relayed through a multisig, Multicall3, a 4337 account or a 7702 EOA no longer stops the service (the
    old version decoded the calldata behind each NodesAdded and raised on anything but a direct call). Incremental:
    pass the table known so far; only the new indices are read. `from_block` / `to_block` are kept for the callers
    (the table is append-only, so the latest state is the right one)."""
    fresh = table is None
    table = list(table) if table is not None else anchor_table(anchors)
    sid = set_id[2:].rjust(64, "0")
    count = int(chain.eth_call(contract, "0x" + keccak(b"nodeCount(bytes32)").hex()[:8] + sid), 16)
    key_at = lambda i: key_to_node(int(chain.eth_call(
        contract, "0x" + keccak(b"nodeKeyAt(bytes32,uint256)").hex()[:8] + sid + f"{i:064x}"), 16))
    if count < len(table):
        raise RuntimeError(f"node table shrank: {count} on chain < {len(table)} known (wrong set or contract)")
    if fresh and count:                                 # the anchors are nodes 0..k-1 of the registered set
        if [key_at(i) for i in range(len(table))] != table:
            raise RuntimeError("anchor nodes of the chain differ from the set configuration")
    for i in range(len(table), count):
        table.append(key_at(i))
    return table


def chain_table_from_logs(chain: Chain, contract: str, set_id: str, anchors: list[str], from_block: int = 0,
                          to_block: int | str = "latest", table: list[NodeKey] | None = None) -> list[NodeKey]:
    """Former reader (NodesAdded logs + calldata of their transactions), kept for contracts without nodeKeyAt.
    A transaction that is not a direct call to the contract (multisig, router) cannot be decoded and raises."""
    table = list(table) if table is not None else anchor_table(anchors)
    if isinstance(to_block, int) and from_block > to_block:     # nothing new since the last sync
        return table
    logs = chain.logs(contract, NODES_ADDED, from_block, set_id, to_block=to_block)
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
            src = g.row_src[gi][0] if gi in g.row_src else str(g.nodes[gi][1])      # address nodes carry themselves
            if src is not None:
                clients.add(src)
        agents = {int(v) for kind, v in g.nodes if kind == AGENT}
        # a pair rejected by R6 (client controls the target) comes back if the target changes hands
        agents |= {a for c, a in g.r6_pairs if c in clients}
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
        return True                     # operator of an owner: rare (32 active operators on the mainnet, MEASURED
        #                                 06/10 in out/mainnet.md, snapshot 110 994 810), cheap to recompute
    return False


# ----------------------------------------------------------------------------- planning and submission


@dataclass
class Tx:
    fn: str
    sig: str
    args: list[str]
    note: str = ""


def plan(cfg: SetConfig, set_id: str, al: Aligned, enc: dict, reserved_nodes: int, e_max: int) -> list[Tx]:
    """Transactions for one certificate.
    Small case: newNodes inline in submitCertificate. Large case (more than inline_nodes_max new nodes, or more
    unreserved vector slots than one reserve chunk): addNodes chunks, then reserveCapacity chunks up to nCert
    (the certificate then pays x→y, 100 gas/slot, instead of 0→x), then submitCertificate. Chunks follow the slot
    count ⌈n/4⌉·(k+3) of the contract's vector layout (ENCODING.md §6: t columns, d, ownerFp, flags)."""
    n = al.cert.n
    stride = al.cert.k + 3
    unreserved_slots = max(0, (n + 3) // 4 - (reserved_nodes + 3) // 4) * stride
    large = len(al.appended) > cfg.gas.inline_nodes_max or unreserved_slots > cfg.gas.reserve_slots_per_tx
    open_set = not cfg.submitters
    if open_set and al.appended:      # review A1d: inline newNodes land at the CURRENT nodeCount; a third-party
        large = True                  # addNodes in between shifts every index. Add them in their own transactions
    txs: list[Tx] = []
    inline = al.new_nodes
    if large:
        per = cfg.gas.add_nodes_per_tx
        for i in range(0, len(al.appended), per):
            chunk = al.appended[i:i + per]
            txs.append(Tx("addNodes", ADD_NODES_SIG, [set_id, "0x" + b"".join(map(node_entry, chunk)).hex()],
                          f"nodes {i}..{i + len(chunk) - 1}"))
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
    e_low_eff: int = 0
    mass: int = 0                    # quality(setId): replacement rule (ENCODING.md §5)
    q_cur: int = 0
    distrust_mass: int = 0
    proven: bool = False             # a proof widened the incumbent: its exact content cannot come back

    @classmethod
    def read(cls, chain: Chain, contract: str, set_id: str) -> "OnChain":
        v = [x.split()[0] for x in chain.call(contract, CERT_VIEW, set_id).split("\n")]
        q = [x.split()[0] for x in chain.call(contract, QUALITY_VIEW, set_id).split("\n")]
        return cls(int(v[0]), int(v[1]), v[3].lower(), v[4].lower(), int(v[6]), v[8] == "true", int(v[2]),
                   int(q[0]), int(q[1]), int(q[2]), q[3] == "true")


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


def replacement_wait(oc: OnChain, head: int, q_new: int, mass_new: int, cfg: SetConfig, d_new: int = 0,
                     same_content: bool = False) -> int:
    """Blocks to wait before submitCertificate's replacement rule (ENCODING.md §5) accepts (q_new, mass_new), 0 = now:
    attested set | no cert | registryChanged | age > maxAge | eLowEff > eLowMax
    | (mass_new + eLowEff >= mass_cur and q_new <= q_cur and d_new >= distrust_cur)
    | (age > minRefresh and q_new <= q_cur + slackRefresh); never the same content again once it was proven wrong.
    Read from the chain (quality view): proofs widen q_cur and credit eLow, other submitters replace the certificate.
    A wait of maxAge means: prove the incumbent's overstatement first (watcher), or wait."""
    if cfg.submitters or oc.cert_block == 0 or oc.registry_changed:
        return 0
    if same_content and oc.proven:
        raise ValueError("the incumbent was proven wrong: resubmitting the same certificate is refused (recompute)")
    if oc.e_low_eff > cfg.e_low_max:
        return 0
    if mass_new + oc.e_low_eff >= oc.mass and q_new <= oc.q_cur and d_new >= oc.distrust_mass:
        return 0
    age = head - oc.cert_block
    waits = [cfg.max_age + 1 - age]
    if q_new <= oc.q_cur + cfg.slack_refresh:
        waits.append(cfg.min_refresh + 1 - age)
    return max(0, min(waits))


def distinct_variant(cert: Certificate) -> Certificate | None:
    """A DIFFERENT valid certificate of the same graph (review STUCK): 1 wei less on a massive node that feeds nobody
    (no row, or an empty row). t stays a sub-solution (t_v only decreases and no y depends on it), d and every root
    but vectorRoot are unchanged, the mass drops by at most 1 wei. None if no such node exists."""
    for v in range(cert.k, cert.n):
        if cert.rows.get(v):
            continue
        for a in range(cert.k):
            if cert.t[a][v] > 0:
                t = [list(col) for col in cert.t]
                t[a][v] -= 1
                out = Certificate(n=cert.n, anchors=cert.anchors, alphaN=cert.alphaN, alphaD=cert.alphaD,
                                  lambdas=cert.lambdas, rows=cert.rows, splus=cert.splus, t=t, node_map=cert.node_map,
                                  mode=cert.mode, row_src=cert.row_src, iterations=cert.iterations)
                out.r, out.e, out.d, errs = verify(out)
                if not errs and out.d == cert.d:
                    return out
    return None


class Certifier:
    def __init__(self, cfg: SetConfig, chain: Chain | None, contract: str, set_id: str, state_path: Path,
                 journal: Journal):
        self.cfg, self.chain, self.contract, self.set_id = cfg, chain, contract, set_id
        self.state_path, self.journal = state_path, journal
        self.state = State.load(state_path, set_id, contract)
        self.support: Support | None = None
        self._table: list[NodeKey] | None = None        # node table known up to self._table_block (append-only)
        self._table_block = -1
        self.last_seen: tuple | None = None             # (graphRoot, vectorRoot, eLowEff, eEff) after our last look

    def contract_changed(self, oc: "OnChain") -> bool:
        """Review THIRD: the certificate or its proofs changed on chain since our last look (a third-party certificate,
        a proof that widened the incumbent, a RowVoided): recompute now instead of waiting for the age refresh."""
        cur = (oc.graph_root, oc.vector_root, oc.e_low_eff, oc.e_eff, oc.registry_changed)   # + CHKREG
        changed = self.last_seen is not None and cur != self.last_seen
        self.last_seen = cur
        return changed

    def table(self, head: int) -> list[NodeKey]:
        """Incremental sync of the append-only node table: only the NodesAdded logs after the last sync."""
        self._table = chain_table(self.chain, self.contract, self.set_id, self.cfg.anchors,
                                  self._table_block + 1, head, self._table)
        self._table_block = head
        return self._table

    def compute(self, fbs, idn: Identity, table: list[NodeKey], prev_ncert: int, truncate_below: int = 0):
        g = build_graph(fbs, idn, self.cfg.schema(), self.cfg.filter_tags, self.cfg.anchors,
                        owner_fallback=self.cfg.owner_fallback)
        cert = certify(g, self.cfg.alpha, lambdas=self.cfg.lambdas, truncate_below=truncate_below)
        al = align(g, cert, table, prev_ncert)
        enc = encode(al.cert, al.nodes, idn)
        self.support = Support.of(g, cert)
        return g, al, enc

    def check_submitter(self):
        """D27: the attested submitter is the set owner."""
        if self.cfg.owner and self.chain.sender != self.cfg.owner.lower():
            raise RuntimeError("submitter is not the set owner (D27)")

    def due_refresh(self, oc: OnChain, head: int) -> bool:
        return oc.cert_block > 0 and head - oc.cert_block > self.cfg.max_age - self.cfg.refresh_lead

    def run_once(self, fbs, idn: Identity, *, reason: str, block: int | None = None, dry: bool = False,
                 _level: int = 0) -> dict:
        t0 = time.perf_counter()
        self.retry_at = None
        if self.chain is None or dry:
            table, oc, head = anchor_table(self.cfg.anchors), None, None
        else:
            head = self.chain.block_number()
            table = self.table(head)
            oc = OnChain.read(self.chain, self.contract, self.set_id)
        trunc = self.cfg.gas.truncate_levels[_level]
        g, al, enc = self.compute(fbs, idn, table, oc.n_cert if oc else 0, trunc)
        gr, vr = "0x" + enc["graphRoot"].hex(), "0x" + enc["vectorRoot"].hex()
        e_max = e_eff(al.cert)
        q_new, mass_new, d_new = quality(al.cert)
        base = dict(set=self.cfg.name, reason=reason, block=block, nCert=al.cert.n, rows=len(al.cert.rows),
                    newNodes=len(al.appended), eEff=e_max, qEff=q_new, mass=mass_new, iterations=al.cert.iterations,
                    graphRoot=gr, computeMs=round((time.perf_counter() - t0) * 1000, 1),
                    **({"truncateBelow": trunc} if trunc else {}))
        reserved = max(self.state.reserved, oc.n_cert if oc else 0)
        txs = plan(self.cfg, self.set_id, al, enc, reserved, e_max)
        if oc is None:
            return self.journal.log(action="planned", txs=[t.fn for t in txs], **base)
        refresh = self.due_refresh(oc, head)
        same = (gr, vr) == (oc.graph_root, oc.vector_root)
        stale = oc.cert_block > 0 and head - oc.cert_block > self.cfg.max_age
        hurt = oc.proven or oc.e_low_eff > 0 or stale    # review STUCK: never skip a proven or stale incumbent
        if same and not refresh and not oc.registry_changed and not hurt:
            return self.journal.log(action="skip_identical", **base)
        if same and oc.proven:                          # the same content would be refused: submit a distinct one
            var = distinct_variant(al.cert)
            if var is None:
                return self.journal.log(action="stuck_identical_proven", **base)
            al = Aligned(var, al.nodes, al.appended)
            enc = encode(al.cert, al.nodes, idn)
            vr = "0x" + enc["vectorRoot"].hex()
            q_new, mass_new, d_new = quality(al.cert)
            e_max = e_eff(al.cert)
            txs = plan(self.cfg, self.set_id, al, enc, reserved, e_max)
            base.update(variant="1 wei below the fixed point (STUCK)", mass=mass_new, eEff=e_max, qEff=q_new)
            same = False
        wait = replacement_wait(oc, head, q_new, mass_new, self.cfg, d_new, same)
        if wait:                                        # the contract would revert NotBetter: do not pay for it
            self.retry_at = head + wait                 # review DEFER: the loop retries at that block
            return self.journal.log(action="deferred_replacement_rule", waitBlocks=wait, qCur=oc.q_cur,
                                    massCur=oc.mass, eLowCur=oc.e_low_eff, head=head, **base)
        self.check_submitter()
        split = not self.cfg.submitters and bool(al.appended)
        if split:                                       # open set: the nodes go alone, never with the certificate
            txs = [t for t in txs if t.fn != "submitCertificate"]
        last = None
        for tx in txs:
            est = self.chain.estimate(self.contract, tx.sig, *tx.args)
            lim = self.cfg.gas.limit(est)
            if lim > self.cfg.gas.tx_cap:
                if tx.fn == "submitCertificate" and _level + 1 < len(self.cfg.gas.truncate_levels):
                    # review GASCAP: drop the rows of the lightest nodes (truncation margin, t stays a lower bound)
                    self.journal.log(action="gas_cap_truncate", gasLimit=lim, nextLevel=_level + 1, **base)
                    return self.run_once(fbs, idn, reason=reason, block=block, dry=dry, _level=_level + 1)
                raise RuntimeError(f"{tx.fn}: gas limit {lim} > cap {self.cfg.gas.tx_cap} (review MSG: a Registry-"
                                   "verified update re-reads every edge, ~600 edges per 15 M, contracts/GAS.md)")
            rc = self.chain.send(self.contract, tx.sig, *tx.args, gas_limit=lim)
            ok = rc["ok"]
            last = self.journal.log(action=tx.fn, note=tx.note, estimate=est, gasLimit=lim,
                                    gasUsed=int(rc["gasUsed"], 16), tx=rc.get("transactionHash"), status=ok,
                                    txBlock=int(rc["blockNumber"], 16), **base)
            self.state.last_tx = [rc.get("transactionHash")]
            if tx.fn == "reserveCapacity" and ok:
                self.state.reserved = int(tx.args[1])
            self.state.save(self.state_path)            # progress is on chain; the cache follows every step
            if not ok:
                raise ChainError(f"{tx.fn} reverted: {rc.get('transactionHash')}")
        if split:                                       # review A1d: submit next round, on the RE-READ table
            self.state.save(self.state_path)
            self.retry_at = head
            return self.journal.log(action="nodes_added", txs=len(txs), **base)
        self.state.reserved = max(self.state.reserved, al.cert.n)
        self.state.save(self.state_path)
        self.contract_changed(OnChain.read(self.chain, self.contract, self.set_id))   # our own change is not news
        return self.journal.log(action="certified", latencyMs=round((time.perf_counter() - t0) * 1000, 1),
                                txs=len(txs), refresh=refresh, lastTx=last["tx"], txBlock=last["txBlock"], **base)


# ----------------------------------------------------------------------------- service loop

REGISTRY_EVENTS = {   # event -> (signature for cast logs, kind for `relevant`)
    "NewFeedback": "NewFeedback(uint256 indexed,address indexed,uint64,int128,uint8,string,string,string,string,string,bytes32)",
    "FeedbackRevoked": "FeedbackRevoked(uint256 indexed,address indexed,uint64 indexed)",
    "Transfer": "Transfer(address indexed,address indexed,uint256 indexed)",
    "MetadataSet": "MetadataSet(uint256 indexed,string indexed,string,bytes)",
    "Approval": "Approval(address indexed,address indexed,uint256 indexed)",
    "ApprovalForAll": "ApprovalForAll(address indexed,address indexed,bool)",
    "Upgraded": "Upgraded(address indexed)",
}


def registry_events(chain: Chain, identity: str, reputation: str, frm: int, to: int) -> list[dict]:
    """Registry events of (frm, to] as `relevant` inputs, from indexed topics only (no ABI decoding needed).
    Needs an RPC that accepts the range (rpc1.monad.xyz: full history; rpc.monad.xyz: 100 blocks per call)."""
    out = []
    for kind, sig in REGISTRY_EVENTS.items():
        for addr in ((reputation,) if kind in ("NewFeedback", "FeedbackRevoked") else
                     (identity, reputation) if kind == "Upgraded" else (identity,)):
            for lg in chain.logs(addr, sig, frm, to_block=to):
                tp = lg["topics"]
                ev = {"kind": kind, "block": int(lg["blockNumber"], 16)}
                if kind in ("NewFeedback", "FeedbackRevoked"):
                    ev.update(agentId=int(tp[1], 16), client="0x" + tp[2][-40:])
                elif kind in ("Transfer", "Approval"):
                    ev["agentId"] = int(tp[3], 16)
                elif kind == "MetadataSet":
                    ev["agentId"] = int(tp[1], 16)
                out.append(ev)
    return out


def main(argv=None):
    """Certifier loop: poll the registries, recompute only on a relevant event or a due refresh. Registry data:
    a from_indexer.py export directory (re-read when something is relevant). A real transaction needs --send
    and a keystore (Hugo's agreement on testnet/mainnet); without --send every round is a dry plan."""
    import argparse
    from graph import load_feedbacks_onchain, load_identity_json
    ap = argparse.ArgumentParser(description="ANCRE certifier service")
    ap.add_argument("--rpc", required=True)
    ap.add_argument("--contract", required=True)
    ap.add_argument("--set-config", required=True)
    ap.add_argument("--set-id", required=True)
    ap.add_argument("--identity", required=True, help="IdentityRegistry address of the chain")
    ap.add_argument("--reputation", required=True, help="ReputationRegistry address of the chain")
    ap.add_argument("--data", required=True, help="from_indexer.py output directory")
    ap.add_argument("--from-block", type=int, required=True)
    ap.add_argument("--state", default="certifier_state.json")
    ap.add_argument("--journal", default="certifier.jsonl")
    ap.add_argument("--from", dest="sender")
    ap.add_argument("--keystore")
    ap.add_argument("--password-env")
    ap.add_argument("--send", action="store_true")
    ap.add_argument("--interval", type=float, default=5.0)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args(argv)
    cfg = SetConfig.load(a.set_config)
    signer = Signer.build(a.sender, a.keystore if a.send else None, a.password_env)
    chain = Chain(a.rpc, signer)
    jr = Journal(Path(a.journal))
    svc = Certifier(cfg, chain, a.contract, a.set_id, Path(a.state), jr)
    svc.retry_at = None
    load = lambda: (load_feedbacks_onchain(Path(a.data) / "onchain_feedbacks.json"),
                    load_identity_json(Path(a.data) / "identity.json"))
    frm, first, head, failed = a.from_block, True, None, False
    while True:
        try:                                            # review DIES: everything inside, a 429 never kills the loop
            head = chain.block_number()
            evs = [] if first else [e for e in registry_events(chain, a.identity, a.reputation, frm, head)
                                    if svc.support is None or relevant(e, svc.support)]
            if any(e["kind"] == "Upgraded" for e in evs) and a.send:
                # review CHKREG: nobody else calls checkRegistry; it flags REGISTRY_CHANGED, then we recertify
                rc = chain.send(a.contract, "checkRegistry(bytes32)", a.set_id, gas_limit=300_000)
                jr.log(action="checkRegistry", set=cfg.name, tx=rc.get("transactionHash"), status=rc["ok"])
            oc = OnChain.read(chain, a.contract, a.set_id)
            due = svc.due_refresh(oc, head)
            moved = svc.contract_changed(oc)            # review THIRD / CHKREG: a third-party move, REGISTRY_CHANGED
            retry = svc.retry_at is not None and head >= svc.retry_at          # review DEFER / A1d
            if first or evs or due or moved or retry:
                fbs, idn = load()
                behind = max((e["block"] for e in evs), default=0)
                if idn.block < behind:                  # review STALE: the export lags the events: keep the window
                    jr.log(action="data_behind", set=cfg.name, dataBlock=idn.block, eventBlock=behind)
                    failed = True
                    if a.once:
                        return 1
                    time.sleep(a.interval)
                    continue
                svc.run_once(fbs, idn, reason="start" if first else (
                    f"{len(evs)} relevant event(s)" if evs else "contract state changed" if moved else
                    "retry (replacement rule / nodes added)" if retry else "refresh"), block=head, dry=not a.send)
            frm, first, failed = head + 1, False, False
        except Exception as e:                          # journal, keep the window, retry next round
            failed = True
            jr.log(action="error", set=cfg.name, error=str(e)[:500], fromBlock=frm, head=head)
        if a.once:
            return 1 if failed else 0
        time.sleep(a.interval)


if __name__ == "__main__":
    import sys
    sys.exit(main())

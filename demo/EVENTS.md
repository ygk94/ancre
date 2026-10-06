# Demo event log — format `ancre-demo-events-v1`

> Producer: chantier 06 (`demo/` scene scripts, act 2). Consumer: chantier 07 (demo screen, live and replay).
> Written 2026-10-06, **before** the scenes, so that 07 can build against it in parallel. Any change bumps the
> `format` string and is logged in `docs/chantiers/journal/06.md` under "INTERFACE".

## 1. Files

One run of the scene scripts = one run id `run-<UTC timestamp>` (e.g. `run-20261007T141502Z`).

| File | Written | Use |
|---|---|---|
| `demo/out/run-<ts>.jsonl` | append-only, one JSON object per line, flushed after every event | **live**: tail it |
| `demo/out/run-<ts>.json` | rewritten atomically (tmp + rename) after every event: `{header, events: [...]}` | **replay**, or a reload in the middle of a run |
| `demo/out/latest.json` | copy of the last `run-<ts>.json`, rewritten with it | fixed path for the screen |

Line 1 of the `.jsonl` is the header (`"type": "header"`), every other line is an event (`"type": "event"`).
A resumed run (a scene restarted after a failure) **keeps its run id** and appends: `seq` keeps increasing;
an event may then repeat a `step` with a higher `attempt`.

Encoding rules (all files):
- **Big integers are decimal strings** (WAD values, USDC base units, gas, agent ids): JSON numbers lose
  precision beyond 2^53. Small counters (`seq`, `block`, `feedbackCount`, …) are plain numbers.
- Addresses are checksummed; hashes are `0x`-prefixed lowercase hex.
- WAD = 10^18. ANCRE trust values are **shares of the anchors' mass**: the whole graph sums to at most 1 WAD,
  so `x / 1e16` is a percentage. Every WAD field has a float companion `…Pct` (informational, rounded) for
  display; decisions must use the string.
- `null` = not applicable to this event (never "0 by default").

## 2. Header

```json
{
  "type": "header",
  "format": "ancre-demo-events-v1",
  "runId": "run-20261007T141502Z",
  "network": { "chainId": 10143, "mode": "fork", "forkBlock": 67312345, "rpc": "http://127.0.0.1:8549" },
  "contracts": {
    "identity": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    "reputation": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    "ancre": "0x…", "payer": "0x…", "usdc": "0x534b2f3A21130d7a60830c2Df862319e593943A3"
  },
  "set": {
    "setId": "0x…",
    "anchors": [{ "address": "0x…", "label": "anchor-A (demo)" }],
    "minAnchors": 2, "vetoQuorum": 1, "theta": "10000000000000000", "thetaPct": 1.0,
    "level": "Registry-verified", "submitter": "0x…", "maxAge": 0, "minRefresh": 0,
    "tags": [{ "tag": "review", "hash": "0x…", "kind": "endorsement", "min": "-1", "neutral": "0", "max": "1" }]
  },
  "actors": [
    { "label": "ANCRE operator (deployer, certifier, payer owner)", "role": "operator", "address": "0x…" },
    { "label": "anchor-A (demo)", "role": "anchor", "address": "0x…" },
    { "label": "provider-1 (demo)", "role": "provider", "agentId": "1234", "owner": "0x…", "wallet": "0x…" },
    { "label": "farm-07 (demo)", "role": "farm", "agentId": "1250", "owner": "0x…", "wallet": "0x…" },
    { "label": "farm target (demo)", "role": "farm-target", "agentId": "1243", "owner": "0x…", "wallet": "0x…" }
  ],
  "startedAt": "2026-10-07T14:15:02.311Z"
}
```

- `network.mode`: `"fork"` (anvil fork of testnet 10143), `"frozen"` (replay of the dumped anvil state, D28)
  or `"testnet"` (real network). `forkBlock` is `null` on the testnet.
- `set.tags[].hash` = `keccak256(tag)`: `assess.triggerTag` is a **hash** (AM-04.2); resolve it with this table.
- `actors` lists every account of the run with its label: accounts as `{label, role, address}`, agents as
  `{label, role, agentId, owner, wallet}`. `role` ∈ `operator` (deployer, attested certifier, payer owner),
  `anchor`, `payer-operator`, `farm-owner`, `rater` (the third-party rater of scene 5), `provider`, `farm`,
  `farm-target`. Agents appear once registered: the header is rewritten after every scene. The screen should take
  labels from here, never guess them.

## 3. Event

```json
{
  "type": "event",
  "seq": 42,
  "runId": "run-20261007T141502Z",
  "scene": 4,
  "sceneName": "breaker",
  "step": "4.2-slash",
  "attempt": 1,
  "kind": "feedback",
  "label": "anchor-B slashes provider-2",
  "actor": "0x…",
  "agentId": "1235",
  "setId": "0x…",
  "tx": { "hash": "0x…", "fn": "giveFeedback", "block": 67312401, "status": "success",
          "gasLimit": "300000", "gasUsed": "271034" },
  "block": 67312401,
  "blockTimestamp": 1791382513,
  "wallTime": "2026-10-07T14:15:41.902Z",
  "wallMs": 1791382541902,
  "data": { "tag1": "slash", "tag2": "demo", "value": "-100", "decimals": 0 },
  "agent": {
    "explorer": { "feedbackCount": 3, "revokedCount": 0, "clientCount": 3, "naiveAverage": "-32.666666" },
    "contract": {
      "status": "VETOED", "trusted": false,
      "trust": "…", "trustRobust": "…", "trustLow": "0", "trustLowPct": 0.0,
      "theta": "100000000000000000", "thetaPct": 10.0,
      "e": "…", "ePct": 0.0, "eLow": "0", "distrust": "…", "distrustUp": "…",
      "vetoCount": 1, "triggerTag": "0x…", "triggerTagName": "slash", "certBlock": 67312390
    }
  },
  "payer": null,
  "certificate": null,
  "latency": null
}
```

### 3.1 Common fields

| Field | Type | Meaning |
|---|---|---|
| `seq` | number | strictly increasing within a run, from 1 |
| `scene` | number | 0 setup · 1 honest providers paid · 2 Sybil farm refused · 3 the farm pays itself (D45) · 4 breaker · 5 anti-erasure (D33) · 6 fabricated certificate rejected · 7 second hop (D50). **Run order: 0, 1, 7, 2, 3, 4, 5, 6** (7 is numbered last only so that the other ids stay stable) |
| `sceneName` | string | `setup`, `honest`, `farm`, `farm-pays-itself`, `breaker`, `anti-erasure`, `fabricated-cert`, `second-hop` |
| `step` | string | stable id within the scene (`"2.3-farm-ring"`), same across runs: the screen may key captions on it |
| `attempt` | number | 1, or more if the step was replayed after a failure |
| `kind` | string | see §3.2 |
| `label` | string | one human sentence, English, ready to display |
| `actor` | address \| null | who sent the transaction (or who asked, for a read) |
| `agentId` | string \| null | the agent the event is about; `agent` describes **this** agent |
| `tx` | object \| null | the transaction, if the event is one (receipt read before the event is written) |
| `block` | number | block of the transaction, or block at which the reads were made |
| `blockTimestamp` | number | timestamp of that block (seconds); shared by 3-4 Monad blocks, never use it to order |
| `wallTime`, `wallMs` | string, number | local clock when the event was written (ms precision, for latencies) |
| `data` | object \| null | kind-specific payload (§3.2) |

`tx.status` is `"success"` or `"reverted"`. A reverted transaction that the scene **expects** (scene 6) has
`kind: "rejected"` and the decoded error in `data.error`.

On the real testnet the scripts write the event once the receipt is returned by the RPC (block **Voted** or
later in Monad's terms, not Finalized). The screen's own `monadLogs` feed stays the source for
Proposed/Finalized states; this log never contains speculative blocks.

### 3.2 Kinds and their `data`

| `kind` | When | `data` |
|---|---|---|
| `deploy` | contract created | `{ "contract": "ancre" \| "payer", "address" }` |
| `register` | `register(agentURI)` | `{ "uri", "role" }` |
| `wallet` | `setAgentWallet` | `{ "wallet" }` |
| `anchor-set` | `registerAnchorSet` | `{ "setId" }` |
| `fund` | USDC or MON moved to an account or the payer | `{ "token": "USDC" \| "MON", "to", "amount" }` (base units) |
| `feedback` | `giveFeedback` | `{ "client", "tag1", "tag2", "value", "decimals", "feedbackIndex" }` |
| `feedback-batch` | many `giveFeedback` of the farm summarised in one event | `{ "count", "clients", "tag1", "value", "decimals", "txHashes": [...] , "firstBlock", "lastBlock" }` |
| `revoke` | `revokeFeedback` | `{ "client", "feedbackIndex" }` |
| `certificate` | the certifier submitted (or skipped) a certificate | see `certificate` below; `data` = `{ "trigger": "<why it recertified>" }` |
| `assess` | a pure read of the agent's state, no transaction; scene 4 uses it to carry the `latency` block (step `4.latency`) | `null` |
| `payment` | an x402 payment attempt through the `TrustGatedPayer` | see `payer` below |
| `farm-payment` | scene 3: a farm agent pays another farm agent, plain x402 `exact` from an EOA | `{ "from", "to", "amount", "receiptVerified": true }` |
| `rejected` | an expected revert (scene 6) | `{ "fn", "error": "EdgeMismatch(2, 1)", "simulated": true, "fabricatedEdge": {a, c, v, d, t1}, "mass" }` (simulated: `eth_estimateGas`, nothing broadcast) |
| `scene-start`, `scene-end` | bracket of a scene | `scene-end`: `{ "ok": true, "checks": [{ "name", "ok", "expected", "actual" }], "durationMs" }` |

### 3.3 `agent`: the two columns of the screen

Present on **every** event whose `agentId` is not `null`, read **at `block`** (after the transaction), so the
screen updates both columns from the event alone, with no extra request.

`agent.explorer` — "what an explorer sees":

| Field | Meaning |
|---|---|
| `feedbackCount` | non-revoked feedback received by the agent, all clients, all tags |
| `revokedCount` | revoked feedback received |
| `clientCount` | distinct clients among the non-revoked feedback |
| `naiveAverage` | arithmetic mean of `value / 10^decimals` over the non-revoked feedback, all tags, all clients, decimal string (6 decimals, truncated); `null` if `feedbackCount = 0` |

The naive average is **our** definition of what an explorer shows (an unweighted mean of every feedback). It
is not 8004scan's formula, which is not documented; the screen must label it "naive average", not "8004scan
score". It is computed from the registry (`readAllFeedback`), never from an API.

`agent.contract` — "what your contract sees", straight from `AnchoredReputation.assess(agentId, setId, true)`:

| Field | Meaning |
|---|---|
| `status` | `OK`, `NO_CERT`, `STALE`, `TRANSFERRED`, `VETOED`, `REGISTRY_CHANGED` (enum name) |
| `trusted` | `assess(...).passesPolicy` (named `trusted` before 02-bis) = what `passesAnchorPolicy` returns = what the payer acts on (D39) |
| `trust` | anchor-weighted mass (WAD) |
| `trustRobust` | mass minus the m − 1 largest anchor contributions (leave-one-out, D8) |
| `trustLow`, `trustLowPct` | **the ANCRE mass shown on screen**: `trustRobust − eLow`, the lower bound the policy compares to `theta` |
| `theta`, `thetaPct` | the trust threshold committed in the setId (the bar to clear) |
| `e`, `ePct` | **the bound**: certified upper error `eUp` of the certificate (aggregated, WAD) |
| `eLow` | widening of the lower bound by discrepancy proofs (0 unless a proof landed) |
| `distrust`, `distrustUp` | one-hop distrust and its upper bound `distrust + e` |
| `vetoCount` | anchors whose veto holds (live last feedback or certified bit) |
| `triggerTag`, `triggerTagName` | `keccak256(tag1)` of the worst live veto, and its name resolved through `header.set.tags`; `null` if none |
| `certBlock` | block of the certificate in force (0 = none) |

Suggested display: explorer column = `feedbackCount` + `naiveAverage`; contract column = `trustLowPct`
against `thetaPct`, `ePct` as the error bar, `status`, and the payer's verdict.

### 3.4 `payer` (kind `payment`)

```json
"payer": {
  "address": "0x…", "operator": "0x…", "payTo": "0x…", "amount": "10000",
  "decision": "REFUSED",
  "stage": "verify",
  "reason": "UNTRUSTED",
  "decide": "UNTRUSTED",
  "explain": { "reason": "UNTRUSTED", "status": "OK", "trustLow": "0", "distrustUp": "…", "triggerTag": null },
  "facilitator": { "verify": "FiatTokenV2: invalid signature", "settle": null },
  "settlementTx": null,
  "providerReceived": "0",
  "payerBalanceAfter": "90000"
}
```

| Field | Meaning |
|---|---|
| `decision` | `PAID` or `REFUSED` |
| `stage` | where it stopped: `decide` (view, soft check before signing), `verify` (facilitator simulation: `isValidSignature` refused), `settle` (estimate failed between verify and settle: nothing broadcast), `onchain` (settlement tx reverted), or `settled` |
| `reason` | `TrustGatedPayer.Reason` enum name: `OK`, `PAUSED`, `OVER_LIMIT`, `NO_WALLET`, `WALLET_MISMATCH`, `BAD_OPERATOR_SIG`, `ANCRE_STATUS`, `UNTRUSTED`, `DIGEST_MISMATCH`, `BAD_FORMAT`, `BAD_KIND` |
| `decide` | `payer.decide(agentId, payTo, amount)` before signing (enum name) |
| `explain` | `payer.explain(hash, blob)` at the attempt's block: the refusal rebuilt (AM-6.8, a refused x402 payment leaves no on-chain trace) |
| `settlementTx` | hash of the settlement transaction if one was broadcast, else `null` |
| `facilitator` | raw outcome of `/verify` and `/settle`: `"ok"` or the error text (`settle` is `null` when verify refused) |
| `providerReceived` | USDC base units actually received by `payTo` (balance delta) |

`block` of a payment event = the block whose state `/verify` was evaluated on (refusal), or the settlement
block (paid). A `REFUSED` event is only written for a refusal by the contract (stage `verify`, `explain.reason` ≠
`OK`); a facilitator or RPC failure stops the script instead of being logged as a refusal.

The hard guard is what the demo shows: a scene that tests a refusal **signs the payment anyway** (bypassing
the soft `decide` check) and records the facilitator's verify/settle outcome, so that a refusal is the
contract's, not the client's. `decide` is still recorded for the screen.

### 3.5 `certificate` (kind `certificate`)

```json
"certificate": {
  "action": "certified",
  "certBlock": 67312403, "nCert": 41, "rows": 37, "eEff": "…", "mass": "…",
  "graphRoot": "0x…", "txs": [{ "fn": "submitCertificate", "hash": "0x…", "gasLimit": "…", "gasUsed": "…" }],
  "computeMs": 412.3
}
```

`action` mirrors the certifier journal (`solver/certifier.py`): `certified`, `skip_identical`,
`deferred_replacement_rule`, `error`.

### 3.6 `latency` (scene 4, breaker; scene 3 duration)

```json
"latency": {
  "from": { "step": "4.2-slash", "block": 67312401, "wallMs": 1791382541902 },
  "to":   { "step": "4.4-refused", "block": 67312404, "wallMs": 1791382543312 },
  "blocks": 3, "ms": 1410,
  "parts": [ { "name": "slash -> certificate", "blocks": 2, "ms": 1100 },
             { "name": "certificate -> refusal", "blocks": 1, "ms": 310 } ],
  "measured": "fork"
}
```

Carried by the event that closes the measured interval. `measured` is `"fork"`, `"frozen"` or `"testnet"`:
only `"testnet"` latencies may be quoted as Monad numbers (anvil mines instantly).

## 4. Guarantees and non-guarantees

- Every `agent` block is read after the event's transaction, at its block: the screen can trust it as the state
  "just after". It is **not** re-read later; a later event about the same agent supersedes it.
- The log only records what the scripts did and read. It is not proof of anything: the chain is. Every
  `tx.hash` can be checked on the explorer (testnet) or against the fork.
- No secret ever appears in the log (no key, no keystore path, no password).

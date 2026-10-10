# Judge access and instructions

No account, wallet, key or funds are needed. Act 1 only reads Monad mainnet. Act 2 runs on a local fork of Monad
testnet, or fully offline from a frozen state. Commands are run from the repository root unless stated.

**Prerequisites** (≈ 5 min): Foundry ≥ 1.8 (`foundryup --install v1.8.3`; `anvil --network monad` models Monad's gas),
Node ≥ 23.8, Python 3.12.

```bash
export PATH="$PATH:$HOME/.foundry/bin"
(cd contracts && forge build)
(cd solver && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt)
(cd demo && npm ci)
```

## Act 1: the real ERC-8004 registry on Monad mainnet (read-only, ≈ 3 min)

**1. See the problem live** with `cast` (Monad mainnet RPC, no key needed):

```bash
RPC=https://rpc.monad.xyz
REP=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63   # ERC-8004 ReputationRegistry v2.0.0
cast call $REP "getVersion()(string)" --rpc-url $RPC                               # "2.0.0"
# The standard refuses to aggregate without a list of raters: Sybil filtering is left to the reader
cast call $REP "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 182 "[]" "" "" --rpc-url $RPC
#   -> execution reverted: clientAddresses required
# Agent #182 ("Eve-8004") has 7,665 distinct raters (a farm created at ~300 agents/hour)
cast call $REP "getClients(uint256)(address[])" 182 --rpc-url $RPC | tr ',' '\n' | wc -l
# ...and its raters' summary is the registry's maximum value, 1e38
C=$(cast call $REP "getClients(uint256)(address[])" 182 --rpc-url $RPC | tr -d '[] ' | cut -d, -f1-3)
cast call $REP "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 182 "[$C]" "" "" --rpc-url $RPC
#   -> 3, 1e38, 0
```

(Verified on 2026-10-06.)

**2. Reproduce ANCRE's verdict on the whole registry** (1 s, offline):

```bash
cd solver && .venv/bin/python run_mainnet.py      # rewrites solver/out/mainnet.md
```

Input: a **versioned snapshot** (`solver/data/`) of all 9,283 feedback entries, re-read on-chain with
`readAllFeedback`, plus the identity registry state at block 108,835,675. The snapshot never comes from an API;
provenance is in `solver/snapshot.py`. What the report shows:
- **(a) Eve-8004:** 7,665 feedback, naive average **1.53e36** (117 values at 1e38). Its ANCRE mass is **0**, from
  honest anchors and even with every tag treated as an endorsement.
- **(b) A plausible anchor that leaks trust** (a scanner rating agents it never used): without the
  endorsement/measurement split (D15), **34.6 %** of its mass flows into the farm region; with it, **0**.
- **(c) #8317:** 78 self-ratings by the agent's own wallet, all rejected.
- **(d) The only honest chain** in the real graph, with its exact certificate.

If you also have the authors' 8004scan snapshot, the report adds one line comparing it. Without it, every other
line is identical to the committed `solver/out/mainnet.md`.

## Act 2: our own traffic on Monad testnet (fork, ≈ 2 min; or offline)

The real ERC-8004 v2.0.0 registries of Monad testnet (`0x8004A818…BD9e`, `0x8004B663…8713`), the real testnet
USDC, our contracts (`AnchoredReputation`, `TrustGatedPayer`) and the chantier 04 certifier. The x402 facilitator is
emulated exactly as x402-rs does it (`eth_call` for `/verify`, then `eth_estimateGas` and a send with that limit).

```bash
cd demo
node run.ts            # forks testnet (needs internet), runs every scene, prints 30 checks and "ACT 2 PASS" (~30 s)
node run.ts --frozen   # scenes 1-7 with NO network: anvil loads demo/frozen/anvil-state.json (~20 s)
```

Keys are derived from a public seed. They are test keys and hold nothing of value.

| Scene | What you should see |
|---|---|
| 1 Honest providers | 2 providers, each vouched for by 2 of the 3 anchors, have mass ≈ 3.5-4 % (> θ = 1 %). The payer contract **pays** them over x402 |
| 7 Second hop | A trusted provider vouches for a third agent that **no anchor ever rated**. A one-hop trust list says "unknown"; ANCRE propagates the trust (mass 2.3 %) and the payer **pays** it |
| 2 Sybil farm | 10 agents rate each other and a target at the schema maximum. The **naive average is 100**, the **ANCRE mass is 0**, and the payer **refuses** at `/verify` (`UNTRUSTED`). A compromised anchor then vouches for the target: `trust > 0`, but leave-one-out (m = 2) leaves `trustRobust = 0`, so it is still refused |
| 3 The farm pays itself | 5 real x402 payments inside the farm, each USDC `Transfer` re-read from the receipt. True receipts, mass still 0, still refused. *A receipt can be true and still come from a farm* |
| 4 Breaker | An anchor slashes a provider that went bad. The **very next payment is refused** (`VETOED`), with no need to wait for a new certificate (the veto is read live). Then a recertification, and still refused |
| 5 Anti-erasure | A third party posts `review +1` on that provider. The naive average rises; the veto holds |
| 6 Fabricated certificate | A certificate claiming an edge that the registry does not hold is rejected at submission (`EdgeMismatch`). Every committed edge is re-read on-chain (Registry-verified) |

**Where the guard lives:** `TrustGatedPayer` is an ERC-1271 account that holds the USDC. During settlement, the
token calls its `isValidSignature`, which calls `AnchoredReputation.isTrusted(agentId, setId)`. A refusal is the
contract's, not the client's: the scripts sign the farm's payment anyway, and the refusal comes from `/verify`.
`explain()` rebuilds why.

**Outputs:**
- `demo/out/run-<ts>.json` is the event log the demo screen consumes. For every step it records the tx hash, the
  block, the agent's feedback count and naive average, and the ANCRE status, mass, bound and payer decision
  (format in `demo/EVENTS.md`).
- `demo/out/run-<ts>.budget.json` holds every transaction with its estimate, gas limit and gas used.

**Testnet deployment (real run of 2026-10-07, Monad testnet 10143, `ACT 2 PASS`, 8/8 scenes; log `docs/chantiers/rapports/act2-testnet/run-20261007T131141Z.json`):**

| What | Address / tx |
|---|---|
| `AnchoredReputation` | [`0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B`](https://testnet.monadscan.com/address/0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B) (deploy tx [`0xe8ce…147f`](https://testnet.monadscan.com/tx/0xe8cefce0e30f3f579614f82ae2068c2726964dbf9965bf954df0b8b5b5a0147f)) |
| `TrustGatedPayer` (ERC-1271) | [`0xC9Db7a72960189e933a6B876A9359b5c605a5870`](https://testnet.monadscan.com/address/0xC9Db7a72960189e933a6B876A9359b5c605a5870) |
| Anchor set (`setId`) | `0x627c8afe36b03432b280723a7170357333ded4d9ce56a78467c5829739653e10` (3 anchors, m = 2, θ = 1 %) |
| ERC-8004 registries (official testnet deployment) | Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| First certificate, Registry-verified (scene 1) | [`0xf815…8168`](https://testnet.monadscan.com/tx/0xf815f45c39cd3fb82f90f0898df1ae6a4f63da8d8580df7c9859d9dccfaa8168) |
| Honest provider paid through the x402 facilitator | [`0xf7fb…f9ff`](https://testnet.monadscan.com/tx/0xf7fbb89a8f11cef4a72a502b72aae329e2ab189ad8cb9bae56cb91b3c17ef9ff) |
| Second hop paid (never rated by an anchor) | [`0x0035…bdc3`](https://testnet.monadscan.com/tx/0x0035234795acfa054194d898bb4ec09e0be662b871a495f941871aeb0a73bdc3) |
| Anchor slashes provider-2 (breaker) | [`0x9fa7…2207`](https://testnet.monadscan.com/tx/0x9fa707e7c9ee2386c23d574f663e2f40ba60848dd3e2044f7c855a1a9e572207) |

**Measured on the testnet:** the breaker refuses the very next payment **one block and 260 ms after the slash**, with no new certificate needed (live veto). The Sybil farm (10 agents, 20 ratings at the schema maximum, 5 genuine x402 receipts between them) keeps a robust mass of 0 and is refused at every attempt; the fabricated certificate is rejected at submission (`EdgeMismatch`). Cost of the whole act: ≈ 3.3 testnet MON. Refusals leave no transaction (the payer's ERC-1271 check fails inside the facilitator's simulation): they are in the event log, not on the explorer.

See `demo/RUNBOOK.md` §5 for how it is run.

### Minimal act 2 on Monad mainnet (143)

One short run on the real mainnet (D40, D59): ANCRE and the payer deployed, the demo anchor set (3 anchors, m = 2,
θ = 1 %), one provider "demo" vouched for by 2 anchors and **paid by the real x402 facilitator**, the payer **refusing
to pay Eve-8004** (agent #182, the farm already on the registry: 7 665 feedbacks in the snapshot of 21/09), and the
breaker (an anchor slashes the provider, the next payment is refused). No scripted farm: the real one is enough.
The payer has three distinct addresses: owner (a human wallet), treasury, operator (the agent's key). The operator
can neither sweep the funds nor lift a pause: only the human owner can.

Replay it on a fork of mainnet (nothing sent; any owner address works for a replay):

```bash
cd demo
MAINNET_OWNER=0x000000000000000000000000000000000000dEaD node run.ts --rehearse-mainnet --sweep   # 23 checks, "MAINNET ACT PASS"
```

**Mainnet deployment** (to be filled from `demo/out/state-mainnet.json` and `run-<ts>.json` after the real run;
explorer https://monadscan.com):

| What | Address / tx |
|---|---|
| `AnchoredReputation` | _pending_ |
| `TrustGatedPayer` (ERC-1271; owner `0xD6Fa…4071`, treasury `0x0146…05B9`, operator `0x8107…3c3F`) | _pending_ |
| Anchor set (`setId`) | _pending_ |
| ERC-8004 registries (official mainnet deployment) | Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| provider-1 (demo), agent id | _pending_ |
| Certificate, Registry-verified (scene 1) | _pending_ |
| Honest provider paid through the x402 facilitator | _pending_ |
| Eve-8004 (#182) refused at `/verify` (`UNTRUSTED`): no transaction, see the event log | _pending (event `2.pay:eve`)_ |
| Anchor slashes provider-1 (breaker) | _pending_ |

## What to keep in mind (measured vs. claimed)

- **Trust is relative to the anchors the reader chooses.** ANCRE does not output a global score. A reader who
  anchors inside a farm trusts the farm (shown in report (a), "control" line).
- **On the real graph, ANCRE says "unknown" for almost everyone.** Few edges survive the tag schema (11 under the
  reference filter). Its job there is to stop the farm. The positive case needs real endorsements, which is why
  act 2 exists.
- **Latencies measured on a fork are not Monad numbers:** anvil mines instantly. On the fork, the breaker refusal
  holds from the state that includes the slash (0 blocks after its inclusion).
- **Registry-verified rejects fabricated or inflated edges at submission.** Omissions and dilution can still pass:
  the registry has no per-client index. They are provable after the fact (`proveEdge`, `contracts/PROOFS.md`), so
  we never say "unforgeable".
- **The farm is visibly small and labelled `demo`** (tags, agent URIs).

## Map

`contracts/` (verifier + payer, Foundry tests) · `solver/` (graph rules, PPR, certifier, act 1) · `demo/`
(act 2 scripts, `RUNBOOK.md`, `BUDGET.md`, `EVENTS.md`) · `indexer/` (Envio HyperIndex, testnet and mainnet) ·
`docs/erc/` (draft ERC).

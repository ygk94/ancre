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
node run.ts            # forks testnet (needs internet), runs scenes 0-6, prints 26 checks and "ACT 2 PASS" (~30 s)
node run.ts --frozen   # scenes 1-6 with NO network: anvil loads demo/frozen/anvil-state.json (~20 s)
```

Keys are derived from a public seed. They are test keys and hold nothing of value.

| Scene | What you should see |
|---|---|
| 1 Honest providers | 2 providers, each vouched for by 2 of the 3 anchors, have mass ≈ 3.5-4 % (> θ = 2 %). The payer contract **pays** them over x402 |
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

**Testnet deployment:** <!-- TODO (Hugo): after the real testnet run, paste the ANCRE, payer and setId addresses from demo/out/state-testnet.json, and the explorer links (https://testnet.monadscan.com/address/…). --> see `demo/RUNBOOK.md` §5 for how it is run.

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

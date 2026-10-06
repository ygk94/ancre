# Act 2 budget on Monad testnet (10143)

> Chantier 06, step E1, written 2026-10-06. **Nothing has been spent.** Every number comes from runs on a local
> fork (`anvil 1.8.3 --network monad`: Monad gas model, MIP-8 pages, gas limit billed), on the real ERC-8004 v2.0.0
> registries of the testnet. Labels: **MEASURED-FORK**, **MEASURED** (real network), **DOC** (Monad docs),
> **ESTIMATED**, **UNVERIFIED**. The measurements come from `cd demo && node run.ts --sweep`, which writes
> `demo/out/run-<ts>.budget.json`.

## 1. Assumptions

| | Value | Status |
|---|---|---|
| Testnet gas price | **102 gwei** (`cast gas-price`), base fee 100 gwei (`cast base-fee`) | MEASURED 2026-10-06 07:34 UTC |
| Billing | on the **gas limit**, not on the gas used | DOC (CLAUDE.md §7) |
| Gas limit of each tx | `ceil(eth_estimateGas × 1.10) + 5 000` | choice (`lib/chain.ts`) |
| Farm size | 10 agents + 1 target, 5 payments inside the farm (D45) | choice (`lib/config.ts`, `ANCRE_FARM_SIZE`) |
| Monad reserve balance | below 10 MON, a value transfer that ends under the reserve reverts, except once per 3-block window (non-delegated account). The consensus checks fees against the balance seen 3 blocks earlier | DOC (docs.monad.xyz/developer-essentials/reserve-balance, vault note) |

## 2. Measured unit costs (billed gas limit)

MEASURED-FORK on 2026-10-06, fork of block 68 628 2xx, full run of the 7 scenes (`run-20261006T074828Z`).

| Transaction | n | Avg gas limit (min-max) | Avg gas used | MON at 102 gwei (total) |
|---|---|---|---|---|
| Deploy `AnchoredReputation` + `TrustGatedPayer` | 2 | 8 015 569 and 2 385 083 | 4 723 023 | 1.061 |
| `registerAnchorSet` (k = 3, 3 tags) | 1 | 552 467 | 497 697 | 0.056 |
| `register(agentURI)` (~230-byte `data:` URI) | 13 | 376 803 (373 869-392 919) | 333 444 | 0.500 |
| `setAgentWallet` | 13 | 96 777 | 82 808 | 0.128 |
| `giveFeedback` | 27 | 314 845 (222 939-326 950) | 277 954 | 0.867 |
| `submitCertificate` (chantier 04 certifier, ≤ 20 nodes) | 4 | 569 467 (488 139-657 250) | 525 085 | 0.232 |
| MON (15) and USDC (6) transfers | 21 | 53 022 | 43 436 | 0.114 |
| **All our transactions** | **81** | **29 001 846** | | **2.958** |

Why `register` costs more here: chantier 05 measured 221 k gas used, against a 377 k limit here. Our URI is a
self-describing `data:` URI that labels the agent "demo" in any explorer, and the limit includes the 10 % margin.
A short URI would save about 0.2 MON. We keep the self-describing one.

## 3. The two envelopes

### Envelope 1: fees (spent)

| Item | MON |
|---|---|
| Our 81 transactions, all scenes (§2) | 2.958 (MEASURED-FORK, limits × 102 gwei) |
| Final sweep (`--sweep`): 15 transfers × 21 000 gas | 0.032 (computed) |
| **Total fees** | **≈ 2.99 MON** |
| With a 30 % margin (gas price, one replayed scene) | **≈ 3.9 MON** |

### Envelope 2: capital (lent, then recovered)

Each emitting account receives from the operator the MON for its own fees: its measured limits × 1.5, at 102 gwei
(`run.ts`). What it does not spend is **swept back to the operator** by `--sweep` at the end.

| Account | Transactions | Lent (MON) |
|---|---|---|
| anchor-A / anchor-B / anchor-C | 1 / 3 / 2 feedback | 0.051 / 0.151 / 0.101 |
| Farm owner | 11 `register` + 11 `setAgentWallet` | 0.833 |
| 10 farm wallets | 2 feedback each | 10 × 0.101 = 1.010 |
| Third-party rater (scene 5) | 1 feedback | 0.050 |
| **Total lent** | | **2.196 MON** (MEASURED-FORK, `capitalLentToEmittersMon`) |
| Spent by these accounts (already in envelope 1) | | ≈ 1.40 MON |
| **Recoverable after the demo** | | **≈ 0.80 MON** (ESTIMATED: lent − spent − sweep) |

**The 10 MON reserve locks nothing more**: no account needs to stay above 10 MON. Below the reserve, the rule only
spaces value transfers. `lib/chain.ts` waits 3 blocks between two transfers from the same account, and 3 blocks
after funding an account before its first transaction. This adds about 15 × 1.2 s on the testnet.

### What the operator must hold at the start

| | MON |
|---|---|
| The operator's own fees (deployments, set, 2 providers, certificates, transfers) | 1.56 (MEASURED-FORK, per account) |
| Capital lent to the 15 other emitters | 2.20 |
| Margin | 1.24 |
| **Recommended starting balance** | **5 MON testnet** |
| **Testnet USDC** | **0.11 USDC** (0.1 deposited in the payer + 5 × 0.002 for the farm); ask the faucet for 1 USDC |

Dress rehearsal (`node run.ts --rehearse-testnet --keystore … --sweep`, MEASURED-FORK 06/10). Same code path as the
testnet, interval mining at 1 s, operator funded with **5 MON only**. All 7 scenes PASS, 2.18 MON recovered by the
sweep. The fork's gas price is about 4 gwei, so this rehearsal checks the flow and the waits, not the 102 gwei bill.

## 4. What others pay

- **The x402 facilitator** (`x402-facilitator.molandak.org`, signer `0x7f6a…Db86`) settles 3 payer payments and
  5 payments inside the farm. That is **1 843 982 gas of limits, ≈ 0.19 MON, paid by the facilitator**
  (MEASURED-FORK, facilitator emulated the way x402-rs works). Refusals at `/verify` cost nothing: no transaction
  is sent.
- **Envio** (free plan, 100 000 events, ~55 800 already used according to the pilot). One full run emits
  **92 registry events** (MEASURED-FORK, `eventsByContract`):
  - 65 on the Identity registry: `Registered`, `Transfer`, `MetadataSet`;
  - 27 `NewFeedback` on the Reputation registry.

  Against the 25 000 cap, that is **more than 250 runs**. No risk.

## 5. Number of accounts

**16 emitting accounts** (MEASURED-FORK, `sendingAccounts`):
- the operator;
- 3 anchors (m = 2 needs at least 2 honest anchors, plus one compromised in scene 2);
- the farm owner;
- 10 farm wallets;
- 1 third-party rater.

The provider wallets, the target wallet and the payer's operator key only sign, so they need no MON.

Absolute minimum: 6 + N, with N the farm size. Each farm agent costs about 0.11 MON (`register`,
`setAgentWallet`, 2 feedback), so about 1.1 MON for N = 10. With N = 5 (`ANCRE_FARM_SIZE=5`), the scene stays
readable (naive average 100 over 5 feedback) and costs about 0.55 MON less. We keep N = 10 for the visual contrast.

## 6. What a fork cannot measure

- **The gas price on the day.** 102 gwei was MEASURED on 06/10, and the base fee can rise. The 30 % margin covers it.
- **The real testnet's `eth_estimateGas` against anvil `--network monad`.** A gap larger than the 10 % margin would
  make a transaction fail, and it would still pay its limit. Not observed in chantier 05 (T1 prepared, not run).
  UNVERIFIED.
- **The faucets** (https://faucet.monad.xyz, https://faucet.circle.com). Amounts and cooldowns are UNVERIFIED.
- **The real facilitator with the ERC-1271 payer.** This is gate P3 (test T1), still waiting for Hugo. If it fails,
  scenes 1 and 4 (honest payments settled) fail on the testnet. The refusals are still observed, since they need no
  transaction.

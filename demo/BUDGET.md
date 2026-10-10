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

MEASURED-FORK on 2026-10-06, fork of block 68 682 336, full run of the 8 scenes (`run-20261006T121308Z`, the rehearsal of the frozen state).

| Transaction | n | Avg gas limit (min-max) | Avg gas used | MON at 102 gwei (total) |
|---|---|---|---|---|
| Deploy `AnchoredReputation` + `TrustGatedPayer` | 2 | 8 015 569 and 2 385 083 | 4 723 023 | 1.061 |
| `registerAnchorSet` (k = 3, 3 tags) | 1 | 552 467 | 497 697 | 0.056 |
| `register(agentURI)` (~230-byte `data:` URI) | 14 | 376 598 (373 869-392 919) | 333 260 | 0.538 |
| `setAgentWallet` | 14 | 96 781 | 82 812 | 0.138 |
| `giveFeedback` | 28 | 314 847 (222 939-339 019) | 277 955 | 0.899 |
| `submitCertificate` (chantier 04 certifier, ≤ 20 nodes) | 5 | 596 008 (488 139-648 650) | 549 774 | 0.304 |
| MON (16) and USDC (6) transfers | 22 | 51 889 | 42 416 | 0.116 |
| **All our transactions** | **86** | **30 517 760** | | **3.113** |

Why `register` costs more here: chantier 05 measured 221 k gas used, against a 377 k limit here. Our URI is a
self-describing `data:` URI that labels the agent "demo" in any explorer, and the limit includes the 10 % margin.
A short URI would save about 0.2 MON. We keep the self-describing one.

## 3. The two envelopes

### Envelope 1: fees (spent)

| Item | MON |
|---|---|
| Our 86 transactions, all scenes (§2) | 3.113 (MEASURED-FORK, limits × 102 gwei) |
| Final sweep (`--sweep`): 16 transfers × 21 000 gas | 0.034 (computed) |
| **Total fees** | **≈ 3.15 MON** |
| With a 30 % margin (gas price, one replayed scene) | **≈ 4.1 MON** |

### Envelope 2: capital (lent, then recovered)

Each emitting account receives from the operator the MON for its own fees: its measured limits × 1.5, at 102 gwei
(`run.ts`). What it does not spend is **swept back to the operator** by `--sweep` at the end.

| Account | Transactions | Lent (MON) |
|---|---|---|
| anchor-A / anchor-B / anchor-C | 1 / 3 / 2 feedback | 0.051 / 0.151 / 0.101 |
| Farm owner | 11 `register` + 11 `setAgentWallet` | 0.833 |
| 10 farm wallets | 2 feedback each | 10 × 0.101 = 1.010 |
| Third-party rater (scene 5) | 1 feedback | 0.050 |
| provider-1 wallet (scene 7, second hop) | 1 feedback | 0.050 |
| **Total lent** | | **2.247 MON** (MEASURED-FORK, `capitalLentToEmittersMon`) |
| Spent by these accounts (already in envelope 1) | | ≈ 1.43 MON |
| **Recoverable after the demo** | | **≈ 0.80 MON** (ESTIMATED: lent − spent − sweep) |

**The 10 MON reserve locks nothing more**: no account needs to stay above 10 MON. Below the reserve, the rule only
spaces value transfers. `lib/chain.ts` waits 3 blocks between two transfers from the same account, and 3 blocks
after funding an account before its first transaction. This adds about 15 × 1.2 s on the testnet.

### What the operator must hold at the start

| | MON |
|---|---|
| The operator's own fees (deployments, set, 3 providers, certificates, transfers) | 1.68 (MEASURED-FORK, per account) |
| Capital lent to the 16 other emitters | 2.25 |
| Margin | 1.07 |
| **Recommended starting balance** | **5 MON testnet** |
| **Testnet USDC** | **0.11 USDC** (0.1 deposited in the payer + 5 × 0.002 for the farm); ask the faucet for 1 USDC |

Dress rehearsal (`node run.ts --rehearse-testnet --keystore … --sweep`, MEASURED-FORK 06/10). Same code path as the
testnet, interval mining at 1 s, operator funded with **5 MON only**. All 7 scenes PASS, 2.18 MON recovered by the
sweep. The fork's gas price is about 4 gwei, so this rehearsal checks the flow and the waits, not the 102 gwei bill.

## 4. What others pay

- **The x402 facilitator** (`x402-facilitator.molandak.org`, signer `0x7f6a…Db86`) settles 4 payer payments and
  5 payments inside the farm. That is **2 170 424 gas of limits, ≈ 0.22 MON, paid by the facilitator**
  (MEASURED-FORK, facilitator emulated the way x402-rs works). Refusals at `/verify` cost nothing: no transaction
  is sent.
- **Envio** (free plan, 100 000 events, ~55 800 already used according to the pilot). One full run emits
  **98 registry events** (MEASURED-FORK, `eventsByContract`):
  - 70 on the Identity registry: `Registered`, `Transfer`, `MetadataSet`;
  - 28 `NewFeedback` on the Reputation registry.

  Against the 25 000 cap, that is **about 250 runs**. No risk.

## 5. Number of accounts

**17 emitting accounts** (MEASURED-FORK, `sendingAccounts`):
- the operator;
- 3 anchors (m = 2 needs at least 2 honest anchors, plus one compromised in scene 2);
- the farm owner;
- 10 farm wallets;
- 1 third-party rater;
- provider-1's wallet (it vouches for provider-3 in scene 7, the second hop).

The provider wallets, the target wallet and the payer's operator key only sign, so they need no MON.

Absolute minimum: 7 + N, with N the farm size. Each farm agent costs about 0.11 MON (`register`,
`setAgentWallet`, 2 feedback), so about 1.1 MON for N = 10. With N = 5 (`ANCRE_FARM_SIZE=5`), the scene stays
readable (naive average 100 over 5 feedback) and costs about 0.55 MON less. We keep N = 10 for the visual contrast.

## 6. What a fork cannot measure

- **The gas price on the day.** 102 gwei was MEASURED on 06/10, and the base fee can rise. The 30 % margin covers it.
- **The real testnet's `eth_estimateGas` against anvil `--network monad`.** A gap larger than the 10 % margin would
  make a transaction fail, and it would still pay its limit. Not observed in chantier 05 (T1 prepared, not run).
  UNVERIFIED.
- **The faucets** (https://faucet.monad.xyz, https://faucet.circle.com). Amounts and cooldowns are UNVERIFIED.
- **The real facilitator with the ERC-1271 payer.** This is gate P3 (test T1), still waiting for Hugo. If it fails,
  scenes 1, 4 and 7 (honest payments settled) fail on the testnet. The refusals are still observed, since they need no
  transaction.

## 7. Minimal mainnet run (143), D40 + D59

> Written 2026-10-10. **Nothing has been sent to the mainnet by us.** Source: the rehearsal
> `MAINNET_OWNER=0xD6Fa…4071 node run.ts --rehearse-mainnet --sweep` on a fork of mainnet block **112 175 382**
> (anvil 1.8.3 `--network monad`, interval mining at 1 s, base fee **pinned at 100 gwei** so that the fork pays the
> mainnet bill: anvil otherwise lets it decay on empty blocks). Archive: `docs/chantiers/rapports/mainnet-rehearsal/`
> (`run-20261010T115315Z.*`, 23 checks PASS).

### Assumptions

| | Value | Status |
|---|---|---|
| Mainnet gas price | **102 gwei** (`cast gas-price --rpc-url https://rpc.monad.xyz`) | MEASURED 10/10 (D59) |
| Mainnet base fee | **100 gwei** (`cast base-fee`, fork of block 112 172 900) | MEASURED 10/10 |
| Effective price on the rehearsal | 101 gwei (100 + 1 tip) for every transaction | MEASURED-FORK 10/10 |
| Billing | the gas **limit**: Σ limit × price = 1.515 MON, Σ used × price = 1.371 MON, the operator's balance moved by the first | MEASURED-FORK 10/10 |
| Scenes | 0 setup, 1 honest provider paid, 2 Eve-8004 refused, 4 breaker (slash, refused, recertified, refused) | choice (D40) |
| Accounts that send | **3**: the operator (`ancre-demo`), anchor-A, anchor-B. anchor-C is in the set but sends nothing | MEASURED-FORK |

### Measured transactions (billed gas limit)

| Transaction | Gas limit | MON at 102 gwei |
|---|---|---|
| Deploy `AnchoredReputation` | 9 394 299 | 0.958 |
| Deploy `TrustGatedPayer` (owner, treasury, operator distinct) | 2 408 511 | 0.246 |
| `registerAnchorSet` (k = 3, 3 tags) | 552 671 | 0.056 |
| `register` + `setAgentWallet` (provider-1) | 392 919 + 96 784 | 0.050 |
| `giveFeedback` × 3 (2 vouches, 1 slash) | 326 950 + 307 954 + 222 939 | 0.087 |
| `submitCertificate` × 2 (after the vouches; carrying the veto) | 663 872 + 348 586 | 0.103 |
| Transfers: MON × 2 to the anchors, USDC to the payer, USDC rest to the treasury | 28 100 × 2 + 115 315 + 115 341 | 0.029 |
| **14 transactions** | **15 002 341** | **1.530** |
| Sweep of the 2 anchors (21 000 each, not in the ledger) | 42 000 | 0.004 |

### Envelopes

| | MON |
|---|---|
| Fees, all our transactions (MEASURED-FORK, limits × 102 gwei) | **1.53** |
| With the +30 % margin shown by the script before it sends | 2.00 |
| Capital lent to anchor-A / anchor-B (1.5 × their limits) | 0.156, of which **0.064 swept back** |
| **Operator balance consumed by the rehearsal** (4 → 2.480 MON) | **1.520** (MEASURED-FORK) |
| Required before the start (the script stops below it) | 2.04 MON and 0.03 USDC |

Budget D59: 4 MON sent, ≤ 2.5 MON of fees and capital. **Spent: 1.52 MON (MEASURED-FORK), margin ≈ 1 MON.** The
operator held **15 MON** on mainnet on 10/10 (MEASURED, `cast balance`, ≈ 11:55 UTC), above the 10 MON reserve: the
reserve waits of `lib/chain.ts` then do not trigger for the operator.

USDC: **0.03 USDC** deposited in the payer, **0.01** paid to provider-1, **0.02 left in the payer** (only the owner or
the treasury can `sweep` it, RUNBOOK §7). `--sweep` sends the rest of the operator's USDC (0.97 in the rehearsal)
to the treasury, so that the agent's key holds no USDC (AM-6.9).

### What others pay

- **The facilitator** (`0x7f6a…Db86`, the same signer on 143 and 10143, `GET /supported` 10/10; 94 344 MON on
  mainnet, MEASURED 10/10): one settlement, **403 417 gas ≈ 0.041 MON** (MEASURED-FORK, emulated as x402-rs does it).
  The two refusals (Eve, the vetoed provider) and the refusal after recertification fail at `/verify`: no transaction.
- **Envio**: the mainnet indexer sees 8 registry events (5 Identity, 3 Reputation), MEASURED-FORK.

### What the fork cannot tell

- The real facilitator on **mainnet** with the ERC-1271 payer: it worked on the testnet on 07/10 (same binary
  presumably, same signer), UNVERIFIED on 143. If `/settle` fails, scene 1 stops at "expected PAID"; Eve's refusal
  and the breaker do not depend on it.
- `eth_estimateGas` of `rpc.monad.xyz` against anvil's: on the testnet run of 07/10 the limits matched within the
  10 % margin; UNVERIFIED on mainnet.
- The gas price on the day: the script reads it and budgets at max(live, 102 gwei).

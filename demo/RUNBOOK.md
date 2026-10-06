# ANCRE act 2 — runbook

Act 2 = our own traffic on the real ERC-8004 v2.0.0 registries of Monad testnet (10143): honest providers paid, a
Sybil farm refused, the farm paying itself and still refused, a breaker, anti-erasure, a fabricated certificate
rejected, and a second hop (D50) paid. Everything below was run on 2026-10-06 (chantier 06); timings are MEASURED on this machine unless marked.

| Goal | Command (from `demo/`) | Network | Time |
|---|---|---|---|
| Replay the whole act on a fork | `node run.ts` | reads testnet state through the fork | 27 s (MEASURED 06/10, anvil start included) |
| Replay scenes 1-7 with **no network at all** | `node run.ts --frozen` | none | 20 s (MEASURED 06/10) |
| Resumable rehearsal | `node fork.ts` + `node run.ts --rpc http://127.0.0.1:8549` | fork | ~30 s |
| Dress rehearsal of the testnet run | `node run.ts --rehearse-testnet --keystore <ks> --sweep` | fork, interval mining | 166 s at 1 s blocks (MEASURED 06/10) |
| **Real testnet** (Hugo's go-ahead only) | `node run.ts --network testnet --keystore <ks> --sweep` | Monad testnet | 3-5 min (ESTIMATED) |

## 1. Prerequisites (≈ 5 minutes, once)

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup --install v1.8.3   # >= 1.8: anvil --network monad
export PATH="$PATH:$HOME/.foundry/bin"
node --version                      # >= 23.8 (TypeScript runs directly; zstd for --freeze). Tested: 25.2.1
cd contracts && forge build && cd ..
cd solver && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
cd demo && npm ci
```

`demo/` runs TypeScript with Node's type stripping (no build step) and calls the chantier 04 certifier through
`demo/certify.py` (`ANCRE_PYTHON` overrides `solver/.venv/bin/python`).

## 2. Replay act 2 on a fork (< 15 minutes from a fresh clone: MEASURED 78 s, build included, 06/10)

```bash
cd demo
node run.ts
```

The script starts its own `anvil --network monad` fork of the testnet (port 8549; it refuses to start if the
port is taken), runs scenes 0, 1, 7, 2, 3, 4, 5, 6 (in that order), checks 30 expected results, and prints `ACT 2 PASS`. The keys are derived
from a **public** seed: they are test keys with no value, and must never be funded on a real network.

Outputs (`demo/out/`, ignored by git):
- `run-<ts>.jsonl` / `run-<ts>.json` / `latest.json`: the event log for the demo screen (format: `EVENTS.md`);
- `run-<ts>.budget.json`: every transaction with its estimate, gas limit and gas used (source of `BUDGET.md`);
- `state-fork.json`: the resume state; `fork/certifier.jsonl`: the certifier's own journal.

What each scene must show (checked by the script, see `scene-end` events):

| Scene | Expected |
|---|---|
| 0 setup | ANCRE and the payer deployed, set registered (`computeSetId` = the certifier's setId), first certificate |
| 1 honest | 2 providers, 2 anchor vouches each → `OK`, trusted, masses ≈ 3.5-4 % > θ = 1 % → **PAID** |
| 7 second hop (D50) | provider-1 (vouched by 2 anchors) vouches for provider-3, whom **no anchor ever rated** → mass 2.3 % > θ → **PAID** (a one-hop trust list would say "unknown") |
| 2 farm | 10 agents rate each other and the target at 100 → naive average **100**, ANCRE mass **0**, payer **refuses (UNTRUSTED)**; then a compromised anchor vouches: `trust > 0` but `trustRobust = 0` (leave-one-out, m = 2) → still refused |
| 3 farm pays itself (D45) | 5 x402 payments inside the farm, each receipt's USDC `Transfer` re-read on-chain → masses still 0, refusal holds |
| 4 breaker | provider-2 paid, anchor-B slashes it → **refused at the very next payment (VETOED, ANCRE_STATUS)**, then recertified, still refused; latency in the `4.latency` event |
| 5 anti-erasure (D33) | a third party posts `review +1` on provider-2 → naive average goes up, still **VETOED** |
| 6 fabricated certificate | a certificate with an edge the registry does not hold → **`EdgeMismatch`** at submission (simulated, nothing sent) |

## 3. Resume after a failure

Every step is recorded in `out/state-<mode>.json` when it completes; a step already done is skipped.
- On your own long-lived fork: `node fork.ts` (terminal 1), then `node run.ts --rpc http://127.0.0.1:8549`
  (terminal 2). Re-run the same command after a failure: it resumes at the failed step. `--scenes 2-4` runs a subset.
- `node run.ts` alone starts a **fresh** fork and a fresh state each time (pass `--resume` to keep the state, which
  only makes sense with `--rpc`).
- Limit: a crash between a transaction's inclusion and the state write replays that transaction (for a
  `register`, one extra demo agent). Harmless on a fork; on the testnet, check the explorer before re-running.

## 4. Frozen demo (D28): no RPC at all

`demo/frozen/` (tracked) holds an anvil state taken right after the setup, made self-contained: the dump plus every
remote account and slot that scenes 1-7 read (implementations behind the ERC-8004 and USDC proxies included).

```bash
node run.ts --frozen        # anvil --load-state frozen/anvil-state.json, no --fork-url: scenes 1-7, offline
node run.ts --freeze        # regenerate it (pinned fork, setup, dump, rehearsal of 1-7, merge with the fork cache)
```

`frozen/meta.json` records the fork block and the rehearsal it was built from. The frozen chain does not depend on
the testnet's future state, on an archive RPC, or on a registry upgrade.

## 5. Real testnet run (🧑 needs Hugo's explicit go-ahead)

Cost (`BUDGET.md`): ≈ 3.15 MON of fees (≈ 4.1 with margin), 2.25 MON lent to the emitters and ≈ 0.8 MON swept back,
0.11 USDC. **Start with 5 MON and 1 USDC testnet on the operator.** About 98 Envio events.

1. **Create the operator keystore** (its key is the seed of every demo account; use it for nothing else):
   ```bash
   mkdir -p ~/.foundry/keystores
   cast wallet new ~/.foundry/keystores          # asks for a password, prints the address and the file name
   mv ~/.foundry/keystores/<uuid> ~/.foundry/keystores/ancre-demo
   ```
2. **Fund it**: https://faucet.monad.xyz (MON) and https://faucet.circle.com (USDC, network Monad testnet).
   ```bash
   cast balance <operator> -e --rpc-url https://testnet-rpc.monad.xyz            # >= 5
   cast call 0x534b2f3A21130d7a60830c2Df862319e593943A3 "balanceOf(address)(uint256)" <operator> \
     --rpc-url https://testnet-rpc.monad.xyz                                      # >= 110000 (0.11 USDC)
   ```
3. **Dress rehearsal with the same keystore**, on a fork (nothing is sent to the testnet or to any service):
   ```bash
   node run.ts --rehearse-testnet --keystore ~/.foundry/keystores/ancre-demo --sweep
   ```
4. **Real run**, at an interactive terminal: type the confirmation phrase, then the keystore password (or set
   `ANCRE_DEMO_PASSWORD` for that shell only; it is never written anywhere by the scripts):
   ```bash
   node run.ts --network testnet --keystore ~/.foundry/keystores/ancre-demo --sweep
   ```
   Payments are settled by the real x402 facilitator (`https://x402-facilitator.molandak.org`), which pays their gas.
   **Prerequisite: the T1 test (gate P3, chantier 05) has not been run yet.** If the facilitator does not accept
   the ERC-1271 payer, scenes 1, 4 and 7 stop at their first honest payment ("expected PAID"). The refusals are still
   valid, but the act is incomplete; fall back to the fork for the video.
5. **If it stops**: run the same command again; it resumes from `out/state-testnet.json` (see §3 for the limit).
6. **Check it**:
   - addresses: `out/state-testnet.json` (`ancre`, `payer`, `setId`, `agents`);
   - transactions: `out/run-<ts>.json`, every `tx.hash` on https://testnet.monadscan.com (answered HTTP 200 on 06/10; other explorers answered 403 to curl);
   - the Envio indexer (testnet is indexed):
     ```bash
     curl -s -X POST https://indexer.dev.hyperindex.xyz/433cc83/v1/graphql -H 'content-type: application/json' \
       -d '{"query":"{ Feedback(where:{tag2:{_eq:\"demo\"}}, order_by:{blockNumber:desc}, limit:50){ client tag1 value blockNumber agent { id } } }"}'
     ```
7. `--sweep` sends the unspent MON of the 16 emitters back to the operator (`node run.ts --network testnet
   --keystore … --sweep-only` does only that).

Nothing is ever sent to the mainnet by these scripts (D40: a minimal mainnet run is a separate decision).

## 6. Options

| Option | Effect |
|---|---|
| `--scenes 0,2-4` | subset of scenes, run in the given order (default `all` = 0,1,7,2,3,4,5,6; `1,7,2-6` with `--frozen`) |
| `--port N` | anvil port (8549; 8550 for `--frozen`) |
| `--fork-block N` | pin the fork |
| `--sweep` / `--sweep-only` | recover the emitters' MON after the scenes / only that |
| `ANCRE_FARM_SIZE`, `ANCRE_FARM_PAYMENTS` | farm size (10) and payments inside the farm (5) |

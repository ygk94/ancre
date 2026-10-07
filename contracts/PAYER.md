# TrustGatedPayer — the x402 payer that refuses to pay

> This is the `ROUTER.md` of brief 05. Contract: `src/TrustGatedPayer.sol`. Tests: `test/TrustGatedPayer.t.sol`
> (unit, mocks), `test/TrustGatedPayerFork.t.sol` (fork of Monad testnet and mainnet). T1 tooling: `script/t1/`,
> `../plugin/scripts/t1.mjs`. Labels: MEASURED-FORK (forge, `network = "monad"`), MEASURED (real RPC read),
> ESTIMATED. Dates: 2026-10-01.

## 1. What it is

A keyless ERC-1271 account that holds the USDC. An operator key (the agent's wallet, e.g. the MetaMask Agent
Wallet) signs one EIP-712 `AncrePayment` per payment. During the facilitator's settlement transaction, the USDC
(EIP-3009, scheme `exact`) or Permit2 (scheme `upto`) calls `isValidSignature`, and the payer answers
`0x1626ba7e` only if, at that block:

1. the presented hash is the token authorisation rebuilt from the blob, with `from = payer`;
2. the payer is not paused, and `value` (or the `upto` cap) is `<= maxPerPayment`;
3. `payTo == IdentityRegistry.getAgentWallet(agentId)`;
4. an operator signed the `AncrePayment`;
5. `AnchoredReputation.passesAnchorPolicy(agentId, setId)` is true. **Never the status alone**: an unknown agent is `OK`
   with trust 0 (AM-6.1). θ, ρ, m, q, maxAge and eLowMax are committed in the `setId` (D39); the payer stores
   only `(setId, maxPerPayment)`.

Nothing changes in x402, the facilitator or the token. Funds leave only through a guarded authorisation or
`sweep` to the immutable `treasury`. The only way around the gate is a plain `transfer` by a key that holds
USDC (AM-6.9), so the agent's own wallet must hold none.

## 2. Messages

**Operator signature** (domain `{name: "ANCRE TrustGatedPayer", version: "1", chainId, verifyingContract: payer}`):

```
AncrePayment(address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint256 agentId)
AncreUptoPayment(address to,uint256 cap,uint256 nonce,uint256 deadline,address facilitator,uint256 validAfter,uint256 agentId)
AncreCancel(bytes32 nonce)
```

ECDSA, 65 bytes, low `s`, `v ∈ {27, 28}`. A signature is valid for one payer on one chain.

**Blob** (the x402 `payload.signature`; `abi.encodePacked`, fixed length, parsed without `abi.decode`, so
`isValidSignature` never reverts; > 65 bytes, so x402-rs classifies it as EIP-1271):

| kind | layout | length |
|---|---|---|
| 1 `exact` (EIP-3009) | `0x01 · agentId u256 · to addr · value u256 · validAfter u256 · validBefore u256 · nonce b32 · opSig 65` | 246 |
| 2 `upto` (Permit2 witness, `x402UptoPermit2Proxy`) | `0x02 · agentId · to · cap u256 · p2Nonce u256 · deadline u256 · facilitator addr · validAfter u256 · opSig` | 266 |
| 3 cancel (EIP-3009 `cancelAuthorization`) | `0x03 · nonce b32 · opSig` | 98 |

Digests the payer can validate: `TransferWithAuthorization(from = payer, …)` in the USDC domain,
`PermitWitnessTransferFrom(token = USDC, spender = uptoProxy, Witness{to, facilitator, validAfter})` in the
Permit2 domain, and `CancelAuthorization(payer, nonce)`. **Nothing else**: EIP-2612 `permit`, Permit2
`PermitSingle`/`PermitBatch`, `receiveWithAuthorization` all go through ERC-1271 and are refused (tested
against the real USDC and Permit2 in fork).

**x402 payload** (v2): identical to an EOA payment except `authorization.from = payer` and
`signature = blob`.

## 3. Flow (`exact`, default x402 `authorization` flow)

1. `GET resource` → 402 + `PAYMENT-REQUIRED`.
2. Client: `payer.decide(agentId, payTo, amount)` (view). If it is not `OK`, stop and sign nothing (soft guard).
3. Operator signs `AncrePayment`; the client sends `PAYMENT-SIGNATURE`.
4. `/verify`: the facilitator simulates `transferWithAuthorization(…, bytes)` → **ANCRE check 1**.
5. Handler runs. `/settle`: `eth_estimateGas` → **check 2**. If a veto landed meanwhile, the estimate fails and
   **nothing is broadcast** (no trace on-chain, AM-6.8). Otherwise the tx is sent and the USDC calls back →
   **check 3**, in the block of inclusion.
6. Refusals are rebuilt with `explain(hash, blob)` (eth_call at the attempt's block), or traced on-chain with
   `reportRefusal(hash, blob)`: once per authorisation, only for a genuine operator-signed authorisation that
   is still settleable (unused nonce, inside its window).

## 4. Refusal reasons (`Reason`)

| Reason | When | The agent should |
|---|---|---|
| `OK` | all checks pass | pay |
| `PAUSED` | owner (or an operator) paused | stop, tell the human |
| `OVER_LIMIT` | value / cap > `maxPerPayment` | ask the human; never split |
| `NO_WALLET` | `getAgentWallet` unreadable or 0 (cleared by a transfer) | not pay |
| `WALLET_MISMATCH` | payTo ≠ agentWallet(agentId) | not pay: suspicious offer |
| `BAD_OPERATOR_SIG` | signer not an operator, high-s, bad v | check the mm login method |
| `ANCRE_STATUS` | status ≠ OK: `NO_CERT`, `STALE`, `TRANSFERRED`, `VETOED` (`triggerTag` = keccak256(tag1)), `REGISTRY_CHANGED` | not pay |
| `UNTRUSTED` | status OK but `passesAnchorPolicy` false (unknown agent, below θ/ρ) | not pay |
| `DIGEST_MISMATCH`, `BAD_FORMAT`, `BAD_KIND` | not a payment of this payer for this hash | internal error |

## 5. Gas (MEASURED-FORK, 2026-10-01, testnet block 67 259 340 and mainnet 109 610 142, ±25 gas between them)

Billed gas of the facilitator's settlement transaction, k = 2 anchors, open Registry-verified set, real
registries, USDC, Permit2:

| Transaction | Gas | MON at 102 gwei |
|---|---|---|
| EOA reference, `(v,r,s)`, payee already credited | 144 605 | 0.0147 |
| **Guarded `exact`, trusted agent, payee already credited** | **327 909** | **0.0334** |
| Guarded `exact`, payee balance 0 → x | 344 884 | 0.0352 |
| Guarded `upto` (Permit2) | 385 876 | 0.0394 |
| `isValidSignature` alone, marginal: trusted / farm refused / vetoed | 236 497 / 151 359 / 227 579 | — |
| `reportRefusal` (vetoed) | 288 772 | 0.0295 (paid by the caller) |
| Payer deployment (anvil `--network monad`, testnet fork) | 2 173 455 | 0.222 |
| `approvePermit2` (once, for `upto`) | 106 081 | 0.011 |

Gas price 102 gwei: MEASURED on both networks (`cast gas-price`, 27/09 and 01/10). Monad bills the gas limit:
the facilitator uses `eth_estimateGas`, so the limit tracks the real cost. The overhead of the gate is about
**+183 k gas ≈ 0.019 MON per payment**, paid by the facilitator. That is fine for a demo; it is a real cost at
volume (an x402 facilitator subsidising 2.3× the gas of an EOA payment).

## 6. Test T1 (gate P3): the real facilitator

What a fork cannot tell: does the **deployed** x402-rs binary accept an ERC-1271 payer end to end, what gas
limit does it set (is there a cap?), and what does it answer on a refusal?

**Dry run (done, no transaction)**: `cd ../plugin && npm run build && node scripts/t1.mjs --local`. An
`anvil --network monad` fork of the testnet; the facilitator emulated as x402-rs does it (`eth_call`, then
`eth_estimateGas`, then a send with that limit). Results of 2026-10-01 (MEASURED on the fork):

| Scene | Result | Estimate = gas limit |
|---|---|---|
| T1-4 `exact`, guard burning 78 k | verify OK, settled | 282 078 |
| T1-6 `exact`, guard burning 190 k | verify OK, settled | 395 880 |
| T1-8 untrusted | refused at verify: `FiatTokenV2: invalid signature` | — |
| T1-9 breaker (untrusted between verify and settle) | estimate fails, nothing broadcast | — |
| T1-11 `upto` cap 5 000, settle 1 000 | verify OK, settled | 438 557 |
| TS ↔ Solidity | `paymentDigest` (contract) = `hashTypedData` (viem), `explain` = OK on the TS blob | — |

**Real run (needs Hugo)**: transactions sent by Hugo's key D (keystore), all on testnet 10143:

| # | Tx | Gas (status) | Limit |
|---|---|---|---|
| T1-1 | create `T1Oracle(78 000)` | 478 782 (MEASURED, `cast estimate` on testnet) | ×1.1 |
| T1-1b | `oracle.setAgent(1, P, true, 0)` | 86 766 (anvil) | ×1.1 |
| T1-2 | create `TrustGatedPayer` (owner = treasury = operator = D, max 0.01 USDC) | 2 173 455 (anvil) | ×1.1 |
| T1-3 | `USDC.transfer(payer, 0.1 USDC)` | 99 538 (anvil) | ×1.1 |
| T1-5 | `oracle.setBurn(190 000)` | 32 385 (anvil) | 60 000 |
| T1-8/9 | `oracle.setAgent` × 4 (untrusted / trusted, twice) | ≈ 30-90 k each (anvil) | 120 000 each |
| T1-11a | `payer.approvePermit2(max)` | 106 081 (anvil) | 150 000 |
| (T1-7) | optional cap probe: `setBurn(2 000 000)`, `setBurn(190 000)` | 2 × ≈ 32 k | 60 000 each |

**Our cost** ≈ 3.9 M gas of limits ≈ **0.40 MON testnet** (ESTIMATED at 102 gwei, ≈ 0.41 with the probe),
plus **0.1 USDC testnet** (faucet.circle.com). **The facilitator pays** 3 settlements ≈ 1.1 M gas ≈ 0.11 MON
testnet (≈ 0.34 with the 2 M probe); its testnet signer holds 4 977 MON (MEASURED 2026-10-01).

Commands (Hugo). **Since 07/10, in one go, in Terminal.app:** `plugin/scripts/t1-live.sh ancre-demo` (deploy, then the scenes; D is owner and operator, the treasury a fixed unused address). The step-by-step equivalent:

```bash
cast wallet import ancre-t1 --interactive          # once: D's key in the Foundry keystore
cd contracts
T1_STEP=deploy T1_PROVIDER=0x<P> forge script script/t1/T1.s.sol \
  --rpc-url monad_testnet --account ancre-t1 --broadcast --gas-estimate-multiplier 110 --slow
cd ../plugin && npm run build
node scripts/t1.mjs --live --account ancre-t1 --provider 0x<P> --payer 0x<payer> --oracle 0x<oracle>
```

`--live` runs only at an interactive terminal, after the human types a confirmation phrase (no environment
variable can stand in for it), then asks the keystore password for each transaction. The refusal scenes use
60 s authorisations, and the script waits for them to expire before it trusts the agent again, so a refused
authorisation can never be settled later. Results go to `plugin/t1-results/live-*.json`: HTTP status and
body of every `/verify` and `/settle`, the settlement hash, gas limit and gas used, and the facilitator's
nonce delta (0 = nothing broadcast on a refusal).

**Pass criteria**: T1-4 and T1-11 settled; T1-6 settled with a limit ≥ 364 k; T1-8 refused without a
transaction. If T1-6 fails while the dry run passes, the hard guard falls on this facilitator: fall back to
the soft guard (the plugin) and to our own facilitator for the demo.

## 7. Known limits

- **Shared agentWallet** (D20, AM-05.1): 178 wallets serve 1 773 agents on mainnet. A server can declare the
  agentId of a trusted agent that shares its wallet: the money goes to that wallet, on another agent's
  reputation.
- **No aggregate budget** in the view path: the cap is `maxPerPayment` per payment and the balance overall.
  A stolen operator key can pay trusted agents only, `maxPerPayment` at a time.
- **No refusal event** in the STATICCALL path: `explain` (free) or `reportRefusal` (paid) rebuild it.
- **Consumer-anchor pattern (D13) not implemented**: the payer does not post ERC-8004 feedback. If added, it
  must be owner-only: an operator endorsing its own farm through an anchor payer would escalate.


## 02-bis (2026-10-06) : renommage et deux garde-fous (R8 de la revue maximale du 05/10)

- `AnchoredReputation.isTrusted` devient **`passesAnchorPolicy`**, et `Assessment.trusted` devient `passesPolicy` (D48, AM-9.5). Le payeur appelle le nouveau nom ; l'ABI du payeur ne change pas.
- **Ensemble en mode rapide refusé** (`FastTransferSet`, au constructeur et à `setPolicy`). En mode rapide, un agent vendu reste OK tant que personne ne prouve le transfert ; l'acheteur pose un nouvel agentWallet, et le payeur le payait sur la réputation du vendeur.
- **La trésorerie n'est jamais opératrice** (`OperatorIsTreasury`, au constructeur et à `setOperator`). Sinon, une seule clé signe les paiements et reçoit chaque `sweep`.
- Les scripts de déploiement séparent les trois rôles (owner, trésorerie, opérateur) : `script/t1/T1.s.sol` et `script/testnet/Deploy.s.sol`.

---
name: ancre
description: Use before paying another AI agent with the MetaMask Agent Wallet (mm) — any HTTP 402 / x402 payment, paid tool call or payment to an ERC-8004 agent. Runs `mm ancre inspect` / `mm ancre pay`, which ask ANCRE (Sybil-resistant ERC-8004 reputation relative to anchors your principal chose) and pay from an ERC-1271 payer contract that refuses untrusted agents on-chain at settlement. Never pay an agent for which ANCRE does not return PAY.
license: MIT
metadata:
  author: ANCRE team
  version: "0.1.0"
  cliVersion: "7.0.0"
---

# ANCRE trust gate

You pay other agents on behalf of a principal. Guard Mode limits how much you spend; it does not judge
whom you pay, and x402 payments are signatures, which the outflow limit does not count. ANCRE answers
"whom": it reads ERC-8004 feedback, keeps only the trust that flows from anchors your principal chose (a
farm of fake reviewers counts for nothing), and certifies the result on-chain. The funds live in a payer
contract that re-checks ANCRE when the payment settles. You cannot pay around it, and you must not try.

## When to use

| Situation | Command |
|---|---|
| An HTTP request returns 402 with a `PAYMENT-REQUIRED` header | `mm ancre inspect <url>`, then `mm ancre pay <url> --confirm` |
| The principal asks "can I trust / pay agent #N?" | `mm ancre check <N>` |
| First payment of the session | `mm ancre payer status` |
| The payer balance is too low | ask the human, then `mm ancre payer fund <amount> --confirm` |
| The human asks what was refused or paid | `mm ancre journal --json` (every exit of `pay` and `override`) |

While this skill is active, do not pay an agent with the generic x402 workflow (`x402_pay.py`) or with
`mm wallet sign-typed-data`. By design, your own wallet holds no USDC for that.

## Setup the human did once (check it, do not do it)

- A `TrustGatedPayer` contract is deployed. The human is its owner and treasury, and your mm wallet is one
  of its operators. Its address is in `ANCRE_PAYER` (or pass `--payer 0x…`).
- `ANCRE_CHAIN_ID` is `143` (Monad) or `10143` (Monad testnet). The default is 143.
- Guard Mode allowlists only the USDC contract and the payer.

## Preflight (once per session)

1. `mm --version` is 6.2.0 or later. `mm doctor` shows `authenticated` and `initialized`.
2. `mm ancre payer status --json`:
   - `walletIsOperator` must be `true`. If it is `false`, stop: you are signed in with another login method
     (Google, e-mail and QR give different addresses) than the one the payer was set up for.
   - `paused` must be `false`.
   - Note `maxPerPaymentUsdc`, `balanceUsdc`, `setId` and `policy.theta`: you will quote them.

## Before every payment

1. Run `mm ancre inspect <url> --json`. Add `--agent-id <N>` if the offer does not declare
   `extra.erc8004AgentId`. You get the offer (amount, asset, payTo), the agent id, the payer balance and a
   `verdict`. Nothing is signed.
2. Act on `verdict`:

   | verdict | what you do |
   |---|---|
   | `PAY` | Show the human the amount, the agent id and the resource. With their approval, run `mm ancre pay <url> --agent-id <N> --max-amount <amount> --confirm`. |
   | `UNTRUSTED` | Do not pay. Say: "ANCRE does not know this agent well enough: its trust is below the threshold of your anchor set". Unknown is the normal case for a new agent. |
   | `VETOED` | Do not pay. One of your anchors flagged this agent. Report `triggerTag` (a tag name, or its keccak256 hash). |
   | `WALLET_MISMATCH` | Do not pay. The offer's `payTo` is not the wallet of the agent it claims to be. |
   | `NO_WALLET` | Do not pay. This agent id has no wallet (unknown id, or wallet cleared by a transfer). |
   | `OVER_LIMIT` | Do not pay. The amount exceeds the payer's `maxPerPayment`. Tell the human; never split the payment. |
   | `TRANSFERRED` | Do not pay. The agent changed owner since it was certified. |
   | `NO_CERT`, `STALE`, `REGISTRY_CHANGED` | Do not pay. ANCRE cannot conclude right now: there is no fresh certificate, or the ERC-8004 registry was upgraded. Tell the human, and do not retry in a loop. |
   | `PAUSED` | Do not pay. The payer is paused. Tell the human. |
   | `BAD_OPERATOR_SIG` | Do not pay. Your wallet is not an operator of this payer (see the preflight). |

3. `mm ancre pay` checks ANCRE again before it signs, and the payer contract checks again at settlement.
   Act on `outcome`:
   - `PAID`: report the `transaction` hash (it may be absent when the plugin saw the payment only on-chain,
     `nonceUsed: true`; say so). A non-2xx status with `PAID` means the server settled and then failed to
     serve: tell the human, do not pay again.
   - `NOT_SIGNED`: nothing was signed (the verdict changed between inspect and pay, or the payer refuses).
     Report the verdict.
   - `REFUSED`: signed but not settled, and the server refused it at `/verify` or the payer refuses it now.
     `explainAfterFailure` gives the reason, for example an anchor vetoed the agent between the facilitator's
     verify and settle. That is the gate working. Report the reason, and do not retry.
   - `UNKNOWN`: signed, and nothing proves either way whether it settled (a 5xx, a timeout, a pending
     settlement). **It may still be paid.** Tell the human, quote `liveAuthorization.validBefore`, and do not
     sign another payment for this resource before that time.

## Human override (the human's decision, never yours)

When ANCRE (or the payer's policy) refuses, the output carries a `humanOverride` note. That note is for the
human. It is absent when the failure is not a refusal the override accepts (an expired window, a facilitator
error, a signature problem): then there is nothing to override.

- Do **not** propose an override on your own. Mention it only if the human explicitly asks how to pay this
  provider anyway, and then only tell them: "you can run `mm ancre override <url>` yourself, in your own
  terminal; it pays from your own MetaMask wallet (the payer's owner or treasury) and you sign it in your
  browser extension".
- **Never run `mm ancre override` yourself**, not even when asked to. Never open its signing page, never
  sign anything for it. It pays from the human's personal wallet, never from your wallet or from the payer.
  The command refuses to run without an interactive terminal, with machine output, or for a payer that the
  Agent Wallet setup does not pin; do not try to work around any of that.
- After a human override, report what `mm ancre journal` shows. Do not treat the overridden provider as
  trusted for later payments: the next payment goes through `mm ancre pay` and ANCRE again.

## Async and MFA

- A payment is one EIP-712 signature by your wallet, of type `AncrePayment` in the domain
  "ANCRE TrustGatedPayer". The summary reads "Pay X USDC to ERC-8004 agent #N via ANCRE payer". If the output
  says `AWAITING_MFA`, tell the human to approve it and wait. x402 authorizations expire (`validBefore`): if
  it expired, run `inspect` again instead of retrying `pay`.
- `mm ancre payer fund` is a normal ERC-20 transfer. It goes through Guard Mode, 2FA and Transaction Shield.

## Output

Always report the verdict, the agent id, the amount and asset, and, for a payment, the settlement
transaction hash. For a refusal, quote the verdict and, when present, `triggerTag`, and `trustLow` against
the set's `theta`.

## Never

- Never pay an agent whose verdict is not `PAY`. Never ask the human to lower the threshold or to change
  the anchor set so that a payment goes through.
- Never move USDC to your own wallet to pay outside the payer. Never use another payment path for an agent
  ANCRE refused.
- Never retry a refused, failed or `UNKNOWN` payment automatically: one attempt per resource.
- Never split an amount to fit under `maxPerPayment`.
- Never try to bypass or pre-empt Guard Mode, 2FA or Transaction Shield.
- Never run, script or simulate `mm ancre override`, and never ask the human for a signature on its behalf.
- Never guess an agent id from a name or a URL. Use the one the server declares or the one the human gives.
  The payer checks `agentWallet(agentId) == payTo` anyway.

## Works with

- **Warrant** (`mm warrant preflight`) checks whether a *swap* suits the principal. ANCRE checks whether a
  *counterparty* deserves a payment. These are different questions: run both when both apply.
- **The official MetaMask x402 workflow** uses the same protocol (x402 v2, `exact`, EIP-3009). ANCRE changes
  only who the payer is (the payer contract) and adds the trust check.

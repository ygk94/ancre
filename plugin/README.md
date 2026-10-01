# mm-plugin-ancre — pay an agent only if ANCRE trusts it

A [MetaMask Agent Wallet](https://docs.metamask.io/agent-wallet/) plugin (`mm`, ≥ 6.2.0) that adds the missing
question to agent payments: **whom am I paying?** Guard Mode caps how much an agent spends; it does not judge
the counterparty. And an x402 payment is a signature, which the outflow limit does not count.

ANCRE is Sybil-resistant ERC-8004 reputation **relative to anchors your principal chose**, certified on-chain
and readable by a contract. A farm of fake reviewers gets zero mass. This plugin makes that verdict
**enforceable** instead of advisory:

- **Soft guard**: before asking the wallet to sign, the plugin calls the payer contract's `decide()`. When the
  verdict is not `PAY`, nothing is signed.
- **Hard guard**: the USDC does not sit in the agent's wallet but in a keyless ERC-1271 contract,
  `TrustGatedPayer` (see `../contracts/PAYER.md`). USDC (EIP-3009) accepts the authorisation only if
  `isValidSignature` says yes, and that function calls `AnchoredReputation.isTrusted` **at settlement**. A
  veto that lands between the facilitator's verify and settle stops the payment.

Every signature and every transaction goes through `ctx.walletExecutor`, so MetaMask's policy, MFA and
Transaction Shield apply. The plugin never sees a key, and the payer contract has none.

## Commands

| Command | Capabilities | What it does |
|---|---|---|
| `mm ancre check <agentId> [--amount 0.01] [--naive]` | `wallet-read` | ANCRE's verdict under your payer's policy. `--naive` also prints the ERC-8004 `getSummary` over all clients, which is what an anchor-less reader sees |
| `mm ancre inspect <url> [--agent-id N] [--max-amount X]` | `wallet-read` | Reads the 402 challenge, picks the offer, resolves the agent, shows the verdict and what would be signed. Never signs |
| `mm ancre pay <url> [--agent-id N] [--max-amount X] --confirm` | `wallet-read`, `wallet-submit` | The full x402 v2 flow: decide, one `AncrePayment` signature, then the paid request. No retry |
| `mm ancre payer status` | `wallet-read` | Balance, owner, treasury, operators (is your mm wallet one?), the anchor set policy, and a Guard Mode checklist |
| `mm ancre payer fund <amount> --confirm` | `wallet-read`, `wallet-submit` | One `USDC.transfer(payer, amount)` with an explicit gas limit (Monad bills the limit) |
| `mm ancre override <url>` | `wallet-read` | **Human only.** Pays a provider ANCRE refused, from the human's own wallet, signed in their MetaMask extension (see below) |
| `mm ancre journal` | none | Every refusal, payment and override, from the local journal (for the demo screen) |

Common flags: `--payer 0x…` (or `ANCRE_PAYER`), `--chain-id 143|10143` (or `ANCRE_CHAIN_ID`, default 143).
The read commands also take `--rpc-url` (or `ANCRE_RPC_URL`): they then read through a plain RPC and work
**without `mm login`**, which lets a reviewer reproduce the verdicts. Signing never uses that path.

The agent-facing instructions are in [`skills/ancre/SKILL.md`](skills/ancre/SKILL.md).

## Install (local, beta)

```bash
npm install && npm run build                     # tsc + oclif manifest
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true   # local file: install
mm plugins install "file:$PWD" --accept-permissions      # only after reviewing the manifest
mm ancre check 182 --chain-id 143 --payer 0x… --naive
```

`minCliVersion` is `">=6.2.0 <8"`. The template's `"^6.2.0"` rejects the current 7.0.0, because the CLI checks
the range with `semver.satisfies`.

## When does the gate actually hold?

The hard guard is a guarantee only under these conditions. `mm ancre payer status` checks what it can.

1. The Agent Wallet runs in **server-wallet mode** (keys in MetaMask's TEE), **not BYOK**: in BYOK mode the agent's
   host holds the mnemonic and could sign anything outside the plugin.
2. **No USDC on the Agent Wallet.** The funds live in the payer contract. A key that holds USDC can always pay
   with a plain `transfer`; that is the one bypass no contract can stop.
3. **Guard Mode allowlists only the payer contract and the USDC contract**, so that any other transaction asks
   the human for 2FA.
4. The payer's **operator is the Agent Wallet**, and its **owner and treasury are the human** (a different
   wallet). The operator can only sign payments that the contract re-checks. Only the owner changes the anchor
   set or the cap, and funds leave only to the treasury.

Outside these conditions the plugin still refuses to sign for an untrusted agent (soft guard), but that refusal
is advisory.

## Human override

ANCRE can be wrong, and the principal keeps the last word. When `pay` refuses, it shows the verdict (status,
reason, trigger tag) and notes that **a human** may override:

```bash
mm ancre override http://provider.example/quote     # run by the human, in their own terminal
```

- The override **pays from the human's personal wallet**, that is, **the payer's owner or treasury** (addresses the
  human set on-chain, which the agent can neither change nor sign for). The plugin prepares an ordinary EIP-3009
  payment and opens a one-time page on `127.0.0.1`; the human signs it in **their MetaMask browser extension**. It
  never uses the Agent Wallet and never touches the payer contract's funds.
- **What makes it human-only** is that signature: any other key is refused, including every address of the Agent
  Wallet, every operator of the payer, and any freshly funded key. The command also declares no `wallet-submit`
  capability (the host refuses it the wallet executor), and refuses to run without an interactive terminal or with
  `--json` (defence in depth: a program can fake a terminal, it cannot fake the owner's signature).
  `test/override.test.mjs` checks each path, plus that no file other than `lib/host.ts` reaches the executor.
- There is no switching between the two wallets: if the owner or treasury is itself an Agent Wallet address,
  the override is refused as misconfigured.
- An override is not a precedent: the next payment to that provider goes through ANCRE again.

## Journal

Every refusal, payment, settlement refusal and override is appended to `~/.ancre/journal.jsonl` (or
`ANCRE_JOURNAL`), one JSON object per line: kind, URL, agent id, payee, amount, ANCRE verdict, reason, status,
trigger tag, who paid, transaction. `mm ancre journal --json` prints the latest entries; the demo screen
(chantier 07) can tail the file directly. It is a local convenience, not a tamper-proof audit trail: the
on-chain trace of a refusal is the payer's `reportRefusal`.

## How a payment works

1. `GET url` returns 402 + `PAYMENT-REQUIRED` (x402 v2). The plugin keeps the `exact` USDC offer on this chain,
   within `--max-amount` and the payer's `maxPerPayment`.
2. The agent id comes from `--agent-id`, or from the offer's `extra.erc8004AgentId`. That field is **not
   standard**: it is an ANCRE proposal. The id is never guessed: the payer checks `agentWallet(agentId) == payTo`.
3. `payer.decide(agentId, payTo, amount)` is a view call. If the verdict is not `PAY`, the plugin stops.
4. The wallet signs `AncrePayment{to, value, validAfter, validBefore, nonce, agentId}` in the domain
   `ANCRE TrustGatedPayer v1 @ payer`. The plugin checks that the signer is one of the payer's operators.
5. Blob = `0x01 · agentId · to · value · validAfter · validBefore · nonce · signature` (246 bytes). The paid
   request carries `PAYMENT-SIGNATURE` with `authorization.from = payer`. The server, the facilitator and
   the token are unchanged.
6. On 200, the plugin reports the hash from `PAYMENT-RESPONSE`. On a refusal it calls
   `payer.explain(digest, blob)` to say why, at that block.

## Tests

```bash
npm test                       # 48 tests on stubs: manifest (official schema), x402, blobs, verdicts, flows with a spy executor, client guard, human override
node scripts/demo-local.mjs    # rehearsal of the demo on an anvil --network monad fork (no real transaction)
node scripts/t1.mjs --local    # test T1 dry run: the facilitator emulated as x402-rs does it
node scripts/setup-fork.mjs    # demo setup on a fork: register, setAgentWallet, payer (operator = Agent Wallet), funding
```

What the stubs check: a non-`PAY` verdict never reaches the wallet; exactly one signature per payment; no
retry; an unfunded payer or a non-operator signer stops before the paid request; the fund transaction carries
an explicit gas limit. The contract side has 45 unit and 11 fork tests in `../contracts`.

## Status (2026-10-01)

- The plugin installs and loads in `mm` 7.0.0 (`mm plugins install file:` in an isolated `HOME`).
  `check`, `inspect` and `payer status` run through the real binary against a local fork.
- `pay` and `payer fund` through the real Agent Wallet executor need a `mm login` session. **Not yet tried.**
- On a real network, the hard guard depends on the facilitator accepting an ERC-1271 payer. That is test T1
  (`../contracts/PAYER.md` §6), which has passed only in the dry run so far.

## Client-side guard for the x402 SDK (no payer contract)

For an agent that pays from a plain EOA with the official SDK, `dist/lib/x402-guard.js` exports `ancreGuard`,
a hook for `x402Client.onBeforePaymentCreation`. It aborts before signing unless `agentWallet(agentId) == payTo`
and `isTrusted(agentId, setId)`, and refuses on any error:

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ancreGuard } from "mm-plugin-ancre/dist/lib/x402-guard.js";

const client = new x402Client().register("eip155:*", new ExactEvmScheme(account));
client.onBeforePaymentCreation(ancreGuard({ readContract: publicClient.readContract, ancre: ANCRE, setId: SET_ID }));
const pay = wrapFetchWithPayment(fetch, client);
```

It is advisory by construction: a compromised agent can sign anyway. The enforceable gate is the payer contract.
Note that an EOA delegated with EIP-7702 (as every anvil dev account is on the Monad testnet) cannot pay in
EIP-3009 unless its delegate implements ERC-1271: the USDC routes the signature through `isValidSignature`.

## Works with

- [Warrant](https://github.com/Beltran12138/warrant) checks whether a swap suits the principal. ANCRE checks
  whether a counterparty deserves a payment. The two are complementary.
- The official MetaMask x402 skill uses the same protocol. ANCRE changes only the payer and adds the check.

## License

MIT. The plugin imports `@metamask/agent-wallet/plugin` as a peer dependency only and vendors nothing from it.

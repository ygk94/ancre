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
  `isValidSignature` says yes, and that function calls `AnchoredReputation.passesAnchorPolicy` (named
  `isTrusted` before the 02-bis contracts) **at settlement**. A veto that lands between the facilitator's verify
  and settle stops the payment.

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
| `mm ancre override <url>` | `wallet-read` | **Human only.** Pays a provider ANCRE refused, from the human's own wallet, signed in their MetaMask extension (see below). Needs `mm login`; no `--rpc-url` |
| `mm ancre journal` | none | Every refusal, payment and override, from the local journal (for the demo screen) |

Common flags: `--payer 0x…` (or `ANCRE_PAYER`), `--chain-id 143|10143` (or `ANCRE_CHAIN_ID`, default 143).
The read commands (`check`, `inspect`, `payer status`) also take `--rpc-url` (or `ANCRE_RPC_URL`): they then
read through a plain RPC and work **without `mm login`**, which lets a reviewer reproduce the verdicts. Every
command checks that its reader's `eth_chainId` is the `--chain-id` asked for. Signing never uses that path, and
neither does `override`. Amount flags (`--amount`, `--max-amount`) given but empty are an error, never "no cap".

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

ANCRE can be wrong, and the principal keeps the last word. When `pay` refuses for a reason the payer's
`decide()` gives (ANCRE's verdict, `OVER_LIMIT`, `PAUSED`, a wallet mismatch), it shows the verdict (status,
reason, trigger tag) and notes that **a human** may override:

```bash
mm ancre override http://provider.example/quote     # run by the human, in their own terminal
```

- The override **pays from the human's personal wallet**, that is, **the payer's owner or treasury** (addresses the
  human set on-chain). The plugin prepares an ordinary EIP-3009 payment and opens a one-time page on `127.0.0.1`;
  the human signs it in **their MetaMask browser extension**. It never uses the Agent Wallet and never touches the
  payer contract's funds. The page answers "Signed" only after the plugin accepted the signature; a second click
  issues a second authorisation and never invalidates the first; Ctrl-C closes the page.
- **Who may sign** is read on-chain: any key other than the payer's owner or treasury is refused, including
  every address of the Agent Wallet (selected or not) and every operator of the payer. If the owner **or** the
  treasury is an agent address, there is no human and the override is refused as misconfigured.
- **Which payer, read where.** The caller chooses neither: the override reads only through the MetaMask gateway
  (`ctx.publicClient`, so it needs `mm login`; `--rpc-url` does not exist for it and `ANCRE_RPC_URL` is
  ignored), checks the gateway's `eth_chainId`, and requires the payer to be **pinned by the Agent Wallet setup**:
  the selected wallet is a server wallet, it is an operator of that payer, and the payer's address appears in its
  Guard Mode policy (read with the host's own `mm wallet policy get`). A payer that an agent deployed for itself,
  with a key it funded as owner, is therefore refused unless the human added it to the Guard Mode policy.
- The command declares no `wallet-submit` capability (the host refuses it the wallet executor) and refuses to run
  without an interactive terminal or with machine output (`--json`, `-f json`, or a persistent
  `mm config set format json`, through the host's own `io.isInteractive`).
- An override is not a precedent: the next payment to that provider goes through ANCRE again.

**Limits, stated plainly.** These checks bind the plugin as installed. An agent that can run arbitrary code as
the user can run a modified copy of the plugin, and can write anything into the local journal; no local check
can stop that. What it cannot change is on-chain: an override only spends from the signer's own address, never
from the payer contract or the Agent Wallet, so an agent that "overrides" with a key of its own spends its own
money, which it could do without the plugin. Two assumptions are not verified yet: that changing the Guard Mode
policy requires the human's 2FA (the host's documentation says so for Guard Mode), and the exact output of
`mm wallet policy get` in a real session (the plugin only looks for the payer's address in it, and refuses
when it cannot read it). `test/override.test.mjs` checks each path, plus that no file other than `lib/host.ts`
reaches the executor.

## Journal

Every exit of `pay` and `override` is appended to `~/.ancre/journal.jsonl` (or `ANCRE_JOURNAL`), one JSON
object per line: kind (`refusal`, `paid`, `settlement_refused`, `unknown`, `pay_aborted` for an RPC or HTTP
error, a wallet refusal or a non-operator signer, and the `override_*` kinds), URL, agent id, payee, amount,
ANCRE verdict, reason, status, trigger tag, who paid, transaction. `mm ancre journal --json` prints the latest entries; the demo screen
(chantier 07) can tail the file directly. It is a local convenience, not a tamper-proof audit trail: the
on-chain trace of a refusal is the payer's `reportRefusal`.

## How a payment works

1. `GET url` returns 402 + `PAYMENT-REQUIRED` (x402 v2). The plugin keeps the `exact` USDC offer on this chain,
   within `--max-amount`. An amount above the payer's `maxPerPayment` is not filtered out: `decide()` answers
   `OVER_LIMIT`, which is journaled.
2. The agent id comes from `--agent-id`, or from the offer's `extra.erc8004AgentId`. That field is **not
   standard**: it is an ANCRE proposal. The id is never guessed: the payer checks `agentWallet(agentId) == payTo`.
3. `payer.decide(agentId, payTo, amount)` is a view call. If the verdict is not `PAY`, the plugin stops.
4. The wallet signs `AncrePayment{to, value, validAfter, validBefore, nonce, agentId}` in the domain
   `ANCRE TrustGatedPayer v1 @ payer`. The plugin maps a high-s signature to its low-s twin (the payer accepts
   only low s) and checks that the signer is one of the payer's operators.
5. Blob = `0x01 · agentId · to · value · validAfter · validBefore · nonce · signature` (246 bytes). The paid
   request carries `PAYMENT-SIGNATURE` with `authorization.from = payer`. The server, the facilitator and
   the token are unchanged.
6. Outcome. `PAID` when `PAYMENT-RESPONSE` reports a successful settlement with a hash, **whatever the HTTP
   status** (the x402 "upfront" flow settles before the handler and may answer 500), or when the response proves
   nothing but `USDC.authorizationState(payer, nonce)` says the authorisation was used. `REFUSED` when the nonce
   is unused and either the server refused at `/verify` (402 with a new `PAYMENT-REQUIRED`) or
   `payer.explain(digest, blob)` refuses it at this block (e.g. a veto between verify and settle). Anything else
   (a 5xx or a proxy's 504, `settlement_pending`, a failed `/settle`, an unreadable nonce) is `UNKNOWN`, never
   "not paid": the signed authorisation may still settle until `validBefore`. The override follows the same
   rule with the human's address as authoriser.

## Tests

```bash
npm test                       # 70 tests on stubs: manifest (official schema), x402, blobs, verdicts, flows with a spy executor, client guard, human override, review fixes
node scripts/demo-local.mjs    # rehearsal of the demo on an anvil --network monad fork (no real transaction)
node scripts/t1.mjs --local    # test T1 dry run: the facilitator emulated as x402-rs does it
node scripts/setup-fork.mjs    # demo setup on a fork: register, setAgentWallet, payer (operator = Agent Wallet), funding
```

What the stubs check: a non-`PAY` verdict never reaches the wallet; exactly one signature per payment; no
retry; an unfunded payer or a non-operator signer stops before the paid request; the fund transaction carries
an explicit gas limit. The contract side has 45 unit and 11 fork tests in `../contracts`.

## Status (2026-10-06)

- The plugin installs and loads in `mm` 7.0.0 (`mm plugins install file:` in an isolated `HOME`).
  `check`, `inspect` and `payer status` run through the real binary against a local fork.
- `pay` and `payer fund` through the real Agent Wallet executor need a `mm login` session. **Not yet tried.**
- On a real network, the hard guard depends on the facilitator accepting an ERC-1271 payer. That is test T1
  (`../contracts/PAYER.md` §6), which has passed only in the dry run so far.
- The ABI (`src/lib/payerAbi.ts`) is generated from the 02-bis contracts (`passesAnchorPolicy`,
  `Assessment.passesPolicy`, `Policy.strictTransfer`): `node scripts/gen-abi.mjs <contracts/out>`. Until 02-bis
  is merged, `scripts/demo-local.mjs` (which deploys `../contracts`, separated roles `T1_TREASURY` /
  `T1_OPERATOR`) and the client guard against the old `T1Oracle.isTrusted` do not run.
- `mm ancre override` with a real session (gateway reads, `mm wallet policy get`, the human's extension):
  **not yet tried**.

## Client-side guard for the x402 SDK (no payer contract)

For an agent that pays from a plain EOA with the official SDK, `dist/lib/x402-guard.js` exports `ancreGuard`,
a hook for `x402Client.onBeforePaymentCreation`. It aborts before signing unless the offer is one ANCRE pays
(the same rule as the CLI: `exact`, the USDC of the chain ANCRE is read on, the FiatToken EIP-712 domain, a valid
`payTo`, within `maxAmount`), `agentWallet(agentId) == payTo` (and not zero), and
`passesAnchorPolicy(agentId, setId)`. It refuses on any error:

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ancreGuard } from "mm-plugin-ancre/dist/lib/x402-guard.js";

const client = new x402Client().register("eip155:143", new ExactEvmScheme(account));
client.onBeforePaymentCreation(ancreGuard({
  readContract: publicClient.readContract, getChainId: publicClient.getChainId, chainId: 143,
  ancre: ANCRE, setId: SET_ID, maxAmount: 50_000n, // 0.05 USDC
}));
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

# Demo script (≤ 5 min) — "the wallet that refuses to pay"

Two x402 providers behind one server (`scripts/x402-server.mjs`): `/good` is an ERC-8004 agent endorsed by
two of our anchors, `/farm` is an agent endorsed only by a Sybil farm. Price: 0.01 USDC per call. The same
scenes (plus the client guard and the human override) are rehearsed with no real transaction by
`node scripts/demo-local.mjs` (last run 2026-10-01: PASS, 8 scenes).

**Setup** (fork rehearsal: `node scripts/setup-fork.mjs` registers the client agent from the human's wallet, sets its
agentWallet to the Agent Wallet with a signed `AgentWalletSet`, deploys the payer with operator = Agent Wallet and
owner = treasury = human, funds it, and checks the guarantee conditions; last run 2026-10-01: PASS).

**Prerequisites (Hugo)**: `mm login` and `mm init`; a `TrustGatedPayer` deployed by the human (owner and
treasury = the human, operator = the mm wallet), funded with 0.1 USDC; AnchoredReputation deployed and
certified (chantiers 02/04/06); Guard Mode allowlist = USDC + payer; `export ANCRE_PAYER=0x… ANCRE_CHAIN_ID=…`.

| t | Scene | On screen |
|---|---|---|
| 0:00-0:30 | **The gap** | Two lines of MetaMask docs: signatures are not counted in the outflow limit, and Guard Mode does not judge counterparties |
| 0:30-1:15 | **Naive vs ANCRE** | `mm ancre check 182 --naive`: the naive `getSummary` over all clients flatters the farm (Eve-8004, mainnet); ANCRE says `UNTRUSTED`, trust 0 |
| 1:15-2:00 | **Refusal, soft guard** | The agent (Claude Code + `skills/ancre`) gets a 402 from `/farm` and runs `mm ancre pay … --confirm` → `UNTRUSTED`. **No signature is requested** |
| 2:00-2:45 | **Refusal, hard guard** | We force it: a blob signed by hand for `from = payer` to the farm → the facilitator's verify fails, `FiatTokenV2: invalid signature`, the farm receives 0. Then `x402_pay.py` from the agent's EOA → `insufficient_funds` (the EOA holds no USDC) |
| 2:45-3:45 | **Acceptance** | `mm ancre pay http://…/good --confirm` → `PAY` → the MFA screen reads "Pay 0.01 USDC to ERC-8004 agent #N via ANCRE payer" → 200 + `PAYMENT-RESPONSE`, the USDC transfer `payer → good` in the explorer |
| 3:45-4:40 | **Circuit breaker** | An anchor posts a `veto` feedback on `good` from its own key. The next `mm ancre pay` returns `VETOED`, `triggerTag = veto`, with no recertification. Variant: the veto lands between verify and settle → `paid: false, signed: true`, `explainAfterFailure: VETOED` |
| (4:20-4:40) | **Human override** (optional) | The human, not the agent, runs `mm ancre override http://…/farm` in their own terminal: verdict shown, typed confirmation, local page, signature in **their MetaMask extension**, paid from **their** wallet; the payer is not touched; `mm ancre journal` shows refusal → override |
| 4:40-5:00 | **Close** | "Guard Mode: how much. ANCRE: to whom. The contract enforces it, the wallet signs, nobody holds a key." |

**Fallback**: if the Monad facilitator is down or refuses ERC-1271 payers (test T1), the server switches to
the emulated facilitator or to our own; the frozen demo is described in chantier 06.

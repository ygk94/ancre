# ANCRE screen — run it, and where every number comes from

> Chantier 07-bis, 2026-10-07 (refonte of the chantier 07 screen). Code: `app/` (Vite 8, React 19, TypeScript 7,
> viem 2.57, no wagmi, no router library, no backend). Published by Netlify from `app/dist` (`netlify.toml`).
> Status words on screen: **MEASURED** (read live by the page), **RECORDED** (chantier 06 event log), **COMPUTED**
> (reference solver, reproducible), **QUOTED** (third party, dated), **MOCK** (dressing only). A value that is not
> available renders “—”.

## 1. Run it locally

```bash
cd app
npm ci
npm run dev                      # http://localhost:5173
npm test                         # 24 tests: run reducer, block states, Discover/D49/D50 on real data, feed, routes
npx tsc -b && npm run build      # static site in app/dist/
```

Pages (History API; `netlify.toml` serves `index.html` on every unknown path, and a real file of the build, such
as a future `public/mera/index.html`, wins over that redirect):

| Path | Page |
|---|---|
| `/` · `/?network=mainnet&anchors=<lens>` | Discover: agents that pass the anchor policy, then the most-rated refused ones |
| `/leaderboard` | every agent reached, ranked by leave-one-out mass; mainnet: 8004scan's top 10 read by ANCRE |
| `/agent/{testnet,mainnet,demo}/<id>?tab=overview,ratings,path,certificates,payments` | agent page (`demo` = an agent of a fork run) |
| `/live` (`?source=live`, `?at=`, `?autoplay=1`, `?pacing=recorded`, `?clock=testnet`) | the live demo (act 2), live or replay |
| `/donate` | “soon” (no wallet, no transaction) |
| `?act=1`, `?act=2` | old chantier 07 links, rewritten to `/?network=mainnet` and `/live` |

Assets are served from `/` (`vite base`); a host under a sub-path builds with `ANCRE_BASE=/sub/ npm run build`.

### Live demo, live on a fork / on the testnet

Unchanged from chantier 07: `cd demo && node fork.ts`, `cd app && npm run dev` (open `/live?source=live`), then
`cd demo && node run.ts --rpc http://127.0.0.1:8549` (or `--network testnet …` after Hugo's go-ahead). The dev server
serves chantier 06's `demo/out/latest.json` at `/live/latest.json`. A static build has no live source: it replays.

### Refresh the data at filming time

```bash
cd app
npm run snapshot:scan                                              # 8004scan names/scores (QUOTED, dated)
/Users/hugo/Projet/ancre/solver/.venv/bin/python scripts/export_act1.py   # mainnet numbers + D49 (COMPUTED)
npm run sync:runs                                                  # newest chantier 06 run -> public/runs/
npm run build
```

Discover / Leaderboard / agent pages on the testnet read the **first run of `public/runs/index.json`**: a testnet run
if there is one, else a fork run, newest first (`scripts/sync-runs.mjs`).

## 2. Where every number comes from

### Monad testnet (default network)

| On screen | Source | Status |
|---|---|---|
| Status, passes, leave-one-out mass (`trustLow`), raw mass, distrust, e, certificate block, veto tag | last `agent.contract` of each agent in the run log = `AnchoredReputation.assess(agentId, setId, true)` read by the scene script | RECORDED (on a fork until a testnet run exists; the policy pill says “recorded on a fork of the testnet”) |
| Anchors, m, θ, level, set id | run header `set` | RECORDED |
| α = 1/3, ρ = 1/2 | `demo/lib/config.ts` (not in the log header) | DOC of the scene script |
| Ratings, naive average (contrast column) | run log `agent.explorer` (every feedback re-read with `readAllFeedback`) | RECORDED |
| D49 “why each rating counts” and its weight w | rules R2-R6 applied by the screen (`src/core/runset.ts`) to the logged ratings, with the tag schema committed in `set.tags`; author's mass = its own last `assess()` | CALCULATED by the screen; contribution “—” (no B⁺ in the log) |
| D50 trust path | same classification: anchor ratings and ratings carried by agents with mass | CALCULATED by the screen |
| Certificates, rejected certificate, payer decisions, `explain()` | run log `certificate`, `rejected`, `payment` events | RECORDED |

### Monad mainnet (preview)

| On screen | Source | Status |
|---|---|---|
| Pass / refused, leave-one-out and raw mass, distrust, e, reach | `scripts/export_act1.py` → reference solver (`solver/graph.py`, `solver/ppr.py`, D20, α = 1/3, m = 2, θ = 1 % applied off-chain) on the versioned snapshot `solver/data/mainnet-110994810.*` | COMPUTED, **not certified on-chain** |
| D49 groups and their contribution (+x %) | same export: each non-revoked rating classified by the solver's rules; contribution read in the certificate, (1 − α)·Σλt_u·q/B⁺_u, checked to sum to the raw mass | COMPUTED |
| “Even if every tag counted” | same anchors, every tag read as an endorsement (16 most frequent tags) | COMPUTED |
| Ratings / naive average in Discover | same snapshot (`act1.registry`) | COMPUTED from the snapshot |
| Ratings / naive average / owner on an agent page | Envio HyperIndex GraphQL, live (snapshot if Envio is down) | MEASURED |
| Agent names, 8004scan score and top 10 | 8004scan public API, `scripts/snapshot-8004scan.mjs`, fetch date shown | QUOTED |

### Feed (left column)

| On screen | Source | Status |
|---|---|---|
| ERC-8004 registry tab: ratings, revocations, registrations, transfers | Envio (`Feedback`, `OwnerChange`), polled every 8 s; head shown | MEASURED |
| Lines marked ● | public WebSocket `eth_subscribe logs` on both registries (`wss://testnet-rpc.monad.xyz`, `wss://rpc.monad.xyz`), replaced by the Envio line once indexed | MEASURED |
| Agent names in the feed | `Agent.uri` when it is a `data:` URL, decoded in the browser; else “#id” | MEASURED |
| ANCRE tab | run log (certificates, rejected certificate, anchor vetoes, payer decisions) | RECORDED |

### Live demo

Unchanged from chantier 07 (§2 of its version): run log values, the screen's own `eth_call` of `assess()` and
`decide()` in live mode, `monadNewHeads` block states, breaker latency labelled with its network.

## 3. What is mocked (dressing only)

| Part | Why | Where |
|---|---|---|
| Agent avatars (initials on a colour derived from the id) | no image is fetched from any explorer | `app/src/ui/common.tsx` `Avatar` |

Nothing else. 8004scan's layout (identity card, tabs, side panel) inspired the agent page; none of its fields
beyond identity is shown, and it only appears as a cited source and a “view on 8004scan” link (real agents only).

## 4. Keys

None in the bundle. Envio and the Monad RPC/WebSocket are public. The Alchemy key (D55) stays in `solver/.env`; using
it from this page would need a server function (not built).

# ANCRE demo screen — run it, and where every number comes from

> Chantier 07, written 2026-10-06. Size of the build: 884 KB, JS 549 KB (167 KB gzip), MEASURED 06/10 (`npm run build`).
> Code: `app/` (Vite 8, React 19, TypeScript 7, viem 2.57, no wagmi, no backend).
> Act 1 = real Monad mainnet (143) data. Act 2 = our own traffic (chantier 06 scenes), live or replayed.
> Status tags: **MEASURED** (by a command, with its date), **QUOTED** (third party, dated), **COMPUTED** (reference
> solver, reproducible), **RECORDED** (chantier 06 event log), **MOCK** (dressing only).

## 1. Run it locally

```bash
cd app
npm ci
npm run dev                      # http://localhost:5173  (act 1: ?act=1, act 2: ?act=2)
npm test                         # 10 tests: event reducer on the recorded runs, block-state reducer
npm run build                    # static site in app/dist/ (884 KB), servable from any sub-path
npx vite preview --port 4173     # serve dist/ locally
```

### Act 2 live, on a fork (what the video uses until the testnet run is approved)

```bash
# terminal 1 — chantier 06: a persistent anvil fork of Monad testnet on :8549
cd demo && node fork.ts
# terminal 2 — the screen, tailing chantier 06's demo/out/latest.json
cd app && npm run dev            # open http://localhost:5173/?act=2&source=live
# terminal 3 — chantier 06: play the scenes (≈ 23 s, ACT 2 PASS)
cd demo && node run.ts --rpc http://127.0.0.1:8549
```

The dev server looks for the chantier 06 log in `$ANCRE_RUNS_DIR`, then `../demo`, then `../../ancre-06/demo`
(sibling worktree). A second run on the same anvil fails chantier 06's checks: restart `fork.ts` and delete
`demo/out/state-fork.json` between takes.

### Act 2 live, on the real testnet (🧑 after Hugo's go-ahead for chantier 06 E6)

Same as above with `node run.ts --network testnet --keystore … --sweep`. The screen then:
- re-reads `assess()` / `decide()` on the header's RPC at each event's block;
- subscribes to `monadNewHeads` on `wss://testnet-rpc.monad.xyz` (override: `VITE_TESTNET_WSS`) and shows a
  verdict only once its block is **Finalized**.

Check the WebSocket before filming: `http://localhost:5173/?act=2&source=live&clock=testnet`.

### Replay (offline, the fallback that saves the video)

`http://localhost:5173/?act=2` (or the static build). Recorded runs live in `app/public/runs/`; refresh them with
`npm run sync:runs` (copies `demo/sample/run-fork.json` and `demo/out/latest.json`, checks the format).
URL parameters: `run=<file>`, `at=<index>`, `autoplay=1`, `pacing=recorded|presenter`, `speed=<x>`.
Keys: `←` `→` step, `Space` play/pause, `1`-`6` jump to a scene.
MEASURED 06/10: with every non-localhost request blocked, act 2 replays with 0 error and act 1 falls back to the
solver snapshot, saying so.

### Refresh the data at filming time

```bash
cd app
npm run snapshot:scan                                  # 8004scan scores, dated (src/data/scan-snapshot.json)
../solver/.venv/bin/python scripts/export_act1.py      # act 1 contract column (src/data/act1.json)
npm run sync:runs                                      # act 2 recorded runs
npm run build
```

## 2. Where every number comes from

### Act 1 — Monad mainnet (143)

| On screen | Source | Status |
|---|---|---|
| Ratings received, distinct raters, naive average, ratings at 10^38 | Envio HyperIndex GraphQL `Feedback` (non-revoked rows of the agent, paged by 1 000), read by the browser | MEASURED live (falls back to the solver snapshot if Envio is unreachable, and says so) |
| Owner / agentWallet in the agent header | Envio `Agent` | MEASURED live |
| Footer “Monad 143 head N · ratings · agents” | Envio `chain_metadata.latest_processed_block` + `ChainStats` | MEASURED live |
| 8004scan `total_score`, `average_score`, rank by `total_score`, leaderboard left column | 8004scan public API, `scripts/snapshot-8004scan.mjs`, fetch date shown | QUOTED (formula not published; never recomputed) |
| ANCRE mass (leave-one-out), raw mass Σλt, distrust, error bound e, mass on the farm Σλt, leaderboard right column | `scripts/export_act1.py` → reference solver (`solver/graph.py`, `solver/ppr.py`, rules D20, α = 1/3, m = 2) on `solver/data/mainnet-108835675.*` | COMPUTED, reproducible; **not certified on-chain** (nothing is deployed on mainnet) |
| WOULD PAY / WOULD REFUSE | same export, θ = 2 % (the θ of chantier 06's demo set), ρ = 1/2, applied off-chain | COMPUTED |
| Captions (“83 % of all mainnet ratings”, “78 ratings from its own agent wallet”, “518 ratings from a single wallet”) | `act1.json` `registry` / `farm` / `selfRating8317`, block 108 835 675 (tooltip) | COMPUTED from the snapshot |

Anchor sets (“Your anchors”): two independent raters `0x0730…`, `0xf7d5…` · an automated risk-screening service
`0xa06f…43a4` read as trust (no D15) · the same with schema D15 · two wallets of the farm (the reader anchors inside
it). The screener is never called an attacker.

### Act 2 — our own traffic (Monad testnet registries, fork or testnet)

| On screen | Source | Status |
|---|---|---|
| Ratings, raters, revoked, naive average (+ sparkline) | event log `agent.explorer`: the scene script re-reads every feedback with `readAllFeedback` at the event's block | RECORDED (live or replay) |
| ANCRE mass `trustLow` vs θ, status, e, distrust, certificate age | event log `agent.contract` = `AnchoredReputation.assess(agentId, setId, true)` at the event's block | RECORDED |
| “✓ re-read by this screen: assess() @ block N matches the log · decide() …” | the screen's own `eth_call` (viem) of `assess` and `TrustGatedPayer.decide` at the same block, live mode only | MEASURED by the screen |
| PAID / REFUSED, reason, stage, `explain()` line, facilitator answer | event log `payer` (`decide`, `explain(hash, blob)`, facilitator `/verify` and `/settle`) | RECORDED |
| Certificate level “Registry-verified, attested submitter” | event log `header.set.level` | RECORDED |
| Circuit breaker blocks / ms | event log `latency` (step `4.latency`), labelled `fork` / `frozen` / `testnet` | MEASURED by chantier 06; only `testnet` is a Monad latency, the screen says so |
| Block clock, Proposed→Voted / →Finalized medians, speculative dropped | `monadNewHeads` WebSocket (`newHeads` on anvil), live mode only | MEASURED by the screen (06/10 testnet: 304 ms / 557 ms, 64 blocks) |

## 3. What is mocked (dressing only)

| Part | Why | Where |
|---|---|---|
| Agent avatars (initials on a colour derived from the id) | no image is fetched from any explorer | `app/src/ui/common.tsx` `Avatar` |
| Agent list of act 1 limited to featured agents + 8004scan's top 25 | the search filters that list, it does not query every agent | `app/src/ui/Act1.tsx` |

Nothing else is mocked. No name, logo, colour or layout of 8004scan or of any explorer is used; 8004scan only
appears as the cited source of the explorer column.

## 4. Hosting the public “product live” link — 🧑 BLOCKED: Hugo decides

The public build is static: act 1 (Envio live from the browser, CORS open, MEASURED 06/10) and act 2 in
**replay**. The live tail of act 2 needs the local dev server (it reads a local file) and is for filming only.

| Option | What Hugo does | Cost | Notes |
|---|---|---|---|
| **A. Netlify** (recommended) | `npx netlify-cli deploy --prod --dir=app/dist` with his account, or drag-and-drop `app/dist` on app.netlify.com | **$0**, Free plan, “300 credit limit”, custom domains with SSL (DOC, netlify.com/pricing, read 2026-10-06) | works with a private repo (we upload the build, not the repo); HTTPS on `*.netlify.app`; commercial use not stated on the page |
| **B. Vercel** | `npx vercel deploy app/dist --prod` with his account | **$0**, Hobby: 100 GB/month transfer, 1 M CDN requests/month, HTTPS; “for personal, non-commercial use”, no paid overage (DOC, vercel.com/pricing, read 2026-10-06) | same properties as A; the non-commercial clause is the reason A is recommended |
| C. GitHub Pages | once `ygk94/ancre` is public (submission), a Pages workflow publishing `app/dist` | free for public repos (NOT VERIFIED today) | private repos need a paid plan (NOT VERIFIED); the URL changes nothing in the build (`base: "./"`) |

No public deployment has been made. No key is needed by the build (all endpoints are public; `.env` overrides
are optional and never committed).

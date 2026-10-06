# ANCRE demo video — shot list on the real screen (target 2:55, hard limit 3:00)

> Chantier 07, 2026-10-06. Adapts the 11-shot storyboard of `docs/ressources/design-demo-et-soumission.md` §3 to
> the screen as built (`app/`, see `demo/SCREEN.md`). Voice lines are the storyboard's, **amended where the screen
> or the facts changed** (marked ✎). Every number on screen carries its source; never say a number the screen
> does not show.
>
> Recording setup: Chrome at **1920×1080**, zoom 100 %, dark OS theme irrelevant (the screen is always dark).
> Start `npm run dev` in `app/` (or serve `app/dist`). Indices `at=` refer to the recorded fork run
> `run-20261006T083258Z` (first in the run list). In presenter pace, `→` advances one event; `Space` plays.

## Before the take (10 min)

1. `cd app && npm run snapshot:scan` (8004scan scores dated today) and `../solver/.venv/bin/python scripts/export_act1.py`;
   `npm run build` must pass.
2. Act 2 source, pick ONE and say which on screen (the top-right badge does it for you):
   - **testnet live** (only after Hugo's go-ahead to chantier 06 E6): `?act=2&source=live` + the run; the block clock
     shows `monadNewHeads`, verdicts appear at **Finalized**; latencies are then Monad numbers;
   - **fork live**: `node fork.ts` + `?act=2&source=live` + `node run.ts --rpc http://127.0.0.1:8549` (≈ 23 s);
   - **replay** (fallback, offline): `?act=2`; the badge reads “REPLAY of run-… recorded 2026-10-06”.
3. Check `?act=2&source=live&clock=testnet` shows a moving clock (WebSocket reachable).

## Shots

| # | Time | Screen state (URL / click) | What the viewer sees | Voice (EN) |
|---|---|---|---|---|
| 1 | 0:00-0:10 | Terminal (not the screen): `cast call 0x8004BAa1…9b63 "getSummary(uint256,address[],string,string)" 182 [clients] "" ""` then the same with `[]` → revert | 1.5264e36, then a revert | “Should a contract pay this agent? Monad mainnet says its average rating is 1.5 times ten to the thirty-six. And the standard won't average without a list of raters you trust.” |
| 2 | 0:10-0:30 | `/?act=1` (Eve-8004 selected by default, anchors “Two independent raters”) | Left: **1.5264 × 10³⁶**, 7,665 ratings, 117 at 10^38, 8004scan total_score 5.02 (quoted, dated). Right: **0**, “unreachable from them: unknown”, mass on the farm Σλt **0**, **WOULD REFUSE**, badges “computed by the reference solver, reproducible” / “not deployed on mainnet” | ✎ “Eve-8004: seven thousand six hundred ratings, eighty-three percent of the whole registry, from one farm. Anchored on two independent raters, ANCRE gives it zero. Not low. Zero. And no contract could read an explorer's score anyway.” |
| 3 | 0:30-0:50 | Click lens **“A risk screener read as trust”**, hold 6 s, then **“Same screener, schema D15”** | Mass on the farm Σλt **34.56 %** → **0**; Eve raw mass 13.82 % → 0 | “This address is an automated risk-screening service. Its scores mean ‘low risk, unverified’. Read them as trust and thirty-five percent of its mass leaks into the farm. ANCRE's schema separates measurements from endorsements: the leak is zero.” |
| 3b | (optional, +6 s, cut first) | Lens **“A reader who anchors inside the farm”** | Eve raw mass **11.11 %**, leave-one-out **0**, “reached by one anchor only” | ✎ “The score is the reader's: anchor inside the farm and it shows up. That is the point, not a bug.” |
| 4 | 0:50-1:02 | Lens back to “Two independent raters”, click **ANOA Trading Gen 2 #8317** in the sidebar | Left: 78 ratings, 1 distinct rater; caption “78 ratings from its own agent wallet”; 8004scan rank #2 by total_score (quoted). Right: **0**, WOULD REFUSE | ✎ “Agent 8317 rated itself seventy-eight times from its own agent wallet; the registry's guard does not check that wallet. A global score still ranks it near the top. Under your anchors it has nothing.” — keep it factual: never “8004scan is wrong”. |
| 5 | 1:02-1:10 | Click **Leaderboard** | Left: 8004scan top 10. Right: **3 agents reachable; the other 10,259: unknown, mass 0** | ✎ “Honest reputation on mainnet is almost empty: three agents reachable from independent raters. So act two is our own traffic, on Monad testnet's ERC-8004 registries.” (say “mainnet” only if chantier 06 E5 ran there) |
| 6 | 1:10-1:28 | Tab **Act 2**, `?act=2&at=36` then `Space` (presenter pace) until `at=80` | Farm target: explorer **100** (10 ratings, sparkline climbing), contract **0**, **REFUSED · UNTRUSTED** with the `explain()` line; feed collapses the farm ring into one line | “Three anchors, honest providers, a scripted Sybil farm. The payer is a contract that asks ANCRE before every x402 payment. The farm pumps its target's average to a hundred; ANCRE gives it nothing; the payment is refused, by the contract.” |
| 7 | 1:28-1:43 | `→` to `at=83` | Raw mass Σλt **4.36 %** “over θ, but from one anchor only”, leave-one-out **0**, **REFUSED** | “Now one anchor is compromised and endorses the farm. Trust is computed leaving any one anchor out, so no single key can make us pay. Still refused.” |
| 8 | 1:43-2:10 | `?act=2&at=98` then `→` ×6 to `at=104`; then `at=107` → `109` | provider-2 **PAID** (3.05 %), anchor-B `slash −100`, next payment **REFUSED · ANCRE_STATUS (VETOED, tag slash)** while the mass is still 3.05 %; breaker box: blocks + ms with its “MEASURED on …” label; scene 5: a third-party +1, still VETOED | ✎ “A provider goes bad; an anchor slashes it. The very next payment is refused: vetoed, read live from the registry, no recertification needed. A plus-one from someone else doesn't erase it.” — **say “block N plus one, three hundred milliseconds” only on a testnet run** (the box then reads “MEASURED on testnet”); on fork/replay say “the very next payment”. |
| 8b | (+0:12, D50/D51) | **not built yet**: needs chantier 06's “2nd hop” scene (H1 vouched by two anchors, H1 vouches H2) and the matching view (path anchor → H1 → H2) | H2 gets mass through H1 only | “Trust propagates beyond one hop, with a Sybil bound and a certificate checked on-chain.” |
| 9 | 2:10-2:30 | `→` to `at=112` (scene 6), zoom on the certificate badges | **REJECTED · EdgeMismatch(2, 1)** “simulated, nothing broadcast”; badge “certificate: Registry-verified, attested submitter” | ✎ “The certificate is Registry-verified: every edge it claims is re-read in the ERC-8004 registry, so a fabricated one is rejected at submission. ANCRE is the reference implementation of a draft ERC for anchored reputation, chain-agnostic.” (gas figure: only the one measured for the deployed level, chantier 02) |
| 10 | 2:30-2:48 | Vignette (a): act 1 footer “indexed by Envio HyperIndex · Monad 143 head …” + `indexer/SCHEMA.md` query; (b) Alchemy, only if built (see below); (c) Mera, only if real | Envio is visible on screen as the source of the explorer column | “The registry data on this screen is indexed with Envio.” ✎ Bounties targeted: **Envio, Mera, Alchemy** (D53, D54). MetaMask plugin: client-side integration only, **not a bounty** (D53), 6 s at most or README only. Alchemy (D55): “every one of Eve's raters got its first MON from Eve's owner” (MEASURED on 150 sampled raters, `docs/ressources/alchemy.md`) is **not on the screen yet**: show it only once wired. Mera: **cut** unless a real two-device run exists (never mocked). |
| 11 | 2:48-2:55 | Final card (not the screen) | name, tagline, repo URL, contract addresses | “The standard leaves Sybil filtering to the reader. ANCRE is that reader, and it refuses to pay.” |

Total: 2:55 with 3b cut, **3:00 with the 2nd hop (D51)**. Cut order if long (storyboard, D31): 3b, scene 5 inside shot 8, shot 4, the weakest
vignette of shot 10. **Never cut** 2, 7, 8.

## Honesty checklist (read before each take)

- The top-right badge says LIVE or REPLAY; do not hide it. Replay = “recorded 2026-10-06”.
- Act 1 contract column = **computed by the reference solver**, block 108,835,675; nothing is certified on mainnet.
- Act 2 latencies on a fork are anvil's (instant mining): never quote them as Monad latencies.
- The screener `0xa06f…43a4` is “an automated risk-screening service”, never an attacker.
- 8004scan appears only as a cited source (“Source: 8004scan public API, fetched …”). It does not rank Eve first;
  never say it does.
- Demo agents (provider-1, farm-…) are ours, registered by chantier 06 on the testnet registries.

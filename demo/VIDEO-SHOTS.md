# ANCRE demo video — shot list on the 07-bis screen (target 2:55, hard limit 3:00, D51)

> Chantier 07-bis, 2026-10-07. Replaces the chantier 07 shot list (two-column acts). The screen is now an
> explorer-style front: **Discover / Leaderboard / agent pages / Live demo**, a network selector (Monad testnet,
> Monad mainnet *preview*, Ethereum *soon*) and a feed of ERC-8004 activity on the left. The pitch line Hugo says
> over it: *“the point is to add this layer to 8004scan, not to replace it.”*
> Every number said aloud must be on screen with its source word (RECORDED / COMPUTED / MEASURED / QUOTED).
>
> Setup: Chrome 1920×1080, zoom 100 %, **light theme** (button top right; dark also works). `cd app && npm run dev`
> (or serve the build). Indices `at=` below refer to the recorded run **`run-20261006T121308Z`** (fork of Monad
> testnet, 8 scenes, θ = 1 %); they change with any other run: re-read them with the `n/122` counter.

## Before the take (10 min)

1. `cd app && npm run snapshot:scan` (8004scan names and scores, dated) and
   `/Users/hugo/Projet/ancre/solver/.venv/bin/python scripts/export_act1.py` (mainnet numbers, θ = 1 %, D49);
   `npm run build` must pass.
2. Live demo source, pick ONE (the page says which):
   - **testnet run** (once chantier 06 has played on the real testnet): `npm run sync:runs` then `/live` — the page
     reads “recorded … on Monad testnet” and Discover's policy pill turns green (“on-chain”);
   - **fork live**: `node fork.ts` + `/live?source=live` + `node run.ts --rpc http://127.0.0.1:8549`;
   - **replay** (fallback, offline): `/live`; the pill reads REPLAY.
3. Check the feed header shows two green dots: “Envio · head …” and “WebSocket logs”.

## Shots

| # | Time | Screen state (URL / click) | What the viewer sees | Voice (EN) |
|---|---|---|---|---|
| 1 | 0:00-0:10 | Terminal: `cast call 0x8004BAa1…9b63 "getSummary(uint256,address[],string,string)" 182 [clients] "" ""`, then the same with `[]` → revert | 1.5e36, then a revert | “Should a contract pay this agent? Monad mainnet says its average rating is 1.5 times ten to the thirty-six. And the standard won't average without a list of raters you trust.” |
| 2 | 0:10-0:30 | `/?network=mainnet` (Discover, anchors “Two independent raters”); hover the “Most rated, refused” table | Pass: #18 11.11 %, #2 and #3 3.70 %. Refused: **Eve-8004, 7,665 ratings, naive average 1.5264 × 10³⁶ → ANCRE mass 0**; pill “preview · computed off-chain, not certified” | “Explorers like 8004scan list every agent. ANCRE adds one layer: which agents are reachable from anchors you choose. Eve: seven thousand six hundred ratings, a farm. Under two independent anchors: zero.” |
| 3 | 0:30-0:45 | Click **Eve-8004** → tab **Ratings** | “0 of 7,665 carry weight”; 7,662 “no edge: tag not in the schema”; **“Even if every tag counted: 7,548 would count for 0, their authors are not reachable from your anchors; 117 would be rejected, out of bounds”** | “Every one of those ratings is accounted for. Even if we accepted every tag, seven and a half thousand count for zero: nobody you trust reaches their authors. The 117 values at ten to the thirty-eight are rejected, never capped.” |
| 4 | 0:45-0:55 | Back, Anchors selector → **“A risk screener read as trust”**, hold 4 s, then **“Same screener, schema D15”** | Policy card: **“Mass reaching Eve's farm (7,666 agents): 34.56 %”** → **0**; no agent passes (one anchor alone never pays) | “This address is an automated risk-screening service. Read its scores as trust and thirty-five percent of its mass leaks into the farm. ANCRE's schema separates measurements from endorsements: the leak is zero.” (cut first if long) |
| 5 | 0:55-1:05 | Network → **Monad testnet**; Discover | Pass: **provider-1** (2 anchors), **provider-3 (2 hops, via provider-1)**; refused: **farm target, 11 ratings, average 100 → 0**, provider-2 **Vetoed · slash**; pill “recorded on a fork of the testnet” (or “on-chain” after the testnet run) | “On Monad testnet we certify our own anchor set on-chain. Honest providers pass; the farm's target averages a hundred and gets zero.” — say “testnet” only if the run is a testnet run; else “on a fork of Monad testnet”. |
| 6 | 1:05-1:17 | Click **provider-3** → tab **Trust path** (D50) | **⚓ anchor-A, anchor-B → provider-1 → provider-3**, raw masses under each | “Trust propagates beyond one hop: provider-3 was never rated by an anchor, only by a provider they trust. With a Sybil bound, and a certificate checked on-chain.” |
| 7 | 1:17-1:35 | **Live demo**, `/live?at=88`, then `→` to `at=91` | farm target: explorer **100** vs ANCRE **0**, **✕ Refused · UNTRUSTED** with the `explain()` line; at 91: raw mass **4.35 %** “over θ, but from one anchor only”, still refused | “The payer is a contract that asks ANCRE before every x402 payment. The farm pumps its target to a hundred: refused. Now one anchor is compromised and endorses it: trust is computed leaving any one anchor out. Still refused.” |
| 8 | 1:35-2:00 | `/live?at=107`, `→` to `at=109`; then `at=117` | provider-2 **Paid**; anchor-B slash −100; next payment **Refused · ANCRE_STATUS (VETOED, tag slash)**; Circuit breaker box (blocks, ms, “MEASURED on …”); scene 5: a third-party +1, still vetoed | “A provider goes bad; an anchor slashes it. The very next payment is refused: the veto is read live from the registry, no recertification needed. A plus-one from someone else doesn't erase it.” — **“block N plus one, 300 ms” only on a testnet run** (box reads “MEASURED on testnet”). |
| 9 | 2:00-2:15 | `/live?at=120`, or agent page → tab **Certificates** | **✕ rejected · EdgeMismatch(2, 1)**, “fabricated edge, simulated: nothing broadcast”; level “Registry-verified, attested submitter” | “The certificate is Registry-verified: every edge is re-read in the ERC-8004 registry, so a fabricated one is rejected at submission.” |
| 10 | 2:15-2:40 | Discover, zoom on the **feed**: tab “ERC-8004 registry” (Envio head + WebSocket dot), then tab “ANCRE” | Registry events of the network, live; ANCRE certificates, the veto, the payer's decisions | “The registry data comes from our Envio indexer, with the chain's WebSocket for real time. ANCRE is the reference implementation of a draft ERC, chain-agnostic.” Bounties: **Envio** (shown); **Alchemy** only once wired (not on screen yet); **Mera** cut unless a real two-device run exists. MetaMask: integration only, not a bounty (D53), README only. |
| 11 | 2:40-2:55 | Final card (not the screen) | name, tagline, repo, contract addresses | “The standard leaves Sybil filtering to the reader. ANCRE is that reader, and it refuses to pay.” |

Total 2:55; with shot 4: ~3:05 → cut shot 4 first, then scene 5 inside shot 8, then the ANCRE tab of shot 10.
**Never cut** 2, 3, 6, 7, 8 (D52).

## Honesty checklist (read before each take)

- Mainnet = **preview**: “computed by our reference solver, not certified on-chain”, snapshot block shown in the
  source line (110,994,810 on 07/10). Never “certified” for a mainnet number.
- Testnet numbers come from a **recorded run**: the page says whether it ran on the testnet or on a fork. Fork
  latencies are anvil's: never quote them as Monad latencies.
- The demo agents of a fork run (#2022…#2035) are **not** the testnet agents with those numbers (AM-07bis.1): never
  open them on 8004scan.
- The screener `0xa06f…43a4` is “an automated risk-screening service”, never an attacker. Third-party addresses
  are on-chain facts, never accusations.
- 8004scan is cited (“Source: 8004scan public API, fetched …”); never say it is wrong; say ANCRE adds a layer.
- No override in the video (D51); in the README only: a human, from their own wallet (D47).

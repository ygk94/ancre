# ANCRE x Alchemy: where Alchemy sits in the flow

> For the jury of "Best Projects using Alchemy" (Monad Metropolis). Written 2026-10-10.
> Every number carries its status: **MEASURED** (we ran it, date given), **DOC** (Alchemy documentation),
> **NOT MEASURED** (to be measured, not claimed).

ANCRE certifies, on-chain, how much trust a reader's chosen anchors give each ERC-8004 agent, so that a contract can
check it before it pays (`TrustGatedPayer`, ERC-1271). Two things only Alchemy does for us:

1. **Alchemy Custom Webhooks trigger recertification.** A certificate must change when the trust graph changes, and
   only then (not on a timer, not on every block). The webhook is what tells the certifier *that* the graph changed.
2. **Alchemy Transfers API explains a zero.** When ANCRE gives the registry's most-rated agent (Eve-8004, #182) a
   mass of 0, the agent page shows who funded its raters, from the chain itself.

Plus: **every chain read and transaction of the certifier goes through the Alchemy Monad RPC** (node table,
current certificate, `eth_estimateGas`, `submitCertificate`).

## 1. The flow

```
 ERC-8004 registries (Monad testnet)         ANCRE contract (AnchoredReputation 0x8bE6…da9B)
  NewFeedback / FeedbackRevoked / Transfer     CertificateSubmitted / EdgeProven / RowVoided
  MetadataSet / Approval / Upgraded
          │                                            │
          └──────────────┬─────────────────────────────┘
                         ▼
        ┌──────────────────────────────────┐
        │ Alchemy Custom Webhook (GraphQL)  │   one POST per block with a matching log,
        │ network MONAD_TESTNET             │   signed: X-Alchemy-Signature = HMAC-SHA256
        └──────────────────────────────────┘
                         │ HTTPS (Cloudflare tunnel during the demo)
                         ▼
   solver/alchemy_hook.py serve  ──  1. verify the HMAC on the raw body (401 otherwise), answer 200 at once
                                     2. dedup by (txHash, logIndex); keep only events that can change the
                                        certificate (certifier.relevant: the client carries mass, or the agent
                                        is in the graph)
                                     3. fresh data: wait for the Envio indexer to reach the event's block,
                                        export the registry state at its head (≈ 2 s)
                                     4. Certifier.run_once: rebuild the graph, PPR certificate, align on the
                                        on-chain node table ──► reads through the Alchemy Monad RPC
                                     5. prepare (dry) or send submitCertificate ──► Alchemy Monad RPC
                                     6. a CertificateSubmitted comes back through the same webhook ──► the watcher
                                        audits it (Registry-verified edges, proofs if it overstates)
                         │
                         ▼
   journal (JSONL) + one console line per step, ending with
   TIMELINE  event block N -> webhook at head +k blocks -> certificate in block M (+d blocks, t ms)

   Fallback: a poller covers the same events with eth_getLogs every 30 s (through the same dedup), so a missed
   POST is still processed. The webhook gives latency; the poller gives completeness.

 Agent page of the screen (Netlify)
   "Who funded the raters?" ── committed measure (solver/funders.py, Alchemy Transfers API)
                            └─ live re-check of 6 raters: browser ──► /api/funders (Netlify Function, holds
                               ALCHEMY_API_KEY) ──► alchemy_getAssetTransfers on Monad mainnet
```

Division of labour with Envio (also a sponsor, stated the same way in both submissions): **Envio is the history**
(the indexer the certificate is computed from, and the auditor's data); **Alchemy is the trigger and the chain
access**. Why the data does not come from the Alchemy RPC itself: the registry has no per-client index, so
rebuilding the graph needs the whole event history, and the Free tier caps `eth_getLogs` at 10 blocks per call
(MEASURED, 2026-10-10, error -32600 on `monad-testnet.g.alchemy.com`).

## 2. What is measured

| What | Value | Status |
|---|---|---|
| Signed webhook payloads rebuilt from real testnet logs (blocks 68 979 070 to 68 979 110: an anchor's slash, the certificate that followed, a third party's review), replayed to the receiver | 3 accepted (200), the same 3 with a wrong key refused (401) | MEASURED 2026-10-10, `docs/chantiers/rapports/alchemy-live/e2e-replay-20261010.*` |
| Webhook reception → recertification **prepared** (fresh Envio export + recompute + `eth_estimateGas` through Alchemy), official instance | **3.6 s** (3 587.6 ms; Envio export 1.97 s of it) | MEASURED 2026-10-10, same files, local receiver |
| Certificate recomputed from the fresh export vs. the certificate on chain | same `graphRoot` `0xc370…abb2` and `vectorRoot` `0x4c83…f70f` | MEASURED 2026-10-10 |
| `eth_estimateGas` of the prepared `submitCertificate` (7 nodes, 7 rows, Registry-verified) | 560 952 gas, limit 608 024 | MEASURED 2026-10-10 through Alchemy |
| Envio indexer behind the testnet head at reception | 0 to 95 blocks (five readings) | MEASURED 2026-10-10 |
| Alchemy Free tier, `eth_getLogs` | 10 blocks per call | MEASURED 2026-10-10 |
| On-chain block → webhook delivery, commit state of the block at delivery | **median 1.3 s** (0.7-2.1 s, 14 steady deliveries; block timestamps have 1 s resolution), block **Finalized at reception in 17 of 18** deliveries, 2 blocks behind `latest`. The first 4 deliveries, sent right after the webhook was created, arrived about 77 s late (backlog) | MEASURED 2026-10-10, 11:54-11:58 UTC, Monad testnet, `docs/chantiers/rapports/alchemy-live/webhook-testnet-2026-10-10.jsonl` |
| Webhook → certificate **submitted** on the testnet | logged by the same line with `--send` | NOT MEASURED |
| Transfers API: first MON of Eve-8004's raters | see §3 | MEASURED 2026-10-10 |

Webhook retries and the delivery format follow the Alchemy docs (DOC: Custom Webhook, `X-Alchemy-Signature`,
retries on non-200). The receiver answers 200 before working, so a slow recertification never causes a retry storm.

## 3. Transfers API: "why zero?"

`solver/funders.py` asks `alchemy_getAssetTransfers` (category `external`, toAddress = rater, from block 0,
ascending, maxCount 1) for the first native MON each rater of Eve-8004 received, and reads `ownerOf(182)`.

| Measure (2026-10-10) | Result | Status |
|---|---|---|
| Random sample of 150 of the 7 665 raters (seed 20261010) | **150 / 150** received their first MON from `0x97cD…0996`, which is `ownerOf(182)`; **150 / 150 exactly 11.0 MON**; 1 distinct first funder | MEASURED, `solver/out/alchemy-funders-182-sample.json` |
| Full scan, interrupted (first 1 135 raters in address order, not a random sample) | 1 135 / 1 135 first funded by the same address; 1 134 with 11.0 MON, 1 with 0.165 MON | MEASURED, partial, not published as a total |
| Same question on 2026-10-06 (another random sample of 150) | 150 / 150, 11.0 MON | MEASURED, `docs/ressources/alchemy.md` |

11.0 MON is 10 MON (Monad's per-account reserve) plus 1 MON. The full scan (7 665 calls) runs at about 1 to 4 calls per
second on the Free tier (HTTP 429 above, MEASURED); `funders.py --all` resumes where it stopped.

This is not a filter: ANCRE gives #182 a mass of 0 from the anchors alone, before and without this data. A proof of
payment or of funding does not stop a Sybil farm (the farm paid). The panel shows public transfers and their source;
it does not draw conclusions about anyone. Limit: MON received through an internal call is not an `external`
transfer, so such a rater would show "no external MON transfer" (none in this measure).

On the screen: the agent page of #182 (mainnet) has a "Who funded the raters?" panel with the committed measure
(source and date) and a live re-check of 6 raters through a Netlify Function. The function holds the key server
side, accepts exactly one parameter (`address`, validated), sends one fixed query, returns five fields, and caches
(10 min in the instance, 1 h at the CDN). Without the function (local dev, no key) the panel says so and shows the
committed measure only.

## 4. Commands

```bash
cd solver
# the GraphQL filter of the webhook (paste in the Alchemy dashboard, network MONAD_TESTNET)
.venv/bin/python alchemy_hook.py query --chain 10143 --ancre 0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B
# receiver on the official testnet instance, dry (prepares, never signs)
.venv/bin/python -u alchemy_hook.py serve --port 8787 --chain 10143 --rpc alchemy \
  --ancre 0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B --set-config sets/testnet-official.json \
  --set-id 0x627c8afe36b03432b280723a7170357333ded4d9ce56a78467c5829739653e10 \
  --indexer https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql \
  --data-dir out/alchemy-live/data --state out/alchemy-live/certifier_state.json --journal out/alchemy-live/alchemy.jsonl
# replay real testnet logs, signed, to a local receiver
.venv/bin/python alchemy_hook.py payloads --rpc https://testnet-rpc.monad.xyz --chain 10143 \
  --from-block 68979070 --to-block 68979110 --ancre 0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B --out /tmp/p.jsonl
.venv/bin/python alchemy_hook.py replay --file /tmp/p.jsonl --url http://127.0.0.1:8787/alchemy
# the Transfers API measure
.venv/bin/python funders.py --all --app-out ../app/src/data/funders-182.json
# tests
.venv/bin/python -m pytest -q tests          # solver (test_alchemy.py, test_alchemy_live.py)
cd ../app && npm test                        # screen + Netlify function (test/funders*.test.ts*)
```

The live event for the video is one anchor feedback on the official instance (`demo/trigger.ts`: anchor-A vouches
for provider-3), sent by the team during the shoot. It cannot move a payment: it is an ordinary ERC-8004 rating, and
in ANCRE an agent can never force a payment (only a human can override a refusal, from their own wallet).

## 5. Code

- `solver/alchemy_hook.py`: receiver, signature, dedup, fresh data, timeline, console, GraphQL filter, replay tools.
- `solver/certifier.py`: `run_once(prepare=True)`; Alchemy URL passed to `cast` through `ETH_RPC_URL` (never on a
  command line), 10-block `eth_getLogs` chunks on Alchemy.
- `solver/funders.py`: the Transfers API measure. `solver/out/alchemy-funders-182*.json`: its outputs.
- `app/netlify/functions/funders.mts`, `app/src/core/funders.ts`, `app/src/ui/Funders.tsx`: the screen side.
- Tests: `solver/tests/test_alchemy.py`, `solver/tests/test_alchemy_live.py`, `app/test/funders.test.ts`,
  `app/test/funders-panel.test.tsx`.

// "Who funded the raters?" panel of the agent page (D55 ②, alchemy-live). It answers "why zero?" with on-chain
// facts: where each rater's first MON came from, read with the Alchemy Transfers API. It does not change any
// number of the page (ANCRE gives the mass without this data) and it draws no conclusion about anyone.
import { useEffect, useState } from "react";
import funders182 from "../data/funders-182.json";
import { liveCheck, monOf, pick, type LiveResult } from "../core/funders";
import { int } from "../lib/format";
import { Addr, SourceLine } from "./common";

type Measure = typeof funders182;
/** Committed measures by network and agent (solver/funders.py --app-out). */
const MEASURES: Record<string, Measure> = { "mainnet:182": funders182 };
const LIVE_RATERS = 6;

export function fundersMeasure(net: string, id: string): Measure | null {
  return MEASURES[`${net}:${id}`] ?? null;
}

export function FundersPanel({ m, owner }: { m: Measure; owner: string | null | undefined }) {
  const s = m.summary;
  const sampled = m.sample ? `a random sample of ${int(s.raters)} of its ${int(m.population)} raters` : `all ${int(m.population)} of its raters`;
  const top = s.amounts[0];
  const [live, setLive] = useState<LiveResult | "loading">("loading");
  const [cands] = useState(() => pick(m.rows.map((r) => r.rater), LIVE_RATERS, Date.now() % 1_000_003));
  useEffect(() => {
    let dead = false;
    liveCheck(cands, (u) => fetch(u)).then((r) => !dead && setLive(r));
    return () => {
      dead = true;
    };
  }, [cands]);
  const ownerNow = (owner ?? "").toLowerCase();
  const ownerChanged = ownerNow && ownerNow !== m.owner;
  return (
    <section className="card">
      <div className="card-h">
        <h2>Who funded the raters?</h2>
        <span className="muted small">first MON received by each rater</span>
      </div>
      <div className="card-b">
        <p style={{ margin: 0 }}>
          In {sampled}, <b>{int(s.firstFundedByOwner)}</b> received their first MON from <Addr a={m.owner} />, the address that owns this agent
          {ownerChanged ? " at the time of the measure" : ""}
          {top ? (
            <>
              {" "}
              ({int(top.raters)} of them exactly {monOf(top.wei)} MON)
            </>
          ) : null}
          .{s.noExternalFunding ? ` ${int(s.noExternalFunding)} received no MON through an external transaction.` : ""}
        </p>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          These are public on-chain transfers. ANCRE's mass for this agent does not use them: it comes from the anchors alone.
        </p>
      </div>
      <LiveRows live={live} owner={m.owner} />
      <div className="card-b note" style={{ marginTop: 0 }}>
        <SourceLine
          status="MEASURED"
          text={`Alchemy Transfers API, ${m.measuredAt.slice(0, 10)} (${m.measuredAt.slice(11, 16)} UTC), ${m.sample ? `sample seed ${m.sample.seed}` : "every rater"}; raters from ${m.ratersSource.split(" ")[0]}`}
          detail="alchemy_getAssetTransfers, category external, from block 0, ascending, maxCount 1: the first native MON transfer to each rater (solver/funders.py)"
        />
        {live !== "loading" && live.ok && <SourceLine status="LIVE" text={`Alchemy Transfers API via this site's server function, ${live.rows[0]?.fetchedAt.slice(0, 19).replace("T", " ")} UTC`} />}
        {live !== "loading" && !live.ok && <SourceLine status="COMMITTED" text={`live re-check unavailable (${live.reason}): only the committed measure is shown`} />}
      </div>
    </section>
  );
}

function LiveRows({ live, owner }: { live: LiveResult | "loading"; owner: string }) {
  if (live === "loading") return <div className="card-b muted small">Re-checking {LIVE_RATERS} raters live…</div>;
  if (!live.ok) return null;
  const same = live.rows.filter((r) => r.firstFunding?.from === owner).length;
  return (
    <>
      <div className="card-b" style={{ paddingBottom: 0 }}>
        <b>Live re-check:</b> {same} of {live.rows.length} raters picked now, first MON from the same address.
      </div>
      <ul className="why-list">
        {live.rows.map((r) => (
          <li key={r.rater}>
            <span className="n">{r.firstFunding ? `${monOf(r.firstFunding.wei)} MON` : "—"}</span>
            <span>
              rater <Addr a={r.rater} /> ← {r.firstFunding ? <Addr a={r.firstFunding.from} /> : "no external MON transfer"}
              {r.firstFunding?.from === owner ? <span className="muted"> (agent owner)</span> : null}
            </span>
            <span className="w zero">{r.firstFunding ? `block ${int(r.firstFunding.block)}` : ""}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

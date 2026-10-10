// Leaderboard: every agent ANCRE evaluates under your anchors, ranked by leave-one-out mass. On mainnet, the
// explorer's own top 10 (8004scan total_score, quoted from a dated snapshot) sits under it, read through ANCRE.
import scan from "../data/scan-snapshot.json";
import { reachText } from "../core/model";
import { fmtDate, int } from "../lib/format";
import { href, navigate, type Route } from "../router";
import { act1, type Dataset } from "../sources/useDataset";
import { Mass, rowClick, SourceLine, StatusChip } from "./common";
import { AgentCell, PolicyBar } from "./Discover";

export function Leaderboard({ route, ds, error }: { route: Route; ds: Dataset | null; error: string | null }) {
  if (!ds) return <div className="empty">{error ? `Anchor set unavailable: ${error}` : "Loading the anchor set…"}</div>;
  const ranked = ds.rows.filter((r) => BigInt(r.trust) > 0n || BigInt(r.distrust) > 0n || r.passes);
  const unknown = ds.net === "mainnet" ? Math.max(0, act1.snapshotAgents - ranked.length) : ds.rows.length - ranked.length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leaderboard</h1>
          <p>Ranked by the mass your anchors give, not by how many ratings an agent collected.</p>
        </div>
      </div>
      <PolicyBar route={route} ds={ds} />
      <section className="card">
        <div className="card-h">
          <h2>ANCRE, under your anchors</h2>
          <span className="muted small">
            {int(ranked.length)} reached · {ds.net === "mainnet" ? `the other ${int(unknown)} agents of the registry` : `${int(unknown)} others`}: unknown, mass 0
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Agent</th>
              <th>Status</th>
              <th className="r">Mass</th>
              <th className="r hide-sm">Raw mass</th>
              <th className="r hide-sm">Distrust</th>
              <th className="hide-sm">Reached</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.id} onClick={(e) => rowClick(e, () => navigate(href({ page: "agent", net: r.net, id: r.id }, route)))}>
                <td className="r muted num">{i + 1}</td>
                <td>
                  <AgentCell r={r} route={route} />
                </td>
                <td>
                  <StatusChip row={r} />
                </td>
                <td className="r">
                  <Mass wad={r.trustLow} />
                </td>
                <td className="r hide-sm muted">
                  <Mass wad={r.trust} />
                </td>
                <td className="r hide-sm">
                  <Mass wad={r.distrust} />
                </td>
                <td className="hide-sm">{reachText(r.reach, ds.nameOf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ranked.length === 0 && <div className="empty">Nobody is reachable from these anchors.</div>}
        {ds.net === "mainnet" && ranked.length > 0 && (
          <div className="card-b note" style={{ marginTop: 0 }}>
            Reference solver (computed off-chain, not certified): not a ranking of honest agents. Under independent anchors almost every agent is unknown; the farm is at 0.
          </div>
        )}
      </section>

      {ds.net === "mainnet" && (
        <section className="card">
          <div className="card-h">
            <h2>The explorer's top 10, read by ANCRE</h2>
            <span className="muted small">8004scan total_score, quoted</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Agent</th>
                <th className="r">8004scan score</th>
                <th className="r hide-sm">Ratings</th>
                <th className="r">ANCRE mass</th>
              </tr>
            </thead>
            <tbody>
              {scan.top.slice(0, 10).map((a, i) => {
                const r = ds.rows.find((x) => x.id === a.agentId);
                return (
                  <tr key={a.agentId} onClick={(e) => rowClick(e, () => navigate(href({ page: "agent", net: "mainnet", id: a.agentId }, route)))}>
                    <td className="r muted num">{i + 1}</td>
                    <td>
                      {ds.nameOf(a.agentId)} <span className="muted small">#{a.agentId}</span>
                    </td>
                    <td className="r num contrast">{a.total_score.toFixed(2)}</td>
                    <td className="r num contrast hide-sm">{int(a.total_feedbacks)}</td>
                    <td className="r">
                      <Mass wad={r?.trustLow ?? "0"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="card-b note" style={{ marginTop: 0 }}>
            Source: 8004scan public API ({scan.sort}), fetched {fmtDate(scan.fetchedAt)}. Formula not published: quoted as is, never recomputed.
          </div>
        </section>
      )}
      <SourceLine status={ds.source.status} text={ds.source.text} detail={ds.source.detail} />
    </>
  );
}

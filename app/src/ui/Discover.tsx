// Home: the agents that pass the reader's anchor policy, and right under them the most-rated agents that do not.
// Only what ANCRE adds: status, leave-one-out mass, distrust, reach from the anchors. The registry count is there
// for contrast only (muted): it is what an explorer ranks by.
import type { AgentRow } from "../core/model";
import { reachText } from "../core/model";
import { int, pctU } from "../lib/format";
import { href, navigate, type Route } from "../router";
import { act1, type Dataset } from "../sources/useDataset";
import { Avatar, BigNum, Link, Mass, rowClick, SourceLine, StatusChip } from "./common";
import { OnchainSetCard } from "./Onchain";

export function Discover({ route, ds, error }: { route: Route; ds: Dataset | null; error: string | null }) {
  if (!ds) return <div className="empty">{error ? `Anchor set unavailable: ${error}` : "Loading the anchor set…"}</div>;
  const pass = ds.rows.filter((r) => r.passes);
  const refused = ds.rows
    .filter((r) => !r.passes)
    .sort((a, b) => (b.explorer?.ratings ?? 0) - (a.explorer?.ratings ?? 0))
    .slice(0, 5);
  const open = (r: AgentRow) => navigate(href({ page: "agent", net: r.net, id: r.id }, route));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agents that pass your anchor policy</h1>
          <p>An explorer lists every agent. ANCRE keeps the ones your anchors reach, and a contract checks it before it pays.</p>
        </div>
      </div>
      {ds.net === "mainnet" && <OnchainSetCard route={route} nameOf={ds.nameOf} />}
      {ds.net === "mainnet" && (
        <h2 className="section-h">
          The whole registry, read by the reference solver <span className="pill warn">COMPUTED · not certified on-chain</span>
        </h2>
      )}
      <PolicyBar route={route} ds={ds} />

      <section className="card">
        <div className="card-h">
          <h2>
            {ds.net === "mainnet" ? "Reached from these anchors" : "Pass"} <span className="muted num">{pass.length}</span>
          </h2>
          <span className="muted small">
            {ds.net === "mainnet" ? `of ${int(act1.snapshotAgents)} agents: every other one is unknown to them` : "ranked by leave-one-out mass"}
          </span>
        </div>
        {pass.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Status</th>
                <th className="r">Mass</th>
                <th className="r hide-sm">Distrust</th>
                <th className="hide-sm">Reached from your anchors</th>
              </tr>
            </thead>
            <tbody>
              {pass.map((r) => (
                <tr key={r.id} onClick={(e) => rowClick(e, () => open(r))}>
                  <td>
                    <AgentCell r={r} route={route} />
                  </td>
                  <td>
                    <StatusChip row={r} />
                  </td>
                  <td className="r">
                    <Mass wad={r.trustLow} />
                  </td>
                  <td className="r hide-sm">
                    <Mass wad={r.distrust} />
                  </td>
                  <td className="hide-sm">{reachText(r.reach, ds.nameOf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {ds.net === "mainnet" && pass.length > 0 && (
          <div className="card-b note" style={{ marginTop: 0 }}>
            Not a ranking of honest agents: real reputation on mainnet is almost empty (a handful of useful edges). What ANCRE shows here is that
            the farm gets nothing. The positive demo is our own traffic, on Monad testnet.
          </div>
        )}
        {pass.length === 0 && (
          <div className="empty">No agent passes under these anchors: every one is unknown to them (mass 0).</div>
        )}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Most rated, refused</h2>
          <span className="muted small">same anchors, same policy</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Agent</th>
              <th className="r">Ratings in the registry</th>
              <th className="r hide-sm">Naive average</th>
              <th className="r">ANCRE mass</th>
              <th className="hide-sm">Why</th>
            </tr>
          </thead>
          <tbody>
            {refused.map((r) => (
              <tr key={r.id} onClick={(e) => rowClick(e, () => open(r))}>
                <td>
                  <AgentCell r={r} route={route} />
                </td>
                <td className="r num contrast">{r.explorer ? int(r.explorer.ratings) : "—"}</td>
                <td className="r num contrast hide-sm">{r.explorer?.naive ? <BigNum value={r.explorer.naive} /> : "—"}</td>
                <td className="r">
                  <Mass wad={r.trustLow} />
                </td>
                <td className="hide-sm">
                  <StatusChip row={r} /> <span className="muted small">{r.why}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <SourceLine status={ds.source.status} text={ds.source.text} detail={ds.source.detail} />
      <details className="more">
        <summary>How to read this</summary>
        <p>
          <b>Mass</b> is the share of your anchors' trust that reaches the agent (personalised PageRank from your anchors), computed leaving out the
          largest single anchor (m = {ds.policy.m}): one anchor alone can never make a contract pay. An agent passes when that mass is at least θ ={" "}
          {ds.policy.thetaPct} % and its distrust stays under ρ = {ds.policy.rho} of it, with no anchor veto.
        </p>
        <p>
          <b>Ratings</b> and <b>naive average</b> count every rater, as an explorer does: anyone can rate, for free. They are shown for contrast, and
          never enter the mass.
        </p>
      </details>
    </>
  );
}

export function AgentCell({ r, route }: { r: AgentRow; route: Route }) {
  return (
    <Link to={href({ page: "agent", net: r.net, id: r.id }, route)} className="rowlink">
      <span className="agent">
        <Avatar id={r.id} name={r.name} />
        <span>
          <span className="nm">{r.name}</span> <span className="id">#{r.id}</span>
        </span>
      </span>
    </Link>
  );
}

/** The reader's policy in one line, and (mainnet) the choice of anchors. */
export function PolicyBar({ route, ds }: { route: Route; ds: Dataset }) {
  const p = ds.policy;
  const fork = ds.run && ds.run.header.network.mode !== "testnet";
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-b policy">
        <span>
          Anchors{" "}
          {ds.lenses.length ? (
            <select
              className="lens"
              value={ds.lensId ?? ""}
              onChange={(e) => navigate(href({ page: route.page === "leaderboard" ? "leaderboard" : "discover", lens: e.target.value }, route), true)}
              aria-label="Anchor set"
            >
              {ds.lenses.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          ) : (
            <b>{p.anchors.map((a) => a.label).join(", ")}</b>
          )}
        </span>
        <span>
          m = <b>{p.m}</b>
        </span>
        <span>
          θ = <b>{p.thetaPct} %</b>
        </span>
        <span>
          ρ = <b>{p.rho}</b>
        </span>
        {p.alpha && (
          <span>
            α = <b>{p.alpha}</b>
          </span>
        )}
        <span className="spacer" style={{ flex: 1 }} />
        {ds.net === "mainnet" ? (
          <span className="pill warn">reference solver · computed off-chain, not certified</span>
        ) : fork ? (
          <span className="pill warn">{p.level} · recorded on a fork of the testnet</span>
        ) : (
          <span className="pill good">{p.level} · on-chain</span>
        )}
      </div>
      {ds.lenses.length > 0 && (
        <div className="card-b muted small" style={{ paddingTop: 0 }}>
          {ds.lenses.find((l) => l.id === ds.lensId)?.blurb}
          {ds.farm && (
            <>
              {" "}
              Mass reaching Eve's farm ({int(ds.farm.agents)} agents): <b className="num">{pctU(ds.farm.mass)}</b>.
            </>
          )}
        </div>
      )}
    </div>
  );
}

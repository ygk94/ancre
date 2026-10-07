// Agent page, organised like an explorer's agent page (identity card, tabs, side panel), but with ANCRE's outputs
// only: the verdict under the reader's policy, the masses, why each rating counts or not (D49), how trust reaches
// the agent (D50), the certificates and the payer's decisions. No copy of an explorer's fields beyond identity.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { chainIdOf, scanUrl } from "../config/networks";
import { COUNTS, reachText, whyText, type AgentRow, type ReviewGroup } from "../core/model";
import { trustRoutes } from "../core/path";
import { ratingValue } from "../core/feed";
import { agentIdentities, agentRatings, agentRegistryView, type AgentIdentity, type AgentRegistryView, type EnvioRating } from "../lib/envio";
import { bound, int, pct, pctU, short } from "../lib/format";
import { href, type Route } from "../router";
import { act1, type Dataset } from "../sources/useDataset";
import { Addr, Avatar, BigNum, Link, Mass, Meter, SourceLine, StatusChip } from "./common";

const TABS = [
  ["overview", "Overview"],
  ["ratings", "Ratings"],
  ["path", "Trust path"],
  ["certificates", "Certificates"],
  ["payments", "Payments"],
] as const;
type Tab = (typeof TABS)[number][0];

export function AgentPage({ route, ds, error }: { route: Route & { page: "agent" }; ds: Dataset | null; error: string | null }) {
  const { net, id } = route;
  const tab: Tab = (TABS.find((t) => t[0] === route.tab)?.[0] ?? "overview") as Tab;
  // a "demo" agent lives in the recorded run's fork; a "testnet" agent of the real chain is only in the set
  // when the run itself was played on the testnet (AM-07bis.1)
  const inSet = ds && (net === "mainnet" ? ds.net === "mainnet" : ds.run && (net === "demo") === (ds.run.header.network.mode !== "testnet"));
  const row = inSet ? (ds!.rows.find((r) => r.id === id) ?? null) : null;
  const chain = net === "demo" ? null : chainIdOf(net);
  const live = useLiveRegistry(chain, id);
  if (!ds && !error) return <div className="empty">Loading…</div>;

  const name =
    row?.name ?? (net === "mainnet" ? ds?.nameOf(id) : null) ?? live.identity?.name ?? `Agent #${id}`;
  const back = href({ page: "discover", network: net === "mainnet" ? "mainnet" : "testnet", lens: route.lens }, route);
  const tabHref = (t: Tab) => href({ page: "agent", net, id, tab: t === "overview" ? null : t, lens: route.lens } as Route, route);
  const ratingsCount = row ? ds!.reviewsTotal(id) : (live.registry?.feedbacks ?? null);

  return (
    <>
      <Link to={back} className="back">
        ← Discover
      </Link>
      <section className="card idcard">
        <Avatar id={id} name={name} lg />
        <div className="who">
          <h1>
            {name} <span className="muted">#{id}</span>
          </h1>
          <div className="meta">
            <span>{net === "mainnet" ? "Monad mainnet" : net === "testnet" ? "Monad testnet" : "Demo agent · anvil fork of Monad testnet"}</span>
            <span>
              owner <Addr a={row?.owner ?? live.identity?.owner ?? live.registry?.owner} />
            </span>
            {(() => {
              const w = row?.wallet ?? live.identity?.wallet ?? live.registry?.wallet;
              return w && !/^0x0+$/.test(w) ? (
                <span>
                  agentWallet <Addr a={w} />
                </span>
              ) : null;
            })()}
            {net !== "demo" && (
              <a href={scanUrl(net, id)} target="_blank" rel="noreferrer">
                view on 8004scan ↗
              </a>
            )}
          </div>
        </div>
        <div className="verdict">
          {row ? (
            <StatusChip row={row} />
          ) : (
            <span className="chip none">— {net === "mainnet" ? "Unknown to your anchors" : "No certificate"}</span>
          )}
          <div className="sub">{row ? row.why : net === "mainnet" ? "mass 0 under these anchors (reference solver)" : "no ANCRE certificate covers this agent"}</div>
        </div>
      </section>

      <nav className="tabs" aria-label="Agent sections">
        {TABS.map(([t, label]) => (
          <Link key={t} to={tabHref(t)} current={t === tab}>
            {label}
            {t === "ratings" && ratingsCount !== null && <span className="count">{int(ratingsCount)}</span>}
          </Link>
        ))}
      </nav>

      <div className="agent-grid">
        <div>
          {!row && <NotInSet net={net} ds={ds} />}
          {tab === "overview" && row && ds && <Overview row={row} ds={ds} live={live.registry} />}
          {tab === "ratings" && (row && ds ? <Ratings id={id} ds={ds} /> : <RawRatings chain={chain} id={id} />)}
          {tab === "path" && row && ds && <Path id={id} row={row} ds={ds} />}
          {tab === "certificates" && <Certificates row={row} ds={ds} />}
          {tab === "payments" && <Payments id={id} row={row} ds={ds} />}
        </div>
        <aside>
          {ds && <PolicyCard ds={ds} inSet={!!row} />}
          <Sources net={net} ds={ds} row={row} live={live.registry !== null} />
        </aside>
      </div>
    </>
  );
}

function useLiveRegistry(chain: number | null, id: string) {
  const [registry, setRegistry] = useState<AgentRegistryView | null>(null);
  const [identity, setIdentity] = useState<AgentIdentity | null>(null);
  useEffect(() => {
    setRegistry(null);
    setIdentity(null);
    if (chain === null) return;
    let dead = false;
    agentRegistryView(chain, id).then((v) => !dead && setRegistry(v), () => undefined);
    agentIdentities(chain, [id]).then((v) => !dead && setIdentity(v[id] ?? null), () => undefined);
    return () => {
      dead = true;
    };
  }, [chain, id]);
  return { registry, identity };
}

function NotInSet({ net, ds }: { net: string; ds: Dataset | null }) {
  const fork = ds?.run && ds.run.header.network.mode !== "testnet";
  return (
    <div className="banner info">
      {net === "mainnet"
        ? "Under these anchors the reference solver gives this agent no mass: it is unknown to them. Nothing is certified on mainnet yet (preview)."
        : fork
          ? "No ANCRE certificate covers this agent: the anchor set on this screen is a recorded run on a fork of the testnet, whose demo agents are other agents with the same numbers. Its registry ratings are listed, not weighted."
          : "This agent is not in the certified anchor set's graph: mass 0, unknown to the anchors."}
    </div>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ row, ds, live }: { row: AgentRow; ds: Dataset; live: AgentRegistryView | null }) {
  const massPct = Number(BigInt(row.trustLow)) / 1e16;
  // registry side: live Envio on a real chain, else the run log / the solver snapshot
  const ex = row.net === "demo" || !live ? row.explorer : { ratings: live.feedbacks, raters: live.clients, naive: live.naiveAverage };
  const oneAnchor = BigInt(row.trust) > 0n && row.trustLow === "0";
  return (
    <>
      <section className="card">
        <div className="card-h">
          <h2>Under your anchors</h2>
          <span className="muted small">{row.status ? `assess() status ${row.status}` : "reference solver, off-chain"}</span>
        </div>
        <div className="card-b">
          <Meter massPct={massPct} thetaPct={ds.policy.thetaPct} />
        </div>
        <div className="metrics">
          <Metric label="Mass, leave-one-out" val={<Mass wad={row.trustLow} />} sub={`compared with θ = ${ds.policy.thetaPct} %`} />
          <Metric label="Raw mass Σλt" val={<Mass wad={row.trust} />} sub={oneAnchor ? "from one anchor only" : "before leave-one-out"} />
          <Metric label="Distrust" val={<Mass wad={row.distrust} />} sub="one hop, from slashes" />
          <Metric label="Error bound e" val={bound(row.e)} sub="certificate, upper" />
          <Metric label="Certificate" val={row.certBlock ? `block ${int(row.certBlock)}` : "—"} sub={row.certBlock ? "the one assess() read" : ds.net === "mainnet" ? "none on mainnet" : "NO_CERT"} />
        </div>
      </section>
      <section className="card">
        <div className="vs">
          <div>
            <div className="lbl">Registry: every rater, every tag</div>
            <div className="val">
              {ex ? (
                <>
                  {int(ex.ratings)} ratings · avg {ex.naive ? <BigNum value={ex.naive} /> : "—"}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="sep" />
          <div className="ours">
            <div className="lbl">ANCRE: what your anchors carry</div>
            <div className="val">
              <Mass wad={row.trustLow} /> · {reachText(row.reach, ds.nameOf)}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const Metric = ({ label, val, sub }: { label: string; val: ReactNode; sub?: string }) => (
  <div className="metric">
    <div className="lbl">{label}</div>
    <div className="val">{val}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

// ------------------------------------------------------------------ D49: ratings and their effective weight
function fold(gs: ReviewGroup[]): ReviewGroup[] {
  const m = new Map<string, ReviewGroup>();
  for (const g of gs) {
    const k = `${g.why}|${g.tag}|${g.value}|${g.via.join(",")}|${g.w}`;
    const p = m.get(k);
    if (p) m.set(k, { ...p, count: p.count + g.count, contribution: p.contribution && g.contribution ? (BigInt(p.contribution) + BigInt(g.contribution)).toString() : p.contribution });
    else m.set(k, { ...g });
  }
  return [...m.values()].sort((a, b) => Number(COUNTS.has(b.why)) - Number(COUNTS.has(a.why)) || b.count - a.count);
}

function Ratings({ id, ds }: { id: string; ds: Dataset }) {
  const groups = useMemo(() => fold(ds.reviewsOf(id)), [ds, id]);
  const perm = ds.permissiveOf(id);
  const total = ds.reviewsTotal(id);
  const counted = groups.filter((g) => COUNTS.has(g.why)).reduce((s, g) => s + g.count, 0);
  return (
    <section className="card">
      <div className="card-h">
        <h2>Why each rating counts, or not</h2>
        <span className="muted small">
          {total !== null ? `${int(counted)} of ${int(total)} carry weight` : ""}
        </span>
      </div>
      {groups.length === 0 ? (
        <div className="empty">No rating in this anchor set's data.</div>
      ) : (
        <ul className="why-list">
          {groups.map((g, i) => (
            <li key={i}>
              <span className="n">{int(g.count)}×</span>
              <span>{whyText(g, ds.nameOf)}</span>
              <Weight g={g} />
              <span className="sub">
                tag <span className="mono">{g.tag}</span>
                {g.value !== null ? ` · value ${g.value}` : ""}
                {g.author ? (
                  <>
                    {" · "}
                    {g.count > 1 ? "e.g. " : "by "}
                    {labelOrAddr(ds, g.author)}
                  </>
                ) : null}
                {g.block ? ` · block ${int(g.block)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {perm && <Permissive groups={perm} />}
      <div className="card-b note" style={{ marginTop: 0 }}>
        {ds.net === "mainnet"
          ? "Weights from the reference solver's certificate: a rating adds (1 − α) × its author's mass × its normalised weight. COMPUTED, not on-chain."
          : "Rules R2-R6 of the norm applied by this screen to the logged ratings, with the tag schema committed in the set; the weight shown is the normalised rating w (−1 to 1). Contributions are not in the run log: “—”."}
      </div>
    </section>
  );
}

function labelOrAddr(ds: Dataset, a: string) {
  const l = ds.labelOf(a);
  return l !== a ? l : <Addr a={a} />;
}

function Weight({ g }: { g: ReviewGroup }) {
  if (g.contribution !== null && (COUNTS.has(g.why) || g.why === "unreachable")) {
    const c = BigInt(g.contribution);
    return <span className={`w ${c > 0n ? "pos" : c < 0n ? "neg" : "zero"}`}>{c === 0n ? "+0" : `${c > 0n ? "+" : "−"}${pctU((c < 0n ? -c : c).toString())}`}</span>;
  }
  if (!COUNTS.has(g.why) && g.why !== "unreachable") return <span className="w zero">—</span>;
  if (g.w !== null && COUNTS.has(g.why)) return <span className={`w ${g.w > 0 ? "pos" : "neg"}`}>w {(g.w / 10_000).toFixed(2)}</span>;
  if (g.w !== null) return <span className="w zero">w {(g.w / 10_000).toFixed(2)} → 0</span>;
  return <span className="w zero">—</span>;
}

function Permissive({ groups }: { groups: ReviewGroup[] }) {
  const unreachable = groups.filter((g) => g.why === "unreachable").reduce((s, g) => s + g.count, 0);
  const oob = groups.filter((g) => g.why === "out_of_bounds").reduce((s, g) => s + g.count, 0);
  if (!unreachable && !oob) return null;
  return (
    <div className="card-b" style={{ borderTop: "1px solid var(--line)" }}>
      <b>Even if every tag counted</b>
      <span className="muted">
        {" "}
        (same two anchors, every tag read as an endorsement): {unreachable ? `${int(unreachable)} would count for 0, their authors are not reachable from your anchors` : ""}
        {unreachable && oob ? "; " : ""}
        {oob ? `${int(oob)} would be rejected, out of bounds` : ""}.
      </span>
    </div>
  );
}

/** Registry ratings of an agent outside the set: listed, not weighted. */
function RawRatings({ chain, id }: { chain: number | null; id: string }) {
  const [rs, setRs] = useState<EnvioRating[] | null | "error">(null);
  useEffect(() => {
    if (chain === null) return;
    let dead = false;
    agentRatings(chain, id).then((v) => !dead && setRs(v), () => !dead && setRs("error"));
    return () => {
      dead = true;
    };
  }, [chain, id]);
  if (chain === null) return null;
  return (
    <section className="card">
      <div className="card-h">
        <h2>Ratings in the registry</h2>
        <span className="muted small">latest 50, via Envio · not weighted</span>
      </div>
      {rs === null ? (
        <div className="empty">Loading…</div>
      ) : rs === "error" ? (
        <div className="empty">Envio unreachable.</div>
      ) : rs.length === 0 ? (
        <div className="empty">No rating.</div>
      ) : (
        <ul className="why-list">
          {rs.map((r) => (
            <li key={r.id}>
              <span className="n">{ratingValue(r.value, r.valueDecimals)}</span>
              <span>
                <span className="mono">{r.tag1 || "no tag"}</span> · by <Addr a={r.client} />
                {r.revokedAtBlock ? " · revoked" : ""}
              </span>
              <span className="w zero">—</span>
              <span className="sub">block {int(r.blockNumber)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ D50: trust path
function Path({ id, row, ds }: { id: string; row: AgentRow; ds: Dataset }) {
  const routes = useMemo(() => trustRoutes(id, ds.inboundOf), [id, ds]);
  const massOf = (a: string) => ds.rows.find((r) => r.id === a)?.trust ?? null;
  return (
    <section className="card">
      <div className="card-h">
        <h2>How trust reaches this agent</h2>
        <span className="muted small">{reachText(row.reach, ds.nameOf)}</span>
      </div>
      {routes.length === 0 ? (
        <div className="empty">No route from your anchors reaches this agent: it is unknown to them, whatever its ratings say.</div>
      ) : (
        routes.map((r, i) => (
          <div className="route" key={i}>
            <span className="node anchor">
              ⚓ {r.anchors.map((a) => ds.labelOf(a)).join(", ")}
              <small>{r.anchors.length === 1 ? "your anchor" : "your anchors"}</small>
            </span>
            {r.agents.map((a) => (
              <span key={a} style={{ display: "contents" }}>
                <span className="arrow">→</span>
                <span className={`node${a === id ? " target" : ""}`}>
                  {ds.nameOf(a)}
                  <small>raw mass {massOf(a) === null ? "—" : pctU(massOf(a)!)}</small>
                </span>
              </span>
            ))}
          </div>
        ))
      )}
      <div className="card-b note" style={{ marginTop: 0 }}>
        Mass flows from the anchors along positive ratings; at each hop only a share 1 − α moves on (α = {ds.policy.alpha ?? "—"}). Beyond one hop, the Sybil bound still
        holds: a farm only gets what crosses its edges from trusted agents.
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ certificates, payments
function Certificates({ row, ds }: { row: AgentRow | null; ds: Dataset | null }) {
  if (!ds?.run)
    return <div className="banner info">No ANCRE certificate on {ds?.net === "mainnet" ? "mainnet yet: this network is a preview, computed off-chain" : "this network yet"}.</div>;
  const certs = [...ds.run.certificates].reverse();
  return (
    <section className="card">
      <div className="card-h">
        <h2>Certificates of the anchor set</h2>
        <span className="muted small">{row?.certBlock ? `this agent read at block ${int(row.certBlock)}` : ""}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Event</th>
            <th className="r">Cert. block</th>
            <th className="r hide-sm">Nodes</th>
            <th className="r hide-sm">eEff</th>
            <th className="hide-sm">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {certs.map((c) => (
            <tr key={c.seq} style={{ cursor: "default", fontWeight: c.certBlock !== null && c.certBlock === row?.certBlock ? 600 : undefined }}>
              <td>
                {c.action === "certified" ? "✓ accepted" : c.action === "rejected" ? `✕ rejected · ${c.error}` : "◇ skipped (graph unchanged)"}
                <div className="muted small">{c.trigger ?? (c.action === "rejected" ? "fabricated edge, simulated: nothing broadcast" : "")}</div>
              </td>
              <td className="r num">{c.certBlock ? int(c.certBlock) : "—"}</td>
              <td className="r num hide-sm">{c.nCert ?? "—"}</td>
              <td className="r num hide-sm">{c.eEff ? `${c.eEff} wei` : "—"}</td>
              <td className="hide-sm">{c.tx ? <span className="mono">{short(c.tx)}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-b note" style={{ marginTop: 0 }}>
        Proofs of discrepancy: none in this run. Level: {ds.policy.level}. {ds.run.header.network.mode !== "testnet" ? "Transactions are on the anvil fork, not on the testnet." : ""}
      </div>
    </section>
  );
}

function Payments({ id, row, ds }: { id: string; row: AgentRow | null; ds: Dataset | null }) {
  if (!ds?.run || !row)
    return (
      <div className="banner info">
        {ds?.net === "mainnet" && row
          ? `No payer contract on mainnet. Under these anchors the reference solver says: ${row.passes ? "would pay" : "would refuse"} (${row.why}).`
          : "No payment to this agent in the recorded run."}
      </div>
    );
  const ps = ds.run.payments.filter((p) => p.agentId === id).reverse();
  return (
    <section className="card">
      <div className="card-h">
        <h2>Payer decisions</h2>
        <span className="muted small">TrustGatedPayer, x402</span>
      </div>
      {ps.length === 0 ? (
        <div className="empty">No payment attempt to this agent in the recorded run.</div>
      ) : (
        <ul className="why-list">
          {ps.map((p) => (
            <li key={p.seq}>
              <span className={`n ${p.decision === "PAID" ? "" : ""}`} style={{ color: p.decision === "PAID" ? "var(--good)" : "var(--bad)" }}>
                {p.decision === "PAID" ? "✓ paid" : "✕ refused"}
              </span>
              <span>
                {Number(p.amount) / 1e6} USDC · {p.decision === "PAID" ? "settled" : `${p.reason} at ${p.stage}`}
              </span>
              <span className="w zero">block {int(p.block)}</span>
              <span className="sub">
                explain(): status {p.status ?? "—"}, trustLow {p.trustLow ? `${pct(p.trustLow)} %` : "—"}
                {p.facilitator && p.decision !== "PAID" ? ` · facilitator: ${p.facilitator}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="card-b note" style={{ marginTop: 0 }}>
        A refused x402 payment leaves no on-chain trace: each refusal is rebuilt with <span className="mono">TrustGatedPayer.explain()</span> at its
        block. Only a human can override a refusal, from their own wallet (D47); an agent never can.
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ side panel
function PolicyCard({ ds, inSet }: { ds: Dataset; inSet: boolean }) {
  const p = ds.policy;
  return (
    <section className="card">
      <div className="card-h">
        <h2>Your anchor policy</h2>
      </div>
      <div className="card-b kv">
        <div>Anchors</div>
        <div>
          {p.anchors.map((a) => (
            <div key={a.address}>
              {/^0x/.test(a.label) ? "" : `${a.label} `}
              <Addr a={a.address} />
            </div>
          ))}
        </div>
        <div>m (leave-one-out)</div>
        <div>{p.m}</div>
        <div>θ</div>
        <div>{p.thetaPct} %</div>
        <div>ρ</div>
        <div>{p.rho}</div>
        <div>α</div>
        <div>{p.alpha ?? "—"}</div>
        <div>Set id</div>
        <div>{p.setId ? <span className="mono" title={p.setId}>{short(p.setId)}</span> : "— (not on-chain)"}</div>
        <div>Level</div>
        <div>{p.level}</div>
      </div>
      {!inSet && <div className="card-b note" style={{ marginTop: 0 }}>This agent is outside the set's graph.</div>}
    </section>
  );
}

function Sources({ net, ds, row, live }: { net: string; ds: Dataset | null; row: AgentRow | null; live: boolean }) {
  return (
    <section className="card">
      <div className="card-h">
        <h2>Sources</h2>
      </div>
      <div className="card-b note" style={{ marginTop: 0 }}>
        {row && ds && <SourceLine status={ds.source.status} text={`ANCRE numbers: ${ds.source.text}`} detail={ds.source.detail} />}
        {net !== "demo" && (
          <SourceLine status={live ? "MEASURED" : "—"} text={live ? "registry ratings and identity: Envio HyperIndex, live" : "registry ratings: Envio unreachable or loading"} />
        )}
        {net === "demo" && <SourceLine status="RECORDED" text="registry ratings: readAllFeedback by the scene script, on the fork" />}
        {net === "mainnet" && <SourceLine status="QUOTED" text="name: 8004scan public API, dated snapshot" />}
        {net === "mainnet" && row && <SourceLine status="COMPUTED" text={`snapshot block ${int(act1.snapshotBlock)}; θ = ${act1.policy.thetaPct} % applied off-chain`} />}
      </div>
    </section>
  );
}

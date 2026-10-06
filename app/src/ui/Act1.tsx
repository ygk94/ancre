// Act 1: real Monad mainnet (143) data, nothing deployed there.
//  - explorer column: registry facts read live through Envio + 8004scan's own scores, quoted from a dated snapshot
//  - contract column: the reference solver's output (app/src/data/act1.json), labelled as computed off-chain
import { useEffect, useMemo, useState } from "react";
import act1 from "../data/act1.json";
import scan from "../data/scan-snapshot.json";
import { agentRegistryView, chainHead, type AgentRegistryView, type ChainHead } from "../lib/envio";
import { bound, fmtDate, int, pct, pctU, short } from "../lib/format";
import { Avatar, BigNum, Meter, Stat, Verdict } from "./common";

type Lens = (typeof act1.lenses)[number];
type ScanAgent = (typeof scan.top)[number];
const featured = scan.featured as Record<string, ScanAgent>;
type RegistrySnap = { feedbacks: number; clients: number; naiveAverage: string | null; outOfRange: number; topClientShare: number | null; owner: string; wallet: string };
const registry = act1.registry as unknown as Record<string, RegistrySnap>;
type LensAgent = { inSupport: boolean; trust: string; trustRobust: string; distrust: string; verdict: { pay: boolean; reason: string; detail: string } };
type Ranked = LensAgent & { agentId: string };

export const agentName = (id: string) => {
  const n = featured[id]?.name ?? scan.top.find((a) => a.agentId === id)?.name;
  return n ? n.replace(/^monad:\/\//, "") : `Agent #${id}`;
};

// Captions: counts come from the solver snapshot (act1.registry, block act1.snapshotBlock), never typed by hand;
// the explorer column next to them shows the live count, so a drift is visible, not hidden.
const farmShare = Math.round((act1.farm.eveFeedbacks / act1.snapshotFeedbacks) * 100);
const ORDER: string[] = act1.featured; // one list, written by scripts/export_act1.py, read by snapshot-8004scan.mjs
const oneWallet = (id: string) => {
  const r = registry[id];
  return r && r.clients === 1 && r.feedbacks > 1 ? `${int(r.feedbacks)} ratings from a single wallet` : null;
};
const CAPTIONS: Record<string, string> = {
  "182": `${farmShare} % of all mainnet ratings, from one farm`,
  "8317": `${int(act1.selfRating8317.received)} ratings from its own agent wallet`,
  "4": "rated by the honest chain, then slashed",
  "18": "start of the one honest chain",
  "9": oneWallet("9") ?? "",
  "87": oneWallet("87") ?? "",
  "10279": `created ${scan.featured["10279"]?.created_at.slice(0, 10) ?? "?"}, no rating`,
  "10278": `created ${scan.featured["10278"]?.created_at.slice(0, 10) ?? "?"}, no rating`,
};
const CAPTION_SOURCE = `counts: solver snapshot, block ${int(act1.snapshotBlock)}`;

/** The solver exported every featured agent; any other agent's values come from the lens ranking, which lists
 *  every node with non-zero mass or distrust: absent from it means mass 0, unknown to these anchors. */
export function lensAgent(lens: Lens, id: string): LensAgent {
  const a = (lens.agents as Record<string, LensAgent>)[id];
  if (a) return a;
  const r = (lens.ranking as Ranked[]).find((x) => x.agentId === id);
  if (r) return { ...r, inSupport: true };
  return { inSupport: false, trust: "0", trustRobust: "0", distrust: "0", verdict: { pay: false, reason: "UNTRUSTED", detail: "unknown to these anchors (mass 0)" } };
}


export function Act1({ onHead }: { onHead: (h: ChainHead | null) => void }) {
  const [sel, setSel] = useState("182");
  const [lensId, setLensId] = useState("independent");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"agent" | "board">("agent");
  const [reg, setReg] = useState<Record<string, AgentRegistryView | "error">>({});

  // requests are shared (lib/envio memo): an unmounted view just ignores the answer instead of aborting it
  useEffect(() => {
    let dead = false;
    chainHead(143).then(
      (h) => !dead && onHead(h),
      () => !dead && onHead(null),
    );
    return () => {
      dead = true;
    };
  }, [onHead]);

  useEffect(() => {
    if (reg[sel]) return;
    let dead = false;
    agentRegistryView(143, sel).then(
      (v) => !dead && setReg((r) => ({ ...r, [sel]: v })),
      (e) => !dead && (console.warn(e), setReg((r) => ({ ...r, [sel]: "error" }))),
    );
    return () => {
      dead = true;
    };
  }, [sel, reg]);

  const lens = act1.lenses.find((l) => l.id === lensId)! as Lens;
  // search filters the featured agents and the 8004scan top list already in the snapshot (no extra request)
  const list = useMemo(() => {
    const ids = [...ORDER, ...scan.top.map((a) => a.agentId).filter((i) => !ORDER.includes(i))];
    const qq = q.trim().toLowerCase().replace(/^#/, "");
    return ids.filter((id) => !qq || id.includes(qq) || agentName(id).toLowerCase().includes(qq));
  }, [q]);
  const pick = (id: string) => (setSel(id), setView("agent"));

  return (
    <div className="act1">
      <aside className="sidebar">
        <input className="search" placeholder="Search agent name or #id" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="muted" style={{ fontSize: 13 }}>
          Monad mainnet · featured agents, then 8004scan's top {scan.top.length}
        </div>
        <div className="agent-list">
          {list.map((id) => {
            const st = lensAgent(lens, id);
            return (
              <button key={id} className="agent-item" aria-current={id === sel && view === "agent"} onClick={() => pick(id)}>
                <Avatar id={id} name={agentName(id)} />
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{agentName(id)}</div>
                  <div className="id">
                    #{id}
                    {CAPTIONS[id] ? ` · ${CAPTIONS[id]}` : ""}
                  </div>
                </div>
                <span className={`num ${st.trustRobust === "0" ? "muted" : ""}`} style={{ fontSize: 14 }}>
                  {pctU(st.trustRobust)}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="main">
        <div className="viewbar">
          {view === "agent" ? <AgentHead id={sel} reg={reg[sel]} /> : <h1 className="board-title">Leaderboard · Monad mainnet</h1>}
          <div className="controls">
            <button className="ctl" aria-pressed={view === "agent"} onClick={() => setView("agent")}>
              Agent profile
            </button>
            <button className="ctl" aria-pressed={view === "board"} onClick={() => setView("board")}>
              Leaderboard
            </button>
          </div>
        </div>
        <LensPicker lens={lens} setLens={setLensId} />
        {view === "agent" ? (
          <div className="cols">
            <ExplorerColumn id={sel} reg={reg[sel]} />
            <ContractColumn id={sel} lens={lens} />
          </div>
        ) : (
          <Ranking lens={lens} sel={sel} onSel={pick} />
        )}
      </section>
    </div>
  );
}

function AgentHead({ id, reg }: { id: string; reg: AgentRegistryView | "error" | undefined }) {
  const live = reg && reg !== "error" ? reg : null;
  const owner = live?.owner ?? registry[id]?.owner;
  const wallet = live?.wallet ?? registry[id]?.wallet;
  return (
    <div className="agent-head">
      <Avatar id={id} name={agentName(id)} />
      <div>
        <h1>
          {agentName(id)} <span className="muted">#{id}</span>
        </h1>
        <div className="sub">
          Monad mainnet (143) · owner <span className="mono">{short(owner)}</span>
          {wallet && wallet !== owner && !/^0x0+$/.test(wallet) ? (
            <>
              {" "}
              · agentWallet <span className="mono">{short(wallet)}</span>
            </>
          ) : null}
          {CAPTIONS[id] ? (
            <>
              {" "}
              · <span title={CAPTION_SOURCE}>{CAPTIONS[id]}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LensPicker({ lens, setLens }: { lens: Lens; setLens: (s: string) => void }) {
  return (
    <div className="lensbar">
      <span className="lensbar-label">Your anchors</span>
      <div className="lenses">
        {act1.lenses.map((l) => (
          <button key={l.id} className="lens" aria-pressed={l.id === lens.id} onClick={() => setLens(l.id)}>
            {l.title}
            <small>{l.anchors.map((x) => x.label).join(", ")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExplorerColumn({ id, reg }: { id: string; reg: AgentRegistryView | "error" | undefined }) {
  const s = featured[id] ?? scan.top.find((a) => a.agentId === id);
  const snap = registry[id];
  const live = reg && reg !== "error" ? reg : null;
  // live Envio first; the solver snapshot (same registry, older block) only while it loads or if Envio is down
  const feedbacks = live?.feedbacks ?? snap?.feedbacks;
  const naive = live ? live.naiveAverage : (snap?.naiveAverage ?? null);
  const oor = live?.outOfRange ?? snap?.outOfRange ?? 0;
  const clients = live?.clients ?? snap?.clients;
  const rank = scan.top.findIndex((a) => a.agentId === id);
  return (
    <div className="col explorer">
      <h2>What an explorer shows today</h2>
      <div className="hero">
        <div className="value num">{naive === null ? "no rating" : <BigNum value={naive} />}</div>
        <div className="label">
          naive average of {feedbacks !== undefined ? int(feedbacks) : "…"} ratings (every rater, every tag)
          {oor > 0 ? ` · ${int(oor)} ratings at 10^38` : ""}
        </div>
      </div>
      <div className="stats four">
        <Stat label="ratings received" value={feedbacks !== undefined ? int(feedbacks) : "…"} foot={clients !== undefined ? `${int(clients)} distinct raters` : undefined} />
        <Stat label="8004scan total_score" value={s ? s.total_score.toFixed(2) : "n/a"} foot="quoted" />
        <Stat label="8004scan average_score" value={s ? s.average_score.toFixed(1) : "n/a"} foot="quoted" />
        <Stat label="8004scan rank" value={rank < 0 ? "> 25" : `#${rank + 1}`} foot={`by total_score, of ${int(scan.totalAgents)}`} />
      </div>
      <div className="contrast">
        <div>One global score, defined by an operator.</div>
        <div>Nobody can check it. No contract can read it before paying.</div>
      </div>
      <div className="cite">
        <b>Ratings, naive average</b>: ERC-8004 Reputation Registry, Monad 143
        {live ? ", read live" : reg === "error" ? " (Envio unreachable: solver snapshot shown)" : " (loading…)"} · indexed by Envio HyperIndex.
        <br />
        <b>Scores</b>: Source: 8004scan public API, fetched {fmtDate(scan.fetchedAt)}. Formula not published: quoted as is, never recomputed.
      </div>
    </div>
  );
}

function ContractColumn({ id, lens }: { id: string; lens: Lens }) {
  const a = lensAgent(lens, id);
  const thetaPct = act1.policy.thetaPct;
  const massPct = Number(BigInt(a.trustRobust)) / 1e16;
  return (
    <div className="col contract">
      <h2>What your contract sees</h2>
      <div className="hero">
        <div className="value num" style={{ color: massPct > 0 ? "#cfe2fb" : undefined }}>
          {pctU(a.trustRobust)}
        </div>
        <div className="label">
          ANCRE mass under your anchors, leave-one-out (m = {lens.m}){a.inSupport ? "" : " · unreachable from them: unknown"}
        </div>
      </div>
      <Meter massPct={massPct} thetaPct={thetaPct} />
      <div className="stats four">
        <Stat label="raw mass Σλt" value={pctU(a.trust)} foot="before leave-one-out" />
        <Stat label="error bound e" value={bound(lens.eEff)} foot="certificate, upper" />
        <Stat label="distrust" value={pctU(a.distrust)} foot="one hop (slashes)" />
        <Stat label="mass on the farm Σλt" value={pctU(lens.massOnFarmWeighted)} foot={`${int(act1.farm.agents)} agents around Eve`} />
      </div>
      <Verdict
        pay={a.verdict.pay}
        title={a.verdict.pay ? "WOULD PAY" : "WOULD REFUSE"}
        why={`${a.verdict.reason}: ${a.verdict.detail} · θ = ${thetaPct} % applied off-chain`}
      />
      <div className="badges">
        <span className="badge accent">computed by the reference solver, reproducible</span>
        <span className="badge">not deployed on mainnet: no certificate on-chain</span>
        <span className="badge">block {int(act1.snapshotBlock)}</span>
        <span className="badge">
          α = {lens.alpha} · {lens.edges} edges · {lens.certifiedNodes} nodes
        </span>
      </div>
      <div className="cite">
        <b>{lens.title}</b>: {lens.blurb}
        <br />
        <b>Source</b>: {act1.source}, {int(act1.snapshotFeedbacks)} ratings · {act1.rules} · <span className="mono">{act1.command}</span>
      </div>
    </div>
  );
}

function Ranking({ lens, sel, onSel }: { lens: Lens; sel: string; onSel: (id: string) => void }) {
  const top = scan.top.slice(0, 10);
  const ours = lens.ranking.slice(0, 10);
  const known = lens.ranking.filter((r) => r.trust !== "0").length;
  return (
    <div className="ranking">
      <div className="rank-col">
        <h3>What an explorer shows · 8004scan total_score</h3>
        <table className="rank">
          <tbody>
            {top.map((a, i) => (
              <tr key={a.agentId} className={a.agentId === sel ? "hl" : ""} onClick={() => onSel(a.agentId)}>
                <td className="r">{i + 1}</td>
                <td>
                  {agentName(a.agentId)} <span className="muted">#{a.agentId}</span>
                </td>
                <td className="muted num">{int(a.total_feedbacks)} ratings</td>
                <td className="v">{a.total_score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rank-foot">
          Source: 8004scan public API ({scan.sort}), fetched {fmtDate(scan.fetchedAt)}. {int(scan.totalAgents)} agents listed.
        </div>
      </div>
      <div className="rank-col contract">
        <h3>What your contract sees · ANCRE mass, “{lens.title}”</h3>
        <table className="rank">
          <tbody>
            {ours.length === 0 && (
              <tr>
                <td className="muted">Nobody is reachable from these anchors.</td>
              </tr>
            )}
            {ours.map((r, i) => (
              <tr key={r.agentId} className={r.agentId === sel ? "hl" : ""} onClick={() => onSel(r.agentId)}>
                <td className="r">{i + 1}</td>
                <td>
                  {agentName(r.agentId)} <span className="muted">#{r.agentId}</span>
                </td>
                <td className="muted num">{r.distrust !== "0" ? `distrust ${pctU(r.distrust)}` : `raw ${pctU(r.trust)}`}</td>
                <td className="v">{pctU(r.trustRobust)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rank-foot">
          {int(known)} agent{known === 1 ? "" : "s"} reachable from these anchors; the other {int(act1.snapshotAgents - known)}: unknown, mass 0. Ranked by
          leave-one-out mass (m = {lens.m}). Reference solver, block {int(act1.snapshotBlock)}.
        </div>
      </div>
    </div>
  );
}

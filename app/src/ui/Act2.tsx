// Act 2: our own traffic (chantier 06 scenes), live or replayed through the same reducer.
// Left: the focused agent in two columns. Right: the payer's decisions and the breaker latency.
import { useEffect, useState } from "react";
import { SCENE_TITLES, type AgentState, type FeedRow, type ScreenState } from "../core/demo";
import { bound, int, pct, short } from "../lib/format";
import { NETWORKS } from "../config/networks";
import { readAgent, rpcForRun, type OnchainRead } from "../sources/chain";
import type { useDemo } from "../sources/useDemo";
import { Avatar, BigNum, Meter, Spark, Stat, Verdict } from "./common";

type Demo = ReturnType<typeof useDemo>;

const ROLE_ORDER = ["provider", "farm-target", "farm"];
const ROLE_COLOUR: Record<string, string> = { provider: "#7fd4b4", "farm-target": "#ef9a9a", farm: "#8f8e86" };

export function Act2({ demo }: { demo: Demo }) {
  const { screen: s } = demo;
  const [pinned, setPinned] = useState<string | null>(null);
  const focusId = pinned && s.agents[pinned] ? pinned : s.focus;
  const agent = focusId ? s.agents[focusId] : null;
  const currentScene = s.scenes.at(-1)?.n ?? null;

  return (
    <div className="act2">
      <section className="main">
        <SourceBar demo={demo} />
        <div className="scenes">
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const sc = s.scenes.find((x) => x.n === n);
            const cls = sc ? (sc.ok === true ? "ok" : sc.ok === false ? "ko" : "") : "";
            return (
              <button
                key={n}
                className={`scene ${cls} ${currentScene === n ? "active" : ""}`}
                onClick={() => demo.mode === "replay" && demo.controls.jumpScene(n)}
                title={sc?.label}
              >
                {sc?.ok === true ? "✓ " : sc?.ok === false ? "✗ " : ""}
                {n}. {SCENE_TITLES[n]}
              </button>
            );
          })}
        </div>
        <div className="chips">
          {Object.values(s.agents)
            .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || Number(a.agentId) - Number(b.agentId))
            .map((a) => (
              <button
                key={a.agentId}
                className="chip"
                aria-current={a.agentId === focusId}
                onClick={() => setPinned(pinned === a.agentId ? null : a.agentId)}
                title={pinned === a.agentId ? "pinned: click to follow the action again" : "pin this agent"}
              >
                <span className="mark" style={{ background: ROLE_COLOUR[a.role] ?? "#c3c2b7" }} />
                {a.label.replace(" (demo)", "")} #{a.agentId}
                {pinned === a.agentId ? " 📌" : ""}
              </button>
            ))}
        </div>
        {agent && s.header?.set && s.header.contracts ? <AgentPanel s={s} a={agent} /> : <Empty s={s} />}
      </section>
      <aside className="side">
        <Latency s={s} />
        <h3>Payer decisions and registry events</h3>
        <Feed rows={s.feed} s={s} onPick={(id) => setPinned(id)} />
        <div className="cite">
          x402 refusals leave no on-chain trace (AM-6.8): each refusal is rebuilt with <span className="mono">TrustGatedPayer.explain()</span> at the
          attempt's block; <span className="mono">reportRefusal()</span> can post it as a <span className="mono">RefusalReported</span> event.
        </div>
      </aside>
    </div>
  );
}

function Empty({ s }: { s: ScreenState }) {
  return (
    <div className="banner">
      {s.header ? `Run ${s.header.runId}: ${s.header.set ? "waiting for the first agent event…" : "setting up (deploying ANCRE and the payer, registering the anchor set)…"}` : "No run loaded. Start a chantier 06 run (live) or pick a recorded run."}
    </div>
  );
}

function SourceBar({ demo }: { demo: Demo }) {
  const { source, controls, runs, setRunFile, mode, setMode, screen } = demo;
  const h = screen.header;
  return (
    <div className="viewbar">
      <div>
        <h1 className="board-title" style={{ fontSize: 28 }}>
          Act 2 · our own traffic
        </h1>
        <div className="muted" style={{ fontSize: 14 }}>
          {h?.set && h.contracts ? (
            <>
              {h.network.mode === "testnet" ? "Monad testnet (10143)" : h.network.mode === "fork" ? "anvil fork of Monad testnet (10143)" : "frozen fork state, replayed offline (10143)"} ·
              ANCRE <span className="mono">{short(h.contracts.ancre)}</span> · payer <span className="mono">{short(h.contracts.payer)}</span> · set{" "}
              <span className="mono">{short(h.set.setId)}</span> · {h.set.anchors.length} anchors, m = {h.set.minAnchors}, θ = {h.set.thetaPct} %
            </>
          ) : (
            "—"
          )}
        </div>
      </div>
      <div className="controls">
        <button className="ctl" aria-pressed={mode === "live"} onClick={() => setMode("live")} title="tail chantier 06's demo/out/latest.json (dev server only)">
          Live
        </button>
        <button className="ctl" aria-pressed={mode === "replay"} onClick={() => setMode("replay")}>
          Replay
        </button>
        {source.kind === "replay" && (
          <>
            <select className="ctl" value={source.run?.file ?? ""} onChange={(e) => setRunFile(e.target.value)}>
              {runs.map((r) => (
                <option key={r.file} value={r.file}>
                  {r.runId} · {r.mode} · {r.events} events
                </option>
              ))}
            </select>
            <button className="ctl" onClick={controls.restart} title="first event">
              ⏮
            </button>
            <button className="ctl" onClick={() => controls.step(-1)} title="previous event (←)">
              ◀
            </button>
            <button className="ctl" aria-pressed={source.playing} onClick={() => controls.setPlaying(!source.playing)} title="play / pause (space)">
              {source.playing ? "❚❚" : "▶"}
            </button>
            <button className="ctl" onClick={() => controls.step(1)} title="next event (→)">
              ▶▏
            </button>
            <select className="ctl" value={`${source.pacing}:${source.speed}`} onChange={(e) => {
              const [p, sp] = e.target.value.split(":");
              controls.setPacing(p as "recorded" | "presenter");
              controls.setSpeed(Number(sp));
            }}>
              <option value="presenter:1">presenter pace</option>
              <option value="presenter:2">presenter ×2</option>
              <option value="recorded:1">recorded timing ×1</option>
              <option value="recorded:0.25">recorded ×0.25</option>
            </select>
            <span className="muted num" style={{ fontSize: 13 }}>
              {source.cursor + 1}/{source.total}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function AgentPanel({ s, a }: { s: ScreenState; a: AgentState }) {
  const h = s.header!;
  const set = h.set!, contracts = h.contracts!;
  const c = a.contract;
  const x = a.explorer;
  const fresh = c.certBlock ? a.block - c.certBlock : null;
  const onchain = useOnchain(s, a);
  const pay = a.lastPayment;
  return (
    <>
      <div className="agent-head">
        <Avatar id={a.agentId} name={a.label} />
        <div>
          <h1>
            {a.label.replace(" (demo)", "")} <span className="muted">#{a.agentId}</span>
          </h1>
          <div className="sub">
            role: {a.role} · state read at block {int(a.block)} (event #{a.seq}) · demo agent registered by chantier 06
          </div>
        </div>
      </div>
      <div className="cols">
        <div className="col explorer">
          <h2>What an explorer shows</h2>
          <div className="hero">
            <div className="value num">{x.naiveAverage === null ? "no rating" : <BigNum value={x.naiveAverage} />}</div>
            <Spark points={a.history.map((p) => p.naive ?? 0)} color="#b9b7ab" width={180} height={48} />
            <div className="label">naive average of {int(x.feedbackCount)} ratings (every rater, every tag)</div>
          </div>
          <div className="stats three">
            <Stat label="ratings" value={int(x.feedbackCount)} foot="non-revoked" />
            <Stat label="raters" value={int(x.clientCount)} foot="distinct" />
            <Stat label="revoked" value={int(x.revokedCount)} />
          </div>
          <div className="contrast">
            <div>Anyone can rate, for free. A farm buys this number.</div>
          </div>
          <div className="cite">
            <b>Source</b>: ERC-8004 Reputation Registry (testnet <span className="mono">{short(contracts.reputation)}</span>), every feedback re-read with{" "}
            <span className="mono">readAllFeedback</span> at block {int(a.block)} by the scene script. “Naive average” is our definition (EVENTS.md §3.3), not
            any explorer's formula.
          </div>
        </div>

        <div className="col contract">
          <h2>What your contract sees</h2>
          <div className="hero">
            <div className="value num" style={{ color: c.trustLow !== "0" ? "#cfe2fb" : undefined }}>
              {pct(c.trustLow)}
              <span className="unit">{c.trustLow === "0" ? "" : " %"}</span>
            </div>
            <Spark points={a.history.map((p) => p.trustLowPct)} color="#3987e5" width={180} height={48} />
            <div className="label">ANCRE mass under the reader's {set.anchors.length} anchors, leave-one-out (m = {set.minAnchors}), lower bound</div>
          </div>
          <Meter massPct={c.trustLowPct} thetaPct={c.thetaPct} />
          <div className="stats four">
            <Stat label="status" value={c.status} foot={c.status === "VETOED" ? `${c.vetoCount} anchor veto · tag ${c.triggerTagName ?? "?"}` : "assess()"} />
            <Stat label="error bound e" value={bound(c.e)} foot="certificate, upper" />
            <Stat label="distrust" value={`${pct(c.distrust)} %`} foot="one hop" />
            <Stat label="certificate" value={fresh === null ? "none" : `${fresh} blk`} foot={c.certBlock ? `old · cert block ${int(c.certBlock)}` : "NO_CERT"} />
          </div>
          {pay ? (
            <Verdict
              pay={pay.decision === "PAID"}
              title={pay.decision === "PAID" ? "PAID" : "REFUSED"}
              why={
                pay.decision === "PAID"
                  ? `${(Number(pay.amount) / 1e6).toFixed(2)} USDC settled at block ${int(pay.block)} · isValidSignature accepted`
                  : `${pay.reason}${pay.explain?.status && pay.explain.status !== "OK" ? ` (ANCRE ${pay.explain.status}${c.triggerTagName ? `, tag ${c.triggerTagName}` : ""})` : ""} · refused by the payer contract at ${pay.stage}, block ${int(pay.block)}`
              }
            />
          ) : (
            <Verdict pay={null} why={c.trusted ? "isTrusted = true: the payer would sign" : "isTrusted = false: the payer would refuse"} />
          )}
          <div className="badges">
            <span className="badge accent">certificate: {set.level}</span>
            <OnchainBadge s={s} a={a} r={onchain} />
          </div>
          {pay?.decision === "REFUSED" && pay.explain && (
            <div className="explain">
              {`explain() @ block ${pay.block} → reason ${pay.explain.reason}, status ${pay.explain.status}, trustLow ${pct(pay.explain.trustLow)} %, distrustUp ${pct(pay.explain.distrustUp)} %\nfacilitator /verify: ${pay.facilitator?.verify ?? "—"}`}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type ReadState = { key: string; r: OnchainRead | null; error: string | null };

/** Re-read assess()/decide() on the run's RPC at the event's block; null when unreachable (offline replay). */
function useOnchain(s: ScreenState, a: AgentState): ReadState | null {
  const h = s.header!;
  const key = `${h.runId}:${a.agentId}:${a.block}`;
  const [st, setSt] = useState<ReadState | null>(null);
  useEffect(() => {
    const rpc = rpcForRun(h.network, NETWORKS.fork.http);
    if (!rpc || !h.set || !h.contracts) {
      setSt({ key, r: null, error: `no RPC for a ${h.network.mode} run` });
      return;
    }
    let dead = false;
    setSt({ key, r: null, error: null });
    const pay = a.lastPayment ? { to: a.lastPayment.payTo as `0x${string}`, amount: a.lastPayment.amount } : undefined;
    readAgent(rpc, h.contracts.ancre as `0x${string}`, h.contracts.payer as `0x${string}`, h.set.setId as `0x${string}`, a.agentId, a.block, pay).then(
      (r) => !dead && setSt({ key, r, error: null }),
      (e) => !dead && setSt({ key, r: null, error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 80) }),
    );
    return () => {
      dead = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st?.key === key ? st : null;
}

function OnchainBadge({ s, a, r }: { s: ScreenState; a: AgentState; r: ReadState | null }) {
  const mode = s.header!.network.mode;
  if (!r || (!r.r && !r.error)) return <span className="badge">eth_call assess() @ {int(a.block)}…</span>;
  if (r.r) {
    const match = r.r.status === a.contract.status && r.r.trustLow === a.contract.trustLow && r.r.trusted === a.contract.trusted;
    return (
      <span className={`badge ${match ? "ok" : "bad"}`} title={`decide() = ${r.r.decide ?? "n/a"} · round trip ${r.r.ms} ms`}>
        {match ? "✓" : "≠"} re-read by this screen: assess() @ block {int(r.r.block)} {match ? "matches the log" : `= ${r.r.status} ${pct(r.r.trustLow)} %`}
        {r.r.decide ? ` · decide() ${r.r.decide}` : ""}
      </span>
    );
  }
  return (
    <span className="badge" title={r.error ?? ""}>
      recorded by the scene script at block {int(a.block)} ({mode}); RPC not reachable from this screen
    </span>
  );
}

function Latency({ s }: { s: ScreenState }) {
  const l = s.latency;
  if (!l)
    return (
      <div className="latency">
        <h3>Circuit breaker</h3>
        <div className="muted" style={{ marginTop: 6 }}>
          Scene 4: an anchor slashes a provider; the next payment is refused. Latency appears here, measured by the scene script.
        </div>
      </div>
    );
  const monad = l.measured === "testnet";
  return (
    <div className="latency">
      <h3>Circuit breaker · slash → refusal</h3>
      <div style={{ display: "flex", gap: 22, alignItems: "baseline", marginTop: 6 }}>
        <div className="big num">
          {l.blocks} <span className="muted" style={{ fontSize: 18 }}>block{l.blocks === 1 ? "" : "s"}</span>
        </div>
        <div className="big num">
          {int(l.ms)} <span className="muted" style={{ fontSize: 18 }}>ms</span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        from <span className="mono">{l.from.step}</span> (block {int(l.from.block)}) to <span className="mono">{l.to.step}</span> (block {int(l.to.block)}) ·{" "}
        {l.parts.map((p) => `${p.name}: ${p.blocks} blk, ${p.ms} ms`).join(" · ")}
      </div>
      <div className={`badge ${monad ? "ok" : ""}`} style={{ marginTop: 8 }}>
        MEASURED on {l.measured}
        {monad ? " (Monad testnet)" : ": anvil mines instantly, not a Monad latency"}
      </div>
    </div>
  );
}

function Feed({ rows, s, onPick }: { rows: FeedRow[]; s: ScreenState; onPick: (id: string) => void }) {
  const shown = groupBursts(rows).slice(-40).reverse();
  return (
    <div className="feed">
      {shown.length === 0 && <div className="muted">No payment or rating yet.</div>}
      {shown.map((r) => {
        const isSlash = r.kind === "feedback" && /slash/.test(r.detail ?? "");
        const cls = r.verdict === "PAID" ? "paid" : r.verdict === "REFUSED" ? "refused" : r.verdict === "REJECTED" ? "rejected" : isSlash ? "slash" : "";
        return (
          <div key={r.seq} className={`row ${cls}`} onClick={() => r.agentId && onPick(r.agentId)} style={{ cursor: r.agentId ? "pointer" : "default" }}>
            <div className="blk">
              blk {int(r.block)}
              {r.count > 1 ? `…${int(r.lastBlock)}` : ""}
              <br />
              scene {r.scene}
            </div>
            <div>
              {r.verdict && (
                <span className="v">
                  {r.verdict === "PAID" ? "✓ PAID" : r.verdict === "REFUSED" ? `⛔ REFUSED · ${r.reason}` : `✗ REJECTED · ${r.reason}`}{" "}
                </span>
              )}
              <span className="lbl">
                {r.count > 1 ? `${r.count} ratings “${r.detail}” inside the farm (${r.firstLabel} … ${r.label})` : r.verdict ? r.label.replace(/: (PAID|REFUSED.*)$/, "") : r.label}
              </span>
              {r.detail && r.verdict !== "PAID" && r.count === 1 && <div className="muted" style={{ fontSize: 12.5 }}>{r.detail}</div>}
            </div>
          </div>
        );
      })}
      {s.header && <div className="muted" style={{ fontSize: 12 }}>run {s.header.runId} · started {s.header.startedAt.slice(0, 19)}Z</div>}
    </div>
  );
}

type Burst = FeedRow & { count: number; lastBlock: number; firstLabel: string };

/** Consecutive ratings of the same scene with the same tag and value (the farm's ring) collapse into one row. */
function groupBursts(rows: FeedRow[]): Burst[] {
  const out: Burst[] = [];
  for (const r of rows) {
    const prev = out.at(-1);
    if (prev && r.kind === "feedback" && prev.kind === "feedback" && prev.scene === r.scene && prev.detail === r.detail && /^\d\.farm:/.test(r.step) && /^\d\.farm:/.test(prev.step)) {
      out[out.length - 1] = { ...r, seq: prev.seq, block: prev.block, count: prev.count + 1, lastBlock: r.block, firstLabel: prev.firstLabel };
    } else out.push({ ...r, count: 1, lastBlock: r.block, firstLabel: r.label.split(" gives ")[0] });
  }
  return out;
}

// Live demo (act 2): our own traffic (chantier 06 scenes), live or replayed through the same reducer. This is the
// page the video films. Kept small: one focused agent (explorer number vs ANCRE mass, then the payer's verdict),
// the decisions on the right, the breaker latency. Finality gating and the screen's own re-read of assess() and
// decide() are unchanged from chantier 07.
import { useEffect, useMemo, useState } from "react";
import { SCENE_TITLES, type AgentState, type FeedRow, type ScreenState } from "../core/demo";
import { median, stateOf, type HeadsState } from "../core/heads";
import { NETWORKS, endpointsForRun } from "../config/networks";
import { bound, int, pct, pctU, short } from "../lib/format";
import { readAgent, type OnchainRead } from "../sources/chain";
import { useDemo } from "../sources/useDemo";
import { useHeads, type HeadsSource } from "../sources/useHeads";
import { BigNum, Meter, Spark } from "./common";

type Demo = ReturnType<typeof useDemo>;
const ROLE_ORDER = ["provider", "farm-target", "farm"];
const ROLE_COLOUR: Record<string, string> = { provider: "var(--good)", "farm-target": "var(--bad)", farm: "var(--muted)" };

export function Live() {
  const demo = useDemo();
  const { screen: s, controls } = demo;
  const [pinned, setPinned] = useState<string | null>(null);
  const focusId = pinned && s.agents[pinned] ? pinned : s.focus;
  const agent = focusId ? s.agents[focusId] : null;
  const currentScene = s.scenes.at(-1)?.n ?? null;
  const clockOverride = new URLSearchParams(location.search).get("clock") === "testnet";
  const run = s.header ? endpointsForRun(s.header.network) : null;
  const wsUrl = demo.mode === "live" ? (clockOverride ? NETWORKS.testnet.ws : (run?.ws ?? null)) : null;
  const { heads, info } = useHeads(wsUrl, s.header?.network.mode === "fork");
  // Finality gating fails CLOSED in live mode: no verdict until this screen has seen its block Finalized.
  const gate: HeadsState | null = wsUrl && !clockOverride ? heads : null;
  const notes = [...s.warnings, ...(demo.source.kind === "replay" && demo.source.error ? [demo.source.error] : [])];
  const chips = useMemo(
    () => Object.values(s.agents).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || Number(a.agentId) - Number(b.agentId)),
    [s.agents],
  );
  // scenes in the order the run plays them (scene 7, the second hop, runs right after scene 1)
  const order = useMemo(() => {
    const seen = s.scenes.map((x) => x.n);
    const rest = [1, 7, 2, 3, 4, 5, 6].filter((n) => !seen.includes(n));
    return [...seen.filter((n) => n !== 0), ...rest];
  }, [s.scenes]);

  // presenter keys in replay: ← → step, space play/pause, 1-7 jump to a scene
  const playing = demo.source.kind === "replay" && demo.source.playing;
  useEffect(() => {
    if (demo.mode !== "replay") return;
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "SELECT" || tag === "INPUT") return;
      const ours = e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight" || /^[1-7]$/.test(e.key);
      if (!ours) return;
      if (tag === "BUTTON") (e.target as HTMLElement).blur();
      if (e.key === "ArrowRight") controls.step(1);
      else if (e.key === "ArrowLeft") controls.step(-1);
      else if (e.key === " ") (e.preventDefault(), controls.setPlaying(!playing));
      else controls.jumpScene(Number(e.key));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [demo.mode, controls, playing]);

  return (
    <>
      <SourceBar demo={demo} />
      {notes.length > 0 && <div className="banner">{notes.join(" · ")}</div>}
      <div className="scenes">
        {order.map((n) => {
          const sc = s.scenes.find((x) => x.n === n);
          const cls = sc ? (sc.ok === true ? "ok" : sc.ok === false ? "ko" : "") : "";
          return (
            <button key={n} className={`scene ${cls} ${currentScene === n ? "active" : ""}`} onClick={() => demo.mode === "replay" && controls.jumpScene(n)} title={sc?.label}>
              {sc?.ok === true ? "✓ " : sc?.ok === false ? "✗ " : ""}
              {SCENE_TITLES[n] ?? `Scene ${n}`}
            </button>
          );
        })}
      </div>
      {demo.mode === "live" && <ChainClock heads={heads} info={info} />}
      <div className="live-grid">
        <div>
          <div className="chips">
            {chips.map((a) => (
              <button key={a.agentId} aria-current={a.agentId === focusId} onClick={() => setPinned(pinned === a.agentId ? null : a.agentId)} title={pinned === a.agentId ? "pinned: click to follow the action again" : "pin this agent"}>
                <span className="mark" style={{ background: ROLE_COLOUR[a.role] ?? "var(--muted)" }} />
                {a.label} #{a.agentId}
                {pinned === a.agentId ? " · pinned" : ""}
              </button>
            ))}
          </div>
          {agent && s.header?.set && s.header.contracts ? <AgentPanel s={s} a={agent} gate={gate} reread={demo.mode === "live"} /> : <Empty s={s} />}
        </div>
        <aside>
          <Latency s={s} />
          <section className="card">
            <div className="card-h">
              <h2>Payer decisions</h2>
              <span className="muted small num">
                {s.paid} paid · {s.refused} refused
              </span>
            </div>
            <Decisions rows={s.feed} gate={gate} onPick={(id) => setPinned(id)} />
          </section>
        </aside>
      </div>
    </>
  );
}

function Empty({ s }: { s: ScreenState }) {
  return (
    <div className="banner info">
      {s.header
        ? `Run ${s.header.runId}: ${s.header.set ? "waiting for the first agent event…" : "setting up (deploying ANCRE and the payer, registering the anchor set)…"}`
        : "No run loaded. Start a chantier 06 run (live) or pick a recorded run."}
    </div>
  );
}

function SourceBar({ demo }: { demo: Demo }) {
  const { source, controls, runs, setRunFile, mode, setMode, screen } = demo;
  const h = screen.header;
  const r = source.kind === "replay" ? source.run : null;
  return (
    <div className="page-head">
      <div>
        <h1>Live demo</h1>
        <p className="small">
          {source.kind === "live" ? (
            <>
              <span className={`dot ${source.ok ? "live" : "off"}`} style={{ marginTop: 0 }} /> LIVE · {h?.network.mode ?? "…"} ·{" "}
              {source.ok ? "chantier 06 event log, polled every 250 ms" : `source unavailable: ${source.error ?? "…"}`}
            </>
          ) : (
            <>
              <span className="pill status-word">REPLAY</span> {r ? `${r.runId}, recorded ${r.startedAt.slice(0, 10)} on ${r.mode === "testnet" ? "Monad testnet" : r.mode === "fork" ? "an anvil fork of Monad testnet" : "a frozen fork state"}` : "…"}
            </>
          )}
          {h?.set && h.contracts && (
            <span className="muted">
              {" "}
              · ANCRE <span className="mono">{short(h.contracts.ancre)}</span> · payer <span className="mono">{short(h.contracts.payer)}</span> ·{" "}
              {h.set.anchors.length} anchors, m = {h.set.minAnchors}, θ = {h.set.thetaPct} %
            </span>
          )}
        </p>
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
            {runs.length > 1 && (
              <select className="ctl" value={source.run?.file ?? ""} onChange={(e) => setRunFile(e.target.value)}>
                {runs.map((x) => (
                  <option key={x.file} value={x.file}>
                    {x.runId} · {x.mode}
                  </option>
                ))}
              </select>
            )}
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
            <select
              className="ctl"
              value={`${source.pacing}:${source.speed}`}
              onChange={(e) => {
                const [p, sp] = e.target.value.split(":");
                controls.setPacing(p as "recorded" | "presenter");
                controls.setSpeed(Number(sp));
              }}
            >
              <option value="presenter:1">presenter pace</option>
              <option value="presenter:2">presenter ×2</option>
              <option value="recorded:1">recorded timing</option>
            </select>
            <span className="muted num small">
              {source.cursor + 1}/{source.total}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function AgentPanel({ s, a, gate, reread }: { s: ScreenState; a: AgentState; gate: HeadsState | null; reread: boolean }) {
  const set = s.header!.set!;
  const c = a.contract;
  const x = a.explorer;
  const onchain = useOnchain(s, a, reread);
  const pay = a.lastPayment;
  const payState = pay && gate ? (stateOf(gate, pay.block) ?? "not seen yet by this screen") : null;
  const pending = pay && payState !== null && payState !== "Finalized";
  const oneAnchor = BigInt(c.trust) >= BigInt(c.theta) && c.trustLow === "0";
  return (
    <section className="card">
      <div className="card-h">
        <h2>
          {a.label} <span className="muted">#{a.agentId}</span>
        </h2>
        <span className="muted small">
          {a.role} · block {int(a.block)}
        </span>
      </div>
      <div className="vs">
        <div>
          <div className="lbl">Explorer: naive average of {int(x.feedbackCount)} ratings</div>
          <div className="val" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {x.naiveAverage === null ? "—" : <BigNum value={x.naiveAverage} />}
            <Spark points={a.history.map((p) => p.naive ?? 0)} color="var(--muted)" />
          </div>
        </div>
        <div className="sep" />
        <div className="ours">
          <div className="lbl">ANCRE: leave-one-out mass under {set.anchors.length} anchors</div>
          <div className="val" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {pctU(c.trustLow)}
            <Spark points={a.history.map((p) => p.trustLowPct)} color="var(--accent)" />
          </div>
        </div>
      </div>
      <div className="card-b" style={{ borderTop: "1px solid var(--line)" }}>
        <Meter massPct={c.trustLowPct} thetaPct={c.thetaPct} />
        <div className="policy" style={{ marginTop: 10 }}>
          <span>
            status <b>{c.status}</b>
            {c.status === "VETOED" && c.triggerTagName ? ` · tag ${c.triggerTagName}` : ""}
          </span>
          <span>
            raw mass <b>{pctU(c.trust)}</b>
            {oneAnchor ? " · over θ, but from one anchor only" : ""}
          </span>
          <span>
            distrust <b>{pctU(c.distrust)}</b>
          </span>
          <span>
            e <b>{bound(c.e)}</b>
          </span>
          <span>
            certificate <b>{c.certBlock ? `${a.block - c.certBlock} blocks old` : "none"}</b>
          </span>
        </div>
      </div>
      <div className="verdict-line">
        {pending ? (
          <>
            <span className="chip warn">◐ Awaiting finality</span>
            <span className="muted small">payment at block {int(pay!.block)}: {payState}</span>
          </>
        ) : pay ? (
          <>
            <span className={`chip ${pay.decision === "PAID" ? "pass" : "refuse"}`}>{pay.decision === "PAID" ? "✓ Paid" : "✕ Refused"}</span>
            <span className="small">
              {pay.decision === "PAID"
                ? `${Number(pay.amount) / 1e6} USDC settled at block ${int(pay.block)}`
                : `${pay.reason}${pay.explain?.status && pay.explain.status !== "OK" ? ` (ANCRE ${pay.explain.status}${c.triggerTagName ? `, tag ${c.triggerTagName}` : ""})` : ""} · by the payer contract at ${pay.stage}, block ${int(pay.block)}`}
            </span>
          </>
        ) : (
          <span className="small muted">{c.trusted ? "passesAnchorPolicy = true: the payer would sign" : "passesAnchorPolicy = false: the payer would refuse"}</span>
        )}
        <span style={{ flex: 1 }} />
        <OnchainBadge s={s} a={a} r={onchain} />
      </div>
      {pay?.decision === "REFUSED" && pay.explain && !pending && (
        <div className="explain">{`explain() @ block ${pay.block} → ${pay.explain.reason}, status ${pay.explain.status}, trustLow ${pct(pay.explain.trustLow)} %`}</div>
      )}
    </section>
  );
}

type ReadState = { key: string; r: OnchainRead | null; error: string | null };

/** Re-read assess()/decide() on the run's RPC at the event's block (live only; replay shows the log's values). */
function useOnchain(s: ScreenState, a: AgentState, enabled: boolean): ReadState | null {
  const h = s.header!;
  const key = `${h.runId}:${a.agentId}:${a.block}`;
  const [st, setSt] = useState<ReadState | null>(null);
  useEffect(() => {
    // replay never re-reads: a fork RPC running now may hold another run's state at the same blocks
    const rpc = enabled ? (endpointsForRun(h.network)?.http ?? null) : null;
    if (!rpc || !h.set || !h.contracts) {
      setSt({ key, r: null, error: enabled ? `no RPC for a ${h.network.mode} run` : "replay" });
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
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return st?.key === key ? st : null;
}

function OnchainBadge({ s, a, r }: { s: ScreenState; a: AgentState; r: ReadState | null }) {
  const mode = s.header!.network.mode;
  if (!r || (!r.r && !r.error)) return <span className="badge">eth_call assess() @ {int(a.block)}…</span>;
  if (r.r) {
    const match = r.r.status === a.contract.status && r.r.trustLow === a.contract.trustLow && r.r.trusted === a.contract.trusted;
    return (
      <span className={`badge ${match ? "ok" : "bad"}`} title={`decide() = ${r.r.decide ?? "n/a"} · round trip ${r.r.ms} ms`}>
        {match ? "✓" : "≠"} re-read by this screen: assess() @ {int(r.r.block)} {match ? "matches" : `= ${r.r.status} ${pct(r.r.trustLow)} %`}
        {r.r.decide ? ` · decide() ${r.r.decide}` : ""}
      </span>
    );
  }
  return (
    <span className="badge" title={r.error ?? ""}>
      {r.error === "replay" ? `recorded by the scene script (${mode})` : `recorded (${mode}); RPC not reachable from this screen`}
    </span>
  );
}

function Latency({ s }: { s: ScreenState }) {
  const l = s.latency;
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <h2>Circuit breaker</h2>
        <span className="muted small">slash → refusal</span>
      </div>
      <div className="card-b">
        {!l ? (
          <span className="muted small">An anchor slashes a provider; the next payment is refused. The latency appears here.</span>
        ) : (
          <>
            <div className="policy">
              <span>
                <b className="num">{l.blocks}</b> block{l.blocks === 1 ? "" : "s"}
              </span>
              <span>
                <b className="num">{int(l.ms)}</b> ms
              </span>
            </div>
            <div className={`badge ${l.measured === "testnet" ? "ok" : ""}`} style={{ marginTop: 8 }}>
              MEASURED on {l.measured}
              {l.measured === "testnet" ? " (Monad testnet)" : ": anvil mines instantly, not a Monad latency"}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Decisions({ rows, gate, onPick }: { rows: FeedRow[]; gate: HeadsState | null; onPick: (id: string) => void }) {
  const shown = useMemo(() => rows.slice(-30).reverse(), [rows]);
  if (!shown.length) return <div className="empty">No payment or rating yet.</div>;
  return (
    <ul className="decisions">
      {shown.map((r) => {
        const st = gate ? stateOf(gate, r.block) : null;
        const pending = gate !== null && st !== "Finalized" && r.verdict !== null;
        const cls = r.verdict === "PAID" ? "paid" : r.verdict === "REFUSED" ? "refused" : r.verdict === "REJECTED" ? "rejected" : r.negative ? "slash" : "";
        return (
          <li key={r.seq} className={cls} onClick={() => r.agentId && onPick(r.agentId)}>
            <span>
              {pending && <span className="v">◐ {st ?? "pending"} · </span>}
              {r.verdict && !pending && <span className="v">{r.verdict === "PAID" ? "✓ Paid · " : r.verdict === "REFUSED" ? `✕ ${r.reason} · ` : `✕ Rejected · `}</span>}
              {r.text}
            </span>
            <span className="muted small num">
              {int(r.block)}
              {gate && <StateMark st={st} />}
            </span>
            {r.detail && r.verdict !== "PAID" && r.count === 1 && <span className="d">{r.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}

const MARK: Record<string, string> = { Proposed: "○", Voted: "◐", Finalized: "■", Verified: "■" };
function StateMark({ st }: { st: string | null }) {
  return <span title={st ?? "not seen by this screen"}> {st ? MARK[st] : "·"}</span>;
}

function ChainClock({ heads, info }: { heads: HeadsState; info: HeadsSource }) {
  const recent = [...heads.blocks.values()].sort((a, b) => b.number - a.number || a.hash.localeCompare(b.hash)).slice(0, 14).reverse();
  const v = median(heads.latencies.voted), f = median(heads.latencies.finalized);
  return (
    <div className="clock">
      <span className={`dot ${info.connected ? "live" : "off"}`} style={{ marginTop: 0 }} />
      <span>
        {info.connected ? info.method : info.url ? "connecting…" : "no chain feed"} · head <b className="num">{int(heads.head)}</b> · finalized <b className="num">{int(heads.finalized)}</b>
      </span>
      <span className="blocks">
        {recent.map((b) => (
          <span key={`${b.number}:${b.hash}`} className={`s-${b.state}`} title={`${b.number} ${b.state}`}>
            {MARK[b.state]}
          </span>
        ))}
      </span>
      {info.method === "monadNewHeads" && (
        <span className="muted">
          Proposed→Voted {v ?? "…"} ms · →Finalized {f ?? "…"} ms (median, {heads.latencies.finalized.length} blocks) · speculative dropped {heads.dropped}
        </span>
      )}
      {info.method === "newHeads" && <span className="muted">anvil: a block is final when mined</span>}
      {!info.connected && info.error && <span className="muted">{info.error} · verdicts wait for finality</span>}
    </div>
  );
}

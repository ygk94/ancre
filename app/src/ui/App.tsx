import { useCallback, useEffect, useState } from "react";
import type { ChainHead } from "../lib/envio";
import act1 from "../data/act1.json";
import { NETWORKS } from "../config/networks";
import { int, short } from "../lib/format";
import { useDemo, type Source } from "../sources/useDemo";
import { Act1 } from "./Act1";
import { Act2 } from "./Act2";

type Tab = "act1" | "act2";
const initialTab = (): Tab => (new URLSearchParams(location.search).get("act") === "2" ? "act2" : "act1");

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [head, setHead] = useState<ChainHead | null>(null);
  const onHead = useCallback((h: ChainHead | null) => setHead(h), []);
  const demo = useDemo();

  // presenter keys in act 2 replay: ← → step, space play/pause, 1-6 jump to a scene
  const { controls } = demo;
  const playing = demo.source.kind === "replay" && demo.source.playing;
  useEffect(() => {
    if (tab !== "act2" || demo.mode !== "replay") return;
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "SELECT" || tag === "INPUT") return;
      const ours = e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight" || /^[1-6]$/.test(e.key);
      if (!ours) return; // Tab, Enter… keep their default behaviour
      // a focused button would also react to Space/arrows: take these keys away from it
      if (tag === "BUTTON") (e.target as HTMLElement).blur();
      if (e.key === "ArrowRight") controls.step(1);
      else if (e.key === "ArrowLeft") controls.step(-1);
      else if (e.key === " ") (e.preventDefault(), controls.setPlaying(!playing));
      else if (/^[1-6]$/.test(e.key)) controls.jumpScene(Number(e.key));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [tab, demo.mode, controls, playing]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <b>ANCRE</b>
          <span>anchored reputation for ERC-8004 agents</span>
        </div>
        <nav className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={tab === "act1"} onClick={() => setTab("act1")}>
            Act 1 · Monad mainnet
          </button>
          <button className="tab" role="tab" aria-selected={tab === "act2"} onClick={() => setTab("act2")}>
            Act 2 · our own traffic
          </button>
        </nav>
        <div className="spacer" />
        {tab === "act1" ? (
          <div className="source">
            <span className={`dot ${head ? "live" : "replay"}`} />
            {head ? "registry: live via Envio" : "registry: Envio unreachable, solver snapshot"} · ANCRE: reference solver, block {int(act1.snapshotBlock)}
          </div>
        ) : (
          <SourceBadge source={demo.source} mode={demo.screen.header?.network.mode} />
        )}
      </header>
      {tab === "act1" ? <Act1 onHead={onHead} /> : <Act2 demo={demo} />}
      <footer className="footer">
        <span>
          indexed by Envio HyperIndex
          {head ? ` · Monad 143 head ${int(head.block)} · ${int(head.feedbacks)} ratings, ${int(head.agents)} agents` : ""}
        </span>
        <span>
          ERC-8004 v2.0.0 registries · mainnet Identity {short(NETWORKS.mainnet.identity)} · Reputation {short(NETWORKS.mainnet.reputation)}
        </span>
        <span>Every figure shows its source and date.</span>
      </footer>
    </div>
  );
}

function SourceBadge({ source, mode }: { source: Source; mode?: string }) {
  if (source.kind === "live")
    return (
      <div className="source">
        <span className={`dot ${source.ok ? "live" : ""}`} />
        {source.ok ? `LIVE · ${mode ?? "…"} · chantier 06 event log, polled every 250 ms` : `LIVE source unavailable: ${source.error ?? "…"}`}
      </div>
    );
  const r = source.run;
  return (
    <div className="source">
      <span className="dot replay" />
      REPLAY of {r ? `${r.runId} (${r.mode}), blocks ${int(r.firstBlock)}…${int(r.lastBlock)}, recorded ${r.startedAt.slice(0, 10)}` : "…"}
    </div>
  );
}

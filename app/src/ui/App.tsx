import { useCallback, useState } from "react";
import type { ChainHead } from "../lib/envio";
import { int } from "../lib/format";
import { Act1 } from "./Act1";

type Tab = "act1" | "act2";
const initialTab = (): Tab => (new URLSearchParams(location.search).get("act") === "2" ? "act2" : "act1");

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [head, setHead] = useState<ChainHead | null>(null);
  const onHead = useCallback((h: ChainHead | null) => setHead(h), []);
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
        {tab === "act1" && (
          <div className="source">
            <span className="dot replay" /> registry: live via Envio · ANCRE: solver snapshot
          </div>
        )}
      </header>
      {tab === "act1" ? <Act1 onHead={onHead} /> : <div className="main">Act 2: E3.</div>}
      <footer className="footer">
        <span>
          indexed by Envio HyperIndex
          {head ? ` · Monad 143 head ${int(head.block)} · ${int(head.feedbacks)} ratings, ${int(head.agents)} agents` : " · …"}
        </span>
        <span>ERC-8004 v2.0.0 registries · Identity 0x8004A169…a432 · Reputation 0x8004BAa1…9b63</span>
        <span>Every figure shows its source and date.</span>
      </footer>
    </div>
  );
}

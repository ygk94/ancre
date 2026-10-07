// Left column: what just happened. "Registry" = ERC-8004 events of the selected network (Envio, plus the public
// WebSocket for the line that appears before Envio indexes it). "ANCRE" = our own events (certificates,
// rejected certificates, anchor vetoes, payer decisions), from the recorded run until the indexer serves them.
import { useMemo, useState } from "react";
import { fromRun, type FeedItem } from "../core/feed";
import type { NetId } from "../core/model";
import { int } from "../lib/format";
import { href } from "../router";
import type { Dataset } from "../sources/useDataset";
import { useRegistryFeed } from "../sources/useFeed";
import { Link } from "./common";

const ICON: Record<FeedItem["kind"], string> = {
  feedback: "★",
  revoked: "↺",
  registered: "+",
  transfer: "⇄",
  certificate: "◆",
  skipped: "◇",
  rejected: "✕",
  veto: "⛔",
  payment: "$",
};

export function Feed({ network, ds }: { network: NetId; ds: Dataset | null }) {
  const [tab, setTab] = useState<"registry" | "ancre">("registry");
  const [all, setAll] = useState(false);
  const { items, status } = useRegistryFeed(network);
  const ancre = useMemo(() => (ds?.run ? fromRun(ds.run).sort((a, b) => b.block - a.block || b.order - a.order) : []), [ds]);
  const rows = tab === "registry" ? items : network === "mainnet" ? [] : ancre;
  const fork = ds?.run && ds.run.header.network.mode !== "testnet";

  return (
    <>
      <div className="feed-head">
        <h2>Latest activity</h2>
        <div className="seg" role="group" aria-label="Feed">
          <button aria-pressed={tab === "registry"} onClick={() => setTab("registry")}>
            ERC-8004 registry
          </button>
          <button aria-pressed={tab === "ancre"} onClick={() => setTab("ancre")}>
            ANCRE
          </button>
        </div>
        {tab === "registry" ? (
          <div className="feed-status">
            <span className={`dot ${status.envio === "ok" ? "live" : "off"}`} />
            {status.envio === "ok" ? `Envio · head ${int(status.head)}` : status.envio === "loading" ? "Envio · loading…" : "Envio unreachable"}
            <span aria-hidden>·</span>
            <span className={`dot ${status.ws === "live" ? "live" : "off"}`} />
            {status.ws === "live" ? "WebSocket logs" : status.ws === "connecting" ? "WebSocket…" : "WebSocket off"}
          </div>
        ) : (
          <div className="feed-status">
            {network === "mainnet"
              ? "No ANCRE contract on mainnet yet (preview)."
              : fork
                ? `Recorded run, anvil fork of Monad testnet (${ds!.run!.header.startedAt.slice(0, 10)})`
                : ds?.run
                  ? `Recorded run on Monad testnet (${ds.run.header.startedAt.slice(0, 10)})`
                  : "Loading the anchor set…"}
          </div>
        )}
      </div>
      <ul className={`feed-list${all ? "" : " capped"}`}>
        {rows.map((r) => (
          <li key={r.key} className={r.source === "ws" ? "new" : undefined}>
            {r.agentId ? (
              <Link to={href({ page: "agent", net: r.net, id: r.agentId, network })} className={r.tone}>
                <Row r={r} />
              </Link>
            ) : (
              <div className={r.tone}>
                <Row r={r} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {!all && rows.length > 8 && (
        <button className="ctl feed-more" onClick={() => setAll(true)}>
          Show all {rows.length}
        </button>
      )}
      {rows.length === 0 && (
        <div className="feed-empty">
          {tab === "registry" ? (status.envio === "error" ? "Envio is unreachable; real-time lines still appear here." : "Loading…") : network === "mainnet" ? "Switch to Monad testnet to see certificates and payer decisions." : "—"}
        </div>
      )}
      <div className="feed-note">
        {tab === "registry"
          ? "Every ERC-8004 event of the network, unfiltered: this is what an explorer lists. ★ rating · ↺ revoked · + registered · ⇄ transferred."
          : "◆ certificate accepted · ◇ recertification skipped · ✕ certificate rejected · ⛔ anchor veto · $ payer decision. Proofs of discrepancy: none in this run."}
      </div>
    </>
  );
}

function Row({ r }: { r: FeedItem }) {
  return (
    <>
      <span className="ic" aria-hidden>
        {ICON[r.kind]}
      </span>
      <span className="t">{r.title}</span>
      <span className="b num" title={r.source === "ws" ? "seen on the WebSocket, not indexed by Envio yet" : undefined}>
        {r.source === "ws" ? "● " : ""}
        {int(r.block)}
      </span>
      <span className="d">{r.detail}</span>
    </>
  );
}

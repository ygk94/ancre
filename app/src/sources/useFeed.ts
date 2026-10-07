// Activity feed source: Envio (indexed registry events, polled) + the chain's public WebSocket (eth_subscribe logs
// on both ERC-8004 registries, for the real-time line that appears before Envio indexes it). No API key: the
// Alchemy key stays server-side (solver/.env), never in this bundle.
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, parseAbi, type Hex } from "viem";
import { NETWORKS, chainIdOf } from "../config/networks";
import { fbKey, fromEnvio, mergeFeed, owKey, ratingValue, rvKey, type FeedItem } from "../core/feed";
import type { AgentNet, NetId } from "../core/model";
import { agentIdentities, latestActivity } from "../lib/envio";
import { short } from "../lib/format";

const POLL_MS = 8_000;
const EVENTS = parseAbi([
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]); // indexer/config.yaml (registries v2.0.0)

export type FeedStatus = { envio: "loading" | "ok" | "error"; head: number; ws: "off" | "connecting" | "live" | "error"; wsBlock: number };

export function useRegistryFeed(network: NetId) {
  const chainId = chainIdOf(network);
  const net: AgentNet = network;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<FeedStatus>({ envio: "loading", head: 0, ws: "off", wsBlock: 0 });
  const refresh = useRef<() => void>(() => undefined);

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    setItems([]);
    setStatus({ envio: "loading", head: 0, ws: "off", wsBlock: 0 });
    const tick = async () => {
      window.clearTimeout(timer);
      try {
        const a = await latestActivity(chainId);
        const ids = [...a.feedbacks.map((f) => f.agent_id), ...a.owners.map((o) => o.agent_id), ...a.revoked.map((r) => r.agent_id)];
        const idn = await agentIdentities(chainId, ids).catch(() => ({}) as Record<string, { name: string | null }>);
        if (stop) return;
        const nm: Record<string, string> = {};
        for (const [id, v] of Object.entries(idn)) if (v.name) nm[id] = v.name;
        setNames((p) => ({ ...p, ...nm }));
        const nameOf = (id: string) => nm[id] ?? `#${id}`;
        setItems((p) => mergeFeed(p.filter((x) => x.source === "ws"), fromEnvio(a, net, nameOf)));
        setStatus((s) => ({ ...s, envio: "ok", head: a.head }));
      } catch {
        if (!stop) setStatus((s) => ({ ...s, envio: "error" }));
      }
      if (!stop) timer = window.setTimeout(tick, POLL_MS);
    };
    refresh.current = () => void tick();
    tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [chainId, net]);

  // real time: one subscription on both registries; each log becomes a provisional line (source "ws")
  useEffect(() => {
    const cfg = network === "mainnet" ? NETWORKS.mainnet : NETWORKS.testnet;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry: number | undefined;
    let backoff = 1_000;
    const connect = () => {
      if (stopped) return;
      setStatus((s) => ({ ...s, ws: "connecting" }));
      ws = new WebSocket(cfg.ws);
      ws.onopen = () => {
        backoff = 1_000;
        ws!.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["logs", { address: [cfg.identity, cfg.reputation] }] }));
      };
      ws.onmessage = (m) => {
        const j = JSON.parse(String(m.data));
        if (j.id === 1) return setStatus((s) => ({ ...s, ws: j.error ? "error" : "live" }));
        const log = j.params?.result;
        if (!log?.topics) return;
        const item = itemOfLog(log, net);
        if (item) {
          setItems((p) => mergeFeed(p, [item]));
          setStatus((s) => ({ ...s, wsBlock: Math.max(s.wsBlock, item.block) }));
          window.setTimeout(() => refresh.current(), 4_000); // let Envio index it, then replace the line
        }
      };
      ws.onerror = () => setStatus((s) => ({ ...s, ws: "error" }));
      ws.onclose = () => {
        if (stopped) return;
        setStatus((s) => ({ ...s, ws: "error" }));
        retry = window.setTimeout(connect, (backoff = Math.min(backoff * 2, 30_000)));
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      ws?.close();
    };
  }, [network, net]);

  const named = useMemo(() => items.map((x) => (x.source === "ws" && x.agentId && names[x.agentId] ? { ...x, title: x.title.replace(`#${x.agentId}`, names[x.agentId]) } : x)), [items, names]);
  return { items: named, status, names };
}

type RawLog = { topics: Hex[]; data: Hex; blockNumber: Hex; logIndex: Hex };

export function itemOfLog(log: RawLog, net: AgentNet): FeedItem | null {
  let ev;
  try {
    ev = decodeEventLog({ abi: EVENTS, topics: log.topics as [Hex, ...Hex[]], data: log.data });
  } catch {
    return null; // another event of the registries (URIUpdated, MetadataSet, ...): not in the feed
  }
  const block = Number(BigInt(log.blockNumber));
  const order = Number(BigInt(log.logIndex));
  const base = { origin: "registry" as const, source: "ws" as const, block, order, net };
  if (ev.eventName === "NewFeedback") {
    const a = ev.args;
    const id = a.agentId.toString();
    return {
      ...base,
      key: fbKey(id, a.clientAddress, a.feedbackIndex.toString()),
      kind: "feedback",
      agentId: id,
      title: `#${id} rated ${ratingValue(a.value.toString(), a.valueDecimals)}`,
      detail: `${a.tag1 || "no tag"} · by ${short(a.clientAddress)}`,
      tone: a.value < 0n ? "bad" : "neutral",
    };
  }
  if (ev.eventName === "FeedbackRevoked") {
    const a = ev.args;
    const id = a.agentId.toString();
    return { ...base, key: rvKey(id, a.clientAddress, a.feedbackIndex.toString()), kind: "revoked", agentId: id, title: `#${id}: rating revoked`, detail: `by ${short(a.clientAddress)}`, tone: "warn" };
  }
  const a = ev.args;
  const id = a.tokenId.toString();
  const mint = /^0x0+$/.test(a.from);
  return {
    ...base,
    key: owKey(block, order),
    kind: mint ? "registered" : "transfer",
    agentId: id,
    title: mint ? `#${id} registered` : `#${id} transferred`,
    detail: mint ? `owner ${short(a.to)}` : `${short(a.from)} → ${short(a.to)}`,
    tone: mint ? "neutral" : "warn",
  };
}

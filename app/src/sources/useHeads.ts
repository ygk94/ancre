// Live block clock: monadNewHeads over WebSocket (Monad), falling back to eth_subscribe newHeads (anvil fork).
// Read-only. Not used in replay: a live clock next to recorded data would mislead.
import { useEffect, useState } from "react";
import { initialHeads, reduceHead, type HeadsState } from "../core/heads";

export type HeadsSource = { url: string | null; method: string | null; connected: boolean; error: string | null };

export function useHeads(url: string | null): { heads: HeadsState; info: HeadsSource } {
  const [heads, setHeads] = useState<HeadsState>(initialHeads);
  const [info, setInfo] = useState<HeadsSource>({ url, method: null, connected: false, error: null });

  useEffect(() => {
    setHeads(initialHeads());
    setInfo({ url, method: null, connected: false, error: null });
    if (!url) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let id = 1;
    const connect = () => {
      let method = "monadNewHeads";
      ws = new WebSocket(url);
      const subscribe = () => ws!.send(JSON.stringify({ jsonrpc: "2.0", id: id++, method: "eth_subscribe", params: [method] }));
      ws.onopen = () => {
        retry = 0;
        subscribe();
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.id !== undefined) {
          if (m.error && method === "monadNewHeads") {
            method = "newHeads"; // anvil: standard heads, final when mined
            subscribe();
          } else if (!m.error) setInfo({ url, method, connected: true, error: null });
          return;
        }
        const raw = m.params?.result;
        if (raw?.number) setHeads((s) => reduceHead(s, { t: performance.now(), raw }));
      };
      ws.onclose = () => {
        setInfo((i) => ({ ...i, connected: false }));
        if (!stopped) setTimeout(connect, Math.min(500 * 2 ** retry++, 5_000));
      };
      ws.onerror = () => {
        setInfo((i) => ({ ...i, error: "WebSocket error" }));
        ws?.close();
      };
    };
    connect();
    return () => {
      stopped = true;
      ws?.close();
    };
  }, [url]);

  return { heads, info };
}

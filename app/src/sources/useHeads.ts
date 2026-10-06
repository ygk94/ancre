// Live block clock: monadNewHeads over WebSocket (Monad). On an anvil fork only (allowAnvil), falls back to
// eth_subscribe newHeads, where a block is final when mined. Read-only. Not used in replay: a live clock next to
// recorded data would mislead.
import { useEffect, useRef, useState } from "react";
import { initialHeads, reduceHead, type HeadMsg, type HeadsState } from "../core/heads";

export type HeadsSource = { url: string | null; method: string | null; connected: boolean; error: string | null };

const FLUSH_MS = 200; // ~13 head messages/s on Monad: batch them so the screen re-renders 5 times a second at most
const isUnknownMethod = (e: { code?: number; message?: string }) =>
  e.code === -32601 || /method.*(not found|not supported|does not exist)|unsupported|unknown variant/i.test(e.message ?? "");

export function useHeads(url: string | null, allowAnvil: boolean): { heads: HeadsState; info: HeadsSource } {
  const [heads, setHeads] = useState<HeadsState>(initialHeads);
  const [info, setInfo] = useState<HeadsSource>({ url, method: null, connected: false, error: null });
  const pending = useRef<HeadMsg[]>([]);

  useEffect(() => {
    setHeads(initialHeads());
    pending.current = [];
    setInfo({ url, method: null, connected: false, error: null });
    if (!url) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let id = 1;
    let timer: number | undefined;
    const flush = window.setInterval(() => {
      if (!pending.current.length) return;
      const batch = pending.current;
      pending.current = [];
      setHeads((s) => batch.reduce(reduceHead, s));
    }, FLUSH_MS);

    const connect = () => {
      if (stopped) return;
      let method = "monadNewHeads";
      const sock = new WebSocket(url);
      ws = sock;
      const send = (m: string, params: unknown[]) => sock.send(JSON.stringify({ jsonrpc: "2.0", id: id++, method: m, params }));
      sock.onopen = () => {
        retry = 0;
        send("eth_subscribe", [method]);
      };
      sock.onmessage = (ev) => {
        if (stopped) return;
        const m = JSON.parse(String(ev.data));
        if (m.id !== undefined) {
          if (m.error) {
            if (method === "monadNewHeads" && allowAnvil && isUnknownMethod(m.error)) {
              method = "newHeads"; // anvil only: standard heads, final when mined
              send("eth_subscribe", [method]);
            } else {
              // on Monad never degrade to newHeads (no commit state = no finality gating): retry the same method
              setInfo({ url, method: null, connected: false, error: `${method}: ${m.error.message ?? "error"}` });
              sock.close();
            }
          } else if (typeof m.result === "string" && m.result.startsWith("0x") && m.result.length > 20) {
            setInfo({ url, method, connected: true, error: null });
            // anvil sends no past heads: seed the clock with the current head so idle blocks count as final
            if (method === "newHeads") send("eth_getBlockByNumber", ["latest", false]);
          } else if (m.result?.number) {
            pending.current.push({ t: performance.now(), raw: m.result });
          }
          return;
        }
        const raw = m.params?.result;
        if (raw?.number) pending.current.push({ t: performance.now(), raw });
      };
      sock.onclose = () => {
        if (stopped) return;
        setInfo((i) => ({ ...i, connected: false }));
        timer = window.setTimeout(connect, Math.min(500 * 2 ** retry++, 5_000));
      };
      sock.onerror = () => {
        setInfo((i) => ({ ...i, error: i.error ?? "WebSocket error" }));
        sock.close();
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(flush);
      ws?.close();
    };
  }, [url, allowAnvil]);

  return { heads, info };
}

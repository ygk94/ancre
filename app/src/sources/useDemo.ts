// Act 2 data source: LIVE (tail of chantier 06's demo/out/latest.json through the dev server) or REPLAY (a
// recorded run-*.json from public/runs/). Both feed the same pure reducer (core/demo.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialScreen, parseRun, reduce, type DemoEvent, type Header, type ScreenState } from "../core/demo";

export type RunInfo = { file: string; runId: string; mode: string; chainId: number; startedAt: string; events: number; firstBlock: number; lastBlock: number };
export type Pacing = "recorded" | "presenter";
export type Source =
  | { kind: "replay"; run: RunInfo | null; cursor: number; total: number; playing: boolean; speed: number; pacing: Pacing; at: Header | DemoEvent | null; error: string | null }
  | { kind: "live"; ok: boolean; error: string | null; polls: number; lastChangeMs: number | null };

const params = () => new URLSearchParams(location.search);
const base = import.meta.env.BASE_URL;
const POLL_MS = 250;
const PRESENTER_MS = 1100; // presenter pacing: one event every 1.1 s, a scene boundary holds 2.5 s

export function useDemo() {
  const p = params();
  const [mode, setMode] = useState<"replay" | "live">(p.get("source") === "live" ? "live" : "replay");
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [runFile, setRunFile] = useState<string | null>(p.get("run"));
  const [lines, setLines] = useState<(Header | DemoEvent)[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(p.get("autoplay") === "1");
  const [speed, setSpeed] = useState(Number(p.get("speed") ?? 1));
  const [pacing, setPacing] = useState<Pacing>(p.get("pacing") === "recorded" ? "recorded" : "presenter");
  const [live, setLive] = useState<ScreenState>(initialScreen);
  const [liveInfo, setLiveInfo] = useState({ ok: false, error: null as string | null, polls: 0, lastChangeMs: null as number | null });

  // ---------------------------------------------------------------- replay
  useEffect(() => {
    fetch(`${base}runs/index.json`)
      .then((r) => r.json())
      .then((j) => {
        setRuns(j.runs);
        setRunFile((f) => f ?? j.runs[0]?.file ?? null);
      })
      .catch(() => setRuns([]));
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!runFile) return;
    let stale = false;
    const file = runFile.endsWith(".json") ? runFile : runFile + ".json";
    fetch(`${base}runs/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (stale) return;
        const ls = parseRun(t); // throws on HTML (missing file served as the SPA) or bad JSON
        if (ls[0]?.type !== "header") throw new Error("not an event log");
        const at = firstLoad.current ? Number(params().get("at") ?? 0) : 0; // ?at= applies to the first run only
        firstLoad.current = false;
        setLines(ls);
        setCursor(Number.isFinite(at) ? Math.max(0, Math.min(ls.length - 1, at)) : 0);
        setLoadError(null);
      })
      .catch((e) => {
        if (stale) return;
        setLoadError(`${file}: ${(e as Error).message}`);
        setLines([]); // never show the previous run under the new selection
        setCursor(0);
      });
    return () => {
      stale = true;
    };
  }, [runFile]);

  // every prefix state, once per run: stepping back is free and replay is exactly the reducer's output
  const states = useMemo(() => {
    const out: ScreenState[] = [];
    let s = initialScreen();
    for (const l of lines) out.push((s = reduce(s, l)));
    return out;
  }, [lines]);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (mode !== "replay" || !playing || cursor >= lines.length - 1) {
      if (playing && cursor >= lines.length - 1 && lines.length) setPlaying(false);
      return;
    }
    const cur = lines[cursor], nxt = lines[cursor + 1] as DemoEvent;
    let wait: number;
    if (pacing === "recorded") {
      const dt = cur.type === "event" && nxt.type === "event" ? nxt.wallMs - cur.wallMs : 300;
      wait = Math.min(Math.max(dt, 0), 10_000) / speed;
    } else {
      wait = (nxt.kind === "scene-start" ? PRESENTER_MS * 2.3 : PRESENTER_MS) / speed;
    }
    timer.current = window.setTimeout(() => setCursor((c) => Math.min(c + 1, lines.length - 1)), wait);
    return () => window.clearTimeout(timer.current);
  }, [mode, playing, cursor, lines, speed, pacing]);

  // ---------------------------------------------------------------- live
  useEffect(() => {
    if (mode !== "live") return;
    let stop = false;
    let lastText = "";
    const tick = async () => {
      try {
        const r = await fetch(`${base}live/latest.json`, { cache: "no-store" });
        if (!r.ok) throw new Error(r.status === 404 ? "no demo/out/latest.json yet (start a chantier 06 run)" : `HTTP ${r.status}`);
        const t = await r.text();
        const changed = t !== lastText;
        if (changed) {
          lastText = t;
          const ls = parseRun(t);
          setLive((s) => ls.reduce(reduce, s));
        }
        setLiveInfo((i) => ({ ok: true, error: null, polls: i.polls + 1, lastChangeMs: changed ? Date.now() : i.lastChangeMs }));
      } catch (e) {
        setLiveInfo((i) => ({ ...i, ok: false, error: String((e as Error).message ?? e), polls: i.polls + 1 }));
      }
      if (!stop) window.setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [mode]);

  const screen = mode === "live" ? live : (states[cursor] ?? initialScreen());
  const runInfo = runs.find((r) => r.file === runFile) ?? null;
  const source: Source =
    mode === "live"
      ? { kind: "live", ...liveInfo }
      : { kind: "replay", run: runInfo, cursor, total: lines.length, playing, speed, pacing, at: lines[cursor] ?? null, error: loadError };

  const step = useCallback((d: number) => setCursor((c) => Math.max(0, Math.min(lines.length - 1, c + d))), [lines.length]);
  const jumpScene = useCallback(
    (n: number) => {
      const i = lines.findIndex((l) => l.type === "event" && l.scene === n && l.kind === "scene-start");
      if (i >= 0) setCursor(i);
    },
    [lines],
  );

  return {
    screen,
    source,
    runs,
    setRunFile,
    mode,
    setMode,
    controls: { step, jumpScene, setPlaying, setSpeed, setPacing, restart: () => setCursor(0), end: () => setCursor(lines.length - 1) },
  };
}

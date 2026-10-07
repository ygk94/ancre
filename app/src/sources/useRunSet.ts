// The testnet anchor set shown by Discover / Leaderboard / agent pages: the newest recorded chantier 06 run of
// public/runs/ (index.json lists them, newest first). Fetched once per page load and shared.
import { useEffect, useState } from "react";
import { parseRun } from "../core/demo";
import { buildRunSet, type RunSet } from "../core/runset";

const base = import.meta.env.BASE_URL;
let shared: Promise<RunSet> | null = null;

function load(): Promise<RunSet> {
  return (shared ??= (async () => {
    const idx = await fetch(`${base}runs/index.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`runs index HTTP ${r.status}`))));
    const run = idx.runs?.[0];
    if (!run) throw new Error("no recorded run in public/runs");
    const text = await fetch(`${base}runs/${run.file}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${run.file} HTTP ${r.status}`))));
    const rs = buildRunSet(parseRun(text));
    if (!rs) throw new Error(`${run.file}: no anchor set in the log`);
    return rs;
  })().catch((e) => {
    shared = null; // never keep a failure
    throw e;
  }));
}

export function useRunSet(): { rs: RunSet | null; error: string | null } {
  const [st, setSt] = useState<{ rs: RunSet | null; error: string | null }>({ rs: null, error: null });
  useEffect(() => {
    let dead = false;
    load().then(
      (rs) => !dead && setSt({ rs, error: null }),
      (e) => !dead && setSt({ rs: null, error: String((e as Error).message ?? e) }),
    );
    return () => {
      dead = true;
    };
  }, []);
  return st;
}

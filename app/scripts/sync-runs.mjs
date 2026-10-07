// Copy chantier 06 event logs (demo/out/run-*.json, format ancre-demo-events-v1) into public/runs/ for the
// offline replay, and write public/runs/index.json. Source directory: scripts/runs-dir.mjs.
// Usage: node scripts/sync-runs.mjs [file.json ...]   (default: sample/run-fork.json + out/latest.json)
import { copyFileSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { runsDir, runsDirs } from "./runs-dir.mjs";

const here = new URL("..", import.meta.url).pathname;
const src = runsDir(here);
if (!src) throw new Error(`no chantier 06 demo dir found in ${runsDirs(here).join(", ")}`);
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => resolve(f))
  : [join(src, "sample/run-fork.json"), join(src, "out/latest.json")].filter(existsSync);

const dst = join(here, "public/runs");
const RANK = { testnet: 0, fork: 1, frozen: 2 };
for (const f of files) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  if (j.header?.format !== "ancre-demo-events-v1") throw new Error(`${f}: unexpected format ${j.header?.format}`);
  copyFileSync(f, join(dst, `${j.header.runId}.json`));
  console.log(`${basename(f)} -> public/runs/${j.header.runId}.json (${j.header.network.mode}, ${j.events.length} events)`);
}
const index = readdirSync(dst)
  .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
  .map((f) => {
    const j = JSON.parse(readFileSync(join(dst, f), "utf8"));
    const ev = j.events;
    return { file: f, runId: j.header.runId, mode: j.header.network.mode, chainId: j.header.network.chainId,
             startedAt: j.header.startedAt, events: ev.length, firstBlock: ev[0]?.block ?? null, lastBlock: ev.at(-1)?.block ?? null };
  })
  // first = the run Discover shows: a real testnet run, else a fork run, else a frozen one; newest first within each
  .sort((a, b) => RANK[a.mode] - RANK[b.mode] || b.startedAt.localeCompare(a.startedAt));
writeFileSync(join(dst, "index.json"), JSON.stringify({ source: "chantier 06 demo/ (ancre-demo-events-v1)", syncedAt: new Date().toISOString(), runs: index }, null, 1) + "\n");
console.log(`index: ${index.length} run(s)`);

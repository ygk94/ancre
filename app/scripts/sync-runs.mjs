// Copy chantier 06 event logs (demo/out/run-*.json, format ancre-demo-events-v1) into public/runs/ for the
// offline replay, and write public/runs/index.json. Source directory, first that exists:
//   $ANCRE_RUNS_DIR · ../demo (this repo, once chantier 06 is merged) · ../../ancre-06/demo (sibling worktree)
// Usage: node scripts/sync-runs.mjs [file.json ...]   (default: sample/run-fork.json + out/latest.json)
import { copyFileSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const here = new URL("..", import.meta.url).pathname;
const candidates = [process.env.ANCRE_RUNS_DIR, join(here, "../demo"), join(here, "../../ancre-06/demo")].filter(Boolean);
const src = candidates.find((d) => existsSync(join(d, "EVENTS.md")) || existsSync(join(d, "out")));
if (!src) throw new Error(`no chantier 06 demo dir found in ${candidates.join(", ")}`);
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => resolve(f))
  : [join(src, "sample/run-fork.json"), join(src, "out/latest.json")].filter(existsSync);

const dst = join(here, "public/runs");
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
  .sort((a, b) => (a.mode === "fork" ? -1 : 1) - (b.mode === "fork" ? -1 : 1) || b.startedAt.localeCompare(a.startedAt));
writeFileSync(join(dst, "index.json"), JSON.stringify({ source: "chantier 06 demo/ (ancre-demo-events-v1)", syncedAt: new Date().toISOString(), runs: index }, null, 1) + "\n");
console.log(`index: ${index.length} run(s)`);

// Where the chantier 06 event logs are, first that exists: $ANCRE_RUNS_DIR · ../demo (this repo, once chantier 06
// is merged) · ../../ancre-06/demo (sibling worktree). Shared by vite.config.ts (live) and sync-runs.mjs (replay).
import { existsSync } from "node:fs";
import { join } from "node:path";

export function runsDirs(appDir) {
  return [process.env.ANCRE_RUNS_DIR, join(appDir, "../demo"), join(appDir, "../../ancre-06/demo")].filter(Boolean);
}

export function runsDir(appDir) {
  return runsDirs(appDir).find((d) => existsSync(join(d, "EVENTS.md")) || existsSync(join(d, "out")));
}

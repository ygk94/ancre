import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Live act 2 in dev: serve the chantier 06 event log (demo/out/latest.json, rewritten atomically after every
// event) at /live/latest.json. Dev-server only: a static build has no live source and starts in replay.
// Directory, first that exists: $ANCRE_RUNS_DIR · ../demo · ../../ancre-06/demo.
function liveRuns(): Plugin {
  const dirs = [process.env.ANCRE_RUNS_DIR, join(__dirname, "../demo"), join(__dirname, "../../ancre-06/demo")].filter(
    Boolean,
  ) as string[];
  return {
    name: "ancre-live-runs",
    configureServer(server) {
      server.middlewares.use("/live/latest.json", (_req, res) => {
        const f = dirs.map((d) => join(d, "out/latest.json")).find(existsSync);
        res.setHeader("cache-control", "no-store");
        if (!f) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "no demo/out/latest.json yet", searched: dirs.length }));
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(f));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), liveRuns()],
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

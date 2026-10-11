import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { runsDirs } from "./scripts/runs-dir.mjs";

// Live act 2 in dev: serve the chantier 06 event log (demo/out/latest.json, rewritten atomically after every
// event) at /live/latest.json. Dev-server only: a static build has no live source and starts in replay.
// Directories: scripts/runs-dir.mjs.
function liveRuns(): Plugin {
  const dirs = runsDirs(__dirname);
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
  // History-API routes (/agent/testnet/2022) need absolute asset URLs; a sub-path host sets ANCRE_BASE=/sub/
  base: process.env.ANCRE_BASE ?? "/",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    // Second entry: the /mera passkey PRF prototype (06-E3), kept out of the demo screen's bundle.
    rolldownOptions: { input: { main: resolve(__dirname, "index.html"), mera: resolve(__dirname, "mera/index.html") } },
  },
});

// Write src/data/mainnet-run.json from the archived log of the minimal mainnet run (10/10). Re-run it if a new
// mainnet run is archived. test/mainnet-onchain.test.ts checks the committed file against the log.
// Usage: node scripts/export-mainnet-run.mjs [docs/chantiers/rapports/act-mainnet/run-<ts>.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { extractMainnetRun } from "../src/core/mainnetRun.ts";

const app = new URL("..", import.meta.url).pathname;
const repo = resolve(app, "..");
const dir = join(repo, "docs/chantiers/rapports/act-mainnet");
const file = process.argv[2]
  ? resolve(process.argv[2])
  : join(dir, readdirSync(dir).filter((f) => /^run-.*Z\.json$/.test(f)).sort().at(-1));
const out = extractMainnetRun(JSON.parse(readFileSync(file, "utf8")), relative(repo, file));
writeFileSync(join(app, "src/data/mainnet-run.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${out.source} -> src/data/mainnet-run.json (${out.certificates.length} certificates, ${out.payments.length} payments)`);

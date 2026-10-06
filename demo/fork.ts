#!/usr/bin/env node
// A long-lived fork for resumable rehearsals: `node fork.ts`, then in another terminal
// `node run.ts --rpc http://127.0.0.1:8549` (as many times as needed: done steps are skipped). Ctrl-C stops it.
import { startAnvil } from "./lib/anvil.ts";
import { FORK_PORT } from "./lib/config.ts";

const i = process.argv.indexOf("--fork-block");
const a = await startAnvil({ port: FORK_PORT, forkBlock: i >= 0 ? Number(process.argv[i + 1]) : undefined });
console.log(`anvil fork of Monad testnet 10143 on ${a.rpc} (Ctrl-C to stop)`);
process.on("SIGINT", async () => { await a.stop(); process.exit(0); });
await new Promise(() => {});

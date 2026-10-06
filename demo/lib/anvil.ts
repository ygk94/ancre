// Local chains for the act: an `anvil --network monad` fork of Monad testnet 10143 (Monad gas model: MIP-8 pages,
// gas limit billed), or the FROZEN demo (D28): the state dumped after the setup, replayed without any network.
import { spawn } from "node:child_process";
import { createPublicClient, http } from "viem";
import { FOUNDRY, TESTNET } from "./config.ts";

export type Anvil = { rpc: string; stop: () => Promise<void> };

export function anvilArgs(o: { port: number; forkBlock?: number; loadState?: string; dumpState?: string; offline?: boolean; blockTime?: number }) {
  const a = ["--network", "monad", "--chain-id", String(TESTNET.chainId), "--port", String(o.port), "--silent"];
  if (o.blockTime) a.push("--block-time", String(o.blockTime)); // interval mining: blocks keep coming, as on Monad
  if (!o.offline) {
    a.push("--fork-url", TESTNET.rpc, "--timeout", "120000", "--retries", "10");
    if (o.forkBlock) a.push("--fork-block-number", String(o.forkBlock));
  }
  if (o.loadState) a.push("--load-state", o.loadState);
  if (o.dumpState) a.push("--dump-state", o.dumpState);
  return a;
}

export async function startAnvil(o: Parameters<typeof anvilArgs>[0]): Promise<Anvil> {
  // never reuse whatever already answers on the port (an `npm run fork` anvil, an orphan): it is not a fresh chain
  try {
    await createPublicClient({ transport: http(`http://127.0.0.1:${o.port}`, { retryCount: 0, timeout: 1_000 }) }).getChainId();
    throw new Error(`port ${o.port} is already in use: stop that node, pass --port, or use --rpc to run against it`);
  } catch (e) {
    if ((e as Error).message.startsWith("port ")) throw e;
  }
  const proc = spawn(`${FOUNDRY}/anvil`, anvilArgs(o), { stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, ETH_RPC_TIMEOUT: "900" } });
  process.once("exit", () => { if (proc.exitCode === null) proc.kill("SIGINT"); }); // no orphan, whatever throws
  const rpc = `http://127.0.0.1:${o.port}`;
  const pub = createPublicClient({ transport: http(rpc) });
  for (let i = 0; i < 240; i++) {
    if (proc.exitCode !== null) throw new Error(`anvil exited (${proc.exitCode})`);
    try {
      await pub.getChainId();
      return {
        rpc,
        stop: () => new Promise((res) => {                  // SIGINT: anvil writes --dump-state on a clean exit
          if (proc.exitCode !== null) return res();
          proc.once("exit", () => res());
          proc.kill("SIGINT");
        }),
      };
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  proc.kill();
  throw new Error("anvil did not start");
}

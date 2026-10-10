#!/usr/bin/env node
// ANCRE act 2: Sybil farm and demo scenes. See demo/RUNBOOK.md.
//
//   node run.ts                              fork of testnet 10143 (starts its own anvil), all scenes
//   node run.ts --rpc http://127.0.0.1:8549  an anvil you started (npm run fork): resumable across runs
//   node run.ts --scenes 0                   setup only (then --scenes 1-6 later: done steps are skipped)
//   node run.ts --freeze                     pinned fork: setup, dump, rehearsal of 1-6, self-contained frozen state (D28)
//   node run.ts --frozen                     replay scenes 1-6 on the frozen state, offline
//   node run.ts --sweep                      ... then send the unspent MON of every emitter back to the operator
//   node run.ts --network testnet --keystore <path>   REAL testnet: needs Hugo's go-ahead (typed confirmation)
//   node run.ts --rehearse-mainnet [--keystore <path>] [--sweep]   minimal act on a fork of MAINNET 143 (lib/mainnet.ts)
//   node run.ts --network mainnet --keystore <path> --sweep        REAL mainnet (D59): Hugo only, MAINNET_OWNER required
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createPublicClient, http, keccak256, toHex } from "viem";
import { dumpState, forkCacheFile, mergeCache, writeFrozen } from "./lib/freeze.ts";
import { privateKeyToAccount } from "viem/accounts";
import { askPassword, decryptKeystore, demoAccounts, emitters, FORK_SEED } from "./lib/accounts.ts";
import { type Anvil, startAnvil } from "./lib/anvil.ts";
import { Chain, type Mode } from "./lib/chain.ts";
import { DEMO, FARM_SIZE, FORK_PORT, OUT, SET, TESTNET } from "./lib/config.ts";
import { EventLog } from "./lib/events.ts";
import { EmulatedFacilitator, HttpFacilitator } from "./lib/x402.ts";
import { ancreArt, type Ctx, scene0, scene1, scene2, scene3, scene4, scene5, scene6, scene7 } from "./lib/scenes.ts";
import { loadState, saveState, type State, statePath } from "./lib/state.ts";
import { budgetReport } from "./lib/budget.ts";
import { sweep } from "./lib/sweep.ts";
import { mainnetMain } from "./lib/mainnet.ts";

// strict: a mistyped option (`--scene 0`) is an error, never silently "all scenes" (it matters on the testnet)
const { values: args } = parseArgs({ strict: true, options: {
  network: { type: "string", default: "fork" }, rpc: { type: "string" }, scenes: { type: "string" }, port: { type: "string" },
  "fork-block": { type: "string" }, keystore: { type: "string" }, freeze: { type: "boolean" }, frozen: { type: "boolean" },
  online: { type: "boolean" }, "keep-state": { type: "boolean" }, resume: { type: "boolean" }, sweep: { type: "boolean" },
  "sweep-only": { type: "boolean" }, "rehearse-testnet": { type: "boolean" }, "rehearse-mainnet": { type: "boolean" },
} });

function parseScenes(s: string): number[] {
  if (s === "all") return [0, 1, 7, 2, 3, 4, 5, 6]; // scene 7 (second hop, D50) right after the honest providers
  return s.split(",").flatMap((p) => {
    const [a, b] = p.split("-").map(Number);
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

const FROZEN_DIR = join(DEMO, "frozen"); // tracked: the judges replay act 2 with no RPC at all
const FROZEN_STATE = join(FROZEN_DIR, "anvil-state.json");

/** Keystore of the operator (testnet run and its rehearsal): its key is the seed of every demo account. */
async function unlock(ks: string | undefined, real: boolean) {
  if (!ks) throw new Error("--keystore <path> is required (the operator's encrypted Foundry keystore)");
  if (real) {
    if (!process.stdin.isTTY) throw new Error("the testnet run needs an interactive terminal (typed confirmation)");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const phrase = "send real testnet transactions";
    const ans = await rl.question(`About to send REAL Monad testnet transactions (see demo/BUDGET.md). Type "${phrase}": `);
    rl.close();
    if (ans.trim() !== phrase) throw new Error("not confirmed");
  }
  const pw = await askPassword("keystore password: ");
  const seed = decryptKeystore(ks, pw);
  return { seed, passwordEnv: { ANCRE_DEMO_PASSWORD: pw }, signer: `keystore:${ks}:ANCRE_DEMO_PASSWORD:${privateKeyToAccount(seed).address}` };
}

async function main() {
  // the minimal mainnet act (D40, D59) has its own flow and guards: lib/mainnet.ts
  if (args.network === "mainnet" || args["rehearse-mainnet"]) {
    if (args.freeze || args.frozen || args["rehearse-testnet"]) throw new Error("--freeze/--frozen/--rehearse-testnet do not apply to the mainnet act");
    return mainnetMain(args);
  }
  if (args.network !== "fork" && args.network !== "testnet") throw new Error(`--network ${args.network}: fork, testnet or mainnet`);
  // dress rehearsal of the testnet run on a fork: keystore, cast keystore signer, reserve waits, interval mining,
  // a 5 MON operator; only the facilitator stays emulated (no request to any external service)
  const rehearse = !!args["rehearse-testnet"];
  const { frozen, freeze } = args;
  const mode: Mode = args.network === "testnet" ? "testnet" : frozen ? "frozen" : "fork";
  const monadRules = mode === "testnet" || rehearse;
  const name = rehearse ? "rehearsal" : mode;
  const scenes = parseScenes(args.scenes ?? (frozen ? "1,7,2-6" : "all"));
  const ks = monadRules ? await unlock(args.keystore, mode === "testnet") : undefined;
  let anvil: Anvil | undefined;
  let rpc = args.rpc ?? (mode === "testnet" ? TESTNET.rpc : undefined);
  let forkBlock = args["fork-block"] ? Number(args["fork-block"]) : undefined;
  let s0: Awaited<ReturnType<typeof dumpState>> | undefined;

  if (frozen) {
    if (!existsSync(FROZEN_STATE)) throw new Error("no frozen state: run `node run.ts --freeze` first");
    mkdirSync(OUT, { recursive: true });
    if (!args["keep-state"]) { // fresh replay: the scene state of the freeze, no certifier cache
      copyFileSync(join(FROZEN_DIR, "state-frozen.json"), statePath("frozen"));
      rmSync(join(OUT, "frozen"), { recursive: true, force: true });
    }
    anvil = await startAnvil({ port: Number(args.port ?? FORK_PORT + 1), loadState: FROZEN_STATE, offline: !args.online });
    rpc = anvil.rpc;
  } else if (!rpc) {
    if (!args.resume) { // own anvil = fresh chain = fresh state and certifier cache
      rmSync(statePath(name), { force: true });
      rmSync(join(OUT, name), { recursive: true, force: true });
    }
    // a freeze pins the fork block: Foundry then caches every remote read of the rehearsal (lib/freeze.ts)
    if (freeze) forkBlock ??= Number(await createPublicClient({ transport: http(TESTNET.rpc) }).getBlockNumber()) - 5;
    anvil = await startAnvil({ port: Number(args.port ?? FORK_PORT), forkBlock, blockTime: rehearse ? 1 : undefined });
    rpc = anvil.rpc;
  }

  const chain = new Chain(rpc!, mode, TESTNET.chainId, monadRules);
  if ((await chain.pub.getChainId()) !== TESTNET.chainId) throw new Error("not chain 10143");
  const acc = demoAccounts(ks?.seed ?? FORK_SEED, !!ks);
  const signer = ks?.signer ?? `unlocked:${acc.operator.account.address}`;
  if (!ks) await chain.impersonate(acc.operator.account.address); // the certifier's `cast --unlocked` on a local chain

  // state: resume only if it belongs to this chain (its ANCRE still has code)
  let state = loadState(name);
  if (state && state.operator !== acc.operator.account.address) state = undefined;
  if (state?.ancre && !(await chain.pub.getCode({ address: state.ancre }))) {
    console.log("state file belongs to another chain instance: starting over");
    state = undefined;
  }
  const head = await chain.block();
  state ??= { version: 1, mode, chainId: TESTNET.chainId, operator: acc.operator.account.address, runId: EventLog.newRunId(),
    agents: {}, done: {}, notes: {} } as State;
  if (frozen && !args["keep-state"]) state.runId = EventLog.newRunId();
  saveState(name, state);

  const st = state;
  const log = new EventLog(chain, st.runId, {
    network: { chainId: TESTNET.chainId, mode, forkBlock: forkBlock ?? (mode === "fork" ? head.number : null), rpc: mode === "testnet" ? rpc : "local" },
  });
  const header = () => log.setHeader({
    contracts: { identity: TESTNET.identity, reputation: TESTNET.reputation, ancre: st.ancre ?? null, payer: st.payer ?? null, usdc: TESTNET.usdc },
    set: st.set ? {
      setId: st.setId, anchors: acc.anchors.map((a) => ({ address: a.account.address, label: a.label })),
      minAnchors: SET.minAnchors, vetoQuorum: SET.vetoQuorum, theta: SET.theta.toString(), thetaPct: Number(SET.theta) / 1e16,
      level: "Registry-verified, attested submitter", submitter: acc.operator.account.address, maxAge: SET.maxAge, minRefresh: SET.minRefresh,
      tags: (st.set.tags as { tag: string; min: string; neutral: string; max: string; kind: number }[]).map((t) => ({
        tag: t.tag, hash: keccak256(toHex(t.tag)), kind: t.kind === 0 ? "endorsement" : "measurement", min: t.min, neutral: t.neutral, max: t.max })),
    } : null,
    actors: [
      { label: acc.operator.label, role: "operator", address: acc.operator.account.address },
      ...acc.anchors.map((a) => ({ label: a.label, role: "anchor", address: a.account.address })),
      { label: acc.payerOperator.label, role: "payer-operator", address: acc.payerOperator.account.address },
      { label: acc.farmOwner.label, role: "farm-owner", address: acc.farmOwner.account.address },
      { label: acc.rater.label, role: "rater", address: acc.rater.account.address },
      ...Object.entries(st.agents).map(([label, a]) => ({ label, role: a.role, agentId: a.agentId, owner: a.owner, wallet: a.wallet })),
    ],
  });
  header();
  if (st.ancre && st.setId) log.ancre = { address: st.ancre, abi: ancreArt.abi, setId: st.setId, theta: SET.theta };

  // MON lent to each emitter for its gas: its transactions' MEASURED gas limits (fork, 06/10: giveFeedback <= 327 k,
  // register <= 393 k, setAgentWallet <= 97 k) at 102 gwei, x 1.5. Recoverable by `--sweep` (capital, not fees).
  const wei = (gas: number) => (BigInt(Math.ceil(gas * 1.5)) * 102n * 10n ** 9n);
  const FB = 330_000, REG = 395_000, WAL = 100_000;
  const monBudget: Record<string, bigint> = {};
  acc.anchors.forEach((a, i) => { monBudget[a.label] = wei((i === 1 ? 3 : i === 2 ? 2 : 1) * FB); });
  monBudget[acc.farmOwner.label] = wei((FARM_SIZE + 1) * (REG + WAL));
  acc.farm.forEach((a) => { monBudget[a.label] = wei(2 * FB); });
  monBudget[acc.rater.label] = wei(FB);
  monBudget[acc.providers[0].label] = wei(FB); // scene 7: provider-1 vouches for provider-3

  const ctx: Ctx = {
    chain, name, acc, state: st, log, signer, passwordEnv: ks?.passwordEnv, monBudget, facilitatorTxs: [],
    fac: mode === "testnet" ? new HttpFacilitator(chain, TESTNET.facilitatorUrl) : new EmulatedFacilitator(chain, TESTNET.usdc),
  };
  if (args["sweep-only"]) {
    await sweep(chain, emitters(acc), acc.operator);
    if (anvil) await anvil.stop();
    return;
  }
  const fns = [scene0, scene1, scene2, scene3, scene4, scene5, scene6, scene7];
  let failed: unknown;
  try {
    for (const s of scenes) {
      await fns[s](ctx);
      header();
      if (freeze && s === 0) { // S0: the state right after the setup, plus the scene state that goes with it
        s0 = await dumpState(chain);
        copyFileSync(statePath(name), join(FROZEN_DIR, "state-frozen.json"));
      }
    }
    if (args.sweep) await sweep(chain, emitters(acc), acc.operator);
  } catch (e) {
    failed = e;
    console.error(`\n✗ stopped: ${(e as Error).message}\n  re-run the same command (with --rpc/--resume on a fork) to resume at the failed step`);
  } finally {
    const rep = budgetReport(ctx, emitters(acc));
    writeFileSync(join(OUT, `${state.runId}.budget.json`), JSON.stringify(rep, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));
    if (anvil) await anvil.stop(); // SIGINT: anvil writes --dump-state on exit
    if (freeze && !failed && s0 && forkBlock) {
      const m = mergeCache(s0, forkCacheFile(forkBlock));
      writeFrozen(FROZEN_STATE, m.state);
      writeFileSync(join(FROZEN_DIR, "meta.json"), JSON.stringify({ forkBlock, frozenAt: new Date().toISOString(),
        accounts: Object.keys(m.state.accounts).length, addedFromCache: { accounts: m.addedAccounts, slots: m.addedSlots },
        rehearsalRun: state.runId }, null, 2));
      console.log(`\nfrozen state written to ${FROZEN_STATE} (fork block ${forkBlock}, +${m.addedAccounts} accounts and +${m.addedSlots} slots from the fork cache)`);
    }
  }
  console.log(`\nevents: ${log.path("json")}\n${failed ? "ACT 2 FAIL" : "ACT 2 PASS"} (scenes ${scenes.join(",")}, ${mode})`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });

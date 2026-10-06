#!/usr/bin/env node
// ANCRE act 2: Sybil farm and demo scenes. See demo/RUNBOOK.md.
//
//   node run.ts                              fork of testnet 10143 (starts its own anvil), all scenes
//   node run.ts --rpc http://127.0.0.1:8549  an anvil you started (npm run fork): resumable across runs
//   node run.ts --scenes 0                   setup only (then --scenes 1-6 later: done steps are skipped)
//   node run.ts --freeze                     pinned fork: setup, dump, rehearsal of 1-6, self-contained frozen state (D28)
//   node run.ts --frozen                     replay scenes 1-6 on the frozen state, offline
//   node run.ts --network testnet --keystore <path>   REAL testnet: needs Hugo's go-ahead (typed confirmation)
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { createPublicClient, type Hex, http, keccak256, toHex } from "viem";
import { dumpState, forkCacheFile, mergeCache, writeFrozen } from "./lib/freeze.ts";
import { askPassword, decryptKeystore, demoAccounts, emitters, FORK_SEED } from "./lib/accounts.ts";
import { type Anvil, startAnvil } from "./lib/anvil.ts";
import { artifact, Chain, type Mode } from "./lib/chain.ts";
import { DEMO, FARM_SIZE, FORK_PORT, OUT, SET, TESTNET } from "./lib/config.ts";
import { EventLog } from "./lib/events.ts";
import { EmulatedFacilitator, HttpFacilitator } from "./lib/x402.ts";
import { type Ctx, scene0, scene1, scene2, scene3, scene4, scene5, scene6 } from "./lib/scenes.ts";
import { loadState, saveState, type State, statePath } from "./lib/state.ts";
import { budgetReport } from "./lib/budget.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

function parseScenes(s: string): number[] {
  if (s === "all") return [0, 1, 2, 3, 4, 5, 6];
  return s.split(",").flatMap((p) => {
    const [a, b] = p.split("-").map(Number);
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

const FROZEN_DIR = join(DEMO, "frozen"); // tracked: the judges replay act 2 with no RPC at all
const FROZEN_STATE = join(FROZEN_DIR, "anvil-state.json");

async function main() {
  const network = opt("network", "fork");
  const frozen = flag("frozen");
  const freeze = flag("freeze");
  const mode: Mode = network === "testnet" ? "testnet" : frozen ? "frozen" : "fork";
  const name = mode;
  const scenes = parseScenes(opt("scenes", frozen ? "1-6" : "all")!);
  let anvil: Anvil | undefined;
  let rpc = opt("rpc");
  let seed: Hex = FORK_SEED;
  let operatorIsSeed = false;
  let passwordEnv: Record<string, string> | undefined;
  let signer: string;
  let forkBlock: number | undefined;
  let s0: Awaited<ReturnType<typeof dumpState>> | undefined;

  if (mode === "testnet") {
    rpc ??= TESTNET.rpc;
    const ks = opt("keystore");
    if (!ks) throw new Error("--keystore <path> is required on the testnet (the operator's encrypted Foundry keystore)");
    if (!process.stdin.isTTY) throw new Error("the testnet run needs an interactive terminal (typed confirmation)");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const phrase = "send real testnet transactions";
    const ans = await rl.question(`About to send REAL Monad testnet transactions (see demo/BUDGET.md). Type "${phrase}": `);
    rl.close();
    if (ans.trim() !== phrase) throw new Error("not confirmed");
    const pw = await askPassword("keystore password: ");
    seed = decryptKeystore(ks, pw);
    operatorIsSeed = true;
    passwordEnv = { ANCRE_DEMO_PASSWORD: pw };
    signer = `keystore:${ks}:ANCRE_DEMO_PASSWORD`;
  } else {
    if (frozen) {
      if (!existsSync(FROZEN_STATE)) throw new Error("no frozen state: run `node run.ts --freeze` first");
      if (!flag("keep-state")) { // fresh replay: the scene state of the freeze, no certifier cache
        copyFileSync(join(FROZEN_DIR, "state-frozen.json"), statePath("frozen"));
        rmSync(join(OUT, "frozen"), { recursive: true, force: true });
      }
      anvil = await startAnvil({ port: Number(opt("port", String(FORK_PORT + 1))), loadState: FROZEN_STATE, offline: !flag("online") });
      rpc = anvil.rpc;
    } else if (!rpc) {
      if (!flag("resume")) { // own anvil = fresh chain = fresh state and certifier cache
        rmSync(statePath(name), { force: true });
        rmSync(join(OUT, name), { recursive: true, force: true });
      }
      mkdirSync(FROZEN_DIR, { recursive: true });
      // a freeze pins the fork block: Foundry then caches every remote read of the rehearsal (lib/freeze.ts)
      if (freeze && !opt("fork-block")) forkBlock = Number(await createPublicClient({ transport: http(TESTNET.rpc) }).getBlockNumber()) - 5;
      else if (opt("fork-block")) forkBlock = Number(opt("fork-block"));
      anvil = await startAnvil({ port: Number(opt("port", String(FORK_PORT))), forkBlock });
      rpc = anvil.rpc;
    }
    signer = "";
  }

  const chain = new Chain(rpc!, mode, TESTNET.chainId);
  if ((await chain.pub.getChainId()) !== TESTNET.chainId) throw new Error("not chain 10143");
  const acc = demoAccounts(seed, operatorIsSeed);
  if (!signer) signer = `unlocked:${acc.operator.account.address}`;

  // state: resume only if it belongs to this chain (its ANCRE still has code)
  let state = loadState(name);
  if (state && state.operator !== acc.operator.account.address) state = undefined;
  if (state?.ancre && !(await chain.pub.getCode({ address: state.ancre }))) {
    console.log("state file belongs to another chain instance: starting over");
    state = undefined;
  }
  const head = await chain.block();
  state ??= { version: 1, mode, chainId: TESTNET.chainId, operator: acc.operator.account.address, runId: EventLog.newRunId(),
    startBlock: head.number, agents: {}, done: {}, notes: {} } as State;
  if (frozen && !flag("keep-state")) state.runId = EventLog.newRunId();
  saveState(name, state);

  const log = new EventLog(chain, state.runId, {
    network: { chainId: TESTNET.chainId, mode, forkBlock: forkBlock ?? (mode === "fork" ? head.number : null), rpc: mode === "testnet" ? rpc : "local" },
    contracts: { identity: TESTNET.identity, reputation: TESTNET.reputation, ancre: state.ancre ?? null, payer: state.payer ?? null, usdc: TESTNET.usdc },
  });
  const header = () => log.setHeader({
    contracts: { identity: TESTNET.identity, reputation: TESTNET.reputation, ancre: state!.ancre ?? null, payer: state!.payer ?? null, usdc: TESTNET.usdc },
    set: state!.set ? {
      setId: state!.setId, anchors: acc.anchors.map((a) => ({ address: a.account.address, label: a.label })),
      minAnchors: SET.minAnchors, vetoQuorum: SET.vetoQuorum, theta: SET.theta.toString(), thetaPct: Number(SET.theta) / 1e16,
      level: "Registry-verified, attested submitter", submitter: acc.operator.account.address, maxAge: SET.maxAge, minRefresh: SET.minRefresh,
      tags: (state!.set.tags as { tag: string; min: string; neutral: string; max: string; kind: number }[]).map((t) => ({
        tag: t.tag, hash: keccak256(toHex(t.tag)), kind: t.kind === 0 ? "endorsement" : "measurement", min: t.min, neutral: t.neutral, max: t.max })),
    } : null,
    actors: [
      { label: acc.operator.label, role: "operator", address: acc.operator.account.address },
      ...acc.anchors.map((a) => ({ label: a.label, role: "anchor", address: a.account.address })),
      { label: acc.payerOperator.label, role: "payer-operator", address: acc.payerOperator.account.address },
      { label: acc.farmOwner.label, role: "farm-owner", address: acc.farmOwner.account.address },
      { label: acc.rater.label, role: "rater", address: acc.rater.account.address },
      ...Object.entries(state!.agents).map(([label, a]) => ({ label, role: a.role, agentId: a.agentId, owner: a.owner, wallet: a.wallet })),
    ],
  });
  header();
  if (state.ancre && state.setId) log.ancre = { address: state.ancre, abi: artifact("AnchoredReputation").abi, setId: state.setId, theta: SET.theta };

  // MON for gas per emitter (wei), from the measured fork costs (demo/BUDGET.md), x1.5
  const gwei = 10n ** 9n;
  const per = (txs: number) => BigInt(Math.ceil(txs * 320_000 * 1.5)) * 102n * gwei;
  const monBudget: Record<string, bigint> = {};
  acc.anchors.forEach((a, i) => { monBudget[a.label] = per(i === 1 ? 3 : 2); });
  monBudget[acc.farmOwner.label] = per(2 * (FARM_SIZE + 1));
  acc.farm.forEach((a) => { monBudget[a.label] = per(2); });
  monBudget[acc.rater.label] = per(1);

  const ctx: Ctx = {
    chain, name, acc, state, log, signer, passwordEnv, monBudget, facilitatorTxs: [],
    fac: mode === "testnet" ? new HttpFacilitator(chain, TESTNET.facilitatorUrl) : new EmulatedFacilitator(chain, TESTNET.usdc),
  };
  const fns = [scene0, scene1, scene2, scene3, scene4, scene5, scene6];
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

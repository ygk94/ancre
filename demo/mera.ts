// ANCRE x Mera (12/10): an anchor whose key is derived from a passkey by Mera (the /mera/ page, porte P4 passed on
// 12/10: the same synced passkey re-derives the same epoch keys on the Mac and on the iPhone).
//
// On the OFFICIAL testnet instance (ANCRE 0x8bE6…da9B), a second anchor set "mera" = {anchor-A, anchor-B, the
// passkey anchor}, same policy as the official set (m = 2, veto quorum 1), and a second demo payer bound to it.
// The official set and payer are not touched.
//
//   node mera.ts setup   [--rehearse] --keystore <ks>   fund the passkey anchor, register the set, certify it,
//                                                       deploy and fund the payer, pay provider-1 (PAID)
//   (the passkey anchor then slashes provider-1 from the /mera/ page: Mera signs, Face ID / Touch ID)
//   node mera.ts after   [--rehearse] --keystore <ks>   the next payment to provider-1 is refused (ANCRE_STATUS),
//                                                       latency from the slash block
//
// --rehearse: a local anvil fork of the testnet, the facilitator emulated, the slash sent by impersonating the passkey
// anchor. Without it: REAL Monad testnet transactions, after a typed confirmation.
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { type Address, createPublicClient, encodeDeployData, encodeFunctionData, formatEther, getAddress, http, parseEventLogs, toHex, zeroAddress, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { reputationAbi, usdcAbi } from "./lib/abi.ts";
import { type Actor, askPassword, decryptKeystore, demoAccounts } from "./lib/accounts.ts";
import { type Anvil, startAnvil } from "./lib/anvil.ts";
import { artifact, Chain } from "./lib/chain.ts";
import { FORK_PORT, OUT, PAY_AMOUNT, SET, TAG2, TESTNET, VALUES } from "./lib/config.ts";
import { EventLog } from "./lib/events.ts";
import { agent, ancreArt, assess, certifyStep, check, type Ctx, dealUsdc, id, payViaPayer, scene, step } from "./lib/scenes.ts";
import { loadState, saveState, type State, statePath } from "./lib/state.ts";
import { printSet, setConfig } from "./lib/certify.ts";
import { EmulatedFacilitator, HttpFacilitator } from "./lib/x402.ts";

const args = parseArgs({ allowPositionals: true, strict: true, options: {
  rehearse: { type: "boolean" }, keystore: { type: "string" }, port: { type: "string" } } });
const cmd = args.positionals[0];
if (cmd !== "setup" && cmd !== "after") throw new Error("usage: node mera.ts setup|after [--rehearse] --keystore <ks>");
const rehearse = !!args.values.rehearse;

/** The passkey anchor: epoch 0 of label "p4-proto", derived by Mera on Hugo's Mac and iPhone (12/10, identical). */
export const MERA_ANCHOR = getAddress("0xe3c887E2AEDaE83bCDb63143394B5887dd9f309b");
const OFFICIAL = { ancre: getAddress("0x8bE6D3DD7F20b94cD9B1Ec51De199291B109da9B") };
const PROVIDER = "provider-1 (demo)"; // #2050: vouched for by anchor-A and anchor-B on 07/10 (official run)
const ROLES = { owner: getAddress("0xD6FabC0A420127F493DeECdb461EaD4DAD644071"), treasury: getAddress("0x0146082951DE0C4d09fca1e1277ACa8963a305B9") };
const MERA_FUND = 3n * 10n ** 17n; // 0.3 MON: gas for a few feedbacks from the browser (one ~ 0.03 MON at 102 gwei)
const DEPOSIT = 30_000n; // 0.03 USDC: one paid payment and margin
const payerArt = artifact("TrustGatedPayer");
const name = rehearse ? "mera-rehearsal" : "mera-testnet";

async function main() {
  if (!args.values.keystore) throw new Error("--keystore <path> is required (~/.foundry/keystores/ancre-demo)");
  if (!rehearse && cmd === "setup") {
    if (!process.stdin.isTTY) throw new Error("the real run needs an interactive terminal (typed confirmation)");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const phrase = "send real testnet transactions";
    const ans = await rl.question(`About to send REAL Monad testnet transactions (mera set, payer, 0.3 MON to the passkey anchor). Type "${phrase}": `);
    rl.close();
    if (ans.trim() !== phrase) throw new Error("not confirmed: nothing sent");
  }
  const pw = await askPassword("keystore password: ");
  const seed = decryptKeystore(args.values.keystore, pw);
  const opAddr = privateKeyToAccount(seed).address;
  const passwordEnv = { ANCRE_DEMO_PASSWORD: pw };
  const signer = `keystore:${args.values.keystore}:ANCRE_DEMO_PASSWORD:${opAddr}`;

  let anvil: Anvil | undefined;
  let rpc = TESTNET.rpc;
  if (rehearse) {
    if (cmd === "setup") { rmSync(statePath(name), { force: true }); rmSync(join(OUT, name), { recursive: true, force: true }); }
    const forkBlock = Number(await createPublicClient({ transport: http(TESTNET.rpc) }).getBlockNumber()) - 5;
    anvil = await startAnvil({ port: Number(args.values.port ?? FORK_PORT + 3), forkBlock, blockTime: 1 });
    rpc = anvil.rpc;
  }
  const chain = new Chain(rpc, rehearse ? "fork" : "testnet", TESTNET.chainId, true);
  if ((await chain.pub.getChainId()) !== TESTNET.chainId) throw new Error("not chain 10143");

  // accounts: the official demo accounts (same seed), the set = anchor-A, anchor-B and the passkey anchor
  const acc = demoAccounts(seed, true);
  const meraActor = { label: "passkey anchor (Mera, epoch 0)", role: "anchor", account: { address: MERA_ANCHOR } } as unknown as Actor;
  acc.anchors = [acc.anchors[0], acc.anchors[1], meraActor];
  const official = loadState("testnet");
  if (!official || getAddress(official.ancre!) !== OFFICIAL.ancre) throw new Error("out/state-testnet.json does not name the official instance");

  let state = loadState(name);
  if (cmd === "after" && !state?.payer) throw new Error(`no ${name} state: run setup first`);
  state ??= { version: 1, mode: name, chainId: TESTNET.chainId, operator: opAddr, runId: EventLog.newRunId(),
    agents: official.agents, done: {}, notes: {}, ancre: OFFICIAL.ancre } as State;
  saveState(name, state);
  const log = new EventLog(chain, state.runId, { network: { chainId: TESTNET.chainId, mode: name, forkBlock: null, rpc: rehearse ? "local" : TESTNET.rpc } });
  const ctx: Ctx = { chain, name, acc, state, log, signer, passwordEnv, monBudget: {}, facilitatorTxs: [],
    fac: rehearse ? new EmulatedFacilitator(chain, TESTNET.usdc) : new HttpFacilitator(chain, TESTNET.facilitatorUrl) };
  acc.payerOperator = acc.operator; // the operator signs payments (as on the mainnet act, D59)
  const st = state;

  if (rehearse && cmd === "setup") { // the operator's real balances are on the fork already; top up if a faucet ran low
    if ((await chain.pub.getBalance({ address: opAddr })) < 10n ** 18n) await chain.setBalance(opAddr, 5n * 10n ** 18n);
    await dealUsdc(chain, opAddr, DEPOSIT);
  }
  const before = await chain.pub.getBalance({ address: opAddr });

  if (cmd === "setup") {
    await scene(ctx, 0, "mera set: anchor-A, anchor-B and a passkey anchor (Mera); a payer bound to it", async () => {
      await step(ctx, "0.fund-mera", async () => {
        const have = await chain.pub.getBalance({ address: MERA_ANCHOR });
        if (have >= MERA_FUND) return;
        const r = await chain.send("fund the passkey anchor", acc.operator.account, { to: MERA_ANCHOR, value: MERA_FUND - have });
        await log.emit({ scene: 0, step: "0.fund-mera", kind: "fund", label: "fund the passkey anchor with MON for gas", tx: r, data: { token: "MON", to: MERA_ANCHOR } });
      });
      await step(ctx, "0.anchor-set", async () => {
        const cfg = { ...setConfig(acc.anchors.map((x) => x.account.address), opAddr), name: "ancre-mera" };
        const { setId, set } = await printSet(name, cfg);
        const pol = set.policy as Record<string, string | number | boolean | string[]>;
        const params = {
          anchors: set.anchors.map((x) => getAddress(x)), lambdas: set.lambdas.map(BigInt), alphaN: set.alphaN, alphaD: set.alphaD,
          tagSchemaHash: set.tagSchemaHash, tags: set.tags.map((t) => ({ tag: t.tag, min: BigInt(t.min), neutral: BigInt(t.neutral), max: BigInt(t.max), kind: t.kind })),
          policy: { ...pol, theta: BigInt(pol.theta as string), maxAge: BigInt(pol.maxAge as number), minRefresh: BigInt(pol.minRefresh as number),
            slackRefresh: BigInt(pol.slackRefresh as number), eLowMax: BigInt(pol.eLowMax as string), submitters: (pol.submitters as string[]).map((x) => getAddress(x)) },
        };
        const onchain = await chain.pub.readContract({ address: OFFICIAL.ancre, abi: ancreArt.abi, functionName: "computeSetId", args: [params] });
        if (onchain !== setId) throw new Error(`setId mismatch: contract ${String(onchain)} vs certifier ${setId}`);
        const r = await chain.send("registerAnchorSet (mera)", acc.operator.account, { abi: ancreArt.abi, to: OFFICIAL.ancre, functionName: "registerAnchorSet", args: [params] });
        st.setId = setId;
        st.set = set;
        await log.emit({ scene: 0, step: "0.anchor-set", kind: "anchor-set", label: "register the mera set (anchor-A, anchor-B, passkey anchor; m = 2)", tx: r, data: { setId } });
      });
      log.ancre = { address: OFFICIAL.ancre, abi: ancreArt.abi, setId: st.setId!, theta: SET.theta };
      await certifyStep(ctx, 0, "0.cert", "mera set: first certificate");
      await step(ctx, "0.deploy-payer", async () => {
        const r = await chain.send("deploy TrustGatedPayer (mera)", acc.operator.account, { deploy: encodeDeployData({ ...payerArt, args: [TESTNET.usdc, zeroAddress,
          zeroAddress, OFFICIAL.ancre, ROLES.owner, ROLES.treasury, opAddr, st.setId!, PAY_AMOUNT] }) });
        st.payer = getAddress(r.receipt.contractAddress!);
        await log.emit({ scene: 0, step: "0.deploy-payer", kind: "deploy", label: "deploy TrustGatedPayer on the mera set (owner = Hugo's wallet)", tx: r, data: { contract: "payer", address: st.payer } });
      });
      await step(ctx, "0.fund-payer", async () => {
        const r = await chain.send("fund payer (mera)", acc.operator.account, { to: TESTNET.usdc, abi: usdcAbi, functionName: "transfer", args: [st.payer!, DEPOSIT] });
        await log.emit({ scene: 0, step: "0.fund-payer", kind: "fund", label: "deposit 0.03 USDC in the mera payer", tx: r, data: { token: "USDC", to: st.payer } });
      });
      const x = await assess(ctx, agent(ctx, PROVIDER));
      const p1 = await payViaPayer(ctx, 0, "0.pay:p1", PROVIDER, "PAID");
      return [check("provider-1 trusted under the mera set", true, x.trusted), check("provider-1 paid", "PAID", p1.decision)];
    });
    if (rehearse) { // the browser's slash, emulated: impersonate the passkey anchor
      await chain.impersonate(MERA_ANCHOR);
      const data = encodeFunctionData({ abi: reputationAbi, functionName: "giveFeedback", args: [id(agent(ctx, PROVIDER)), VALUES.slash, 0, "slash", TAG2, "", "", zeroHash] });
      const hash = await chain.rawRequest<`0x${string}`>("eth_sendTransaction", [{ from: MERA_ANCHOR, to: TESTNET.reputation, data, gas: toHex(400_000n) }]);
      const rc = await chain.pub.waitForTransactionReceipt({ hash });
      console.log(`rehearsal: passkey anchor slash emulated in block ${rc.blockNumber} (${rc.status})`);
    } else {
      console.log(`\nNEXT: on https://ancre-xyz.netlify.app/mera/ derive epoch 0, then "Slash provider-1" (Mera signs). Then: node mera.ts after --keystore ${args.values.keystore}`);
    }
  }

  if (cmd === "after" || rehearse) {
    await scene(ctx, 1, "breaker: the passkey anchor slashed provider-1, the mera payer refuses the next payment", async () => {
      // the slash: the passkey anchor's latest NewFeedback on provider-1 with tag "slash"
      // eth_getLogs is capped at 100 blocks per call on the testnet RPC: walk back from the head, 100 at a time
      const head = await chain.pub.getBlockNumber();
      type Log = Awaited<ReturnType<typeof chain.pub.getContractEvents>>[number];
      let slash: Log | undefined;
      for (let to = head; to > head - 20_000n && !slash; to -= 100n) {
        const logs = await chain.pub.getContractEvents({ address: TESTNET.reputation, abi: reputationAbi, eventName: "NewFeedback",
          args: { agentId: id(agent(ctx, PROVIDER)), clientAddress: MERA_ANCHOR }, fromBlock: to - 99n, toBlock: to });
        slash = logs.filter((l) => (l.args as { tag1?: string }).tag1 === "slash").at(-1);
      }
      if (!slash) throw new Error("no slash from the passkey anchor on provider-1 in the last 20 000 blocks");
      const refused = await payViaPayer(ctx, 1, "1.pay:p1-after-slash", PROVIDER, "REFUSED");
      const x = await assess(ctx, agent(ctx, PROVIDER));
      const lat = { slashBlock: Number(slash.blockNumber), slashTx: slash.transactionHash, refusedAt: refused.block, blocks: refused.block - Number(slash.blockNumber) };
      st.notes.meraBreaker = lat;
      saveState(name, st);
      console.log(`passkey anchor slash in block ${lat.slashBlock} (${lat.slashTx}) -> payment refused at block ${lat.refusedAt}: ${lat.blocks} block(s) later`);
      return [check("refused after the passkey anchor's slash", "ANCRE_STATUS", refused.reason), check("status VETOED", 4, Number(x.status))];
    });
  }

  const after = await chain.pub.getBalance({ address: opAddr });
  console.log(`\noperator ${opAddr}: spent ${Number(formatEther(before - after)).toFixed(4)} MON\nstate ${statePath(name)}: set ${st.setId}, payer ${st.payer}`);
  if (anvil) await anvil.stop();
}

main().catch((e) => { console.error(`\n✗ ${(e as Error).message}`); process.exitCode = 1; }).finally(() => process.exit());

// Minimal act 2 on Monad MAINNET 143 (D40, D59): ANCRE and the payer deployed, the demo anchor set, ONE provider
// "demo" vouched for by 2 anchors and paid by the real x402 facilitator, the refusal to pay Eve-8004 (agent #182,
// the real farm of the registry), and the breaker (an anchor slashes the provider, refused at the next payment).
// No scripted farm: the real one is enough. Same building blocks as the testnet act (scenes.ts), fewer accounts.
//
//   node run.ts --rehearse-mainnet [--keystore <ks>] [--sweep]   fork of mainnet, facilitator emulated, nothing sent
//   node run.ts --network mainnet --keystore <ks> --sweep         REAL mainnet: Hugo only, typed confirmation
//
// The payer has three distinct addresses (D59): owner = Hugo's own wallet (MAINNET_OWNER, required), treasury
// 0x0146…05B9, operator = the ancre-demo keystore. The operator signs payments and nothing else: it can neither
// sweep the payer nor lift a pause; only the human owner can (D47).
import { rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { type Address, createPublicClient, encodeDeployData, formatEther, formatUnits, getAddress, http, isAddress, keccak256, toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { identityAbi, usdcAbi } from "./abi.ts";
import { type Actor, askPassword, decryptKeystore, demoAccounts, FORK_SEED } from "./accounts.ts";
import { type Anvil, startAnvil } from "./anvil.ts";
import { budgetReport } from "./budget.ts";
import { artifact, Chain } from "./chain.ts";
import { FORK_PORT, MAINNET, OUT, PAY_AMOUNT, SET, useNetwork, VALUES } from "./config.ts";
import { EventLog } from "./events.ts";
import {
  ancre, ancreArt, assess, agent, certifyStep, type Check, check, type Ctx, dealUsdc, feedback, id, payViaPayer,
  registerAgent, scene, step, usdcBalance,
} from "./scenes.ts";
import { loadState, saveState, type State, statePath } from "./state.ts";
import { sweep } from "./sweep.ts";
import { EmulatedFacilitator, HttpFacilitator } from "./x402.ts";
import { printSet, setConfig } from "./certify.ts";

const payerArt = artifact("TrustGatedPayer");

/** The two fixed roles of D59. The owner comes from MAINNET_OWNER (Hugo's MetaMask), never from a file. */
export const ROLES = {
  treasury: getAddress("0x0146082951DE0C4d09fca1e1277ACa8963a305B9"),
  operator: getAddress("0x810724967b0d895d087b991304385720d4903c3F"), // ~/.foundry/keystores/ancre-demo
} as const;

export const EVE = { label: "Eve-8004 (agent #182, real farm)", agentId: 182n };
/** Explorer column of Eve, not re-read: `readAllFeedback(182)` reverts in an eth_call on rpc.monad.xyz (MEASURED
 * 10/10, too many feedbacks). Numbers of the on-chain snapshot of 21/09 (CLAUDE.md §3: 7 665 of the 9 188 feedbacks
 * of the registry, from the Spawn-8004 agents created on 16-17/02/2026). */
const EVE_EXPLORER = { feedbackCount: 7665, revokedCount: 0, clientCount: -1, naiveAverage: null,
  source: "on-chain snapshot of 2026-09-21 (readAllFeedback; CLAUDE.md §3), not re-read: readAllFeedback(182) reverts in eth_call (10/10)" };

export const PROVIDER = "provider-1 (demo)";
export const MAINNET_DEPOSIT = 30_000n; // 0.03 USDC in the payer: one paid payment of 0.01, plus margin for a retry
export const PLANNED_MON = 4n * 10n ** 18n; // what Hugo sends to the operator (D59)
export const PLANNED_USDC = 1_000_000n; // about 1 USDC (D59)
const GWEI = 10n ** 9n;
export const MEASURED_GAS_PRICE = 102n * GWEI; // cast gas-price --rpc-url https://rpc.monad.xyz, MEASURED 10/10 (D59)
const MAINNET_BASE_FEE = 100n * GWEI; // cast base-fee on a fork of mainnet block 112 172 900, MEASURED 10/10
const FEE_MARGIN_BPS = 13_000n; // +30 % over the measured limits (gas price drift, one replayed step)

/** Gas limit billed per planned transaction (Monad bills the LIMIT): MEASURED-FORK, rehearsal on a fork of mainnet
 * block 112 174 484 (10/10, demo/BUDGET.md §7), rounded up to the next thousand; the run itself sets
 * estimate x 1.10 + 5 000. Used only for the budget shown (and checked) before anything is sent. */
export const PLAN: { step: string; what: string; from: "operator" | "anchor-A" | "anchor-B"; gas: number }[] = [
  { step: "0.fund-mon", what: "MON to anchor-A and anchor-B (gas only)", from: "operator", gas: 2 * 28_100 },
  { step: "0.deploy-ancre", what: "deploy AnchoredReputation", from: "operator", gas: 9_395_000 },
  { step: "0.anchor-set", what: "registerAnchorSet (3 anchors, m = 2)", from: "operator", gas: 553_000 },
  { step: `0.register:${PROVIDER}`, what: "register provider-1 (demo)", from: "operator", gas: 393_000 },
  { step: `0.wallet:${PROVIDER}`, what: "setAgentWallet provider-1", from: "operator", gas: 97_000 },
  { step: "0.deploy-payer", what: "deploy TrustGatedPayer (3 roles)", from: "operator", gas: 2_409_000 },
  { step: "0.fund-payer", what: "USDC deposit in the payer", from: "operator", gas: 116_000 },
  { step: "1.vouch:A->p1", what: "anchor-A vouches", from: "anchor-A", gas: 327_000 },
  { step: "1.vouch:B->p1", what: "anchor-B vouches", from: "anchor-B", gas: 308_000 },
  { step: "1.cert", what: "submitCertificate", from: "operator", gas: 664_000 },
  { step: "4.slash", what: "anchor-B slashes provider-1", from: "anchor-B", gas: 223_000 },
  { step: "4.cert", what: "submitCertificate (veto)", from: "operator", gas: 349_000 },
  { step: "sweep", what: "--sweep: 2 MON returns + operator's USDC rest to the treasury", from: "operator", gas: 2 * 21_000 + 116_000 },
];

const mon = (wei: bigint) => Number(formatEther(wei)).toFixed(4);
const usdc = (x: bigint) => formatUnits(x, 6);

/** MAINNET_OWNER: required, a checksummable address, distinct from the operator and the treasury (D59). */
export function ownerFromEnv(operator: Address): Address {
  const raw = process.env.MAINNET_OWNER?.trim();
  if (!raw) throw new Error("MAINNET_OWNER is not set: export MAINNET_OWNER=0x<Hugo's MetaMask address> (the payer's owner, D59)");
  if (!isAddress(raw, { strict: false })) throw new Error(`MAINNET_OWNER=${raw} is not an address`);
  const owner = getAddress(raw);
  if (owner === zeroAddress) throw new Error("MAINNET_OWNER is the zero address");
  if (owner === operator) throw new Error("MAINNET_OWNER = the operator: the three roles must differ (D59)");
  if (owner === ROLES.treasury) throw new Error("MAINNET_OWNER = the treasury: the three roles must differ (D59)");
  if (operator === ROLES.treasury) throw new Error("operator = treasury (OperatorIsTreasury, R8)");
  return owner;
}

/** Remaining fees and capital for the steps not done yet, at max(live gas price, 102 gwei), +30 %. */
export function estimate(state: State | undefined, gasPrice: bigint, capital: bigint) {
  const price = gasPrice > MEASURED_GAS_PRICE ? gasPrice : MEASURED_GAS_PRICE;
  const todo = PLAN.filter((p) => !state?.done[p.step]);
  const sum = (xs: typeof todo) => BigInt(xs.reduce((a, p) => a + p.gas, 0));
  const gas = sum(todo);
  const fees = (gas * price * FEE_MARGIN_BPS) / 10_000n; // all fees, anchors' included
  const lent = state?.done["0.fund-mon"] ? 0n : capital;
  // the operator pays its own fees and lends the anchors theirs (1.5 x their limits; the rest is swept back)
  const operatorNeeds = (sum(todo.filter((p) => p.from === "operator")) * price * FEE_MARGIN_BPS) / 10_000n + lent;
  const usdcNeeds = state?.done["0.fund-payer"] ? 0n : MAINNET_DEPOSIT;
  return { price, todo, gas, fees, lent, operatorNeeds, usdcNeeds };
}

function printEstimate(e: ReturnType<typeof estimate>, bal: bigint, ub: bigint) {
  console.log(`\nbudget of the remaining steps (gas limits MEASURED-FORK, at ${Number(e.price / 10n ** 7n) / 100} gwei, +30 %):`);
  for (const p of e.todo) console.log(`  ${p.step.padEnd(32)} ${p.what.padEnd(46)} ${String(p.gas).padStart(10)} gas  ${mon(BigInt(p.gas) * e.price)} MON`);
  console.log(`  fees ${mon(e.fees)} MON (with margin), capital lent to the anchors ${mon(e.lent)} MON (swept back by --sweep)`);
  console.log(`  operator needs ${mon(e.operatorNeeds)} MON and ${usdc(e.usdcNeeds)} USDC; holds ${mon(bal)} MON and ${usdc(ub)} USDC`);
}

/** Keystore of the operator: its key is the seed of the demo accounts (anchors, provider wallet), as on the testnet. */
async function unlock(path: string) {
  const password = await askPassword("keystore password: ");
  const seed = decryptKeystore(path, password);
  return { seed, password, address: privateKeyToAccount(seed).address };
}

async function confirm(phrase: string, prompt: string) {
  if (!process.stdin.isTTY) throw new Error("the mainnet run needs an interactive terminal (typed confirmation)");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${prompt} Type "${phrase}": `);
  rl.close();
  if (ans.trim() !== phrase) throw new Error("not confirmed: nothing sent");
}

// ---------------------------------------------------------------- scenes (ids 0, 1, 2, 4 = those of the screen)

async function mScene0(ctx: Ctx, owner: Address) {
  const { chain, acc } = ctx;
  const op = acc.operator;
  await scene(ctx, 0, "setup: ANCRE, anchor set, one provider (demo), payer with three distinct roles", async () => {
    await step(ctx, "0.fund-mon", async () => {
      for (const [label, target] of Object.entries(ctx.monBudget)) {
        const actor = [...acc.anchors].find((x) => x.label === label)!;
        const have = await chain.pub.getBalance({ address: actor.account.address });
        if (have >= target) continue;
        const r = await chain.send(`fund ${label}`, op.account, { to: actor.account.address, value: target - have });
        await ctx.log.emit({ scene: 0, step: `0.fund-mon:${label}`, kind: "fund", label: `fund ${label} with MON for gas`, tx: r,
          data: { token: "MON", to: actor.account.address, amount: (target - have).toString() } });
      }
    });
    await step(ctx, "0.deploy-ancre", async () => {
      for (const reg of [MAINNET.identity, MAINNET.reputation]) {
        const v = await chain.pub.readContract({ address: reg, abi: identityAbi, functionName: "getVersion" });
        if (v !== "2.0.0") throw new Error(`registry ${reg} is ${v}, not 2.0.0`);
      }
      const r = await chain.send("deploy AnchoredReputation", op.account, {
        deploy: encodeDeployData({ ...ancreArt, args: [MAINNET.identity, MAINNET.reputation] }) });
      ctx.state.ancre = getAddress(r.receipt.contractAddress!);
      await ctx.log.emit({ scene: 0, step: "0.deploy-ancre", kind: "deploy", label: "deploy AnchoredReputation", tx: r, data: { contract: "ancre", address: ctx.state.ancre } });
    });
    await registerSet(ctx);
    ctx.log.ancre = { address: ctx.state.ancre!, abi: ancreArt.abi, setId: ctx.state.setId!, theta: SET.theta };
    await registerAgent(ctx, 0, PROVIDER, op, acc.providers[0], "provider");
    await step(ctx, "0.deploy-payer", async () => {
      const r = await chain.send("deploy TrustGatedPayer", op.account, { deploy: encodeDeployData({ ...payerArt, args: [MAINNET.usdc, zeroAddress,
        zeroAddress, ctx.state.ancre!, owner, ROLES.treasury, op.account.address, ctx.state.setId!, PAY_AMOUNT] }) });
      ctx.state.payer = getAddress(r.receipt.contractAddress!);
      await ctx.log.emit({ scene: 0, step: "0.deploy-payer", kind: "deploy", tx: r, data: { contract: "payer", address: ctx.state.payer, owner, treasury: ROLES.treasury, operator: op.account.address },
        label: "deploy TrustGatedPayer (owner = Hugo's wallet, treasury, operator = ancre-demo: three distinct addresses; exact only)" });
    });
    await step(ctx, "0.fund-payer", async () => {
      const r = await chain.send("fund payer", op.account, { to: MAINNET.usdc, abi: usdcAbi, functionName: "transfer", args: [ctx.state.payer!, MAINNET_DEPOSIT] });
      await ctx.log.emit({ scene: 0, step: "0.fund-payer", kind: "fund", label: `deposit ${usdc(MAINNET_DEPOSIT)} USDC in the payer`, tx: r,
        data: { token: "USDC", to: ctx.state.payer, amount: MAINNET_DEPOSIT.toString() } });
    });
    return roleChecks(ctx, owner);
  });
}

async function registerSet(ctx: Ctx) {
  await step(ctx, "0.anchor-set", async () => {
    const cfg = setConfig(ctx.acc.anchors.map((x) => x.account.address), ctx.acc.operator.account.address);
    const { setId, set } = await printSet(ctx.name, cfg);
    const pol = set.policy as Record<string, string | number | boolean | string[]>;
    const params = {
      anchors: set.anchors.map((x) => getAddress(x)), lambdas: set.lambdas.map(BigInt), alphaN: set.alphaN, alphaD: set.alphaD,
      tagSchemaHash: set.tagSchemaHash, tags: set.tags.map((t) => ({ tag: t.tag, min: BigInt(t.min), neutral: BigInt(t.neutral), max: BigInt(t.max), kind: t.kind })),
      policy: { ...pol, theta: BigInt(pol.theta as string), maxAge: BigInt(pol.maxAge as number), minRefresh: BigInt(pol.minRefresh as number),
        slackRefresh: BigInt(pol.slackRefresh as number), eLowMax: BigInt(pol.eLowMax as string), submitters: (pol.submitters as string[]).map((x) => getAddress(x)) },
    };
    const onchain = await ctx.chain.pub.readContract({ ...ancre(ctx), functionName: "computeSetId", args: [params] });
    if (onchain !== setId) throw new Error(`setId mismatch: contract ${String(onchain)} vs certifier ${setId}`);
    const r = await ctx.chain.send("registerAnchorSet", ctx.acc.operator.account, { ...ancre(ctx), to: ctx.state.ancre, functionName: "registerAnchorSet", args: [params] });
    ctx.state.setId = setId;
    ctx.state.set = set;
    await ctx.log.emit({ scene: 0, step: "0.anchor-set", kind: "anchor-set", label: "register the demo anchor set (3 anchors, m = 2)", tx: r, data: { setId } });
  });
}

/** The payer's roles, read on-chain, and D47 by simulation (eth_call, nothing sent): the operator, i.e. the agent's
 * key, can neither sweep the funds nor lift a pause; the human owner can. */
async function roleChecks(ctx: Ctx, owner: Address): Promise<Check[]> {
  const p = { address: ctx.state.payer!, abi: payerArt.abi };
  const op = ctx.acc.operator.account.address;
  const r = (functionName: string, args: unknown[] = []) => ctx.chain.pub.readContract({ ...p, functionName, args });
  const sim = async (from: Address, functionName: string, args: unknown[]) => {
    try { await ctx.chain.pub.simulateContract({ ...p, account: from, functionName, args }); return "ok"; } catch { return "reverts"; }
  };
  const [o, t, isOp, ownerIsOp, setId, max, opSweep, ownerSweep, opUnpause, ownerUnpause] = await Promise.all([
    r("owner"), r("treasury"), r("isOperator", [op]), r("isOperator", [owner]), r("setId"), r("maxPerPayment"),
    sim(op, "sweep", [MAINNET.usdc, 1n]), sim(owner, "sweep", [MAINNET.usdc, 1n]),
    sim(op, "setPaused", [false]), sim(owner, "setPaused", [false]),
  ]);
  return [
    check("payer owner = MAINNET_OWNER", owner, o),
    check("payer treasury = 0x0146…05B9", ROLES.treasury, t),
    check("operator (ancre-demo) is a payer operator", true, isOp),
    check("owner is not an operator", false, ownerIsOp),
    check("payer setId = the registered set", ctx.state.setId, setId),
    check("maxPerPayment = 0.01 USDC", PAY_AMOUNT, max),
    check("D47: the operator cannot sweep the payer (eth_call)", "reverts", opSweep),
    check("D47: the owner can sweep it to the treasury (eth_call)", "ok", ownerSweep),
    check("D47: the operator cannot lift a pause (eth_call)", "reverts", opUnpause),
    check("the owner can (eth_call)", "ok", ownerUnpause),
  ];
}

async function mScene1(ctx: Ctx) {
  const [A, B] = ctx.acc.anchors;
  await scene(ctx, 1, "an honest provider (demo), vouched for by 2 anchors, is paid by the real x402 facilitator", async () => {
    await feedback(ctx, 1, "1.vouch:A->p1", A, PROVIDER, VALUES.anchorVouch[0], "vouch");
    await feedback(ctx, 1, "1.vouch:B->p1", B, PROVIDER, VALUES.anchorVouch[1], "vouch");
    await certifyStep(ctx, 1, "1.cert", "anchors vouched for the provider");
    const p1 = await payViaPayer(ctx, 1, "1.pay:p1", PROVIDER, "PAID");
    const x = await assess(ctx, agent(ctx, PROVIDER));
    return [
      check("provider-1 trusted (2 anchors, leave-one-out m = 2)", true, x.trusted),
      check("provider-1 robust mass above theta", true, x.trustLow >= SET.theta),
      check("provider-1 paid", "PAID", p1.decision),
      check("provider-1 received 0.01 USDC", PAY_AMOUNT, p1.providerReceived),
    ];
  });
}

async function mScene2(ctx: Ctx) {
  await scene(ctx, 2, "the real farm: the payer refuses to pay Eve-8004 (#182)", async () => {
    const e = agent(ctx, EVE.label);
    await step(ctx, "2.eve-facts", async () => {
      await ctx.log.emit({ scene: 2, step: "2.eve-facts", kind: "assess", agentId: EVE.agentId,
        label: `Eve-8004 (#182): owner ${e.owner}, agentWallet ${e.wallet} (on-chain facts, read now); ~7 665 feedbacks (snapshot 21/09)`,
        data: { owner: e.owner, wallet: e.wallet, explorer: EVE_EXPLORER } });
    });
    const x = await assess(ctx, e);
    const r = await payViaPayer(ctx, 2, "2.pay:eve", EVE.label, "REFUSED");
    return [
      check("Eve's status is OK (an unknown agent, AM-6.1)", 0, Number(x.status)),
      check("Eve's robust mass", 0n, x.trustLow),
      check("Eve not trusted", false, x.trusted),
      check("payment refused by the contract", "UNTRUSTED", r.reason),
      check("refused at /verify: nothing broadcast", "verify", r.stage),
      check("Eve received nothing", 0n, r.providerReceived),
    ];
  });
}

async function mScene4(ctx: Ctx) {
  const B = ctx.acc.anchors[1];
  await scene(ctx, 4, "breaker: an anchor slashes the provider, refused at the very next payment", async () => {
    const slash = await feedback(ctx, 4, "4.slash", B, PROVIDER, VALUES.slash, "slash", `${B.label} slashes provider-1 (${VALUES.slash})`);
    const refused = await payViaPayer(ctx, 4, "4.pay:p1-after-slash", PROVIDER, "REFUSED");
    const cert = await certifyStep(ctx, 4, "4.cert", "an anchor slashed provider-1");
    const refused2 = await payViaPayer(ctx, 4, "4.pay:p1-after-cert", PROVIDER, "REFUSED");
    const lat = {
      from: { step: "4.slash", block: slash.block, wallMs: slash.wallMs },
      to: { step: "4.pay:p1-after-slash", block: refused.block, wallMs: refused.wallMs },
      blocks: refused.block - slash.block, ms: refused.wallMs - slash.wallMs,
      parts: [
        { name: "slash -> refused payment (live veto, no certificate needed)", blocks: refused.block - slash.block, ms: refused.wallMs - slash.wallMs },
        ...(cert.block ? [{ name: "slash -> certificate carrying the veto", blocks: cert.block - slash.block, ms: null }] : []),
      ],
      measured: ctx.chain.mode,
    };
    ctx.state.notes.breakerLatency = lat;
    await ctx.log.emit({ scene: 4, step: "4.latency", kind: "assess", agentId: id(agent(ctx, PROVIDER)), label: `breaker latency: ${lat.blocks} block(s), ${lat.ms} ms (${ctx.chain.mode})`, latency: lat });
    const x = await assess(ctx, agent(ctx, PROVIDER));
    return [
      check("refused right after the slash", "ANCRE_STATUS", refused.reason),
      check("still refused after recertification", "REFUSED", refused2.decision),
      check("status VETOED", 4, Number(x.status)),
    ];
  });
}

// ---------------------------------------------------------------- entry point (from run.ts)

export async function mainnetMain(args: { network?: string; keystore?: string; rpc?: string; port?: string; "fork-block"?: string;
  sweep?: boolean; "sweep-only"?: boolean; resume?: boolean; "rehearse-mainnet"?: boolean; scenes?: string }) {
  useNetwork("mainnet");
  const real = args.network === "mainnet";
  const name = real ? "mainnet" : "rehearsal-mainnet";
  if (real && args["rehearse-mainnet"]) throw new Error("--network mainnet and --rehearse-mainnet are exclusive");
  if (real && !args.keystore) throw new Error("--keystore <path> is required on the mainnet (~/.foundry/keystores/ancre-demo)");

  // 1. roles first: nothing is read, unlocked or sent without MAINNET_OWNER. A rehearsal with a keystore unlocks it
  // now (no confirmation: nothing real is sent); the real run asks the password only after the typed confirmation.
  if (!process.env.MAINNET_OWNER?.trim()) ownerFromEnv(ROLES.operator); // throws the explicit message
  let unlocked = !real && args.keystore ? await unlock(args.keystore) : undefined;
  if (unlocked && unlocked.address !== ROLES.operator) {
    console.warn(`warning: keystore ${args.keystore} is ${unlocked.address}, not the operator ${ROLES.operator}: fine for a rehearsal, the real run refuses it`);
  }
  const expectedOperator = real ? ROLES.operator : unlocked?.address ?? demoAccounts(FORK_SEED, false).operator.account.address;
  const owner = ownerFromEnv(expectedOperator);

  // 2. the chain: the real one (chainId 143 checked), or a fork of it with interval mining (Monad reserve waits)
  let anvil: Anvil | undefined;
  let rpc = args.rpc ?? (real ? MAINNET.rpc : undefined);
  let forkBlock: number | undefined;
  if (!real && !rpc) {
    if (!args.resume) {
      rmSync(statePath(name), { force: true });
      rmSync(join(OUT, name), { recursive: true, force: true });
    }
    // rpc1 accepts the whole history but can lag the head by a block or two: pin the fork 20 blocks back
    forkBlock = args["fork-block"] ? Number(args["fork-block"])
      : Number(await createPublicClient({ transport: http(MAINNET.archiveRpc) }).getBlockNumber()) - 20;
    anvil = await startAnvil({ port: Number(args.port ?? FORK_PORT + 2), forkBlock, blockTime: 1 });
    rpc = anvil.rpc;
  }
  const chain = new Chain(rpc!, real ? "mainnet" : "fork", MAINNET.chainId, true);
  const chainId = await chain.pub.getChainId();
  if (chainId !== 143) throw new Error(`chain ${chainId} is not Monad mainnet 143`);
  // a rehearsal never talks to a real node (a --rpc to the real chain would send for real, unconfirmed)
  const client = String(await chain.rawRequest<string>("web3_clientVersion", []));
  const isAnvil = client.toLowerCase().startsWith("anvil");
  if (!real && !isAnvil) throw new Error(`--rehearse-mainnet needs a local anvil fork, ${chain.rpc} is "${client}"`);
  if (real && isAnvil) throw new Error(`--network mainnet points at an anvil (${chain.rpc}): use --rehearse-mainnet`);
  // the fork bills like Monad (gas limit), but anvil lets the base fee decay on empty blocks: pin it to the
  // mainnet's 100 gwei (cast base-fee, MEASURED 10/10) so that the rehearsal pays the real bill
  const pinFee = () => chain.rawRequest("anvil_setNextBlockBaseFeePerGas", [toHex(MAINNET_BASE_FEE)]);
  if (!real) await pinFee();
  const pin = real ? undefined : setInterval(() => { pinFee().catch(() => {}); }, 200).unref();

  // 3. on a fork: the operator holds what Hugo will send (4 MON, 1 USDC), unless the fork already shows his funding
  if (!real) {
    const b = await chain.pub.getBalance({ address: expectedOperator });
    if (b === 0n) await chain.setBalance(expectedOperator, PLANNED_MON);
    if ((await chain.pub.readContract({ address: MAINNET.usdc, abi: usdcAbi, functionName: "balanceOf", args: [expectedOperator] })) === 0n) {
      await dealUsdc(chain, expectedOperator, PLANNED_USDC);
    }
  }

  // 4. budget before anything is unlocked or sent
  let state = loadState(name);
  if (state && state.operator !== expectedOperator) state = undefined;
  if (state?.ancre && !(await chain.pub.getCode({ address: state.ancre }))) {
    if (real) throw new Error(`out/state-${name}.json names an ANCRE (${state.ancre}) with no code on chain 143: check it, then move the file away`);
    state = undefined;
  }
  const gasPrice = await chain.pub.getGasPrice();
  const unitWei = (gas: number) => (BigInt(Math.ceil(gas * 1.5)) * (gasPrice > MEASURED_GAS_PRICE ? gasPrice : MEASURED_GAS_PRICE));
  const FB = 340_000;
  const capital = unitWei(FB) + unitWei(2 * FB);
  const est = estimate(state, gasPrice, capital);
  const [bal, ub] = await Promise.all([chain.pub.getBalance({ address: expectedOperator }),
    chain.pub.readContract({ address: MAINNET.usdc, abi: usdcAbi, functionName: "balanceOf", args: [expectedOperator] })]);
  console.log(`\n${real ? "REAL MONAD MAINNET (143)" : `rehearsal on a fork of Monad mainnet (143), block ${forkBlock ?? "?"}`}: ${chain.rpc}`);
  console.log(`payer roles: owner ${owner} (MAINNET_OWNER), treasury ${ROLES.treasury}, operator ${expectedOperator}`);
  printEstimate(est, bal, ub);
  if (!args["sweep-only"]) {
    if (bal < est.operatorNeeds) throw new Error(`operator balance ${mon(bal)} MON < ${mon(est.operatorNeeds)} MON needed: fund ${expectedOperator} first`);
    if (ub < est.usdcNeeds) throw new Error(`operator USDC ${usdc(ub)} < ${usdc(est.usdcNeeds)} needed: send USDC to ${expectedOperator} first`);
  }

  // 5. confirmation (real run only), then the keystore
  if (real) {
    await confirm("send real Monad mainnet transactions", `About to send REAL Monad MAINNET transactions from ${ROLES.operator} (fees above).`);
    unlocked = await unlock(args.keystore!);
    if (unlocked.address !== ROLES.operator) throw new Error(`keystore ${args.keystore} is ${unlocked.address}, not the operator ${ROLES.operator} (D59)`);
  }
  const seed = unlocked?.seed ?? FORK_SEED;
  const passwordEnv = unlocked ? { ANCRE_DEMO_PASSWORD: unlocked.password } : undefined;
  let signer = unlocked ? `keystore:${args.keystore}:ANCRE_DEMO_PASSWORD:${unlocked.address}` : undefined;
  const acc = demoAccounts(seed, !!unlocked);
  acc.operator.label = "ANCRE operator (ancre-demo)";
  acc.payerOperator = acc.operator; // D59: the payer's operator is the ancre-demo key itself
  if (!args.keystore) await chain.impersonate(acc.operator.account.address); // certifier: cast --unlocked on the fork
  signer ??= `unlocked:${acc.operator.account.address}`;
  const derived = [acc.operator, ...acc.anchors, acc.providers[0]].map((a) => a.account.address);
  if (derived.includes(owner) || derived.includes(ROLES.treasury)) throw new Error("owner or treasury collides with a demo account");
  const emitters: Actor[] = [acc.operator, acc.anchors[0], acc.anchors[1]];

  // 6. state, event log, Eve's on-chain facts
  const head = await chain.block();
  state ??= { version: 1, mode: name, chainId: 143, operator: acc.operator.account.address, runId: EventLog.newRunId(),
    agents: {}, done: {}, notes: {} } as State;
  saveState(name, state);
  const st = state;
  const [eveOwner, eveWallet] = await Promise.all([
    chain.pub.readContract({ address: MAINNET.identity, abi: identityAbi, functionName: "ownerOf", args: [EVE.agentId] }),
    chain.pub.readContract({ address: MAINNET.identity, abi: identityAbi, functionName: "getAgentWallet", args: [EVE.agentId] }),
  ]);
  const external = { [EVE.label]: { agentId: EVE.agentId.toString(), owner: getAddress(eveOwner), wallet: getAddress(eveWallet), role: "farm-real" } };
  const log = new EventLog(chain, st.runId, {
    network: { chainId: 143, mode: name, forkBlock: forkBlock ?? null, rpc: real ? chain.rpc : "local" },
  });
  log.explorerStatic.set(EVE.agentId.toString(), EVE_EXPLORER);
  const header = () => log.setHeader({
    contracts: { identity: MAINNET.identity, reputation: MAINNET.reputation, ancre: st.ancre ?? null, payer: st.payer ?? null, usdc: MAINNET.usdc },
    payerRoles: { owner, treasury: ROLES.treasury, operator: acc.operator.account.address },
    set: st.set ? {
      setId: st.setId, anchors: acc.anchors.map((a) => ({ address: a.account.address, label: a.label })),
      minAnchors: SET.minAnchors, vetoQuorum: SET.vetoQuorum, theta: SET.theta.toString(), thetaPct: Number(SET.theta) / 1e16,
      level: "Registry-verified, attested submitter", submitter: acc.operator.account.address, maxAge: SET.maxAge, minRefresh: SET.minRefresh,
      tags: (st.set.tags as { tag: string; min: string; neutral: string; max: string; kind: number }[]).map((t) => ({
        tag: t.tag, hash: keccak256(toHex(t.tag)), kind: t.kind === 0 ? "endorsement" : "measurement", min: t.min, neutral: t.neutral, max: t.max })),
    } : null,
    actors: [
      { label: "ANCRE operator (ancre-demo: deployer, certifier, payer operator)", role: "operator", address: acc.operator.account.address },
      { label: "payer owner (Hugo's wallet)", role: "payer-owner", address: owner },
      { label: "payer treasury", role: "treasury", address: ROLES.treasury },
      ...acc.anchors.map((a) => ({ label: a.label, role: "anchor", address: a.account.address })),
      ...Object.entries(st.agents).map(([label, a]) => ({ label, role: a.role, agentId: a.agentId, owner: a.owner, wallet: a.wallet })),
      { label: EVE.label, role: "farm-real", agentId: "182", owner: external[EVE.label].owner, wallet: external[EVE.label].wallet },
    ],
  });
  header();
  if (st.ancre && st.setId) log.ancre = { address: st.ancre, abi: ancreArt.abi, setId: st.setId, theta: SET.theta };

  const monBudget = { [acc.anchors[0].label]: unitWei(FB), [acc.anchors[1].label]: unitWei(2 * FB) };
  const ctx: Ctx = {
    chain, name, acc, state: st, log, signer: signer!, passwordEnv, monBudget, facilitatorTxs: [], external,
    fac: real ? new HttpFacilitator(chain, MAINNET.facilitatorUrl) : new EmulatedFacilitator(chain, MAINNET.usdc),
  };
  const before = { mon: await chain.pub.getBalance({ address: acc.operator.account.address }), usdc: await usdcBalance(ctx, acc.operator.account.address) };
  if (args["sweep-only"]) {
    await sweepAll(ctx, emitters);
    if (pin) clearInterval(pin);
    if (anvil) await anvil.stop();
    return;
  }
  const all: Record<string, () => Promise<void>> = { 0: () => mScene0(ctx, owner), 1: () => mScene1(ctx), 2: () => mScene2(ctx), 4: () => mScene4(ctx) };
  const order = (args.scenes ?? "0,1,2,4").split(",").map((s) => s.trim());
  for (const s of order) if (!all[s]) throw new Error(`--scenes: mainnet scenes are 0, 1, 2, 4 (got ${s})`);
  let failed: unknown;
  try {
    for (const s of order) { await all[s](); header(); }
    if (args.sweep) await sweepAll(ctx, emitters);
  } catch (e) {
    failed = e;
    console.error(`\n✗ stopped: ${(e as Error).message}\n  re-run the same command: done steps are skipped (out/state-${name}.json)`);
  } finally {
    const after = { mon: await chain.pub.getBalance({ address: acc.operator.account.address }), usdc: await usdcBalance(ctx, acc.operator.account.address) };
    const rep = { ...budgetReport(ctx, emitters), network: name, forkBlock: forkBlock ?? null, gasPriceAtStart: gasPrice,
      operator: { before, after, spentMon: Number(formatEther(before.mon - after.mon)), spentUsdc: usdc(before.usdc - after.usdc) },
      payerUsdcLeft: st.payer ? await usdcBalance(ctx, st.payer) : null };
    writeFileSync(join(OUT, `${st.runId}.budget.json`), JSON.stringify(rep, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));
    if (pin) clearInterval(pin);
    if (anvil) await anvil.stop();
    console.log(`\noperator: ${mon(before.mon)} -> ${mon(after.mon)} MON (spent ${mon(before.mon - after.mon)}), ${usdc(before.usdc)} -> ${usdc(after.usdc)} USDC`);
  }
  console.log(`events: ${log.path("json")}\nstate:  ${statePath(name)}\n${failed ? "MAINNET ACT FAIL" : "MAINNET ACT PASS"} (scenes ${order.join(",")}, ${name})`);
  if (st.payer) console.log(`payer ${st.payer}: what is left in it goes back to the treasury only through the OWNER (MetaMask): sweep(USDC, amount), RUNBOOK §7`);
  if (failed) process.exitCode = 1;
}

/** MON of the anchors back to the operator, then the operator's USDC rest to the treasury (the agent's key should hold
 * no USDC, AM-6.9). The payer's own USDC is the owner's to sweep. */
async function sweepAll(ctx: Ctx, emitters: Actor[]) {
  await sweep(ctx.chain, emitters, ctx.acc.operator);
  await step(ctx, "sweep-usdc", async () => {
    const rest = await usdcBalance(ctx, ctx.acc.operator.account.address);
    if (rest === 0n) return;
    const r = await ctx.chain.send("usdc rest to treasury", ctx.acc.operator.account, { to: MAINNET.usdc, abi: usdcAbi, functionName: "transfer", args: [ROLES.treasury, rest] });
    await ctx.log.emit({ scene: 4, step: "sweep-usdc", kind: "fund", label: `operator's USDC rest (${usdc(rest)}) to the treasury`, tx: r,
      data: { token: "USDC", to: ROLES.treasury, amount: rest.toString() } });
  });
}

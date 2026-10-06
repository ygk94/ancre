// Act 2 scenes (brief 06 + D33, D45). Every step is idempotent: a step recorded as done in the state file is
// skipped, so a run that failed in the middle of a scene resumes at the failed step.
import { readFileSync } from "node:fs";
import {
  type Abi, type Address, type Hex, decodeEventLog, erc20Abi, encodeAbiParameters, getAddress, hashTypedData, keccak256,
  toHex, zeroAddress, zeroHash,
} from "viem";
import { identityAbi, REASONS, reputationAbi, usdcAbi } from "./abi.ts";
import type { Actor, DemoAccounts } from "./accounts.ts";
import { certify, registryData, setConfig, printSet } from "./certify.ts";
import { artifact, type Chain, type TxRecord } from "./chain.ts";
import {
  FARM_PAY_AMOUNT, FARM_PAYMENTS, FARM_USDC, OUT, PAY_AMOUNT, PAYER_DEPOSIT, SET, TAG2, TESTNET, VALUES,
} from "./config.ts";
import type { EventLog } from "./events.ts";
import { type AgentRec, saveState, type State } from "./state.ts";
import {
  ancrePaymentTypedData, encodeExactBlob, type Facilitator, newAuthorization, paymentPayload, requirements, shortError,
  signTyped, transferInReceipt, usdcAuthorizationTypedData,
} from "./x402.ts";

export type Ctx = {
  chain: Chain;
  name: string; // state file name (fork | frozen | testnet)
  acc: DemoAccounts;
  state: State;
  log: EventLog;
  fac: Facilitator;
  signer: string; // certify.py --signer
  passwordEnv?: Record<string, string>;
  monBudget: Record<string, bigint>; // per emitter label (wei)
  facilitatorTxs: { label: string; hash: Hex; gasLimit?: bigint; gasUsed?: bigint }[];
};

type Check = { name: string; ok: boolean; expected: unknown; actual: unknown };
const check = (name: string, expected: unknown, actual: unknown): Check => ({ name, ok: expected === actual, expected, actual });

const ancreArt = artifact("AnchoredReputation");
const payerArt = artifact("TrustGatedPayer");

const agentURI = (label: string) => "data:application/json;base64," + Buffer.from(JSON.stringify({
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: label,
  description: "ANCRE act 2 demo agent (Monad testnet). Not a real service.", tags: ["demo"],
})).toString("base64");

// ---------------------------------------------------------------- step machinery

async function step(ctx: Ctx, id: string, fn: () => Promise<void>) {
  if (ctx.state.done[id]) {
    console.log(`  [${id}] already done, skipped`);
    return;
  }
  await fn();
  ctx.state.done[id] = { block: (await ctx.chain.block()).number, at: new Date().toISOString() };
  saveState(ctx.name, ctx.state);
}

async function scene(ctx: Ctx, n: number, title: string, body: () => Promise<Check[]>) {
  if (ctx.state.done[`scene-${n}`]) {
    console.log(`\n== scene ${n} (${title}) already done, skipped`);
    return;
  }
  console.log(`\n== scene ${n}: ${title}`);
  const t0 = Date.now();
  await ctx.log.emit({ scene: n, step: `${n}.start`, kind: "scene-start", label: title });
  const checks = await body();
  const ok = checks.every((c) => c.ok);
  await ctx.log.emit({ scene: n, step: `${n}.end`, kind: "scene-end", label: `${title}: ${ok ? "PASS" : "FAIL"}`,
    data: { ok, checks, durationMs: Date.now() - t0 } });
  for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}: expected ${String(c.expected)}, got ${String(c.actual)}`);
  if (!ok) throw new Error(`scene ${n} failed its checks`);
  await step(ctx, `scene-${n}`, async () => {});
}

const ancre = (ctx: Ctx) => ({ address: ctx.state.ancre!, abi: ancreArt.abi });
const agent = (ctx: Ctx, label: string): AgentRec => {
  const a = ctx.state.agents[label];
  if (!a) throw new Error(`agent ${label} is not registered (run the earlier scenes first)`);
  return a;
};
const id = (a: AgentRec) => BigInt(a.agentId);

async function assess(ctx: Ctx, a: AgentRec) {
  const x = await ctx.chain.pub.readContract({ ...ancre(ctx), functionName: "assess", args: [id(a), ctx.state.setId!, true] }) as
    { status: number; trusted: boolean; trust: bigint; trustRobust: bigint; trustLow: bigint; vetoCount: number };
  return x;
}

// ---------------------------------------------------------------- building blocks

async function registerAgent(ctx: Ctx, scene: number, label: string, owner: Actor, wallet: Actor, role: string) {
  await step(ctx, `${scene}.register:${label}`, async () => {
    const r = await ctx.chain.send(`register ${label}`, owner.account, { to: TESTNET.identity, abi: identityAbi,
      functionName: "register", args: [agentURI(label)] });
    const ev = r.receipt.logs.map((l) => { try { return decodeEventLog({ abi: identityAbi, data: l.data, topics: l.topics }); } catch { return undefined; } })
      .find((e) => e?.eventName === "Registered");
    if (!ev) throw new Error("no Registered event");
    const agentId = (ev.args as { agentId: bigint }).agentId;
    ctx.state.agents[label] = { agentId: agentId.toString(), owner: owner.account.address, wallet: zeroAddress, role };
    await ctx.log.emit({ scene, step: `${scene}.register:${label}`, kind: "register", label: `${owner.label} registers ${label} as agent #${agentId}`,
      tx: r, agentId, data: { uri: "data:application/json (demo)", role } });
  });
  await step(ctx, `${scene}.wallet:${label}`, async () => {
    const a = agent(ctx, label);
    const deadline = BigInt((await ctx.chain.block()).timestamp + 240); // <= 5 min (registry MAX_DEADLINE_DELAY)
    const signature = await wallet.account.signTypedData({
      domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: ctx.chain.chainId, verifyingContract: TESTNET.identity },
      types: { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" },
        { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] },
      primaryType: "AgentWalletSet",
      message: { agentId: id(a), newWallet: wallet.account.address, owner: owner.account.address, deadline },
    });
    const r = await ctx.chain.send(`setAgentWallet ${label}`, owner.account, { to: TESTNET.identity, abi: identityAbi,
      functionName: "setAgentWallet", args: [id(a), wallet.account.address, deadline, signature] });
    a.wallet = wallet.account.address;
    // AM-08.A: an anchor must never be the agentWallet of an agent
    if (ctx.acc.anchors.some((x) => x.account.address === a.wallet)) throw new Error("an anchor became an agent wallet (AM-08.A)");
    await ctx.log.emit({ scene, step: `${scene}.wallet:${label}`, kind: "wallet", label: `${label} wallet set`, tx: r, agentId: id(a),
      data: { wallet: a.wallet } });
  });
}

async function feedback(ctx: Ctx, scene: number, stepId: string, from: Actor, to: string, value: bigint, tag1: string) {
  await step(ctx, stepId, async () => {
    const a = agent(ctx, to);
    const r = await ctx.chain.send(`${tag1} ${from.label} -> ${to}`, from.account, { to: TESTNET.reputation, abi: reputationAbi,
      functionName: "giveFeedback", args: [id(a), value, 0, tag1, TAG2, "", "", zeroHash] });
    const idx = await ctx.chain.pub.readContract({ address: TESTNET.reputation, abi: reputationAbi, functionName: "getLastIndex",
      args: [id(a), from.account.address] });
    await ctx.log.emit({ scene, step: stepId, kind: "feedback", label: `${from.label} gives ${tag1} ${value} to ${to}`, tx: r,
      agentId: id(a), data: { client: from.account.address, tag1, tag2: TAG2, value: value.toString(), decimals: 0, feedbackIndex: Number(idx) } });
  });
}

/** Lines of the certifier journal written since `from` (certify.py appends one per transaction). */
function journalSince(ctx: Ctx, from: number): Record<string, unknown>[] {
  try {
    return readFileSync(`${OUT}/${ctx.name}/certifier.jsonl`, "utf8").trim().split("\n").slice(from).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** `mayBeIdentical`: the graph change cannot move mass (the farm, a zero-mass rater), so `skip_identical` is the
 * expected outcome; otherwise only `certified` passes (a deferred certificate would fake the recertification). */
async function certifyStep(ctx: Ctx, scene: number, stepId: string, reason: string, mayBeIdentical = false) {
  let result: Record<string, unknown> = {};
  await step(ctx, stepId, async () => {
    const before = journalSince(ctx, 0).length;
    if (ctx.chain.isLocal) await ctx.chain.impersonate(ctx.acc.operator.account.address); // cast --unlocked on the fork
    const data = await registryData(ctx.chain, TESTNET.identity, TESTNET.reputation, Object.values(ctx.state.agents));
    const r = await certify({ chain: ctx.chain, mode: ctx.name, ancre: ctx.state.ancre!, data, signer: ctx.signer,
      passwordEnv: ctx.passwordEnv, reason, cfg: setConfig(ctx.acc.anchors.map((x) => x.account.address), ctx.acc.operator.account.address) });
    if (r.action !== "certified" && !(mayBeIdentical && r.action === "skip_identical")) {
      throw new Error(`certifier: ${r.action}${r.error ? ` ${String(r.error)}` : ""}${r.waitBlocks ? ` (wait ${String(r.waitBlocks)} blocks)` : ""}`);
    }
    const txs = [];
    for (const j of journalSince(ctx, before).filter((x) => typeof x.tx === "string")) {
      const hash = j.tx as Hex;
      const [tx, rc] = await Promise.all([ctx.chain.pub.getTransaction({ hash }), ctx.chain.pub.getTransactionReceipt({ hash })]);
      const rec: TxRecord = { label: `certifier ${String(j.action)}`, fn: String(j.action), from: tx.from, hash, block: Number(rc.blockNumber),
        status: rc.status, estimate: BigInt(j.estimate as number), gasLimit: tx.gas, gasUsed: rc.gasUsed,
        gasPrice: rc.effectiveGasPrice ?? 0n, costWei: tx.gas * (rc.effectiveGasPrice ?? 0n) };
      ctx.chain.ledger.push(rec);
      txs.push({ fn: rec.fn, hash, gasLimit: rec.gasLimit, gasUsed: rec.gasUsed, block: rec.block });
    }
    result = { ...r, txs };
    const last = txs[txs.length - 1];
    await ctx.log.emit({ scene, step: stepId, kind: "certificate", label: `certifier: ${r.action} (${reason})`,
      block: last?.block, actor: ctx.acc.operator.account.address, data: { trigger: reason },
      certificate: { action: r.action, certBlock: r.txBlock ?? null, nCert: r.nCert, rows: r.rows, eEff: String(r.eEff),
        mass: String(r.mass), graphRoot: r.graphRoot, txs, computeMs: r.computeMs } });
  });
  return result;
}

type PayOutcome = { decision: "PAID" | "REFUSED"; stage: string; reason: string; block: number; wallMs: number; providerReceived: bigint };

/** One x402 `exact` payment from the TrustGatedPayer to an agent. The operator signs even when `decide` already
 * refuses: the refusal shown is the contract's (hard guard, D41), not the client's. */
async function payViaPayer(ctx: Ctx, scene: number, stepId: string, label: string, expect: "PAID" | "REFUSED"): Promise<PayOutcome> {
  let out!: PayOutcome;
  const key = `pay:${stepId}`;
  await step(ctx, stepId, async () => {
    const a = agent(ctx, label);
    const payer = ctx.state.payer!;
    const chainId = ctx.chain.chainId;
    const now = (await ctx.chain.block()).timestamp;
    const auth = newAuthorization(payer, a.wallet, PAY_AMOUNT, now, expect === "PAID" ? 120 : 60);
    const td = ancrePaymentTypedData(chainId, auth, id(a));
    const opSig = await signTyped(ctx.acc.payerOperator.account, td);
    const { EIP712Domain: _d, ...types } = td.types;
    const ours = hashTypedData({ ...td, types } as never);
    const theirs = await ctx.chain.pub.readContract({ address: payer, abi: payerArt.abi, functionName: "paymentDigest",
      args: [auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, id(a)] });
    if (ours !== theirs) throw new Error("AncrePayment digest drift between demo/lib/x402.ts and TrustGatedPayer");
    const blob = encodeExactBlob(auth, id(a), opSig);
    const hash = hashTypedData(usdcAuthorizationTypedData(chainId, TESTNET.usdc, auth));
    const req = requirements(TESTNET.network, TESTNET.usdc, a.wallet, PAY_AMOUNT, id(a));
    const payload = paymentPayload(req, auth, blob, `ancre-demo://agent/${a.agentId}`);
    const [decideReason] = await ctx.chain.pub.readContract({ address: payer, abi: payerArt.abi, functionName: "decide",
      args: [id(a), a.wallet, PAY_AMOUNT] }) as [number, unknown];
    const [explainReason, , , , , x] = await ctx.chain.pub.readContract({ address: payer, abi: payerArt.abi, functionName: "explain",
      args: [hash, blob] }) as [number, number, bigint, Address, bigint, { status: number; trustLow: bigint; distrustUp: bigint; triggerTag: Hex }];
    const bal = () => ctx.chain.pub.readContract({ address: TESTNET.usdc, abi: usdcAbi, functionName: "balanceOf", args: [a.wallet] });
    const b0 = await bal();
    const evalBlock = (await ctx.chain.block()).number; // /verify is an eth_call on this state (latency of scene 4)
    const v = await ctx.fac.verify(payload, req);
    const s = v.ok ? await ctx.fac.settle(payload, req) : undefined;
    const received = (await bal()) - b0;
    if (s?.hash) ctx.facilitatorTxs.push({ label: `settle ${label}`, hash: s.hash, gasLimit: s.gasLimit, gasUsed: s.gasUsed });
    const decision = s?.ok && received === PAY_AMOUNT ? "PAID" : "REFUSED";
    const stage = !v.ok ? "verify" : !s?.ok ? (s?.broadcast ? "onchain" : "settle") : "settled";
    out = { decision, stage, reason: REASONS[explainReason], block: s?.block ?? evalBlock, wallMs: Date.now(), providerReceived: received };
    ctx.state.notes[key] = { ...out, providerReceived: received.toString() }; // a resumed run re-checks the saved outcome
    const payerBal = await ctx.chain.pub.readContract({ address: TESTNET.usdc, abi: usdcAbi, functionName: "balanceOf", args: [payer] });
    await ctx.log.emit({ scene, step: stepId, kind: "payment", agentId: id(a), block: out.block, actor: ctx.acc.payerOperator.account.address,
      label: `payer pays ${label} ${Number(PAY_AMOUNT) / 1e6} USDC: ${decision}${decision === "REFUSED" ? ` (${REASONS[explainReason]})` : ""}`,
      payer: { address: payer, operator: ctx.acc.payerOperator.account.address, payTo: a.wallet, amount: PAY_AMOUNT.toString(), decision, stage,
        reason: REASONS[explainReason], decide: REASONS[decideReason],
        explain: { reason: REASONS[explainReason], status: ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"][x.status],
          trustLow: x.trustLow.toString(), distrustUp: x.distrustUp.toString(), triggerTag: /^0x0+$/.test(x.triggerTag) ? null : x.triggerTag },
        facilitator: { verify: v.ok ? "ok" : v.error, settle: s ? (s.ok ? "ok" : s.error ?? "failed") : null },
        settlementTx: s?.hash ?? null, providerReceived: received.toString(), payerBalanceAfter: payerBal.toString() } });
    // a refusal counts only if it is the CONTRACT's (refused at /verify, explain != OK): a facilitator or RPC failure
    // must never pass for a guard decision; the step is then left undone and is retried on the next run
    if (decision !== expect) throw new Error(`${stepId}: expected ${expect}, got ${decision} (stage ${stage}, ${v.error ?? s?.error ?? ""})`);
    if (decision === "REFUSED" && (stage !== "verify" || explainReason === 0)) {
      throw new Error(`${stepId}: refused at ${stage} with explain = ${REASONS[explainReason]}: not a contract refusal (${v.error ?? s?.error ?? ""})`);
    }
  });
  if (!out) {
    const n = ctx.state.notes[key] as PayOutcome & { providerReceived: string };
    out = { ...n, providerReceived: BigInt(n.providerReceived) };
  }
  return out;
}

// ---------------------------------------------------------------- scene 0: setup

export async function scene0(ctx: Ctx) {
  const { chain, acc } = ctx;
  const op = acc.operator;
  await scene(ctx, 0, "setup: ANCRE, anchor set, honest providers, funded payer, first certificate", async () => {
    await step(ctx, "0.fund-mon", async () => {
      // the faucet, on a local chain only: 5 MON in a rehearsal of the testnet run (BUDGET.md §3), plenty otherwise
      if (chain.isLocal && (await chain.pub.getBalance({ address: op.account.address })) === 0n) {
        await chain.setBalance(op.account.address, (chain.monadRules ? 5n : 1_000n) * 10n ** 18n);
      }
      for (const [label, target] of Object.entries(ctx.monBudget)) {
        const actor = [...acc.anchors, acc.farmOwner, ...acc.farm, acc.rater].find((x) => x.label === label)!;
        const have = await chain.pub.getBalance({ address: actor.account.address });
        if (have >= target) continue;
        const r = await chain.send(`fund ${label}`, op.account, { to: actor.account.address, value: target - have });
        await ctx.log.emit({ scene: 0, step: `0.fund-mon:${label}`, kind: "fund", label: `fund ${label} with MON for gas`, tx: r,
          data: { token: "MON", to: actor.account.address, amount: (target - have).toString() } });
      }
    });
    await step(ctx, "0.deploy-ancre", async () => {
      for (const reg of [TESTNET.identity, TESTNET.reputation]) {   // same guard as contracts/script/Deploy.s.sol (D17)
        const v = await chain.pub.readContract({ address: reg, abi: [{ type: "function", name: "getVersion", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" }] as Abi, functionName: "getVersion" });
        if (v !== "2.0.0") throw new Error(`registry ${reg} is ${String(v)}, not 2.0.0`);
      }
      const args = encodeAbiParameters([{ type: "address" }, { type: "address" }], [TESTNET.identity, TESTNET.reputation]);
      const r = await chain.send("deploy AnchoredReputation", op.account, { deploy: (ancreArt.bytecode + args.slice(2)) as Hex });
      ctx.state.ancre = getAddress(r.receipt.contractAddress!);
      await ctx.log.emit({ scene: 0, step: "0.deploy-ancre", kind: "deploy", label: "deploy AnchoredReputation", tx: r, data: { contract: "ancre", address: ctx.state.ancre } });
    });
    await step(ctx, "0.anchor-set", async () => {
      const cfg = setConfig(acc.anchors.map((x) => x.account.address), op.account.address);
      const { setId, set } = await printSet(ctx.name, cfg);
      const params = {
        anchors: set.anchors.map((x) => getAddress(x)), lambdas: set.lambdas.map(BigInt), alphaN: set.alphaN, alphaD: set.alphaD,
        tagSchemaHash: set.tagSchemaHash, tags: set.tags.map((t) => ({ tag: t.tag, min: BigInt(t.min), neutral: BigInt(t.neutral), max: BigInt(t.max), kind: t.kind })),
        policy: { ...set.policy, theta: BigInt(set.policy.theta as string | number), maxAge: BigInt(set.policy.maxAge as number),
          minRefresh: BigInt(set.policy.minRefresh as number), slackRefresh: BigInt(set.policy.slackRefresh as number),
          eLowMax: BigInt(set.policy.eLowMax as string | number), submitters: (set.policy.submitters as string[]).map((x) => getAddress(x)) },
      };
      const onchain = await chain.pub.readContract({ ...ancre(ctx), functionName: "computeSetId", args: [params] });
      if (onchain !== setId) throw new Error(`setId mismatch: contract ${String(onchain)} vs certifier ${setId}`);
      const r = await chain.send("registerAnchorSet", op.account, { ...ancre(ctx), to: ctx.state.ancre, functionName: "registerAnchorSet", args: [params] });
      ctx.state.setId = setId;
      ctx.state.set = set;
      await ctx.log.emit({ scene: 0, step: "0.anchor-set", kind: "anchor-set", label: "register the demo anchor set (3 anchors, m = 2)", tx: r, data: { setId } });
    });
    ctx.log.ancre = { address: ctx.state.ancre!, abi: ancreArt.abi, setId: ctx.state.setId!, theta: SET.theta };
    await registerAgent(ctx, 0, "provider-1 (demo)", op, acc.providers[0], "provider");
    await registerAgent(ctx, 0, "provider-2 (demo)", op, acc.providers[1], "provider");
    await step(ctx, "0.deploy-payer", async () => {
      const args = encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "bytes32" }, { type: "uint256" }],
        [TESTNET.usdc, zeroAddress, zeroAddress, ctx.state.ancre!, op.account.address, op.account.address, acc.payerOperator.account.address, ctx.state.setId!, PAY_AMOUNT]);
      const r = await chain.send("deploy TrustGatedPayer", op.account, { deploy: (payerArt.bytecode + args.slice(2)) as Hex });
      ctx.state.payer = getAddress(r.receipt.contractAddress!);
      await ctx.log.emit({ scene: 0, step: "0.deploy-payer", kind: "deploy", label: "deploy TrustGatedPayer (owner = treasury = operator; exact only)", tx: r,
        data: { contract: "payer", address: ctx.state.payer } });
    });
    await step(ctx, "0.fund-payer", async () => {
      if (chain.isLocal) await dealUsdc(chain, op.account.address, 10_000_000n);
      const r = await chain.send("fund payer", op.account, { to: TESTNET.usdc, abi: erc20Abi, functionName: "transfer", args: [ctx.state.payer!, PAYER_DEPOSIT] });
      await ctx.log.emit({ scene: 0, step: "0.fund-payer", kind: "fund", label: `deposit ${Number(PAYER_DEPOSIT) / 1e6} USDC in the payer`, tx: r,
        data: { token: "USDC", to: ctx.state.payer, amount: PAYER_DEPOSIT.toString() } });
    });
    await certifyStep(ctx, 0, "0.cert", "first certificate");
    const p1 = await assess(ctx, agent(ctx, "provider-1 (demo)"));
    return [check("provider-1 not trusted yet (no anchor feedback)", false, p1.trusted)];
  });
}

// ---------------------------------------------------------------- scene 1: honest providers are paid

export async function scene1(ctx: Ctx) {
  const [A, B, C] = ctx.acc.anchors;
  await scene(ctx, 1, "honest providers, vouched by 2 anchors each, are paid", async () => {
    await feedback(ctx, 1, "1.vouch:A->p1", A, "provider-1 (demo)", VALUES.anchorVouch[0], "vouch");
    await feedback(ctx, 1, "1.vouch:B->p1", B, "provider-1 (demo)", VALUES.anchorVouch[1], "vouch");
    await feedback(ctx, 1, "1.vouch:B->p2", B, "provider-2 (demo)", VALUES.anchorVouch[0], "vouch");
    await feedback(ctx, 1, "1.vouch:C->p2", C, "provider-2 (demo)", VALUES.anchorVouch[1], "vouch");
    await certifyStep(ctx, 1, "1.cert", "anchors vouched for the providers");
    const p1 = await payViaPayer(ctx, 1, "1.pay:p1", "provider-1 (demo)", "PAID");
    const p2 = await payViaPayer(ctx, 1, "1.pay:p2", "provider-2 (demo)", "PAID");
    return [
      check("provider-1 trusted", true, (await assess(ctx, agent(ctx, "provider-1 (demo)"))).trusted),
      check("provider-2 trusted", true, (await assess(ctx, agent(ctx, "provider-2 (demo)"))).trusted),
      ...(p1 ? [check("provider-1 paid", "PAID", p1.decision)] : []),
      ...(p2 ? [check("provider-2 paid", "PAID", p2.decision)] : []),
    ];
  });
}

// ---------------------------------------------------------------- scene 2: the Sybil farm

const TARGET = "farm target (demo)";
const farmLabel = (i: number) => `farm-${String(i + 1).padStart(2, "0")} (demo)`;

export async function scene2(ctx: Ctx) {
  const { acc } = ctx;
  const N = acc.farm.length;
  await scene(ctx, 2, `Sybil farm: ${N} agents rate each other and a target at the schema maximum`, async () => {
    await registerAgent(ctx, 2, TARGET, acc.farmOwner, acc.farmTarget, "farm-target");
    for (let i = 0; i < N; i++) await registerAgent(ctx, 2, farmLabel(i), acc.farmOwner, acc.farm[i], "farm");
    for (let i = 0; i < N; i++) {
      await feedback(ctx, 2, `2.farm:${i + 1}->target`, acc.farm[i], TARGET, VALUES.farmVouch, "vouch");
      await feedback(ctx, 2, `2.farm:${i + 1}->${((i + 1) % N) + 1}`, acc.farm[i], farmLabel((i + 1) % N), VALUES.farmVouch, "vouch");
    }
    await certifyStep(ctx, 2, "2.cert", "farm feedback", true);
    const r1 = await payViaPayer(ctx, 2, "2.pay:target", TARGET, "REFUSED");
    // a compromised anchor endorses the target: one anchor is not enough with leave-one-out m = 2 (D8)
    await feedback(ctx, 2, "2.compromised:C->target", acc.anchors[2], TARGET, VALUES.compromisedVouch, "vouch");
    await certifyStep(ctx, 2, "2.cert-compromised", "a compromised anchor vouched for the farm target");
    const r2 = await payViaPayer(ctx, 2, "2.pay:target-after-compromise", TARGET, "REFUSED");
    const t = await assess(ctx, agent(ctx, TARGET));
    // USDC for scene 3 (outside its timer)
    for (let i = 0; i < Math.min(FARM_PAYMENTS, N); i++) {
      await step(ctx, `2.fund-farm-usdc:${i + 1}`, async () => {
        if (ctx.chain.isLocal) await dealUsdc(ctx.chain, acc.operator.account.address, 10_000_000n);
        const r = await ctx.chain.send(`usdc to farm-${i + 1}`, acc.operator.account, { to: TESTNET.usdc, abi: erc20Abi, functionName: "transfer",
          args: [acc.farm[i].account.address, FARM_USDC] });
        await ctx.log.emit({ scene: 2, step: `2.fund-farm-usdc:${i + 1}`, kind: "fund", label: `USDC to ${acc.farm[i].label} (for scene 3)`, tx: r,
          data: { token: "USDC", to: acc.farm[i].account.address, amount: FARM_USDC.toString() } });
      });
    }
    return [
      ...(r1 ? [check("target refused before the compromise", "UNTRUSTED", r1.reason), check("target not paid", 0n, r1.providerReceived)] : []),
      ...(r2 ? [check("target refused after one anchor vouched", "REFUSED", r2.decision)] : []),
      check("target has mass from the compromised anchor (trust > 0)", true, t.trust > 0n),
      check("leave-one-out removes it (trustRobust = 0)", 0n, t.trustRobust),
    ];
  });
}

// ---------------------------------------------------------------- scene 3 (D45): the farm pays itself

export async function scene3(ctx: Ctx) {
  const { acc } = ctx;
  const N = acc.farm.length;
  const K = Math.min(FARM_PAYMENTS, N);
  await scene(ctx, 3, `the farm pays itself over x402 (${K} true receipts), mass still 0, refusal holds`, async () => {
    const t0 = Date.now();
    for (let i = 0; i < K; i++) {
      await step(ctx, `3.farm-pay:${i + 1}`, async () => {
        const from = acc.farm[i];
        const toRec = agent(ctx, farmLabel((i + 1) % N));
        const now = (await ctx.chain.block()).timestamp;
        const auth = newAuthorization(from.account.address, toRec.wallet, FARM_PAY_AMOUNT, now, 120);
        const sig = await from.account.signTypedData(usdcAuthorizationTypedData(ctx.chain.chainId, TESTNET.usdc, auth) as never);
        const req = requirements(TESTNET.network, TESTNET.usdc, toRec.wallet, FARM_PAY_AMOUNT, id(toRec));
        const payload = paymentPayload(req, auth, sig, `ancre-demo://farm/${toRec.agentId}`);
        const v = await ctx.fac.verify(payload, req);
        const s = v.ok ? await ctx.fac.settle(payload, req) : undefined;
        if (!s?.ok || !s.hash) throw new Error(`farm payment ${i + 1} failed: ${v.error ?? s?.error}`);
        ctx.facilitatorTxs.push({ label: `farm settle ${i + 1}`, hash: s.hash, gasLimit: s.gasLimit, gasUsed: s.gasUsed });
        const t = await transferInReceipt(ctx.chain, s.hash, TESTNET.usdc);
        const ok = !!t && getAddress(t.from) === from.account.address && getAddress(t.to) === toRec.wallet && t.value === FARM_PAY_AMOUNT;
        await ctx.log.emit({ scene: 3, step: `3.farm-pay:${i + 1}`, kind: "farm-payment", agentId: id(toRec), block: s.block,
          actor: from.account.address, label: `${from.label} pays ${farmLabel((i + 1) % N)} ${Number(FARM_PAY_AMOUNT) / 1e6} USDC over x402 (true receipt)`,
          data: { from: from.account.address, to: toRec.wallet, amount: FARM_PAY_AMOUNT.toString(), settlementTx: s.hash, receiptVerified: ok } });
        if (!ok) throw new Error(`farm payment ${i + 1}: no matching USDC Transfer in the settlement receipt ${s.hash}`);
        ctx.state.notes[`farmReceipt:${i + 1}`] = s.hash;
      });
    }
    const r = await payViaPayer(ctx, 3, "3.pay:target", TARGET, "REFUSED");
    const masses = await Promise.all([TARGET, ...Array.from({ length: K }, (_, i) => farmLabel((i + 1) % N))].map(async (l) => (await assess(ctx, agent(ctx, l))).trustRobust));
    const durationMs = Date.now() - t0;
    ctx.state.notes.scene3DurationMs = durationMs;
    return [
      check("farm payments with a verified on-chain receipt", K, Array.from({ length: K }, (_, i) => ctx.state.notes[`farmReceipt:${i + 1}`]).filter(Boolean).length),
      check("robust mass of the target and the paid farm agents", "0", masses.reduce((a, b) => a + b, 0n).toString()),
      ...(r ? [check("payer still refuses the target", "REFUSED", r.decision)] : []),
    ];
  });
}

// ---------------------------------------------------------------- scene 4: breaker

export async function scene4(ctx: Ctx) {
  const B = ctx.acc.anchors[1];
  const P2 = "provider-2 (demo)";
  await scene(ctx, 4, "breaker: an anchor slashes a provider that went bad, refused at the next payment", async () => {
    const before = await payViaPayer(ctx, 4, "4.pay:p2-before", P2, "PAID");
    let slash: { block: number; wallMs: number } | undefined;
    await step(ctx, "4.slash", async () => {
      await feedbackNow();
    });
    async function feedbackNow() {
      const a = agent(ctx, P2);
      const r = await ctx.chain.send("slash B -> p2", B.account, { to: TESTNET.reputation, abi: reputationAbi, functionName: "giveFeedback",
        args: [id(a), VALUES.slash, 0, "slash", TAG2, "", "", zeroHash] });
      slash = { block: r.block, wallMs: Date.now() };
      ctx.state.notes.slash = slash;
      await ctx.log.emit({ scene: 4, step: "4.slash", kind: "feedback", label: `${B.label} slashes provider-2 (${VALUES.slash})`, tx: r, agentId: id(a),
        data: { client: B.account.address, tag1: "slash", tag2: TAG2, value: VALUES.slash.toString(), decimals: 0 } });
    }
    slash ??= ctx.state.notes.slash as { block: number; wallMs: number };
    const refused = await payViaPayer(ctx, 4, "4.pay:p2-after-slash", P2, "REFUSED");
    const cert = await certifyStep(ctx, 4, "4.cert", "an anchor slashed provider-2");
    const refused2 = await payViaPayer(ctx, 4, "4.pay:p2-after-cert", P2, "REFUSED");
    const certBlock = (cert.txs as { block: number }[] | undefined)?.at(-1)?.block ?? (ctx.state.notes.cert4Block as number | undefined);
    if (certBlock) ctx.state.notes.cert4Block = certBlock;
    if (refused && slash) {
      const lat = {
        from: { step: "4.slash", block: slash.block, wallMs: slash.wallMs },
        to: { step: "4.pay:p2-after-slash", block: refused.block, wallMs: refused.wallMs },
        blocks: refused.block - slash.block, ms: refused.wallMs - slash.wallMs,
        parts: [
          { name: "slash -> refused payment (live veto, no certificate needed)", blocks: refused.block - slash.block, ms: refused.wallMs - slash.wallMs },
          ...(certBlock && refused2 ? [{ name: "slash -> certificate carrying the veto", blocks: certBlock - slash.block, ms: null }] : []),
        ],
        measured: ctx.chain.mode,
      };
      ctx.state.notes.breakerLatency = lat;
      await ctx.log.emit({ scene: 4, step: "4.latency", kind: "assess", agentId: id(agent(ctx, P2)), label: `breaker latency: ${lat.blocks} block(s), ${lat.ms} ms (${ctx.chain.mode})`, latency: lat });
    }
    const x = await assess(ctx, agent(ctx, P2));
    return [
      ...(before ? [check("provider-2 paid before the slash", "PAID", before.decision)] : []),
      ...(refused ? [check("refused right after the slash", "ANCRE_STATUS", refused.reason)] : []),
      ...(refused2 ? [check("still refused after recertification", "REFUSED", refused2.decision)] : []),
      check("status VETOED", 4, Number(x.status)),
    ];
  });
}

// ---------------------------------------------------------------- scene 5: anti-erasure (D33)

export async function scene5(ctx: Ctx) {
  const P2 = "provider-2 (demo)";
  await scene(ctx, 5, "anti-erasure: a +1 from another rater under another tag does not lift the veto", async () => {
    await feedback(ctx, 5, "5.review:rater->p2", ctx.acc.rater, P2, VALUES.thirdPartyReview, "review");
    await certifyStep(ctx, 5, "5.cert", "a third party reviewed provider-2", true);
    const r = await payViaPayer(ctx, 5, "5.pay:p2", P2, "REFUSED");
    const x = await assess(ctx, agent(ctx, P2));
    return [
      check("still VETOED", 4, Number(x.status)),
      check("veto count", true, x.vetoCount >= 1),
      ...(r ? [check("payment still refused", "REFUSED", r.decision)] : []),
    ];
  });
}

// ---------------------------------------------------------------- scene 6: a fabricated certificate is rejected

export async function scene6(ctx: Ctx) {
  await scene(ctx, 6, "a fabricated certificate (an edge the registry does not hold) is rejected at submission", async () => {
    let rejected = false;
    let error = "";
    await step(ctx, "6.fabricated", async () => {
      if (ctx.chain.isLocal) await ctx.chain.impersonate(ctx.acc.operator.account.address);
      const t = agent(ctx, TARGET);
      const data = await registryData(ctx.chain, TESTNET.identity, TESTNET.reputation, Object.values(ctx.state.agents));
      const fake = { a: t.agentId, c: ctx.acc.anchors[0].account.address, v: "100", d: 0, t1: "vouch" };
      const r = await certify({ chain: ctx.chain, mode: ctx.name, ancre: ctx.state.ancre!, data, signer: ctx.signer, passwordEnv: ctx.passwordEnv,
        reason: "fabricated", fabricate: fake, cfg: setConfig(ctx.acc.anchors.map((x) => x.account.address), ctx.acc.operator.account.address) });
      rejected = r.rejected === true;
      error = String(r.error ?? "");
      ctx.state.notes.fabricated = { rejected, error };
      await ctx.log.emit({ scene: 6, step: "6.fabricated", kind: "rejected", agentId: id(t), actor: ctx.acc.operator.account.address,
        label: `a certificate claiming "anchor-A vouches for the farm target" is rejected: ${error}`,
        data: { fn: "submitCertificate", error, simulated: true, fabricatedEdge: fake, mass: String(r.mass) } });
    });
    const n = ctx.state.notes.fabricated as { rejected: boolean; error: string };
    return [check("rejected at submission", true, n.rejected), check("error is EdgeMismatch", true, n.error.startsWith("EdgeMismatch"))];
  });
}

// ---------------------------------------------------------------- fork helpers

/** FiatToken v2.2 keeps balances in slot 9 (chantier 05, plugin/scripts/local.mjs): test USDC on a local chain only. */
async function dealUsdc(chain: Chain, who: Address, amount: bigint) {
  chain.assertLocal();
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, 9n]));
  const cur = await chain.pub.readContract({ address: TESTNET.usdc, abi: usdcAbi, functionName: "balanceOf", args: [who] });
  if (cur >= amount) return;
  await chain.rawRequest("anvil_setStorageAt", [TESTNET.usdc, slot, toHex(amount, { size: 32 })]);
  const b = await chain.pub.readContract({ address: TESTNET.usdc, abi: usdcAbi, functionName: "balanceOf", args: [who] });
  if (b !== amount) throw new Error(`USDC balance slot guess wrong (got ${b})`);
}

export const shortErr = shortError;

#!/usr/bin/env node
// Test T1 (porte P3): does the x402 facilitator settle a payment from an ERC-1271 payer whose isValidSignature
// burns 78 k / 190 k gas (the cost of ANCRE's passesAnchorPolicy, isTrusted before 02-bis), and what happens on a refusal?
//
//   node scripts/t1.mjs --local       dry run: anvil --network monad fork of the testnet, the facilitator emulated
//                                     as x402-rs does it (eth_call, then eth_estimateGas, then a send with that limit).
//                                     NO real transaction. Also the TS <-> Solidity digest check.
//   node scripts/t1.mjs --live --account <keystore> --provider 0xP --payer 0x… --oracle 0x… [--probe-cap]
//                                     REAL testnet run against https://x402-facilitator.molandak.org, after the deploy
//                                     (`forge script script/t1/T1.s.sol`, T1_STEP=deploy). Interactive: a human types
//                                     a confirmation in a terminal, then the keystore password for each transaction.
//
// It uses the plugin's library (dist/lib): the same authorisation, typed data and blob as `mm ancre pay`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { bytesToHex, createPublicClient, createWalletClient, encodeFunctionData, getAddress, hashTypedData, http, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ancrePaymentTypedData, ancreUptoTypedData, encodeExactBlob, encodeUptoBlob, usdcAuthorizationDigest, REASONS } from "../dist/lib/payer.js";
import { buildPaymentPayload, newAuthorization } from "../dist/lib/x402.js";
import { payerAbi } from "../dist/lib/payerAbi.js";
import { CHAIN_ID, DEV_D, DEV_P, FAC, FOUNDRY, NETWORK, TESTNET, UPTO, USDC, dealUsdc, emulatedFacilitator, exactSettlementCall, forgeScript, oracleAbi, startAnvil, usdcAbi, warp } from "./local.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(`--${n}`);
const LIVE = has("live");
const FACILITATOR = flag("facilitator", "https://x402-facilitator.molandak.org");
const AGENT_ID = 1n; // inside T1Oracle
const TTL = 60; // seconds of validity of each authorisation (refusal scenes wait for it to lapse before re-trusting)

const uptoAbi = parseAbi([
  "struct TokenPermissions { address token; uint256 amount; }",
  "struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }",
  "struct Witness { address to; address facilitator; uint256 validAfter; }",
  "function settle(PermitTransferFrom permit, uint256 amount, address owner, Witness witness, bytes signature)",
]);

const log = [];
const json = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const note = (scene, data) => { const e = { scene, at: new Date().toISOString(), ...data }; log.push(e); console.log(json(e)); };

// ------------------------------------------------------------------ facilitator: real HTTP, or emulated on the fork
async function facilitator(pub, phase, payload, requirements, local) {
  if (!LIVE) return emulatedFacilitator(pub, phase, local.to, local.data(phase));
  const body = JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirements });
  const nonceBefore = await pub.getTransactionCount({ address: FAC });
  const res = await fetch(`${FACILITATOR}/${phase}`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const text = await res.text();
  let resp;
  try { resp = JSON.parse(text); } catch { resp = { raw: text.slice(0, 500) }; }
  const out = { ok: res.ok && (resp.isValid === true || resp.success === true), phase, httpStatus: res.status, response: resp };
  if (phase === "settle") {
    if (resp.transaction) {
      const r = await pub.waitForTransactionReceipt({ hash: resp.transaction });
      const tx = await pub.getTransaction({ hash: resp.transaction });
      Object.assign(out, { hash: resp.transaction, gasLimit: tx.gas, gasUsed: r.gasUsed, status: r.status });
    }
    out.facilitatorNonceDelta = (await pub.getTransactionCount({ address: FAC })) - nonceBefore; // 0 => nothing broadcast
  }
  return out;
}

// ------------------------------------------------------------------ signing and admin: dev key locally, keystore live
async function signTyped(td, dev) {
  if (!LIVE) return dev.signTypedData(td);
  const f = "t1-results/typed.json";
  writeFileSync(f, json(td));
  return execFileSync(`${FOUNDRY}/cast`, ["wallet", "sign", "--data", "--from-file", f, "--account", flag("account")],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }).trim();
}

async function admin(ctx, to, abi, functionName, fnArgs, gas) {
  if (!LIVE) {
    const hash = await ctx.wallet.writeContract({ address: to, abi, functionName, args: fnArgs, gas, chain: null });
    const r = await ctx.pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`admin ${functionName} reverted (gas limit ${gas}, used ${r.gasUsed})`);
    return r.gasUsed;
  }
  const item = abi.find((x) => x.name === functionName);
  const sig = `${functionName}(${item.inputs.map((i) => i.type).join(",")})`;
  const out = execFileSync(`${FOUNDRY}/cast`, ["send", to, sig, ...fnArgs.map(String), "--account", flag("account"),
    "--rpc-url", TESTNET, "--gas-limit", String(gas), "--json"], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  const r = JSON.parse(out);
  if (r.status !== "0x1" && r.status !== 1 && r.status !== "1") throw new Error(`admin ${functionName} reverted: ${r.transactionHash}`);
  return BigInt(r.gasUsed);
}

/** wait until every authorisation signed so far has expired (so a refused one can never be settled later) */
async function expireAuthorizations(ctx, validBefore) {
  if (!LIVE) return warp(ctx.pub, TTL + 5);
  for (;;) {
    const ts = (await ctx.pub.getBlock()).timestamp;
    if (ts > validBefore) return;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ------------------------------------------------------------------ scenes
async function payExact(ctx, label, { settle = true, between } = {}) {
  const now = Number((await ctx.pub.getBlock()).timestamp);
  const requirements = { scheme: "exact", network: NETWORK, amount: "1000", asset: USDC, payTo: ctx.provider, maxTimeoutSeconds: TTL,
    extra: { name: "USDC", version: "2" } };
  const auth = newAuthorization(ctx.payer, requirements, now, bytesToHex(randomBytes(32)));
  const td = ancrePaymentTypedData(CHAIN_ID, auth, AGENT_ID);
  const blob = encodeExactBlob(auth, AGENT_ID, await signTyped(td, ctx.dev));
  // TS <-> Solidity: the contract recomputes both digests from the blob
  const opDigest = await ctx.pub.readContract({ address: ctx.payer, abi: payerAbi, functionName: "paymentDigest",
    args: [auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, AGENT_ID] });
  const [reason] = await ctx.pub.readContract({ address: ctx.payer, abi: payerAbi, functionName: "explain",
    args: [usdcAuthorizationDigest(CHAIN_ID, USDC, auth), blob] });
  const pr = { x402Version: 2, resource: { url: "https://ancre.local/t1" }, accepts: [requirements] };
  const payload = buildPaymentPayload(pr, requirements, auth, blob, "https://ancre.local/t1");
  const local = { to: USDC, data: () => exactSettlementCall(payload) };
  const verify = await facilitator(ctx.pub, "verify", payload, requirements, local);
  if (between) await between();
  const out = { tsSolidityDigestMatch: opDigest === hashTypedData(td), explainBefore: REASONS[Number(reason)], verify };
  if (settle) out.settle = await facilitator(ctx.pub, "settle", payload, requirements, local);
  note(label, out);
  return auth.validBefore;
}

async function payUpto(ctx, label, cap = 5000n, amount = 1000n) {
  const now = BigInt((await ctx.pub.getBlock()).timestamp);
  const u = { from: ctx.payer, to: ctx.provider, cap, nonce: BigInt(bytesToHex(randomBytes(32))), deadline: now + BigInt(TTL), facilitator: FAC, validAfter: 0n };
  const blob = encodeUptoBlob(u, AGENT_ID, await signTyped(ancreUptoTypedData(CHAIN_ID, u, AGENT_ID), ctx.dev));
  const accepted = { scheme: "upto", network: NETWORK, amount: cap.toString(), asset: USDC, payTo: ctx.provider, maxTimeoutSeconds: TTL, extra: { facilitatorAddress: FAC } };
  const payload = {
    x402Version: 2, resource: { url: "https://ancre.local/t1-upto" }, accepted,
    payload: { signature: blob, permit2Authorization: { permitted: { token: USDC, amount: cap.toString() }, from: ctx.payer, spender: UPTO,
      nonce: toHex(u.nonce, { size: 32 }), deadline: u.deadline.toString(), witness: { to: u.to, facilitator: FAC, validAfter: "0" } } },
  };
  const local = { to: UPTO, data: (phase) => encodeFunctionData({ abi: uptoAbi, functionName: "settle", args: [
    { permitted: { token: USDC, amount: cap }, nonce: u.nonce, deadline: u.deadline },
    phase === "verify" ? cap : amount, u.from, { to: u.to, facilitator: FAC, validAfter: 0n }, blob] }) };
  const verify = await facilitator(ctx.pub, "verify", payload, accepted, local);
  const settle = await facilitator(ctx.pub, "settle", payload, { ...accepted, amount: amount.toString() }, local);
  note(label, { verify, settle });
}

async function liveGate() {
  if (!process.stdin.isTTY) {
    console.error("REFUSED: --live sends real testnet transactions and calls the real facilitator; it needs a human at an interactive terminal.");
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const phrase = `testnet ${flag("payer")}`;
  const a = await rl.question(`About to send real testnet transactions (≈0.40 MON) and call ${FACILITATOR}.\nType "${phrase}" to continue: `);
  rl.close();
  if (a.trim() !== phrase) {
    console.error("aborted");
    process.exit(2);
  }
}

async function main() {
  if (LIVE) await liveGate();
  mkdirSync("t1-results", { recursive: true });
  const fork = LIVE ? undefined : await startAnvil(flag("port", "8546"));
  const rpc = LIVE ? TESTNET : fork.rpc;
  const pub = createPublicClient({ transport: http(rpc) });
  const dev = privateKeyToAccount(DEV_D);
  const ctx = { pub, dev, wallet: createWalletClient({ account: dev, transport: http(rpc) }) };
  try {
    if (LIVE) {
      Object.assign(ctx, { payer: getAddress(flag("payer")), oracle: getAddress(flag("oracle")), provider: getAddress(flag("provider")) });
    } else {
      await dealUsdc(pub, dev.address, 1_000_000n);
      const d = forgeScript(rpc, { T1_STEP: "deploy", T1_PROVIDER: DEV_P, T1_FUND: "100000" }, ["--private-key", DEV_D]);
      Object.assign(ctx, { payer: getAddress(d.payer), oracle: getAddress(d.oracle), provider: DEV_P });
      note("T1-1..3 deploy (forge script, as live)", { payer: ctx.payer, oracle: ctx.oracle,
        payerUsdc: await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [ctx.payer] }) });
    }
    const setBurn = (b) => admin(ctx, ctx.oracle, oracleAbi, "setBurn", [b], 60_000n);
    const setTrusted = (t) => admin(ctx, ctx.oracle, oracleAbi, "setAgent", [AGENT_ID, ctx.provider, t, 0], 120_000n);

    await payExact(ctx, "T1-4 exact, burn 78k (assess without veto)");
    note("T1-5 setBurn", { gasUsed: await setBurn(190_000n) });
    await payExact(ctx, "T1-6 exact, burn 190k (assess with veto, k=8)");
    if (has("probe-cap")) {
      await setBurn(2_000_000n);
      try {
        await payExact(ctx, "T1-7 exact, burn 2M (probe of a facilitator gas cap)");
      } finally {
        await setBurn(190_000n);
      }
    }
    await setTrusted(false);
    let vb = await payExact(ctx, "T1-8 refused at /verify (untrusted)", { settle: false });
    await setTrusted(true);
    vb = await payExact(ctx, "T1-9 breaker: verify OK, then untrusted, then settle", { between: () => setTrusted(false) });
    await expireAuthorizations(ctx, vb); // T1-8 and T1-9 must never become settleable when the agent is trusted again
    await setTrusted(true);
    note("T1-11a approvePermit2", { gasUsed: await admin(ctx, ctx.payer, payerAbi, "approvePermit2", [2n ** 256n - 1n], 150_000n) });
    await payUpto(ctx, "T1-11 upto, cap 5000, settle 1000");
  } finally {
    const f = `t1-results/${LIVE ? "live" : "local"}-${Date.now()}.json`;
    writeFileSync(f, JSON.stringify(log, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    console.error(`results: ${f}`);
    fork?.stop();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

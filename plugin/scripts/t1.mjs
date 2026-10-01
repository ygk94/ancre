#!/usr/bin/env node
// Test T1 (porte P3): does the x402 facilitator settle a payment from an ERC-1271 payer whose isValidSignature
// burns 78 k / 190 k gas (the cost of ANCRE's isTrusted), and what happens on a refusal?
//
//   node scripts/t1.mjs --local                    dry run: anvil --network monad fork of the testnet, the facilitator
//                                                  emulated as x402-rs does it (eth_call, then eth_estimateGas, then send
//                                                  with that limit). NO real transaction. Also the TS <-> Solidity check.
//   T1_GO=hugo node scripts/t1.mjs --live \        REAL testnet run against https://x402-facilitator.molandak.org
//       --account <keystore> --provider 0xP --payer 0x… --oracle 0x… [--probe-cap]
//                                                  after `forge script script/t1/T1.s.sol` (T1_STEP=deploy) by Hugo.
//
// Uses the plugin's own library (dist/lib): the same blob and typed data as `mm ancre pay`.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  bytesToHex, createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, getAddress, hashTypedData,
  http, keccak256, parseAbi, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ancrePaymentTypedData, encodeExactBlob, usdcAuthorizationDigest, REASONS } from "../dist/lib/payer.js";
import { buildPaymentPayload } from "../dist/lib/x402.js";
import { payerAbi } from "../dist/lib/payerAbi.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(`--${n}`);
const LIVE = has("live");
const ROOT = new URL("../../contracts/", import.meta.url).pathname;
const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const TESTNET = "https://testnet-rpc.monad.xyz";
const FACILITATOR = flag("facilitator", "https://x402-facilitator.molandak.org");
const FAC = getAddress("0x7f6a2850669202519f0FE8aa912451238820Db86");
const USDC = getAddress("0x534b2f3A21130d7a60830c2Df862319e593943A3");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const UPTO = getAddress("0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002");
const CHAIN_ID = 10143;
const NETWORK = "eip155:10143";
const AGENT_ID = 1n; // inside T1Oracle
// anvil's well-known dev accounts: only ever used against the local fork
const DEV_D = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEV_P = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

const usdcAbi = parseAbi([
  "function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
  "function balanceOf(address) view returns (uint256)",
]);
const uptoAbi = parseAbi([
  "struct TokenPermissions { address token; uint256 amount; }",
  "struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }",
  "struct Witness { address to; address facilitator; uint256 validAfter; }",
  "function settle(PermitTransferFrom permit, uint256 amount, address owner, Witness witness, bytes signature)",
]);
const oracleAbi = parseAbi(["function setBurn(uint256)", "function setAgent(uint256,address,bool,uint8)"]);

const log = [];
const note = (scene, data) => { const e = { scene, at: new Date().toISOString(), ...data }; log.push(e); console.log(JSON.stringify(e, (_, v) => (typeof v === "bigint" ? v.toString() : v))); };

// ------------------------------------------------------------------ environment
let anvil;
async function startAnvil() {
  const port = flag("port", "8546");
  anvil = spawn(`${FOUNDRY}/anvil`, ["--network", "monad", "--fork-url", TESTNET, "--chain-id", String(CHAIN_ID),
    "--port", port, "--timeout", "120000", "--retries", "10", "--silent"], { stdio: "ignore" });
  const rpc = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try { await createPublicClient({ transport: http(rpc) }).getChainId(); return rpc; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("anvil did not start");
}

function forgeScript(rpc, env, auth) {
  const out = execFileSync(`${FOUNDRY}/forge`, ["script", "script/t1/T1.s.sol", "--rpc-url", rpc, ...auth, "--broadcast",
    "--gas-estimate-multiplier", "110", "--slow"], { cwd: ROOT, env: { ...process.env, ...env, ETH_RPC_TIMEOUT: "900" }, encoding: "utf8" });
  const grab = (k) => (out.match(new RegExp(`${k}=(0x[0-9a-fA-F]{40})`)) || [])[1];
  return { oracle: grab("T1_ORACLE"), payer: grab("T1_PAYER"), out };
}

/** FiatToken v2.2 keeps balances in balanceAndBlacklistStates (slot 9): set D's test USDC on the fork only. */
async function dealUsdc(rpc, pub, who, amount) {
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, 9n]));
  await pub.request({ method: "anvil_setStorageAt", params: [USDC, slot, toHex(amount, { size: 32 })] });
  const b = await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [who] });
  if (b !== amount) throw new Error(`USDC balance slot guess wrong (got ${b})`);
}

// ------------------------------------------------------------------ the facilitator (real, or x402-rs emulated)
function exactCall(auth, blob) {
  return encodeFunctionData({ abi: usdcAbi, functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, blob] });
}

async function emulated(pub, phase, to, data) {
  // /verify = eth_call of the settlement; /settle = estimate_gas then send with that limit, no re-simulation (x402-rs)
  if (phase === "verify") {
    try {
      await pub.call({ account: FAC, to, data });
      return { ok: true, phase };
    } catch (e) {
      return { ok: false, phase, error: (e.shortMessage || e.message).slice(0, 300) };
    }
  }
  let gas;
  try {
    gas = await pub.estimateGas({ account: FAC, to, data });
  } catch (e) {
    return { ok: false, phase: "estimate", error: (e.shortMessage || e.message).slice(0, 300), broadcast: false };
  }
  await pub.request({ method: "anvil_impersonateAccount", params: [FAC] });
  await pub.request({ method: "anvil_setBalance", params: [FAC, toHex(10n ** 20n)] });
  const w = createWalletClient({ account: FAC, transport: http(pub.transport.url) });
  const hash = await w.sendTransaction({ to, data, gas, chain: null });
  const r = await pub.waitForTransactionReceipt({ hash });
  const tx = await pub.getTransaction({ hash });
  return { ok: r.status === "success", phase, hash, gasLimit: tx.gas, gasUsed: r.gasUsed, status: r.status };
}

async function facilitator(pub, phase, kind, payload, requirements) {
  if (!LIVE) {
    if (kind === "exact") return emulated(pub, phase, USDC, exactCall(payload._auth, payload.payload.signature));
    const u = payload._upto;
    const data = encodeFunctionData({ abi: uptoAbi, functionName: "settle", args: [
      { permitted: { token: USDC, amount: u.cap }, nonce: u.nonce, deadline: u.deadline },
      phase === "verify" ? u.cap : BigInt(requirements.amount), u.from, { to: u.to, facilitator: FAC, validAfter: u.validAfter }, payload.payload.signature] });
    return emulated(pub, phase, UPTO, data);
  }
  const { _auth, _upto, ...wire } = payload;
  const body = JSON.stringify({ x402Version: 2, paymentPayload: wire, paymentRequirements: requirements });
  const nonceBefore = await pub.getTransactionCount({ address: FAC });
  const res = await fetch(`${FACILITATOR}/${phase}`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
  const out = { ok: res.ok && (json.isValid === true || json.success === true), phase, httpStatus: res.status, response: json };
  if (phase === "settle") {
    out.facilitatorNonceDelta = (await pub.getTransactionCount({ address: FAC })) - nonceBefore; // 0 => nothing broadcast by them
    if (json.transaction) {
      const r = await pub.waitForTransactionReceipt({ hash: json.transaction });
      const tx = await pub.getTransaction({ hash: json.transaction });
      Object.assign(out, { hash: json.transaction, gasLimit: tx.gas, gasUsed: r.gasUsed, status: r.status });
    }
  }
  return out;
}

// ------------------------------------------------------------------ signing (dev key locally, keystore live)
async function signTyped(td, devAccount) {
  if (!LIVE) return devAccount.signTypedData(td);
  mkdirSync("t1-results", { recursive: true });
  const f = "t1-results/typed.json";
  writeFileSync(f, JSON.stringify(td, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  return execFileSync(`${FOUNDRY}/cast`, ["wallet", "sign", "--data", "--from-file", f, "--account", flag("account")], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }).trim();
}

async function admin(walletLocal, pub, to, abi, functionName, fnArgs, gas) {
  if (!LIVE) {
    const hash = await walletLocal.writeContract({ address: to, abi, functionName, args: fnArgs, gas, chain: null });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`admin ${functionName} reverted (gas limit ${gas}, used ${r.gasUsed})`);
    return r.gasUsed;
  }
  const sig = abi.find((x) => x.name === functionName);
  const s = `${functionName}(${sig.inputs.map((i) => i.type).join(",")})`;
  const out = execFileSync(`${FOUNDRY}/cast`, ["send", to, s, ...fnArgs.map(String), "--account", flag("account"), "--rpc-url", TESTNET,
    "--gas-limit", String(gas), "--json"], { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  const r = JSON.parse(out);
  if (r.status !== "0x1" && r.status !== 1 && r.status !== "1") throw new Error(`admin ${functionName} reverted: ${r.transactionHash}`);
  return BigInt(r.gasUsed);
}

// ------------------------------------------------------------------ scenes
function exactPayload(payer, provider, value, now) {
  const auth = { from: payer, to: provider, value, validAfter: BigInt(now - 600), validBefore: BigInt(now + 120), nonce: bytesToHex(randomBytes(32)) };
  return auth;
}

async function payExact(ctx, label, value = 1000n, { settle = true, between } = {}) {
  const now = Number((await ctx.pub.getBlock()).timestamp);
  const auth = exactPayload(ctx.payer, ctx.provider, value, now);
  const td = ancrePaymentTypedData(CHAIN_ID, auth, AGENT_ID);
  const sig = await signTyped(td, ctx.dev);
  const blob = encodeExactBlob(auth, AGENT_ID, sig);
  // TS <-> Solidity: the contract recomputes both digests from the blob
  const opDigest = await ctx.pub.readContract({ address: ctx.payer, abi: payerAbi, functionName: "paymentDigest",
    args: [auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, AGENT_ID] });
  const digest = usdcAuthorizationDigest(CHAIN_ID, USDC, auth);
  const [reason] = await ctx.pub.readContract({ address: ctx.payer, abi: payerAbi, functionName: "explain", args: [digest, blob] });
  const requirements = { scheme: "exact", network: NETWORK, amount: value.toString(), asset: USDC, payTo: ctx.provider,
    maxTimeoutSeconds: 120, extra: { name: "USDC", version: "2" } };
  const pr = { x402Version: 2, resource: { url: "https://ancre.local/t1" }, accepts: [requirements] };
  const payload = { ...buildPaymentPayload(pr, requirements, auth, blob, "https://ancre.local/t1"), _auth: auth };
  const verify = await facilitator(ctx.pub, "verify", "exact", payload, requirements);
  if (between) await between();
  const out = { tsSolidityDigestMatch: opDigest === hashTypedData(td), explainBefore: REASONS[Number(reason)], verify };
  if (settle) out.settle = await facilitator(ctx.pub, "settle", "exact", payload, requirements);
  note(label, out);
  return out;
}

async function payUpto(ctx, label, cap = 5000n, amount = 1000n) {
  const now = Number((await ctx.pub.getBlock()).timestamp);
  const u = { from: ctx.payer, to: ctx.provider, cap, nonce: BigInt(bytesToHex(randomBytes(32))), deadline: BigInt(now + 120), validAfter: 0n };
  const td = {
    types: {
      EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
      AncreUptoPayment: [{ name: "to", type: "address" }, { name: "cap", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
        { name: "facilitator", type: "address" }, { name: "validAfter", type: "uint256" }, { name: "agentId", type: "uint256" }],
    },
    primaryType: "AncreUptoPayment",
    domain: { name: "ANCRE TrustGatedPayer", version: "1", chainId: CHAIN_ID, verifyingContract: ctx.payer },
    message: { to: u.to, cap, nonce: u.nonce, deadline: u.deadline, facilitator: FAC, validAfter: 0n, agentId: AGENT_ID },
  };
  const sig = await signTyped(td, ctx.dev);
  const { encodePacked } = await import("viem");
  const blob = encodePacked(["uint8", "uint256", "address", "uint256", "uint256", "uint256", "address", "uint256", "bytes"],
    [2, AGENT_ID, u.to, cap, u.nonce, u.deadline, FAC, 0n, sig]);
  const accepted = { scheme: "upto", network: NETWORK, amount: cap.toString(), asset: USDC, payTo: ctx.provider, maxTimeoutSeconds: 120, extra: { facilitatorAddress: FAC } };
  const payload = {
    x402Version: 2, resource: { url: "https://ancre.local/t1-upto" }, accepted,
    payload: { signature: blob, permit2Authorization: { permitted: { token: USDC, amount: cap.toString() }, from: ctx.payer, spender: UPTO,
      nonce: toHex(u.nonce, { size: 32 }), deadline: u.deadline.toString(), witness: { to: u.to, facilitator: FAC, validAfter: "0" } } },
    _upto: u,
  };
  const verify = await facilitator(ctx.pub, "verify", "upto", payload, accepted);
  const settle = await facilitator(ctx.pub, "settle", "upto", payload, { ...accepted, amount: amount.toString() });
  note(label, { verify, settle });
}

async function main() {
  if (LIVE && process.env.T1_GO !== "hugo") {
    console.error("REFUSED: --live sends real testnet transactions and calls the real facilitator. Set T1_GO=hugo only with Hugo's explicit approval.");
    process.exit(2);
  }
  const rpc = LIVE ? TESTNET : await startAnvil();
  const pub = createPublicClient({ transport: http(rpc) });
  const dev = privateKeyToAccount(DEV_D);
  const wallet = createWalletClient({ account: dev, transport: http(rpc) });
  let ctx;
  try {
    if (LIVE) {
      ctx = { pub, dev, payer: getAddress(flag("payer")), oracle: getAddress(flag("oracle")), provider: getAddress(flag("provider")) };
    } else {
      await dealUsdc(rpc, pub, dev.address, 1_000_000n);
      const d = forgeScript(rpc, { T1_STEP: "deploy", T1_PROVIDER: DEV_P, T1_FUND: "100000" }, ["--private-key", DEV_D]);
      ctx = { pub, dev, payer: getAddress(d.payer), oracle: getAddress(d.oracle), provider: DEV_P };
      note("T1-1..3 deploy (forge script, as live)", { payer: ctx.payer, oracle: ctx.oracle,
        payerUsdc: await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [ctx.payer] }) });
    }
    const setBurn = (b) => admin(wallet, pub, ctx.oracle, oracleAbi, "setBurn", [b], 60_000n);
    const setTrusted = (t) => admin(wallet, pub, ctx.oracle, oracleAbi, "setAgent", [AGENT_ID, ctx.provider, t, 0], 120_000n);

    await payExact(ctx, "T1-4 exact, burn 78k (assess without veto)");
    note("T1-5 setBurn", { gasUsed: await setBurn(190_000n) });
    await payExact(ctx, "T1-6 exact, burn 190k (assess with veto, k=8)");
    if (has("probe-cap")) {
      await setBurn(2_000_000n);
      await payExact(ctx, "T1-7 exact, burn 2M (probe of a facilitator gas cap)");
      await setBurn(190_000n);
    }
    await setTrusted(false);
    await payExact(ctx, "T1-8 refused at /verify (untrusted)", 1000n, { settle: false });
    await setTrusted(true);
    await payExact(ctx, "T1-9 breaker: verify OK, then untrusted, then settle", 1000n, { between: () => setTrusted(false) });
    await setTrusted(true);
    note("T1-11a approvePermit2", { gasUsed: await admin(wallet, pub, ctx.payer, payerAbi, "approvePermit2", [2n ** 256n - 1n], 150_000n) });
    await payUpto(ctx, "T1-11 upto, cap 5000, settle 1000");
  } finally {
    mkdirSync("t1-results", { recursive: true });
    const f = `t1-results/${LIVE ? "live" : "local"}-${Date.now()}.json`;
    writeFileSync(f, JSON.stringify(log, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    console.error(`results: ${f}`);
    if (anvil) anvil.kill();
  }
}

main().catch((e) => { console.error(e); if (anvil) anvil.kill(); process.exit(1); });

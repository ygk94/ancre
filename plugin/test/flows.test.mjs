import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, decodeFunctionData, erc20Abi, keccak256, toHex, slice } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkFlow, inspectFlow, payFlow, statusFlow, fundFlow, FUND_GAS } from "../dist/lib/flows.js";
import { encodeB64Json, decodeB64Json } from "../dist/lib/x402.js";
import { usdcAuthorizationDigest } from "../dist/lib/payer.js";

const PAYER = getAddress("0x00000000000000000000000000000000000000aa");
const USDC = getAddress("0x754704Bc059F8C67012fEd69BC8A327a5aafb603");
const PAYTO = getAddress("0x00000000000000000000000000000000000000b0");
const ID = getAddress("0x00000000000000000000000000000000000000cc");
const ANCRE = getAddress("0x00000000000000000000000000000000000000dd");
const REP = getAddress("0x00000000000000000000000000000000000000ee");
const cfg = { chainId: 143, network: "eip155:143", usdc: USDC, payer: PAYER };
const op = privateKeyToAccount("0x" + "11".repeat(32));
const A = (o = {}) => ({ status: 0, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 0, triggerTag: "0x" + "00".repeat(32), trustLow: 0n, distrustUp: 0n, eLow: 0n, trusted: false, ...o });

/** stub world: per-function answers, every call recorded */
function world({ decide = [0, A({ trusted: true, trust: 10n ** 17n })], balance = 10n ** 6n, operator = op.address, explain, settle = 200 } = {}) {
  const calls = [];
  const fetches = [];
  const signs = [];
  const sends = [];
  const offer = { scheme: "exact", network: "eip155:143", amount: "10000", asset: USDC, payTo: PAYTO, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2", erc8004AgentId: "12" } };
  const deps = {
    readContract: async ({ address, functionName, args }) => {
      calls.push({ address, functionName, args });
      switch (functionName) {
        case "identity": return ID;
        case "getAgentWallet": return PAYTO;
        case "decide": return decide;
        case "maxPerPayment": return 1_000_000n;
        case "balanceOf": return balance;
        case "isOperator": return getAddress(args[0]) === getAddress(operator);
        case "explain": return explain ?? [9, 1, 12n, PAYTO, 10000n, A({ status: 4, vetoCount: 1, triggerTag: keccak256(toHex("veto")) })];
        case "ancre": return ANCRE;
        case "reputation": return REP;
        case "getClients": return [PAYTO, PAYER];
        case "getSummary": return [2n, 100n, 0];
        case "owner": return getAddress("0x00000000000000000000000000000000000000e1");
        case "treasury": return getAddress("0x00000000000000000000000000000000000000e2");
        case "operators": return [op.address, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"];
        case "paused": return false;
        case "setId": return "0x" + "ab".repeat(32);
        case "usdc": return USDC;
        case "policyOf": return { theta: 10n ** 17n, rhoN: 1, rhoD: 2, minAnchors: 2, vetoQuorum: 1, maxAge: 1000n, registryVerified: true };
        default: throw new Error("unexpected " + functionName);
      }
    },
    fetch: async (url, init = {}) => {
      fetches.push({ url, init });
      const paid = init.headers && init.headers["payment-signature"];
      if (!paid) return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": encodeB64Json({ x402Version: 2, resource: { url }, accepts: [offer] }) } });
      if (settle === 200) return new Response('{"quote":42}', { status: 200, headers: { "PAYMENT-RESPONSE": encodeB64Json({ success: true, transaction: "0x" + "77".repeat(32), network: "eip155:143", payer: PAYER }) } });
      return new Response('{"isValid":false,"invalidReason":"unexpected_error","invalidReasonDetails":"execution reverted: FiatTokenV2: invalid signature"}', { status: settle });
    },
    nowSec: () => 1_900_000_000,
    random32: () => keccak256(toHex("nonce")),
    signTypedData: async (td, summary, details) => { signs.push({ td, summary, details }); return op.signTypedData(td); },
    sendTransaction: async (tx, summary) => { sends.push({ tx, summary }); return { hash: "0x" + "55".repeat(32), status: "CONFIRMED" }; },
  };
  return { deps, calls, fetches, signs, sends };
}

test("check: decide(agentId, agentWallet, amount); --naive adds the all-clients getSummary", async () => {
  const w = world();
  const r = await checkFlow(w.deps, cfg, 12n, 0n, true);
  assert.equal(r.verdict, "PAY");
  const d = w.calls.find((c) => c.functionName === "decide");
  assert.deepEqual(d.args, [12n, PAYTO, 0n]);
  assert.equal(r.naive.clients, 2);
  assert.equal(r.naive.count, "2");
});

test("inspect: shows what would be signed, never signs", async () => {
  const w = world();
  const r = await inspectFlow(w.deps, cfg, "https://p/quote");
  assert.equal(r.agentId, "12", "from the proposed extra.erc8004AgentId");
  assert.equal(r.wouldSign.primaryType, "AncrePayment");
  assert.equal(r.balanceOk, true);
  assert.equal(w.signs.length, 0);
  assert.equal(w.fetches.length, 1);
});

test("pay: refuses without --confirm before any network call", async () => {
  const w = world();
  await assert.rejects(payFlow(w.deps, cfg, "https://p/quote", { confirm: false }), (e) => e.code === "ANCRE_CONFIRM_REQUIRED");
  assert.equal(w.fetches.length, 0);
});

test("pay (soft guard): UNTRUSTED -> nothing signed, no paid request", async () => {
  const w = world({ decide: [10, A()] });
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.paid, false);
  assert.equal(r.signed, false);
  assert.equal(r.verdict, "UNTRUSTED");
  assert.equal(w.signs.length, 0, "the wallet is never asked to sign");
  assert.equal(w.fetches.length, 1);
});

test("pay (soft guard): VETOED / WALLET_MISMATCH / OVER_LIMIT never sign either", async () => {
  for (const [code, a, verdict] of [[9, A({ status: 4 }), "VETOED"], [7, A(), "WALLET_MISMATCH"], [5, A({ trusted: true }), "OVER_LIMIT"]]) {
    const w = world({ decide: [code, a] });
    const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
    assert.equal(r.verdict, verdict);
    assert.equal(w.signs.length, 0, verdict);
  }
});

test("pay: PAY -> one AncrePayment signature, x402 retry with from = payer and the 246-byte blob", async () => {
  const w = world();
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.paid, true);
  assert.equal(r.transaction, "0x" + "77".repeat(32));
  assert.equal(w.signs.length, 1);
  assert.match(w.signs[0].summary, /Pay 0\.01 USDC to ERC-8004 agent #12/);
  assert.equal(w.fetches.length, 2, "one challenge, one paid request, no retry");
  const p = decodeB64Json(w.fetches[1].init.headers["payment-signature"]);
  assert.equal(p.x402Version, 2);
  assert.equal(p.payload.authorization.from, PAYER);
  assert.equal(p.payload.authorization.to, PAYTO);
  assert.equal((p.payload.signature.length - 2) / 2, 246);
  assert.equal(slice(p.payload.signature, 0, 1), "0x01");
  assert.equal(p.accepted.payTo, PAYTO);
});

test("pay: a signer that is not an operator is caught before the paid request", async () => {
  const w = world({ operator: getAddress("0x00000000000000000000000000000000000000f0") });
  await assert.rejects(payFlow(w.deps, cfg, "https://p/quote", { confirm: true }), (e) => e.code === "ANCRE_NOT_OPERATOR");
  assert.equal(w.fetches.length, 1);
});

test("pay (hard guard): settlement refused -> explain(digest, blob) at this block, no retry", async () => {
  const w = world({ settle: 500 });
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.paid, false);
  assert.equal(r.signed, true);
  assert.equal(r.settlementError.httpStatus, 500);
  assert.equal(r.explainAfterFailure.verdict, "VETOED");
  assert.equal(r.explainAfterFailure.triggerTag, "veto");
  const ex = w.calls.find((c) => c.functionName === "explain");
  const blob = decodeB64Json(w.fetches[1].init.headers["payment-signature"]).payload.signature;
  assert.equal(ex.args[1], blob);
  const a = decodeB64Json(w.fetches[1].init.headers["payment-signature"]).payload.authorization;
  const auth = { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce };
  assert.equal(ex.args[0], usdcAuthorizationDigest(143, USDC, auth));
  assert.equal(w.fetches.length, 2);
});

test("pay: unfunded payer -> no signature", async () => {
  const w = world({ balance: 5n });
  await assert.rejects(payFlow(w.deps, cfg, "https://p/quote", { confirm: true }), (e) => e.code === "ANCRE_PAYER_UNFUNDED");
  assert.equal(w.signs.length, 0);
});

test("payer fund: one USDC.transfer(payer) with an explicit gas limit, only with --confirm", async () => {
  const w = world();
  await assert.rejects(fundFlow(w.deps, cfg, 100_000n, false), (e) => e.code === "ANCRE_CONFIRM_REQUIRED");
  const r = await fundFlow(w.deps, cfg, 100_000n, true);
  assert.equal(w.sends.length, 1);
  const { tx } = w.sends[0];
  assert.equal(tx.to, USDC);
  assert.equal(tx.gas, FUND_GAS);
  assert.equal(tx.value, 0n);
  const dec = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  assert.equal(dec.functionName, "transfer");
  assert.deepEqual(dec.args, [PAYER, 100_000n]);
  assert.equal(r.amountUsdc, "0.1");
});

test("payer status: flags a wallet that is not an operator", async () => {
  const w = world();
  const ok = await statusFlow(w.deps, cfg, op.address);
  assert.equal(ok.walletIsOperator, true);
  assert.deepEqual(ok.operators, [op.address]);
  const bad = await statusFlow(w.deps, cfg, getAddress("0x00000000000000000000000000000000000000f0"));
  assert.equal(bad.walletIsOperator, false);
  assert.ok(bad.guardModeChecklist.some((l) => l.startsWith("WARNING")));
  await assert.rejects(statusFlow(w.deps, { ...cfg, usdc: PAYTO }), (e) => e.code === "ANCRE_WRONG_CHAIN");
});

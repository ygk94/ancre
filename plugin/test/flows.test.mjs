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
const A = (o = {}) => ({ status: 0, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 0, triggerTag: "0x" + "00".repeat(32), trustLow: 0n, distrustUp: 0n, eLow: 0n, passesPolicy: false, ...o });

/** stub world: per-function answers, every call recorded */
function world({ decide = [0, A({ passesPolicy: true, trust: 10n ** 17n })], balance = 10n ** 6n, operator = op.address, explain, settle = 200, used = false, maxPer = 1_000_000n } = {}) {
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
        case "maxPerPayment": return maxPer;
        case "authorizationState": if (used instanceof Error) throw used; return used;
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
      if (settle === "verify") return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodeB64Json({ x402Version: 2, error: "invalid_exact_evm_payload_signature", resource: { url }, accepts: [offer] }) } });
      if (typeof settle === "function") return settle();
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
  for (const [code, a, verdict] of [[9, A({ status: 4 }), "VETOED"], [7, A(), "WALLET_MISMATCH"], [5, A({ passesPolicy: true }), "OVER_LIMIT"]]) {
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
  assert.equal(r.outcome, "PAID");
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
  const ok = await statusFlow(w.deps, cfg, op.address, "server");
  assert.equal(ok.walletIsOperator, true);
  assert.deepEqual(ok.guarantee.map((g) => g.ok), [true, false, true, true, null], "the stub gives the wallet 1 USDC: flagged");
  assert.equal((await statusFlow(w.deps, cfg, op.address, "byok")).guarantee[0].ok, false);
  assert.deepEqual(ok.operators, [op.address]);
  const bad = await statusFlow(w.deps, cfg, getAddress("0x00000000000000000000000000000000000000f0"));
  assert.equal(bad.walletIsOperator, false);
  assert.ok(bad.guardModeChecklist.some((l) => l.startsWith("WARNING")));
  await assert.rejects(statusFlow(w.deps, { ...cfg, usdc: PAYTO }), (e) => e.code === "ANCRE_WRONG_CHAIN");
});

test("pay: a /verify refusal whose explain says OK is reported SETTLEMENT_FAILED, never PAY, with no override note (K18)", async () => {
  const w = world({ settle: "verify", explain: [0, 1, 12n, PAYTO, 10000n, A({ passesPolicy: true })] });
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.outcome, "REFUSED");
  assert.equal(r.explainAfterFailure.verdict, "SETTLEMENT_FAILED");
  assert.equal(r.explainAfterFailure.pay, false);
  assert.equal(r.humanOverride, undefined, "the override would answer ANCRE_OVERRIDE_NOT_NEEDED: no note pointing there");
  assert.ok(r.liveAuthorization.validBefore, "the live authorisation is reported");
});

test("pay: 200 without PAYMENT-RESPONSE is UNKNOWN, not paid", async () => {
  const w = world();
  const orig = w.deps.fetch;
  w.deps.fetch = async (url, init = {}) => (init.headers ? new Response("{}", { status: 200 }) : orig(url, init));
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.outcome, "UNKNOWN");
  assert.equal(r.paid, false);
  assert.ok(r.liveAuthorization);
});

test("pay: an RPC failure after sending keeps signed=true and the live authorisation, and claims nothing", async () => {
  const w = world({ settle: 500, used: new Error("429") });
  const orig = w.deps.readContract;
  w.deps.readContract = async (a) => { if (a.functionName === "explain") throw new Error("429"); return orig(a); };
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.signed, true);
  assert.equal(r.outcome, "UNKNOWN", "neither the nonce nor explain could be read: no 'Not paid'");
  assert.equal(r.nonceUsed, undefined);
  assert.equal(r.explainAfterFailure, undefined);
  assert.ok(r.liveAuthorization);
});

// ---------------------------------------------------------------- revue max 2026-10-06 (plugin-revue)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileJournal, readJournal } from "../dist/lib/journal.js";
import { hostDeps } from "../dist/lib/host.js";

const journaled = (w) => {
  const path = join(mkdtempSync(join(tmpdir(), "ancre-j-")), "journal.jsonl");
  w.deps.journal = fileJournal(path);
  return () => readJournal(path);
};
const OK_TX = "0x" + "77".repeat(32);
const settledHeader = (o = {}) => ({ "PAYMENT-RESPONSE": encodeB64Json({ success: true, transaction: OK_TX, network: "eip155:143", payer: PAYER, ...o }) });

test("K15: upfront flow, HTTP 500 with a successful PAYMENT-RESPONSE -> PAID (no 'Not paid', no override note)", async () => {
  const w = world({ settle: () => new Response("handler crashed", { status: 500, headers: settledHeader() }) });
  const log = journaled(w);
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.outcome, "PAID");
  assert.equal(r.paid, true);
  assert.equal(r.transaction, OK_TX);
  assert.equal(r.humanOverride, undefined);
  assert.equal(r.liveAuthorization, undefined);
  assert.deepEqual(log().map((e) => e.kind), ["paid"]);
});

test("A4a: after a signed payment, no proof in the response -> USDC.authorizationState(payer, nonce) decides", async () => {
  // settlement_pending with a broadcast hash (x402 2.27), a facilitator timeout after broadcast, a proxy 504
  const pending = () => new Response("{}", { status: 402, headers: { "PAYMENT-RESPONSE": encodeB64Json({ success: false, errorReason: "settlement_pending", transaction: OK_TX }) } });
  const timeout = () => new Response("{}", { status: 402, headers: { "PAYMENT-RESPONSE": encodeB64Json({ success: false, errorReason: "unexpected_settle_error" }) } });
  const proxy = () => new Response("gateway timeout", { status: 504 });
  for (const [name, settle] of [["pending", pending], ["timeout", timeout], ["504", proxy]]) {
    // nonce consumed on-chain: it was paid, whatever the response said
    const w1 = world({ settle, used: true, explain: [0, 1, 12n, PAYTO, 10000n, A({ passesPolicy: true })] });
    const log1 = journaled(w1);
    const r1 = await payFlow(w1.deps, cfg, "https://p/quote", { confirm: true });
    assert.equal(r1.outcome, "PAID", name);
    assert.equal(r1.nonceUsed, true);
    assert.deepEqual(log1().map((e) => e.kind), ["paid"], name);
    const q = w1.calls.find((c) => c.functionName === "authorizationState");
    assert.equal(q.address, USDC);
    assert.equal(q.args[0], PAYER, "the authoriser is the payer contract");
    assert.equal(q.args[1], decodeB64Json(w1.fetches[1].init.headers["payment-signature"]).payload.authorization.nonce);
    // nonce unused and the payer would accept it now: UNKNOWN with the live authorisation, never "Not paid"
    const w2 = world({ settle, used: false, explain: [0, 1, 12n, PAYTO, 10000n, A({ passesPolicy: true })] });
    const log2 = journaled(w2);
    const r2 = await payFlow(w2.deps, cfg, "https://p/quote", { confirm: true });
    assert.equal(r2.outcome, "UNKNOWN", name);
    assert.equal(r2.paid, false);
    assert.ok(r2.liveAuthorization);
    assert.equal(r2.humanOverride, undefined);
    assert.deepEqual(log2().map((e) => e.kind), ["unknown"], name);
  }
  // 2xx without PAYMENT-RESPONSE but the nonce is used: PAID
  const w3 = world({ settle: () => new Response("{}", { status: 200 }), used: true });
  assert.equal((await payFlow(w3.deps, cfg, "https://p/quote", { confirm: true })).outcome, "PAID");
  // the paid GET throws (connection cut after the signature was sent) but the nonce is used: PAID
  const w4 = world({ used: true });
  const f4 = w4.deps.fetch;
  w4.deps.fetch = async (url, init = {}) => { if (init.headers) throw new Error("socket hang up"); return f4(url, init); };
  assert.equal((await payFlow(w4.deps, cfg, "https://p/quote", { confirm: true })).outcome, "PAID");
});

test("K18: the override note only follows a refusal the override accepts", async () => {
  // a veto between verify and settle (explain VETOED, nonce unused): REFUSED with the note
  const w1 = world({ settle: 500 });
  const r1 = await payFlow(w1.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r1.outcome, "REFUSED");
  assert.equal(r1.explainAfterFailure.verdict, "VETOED");
  assert.match(r1.humanOverride, /Only the human/);
  // a bad operator signature (high-s, wrong login) or a facilitator failure: no note
  const w2 = world({ settle: "verify", explain: [8, 1, 12n, PAYTO, 10000n, A({ passesPolicy: true })] });
  const r2 = await payFlow(w2.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r2.explainAfterFailure.verdict, "BAD_OPERATOR_SIG");
  assert.equal(r2.humanOverride, undefined);
});

test("K19: an offer above maxPerPayment reaches decide (OVER_LIMIT), is journaled and points to the override", async () => {
  const w = world({ maxPer: 5_000n, decide: [5, A({ passesPolicy: true })] });
  const log = journaled(w);
  const r = await payFlow(w.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r.verdict, "OVER_LIMIT");
  assert.equal(r.outcome, "NOT_SIGNED");
  assert.match(r.humanOverride, /Only the human/);
  assert.equal(w.signs.length, 0);
  assert.deepEqual(log().map((e) => [e.kind, e.verdict]), [["refusal", "OVER_LIMIT"]]);
  assert.equal(w.calls.some((c) => c.functionName === "maxPerPayment"), false, "selectOffer no longer filters on it");
});

test("M1: every exit of pay is journaled (paid GET failure, non-operator signer, wallet refusal, RPC error)", async () => {
  const w1 = world();
  const l1 = journaled(w1);
  const f1 = w1.deps.fetch;
  w1.deps.fetch = async (url, init = {}) => { if (init.headers) throw new Error("socket hang up"); return f1(url, init); };
  const r1 = await payFlow(w1.deps, cfg, "https://p/quote", { confirm: true });
  assert.equal(r1.outcome, "UNKNOWN");
  assert.deepEqual(l1().map((e) => e.kind), ["unknown"]);
  assert.match(l1()[0].detail, /socket hang up/);

  const w2 = world({ operator: getAddress("0x00000000000000000000000000000000000000f0") });
  const l2 = journaled(w2);
  await assert.rejects(payFlow(w2.deps, cfg, "https://p/quote", { confirm: true }), (e) => e.code === "ANCRE_NOT_OPERATOR");
  assert.deepEqual(l2().map((e) => [e.kind, e.agentId, e.verdict]), [["pay_aborted", "12", "PAY"]]);
  assert.match(l2()[0].detail, /^ANCRE_NOT_OPERATOR/);

  const w3 = world();
  const l3 = journaled(w3);
  w3.deps.signTypedData = async () => { throw Object.assign(new Error("DENIED by policy"), { code: "WALLET_DENIED" }); };
  await assert.rejects(payFlow(w3.deps, cfg, "https://p/quote", { confirm: true }), /DENIED/);
  assert.deepEqual(l3().map((e) => e.kind), ["pay_aborted"]);
  assert.match(l3()[0].detail, /^WALLET_DENIED/);

  const w4 = world();
  const l4 = journaled(w4);
  const r4 = w4.deps.readContract;
  w4.deps.readContract = async (a) => { if (a.functionName === "decide") throw new Error("429"); return r4(a); };
  await assert.rejects(payFlow(w4.deps, cfg, "https://p/quote", { confirm: true }), (e) => e.code === "ANCRE_RPC_ERROR");
  assert.deepEqual(l4().map((e) => e.kind), ["pay_aborted"]);

  // the unfunded refusal stays a single entry
  const w5 = world({ balance: 5n });
  const l5 = journaled(w5);
  await assert.rejects(payFlow(w5.deps, cfg, "https://p/quote", { confirm: true }), (e) => e.code === "ANCRE_PAYER_UNFUNDED");
  assert.deepEqual(l5().map((e) => [e.kind, e.detail]), [["refusal", "payer unfunded"]]);
});

test("K17: check reports an RPC error on getAgentWallet, never WALLET_MISMATCH", async () => {
  const w = world();
  const orig = w.deps.readContract;
  w.deps.readContract = async (a) => { if (a.functionName === "getAgentWallet") throw new Error("429 Too Many Requests"); return orig(a); };
  await assert.rejects(checkFlow(w.deps, cfg, 12n, 0n, false), (e) => e.code === "ANCRE_RPC_ERROR" && /getAgentWallet/.test(e.message));
  assert.equal(w.calls.some((c) => c.functionName === "decide"), false, "no decide(agentId, 0x0, …)");
});

test("K16: check --naive keeps the ANCRE verdict when the naive getSummary fails", async () => {
  const w = world({ decide: [10, A()] });
  const orig = w.deps.readContract;
  w.deps.readContract = async (a) => { if (a.functionName === "getSummary") throw new Error("request entity too large"); return orig(a); };
  const r = await checkFlow(w.deps, cfg, 182n, 0n, true);
  assert.equal(r.verdict, "UNTRUSTED");
  assert.match(r.naive.error, /too large/);
  assert.match(r.naive.note, /ALL clients/);
});

test("K20: hostDeps checks eth_chainId of --rpc-url (and of the gateway) against --chain-id", async () => {
  const ctx = (id) => ({ publicClient: () => ({ readContract: async () => 0, getChainId: async () => id }) });
  await assert.rejects(hostDeps(ctx(10143), {}, cfg, null), (e) => e.code === "ANCRE_WRONG_CHAIN");
  assert.ok((await hostDeps(ctx(143), {}, cfg, null)).readContract);
  // a plain RPC that answers eth_chainId = 10143 (the forgotten testnet ANCRE_RPC_URL of the PoC)
  const { createServer } = await import("node:http");
  const srv = createServer((q, s) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => {
    const m = JSON.parse(b); s.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: "0x279f" })); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    await assert.rejects(hostDeps({}, {}, cfg, null, `http://127.0.0.1:${srv.address().port}`), (e) => e.code === "ANCRE_WRONG_CHAIN" && /10143/.test(e.message));
  } finally {
    srv.close();
  }
});

test("K21: payer status covers every host wallet address, like the override", async () => {
  const B = getAddress("0x00000000000000000000000000000000000000e1"); // = the stub's owner: a second host address
  const w = world({ balance: 0n });
  const s1 = await statusFlow(w.deps, cfg, op.address, "server", [op.address, B]);
  assert.equal(s1.guarantee[3].ok, false, "owner is a host wallet address: not the human");
  assert.deepEqual(s1.hostWallets, [op.address, B]);
  const s2 = await statusFlow(w.deps, cfg, op.address, "server", [op.address]);
  assert.equal(s2.guarantee[3].ok, true);
  assert.equal(s2.guarantee[1].ok, true, "no USDC anywhere");
  // USDC on a non-selected host address breaks condition 2
  const w3 = world();
  const orig = w3.deps.readContract;
  w3.deps.readContract = async (a) => (a.functionName === "balanceOf" && a.args[0] !== PAYER ? (a.args[0] === B ? 5n : 0n) : orig(a));
  assert.equal((await statusFlow(w3.deps, cfg, op.address, "server", [op.address, B])).guarantee[1].ok, false);
});

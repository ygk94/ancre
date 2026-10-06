import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { hashTypedData, keccak256, toHex, size, recoverTypedDataAddress, slice, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { resolveConfig, parseUsdc, fmtUsdc, optionalUsdc, CHAINS } from "../dist/lib/config.js";
import { ancrePaymentTypedData, ancreUptoTypedData, encodeUptoBlob, encodeExactBlob, normalizeSignature, usdcAuthorizationDigest, REASONS, STATUSES } from "../dist/lib/payer.js";
import { parsePaymentRequired, selectOffer, resolveAgentId, newAuthorization, buildPaymentPayload, encodeB64Json, decodeB64Json, decodePaymentResponse } from "../dist/lib/x402.js";
import { describe as verdictOf, tagName } from "../dist/lib/verdict.js";

const PAYER = getAddress("0x00000000000000000000000000000000000000aa");
const USDC_143 = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const PAYTO = getAddress("0x00000000000000000000000000000000000000b0");

test("config: payer required, chain default 143, USDC amounts", () => {
  assert.throws(() => resolveConfig({}, {}), /No TrustGatedPayer/);
  const c = resolveConfig({ payer: PAYER.toLowerCase() }, {});
  assert.equal(c.chainId, 143);
  assert.equal(c.usdc, USDC_143);
  assert.equal(resolveConfig({}, { ANCRE_PAYER: PAYER, ANCRE_CHAIN_ID: "10143" }).network, "eip155:10143");
  assert.throws(() => resolveConfig({ chainId: "1", payer: PAYER }, {}), /Unsupported chain/);
  assert.equal(parseUsdc("0.01"), 10_000n);
  assert.equal(parseUsdc("12"), 12_000_000n);
  assert.throws(() => parseUsdc("0.0000001"));
  assert.throws(() => parseUsdc("-1"));
  assert.equal(fmtUsdc(10_000n), "0.01");
  assert.equal(fmtUsdc(1_234_500n), "1.2345");
});

test("payer enums mirror the contract", () => {
  assert.equal(REASONS.length, 11);
  assert.equal(REASONS[9], "ANCRE_STATUS");
  assert.deepEqual(STATUSES, ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"]);
});

const auth = { from: PAYER, to: PAYTO, value: 10_000n, validAfter: 1n, validBefore: 2_000_000_000n, nonce: keccak256(toHex("n")) };

test("blob layout: 246 bytes, fields at the contract's offsets", () => {
  const acct = privateKeyToAccount("0x" + "11".repeat(32));
  const sig = "0x" + "22".repeat(32) + "33".repeat(32) + "1b";
  const b = encodeExactBlob(auth, 12n, sig);
  assert.equal(size(b), 246);
  assert.equal(slice(b, 0, 1), "0x01");
  assert.equal(BigInt(slice(b, 1, 33)), 12n);
  assert.equal(slice(b, 33, 53).toLowerCase(), PAYTO.toLowerCase());
  assert.equal(BigInt(slice(b, 53, 85)), 10_000n);
  assert.equal(BigInt(slice(b, 85, 117)), 1n);
  assert.equal(BigInt(slice(b, 117, 149)), 2_000_000_000n);
  assert.equal(slice(b, 149, 181), auth.nonce);
  assert.equal(slice(b, 181, 246), sig);
  void acct;
});

test("signature normalisation: v 0/1 -> 27/28, EIP-2098 compact expanded, junk refused", async () => {
  const acct = privateKeyToAccount("0x" + "11".repeat(32));
  const td = ancrePaymentTypedData(143, auth, 12n);
  const sig = await acct.signTypedData(td);
  const low = sig.slice(0, -2) + (parseInt(sig.slice(-2), 16) - 27).toString(16).padStart(2, "0");
  assert.equal(normalizeSignature(low), sig);
  // compact: yParityAndS
  const r = sig.slice(2, 66), s = sig.slice(66, 130), v = parseInt(sig.slice(130), 16);
  const vs = (BigInt("0x" + s) | (v === 28 ? 1n << 255n : 0n)).toString(16).padStart(64, "0");
  assert.equal(normalizeSignature("0x" + r + vs), sig);
  assert.throws(() => normalizeSignature("0x1234"), /length/);
  assert.equal(await recoverTypedDataAddress({ ...td, signature: sig }), acct.address);
});

test("AncrePayment typed data: the contract's type string and domain", () => {
  const td = ancrePaymentTypedData(10143, auth, 7n);
  assert.equal(td.domain.name, "ANCRE TrustGatedPayer");
  assert.equal(td.domain.version, "1");
  assert.equal(td.domain.verifyingContract, PAYER);
  const typeStr = "AncrePayment(" + td.types.AncrePayment.map((f) => `${f.type} ${f.name}`).join(",") + ")";
  assert.equal(typeStr, "AncrePayment(address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint256 agentId)");
  assert.match(hashTypedData(td), /^0x[0-9a-f]{64}$/);
  assert.notEqual(usdcAuthorizationDigest(10143, USDC_143, auth), hashTypedData(td));
});

const offer = (o = {}) => ({ scheme: "exact", network: "eip155:143", amount: "10000", asset: USDC_143, payTo: PAYTO, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" }, ...o });
const pr = (accepts) => ({ x402Version: 2, resource: { url: "https://x/y" }, accepts });

test("parsePaymentRequired: v2 header, v1 refused, non-402 refused", () => {
  const h = new Headers({ "PAYMENT-REQUIRED": encodeB64Json(pr([offer()])) });
  assert.equal(parsePaymentRequired(402, h, "").accepts.length, 1);
  assert.throws(() => parsePaymentRequired(402, new Headers(), JSON.stringify({ x402Version: 1, accepts: [] })), (e) => e.code === "ANCRE_X402_V1");
  assert.throws(() => parsePaymentRequired(200, h, ""), (e) => e.code === "ANCRE_NOT_402");
  assert.throws(() => parsePaymentRequired(402, new Headers({ "PAYMENT-REQUIRED": "!!" }), ""), (e) => e.code === "ANCRE_BAD_CHALLENGE");
});

test("selectOffer: exact USDC on this chain, within --max-amount", () => {
  const want = { network: "eip155:143", usdc: USDC_143, maxAmount: 20_000n };
  assert.equal(selectOffer(pr([offer({ scheme: "upto" }), offer()]), want).scheme, "exact");
  for (const bad of [offer({ network: "eip155:10143" }), offer({ asset: PAYTO }), offer({ amount: "26000" }), offer({ amount: "1e6" }),
    offer({ payTo: "nope" }), offer({ extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" } }),
    offer({ extra: { name: "USD Coin", version: "2" } }), offer({ extra: {} })]) {
    assert.throws(() => selectOffer(pr([bad]), want), (e) => e.code === "ANCRE_NO_OFFER");
  }
  assert.throws(() => selectOffer(pr([offer({ amount: "30000" })]), want), /max-amount/);
  // K19: the payer's maxPerPayment is not a filter any more (decide answers OVER_LIMIT); a stray field is ignored
  assert.equal(selectOffer(pr([offer({ amount: "16000" })]), { ...want, maxPerPayment: 15_000n }).amount, "16000");
});

test("resolveAgentId: flag, else the proposed extra.erc8004AgentId, never guessed", () => {
  assert.equal(resolveAgentId("12", offer()), 12n);
  assert.equal(resolveAgentId(undefined, offer({ extra: { erc8004AgentId: "77" } })), 77n);
  assert.throws(() => resolveAgentId(undefined, offer()), (e) => e.code === "ANCRE_NO_AGENT_ID");
  assert.throws(() => resolveAgentId("abc", offer()), (e) => e.code === "ANCRE_BAD_AGENT_ID");
});

test("authorization window and payload: from = payer, signature = blob, decimal strings", () => {
  const a = newAuthorization(PAYER, offer(), 1_000_000, auth.nonce);
  assert.equal(a.validAfter, 1_000_000n - 600n);
  assert.equal(a.validBefore, 1_000_060n);
  assert.equal(newAuthorization(PAYER, offer({ maxTimeoutSeconds: "120" }), 1_000_000, auth.nonce).validBefore, 1_000_060n, "string timeout ignored");
  assert.equal(newAuthorization(PAYER, offer({ maxTimeoutSeconds: 1e9 }), 1_000_000, auth.nonce).validBefore, 1_000_300n, "clamped to 300 s");
  assert.equal(newAuthorization(PAYER, offer({ maxTimeoutSeconds: 60.5 }), 1_000_000, auth.nonce).validBefore, 1_000_060n);
  const p = buildPaymentPayload(pr([offer()]), offer(), a, "0xbeef", "https://x/y");
  assert.equal(p.x402Version, 2);
  assert.equal(p.payload.authorization.from, PAYER);
  assert.equal(p.payload.authorization.value, "10000");
  assert.equal(p.payload.signature, "0xbeef");
  assert.deepEqual(decodeB64Json(encodeB64Json(p)), p);
  const r = decodePaymentResponse(new Headers({ "PAYMENT-RESPONSE": encodeB64Json({ success: true, transaction: "0xabc" }) }));
  assert.equal(r.transaction, "0xabc");
});

const A = (o = {}) => ({ status: 0, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 0, triggerTag: "0x" + "00".repeat(32), trustLow: 0n, distrustUp: 0n, eLow: 0n, passesPolicy: false, ...o });

test("verdicts: reason x status -> what the skill does", () => {
  assert.equal(verdictOf(0, A({ passesPolicy: true }), 1n, PAYTO).verdict, "PAY");
  assert.equal(verdictOf(10, A(), 1n, PAYTO).verdict, "UNTRUSTED");
  const v = verdictOf(9, A({ status: 4, vetoCount: 1, triggerTag: keccak256(toHex("slash")) }), 1n, PAYTO);
  assert.equal(v.verdict, "VETOED");
  assert.equal(v.triggerTag, "slash");
  assert.equal(v.pay, false);
  assert.equal(verdictOf(9, A({ status: 2 }), 1n, PAYTO).verdict, "STALE");
  assert.equal(verdictOf(7, A(), 1n, PAYTO).verdict, "WALLET_MISMATCH");
  assert.equal(verdictOf(42, A(), 1n, PAYTO).verdict, "UNTRUSTED", "unknown reason fails closed");
  assert.equal(tagName(keccak256(toHex("no-such-tag"))), keccak256(toHex("no-such-tag")));
});

test("upto blob: 266 bytes at the contract's offsets", async () => {
  const acct = privateKeyToAccount("0x" + "11".repeat(32));
  const u = { from: PAYER, to: PAYTO, cap: 5000n, nonce: 7n, deadline: 2_000_000_000n, facilitator: PAYTO, validAfter: 0n };
  const sig = await acct.signTypedData(ancreUptoTypedData(10143, u, 3n));
  const b = encodeUptoBlob(u, 3n, sig);
  assert.equal(size(b), 266);
  assert.equal(slice(b, 0, 1), "0x02");
  assert.equal(BigInt(slice(b, 53, 85)), 5000n);
  assert.equal(slice(b, 149, 169).toLowerCase(), PAYTO.toLowerCase());
  assert.equal(slice(b, 201, 266), sig);
});

// ---------------------------------------------------------------- revue max 2026-10-06 (plugin-revue)
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

test("K5: a high-s operator signature is mapped to its low-s twin (same signer), which the payer accepts", async () => {
  const acct = privateKeyToAccount("0x" + "11".repeat(32));
  const td = ancrePaymentTypedData(143, auth, 12n);
  const sig = await acct.signTypedData(td); // viem: low s
  const r = sig.slice(2, 66), s = BigInt("0x" + sig.slice(66, 130)), v = parseInt(sig.slice(130), 16);
  const high = "0x" + r + (N - s).toString(16).padStart(64, "0") + (v === 27 ? "1c" : "1b");
  assert.ok(BigInt("0x" + high.slice(66, 130)) > N / 2n, "the twin is high-s");
  assert.equal(await recoverTypedDataAddress({ ...td, signature: high }), acct.address, "viem accepts high-s (why the plugin let it through)");
  const norm = normalizeSignature(high);
  assert.equal(norm, sig, "normalised back to the low-s form");
  assert.ok(BigInt("0x" + norm.slice(66, 130)) <= N / 2n);
  // in the 246-byte blob too (the payer's _recover refuses s > n/2)
  const b = encodeExactBlob(auth, 12n, high);
  assert.equal(slice(b, 181, 246), sig);
  // junk keeps an ANCRE code (SIMP7), never a raw Error
  for (const bad of ["0x1234", "0x" + "00".repeat(64) + "1d", "0x" + "11".repeat(32) + "00".repeat(32) + "1b"]) {
    assert.throws(() => normalizeSignature(bad), (e) => e.code === "ANCRE_BAD_SIGNATURE", bad);
  }
});

test("D3e: an empty --max-amount / --amount is an error, never 'no cap'", () => {
  assert.equal(optionalUsdc(undefined), undefined);
  assert.equal(optionalUsdc(null), undefined);
  assert.equal(optionalUsdc("0.25"), 250_000n);
  assert.throws(() => optionalUsdc(""), (e) => e.code === "ANCRE_BAD_AMOUNT");
  assert.throws(() => optionalUsdc(" "), (e) => e.code === "ANCRE_BAD_AMOUNT");
  // the commands use it for every amount flag
  for (const f of ["check", "inspect", "pay", "override"]) {
    const js = readFileSync(new URL(`../dist/commands/ancre/${f}.js`, import.meta.url), "utf8");
    assert.match(js, /optionalUsdc\(inp\.(maxAmount|amount)\)/, f);
    assert.doesNotMatch(js, /inp\.(maxAmount|amount) \? parseUsdc/, f);
  }
});

test("SIMP7: one error class; toCommandError keeps our codes and wraps anything else as ANCRE_INTERNAL", async () => {
  const { toCommandError } = await import("../dist/lib/host.js");
  const { AncreError } = await import("../dist/lib/errors.js");
  const { CommandError } = await import("@metamask/agent-wallet/plugin");
  const code = (e) => { try { toCommandError(e); } catch (x) { return [x instanceof CommandError, x.code, x.hint]; } };
  assert.deepEqual(code(new AncreError("ANCRE_X", "m", "h")), [true, "ANCRE_X", "h"]);
  assert.deepEqual(code(new Error("boom")).slice(0, 2), [true, "ANCRE_INTERNAL"]);
  assert.match(code(new Error("boom"))[2], /Do not retry/);
  const host = new CommandError("HOST_CODE", "x", "y");
  assert.throws(() => toCommandError(host), (e) => e === host, "a host error passes through");
  // the three former classes are gone, and so are the duplicate identityAbi and CHAINS[*].rpc
  for (const f of ["lib/flows.js", "lib/x402.js", "lib/config.js", "lib/x402-guard.js"]) {
    const js = readFileSync(new URL(`../dist/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(js, /class \w+Error extends Error/, f);
    assert.doesNotMatch(js, /const identityAbi/, f);
  }
  assert.equal(Object.values(CHAINS).some((c) => "rpc" in c), false);
});

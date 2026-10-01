// D47 (f): no code path lets an agent execute an override without a human signature from the human's own wallet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAddress, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { overrideFlow } from "../dist/lib/override.js";
import { payFlow } from "../dist/lib/flows.js";
import { hostDeps } from "../dist/lib/host.js";
import { fileJournal, readJournal } from "../dist/lib/journal.js";
import { decodeB64Json, encodeB64Json } from "../dist/lib/x402.js";

const PAYER = getAddress("0x00000000000000000000000000000000000000aa");
const USDC = getAddress("0x754704Bc059F8C67012fEd69BC8A327a5aafb603");
const PAYTO = getAddress("0x00000000000000000000000000000000000000b0");
const cfg = { chainId: 143, network: "eip155:143", usdc: USDC, payer: PAYER };
const human = privateKeyToAccount("0x" + "42".repeat(32));
const agent = privateKeyToAccount("0x" + "11".repeat(32)); // the Agent Wallet = an operator of the payer
const A = (o = {}) => ({ status: 4, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 1, triggerTag: keccak256(toHex("veto")), trustLow: 0n, distrustUp: 0n, eLow: 0n, trusted: false, ...o });

function world({ decide = [9, A()], humanBalance = 10n ** 6n } = {}) {
  const fetches = [];
  const leaked = { sign: 0, send: 0 };
  const offer = { scheme: "exact", network: "eip155:143", amount: "10000", asset: USDC, payTo: PAYTO, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2", erc8004AgentId: "12" } };
  const deps = {
    readContract: async ({ functionName, args }) => {
      switch (functionName) {
        case "decide": return decide;
        case "maxPerPayment": return 1_000_000n;
        case "balanceOf": return args[0] === PAYER ? 10n ** 6n : humanBalance;
        case "isOperator": return getAddress(args[0]) === agent.address;
        default: throw new Error("unexpected " + functionName);
      }
    },
    fetch: async (url, init = {}) => {
      fetches.push(init);
      if (!init.headers) return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": encodeB64Json({ x402Version: 2, resource: { url }, accepts: [offer] }) } });
      return new Response("{}", { status: 200, headers: { "PAYMENT-RESPONSE": encodeB64Json({ success: true, transaction: "0x" + "99".repeat(32) }) } });
    },
    nowSec: () => 1_900_000_000,
    random32: () => keccak256(toHex("n")),
    interactive: true,
    agentWallet: agent.address,
    confirm: async (_p, expected) => expected === "override 12",
    humanSign: async (req) => {
      const message = { ...req.typedData.message, from: human.address };
      const { EIP712Domain, ...types } = req.typedData.types;
      return { address: human.address, message, signature: await human.signTypedData({ ...req.typedData, types, message }) };
    },
    // what an agent would love to use: the Agent Wallet's own signer, injected on purpose. It must never be called.
    signTypedData: async () => { leaked.sign++; return "0x"; },
    sendTransaction: async () => { leaked.send++; return { status: "CONFIRMED" }; },
  };
  return { deps, fetches, leaked };
}

// ---------------------------------------------------------------- static: the code cannot reach the executor
const dist = new URL("../dist/", import.meta.url);
const src = (p) => readFileSync(new URL(p, dist), "utf8");

test("static: the override command declares no wallet-submit and never builds a wallet executor", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const c = pkg.mm.commands.find((x) => x.id === "ancre:override");
  assert.ok(c, "ancre:override in the manifest");
  assert.ok(!c.capabilities.includes("wallet-submit"), "without wallet-submit the host denies ctx.walletExecutor (PERMISSION_DENIED)");
  const cmd = src("commands/ancre/override.js");
  assert.match(cmd, /hostDeps\(this\.ctx, io, cfg, null,/, "hostDeps is called with commandId = null");
  assert.doesNotMatch(cmd, /walletExecutor/);
  for (const f of ["lib/override.js", "lib/human.js", "lib/journal.js"]) {
    assert.doesNotMatch(src(f), /walletExecutor|signTypedData\(|sendTransaction/, `${f} must not reach any agent signer`);
  }
  // the only place in the whole plugin that touches the executor is host.ts (pay / fund)
  const all = [];
  const walk = (u) => readdirSync(u, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(new URL(e.name + "/", u)) : e.name.endsWith(".js") && all.push(new URL(e.name, u))));
  walk(dist);
  const users = all.filter((u) => /walletExecutor\(/.test(readFileSync(u, "utf8"))).map((u) => u.pathname.split("/dist/")[1]);
  assert.deepEqual(users, ["lib/host.js"]);
});

test("static: hostDeps(…, null) never calls ctx.walletExecutor", async () => {
  const ctx = { publicClient: () => ({ readContract: async () => 0 }), walletExecutor: () => { throw new Error("executor reached"); } };
  const d = await hostDeps(ctx, {}, cfg, null);
  assert.equal(d.signTypedData, undefined);
  assert.equal(d.sendTransaction, undefined);
});

// ---------------------------------------------------------------- dynamic
test("override refuses to run non-interactively (an agent's shell, --json), before any network call", async () => {
  const w = world();
  w.deps.interactive = false;
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_HUMAN_ONLY");
  assert.equal(w.fetches.length, 0);
});

test("override is refused when ANCRE says PAY (no override of a payable agent)", async () => {
  const w = world({ decide: [0, A({ status: 0, trusted: true, vetoCount: 0 })] });
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_NOT_NEEDED");
});

test("override without the human's typed confirmation: declined, nothing signed", async () => {
  const w = world();
  let asked = 0;
  w.deps.confirm = async () => false;
  w.deps.humanSign = async () => { asked++; throw new Error("must not be asked"); };
  const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
  assert.equal(r.outcome, "OVERRIDE_DECLINED");
  assert.equal(asked, 0);
  assert.equal(w.fetches.length, 1);
});

test("a signature by the Agent Wallet / an operator is refused (no switch between the two wallets)", async () => {
  for (const variant of ["agentWallet", "operatorOnly"]) {
    const w = world();
    if (variant === "operatorOnly") w.deps.agentWallet = undefined; // unknown locally: the payer's operator list still catches it
    w.deps.humanSign = async (req) => {
      const message = { ...req.typedData.message, from: agent.address };
      const { EIP712Domain, ...types } = req.typedData.types;
      return { address: agent.address, message, signature: await agent.signTypedData({ ...req.typedData, types, message }) };
    };
    await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_NOT_HUMAN", variant);
    assert.equal(w.fetches.length, 1, "no paid request");
  }
});

test("a forged or altered human signature is refused", async () => {
  const w1 = world();
  w1.deps.humanSign = async (req) => ({ address: human.address, message: { ...req.typedData.message, from: human.address }, signature: "0x" + "12".repeat(65) });
  await assert.rejects(overrideFlow(w1.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_BAD_SIGNATURE");
  const w2 = world();
  const orig = w2.deps.humanSign;
  w2.deps.humanSign = async (req) => ({ ...(await orig(req)), message: { ...req.typedData.message, from: human.address, to: agent.address } });
  await assert.rejects(overrideFlow(w2.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_BAD_SIGNATURE");
  const w3 = world({ humanBalance: 1n });
  await assert.rejects(overrideFlow(w3.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_UNFUNDED");
});

test("human override pays from the human's wallet, never touches the agent's signer, and is journaled", async () => {
  const w = world();
  const dir = mkdtempSync(join(tmpdir(), "ancre-j-"));
  const path = join(dir, "journal.jsonl");
  w.deps.journal = fileJournal(path);
  const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
  assert.equal(r.outcome, "OVERRIDE_PAID");
  assert.equal(r.human, human.address);
  const p = decodeB64Json(w.fetches[1].headers["payment-signature"]);
  assert.equal(p.payload.authorization.from, human.address, "from = the human, not the payer");
  assert.equal((p.payload.signature.length - 2) / 2, 65, "a plain ECDSA signature, not a payer blob");
  assert.deepEqual(w.leaked, { sign: 0, send: 0 }, "the injected agent signers were never called");
  assert.deepEqual(readJournal(path).map((e) => e.kind), ["override_requested", "override_signed", "override_paid"]);
  assert.equal(readJournal(path)[0].verdict, "VETOED");
});

test("pay journals a refusal and points to the human-only override", async () => {
  const w = world();
  const dir = mkdtempSync(join(tmpdir(), "ancre-j-"));
  const path = join(dir, "journal.jsonl");
  const r = await payFlow({ ...w.deps, journal: fileJournal(path) }, cfg, "https://p/x", { confirm: true });
  assert.equal(r.outcome, "NOT_SIGNED");
  assert.match(r.humanOverride, /Only the human/);
  assert.equal(w.leaked.sign, 0);
  const [e] = readJournal(path);
  assert.equal(e.kind, "refusal");
  assert.equal(e.verdict, "VETOED");
  assert.equal(e.triggerTag, "veto");
});

test("human signing page: one-time token, 127.0.0.1 only, resolves on the posted signature", async () => {
  const { humanSign } = await import("../dist/lib/human.js");
  let url;
  const p = humanSign({ chainId: 143, summary: "<b>x</b>", typedData: { domain: {}, types: {}, primaryType: "X", message: {} }, onUrl: (u) => (url = u), timeoutMs: 5000 });
  while (!url) await new Promise((r) => setTimeout(r, 10));
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32}$/);
  const bare = url.split("?")[0];
  assert.equal((await fetch(bare)).status, 403, "no token, no page");
  const html = await (await fetch(url)).text();
  assert.match(html, /eth_signTypedData_v4/);
  assert.match(html, /&#60;b&#62;x&#60;\/b&#62;/, "the summary is escaped");
  const t = new URL(url).searchParams.get("t");
  const posted = { address: human.address, message: {}, signature: "0x12" };
  assert.equal((await fetch(`${bare}done?t=${t}`, { method: "POST", body: JSON.stringify(posted) })).status, 200);
  assert.deepEqual(await p, posted);
});

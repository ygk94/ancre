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
const human = privateKeyToAccount("0x" + "42".repeat(32)); // the payer's owner (and treasury): the human
const agent = privateKeyToAccount("0x" + "11".repeat(32)); // the Agent Wallet = an operator of the payer
const stranger = privateKeyToAccount("0x" + "77".repeat(32)); // a funded key the agent could create: neither operator nor owner
const sign = async (acct, req) => {
  const td = req.prepare();
  const { EIP712Domain, ...types } = td.types;
  return { address: acct.address, signature: await acct.signTypedData({ ...td, types, message: { ...td.message, from: acct.address } }), template: td };
};
const A = (o = {}) => ({ status: 4, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 1, triggerTag: keccak256(toHex("veto")), trustLow: 0n, distrustUp: 0n, eLow: 0n, passesPolicy: false, ...o });

const POLICY = (payer = PAYER) => `schema_version: 1\nallowlist:\n  addresses:\n    - ${USDC.toLowerCase()}\n    - ${payer.toLowerCase()}\n`;

function world({ decide = [9, A()], humanBalance = 10n ** 6n, owner = human.address, treasury = human.address, used = false } = {}) {
  const fetches = [];
  const reads = [];
  const leaked = { sign: 0, send: 0 };
  const offer = { scheme: "exact", network: "eip155:143", amount: "10000", asset: USDC, payTo: PAYTO, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2", erc8004AgentId: "12" } };
  const deps = {
    readContract: async ({ address, functionName, args }) => {
      reads.push({ address, functionName, args });
      switch (functionName) {
        case "decide": return decide;
        case "usdc": return USDC;
        case "authorizationState": return typeof used === "function" ? used() : used;
        case "maxPerPayment": return 1_000_000n;
        case "balanceOf": return args[0] === PAYER ? 10n ** 6n : humanBalance;
        case "isOperator": return getAddress(args[0]) === agent.address;
        case "owner": return owner;
        case "treasury": return treasury;
        case "operators": return [agent.address, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"];
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
    chainId: async () => 143,
    selectedWallet: { address: agent.address, mode: "server" },
    agentWallets: [agent.address],
    guardPolicy: async () => POLICY(),
    confirm: async (_p, expected) => expected === "override 12",
    humanSign: (req) => sign(human, req),
    // what an agent would love to use: the Agent Wallet's own signer, injected on purpose. It must never be called.
    signTypedData: async () => { leaked.sign++; return "0x"; },
    sendTransaction: async () => { leaked.send++; return { status: "CONFIRMED" }; },
  };
  return { deps, fetches, leaked, reads };
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
  assert.match(cmd, /hostDeps\(this\.ctx, io, cfg, null\)/, "hostDeps is called with commandId = null and no rpcUrl (M4)");
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
  const ctx = { publicClient: () => ({ readContract: async () => 0, getChainId: async () => 143 }), walletExecutor: () => { throw new Error("executor reached"); } };
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
  const w = world({ decide: [0, A({ status: 0, passesPolicy: true, vetoCount: 0 })] });
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

const journaled = (w) => {
  const path = join(mkdtempSync(join(tmpdir(), "ancre-j-")), "journal.jsonl");
  w.deps.journal = fileJournal(path);
  return () => readJournal(path).map((e) => e.kind);
};

test("a signature by the Agent Wallet / an operator is refused (no switch between the two wallets), and journaled", async () => {
  for (const variant of ["agentWallets", "operatorOnly"]) {
    const w = world();
    if (variant === "operatorOnly") w.deps.agentWallets = []; // host state unknown: the payer's operator list still catches it
    const kinds = journaled(w);
    w.deps.humanSign = (req) => sign(agent, req);
    await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_NOT_HUMAN", variant);
    assert.equal(w.fetches.length, 1, "no paid request");
    assert.deepEqual(kinds(), ["override_requested", "override_refused"]);
  }
});

test("a funded third-party key (not an operator, not in the host wallet) is refused: only the owner or treasury may sign", async () => {
  const w = world();
  const kinds = journaled(w);
  w.deps.humanSign = (req) => sign(stranger, req);
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_NOT_HUMAN" && /neither the payer's owner nor its treasury/.test(e.message));
  assert.equal(w.fetches.length, 1);
  assert.deepEqual(kinds(), ["override_requested", "override_refused"]);
});

test("any address of the host wallet is refused even if it were the owner", async () => {
  const w = world({ owner: human.address, treasury: human.address });
  w.deps.agentWallets = [agent.address, human.address]; // the human's key imported into the Agent Wallet: not a human anymore
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_MISCONFIGURED");
});

test("a payer whose owner and treasury are the agent's has no human: override refused", async () => {
  const w = world({ owner: agent.address, treasury: agent.address });
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_MISCONFIGURED");
});

test("a forged signature or an unfunded human wallet is refused, and journaled", async () => {
  const w1 = world();
  const k1 = journaled(w1);
  w1.deps.humanSign = async (req) => ({ address: human.address, signature: "0x" + "12".repeat(65), template: req.prepare() });
  await assert.rejects(overrideFlow(w1.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_BAD_SIGNATURE");
  assert.deepEqual(k1(), ["override_requested", "override_refused"]);
  const w2 = world();
  w2.deps.humanSign = async () => ({ address: human.address, signature: "0x12" }); // page never asked for a template
  await assert.rejects(overrideFlow(w2.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_BAD_SIGNATURE");
  const w3 = world({ humanBalance: 1n });
  await assert.rejects(overrideFlow(w3.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_UNFUNDED");
});

test("the non-interactive refusal is journaled too (an agent trying is what the screen must show)", async () => {
  const w = world();
  const kinds = journaled(w);
  w.deps.interactive = false;
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_HUMAN_ONLY");
  assert.deepEqual(kinds(), ["override_refused"]);
});

test("isInteractive: TTY on both ends and no machine output", async () => {
  const { isInteractive } = await import("../dist/lib/interactive.js");
  assert.equal(isInteractive(true, true, ["ancre", "override", "u"], true), true);
  assert.equal(isInteractive(undefined, true, [], true), false, "stdin piped (an agent's shell)");
  assert.equal(isInteractive(true, false, [], true), false, "stdout piped");
  for (const f of ["--json", "--toon", "--format=json", "--format"]) assert.equal(isInteractive(true, true, ["x", f], true), false, f);
  // A4e: the host's alias and persistent format: -f json, -f=json, -fjson, `mm config set format json` (io.isInteractive false)
  for (const f of ["-f", "-f=json", "-fjson"]) assert.equal(isInteractive(true, true, ["x", f, "json"], true), false, f);
  assert.equal(isInteractive(true, true, ["ancre", "override", "u"], false), false, "the host chose the headless renderer");
  assert.equal(isInteractive(true, true, ["ancre", "override", "u"], undefined), false, "unknown host answer: refuse");
  const cmd = readFileSync(new URL("../dist/commands/ancre/override.js", import.meta.url), "utf8");
  assert.match(cmd, /isInteractive\(process\.stdin\.isTTY, process\.stdout\.isTTY, argv, io\.isInteractive\)/, "the command uses the host's answer too");
});

test("2xx without settlement proof after a human signature is UNKNOWN, with the live authorisation", async () => {
  const w = world();
  const kinds = journaled(w);
  const orig = w.deps.fetch;
  w.deps.fetch = async (url, init = {}) => (init.headers ? new Response("{}", { status: 200 }) : orig(url, init));
  const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
  assert.equal(r.outcome, "OVERRIDE_UNKNOWN");
  assert.ok(r.liveAuthorization.validBefore);
  assert.deepEqual(kinds(), ["override_requested", "override_signed", "override_unknown"]);
});

test("the validity window starts when the human clicks, not when the page opens", async () => {
  const w = world();
  let clock = 1_900_000_000;
  w.deps.nowSec = () => clock;
  w.deps.humanSign = async (req) => { clock += 240; return sign(human, req); }; // 4 minutes to open, unlock, sign
  const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
  const a = decodeB64Json(w.fetches[1].headers["payment-signature"]).payload.authorization;
  assert.equal(BigInt(a.validBefore), BigInt(1_900_000_000 + 240 + 60));
  assert.equal(r.outcome, "OVERRIDE_PAID");
});

test("the payer's maxPerPayment does not bind the human's own wallet", async () => {
  const w = world({ decide: [5, A({ status: 0, passesPolicy: true, vetoCount: 0 })] }); // OVER_LIMIT for the payer
  const r = await overrideFlow(w.deps, cfg, "https://p/x", { maxAmount: 10n ** 6n });
  assert.equal(r.verdict, "OVER_LIMIT");
  assert.equal(r.outcome, "OVERRIDE_PAID");
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
  const tpl = { domain: {}, types: {}, primaryType: "T", message: { nonce: "0xaa" } };
  const p = humanSign({ chainId: 143, summary: "<b>x</b>", prepare: () => tpl, onUrl: (u) => (url = u), timeoutMs: 5000 });
  while (!url) await new Promise((r) => setTimeout(r, 10));
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32}$/);
  const bare = url.split("?")[0];
  assert.equal((await fetch(bare)).status, 403, "no token, no page");
  const html = await (await fetch(url)).text();
  assert.match(html, /eth_signTypedData_v4/);
  assert.match(html, /&#60;b&#62;x&#60;\/b&#62;/, "the summary is escaped");
  const t = new URL(url).searchParams.get("t");
  assert.deepEqual(await (await fetch(`${bare}template?t=${t}`)).json(), tpl);
  const posted = { address: human.address, signature: "0x12" };
  assert.equal((await fetch(`${bare}done?t=${t}`, { method: "POST", body: JSON.stringify({ ...posted, nonce: "0xbb" }) })).status, 400, "unknown nonce");
  assert.equal((await fetch(`${bare}done?t=${t}`, { method: "POST", body: JSON.stringify({ ...posted, nonce: "0xaa" }) })).status, 200);
  assert.deepEqual(await p, { ...posted, template: tpl }, "the template comes from the plugin, not from the page");
});

// ---------------------------------------------------------------- revue max 2026-10-06 (plugin-revue)
const AW2 = privateKeyToAccount("0x" + "33".repeat(32)); // a second, non-selected address of the host wallet

test("M4: the payer must be pinned by the Agent Wallet setup and read on the configured chain, else refused before any request", async () => {
  const cases = [
    ["reader on another chain (a testnet RPC or a fake one)", (w) => (w.deps.chainId = async () => 10143), "ANCRE_WRONG_CHAIN"],
    ["host wallet state unreadable", (w) => (w.deps.selectedWallet = undefined), "ANCRE_OVERRIDE_UNPINNED"],
    ["BYOK wallet (no Guard Mode policy)", (w) => (w.deps.selectedWallet = { address: agent.address, mode: "byok" }), "ANCRE_OVERRIDE_UNPINNED"],
    ["payer not operated by the Agent Wallet", (w) => (w.deps.selectedWallet = { address: AW2.address, mode: "server" }), "ANCRE_OVERRIDE_UNPINNED"],
    ["payer absent from the Guard Mode policy (one the agent deployed)", (w) => (w.deps.guardPolicy = async () => POLICY(getAddress("0x00000000000000000000000000000000000000ab"))), "ANCRE_OVERRIDE_UNPINNED"],
    ["Guard Mode policy unreadable", (w) => (w.deps.guardPolicy = async () => { throw new Error("not logged in"); }), "ANCRE_OVERRIDE_UNPINNED"],
  ];
  for (const [name, tweak, code] of cases) {
    const w = world();
    const kinds = journaled(w);
    tweak(w);
    await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === code, name);
    assert.equal(w.fetches.length, 0, `${name}: not even the challenge`);
    assert.deepEqual(kinds(), ["override_refused"], name);
  }
});

test("M4 PoC: a fake reader answering owner = treasury = the agent's funded key K no longer yields OVERRIDE_PAID", async () => {
  // the review's PoC: the agent runs the override in a pty, with its own payer (or a fake RPC) whose owner and
  // treasury are K, and drives the signing page with K. The payer is not in the Guard Mode policy: refused.
  const w = world({ owner: stranger.address, treasury: stranger.address });
  w.deps.guardPolicy = async () => POLICY(getAddress("0x00000000000000000000000000000000000000ab")); // the human pinned another payer
  w.deps.humanSign = (req) => sign(stranger, req);
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_UNPINNED");
  // and the command itself has no --rpc-url and reads through the gateway only
  const cmd = readFileSync(new URL("../dist/commands/ancre/override.js", import.meta.url), "utf8");
  assert.doesNotMatch(cmd, /flag: "rpc-url"/);
  assert.doesNotMatch(cmd, /hostDeps\([^)]*ANCRE_RPC_URL/);
});

test("A4f: owner OR treasury held by the agent is enough to refuse (misconfigured)", async () => {
  for (const [owner, treasury] of [[agent.address, human.address], [human.address, agent.address], [human.address, AW2.address]]) {
    const w = world({ owner, treasury });
    w.deps.agentWallets = [agent.address, AW2.address];
    await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_MISCONFIGURED", `${owner}/${treasury}`);
    assert.equal(w.fetches.length, 1, "challenge only");
  }
});

test("K15 (override): a non-2xx with a successful PAYMENT-RESPONSE is OVERRIDE_PAID, not FAILED", async () => {
  const w = world();
  const orig = w.deps.fetch;
  w.deps.fetch = async (url, init = {}) => init.headers
    ? new Response("handler failed", { status: 500, headers: { "PAYMENT-RESPONSE": encodeB64Json({ success: true, transaction: "0x" + "99".repeat(32) }) } })
    : orig(url, init);
  const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
  assert.equal(r.outcome, "OVERRIDE_PAID");
  assert.equal(r.transaction, "0x" + "99".repeat(32));
});

test("A4a (override): no proof -> authorizationState(human, nonce) decides; 5xx never reads as failed", async () => {
  const paid500 = async (url, init, orig) => (init.headers ? new Response("bad gateway", { status: 504 }) : orig(url, init));
  for (const [used, outcome] of [[true, "OVERRIDE_PAID"], [false, "OVERRIDE_UNKNOWN"]]) {
    const w = world({ used });
    const orig = w.deps.fetch;
    w.deps.fetch = (url, init = {}) => paid500(url, init, orig);
    const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
    assert.equal(r.outcome, outcome, `nonce used=${used}`);
    const q = w.reads.find((x) => x.functionName === "authorizationState");
    assert.equal(q.address, USDC);
    assert.equal(q.args[0], human.address, "the authoriser is the human");
  }
  // a verify rejection (402 + PAYMENT-REQUIRED) with an unused nonce is the only OVERRIDE_FAILED
  const w = world();
  const orig = w.deps.fetch;
  w.deps.fetch = async (url, init = {}) => init.headers
    ? new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodeB64Json({ x402Version: 2, error: "invalid_signature", accepts: [] }) } })
    : orig(url, init);
  assert.equal((await overrideFlow(w.deps, cfg, "https://p/x", {})).outcome, "OVERRIDE_FAILED");
});

test("A4d: a double click on the signing page verifies each signature against its own template, and says Signed only once accepted", async () => {
  const { humanSign } = await import("../dist/lib/human.js");
  // real page server, driven like the browser: two /template (two clicks), the FIRST one is signed
  const w = world();
  const kinds = journaled(w);
  w.deps.humanSign = (req) => humanSign({ ...req, timeoutMs: 5000, onUrl: async (url) => {
    const bare = url.split("?")[0];
    const t = new URL(url).searchParams.get("t");
    const td1 = await (await fetch(`${bare}template?t=${t}`)).json();
    await (await fetch(`${bare}template?t=${t}`)).json(); // second click: a second nonce, n2
    const { EIP712Domain, ...types } = td1.types;
    const msg = { ...td1.message, from: human.address };
    const signature = await human.signTypedData({ domain: td1.domain, types, primaryType: td1.primaryType,
      message: { ...msg, value: BigInt(msg.value), validAfter: BigInt(msg.validAfter), validBefore: BigInt(msg.validBefore) } });
    const r = await fetch(`${bare}done?t=${t}`, { method: "POST", body: JSON.stringify({ address: human.address, signature, nonce: td1.message.nonce }) });
    assert.equal(r.status, 200, await r.clone().text());
  } });
  let n = 0;
  w.deps.random32 = () => keccak256(toHex(`n${n++}`)); // distinct nonces per click
  const r = await overrideFlow(w.deps, cfg, "https://p/x", {});
  assert.equal(r.outcome, "OVERRIDE_PAID");
  const a = decodeB64Json(w.fetches[1].headers["payment-signature"]).payload.authorization;
  assert.equal(a.nonce, keccak256(toHex("n0")), "paid with the template that was signed");
  assert.deepEqual(kinds(), ["override_requested", "override_signed", "override_paid"]);
});

test("A4d: a refused signature is reported on the page (not 'Signed') and in the terminal", async () => {
  const { humanSign } = await import("../dist/lib/human.js");
  const w = world();
  let page, drove;
  w.deps.humanSign = (req) => humanSign({ ...req, timeoutMs: 5000, onUrl: (url) => void (drove = (async () => {
    const bare = url.split("?")[0];
    const t = new URL(url).searchParams.get("t");
    const td = await (await fetch(`${bare}template?t=${t}`)).json();
    const { EIP712Domain, ...types } = td.types;
    const m = { ...td.message, from: stranger.address, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore) };
    const signature = await stranger.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: m });
    const r = await fetch(`${bare}done?t=${t}`, { method: "POST", body: JSON.stringify({ address: stranger.address, signature, nonce: td.message.nonce }) });
    page = { status: r.status, text: await r.text() };
  })()) });
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_NOT_HUMAN");
  await drove;
  assert.equal(page.status, 400);
  assert.match(page.text, /neither the payer's owner nor its treasury/);
  assert.equal(w.fetches.length, 1, "no paid request");
});

test("A4g: Ctrl-C (io.signal) closes the signing page and stops the override", async () => {
  const { humanSign } = await import("../dist/lib/human.js");
  const ac = new AbortController();
  let url;
  const w = world();
  const kinds = journaled(w);
  w.deps.signal = ac.signal;
  w.deps.humanSign = (req) => humanSign({ ...req, timeoutMs: 60_000, onUrl: (u) => { url = u; setTimeout(() => ac.abort(), 20); } });
  const t0 = Date.now();
  await assert.rejects(overrideFlow(w.deps, cfg, "https://p/x", {}), (e) => e.code === "ANCRE_OVERRIDE_NOT_SIGNED" && /cancelled/.test(e.message));
  assert.ok(Date.now() - t0 < 5000, "does not wait for the timeout");
  await assert.rejects(fetch(url), "the page is closed");
  assert.equal(w.fetches.length, 1);
  assert.deepEqual(kinds(), ["override_requested", "override_failed"]);
});

test("M4: readGuardPolicy runs `wallet policy get --json` with this process's own Node and mm entry point, not a `mm` on PATH", async () => {
  const { readGuardPolicy } = await import("../dist/lib/host.js");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "ancre-mm-"));
  const fake = join(dir, "mm-entry.mjs");
  writeFileSync(fake, `process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), policy: "allowlist: [${PAYER}]" }))`);
  const saved = process.argv[1];
  const savedPath = process.env.PATH;
  process.argv[1] = fake;
  process.env.PATH = "/nonexistent"; // a fake `mm` on PATH would not be used anyway
  try {
    const out = JSON.parse(await readGuardPolicy());
    assert.deepEqual(out.argv, ["wallet", "policy", "get", "--json"]);
    assert.match(out.policy, new RegExp(PAYER.slice(2), "i"));
  } finally {
    process.argv[1] = saved;
    process.env.PATH = savedPath;
  }
});

#!/usr/bin/env node
// Rehearsal of the 5-minute demo on a local fork (no real transaction): anvil --network monad fork of the testnet,
// TrustGatedPayer + T1Oracle (stand-in for ANCRE: "good" trusted, "farm" not), a local x402 server with two
// providers, settlement by an emulated x402-rs facilitator.
//   node scripts/demo-local.mjs                       pay flows with a fresh key standing in for the Agent Wallet
//   MM_HOME=<isolated dir> node scripts/demo-local.mjs  + the read commands through the real `mm` binary
// The real demo replaces that key by `mm ancre pay` (signature through ctx.walletExecutor, needs `mm login`)
// and the oracle by AnchoredReputation; see plugin/DEMO.md.
// Roles (02-bis, R8): the dev key D deploys and owns, a fresh key stands in for the Agent Wallet (operator), and
// the human's key is the treasury, then also the owner before the override scene (D47 setup). Needs the 02-bis
// contracts (T1.s.sol with T1_TREASURY / T1_OPERATOR, T1Oracle.passesAnchorPolicy).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bytesToHex, createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
import { payFlow } from "../dist/lib/flows.js";
import { ancrePaymentTypedData, encodeExactBlob } from "../dist/lib/payer.js";
import { buildPaymentPayload, encodeB64Json, newAuthorization } from "../dist/lib/x402.js";
import { CHAIN_ID, DEV_D, DEV_F, DEV_P, NETWORK, USDC, dealUsdc, emulatedFacilitator, exactSettlementCall, forgeScript, oracleAbi, startAnvil, usdcAbi } from "./local.mjs";
import { startX402Server } from "./x402-server.mjs";
import { ancreGuard } from "../dist/lib/x402-guard.js";
import { overrideFlow } from "../dist/lib/override.js";
import { payerAbi } from "../dist/lib/payerAbi.js";
import { signAsExtension } from "./local.mjs";
import { fileJournal, readJournal } from "../dist/lib/journal.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const VETOED = 4;
const out = [];
const scene = (name, data) => {
  const e = { scene: name, ...data };
  out.push(e);
  console.log(`\n== ${name}\n` + JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
};

async function main() {
  const anvil = await startAnvil(process.env.PORT ?? "8547");
  let server;
  try {
    const pub = createPublicClient({ transport: http(anvil.rpc) });
    const dev = privateKeyToAccount(DEV_D);
    const admin = createWalletClient({ account: dev, transport: http(anvil.rpc) });
    await dealUsdc(pub, dev.address, 1_000_000n);
    const agentWallet = privateKeyToAccount(bytesToHex(randomBytes(32))); // the operator (Agent Wallet stand-in)
    const humanKey = privateKeyToAccount(bytesToHex(randomBytes(32))); // the human's MetaMask extension stand-in
    const d = forgeScript(anvil.rpc, { T1_STEP: "deploy", T1_PROVIDER: DEV_P, T1_FUND: "100000", T1_TREASURY: humanKey.address, T1_OPERATOR: agentWallet.address },
      ["--private-key", DEV_D]);
    const payer = getAddress(d.payer);
    const oracle = getAddress(d.oracle);
    const setAgent = async (id, wallet, trusted, status) => {
      const h = await admin.writeContract({ address: oracle, abi: oracleAbi, functionName: "setAgent", args: [id, wallet, trusted, status], gas: 120_000n, chain: null });
      await pub.waitForTransactionReceipt({ hash: h });
    };
    await setAgent(2n, DEV_F, false, 0); // the farm: a registered agent ANCRE gives no mass

    const settleVia = (phase, payload) => emulatedFacilitator(pub, phase, USDC, exactSettlementCall(payload));
    let vetoBeforeSettle = false;
    server = await startX402Server({
      port: Number(process.env.SERVER_PORT ?? 4021), network: NETWORK, usdc: USDC,
      routes: {
        "/good": { payTo: DEV_P, agentId: 1, amount: "10000", body: { quote: "ETH/USDC 3125.40", provider: "good" } },
        "/farm": { payTo: DEV_F, agentId: 2, amount: "10000", body: { quote: "ETH/USDC 99999", provider: "farm" } },
      },
      facilitator: settleVia,
      hooks: { beforeSettle: async () => { if (vetoBeforeSettle) await setAgent(1n, DEV_P, true, VETOED); } },
    });
    const cfg = { chainId: CHAIN_ID, network: NETWORK, usdc: USDC, payer };
    // a fresh key standing in for the Agent Wallet executor (the real one is ctx.walletExecutor after `mm login`)
    const signs = [];
    const deps = {
      readContract: (a) => pub.readContract(a),
      fetch: globalThis.fetch.bind(globalThis),
      nowSec: () => Math.floor(Date.now() / 1000),
      random32: () => bytesToHex(randomBytes(32)),
      signTypedData: async (td, summary) => { signs.push(summary); return agentWallet.signTypedData(td); },
    };
    const bal = (a) => pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [a] });

    // ---- read commands through the real mm binary (no login needed with --rpc-url)
    const mmHome = process.env.MM_HOME;
    if (mmHome) {
      // async: the x402 server lives in this process and must keep answering while mm runs
      const mm = async (...a) => {
        try {
          const { stdout } = await promisify(execFile)(new URL("../node_modules/.bin/mm", import.meta.url).pathname, [...a, "--json"],
            { env: { ...process.env, HOME: mmHome, XDG_DATA_HOME: `${mmHome}/.local/share`, XDG_CONFIG_HOME: `${mmHome}/.config`, XDG_CACHE_HOME: `${mmHome}/.cache` }, encoding: "utf8" });
          return JSON.parse(stdout);
        } catch (e) {
          return { error: String(e.stdout || e.message).slice(0, 400) };
        }
      };
      const common = ["--payer", payer, "--chain-id", String(CHAIN_ID), "--rpc-url", anvil.rpc];
      scene("1. mm ancre check 2 (the farm)", await mm("ancre", "check", "2", ...common));
      scene("1b. mm ancre check 1 (good)", await mm("ancre", "check", "1", ...common));
      scene("1c. mm ancre inspect /farm", await mm("ancre", "inspect", `${server.url}/farm`, ...common));
      scene("1d. mm ancre payer status", await mm("ancre", "payer", "status", ...common));
    }

    // ---- soft guard: the farm is refused before any signature
    let r = await payFlow(deps, cfg, `${server.url}/farm`, { confirm: true });
    scene("2. pay /farm", { verdict: r.verdict, paid: r.paid, signed: r.signed, signaturesRequested: signs.length });

    // ---- the good provider is paid by the payer contract
    const p0 = await bal(DEV_P);
    r = await payFlow(deps, cfg, `${server.url}/good`, { confirm: true });
    scene("3. pay /good", { verdict: r.verdict, paid: r.paid, transaction: r.transaction, providerReceived: (await bal(DEV_P)) - p0, body: r.responseBody });

    // ---- hard guard: a hand-made blob paying the farm from the payer is refused at /verify
    const f0 = await bal(DEV_F);
    const now = Math.floor(Date.now() / 1000);
    const offer = { scheme: "exact", network: NETWORK, amount: "10000", asset: USDC, payTo: DEV_F, maxTimeoutSeconds: 120, extra: { name: "USDC", version: "2", erc8004AgentId: "2" } };
    const auth = newAuthorization(payer, offer, now, bytesToHex(randomBytes(32)));
    const blob = encodeExactBlob(auth, 2n, await agentWallet.signTypedData(ancrePaymentTypedData(CHAIN_ID, auth, 2n)));
    const forced = await fetch(`${server.url}/farm`, { headers: { "payment-signature": encodeB64Json(buildPaymentPayload({ x402Version: 2, accepts: [offer] }, offer, auth, blob, `${server.url}/farm`)) } });
    scene("4. bypass: operator signs for the farm by hand", { httpStatus: forced.status, facilitator: JSON.parse(await forced.text()), farmReceived: (await bal(DEV_F)) - f0 });

    // ---- veto: the next payment is refused, nothing signed
    await setAgent(1n, DEV_P, true, VETOED);
    const s0 = signs.length;
    r = await payFlow(deps, cfg, `${server.url}/good`, { confirm: true });
    scene("5. anchor veto, then pay /good", { verdict: r.verdict, paid: r.paid, signed: r.signed, newSignatures: signs.length - s0 });

    // ---- breaker: the veto lands between /verify and /settle
    await setAgent(1n, DEV_P, true, 0);
    vetoBeforeSettle = true;
    const p1 = await bal(DEV_P);
    r = await payFlow(deps, cfg, `${server.url}/good`, { confirm: true });
    scene("6. breaker between /verify and /settle", {
      decidedBefore: r.verdict, signed: r.signed, paid: r.paid, httpStatus: r.settlementError?.httpStatus,
      explainAfterFailure: r.explainAfterFailure?.verdict, providerReceived: (await bal(DEV_P)) - p1,
    });

    // ---- E4: client guard (b) with the official SDK, for an EOA payer (no payer contract)
    await setAgent(1n, DEV_P, true, 0);
    vetoBeforeSettle = false;
    // a fresh key: every anvil dev account is EIP-7702-delegated on the real Monad testnet (MESURÉ 01/10), so the
    // USDC would route its signature through ERC-1271 and refuse it (AM-05.6)
    const eoa = privateKeyToAccount(bytesToHex(randomBytes(32)));
    await dealUsdc(pub, eoa.address, 50_000n);
    const decisions = [];
    const client = new x402Client().register("eip155:*", new ExactEvmScheme(eoa)).setSpendControls(false);
    client.onBeforePaymentCreation(ancreGuard({ readContract: (a) => pub.readContract(a), chainId: CHAIN_ID, getChainId: () => pub.getChainId(), ancre: oracle, setId: ("0x" + "00".repeat(31) + "01"), onDecision: (x) => decisions.push(x) }));
    const pay = wrapFetchWithPayment(fetch, client);
    let farmOutcome;
    try {
      const fr = await pay(`${server.url}/farm`);
      farmOutcome = `HTTP ${fr.status}`;
    } catch (e) {
      farmOutcome = `aborted: ${e.message}`;
    }
    const g0 = await bal(DEV_P);
    const gr = await pay(`${server.url}/good`);
    scene("7. client guard (b): @x402/fetch + onBeforePaymentCreation, EOA payer", {
      farm: farmOutcome, good: `HTTP ${gr.status}`, goodBody: gr.status === 200 ? undefined : (await gr.text()).slice(0, 400), goodReceived: (await bal(DEV_P)) - g0, decisions,
    });

    // ---- D47: human override of the farm refusal, paid from the human's own wallet (a fresh key stands in for
    // the human's MetaMask extension; in the real command the human signs on a local page in the browser)
    await dealUsdc(pub, humanKey.address, 50_000n);
    // the override signer must be the payer's owner or treasury: hand the ownership to the human (D47 setup)
    const th = await admin.writeContract({ address: payer, abi: payerAbi, functionName: "transferOwnership", args: [humanKey.address], gas: 80_000n, chain: null });
    await pub.waitForTransactionReceipt({ hash: th });
    const jpath = join(mkdtempSync(join(tmpdir(), "ancre-demo-")), "journal.jsonl");
    const payerBefore = await bal(payer);
    const farmBefore = await bal(DEV_F);
    const ov = await overrideFlow({
      readContract: (a) => pub.readContract(a), fetch: globalThis.fetch.bind(globalThis), nowSec: () => Math.floor(Date.now() / 1000),
      random32: () => bytesToHex(randomBytes(32)), interactive: true, agentWallets: [agentWallet.address], journal: fileJournal(jpath),
      chainId: () => pub.getChainId(),
      // M4 pin: on the fork a fresh key stands in for the server wallet, and its Guard Mode policy (MetaMask's
      // backend, read with `mm wallet policy get` in the real command) is simulated as the expected allowlist
      selectedWallet: { address: agentWallet.address, mode: "server" },
      guardPolicy: async () => `schema_version: 1\nallowlist:\n  addresses: [${USDC}, ${payer}]\n  token_recipients: [${payer}]\n`,
      confirm: async () => true,
      humanSign: async (req) => signAsExtension(humanKey, req),
    }, cfg, `${server.url}/farm`, {});
    scene("8. human override of the farm refusal (D47)", {
      verdictOverridden: ov.verdict, outcome: ov.outcome, paidBy: ov.human, transaction: ov.transaction,
      farmReceived: (await bal(DEV_F)) - farmBefore, payerSpent: payerBefore - (await bal(payer)), journal: readJournal(jpath).map((e) => e.kind),
    });

    const ok = out.find((e) => e.scene === "2. pay /farm").signed === false
      && out.find((e) => e.scene === "3. pay /good").paid === true
      && out.find((e) => e.scene.startsWith("4.")).farmReceived === 0n
      && out.find((e) => e.scene.startsWith("5.")).signed === false
      && out.find((e) => e.scene.startsWith("6.")).paid === false
      && out.find((e) => e.scene.startsWith("6.")).providerReceived === 0n
      && out.find((e) => e.scene.startsWith("7.")).farm.startsWith("aborted")
      && out.find((e) => e.scene.startsWith("7.")).goodReceived === 10000n
      && out.find((e) => e.scene.startsWith("8.")).outcome === "OVERRIDE_PAID"
      && out.find((e) => e.scene.startsWith("8.")).payerSpent === 0n;
    console.log(`\nDEMO ${ok ? "PASS" : "FAIL"}`);
    if (!ok) process.exitCode = 1;
  } finally {
    server?.close();
    anvil.stop();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

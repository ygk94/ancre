// Trigger for the Alchemy video (alchemy-live, 10/10): ONE real event on the official testnet instance that the
// Alchemy Custom Webhook delivers and that changes the certificate of the official set, so that the receiver
// (solver/alchemy_hook.py serve) recertifies it on camera.
//
// The event: anchor-A (demo) of the official set vouches for provider-3 (agent 2052), which so far is trusted
// only through the second hop (scene 7). An anchor's feedback is always relevant (its row carries mass): the
// receiver re-exports the registry from the Envio indexer, recomputes, and submits (or prepares) a new certificate.
//
//   node trigger.ts                                   # DRY (default): no key, no transaction; simulates the
//                                                     # giveFeedback with eth_estimateGas from anchor-A's address
//   node trigger.ts --send --keystore ~/.foundry/keystores/ancre-demo
//                                                     # REAL testnet transactions (Hugo, during the shoot):
//                                                     # typed confirmation, keystore password (or ANCRE_DEMO_PASSWORD);
//                                                     # funds anchor-A with 0.1 MON from the operator if needed, then
//                                                     # sends the giveFeedback and prints its block and time (ms)
//
// Nothing here can move a payment: the feedback is an ordinary ERC-8004 giveFeedback, signed by an anchor key
// derived from the operator's keystore (demo/lib/accounts.ts). Cost: ~0.031 testnet MON per feedback (MEASURED 10/10: 278 436 gas x 1.10 at 102 gwei), + 0.1 MON funding.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { type Address, createPublicClient, encodeFunctionData, formatEther, getAddress, http, parseEventLogs, zeroHash } from "viem";
import { reputationAbi } from "./lib/abi.ts";
import { askPassword, decryptKeystore, demoAccounts } from "./lib/accounts.ts";
import { Chain } from "./lib/chain.ts";
import { TAG2, TESTNET } from "./lib/config.ts";

const STATE = new URL("../docs/chantiers/rapports/act2-testnet/state-testnet.json", import.meta.url);
// anchor-A (demo) of the official set: the client of step 1.vouch:A->p1 in run-20261007T131141Z.json
const ANCHOR_A = getAddress("0xC016278eEDaA2C73878bD28279c7F8D0ab2f5619");
const FUND = 10n ** 17n; // 0.1 MON: 3 feedbacks (eth_estimateGas 278 436 x 1.10 at 102 gwei = 0.031 MON, MEASURED 10/10)
const MIN_BALANCE = 5n * 10n ** 16n;

const { values: args } = parseArgs({
  options: {
    send: { type: "boolean", default: false },
    keystore: { type: "string" },
    agent: { type: "string", default: "2052" }, // provider-3 (demo)
    value: { type: "string", default: "90" }, // vouch 0..100 (schema_reference.json)
    rpc: { type: "string", default: TESTNET.rpc },
  },
});

/** The giveFeedback call (ERC-8004 v2.0.0): value, 0 decimals, tag1 "vouch", tag2 "demo". */
export function feedbackCall(agentId: bigint, value: bigint) {
  return {
    to: TESTNET.reputation as Address,
    data: encodeFunctionData({ abi: reputationAbi, functionName: "giveFeedback",
      args: [agentId, value, 0, "vouch", TAG2, "", "", zeroHash] }),
  };
}

async function main() {
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const agentId = BigInt(args.agent!);
  const value = BigInt(args.value!);
  if (value < 0n || value > 100n) throw new Error("vouch is 0..100 in the demo schema");
  const known = Object.values(state.agents as Record<string, { agentId: number }>).some((a) => BigInt(a.agentId) === agentId);
  if (!known) throw new Error(`agent ${agentId} is not a demo agent of the official instance`);
  if (!state.set.anchors.includes(ANCHOR_A.toLowerCase())) throw new Error("anchor-A is not an anchor of the official set");
  const pub = createPublicClient({ transport: http(args.rpc) });
  const call = feedbackCall(agentId, value);
  const [head, bal, est, price] = await Promise.all([pub.getBlockNumber(), pub.getBalance({ address: ANCHOR_A }),
    pub.estimateGas({ account: ANCHOR_A, ...call }), pub.getGasPrice()]);
  console.log(`official instance: ANCRE ${state.ancre}, setId ${state.setId}`);
  console.log(`event: anchor-A ${ANCHOR_A} gives vouch ${value} to agent ${agentId} (tag2 "${TAG2}")`);
  console.log(`head ${head}; anchor-A balance ${formatEther(bal)} MON; eth_estimateGas ${est} at ${price} wei/gas`);
  if (!args.send) {
    console.log(bal < MIN_BALANCE ? `DRY: --send would first fund anchor-A with ${formatEther(FUND)} MON from the operator` : "DRY: anchor-A is funded");
    console.log("DRY: nothing sent. Add --send --keystore <operator keystore> to send it (real testnet transaction).");
    return;
  }
  if (!args.keystore) throw new Error("--send needs --keystore (the operator's encrypted Foundry keystore)");
  if (!process.stdin.isTTY) throw new Error("--send needs an interactive terminal (typed confirmation)");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const phrase = "send real testnet transactions";
  const ans = await rl.question(`About to send REAL Monad testnet transactions. Type "${phrase}": `);
  rl.close();
  if (ans.trim() !== phrase) throw new Error("not confirmed");
  const seed = decryptKeystore(args.keystore, await askPassword("keystore password: "));
  const acc = demoAccounts(seed, true);
  if (acc.operator.account.address !== getAddress(state.operator)) throw new Error("keystore is not the operator of the official instance");
  const anchorA = acc.anchors[0];
  if (anchorA.account.address !== ANCHOR_A) throw new Error("derived anchor-A differs from the official set");
  const chain = new Chain(args.rpc!, "testnet", TESTNET.chainId);
  if (bal < MIN_BALANCE) {
    const f = await chain.send("fund anchor-A for the Alchemy trigger", acc.operator.account, { to: ANCHOR_A, value: FUND });
    console.log(`funded anchor-A: tx ${f.hash}, block ${f.block}`);
  }
  const r = await chain.send(`vouch anchor-A -> ${agentId}`, anchorA.account, { to: call.to, abi: reputationAbi, functionName: "giveFeedback",
    args: [agentId, value, 0, "vouch", TAG2, "", "", zeroHash] });
  const wallMs = Date.now();
  const ev = parseEventLogs({ abi: reputationAbi, logs: r.receipt.logs, eventName: "NewFeedback" })[0];
  console.log(`NewFeedback in block ${r.block} (feedbackIndex ${ev ? ev.args.feedbackIndex : "?"}), tx ${r.hash}`);
  console.log(`receipt seen at ${new Date(wallMs).toISOString()} (${wallMs} ms): compare with the receiver's TIMELINE line`);
  console.log(`https://testnet.monadscan.com/tx/${r.hash}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

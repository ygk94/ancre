import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, keccak256, toHex, zeroAddress } from "viem";
import { ancreGuard } from "../dist/lib/x402-guard.js";

const ANCRE = getAddress("0x00000000000000000000000000000000000000dd");
const ID = getAddress("0x00000000000000000000000000000000000000cc");
const GOOD = getAddress("0x00000000000000000000000000000000000000b0");
const USDC = getAddress("0x754704Bc059F8C67012fEd69BC8A327a5aafb603");
const SET = "0x" + "ab".repeat(32);
const A = (o = {}) => ({ status: 0, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 0, triggerTag: "0x" + "00".repeat(32), trustLow: 0n, distrustUp: 0n, eLow: 0n, passesPolicy: false, ...o });
const req = (o = {}) => ({ selectedRequirements: { scheme: "exact", network: "eip155:143", asset: USDC, payTo: GOOD, amount: "10000", maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2", erc8004AgentId: "12" }, ...o } });

function reader({ passes = true, wallet = GOOD, assessment = A(), fail = false } = {}) {
  const calls = [];
  return { calls, readContract: async ({ functionName }) => {
    calls.push(functionName);
    if (fail) throw new Error("rpc down");
    return { identity: ID, getAgentWallet: wallet, passesAnchorPolicy: passes, assess: assessment }[functionName];
  } };
}
const guard = (o = {}, g = {}) => { const r = reader(o); return { r, g: ancreGuard({ readContract: r.readContract, chainId: 143, ancre: ANCRE, setId: SET, ...g }) }; };

test("client guard: an agent that passes the anchor policy -> no abort (02-bis ABI: passesAnchorPolicy)", async () => {
  const { r, g } = guard();
  assert.equal(await g(req()), undefined);
  assert.deepEqual(r.calls, ["identity", "getAgentWallet", "passesAnchorPolicy"]);
});

test("client guard: untrusted / vetoed / wallet mismatch / no agent id / rpc error -> abort with a reason", async () => {
  const g = (o) => guard(o).g;
  assert.match((await g({ passes: false })(req())).reason, /UNTRUSTED/);
  assert.match((await g({ passes: false, assessment: A({ status: 4, triggerTag: keccak256(toHex("veto")) }) })(req())).reason, /VETOED \(veto\)/);
  assert.match((await g({ wallet: ID })(req())).reason, /not the agentWallet/);
  assert.match((await g({})(req({ extra: { name: "USDC", version: "2" } }))).reason, /no ERC-8004 agentId/);
  assert.match((await g({ fail: true })(req())).reason, /could not read the verdict.*refusing/);
});

test("M3: the guard applies the CLI's offer rule (network, scheme, asset, domain, amount) and refuses a zero agentWallet", async () => {
  // the review's PoC (e/guard_net.mjs): offers on Base, Ethereum, solana, upto, any asset, 1e9 were all ALLOWED
  const bad = [
    req({ network: "eip155:8453" }), req({ network: "eip155:1" }), req({ network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" }),
    req({ scheme: "upto" }), req({ asset: GOOD }), req({ extra: { name: "USD Coin", version: "2", erc8004AgentId: "12" } }),
    req({ extra: { name: "USDC", version: "2", assetTransferMethod: "permit2", erc8004AgentId: "12" } }),
  ];
  for (const b of bad) {
    const { r, g } = guard();
    const out = await g(b);
    assert.ok(out?.abort, JSON.stringify(b.selectedRequirements));
    assert.match(out.reason, /not an offer ANCRE pays/);
    assert.deepEqual(r.calls, [], "refused before any read");
  }
  const capped = guard({}, { maxAmount: 10_000n }).g;
  assert.equal(await capped(req({ amount: "10000" })), undefined);
  assert.match((await capped(req({ amount: "1000000000" }))).reason, /max-amount/);
  // 0x0 == 0x0 used to pass when payTo was the zero address
  assert.match((await guard({ wallet: zeroAddress }).g(req({ payTo: zeroAddress }))).reason, /no agentWallet/);
  // a reader on another chain refuses everything; an unsupported chainId is a loud configuration error
  assert.match((await guard({}, { getChainId: async () => 10143 }).g(req())).reason, /chain 10143, not 143/);
  assert.throws(() => ancreGuard({ readContract: async () => 0, chainId: 8453, ancre: ANCRE, setId: SET }), (e) => e.code === "ANCRE_BAD_CHAIN");
});

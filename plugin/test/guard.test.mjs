import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, keccak256, toHex } from "viem";
import { ancreGuard } from "../dist/lib/x402-guard.js";

const ANCRE = getAddress("0x00000000000000000000000000000000000000dd");
const ID = getAddress("0x00000000000000000000000000000000000000cc");
const GOOD = getAddress("0x00000000000000000000000000000000000000b0");
const A = (o = {}) => ({ status: 0, trust: 0n, trustRobust: 0n, distrust: 0n, e: 0n, certBlock: 5n, vetoCount: 0, triggerTag: "0x" + "00".repeat(32), trustLow: 0n, distrustUp: 0n, eLow: 0n, trusted: false, ...o });
const req = (o = {}) => ({ selectedRequirements: { payTo: GOOD, amount: "10000", network: "eip155:143", extra: { erc8004AgentId: "12" }, ...o } });

function reader({ trusted = true, wallet = GOOD, assessment = A(), fail = false } = {}) {
  const calls = [];
  return { calls, readContract: async ({ functionName, args }) => {
    calls.push(functionName);
    if (fail) throw new Error("rpc down");
    return { identity: ID, getAgentWallet: wallet, isTrusted: trusted, assess: assessment }[functionName];
  } };
}

test("client guard: trusted agent -> no abort", async () => {
  const r = reader();
  assert.equal(await ancreGuard({ readContract: r.readContract, ancre: ANCRE, setId: "0x" + "ab".repeat(32) })(req()), undefined);
  assert.deepEqual(r.calls, ["identity", "getAgentWallet", "isTrusted"]);
});

test("client guard: untrusted / vetoed / wallet mismatch / no agent id / rpc error -> abort with a reason", async () => {
  const g = (o) => ancreGuard({ readContract: reader(o).readContract, ancre: ANCRE, setId: "0x" + "ab".repeat(32) });
  assert.match((await g({ trusted: false })(req())).reason, /UNTRUSTED/);
  assert.match((await g({ trusted: false, assessment: A({ status: 4, triggerTag: keccak256(toHex("veto")) }) })(req())).reason, /VETOED \(veto\)/);
  assert.match((await g({ wallet: ID })(req())).reason, /not the agentWallet/);
  assert.match((await g({})(req({ extra: {} }))).reason, /no ERC-8004 agentId/);
  assert.match((await g({ fail: true })(req())).reason, /could not read the verdict.*refusing/);
});

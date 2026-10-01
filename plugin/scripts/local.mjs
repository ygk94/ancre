// Local test bench shared by t1.mjs and demo-local.mjs: an `anvil --network monad` fork of the Monad testnet, the
// T1 deploy (same forge script as the real run), and an x402-rs-like facilitator emulated over RPC.
// Nothing here touches a real network beyond reading the fork's state.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi, toHex } from "viem";

export const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
export const CONTRACTS = new URL("../../contracts/", import.meta.url).pathname;
export const TESTNET = "https://testnet-rpc.monad.xyz";
export const CHAIN_ID = 10143;
export const NETWORK = "eip155:10143";
export const FAC = getAddress("0x7f6a2850669202519f0FE8aa912451238820Db86");
export const USDC = getAddress("0x534b2f3A21130d7a60830c2Df862319e593943A3");
export const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
export const UPTO = getAddress("0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002");
// anvil's well-known dev accounts: only ever used against the local fork
export const DEV_D = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const DEV_P = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
export const DEV_F = getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");

export const usdcAbi = parseAbi([
  "function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
  "function balanceOf(address) view returns (uint256)",
]);
export const oracleAbi = parseAbi(["function setBurn(uint256)", "function setAgent(uint256,address,bool,uint8)"]);

export async function startAnvil(port = "8546") {
  const proc = spawn(`${FOUNDRY}/anvil`, ["--network", "monad", "--fork-url", TESTNET, "--chain-id", String(CHAIN_ID),
    "--port", port, "--timeout", "120000", "--retries", "10", "--silent"], { stdio: "ignore" });
  const rpc = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      await createPublicClient({ transport: http(rpc) }).getChainId();
      return { rpc, stop: () => proc.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  proc.kill();
  throw new Error("anvil did not start");
}

/** Local fork only: broadcast records go to a temp dir, never over contracts/broadcast/T1.s.sol/10143 of the real run. */
export function forgeScript(rpc, env, auth) {
  const scratch = mkdtempSync(join(tmpdir(), "ancre-t1-"));
  const out = execFileSync(`${FOUNDRY}/forge`, ["script", "script/t1/T1.s.sol", "--rpc-url", rpc, ...auth, "--broadcast",
    "--gas-estimate-multiplier", "110", "--slow"], {
    cwd: CONTRACTS,
    env: { ...process.env, ...env, ETH_RPC_TIMEOUT: "900", FOUNDRY_BROADCAST: join(scratch, "broadcast"), FOUNDRY_CACHE_PATH: join(scratch, "cache") },
    encoding: "utf8",
  });
  const grab = (k) => (out.match(new RegExp(`${k}=(0x[0-9a-fA-F]{40})`)) || [])[1];
  return { oracle: grab("T1_ORACLE"), payer: grab("T1_PAYER"), out };
}

/** FiatToken v2.2 keeps balances in balanceAndBlacklistStates (slot 9): set test USDC on the fork only. */
export async function dealUsdc(pub, who, amount) {
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, 9n]));
  await pub.request({ method: "anvil_setStorageAt", params: [USDC, slot, toHex(amount, { size: 32 })] });
  const b = await pub.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [who] });
  if (b !== amount) throw new Error(`USDC balance slot guess wrong (got ${b})`);
}

/** x402-rs behaviour: /verify = eth_call of the settlement; /settle = eth_estimateGas, then send with that limit. */
export async function emulatedFacilitator(pub, phase, to, data) {
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
  return { ok: r.status === "success", phase, hash, gasLimit: gas, gasUsed: r.gasUsed, status: r.status };
}

/** calldata of USDC.transferWithAuthorization(..., bytes) for an x402 v2 `exact` payload */
export function exactSettlementCall(payload) {
  const a = payload.payload.authorization;
  return encodeFunctionData({ abi: usdcAbi, functionName: "transferWithAuthorization",
    args: [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, payload.payload.signature] });
}

/** advance the fork's clock (so that a refused authorisation expires before the next scene) */
export async function warp(pub, seconds) {
  await pub.request({ method: "evm_increaseTime", params: [toHex(seconds)] });
  await pub.request({ method: "evm_mine", params: [] });
}

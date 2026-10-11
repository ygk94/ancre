// The passkey anchor's veto (12/10): giveFeedback(provider-1, -100, "slash") on the ERC-8004 Reputation registry of
// Monad testnet, signed inside a Mera session on epoch key 0 and broadcast from the browser. In the "mera" anchor set
// (demo/mera.ts: anchor-A, anchor-B, this key) one slash is a veto: the next payment of the mera payer is refused.
import { encodeFunctionData, hexToBytes, keccak256, serializeTransaction, toHex, zeroHash, type Hex, type TransactionSerializableEIP1559 } from "viem";

export const TESTNET_RPC = "https://testnet-rpc.monad.xyz";
export const REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
/** Epoch 0 of label p4-proto: the address registered as an anchor of the mera set (demo/mera.ts MERA_ANCHOR). */
export const MERA_ANCHOR = "0xe3c887E2AEDaE83bCDb63143394B5887dd9f309b";
export const TARGET = { label: "provider-1 (demo)", agentId: 2050n };

const giveFeedbackAbi = [{ type: "function", name: "giveFeedback", stateMutability: "nonpayable", outputs: [], inputs: [
  { name: "agentId", type: "uint256" }, { name: "value", type: "int128" }, { name: "valueDecimals", type: "uint8" },
  { name: "tag1", type: "string" }, { name: "tag2", type: "string" }, { name: "endpoint", type: "string" },
  { name: "feedbackURI", type: "string" }, { name: "feedbackHash", type: "bytes32" }] }] as const;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(TESTNET_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

export type VetoResult = { hash: Hex; block: number; status: "success" | "reverted" };

/** Builds, signs (Mera) and sends the slash. `sign` is the Mera session's signDigest; `from` its address. */
export async function sendSlash(from: Hex, sign: (d: Uint8Array) => Promise<{ compact: Uint8Array; recovery: 0 | 1 }>, onStatus: (s: string) => void): Promise<VetoResult> {
  const data = encodeFunctionData({ abi: giveFeedbackAbi, functionName: "giveFeedback", args: [TARGET.agentId, -100n, 0, "slash", "demo", "", "", zeroHash] });
  const [nonce, gasPrice, est] = await Promise.all([
    rpc<Hex>("eth_getTransactionCount", [from, "pending"]),
    rpc<Hex>("eth_gasPrice", []),
    rpc<Hex>("eth_estimateGas", [{ from, to: REPUTATION, data }]),
  ]);
  const gas = (BigInt(est) * 11n) / 10n + 5_000n; // Monad bills the gas LIMIT: keep it tight
  const tx: TransactionSerializableEIP1559 = { type: "eip1559", chainId: 10143, nonce: Number(BigInt(nonce)), to: REPUTATION, data, gas,
    maxFeePerGas: BigInt(gasPrice), maxPriorityFeePerGas: BigInt(gasPrice) / 50n, value: 0n };
  onStatus("Signing with the passkey key (Mera session)…");
  const sig = await sign(hexToBytes(keccak256(serializeTransaction(tx))));
  const r = toHex(sig.compact.slice(0, 32));
  const s = toHex(sig.compact.slice(32, 64));
  const raw = serializeTransaction(tx, { r, s, yParity: sig.recovery });
  onStatus("Sending to Monad testnet…");
  const hash = await rpc<Hex>("eth_sendRawTransaction", [raw]);
  for (let i = 0; i < 60; i++) {
    const rc = await rpc<{ blockNumber: Hex; status: Hex } | null>("eth_getTransactionReceipt", [hash]);
    if (rc) return { hash, block: Number(BigInt(rc.blockNumber)), status: rc.status === "0x1" ? "success" : "reverted" };
    await new Promise((res) => setTimeout(res, 500));
  }
  return { hash, block: -1, status: "reverted" };
}

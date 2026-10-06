// x402 v2 `exact` payments for the scenes, and the facilitator that settles them.
// The typed data and the 246-byte blob are those of the TrustGatedPayer (contracts/PAYER.md §2), ported from
// plugin/src/lib/payer.ts so that demo/ does not depend on the plugin's build. Drift is caught at run time: every
// payer payment checks that our AncrePayment digest equals the contract's `paymentDigest` (see scenes.ts).
// Facilitator: on a fork it is EMULATED exactly as x402-rs does it (chantier 05, plugin/scripts/local.mjs:
// /verify = eth_call of the settlement, /settle = eth_estimateGas then a send with that limit); on the testnet it
// is the real HTTP facilitator.
import { randomBytes } from "node:crypto";
import {
  type Address, type Hash, type Hex, bytesToHex, encodeFunctionData, encodePacked, hexToBytes, size, toHex,
  decodeEventLog, getAddress,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { usdcAbi } from "./abi.ts";
import type { Chain } from "./chain.ts";
import { TESTNET } from "./config.ts";

export type Authorization = { from: Address; to: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex };

const DOMAIN_T = [
  { name: "name", type: "string" }, { name: "version", type: "string" },
  { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
] as const;
const TWA_T = [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] as const;

export function ancrePaymentTypedData(chainId: number, auth: Authorization, agentId: bigint) {
  return {
    types: {
      EIP712Domain: DOMAIN_T,
      AncrePayment: [
        { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "agentId", type: "uint256" },
      ],
    },
    primaryType: "AncrePayment",
    domain: { name: "ANCRE TrustGatedPayer", version: "1", chainId, verifyingContract: auth.from },
    message: { to: auth.to, value: auth.value, validAfter: auth.validAfter, validBefore: auth.validBefore, nonce: auth.nonce, agentId },
  } as const;
}

export function usdcAuthorizationTypedData(chainId: number, usdc: Address, auth: Authorization) {
  return {
    domain: { name: "USDC", version: "2", chainId, verifyingContract: usdc },
    types: { TransferWithAuthorization: TWA_T },
    primaryType: "TransferWithAuthorization",
    message: auth,
  } as const;
}

/** r|s|v with v in {27, 28}: the only form the payer accepts. */
function normalizeSignature(sig: Hex): Hex {
  const b = hexToBytes(sig);
  if (b.length !== 65) throw new Error(`unexpected signature length ${b.length}`);
  if (b[64] === 0 || b[64] === 1) b[64] += 27;
  return bytesToHex(b);
}

/** Kind-1 blob (246 bytes): 0x01|agentId|to|value|validAfter|validBefore|nonce|opSig (PAYER.md §2). */
export function encodeExactBlob(auth: Authorization, agentId: bigint, opSig: Hex): Hex {
  const blob = encodePacked(
    ["uint8", "uint256", "address", "uint256", "uint256", "uint256", "bytes32", "bytes"],
    [1, agentId, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, normalizeSignature(opSig)],
  );
  if (size(blob) !== 246) throw new Error(`blob length ${size(blob)} != 246`);
  return blob;
}

export function newAuthorization(from: Address, to: Address, value: bigint, nowSec: number, timeout = 120): Authorization {
  return { from, to, value, validAfter: BigInt(nowSec - 600), validBefore: BigInt(nowSec + timeout), nonce: bytesToHex(randomBytes(32)) };
}

/** x402 v2 requirements (`accepted`) and payload: identical for an EOA and for the payer (from = payer, signature = blob). */
export function requirements(network: string, usdc: Address, payTo: Address, amount: bigint, agentId?: bigint) {
  return {
    scheme: "exact", network, amount: amount.toString(), asset: usdc, payTo, maxTimeoutSeconds: 120,
    extra: { name: "USDC", version: "2", ...(agentId !== undefined ? { erc8004AgentId: agentId.toString() } : {}) },
  };
}

export function paymentPayload(req: ReturnType<typeof requirements>, auth: Authorization, signature: Hex, resource: string) {
  return {
    x402Version: 2,
    resource: { url: resource },
    accepted: req,
    payload: {
      signature,
      authorization: {
        from: auth.from, to: auth.to, value: auth.value.toString(), validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(), nonce: auth.nonce,
      },
    },
  };
}

export type FacilitatorResult = {
  phase: "verify" | "settle";
  ok: boolean;
  error?: string;
  httpStatus?: number;
  hash?: Hash;
  block?: number;
  gasLimit?: bigint;
  gasUsed?: bigint;
  broadcast?: boolean;
};

export interface Facilitator {
  verify(payload: ReturnType<typeof paymentPayload>, req: ReturnType<typeof requirements>): Promise<FacilitatorResult>;
  settle(payload: ReturnType<typeof paymentPayload>, req: ReturnType<typeof requirements>): Promise<FacilitatorResult>;
}

function settlementCall(payload: ReturnType<typeof paymentPayload>): Hex {
  const a = payload.payload.authorization;
  return encodeFunctionData({ abi: usdcAbi, functionName: "transferWithAuthorization",
    args: [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, payload.payload.signature] });
}

/** x402-rs behaviour on a local chain (chantier 05, plugin/scripts/local.mjs `emulatedFacilitator`). */
export class EmulatedFacilitator implements Facilitator {
  chain: Chain;
  usdc: Address;
  signer: Address = TESTNET.facilitatorSigner;
  constructor(chain: Chain, usdc: Address) {
    this.chain = chain;
    this.usdc = usdc;
  }
  async verify(payload: ReturnType<typeof paymentPayload>): Promise<FacilitatorResult> {
    try {
      await this.chain.pub.call({ account: this.signer, to: this.usdc, data: settlementCall(payload) });
      return { phase: "verify", ok: true };
    } catch (e) {
      return { phase: "verify", ok: false, error: shortError(e) };
    }
  }
  async settle(payload: ReturnType<typeof paymentPayload>): Promise<FacilitatorResult> {
    const data = settlementCall(payload);
    let gas: bigint;
    try {
      gas = await this.chain.pub.estimateGas({ account: this.signer, to: this.usdc, data });
    } catch (e) {
      return { phase: "settle", ok: false, error: shortError(e), broadcast: false };
    }
    await this.chain.impersonate(this.signer);
    await this.chain.setBalance(this.signer, 10n ** 20n);
    const hash = await this.chain.pub.request({ method: "eth_sendTransaction" as never,
      params: [{ from: this.signer, to: this.usdc, data, gas: toHex(gas) }] as never }) as Hash;
    const r = await this.chain.pub.waitForTransactionReceipt({ hash });
    return { phase: "settle", ok: r.status === "success", hash, block: Number(r.blockNumber), gasLimit: gas, gasUsed: r.gasUsed, broadcast: true };
  }
}

/** The real facilitator (testnet): POST /verify and /settle, x402 v2 body. */
export class HttpFacilitator implements Facilitator {
  chain: Chain;
  url: string;
  constructor(chain: Chain, url: string) {
    this.chain = chain;
    this.url = url;
  }
  async call(phase: "verify" | "settle", payload: unknown, req: unknown) {
    const res = await fetch(`${this.url}/${phase}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: req }) });
    const text = await res.text();
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    return { status: res.status, body };
  }
  async verify(payload: ReturnType<typeof paymentPayload>, req: ReturnType<typeof requirements>): Promise<FacilitatorResult> {
    const { status, body } = await this.call("verify", payload, req);
    const ok = status === 200 && body.isValid === true;
    return { phase: "verify", ok, httpStatus: status, error: ok ? undefined : JSON.stringify(body).slice(0, 300) };
  }
  async settle(payload: ReturnType<typeof paymentPayload>, req: ReturnType<typeof requirements>): Promise<FacilitatorResult> {
    const { status, body } = await this.call("settle", payload, req);
    const hash = body.transaction as Hash | undefined;
    if (!hash) return { phase: "settle", ok: false, httpStatus: status, error: JSON.stringify(body).slice(0, 300), broadcast: false };
    const r = await this.chain.pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    const tx = await this.chain.pub.getTransaction({ hash });
    return { phase: "settle", ok: r.status === "success" && body.success === true, httpStatus: status, hash,
      block: Number(r.blockNumber), gasLimit: tx.gas, gasUsed: r.gasUsed, broadcast: true };
  }
}

/** The USDC Transfer(from, to, value) of a settlement receipt, read on-chain: the "true receipt" of scene 3. */
export async function transferInReceipt(chain: Chain, hash: Hash, usdc: Address) {
  const r = await chain.pub.getTransactionReceipt({ hash });
  for (const l of r.logs) {
    if (getAddress(l.address) !== usdc) continue;
    try {
      const ev = decodeEventLog({ abi: usdcAbi, data: l.data, topics: l.topics });
      if (ev.eventName === "Transfer") return ev.args as { from: Address; to: Address; value: bigint };
    } catch { /* other event */ }
  }
  return undefined;
}

export function shortError(e: unknown): string {
  const x = e as { shortMessage?: string; message?: string };
  return (x.shortMessage || x.message || String(e)).slice(0, 300);
}

export async function signTyped(account: PrivateKeyAccount, td: { domain: object; types: object; primaryType: string; message: object }) {
  const { EIP712Domain: _drop, ...types } = td.types as Record<string, unknown>;
  return account.signTypedData({ ...td, types } as never);
}

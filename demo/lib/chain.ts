// Chain access for the scenes: one public client, wallet clients per demo account, transactions with TIGHT gas
// limits (estimate x 1.10 + 5 000: Monad bills the limit) and a cost ledger used by demo/BUDGET.md.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Abi, type Address, type Hash, type Hex, type PublicClient, type TransactionReceipt,
  createPublicClient, createWalletClient, encodeFunctionData, getAddress, http, toHex,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { CONTRACTS, GAS_MARGIN_ABS, GAS_MARGIN_BPS } from "./config.ts";

export type Mode = "fork" | "frozen" | "testnet";

export type TxRecord = {
  label: string; fn: string; from: Address; hash: Hash; block: number; status: "success" | "reverted";
  estimate: bigint; gasLimit: bigint; gasUsed: bigint; gasPrice: bigint; costWei: bigint;
};

export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(join(CONTRACTS, "out", `${name}.sol`, `${name}.json`), "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as Hex };
}

export class Chain {
  pub: PublicClient;
  ledger: TxRecord[] = [];
  rpc: string;
  mode: Mode;
  chainId: number;
  // no TS parameter properties: Node's type stripping only accepts erasable syntax
  constructor(rpc: string, mode: Mode, chainId: number) {
    this.rpc = rpc;
    this.mode = mode;
    this.chainId = chainId;
    this.pub = createPublicClient({ transport: http(rpc, { timeout: 120_000, retryCount: 5 }) }) as PublicClient;
  }

  wallet(account: PrivateKeyAccount) {
    return createWalletClient({ account, transport: http(this.rpc, { timeout: 120_000, retryCount: 5 }) });
  }

  static limit(estimate: bigint): bigint {
    return (estimate * (10_000n + GAS_MARGIN_BPS) + 9_999n) / 10_000n + GAS_MARGIN_ABS;
  }

  /** Send one transaction (contract call, deployment or plain transfer), wait for its receipt, record its cost. */
  async send(label: string, account: PrivateKeyAccount, req: {
    to?: Address; abi?: Abi; functionName?: string; args?: readonly unknown[]; value?: bigint; deploy?: Hex;
  }): Promise<TxRecord & { receipt: TransactionReceipt }> {
    const data = req.deploy ?? (req.abi ? encodeFunctionData({ abi: req.abi, functionName: req.functionName!, args: req.args ?? [] }) : undefined);
    const fn = req.deploy ? "deploy" : req.functionName ?? "transfer";
    const estimate = await this.pub.estimateGas({ account: account.address, to: req.to, data, value: req.value });
    const gasLimit = Chain.limit(estimate);
    const hash = await this.wallet(account).sendTransaction({ to: req.to ?? null, data, value: req.value, gas: gasLimit, chain: null });
    const receipt = await this.pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    const gasPrice = receipt.effectiveGasPrice ?? 0n;
    const rec: TxRecord = {
      label, fn, from: account.address, hash, block: Number(receipt.blockNumber), status: receipt.status,
      estimate, gasLimit, gasUsed: receipt.gasUsed, gasPrice, costWei: gasLimit * gasPrice,
    };
    this.ledger.push(rec);
    if (receipt.status !== "success") throw new Error(`${label}: ${fn} reverted (${hash})`);
    return { ...rec, receipt };
  }

  async block(): Promise<{ number: number; timestamp: number }> {
    const b = await this.pub.getBlock();
    return { number: Number(b.number), timestamp: Number(b.timestamp) };
  }

  async blockAt(n: number): Promise<number> {
    return Number((await this.pub.getBlock({ blockNumber: BigInt(n) })).timestamp);
  }

  // ---------------------------------------------------------------- fork-only helpers
  get isLocal() {
    return this.mode !== "testnet";
  }

  async setBalance(who: Address, wei: bigint) {
    this.assertLocal();
    await this.pub.request({ method: "anvil_setBalance" as never, params: [who, toHex(wei)] as never });
  }

  async impersonate(who: Address) {
    this.assertLocal();
    await this.pub.request({ method: "anvil_impersonateAccount" as never, params: [who] as never });
  }

  async rawRequest<T>(method: string, params: unknown[]): Promise<T> {
    return (await this.pub.request({ method: method as never, params: params as never })) as T;
  }

  assertLocal() {
    if (!this.isLocal) throw new Error("fork-only helper called on a real network");
  }
}

export const checksum = (a: string) => getAddress(a);

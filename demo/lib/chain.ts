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
  logs?: Record<string, number>; // events emitted, per contract (Envio budget: the indexer follows the registries)
};

/** Monad reserve balance (docs.monad.xyz/developer-essentials/reserve-balance, vault note 27/09): below 10 MON, a
 * value transfer that ends under the reserve reverts unless the sender sent nothing in the last 3 blocks. */
const RESERVE = 10n * 10n ** 18n;
const RESERVE_WINDOW = 3;

export function logsByAddress(r: TransactionReceipt): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of r.logs) out[l.address.toLowerCase()] = (out[l.address.toLowerCase()] ?? 0) + 1;
  return out;
}

export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const j = JSON.parse(readFileSync(join(CONTRACTS, "out", `${name}.sol`, `${name}.json`), "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as Hex };
}

export class Chain {
  pub: PublicClient;
  ledger: TxRecord[] = [];
  lastBlockOf = new Map<string, number>();
  fundedAt = new Map<string, number>(); // block of the last MON received from us

  rpc: string;
  mode: Mode;
  chainId: number;
  monadRules: boolean; // apply the reserve-balance waits (real testnet, or its rehearsal on an interval-mined fork)
  // no TS parameter properties: Node's type stripping only accepts erasable syntax
  constructor(rpc: string, mode: Mode, chainId: number, monadRules = mode === "testnet") {
    this.rpc = rpc;
    this.monadRules = monadRules;
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
    if (this.monadRules) {
      // the consensus checks fees against the balance seen 3 blocks earlier: a freshly funded sender waits
      const f = this.fundedAt.get(account.address);
      if (f !== undefined) await this.waitBlock(f + RESERVE_WINDOW + 1);
      if (req.value) await this.reserveWindow(account.address, req.value + gasLimit * (await this.pub.getGasPrice()));
    }
    const hash = await this.wallet(account).sendTransaction({ to: req.to ?? null, data, value: req.value, gas: gasLimit, chain: null });
    const receipt = await this.pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    const gasPrice = receipt.effectiveGasPrice ?? 0n;
    const rec: TxRecord = {
      label, fn, from: account.address, hash, block: Number(receipt.blockNumber), status: receipt.status,
      estimate, gasLimit, gasUsed: receipt.gasUsed, gasPrice, costWei: gasLimit * gasPrice, logs: logsByAddress(receipt),
    };
    this.ledger.push(rec);
    this.lastBlockOf.set(account.address, rec.block);
    if (req.value && req.to) this.fundedAt.set(getAddress(req.to), rec.block);
    if (receipt.status !== "success") throw new Error(`${label}: ${fn} reverted (${hash})`);
    return { ...rec, receipt };
  }

  /** Testnet only (anvil does not model it and mines only on demand): space value transfers that dip into the
   * reserve by more than 3 blocks after the sender's previous transaction. */
  async reserveWindow(from: Address, spend: bigint) { // spend = value + max fee of the transfer
    const bal = await this.pub.getBalance({ address: from });
    if (bal - spend >= RESERVE) return;
    const last = this.lastBlockOf.get(from);
    if (last !== undefined) await this.waitBlock(last + RESERVE_WINDOW + 1);
  }

  async waitBlock(n: number) {
    while (Number(await this.pub.getBlockNumber()) < n) await new Promise((r) => setTimeout(r, 300));
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

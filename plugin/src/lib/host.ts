import { CommandError, type CommandIO, type PluginCommandContext } from "@metamask/agent-wallet/plugin";
import { type Address, bytesToHex, createPublicClient, getAddress, type Hex, http, isAddress } from "viem";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Config } from "./config.js";
import { AncreError } from "./errors.js";
import type { Deps } from "./flows.js";

export type HostDeps = Deps & { chainId: () => Promise<number> };

/**
 * Builds the flow dependencies from the host context. Reads: ctx.publicClient (authenticated host gateway), or a
 * plain RPC when --rpc-url / ANCRE_RPC_URL is given (read-only commands work without `mm login`, e.g. for a jury).
 * Either way the reader's eth_chainId must be cfg.chainId, checked once here (K20).
 * Signatures and transactions: ctx.walletExecutor ONLY (MetaMask policy and MFA); the plugin never holds a key.
 */
export async function hostDeps(ctx: PluginCommandContext, io: CommandIO, cfg: Config, commandId: string | null, rpcUrl?: string): Promise<HostDeps> {
  const client = rpcUrl ? createPublicClient({ transport: http(rpcUrl) }) : ctx.publicClient(cfg.chainId);
  let id: number;
  try {
    id = await client.getChainId();
  } catch (e) {
    throw new AncreError("ANCRE_RPC_ERROR", `eth_chainId failed on ${rpcUrl ? rpcUrl : "the MetaMask gateway"}: ${(e as Error).message}`,
      rpcUrl ? "Check --rpc-url / ANCRE_RPC_URL" : "Run `mm login`, or pass --rpc-url for a read-only command");
  }
  if (id !== cfg.chainId) {
    throw new AncreError("ANCRE_WRONG_CHAIN", `The RPC is on chain ${id}, not on --chain-id ${cfg.chainId}`,
      "Use an RPC of the chain you ask about (check ANCRE_RPC_URL and ANCRE_CHAIN_ID)");
  }
  const deps: HostDeps = {
    readContract: (a) => client.readContract(a as never),
    chainId: () => client.getChainId(),
    fetch: globalThis.fetch.bind(globalThis),
    nowSec: () => Math.floor(Date.now() / 1000),
    random32: () => bytesToHex(randomBytes(32)),
    signal: io.signal,
  };
  if (commandId) {
    const execute = await ctx.walletExecutor(io, commandId);
    deps.signTypedData = async (typedData, summary, details) => {
      const r = (await execute(
        { kind: "typed-data", chainId: cfg.chainId, typedData: typedData as never, intent: { summary, action: "transfer", details } } as never,
        { signal: deps.signal } as never,
      )) as { kind: string; signature?: string; status?: string; failureCode?: string };
      if (r.kind !== "signature" || !r.signature) {
        throw new AncreError(
          "ANCRE_SIGN_FAILED",
          `The wallet did not sign (status ${r.status ?? "?"}${r.failureCode ? `, ${r.failureCode}` : ""})`,
          "If it is AWAITING_MFA, approve it; the x402 window may have expired: run inspect again, never loop",
        );
      }
      return r.signature as Hex;
    };
    deps.sendTransaction = async (tx, summary) => {
      const r = (await execute(
        { kind: "transaction", chainId: cfg.chainId, transaction: tx as never, intent: { summary, action: "transfer" } } as never,
        { waitForReceipt: true, signal: deps.signal } as never,
      )) as { hash?: string; status: string };
      return { hash: r.hash as Hex | undefined, status: r.status };
    };
  }
  return deps;
}

/** Selected wallet and its mode: "byok" if found among byokWallets, "server" among remoteWallets (host-owned shape). */
export function selectedWallet(snapshot: unknown): { address: Address; mode?: "byok" | "server" } | undefined {
  const a = selectedAddress(snapshot);
  if (!a) return undefined;
  const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const has = (l: unknown) => Array.isArray(l) && l.some((w) => rec(w) && typeof w.address === "string" && isAddress(w.address) && getAddress(w.address) === a);
  const snap = snapshot as Record<string, unknown>;
  return { address: a, mode: has(snap.byokWallets) ? "byok" : has(snap.remoteWallets) ? "server" : undefined };
}

/** Selected EVM address of the host wallet, narrowed at runtime (the snapshot type is host-owned). */
export function selectedAddress(snapshot: unknown): Address | undefined {
  const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  if (!rec(snapshot) || !rec(snapshot.selectedWallet) || !rec(snapshot.selectedWallet.ref)) return undefined;
  const ref = snapshot.selectedWallet.ref;
  let a = typeof ref.address === "string" ? ref.address : undefined;
  if (!a && typeof ref.id === "string") {
    const list = [snapshot.byokWallets, snapshot.remoteWallets].flatMap((l) => (Array.isArray(l) ? l : []));
    const m = list.find((w) => rec(w) && w.id === ref.id);
    a = rec(m) && typeof m.address === "string" ? m.address : undefined;
  }
  return a && isAddress(a) ? getAddress(a) : undefined;
}

/**
 * Library errors -> host CommandError (code, message, hint). A host CommandError passes through; anything else
 * becomes ANCRE_INTERNAL, so the host never suggests "run the command again" for an error of ours (SIMP7).
 */
export function toCommandError(e: unknown): never {
  if (e instanceof CommandError) throw e;
  if (e instanceof AncreError) throw new CommandError(e.code, e.message, e.hint);
  const msg = e instanceof Error ? e.message : String(e);
  throw new CommandError("ANCRE_INTERNAL", msg, "Do not retry automatically: tell the human what happened");
}

/**
 * The Guard Mode policy of the selected server wallet, as the host itself prints it (`mm wallet policy get --json`),
 * run with the same Node and the same mm entry point as this process (not a `mm` found on PATH). The policy lives
 * in MetaMask's backend; changing it goes through the host's policy update, which can require MFA (mm 7.0.0
 * `updatePolicy` answers `mfaRequired`; NOT VERIFIED in a real session).
 */
export function readGuardPolicy(signal?: AbortSignal): Promise<string> {
  const entry = process.argv[1];
  if (!entry) return Promise.reject(new Error("the mm entry point is unknown"));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [entry, "wallet", "policy", "get", "--json"],
      { timeout: 30_000, maxBuffer: 1 << 20, signal, env: process.env },
      (err, stdout, stderr) => (err ? reject(new Error(`${err.message}${stderr ? `: ${String(stderr).slice(0, 300)}` : ""}`)) : resolve(String(stdout))));
  });
}

/** Every address the host wallet manages (selected or not): none of them may sign a human override. */
export function allWalletAddresses(snapshot: unknown): Address[] {
  const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  if (!rec(snapshot)) return [];
  const out = new Set<Address>();
  const sel = selectedAddress(snapshot);
  if (sel) out.add(sel);
  for (const l of [snapshot.byokWallets, snapshot.remoteWallets]) {
    if (!Array.isArray(l)) continue;
    for (const w of l) if (rec(w) && typeof w.address === "string" && isAddress(w.address)) out.add(getAddress(w.address));
  }
  return [...out];
}

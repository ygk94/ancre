import { CommandError, type CommandIO, type PluginCommandContext } from "@metamask/agent-wallet/plugin";
import { type Address, bytesToHex, getAddress, type Hex, isAddress } from "viem";
import { randomBytes } from "node:crypto";
import { ConfigError, type Config } from "./config.js";
import { type Deps, FlowError } from "./flows.js";
import { X402Error } from "./x402.js";

/** Builds the flow dependencies from the host context: reads via ctx.publicClient, writes via ctx.walletExecutor only. */
export async function hostDeps(ctx: PluginCommandContext, io: CommandIO, cfg: Config, commandId: string | null): Promise<Deps> {
  const client = ctx.publicClient(cfg.chainId);
  const deps: Deps = {
    readContract: (a) => client.readContract(a as never),
    fetch: globalThis.fetch.bind(globalThis),
    nowSec: () => Math.floor(Date.now() / 1000),
    random32: () => bytesToHex(randomBytes(32)),
    signal: (io as unknown as { signal?: AbortSignal }).signal,
  };
  if (commandId) {
    const execute = await ctx.walletExecutor(io, commandId);
    deps.signTypedData = async (typedData, summary, details) => {
      const r = (await execute(
        { kind: "typed-data", chainId: cfg.chainId, typedData: typedData as never, intent: { summary, action: "transfer", details } } as never,
        { signal: deps.signal } as never,
      )) as { kind: string; signature?: string; status?: string; failureCode?: string };
      if (r.kind !== "signature" || !r.signature) {
        throw new FlowError(
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

/** Library errors -> host CommandError (code, message, hint). */
export function toCommandError(e: unknown): never {
  if (e instanceof FlowError || e instanceof X402Error || e instanceof ConfigError) throw new CommandError(e.code, e.message, e.hint);
  throw e;
}

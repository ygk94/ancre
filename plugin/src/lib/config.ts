import { type Address, getAddress, isAddress } from "viem";

/** Per-chain constants. USDC is native Circle FiatToken v2.2 on both (MESURÉ 27/09, docs/ressources/x402.md §5). */
export const CHAINS = {
  143: { network: "eip155:143", usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", rpc: "https://rpc.monad.xyz" },
  10143: { network: "eip155:10143", usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3", rpc: "https://testnet-rpc.monad.xyz" },
} as const satisfies Record<number, { network: string; usdc: Address; rpc: string }>;

export type ChainId = keyof typeof CHAINS;

export type Config = { chainId: ChainId; network: string; usdc: Address; payer: Address };

export class ConfigError extends Error {
  constructor(readonly code: string, message: string, readonly hint: string) {
    super(message);
  }
}

/** --chain-id / ANCRE_CHAIN_ID (default 143), --payer / ANCRE_PAYER (required). */
export function resolveConfig(
  inp: { chainId?: string; payer?: string },
  env: Record<string, string | undefined> = process.env,
): Config {
  const rawChain = inp.chainId ?? env.ANCRE_CHAIN_ID ?? "143";
  const chainId = Number(rawChain);
  if (!(chainId in CHAINS)) {
    throw new ConfigError("ANCRE_BAD_CHAIN", `Unsupported chain id ${rawChain}`, "Use 143 (Monad) or 10143 (Monad testnet)");
  }
  const rawPayer = inp.payer ?? env.ANCRE_PAYER;
  if (!rawPayer || !isAddress(rawPayer)) {
    throw new ConfigError(
      "ANCRE_NO_PAYER",
      "No TrustGatedPayer address",
      "Pass --payer 0x… or set ANCRE_PAYER to the payer contract your principal deployed",
    );
  }
  const c = CHAINS[chainId as ChainId];
  return { chainId: chainId as ChainId, network: c.network, usdc: getAddress(c.usdc), payer: getAddress(rawPayer) };
}

/** USDC amounts: 6 decimals, decimal strings only ("0.01" -> 10000n). */
export function parseUsdc(s: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new ConfigError("ANCRE_BAD_AMOUNT", `Invalid USDC amount "${s}"`, "Use a decimal like 0.01 (6 decimals max)");
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"));
}

export function fmtUsdc(v: bigint): string {
  const i = v / 1_000_000n;
  const f = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return f ? `${i}.${f}` : `${i}`;
}

import { type Address, getAddress, isAddress } from "viem";
import { AncreError } from "./errors.js";

/** Per-chain constants. USDC is native Circle FiatToken v2.2 on both (MESURÉ 27/09, docs/ressources/x402.md §5). */
export const CHAINS = {
  143: { network: "eip155:143", usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" },
  10143: { network: "eip155:10143", usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3" },
} as const satisfies Record<number, { network: string; usdc: Address }>;

export type ChainId = keyof typeof CHAINS;

export type Config = { chainId: ChainId; network: string; usdc: Address; payer: Address };

export function chainConfig(chainId: number): { chainId: ChainId; network: string; usdc: Address } {
  if (!(chainId in CHAINS)) {
    throw new AncreError("ANCRE_BAD_CHAIN", `Unsupported chain id ${chainId}`, "Use 143 (Monad) or 10143 (Monad testnet)");
  }
  const c = CHAINS[chainId as ChainId];
  return { chainId: chainId as ChainId, network: c.network, usdc: getAddress(c.usdc) };
}

/** --chain-id / ANCRE_CHAIN_ID (default 143), --payer / ANCRE_PAYER (required). */
export function resolveConfig(
  inp: { chainId?: string; payer?: string },
  env: Record<string, string | undefined> = process.env,
): Config {
  const rawChain = inp.chainId ?? env.ANCRE_CHAIN_ID ?? "143";
  if (!/^\d+$/.test(rawChain) || !(Number(rawChain) in CHAINS)) {
    throw new AncreError("ANCRE_BAD_CHAIN", `Unsupported chain id ${rawChain}`, "Use 143 (Monad) or 10143 (Monad testnet)");
  }
  const rawPayer = inp.payer ?? env.ANCRE_PAYER;
  if (!rawPayer || !isAddress(rawPayer)) {
    throw new AncreError(
      "ANCRE_NO_PAYER",
      "No TrustGatedPayer address",
      "Pass --payer 0x… or set ANCRE_PAYER to the payer contract your principal deployed",
    );
  }
  return { ...chainConfig(Number(rawChain)), payer: getAddress(rawPayer) };
}

/** USDC amounts: 6 decimals, decimal strings only ("0.01" -> 10000n). */
export function parseUsdc(s: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new AncreError("ANCRE_BAD_AMOUNT", `Invalid USDC amount "${s}"`, "Use a decimal like 0.01 (6 decimals max)");
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"));
}

/** An optional amount flag: absent -> undefined; present, even empty ("$CAP" unset), -> parsed or ANCRE_BAD_AMOUNT (D3e). */
export function optionalUsdc(s: string | null | undefined): bigint | undefined {
  return s === undefined || s === null ? undefined : parseUsdc(s);
}

export function fmtUsdc(v: bigint): string {
  const i = v / 1_000_000n;
  const f = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return f ? `${i}.${f}` : `${i}`;
}

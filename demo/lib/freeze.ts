// Frozen demo (D28, AM-5.8): an anvil state that replays scenes 1-6 WITHOUT any network, independent of a later
// registry upgrade and of the RPC's (non-archive) history.
//
// anvil's dump only holds the accounts the setup MODIFIED: the ERC-8004 and USDC implementations behind their proxies,
// and every slot that was only read, are missing, and an offline replay then "succeeds" against empty code (a call
// to a proxy whose implementation has no code returns success with no effect). So the freeze is built in three steps:
//   1. fork pinned on block B, setup (scene 0), then S0 = anvil_dumpState;
//   2. a full rehearsal of scenes 1-6 on the SAME fork: every remote account/slot they read lands in Foundry's
//      fork cache (~/.foundry/cache/rpc/monad-testnet/B/, zstd JSON), with its value at block B;
//   3. frozen = S0 + the cache entries S0 does not have (S0 wins: those slots were written by the setup).
// A slot that the replay reads and the rehearsal did not (a fresh EIP-3009 nonce, a new mapping key) is 0 offline,
// which is its true value at B as long as the replay follows the rehearsal's scenes.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync, zstdDecompressSync } from "node:zlib";
import type { Chain } from "./chain.ts";

type DumpAccount = { nonce: string | number; balance: string; code: string; storage: Record<string, string> };
type Dump = { accounts: Record<string, DumpAccount> } & Record<string, unknown>;

const pad32 = (h: string) => "0x" + h.replace(/^0x/, "").padStart(64, "0");

export async function dumpState(chain: Chain): Promise<Dump> {
  const hex = await chain.rawRequest<string>("anvil_dumpState", []);
  const buf = Buffer.from(hex.replace(/^0x/, ""), "hex");
  let text: string;
  try { text = gunzipSync(buf).toString("utf8"); } catch { text = buf.toString("utf8"); }
  return JSON.parse(text) as Dump;
}

/** Foundry's fork cache file for block B (the most recent one if several hosts or runs). */
export function forkCacheFile(block: number): string {
  const dir = join(homedir(), ".foundry", "cache", "rpc", "monad-testnet", String(block));
  if (!existsSync(dir)) throw new Error(`no fork cache in ${dir}`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  if (!files.length) throw new Error(`no fork cache file in ${dir}`);
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

type CacheCode = { LegacyAnalyzed?: { bytecode: string; original_len: number }; LegacyRaw?: string; Eip7702?: { delegated_address: string } };

function cacheCode(c: CacheCode | undefined | null): string {
  if (!c) return "0x";
  if (c.Eip7702) return "0xef0100" + c.Eip7702.delegated_address.replace(/^0x/, "").toLowerCase();
  if (c.LegacyAnalyzed) return "0x" + c.LegacyAnalyzed.bytecode.replace(/^0x/, "").slice(0, c.LegacyAnalyzed.original_len * 2);
  if (typeof c.LegacyRaw === "string") return c.LegacyRaw;
  throw new Error(`unknown code format in the fork cache: ${Object.keys(c).join(",")}`);
}

export function mergeCache(s0: Dump, cachePath: string) {
  const raw = readFileSync(cachePath);
  const cache = JSON.parse(zstdDecompressSync(raw).toString("utf8")) as {
    accounts: Record<string, { balance: string; nonce: number; code: CacheCode | null }>;
    storage: Record<string, Record<string, string>>;
  };
  const out: Dump = structuredClone(s0);
  let addedAccounts = 0;
  let addedSlots = 0;
  for (const [addr, a] of Object.entries(cache.accounts)) {
    const k = addr.toLowerCase();
    if (!out.accounts[k]) {
      out.accounts[k] = { nonce: a.nonce, balance: a.balance, code: cacheCode(a.code), storage: {} };
      addedAccounts++;
    }
  }
  for (const [addr, slots] of Object.entries(cache.storage)) {
    const acc = out.accounts[addr.toLowerCase()];
    if (!acc) continue;
    const have = new Set(Object.keys(acc.storage).map((s) => pad32(s)));
    for (const [slot, v] of Object.entries(slots)) {
      if (have.has(pad32(slot))) continue; // S0 wins: written by the setup
      acc.storage[pad32(slot)] = pad32(v);
      addedSlots++;
    }
  }
  return { state: out, addedAccounts, addedSlots };
}

export function writeFrozen(path: string, state: Dump) {
  writeFileSync(path, JSON.stringify(state));
}

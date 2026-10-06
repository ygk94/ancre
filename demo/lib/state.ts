// Resume state of the act on one chain: what was deployed, which agents exist, which steps are done and what they
// returned. A step recorded as done is skipped on the next run and its value is returned from here (resume after
// a failure without replaying everything). The chain stays the truth: on a fork the state is discarded if its
// ANCRE contract has no code (new anvil).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { OUT } from "./config.ts";

export type AgentRec = { agentId: string; owner: Address; wallet: Address; role: string };

export type State = {
  version: 1;
  mode: string;
  chainId: number;
  operator: Address;
  runId: string;
  ancre?: Address;
  payer?: Address;
  setId?: Hex;
  set?: Record<string, unknown>;
  agents: Record<string, AgentRec>;
  done: Record<string, { block: number; at: string; value?: unknown }>;
  notes: Record<string, unknown>;
};

/** JSON with bigints kept exact: {"$big": "123"}. */
export const encodeValue = (v: unknown): unknown =>
  v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? { $big: x.toString() } : x)));
export const decodeValue = <T>(v: unknown): T =>
  (v === undefined ? undefined : JSON.parse(JSON.stringify(v), (_, x) => (x && typeof x === "object" && "$big" in x ? BigInt(x.$big) : x))) as T;

export function statePath(name: string) {
  return join(OUT, `state-${name}.json`);
}

export function loadState(name: string): State | undefined {
  const p = statePath(name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as State) : undefined;
}

export function saveState(name: string, s: State) {
  mkdirSync(OUT, { recursive: true });
  const p = statePath(name);
  writeFileSync(p + ".tmp", JSON.stringify(s, null, 2));
  renameSync(p + ".tmp", p);
}

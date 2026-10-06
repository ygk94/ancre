// Resume state of the act on one chain: what was deployed, which agents exist, which steps are done.
// A step marked done is skipped on the next run (resume after a failure without replaying everything).
// The chain stays the truth: on a fork the state is discarded if its ANCRE contract has no code (new anvil).
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
  startBlock: number;
  ancre?: Address;
  payer?: Address;
  setId?: Hex;
  set?: Record<string, unknown>;
  agents: Record<string, AgentRec>;
  done: Record<string, { block: number; at: string }>;
  notes: Record<string, unknown>;
};

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

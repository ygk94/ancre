// Every read of the ANCRE verifier goes through here (tour 7: the 02-bis lot renames isTrusted ->
// passesAnchorPolicy and may reshape the Assessment). The demo never calls the trust predicate itself (the payer
// does, inside isValidSignature); it reads `assess`, whose `passesPolicy` field (named `trusted` before 02-bis) is the
// same answer. The demo keeps calling it `trusted` (event log format, EVENTS.md); the mapping is below. The ABI always comes from the forge artifact (contracts/out), never retyped.
import type { Abi, Address, Hex } from "viem";
import type { Chain } from "./chain.ts";

export const ANCRE_FN = { assess: "assess" } as const;

export type Assessment = {
  status: number; trusted: boolean; trust: bigint; trustRobust: bigint; trustLow: bigint; distrust: bigint; distrustUp: bigint;
  e: bigint; eLow: bigint; vetoCount: number; triggerTag: Hex; certBlock: bigint;
};

export async function readAssess(chain: Chain, ancre: { address: Address; abi: Abi }, agentId: bigint, setId: Hex, blockNumber?: bigint) {
  const a = await chain.pub.readContract({ ...ancre, functionName: ANCRE_FN.assess, args: [agentId, setId, true], blockNumber }) as
    Omit<Assessment, "trusted"> & { passesPolicy: boolean };
  if (typeof a.passesPolicy !== "boolean") throw new Error("assess(): no passesPolicy field (ABI out of date? run forge build)");
  const { passesPolicy, ...rest } = a;
  return { ...rest, trusted: passesPolicy } as Assessment;
}

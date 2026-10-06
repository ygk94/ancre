// Every read of the ANCRE verifier goes through here (tour 7: the 02-bis lot renames isTrusted ->
// passesAnchorPolicy and may reshape the Assessment). The demo never calls the trust predicate itself (the payer
// does, inside isValidSignature); it reads `assess`, whose `trusted` field is the same answer. A rename is a
// one-line change below. The ABI always comes from the forge artifact (contracts/out), never retyped.
import type { Abi, Address, Hex } from "viem";
import type { Chain } from "./chain.ts";

export const ANCRE_FN = { assess: "assess" } as const;

export type Assessment = {
  status: number; trusted: boolean; trust: bigint; trustRobust: bigint; trustLow: bigint; distrust: bigint; distrustUp: bigint;
  e: bigint; eLow: bigint; vetoCount: number; triggerTag: Hex; certBlock: bigint;
};

export function readAssess(chain: Chain, ancre: { address: Address; abi: Abi }, agentId: bigint, setId: Hex, blockNumber?: bigint) {
  return chain.pub.readContract({ ...ancre, functionName: ANCRE_FN.assess, args: [agentId, setId, true], blockNumber }) as Promise<Assessment>;
}

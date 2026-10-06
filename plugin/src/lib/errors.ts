import type { Address } from "viem";

/**
 * The one error class of the plugin: a stable ANCRE_* code, a message and a hint for the human or the skill.
 * toCommandError (host.ts) maps it to the host's CommandError; any other error becomes ANCRE_INTERNAL there.
 */
export class AncreError extends Error {
  constructor(readonly code: string, message: string, readonly hint: string) {
    super(message);
  }
}

/** ERC-8004 IdentityRegistry, the one getter the plugin reads. */
export const identityAbi = [
  { type: "function", name: "getAgentWallet", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

/** FiatToken v2 (EIP-3009): true once the authorisation (authorizer, nonce) was used or cancelled. */
export const usdcStateAbi = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export type ReadContract = (args: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;

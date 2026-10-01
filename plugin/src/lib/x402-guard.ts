import { type Address, getAddress, isAddress } from "viem";
import { ancreAbi } from "./payerAbi.js";
import { STATUSES } from "./payer.js";
import { type Assessment, tagName } from "./verdict.js";

/**
 * Client-side guard (b, D41 fallback): a hook for the official x402 SDK, `x402Client.onBeforePaymentCreation`,
 * for a payer that is a plain EOA (no TrustGatedPayer). It aborts before anything is signed unless
 * agentWallet(agentId) == payTo and AnchoredReputation.isTrusted(agentId, setId). Fails closed on any error.
 * It is advisory by construction (a compromised agent can sign anyway): the enforceable gate is the payer contract.
 *
 *   import { x402Client } from "@x402/fetch";
 *   const client = new x402Client().register("eip155:*", new ExactEvmScheme(account));
 *   client.onBeforePaymentCreation(ancreGuard({ readContract: pub.readContract, ancre, setId }));
 */
export type GuardOptions = {
  readContract: (args: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
  ancre: Address; // AnchoredReputation
  setId: `0x${string}`; // the anchor set: its policy (theta, rho, m, q, maxAge...) is committed in it (D39)
  /** agentId of the offer; default: the proposed extra.erc8004AgentId. Return undefined to refuse. */
  resolveAgentId?: (req: Requirements) => bigint | undefined;
  onDecision?: (d: GuardDecision) => void; // e.g. log for the demo screen
};

type Requirements = { payTo: string; amount: string; network: string; extra?: Record<string, unknown> };
export type GuardDecision = { payTo: string; agentId?: string; allowed: boolean; reason: string };

const identityAbi = [
  { type: "function", name: "getAgentWallet", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

const defaultAgentId = (req: Requirements): bigint | undefined => {
  const raw = req.extra?.erc8004AgentId;
  return typeof raw === "string" || typeof raw === "number" ? (/^\d+$/.test(String(raw)) ? BigInt(raw) : undefined) : undefined;
};

export function ancreGuard(opts: GuardOptions) {
  let identity: Address | undefined;
  return async (ctx: { selectedRequirements: Requirements }): Promise<void | { abort: true; reason: string }> => {
    const req = ctx.selectedRequirements;
    const decide = async (): Promise<GuardDecision> => {
      const agentId = (opts.resolveAgentId ?? defaultAgentId)(req);
      if (agentId === undefined) return { payTo: req.payTo, allowed: false, reason: "ANCRE: the offer declares no ERC-8004 agentId" };
      const id = agentId.toString();
      if (!isAddress(req.payTo)) return { payTo: req.payTo, agentId: id, allowed: false, reason: "ANCRE: invalid payTo" };
      identity ??= (await opts.readContract({ address: opts.ancre, abi: ancreAbi, functionName: "identity" })) as Address;
      const wallet = (await opts.readContract({ address: identity, abi: identityAbi, functionName: "getAgentWallet", args: [agentId] })) as Address;
      if (getAddress(wallet) !== getAddress(req.payTo)) {
        return { payTo: req.payTo, agentId: id, allowed: false, reason: `ANCRE: payTo is not the agentWallet of agent #${id}` };
      }
      const trusted = (await opts.readContract({ address: opts.ancre, abi: ancreAbi, functionName: "isTrusted", args: [agentId, opts.setId] })) as boolean;
      if (trusted) return { payTo: req.payTo, agentId: id, allowed: true, reason: "ANCRE: trusted" };
      const a = (await opts.readContract({ address: opts.ancre, abi: ancreAbi, functionName: "assess", args: [agentId, opts.setId, true] })) as Assessment;
      const status = STATUSES[a.status] ?? `status ${a.status}`;
      const tag = tagName(a.triggerTag);
      const why = status === "OK" ? `UNTRUSTED (trustLow ${a.trustLow})` : status === "VETOED" && tag ? `VETOED (${tag})` : status;
      return { payTo: req.payTo, agentId: id, allowed: false, reason: `ANCRE: agent #${id} ${why}` };
    };
    let d: GuardDecision;
    try {
      d = await decide();
    } catch (e) {
      d = { payTo: req.payTo, allowed: false, reason: `ANCRE: could not read the verdict (${(e as Error).message ?? e}), refusing` };
    }
    opts.onDecision?.(d);
    return d.allowed ? undefined : { abort: true, reason: d.reason };
  };
}

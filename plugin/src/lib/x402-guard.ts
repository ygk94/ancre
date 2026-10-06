import { type Address, getAddress, isAddress, zeroAddress } from "viem";
import { chainConfig } from "./config.js";
import { identityAbi, type ReadContract } from "./errors.js";
import { ancreAbi } from "./payerAbi.js";
import { STATUSES } from "./payer.js";
import { type Assessment, tagName } from "./verdict.js";
import { offerProblem } from "./x402.js";

/**
 * Client-side guard (b, D41 fallback): a hook for the official x402 SDK, `x402Client.onBeforePaymentCreation`,
 * for a payer that is a plain EOA (no TrustGatedPayer). It aborts before anything is signed unless the offer is
 * one ANCRE pays (the same rule as the CLI: exact, USDC of the chain ANCRE is read on, FiatToken domain, a valid
 * payTo, within maxAmount; M3), agentWallet(agentId) == payTo != 0, and
 * AnchoredReputation.passesAnchorPolicy(agentId, setId). Fails closed on any error.
 * It is advisory by construction (a compromised agent can sign anyway): the enforceable gate is the payer contract.
 *
 *   import { x402Client } from "@x402/fetch";
 *   const client = new x402Client().register("eip155:143", new ExactEvmScheme(account));
 *   client.onBeforePaymentCreation(ancreGuard({ readContract: pub.readContract, chainId: 143, ancre, setId }));
 */
export type GuardOptions = {
  readContract: ReadContract;
  /** the chain `readContract` and ANCRE live on (143 or 10143): an offer on any other network is refused */
  chainId: number;
  /** e.g. publicClient.getChainId: when given, checked once against chainId (a reader on another chain refuses all) */
  getChainId?: () => Promise<number>;
  ancre: Address; // AnchoredReputation
  setId: `0x${string}`; // the anchor set: its policy (theta, rho, m, q, maxAge...) is committed in it (D39)
  /** refuse offers above this amount (USDC base units, 6 decimals) */
  maxAmount?: bigint;
  /** agentId of the offer; default: the proposed extra.erc8004AgentId. Return undefined to refuse. */
  resolveAgentId?: (req: Requirements) => bigint | undefined;
  onDecision?: (d: GuardDecision) => void; // e.g. log for the demo screen
};

type Requirements = { scheme?: string; network: string; asset?: string; amount: string; payTo: string; maxTimeoutSeconds?: number; extra?: Record<string, unknown> };
export type GuardDecision = { payTo: string; agentId?: string; allowed: boolean; reason: string };

const defaultAgentId = (req: Requirements): bigint | undefined => {
  const raw = req.extra?.erc8004AgentId;
  return typeof raw === "string" || typeof raw === "number" ? (/^\d+$/.test(String(raw)) ? BigInt(raw) : undefined) : undefined;
};

export function ancreGuard(opts: GuardOptions) {
  const chain = chainConfig(opts.chainId); // throws on an unsupported chain: misconfiguration is loud, not permissive
  const rules = { network: chain.network, usdc: chain.usdc, maxAmount: opts.maxAmount };
  let identity: Address | undefined;
  let chainChecked = false;
  return async (ctx: { selectedRequirements: Requirements }): Promise<void | { abort: true; reason: string }> => {
    const req = ctx.selectedRequirements;
    const decide = async (): Promise<GuardDecision> => {
      const problem = offerProblem(req, rules);
      if (problem) return { payTo: req.payTo, allowed: false, reason: `ANCRE: not an offer ANCRE pays (${problem})` };
      const agentId = (opts.resolveAgentId ?? defaultAgentId)(req);
      if (agentId === undefined) return { payTo: req.payTo, allowed: false, reason: "ANCRE: the offer declares no ERC-8004 agentId" };
      const id = agentId.toString();
      if (!isAddress(req.payTo)) return { payTo: req.payTo, agentId: id, allowed: false, reason: "ANCRE: invalid payTo" };
      if (opts.getChainId && !chainChecked) {
        const got = await opts.getChainId();
        if (got !== chain.chainId) return { payTo: req.payTo, agentId: id, allowed: false, reason: `ANCRE: the reader is on chain ${got}, not ${chain.chainId}` };
        chainChecked = true;
      }
      identity ??= (await opts.readContract({ address: opts.ancre, abi: ancreAbi, functionName: "identity" })) as Address;
      const wallet = (await opts.readContract({ address: identity, abi: identityAbi, functionName: "getAgentWallet", args: [agentId] })) as Address;
      if (getAddress(wallet) === zeroAddress) return { payTo: req.payTo, agentId: id, allowed: false, reason: `ANCRE: agent #${id} has no agentWallet` };
      if (getAddress(wallet) !== getAddress(req.payTo)) {
        return { payTo: req.payTo, agentId: id, allowed: false, reason: `ANCRE: payTo is not the agentWallet of agent #${id}` };
      }
      const passes = (await opts.readContract({ address: opts.ancre, abi: ancreAbi, functionName: "passesAnchorPolicy", args: [agentId, opts.setId] })) as boolean;
      if (passes === true) return { payTo: req.payTo, agentId: id, allowed: true, reason: "ANCRE: passes the anchor policy" };
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

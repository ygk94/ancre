// Contract reads by the screen itself (viem, eth_call at a given block). The event log of chantier 06 already
// carries assess() as read by the scene script; when the run's RPC is reachable (fork or testnet) the screen
// re-reads it at the same block and says whether it matches. Read-only: no wallet, no transaction.
import { createPublicClient, http, parseAbi, type PublicClient } from "viem";

// AnchoredReputation.Assessment, field order of contracts/src/AnchoredReputation.sol
const ASSESSMENT =
  "struct Assessment { uint8 status; uint256 trust; uint256 trustRobust; uint256 distrust; uint256 e; uint64 certBlock; uint8 vetoCount; bytes32 triggerTag; uint256 trustLow; uint256 distrustUp; uint256 eLow; bool trusted; }";
const ANCRE_ABI = parseAbi([ASSESSMENT, "function assess(uint256 agentId, bytes32 setId, bool withVeto) view returns (Assessment)"]);
const PAYER_ABI = parseAbi([ASSESSMENT, "function decide(uint256 agentId, address to, uint256 value) view returns (uint8 reason, Assessment a)"]);

// enum orders, from contracts/src/AnchoredReputation.sol (Status) and TrustGatedPayer.sol (Reason)
const STATUS = ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"] as const;
const REASON = [
  "OK", "PAUSED", "BAD_FORMAT", "BAD_KIND", "DIGEST_MISMATCH", "OVER_LIMIT",
  "NO_WALLET", "WALLET_MISMATCH", "BAD_OPERATOR_SIG", "ANCRE_STATUS", "UNTRUSTED",
] as const;

const clients = new Map<string, PublicClient>();
function clientFor(rpc: string): PublicClient {
  let c = clients.get(rpc);
  if (!c) {
    c = createPublicClient({ transport: http(rpc, { timeout: 2_500, retryCount: 0 }) }) as PublicClient;
    clients.set(rpc, c);
  }
  return c;
}

export type OnchainRead = {
  block: number;
  status: string;
  trusted: boolean;
  trustLow: string;
  decide: string | null;
  ms: number; // measured round trip of the reads
};

/** assess(agentId, setId, true) and, if a payee is known, payer.decide(agentId, payTo, amount), at `block`. */
export async function readAgent(
  rpc: string,
  ancre: `0x${string}`,
  payer: `0x${string}` | null,
  setId: `0x${string}`,
  agentId: string,
  block: number,
  pay?: { to: `0x${string}`; amount: string },
): Promise<OnchainRead> {
  const c = clientFor(rpc);
  const t0 = performance.now();
  const blockNumber = BigInt(block);
  const [ra, rd] = await Promise.allSettled([
    c.readContract({ address: ancre, abi: ANCRE_ABI, functionName: "assess", args: [BigInt(agentId), setId, true], blockNumber }),
    payer && pay
      ? c.readContract({ address: payer, abi: PAYER_ABI, functionName: "decide", args: [BigInt(agentId), pay.to, BigInt(pay.amount)], blockNumber })
      : Promise.resolve(null),
  ]);
  if (ra.status === "rejected") throw ra.reason;
  const a = ra.value;
  // decide() may revert (cleared wallet, odd payee): keep the assess() that answered
  const d = rd.status === "fulfilled" ? rd.value : null;
  return {
    block,
    status: STATUS[a.status] ?? String(a.status),
    trusted: a.trusted,
    trustLow: a.trustLow.toString(),
    decide: d
      ? (REASON[d[0]] ?? String(d[0]))
      : rd.status === "rejected"
        ? /revert/i.test(String((rd.reason as Error)?.message ?? rd.reason)) ? "reverted" : "unavailable"
        : null,
    ms: Math.round(performance.now() - t0),
  };
}

// Contract reads by the screen itself (viem, eth_call at a given block). The event log of chantier 06 already
// carries assess() as read by the scene script; when the run's RPC is reachable (fork or testnet) the screen
// re-reads it at the same block and says whether it matches. Read-only: no wallet, no transaction.
import { createPublicClient, http, parseAbi, type PublicClient } from "viem";

export const ANCRE_ABI = parseAbi([
  "struct Assessment { uint8 status; uint256 trust; uint256 trustRobust; uint256 distrust; uint256 e; uint64 certBlock; uint8 vetoCount; bytes32 triggerTag; uint256 trustLow; uint256 distrustUp; uint256 eLow; bool trusted; }",
  "function assess(uint256 agentId, bytes32 setId, bool withVeto) view returns (Assessment)",
  "function isTrusted(uint256 agentId, bytes32 setId) view returns (bool)",
]);
export const PAYER_ABI = parseAbi([
  "struct Assessment { uint8 status; uint256 trust; uint256 trustRobust; uint256 distrust; uint256 e; uint64 certBlock; uint8 vetoCount; bytes32 triggerTag; uint256 trustLow; uint256 distrustUp; uint256 eLow; bool trusted; }",
  "function decide(uint256 agentId, address to, uint256 value) view returns (uint8 reason, Assessment a)",
  "event RefusalReported(bytes32 indexed hash, uint256 indexed agentId, address indexed to, uint8 reason, uint8 status, bytes32 triggerTag, uint256 trustLow, uint256 distrustUp, uint256 value)",
]);

// enum orders, from contracts/src/AnchoredReputation.sol (Status) and TrustGatedPayer.sol (Reason)
export const STATUS = ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"] as const;
export const REASON = [
  "OK", "PAUSED", "BAD_FORMAT", "BAD_KIND", "DIGEST_MISMATCH", "OVER_LIMIT",
  "NO_WALLET", "WALLET_MISMATCH", "BAD_OPERATOR_SIG", "ANCRE_STATUS", "UNTRUSTED",
] as const;

const clients = new Map<string, PublicClient>();
export function clientFor(rpc: string): PublicClient {
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
  e: string;
  certBlock: number;
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
  const [a, d] = await Promise.all([
    c.readContract({ address: ancre, abi: ANCRE_ABI, functionName: "assess", args: [BigInt(agentId), setId, true], blockNumber }),
    payer && pay
      ? c.readContract({ address: payer, abi: PAYER_ABI, functionName: "decide", args: [BigInt(agentId), pay.to, BigInt(pay.amount)], blockNumber })
      : Promise.resolve(null),
  ]);
  return {
    block,
    status: STATUS[a.status] ?? String(a.status),
    trusted: a.trusted,
    trustLow: a.trustLow.toString(),
    e: a.e.toString(),
    certBlock: Number(a.certBlock),
    decide: d ? (REASON[d[0]] ?? String(d[0])) : null,
    ms: Math.round(performance.now() - t0),
  };
}

/** The run header carries a URL on the testnet only ("local" on a fork: chantier 06 does not publish its port). */
export function rpcForRun(network: { mode: string; rpc: string }, forkRpc: string): string | null {
  if (/^https?:\/\//.test(network.rpc)) return network.rpc;
  if (network.mode === "fork") return forkRpc;
  return null; // frozen: the replay anvil is gone once the run ends
}

export async function headBlock(rpc: string): Promise<number> {
  return Number(await clientFor(rpc).getBlockNumber());
}

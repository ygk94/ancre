// Direct contract reads on Monad mainnet (option 1 of 10/10: no indexer for ANCRE's mainnet contract). Public RPC
// (NETWORKS.mainnet.http, 25 rps, no key), eth_call only: no wallet, no transaction. Every read is pinned to the
// same head block; a read that fails stays null (the screen shows "—"), nothing is filled in from the run log.
import { useEffect, useState } from "react";
import { parseAbi } from "viem";
import { NETWORKS } from "../config/networks";
import { reasonName, statusName, type OnchainAgent, type OnchainAssess, type OnchainState } from "../core/onchain";
import type { MainnetRun } from "../core/mainnetRun";
import runJson from "../data/mainnet-run.json";
import { clientFor } from "./chain";

export const mainnetRun = runJson as MainnetRun;

// field order of AnchoredReputation.Assessment / Policy (contracts/src/AnchoredReputation.sol)
const ASSESSMENT =
  "struct Assessment { uint8 status; uint256 trust; uint256 trustRobust; uint256 distrust; uint256 e; uint64 certBlock; uint8 vetoCount; bytes32 triggerTag; uint256 trustLow; uint256 distrustUp; uint256 eLow; bool passesPolicy; }";
const POLICY =
  "struct Policy { uint64 theta; uint32 rhoN; uint32 rhoD; uint8 minAnchors; uint8 vetoQuorum; int16 vetoMax; uint64 maxAge; uint64 minRefresh; uint64 slackRefresh; uint64 eLowMax; bool strictTransfer; bool registryVerified; bool ownerFallback; address[] submitters; }";
const ANCRE_ABI = parseAbi([
  ASSESSMENT,
  POLICY,
  "function assess(uint256 agentId, bytes32 setId, bool withVeto) view returns (Assessment)",
  "function policyOf(bytes32 setId) view returns (Policy)",
]);
const PAYER_ABI = parseAbi([
  ASSESSMENT,
  "function decide(uint256 agentId, address to, uint256 value) view returns (uint8 reason, Assessment a)",
  "function paused() view returns (bool)",
]);
const IDENTITY_ABI = parseAbi(["function getAgentWallet(uint256 agentId) view returns (address)"]);

/** amount of the decide() probe: the 0.01 USDC of the run's payments (6 decimals) */
export const PROBE_AMOUNT = 10_000n;

type Raw = {
  status: number; trust: bigint; trustRobust: bigint; distrust: bigint; e: bigint; certBlock: bigint; vetoCount: number;
  triggerTag: `0x${string}`; trustLow: bigint; distrustUp: bigint; eLow: bigint; passesPolicy: boolean;
};
export const toAssess = (a: Raw): OnchainAssess => ({
  status: statusName(a.status),
  trust: a.trust.toString(),
  trustRobust: a.trustRobust.toString(),
  trustLow: a.trustLow.toString(),
  distrust: a.distrust.toString(),
  distrustUp: a.distrustUp.toString(),
  e: a.e.toString(),
  certBlock: Number(a.certBlock),
  vetoCount: Number(a.vetoCount),
  triggerTag: /^0x0{64}$/.test(a.triggerTag) ? null : a.triggerTag,
  passesPolicy: a.passesPolicy,
});

const val = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);
const why = (r: PromiseSettledResult<unknown>, what: string) => (r.status === "rejected" ? [`${what}: ${String((r.reason as Error)?.message ?? r.reason).split("\n")[0]}`] : []);

export async function readMainnet(ids: string[], rpc = NETWORKS.mainnet.http, run: MainnetRun = mainnetRun): Promise<OnchainState> {
  const c = clientFor(rpc);
  const ancre = run.contracts.ancre as `0x${string}`;
  const payer = run.contracts.payer as `0x${string}`;
  const identity = run.contracts.identity as `0x${string}`;
  const setId = run.set.setId as `0x${string}`;
  const errors: string[] = [];
  const empty = (): OnchainState => ({ rpc, head: null, cert: null, maxAge: null, thetaPct: null, paused: null, agents: Object.fromEntries(ids.map((id) => [id, { agentId: id, assess: null, wallet: null, decide: null }])), readAt: new Date().toISOString(), errors });

  const h = await c.getBlock({ blockTag: "latest" }).then((b) => ({ number: Number(b.number), timestamp: Number(b.timestamp) }), (e) => {
    errors.push(`head: ${String((e as Error)?.message ?? e).split("\n")[0]}`);
    return null;
  });
  if (!h) return empty();
  const blockNumber = BigInt(h.number);

  const [pol, pau, ...per] = await Promise.allSettled([
    c.readContract({ address: ancre, abi: ANCRE_ABI, functionName: "policyOf", args: [setId], blockNumber }),
    c.readContract({ address: payer, abi: PAYER_ABI, functionName: "paused", blockNumber }),
    ...ids.flatMap((id) => [
      c.readContract({ address: ancre, abi: ANCRE_ABI, functionName: "assess", args: [BigInt(id), setId, true], blockNumber }),
      c.readContract({ address: identity, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [BigInt(id)], blockNumber }),
    ]),
  ]);
  errors.push(...why(pol, "policyOf"), ...why(pau, "paused"));
  const agents: Record<string, OnchainAgent> = {};
  ids.forEach((id, i) => {
    const ra = per[2 * i], rw = per[2 * i + 1];
    errors.push(...why(ra, `assess(${id})`), ...why(rw, `getAgentWallet(${id})`));
    const a = val(ra) as Raw | null;
    agents[id] = { agentId: id, assess: a ? toAssess(a) : null, wallet: (val(rw) as string | null) ?? null, decide: null };
  });

  // decide() needs the payee: the agent's own agentWallet, read above (0x0 -> the payer answers NO_WALLET)
  const certBlock = Object.values(agents).find((a) => a.assess && a.assess.certBlock > 0)?.assess?.certBlock ?? null;
  const [cb, ...dec] = await Promise.allSettled([
    certBlock ? c.getBlock({ blockNumber: BigInt(certBlock) }) : Promise.resolve(null),
    ...ids.map((id) =>
      agents[id].wallet
        ? c.readContract({ address: payer, abi: PAYER_ABI, functionName: "decide", args: [BigInt(id), agents[id].wallet as `0x${string}`, PROBE_AMOUNT], blockNumber })
        : Promise.resolve(null),
    ),
  ]);
  errors.push(...why(cb, "cert block"));
  ids.forEach((id, i) => {
    errors.push(...why(dec[i], `decide(${id})`));
    const d = val(dec[i]) as readonly [number, Raw] | null;
    if (d) agents[id].decide = reasonName(Number(d[0]));
  });
  const p = val(pol) as { maxAge: bigint; theta: bigint } | null;
  const b = val(cb) as { number: bigint; timestamp: bigint } | null;
  return {
    rpc,
    head: h,
    cert: b ? { number: Number(b.number), timestamp: Number(b.timestamp) } : null,
    maxAge: p ? Number(p.maxAge) : null,
    thetaPct: p ? Number(p.theta) / 1e16 : null,
    paused: (val(pau) as boolean | null) ?? null,
    agents,
    readAt: new Date().toISOString(),
    errors,
  };
}

// one read shared by every component of a page (same ids), refreshed once a minute while mounted
const cache = new Map<string, { at: number; p: Promise<OnchainState> }>();
const TTL = 30_000;
function shared(ids: string[]): Promise<OnchainState> {
  const k = ids.join(",");
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = readMainnet(ids);
  cache.set(k, { at: Date.now(), p });
  return p;
}

export function useMainnetChain(ids: string[], enabled = true): { st: OnchainState | null; loading: boolean } {
  const key = ids.join(",");
  const [st, setSt] = useState<OnchainState | null>(null);
  const [loading, setLoading] = useState(enabled && !!key);
  useEffect(() => {
    if (!enabled || !key) return;
    let dead = false;
    const go = () => {
      setLoading(true);
      shared(key.split(",")).then(
        (v) => !dead && (setSt(v), setLoading(false)),
        () => !dead && setLoading(false),
      );
    };
    go();
    const t = setInterval(go, 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [key, enabled]);
  return { st, loading };
}

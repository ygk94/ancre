// Shared state helpers used by the identity and reputation handlers.
// Every helper reads before it writes (handlers run twice: preload, then processing).
import type { EvmOnEventContext, Agent, ChainStats, RefEdge } from "envio";
import { REF_FILTER, ZERO, combine, controllerReason, REJECT_OF, type TagCandidate } from "./rules.js";

type Ctx = EvmOnEventContext;

export const lc = (a: string) => a.toLowerCase();

export function blankAgent(id: string): Agent {
  return { id, owner: ZERO, wallet: ZERO, approved: ZERO, uri: "", registeredBlock: undefined,
    registeredTxFrom: undefined, transferCount: 0, lastTransferBlock: undefined, refEdgeRows: 0 };
}

export async function getAgent(context: Ctx, id: string): Promise<Agent> {
  return (await context.Agent.get(id)) ?? blankAgent(id);
}

const BLANK_STATS: Omit<ChainStats, "id"> = { agents: 0, transfers: 0, feedbacks: 0, revoked: 0, selfRatings: 0,
  outOfRange: 0, refEdges: 0, sharedWallets: 0, agentsOnSharedWallets: 0, lastBlock: 0n };

export async function bumpStats(context: Ctx, block: number, delta: Partial<Record<keyof typeof BLANK_STATS, number>>) {
  const s = (await context.ChainStats.get("stats")) ?? { id: "stats", ...BLANK_STATS };
  const next: ChainStats = { ...s, lastBlock: BigInt(block) > s.lastBlock ? BigInt(block) : s.lastBlock };
  for (const [k, v] of Object.entries(delta) as [keyof typeof BLANK_STATS, number][]) {
    if (k !== "lastBlock") (next[k] as number) = (s[k] as number) + v;
  }
  context.ChainStats.set(next);
}

/** Move an agent between WalletAgents rows and keep the shared-wallet counters exact. */
export async function moveWallet(context: Ctx, agentId: string, from: string, to: string, block: number) {
  if (from === to) return;
  let dShared = 0;
  let dOnShared = 0;
  const [src, dst] = await Promise.all([
    from !== ZERO ? context.WalletAgents.get(from) : undefined,
    to !== ZERO ? context.WalletAgents.get(to) : undefined,
  ]);
  if (src) {
    const ids = src.agentIds.filter((x) => x !== agentId);
    if (src.count > 1) { dShared -= 1; dOnShared -= src.count; }
    if (ids.length > 1) { dShared += 1; dOnShared += ids.length; }
    context.WalletAgents.set({ ...src, agentIds: ids, count: ids.length });
  }
  if (to !== ZERO) {
    const ids = [...(dst?.agentIds ?? []).filter((x) => x !== agentId), agentId];
    const before = dst?.count ?? 0;
    if (before > 1) { dShared -= 1; dOnShared -= before; }
    if (ids.length > 1) { dShared += 1; dOnShared += ids.length; }
    context.WalletAgents.set({ id: to, agentIds: ids, count: ids.length });
  }
  if (dShared !== 0 || dOnShared !== 0) await bumpStats(context, block, { sharedWallets: dShared, agentsOnSharedWallets: dOnShared });
}

export async function isOperator(context: Ctx, owner: string, client: string): Promise<boolean> {
  if (owner === ZERO) return false;
  return (await context.Operator.get(`${owner}-${client}`))?.active ?? false;
}

/** D14 + D15 + bounds + D16/D20 for one (client, agent) pair, written to RefEdge. */
export async function recomputeRefEdge(context: Ctx, client: string, agentId: string, block: number) {
  const edgeId = `${client}-${agentId}`;
  const [agent, prev, ...triples] = await Promise.all([
    getAgent(context, agentId),
    context.RefEdge.get(edgeId),
    ...REF_FILTER.map((t) => context.TripleLatest.get(`${client}-${agentId}-${t}`)),
  ]);
  const fbs = await Promise.all(triples.map((t) => (t?.feedback_id ? context.Feedback.get(t.feedback_id) : undefined)));
  const cands: TagCandidate[] = [];
  for (const f of fbs) {
    if (f) cands.push({ tag1: f.tag1, value: f.value, decimals: f.valueDecimals, feedbackIndex: f.feedbackIndex });
  }
  const c = combine(cands);
  if (!c && !prev) return;
  let next: RefEdge;
  const base = { id: edgeId, client, agent_id: agentId, updatedAtBlock: BigInt(block) };
  const none = { w: 0, decidingTag: undefined, feedbackIndex: undefined };
  if (!c) {
    next = { ...base, ...none, rejected: "NO_ACTIVE_FEEDBACK" }; // every reference feedback of the pair is revoked
  } else if (c.kind === "none" && c.reason === "OUT_OF_BOUNDS_ONLY") {
    next = { ...base, ...none, rejected: "OUT_OF_BOUNDS_ONLY" };
  } else {
    const why = controllerReason(client, agent, await isOperator(context, agent.owner, client));
    if (why) next = { ...base, ...none, rejected: REJECT_OF[why] };
    else if (c.kind === "none") next = { ...base, ...none, rejected: "ZERO_WEIGHT" };
    else next = { ...base, w: c.w, decidingTag: c.tag1, feedbackIndex: c.feedbackIndex, rejected: "NONE" };
  }
  if (prev && prev.w === next.w && prev.rejected === next.rejected && prev.decidingTag === next.decidingTag &&
      prev.feedbackIndex === next.feedbackIndex) return;
  context.RefEdge.set(next);
  if (!prev) context.Agent.set({ ...agent, refEdgeRows: agent.refEdgeRows + 1 }); // lets recomputeEdgesInto skip edge-less agents
  const was = prev && prev.w !== 0 ? 1 : 0;
  const is = next.w !== 0 ? 1 : 0;
  if (was !== is) await bumpStats(context, block, { refEdges: is - was });
}

/** Controllers of `agentId` changed: recompute every reference edge pointing to it. */
export async function recomputeEdgesInto(context: Ctx, agentId: string, block: number) {
  if ((await getAgent(context, agentId)).refEdgeRows === 0) return; // fresh mints, farm agents: no query
  const edges = await context.RefEdge.getWhere({ agent_id: { _eq: agentId } });
  for (const e of edges) await recomputeRefEdge(context, e.client, agentId, block);
}

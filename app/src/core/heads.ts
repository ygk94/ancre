// Pure reducer of Monad block commit states (monadNewHeads), after docs/ressources/design-demo-et-soumission.md §4.2.
// Facts used (DOC + MEASURED 06/10 on testnet, 48 blocks): each block goes Proposed -> Voted -> Finalized -> Verified,
// a block may skip Voted, an abandoned proposal emits nothing (it is purged when another hash is finalized at its
// height), the subscription also replays states of earlier blocks.
export type CommitState = "Proposed" | "Voted" | "Finalized" | "Verified";
export const RANK: Record<CommitState, number> = { Proposed: 0, Voted: 1, Finalized: 2, Verified: 3 };

export type BlockSeen = { number: number; hash: string; state: CommitState; t: Partial<Record<CommitState, number>> };
export type HeadsState = {
  blocks: Map<string, BlockSeen>; // key: number:hash (two proposals at one height are two entries)
  head: number; // highest number seen in any state
  finalized: number; // highest Finalized (or Verified) number
  dropped: number; // speculative proposals purged
  latencies: { voted: number[]; finalized: number[] }; // ms from Proposed, local arrival clock, last 64
};
export type HeadMsg = { t: number; raw: { number: string; hash: string; commitState?: string } };

export const initialHeads = (): HeadsState => ({ blocks: new Map(), head: 0, finalized: 0, dropped: 0, latencies: { voted: [], finalized: [] } });
const push = (a: number[], x: number) => [...a, Math.round(x)].slice(-64);

export function reduceHead(s: HeadsState, m: HeadMsg): HeadsState {
  const n = Number(BigInt(m.raw.number));
  // plain `newHeads` (anvil) has no commitState: an anvil block is final when mined
  const state = (m.raw.commitState ?? "Finalized") as CommitState;
  if (!(state in RANK)) return s;
  const key = `${n}:${m.raw.hash}`;
  const prev = s.blocks.get(key);
  if (prev && RANK[prev.state] >= RANK[state]) return s; // duplicate or late lower state
  const blocks = new Map(s.blocks);
  const b: BlockSeen = { number: n, hash: m.raw.hash, state, t: { ...prev?.t, [state]: m.t } };
  blocks.set(key, b);
  const latencies = { ...s.latencies };
  if (b.t.Proposed !== undefined && state === "Voted") latencies.voted = push(latencies.voted, m.t - b.t.Proposed);
  if (b.t.Proposed !== undefined && state === "Finalized") latencies.finalized = push(latencies.finalized, m.t - b.t.Proposed);
  let { dropped, finalized } = s;
  if (RANK[state] >= RANK.Finalized) {
    for (const [k, o] of blocks) if (o.number === n && o.hash !== m.raw.hash) (blocks.delete(k), dropped++);
    finalized = Math.max(finalized, n);
  }
  // keep a bounded window
  if (blocks.size > 400) for (const [k, o] of blocks) if (o.number < n - 300) blocks.delete(k);
  return { blocks, head: Math.max(s.head, n), finalized, dropped, latencies };
}

/** Commit state of a block number as far as this screen knows (null = not seen). */
export function stateOf(s: HeadsState, n: number): CommitState | null {
  if (n <= s.finalized) return "Finalized";
  let best: CommitState | null = null;
  for (const b of s.blocks.values()) if (b.number === n && (!best || RANK[b.state] > RANK[best])) best = b.state;
  return best;
}

export const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

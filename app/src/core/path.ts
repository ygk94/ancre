// D50: how trust reaches an agent from the reader's anchors, hop by hop (anchors -> H1 -> H2). Pure.
// `inbound(id)` lists who carries positive mass into `id`: an anchor (by address) or another agent (by id).
import type { Reach } from "./model";

export type Source = { kind: "anchor" | "agent"; id: string };
/** One route: the anchors that start it, then the agents it goes through, ending with the target. */
export type Route = { anchors: string[]; agents: string[] };

export function trustRoutes(target: string, inbound: (id: string) => Source[], maxDepth = 5, maxRoutes = 6): Route[] {
  const chains: { anchor: string; agents: string[] }[] = [];
  const walk = (id: string, suffix: string[], seen: Set<string>) => {
    if (chains.length >= maxRoutes * 4 || suffix.length > maxDepth) return;
    for (const s of inbound(id)) {
      if (s.kind === "anchor") chains.push({ anchor: s.id, agents: [id, ...suffix] });
      else if (!seen.has(s.id)) walk(s.id, [id, ...suffix], new Set([...seen, s.id]));
    }
  };
  walk(target, [], new Set([target]));
  // anchors that start the same agent chain are shown together: "anchor-A, anchor-B -> provider-1 -> provider-3"
  const byChain = new Map<string, Route>();
  for (const c of chains) {
    const k = c.agents.join(">");
    const r = byChain.get(k) ?? { anchors: [], agents: c.agents };
    if (!r.anchors.includes(c.anchor)) r.anchors.push(c.anchor);
    byChain.set(k, r);
  }
  return [...byChain.values()].sort((a, b) => a.agents.length - b.agents.length).slice(0, maxRoutes);
}


/** Shortest reach from the anchors (BFS over `inbound`, no memo: the result never depends on the order the
 *  agents are visited). 1 hop = rated by an anchor (count = distinct anchors); k hops = via the agents that rate
 *  this one and lie on a shortest route. */
export function reachOf(target: string, inbound: (id: string) => Source[], maxDepth = 6): Reach {
  const direct = new Set(inbound(target).filter((s) => s.kind === "anchor").map((s) => s.id.toLowerCase()));
  if (direct.size) return { kind: "anchors", count: direct.size };
  // frontier entries: [agent id, the first-hop agent it was reached through]
  let frontier: [string, string][] = inbound(target).filter((s) => s.kind === "agent").map((s) => [s.id, s.id]);
  const seen = new Set([target, ...frontier.map((f) => f[0])]);
  for (let depth = 2; depth <= maxDepth && frontier.length; depth++) {
    const via = new Set<string>();
    const next: [string, string][] = [];
    for (const [id, first] of frontier)
      for (const s of inbound(id)) {
        if (s.kind === "anchor") via.add(first);
        else if (!seen.has(s.id)) (seen.add(s.id), next.push([s.id, first]));
      }
    if (via.size) return { kind: "hops", hops: depth, via: [...via] };
    frontier = next;
  }
  return { kind: "unreachable" };
}

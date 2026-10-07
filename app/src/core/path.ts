// D50: how trust reaches an agent from the reader's anchors, hop by hop (anchors -> H1 -> H2). Pure.
// `inbound(id)` lists who carries positive mass into `id`: an anchor (by address) or another agent (by id).
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

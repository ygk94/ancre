// Monad mainnet (143), PREVIEW: nothing of ANCRE is deployed there. Every ANCRE number below is COMPUTED by the
// reference solver (scripts/export_act1.py -> src/data/act1.json, reproducible), at the snapshot block of that
// file, under the anchors of one "lens". Names are quoted from 8004scan's public API (dated snapshot).
import type { AgentRow, Policy, Reach, ReviewGroup, Why } from "./model";
import { rowOrder } from "./runset";

export type ExportGroup = { why: string; tag: string; via: string | null; count: number; contribution: string; w: number | null; sampleRater: string };
export type ExportReviews = { total: number; groups: ExportGroup[]; groupsOmitted: number; inbound: { from: string; contribution: string; w: number; tag: string; client: string }[] };
export type ExportAgent = { inSupport: boolean; trust: string; trustRobust: string; distrust: string; verdict: { pay: boolean; reason: string; detail: string } };
export type ExportLens = {
  id: string;
  title: string;
  blurb: string;
  anchors: { address: string; label: string }[];
  alpha: string;
  m: number;
  schema: string;
  edges: number;
  certifiedNodes: number;
  eEff: string;
  massOnFarmWeighted: string;
  agents: Record<string, ExportAgent>;
  ranking: (ExportAgent & { agentId: string })[];
  reviews: Record<string, ExportReviews>;
};
export type RegistrySnap = { feedbacks: number; clients: number; naiveAverage: string | null; outOfRange: number; owner: string | null; wallet: string | null };
export type Act1 = {
  snapshotBlock: number;
  snapshotFeedbacks: number;
  snapshotAgents: number;
  policy: { theta: string; thetaPct: number; rhoN: number; rhoD: number };
  registry: Record<string, RegistrySnap>;
  featured: string[];
  lenses: ExportLens[];
  permissive: { schema: string; filter: string[]; edges: number; reviews: Record<string, ExportReviews> };
  command: string;
  source: string;
  rules: string;
};

export function mainnetPolicy(a: Act1, l: ExportLens): Policy {
  return {
    setId: null,
    anchors: l.anchors,
    m: l.m,
    thetaPct: a.policy.thetaPct,
    rho: `${a.policy.rhoN}/${a.policy.rhoD}`,
    alpha: l.alpha,
    level: "reference solver, not certified on-chain",
    onchain: false,
  };
}

export const groupsOf = (r: ExportReviews | undefined): ReviewGroup[] =>
  (r?.groups ?? []).map((g) => ({
    why: g.why as Why,
    tag: g.tag,
    count: g.count,
    via: g.via ? g.via.split(",") : [],
    author: g.sampleRater,
    value: null,
    w: g.w,
    contribution: g.contribution,
    block: null,
  }));

export function mainnetReach(l: ExportLens, id: string, seen = new Set<string>()): Reach {
  const inb = l.reviews[id]?.inbound.filter((x) => BigInt(x.contribution) > 0n) ?? [];
  const anchors = new Set(inb.filter((x) => x.from === "anchor").map((x) => x.client));
  if (anchors.size) return { kind: "anchors", count: anchors.size };
  const via = [...new Set(inb.filter((x) => x.from.startsWith("agent:")).map((x) => x.from.slice(6)))].filter((v) => !seen.has(v));
  const next = new Set([...seen, id]);
  const hops = via.map((v) => mainnetReach(l, v, next)).map((r) => (r.kind === "anchors" ? 1 : r.kind === "hops" ? r.hops : Infinity));
  const best = Math.min(...hops);
  return via.length && Number.isFinite(best) ? { kind: "hops", hops: best + 1, via } : { kind: "unreachable" };
}

export function mainnetRows(a: Act1, l: ExportLens, nameOf: (id: string) => string): AgentRow[] {
  const ids = new Set([...a.featured, ...l.ranking.map((r) => r.agentId), ...Object.keys(l.reviews)]);
  return [...ids]
    .map((id): AgentRow => {
      const x = l.agents[id] ?? l.ranking.find((r) => r.agentId === id);
      const reg = a.registry[id];
      return {
        net: "mainnet",
        id,
        name: nameOf(id),
        status: null,
        passes: !!x?.verdict.pay,
        why: x?.verdict.pay ? `leave-one-out mass over θ = ${a.policy.thetaPct} %` : (x?.verdict.detail ?? "not reachable from your anchors"),
        trust: x?.trust ?? "0",
        trustLow: x?.trustRobust ?? "0",
        distrust: x?.distrust ?? "0",
        e: l.eEff,
        certBlock: null,
        vetoTag: null,
        reach: mainnetReach(l, id),
        explorer: reg ? { ratings: reg.feedbacks, raters: reg.clients, naive: reg.naiveAverage } : null,
        owner: reg?.owner ?? null,
        wallet: reg?.wallet ?? null,
      };
    })
    .sort(rowOrder);
}

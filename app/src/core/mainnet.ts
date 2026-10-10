// Monad mainnet (143), whole-registry view. ANCRE's own contract on mainnet (minimal run of 10/10) is read
// elsewhere (core/onchain.ts, sources/mainnetChain.ts). Every number below is COMPUTED by the
// reference solver (scripts/export_act1.py -> src/data/act1.json, reproducible), at the snapshot block of that
// file, under the anchors of one "lens". Names are quoted from 8004scan's public API (dated snapshot).
import type { AgentRow, Policy, Reach, ReviewGroup, Why } from "./model";
import { rowOrder } from "./runset";
import { reachOf, type Source } from "./path";

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
  farm: { agents: number; eveFeedbacks: number };
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

export const mainnetInbound = (l: ExportLens) => (id: string): Source[] =>
  (l.reviews[id]?.inbound ?? [])
    .filter((x) => BigInt(x.contribution) > 0n && x.from !== "address")
    .map((x) => (x.from === "anchor" ? { kind: "anchor" as const, id: x.client } : { kind: "agent" as const, id: x.from.replace(/^agent:/, "") }));

export const mainnetReach = (l: ExportLens, id: string): Reach => reachOf(id, mainnetInbound(l));

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

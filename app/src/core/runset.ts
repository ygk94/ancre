// The anchor set of a recorded chantier 06 run (format ancre-demo-events-v1) as a Discover dataset: one row per
// agent at the END of the run, the ratings of each agent with their effective weight (D49), the trust path (D50),
// the certificates and the payer's decisions. Pure: lines in, values out. Everything comes from the log:
//  - agent rows: the last `agent.contract` (= AnchoredReputation.assess, read by the scene script) and
//    `agent.explorer` (every feedback re-read with readAllFeedback) of each agent: RECORDED;
//  - D49 classification: the set's committed tag schema (header.set.tags) applied to the logged ratings, with the
//    rules R2-R6 of solver/FORMAT.md, and the author's mass from its own last assess(): CALCULATED by the screen.
//    The contribution of each rating is NOT computed here (the log has no B+): it shows "—".
import { reduceAll, type DemoEvent, type Header, type ScreenState, type TagRow } from "./demo";
import type { AgentRow, Policy, ReviewGroup, Status, Why } from "./model";
import { reachOf, type Source } from "./path";

const GRID = 10_000n; // int16 weights on a 1e-4 grid (D18)

export type RunPayment = {
  seq: number;
  block: number;
  scene: number;
  agentId: string;
  decision: "PAID" | "REFUSED";
  reason: string;
  stage: string;
  amount: string; // USDC, 6 decimals
  status: string | null; // ANCRE status seen by explain()
  trustLow: string | null;
  settlementTx: string | null;
  facilitator: string | null;
};
export type RunCertificate = {
  seq: number;
  block: number;
  scene: number;
  action: string; // certified | skip_identical | rejected
  trigger: string | null;
  certBlock: number | null;
  nCert: number | null;
  eEff: string | null;
  graphRoot: string | null;
  tx: string | null;
  gasUsed: string | null;
  error: string | null; // rejected certificate: the contract's error
};
export type RunRating = {
  seq: number;
  block: number;
  scene: number;
  agentId: string;
  client: string;
  tag: string;
  value: string;
  decimals: number;
  feedbackIndex: number;
  tx: string | null;
};

export type RunSet = {
  header: Header;
  screen: ScreenState;
  policy: Policy;
  rows: AgentRow[];
  ratings: RunRating[];
  payments: RunPayment[];
  certificates: RunCertificate[];
  lastBlock: number;
  reviewsOf: (agentId: string) => ReviewGroup[];
  inboundOf: (agentId: string) => Source[];
  labelOf: (addressOrId: string) => string;
};

const lc = (a: string) => a.toLowerCase();

/** R4: normalised weight on the 1e-4 grid, or null when the value is outside the tag's bounds (never capped). */
export function quantize(value: string, decimals: number, t: TagRow): number | null {
  const x = BigInt(value) * 10n ** BigInt(18 - Math.min(18, decimals));
  const min = BigInt(t.min), n = BigInt(t.neutral), max = BigInt(t.max);
  if (x < min || x > max) return null;
  if (x === n) return 0;
  // BigInt division truncates toward zero, as the norm requires
  return Number(x > n ? ((x - n) * GRID) / (max - n) : ((x - n) * GRID) / (n - min));
}

type Ctx = {
  anchors: Map<string, string>; // address (lowercase) -> label
  tags: Map<string, TagRow>;
  byWallet: Map<string, string[]>; // wallet (lowercase) -> agent ids
  massOf: (agentId: string) => bigint; // raw mass Σλt of an agent, WAD
  controllers: Set<string>; // current controllers of the rated agent (owner, wallet), lowercase
};

/** D49 on logged ratings: R2 (endorsement only), R3 (latest per rater and tag), R4 (bounds), R5 (negative
 *  dominance across tags), R6 (a controller's positive edge is rejected), then who carries the edge. */
export function classifyRatings(rs: RunRating[], ctx: Ctx): ReviewGroup[] {
  const latest = new Map<string, RunRating>();
  for (const r of rs) {
    const t = ctx.tags.get(r.tag);
    if (!t || t.kind !== "endorsement") continue;
    const k = `${lc(r.client)}|${r.tag}`;
    const p = latest.get(k);
    if (!p || r.feedbackIndex > p.feedbackIndex || (r.feedbackIndex === p.feedbackIndex && r.seq > p.seq)) latest.set(k, r);
  }
  // R5: the deciding rating of each rater (most negative, else highest weight)
  const decide = new Map<string, { r: RunRating; q: number }>();
  for (const r of latest.values()) {
    const q = quantize(r.value, r.decimals, ctx.tags.get(r.tag)!);
    if (q === null) continue;
    const k = lc(r.client);
    const p = decide.get(k);
    // most negative, else highest; ties: the HIGHEST feedbackIndex decides (solver/FORMAT.md R5, F-6)
    const later = !p || r.feedbackIndex > p.r.feedbackIndex || (r.feedbackIndex === p.r.feedbackIndex && r.seq > p.r.seq);
    const better = !p || (q < 0 ? p.q >= 0 || q < p.q || (q === p.q && later) : p.q >= 0 && (q > p.q || (q === p.q && later)));
    if (better) decide.set(k, { r, q });
  }
  return rs.map((r) => {
    const t = ctx.tags.get(r.tag);
    const client = lc(r.client);
    const g = (why: Why, w: number | null = null, via: string[] = []): ReviewGroup => ({
      why, tag: r.tag, count: 1, via, author: r.client, value: display(r.value, r.decimals), w, contribution: null, block: r.block,
    });
    if (!t) return g("outside");
    if (t.kind !== "endorsement") return g("measurement");
    if (latest.get(`${client}|${r.tag}`) !== r) return g("superseded");
    const q = quantize(r.value, r.decimals, t);
    if (q === null) return g("out_of_bounds");
    const d = decide.get(client)!;
    if (d.r !== r) return g("combined", q);
    if (q === 0) return g("zero_weight", 0);
    if (q > 0 && ctx.controllers.has(client)) return g("controller", q);
    if (ctx.anchors.has(client)) return g(q > 0 ? "anchor" : "anchor_negative", q);
    const via = (ctx.byWallet.get(client) ?? []).filter((id) => ctx.massOf(id) > 0n);
    if (via.length) return g(q > 0 ? "hop" : "hop_negative", q, via);
    return g("unreachable", q);
  });
}

const display = (v: string, d: number) => (d ? (Number(v) / 10 ** d).toString() : v);

function controllersOf(h: Header, agentId: string): Set<string> {
  const a = h.actors?.find((x) => x.agentId === agentId);
  return new Set([a?.owner, a?.wallet].filter(Boolean).map((x) => lc(x!)));
}

export function verdictLine(passes: boolean, status: string, trust: string, trustLow: string, tag: string | null, thetaPct: number): string {
  if (status === "VETOED") return `vetoed by an anchor${tag ? ` (tag ${tag})` : ""}`;
  if (status !== "OK") return status;
  if (passes) return `leave-one-out mass over θ = ${thetaPct} %`;
  if (BigInt(trustLow) > 0n) return `leave-one-out mass under θ = ${thetaPct} %`;
  if (BigInt(trust) > 0n) return "reached by one anchor only: leave-one-out mass 0";
  return "not reachable from your anchors";
}

export const rowOrder = (a: AgentRow, b: AgentRow) =>
  Number(b.passes) - Number(a.passes) ||
  (BigInt(b.trustLow) > BigInt(a.trustLow) ? 1 : BigInt(b.trustLow) < BigInt(a.trustLow) ? -1 : 0) ||
  (BigInt(b.trust) > BigInt(a.trust) ? 1 : BigInt(b.trust) < BigInt(a.trust) ? -1 : 0) ||
  (b.explorer?.ratings ?? 0) - (a.explorer?.ratings ?? 0) ||
  Number(a.id) - Number(b.id);

export function buildRunSet(lines: (Header | DemoEvent)[]): RunSet | null {
  const screen = reduceAll(lines);
  const h = screen.header;
  if (!h?.set) return null;
  const set = h.set;
  const events = lines.filter((l): l is DemoEvent => l.type === "event");
  const clean = (s: string) => s.replace(/ \(demo\)/g, "");
  const anchors = new Map(set.anchors.map((a) => [lc(a.address), clean(a.label)]));
  const tags = new Map(set.tags.map((t) => [t.tag, t]));
  const actors = (h.actors ?? []).filter((a) => a.agentId);
  const byWallet = new Map<string, string[]>();
  for (const a of actors) if (a.wallet) byWallet.set(lc(a.wallet), [...(byWallet.get(lc(a.wallet)) ?? []), a.agentId!]);
  const people = new Map((h.actors ?? []).filter((a) => a.address).map((a) => [lc(a.address!), clean(a.label)]));
  const labelOf = (x: string) =>
    screen.agents[x]?.label ?? anchors.get(lc(x)) ?? people.get(lc(x)) ?? (byWallet.get(lc(x)) ? `wallet of ${byWallet.get(lc(x))!.map((id) => screen.agents[id]?.label ?? `#${id}`).join(", ")}` : x);

  // ratings as the registry holds them at the end of the run: `feedback`, the farm's `feedback-batch` (one
  // rating per client, index unknown), minus every `revoke` (R3: only non-revoked feedback counts)
  const revoked = new Set(events.filter((e) => e.kind === "revoke" && e.agentId && e.data?.client).map((e) => `${e.agentId}|${lc(e.data!.client)}|${e.data!.feedbackIndex}`));
  const ratings: RunRating[] = events
    .flatMap((e): RunRating[] => {
      if (!e.agentId || !e.data) return [];
      const one = (client: string, feedbackIndex: number): RunRating => ({
        seq: e.seq, block: e.block, scene: e.scene, agentId: e.agentId!, client, tag: e.data!.tag1, value: String(e.data!.value),
        decimals: Number(e.data!.decimals ?? 0), feedbackIndex, tx: e.tx?.hash ?? null,
      });
      if (e.kind === "feedback" && e.data.client) return [one(e.data.client, Number(e.data.feedbackIndex ?? 0))];
      if (e.kind === "feedback-batch" && Array.isArray(e.data.clients)) return e.data.clients.map((c: string) => one(c, 0));
      return [];
    })
    .filter((r) => !revoked.has(`${r.agentId}|${lc(r.client)}|${r.feedbackIndex}`));

  const massOf = (id: string) => BigInt(screen.agents[id]?.contract.trust ?? "0");
  const memo = new Map<string, ReviewGroup[]>();
  const reviewsOf = (id: string) => {
    let v = memo.get(id);
    if (!v) {
      v = classifyRatings(ratings.filter((r) => r.agentId === id), { anchors, tags, byWallet, massOf, controllers: controllersOf(h, id) });
      memo.set(id, v);
    }
    return v;
  };

  const inboundOf = (id: string): Source[] =>
    reviewsOf(id).flatMap((g): Source[] => (g.why === "anchor" && g.author ? [{ kind: "anchor", id: g.author }] : g.why === "hop" ? g.via.map((v) => ({ kind: "agent" as const, id: v })) : []));

  const rows: AgentRow[] = Object.values(screen.agents)
    .map((a) => {
      const c = a.contract;
      const actor = actors.find((x) => x.agentId === a.agentId);
      return {
        net: h.network.mode === "testnet" ? ("testnet" as const) : ("demo" as const),
        id: a.agentId,
        name: a.label,
        role: a.role,
        status: c.status as Status,
        passes: c.trusted,
        why: verdictLine(c.trusted, c.status, c.trust, c.trustLow, c.triggerTagName, set.thetaPct),
        trust: c.trust,
        trustLow: c.trustLow,
        distrust: c.distrust,
        e: c.e,
        certBlock: c.certBlock || null,
        vetoTag: c.status === "VETOED" ? c.triggerTagName : null,
        reach: reachOf(a.agentId, inboundOf),
        explorer: { ratings: a.explorer.feedbackCount, raters: a.explorer.clientCount, naive: a.explorer.naiveAverage },
        owner: actor?.owner ?? null,
        wallet: actor?.wallet ?? null,
      };
    })
    .sort(rowOrder);

  const payments: RunPayment[] = events
    .filter((e) => e.kind === "payment" && e.payer && e.agentId)
    .map((e) => ({
      seq: e.seq,
      block: e.block,
      scene: e.scene,
      agentId: e.agentId!,
      decision: e.payer!.decision,
      reason: e.payer!.reason,
      stage: e.payer!.stage,
      amount: e.payer!.amount,
      status: e.payer!.explain?.status ?? null,
      trustLow: e.payer!.explain?.trustLow ?? null,
      settlementTx: e.payer!.settlementTx,
      facilitator: e.payer!.facilitator?.verify ?? null,
    }));

  const certificates: RunCertificate[] = events
    .filter((e) => (e.kind === "certificate" && e.certificate) || e.kind === "rejected")
    .map((e) => {
      const c = e.certificate;
      const tx = c?.txs?.find((t: { fn: string }) => t.fn === "submitCertificate");
      return {
        seq: e.seq,
        block: e.block,
        scene: e.scene,
        action: e.kind === "rejected" ? "rejected" : String(c!.action),
        trigger: e.data?.trigger ?? null,
        certBlock: c?.certBlock ?? null,
        nCert: c?.nCert ?? null,
        eEff: c?.eEff ?? null,
        graphRoot: c?.graphRoot ?? null,
        tx: tx?.hash ?? null,
        gasUsed: tx?.gasUsed ?? null,
        error: e.kind === "rejected" ? (e.data?.error ?? null) : null,
      };
    });

  return {
    header: h,
    screen,
    policy: {
      setId: set.setId,
      anchors: set.anchors.map((a) => ({ address: a.address, label: clean(a.label) })),
      m: set.minAnchors,
      thetaPct: set.thetaPct,
      // not in the log header: the scene script's set config (demo/lib/config.ts, rhoN/rhoD 1/2, alphaN/alphaD 1/3)
      rho: "1/2",
      alpha: "1/3",
      level: set.level,
      onchain: h.network.mode === "testnet",
    },
    rows,
    ratings,
    payments,
    certificates,
    lastBlock: screen.block,
    reviewsOf,
    inboundOf,
    labelOf,
  };
}

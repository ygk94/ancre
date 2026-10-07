// Pure reducer over the chantier 06 event log (format ancre-demo-events-v1, demo/EVENTS.md).
// The SAME function renders live (tailing latest.json) and replay (a recorded run-*.json): no I/O here.

export const FORMAT = "ancre-demo-events-v1";

export type Actor = { label: string; role: string; address?: string; agentId?: string; owner?: string; wallet?: string };
export type TagRow = { tag: string; hash: string; kind: string; min: string; neutral: string; max: string };
export type Header = {
  type: "header";
  format: string;
  runId: string;
  network: { chainId: number; mode: "fork" | "frozen" | "testnet"; forkBlock: number | null; rpc: string };
  // absent from the first header of a run (written before scene 0 deploys anything): see journal 07, INTERFACE
  contracts?: { identity: string; reputation: string; ancre: string; payer: string; usdc: string };
  set?: {
    setId: string;
    anchors: { address: string; label: string }[];
    minAnchors: number;
    vetoQuorum: number;
    theta: string;
    thetaPct: number;
    level: string;
    submitter: string;
    maxAge: number;
    minRefresh: number;
    tags: TagRow[];
  };
  actors?: Actor[];
  startedAt: string;
};

export type Explorer = { feedbackCount: number; revokedCount: number; clientCount: number; naiveAverage: string | null };
export type Contract = {
  status: string;
  trusted: boolean;
  trust: string;
  trustRobust: string;
  trustLow: string;
  trustLowPct: number;
  theta: string;
  thetaPct: number;
  e: string;
  ePct: number;
  eLow: string;
  distrust: string;
  distrustUp: string;
  vetoCount: number;
  triggerTag: string | null;
  triggerTagName: string | null;
  certBlock: number;
};
export type Payer = {
  address: string;
  operator: string;
  payTo: string;
  amount: string;
  decision: "PAID" | "REFUSED";
  stage: string;
  reason: string;
  decide: string;
  explain: { reason: string; status: string; trustLow: string; distrustUp: string; triggerTag: string | null } | null;
  facilitator: { verify: string | null; settle: string | null } | null;
  settlementTx: string | null;
  providerReceived: string;
  payerBalanceAfter?: string;
};
export type Latency = {
  from: { step: string; block: number; wallMs: number };
  to: { step: string; block: number; wallMs: number };
  blocks: number;
  ms: number;
  parts: { name: string; blocks: number; ms: number }[];
  measured: "fork" | "frozen" | "testnet";
};
export type DemoEvent = {
  type: "event";
  seq: number;
  runId: string;
  scene: number;
  sceneName: string;
  step: string;
  attempt: number;
  kind: string;
  label: string;
  actor: string | null;
  agentId: string | null;
  setId?: string;
  tx: { hash: string; fn: string; block: number; status: string; gasLimit?: string; gasUsed?: string } | null;
  block: number;
  blockTimestamp: number;
  wallTime: string;
  wallMs: number;
  data: Record<string, any> | null;
  agent: { explorer: Explorer; contract: Contract } | null;
  payer: Payer | null;
  certificate: Record<string, any> | null;
  latency: Latency | null;
};

export type HistoryPoint = { naive: number | null; trustLowPct: number };
export type AgentState = {
  agentId: string;
  label: string;
  role: string;
  explorer: Explorer;
  contract: Contract;
  block: number;
  seq: number;
  lastPayment: (Payer & { block: number }) | null;
  history: HistoryPoint[];
};
export type FeedRow = {
  seq: number;
  block: number;
  lastBlock: number; // > block when consecutive identical ratings were folded into this row
  count: number; // 1, or the number of folded ratings
  raters: string[]; // distinct clients of the folded ratings
  scene: number;
  kind: string;
  text: string; // ready to display, without the verdict (shown apart)
  agentId: string | null;
  verdict: "PAID" | "REFUSED" | "REJECTED" | null;
  reason: string | null;
  detail: string | null;
  negative: boolean; // a negative rating (slash): highlighted
};
export type SceneState = { n: number; name: string; label: string; ok: boolean | null; checks?: { name: string; ok: boolean }[] };

export type ScreenState = {
  header: Header | null;
  lastSeq: number;
  block: number;
  scenes: SceneState[];
  agents: Record<string, AgentState>;
  focus: string | null;
  feed: FeedRow[];
  latency: Latency | null;
  paid: number;
  refused: number;
  warnings: string[];
};

export const initialScreen = (): ScreenState => ({
  header: null,
  lastSeq: 0,
  block: 0,
  scenes: [],
  agents: {},
  focus: null,
  feed: [],
  latency: null,
  paid: 0,
  refused: 0,
  warnings: [],
});

export const SCENE_TITLES: Record<number, string> = {
  0: "Setup",
  1: "Honest providers are paid",
  2: "A Sybil farm is refused",
  3: "The farm pays itself",
  4: "Circuit breaker",
  5: "Anti-erasure",
  6: "Fabricated certificate",
  7: "Second hop",
};

const FEED_KINDS = new Set(["feedback", "feedback-batch", "revoke", "certificate", "payment", "farm-payment", "rejected"]);

export function actorOf(h: Header | null, agentId: string | null): Actor | undefined {
  if (!h || !agentId) return undefined;
  return h.actors?.find((a) => a.agentId === agentId);
}

/** Display label of an actor: chantier 06 suffixes demo accounts with " (demo)"; the screen says it once, in the panel. */
const display = (label: string) => label.replace(/ \(demo\)/g, "");

function rowOf(e: DemoEvent, agentLabel: string | undefined): FeedRow {
  let verdict: FeedRow["verdict"] = null;
  let reason: string | null = null;
  let detail: string | null = null;
  if (e.kind === "payment" && e.payer) {
    verdict = e.payer.decision;
    reason = e.payer.decision === "REFUSED" ? e.payer.reason : null;
    const st = e.payer.explain?.status;
    detail = e.payer.decision === "REFUSED" ? `stage ${e.payer.stage}${st && st !== "OK" ? ` · ANCRE status ${st}` : ""}` : "settled";
  } else if (e.kind === "rejected") {
    verdict = "REJECTED";
    reason = e.data?.error ?? null;
    detail = e.data?.simulated ? "simulated (eth_estimateGas), nothing broadcast" : null;
  } else if (e.kind === "certificate" && e.certificate) {
    detail = e.certificate.action;
  } else if (e.kind === "feedback" && e.data) {
    detail = `${e.data.tag1} ${Number(e.data.value) > 0 ? "+" : ""}${e.data.value}`;
  }
  const usdc = (u: string) => (Number(u) / 1e6).toString();
  const text =
    e.kind === "payment" && e.payer ? `payer pays ${agentLabel ?? `#${e.agentId}`} ${usdc(e.payer.amount)} USDC` : display(e.label);
  return {
    seq: e.seq,
    block: e.block,
    lastBlock: e.block,
    count: 1,
    raters: e.data?.client ? [e.data.client] : [],
    scene: e.scene,
    kind: e.kind,
    text,
    agentId: e.agentId,
    verdict,
    reason,
    detail,
    negative: e.kind === "feedback" && Number(e.data?.value ?? 0) < 0,
  };
}

/** Consecutive ratings of one scene with the same tag and value (a farm's ring) fold into one row. */
function appendRow(feed: FeedRow[], r: FeedRow): FeedRow[] {
  const p = feed.at(-1);
  if (p && r.kind === "feedback" && p.kind === "feedback" && p.scene === r.scene && p.detail === r.detail) {
    const raters = [...new Set([...p.raters, ...r.raters])];
    const folded = { ...p, lastBlock: r.block, count: p.count + 1, raters, agentId: r.agentId };
    folded.text = `${folded.count} ratings “${r.detail}” from ${raters.length} raters`;
    return [...feed.slice(0, -1), folded];
  }
  return [...feed, r];
}

/** Apply one log line (header or event). Pure: returns a new state, never mutates `s`. */
export function reduce(s: ScreenState, line: Header | DemoEvent): ScreenState {
  if (line.type === "header") {
    if (line.format !== FORMAT) {
      return { ...s, warnings: [...s.warnings, `unknown format ${line.format} (expected ${FORMAT})`] };
    }
    // a new run resets the screen; a rewritten header of the same run (after each scene) only refreshes labels
    if (s.header && s.header.runId !== line.runId) return { ...initialScreen(), header: line };
    if (s.header && JSON.stringify(s.header) === JSON.stringify(line)) return s; // live re-read: no change
    const agents = { ...s.agents };
    for (const id of Object.keys(agents)) {
      const a = actorOf(line, id);
      if (a) agents[id] = { ...agents[id], label: display(a.label), role: a.role };
    }
    return { ...s, header: line, agents };
  }
  const e = line;
  if (!s.header) return s; // no (valid) header yet: an event is never read with guessed field semantics
  if (e.seq <= s.lastSeq) return s; // already applied (live re-reads the whole file)
  const next: ScreenState = { ...s, lastSeq: e.seq, block: Math.max(s.block, e.block) };

  if (e.kind === "scene-start") {
    next.scenes = [...s.scenes.filter((x) => x.n !== e.scene), { n: e.scene, name: e.sceneName, label: e.label, ok: null }];
  } else if (e.kind === "scene-end") {
    next.scenes = s.scenes.map((x) =>
      x.n === e.scene ? { ...x, ok: !!e.data?.ok, checks: (e.data?.checks ?? []).map((c: any) => ({ name: c.name, ok: !!c.ok })) } : x,
    );
  }

  if (e.agentId && e.agent) {
    const prev = s.agents[e.agentId];
    const actor = actorOf(s.header, e.agentId);
    // the header lists an agent only once its scene ends; a `register` event names it right away
    const reg = e.kind === "register" ? /registers (.+?) as agent #/.exec(e.label) : null;
    const naive = e.agent.explorer.naiveAverage === null ? null : Number(e.agent.explorer.naiveAverage);
    const point: HistoryPoint = { naive, trustLowPct: e.agent.contract.trustLowPct };
    next.agents = {
      ...s.agents,
      [e.agentId]: {
        agentId: e.agentId,
        label: display(actor?.label ?? reg?.[1] ?? prev?.label ?? `agent #${e.agentId}`),
        role: actor?.role ?? (e.kind === "register" ? e.data?.role : undefined) ?? prev?.role ?? "agent",
        explorer: e.agent.explorer,
        contract: e.agent.contract,
        block: e.block,
        seq: e.seq,
        lastPayment: e.payer ? { ...e.payer, block: e.block } : (prev?.lastPayment ?? null),
        history: [...(prev?.history ?? []), point].slice(-64),
      },
    };
    // focus follows the action, except setup noise (register / wallet of farm agents)
    if (e.kind !== "register" && e.kind !== "wallet") next.focus = e.agentId;
  }

  if (e.kind === "payment" && e.payer) {
    if (e.payer.decision === "PAID") next.paid = s.paid + 1;
    else next.refused = s.refused + 1;
  }
  if (e.latency) next.latency = e.latency;
  if (FEED_KINDS.has(e.kind)) next.feed = appendRow(s.feed, rowOf(e, e.agentId ? next.agents[e.agentId]?.label : undefined));
  return next;
}

/** Parse a .json run ({header, events}) or a .jsonl run (header line + event lines) into log lines. */
export function parseRun(text: string): (Header | DemoEvent)[] {
  const t = text.trim();
  let whole: any;
  try {
    whole = JSON.parse(t);
  } catch {
    whole = undefined; // not one JSON document: JSONL
  }
  if (whole?.header && Array.isArray(whole.events)) return [whole.header, ...whole.events];
  if (whole) return [whole];
  return t
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export const reduceAll = (lines: (Header | DemoEvent)[], s = initialScreen()) => lines.reduce(reduce, s);

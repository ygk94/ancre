// The activity feed (left column): latest ERC-8004 registry events and ANCRE's own events, one short line each.
// Pure: rows from Envio, from the public WebSocket (provisional until Envio indexes them) and from a recorded run
// come in; deduplicated, ordered items go out. Keys are shared between the WebSocket and Envio so that the indexed
// row replaces the provisional one.
import type { AgentNet } from "./model";
import type { RunSet } from "./runset";
import type { MainnetRun } from "./mainnetRun";
import { big, short } from "../lib/format";

export type FeedKind = "feedback" | "revoked" | "registered" | "transfer" | "certificate" | "skipped" | "rejected" | "veto" | "payment";
export type FeedItem = {
  key: string;
  origin: "registry" | "ancre";
  source: "envio" | "ws" | "run";
  kind: FeedKind;
  block: number;
  order: number; // log index (registry) or event seq (run), to order within a block
  agentId: string | null;
  net: AgentNet;
  title: string;
  detail: string;
  tone: "neutral" | "good" | "bad" | "warn";
};

export type EnvioFeedback = { id: string; agent_id: string; client: string; feedbackIndex: string; value: string; valueDecimals: number; tag1: string; blockNumber: string; logIndex: number };
export type EnvioRevoked = { id: string; agent_id: string; client: string; feedbackIndex: string; tag1: string; revokedAtBlock: string };
export type EnvioOwner = { id: string; agent_id: string; from: string; to: string; isMint: boolean; blockNumber: string; logIndex: number };
export type EnvioActivity = { feedbacks: EnvioFeedback[]; revoked: EnvioRevoked[]; owners: EnvioOwner[] };

/** value / 10^decimals for display; |value| >= 1e38 (the int128-scale farm values) in scientific notation. */
export function ratingValue(value: string, decimals: number): string {
  const v = BigInt(value);
  const abs = v < 0n ? -v : v;
  if (abs >= 10n ** 15n) {
    const b = big(value);
    const exp = (b.exp ?? 0) - decimals;
    return `${v < 0n ? "-" : ""}${Number(b.mant.replace("-", "")).toPrecision(3).replace(/\.?0+$/, "")}e${exp}`;
  }
  if (!decimals) return v.toString();
  return (Number(v) / 10 ** decimals).toString();
}

const lc = (s: string) => s.toLowerCase();
export const fbKey = (agentId: string, client: string, idx: string | number) => `fb:${agentId}-${lc(client)}-${idx}`;
export const rvKey = (agentId: string, client: string, idx: string | number) => `rv:${agentId}-${lc(client)}-${idx}`;
export const owKey = (block: string | number, logIndex: string | number) => `ow:${block}-${logIndex}`;

export function fromEnvio(a: EnvioActivity, net: AgentNet, nameOf: (id: string) => string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const f of a.feedbacks) {
    const neg = BigInt(f.value) < 0n;
    out.push({
      key: fbKey(f.agent_id, f.client, f.feedbackIndex),
      origin: "registry",
      source: "envio",
      kind: "feedback",
      block: Number(f.blockNumber),
      order: f.logIndex,
      agentId: f.agent_id,
      net,
      title: `${nameOf(f.agent_id)} rated ${ratingValue(f.value, f.valueDecimals)}`,
      detail: `${tagShort(f.tag1)} · by ${short(f.client)}`,
      tone: neg ? "bad" : "neutral",
    });
  }
  for (const r of a.revoked)
    out.push({
      key: rvKey(r.agent_id, r.client, r.feedbackIndex),
      origin: "registry",
      source: "envio",
      kind: "revoked",
      block: Number(r.revokedAtBlock),
      order: 0,
      agentId: r.agent_id,
      net,
      title: `${nameOf(r.agent_id)}: rating revoked`,
      detail: `${tagShort(r.tag1)} · by ${short(r.client)}`,
      tone: "warn",
    });
  for (const o of a.owners)
    out.push({
      key: owKey(o.blockNumber, o.logIndex),
      origin: "registry",
      source: "envio",
      kind: o.isMint ? "registered" : "transfer",
      block: Number(o.blockNumber),
      order: o.logIndex,
      agentId: o.agent_id,
      net,
      title: o.isMint ? `${nameOf(o.agent_id)} registered` : `${nameOf(o.agent_id)} transferred`,
      detail: o.isMint ? `owner ${short(o.to)}` : `${short(o.from)} → ${short(o.to)}`,
      tone: o.isMint ? "neutral" : "warn",
    });
  return out;
}

const tagShort = (t: string) => (t ? (t.length > 28 ? `${t.slice(0, 27)}…` : t) : "no tag");

/** ANCRE's own events of a recorded run: certificates, rejected certificates, anchor vetoes, payer decisions. */
export function fromRun(rs: RunSet): FeedItem[] {
  const net: AgentNet = rs.header.network.mode === "testnet" ? "testnet" : "demo";
  const name = (id: string) => rs.screen.agents[id]?.label ?? `#${id}`;
  const out: FeedItem[] = [];
  for (const c of rs.certificates) {
    const kind: FeedKind = c.action === "rejected" ? "rejected" : c.action === "certified" ? "certificate" : "skipped";
    out.push({
      key: `run:${rs.header.runId}:${c.seq}`,
      origin: "ancre",
      source: "run",
      kind,
      block: c.block,
      order: c.seq,
      agentId: null,
      net,
      title:
        kind === "rejected"
          ? `Certificate rejected · ${c.error ?? "error"}`
          : kind === "certificate"
            ? `Certificate accepted · ${c.nCert ?? "—"} nodes`
            : "Recertification skipped: graph unchanged",
      detail: kind === "rejected" ? "a fabricated edge, refused at submission (simulated)" : (c.trigger ?? ""),
      tone: kind === "rejected" ? "bad" : kind === "certificate" ? "good" : "neutral",
    });
  }
  const anchors = new Set(rs.policy.anchors.map((a) => lc(a.address)));
  for (const r of rs.ratings)
    if (anchors.has(lc(r.client)) && BigInt(r.value) < 0n)
      out.push({
        key: `run:${rs.header.runId}:${r.seq}`,
        origin: "ancre",
        source: "run",
        kind: "veto",
        block: r.block,
        order: r.seq,
        agentId: r.agentId,
        net,
        title: `Veto: ${rs.labelOf(r.client)} slashed ${name(r.agentId)}`,
        detail: `${r.tag} ${r.value} · read live by the contract`,
        tone: "bad",
      });
  for (const p of rs.payments)
    out.push({
      key: `run:${rs.header.runId}:${p.seq}`,
      origin: "ancre",
      source: "run",
      kind: "payment",
      block: p.block,
      order: p.seq,
      agentId: p.agentId,
      net,
      title: p.decision === "PAID" ? `Paid ${name(p.agentId)} ${Number(p.amount) / 1e6} USDC` : `Refused ${name(p.agentId)} · ${p.reason}`,
      detail: p.decision === "PAID" ? "x402, settled by the payer contract" : `payer contract, at ${p.stage}${p.status && p.status !== "OK" ? ` · ANCRE ${p.status}` : ""}`,
      tone: p.decision === "PAID" ? "good" : "bad",
    });
  return out;
}

/** Newest first; an indexed (Envio) row replaces a provisional WebSocket row with the same key. */
export function mergeFeed(prev: FeedItem[], incoming: FeedItem[], limit = 60): FeedItem[] {
  const m = new Map<string, FeedItem>();
  for (const x of [...prev, ...incoming]) {
    const p = m.get(x.key);
    if (!p || p.source === "ws" || x.source !== "ws") m.set(x.key, x);
  }
  return [...m.values()].sort((a, b) => b.block - a.block || b.order - a.order).slice(0, limit);
}

/** ANCRE's own events of the minimal mainnet run (10/10), RECORDED: certificates, the anchor's slash, the payer's
 *  decisions. What holds now is read from the contract elsewhere; these lines say what happened then. */
export function fromMainnetRun(run: MainnetRun, nameOf: (id: string) => string): FeedItem[] {
  const out: FeedItem[] = [];
  const name = (id: string) => {
    const l = run.agents.find((a) => a.agentId === id)?.label;
    return l && /\(demo\)/.test(l) ? l : nameOf(id);
  };
  const base = { origin: "ancre" as const, source: "run" as const, net: "mainnet" as const };
  run.certificates.forEach((c, i) =>
    out.push({ ...base, key: `mainnet:${run.runId}:cert:${i}`, kind: "certificate", block: c.certBlock, order: 0, agentId: null, title: `Certificate accepted · ${c.nCert ?? "—"} nodes`, detail: c.trigger ?? "", tone: "good" }),
  );
  run.feedbacks
    .filter((f) => BigInt(f.value || "0") < 0n)
    .forEach((f, i) =>
      out.push({ ...base, key: `mainnet:${run.runId}:veto:${i}`, kind: "veto", block: f.block, order: 1, agentId: f.agentId, title: `Veto: ${f.label}`, detail: `${f.tag} ${f.value} · read live by the contract`, tone: "bad" }),
    );
  run.payments.forEach((p, i) =>
    out.push({
      ...base,
      key: `mainnet:${run.runId}:pay:${i}`,
      kind: "payment",
      block: p.block,
      order: 2,
      agentId: p.agentId,
      title: p.decision === "PAID" ? `Paid ${name(p.agentId)} ${Number(p.amount) / 1e6} USDC` : `Refused ${name(p.agentId)} · ${p.reason}`,
      detail: p.decision === "PAID" ? "x402, settled by the real facilitator" : `payer contract, at ${p.stage}${p.status && p.status !== "OK" ? ` · ANCRE ${p.status}` : ""}`,
      tone: p.decision === "PAID" ? "good" : "bad",
    }),
  );
  return out.sort((a, b) => b.block - a.block || b.order - a.order);
}

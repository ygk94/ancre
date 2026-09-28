// Certificate audit (D32, D42): compare every committed edge with the registry state the indexer has rebuilt
// at the certificate's block. The guarantee D26 holds iff C_committed <= C_true entry by entry (D32).
//
//   FABRICATED   committed w != 0, registry weight 0 (no feedback, rejected, controller...)  -> proof (v)
//   INFLATED     committed w > registry w (a positive raised, or a negative softened)         -> proof (v)
//   WALLET       an agent row's committed wallet is not the client the rules designate (F4, D44)
//   OMITTED_NEG  a negative registry edge from the row's client to a certified agent is missing from a
//                provided row (a provided row is complete, ENCODING §3.2)                       -> proof (i)
//
// Pure logic over a RegistryView; the view is backed by the handler context or by the test indexer.
import { ZERO, combine, controllerReason, isEdgeTag, type EdgeSchema, type TagCandidate } from "./rules.js";
import type { CertRow } from "./certificate.js";

export type NodeInfo = { kind: "anchor" | "agent" | "address"; agentId?: bigint; address?: string };
export type AgentView = { owner: string; wallet: string; approved: string };

export interface RegistryView {
  agent(agentId: string): Promise<AgentView | undefined>;
  isOperator(owner: string, client: string): Promise<boolean>;
  /** Latest non-revoked feedback of (client, agent, tag1), any bounds (D14 selection). */
  latest(client: string, agentId: string, tag1: string): Promise<TagCandidate | undefined>;
  /** Agents the client has at least one (client, agent, tag) triple on. */
  agentsRatedBy(client: string): Promise<string[]>;
}

export type DiscrepancyKind = "FABRICATED" | "INFLATED" | "WALLET" | "OMITTED_NEG";
export type Discrepancy = {
  kind: DiscrepancyKind; u: number; dst?: number; client: string; agentId?: string;
  wCommitted: number; wRegistry: number; feedbackIndex?: number; registryFeedbackIndex?: string;
};
export type AuditResult = { edgesChecked: number; rowsChecked: number; discrepancies: Discrepancy[] };

/** Registry weight of the combined edge client -> agent under the set's schema (0 = no edge). */
export async function registryEdge(view: RegistryView, schema: EdgeSchema, client: string, agentId: string) {
  const cands: TagCandidate[] = [];
  for (const tag of schema.filter) {
    if (!isEdgeTag(tag, schema)) continue;
    const c = await view.latest(client, agentId, tag);
    if (c) cands.push(c);
  }
  const c = combine(cands, schema);
  if (!c || c.kind === "none") return { w: 0 };
  const a = await view.agent(agentId);
  if (a && controllerReason(client, a, await view.isOperator(a.owner, client))) return { w: 0 };
  return { w: c.w, feedbackIndex: c.feedbackIndex };
}

/** The client whose feedback a row speaks for: the anchor / address itself, or the agent's wallet (D16/D20), owner if none (D44). */
async function expectedClient(view: RegistryView, node: NodeInfo): Promise<string | undefined> {
  if (node.kind !== "agent") return node.address;
  const a = await view.agent(node.agentId!.toString());
  if (!a) return undefined;
  return a.wallet !== ZERO ? a.wallet : a.owner;
}

export async function auditRows(view: RegistryView, schema: EdgeSchema, nodes: NodeInfo[], rows: CertRow[]): Promise<AuditResult> {
  const out: Discrepancy[] = [];
  let edgesChecked = 0;
  const agentNode = new Map<string, number>();
  nodes.forEach((n, i) => { if (n.kind === "agent") agentNode.set(n.agentId!.toString(), i); });

  for (const row of rows) {
    const node = nodes[row.u];
    if (!node) throw new Error(`row u=${row.u} outside the node table`);
    const expected = await expectedClient(view, node);
    const client = node.kind === "agent" ? (row.wallet ?? expected) : node.address;
    if (node.kind === "agent" && row.wallet !== undefined && row.wallet !== expected) {
      out.push({ kind: "WALLET", u: row.u, client: row.wallet, agentId: node.agentId!.toString(), wCommitted: 0, wRegistry: 0 });
    }
    if (!client) continue;
    const listed = new Set<number>();
    for (const e of row.edges) {
      edgesChecked++;
      listed.add(e.dst);
      const dstNode = nodes[e.dst];
      const agentId = dstNode?.kind === "agent" ? dstNode.agentId!.toString() : undefined;
      const reg = agentId ? await registryEdge(view, schema, client, agentId) : { w: 0 };
      const base = { u: row.u, dst: e.dst, client, agentId, wCommitted: e.w, wRegistry: reg.w, feedbackIndex: e.feedbackIndex,
        registryFeedbackIndex: reg.feedbackIndex?.toString() };
      if (reg.w === 0) out.push({ kind: "FABRICATED", ...base });
      else if (e.w > reg.w) out.push({ kind: "INFLATED", ...base });
    }
    for (const agentId of await view.agentsRatedBy(client)) {
      const dst = agentNode.get(agentId);
      if (dst === undefined || dst === row.u || listed.has(dst)) continue;
      const reg = await registryEdge(view, schema, client, agentId);
      if (reg.w < 0) out.push({ kind: "OMITTED_NEG", u: row.u, dst, client, agentId, wCommitted: 0, wRegistry: reg.w,
        registryFeedbackIndex: reg.feedbackIndex?.toString() });
    }
  }
  return { edgesChecked, rowsChecked: rows.length, discrepancies: out };
}

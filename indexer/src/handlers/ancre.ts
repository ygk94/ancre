// AnchoredReputation (ANCRE verifier): every certificate is audited, in the handler, against the registry state the
// indexer has rebuilt at the certificate's block (D42). Events of the same chain are processed in (block, logIndex)
// order, so the identity and reputation entities read here are exactly the registry as of that log.
// Node tables and schemas come from the calldata of DIRECT calls to the contract (registerAnchorSet, addNodes,
// submitCertificate). Decoded calldata is only trusted when it provably is the committed data: the transaction targets
// the contract, the set params hash to the event's setId, the rows hash to the event's graphRoot. Anything else is
// reported as such (UNDECODABLE, ROOT_MISMATCH, NODES_MISSING), never audited against a guess.
import { indexer, type AnchorSet, type EvmOnEventContext, type SetHealth } from "envio";
import type { Discrepancy as AuditFinding, DiscrepancyKind, NodeInfo } from "../lib/audit.js";
import { auditRows } from "../lib/audit.js";
import { decodeRows, graphRoot, EncodingError } from "../lib/certificate.js";
import { decodeAppendedNodes, decodeCertCall, decodeSetCall, type SetTag } from "../lib/calls.js";
import { setSchema, storeView } from "../lib/view.js";
import { ZERO } from "../lib/rules.js";
import { lc } from "../lib/state.js";

/** On-chain remedy of a finding (contracts/PROOFS.md). In a Registry-verified set the contract re-reads every committed
 *  edge, so FABRICATED / INFLATED / WRONG_INDEX cannot be on chain at all; in a submitter-attested set they can. */
function proofOf(kind: DiscrepancyKind, registryVerified: boolean): string {
  switch (kind) {
    case "SOURCE": case "SOURCE_MISSING": return "proveWallet";
    case "SHAPE": return "refused at submission";
    case "WRONG_INDEX": return registryVerified ? "refused at submission" : "none (same weight, not provable)";
    default: return "proveEdge";
  }
}

const blankSet = (id: string): AnchorSet => ({
  id, kind: "onchain", anchors: undefined, lambdas: undefined, alphaN: undefined, alphaD: undefined, tagsJson: undefined,
  policyJson: undefined, ownerFallback: undefined, registryVerified: undefined, decodable: undefined, nodesComplete: undefined,
  nodeCount: undefined, registeredBlock: undefined, registeredTx: undefined,
});
const blankHealth = (id: string): SetHealth => ({
  id, set_id: id, certificates: 0, lastCertificate_id: undefined, lastCertBlock: undefined, status: "UNAUDITED",
  openDiscrepancies: 0, edgesProven: 0, rowsVoided: 0, transfersFlagged: 0, registryChangedAtBlock: undefined, lastEEff: undefined,
});
const isDirect = (to: string | undefined, contract: string) => to !== undefined && lc(to) === lc(contract);

indexer.onEvent(
  { contract: "AnchoredReputation", event: "AnchorSetRegistered", fields: { transaction: ["hash", "input", "to"] } },
  async ({ event, context }) => {
    const setId = event.params.setId.toLowerCase();
    const health = await context.SetHealth.get(setId);
    if (context.isPreload) return;
    const decoded = isDirect(event.transaction.to, event.srcAddress) ? decodeSetCall(event.transaction.input) : undefined;
    const call = decoded && decoded.setId.toLowerCase() === setId ? decoded : undefined; // params must hash to setId
    const anchors = event.params.anchors.map(lc); // the event is authoritative for the anchors (node indices 0..k-1)
    context.AnchorSet.set({
      ...blankSet(setId), anchors, lambdas: event.params.lambdas.map(String),
      alphaN: Number(event.params.alphaN), alphaD: Number(event.params.alphaD),
      tagsJson: call ? JSON.stringify(call.tags) : undefined, policyJson: call ? JSON.stringify(call.policy) : undefined,
      ownerFallback: call?.policy.ownerFallback, registryVerified: call?.policy.registryVerified,
      decodable: call !== undefined, nodesComplete: true, nodeCount: anchors.length,
      registeredBlock: BigInt(event.block.number), registeredTx: event.transaction.hash,
    });
    anchors.forEach((address, index) =>
      context.SetNode.set({ id: `${setId}-${index}`, set_id: setId, index, kind: "anchor", agentId: undefined, address }));
    if (!health) context.SetHealth.set(blankHealth(setId));
  },
);

indexer.onEvent(
  { contract: "AnchoredReputation", event: "NodesAdded", fields: { transaction: ["input", "to"] } },
  async ({ event, context }) => {
    const setId = event.params.setId.toLowerCase();
    const set = await context.AnchorSet.get(setId);
    if (context.isPreload || !set) return;
    const from = Number(event.params.fromIndex);
    const count = Number(event.params.count);
    let nodes;
    try {
      if (isDirect(event.transaction.to, event.srcAddress)) nodes = decodeAppendedNodes(event.transaction.input, setId);
    } catch (e) { if (!(e instanceof EncodingError)) throw e; }
    const nodeCount = Math.max(set.nodeCount ?? 0, from + count);
    // _appendNodes reverts on an existing node (NodeExists): the call appends exactly `count` entries, in order
    if (!nodes || nodes.length !== count) {
      context.AnchorSet.set({ ...set, nodeCount, nodesComplete: false });
      return;
    }
    nodes.forEach((n, i) => {
      const index = from + i;
      context.SetNode.set({ id: `${setId}-${index}`, set_id: setId, index, kind: n.kind,
        agentId: n.kind === "agent" ? n.agentId.toString() : undefined, address: n.kind === "address" ? n.address : undefined });
    });
    context.AnchorSet.set({ ...set, nodeCount });
  },
);

indexer.onEvent(
  { contract: "AnchoredReputation", event: "CertificateSubmitted", fields: { transaction: ["hash", "from", "to", "input"] } },
  async ({ event, context }) => {
    const p = event.params;
    const setId = p.setId.toLowerCase();
    const id = `${event.transaction.hash}-${event.logIndex}`;
    const nCert = Number(p.nCert);
    const [set, health, table] = await Promise.all([
      context.AnchorSet.get(setId), context.SetHealth.get(setId), context.SetNode.getWhere({ set_id: { _eq: setId } }),
    ]);
    if (context.isPreload) return; // decoding and the audit run once, in the processing pass
    const base = {
      id, set_id: setId, certBlock: p.certBlock, blockNumber: BigInt(event.block.number), txHash: event.transaction.hash,
      submitter: lc(event.transaction.from ?? ZERO), eEff: p.eEff, graphRoot: p.graphRoot, vectorRoot: p.vectorRoot,
      versionHash: p.versionHash, nCert, numRows: Number(p.numRows), registryVerified: p.registryVerified,
      graphRootMatches: undefined as boolean | undefined, rowsChecked: 0, edgesChecked: 0, discrepancyCount: 0,
    };
    if (!set) context.AnchorSet.set(blankSet(setId)); // registered before start_block: keep Certificate.set non-null
    const call = isDirect(event.transaction.to, event.srcAddress) ? decodeCertCall(event.transaction.input) : undefined;

    let status: "AUDITED" | "UNDECODABLE" | "ROOT_MISMATCH" | "UNKNOWN_SET" | "NODES_MISSING" = "AUDITED";
    let findings: AuditFinding[] = [];
    if (!call || call.setId.toLowerCase() !== setId) status = "UNDECODABLE";
    else if (!set?.tagsJson) status = "UNKNOWN_SET";
    else {
      const nodes: NodeInfo[] = [];
      for (const n of table) nodes[n.index] = n.kind === "agent"
        ? { kind: "agent", agentId: BigInt(n.agentId!) } : { kind: n.kind as "anchor" | "address", address: n.address };
      if (![...Array(nCert).keys()].every((i) => nodes[i] !== undefined)) status = "NODES_MISSING";
      else {
        try {
          const { rows } = decodeRows(call.rows, nCert, set.anchors?.length ?? 0);
          base.graphRootMatches = call.nCert === nCert && rows.length === base.numRows &&
            graphRoot(rows.map((r) => r.leaf)).toLowerCase() === p.graphRoot.toLowerCase();
          if (!base.graphRootMatches) status = "ROOT_MISMATCH"; // not the committed graph: auditing it would prove nothing
          else {
            const schema = setSchema(JSON.parse(set.tagsJson) as SetTag[]);
            const r = await auditRows(storeView(context as never), schema, nodes, nCert, rows, { ownerFallback: set.ownerFallback ?? false });
            base.rowsChecked = r.rowsChecked;
            base.edgesChecked = r.edgesChecked;
            findings = r.discrepancies;
          }
        } catch (e) {
          if (!(e instanceof EncodingError)) throw e;
          status = "UNDECODABLE"; // the contract accepted it, so a decoding error is ours: never report it as clean
        }
      }
    }

    base.discrepancyCount = findings.length;
    context.Certificate.set({ ...base, status });
    findings.forEach((d, n) => context.Discrepancy.set({
      id: `${id}-${n}`, certificate_id: id, set_id: setId, kind: d.kind, proof: proofOf(d.kind, p.registryVerified),
      provenAtBlock: undefined, u: d.u, dst: d.dst, client: d.client, agentId: d.agentId, wCommitted: d.wCommitted,
      wRegistry: d.wRegistry, bCommitted: d.bCommitted, bRegistry: d.bRegistry,
      feedbackIndex: d.feedbackIndex !== undefined ? BigInt(d.feedbackIndex) : undefined,
      registryFeedbackIndex: d.registryFeedbackIndex !== undefined ? BigInt(d.registryFeedbackIndex) : undefined,
    }));
    const h = health ?? blankHealth(setId);
    context.SetHealth.set({
      ...h, certificates: h.certificates + 1, lastCertificate_id: id, lastCertBlock: p.certBlock, lastEEff: p.eEff,
      status: status !== "AUDITED" ? "UNAUDITED" : findings.length > 0 ? "DISCREPANCY" : "CLEAN",
      openDiscrepancies: findings.length, registryChangedAtBlock: undefined, // a new certificate re-reads the registry
    });
  },
);

/** A proof landed on row `node` (and, for EdgeProven, toward `agentId`): close the matching findings of the latest certificate. */
async function remedy(context: EvmOnEventContext, setId: string, node: number,
  agentId: string | undefined, block: number, bump: Partial<Pick<SetHealth, "edgesProven" | "rowsVoided">>, eEff: bigint) {
  const h = await context.SetHealth.get(setId);
  const open = h?.lastCertificate_id ? await context.Discrepancy.getWhere({ set_id: { _eq: setId } }) : [];
  if (context.isPreload || !h) return;
  let closed = 0;
  for (const d of open) {
    if (d.certificate_id !== h.lastCertificate_id || d.provenAtBlock !== undefined || d.u !== node) continue;
    if (agentId !== undefined && d.agentId !== undefined && d.agentId !== agentId) continue;
    context.Discrepancy.set({ ...d, provenAtBlock: BigInt(block) });
    closed++;
  }
  const openLeft = Math.max(0, h.openDiscrepancies - closed);
  context.SetHealth.set({
    ...h, edgesProven: h.edgesProven + (bump.edgesProven ?? 0), rowsVoided: h.rowsVoided + (bump.rowsVoided ?? 0), lastEEff: eEff,
    openDiscrepancies: openLeft, status: h.status === "DISCREPANCY" && openLeft === 0 ? "CLEAN" : h.status,
  });
}

indexer.onEvent({ contract: "AnchoredReputation", event: "EdgeProven" }, async ({ event, context }) => {
  const p = event.params;
  await remedy(context, p.setId.toLowerCase(), Number(p.node), p.agentId.toString(), event.block.number, { edgesProven: 1 }, p.eEff);
});

indexer.onEvent({ contract: "AnchoredReputation", event: "RowVoided" }, async ({ event, context }) => {
  const p = event.params;
  await remedy(context, p.setId.toLowerCase(), Number(p.node), undefined, event.block.number, { rowsVoided: 1 }, p.eEff);
});

indexer.onEvent({ contract: "AnchoredReputation", event: "TransferFlagged" }, async ({ event, context }) => {
  const setId = event.params.setId.toLowerCase();
  const h = await context.SetHealth.get(setId);
  if (context.isPreload || !h) return;
  context.SetHealth.set({ ...h, transfersFlagged: h.transfersFlagged + 1 });
});

indexer.onEvent({ contract: "AnchoredReputation", event: "RegistryChanged" }, async ({ event, context }) => {
  const setId = event.params.setId.toLowerCase();
  const h = await context.SetHealth.get(setId);
  if (context.isPreload || !h) return;
  context.SetHealth.set({ ...h, status: "STALE", registryChangedAtBlock: BigInt(event.block.number) });
});

// AnchoredReputation (ANCRE verifier): every certificate is audited, in the handler, against the registry state the
// indexer has rebuilt at the certificate's block (D42). Events of the same chain are processed in (block, logIndex)
// order, so the identity and reputation entities read here are exactly the registry as of that log.
// Node tables and schemas come from the calldata of the DIRECT calls (registerAnchorSet, addNodes, submitCertificate);
// a relayed call leaves the set or the certificate UNDECODABLE, never silently audited against a guess.
import { indexer } from "envio";
import type { Discrepancy as AuditFinding, DiscrepancyKind, NodeInfo } from "../lib/audit.js";
import { auditRows } from "../lib/audit.js";
import { decodeRows, graphRoot, EncodingError } from "../lib/certificate.js";
import { decodeAppendedNodes, decodeCertCall, decodeSetCall, type SetTag } from "../lib/calls.js";
import { setSchema, storeView } from "../lib/view.js";
import { ZERO } from "../lib/rules.js";
import { lc } from "../lib/state.js";

const PROOF: Record<DiscrepancyKind, string> = {
  FABRICATED: "proveEdge", INFLATED: "proveEdge", OVERSTATED_NEG: "proveEdge", OMITTED_NEG: "proveEdge",
  UNKNOWN_AGENT: "proveEdge", SOURCE: "proveWallet", SOURCE_MISSING: "proveWallet",
  WRONG_INDEX: "refused at submission (Registry-verified)", SHAPE: "refused at submission",
};

indexer.onEvent(
  { contract: "AnchoredReputation", event: "AnchorSetRegistered", fields: { transaction: ["hash", "input"] } },
  async ({ event, context }) => {
    const setId = event.params.setId.toLowerCase();
    const call = decodeSetCall(event.transaction.input);
    const anchors = event.params.anchors.map(lc); // the event is authoritative for the anchors (node indices 0..k-1)
    context.AnchorSet.set({
      id: setId, kind: "onchain", anchors, lambdas: event.params.lambdas.map(String),
      alphaN: Number(event.params.alphaN), alphaD: Number(event.params.alphaD),
      tagsJson: call ? JSON.stringify(call.tags) : undefined, policyJson: call ? JSON.stringify(call.policy) : undefined,
      ownerFallback: call?.policy.ownerFallback, registryVerified: call?.policy.registryVerified,
      decodable: call !== undefined, nodeCount: anchors.length,
      registeredBlock: BigInt(event.block.number), registeredTx: event.transaction.hash,
    });
    anchors.forEach((address, index) =>
      context.SetNode.set({ id: `${setId}-${index}`, set_id: setId, index, kind: "anchor", agentId: undefined, address }));
    const h = await context.SetHealth.get(setId);
    if (!h) context.SetHealth.set({ id: setId, set_id: setId, certificates: 0, lastCertificate_id: undefined, lastCertBlock: undefined,
      status: "UNAUDITED", openDiscrepancies: 0, edgesProven: 0, rowsVoided: 0, lastEEff: undefined });
  },
);

indexer.onEvent(
  { contract: "AnchoredReputation", event: "NodesAdded", fields: { transaction: ["input"] } },
  async ({ event, context }) => {
    const setId = event.params.setId.toLowerCase();
    const set = await context.AnchorSet.get(setId);
    if (!set) return;
    const from = Number(event.params.fromIndex);
    const count = Number(event.params.count);
    let nodes;
    try { nodes = decodeAppendedNodes(event.transaction.input, setId); } catch (e) { if (!(e instanceof EncodingError)) throw e; }
    // nodes already present are skipped by the contract's append (NodeExists reverts only within addNodes)
    if (!nodes || nodes.length < count) {
      context.AnchorSet.set({ ...set, nodeCount: Math.max(set.nodeCount ?? 0, from + count), decodable: false });
      return;
    }
    nodes.slice(nodes.length - count).forEach((n, i) => {
      const index = from + i;
      context.SetNode.set({ id: `${setId}-${index}`, set_id: setId, index, kind: n.kind,
        agentId: n.kind === "agent" ? n.agentId.toString() : undefined, address: n.kind === "address" ? n.address : undefined });
    });
    context.AnchorSet.set({ ...set, nodeCount: Math.max(set.nodeCount ?? 0, from + count) });
  },
);

indexer.onEvent(
  { contract: "AnchoredReputation", event: "CertificateSubmitted", fields: { transaction: ["hash", "from", "input"] } },
  async ({ event, context }) => {
    const p = event.params;
    const setId = p.setId.toLowerCase();
    const id = `${event.transaction.hash}-${event.logIndex}`;
    const nCert = Number(p.nCert);
    const base = {
      id, set_id: setId, certBlock: p.certBlock, blockNumber: BigInt(event.block.number), txHash: event.transaction.hash,
      submitter: lc(event.transaction.from ?? ZERO), eEff: p.eEff, graphRoot: p.graphRoot, vectorRoot: p.vectorRoot,
      versionHash: p.versionHash, nCert, numRows: Number(p.numRows), registryVerified: p.registryVerified,
      graphRootMatches: undefined as boolean | undefined, rowsChecked: 0, edgesChecked: 0, discrepancyCount: 0,
    };
    const set = await context.AnchorSet.get(setId);
    const health = await context.SetHealth.get(setId);
    const call = decodeCertCall(event.transaction.input);

    let status: "AUDITED" | "UNDECODABLE" | "UNKNOWN_SET" | "NODES_MISSING" = "AUDITED";
    let findings: AuditFinding[] = [];
    if (!call || call.setId.toLowerCase() !== setId) status = "UNDECODABLE";
    else if (!set?.tagsJson) status = "UNKNOWN_SET";
    else {
      const table = await context.SetNode.getWhere({ set_id: { _eq: setId } });
      const nodes: NodeInfo[] = [];
      for (const n of table) nodes[n.index] = n.kind === "agent"
        ? { kind: "agent", agentId: BigInt(n.agentId!) } : { kind: n.kind as "anchor" | "address", address: n.address };
      const complete = nodes.length >= nCert && [...Array(nCert).keys()].every((i) => nodes[i] !== undefined);
      if (!complete) status = "NODES_MISSING";
      else {
        try {
          const k = set.anchors?.length ?? 0;
          const { rows } = decodeRows(call.rows, nCert, k);
          base.graphRootMatches = graphRoot(rows.map((r) => r.leaf)).toLowerCase() === p.graphRoot.toLowerCase();
          const schema = setSchema(JSON.parse(set.tagsJson) as SetTag[]);
          const r = await auditRows(storeView(context as never), schema, nodes, nCert, rows, { ownerFallback: set.ownerFallback ?? false });
          base.rowsChecked = r.rowsChecked;
          base.edgesChecked = r.edgesChecked;
          findings = r.discrepancies;
        } catch (e) {
          if (!(e instanceof EncodingError)) throw e;
          status = "UNDECODABLE"; // the contract accepted it, so a decoding error is ours: never report it as clean
        }
      }
    }

    base.discrepancyCount = findings.length;
    context.Certificate.set({ ...base, status });
    findings.forEach((d, n) => context.Discrepancy.set({
      id: `${id}-${n}`, certificate_id: id, set_id: setId, kind: d.kind, proof: PROOF[d.kind], u: d.u, dst: d.dst,
      client: d.client, agentId: d.agentId, wCommitted: d.wCommitted, wRegistry: d.wRegistry, bCommitted: d.bCommitted,
      bRegistry: d.bRegistry, feedbackIndex: d.feedbackIndex !== undefined ? BigInt(d.feedbackIndex) : undefined,
      registryFeedbackIndex: d.registryFeedbackIndex !== undefined ? BigInt(d.registryFeedbackIndex) : undefined,
    }));
    context.SetHealth.set({
      id: setId, set_id: setId, certificates: (health?.certificates ?? 0) + 1, lastCertificate_id: id,
      lastCertBlock: p.certBlock, lastEEff: p.eEff,
      status: status !== "AUDITED" ? "UNAUDITED" : findings.length > 0 ? "DISCREPANCY" : "CLEAN",
      openDiscrepancies: findings.length, edgesProven: health?.edgesProven ?? 0, rowsVoided: health?.rowsVoided ?? 0,
    });
  },
);

indexer.onEvent({ contract: "AnchoredReputation", event: "EdgeProven" }, async ({ event, context }) => {
  const setId = event.params.setId.toLowerCase();
  const h = await context.SetHealth.get(setId);
  if (h) context.SetHealth.set({ ...h, edgesProven: h.edgesProven + 1, lastEEff: event.params.eEff });
});

indexer.onEvent({ contract: "AnchoredReputation", event: "RowVoided" }, async ({ event, context }) => {
  const setId = event.params.setId.toLowerCase();
  const h = await context.SetHealth.get(setId);
  if (h) context.SetHealth.set({ ...h, rowsVoided: h.rowsVoided + 1, lastEEff: event.params.eEff });
});

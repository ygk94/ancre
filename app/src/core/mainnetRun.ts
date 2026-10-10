// The minimal mainnet run of 10/10 (chantier act-mainnet, D40/D59), as the screen needs it: addresses, the
// transactions to link on the explorer, the certificates and the payer decisions of that run. RECORDED: this is
// what the run's event log says happened (docs/chantiers/rapports/act-mainnet/run-*.json, format
// ancre-demo-events-v1); what holds NOW is read from the contract (sources/mainnetChain.ts), never from here.
// Pure and import-free, so that scripts/export-mainnet-run.mjs can run it under plain node.

export type MainnetRun = {
  source: string;
  runId: string;
  startedAt: string;
  chainId: number;
  contracts: { ancre: string; payer: string; identity: string; reputation: string; usdc: string };
  payerRoles: { owner: string; treasury: string; operator: string };
  deploy: { ancre: TxRef; payer: TxRef; anchorSet: TxRef };
  set: { setId: string; anchors: { address: string; label: string }[]; minAnchors: number; thetaPct: number; maxAge: number; level: string };
  /** agents the run acted on, with the run's label */
  agents: { agentId: string; label: string; payTo: string | null }[];
  certificates: { step: string; certBlock: number; tx: string | null; trigger: string | null; nCert: number | null }[];
  payments: {
    step: string;
    agentId: string;
    amount: string;
    decision: "PAID" | "REFUSED";
    stage: string;
    reason: string;
    status: string | null;
    trustLow: string | null;
    block: number;
    settlementTx: string | null;
  }[];
  feedbacks: { step: string; agentId: string; label: string; tag: string; value: string; tx: string; block: number }[];
  breaker: { blocks: number; ms: number | null; fromStep: string; toStep: string } | null;
};
export type TxRef = { tx: string; block: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** Extract the screen's view of a mainnet run log (the parsed JSON file: { header, events }). */
export function extractMainnetRun(log: { header: Any; events: Any[] }, source: string): MainnetRun {
  const h = log.header;
  if (h?.format !== "ancre-demo-events-v1") throw new Error(`unexpected format ${h?.format}`);
  if (h.network?.mode !== "mainnet" || h.network?.chainId !== 143) throw new Error("not a Monad mainnet run");
  const ev: Any[] = log.events.filter((e) => e.type === "event");
  const txOf = (step: string): TxRef => {
    const e = ev.find((x) => x.step === step && x.tx?.status === "success");
    if (!e) throw new Error(`no successful tx for ${step}`);
    return { tx: e.tx.hash, block: e.tx.block };
  };
  const labels = new Map<string, string>();
  for (const a of h.actors ?? []) if (a.agentId) labels.set(String(a.agentId), a.label);
  const payTo = new Map<string, string>();
  for (const e of ev) if (e.kind === "payment" && e.payer?.payTo) payTo.set(String(e.agentId), e.payer.payTo);
  const agentIds = [...new Set(ev.filter((e) => e.kind === "payment").map((e) => String(e.agentId)))];
  return {
    source,
    runId: h.runId,
    startedAt: h.startedAt,
    chainId: h.network.chainId,
    contracts: { ancre: h.contracts.ancre, payer: h.contracts.payer, identity: h.contracts.identity, reputation: h.contracts.reputation, usdc: h.contracts.usdc },
    payerRoles: { owner: h.payerRoles.owner, treasury: h.payerRoles.treasury, operator: h.payerRoles.operator },
    deploy: { ancre: txOf("0.deploy-ancre"), payer: txOf("0.deploy-payer"), anchorSet: txOf("0.anchor-set") },
    set: {
      setId: h.set.setId,
      anchors: h.set.anchors.map((a: Any) => ({ address: a.address, label: a.label })),
      minAnchors: h.set.minAnchors,
      thetaPct: h.set.thetaPct,
      maxAge: h.set.maxAge,
      level: h.set.level,
    },
    agents: agentIds.map((id) => ({ agentId: id, label: (labels.get(id) ?? `#${id}`).replace(/ \(agent #\d+[^)]*\)$/, ""), payTo: payTo.get(id) ?? null })),
    certificates: ev
      .filter((e) => e.kind === "certificate" && e.certificate)
      .map((e) => ({
        step: e.step,
        certBlock: e.certificate.certBlock ?? e.block,
        tx: e.certificate.txs?.find((t: Any) => t.fn === "submitCertificate")?.hash ?? null,
        trigger: e.data?.trigger ?? null,
        nCert: e.certificate.nCert ?? null,
      })),
    payments: ev
      .filter((e) => e.kind === "payment" && e.payer)
      .map((e) => ({
        step: e.step,
        agentId: String(e.agentId),
        amount: String(e.payer.amount),
        decision: e.payer.decision,
        stage: e.payer.stage,
        reason: e.payer.reason,
        status: e.payer.explain?.status ?? e.agent?.contract?.status ?? null,
        trustLow: e.payer.explain?.trustLow ?? e.agent?.contract?.trustLow ?? null,
        block: e.block,
        settlementTx: e.payer.settlementTx ?? null,
      })),
    feedbacks: ev
      .filter((e) => e.kind === "feedback" && e.tx?.status === "success")
      .map((e) => ({ step: e.step, agentId: String(e.agentId), label: e.label, tag: e.data?.tag1 ?? "", value: String(e.data?.value ?? ""), tx: e.tx.hash, block: e.tx.block })),
    breaker: (() => {
      const l = ev.find((e) => e.latency)?.latency;
      return l ? { blocks: l.blocks, ms: l.ms ?? null, fromStep: l.from.step, toStep: l.to.step } : null;
    })(),
  };
}

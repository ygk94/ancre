// Monad mainnet, CERTIFIED ON-CHAIN: what ANCRE's contract answers now (eth_call, public RPC), next to what the
// minimal run of 10/10 recorded (event log, with explorer links). Kept apart, by title and status word, from the
// reference solver's numbers on the same pages: those are COMPUTED, never certified.
import type { ReactNode } from "react";
import { monadscan } from "../config/networks";
import { certAge, duration, isZeroAddr, verdictOf, type OnchainAssess, type OnchainState } from "../core/onchain";
import { fmtDate, int, pct, pctU, short } from "../lib/format";
import { href, type Route } from "../router";
import { mainnetRun as run, useMainnetChain } from "../sources/mainnetChain";
import { Addr, Link, SourceLine } from "./common";

export const RUN_AGENT_IDS = run.agents.map((a) => a.agentId);
const RUN_DAY = run.startedAt.slice(0, 10);

/** A link to monadscan, the text shortened. */
export function Scan({ kind, v, children }: { kind: "address" | "tx" | "block"; v: string | number; children?: ReactNode }) {
  return (
    <a href={monadscan(kind, v)} target="_blank" rel="noreferrer" className={kind === "block" ? "num" : "mono"} title={String(v)}>
      {children ?? (kind === "block" ? int(v) : short(String(v)))} ↗
    </a>
  );
}

export function OnchainChip({ a }: { a: OnchainAssess | null }) {
  const v = verdictOf(a);
  if (v.word === "UNREAD") return <span className="chip none">—</span>;
  const cls = v.tone === "good" ? "pass" : v.tone === "bad" ? (v.word === "VETOED" ? "veto" : "refuse") : "warn";
  const icon = v.word === "PASSES" ? "✓ Passes" : v.word === "VETOED" ? "⛔ Vetoed" : v.word === "REFUSED" ? "✕ Refused" : `◐ ${v.word}`;
  return (
    <span className={`chip ${cls}`} title={v.text}>
      {icon}
    </span>
  );
}

const recordedCert = (certBlock: number | null | undefined) => run.certificates.find((c) => c.certBlock === certBlock) ?? null;

/** The certificate assess() reports, its age and the maxAge rule, all read now. */
export function CertFacts({ st }: { st: OnchainState | null }) {
  const certBlock = st ? (Object.values(st.agents).find((a) => a.assess)?.assess?.certBlock ?? null) : null;
  const age = st ? certAge(st.head, st.cert, st.maxAge) : null;
  const rec = recordedCert(certBlock);
  return (
    <div className="kv onchain">
      <div>Certificate (assess)</div>
      <div>
        {certBlock ? (
          <>
            block <Scan kind="block" v={certBlock} />
            {rec?.tx && (
              <>
                {" · tx "}
                <Scan kind="tx" v={rec.tx} />
              </>
            )}
          </>
        ) : certBlock === 0 ? (
          "NO_CERT"
        ) : (
          "—"
        )}
      </div>
      <div>Certified at</div>
      <div>{st?.cert ? fmtDate(new Date(st.cert.timestamp * 1000).toISOString()) : "—"}</div>
      <div>Age</div>
      <div>
        {age ? (
          <>
            <span className="num">{int(age.ageBlocks)}</span> blocks{age.ageSeconds !== null ? ` · ${duration(age.ageSeconds)}` : ""}
          </>
        ) : (
          "—"
        )}
      </div>
      <div>maxAge (policyOf)</div>
      <div>
        {st?.maxAge !== null && st?.maxAge !== undefined ? (
          <>
            <span className="num">{int(st.maxAge)}</span> blocks
            {age?.secondsPerBlock ? ` · ≈ ${duration(age.maxAge * age.secondsPerBlock)} at the block rate since the certificate (estimated)` : ""}
          </>
        ) : (
          "—"
        )}
      </div>
      <div>Freshness</div>
      <div>
        {age ? (
          age.stale ? (
            <span className="pill warn">STALE since block {int(age.lastValidBlock + 1)}</span>
          ) : (
            <>
              <span className="pill good">fresh</span> STALE after block <span className="num">{int(age.lastValidBlock)}</span>
              {age.secondsPerBlock ? ` (in ≈ ${duration(age.blocksLeft * age.secondsPerBlock)}, estimated)` : ""}
            </>
          )
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function ReadLine({ st, loading }: { st: OnchainState | null; loading: boolean }) {
  if (!st) return <SourceLine status="—" text={loading ? `reading the contract on ${run.contracts.ancre.slice(0, 10)}…` : "contract not read (RPC unreachable)"} />;
  return (
    <SourceLine
      status={st.head ? "READ ON-CHAIN" : "—"}
      text={
        st.head
          ? `eth_call at block ${int(st.head.number)} on ${st.rpc}, ${fmtDate(st.readAt)}${st.errors.length ? ` · ${st.errors.length} read(s) failed: “—”` : ""}`
          : `RPC unreachable (${st.rpc}): every on-chain value is “—”`
      }
      detail={st.errors.join("\n") || undefined}
    />
  );
}

const STALE_NOTE =
  "No continuous recertification runs on mainnet (minimal run): once the certificate is older than maxAge, assess() answers STALE and the payer refuses everyone, as the contract should.";

/** Discover / Network (mainnet): the anchor set ANCRE certified on-chain and the agents of the run, read now. */
export function OnchainSetCard({ route, nameOf, compact }: { route: Route; nameOf: (id: string) => string; compact?: boolean }) {
  const { st, loading } = useMainnetChain(RUN_AGENT_IDS);
  const stale = Object.values(st?.agents ?? {}).some((a) => a.assess?.status === "STALE");
  return (
    <section className="card">
      <div className="card-h">
        <h2>Certified on-chain · ANCRE on Monad mainnet</h2>
        <span className="pill good">live · minimal run {RUN_DAY}</span>
      </div>
      <div className="card-b small" style={{ paddingBottom: 0 }}>
        <span className="muted">
          ANCRE's demo anchor set ({run.set.anchors.length} demo anchors, m = {run.set.minAnchors}, θ = {run.set.thetaPct} %, {run.set.level}) on{" "}
        </span>
        <Scan kind="address" v={run.contracts.ancre}>
          AnchoredReputation
        </Scan>
        <span className="muted"> and </span>
        <Scan kind="address" v={run.contracts.payer}>
          TrustGatedPayer
        </Scan>
        <span className="muted">. Not the anchors of the reference solver below: a separate, smaller set.</span>
      </div>
      {stale && <div className="card-b"><div className="banner" style={{ margin: 0 }}>Certificate STALE. {STALE_NOTE}</div></div>}
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th>assess() now</th>
            <th className="r">Mass, leave-one-out</th>
            <th className="hide-sm">Payer decide() now</th>
            <th className="hide-sm">Recorded {RUN_DAY}</th>
          </tr>
        </thead>
        <tbody>
          {RUN_AGENT_IDS.map((id) => {
            const a = st?.agents[id] ?? null;
            const pays = run.payments.filter((p) => p.agentId === id);
            return (
              <tr key={id} style={{ cursor: "default" }}>
                <td>
                  <Link to={href({ page: "agent", net: "mainnet", id }, route)}>
                    {agentLabel(id, nameOf)} <span className="muted small">#{id}</span>
                  </Link>
                </td>
                <td>
                  <OnchainChip a={a?.assess ?? null} />
                </td>
                <td className="r num">{a?.assess ? pctU(a.assess.trustLow) : "—"}</td>
                <td className="hide-sm mono small">{a?.decide ?? "—"}</td>
                <td className="hide-sm small">
                  {pays.map((p, i) => (
                    <span key={p.step}>
                      {i ? " · " : ""}
                      {p.decision === "PAID" ? (
                        <>
                          paid <Scan kind="tx" v={p.settlementTx!} />
                        </>
                      ) : (
                        <span className="muted">refused {p.reason}</span>
                      )}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!compact && (
        <div className="card-b" style={{ borderTop: "1px solid var(--line)" }}>
          <CertFacts st={st} />
        </div>
      )}
      <div className="card-b note" style={{ marginTop: 0 }}>
        <ReadLine st={st} loading={loading} />
        <SourceLine status="RECORDED" text={`run ${run.runId} (${run.source}): payments, slash and certificate transactions`} />
        {!stale && <div style={{ marginTop: 6 }}>{STALE_NOTE}</div>}
      </div>
    </section>
  );
}

export const agentLabel = (id: string, nameOf: (id: string) => string) => {
  const l = run.agents.find((a) => a.agentId === id)?.label;
  return l && /\(demo\)/.test(l) ? l : nameOf(id);
};

/** Agent page (mainnet), overview: this agent under ANCRE's on-chain anchor set, read now. */
export function OnchainAgentCard({ id }: { id: string }) {
  const { st, loading } = useMainnetChain(onchainIds(id));
  const a = st?.agents[id] ?? null;
  const x = a?.assess ?? null;
  const v = verdictOf(x);
  return (
    <section className="card">
      <div className="card-h">
        <h2>Certified on-chain · ANCRE's demo anchor set</h2>
        <OnchainChip a={x} />
      </div>
      <div className="card-b small muted" style={{ paddingBottom: 0 }}>
        {x ? v.text : loading ? "Reading the contract…" : "— (contract not read)"}
        {x?.status === "STALE" ? ` ${STALE_NOTE}` : ""}
      </div>
      <div className="metrics">
        <Metric label="Mass, leave-one-out" val={x ? pctU(x.trustLow) : "—"} sub={`trustLow, against θ = ${st?.thetaPct ?? "—"} %`} />
        <Metric label="Raw mass Σλt" val={x ? pctU(x.trust) : "—"} sub="before leave-one-out" />
        <Metric label="Distrust" val={x ? pctU(x.distrust) : "—"} sub={x ? `${x.vetoCount} anchor veto${x.vetoCount === 1 ? "" : "es"} live` : "—"} />
        <Metric label="Payer decide()" val={<span className="mono">{a?.decide ?? "—"}</span>} sub={a ? (isZeroAddr(a.wallet) ? (a.wallet === null ? "agentWallet not read" : "no agentWallet") : `0.01 USDC to agentWallet ${short(a.wallet)}`) : "—"} />
      </div>
      <div className="card-b" style={{ borderTop: "1px solid var(--line)" }}>
        <CertFacts st={st} />
      </div>
      <div className="card-b note" style={{ marginTop: 0 }}>
        <ReadLine st={st} loading={loading} />
        Set id <span className="mono" title={run.set.setId}>{short(run.set.setId)}</span> · registered in tx <Scan kind="tx" v={run.deploy.anchorSet.tx} />. Only a human can override a
        refusal, from their own wallet (D47); an agent never can.
      </div>
    </section>
  );
}

/** Agent page header (mainnet): the contract's own verdict, never the solver's. */
export function OnchainVerdict({ id }: { id: string }) {
  const { st, loading } = useMainnetChain(onchainIds(id));
  const x = st?.agents[id]?.assess ?? null;
  return (
    <>
      <OnchainChip a={x} />
      <div className="sub">{x ? `on-chain, ANCRE's demo anchors · ${verdictOf(x).text}` : loading ? "reading the contract…" : "on-chain: — (RPC unreachable)"}</div>
    </>
  );
}

/** the run's agents plus this page's agent: one shared read */
export const onchainIds = (id: string | null) => [...new Set([...RUN_AGENT_IDS, ...(id && /^\d+$/.test(id) ? [id] : [])])];

/** Certificates tab (mainnet): the one assess() reads now, and the run's certificates with their transactions. */
export function OnchainCertificates({ id }: { id: string }) {
  const { st, loading } = useMainnetChain(onchainIds(id));
  const live = st?.agents[id]?.assess?.certBlock ?? null;
  return (
    <section className="card">
      <div className="card-h">
        <h2>Certificates of ANCRE's mainnet anchor set</h2>
        <span className="muted small">Registry-verified, on-chain</span>
      </div>
      <div className="card-b">
        <CertFacts st={st} />
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Recorded {RUN_DAY}</th>
            <th className="r">Cert. block</th>
            <th className="r hide-sm">Nodes</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {[...run.certificates].reverse().map((c) => (
            <tr key={c.step} style={{ cursor: "default", fontWeight: c.certBlock === live ? 600 : undefined }}>
              <td>
                ✓ accepted{c.certBlock === live ? " · the one assess() reads now" : ""}
                <div className="muted small">{c.trigger}</div>
              </td>
              <td className="r">
                <Scan kind="block" v={c.certBlock} />
              </td>
              <td className="r num hide-sm">{c.nCert ?? "—"}</td>
              <td>{c.tx ? <Scan kind="tx" v={c.tx} /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-b note" style={{ marginTop: 0 }}>
        <ReadLine st={st} loading={loading} />
        <SourceLine status="RECORDED" text={`certificate transactions: run ${run.runId}`} />
        {STALE_NOTE}
      </div>
    </section>
  );
}

/** Payments tab (mainnet): the payer's answer now, and the run's payer decisions for this agent. */
export function OnchainPayments({ id }: { id: string }) {
  const { st, loading } = useMainnetChain(onchainIds(id));
  const a = st?.agents[id] ?? null;
  const pays = run.payments.filter((p) => p.agentId === id).reverse();
  const slash = run.feedbacks.filter((f) => f.agentId === id && BigInt(f.value || "0") < 0n);
  return (
    <section className="card">
      <div className="card-h">
        <h2>Payer decisions · TrustGatedPayer on mainnet</h2>
        <Scan kind="address" v={run.contracts.payer} />
      </div>
      <ul className="why-list">
        <li>
          <span className="n">now</span>
          <span>
            decide(#{id}, agentWallet, 0.01 USDC) → <b className="mono">{a?.decide ?? "—"}</b>
          </span>
          <span className="w zero">{st?.head ? `block ${int(st.head.number)}` : "—"}</span>
          <span className="sub">
            READ ON-CHAIN · status {a?.assess?.status ?? "—"}, trustLow {a?.assess ? `${pct(a.assess.trustLow)} %` : "—"}
            {st?.paused ? " · payer paused" : ""}
          </span>
        </li>
        {pays.map((p) => (
          <li key={p.step}>
            <span className="n" style={{ color: p.decision === "PAID" ? "var(--good)" : "var(--bad)" }}>
              {p.decision === "PAID" ? "✓ paid" : "✕ refused"}
            </span>
            <span>
              {Number(p.amount) / 1e6} USDC · {p.decision === "PAID" ? "settled by the x402 facilitator" : `${p.reason} at ${p.stage}`}
            </span>
            <span className="w zero">
              block <Scan kind="block" v={p.block} />
            </span>
            <span className="sub">
              RECORDED {RUN_DAY} · status {p.status ?? "—"}, trustLow {p.trustLow ? `${pct(p.trustLow)} %` : "—"}
              {p.settlementTx ? (
                <>
                  {" · settlement "}
                  <Scan kind="tx" v={p.settlementTx} />
                </>
              ) : (
                " · refused at /verify: nothing broadcast, no transaction"
              )}
            </span>
          </li>
        ))}
        {slash.map((f) => (
          <li key={f.step}>
            <span className="n" style={{ color: "var(--bad)" }}>
              ⛔ slash
            </span>
            <span>{f.label}</span>
            <span className="w zero">
              block <Scan kind="block" v={f.block} />
            </span>
            <span className="sub">
              RECORDED {RUN_DAY} · tx <Scan kind="tx" v={f.tx} />
              {run.breaker && run.breaker.fromStep === f.step
                ? ` · next payment refused ${run.breaker.blocks} block${run.breaker.blocks === 1 ? "" : "s"}${run.breaker.ms !== null ? `, ${run.breaker.ms} ms` : ""} later (measured on mainnet)`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="card-b note" style={{ marginTop: 0 }}>
        <ReadLine st={st} loading={loading} />
        A refused x402 payment leaves no on-chain trace: it is in the run's event log, not on the explorer. Only a human can override a refusal, from
        their own wallet (D47); an agent never can.
      </div>
    </section>
  );
}

const Metric = ({ label, val, sub }: { label: string; val: ReactNode; sub?: string }) => (
  <div className="metric">
    <div className="lbl">{label}</div>
    <div className="val">{val}</div>
    {sub && <div className="sub">{sub}</div>}
  </div>
);

/** Network page (mainnet card): ANCRE's contracts and roles with explorer links. */
export function MainnetContractRows() {
  return (
    <>
      <div>AnchoredReputation</div>
      <div>
        <Scan kind="address" v={run.contracts.ancre}>
          <code className="mono">{run.contracts.ancre}</code>
        </Scan>
        <div className="muted small">
          deploy <Scan kind="tx" v={run.deploy.ancre.tx} />, block {int(run.deploy.ancre.block)}
        </div>
      </div>
      <div>TrustGatedPayer</div>
      <div>
        <Scan kind="address" v={run.contracts.payer}>
          <code className="mono">{run.contracts.payer}</code>
        </Scan>
        <div className="muted small">
          owner (human) <Addr a={run.payerRoles.owner} /> · treasury <Addr a={run.payerRoles.treasury} /> · operator (agent key) <Addr a={run.payerRoles.operator} />
        </div>
      </div>
      <div>Anchor set</div>
      <div>
        <span className="mono" title={run.set.setId}>
          {short(run.set.setId)}
        </span>{" "}
        · {run.set.anchors.length} demo anchors · m = {run.set.minAnchors} · θ = {run.set.thetaPct} % · {run.set.level}
      </div>
      <div>Where</div>
      <div>
        <span className="pill good">on Monad mainnet · {run.runId}</span>
      </div>
    </>
  );
}

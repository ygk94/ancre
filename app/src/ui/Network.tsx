// Network: what ANCRE reads and writes on each chain. Registry addresses are constants (CLAUDE.md §3), ANCRE's
// contracts come from a run header (testnet: the newest recorded run; mainnet: the archived run of 10/10, via
// src/data/mainnet-run.json), indexer counts are read live from Envio, the mainnet certificate from the contract.
import { useEffect, useState } from "react";
import { NETWORK_CHOICES, NETWORKS, ENVIO_GRAPHQL } from "../config/networks";
import type { Header } from "../core/demo";
import type { NetId } from "../core/model";
import { chainHead, type ChainHead } from "../lib/envio";
import { int } from "../lib/format";
import { href, navigate, type Route } from "../router";
import { act1, mainnetName } from "../sources/useDataset";
import { MainnetContractRows, OnchainSetCard } from "./Onchain";
import { useRunSet } from "../sources/useRunSet";
import scan from "../data/scan-snapshot.json";

type Choice = (typeof NETWORK_CHOICES)[number];

export function Network({ route }: { route: Route }) {
  const { rs, error } = useRunSet();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Networks</h1>
          <p>ANCRE reads the ERC-8004 registries of a chain and certifies a reader's anchor set on that same chain.</p>
        </div>
      </div>
      <div className="netgrid">
        {NETWORK_CHOICES.map((n) => (
          <NetCard key={n.id} n={n} route={route} run={rs?.header ?? null} runError={error} />
        ))}
      </div>
      <OnchainSetCard route={route} nameOf={mainnetName} />
      <div className="note">
        Registry addresses: ERC-8004 v2.0.0, <code>getVersion()</code> read on-chain on 27/09. Indexer counts: Envio GraphQL, read now. A dash
        means we have no verified value.
      </div>
    </>
  );
}

function NetCard({ n, route, run, runError }: { n: Choice; route: Route; run: Header | null; runError: string | null }) {
  const head = useHead(n.state === "soon" ? null : n.chainId);
  const current = n.id === route.network;
  const reg = n.id === "testnet" ? NETWORKS.testnet : n.id === "mainnet" ? NETWORKS.mainnet : null;
  return (
    <section className={`card netcard${current ? " current" : ""}${n.state === "soon" ? " off" : ""}`}>
      <div className="card-h">
        <h2>
          <span className={`dot ${n.state === "active" ? "live" : "off"}`} /> {n.label}
        </h2>
        <span className="muted small">chain {n.chainId}</span>
      </div>
      <div className="card-b">
        <p className="small" style={{ marginTop: 0 }}>
          {n.id === "testnet" && <>Where ANCRE's full demo runs: our anchor set, its certificates and the payer contract.</>}
          {n.id === "mainnet" && (
            <>
              ANCRE deployed by a minimal real run on 10/10: a demo anchor set, its certificate and the payer, read on-chain by this screen. No
              continuous recertification: the certificate goes STALE after maxAge. The whole registry is also read by our reference solver
              (computed off-chain, not certified).
            </>
          )}
          {n.state === "soon" && <>Soon. Not indexed by ANCRE yet.</>}
        </p>
        <div className="kv">
          <div>Status</div>
          <div>
            <span className={`pill ${n.state === "active" ? "good" : "warn"}`}>{n.state === "active" ? (n.tag ?? "active") : n.state}</span>
          </div>
          <div>ERC-8004 Identity</div>
          <div>{reg ? <code className="mono">{reg.identity}</code> : "—"}</div>
          <div>ERC-8004 Reputation</div>
          <div>{reg ? <code className="mono">{reg.reputation}</code> : "—"}</div>
          {n.id === "testnet" && <AncreRows run={run} runError={runError} />}
          {n.id === "mainnet" && (
            <>
              <MainnetContractRows />
              <div>Reference solver snapshot</div>
              <div>
                block <span className="num">{int(act1.snapshotBlock)}</span> · {int(act1.snapshotAgents)} agents · {int(act1.snapshotFeedbacks)} ratings
              </div>
              <div>Names and scores</div>
              <div>8004scan public API, {scan.fetchedAt.slice(0, 16).replace("T", " ")} UTC</div>
            </>
          )}
          {n.state !== "soon" && (
            <>
              <div>Indexer (Envio)</div>
              <div>
                {head.v ? (
                  <>
                    head <span className="num">{int(head.v.block)}</span> · {int(head.v.agents)} agents · {int(head.v.feedbacks)} ratings
                  </>
                ) : head.error ? (
                  <span className="muted" title={head.error}>
                    unreachable
                  </span>
                ) : (
                  <span className="muted">…</span>
                )}
              </div>
              <div>Real time</div>
              <div className="mono small">{n.id === "testnet" ? NETWORKS.testnet.ws : NETWORKS.mainnet.ws}</div>
            </>
          )}
        </div>
      </div>
      {n.state !== "soon" && (
        <div className="card-b" style={{ paddingTop: 0 }}>
          {current ? (
            <span className="muted small">Selected</span>
          ) : (
            <button className="ctl" onClick={() => navigate(href({ page: "discover", network: n.id as NetId, lens: null }, route))}>
              Use {n.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AncreRows({ run, runError }: { run: Header | null; runError: string | null }) {
  if (!run) return (
    <>
      <div>ANCRE contracts</div>
      <div className="muted">{runError ? "—" : "…"}</div>
    </>
  );
  const onchain = run.network.mode === "testnet";
  return (
    <>
      <div>AnchoredReputation</div>
      <div>{run.contracts ? <code className="mono">{run.contracts.ancre}</code> : "—"}</div>
      <div>TrustGatedPayer</div>
      <div>{run.contracts ? <code className="mono">{run.contracts.payer}</code> : "—"}</div>
      <div>Where</div>
      <div>{onchain ? <span className="pill good">on Monad testnet</span> : <span className="pill warn">recorded on a fork of the testnet ({run.runId})</span>}</div>
      {run.set && (
        <>
          <div>Anchor set</div>
          <div>
            {run.set.anchors.length} anchors · m = {run.set.minAnchors} · θ = {run.set.thetaPct} % · {run.set.level}
          </div>
        </>
      )}
    </>
  );
}

function useHead(chainId: number | null): { v: ChainHead | null; error: string | null } {
  const [st, setSt] = useState<{ v: ChainHead | null; error: string | null }>({ v: null, error: null });
  useEffect(() => {
    if (chainId === null) return;
    let dead = false;
    chainHead(chainId).then(
      (v) => !dead && setSt({ v, error: null }),
      (e) => !dead && setSt({ v: null, error: `${ENVIO_GRAPHQL}: ${String((e as Error).message ?? e)}` }),
    );
    return () => {
      dead = true;
    };
  }, [chainId]);
  return st;
}

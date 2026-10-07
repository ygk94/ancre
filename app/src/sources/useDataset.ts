// One shape for both networks, so every page reads the same fields:
//  - testnet: the anchor set of the newest recorded chantier 06 run (RECORDED; on a FORK of the testnet until the
//    real testnet run exists, and the page says so);
//  - mainnet (preview): the reference solver's export (COMPUTED, not certified on-chain), under a chosen lens.
import { useMemo } from "react";
import act1Json from "../data/act1.json";
import scan from "../data/scan-snapshot.json";
import { groupsOf, mainnetPolicy, mainnetRows, type Act1, type ExportLens } from "../core/mainnet";
import type { AgentRow, NetId, Policy, ReviewGroup } from "../core/model";
import type { Source } from "../core/path";
import type { RunSet } from "../core/runset";
import { int } from "../lib/format";
import { useRunSet } from "./useRunSet";

export const act1 = act1Json as unknown as Act1;

export type Dataset = {
  net: NetId;
  rows: AgentRow[];
  policy: Policy;
  lenses: { id: string; title: string; blurb: string }[];
  lensId: string | null;
  /** where the ANCRE numbers come from, one line, with its status word */
  source: { status: "RECORDED" | "COMPUTED"; text: string; detail: string };
  nameOf: (id: string) => string;
  labelOf: (addressOrId: string) => string;
  reviewsOf: (id: string) => ReviewGroup[];
  reviewsTotal: (id: string) => number | null;
  /** D49 complement (mainnet): the same anchors with every tag accepted */
  permissiveOf: (id: string) => ReviewGroup[] | null;
  inboundOf: (id: string) => Source[];
  run: RunSet | null;
};

const scanNames: Record<string, string> = Object.fromEntries(
  [...scan.top, ...Object.values(scan.featured as Record<string, { agentId: string; name: string }>)].map((a) => [a.agentId, a.name.replace(/^monad:\/\//, "")]),
);
export const mainnetName = (id: string) => scanNames[id] ?? `Agent #${id}`;

export function useDataset(net: NetId, lensId: string | null): { ds: Dataset | null; error: string | null } {
  const { rs, error } = useRunSet();
  const ds = useMemo(() => (net === "mainnet" ? mainnetDataset(lensId) : rs ? runDataset(rs) : null), [net, lensId, rs]);
  return { ds, error: net === "mainnet" ? null : error };
}

function mainnetDataset(lensId: string | null): Dataset {
  const lens: ExportLens = act1.lenses.find((l) => l.id === lensId) ?? act1.lenses[0];
  const anchorLabel = new Map(lens.anchors.map((a) => [a.address.toLowerCase(), a.label]));
  return {
    net: "mainnet",
    rows: mainnetRows(act1, lens, mainnetName),
    policy: mainnetPolicy(act1, lens),
    lenses: act1.lenses.map((l) => ({ id: l.id, title: l.title, blurb: l.blurb })),
    lensId: lens.id,
    source: {
      status: "COMPUTED",
      text: `reference solver on the mainnet registry, block ${int(act1.snapshotBlock)}`,
      detail: `${act1.source} · ${act1.rules} · ${act1.command}`,
    },
    nameOf: mainnetName,
    labelOf: (x) => (/^\d+$/.test(x) ? mainnetName(x) : (anchorLabel.get(x.toLowerCase()) ?? x)),
    reviewsOf: (id) => groupsOf(lens.reviews[id]),
    reviewsTotal: (id) => lens.reviews[id]?.total ?? null,
    permissiveOf: (id) => (lens.id === "independent" && act1.permissive.reviews[id] ? groupsOf(act1.permissive.reviews[id]) : null),
    inboundOf: (id) =>
      (lens.reviews[id]?.inbound ?? [])
        .filter((x) => BigInt(x.contribution) > 0n)
        .map((x) => (x.from === "anchor" ? { kind: "anchor" as const, id: x.client } : { kind: "agent" as const, id: x.from.replace(/^agent:/, "") }))
        .filter((s) => s.kind === "anchor" || s.id !== "address"),
    run: null,
  };
}

function runDataset(rs: RunSet): Dataset {
  const fork = rs.header.network.mode !== "testnet";
  const day = rs.header.startedAt.slice(0, 10);
  return {
    net: "testnet",
    rows: rs.rows,
    policy: rs.policy,
    lenses: [],
    lensId: null,
    source: {
      status: "RECORDED",
      text: fork
        ? `recorded run ${rs.header.runId} on an anvil fork of Monad testnet, ${day}`
        : `recorded run ${rs.header.runId} on Monad testnet, ${day}`,
      detail: `chantier 06 event log (ancre-demo-events-v1): AnchoredReputation.assess() read by the scene script at each event; state at block ${int(rs.lastBlock)}`,
    },
    nameOf: (id) => rs.screen.agents[id]?.label ?? `#${id}`,
    labelOf: rs.labelOf,
    reviewsOf: rs.reviewsOf,
    reviewsTotal: (id) => rs.ratings.filter((r) => r.agentId === id).length,
    permissiveOf: () => null,
    inboundOf: (id) =>
      rs.reviewsOf(id).flatMap((g): Source[] =>
        g.why === "anchor" && g.author ? [{ kind: "anchor", id: g.author }] : g.why === "hop" ? g.via.map((v) => ({ kind: "agent" as const, id: v })) : [],
      ),
    run: rs,
  };
}

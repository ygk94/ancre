// Envio HyperIndex (Hasura GraphQL) client. Schema: indexer/SCHEMA.md. CORS is open (measured 06/10).
// No aggregates are exposed on the public endpoint (Feedback_aggregate is absent): we page by id, 1 000 rows.
import { ENVIO_GRAPHQL } from "../config/networks";

async function gql<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const r = await fetch(ENVIO_GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!r.ok) throw new Error(`Envio HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(`Envio: ${j.errors[0]?.message}`);
  return j.data as T;
}

export type ChainHead = { chainId: number; block: number; feedbacks: number; agents: number; outOfRange: number; selfRatings: number };

export async function chainHead(chainId: number, signal?: AbortSignal): Promise<ChainHead> {
  const d = await gql<{
    chain_metadata: { chain_id: number; latest_processed_block: number }[];
    ChainStats: { chainId: number; feedbacks: number; agents: number; outOfRange: number; selfRatings: number }[];
  }>(
    `query($c: Int!) {
      chain_metadata(where: {chain_id: {_eq: $c}}) { chain_id latest_processed_block }
      ChainStats(where: {chainId: {_eq: $c}}) { chainId feedbacks agents outOfRange selfRatings }
    }`,
    { c: chainId },
    signal,
  );
  const s = d.ChainStats[0];
  return {
    chainId,
    block: d.chain_metadata[0]?.latest_processed_block ?? 0,
    feedbacks: s?.feedbacks ?? 0,
    agents: s?.agents ?? 0,
    outOfRange: s?.outOfRange ?? 0,
    selfRatings: s?.selfRatings ?? 0,
  };
}

export type AgentRegistryView = {
  agentId: string;
  feedbacks: number; // non-revoked
  revoked: number;
  clients: number;
  topClientShare: number | null;
  naiveAverage: string | null; // decimal string, mean of value / 10^decimals over non-revoked feedback
  outOfRange: number; // |value| >= 1e38
  owner: string | null;
  wallet: string | null;
};

type Row = { id: string; value: string; valueDecimals: number; client: string; revokedAtBlock: string | null };

/** Everything the "explorer" column needs about one agent, straight from the indexed registry. */
export async function agentRegistryView(chainId: number, agentId: string, signal?: AbortSignal): Promise<AgentRegistryView> {
  const rows: Row[] = [];
  let last = "";
  for (;;) {
    const d = await gql<{ Feedback: Row[] }>(
      `query($c: Int!, $a: String!, $last: String!) {
        Feedback(where: {chainId: {_eq: $c}, agent_id: {_eq: $a}, id: {_gt: $last}}, order_by: {id: asc}, limit: 1000) {
          id value valueDecimals client revokedAtBlock
        }
      }`,
      { c: chainId, a: agentId, last },
      signal,
    );
    rows.push(...d.Feedback);
    if (d.Feedback.length < 1000) break;
    last = d.Feedback[d.Feedback.length - 1].id;
  }
  const a = await gql<{ Agent: { owner: string; wallet: string }[] }>(
    `query($c: Int!, $a: String!) { Agent(where: {chainId: {_eq: $c}, id: {_eq: $a}}) { owner wallet } }`,
    { c: chainId, a: agentId },
    signal,
  );
  const live = rows.filter((r) => r.revokedAtBlock === null);
  const byClient = new Map<string, number>();
  let sumWad = 0n;
  let oor = 0;
  for (const r of live) {
    const v = BigInt(r.value);
    sumWad += v * 10n ** BigInt(18 - Math.min(18, r.valueDecimals));
    if ((v < 0n ? -v : v) >= 10n ** 38n) oor++;
    byClient.set(r.client, (byClient.get(r.client) ?? 0) + 1);
  }
  const mean = live.length ? Number(sumWad / BigInt(live.length)) / 1e18 : null;
  return {
    agentId,
    feedbacks: live.length,
    revoked: rows.length - live.length,
    clients: byClient.size,
    topClientShare: live.length ? Math.max(...byClient.values()) / live.length : null,
    naiveAverage: mean === null ? null : String(mean),
    outOfRange: oor,
    owner: a.Agent[0]?.owner ?? null,
    wallet: a.Agent[0]?.wallet ?? null,
  };
}

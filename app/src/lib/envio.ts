// Envio HyperIndex (Hasura GraphQL) client. Schema: indexer/SCHEMA.md. CORS is open (measured 06/10).
// No aggregates are exposed on the public endpoint (Feedback_aggregate is absent): we page by id, 1 000 rows.
import { ENVIO_GRAPHQL } from "../config/networks";
import type { EnvioActivity } from "../core/feed";

// Short-lived memo: Act 1 unmounts on every switch to act 2; coming back within a minute must not re-page 7,665
// feedback rows (8 sequential requests). Past a minute the next view is fetched live again.
const TTL_MS = 60_000;
const memo = new Map<string, { at: number; v: Promise<unknown> }>();
function cached<T>(key: string, f: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v as Promise<T>;
  const v = f();
  memo.set(key, { at: Date.now(), v });
  v.catch(() => memo.delete(key)); // never memoise a failure
  return v;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(ENVIO_GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`Envio HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(`Envio: ${j.errors[0]?.message}`);
  return j.data as T;
}

export type ChainHead = { chainId: number; block: number; feedbacks: number; agents: number };

export const chainHead = (chainId: number) => cached(`head:${chainId}`, () => fetchChainHead(chainId));

async function fetchChainHead(chainId: number): Promise<ChainHead> {
  const d = await gql<{
    chain_metadata: { chain_id: number; latest_processed_block: number }[];
    ChainStats: { chainId: number; feedbacks: number; agents: number }[];
  }>(
    `query($c: Int!) {
      chain_metadata(where: {chain_id: {_eq: $c}}) { chain_id latest_processed_block }
      ChainStats(where: {chainId: {_eq: $c}}) { chainId feedbacks agents }
    }`,
    { c: chainId },
  );
  const s = d.ChainStats[0];
  return {
    chainId,
    block: d.chain_metadata[0]?.latest_processed_block ?? 0,
    feedbacks: s?.feedbacks ?? 0,
    agents: s?.agents ?? 0,
  };
}

export type AgentRegistryView = {
  agentId: string;
  feedbacks: number; // non-revoked
  clients: number;
  naiveAverage: string | null; // decimal string, mean of value / 10^decimals over non-revoked feedback
  outOfRange: number; // |value| >= 1e38
  owner: string | null;
  wallet: string | null;
};

type Row = { id: string; value: string; valueDecimals: number; client: string; revokedAtBlock: string | null };

/** Everything the "explorer" column needs about one agent, straight from the indexed registry (1 min memo). */
export const agentRegistryView = (chainId: number, agentId: string) =>
  cached(`agent:${chainId}:${agentId}`, () => fetchAgentRegistryView(chainId, agentId));

async function fetchAgentRegistryView(chainId: number, agentId: string): Promise<AgentRegistryView> {
  const agentQ = gql<{ Agent: { owner: string; wallet: string }[] }>(
    `query($c: Int!, $a: String!) { Agent(where: {chainId: {_eq: $c}, id: {_eq: $a}}) { owner wallet } }`,
    { c: chainId, a: agentId },
  );
  agentQ.catch(() => undefined); // awaited below; avoid an unhandled rejection if the pages fail first
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
    );
    rows.push(...d.Feedback);
    if (d.Feedback.length < 1000) break;
    last = d.Feedback[d.Feedback.length - 1].id;
  }
  const a = await agentQ;
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
    clients: byClient.size,
    naiveAverage: mean === null ? null : String(mean),
    outOfRange: oor,
    owner: a.Agent[0]?.owner ?? null,
    wallet: a.Agent[0]?.wallet ?? null,
  };
}

// ---------------------------------------------------------------- activity feed (left column)

/** Latest registry activity of a chain: new ratings, revocations, registrations and transfers. Never memoised:
 *  the feed polls it. Also returns the indexer's head, shown next to the feed. */
export async function latestActivity(chainId: number, n = 25): Promise<EnvioActivity & { head: number }> {
  const d = await gql<{
    Feedback: EnvioActivity["feedbacks"];
    revoked: EnvioActivity["revoked"];
    OwnerChange: EnvioActivity["owners"];
    chain_metadata: { latest_processed_block: number }[];
  }>(
    `query($c: Int!, $n: Int!) {
      Feedback(where: {chainId: {_eq: $c}}, order_by: [{blockNumber: desc}, {logIndex: desc}], limit: $n) {
        id agent_id client feedbackIndex value valueDecimals tag1 blockNumber logIndex
      }
      revoked: Feedback(where: {chainId: {_eq: $c}, revokedAtBlock: {_is_null: false}}, order_by: {revokedAtBlock: desc}, limit: 8) {
        id agent_id client feedbackIndex tag1 revokedAtBlock
      }
      OwnerChange(where: {chainId: {_eq: $c}}, order_by: [{blockNumber: desc}, {logIndex: desc}], limit: 12) {
        id agent_id from to isMint blockNumber logIndex
      }
      chain_metadata(where: {chain_id: {_eq: $c}}) { latest_processed_block }
    }`,
    { c: chainId, n },
  );
  return { feedbacks: d.Feedback, revoked: d.revoked, owners: d.OwnerChange, head: d.chain_metadata[0]?.latest_processed_block ?? 0 };
}

/** Agent name from its registration URI, decoded locally when the URI is a data: URL (no request to any
 *  explorer, no fetch of a remote URI). null when the name is not readable that way. */
export function nameFromUri(uri: string | null | undefined): string | null {
  if (!uri || !uri.startsWith("data:")) return null;
  try {
    const comma = uri.indexOf(",");
    const meta = uri.slice(5, comma);
    const body = uri.slice(comma + 1);
    const text = meta.endsWith(";base64") ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0))) : decodeURIComponent(body);
    const name = JSON.parse(text)?.name;
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 48) : null;
  } catch {
    return null;
  }
}

export type AgentIdentity = { id: string; owner: string; wallet: string; name: string | null; registeredBlock: string | null };

/** Identity of a few agents (owner, wallet, decoded name). 1 min memo per (chain, id). */
export async function agentIdentities(chainId: number, ids: string[]): Promise<Record<string, AgentIdentity>> {
  const want = [...new Set(ids)].filter(Boolean);
  const out: Record<string, AgentIdentity> = {};
  const missing: string[] = [];
  for (const id of want) {
    const hit = idMemo.get(`${chainId}:${id}`);
    if (hit && Date.now() - hit.at < TTL_MS) out[id] = hit.v;
    else missing.push(id);
  }
  if (missing.length) {
    const d = await gql<{ Agent: { id: string; owner: string; wallet: string; uri: string; registeredBlock: string | null }[] }>(
      `query($c: Int!, $ids: [String!]!) { Agent(where: {chainId: {_eq: $c}, id: {_in: $ids}}) { id owner wallet uri registeredBlock } }`,
      { c: chainId, ids: missing },
    );
    for (const a of d.Agent) {
      const v = { id: a.id, owner: a.owner, wallet: a.wallet, name: nameFromUri(a.uri), registeredBlock: a.registeredBlock };
      idMemo.set(`${chainId}:${a.id}`, { at: Date.now(), v });
      out[a.id] = v;
    }
  }
  return out;
}
const idMemo = new Map<string, { at: number; v: AgentIdentity }>();

export type EnvioRating = { id: string; client: string; value: string; valueDecimals: number; tag1: string; blockNumber: string; revokedAtBlock: string | null; feedbackIndex: string };

/** The latest ratings of one agent (for an agent page outside a certified set: listed, not weighted). */
export async function agentRatings(chainId: number, agentId: string, n = 50): Promise<EnvioRating[]> {
  const d = await gql<{ Feedback: EnvioRating[] }>(
    `query($c: Int!, $a: String!, $n: Int!) {
      Feedback(where: {chainId: {_eq: $c}, agent_id: {_eq: $a}}, order_by: [{blockNumber: desc}, {logIndex: desc}], limit: $n) {
        id client value valueDecimals tag1 blockNumber revokedAtBlock feedbackIndex
      }
    }`,
    { c: chainId, a: agentId, n },
  );
  return d.Feedback;
}

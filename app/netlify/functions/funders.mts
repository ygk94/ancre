// Netlify Function (v2): GET /api/funders?address=0x… -> the first MON that address received on Monad mainnet,
// from the Alchemy Transfers API. Server side only: ALCHEMY_API_KEY is a Netlify environment variable, never in the
// bundle, never in a response. Not an open proxy: one parameter, validated; the method, network, category, order and
// size of the upstream query are fixed (src/core/funders.ts `transfersRequest`); the answer is reduced to five fields.
import { parseQuery, parseTransfers, transfersRequest } from "../../src/core/funders";

const UPSTREAM = "https://monad-mainnet.g.alchemy.com/v2/";
const TTL_MS = 10 * 60_000; // the first funding of an address is history: it does not change
const cache = new Map<string, { at: number; body: string }>(); // per warm instance; the CDN caches too
const MAX_CACHE = 5_000;

const json = (status: number, obj: unknown, cacheable = false) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": cacheable ? "public, max-age=600" : "no-store",
      ...(cacheable ? { "netlify-cdn-cache-control": "public, durable, s-maxage=3600" } : {}),
    },
  });

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json(405, { error: "GET only" });
  const q = parseQuery(new URL(req.url).searchParams);
  if ("error" in q) return json(400, { error: q.error });
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return json(503, { error: "not configured" });
  const hit = cache.get(q.address);
  if (hit && Date.now() - hit.at < TTL_MS) return new Response(hit.body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } });
  let first;
  try {
    const r = await fetch(UPSTREAM + key, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(transfersRequest(q.address)), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return json(502, { error: `upstream HTTP ${r.status}` });
    first = parseTransfers(await r.json());
  } catch {
    return json(502, { error: "upstream unavailable" }); // never echo the upstream error: it could quote the URL
  }
  const body = { address: q.address, firstFunding: first, source: "Alchemy Transfers API", network: "monad-mainnet", fetchedAt: new Date().toISOString() };
  const s = JSON.stringify(body);
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(q.address, { at: Date.now(), body: s });
  return json(200, body, true);
};

export const config = { path: "/api/funders" };

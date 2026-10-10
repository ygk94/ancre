// "Who funded the raters?" (D55 ②, alchemy-live): the first MON each rater of an agent received, from the Alchemy
// Transfers API. Shared by the Netlify function (server side, holds the key) and the screen (no key, ever).
// Facts only: who sent a rater its first native MON, how much, in which block. No inference is drawn here.

/** The ONE query the function may send: fixed network, method, category, order and size; only the address varies. */
export function transfersRequest(address: string) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers",
    params: [{ fromBlock: "0x0", toBlock: "latest", toAddress: address, category: ["external"], order: "asc", maxCount: "0x1", withMetadata: true, excludeZeroValue: true }],
  } as const;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Strict allow-list of the query string: exactly one parameter, `address`, a 20-byte hex address. */
export function parseQuery(search: URLSearchParams): { address: string } | { error: string } {
  const keys = [...new Set(search.keys())];
  if (keys.length !== 1 || keys[0] !== "address" || search.getAll("address").length !== 1) return { error: "exactly one parameter: address" };
  const a = search.get("address")!;
  if (!ADDRESS.test(a)) return { error: "address must be 0x + 40 hex digits" };
  return { address: a.toLowerCase() };
}

export type FirstFunding = { from: string; wei: string; block: number; tx: string; time: string | null };

/** Minimal view of the Transfers API answer (its first transfer), or null when the rater never received MON
 * through an external transaction. Throws on a malformed answer. */
export function parseTransfers(body: unknown): FirstFunding | null {
  const b = body as { result?: { transfers?: unknown[] }; error?: unknown };
  if (!b || typeof b !== "object" || b.error || !b.result || !Array.isArray(b.result.transfers)) throw new Error("bad Transfers API answer");
  const t = b.result.transfers[0] as
    | { from: string; blockNum: string; hash: string; rawContract?: { value?: string }; metadata?: { blockTimestamp?: string } }
    | undefined;
  if (!t) return null;
  if (!ADDRESS.test(t.from) || !/^0x[0-9a-f]+$/i.test(t.blockNum) || !t.rawContract?.value) throw new Error("bad transfer");
  return { from: t.from.toLowerCase(), wei: BigInt(t.rawContract.value).toString(), block: Number(BigInt(t.blockNum)), tx: t.hash, time: t.metadata?.blockTimestamp ?? null };
}

export type FunderRow = { rater: string; firstFunding: FirstFunding | null };

export type FundersSummary = { raters: number; withFirstFunding: number; byOwner: number; distinctFunders: number; amounts: { mon: string; raters: number }[] };

/** Same counts as solver/funders.py `summarize`. */
export function summarize(rows: FunderRow[], owner: string): FundersSummary {
  const funded = rows.filter((r) => r.firstFunding);
  const amounts = new Map<string, number>();
  for (const r of funded) amounts.set(r.firstFunding!.wei, (amounts.get(r.firstFunding!.wei) ?? 0) + 1);
  return {
    raters: rows.length,
    withFirstFunding: funded.length,
    byOwner: funded.filter((r) => r.firstFunding!.from === owner.toLowerCase()).length,
    distinctFunders: new Set(funded.map((r) => r.firstFunding!.from)).size,
    amounts: [...amounts.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => ({ mon: monOf(w), raters: n })),
  };
}

/** wei -> MON with up to 4 decimals, exact for the amounts shown (no float on 18-decimal values). */
export function monOf(wei: string): string {
  const w = BigInt(wei);
  const whole = w / 10n ** 18n;
  const frac = ((w % 10n ** 18n) / 10n ** 14n).toString().padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}.0`;
}

export type LiveRow = { rater: string; firstFunding: FirstFunding | null; fetchedAt: string };
export type LiveResult = { ok: true; rows: LiveRow[] } | { ok: false; reason: string };

/** Ask the Netlify function about each address. Anything but a well-formed JSON answer for every address (dev
 * server, no key, function absent, upstream down) is a failure: the screen then shows the committed measure only. */
export async function liveCheck(addresses: string[], get: (url: string) => Promise<Response>, base = "/api/funders"): Promise<LiveResult> {
  try {
    const rows = await Promise.all(
      addresses.map(async (a) => {
        const r = await get(`${base}?address=${a}`);
        if (!r.ok) throw new Error(r.status === 503 ? "function not configured (ALCHEMY_API_KEY)" : `HTTP ${r.status}`);
        if (!(r.headers.get("content-type") ?? "").includes("application/json")) throw new Error("function not deployed here");
        const b = (await r.json()) as { address?: string; firstFunding?: FirstFunding | null; fetchedAt?: string; source?: string };
        if (b.address !== a.toLowerCase() || b.firstFunding === undefined || b.source !== "Alchemy Transfers API") throw new Error("unexpected answer");
        return { rater: b.address, firstFunding: b.firstFunding, fetchedAt: b.fetchedAt ?? "" };
      }),
    );
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Deterministic pick of k raters (the screen re-checks a few live; seeded so a reload shows the same ones). */
export function pick<T>(xs: T[], k: number, seed: number): T[] {
  const a = [...xs];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

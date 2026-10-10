import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { config } from "../netlify/functions/funders.mts";
import { liveCheck, monOf, parseQuery, parseTransfers, pick, summarize, transfersRequest } from "../src/core/funders";
import m182 from "../src/data/funders-182.json";

const OWNER = "0x97cd97cfe21799bacbf39d0a53469e5f82f30996";
const RATER = "0x000b86d0927095aed35e2193a0f98401b35b6358";
// the Transfers API answer for that rater, as measured on 2026-10-10 (solver/funders.py)
const ANSWER = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    transfers: [
      {
        blockNum: "0x351a8c6",
        hash: "0x2c7cebc273da93a5a66a41986ab36a2b6fe2ca96a57d928c58adb8600ced64d6",
        from: OWNER,
        to: RATER,
        value: 11.0,
        asset: "MON",
        category: "external",
        rawContract: { value: "0x98a7d9b8314c0000", address: null, decimal: "0x12" },
        metadata: { blockTimestamp: "2026-02-16T04:20:38.000Z" },
      },
    ],
  },
};

describe("query allow-list", () => {
  it("accepts exactly one address parameter", () => {
    expect(parseQuery(new URLSearchParams(`address=${RATER.toUpperCase().replace("0X", "0x")}`))).toEqual({ address: RATER });
  });
  it("refuses anything else: other parameters, two addresses, bad hex", () => {
    for (const q of ["", `address=${RATER}&category=erc20`, `address=${RATER}&address=${OWNER}`, "address=0x1234", `method=eth_call`, `address=${RATER}zz`])
      expect("error" in parseQuery(new URLSearchParams(q))).toBe(true);
  });
  it("the upstream query is fixed but for the address", () => {
    const r = transfersRequest(RATER);
    expect(r.method).toBe("alchemy_getAssetTransfers");
    expect(r.params[0]).toMatchObject({ toAddress: RATER, category: ["external"], order: "asc", maxCount: "0x1", fromBlock: "0x0" });
  });
});

describe("answer parsing", () => {
  it("keeps five fields, exact wei", () => {
    expect(parseTransfers(ANSWER)).toEqual({ from: OWNER, wei: "11000000000000000000", block: 55683270, tx: ANSWER.result.transfers[0].hash, time: "2026-02-16T04:20:38.000Z" });
    expect(monOf("11000000000000000000")).toBe("11.0");
    expect(monOf("1500000000000000")).toBe("0.0015");
  });
  it("no transfer -> null; an error or a malformed answer throws", () => {
    expect(parseTransfers({ result: { transfers: [] } })).toBeNull();
    expect(() => parseTransfers({ error: { code: -32600 } })).toThrow();
    expect(() => parseTransfers({ result: { transfers: [{ from: "x" }] } })).toThrow();
  });
});

describe("committed measure (solver/funders.py --app-out)", () => {
  it("is MEASURED, dated, and its summary matches its rows", () => {
    expect(m182.status).toBe("MEASURED");
    expect(m182.source).toBe("Alchemy Transfers API (alchemy_getAssetTransfers)");
    expect(m182.owner).toBe(OWNER);
    const s = summarize(m182.rows, m182.owner);
    if (!m182.sample) expect(s.raters).toBeLessThanOrEqual(m182.summary.raters);
    else expect(s.byOwner).toBe(m182.summary.firstFundedByOwner);
    expect(m182.rowsKept).toBe(m182.rows.length);
  });
  it("pick is deterministic and without repetition", () => {
    const xs = m182.rows.map((r) => r.rater);
    expect(pick(xs, 6, 42)).toEqual(pick(xs, 6, 42));
    expect(new Set(pick(xs, 6, 42)).size).toBe(6);
  });
});

describe("Netlify function /api/funders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ALCHEMY_API_KEY;
  });
  const call = (q: string, method = "GET") => handler(new Request(`https://x.test/api/funders${q}`, { method }));

  it("is mounted at /api/funders", () => expect(config.path).toBe("/api/funders"));
  it("400 on a bad query, 405 on POST, 503 without the key (never calls upstream)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await call("?url=https://evil")).status).toBe(400);
    expect((await call(`?address=${RATER}`, "POST")).status).toBe(405);
    expect((await call(`?address=${RATER}`)).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
  it("answers the minimal view, keeps the key out of the answer, caches", async () => {
    process.env.ALCHEMY_API_KEY = "test-key-not-real";
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual(transfersRequest(RATER));
      return new Response(JSON.stringify(ANSWER), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", f);
    const r = await call(`?address=${RATER}`);
    const text = await r.text();
    expect(r.status).toBe(200);
    expect(text).not.toContain("test-key-not-real");
    expect(JSON.parse(text)).toMatchObject({ address: RATER, firstFunding: { from: OWNER, wei: "11000000000000000000" }, source: "Alchemy Transfers API" });
    expect(r.headers.get("cache-control")).toContain("max-age");
    expect(String(f.mock.calls[0][0])).toBe("https://monad-mainnet.g.alchemy.com/v2/test-key-not-real");
    await call(`?address=${RATER}`);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("an upstream failure is a 502 that does not echo the upstream", async () => {
    process.env.ALCHEMY_API_KEY = "test-key-not-real";
    vi.stubGlobal("fetch", async () => {
      throw new Error("connect failed https://monad-mainnet.g.alchemy.com/v2/test-key-not-real");
    });
    const r = await call(`?address=${OWNER}`);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("test-key");
  });
});

describe("screen live re-check", () => {
  it("uses the function's answers", async () => {
    const get = async (u: string) => {
      const a = new URL(u, "https://x.test").searchParams.get("address")!;
      return new Response(JSON.stringify({ address: a, firstFunding: parseTransfers(ANSWER), source: "Alchemy Transfers API", fetchedAt: "2026-10-10T12:00:00Z" }), {
        headers: { "content-type": "application/json" },
      });
    };
    const r = await liveCheck([RATER], get);
    expect(r).toEqual({ ok: true, rows: [{ rater: RATER, firstFunding: parseTransfers(ANSWER), fetchedAt: "2026-10-10T12:00:00Z" }] });
  });
  it("falls back on the dev server (index.html), a 503, or a 404", async () => {
    const html = async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
    expect(await liveCheck([RATER], html)).toEqual({ ok: false, reason: "function not deployed here" });
    expect(await liveCheck([RATER], async () => new Response("{}", { status: 503 }))).toEqual({ ok: false, reason: "function not configured (ALCHEMY_API_KEY)" });
    expect((await liveCheck([RATER], async () => new Response("", { status: 404 }))).ok).toBe(false);
  });
});

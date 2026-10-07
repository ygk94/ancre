// New logic of 07-bis on real data: the recorded chantier 06 run (testnet set) and the solver export (mainnet).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import act1Json from "../src/data/act1.json";
import { parseRun } from "../src/core/demo";
import { fbKey, fromEnvio, fromRun, mergeFeed, ratingValue, type FeedItem } from "../src/core/feed";
import { groupsOf, mainnetReach, mainnetRows, type Act1 } from "../src/core/mainnet";
import { trustRoutes, type Source } from "../src/core/path";
import { buildRunSet, quantize } from "../src/core/runset";
import { href, parseRoute } from "../src/router";

const index = JSON.parse(readFileSync(new URL("../public/runs/index.json", import.meta.url), "utf8"));
const lines = parseRun(readFileSync(new URL(`../public/runs/${index.runs[0].file}`, import.meta.url), "utf8"));
const rs = buildRunSet(lines)!;
const byName = (n: string) => rs.rows.find((r) => r.name === n)!;
const act1 = act1Json as unknown as Act1;

describe("testnet set from the recorded run", () => {
  it("passes exactly the honest providers, including the second hop", () => {
    expect(rs.rows.filter((r) => r.passes).map((r) => r.name).sort()).toEqual(["provider-1", "provider-3"]);
    expect(byName("provider-3").reach).toEqual({ kind: "hops", hops: 2, via: [byName("provider-1").id] });
    expect(byName("provider-1").reach).toEqual({ kind: "anchors", count: 2 });
  });

  it("refuses the farm target although its registry average is 100", () => {
    const t = byName("farm target");
    expect(t.passes).toBe(false);
    expect(Number(t.explorer!.naive)).toBe(100);
    expect(t.trustLow).toBe("0");
    expect(t.why).toMatch(/one anchor only/);
  });

  it("D49: farm ratings count for 0, the compromised anchor's counts directly, the slash is a veto", () => {
    const t = rs.reviewsOf(byName("farm target").id);
    expect(t.filter((g) => g.why === "unreachable").length).toBe(10);
    expect(t.filter((g) => g.why === "anchor").length).toBe(1);
    const p2 = rs.reviewsOf(byName("provider-2").id);
    expect(p2.some((g) => g.why === "anchor_negative" && g.tag === "slash")).toBe(true);
    // the third party's +1 under another tag: its author is not reachable, it does not lift the veto
    expect(p2.some((g) => g.why === "unreachable" && g.tag === "review")).toBe(true);
    expect(byName("provider-2").status).toBe("VETOED");
  });

  it("D50: the trust path of the second hop goes anchors -> provider-1 -> provider-3", () => {
    const inbound = (id: string): Source[] =>
      rs.reviewsOf(id).flatMap((g): Source[] => (g.why === "anchor" ? [{ kind: "anchor", id: g.author! }] : g.why === "hop" ? g.via.map((v) => ({ kind: "agent" as const, id: v })) : []));
    const p1 = byName("provider-1").id, p3 = byName("provider-3").id;
    const routes = trustRoutes(p3, inbound);
    expect(routes).toHaveLength(1);
    expect(routes[0].agents).toEqual([p1, p3]);
    expect(routes[0].anchors).toHaveLength(2);
    expect(trustRoutes(byName("farm-01").id, inbound)).toEqual([]);
  });

  it("R4: out of bounds is rejected, never capped; truncation toward zero", () => {
    const vouch = { tag: "vouch", hash: "", kind: "endorsement", min: "0", neutral: "0", max: (100n * 10n ** 18n).toString() };
    expect(quantize("80", 0, vouch)).toBe(8000);
    expect(quantize("101", 0, vouch)).toBeNull();
    expect(quantize("-1", 0, vouch)).toBeNull();
    expect(quantize("0", 0, vouch)).toBe(0);
    expect(quantize("3333", 2, vouch)).toBe(3333); // 33.33 / 100
  });

  it("ANCRE feed items: certificates, the fabricated one rejected, the veto, payer decisions", () => {
    const items = fromRun(rs);
    expect(items.some((i) => i.kind === "rejected" && /EdgeMismatch/.test(i.title))).toBe(true);
    expect(items.filter((i) => i.kind === "veto")).toHaveLength(1);
    expect(items.some((i) => i.kind === "payment" && i.tone === "good")).toBe(true);
    expect(items.every((i) => i.net === "demo")).toBe(true); // a fork run never links to real testnet agents
  });
});

describe("mainnet preview from the solver export", () => {
  const lens = act1.lenses.find((l) => l.id === "independent")!;
  it("passes #18, #2, #3 and refuses Eve with 0 mass", () => {
    const rows = mainnetRows(act1, lens, (id) => `#${id}`);
    expect(rows.filter((r) => r.passes).map((r) => r.id)).toEqual(["18", "2", "3"]);
    const eve = rows.find((r) => r.id === "182")!;
    expect(eve.passes).toBe(false);
    expect(eve.trustLow).toBe("0");
    expect(eve.explorer!.ratings).toBe(7665);
    expect(mainnetReach(lens, "2")).toEqual({ kind: "hops", hops: 2, via: ["18"] });
  });

  it("D49: every one of Eve's 7,665 ratings is accounted for, none carries weight", () => {
    const g = groupsOf(lens.reviews["182"]);
    expect(g.reduce((s, x) => s + x.count, 0)).toBe(7665);
    expect(g.every((x) => x.contribution === "0")).toBe(true);
    const perm = groupsOf(act1.permissive.reviews["182"]);
    const n = (w: string) => perm.filter((x) => x.why === w).reduce((s, x) => s + x.count, 0);
    expect(n("unreachable") + n("out_of_bounds")).toBe(7665);
    expect(n("out_of_bounds")).toBe(117);
  });

  it("D49: the contributions of #18's two anchor ratings add up to its raw mass", () => {
    const sum = groupsOf(lens.reviews["18"]).reduce((s, x) => s + BigInt(x.contribution ?? "0"), 0n);
    const raw = BigInt(lens.ranking.find((r) => r.agentId === "18")!.trust);
    expect(raw - sum).toBeLessThan(10n ** 6n);
    expect(raw - sum).toBeGreaterThanOrEqual(0n);
  });
});

describe("registry feed", () => {
  it("formats the farm's out-of-range values and decimals", () => {
    expect(ratingValue((10n ** 38n).toString(), 0)).toBe("1e38");
    expect(ratingValue("8750", 2)).toBe("87.5");
    expect(ratingValue("-100", 0)).toBe("-100");
  });

  it("an indexed row replaces the provisional WebSocket row with the same key", () => {
    const ws: FeedItem = { key: fbKey("7", "0xAB", 1), origin: "registry", source: "ws", kind: "feedback", block: 10, order: 1, agentId: "7", net: "testnet", title: "#7 rated 5", detail: "", tone: "neutral" };
    const env = fromEnvio(
      { feedbacks: [{ id: "x", agent_id: "7", client: "0xab", feedbackIndex: "1", value: "5", valueDecimals: 0, tag1: "t", blockNumber: "10", logIndex: 1 }], revoked: [], owners: [] },
      "testnet",
      () => "Seven",
    );
    const merged = mergeFeed([ws], env);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("envio");
    expect(mergeFeed(merged, [ws])[0].source).toBe("envio"); // a late WebSocket echo never downgrades it
  });

  it("orders newest first", () => {
    const mk = (block: number, order: number): FeedItem => ({ key: `${block}:${order}`, origin: "registry", source: "envio", kind: "registered", block, order, agentId: null, net: "testnet", title: "", detail: "", tone: "neutral" });
    expect(mergeFeed([], [mk(1, 0), mk(3, 1), mk(3, 2), mk(2, 0)]).map((x) => x.key)).toEqual(["3:2", "3:1", "2:0", "1:0"]);
  });
});

describe("routes", () => {
  it("parses pages, the network and the legacy ?act= links", () => {
    expect(parseRoute("/", "").page).toBe("discover");
    expect(parseRoute("/", "?network=mainnet").network).toBe("mainnet");
    expect(parseRoute("/agent/mainnet/182", "?tab=ratings")).toMatchObject({ page: "agent", net: "mainnet", id: "182", network: "mainnet", tab: "ratings" });
    expect(parseRoute("/agent/demo/2024", "")).toMatchObject({ page: "agent", net: "demo", network: "testnet" });
    expect(parseRoute("/", "?act=2").page).toBe("live");
    expect(parseRoute("/", "?act=1")).toMatchObject({ page: "discover", network: "mainnet" });
    expect(parseRoute("/mera", "").page).toBe("notfound"); // reserved: a future static page wins over the SPA
  });

  it("builds links that keep the network and the anchors", () => {
    const cur = parseRoute("/", "?network=mainnet&anchors=inside-farm");
    expect(href({ page: "leaderboard" }, cur)).toBe("/leaderboard?network=mainnet&anchors=inside-farm");
    expect(href({ page: "agent", net: "mainnet", id: "182", tab: "path" } as never, cur)).toBe("/agent/mainnet/182?anchors=inside-farm&tab=path");
    expect(href({ page: "live" }, cur)).toBe("/live");
  });
});

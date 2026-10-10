import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NETWORK_CHOICES, NETWORKS, monadscan } from "../src/config/networks";
import { fromMainnetRun } from "../src/core/feed";
import { extractMainnetRun } from "../src/core/mainnetRun";
import { certAge, duration, idsToRead, verdictOf, type OnchainAssess } from "../src/core/onchain";
import committed from "../src/data/mainnet-run.json";
import { readMainnet, toAssess } from "../src/sources/mainnetChain";

const repo = join(__dirname, "../..");
const SOURCE = "docs/chantiers/rapports/act-mainnet/run-20261010T123036Z.json";

describe("mainnet run of 10/10 (RECORDED)", () => {
  it("src/data/mainnet-run.json is exactly what the archived event log says", () => {
    const log = JSON.parse(readFileSync(join(repo, SOURCE), "utf8"));
    expect(extractMainnetRun(log, SOURCE)).toEqual(committed);
  });

  it("matches the facts published in demo/JUDGES.md", () => {
    const judges = readFileSync(join(repo, "demo/JUDGES.md"), "utf8");
    const r = committed;
    expect(r.contracts.ancre).toBe("0x0Da1579233E7Cb07a174986D059D59B1F293b30E");
    expect(r.contracts.payer).toBe("0x52f361A14A49fAB267703203f833b997B9cF5Dc0");
    expect(r.set.setId).toBe("0x627c8afe36b03432b280723a7170357333ded4d9ce56a78467c5829739653e10");
    expect(r.deploy.ancre.block).toBe(112182847);
    const paid = r.payments.find((p) => p.decision === "PAID")!;
    expect(paid.agentId).toBe("10330");
    expect(paid.settlementTx).toBe("0xa099331e10ae31327e54d53b78a3c24277e140f235fe2373f33946d06853a60c");
    expect(r.payments.find((p) => p.agentId === "182")).toMatchObject({ decision: "REFUSED", reason: "UNTRUSTED", settlementTx: null });
    expect(r.breaker).toMatchObject({ blocks: 1, ms: 332 });
    for (const tx of [r.deploy.ancre.tx, r.deploy.payer.tx, paid.settlementTx, ...r.certificates.map((c) => c.tx), ...r.feedbacks.map((f) => f.tx)])
      expect(judges).toContain(tx!);
  });

  it("names a third-party agent by its registry name only (no label from the run)", () => {
    expect(committed.agents.find((a) => a.agentId === "182")!.label).toBe("Eve-8004");
  });
});

describe("network selector", () => {
  it("mainnet is active, labelled honestly, never 'preview'", () => {
    const m = NETWORK_CHOICES.find((n) => n.id === "mainnet")!;
    expect(m.state).toBe("active");
    expect(m.tag).toMatch(/minimal run 10\/10/);
    expect(JSON.stringify(NETWORK_CHOICES)).not.toMatch(/preview/i);
    expect(m.blurb).toMatch(/reference solver/);
  });
  it("public RPC, no key, monadscan links", () => {
    expect(NETWORKS.mainnet.http).toBe("https://rpc.monad.xyz");
    expect(NETWORKS.mainnet.http).not.toMatch(/key|token|alchemy/i);
    expect(monadscan("tx", "0xab")).toBe("https://monadscan.com/tx/0xab");
    expect(monadscan("address", "0x0D")).toBe("https://monadscan.com/address/0x0D");
    expect(monadscan("block", 1)).toBe("https://monadscan.com/block/1");
  });
});

describe("certificate age (the contract's rule: STALE iff block.number - certBlock > maxAge)", () => {
  const cert = { number: 112182889, timestamp: 1791635450 };
  it("fresh up to maxAge blocks, STALE one block later", () => {
    const at = (n: number) => certAge({ number: cert.number + n, timestamp: cert.timestamp + n * 0.3 }, cert, 288000)!;
    expect(at(288000)).toMatchObject({ stale: false, blocksLeft: 0, lastValidBlock: 112470889 });
    expect(at(288001)).toMatchObject({ stale: true, blocksLeft: 0 });
    expect(at(7789)).toMatchObject({ stale: false, ageBlocks: 7789, blocksLeft: 288000 - 7789 });
  });
  it("measures the block rate from the two timestamps, only over enough blocks", () => {
    const a = certAge({ number: cert.number + 10000, timestamp: cert.timestamp + 3020 }, cert, 288000)!;
    expect(a.ageSeconds).toBe(3020);
    expect(a.secondsPerBlock).toBeCloseTo(0.302, 6);
    expect(certAge({ number: cert.number + 10, timestamp: cert.timestamp + 3 }, cert, 288000)!.secondsPerBlock).toBeNull();
  });
  it("nothing read: no age (the screen shows —)", () => {
    expect(certAge(null, cert, 288000)).toBeNull();
    expect(certAge({ number: 1, timestamp: 1 }, null, 288000)).toBeNull();
    expect(certAge({ number: 1, timestamp: 1 }, cert, null)).toBeNull();
    expect(certAge({ number: 1, timestamp: 1 }, { number: 0, timestamp: 0 }, 288000)).toBeNull();
  });
  it("duration", () => {
    expect(duration(52)).toBe("52 s");
    expect(duration(41 * 60)).toBe("41 min");
    expect(duration(3 * 3600 + 12 * 60)).toBe("3 h 12 min");
    expect(duration(86400 * 2 + 3600 * 4)).toBe("2 d 4 h");
    expect(duration(null)).toBe("—");
  });
});

describe("on-chain verdict comes from assess() only", () => {
  const base: OnchainAssess = { status: "OK", trust: "0", trustRobust: "0", trustLow: "0", distrust: "0", distrustUp: "7", e: "7", certBlock: 112182889, vetoCount: 0, triggerTag: null, passesPolicy: false };
  it("maps each status", () => {
    expect(verdictOf(null)).toMatchObject({ word: "UNREAD", text: expect.stringContaining("—") });
    expect(verdictOf({ ...base, status: "STALE" }).word).toBe("STALE");
    expect(verdictOf({ ...base, status: "VETOED", vetoCount: 1 }).text).toMatch(/vetoed by 1 anchor:/);
    expect(verdictOf({ ...base, passesPolicy: true }).word).toBe("PASSES");
    expect(verdictOf(base)).toMatchObject({ word: "REFUSED", text: expect.stringMatching(/mass 0/) });
    expect(verdictOf({ ...base, status: "NO_CERT" }).word).toBe("NO_CERT");
  });
  it("decodes the Assessment tuple of the contract (10330 read on mainnet, 10/10)", () => {
    const a = toAssess({
      status: 4, trust: 59259259259259259n, trustRobust: 0n, distrust: 74074074074074074n, e: 7n, certBlock: 112182889n, vetoCount: 1,
      triggerTag: "0xf83f8a174c4825c98b32d3757717b2efda126db29012b815e48bc296ccdf878e", trustLow: 0n, distrustUp: 74074074074074081n, eLow: 0n, passesPolicy: false,
    });
    expect(a).toMatchObject({ status: "VETOED", trustLow: "0", certBlock: 112182889, vetoCount: 1, passesPolicy: false });
    expect(verdictOf(a).word).toBe("VETOED");
  });
  it("reads the run's agents and the page's own agent, once each", () => {
    expect(idsToRead(["10330", "182"], ["182", "9", null, "x"])).toEqual(["10330", "182", "9"]);
  });
});

describe("RPC unreachable: every on-chain value stays null (rendered —), nothing invented", () => {
  it("readMainnet against a closed port", async () => {
    const st = await readMainnet(["10330", "182"], "http://127.0.0.1:9");
    expect(st.head).toBeNull();
    expect(st.cert).toBeNull();
    expect(st.maxAge).toBeNull();
    expect(st.agents["10330"]).toEqual({ agentId: "10330", assess: null, wallet: null, decide: null });
    expect(st.agents["182"].assess).toBeNull();
    expect(st.errors.length).toBeGreaterThan(0);
  });
});

describe("feed (ANCRE tab, mainnet): the run's recorded events", () => {
  it("certificates, the slash and the payer decisions, newest first", () => {
    const f = fromMainnetRun(committed as never, (id) => (id === "182" ? "Eve-8004" : `#${id}`));
    expect(f.map((x) => x.kind)).toEqual(["payment", "certificate", "payment", "veto", "payment", "payment", "certificate"]);
    expect(f.every((x) => x.net === "mainnet" && x.source === "run")).toBe(true);
    expect(f.find((x) => x.agentId === "182")!.title).toBe("Refused Eve-8004 · UNTRUSTED");
    expect(f.at(-2)!.title).toBe("Paid provider-1 (demo) 0.01 USDC");
  });
});

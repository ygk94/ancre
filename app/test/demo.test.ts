// The reducer on the real chantier 06 logs (public/runs/*.json, copied by scripts/sync-runs.mjs).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialScreen, parseRun, reduce, reduceAll } from "../src/core/demo";

const load = (f: string) => parseRun(readFileSync(new URL(`../public/runs/${f}`, import.meta.url), "utf8"));
const index = JSON.parse(readFileSync(new URL("../public/runs/index.json", import.meta.url), "utf8"));

describe("demo reducer on recorded runs", () => {
  for (const run of index.runs) {
    it(`${run.runId} (${run.mode}): scenes pass, farm refused, breaker vetoes`, () => {
      const s = reduceAll(load(run.file));
      expect(s.header?.runId).toBe(run.runId);
      expect(s.scenes.every((x) => x.ok === true)).toBe(true);
      const byRole = (r: string) => Object.values(s.agents).filter((a) => a.role === r);
      const target = byRole("farm-target")[0];
      // the farm pumps the naive average to 100 while the contract mass stays 0 and the payer refuses
      expect(Number(target.explorer.naiveAverage)).toBe(100);
      expect(target.contract.trustLow).toBe("0");
      expect(target.lastPayment?.decision).toBe("REFUSED");
      // breaker: provider-2 is VETOED and its last payment refused
      const p2 = byRole("provider").find((a) => a.label.startsWith("provider-2"))!;
      expect(p2.contract.status).toBe("VETOED");
      expect(p2.lastPayment?.decision).toBe("REFUSED");
      expect(s.latency?.to.step).toMatch(/^4\./);
      expect(s.paid).toBeGreaterThan(0);
      expect(s.refused).toBeGreaterThan(0);
    });
  }

  it("is idempotent on re-read (live tail re-reads the whole file)", () => {
    const lines = load(index.runs[0].file);
    const once = reduceAll(lines);
    const twice = lines.reduce(reduce, once);
    expect(twice).toBe(once);
  });

  it("same lines, same state: live and replay share the reducer", () => {
    const lines = load(index.runs[0].file);
    const half = reduceAll(lines.slice(0, 40));
    expect(reduceAll(lines.slice(40), half)).toEqual(reduceAll(lines));
  });

  it("refuses an unknown format instead of rendering it", () => {
    const s = reduce(initialScreen(), { ...(load(index.runs[0].file)[0] as any), format: "v0" });
    expect(s.header).toBeNull();
    expect(s.warnings[0]).toMatch(/unknown format/);
  });
});

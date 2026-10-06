import { describe, expect, it } from "vitest";
import { initialHeads, reduceHead, stateOf } from "../src/core/heads";

const h = (t: number, number: number, hash: string, commitState?: string) => ({ t, raw: { number: "0x" + number.toString(16), hash, commitState } });

describe("block commit states", () => {
  it("tracks Proposed -> Voted -> Finalized and measures latencies", () => {
    let s = initialHeads();
    s = reduceHead(s, h(0, 10, "0xa", "Proposed"));
    expect(stateOf(s, 10)).toBe("Proposed");
    s = reduceHead(s, h(300, 10, "0xa", "Voted"));
    s = reduceHead(s, h(300, 10, "0xa", "Voted")); // duplicate
    s = reduceHead(s, h(560, 10, "0xa", "Finalized"));
    expect(stateOf(s, 10)).toBe("Finalized");
    expect(s.latencies.voted).toEqual([300]);
    expect(s.latencies.finalized).toEqual([560]);
  });
  it("purges an abandoned proposal when another hash is finalized at its height", () => {
    let s = initialHeads();
    s = reduceHead(s, h(0, 11, "0xb", "Proposed"));
    s = reduceHead(s, h(5, 11, "0xc", "Proposed"));
    s = reduceHead(s, h(600, 11, "0xc", "Finalized"));
    expect(s.dropped).toBe(1);
    expect([...s.blocks.values()].map((b) => b.hash)).toEqual(["0xc"]);
  });
  it("never goes back to a lower state", () => {
    let s = reduceHead(initialHeads(), h(0, 12, "0xd", "Finalized"));
    const t = reduceHead(s, h(1, 12, "0xd", "Proposed"));
    expect(t).toBe(s);
  });
  it("anvil newHeads (no commitState) counts as final", () => {
    const s = reduceHead(initialHeads(), h(0, 13, "0xe"));
    expect(stateOf(s, 13)).toBe("Finalized");
    expect(stateOf(s, 14)).toBeNull();
  });
});

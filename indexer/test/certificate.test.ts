// E4 (stable part): the indexer decodes the certificate calldata exactly as the contract and the solver encode it.
// Checked on every normative vector of solver/vectors (monorepo only; skipped in the standalone repo).
import { describe, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { decodeNewNodes, decodeRows, graphRoot, EncodingError } from "../src/lib/certificate.js";

const DIR = new URL("../../solver/vectors/", import.meta.url);
const VECTORS = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];

describe.runIf(VECTORS.length > 0)("certificate calldata (solver/vectors)", () => {
  for (const f of VECTORS) {
    it(`${f}: rows decode to the vector's rows and graphRoot matches`, (t) => {
      const v = JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
      const d = decodeRows(v.calldata.rows, v.nCert);
      t.expect(d.rows.map((r) => ({ u: r.u, wallet: r.wallet ?? null, edges: r.edges }))).toEqual(
        v.rows.map((r: any) => ({ u: r.u, wallet: r.wallet ?? null,
          edges: r.edges.map((e: any) => ({ dst: e.dst, w: e.w, feedbackIndex: e.feedbackIndex })) })));
      t.expect(graphRoot(d.rows.map((r) => r.leaf))).toBe(v.expected.graphRoot);
      const nodes = decodeNewNodes(v.calldata.newNodes);
      const k = v.set.anchors.length;
      t.expect(nodes.map((n) => (n.kind === "agent" ? `a${n.agentId}` : `x${n.address}`))).toEqual(
        v.nodes.slice(k).map((n: any) => (n.kind === "agent" ? `a${n.agentId}` : `x${n.address.toLowerCase()}`)));
    });
  }
});

describe("certificate calldata: structural rejects (as the contract)", () => {
  it("rejects a zero weight, a non-increasing dst and trailing bytes", (t) => {
    // W=2, 1 row: u=0, nE=1, dst=1, w=0, fi=1
    t.expect(() => decodeRows("0x02" + "00000001" + "0000" + "0001" + "0001" + "0000" + "00000001")).toThrow(EncodingError);
    t.expect(() => decodeRows("0x02" + "00000001" + "0000" + "0002" + "0002" + "2710" + "00000001" + "0001" + "2710" + "00000001")).toThrow(EncodingError);
    t.expect(() => decodeRows("0x02" + "00000000" + "ff")).toThrow(EncodingError);
    t.expect(graphRoot([])).toBe("0x" + "00".repeat(32));
    t.expect(() => decodeRows("0x02zz")).toThrow(EncodingError);
    t.expect(() => decodeRows("0x02" + "00000000", 70_000)).toThrow(EncodingError);
  });
});

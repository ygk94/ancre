// E4: audit of a real certificate (solver vector mainnet_slash_anchor) against the Monad registry state the
// indexer rebuilt from real history (HyperSync) at the certificate's identity block. Then 4 tampered variants.
// Slow-ish (real history): runs with `pnpm test:parity`.
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { existsSync, readFileSync } from "node:fs";
import { auditRows, type NodeInfo } from "../src/lib/audit.js";
import { decodeRows, type CertRow } from "../src/lib/certificate.js";
import { setSchema, storeView } from "../src/lib/view.js";

const VEC = new URL("../../solver/vectors/mainnet_slash_anchor.json", import.meta.url);

describe.runIf(process.env.PARITY === "1" && existsSync(VEC))("certificate audit on real Monad state", () => {
  it("honest certificate: MATCH; fabricated, inflated, omitted and wallet variants are caught", async (t) => {
    const v = JSON.parse(readFileSync(VEC, "utf8"));
    const ix = createTestIndexer();
    await ix.process({ chains: { 143: { startBlock: 52_952_790, endBlock: v.identityBlock } } });
    const view = storeView(ix as never);
    const schema = setSchema(v.set.tags);
    const nodes: NodeInfo[] = v.nodes.map((n: any) =>
      n.kind === "agent" ? { kind: "agent", agentId: BigInt(n.agentId) } : { kind: n.kind, address: n.address.toLowerCase() });
    const vectorRows = decodeRows(v.calldata.rows, v.nCert).rows;
    const node = (agentId: number) => nodes.findIndex((n) => n.kind === "agent" && n.agentId === BigInt(agentId));

    // The vector predates D20: agent #18 (wallet 0xea0b, shared with #22/#23) got an empty row. Under D20 (row
    // copy) #18 speaks for 0xea0b, so its row omits 0xea0b's slash on #4: the audit reports it (INTERFACE 04-E1).
    const asIs = await auditRows(view, schema, nodes, vectorRows);
    t.expect(asIs.discrepancies.map((d) => [d.kind, d.u, d.client, d.agentId, d.wRegistry])).toEqual([
      ["OMITTED_NEG", node(18), "0xea0b21fb2441464f4920ce3e34d478235605816b", "4", -10_000]]);

    // D20-honest certificate: #18's row copies 0xea0b's row (explicit copy; the alias encoding is not specified yet).
    const rows: CertRow[] = vectorRows.map((r) => (r.u === node(18) ? { ...r, edges: vectorRows.find((x) => x.u === 1)!.edges } : r));
    const clone = (): CertRow[] => rows.map((r) => ({ ...r, edges: r.edges.map((e) => ({ ...e })) }));
    const honest = await auditRows(view, schema, nodes, rows);
    t.expect(honest.discrepancies).toEqual([]);
    t.expect(honest.edgesChecked).toBe(7); // 0x0730: 1 ; 0xea0b as anchor: 3 ; #18 (row copy of 0xea0b): 3

    // AM-5.9: anchor 0x0730 (node 0) "vouches" for #4, which it never rated -> FABRICATED
    const fab = clone();
    fab[0]!.edges.push({ dst: node(4), w: 10_000, feedbackIndex: 1 });
    fab[0]!.edges.sort((a, b) => a.dst - b.dst);
    const a1 = await auditRows(view, schema, nodes, fab);
    t.expect(a1.discrepancies.map((d) => [d.kind, d.client, d.agentId, d.wCommitted, d.wRegistry])).toEqual([
      ["FABRICATED", "0x0730536018541c5149a049d35528a76c2c8f1e6b", "4", 10_000, 0]]);

    // the slash of 0xea0b on #4 softened from -10000 to -2000 -> INFLATED
    const inf = clone();
    const slash = inf.find((r) => r.u === 1)!.edges.find((e) => e.dst === node(4))!;
    slash.w = -2000;
    t.expect((await auditRows(view, schema, nodes, inf)).discrepancies.map((d) => d.kind)).toEqual(["INFLATED"]);

    // the slash dropped from 0xea0b's row -> OMITTED_NEG
    const om = clone();
    const r1 = om.find((r) => r.u === 1)!;
    r1.edges = r1.edges.filter((e) => e.dst !== node(4));
    t.expect((await auditRows(view, schema, nodes, om)).discrepancies.map((d) => [d.kind, d.u, d.agentId, d.wRegistry])).toEqual([
      ["OMITTED_NEG", 1, "4", -10_000]]);

    // an agent row committing a wallet that is not the agent's -> WALLET
    const wal = clone();
    wal.find((r) => r.u === node(2))!.wallet = "0x000000000000000000000000000000000000dead";
    t.expect((await auditRows(view, schema, nodes, wal)).discrepancies.map((d) => [d.kind, d.agentId])).toEqual([["WALLET", "2"]]);
  }, 900_000);
});

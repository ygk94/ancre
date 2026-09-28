// P2 gate (chantier 03, E1a): real Monad mainnet transactions, replayed through HyperIndex.
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";

describe("P2: transaction.input is available in a handler", () => {
  it("direct giveFeedback call (0xea0b -> #4, slash -100, block 54268040): calldata decodes and matches the event", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 143: { startBlock: 54_268_040, endBlock: 54_268_040 } } });
    const rows = await indexer.CalldataProbe.getAll();
    t.expect(rows).toHaveLength(1);
    const r = rows[0]!;
    t.expect(r.txHash).toBe("0x17a20ff8c20cbd33b0161b0f5d3622f8f93279c4d11b1537b7079d06be5da498");
    t.expect(r.selector).toBe("0x3c036a7e");
    t.expect(r.directCall).toBe(true);
    t.expect(r.decoded).toBe(true);
    t.expect(r.matchesEvent).toBe(true);
  }, 120_000);

  it("relayed call (execution.market relayer, block 108483651): input is present but is not giveFeedback", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 143: { startBlock: 108_483_651, endBlock: 108_483_651 } } });
    const rows = await indexer.CalldataProbe.getAll();
    t.expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      t.expect(r.directCall).toBe(false);
      t.expect(r.selector).toBe("0x802b2246");
      t.expect(r.inputBytes).toBeGreaterThan(0);
    }
  }, 120_000);
});

// E3 parity: the indexer replays the real Monad history (HyperSync) up to block 108 434 518 and must
// produce exactly the reference edges computed by solver/graph.py (fixture frozen from the solver).
// Also checks the brief 03 §7 acceptance figures, rebuilt from events only.
// Slow (~full history): run with `pnpm test:parity`.
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { readFileSync } from "node:fs";

const REF = JSON.parse(readFileSync(new URL("./fixtures/ref_edges_monad_108434518.json", import.meta.url), "utf8"));
const BLOCK = 108_434_518;

describe.runIf(process.env.PARITY === "1")("parity with solver/graph.py on Monad 143", () => {
  it("same reference edges and same registry figures at block 108 434 518", async (t) => {
    const ix = createTestIndexer();
    await ix.process({ chains: { 143: { startBlock: 52_952_790, endBlock: BLOCK } } });

    const edges = (await ix.RefEdge.getAll())
      .filter((e) => e.w !== 0)
      .map((e) => ({ client: e.client, agent: e.agent_id, w: e.w, tag1: e.decidingTag, feedbackIndex: String(e.feedbackIndex) }))
      .sort((a, b) => (a.client < b.client ? -1 : a.client > b.client ? 1 : Number(a.agent) - Number(b.agent)));
    t.expect(edges).toEqual(REF.edges);

    const s = await ix.ChainStats.getOrThrow("stats");
    t.expect({
      agentsMinted: s.agents, transfers: s.transfers, sharedWallets: s.sharedWallets,
      agentsOnSharedWallets: s.agentsOnSharedWallets, feedbacks: s.feedbacks, revoked: s.revoked, absValueGe1e38: s.outOfRange,
    }).toEqual((({ couples: _c, ...rest }) => rest)(REF.counts));
    // Self-ratings: the indexer evaluates controllers at each feedback's block, the scan at the final block.
    // They coincide on Monad (78 feedbacks of #8317 by its own agentWallet, no transfer in between); checked explicitly.
    const self = (await ix.Feedback.getAll()).filter((f) => f.clientWasController !== undefined);
    t.expect(self.length).toBe(78);
    t.expect(new Set(self.map((f) => `${f.agent_id}:${f.clientWasController}`))).toEqual(new Set(["8317:agentWallet"]));
    t.expect(s.selfRatings).toBe(78);

    const couples = new Set((await ix.Feedback.getAll()).map((f) => `${f.client}-${f.agent_id}`));
    t.expect(couples.size).toBe(REF.counts.couples);
  }, 900_000);
});

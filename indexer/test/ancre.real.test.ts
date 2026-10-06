// The certificate handler on REAL Monad state: the registry history is processed up to the vectors' identity block
// (HyperSync), then the normative certificates (solver/vectors, format ancre-cert-v1, accepted on chain by the contract
// in the differential test) are submitted as simulated AnchoredReputation events carrying their real calldata.
// Honest vectors must be AUDITED clean with the expected graph root; violation vectors must be flagged.
// Slow (real history): runs with `pnpm test:parity`.
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { existsSync, readFileSync } from "node:fs";
import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import abi from "../abis/AnchoredReputation.json" with { type: "json" };

const LOCAL = new URL("./vectors/", import.meta.url); // standalone repo; ../../solver/vectors in the monorepo
const DIR = existsSync(LOCAL) ? LOCAL : new URL("../../solver/vectors/", import.meta.url);
const BLOCK = 108_835_675;
const load = (f: string) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));

function items(v: any, block: number) {
  const setId = keccak256(toHex(v.label ?? v.format + JSON.stringify(v.calldata.rows).slice(0, 40))); // one set per vector
  const s = v.set;
  const policy = { ...s.policy, theta: BigInt(s.policy.theta), maxAge: BigInt(s.policy.maxAge), minRefresh: BigInt(s.policy.minRefresh),
    slackRefresh: BigInt(s.policy.slackRefresh), eLowMax: BigInt(s.policy.eLowMax) };
  const registerInput = encodeFunctionData({ abi, functionName: "registerAnchorSet", args: [{
    anchors: s.anchors, lambdas: s.lambdas.map(BigInt), alphaN: s.alphaN, alphaD: s.alphaD, tagSchemaHash: s.tagSchemaHash,
    tags: s.tags.map((t: any) => ({ ...t, min: BigInt(t.min), neutral: BigInt(t.neutral), max: BigInt(t.max) })), policy }] });
  const input = encodeFunctionData({ abi, functionName: "submitCertificate",
    args: [setId, v.nCert, 10n ** 18n, v.calldata.newNodes, v.calldata.vectors, v.calldata.rows] });
  const k = s.anchors.length;
  const added = (v.calldata.newNodes.length - 2) / 2 / 5; // agent entries only in these vectors (0x01 ‖ u32)
  const blk = { number: block };
  return { setId, items: [
    { contract: "AnchoredReputation", event: "AnchorSetRegistered", block: blk, transaction: { input: registerInput, hash: setId },
      params: { setId, anchors: s.anchors, lambdas: s.lambdas.map(BigInt), alphaN: BigInt(s.alphaN), alphaD: BigInt(s.alphaD) } },
    { contract: "AnchoredReputation", event: "NodesAdded", block: blk, transaction: { input },
      params: { setId, fromIndex: BigInt(k), count: BigInt(added) } },
    { contract: "AnchoredReputation", event: "CertificateSubmitted", block: blk,
      transaction: { input, hash: setId, from: "0x00000000000000000000000000000000000000c0" },
      params: { setId, certBlock: BigInt(BLOCK), eEff: BigInt(v.expected.eEff ?? 0), graphRoot: v.expected.graphRoot ?? ("0x" + "00".repeat(32)),
        vectorRoot: v.expected.vectorRoot ?? ("0x" + "00".repeat(32)), versionHash: "0x" + "00".repeat(32),
        nCert: BigInt(v.nCert), numRows: BigInt(v.rows.length), registryVerified: true } },
  ] };
}

describe.runIf(process.env.PARITY === "1" && existsSync(DIR))("certificate handler on real Monad state", () => {
  it("honest vectors: AUDITED clean, root matches; violations: flagged", async (t) => {
    const ix = createTestIndexer();
    await ix.process({ chains: { 143: { startBlock: 52_952_790, endBlock: BLOCK } } });
    const files = ["mainnet_slash_anchor.json", "mainnet_honest_d20.json", "mainnet_scanner_preD15.json", "mainnet_em_d44.json",
      "violations/fabricated.json", "violations/inflated.json", "violations/omitted_negative.json", "violations/dilution.json"];
    const sets: Record<string, string> = {};
    let block = BLOCK + 1;
    for (const f of files) {
      const v = load(f);
      t.expect(v.identityBlock, f).toBe(BLOCK);
      const { setId, items: its } = items({ ...v, label: f }, block++);
      sets[f] = setId;
      await ix.process({ chains: { 143: { simulate: its as never } } as never });
    }
    const certs = await ix.Certificate.getAll();
    const bySet = (f: string) => certs.find((c) => c.set_id === sets[f])!;
    const kinds = async (f: string) => (await ix.Discrepancy.getWhere({ set_id: { _eq: sets[f]! } })).map((d) => [d.kind, d.agentId]);
    for (const f of files.slice(0, 4)) {
      const c = bySet(f);
      t.expect([c.status, c.discrepancyCount, c.graphRootMatches], f).toEqual(["AUDITED", 0, true]);
      t.expect((await ix.SetHealth.getOrThrow(sets[f]!)).status, f).toBe("CLEAN");
    }
    t.expect(await kinds("violations/fabricated.json")).toEqual([["FABRICATED", "4"]]);
    t.expect(await kinds("violations/inflated.json")).toEqual([["INFLATED", "4"]]);
    t.expect(await kinds("violations/omitted_negative.json")).toEqual([["OMITTED_NEG", "4"], ["OMITTED_NEG", "4"]]);
    t.expect(await kinds("violations/dilution.json")).toEqual([["INFLATED", "2"]]);
  }, 900_000);
});

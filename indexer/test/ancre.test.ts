// Unit tests on simulated events: the AnchoredReputation handlers (set registration, node table, certificate audit).
// A tiny registry is simulated on the testnet chain, then real-shaped calldata (encodeFunctionData on the contract ABI)
// is attached to the ANCRE events, as a direct EOA call would carry it.
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import abi from "../abis/AnchoredReputation.json" with { type: "json" };
import { decodeRows, graphRoot } from "../src/lib/certificate.js";

const CHAIN = 10143;
const ZERO: Hex = "0x0000000000000000000000000000000000000000";
const A: Hex = "0x00000000000000000000000000000000000000aa"; // anchors, strictly increasing
const B: Hex = "0x00000000000000000000000000000000000000bb";
const O1: Hex = "0x1111111111111111111111111111111111111111";
const W1: Hex = "0x2222222222222222222222222222222222222222";
const O2: Hex = "0x3333333333333333333333333333333333333333";
const SUBMITTER: Hex = "0x4444444444444444444444444444444444444444";
const SET_ID = keccak256(toHex("demo-set"));
const E18 = 10n ** 18n;

const mint = (tokenId: bigint, to: Hex) => ({ contract: "IdentityRegistry" as const, event: "Transfer" as const, params: { from: ZERO, to, tokenId } });
const setWallet = (agentId: bigint, wallet: Hex) => ({ contract: "IdentityRegistry" as const, event: "MetadataSet" as const,
  params: { agentId, indexedMetadataKey: "", metadataKey: "agentWallet", metadataValue: wallet } });
const fb = (agentId: bigint, client: Hex, feedbackIndex: bigint, value: bigint, tag1: string) => ({
  contract: "ReputationRegistry" as const, event: "NewFeedback" as const,
  params: { agentId, clientAddress: client, feedbackIndex, value, valueDecimals: 0n, indexedTag1: "", tag1, tag2: "",
    endpoint: "", feedbackURI: "", feedbackHash: ("0x" + "00".repeat(32)) as Hex } });

// ---- calldata, as the certifier would send it (contracts/ENCODING.md)
const be = (v: number, n: number) => v.toString(16).padStart(2 * n, "0");
const i16 = (w: number) => be(w < 0 ? w + 0x10000 : w, 2);
type Row = { u: number; src?: Hex; edges: [dst: number, w: number, fi: number][] };
function encodeRows(rows: Row[]): Hex { // W = 2
  let h = be(2, 1) + be(rows.length, 4);
  for (const r of rows) {
    h += be(r.u, 2) + be((r.src ? 0x8000 : 0) | r.edges.length, 2) + (r.src ? r.src.slice(2) : "");
    for (const [dst, w, fi] of r.edges) h += be(dst, 2) + i16(w) + be(fi, 4);
  }
  return ("0x" + h) as Hex;
}
const agentNodes = (...ids: number[]) => ("0x" + ids.map((id) => "01" + be(id, 4)).join("")) as Hex;

const policy = { theta: E18 / 1000n, rhoN: 1, rhoD: 2, minAnchors: 2, vetoQuorum: 1, vetoMax: -1, maxAge: 288000n,
  minRefresh: 288000n, slackRefresh: 0n, eLowMax: E18 / 100n, strictTransfer: true, registryVerified: true,
  ownerFallback: false, submitters: [] as Hex[] };
const registerInput = encodeFunctionData({ abi, functionName: "registerAnchorSet", args: [{
  anchors: [A, B], lambdas: [E18 / 2n, E18 / 2n], alphaN: 1, alphaD: 3, tagSchemaHash: ("0x" + "00".repeat(32)) as Hex,
  tags: [{ tag: "vouch", min: 0n, neutral: 0n, max: 100n * E18, kind: 0 }], policy }] });
const certInput = (rows: Row[]) => encodeFunctionData({ abi, functionName: "submitCertificate",
  args: [SET_ID, 4, E18, agentNodes(1, 2), "0x", encodeRows(rows)] });

// nodes: 0 = A, 1 = B, 2 = agent #1 (wallet W1), 3 = agent #2
const HONEST: Row[] = [
  { u: 0, edges: [[2, 10_000, 1]] },               // A vouches #1 (100)
  { u: 1, edges: [[2, 10_000, 1]] },               // B vouches #1 (100)
  { u: 2, src: W1, edges: [[3, 5_000, 1]] },       // #1 (through its wallet W1) vouches #2 (50)
];

function world() {
  return [
    mint(1n, O1), setWallet(1n, W1), mint(2n, O2),
    fb(1n, A, 1n, 100n, "vouch"), fb(1n, B, 1n, 100n, "vouch"), fb(2n, W1, 1n, 50n, "vouch"),
    { contract: "AnchoredReputation" as const, event: "AnchorSetRegistered" as const,
      transaction: { input: registerInput, hash: ("0x" + "01".repeat(32)) as Hex },
      params: { setId: SET_ID, anchors: [A, B], lambdas: [E18 / 2n, E18 / 2n], alphaN: 1n, alphaD: 3n } },
  ];
}
const submit = (rows: Row[], input: Hex = certInput(rows), tx = "02") => [
  { contract: "AnchoredReputation" as const, event: "NodesAdded" as const, transaction: { input },
    params: { setId: SET_ID, fromIndex: 2n, count: 2n } },
  { contract: "AnchoredReputation" as const, event: "CertificateSubmitted" as const,
    transaction: { input, from: SUBMITTER, hash: ("0x" + tx.repeat(32)) as Hex },
    params: { setId: SET_ID, certBlock: 1n, eEff: 15n, graphRoot: ("0x" + "00".repeat(32)) as Hex,
      vectorRoot: ("0x" + "00".repeat(32)) as Hex, versionHash: ("0x" + "00".repeat(32)) as Hex,
      nCert: 4n, numRows: BigInt(rows.length), registryVerified: true } },
];

async function run(items: unknown[]) {
  const ix = createTestIndexer();
  await ix.process({ chains: { [CHAIN]: { simulate: items as never } } as never });
  return ix;
}

describe("AnchoredReputation handlers", () => {
  it("registers the set from calldata and rebuilds the node table", async (t) => {
    const ix = await run([...world(), ...submit(HONEST)]);
    const set = await ix.AnchorSet.getOrThrow(SET_ID);
    t.expect(set.decodable).toBe(true);
    t.expect(set.anchors).toEqual([A, B]);
    t.expect(JSON.parse(set.tagsJson!)).toEqual([{ tag: "vouch", min: "0", neutral: "0", max: (100n * E18).toString(), kind: 0 }]);
    t.expect(set.registryVerified).toBe(true);
    t.expect(set.nodeCount).toBe(4);
    const nodes = (await ix.SetNode.getAll()).sort((a, b) => a.index - b.index).map((n) => [n.index, n.kind, n.agentId ?? n.address]);
    t.expect(nodes).toEqual([[0, "anchor", A], [1, "anchor", B], [2, "agent", "1"], [3, "agent", "2"]]);
  });

  it("an honest certificate is AUDITED with 0 discrepancy and the set is CLEAN", async (t) => {
    const ix = await run([...world(), ...submit(HONEST)]);
    const [cert] = await ix.Certificate.getAll();
    t.expect(cert!.status).toBe("AUDITED");
    t.expect([cert!.rowsChecked, cert!.edgesChecked, cert!.discrepancyCount]).toEqual([3, 3, 0]);
    t.expect(cert!.submitter).toBe(SUBMITTER);
    t.expect(cert!.graphRootMatches).toBe(false); // the simulated event carries a dummy root: the mismatch is reported
    const root = graphRoot(decodeRows(encodeRows(HONEST)).rows.map((r) => r.leaf));
    const items = submit(HONEST);
    (items[1]!.params as { graphRoot: Hex }).graphRoot = root;
    const ok = await run([...world(), ...items]);
    t.expect((await ok.Certificate.getAll())[0]!.graphRootMatches).toBe(true);
    const h = await ix.SetHealth.getOrThrow(SET_ID);
    t.expect([h.status, h.certificates, h.openDiscrepancies]).toEqual(["CLEAN", 1, 0]);
  });

  it("an inflated edge is reported with its on-chain remedy and the set flagged", async (t) => {
    const inflated: Row[] = [HONEST[0]!, HONEST[1]!, { u: 2, src: W1, edges: [[3, 10_000, 1]] }];
    const ix = await run([...world(), ...submit(inflated)]);
    const ds = (await ix.Discrepancy.getAll()).map((d) => [d.kind, d.agentId, d.wCommitted, d.wRegistry, d.proof]);
    t.expect(ds).toEqual([["INFLATED", "2", 10_000, 5_000, "proveEdge"]]);
    t.expect((await ix.SetHealth.getOrThrow(SET_ID)).status).toBe("DISCREPANCY");
  });

  it("a relayed submission (wrapper calldata) is UNDECODABLE, never reported clean", async (t) => {
    const wrapper = ("0xdeadbeef" + certInput(HONEST).slice(2)) as Hex;
    const ix = await run([...world(), ...submit(HONEST, wrapper)]);
    const [cert] = await ix.Certificate.getAll();
    t.expect(cert!.status).toBe("UNDECODABLE");
    t.expect((await ix.SetHealth.getOrThrow(SET_ID)).status).toBe("UNAUDITED");
    t.expect((await ix.AnchorSet.getOrThrow(SET_ID)).decodable).toBe(false); // its NodesAdded was undecodable too
  });
});

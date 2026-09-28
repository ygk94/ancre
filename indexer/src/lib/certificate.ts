// Certificate calldata decoding (contracts/ENCODING.md, format ancre-cert-v0, aligned with solver/FORMAT.md).
// Pure functions: no network, safe to run in both handler phases.
import { keccak256, type Hex } from "viem";

export type CertEdge = { dst: number; w: number; feedbackIndex: number };
export type CertRow = { u: number; wallet?: string; edges: CertEdge[]; leaf: Hex };
export type DecodedRows = { W: 2 | 4; rows: CertRow[] };
export type NewNode = { kind: "agent"; agentId: bigint } | { kind: "address"; address: string };

export class EncodingError extends Error {}

const hexToBytes = (h: string): Uint8Array => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length % 2) throw new EncodingError("odd hex length");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(2 * i, 2), 16);
  return out;
};
const toHex = (b: Uint8Array): Hex => ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
const uint = (b: Uint8Array, o: number, n: number) => {
  if (o + n > b.length) throw new EncodingError(`truncated at ${o}`);
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i]!;
  return v;
};

/**
 * rows = W:u8 ‖ numRows:u32 ‖ row*;  row = u:W ‖ hdr:u16 ‖ [wallet:20] ‖ (dst:W ‖ w:int16 ‖ feedbackIndex:u32)*nE
 * hdr = nE | 0x8000 when a wallet is present. Leaf = the row bytes from u to its last edge.
 * Structural checks mirror the contract (strictly increasing u and dst, dst != u, w != 0, |w| <= 10 000, exact end).
 */
export function decodeRows(hex: string, nCert?: number): DecodedRows {
  const b = hexToBytes(hex);
  const W = uint(b, 0, 1);
  if (W !== 2 && W !== 4) throw new EncodingError(`bad W ${W}`);
  const numRows = uint(b, 1, 4);
  let o = 5;
  const rows: CertRow[] = [];
  let prevU = -1;
  for (let r = 0; r < numRows; r++) {
    const start = o;
    const u = uint(b, o, W); o += W;
    const hdr = uint(b, o, 2); o += 2;
    const nE = hdr & 0x7fff;
    if (nE > 256) throw new EncodingError(`row ${r}: nE ${nE} > ROW_MAX`);
    if (u <= prevU || (nCert !== undefined && u >= nCert)) throw new EncodingError(`row ${r}: bad u ${u}`);
    prevU = u;
    let wallet: string | undefined;
    if (hdr & 0x8000) { wallet = toHex(b.subarray(o, o + 20)).toLowerCase(); o += 20; }
    const edges: CertEdge[] = [];
    let prevDst = -1;
    for (let e = 0; e < nE; e++) {
      const dst = uint(b, o, W); o += W;
      let w = uint(b, o, 2); o += 2;
      if (w >= 0x8000) w -= 0x10000;
      const feedbackIndex = uint(b, o, 4); o += 4;
      if (dst <= prevDst || dst === u || (nCert !== undefined && dst >= nCert)) throw new EncodingError(`row ${r}: bad dst ${dst}`);
      if (w === 0 || Math.abs(w) > 10_000) throw new EncodingError(`row ${r}: bad w ${w}`);
      prevDst = dst;
      edges.push({ dst, w, feedbackIndex });
    }
    rows.push({ u, wallet, edges, leaf: keccak256(b.subarray(start, o)) });
  }
  if (o !== b.length) throw new EncodingError(`trailing bytes: ${b.length - o}`);
  return { W: W as 2 | 4, rows };
}

/** Pairwise keccak reduction; an odd element moves up unchanged; 0x0 when there is no row (_merkleRoot). */
export function graphRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return ("0x" + "00".repeat(32)) as Hex;
  let level = leaves.slice();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) next.push(keccak256(("0x" + level[i]!.slice(2) + level[i + 1]!.slice(2)) as Hex));
    if (level.length % 2) next.push(level[level.length - 1]!);
    level = next;
  }
  return level[0]!;
}

/** newNodes = (0x01 ‖ agentId:u32 | 0x02 ‖ address:20)* */
export function decodeNewNodes(hex: string): NewNode[] {
  const b = hexToBytes(hex);
  const out: NewNode[] = [];
  let o = 0;
  while (o < b.length) {
    const kind = b[o++];
    if (kind === 1) { out.push({ kind: "agent", agentId: BigInt(uint(b, o, 4)) }); o += 4; }
    else if (kind === 2) {
      if (o + 20 > b.length) throw new EncodingError("truncated address node");
      out.push({ kind: "address", address: toHex(b.subarray(o, o + 20)).toLowerCase() }); o += 20;
    } else throw new EncodingError(`bad node kind ${kind}`);
  }
  return out;
}

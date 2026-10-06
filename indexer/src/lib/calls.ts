// Decoding of the ANCRE contract's calls from the transaction input (P2 gate, chantier 03: a handler reads
// `transaction.input`). A direct call is decoded as is. A call made THROUGH a contract (Safe, Multicall3, a 4337 or
// EIP-7702 account) carries the inner call as a contiguous ABI `bytes` inside the wrapper's input: `nestedCalls` scans
// the input for the function selector and decodes every occurrence (review 06/10, OUTERCALL). A nested candidate is
// only trusted when it provably is the committed data: the set params hash to the event's setId (registerAnchorSet),
// the rows hash to the event's graphRoot (submitCertificate). Monad serves no call traces (AM-03.3), hence the scan.
// Pure functions: safe in both handler phases.
import { decodeFunctionData, encodeAbiParameters, keccak256, toFunctionSelector, type Hex } from "viem";
import abi from "../../abis/AnchoredReputation.json" with { type: "json" };
import { decodeNewNodes, type NewNode } from "./certificate.js";

const ABI = abi as readonly unknown[] as Parameters<typeof decodeFunctionData>[0]["abi"];

export type SetTag = { tag: string; min: string; neutral: string; max: string; kind: number };
export type SetCall = {
  setId: Hex;                        // computeSetId(p), recomputed from the decoded params
  anchors: string[]; lambdas: string[]; alphaN: number; alphaD: number; tags: SetTag[];
  policy: Record<string, unknown> & { ownerFallback: boolean; registryVerified: boolean };
};
export type CertCall = { setId: Hex; nCert: number; newNodes: Hex; rows: Hex };

function decode(input: string | undefined, name: string): readonly unknown[] | undefined {
  if (!input || input.length < 10) return undefined;
  try {
    const d = decodeFunctionData({ abi: ABI, data: input as Hex });
    return d.functionName === name ? (d.args as readonly unknown[]) : undefined;
  } catch {
    return undefined; // another selector (wrapper) or malformed
  }
}

const MAX_NESTED = 16; // candidates tried per transaction (a wrapper rarely holds more than a few inner calls)
const SELECTOR = (name: string) => toFunctionSelector(
  (ABI as readonly { type: string; name?: string }[]).find((x) => x.type === "function" && x.name === name) as never).slice(2);

/** Every decodable occurrence of `name`'s calldata in the input, the direct call first. */
function nestedCalls(input: string | undefined, name: string): (readonly unknown[])[] {
  if (!input || input.length < 10) return [];
  const hex = input.slice(2).toLowerCase();
  const sel = SELECTOR(name);
  const out: (readonly unknown[])[] = [];
  let tries = 0; // bounded: a crafted input may repeat the selector thousands of times
  for (let i = hex.indexOf(sel); i >= 0 && out.length < MAX_NESTED && tries < 4 * MAX_NESTED; i = hex.indexOf(sel, i + 1)) {
    if (i % 2) continue; // byte-aligned only
    tries++;
    const args = decode("0x" + hex.slice(i), name);
    if (args) out.push(args);
  }
  return out;
}

const str = (x: unknown) => (typeof x === "bigint" ? x.toString() : x);
const json = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map(str) : str(v)]));

/** registerAnchorSet(SetParams) -> anchors, tags (bounds in WAD), policy. Direct call only. */
export function decodeSetCall(input: string | undefined): SetCall | undefined {
  const args = decode(input, "registerAnchorSet");
  return args ? setCallOf(args) : undefined;
}

/** The registerAnchorSet call (direct or nested) whose params hash to `setId`. */
export function findSetCall(input: string | undefined, setId: string): SetCall | undefined {
  for (const args of nestedCalls(input, "registerAnchorSet")) {
    const c = setCallOf(args);
    if (c.setId.toLowerCase() === setId.toLowerCase()) return c;
  }
  return undefined;
}

/** submitCertificate calls (direct or nested) naming `setId`: the caller keeps the one whose rows hash to graphRoot. */
export function findCertCalls(input: string | undefined, setId: string): CertCall[] {
  return nestedCalls(input, "submitCertificate").map(certCallOf).filter((c) => c.setId.toLowerCase() === setId.toLowerCase());
}

function setCallOf(args: readonly unknown[]): SetCall {
  const p = args[0] as {
    anchors: readonly string[]; lambdas: readonly bigint[]; alphaN: number; alphaD: number;
    tags: readonly { tag: string; min: bigint; neutral: bigint; max: bigint; kind: number }[];
    policy: Record<string, unknown> & { ownerFallback: boolean; registryVerified: boolean };
  };
  return {
    setId: computeSetId(p),
    anchors: p.anchors.map((a) => a.toLowerCase()),
    lambdas: p.lambdas.map(String),
    alphaN: Number(p.alphaN), alphaD: Number(p.alphaD),
    tags: p.tags.map((t) => ({ tag: t.tag, min: t.min.toString(), neutral: t.neutral.toString(), max: t.max.toString(), kind: Number(t.kind) })),
    policy: json(p.policy) as SetCall["policy"],
  };
}

/** The node entries appended by a transaction: addNodes(setId, entries) or submitCertificate(..., newNodes, ...). */
export function decodeAppendedNodes(input: string | undefined, setId: string): NewNode[] | undefined {
  const add = decode(input, "addNodes");
  if (add) return (add[0] as string).toLowerCase() === setId.toLowerCase() ? decodeNewNodes(add[1] as string) : undefined;
  const c = decodeCertCall(input);
  if (c) return c.setId.toLowerCase() === setId.toLowerCase() ? decodeNewNodes(c.newNodes) : undefined;
  return undefined;
}

/** submitCertificate(setId, nCert, eMax, newNodes, vectors, rows). */
export function decodeCertCall(input: string | undefined): CertCall | undefined {
  const args = decode(input, "submitCertificate");
  return args ? certCallOf(args) : undefined;
}
const certCallOf = (args: readonly unknown[]): CertCall =>
  ({ setId: args[0] as Hex, nCert: Number(args[1]), newNodes: args[3] as Hex, rows: args[5] as Hex });

// AnchoredReputation.computeSetId: keccak256(abi.encode(anchors, lambdas, alphaN, alphaD, tagSchemaHash, tags, policy)).
// The handler compares it with the event's setId, so that calldata from a wrapper sharing the selector is never trusted.
const SET_PARAMS = (ABI as readonly { type: string; name?: string; inputs?: { components?: unknown[] }[] }[])
  .find((x) => x.type === "function" && x.name === "registerAnchorSet")!.inputs![0]!.components as
  readonly { name: string; type: string; components?: unknown[] }[];
function computeSetId(p: Record<string, unknown>): Hex {
  return keccak256(encodeAbiParameters(SET_PARAMS as never, SET_PARAMS.map((c) => p[c.name]) as never));
}

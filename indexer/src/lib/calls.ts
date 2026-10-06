// Decoding of the ANCRE contract's calls from the transaction input (P2 gate, chantier 03: a handler reads
// `transaction.input`). Only DIRECT calls are decodable: through a relayer, a multicall or a Safe, the input is the
// wrapper's, and the caller gets `undefined` (UNDECODABLE). Pure functions: safe in both handler phases.
import { decodeFunctionData, type Hex } from "viem";
import abi from "../../abis/AnchoredReputation.json" with { type: "json" };
import { decodeNewNodes, type NewNode } from "./certificate.js";

const ABI = abi as readonly unknown[] as Parameters<typeof decodeFunctionData>[0]["abi"];

export type SetTag = { tag: string; min: string; neutral: string; max: string; kind: number };
export type SetCall = {
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

const str = (x: unknown) => (typeof x === "bigint" ? x.toString() : x);
const json = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map(str) : str(v)]));

/** registerAnchorSet(SetParams) -> anchors, tags (bounds in WAD), policy. */
export function decodeSetCall(input: string | undefined): SetCall | undefined {
  const args = decode(input, "registerAnchorSet");
  if (!args) return undefined;
  const p = args[0] as {
    anchors: readonly string[]; lambdas: readonly bigint[]; alphaN: number; alphaD: number;
    tags: readonly { tag: string; min: bigint; neutral: bigint; max: bigint; kind: number }[];
    policy: Record<string, unknown> & { ownerFallback: boolean; registryVerified: boolean };
  };
  return {
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
  if (!args) return undefined;
  return { setId: args[0] as Hex, nCert: Number(args[1]), newNodes: args[3] as Hex, rows: args[5] as Hex };
}

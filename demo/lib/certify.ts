// Bridge to the chantier 04 certifier through demo/certify.py: the scenes read the registry of the chain they
// run on (the Envio indexer cannot see a fork), write the data file, and let the certifier do the rest.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Abi, type Address, type Hex, keccak256, toHex } from "viem";
import { identityAbi, reputationAbi } from "./abi.ts";
import type { Chain } from "./chain.ts";
import { DEMO, OUT, PYTHON, SET, NET } from "./config.ts";
import type { AgentRec } from "./state.ts";

const run = promisify(execFile);

const LAMBDAS = [333333333333333334n, 333333333333333333n, 333333333333333333n]; // sum = 1 WAD exactly

/** SetConfig of solver/certifier.py for the demo set (D39 policy, D27 attested submitter = the operator). */
export function setConfig(anchors: Address[], operator: Address) {
  return {
    name: SET.name, anchors: anchors.map((a) => a.toLowerCase()), lambdas: LAMBDAS,
    alphaN: SET.alphaN, alphaD: SET.alphaD, filter_tags: SET.filterTags, schema_path: SET.schemaPath,
    min_anchors: SET.minAnchors, max_age: SET.maxAge, min_refresh: SET.minRefresh, slack_refresh: SET.slackRefresh,
    refresh_lead: 20_000, owner: operator.toLowerCase(), owner_fallback: SET.ownerFallback,
    tag_schema_hash: keccak256(toHex(readFileSync(SET.schemaPath, "utf8"))),
    theta: SET.theta, rho_n: SET.rhoN, rho_d: SET.rhoD, veto_quorum: SET.vetoQuorum, veto_max: SET.vetoMax,
    e_low_max: SET.eLowMax, strict_transfer: SET.strictTransfer, registry_verified: SET.registryVerified,
    submitters: [operator.toLowerCase()],
  };
}
export type SetConfig = ReturnType<typeof setConfig>;

function dir(mode: string) {
  const d = join(OUT, mode);
  mkdirSync(d, { recursive: true });
  return d;
}

/** JSON with bigints written as plain numbers (Python's json reads arbitrary-size integers exactly). */
const pyJson = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? `@big:${x}` : x), 2).replace(/"@big:(-?\d+)"/g, "$1");

function writeConfig(mode: string, cfg: SetConfig) {
  const p = join(dir(mode), "set-config.json");
  writeFileSync(p, pyJson(cfg));
  return p;
}

export async function printSet(mode: string, cfg: SetConfig) {
  const p = writeConfig(mode, cfg);
  const { stdout } = await run(PYTHON, [join(DEMO, "certify.py"), "--config", p, "--print-set"], { maxBuffer: 1 << 24 });
  return JSON.parse(stdout) as { setId: Hex; set: Record<string, unknown> & { anchors: string[]; lambdas: string[]; tags: { tag: string; min: string; neutral: string; max: string; kind: number }[]; policy: Record<string, unknown> } };
}

/** Registry data of the demo agents and the set's on-chain node table, all read at one block, in the certifier's
 * input format. Reads run in parallel per agent (3 calls), agents one after another (the testnet RPC allows 50 rps). */
export async function registryData(chain: Chain, ancre: { address: Address; abi: Abi }, setId: Hex, agents: AgentRec[]) {
  const blockNumber = await chain.pub.getBlockNumber();
  const feedbacks: unknown[] = [];
  const owner: Record<string, string> = {};
  const wallet: Record<string, string> = {};
  for (const a of agents) {
    const id = BigInt(a.agentId);
    const [[clients, idx, values, decs, t1, t2, rev], o, w] = await Promise.all([
      chain.pub.readContract({ address: NET.reputation, abi: reputationAbi, functionName: "readAllFeedback", args: [id, [], "", "", true], blockNumber }),
      chain.pub.readContract({ address: NET.identity, abi: identityAbi, functionName: "ownerOf", args: [id], blockNumber }),
      chain.pub.readContract({ address: NET.identity, abi: identityAbi, functionName: "getAgentWallet", args: [id], blockNumber }),
    ]);
    clients.forEach((c, i) => feedbacks.push({ a: a.agentId, c: c.toLowerCase(), i: Number(idx[i]), v: values[i].toString(),
      d: decs[i], t1: t1[i], t2: t2[i], r: rev[i] }));
    owner[a.agentId] = o.toLowerCase();
    wallet[a.agentId] = w.toLowerCase();
  }
  // the append-only node table (keys kind << 248 | id), so that certify.py spawns no `cast call` per node
  const n = Number(await chain.pub.readContract({ ...ancre, functionName: "nodeCount", args: [setId], blockNumber }) as bigint);
  const table = await Promise.all(Array.from({ length: n }, (_, i) =>
    chain.pub.readContract({ ...ancre, functionName: "nodeKeyAt", args: [setId, BigInt(i)], blockNumber }) as Promise<Hex>));
  const block = Number(blockNumber);
  return { block, feedbacks, identity: { block, owner, wallet }, table };
}

export type CertResult = Record<string, unknown> & { action: string; journal?: Record<string, unknown>[] };

export async function certify(opts: {
  chain: Chain; mode: string; ancre: Address; cfg: SetConfig; data: unknown; signer: string;
  passwordEnv?: Record<string, string>; reason: string; fabricate?: unknown;
}): Promise<CertResult> {
  const d = dir(opts.mode);
  const dataPath = join(d, "registry-data.json");
  writeFileSync(dataPath, JSON.stringify(opts.data));
  const args = [join(DEMO, "certify.py"), "--rpc", opts.chain.rpc, "--ancre", opts.ancre, "--config", writeConfig(opts.mode, opts.cfg),
    "--data", dataPath, "--signer", opts.signer, "--state", join(d, "certifier-state.json"),
    "--journal", join(d, "certifier.jsonl"), "--reason", opts.reason];
  if (opts.fabricate) args.push("--fabricate", JSON.stringify(opts.fabricate));
  try {
    const { stdout } = await run(PYTHON, args, { maxBuffer: 1 << 26, env: { ...process.env, ...(opts.passwordEnv ?? {}) } });
    return JSON.parse(stdout.trim().split("\n").pop()!) as CertResult;
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string; message: string };
    const line = x.stdout?.trim().split("\n").pop();
    if (line?.startsWith("{")) return JSON.parse(line) as CertResult;
    throw new Error(`certify.py failed: ${(x.stderr || x.message).slice(-1500)}`);
  }
}

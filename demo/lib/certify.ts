// Bridge to the chantier 04 certifier through demo/certify.py: the scenes read the registry of the chain they
// run on (the Envio indexer cannot see a fork), write the data file, and let the certifier do the rest.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Address, keccak256, toHex } from "viem";
import { identityAbi, reputationAbi } from "./abi.ts";
import type { Chain } from "./chain.ts";
import { DEMO, OUT, PYTHON, SET } from "./config.ts";
import type { AgentRec } from "./state.ts";

const run = promisify(execFile);

const LAMBDAS = ["333333333333333334", "333333333333333333", "333333333333333333"]; // sum = 1 WAD exactly

/** SetConfig of solver/certifier.py for the demo set (D39 policy, D27 attested submitter = the operator). */
export function setConfig(anchors: Address[], operator: Address) {
  const schemaHash = keccak256(toHex(readFileSync(SET.schemaPath, "utf8")));
  return {
    name: SET.name, anchors: anchors.map((a) => a.toLowerCase()), lambdas: LAMBDAS,
    alphaN: SET.alphaN, alphaD: SET.alphaD, filter_tags: SET.filterTags, schema_path: SET.schemaPath,
    min_anchors: SET.minAnchors, max_age: SET.maxAge, min_refresh: SET.minRefresh, slack_refresh: SET.slackRefresh,
    refresh_lead: 20_000, owner: operator.toLowerCase(), owner_fallback: SET.ownerFallback, tag_schema_hash: schemaHash,
    theta: SET.theta.toString(), rho_n: SET.rhoN, rho_d: SET.rhoD, veto_quorum: SET.vetoQuorum, veto_max: SET.vetoMax,
    e_low_max: SET.eLowMax.toString(), strict_transfer: SET.strictTransfer, registry_verified: SET.registryVerified,
    submitters: [operator.toLowerCase()],
  };
}

function dir(mode: string) {
  const d = join(OUT, mode);
  mkdirSync(d, { recursive: true });
  return d;
}

/** Writes the config with big integers as JSON numbers (Python's json reads them exactly). */
function writeConfig(mode: string, cfg: ReturnType<typeof setConfig>) {
  const p = join(dir(mode), "set-config.json");
  const body = JSON.stringify(cfg, null, 2)
    .replace(/"theta": "(\d+)"/, '"theta": $1').replace(/"e_low_max": "(\d+)"/, '"e_low_max": $1')
    .replace(/"lambdas": \[([^\]]*)\]/s, (_m, inner: string) => `"lambdas": [${inner.replace(/"/g, "")}]`);
  writeFileSync(p, body);
  return p;
}

export async function printSet(mode: string, cfg: ReturnType<typeof setConfig>) {
  const p = writeConfig(mode, cfg);
  const { stdout } = await run(PYTHON, [join(DEMO, "certify.py"), "--config", p, "--print-set"], { maxBuffer: 1 << 24 });
  return JSON.parse(stdout) as { setId: `0x${string}`; set: Record<string, unknown> & { anchors: string[]; lambdas: string[]; tags: { tag: string; min: string; neutral: string; max: string; kind: number }[]; policy: Record<string, unknown> } };
}

/** Registry data of the demo agents at the latest block, in the certifier's input format. */
export async function registryData(chain: Chain, identity: Address, reputation: Address, agents: AgentRec[]) {
  const block = Number(await chain.pub.getBlockNumber());
  const feedbacks: unknown[] = [];
  const owner: Record<string, string> = {};
  const wallet: Record<string, string> = {};
  for (const a of agents) {
    const id = BigInt(a.agentId);
    const [clients, idx, values, decs, t1, t2, rev] = await chain.pub.readContract({ address: reputation, abi: reputationAbi,
      functionName: "readAllFeedback", args: [id, [], "", "", true] });
    clients.forEach((c, i) => feedbacks.push({ a: a.agentId, c: c.toLowerCase(), i: Number(idx[i]), v: values[i].toString(),
      d: decs[i], t1: t1[i], t2: t2[i], r: rev[i] }));
    owner[a.agentId] = (await chain.pub.readContract({ address: identity, abi: identityAbi, functionName: "ownerOf", args: [id] })).toLowerCase();
    wallet[a.agentId] = (await chain.pub.readContract({ address: identity, abi: identityAbi, functionName: "getAgentWallet", args: [id] })).toLowerCase();
  }
  return { block, feedbacks, identity: { block, owner, wallet } };
}

export type CertResult = Record<string, unknown> & { action: string };

export async function certify(opts: {
  chain: Chain; mode: string; ancre: Address; cfg: ReturnType<typeof setConfig>; data: unknown; signer: string;
  passwordEnv?: Record<string, string>; reason: string; fabricate?: unknown;
}): Promise<CertResult> {
  const d = dir(opts.mode);
  const cfgPath = writeConfig(opts.mode, opts.cfg);
  const dataPath = join(d, "registry-data.json");
  writeFileSync(dataPath, JSON.stringify(opts.data));
  const args = [join(DEMO, "certify.py"), "--rpc", opts.chain.rpc, "--ancre", opts.ancre, "--config", cfgPath,
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

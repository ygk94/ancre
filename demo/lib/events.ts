// Event log of a run, format `ancre-demo-events-v1` (demo/EVENTS.md): run-<ts>.jsonl (append-only),
// run-<ts>.json and latest.json (rewritten atomically after every event).
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Abi, type Address, type Hex, keccak256, toHex, zeroHash } from "viem";
import { reputationAbi, STATUSES } from "./abi.ts";
import type { Chain, TxRecord } from "./chain.ts";
import { OUT, TESTNET } from "./config.ts";

export const FORMAT = "ancre-demo-events-v1";
const WAD = 10n ** 18n;

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const pct = (wad: bigint) => Number((wad * 1_000_000n) / 10n ** 16n) / 1_000_000; // WAD -> %, 6 decimals

export const SCENES = ["setup", "honest", "farm", "farm-pays-itself", "breaker", "anti-erasure", "fabricated-cert"] as const;

/** Mean of value/10^decimals with 6 truncated decimals, exact (bigint). */
export function naiveAverage(values: bigint[], decimals: number[]): string | null {
  if (values.length === 0) return null;
  let sum = 0n;
  values.forEach((v, i) => { sum += v * 10n ** BigInt(18 - decimals[i]); });
  const scaled = (sum * 1_000_000n) / (WAD * BigInt(values.length)); // truncated toward zero
  const neg = scaled < 0n;
  const a = neg ? -scaled : scaled;
  return `${neg ? "-" : ""}${a / 1_000_000n}.${(a % 1_000_000n).toString().padStart(6, "0")}`;
}

export type AgentSnapshot = {
  explorer: { feedbackCount: number; revokedCount: number; clientCount: number; naiveAverage: string | null };
  contract: Record<string, unknown>;
};

export class EventLog {
  runId: string;
  header: Record<string, unknown>;
  events: Record<string, unknown>[] = [];
  seq = 0;
  chain: Chain;
  tagNames = new Map<string, string>();
  timestamps = new Map<number, number>(); // block -> timestamp (3-4 Monad blocks share a second; events share blocks)
  ancre?: { address: Address; abi: Abi; setId: Hex; theta: bigint };

  constructor(chain: Chain, runId: string, header: Record<string, unknown>) {
    this.chain = chain;
    this.runId = runId;
    mkdirSync(OUT, { recursive: true });
    const p = this.path("json");
    if (existsSync(p)) {                                    // resumed run: keep the same id and append
      const prev = JSON.parse(readFileSync(p, "utf8"));
      this.header = { ...prev.header, ...header };
      this.events = prev.events;
      this.seq = this.events.length ? Number(this.events[this.events.length - 1].seq) : 0;
    } else {
      this.header = { type: "header", format: FORMAT, runId, ...header, startedAt: new Date().toISOString() };
      appendFileSync(this.path("jsonl"), json(this.header) + "\n");
    }
    this.flush();
  }

  static newRunId() {
    return "run-" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  }

  path(ext: "json" | "jsonl") {
    return join(OUT, `${this.runId}.${ext}`);
  }

  setHeader(patch: Record<string, unknown>) {
    Object.assign(this.header, patch);
    const tags = (this.header.set as { tags?: { tag: string }[] } | undefined)?.tags ?? [];
    for (const t of tags) this.tagNames.set(keccak256(toHex(t.tag)), t.tag);
    this.flush();
  }

  flush() {
    const p = this.path("json");
    writeFileSync(p + ".tmp", json({ header: this.header, events: this.events }));
    renameSync(p + ".tmp", p);
    copyFileSync(p, join(OUT, "latest.json.tmp"));
    renameSync(join(OUT, "latest.json.tmp"), join(OUT, "latest.json"));
  }

  /** Both columns of the screen for one agent, read at `block`. */
  async snapshot(agentId: bigint, block: bigint): Promise<AgentSnapshot> {
    const [[clients, , values, decs, , , revoked], x] = await Promise.all([
      this.chain.pub.readContract({ address: TESTNET.reputation, abi: reputationAbi, functionName: "readAllFeedback",
        args: [agentId, [], "", "", true], blockNumber: block }),
      this.ancre ? this.chain.pub.readContract({ address: this.ancre.address, abi: this.ancre.abi, functionName: "assess",
        args: [agentId, this.ancre.setId, true], blockNumber: block }) as Promise<Record<string, bigint | number | boolean | Hex>> : undefined,
    ]);
    const live = revoked.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
    const explorer = {
      feedbackCount: live.length,
      revokedCount: revoked.length - live.length,
      clientCount: new Set(live.map((i) => clients[i].toLowerCase())).size,
      naiveAverage: naiveAverage(live.map((i) => values[i]), live.map((i) => decs[i])),
    };
    let contract: Record<string, unknown> = { status: "NO_CERT", trusted: false };
    if (this.ancre && x) {
      const tt = x.triggerTag as Hex;
      const none = tt === zeroHash;
      contract = {
        status: STATUSES[Number(x.status)], trusted: x.trusted,
        trust: x.trust, trustRobust: x.trustRobust, trustLow: x.trustLow, trustLowPct: pct(x.trustLow as bigint),
        theta: this.ancre.theta, thetaPct: pct(this.ancre.theta),
        e: x.e, ePct: pct(x.e as bigint), eLow: x.eLow, distrust: x.distrust, distrustUp: x.distrustUp,
        vetoCount: Number(x.vetoCount), triggerTag: none ? null : tt, triggerTagName: none ? null : this.tagNames.get(tt) ?? null,
        certBlock: Number(x.certBlock),
      };
    }
    return { explorer, contract };
  }

  /** Write one event. `agentId` set => the `agent` block is read at the event's block (after its transaction). */
  async emit(e: {
    scene: number; step: string; kind: string; label: string; actor?: Address | null; agentId?: bigint | null;
    tx?: TxRecord | null; block?: number; data?: unknown; payer?: unknown; certificate?: unknown; latency?: unknown;
    attempt?: number;
  }) {
    let block = e.tx?.block ?? e.block;
    if (block === undefined) {
      const head = await this.chain.block();
      block = head.number;
      this.timestamps.set(block, head.timestamp);
    }
    if (!this.timestamps.has(block)) this.timestamps.set(block, await this.chain.blockAt(block));
    const blockTimestamp = this.timestamps.get(block)!;
    const agent = e.agentId != null ? await this.snapshot(e.agentId, BigInt(block)) : null;
    const now = Date.now();
    const ev = {
      type: "event", seq: ++this.seq, runId: this.runId, scene: e.scene, sceneName: SCENES[e.scene], step: e.step,
      attempt: e.attempt ?? 1, kind: e.kind, label: e.label, actor: e.actor ?? e.tx?.from ?? null,
      agentId: e.agentId != null ? e.agentId.toString() : null, setId: this.ancre?.setId ?? null,
      tx: e.tx ? { hash: e.tx.hash, fn: e.tx.fn, block: e.tx.block, status: e.tx.status, gasLimit: e.tx.gasLimit, gasUsed: e.tx.gasUsed } : null,
      block, blockTimestamp, wallTime: new Date(now).toISOString(), wallMs: now,
      data: e.data ?? null, agent, payer: e.payer ?? null, certificate: e.certificate ?? null, latency: e.latency ?? null,
    };
    this.events.push(ev);
    appendFileSync(this.path("jsonl"), json(ev) + "\n");
    this.flush();
    const a = agent ? ` | explorer n=${agent.explorer.feedbackCount} avg=${agent.explorer.naiveAverage} | ANCRE ${agent.contract.status} mass=${agent.contract.trustLowPct ?? "-"}% trusted=${agent.contract.trusted}` : "";
    console.log(`  [${e.step}] ${e.label}${a}`);
    return ev;
  }
}

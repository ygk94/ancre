import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Append-only journal of every exit of `pay` and `override` (D47, M1), one JSON object per line: refusals,
 * payments, unknown outcomes, aborted attempts (pay_aborted: RPC or HTTP error, wallet refusal, non-operator signer).
 * The demo screen (chantier 07) tails this file, or reads `mm ancre journal --json`.
 * Location: ANCRE_JOURNAL, default ~/.ancre/journal.jsonl (never under ~/.metamask).
 */
export type JournalEntry = {
  kind:
    | "refusal" | "paid" | "settlement_refused" | "unknown" | "pay_aborted"
    | "override_requested" | "override_refused" | "override_declined" | "override_signed" | "override_paid" | "override_failed" | "override_unknown";
  url: string;
  agentId: string;
  payTo: string;
  amount: string; // base units
  verdict?: string; // ANCRE verdict at the time (refusal, or the one the human overrode)
  reason?: string;
  status?: string;
  triggerTag?: string;
  payer?: string; // who paid: the TrustGatedPayer, or the human's own wallet for an override
  transaction?: string;
  detail?: string;
};

export type Journal = (e: JournalEntry) => void;

export function journalPath(env: Record<string, string | undefined> = process.env): string {
  return env.ANCRE_JOURNAL ?? join(homedir(), ".ancre", "journal.jsonl");
}

/**
 * Never throws: a journal failure must not change a payment decision; it is reported on stderr instead.
 * This local file is a convenience for the demo screen, not a tamper-proof audit trail (the user, or an agent
 * running as the user, can edit it). The on-chain trace of a refusal is TrustGatedPayer.reportRefusal.
 */
export function fileJournal(path = journalPath(), warn: (s: string) => void = (s) => process.stderr.write(s + "\n")): Journal {
  return (e) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
    } catch (err) {
      warn(`ANCRE journal: could not write ${path} (${(err as Error).message}); entry ${e.kind} for agent #${e.agentId} not recorded`);
    }
  };
}

export function readJournal(path = journalPath(), limit = 100): (JournalEntry & { at: string })[] {
  if (limit <= 0 || !existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
}

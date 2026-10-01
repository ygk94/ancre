import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Append-only journal of every ANCRE refusal and every human override (D47), one JSON object per line.
 * The demo screen (chantier 07) tails this file, or reads `mm ancre journal --json`.
 * Location: ANCRE_JOURNAL, default ~/.ancre/journal.jsonl (never under ~/.metamask).
 */
export type JournalEntry = {
  kind: "refusal" | "paid" | "settlement_refused" | "unknown" | "override_requested" | "override_declined" | "override_signed" | "override_paid" | "override_failed";
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

/** Never throws: a journal failure must not change a payment decision. */
export function fileJournal(path = journalPath()): Journal {
  return (e) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
    } catch {
      /* journal is best effort */
    }
  };
}

export function readJournal(path = journalPath(), limit = 100): (JournalEntry & { at: string })[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
}

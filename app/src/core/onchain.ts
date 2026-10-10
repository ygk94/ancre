// What the screen says about ANCRE's state READ ON-CHAIN (Monad mainnet, D-option 1 of 10/10): the certificate
// of the anchor set, its age against the committed maxAge, and each agent's assess() / payer decide(). Pure:
// values read by sources/mainnetChain.ts come in, display facts go out. A value that was not read is null and
// renders "—": nothing here ever falls back to a recorded or computed number.

// enum orders, from contracts/src/AnchoredReputation.sol (Status) and TrustGatedPayer.sol (Reason)
export const STATUS = ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"] as const;
export const REASON = [
  "OK", "PAUSED", "BAD_FORMAT", "BAD_KIND", "DIGEST_MISMATCH", "OVER_LIMIT",
  "NO_WALLET", "WALLET_MISMATCH", "BAD_OPERATOR_SIG", "ANCRE_STATUS", "UNTRUSTED",
] as const;

export const statusName = (n: number) => STATUS[n] ?? `status ${n}`;
export const reasonName = (n: number) => REASON[n] ?? `reason ${n}`;

/** AnchoredReputation.Assessment as read (WAD values as decimal strings). */
export type OnchainAssess = {
  status: string;
  trust: string;
  trustRobust: string;
  trustLow: string;
  distrust: string;
  distrustUp: string;
  e: string;
  certBlock: number; // 0 when NO_CERT
  vetoCount: number;
  triggerTag: string | null;
  passesPolicy: boolean;
};

export type OnchainAgent = {
  agentId: string;
  assess: OnchainAssess | null; // null: the read failed
  /** agentWallet(agentId) in the identity registry, read now; null: not read; "0x0…0": none */
  wallet: string | null;
  /** TrustGatedPayer.decide(agentId, agentWallet, amount) now; null: not read */
  decide: string | null;
};

export type BlockRef = { number: number; timestamp: number };

export type OnchainState = {
  rpc: string;
  head: BlockRef | null;
  /** block of the certificate assess() reports, with its timestamp (read), null if no read or NO_CERT */
  cert: BlockRef | null;
  maxAge: number | null; // policyOf(setId).maxAge, blocks
  thetaPct: number | null;
  paused: boolean | null;
  agents: Record<string, OnchainAgent>;
  readAt: string; // ISO time of the reads (browser clock)
  errors: string[];
};

export type CertAge = {
  ageBlocks: number;
  /** seconds between the certificate's block and the head, from the two block timestamps */
  ageSeconds: number | null;
  maxAge: number;
  /** last block at which assess() still accepts it: certBlock + maxAge (STALE iff block.number - certBlock > maxAge) */
  lastValidBlock: number;
  stale: boolean;
  /** blocks left before STALE (0 once stale) */
  blocksLeft: number;
  /** seconds per block measured between the certificate and the head, null when not measurable */
  secondsPerBlock: number | null;
};

/** The certificate's age against the committed maxAge, exactly the contract's rule (AnchoredReputation._assess). */
export function certAge(head: BlockRef | null, cert: BlockRef | null, maxAge: number | null): CertAge | null {
  if (!head || !cert || maxAge === null || cert.number <= 0) return null;
  const ageBlocks = Math.max(0, head.number - cert.number);
  const dt = head.timestamp && cert.timestamp ? head.timestamp - cert.timestamp : null;
  const lastValidBlock = cert.number + maxAge;
  const stale = ageBlocks > maxAge;
  return {
    ageBlocks,
    ageSeconds: dt !== null && dt >= 0 ? dt : null,
    maxAge,
    lastValidBlock,
    stale,
    blocksLeft: stale ? 0 : lastValidBlock - head.number,
    secondsPerBlock: dt !== null && dt > 0 && ageBlocks >= 100 ? dt / ageBlocks : null,
  };
}

/** "3 h 12 min", "41 min", "52 s", "2 d 4 h" */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}

/** One word for the screen, from the contract's own answer. Never derived from a recorded or computed value. */
export type OnchainVerdict = { word: "PASSES" | "REFUSED" | "VETOED" | "STALE" | "NO_CERT" | "OTHER" | "UNREAD"; text: string; tone: "good" | "bad" | "warn" | "none" };

export function verdictOf(a: OnchainAssess | null): OnchainVerdict {
  if (!a) return { word: "UNREAD", text: "— (RPC unreachable)", tone: "none" };
  if (a.status === "VETOED") return { word: "VETOED", text: `vetoed by ${a.vetoCount} anchor${a.vetoCount === 1 ? "" : "s"}: refused`, tone: "bad" };
  if (a.status === "STALE") return { word: "STALE", text: "certificate older than maxAge: the contract refuses until a recertification", tone: "warn" };
  if (a.status === "NO_CERT") return { word: "NO_CERT", text: "no certificate for this anchor set", tone: "warn" };
  if (a.status !== "OK") return { word: "OTHER", text: `status ${a.status}: refused`, tone: "warn" };
  if (a.passesPolicy) return { word: "PASSES", text: "passesAnchorPolicy = true", tone: "good" };
  return {
    word: "REFUSED",
    text: BigInt(a.trust) === 0n ? "mass 0: unknown to these anchors" : "leave-one-out mass below θ, or distrust over ρ",
    tone: "bad",
  };
}

/** The agent ids the mainnet screen reads on-chain: the run's agents plus the page's own agent, deduplicated. */
export function idsToRead(runAgents: string[], extra: (string | null | undefined)[] = []): string[] {
  return [...new Set([...runAgents, ...extra.filter((x): x is string => !!x && /^\d+$/.test(x))])];
}

export const isZeroAddr = (a: string | null | undefined) => !a || /^0x0{40}$/i.test(a);

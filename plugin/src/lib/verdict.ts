import { type Hex, keccak256, toHex } from "viem";
import { REASONS, STATUSES } from "./payer.js";

/** Assessment of AnchoredReputation v1 as returned by viem (struct -> object). */
export type Assessment = {
  status: number;
  trust: bigint;
  trustRobust: bigint;
  distrust: bigint;
  e: bigint;
  certBlock: bigint;
  vetoCount: number;
  triggerTag: Hex;
  trustLow: bigint;
  distrustUp: bigint;
  eLow: bigint;
  trusted: boolean;
};

export type VerdictName =
  | "PAY"
  | "UNTRUSTED"
  | "VETOED"
  | "TRANSFERRED"
  | "NO_CERT"
  | "STALE"
  | "REGISTRY_CHANGED"
  | "WALLET_MISMATCH"
  | "NO_WALLET"
  | "OVER_LIMIT"
  | "PAUSED"
  | "BAD_OPERATOR_SIG"
  | "DIGEST_MISMATCH"
  | "BAD_FORMAT"
  | "BAD_KIND"
  | "SETTLEMENT_FAILED";

export type Verdict = {
  verdict: VerdictName;
  pay: boolean;
  action: string;
  agentId: string;
  payTo: string;
  reason: string; // TrustGatedPayer.Reason
  status: string; // AnchoredReputation.Status
  trust: string; // WAD, decimal strings (JSON-safe)
  trustRobust: string;
  trustLow: string;
  distrustUp: string;
  vetoCount: number;
  triggerTag?: string; // the tag name when known, else the keccak256 hash (AM-04.2: only hashes are on-chain)
  certBlock: string;
};

/** triggerTag is keccak256(tag1): resolved against the tags a set is likely to use; unknown hashes stay hex. */
const KNOWN_TAGS = ["veto", "slash", "review", "vouch", "endorse", "scam", "fraud", "spam", "elo", "uptime", "warrant-preflight"];
const TAG_BY_HASH = new Map<string, string>(KNOWN_TAGS.map((t) => [keccak256(toHex(t)), t]));

export function tagName(h: Hex): string | undefined {
  if (/^0x0{64}$/.test(h)) return undefined;
  return TAG_BY_HASH.get(h.toLowerCase()) ?? h;
}

const ACTIONS: Record<VerdictName, string> = {
  PAY: "ANCRE trusts this agent under your anchor set: you may pay it, with the human's approval",
  UNTRUSTED: "Do not pay: ANCRE does not know this agent well enough (trust below your anchor set's threshold); unknown is the normal case for new agents",
  VETOED: "Do not pay: one of your anchors flagged this agent",
  TRANSFERRED: "Do not pay: the agent changed owner since it was certified",
  NO_CERT: "Do not pay: there is no certificate for this anchor set yet; tell the human",
  STALE: "Do not pay: the certificate is too old or was proven wrong; tell the human, do not retry in a loop",
  REGISTRY_CHANGED: "Do not pay: the ERC-8004 registry was upgraded since certification; tell the human",
  WALLET_MISMATCH: "Do not pay: payTo is not the wallet of the agent the offer claims to be",
  NO_WALLET: "Do not pay: this agent has no agentWallet (unknown id, or cleared by a transfer)",
  OVER_LIMIT: "Do not pay: the amount exceeds the payer's maxPerPayment; ask the human, never split the payment",
  PAUSED: "Do not pay: the payer contract is paused",
  BAD_OPERATOR_SIG: "Do not pay: the signing wallet is not an operator of this payer (wrong mm login method?)",
  DIGEST_MISMATCH: "Internal error: the authorisation does not match the blob",
  BAD_FORMAT: "Internal error: malformed blob",
  BAD_KIND: "Internal error: unsupported payment kind",
  SETTLEMENT_FAILED:
    "Not paid, and not because of ANCRE (expired window, facilitator or server failure). Do not retry or sign again automatically; tell the human",
};

/** After a failed paid request, an explain() that says OK means the failure was not the policy: never report PAY. */
export function afterFailure(v: Verdict): Verdict {
  return v.verdict === "PAY" ? { ...v, verdict: "SETTLEMENT_FAILED", pay: false, action: ACTIONS.SETTLEMENT_FAILED } : v;
}

/** Maps (TrustGatedPayer.Reason, Assessment) to the verdict the skill acts on. */
export function describe(reasonIdx: number, a: Assessment, agentId: bigint, payTo: string): Verdict {
  const reason = REASONS[reasonIdx] ?? `UNKNOWN_${reasonIdx}`;
  const status = STATUSES[a.status] ?? `UNKNOWN_${a.status}`;
  let verdict: VerdictName;
  if (reason === "OK") verdict = "PAY";
  else if (reason === "ANCRE_STATUS") verdict = status as VerdictName;
  else verdict = reason as VerdictName;
  if (!(verdict in ACTIONS)) verdict = "UNTRUSTED"; // fail closed on anything unexpected
  const tag = tagName(a.triggerTag);
  return {
    verdict,
    pay: verdict === "PAY",
    action: ACTIONS[verdict],
    agentId: agentId.toString(),
    payTo,
    reason,
    status,
    trust: a.trust.toString(),
    trustRobust: a.trustRobust.toString(),
    trustLow: a.trustLow.toString(),
    distrustUp: a.distrustUp.toString(),
    vetoCount: Number(a.vetoCount),
    ...(tag ? { triggerTag: tag } : {}),
    certBlock: a.certBlock.toString(),
  };
}

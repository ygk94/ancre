import { type Address, getAddress, type Hex, isAddress } from "viem";
import { AncreError } from "./errors.js";
import type { Authorization } from "./payer.js";

/** x402 v2 transport (specs/transports-v2/http.md, x402-foundation/x402 @ 02e80f3): base64 JSON headers. */
export const H_REQUIRED = "payment-required";
export const H_SIGNATURE = "payment-signature";
export const H_RESPONSE = "payment-response";

export type PaymentRequirements = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
};

export type PaymentRequired = {
  x402Version: number;
  resource?: { url?: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
  error?: string;
  extensions?: Record<string, unknown>;
};

export function encodeB64Json(v: unknown): string {
  return Buffer.from(JSON.stringify(v), "utf8").toString("base64");
}

export function decodeB64Json<T>(s: string): T {
  return JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;
}

/** Reads a 402 challenge. v1 (accepts in the body) is refused explicitly: the Monad facilitator speaks v2. */
export function parsePaymentRequired(status: number, headers: Headers, body: string): PaymentRequired {
  if (status !== 402) throw new AncreError("ANCRE_NOT_402", `Expected HTTP 402, got ${status}`, "This resource does not ask for an x402 payment");
  const h = headers.get(H_REQUIRED);
  if (!h) {
    let v1 = false;
    try {
      v1 = (JSON.parse(body) as { x402Version?: number }).x402Version === 1;
    } catch {
      /* not JSON */
    }
    throw new AncreError(
      v1 ? "ANCRE_X402_V1" : "ANCRE_NO_CHALLENGE",
      v1 ? "The server speaks x402 v1" : "402 without a PAYMENT-REQUIRED header",
      "ANCRE pays x402 v2 only (PAYMENT-REQUIRED / PAYMENT-SIGNATURE headers)",
    );
  }
  let pr: PaymentRequired;
  try {
    pr = decodeB64Json<PaymentRequired>(h);
  } catch {
    throw new AncreError("ANCRE_BAD_CHALLENGE", "PAYMENT-REQUIRED is not base64 JSON", "Malformed server response");
  }
  if (pr.x402Version !== 2 || !Array.isArray(pr.accepts)) {
    throw new AncreError("ANCRE_BAD_CHALLENGE", `Unsupported x402Version ${pr.x402Version}`, "ANCRE pays x402 v2 only");
  }
  return pr;
}

/** What an offer must be for ANCRE to pay it. Shared by the CLI (selectOffer) and the SDK guard (x402-guard.ts, M3). */
export type OfferRules = { network: string; usdc: Address; maxAmount?: bigint };

/**
 * Why an offer is not payable, or undefined if it is: exact (EIP-3009, the default asset transfer method) in USDC
 * on this chain, in the FiatToken EIP-712 domain, to a valid payTo, for a decimal amount within maxAmount.
 * The payer's maxPerPayment is NOT checked here: decide() answers OVER_LIMIT, which is journaled and overridable (K19).
 */
export function offerProblem(o: Partial<PaymentRequirements>, want: OfferRules): string | undefined {
  if (o.scheme !== "exact") return `scheme ${o.scheme}`;
  if (o.network !== want.network) return `network ${o.network}`;
  if (typeof o.asset !== "string" || !isAddress(o.asset) || getAddress(o.asset) !== getAddress(want.usdc)) return `asset ${o.asset}`;
  // the facilitator builds the EIP-712 domain from extra.name/version: anything else than FiatToken's would not match
  if (o.extra?.name !== "USDC" || o.extra?.version !== "2") return `EIP-712 domain ${String(o.extra?.name)}/${String(o.extra?.version)}`;
  const method = o.extra?.assetTransferMethod;
  if (method !== undefined && method !== "eip3009") return `method ${String(method)}`;
  if (typeof o.payTo !== "string" || !isAddress(o.payTo)) return `payTo ${o.payTo}`;
  if (typeof o.amount !== "string" || !/^\d+$/.test(o.amount)) return `amount ${o.amount}`;
  if (want.maxAmount !== undefined && BigInt(o.amount) > want.maxAmount) return `amount ${o.amount} > --max-amount`;
  return undefined;
}

/** The first payable offer of the challenge (offerProblem), else ANCRE_NO_OFFER with every reason. */
export function selectOffer(pr: PaymentRequired, want: OfferRules): PaymentRequirements {
  const why: string[] = [];
  const ok = pr.accepts.filter((o, i) => {
    const p = offerProblem(o, want);
    if (p) why.push(`accepts[${i}]: ${p}`);
    return !p;
  });
  if (ok.length === 0) {
    throw new AncreError("ANCRE_NO_OFFER", `No payable offer (${why.join("; ") || "empty accepts"})`,
      `ANCRE pays "exact" USDC on ${want.network} only, within --max-amount`);
  }
  return ok[0];
}

/**
 * agentId: the --agent-id flag, else the NON-STANDARD offer field extra.erc8004AgentId (an ANCRE proposal).
 * Never guessed from the URL or the wallet: the payer contract re-checks agentWallet(agentId) == payTo.
 */
export function resolveAgentId(flag: string | undefined, offer: PaymentRequirements): bigint {
  const raw = flag ?? (offer.extra?.erc8004AgentId as string | number | undefined);
  if (raw === undefined || raw === null || raw === "") {
    throw new AncreError(
      "ANCRE_NO_AGENT_ID",
      "The offer does not declare an ERC-8004 agentId",
      "Ask the human (or the server's docs) for the provider's agentId and pass --agent-id N",
    );
  }
  const s = String(raw);
  if (!/^\d+$/.test(s)) throw new AncreError("ANCRE_BAD_AGENT_ID", `Invalid agentId "${s}"`, "agentId is a decimal integer");
  return BigInt(s);
}

/** The server picks the window, within [MIN, MAX] seconds: a signed authorisation must not outlive the payment attempt. */
export const MIN_TIMEOUT_S = 10;
export const MAX_TIMEOUT_S = 300;

/** Same choices as the official x402_pay.py: validAfter = now - 600, validBefore = now + maxTimeoutSeconds, random nonce. */
export function newAuthorization(payer: Address, offer: PaymentRequirements, nowSec: number, nonce: Hex): Authorization {
  const raw = offer.maxTimeoutSeconds;
  const t = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : 60; // a string or 60.5 is not trusted
  const timeout = Math.min(Math.max(t, MIN_TIMEOUT_S), MAX_TIMEOUT_S);
  return {
    from: payer,
    to: getAddress(offer.payTo),
    value: BigInt(offer.amount),
    validAfter: BigInt(nowSec - 600),
    validBefore: BigInt(nowSec + timeout),
    nonce,
  };
}

/** PaymentPayload v2: identical to an EOA payment except from = the payer contract and signature = the blob. */
export function buildPaymentPayload(pr: PaymentRequired, offer: PaymentRequirements, auth: Authorization, blob: Hex, url: string) {
  return {
    x402Version: 2,
    resource: pr.resource ?? { url },
    accepted: offer,
    payload: {
      signature: blob,
      authorization: {
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        nonce: auth.nonce,
      },
    },
  };
}

export type SettleResponse = { success: boolean; transaction?: string; network?: string; payer?: string; errorReason?: string };

export function decodePaymentResponse(headers: Headers): SettleResponse | undefined {
  const h = headers.get(H_RESPONSE);
  if (!h) return undefined;
  try {
    const r = decodeB64Json<SettleResponse>(h);
    return typeof r === "object" && r !== null ? r : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What the response to a paid request proves, before any on-chain read (K15, A4a):
 * - "settled": PAYMENT-RESPONSE success:true with a transaction, WHATEVER the HTTP status (the upfront flow settles
 *   before the handler and may answer 500 with a successful settlement);
 * - "verify_rejected": 402 with a new PAYMENT-REQUIRED and no PAYMENT-RESPONSE: the server refused at /verify, before
 *   any settlement (@x402/core 2.27, processHTTPRequest);
 * - "unproven": anything else (2xx without proof, a 5xx or a proxy's 504, settlement_pending with a hash, a failed
 *   /settle: a facilitator that timed out after broadcasting answers exactly like one that never broadcast).
 */
export function paidResponseEvidence(status: number, headers: Headers): { kind: "settled" | "verify_rejected" | "unproven"; settlement?: SettleResponse } {
  const settlement = decodePaymentResponse(headers);
  if (settlement?.success === true && typeof settlement.transaction === "string" && settlement.transaction) return { kind: "settled", settlement };
  if (!settlement && status === 402 && headers.get(H_REQUIRED)) return { kind: "verify_rejected" };
  return { kind: "unproven", settlement };
}

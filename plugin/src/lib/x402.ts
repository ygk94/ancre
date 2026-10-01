import { type Address, getAddress, type Hex, isAddress } from "viem";
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

export class X402Error extends Error {
  constructor(readonly code: string, message: string, readonly hint: string) {
    super(message);
  }
}

export function encodeB64Json(v: unknown): string {
  return Buffer.from(JSON.stringify(v), "utf8").toString("base64");
}

export function decodeB64Json<T>(s: string): T {
  return JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;
}

/** Reads a 402 challenge. v1 (accepts in the body) is refused explicitly: the Monad facilitator speaks v2. */
export function parsePaymentRequired(status: number, headers: Headers, body: string): PaymentRequired {
  if (status !== 402) throw new X402Error("ANCRE_NOT_402", `Expected HTTP 402, got ${status}`, "This resource does not ask for an x402 payment");
  const h = headers.get(H_REQUIRED);
  if (!h) {
    let v1 = false;
    try {
      v1 = (JSON.parse(body) as { x402Version?: number }).x402Version === 1;
    } catch {
      /* not JSON */
    }
    throw new X402Error(
      v1 ? "ANCRE_X402_V1" : "ANCRE_NO_CHALLENGE",
      v1 ? "The server speaks x402 v1" : "402 without a PAYMENT-REQUIRED header",
      "ANCRE pays x402 v2 only (PAYMENT-REQUIRED / PAYMENT-SIGNATURE headers)",
    );
  }
  let pr: PaymentRequired;
  try {
    pr = decodeB64Json<PaymentRequired>(h);
  } catch {
    throw new X402Error("ANCRE_BAD_CHALLENGE", "PAYMENT-REQUIRED is not base64 JSON", "Malformed server response");
  }
  if (pr.x402Version !== 2 || !Array.isArray(pr.accepts)) {
    throw new X402Error("ANCRE_BAD_CHALLENGE", `Unsupported x402Version ${pr.x402Version}`, "ANCRE pays x402 v2 only");
  }
  return pr;
}

/**
 * The only offer ANCRE pays: exact (EIP-3009, the default asset transfer method) in USDC on this chain,
 * a valid payTo, an amount within --max-amount and within the payer's maxPerPayment.
 */
export function selectOffer(
  pr: PaymentRequired,
  want: { network: string; usdc: Address; maxAmount?: bigint; maxPerPayment?: bigint },
): PaymentRequirements {
  const why: string[] = [];
  const ok = pr.accepts.filter((o, i) => {
    const tag = `accepts[${i}]`;
    if (o.scheme !== "exact") return why.push(`${tag}: scheme ${o.scheme}`), false;
    if (o.network !== want.network) return why.push(`${tag}: network ${o.network}`), false;
    if (!isAddress(o.asset) || getAddress(o.asset) !== want.usdc) return why.push(`${tag}: asset ${o.asset}`), false;
    const method = o.extra?.assetTransferMethod;
    if (method !== undefined && method !== "eip3009") return why.push(`${tag}: method ${String(method)}`), false;
    if (!isAddress(o.payTo)) return why.push(`${tag}: payTo ${o.payTo}`), false;
    if (!/^\d+$/.test(o.amount)) return why.push(`${tag}: amount ${o.amount}`), false;
    const a = BigInt(o.amount);
    if (want.maxAmount !== undefined && a > want.maxAmount) return why.push(`${tag}: amount ${a} > --max-amount`), false;
    if (want.maxPerPayment !== undefined && a > want.maxPerPayment) return why.push(`${tag}: amount ${a} > maxPerPayment`), false;
    return true;
  });
  if (ok.length === 0) {
    throw new X402Error("ANCRE_NO_OFFER", `No payable offer (${why.join("; ") || "empty accepts"})`, `ANCRE pays "exact" USDC on ${want.network} only`);
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
    throw new X402Error(
      "ANCRE_NO_AGENT_ID",
      "The offer does not declare an ERC-8004 agentId",
      "Ask the human (or the server's docs) for the provider's agentId and pass --agent-id N",
    );
  }
  const s = String(raw);
  if (!/^\d+$/.test(s)) throw new X402Error("ANCRE_BAD_AGENT_ID", `Invalid agentId "${s}"`, "agentId is a decimal integer");
  return BigInt(s);
}

/** Same choices as the official x402_pay.py: validAfter = now - 600, validBefore = now + maxTimeoutSeconds, random nonce. */
export function newAuthorization(payer: Address, offer: PaymentRequirements, nowSec: number, nonce: Hex): Authorization {
  const timeout = offer.maxTimeoutSeconds && offer.maxTimeoutSeconds > 0 ? offer.maxTimeoutSeconds : 60;
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
    return decodeB64Json<SettleResponse>(h);
  } catch {
    return undefined;
  }
}

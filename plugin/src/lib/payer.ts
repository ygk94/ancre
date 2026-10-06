import { type Address, bytesToHex, encodePacked, type Hex, hashTypedData, hexToBytes, numberToBytes, size } from "viem";
import { AncreError } from "./errors.js";

/** Reason enum of TrustGatedPayer, in declaration order (contracts/src/TrustGatedPayer.sol). */
export const REASONS = [
  "OK",
  "PAUSED",
  "BAD_FORMAT",
  "BAD_KIND",
  "DIGEST_MISMATCH",
  "OVER_LIMIT",
  "NO_WALLET",
  "WALLET_MISMATCH",
  "BAD_OPERATOR_SIG",
  "ANCRE_STATUS",
  "UNTRUSTED",
] as const;
export type Reason = (typeof REASONS)[number];

/** AnchoredReputation.Status, in declaration order. */
export const STATUSES = ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"] as const;
export type Status = (typeof STATUSES)[number];

export type Authorization = {
  from: Address; // the payer contract
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex; // 32 bytes
};

const EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

/** What the operator (the mm wallet) signs: readable in the MFA screen, valid for this payer and chain only. */
export function ancrePaymentTypedData(chainId: number, auth: Authorization, agentId: bigint) {
  return {
    types: {
      EIP712Domain: EIP712_DOMAIN,
      AncrePayment: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
        { name: "agentId", type: "uint256" },
      ],
    },
    primaryType: "AncrePayment",
    domain: { name: "ANCRE TrustGatedPayer", version: "1", chainId, verifyingContract: auth.from },
    message: {
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      nonce: auth.nonce,
      agentId,
    },
  } as const;
}

const TWA_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

/** EIP-3009 TransferWithAuthorization in the USDC domain ("USDC" / "2", MESURÉ 27/09), for viem. */
export function usdcAuthorizationTypedData(chainId: number, usdc: Address, auth: Authorization) {
  return {
    domain: { name: "USDC", version: "2", chainId, verifyingContract: usdc },
    types: { TransferWithAuthorization: TWA_FIELDS },
    primaryType: "TransferWithAuthorization",
    message: auth,
  } as const;
}

/** The same, as JSON for a wallet's eth_signTypedData_v4 (EIP712Domain listed, integers as strings). */
export function usdcAuthorizationTypedDataJson(chainId: number, usdc: Address, auth: Authorization) {
  return {
    domain: { name: "USDC", version: "2", chainId, verifyingContract: usdc },
    types: { EIP712Domain: EIP712_DOMAIN, TransferWithAuthorization: TWA_FIELDS },
    primaryType: "TransferWithAuthorization",
    message: { from: auth.from, to: auth.to, value: auth.value.toString(), validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(), nonce: auth.nonce },
  };
}

/** The EIP-3009 digest the USDC presents to isValidSignature. */
export function usdcAuthorizationDigest(chainId: number, usdc: Address, auth: Authorization): Hex {
  return hashTypedData(usdcAuthorizationTypedData(chainId, usdc, auth));
}

/** secp256k1 group order. TrustGatedPayer._recover refuses s > N/2 (PAYER.md: "low s"). */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * 65-byte r|s|v with v in {27, 28} and a low s: the only form the payer accepts. Accepts v in {0, 1}, EIP-2098
 * compact, and a high-s signature, which it maps to its low-s twin (s' = n - s, v flipped): both recover the same
 * signer, so the operator check of the plugin and the payer's agree (K5).
 */
export function normalizeSignature(sig: Hex): Hex {
  let b: Uint8Array;
  try {
    b = hexToBytes(sig);
  } catch {
    throw new AncreError("ANCRE_BAD_SIGNATURE", "The wallet returned a signature that is not hex", "Do not retry; tell the human");
  }
  let r: Uint8Array, s: bigint, v: number;
  if (b.length === 65) {
    r = b.slice(0, 32);
    s = BigInt(bytesToHex(b.slice(32, 64)));
    v = b[64];
    if (v === 0 || v === 1) v += 27;
    else if (v !== 27 && v !== 28) throw new AncreError("ANCRE_BAD_SIGNATURE", `Unsupported signature v=${v}`, "Do not retry; tell the human");
  } else if (b.length === 64) {
    r = b.slice(0, 32);
    const vs = b.slice(32, 64);
    v = vs[0] & 0x80 ? 28 : 27;
    vs[0] &= 0x7f;
    s = BigInt(bytesToHex(vs));
  } else {
    throw new AncreError("ANCRE_BAD_SIGNATURE", `Unsupported signature length ${b.length} (an ECDSA signature of the operator is expected)`,
      "Do not retry; tell the human");
  }
  if (s === 0n || s >= SECP256K1_N) throw new AncreError("ANCRE_BAD_SIGNATURE", "Signature s out of range", "Do not retry; tell the human");
  if (s > SECP256K1_N / 2n) {
    s = SECP256K1_N - s;
    v = v === 27 ? 28 : 27;
  }
  const out = new Uint8Array(65);
  out.set(r, 0);
  out.set(numberToBytes(s, { size: 32 }), 32);
  out[64] = v;
  return bytesToHex(out);
}

/** Kind-1 blob (246 bytes), layout of TrustGatedPayer: 0x01|agentId|to|value|validAfter|validBefore|nonce|opSig. */
export function encodeExactBlob(auth: Authorization, agentId: bigint, opSig: Hex): Hex {
  const sig = normalizeSignature(opSig);
  const blob = encodePacked(
    ["uint8", "uint256", "address", "uint256", "uint256", "uint256", "bytes32", "bytes"],
    [1, agentId, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, sig],
  );
  if (size(blob) !== 246) throw new AncreError("ANCRE_INTERNAL", `blob length ${size(blob)} != 246`, "Do not retry; tell the human");
  return blob;
}

export type UptoAuthorization = {
  from: Address; // the payer contract
  to: Address;
  cap: bigint;
  nonce: bigint; // Permit2 unordered nonce
  deadline: bigint;
  facilitator: Address; // bound in the Permit2 witness
  validAfter: bigint;
};

/** Operator signature for a kind-2 (upto, Permit2) payment. */
export function ancreUptoTypedData(chainId: number, u: UptoAuthorization, agentId: bigint) {
  return {
    types: {
      EIP712Domain: EIP712_DOMAIN,
      AncreUptoPayment: [
        { name: "to", type: "address" },
        { name: "cap", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "facilitator", type: "address" },
        { name: "validAfter", type: "uint256" },
        { name: "agentId", type: "uint256" },
      ],
    },
    primaryType: "AncreUptoPayment",
    domain: { name: "ANCRE TrustGatedPayer", version: "1", chainId, verifyingContract: u.from },
    message: { to: u.to, cap: u.cap, nonce: u.nonce, deadline: u.deadline, facilitator: u.facilitator, validAfter: u.validAfter, agentId },
  } as const;
}

/** Kind-2 blob (266 bytes): 0x02|agentId|to|cap|p2Nonce|deadline|facilitator|validAfter|opSig. */
export function encodeUptoBlob(u: UptoAuthorization, agentId: bigint, opSig: Hex): Hex {
  const blob = encodePacked(
    ["uint8", "uint256", "address", "uint256", "uint256", "uint256", "address", "uint256", "bytes"],
    [2, agentId, u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, normalizeSignature(opSig)],
  );
  if (size(blob) !== 266) throw new AncreError("ANCRE_INTERNAL", `blob length ${size(blob)} != 266`, "Do not retry; tell the human");
  return blob;
}

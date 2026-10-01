import { type Address, encodePacked, type Hex, hashTypedData, hexToBytes, bytesToHex, size } from "viem";

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

/** The EIP-3009 digest the USDC presents to isValidSignature (domain "USDC" / "2", MESURÉ 27/09). */
export function usdcAuthorizationDigest(chainId: number, usdc: Address, auth: Authorization): Hex {
  return hashTypedData({
    domain: { name: "USDC", version: "2", chainId, verifyingContract: usdc },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: auth,
  });
}

/** 65-byte r|s|v with v in {27, 28}: the only form the payer accepts. Accepts v in {0, 1} and EIP-2098 compact. */
export function normalizeSignature(sig: Hex): Hex {
  const b = hexToBytes(sig);
  if (b.length === 65) {
    const v = b[64];
    if (v === 0 || v === 1) b[64] = v + 27;
    else if (v !== 27 && v !== 28) throw new Error(`unsupported signature v=${v}`);
    return bytesToHex(b);
  }
  if (b.length === 64) {
    const out = new Uint8Array(65);
    out.set(b.slice(0, 32), 0);
    const vs = b.slice(32, 64);
    const v = vs[0] & 0x80 ? 28 : 27;
    vs[0] &= 0x7f;
    out.set(vs, 32);
    out[64] = v;
    return bytesToHex(out);
  }
  throw new Error(`unsupported signature length ${b.length} (an ECDSA signature of the operator is expected)`);
}

/** Kind-1 blob (246 bytes), layout of TrustGatedPayer: 0x01|agentId|to|value|validAfter|validBefore|nonce|opSig. */
export function encodeExactBlob(auth: Authorization, agentId: bigint, opSig: Hex): Hex {
  const sig = normalizeSignature(opSig);
  const blob = encodePacked(
    ["uint8", "uint256", "address", "uint256", "uint256", "uint256", "bytes32", "bytes"],
    [1, agentId, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, sig],
  );
  if (size(blob) !== 246) throw new Error(`blob length ${size(blob)} != 246`);
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
  if (size(blob) !== 266) throw new Error(`blob length ${size(blob)} != 266`);
  return blob;
}

// P4 prototype (06-E3): epoch keys derived from a passkey PRF output, as designed in docs/ressources/design-mera.md §3.
// Pure functions only (no WebAuthn here) so the derivation is unit-tested with fake PRF outputs.
//
//   salt_n   = sha256("ancre.v1|anchor-epoch|" + label + "|" + n)        one PRF evaluation per epoch (namespaces)
//   seed_n   = HKDF-SHA256(P_n, salt = empty, info = "ancre.v1/anchor-epoch/secp256k1", 48 bytes)
//   k_n      = secp256k1.utils.randomSecretKey(seed_n)                   deterministic for a 48-byte seed
//   s_n      = HKDF-SHA256(P_n, salt = empty, info = "ancre.v1/anchor-epoch/reveal-salt", 32 bytes)
//   digest_n = keccak256(abi.encode(address(k_n), s_n))                  = nextKeyDigest of the ERC draft
//
// Every secret buffer (P_n, seed, private key) is zeroed before returning. Zeroing is defence in depth only:
// the GC may have copied the bytes and bigint scalars inside noble are immutable (Mera security model).
import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";

/** Anchor label used by the prototype. A real anchor uses its own label; same passkey + same label = same keys. */
export const PROTO_LABEL = "p4-proto";

const LABEL_RE = /^[a-z0-9-]{1,64}$/;
const enc = (s: string) => new TextEncoder().encode(s);

const INFO_KEY = enc("ancre.v1/anchor-epoch/secp256k1");
const INFO_REVEAL = enc("ancre.v1/anchor-epoch/reveal-salt");

/** The namespace string fed to sha256 for epoch n (shown on screen, not secret). */
export function epochSaltLabel(label: string, n: number): string {
  if (!LABEL_RE.test(label)) throw new Error(`invalid anchor label: ${label}`);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`invalid epoch: ${n}`);
  return `ancre.v1|anchor-epoch|${label}|${n}`;
}

/** 32-byte PRF salt for epoch n of an anchor. Not secret: without the passkey it yields nothing. */
export function epochSalt(label: string, n: number): Uint8Array {
  return sha256(enc(epochSaltLabel(label, n)));
}

export type EpochPublic = {
  /** EIP-55 address of the epoch key k_n. */
  address: Hex;
  /** keccak256(abi.encode(address, s_n)): what the previous epoch commits on-chain (pre-rotation). */
  digest: Hex;
  /** Short human-comparable fingerprint of the digest. */
  fingerprint: string;
};

/** Short fingerprint: first 4 and last 4 bytes of the digest, grouped for reading aloud. */
export function shortFingerprint(digest: Hex): string {
  const h = digest.slice(2).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(-8, -4)}-${h.slice(-4)}`;
}

/**
 * Derives the public data of one epoch from its PRF output. ZEROES `prfOutput` in place, even on error,
 * so the caller must not reuse it. Only public values leave this function.
 */
export function deriveEpochPublic(prfOutput: Uint8Array): EpochPublic {
  let seed: Uint8Array | undefined;
  let sk: Uint8Array | undefined;
  let blind: Uint8Array | undefined;
  try {
    if (prfOutput.length !== 32) throw new Error(`PRF output must be 32 bytes, got ${prfOutput.length}`);
    seed = hkdf(sha256, prfOutput, undefined, INFO_KEY, 48);
    blind = hkdf(sha256, prfOutput, undefined, INFO_REVEAL, 32);
    sk = secp256k1.utils.randomSecretKey(seed);
    // The Mera session copies the key; we only need its public key here, then end() zeroes its copy.
    const session = createSecp256k1SigningSession({ privateKey: sk });
    let address: Hex;
    try {
      address = getEvmAddress(session.publicKey) as Hex;
    } finally {
      session.end();
    }
    const salt = toHex(blind);
    const digest = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [address, salt]));
    return { address, digest, fingerprint: shortFingerprint(digest) };
  } finally {
    prfOutput.fill(0);
    seed?.fill(0);
    sk?.fill(0);
    blind?.fill(0);
  }
}

/** Case-insensitive address comparison (EIP-55 checksum or lowercase both accepted). */
export function sameAddress(a: string, b: string): boolean {
  const norm = (x: string) => x.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(norm(a)) && norm(a) === norm(b);
}

/** One-line report the Mac copies and the iPhone pastes: "ancre-p4 e0=0x… e1=0x…". */
export function formatReport(addresses: readonly Hex[]): string {
  return ["ancre-p4", ...addresses.map((a, i) => `e${i}=${a}`)].join(" ");
}

/** Parses a pasted report, or a list of addresses in epoch order. Returns addresses by epoch index. */
export function parseReport(text: string): Record<number, string> {
  const out: Record<number, string> = {};
  const tagged = [...text.matchAll(/e(\d+)\s*=\s*(0x[0-9a-fA-F]{40})/g)];
  if (tagged.length > 0) {
    for (const m of tagged) out[Number(m[1])] = m[2];
    return out;
  }
  [...text.matchAll(/0x[0-9a-fA-F]{40}/g)].forEach((m, i) => (out[i] = m[0]));
  return out;
}

/**
 * Opens a Mera secp256k1 signing session on the epoch key derived from `prfOutput` (ZEROED in place). The private key
 * lives only inside the session: call `end()` as soon as the transaction is signed (the veto button signs one).
 */
export function openEpochSession(prfOutput: Uint8Array): { address: Hex; signDigest: (d: Uint8Array) => Promise<{ compact: Uint8Array; recovery: 0 | 1 }>; end: () => void } {
  let seed: Uint8Array | undefined;
  let sk: Uint8Array | undefined;
  try {
    if (prfOutput.length !== 32) throw new Error(`PRF output must be 32 bytes, got ${prfOutput.length}`);
    seed = hkdf(sha256, prfOutput, undefined, INFO_KEY, 48);
    sk = secp256k1.utils.randomSecretKey(seed);
    const session = createSecp256k1SigningSession({ privateKey: sk });
    return { address: getEvmAddress(session.publicKey) as Hex, signDigest: (d) => session.signDigest(d), end: () => session.end() };
  } finally {
    prfOutput.fill(0);
    seed?.fill(0);
    sk?.fill(0);
  }
}

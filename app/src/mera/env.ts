// Environment probes for the /mera prototype: rpId, browser, WebAuthn and PRF capability flags.
import { isMeraError } from "@category-labs/mera";

/** The definitive relying party. Passkeys are bound to it: never change it once Hugo has created his passkey. */
export const DEFINITIVE_RP_ID = "ancre-xyz.netlify.app";

export type RpInfo = { rpId: string; definitive: boolean; local: boolean };

/** rpId = the page host. On localhost it is "localhost": a separate world, keys differ from production. */
export function rpInfo(hostname: string): RpInfo {
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  return { rpId: hostname === "127.0.0.1" ? "localhost" : hostname, definitive: hostname === DEFINITIVE_RP_ID, local };
}

/** Coarse browser label from the user agent (display only). */
export function browserLabel(ua: string): string {
  const os = /iPhone|iPad/.test(ua)
    ? `iOS ${(ua.match(/OS (\d+)[_.](\d+)/) ?? []).slice(1, 3).join(".") || "?"}`
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : "other OS";
  // Order matters: Edge and Chrome UAs also contain "Safari/", Edge also contains "Chrome/".
  const probes: [RegExp, string][] = [
    [/(?:Edg|EdgiOS)\/(\d+)/, "Edge"],
    [/(?:CriOS|Chrome)\/(\d+)/, "Chrome"],
    [/(?:FxiOS|Firefox)\/(\d+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari\//, "Safari"],
  ];
  for (const [re, name] of probes) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]} on ${os}`;
  }
  return `unknown browser on ${os}`;
}

export type Capabilities = {
  webauthn: boolean;
  platformAuthenticator: boolean | "unknown";
  /** What the browser *reports* for extension:prf. Not reliable (Corbado): only a real ceremony proves PRF. */
  prfReported: boolean | "unknown";
};

export async function probeCapabilities(): Promise<Capabilities> {
  const PKC = (globalThis as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
  if (!PKC || !navigator.credentials) return { webauthn: false, platformAuthenticator: false, prfReported: false };
  let platformAuthenticator: Capabilities["platformAuthenticator"] = "unknown";
  try {
    platformAuthenticator = await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    /* keep unknown */
  }
  let prfReported: Capabilities["prfReported"] = "unknown";
  const getCaps = (PKC as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities;
  if (typeof getCaps === "function") {
    try {
      const caps = await getCaps.call(PKC);
      if ("extension:prf" in caps) prfReported = !!caps["extension:prf"];
    } catch {
      /* keep unknown */
    }
  }
  return { webauthn: true, platformAuthenticator, prfReported };
}

/** Maps a Mera / WebAuthn failure to a message Hugo can act on. */
export function explainError(e: unknown): string {
  if (isMeraError(e)) {
    const cause = (e as { cause?: unknown }).cause;
    const causeName = cause instanceof Error ? cause.name : "";
    switch (e.code) {
      case "PRF_UNAVAILABLE":
        return "PRF not supported by this authenticator: it returned no PRF output. Use iCloud Keychain (Safari macOS 15+ / iOS 18.4+) or 1Password; not a local Chrome profile, Bitwarden or Dashlane.";
      case "PASSKEY_OPERATION_FAILED":
        if (causeName === "NotAllowedError")
          return `Cancelled, timed out, or no passkey for this rpId on this device (${cause instanceof Error ? cause.message : "NotAllowedError"}). If you are on the second device: check that the passkey has synced (Passwords app), then retry.`;
        if (causeName === "InvalidStateError") return "A passkey for this rpId already exists on this authenticator.";
        if (causeName === "SecurityError") return "Security error: the rpId does not match this page's domain, or the page is not served over HTTPS.";
        return `WebAuthn failed (${causeName || "unknown cause"}): ${cause instanceof Error ? cause.message : e.message}`;
      case "CRYPTO_UNAVAILABLE":
        return "This browser lacks Web Crypto (crypto.getRandomValues): use a recent Safari or Chrome over HTTPS.";
      case "INPUT_INVALID":
        return `Invalid input (stored credential ID corrupted?): ${e.message}. Use "Forget pinned passkey" and retry.`;
      default:
        return `${e.code}: ${e.message}`;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

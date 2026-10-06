// Display helpers. Decisions are never taken on these strings: WAD values stay bigint strings until here.
export const WAD = 10n ** 18n;

/** WAD string -> percentage string ("3.46 %"), exact up to `digits` decimals, "0" stays "0". */
export function pct(wad: string | bigint | null | undefined, digits = 2): string {
  if (wad === null || wad === undefined) return "—";
  const x = BigInt(wad);
  if (x === 0n) return "0";
  const scale = 10n ** BigInt(digits);
  const v = (x * 100n * scale) / WAD;
  if (v === 0n) return `< ${(1 / Number(scale)).toFixed(digits)}`;
  const s = v.toString().padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

/** pct() with its unit, except for an exact 0 (shown bare: "0", never "0 %") */
export const pctU = (wad: string | bigint) => `${pct(wad)}${BigInt(wad) === 0n ? "" : " %"}`;

/** Tiny WAD amounts (error bounds): show in wei when below 1e-6 %. */
export function bound(wad: string | bigint | null | undefined): string {
  if (wad === null || wad === undefined) return "—";
  const x = BigInt(wad);
  if (x === 0n) return "0";
  if (x < 10n ** 10n) return `${x} wei`;
  return `${pct(x, 4)} %`;
}

/** Big decimal string -> readable, scientific above 1e9 ("1.5264 × 10^36"). */
export function big(s: string | null | undefined): { mant: string; exp: number | null } {
  if (s === null || s === undefined) return { mant: "—", exp: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { mant: s, exp: null };
  if (Math.abs(n) < 1e9) {
    const r = Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2);
    return { mant: r.replace(/\.?0+$/, "") || "0", exp: null };
  }
  const exp = Math.floor(Math.log10(Math.abs(n)));
  return { mant: (n / 10 ** exp).toFixed(4), exp };
}

export const int = (n: number | string) => Number(n).toLocaleString("en-US");

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function fmtDate(iso: string) {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

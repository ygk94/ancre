import type { ReactNode } from "react";
import { big } from "../lib/format";

// MOCK (dressing only): avatars are initials on a colour derived from the agent id. No image is fetched from
// any explorer. Listed in demo/SCREEN.md.
const AVATAR_COLOURS = ["#86b6ef", "#e8a17b", "#7fd4b4", "#e7c46a", "#e7a3c0", "#a9a2ef", "#9fd47f", "#ef9a9a"];
export function Avatar({ id, name, size }: { id: string; name: string; size?: number }) {
  const clean = name.replace(/^[a-z]+:\/\//, "").replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const initials = (clean.split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "#").toUpperCase();
  const bg = AVATAR_COLOURS[Number(BigInt(id) % BigInt(AVATAR_COLOURS.length))];
  return (
    <div className="avatar" style={{ background: bg, ...(size ? { width: size, height: size } : {}) }} aria-hidden>
      {initials}
    </div>
  );
}

/** A big decimal string, scientific above 1e9: 1.5264 × 10^36 */
export function BigNum({ value, suffix }: { value: string | null; suffix?: string }) {
  const b = big(value);
  return (
    <>
      {b.mant}
      {b.exp !== null && (
        <>
          {" × 10"}
          <sup>{b.exp}</sup>
        </>
      )}
      {suffix}
    </>
  );
}

export function Stat({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

/** Mass (share of the anchors' mass, %) against the committed threshold theta (%). Log-free, clamped scale. */
export function Meter({ massPct, thetaPct }: { massPct: number; thetaPct: number }) {
  const max = Math.max(thetaPct * 3, massPct * 1.15, 1e-9);
  const w = Math.min(100, (massPct / max) * 100);
  const t = (thetaPct / max) * 100;
  return (
    <div>
      <div className="meter" role="img" aria-label={`mass ${massPct}% against threshold ${thetaPct}%`}>
        <div className="fill" style={{ width: `${w}%` }} />
        <div className="theta" style={{ left: `calc(${t}% - 1px)` }} title={`theta = ${thetaPct} %`} />
      </div>
      <div className="meter-legend">
        <span>0</span>
        <span>θ = {thetaPct} % (threshold committed in the anchor set)</span>
        <span>{max.toFixed(max < 10 ? 1 : 0)} %</span>
      </div>
    </div>
  );
}

export function Verdict({ pay, title, why }: { pay: boolean | null; title?: string; why: ReactNode }) {
  const cls = pay === null ? "pending" : pay ? "pay" : "refuse";
  const icon = pay === null ? "…" : pay ? "✓" : "⛔";
  const word = title ?? (pay === null ? "NO PAYMENT YET" : pay ? "PAY" : "REFUSED");
  return (
    <div className={`verdict ${cls}`} role="status">
      <span className="icon" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="word">{word}</div>
        <div className="why">{why}</div>
      </div>
    </div>
  );
}

/** Small sparkline (dataviz: 2px line, recessive, no axes; the number next to it carries the value). */
export function Spark({ points, color, height = 36, width = 160 }: { points: number[]; color: string; height?: number; width?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points), min = Math.min(0, ...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 3 - ((p - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

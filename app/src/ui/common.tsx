import type { ReactNode } from "react";
import type { AgentRow } from "../core/model";
import { big, pctU, short } from "../lib/format";
import { onLink } from "../router";

// MOCK (dressing only): avatars are initials on a colour derived from the agent id. No image is fetched from
// any explorer. Listed in demo/SCREEN.md.
const AVATAR_COLOURS = ["#9cc3f2", "#efb796", "#93dcc0", "#ecd189", "#efb6cf", "#bbb5f3", "#b3dd95", "#f2adad"];
export function Avatar({ id, name, lg }: { id: string; name: string; lg?: boolean }) {
  const clean = name.replace(/^[a-z]+:\/\//, "").replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const initials = (clean.split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "#").toUpperCase();
  const bg = AVATAR_COLOURS[Number(BigInt(id) % BigInt(AVATAR_COLOURS.length))];
  return (
    <div className={`avatar${lg ? " lg" : ""}`} style={{ background: bg }} aria-hidden>
      {initials}
    </div>
  );
}

/** A big decimal string, scientific above 1e9: 1.5264 × 10^36 */
export function BigNum({ value }: { value: string | null }) {
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
    </>
  );
}

export function Link({ to, children, className, title, current }: { to: string; children: ReactNode; className?: string; title?: string; current?: boolean }) {
  return (
    <a href={to} onClick={onLink} className={className} title={title} aria-current={current ? "page" : undefined}>
      {children}
    </a>
  );
}

/** The one status word of an agent under the reader's policy, with its icon. */
export function StatusChip({ row }: { row: Pick<AgentRow, "passes" | "status" | "vetoTag" | "trust"> }) {
  if (row.status === "VETOED") return <span className="chip veto">⛔ Vetoed{row.vetoTag ? ` · ${row.vetoTag}` : ""}</span>;
  if (row.status && row.status !== "OK") return <span className="chip warn">◐ {row.status}</span>;
  if (row.passes) return <span className="chip pass">✓ Passes</span>;
  return <span className="chip refuse">✕ Refused</span>;
}

export const Mass = ({ wad }: { wad: string | null }) => <span className="num">{wad === null ? "—" : pctU(wad)}</span>;

export function Addr({ a }: { a: string | null | undefined }) {
  if (!a) return <span className="muted">—</span>;
  return (
    <span className="mono" title={a}>
      {short(a)}
    </span>
  );
}

/** Mass against the committed threshold θ, linear and clamped: the bar answers "over θ or not", nothing else. */
export function Meter({ massPct, thetaPct }: { massPct: number; thetaPct: number }) {
  const max = Math.max(thetaPct * 4, massPct * 1.15, 1e-9);
  return (
    <div>
      <div className="meter" role="img" aria-label={`leave-one-out mass ${massPct.toFixed(2)} % against θ ${thetaPct} %`}>
        <div className="fill" style={{ width: `${Math.min(100, (massPct / max) * 100)}%` }} />
        <div className="theta" style={{ left: `calc(${(thetaPct / max) * 100}% - 1px)` }} />
      </div>
      <div className="meter-l">
        <span>0</span>
        <span>θ = {thetaPct} %</span>
        <span>{max.toFixed(max < 10 ? 1 : 0)} %</span>
      </div>
    </div>
  );
}

/** Small sparkline (2px line, no axes; the number next to it carries the value). */
export function Spark({ points, color, height = 30, width = 120 }: { points: number[]; color: string; height?: number; width?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points), min = Math.min(0, ...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 3 - ((p - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** "RECORDED · recorded run … " — the one-line provenance of the numbers on a page. */
export function SourceLine({ status, text, detail }: { status: string; text: string; detail?: string }) {
  return (
    <div className="note" title={detail}>
      <span className="pill status-word">{status}</span> {text}
    </div>
  );
}

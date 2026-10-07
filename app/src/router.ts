// Minimal History-API router (no dependency). Netlify's SPA redirect (netlify.toml) serves index.html on every
// path; a static file of the build (e.g. a future public/mera/index.html) still wins over the redirect.
import { useSyncExternalStore, type MouseEvent } from "react";
import type { AgentNet, NetId } from "./core/model";

export type Page =
  | { page: "discover" }
  | { page: "leaderboard" }
  | { page: "agent"; net: AgentNet; id: string }
  | { page: "live" }
  | { page: "network" }
  | { page: "donate" }
  | { page: "notfound"; path: string };

export type Route = Page & { network: NetId; lens: string | null; tab: string | null };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function parseRoute(pathname: string, search: string): Route {
  const q = new URLSearchParams(search);
  const network: NetId = q.get("network") === "mainnet" ? "mainnet" : "testnet";
  const extra = { network, lens: q.get("anchors"), tab: q.get("tab") };
  // links of the chantier 07 screen (VIDEO-SHOTS, README): ?act=1 = mainnet, ?act=2 = the live demo
  if (q.get("act") === "2") return { page: "live", ...extra };
  if (q.get("act") === "1") return { page: "discover", ...extra, network: "mainnet" };
  const p = (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname).replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/index.html") return { page: "discover", ...extra };
  if (p === "/leaderboard") return { page: "leaderboard", ...extra };
  if (p === "/live") return { page: "live", ...extra };
  if (p === "/network") return { page: "network", ...extra };
  if (p === "/donate") return { page: "donate", ...extra };
  const m = /^\/agent\/(testnet|mainnet|demo)\/(\d+)$/.exec(p);
  if (m) {
    const net = m[1] as AgentNet;
    return { page: "agent", net, id: m[2], ...extra, network: net === "mainnet" ? "mainnet" : "testnet" };
  }
  return { page: "notfound", path: p, ...extra };
}

export function href(to: Partial<Route> & { page: Route["page"] }, cur?: Route): string {
  const network = to.network ?? cur?.network ?? "testnet";
  const q = new URLSearchParams();
  // live demo and donate carry no network; an agent page carries it in its path
  if (network === "mainnet" && to.page !== "agent" && to.page !== "live" && to.page !== "donate") q.set("network", "mainnet");
  const lens = to.lens !== undefined ? to.lens : cur?.lens;
  if (lens && network === "mainnet" && to.page !== "live" && to.page !== "donate") q.set("anchors", lens);
  if (to.page === "agent" && to.tab) q.set("tab", to.tab);
  const s = q.toString() ? `?${q}` : "";
  switch (to.page) {
    case "discover":
      return `${BASE}/${s}`;
    case "agent":
      return `${BASE}/agent/${(to as { net: string }).net}/${(to as { id: string }).id}${s}`;
    case "notfound":
      return `${BASE}/`;
    default:
      return `${BASE}/${to.page}${s}`;
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

export function navigate(url: string, replace = false) {
  if (url === location.pathname + location.search) return;
  (replace ? history.replaceState : history.pushState).call(history, null, "", url);
  window.scrollTo(0, 0);
  notify();
}

let cacheKey = "";
let cache: Route | null = null;
function snapshot(): Route {
  const k = location.pathname + location.search;
  if (k !== cacheKey || !cache) {
    cacheKey = k;
    cache = parseRoute(location.pathname, location.search);
  }
  return cache;
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    snapshot,
    snapshot,
  );
}

/** <a> that navigates without reloading (middle-click and ⌘-click keep the browser's behaviour). */
export function onLink(e: MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.currentTarget;
  if (a.target === "_blank" || a.origin !== location.origin) return;
  e.preventDefault();
  navigate(a.pathname + a.search);
}

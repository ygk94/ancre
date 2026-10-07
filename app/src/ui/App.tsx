import { useEffect, useRef, useState } from "react";
import { NETWORK_CHOICES } from "../config/networks";
import type { NetId } from "../core/model";
import { href, navigate, onLink, useRoute, type Route } from "../router";
import { useDataset } from "../sources/useDataset";
import { AgentPage } from "./AgentPage";
import { Link } from "./common";
import { Discover } from "./Discover";
import { Feed } from "./Feed";
import { Leaderboard } from "./Leaderboard";
import { Live } from "./Live";
import { Network } from "./Network";

export function App() {
  const route = useRoute();
  const withFeed = route.page === "discover" || route.page === "leaderboard" || route.page === "agent";
  const { ds, error } = useDataset(route.network, route.lens, withFeed);

  // old links of the chantier 07 screen (?act=1 / ?act=2): rewrite the address bar once
  useEffect(() => {
    if (new URLSearchParams(location.search).has("act")) navigate(href(route, route) + (route.page === "live" ? keepLiveParams() : ""), true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Header route={route} />
      {withFeed ? (
        <div className="shell">
          <aside className="feedcol" aria-label="Latest activity">
            <Feed network={route.network} ds={ds} />
          </aside>
          <main className="main">{page(route, ds, error)}</main>
        </div>
      ) : (
        <main className="main wide">{page(route, ds, error)}</main>
      )}
    </>
  );
}

const keepLiveParams = () => {
  const q = new URLSearchParams(location.search);
  q.delete("act");
  const s = q.toString();
  return s ? `?${s}` : "";
};

function page(route: Route, ds: ReturnType<typeof useDataset>["ds"], error: string | null) {
  switch (route.page) {
    case "discover":
      return <Discover route={route} ds={ds} error={error} />;
    case "leaderboard":
      return <Leaderboard route={route} ds={ds} error={error} />;
    case "agent":
      return <AgentPage route={route} ds={ds} error={error} />;
    case "live":
      return <Live />;
    case "network":
      return <Network route={route} />;
    case "donate":
      return (
        <div className="soonpage">
          <h1>Donate</h1>
          <p>Soon. Nothing to sign here yet: this page takes no wallet and sends no transaction.</p>
        </div>
      );
    default:
      return (
        <div className="soonpage">
          <h1>Not found</h1>
          <p>
            <span className="mono">{route.path}</span> is not a page of this screen. <Link to={href({ page: "discover" }, route)}>Back to Discover</Link>
          </p>
        </div>
      );
  }
}

function Header({ route }: { route: Route }) {
  const cur = (p: Route["page"]) => (route.page === p || (p === "discover" && route.page === "agent") ? "page" : undefined);
  return (
    <header className="top">
      <Link to={href({ page: "discover" }, route)} className="brand">
        <b>ANCRE</b>
        <span>anchored reputation for ERC-8004 agents</span>
      </Link>
      <nav className="nav" aria-label="Main">
        <a href={href({ page: "discover" }, route)} onClick={onLink} aria-current={cur("discover")}>
          Discover
        </a>
        <a href={href({ page: "leaderboard" }, route)} onClick={onLink} aria-current={cur("leaderboard")}>
          Leaderboard
        </a>
        <a href={href({ page: "network" }, route)} onClick={onLink} aria-current={cur("network")}>
          Network
        </a>
        <a href={href({ page: "live" }, route)} onClick={onLink} aria-current={cur("live")}>
          Live demo
        </a>
        <span className="soon" title="Soon: no wallet, no transaction on this screen yet" aria-disabled="true">
          Donate<span className="soon-tag">soon</span>
        </span>
      </nav>
      <div className="spacer" />
      {route.page !== "live" && <NetworkPicker route={route} />}
      <ThemeToggle />
    </header>
  );
}

function NetworkPicker({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const cur = NETWORK_CHOICES.find((n) => n.id === route.network)!;
  const choose = (id: NetId) => {
    setOpen(false);
    // an agent page belongs to one network: switching goes back to Discover on the other one
    const to = route.page === "agent" || route.page === "notfound" ? "discover" : route.page;
    navigate(href({ page: to as "discover", network: id, lens: null }, route));
  };
  return (
    <div className="netpick" ref={box}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`dot ${cur.state === "active" ? "live" : "preview"}`} />
        {cur.label}
        {cur.state === "preview" && <span className="soon-tag">preview</span>}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="netmenu" role="menu">
          {NETWORK_CHOICES.map((n) => (
            <button key={n.id} role="menuitemradio" aria-checked={n.id === route.network} disabled={n.state === "soon"} onClick={() => n.state !== "soon" && choose(n.id as NetId)}>
              <span className={`dot ${n.state === "active" ? "live" : n.state === "preview" ? "preview" : "off"}`} />
              <span>
                {n.label}
                {n.state !== "active" && <span className="soon-tag">{n.state}</span>}
                <small>
                  {n.state === "active"
                    ? "ANCRE's anchor set and its certificates"
                    : n.state === "preview"
                      ? "read by our reference solver · on-chain certification soon"
                      : "not indexed by ANCRE yet"}
                </small>
              </span>
            </button>
          ))}
          <a className="netmore" href={href({ page: "network" }, route)} onClick={(e) => (setOpen(false), onLink(e))}>
            Network details →
          </a>
        </div>
      )}
    </div>
  );
}

type Theme = "light" | "dark" | null;
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("ancre-theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}
function ThemeToggle() {
  const [t, setT] = useState<Theme>(readTheme);
  useEffect(() => {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    try {
      if (t) localStorage.setItem("ancre-theme", t);
      else localStorage.removeItem("ancre-theme");
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }, [t]);
  const sysDark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = t ? t === "dark" : sysDark;
  return (
    <button className="iconbtn" onClick={() => setT(dark ? "light" : "dark")} title={dark ? "Light theme" : "Dark theme"} aria-label="Toggle theme">
      {dark ? "☀" : "☾"}
    </button>
  );
}

import { renderToString as rts } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/router";
import { CertFacts, OnchainAgentCard, OnchainPayments, OnchainSetCard } from "../src/ui/Onchain";
import type { OnchainState } from "../src/core/onchain";

/** React's text separators (<!-- -->) removed, to match the rendered text */
const renderToString = (e: ReactElement) => rts(e).replaceAll("<!-- -->", "");

const route = parseRoute("/", "?network=mainnet");
const nameOf = (id: string) => (id === "182" ? "Eve-8004" : `Agent #${id}`);

describe("Certified on-chain panels (mainnet)", () => {
  it("before any read: dashes, explorer links, never a number from the solver or the run", () => {
    const html = renderToString(<OnchainSetCard route={route} nameOf={nameOf} />);
    expect(html).toContain("Certified on-chain");
    expect(html).toContain("live · minimal run 2026-10-10");
    expect(html).toContain("https://monadscan.com/address/0x0Da1579233E7Cb07a174986D059D59B1F293b30E");
    expect(html).toContain("https://monadscan.com/address/0x52f361A14A49fAB267703203f833b997B9cF5Dc0");
    expect(html).toContain("https://monadscan.com/tx/0xa099331e10ae31327e54d53b78a3c24277e140f235fe2373f33946d06853a60c");
    expect(html).toContain("reading the contract");
    expect(html).toContain("RECORDED");
    // the run's recorded mass (5.19 %) is not shown as the current on-chain value
    expect(html).not.toContain("5.18");
    expect(html).not.toContain("5.19");
    expect(html).not.toMatch(/preview/i);
    expect(html).not.toMatch(/fraud|scam|attacker/i);
  });

  it("the agent card and payments carry D47 and link the slash", () => {
    const card = renderToString(<OnchainAgentCard id="10330" />);
    expect(card).toContain("D47");
    expect(card).toContain("Mass, leave-one-out");
    const pay = renderToString(<OnchainPayments id="10330" />);
    expect(pay).toContain("https://monadscan.com/tx/0x6be5453d4e36237980d30243219c6256c0be2763c46e36b3286814d14c33e08c");
    expect(pay).toContain("1 block, 332 ms later (measured on mainnet)");
    expect(pay).toContain("nothing broadcast");
  });

  const st = (head: number, status: string): OnchainState => ({
    rpc: "https://rpc.monad.xyz",
    head: { number: head, timestamp: 1791635450 + Math.round((head - 112182889) * 0.3) },
    cert: { number: 112182889, timestamp: 1791635450 },
    maxAge: 288000,
    thetaPct: 1,
    paused: false,
    agents: {
      "10330": {
        agentId: "10330",
        assess: { status, trust: "1", trustRobust: "0", trustLow: "0", distrust: "0", distrustUp: "7", e: "7", certBlock: 112182889, vetoCount: 1, triggerTag: null, passesPolicy: false },
        wallet: "0xbd2AeDcAb8FCBa9Ee0c036110ac168bbC525DAE8",
        decide: "ANCRE_STATUS",
      },
    },
    readAt: "2026-10-10T13:10:00.000Z",
    errors: [],
  });

  it("certificate facts: fresh, then STALE after maxAge, with the certificate tx", () => {
    const fresh = renderToString(<CertFacts st={st(112190678, "VETOED")} />);
    expect(fresh).toContain("https://monadscan.com/tx/0x6a2c04418319e814c96f2346a4ddc263f53b47df388ce95d78666c5c9855b959");
    expect(fresh).toContain("fresh");
    expect(fresh).toContain("112,470,889");
    expect(fresh).toContain("7,789");
    const stale = renderToString(<CertFacts st={st(112470890, "STALE")} />);
    expect(stale).toContain("STALE since block 112,470,890");
  });

  it("RPC failed: every field is a dash", () => {
    const html = renderToString(<CertFacts st={{ ...st(1, "OK"), head: null, cert: null, maxAge: null, agents: {} }} />);
    expect(html.match(/—/g)!.length).toBeGreaterThanOrEqual(5);
  });
});

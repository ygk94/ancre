import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import m182 from "../src/data/funders-182.json";
import { FundersPanel, fundersMeasure } from "../src/ui/Funders";

describe("Who funded the raters? panel", () => {
  it("exists for Eve-8004 on mainnet only", () => {
    expect(fundersMeasure("mainnet", "182")).toBe(m182);
    expect(fundersMeasure("testnet", "182")).toBeNull();
    expect(fundersMeasure("mainnet", "9")).toBeNull();
  });
  it("names its source and date, states facts, and says ANCRE does not use them", () => {
    const html = renderToString(<FundersPanel m={m182} owner={m182.owner} />);
    expect(html).toContain("Who funded the raters?");
    expect(html).toContain("Alchemy Transfers API");
    expect(html).toContain("MEASURED");
    expect(html).toContain(m182.measuredAt.slice(0, 10));
    expect(html).toContain("does not use them");
    expect(html).toContain("Re-checking"); // the live re-check starts after mount
    expect(html).not.toMatch(/fraud|scam|sybil attacker/i);
  });
});

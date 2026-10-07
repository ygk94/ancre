// What the screen shows about an agent, whatever the network. Pure types and texts: no I/O.
// Every value carries the source of the dataset it comes from (Dataset.source); a missing value is null and
// renders "—", never a placeholder number.

export type NetId = "testnet" | "mainnet";
/** URL segment of an agent page: "demo" = an agent of a recorded run on a FORK of the testnet. Its id exists on
 *  the real testnet too, but it is another agent there (AM-07bis.1): the two are never mixed. */
export type AgentNet = NetId | "demo";

export type Status = "OK" | "NO_CERT" | "STALE" | "TRANSFERRED" | "VETOED" | "REGISTRY_CHANGED";

export type Reach =
  | { kind: "anchors"; count: number } // rated (positively) by `count` of your anchors
  | { kind: "hops"; hops: number; via: string[] } // reached through trusted agents: anchors -> via -> this agent
  | { kind: "unreachable" };

export type AgentRow = {
  net: AgentNet;
  id: string;
  name: string;
  role?: string;
  /** contract status from assess() (testnet), null when no contract is deployed (mainnet preview) */
  status: Status | null;
  passes: boolean; // passesAnchorPolicy (testnet: the contract's answer; mainnet: the reference solver's)
  why: string; // one short line: why it passes or not
  trust: string; // raw mass Σλt, WAD
  trustLow: string; // leave-one-out mass, lower bound (what the policy compares with θ), WAD
  distrust: string; // WAD
  e: string | null; // error bound of the certificate, WAD
  certBlock: number | null;
  vetoTag: string | null;
  reach: Reach;
  explorer: { ratings: number; raters: number | null; naive: string | null } | null;
  owner: string | null;
  wallet: string | null;
};

export type Policy = {
  setId: string | null;
  anchors: { address: string; label: string }[];
  m: number;
  thetaPct: number;
  rho: string;
  alpha: string | null;
  level: string; // certification level, or "reference solver (not on-chain)"
  onchain: boolean; // true only when the numbers are read from a deployed ANCRE contract on the real chain
};

export type Why =
  | "anchor"
  | "anchor_negative"
  | "hop"
  | "hop_negative"
  | "unreachable"
  | "out_of_bounds"
  | "superseded"
  | "outside"
  | "measurement"
  | "controller"
  | "zero_weight"
  | "combined";

/** D49: one rating (or a group of identical-reason ratings) and why it counts or not. */
export type ReviewGroup = {
  why: Why;
  tag: string;
  count: number;
  via: string[]; // trusted agents the rating is carried by (hop), else []
  author: string | null; // a rater address or label (sample when count > 1)
  value: string | null; // display value of the rating (single rating only)
  w: number | null; // normalised weight on the 1e-4 grid, when an edge exists
  contribution: string | null; // WAD added to the raw mass (negative: distrust), null when not computed
  block: number | null;
};

export const COUNTS = new Set<Why>(["anchor", "anchor_negative", "hop", "hop_negative"]);

export function whyText(g: ReviewGroup, name: (id: string) => string): string {
  const via = g.via.map(name).join(", ");
  switch (g.why) {
    case "anchor":
      return "your anchor rated it: counts directly";
    case "anchor_negative":
      return "your anchor slashed it: veto";
    case "hop":
      return `carried by ${via}, trusted from your anchors: counts one hop further`;
    case "hop_negative":
      return `slashed by ${via}, trusted from your anchors: distrust`;
    case "unreachable":
      return "counts for 0: its author is not reachable from your anchors";
    case "out_of_bounds":
      return "rejected: value outside the tag's bounds (never capped)";
    case "superseded":
      return "replaced by a later rating from the same rater, same tag";
    case "outside":
      return "no edge: this tag is not in the anchor set's schema";
    case "measurement":
      return "no edge: a measurement tag, not an endorsement (D15)";
    case "controller":
      return "rejected: its author controls this agent";
    case "zero_weight":
      return "no edge: neutral value (weight 0)";
    case "combined":
      return "folded: another tag of the same rater decides (the negative one dominates)";
  }
}

export function reachText(r: Reach, name: (id: string) => string): string {
  if (r.kind === "anchors") return `${r.count} anchor${r.count === 1 ? "" : "s"}`;
  if (r.kind === "hops") return `${r.hops} hops, via ${r.via.map(name).join(", ")}`;
  return "unreachable";
}

/** One link of a trust path (D50): who passes mass to whom. */
export type PathNode = { kind: "anchor" | "agent"; id: string; label: string; mass: string | null };

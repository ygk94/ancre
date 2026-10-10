// Endpoints per network. Act 2 contract addresses come from the run header written by chantier 06, never from
// here; switching fork -> testnet is a URL change only. URLs are overridable with VITE_* (no key in the code).
const env = import.meta.env;

export const NETWORKS = {
  // chantier 06 `node fork.ts`: anvil fork of Monad testnet on :8549 (HTTP and WebSocket on the same port)
  fork: {
    http: env.VITE_FORK_RPC ?? "http://127.0.0.1:8549",
    ws: env.VITE_FORK_WS ?? "ws://127.0.0.1:8549",
  },
  testnet: {
    http: env.VITE_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz", // 50 rps (CLAUDE.md §8)
    ws: env.VITE_TESTNET_WSS ?? "wss://testnet-rpc.monad.xyz",
    // ERC-8004 v2.0.0 registries on Monad testnet 10143 (CLAUDE.md §3, getVersion() = 2.0.0 checked 27/09)
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  mainnet: {
    http: env.VITE_MAINNET_RPC ?? "https://rpc.monad.xyz", // public, 25 rps, no key (CLAUDE.md §8)
    ws: env.VITE_MAINNET_WSS ?? "wss://rpc.monad.xyz",
    // ERC-8004 v2.0.0 registries on Monad 143 (CLAUDE.md §3, verified 27/09)
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
} as const;

/** The network selector. Testnet: where ANCRE's full act 2 runs. Mainnet: ANCRE deployed by the minimal run of
 *  10/10 (demo anchor set, certificates read on-chain by this screen, no continuous recertification), and the
 *  whole registry read by the reference solver (computed, not certified). Ethereum: soon (not indexed by us). */
export type NetworkChoice = { id: string; label: string; chainId: number; state: "active" | "soon"; tag: string | null; blurb: string };
export const NETWORK_CHOICES: readonly NetworkChoice[] = [
  { id: "testnet", label: "Monad testnet", chainId: 10143, state: "active", tag: null, blurb: "ANCRE's anchor set and its certificates" },
  {
    id: "mainnet",
    label: "Monad mainnet",
    chainId: 143,
    state: "active",
    tag: "live · minimal run 10/10",
    blurb: "ANCRE deployed: certificate read on-chain · whole registry: reference solver",
  },
  { id: "ethereum", label: "Ethereum", chainId: 1, state: "soon", tag: null, blurb: "not indexed by ANCRE yet" },
];

/** monadscan.com, the mainnet explorer that demo/JUDGES.md links: address, tx and block pages. */
export const MONADSCAN = "https://monadscan.com";
export const monadscan = (kind: "address" | "tx" | "block", v: string | number) => `${MONADSCAN}/${kind}/${v}`;

export const chainIdOf = (n: "testnet" | "mainnet") => (n === "mainnet" ? 143 : 10143);

/** "view on 8004scan" (URL scheme read on 8004scan.io on 07/10: /agents/monad/182, testnet subdomain). */
export const scanUrl = (n: "testnet" | "mainnet", id: string) =>
  n === "mainnet" ? `https://8004scan.io/agents/monad/${id}` : `https://testnet.8004scan.io/agents/monad-testnet/${id}`;

export const ENVIO_GRAPHQL =
  env.VITE_ENVIO_GRAPHQL ?? "https://indexer.dev.hyperindex.xyz/38cf597/v1/graphql"; // indexer/SCHEMA.md

/** Where to read a run's chain. The header carries a URL on the testnet only ("local" on a fork: chantier 06
 *  does not publish its port); a frozen run's anvil is gone once the run ends. */
export function endpointsForRun(network: { mode: string; rpc: string }): { http: string; ws: string } | null {
  if (network.mode === "testnet") return { http: /^https?:\/\//.test(network.rpc) ? network.rpc : NETWORKS.testnet.http, ws: NETWORKS.testnet.ws };
  if (network.mode === "fork") return NETWORKS.fork;
  return null;
}

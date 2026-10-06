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
  },
  mainnet: {
    // ERC-8004 v2.0.0 registries on Monad 143 (CLAUDE.md §3, verified 27/09)
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
} as const;

export const ENVIO_GRAPHQL =
  env.VITE_ENVIO_GRAPHQL ?? "https://indexer.dev.hyperindex.xyz/433cc83/v1/graphql"; // indexer/SCHEMA.md

/** Where to read a run's chain. The header carries a URL on the testnet only ("local" on a fork: chantier 06
 *  does not publish its port); a frozen run's anvil is gone once the run ends. */
export function endpointsForRun(network: { mode: string; rpc: string }): { http: string; ws: string } | null {
  if (network.mode === "testnet") return { http: /^https?:\/\//.test(network.rpc) ? network.rpc : NETWORKS.testnet.http, ws: NETWORKS.testnet.ws };
  if (network.mode === "fork") return NETWORKS.fork;
  return null;
}

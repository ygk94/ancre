// One config per network. Switching fork -> testnet is a URL change only (the contract addresses of act 2
// come from the run header written by chantier 06, never from here).
import { defineChain, type Chain } from "viem";

export type NetworkId = "fork" | "testnet" | "mainnet";

export type NetworkConfig = {
  id: NetworkId;
  label: string;
  chainId: number;
  http: string;
  wss?: string;
  readOnly: boolean;
  explorerTx?: (hash: string) => string;
  // ERC-8004 v2.0.0 registries (CLAUDE.md §3, verified 27/09)
  identity: `0x${string}`;
  reputation: `0x${string}`;
};

const env = import.meta.env;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  fork: {
    id: "fork",
    label: "anvil fork of Monad testnet",
    chainId: 10143,
    http: env.VITE_FORK_RPC ?? "http://127.0.0.1:8549", // chantier 06: `node fork.ts` (port 8549)
    readOnly: true,
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  testnet: {
    id: "testnet",
    label: "Monad testnet",
    chainId: 10143,
    http: env.VITE_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz", // 50 rps (CLAUDE.md §8)
    wss: env.VITE_TESTNET_WSS ?? "wss://testnet-rpc.monad.xyz",
    readOnly: true,
    explorerTx: (h) => `https://testnet.monadvision.com/tx/${h}`,
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  mainnet: {
    id: "mainnet",
    label: "Monad mainnet",
    chainId: 143,
    http: env.VITE_MAINNET_RPC ?? "https://rpc.monad.xyz", // 25 rps: never poll assess in a loop
    wss: env.VITE_MAINNET_WSS ?? "wss://rpc.monad.xyz",
    readOnly: true,
    explorerTx: (h) => `https://monadvision.com/tx/${h}`,
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
};

export const ENVIO_GRAPHQL =
  env.VITE_ENVIO_GRAPHQL ?? "https://indexer.dev.hyperindex.xyz/433cc83/v1/graphql"; // indexer/SCHEMA.md

// viem ships blockTime 400 for Monad; 302 ms was measured on 1 000 blocks (CLAUDE.md §3, 27/09).
export function chainOf(n: NetworkConfig): Chain {
  return defineChain({
    id: n.chainId,
    name: n.label,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [n.http], webSocket: n.wss ? [n.wss] : undefined } },
    blockTime: 302,
  });
}

export function networkForRun(mode: string, chainId: number): NetworkConfig {
  if (mode === "testnet") return NETWORKS.testnet;
  if (chainId === 143) return NETWORKS.mainnet;
  return NETWORKS.fork;
}

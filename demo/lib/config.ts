// Act 2 configuration: network constants, demo set policy, farm size. Every number here is either MEASURED (dated)
// or a demo choice explained in docs/chantiers/journal/06.md.
import { getAddress } from "viem";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const DEMO = dirname(dirname(fileURLToPath(import.meta.url)));
export const ROOT = dirname(DEMO);
export const OUT = join(DEMO, "out");
export const CONTRACTS = join(ROOT, "contracts");
export const SOLVER = join(ROOT, "solver");
export const FOUNDRY = join(process.env.HOME ?? "", ".foundry", "bin");
export const PYTHON = process.env.ANCRE_PYTHON ?? join(SOLVER, ".venv", "bin", "python");

/** Monad testnet 10143: the real ERC-8004 v2.0.0 registries (cast getVersion, 27/09 and 06/10). */
export const TESTNET = {
  chainId: 10143,
  network: "eip155:10143",
  rpc: "https://testnet-rpc.monad.xyz",
  identity: getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e"),
  reputation: getAddress("0x8004B663056A597Dffe9eCcC1965A193B7388713"),
  usdc: getAddress("0x534b2f3A21130d7a60830c2Df862319e593943A3"), // FiatToken v2.2, domain "USDC"/"2" (chantier 05)
  facilitatorUrl: "https://x402-facilitator.molandak.org",
  facilitatorSigner: getAddress("0x7f6a2850669202519f0FE8aa912451238820Db86"), // MESURÉ 01/10 (chantier 05)
} as const;

/** Monad mainnet 143 (D40, D59): the real ERC-8004 v2.0.0 registries (CLAUDE.md §3, getVersion 2.0.0 re-read on a fork
 * of block 112 172 900, 10/10), native USDC (FiatToken, domain "USDC"/"2", re-read 10/10), the same facilitator. */
export const MAINNET = {
  chainId: 143,
  network: "eip155:143",
  rpc: "https://rpc.monad.xyz", // sends and reads of the real run (25 rps)
  archiveRpc: "https://rpc1.monad.xyz", // fork source: accepts the whole history (MEASURED 27/09)
  identity: getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"),
  reputation: getAddress("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"),
  usdc: getAddress("0x754704Bc059F8C67012fEd69BC8A327a5aafb603"),
  facilitatorUrl: "https://x402-facilitator.molandak.org",
  // GET /supported, 10/10 11:40 UTC: exact + upto on eip155:143, signer below (94 344 MON on mainnet, same day)
  facilitatorSigner: getAddress("0x7f6a2850669202519f0FE8aa912451238820Db86"),
} as const;

export type Network = {
  chainId: number; network: string; rpc: string; archiveRpc?: string; identity: `0x${string}`; reputation: `0x${string}`;
  usdc: `0x${string}`; facilitatorUrl: string; facilitatorSigner: `0x${string}`;
};

/** The network every module reads (live ES binding): the testnet unless run.ts selects the mainnet. */
export let NET: Network = TESTNET;
export function useNetwork(n: "testnet" | "mainnet") {
  NET = n === "mainnet" ? MAINNET : TESTNET;
}

export const FORK_PORT = 8549;

/** Demo set (D39 policy committed in the setId). */
export const SET = {
  name: "ancre-demo-act2",
  alphaN: 1, // alpha = 1/3 (D2)
  alphaD: 3,
  filterTags: ["review", "slash", "vouch"], // endorsement tags of solver/schema_reference.json
  schemaPath: join(SOLVER, "schema_reference.json"),
  minAnchors: 2, // leave-one-out m = 2 (D8)
  vetoQuorum: 1,
  vetoMax: -1,
  // maxAge = minRefresh (MUSTDO 14g c): 288 000 blocks ~ 24 h at the MEASURED 0.302 s
  maxAge: 288_000,
  minRefresh: 288_000,
  slackRefresh: 0,
  theta: 10n ** 16n, // 0.01 WAD: lowest honest mass MEASURED on the fork (06/10) is the second hop, 2.30 %; farm 0
  rhoN: 1,
  rhoD: 2,
  eLowMax: 10n ** 16n,
  strictTransfer: true,
  registryVerified: true, // D32: every committed edge re-read at submission (scene 6)
  ownerFallback: false, // D44 off
} as const;

/** Farm and payment sizes: visibly small, labelled "demo". */
export const FARM_SIZE = Number(process.env.ANCRE_FARM_SIZE ?? 10); // farm agents rating each other, + 1 target
export const FARM_PAYMENTS = Number(process.env.ANCRE_FARM_PAYMENTS ?? 5); // scene 3 (D45): payments inside the farm
export const PAY_AMOUNT = 10_000n; // 0.01 USDC per payment to a provider (payer maxPerPayment)
export const FARM_PAY_AMOUNT = 1_000n; // 0.001 USDC per farm payment
export const PAYER_DEPOSIT = 100_000n; // 0.1 USDC
export const FARM_USDC = 2_000n; // USDC given to each paying farm wallet

/** Feedback values (human units of the schema). The farm uses the schema maximum, never 1e38. */
export const VALUES = {
  anchorVouch: [80n, 70n], // vouch 0..100
  farmVouch: 100n, // the schema maximum: enough to dwarf honest averages
  compromisedVouch: 100n,
  slash: -100n, // slash -100..0
  thirdPartyReview: 1n, // review -1..1
  hopVouch: 100n, // scene 7: the trusted provider fully vouches for the second-hop agent
} as const;

export const TAG2 = "demo";

/** Gas limit = ceil(estimate x 1.10) + 5 000: on Monad the LIMIT is billed (CLAUDE.md §7). */
export const GAS_MARGIN_BPS = 1_000n;
export const GAS_MARGIN_ABS = 5_000n;

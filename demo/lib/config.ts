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
  theta: 2n * 10n ** 16n, // 0.02 WAD: honest providers measured at 3.46 % and 3.95 % on the fork (06/10), farm 0
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
} as const;

export const TAG2 = "demo";

/** Gas limit = ceil(estimate x 1.10) + 5 000: on Monad the LIMIT is billed (CLAUDE.md §7). */
export const GAS_MARGIN_BPS = 1_000n;
export const GAS_MARGIN_ABS = 5_000n;

// ABIs of the ERC-8004 v2.0.0 registries (selectors checked against the deployed bytecode, design-payeur-et-reseau
// §3.3) and of USDC. ANCRE and the payer come from the forge artifacts (contracts/out), never retyped.
import { erc20Abi, parseAbi } from "viem";

export const identityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getVersion() view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export const reputationAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)",
  "function getVersion() view returns (string)",
  // indexer/config.yaml (chantier 03)
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

/** FiatToken v2.2: ERC-20 plus the bytes-signature EIP-3009 entry point x402 settles with. */
export const usdcAbi = [...erc20Abi, ...parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
])] as const;

/** AnchoredReputation.Status and TrustGatedPayer.Reason, in declaration order. */
export const STATUSES = ["OK", "NO_CERT", "STALE", "TRANSFERRED", "VETOED", "REGISTRY_CHANGED"] as const;
export const REASONS = ["OK", "PAUSED", "BAD_FORMAT", "BAD_KIND", "DIGEST_MISMATCH", "OVER_LIMIT", "NO_WALLET",
  "WALLET_MISMATCH", "BAD_OPERATOR_SIG", "ANCRE_STATUS", "UNTRUSTED"] as const;

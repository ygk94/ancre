#!/usr/bin/env node
// Demo setup, on a FORK ONLY (it starts its own `anvil --network monad` fork of the Monad testnet; there is no
// live mode). It chains, with the real ERC-8004 v2.0.0 registries of the fork:
//   1. register(agentURI) from the human's wallet (the agent's owner);
//   2. the Agent Wallet address: simulated by a fresh key whose AgentWalletSet message we sign;
//   3. setAgentWallet(agentId, wallet, deadline <= 5 min, EIP-712 AgentWalletSet signature of the new wallet);
//   4. AnchoredReputation + a demo anchor set (the payer needs a registered setId), then TrustGatedPayer with
//      operator = Agent Wallet, owner = treasury = the human;
//   5. a USDC deposit from the human to the payer;
// then checks the conditions of the guarantee with the plugin's own `payer status` flow.
//   node scripts/setup-fork.mjs [--uri ipfs://…] [--fund 0.1]
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { bytesToHex, createPublicClient, createWalletClient, decodeEventLog, erc20Abi, getAddress, http, keccak256, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseUsdc, fmtUsdc } from "../dist/lib/config.js";
import { statusFlow } from "../dist/lib/flows.js";
import { CHAIN_ID, CONTRACTS, NETWORK, PERMIT2, UPTO, USDC, dealUsdc, startAnvil } from "./local.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const IDENTITY = getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e"); // testnet (MESURÉ 27/09)
const REPUTATION = getAddress("0x8004B663056A597Dffe9eCcC1965A193B7388713");
const identityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
const artifact = (p) => JSON.parse(readFileSync(`${CONTRACTS}out/${p}`, "utf8"));
const steps = [];
const step = (name, data) => { steps.push({ step: name, ...data }); console.log(`✓ ${name}`, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))); };

async function main() {
  const fork = await startAnvil(flag("port", "8548"));
  try {
    const pub = createPublicClient({ transport: http(fork.rpc) });
    if ((await pub.getChainId()) !== CHAIN_ID) throw new Error("not the testnet fork");
    const human = privateKeyToAccount(bytesToHex(randomBytes(32))); // the principal's own wallet (fork key)
    const agentWallet = privateKeyToAccount(bytesToHex(randomBytes(32))); // stands in for the mm server-wallet
    await pub.request({ method: "anvil_setBalance", params: [human.address, toHex(10n ** 20n)] }); // fork MON for gas
    const hw = createWalletClient({ account: human, transport: http(fork.rpc) });
    const send = async (label, req) => {
      const hash = await hw.writeContract({ ...req, chain: null });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error(`${label} reverted`);
      return r;
    };

    // 1. register(agentURI) from the human's wallet
    const uri = flag("uri", "ipfs://ancre-demo/client-agent.json");
    const r1 = await send("register", { address: IDENTITY, abi: identityAbi, functionName: "register", args: [uri], gas: 400_000n });
    const ev = r1.logs.map((l) => { try { return decodeEventLog({ abi: identityAbi, ...l }); } catch { return undefined; } }).find((e) => e?.eventName === "Registered");
    const agentId = ev.args.agentId;
    step("1. register(agentURI) by the human", { agentId, owner: human.address, uri, gasUsed: r1.gasUsed,
      walletAfterRegister: await pub.readContract({ address: IDENTITY, abi: identityAbi, functionName: "getAgentWallet", args: [agentId] }) });

    // 2-3. the Agent Wallet signs AgentWalletSet; the owner submits setAgentWallet
    const now = (await pub.getBlock()).timestamp;
    const deadline = now + 240n; // <= 5 min (MAX_DEADLINE_DELAY of the registry)
    const signature = await agentWallet.signTypedData({
      domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: CHAIN_ID, verifyingContract: IDENTITY },
      types: { AgentWalletSet: [
        { name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" },
      ] },
      primaryType: "AgentWalletSet",
      message: { agentId, newWallet: agentWallet.address, owner: human.address, deadline },
    });
    step("2. Agent Wallet address (simulated: a fresh key that signs AgentWalletSet)", { agentWallet: agentWallet.address });
    const r3 = await send("setAgentWallet", { address: IDENTITY, abi: identityAbi, functionName: "setAgentWallet", args: [agentId, agentWallet.address, deadline, signature], gas: 200_000n });
    const w = await pub.readContract({ address: IDENTITY, abi: identityAbi, functionName: "getAgentWallet", args: [agentId] });
    if (getAddress(w) !== agentWallet.address) throw new Error("agentWallet not set");
    step("3. setAgentWallet(agentId, wallet, deadline, sig)", { deadline, getAgentWallet: w, gasUsed: r3.gasUsed });

    // 4. ANCRE (fork) + a demo anchor set, then the payer
    const ar = artifact("AnchoredReputation.sol/AnchoredReputation.json");
    const arHash = await hw.deployContract({ abi: ar.abi, bytecode: ar.bytecode.object, args: [IDENTITY, REPUTATION], gas: 12_000_000n, chain: null });
    const ancre = getAddress((await pub.waitForTransactionReceipt({ hash: arHash })).contractAddress);
    const anchors = [privateKeyToAccount(bytesToHex(randomBytes(32))).address, privateKeyToAccount(bytesToHex(randomBytes(32))).address]
      .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    const tags = [
      { tag: "review", min: -(10n ** 18n), neutral: 0n, max: 10n ** 18n, kind: 0 },
      { tag: "slash", min: -100n * 10n ** 18n, neutral: 0n, max: 0n, kind: 0 },
      { tag: "vouch", min: 0n, neutral: 0n, max: 100n * 10n ** 18n, kind: 0 },
      { tag: "veto", min: -100n * 10n ** 18n, neutral: 0n, max: 0n, kind: 0 },
    ].sort((a, b) => (BigInt(keccak256(toHex(a.tag))) < BigInt(keccak256(toHex(b.tag))) ? -1 : 1));
    const params = {
      anchors, lambdas: [5n * 10n ** 17n, 5n * 10n ** 17n], alphaN: 1, alphaD: 3, tagSchemaHash: keccak256(toHex("ANCRE demo schema v0")), tags,
      policy: { theta: 10n ** 17n, rhoN: 1, rhoD: 2, minAnchors: 2, vetoQuorum: 1, vetoMax: -1, maxAge: 100_000n, minRefresh: 50n,
        slackRefresh: 0n, eLowMax: 10n ** 16n, strictTransfer: true, registryVerified: true, ownerFallback: false, submitters: [] },
    };
    const setId = await pub.readContract({ address: ancre, abi: ar.abi, functionName: "computeSetId", args: [params] });
    await send("registerAnchorSet", { address: ancre, abi: ar.abi, functionName: "registerAnchorSet", args: [params], gas: 1_000_000n });
    step("4a. AnchoredReputation + demo anchor set (fork)", { ancre, setId, anchors });

    const tp = artifact("TrustGatedPayer.sol/TrustGatedPayer.json");
    const maxPer = parseUsdc(flag("max", "0.01"));
    const tpHash = await hw.deployContract({ abi: tp.abi, bytecode: tp.bytecode.object, gas: 3_000_000n, chain: null,
      args: [USDC, PERMIT2, UPTO, ancre, human.address, human.address, agentWallet.address, setId, maxPer] });
    const tpr = await pub.waitForTransactionReceipt({ hash: tpHash });
    const payer = getAddress(tpr.contractAddress);
    step("4b. TrustGatedPayer (operator = Agent Wallet, owner = treasury = human)", { payer, gasUsed: tpr.gasUsed, maxPerPaymentUsdc: fmtUsdc(maxPer) });

    // 5. USDC deposit from the human
    const fund = parseUsdc(flag("fund", "0.1"));
    await dealUsdc(pub, human.address, 1_000_000n); // fork only: the human's test USDC
    const r5 = await send("fund", { address: USDC, abi: erc20Abi, functionName: "transfer", args: [payer, fund], gas: 110_000n });
    step("5. USDC.transfer(payer) by the human", { amountUsdc: fmtUsdc(fund), gasUsed: r5.gasUsed });

    // the conditions of the guarantee, through the plugin's own status flow
    const cfg = { chainId: CHAIN_ID, network: NETWORK, usdc: USDC, payer };
    // the wallet mode is unknown on a fork (it is read from the real mm wallet state): reported as "unchecked"
    const s = await statusFlow({ readContract: (a) => pub.readContract(a) }, cfg, agentWallet.address, undefined);
    step("check: mm ancre payer status (as the Agent Wallet; server-wallet mode unchecked on a fork)", { balanceUsdc: s.balanceUsdc, operators: s.operators, owner: s.owner, treasury: s.treasury, guarantee: s.guarantee });
    const ok = s.guarantee.filter((g) => g.ok !== null).every((g) => g.ok) && s.balanceUsdc === fmtUsdc(fund);
    console.log(`\nSETUP ${ok ? "PASS" : "FAIL"}  (human ${human.address}, Agent Wallet ${agentWallet.address}, agent #${agentId}, payer ${payer})`);
    if (!ok) process.exitCode = 1;
  } finally {
    fork.stop();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

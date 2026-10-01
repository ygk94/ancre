import { type Address, encodeFunctionData, erc20Abi, getAddress, type Hex, recoverTypedDataAddress, zeroAddress } from "viem";
import { type Config, fmtUsdc } from "./config.js";
import {
  ancrePaymentTypedData,
  type Authorization,
  encodeExactBlob,
  normalizeSignature,
  usdcAuthorizationDigest,
} from "./payer.js";
import { ancreAbi, payerAbi } from "./payerAbi.js";
import { afterFailure, type Assessment, describe, type Verdict } from "./verdict.js";
import type { Journal } from "./journal.js";
import {
  buildPaymentPayload,
  decodePaymentResponse,
  encodeB64Json,
  H_SIGNATURE,
  newAuthorization,
  parsePaymentRequired,
  type PaymentRequired,
  type PaymentRequirements,
  resolveAgentId,
  selectOffer,
  type SettleResponse,
} from "./x402.js";

/** Everything a flow touches outside itself; the commands inject the host's, the tests inject stubs. */
export type Deps = {
  /** viem PublicClient.readContract (ctx.publicClient(chainId) in the host) */
  readContract: (args: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
  fetch: typeof fetch;
  nowSec: () => number;
  random32: () => Hex;
  /** EIP-712 signature through ctx.walletExecutor (policy, MFA): returns the signature or throws */
  signTypedData?: (typedData: ReturnType<typeof ancrePaymentTypedData>, summary: string, details: Record<string, string>) => Promise<Hex>;
  /** transaction through ctx.walletExecutor */
  sendTransaction?: (tx: { to: Address; data: Hex; value: bigint; gas: bigint }, summary: string) => Promise<{ hash?: Hex; status: string }>;
  signal?: AbortSignal;
  /** every refusal and payment is journaled (D47, for the demo screen) */
  journal?: Journal;
};

export class FlowError extends Error {
  constructor(readonly code: string, message: string, readonly hint: string) {
    super(message);
  }
}

const identityAbi = [
  { type: "function", name: "getAgentWallet", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

const reputationAbi = [
  { type: "function", name: "getClients", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address[]" }] },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

export const read = <T>(d: Pick<Deps, "readContract">, address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
  d.readContract({ address, abi, functionName, args }).catch((e: unknown) => {
    throw new FlowError("ANCRE_RPC_ERROR", `${functionName}() failed on ${address}: ${(e as Error).message ?? String(e)}`, "Check --payer and --chain-id");
  }) as Promise<T>;

async function decideFor(d: Pick<Deps, "readContract">, cfg: Config, agentId: bigint, to: Address, value: bigint): Promise<Verdict> {
  const [reason, a] = await read<[number, Assessment]>(d, cfg.payer, payerAbi, "decide", [agentId, to, value]);
  return describe(Number(reason), a, agentId, to);
}

// ------------------------------------------------------------------ check
export type CheckResult = Verdict & {
  amount: string;
  naive?: { clients: number; count: string; summaryValue: string; summaryValueDecimals: number; note: string };
};

export async function checkFlow(d: Deps, cfg: Config, agentId: bigint, amount: bigint, naive: boolean): Promise<CheckResult> {
  const identity = await read<Address>(d, cfg.payer, payerAbi, "identity");
  const wallet = await read<Address>(d, identity, identityAbi, "getAgentWallet", [agentId]).catch(() => zeroAddress);
  const v = await decideFor(d, cfg, agentId, wallet, amount);
  const out: CheckResult = { ...v, amount: fmtUsdc(amount) };
  if (naive) {
    const ancre = await read<Address>(d, cfg.payer, payerAbi, "ancre");
    const reputation = await read<Address>(d, ancre, ancreAbi, "reputation");
    const clients = await read<Address[]>(d, reputation, reputationAbi, "getClients", [agentId]);
    // getSummary reverts on an empty client list (ERC-8004 v2.0.0): the naive reader averages everyone
    const [count, value, dec] = clients.length
      ? await read<[bigint, bigint, number]>(d, reputation, reputationAbi, "getSummary", [agentId, clients, "", ""])
      : [0n, 0n, 0];
    out.naive = {
      clients: clients.length,
      count: count.toString(),
      summaryValue: value.toString(),
      summaryValueDecimals: Number(dec),
      note: "getSummary over ALL clients: what a reader without anchors sees (a Sybil farm counts fully here)",
    };
  }
  return out;
}

// ------------------------------------------------------------------ inspect
export type Challenge = { url: string; pr: PaymentRequired; offer: PaymentRequirements; agentId: bigint };

export type InspectResult = {
  url: string;
  offer: { scheme: string; network: string; amount: string; amountUsdc: string; asset: string; payTo: string };
  payer: string;
  payerBalanceUsdc: string;
  balanceOk: boolean;
  wouldSign: { primaryType: "AncrePayment"; domain: string; to: string; value: string; agentId: string };
} & Verdict;

export async function challenge(d: Pick<Deps, "readContract" | "fetch" | "signal">, cfg: Config, url: string, agentIdFlag: string | undefined, maxAmount: bigint | undefined): Promise<Challenge> {
  let res: Response;
  try {
    res = await d.fetch(url, { method: "GET", signal: d.signal });
  } catch (e) {
    throw new FlowError("ANCRE_HTTP_ERROR", `GET ${url} failed: ${(e as Error).message}`, "Check the URL");
  }
  const pr = parsePaymentRequired(res.status, res.headers, await res.text());
  const maxPerPayment = await read<bigint>(d, cfg.payer, payerAbi, "maxPerPayment");
  const offer = selectOffer(pr, { network: cfg.network, usdc: cfg.usdc, maxAmount, maxPerPayment });
  return { url, pr, offer, agentId: resolveAgentId(agentIdFlag, offer) };
}

export async function inspectFlow(d: Deps, cfg: Config, url: string, agentIdFlag?: string, maxAmount?: bigint): Promise<InspectResult> {
  const c = await challenge(d, cfg, url, agentIdFlag, maxAmount);
  return inspectChallenge(d, cfg, c);
}

export async function inspectChallenge(d: Pick<Deps, "readContract">, cfg: Config, c: Challenge): Promise<InspectResult> {
  const to = getAddress(c.offer.payTo);
  const amount = BigInt(c.offer.amount);
  const [v, bal] = await Promise.all([
    decideFor(d, cfg, c.agentId, to, amount),
    read<bigint>(d, cfg.usdc, erc20Abi, "balanceOf", [cfg.payer]),
  ]);
  return {
    url: c.url,
    offer: { scheme: c.offer.scheme, network: c.offer.network, amount: c.offer.amount, amountUsdc: fmtUsdc(amount), asset: c.offer.asset, payTo: to },
    payer: cfg.payer,
    payerBalanceUsdc: fmtUsdc(bal),
    balanceOk: bal >= amount,
    wouldSign: { primaryType: "AncrePayment", domain: `ANCRE TrustGatedPayer v1 @ ${cfg.payer} (chain ${cfg.chainId})`, to, value: c.offer.amount, agentId: c.agentId.toString() },
    ...v,
  };
}

// ------------------------------------------------------------------ pay
/** D47: shown with every ANCRE refusal. The override is the human's, in their own terminal and wallet. */
export const HUMAN_OVERRIDE_NOTE =
  "Only the human may override this refusal, from their own wallet: they run `mm ancre override <url>` themselves in an interactive terminal and sign in their MetaMask extension. An agent never runs it.";

export type PayResult = InspectResult & {
  humanOverride?: string;
  /** PAID: 2xx with a successful PAYMENT-RESPONSE carrying a hash; REFUSED; UNKNOWN: no settlement evidence */
  outcome: "PAID" | "REFUSED" | "UNKNOWN" | "NOT_SIGNED";
  paid: boolean;
  signed: boolean;
  /** set once a signed authorisation left the plugin and was not settled: it stays usable until validBefore */
  liveAuthorization?: { nonce: string; validBefore: string; note: string };
  transaction?: string;
  settlement?: SettleResponse;
  settlementError?: { httpStatus: number; body: string };
  explainAfterFailure?: Verdict;
  responseBody?: string;
};

/**
 * Soft guard first (decide before signing: a refused agent never gets a signature), then the signature through
 * the wallet executor, then the x402 retry. The hard guard is the payer contract at settlement. No retry.
 */
export async function payFlow(
  d: Deps,
  cfg: Config,
  url: string,
  opts: { agentId?: string; maxAmount?: bigint; confirm: boolean },
): Promise<PayResult> {
  if (!opts.confirm) {
    throw new FlowError("ANCRE_CONFIRM_REQUIRED", "Refusing to pay without --confirm", "Run `mm ancre inspect <url>` first and get the human's approval");
  }
  if (!d.signTypedData) throw new FlowError("ANCRE_NO_SIGNER", "No wallet executor", "This command needs the wallet-submit capability");
  const c = await challenge(d, cfg, url, opts.agentId, opts.maxAmount);
  const ins = await inspectChallenge(d, cfg, c);
  const j = (kind: Parameters<Journal>[0]["kind"], extra: Record<string, string | undefined> = {}, v: Verdict = ins) =>
    d.journal?.({ kind, url, agentId: ins.agentId, payTo: ins.offer.payTo, amount: ins.offer.amount, verdict: v.verdict, reason: v.reason,
      status: v.status, triggerTag: v.triggerTag, payer: cfg.payer, ...extra });
  if (!ins.pay) {
    j("refusal");
    return { ...ins, outcome: "NOT_SIGNED", paid: false, signed: false, humanOverride: HUMAN_OVERRIDE_NOTE };
  }
  if (!ins.balanceOk) {
    throw new FlowError("ANCRE_PAYER_UNFUNDED", `Payer balance ${ins.payerBalanceUsdc} USDC < ${ins.offer.amountUsdc}`, "Ask the human to run `mm ancre payer fund <amount> --confirm`");
  }

  const auth: Authorization = newAuthorization(cfg.payer, c.offer, d.nowSec(), d.random32());
  const typedData = ancrePaymentTypedData(cfg.chainId, auth, c.agentId);
  const summary = `Pay ${ins.offer.amountUsdc} USDC to ERC-8004 agent #${c.agentId} via ANCRE payer (verdict PAY)`;
  const sig = normalizeSignature(
    await d.signTypedData(typedData, summary, { payTo: auth.to, payer: cfg.payer, agentId: c.agentId.toString(), resource: url }),
  );
  const signer = await recoverTypedDataAddress({ ...typedData, signature: sig } as Parameters<typeof recoverTypedDataAddress>[0]);
  const isOp = await read<boolean>(d, cfg.payer, payerAbi, "isOperator", [signer]);
  if (!isOp) {
    throw new FlowError(
      "ANCRE_NOT_OPERATOR",
      `The wallet that signed (${signer}) is not an operator of payer ${cfg.payer}`,
      "Each mm login method has its own address: sign in with the method the payer was set up for, or ask the owner to add this address",
    );
  }
  const blob = encodeExactBlob(auth, c.agentId, sig);
  const payload = buildPaymentPayload(c.pr, c.offer, auth, blob, url);

  const live = {
    nonce: auth.nonce,
    validBefore: auth.validBefore.toString(),
    note: "This signed authorisation can still be settled by the server until validBefore (unix seconds) if ANCRE trusts the agent then. Do not sign another payment for this resource before it expires; tell the human.",
  };
  const base = { ...ins, signed: true };
  let res: Response;
  try {
    res = await d.fetch(url, { method: "GET", headers: { [H_SIGNATURE]: encodeB64Json(payload) }, signal: d.signal });
  } catch (e) {
    return { ...base, outcome: "UNKNOWN", paid: false, liveAuthorization: live, settlementError: { httpStatus: 0, body: `paid GET failed: ${(e as Error).message}` } };
  }
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* body lost: the status and headers still decide */
  }
  const settlement = decodePaymentResponse(res.headers);
  if (res.ok && settlement?.success === true && settlement.transaction) {
    j("paid", { transaction: settlement.transaction });
    return { ...base, outcome: "PAID", paid: true, transaction: settlement.transaction, settlement, responseBody: body.slice(0, 2000) };
  }
  const settlementError = { httpStatus: res.status, body: body.slice(0, 2000) };
  if (res.ok) {
    // 2xx without settlement evidence: x402 v2 requires PAYMENT-RESPONSE; the authorisation may still be settled later
    j("unknown", { detail: `HTTP ${res.status} without PAYMENT-RESPONSE` });
    return { ...base, outcome: "UNKNOWN", paid: false, settlement, settlementError, liveAuthorization: live, responseBody: body.slice(0, 2000) };
  }
  // refused or failed at /verify or /settle: ask the contract why, at this block (e.g. a veto between verify and settle)
  let explainAfterFailure: Verdict | undefined;
  try {
    const digest = usdcAuthorizationDigest(cfg.chainId, cfg.usdc, auth);
    const [reason, , , , , a] = await read<[number, number, bigint, Address, bigint, Assessment]>(d, cfg.payer, payerAbi, "explain", [digest, blob]);
    explainAfterFailure = afterFailure(describe(Number(reason), a, c.agentId, auth.to));
  } catch {
    explainAfterFailure = undefined; // the refusal stands; only its explanation is missing
  }
  j("settlement_refused", { detail: `HTTP ${res.status}` }, explainAfterFailure ?? ins);
  return { ...base, outcome: "REFUSED", paid: false, settlement, settlementError, explainAfterFailure, liveAuthorization: live,
    ...(explainAfterFailure && !explainAfterFailure.pay ? { humanOverride: HUMAN_OVERRIDE_NOTE } : {}) };
}

// ------------------------------------------------------------------ payer status / fund
export type StatusResult = {
  payer: string;
  chainId: number;
  owner: string;
  treasury: string;
  operators: string[];
  wallet?: string;
  walletIsOperator?: boolean;
  walletMode?: "byok" | "server";
  walletUsdc?: string;
  /** the conditions under which the hard guard holds (README "When does the gate actually hold?") */
  guarantee: { check: string; ok: boolean | null }[];
  paused: boolean;
  setId: string;
  maxPerPaymentUsdc: string;
  balanceUsdc: string;
  usdc: string;
  ancre: string;
  identity: string;
  policy: { theta: string; rhoN: number; rhoD: number; minAnchors: number; vetoQuorum: number; maxAge: string; registryVerified: boolean };
  guardModeChecklist: string[];
};

export async function statusFlow(d: Deps, cfg: Config, wallet?: Address, walletMode?: "byok" | "server"): Promise<StatusResult> {
  const r = <T>(fn: string, args: readonly unknown[] = []) => read<T>(d, cfg.payer, payerAbi, fn, args);
  const [owner, treasury, ops, paused, setId, maxPer, usdc, ancre, identity] = await Promise.all([
    r<Address>("owner"),
    r<Address>("treasury"),
    r<readonly Address[]>("operators"),
    r<boolean>("paused"),
    r<Hex>("setId"),
    r<bigint>("maxPerPayment"),
    r<Address>("usdc"),
    r<Address>("ancre"),
    r<Address>("identity"),
  ]);
  if (getAddress(usdc) !== cfg.usdc) {
    throw new FlowError("ANCRE_WRONG_CHAIN", `Payer USDC ${usdc} is not the USDC of chain ${cfg.chainId}`, "Check --chain-id");
  }
  const [bal, p] = await Promise.all([read<bigint>(d, cfg.usdc, erc20Abi, "balanceOf", [cfg.payer]), read<{ theta: bigint; rhoN: number; rhoD: number; minAnchors: number; vetoQuorum: number; maxAge: bigint; registryVerified: boolean }>(
    d, ancre, ancreAbi, "policyOf", [setId],
  )]);
  const operators = ops.filter((o) => o !== zeroAddress);
  const walletIsOperator = wallet ? operators.some((o) => getAddress(o) === getAddress(wallet)) : undefined;
  const walletUsdc = wallet ? await read<bigint>(d, cfg.usdc, erc20Abi, "balanceOf", [wallet]) : undefined;
  const isHuman = (x: Address) => getAddress(x) !== cfg.payer && !operators.some((o) => getAddress(o) === getAddress(x)) && (!wallet || getAddress(x) !== getAddress(wallet));
  const guarantee = [
    { check: "Agent Wallet in server-wallet mode (not BYOK)", ok: walletMode === undefined ? null : walletMode === "server" },
    { check: "no USDC on the Agent Wallet (funds only in the payer)", ok: walletUsdc === undefined ? null : walletUsdc === 0n },
    { check: "the Agent Wallet is an operator of the payer", ok: walletIsOperator ?? null },
    { check: "owner and treasury are the human (neither the payer, an operator nor the Agent Wallet)", ok: isHuman(owner) && isHuman(treasury) },
    { check: "Guard Mode allowlist = payer + USDC only (check with `mm wallet policy get`)", ok: null },
  ];
  return {
    payer: cfg.payer,
    chainId: cfg.chainId,
    owner,
    treasury,
    operators,
    ...(wallet ? { wallet, walletIsOperator, walletMode, walletUsdc: walletUsdc === undefined ? undefined : fmtUsdc(walletUsdc) } : {}),
    guarantee,
    paused,
    setId,
    maxPerPaymentUsdc: fmtUsdc(maxPer),
    balanceUsdc: fmtUsdc(bal),
    usdc,
    ancre,
    identity,
    policy: {
      theta: p.theta.toString(),
      rhoN: Number(p.rhoN),
      rhoD: Number(p.rhoD),
      minAnchors: Number(p.minAnchors),
      vetoQuorum: Number(p.vetoQuorum),
      maxAge: p.maxAge.toString(),
      registryVerified: p.registryVerified,
    },
    guardModeChecklist: [
      `allowlist contract addresses: ${usdc} (USDC) and ${cfg.payer} (payer) only`,
      `allowlist token recipients: ${cfg.payer} only (funding the payer is the only transfer the agent needs)`,
      "your wallet should hold no USDC: payments come from the payer contract",
      wallet && !walletIsOperator ? "WARNING: the active mm wallet is NOT an operator of this payer" : "the active mm wallet is an operator (or unknown: check `mm wallet address`)",
      `owner ${owner} must be the human, not the mm wallet`,
    ],
  };
}

/** USDC.transfer has a measured cost of 99 322 gas to a fresh address (MESURÉ-FORK 27/09); Monad bills the limit. */
export const FUND_GAS = 110_000n;

export async function fundFlow(d: Deps, cfg: Config, amount: bigint, confirm: boolean) {
  if (!confirm) throw new FlowError("ANCRE_CONFIRM_REQUIRED", "Refusing to fund without --confirm", "Get the human's approval for the amount first");
  if (!d.sendTransaction) throw new FlowError("ANCRE_NO_SIGNER", "No wallet executor", "This command needs the wallet-submit capability");
  if (amount <= 0n) throw new FlowError("ANCRE_BAD_AMOUNT", "Amount must be > 0", "e.g. 0.10");
  const usdc = await read<Address>(d, cfg.payer, payerAbi, "usdc");
  if (getAddress(usdc) !== cfg.usdc) throw new FlowError("ANCRE_WRONG_CHAIN", `Payer USDC ${usdc} is not the USDC of chain ${cfg.chainId}`, "Check --chain-id");
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [cfg.payer, amount] });
  const r = await d.sendTransaction({ to: cfg.usdc, data, value: 0n, gas: FUND_GAS }, `Fund ANCRE payer ${cfg.payer} with ${fmtUsdc(amount)} USDC`);
  return { payer: cfg.payer, amountUsdc: fmtUsdc(amount), transaction: r.hash, status: r.status, gasLimit: FUND_GAS.toString() };
}

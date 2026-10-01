import { type Address, getAddress, isAddress, recoverTypedDataAddress, zeroAddress, erc20Abi, type Hex } from "viem";
import { type Config, fmtUsdc } from "./config.js";
import { challenge, FlowError, inspectChallenge, type InspectResult, read } from "./flows.js";
import type { HumanSignature, HumanSignRequest } from "./human.js";
import type { Journal } from "./journal.js";
import { type Authorization } from "./payer.js";
import { payerAbi } from "./payerAbi.js";
import { buildPaymentPayload, decodePaymentResponse, encodeB64Json, H_SIGNATURE, newAuthorization } from "./x402.js";

/**
 * Human override (D47). When ANCRE refuses, a HUMAN may still pay, from their OWN wallet, signed in their own
 * MetaMask extension. By construction this flow has no access to the Agent Wallet executor (no signTypedData,
 * no sendTransaction in its dependencies) nor to the payer contract's funds: it reads the verdict, asks the human
 * at an interactive terminal, and sends an ordinary EIP-3009 payment from the human's address.
 * It refuses to run non-interactively, refuses when ANCRE already says PAY (use `pay`), and refuses any signature
 * that comes from the payer, one of its operators or the Agent Wallet (no switch between the two wallets).
 */
export type OverrideDeps = {
  readContract: (args: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
  fetch: typeof fetch;
  nowSec: () => number;
  random32: () => Hex;
  signal?: AbortSignal;
  /** stdin and stdout are a TTY and no machine output (--json/--format/--toon) was requested */
  interactive: boolean;
  /** asks the human at the terminal; resolves true only on the exact typed answer */
  confirm: (prompt: string, expected: string) => Promise<boolean>;
  /** the human's own extension signs (see human.ts) */
  humanSign: (req: Omit<HumanSignRequest, "onUrl">) => Promise<HumanSignature>;
  /** the Agent Wallet address, when known, to refuse a "human" signature from it */
  agentWallet?: Address;
  journal?: Journal;
  print?: (s: string) => void;
};

export type OverrideResult = InspectResult & {
  outcome: "OVERRIDE_PAID" | "OVERRIDE_DECLINED" | "OVERRIDE_FAILED";
  human?: string;
  transaction?: string;
  settlementError?: { httpStatus: number; body: string };
};

const TWA_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export async function overrideFlow(d: OverrideDeps, cfg: Config, url: string, opts: { agentId?: string; maxAmount?: bigint }): Promise<OverrideResult> {
  if (!d.interactive) {
    throw new FlowError("ANCRE_OVERRIDE_HUMAN_ONLY", "The override is for a human at an interactive terminal",
      "An agent never runs it. The human runs `mm ancre override <url>` in their own terminal, without --json");
  }
  const c = await challenge(d, cfg, url, opts.agentId, opts.maxAmount);
  const ins = await inspectChallenge(d, cfg, c);
  if (ins.pay) throw new FlowError("ANCRE_OVERRIDE_NOT_NEEDED", "ANCRE does not refuse this payment", "Use `mm ancre pay`, which pays from the payer contract");
  const j = (kind: Parameters<Journal>[0]["kind"], extra: Record<string, string | undefined> = {}) =>
    d.journal?.({ kind, url, agentId: ins.agentId, payTo: ins.offer.payTo, amount: ins.offer.amount, verdict: ins.verdict, reason: ins.reason,
      status: ins.status, triggerTag: ins.triggerTag, ...extra });
  j("override_requested");

  const print = d.print ?? (() => {});
  print(`ANCRE refuses: ${ins.verdict} (reason ${ins.reason}, status ${ins.status}${ins.triggerTag ? `, tag ${ins.triggerTag}` : ""}).`);
  print(`${ins.action}`);
  print(`Override: YOU pay ${ins.offer.amountUsdc} USDC to ${ins.offer.payTo} (agent #${ins.agentId}) from YOUR OWN wallet, against ANCRE's verdict.`);
  const expected = `override ${ins.agentId}`;
  if (!(await d.confirm(`Type "${expected}" to open the signing page in your browser: `, expected))) {
    j("override_declined");
    return { ...ins, outcome: "OVERRIDE_DECLINED" };
  }

  const template: Authorization = newAuthorization(zeroAddress, c.offer, d.nowSec(), d.random32());
  const domain = { name: "USDC", version: "2", chainId: cfg.chainId, verifyingContract: cfg.usdc };
  const message = { from: zeroAddress as string, to: template.to, value: template.value.toString(), validAfter: template.validAfter.toString(),
    validBefore: template.validBefore.toString(), nonce: template.nonce };
  let sig: HumanSignature;
  try {
    sig = await d.humanSign({
      chainId: cfg.chainId,
      summary: `Pay ${ins.offer.amountUsdc} USDC to ${ins.offer.payTo} (ERC-8004 agent #${ins.agentId}) for ${url}. ANCRE verdict: ${ins.verdict}.`,
      typedData: { domain, types: TWA_TYPES, primaryType: "TransferWithAuthorization", message },
    });
  } catch (e) {
    j("override_failed", { detail: (e as Error).message });
    throw new FlowError("ANCRE_OVERRIDE_NOT_SIGNED", `No human signature: ${(e as Error).message}`, "Nothing was paid");
  }

  // the signature must be the human's own, on exactly the prepared message
  const fail = (code: string, msg: string): never => {
    j("override_failed", { detail: msg });
    throw new FlowError(code, msg, "Nothing was paid");
  };
  if (!isAddress(sig.address)) fail("ANCRE_OVERRIDE_BAD_SIGNATURE", "The signing page returned no address");
  const human = getAddress(sig.address);
  const m = sig.message ?? {};
  for (const k of ["to", "value", "validAfter", "validBefore", "nonce"] as const) {
    if (String(m[k]).toLowerCase() !== String(message[k]).toLowerCase()) fail("ANCRE_OVERRIDE_BAD_SIGNATURE", `The signed message changed field ${k}`);
  }
  if (!isAddress(String(m.from)) || getAddress(String(m.from)) !== human) fail("ANCRE_OVERRIDE_BAD_SIGNATURE", "message.from is not the signing account");
  const auth: Authorization = { ...template, from: human };
  const { EIP712Domain: _domainType, ...viemTypes } = TWA_TYPES; // viem derives the domain type itself
  const recovered = await recoverTypedDataAddress({ domain, types: viemTypes, primaryType: "TransferWithAuthorization", message: auth, signature: sig.signature })
    .catch(() => zeroAddress);
  if (getAddress(recovered) !== human) fail("ANCRE_OVERRIDE_BAD_SIGNATURE", "The signature does not come from the connected account");
  // no switch between the agent's wallet and the human's (D47 c)
  if (human === cfg.payer) fail("ANCRE_OVERRIDE_NOT_HUMAN", "The payer contract cannot be the override payer");
  if (d.agentWallet && human === getAddress(d.agentWallet)) fail("ANCRE_OVERRIDE_NOT_HUMAN", "The Agent Wallet cannot sign an override: use the human's own wallet");
  if (await read<boolean>(d, cfg.payer, payerAbi, "isOperator", [human])) fail("ANCRE_OVERRIDE_NOT_HUMAN", "An operator of the payer (the agent's wallet) cannot sign an override");
  const bal = await read<bigint>(d, cfg.usdc, erc20Abi, "balanceOf", [human]);
  if (bal < auth.value) fail("ANCRE_OVERRIDE_UNFUNDED", `Your wallet holds ${fmtUsdc(bal)} USDC < ${ins.offer.amountUsdc}`);
  j("override_signed", { payer: human });

  const payload = buildPaymentPayload(c.pr, c.offer, auth, sig.signature, url);
  let res: Response;
  try {
    res = await d.fetch(url, { method: "GET", headers: { [H_SIGNATURE]: encodeB64Json(payload) }, signal: d.signal });
  } catch (e) {
    j("override_failed", { payer: human, detail: `paid GET failed: ${(e as Error).message}` });
    return { ...ins, outcome: "OVERRIDE_FAILED", human, settlementError: { httpStatus: 0, body: (e as Error).message } };
  }
  const body = await res.text().catch(() => "");
  const settle = decodePaymentResponse(res.headers);
  if (res.ok && settle?.success === true && settle.transaction) {
    j("override_paid", { payer: human, transaction: settle.transaction });
    return { ...ins, outcome: "OVERRIDE_PAID", human, transaction: settle.transaction };
  }
  j("override_failed", { payer: human, detail: `HTTP ${res.status}` });
  return { ...ins, outcome: "OVERRIDE_FAILED", human, settlementError: { httpStatus: res.status, body: body.slice(0, 2000) } };
}

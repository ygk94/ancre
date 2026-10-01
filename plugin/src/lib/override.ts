import { type Address, erc20Abi, getAddress, type Hex, isAddress, recoverTypedDataAddress, zeroAddress } from "viem";
import { type Config, fmtUsdc } from "./config.js";
import { challenge, FlowError, inspectChallenge, type InspectResult, read } from "./flows.js";
import type { HumanSignature, HumanSignRequest } from "./human.js";
import type { Journal, JournalEntry } from "./journal.js";
import { type Authorization, usdcAuthorizationTypedData, usdcAuthorizationTypedDataJson } from "./payer.js";
import { payerAbi } from "./payerAbi.js";
import { buildPaymentPayload, decodePaymentResponse, encodeB64Json, H_SIGNATURE, newAuthorization } from "./x402.js";

/**
 * Human override (D47). When ANCRE refuses, the HUMAN may still pay, from their OWN wallet, signed in their own
 * MetaMask extension.
 *
 * What makes it human-only: the signature must come from the payer's OWNER or TREASURY, addresses the human set
 * on-chain, that the operator (the agent) cannot change and whose key the agent does not hold. Any other key,
 * including every address of the host wallet and every operator of the payer, is refused. The interactive
 * terminal check is defence in depth only.
 *
 * What it never touches: this flow has no signTypedData / sendTransaction dependency (no Agent Wallet executor;
 * the command declares no wallet-submit capability), and it moves no funds of the payer contract. It sends an
 * ordinary EIP-3009 payment from the human's address.
 */
export type OverrideDeps = {
  readContract: (args: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
  fetch: typeof fetch;
  nowSec: () => number;
  random32: () => Hex;
  signal?: AbortSignal;
  /** isInteractive(stdin TTY, stdout TTY, argv): defence in depth */
  interactive: boolean;
  /** asks the human at the terminal; resolves true only on the exact typed answer */
  confirm: (prompt: string, expected: string) => Promise<boolean>;
  /** the human's own extension signs (see human.ts) */
  humanSign: (req: Omit<HumanSignRequest, "onUrl">) => Promise<HumanSignature>;
  /** every address of the host Agent Wallet (selected or not): none may sign an override */
  agentWallets?: Address[];
  journal?: Journal;
  print?: (s: string) => void;
};

export type OverrideResult = InspectResult & {
  outcome: "OVERRIDE_PAID" | "OVERRIDE_DECLINED" | "OVERRIDE_FAILED" | "OVERRIDE_UNKNOWN";
  human?: string;
  transaction?: string;
  settlementError?: { httpStatus: number; body: string };
  liveAuthorization?: { nonce: string; validBefore: string; note: string };
};

export async function overrideFlow(d: OverrideDeps, cfg: Config, url: string, opts: { agentId?: string; maxAmount?: bigint }): Promise<OverrideResult> {
  // every exit is journaled, the refusals first of all (an agent trying is exactly what the screen must show)
  let ctx: Pick<JournalEntry, "url" | "agentId" | "payTo" | "amount" | "verdict" | "reason" | "status" | "triggerTag"> =
    { url, agentId: opts.agentId ?? "?", payTo: "?", amount: "?" };
  const j = (kind: JournalEntry["kind"], extra: Partial<JournalEntry> = {}) => d.journal?.({ ...ctx, kind, ...extra });
  try {
    return await run(d, cfg, url, opts, (c) => (ctx = { ...ctx, ...c }), j);
  } catch (e) {
    j(e instanceof FlowError && e.code === "ANCRE_OVERRIDE_NOT_SIGNED" ? "override_failed" : "override_refused",
      { detail: `${(e as { code?: string }).code ?? "ERROR"}: ${(e as Error).message}` });
    throw e;
  }
}

async function run(
  d: OverrideDeps, cfg: Config, url: string, opts: { agentId?: string; maxAmount?: bigint },
  setCtx: (c: Partial<JournalEntry>) => void, j: (kind: JournalEntry["kind"], extra?: Partial<JournalEntry>) => void,
): Promise<OverrideResult> {
  if (!d.interactive) {
    throw new FlowError("ANCRE_OVERRIDE_HUMAN_ONLY", "The override is for a human at an interactive terminal",
      "An agent never runs it. The human runs `mm ancre override <url>` in their own terminal, without --json");
  }
  const c = await challenge(d, cfg, url, opts.agentId, opts.maxAmount, false);
  const ins = await inspectChallenge(d, cfg, c);
  setCtx({ agentId: ins.agentId, payTo: ins.offer.payTo, amount: ins.offer.amount, verdict: ins.verdict, reason: ins.reason, status: ins.status, triggerTag: ins.triggerTag });
  if (ins.pay) throw new FlowError("ANCRE_OVERRIDE_NOT_NEEDED", "ANCRE does not refuse this payment", "Use `mm ancre pay`, which pays from the payer contract");
  j("override_requested");

  // who may sign: the human, i.e. the payer's owner or treasury (set on-chain by the human)
  const [owner, treasury, ops] = await Promise.all([
    read<Address>(d, cfg.payer, payerAbi, "owner"),
    read<Address>(d, cfg.payer, payerAbi, "treasury"),
    read<readonly Address[]>(d, cfg.payer, payerAbi, "operators"),
  ]);
  const banned = new Set([cfg.payer, ...ops.filter((o) => o !== zeroAddress), ...(d.agentWallets ?? [])].map((a) => getAddress(a)));
  const humans = [owner, treasury].map((a) => getAddress(a)).filter((a) => !banned.has(a));
  if (humans.length === 0) {
    throw new FlowError("ANCRE_OVERRIDE_MISCONFIGURED", "The payer's owner and treasury are the agent's addresses: there is no human to override",
      "Set the payer's owner to the human's own wallet (README, conditions of the guarantee)");
  }

  const print = d.print ?? (() => {});
  print(`ANCRE refuses: ${ins.verdict} (reason ${ins.reason}, status ${ins.status}${ins.triggerTag ? `, tag ${ins.triggerTag}` : ""}).`);
  print(ins.action);
  print(`Override: YOU pay ${ins.offer.amountUsdc} USDC to ${ins.offer.payTo} (agent #${ins.agentId}) from YOUR OWN wallet ` +
    `(${humans.join(" or ")}), against ANCRE's verdict.`);
  const expected = `override ${ins.agentId}`;
  if (!(await d.confirm(`Type "${expected}" to open the signing page in your browser: `, expected))) {
    j("override_declined");
    return { ...ins, outcome: "OVERRIDE_DECLINED" };
  }

  // the authorisation window starts when the human clicks (prepare), not when the page opens
  let issued: Authorization | undefined;
  const prepare = () => {
    issued = newAuthorization(zeroAddress, c.offer, d.nowSec(), d.random32());
    return usdcAuthorizationTypedDataJson(cfg.chainId, cfg.usdc, issued);
  };
  let sig: HumanSignature;
  try {
    sig = await d.humanSign({
      chainId: cfg.chainId,
      summary: `Pay ${ins.offer.amountUsdc} USDC to ${ins.offer.payTo} (ERC-8004 agent #${ins.agentId}) for ${url}, from your own wallet. ANCRE verdict: ${ins.verdict}.`,
      prepare,
    });
  } catch (e) {
    throw new FlowError("ANCRE_OVERRIDE_NOT_SIGNED", `No human signature: ${(e as Error).message}`, "Nothing was paid");
  }
  if (!issued) throw new FlowError("ANCRE_OVERRIDE_BAD_SIGNATURE", "No authorisation was issued to the signing page", "Nothing was paid");
  if (!isAddress(sig.address)) throw new FlowError("ANCRE_OVERRIDE_BAD_SIGNATURE", "The signing page returned no address", "Nothing was paid");
  const signer = getAddress(sig.address);
  const auth: Authorization = { ...issued, from: signer };
  const recovered = await recoverTypedDataAddress({ ...usdcAuthorizationTypedData(cfg.chainId, cfg.usdc, auth), signature: sig.signature })
    .catch(() => zeroAddress);
  if (getAddress(recovered) !== signer) throw new FlowError("ANCRE_OVERRIDE_BAD_SIGNATURE", "The signature does not come from the connected account", "Nothing was paid");
  if (banned.has(signer)) {
    throw new FlowError("ANCRE_OVERRIDE_NOT_HUMAN", `${signer} is the payer, one of its operators or an Agent Wallet address: it cannot sign an override`,
      "Connect the human's own wallet (the payer's owner or treasury) in the browser extension");
  }
  if (!humans.includes(signer)) {
    throw new FlowError("ANCRE_OVERRIDE_NOT_HUMAN", `${signer} is neither the payer's owner nor its treasury`,
      `Connect ${humans.join(" or ")} in the browser extension`);
  }
  const bal = await read<bigint>(d, cfg.usdc, erc20Abi, "balanceOf", [signer]);
  if (bal < auth.value) throw new FlowError("ANCRE_OVERRIDE_UNFUNDED", `Your wallet holds ${fmtUsdc(bal)} USDC < ${ins.offer.amountUsdc}`, "Nothing was paid");
  j("override_signed", { payer: signer });

  const live = {
    nonce: auth.nonce,
    validBefore: auth.validBefore.toString(),
    note: "Your signed authorisation can still be settled until validBefore (unix seconds). Do not sign another one for this resource before it expires.",
  };
  const payload = buildPaymentPayload(c.pr, c.offer, auth, sig.signature, url);
  let res: Response;
  try {
    res = await d.fetch(url, { method: "GET", headers: { [H_SIGNATURE]: encodeB64Json(payload) }, signal: d.signal });
  } catch (e) {
    j("override_unknown", { payer: signer, detail: `paid GET failed: ${(e as Error).message}` });
    return { ...ins, outcome: "OVERRIDE_UNKNOWN", human: signer, liveAuthorization: live, settlementError: { httpStatus: 0, body: (e as Error).message } };
  }
  const body = await res.text().catch(() => "");
  const settle = decodePaymentResponse(res.headers);
  if (res.ok && settle?.success === true && settle.transaction) {
    j("override_paid", { payer: signer, transaction: settle.transaction });
    return { ...ins, outcome: "OVERRIDE_PAID", human: signer, transaction: settle.transaction };
  }
  if (res.ok) {
    j("override_unknown", { payer: signer, detail: `HTTP ${res.status} without PAYMENT-RESPONSE` });
    return { ...ins, outcome: "OVERRIDE_UNKNOWN", human: signer, liveAuthorization: live, settlementError: { httpStatus: res.status, body: body.slice(0, 2000) } };
  }
  j("override_failed", { payer: signer, detail: `HTTP ${res.status}` });
  return { ...ins, outcome: "OVERRIDE_FAILED", human: signer, liveAuthorization: live, settlementError: { httpStatus: res.status, body: body.slice(0, 2000) } };
}

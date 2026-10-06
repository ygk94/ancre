import { type Address, erc20Abi, getAddress, type Hex, isAddress, recoverTypedDataAddress, zeroAddress } from "viem";
import { type Config, fmtUsdc } from "./config.js";
import { AncreError, type ReadContract } from "./errors.js";
import { challenge, inspectChallenge, type InspectResult, journaler, nonceUsed, payerRoles, read } from "./flows.js";
import { type HumanSignature, type HumanSignRequest, nonceKey } from "./human.js";
import type { Journal } from "./journal.js";
import { type Authorization, usdcAuthorizationTypedData, usdcAuthorizationTypedDataJson } from "./payer.js";
import { payerAbi } from "./payerAbi.js";
import { buildPaymentPayload, encodeB64Json, H_SIGNATURE, newAuthorization, paidResponseEvidence } from "./x402.js";

/**
 * Human override (D47). When ANCRE refuses, the HUMAN may still pay, from their OWN wallet, signed in their own
 * MetaMask extension.
 *
 * What makes it human-only: the signature must come from the payer's OWNER or TREASURY, addresses the human set
 * on-chain, that the operator (the agent) cannot change and whose key the agent does not hold. Any other key,
 * including every address of the host wallet and every operator of the payer, is refused.
 *
 * Which payer, read where (M4): the caller cannot choose either. The roles are read only through the MetaMask
 * gateway client of the host (no --rpc-url), whose chain id must be the configured one; and the payer must be
 * pinned by the human's Agent Wallet setup: the selected wallet is a server wallet, it is an operator of that
 * payer, and the payer's address is in that wallet's Guard Mode policy, which the agent cannot change without the
 * human's 2FA. A payer the agent deployed for itself (owner = a key it funded) fails the last check.
 *
 * Limits (README): these checks bind the plugin as installed. An agent that can run arbitrary code as the user
 * can run a modified copy and write anything in the local journal; what no local code can change is on-chain:
 * an override only spends from the signer's own address, never from the payer or the Agent Wallet.
 *
 * What it never touches: this flow has no signTypedData / sendTransaction dependency (no Agent Wallet executor;
 * the command declares no wallet-submit capability), and it moves no funds of the payer contract. It sends an
 * ordinary EIP-3009 payment from the human's address.
 */
export type OverrideDeps = {
  /** the host gateway client (ctx.publicClient), never a caller-chosen RPC; hostDeps already checked its eth_chainId */
  readContract: ReadContract;
  fetch: typeof fetch;
  nowSec: () => number;
  random32: () => Hex;
  signal?: AbortSignal;
  /** io.isInteractive and the TTY / argv test (interactive.ts): defence in depth */
  interactive: boolean;
  /** asks the human at the terminal; resolves true only on the exact typed answer */
  confirm: (prompt: string, expected: string) => Promise<boolean>;
  /** the human's own extension signs (see human.ts) */
  humanSign: (req: Omit<HumanSignRequest, "onUrl">) => Promise<HumanSignature>;
  /** the selected host wallet and its mode, from the host state; undefined when it cannot be read */
  selectedWallet?: { address: Address; mode?: "byok" | "server" };
  /** every address of the host Agent Wallet (selected or not): none may sign an override */
  agentWallets: Address[];
  /** the Guard Mode policy of the selected server wallet, as `mm wallet policy get --json` prints it */
  guardPolicy: (wallet: Address) => Promise<string>;
  journal?: Journal;
  print?: (s: string) => void;
};

export type OverrideResult = InspectResult & {
  outcome: "OVERRIDE_PAID" | "OVERRIDE_DECLINED" | "OVERRIDE_FAILED" | "OVERRIDE_UNKNOWN";
  human?: string;
  transaction?: string;
  nonceUsed?: boolean;
  settlementError?: { httpStatus: number; body: string };
  liveAuthorization?: { nonce: string; validBefore: string; note: string };
};

export async function overrideFlow(d: OverrideDeps, cfg: Config, url: string, opts: { agentId?: string; maxAmount?: bigint }): Promise<OverrideResult> {
  // every exit is journaled, the refusals first of all (an agent trying is exactly what the screen must show)
  const jr = journaler(d.journal, { url, agentId: opts.agentId ?? "?", payTo: "?", amount: "?" });
  const state = { signed: false };
  try {
    return await run(d, cfg, url, opts, jr, state);
  } catch (e) {
    const failed = state.signed || (e instanceof AncreError && e.code === "ANCRE_OVERRIDE_NOT_SIGNED");
    jr.fallback(failed ? "override_failed" : "override_refused", e);
    throw e;
  }
}

const unpinned = (msg: string) =>
  new AncreError("ANCRE_OVERRIDE_UNPINNED", msg,
    "The override pays only against the payer your Agent Wallet is set up for: server-wallet mode, an operator of the payer, and the payer in its Guard Mode allowlist (`mm wallet policy get`)");

/** M4: the payer is the one the human pinned in the Agent Wallet setup, read on the configured chain. */
async function checkPinned(d: OverrideDeps, cfg: Config): Promise<Address> {
  const w = d.selectedWallet;
  if (!w) throw unpinned("The host wallet state could not be read: no Agent Wallet pins the payer");
  if (w.mode !== "server") throw unpinned(`The selected Agent Wallet ${w.address} is not a server wallet (${w.mode ?? "unknown mode"}): BYOK has no Guard Mode policy to pin the payer`);
  const [usdc, isOp] = await Promise.all([
    read<Address>(d, cfg.payer, payerAbi, "usdc"),
    read<boolean>(d, cfg.payer, payerAbi, "isOperator", [w.address]),
  ]);
  if (getAddress(usdc) !== cfg.usdc) throw new AncreError("ANCRE_WRONG_CHAIN", `Payer USDC ${usdc} is not the USDC of chain ${cfg.chainId}`, "Check --chain-id and --payer");
  if (!isOp) throw unpinned(`Your Agent Wallet ${w.address} is not an operator of payer ${cfg.payer}`);
  let policy: string;
  try {
    policy = await d.guardPolicy(w.address);
  } catch (e) {
    throw unpinned(`The Guard Mode policy of ${w.address} could not be read: ${(e as Error).message}`);
  }
  const pinned = policyAllowsContract(policy, w.address, cfg.payer);
  if (pinned !== true) throw unpinned(`Payer ${cfg.payer} is not in the Guard Mode allowlist of your Agent Wallet ${w.address} (${pinned})`);
  return w.address;
}

/**
 * True when `contract` is in a contract-address allowlist of the policy of `wallet`, else why not (M4).
 * The Guard Mode YAML schema is not public (docs/ressources/metamask-agent-wallet.md): the policy is read as
 * `mm wallet policy get --json` prints it ({ policy: <YAML>, address }), the wallet must be the one asked for, and
 * the address only counts on a line whose key path names an allowlist (allow / whitelist) of addresses or
 * contracts, never under a token-recipient, deny or block key. Anything unrecognised fails closed.
 */
export function policyAllowsContract(raw: string, wallet: Address, contract: Address): true | string {
  let text = raw;
  try {
    const j = JSON.parse(raw) as unknown;
    const o = (typeof j === "object" && j !== null ? ((j as { data?: unknown }).data ?? j) : undefined) as { policy?: unknown; address?: unknown } | undefined;
    if (!o || typeof o.policy !== "string") return "no policy in the output";
    if (typeof o.address !== "string" || !isAddress(o.address) || getAddress(o.address) !== getAddress(wallet)) return "the policy is not this wallet's";
    text = o.policy;
  } catch {
    return "the output is not the JSON of `mm wallet policy get --json`";
  }
  const want = contract.slice(2).toLowerCase();
  const path: { indent: number; key: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const m = /^\s*(?:-\s+)?([A-Za-z_][\w-]*)\s*:/.exec(line);
    // a key closes its siblings and their children; a bare value ("- 0x…") belongs to the last key at or above it
    while (path.length && (m ? path[path.length - 1].indent >= indent : path[path.length - 1].indent > indent)) path.pop();
    if (m) path.push({ indent, key: m[1].toLowerCase() });
    if (!line.toLowerCase().includes(want)) continue;
    const keys = path.map((p) => p.key);
    const allow = keys.some((k) => /allow|whitelist/.test(k));
    const excluded = keys.some((k) => /recipient|deny|block/.test(k));
    if (allow && !excluded) return true;
  }
  return "not under an allowlist of contract addresses";
}

async function run(
  d: OverrideDeps, cfg: Config, url: string, opts: { agentId?: string; maxAmount?: bigint }, jr: ReturnType<typeof journaler>,
  state: { signed: boolean },
): Promise<OverrideResult> {
  if (!d.interactive) {
    throw new AncreError("ANCRE_OVERRIDE_HUMAN_ONLY", "The override is for a human at an interactive terminal",
      "An agent never runs it. The human runs `mm ancre override <url>` in their own terminal, without --json");
  }
  await checkPinned(d, cfg);
  const c = await challenge(d, cfg, url, opts.agentId, opts.maxAmount);
  jr.set({ agentId: c.agentId.toString(), payTo: c.offer.payTo, amount: c.offer.amount });
  const ins = await inspectChallenge(d, cfg, c);
  jr.set({ verdict: ins.verdict, reason: ins.reason, status: ins.status, triggerTag: ins.triggerTag });
  if (ins.pay) throw new AncreError("ANCRE_OVERRIDE_NOT_NEEDED", "ANCRE does not refuse this payment", "Use `mm ancre pay`, which pays from the payer contract");
  jr.j("override_requested");

  // who may sign: the human, i.e. the payer's owner or treasury (set on-chain by the human)
  const [owner, treasury, ops] = await Promise.all([
    read<Address>(d, cfg.payer, payerAbi, "owner"),
    read<Address>(d, cfg.payer, payerAbi, "treasury"),
    read<readonly Address[]>(d, cfg.payer, payerAbi, "operators"),
  ]);
  const roles = payerRoles({ payer: cfg.payer, owner, treasury, operators: ops, hostWallets: d.agentWallets });
  if (!roles.ok) {
    // A4f: owner OR treasury held by the agent is enough to have no human (an agent owner can transferOwnership)
    const who = [!roles.ownerIsHuman && `owner ${roles.owner}`, !roles.treasuryIsHuman && `treasury ${roles.treasury}`].filter(Boolean).join(" and ");
    throw new AncreError("ANCRE_OVERRIDE_MISCONFIGURED", `The payer's ${who} is an address of the agent (payer, operator or Agent Wallet): there is no human to override`,
      "Set the payer's owner and treasury to the human's own wallet (README, conditions of the guarantee)");
  }
  const humans = roles.humans;

  const print = d.print ?? (() => {});
  print(`ANCRE refuses: ${ins.verdict} (reason ${ins.reason}, status ${ins.status}${ins.triggerTag ? `, tag ${ins.triggerTag}` : ""}).`);
  print(ins.action);
  print(`Override: YOU pay ${ins.offer.amountUsdc} USDC to ${ins.offer.payTo} (agent #${ins.agentId}) from YOUR OWN wallet ` +
    `(${humans.join(" or ")}), against ANCRE's verdict.`);
  const expected = `override ${ins.agentId}`;
  if (!(await d.confirm(`Type "${expected}" to open the signing page in your browser: `, expected))) {
    jr.j("override_declined");
    return { ...ins, outcome: "OVERRIDE_DECLINED" };
  }

  // the authorisation window starts when the human clicks (prepare), not when the page opens; every template
  // issued is kept by nonce, so a second click never makes the first signature look forged (A4d)
  const issued = new Map<string, Authorization>();
  const prepare = () => {
    const a = newAuthorization(zeroAddress, c.offer, d.nowSec(), d.random32());
    issued.set(nonceKey(a.nonce), a);
    return usdcAuthorizationTypedDataJson(cfg.chainId, cfg.usdc, a);
  };
  /** the signer check, run before the page says "Signed" and again on the result */
  const verify = async (s: HumanSignature): Promise<{ signer: Address; auth: Authorization }> => {
    const nonce = typeof s.template?.message?.nonce === "string" ? nonceKey(s.template.message.nonce) : undefined;
    const issuedAuth = nonce ? issued.get(nonce) : undefined;
    if (!issuedAuth) throw new AncreError("ANCRE_OVERRIDE_BAD_SIGNATURE", "No authorisation was issued to the signing page", "Nothing was paid");
    if (typeof s.address !== "string" || !isAddress(s.address)) throw new AncreError("ANCRE_OVERRIDE_BAD_SIGNATURE", "The signing page returned no address", "Nothing was paid");
    const signer = getAddress(s.address);
    const auth: Authorization = { ...issuedAuth, from: signer };
    const recovered = await recoverTypedDataAddress({ ...usdcAuthorizationTypedData(cfg.chainId, cfg.usdc, auth), signature: s.signature })
      .catch(() => zeroAddress);
    if (getAddress(recovered) !== signer) throw new AncreError("ANCRE_OVERRIDE_BAD_SIGNATURE", "The signature does not come from the connected account", "Nothing was paid");
    if (roles.banned.has(signer)) {
      throw new AncreError("ANCRE_OVERRIDE_NOT_HUMAN", `${signer} is the payer, one of its operators or an Agent Wallet address: it cannot sign an override`,
        "Connect the human's own wallet (the payer's owner or treasury) in the browser extension");
    }
    if (!humans.includes(signer)) {
      throw new AncreError("ANCRE_OVERRIDE_NOT_HUMAN", `${signer} is neither the payer's owner nor its treasury`,
        `Connect ${humans.join(" or ")} in the browser extension`);
    }
    const bal = await read<bigint>(d, cfg.usdc, erc20Abi, "balanceOf", [signer]);
    if (bal < auth.value) throw new AncreError("ANCRE_OVERRIDE_UNFUNDED", `Your wallet holds ${fmtUsdc(bal)} USDC < ${ins.offer.amountUsdc}`, "Nothing was paid");
    return { signer, auth };
  };
  let sig: HumanSignature;
  let accepted: { key: string; signer: Address; auth: Authorization } | undefined;
  try {
    sig = await d.humanSign({
      chainId: cfg.chainId,
      summary: `Pay ${ins.offer.amountUsdc} USDC to ${ins.offer.payTo} (ERC-8004 agent #${ins.agentId}) for ${url}, from your own wallet. ANCRE verdict: ${ins.verdict}.`,
      prepare,
      accept: async (s) => {
        const v = await verify(s);
        accepted = { key: nonceKey(s.template.message.nonce), ...v };
      },
      signal: d.signal,
    });
  } catch (e) {
    if (e instanceof AncreError) throw e; // refused by verify, on the page
    throw new AncreError("ANCRE_OVERRIDE_NOT_SIGNED", `No human signature: ${(e as Error).message}`, "Nothing was paid");
  }
  if (d.signal?.aborted) throw new AncreError("ANCRE_OVERRIDE_NOT_SIGNED", "Cancelled (Ctrl-C) before the payment was sent", "Nothing was paid");
  // verified once, on the page, before "Signed"; a humanSign without the page (tests, scripts) is verified here
  const { signer, auth } = accepted && accepted.key === nonceKey(sig.template?.message?.nonce) && getAddress(accepted.signer) === getAddress(sig.address)
    ? accepted : await verify(sig);
  state.signed = true;
  jr.j("override_signed", { payer: signer });

  const live = {
    nonce: auth.nonce,
    validBefore: auth.validBefore.toString(),
    note: "Your signed authorisation can still be settled until validBefore (unix seconds). Do not sign another one for this resource before it expires.",
  };
  const payload = buildPaymentPayload(c.pr, c.offer, auth, sig.signature, url);
  const j = (kind: Parameters<typeof jr.j>[0], extra: Parameters<typeof jr.j>[1] = {}) => jr.j(kind, { payer: signer, ...extra });
  let res: Response;
  try {
    res = await d.fetch(url, { method: "GET", headers: { [H_SIGNATURE]: encodeB64Json(payload) }, signal: d.signal });
  } catch (e) {
    const used = await nonceUsed(d, cfg, signer, auth.nonce);
    if (used) {
      j("override_paid", { detail: `paid GET failed (${(e as Error).message}) but the authorisation nonce is used on-chain` });
      return { ...ins, outcome: "OVERRIDE_PAID", human: signer, nonceUsed: true, settlementError: { httpStatus: 0, body: (e as Error).message } };
    }
    j("override_unknown", { detail: `paid GET failed: ${(e as Error).message}` });
    return { ...ins, outcome: "OVERRIDE_UNKNOWN", human: signer, nonceUsed: used, liveAuthorization: live, settlementError: { httpStatus: 0, body: (e as Error).message } };
  }
  const body = await res.text().catch(() => "");
  const settlementError = { httpStatus: res.status, body: body.slice(0, 2000) };
  const ev = paidResponseEvidence(res.status, res.headers);
  if (ev.kind === "settled") {
    j("override_paid", { transaction: ev.settlement!.transaction, ...(res.ok ? {} : { detail: `HTTP ${res.status} with a successful PAYMENT-RESPONSE` }) });
    return { ...ins, outcome: "OVERRIDE_PAID", human: signer, transaction: ev.settlement!.transaction, ...(res.ok ? {} : { settlementError }) };
  }
  const used = await nonceUsed(d, cfg, signer, auth.nonce);
  if (used) {
    j("override_paid", { transaction: ev.settlement?.transaction, detail: `HTTP ${res.status} without a settlement proof, but the authorisation nonce is used on-chain` });
    return { ...ins, outcome: "OVERRIDE_PAID", human: signer, nonceUsed: true, transaction: ev.settlement?.transaction, settlementError };
  }
  if (ev.kind === "verify_rejected" && used === false) {
    j("override_failed", { detail: `HTTP ${res.status}` });
    return { ...ins, outcome: "OVERRIDE_FAILED", human: signer, nonceUsed: used, liveAuthorization: live, settlementError };
  }
  j("override_unknown", { detail: `HTTP ${res.status}, no settlement proof, nonce ${used === undefined ? "unreadable" : "unused"}` });
  return { ...ins, outcome: "OVERRIDE_UNKNOWN", human: signer, nonceUsed: used, liveAuthorization: live, settlementError };
}

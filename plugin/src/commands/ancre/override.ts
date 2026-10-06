import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { createInterface } from "node:readline/promises";
import { optionalUsdc, resolveConfig } from "../../lib/config.js";
import { allWalletAddresses, hostDeps, readGuardPolicy, selectedWallet, toCommandError } from "../../lib/host.js";
import { isInteractive } from "../../lib/interactive.js";
import { humanSign } from "../../lib/human.js";
import { fileJournal, trackedJournal } from "../../lib/journal.js";
import { type OverrideResult, overrideFlow } from "../../lib/override.js";

// no --rpc-url here (M4): the roles that decide who is human are read through the MetaMask gateway only
const inputs = {
  url: { type: InputFieldType.Text, flag: "url", message: "x402 resource URL that ANCRE refused", required: true, index: 0 },
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId of the provider (if the offer does not declare it)", required: false, prompt: false },
  maxAmount: { type: InputFieldType.Text, flag: "max-amount", message: "Refuse offers above this USDC amount", required: false, prompt: false },
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER); must be in your Agent Wallet's Guard Mode policy", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 or 10143", required: false, prompt: false },
} satisfies InputSchema;

/**
 * HUMAN ONLY (D47). Pays a provider ANCRE refused, from the human's OWN wallet (the payer's owner or treasury),
 * signed in their MetaMask extension through a local page. This command holds no wallet-submit capability: it
 * cannot reach the Agent Wallet executor, and it never touches the payer contract's funds. The payer must be the
 * one the Agent Wallet is set up for (server wallet, operator, Guard Mode policy), read through the MetaMask
 * gateway on the configured chain (M4). It also refuses to run without an interactive terminal or with machine
 * output (defence in depth).
 */
export default class AncreOverride extends PluginCommand<OverrideResult> {
  static override description =
    "HUMAN ONLY: pay a provider that ANCRE refused, from your own MetaMask wallet (browser extension). Agents must never run this.";
  static override examples = ["<%= config.bin %> ancre override http://127.0.0.1:4021/farm"];
  // the gateway reads and the host wallet state are required (M4)
  static override requiresInit = true;
  static override requiresAuth = true;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:override";

  async execute(io: CommandIO): Promise<OverrideResult> {
    const tj = trackedJournal(fileJournal());
    let url: string | undefined;
    try {
      const inp = await io.resolveInputs(inputs);
      url = inp.url;
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const argv = [...process.argv, ...(this.ctx.argv ?? [])];
      const interactive = isInteractive(process.stdin.isTTY, process.stdout.isTTY, argv, io.isInteractive);
      const print = (s: string) => process.stderr.write(s + "\n");
      if (process.env.ANCRE_RPC_URL) print("ANCRE_RPC_URL is ignored by the override: it reads through the MetaMask gateway only.");
      const base = await hostDeps(this.ctx, io, cfg, null); // null: no wallet executor; no rpcUrl: the gateway only
      let agentWallets: ReturnType<typeof allWalletAddresses> = [];
      let selected: ReturnType<typeof selectedWallet>;
      try {
        const snap = await this.ctx.walletStateManager.read();
        agentWallets = allWalletAddresses(snap);
        selected = selectedWallet(snap);
      } catch {
        selected = undefined; // the flow refuses: nothing pins the payer
      }
      return await overrideFlow(
        {
          readContract: base.readContract,
          fetch: base.fetch,
          nowSec: base.nowSec,
          random32: base.random32,
          signal: base.signal,
          interactive,
          selectedWallet: selected,
          agentWallets,
          guardPolicy: () => readGuardPolicy(base.signal), // `mm wallet policy get` shows the selected wallet's; policyAllowsContract checks its address
          journal: tj.journal,
          print,
          confirm: async (prompt, expected) => {
            const rl = createInterface({ input: process.stdin, output: process.stderr });
            const onAbort = () => rl.close();
            base.signal?.addEventListener("abort", onAbort, { once: true });
            try {
              return (await rl.question(prompt, { signal: base.signal })).trim() === expected;
            } catch {
              return false; // Ctrl-C or closed input: declined
            } finally {
              base.signal?.removeEventListener("abort", onAbort);
              rl.close();
            }
          },
          humanSign: (req) => humanSign({ ...req, onUrl: (u) => print(`Open this page in the browser where YOUR MetaMask extension is installed:\n  ${u}`) }),
        },
        cfg,
        inp.url,
        { agentId: inp.agentId, maxAmount: optionalUsdc(inp.maxAmount) },
      );
    } catch (e) {
      if (url !== undefined) tj.failedOutside("override_refused", url, e); // e.g. a reader on the wrong chain
      return toCommandError(e);
    }
  }

  override successHint(r: OverrideResult): string {
    if (r.outcome === "OVERRIDE_PAID") return `Human override: ${r.human} paid ${r.offer.amountUsdc} USDC to agent #${r.agentId} (${r.transaction ? `tx ${r.transaction}` : "authorisation nonce used on-chain"})`;
    if (r.outcome === "OVERRIDE_DECLINED") return "Override declined: nothing was signed or paid";
    if (r.outcome === "OVERRIDE_UNKNOWN") return `Override outcome UNKNOWN: your authorisation stays valid until ${r.liveAuthorization?.validBefore}; do not sign again before`;
    return `Override refused by the server at /verify (HTTP ${r.settlementError?.httpStatus}), nonce unused; the payer contract was not used`;
  }
}

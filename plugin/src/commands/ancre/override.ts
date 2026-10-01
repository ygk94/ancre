import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { createInterface } from "node:readline/promises";
import { parseUsdc, resolveConfig } from "../../lib/config.js";
import { allWalletAddresses, hostDeps, toCommandError } from "../../lib/host.js";
import { isInteractive } from "../../lib/interactive.js";
import { humanSign } from "../../lib/human.js";
import { fileJournal } from "../../lib/journal.js";
import { type OverrideResult, overrideFlow } from "../../lib/override.js";

const inputs = {
  url: { type: InputFieldType.Text, flag: "url", message: "x402 resource URL that ANCRE refused", required: true, index: 0 },
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId of the provider (if the offer does not declare it)", required: false, prompt: false },
  maxAmount: { type: InputFieldType.Text, flag: "max-amount", message: "Refuse offers above this USDC amount", required: false, prompt: false },
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER), to read the verdict", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 or 10143", required: false, prompt: false },
  rpcUrl: { type: InputFieldType.Text, flag: "rpc-url", message: "Read through this RPC (or ANCRE_RPC_URL)", required: false, prompt: false },
} satisfies InputSchema;

/**
 * HUMAN ONLY (D47). Pays a provider ANCRE refused, from the human's OWN wallet (the payer's owner or treasury),
 * signed in their MetaMask extension through a local page. This command holds no wallet-submit capability: it
 * cannot reach the Agent Wallet executor, and it never touches the payer contract's funds. It also refuses to run
 * without an interactive terminal or with machine output (defence in depth).
 */
export default class AncreOverride extends PluginCommand<OverrideResult> {
  static override description =
    "HUMAN ONLY: pay a provider that ANCRE refused, from your own MetaMask wallet (browser extension). Agents must never run this.";
  static override examples = ["<%= config.bin %> ancre override http://127.0.0.1:4021/farm"];
  static override requiresInit = false;
  static override requiresAuth = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:override";

  async execute(io: CommandIO): Promise<OverrideResult> {
    try {
      const inp = await io.resolveInputs(inputs);
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const argv = [...process.argv, ...(this.ctx.argv ?? [])];
      const interactive = isInteractive(process.stdin.isTTY, process.stdout.isTTY, argv);
      const base = await hostDeps(this.ctx, io, cfg, null, inp.rpcUrl ?? process.env.ANCRE_RPC_URL); // null: no wallet executor
      let agentWallets: ReturnType<typeof allWalletAddresses> = [];
      try {
        agentWallets = allWalletAddresses(await this.ctx.walletStateManager.read());
      } catch {
        agentWallets = []; // not initialized: the owner/treasury rule still binds
      }
      const print = (s: string) => process.stderr.write(s + "\n");
      return await overrideFlow(
        {
          readContract: base.readContract,
          fetch: base.fetch,
          nowSec: base.nowSec,
          random32: base.random32,
          signal: base.signal,
          interactive,
          agentWallets,
          journal: fileJournal(),
          print,
          confirm: async (prompt, expected) => {
            const rl = createInterface({ input: process.stdin, output: process.stderr });
            try {
              return (await rl.question(prompt)).trim() === expected;
            } finally {
              rl.close();
            }
          },
          humanSign: (req) => humanSign({ ...req, onUrl: (u) => print(`Open this page in the browser where YOUR MetaMask extension is installed:\n  ${u}`) }),
        },
        cfg,
        inp.url,
        { agentId: inp.agentId, maxAmount: inp.maxAmount ? parseUsdc(inp.maxAmount) : undefined },
      );
    } catch (e) {
      return toCommandError(e);
    }
  }

  override successHint(r: OverrideResult): string {
    if (r.outcome === "OVERRIDE_PAID") return `Human override: ${r.human} paid ${r.offer.amountUsdc} USDC to agent #${r.agentId} (tx ${r.transaction})`;
    if (r.outcome === "OVERRIDE_DECLINED") return "Override declined: nothing was signed or paid";
    if (r.outcome === "OVERRIDE_UNKNOWN") return `Override outcome UNKNOWN: your authorisation stays valid until ${r.liveAuthorization?.validBefore}; do not sign again before`;
    return `Override refused by the server or facilitator (HTTP ${r.settlementError?.httpStatus}); the payer contract was not used`;
  }
}

import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { optionalUsdc, resolveConfig } from "../../lib/config.js";
import { type CheckResult, checkFlow } from "../../lib/flows.js";
import { hostDeps, toCommandError } from "../../lib/host.js";

const inputs = {
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId", required: true, index: 0,
    validate: (v: string) => /^\d+$/.test(v) || "agentId must be a decimal integer" },
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 (Monad) or 10143 (testnet), default 143 or ANCRE_CHAIN_ID", required: false, prompt: false },
  amount: { type: InputFieldType.Text, flag: "amount", message: "USDC amount to test against maxPerPayment (default 0)", required: false, prompt: false },
  naive: { type: InputFieldType.Boolean, flag: "naive", message: "Also show the naive ERC-8004 average over all clients", required: false, prompt: false },
  rpcUrl: { type: InputFieldType.Text, flag: "rpc-url", message: "Read through this RPC instead of the mm gateway (reads only; or ANCRE_RPC_URL)", required: false, prompt: false },
} satisfies InputSchema;

export default class AncreCheck extends PluginCommand<CheckResult> {
  static override description = "Ask ANCRE, through your payer's policy, whether you may pay this ERC-8004 agent. Reads only.";
  static override examples = ["<%= config.bin %> ancre check 12", "<%= config.bin %> ancre check 182 --naive --json"];
  static override requiresInit = false;
  // reads only: with --rpc-url it needs no session; without it, ctx.publicClient needs `mm login`
  static override requiresAuth = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:check";

  async execute(io: CommandIO): Promise<CheckResult> {
    try {
      const inp = await io.resolveInputs(inputs);
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const d = await hostDeps(this.ctx, io, cfg, null, inp.rpcUrl ?? process.env.ANCRE_RPC_URL);
      return await checkFlow(d, cfg, BigInt(inp.agentId), optionalUsdc(inp.amount) ?? 0n, Boolean(inp.naive));
    } catch (e) {
      return toCommandError(e);
    }
  }

  override successHint(v: CheckResult): string {
    return `${v.verdict}: ${v.action}`;
  }
}

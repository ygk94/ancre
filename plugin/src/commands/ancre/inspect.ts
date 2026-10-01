import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { parseUsdc, resolveConfig } from "../../lib/config.js";
import { type InspectResult, inspectFlow } from "../../lib/flows.js";
import { hostDeps, toCommandError } from "../../lib/host.js";

const inputs = {
  url: { type: InputFieldType.Text, flag: "url", message: "x402 resource URL", required: true, index: 0 },
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId of the provider (if the offer does not declare it)", required: false, prompt: false },
  maxAmount: { type: InputFieldType.Text, flag: "max-amount", message: "Refuse offers above this USDC amount", required: false, prompt: false },
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 or 10143", required: false, prompt: false },
  rpcUrl: { type: InputFieldType.Text, flag: "rpc-url", message: "Read through this RPC instead of the mm gateway (reads only; or ANCRE_RPC_URL)", required: false, prompt: false },
} satisfies InputSchema;

export default class AncreInspect extends PluginCommand<InspectResult> {
  static override description = "Read an x402 402 challenge, resolve the ERC-8004 agent and show ANCRE's verdict and what would be signed. Never signs.";
  static override examples = ["<%= config.bin %> ancre inspect https://api.example.com/quote --agent-id 12 --json"];
  static override requiresInit = false;
  // reads only: with --rpc-url it needs no session; without it, ctx.publicClient needs `mm login`
  static override requiresAuth = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:inspect";

  async execute(io: CommandIO): Promise<InspectResult> {
    try {
      const inp = await io.resolveInputs(inputs);
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const d = await hostDeps(this.ctx, io, cfg, null, inp.rpcUrl ?? process.env.ANCRE_RPC_URL);
      return await inspectFlow(d, cfg, inp.url, inp.agentId, inp.maxAmount ? parseUsdc(inp.maxAmount) : undefined);
    } catch (e) {
      return toCommandError(e);
    }
  }

  override successHint(v: InspectResult): string {
    return `${v.verdict} for ${v.offer.amountUsdc} USDC to agent #${v.agentId}: ${v.action}`;
  }
}

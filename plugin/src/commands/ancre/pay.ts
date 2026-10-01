import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { parseUsdc, resolveConfig } from "../../lib/config.js";
import { type PayResult, payFlow } from "../../lib/flows.js";
import { hostDeps, toCommandError } from "../../lib/host.js";

const inputs = {
  url: { type: InputFieldType.Text, flag: "url", message: "x402 resource URL", required: true, index: 0 },
  agentId: { type: InputFieldType.Text, flag: "agent-id", message: "ERC-8004 agentId of the provider (if the offer does not declare it)", required: false, prompt: false },
  maxAmount: { type: InputFieldType.Text, flag: "max-amount", message: "Refuse offers above this USDC amount", required: false, prompt: false },
  confirm: { type: InputFieldType.Boolean, flag: "confirm", message: "The human approved this payment", required: false, prompt: false },
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 or 10143", required: false, prompt: false },
} satisfies InputSchema;

export default class AncrePay extends PluginCommand<PayResult> {
  static override description =
    "Pay an x402 resource only if ANCRE trusts the receiving ERC-8004 agent. Signs one AncrePayment through the Agent Wallet; the payer contract re-checks ANCRE at settlement.";
  static override examples = ["<%= config.bin %> ancre pay https://api.example.com/quote --agent-id 12 --max-amount 0.01 --confirm"];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:pay";

  async execute(io: CommandIO): Promise<PayResult> {
    try {
      const inp = await io.resolveInputs(inputs);
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const d = await hostDeps(this.ctx, io, cfg, inp.confirm ? "ancre:pay" : null);
      return await payFlow(d, cfg, inp.url, {
        agentId: inp.agentId,
        maxAmount: inp.maxAmount ? parseUsdc(inp.maxAmount) : undefined,
        confirm: Boolean(inp.confirm),
      });
    } catch (e) {
      return toCommandError(e);
    }
  }

  override successHint(r: PayResult): string {
    if (r.paid) return `Paid ${r.offer.amountUsdc} USDC to agent #${r.agentId} (tx ${r.transaction ?? "?"})`;
    if (!r.signed) return `Not paid, nothing signed: ${r.verdict}. ${r.action}`;
    return `Not paid: settlement refused (${r.explainAfterFailure?.verdict ?? r.settlementError?.httpStatus}). ${r.explainAfterFailure?.action ?? ""}`;
  }
}

import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { parseUsdc, resolveConfig } from "../../../lib/config.js";
import { fundFlow } from "../../../lib/flows.js";
import { hostDeps, toCommandError } from "../../../lib/host.js";

const inputs = {
  amount: { type: InputFieldType.Text, flag: "amount", message: "USDC amount to move from your wallet to the payer", required: true, index: 0 },
  confirm: { type: InputFieldType.Boolean, flag: "confirm", message: "The human approved this transfer", required: false, prompt: false },
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 or 10143", required: false, prompt: false },
} satisfies InputSchema;

type FundResult = Awaited<ReturnType<typeof fundFlow>>;

export default class AncrePayerFund extends PluginCommand<FundResult> {
  static override description = "Transfer USDC from your mm wallet to the payer contract (one ERC-20 transfer through the Agent Wallet, Guard Mode and 2FA apply).";
  static override examples = ["<%= config.bin %> ancre payer fund 0.10 --confirm"];
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "ancre:payer:fund";

  async execute(io: CommandIO): Promise<FundResult> {
    try {
      const inp = await io.resolveInputs(inputs);
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const d = await hostDeps(this.ctx, io, cfg, inp.confirm ? "ancre:payer:fund" : null);
      return await fundFlow(d, cfg, parseUsdc(inp.amount), Boolean(inp.confirm));
    } catch (e) {
      return toCommandError(e);
    }
  }

  override successHint(r: FundResult): string {
    return `Funded payer ${r.payer} with ${r.amountUsdc} USDC (tx ${r.transaction ?? r.status})`;
  }
}

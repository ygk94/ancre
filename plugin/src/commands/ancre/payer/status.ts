import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { resolveConfig } from "../../../lib/config.js";
import { type StatusResult, statusFlow } from "../../../lib/flows.js";
import { hostDeps, selectedWallet, toCommandError } from "../../../lib/host.js";

const inputs = {
  payer: { type: InputFieldType.Text, flag: "payer", message: "TrustGatedPayer address (or ANCRE_PAYER)", required: false, prompt: false },
  chainId: { type: InputFieldType.Text, flag: "chain-id", message: "143 or 10143", required: false, prompt: false },
  rpcUrl: { type: InputFieldType.Text, flag: "rpc-url", message: "Read through this RPC instead of the mm gateway (reads only; or ANCRE_RPC_URL)", required: false, prompt: false },
} satisfies InputSchema;

export default class AncrePayerStatus extends PluginCommand<StatusResult> {
  static override description = "Show the payer contract: balance, owner, treasury, operators (is your mm wallet one?), anchor set policy, Guard Mode checklist.";
  static override examples = ["<%= config.bin %> ancre payer status --json"];
  static override requiresInit = false;
  // reads only: with --rpc-url it needs no session; without it, ctx.publicClient needs `mm login`
  static override requiresAuth = false;
  static override flags = schemaToFlags(inputs);
  protected readonly pluginCommandId = "ancre:payer:status";

  async execute(io: CommandIO): Promise<StatusResult> {
    try {
      const inp = await io.resolveInputs(inputs);
      const cfg = resolveConfig({ chainId: inp.chainId, payer: inp.payer });
      const d = await hostDeps(this.ctx, io, cfg, null, inp.rpcUrl ?? process.env.ANCRE_RPC_URL);
      let w;
      try {
        w = selectedWallet(await this.ctx.walletStateManager.read());
      } catch {
        w = undefined; // not initialized: status still works
      }
      return await statusFlow(d, cfg, w?.address, w?.mode);
    } catch (e) {
      return toCommandError(e);
    }
  }

  override successHint(s: StatusResult): string {
    return `Payer ${s.payer}: ${s.balanceUsdc} USDC, max ${s.maxPerPaymentUsdc} per payment${s.paused ? ", PAUSED" : ""}`;
  }
}

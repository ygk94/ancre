import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToFlags } from "@metamask/agent-wallet/plugin";
import { journalPath, readJournal } from "../../lib/journal.js";

const inputs = {
  limit: { type: InputFieldType.Text, flag: "limit", message: "How many recent entries (default 50)", required: false, prompt: false },
} satisfies InputSchema;

type JournalResult = { path: string; entries: ReturnType<typeof readJournal> };

export default class AncreJournal extends PluginCommand<JournalResult> {
  static override description = "Show the local journal of ANCRE refusals, payments and human overrides (for the demo screen).";
  static override examples = ["<%= config.bin %> ancre journal --json"];
  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  protected readonly pluginCommandId = "ancre:journal";

  async execute(io: CommandIO): Promise<JournalResult> {
    const inp = await io.resolveInputs(inputs);
    const limit = inp.limit && /^\d+$/.test(inp.limit) ? Number(inp.limit) : 50;
    const path = journalPath();
    return { path, entries: readJournal(path, limit) };
  }

  override successHint(r: JournalResult): string {
    return `${r.entries.length} entries in ${r.path}`;
  }
}

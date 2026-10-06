// Cost of a run, from the transaction ledger (every tx we sent: estimate, gas LIMIT billed, gas used) and from the
// facilitator's settlements (paid by the facilitator, not by us). Feeds demo/BUDGET.md.
import type { Actor } from "./accounts.ts";
import type { Ctx } from "./scenes.ts";

/** Testnet gas price, MEASURED with `cast gas-price --rpc-url https://testnet-rpc.monad.xyz` (see BUDGET.md). */
export const TESTNET_GAS_PRICE = 102n * 10n ** 9n;

const mon = (wei: bigint) => Number(wei / 10n ** 12n) / 1e6;

export function budgetReport(ctx: Ctx, emitters: Actor[]) {
  const byFn = new Map<string, { n: number; gasLimit: bigint; gasUsed: bigint; minLimit: bigint; maxLimit: bigint }>();
  let gasLimit = 0n;
  for (const t of ctx.chain.ledger) {
    const k = t.fn === "transfer" ? "MON transfer" : t.fn;
    const r = byFn.get(k) ?? { n: 0, gasLimit: 0n, gasUsed: 0n, minLimit: t.gasLimit, maxLimit: t.gasLimit };
    r.n++;
    r.gasLimit += t.gasLimit;
    r.gasUsed += t.gasUsed;
    if (t.gasLimit < r.minLimit) r.minLimit = t.gasLimit;
    if (t.gasLimit > r.maxLimit) r.maxLimit = t.gasLimit;
    byFn.set(k, r);
    gasLimit += t.gasLimit;
  }
  const accounts = new Set(ctx.chain.ledger.map((t) => t.from.toLowerCase()));
  const capital = Object.values(ctx.monBudget).reduce((a, b) => a + b, 0n);
  const fac = ctx.facilitatorTxs.reduce((a, t) => a + (t.gasLimit ?? 0n), 0n);
  return {
    mode: ctx.chain.mode,
    txCount: ctx.chain.ledger.length,
    sendingAccounts: accounts.size,
    declaredEmitters: emitters.length,
    gasLimitTotal: gasLimit,
    feesMonAt102gwei: mon(gasLimit * TESTNET_GAS_PRICE),
    capitalLentToEmittersMon: mon(capital),
    facilitatorGasLimitTotal: fac,
    facilitatorMonAt102gwei: mon(fac * TESTNET_GAS_PRICE),
    byFunction: Object.fromEntries([...byFn].map(([k, v]) => [k, { ...v, avgLimit: v.gasLimit / BigInt(v.n), monAt102gwei: mon(v.gasLimit * TESTNET_GAS_PRICE) }])),
    ledger: ctx.chain.ledger,
    facilitator: ctx.facilitatorTxs,
  };
}

// Recover the MON lent to the emitters (capital envelope of demo/BUDGET.md): each emitter sends its balance, minus
// the fee of a 21 000-gas transfer, back to the operator. Below the 10 MON reserve this relies on the "emptying"
// exception of Monad (non-delegated account, no other transaction in the last 3 blocks): one transfer per account,
// after a wait of 4 blocks.
import type { Actor } from "./accounts.ts";
import type { Chain } from "./chain.ts";

export async function sweep(chain: Chain, emitters: Actor[], to: Actor) {
  const fees = await chain.pub.estimateFeesPerGas();
  const maxFee = fees.maxFeePerGas ?? (await chain.pub.getGasPrice());
  const head = Number(await chain.pub.getBlockNumber());
  if (chain.monadRules) await chain.waitBlock(head + 4);
  let recovered = 0n;
  for (const e of emitters) {
    if (e.account.address === to.account.address) continue;
    const bal = await chain.pub.getBalance({ address: e.account.address });
    const value = bal - 21_000n * maxFee;
    if (value <= 0n) continue;
    const hash = await chain.wallet(e.account).sendTransaction({ to: to.account.address, value, gas: 21_000n, maxFeePerGas: maxFee,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n, chain: null });
    const r = await chain.pub.waitForTransactionReceipt({ hash });
    if (r.status === "success") recovered += value;
    console.log(`  sweep ${e.label}: ${Number(value) / 1e18} MON ${r.status}`);
  }
  console.log(`  recovered ${Number(recovered) / 1e18} MON`);
  return recovered;
}

// The passkey anchor's veto is signed by a Mera session: the raw transaction must recover to the session's address.
import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { hexToBytes, keccak256, recoverTransactionAddress, serializeTransaction, toHex, type TransactionSerializableEIP1559 } from "viem";
import { describe, expect, it } from "vitest";

describe("Mera-signed EIP-1559 transaction (veto.ts)", () => {
  it("recovers to the session's EVM address", async () => {
    const sk = hexToBytes("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const session = createSecp256k1SigningSession({ privateKey: sk });
    const from = getEvmAddress(session.publicKey);
    const tx: TransactionSerializableEIP1559 = { type: "eip1559", chainId: 10143, nonce: 3, to: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
      data: "0x1234", gas: 300_000n, maxFeePerGas: 102_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n, value: 0n };
    const sig = await session.signDigest(hexToBytes(keccak256(serializeTransaction(tx))));
    session.end();
    const raw = serializeTransaction(tx, { r: toHex(sig.compact.slice(0, 32)), s: toHex(sig.compact.slice(32, 64)), yParity: sig.recovery });
    expect((await recoverTransactionAddress({ serializedTransaction: raw })).toLowerCase()).toBe(from.toLowerCase());
  });
});

import { indexer } from "envio";
import { decodeFunctionData, parseAbi } from "viem";

const giveFeedbackAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

indexer.onEvent(
  {
    contract: "ReputationRegistry",
    event: "NewFeedback",
    fields: { transaction: ["hash", "from", "to", "input"] },
  },
  async ({ event, context }) => {
    const tx = event.transaction;
    const input = tx.input as `0x${string}`;
    const txTo = (tx.to ?? "").toLowerCase();
    const directCall = txTo === event.srcAddress.toLowerCase();
    let decoded = false;
    let matchesEvent = false;
    if (directCall) {
      try {
        const { args } = decodeFunctionData({ abi: giveFeedbackAbi, data: input });
        decoded = true;
        const p = event.params;
        matchesEvent =
          args[0] === p.agentId && args[1] === p.value && BigInt(args[2]) === BigInt(p.valueDecimals) &&
          args[3] === p.tag1 && args[4] === p.tag2 && args[5] === p.endpoint &&
          args[6] === p.feedbackURI && args[7].toLowerCase() === p.feedbackHash.toLowerCase() &&
          tx.from.toLowerCase() === p.clientAddress.toLowerCase();
      } catch {
        decoded = false;
      }
    }
    context.CalldataProbe.set({
      id: `${event.block.number}_${event.logIndex}`,
      blockNumber: BigInt(event.block.number),
      txHash: tx.hash,
      txFrom: tx.from.toLowerCase(),
      txTo,
      inputBytes: (input.length - 2) / 2,
      selector: input.slice(0, 10),
      directCall,
      decoded,
      matchesEvent,
    });
  },
);

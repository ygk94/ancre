#!/usr/bin/env bash
# Test T1 (porte P3) on the REAL Monad testnet, in one go. Run it in Terminal.app (needs a TTY for the keystore
# password and for the typed confirmation). Sends ~12 testnet transactions from the keystore account (≈0.40 MON,
# 0.1 USDC) and calls the real facilitator https://x402-facilitator.molandak.org.
#   plugin/scripts/t1-live.sh [keystore-name] [its address]   (default: ancre-demo, 0x8107…3c3F)
set -euo pipefail
ACCOUNT="${1:-ancre-demo}"
SENDER="${2:-0x810724967b0d895d087b991304385720d4903c3F}"   # forge needs --sender for msg.sender inside the broadcast
PROVIDER="0x3D8C04e9a0373b0e17d8c97C0afC277E0e3D8Bd2"   # payee of T1: a fixed address nobody holds (receives ≈0.03 testnet USDC)
export PATH="$PATH:$HOME/.foundry/bin"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/contracts"
forge build -q
echo "== T1 deploy (oracle + payer + 0.1 USDC), keystore $ACCOUNT: the password is asked for the deployment"
OUT=$(T1_STEP=deploy T1_PROVIDER=$PROVIDER forge script script/t1/T1.s.sol --rpc-url monad_testnet \
  --account "$ACCOUNT" --sender "$SENDER" --broadcast --gas-estimate-multiplier 110 --slow 2>&1 | tee /dev/stderr)
ORACLE=$(printf '%s\n' "$OUT" | sed -n 's/.*T1_ORACLE=\(0x[0-9a-fA-F]\{40\}\).*/\1/p' | tail -1)
PAYER=$(printf '%s\n' "$OUT" | sed -n 's/.*T1_PAYER=\(0x[0-9a-fA-F]\{40\}\).*/\1/p' | tail -1)
[ -n "$ORACLE" ] && [ -n "$PAYER" ] || { echo "deploy failed: no T1_ORACLE / T1_PAYER in the output"; exit 1; }
echo "== deployed: oracle $ORACLE, payer $PAYER"
cd "$ROOT/plugin"
npm run build >/dev/null
echo "== T1 scenes against the real facilitator: the password is asked for each signature and each transaction"
node scripts/t1.mjs --live --account "$ACCOUNT" --provider "$PROVIDER" --payer "$PAYER" --oracle "$ORACLE"

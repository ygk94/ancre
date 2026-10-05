// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {AnchoredReputation} from "../src/AnchoredReputation.sol";
import {IIdentityRegistry8004, IReputationRegistry8004} from "../src/interfaces/IERC8004.sol";

/// Deploys AnchoredReputation on the ERC-8004 v2.0.0 registries of the current chain.
/// Monad bills the GAS LIMIT: always pass an explicit, tight --gas-limit (see below).
///
/// Dry run (no transaction):
///   forge script script/Deploy.s.sol --rpc-url monad_testnet
/// Deployment (needs Hugo's go-ahead; key from an encrypted keystore, never on the command line):
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --account <keystore> --broadcast \
///     --gas-estimate-multiplier 108 --slow   # tx gas limit = 1.08 x estimate (simulated 8 804 333 gas, 28/09)
/// Verification (Sourcify, chain 10143 / 143):
///   forge verify-contract <address> src/AnchoredReputation.sol:AnchoredReputation \
///     --chain 10143 --verifier sourcify --constructor-args $(cast abi-encode "f(address,address)" <ID> <REP>)
contract Deploy is Script {
    // Monad testnet 10143 (cast, 27/09) and mainnet 143 (CLAUDE.md §3)
    address constant ID_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REP_TESTNET = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant ID_MAINNET = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REP_MAINNET = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    function run() external returns (AnchoredReputation ar) {
        (address id, address rep) = block.chainid == 143
            ? (ID_MAINNET, REP_MAINNET)
            : block.chainid == 10143 ? (ID_TESTNET, REP_TESTNET) : (address(0), address(0));
        require(id != address(0), "unsupported chain (143 or 10143 only)");
        require(
            keccak256(bytes(IIdentityRegistry8004(id).getVersion())) == keccak256("2.0.0")
                && keccak256(bytes(IReputationRegistry8004(rep).getVersion())) == keccak256("2.0.0"),
            "registries are not v2.0.0: re-check before deploying (D17)"
        );
        vm.startBroadcast();
        ar = new AnchoredReputation(IIdentityRegistry8004(id), IReputationRegistry8004(rep));
        vm.stopBroadcast();
        console.log("AnchoredReputation", address(ar));
    }
}

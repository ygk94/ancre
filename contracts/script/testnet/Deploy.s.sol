// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {AnchoredReputation} from "../../src/AnchoredReputation.sol";
import {TrustGatedPayer, IERC20Min} from "../../src/TrustGatedPayer.sol";
import {IIdentityRegistry8004, IReputationRegistry8004} from "../../src/interfaces/IERC8004.sol";

/// Deployment of the corrected contract (02-bis) on Monad TESTNET (10143), against the ERC-8004 v2.0.0 registries of
/// the testnet (addresses checked by `cast` on 27/09, CLAUDE.md §3). One step per run (DEPLOY_STEP):
///   ancre : AnchoredReputation(identity, reputation)
///   payer : TrustGatedPayer(USDC testnet, Permit2, upto proxy, ANCRE, owner = broadcaster, PAYER_TREASURY,
///           PAYER_OPERATOR, ANCRE_SET, PAYER_MAX) — the set must be registered, in strict transfer mode (R8), and the
///           three roles must differ (R8)
/// Simulation only (no transaction), what 02-bis did on 06/10:
///   DEPLOY_STEP=ancre forge script script/testnet/Deploy.s.sol --rpc-url monad_testnet --sender <D>
/// Real deployment: ONLY with Hugo's agreement (🧑), with his keystore account:
///   DEPLOY_STEP=ancre forge script script/testnet/Deploy.s.sol --rpc-url monad_testnet --account <D> --broadcast \
///     --gas-estimate-multiplier 110
/// Monad bills the gas LIMIT: keep the multiplier tight. Verify on MonadVision (Sourcify) afterwards.
contract DeployTestnet is Script {
    address constant IDENTITY_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_TESTNET = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant USDC_TESTNET = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant UPTO = 0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002;

    function run() external {
        require(block.chainid == 10143, "testnet only (10143)");
        bytes32 step = keccak256(bytes(vm.envString("DEPLOY_STEP")));
        require(IDENTITY_TESTNET.code.length != 0 && REPUTATION_TESTNET.code.length != 0, "registries missing");
        vm.startBroadcast();
        if (step == keccak256("ancre")) {
            AnchoredReputation ar = new AnchoredReputation(
                IIdentityRegistry8004(IDENTITY_TESTNET), IReputationRegistry8004(REPUTATION_TESTNET)
            );
            console.log("ANCRE=%s", address(ar));
        } else if (step == keccak256("payer")) {
            address treasury = vm.envAddress("PAYER_TREASURY");
            address operator = vm.envAddress("PAYER_OPERATOR");
            require(treasury != msg.sender && operator != msg.sender && operator != treasury, "roles must differ (R8)");
            TrustGatedPayer payer = new TrustGatedPayer(
                IERC20Min(USDC_TESTNET),
                PERMIT2,
                UPTO,
                AnchoredReputation(vm.envAddress("ANCRE")),
                msg.sender,
                treasury,
                operator,
                vm.envBytes32("ANCRE_SET"),
                vm.envOr("PAYER_MAX", uint256(10_000))
            );
            console.log("PAYER=%s", address(payer));
        } else {
            revert("unknown DEPLOY_STEP");
        }
        vm.stopBroadcast();
    }
}

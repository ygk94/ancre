// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./utils/PayerBase.sol";
import {MockUSDC3009} from "./utils/MockUSDC3009.sol";

/// Chantier 02-bis: findings R8 of the maximal review (05/10) on TrustGatedPayer. Written on 2026-10-06 against
/// `main` (bc2d911), where both tests FAIL.
contract BisPayerTest is PayerBase {
    address constant OWNER = address(0x0E1);
    address constant TREASURY = address(0x7EA);

    MockUSDC3009 usdc;

    function setUp() public {
        _deployMocks();
        vm.roll(1000);
        usdc = new MockUSDC3009();
    }

    function _setId(bool strict) internal returns (bytes32) {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.strictTransfer = strict;
        return ar.registerAnchorSet(p);
    }

    /// R8 (1): in fast transfer mode a sold agent stays OK until someone proves the transfer, and the buyer has
    /// set a new agentWallet: the payer would pay the buyer on the seller's reputation. Refused at setPolicy.
    function test_R8_fastTransferSetRefused() public {
        bytes32 fast = _setId(false);
        bytes32 strict = _setId(true);
        TrustGatedPayer payer = new TrustGatedPayer(
            IERC20Min(address(usdc)), address(0), address(0), ar, OWNER, TREASURY, address(0xA11CE), strict, 1e6
        );
        vm.prank(OWNER);
        (bool ok,) = address(payer).call(abi.encodeCall(TrustGatedPayer.setPolicy, (fast, 1e6)));
        assertFalse(ok, "a payer must not gate on a fast-transfer-mode set");
        (ok,) = address(this).call(abi.encodeCall(this.deployPayer, (fast, address(0xA11CE))));
        assertFalse(ok, "nor be deployed on one");
    }

    /// R8 (2): an operator that is also the treasury signs payments AND receives every sweep: one key drains
    /// the payer. The treasury can never be an operator.
    function test_R8_treasuryNeverOperator() public {
        bytes32 strict = _setId(true);
        (bool ok,) = address(this).call(abi.encodeCall(this.deployPayer, (strict, TREASURY)));
        assertFalse(ok, "operator == treasury at deployment");
        TrustGatedPayer payer = new TrustGatedPayer(
            IERC20Min(address(usdc)), address(0), address(0), ar, OWNER, TREASURY, address(0xA11CE), strict, 1e6
        );
        vm.prank(OWNER);
        (ok,) = address(payer).call(abi.encodeCall(TrustGatedPayer.setOperator, (TREASURY, true)));
        assertFalse(ok, "setOperator(treasury)");
    }

    function deployPayer(bytes32 sid, address op) external returns (address) {
        return address(
            new TrustGatedPayer(IERC20Min(address(usdc)), address(0), address(0), ar, OWNER, TREASURY, op, sid, 1e6)
        );
    }
}

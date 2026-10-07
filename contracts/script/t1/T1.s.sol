// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {AnchoredReputation} from "../../src/AnchoredReputation.sol";
import {TrustGatedPayer, IERC20Min} from "../../src/TrustGatedPayer.sol";
import {T1Oracle} from "./T1Oracle.sol";

/// Test T1 (porte P3), on-chain side. One step per run, selected by T1_STEP. The broadcaster D is the deployer,
/// owner AND operator of the payer: scripts/t1.mjs signs every AncrePayment with D's keystore, so D must be an
/// operator. The treasury is another address (R8, review 05/10: an operator that is also the treasury drains the payer
/// by sweep; the payer refuses it). T1 never sweeps, so the default treasury is a fixed unused address. The three
/// distinct roles of the persistent deployment (MUSTDO, 08/10) are not needed for this 0.1 USDC test.
/// Run (Hugo, keystore account):
///   forge script script/t1/T1.s.sol --rpc-url monad_testnet --account <D> --broadcast --gas-estimate-multiplier 110
/// Without --broadcast it is a simulation (no transaction). Steps:
///   deploy  : T1Oracle(burn 78 000) + TrustGatedPayer(maxPerPayment 0.01 USDC) + USDC.transfer(payer, T1_FUND)
///             env: T1_PROVIDER (payTo P), T1_TREASURY (default: unused fixed address), T1_OPERATOR (default D;
///                  must differ from the treasury),
///                  T1_FUND (default 100000 = 0.1 USDC)
///   burn    : oracle.setBurn(T1_BURN)                       env: T1_ORACLE, T1_BURN
///   agent   : oracle.setAgent(1, P, T1_TRUSTED, T1_STATUS)  env: T1_ORACLE, T1_PROVIDER, T1_TRUSTED, T1_STATUS
///   permit2 : payer.approvePermit2(max)                     env: T1_PAYER
contract T1Script is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant UPTO = 0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002;
    address constant USDC_TESTNET = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    uint256 constant AGENT_ID = 1; // agent id inside the oracle (not an ERC-8004 id)
    // keccak256("ANCRE T1 treasury (unused: T1 never sweeps)") truncated to 20 bytes
    address constant DEFAULT_TREASURY = address(uint160(uint256(keccak256("ANCRE T1 treasury (unused: T1 never sweeps)"))));

    function run() external {
        require(block.chainid == 10143, "T1 runs on Monad testnet only");
        string memory step = vm.envString("T1_STEP");
        bytes32 h = keccak256(bytes(step));
        vm.startBroadcast();
        if (h == keccak256("deploy")) {
            address provider = vm.envAddress("T1_PROVIDER");
            uint256 fund = vm.envOr("T1_FUND", uint256(100_000));
            address d = msg.sender;
            address treasury = vm.envOr("T1_TREASURY", DEFAULT_TREASURY);
            address operator = vm.envOr("T1_OPERATOR", d);
            require(treasury != d && operator != treasury, "T1: the treasury must differ from D and from the operator");
            T1Oracle oracle = new T1Oracle(78_000);
            oracle.setAgent(AGENT_ID, provider, true, 0);
            TrustGatedPayer payer = new TrustGatedPayer(
                IERC20Min(USDC_TESTNET), PERMIT2, UPTO, AnchoredReputation(address(oracle)), d, treasury, operator,
                bytes32(uint256(1)), 10_000
            );
            require(IERC20Min(USDC_TESTNET).transfer(address(payer), fund), "fund");
            console.log("T1_ORACLE=%s", address(oracle));
            console.log("T1_PAYER=%s", address(payer));
        } else if (h == keccak256("burn")) {
            T1Oracle(vm.envAddress("T1_ORACLE")).setBurn(vm.envUint("T1_BURN"));
        } else if (h == keccak256("agent")) {
            T1Oracle(vm.envAddress("T1_ORACLE")).setAgent(
                AGENT_ID, vm.envAddress("T1_PROVIDER"), vm.envBool("T1_TRUSTED"), uint8(vm.envOr("T1_STATUS", uint256(0)))
            );
        } else if (h == keccak256("permit2")) {
            TrustGatedPayer(vm.envAddress("T1_PAYER")).approvePermit2(type(uint256).max);
        } else {
            revert("unknown T1_STEP");
        }
        vm.stopBroadcast();
    }
}

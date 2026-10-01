// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AnchoredReputation} from "../../src/AnchoredReputation.sol";

/// Stand-in for AnchoredReputation AND the ERC-8004 identity registry, for test T1 only (porte P3):
/// the real TrustGatedPayer runs unchanged against it, with a configurable gas burn in isTrusted / assess,
/// so that the facilitator's handling of an expensive ERC-1271 check can be measured without the real
/// certificate. Never use it as a payer's ancre outside T1.
contract T1Oracle {
    address public immutable admin;
    uint256 public burn; // gas burnt by isTrusted / assess (e.g. 78 000 ~ assess without veto, 190 000 with veto)
    mapping(uint256 => address) public wallets; // agentId -> agentWallet
    mapping(uint256 => bool) public trusted;
    mapping(uint256 => uint8) public statusOf; // AnchoredReputation.Status (0 = OK)

    error NotAdmin();

    constructor(uint256 burn_) {
        admin = msg.sender;
        burn = burn_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function setBurn(uint256 b) external onlyAdmin {
        burn = b;
    }

    /// one call per scene: wallet, trusted, status
    function setAgent(uint256 agentId, address wallet, bool isTrusted_, uint8 status) external onlyAdmin {
        wallets[agentId] = wallet;
        trusted[agentId] = isTrusted_;
        statusOf[agentId] = status;
    }

    // ---- AnchoredReputation surface used by TrustGatedPayer
    function identity() external view returns (address) {
        return address(this);
    }

    function policyOf(bytes32) external pure returns (AnchoredReputation.Policy memory q) {
        q.theta = 1; // any set id is "registered"
    }

    function isTrusted(uint256 agentId, bytes32) external view returns (bool) {
        _burn();
        return trusted[agentId] && statusOf[agentId] == 0;
    }

    function assess(uint256 agentId, bytes32, bool) external view returns (AnchoredReputation.Assessment memory x) {
        _burn();
        x.status = AnchoredReputation.Status(statusOf[agentId]);
        x.trusted = trusted[agentId] && statusOf[agentId] == 0;
        x.trust = x.trusted ? 1e17 : 0;
        x.trustRobust = x.trust;
        x.trustLow = x.trust;
        x.certBlock = uint64(block.number);
    }

    // ---- ERC-8004 identity surface used by TrustGatedPayer
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return wallets[agentId];
    }

    function _burn() internal view {
        uint256 g = gasleft();
        uint256 b = burn;
        while (g - gasleft() < b) {}
    }
}

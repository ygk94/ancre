// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

/// Subset of the ERC-8004 v2.0.0 IdentityRegistry used by ANCRE (verified on Monad mainnet, 2026-09-27).
interface IIdentityRegistry8004 {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
    function getVersion() external view returns (string memory);
}

/// Subset of the ERC-8004 v2.0.0 ReputationRegistry used by ANCRE (verified on Monad mainnet, 2026-09-27).
/// Feedback indexes start at 1 and are ordered per (agentId, client), all tags mixed.
interface IReputationRegistry8004 {
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked);
    function getVersion() external view returns (string memory);
}

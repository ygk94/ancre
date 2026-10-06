// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

/// Minimal ERC-8004 IdentityRegistry mock mirroring v2.0.0 semantics that ANCRE relies on:
/// agentWallet = owner at mint, cleared (0) on transfer; isAuthorizedOrOwner = owner, operator or approved
/// (OpenZeppelin _isAuthorized). A nonexistent agent reverts with ERC721NonexistentToken(uint256) in ownerOf,
/// getApproved and isAuthorizedOrOwner, and getAgentWallet returns 0: measured on the real v2.0.0 registry
/// (Monad mainnet, agent 99 999 999, 2026-10-06).
contract MockIdentity {
    error ERC721NonexistentToken(uint256 tokenId);

    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public wallets;
    mapping(address => mapping(address => bool)) public operators;
    mapping(uint256 => address) public approvals;
    string public version = "2.0.0";

    function mint(uint256 id, address owner) external {
        owners[id] = owner;
        wallets[id] = owner;
    }

    function transfer(uint256 id, address to) external {
        owners[id] = to;
        wallets[id] = address(0);
        approvals[id] = address(0);
    }

    function approve(uint256 id, address who) external {
        approvals[id] = who;
    }

    function setWallet(uint256 id, address w) external {
        wallets[id] = w;
    }

    function setOperator(address owner, address op, bool on) external {
        operators[owner][op] = on;
    }

    function setVersion(string calldata v) external {
        version = v;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return _owned(id);
    }

    function getApproved(uint256 id) external view returns (address) {
        _owned(id);
        return approvals[id];
    }

    function isApprovedForAll(address owner, address op) external view returns (bool) {
        return operators[owner][op];
    }

    function _owned(uint256 id) internal view returns (address o) {
        o = owners[id];
        if (o == address(0)) revert ERC721NonexistentToken(id);
    }

    function getAgentWallet(uint256 id) external view returns (address) {
        return wallets[id];
    }

    function isAuthorizedOrOwner(address spender, uint256 id) external view returns (bool) {
        address o = _owned(id);
        return spender == o || operators[o][spender] || approvals[id] == spender;
    }

    function getVersion() external view returns (string memory) {
        return version;
    }
}

/// ReputationRegistry mock with the same storage semantics as v2.0.0 (1-based index per pair, no block).
contract MockReputation {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    MockIdentity public id;
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) internal _fb;
    mapping(uint256 => mapping(address => uint64)) internal _last;
    string public version = "2.0.0";

    constructor(MockIdentity id_) {
        id = id_;
    }

    function setVersion(string calldata v) external {
        version = v;
    }

    function giveFeedback(uint256 agentId, int128 value, uint8 dec, string calldata tag1, string calldata tag2)
        external
        returns (uint64 idx)
    {
        require(dec <= 18, "too many decimals");
        require(value >= -1e38 && value <= 1e38, "value too large");
        require(!id.isAuthorizedOrOwner(msg.sender, agentId), "Self-feedback not allowed");
        idx = ++_last[agentId][msg.sender];
        _fb[agentId][msg.sender][idx] = Feedback(value, dec, false, tag1, tag2);
    }

    function revokeFeedback(uint256 agentId, uint64 idx) external {
        require(idx > 0 && idx <= _last[agentId][msg.sender], "index");
        _fb[agentId][msg.sender][idx].isRevoked = true;
    }

    function getLastIndex(uint256 agentId, address client) external view returns (uint64) {
        return _last[agentId][client];
    }

    function readFeedback(uint256 agentId, address client, uint64 idx)
        external
        view
        returns (int128, uint8, string memory, string memory, bool)
    {
        require(idx > 0, "index must be > 0");
        require(idx <= _last[agentId][client], "index out of bounds");
        Feedback storage f = _fb[agentId][client][idx];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    function getVersion() external view returns (string memory) {
        return version;
    }
}

/// Implementation whose getVersion() is `pure`, like the real ERC-8004 v2.0.0 implementations.
contract PureVersionImpl {
    function getVersion() external pure returns (string memory) {
        return "2.0.0";
    }
}

/// Minimal ERC-1967 delegating proxy: reproduces the cost structure of the real registries
/// (cold proxy account + cold implementation account + implementation-slot page).
contract Erc1967ProxyMock {
    bytes32 internal constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address impl) {
        assembly {
            sstore(IMPL_SLOT, impl)
        }
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPL_SLOT)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

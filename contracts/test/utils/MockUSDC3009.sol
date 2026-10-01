// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal FiatToken v2.2 stand-in for unit tests: EIP-3009 (bytes variants), EIP-2612 permit (bytes) and
/// the same SignatureChecker rule as Circle's (ERC-1271 STATICCALL whenever the signer has code, ecrecover
/// otherwise). Revert strings match FiatToken so that tests read the same as in the fork tests.
contract MockUSDC3009 {
    string public constant name = "USDC";
    string public constant version = "2";
    uint8 public constant decimals = 6;
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 internal constant TWA = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant RWA = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant CANCEL = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    bytes32 internal constant PERMIT =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => uint256) public nonces;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        require(allowance[f][msg.sender] >= v, "ERC20: transfer amount exceeds allowance");
        allowance[f][msg.sender] -= v;
        _move(f, to, v);
        return true;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        _auth(from, validAfter, validBefore, nonce);
        _requireValid(from, keccak256(abi.encode(TWA, from, to, value, validAfter, validBefore, nonce)), signature);
        authorizationState[from][nonce] = true;
        _move(from, to, value);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        require(to == msg.sender, "FiatTokenV2: caller must be the payee");
        _auth(from, validAfter, validBefore, nonce);
        _requireValid(from, keccak256(abi.encode(RWA, from, to, value, validAfter, validBefore, nonce)), signature);
        authorizationState[from][nonce] = true;
        _move(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, bytes memory signature) external {
        require(!authorizationState[authorizer][nonce], "FiatTokenV2: authorization is used or canceled");
        _requireValid(authorizer, keccak256(abi.encode(CANCEL, authorizer, nonce)), signature);
        authorizationState[authorizer][nonce] = true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, bytes memory signature) external {
        require(deadline >= block.timestamp, "FiatTokenV2: permit is expired");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(PERMIT, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        require(_isValidNow(owner, digest, signature), "EIP2612: invalid signature");
        allowance[owner][spender] = value;
    }

    function _auth(address from, uint256 validAfter, uint256 validBefore, bytes32 nonce) internal view {
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!authorizationState[from][nonce], "FiatTokenV2: authorization is used or canceled");
    }

    function _requireValid(address signer, bytes32 structHash, bytes memory sig) internal view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        require(_isValidNow(signer, digest, sig), "FiatTokenV2: invalid signature");
    }

    function _isValidNow(address signer, bytes32 digest, bytes memory sig) internal view returns (bool) {
        if (signer.code.length == 0) {
            if (sig.length != 65) return false;
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := mload(add(sig, 32))
                s := mload(add(sig, 64))
                v := byte(0, mload(add(sig, 96)))
            }
            return ecrecover(digest, v, r, s) == signer;
        }
        (bool ok, bytes memory ret) =
            signer.staticcall(abi.encodeWithSelector(0x1626ba7e, digest, sig));
        return ok && ret.length >= 32 && abi.decode(ret, (bytes32)) == bytes32(bytes4(0x1626ba7e));
    }

    function _move(address f, address to, uint256 v) internal {
        require(balanceOf[f] >= v, "ERC20: transfer amount exceeds balance");
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

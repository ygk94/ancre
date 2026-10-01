// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Base.t.sol";
import {TrustGatedPayer, IERC20Min, IDomainSeparator} from "../../src/TrustGatedPayer.sol";

/// Client side of the payer, written independently of the contract (the plugin does the same in TS):
/// builds the token authorisation digest, the operator's AncrePayment signature and the packed blob.
abstract contract PayerBase is AncreBase {
    bytes32 internal constant TWA = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant CANCEL_AUTH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    bytes32 internal constant PERMIT_TH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 internal constant TP = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 internal constant WIT = keccak256("Witness(address to,address facilitator,uint256 validAfter)");
    bytes32 internal constant PWTF = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,address facilitator,uint256 validAfter)"
    );
    // independent copy of the operator-side EIP-712 definitions (checked against the contract in a test)
    bytes32 internal constant ANCRE_PAYMENT = keccak256(
        "AncrePayment(address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint256 agentId)"
    );
    bytes32 internal constant ANCRE_UPTO = keccak256(
        "AncreUptoPayment(address to,uint256 cap,uint256 nonce,uint256 deadline,address facilitator,uint256 validAfter,uint256 agentId)"
    );
    bytes32 internal constant ANCRE_CANCEL = keccak256("AncreCancel(bytes32 nonce)");

    uint256 internal constant OP_KEY = 0xA11CE;
    uint256 internal constant SECP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;

    struct Auth {
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint256 agentId;
    }

    struct Upto {
        address to;
        uint256 cap;
        uint256 nonce;
        uint256 deadline;
        address facilitator;
        uint256 validAfter;
        uint256 agentId;
    }

    function _typed(bytes32 dom, bytes32 sh) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", dom, sh));
    }

    function _payerDomain(address payer) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ANCRE TrustGatedPayer"),
                keccak256("1"),
                block.chainid,
                payer
            )
        );
    }

    function _auth(address to, uint256 value, uint256 agentId, uint256 n) internal view returns (Auth memory a) {
        a = Auth(to, value, 0, block.timestamp + 300, bytes32(n), agentId);
    }

    function _twaDigest(address token, address from, Auth memory a) internal view returns (bytes32) {
        return _typed(
            IDomainSeparator(token).DOMAIN_SEPARATOR(),
            keccak256(abi.encode(TWA, from, a.to, a.value, a.validAfter, a.validBefore, a.nonce))
        );
    }

    function _opDigest(address payer, Auth memory a) internal view returns (bytes32) {
        return _typed(
            _payerDomain(payer),
            keccak256(abi.encode(ANCRE_PAYMENT, a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.agentId))
        );
    }

    function _sig(uint256 key, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function _packExact(Auth memory a, bytes memory opSig) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(1), a.agentId, a.to, a.value, a.validAfter, a.validBefore, a.nonce, opSig);
    }

    /// blob signed by `key` for payer `payer`, and the digest the token will present to isValidSignature
    function _exact(address token, address payer, uint256 key, Auth memory a)
        internal
        view
        returns (bytes memory blob, bytes32 digest)
    {
        blob = _packExact(a, _sig(key, _opDigest(payer, a)));
        digest = _twaDigest(token, payer, a);
    }

    function _uptoDigest(address token, address p2, address proxy, Upto memory u) internal view returns (bytes32) {
        return _typed(
            IDomainSeparator(p2).DOMAIN_SEPARATOR(),
            keccak256(
                abi.encode(
                    PWTF,
                    keccak256(abi.encode(TP, token, u.cap)),
                    proxy,
                    u.nonce,
                    u.deadline,
                    keccak256(abi.encode(WIT, u.to, u.facilitator, u.validAfter))
                )
            )
        );
    }

    function _upto(address payer, uint256 key, Upto memory u) internal view returns (bytes memory) {
        bytes32 od = _typed(
            _payerDomain(payer),
            keccak256(
                abi.encode(ANCRE_UPTO, u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, u.agentId)
            )
        );
        return abi.encodePacked(
            uint8(2), u.agentId, u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, _sig(key, od)
        );
    }

    function _cancel(address token, address payer, uint256 key, bytes32 n)
        internal
        view
        returns (bytes memory blob, bytes32 digest)
    {
        bytes32 od = _typed(_payerDomain(payer), keccak256(abi.encode(ANCRE_CANCEL, n)));
        blob = abi.encodePacked(uint8(3), n, _sig(key, od));
        digest = _typed(IDomainSeparator(token).DOMAIN_SEPARATOR(), keccak256(abi.encode(CANCEL_AUTH, payer, n)));
    }

    /// same signature with s' = n - s and flipped v: valid for ecrecover, must be refused (malleability)
    function _highS(bytes memory sig) internal pure returns (bytes memory) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return abi.encodePacked(r, bytes32(SECP_N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
    }
}

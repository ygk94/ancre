// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AnchoredReputation} from "./AnchoredReputation.sol";
import {IIdentityRegistry8004} from "./interfaces/IERC8004.sol";

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IDomainSeparator {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @title TrustGatedPayer — an x402 payer that refuses to pay agents ANCRE does not trust (D41).
/// @notice A keyless ERC-1271 account that holds the USDC. An operator (the agent's wallet) signs an
/// `AncrePayment` (EIP-712, this contract's domain) for each payment; the USDC (EIP-3009, `exact`) or
/// Permit2 (`upto`) calls `isValidSignature` during the facilitator's settlement transaction, and the
/// signature is valid only if, AT THAT BLOCK:
///   1. the presented hash is exactly the token authorisation rebuilt from the blob (from = this);
///   2. the amount is <= maxPerPayment;
///   3. the payee is the ERC-8004 agentWallet of the declared agentId;
///   4. an operator signed the AncrePayment;
///   5. `AnchoredReputation.isTrusted(agentId, setId)` is true (D39: never the status alone, AM-6.1).
/// Nothing changes in x402, the facilitator or the token. The only way around the gate is a plain
/// `transfer` by a key holding USDC (AM-6.9): this contract has no key, and funds only leave it through
/// a guarded authorisation or `sweep` to the immutable treasury.
/// @dev Blob layouts (abi.encodePacked, fixed lengths, parsed without abi.decode so that
/// isValidSignature never reverts; every layout is > 65 bytes, so x402-rs classifies it as EIP-1271):
///   kind 1 EIP-3009 : 0x01 | agentId u256 | to addr | value u256 | validAfter u256 | validBefore u256 | nonce b32 | opSig 65
///   kind 2 upto     : 0x02 | agentId u256 | to addr | cap u256 | p2Nonce u256 | deadline u256 | facilitator addr | validAfter u256 | opSig 65
///   kind 3 cancel   : 0x03 | nonce b32 | opSig 65   (EIP-3009 cancelAuthorization, operator only, no ANCRE check)
/// Any other digest (EIP-2612 permit, Permit2 PermitSingle/PermitBatch, receiveWithAuthorization, ...)
/// is refused: those paths also go through ERC-1271 and would otherwise grant allowances.
contract TrustGatedPayer {
    // ------------------------------------------------------------------ constants
    bytes4 internal constant MAGIC = 0x1626ba7e;
    bytes4 internal constant INVALID = 0xffffffff;
    uint256 public constant MAX_OPERATORS = 4;
    uint256 internal constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 internal constant WALLET_CALL_GAS = 60_000;

    uint8 public constant KIND_EXACT = 1;
    uint8 public constant KIND_UPTO = 2;
    uint8 public constant KIND_CANCEL = 3;
    uint256 internal constant LEN_EXACT = 1 + 32 + 20 + 32 * 4 + 65; // 246
    uint256 internal constant LEN_UPTO = 1 + 32 + 20 + 32 * 3 + 20 + 32 + 65; // 266
    uint256 internal constant LEN_CANCEL = 1 + 32 + 65; // 98

    // token-side type hashes (FiatToken v2.2, Permit2, x402UptoPermit2Proxy)
    bytes32 internal constant TWA_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 internal constant CANCEL_AUTH_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    bytes32 internal constant TP_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 internal constant WITNESS_TYPEHASH = keccak256("Witness(address to,address facilitator,uint256 validAfter)");
    bytes32 internal constant PWTF_TYPEHASH = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,address facilitator,uint256 validAfter)"
    );

    // operator-side type hashes (this contract's EIP-712 domain: what the human reads in the wallet)
    bytes32 public constant ANCRE_PAYMENT_TYPEHASH = keccak256(
        "AncrePayment(address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint256 agentId)"
    );
    bytes32 public constant ANCRE_UPTO_TYPEHASH = keccak256(
        "AncreUptoPayment(address to,uint256 cap,uint256 nonce,uint256 deadline,address facilitator,uint256 validAfter,uint256 agentId)"
    );
    bytes32 public constant ANCRE_CANCEL_TYPEHASH = keccak256("AncreCancel(bytes32 nonce)");
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant NAME_HASH = keccak256("ANCRE TrustGatedPayer");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    // ------------------------------------------------------------------ types
    enum Reason {
        OK,
        PAUSED, // the owner (or an operator) paused the payer
        BAD_FORMAT, // blob length does not match its kind
        BAD_KIND, // unknown kind: never sign anything else (permit, PermitSingle, ...)
        DIGEST_MISMATCH, // the presented hash is not the authorisation rebuilt from the blob
        OVER_LIMIT, // value (or upto cap) > maxPerPayment
        NO_WALLET, // agentWallet(agentId) unreadable or 0 (e.g. cleared by a transfer)
        WALLET_MISMATCH, // payee != agentWallet(agentId): the server lied about the agent
        BAD_OPERATOR_SIG, // the AncrePayment is not signed by an operator (or high-s / bad v)
        ANCRE_STATUS, // ANCRE cannot conclude: status != OK (NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED)
        UNTRUSTED // status OK but isTrusted is false (unknown agent, below theta / rho)
    }

    // ------------------------------------------------------------------ immutables
    IERC20Min public immutable usdc;
    address public immutable permit2;
    address public immutable uptoProxy;
    AnchoredReputation public immutable ancre;
    IIdentityRegistry8004 public immutable identity;
    address public immutable treasury;
    uint256 internal immutable _chainId;
    bytes32 internal immutable _domainSeparator;

    // ------------------------------------------------------------------ storage (one MIP-8 page)
    address public owner; // slot 0
    bool public paused; // slot 0
    bytes32 public setId; // slot 1
    uint256 public maxPerPayment; // slot 2, token base units (USDC: 6 decimals)
    address[4] internal _operators; // slots 3..6

    // ------------------------------------------------------------------ events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorSet(address indexed operator, bool allowed);
    event PolicySet(bytes32 indexed setId, uint256 maxPerPayment);
    event PausedSet(bool paused, address indexed by);
    event Swept(address indexed token, address indexed treasury, uint256 amount);
    /// A genuine operator-signed payment that the payer refuses at this block (permissionless trace, AM-6.8).
    event RefusalReported(
        bytes32 indexed hash,
        uint256 indexed agentId,
        address indexed to,
        Reason reason,
        uint8 status,
        bytes32 triggerTag,
        uint256 trustLow,
        uint256 distrustUp,
        uint256 value
    );

    error NotOwner();
    error NotOwnerOrOperator();
    error ZeroAddress();
    error OperatorsFull();
    error UnknownSet();
    error NotRefused(Reason reason); // reportRefusal: the payment would be paid (OK) or is not an operator's
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        IERC20Min usdc_,
        address permit2_,
        address uptoProxy_,
        AnchoredReputation ancre_,
        address owner_,
        address treasury_,
        address operator_,
        bytes32 setId_,
        uint256 maxPerPayment_
    ) {
        if (
            address(usdc_) == address(0) || address(ancre_) == address(0) || owner_ == address(0)
                || treasury_ == address(0) || operator_ == address(0)
        ) revert ZeroAddress();
        usdc = usdc_;
        permit2 = permit2_;
        uptoProxy = uptoProxy_;
        ancre = ancre_;
        identity = ancre_.identity();
        treasury = treasury_;
        _chainId = block.chainid;
        _domainSeparator = _buildDomainSeparator();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
        _operators[0] = operator_;
        emit OperatorSet(operator_, true);
        _setPolicy(setId_, maxPerPayment_);
    }

    // ================================================================== ERC-1271
    /// @notice Called in STATICCALL by the USDC (EIP-3009) or Permit2 during settlement. Never reverts.
    function isValidSignature(bytes32 hash, bytes calldata blob) external view returns (bytes4) {
        (Reason r,,,,) = _check(hash, blob, false);
        return r == Reason.OK ? MAGIC : INVALID;
    }

    // ================================================================== reading (screen, plugin)
    /// @notice The payment decision BEFORE signing (soft guard of the plugin, D41): same rules as
    /// isValidSignature minus the digest and the operator signature.
    /// @param value amount in token base units (0 = "may I pay this agent anything at all?")
    function decide(uint256 agentId, address to, uint256 value)
        external
        view
        returns (Reason reason, AnchoredReputation.Assessment memory a)
    {
        if (paused) return (Reason.PAUSED, a);
        if (value > maxPerPayment) return (Reason.OVER_LIMIT, a);
        Reason w = _walletCheck(agentId, to);
        if (w != Reason.OK) return (w, a);
        return _ancreDetail(agentId);
    }

    /// @notice Why isValidSignature(hash, blob) accepts or refuses, at this block (eth_call it at the
    /// block of a refused attempt to rebuild the refusal for the screen: a refusal leaves no on-chain trace).
    function explain(bytes32 hash, bytes calldata blob)
        external
        view
        returns (Reason reason, uint8 kind, uint256 agentId, address to, uint256 value, AnchoredReputation.Assessment memory a)
    {
        return _explain(hash, blob);
    }

    /// @notice Permissionless on-chain trace of a refusal (the refusal itself happens in a STATICCALL and
    /// cannot emit). Only for a genuine operator-signed payment whose refusal comes from the policy
    /// (paused, limit, wallet, ANCRE): a forged or malformed blob cannot be used to post fake refusals.
    function reportRefusal(bytes32 hash, bytes calldata blob) external returns (Reason reason) {
        uint8 kind;
        uint256 agentId;
        address to;
        uint256 value;
        AnchoredReputation.Assessment memory a;
        (reason, kind, agentId, to, value, a) = _explain(hash, blob);
        if (
            reason == Reason.OK || reason == Reason.BAD_FORMAT || reason == Reason.BAD_KIND
                || reason == Reason.DIGEST_MISMATCH || reason == Reason.BAD_OPERATOR_SIG || kind == KIND_CANCEL
        ) revert NotRefused(reason);
        if (!_operatorSigned(kind, blob)) revert NotRefused(Reason.BAD_OPERATOR_SIG); // checks skipped by an early refusal
        emit RefusalReported(hash, agentId, to, reason, uint8(a.status), a.triggerTag, a.trustLow, a.distrustUp, value);
    }

    function operators() external view returns (address[4] memory) {
        return _operators;
    }

    function isOperator(address who) public view returns (bool) {
        if (who == address(0)) return false;
        for (uint256 i; i < MAX_OPERATORS; ++i) {
            if (_operators[i] == who) return true;
        }
        return false;
    }

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == _chainId ? _domainSeparator : _buildDomainSeparator();
    }

    /// EIP-712 digest the operator signs for a kind-1 (exact) payment.
    function paymentDigest(address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint256 agentId)
        public
        view
        returns (bytes32)
    {
        return _typed(
            domainSeparator(),
            keccak256(abi.encode(ANCRE_PAYMENT_TYPEHASH, to, value, validAfter, validBefore, nonce, agentId))
        );
    }

    /// EIP-712 digest the operator signs for a kind-2 (upto) payment.
    function uptoDigest(
        address to,
        uint256 cap,
        uint256 p2Nonce,
        uint256 deadline,
        address facilitator,
        uint256 validAfter,
        uint256 agentId
    ) public view returns (bytes32) {
        return _typed(
            domainSeparator(),
            keccak256(abi.encode(ANCRE_UPTO_TYPEHASH, to, cap, p2Nonce, deadline, facilitator, validAfter, agentId))
        );
    }

    function cancelDigest(bytes32 nonce) public view returns (bytes32) {
        return _typed(domainSeparator(), keccak256(abi.encode(ANCRE_CANCEL_TYPEHASH, nonce)));
    }

    // ================================================================== administration
    function setOperator(address op, bool allowed) external onlyOwner {
        if (op == address(0)) revert ZeroAddress();
        uint256 free = MAX_OPERATORS;
        for (uint256 i; i < MAX_OPERATORS; ++i) {
            address cur = _operators[i];
            if (cur == op) {
                if (!allowed) {
                    _operators[i] = address(0);
                    emit OperatorSet(op, false);
                }
                return;
            }
            if (cur == address(0) && free == MAX_OPERATORS) free = i;
        }
        if (!allowed) return;
        if (free == MAX_OPERATORS) revert OperatorsFull();
        _operators[free] = op;
        emit OperatorSet(op, true);
    }

    /// The anchor set (hence theta, rho, m, q, maxAge... committed in its setId, D39) and the per-payment cap.
    function setPolicy(bytes32 setId_, uint256 maxPerPayment_) external onlyOwner {
        _setPolicy(setId_, maxPerPayment_);
    }

    /// The owner pauses and unpauses; an operator may only pause (emergency brake, never a way to pay).
    function setPaused(bool p) external {
        if (msg.sender != owner && !(p && isOperator(msg.sender))) revert NotOwnerOrOperator();
        paused = p;
        emit PausedSet(p, msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// One-time allowance for `upto`. Safe: Permit2 can only move funds with a signature of this contract,
    /// and isValidSignature never validates a PermitSingle / PermitBatch digest.
    function approvePermit2(uint256 amount) external onlyOwner {
        if (!usdc.approve(permit2, amount)) revert TransferFailed();
    }

    /// Funds leave only to the immutable treasury (the human), never to the operator (AM-6.9).
    function sweep(address token, uint256 amount) external {
        if (msg.sender != owner && msg.sender != treasury) revert NotOwner();
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20Min.transfer, (treasury, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
        emit Swept(token, treasury, amount);
    }

    // ================================================================== internals
    function _setPolicy(bytes32 setId_, uint256 maxPerPayment_) internal {
        if (ancre.policyOf(setId_).theta == 0) revert UnknownSet(); // theta > 0 is enforced at registration
        setId = setId_;
        maxPerPayment = maxPerPayment_;
        emit PolicySet(setId_, maxPerPayment_);
    }

    /// The decision of _check with the full Assessment whenever the blob parses (even when an earlier rule
    /// refused: the screen shows the trust next to an OVER_LIMIT or a WALLET_MISMATCH).
    function _explain(bytes32 hash, bytes calldata blob)
        internal
        view
        returns (Reason reason, uint8 kind, uint256 agentId, address to, uint256 value, AnchoredReputation.Assessment memory a)
    {
        (reason, kind, agentId, to, value) = _check(hash, blob, true);
        if (reason != Reason.BAD_FORMAT && reason != Reason.BAD_KIND && kind != KIND_CANCEL) {
            a = ancre.assess(agentId, setId, true);
        }
    }

    /// @param detail use assess (full Assessment, explain path) instead of the cheaper isTrusted
    function _check(bytes32 hash, bytes calldata blob, bool detail)
        internal
        view
        returns (Reason r, uint8 kind, uint256 agentId, address to, uint256 value)
    {
        if (blob.length == 0) return (Reason.BAD_FORMAT, 0, 0, address(0), 0);
        kind = uint8(blob[0]);
        bytes32 digest;
        bytes32 opDigest;
        bytes calldata opSig;
        if (kind == KIND_EXACT) {
            if (blob.length != LEN_EXACT) return (Reason.BAD_FORMAT, kind, 0, address(0), 0);
            agentId = uint256(bytes32(blob[1:33]));
            to = address(bytes20(blob[33:53]));
            value = uint256(bytes32(blob[53:85]));
            uint256 va = uint256(bytes32(blob[85:117]));
            uint256 vb = uint256(bytes32(blob[117:149]));
            bytes32 n = bytes32(blob[149:181]);
            opSig = blob[181:246];
            digest = _typed(
                IDomainSeparator(address(usdc)).DOMAIN_SEPARATOR(),
                keccak256(abi.encode(TWA_TYPEHASH, address(this), to, value, va, vb, n))
            );
            opDigest = paymentDigest(to, value, va, vb, n, agentId);
        } else if (kind == KIND_UPTO) {
            if (permit2 == address(0) || uptoProxy == address(0)) return (Reason.BAD_KIND, kind, 0, address(0), 0);
            if (blob.length != LEN_UPTO) return (Reason.BAD_FORMAT, kind, 0, address(0), 0);
            agentId = uint256(bytes32(blob[1:33]));
            to = address(bytes20(blob[33:53]));
            value = uint256(bytes32(blob[53:85])); // the cap is what the authorisation commits
            uint256 p2n = uint256(bytes32(blob[85:117]));
            uint256 dl = uint256(bytes32(blob[117:149]));
            address fac = address(bytes20(blob[149:169]));
            uint256 va = uint256(bytes32(blob[169:201]));
            opSig = blob[201:266];
            digest = _typed(
                IDomainSeparator(permit2).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        PWTF_TYPEHASH,
                        keccak256(abi.encode(TP_TYPEHASH, address(usdc), value)),
                        uptoProxy,
                        p2n,
                        dl,
                        keccak256(abi.encode(WITNESS_TYPEHASH, to, fac, va))
                    )
                )
            );
            opDigest = uptoDigest(to, value, p2n, dl, fac, va, agentId);
        } else if (kind == KIND_CANCEL) {
            if (blob.length != LEN_CANCEL) return (Reason.BAD_FORMAT, kind, 0, address(0), 0);
            bytes32 n = bytes32(blob[1:33]);
            opSig = blob[33:98];
            digest = _typed(
                IDomainSeparator(address(usdc)).DOMAIN_SEPARATOR(),
                keccak256(abi.encode(CANCEL_AUTH_TYPEHASH, address(this), n))
            );
            if (digest != hash) return (Reason.DIGEST_MISMATCH, kind, 0, address(0), 0);
            // cancelling a nonce never moves funds: operator only, works even when paused
            return (isOperator(_recover(cancelDigest(n), opSig)) ? Reason.OK : Reason.BAD_OPERATOR_SIG, kind, 0, address(0), 0);
        } else {
            return (Reason.BAD_KIND, kind, 0, address(0), 0);
        }

        // cheapest checks first; ANCRE (29 k to 170 k gas) last
        if (digest != hash) return (Reason.DIGEST_MISMATCH, kind, agentId, to, value);
        if (paused) return (Reason.PAUSED, kind, agentId, to, value);
        if (value > maxPerPayment) return (Reason.OVER_LIMIT, kind, agentId, to, value);
        r = _walletCheck(agentId, to);
        if (r != Reason.OK) return (r, kind, agentId, to, value);
        if (!isOperator(_recover(opDigest, opSig))) return (Reason.BAD_OPERATOR_SIG, kind, agentId, to, value);
        if (detail) {
            (r,) = _ancreDetail(agentId);
        } else {
            r = _isTrusted(agentId) ? Reason.OK : Reason.UNTRUSTED; // reason detail only via explain
        }
    }

    /// Re-verifies the operator signature (used by reportRefusal when _check stopped before it).
    function _operatorSigned(uint8 kind, bytes calldata blob) internal view returns (bool) {
        uint256 agentId = uint256(bytes32(blob[1:33]));
        address to = address(bytes20(blob[33:53]));
        uint256 v = uint256(bytes32(blob[53:85]));
        if (kind == KIND_EXACT) {
            bytes32 d = paymentDigest(
                to, v, uint256(bytes32(blob[85:117])), uint256(bytes32(blob[117:149])), bytes32(blob[149:181]), agentId
            );
            return isOperator(_recover(d, blob[181:246]));
        }
        bytes32 du = uptoDigest(
            to,
            v,
            uint256(bytes32(blob[85:117])),
            uint256(bytes32(blob[117:149])),
            address(bytes20(blob[149:169])),
            uint256(bytes32(blob[169:201])),
            agentId
        );
        return isOperator(_recover(du, blob[201:266]));
    }

    /// payee must be the agent's ERC-8004 agentWallet: a server lying about agentId can only claim an
    /// agent whose wallet it already controls. No fallback to ownerOf: the wallet is cleared on transfer,
    /// and a transferred agent is not payable anyway (TRANSFERRED).
    function _walletCheck(uint256 agentId, address to) internal view returns (Reason) {
        (bool ok, bytes memory ret) =
            address(identity).staticcall{gas: WALLET_CALL_GAS}(abi.encodeCall(IIdentityRegistry8004.getAgentWallet, (agentId)));
        if (!ok || ret.length != 32) return Reason.NO_WALLET;
        uint256 w = abi.decode(ret, (uint256));
        if (w == 0 || w >> 160 != 0) return Reason.NO_WALLET;
        return address(uint160(w)) == to ? Reason.OK : Reason.WALLET_MISMATCH;
    }

    function _isTrusted(uint256 agentId) internal view returns (bool) {
        (bool ok, bytes memory ret) =
            address(ancre).staticcall(abi.encodeCall(AnchoredReputation.isTrusted, (agentId, setId)));
        return ok && ret.length == 32 && uint256(bytes32(ret)) == 1; // fail closed
    }

    function _ancreDetail(uint256 agentId) internal view returns (Reason r, AnchoredReputation.Assessment memory a) {
        a = ancre.assess(agentId, setId, true);
        if (a.status != AnchoredReputation.Status.OK) return (Reason.ANCRE_STATUS, a);
        return (a.trusted ? Reason.OK : Reason.UNTRUSTED, a);
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) return address(0);
        return ecrecover(h, v, r, s);
    }

    function _typed(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }
}

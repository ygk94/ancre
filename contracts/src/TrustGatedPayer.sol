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

interface IEIP3009State {
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

interface IPermit2Nonces {
    function nonceBitmap(address owner, uint256 wordPos) external view returns (uint256);
}

/// @title TrustGatedPayer — an x402 payer that refuses to pay agents ANCRE does not trust (D41).
/// @notice A keyless ERC-1271 account that holds the USDC. An operator (the agent's wallet) signs an
/// `AncrePayment` (EIP-712, this contract's domain) for each payment; the USDC (EIP-3009, `exact`) or
/// Permit2 (`upto`) calls `isValidSignature` during the facilitator's settlement transaction, and the
/// signature is valid only if, AT THAT BLOCK:
///   1. the presented hash is exactly the token authorisation rebuilt from the blob (from = this);
///   2. the payer is not paused and the amount is <= maxPerPayment;
///   3. the payee is the ERC-8004 agentWallet of the declared agentId;
///   4. an operator signed the AncrePayment;
///   5. `AnchoredReputation.passesAnchorPolicy(agentId, setId)` is true (D39: never the status alone, AM-6.1;
///      renamed from isTrusted by D48, AM-9.5).
/// The set must be in strict transfer mode (D35): in fast mode a sold agent stays OK until someone proves the
/// transfer, and the payer would pay the buyer's new agentWallet on the seller's reputation (R8, 05/10).
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
/// Known limit (D20, AM-05.1): agentWallet is not unique; paying a wallet shared by several agents on the
/// reputation of one of them pays that wallet's controller, whichever agent actually served.
contract TrustGatedPayer {
    // ------------------------------------------------------------------ constants
    bytes4 internal constant MAGIC = 0x1626ba7e;
    bytes4 internal constant INVALID = 0xffffffff;
    uint256 public constant MAX_OPERATORS = 4;
    uint256 internal constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    /// same per-call cap as AnchoredReputation.VIEW_CALL_GAS: a registry upgrade that makes the getter cost
    /// more than this would already make ANCRE fail closed (REGISTRY_CHANGED); the payer fails closed too.
    uint256 internal constant REGISTRY_CALL_GAS = 120_000;
    /// DOMAIN_SEPARATOR of a cold FiatToken proxy on Monad: 2 cold accounts (10 100 each) + cold pages;
    /// a 30 k cap was measured too low in fork (reportRefusal / eth_call paths with a cold USDC).
    uint256 internal constant DOMAIN_CALL_GAS = REGISTRY_CALL_GAS;

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
        BAD_KIND, // unknown kind (or upto not configured): never sign anything else (permit, PermitSingle, ...)
        DIGEST_MISMATCH, // the presented hash is not the authorisation rebuilt from the blob
        OVER_LIMIT, // value (or upto cap) > maxPerPayment
        NO_WALLET, // agentWallet(agentId) unreadable or 0 (e.g. cleared by a transfer)
        WALLET_MISMATCH, // payee != agentWallet(agentId): the server lied about the agent
        BAD_OPERATOR_SIG, // the AncrePayment is not signed by an operator (or high-s / bad v)
        ANCRE_STATUS, // ANCRE cannot conclude: status != OK (NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED)
        UNTRUSTED // status OK but passesAnchorPolicy is false (unknown agent, below theta / rho)
    }

    /// A parsed blob. `parse` != OK means the blob is not a payment of this contract for `hash`.
    struct Payment {
        Reason parse; // OK, BAD_FORMAT, BAD_KIND or DIGEST_MISMATCH
        uint8 kind;
        uint256 agentId;
        address to;
        uint256 value; // exact: value; upto: cap (what the authorisation commits)
        uint256 validAfter;
        uint256 validUntil; // exact: validBefore (exclusive); upto: Permit2 deadline (inclusive)
        bytes32 nonce; // exact: EIP-3009 nonce; upto: Permit2 nonce
        bytes32 opDigest; // what the operator signed (this contract's EIP-712 domain)
        uint256 sigOff; // offset of the 65-byte operator signature in the blob
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

    // ------------------------------------------------------------------ storage (slots 0..6: one MIP-8 page)
    address public owner; // slot 0
    bool public paused; // slot 0
    bytes32 public setId; // slot 1
    uint256 public maxPerPayment; // slot 2, token base units (USDC: 6 decimals)
    address[4] internal _operators; // slots 3..6
    /// token authorisation hash -> already reported (reportRefusal is one trace per authorisation)
    mapping(bytes32 => bool) public reported;

    // ------------------------------------------------------------------ events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorSet(address indexed operator, bool allowed);
    event PolicySet(bytes32 indexed setId, uint256 maxPerPayment);
    event PausedSet(bool paused, address indexed by);
    event Swept(address indexed token, address indexed treasury, uint256 amount);
    /// A genuine, still-settleable operator-signed payment that the payer refuses at this block
    /// (permissionless trace: a refusal happens in a STATICCALL and cannot emit, AM-6.8).
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
    error NoCode(address target);
    error OperatorsFull();
    error UnknownSet();
    error NotRefused(Reason reason); // reportRefusal: the payment would be paid (OK) or is not an operator's
    error NotSettleable(); // reportRefusal: already used / cancelled, expired or not yet valid
    error AlreadyReported();
    error TransferFailed();
    error FastTransferSet(); // R8: the set does not read ownerOf live (strictTransfer = false)
    error OperatorIsTreasury(); // R8: one key would sign payments AND receive every sweep

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param permit2_ / uptoProxy_ both 0 to disable `upto` (kind 2 is then refused as BAD_KIND)
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
        if (owner_ == address(0) || treasury_ == address(0) || operator_ == address(0)) revert ZeroAddress();
        if (operator_ == treasury_) revert OperatorIsTreasury();
        if (address(usdc_).code.length == 0) revert NoCode(address(usdc_));
        if (address(ancre_).code.length == 0) revert NoCode(address(ancre_));
        if ((permit2_ == address(0)) != (uptoProxy_ == address(0))) revert ZeroAddress();
        if (permit2_ != address(0)) {
            if (permit2_.code.length == 0) revert NoCode(permit2_);
            if (uptoProxy_.code.length == 0) revert NoCode(uptoProxy_);
        }
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
    /// Cheapest checks first; ANCRE last (passesAnchorPolicy: 28 882 gas for a cheap refusal, about 182 k
    /// with the strict veto by approval at k = 3; MEASURED on a mainnet fork, 2026-10-06, GAS.md §02-bis); no Assessment is built on this path.
    function isValidSignature(bytes32 hash, bytes calldata blob) external view returns (bytes4) {
        Payment memory p = _parse(hash, blob);
        if (p.parse != Reason.OK) return INVALID;
        if (p.kind == KIND_CANCEL) return _sigOk(p, blob) ? MAGIC : INVALID; // never moves funds; works when paused
        if (_policy(p.agentId, p.to, p.value) != Reason.OK) return INVALID;
        if (!_sigOk(p, blob)) return INVALID;
        return _passes(p.agentId) ? MAGIC : INVALID;
    }

    // ================================================================== reading (screen, plugin)
    /// @notice The payment decision BEFORE signing (soft guard of the plugin, D41): the same rules as
    /// isValidSignature minus the digest and the operator signature, with the full Assessment.
    /// @param value amount in token base units (0 = "may I pay this agent anything at all?")
    function decide(uint256 agentId, address to, uint256 value)
        external
        view
        returns (Reason reason, AnchoredReputation.Assessment memory a)
    {
        a = ancre.assess(agentId, setId, true);
        reason = _policy(agentId, to, value);
        if (reason == Reason.OK) reason = _ancreReason(a);
    }

    /// @notice Why isValidSignature(hash, blob) accepts or refuses, at this block (eth_call it at the
    /// block of a refused attempt to rebuild the refusal for the screen: a refusal leaves no on-chain trace).
    /// The reason is the first failing rule in isValidSignature's order; the Assessment is always filled
    /// once the blob parses (the screen shows the trust next to an OVER_LIMIT or a WALLET_MISMATCH).
    function explain(bytes32 hash, bytes calldata blob)
        external
        view
        returns (Reason reason, uint8 kind, uint256 agentId, address to, uint256 value, AnchoredReputation.Assessment memory a)
    {
        Payment memory p;
        (reason, p, a,) = _explain(hash, blob);
        return (reason, p.kind, p.agentId, p.to, p.value, a);
    }

    /// @notice Permissionless on-chain trace of a refusal, once per authorisation. Only for a genuine
    /// operator-signed payment that could still settle (unused nonce, inside its validity window) and that
    /// the policy refuses (paused, limit, wallet, ANCRE): forged, malformed, already paid, cancelled or
    /// expired authorisations cannot be used to post refusals.
    function reportRefusal(bytes32 hash, bytes calldata blob) external returns (Reason reason) {
        (Reason r, Payment memory p, AnchoredReputation.Assessment memory a, bool sigOk) = _explain(hash, blob);
        if (p.parse != Reason.OK || r == Reason.OK || p.kind == KIND_CANCEL) revert NotRefused(r);
        if (!sigOk) revert NotRefused(Reason.BAD_OPERATOR_SIG);
        if (!_settleable(p)) revert NotSettleable();
        if (reported[hash]) revert AlreadyReported();
        reported[hash] = true;
        emit RefusalReported(hash, p.agentId, p.to, r, uint8(a.status), a.triggerTag, a.trustLow, a.distrustUp, p.value);
        return r;
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
        if (allowed && op == treasury) revert OperatorIsTreasury();
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
        if (permit2 == address(0)) revert ZeroAddress();
        if (!usdc.approve(permit2, amount)) revert TransferFailed();
    }

    /// Funds leave only to the immutable treasury (the human), never to the operator (AM-6.9).
    function sweep(address token, uint256 amount) external {
        if (msg.sender != owner && msg.sender != treasury) revert NotOwner();
        if (token.code.length == 0) revert NoCode(token);
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20Min.transfer, (treasury, amount)));
        if (!ok || (ret.length != 0 && (ret.length != 32 || abi.decode(ret, (uint256)) != 1))) revert TransferFailed();
        emit Swept(token, treasury, amount);
    }

    // ================================================================== internals
    function _setPolicy(bytes32 setId_, uint256 maxPerPayment_) internal {
        AnchoredReputation.Policy memory q = ancre.policyOf(setId_);
        if (q.theta == 0) revert UnknownSet(); // theta > 0 is enforced at registration
        if (!q.strictTransfer) revert FastTransferSet();
        setId = setId_;
        maxPerPayment = maxPerPayment_;
        emit PolicySet(setId_, maxPerPayment_);
    }

    /// Parses the blob, rebuilds the token digest and checks it against `hash`. Never reverts.
    function _parse(bytes32 hash, bytes calldata blob) internal view returns (Payment memory p) {
        if (blob.length == 0) {
            p.parse = Reason.BAD_FORMAT;
            return p;
        }
        p.kind = uint8(blob[0]);
        bool ok;
        bytes32 dom;
        bytes32 digest;
        if (p.kind == KIND_EXACT) {
            if (blob.length != LEN_EXACT) {
                p.parse = Reason.BAD_FORMAT;
                return p;
            }
            p.agentId = uint256(bytes32(blob[1:33]));
            p.to = address(bytes20(blob[33:53]));
            p.value = uint256(bytes32(blob[53:85]));
            p.validAfter = uint256(bytes32(blob[85:117]));
            p.validUntil = uint256(bytes32(blob[117:149]));
            p.nonce = bytes32(blob[149:181]);
            p.sigOff = 181;
            (ok, dom) = _domainOf(address(usdc));
            digest = _typed(
                dom, keccak256(abi.encode(TWA_TYPEHASH, address(this), p.to, p.value, p.validAfter, p.validUntil, p.nonce))
            );
            p.opDigest = paymentDigest(p.to, p.value, p.validAfter, p.validUntil, p.nonce, p.agentId);
        } else if (p.kind == KIND_UPTO) {
            if (permit2 == address(0)) {
                p.parse = Reason.BAD_KIND;
                return p;
            }
            if (blob.length != LEN_UPTO) {
                p.parse = Reason.BAD_FORMAT;
                return p;
            }
            p.agentId = uint256(bytes32(blob[1:33]));
            p.to = address(bytes20(blob[33:53]));
            p.value = uint256(bytes32(blob[53:85]));
            p.nonce = bytes32(blob[85:117]);
            p.validUntil = uint256(bytes32(blob[117:149]));
            address fac = address(bytes20(blob[149:169]));
            p.validAfter = uint256(bytes32(blob[169:201]));
            p.sigOff = 201;
            (ok, dom) = _domainOf(permit2);
            digest = _typed(
                dom,
                keccak256(
                    abi.encode(
                        PWTF_TYPEHASH,
                        keccak256(abi.encode(TP_TYPEHASH, address(usdc), p.value)),
                        uptoProxy,
                        uint256(p.nonce),
                        p.validUntil,
                        keccak256(abi.encode(WITNESS_TYPEHASH, p.to, fac, p.validAfter))
                    )
                )
            );
            p.opDigest = uptoDigest(p.to, p.value, uint256(p.nonce), p.validUntil, fac, p.validAfter, p.agentId);
        } else if (p.kind == KIND_CANCEL) {
            if (blob.length != LEN_CANCEL) {
                p.parse = Reason.BAD_FORMAT;
                return p;
            }
            p.nonce = bytes32(blob[1:33]);
            p.sigOff = 33;
            (ok, dom) = _domainOf(address(usdc));
            digest = _typed(dom, keccak256(abi.encode(CANCEL_AUTH_TYPEHASH, address(this), p.nonce)));
            p.opDigest = cancelDigest(p.nonce);
        } else {
            p.parse = Reason.BAD_KIND;
            return p;
        }
        if (!ok || digest != hash) p.parse = Reason.DIGEST_MISMATCH;
    }

    /// paused, then cap, then payee == agentWallet(agentId)
    function _policy(uint256 agentId, address to, uint256 value) internal view returns (Reason) {
        if (paused) return Reason.PAUSED;
        if (value > maxPerPayment) return Reason.OVER_LIMIT;
        return _walletCheck(agentId, to);
    }

    /// Same decision as isValidSignature, with the Assessment and the signature verdict always computed.
    function _explain(bytes32 hash, bytes calldata blob)
        internal
        view
        returns (Reason r, Payment memory p, AnchoredReputation.Assessment memory a, bool sigOk)
    {
        p = _parse(hash, blob);
        if (p.parse != Reason.OK) return (p.parse, p, a, false);
        sigOk = _sigOk(p, blob);
        if (p.kind == KIND_CANCEL) return (sigOk ? Reason.OK : Reason.BAD_OPERATOR_SIG, p, a, sigOk);
        a = ancre.assess(p.agentId, setId, true);
        r = _policy(p.agentId, p.to, p.value);
        if (r == Reason.OK) r = sigOk ? _ancreReason(a) : Reason.BAD_OPERATOR_SIG;
    }

    /// The authorisation could still be settled now (otherwise a "refusal" trace would be misleading).
    function _settleable(Payment memory p) internal view returns (bool) {
        if (p.kind == KIND_EXACT) {
            if (block.timestamp <= p.validAfter || block.timestamp >= p.validUntil) return false;
            (bool ok, bytes memory ret) = address(usdc).staticcall(
                abi.encodeCall(IEIP3009State.authorizationState, (address(this), p.nonce))
            );
            return ok && ret.length == 32 && uint256(bytes32(ret)) == 0;
        }
        // upto: Permit2 unordered nonce (word = nonce >> 8, bit = nonce & 0xff), deadline, witness validAfter
        if (block.timestamp > p.validUntil || block.timestamp < p.validAfter) return false;
        uint256 n = uint256(p.nonce);
        (bool ok2, bytes memory ret2) =
            permit2.staticcall(abi.encodeCall(IPermit2Nonces.nonceBitmap, (address(this), n >> 8)));
        return ok2 && ret2.length == 32 && (uint256(bytes32(ret2)) >> (n & 0xff)) & 1 == 0;
    }

    function _sigOk(Payment memory p, bytes calldata blob) internal view returns (bool) {
        return isOperator(_recover(p.opDigest, blob[p.sigOff:p.sigOff + 65]));
    }

    /// payee must be the agent's ERC-8004 agentWallet: a server lying about agentId can only claim an
    /// agent whose wallet it already controls. No fallback to ownerOf: the wallet is cleared on transfer,
    /// and a transferred agent is not payable anyway (TRANSFERRED).
    function _walletCheck(uint256 agentId, address to) internal view returns (Reason) {
        (bool ok, bytes memory ret) = address(identity).staticcall{gas: REGISTRY_CALL_GAS}(
            abi.encodeCall(IIdentityRegistry8004.getAgentWallet, (agentId))
        );
        if (!ok || ret.length != 32) return Reason.NO_WALLET;
        uint256 w = uint256(bytes32(ret));
        if (w == 0 || w >> 160 != 0) return Reason.NO_WALLET;
        return address(uint160(w)) == to ? Reason.OK : Reason.WALLET_MISMATCH;
    }

    function _passes(uint256 agentId) internal view returns (bool) {
        (bool ok, bytes memory ret) =
            address(ancre).staticcall(abi.encodeCall(AnchoredReputation.passesAnchorPolicy, (agentId, setId)));
        return ok && ret.length == 32 && uint256(bytes32(ret)) == 1; // fail closed
    }

    function _ancreReason(AnchoredReputation.Assessment memory a) internal pure returns (Reason) {
        if (a.status != AnchoredReputation.Status.OK) return Reason.ANCRE_STATUS;
        return a.passesPolicy ? Reason.OK : Reason.UNTRUSTED;
    }

    function _domainOf(address token) internal view returns (bool ok, bytes32 dom) {
        bytes memory ret;
        (ok, ret) = token.staticcall{gas: DOMAIN_CALL_GAS}(abi.encodeCall(IDomainSeparator.DOMAIN_SEPARATOR, ()));
        ok = ok && ret.length == 32;
        if (ok) dom = bytes32(ret);
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

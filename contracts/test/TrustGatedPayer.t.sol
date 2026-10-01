// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./utils/PayerBase.sol";
import {MockUSDC3009} from "./utils/MockUSDC3009.sol";

contract MockPermit2Domain {
    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;

    function DOMAIN_SEPARATOR() external pure returns (bytes32) {
        return keccak256("mock permit2 domain");
    }

    function useNonce(address owner, uint256 nonce) external {
        nonceBitmap[owner][nonce >> 8] |= 1 << (nonce & 0xff);
    }
}

/// a "token" whose DOMAIN_SEPARATOR reverts: isValidSignature must still return, not revert
contract NoDomainToken {
    function approve(address, uint256) external pure returns (bool) {
        return true;
    }
}

/// Unit tests of TrustGatedPayer on mocks: the real AnchoredReputation v1 over mock ERC-8004 registries and a
/// FiatToken-like USDC. Fork tests with the real USDC, Permit2 and registries: TrustGatedPayerFork.t.sol.
contract TrustGatedPayerTest is PayerBase {
    using CertLib for CertLib.Graph;

    uint256 constant GOOD = 101; // endorsed by both anchors
    uint256 constant FARM = 102; // endorsed by two farm agents only (in the node table, mass 0)
    uint256 constant F1 = 103;
    uint256 constant F2 = 104;
    uint256 constant UNKNOWN = 105; // registered, absent from the node table (status OK, trust 0: AM-6.1)
    address constant OG = address(0xB0B1);
    address constant OFARM = address(0xFA23);
    address constant OF1 = address(0xF001);
    address constant OF2 = address(0xF002);
    address constant OU = address(0x0DD);
    address constant OWNER = address(0x0E1);
    address constant TREASURY = address(0x7EA);
    address constant FAC = address(0xFAC);
    address constant ATTACKER = address(0xBAD);

    MockUSDC3009 usdc;
    MockPermit2Domain p2;
    address upto;
    TrustGatedPayer payer;
    bytes32 setId;
    address[] anchors;
    address op;

    function setUp() public {
        _deployMocks();
        vm.roll(1000);
        vm.warp(1_800_000_000);
        idr.mint(GOOD, OG);
        idr.mint(FARM, OFARM);
        idr.mint(F1, OF1);
        idr.mint(F2, OF2);
        idr.mint(UNKNOWN, OU);
        anchors = _anchors(2);
        setId = _certify();
        usdc = new MockUSDC3009();
        op = vm.addr(OP_KEY);
        p2 = new MockPermit2Domain();
        upto = address(new NoDomainToken()); // any contract: the proxy is only a field of the Permit2 digest here
        payer = new TrustGatedPayer(IERC20Min(address(usdc)), address(p2), upto, ar, OWNER, TREASURY, op, setId, 1e6);
        usdc.mint(address(payer), 10e6);
    }

    /// anchors 0x1000, 0x2000 (nodes 0, 1) vouch for GOOD (node 2); F1, F2 (nodes 4, 5) vouch for FARM (node 3).
    /// m = 2 (leave-one-out, D8): GOOD's robust trust is one anchor's contribution, 0.111 > theta = 0.1.
    function _certify() internal returns (bytes32 sid) {
        sid = ar.registerAnchorSet(_params(anchors, 2));
        ar.addNodes(sid, _agentEntries(GOOD, 4));
        for (uint256 a; a < 2; ++a) {
            vm.prank(anchors[a]);
            rep.giveFeedback(GOOD, 100, 0, "vouch", "");
        }
        vm.prank(OF1);
        rep.giveFeedback(FARM, 100, 0, "vouch", "");
        vm.prank(OF2);
        rep.giveFeedback(FARM, 100, 0, "vouch", "");
        CertLib.Graph memory g = CertLib.newGraph(6, 2, AN, AD, 6, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(2), _oneW(10_000));
        g.addRow(2, OG, new uint256[](0), new int256[](0)); // explicit empty rows: GOOD, FARM emit nothing
        g.addRow(3, OFARM, new uint256[](0), new int256[](0));
        g.addRow(4, OF1, _one(3), _oneW(10_000));
        g.addRow(5, OF2, _one(3), _oneW(10_000));
        g.ownerFp[2] = uint64(uint160(OG));
        g.ownerFp[3] = uint64(uint160(OFARM));
        g.ownerFp[4] = uint64(uint160(OF1));
        g.ownerFp[5] = uint64(uint160(OF2));
        _submit(sid, g, g.fixedPoint(60), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers
    function _settle(Auth memory a, bytes memory blob) internal {
        vm.prank(FAC);
        usdc.transferWithAuthorization(address(payer), a.to, a.value, a.validAfter, a.validBefore, a.nonce, blob);
    }

    function _reason(bytes32 h, bytes memory blob) internal view returns (TrustGatedPayer.Reason r) {
        (r,,,,,) = payer.explain(h, blob);
    }

    /// refusal at settlement: the token reverts with FiatToken's message and no balance moves
    function _assertRefused(Auth memory a, bytes memory blob, TrustGatedPayer.Reason expected) internal {
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        assertEq(payer.isValidSignature(d, blob), bytes4(0xffffffff), "isValidSignature must refuse");
        assertEq(uint8(_reason(d, blob)), uint8(expected), "explain reason");
        uint256 before = usdc.balanceOf(address(payer));
        uint256 toBefore = usdc.balanceOf(a.to);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        _settle(a, blob);
        assertEq(usdc.balanceOf(address(payer)), before, "payer balance moved");
        assertEq(usdc.balanceOf(a.to), toBefore, "payee balance moved");
    }

    function _good(uint256 n) internal view returns (Auth memory a, bytes memory blob) {
        a = _auth(OG, 10_000, GOOD, n);
        (blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
    }

    // ------------------------------------------------------------------ EIP-712 definitions
    function test_operatorDigestsMatchIndependentEncoding() public view {
        Auth memory a = _auth(OG, 10_000, GOOD, 7);
        assertEq(payer.paymentDigest(a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.agentId), _opDigest(address(payer), a));
        assertEq(payer.domainSeparator(), _payerDomain(address(payer)));
        assertEq(payer.ANCRE_PAYMENT_TYPEHASH(), ANCRE_PAYMENT);
        assertEq(payer.ANCRE_UPTO_TYPEHASH(), ANCRE_UPTO);
        assertEq(payer.ANCRE_CANCEL_TYPEHASH(), ANCRE_CANCEL);
    }

    // ------------------------------------------------------------------ accepted payment
    function test_exactPaysTrustedAgent() public {
        assertTrue(ar.isTrusted(GOOD, setId), "precondition: GOOD trusted by ANCRE");
        (Auth memory a, bytes memory blob) = _good(1);
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        assertEq(payer.isValidSignature(d, blob), bytes4(0x1626ba7e));
        assertEq(blob.length, 246, "blob > 65 bytes: x402-rs classifies it EIP-1271");
        _settle(a, blob);
        assertEq(usdc.balanceOf(OG), 10_000);
        assertEq(usdc.balanceOf(address(payer)), 10e6 - 10_000);
        (TrustGatedPayer.Reason r,,,,, AnchoredReputation.Assessment memory x) = payer.explain(d, blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.OK));
        assertTrue(x.trusted);
    }

    function test_replaySameNonceRefusedByToken() public {
        (Auth memory a, bytes memory blob) = _good(1);
        _settle(a, blob);
        vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
        _settle(a, blob);
        assertEq(usdc.balanceOf(OG), 10_000, "paid once");
    }

    // ------------------------------------------------------------------ ANCRE refusals
    /// AM-6.1 regression: an agent absent from the table gets status OK with trust 0; the payer refuses it.
    function test_unknownAgentRefused() public {
        AnchoredReputation.Assessment memory x = ar.assess(UNKNOWN, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.OK), "precondition: status OK");
        assertEq(x.trust, 0);
        Auth memory a = _auth(OU, 10_000, UNKNOWN, 2);
        (bytes memory blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
        _assertRefused(a, blob, TrustGatedPayer.Reason.UNTRUSTED);
    }

    function test_farmAgentRefused() public {
        AnchoredReputation.Assessment memory x = ar.assess(FARM, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.OK));
        assertEq(x.trust, 0, "farm endorsements carry no anchor mass");
        Auth memory a = _auth(OFARM, 10_000, FARM, 3);
        (bytes memory blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
        _assertRefused(a, blob, TrustGatedPayer.Reason.UNTRUSTED);
    }

    /// D19 central scene: an anchor's veto makes the NEXT payment fail, same block, no recertification (D33).
    function test_vetoRefusesNextPayment() public {
        (Auth memory a1, bytes memory b1) = _good(10);
        _settle(a1, b1);
        vm.prank(anchors[0]);
        rep.giveFeedback(GOOD, -100, 0, "slash", "");
        (Auth memory a2, bytes memory b2) = _good(11);
        _assertRefused(a2, b2, TrustGatedPayer.Reason.ANCRE_STATUS);
        (,,,,, AnchoredReputation.Assessment memory x) = payer.explain(_twaDigest(address(usdc), address(payer), a2), b2);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, keccak256("slash"), "triggerTag is keccak256(tag1)");
        assertEq(usdc.balanceOf(OG), 10_000, "only the first payment went through");
    }

    /// Breaker between /verify (simulation) and /settle: the same signed authorisation fails at settlement.
    function test_breakerBetweenVerifyAndSettle() public {
        (Auth memory a, bytes memory blob) = _good(20);
        uint256 snap = vm.snapshotState();
        _settle(a, blob); // "/verify" = eth_call of the settlement
        vm.revertToState(snap);
        vm.prank(anchors[1]);
        rep.giveFeedback(GOOD, -1, 0, "review", "");
        _assertRefused(a, blob, TrustGatedPayer.Reason.ANCRE_STATUS);
    }

    function test_staleCertificateRefused() public {
        (Auth memory a, bytes memory blob) = _good(30);
        vm.roll(block.number + 1001); // maxAge = 1000 blocks
        _assertRefused(a, blob, TrustGatedPayer.Reason.ANCRE_STATUS);
        (,,,,, AnchoredReputation.Assessment memory x) = payer.explain(_twaDigest(address(usdc), address(payer), a), blob);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.STALE));
    }

    function test_noCertificateRefused() public {
        address[] memory other = _anchors(3);
        bytes32 sid2 = ar.registerAnchorSet(_params(other, 2));
        vm.prank(OWNER);
        payer.setPolicy(sid2, 1e6);
        (Auth memory a, bytes memory blob) = _good(31);
        _assertRefused(a, blob, TrustGatedPayer.Reason.ANCRE_STATUS);
        (,,,,, AnchoredReputation.Assessment memory x) = payer.explain(_twaDigest(address(usdc), address(payer), a), blob);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.NO_CERT));
    }

    /// transfer clears agentWallet (ERC-8004 v2.0.0): the old wallet no longer matches, and ANCRE says TRANSFERRED
    function test_transferredAgentRefused() public {
        (Auth memory a, bytes memory blob) = _good(32);
        idr.transfer(GOOD, address(0xC0FFEE));
        _assertRefused(a, blob, TrustGatedPayer.Reason.NO_WALLET);
        idr.setWallet(GOOD, OG); // even with the wallet restored, the strict ownerOf check fires (D35)
        _assertRefused(a, blob, TrustGatedPayer.Reason.ANCRE_STATUS);
        assertEq(uint8(ar.assess(GOOD, setId, true).status), uint8(AnchoredReputation.Status.TRANSFERRED));
    }

    function test_registryChangedRefused() public {
        (Auth memory a, bytes memory blob) = _good(33);
        rep.setVersion("2.1.0");
        ar.checkRegistry(setId);
        _assertRefused(a, blob, TrustGatedPayer.Reason.ANCRE_STATUS);
    }

    // ------------------------------------------------------------------ payer-side refusals
    function test_walletMismatchRefused() public {
        // server claims GOOD (trusted) but asks to be paid elsewhere
        Auth memory a = _auth(ATTACKER, 10_000, GOOD, 40);
        (bytes memory blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
        _assertRefused(a, blob, TrustGatedPayer.Reason.WALLET_MISMATCH);
    }

    function test_nonexistentAgentRefused() public {
        Auth memory a = _auth(ATTACKER, 10_000, 999_999, 41);
        (bytes memory blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
        _assertRefused(a, blob, TrustGatedPayer.Reason.NO_WALLET);
    }

    function test_overLimitRefused() public {
        Auth memory a = _auth(OG, 1e6 + 1, GOOD, 42);
        (bytes memory blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
        _assertRefused(a, blob, TrustGatedPayer.Reason.OVER_LIMIT);
        Auth memory b = _auth(OG, 1e6, GOOD, 43);
        (bytes memory blobB,) = _exact(address(usdc), address(payer), OP_KEY, b);
        _settle(b, blobB);
        assertEq(usdc.balanceOf(OG), 1e6, "exactly maxPerPayment is allowed");
    }

    function test_strangerSignatureRefused() public {
        Auth memory a = _auth(OG, 10_000, GOOD, 44);
        (bytes memory blob,) = _exact(address(usdc), address(payer), 0xBADBAD, a);
        _assertRefused(a, blob, TrustGatedPayer.Reason.BAD_OPERATOR_SIG);
    }

    function test_highSAndBadVRefused() public {
        Auth memory a = _auth(OG, 10_000, GOOD, 45);
        bytes memory sig = _sig(OP_KEY, _opDigest(address(payer), a));
        _assertRefused(a, _packExact(a, _highS(sig)), TrustGatedPayer.Reason.BAD_OPERATOR_SIG);
        bytes memory badV = abi.encodePacked(sig);
        badV[64] = bytes1(uint8(sig[64]) - 27); // v in {0, 1}
        _assertRefused(a, _packExact(a, badV), TrustGatedPayer.Reason.BAD_OPERATOR_SIG);
    }

    function test_operatorSignatureForOtherPayerRefused() public {
        // same operator, same fields, signed in another payer's domain: not valid here
        TrustGatedPayer other = new TrustGatedPayer(
            IERC20Min(address(usdc)), address(0), address(0), ar, OWNER, TREASURY, op, setId, 1e6
        );
        Auth memory a = _auth(OG, 10_000, GOOD, 46);
        bytes memory foreignSig = _sig(OP_KEY, _opDigest(address(other), a));
        _assertRefused(a, _packExact(a, foreignSig), TrustGatedPayer.Reason.BAD_OPERATOR_SIG);
    }

    function test_pausedRefusedOperatorCanOnlyPause() public {
        (Auth memory a, bytes memory blob) = _good(47);
        vm.prank(op);
        payer.setPaused(true);
        _assertRefused(a, blob, TrustGatedPayer.Reason.PAUSED);
        vm.prank(op);
        vm.expectRevert(TrustGatedPayer.NotOwnerOrOperator.selector);
        payer.setPaused(false);
        assertTrue(payer.paused(), "still paused");
        vm.prank(OWNER);
        payer.setPaused(false);
        _settle(a, blob);
        assertEq(usdc.balanceOf(OG), 10_000);
    }

    function test_removedOperatorRefused() public {
        (Auth memory a, bytes memory blob) = _good(48);
        vm.prank(OWNER);
        payer.setOperator(op, false);
        assertFalse(payer.isOperator(op));
        _assertRefused(a, blob, TrustGatedPayer.Reason.BAD_OPERATOR_SIG);
    }

    // ------------------------------------------------------------------ digest safety
    /// The hash presented must be the exact authorisation of the blob: a blob for 1 unit cannot validate 1e6.
    function test_digestMismatchRefused() public {
        (Auth memory a, bytes memory blob) = _good(50);
        Auth memory big = a;
        big.value = 1e6;
        assertEq(payer.isValidSignature(_twaDigest(address(usdc), address(payer), big), blob), bytes4(0xffffffff));
        assertEq(uint8(_reason(_twaDigest(address(usdc), address(payer), big), blob)), uint8(TrustGatedPayer.Reason.DIGEST_MISMATCH));
        vm.prank(FAC);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.transferWithAuthorization(address(payer), OG, 1e6, a.validAfter, a.validBefore, a.nonce, blob);
        assertEq(usdc.balanceOf(OG), 0);
    }

    /// EIP-2612 permit(bytes) also goes through ERC-1271: a valid payment blob must never grant an allowance.
    function test_permitWithPaymentBlobReverts() public {
        (, bytes memory blob) = _good(51);
        vm.expectRevert(bytes("EIP2612: invalid signature"));
        usdc.permit(address(payer), ATTACKER, type(uint256).max, block.timestamp + 1, blob);
        assertEq(usdc.allowance(address(payer), ATTACKER), 0);
    }

    function test_receiveWithAuthorizationRefused() public {
        (Auth memory a, bytes memory blob) = _good(52);
        vm.prank(OG);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.receiveWithAuthorization(address(payer), OG, a.value, a.validAfter, a.validBefore, a.nonce, blob);
        assertEq(usdc.balanceOf(OG), 0);
    }

    function test_malformedBlobsRefusedNeverRevert() public view {
        (Auth memory a, bytes memory blob) = _good(53);
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        bytes memory short = new bytes(245);
        for (uint256 i; i < 245; ++i) {
            short[i] = blob[i];
        }
        assertEq(payer.isValidSignature(d, short), bytes4(0xffffffff));
        assertEq(uint8(_reason(d, short)), uint8(TrustGatedPayer.Reason.BAD_FORMAT));
        assertEq(payer.isValidSignature(d, ""), bytes4(0xffffffff));
        bytes memory k9 = abi.encodePacked(blob);
        k9[0] = 0x09;
        assertEq(uint8(_reason(d, k9)), uint8(TrustGatedPayer.Reason.BAD_KIND));
        bytes memory k0 = abi.encodePacked(blob);
        k0[0] = 0x00;
        assertEq(payer.isValidSignature(d, k0), bytes4(0xffffffff));
        bytes memory raw = _sig(OP_KEY, d); // a plain 65-byte operator signature over the token digest
        assertEq(payer.isValidSignature(d, raw), bytes4(0xffffffff), "raw ECDSA is not a payer signature");
    }

    function testFuzz_neverRevertsNeverAccepts(bytes32 h, bytes calldata junk) public view {
        assertEq(payer.isValidSignature(h, junk), bytes4(0xffffffff));
    }

    /// fixed-length blobs with random content: parsing never reverts, a random blob is never accepted
    function testFuzz_wellSizedRandomBlobs(bytes32 h, uint8 kind, bytes32 x0, bytes32 x1, bytes32 x2, bytes32 x3) public view {
        kind = uint8(bound(kind, 1, 3));
        uint256 len = kind == 1 ? 246 : kind == 2 ? 266 : 98;
        bytes memory b = new bytes(len);
        b[0] = bytes1(kind);
        bytes memory seed = abi.encodePacked(x0, x1, x2, x3, x0, x1, x2, x3, x0, x1);
        for (uint256 i = 1; i < len; ++i) {
            b[i] = seed[i % seed.length];
        }
        assertEq(payer.isValidSignature(h, b), bytes4(0xffffffff));
    }

    // ------------------------------------------------------------------ cancel (kind 3)
    function test_operatorCancelsNonce() public {
        (Auth memory a, bytes memory blob) = _good(60);
        (bytes memory cb, bytes32 cd) = _cancel(address(usdc), address(payer), OP_KEY, a.nonce);
        assertEq(payer.isValidSignature(cd, cb), bytes4(0x1626ba7e));
        usdc.cancelAuthorization(address(payer), a.nonce, cb);
        vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
        _settle(a, blob);
        (bytes memory sb,) = _cancel(address(usdc), address(payer), 0xBADBAD, bytes32(uint256(61)));
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.cancelAuthorization(address(payer), bytes32(uint256(61)), sb);
    }

    // ------------------------------------------------------------------ decide / explain parity
    function _parity(uint256 agentId, address to, uint256 n) internal view {
        Auth memory a = _auth(to, 10_000, agentId, n);
        (bytes memory blob, bytes32 d) = _exact(address(usdc), address(payer), OP_KEY, a);
        bool sigOk = payer.isValidSignature(d, blob) == bytes4(0x1626ba7e);
        (TrustGatedPayer.Reason rd,) = payer.decide(agentId, to, 10_000);
        TrustGatedPayer.Reason re = _reason(d, blob);
        assertEq(sigOk, rd == TrustGatedPayer.Reason.OK, "decide == isValidSignature");
        assertEq(uint8(rd), uint8(re), "decide reason == explain reason");
        bool walletOk = idr.getAgentWallet(agentId) == to;
        if (walletOk) assertEq(sigOk, ar.isTrusted(agentId, setId), "payer == ANCRE isTrusted");
    }

    function test_parityAcrossStates() public {
        _parity(GOOD, OG, 70);
        _parity(FARM, OFARM, 71);
        _parity(UNKNOWN, OU, 72);
        _parity(GOOD, ATTACKER, 73);
        vm.prank(anchors[0]);
        rep.giveFeedback(GOOD, -100, 0, "slash", "");
        _parity(GOOD, OG, 74);
        vm.prank(anchors[0]);
        rep.giveFeedback(GOOD, 1, 0, "review", ""); // D33 / AM-02.6: a later non-negative feedback lifts the live veto
        _parity(GOOD, OG, 75);
        vm.roll(block.number + 2000);
        _parity(GOOD, OG, 76);
    }

    function test_decideBeforeSigning() public view {
        (TrustGatedPayer.Reason r, AnchoredReputation.Assessment memory x) = payer.decide(GOOD, OG, 10_000);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.OK));
        assertTrue(x.trusted);
        (r,) = payer.decide(GOOD, OG, 2e6);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.OVER_LIMIT));
        (r, x) = payer.decide(UNKNOWN, OU, 0);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.UNTRUSTED));
        assertEq(x.trust, 0);
    }

    // ------------------------------------------------------------------ reportRefusal
    function test_reportRefusalEmitsForGenuineRefusal() public {
        vm.prank(anchors[0]);
        rep.giveFeedback(GOOD, -100, 0, "slash", "");
        (Auth memory a, bytes memory blob) = _good(80);
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        AnchoredReputation.Assessment memory x = ar.assess(GOOD, setId, true);
        vm.expectEmit(true, true, true, true, address(payer));
        emit TrustGatedPayer.RefusalReported(
            d, GOOD, OG, TrustGatedPayer.Reason.ANCRE_STATUS, uint8(AnchoredReputation.Status.VETOED), keccak256("slash"),
            x.trustLow, x.distrustUp, 10_000
        );
        TrustGatedPayer.Reason r = payer.reportRefusal(d, blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.ANCRE_STATUS));
    }

    function test_reportRefusalOverLimitRequiresOperatorSig() public {
        Auth memory a = _auth(OG, 2e6, GOOD, 81);
        (bytes memory forged, bytes32 d) = _exact(address(usdc), address(payer), 0xBADBAD, a);
        // _check stops at OVER_LIMIT before the signature: reportRefusal must still refuse a forged blob
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NotRefused.selector, TrustGatedPayer.Reason.BAD_OPERATOR_SIG));
        payer.reportRefusal(d, forged);
        (bytes memory genuine,) = _exact(address(usdc), address(payer), OP_KEY, a);
        assertEq(uint8(payer.reportRefusal(d, genuine)), uint8(TrustGatedPayer.Reason.OVER_LIMIT));
    }

    function test_reportRefusalRevertsWhenPayable() public {
        (Auth memory a, bytes memory blob) = _good(82);
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NotRefused.selector, TrustGatedPayer.Reason.OK));
        payer.reportRefusal(d, blob);
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NotRefused.selector, TrustGatedPayer.Reason.BAD_FORMAT));
        payer.reportRefusal(d, hex"01");
    }

    // ------------------------------------------------------------------ administration
    function test_onlyOwnerAdmin() public {
        vm.startPrank(op);
        vm.expectRevert(TrustGatedPayer.NotOwner.selector);
        payer.setOperator(ATTACKER, true);
        vm.expectRevert(TrustGatedPayer.NotOwner.selector);
        payer.setPolicy(setId, type(uint256).max);
        vm.expectRevert(TrustGatedPayer.NotOwner.selector);
        payer.transferOwnership(op);
        vm.expectRevert(TrustGatedPayer.NotOwner.selector);
        payer.approvePermit2(1);
        vm.expectRevert(TrustGatedPayer.NotOwner.selector);
        payer.sweep(address(usdc), 1);
        vm.stopPrank();
        assertEq(payer.maxPerPayment(), 1e6);
        assertEq(payer.owner(), OWNER);
    }

    function test_sweepGoesToTreasuryOnly() public {
        vm.prank(OWNER);
        payer.sweep(address(usdc), 4e6);
        assertEq(usdc.balanceOf(TREASURY), 4e6);
        vm.prank(TREASURY);
        payer.sweep(address(usdc), 6e6);
        assertEq(usdc.balanceOf(TREASURY), 10e6);
        assertEq(usdc.balanceOf(address(payer)), 0);
        assertEq(usdc.balanceOf(OWNER), 0, "never to the owner");
    }

    function test_setPolicyRejectsUnknownSet() public {
        vm.prank(OWNER);
        vm.expectRevert(TrustGatedPayer.UnknownSet.selector);
        payer.setPolicy(keccak256("nope"), 1e6);
        assertEq(payer.setId(), setId);
    }

    function test_operatorsCapacity() public {
        vm.startPrank(OWNER);
        payer.setOperator(address(0x1), true);
        payer.setOperator(address(0x2), true);
        payer.setOperator(address(0x3), true);
        payer.setOperator(address(0x3), true); // idempotent
        vm.expectRevert(TrustGatedPayer.OperatorsFull.selector);
        payer.setOperator(address(0x4), true);
        payer.setOperator(address(0x2), false);
        payer.setOperator(address(0x4), true);
        vm.expectRevert(TrustGatedPayer.ZeroAddress.selector);
        payer.setOperator(address(0), true);
        vm.stopPrank();
        assertTrue(payer.isOperator(address(0x4)));
        assertFalse(payer.isOperator(address(0x2)));
        assertFalse(payer.isOperator(address(0)), "the zero address is never an operator");
    }

    function test_transferOwnership() public {
        vm.prank(OWNER);
        payer.transferOwnership(address(0x0E2));
        vm.prank(OWNER);
        vm.expectRevert(TrustGatedPayer.NotOwnerOrOperator.selector);
        payer.setPaused(false);
        vm.prank(address(0x0E2));
        payer.setPaused(true);
        assertTrue(payer.paused());
    }

    // ------------------------------------------------------------------ code-review fixes (E1, high)
    function test_reportRefusalRefusesSettledExpiredAndDuplicate() public {
        (Auth memory a, bytes memory blob) = _good(90);
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        _settle(a, blob); // paid
        vm.prank(anchors[0]);
        rep.giveFeedback(GOOD, -100, 0, "slash", "");
        vm.expectRevert(TrustGatedPayer.NotSettleable.selector); // a paid authorisation is not a refusal
        payer.reportRefusal(d, blob);

        (Auth memory b, bytes memory blobB) = _good(91);
        bytes32 db = _twaDigest(address(usdc), address(payer), b);
        payer.reportRefusal(db, blobB);
        vm.expectRevert(TrustGatedPayer.AlreadyReported.selector);
        payer.reportRefusal(db, blobB);
        assertTrue(payer.reported(db));

        (Auth memory c, bytes memory blobC) = _good(92);
        bytes32 dc = _twaDigest(address(usdc), address(payer), c);
        vm.warp(c.validBefore); // validBefore is exclusive
        vm.expectRevert(TrustGatedPayer.NotSettleable.selector);
        payer.reportRefusal(dc, blobC);
    }

    function test_reportRefusalRefusesCancelledNonce() public {
        vm.prank(anchors[0]);
        rep.giveFeedback(GOOD, -100, 0, "slash", "");
        (Auth memory a, bytes memory blob) = _good(93);
        (bytes memory cb,) = _cancel(address(usdc), address(payer), OP_KEY, a.nonce);
        usdc.cancelAuthorization(address(payer), a.nonce, cb);
        bytes32 d = _twaDigest(address(usdc), address(payer), a); // before expectRevert: it catches the next call
        vm.expectRevert(TrustGatedPayer.NotSettleable.selector);
        payer.reportRefusal(d, blob);
    }

    function _uptoGood(uint256 cap, uint256 n) internal view returns (Upto memory u, bytes memory blob, bytes32 d) {
        u = Upto(OG, cap, n, block.timestamp + 300, FAC, 0, GOOD);
        blob = _upto(address(payer), OP_KEY, u);
        d = _uptoDigest(address(usdc), address(p2), upto, u);
    }

    function test_uptoUnitPaths() public {
        (Upto memory u, bytes memory blob, bytes32 d) = _uptoGood(5000, 7);
        assertEq(blob.length, 266);
        assertEq(payer.isValidSignature(d, blob), bytes4(0x1626ba7e), "trusted upto accepted");
        assertEq(payer.uptoDigest(u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, u.agentId),
            _typed(_payerDomain(address(payer)), keccak256(abi.encode(ANCRE_UPTO, u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, u.agentId))));
        // the facilitator is part of the Permit2 witness: another facilitator's digest does not match
        Upto memory other = Upto(u.to, u.cap, u.nonce, u.deadline, ATTACKER, u.validAfter, u.agentId); // a fresh struct, not an alias
        assertEq(uint8(_reason(_uptoDigest(address(usdc), address(p2), upto, other), blob)), uint8(TrustGatedPayer.Reason.DIGEST_MISMATCH));
        // stranger signature
        Upto memory s = Upto(u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, u.agentId);
        bytes memory forged = abi.encodePacked(
            uint8(2), s.agentId, s.to, s.cap, s.nonce, s.deadline, s.facilitator, s.validAfter,
            _sig(0xBADBAD, _typed(_payerDomain(address(payer)), keccak256(abi.encode(ANCRE_UPTO, s.to, s.cap, s.nonce, s.deadline, s.facilitator, s.validAfter, s.agentId))))
        );
        assertEq(uint8(_reason(d, forged)), uint8(TrustGatedPayer.Reason.BAD_OPERATOR_SIG));
        // veto -> ANCRE_STATUS
        vm.prank(anchors[1]);
        rep.giveFeedback(GOOD, -100, 0, "slash", "");
        assertEq(payer.isValidSignature(d, blob), bytes4(0xffffffff));
        assertEq(uint8(_reason(d, blob)), uint8(TrustGatedPayer.Reason.ANCRE_STATUS));
    }

    function test_uptoReportRefusalOverLimitAndNonce() public {
        (, bytes memory blob, bytes32 d) = _uptoGood(2e6, 8); // cap > maxPerPayment
        bytes memory forged;
        // genuine upto OVER_LIMIT is reportable (exercises the upto signature offsets)
        assertEq(uint8(payer.reportRefusal(d, blob)), uint8(TrustGatedPayer.Reason.OVER_LIMIT));
        // forged upto OVER_LIMIT is not
        Upto memory u = Upto(OG, 2e6, 9, block.timestamp + 300, FAC, 0, GOOD);
        forged = abi.encodePacked(
            uint8(2), u.agentId, u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter,
            _sig(0xBADBAD, _typed(_payerDomain(address(payer)), keccak256(abi.encode(ANCRE_UPTO, u.to, u.cap, u.nonce, u.deadline, u.facilitator, u.validAfter, u.agentId))))
        );
        bytes32 du = _uptoDigest(address(usdc), address(p2), upto, u);
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NotRefused.selector, TrustGatedPayer.Reason.BAD_OPERATOR_SIG));
        payer.reportRefusal(du, forged);
        // a used Permit2 nonce is not settleable
        (, bytes memory b10, bytes32 d10) = _uptoGood(2e6, 10);
        p2.useNonce(address(payer), 10);
        vm.expectRevert(TrustGatedPayer.NotSettleable.selector);
        payer.reportRefusal(d10, b10);
    }

    function test_uptoDisabledIsBadKind() public {
        TrustGatedPayer noUpto =
            new TrustGatedPayer(IERC20Min(address(usdc)), address(0), address(0), ar, OWNER, TREASURY, op, setId, 1e6);
        Upto memory u = Upto(OG, 5000, 7, block.timestamp + 300, FAC, 0, GOOD);
        bytes memory blob = _upto(address(noUpto), OP_KEY, u);
        assertEq(noUpto.isValidSignature(bytes32(0), blob), bytes4(0xffffffff));
        (TrustGatedPayer.Reason r,,,,,) = noUpto.explain(bytes32(0), blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.BAD_KIND));
        vm.prank(OWNER);
        vm.expectRevert(TrustGatedPayer.ZeroAddress.selector);
        noUpto.approvePermit2(1);
    }

    /// a token whose DOMAIN_SEPARATOR reverts: isValidSignature returns INVALID instead of reverting
    function test_domainCallFailureNeverReverts() public {
        NoDomainToken bad = new NoDomainToken();
        TrustGatedPayer p = new TrustGatedPayer(IERC20Min(address(bad)), address(bad), address(bad), ar, OWNER, TREASURY, op, setId, 1e6);
        Auth memory a = _auth(OG, 10_000, GOOD, 1);
        bytes memory blob = _packExact(a, _sig(OP_KEY, _opDigest(address(p), a)));
        assertEq(p.isValidSignature(keccak256("any"), blob), bytes4(0xffffffff));
        (TrustGatedPayer.Reason r,,,,,) = p.explain(keccak256("any"), blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.DIGEST_MISMATCH));
        Upto memory u = Upto(OG, 5000, 7, block.timestamp + 300, FAC, 0, GOOD);
        assertEq(p.isValidSignature(keccak256("any"), _upto(address(p), OP_KEY, u)), bytes4(0xffffffff));
    }

    function test_constructorRequiresCode() public {
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NoCode.selector, address(0x1234)));
        new TrustGatedPayer(IERC20Min(address(0x1234)), address(0), address(0), ar, OWNER, TREASURY, op, setId, 1e6);
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NoCode.selector, address(0x5678)));
        new TrustGatedPayer(IERC20Min(address(usdc)), address(0x5678), upto, ar, OWNER, TREASURY, op, setId, 1e6);
        vm.expectRevert(TrustGatedPayer.ZeroAddress.selector); // permit2 without proxy
        new TrustGatedPayer(IERC20Min(address(usdc)), address(p2), address(0), ar, OWNER, TREASURY, op, setId, 1e6);
    }

    function test_sweepRefusesCodelessToken() public {
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(TrustGatedPayer.NoCode.selector, address(0xDEAD)));
        payer.sweep(address(0xDEAD), 1);
    }

    function test_decideFillsAssessmentOnEarlyRefusal() public view {
        (TrustGatedPayer.Reason r, AnchoredReputation.Assessment memory x) = payer.decide(GOOD, OG, 2e6);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.OVER_LIMIT));
        assertTrue(x.trusted, "trust shown next to OVER_LIMIT");
        (r, x) = payer.decide(GOOD, ATTACKER, 0);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.WALLET_MISMATCH));
        assertGt(x.trust, 0);
    }
}

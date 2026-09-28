// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";

contract AnchoredReputationTest is AncreBase {
    using CertLib for CertLib.Graph;

    address constant OX = address(0xB0B1); // owner / wallet of agent X (101)
    address constant OY = address(0xB0B2); // agent Y (102)
    address constant OZ = address(0xB0B3); // agent Z (103)

    function setUp() public {
        _deployMocks();
        idr.mint(101, OX);
        idr.mint(102, OY);
        idr.mint(103, OZ);
        vm.roll(1000);
    }

    // ------------------------------------------------------------------ helpers
    /// chain: anchor A (node 0) -> X (node 1) -> Y (node 2); Y has an explicit empty row.
    function _chainSet(uint8 m) internal returns (bytes32 setId) {
        setId = ar.registerAnchorSet(_params(_anchors(1), m));
        ar.addNodes(setId, _agentEntries(101, 2)); // X = node 1, Y = node 2
    }

    function _chainGraph(bool rowForY) internal pure returns (CertLib.Graph memory g) {
        g = CertLib.newGraph(3, 1, AN, AD, 3, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, _one(2), _oneW(10_000));
        if (rowForY) g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
    }

    function _handT() internal pure returns (uint256[][] memory t) {
        t = new uint256[][](1);
        t[0] = new uint256[](3);
        t[0][0] = 333_333_333_333_333_333; // alpha             = floor(1e18/3)
        t[0][1] = 222_222_222_222_222_222; // (1-a) a           = floor(t0 * 2/3)
        t[0][2] = 148_148_148_148_148_148; // (1-a)^2 a (absorbing Y)
    }

    // ------------------------------------------------------------------ fixed point, residual
    function test_handComputedChain() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        uint256[][] memory t = _handT();
        // the hand vector is an exact fixed point of the floor map: r = 0 + E+ (2) + 1
        assertTrue(CertLib.isSubSolution(g, t));
        assertEq(CertLib.residual(g, t)[0], 3, "reference residual");
        _submit(setId, g, t, 100);
        (uint256 eUp0, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eUp0, 9, "eUp = ceil(r / alpha) = 9 wei");
        assertEq(eLow0, 0);
        (, uint256 eEff, uint256 eLowEff,,,,,,) = ar.certificate(setId);
        assertEq(eEff, 9);
        assertEq(eLowEff, 0);
        assertEq(ar.vectorAt(setId, 1, 0), t[0][1]);
        assertEq(ar.vectorAt(setId, 2, 0), t[0][2]);
        assertEq(ar.vectorAt(setId, 2, 2), uint64(uint160(OY)), "owner fingerprint lane");
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.OK));
        assertEq(x.trust, t[0][1]);
        assertEq(x.trustRobust, t[0][1], "m = 1: nothing removed");
        assertEq(x.e, 9);
        assertEq(x.trustLow, t[0][1], "D26: t is the lower bound itself, eLow = 0");
        assertEq(x.distrustUp, 9);
        assertTrue(x.trusted);
    }

    function test_solverMatchesContract() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        uint256[][] memory t = g.fixedPoint(80);
        assertTrue(CertLib.isSubSolution(g, t), "iteration from 0 gives a sub-solution (L3)");
        uint256[] memory e = CertLib.eUp(g, t);
        _submit(setId, g, t, type(uint256).max);
        (uint256 eUp0,) = ar.columnBounds(setId, 0);
        assertEq(eUp0, e[0]);
    }

    function test_truncationMargin() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(false); // Y's row omitted -> truncated
        uint256[][] memory t = _handT();
        _submit(setId, g, t, type(uint256).max);
        // r = 3 + ceil((1 - alpha) t_Y) = 3 + ceil(148148148148148148 * 2 / 3) = 3 + 98765432098765432
        (uint256 eUp0,) = ar.columnBounds(setId, 0);
        assertEq(eUp0, (3 + 98_765_432_098_765_432) * 3);
        // a truncated row lowers y only: the lower bound still holds, X stays trusted (D26)
        assertEq(ar.assess(101, setId, true).trustLow, t[0][1]);
    }

    function test_notSubSolutionRejected() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        uint256[][] memory t = _handT();
        t[0][1] += 1; // one wei above y: not a lower bound any more
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.NotSubSolution.selector, 0, 1));
        ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);
    }

    function test_deflatedVectorAcceptedButImprecise() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        uint256[][] memory t = _handT();
        t[0][2] -= 1e15; // Y (a leaf) below y: still a sub-solution (AM-5.16), but eUp grows
        assertTrue(CertLib.isSubSolution(g, t));
        uint256 eBad = CertLib.eEff(g, t);
        assertGt(eBad, 1e15);
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.ResidualTooLarge.selector, eBad, 100));
        ar.submitCertificate(setId, 3, 100, "", v, rows);
        ar.submitCertificate(setId, 3, eBad, "", v, rows);
        // the zero vector is a sub-solution too: trusted by nobody, eUp ~ 1 WAD
        uint256[][] memory z = new uint256[][](1);
        z[0] = new uint256[](3);
        _submit(setId, g, z, type(uint256).max);
        (, uint256 eZ,,,,,,,) = ar.certificate(setId);
        assertGt(eZ, 9e17);
        assertFalse(ar.isTrusted(101, setId));
    }

    function test_weightOffGridRejected() public {
        bytes32 setId = _chainSet(1);
        uint256[][] memory t = _handT();
        int256[3] memory bad = [int256(10_001), int256(0), int256(-10_001)];
        for (uint256 i; i < 3; ++i) {
            CertLib.Graph memory g = CertLib.newGraph(3, 1, AN, AD, 3, 4);
            g.addRow(0, address(0), _one(1), _oneW(bad[i]));
            bytes memory v = CertLib.encodeVectors(g, t);
            bytes memory rows = CertLib.encodeRows(g, 2);
            vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadEdge.selector, 0));
            ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);
        }
    }

    function test_edgeOrderAndSelfLoopRejected() public {
        bytes32 setId = _chainSet(1);
        uint256[][] memory t = _handT();
        CertLib.Graph memory g = CertLib.newGraph(3, 1, AN, AD, 3, 4);
        g.addRow(0, address(0), _two(2, 1), _twoW(5000, 5000)); // unsorted
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadEdge.selector, 0));
        ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);

        g = CertLib.newGraph(3, 1, AN, AD, 3, 4);
        g.addRow(0, address(0), _one(0), _oneW(5000)); // self loop
        v = CertLib.encodeVectors(g, t);
        rows = CertLib.encodeRows(g, 2);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadEdge.selector, 0));
        ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);
    }

    function test_separateBudgets() public {
        // anchor -> X (+1) and -> Y (-1): B+ = B- = 1, so X gets the full (1-a) t_A (D7)
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = CertLib.newGraph(3, 1, AN, AD, 3, 4);
        g.addRow(0, address(0), _two(1, 2), _twoW(10_000, -10_000));
        uint256[][] memory t = g.fixedPoint(40);
        _submit(setId, g, t, type(uint256).max);
        assertEq(t[0][1], 222_222_222_222_222_222, "positive side not diluted by the negative edge");
        AnchoredReputation.Assessment memory y = ar.assess(102, setId, false);
        assertEq(y.trust, 0);
        assertEq(y.distrust, 222_222_222_222_222_222, "d = ceil((1-a) T_A |w| / B-), exact here");
    }

    // ------------------------------------------------------------------ leave-one-out (D8)
    function test_leaveOneOut() public {
        address[] memory anc = _anchors(2);
        bytes32 setId = ar.registerAnchorSet(_params(anc, 2));
        ar.addNodes(setId, _agentEntries(101, 2)); // X = node 2, Y = node 3
        CertLib.Graph memory g = CertLib.newGraph(4, 2, AN, AD, 4, 8);
        g.addRow(0, address(0), _two(2, 3), _twoW(10_000, 10_000)); // A1 -> X, Y
        g.addRow(1, address(0), _one(3), _oneW(10_000)); // A2 -> Y
        uint256[][] memory t = g.fixedPoint(40);
        _submit(setId, g, t, type(uint256).max);

        AnchoredReputation.Assessment memory x = ar.assess(101, setId, false);
        assertGt(x.trust, 0);
        assertEq(x.trustRobust, 0, "X is endorsed by one anchor only: a single stolen key cannot make it pass");

        AnchoredReputation.Assessment memory y = ar.assess(102, setId, false);
        uint256 c1 = (5e17 * t[0][3]) / 1e18;
        uint256 c2 = (5e17 * t[1][3]) / 1e18;
        assertEq(y.trust, c1 + c2);
        assertEq(y.trustRobust, c1 < c2 ? c1 : c2, "largest contribution removed");
    }

    // ------------------------------------------------------------------ veto (D4, D14, D15)
    function _certifiedX(uint8 m) internal returns (bytes32 setId) {
        setId = _chainSet(m);
        _submit(setId, _chainGraph(true), _handT(), 100);
    }

    function test_vetoIsLastAnchorFeedback() public {
        bytes32 setId = _certifiedX(1);
        address a = _anchors(1)[0];
        vm.prank(a);
        uint64 slashIdx = rep.giveFeedback(101, -100, 0, "slash", "");
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, bytes32("slash"));
        assertEq(x.vetoCount, 1);
        assertFalse(ar.isTrusted(101, setId));

        // D33: the live veto is the anchor's LAST feedback. A later +1 of the same anchor under another tag
        // lifts the live veto (normative rule: an anchor that posts something else must re-post its veto);
        // the certificate's D14 dominance keeps the slash as distrust / certified bit after recertification.
        vm.prank(a);
        rep.giveFeedback(101, 1, 0, "review", "");
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));

        // re-posting the veto restores it; revocation of the last veto lifts it
        vm.prank(a);
        uint64 again = rep.giveFeedback(101, -100, 0, "slash", "");
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.VETOED));
        vm.prank(a);
        rep.revokeFeedback(101, again);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
        slashIdx;
        (AnchoredReputation.Status st,,,,) = ar.trustOf(101, setId);
        assertEq(uint8(st), uint8(AnchoredReputation.Status.OK));
    }

    function test_certifiedVetoBit() public {
        // the anchor's row carries a negative edge to X: certified bit, even if the anchor's last feedback
        // is positive (complement, D33); here Y is endorsed and X is slashed in the certificate
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = CertLib.newGraph(3, 1, AN, AD, 3, 4);
        g.addRow(0, address(0), _two(1, 2), _twoW(-10_000, 10_000));
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        _submit(setId, g, g.fixedPoint(40), type(uint256).max);
        assertEq(ar.vectorAt(setId, 1, 3), 1, "flags lane: bit of anchor 0");
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, bytes32(0));
        assertEq(uint8(ar.assess(102, setId, true).status), uint8(AnchoredReputation.Status.OK));
        assertTrue(ar.isTrusted(102, setId));
    }

    function test_vetoLastPerTag() public {
        bytes32 setId = _certifiedX(1);
        address a = _anchors(1)[0];
        vm.startPrank(a);
        rep.giveFeedback(101, -1, 0, "review", "");
        rep.giveFeedback(101, 1, 0, "review", ""); // same tag: the last one wins
        vm.stopPrank();
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
    }

    function test_measurementTagNeverVetoes() public {
        bytes32 setId = _certifiedX(1);
        vm.prank(_anchors(1)[0]);
        rep.giveFeedback(101, 0, 0, "uptime", ""); // below neutral (50) but kind = measurement (D15)
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
    }

    function test_outOfBoundsIgnored() public {
        bytes32 setId = _certifiedX(1);
        vm.prank(_anchors(1)[0]);
        rep.giveFeedback(101, -1e38, 0, "slash", ""); // below min = -100: rejected, not clamped
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
    }

    function test_vetoDecimals() public {
        bytes32 setId = _certifiedX(1);
        vm.prank(_anchors(1)[0]);
        rep.giveFeedback(101, -5, 1, "review", ""); // -0.5 -> w = -5000
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.VETOED));
    }

    // ------------------------------------------------------------------ statuses
    function test_statuses() public {
        bytes32 setId = _chainSet(1);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.NO_CERT));
        assertEq(uint8(ar.assess(101, bytes32(uint256(7)), true).status), uint8(AnchoredReputation.Status.NO_CERT));
        _submit(setId, _chainGraph(true), _handT(), 100);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));

        // unknown agent: OK with zero trust (a node out of the support is 0)
        AnchoredReputation.Assessment memory u = ar.assess(999, setId, true);
        assertEq(uint8(u.status), uint8(AnchoredReputation.Status.OK));
        assertEq(u.trust, 0);

        // transfer (D10)
        idr.transfer(102, address(0xDEAD));
        assertEq(uint8(ar.assess(102, setId, true).status), uint8(AnchoredReputation.Status.TRANSFERRED));
        assertFalse(ar.isTrusted(102, setId));

        // stale
        vm.roll(block.number + 1001);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.STALE));
    }

    function test_registryChanged() public {
        bytes32 setId = _certifiedX(1);
        assertFalse(ar.checkRegistry(setId));
        rep.setVersion("2.1.0");
        // before anyone calls checkRegistry, reads still say OK (documented limit, D17)
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
        vm.expectEmit(true, false, false, false);
        emit AnchoredReputation.RegistryChanged(setId, bytes32(0), bytes32(0));
        assertTrue(ar.checkRegistry(setId));
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.REGISTRY_CHANGED));
        // a fresh certificate under the new version clears the flag
        _submit(setId, _chainGraph(true), _handT(), 100);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
    }

    function test_isTrusted() public {
        bytes32 setId = _certifiedX(1);
        assertTrue(ar.isTrusted(101, setId), "trust(X) = 0.222 >= theta 0.1");
        assertFalse(ar.isTrusted(999, setId), "unknown agent: status OK but trust 0 (AM-6.1)");
        assertEq(uint8(ar.assess(999, setId, true).status), uint8(AnchoredReputation.Status.OK));
        assertFalse(ar.assess(101, setId, false).trusted, "never trusted without the veto check");

        // a stricter policy is another set (D39: thresholds are committed in the setId)
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.theta = 3e17;
        bytes32 strict = ar.registerAnchorSet(p);
        assertTrue(strict != setId);
        ar.addNodes(strict, _agentEntries(101, 2));
        _submit(strict, _chainGraph(true), _handT(), 100);
        assertFalse(ar.isTrusted(101, strict), "0.222 < theta 0.3");
        AnchoredReputation.Policy memory q = ar.policyOf(strict);
        assertEq(q.theta, 3e17);
        assertEq(q.submitters.length, 1);
    }

    function test_vetoQuorum() public {
        address[] memory anc = _anchors(2);
        AnchoredReputation.SetParams memory p = _params(anc, 1);
        p.policy.vetoQuorum = 2;
        bytes32 setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 1));
        CertLib.Graph memory g = CertLib.newGraph(3, 2, AN, AD, 3, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(2), _oneW(10_000));
        g.addRow(2, OX, new uint256[](0), new int256[](0));
        g.ownerFp[2] = uint64(uint160(OX));
        _submit(setId, g, g.fixedPoint(40), type(uint256).max);
        assertTrue(ar.isTrusted(101, setId));
        vm.prank(anc[0]);
        rep.giveFeedback(101, -100, 0, "slash", "");
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(x.vetoCount, 1);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.OK), "one veto < q = 2");
        vm.prank(anc[1]);
        rep.giveFeedback(101, -1, 0, "review", "");
        x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, bytes32("slash"), "most negative veto names the reason");
        assertFalse(ar.isTrusted(101, setId));
    }

    function test_vetoMax() public {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.vetoMax = -5000; // only feedbacks at or below -0.5 veto
        bytes32 setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 2));
        _submit(setId, _chainGraph(true), _handT(), 100);
        vm.startPrank(_anchors(1)[0]);
        rep.giveFeedback(101, -4, 1, "review", ""); // -0.4
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.OK));
        rep.giveFeedback(101, -5, 1, "review", ""); // -0.5
        vm.stopPrank();
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.VETOED));
    }

    function test_policyValidation() public {
        AnchoredReputation.SetParams memory p = _params(_anchors(2), 1);
        p.policy.theta = 0;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 4));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.minAnchors = 3; // m > k
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 12));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.vetoMax = 0;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 13));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.submitters = new address[](0); // open submission requires Registry-verified (D32)
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 15));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.rhoN = 0;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 4));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.rhoD = 0;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 4));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.vetoQuorum = 0;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 12));
        ar.registerAnchorSet(p);
        p.policy.vetoQuorum = 3;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 12));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.vetoMax = -10_001;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 13));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.maxAge = 0;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 14));
        ar.registerAnchorSet(p);
        p = _params(_anchors(2), 1);
        p.policy.submitters = new address[](9);
        for (uint256 i; i < 9; ++i) {
            p.policy.submitters[i] = address(uint160(i + 1));
        }
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 15));
        ar.registerAnchorSet(p);
        p.policy.submitters = new address[](2);
        (p.policy.submitters[0], p.policy.submitters[1]) = (address(2), address(2)); // duplicate
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 16));
        ar.registerAnchorSet(p);
        (p.policy.submitters[0], p.policy.submitters[1]) = (address(0), address(2)); // zero address
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadParams.selector, 16));
        ar.registerAnchorSet(p);
    }

    function test_onlySubmitters() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        bytes memory v = CertLib.encodeVectors(g, _handT());
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.prank(address(0xBAD));
        vm.expectRevert(AnchoredReputation.NotSubmitter.selector);
        ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);
    }

    // ------------------------------------------------------------------ replacement rule (AM-2.3)
    function test_replacementAttested() public {
        // Submitter-attested: a listed submitter always replaces (D27), even with a worse bound
        bytes32 setId = _certifiedX(1);
        _submit(setId, _chainGraph(false), _handT(), type(uint256).max); // truncated -> much larger e
        (, uint256 eEff,,,,,,,) = ar.certificate(setId);
        assertGt(eEff, 1e17);
        _submit(setId, _chainGraph(true), _handT(), 100);
        (, eEff,,,,,,,) = ar.certificate(setId);
        assertEq(eEff, 9);
    }

    function test_nCertMonotone() public {
        bytes32 setId = _certifiedX(1);
        ar.addNodes(setId, _agentEntries(103, 1));
        CertLib.Graph memory g = CertLib.newGraph(2, 1, AN, AD, 2, 2);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        uint256[][] memory t = g.fixedPoint(30);
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.expectRevert(AnchoredReputation.BadNCert.selector);
        ar.submitCertificate(setId, 2, type(uint256).max, "", v, rows);
    }

    function test_neverRevertsOnBrokenRegistry() public {
        bytes32 setId = _certifiedX(1);
        vm.etch(address(rep), hex"fe"); // registry now always reverts
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.REGISTRY_CHANGED), "fail closed");
        vm.etch(address(idr), hex"fe");
        x = ar.assess(101, setId, false);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.TRANSFERRED), "fail closed");
    }
}

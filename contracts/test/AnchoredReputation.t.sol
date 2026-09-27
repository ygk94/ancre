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
        assertEq(CertLib.residual(g, t)[0], 3, "reference residual");
        _submit(setId, g, t, 100);
        assertEq(ar.residual(setId, 0), 3, "contract residual");
        (, uint256 eEff,,,,,,) = ar.certificate(setId);
        assertEq(eEff, 9, "e = ceil(r / alpha) = 9 wei");
        assertEq(ar.vectorAt(setId, 1, 0), t[0][1]);
        assertEq(ar.vectorAt(setId, 2, 0), t[0][2]);
        assertEq(ar.vectorAt(setId, 2, 2), uint64(uint160(OY)), "owner fingerprint lane");
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.OK));
        assertEq(x.trust, t[0][1]);
        assertEq(x.trustRobust, t[0][1], "m = 1: nothing removed");
        assertEq(x.e, 9);
    }

    function test_solverMatchesContract() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        uint256[][] memory t = g.fixedPoint(80);
        uint256[] memory r = CertLib.residual(g, t);
        _submit(setId, g, t, type(uint256).max);
        assertEq(ar.residual(setId, 0), r[0]);
    }

    function test_truncationMargin() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(false); // Y's row omitted -> truncated
        uint256[][] memory t = _handT();
        _submit(setId, g, t, type(uint256).max);
        // + ceil((1 - alpha) t_Y) = ceil(148148148148148148 * 2 / 3) = 98765432098765432
        assertEq(ar.residual(setId, 0), 3 + 98_765_432_098_765_432);
    }

    function test_wrongResidualRejected() public {
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        uint256[][] memory t = _handT();
        t[0][1] += 1e15; // wrong vector
        uint256 eBad = CertLib.eEff(g, CertLib.residual(g, t));
        assertGt(eBad, 1e15);
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.ResidualTooLarge.selector, eBad, 100));
        ar.submitCertificate(setId, 3, 100, "", v, rows);
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

    function test_vetoNegativeDominance() public {
        bytes32 setId = _certifiedX(1);
        address a = _anchors(1)[0];
        vm.prank(a);
        uint64 slashIdx = rep.giveFeedback(101, -100, 0, "slash", "");
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, bytes32("slash"));
        assertEq(x.vetoCount, 1);

        // AM-3.1: a later +1 under another tag must NOT erase the slash
        vm.prank(a);
        rep.giveFeedback(101, 1, 0, "review", "");
        x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED), "negative dominance");

        // only revocation by the author lifts it
        vm.prank(a);
        rep.revokeFeedback(101, slashIdx);
        x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.OK));
        (AnchoredReputation.Status st,,,,) = ar.trustOf(101, setId);
        assertEq(uint8(st), uint8(AnchoredReputation.Status.OK));
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
        assertFalse(ar.isTrusted(102, setId, 0, 1, 2));

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
        assertTrue(ar.isTrusted(101, setId, 1e17, 1, 2));
        assertFalse(ar.isTrusted(101, setId, 3e17, 1, 2));
    }

    // ------------------------------------------------------------------ replacement rule (AM-2.3)
    function test_replacementRule() public {
        bytes32 setId = _certifiedX(1);
        CertLib.Graph memory g = _chainGraph(false); // truncated -> much larger e
        uint256[][] memory t = _handT();
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        vm.expectRevert();
        ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);
        vm.roll(block.number + 1001); // stale -> any valid certificate replaces
        ar.submitCertificate(setId, 3, type(uint256).max, "", v, rows);
        // an equally precise one is always accepted
        _submit(setId, _chainGraph(true), _handT(), 100);
        (, uint256 eEff,,,,,,) = ar.certificate(setId);
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

    // ------------------------------------------------------------------ omission proof (D6, type i)
    function test_omissionProof() public {
        // X's wallet rated Z (vouch 80) in the registry, the certificate's row of X omits it
        vm.prank(OX);
        rep.giveFeedback(103, 80, 0, "vouch", "");
        bytes32 setId = _chainSet(1);
        ar.addNodes(setId, _agentEntries(103, 1)); // Z = node 3
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 3, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, _one(2), _oneW(10_000)); // omits X -> Z
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        uint256[][] memory t = g.fixedPoint(60);
        _submit(setId, g, t, type(uint256).max);
        uint256 r0 = ar.residual(setId, 0);

        bytes32[] memory lv = CertLib.leaves(g, 2);
        bytes memory row1 = CertLib.rowBytes(g, 1, 2);
        bytes32 keyX = ar.agentKey(101);
        ar.proveOmission(setId, 1, row1, CertLib.merkleProof(lv, 1), "", keyX, 103);

        // Delta = |w|/B' + S (B'-B)/(B B') with S = B = 1, w = 0.8, B' = 1.8
        uint256 dNum = 8000 * 10_000 + 10_000 * 8000;
        uint256 den = 3 * 10_000 * 18_000;
        uint256 inc = (t[0][1] * 2 * dNum + den - 1) / den;
        assertEq(ar.residual(setId, 0), r0 + inc, "r widened by (1-a) t_X Delta");

        // the same fact is billed once per row state
        bytes memory added = abi.encodePacked(uint32(103), int16(8000));
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 9));
        ar.proveOmission(setId, 1, row1, new bytes32[](0), added, keyX, 103);
        // a stale view of the row (without the amendment) is refused
        bytes32[] memory pf = CertLib.merkleProof(lv, 1);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 5));
        ar.proveOmission(setId, 1, row1, pf, "", keyX, 103);
    }

    function test_omissionRejectsPresentEdgeAndSelf() public {
        vm.prank(OX);
        rep.giveFeedback(102, 1, 0, "review", "");
        bytes32 setId = _chainSet(1);
        CertLib.Graph memory g = _chainGraph(true);
        _submit(setId, g, _handT(), 100);
        bytes32[] memory lv = CertLib.leaves(g, 2);
        bytes memory row1 = CertLib.rowBytes(g, 1, 2);
        bytes32[] memory pf = CertLib.merkleProof(lv, 1);
        bytes32 keyX = ar.agentKey(101);
        // X -> Y is present in the row
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 8));
        ar.proveOmission(setId, 1, row1, pf, "", keyX, 102);
        // X's wallet is X's own owner: self edge rejected (D16)
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 10));
        ar.proveOmission(setId, 1, row1, pf, "", keyX, 101);
        // wrong Merkle position
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 4));
        ar.proveOmission(setId, 0, row1, pf, "", keyX, 103);
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

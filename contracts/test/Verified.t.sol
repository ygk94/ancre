// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// D32: Registry-verified level (every committed edge re-read in the registry) and the discrepancy proofs
/// (proveEdge / proveWallet / proveTransfer), on the mocks. Real-registry cost: RegistryBench.t.sol.
contract VerifiedTest is AncreBase {
    using CertLib for CertLib.Graph;

    address constant OX = address(0xB0B1); // owner / wallet of agent X (101)
    address constant OY = address(0xB0B2); // agent Y (102)
    address constant OZ = address(0xB0B3); // agent Z (103)
    address A; // the anchor

    function setUp() public {
        _deployMocks();
        idr.mint(101, OX);
        idr.mint(102, OY);
        idr.mint(103, OZ);
        vm.roll(1000);
        A = _anchors(1)[0];
    }

    function _set(bool verified, bool open) internal returns (bytes32 setId) {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.registryVerified = verified;
        if (open) p.policy.submitters = new address[](0);
        setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 3)); // X = 1, Y = 2, Z = 3
    }

    /// A -> X (vouch 100 => +1), X -> Y (vouch 50 => +0.5); Y, Z absorbing with explicit empty rows
    function _honest() internal returns (CertLib.Graph memory g) {
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        vm.prank(OX);
        rep.giveFeedback(102, 50, 0, "vouch", "");
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, _one(2), _oneW(5000));
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        g.ownerFp[3] = uint64(uint160(OZ));
    }

    function _cd(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) internal pure returns (bytes memory) {
        return abi.encodeCall(
            AnchoredReputation.submitCertificate,
            (setId, uint32(g.n), type(uint256).max, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2))
        );
    }

    function _expectSubmitRevert(bytes32 setId, CertLib.Graph memory g, bytes memory err) internal {
        uint256[][] memory t = g.fixedPoint(60);
        vm.expectRevert(err);
        (bool ok,) = address(ar).call(_cd(setId, g, t));
        ok;
    }

    // ------------------------------------------------------------------ Registry-verified
    function test_verifiedAcceptsHonest() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        uint256[][] memory t = g.fixedPoint(60);
        vm.prank(address(0xCAFE)); // open submission: anyone
        ar.submitCertificate(setId, 4, type(uint256).max, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2));
        assertTrue(ar.isTrusted(101, setId));
        // Z has no mass: its fingerprint is not checked; a wrong one is harmless (never trusted)
    }

    /// AM-5.9 / V14: a fabricated edge is refused at submission (it replaced the honest certificate in R5)
    function test_verifiedRefusesFabricatedEdge() public {
        bytes32 setId = _set(true, true);
        _honest();
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _two(1, 3), _twoW(10_000, 10_000)); // A -> Z never happened
        g.addRow(1, OX, _one(2), _oneW(5000));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        g.ownerFp[3] = uint64(uint160(OZ));
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 0, 1));
    }

    function test_verifiedRefusesInflatedWeight() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        g.eW[1] = 10_000; // X -> Y committed at +1, registry says +0.5
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 0));
    }

    function test_verifiedRefusesWrongFeedbackIndex() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        g.eIdx[0] = 2;
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 0, 0));
    }

    function test_verifiedNegativeDominanceAndLastPerTag() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        // A: vouch 100 (idx 1), then slash -40 (idx 2), then vouch 10 (idx 3): D14 = min(+0.1, -0.4) = -0.4 at idx 2
        vm.startPrank(A);
        rep.giveFeedback(101, -40, 0, "slash", "");
        rep.giveFeedback(101, 10, 0, "vouch", "");
        vm.stopPrank();
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 0, 0));
        g.eW[0] = -4000;
        g.eIdx[0] = 2;
        uint256[][] memory t = g.fixedPoint(60);
        (bool ok,) = address(ar).call(_cd(setId, g, t));
        assertTrue(ok, "negative dominance, index of the slash");
    }

    function test_verifiedRefusesControllerAndWallet() public {
        bytes32 setId = _set(true, true);
        // Y's owner rates X, then becomes an operator of X's owner: a current controller of X (D16/D20)
        vm.prank(OY);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        idr.setOperator(OX, OY, true);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(2, OY, _one(1), _oneW(10_000));
        vm.prank(A);
        rep.giveFeedback(102, 100, 0, "vouch", "");
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 0));

        // a row whose wallet is not the agent's current agentWallet
        idr.setOperator(OX, OY, false);
        g.rowWallet[1] = OZ;
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 256));
    }

    function test_verifiedRefusesWrongOwnerFingerprint() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        g.ownerFp[1] = 0; // X has mass: its fingerprint is checked (0 is no longer a bypass)
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, type(uint256).max, 1));
    }

    function test_openReplacementRule() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        uint256[][] memory t = g.fixedPoint(60);
        (bool ok,) = address(ar).call(_cd(setId, g, t));
        assertTrue(ok);
        // same precision: refused before minRefresh (an open set is not replaceable at will)
        vm.expectRevert();
        (ok,) = address(ar).call(_cd(setId, g, t));
        // after minRefresh, an equally precise one is accepted
        vm.roll(block.number + 51);
        (ok,) = address(ar).call(_cd(setId, g, t));
        assertTrue(ok);
        // a worse one (Y truncated) is refused until stale
        CertLib.Graph memory g2 = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g2.addRow(0, address(0), _one(1), _oneW(10_000));
        g2.addRow(1, OX, _one(2), _oneW(5000));
        g2.ownerFp[1] = uint64(uint160(OX));
        g2.ownerFp[2] = uint64(uint160(OY));
        uint256[][] memory t2 = g2.fixedPoint(60);
        vm.roll(block.number + 51);
        vm.expectRevert();
        (ok,) = address(ar).call(_cd(setId, g2, t2));
        vm.roll(block.number + 1001);
        (ok,) = address(ar).call(_cd(setId, g2, t2));
        assertTrue(ok, "stale -> any valid certificate");
    }

    // ------------------------------------------------------------------ alias rows (D20)
    function test_aliasRow() public {
        // X and Z share the wallet OX: Z's row is an alias of X's row, with Z's own mass
        idr.setWallet(103, OX);
        bytes32 setId = _set(true, true);
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        vm.prank(A);
        rep.giveFeedback(103, 100, 0, "vouch", "");
        vm.prank(OX);
        rep.giveFeedback(102, 100, 0, "vouch", "");
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _two(1, 3), _twoW(10_000, 10_000));
        g.addRow(1, OX, _one(2), _oneW(10_000));
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.addAlias(3, OX, 1);
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        g.ownerFp[3] = uint64(uint160(OZ));
        uint256[][] memory t = g.fixedPoint(80);
        assertTrue(CertLib.isSubSolution(g, t));
        (bool ok,) = address(ar).call(_cd(setId, g, t));
        assertTrue(ok);
        // Y receives from X and from Z (copy of X's row): (1-a) (t_X + t_Z)
        assertEq(ar.vectorAt(setId, 2, 0), t[0][2]);
        assertApproxEqAbs(t[0][2], ((t[0][1] + t[0][3]) * 2) / 3, 2);
        (uint256 eUp0,) = ar.columnBounds(setId, 0);
        assertEq(eUp0, CertLib.eUp(g, t)[0]);

        // an alias with another wallet is refused
        g.rowWallet[3] = OZ;
        t = g.fixedPoint(80);
        vm.roll(block.number + 2000);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadRows.selector, 10));
        (ok,) = address(ar).call(_cd(setId, g, t));
    }

    // ------------------------------------------------------------------ declared B+ and dilution (V4, V7)
    /// V7: A -> {X: +1, Y: +1}; a certificate that omits A -> Y without declaring B+ inflates X by 2
    function _dilutionSetup(uint256 bDecl) internal returns (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) {
        setId = _set(false, false);
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        rep.giveFeedback(102, 100, 0, "vouch", "");
        vm.stopPrank();
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        if (bDecl == 0) g.addRow(0, address(0), _one(1), _oneW(10_000));
        else g.addRowDecl(0, address(0), _one(1), _oneW(10_000), bDecl);
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        t = g.fixedPoint(60);
        _submit(setId, g, t, type(uint256).max);
    }

    function _proofA(CertLib.Graph memory g) internal pure returns (AnchoredReputation.RowRef memory r) {
        r.pos = 0;
        r.row = CertLib.rowBytes(g, 0, 2);
        r.path = CertLib.merkleProof(CertLib.leaves(g, 2), 0);
    }

    function _none() internal pure returns (AnchoredReputation.RowRef memory r) {}

    function test_dilutionProvenWidensLowerBound() public {
        (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) = _dilutionSetup(0);
        assertEq(t[0][1], 222_222_222_222_222_222, "X inflated: true t*(X) = 0.111");
        assertTrue(ar.isTrusted(101, setId));
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        // S = B = 1 -> S' = B' = 2: the committed entry halves (dec = 1/2), the new one appears (inc = 1/2)
        // eLow = ceil(t_A (1-a) (1/2) / a) = t_A = 1/3 WAD
        (uint256 eUp0, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, t[0][0]);
        assertGt(eUp0, t[0][0]);
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertLe(x.trustLow, 111_111_111_111_111_111, "the lower bound is valid again (<= t*)");
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.STALE), "eLow > eLowMax: STALE (D36)");
        assertFalse(ar.isTrusted(101, setId));
        // the same fact is billed once
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 5));
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        bytes memory amends = abi.encodePacked(uint32(102), int16(0), int16(10_000));
        AnchoredReputation.RowRef memory r = _proofA(g);
        r.path = new bytes32[](0);
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveEdge(setId, r, _none(), amends, 102);
    }

    function test_declaredBudgetOmissionIsSafe() public {
        (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) = _dilutionSetup(20_000);
        assertEq(t[0][1], 111_111_111_111_111_111, "declared B+ = 2: X gets its true share");
        (uint256 eUpBefore,) = ar.columnBounds(setId, 0);
        assertEq(eUpBefore, CertLib.eUp(g, t)[0], "the omitted half is in the margin of eUp");
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        (uint256 eUpAfter, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, 0, "omission of a positive edge without dilution: no effect on the lower bound");
        assertEq(eUpAfter, eUpBefore, "prepaid by the declared-budget margin: not billed twice");
    }

    // ------------------------------------------------------------------ fabrication (v), revocation (iii), staleness (ii)
    function test_fabricationProvenAtAttestedLevel() public {
        bytes32 setId = _set(false, false);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000)); // no feedback of A on X at all
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        uint256[][] memory t = g.fixedPoint(60);
        _submit(setId, g, t, type(uint256).max);
        assertTrue(ar.isTrusted(101, setId));
        ar.proveEdge(setId, _proofA(g), _none(), "", 101);
        (, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, (t[0][0] * 2 * 1e18 + 1e18 - 1) / 1e18, "whole row lost: (1-a) t_A / a");
        assertEq(ar.assess(101, setId, true).trustLow, 0);
        assertFalse(ar.isTrusted(101, setId));
    }

    function test_revocationAndNewerFeedback() public {
        bytes32 setId = _set(false, false);
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        _submit(setId, g, g.fixedPoint(60), type(uint256).max);
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveEdge(setId, _proofA(g), _none(), "", 101);

        // (ii) a newer, lower feedback of the same tag: +1 -> +0.5
        vm.prank(A);
        rep.giveFeedback(101, 50, 0, "vouch", "");
        ar.proveEdge(setId, _proofA(g), _none(), "", 101);
        AnchoredReputation.RowState memory st = ar.rowStateOf(setId, 0);
        assertEq(st.dim, 5e17);
        // (iii) then revoked: +0.5 -> the older +1 is again the last non-revoked (D14): an increase
        vm.prank(A);
        rep.revokeFeedback(101, 2);
        AnchoredReputation.RowRef memory r = _proofA(g);
        r.path = new bytes32[](0);
        ar.proveEdge(setId, r, _none(), abi.encodePacked(uint32(101), int16(10_000), int16(5000)), 101);
        st = ar.rowStateOf(setId, 0);
        assertEq(st.dim, 5e17, "an increase never lowers the bill");
        assertEq(st.incP, 5e17);
        // revoke the first one too: +1 -> 0, capped at the committed mass (1)
        vm.prank(A);
        rep.revokeFeedback(101, 1);
        ar.proveEdge(setId, r, _none(), abi.encodePacked(uint32(101), int16(10_000), int16(10_000)), 101);
        st = ar.rowStateOf(setId, 0);
        assertEq(st.dim, 1e18, "cap: the row cannot lose more than its committed normalised mass");
    }

    // ------------------------------------------------------------------ (iv) wallet, transfer
    function test_proveWalletVoidsRow() public {
        bytes32 setId = _set(false, false);
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        vm.prank(OX);
        rep.giveFeedback(102, 100, 0, "vouch", "");
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, _one(2), _oneW(10_000));
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        uint256[][] memory t = g.fixedPoint(60);
        _submit(setId, g, t, type(uint256).max);
        AnchoredReputation.RowRef memory r;
        r.pos = 1;
        r.row = CertLib.rowBytes(g, 1, 2);
        r.path = CertLib.merkleProof(CertLib.leaves(g, 2), 1);
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveWallet(setId, r, "");
        idr.transfer(101, address(0xDEAD)); // agentWallet cleared on transfer
        ar.proveWallet(setId, r, "");
        (, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, (t[0][1] * 2 * 1e18 + 1e18 - 1) / 1e18, "X's outgoing mass frozen (D44)");
        assertTrue(ar.rowStateOf(setId, 1).voided);
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 23));
        ar.proveEdge(setId, r, _none(), "", 102);
    }

    function test_fastTransferMode() public {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.strictTransfer = false;
        bytes32 setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 3));
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        _submit(setId, g, g.fixedPoint(60), type(uint256).max);
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveTransfer(setId, 101);
        idr.transfer(101, address(0xDEAD));
        assertTrue(ar.isTrusted(101, setId), "fast mode: no live ownerOf until proven");
        ar.proveTransfer(setId, 101);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.TRANSFERRED));
        assertFalse(ar.isTrusted(101, setId));
    }

    // ------------------------------------------------------------------ shape (both levels), V13
    function test_attestedRefusesUnprovableShapes() public {
        bytes32 setId = _set(false, false);
        // an edge to an anchor node: no ERC-8004 feedback can target it, so no proof could ever touch it
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(1, OX, _one(0), _oneW(10_000));
        g.ownerFp[1] = uint64(uint160(OX));
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 0, 0));
        // an agent row without its wallet (no client: unprovable)
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, address(0), _one(2), _oneW(10_000));
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 256));
        // an anchor row with a wallet
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, OZ, _one(1), _oneW(10_000));
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 0, 256));
    }

    function test_fabricatedEdgeToNonexistentAgentIsProvable() public {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        bytes32 setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(999, 1)); // node 1 = agent #999, never minted
        CertLib.Graph memory g = CertLib.newGraph(2, 1, AN, AD, 2, 2);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.ownerFp[1] = 1;
        _submit(setId, g, g.fixedPoint(60), type(uint256).max);
        ar.proveEdge(setId, _proofA(g), _none(), "", 999); // registry reverts -> no edge can hold
        (, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertGt(eLow0, 0);
    }

    /// V13: the certificate omits the anchor's negative edge (slash then +1 by the same anchor: the live
    /// veto sees +1). A proof on the anchor row restores the certified veto bit.
    function test_vetoOmissionRestoredByProof() public {
        bytes32 setId = _set(false, false);
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        rep.giveFeedback(102, -100, 0, "slash", "");
        rep.giveFeedback(102, 1, 0, "review", "");
        vm.stopPrank();
        vm.prank(OX);
        rep.giveFeedback(102, 100, 0, "vouch", "");
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000)); // omits A -> Y (-1)
        g.addRow(1, OX, _one(2), _oneW(10_000));
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        _submit(setId, g, g.fixedPoint(60), type(uint256).max);
        assertEq(uint8(ar.assess(102, setId, true).status), uint8(AnchoredReputation.Status.OK), "V13: veto disarmed");
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        assertEq(uint8(ar.assess(102, setId, true).status), uint8(AnchoredReputation.Status.VETOED), "bit restored");
        assertFalse(ar.isTrusted(102, setId));
    }
}

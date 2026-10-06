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
        // with a low-level call, expectRevert does not fail by itself: ok is true iff it reverted with err
        _direct();
        (bool ok,) = address(ar).call(_cd(setId, g, t));
        assertTrue(ok, "submission did not revert as expected");
    }

    // ------------------------------------------------------------------ Registry-verified
    function test_verifiedAcceptsHonest() public {
        bytes32 setId = _set(true, true);
        CertLib.Graph memory g = _honest();
        uint256[][] memory t = g.fixedPoint(60);
        vm.prank(address(0xCAFE), address(0xCAFE)); // open submission: anyone (directly, G-11)
        ar.submitCertificate(setId, 4, type(uint256).max, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2));
        assertTrue(ar.passesAnchorPolicy(101, setId));
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
        _direct();
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

    function _submitOk(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) internal {
        _direct();
        ar.submitCertificate(setId, uint32(g.n), type(uint256).max, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2));
    }

    function _submitRefused(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) internal {
        _direct();
        (bool ok, bytes memory ret) = address(ar).call(_cd(setId, g, t));
        assertFalse(ok, "replacement must be refused");
        assertEq(bytes4(ret), AnchoredReputation.NotBetter.selector);
    }

    /// X's row: A -> X, X -> {Y: w1, Z: w2} (0 = absent); Y and Z absorbing (explicit empty rows)
    function _chain(int256 w1, int256 w2) internal pure returns (CertLib.Graph memory g) {
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        if (w1 != 0 && w2 != 0) g.addRow(1, OX, _two(2, 3), _twoW(w1, w2));
        else if (w1 != 0) g.addRow(1, OX, _one(2), _oneW(w1));
        else if (w2 != 0) g.addRow(1, OX, _one(3), _oneW(w2));
        else g.addRow(1, OX, new uint256[](0), new int256[](0));
        if (w1 != 0) g.addRow(2, OY, new uint256[](0), new int256[](0));
        if (w2 != 0) g.addRow(3, OZ, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        g.ownerFp[3] = uint64(uint160(OZ));
    }

    /// AM-04.1 / AM-5.16 / AM-02.2: replacement rule of an open set, by quality (q, mass), not by eUp.
    function test_openReplacementRule() public {
        bytes32 setId = _set(true, true);
        _honest(); // A -> X (+1), X -> Y (+0.5)
        CertLib.Graph memory g = _chain(5000, 0);
        _submitOk(setId, g, g.fixedPoint(60));
        // identical certificate: same quality, accepted (non-strict rule; the submitter pays)
        _submitOk(setId, g, g.fixedPoint(60));

        // censorship: X's endorsement of Y omitted (X's row kept, empty). It has FEWER positive edges, so a
        // smaller eUp: the v1 rule (eNew < eCur) accepted it. Now: Y's mass is lost -> refused.
        CertLib.Graph memory gc = _chain(0, 0);
        assertLt(CertLib.eEff(gc, gc.fixedPoint(60)), CertLib.eEff(g, g.fixedPoint(60)), "censor has a smaller eUp");
        _submitRefused(setId, gc, gc.fixedPoint(60));

        // growing graph (AM-04.1): X now also vouches for Z (+0.4), the row stays under GRID (no dilution):
        // more edges, larger eUp, same q (0) and more mass -> accepted at once, before minRefresh
        vm.prank(OX);
        rep.giveFeedback(103, 40, 0, "vouch", "");
        CertLib.Graph memory g2 = _chain(5000, 4000);
        assertGt(CertLib.eEff(g2, g2.fixedPoint(60)), CertLib.eEff(g, g.fixedPoint(60)), "growth raises eUp");
        _submitOk(setId, g2, g2.fixedPoint(60));

        // a revocation lowers the true mass: the honest update is refused until the incumbent is PROVEN to
        // overstate (proveEdge widens its eLow, which is credited to the newcomer)
        vm.prank(OX);
        rep.revokeFeedback(102, 1);
        CertLib.Graph memory g3 = _chain(0, 4000);
        _submitRefused(setId, g3, g3.fixedPoint(60));
        AnchoredReputation.RowRef memory r;
        r.pos = 1;
        r.row = CertLib.rowBytes(g2, 1, 2);
        r.path = CertLib.merkleProof(CertLib.leaves(g2, 2), 1);
        ar.proveEdge(setId, r, _none(), "", 102);
        _submitOk(setId, g3, g3.fixedPoint(60));

        // AM-5.16: the zero vector is a valid sub-solution, but q ~ 1 WAD: refused, even in the refresh window
        uint256[][] memory zero = new uint256[][](1);
        zero[0] = new uint256[](4);
        CertLib.Graph memory gz = CertLib.newGraph(4, 1, AN, AD, 0, 0);
        // (block numbers are explicit: via-IR caches block.number inside a test function)
        _submitRefused(setId, gz, zero);
        vm.roll(1051);
        _submitRefused(setId, gz, zero);
        // once stale, anything replaces, and the honest certificate replaces the zero vector at once
        vm.roll(2052);
        _submitOk(setId, gz, zero);
        _submitOk(setId, g3, g3.fixedPoint(60));

        // refresh window: after minRefresh, an equally precise certificate with less mass passes (a decrease
        // that nobody proved): the price of liveness, bounded by minRefresh (AM-INT.2)
        vm.roll(2103);
        _submitOk(setId, gc, gc.fixedPoint(60));
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
        _direct();
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
        _direct();
        (ok,) = address(ar).call(_cd(setId, g, t));
        assertTrue(ok, "alias with another wallet must revert BadRows(10)");
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
        assertTrue(ar.passesAnchorPolicy(101, setId));
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        // S = B = 1 -> S' = B' = 2: the committed entry halves (dec = 1/2), the new one appears (inc = 1/2)
        // eLow = ceil(t_A (1-a) (1/2) / a) = t_A = 1/3 WAD
        (uint256 eUp0, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, t[0][0]);
        assertGt(eUp0, t[0][0]);
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertLe(x.trustLow, 111_111_111_111_111_111, "the lower bound is valid again (<= t*)");
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.STALE), "eLow > eLowMax: STALE (D36)");
        assertFalse(ar.passesAnchorPolicy(101, setId));
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
        // A2b (02-bis, review 06/10): the contract cannot tell this declared omission from a NEW edge (true sum
        // 3 instead of 2), so it bills the worst case: X's entry 1/2 may be 1/3 (eLow += (1-a) t_A (1/6) / a) and
        // the omitted mass may still be there (eUp += beyond the prepaid 1/2). Conservative, never unsound.
        assertEq(eLow0, (t[0][0] * 2 * 166_666_666_666_666_667 + 1e18 - 1) / 1e18, "worst case: the edge is new");
        assertGt(eUpAfter, eUpBefore);
        // the honest certificate (same declared omission) still comes back at once: the proven edge (A, Y) is a
        // fact, and a declared omission that covers it is allowed (ENCODING §3.5)
        _submitOk(setId, g, t);
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
        assertTrue(ar.passesAnchorPolicy(101, setId));
        ar.proveEdge(setId, _proofA(g), _none(), "", 101);
        (, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, (t[0][0] * 2 * 1e18 + 1e18 - 1) / 1e18, "whole row lost: (1-a) t_A / a");
        assertEq(ar.assess(101, setId, true).trustLow, 0);
        assertFalse(ar.passesAnchorPolicy(101, setId));
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
        // R3 (02-bis): bounds are measured against the COMMITTED row: back to +1 = the committed state, no excess
        assertEq(st.incP, 0);
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
        ar.proveWallet(setId, r, _none(), "");
        idr.transfer(101, address(0xDEAD)); // agentWallet cleared on transfer
        ar.proveWallet(setId, r, _none(), "");
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
        assertTrue(ar.passesAnchorPolicy(101, setId), "fast mode: no live ownerOf until proven");
        ar.proveTransfer(setId, 101);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.TRANSFERRED));
        assertFalse(ar.passesAnchorPolicy(101, setId));
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
        assertFalse(ar.passesAnchorPolicy(102, setId));
    }

    // ------------------------------------------------------------------ unified v1 format (integration 02+04)
    function _rowRef(CertLib.Graph memory g, uint256 r) internal pure returns (AnchoredReputation.RowRef memory x) {
        x.pos = r;
        x.row = CertLib.rowBytes(g, r, 2);
        x.path = CertLib.merkleProof(CertLib.leaves(g, 2), r);
    }

    function _setFallback(bool fallback_) internal returns (bytes32 setId) {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.registryVerified = true;
        p.policy.submitters = new address[](0);
        p.policy.ownerFallback = fallback_;
        setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 3));
    }

    /// D44: Y (102) has agentWallet = 0; with the owner fallback, its row is its owner's row (VIA_OWNER)
    function _viaOwnerGraph() internal returns (CertLib.Graph memory g) {
        idr.setWallet(102, address(0));
        vm.prank(A);
        rep.giveFeedback(102, 100, 0, "vouch", "");
        vm.prank(OY);
        rep.giveFeedback(103, 100, 0, "vouch", "");
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(2, OY, _one(3), _oneW(10_000));
        g.rowViaOwner[1] = true;
        g.addRow(3, OZ, new uint256[](0), new int256[](0));
        g.ownerFp[2] = uint64(uint160(OY));
        g.ownerFp[3] = uint64(uint160(OZ));
    }

    function test_viaOwnerRows() public {
        CertLib.Graph memory g = _viaOwnerGraph();
        uint256[][] memory t = g.fixedPoint(60);
        // a set without the fallback refuses VIA_OWNER rows (the edge rule is committed in the setId)
        bytes32 noFb = _setFallback(false);
        _expectSubmitRevert(noFb, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 256));
        bytes32 setId = _setFallback(true);
        _submitOk(setId, g, t);
        assertGt(t[0][3], 0, "Z receives mass through Y's owner row");
        assertTrue(ar.policyOf(setId).ownerFallback);
        // proveEdge on a VIA_OWNER row reads the owner's feedback
        vm.prank(OY);
        rep.revokeFeedback(103, 1);
        ar.proveEdge(setId, _rowRef(g, 1), _none(), "", 103);
        assertGt(ar.rowStateOf(setId, 2).dim, 0);
        // the wallet always wins: once Y gets a wallet, the owner row is no longer Y's row (D44 (iv-a))
        AnchoredReputation.RowRef memory r = _rowRef(g, 1);
        r.path = new bytes32[](0);
        bytes memory amends = abi.encodePacked(uint32(103), int16(10_000), int16(0));
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveWallet(setId, r, _none(), amends);
        idr.setWallet(102, address(0xBEEF));
        ar.proveWallet(setId, r, _none(), amends);
        assertTrue(ar.rowStateOf(setId, 2).voided);
        // and at submission, a VIA_OWNER row of an agent that has a wallet is refused
        vm.roll(5000);
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 256));
    }

    function test_viaOwnerRowFollowsTransfer() public {
        CertLib.Graph memory g = _viaOwnerGraph();
        bytes32 setId = _setFallback(true);
        _submitOk(setId, g, g.fixedPoint(60));
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveWallet(setId, _rowRef(g, 1), _none(), "");
        idr.transfer(102, address(0xD00D)); // new owner: the committed source (OY) is stale
        ar.proveWallet(setId, _rowRef(g, 1), _none(), "");
        (, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertGt(eLow0, 0, "Y's outgoing mass frozen (D44)");
    }

    /// An agent with mass and agentWallet = 0 (no fallback) is absorbing: its empty row has no source (FORMAT
    /// R7). It is accepted (no truncation margin) and stays challengeable once a wallet appears.
    function test_sourcelessEmptyRow() public {
        idr.setWallet(101, address(0));
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        bytes32 setId = _setFallback(false);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, address(0), new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        uint256[][] memory t = g.fixedPoint(60);
        CertLib.Graph memory gt = CertLib.newGraph(4, 1, AN, AD, 4, 4); // same, X truncated
        gt.addRow(0, address(0), _one(1), _oneW(10_000));
        gt.ownerFp[1] = uint64(uint160(OX));
        assertLt(CertLib.eEff(g, t), CertLib.eEff(gt, t) / 1e6, "the empty row avoids the truncation margin");
        // refused on a fallback set (src(X) would be its owner) and with edges (no client to read them from)
        _expectSubmitRevert(_setFallback(true), g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 256));
        _submitOk(setId, g, t);
        (, uint256 eEffOn,,,,,,,) = ar.certificate(setId);
        assertEq(eEffOn, CertLib.eEff(g, t));
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveWallet(setId, _rowRef(g, 1), _none(), "");
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.BadProof.selector, 7));
        ar.proveEdge(setId, _rowRef(g, 1), _none(), "", 102);
        idr.setWallet(101, OX);
        ar.proveWallet(setId, _rowRef(g, 1), _none(), "");
        (uint256 eUp0, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertEq(eLow0, 0, "an empty row loses nothing: dim capped at its committed mass (0)");
        assertGt(eUp0, CertLib.eUp(g, t)[0], "the unknown new row widens the upper side");
        // a source-less row is refused at submission once the agent has a wallet
        vm.roll(5000);
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 256));
    }

    /// AM-04.2: tags longer than 32 bytes (execution.market) are accepted; only keccak256(tag) is stored
    function test_longTagsAccepted() public {
        string memory longTag = "requester_rating:knowledge_access"; // 33 bytes, 3 feedbacks on the mainnet
        assertEq(bytes(longTag).length, 33);
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        AnchoredReputation.TagSpec[] memory t5 = new AnchoredReputation.TagSpec[](5);
        for (uint256 i; i < 4; ++i) {
            t5[i] = p.tags[i];
        }
        t5[4] = AnchoredReputation.TagSpec(longTag, 0, 50e18, 100e18, 0);
        for (uint256 i; i < 5; ++i) {
            for (uint256 j = i + 1; j < 5; ++j) {
                if (keccak256(bytes(t5[j].tag)) < keccak256(bytes(t5[i].tag))) (t5[i], t5[j]) = (t5[j], t5[i]);
            }
        }
        p.tags = t5;
        p.policy.registryVerified = true;
        p.policy.submitters = new address[](0);
        bytes32 setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 3));
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, longTag, ""); // 100 in [0, 50, 100] => +1
        rep.giveFeedback(102, 0, 0, longTag, ""); // 0 => -1: a veto by a long tag
        vm.stopPrank();
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _two(1, 2), _twoW(10_000, -10_000));
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        _submitOk(setId, g, g.fixedPoint(60));
        assertTrue(ar.passesAnchorPolicy(101, setId));
        AnchoredReputation.Assessment memory x = ar.assess(102, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, keccak256(bytes(longTag)), "triggerTag = keccak256(tag1)");
    }

    /// D32 unified: the declared value is the TRUE positive sum sPlus, and B+ = max(GRID, sPlus). Below GRID
    /// the omission margin is exact, (sPlus - S)/GRID, where a declared B+ (= GRID) charged (GRID - S)/GRID.
    function test_declaredSPlusBelowGrid() public {
        bytes32 setId = _set(false, false);
        vm.startPrank(A);
        rep.giveFeedback(101, 30, 0, "vouch", ""); // +0.3
        rep.giveFeedback(102, 20, 0, "vouch", ""); // +0.2, omitted below
        vm.stopPrank();
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRowDecl(0, address(0), _one(1), _oneW(3000), 5000);
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        uint256[][] memory t = g.fixedPoint(60);
        CertLib.Graph memory gOld = CertLib.newGraph(4, 1, AN, AD, 4, 4); // the 02 encoding: B+ = 10 000 declared
        gOld.addRowDecl(0, address(0), _one(1), _oneW(3000), 10_000);
        gOld.addRow(1, OX, new uint256[](0), new int256[](0));
        assertLt(CertLib.eUp(g, t)[0] * 3, CertLib.eUp(gOld, t)[0], "exact margin: 0.2 instead of 0.7 of t_A");
        _submitOk(setId, g, t);
        (uint256 eUp0,) = ar.columnBounds(setId, 0);
        assertEq(eUp0, CertLib.eUp(g, t)[0]);
        // the omitted edge, proven: no dilution (0.5 < 1), already prepaid by the margin
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        (uint256 eUp1, uint256 eLow1) = ar.columnBounds(setId, 0);
        assertEq(eLow1, 0, "below GRID the budget does not move: no dilution");
        // A2b: if the revealed edge is NEW, the declared 0.2 is still omitted elsewhere: excess 0.4, prepaid 0.2
        assertEq(eUp1 - eUp0, (t[0][0] * 2 * 2e17 + 1e18 - 1) / 1e18, "worst case beyond the prepaid 0.2");
        // a declared sPlus below the committed sum is refused
        g.rowBDecl[0] = 2999;
        vm.roll(5000);
        _expectSubmitRevert(setId, g, abi.encodeWithSelector(AnchoredReputation.BadRows.selector, 7));
    }

    // ------------------------------------------------------------------ fixes of the integration review (01/10)
    /// review 2a: omitting a negative edge changes neither mass nor q; the distrust mass now refuses it
    function test_replacementRefusesOmittedNegative() public {
        bytes32 setId = _set(true, true);
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        rep.giveFeedback(102, -100, 0, "slash", "");
        vm.stopPrank();
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _two(1, 2), _twoW(10_000, -10_000));
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        _submitOk(setId, g, g.fixedPoint(60));
        CertLib.Graph memory gc = CertLib.newGraph(4, 1, AN, AD, 4, 4); // the slash omitted
        gc.addRow(0, address(0), _one(1), _oneW(10_000));
        gc.addRow(1, OX, new uint256[](0), new int256[](0));
        gc.ownerFp[1] = uint64(uint160(OX));
        _submitRefused(setId, gc, gc.fixedPoint(60));
    }

    /// review 2b: a certificate proven wrong cannot be resubmitted as is to erase its proofs
    function test_replacementRefusesResubmittingProvenCertificate() public {
        bytes32 setId = _set(true, true);
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        rep.giveFeedback(102, 100, 0, "vouch", "");
        vm.stopPrank();
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4); // dilution: A -> Y omitted, no sPlus
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        uint256[][] memory t = g.fixedPoint(60);
        _submitOk(setId, g, t);
        ar.proveEdge(setId, _proofA(g), _none(), "", 102);
        // D48-C (02-bis): the proven row itself is refused, before the replacement rule
        _direct();
        (bool ok, bytes memory ret) = address(ar).call(_cd(setId, g, t));
        assertFalse(ok);
        assertEq(ret, abi.encodeWithSelector(AnchoredReputation.ProvenRowResubmitted.selector, 0));
        CertLib.Graph memory gh = CertLib.newGraph(4, 1, AN, AD, 4, 4); // the honest one replaces at once
        gh.addRow(0, address(0), _two(1, 2), _twoW(10_000, 10_000));
        gh.addRow(1, OX, new uint256[](0), new int256[](0));
        gh.addRow(2, OY, new uint256[](0), new int256[](0));
        gh.ownerFp[1] = uint64(uint160(OX));
        gh.ownerFp[2] = uint64(uint160(OY));
        _submitOk(setId, gh, gh.fixedPoint(60));
    }

    /// review 3 and 5: proveWallet on an alias bills its source's committed mass S0/B0 (not 1), and a declared
    /// sPlus margin is not billed twice
    function test_proveWalletAliasAndPrepaid() public {
        bytes32 setId = _set(false, false);
        idr.setWallet(103, OX); // X (101) and Z (103) share the wallet OX
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _two(1, 3), _twoW(10_000, 10_000));
        g.addRowDecl(1, OX, _one(2), _oneW(3000), 5000); // +0.3 committed, true positive sum 0.5
        g.addRow(2, OY, new uint256[](0), new int256[](0));
        g.addAlias(3, OX, 1);
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        g.ownerFp[3] = uint64(uint160(OZ));
        uint256[][] memory t = g.fixedPoint(60);
        _submit(setId, g, t, type(uint256).max);
        (uint256 eUp0,) = ar.columnBounds(setId, 0);
        idr.setWallet(103, address(0xBEEF));
        ar.proveWallet(setId, _rowRef(g, 3), _rowRef(g, 1), "");
        (uint256 eUp1, uint256 eLow1) = ar.columnBounds(setId, 0);
        assertEq(eLow1, (t[0][3] * 2 * 3e17 + 1e18 - 1) / 1e18, "dim = S0/B0 = 0.3 of the source row");
        // inc = (1 - prepaid 0.2) + 1 = 1.8
        assertEq(eUp1 - eUp0, (t[0][3] * 2 * 18e17 + 1e18 - 1) / 1e18, "prepaid sPlus margin not billed twice");
    }

    /// review 4: a burnt agent's source-less row has nothing to prove (no new client can appear)
    function test_burntSourcelessRowNothingToProve() public {
        idr.setWallet(101, address(0));
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        bytes32 setId = _setFallback(false);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, address(0), new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        _submitOk(setId, g, g.fixedPoint(60));
        // a real burn (R6, 02-bis): ownerOf reverts ERC721NonexistentToken and getAgentWallet answers 0
        // (measured on the v2.0.0 registry); a getAgentWallet that reverts is an unreadable registry instead
        idr.transfer(101, address(0));
        vm.expectRevert(AnchoredReputation.NothingToProve.selector);
        ar.proveWallet(setId, _rowRef(g, 1), _none(), "");
    }
}

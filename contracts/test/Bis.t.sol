// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// Chantier 02-bis (D48): non-regression tests of the defects A, B, C (AM-08.14 to .16) and of the findings
/// R1 to R8 of the maximal review of 2026-10-05. Written on 2026-10-06 against the contract of `main`
/// (commit bc2d911), where every test of this file FAILS: each one replays the attack and asserts the
/// corrected behaviour. Error selectors are spelled as strings so that the file compiles before the fix.
contract BisTest is AncreBase {
    using CertLib for CertLib.Graph;

    address constant OX = address(0xB0B1); // agent X (101)
    address constant OY = address(0xB0B2); // agent Y (102)
    address constant OZ = address(0xB0B3); // agent Z (103)

    bytes4 constant ANCHOR_AS_SOURCE = bytes4(keccak256("AnchorAsSource(uint256)"));
    bytes4 constant PROVEN_ROW = bytes4(keccak256("ProvenRowResubmitted(uint256)"));
    bytes4 constant NOT_CANONICAL = bytes4(keccak256("NotCanonical(uint256)"));

    function setUp() public {
        _deployMocks();
        idr.mint(101, OX);
        idr.mint(102, OY);
        idr.mint(103, OZ);
        vm.roll(1000);
    }

    // ------------------------------------------------------------------ helpers
    function _set(uint256 k, uint8 m, bool open) internal returns (bytes32 setId) {
        AnchoredReputation.SetParams memory p = _params(_anchors(k), m);
        if (open) {
            p.policy.registryVerified = true;
            p.policy.submitters = new address[](0);
        }
        setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 3)); // nodes k, k+1, k+2 = X, Y, Z
    }

    function _cd(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t, uint256 W) internal pure returns (bytes memory) {
        return abi.encodeCall(
            AnchoredReputation.submitCertificate,
            (setId, uint32(g.n), type(uint256).max, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, W))
        );
    }

    function _try(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t, uint256 W)
        internal
        returns (bool ok, bytes memory ret)
    {
        (ok, ret) = address(ar).call(_cd(setId, g, t, W));
    }

    function _ok(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) internal {
        (bool ok, bytes memory ret) = _try(setId, g, t, 2);
        if (!ok) {
            emit log_named_bytes("revert", ret);
            fail();
        }
    }

    /// the submission must revert with exactly `err`
    function _refused(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t, uint256 W, bytes memory err)
        internal
    {
        (bool ok, bytes memory ret) = _try(setId, g, t, W);
        assertFalse(ok, "submission accepted, must be refused");
        assertEq(ret, err, "wrong revert reason");
    }

    function _rowRef(CertLib.Graph memory g, uint256 r) internal pure returns (AnchoredReputation.RowRef memory x) {
        x.pos = r;
        x.row = CertLib.rowBytes(g, r, 2);
        x.path = CertLib.merkleProof(CertLib.leaves(g, 2), r);
    }

    function _none() internal pure returns (AnchoredReputation.RowRef memory r) {}

    // ================================================================== R1 (critical)
    /// PoC of the maximal review: an address(0) node desynchronised the registry re-read from the arithmetic
    /// pass, and a fabricated edge passed at Registry-verified. The node table refuses address(0).
    function test_R1_zeroAddressNodeRefused() public {
        bytes32 setId = _set(1, 1, true);
        bytes memory zero = new bytes(21);
        zero[0] = bytes1(uint8(2));
        vm.expectRevert(AnchoredReputation.BadNodes.selector);
        ar.addNodes(setId, zero);
        // the same entry through submitCertificate(newNodes)
        vm.expectRevert(AnchoredReputation.BadNodes.selector);
        ar.submitCertificate(setId, 1, type(uint256).max, zero, new bytes(16), hex"0200000000");
    }

    /// the PoC itself, end to end: node 1 = address(0) (permissionless addNodes), X = 2, Z = 3; the address(0)
    /// row sits BEFORE X's row, so every later row escaped the re-read: the fabricated X -> Z edge passed.
    function test_R1_pocFabricationNeverAccepted() public {
        AnchoredReputation.SetParams memory p = _params(_anchors(1), 1);
        p.policy.registryVerified = true;
        p.policy.submitters = new address[](0);
        bytes32 setId = ar.registerAnchorSet(p);
        vm.prank(_anchors(1)[0]);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        bytes memory zero = new bytes(21);
        zero[0] = bytes1(uint8(2));
        bytes memory xz = bytes.concat(_agentEntries(101, 1), _agentEntries(103, 1));
        (bool added,) = address(ar).call(abi.encodeCall(AnchoredReputation.addNodes, (setId, bytes.concat(zero, xz))));
        if (!added) ar.addNodes(setId, xz);
        uint256 x = added ? 2 : 1;
        CertLib.Graph memory g = CertLib.newGraph(x + 2, 1, AN, AD, 4, 8);
        g.addRow(0, address(0), _one(x), _oneW(10_000)); // A -> X: real
        if (added) g.addRow(1, address(0), _two(0, 2), _twoW(8192, 1)); // the address(0) row: crafted bytes
        g.addRow(x, OX, _one(x + 1), _oneW(10_000)); // X -> Z: FABRICATED (X never rated Z)
        g.addRow(x + 1, OZ, new uint256[](0), new int256[](0));
        g.ownerFp[x] = uint64(uint160(OX));
        g.ownerFp[x + 1] = uint64(uint160(OZ));
        (bool ok,) = _try(setId, g, g.fixedPoint(60), 2);
        assertFalse(ok, "fabricated edge accepted at Registry-verified");
        assertFalse(ar.isTrusted(103, setId));
        assertEq(rep.getLastIndex(103, OX), 0, "X never rated Z");
    }

    // ================================================================== A (AM-08.14)
    /// k = 2, m = 2. A1's key is stolen: the attacker makes A1 the agentWallet of an agent U that A0 endorses.
    /// U's row is then A1's row (row copy, D20) spread with U's column-0 mass: the Sybil E gets mass in BOTH
    /// columns from a single compromised anchor, and m = 2 is void.
    function _anchorAsSource() internal returns (bytes32 setId, CertLib.Graph memory g) {
        address[] memory an = _anchors(2);
        setId = _set(2, 2, true); // X = node 2 (= U), Y = node 3, Z = node 4 (= E)
        vm.prank(an[0]);
        rep.giveFeedback(101, 100, 0, "vouch", ""); // A0 -> U, honest
        vm.prank(an[1]);
        rep.giveFeedback(103, 100, 0, "vouch", ""); // A1 (compromised) -> E
        idr.setWallet(101, an[1]); // setAgentWallet signed with the stolen key
        g = CertLib.newGraph(5, 2, AN, AD, 5, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(4), _oneW(10_000));
        g.addRow(2, an[1], _one(4), _oneW(10_000)); // U's row = A1's edges
        g.addRow(4, OZ, new uint256[](0), new int256[](0));
        g.ownerFp[2] = uint64(uint160(OX));
        g.ownerFp[4] = uint64(uint160(OZ));
    }

    function test_A_anchorAsSourceRefused() public {
        (bytes32 setId, CertLib.Graph memory g) = _anchorAsSource();
        _refused(setId, g, g.fixedPoint(80), 2, abi.encodeWithSelector(ANCHOR_AS_SOURCE, 2));
        assertFalse(ar.isTrusted(103, setId), "one stolen anchor key must not pass m = 2");
    }

    /// the same at the Submitter-attested level (the rule is a shape rule, no registry read)
    function test_A_anchorAsSourceRefusedAttested() public {
        address[] memory an = _anchors(2);
        bytes32 setId = _set(2, 2, false);
        CertLib.Graph memory g = CertLib.newGraph(5, 2, AN, AD, 5, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(4), _oneW(10_000));
        g.addRow(2, an[1], _one(4), _oneW(10_000));
        g.ownerFp[2] = uint64(uint160(OX));
        g.ownerFp[4] = uint64(uint160(OZ));
        _refused(setId, g, g.fixedPoint(80), 2, abi.encodeWithSelector(ANCHOR_AS_SOURCE, 2));
    }

    /// the honest certificate: U is absorbing (no row, truncation margin); E has mass in column 1 only
    function test_A_honestCertificateWithoutTheAnchorRow() public {
        (bytes32 setId,) = _anchorAsSource();
        CertLib.Graph memory g = CertLib.newGraph(5, 2, AN, AD, 5, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(4), _oneW(10_000));
        g.addRow(4, OZ, new uint256[](0), new int256[](0));
        g.ownerFp[2] = uint64(uint160(OX));
        g.ownerFp[4] = uint64(uint160(OZ));
        _ok(setId, g, g.fixedPoint(80));
        assertFalse(ar.isTrusted(103, setId), "E: one column only, m = 2 refuses");
    }

    // ================================================================== B (AM-08.15)
    /// A slashes X, then X's owner makes A an operator: the registry then forbids A to post on X, and the
    /// contract dropped A's (negative) edge as a "controller" edge. The negative edge must be kept.
    function test_B_controllerNegativeKept() public {
        bytes32 setId = _set(1, 1, true);
        address A = _anchors(1)[0];
        vm.prank(A);
        rep.giveFeedback(101, -100, 0, "slash", "");
        idr.setOperator(OX, A, true);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(-10_000));
        g.ownerFp[1] = uint64(uint160(OX));
        _ok(setId, g, g.fixedPoint(60));
        assertGt(ar.assess(101, setId, false).distrust, 0, "the slash counts in the distrust");
    }

    /// a controller's POSITIVE edge stays rejected (self-endorsement)
    function test_B_controllerPositiveStillRejected() public {
        bytes32 setId = _set(1, 1, true);
        address A = _anchors(1)[0];
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        idr.approve(101, A);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.ownerFp[1] = uint64(uint160(OX));
        _refused(setId, g, g.fixedPoint(60), 2, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 0, 0));
    }

    function _trustedX(bool strict) internal returns (bytes32 setId) {
        AnchoredReputation.SetParams memory p = _params(_anchors(2), 1);
        p.policy.strictTransfer = strict;
        setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 1));
        CertLib.Graph memory g = CertLib.newGraph(3, 2, AN, AD, 3, 2);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(2), _oneW(10_000));
        g.ownerFp[2] = uint64(uint160(OX));
        _submit(setId, g, g.fixedPoint(60), type(uint256).max);
        assertTrue(ar.isTrusted(101, setId));
    }

    /// preventive censorship: approving an anchor BEFORE it slashes silences it in the registry. In strict mode
    /// assess counts an approved (getApproved) or operator (isApprovedForAll) anchor as a veto.
    function test_B_approvedAnchorVetoesStrict() public {
        bytes32 setId = _trustedX(true);
        idr.approve(101, _anchors(2)[1]);
        AnchoredReputation.Assessment memory x = ar.assess(101, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED), "getApproved(j) == anchor: veto");
        assertEq(x.vetoCount, 1);
        assertFalse(ar.isTrusted(101, setId));
    }

    function test_B_operatorAnchorVetoesStrict() public {
        bytes32 setId = _trustedX(true);
        idr.setOperator(OX, _anchors(2)[0], true);
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.VETOED));
        assertFalse(ar.isTrusted(101, setId));
    }

    /// fast mode: the same fact is posted by a proof, proveApproval(setId, agentId, anchorIndex)
    function test_B_proveApprovalFastMode() public {
        bytes32 setId = _trustedX(false);
        idr.approve(101, _anchors(2)[1]);
        assertTrue(ar.isTrusted(101, setId), "fast mode: no live approval read");
        (bool ok,) = address(ar).call(abi.encodeWithSignature("proveApproval(bytes32,uint256,uint256)", setId, 101, 1));
        assertTrue(ok, "proveApproval");
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.VETOED));
    }

    // ================================================================== C (AM-08.16) and R2 / R4
    /// dilution (A -> Y omitted, no sPlus), proven; returns the certificate's graph and vectors
    function _provenDilution(bool open) internal returns (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) {
        setId = _set(1, 1, open);
        address A = _anchors(1)[0];
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        rep.giveFeedback(102, 100, 0, "vouch", "");
        vm.stopPrank();
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, new uint256[](0), new int256[](0));
        g.ownerFp[1] = uint64(uint160(OX));
        t = g.fixedPoint(60);
        _ok(setId, g, t);
        ar.proveEdge(setId, _rowRef(g, 0), _none(), "", 102);
        (, uint256 eLowEff,,,,,,,) = ar.certificate(setId);
        assertGt(eLowEff, 0, "proven");
    }

    /// R2: the guard compared raw roots; changing one wei of a vector (another vectorRoot) slipped through
    function test_C_provenRowResubmittedWithOtherVectors() public {
        (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) = _provenDilution(true);
        t[0][1] -= 1; // still a sub-solution, other vectorRoot, same rows
        _refused(setId, g, t, 2, abi.encodeWithSelector(PROVEN_ROW, 0));
    }

    /// R2 / AM-10.5: the same row re-encoded (W = 4: other bytes, other graphRoot, same decoded row)
    function test_C_provenRowResubmittedReencoded() public {
        (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) = _provenDilution(true);
        _refused(setId, g, t, 4, abi.encodeWithSelector(PROVEN_ROW, 0));
    }

    /// AM-08.16: the guard was skipped under REGISTRY_CHANGED
    function test_C_provenRowResubmittedUnderRegistryChanged() public {
        (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) = _provenDilution(true);
        rep.setVersion("2.1.0");
        assertTrue(ar.checkRegistry(setId));
        _refused(setId, g, t, 2, abi.encodeWithSelector(PROVEN_ROW, 0));
    }

    /// also at the Submitter-attested level (a listed submitter replaces, but not with a proven lie)
    function test_C_provenRowResubmittedAttested() public {
        (bytes32 setId, CertLib.Graph memory g, uint256[][] memory t) = _provenDilution(false);
        _refused(setId, g, t, 2, abi.encodeWithSelector(PROVEN_ROW, 0));
    }

    /// the corrected row (the omitted edge added) is accepted at once
    function test_C_correctedRowAccepted() public {
        (bytes32 setId,,) = _provenDilution(true);
        CertLib.Graph memory h = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        h.addRow(0, address(0), _two(1, 2), _twoW(10_000, 10_000));
        h.addRow(1, OX, new uint256[](0), new int256[](0));
        h.addRow(2, OY, new uint256[](0), new int256[](0));
        h.ownerFp[1] = uint64(uint160(OX));
        h.ownerFp[2] = uint64(uint160(OY));
        _ok(setId, h, h.fixedPoint(60));
    }

    /// R4: the shape rule read the decoded value, not the SRC bit: an anchor row with SRC = 0 passed
    function test_C_srcBitWithZeroSourceRefused() public {
        bytes32 setId = _set(1, 1, false);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.ownerFp[1] = uint64(uint160(OX));
        bytes memory rows = CertLib.encodeRows(g, 2);
        // set the SRC bit of the anchor row and insert 20 zero bytes after its header
        bytes memory bad = bytes.concat(_slice(rows, 0, 9), new bytes(20), _slice(rows, 9, rows.length));
        bad[5 + 2] = bytes1(uint8(bad[5 + 2]) | 0x80);
        uint256[][] memory t = g.fixedPoint(60);
        (bool ok, bytes memory ret) = address(ar).call(
            abi.encodeCall(AnchoredReputation.submitCertificate, (setId, 4, type(uint256).max, "", CertLib.encodeVectors(g, t), bad))
        );
        assertFalse(ok, "SRC bit with a zero source accepted");
        assertEq(ret, abi.encodeWithSelector(NOT_CANONICAL, 0));
    }

    /// canonical form: SPLUS only when sPlus exceeds the committed positive sum (else two encodings)
    function test_C_sPlusEqualToSumRefused() public {
        bytes32 setId = _set(1, 1, false);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRowDecl(0, address(0), _one(1), _oneW(10_000), 10_000);
        g.ownerFp[1] = uint64(uint160(OX));
        _refused(setId, g, g.fixedPoint(60), 2, abi.encodeWithSelector(NOT_CANONICAL, 0));
    }

    function _slice(bytes memory b, uint256 from, uint256 to) internal pure returns (bytes memory r) {
        r = new bytes(to - from);
        for (uint256 i; i < r.length; ++i) {
            r[i] = b[from + i];
        }
    }

    // ================================================================== R3
    /// declared row: A -> X, A -> Z committed (+1 each), A -> Y omitted (+1), sPlus = 3. A revokes X: the true
    /// row is now {Z: 1/2, Y: 1/2}; Z's committed entry 1/3 is too low by 1/6 and Y's 1/2 exceeds the prepaid 1/3:
    /// eUp must grow by 1/3 of the row (t-space: (1 - alpha) t_A (1/3) / alpha). The old formula kept the budget
    /// at max(GRID, sPlus) and billed nothing.
    function test_R3_revokedEdgeOfDeclaredRowWidensUpperBound() public {
        bytes32 setId = _set(1, 1, false);
        address A = _anchors(1)[0];
        vm.startPrank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        rep.giveFeedback(102, 100, 0, "vouch", "");
        rep.giveFeedback(103, 100, 0, "vouch", "");
        vm.stopPrank();
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRowDecl(0, address(0), _two(1, 3), _twoW(10_000, 10_000), 30_000);
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[3] = uint64(uint160(OZ));
        uint256[][] memory t = g.fixedPoint(60);
        _ok(setId, g, t);
        (uint256 eUp0,) = ar.columnBounds(setId, 0);
        vm.prank(A);
        rep.revokeFeedback(101, 1);
        ar.proveEdge(setId, _rowRef(g, 0), _none(), "", 101);
        (uint256 eUp1, uint256 eLow1) = ar.columnBounds(setId, 0);
        uint256 tA = t[0][0];
        assertGe(eLow1, (tA * 2) / 3, "X's committed 1/3 is lost");
        assertGe(eUp1 - eUp0, (tA * 2) / 3, "excess beyond the prepaid margin: 1/3 of the row");
    }

    // ================================================================== R5
    /// anchors carry a zero owner fingerprint (ENCODING §3.1); it was never checked
    function test_R5_anchorFingerprintChecked() public {
        bytes32 setId = _set(1, 1, true);
        address A = _anchors(1)[0];
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.ownerFp[0] = 1;
        g.ownerFp[1] = uint64(uint160(OX));
        _refused(setId, g, g.fixedPoint(60), 2, abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, type(uint256).max, 0));
    }

    /// dryRun skipped the shape rule and the 2^63 bound on ownerFp
    function test_R5_dryRunAppliesShapeAndBounds() public {
        bytes32 setId = _set(1, 1, false);
        CertLib.Graph memory g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.ownerFp[1] = type(uint64).max; // >= 2^63
        uint256[][] memory t = g.fixedPoint(60);
        (bool ok,) = address(ar).staticcall(
            abi.encodeCall(AnchoredReputation.dryRun, (setId, 4, CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2)))
        );
        assertFalse(ok, "dryRun accepted an ownerFp >= 2^63");
        // an edge to the anchor (not an agent node): refused at submission by the shape rule
        CertLib.Graph memory h = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        h.addRow(1, OX, _one(0), _oneW(10_000));
        (ok,) = address(ar).staticcall(
            abi.encodeCall(AnchoredReputation.dryRun, (setId, 4, CertLib.encodeVectors(h, h.fixedPoint(60)), CertLib.encodeRows(h, 2)))
        );
        assertFalse(ok, "dryRun accepted an edge to a non-agent node");
    }

    // ================================================================== R6
    /// a registry call that fails (out of gas after an upgrade, empty revert data) is not an answer: proofs must
    /// revert instead of reading it as "the agent does not exist"
    function _attestedAX() internal returns (bytes32 setId, CertLib.Graph memory g) {
        setId = _set(1, 1, false);
        address A = _anchors(1)[0];
        vm.prank(A);
        rep.giveFeedback(101, 100, 0, "vouch", "");
        vm.prank(OX);
        rep.giveFeedback(102, 100, 0, "vouch", "");
        g = CertLib.newGraph(4, 1, AN, AD, 4, 4);
        g.addRow(0, address(0), _one(1), _oneW(10_000));
        g.addRow(1, OX, _one(2), _oneW(10_000));
        g.ownerFp[1] = uint64(uint160(OX));
        g.ownerFp[2] = uint64(uint160(OY));
        _ok(setId, g, g.fixedPoint(60));
    }

    function test_R6_unreadableRegistryIsNotABurntAgent_proveEdge() public {
        (bytes32 setId, CertLib.Graph memory g) = _attestedAX();
        vm.mockCallRevert(address(idr), abi.encodeWithSelector(idr.isAuthorizedOrOwner.selector), "");
        vm.expectRevert(AnchoredReputation.RegistryUnreadable.selector);
        ar.proveEdge(setId, _rowRef(g, 0), _none(), "", 101);
    }

    function test_R6_unreadableRegistryIsNotABurntAgent_proveWallet() public {
        (bytes32 setId, CertLib.Graph memory g) = _attestedAX();
        vm.mockCallRevert(address(idr), abi.encodeWithSelector(idr.getAgentWallet.selector), "");
        vm.expectRevert(AnchoredReputation.RegistryUnreadable.selector);
        ar.proveWallet(setId, _rowRef(g, 1), _none(), "");
    }

    function test_R6_unreadableRegistryIsNotABurntAgent_proveTransfer() public {
        (bytes32 setId,) = _attestedAX();
        vm.mockCallRevert(address(idr), abi.encodeWithSelector(idr.ownerOf.selector), "");
        vm.expectRevert(AnchoredReputation.RegistryUnreadable.selector);
        ar.proveTransfer(setId, 101);
    }

    /// a real "nonexistent token" answer is still an answer: a fabricated edge to a burnt agent is provable
    function test_R6_nonexistentAgentStillProvable() public {
        (bytes32 setId, CertLib.Graph memory g) = _attestedAX();
        vm.mockCallRevert(
            address(idr),
            abi.encodeWithSelector(idr.isAuthorizedOrOwner.selector),
            abi.encodeWithSelector(MockIdentity.ERC721NonexistentToken.selector, 101)
        );
        ar.proveEdge(setId, _rowRef(g, 0), _none(), "", 101);
        (, uint256 eLow0) = ar.columnBounds(setId, 0);
        assertGt(eLow0, 0);
    }

    // ================================================================== R7
    /// strict mode tested trust != 0 (rounded down per column) instead of mass > 0: a transferred agent of tiny
    /// mass showed OK
    function test_R7_strictTransferOnMassNotTrust() public {
        AnchoredReputation.SetParams memory p = _params(_anchors(2), 1);
        bytes32 setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, _agentEntries(101, 1));
        CertLib.Graph memory g = CertLib.newGraph(3, 2, AN, AD, 3, 2);
        g.addRow(0, address(0), _one(2), _oneW(1)); // weight 1e-4
        g.ownerFp[2] = uint64(uint160(OX));
        uint256[][] memory t = g.fixedPoint(60);
        t[0][2] = 1; // 1 wei in column 0: lambda 1/2 => floor = 0, trust 0, mass > 0
        _ok(setId, g, t);
        assertEq(ar.assess(101, setId, true).trust, 0);
        idr.transfer(101, address(0xDEAD));
        assertEq(uint8(ar.assess(101, setId, true).status), uint8(AnchoredReputation.Status.TRANSFERRED));
    }
}

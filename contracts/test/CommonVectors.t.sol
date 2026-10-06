// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./utils/VectorBase.sol";

/// Common vectors of 02-bis and 04-bis (D48: A, B, C, R1, 2nd hop), produced by the solver
/// (`solver/common_vectors.py`, vectors/common/*.json). Each vector is self-contained: the `registry` block is
/// replayed on the mocks (agents, operators, approvals, feedback in index order), then the solver's calldata is
/// submitted and `expect` is checked: submission outcome, per-agent reading, and the C proof/resubmission
/// sequence. The mainnet one runs on a fork at its `forkBlock` against the real ERC-8004 registries.
/// Run with the 04-bis extract: ANCRE_VECTORS=.v04bis/solver/vectors/ forge test --match-contract CommonVectors
contract CommonVectorsTest is VectorBase {
    function _registry(string memory j) internal {
        _deployMocks();
        vm.roll(1000);
        uint256 na;
        while (vm.keyExistsJson(j, string.concat(".registry.agents[", vm.toString(na), "]"))) ++na;
        for (uint256 i; i < na; ++i) {
            string memory b = string.concat(".registry.agents[", vm.toString(i), "]");
            uint256 id = vm.parseJsonUint(j, string.concat(b, ".agentId"));
            idr.mint(id, vm.parseJsonAddress(j, string.concat(b, ".owner")));
            idr.setWallet(id, vm.parseJsonAddress(j, string.concat(b, ".agentWallet")));
        }
        // feedback first: the registry refuses a controller's feedback, approvals come after (as on chain)
        uint256 nf;
        while (vm.keyExistsJson(j, string.concat(".registry.feedbacks[", vm.toString(nf), "]"))) ++nf;
        for (uint256 i; i < nf; ++i) {
            string memory b = string.concat(".registry.feedbacks[", vm.toString(i), "]");
            address c = vm.parseJsonAddress(j, string.concat(b, ".client"));
            uint256 id = vm.parseJsonUint(j, string.concat(b, ".agentId"));
            vm.prank(c);
            uint64 idx = rep.giveFeedback(
                id,
                int128(vm.parseJsonInt(j, string.concat(b, ".value"))),
                uint8(vm.parseJsonUint(j, string.concat(b, ".decimals"))),
                vm.parseJsonString(j, string.concat(b, ".tag1")),
                vm.parseJsonString(j, string.concat(b, ".tag2"))
            );
            if (vm.parseJsonBool(j, string.concat(b, ".revoked"))) {
                vm.prank(c);
                rep.revokeFeedback(id, idx);
            }
        }
        for (uint256 i; i < na; ++i) {
            string memory b = string.concat(".registry.agents[", vm.toString(i), "]");
            address ap = vm.parseJsonAddress(j, string.concat(b, ".approved"));
            if (ap != address(0)) idr.approve(vm.parseJsonUint(j, string.concat(b, ".agentId")), ap);
        }
        uint256 no;
        while (vm.keyExistsJson(j, string.concat(".registry.operators[", vm.toString(no), "]"))) ++no;
        for (uint256 i; i < no; ++i) {
            string memory b = string.concat(".registry.operators[", vm.toString(i), "]");
            idr.setOperator(
                vm.parseJsonAddress(j, string.concat(b, ".owner")), vm.parseJsonAddress(j, string.concat(b, ".operator")), true
            );
        }
    }

    function _submitter(AnchoredReputation.SetParams memory p) internal pure returns (address) {
        return p.policy.submitters.length != 0 ? p.policy.submitters[0] : address(0xCAFE);
    }

    function _call(string memory j, string memory cdKey, bytes32 setId, address who, uint256 n)
        internal
        returns (bool ok, bytes memory ret)
    {
        bytes memory nodes = ar.nodeCount(setId) > vm.parseJsonAddressArray(j, ".set.anchors").length
            ? bytes("")
            : vm.parseJsonBytes(j, string.concat(cdKey, ".newNodes"));
        if (nodes.length != 0 && vm.parseJsonAddressArray(j, ".set.policy.submitters").length == 0) {
            // open set: nodes in their own transaction (A1d); a refused node table is the outcome
            (ok, ret) = address(ar).call(abi.encodeCall(AnchoredReputation.addNodes, (setId, nodes)));
            if (!ok) return (ok, ret);
            nodes = "";
        }
        bytes memory cd = abi.encodeCall(
            AnchoredReputation.submitCertificate,
            (setId, uint32(n), type(uint256).max, nodes, vm.parseJsonBytes(j, string.concat(cdKey, ".vectors")),
                vm.parseJsonBytes(j, string.concat(cdKey, ".rows")))
        );
        vm.prank(who, who);
        (ok, ret) = address(ar).call(cd);
    }

    /// registers the set, submits the vector's calldata, checks the outcome and the readings
    function _run(string memory name, bytes memory err) internal returns (bytes32 setId, string memory j) {
        j = _load(string.concat("common/", name));
        AnchoredReputation.SetParams memory p = _params(j);
        setId = ar.registerAnchorSet(p);
        assertEq(setId, vm.parseJsonBytes32(j, ".set.setId"), string.concat(name, ": setId"));
        (bool ok, bytes memory ret) = _call(j, ".calldata", setId, _submitter(p), vm.parseJsonUint(j, ".nCert"));
        if (err.length != 0) {
            assertFalse(ok, string.concat(name, ": must be refused"));
            assertEq(ret, err, string.concat(name, ": revert reason"));
            return (setId, j);
        }
        if (!ok) emit log_named_bytes("revert", ret);
        assertTrue(ok, string.concat(name, ": must be accepted"));
        _reads(j, setId, name);
    }

    function _reads(string memory j, bytes32 setId, string memory name) internal view {
        if (!vm.keyExistsJson(j, ".expect.read")) return;
        string[] memory ids = vm.parseJsonKeys(j, ".expect.read");
        for (uint256 i; i < ids.length; ++i) {
            string memory b = string.concat(".expect.read.", ids[i]);
            uint256 id = vm.parseUint(ids[i]);
            AnchoredReputation.Assessment memory x = ar.assess(id, setId, true);
            string memory tag = string.concat(name, " #", ids[i]);
            assertEq(x.trustRobust, _u(j, string.concat(b, ".trustRobust")), string.concat(tag, ": trustRobust"));
            assertEq(x.distrust, _u(j, string.concat(b, ".distrust")), string.concat(tag, ": distrust"));
            assertEq(
                ar.passesAnchorPolicy(id, setId),
                vm.parseJsonBool(j, string.concat(b, ".passesAnchorPolicy")),
                string.concat(tag, ": passesAnchorPolicy")
            );
        }
    }

    function _e(string memory sig, uint256 v) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(keccak256(bytes(sig))), v);
    }

    // ------------------------------------------------------------------ A
    function test_common_A_anchorNotSource() public {
        _registry(_load("common/common_A_anchor_not_source"));
        _run("common_A_anchor_not_source", "");
    }

    function test_common_A_attackAnchorCopy() public {
        _registry(_load("common/common_A_attack_anchor_copy"));
        _run("common_A_attack_anchor_copy", _e("AnchorAsSource(uint256)", 2));
    }

    function test_common_A_mainnetOldSlashAnchor() public {
        string memory j = _load("common/common_A_mainnet_old_slash_anchor");
        vm.createSelectFork("monad", vm.parseJsonUint(j, ".expect.forkBlock"));
        ar = new AnchoredReputation(IIdentityRegistry8004(ID), IReputationRegistry8004(REP));
        _run("common_A_mainnet_old_slash_anchor", _e("AnchorAsSource(uint256)", 5));
    }

    // ------------------------------------------------------------------ B
    function test_common_B_controllerNegative() public {
        _registry(_load("common/common_B_controller_negative"));
        _run("common_B_controller_negative", "");
    }

    // ------------------------------------------------------------------ C
    function test_common_C_provenRowResubmitted() public {
        string memory name = "common_C_proven_row_resubmitted";
        _registry(_load(string.concat("common/", name)));
        (bytes32 setId, string memory j) = _run(name, "");
        // the proof named by the vector: proveEdge on row 0 for agentJ (the fabricated edge)
        uint256 rowIdx = vm.parseJsonUint(j, ".expect.then.proveEdge.row");
        uint256 agentJ = vm.parseJsonUint(j, ".expect.then.proveEdge.agentJ");
        AnchoredReputation.RowRef memory r = _rowRef(vm.parseJsonBytes(j, ".calldata.rows"), rowIdx);
        AnchoredReputation.RowRef memory none;
        ar.proveEdge(setId, r, none, "", agentJ);
        AnchoredReputation.SetParams memory p = _params(j);
        uint256 n2 = vm.parseJsonUint(j, ".resubmission.nCert");
        (bool ok, bytes memory ret) = _call(j, ".resubmission.calldata", setId, _submitter(p), n2);
        assertFalse(ok, "proven row resubmitted");
        assertEq(ret, _e("ProvenRowResubmitted(uint256)", 0));
        // and under REGISTRY_CHANGED (not expressible in the static vector)
        rep.setVersion("2.1.0");
        assertTrue(ar.checkRegistry(setId));
        (ok, ret) = _call(j, ".resubmission.calldata", setId, _submitter(p), n2);
        assertEq(ret, _e("ProvenRowResubmitted(uint256)", 0), "under REGISTRY_CHANGED");
        (ok, ret) = _call(j, ".control.calldata", setId, _submitter(p), n2);
        if (!ok) emit log_named_bytes("revert", ret);
        assertTrue(ok, "the honest certificate is accepted");
    }

    // ------------------------------------------------------------------ R1, 2nd hop
    function test_common_R1_addressZeroNode() public {
        _registry(_load("common/common_R1_address_zero_node"));
        _run("common_R1_address_zero_node", abi.encodeWithSignature("BadNodes()"));
    }

    function test_common_2hop() public {
        _registry(_load("common/common_2hop"));
        _run("common_2hop", "");
    }

    function test_common_2hopOneAnchor() public {
        _registry(_load("common/common_2hop_one_anchor"));
        _run("common_2hop_one_anchor", "");
    }

    // ------------------------------------------------------------------ rows -> Merkle proof (independent parser)
    function _rowRef(bytes memory rows, uint256 pos) internal pure returns (AnchoredReputation.RowRef memory x) {
        uint256 W = uint8(rows[0]);
        uint256 nr = (uint256(uint8(rows[1])) << 24) | (uint256(uint8(rows[2])) << 16) | (uint256(uint8(rows[3])) << 8)
            | uint256(uint8(rows[4]));
        bytes32[] memory lv = new bytes32[](nr);
        uint256 off = 5;
        for (uint256 r; r < nr; ++r) {
            uint256 hdr = (uint256(uint8(rows[off + W])) << 8) | uint256(uint8(rows[off + W + 1]));
            uint256 len = W + 2 + (hdr & 0x8000 != 0 ? 20 : 0) + (hdr & 0x4000 != 0 ? 4 : 0)
                + (hdr & 0x2000 != 0 ? W : 0) + (hdr & 0x0fff) * (W + 6);
            bytes memory rb = new bytes(len);
            for (uint256 i; i < len; ++i) {
                rb[i] = rows[off + i];
            }
            lv[r] = keccak256(rb);
            if (r == pos) x.row = rb;
            off += len;
        }
        x.pos = pos;
        x.path = CertLib.merkleProof(lv, pos);
    }
}

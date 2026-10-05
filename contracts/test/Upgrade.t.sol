// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// D28 (chantier 02, E7): fork of Monad mainnet, the real registries, the real edges of 0xea0b… on #2, #3,
/// #4 certified at the Registry-verified level, then the IdentityRegistry proxy upgraded to the v2.1.0
/// implementation of erc-8004-contracts PR #80 (reverse lookup, unique agentWallet; fixture compiled from
/// commit 80305be, see test/fixtures). Checks: REGISTRY_CHANGED is detected, payments stop (fail closed),
/// and a scripted recertification under the new version passes the registry re-reads again.
/// Run: forge test --match-contract UpgradeTest -vv
contract UpgradeTest is AncreBase {
    using CertLib for CertLib.Graph;

    address constant ID = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REP = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;
    address constant EA = 0xEa0b21FB2441464f4920CE3E34D478235605816B;
    address constant A0 = address(0x1000);
    uint256 constant FORK_BLOCK = 108_445_171;
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    bytes32 setId;

    function setUp() public {
        vm.createSelectFork("monad", FORK_BLOCK);
        ar = new AnchoredReputation(IIdentityRegistry8004(ID), IReputationRegistry8004(REP));
    }

    /// anchors A0 (node 0, no feedback), EA (node 1); agents #2, #3, #4 = nodes 2, 3, 4 (no rows: truncated).
    /// EA's row, D14 on the real data: #2 vouch 100 (idx 1) -> +1 ; #3 review 1 (idx 1) -> +1 ;
    /// #4 {slash -100 (idx 1), review +1 (idx 2)} -> negative dominance -> -1 at idx 1.
    function _graph() internal view returns (CertLib.Graph memory g) {
        g = CertLib.newGraph(5, 2, AN, AD, 2, 3);
        g.addRow(0, address(0), new uint256[](0), new int256[](0));
        uint256[] memory d = new uint256[](3);
        (d[0], d[1], d[2]) = (2, 3, 4);
        int256[] memory w = new int256[](3);
        (w[0], w[1], w[2]) = (10_000, 10_000, -10_000);
        g.addRow(1, address(0), d, w);
        for (uint256 i = 2; i <= 4; ++i) {
            g.ownerFp[i] = ar.ownerFingerprint(IIdentityRegistry8004(ID).ownerOf(i));
        }
    }

    function _submit(CertLib.Graph memory g) internal returns (uint256 billed) {
        uint256[][] memory t = g.fixedPoint(60);
        bytes memory cd = abi.encodeCall(
            AnchoredReputation.submitCertificate,
            (setId, uint32(5), type(uint256).max, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2))
        );
        (bool ok, bytes memory ret) = address(ar).call(cd);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        billed = vm.lastCallGas().gasTotalUsed;
    }

    function test_fork_realEdgesRegistryVerified() public {
        address[] memory anc = new address[](2);
        (anc[0], anc[1]) = (A0, EA);
        AnchoredReputation.SetParams memory p = _params(anc, 1);
        p.policy.registryVerified = true;
        p.policy.submitters = new address[](0); // open
        setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, abi.encodePacked(uint8(1), uint32(2), uint8(1), uint32(3), uint8(1), uint32(4)));
        CertLib.Graph memory g = _graph();
        g.eIdx[2] = 1; // the slash
        emit log_named_uint("P1|mainnet real edges (3), Registry-verified, billed", _submit(g));
        // the same row with #4 at +1 (the LAST feedback, ignoring D14 dominance) is refused
        CertLib.Graph memory bad = _graph();
        bad.eW[2] = 10_000;
        bad.eIdx[2] = 2;
        vm.expectRevert(abi.encodeWithSelector(AnchoredReputation.EdgeMismatch.selector, 1, 2));
        this.submitExt(bad);

        AnchoredReputation.Assessment memory x3 = ar.assess(3, setId, true);
        assertEq(uint8(x3.status), uint8(AnchoredReputation.Status.OK));
        assertGt(x3.trust, 0);
        AnchoredReputation.Assessment memory x4 = ar.assess(4, setId, true);
        assertEq(uint8(x4.status), uint8(AnchoredReputation.Status.VETOED), "certified bit (EA's last is +1)");
        assertGt(x4.distrust, 0);
    }

    function submitExt(CertLib.Graph memory g) external {
        _submit(g);
    }

    function test_fork_upgradeToPR80() public {
        address[] memory anc = new address[](2);
        (anc[0], anc[1]) = (A0, EA);
        AnchoredReputation.SetParams memory p = _params(anc, 1);
        p.policy.registryVerified = true;
        p.policy.submitters = new address[](0);
        setId = ar.registerAnchorSet(p);
        ar.addNodes(setId, abi.encodePacked(uint8(1), uint32(2), uint8(1), uint32(3), uint8(1), uint32(4)));
        CertLib.Graph memory g = _graph();
        _submit(g);
        (,,,,, bytes32 vh0,,,) = ar.certificate(setId);
        address w2 = IIdentityRegistry8004(ID).getAgentWallet(2);
        address o3 = IIdentityRegistry8004(ID).ownerOf(3);

        // upgrade the IdentityRegistry proxy to the PR #80 implementation (what the upgrade key could do)
        string memory fx = vm.readFile("test/fixtures/IdentityRegistryV210_pr80.json");
        bytes memory code = vm.parseJsonBytes(fx, ".bytecode");
        address impl;
        assembly {
            impl := create(0, add(code, 32), mload(code))
        }
        require(impl != address(0), "PR #80 implementation deployment failed");
        vm.store(ID, IMPL_SLOT, bytes32(uint256(uint160(impl))));
        assertEq(IIdentityRegistry8004(ID).getVersion(), "2.1.0");
        // the reads ANCRE relies on keep their values across the upgrade (storage layout compatible)
        assertEq(IIdentityRegistry8004(ID).getAgentWallet(2), w2);
        assertEq(IIdentityRegistry8004(ID).ownerOf(3), o3);

        // before anyone calls checkRegistry: still OK (documented limit, D17); then fail closed
        assertEq(uint8(ar.assess(3, setId, true).status), uint8(AnchoredReputation.Status.OK));
        assertTrue(ar.checkRegistry(setId));
        assertEq(uint8(ar.assess(3, setId, true).status), uint8(AnchoredReputation.Status.REGISTRY_CHANGED));
        assertFalse(ar.isTrusted(3, setId));

        // scripted recertification (D28): same graph, re-read through v2.1.0, new version committed
        uint256 billed = _submit(g);
        emit log_named_uint("D28|recertification after upgrade, Registry-verified, billed", billed);
        (,,,,, bytes32 vh1,,,) = ar.certificate(setId);
        assertTrue(vh1 != vh0, "the new version is committed");
        assertEq(uint8(ar.assess(3, setId, true).status), uint8(AnchoredReputation.Status.OK));
        assertFalse(ar.checkRegistry(setId));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// Fake implementation used to simulate an upgrade of the real UUPS proxy (D17).
contract FakeRepV21 {
    function getVersion() external pure returns (string memory) {
        return "2.1.0";
    }
}

/// Probe measuring the real cost of registry calls through the ERC-1967 proxies (cold account + impl).
contract Probe {
    function versionCost(address t) external view returns (uint256 g1, uint256 g2) {
        uint256 g = gasleft();
        IIdentityRegistry8004(t).getVersion();
        g1 = g - gasleft();
        g = gasleft();
        IIdentityRegistry8004(t).getVersion();
        g2 = g - gasleft();
    }
}

/// Fork of Monad mainnet (chain 143). Run: forge test --match-contract ForkTest -vv
/// Real ERC-8004 v2.0.0 registries; the real case used is 0xea0b… -> #4: `slash -100` (idx 1)
/// followed by `review +1` (idx 2) — the only useful negative edge of the registry (AM-3.1).
contract ForkTest is AncreBase {
    using CertLib for CertLib.Graph;

    address constant ID = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REP = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;
    address constant EA = 0xEa0b21FB2441464f4920CE3E34D478235605816B;
    address constant A0 = address(0x1000); // second demo anchor (no feedback on mainnet)
    uint256 constant FORK_BLOCK = 108_445_171;
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    bytes32 setId;

    function setUp() public {
        vm.createSelectFork("monad", FORK_BLOCK);
        ar = new AnchoredReputation(IIdentityRegistry8004(ID), IReputationRegistry8004(REP));
    }

    /// anchors A0 (node 0), EA (node 1); agents #2 (node 2), #3 (node 3), #4 (node 4).
    /// Row of EA follows D14 on the real data: #2 vouch 100 -> +1, #3 review 1 -> +1,
    /// #4 {slash -100, review +1} -> negative dominance -> -1.
    function _certify(bool omitEdgeTo3) internal returns (CertLib.Graph memory gg, uint256[][] memory t) {
        address[] memory anc = new address[](2);
        anc[0] = A0;
        anc[1] = EA;
        setId = ar.registerAnchorSet(_params(anc, 1));
        ar.addNodes(setId, abi.encodePacked(uint8(1), uint32(2), uint8(1), uint32(3), uint8(1), uint32(4)));
        gg = _forkGraph(omitEdgeTo3);
        t = gg.fixedPoint(60);
        _submit(setId, gg, t, type(uint256).max);
    }

    /// separate frame (via-IR stack depth)
    function _forkGraph(bool omitEdgeTo3) internal view returns (CertLib.Graph memory gg) {
        gg = CertLib.newGraph(5, 2, AN, AD, 5, 4);
        gg.addRow(0, address(0), new uint256[](0), new int256[](0));
        if (omitEdgeTo3) {
            gg.addRow(1, address(0), _two(2, 4), _twoW(10_000, -10_000));
        } else {
            (uint256[] memory d, int256[] memory w) = _eaRow3();
            gg.addRow(1, address(0), d, w);
        }
        _setOwnerFps(gg);
    }

    /// EA's full row (#2 +1, #3 +1, #4 -1); own frame (via-IR stack depth)
    function _eaRow3() internal pure returns (uint256[] memory d, int256[] memory w) {
        d = new uint256[](3);
        (d[0], d[1], d[2]) = (2, 3, 4);
        w = new int256[](3);
        (w[0], w[1], w[2]) = (10_000, 10_000, -10_000);
    }

    function _setOwnerFps(CertLib.Graph memory gg) internal view {
        for (uint256 i = 2; i <= 4; ++i) {
            gg.ownerFp[i] = ar.ownerFingerprint(IIdentityRegistry8004(ID).ownerOf(i));
        }
    }

    function test_fork_versionCommitted() public {
        assertEq(IIdentityRegistry8004(ID).getVersion(), "2.0.0");
        assertEq(IReputationRegistry8004(REP).getVersion(), "2.0.0");
        _certify(false);
        (,,,,, bytes32 vh,,,) = ar.certificate(setId);
        assertEq(vh, keccak256(abi.encode(ID, keccak256("2.0.0"), REP, keccak256("2.0.0"))));
        assertFalse(ar.checkRegistry(setId));
    }

    function test_fork_vetoOnRealSlash() public {
        _certify(false);
        AnchoredReputation.Assessment memory x4 = ar.assess(4, setId, true);
        // D33: EA's LAST feedback on #4 is `review +1` (idx 2), so the live veto does not fire; the
        // certified bit (EA's row: slash -100 dominates -> -1) does. This is AM-5.10, on real data.
        assertEq(uint8(x4.status), uint8(AnchoredReputation.Status.VETOED), "#4 vetoed by the certified bit");
        assertEq(x4.triggerTag, bytes32(0), "no live veto: only the certified bit");
        assertEq(x4.vetoCount, 1);
        emit log_named_uint("assess(#4, veto) billed gas (isolated tx)", vm.lastCallGas().gasTotalUsed);

        AnchoredReputation.Assessment memory x3 = ar.assess(3, setId, true);
        assertEq(uint8(x3.status), uint8(AnchoredReputation.Status.OK));
        assertGt(x3.trust, 0);
        assertGt(ar.assess(4, setId, false).distrust, 0, "#4 also receives one-hop distrust");
        emit log_named_uint("#3 trust (WAD)", x3.trust);
    }

    function test_fork_upgradeDetected() public {
        _certify(false);
        FakeRepV21 fake = new FakeRepV21();
        vm.store(REP, IMPL_SLOT, bytes32(uint256(uint160(address(fake)))));
        assertEq(IReputationRegistry8004(REP).getVersion(), "2.1.0");
        assertTrue(ar.checkRegistry(setId));
        AnchoredReputation.Assessment memory x = ar.assess(3, setId, true);
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.REGISTRY_CHANGED));
    }

    function _read(Consumer c, uint256 id, bytes32 sid, bool veto, bool viaTrustOf) internal returns (uint256 marginal) {
        c.baseline(ar, id, sid, veto);
        uint256 base = vm.lastCallGas().gasTotalUsed;
        if (viaTrustOf) c.trust(ar, id, sid, veto);
        else c.check(ar, id, sid, veto);
        marginal = vm.lastCallGas().gasTotalUsed - base;
    }

    function test_fork_gas_reads() public {
        _certify(false);
        Probe p = new Probe();
        (uint256 c1, uint256 c2) = p.versionCost(REP);
        emit log_named_uint("getVersion via proxy, first call (cold)", c1);
        emit log_named_uint("getVersion via proxy, second call (warm)", c2);
        Consumer c = new Consumer();
        emit log_named_uint("READ|assess #3 no veto k=2|marginal", _read(c, 3, setId, false, false));
        emit log_named_uint("READ|assess #3 veto k=2 (EA: 1 feedback)|marginal", _read(c, 3, setId, true, false));
        emit log_named_uint("READ|assess #4 veto k=2 (EA: 2 feedbacks, VETOED)|marginal", _read(c, 4, setId, true, false));
        emit log_named_uint("READ|trustOf #3 (veto) k=2|marginal", _read(c, 3, setId, true, true));
        emit log_named_uint("READ|assess unknown agent 999 veto k=2|marginal", _read(c, 999, setId, true, false));
        ar.checkRegistry(setId);
        emit log_named_uint("TX|checkRegistry|billed", vm.lastCallGas().gasTotalUsed);
    }

    /// k anchors without feedback on the agent: cost of the veto loop alone (one getLastIndex each)
    function test_fork_gas_vetoK() public {
        uint256[4] memory ks = [uint256(1), 2, 3, 8];
        Consumer c = new Consumer();
        for (uint256 q; q < 4; ++q) {
            uint256 k = ks[q];
            address[] memory anc = _anchors(k);
            bytes32 sid = ar.registerAnchorSet(_params(anc, 1));
            ar.addNodes(sid, abi.encodePacked(uint8(1), uint32(3)));
            CertLib.Graph memory gg = CertLib.newGraph(k + 1, k, AN, AD, 1, 1);
            gg.addRow(0, address(0), _one(k), _oneW(10_000));
            gg.ownerFp[k] = ar.ownerFingerprint(IIdentityRegistry8004(ID).ownerOf(3));
            uint256[][] memory t = gg.fixedPoint(40);
            ar.submitCertificate(sid, uint32(k + 1), type(uint256).max, "", CertLib.encodeVectors(gg, t), CertLib.encodeRows(gg, 2));
            emit log_named_uint(string.concat("READ|assess no-veto k=", vm.toString(k), "|marginal"), _read(c, 3, sid, false, false));
            emit log_named_uint(string.concat("READ|assess veto k=", vm.toString(k), " (no feedback)|marginal"), _read(c, 3, sid, true, false));
        }
    }
}

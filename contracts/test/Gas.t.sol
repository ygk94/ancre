// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";
import {PureVersionImpl, Erc1967ProxyMock} from "./utils/Mocks.sol";

/// Parametric gas measurements of submitCertificate (GAS.md). Local chain with network = "monad"
/// pricing; the two registries are ERC-1967 proxies in front of a `pure` getVersion() implementation,
/// which reproduces the real mainnet cost of the version check (asserted in test_gas_versionProbe:
/// 29 485 gas per cold getVersion(), same as measured on the mainnet fork in ForkTest). A fork is not
/// used here because forge fetches every untouched storage slot from the RPC (25 rps). Every measured call is a NON-view top-level call,
/// hence an isolated transaction: `billed` = vm.lastCallGas().gasTotalUsed = 21 000 + max(standard
/// calldata + execution, EIP-7623 floor) — cross-checked against our own byte count below.
/// Output lines: GAS|scenario|E|n|k|billed|calldataBytes|zeros|nonZeros|standard|floor|exec|bound
///   exec  = billed - 21 000 - standard            (when not floor-bound)
///   bound = "floor" when billed == 21 000 + floor (execution hidden under the floor)
/// Run: forge test --match-contract GasTest -vv
contract VersionProbe {
    uint256 public c1;
    uint256 public c2;

    function cost(address t) external {
        uint256 g = gasleft();
        IIdentityRegistry8004(t).getVersion();
        c1 = g - gasleft();
        g = gasleft();
        IIdentityRegistry8004(t).getVersion();
        c2 = g - gasleft();
    }

    function last() external view returns (uint256, uint256) {
        return (c1, c2);
    }
}

contract GasTest is AncreBase {
    using CertLib for CertLib.Graph;

    uint256 constant ITERS = 25;
    address idProxy;
    address repProxy;

    function setUp() public {
        PureVersionImpl impl = new PureVersionImpl();
        idProxy = address(new Erc1967ProxyMock(address(impl)));
        repProxy = address(new Erc1967ProxyMock(address(impl)));
        ar = new AnchoredReputation(IIdentityRegistry8004(idProxy), IReputationRegistry8004(repProxy));
    }

    function test_gas_versionProbe() public {
        VersionProbe p = new VersionProbe();
        p.cost(repProxy);
        (uint256 c1,) = p.last();
        emit log_named_uint("getVersion via local ERC-1967 proxy mock, cold", c1);
        assertApproxEqAbs(c1, 29_485, 500, "within 500 gas of the real mainnet proxy (ForkTest: 29 485)");
    }

    // ------------------------------------------------------------------ random graph
    function _rand(uint256 seed, uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i)));
    }

    /// E edges spread evenly over the n nodes (anchors included), distinct random dsts, 85 % positive.
    function _graph(uint256 E, uint256 n, uint256 k, uint256 seed) internal pure returns (CertLib.Graph memory g) {
        g = CertLib.newGraph(n, k, AN, AD, n, E);
        uint256 base = E / n;
        uint256 extra = E % n;
        uint256 ctr;
        for (uint256 u; u < n; ++u) {
            uint256 d = base + (u < extra ? 1 : 0);
            if (d > n - k - 1) d = n - k - 1;
            if (d > 256) d = 256;
            uint256[] memory dst = new uint256[](d);
            int256[] memory w = new int256[](d);
            uint256 got;
            while (got < d) {
                uint256 c = k + (_rand(seed, ctr++) % (n - k)); // targets are agents
                if (c == u) continue;
                bool dup;
                for (uint256 q; q < got; ++q) {
                    if (dst[q] == c) {
                        dup = true;
                        break;
                    }
                }
                if (dup) continue;
                dst[got++] = c;
            }
            for (uint256 i = 1; i < d; ++i) {
                uint256 x = dst[i];
                uint256 j = i;
                while (j > 0 && dst[j - 1] > x) {
                    dst[j] = dst[j - 1];
                    --j;
                }
                dst[j] = x;
            }
            for (uint256 i; i < d; ++i) {
                uint256 rv = _rand(seed ^ 0xabc, ctr++);
                int256 mag = int256(1 + (rv % 10_000));
                w[i] = (rv >> 128) % 100 < 85 ? mag : -mag;
            }
            address wallet = u < k ? address(0) : address(uint160(_rand(seed ^ 0x77, u)));
            g.addRow(u, wallet, dst, w);
            if (u >= k) g.ownerFp[u] = uint64(_rand(seed ^ 0x99, u) & ((1 << 63) - 1));
        }
    }

    uint256 nonce;

    function _setAndNodes(uint256 n, uint256 k, bool addNow) internal returns (bytes32 sid, bytes memory entries) {
        AnchoredReputation.SetParams memory p = _params(_anchors(k), k > 1 ? 2 : 1);
        p.tagSchemaHash = keccak256(abi.encode("gas", nonce++)); // distinct setId per measurement
        sid = ar.registerAnchorSet(p);
        entries = _agentEntries(1, n - k);
        if (addNow && n > k) ar.addNodes(sid, entries);
    }

    // ------------------------------------------------------------------ accounting
    function _log(string memory scen, uint256 E, uint256 n, uint256 k, bytes memory cd) internal returns (uint256 billed) {
        billed = vm.lastCallGas().gasTotalUsed;
        (uint256 z, uint256 nz, uint256 std, uint256 fl) = CertLib.calldataCost(cd);
        string memory boundS;
        uint256 exec;
        if (billed == 21_000 + fl && fl >= std) {
            boundS = "floor";
        } else {
            boundS = "exec";
            exec = billed - 21_000 - std;
            assertGe(billed, 21_000 + fl, "billed below the EIP-7623 floor: accounting mismatch");
        }
        string memory line = string.concat(
            "GAS|", scen, "|", vm.toString(E), "|", vm.toString(n), "|", vm.toString(k), "|", vm.toString(billed), "|"
        );
        line = string.concat(
            line,
            vm.toString(cd.length), "|", vm.toString(z), "|", vm.toString(nz), "|", vm.toString(std), "|",
            vm.toString(fl), "|", vm.toString(exec), "|", boundS
        );
        emit log(line);
    }

    function _submitCd(bytes32 sid, uint256 n, bytes memory nodes, bytes memory v, bytes memory rows)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeCall(AnchoredReputation.submitCertificate, (sid, uint32(n), type(uint256).max, nodes, v, rows));
    }

    function _call(bytes memory cd) internal {
        (bool ok, bytes memory ret) = address(ar).call(cd);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    /// first certificate 0->x, then in-place update x->y, for one (E, n, k)
    function _measure(uint256 E, uint256 n, uint256 k) internal {
        CertLib.Graph memory g = _graph(E, n, k, E * 1_000_003 + n * 101 + k);
        uint256[][] memory t = g.fixedPoint(ITERS);
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        (bytes32 sid, bytes memory entries) = _setAndNodes(n, k, false);

        // nodes appended in their own transaction (27 900 per node: one mapping page each)
        bytes memory cdNodes = abi.encodeCall(AnchoredReputation.addNodes, (sid, entries));
        _call(cdNodes);
        _log("addNodes", E, n, k, cdNodes);

        bytes memory cd = _submitCd(sid, n, "", v, rows);
        _call(cd);
        _log("first(0->x)", E, n, k, cd);

        // update: next iterate of the solver (different values), certificate stale -> replaceable
        uint256[][] memory t2 = g.applyF(t);
        bytes memory cd2 = _submitCd(sid, n, "", CertLib.encodeVectors(g, t2), rows);
        vm.roll(block.number + 2000);
        _call(cd2);
        _log("update(x->y)", E, n, k, cd2);
    }

    function test_gas_E10() public {
        _measure(10, 5, 1);
        _measure(10, 5, 3);
    }

    function test_gas_E50() public {
        _measure(50, 17, 1);
        _measure(50, 17, 3);
        _measure(50, 17, 8);
    }

    function test_gas_E100() public {
        _measure(100, 34, 1);
        _measure(100, 34, 3);
        _measure(100, 34, 8);
    }

    function test_gas_E300() public {
        _measure(300, 100, 1);
        _measure(300, 100, 3);
        _measure(300, 100, 8);
    }

    function test_gas_E1000() public {
        _measure(1000, 334, 1);
        _measure(1000, 334, 3);
        _measure(1000, 334, 8);
    }

    /// towards the 30 M per-transaction limit (out-degree 3); one config per test function because
    /// forge enforces Monad's 8 MB per-transaction memory cap on the test frame too.
    function test_gas_E3000_k1() public {
        _measure(3000, 1000, 1);
    }

    function test_gas_E3000_k3() public {
        _measure(3000, 1000, 3);
    }

    function test_gas_E3000_k8() public {
        _measure(3000, 1000, 8);
    }

    function test_gas_E10000_k1() public {
        _measure(10_000, 3334, 1);
    }

    function test_gas_E10000_k3() public {
        _measure(10_000, 3334, 3);
    }

    /// R4 estimate (solver/FORMAT.md): ~7.6 M gas for a ~2 000-node support
    function test_gas_R4_2000nodes_k3() public {
        _measure(6000, 2000, 3);
    }

    function test_gas_R4_2000nodes_k2() public {
        _measure(4000, 2000, 2);
    }

    /// density profiles at E = 1000: out-degree 1 (n = 1000) and 10 (n = 100)
    function test_gas_E1000_density() public {
        _measure(1000, 1000, 3);
        _measure(1000, 100, 3);
    }

    /// all-in-one first certificate (nodes appended in the same tx) vs reserveCapacity split
    function test_gas_firstCertVariants() public {
        uint256 E = 300;
        uint256 n = 100;
        uint256 k = 3;
        CertLib.Graph memory g = _graph(E, n, k, 42);
        uint256[][] memory t = g.fixedPoint(ITERS);
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);

        (bytes32 sid, bytes memory entries) = _setAndNodes(n, k, false);
        bytes memory cd = _submitCd(sid, n, entries, v, rows);
        _call(cd);
        _log("first+nodes(all-in-one)", E, n, k, cd);

        (bytes32 sid2,) = _setAndNodes(n, k, true);
        bytes memory cdr = abi.encodeCall(AnchoredReputation.reserveCapacity, (sid2, uint32(n)));
        _call(cdr);
        _log("reserveCapacity", E, n, k, cdr);
        bytes memory cd2 = _submitCd(sid2, n, "", v, rows);
        _call(cd2);
        _log("first-after-reserve", E, n, k, cd2);
    }

    /// same graph, same vector values: update that changes nothing (lower bound of an update)
    function test_gas_updateIdentical() public {
        CertLib.Graph memory g = _graph(300, 100, 3, 7);
        uint256[][] memory t = g.fixedPoint(ITERS);
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        (bytes32 sid,) = _setAndNodes(100, 3, true);
        _call(_submitCd(sid, 100, "", v, rows));
        bytes memory cd = _submitCd(sid, 100, "", v, rows);
        _call(cd);
        _log("update(identical)", 300, 100, 3, cd);
    }
}

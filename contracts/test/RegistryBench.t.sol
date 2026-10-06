// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";

interface IIdentityFull {
    function register(string calldata uri) external returns (uint256);
}

interface IReputationFull {
    function giveFeedback(uint256, int128, uint8, string calldata, string calldata, string calldata, string calldata, bytes32)
        external;
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;
}

/// P1 gate (chantier 02, E2): cost of the Registry-verified level on the REAL ERC-8004 v2.0.0 registries
/// (Monad testnet 10143, same bytecode as mainnet), with a demo-size graph whose feedbacks are written
/// in the fork. Every measured call is a non-view top-level call, hence an isolated transaction
/// (network = "monad": 21 000 + calldata + EIP-7623 floor included, MIP-8 page pricing).
/// Run: forge test --match-contract RegistryBenchTest -vv
contract RegistryBenchTest is AncreBase {
    using CertLib for CertLib.Graph;

    address constant ID_T = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REP_T = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    uint256 constant FORK_BLOCK = 66_494_673;
    uint256 constant ITERS = 80;

    uint256[] ids; // agentId of node k + i
    address[] owners; // owner = agentWallet of node k + i

    function setUp() public {
        vm.createSelectFork("monad_testnet", FORK_BLOCK);
        ar = new AnchoredReputation(IIdentityRegistry8004(ID_T), IReputationRegistry8004(REP_T));
    }

    function _rand(uint256 seed, uint256 i) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i)));
    }

    function _mintAgents(uint256 count) internal {
        for (uint256 i; i < count; ++i) {
            address o = address(uint160(0xA11CE0000 + i));
            vm.prank(o);
            ids.push(IIdentityFull(ID_T).register("ipfs://ancre-bench"));
            owners.push(o);
        }
    }

    function _clientOf(uint256 u, uint256 k) internal view returns (address) {
        return u < k ? _anchors(k)[u] : owners[u - k];
    }

    /// E edges over n nodes (k anchors + n-k agents), out-degree ~E/n, targets = agents only (feedback is
    /// given to agents), 85 % "vouch" (+1..+100), 15 % "slash" (-1..-100). Every feedback is written in the
    /// registry, `extra` older feedbacks of the same tag are written before it for every edge.
    uint256 gSeed;
    uint256 gCtr;

    function _graph(uint256 E, uint256 n, uint256 k, uint256 seed, uint256 extra)
        internal
        returns (CertLib.Graph memory g)
    {
        g = CertLib.newGraph(n, k, AN, AD, n, E);
        (gSeed, gCtr) = (seed, 0);
        for (uint256 u; u < n; ++u) {
            uint256[] memory dst = _pick(u, E / n + (u < E % n ? 1 : 0), k, n);
            int256[] memory w = new int256[](dst.length);
            address client = _clientOf(u, k);
            for (uint256 i; i < dst.length; ++i) {
                w[i] = _give(client, ids[dst[i] - k], _rand(seed ^ 0xabc, gCtr++), extra);
            }
            g.addRow(u, u < k ? address(0) : client, dst, w);
            if (u >= k) g.ownerFp[u] = uint64(uint160(owners[u - k]) & ((1 << 63) - 1));
            for (uint256 i; i < dst.length; ++i) {
                g.eIdx[g.numEdges - dst.length + i] = extra + 1;
            }
        }
    }

    /// d distinct agent targets != u, sorted
    function _pick(uint256 u, uint256 d, uint256 k, uint256 n) internal returns (uint256[] memory dst) {
        dst = new uint256[](d);
        uint256 got;
        while (got < d) {
            uint256 c = k + (_rand(gSeed, gCtr++) % (n - k));
            if (c == u) continue;
            bool dup;
            for (uint256 q; q < got; ++q) {
                if (dst[q] == c) dup = true;
            }
            if (!dup) dst[got++] = c;
        }
        for (uint256 i = 1; i < d; ++i) {
            (uint256 x, uint256 j) = (dst[i], i);
            while (j > 0 && dst[j - 1] > x) {
                dst[j] = dst[j - 1];
                --j;
            }
            dst[j] = x;
        }
    }

    /// writes extra + 1 feedbacks of the same tag; returns the grid weight of the last one
    function _give(address client, uint256 j, uint256 rv, uint256 extra) internal returns (int256 w) {
        bool neg = (rv >> 128) % 100 >= 85;
        int128 v = int128(int256(1 + rv % 100));
        if (neg) v = -v;
        string memory tag = neg ? "slash" : "vouch";
        for (uint256 x; x <= extra; ++x) {
            vm.prank(client);
            IReputationFull(REP_T).giveFeedback(j, v, 0, tag, "", "", "", bytes32(0));
        }
        w = int256(v) * 100; // grid: |v| * 10 000 / 100
    }

    function _entries(uint256 k, uint256 n) internal view returns (bytes memory b) {
        for (uint256 i = k; i < n; ++i) {
            b = abi.encodePacked(b, uint8(1), uint32(ids[i - k]));
        }
    }

    uint256 nonce;

    function _set(uint256 k, bool verified, bool open) internal returns (bytes32 sid) {
        AnchoredReputation.SetParams memory p = _params(_anchors(k), k > 1 ? 2 : 1);
        p.tagSchemaHash = keccak256(abi.encode("bench", nonce++));
        p.policy.registryVerified = verified;
        if (open) p.policy.submitters = new address[](0);
        sid = ar.registerAnchorSet(p);
    }

    function _call(bytes memory cd) internal returns (uint256 billed) {
        _direct();
        (bool ok, bytes memory ret) = address(ar).call(cd);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        billed = vm.lastCallGas().gasTotalUsed;
    }

    /// same graph, same certificate, three sets: Submitter-attested, Registry-verified (attested list kept,
    /// to isolate the cost of the checks), Registry-verified open
    function _bench(uint256 E, uint256 n, uint256 k, uint256 extra) internal {
        _mintAgents(n - k);
        CertLib.Graph memory g = _graph(E, n, k, E * 7919 + n + extra, extra);
        uint256[][] memory t = g.fixedPoint(ITERS);
        require(CertLib.isSubSolution(g, t), "bench vector must be a sub-solution");
        bytes memory v = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        bytes memory entries = _entries(k, n);
        string memory tag = string.concat("|E=", vm.toString(E), "|n=", vm.toString(n), "|k=", vm.toString(k), "|extra=", vm.toString(extra));

        bytes32[3] memory sids = [_set(k, false, false), _set(k, true, false), _set(k, true, true)];
        string[3] memory names = ["attested", "verified", "verified-open"];
        Consumer c = new Consumer();
        for (uint256 q; q < 3; ++q) {
            bytes32 sid = sids[q];
            _call(abi.encodeCall(AnchoredReputation.addNodes, (sid, entries)));
            ar.reserveCapacity(sid, uint32(n));
            bytes memory cd = abi.encodeCall(AnchoredReputation.submitCertificate, (sid, uint32(n), type(uint256).max, "", v, rows));
            uint256 first = _call(cd);
            vm.roll(block.number + 2000);
            uint256 upd = _call(cd); // same certificate again, fresh transaction: every registry page is cold again
            emit log(string.concat("P1|", names[q], tag, "|first(after reserve)=", vm.toString(first), "|update=", vm.toString(upd)));
            if (q == 1) _reads(c, sid, tag);
        }
    }

    /// reads through a non-view consumer (AM-R5.1), right after the certificate (status OK, strict transfer)
    function _reads(Consumer c, bytes32 sid, string memory tag) internal {
        uint256 agent = ids[0];
        AnchoredReputation.Assessment memory xa = ar.assess(agent, sid, true);
        require(xa.status == AnchoredReputation.Status.OK && xa.trust > 0, "bench agent must be certified with mass");
        c.baseline(ar, agent, sid, true);
        uint256 base = vm.lastCallGas().gasTotalUsed;
        c.check(ar, agent, sid, true);
        emit log(string.concat("P1|READ|assess veto+strict, agent with mass", tag, "|marginal=", vm.toString(vm.lastCallGas().gasTotalUsed - base)));
        c.check(ar, agent, sid, false);
        emit log(string.concat("P1|READ|assess no veto, strict", tag, "|marginal=", vm.toString(vm.lastCallGas().gasTotalUsed - base)));
        c.trusted(ar, agent, sid, true);
        emit log(string.concat("P1|READ|passesAnchorPolicy, agent with mass", tag, "|marginal=", vm.toString(vm.lastCallGas().gasTotalUsed - base)));
        c.trusted(ar, 999_999, sid, true);
        emit log(string.concat("P1|READ|passesAnchorPolicy, unknown agent (cheap refusal)", tag, "|marginal=", vm.toString(vm.lastCallGas().gasTotalUsed - base)));
    }

    function test_bench_small() public {
        _bench(30, 10, 3, 0);
    }

    function test_bench_demo() public {
        _bench(300, 100, 3, 0);
    }

    function test_bench_multiFeedback() public {
        _bench(30, 10, 3, 4); // every pair has 5 feedbacks of the same tag: the scan reads all 5
    }
}

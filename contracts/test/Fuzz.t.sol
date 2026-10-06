// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// D37 fuzz: (1) the contract accepts a certificate iff t <= y (CertLib, same arithmetic), and then stores
/// exactly the reference eUp; (2) assess / passesAnchorPolicy never revert, whatever the agent, the block or the
/// state of the registries. Run: forge test --match-contract FuzzTest --fuzz-runs 2000
contract FuzzTest is AncreBase {
    using CertLib for CertLib.Graph;

    bytes32 setId;

    function setUp() public {
        _deployMocks();
        vm.roll(1000);
        for (uint256 i = 1; i <= 8; ++i) {
            idr.mint(i, address(uint160(0xB000 + i)));
        }
        setId = ar.registerAnchorSet(_params(_anchors(2), 1));
        ar.addNodes(setId, _agentEntries(1, 8)); // nodes 2..9 = agents 1..8
    }

    /// random graph on 10 nodes (2 anchors + 8 agents), targets = agents, some rows missing
    function _graph(uint256 seed) internal pure returns (CertLib.Graph memory g) {
        g = CertLib.newGraph(10, 2, AN, AD, 10, 40);
        for (uint256 u; u < 10; ++u) {
            uint256 r = uint256(keccak256(abi.encode(seed, u)));
            if (u >= 2 && r % 5 == 0) continue; // truncated
            uint256 deg = (r >> 8) % 4;
            uint256[] memory d = new uint256[](deg);
            int256[] memory w = new int256[](deg);
            uint256 got;
            for (uint256 v = 2; v < 10 && got < deg; ++v) {
                if (v == u || (r >> (16 + v)) & 1 == 0) continue;
                d[got] = v;
                uint256 x = uint256(keccak256(abi.encode(seed, u, v)));
                int256 mag = int256(1 + x % 10_000);
                w[got] = x % 7 == 0 ? -mag : mag;
                ++got;
            }
            assembly {
                mstore(d, got)
                mstore(w, got)
            }
            g.addRow(u, u < 2 ? address(0) : address(uint160(0xB000 + u - 1)), d, w);
        }
        for (uint256 i = 2; i < 10; ++i) {
            g.ownerFp[i] = uint64(uint160(0xB000 + i - 1));
        }
    }

    function testFuzz_acceptIffSubSolution(uint256 seed, uint8 iters, uint256 bump) public {
        CertLib.Graph memory g = _graph(seed);
        uint256[][] memory t = g.fixedPoint(1 + iters % 60);
        // perturb one coordinate up or down by a few wei to a few units
        uint256 a = bump % 2;
        uint256 v = (bump >> 8) % 10;
        uint256 delta = (bump >> 16) % 1e6;
        if ((bump >> 40) & 1 == 1) t[a][v] += delta;
        else t[a][v] = t[a][v] > delta ? t[a][v] - delta : 0;
        bool sub = CertLib.isSubSolution(g, t);
        bytes memory vec = CertLib.encodeVectors(g, t);
        bytes memory rows = CertLib.encodeRows(g, 2);
        if (!sub) {
            vm.expectRevert(); // NotSubSolution(a, i) for the first violating node
            _direct();
            ar.submitCertificate(setId, 10, type(uint256).max, "", vec, rows);
            return;
        }
        _direct();
        ar.submitCertificate(setId, 10, type(uint256).max, "", vec, rows);
        uint256[] memory e = CertLib.eUp(g, t);
        for (uint256 c; c < 2; ++c) {
            (uint256 up,) = ar.columnBounds(setId, c);
            assertEq(up, e[c]);
        }
    }

    function testFuzz_assessNeverReverts(uint256 seed, uint256 agentId, uint32 dt, uint8 mode) public {
        CertLib.Graph memory g = _graph(seed);
        _submit(setId, g, g.fixedPoint(40), type(uint256).max);
        vm.roll(block.number + dt % 3000);
        if (mode % 4 == 1) vm.etch(address(rep), hex"fe");
        if (mode % 4 == 2) vm.etch(address(idr), hex"fe");
        if (mode % 4 == 3) idr.transfer(1 + agentId % 8, address(0xDEAD));
        uint256 id = mode & 4 == 0 ? 1 + agentId % 8 : agentId;
        ar.assess(id, setId, true);
        ar.assess(id, setId, false);
        ar.passesAnchorPolicy(id, setId);
        ar.assess(id, bytes32(seed), true); // unknown set
    }
}

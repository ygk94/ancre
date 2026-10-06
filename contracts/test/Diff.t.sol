// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// D37 differential test: 48 vectors produced by test/diff/gen.py (pure Python, exact Fractions),
/// replayed on the contract. For each: the contract accepts the certificate and its eUp (per column) and
/// distrust d (per node) equal the Python values; L2: t <= floor(t*) coordinate by coordinate for the
/// EXACT fixed point t* of the committed graph; L5: ceil(sum (t* - t)) <= eUp.
/// Regenerate: python3 test/diff/gen.py ; run: forge test --match-contract DiffTest -vv
contract DiffTest is AncreBase {
    using CertLib for CertLib.Graph;
    using stdJson for string;

    function setUp() public {
        _deployMocks();
        vm.roll(1000);
    }

    function _u(string memory j, string memory key) internal pure returns (uint256[] memory) {
        return j.readUintArray(key);
    }

    function _s(string memory j, string memory key) internal pure returns (uint256[] memory out) {
        string[] memory a = j.readStringArray(key);
        out = new uint256[](a.length);
        for (uint256 i; i < a.length; ++i) {
            out[i] = vm.parseUint(a[i]);
        }
    }

    function _case(uint256 idx) internal {
        string memory path = string.concat("test/diff/vectors/case_", idx < 10 ? "0" : "", vm.toString(idx), ".json");
        string memory j = vm.readFile(path);
        uint256 n = j.readUint(".n");
        uint256 k = j.readUint(".k");
        uint256 aN = j.readUint(".aN");
        uint256 aD = j.readUint(".aD");
        uint256[] memory rowU = _u(j, ".rowU");
        uint256[] memory rowLen = _u(j, ".rowLen");
        uint256[] memory rowB = _u(j, ".rowBDecl");
        uint256[] memory rowAl = _u(j, ".rowAlias");
        uint256[] memory eDst = _u(j, ".eDst");
        int256[] memory eW = j.readIntArray(".eW");

        CertLib.Graph memory g = CertLib.newGraph(n, k, aN, aD, rowU.length, eDst.length);
        uint256 e;
        for (uint256 r; r < rowU.length; ++r) {
            address wallet = rowU[r] < k ? address(0) : address(uint160(0xA000)); // one shared wallet: aliases allowed
            if (rowAl[r] != 0) {
                g.addAlias(rowU[r], wallet, rowAl[r] - 1);
                continue;
            }
            uint256[] memory d = new uint256[](rowLen[r]);
            int256[] memory w = new int256[](rowLen[r]);
            for (uint256 q; q < rowLen[r]; ++q) {
                d[q] = eDst[e];
                w[q] = eW[e++];
            }
            g.addRowDecl(rowU[r], wallet, d, w, rowB[r]);
        }
        uint256[] memory flat = _s(j, ".t");
        uint256[][] memory t = new uint256[][](k);
        for (uint256 a; a < k; ++a) {
            t[a] = new uint256[](n);
            for (uint256 v; v < n; ++v) {
                t[a][v] = flat[a * n + v];
            }
        }

        // set with the vector's alpha and k (lambdas split like CertLib and the generator)
        AnchoredReputation.SetParams memory p = _params(_anchors(k), 1);
        p.alphaN = uint32(aN);
        p.alphaD = uint32(aD);
        p.lambdas = new uint64[](k);
        for (uint256 a; a < k; ++a) {
            p.lambdas[a] = uint64(g.lam[a]);
        }
        p.tagSchemaHash = keccak256(abi.encode("diff", idx));
        bytes32 setId = ar.registerAnchorSet(p);
        if (n > k) ar.addNodes(setId, _agentEntries(1, n - k));
        _submit(setId, g, t, type(uint256).max);

        uint256[] memory eUp = _s(j, ".eUp");
        uint256[] memory gap = _s(j, ".gapCeil");
        uint256[] memory star = _s(j, ".tStarFloor");
        uint256[] memory dd = _s(j, ".d");
        for (uint256 a; a < k; ++a) {
            (uint256 cUp,) = ar.columnBounds(setId, a);
            assertEq(cUp, eUp[a], string.concat("eUp differs, case ", vm.toString(idx)));
            assertLe(gap[a], cUp, string.concat("L5 violated, case ", vm.toString(idx)));
            for (uint256 v; v < n; ++v) {
                assertLe(ar.vectorAt(setId, v, a), star[a * n + v], "L2 violated: t > t*");
            }
        }
        for (uint256 v; v < n; ++v) {
            uint256 dv = dd[v] > (1 << 63) - 1 ? (1 << 63) - 1 : dd[v];
            assertEq(ar.vectorAt(setId, v, k), dv, string.concat("d differs, case ", vm.toString(idx)));
        }
    }

    function test_diff_vectors() public {
        for (uint256 i; i < 48; ++i) {
            _case(i);
        }
    }
}

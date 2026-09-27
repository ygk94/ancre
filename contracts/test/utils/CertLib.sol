// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

/// Test-side reference implementation of the ANCRE encoding and integer arithmetic (ENCODING.md).
/// It plays the role of the off-chain solver in unit and gas tests.
library CertLib {
    uint256 internal constant WAD = 1e18;
    int256 internal constant GRID = 10_000;

    struct Graph {
        uint256 n;
        uint256 k;
        uint256 aN;
        uint256 aD;
        uint256[] lam;
        uint256 numRows;
        uint256 numEdges;
        uint256[] rowU;
        address[] rowWallet; // address(0) = no wallet field
        uint256[] rowStart; // numRows + 1 entries
        uint256[] eDst;
        int256[] eW;
        uint256[] eIdx;
        uint64[] ownerFp;
    }

    function newGraph(uint256 n, uint256 k, uint256 aN, uint256 aD, uint256 maxRows, uint256 maxEdges)
        internal
        pure
        returns (Graph memory g)
    {
        g.n = n;
        g.k = k;
        g.aN = aN;
        g.aD = aD;
        g.lam = new uint256[](k);
        uint256 acc;
        for (uint256 a; a < k; ++a) {
            g.lam[a] = a + 1 == k ? WAD - acc : WAD / k;
            acc += g.lam[a];
        }
        g.rowU = new uint256[](maxRows);
        g.rowWallet = new address[](maxRows);
        g.rowStart = new uint256[](maxRows + 1);
        g.eDst = new uint256[](maxEdges);
        g.eW = new int256[](maxEdges);
        g.eIdx = new uint256[](maxEdges);
        g.ownerFp = new uint64[](n);
    }

    /// rows must be added in increasing u; dsts strictly increasing
    function addRow(Graph memory g, uint256 u, address wallet, uint256[] memory dsts, int256[] memory ws)
        internal
        pure
    {
        uint256 r = g.numRows++;
        g.rowU[r] = u;
        g.rowWallet[r] = wallet;
        g.rowStart[r] = g.numEdges;
        for (uint256 i; i < dsts.length; ++i) {
            g.eDst[g.numEdges] = dsts[i];
            g.eW[g.numEdges] = ws[i];
            g.eIdx[g.numEdges] = 1;
            g.numEdges++;
        }
        g.rowStart[r + 1] = g.numEdges;
    }

    // ------------------------------------------------------------------ arithmetic (mirror of the contract)
    function applyF(Graph memory g, uint256[][] memory t) internal pure returns (uint256[][] memory y) {
        y = new uint256[][](g.k);
        for (uint256 a; a < g.k; ++a) {
            y[a] = new uint256[](g.n);
        }
        applyFInto(g, t, y);
    }

    /// y := F(t), y preallocated (overwritten)
    function applyFInto(Graph memory g, uint256[][] memory t, uint256[][] memory y) internal pure {
        uint256 om = g.aD - g.aN;
        for (uint256 a; a < g.k; ++a) {
            uint256[] memory ya = y[a];
            for (uint256 j; j < g.n; ++j) {
                ya[j] = 0;
            }
        }
        for (uint256 r; r < g.numRows; ++r) {
            uint256 u = g.rowU[r];
            uint256 sumP;
            uint256 e0 = g.rowStart[r];
            uint256 e1 = g.rowStart[r + 1];
            for (uint256 e = e0; e < e1; ++e) {
                if (g.eW[e] > 0) sumP += uint256(g.eW[e]);
            }
            uint256 denP = g.aD * (sumP > uint256(GRID) ? sumP : uint256(GRID));
            for (uint256 a; a < g.k; ++a) {
                uint256 num = t[a][u] * om;
                if (num == 0) continue;
                uint256[] memory ya = y[a];
                for (uint256 e = e0; e < e1; ++e) {
                    if (g.eW[e] > 0) ya[g.eDst[e]] += (num * uint256(g.eW[e])) / denP;
                }
            }
        }
        uint256 alphaW = (g.aN * WAD) / g.aD;
        for (uint256 a; a < g.k; ++a) {
            y[a][a] += alphaW;
        }
    }

    function fixedPoint(Graph memory g, uint256 iters) internal pure returns (uint256[][] memory t) {
        t = new uint256[][](g.k);
        uint256[][] memory y = new uint256[][](g.k);
        for (uint256 a; a < g.k; ++a) {
            t[a] = new uint256[](g.n);
            y[a] = new uint256[](g.n);
        }
        for (uint256 it; it < iters; ++it) {
            applyFInto(g, t, y);
            (t, y) = (y, t);
        }
    }

    /// r[a] exactly as the contract computes it
    function residual(Graph memory g, uint256[][] memory t) internal pure returns (uint256[] memory r) {
        uint256[][] memory y = applyF(g, t);
        uint256 ePos;
        bool[] memory hasRow = new bool[](g.n);
        for (uint256 rr; rr < g.numRows; ++rr) {
            hasRow[g.rowU[rr]] = true;
        }
        for (uint256 e; e < g.numEdges; ++e) {
            if (g.eW[e] > 0) ePos++;
        }
        uint256 om = g.aD - g.aN;
        r = new uint256[](g.k);
        for (uint256 a; a < g.k; ++a) {
            uint256 s = ePos + 1;
            for (uint256 j; j < g.n; ++j) {
                uint256 tv = t[a][j];
                uint256 yv = y[a][j];
                s += tv > yv ? tv - yv : yv - tv;
                if (tv != 0 && !hasRow[j]) s += (tv * om + g.aD - 1) / g.aD;
            }
            r[a] = s;
        }
    }

    function eEff(Graph memory g, uint256[] memory r) internal pure returns (uint256 e) {
        for (uint256 a; a < g.k; ++a) {
            uint256 ea = (r[a] * g.aD + g.aN - 1) / g.aN;
            e += (g.lam[a] * ea + WAD - 1) / WAD;
        }
    }

    // ------------------------------------------------------------------ encoding
    function encodeVectors(Graph memory g, uint256[][] memory t) internal pure returns (bytes memory v) {
        uint256 rec = (g.k + 1) * 8;
        v = new bytes(g.n * rec);
        for (uint256 i; i < g.n; ++i) {
            for (uint256 a; a < g.k; ++a) {
                _put(v, i * rec + a * 8, t[a][i], 8);
            }
            _put(v, i * rec + g.k * 8, g.ownerFp[i], 8);
        }
    }

    function rowBytes(Graph memory g, uint256 r, uint256 W) internal pure returns (bytes memory b) {
        uint256 nE = g.rowStart[r + 1] - g.rowStart[r];
        bool hw = g.rowWallet[r] != address(0);
        b = new bytes(W + 2 + (hw ? 20 : 0) + nE * (W + 6));
        uint256 o;
        _put(b, o, g.rowU[r], W);
        o += W;
        _put(b, o, nE | (hw ? 0x8000 : 0), 2);
        o += 2;
        if (hw) {
            _put(b, o, uint160(g.rowWallet[r]), 20);
            o += 20;
        }
        for (uint256 e = g.rowStart[r]; e < g.rowStart[r + 1]; ++e) {
            _put(b, o, g.eDst[e], W);
            o += W;
            _put(b, o, uint256(uint16(int16(g.eW[e]))), 2);
            o += 2;
            _put(b, o, g.eIdx[e], 4);
            o += 4;
        }
    }

    function encodeRows(Graph memory g, uint256 W) internal pure returns (bytes memory out) {
        uint256 size = 5;
        for (uint256 r; r < g.numRows; ++r) {
            uint256 nE = g.rowStart[r + 1] - g.rowStart[r];
            size += W + 2 + (g.rowWallet[r] != address(0) ? 20 : 0) + nE * (W + 6);
        }
        out = new bytes(size);
        out[0] = bytes1(uint8(W));
        _put(out, 1, g.numRows, 4);
        uint256 o = 5;
        for (uint256 r; r < g.numRows; ++r) {
            bytes memory rb = rowBytes(g, r, W);
            for (uint256 i; i < rb.length; ++i) {
                out[o + i] = rb[i];
            }
            o += rb.length;
        }
    }

    function leaves(Graph memory g, uint256 W) internal pure returns (bytes32[] memory l) {
        l = new bytes32[](g.numRows);
        for (uint256 r; r < g.numRows; ++r) {
            l[r] = keccak256(rowBytes(g, r, W));
        }
    }

    function merkleProof(bytes32[] memory lv, uint256 pos) internal pure returns (bytes32[] memory proof) {
        bytes32[] memory tmp = new bytes32[](64);
        uint256 np;
        uint256 cnt = lv.length;
        bytes32[] memory level = new bytes32[](cnt);
        for (uint256 i; i < cnt; ++i) {
            level[i] = lv[i];
        }
        while (cnt > 1) {
            if (pos & 1 == 1) tmp[np++] = level[pos - 1];
            else if (pos + 1 < cnt) tmp[np++] = level[pos + 1];
            uint256 half = cnt >> 1;
            for (uint256 i; i < half; ++i) {
                level[i] = keccak256(abi.encode(level[2 * i], level[2 * i + 1]));
            }
            if (cnt & 1 == 1) level[half] = level[cnt - 1];
            cnt = half + (cnt & 1);
            pos >>= 1;
        }
        proof = new bytes32[](np);
        for (uint256 i; i < np; ++i) {
            proof[i] = tmp[i];
        }
    }

    function _put(bytes memory b, uint256 off, uint256 v, uint256 len) private pure {
        for (uint256 i; i < len; ++i) {
            b[off + len - 1 - i] = bytes1(uint8(v >> (8 * i)));
        }
    }

    // ------------------------------------------------------------------ EIP-7623 accounting
    /// standard = 4 z + 16 nz ; floor = 10 (z + 4 nz)   (per EIP-7623, measured active on Monad)
    function calldataCost(bytes memory cd) internal pure returns (uint256 zeros, uint256 nonZeros, uint256 standard, uint256 floor_) {
        for (uint256 i; i < cd.length; ++i) {
            if (cd[i] == 0) zeros++;
            else nonZeros++;
        }
        standard = 4 * zeros + 16 * nonZeros;
        floor_ = 10 * (zeros + 4 * nonZeros);
    }
}

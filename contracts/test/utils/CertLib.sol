// SPDX-License-Identifier: MIT
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
        uint256[] rowBDecl; // declared true positive sum sPlus (0 = none: sPlus = committed S+), D32
        uint256[] rowAlias; // index + 1 of the source row (0 = own edges), D20 alias rows
        bool[] rowViaOwner; // D44: the row's source is ownerOf(u) (VIA_OWNER, 0x1000)
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
        g.rowBDecl = new uint256[](maxRows);
        g.rowAlias = new uint256[](maxRows);
        g.rowViaOwner = new bool[](maxRows);
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

    /// row with a declared true positive sum sPlus (D32): some positive edges of the true row may be omitted
    function addRowDecl(Graph memory g, uint256 u, address wallet, uint256[] memory dsts, int256[] memory ws, uint256 bDecl)
        internal
        pure
    {
        addRow(g, u, wallet, dsts, ws);
        g.rowBDecl[g.numRows - 1] = bDecl;
    }

    /// alias row (D20): node u copies the edges of the row at position srcRow (same wallet)
    function addAlias(Graph memory g, uint256 u, address wallet, uint256 srcRow) internal pure {
        uint256 r = g.numRows++;
        g.rowU[r] = u;
        g.rowWallet[r] = wallet;
        g.rowStart[r] = g.numEdges;
        g.rowStart[r + 1] = g.numEdges;
        g.rowAlias[r] = srcRow + 1;
    }

    /// edge range and budget of row r (alias rows resolve to their source)
    function span(Graph memory g, uint256 r) internal pure returns (uint256 e0, uint256 e1, uint256 bDecl) {
        uint256 src = g.rowAlias[r] == 0 ? r : g.rowAlias[r] - 1;
        return (g.rowStart[src], g.rowStart[src + 1], g.rowBDecl[src]);
    }

    function budget(Graph memory g, uint256 r) internal pure returns (uint256 sumP, uint256 bP) {
        (uint256 e0, uint256 e1, uint256 bDecl) = span(g, r);
        for (uint256 e = e0; e < e1; ++e) {
            if (g.eW[e] > 0) sumP += uint256(g.eW[e]);
        }
        uint256 sp = bDecl != 0 ? bDecl : sumP; // B+ = max(GRID, sPlus)
        bP = sp > uint256(GRID) ? sp : uint256(GRID);
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
            (uint256 e0, uint256 e1,) = span(g, r);
            (, uint256 bP) = budget(g, r);
            uint256 denP = g.aD * bP;
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

    /// true iff t <= F(t) coordinate by coordinate (D26)
    function isSubSolution(Graph memory g, uint256[][] memory t) internal pure returns (bool) {
        uint256[][] memory y = applyF(g, t);
        for (uint256 a; a < g.k; ++a) {
            for (uint256 j; j < g.n; ++j) {
                if (t[a][j] > y[a][j]) return false;
            }
        }
        return true;
    }

    /// r[a] exactly as the contract computes it (t must be a sub-solution):
    /// sum (y - t) + E+ + 1 + truncation margins + declared-budget margins
    function residual(Graph memory g, uint256[][] memory t) internal pure returns (uint256[] memory r) {
        uint256[][] memory y = applyF(g, t);
        uint256 ePos;
        bool[] memory hasRow = new bool[](g.n);
        uint256 om = g.aD - g.aN;
        r = new uint256[](g.k);
        for (uint256 rr; rr < g.numRows; ++rr) {
            hasRow[g.rowU[rr]] = true;
            (uint256 e0, uint256 e1, uint256 bDecl) = span(g, rr);
            for (uint256 e = e0; e < e1; ++e) {
                if (g.eW[e] > 0) ePos++;
            }
            (uint256 sumP, uint256 bP) = budget(g, rr);
            if (bDecl > sumP) {
                for (uint256 a; a < g.k; ++a) {
                    uint256 q = t[a][g.rowU[rr]] * om * (bDecl - sumP);
                    r[a] += (q + g.aD * bP - 1) / (g.aD * bP);
                }
            }
        }
        for (uint256 a; a < g.k; ++a) {
            uint256 s = ePos + 1;
            for (uint256 j; j < g.n; ++j) {
                uint256 tv = t[a][j];
                uint256 yv = y[a][j];
                require(tv <= yv, "not a sub-solution");
                s += yv - tv;
                if (tv != 0 && !hasRow[j]) s += (tv * om + g.aD - 1) / g.aD;
            }
            r[a] += s;
        }
    }

    /// eUp[a] = ceil(r[a] / alpha), as stored by the contract
    function eUp(Graph memory g, uint256[][] memory t) internal pure returns (uint256[] memory e) {
        e = residual(g, t);
        for (uint256 a; a < g.k; ++a) {
            e[a] = (e[a] * g.aD + g.aN - 1) / g.aN;
        }
    }

    function eEff(Graph memory g, uint256[][] memory t) internal pure returns (uint256 agg) {
        uint256[] memory e = eUp(g, t);
        for (uint256 a; a < g.k; ++a) {
            agg += (g.lam[a] * e[a] + WAD - 1) / WAD;
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
        bool hb = g.rowBDecl[r] != 0;
        bool al = g.rowAlias[r] != 0;
        b = new bytes(W + 2 + (hw ? 20 : 0) + (hb ? 4 : 0) + (al ? W : 0) + nE * (W + 6));
        uint256 o;
        _put(b, o, g.rowU[r], W);
        o += W;
        _put(b, o, nE | (hw ? 0x8000 : 0) | (hb ? 0x4000 : 0) | (al ? 0x2000 : 0) | (g.rowViaOwner[r] ? 0x1000 : 0), 2);
        o += 2;
        if (hw) {
            _put(b, o, uint160(g.rowWallet[r]), 20);
            o += 20;
        }
        if (hb) {
            _put(b, o, g.rowBDecl[r], 4);
            o += 4;
        }
        if (al) {
            _put(b, o, g.rowU[g.rowAlias[r] - 1], W);
            o += W;
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
        bytes[] memory rb = new bytes[](g.numRows);
        for (uint256 r; r < g.numRows; ++r) {
            rb[r] = rowBytes(g, r, W);
            size += rb[r].length;
        }
        out = new bytes(size);
        out[0] = bytes1(uint8(W));
        _put(out, 1, g.numRows, 4);
        uint256 o = 5;
        for (uint256 r; r < g.numRows; ++r) {
            bytes memory x = rb[r];
            for (uint256 i; i < x.length; ++i) {
                out[o + i] = x[i];
            }
            o += x.length;
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

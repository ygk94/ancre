// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";
import {PureVersionImpl, Erc1967ProxyMock} from "./utils/Mocks.sol";

contract ARHarness is AnchoredReputation {
    constructor(IIdentityRegistry8004 i, IReputationRegistry8004 r) AnchoredReputation(i, r) {}

    function profile(bytes32 setId, uint32 nCert, bytes calldata vectors, bytes calldata rows)
        external
        returns (uint256 gVersion, uint256 gVerify, uint256 gStore)
    {
        SetState storage s = _set(setId);
        uint256 g = gasleft();
        _versionHash();
        gVersion = g - gasleft();
        g = gasleft();
        Pass memory P = _verifyPass(s, nCert, vectors, rows);
        gVerify = g - gasleft();
        g = gasleft();
        _storeVectors(s, setId, nCert, s.k, vectors, P.d, P.veto);
        gStore = g - gasleft();
    }
}

contract ProfileTest is AncreBase {
    using CertLib for CertLib.Graph;

    function test_profile() public {
        PureVersionImpl impl = new PureVersionImpl();
        address idp = address(new Erc1967ProxyMock(address(impl)));
        address rpp = address(new Erc1967ProxyMock(address(impl)));
        ARHarness h = new ARHarness(IIdentityRegistry8004(idp), IReputationRegistry8004(rpp));
        ar = h;
        uint256[3] memory ks = [uint256(1), 3, 8];
        for (uint256 q; q < 3; ++q) {
            uint256 k = ks[q];
            bytes32 sid = ar.registerAnchorSet(_params(_anchors(k), k > 1 ? 2 : 1));
            ar.addNodes(sid, _agentEntries(1, 334 - k));
            CertLib.Graph memory g = CertLib.newGraph(334, k, AN, AD, 334, 1002);
            for (uint256 u; u < 334; ++u) {
                uint256 d = u < 334 ? 3 : 0;
                uint256[] memory dst = new uint256[](d);
                int256[] memory w = new int256[](d);
                for (uint256 i; i < d; ++i) {
                    dst[i] = (u + 1 + i * 7) % 334;
                    w[i] = 5000;
                }
                // sort
                for (uint256 i = 1; i < d; ++i) {
                    uint256 x = dst[i];
                    uint256 j = i;
                    while (j > 0 && dst[j - 1] > x) {
                        dst[j] = dst[j - 1];
                        --j;
                    }
                    dst[j] = x;
                }
                g.addRow(u, u < k ? address(0) : address(uint160(u + 1)), dst, w);
            }
            uint256[][] memory t = g.fixedPoint(20);
            bytes memory v = CertLib.encodeVectors(g, t);
            bytes memory rows = CertLib.encodeRows(g, 2);
            h.profile(sid, 334, v, rows); // first: 0->x
            (uint256 a, uint256 b, uint256 c) = h.profile(sid, 334, v, rows); // cold again (isolated) but x->y
            h.profile(sid, 334, v, rows);
            emit log_named_uint(string.concat("k=", vm.toString(k), " version"), a);
            emit log_named_uint(string.concat("k=", vm.toString(k), " verifyPass (E=1002, n=334)"), b);
            emit log_named_uint(string.concat("k=", vm.toString(k), " storeVectors x->y"), c);
        }
    }
}

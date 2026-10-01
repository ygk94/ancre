// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {AnchoredReputation} from "../src/AnchoredReputation.sol";
import {IIdentityRegistry8004, IReputationRegistry8004} from "../src/interfaces/IERC8004.sol";
import {MockIdentity, MockReputation} from "./utils/Mocks.sol";
import {CertLib} from "./utils/CertLib.sol";

abstract contract AncreBase is Test {
    using CertLib for CertLib.Graph;

    MockIdentity idr;
    MockReputation rep;
    AnchoredReputation ar;

    uint32 constant AN = 1; // alpha = 1/3 (D2)
    uint32 constant AD = 3;

    function _deployMocks() internal {
        idr = new MockIdentity();
        rep = new MockReputation(idr);
        ar = new AnchoredReputation(IIdentityRegistry8004(address(idr)), IReputationRegistry8004(address(rep)));
    }

    /// reference tag filter: review (+-1), slash (-100..0), vouch (0..100), uptime (measurement)
    function _tags() internal pure returns (AnchoredReputation.TagSpec[] memory t) {
        t = new AnchoredReputation.TagSpec[](4);
        t[0] = AnchoredReputation.TagSpec("review", -1e18, 0, 1e18, 0);
        t[1] = AnchoredReputation.TagSpec("slash", -100e18, 0, 0, 0);
        t[2] = AnchoredReputation.TagSpec("vouch", 0, 0, 100e18, 0);
        t[3] = AnchoredReputation.TagSpec("uptime", 0, 50e18, 100e18, 1);
        // sort by keccak256(tag)
        for (uint256 i; i < t.length; ++i) {
            for (uint256 j = i + 1; j < t.length; ++j) {
                if (keccak256(bytes(t[j].tag)) < keccak256(bytes(t[i].tag))) (t[i], t[j]) = (t[j], t[i]);
            }
        }
    }

    function _params(address[] memory anchors, uint8 minAnchors)
        internal
        view
        returns (AnchoredReputation.SetParams memory p)
    {
        uint256 k = anchors.length;
        uint64[] memory lam = new uint64[](k);
        uint256 acc;
        for (uint256 a; a < k; ++a) {
            lam[a] = uint64(a + 1 == k ? 1e18 - acc : 1e18 / k);
            acc += lam[a];
        }
        p.anchors = anchors;
        p.lambdas = lam;
        p.alphaN = AN;
        p.alphaD = AD;
        p.tagSchemaHash = keccak256("ANCRE reference schema v0 (test)");
        p.tags = _tags();
        p.policy = _policy(minAnchors);
    }

    /// test policy (D39): theta = 0.1, rho = 1/2, q = 1, any negative anchor feedback vetoes, strict transfer,
    /// Submitter-attested by this test contract
    function _policy(uint8 minAnchors) internal view returns (AnchoredReputation.Policy memory q) {
        address[] memory subs = new address[](1);
        subs[0] = address(this);
        q = AnchoredReputation.Policy({
            theta: 1e17,
            rhoN: 1,
            rhoD: 2,
            minAnchors: minAnchors,
            vetoQuorum: 1,
            vetoMax: -1,
            maxAge: 1000,
            minRefresh: 50,
            slackRefresh: 0,
            eLowMax: 1e16,
            strictTransfer: true,
            registryVerified: false,
            submitters: subs
        });
    }

    function _anchors(uint256 k) internal pure returns (address[] memory a) {
        a = new address[](k);
        for (uint256 i; i < k; ++i) {
            a[i] = address(uint160(0x1000 * (i + 1)));
        }
    }

    function _agentEntries(uint256 firstId, uint256 count) internal pure returns (bytes memory b) {
        b = new bytes(5 * count);
        for (uint256 i; i < count; ++i) {
            uint256 id = firstId + i;
            b[5 * i] = bytes1(uint8(1));
            b[5 * i + 1] = bytes1(uint8(id >> 24));
            b[5 * i + 2] = bytes1(uint8(id >> 16));
            b[5 * i + 3] = bytes1(uint8(id >> 8));
            b[5 * i + 4] = bytes1(uint8(id));
        }
    }

    function _one(uint256 x) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = x;
    }

    function _oneW(int256 x) internal pure returns (int256[] memory a) {
        a = new int256[](1);
        a[0] = x;
    }

    function _two(uint256 x, uint256 y) internal pure returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = x;
        a[1] = y;
    }

    function _twoW(int256 x, int256 y) internal pure returns (int256[] memory a) {
        a = new int256[](2);
        a[0] = x;
        a[1] = y;
    }

    function _submit(bytes32 setId, CertLib.Graph memory g, uint256[][] memory t, uint256 eMax) internal {
        ar.submitCertificate(setId, uint32(g.n), eMax, "", CertLib.encodeVectors(g, t), CertLib.encodeRows(g, 2));
    }
}

/// Non-view consumer: forge isolates only non-view calls, so reading through this contract prices a
/// read as a real router transaction would pay it (cold pages, 21 000 + calldata included).
/// Marginal cost of the read = check() - baseline() (same calldata size).
contract Consumer {
    event Seen(uint256 st);

    function check(AnchoredReputation ar, uint256 id, bytes32 setId, bool veto) external returns (uint8 st) {
        st = uint8(ar.assess(id, setId, veto).status);
        emit Seen(st); // same log cost as baseline; no storage write (would bias the difference)
    }

    function trust(AnchoredReputation ar, uint256 id, bytes32 setId, bool) external returns (uint8 st) {
        (AnchoredReputation.Status s,,,,) = ar.trustOf(id, setId);
        st = uint8(s);
        emit Seen(st);
    }

    function trusted(AnchoredReputation ar, uint256 id, bytes32 setId, bool) external returns (uint8 st) {
        st = ar.isTrusted(id, setId) ? 1 : 0;
        emit Seen(st);
    }

    function baseline(AnchoredReputation, uint256, bytes32, bool) external returns (uint8) {
        emit Seen(0);
        return 0;
    }
}

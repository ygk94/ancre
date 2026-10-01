// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "./Base.t.sol";

/// REAL differential test (integration 02 + 04): every vector published by the solver (`solver/vectors/*.json`,
/// unified v1 format of ENCODING.md) is replayed on the contract with ITS committed policy.
///   - the setId recomputed by the contract (computeSetId) equals the solver's (D39, hand-written ABI encoder);
///   - the certificate is accepted, and eEff, graphRoot, vectorRoot, mass and q equal the solver's expectations;
///   - a copy whose t is raised by 1e6 wei on the last massive node is refused (NotSubSolution);
///   - resubmitting the same certificate is accepted (same quality) and leaves quality() unchanged;
///   - the 4 violation vectors (D37): Registry-verified refuses fabrication and inflation at submission
///     (EdgeMismatch) and accepts dilution and the omitted negative (undetectable at submission, provable:
///     solver/simulate.py proves them on the fork); at the Submitter-attested level all 4 are accepted.
/// Toys (no registry) run on the mocks at the Submitter-attested level; mainnet vectors run on a fork of Monad
/// mainnet at the solver's snapshot block, against the real ERC-8004 v2.0.0 registries (Registry-verified).
/// Regenerate the vectors: `cd solver && .venv/bin/python export.py`.
contract SolverVectorsTest is AncreBase {
    address constant ID = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REP = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;
    uint256 constant SNAPSHOT_BLOCK = 108_835_675; // solver/data: 9 283 feedbacks, identity at this block
    string constant DIR = "../solver/vectors/";

    function _load(string memory name) internal view returns (string memory) {
        return vm.readFile(string.concat(DIR, name, ".json"));
    }

    function _u(string memory j, string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(j, key));
    }

    function _params(string memory j) internal view returns (AnchoredReputation.SetParams memory p) {
        p.anchors = vm.parseJsonAddressArray(j, ".set.anchors");
        string[] memory lam = vm.parseJsonStringArray(j, ".set.lambdas");
        p.lambdas = new uint64[](lam.length);
        for (uint256 a; a < lam.length; ++a) {
            p.lambdas[a] = uint64(vm.parseUint(lam[a]));
        }
        p.alphaN = uint32(vm.parseJsonUint(j, ".set.alphaN"));
        p.alphaD = uint32(vm.parseJsonUint(j, ".set.alphaD"));
        p.tagSchemaHash = vm.parseJsonBytes32(j, ".set.tagSchemaHash");
        uint256 nt;
        while (vm.keyExistsJson(j, string.concat(".set.tags[", vm.toString(nt), "]"))) ++nt;
        p.tags = new AnchoredReputation.TagSpec[](nt);
        for (uint256 i; i < nt; ++i) {
            string memory b = string.concat(".set.tags[", vm.toString(i), "]");
            p.tags[i] = AnchoredReputation.TagSpec({
                tag: vm.parseJsonString(j, string.concat(b, ".tag")),
                min: int128(vm.parseInt(vm.parseJsonString(j, string.concat(b, ".min")))),
                neutral: int128(vm.parseInt(vm.parseJsonString(j, string.concat(b, ".neutral")))),
                max: int128(vm.parseInt(vm.parseJsonString(j, string.concat(b, ".max")))),
                kind: uint8(vm.parseJsonUint(j, string.concat(b, ".kind")))
            });
        }
        AnchoredReputation.Policy memory q;
        q.theta = uint64(_u(j, ".set.policy.theta"));
        q.rhoN = uint32(vm.parseJsonUint(j, ".set.policy.rhoN"));
        q.rhoD = uint32(vm.parseJsonUint(j, ".set.policy.rhoD"));
        q.minAnchors = uint8(vm.parseJsonUint(j, ".set.policy.minAnchors"));
        q.vetoQuorum = uint8(vm.parseJsonUint(j, ".set.policy.vetoQuorum"));
        q.vetoMax = int16(vm.parseJsonInt(j, ".set.policy.vetoMax"));
        q.maxAge = uint64(vm.parseJsonUint(j, ".set.policy.maxAge"));
        q.minRefresh = uint64(vm.parseJsonUint(j, ".set.policy.minRefresh"));
        q.slackRefresh = uint64(_u(j, ".set.policy.slackRefresh"));
        q.eLowMax = uint64(_u(j, ".set.policy.eLowMax"));
        q.strictTransfer = vm.parseJsonBool(j, ".set.policy.strictTransfer");
        q.registryVerified = vm.parseJsonBool(j, ".set.policy.registryVerified");
        q.ownerFallback = vm.parseJsonBool(j, ".set.policy.ownerFallback");
        q.submitters = vm.parseJsonAddressArray(j, ".set.policy.submitters");
        p.policy = q;
    }

    struct Outcome {
        bool ok;
        bytes ret;
        bytes32 setId;
        address submitter;
    }

    /// registers the vector's set (checking the setId) and submits its calldata, optionally with mutated vectors
    function _submit(string memory j, AnchoredReputation.SetParams memory p, bool mutate) internal returns (Outcome memory o) {
        o.setId = ar.computeSetId(p);
        if (ar.nodeCount(o.setId) == 0) ar.registerAnchorSet(p);
        o.submitter = p.policy.submitters.length != 0 ? p.policy.submitters[0] : address(0xCAFE);
        bytes memory vec = vm.parseJsonBytes(j, ".calldata.vectors");
        uint256 n = vm.parseJsonUint(j, ".nCert");
        if (mutate) {
            uint256 rec = (p.anchors.length + 1) * 8;
            uint256 v = n;
            for (uint256 i = n; i > 0; --i) {
                if (uint64(bytes8(_slice8(vec, (i - 1) * rec))) != 0) {
                    v = i - 1;
                    break;
                }
            }
            require(v < n, "vector without mass in column 0: nothing to mutate");
            uint256 t = uint64(bytes8(_slice8(vec, v * rec))) + 1e6;
            for (uint256 b; b < 8; ++b) {
                vec[v * rec + b] = bytes1(uint8(t >> (8 * (7 - b))));
            }
        }
        bytes memory nodes = ar.nodeCount(o.setId) > p.anchors.length ? bytes("") : vm.parseJsonBytes(j, ".calldata.newNodes");
        bytes memory cd = abi.encodeCall(
            AnchoredReputation.submitCertificate,
            (o.setId, uint32(n), _u(j, ".expected.eEff"), nodes, vec, vm.parseJsonBytes(j, ".calldata.rows"))
        );
        vm.prank(o.submitter); // the prank applies to the very next call: compute every argument before it
        (o.ok, o.ret) = address(ar).call(cd);
    }

    function _slice8(bytes memory b, uint256 off) internal pure returns (bytes8 r) {
        assembly ("memory-safe") {
            r := mload(add(add(b, 32), off))
        }
    }

    /// full check of one vector: setId, mutated copy refused, vector accepted with every expected value
    function _replay(string memory name) internal {
        string memory j = _load(name);
        AnchoredReputation.SetParams memory p = _params(j);
        assertEq(ar.computeSetId(p), vm.parseJsonBytes32(j, ".set.setId"), string.concat(name, ": setId (D39)"));
        Outcome memory o = _submit(j, p, false);
        assertTrue(o.ok, string.concat(name, ": vector refused"));
        // the mutated copy, now on a registered set: t > y somewhere -> NotSubSolution
        Outcome memory bad2 = _submit(j, p, true);
        assertFalse(bad2.ok);
        assertEq(bytes4(bad2.ret), AnchoredReputation.NotSubSolution.selector, string.concat(name, ": NotSubSolution"));
        (, uint256 eEff,, bytes32 gr, bytes32 vr,,,,) = ar.certificate(o.setId);
        assertEq(eEff, _u(j, ".expected.eEff"), string.concat(name, ": eEff"));
        assertEq(gr, vm.parseJsonBytes32(j, ".expected.graphRoot"), string.concat(name, ": graphRoot"));
        assertEq(vr, vm.parseJsonBytes32(j, ".expected.vectorRoot"), string.concat(name, ": vectorRoot"));
        (uint256 mass, uint256 q, uint256 dm, bool proven) = ar.quality(o.setId);
        assertFalse(proven);
        assertEq(mass, _u(j, ".expected.mass"), string.concat(name, ": mass"));
        assertEq(q, _u(j, ".expected.qEff"), string.concat(name, ": q"));
        assertEq(dm, _u(j, ".expected.distrustMass"), string.concat(name, ": distrust mass"));
        // replacement rule against the solver's own vector: resubmitting the same (unproven) certificate is
        // accepted on every set (same quality), and leaves the quality unchanged
        Outcome memory again = _submit(j, p, false);
        assertTrue(again.ok, string.concat(name, ": same quality must be accepted"));
        (uint256 mass2, uint256 q2, uint256 dm2,) = ar.quality(o.setId);
        assertEq(mass2 + q2 + dm2, mass + q + dm);
        emit log_named_string("DIFF| accepted", name);
    }

    // ------------------------------------------------------------------ toys: mocks, Submitter-attested
    function test_solverToyVectors() public {
        _deployMocks();
        string[5] memory names =
            ["toy_alpha_1_2", "toy_alpha_1_3", "toy_alpha_1_4", "toy_truncated", "toy_alias_owner_rowmax"];
        for (uint256 i; i < names.length; ++i) {
            _replay(names[i]);
        }
    }

    // ------------------------------------------------------------------ mainnet: fork, real registries
    function _fork() internal {
        vm.createSelectFork("monad", SNAPSHOT_BLOCK);
        ar = new AnchoredReputation(IIdentityRegistry8004(ID), IReputationRegistry8004(REP));
    }

    function test_solverMainnetVectors_registryVerified() public {
        _fork();
        string[4] memory names = ["mainnet_honest_d20", "mainnet_slash_anchor", "mainnet_scanner_preD15", "mainnet_em_d44"];
        for (uint256 i; i < names.length; ++i) {
            _replay(names[i]);
        }
    }

    /// D37 at Registry-verified: fabrication and inflation refused at submission; dilution and the omitted
    /// negative accepted (completeness is not checkable on-chain), proven later by the watcher.
    function test_solverViolationVectors_registryVerified() public {
        _fork();
        string[4] memory names = ["fabricated", "inflated", "dilution", "omitted_negative"];
        bool[4] memory refused = [true, true, false, false];
        for (uint256 i; i < 4; ++i) {
            string memory j = _load(string.concat("violations/", names[i]));
            AnchoredReputation.SetParams memory p = _params(j);
            assertEq(ar.computeSetId(p), vm.parseJsonBytes32(j, ".set.setId"));
            Outcome memory o = _submit(j, p, false);
            if (refused[i]) {
                assertFalse(o.ok, string.concat(names[i], ": must be refused at submission"));
                assertEq(bytes4(o.ret), AnchoredReputation.EdgeMismatch.selector, names[i]);
            } else {
                assertTrue(o.ok, string.concat(names[i], ": undetectable at submission, must be accepted"));
                (, uint256 eEff,, bytes32 gr,,,,,) = ar.certificate(o.setId);
                assertEq(eEff, _u(j, ".expected.eEff"));
                assertEq(gr, vm.parseJsonBytes32(j, ".expected.graphRoot"));
            }
        }
    }

    /// D37 at Submitter-attested: all four are accepted from the listed submitter (only proofs correct them, (v)
    /// included: solver/simulate.py, scenario B).
    function test_solverViolationVectors_attested() public {
        _fork();
        string[4] memory names = ["fabricated", "inflated", "dilution", "omitted_negative"];
        for (uint256 i; i < 4; ++i) {
            string memory j = _load(string.concat("violations/", names[i]));
            AnchoredReputation.SetParams memory p = _params(j);
            p.policy.registryVerified = false;
            p.policy.submitters = new address[](1);
            p.policy.submitters[0] = address(this);
            Outcome memory o = _submit(j, p, false);
            assertTrue(o.ok, string.concat(names[i], ": accepted at the attested level"));
        }
    }
}

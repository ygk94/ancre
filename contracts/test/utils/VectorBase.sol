// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Base.t.sol";

/// Shared JSON helpers of the vector tests (SolverVectors.t.sol, CommonVectors.t.sol). The vector directory is
/// `ANCRE_VECTORS` (default `../solver/vectors/`): 02-bis runs the 04-bis vectors from a read-only extract of
/// their branch (`git archive chantier/04bis-solveur solver/vectors`, see docs/chantiers/journal/02bis.md).
abstract contract VectorBase is AncreBase {
    address constant ID = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REP = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    function _dir() internal view returns (string memory) {
        return vm.envOr("ANCRE_VECTORS", string("../solver/vectors/"));
    }

    function _load(string memory name) internal view returns (string memory) {
        return vm.readFile(string.concat(_dir(), name, ".json"));
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

}

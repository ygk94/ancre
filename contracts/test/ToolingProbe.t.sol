// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

/// Evidence for GAS.md §0 (tooling): what `forge test` with `network = "monad"` (Foundry 1.8.3) prices.
/// 1. MIP-8 is reproduced: SSTORE 0->x 27 900 / 17 100, x->y 10 900 / 100, SLOAD 8 100 / 100 (+ ~13-19 probe overhead).
/// 2. isolate = true: every NON-view top-level call is its own tx; lastCallGas().gasTotalUsed includes
///    21 000 + calldata + the EIP-7623 floor.
/// 3. VIEW calls from the test are STATICCALLs inside the test tx: no 21 000, and pages stay warm
///    across them -> view costs must be measured through a non-view consumer (see ConsumerProbe).
contract Slots {
    mapping(uint256 => uint256) m;

    function g1(uint256 slot, uint256 v) external returns (uint256 a, uint256 b) {
        uint256 g0 = gasleft();
        assembly { sstore(slot, v) }
        a = g0 - gasleft();
        g0 = gasleft();
        assembly { sstore(add(slot, 1), v) }
        b = g0 - gasleft();
    }

    function g2(uint256 slot) external returns (uint256 a, uint256 b) {
        uint256 x;
        uint256 y;
        uint256 g0 = gasleft();
        assembly { x := sload(slot) }
        a = g0 - gasleft();
        g0 = gasleft();
        assembly { y := sload(add(slot, 1)) }
        b = g0 - gasleft();
        m[0] = x + y; // keep both loads observable (via-IR would drop them)
    }

    function one(uint256 slot, uint256 v) external {
        assembly { sstore(slot, v) }
    }

    function rd(uint256 a) external view returns (uint256) {
        return m[a];
    }

    function wr(uint256 a, uint256 v) external {
        m[a] = v;
    }

    function noop(bytes calldata) external {}
}

contract ToolingProbeTest is Test {
    Slots s;

    function setUp() public {
        s = new Slots();
    }

    function test_mip8_sstore_new() public {
        (uint256 a, uint256 b) = s.g1(1 << 20, 7);
        emit log_named_uint("SSTORE 0->x, cold page", a);
        emit log_named_uint("SSTORE 0->x, same page", b);
        assertApproxEqAbs(a, 27_900, 20);
        assertApproxEqAbs(b, 17_100, 20);
    }

    function test_mip8_sstore_update() public {
        s.one(1 << 21, 5);
        s.one((1 << 21) + 1, 5);
        (uint256 a, uint256 b) = s.g1(1 << 21, 9);
        emit log_named_uint("SSTORE x->y, cold page (new tx)", a);
        emit log_named_uint("SSTORE x->y, same page", b);
        assertApproxEqAbs(a, 10_900, 20);
        assertApproxEqAbs(b, 100, 20);
    }

    function test_mip8_sload() public {
        s.one(1 << 22, 5);
        (uint256 a, uint256 b) = s.g2(1 << 22);
        emit log_named_uint("SLOAD cold page", a);
        emit log_named_uint("SLOAD same page", b);
        assertApproxEqAbs(a, 8_100, 20);
        assertApproxEqAbs(b, 100, 25);
    }

    function test_isolation_includes_intrinsic_and_floor() public {
        bytes memory b = new bytes(1000);
        for (uint256 i; i < 1000; i++) {
            b[i] = 0x11;
        }
        s.noop(b);
        uint256 billed = vm.lastCallGas().gasTotalUsed;
        bytes memory cd = abi.encodeCall(Slots.noop, (b));
        uint256 z;
        uint256 nz;
        for (uint256 i; i < cd.length; ++i) {
            if (cd[i] == 0) z++;
            else nz++;
        }
        emit log_named_uint("noop(1000 non-zero bytes) billed", billed);
        assertEq(billed, 21_000 + 10 * (z + 4 * nz), "21 000 + EIP-7623 floor");
    }

    function test_view_calls_are_not_isolated() public {
        s.wr(4, 1);
        s.rd(4);
        uint256 first = vm.lastCallGas().gasTotalUsed;
        s.rd(4);
        uint256 second = vm.lastCallGas().gasTotalUsed;
        emit log_named_uint("view read #1 (no 21 000!)", first);
        emit log_named_uint("view read #2 (page still warm)", second);
        assertLt(first, 21_000);
        assertEq(first - second, 8_000, "page load not re-charged: not a fresh tx");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./utils/PayerBase.sol";

interface IIdentityFull {
    function register(string calldata uri) external returns (uint256);
    function ownerOf(uint256) external view returns (address);
    function getAgentWallet(uint256) external view returns (address);
}

interface IRepFull {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}

interface IUSDCFull {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferWithAuthorization(address, address, uint256, uint256, uint256, bytes32, bytes calldata) external;
    function transferWithAuthorization(address, address, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)
        external;
    function permit(address, address, uint256, uint256, bytes calldata) external;
}

struct TokenPermissions {
    address token;
    uint256 amount;
}

struct PermitTransferFrom {
    TokenPermissions permitted;
    uint256 nonce;
    uint256 deadline;
}

struct Witness {
    address to;
    address facilitator;
    uint256 validAfter;
}

interface IUptoProxy {
    function settle(PermitTransferFrom calldata, uint256, address, Witness calldata, bytes calldata) external;
}

/// EIP-7702 delegate that always refuses ERC-1271 (AM-6.9 demonstration).
contract Refuse7702 {
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0xffffffff;
    }
}

/// Fork of Monad testnet (default) or mainnet: NET=monad_testnet|monad.
///   ETH_RPC_TIMEOUT=900 forge test --match-contract TrustGatedPayerForkTest -vv
/// Real ERC-8004 v2.0.0 registries (agents registered and feedback posted INSIDE the fork), the real USDC
/// (FiatToken v2.2), Permit2 and x402UptoPermit2Proxy, the facilitator simulated by vm.prank of its signer,
/// AnchoredReputation v1 deployed in the fork (open, Registry-verified set: every edge re-read at submission).
contract TrustGatedPayerForkTest is PayerBase {
    using CertLib for CertLib.Graph;

    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant UPTO = 0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002;
    address constant FAC = 0x7f6a2850669202519f0FE8aa912451238820Db86; // facilitator signer (both networks)

    IIdentityFull id8004;
    IRepFull rep8004;
    IUSDCFull usdc;
    TrustGatedPayer payer;
    bytes32 setId;
    address[] anchors;
    uint256[2] anchorKeys = [uint256(0xA0A1), uint256(0xA0A2)];
    address op;

    address OG = makeAddr("good-provider");
    address OFARM = makeAddr("farm-target");
    address OF1 = makeAddr("farm-1");
    address OF2 = makeAddr("farm-2");
    address OU = makeAddr("unknown-provider");
    address OWNER = makeAddr("owner");
    address TREASURY = makeAddr("treasury");
    address ATTACKER = makeAddr("attacker");
    uint256 good;
    uint256 farm;
    uint256 f1;
    uint256 f2;
    uint256 unknown;

    function setUp() public {
        string memory net = vm.envOr("NET", string("monad_testnet"));
        vm.createSelectFork(net);
        if (block.chainid == 10143) {
            id8004 = IIdentityFull(0x8004A818BFB912233c491871b3d84c89A494BD9e);
            rep8004 = IRepFull(0x8004B663056A597Dffe9eCcC1965A193B7388713);
            usdc = IUSDCFull(0x534b2f3A21130d7a60830c2Df862319e593943A3);
        } else {
            require(block.chainid == 143, "unexpected chain");
            id8004 = IIdentityFull(0x8004A169FB4a3325136EB29fA0ceB6D2e539a432);
            rep8004 = IRepFull(0x8004BAa17C55a88189AE136b182e5fdA19dE9b63);
            usdc = IUSDCFull(0x754704Bc059F8C67012fEd69BC8A327a5aafb603);
        }
        ar = new AnchoredReputation(IIdentityRegistry8004(address(id8004)), IReputationRegistry8004(address(rep8004)));
        good = _register(OG, "ipfs://ancre-demo/good");
        farm = _register(OFARM, "ipfs://ancre-demo/farm");
        f1 = _register(OF1, "ipfs://ancre-demo/f1");
        f2 = _register(OF2, "ipfs://ancre-demo/f2");
        unknown = _register(OU, "ipfs://ancre-demo/unknown");
        address a0 = vm.addr(anchorKeys[0]);
        address a1 = vm.addr(anchorKeys[1]);
        if (a1 < a0) {
            (a0, a1) = (a1, a0);
            (anchorKeys[0], anchorKeys[1]) = (anchorKeys[1], anchorKeys[0]);
        }
        anchors.push(a0);
        anchors.push(a1);
        setId = _certify();
        op = vm.addr(OP_KEY);
        payer = new TrustGatedPayer(
            IERC20Min(address(usdc)), PERMIT2, UPTO, ar, OWNER, TREASURY, op, setId, 1e6
        );
        deal(address(usdc), address(payer), 10e6);
    }

    function _register(address owner, string memory uri) internal returns (uint256 agentId) {
        vm.prank(owner);
        agentId = id8004.register(uri);
    }

    function _vouch(address from, uint256 agentId) internal {
        vm.prank(from);
        rep8004.giveFeedback(agentId, 100, 0, "vouch", "", "", "", bytes32(0));
    }

    function _certify() internal returns (bytes32 sid) {
        AnchoredReputation.SetParams memory p = _params(anchors, 2);
        p.policy.registryVerified = true;
        p.policy.submitters = new address[](0); // open set: anyone may certify, every edge is re-read (D32)
        p.policy.maxAge = 100_000;
        sid = ar.registerAnchorSet(p);
        // nodes 2 = good, 3 = farm, 4 = f1, 5 = f2 (agent ids are consecutive in this fork)
        ar.addNodes(sid, abi.encodePacked(uint8(1), uint32(good), uint8(1), uint32(farm), uint8(1), uint32(f1), uint8(1), uint32(f2)));
        _vouch(anchors[0], good);
        _vouch(anchors[1], good);
        _vouch(OF1, farm);
        _vouch(OF2, farm);
        CertLib.Graph memory g = CertLib.newGraph(6, 2, AN, AD, 6, 4);
        g.addRow(0, address(0), _one(2), _oneW(10_000));
        g.addRow(1, address(0), _one(2), _oneW(10_000));
        g.addRow(2, OG, new uint256[](0), new int256[](0));
        g.addRow(3, OFARM, new uint256[](0), new int256[](0));
        g.addRow(4, OF1, _one(3), _oneW(10_000));
        g.addRow(5, OF2, _one(3), _oneW(10_000));
        g.ownerFp[2] = ar.ownerFingerprint(OG);
        g.ownerFp[3] = ar.ownerFingerprint(OFARM);
        g.ownerFp[4] = ar.ownerFingerprint(OF1);
        g.ownerFp[5] = ar.ownerFingerprint(OF2);
        vm.prank(makeAddr("any-certifier"));
        ar.submitCertificate(sid, 6, type(uint256).max, "", CertLib.encodeVectors(g, g.fixedPoint(60)), CertLib.encodeRows(g, 2));
    }

    // ------------------------------------------------------------------ helpers
    function _settle(Auth memory a, bytes memory blob) internal returns (uint256 billed) {
        vm.prank(FAC);
        usdc.transferWithAuthorization(address(payer), a.to, a.value, a.validAfter, a.validBefore, a.nonce, blob);
        billed = vm.lastCallGas().gasTotalUsed;
    }

    function _expectRefusedAtSettlement(Auth memory a, bytes memory blob) internal {
        uint256 pb = usdc.balanceOf(address(payer));
        uint256 tb = usdc.balanceOf(a.to);
        vm.prank(FAC);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.transferWithAuthorization(address(payer), a.to, a.value, a.validAfter, a.validBefore, a.nonce, blob);
        assertEq(usdc.balanceOf(address(payer)), pb, "payer balance moved");
        assertEq(usdc.balanceOf(a.to), tb, "payee balance moved");
    }

    function _pay(address to, uint256 agentId, uint256 n) internal view returns (Auth memory a, bytes memory blob) {
        a = _auth(to, 10_000, agentId, n); // 0.01 USDC
        (blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
    }

    function _reason(Auth memory a, bytes memory blob) internal view returns (TrustGatedPayer.Reason r, AnchoredReputation.Assessment memory x) {
        (r,,,,, x) = payer.explain(_twaDigest(address(usdc), address(payer), a), blob);
    }

    // ------------------------------------------------------------------ scenes
    function test_fork_registryFacts() public view {
        assertEq(id8004.getAgentWallet(good), OG, "agentWallet = owner at registration (v2.0.0)");
        assertTrue(ar.passesAnchorPolicy(good, setId), "good trusted");
        assertFalse(ar.passesAnchorPolicy(farm, setId), "farm not trusted");
        assertFalse(ar.passesAnchorPolicy(unknown, setId), "unknown not trusted");
        assertEq(uint8(ar.assess(unknown, setId, true).status), uint8(AnchoredReputation.Status.OK), "AM-6.1: unknown is OK");
    }

    /// Scene 1: the trusted provider is paid by a keyless contract, settled by the facilitator.
    function test_fork_exactPaysTrustedProvider() public {
        (Auth memory a, bytes memory blob) = _pay(OG, good, 1);
        uint256 billed = _settle(a, blob);
        assertEq(usdc.balanceOf(OG), 10_000);
        console.log("GAS|exact guarded settlement, trusted, k=2, payee balance 0 -> x:", billed);
    }

    /// Scene 2: the farm (endorsed by Sybils only) and an unknown agent are refused at settlement.
    function test_fork_farmAndUnknownRefused() public {
        (Auth memory a, bytes memory blob) = _pay(OFARM, farm, 2);
        (TrustGatedPayer.Reason r, AnchoredReputation.Assessment memory x) = _reason(a, blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.UNTRUSTED));
        assertEq(x.trust, 0, "farm mass is zero");
        _expectRefusedAtSettlement(a, blob);
        (a, blob) = _pay(OU, unknown, 3);
        (r,) = _reason(a, blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.UNTRUSTED));
        _expectRefusedAtSettlement(a, blob);
    }

    /// Scene 3 (D19 breaker): paid, then one anchor slashes, the next payment is refused in the next block.
    function test_fork_vetoRefusesNextPayment() public {
        (Auth memory a1, bytes memory b1) = _pay(OG, good, 10);
        _settle(a1, b1);
        vm.roll(block.number + 1);
        vm.prank(anchors[0]);
        rep8004.giveFeedback(good, -100, 0, "slash", "", "", "", bytes32(0));
        vm.roll(block.number + 1);
        (Auth memory a2, bytes memory b2) = _pay(OG, good, 11);
        (TrustGatedPayer.Reason r, AnchoredReputation.Assessment memory x) = _reason(a2, b2);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.ANCRE_STATUS));
        assertEq(uint8(x.status), uint8(AnchoredReputation.Status.VETOED));
        assertEq(x.triggerTag, keccak256("slash"));
        _expectRefusedAtSettlement(a2, b2);
        assertEq(usdc.balanceOf(OG), 10_000, "only the payment before the veto");
    }

    /// Scene 4: the veto lands between /verify (simulation passes) and /settle (same authorisation fails).
    function test_fork_breakerBetweenVerifyAndSettle() public {
        (Auth memory a, bytes memory blob) = _pay(OG, good, 20);
        uint256 snap = vm.snapshotState();
        _settle(a, blob);
        assertEq(usdc.balanceOf(OG), 10_000, "/verify simulation succeeds");
        vm.revertToState(snap);
        vm.prank(anchors[1]);
        rep8004.giveFeedback(good, -1, 0, "review", "", "", "", bytes32(0));
        _expectRefusedAtSettlement(a, blob);
    }

    function test_fork_walletMismatchRefused() public {
        Auth memory a = _auth(ATTACKER, 10_000, good, 30);
        (bytes memory blob,) = _exact(address(usdc), address(payer), OP_KEY, a);
        (TrustGatedPayer.Reason r,) = _reason(a, blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.WALLET_MISMATCH));
        _expectRefusedAtSettlement(a, blob);
    }

    /// upto (Permit2 + x402UptoPermit2Proxy): settled at the real amount under the cap; refused after a veto.
    function test_fork_uptoPermit2() public {
        vm.prank(OWNER);
        payer.approvePermit2(type(uint256).max);
        Upto memory u = Upto(OG, 5000, 42, block.timestamp + 300, FAC, 0, good);
        bytes memory blob = _upto(address(payer), OP_KEY, u);
        bytes32 d = _uptoDigest(address(usdc), PERMIT2, UPTO, u);
        assertEq(payer.isValidSignature(d, blob), bytes4(0x1626ba7e));
        PermitTransferFrom memory p = PermitTransferFrom(TokenPermissions(address(usdc), u.cap), u.nonce, u.deadline);
        vm.prank(FAC);
        IUptoProxy(UPTO).settle(p, 1234, address(payer), Witness(OG, FAC, 0), blob);
        console.log("GAS|upto guarded settlement, trusted, k=2:", vm.lastCallGas().gasTotalUsed);
        assertEq(usdc.balanceOf(OG), 1234);

        vm.prank(anchors[0]);
        rep8004.giveFeedback(good, -100, 0, "slash", "", "", "", bytes32(0));
        u.nonce = 43;
        blob = _upto(address(payer), OP_KEY, u);
        p.nonce = 43;
        vm.prank(FAC);
        vm.expectRevert(bytes4(keccak256("InvalidContractSignature()"))); // Permit2 SignatureVerification, 1271 path
        IUptoProxy(UPTO).settle(p, 1234, address(payer), Witness(OG, FAC, 0), blob);
        assertEq(usdc.balanceOf(OG), 1234, "no second transfer");
        (TrustGatedPayer.Reason r,,,,,) = payer.explain(_uptoDigest(address(usdc), PERMIT2, UPTO, u), blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.ANCRE_STATUS));
    }

    function test_fork_uptoCapOverLimitRefused() public {
        vm.prank(OWNER);
        payer.approvePermit2(type(uint256).max);
        Upto memory u = Upto(OG, 2e6, 44, block.timestamp + 300, FAC, 0, good); // cap > maxPerPayment, amount small
        bytes memory blob = _upto(address(payer), OP_KEY, u);
        (TrustGatedPayer.Reason r,,,,,) = payer.explain(_uptoDigest(address(usdc), PERMIT2, UPTO, u), blob);
        assertEq(uint8(r), uint8(TrustGatedPayer.Reason.OVER_LIMIT), "the cap is what is committed");
        PermitTransferFrom memory p = PermitTransferFrom(TokenPermissions(address(usdc), u.cap), u.nonce, u.deadline);
        vm.prank(FAC);
        vm.expectRevert(bytes4(keccak256("InvalidContractSignature()")));
        IUptoProxy(UPTO).settle(p, 10, address(payer), Witness(OG, FAC, 0), blob);
        assertEq(usdc.balanceOf(OG), 0);
    }

    /// EIP-2612 permit(bytes) of the real USDC goes through ERC-1271 too: a payment blob grants nothing.
    function test_fork_permitWithPaymentBlobReverts() public {
        (, bytes memory blob) = _pay(OG, good, 50);
        vm.expectRevert(bytes("EIP2612: invalid signature"));
        usdc.permit(address(payer), ATTACKER, type(uint256).max, block.timestamp + 60, blob);
        assertEq(usdc.allowance(address(payer), ATTACKER), 0);
    }

    /// AM-6.9 (vague 2, promoted): the (v,r,s) variant also goes through ERC-1271 for a 7702-delegated EOA,
    /// so 7702 is not the bypass; the bypass is a plain transfer by a key holding USDC. Hence: only the
    /// keyless payer holds the funds.
    function test_fork_7702IsNotTheBypassTransferIs() public {
        uint256 aliceKey = 0xA1;
        address alice = vm.addr(aliceKey);
        deal(address(usdc), alice, 5e6);
        Refuse7702 d = new Refuse7702();
        vm.signAndAttachDelegation(address(d), aliceKey);
        assertGt(alice.code.length, 0);
        Auth memory a = _auth(OFARM, 1000, farm, 9);
        bytes32 digest = _twaDigest(address(usdc), alice, a);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);
        vm.prank(FAC);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        usdc.transferWithAuthorization(alice, OFARM, 1000, 0, a.validBefore, a.nonce, v, r, s);
        vm.prank(alice);
        usdc.transfer(OFARM, 1000);
        assertEq(usdc.balanceOf(OFARM), 1000, "a key holder pays around any 1271 guard");
    }

    // ------------------------------------------------------------------ gas (MESURÉ-FORK, isolated txs)
    /// Billed gas of the facilitator's settlement transaction (21 000 + calldata + execution, Monad pricing).
    function test_fork_gas_settlements() public {
        // EOA baseline: (v,r,s) variant, payee already credited
        uint256 k = 0xBEEF;
        address eoa = vm.addr(k);
        deal(address(usdc), eoa, 5e6);
        deal(address(usdc), OG, 1);
        Auth memory e = _auth(OG, 1000, 0, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(k, _twaDigest(address(usdc), eoa, e));
        vm.prank(FAC);
        usdc.transferWithAuthorization(eoa, OG, 1000, 0, e.validBefore, e.nonce, v, r, s);
        console.log("GAS|EOA (v,r,s), payee credited:", vm.lastCallGas().gasTotalUsed);

        (Auth memory a, bytes memory blob) = _pay(OG, good, 2);
        console.log("GAS|guarded exact, trusted, k=2 veto loop, payee credited:", _settle(a, blob));
        (a, blob) = _pay(OG, good, 3);
        console.log("GAS|guarded exact, second payment (registries warm in-block? no: isolated tx):", _settle(a, blob));

        // isValidSignature alone, priced as a non-view call (forge isolates only non-view calls)
        Probe1271 pr = new Probe1271();
        (a, blob) = _pay(OG, good, 4);
        bytes32 d = _twaDigest(address(usdc), address(payer), a);
        pr.baseline(payer, d, blob);
        uint256 base = vm.lastCallGas().gasTotalUsed;
        pr.check(payer, d, blob);
        console.log("GAS|isValidSignature marginal (trusted):", vm.lastCallGas().gasTotalUsed - base);
        (a, blob) = _pay(OFARM, farm, 5);
        d = _twaDigest(address(usdc), address(payer), a);
        pr.check(payer, d, blob);
        console.log("GAS|isValidSignature marginal (farm, refused):", vm.lastCallGas().gasTotalUsed - base);

        vm.prank(anchors[0]);
        rep8004.giveFeedback(good, -100, 0, "slash", "", "", "", bytes32(0));
        (a, blob) = _pay(OG, good, 6);
        d = _twaDigest(address(usdc), address(payer), a);
        pr.check(payer, d, blob);
        console.log("GAS|isValidSignature marginal (vetoed, refused):", vm.lastCallGas().gasTotalUsed - base);
        payer.reportRefusal(d, blob);
        console.log("GAS|reportRefusal (vetoed) billed:", vm.lastCallGas().gasTotalUsed);
    }
}

/// Non-view wrapper so that forge prices the ERC-1271 call as a transaction would (cold pages included).
contract Probe1271 {
    event Seen(bytes4 r);

    function check(TrustGatedPayer p, bytes32 h, bytes calldata blob) external returns (bytes4 r) {
        r = p.isValidSignature(h, blob);
        emit Seen(r);
    }

    function baseline(TrustGatedPayer, bytes32, bytes calldata) external returns (bytes4 r) {
        emit Seen(r);
    }
}

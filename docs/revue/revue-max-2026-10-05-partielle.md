# Revue maximale du 05/10 — rapports récupérés (5 agents sur 20)

> La revue `/code-review max` du 05/10 a été interrompue par la limite d'usage. Ces 5 agents avaient terminé ; leur rapport final est extrait tel quel de leur transcript. Les 15 autres angles n'ont rien rendu. **Rien n'a encore été vérifié par la phase de vérification de la revue.**

## A3 line-scan TrustGatedPayer.sol

I found no high-severity bug in `TrustGatedPayer.sol` or `IERC8004.sol`. The gate itself holds up: every check I could think of passed, and probes confirmed the two most interesting candidates below. Everything ran in a scratch copy of `contracts/`; no repo files were changed and no transactions were sent.

**What checks out**
- **Blob parsing:** offsets and lengths are right for all three kinds (246, 266 and 98 bytes), with strict lengths, so trailing bytes are refused. The kind byte is checked, and there is no `abi.decode`. A 65-byte `(v,r,s)` signature can never validate.
- **Digests:** the EIP-3009 `TransferWithAuthorization` and `CancelAuthorization` type hashes, field order and `from = this` all match. The token domains are read live; the payer's own domain is cached and rebuilt if the chain id changes.
- **Upto path:** I fetched the upstream `x402UptoPermit2Proxy` and its base contract. The full `PermitWitnessTransferFrom…Witness(address to,address facilitator,uint256 validAfter)` string matches Permit2's stub plus the proxy's string, and the witness hash matches. The spender is fixed to `uptoProxy`. The cap is what gets checked (the proxy and Permit2 enforce amount ≤ cap), and the facilitator is bound by the witness plus `msg.sender == facilitator`. Cross-payer replay of the owner-less Permit2 digest is blocked because the operator signs in the payer's own domain.
- **Operator signatures:** the three type strings match the plugin mirror. Low-s, v ∈ {27, 28}, and `ecrecover` returning 0 is handled (zero is never an operator).
- **`_settleable`:** the time windows match USDC's strict inequalities and the proxy's/Permit2's inclusive ones. The Permit2 bitmap read (`n >> 8`, `n & 0xff`) is correct.
- **Consistency:** `decide`, `_explain` and `isValidSignature` use the same order and the same `trusted` value (the lazy `isTrusted` and the eager `assess` cannot disagree).
- **Registry calls:** every staticcall fails closed on a revert, short return data or a target with no code.
- **`IERC8004.sol`:** all signatures match upstream ERC-8004 v2.0.0. Upstream `getAgentWallet` returns 0 (no revert) for an unknown id, so that case gives `NO_WALLET`.
- **ABI mirror:** `plugin/src/lib/payerAbi.ts` is identical (51 entries) to the compiled ABI.

**Probes** (`scratchpad/pc/test/Probe.t.sol`; the existing 45 payer tests also pass in the copy)
- **No fail-open under gas pressure:** a gas sweep of `isValidSignature` for an untrusted agent never returned the magic value.
- **No false refusal trace:** a sweep of `reportRefusal` for a payable authorisation produced zero reports, so starving a registry read never yields a fake refusal.
- **Confirmed: a non-strict anchor set lets the payer pay a sold agent's buyer.** I registered a set with `strictTransfer = false` and `setPolicy` accepted it. After the agent was transferred and the buyer set their own wallet, `isValidSignature` returned the magic value and the buyer was paid.
- **Confirmed: if the treasury is an operator, that one key drains everything.** One `sweep` call moved the payer's whole balance to that key. `script/t1/T1.s.sol` deploys exactly this way (owner = treasury = operator = D).

```json
[
  {"file": "contracts/src/TrustGatedPayer.sol", "line": 370, "summary": "_setPolicy accepts any registered set, including D35 'fast mode' sets (strictTransfer=false), while _walletCheck's design (lines 495-497) assumes 'a transferred agent is not payable anyway (TRANSFERRED)'; in fast mode TRANSFERRED only appears after someone posts proveTransfer, so the payer pays an agent's buyer on the seller's reputation", "failure_scenario": "Owner sets a setId registered with strictTransfer=false (allowed by D35). Trusted agent T's NFT is sold; agentWallet is cleared, then the buyer calls setAgentWallet(T, buyerWallet) (needs only buyerWallet's signature). The buyer's server offers agentId=T, payTo=buyerWallet: decide() returns OK, isValidSignature returns 0x1626ba7e, and USDC goes to the buyer until a proveTransfer lands (confirmed by test_probe_nonStrictSetPaysBuyerOnSellersReputation). Fix: require policyOf(setId).strictTransfer in _setPolicy, or compare live ownerOf in the payer."},
  {"file": "contracts/src/TrustGatedPayer.sol", "line": 187, "summary": "The constructor (and setOperator, line 314) never rejects treasury_ (or owner_) being an operator, so sweep's 'never to the operator (AM-6.9)' guarantee (line 359/361) and PAYER.md §7's 'a stolen operator key can pay trusted agents only, maxPerPayment at a time' do not hold", "failure_scenario": "Deploy as T1.s.sol does (owner = treasury = operator = D). Whoever holds the operator key calls sweep(usdc, balance) as the treasury and takes the whole balance in one call, after which that wallet holds USDC outside the gate (the AM-6.9 plain-transfer bypass). Confirmed by test_probe_operatorAsTreasurySweepsAll."},
  {"file": "contracts/src/TrustGatedPayer.sol", "line": 216, "summary": "Cancellation (kind 3) only covers EIP-3009 nonces; the payer has no way to invalidate a Permit2 unordered nonce, so an operator-signed upto authorisation cannot be revoked individually", "failure_scenario": "Operator signs an AncreUptoPayment with a long deadline (nothing bounds it) to a trusted agent, then wants to retract it. No kind-3-style message exists for Permit2 and the payer cannot call Permit2.invalidateUnorderedNonces. The only levers are pausing everything, removing the operator (voids all its signatures) or approvePermit2(0). Otherwise the facilitator named in the witness can settle up to the cap whenever the agent is trusted before the deadline."},
  {"file": "contracts/src/TrustGatedPayer.sol", "line": 259, "summary": "reportRefusal is permissionless and once-per-hash, so whoever holds the blob picks the block whose (possibly transient) reason becomes the only on-chain trace, and reported[hash] then blocks a later, more telling trace", "failure_scenario": "The payee or facilitator, who has the blob, calls reportRefusal while the reason is a transient STALE (certificate a few blocks past maxAge) or PAUSED. Later the same live authorisation is refused because an anchor vetoed the agent, but reportRefusal now reverts AlreadyReported, so the veto refusal (triggerTag) never appears on-chain (AM-6.8: no other trace exists)."},
  {"file": "contracts/src/TrustGatedPayer.sol", "line": 530, "summary": "_recover rejects valid high-s operator signatures (no security benefit here: replay is bounded by the token nonces), and the plugin's normalizeSignature (plugin/src/lib/payer.ts:102) fixes v and EIP-2098 but never flips s to n-s", "failure_scenario": "An operator signer that does not normalise s (KMS/HSM/some MPC wallets) returns a valid signature with s > n/2 about half the time. The payer answers BAD_OPERATOR_SIG and every such payment is refused at /verify, although ecrecover would return the operator."}
]
```

## B2 spec-invariant audit contracts

Analyse terminée, faite uniquement en lisant le code et avec quelques `grep`. Je n'ai lancé aucun test ni écrit aucun script. J'ai confronté chaque contrôle annoncé dans ENCODING.md §1-§7, PROOFS.md et PAYER.md au code de `contracts/src/AnchoredReputation.sol` et `contracts/src/TrustGatedPayer.sol`.

**Ce qui est conforme :**
- **Paramètres du jeu d'ancres et politique (§1)** : tous les contrôles sont présents.
- **Contrôles de `submitCertificate` (§3)** : nCert, eMax, `ValueTooLarge`, `NotSubSolution`, `BadRows(0..10)` et `BadEdge`, avec les deux largeurs W = 2 et W = 4.
- **Arbre de Merkle (§3.3) et arithmétique (§4)** : tous les sens d'arrondi sont respectés.
- **Relectures Registry-verified (§3.4)** : conformes, à deux exceptions près, listées plus bas.
- **Veto lu en direct (§6)** : conforme.
- **Preuves (§7)** : plafonds D22, `prepaid⁺`, `BadProof(7)`/`BadProof(25)`, `proveWallet` qui annule la ligne, `proveTransfer`.
- **Payer** : contrôles 1 à 5, longueurs 246/266/98, les trois condensats (« rien d'autre »), conditions de `reportRefusal`, `sweep` vers la trésorerie seulement, et même ordre de décision entre `decide`, `isValidSignature` et `explain`.

**Écarts trouvés :**

1. **Nœud à l'adresse zéro, lecture décalée** (le plus grave). `_verifyRows` fait `continue` dès que le client vaut 0, sans sauter les nE arêtes de la ligne. L'hypothèse du code : client = 0 ne concerne qu'une ligne d'agent sans source, donc vide. Or `_appendNodes` accepte `0x02‖address(0)`, et `_clientRare` renvoie alors un client nul sans exiger nE = 0. Toutes les lignes suivantes sont donc lues au mauvais décalage par `_verifyRows`, alors que `_verifyPass` les lit correctement : la règle de forme et la relecture du registre ne portent plus sur les vraies lignes.
2. **La garde « REFUSED first » se contourne en réencodant.** Elle compare les racines brutes, or `graphRoot` et `vectorRoot` changent selon l'encodage :
   - le contrat accepte W = 4 même quand nCert ≤ 65 535 (§3.2 impose W = 2, comme le solveur) ;
   - une ligne vide d'un nœud sans masse, ou un champ SPLUS égal à S⁺, ne change rien au calcul ;
   - les empreintes des ancres et des agents sans masse ne sont pas vérifiées.

   Résultat : sur un jeu ouvert, n'importe qui peut effacer des preuves d'omission ou de dilution en resoumettant le même certificat réencodé.
3. **Lignes à sPlus déclaré : eUp sous-estimé** (le défaut est dans la formule de §7.1 elle-même). La formule garde le budget positif à max(GRID, sPlus). Quand une arête positive engagée est révoquée, la hausse de poids des autres arêtes de la vraie ligne n'est jamais facturée à eUp. Exemple chiffré dans le JSON : il manque 0,5 de masse normalisée.
4. **« REFUSED first » sauté quand `registryChanged` est vrai**, alors que §5 le place avant toutes les clauses d'acceptation.
5. **Règle de forme testée sur la valeur décodée, pas sur le bit SRC.** Des lignes d'ancre ou d'adresse avec SRC = 0 passent, et une ligne d'adresse peut alors servir d'alias.
6. **`_verifyOwners` ne vérifie pas tout.** L'empreinte des ancres (« 0 pour les autres nœuds ») et celle des agents sans masse ne sont jamais contrôlées.
7. **`dryRun` saute la règle de forme et la borne 2^63 sur ownerFp**, que `submitCertificate` applique.
8. **Transfert en mode strict** : le contrôle dépend de trust ≠ 0 au lieu de « masse > 0 ». Le seul effet est sur le statut affiché.

Le point 2 est déduit du scénario de `test_replacementRefusesResubmittingProvenCertificate` (`contracts/test/Verified.t.sol:675`) : après la preuve, on resoumet le même contenu sous un autre encodage. Ce test ne couvre que la resoumission identique octet pour octet ; je n'ai pas exécuté la variante.

```json
[
  {"file": "contracts/src/AnchoredReputation.sol", "line": 1120,
   "summary": "_verifyRows skips a row whose client is address(0) with `continue` without advancing `off` past its nE edges; besides empty source-less agent rows, client 0 also comes from an address node 0x02||address(0), which _appendNodes (l.469-471) accepts and for which _clientRare (l.1179-1180) does not require nE == 0, so the parse of every later row is misaligned against _verifyPass's parse.",
   "failure_scenario": "Open set: anyone calls addNodes(setId, 0x02 || 20 zero bytes); a certificate then carries that node's row with nE >= 1 followed by other rows. _verifyPass computes y over the real rows, but _verifyRows checks later rows at wrong offsets, so the shape rule (target must be an agent) and the Registry-verified D14 re-read / SRC check are not applied to the rows actually committed. This breaks 'every committed edge is re-read at submission' (ENCODING §3.4, PROOFS.md guarantees table), and the zero-address row's own edges never get the agent-target check. Fix: reject address(0) in _appendNodes and/or require nE == 0 (or skip nE*(W+6) bytes) before the `continue`."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 576,
   "summary": "The 'REFUSED first' guard (ENCODING §5) compares raw vectorRoot/graphRoot, but both are malleable without changing (mass, q, D): the contract accepts W = 4 for nCert <= 65535 (l.638; §3.2 and solver/export.py:258 mandate W = 2), an SPLUS field equal to the committed S+, an empty row for a zero-mass node, and unchecked ownerFp lanes for anchors and zero-mass agents.",
   "failure_scenario": "As in test_replacementRefusesResubmittingProvenCertificate: proveEdge proves an omission/dilution (eLowEff > 0). Anyone resubmits the same vectors and the same rows re-encoded with W = 4. The roots differ, so the guard is skipped; mass is the same, qNew <= qCur (widened by the proof), D is the same, and the committed edges still match the registry, so the fast path accepts. eLow/eUp and V13 certified veto bits are reset to zero, and this can be repeated after every new proof."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 1662,
   "summary": "For a row with a declared sPlus, proveEdge fixes the positive-side floor G = max(GRID, sPlus), so when a committed positive edge drops (revocation, stale) B stays at sPlus and the renormalisation increase of the true row (true sum sPlus - wo) is never billed to eUp; this is the ENCODING §7.1 formula itself, and it breaks the PROOFS L5/L6 upper bound for the true graph.",
   "failure_scenario": "sPlus = 20000, committed A = 10000 and B = 5000, omitted C = 5000. A is revoked and proveEdge(A) bills dec+ = 0.5 to eLow and inc+ = 0. True row: B 0.5, C 0.5; amended committed row: B 0.25. Excess 0.75, covered only by the 0.25 prepaid margin, so eUp is short by 0.5*(1-alpha)*t_u/alpha per column and distrustUp can pass the rho test it should fail. Undeclared rows (G = GRID) renormalise correctly."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 572,
   "summary": "The whole replacement block, including the REFUSED-first check, is skipped when registryChanged is true, whereas ENCODING §5 applies REFUSED first before every acceptance clause (registryChanged included).",
   "failure_scenario": "A certificate is proven to omit or dilute edges (eLowEff > 0); checkRegistry then flags a registry version change. A byte-identical resubmission passes the re-reads (omissions are undetectable at submission) and is accepted, erasing the proofs it should have kept."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 1179,
   "summary": "The shape rule tests the decoded source value, not the H_SRC bit: an anchor or address row with H_SRC set and a zero 20-byte source passes, an address-node row with SRC = 0 can ALIAS it (the _rowLoop alias check only needs both hasW bits and equal addresses), and an agent row with H_SRC + zero source is accepted as source-less (l.1167-1170); §3.2 says anchor/address rows carry neither SRC nor VIA_OWNER, and ALIAS requires SRC.",
   "failure_scenario": "Non-canonical rows are accepted at both levels (alias copies of zero-mass address rows still add their positive edges to E+). Each variant gives another graphRoot for the same semantics, which feeds the REFUSED-first bypass above."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 1187,
   "summary": "_verifyOwners starts at i = k and only checks agents with mass: anchor nodes' ownerFp is never required to be 0, and zero-mass agents may carry any fingerprint, whereas ENCODING §3.1/§3.4 say '0 for other nodes'.",
   "failure_scenario": "A Registry-verified certificate stores arbitrary fingerprints for anchors and zero-mass agents. proveTransfer can then flag a zero-mass certified agent whose ownerFp is wrong, so assess/decide/explain report TRANSFERRED instead of OK. vectorRoot is also malleable without changing (mass, q, D)."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 601,
   "summary": "dryRun runs only _verifyPass: it skips the shape rule (which needs no registry read) and the ownerFp < 2^63 check done in _storeVectors, so its documented role ('what a submission would produce, without reading the registry') is weaker than submitCertificate.",
   "failure_scenario": "A certificate with an edge to a non-agent node, an anchor row carrying SRC, or ownerFp >= 2^63 passes dryRun, then reverts in submitCertificate with EdgeMismatch(row, 256/rank) or ValueTooLarge. The certifier pays the full gas limit of the failed transaction (Monad bills the limit)."},
  {"file": "contracts/src/AnchoredReputation.sol", "line": 1421,
   "summary": "The strict transfer check (D35) only runs when x.trust != 0 (floored lambda-weighted sum), while §3.1/§6 say 'an agent of mass > 0'.",
   "failure_scenario": "A certified agent with tiny t (e.g. t = 1 wei, lambda = 0.5 WAD, so c_a = 0) whose token was transferred reports status OK instead of TRANSFERRED in assess/decide/explain. It is never trusted (theta > 0), so only the reported status is wrong."}
]
```

## C3 cross-file plugin vs payer

Revue terminée sur l'angle C (plugin ↔ TrustGatedPayer ↔ AnchoredReputation). Aucun défaut de miroir trouvé ; les défauts réels sont dans la façon dont le plugin interprète les résultats et gère les erreurs autour des miroirs.

**Ce qui est vérifié et conforme :**
- **ABI** : `plugin/src/lib/payerAbi.ts`, régénéré dans le scratchpad, est identique octet par octet à `contracts/out`. Les keccak des sources dans les métadonnées du build égalent ceux des fichiers `.sol` actuels, donc l'ABI n'est pas périmée.
- **Signatures EIP-712** : les chaînes de type `AncrePayment`, `AncreUptoPayment` et le Witness/PWTF de Permit2 correspondent exactement aux typehashes, champ par champ, comme celles de `@x402/evm` 2.27. Le domaine (`ANCRE TrustGatedPayer`, `1`, chainId, payer) correspond aussi.
- **Domaine USDC** : `USDC`/`2` est codé en dur, ce qui est juste sur 143 et 10143 (mesuré dans `docs/ressources/x402.md` §5).
- **Blobs** : la disposition des blobs 246 et 266 octets correspond aux offsets de `_parse`.
- **Énumérations et structs** : l'ordre de `Reason`, `Status`, `Assessment` et `Policy` est juste, et les tuples de `decide` et `explain` sont bien déstructurés.
- **Unités et appels** : USDC à 6 décimales et scores WAD sont bien séparés. L'ordre des arguments de tous les `readContract` est bon, et chaque appel vise la bonne adresse : registres lus via `payer.identity()` et `ancre.reputation()`, registres testnet et mainnet conformes au CLAUDE.md §3.
- **Hôte** : l'exécuteur `mm` sérialise les bigint du typed-data et renvoie `kind:"signature"`, ce que le plugin attend.
- **Tests** : 45/45 passent, sur une copie de build faite dans le scratchpad.

**Défauts trouvés, du plus grave au moins grave :**
1. **Paiement réglé déclaré refusé** : x402 v2.27 propose le flux `upfront`, accepté pour `exact`/eip3009. Le serveur y règle avant le handler, et si le handler échoue, il renvoie une réponse non-2xx portant `PAYMENT-RESPONSE {success:true}`. Le plugin exige `res.ok` et annonce alors « non payé ». Même défaut dans `override`.
2. **`check --naive`** : la partie naïve n'est pas isolée. Une erreur RPC sur `getClients`/`getSummary` fait perdre le verdict ANCRE déjà calculé, ce qui casse la scène de démo #182.
3. **Signature high-s** : `normalizeSignature` ne ramène pas `s` dans la moitié basse. Le contrôle local via viem passe, le payeur refuse avec `BAD_OPERATOR_SIG`, et le message parle à tort d'une mauvaise méthode de connexion. Probabilité faible, elle dépend du signataire.
4. **`checkFlow`** : le `.catch(() => zeroAddress)` sur `getAgentWallet` transforme une erreur RPC passagère en `WALLET_MISMATCH`.
5. **`SETTLEMENT_FAILED`** : la note `humanOverride` est attachée, alors que `override` refusera avec `ANCRE_OVERRIDE_NOT_NEEDED`.
6. **`OVER_LIMIT` inatteignable** : avec `inspect`/`pay`, une offre au-dessus du plafond lève `ANCRE_NO_OFFER`, avec un indice trompeur, sans entrée de journal ni note d'override, contrairement à ce que dit `SKILL.md`.
7. **`--rpc-url` / `ANCRE_RPC_URL`** : la chaîne n'est jamais comparée à `--chain-id`. `check` peut renvoyer un verdict lu sur l'autre réseau.

```json
[
  {"file": "plugin/src/lib/flows.ts", "line": 249, "summary": "A settled payment is reported as REFUSED / paid:false when the response is non-2xx but carries a successful PAYMENT-RESPONSE (x402 v2 'upfront' flow, which selectOffer does not filter); the same check exists in override.ts:151.", "failure_scenario": "Provider offers exact USDC with extra.paymentFlow='upfront' (supported for eip3009 in @x402/evm 2.27, exact/server paymentFlows). The server settles before the handler; the handler fails and the server answers 500 with PAYMENT-RESPONSE {success:true, transaction:0x..} (core createFailurePathSettlementHeaders). flows.ts:249 requires res.ok, so it goes to the REFUSED branch. explain (TrustGatedPayer.sol:240, which does not look at nonce use) returns OK, and afterFailure (verdict.ts:85) turns that into SETTLEMENT_FAILED 'Not paid'. The result also carries liveAuthorization 'can still be settled' and a humanOverride note (flows.ts:269-270), and the journal records settlement_refused. Yet the USDC already left the payer, so the human may approve a second payment. override.ts:151-160 has the same defect: OVERRIDE_FAILED after the human's funds have moved."},
  {"file": "plugin/src/lib/flows.ts", "line": 97, "summary": "In checkFlow --naive, any failure of the optional naive reads (getClients/getSummary over every client) throws and discards the ANCRE verdict already computed by decide.", "failure_scenario": "`mm ancre check 182 --naive` (the DEMO.md scene): getClients returns 7,665 clients, and getSummary is called with ~245 KB of calldata, reading every feedback. A 429 on the 25-rps RPC, or an eth_call gas or body limit on the mm gateway (ctx.publicClient), makes read() throw ANCRE_RPC_ERROR (flows.ts:74). The whole command fails and the UNTRUSTED verdict from decide (TrustGatedPayer.sol:226, flows.ts:92) is never shown; there is no try/catch around lines 94-109."},
  {"file": "plugin/src/lib/payer.ts", "line": 102, "summary": "normalizeSignature fixes v but never canonicalises a high-s signature, while TrustGatedPayer._recover rejects s > n/2; the local operator check (viem) accepts it, so the mismatch surfaces only at settlement.", "failure_scenario": "The wallet executor returns a valid high-s ECDSA signature (v=27/28). In flows.ts:218-219, recoverTypedDataAddress (noble, no low-s check) recovers the operator and isOperator returns true, so the blob is sent. At /verify, the USDC calls isValidSignature; TrustGatedPayer.sol:530 returns address(0), giving INVALID. The facilitator refuses, explain returns BAD_OPERATOR_SIG, and the agent is told 'not an operator of this payer (wrong mm login method?)' (verdict.ts:76), although the plugin just checked that it is one. Normalising s -> n-s and flipping v would fix it."},
  {"file": "plugin/src/lib/flows.ts", "line": 91, "summary": "checkFlow swallows every getAgentWallet error into zeroAddress, and the payer then reports WALLET_MISMATCH for a trusted agent instead of an RPC error.", "failure_scenario": "`mm ancre check 12` on a trusted agent whose agentWallet is set: the getAgentWallet read fails transiently (429 or timeout on rpc.monad.xyz via --rpc-url). .catch(() => zeroAddress) means decide(12, 0x0, 0) is called; TrustGatedPayer._walletCheck (TrustGatedPayer.sol:505) reads the real non-zero wallet, which is != 0x0, and returns WALLET_MISMATCH. The skill reports 'payTo is not the wallet of the agent the offer claims to be' for a check that has no offer at all. NO_WALLET is only correct when the registry itself returns 0 or reverts."},
  {"file": "plugin/src/lib/flows.ts", "line": 270, "summary": "The human-override note is attached to SETTLEMENT_FAILED (a failure that explain says is not ANCRE's), but the override command refuses exactly that case.", "failure_scenario": "pay: the facilitator or server fails (expired window after a slow MFA approval, or a facilitator outage). explain returns OK, afterFailure gives SETTLEMENT_FAILED with pay:false, and flows.ts:269-270 adds HUMAN_OVERRIDE_NOTE ('Only the human may override this refusal'). The human runs `mm ancre override <url>`; inspectChallenge -> decide says PAY, and override.ts:74 throws ANCRE_OVERRIDE_NOT_NEEDED. The guidance points to a dead end, and the existing test (flows.test.mjs 'explain says OK') never checks that the note is absent."},
  {"file": "plugin/src/lib/x402.ts", "line": 92, "summary": "Offers above the payer's maxPerPayment are filtered before decide, so the OVER_LIMIT verdict documented in SKILL.md is unreachable from inspect/pay; the agent gets ANCRE_NO_OFFER with a misleading hint, no journal entry and no override note.", "failure_scenario": "maxPerPayment = 0.01 USDC and the provider asks 0.02. challenge() (flows.ts:136) passes maxPerPayment to selectOffer, which drops the offer and throws ANCRE_NO_OFFER with the hint 'ANCRE pays \"exact\" USDC on eip155:143 only' (x402.ts:96). decide/OVER_LIMIT (TrustGatedPayer.sol:455, verdict.ts:74) is never reached. payFlow never journals the refusal (contrary to D47 'every refusal is journaled') and shows no humanOverride, although the override is designed for exactly this case (payerCap=false)."},
  {"file": "plugin/src/lib/host.ts", "line": 14, "summary": "With --rpc-url / ANCRE_RPC_URL, the read client's chain is never compared with --chain-id; checkFlow and inspectFlow have no equivalent of statusFlow's USDC/chain check (flows.ts:310).", "failure_scenario": "ANCRE_RPC_URL points to the testnet RPC while running `mm ancre check 12 --chain-id 143` (or the reverse), and the payer was deployed by the same key at the same nonce on both chains, so it has the same address. decide is read from the other network's payer and ANCRE (TrustGatedPayer.sol:226 -> assess) and returned as the mainnet verdict (for example PAY from the demo set), with no ANCRE_WRONG_CHAIN error. createPublicClient({transport: http(rpcUrl)}) never calls eth_chainId."}
]
```

## Cleanup: reuse angle

**Angle REUSE : bilan**

J'ai trouvé 8 candidats. Les quatre premiers sont des copies dont le comportement diverge déjà, et chacun est reproduit avec un script jetable dans le scratchpad. Les quatre suivants sont du nettoyage pur. Je n'ai modifié aucun fichier du dépôt.

**Copies qui divergent déjà**
1. **Plugin : `payer status` et `override` ne désignent pas les mêmes adresses comme « l'agent ».**
   - `statusFlow.isHuman` (flows.ts:319) ne tient compte que du wallet sélectionné. `override` bannit au contraire toutes les adresses du wallet hôte (`host.ts:allWalletAddresses`, override.ts:83).
   - J'ai rejoué le cas sur `dist` avec des stubs : quand owner et treasury sont une seconde adresse du wallet hôte, `status` affiche `ok: true` et `override` refuse la config comme mal configurée.
2. **`indexer/scripts/check.ts` pagine mal.** Il s'arrête dès qu'une page est incomplète, alors que `from_indexer.py:81` et FORMAT.md §146 imposent de s'arrêter sur une page vide.
3. **`export.main` refait à la main l'expérience execution.market D44 et le schéma pre-D15**, alors qu'il importe déjà `run_mainnet`.
   - Le vecteur publié `mainnet_em_d44` filtre 6 tags et compte 48 couples.
   - Le rapport `run_mainnet` §(f) filtre 8 tags (il ajoute `buyer_rating:*`) et compte 49 couples.
4. **`replay_identity_events` ne retire pas l'owner courant des anciens owners**, contrairement à `load_identity` et `from_indexer.identity_file`. Sur l'historique A→B→A, les deux exports produisent un `pastOwners` différent. L'impact se limite aujourd'hui aux rapports, et je n'ai trouvé aucun cas de ce type dans le snapshot.

**Nettoyage pur (cohérent aujourd'hui)**
5. Dans le contrat, l'adressage des lanes de vecteur est recopié 5 fois, alors que `vectorAt` fait déjà exactement ce calcul.
6. Toujours dans le contrat, l'en-tête de ligne est décodé 3 fois.
7. `synthetic.py` réimplémente le solveur PPR flottant et redéfinit `WAD`.
8. Le contrat code chacune des règles R6 et R7 deux fois, et réécrit l'empreinte d'owner en ligne à 3 endroits alors que `ownerFingerprint()` existe.

**Points mineurs, hors JSON faute de place**
- **Plugin :**
  - `REASONS` et `STATUSES` (payer.ts:4) sont des copies manuelles que `gen-abi.mjs` pourrait générer.
  - Le fragment `identityAbi` est écrit deux fois (flows.ts:49 et x402-guard.ts:28).
  - `parseUsdc`/`fmtUsdc` redoublent `parseUnits`/`formatUnits` de viem.
  - `normalizeSignature` redouble les fonctions de signature de viem.
  - `defaultAgentId` (x402-guard) et `resolveAgentId` (x402.ts) font le même travail.
- **Solveur :**
  - `export.check_file_obj:420` recode `e_eff`, qui est pourtant importé.
  - `certifier.POLICY_SIG`/`SET_PARAMS_SIG` recopient à la main `export.POLICY_FIELDS`/`SET_T`.
  - `certifier.registry_events` recode `graph._topic_addr`.
- **Contrat :**
  - `dryRun` duplique les pré-contrôles de `submitCertificate` sans gérer `newNodes`. Il renvoie donc `BadNCert` sur le petit cas standard du certifier (nouveaux nœuds passés dans la même transaction).
  - `REGISTRY_CALL_GAS` (payer) recopie `VIEW_CALL_GAS` (ANCRE).
- **Indexeur :** le format d'id `Operator` est écrit à 3 endroits, et `state.isOperator` double `storeView.isOperator`.

```json
[
 {"file": "plugin/src/lib/flows.ts", "line": 319,
  "summary": "statusFlow re-implements the 'owner/treasury must be the human' rule with its own isHuman (payer, operators, SELECTED wallet only) instead of reusing the banned-set logic of overrideFlow (override.ts:83-84, fed by host.ts:allWalletAddresses); the two copies already disagree.",
  "failure_scenario": "Host Agent Wallet manages A (selected, payer operator) and B (another remoteWallets/byokWallets entry); payer owner = treasury = B. `mm ancre payer status` (status.ts:28 passes only selectedWallet) reports guarantee 'owner and treasury are the human' ok:true (reproduced on dist/lib/flows.js with stubs), while `mm ancre override` bans B and refuses with ANCRE_OVERRIDE_MISCONFIGURED. Status therefore certifies a setup where the agent can switch to B and call setPolicy/setOperator/sweep, i.e. the hard guard does not hold; the 'no USDC on the Agent Wallet' check has the same flaw (only the selected address's balance is read). Fix: pass allWalletAddresses(snapshot) and share one humanSigners(owner, treasury, payer, operators, agentWallets) helper between statusFlow and overrideFlow."},
 {"file": "indexer/scripts/check.ts", "line": 56,
  "summary": "check.ts re-implements keyset pagination over the indexer's GraphQL API and stops on a SHORT page, whereas the solver's client for the same API (solver/from_indexer.py GraphQLSource.rows, line 81) stops on an EMPTY page, as solver/FORMAT.md section 146 requires.",
  "failure_scenario": "With any Hasura row cap below 1000 (select-permission limit on the public/Cloud role, or a self-hosted config), all('Feedback') returns after the first capped page (e.g. 500 of 9 283 rows). check.ts then reports getClients/getLastIndex mismatches and 'sum getLastIndex 9283 != indexed feedbacks 500', a false indexer-inconsistency alarm, while from_indexer.py reads the same endpoint completely. Two paginators of one interface with opposite termination rules; check.ts should follow the empty-page rule (one shared paginator spec)."},
 {"file": "solver/export.py", "line": 580,
  "summary": "export.main rebuilds the execution.market D44 experiment (schema + filter, lines 580-582) and the pre-D15 schema (line 575) by hand instead of reusing run_mainnet (schema_variant at run_mainnet.py:68, EM block at 295-303), although it already imports run_mainnet as R; the EM copies already differ.",
  "failure_scenario": "On the versioned snapshot, export.main's filter has 6 tags (executor_rating/requester_rating only) while run_mainnet section (f) has 8 (adds buyer_rating:data_collection and buyer_rating:knowledge_access). The published vector mainnet_em_d44 is built on 48 pairs and the report's D44 graph on 49 (extra pair 0x3a3f992d...->#10261), so out/mainnet.md and the vector describe different graphs under the same name. Any later edit to one copy (anchors, tags, bounds, pre_d15) silently desynchronises the normative vectors from the measured report."},
 {"file": "solver/graph.py", "line": 237,
  "summary": "The 'past holders exclude the current owner' normalisation is applied separately by load_identity (line 207) and from_indexer.identity_file (lines 155-156) but not by replay_identity_events, so the identity replayers that are supposed to share Identity.apply_* already produce different identity.json.",
  "failure_scenario": "History mint->A, A->B, B->A for agent 7: replay_identity_events (snapshot.py path) yields pastOwners {7: [A, B]} with owner A, while from_indexer.identity_file on the same OwnerChange rows yields {7: [B]} (reproduced in the scratchpad). The versioned snapshot and an indexer export at the same block disagree for such agents (today reports only: past_owners feeds run_mainnet's 'ancien owner' measure; no such agent in the current snapshot). Fix: put the discard in Identity.apply_transfer (past_owners[a].discard(to)) and drop both ad-hoc copies."},
 {"file": "contracts/src/AnchoredReputation.sol", "line": 1357,
  "summary": "Vector-lane addressing (slot = _vecBase(setId) + (i>>2)*(k+3) + v, shift (i&3)*64, & LANE_MASK) is re-implemented inline in _assess (1357-1373), proveTransfer (1725-1733), _setFlag (1905-1906) and _widen (1928-1937), although vectorAt (2012-2019) already is exactly that helper.",
  "failure_scenario": "The layout is also hard-coded in _storeVectors, reserveCapacity and solver/certifier.plan. A layout change (new lane, stride k+4) needs 5 identical edits; missing one, e.g. _setFlag, makes proveTransfer and the V13 veto bit write into another node's lane: _assess never sees F_TRANSFERRED (a transferred agent stays payable when strictTransfer is false) and stray bits are OR-ed into someone else's t/d lane, with no revert. One internal _laneSlot(setId, k, i, v) used by all sites, vectorAt included, removes the risk."},
 {"file": "contracts/src/AnchoredReputation.sol", "line": 1105,
  "summary": "The ENCODING section 3.2 row header layout (u:W, hdr, [SRC 20], [SPLUS 4], [ALIAS ref W], edges of W+6 bytes) is decoded three times in the contract: the Yul header() of _rowLoop (975-1021), _verifyRows (1105-1118, a second full pass over the same calldata) and _parseRow (1763-1785).",
  "failure_scenario": "_verifyRows recomputes every offset itself and relies on _rowLoop for all structural checks. A format change applied to header() and _parseRow but not to _verifyRows desynchronises its offsets: honest Registry-verified submissions revert EdgeMismatch on garbage (dst, w, feedbackIndex) read at wrong offsets, and at the Submitter-attested level (reads=false) the shape loop checks the wrong bytes, losing the 'every committed edge targets an agent node, stays provable' guarantee. A shared _rowHeader(bytes calldata, off, W) returning (RowView, next) can serve both _verifyRows and _parseRow; the Yul hot path can stay specialised."},
 {"file": "solver/synthetic.py", "line": 69,
  "summary": "synthetic.py re-implements the float PPR solver (solve duplicates ppr.solve_float), the leak bound (line 98, ppr.leak_bound), leave-one-out (line 92, ppr.trust_robust) and redefines WAD (line 29) instead of importing them from ppr/graph.",
  "failure_scenario": "The alpha choice (D2, out/synthetic.md) is measured with this private copy. Its budget bp = max(1e4, bincount(src, weights=q)) sums ALL weights, whereas ppr/graph use B+ = max(GRID, sum of positive q) plus a separate B-; the results are identical today only because synthetic graphs have no negative edge. Adding a slash scenario, or changing D5/D7/D32 conventions in ppr, would leave the alpha measurements on a different model from the certified one, with no test failing."},
 {"file": "contracts/src/AnchoredReputation.sol", "line": 1130,
  "summary": "R6, R7 and the owner fingerprint are each written twice in the contract: the controller check in _verifyRows (1130, high-level calls) and in proveEdge (1652-1654, _staticWord); source resolution in _clientOf/_clientRare (1146-1182) and in _sourceHolds (1827-1838); and uint160(owner) & LANE_MASK inlined at 1202, 1423 and 1736 while ownerFingerprint() (2051) exists.",
  "failure_scenario": "Consistent today, but any D20/D44/D10 change has to be made in two places that have different failure semantics. Updating only _verifyRows would let proveEdge prove (and bill eLow/eUp for) edges that submission now refuses, or the reverse; a fingerprint change applied to _verifyOwners but not to _assess would make every certified agent TRANSFERRED in strict mode. Shared helpers _isController(client, j) -> (ok, ctl), _sourceOf(j, row) and ownerFingerprint() at every site remove the drift."}
]
```

## D1 Solidity/Yul pitfalls

## Angle D (pièges Solidity/Yul) : rapport

J'ai trouvé un défaut critique, que j'ai confirmé par un test, et deux défauts mineurs. Je n'ai rien modifié dans le dépôt ; tout le travail a été fait dans une copie du scratchpad.

### 1. Critique (confirmé) : un nœud `address(0)` fait sauter la relecture du registre
- **Le défaut.** Dans `_verifyRows`, la ligne 1120 (`if (client == address(0)) continue;`) passe à la ligne suivante sans avancer `off` au-delà des arêtes de la ligne courante.
  - `client == 0` peut arriver avec une ligne non vide : c'est le cas d'un nœud adresse `address(0)`, que `_appendNodes` (l. 469-471) accepte sans contrôle, y compris par `addNodes` ouvert à tous sur un set ouvert.
  - `_rowLoop` lit cette ligne en entier, mais `_verifyRows` se décale.
  - `_verifyRows` ne vérifie ni l'ordre de `u`, ni `u < n`, ni `off == rows.length` en fin de boucle. Les lignes qui suivent échappent donc à la relecture du registre et au contrôle de forme (`dk >> 248 == KIND_AGENT`).
- **Le test.** Je l'ai écrit dans le scratchpad (`.../scratchpad/angleD/contracts/test/PocD.t.sol`, lancé avec `forge test --match-contract PocD`).
  - Sur un set ouvert `registryVerified`, un tiers a soumis un certificat avec une arête X→E qui n'existe pas dans le registre.
  - Le certificat est accepté. `isTrusted(E)` renvoie `true` pour un agent qui n'a reçu aucun avis (statut OK, trustLow ≈ 0,148 WAD, distrustUp = 15 wei).
  - Sans la ligne `address(0)`, la même soumission échoue bien avec `EdgeMismatch(1,0)`.
- **Ce qui limite l'impact.** Les feuilles Merkle reprennent la lecture de `_rowLoop`, donc un `proveEdge` reste possible après coup et ramène le set à STALE. Mais c'est justement la garantie « une arête fabriquée ne peut pas être engagée » du niveau Registry-verified qui tombe, et il reste une fenêtre de paiement entre la soumission et la preuve.
- **Correctif proposé.**
  - Avancer `off += nE*(W+6)` avant le `continue`, ou refuser `nE != 0` quand le client est nul.
  - Refuser `address(0)` dans `_appendNodes`.
  - Ajouter `require(off == rows.length)` à la fin de `_verifyRows`.

### 2. Faible : un champ SRC à zéro est accepté sur les lignes adresse/ancre
- `_clientRare` (l. 1179) ne refuse qu'un wallet non nul, pas un drapeau `H_SRC` accompagné de 20 octets à zéro. Le commentaire de la l. 1144 dit pourtant « Anchor and address rows carry no SRC ».
- Le contrôle « même client » des alias (l. 1014) compare le champ SRC brut. Un alias entre deux nœuds adresse différents, tous deux avec SRC = 0, est donc accepté.
- Sans effet sur la masse aujourd'hui (t = 0 sur ces nœuds), mais l'encodage n'est plus canonique.

### 3. Moyen-faible : un échec de lecture du registre est lu comme « agent brûlé »
- Dans `proveEdge` (l. 1652-1654), un `ok == false` donne `wNew = 0`. Dans `_sourceHolds` (l. 1830), il donne « source changée ».
- Un échec qui n'a rien à voir avec un burn suffit donc : par exemple une mise à jour UUPS qui garde la chaîne de version mais dépasse le plafond de 120k gas. N'importe qui peut alors fabriquer des écarts sur toutes les lignes et faire passer le set en STALE.
- La variante par limitation du gas (règle des 63/64) ne marche pas : j'ai fait le calcul, le travail qui suit l'appel coûte bien plus que 1/64 du plafond.

### Vérifié, sans problème trouvé
- **Arithmétique Yul.** Les produits sont bornés : t < 2^64, om < 2^32, |w| ≤ 1e4, donc moins de 2^110. Les divisions ont un dénominateur ≥ 1e4·aD.
- **Signes.** `signextend(1, …)`, `sgt`/`slt` et `vetoMax` en complément à deux sont corrects.
- **Sélecteurs Yul.** `BadRows` (0x9f1b671d) et `BadEdge` (0xa6a549a4) sont exacts.
- **Lectures calldata dans `_rowLoop`.** Elles sont couvertes par les contrôles `next > end` et `off == end`.
- **Merkle.** La profondeur est fixée par `numRows`, donc pas de seconde préimage possible.
- **Appels externes.** `_staticWord` refuse un EOA ou un retour trop court. `_readFb` valide les types int128/uint8.
- **Payer.** Tout est fail-closed : `_isTrusted`, `_walletCheck`, `_domainOf`, le refus des signatures high-s, des `v` invalides et d'un `ecrecover` à 0. La valeur MAGIC est correcte.
- **Temps et stockage.** `block.number` sert pour les fenêtres, `block.timestamp` uniquement là où USDC/Permit2 l'imposent. `SetState` occupe 86 slots, donc une seule page MIP-8 (le commentaire dit 84, détail cosmétique).

```json
[{"file": "contracts/src/AnchoredReputation.sol", "line": 1120, "summary": "_verifyRows fait `continue` quand client == address(0) sans avancer `off` au-delà des nE arêtes ; un nœud adresse address(0) (accepté par _appendNodes l.471, addNodes ouvert à tous en set ouvert) avec une ligne non vide désynchronise _verifyRows de _rowLoop, et les lignes suivantes échappent à la relecture du registre et au contrôle de forme (pas de contrôle d'ordre, de u < n ni de fin de buffer).", "failure_scenario": "Set ouvert registryVerified : un tiers ajoute un nœud address(0), lui met une ligne non vide puis une ligne d'agent avec une arête X->E inexistante dans le registre ; submitCertificate l'accepte et isTrusted(E) == true sans aucun avis (reproduit dans un test forge du scratchpad ; la même soumission sans la ligne address(0) échoue avec EdgeMismatch(1,0)). Ce n'est rattrapable qu'après coup par proveEdge, ce qui laisse une fenêtre de paiement."},
 {"file": "contracts/src/AnchoredReputation.sol", "line": 1654, "summary": "proveEdge (et _sourceHolds l.1830) interprète tout échec de lecture du registre (okA/okW == false) comme un agent brûlé ou une source changée (wNew = 0, ligne annulée) au lieu de revert.", "failure_scenario": "Mise à jour UUPS du registre qui garde la chaîne de version (donc pas de REGISTRY_CHANGED) mais fait dépasser 120k gas, ou fait revert, isAuthorizedOrOwner/getAgentWallet pour des agents existants : n'importe qui prouve chaque arête engagée comme supprimée, eLowEff dépasse eLowMax et tous les agents du set passent STALE. La variante par limitation du gas (63/64) n'est pas faisable."},
 {"file": "contracts/src/AnchoredReputation.sol", "line": 1179, "summary": "Une ligne ancre/adresse peut porter H_SRC avec un wallet à zéro (seul un wallet non nul est refusé), contrairement à la règle « Anchor and address rows carry no SRC » ; le contrôle même-client des alias (l.1014) compare le champ SRC brut et non le client résolu.", "failure_scenario": "Une ligne alias d'un nœud adresse U (SRC = 0) qui copie la ligne d'un autre nœud adresse ou d'une ancre (SRC = 0) est acceptée alors que les clients diffèrent (address(U) contre address(src)) ; sans effet sur la masse aujourd'hui (t = 0), mais l'encodage n'est plus canonique et des arêtes sont attribuées au mauvais client."}]
```


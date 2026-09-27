# Payeur x402 « qui refuse de payer » et réseau de la démo — design (vague 2)

> Vague 2, **2026-09-27** (≈ 21:30-22:30 UTC). Suite de `x402.md` et `monad-dev-et-soumission.md` (vague 1).
> Étiquettes : **DOC** (code source lu, lien et commit) · **MESURÉ** (appel `cast`/`curl` réel, lecture seule) · **MESURÉ-FORK** (`forge test` sur un fork `network = "monad"`, aucune transaction diffusée) · **CALCULÉ** (formule appliquée à des mesures) · **ESTIMÉ** (ordre de grandeur) · **NON TROUVÉ** / **NON VÉRIFIÉ**.
> Aucune transaction réelle n'a été envoyée. Les tests en fork sont dans le scratchpad de la session (`…/scratchpad/w2/fork/` et `…/w2/dep/`), hors dépôt.
> Blocs de référence : testnet 10143 ≈ 66 235 500, mainnet 143 ≈ 108 574 900. Gas price relevé : **102 gwei** (base fee 100 gwei) sur les deux réseaux (MESURÉ, `cast gas-price`).

---

## 0. Ce qui change (à lire en premier)

| # | Fait | Statut | Conséquence |
|---|---|---|---|
| 1 | **L'architecture (a) marche en fork, sur les deux réseaux**, en `exact` (EIP-3009, variante `bytes`) **et** en `upto` (Permit2 + `x402UptoPermit2Proxy`). Un contrat payeur sans clé privée paie un fournisseur autorisé, refuse la ferme, et **le disjoncteur coupe entre `/verify` et `/settle`** (revert `FiatTokenV2: invalid signature`). | MESURÉ-FORK (5 tests verts, testnet et mainnet) | La voie ERC-1271 est validée côté chaîne. Il reste à tester le **facilitator réel** (§4). |
| 2 | **Correction de la vague 1 (x402.md §0.8 et §6.3).** Dans FiatToken v2.2, la variante `(v,r,s)` de `transferWithAuthorization` **reconditionne la signature et passe par le même `SignatureChecker`**. Celui-ci appelle `isValidSignature` dès que `from` a du code, **y compris pour une EOA déléguée EIP-7702**. Le classement « EOA » de x402-rs ne contourne donc **pas** la garde. Le vrai contournement 7702 est ailleurs : le détenteur de la clé envoie un simple `USDC.transfer`. | DOC (Circle `EIP3009.sol` l. 84-103, `SignatureChecker.sol`) + MESURÉ-FORK (`test_vrs_variant_also_goes_through_1271_for_7702`) | La conclusion ne change pas (7702 = garde de confort), mais pour une autre raison. Autre effet : une EOA 7702 dont le délégué n'implémente pas ERC-1271 **ne peut plus payer du tout** en EIP-3009 avec l'USDC v2.2. |
| 3 | **`status == OK` ne veut pas dire « digne de confiance ».** Un agent absent de la table de nœuds obtient `status = OK` avec `trust = 0` (lecture de `assess`, l. 876-943). L'esquisse de la vague 1 (x402.md §6.2) **aurait payé n'importe quel inconnu**. | DOC (code du dépôt) | Le payeur doit appliquer le seuil d'`isTrusted` : `trustRobust ≥ θ + e` et `ρ_D·(d + e) ≤ ρ_N·(trustRobust − e)`. |
| 4 | La signature réelle est `assess(uint256 agentId, bytes32 setId, bool withVeto) view returns (Assessment)`. Elle est bien `view`, ne revert jamais, et plafonne chaque appel au registre à `VIEW_CALL_GAS = 120 000`. Coût : 77-82 k sans veto, 115-190 k avec (MESURÉ, GAS.md §3). | DOC + MESURÉ | Compatible avec un `isValidSignature` en STATICCALL. Le veto (D33) impose `withVeto = true`. |
| 5 | **Facilitator x402-rs : aucun plafond de gas dans le code.** Au règlement, la tx part sans `gas_limit` et la limite vient de `eth_estimateGas` (`chain/provider.rs` l. 483-490). Un refus au règlement fait **échouer l'estimation** : **aucune tx n'est diffusée** et personne ne paie de gas. | DOC (monad-developers/x402-rs @ `a150a8a`, 2026-09-23) | Il n'y a pas de plafond côté code, mais il faut le **confirmer sur le binaire déployé** (test T1-7). Un refus ne laisse **aucune trace on-chain**, donc l'écran doit le reconstituer (§2.6). |
| 6 | **Coût d'un règlement gardé**, payé par le facilitator : **≈ 252 k** (assess sans veto) à **≈ 364 k** (veto, k = 8), contre **144 k** pour une EOA. | MESURÉ-FORK (assess simulé par un brûleur de gas calibré sur GAS.md) | ≈ 0,026 à 0,037 MON par paiement **à la charge du facilitator**. C'est acceptable pour une démo ; il faut rester poli sur le volume. |
| 7 | **La prémisse de D19 est fausse.** Les registres ERC-8004 v2.0.0 existent sur le testnet, avec des **implémentations aux mêmes adresses et au même bytecode** que sur le mainnet, et la **même EOA propriétaire**. Le registre testnet est **plus vivant** que celui du mainnet : 1 941 agents, 1 530 avis, dernier avis il y a environ 4 h. | MESURÉ (§5.1) | L'acte 2 peut se jouer sur le testnet sans rien perdre techniquement. Recommandation : **hybride B** (§5.4). |
| 8 | Toutes les mesures d'unité manquantes pour le budget sont maintenant prises en fork. `register(uri)` 221,7 k ; `giveFeedback` 271,4 k (premier avis d'un couple), 178,2 k (avis suivant) ; déploiement d'ANCRE ≈ 4,37 M ; `registerAnchorSet` (k = 3) 385,8 k. | MESURÉ-FORK | Acte 2 complet ≈ **40 M gas ≈ 4,1 MON**. Mainnet minimal (hybride B) ≈ **8-9 M gas ≈ 0,9 MON**. |

---

## 1. Sources vérifiées pour ce document

| Élément | Où | Constat |
|---|---|---|
| FiatToken v2.2, EIP-3009 | [circlefin/stablecoin-evm `contracts/v2/EIP3009.sol`](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol) (master, lu le 27/09) | `_transferWithAuthorization(…, v, r, s)` → `abi.encodePacked(r, s, v)` → variante `bytes`. `_requireValidSignature` → `SignatureChecker.isValidSignatureNow(from, toTypedDataHash(domain, structHash), sig)`. `require(now > validAfter)`, `require(now < validBefore)`. Émet `AuthorizationUsed(authorizer, nonce)`. `receiveWithAuthorization` exige `to == msg.sender`. |
| SignatureChecker | [`contracts/util/SignatureChecker.sol`](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/util/SignatureChecker.sol) | `isContract(signer)` (EXTCODESIZE) : ecrecover sinon **`staticcall` à `isValidSignature` avec tout le gas disponible** (63/64), sans plafond. La fonction est `external` (bibliothèque liée). |
| EIP-2612 `permit(bytes)` de l'USDC | `contracts/v2/EIP2612.sol` | **passe aussi par `SignatureChecker`**. Un `isValidSignature` laxiste donnerait donc une allowance à n'importe qui. |
| Permit2 | [Uniswap/permit2 `SignatureVerification.sol`](https://github.com/Uniswap/permit2/blob/main/src/libraries/SignatureVerification.sol), `AllowanceTransfer.sol`, `PermitHash.sol` | ERC-1271 si `claimedSigner.code.length > 0`. `AllowanceTransfer.permit` passe aussi par `verify` : **même risque**. Stub `PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,`. |
| x402UptoPermit2Proxy | [x402-foundation/x402 `contracts/evm/src/x402UptoPermit2Proxy.sol`](https://github.com/x402-foundation/x402/blob/main/contracts/evm/src/x402UptoPermit2Proxy.sol) | `settle(permit, amount, owner, witness, signature)`, `msg.sender == witness.facilitator`, `WITNESS_TYPE_STRING = "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,address facilitator,uint256 validAfter)"`. |
| x402-rs (facilitator Monad) | [monad-developers/x402-rs](https://github.com/monad-developers/x402-rs) @ `a150a8a0` (2026-09-23) : `v1_eip155_exact/facilitator.rs`, `v2_eip155_exact/facilitator/eip3009.rs`, `v2_eip155_upto/facilitator/permit2.rs`, `chain/provider.rs` | Classement de la signature : une signature de 65 ou 64 octets qui retrouve `from` est traitée comme `EOA`, sinon comme `EIP1271`. `/verify` = contrôles hors chaîne (réseau, `to == payTo`, fenêtre de temps avec ≥ 6 s de marge, domaine, **solde**) puis `eth_call` de `transferWithAuthorization`. `/settle` = mêmes contrôles hors chaîne puis envoi **sans re-simulation**, avec une limite fixée par `estimate_gas`. Un revert « authorization is used » est classé erreur client ; tout autre revert devient `OnchainFailure`. |
| SDK TS | `@x402/evm` `src/signer.ts`, `exact/client/eip3009.ts` ; `@x402/core` `client/x402Client.ts` (main, 27/09) | `ClientEvmSigner = { address, signTypedData(...) }`. Le client met `from = signer.address`. **Un signer personnalisé dont `address` est le contrat payeur suffit** côté client. `onBeforePaymentCreation` → `{abort: true, reason}`. |
| AnchoredReputation | `contracts/src/AnchoredReputation.sol` (dépôt, 27/09) | `assess` est `view` ; statuts `OK=0, NO_CERT=1, STALE=2, TRANSFERRED=3, VETOED=4, REGISTRY_CHANGED=5` ; `isTrusted(agentId, setId, θ, ρN, ρD)` existe. |
| Facilitator `/supported` | `curl` 27/09 ~21:45 UTC | Identique à la vague 1 : `exact`, `upto`, `batch-settlement` sur 143 et 10143, signataire `0x7f6a…Db86`, `extensions: []`. |

---

## 2. Architecture (a) : `TrustGatedPayer` (ERC-1271)

### 2.1 Principe

Le payeur x402 est un **compte-contrat sans clé privée** qui détient les USDC. Un **opérateur** (la clé de l'agent) signe hors chaîne pour lui. C'est pourtant **le contrat qui décide**, dans `isValidSignature`, appelé par l'USDC (en `exact`) ou par Permit2 (en `upto`) **pendant la tx de règlement du facilitator**. Le contrat accepte seulement si :
1. le digest présenté correspond **exactement** à une structure qu'il sait reconstruire (transfert EIP-3009 ou Permit2 `upto` depuis `address(this)`) ;
2. le destinataire `to` est bien le wallet de l'`agentId` annoncé ;
3. ANCRE juge l'agent digne de confiance **à ce bloc** (`assess` avec veto, puis seuils θ et ρ du payeur) ;
4. le montant respecte le plafond par paiement ;
5. l'opérateur a signé ce digest.

Rien ne change dans x402, le facilitator ou l'USDC.

### 2.2 Qui signe quoi

| Acteur | Signe / envoie | Quand |
|---|---|---|
| **Owner** du payeur (EOA ou multisig de l'équipe) | tx `setOperator`, `setPolicy`, `pause`, `withdraw`, `approvePermit2` | configuration, hors du chemin de paiement |
| **Opérateur** (clé de l'agent client) | signature ECDSA du **digest EIP-712 exact** (celui de l'USDC ou de Permit2), emballée dans un `blob` | à chaque paiement, hors chaîne, sans gas |
| **Client x402** (SDK TS) | rien de plus : le `ClientEvmSigner` personnalisé a `address = payer` et `signTypedData` renvoie le `blob` | à chaque 402 |
| **Facilitator** | tx `transferWithAuthorization(…, bytes blob)` (exact) ou `x402UptoPermit2Proxy.settle(…)` (upto), gas à sa charge | `/settle` |
| **Payeur** | rien : il est appelé en STATICCALL et renvoie `0x1626ba7e` ou `0xffffffff` | pendant `/verify` (simulation) **et** `/settle` |

`blob = abi.encode(uint8 kind, bytes body, uint256 agentId, bytes opSig)`
- `kind = 1` : EIP-3009 `TransferWithAuthorization`, `body = (to, value, validAfter, validBefore, nonce)` ;
- `kind = 2` : Permit2 `upto`, `body = (cap, p2nonce, deadline, to, facilitator, validAfter)` ;
- `kind = 3` : `CancelAuthorization` (l'opérateur annule un nonce), **sans** contrôle ANCRE ;
- tout autre `kind` est refusé. **En particulier, aucun digest EIP-2612 `permit` ni Permit2 `PermitSingle`/`PermitBatch` n'est jamais validé** (§1 : ces chemins passent aussi par ERC-1271).

La longueur du blob (> 65 octets) garantit que x402-rs le classe `EIP1271` (DOC, `try_from_bytes`).

### 2.3 Interface et stockage

```solidity
interface ITrustGatedPayer /* is IERC1271 */ {
    enum Reason { OK, PAUSED, BAD_KIND, DIGEST_MISMATCH, WALLET_MISMATCH, OVER_LIMIT,
                  ANCRE_NOT_OK /* status != OK */, BELOW_THRESHOLD, BAD_OPERATOR_SIG }

    // ---- ERC-1271 (view, appelé en STATICCALL, ne revert jamais)
    function isValidSignature(bytes32 hash, bytes calldata blob) external view returns (bytes4);

    // ---- même logique, lisible : sert à l'écran et au client pour expliquer un refus
    function explain(bytes32 hash, bytes calldata blob)
        external view returns (Reason reason, AnchoredReputation.Assessment memory a, address to, uint256 value);

    // ---- trace on-chain facultative d'un refus (non-view, sans permission, payée par l'appelant)
    function reportRefusal(bytes32 hash, bytes calldata blob) external returns (Reason);

    // ---- administration (owner)
    function setOperator(address op, bool allowed) external;
    function setPolicy(bytes32 setId, uint256 theta, uint256 rhoN, uint256 rhoD, uint256 maxPerPayment) external;
    function setPaused(bool) external;
    function approvePermit2(uint256 amount) external;        // une fois, pour `upto`
    function withdraw(address token, address to, uint256 amount) external;

    event PolicySet(bytes32 indexed setId, uint256 theta, uint256 rhoN, uint256 rhoD, uint256 maxPerPayment);
    event OperatorSet(address indexed op, bool allowed);
    event RefusalReported(bytes32 indexed hash, uint256 indexed agentId, address indexed to,
                          Reason reason, uint8 status, bytes32 triggerTag, uint256 trustRobust, uint256 e);
}
```

Stockage (tout sur **une page MIP-8**, lu à froid pour 8 100 gas) :
- `immutable` : `usdc`, `permit2`, `uptoProxy`, `ancre` (AnchoredReputation), `identity` (registre 8004) ;
- slot 0 : `owner` et `paused` ;
- slots 1 à 3 : `setId`, `theta`, `rhoN | rhoD` ;
- slot 4 : `maxPerPayment` (unités USDC) ;
- `mapping(address => bool) operator` : une page de plus, ESTIMÉ 8,1 k à froid. Variante pour la démo : **un seul opérateur `immutable`** (0 lecture).

Ce qu'on **ne peut pas** faire dans ce chemin :
- **Budget par période** : il exigerait une écriture, or `isValidSignature` est `view`. Le plafond global, c'est le solde du payeur ; le plafond par paiement, c'est `maxPerPayment`.
- **Event de refus** : aucun, puisque STATICCALL (§2.6).

Contradiction à signaler : le brief 05 §3 dit que θ et ρ sont « engagés dans le `setId` ». **Ce n'est pas le cas dans le code** : `Policy` ne contient que `minAnchors`, `maxAge`, `minRefresh` et `slackRefresh`, et `isTrusted` prend θ, ρN et ρD en paramètres. Les seuils sont donc une **politique du consommateur**, stockée dans le payeur. À trancher pour la norme (chantier 08).

### 2.4 Pseudo-code

```solidity
// Esquisse de spec. La version minimale (sans agentId, avec un assess simulé) compile et passe en fork (§3).
function isValidSignature(bytes32 hash, bytes calldata blob) external view returns (bytes4) {
    (Reason r,,,) = _check(hash, blob);
    return r == Reason.OK ? bytes4(0x1626ba7e) : bytes4(0xffffffff);   // jamais de revert
}

function _check(bytes32 hash, bytes calldata blob)
    internal view returns (Reason, AnchoredReputation.Assessment memory a, address to, uint256 value)
{
    if (paused) return (Reason.PAUSED, a, to, value);
    (uint8 kind, bytes memory body, uint256 agentId, bytes memory opSig)
        = abi.decode(blob, (uint8, bytes, uint256, bytes));          // blob malformé => revert de decode ;
                                                                     // l'USDC le lit comme « invalide » (success = false)
    bytes32 digest;
    if (kind == 1) {                                                 // EIP-3009 exact
        (address to_, uint256 v, uint256 va, uint256 vb, bytes32 n) = abi.decode(body, (address,uint256,uint256,uint256,bytes32));
        (to, value) = (to_, v);
        digest = _typed(usdc.DOMAIN_SEPARATOR(),                     // domaine {name "USDC", version "2", chainId, usdc}
                 keccak256(abi.encode(TWA_TYPEHASH, address(this), to_, v, va, vb, n)));
    } else if (kind == 2) {                                          // Permit2 upto
        (uint256 cap, uint256 n, uint256 dl, address to_, address fac, uint256 va) = abi.decode(body, (uint256,uint256,uint256,address,address,uint256));
        (to, value) = (to_, cap);                                    // le plafond est ce qui est engagé
        bytes32 w = keccak256(abi.encode(WITNESS_TYPEHASH, to_, fac, va));
        digest = _typed(IPermit2(permit2).DOMAIN_SEPARATOR(),
                 keccak256(abi.encode(PWTF_UPTO_TYPEHASH, keccak256(abi.encode(TP_TYPEHASH, usdc, cap)), uptoProxy, n, dl, w)));
    } else if (kind == 3) {                                          // cancelAuthorization : opérateur seul
        bytes32 n = abi.decode(body, (bytes32));
        digest = _typed(usdc.DOMAIN_SEPARATOR(), keccak256(abi.encode(CANCEL_TYPEHASH, address(this), n)));
        if (digest != hash) return (Reason.DIGEST_MISMATCH, a, to, value);
        return (_isOperator(_recover(hash, opSig)) ? Reason.OK : Reason.BAD_OPERATOR_SIG, a, to, value);
    } else return (Reason.BAD_KIND, a, to, value);

    if (digest != hash)                      return (Reason.DIGEST_MISMATCH, a, to, value);
    if (value > maxPerPayment)               return (Reason.OVER_LIMIT, a, to, value);
    // lier le payTo à l'agent évalué : le serveur peut mentir sur agentId (x402.md §7.3)
    address w_ = _agentWallet(agentId);      // getAgentWallet, repli ownerOf si non défini ; staticcall plafonné
    if (w_ == address(0) || w_ != to)        return (Reason.WALLET_MISMATCH, a, to, value);
    a = ancre.assess(agentId, setId, true);  // view, ne revert jamais ; withVeto = true (D33)
    if (a.status != AnchoredReputation.Status.OK) return (Reason.ANCRE_NOT_OK, a, to, value);
    // mêmes seuils qu'isTrusted : OK seul ne suffit pas (inconnu => trust = 0 avec status OK)
    if (a.trustRobust < theta + a.e || rhoD * (a.distrust + a.e) > rhoN * (a.trustRobust - a.e))
                                             return (Reason.BELOW_THRESHOLD, a, to, value);
    if (!_isOperator(_recover(hash, opSig))) return (Reason.BAD_OPERATOR_SIG, a, to, value);  // ECDSA avec s bas (OZ)
    return (Reason.OK, a, to, value);
}

function reportRefusal(bytes32 hash, bytes calldata blob) external returns (Reason r) {
    AnchoredReputation.Assessment memory a; address to;
    (r, a, to,) = _check(hash, blob);
    if (r != Reason.OK) emit RefusalReported(hash, _agentIdOf(blob), to, r, uint8(a.status), a.triggerTag, a.trustRobust, a.e);
}
```

Points de conception :
- **Ordre des contrôles.** On fait d'abord les contrôles gratuits (digest, plafond), puis `getAgentWallet`, qui réchauffe le proxy d'identité pour l'`ownerOf` d'`assess`, puis `assess`, et enfin l'ecrecover (6 000 gas sur Monad).
- **Clé d'opérateur volée.** Le voleur ne peut payer **que des agents jugés fiables par ANCRE**, jusqu'à `maxPerPayment` par paiement et dans la limite du solde. C'est un argument de pitch : la garde protège aussi contre la compromission de l'agent lui-même.
- **Wallet partagé (D20).** Payer le wallet d'une plateforme au nom d'un bon agent, c'est payer la plateforme. C'est assumé et documenté.
- **Anti-rejeu.** Il est assuré par le nonce EIP-3009 (`authorizationState`) ou le nonce Permit2, pas par le payeur. Le temps reste `validBefore` en secondes, imposé par l'USDC. Aucune époque du payeur n'utilise `block.timestamp`.
- **`upto`.** L'`isValidSignature` de Permit2 est appelé au `settle`. Le contrôle ANCRE joue donc **au règlement**, avec le plafond comme montant engagé. L'idée d'un plafond dimensionné par `trustRobust` reste **hors spec** (brief 05 §4, aucune unité commune).

### 2.5 Comment l'opérateur autorise un paiement (flux complet, `exact`)

1. `GET /ressource` → 402, `accepts[i] = {scheme: "exact", network, amount, asset: USDC, payTo, extra: {name: "USDC", version: "2"}}`.
2. Le client résout `payTo → agentId` : index du chantier 03, ou champ d'extension du serveur (non standard). Hors chaîne, il appelle `ancre.assess` puis `payer.explain` (§2.7, garde (b) en amont). En cas de refus, il abandonne sans rien signer.
3. Le `ClientEvmSigner` personnalisé (`address = payer`) reçoit `signTypedData(TransferWithAuthorization{from: payer, …})`. Il calcule le digest avec viem `hashTypedData`, le signe avec la clé de l'opérateur, puis renvoie `blob = abi.encode(1, body, agentId, opSig)`.
4. Le SDK envoie `PAYMENT-SIGNATURE`. Le serveur appelle `/verify` : x402-rs contrôle le solde **du payeur** et simule, ce qui déclenche **le contrôle ANCRE n° 1**.
5. Le handler s'exécute, puis le serveur appelle `/settle`. x402-rs estime le gas, ce qui déclenche **le contrôle ANCRE n° 2** : si un veto est tombé entre-temps, l'estimation échoue et rien n'est diffusé. Sinon la tx part et l'USDC rappelle `isValidSignature`, c'est le **contrôle n° 3**, dans le bloc d'inclusion.
6. `PAYMENT-RESPONSE` contient le hash de tx. `payer` = l'adresse du contrat, ce qui colle au motif consommateur-ancre (D13) : c'est le même contrat qui peut ensuite poster l'avis 8004.

Point **NON VÉRIFIÉ** et important pour la scène du disjoncteur : dans le flux `authorization`, le handler tourne **avant** `/settle`. Si le règlement échoue, le middleware `@x402/express` retient-il la réponse ? S'il ne la retient pas, le fournisseur a servi gratuitement. C'est à lire dans le middleware, ou à tester (T1-10).

### 2.6 Reconstituer les refus pour l'écran (chantier 07)

Le chemin de refus n'émet rien. Le facilitator répond au mieux **HTTP 500 `unexpected_error`**, avec `invalidReasonDetails` ≈ `execution reverted: FiatTokenV2: invalid signature` (vague 1, MESURÉ). Et au règlement, **aucune tx n'est envoyée**. On reconstitue donc le refus :

| Source | Contenu | Coût |
|---|---|---|
| **Journal du client de démo** (source primaire) | pour chaque tentative : `hash`, `blob`, `payTo`, `agentId`, bloc de décision, réponse brute du facilitator | 0 |
| **`explain(hash, blob)` en `eth_call`** au bloc de la tentative (tag `finalized`, ou numéro de bloc ; état historique ≈ 40 000 blocs sur les RPC standard, vague 1 §0.8) | `Reason` + `Assessment` complet (`status`, `trustRobust`, `e`, `vetoCount`, `triggerTag`) | 0 |
| **Events USDC** `AuthorizationUsed(payer, nonce)` + `Transfer(payer → to)` via `monadLogs` | paiements acceptés, jointure par `nonce` avec le journal | 0 |
| **`reportRefusal`** (facultatif) | event `RefusalReported` **on-chain**, visible dans l'explorer : preuve publique « le contrat a refusé » pour le critère *Monad Integration* | ≈ assess + 40 k ≈ **120-230 k gas** (ESTIMÉ), payés par nous |
| **Tx de règlement forcée** (facultatif, une seule fois) : notre propre script appelle `transferWithAuthorization` avec une gas limit fixée à la main (sans estimation) | tx **revertée on-chain**, avec la raison `FiatTokenV2: invalid signature` dans l'explorer | on paie la gas limit, ≈ 0,4 M ≈ 0,04 MON |

La règle d'affichage (brief 07, vague 1 §A2) ne change pas : verdict à `Voted`, comptage à `Finalized`, déduplication par `txHash:logIndex`.

### 2.7 Variante « pré-autorisation » (mode B, non retenue par défaut)

L'opérateur envoie une tx `authorize(digest, agentId, to, value, expiryBlock)`. Elle exécute `_check` en non-view, émet `PaymentAuthorized` ou `PaymentRefused`, et stocke `approved[digest] = expiryBlock` (en **`block.number`**). `isValidSignature` exige alors `approved[digest] ≥ block.number` **et** refait le contrôle ANCRE : le disjoncteur est préservé.
- **Gain** : des events natifs pour l'écran et un vrai budget par période, puisqu'on peut écrire.
- **Perte** : une tx payée par paiement, ≈ 160-270 k gas ≈ 0,016-0,028 MON (ESTIMÉ), et le paiement n'est plus « sans gas » pour le client.

À garder en réserve si l'écran a besoin d'events on-chain pour **toutes** les tentatives.

---

## 3. Tests en fork (faits et à faire)

### 3.1 Déjà passés (MESURÉ-FORK, 27/09, Foundry 1.8.3, `network = "monad"`, fork testnet **et** mainnet, résultats identiques)

Le contrat testé est `GatedPayer` minimal : `kind` 1 et 2, sans `agentId`, avec un `MockAssessor` qui brûle un gas réglable et renvoie un statut par destinataire. L'USDC est alimenté par `deal`, le facilitator simulé par `vm.prank(0x7f6a…Db86)`.

| Test | Vérifie | Résultat |
|---|---|---|
| `test_exact_ok_and_refused` | exact, variante `bytes` : le fournisseur OK est payé ; la ferme est refusée (revert, solde inchangé) | ✅ |
| `test_breaker_between_verify_and_settle` | simulation OK, puis veto, puis même autorisation au règlement → `FiatTokenV2: invalid signature` | ✅ |
| `test_upto_permit2` | `approve(Permit2)` par le payeur, `x402UptoPermit2Proxy.settle` d'un montant de 1 234 sous un plafond de 5 000 → payé ; après veto, nouveau nonce → revert | ✅ |
| `test_vrs_variant_also_goes_through_1271_for_7702` | EOA déléguée 7702 vers un délégué qui refuse : la variante `(v,r,s)` **revert** ; puis `USDC.transfer` direct par la clé → passe | ✅ (§0.2) |
| `test_exact_gas_with_assess_cost` | gas facturé du règlement | voir ci-dessous |

Gas facturé d'un règlement (tx complète : 21 000 + calldata + exécution ; `vm.lastCallGas`) :

| Cas | Gas | Statut |
|---|---|---|
| EOA, `(v,r,s)`, destinataire déjà crédité | **144 377** | MESURÉ-FORK |
| payeur 1271, contrôle nul, destinataire à solde 0 (SSTORE 0→x) | 198 751 | MESURÉ-FORK |
| payeur 1271 + brûleur de 78 000 (≈ `assess` sans veto, k = 3 : 77 926) | **251 700** | MESURÉ-FORK |
| payeur 1271 + brûleur de 190 000 (≈ `assess` avec veto, k = 8 : 189 931) | **363 735** | MESURÉ-FORK |
| surcoût du payeur, hors `assess` (destinataire déjà crédité) | ≈ 29 k | CALCULÉ (251 700 − 78 000 − 144 377) |
| `upto` Permit2, contrôle nul | 239 104 | MESURÉ-FORK |
| + `getAgentWallet` (absent de l'esquisse) | + 15-30 k | ESTIMÉ |

Le brûleur comprend un accès de compte froid (10 100), et la mesure GAS.md d'`assess` aussi. Les chiffres « avec assess » sont donc des **majorants d'environ 10 k**. En MON à 102 gwei, **pour le facilitator** : EOA 0,0147 ; gardé 0,026 à 0,037 (CALCULÉ).

### 3.2 À ajouter avant le test réel (chantier 05, `contracts/test/TrustGatedPayer.t.sol`)

1. **Sécurité des digests** (bloquant) : le payeur refuse un digest USDC `permit` (EIP-2612, variante `bytes`), un digest Permit2 `PermitSingle` et un `kind` inconnu. On vérifie que `USDC.permit(payer, attacker, …, blob)` **revert**.
2. `WALLET_MISMATCH` : `agentId` d'un agent fiable, mais `payTo` différent de son wallet.
3. **Inconnu** : agent absent de la table (`status = OK`, `trust = 0`) → `BELOW_THRESHOLD`. C'est le test de non-régression de §0.3.
4. `NO_CERT`, `STALE` (avec `vm.roll` au-delà de `maxAge`), `TRANSFERRED`, `REGISTRY_CHANGED` → `ANCRE_NOT_OK`.
5. `OVER_LIMIT`, `BAD_OPERATOR_SIG`, signature à `s` haut, rejeu du même nonce (`authorization is used`, classé erreur client par x402-rs).
6. **Avec le vrai `AnchoredReputation`** déployé dans le fork sur les **registres testnet** : `register`, `giveFeedback` d'ancres dans le fork, certificat produit par le solveur (chantier 04), puis les scènes 1 à 5 du brief 06. Le gas d'`isValidSignature` se mesure avec le vrai `assess` (via `Consumer`, AM-R5.1).
7. **Estimation comme le facilitator** : `anvil --fork-url https://testnet-rpc.monad.xyz --chain-id 10143`, puis `cast estimate` du `transferWithAuthorization(bytes)`. On vérifie que l'estimation passe malgré les appels plafonnés à 120 k (règle des 63/64) et qu'elle **échoue** après un veto.
8. **De bout en bout sans réseau** : un facilitator local (`x402Facilitator` de `@x402/core` + `@x402/evm`, ou x402-rs compilé) pointé sur l'anvil. Serveur Express + client avec le signer personnalisé. On capture la réponse HTTP d'un refus.

### 3.3 Mesures d'unité prises pour le budget (MESURÉ-FORK, identiques sur testnet et mainnet)

| Opération | Gas facturé |
|---|---|
| `IdentityRegistry.register(string uri)` (URI de 58 octets) | 221 727 |
| `register()` | 144 035 |
| `giveFeedback`, premier avis d'un couple (client, agent) | 271 387 |
| `giveFeedback`, avis suivant du même couple | 178 219 |
| `giveFeedback`, nouveau client sur le même agent | 254 387 |
| déploiement d'`AnchoredReputation` (appel à une fabrique : code déposé ≈ 200 gas/octet × 21 815) | 4 370 904 |
| `registerAnchorSet` (k = 3, 2 tags) | 385 813 |
| `USDC.transfer` vers une adresse neuve | 99 322 |

Sélecteurs vérifiés dans le bytecode des implémentations (MESURÉ, `cast code` + `cast sig`) : `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` `0x3c036a7e`, `revokeFeedback(uint256,uint64)` `0x4ab3ca99`, `register()` `0x1aa3a008`, `register(string)` `0xf2c298be`, `setAgentWallet(uint256,address,uint256,bytes)` `0x2d1ef5ae`.

---

## 4. Test réel sur le testnet (à valider par Hugo avant exécution)

Le but est de lever les trois inconnues qu'un fork ne peut pas lever, parce qu'elles tiennent au **binaire déployé** du facilitator : (i) accepte-t-il un payeur 1271 de bout en bout ? (ii) quelle gas limit fixe-t-il, et y a-t-il un plafond ? (iii) quelle réponse HTTP renvoie-t-il sur un refus au `/verify` et au `/settle` ?

**Comptes** :
- **D**, EOA de déploiement et d'opérateur, en keystore `cast wallet import`. Besoin : ≈ 0,5 MON testnet (faucet) et 1 USDC testnet ([faucet.circle.com](https://faucet.circle.com)).
- **P**, EOA fournisseur (`payTo`) : rien à financer.
- Le facilitator paie le gas des règlements. Son signataire testnet a 4 978 MON (vague 1).

**Transactions**, avec gas limits explicites (on paie la limite sur Monad) :

| # | Tx (émetteur → cible) | Gas (statut) | Limite à coder |
|---|---|---|---|
| T1-1 | D déploie `MockAssessor` | ≈ 0,15 M (ESTIMÉ) | 200 k |
| T1-2 | D déploie `TrustGatedPayer` (opérateur = D, `maxPerPayment` = 0,01 USDC, `ancre` = mock) | ≈ 0,8-1,5 M (ESTIMÉ, esquisse 3 165 o) | estimation + 7,5 % |
| T1-3 | D → USDC `transfer(payer, 0,1 USDC)` | ≈ 99 k (MESURÉ-FORK) | 110 k |
| — | **POST `/verify`** exact, P autorisé → attendu `isValid: true, payer = payer` | hors chaîne | — |
| T1-4 | **POST `/settle`** → tx **du facilitator** | ≈ 175-200 k (MESURÉ-FORK) | lire `gasLimit` et `gasUsed` du reçu |
| T1-5 | D → mock `setBurn(190 000)` | ≈ 45 k (ESTIMÉ) | 60 k |
| T1-6 | `/verify` + `/settle` avec contrôle à 190 k → tx du facilitator | ≈ 364 k (MESURÉ-FORK) | lire la limite. **C'est la réponse à la question du plafond** |
| T1-7 | D → mock `setBurn(2 000 000)`, puis `/verify` + `/settle` : sonde d'un éventuel plafond (≈ 0,2 MON payé par le facilitator, rester à 2 M) | 45 k + ≈ 2,2 M côté facilitator | — |
| T1-8 | D → mock `set(P, 4)`, puis `/verify` → attendu **HTTP 500**, `invalidReasonDetails` contenant `invalid signature`, aucune tx | 45 k | — |
| T1-9 | **Disjoncteur** : mock remis à OK, `/verify` OK, puis D → `set(P, 4)`, puis `/settle` → attendu : échec, **aucune tx diffusée** (vérifier le nonce du signataire `0x7f6a…` avant et après) | 2 × 45 k | — |
| T1-10 | Même scène via un **serveur Express** local (`@x402/express` ≥ 2.12) : le client reçoit-il la ressource quand le `/settle` échoue ? | hors chaîne | — |
| T1-11 | D → payeur `approvePermit2(max)`, puis `/verify` + `/settle` **upto** (plafond 0,005, règlement 0,001) | ≈ 50 k + ≈ 240 k côté facilitator | 70 k |
| T1-12 | (facultatif) D → une tx de règlement forcée avec P refusé et une gas limit de 400 k → tx revertée visible dans l'explorer | 400 k payés | 400 k |

**Coût pour nous** ≈ 1,5-2,2 M gas ≈ **0,15-0,23 MON testnet** (ESTIMÉ à 102 gwei), plus 0,1 USDC testnet. **Coût pour le facilitator** ≈ 3,3 M gas ≈ 0,34 MON testnet. Durée : ≈ 1 h avec les scripts du chantier 05.

**Critères de passage** : T1-4 et T1-11 réussis, et T1-6 réglé avec une limite ≥ 364 k. Si T1-6 échoue alors que le fork passe, **l'architecture (a) tombe sur ce facilitator**, et on se replie sur (b) ou sur notre propre facilitator.

**Phase T2**, à relier aux chantiers 02, 04 et 06 : le même payeur branché sur le **vrai `AnchoredReputation`** déployé sur le testnet (constructeur `(0x8004A818…BD9e, 0x8004B663…8713)`), avec un ensemble d'ancres k = 3, 1 fournisseur et 2 avis. Le budget correspond à la colonne « mainnet minimal » du §5.3, ≈ 0,9 MON testnet.

---

## 5. Réseau de la démo : D19 revue

### 5.1 Faits (MESURÉ le 27/09, ~21:40 UTC)

| | Testnet 10143 | Mainnet 143 |
|---|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| `getVersion()` | "2.0.0" / "2.0.0" | "2.0.0" / "2.0.0" |
| Implémentation (slot ERC-1967) | `0x7274e874…9c02` / `0x16e0fa7f…da34` | **mêmes adresses** |
| keccak du bytecode des implémentations | `0xa5f9624e…c16f` / `0x38602de9…d00b` | **identiques** |
| `owner()` (clé d'upgrade, AM-3.5) | `0x5472…2603` | **la même EOA** |
| Reputation → `getIdentityRegistry()` | `0x8004A818…` (cohérent) | — |
| Agents | **1 941** (`ownerOf(1941)` existe, `ownerOf(1942)` → `ERC721NonexistentToken` ; ids supposés contigus) ; 1 849 indexés par 8004scan | 10 171 au 21/09 (CLAUDE.md) |
| Avis | **1 530** (8004scan `total`) ; dernier au bloc 66 187 419, soit ≈ 48 000 blocs ≈ 4 h avant la mesure | 9 188 ; **dormant depuis le 10/09** (AM-3.9) |
| Facilitator | `exact`, `upto`, `batch-settlement` | idem |
| USDC | `0x534b…43A3` (FiatToken v2.2, comportement 1271 identique en fork) | `0x7547…b603` |
| Gas price | 102 gwei | 102 gwei |

→ **Aucune différence technique** entre les deux réseaux pour ANCRE. Documents à corriger (je ne les modifie pas) : CLAUDE.md §3 et §7, `monad-dev-et-soumission.md` §A4 et §0.6, brief 06 §1 et §3, brief README l. 67, CR D19.

### 5.2 Critères

| Critère | Testnet | Mainnet |
|---|---|---|
| Coût monétaire | nul, mais **plafonné par le faucet** : montant et cooldown NON TROUVÉS. ≈ 4 MON testnet par exécution complète de l'acte 2 : c'est le vrai goulot si l'on répète | ≈ 4-5 MON de frais par exécution complète, soit **≈ 0,15 $** au cours relevé (CoinGecko, 0,0277 $/MON, 27/09, SECONDAIRE), plus du capital immobilisé récupérable |
| « Monad Integration » (20 %, Rules §5.2, SECONDAIRE) | les Rules §9.2 acceptent le testnet (SECONDAIRE) ; la page officielle n'exige pas le mainnet (AM-5.7) | des tx et des adresses sur le vrai réseau, avec de vrais USDC : c'est plus crédible, mais **aucun texte ne le note explicitement** |
| Cohérence narrative | l'acte 1 (ferme Eve, mainnet) et l'acte 2 vivent dans **deux états** : il faut l'expliquer en une phrase | un seul registre, un seul contrat ANCRE, qui certifie à la fois la vraie ferme et notre démo |
| Pollution du registre public | aucune pour le mainnet (le testnet est un bac à sable) | 26 agents et ≈ 80 avis « demo », **permanents** (on peut révoquer les avis, pas les agents). Ils bruitent le jeu de données dont ColinkaMir et les autres dépendent. Mauvaise image pour un projet anti-ferme, même avec l'étiquette « demo » |
| Répétabilité | autant de fois que le faucet le permet | une seule fois, idéalement |
| Risque de dernière minute | faible | USDC mainnet à obtenir (pont ou CEX : NON VÉRIFIÉ) ; une erreur de script coûte peu, mais laisse des traces publiques |
| Divulgation (D29) | neutre | une ferme de démo sur le mainnet avant d'avoir prévenu les auteurs d'ERC-8004 brouille le message |

### 5.3 Budgets chiffrés

Hypothèses de l'acte 2 complet (brief 06) :
- **Agents** (26) : 5 fournisseurs, 20 agents de ferme et 1 cible.
- **Avis** (80) : 3 ancres × 5 fournisseurs = 15 ; ferme 20 × 3 = 60 ; ancre compromise → 3 ; 1 slash ; 1 « +1 » d'un autre noteur.
- **Certificats** : 1 premier certificat (n ≈ 30, E ≈ 80, k = 3), puis 4 recertifications.
- **Paiements** : 10, réglés par le facilitator.

Le nombre d'opérations est ESTIMÉ ; les coûts unitaires sont MESURÉS (GAS.md et §3.3).

| Poste | Unité (statut) | Acte 2 complet | Mainnet minimal (hybride B) |
|---|---|---|---|
| Déploiement d'ANCRE | 4,37 M (MESURÉ-FORK) | 4,37 M | 4,37 M |
| `registerAnchorSet` | 0,39 M (MESURÉ-FORK) | 2 ensembles : 0,77 M | 1 : 0,39 M |
| `register(uri)` | 0,22 M (MESURÉ-FORK) | 26 : 5,76 M | 1 fournisseur : 0,22 M |
| `giveFeedback` | 0,27 M (MESURÉ-FORK) | 80 : 21,7 M | 2 ancres + 1 slash : 0,72 M |
| `addNodes` + premier certificat | 29 k/nœud + 0,8-1,3 M (MESURÉ, GAS.md) | ≈ 2,1 M | graphe réel ≤ 5 nœuds + le nôtre : ≈ 0,5-0,9 M |
| Recertifications | 0,14-0,36 M (MESURÉ, GAS.md, E = 10 à 100) | 4 : ≈ 1,45 M | 1 après le slash : ≈ 0,15 M |
| Payeur : déploiement, USDC, `approvePermit2` | ≈ 1,0-1,5 M (ESTIMÉ) + 0,1 M (MESURÉ-FORK) + 0,05 M | ≈ 1,4 M | ≈ 1,4 M |
| `reportRefusal` / tx forcée (preuves on-chain) | 0,2-0,4 M (ESTIMÉ) | 2 : 0,8 M | 2 : 0,6 M |
| **Total pour nous** | | **≈ 38-40 M gas ≈ 3,9-4,1 MON** (CALCULÉ à 102 gwei) ; avec 30 % de marge ≈ **5,3 MON** | **≈ 8,4-8,8 M gas ≈ 0,86-0,90 MON** ; avec marge ≈ **1,1 MON** |
| Capital immobilisé | ≈ 0,1-0,2 MON par compte émetteur, pour couvrir la gas limit en vol (règle de réserve, brief 06 §2) | ≈ 30 comptes → **≈ 3-6 MON**, récupérables (≈ 21 k par balayage) (ESTIMÉ) | 4 comptes (D + 3 ancres) → < 1 MON |
| Paiements (payés par le facilitator) | 0,25-0,36 M chacun (MESURÉ-FORK) | 10 → ≈ 3 M ≈ 0,3 MON **pour eux** | 2-3 → < 0,1 MON pour eux |
| USDC | — | < 0,1 USDC | < 0,05 USDC |
| Nettoyage | `revokeFeedback` NON MESURÉ, ESTIMÉ ≈ 60-80 k | 80 → ≈ 5-6 M ≈ 0,6 MON, laisse une trace de révocation | — |

### 5.4 Options et recommandation

- **Option T (tout sur le testnet).** C'est techniquement équivalent, gratuit, et ça ne pollue rien. On perd le « vrai réseau » et l'état unique avec l'acte 1. Le seul coût réel est l'accès au MON testnet pour les répétitions.
- **Option M (acte 2 complet sur le mainnet, D19 actuelle).** Cela coûte ≈ 5 MON, une somme négligeable. Mais on laisse une ferme de démo permanente dans le registre public qu'ANCRE prétend assainir, et la répétabilité est faible. La prémisse technique qui la justifiait a disparu.
- **Option H (hybride « répétitions testnet, une exécution mainnet »).**
  - Déroulé : répétitions en fork anvil (coût nul, illimitées), une répétition générale sur le testnet (≈ 4 MON testnet), puis **l'acte 2 complet une seule fois sur le mainnet** (≈ 5 MON), filmé, avec l'état exporté (D28).
  - Bilan : la crédibilité est maximale, mais la pollution reste celle de l'option M.
- **Option H-B (recommandée, confiance 0,7).**
  1. Répétitions en fork anvil (0 MON) et test T1 sur le testnet (≈ 0,2 MON testnet).
  2. **L'acte 2 complet (ferme scriptée, ancre compromise, anti-effacement) sur le testnet**, rejouable. C'est là que vivent les 20 agents de ferme.
  3. **Sur le mainnet, une seule exécution minimale** (≈ 1,1 MON avec marge) :
     - ANCRE est déployé et certifie **le vrai graphe** (acte 1 en direct, pas seulement en fork) ;
     - notre payeur **refuse de payer Eve-8004 (#182)** sur le vrai registre, preuve on-chain par `reportRefusal` ou par une tx forcée ;
     - il **paie** un unique fournisseur « demo » noté par nos deux ancres (motif consommateur-ancre, D13) ;
     - puis **le disjoncteur** : 1 slash, puis un refus au bloc suivant.
  - Bilan : *Monad Integration* est servi par de vraies adresses et de vraies tx sur 143, face à la vraie ferme ; la pollution se limite à 1 agent et 3 avis ; la ferme de démo reste sur le testnet, où elle ne trompe personne.
  - Ce qu'on perd : la scène « ferme Sybil scriptée » n'est pas sur le mainnet. Le pitch le dit en une phrase : « la vraie ferme est sur le mainnet, et ANCRE l'y bloque ; notre ferme de test est sur le testnet, par hygiène ».

**Proposition d'amendement de D19** (à valider par Hugo, **non reportée** dans le CR) : *« Acte 1 et scène du disjoncteur sur le mainnet, contre la vraie ferme (déploiement minimal ≈ 1 MON) ; acte 2 scripté (ferme, ancre compromise, anti-effacement) sur le testnet, dont les registres ERC-8004 v2.0.0 ont le même bytecode ; répétitions en fork. »* Cette version annule la prémisse « registres absents du testnet » de D19 et du brief 06 §3.

---

## 6. Plan (b) : garde côté client (repli)

C'est la voie à prendre si T1-4 ou T1-6 échoue, ou comme intégration « plugin wallet » (bounty MetaMask, D38). Le **payeur reste une EOA** (ou un compte 7702). C'est **l'agent** qui refuse, pas un contrat.

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";   // @x402/evm >= 2.12.0 (proxy upto), 2.27.0 au 22/09

const client = new x402Client().register("eip155:*", new ExactEvmScheme(account));
client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
  const agentId = await resolveAgentId(r.payTo);                       // index du chantier 03
  if (agentId === undefined) return { abort: true, reason: "ANCRE: payTo is not an ERC-8004 agent wallet" };
  const a = await pub.readContract({ address: ANCRE, abi, functionName: "assess",
                                     args: [agentId, SET_ID, true], blockTag: "latest" });
  if (a.status !== 0) return { abort: true, reason: `ANCRE status ${a.status} (${hexToString(a.triggerTag)})` };
  if (a.trustRobust < THETA + a.e || RHO_D * (a.distrust + a.e) > RHO_N * (a.trustRobust - a.e))
    return { abort: true, reason: `ANCRE below threshold (t=${a.trustRobust}, e=${a.e})` };
  log({ payTo: r.payTo, agentId, block: await pub.getBlockNumber(), a });     // alimente l'écran
});
const pay = wrapFetchWithPayment(fetch, client);
```

| | (a) payeur 1271 | (b) crochet client |
|---|---|---|
| Qui refuse | un contrat, au règlement, dans la tx du facilitator | le processus de l'agent, avant de signer |
| Contournable par la clé | non (pas de clé sur le payeur) ; une clé d'opérateur volée ne paie que des agents fiables | oui : un agent compromis signe quand même |
| Disjoncteur entre verify et settle | oui | non : la décision est prise une fois, avant la signature |
| Raison du refus | reconstituée (`explain`, §2.6) | directe (`reason` de l'abort) |
| Gas | 0,25-0,36 M par règlement (facilitator) | 0 (un `eth_call`) ; 0,144 M par règlement |
| Dépendances | facilitator qui accepte les payeurs 1271 (T1) | aucune |
| Pitch | « un contrat refuse de payer » | « un wallet consulte ANCRE avant de payer » (bounty MetaMask) |

Recommandation : on **fait les deux**, sur le même `assess` et avec les mêmes seuils. (b) coûte une demi-journée et sert aussi de **premier filtre** en (a) : le client ne signe pas ce que le contrat refusera, ce qui évite les 500 opaques. Et la garde de (a) reste celle qui compte pour le pitch.

---

## 7. Questions ouvertes pour Hugo

1. **Valider le test T1** (§4) : ≈ 0,2 MON testnet, plus ≈ 0,34 MON testnet payés par le facilitator Monad. Faut-il prévenir l'équipe Monad (molandak) avant de sonder un plafond à 2 M (T1-7) ?
2. **Réseau** : option H-B (recommandée), H ou M ? D19 doit être amendée dans tous les cas, puisque sa prémisse est fausse.
3. **Seuils θ et ρ** : politique du consommateur (le code actuel) ou engagement dans le `setId` (le brief 05) ? Cela touche la norme (chantier 08).
4. **Mode B** (pré-autorisation on-chain, events natifs) : utile seulement si l'écran veut une trace on-chain de chaque tentative. Par défaut : non.
5. **Serveur de démo** : lire ou tester le comportement de `@x402/express` quand le `/settle` échoue après exécution du handler (T1-10). Il conditionne le réalisme de la scène du disjoncteur.

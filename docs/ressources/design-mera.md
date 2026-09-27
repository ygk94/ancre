# Mera dans ANCRE : choix de conception (vague 2)

> Rédigé le **2026-09-27** pour le bounty *Monad Foundation, Mera: One Passkey, Many Keys* (2 500 $, D38).
> Entrées : `docs/ressources/mera.md` (vague 1), fiche officielle dans `docs/conseil/bounties-sponsors.md`, D8, D9, D13, D21/D33, D27, AM-2.13, `docs/erc/anchored-reputation.md` §2, chantier 06.
> Étiquettes : **DOC** = doc officielle ou code source lu (paquet npm `@category-labs/mera@0.2.0`, `@noble/curves@2.2.0`, `@noble/hashes@2.2.0`, dépôt `aliveevie/mandate`) · **PROPOSÉ** = notre conception, rien n'est codé ni testé · **ESTIMÉ** = chiffre non mesuré.

## 0. En bref

- **Retenu (PROPOSÉ)** : **« la clé suivante naît sur l'autre appareil »**. Chaque époque de clé d'une ancre a son propre sel PRF. L'appareil A engage on-chain l'empreinte de la clé n+1 (pré-rotation, D9). L'appareil B, avec le seul passkey, fait naître cette clé, et c'est **le contrat** qui vérifie qu'elle est la bonne, en acceptant la rotation. Le test multi-appareils est arbitré par la chaîne, pas par l'œil du jury.
- La scène qui se *sent* : une clé d'ancre volée pose un veto sur un fournisseur honnête, le router refuse de payer. Rotation depuis l'iPhone. **Au bloc suivant**, le veto volé ne compte plus (D33 lit le dernier avis de la **clé courante**) et le paiement repasse, sans recertification.
- **Secours (PROPOSÉ)** : **dossier de veto scellé**. La preuve derrière un `slash` est chiffrée dans un coffre Mera et placée dans `feedbackURI` ; `feedbackHash` engage le clair ; l'ancre rouvre le dossier sur un 2e appareil et le révèle sur demande (recours, scène 6).
- Les deux se combinent sur **un seul passkey** : dérivation (clés d'époque) et chiffrement (dossiers) côte à côte, deux familles de sels cloisonnées. C'est exactement le critère « chiffrement et dérivation employés à bon escient ».
- **Prix à payer** : le retenu **rouvre la coupe AM-2.13** (« pré-rotation d'`anchorId` : non pour la démo »). L'intégration Mera tient en ≤ 1 jour (ESTIMÉ), mais il faut ~0,5 jour de plus côté contrat (chantier 02). **Décision de Hugo requise.**

## 1. Concurrent à éviter : aliveevie/mandate (DOC, lu le 27/09)

- Dépôt créé le 12/09/2026, poussé le 27/09, 0 ★. Fichiers `sdk/src/prf.ts`, `sdk/src/prf-vault.ts`, PR #8 fusionnée le 19/09.
- Deux espaces de noms :
  - `mandate:policy:<principal>:<nonce>` → HKDF → AES-256-GCM, politique de l'agent chiffrée ; `policyHash` on-chain engage le chiffré ;
  - `mandate:agent-id:<n>` → HKDF → secp256k1, adresse qui **possède** l'identité ERC-8004 de l'agent n.
- Test « fresh device » par authenticator virtuel WebAuthn dans un e2e Chrome (`pnpm --filter web e2e`). Réputation écrite par un workflow Chainlink CRE.
- **Ce que Mandate ne fait pas** : ni rotation, ni pré-rotation, ni clé future engagée, ni vérification on-chain de la reconstruction, ni lien avec le veto. Tout ce qui est « passkey → identité d'agent » ou « politique chiffrée » est **déjà pris** : on n'en fait pas notre sujet.

## 2. Concepts évalués

Notes de 1 à 5 (5 = meilleur ; pour le risque « wallet déguisé », 5 = risque le plus élevé). Faisabilité = partie Mera en ≤ 1 jour.

| # | Concept | Nouveauté | Intérêt pour ANCRE | Originalité | Faisabilité ≤ 1 j | Risque wallet | Verdict |
|---|---|---|---|---|---|---|---|
| A | **Clés d'ancre pré-rotées par époque** : un sel par époque, la clé n+1 engagée par A et née sur B, acceptée par le contrat. Récupère d'une clé volée (veto, D33) | 5 | 5 (D9, D33, scène 3 « ancre compromise », que D31 interdit de couper) | 5 (motif KERI + PRF : aucun projet repéré) | 3 (Mera 0,5 j ; contrat +0,5 j) | 3 (la clé émet ensuite des avis, par transaction) | **RETENU** |
| B | **Dossier de veto scellé** : preuve du `slash` chiffrée (coffre Mera) dans `feedbackURI`, `feedbackHash` = engagement du clair, révélation sur demande | 3 | 4 (scènes 4 et 6, recours) | 3 (preuve chiffrée : déjà vu ailleurs, pas sur 8004) | 5 (API de coffre telle quelle) | 1 | **SECOURS** |
| C | Politique privée du lecteur (ensembles suivis, seuils du disjoncteur) chiffrée et rouverte sur B | 2 | 2 (le `setId` et ses ancres sont **publics par construction**, D1/D12 ; seuls les seuils du router seraient privés) | 1 (c'est la politique chiffrée de Mandate) | 5 | 1 | écarté |
| D | Commit-reveal des évaluations d'ancre, nonce dérivé par tour (sans secret stocké), contre la copie entre ancres qui ruine l'indépendance supposée par m = 2 (D8) | 4 | 3 (vrai problème, mais le veto doit être **immédiat**, D33, et 8004 publie les avis en clair) | 4 | 2 (nouveau contrat de dépôt, deux phases) | 2 | écarté (idée à noter pour la norme) |
| E | Journal d'audit chiffré de l'ancre (pourquoi j'ai noté, quand) | 2 | 2 (invisible dans la démo) | 2 | 5 | 1 | écarté (gadget) |
| F | Clés de capacité par ensemble (clé de soumetteur `Submitter-attested`, D32, un sel par `setId`) | 3 | 3 | 3 | 4 | 5 (la clé ne fait que soumettre des transactions) | écarté |
| G | Mémoire du consommateur-ancre (D13) : reçus x402 et constats de livraison chiffrés, rouverts sur B pour noter après coup | 2 | 3 | 1 (c'est la piste officielle « mémoire d'agent ») | 4 | 1 | écarté |
| H | Identités non reliables entre contextes | — | **négatif** | — | — | — | **exclu** : c'est la fabrique de Sybil qu'ANCRE combat |

## 3. Concept retenu : « la clé suivante naît sur l'autre appareil » (PROPOSÉ)

### 3.1 Idée

La norme (ERC §2) prévoit déjà la pré-rotation : `anchorId = keccak256(abi.encode(key0, nextKeyDigest1))`, et `nextKeyDigest(n) = keccak256(abi.encode(key_n, salt_n))`. **Seule la clé n+1 peut faire tourner l'ancre.** Le problème pratique de KERI, c'est de garder les clés futures quelque part. Avec Mera, **elles ne sont gardées nulle part** : ce sont des fonctions du passkey. Un vol de la clé courante (mémoire d'une page compromise, script tiers) ne donne pas les époques suivantes, puisque chaque époque est un **sel PRF distinct** (cloisonnement évalué par l'authenticator, DOC `concepts/passkeys-and-prf` : « salts are namespaces »).

### 3.2 Sels et nommage

| Espace | Sel PRF (32 o) | Usage | Nature |
|---|---|---|---|
| Époque n d'une ancre | `sha256("ancre.v1|anchor-epoch|" + label + "|" + n)` | une sortie `P_n` par époque | dérivation |
| Dossier de veto (secours §4) | **aléatoire, tiré par Mera** à chaque coffre, stocké dans le coffre | chiffrement AES-256-GCM | chiffrement |

- `label` : identifiant court de l'ancre, choisi avant l'inception (par ex. `demo-anchor-C`). On ne peut pas mettre `anchorId` dans le sel, puisque `anchorId` dépend de `key0` et de `nextKeyDigest1`. Un `label` réutilisé sous le même passkey donnerait le même `anchorId`, et `incept` revert (« MUST revert if anchorId already exists ») : la collision se détecte d'elle-même.
- Versionné `ancre.v1` ; `n` en décimal ; séparateur `|` sans ambiguïté (le label est restreint à `[a-z0-9-]`).
- Rien de tout cela n'est secret : sans le passkey, le sel ne donne rien (DOC).

### 3.3 Dérivations dans une époque

Depuis `P_n` (sortie PRF de l'époque n), par HKDF-SHA-256, sel HKDF vide, deux `info` :
- `k_n = secp256k1.utils.randomSecretKey(HKDF(P_n, info="ancre.v1/anchor-epoch/secp256k1", L=48))`. Avec une graine de 48 octets, `randomSecretKey` est déterministe : `mapHashToField(seed, n)` (DOC, `@noble/curves@2.2.0`, `abstract/weierstrass.js` l. 1005, `modular.js` l. 836). Pas de biais modulaire notable, jamais zéro.
- `s_n = HKDF(P_n, info="ancre.v1/anchor-epoch/reveal-salt", L=32)` : le sel d'aveugle révélé à la rotation.
- `digest_n = keccak256(abi.encode(address(k_n), s_n))` : exactement `nextKeyDigest` de l'ERC.

Pourquoi HKDF **dans** une époque et des sels PRF distincts **entre** époques : `k_n` et `s_n` ont la même durée de vie (révélés ou utilisés ensemble à la rotation n), donc un prompt suffit. En revanche, une fuite de `P_n` ne doit rien dire de `P_{n+1}` : c'est la sécurité de la pré-rotation, et elle ne vaut que si l'authenticator évalue deux sels différents.

### 3.4 Ce qui va on-chain, ce qui est chiffré, ce qui est stocké

| Donnée | Où | Secret ? |
|---|---|---|
| `nextKeyDigest_{n+1}` | contrat `AnchorRegistry` (inception, puis chaque rotation) | non (empreinte aveugle) |
| `s_n`, `address(k_n)` | révélés dans `rotate` | non après rotation |
| Avis et vetos de l'ancre | registre ERC-8004, émis par `address(k_n)` | non |
| **Descripteur d'ancre** `{rpId, label, anchorId, credentialId, transports}` | QR code ou URL `https://<domaine>/anchor#…`, et un event ou un JSON public | non (aucun matériau de clé) |
| `P_n`, `k_n`, clé AES | **nulle part** : mémoire seulement, `fill(0)` puis `session.end()` | oui |
| Chiffré | rien dans A ; les dossiers du secours B | — |

Le concept retenu **ne chiffre rien et ne persiste aucun coffre** : c'est de la dérivation pure. Le jury verra le chiffrement dans le secours s'il est ajouté (§4).

### 3.5 Flux utilisateur

**Inception** (appareil A, 2 prompts ; la veille de la démo) :
1. `createPasskeyWithPrfOutput` avec le sel de l'époque 0 (crée le passkey, 1 ou 2 prompts), puis `getPasskeyPrfOutput` avec le sel de l'époque 1.
2. `k_0` → adresse de l'ancre ; `digest_1` calculé, puis `P_1`, `k_1`, `s_1` mis à zéro. La clé 1 n'a existé que quelques millisecondes en mémoire.
3. `incept(digest_1)`, émis par `k_0` (l'ERC impose `key0 = msg.sender`), gas avancé par l'opérateur.
4. Publication du descripteur ; ajout de l'`anchorId` dans l'ensemble de démo (`setId`).

**Rotation** n → n+1 (appareil B, 2 prompts) :
1. Lire l'état on-chain : `sequence = n` et `nextKeyDigest_{n+1}`.
2. Prompt 1 : `P_{n+1}` → `k_{n+1}`, `s_{n+1}` → recalcul de `digest`. **L'écran affiche « correspond à l'empreinte engagée sur l'autre appareil au bloc X » AVANT toute transaction.** Si le navigateur a choisi un autre passkey, ou le mauvais `label`, ça ne correspond pas et on s'arrête : aucune clé fausse ne part.
3. Prompt 2 : `P_{n+2}` → `digest_{n+2}`, puis zéro.
4. `k_{n+1}` signe la déclaration de rotation. Deux variantes :
   - **conforme à l'ERC** : `k_{n+1}` appelle `rotate(anchorId, s_{n+1}, digest_{n+2})`, après que l'opérateur a envoyé un peu de MON à son adresse, qui n'est connue qu'à cet instant. Piège Monad : le solde doit être visible **3 blocs** avant (plafond du gas en attente, chantier 06 §2) ;
   - **recommandée (PROPOSÉ, extension OPTIONNELLE de l'ERC)** : `rotateBySig(anchorId, s, newNextKeyDigest, sig)`, où `sig` est une signature EIP-712 de `k_{n+1}` sur `Rotate(anchorId, sequence, salt, newNextKeyDigest)`, relayée par n'importe qui. La clé fait **une signature d'attestation, pas une transaction** (`signDigest` de Mera), et il n'y a pas de financement préalable. Coût : un `ecrecover`, 6 000 gas sur Monad (DOC, CLAUDE.md §7).
5. Contrat : `currentKey(anchorId)` = `address(k_{n+1})`, `sequence = n+1`. La clé n est morte : ses avis ne comptent plus, ni dans le graphe ni dans les vetos (ERC §2 « Current key »).

### 3.6 Scénario exact du test multi-appareils en live (scène 3 prolongée, chantier 06)

Préparation (J-1) : domaine HTTPS fixe ; passkey créé dans **Safari macOS 15** (iCloud Keychain) ; vérifier qu'il apparaît sur l'**iPhone iOS 18.4+** ; inception de `demo-anchor-C` ; C est l'une des 3 ancres honnêtes (m = 2) ; fournisseur honnête P noté par A, B et C.

| t | Appareil | Action | Ce que voit le jury |
|---|---|---|---|
| 0 | écran démo | P est payé normalement (`assess` → `OK`) | flux de paiements vert |
| 1 | terminal « attaquant » | la clé `k_0` de C est **déclarée compromise** : l'attaquant (script étiqueté demo) approuve la ferme **et** pose un `slash` sur P | ferme toujours refusée (leave-one-out, D8) ; **P refusé au bloc suivant** (veto q = 1, D33) : le disjoncteur a été retourné contre un honnête |
| 2 | terminal « attaquant » | l'attaquant tente `rotate` vers sa propre clé | **revert** : il ne connaît ni `k_1` ni `s_1` |
| 3 | **iPhone, Safari** (n'a jamais ouvert cette page, aucun stockage local) | scan du QR du descripteur → « Faire tourner la clé » → Face ID | « Clé 1 reconstruite, empreinte = celle engagée par le Mac au bloc X ✓ », avant tout envoi |
| 4 | iPhone | 2e Face ID (époque 2) → `rotateBySig` relayé | event `AnchorKeyRotated(anchorId, newKey, 1, digest2)` |
| 5 | écran démo | au bloc suivant, `assess(P)` relit le dernier avis de la **clé courante** de C : aucun veto | **P est de nouveau payé**, sans recertification ; les approbations de la ferme par `k_0` tomberont à la recertification suivante (chantier 04) |

Pour le jury Mera, la phrase : **« Cette clé n'existait sur aucun appareil. Le Mac a engagé son empreinte il y a un jour ; l'iPhone vient de la faire naître avec le même passkey, et c'est le contrat qui a vérifié qu'elle était la bonne. »** Variante « profil neuf » : un profil Chrome connecté au même compte Google, passkey dans Google Password Manager (DOC, matrice Mera).

### 3.7 Lien avec le reste d'ANCRE

| Chantier | Travail | Coût (ESTIMÉ) |
|---|---|---|
| 02 contrat | `AnchorRegistry` : `incept`, `rotate`, `rotateBySig` (optionnel), `currentKey`, plus une vue `anchorState(anchorId) → (key, sequence, nextKeyDigest)` (PROPOSÉ, absente de l'ERC) ; le veto d'`assess` lit `currentKey` (déjà dans le pseudo-code de l'ERC, l. 537). Les autres ancres de démo : `incept(0)`, c'est-à-dire clé finale, et ça reste uniforme | 0,5 j |
| 03 indexeur | suivre `AnchorIncepted` et `AnchorKeyRotated` ; n'attribuer à un nœud-ancre que les avis de la clé courante | 0,1 j |
| 04 solveur | recertifier après une rotation ; preuve (iv-a) `SENDER` déjà prévue pour la rotation (ERC l. 416) | 0,1 j |
| 06 scènes | scène 3 prolongée (§3.6), en fork puis sur le mainnet | 0,25 j |
| 07 écran | page `/anchor` (Mera) + deux indicateurs : « veto actif / clé morte » | 0,5 j |
| 08 norme | `rotateBySig` en OPTIONNEL ; recommandation « ancres en passkey PRF » dans les considérations de sécurité | 0,1 j |

**À trancher** : `assess` doit-il passer `STALE` quand `currentKey` diffère de la clé engagée dans le certificat ? Si oui, la scène 5 affiche `STALE` au lieu de `OK` jusqu'à la recertification. Si non, les approbations d'une clé morte comptent jusqu'à la recertification (leave-one-out borne le risque).

### 3.8 Code minimal (TypeScript ; API vérifiée dans `@category-labs/mera@0.2.0`, fichiers `dist/*.d.ts`)

Signatures lues : `getPasskeyPrfOutput({ rpId, credential?, prfSalt?, timeout?, webAuthnClient? }) → { credentialId, prfOutput: Uint8Array /*32 o*/ }` ; `createSecp256k1SigningSession({ privateKey }) → { publicKey /*65 o, 0x04*/, signDigest(d32) → { compact /*64 o*/, recovery: 0|1 }, end() }` (la session **copie** la clé : c'est à nous de mettre la nôtre à zéro) ; `getEvmAddress(publicKey) → 0x…` ; `MeraError.code`, `isMeraError`.

```ts
import { getPasskeyPrfOutput, createSecp256k1SigningSession, getEvmAddress,
         isMeraError, type PasskeyCredentialMetadata } from "@category-labs/mera";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";

const RP_ID = "ancre.example";                       // domaine HTTPS fixe, jamais changé
const enc = (s: string) => new TextEncoder().encode(s);
const epochSalt = (label: string, n: number) => sha256(enc(`ancre.v1|anchor-epoch|${label}|${n}`));

type Epoch = { address: Hex; salt: Hex; digest: Hex; sign?: (d: Uint8Array) => Promise<Hex>; end: () => void };

/** Un prompt : fait naître la clé de l'époque n. `keepSigner` seulement pour l'époque qui va signer. */
async function deriveEpoch(label: string, n: number, cred: PasskeyCredentialMetadata, keepSigner = false): Promise<Epoch> {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: RP_ID, credential: cred, prfSalt: epochSalt(label, n) });
  const seed = hkdf(sha256, prfOutput, undefined, enc("ancre.v1/anchor-epoch/secp256k1"), 48);
  const blind = hkdf(sha256, prfOutput, undefined, enc("ancre.v1/anchor-epoch/reveal-salt"), 32);
  prfOutput.fill(0);
  const sk = secp256k1.utils.randomSecretKey(seed);  // déterministe avec une graine de 48 o
  seed.fill(0);
  const session = createSecp256k1SigningSession({ privateKey: sk });
  sk.fill(0);                                         // la session garde sa propre copie
  const address = getEvmAddress(session.publicKey) as Hex;
  const salt = toHex(blind);
  const digest = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [address, salt]));
  if (!keepSigner) session.end();
  return {
    address, salt, digest, end: () => session.end(),
    sign: keepSigner ? async (d32) => {
      const { compact, recovery } = await session.signDigest(d32);
      return toHex(new Uint8Array([...compact, 27 + recovery]));      // r‖s‖v pour ecrecover
    } : undefined,
  };
}

/** Rotation n → n+1 depuis n'importe quel appareil où le passkey est synchronisé. */
export async function rotate(label: string, cred: PasskeyCredentialMetadata,
                             onchain: { anchorId: Hex; sequence: number; nextKeyDigest: Hex },
                             rotateTypedDigest: (salt: Hex, next: Hex) => Uint8Array /* EIP-712 */) {
  const n = onchain.sequence;
  const cur = await deriveEpoch(label, n + 1, cred, true);        // prompt 1
  try {
    if (cur.digest !== onchain.nextKeyDigest)                      // test multi-appareils, arbitré par la chaîne
      throw new Error("Mauvais passkey ou mauvais label : empreinte non conforme, rien n'est envoyé");
    const next = await deriveEpoch(label, n + 2, cred);            // prompt 2, aucune clé gardée
    const sig = await cur.sign!(rotateTypedDigest(cur.salt, next.digest));
    return { anchorId: onchain.anchorId, salt: cur.salt, newNextKeyDigest: next.digest, sig }; // → relayeur → rotateBySig
  } catch (e) {
    if (isMeraError(e) && e.code === "PRF_UNAVAILABLE") throw new Error("Cet authenticator n'a pas de PRF (voir §5)");
    throw e;
  } finally { cur.end(); }
}
```

`rotateTypedDigest` : `hashTypedData` de viem sur `Rotate(bytes32 anchorId,uint64 sequence,bytes32 salt,bytes32 newNextKeyDigest)`, domaine `{ name: "AnchorRegistry", version: "1", chainId: 143, verifyingContract }`. Côté contrat : `ecrecover(digest, v, r, s)`, puis `keccak256(abi.encode(signer, salt)) == nextKeyDigest[anchorId]`, avec `s` bas (Mera signe en `lowS: true`, DOC `src/secp256k1.ts` l. 74).

## 4. Concept de secours : dossier de veto scellé (PROPOSÉ)

- **Quand** : si Hugo refuse de rouvrir AM-2.13, ou si la rotation n'est pas prête le 10/10. Il peut aussi s'ajouter au retenu, comme deuxième espace de noms sur le même passkey.
- **Sels** : ceux de Mera, **aléatoires par coffre** (DOC, `src/secret.ts` l. 240, `randomBytes(PRF_SALT_LENGTH)`). Ils sont donc cloisonnés par construction : ouvrir un dossier ne donne pas la clé des autres.
- **Chiffré** : le dossier JSON `{agentId, tag, paiements x402 concernés, réponses de l'endpoint, horodatage en block.number}`.
- **On-chain** : le `slash` de l'ancre dans le registre 8004, avec `feedbackURI` = `ipfs://…` (le coffre, `PasskeySecretVault` v1) et `feedbackHash` = `keccak256(clair)`. On engage le clair, pas le chiffré, pour que la révélation soit vérifiable par tous.
- **Flux** : l'ancre pose le veto (scène 4) → coffre créé par `createSecretVaultWithExistingPasskey({ rpId, credential, secret })` → IPFS. Recours (scène 6) : sur l'iPhone, `decryptSecretVaultWithPasskey({ rpId, vault: parseSecretVault(json) })` → le clair est affiché et envoyé à l'arbitre ; l'écran vérifie `keccak256(clair) == feedbackHash` en direct.
- **Test live** : l'iPhone, sans aucun stockage local, retrouve le coffre par l'avis on-chain (`feedbackURI`), le déchiffre et montre la même empreinte que le Mac.
- **Limites** : la preuve chiffrée existe ailleurs (moins nouveau) ; révéler le clair est définitif ; `credentialId` et `prfSalt` du coffre ne sont pas dans l'AAD (DOC, vague 1), mais les altérer donne une autre clé, donc `DECRYPT_FAILED`.

## 5. Pièges

1. **PRF non supporté** : profil Chrome local, Bitwarden, Dashlane, NordPass ; Microsoft PM (PRF à la création seulement) ; Samsung Pass (à l'assertion seulement) (DOC matrice Mera + TIERS Corbado). Le drapeau `extension:prf` n'est pas fiable : attraper `MeraError` `PRF_UNAVAILABLE` et afficher un message clair. **Désactiver Bitwarden et Dashlane sur la machine de démo.** iOS **18.4+** (bugs de synchro avant).
2. **Prompts multiples** : Mera n'expose que `eval.first` (DOC, `src/webauthn.ts`). Donc 2 prompts pour l'inception (3 si l'authenticator n'évalue pas le PRF à la création) et 2 pour une rotation. Les annoncer à l'écran (« 1/2 : clé courante », « 2/2 : engagement de la suivante »). Un `WebAuthnClient` maison qui demanderait `first` + `second` sortirait de l'API publique : **non**.
3. **Domaine HTTPS fixe** : le passkey est lié au `rpId`. Choisir le domaine **maintenant** (celui de l'écran de démo, chantier 07) et ne plus le changer. `localhost` et prod = deux mondes, donc deux clés différentes.
4. **Épinglage du credential** : toujours passer `credential` (depuis le descripteur public). Sinon un autre passkey du même `rpId` répond et produit d'autres clés, en silence. Filet de sécurité : la comparaison à `nextKeyDigest` avant tout envoi (§3.5, étape 2).
5. **Synchronisation** : créer le passkey la veille et vérifier sa présence sur l'iPhone. L'hybride (QR + Bluetooth) reste le plan B, sans PRF testé dans la matrice Mera (NON TROUVÉ).
6. **Démo figée (D28)** : si l'acte 2 tourne sur un anvil exporté, l'iPhone doit joindre ce RPC (tunnel HTTPS). Le plus simple : la scène de rotation sur le mainnet, le reste figé.
7. **Script de page** : un script tiers sous le `rpId` peut lancer une cérémonie avec n'importe quel sel, et donc demander l'époque n+1 (DOC, security-model). La pré-rotation protège contre le **vol de clé**, pas contre un utilisateur qui valide un prompt sur une page piégée. À écrire dans les considérations de sécurité. Page `/anchor` sans dépendance tierce, avec CSP stricte.
8. **« Wallet déguisé »** : après rotation, la clé d'époque émet des avis ERC-8004 par transaction (le registre utilise `msg.sender`). Il faut la présenter comme **identité de rôle d'ancre**, sans fonds. Le travail non-compte montré au jury : la **chaîne de pré-rotation** (engagement, naissance sur B, vérification par le contrat, `rotateBySig` sans transaction). Ne pas utiliser `toViemAccount` dans la scène.
9. **Réserve Monad** : si l'on garde `rotate` par `msg.sender`, financer `k_{n+1}` au moins 3 blocs avant son envoi. `rotateBySig` supprime ce piège.
10. **Zéro** : `prfOutput.fill(0)`, `seed.fill(0)`, `sk.fill(0)`, `session.end()`. Mera prévient que c'est « defense-in-depth, not a guarantee » (GC, bigint) (DOC).

## 6. Questions pour Hugo

- Rouvrir la coupe AM-2.13 pour **une** ancre en pré-rotation (les autres en `incept(0)`, clé finale) ? Surcoût ESTIMÉ à ~1,5 j tous chantiers compris, dont ≤ 1 j de Mera.
- `rotateBySig` : l'ajouter en OPTIONNEL dans l'ERC (chantier 08), ou seulement dans l'implémentation de référence ?
- `STALE` après rotation (§3.7) : oui ou non ?
- Le domaine HTTPS de l'écran de démo, à fixer tout de suite.

# Mera : dérivation de clés par passkey PRF (ressource, vague 1)

> Recherche documentaire du **2026-09-27** pour le bounty *Monad Foundation, Mera: One Passkey, Many Keys* (2 500 $, fiche dans `docs/conseil/bounties-sponsors.md`).
> Étiquettes : **DOC** = doc officielle ou code source · **EXEMPLE** = code d'exemple officiel ou projet tiers · **TIERS** = source non officielle (auto-déclaré) · **NON TROUVÉ**.
> Rien n'a été **mesuré** par nous : aucun test sur appareil réel n'a été fait.

## 0. En bref

- Mera est une **bibliothèque TypeScript côté client** (pas un wallet, pas un service) de **Category Labs**, publiée sous `@category-labs/mera`, en **v0.2.0**, sous double licence **MIT OR Apache-2.0**.
- Elle fait trois choses : (1) lancer la cérémonie WebAuthn et rendre **32 octets PRF** ; (2) gérer des **coffres AES-256-GCM** (clé tirée de la sortie PRF par HKDF) ; (3) fournir des **sessions de signature** secp256k1 et Ed25519.
- **La dérivation de clés n'est pas faite par Mera** : elle revient à l'application. La doc montre BIP-39 puis BIP-32 ; tout autre schéma, HKDF compris, est permis.
- Mera **n'expose que la sortie `first`** du PRF (jamais `second`). Il faut donc **une cérémonie, donc un prompt, par sel**.
- Mera **ne rend ni la signature d'assertion WebAuthn ni la clé publique P-256** du passkey. Le précompilé P256 à `0x0100` n'a aucun lien direct avec Mera.
- Il existe déjà un concurrent très proche : **aliveevie/mandate** (ERC-8004 + passkey Mera + Chainlink CRE, sur le testnet Monad), voir §6.

## 1. Ce qu'est Mera

| Fait | Source | Statut |
|---|---|---|
| Présentée comme un « SDK for creating blockchain accounts from passkeys across multiple chains and platforms ». Accroche : « Accounts on any chain and platform, from a passkey. » | https://mera.category.xyz/ | DOC |
| Éditeur : **Category Labs** (org GitHub `category-labs`). Annonce sur le blog Monad, signée « Monad Foundation », le **2026-07-30** : « a free client-side library » | https://www.monad.xyz/blog/introducing-mera | DOC |
| Paquet npm `@category-labs/mera`. Versions : **0.1.0** (2026-07-23) et **0.2.0** (2026-08-12, `latest`). Licence `(MIT OR Apache-2.0)` | https://registry.npmjs.org/@category-labs/mera | DOC |
| Dépôt https://github.com/category-labs/mera : créé le 2026-06-18, dernier push le **2026-09-23**, **33 ★, 5 forks** (au 27/09). La lib est dans `library/src/` et la doc Astro/Starlight dans `docs/` | API GitHub | DOC |
| Sous-chemins exportés : `.`, `./viem` (`toViemAccount`), `./react-native-webauthn-client` | `library/package.json` | DOC |
| Seules dépendances d'exécution : `@noble/*` et `@scure/*` | https://mera.category.xyz/concepts/security-model/ | DOC |
| Mera est citée dans la doc Monad (section Embedded wallets) : « standard EVM accounts directly from a passkey… no seed phrase, bundler, MPC service, or backend custody » | https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets | DOC |
| Démos du dépôt : `demos/web` (app de trading sur un réseau privé anvil `--network monad`, chainId 31337, argent fictif), `demos/extension` (extension Chrome MV3), `demos/mobile` (Expo), `demos/prf` (visualisation du PRF, hébergée sur https://mera.category.xyz/prf-demo/) | `demos/*/README.md` | EXEMPLE |

### API publique (DOC : https://mera.category.xyz/reference/)

| Fonction | Rôle | Cérémonies |
|---|---|---|
| `createPasskeyWithPrfOutput({ rp:{id,name}, user:{name,displayName}, prfSalt?, timeout?, webAuthnClient? })` → `{ credentialId, transports, prfSalt, prfOutput }` | Crée un passkey découvrable et vérifié, puis évalue le PRF | 1, ou **2** si l'authenticator n'évalue pas le PRF à la création (repli sur une assertion) |
| `getPasskeyPrfOutput({ rpId, credential?, prfSalt?, timeout?, webAuthnClient? })` → `{ credentialId, prfOutput }` | Assertion et évaluation du PRF | 1 |
| `createSecretVaultWithNewPasskey({ rp, user, secret })` | Crée le passkey et chiffre un secret dans un coffre | 1 ou 2 |
| `createSecretVaultWithExistingPasskey({ rpId, credential?, secret })` | Chiffre un secret de plus avec un passkey existant | 1 |
| `decryptSecretVaultWithPasskey({ rpId, vault })` → `Uint8Array` | Déchiffre un coffre (assertion épinglée sur le `credentialId` du coffre) | 1 |
| `parseSecretVault(jsonOuObjet)` | Valide un JSON non fiable | 0 |
| `createSecp256k1SigningSession({privateKey})`, `createEd25519SigningSession(...)` | Garde la clé en mémoire, `signDigest`, `end()` qui met à zéro | 0 |
| `getEvmAddress(pub)`, `getSolanaAddress(pub)`, `toViemAccount(session)` | Adresses et adaptateur viem | 0 |
| `WebAuthnClient` `{ createCredential, getCredential }` | Couche d'abstraction : client navigateur par défaut, client React Native fourni | — |
| `MeraError.code` ∈ `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `PRF_UNAVAILABLE`, `SESSION_ENDED`, `DECRYPT_FAILED`, `INPUT_INVALID`, `VAULT_FORMAT_INVALID` ; garde `isMeraError` | Les codes sont le contrat stable | — |

**Paramètres imposés, non configurables** (DOC, `reference/create-passkey-with-prf-output`) :
- algorithmes **ES256 ou RS256** ;
- attestation `"none"` ;
- resident key obligatoire ;
- **user verification obligatoire** ;
- `user.id` aléatoire sur 32 octets à chaque appel, ce qui fait que **chaque appel ajoute un passkey**.

## 2. De la sortie PRF à une clé

### Côté WebAuthn (DOC : W3C WebAuthn L3, Recommandation du 25/08/2026, §10.1.4, https://www.w3.org/TR/webauthn-3/ ; ED : https://w3c.github.io/webauthn/#prf-extension)
- Le client ne transmet pas le sel brut : il envoie `SHA-256("WebAuthn PRF" || 0x00 || salt)` à `hmac-secret` (CTAP2). Un PRF WebAuthn ne peut donc pas être confondu avec un `hmac-secret` utilisé directement.
- Deux modes, `eval` et `evalByCredential` (ce dernier exige `allowCredentials`). Deux entrées possibles, **`first` et `second`**, dans la même cérémonie. Usage prévu de `second` : la **rotation** (clé courante et clé suivante en un seul prompt).
- Mera n'envoie que `prf: { eval: { first: prfSalt } }` (DOC, code `library/src/webauthn.ts`, l. 120 et 158). **`second` n'est pas accessible** par l'API publique.
- `hmac-secret` garde **deux PRF par credential**, l'un avec UV et l'autre sans. WebAuthn n'expose que celui avec UV, d'où l'UV obligatoire chez Mera (DOC, `concepts/passkeys-and-prf`).

### Côté Mera
- **Sel par défaut** : `sha256("mera.prf.salt.v1")`, « will not change across library versions ». N'importe quelle implémentation peut le reproduire (DOC, `reference/get-passkey-prf-output`).
- **`prfSalt` explicite** : exactement **32 octets** (sinon `INPUT_INVALID`). « An explicit value supports custom PRF namespaces. » (DOC)
- **Sortie** : `Uint8Array` de **32 octets**, fonction déterministe de *(credential, rpId, sel)*. « A different salt produces unrelated output: salts are namespaces. » (DOC, https://mera.category.xyz/concepts/passkeys-and-prf/)
- **Algorithmes fournis** : **AES-256-GCM** (coffres), sessions **secp256k1** (EVM) et **Ed25519** (Solana). **X25519 : NON TROUVÉ** dans Mera (possible avec `@noble/curves` à partir des 32 octets, c'est à l'application de le faire).
- **HKDF** : utilisé **seulement dans les coffres**. `HKDF-SHA-256`, sel HKDF vide, `info = "mera.v1.encrypt.secret"`, clé AES-GCM de 256 bits **non extractible** (DOC, code `library/src/secret.ts`, l. 21-55). Pour les comptes, la doc passe par `entropyToMnemonic(prfOutput)` → `mnemonicToSeedSync` → BIP-32 `m/44'/60'/0'/0/i`, ou SLIP-0010 pour Ed25519 (DOC, `recipes/create-passkey-accounts`).

Extrait minimal (DOC, `library/src/secret.ts`) :
```ts
const material = await subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
return subtle.deriveKey(
  { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("mera.v1.encrypt.secret") },
  material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
```

Espace de noms personnalisé (construit sur l'API DOC ; le nommage des sels est notre convention) :
```ts
import { getPasskeyPrfOutput } from "@category-labs/mera";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
const salt = sha256(utf8ToBytes("ancre.v1:anchor-key:<anchorId>:epoch:3")); // 32 octets
const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId, credential: pinned, prfSalt: salt });
// prfOutput -> HKDF(info="ancre.v1/secp256k1") -> clé ; utiliser, puis prfOutput.fill(0)
```

### Bonnes pratiques de sel et d'espace de noms
- **Un sel par usage** (DOC). Les coffres tirent un sel aléatoire neuf par secret, parce que « vaults that share a PRF output share an encryption key » (DOC, `reference/secret-vault-format`).
- **Versionner les sels** (`…v1…`), comme Mera le fait avec `mera.prf.salt.v1`. Changer de sel revient à changer toutes les clés.
- **Deux façons de cloisonner** (analyse, non documentée par Mera) :
  - (a) **un sel PRF par espace de noms** : un prompt par espace, et la fuite d'une sortie ne compromet que cet espace. C'est la forme que le bounty demande (« sels réellement cloisonnés »).
  - (b) **un sel racine puis HKDF avec `info` par sous-clé** : un seul prompt, mais la sortie racine compromet tout.
  - Pour le jury, il faut montrer (a) au moins entre les espaces de nature différente.
- **Épingler le credential** : stocker `{credentialId, transports}` (pas de matériau de clé) et le repasser. Sinon le navigateur peut prendre **n'importe quel** passkey découvrable du rpId, ce qui donne d'autres clés en silence (DOC, `recipes/create-passkey-accounts`).
- Le sel **n'est pas secret** : sans le passkey, il ne donne rien (DOC).

### Ce qu'il ne faut JAMAIS persister
- La sortie PRF, les clés dérivées, la clé AES, et le seed ou la mnémonique issus du PRF. Le format de coffre les exclut explicitement : « The encryption key and the PRF output are never stored. » (DOC, `reference/secret-vault-format`)
- Persistable : `credentialId`, `transports`, `prfSalt`, `nonce`, `ciphertext`.
- Mettre à zéro les tampons rendus par Mera (`secret.fill(0)`, `session.end()`). Mera met à zéro ses propres tampons, mais « Zeroing is a defense-in-depth measure, not a guarantee » : le GC copie les valeurs, et les bigint sont immuables (DOC, `concepts/security-model`).
- Attention : **n'importe quel script de la page** (dépendance, injection) peut remplacer les API appelées par Mera et lire la sortie PRF. Tout hôte sous le rpId peut lancer une cérémonie (DOC).

## 3. Coffres de secrets et recette « use an existing secret »

(DOC : https://mera.category.xyz/concepts/secret-vaults/, https://mera.category.xyz/recipes/use-an-existing-secret/, https://mera.category.xyz/reference/secret-vault-format/)

- Un coffre contient **un** secret (octets quelconques, non vides), chiffré en AES-256-GCM. La clé vient de HKDF appliqué au PRF, avec un **sel aléatoire de 32 octets propre à ce coffre**, stocké dans le coffre. Toute altération fait échouer le déchiffrement (`DECRYPT_FAILED`).
- Format v1 :
  ```json
  {"version":1,"credential":{"credentialId":"…","transports":["internal","hybrid"]},"prfSalt":"<b64url 32o>","nonce":"<b64url 12o>","ciphertext":"<b64url + tag 16o>"}
  ```
- `rpId` est **absent** du coffre (c'est l'assertion qui le fournit). `credentialId` et `prfSalt` **ne sont pas authentifiés** : ils ne font pas partie de l'AAD.
- Recette (cas type : migrer un compte existant vers le passkey) :
  ```ts
  const vault = await createSecretVaultWithNewPasskey({ rp:{id:rpId,name:"Example"}, user:{name, displayName}, secret });
  localStorage.setItem("app.vault", JSON.stringify(vault));
  // plus tard, ailleurs :
  const secret = await decryptSecretVaultWithPasskey({ rpId, vault: parseSecretVault(raw) });
  ```
- **C'est l'application qui décide où vit le coffre** (localStorage, backend, service de synchro). Pour le test multi-appareils, **le coffre doit être disponible sur le 2e appareil** : localStorage ne suffit pas. Il faut le mettre on-chain, sur IPFS ou sur un serveur, ce qui est permis puisqu'il est chiffré.

## 4. Multi-appareils : support PRF et test du bounty

### Matrice publiée par Mera (DOC, « ✓ = live PRF create + get cycle confirmed », https://mera.category.xyz/authenticator-support/)
| Authenticator | Navigateur / OS | Statut |
|---|---|---|
| **iCloud Keychain** | Safari iOS 18+ / macOS 15+ ; Chrome macOS 15+ (132+) ; Chrome iOS 18+ ; Firefox macOS (139+) | ✓ |
| **Google Password Manager** | Chrome Android ; **Chrome desktop connecté** (132+) ; Edge Android | ✓ |
| **1Password** | tout navigateur avec l'extension, Android | ✓ |
| Windows Password Manager | Edge / Chrome 147+ / Firefox 148+ sur **Windows 11 25H2** + mise à jour 2026-02 | ✓ |
| YubiKey 5 (5.2+) | Chrome desktop 116+ | ✓ |
| Proton Pass | Chrome desktop | ✓ |
| **Profil Chrome local** | Chrome desktop | **Non supporté** (2026-06-01) |
| **Bitwarden, Dashlane** | Chrome desktop | **Non supportés** (2026-06-01) |

Natif : iOS 18+ et Android 9+ (DOC). Mera recommande **1Password ou iCloud Keychain** pour commencer.

Compléments TIERS (Corbado, mis à jour le 22/09/2026, https://www.corbado.com/blog/passkeys-prf-webauthn) :
- sur iOS 18.0-18.3, des bugs de perte de données quand l'iPhone sert de source cross-device : **viser iOS 18.4+** ;
- Microsoft Password Manager : PRF à la création seulement ; Samsung Pass : PRF à l'assertion seulement ; NordPass : pas de PRF ;
- WebKit : deux bugs sur les **clés de sécurité** CTAP2 (pas sur les authenticators de plateforme) ;
- le drapeau de capacité `extension:prf` **n'est pas fiable** : il faut tester le résultat réel ;
- le parcours hybride (QR + Bluetooth) marche dans les 4 grands navigateurs, mais c'est celui qui décroche le plus.

### Condition du bounty (fiche officielle)
« le même passkey sur un second appareil, **ou un profil de navigateur neuf**, reproduit les mêmes clés dérivées et déchiffre le même état », **en live**.

### Pièges pour ce test
1. **Même `rpId` des deux côtés**. Un passkey est lié à son domaine : `localhost` sur l'appareil A et un domaine de prod sur l'appareil B, cela donne deux mondes différents. Il faut **déployer en HTTPS sur un domaine fixe avant la démo**, sans le changer ensuite, sinon les clés et les coffres sont perdus (DOC, security-model).
2. **« Profil Chrome neuf »** : le passkey n'y apparaît que si le profil est **connecté au même compte Google** et que le passkey est dans **GPM**. Un passkey créé dans le profil local n'a **pas de PRF**. Chrome l'y crée en silence si « Offer to save passwords and passkeys » est désactivé, ou si une extension de gestionnaire de mots de passe intercepte l'appel (DOC). **Désactiver Bitwarden et Dashlane sur la machine de démo.**
3. **Épingler le `credentialId`** sur le 2e appareil. Sans lui, un autre passkey du même rpId peut répondre et produire d'autres clés. Sur un appareil vierge, sans localStorage, il faut soit publier le `credentialId` avec l'état partagé, soit vérifier après coup l'adresse ou l'empreinte dérivée.
4. **La synchronisation n'est pas instantanée** : créer le passkey **avant** la démo et vérifier qu'il est arrivé sur le 2e appareil.
5. **Hybride (QR)** : il fonctionne (l'iPhone ou l'Android sert d'authenticator pour le poste), mais il ajoute Bluetooth et plus d'échecs. À garder en plan B, pas en chemin principal. Le PRF en hybride n'est pas testé explicitement dans la matrice Mera : **NON TROUVÉ** côté Mera.
6. **Passkey écrasé** : un passkey créé hors de Mera avec le même `user.id` reçoit une nouvelle paire et un nouveau PRF. Mera y échappe (handle aléatoire), mais un autre outil pourrait le faire.
7. Extension Chrome : un panneau latéral peut bloquer la cérémonie sans afficher de prompt (DOC, `recipes/use-mera-with-chrome-extensions`).

Configurations de démo les plus sûres (d'après la matrice DOC, **non testées par nous**) :
- **Safari macOS 15 → Safari iPhone iOS 18.4+ (iCloud Keychain)** ;
- ou **1Password sur deux navigateurs ou deux machines**.

Outil tiers utile pour une répétition : https://github.com/Nimblebot-Hype/passkey-key-check (page unique qui vérifie si un passkey synchronisé donne la même clé sur deux appareils, 2026-09-02, TIERS, non audité).

## 5. Lien avec Monad

- **P256 à `0x0100`** : EIP-7951 (successeur de RIP-7212), **6 900 gas**, entrée de 160 octets `(hash, r, s, qx, qy)`, sortie `…01` ou vide. ecRecover coûte 6 000 gas (DOC, https://docs.monad.xyz/developer-essentials/precompiles, et `…/differences`). Chiffre **documenté**, **non mesuré** par nous.
- **Mera et P256** :
  - les passkeys Mera sont en **ES256 (P-256) ou RS256**, donc parfois RSA ;
  - l'API **ne renvoie pas** la clé publique du credential ni les signatures d'assertion ;
  - les clés que Mera fait signer sont des **clés logicielles secp256k1 ou Ed25519** dérivées du PRF, **vérifiables par `ecrecover`**, pas par `0x0100`.
  - Vérifier le passkey lui-même via `0x0100` demande de capter l'assertion brute, avec un `WebAuthnClient` maison qui enveloppe `navigator.credentials` (faisable, **non documenté** comme cas d'usage).
- **Mera est-elle déjà utilisée sur Monad ?**
  - Démo officielle : sur un anvil privé `--network monad` (chainId 31337), **pas sur le mainnet ni le testnet** (EXEMPLE, `demos/web/network/README.md`).
  - Aucun exemple officiel sur le mainnet 143 : **NON TROUVÉ**.
  - Projets tiers sur le testnet 10143 : voir §6 (Mandate).
- Le blog Monad (30/07) ne cite ni bounty ni précompilé (DOC).

## 6. Projets existants (pour juger la nouveauté)

| Projet | Ce qu'il fait avec le PRF | Date | Statut |
|---|---|---|---|
| **aliveevie/mandate**, PR #8 « Mera PRF — one passkey, many keys » https://github.com/aliveevie/mandate/pull/8 | Espaces de noms `"mandate:policy:<principal>:<nonce>"` → AES-256-GCM (politique d'agent chiffrée, hash engagé on-chain) et `"mandate:agent-id:<n>"` → secp256k1 par agent, **propriétaire d'identités NFT ERC-8004**. Test cross-device revendiqué, agent #1872 sur le **testnet Monad**. Le projet est aussi sur P256/RIP-7212, **ERC-8004 réputation, Chainlink CRE**, disjoncteur | PR ouverte le 16/09, fusionnée le 19/09/2026 | EXEMPLE, auto-déclaré. **Concurrent direct probable en track 04, à ajouter à la liste des concurrents** |
| emmanuelist/curb, issue #2 https://github.com/emmanuelist/curb/issues/2 | Spike « one passkey, two keys, a signed tx » : deux sels → deux adresses EVM | 26/09/2026 | EXEMPLE (orienté wallet) |
| tuantqse90/merawallet | Wallet Monad en extension Chrome sur Mera | 31/07/2026 | EXEMPLE (wallet, donc exclu du bounty) |
| DyorHQ/IOS-app PR #23 « Mera » | Intégration iOS | ? | EXEMPLE, non lu |
| Hors Mera : tinfoil-passkey-kit, bao-signer (identité **Nostr** dérivée du PRF), KeePassDX / KeePass plugin, gestionnaires TOTP ou mots de passe déverrouillés par PRF, chiffrement de fichiers (cloud-cypher), wallets Stacks/Bitcoin | Chiffrement E2E, identités Nostr, coffres | 2026 | EXEMPLE (recherche GitHub du 27/09) |

**Déjà vu, donc peu nouveau** : wallet, coffre de mots de passe, chiffrement E2E de fichiers, identité par agent possédant un NFT 8004 (Mandate), politique d'agent chiffrée (Mandate).
**Non repéré à ce jour** (recherche non exhaustive) :
- **pré-rotation d'une clé d'attestation** (`key_{n+1}` dérivée d'un sel d'époque, dont l'engagement est publié à l'avance, façon KERI) ;
- **ensemble d'ancres privé du lecteur** chiffré par passkey ;
- **mémoire ou graphe de confiance personnel** restauré sur un autre appareil.

## Ce qui compte pour le bounty

1. **Exclusion** : pas de « signer des transactions depuis un compte wallet ». Nos espaces de noms doivent faire autre chose. Signer une **attestation d'ancre** (EIP-712, vérifiée par `ecrecover` dans le contrat) n'est pas un compte, mais il faut le **présenter comme une identité de rôle**, pas comme un wallet. Question à poser à l'organisateur si on veut en être sûr.
2. **Idée qui colle à la thèse ANCRE (D9)** : `salt_n = sha256("ancre.v1:anchor:<anchorId>:epoch:<n>")`.
   - L'ancre publie `hash(pub_{n+1})` en même temps que `pub_n` : c'est la **pré-rotation**.
   - La rotation se fait sans aucun secret stocké. Un vol de `key_n` ne donne pas `key_{n+1}`, puisque l'espace est distinct.
   - Coût : 2 prompts (Mera ne donne pas `second`). Soit on l'accepte, soit on écrit un `WebAuthnClient` qui demande `first` et `second`. Hors API publique : à vérifier.
3. **Second espace, qui n'est ni une identité ni un compte** : **l'ensemble d'ancres personnel du lecteur** (ou ses seuils de disjoncteur), chiffré dans un coffre Mera et stocké off-chain.
   - Le **test live** consiste à ouvrir l'écran de démo sur un 2e appareil : même passkey, même coffre déchiffré, même verdict ANCRE.
   - C'est « l'état chiffré » suggéré par la fiche, avec un sens métier : **les ancres sont un choix privé du lecteur**.
4. **Attention au contresens** : les « identités non reliables entre contextes » (piste suggérée par la fiche) **fabriquent des Sybil**. À ne pas mettre en avant chez nous, ou à présenter comme ce qu'ANCRE neutralise.
5. **Critère « usage correct des primitives »** :
   - sels distincts et versionnés ;
   - `credentialId` épinglé ;
   - rien en clair sur disque ni sur serveur ;
   - `fill(0)` et `end()` appelés ;
   - HKDF avec `info` si on tire plusieurs clés d'une même sortie ;
   - le montrer dans le README (tableau des espaces de noms).
6. **Démo cross-device** : domaine HTTPS fixe dès maintenant, iCloud Keychain (macOS → iPhone 18.4+) ou 1Password, passkey créé et synchronisé la veille, pas de Bitwarden ni de Dashlane, pas de profil Chrome local.
7. **Différenciation avec Mandate** : ils ont déjà « passkey → identité d'agent ERC-8004 + politique chiffrée » sur Monad. Il ne faut **pas** pitcher « un passkey possède l'agent ». Notre angle : **la clé de l'ancre et ses rotations**, et **la vue privée du lecteur**.
8. **Coût estimé** (non mesuré) : l'intégration Mera en elle-même est courte (4 fonctions). Le vrai coût, c'est le domaine, la synchro et la répétition du test sur deux appareils. Ça reste compatible avec le seuil « moins d'une journée » du tour 5A **si** le chemin reste sur les coffres et les sels custom, sans `WebAuthnClient` maison.

## Liens directs
- Accueil : https://mera.category.xyz/ · Démarrage : https://mera.category.xyz/getting-started/
- Concepts :
  - https://mera.category.xyz/concepts/passkeys-and-prf/
  - https://mera.category.xyz/concepts/entropy-keys-and-accounts/
  - https://mera.category.xyz/concepts/passkey-accounts/
  - https://mera.category.xyz/concepts/signing-sessions/
  - https://mera.category.xyz/concepts/security-model/
  - https://mera.category.xyz/concepts/secret-vaults/
- Recettes :
  - https://mera.category.xyz/recipes/use-an-existing-secret/
  - https://mera.category.xyz/recipes/create-passkey-accounts/
  - https://mera.category.xyz/recipes/send-a-transaction-with-viem/
  - https://mera.category.xyz/recipes/use-mera-with-react-native/
  - https://mera.category.xyz/recipes/use-mera-with-chrome-extensions/
- Support : https://mera.category.xyz/authenticator-support/
- Référence :
  - https://mera.category.xyz/reference/
  - https://mera.category.xyz/reference/get-passkey-prf-output/
  - https://mera.category.xyz/reference/create-passkey-with-prf-output/
  - https://mera.category.xyz/reference/secret-vault-format/
  - https://mera.category.xyz/reference/errors/
  - https://mera.category.xyz/reference/web-authn-client/
- Code :
  - https://github.com/category-labs/mera/blob/main/library/src/secret.ts (HKDF + AES-GCM)
  - https://github.com/category-labs/mera/blob/main/library/src/passkey.ts (sel par défaut)
  - https://github.com/category-labs/mera/blob/main/library/src/webauthn.ts (`eval.first` uniquement)
- Spec : https://www.w3.org/TR/webauthn-3/ (§10.1.4 prf) · https://w3c.github.io/webauthn/#prf-extension
- Monad :
  - https://docs.monad.xyz/developer-essentials/precompiles
  - https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets
  - https://www.monad.xyz/blog/introducing-mera
- Tiers : https://www.corbado.com/blog/passkeys-prf-webauthn

**NON TROUVÉ** : CHANGELOG ou notes de version de la 0.2.0 ; accès à `second` dans l'API ; X25519 ; exemple officiel sur Monad mainnet ou testnet ; test PRF en hybride dans la matrice Mera ; critères de notation détaillés au-delà de la fiche.

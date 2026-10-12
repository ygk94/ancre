# Vidéo du bounty Mera : environ 1 min

> Écrit le **2026-10-12** par la session pilote. Prise du 12/10 à 19:53 (Safari macOS, Touch ID par Hugo), plan iPhone tourné par Hugo.

## Ce qui est montré (tout est réel, Monad testnet)

- **Porte P4** (12/10) : le même passkey (iCloud Keychain, rpId `ancre-xyz.netlify.app`) redonne les mêmes clés d'époque 0 et 1 sur le Mac et sur l'iPhone, via `getPasskeyPrfOutput` de `@category-labs/mera` 0.2.0 (`app/src/mera/`).
- **Ancre-passkey** : l'epoch 0 `0xe3c887E2AEDaE83bCDb63143394B5887dd9f309b` est une ancre de l'ensemble « mera » `0x2d11…4f2f` (anchor-A, anchor-B et elle) sur l'instance officielle ANCRE `0x8bE6…da9B` (`demo/mera.ts`, 12/10).
- **Veto signé par Mera** : section 4 de `/mera/`, un Touch ID, `createSecp256k1SigningSession` signe un `giveFeedback(provider-1 #2050, -100, "slash")`, envoyé depuis le navigateur : tx `0x7884e13e18d6a8a5a1f597a554210869c6f14015492811838f3614e25f0dcfed`, bloc 70 462 375 (MESURÉ, 12/10).
- **Refus** : le payeur de l'ensemble mera `0x7CB3…bd1B` refuse le paiement suivant (`ANCRE_STATUS`, statut `VETOED`), lu en direct. En répétition sur fork, le refus tombe au bloc suivant le veto ; pendant la prise, le paiement a été tenté ~30 s après, d'où « the next payment is refused », sans chiffre de latence.

## Texte (voix, anglais)

| Plan | Début | Voix |
|---|---|---|
| M1 | 0:00 | "ANCRE's anchors are the people you trust, and their keys are the weak point. If an anchor loses its key, the whole anchor set has to change. With Mera, an anchor's keys come from a single passkey." |
| M2 | 0:11 | "Each epoch gives a fresh key, always from the same passkey. One passkey, many keys." |
| M3 | 0:17 | "And because the passkey is synced by iCloud, my iPhone derives exactly the same addresses. There is no seed phrase and nothing is stored." |
| M4 | 0:25 | "Epoch key zero is a real anchor of an ANCRE set on Monad testnet. With one Touch ID, Mera signs a veto against a provider, and the browser sends it on chain." |
| M5 | 0:36 | "The payer contract reads that veto live, so the next payment to this provider is refused." |
| M6 | 0:47 | "Here is the veto on chain. With Mera, an ANCRE anchor fits in a passkey." |

Honnêteté : la pré-rotation (engager la clé suivante on-chain) n'est **pas** implémentée dans le contrat (ERC, « future version ») ; on ne la dit pas. Ce qui est dit : une ancre réelle dont la clé vient d'un passkey via Mera, et son veto.

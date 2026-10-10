# Écran mainnet : lecture directe du contrat (10/10)

Décision de Hugo (option 1) : sur Monad mainnet, l'écran lit l'état certifié d'ANCRE **directement dans le contrat**
(eth_call sur le RPC public `https://rpc.monad.xyz`, 25 rps, sans clé), sans indexeur. `indexer/` n'est pas touché.

## Ce qui change

- **Sélecteur de réseau** : mainnet passe de « preview » à **actif**, étiquette `live · minimal run 10/10`
  (`app/src/config/networks.ts`). Plus aucune occurrence de « preview » dans `app/src`.
- **Lu on-chain** (`app/src/sources/mainnetChain.ts`, logique pure dans `app/src/core/onchain.ts`) : toutes les
  lectures sont faites au même bloc de tête. `assess(id, setId, true)`, `getAgentWallet(id)`,
  `TrustGatedPayer.decide(id, agentWallet, 0.01 USDC)`, `policyOf(setId)` (maxAge, θ), `paused()`, et les blocs
  de tête et du certificat (horodatages). Agents lus : #10330, #182, plus l'agent de la page. Lecture partagée,
  rafraîchie toutes les 60 s.
- **Certificat et âge** : bloc du certificat lu par `assess`, date (horodatage du bloc), âge en blocs et en temps,
  maxAge lu dans `policyOf`, dernier bloc valide `certBlock + maxAge` (même règle que `_assess` : STALE si
  `block.number − certBlock > maxAge`). Une fois périmé : pastille **STALE**, plus un bandeau qui dit qu'aucune
  recertification continue ne tourne sur le mainnet. Les durées sont **estimées** à partir de la cadence mesurée
  entre le certificat et la tête.
- **RECORDED à part** : `app/src/data/mainnet-run.json` est extrait du journal archivé
  (`docs/chantiers/rapports/act-mainnet/run-20261010T123036Z.json`) par `app/scripts/export-mainnet-run.mjs`. Il
  contient les transactions (déploiements, certificats, vouch, slash, règlement), les décisions du payeur et la
  latence du disjoncteur. Un test vérifie que le fichier est identique à l'extraction du journal, et que chaque
  hash figure dans `demo/JUDGES.md`.
- **Pages** :
  - Discover (mainnet) : carte « Certified on-chain · ANCRE on Monad mainnet » en tête. Dessous, un titre
    « The whole registry, read by the reference solver · COMPUTED · not certified on-chain ».
  - Page agent : le verdict de l'en-tête vient du contrat, jamais du solveur. Dans l'onglet Overview, la carte
    on-chain vient en premier, puis la section du solveur, titrée comme telle. Les onglets Certificates et
    Payments affichent l'état lu maintenant et l'état enregistré, avec les liens explorateur.
  - Network : contrats, rôles du payeur et carte on-chain.
  - Fil « ANCRE » : les événements enregistrés du run.
- **Liens monadscan.com** : contrats, certificats (bloc et tx), règlement x402 `0xa099…a60c`, slash `0x6be5…e08c`,
  enregistrement du set.
- **Repli** : si une lecture échoue, la valeur vaut `null` et s'affiche « — » (test sur un port fermé). On
  n'affiche jamais de valeur reprise du journal à la place.
- **Aucune clé** dans le bundle : RPC public, surchargeable par `VITE_MAINNET_RPC`.

## Mesuré au 10/10 (lecture de l'écran, ~13 h 22 UTC, bloc ≈ 112 193 134)

| Agent | Statut `assess()` | Masse robuste | `decide()` |
|---|---|---|---|
| #10330 (provider-1, demo) | VETOED (1 veto) | 0 | ANCRE_STATUS |
| #182 | OK, masse 0 | 0 | UNTRUSTED |

- Certificat : bloc 112 182 889 (tx `0x6a2c…b959`), certifié le 10/10 à 12 h 30 UTC.
- Âge au moment de la lecture : environ 10 245 blocs, soit 51 min.
- maxAge : 288 000 blocs. Le certificat passe **STALE après le bloc 112 470 889**, c'est-à-dire vers le 11/10 en
  début d'après-midi UTC (estimé).

## Vérifications

- `npx tsc -b` : OK. `npm run build` : OK. `npm test` : 61 tests au vert, dont 18 nouveaux
  (`test/mainnet-onchain.test.ts` et `test/onchain-panel.test.tsx`).
- Captures headless (Chrome, via playwright-core) en 1920×1080 et en iPhone 15, dans `ecran-mainnet/` : Discover,
  agents #10330 et #182, onglets Payments et Certificates, Network. Aucun débordement horizontal, aucune erreur
  console.

## Limites

- Pas de recertification continue : à partir du 11/10, les captures montreront STALE pour tous les agents.
  C'est attendu, et l'écran l'explique.
- `decide()` sonde un paiement de 0,01 USDC vers l'`agentWallet` lu au même bloc. Le refus est un eth_call, il
  n'y a aucune transaction.
- Les refus du run ne laissent aucune trace on-chain : ils sont pris dans le journal (RECORDED), pas sur
  l'explorateur.

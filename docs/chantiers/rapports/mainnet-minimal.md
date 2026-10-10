# Chantier « mainnet minimal » (D40, D59) — rapport

> 2026-10-10. Branche `worktree-agent-a0935641263e74b04` (basée sur `main` f7a64f5). **Aucune transaction envoyée**
> sur le mainnet ni sur le testnet : tout est préparé et répété sur un fork local (anvil 1.8.3 `--network monad`).
> Étiquettes : MESURÉ (réseau réel, lecture seule), MESURÉ-FORK, ESTIMÉ, NON VÉRIFIÉ.

## Ce qui est livré

- **`demo/lib/mainnet.ts`** : un mode mainnet qui réutilise les briques de l'acte 2 (`scenes.ts` : `registerAgent`,
  `feedback`, `certifyStep`, `payViaPayer`, le certificateur du chantier 04 via `certify.py`).
  - `node run.ts --rehearse-mainnet [--keystore <ks>] [--sweep]` : fork du mainnet (bloc tête − 20 lu sur
    `rpc1.monad.xyz`), minage à 1 s, facilitator émulé comme x402-rs, **base fee épinglé à 100 gwei** (sinon anvil le
    laisse décroître et la répétition ne paie pas la vraie facture).
  - `node run.ts --network mainnet --keystore ~/.foundry/keystores/ancre-demo --sweep` : le vrai run, réservé à Hugo.
- **Scènes** (ids 0, 1, 2, 4, ceux de l'écran) : 0 déploiements + ensemble d'ancres + provider-1 (demo) + payeur à trois
  rôles ; 1 deux ancres endossent, certificat, **paiement réglé par le facilitator** ; 2 **refus de payer Eve-8004
  (#182)** (`UNTRUSTED` à `/verify`, aucune transaction) ; 4 **disjoncteur** (slash d'anchor-B, refus au paiement
  suivant, certificat portant le veto, refus encore).
- **Garde-fous** (dans cet ordre) : `MAINNET_OWNER` obligatoire, adresse valide, ≠ opérateur, ≠ trésorerie (et
  opérateur ≠ trésorerie, que le contrat impose aussi) ; chainId 143 ; un vrai run refuse un anvil, une répétition
  refuse un vrai nœud (sinon un `--rpc` vers le mainnet enverrait sans confirmation) ; budget affiché avant tout
  envoi, arrêt si le MON ou l'USDC manque ; phrase tapée `send real Monad mainnet transactions` (TTY obligatoire) ;
  keystore = `0x8107…3c3F` sinon arrêt ; aucune collision owner/trésorerie avec un compte dérivé.
- **D47 vérifié à chaque run** (eth_call, rien d'envoyé) : l'opérateur (la clé de l'agent) ne peut ni `sweep` le
  payeur ni lever une pause ; l'owner humain le peut.
- **`--sweep`** : MON des 2 ancres rendu à l'opérateur, reste d'USDC de l'opérateur vers la trésorerie (AM-6.9 : la
  clé de l'agent ne garde pas d'USDC). L'USDC resté dans le payeur (0,02) ne sort que par l'owner.
- Petits changements partagés : `config.ts` (constantes `MAINNET`, sélection `NET` ; le testnet reste la valeur
  par défaut), `chain.ts` (mode `mainnet`, jamais « local »), `events.ts` (colonne explorateur fournie pour Eve, car
  `readAllFeedback(182)` **revert** en eth_call sur `rpc.monad.xyz`, MESURÉ 10/10), `scenes.ts` (exports, agents
  « externes » jamais passés au certificateur).

## Mesures

| | Valeur | Statut |
|---|---|---|
| Répétition complète | **23 vérifications PASS**, scènes 0, 1, 2, 4, ~25 s | MESURÉ-FORK, bloc 112 175 382, 10/10 |
| Nos transactions | 14, **15 002 341 gas de limites**, 1,530 MON à 102 gwei | MESURÉ-FORK |
| Solde de l'opérateur consommé | **1,520 MON** (4 → 2,480), à 101 gwei effectifs | MESURÉ-FORK |
| Requis avant départ (marge +30 %) | 2,04 MON et 0,03 USDC | calculé par le script |
| Facilitator (payé par lui) | 403 417 gas ≈ 0,041 MON, 1 règlement | MESURÉ-FORK |
| Masse robuste de provider-1 | 5,19 % > θ = 1 % | MESURÉ-FORK |
| Eve-8004 #182 | statut OK (agent inconnu), masse 0, refus `UNTRUSTED` ; owner = agentWallet = `0x97cD…0996` (fait on-chain) | MESURÉ-FORK |
| Gas price / base fee mainnet | 102 gwei / 100 gwei | MESURÉ 10/10 |
| Signer du facilitator sur 143 | `0x7f6a…Db86` (même que 10143), 94 344 MON | MESURÉ 10/10 (`GET /supported`, `cast balance`) |
| Solde de l'opérateur sur le mainnet | 15 MON, 0 USDC (vers 11:55 UTC) | MESURÉ 10/10 |

Répétition aussi passée avec un keystore de test (chemin `cast` du certificateur, signature par keystore).
Non-régression : `node run.ts` (fork testnet, 8 scènes) et `node run.ts --frozen` PASS ; `forge build` OK ;
typecheck `tsc --strict` (TypeScript 5.9.3 du plugin) sans erreur. Archive :
`docs/chantiers/rapports/mainnet-rehearsal/` ; budget détaillé : `demo/BUDGET.md` §7 ; procédure : `demo/RUNBOOK.md` §7.

## Commandes pour Hugo (Terminal.app, à la racine du dépôt)

```bash
export PATH="$PATH:$HOME/.foundry/bin"
(cd contracts && forge build) && (cd demo && npm ci)
export MAINNET_OWNER=0xD6FabC0A420127F493DeECdb461EaD4DAD644071
cd demo
node run.ts --rehearse-mainnet --keystore ~/.foundry/keystores/ancre-demo --sweep    # répétition, rien d'envoyé
node run.ts --network mainnet --keystore ~/.foundry/keystores/ancre-demo --sweep     # vrai run : phrase, puis mot de passe
```

En cas d'arrêt : relancer **la même commande** (reprise sur `demo/out/state-mainnet.json`, ne jamais le supprimer).
À renvoyer : `demo/out/state-mainnet.json`, `run-<ts>.json`, `run-<ts>.budget.json` et la sortie console ; les
adresses et transactions vont dans le tableau mainnet de `demo/JUDGES.md` (préparé, cases `_pending_`).

## Risques restants

1. **Le vrai facilitator sur 143 avec le payeur ERC-1271** : il a marché sur le testnet le 07/10 ; NON VÉRIFIÉ sur
   le mainnet. S'il refuse, la scène 1 s'arrête à « expected PAID » ; le refus d'Eve et le disjoncteur restent
   valables (`--scenes 2,4`).
2. **`eth_estimateGas` du vrai nœud contre celui d'anvil** : marge de 10 % ; un écart plus grand ferait échouer une
   transaction qui paierait quand même sa limite. Non observé sur le testnet le 07/10.
3. **Ancienneté du certificat** : `maxAge` = 288 000 blocs (≈ 24 h à 0,302 s) ; passé ce délai, provider-1 apparaît
   `STALE` à l'écran (il est de toute façon VETOED après la scène 4).
4. **0,02 USDC restent dans le payeur** : seul l'owner (MetaMask) peut les sortir, `sweep(USDC, 20000)`.
5. Les comptes de démo (ancres, wallet de provider-1) sont dérivés de la clé `ancre-demo` : la même clé qu'au
   testnet, donc les mêmes adresses d'ancres sur les deux réseaux.
6. Les chiffres d'Eve à l'écran (7 665 avis) viennent de l'instantané du 21/09, pas d'une relecture : la lecture
   complète ne tient pas dans un eth_call.

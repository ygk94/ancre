# Relais du pilote : constats de la revue maximale pour le chantier plugin (`plugin/`, hors bounty depuis D53)

> Source : `docs/revue/revue-max-2026-10-06-complete.md` et son JSON jumeau. Chaque constat y a son résumé, son scénario d'échec, souvent un test de reproduction, et un correctif proposé.
> **Ordre de traitement** : critique et haute **avant la démo** ; moyenne selon le temps ; faible et nettoyage après la soumission, sauf s'ils sont triviaux.
> Pour chaque constat corrigé : ajoute un test de non-régression (reprends le PoC du rapport quand il existe), puis note-le dans ton journal sous son identifiant.

> **M4 fait tomber la promesse de D47** (« seul un humain peut forcer un paiement ») : l'override se décide sur un payeur et un RPC choisis par celui qui lance la commande. **Tant que M4 n'est pas corrigé, le README et la vidéo ne doivent pas affirmer cette garantie.** K15 et A4a annoncent « non payé » un paiement qui a pu passer. Aucun chantier ne tourne sur le plugin : décision de Hugo (MUSTDO).

### Moyenne

- **K15** (`plugin/src/lib/flows.ts:249`, CONFIRMÉ) : Flux x402 « upfront » : une réponse non-2xx avec `PAYMENT-RESPONSE success:true` est annoncée refusée
- **A4a** (`plugin/src/lib/flows.ts:269`, CONFIRMÉ) : Après un paiement signé, toute réponse non-2xx sans preuve est annoncée « non payé »
- **K21** (`plugin/src/lib/flows.ts:319`, CONFIRMÉ) : `payer status` ne bannit que le wallet sélectionné, l'override bannit tous les wallets de l'hôte
- **M4** (`plugin/src/lib/override.ts:78`, CONFIRMÉ) : L'override « humain » se décide sur un payeur et un RPC choisis par l'appelant
- **M3** (`plugin/src/lib/x402-guard.ts:40`, CONFIRMÉ) : `ancreGuard` (garde SDK x402) ignore réseau, schéma, actif et montant

### Faible

- **D3e** (`plugin/src/commands/ancre/pay.ts:31`, CONFIRMÉ) : `--max-amount ""` supprime le plafond sans erreur
- **K17** (`plugin/src/lib/flows.ts:91`, CONFIRMÉ) : `check` : une erreur RPC sur `getAgentWallet` devient WALLET_MISMATCH
- **K16** (`plugin/src/lib/flows.ts:97`, CONFIRMÉ) : `check --naive` : un échec de la partie naïve fait perdre le verdict ANCRE
- **M1** (`plugin/src/lib/flows.ts:240`, CONFIRMÉ) : Sorties de `payFlow` non journalisées (GET payé qui échoue, signataire non opérateur, refus du wallet)
- **K18** (`plugin/src/lib/flows.ts:270`, CONFIRMÉ) : Note d'override attachée à SETTLEMENT_FAILED alors que l'override refuse ce cas
- **K20** (`plugin/src/lib/host.ts:14`, CONFIRMÉ) : `--rpc-url` : la chaîne du RPC n'est jamais comparée à `--chain-id`
- **A4g** (`plugin/src/lib/human.ts:55`, CONFIRMÉ) : Ctrl-C n'arrête pas la page de signature de l'override
- **A4d** (`plugin/src/lib/human.ts:67`, CONFIRMÉ) : Double clic sur la page d'override : signature refusée avec un faux motif après « Signed »
- **A4e** (`plugin/src/lib/interactive.ts:6`, CONFIRMÉ) : `-f json` ou un format persistant contournent le refus « --json » de l'override
- **A4f** (`plugin/src/lib/override.ts:85`, CONFIRMÉ) : Override « mal configuré » refusé seulement si owner ET treasury sont des adresses de l'agent
- **K19** (`plugin/src/lib/x402.ts:92`, CONFIRMÉ) : Offres au-dessus de `maxPerPayment` filtrées avant `decide` : OVER_LIMIT inatteignable
- **K5** (`contracts/src/TrustGatedPayer.sol:530`, PLAUSIBLE) : Signature d'opérateur high-s : le plugin la laisse passer, le payeur la refuse

### Nettoyage

- **SIMP7** (`plugin/src/lib/host.ts:75`, CONFIRMÉ) : Plugin : classes d'erreur dupliquées, code mort, erreurs brutes qui échappent à `toCommandError`

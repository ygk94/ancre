# Chantier 02-bis — corrections A, B, C du contrat et renommage (D48)

## 1. Objectif et résultat final attendu

Corriger les trois défauts de conception trouvés par la relecture de la norme (AM-08.A, B, C) et renommer `isTrusted` en `passesAnchorPolicy` (AM-9.5), **dans un seul lot cohérent**. Ce lot porte aussi le seul audit de code complet du contrat avant le déploiement : la revue maximale du 05/10 a été interrompue (AM-10.9).

Livrables :
- le contrat corrigé ;
- des vecteurs communs (avec 04-bis) ;
- les mesures de gas : coût de C, du veto par approbation, et nouvelle taille du contrat ;
- `ENCODING.md` et `PROOFS.md` à jour ;
- le rapport `docs/chantiers/rapports/02bis.md`.

## 2. La spécification

C'est `docs/conseil/tour7.md`, section **D-7.1**. Elle fait foi, et chaque écart doit être justifié dans le journal.

- **A, une ancre ne doit jamais être la source d'une ligne d'agent.** À la soumission, refuser toute ligne d'agent dont la source est une ancre de l'ensemble (`AnchorAsSource`). La source, c'est l'`agentWallet`, ou l'owner si VIA_OWNER est engagé. `proveWallet` invalide aussi une ligne dont le nouveau wallet devient une ancre.
- **B, la règle d'arête des contrôleurs.** Pour un contrôleur, si w > 0 : pas d'arête (comme aujourd'hui). Si w < 0 : **l'arête est conservée**. En mode strict, `assess` compte comme veto une ancre qui est `getApproved(j)` ou `isApprovedForAll(ownerOf(j), a)`. En mode rapide, `proveApproval` joue ce rôle.
- **C, pas de resoumission d'une ligne prouvée fausse.** Contrôler la forme canonique de chaque ligne à la soumission (alias, ordre, pas de zéros de bourrage). Ensuite, `provenFalse[setId][hash canonique]` rejette toute ligne déjà prouvée fausse, y compris sous REGISTRY_CHANGED.
- **Renommage** : `isTrusted` devient `passesAnchorPolicy`. Le changement d'ABI touche quatre consommateurs : payeur, plugin, indexeur, écran. **Le payeur (`TrustGatedPayer`) et ses tests sont adaptés dans ce lot**, puisqu'ils vivent dans `contracts/`.

## 3. Interfaces

- **La règle B change la règle d'arête normative** : solveur R6, indexeur `edges.ts`, ERC §3.3. Annonce-la dans `ENCODING.md` et dans le journal, sous « INTERFACE ». 04-bis s'aligne côté solveur, et le pilote relaie à l'indexeur et à l'ERC.
- **Vecteurs communs**, produits avec 04-bis : « ancre ≠ source » (A), « négatif d'un contrôleur » (B), « ligne prouvée fausse resoumise » (C), « 2ᵉ saut ».

## 4. Critères d'acceptation

- Les trois attaques sont rejouées en test : elles échouent après la correction, et elles réussissaient avant (test de non-régression daté). Pour A, il faut aussi le vecteur de démo `mainnet_slash_anchor`.
- Le test différentiel contre le solveur passe sur les nouveaux vecteurs.
- `/code-review high`, puis `/security-review`, **sur ce worktree** (AM-02.9).
- Pas de transaction réelle. Le déploiement sur le testnet suit, avec l'accord de Hugo (chantier 02-E9).

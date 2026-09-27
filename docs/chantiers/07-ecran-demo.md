# Chantier 07 — Écran de démo


## Méthode d'exécution et références (vague 3, 27/09)

1. **Stack** : Vite, React et viem, sans wagmi (`docs/ressources/design-demo-et-soumission.md`).
2. **Flux temps réel** avec `monadLogs` : états Proposed, Voted et Finalized, et **purge des blocs spéculatifs** abandonnés. Le code TypeScript est dans le design. Il est écrit comme une fonction pure, pour que le live et le rejeu passent par le même code.
3. **Les refus x402 ne laissent aucune trace on-chain** (AM-6.8) : afficher `explain()` et `reportRefusal` depuis le payeur.
4. **Les données viennent de l'indexeur Envio**, via l'API GraphQL. C'est ce qui rend le bounty Envio visible à l'écran.
5. **Il faut un domaine HTTPS fixe** si la scène Mera tourne sur l'écran (test multi-appareils). À décider avec Hugo.

**Skills** :
- `/dataviz` pour les chiffres et les graphes ;
- `/run` pour lancer et vérifier l'écran ;
- les skills artefact, si une page publique est souhaitée.

**Références** :
- temps réel Monad : https://docs.monad.xyz/monad-arch/realtime-data/spec-realtime ;
- abonnements WebSocket : https://docs.monad.xyz/reference/json-rpc/overview#websocket-subscriptions.

## 1. Objectif et résultat final attendu

Faire **sentir** la démo au lieu de l'expliquer. C'est un retour de jury passé (CLAUDE.md §2) : « la partie analyse n'a concrètement rien apporté ».

L'écran montre en direct, côte à côte :
- **la vue naïve**, c'est-à-dire la moyenne brute des avis ;
- **la vue ANCRE**, avec la masse, la borne e, le statut et le tag déclencheur ;
- **le disjoncteur** : un paiement refusé au bloc suivant un slash.

**Livrables** :
- `app/` : une application web locale ;
- un **mode « acte 1 »**, statique sur l'état du mainnet (ferme d'Eve, fuite par le scanner, contournement de #8317, chaîne honnête) ;
- un **mode « acte 2 »**, live, sur les événements du chantier 06 ;
- des captures pour la vidéo (09).

## 2. Contexte minimal

- **Acte 1** (mesuré par R4, `solver/out/mainnet.md`) :
  - Eve-8004 : moyenne naïve 1,53·10³⁶, masse ANCRE 0 ;
  - scanner comme ancre : 34,6 % de fuite sans D15, 0 avec ;
  - #8317 : 78 auto-notations rejetées ;
  - une seule chaîne honnête, dont le sort dépend du tour 4 (D16 et relais).
- **Acte 2** : les scènes du chantier 06.
- **Monad** : blocs de 0,3 à 0,4 s (la doc se contredit), finalité ~0,6 s, blocs spéculatifs.

## 3. Ce qui est déjà tranché

- On montre les chiffres réels, avec leur date. Ne rien afficher de « live » qui ne le soit pas : le registre n'est plus dormant depuis le 27/09, vérifier ce qui est réellement live au moment du tournage.
- Pas de brique « IA » décorative (CLAUDE.md §2).

## 4. Pistes à creuser

- **Flux temps réel** : WebSocket Monad, `monadLogs` ou `eth_subscribe`. Chercher dans la doc Monad comment signaler les blocs spéculatifs, les reorgs et la finalité, et **dédoublonner les blocs spéculatifs** (CLAUDE.md §9). N'afficher « refusé » qu'une fois l'événement final, ou bien afficher l'état spéculatif puis final. C'est un bon effet visuel s'il est expliqué.
- **Source des données** : la base de l'indexeur (03) pour l'historique, le flux direct pour le live, les appels `assess` pour l'état ANCRE.
- **Visualisation du graphe** : petite taille (support de quelques nœuds sur le mainnet, environ 100 en acte 2). Garder une lecture immédiate : la masse doit être visible, par exemple en taille ou en opacité des nœuds.
- **Contraste naïf / ANCRE** : c'est ce qui doit frapper. Un grand nombre (1,5e36) face à 0 est plus fort qu'un graphe.
- **Stack** : justifier le choix. Le plus simple qui tienne en démo live, sans dépendance fragile. Un build statique avec un petit serveur local suffit probablement.

## 5. Pièges connus

- La démo doit survivre à une panne du RPC : un **mode rejeu** depuis un journal enregistré est obligatoire.
- 25 rps sur `rpc.monad.xyz` : ne pas interroger `assess` en boucle ; s'abonner aux events.

## 6. Questions ouvertes

- Faut-il un écran unique, ou deux écrans (acte 1 et acte 2) ?
- Le jury peut-il utiliser l'écran lui-même, avec une URL publique ? Cela touche à la décision « dépôt privé » (CLAUDE.md §5) : demander à Hugo.

## 7. Critères d'acceptation

- L'acte 1 s'affiche à partir des données mesurées, et chaque chiffre affiché renvoie à sa source.
- L'acte 2 en fork : le refus s'affiche dans la seconde qui suit la finalité du bloc du slash (mesuré).
- Le mode rejeu fonctionne hors ligne.

## 8. Interfaces

- Consomme 03 (base), 05 (events de paiement) et 06 (journal de scènes).
- Produit des captures et des séquences pour 09.

## 9. Règles

Voir `README.md`. Aucun hébergement public sans accord de Hugo.

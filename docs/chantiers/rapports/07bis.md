# Rapport du chantier 07-bis : refonte du front

> Session du 2026-10-07, branche `chantier/07bis-front`, worktree `/Users/hugo/Projet/ancre-07bis`. Journal : `docs/chantiers/journal/07bis.md`.
> Statuts : MESURÉ, DOC, CALCULÉ (solveur ou écran), ENREGISTRÉ (journal du 06), CITÉ, ESTIMÉ, NON VÉRIFIÉ.
> **Aucun push, aucun déploiement, aucune transaction.** Commits sur la branche seulement.

## 1. Ce qui est livré

| Livrable | Fichiers | État |
|---|---|---|
| En-tête : Discover · Leaderboard · Live demo · Donate (*soon*) ; sélecteur Network : Monad testnet (actif), Monad mainnet (*preview*), Ethereum (*soon*, désactivé) ; thème clair / sombre | `ui/App.tsx`, `router.ts`, `config/networks.ts` | ✅ |
| Feed de gauche : onglet « ERC-8004 registry » (Envio + WebSocket `eth_subscribe logs`), onglet « ANCRE » (certificats, certificat fabriqué rejeté, veto, décisions du payeur) ; lignes cliquables vers l'agent | `ui/Feed.tsx`, `core/feed.ts`, `sources/useFeed.ts` | ✅ |
| Discover : « Pass » (statut, masse leave-one-out, méfiance, atteignabilité) puis « Most rated, refused » (contraste avis / moyenne naïve → masse 0) | `ui/Discover.tsx`, `core/runset.ts`, `core/mainnet.ts` | ✅ |
| Leaderboard : classement par masse ; sur le mainnet, le top 10 de 8004scan relu par ANCRE | `ui/Leaderboard.tsx` | ✅ |
| Page agent calquée sur 8004scan (carte d'identité, onglets, panneau latéral) : Overview, **Ratings (D49)**, **Trust path (D50)**, Certificates, Payments | `ui/AgentPage.tsx`, `core/path.ts` | ✅ |
| Live demo (acte 2) allégé, scène 7 « Second hop », rejeu hors ligne conservé | `ui/Live.tsx` (remplace `Act2.tsx`) | ✅ |
| D49 mainnet calculé par le solveur, θ = 1 % (D56), snapshot 110 994 810 | `scripts/export_act1.py` → `src/data/act1.json` | ✅ |
| Plan de tournage et doc de l'écran | `demo/VIDEO-SHOTS.md`, `demo/SCREEN.md` | ✅ réécrits |
| Tests | `test/discover.test.ts` (+17) | ✅ **27/27**, `tsc -b` et build verts |

### Captures (`docs/chantiers/rapports/07bis/`, 1920×1080 sauf iPhone 390 px, 0 erreur de console)

| Capture | Ce qu'elle montre |
|---|---|
| `discover-mainnet.png` | « Reached from these anchors: 3 of 10,281 » ; refusés : **Eve-8004, 7 665 avis, moyenne 1,5264 × 10³⁶ → 0** |
| `discover-screener.png` | lentille « scanner lu comme confiance » : **34,56 % de la masse atteint la ferme**, personne ne passe |
| `agent-eve-ratings.png` | D49 : 0 sur 7 665 avis portent du poids ; « even if every tag counted: 7,548 count for 0, 117 rejected » |
| `discover-testnet.png` | provider-1 (2 ancres) et provider-3 (2 sauts) passent ; farm target 11 avis, moyenne 100 → 0 ; provider-2 vetoed |
| `agent-p3-path.png`, `agent-2nd-hop-dark.png` | D50 : ancres A, B → provider-1 → provider-3 ; mainnet : ancres → #18 → #2 |
| `agent-p2-overview.png` | vue d'ensemble d'un agent vetoed |
| `leaderboard-mainnet.png` | classement ANCRE + top 10 de 8004scan (cité) relu par ANCRE |
| `live-farm-dark.png` | Live demo, thème sombre : farm target 100 contre 0, Refused · UNTRUSTED, `explain()` |
| `iphone-discover-mainnet.png`, `iphone-eve.png` | largeur iPhone : pas de défilement horizontal, feed sous le contenu, plafonné à 8 lignes |
| `ref-8004scan-agent.png` | la fiche de référence de 8004scan (capture headless du 07/10) |

## 2. Source de chaque donnée affichée

Détail complet : `demo/SCREEN.md` §2. Résumé :

| Donnée | Source | Statut |
|---|---|---|
| Testnet : statut, masses, e, bloc du certificat, veto | `assess()` lu par le script du 06 (`agent.contract` du run `run-20261006T121308Z`) | ENREGISTRÉ, **sur un fork du testnet** (l'écran le dit) |
| Testnet : D49, D50 | règles R2-R6 appliquées par l'écran aux avis du journal, avec le schéma engagé dans `set.tags` | CALCULÉ par l'écran ; contribution « — » |
| Testnet : α = 1/3, ρ = 1/2 | `demo/lib/config.ts` (absents de l'en-tête du journal) | DOC du script |
| Mainnet : passe / refus, masses, atteignabilité, D49 avec contributions, fuite vers la ferme | `export_act1.py` → solveur de référence, snapshot 110 994 810, θ = 1 % appliqué hors chaîne | CALCULÉ, **jamais « certified »** |
| Avis, moyenne naïve, owner (pages agent réelles) | Envio GraphQL, en direct | MESURÉ |
| Feed registre | Envio (sondé toutes les 8 s) + WebSocket public des deux réseaux | MESURÉ |
| Noms (mainnet), score et top 10 de 8004scan | API publique de 8004scan, instantané daté du 06/10 09:52 UTC | CITÉ |
| Noms (feed) | `Agent.uri` en `data:`, décodé dans le navigateur ; sinon « #id » | MESURÉ |

## 3. Ce qui reste mocké ou « — »

- **Mocké** : les avatars à initiales (habillage). Rien d'autre.
- **« — »** : contribution par avis sur le testnet (pas de B⁺ dans le journal) ; set id et e « on-chain » sur le mainnet ; avis d'un vrai agent du testnet hors de l'ensemble (listés sans poids) ; preuves d'écart (aucune dans le run).
- **Pas fait** : le feed ANCRE depuis Envio (l'endpoint n'a pas le schéma v3) ; Alchemy (clé côté serveur) ; relecture `assess()` en direct sur la page agent du testnet (prévue dès qu'un run `mode: testnet` existe : seule la Live demo relit aujourd'hui).

## 4. Décisions et raisons

| Décision | Raison |
|---|---|
| Donate = onglet « soon » désactivé | choix de Hugo (07/10) ; aucune transaction avant la soumission |
| Mainnet sélectionnable en « preview », testnet par défaut | choix de Hugo (07/10) : la preuve d'Eve reste à l'écran, étiquetée « computed off-chain, not certified » |
| Agents du run sur fork en route `/agent/demo/:id`, sans lien 8004scan | leurs numéros désignent d'autres agents sur le vrai testnet (« Ship » pour #2022, relevé 07/10) |
| Feed en deux onglets, pas mélangé | les blocs du fork ne sont pas des blocs du testnet : les trier ensemble fausserait la chronologie |
| Mainnet : « Reached from these anchors », pas « Pass » en tête de liste, avec une phrase « not a ranking of honest agents » | CLAUDE.md §6 (constat de la revue) |
| D49 mainnet calculé dans l'export, avec un auto-contrôle (somme des contributions = masse brute certifiée) | les poids viennent du même certificat que la masse : rien n'est recalculé à part |
| Ligne « even if every tag counted » | sous le schéma de référence, les avis d'Eve sont « hors schéma » ; la raison de fond (auteurs injoignables) est calculée, pas affirmée |
| Routeur maison (History API) et `base: "/"` | pas de dépendance ; routes profondes servies par la redirection SPA existante ; `/mera` pourra être un fichier statique du build |
| Pas de skill frontend-design | non disponible dans cette session : design fait à la main, typo 13-20 px |

## 5. Angles morts (AM-07bis)

- **AM-07bis.1** : collision des numéros d'agents entre le fork et le vrai testnet. Traité par la route `demo`, à surveiller dans la vidéo (checklist).
- **AM-07bis.2** : l'endpoint Envio `433cc83` est antérieur au schéma v3 (`Certificate` absent, MESURÉ 07/10).
- **AM-07bis.3** : sur le testnet, tout le contenu ANCRE vient d'un run **enregistré sur fork**, pas d'une lecture en direct. Les règles (§9.4) demandent de vraies interactions Monad : le run testnet du 06 reste nécessaire. L'écran bascule de lui-même dès qu'un run `mode: testnet` est synchronisé (pill verte « on-chain », routes `/agent/testnet/…`).
- **AM-07bis.4** : noms non décodés pour les `agentURI` distantes (« #id »).
- **AM-07bis.5** : le WebSocket `logs` n'a reçu aucun log de registre pendant la mesure (20 s, 07/10) : la ligne provisoire « ● » n'est pas encore vue en vrai, seulement testée sur des données construites.
- **AM-07bis.6** : la liste mainnet se limite aux agents exportés (mis en avant + support du solveur) ; un autre agent ouvert depuis le feed affiche « unknown to your anchors », ce qui est vrai (le solveur a tourné sur tout le registre), mais ses avis ne sont pas classés un par un.

## 6. INTERFACE (rien de modifié hors de `app/`, `demo/*.md`, journal et rapport)

- **Indexeur** : redéployer le schéma v3 sur Envio Cloud avec l'adresse persistante d'`AnchoredReputation` sur le testnet ; l'écran ajoutera alors `Certificate` et `Discrepancy` au feed ANCRE.
- **Chantier 06** : synchroniser le run testnet (`npm run sync:runs`) dès qu'il existe ; il passe en tête de `index.json`.
- **Alchemy (D55)** : une fonction Netlify avec `ALCHEMY_KEY` en variable d'environnement serait la voie la plus courte pour la Transfers API. Non fait.

## 7. État de VIDEO-SHOTS.md

Réécrit pour le nouvel écran : 11 plans, **2:55** (plan 4 optionnel, coupé en premier), indices `at=` du run `run-20261006T121308Z`, phrase « the point is to add this layer to 8004scan », 2ᵉ saut au plan 6 (D50), checklist d'honnêteté (preview, fork, AM-07bis.1). Le plan 5 et le plan 8 dépendent du run testnet (« testnet » ou « fork », latence Monad seulement sur un run testnet).

## 8. Questions pour Hugo

1. 🧑 **Run de l'acte 2 sur le vrai testnet** : c'est lui qui rend la pill « on-chain » vraie sur Discover et donne la latence Monad du plan 8. Ensuite : `npm run sync:runs`.
2. 🧑 Faut-il garder la lentille « A reader who anchors inside the farm » dans le sélecteur, ou la réserver au README ?
3. 🧑 Alchemy : veux-tu une fonction Netlify pour la Transfers API (« les 7 665 noteurs d'Eve ont reçu leur premier MON de son propriétaire » sur la page d'Eve) ? Il faudrait mettre la clé dans les variables d'environnement de Netlify.
4. 🧑 Fusion de la branche dans `main` : à ta main (le site se republie à chaque push sur `main`).

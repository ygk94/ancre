# Chantiers ANCRE — index, ordonnancement, règles communes

> Rédigé le 2026-09-27 (étape R6b de la feuille de route, `docs/conseil/CR-conseil.md`).
> Clôture des soumissions Monad Metropolis : **2026-10-13**. Il reste 16 jours.

> **Mise à jour du 27/09** : les tours 4 et 5 sont faits. Les chantiers doivent appliquer **D20 à D37**. **Priorité absolue du chantier 02 : D32** (le contrat ne relit aucune arête dans le registre, et un certificat fabriqué passe). Les briefs 02, 04, 06, 08 et 09 portent un bloc « Amendements du tour 5 ». Les décisions D20 à D37 (CR, section « Tour 4 »), priment sur les pistes des briefs quand elles divergent.

## Comment utiliser ces briefs

Un chantier se traite dans **une discussion Claude Code dédiée**. On l'ouvre avec :

> « Lis `CLAUDE.md`, `docs/chantiers/README.md` puis `docs/chantiers/NN-….md`, et prends en charge ce chantier. »

Les briefs **orientent, ils ne résolvent pas**. Leur section « Pistes techniques » nomme des structures, des fonctions et des pièges, mais ce sont des **points de départ à vérifier**, pas des réponses. La session doit :
- aller lire la source primaire : le code des registres, la doc Monad, les EIP, le code déjà écrit, les données on-chain ;
- contredire le brief quand la source le contredit ;
- prendre le temps d'être précise sur son sujet. C'est pour ça qu'elle existe.

## Skills à utiliser, et quand

| Moment | Skill | Pour quoi |
|---|---|---|
| Décision difficile ou coûteuse à annuler (architecture, spec, arbitrage) | `/llm-council` | 5 experts, relecture croisée à l'aveugle, décision tranchée. C'est le protocole des tours 1 à 5 |
| Trouver une idée **originale** : bounty Mera, angle Envio qui sort du lot, scène de démo | `/llm-cross-idea` | 5 explorateurs croisent l'idée de base avec une source (doc Mera, doc Envio, fiche du bounty), 4 juges notent, 1 président tranche |
| Après chaque lot de code (contrat, router, payeur, plugin, indexeur) | `/code-review` (niveau `high` sur le chemin critique) | Bugs de correction ; `--fix` pour appliquer |
| Avant tout déploiement, et avant la soumission | `/security-review` | Contrats et payeur ERC-1271 : réentrance, contournement de la garde, arrondis |
| Code qui a grossi vite | `/simplify` | Réutilisation, simplification |
| Graphiques de l'écran de démo, figures du pitch | `/dataviz` | Palette cohérente, lisibilité |
| Page de démo partageable, ou dashboard | artefact (skills `artifact-design`, `artifact-capabilities`) | Page hébergée privée, avec lien |
| Lancer l'appli ou l'écran pour vérifier | `/run` | Démarrer et contrôler l'application |
| Indexeur Envio (chantier 03) | **skills Envio** : `envio skills update`, plus le serveur MCP de docs Envio (voir `docs/ressources/envio.md`) | Le guidage officiel d'Envio pour HyperIndex |
| Plugin MetaMask (chantier 05) | **skills MetaMask** : https://github.com/MetaMask/agent-skills (`metamask-agent-wallet/SKILL.md`) | Modèle officiel, en plus du `SKILL.md` qu'on doit livrer |

## Les chantiers

| # | Chantier | Résultat final | Dépend de |
|---|---|---|---|
| 01 | [Tour 4 du conseil](01-conseil-tour4.md) | ✅ **fait le 27/09** : D20 à D26 dans le CR (dont D26, certificat par sous-solution, qui change le contrat et le solveur) | — |
| 02 | [Contrat vérificateur](02-contrat-verificateur.md) | `AnchoredReputation.sol` complet, testé, déployable ; **d'abord D32 (relecture des arêtes) et sa mesure** | 01 |
| 03 | [Indexeur](03-indexeur.md) | Base locale fidèle au registre, reconstruite on-chain | 01 (règles D16) |
| 04 | [Solveur et certificateur](04-solveur-certificateur.md) | Service qui publie et tient à jour les certificats ; surveillant de contestation | 01, 02, 03 |
| 05 | [Router x402 et politique](05-router-x402.md) | `TrustGatedRouter` : un paiement x402 refusé ou accepté selon `assess` | 02 |
| 06 | [Ferme Sybil et scénarios](06-ferme-scenarios.md) | Acte 2 scripté et rejouable sur le mainnet, budget en MON chiffré | 02, 04, 05 |
| 07 | [Écran de démo](07-ecran-demo.md) | Écran live : naïf contre ANCRE, disjoncteur visible | 03, 06 |
| 08 | [Norme et publication](08-norme-publication.md) | ERC finalisé, vecteurs de test, brouillons de publication prêts (pas publiés) | 01 ; alimenté par 02 et 04 |
| 09 | [Pitch, vidéo, soumission](09-pitch-soumission.md) | Dossier de soumission complet, acte 1 reproductible par le jury | tous |

## Ordonnancement proposé (à réviser par chaque session)

| Dates | En parallèle |
|---|---|
| **28/09** | **01**, qui bloque les autres. En même temps : 03 (partie « extraction brute », indépendante des règles) et 08 (relecture du draft) |
| 29/09 → 03/10 | **02**, **03**, **04** ; 08 en continu |
| 02/10 → 06/10 | **05**, **06** (script de ferme, budget MON) |
| 05/10 → 09/10 | **07** ; déploiement mainnet le 09/10 au plus tard |
| 09/10 → 12/10 | **09** : vidéo, dossier. **Soumission le 12/10**, un jour de marge |

**Chemin critique** : 01 → 02 → 04 → 06 → 07 → 09. Tout retard sur 02 ou 04 se répercute sur la démo.
**Peut glisser sans casser la démo** : 08 (la publication peut suivre la soumission), les preuves d'écart (ii) à (iv) du chantier 02, la pré-rotation d'`anchorId`.

## Formats d'échange entre chantiers

| Format | Producteur → consommateur | Fichier de référence |
|---|---|---|
| Base d'avis et état des registres | 03 → 04, 07 | à définir par 03 (`indexer/SCHEMA.md`) |
| Certificat, calldata, vecteurs de test | 04 ↔ 02 | `solver/FORMAT.md` et `contracts/ENCODING.md` (alignés le 27/09) |
| Interface `assess` / statuts | 02 → 05, 07 | `contracts/src/AnchoredReputation.sol`, `docs/erc/anchored-reputation.md` §6 |
| Événements de démo | 06 → 07 | à définir par 06 |

Si un chantier change un format, il **met à jour le fichier de référence et le signale** dans le CR.

## Règles communes à toutes les sessions

1. **Répondre en français.** Code, README et ERC en anglais.
2. **Tout chiffre est sourcé et daté**, et marqué **MESURÉ / DOC / ESTIMÉ / NON VÉRIFIÉ**. Un chiffre du CR n'est pas une vérité : il a sa date et son statut.
3. **Les décisions D1 à D19 du CR ne se rouvrent pas sans preuve chiffrée.** Si une mesure les contredit, on le dit franchement dans le CR.
4. **Pas de commit, pas de push, pas de transaction réelle, pas de publication externe** sans accord explicite de Hugo. Les simulations, `eth_call` et forks sont libres.
5. **Le vault** (`/Users/hugo/Projet/dataBlockchain`) est en lecture seule.
6. **Environnement** : `export PATH="$PATH:$HOME/.foundry/bin"` (forge et cast 1.8.3) ; `python3` = 3.14 ; `gh` absent.
   - RPC `https://rpc.monad.xyz` (25 rps, `eth_getLogs` ≤ 100 blocs) ;
   - `https://rpc1.monad.xyz` (accepte tout l'historique en `eth_getLogs`, mesuré le 27/09) ;
   - testnet `https://testnet-rpc.monad.xyz` (registres ERC-8004 présents à d'autres adresses : Identity `0x8004A818…BD9e`, Reputation `0x8004B663…8713`).
7. **En fin de session**, deux mises à jour :
   - dans le CR, **une section « Résultats du chantier NN »** : ce qui est livré, les chiffres, les angles morts numérotés `AM-NN.k`, les questions ouvertes ;
   - dans la **feuille de route**, le statut de l'étape.
8. **Avant de coder**, relire le code et les docs déjà écrits dans le dépôt (angle mort AM-3.13 : on a déjà réinventé ce qui existait).

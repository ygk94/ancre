# Feuille de route par chantier — agents et skills

> Rédigé le 2026-09-28. Soumission visée le **12/10** (clôture le 14/10 à 05:59, heure de Paris).
> **Agents** = nombre d'agents Claude Code à lancer **en parallèle** pour l'étape, dans la session du chantier.
> **Skills** : voir `README.md` pour le détail.
> Les étapes marquées 🧑 attendent une action de Hugo (`mustdo/MUSTDO.md`).

## 01 — Tour 4 du conseil : ✅ terminé le 27/09

Décisions D20 à D26. Les tours 5 et 6, les vagues de recherche et la décision D38 ont suivi hors chantier (D27 à D46 dans le CR). Il n'y a plus d'étape à planifier.

## Jour 0 : prérequis de Hugo (bloquants)

MUSTDO 0 à 4 : inscription avant le 06/10, relecture des règles, projet et bounties sur la plateforme, question sur l'éligibilité MetaMask, token Envio. Sans eux, les chantiers 03 et 09 ne peuvent pas finir.

Il faut aussi, **pour le 29/09** : un domaine HTTPS fixe et le `rpId` (Mera), et les deux appareils prêts.

## 02 — Contrat vérificateur (Dev 1) · 28/09 → 04/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | **D39** : la politique (θ, ρ, m, q, maxAge, eLow_max) est engagée dans le `setId` ; ajout de `isTrusted` | 1 | `/code-review high` |
| E2 | **D32, Registry-verified** : relecture de chaque arête, **puis mesure du gas**. Si c'est trop cher, repli sur Submitter-attested | 2 (implémentation + banc de mesure) | `/code-review high` |
| E3 | Preuve (v) FABRICATION, B⁺ déclaré, `t ≤ y`, règle de remplacement (AM-5.16) | 1 | `/code-review high` |
| E4 | D33 (veto au dernier avis), D35 (mode strict), D36 (eLow_max) | 1 | `/code-review` |
| E5 | D37 : lemmes L1 à L5, fuzz, test différentiel contre le solveur, vecteurs des 4 violations | 2 (lemmes + tests) | `/code-review` |
| E6 | D44, repli owner et gel des arêtes sortantes (si Hugo le valide) | 1 | `/code-review` |
| E7 | D28 : test en fork de l'upgrade vers la PR #80 | 1 | — |
| E8 | D43 : `AnchorRegistry`, pré-rotation, `rotateBySig`. **Seulement si le prototype Mera (06-E3) passe** | 1 | `/code-review high` |
| E9 | Revue de sécurité, puis déploiement sur le testnet et vérification de la source | 1 | `/security-review`, `/code-review` |

## 03 — Indexeur Envio (Dev 2) · 28/09 → 10/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | **Jour 1** : (a) un handler a-t-il accès au calldata ? (b) scan HyperSync de survie des avis sur 3 chaînes | 2 | skills Envio (`envio skills update`), MCP de docs Envio |
| E2 | `config.yaml`, `schema.graphql` et handlers en TypeScript, en local (Effect API, double exécution des handlers) | 1 | skills Envio, `/code-review` |
| E3 | Tests de parité entre les arêtes de l'indexeur et celles du solveur (avec 04-E3) | 1 | — |
| E4 | Audit des certificats : entités `Discrepancy` et `SetHealth`, preuve (v) prête à soumettre | 1 | `/code-review` |
| E5 | 🧑 Envio Cloud : premier déploiement le 01/10, déploiement final entre le 06 et le 10/10, dépôt public `ancre-indexer` | 1 | skills Envio |

## 04 — Solveur et certificateur (Dev 3) · 29/09 → 05/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | `graph.py` : copie de ligne (D20), suppression de la règle « ancien owner », D44 ; itération depuis 0 ; régénération des vecteurs | 1 | `/code-review` |
| E2 | Intégrer les tests du tour 5B (`scratchpad/tour5B/t1-t3`) dans `solver/tests` | 1 | — |
| E3 | `from_indexer.py`, et parité avec l'indexeur | 1 | — |
| E4 | Service certificateur : déclencheurs, gas limit serrée, découpage, soumetteur attesté | 1 | `/simplify`, `/code-review` |
| E5 | Surveillant et bot de preuves pendant le jugement (13 → 27/10) | 1 | `/code-review` |

## 05 — Payeur, router et plugin MetaMask (Dev 1, après 02-E4) · 01/10 → 07/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | Payeur ERC-1271 (D41) : intégrer les tests en fork de la vague 2, appel à `isTrusted`, `explain`, `reportRefusal` | 1 | `/security-review`, `/code-review high` |
| E2 | 🧑 **Test T1 sur le testnet** via le facilitator. Il décide de l'architecture | 1 | — |
| E3 | Plugin `mm ancre` : 5 commandes, `skills/ancre/SKILL.md`, flux x402, README, démo de 5 minutes au plus | 2 (code + SKILL/README/démo) | skills MetaMask (`MetaMask/agent-skills`), `/code-review` |
| E4 | Garde côté client (b), `onBeforePaymentCreation`, en repli | 1 | `/code-review` |

## 06 — Ferme et scénarios (Dev 3, après 04-E1) · 29/09 → 08/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E3 | 🧑 **À faire dès le 29/09, en premier** : prototype Mera, avec la dérivation de 2 époques sur 2 appareils. Il conditionne 02-E8 | 1 (+ tes appareils) | — |
| E1 | `demo/BUDGET.md` : deux enveloppes, avec la scène « la ferme se paie vraiment » (D45) | 1 | — |
| E2 | Scripts des scènes 1 à 6, plus la ferme qui se paie vraiment, sur le testnet | 2 | `/run`, `/code-review` |
| E4 | Démo figée sur un bloc (état anvil exporté) | 1 | `/run` |
| E5 | 🧑 Exécution minimale sur le mainnet (D40), budget validé | 1 | `/run` |

## 07 — Écran de démo (Dev 2, après 03-E2) · 05/10 → 09/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | Squelette Vite, React et viem ; flux `monadLogs` (états Proposed, Voted, Finalized, purge des blocs spéculatifs) | 1 | `/run` |
| E2 | Vue naïf contre ANCRE, statut, tag déclencheur, refus reconstitués avec `explain` | 1 | `/dataviz` |
| E3 | Mode rejeu hors ligne et données de l'indexeur (GraphQL) | 1 | `/run` |
| E4 | 🧑 Hébergement sur le domaine HTTPS (nécessaire pour la scène Mera) | — | artefact si une page publique est voulue |

## 08 — Norme et publication (Quant) · en continu

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | Intégrer les tours 4 à 6 et les décisions D39 à D46 dans `docs/erc/anchored-reputation.md`, et traiter les ⟦OPEN⟧ | 1 | — |
| E2 | Vecteurs de test normatifs (avec 04) | 1 | — |
| E3 | Brouillons : PR sur ERCs, réponse au #309, divulgation aux auteurs d'ERC-8004, message à ColinkaMir | 1 | — |
| E4 | Relecture adversariale du texte avant publication | 1 | `/llm-council` |

## 09 — Pitch et soumission (Hugo) · 08/10 → 12/10

| Étape | Contenu | Agents | Skills |
|---|---|---|---|
| E1 | Recalculer les chiffres au tournage (9 283 avis, chaîne honnête sous D20, latences mesurées sur le mainnet) | 1 | — |
| E2 | Figures du pitch, diapositive « complementary layers » | 1 | `/dataviz` (+ `anthropic-skills:pptx` si un .pptx est demandé) |
| E3 | Write-up, README public, licence (MIT ou Apache-2.0 pour le code, CC0 pour l'ERC), déclaration IA | 1 | `/code-review` du README |
| E4 | 🧑 Tournage de la vidéo (storyboard en 11 plans, 2:55), puis soumission le 12/10 | — | — |

## Totaux et parallélisme

- **Pic d'agents simultanés** :
  - environ 6-7 du 29/09 au 03/10 (02-E2, 03-E1, 04-E1, 06-E3, 08-E1) ;
  - environ 4-5 ensuite.
- **Chemin critique** : 02-E1 → 02-E2 (mesure) → 04-E4 → 06-E2 → 07-E2 → 09-E4.
- **Tests qui décident de l'architecture** : 02-E2 (coût de Registry-verified), 05-E2 (T1 via le facilitator), 06-E3 (Mera sur deux appareils), 03-E1 (accès au calldata).

## Dépendances entre chantiers

```
                 ┌──────────── 03-E1 accès au calldata ?────────────┐
                 │ non → le contrat émet les rows dans un event        │
                 ▼                                                   │
02-E1 D39 ──▶ 02-E2 D32 mesure ──▶ niveau de certification ─────────┤
   │            │  Registry-verified ?                                │
   │            │   oui → soumission ouverte, fabrication impossible  │
   │            │   non → Submitter-attested + preuve (v) obligatoire │
   │            ▼                                                   ▼
   │        ENCODING.md ◀──── alias de ligne (D20/D44) ────▶ solver/FORMAT.md (04-E1)
   │                                                               │
   ├──▶ 05-E1 payeur (isTrusted) ──▶ 05-E2 T1 facilitator ──▶ garde dure oui/non
   │                                                               │
   │   règles d'arêtes (D14/15/16/20/44) : solveur = référence ──▶ 03-E2 indexeur (port TS)
   │                                        parité 03-E3 ⇄ 04-E3   │
   ▼                                                               ▼
02-E9 déploiement testnet ──▶ 04-E4 certificateur ──▶ 06-E2 scènes ──▶ 07 écran ──▶ 09 vidéo
06-E3 prototype Mera ──▶ oui : 02-E8 AnchorRegistry · non : dossier de veto seul (pas de contrat)
03-E4 audit ⇄ niveau de 02-E2 (voir ci-dessous) · 08 ⇐ décisions de 02 et 04, vecteurs de 04
```

## Portes de faisabilité : à passer en premier, en parallèle

| Porte | Ce qu'on ne sait pas | Si elle passe | Si elle échoue | Ce qui en dépend |
|---|---|---|---|---|
| **P1 = 02-E2**, coût de Registry-verified | Relire chaque arête on-chain. ESTIMÉ ≈ 13,6 M gas pour la démo, à partir de coûts mesurés (≈ 11 k pour `getLastIndex` et ≈ 15 k par avis lu, à travers le proxy). **Inconnue majeure** : « dernier index **du tag** » peut obliger à lire tous les index intermédiaires d'un couple, ce qui n'est pas borné (execution.market a des couples à plusieurs avis) | Soumission ouverte à tous ; la fabrication devient impossible | Submitter-attested (le propriétaire de l'ensemble soumet, D27), et la preuve (v) devient **indispensable** | 04-E4, 03-E4, 08, 09 (ce que l'on promet dans le pitch) |
| **P2 = 03-E1**, accès au calldata dans un handler Envio | La doc ne dit pas clairement si le champ `input` de la transaction est sélectionnable | L'audit décode directement `submitCertificate` | Le contrat émet les lignes dans un event : gas en plus, et l'encodage change (02-E2 et ENCODING) | 02-E2 (mesure à refaire avec l'event), 03-E4 |
| **P3 = 05-E2**, test T1 du facilitator | Le facilitator accepte-t-il de payer le gas d'un `isValidSignature` qui appelle `isTrusted` (77 à 190 k) ? Le code x402-rs n'a pas de plafond, mais ce n'est pas testé | Garde dure : « le contrat refuse de payer » | Garde côté client seulement (b). Le plugin MetaMask reste possible, mais le message du pitch s'affaiblit | 05-E3, 06-E2, 09 |
| **P4 = 06-E3**, Mera sur deux appareils | Le PRF est-il reproduit sur iCloud Keychain ou 1Password, avec notre `rpId` ? | 02-E8 (`AnchorRegistry`, `rotateBySig`) et la scène de rotation | Repli sur le seul dossier de veto, sans travail de contrat | 02-E8, 06-E2, bounty Mera |

**Découplages à exploiter**
- **P3 n'a pas besoin du vrai contrat.** Un payeur ERC-1271 dont la garde est un simple bouchon qui brûle environ 190 k gas suffit à tester le facilitator. On peut donc le faire **dès le 29/09**, en parallèle de 02, avec l'accord de Hugo.
- **P2 se teste avec un contrat factice** qui émet un `submitCertificate` sur le testnet. Il ne dépend pas de 02.
- **Règles d'arêtes** : le solveur (04-E1) fait **référence**. L'indexeur (03-E2) les porte en TypeScript, et la parité (03-E3 ⇄ 04-E3) sert de juge. Il faut donc finir 04-E1 **avant** de figer 03-E2.

**Interactions à surveiller**
- **02-E2 ⇄ 03-E4.** Si Registry-verified est abordable, la fabrication devient impossible on-chain. L'audit Envio garde alors surtout les **omissions** et les arêtes **périmées**, et son intérêt pour le bounty baisse un peu (il reste l'analytique multichain et la parité). Si c'est Submitter-attested, l'audit devient central, puisque c'est lui qui déclenche la preuve (v).
- **D20 et D44 (copie de ligne, repli owner) ⇄ encodage.** L'« alias de ligne » doit être défini **une seule fois**, dans ENCODING.md et FORMAT.md, avant 02-E3 et 04-E1.
- **02-E1 (D39) change le `setId`**, puisque la politique y est désormais engagée. Les vecteurs de test (04, 08) et le payeur (05) doivent attendre cette version.


---

## Plan daté du 06 au 12/10 (tour 7, D52) (sessions sur cette machine, une par worktree, le journal comme seul canal)

| Jour | Hugo | Sessions et agents | Skills |
|---|---|---|---|
| **Lun 06/10** | **Avant tout** : inscription et projet (track 04, Envio, Mera, et MetaMask en attente), recopie de la modale Rules, question au support (MetaMask, vidéo par bounty), **décision de divulgation** et envoi du brouillon (c) si oui. **Soumission d'assurance, dépôt encore privé** (D-7.4). Keystore chiffré, faucet testnet (≥ 15 MON, 1 USDC). Domaine HTTPS et `rpId` pour Mera | **02-bis** (nouvelle session, 2 agents) : D-7.1 complet + vecteurs AM-08.22. **04** (1 agent) : snapshot rafraîchi, vecteurs « 2ᵉ saut » et « ancre ≠ source », règle R6 pour w < 0. **06-E1/E2** (1 session) : budget et scripts des scènes sur fork, sur l'ABI renommée | `/code-review high`, `/llm-council` (si une décision bloque) |
| **Mar 07/10** | Feu vert T1, mise à disposition du MON de testnet. Prototype Mera sur 2 appareils (06-E3, avec un agent) | **02-bis** : fin, `/security-review`, mesures de gas (C, veto par approbation). **03** : handler `CertificateSubmitted` sur l'ABI finale, règle w < 0, diagnostic « ancien contrôleur ». **05** : T1 réel (une seule exécution), adaptation au renommage. **07** démarre (1 session) : Vite + React + viem, mode rejeu, poids effectif | `/security-review`, `/code-review`, `/dataviz` |
| **Mer 08/10** | Autoriser le **déploiement testnet** (environ 0,9 MON de testnet) | **02** : déploiement testnet et vérification (MonadVision et Sourcify). **06** : scènes 1 à 6 et 2ᵉ saut **sur le testnet**. **07** : branchement GraphQL (03) et flux `monadLogs`. **02-E8 / Mera** si P4 est passée, sinon coffre seul. **08** : ERC mis à jour (D-7.1, renommage, extensions) | `/run`, `/code-review` |
| **Jeu 09/10** | **Valider le budget mainnet** (environ 2 MON, ESTIMÉ) puis l'exécution minimale. Décider du dépôt public et de la licence (MIT ou Apache-2.0, en remplaçant les SPDX CC0) | **06** : répétition complète, export de l'état figé, exécution mainnet minimale. **03** : déploiement Cloud final. **09** démarre : write-up, README public, nettoyage avant publication | `/run`, `/simplify` |
| **Ven 10/10** | Relecture du README et du write-up | **09** : enregistrement de répétition, figures. **07** : finitions, mode rejeu validé hors ligne. Mise à jour de la soumission d'assurance | `/dataviz`, `/code-review` |
| **Sam 11/10** | **Voix et tournage** de la vidéo de 3 minutes, publication YouTube ou Loom. **Dépôt rendu public** (après la divulgation) | **09** : montage, chiffres recalculés au tournage, champs Envio et Mera du formulaire | — |
| **Dim 12/10** | **Soumission finale** | Pilote : vérification de la soumission, gel de `main`, publication de `ancre-indexer` | — |
| Lun 13/10 | Marge (clôture le 14/10 à 05:59) | Surveillant actif à partir du 13/10, pendant le jugement | — |

**Dépendances critiques envers Hugo**
- Le 06 : l'inscription, la divulgation et le keystore avec le MON de testnet. Sans eux, 02-bis ne peut pas déployer et 06 ne peut pas jouer sur le testnet.
- Le 07 : T1 et les appareils Mera.
- Le 09 : le budget mainnet et le dépôt public.


**Ajustement du 06/10 (D53)** : le bounty MetaMask n'est plus visé. Le chantier 05 ne fait plus que l'adaptation au renommage (`passesAnchorPolicy`) et le test T1, qui reste utile pour la garde dure de la démo. Aucun autre travail sur le plugin.

**Lots du 06/10** :
- **02-bis** : correction A, B, C et renommage (`docs/chantiers/02bis-corrections.md`) ;
- **04-bis** : snapshot rafraîchi, vecteurs « 2ᵉ saut » et « ancre ≠ source », règle R6 pour w < 0 ;
- **06** : budget et scripts des scènes sur fork.

Prompts : `mustdo/prompts/`.


---

## État au 06/10 (pilote)

| Chantier | État | Ce qui reste |
|---|---|---|
| 02, contrat v1 | ✅ livré, fusionné | **02-bis en cours** : défaut critique du nœud `address(0)`, corrections A/B/C, renommage `passesAnchorPolicy` |
| 03, indexeur Envio | ✅ livré : audit en direct, Cloud | adresse du contrat déployé, publication sur Envio Cloud (2ᵉ déploiement sur 3), constats de la revue |
| 04, solveur et certificateur | ✅ livré | **04-bis en cours** : règle B, snapshot, vecteurs du 2ᵉ saut, webhook Alchemy (D55), **AM-06.1 (keystore cassé avec Foundry ≥ 1.8)** |
| 05, payeur et plugin | ✅ livré | adaptation au renommage ; T1 réel (🧑) ; plugin hors bounty (D53) |
| 06, ferme et scènes | ✅ 8 scènes en fork, démo figée | **acte 2 sur le vrai testnet, après la fusion de 02-bis** (🧑) |
| 07, écran | ✅ livré | hébergement (🧑) ; D49 (poids effectif), D50 (vue du 2ᵉ saut), ABI finale : **session à relancer** |
| 08, norme | ✅ livré | mettre à jour avec D48 à D56 et le renommage, après 02-bis |
| 09, soumission | **en cours** | `git merge main` pour récupérer `demo/VIDEO-SHOTS.md`, `JUDGES.md` et `SCREEN.md` |
| Revue maximale | **vérification en cours** (9 lots sur 13) | rapport consolidé, puis répartition des constats |

**Ordre critique** : 02-bis fusionné → `forge build` → répétition puis acte 2 sur le testnet → adresse dans l'indexeur, puis publication Cloud → latences réelles dans VIDEO-SHOTS et JUDGES → tournage le 11/10 → soumission le 12/10.

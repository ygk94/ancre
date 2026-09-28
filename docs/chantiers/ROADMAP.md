# Feuille de route par chantier — agents et skills

> Rédigé le 2026-09-28. Soumission visée le **12/10** (clôture le 14/10 à 05:59, heure de Paris).
> **Agents** = nombre d'agents Claude Code à lancer **en parallèle** pour l'étape, dans la session du chantier.
> **Skills** : voir `README.md` pour le détail.
> Les étapes marquées 🧑 attendent une action de Hugo (`mustdo/MUSTDO.md`).

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

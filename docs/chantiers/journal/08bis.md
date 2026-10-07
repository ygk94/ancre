# Journal du chantier 08-bis

> Mise à jour de la norme ERC « Anchored Reputation for Trustless Agents » après 02-bis, 04-bis et la revue maximale du 06/10.
> Worktree `/Users/hugo/Projet/ancre-08bis`, branche `chantier/08bis-norme` (base `1fa1639`, `main` du 07/10). Une entrée par étape ou par blocage. Rien n'est publié ni envoyé.

## 2026-10-07 12:00 — Démarrage : ce que j'ai compris, mon plan

**Lu** : CLAUDE.md, ANCRE.md (§0, §5, §6, §9), rapport et journal du 08, CR (D1-D56, tour 7, « Revue maximale du 06/10 : corrections fusionnées sur main », angles morts 02/04/03/06/07), rapports 02-bis (dont §8 et les changements d'interface) et 04-bis (§6 bis, §7, §8), revue maximale (K6, L1, K7, K8, A2b, A1b, A1d, EFF1, NUL, LONGTAG, REGCB, ALT8, K10), le contrat (`_verifyRows`, `_checkFacts`, `_replacementRule`, `passesAnchorPolicy`, faits, `proveApproval`), ENCODING (§0bis, §2, §3.2-§3.5, §6, §7.1-§7.4), PROOFS (L6 réécrit, L8), GAS (lot 02-bis), FORMAT (R1 bis, R6, R8, §7 REGCB, §8 vecteurs communs), le texte de l'ERC en entier, CHANGES, les assets et `verify.py`, les brouillons, les règles Metropolis v3, la checklist de publication.

**Compris : ce qui a changé depuis le 01/10 et que le texte ne dit pas encore**
1. Renommage : `isTrusted` → `passesAnchorPolicy`, `Assessment.trusted` → `passesPolicy` (D48, AM-9.5).
2. Règle A (D48-A, L8) : aucune ligne n'a pour source une ancre (`AnchorAsSource`) ; l'agent concerné n'émet aucune ligne. Le texte dit encore « SHOULD NOT » et « la ligne d'ancre est copiée dans l'agent ».
3. Règle B (D48-B) : un contrôleur n'est rejeté que pour w > 0 ; son négatif est gardé ; une ancre approuvée ou opératrice vaut veto (lu en direct en mode strict, `proveApproval` en mode rapide). Le texte (§3.3, Security « Silencing critics ») décrit encore l'ancien défaut.
4. Règle C (D48-C, revue de code du 06/10) : les **faits prouvés** remplacent la comparaison des racines brutes. Tout fait (poids d'arête, réclamation de source fausse) est vérifié sur chaque ligne ultérieure, aux deux niveaux, sous tout état, `REGISTRY_CHANGED` compris (`ProvenRowResubmitted`). Vivacité : `refreshFact`, `clearSourceFact`. Le §5.9 du texte décrit encore le refus « byte-exact ».
5. Forme canonique (`NotCanonical`) : SRC non nul, SPLUS strictement supérieur à S⁺, un alias pointe une ligne d'agent. W = 4 reste permis. `address(0)` refusé dans la table (R1/K6). Seconde passe calée sur la première (`BadRows(6)`). Empreinte des ancres à 0.
6. A1d : `newNodes` interdit sur un ensemble ouvert. G-11 : soumission directe (`msg.sender == tx.origin`) sur un ensemble ouvert.
7. Preuves : bornes cumulées contre la ligne engagée, formule X (K8, A2b). Toute arête non engagée révélée est supposée nouvelle, d'où une facture au pire cas pour une omission déclarée honnête. `BadProof(27)` : pas de preuve vers l'agent de la ligne. R6 : seule `ERC721NonexistentToken` vaut « inexistant » ; tout autre échec donne `RegistryUnreadable` (preuves) ou `REGISTRY_CHANGED` (`assess`). E1 : les chemins payants ne plafonnent plus `readFeedback`.
8. R7 : le transfert strict se déclenche sur la masse, plus sur la confiance arrondie.
9. R1 bis : l'identité d'un tag est le keccak de ses octets, jamais son texte (NUL, LONGTAG). REGCB : particularité de `register()` en v2.0.0.
10. D50 (la propagation au-delà d'un saut, en avant), D56 (θ = 1 % n'est que la valeur de la démo).
11. Gas : preuves +26 à +29 % (MESURÉ 06/10) ; démo RV 15 024 552 ; contrat 39 261 octets (rapport 02-bis §8).

**Écarts déjà repérés (à confirmer en E1)**
- Les vecteurs des assets datent du 01/10. `mainnet_slash_anchor` (TC-3) a changé d'ancres (règle A) ; l'ancien est devenu le vecteur d'attaque `common_A_mainnet_old_slash_anchor`. Les montants de preuve des violations ont été mesurés avec l'ancienne formule. `simulation.json`, sur `main`, est encore celui d'avant 02-bis (preuves à environ 304 k gas). Il faudra donc remesurer sur fork, ou recalculer de façon indépendante et rejouer le contrat.
- Les vecteurs communs (A, B, C, 2ᵉ saut, R1) ne sont pas dans les assets.

**Plan**
1. **E1** : texte normatif, section par section (§1-§11, Abstract, Motivation, Rationale), puis CHANGES §9, avec une entrée par changement et sa source.
2. **E2** : régénérer les assets depuis `solver/vectors/` (mainnet_slash_anchor et em_d44 inclus) ; ajouter les vecteurs communs au format autonome ; étendre `verify.py` aux nouveaux refus (AnchorAsSource, NotCanonical, BadNodes, ProvenRowResubmitted, règle B) et à la formule X. Remesurer les montants de preuve sur un fork (`simulate.py`) si le réseau le permet ; sinon, les tests forge sur mocks.
3. **E3** : Security (A1b, EFF1, G-11, vivacité des faits, REGCB, NUL/LONGTAG, coût des preuves). Marqueurs DISCLOSURE-GATE autour du contournement du garde-fou (78 avis sur #8317) et de l'EOA d'upgrade, dans tout `docs/erc/`.
4. **E4** : les ⟦OPEN⟧. **E5** : eipw (docker) et `verify.py`. **E6** : `/llm-council`. Puis le rapport.

**Prochaine étape** : E1.

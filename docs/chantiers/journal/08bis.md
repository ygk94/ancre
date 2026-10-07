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

## 2026-10-07 13:40 — E1 : texte normatif aligné sur `main` (02-bis, 04-bis, revue du 06/10)

**Fait.** `docs/erc/anchored-reputation.md`, avec une entrée par changement dans `docs/erc/CHANGES.md` §9 (28 entrées, chacune avec sa source) :
- **Renommage** : `passesAnchorPolicy` et `passesPolicy`, partout.
- **Règles A, B et C** :
  - A : une ancre n'émet que comme nœud-ancre (§3.5, `AnchorAsSource`) ;
  - B : un contrôleur ne perd que ses positifs (§3.3), et une ancre approuvée vaut veto (§8.2, §6.4 `proveApproval`) ;
  - C : faits prouvés (§5.10 nouveau, `refreshFact`, `clearSourceFact`), qui remplacent la garde à l'octet près (§5.9).
- **Nouvelles règles de soumission** :
  - adresse nulle refusée ;
  - `newNodes` vide sur un ensemble ouvert ;
  - soumission en appel de premier niveau sur un ensemble ouvert ;
  - forme canonique en MUST ;
  - empreinte d'ancre nulle ;
  - passes sur les mêmes octets ;
  - gas non plafonné vers `readFeedback` sur les chemins payants.
- **Preuves** : formule X (§6.1), registre illisible ⇒ revert, pas de preuve vers l'agent de la ligne.
- **Lecture** : transfert strict déclenché par la masse (R7) ; registre illisible ⇒ `REGISTRY_CHANGED` (R6).
- **Convention §1 « Registry answers »** (R6).
- **Identité d'un tag** = keccak de ses octets (R1 bis).
- **D50** en avant (Abstract, Motivation, Rationale) ; **D56** (θ sans valeur recommandée).
- **Interface §10** : nouvelles fonctions, events et erreurs.
- **Reference Implementation** : gas et taille mesurés.
- **Security Considerations** réécrite. J'ai fait E3 dans la même passe, pour ne pas laisser de paragraphe contraire au code : voir l'entrée E3.

**Mesures (MESURÉ le 07/10).**
- `forge build --sizes` : `AnchoredReputation` = **39 261 octets**.
- `solver/simulate.py --scenarios vectors,violations,common`, fork anvil de rpc1.monad.xyz au bloc 110 994 810, contrat de `main` : **27 vérifications sur 27 conformes** :
  - 9 vecteurs acceptés ;
  - fabriquée et gonflée refusées en RV ;
  - 4 violations prouvées aux deux niveaux ;
  - vecteurs communs : `AnchorAsSource(2)`, `AnchorAsSource(5)`, `ProvenRowResubmitted(0)`, `BadNodes()` ;
  - gas des preuves de 340 800 à 392 502, **identique au gas près** à GAS.md (06/10).

  La sortie est dans le scratchpad de la session, `solver/out/` n'est pas modifié. Elle servira à E2.

**Décisions de rédaction, et pourquoi.**
1. **Les erreurs sont nommées dans l'interface, avec un SHOULD** : les vecteurs communs attendent des refus nommés. Le refus lui-même est normatif (MUST), son nom ne l'est pas, pour qu'une autre implémentation puisse nommer ses erreurs autrement. Les codes numériques (`BadProof(n)`, `BadRows(n)`) restent hors interface.
2. **« Ancre ≠ source »** passe de SHOULD NOT à règle du graphe. Le contrat le refuse : garder un SHOULD contredirait le code.
3. **Le veto par approbation est rattaché à `strictTransfer`**, comme dans le code, qui lie les deux lectures en direct à ce seul champ. Pour un payeur, j'ajoute un **SHOULD NOT** sur le mode rapide : le payeur de référence le refuse (R8), mais la norme ne peut pas exiger ce que fait un payeur particulier.
4. **θ** : aucune valeur recommandée. Le 1 % de D56 apparaît comme une mesure datée (« fork of a test network », sans nommer Monad, conformément à la règle de neutralité).
5. **Faits** : le texte dit « facts », pas « canonical hash ». D48-C demandait un hash canonique, mais 02-bis a montré qu'il se contournait. Le code suit l'intention de D48-C, pas sa lettre, et je fais de même en le notant (⟦ ⟧ du §5.10).
6. **Formule X écrite en entier** dans le §6.1 : les vecteurs fixent les montants au wei près, et un lecteur doit pouvoir les recalculer sans ENCODING.md.
7. **Demande 6 à ERC-8004** (ordre des events de `register()`) : REGCB n'est pas une faille du registre, c'est un piège pour tout indexeur. On peut donc le demander publiquement, hors DISCLOSURE-GATE.

**Incohérences (AM-08bis.n), relayées au pilote.**
- **AM-08bis.1** : `contracts/GAS.md` donne une taille de 38 992 octets (06/10). Le rapport 02-bis §8 et `forge build --sizes` du 07/10 donnent **39 261**. GAS.md est périmé (→ 02).
- **AM-08bis.2** : `solver/out/simulation.json` sur `main` date d'avant 02-bis : `proveEdge` y coûte environ 304 k, et les vecteurs communs y sont attendus refusés mais acceptés. Mon rejeu du 07/10 donne les valeurs de GAS.md. À régénérer (→ 04).
- **AM-08bis.3** : ENCODING §3.5 dit qu'une arête positive prouvée peut être omise « sous un sPlus ≥ S⁺ + w ». Or le code exige que la déclaration couvre **la somme** des positifs prouvés omis (`_checkFacts`, correction de la revue de sécurité du 06/10). La formulation d'ENCODING est à aligner (→ 02). L'ERC suit le code.
- **AM-08bis.4** : CLAUDE.md §1 et ANCRE.md §0 disent encore « restent ouverts : AM-08.A, B, C » et « 02-bis en cours ». C'est périmé depuis la fusion du 06/10 (→ pilote).
- **AM-08bis.5** : le « mode strict » de D48-B (veto par approbation lu en direct) n'a pas de champ à lui. C'est `strictTransfer` qui le commande. Le nom du champ ne dit plus tout ce qu'il fait. L'ERC le documente sans renommer le champ, puisque le renommer changerait le `setId`.

**Prochaine étape** : E2, les vecteurs. Puis le chiffre de « Bounds are global » (18 wei → 0,556 WAD, vecteur du 01/10) est à recalculer sur le nouveau TC-3.

## 2026-10-07 16:10 — E2 : vecteurs normatifs régénérés et étendus

**Fait** (détail : CHANGES §10).
- `docs/erc/assets/erc-0000/` régénéré, **27 fichiers** :
  - 9 certificats ;
  - 5 violations, dont une nouvelle à deux amendements ;
  - 8 vecteurs communs autonomes, avec leur registre ;
  - 2 séquences de preuves (nouvelles) ;
  - 4 refus (nouveaux).
- `verify.py` réécrit : règle B, identité des tags par hash, formule X, `proveWallet`, refus dans l'ordre du contrat, faits, lectures, borne L6 exacte après chaque preuve. **0 échec.** 7 mutations détectées sur 7 (les tests ne sont pas creux, AM-INT.2).
- TC-1 à TC-9 réécrits dans l'ERC.

**Mesures (MESURÉ le 07/10).**
- `simulate.py` sur fork : 27/27 (voir E1).
- Copie de travail du contrat de `main` dans le scratchpad, avec un test `X08Vectors.t.sol` (copie dans `drafts/measurements/`), mocks : **3/3** ; les deux séquences et les quatre refus ont l'issue attendue.
- `pair-edge.json`, 17 cas : **0 écart** avec `solver/graph.combine_pairs`.
- Sur `seq_declared_omission`, l'ancienne formule laisse eEff à 0,111 WAD au lieu de 0,333 (K8), et eLowEff à 0,2222 au lieu de 0,2444 (A2b).

**Décisions de rédaction, et pourquoi.**
1. **Vecteurs autonomes** (avec registre) plutôt que des vecteurs liés au mainnet : un lecteur doit pouvoir vérifier les refus et les lectures sans chaîne. Seul `common_A_mainnet_old_slash_anchor` exige le vrai registre, et `verify.py` n'y vérifie que la partie structurelle (`AnchorAsSource`).
2. **Séquences mesurées sur mocks, pas sur fork.** Leurs registres jouets ne sont pas sur la chaîne, et le contrat est le même. Les montants sont refaits indépendamment par `verify.py`, au wei près.
3. **`nodeEntries` / `newNodes` vide** sur un ensemble ouvert : le calldata des vecteurs du solveur portait les nœuds en ligne. Copié tel quel, il aurait été refusé par la règle A1d.
4. **Les gas des mocks ne sont pas publiés** : ils ne représentent pas un vrai registre.
5. **Les outils (`build-assets.py`, `build-x08.py`, mesures) restent dans `drafts/`**, hors des assets : ils dépendent du solveur. Les assets, eux, n'en dépendent pas.

**Incohérences.**
- **AM-08bis.6** : les séquences TC-8 et les refus TC-9 ne sont rejoués que dans ma copie de travail, pas dans `contracts/test/`. Il faudrait ajouter `X08Vectors.t.sol` (ou l'équivalent) au contrat (→ 02).
- **AM-08bis.7** : le champ `atSubmission` des violations disait « accepted at both levels » même pour celles que RV refuse. C'est corrigé dans les assets (par niveau). Le JSON du solveur garde son champ `mustBe`, générique (sans effet).
- **AM-08bis.8** : `solver/vectors/*.json` portent `alignedWith: "... (2026-10-01) ..."`, alors qu'ils ont été régénérés en 04-bis (06/10). Le libellé est périmé (→ 04, cosmétique).

**Prochaine étape** : E3 (Security, déjà réécrite en E1) : balayage DISCLOSURE-GATE dans tout `docs/erc/`, puis E4.

## 2026-10-07 17:00 — E3 : Security Considerations et DISCLOSURE-GATE

**Fait.**
- **Security Considerations** a été réécrite dès E1. On y trouve désormais :
  - les ensembles ouverts, avec les faits ;
  - **A1b**, chiffré, avec un ⟦OPEN⟧ ;
  - les bornes globales, avec la facture au pire cas, et le nouveau chiffre de TC-5 (16 wei → 0,222 WAD) ;
  - **EFF1**, chiffré, avec un ⟦OPEN⟧, et le coût des preuves (+26 à +29 %, MESURÉ) ;
  - les ancres (règle A) ;
  - la **vivacité des faits** ;
  - les approbations (règle B) ;
  - la gouvernance (R6) ;
  - la disponibilité des données (**G-11**, EOA délégués **EIP-7702**) ;
  - les **indexeurs** (**REGCB**, **NUL**, **LONGTAG**).
- **DISCLOSURE-GATE** : marqueurs posés dans l'ERC, CHANGES et les brouillons (a), (b) et (d) ; le brouillon (c) est couvert en entier. Contrôle par script : **0 occurrence hors marqueurs** dans `docs/erc/`, marqueurs appariés.
- `strip-notes.py` sait maintenant traiter les blocs, et retire le gated par défaut.
- Les brouillons sont mis à jour (CHANGES §11).

**Mesure (MESURÉ le 07/10, bloc 111 299 306).** L'owner des deux proxys est inchangé (EOA sans code), `getVersion()` = 2.0.0, et la valeur relue pour le brouillon (c) est inchangée.

**Décisions de rédaction, et pourquoi.**
1. **La demande sur le garde-fou passe en dernier** dans Backwards Compatibility. Sinon, retirer le bloc gated laisserait une liste 1, 3, 4, 5 et un renvoi « request 5 » faux.
2. **Notes internes reformulées.** Une note ⟦ ⟧ disparaît à la soumission, mais elle reste lisible dans le dépôt une fois public. Elle ne doit donc pas décrire le contournement hors des marqueurs.
3. **Le brouillon (c) est couvert en entier** : il est la divulgation elle-même.
4. **REGCB, NUL et LONGTAG ne sont pas sous marqueur.** Ce sont des pièges pour les indexeurs, pas des failles du registre visées par D29.
5. **Le §3.3 et la Security parlent de la mise sous silence par approbation sans marqueur.** C'est le 3ᵉ point du brouillon (c), mais le brief ne vise que le garde-fou et l'EOA, et l'ERC y répond désormais par sa propre règle.

**🧑 BLOQUÉ (décision de Hugo, j'avance sans elle)** : la mise sous silence par approbation, 3ᵉ point de la divulgation (c), doit-elle elle aussi attendre la divulgation ? Si oui, il faut encadrer le paragraphe de motivation du §3.3 (règle 4), la phrase du Rationale « Approvals » et le paragraphe Security « Approvals ». Cela représente trois blocs, et sans eux la règle B reste normative, mais sans justification.

**Prochaine étape** : E4 (les ⟦OPEN⟧).

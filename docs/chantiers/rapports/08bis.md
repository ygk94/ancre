# Rapport du chantier 08-bis : norme ERC mise à jour après 02-bis, 04-bis et la revue (2026-10-07)

Branche `chantier/08bis-norme`, worktree `/Users/hugo/Projet/ancre-08bis`, base `1fa1639`.
- Commits : `0376a56` (démarrage), `0f37352` (E1), `3fdcc6d` (E2), `2877639` (E3), `f5f0979` (E4), `21311ae` (E5), `1698e3c` (E6), plus ce rapport.
- Pas de push. Rien de publié ni d'envoyé.
- Seuls `docs/erc/` et mes journal et rapport sont modifiés.
- Journal : `docs/chantiers/journal/08bis.md`.

## 1. État du texte

`docs/erc/anchored-reputation.md` fait 1 218 lignes, notes ⟦ ⟧ comprises.

**Aligné sur le code de `main` du 07/10** (contrat identique dans le worktree, vérifié par l'expert A) :
- renommage `passesAnchorPolicy` / `passesPolicy` ;
- **règle A** : une ancre n'émet que comme nœud-ancre (`AnchorAsSource`) ;
- **règle B** : un contrôleur ne perd que ses positifs, et une ancre approuvée vaut veto, lu en direct ou posé par `proveApproval` ;
- **règle C** : **faits prouvés** (§5.10), `refreshFact`, `clearSourceFact`, `ProvenRowResubmitted` aux deux niveaux et sous tout état ;
- forme canonique (`NotCanonical`), adresse nulle refusée, `newNodes` vide sur un ensemble ouvert, `msg.sender == tx.origin` ;
- **formule X** écrite en entier (§6.1) ;
- **R1 bis** (identité d'un tag = keccak de ses octets) ; R6 (seule `ERC721NonexistentToken` dit « inexistant ») ; R7 (transfert strict sur la masse) ;
- gas non plafonné vers `readFeedback` sur les chemins payants.

**Décisions et positionnement** :
- **D50** en avant (Abstract, Motivation « One hop is not enough », Rationale « Beyond one hop »), avec les vecteurs du 2ᵉ saut ;
- **D56** : θ sans valeur recommandée, et le 1 % de la démo cité comme mesure datée ;
- **D49** : VouchBond, TrustDomain et registre Validation en extensions (§11).

**Security Considerations réécrite** :
- A1b et EFF1, chiffrés et ⟦OPEN⟧ ;
- G-11 et EIP-7702 ;
- vivacité des faits ;
- REGCB, NUL et LONGTAG (indexeurs) ;
- coût des preuves (+26 à +29 %, MESURÉ) ;
- après la relecture : portée et marge de la règle A, omission d'un négatif absorbée par B⁻, STALE ouvert par une seule preuve, preuve rejouable, cache du payeur, `3k + 2` appels.

**Vecteurs** : 27 fichiers.

**DISCLOSURE-GATE** dans tout `docs/erc/`.

Le détail de chaque changement, avec sa source, est dans `docs/erc/CHANGES.md` (§9 à §13, environ 80 entrées).

## 2. Ce qui a changé : renvoi à CHANGES

| Section de CHANGES | Contenu |
|---|---|
| §9 (9.1 à 9.30) | texte normatif, E1, et Test Cases, E2 |
| §10 | vecteurs : sources, rejeux, contrôle des contrôles |
| §11 | DISCLOSURE-GATE et brouillons (E3), relecture on-chain du 07/10 |
| §12 | ⟦OPEN⟧ (E4) |
| §13 | 18 corrections après la relecture adversariale (E6) |

## 3. ⟦OPEN⟧ restants (5), et pourquoi

| ⟦OPEN⟧ | Où | Pourquoi il reste |
|---|---|---|
| D9 / D43, pré-rotation | §11 | Décidées, pas implémentées. La porte P4 (Mera) n'est pas passée au 07/10 |
| Vivacité (tour 2, désaccord 1) | Security | Aucun tour ne l'a tranchée |
| Négatif permanent (tour 3, désaccord 1) | Security | Idem |
| **A1b**, zone de transit D23 | Security | Le CR la laisse « à trancher » : le code ne suit pas D23 |
| **EFF1**, fenêtre `scanMax` | Security | Idem. Ce serait un changement de la règle d'arête normative |

**Retiré** : le désaccord 2 du tour 5 (veto au dernier avis). Il est tranché par D33, et la limite est écrite en §9 et en Security. Les cinq points restants, plus le veto, sont posés comme questions à la communauté dans le brouillon (a).

## 4. Incohérences AM-08bis.n (détail dans le journal)

**Graves : à trancher par le conseil et le code**
- **AM-08bis.11** : la clause D de la voie rapide ne protège pas un négatif quand sa ligne garde S⁻ ≥ GRID (renormalisation de B⁻), et les bits de veto ne sont pas dans D. Sur un ensemble ouvert, on peut faire taire un critique avant `minRefresh`.
- **AM-08bis.12** : la règle A ne couvre pas les agents dont une ancre est **propriétaire**. Avec la clé volée, `setAgentWallet` suffit à contourner m ≥ 2. Raisonné, non testé. Concerne `mainnet_em_d44`, et les ancres de démo du 06 sont à vérifier.

**Code (→ 02)**
- **.10** : `_verifyOwners` hors R6.
- **.13** : marge de la règle A, qui rend inutilisables les ensembles dont les ancres possèdent des agents massifs.
- **.15** : events sans `src` ni `via`.
- **.16** : une omission honnête peut être prouvée de nouveau à chaque certificat.
- **.17** : ENCODING §3.2 dit `NotCanonical` là où le code renvoie `BadRows`.
- **.3** : la formulation d'ENCODING §3.5 diffère du code (somme des positifs prouvés omis).
- **.1** : la taille du contrat dans GAS.md est périmée (39 261 octets, MESURÉ le 07/10).
- **.6** : les séquences TC-8 et les refus TC-9 ne sont pas dans `contracts/test/`.

**Autres relais**
- **.2** (→ 04) : `solver/out/simulation.json` date d'avant 02-bis.
- **.8** (→ 04) : libellés `alignedWith` périmés.
- **.14** (→ 05) : cache du payeur contre veto en direct et `REGISTRY_CHANGED`.
- **.9** (→ pilote) : le flux VouchBond d'ARCHITECTURE.md ne propagerait rien (contrat partagé = nœud-adresse sans masse).
- **.4** (→ pilote) : CLAUDE.md et ANCRE.md disent encore « AM-08.A, B, C ouverts ».
- **.18** (→ pilote, 🧑) : #8317 et l'EOA d'upgrade apparaissent sans marqueur dans `app/`, `demo/` et `ANCRE.md`.
- **.5** : `strictTransfer` commande aussi le veto par approbation (documenté).
- **.7** : corrigé dans les assets.

## 5. État du lint et des vecteurs (MESURÉ le 07/10)

**eipw 0.11.0** : **0 erreur**, sans les blocs gated et avec (`--keep-gated`).
- Paquet npm `eipw-lint-js`, eipw en WebAssembly, même version que le 01/10. Docker était arrêté et cargo absent.
- Configuration `config/eipw.toml` d'ethereum/ERCs ; propositions citées copiées comme le fait la CI ; numéro provisoire 9999.
- Contrôle négatif : 5 erreurs détectées.
- Script : `docs/erc/drafts/lint.sh`.
- Écart avec la CI : le point d'entrée n'est pas le binaire `eipw`, mais le code et la configuration sont les mêmes.
- EIP-1, contrôle manuel : aucun mot-clé RFC 2119 hors de la Specification.

**`verify.py`** (bibliothèque standard, réécrit) : **27 fichiers, 0 échec**.
- Contenu : 9 certificats, 5 violations, 8 vecteurs communs autonomes (avec leur registre), 2 séquences de preuves et 4 refus.
- 7 mutations du vérificateur ou des données sur 7 sont détectées.
- `pair-edge.json` (17 cas) : 0 écart avec le solveur.

**Rejeu sur le contrat de `main`**
- `simulate.py`, fork de rpc1 au bloc 110 994 810 : 27/27, gas des preuves identique à GAS.md.
- Mocks : les séquences et les refus 08-bis ont tous l'issue attendue.
- Sur la séquence de la formule X, l'ancienne formule laissait eEff à 0,111 au lieu de 0,333 (K8), et eLowEff à 0,2222 au lieu de 0,2444 (A2b).

## 6. Verdict de la relecture adversariale

Compte rendu complet : `docs/erc/relecture-conseil.md`, section 08-bis. Cinq agents ont travaillé de façon indépendante (A théoricien, B EVM, C éditeur, D attaquant, E intégrateur) ; la synthèse est faite par la session.

- **Fidèle au code sur toute la mécanique**, confirmé par les 5 experts. Les 9 écarts de rédaction relevés (alias, `⁺`, §4.5, `tx.origin`, faits implicites…) sont corrigés.
- **La Security est honnête, mais il lui manquait deux défauts de garantie**, AM-08bis.11 et .12. Ils sont désormais écrits, et leur correction relève du code et du conseil.
- **Pas prêt à soumettre. Pas de PR avant le 13/10** (confiance 0,75 ; C est minoritaire).
- **Les DISCLOSURE-GATE sont complets dans `docs/erc/`, mais inopérants pour le dépôt** : l'écran, la démo et `ANCRE.md` montrent les mêmes faits. La mise sous silence par approbation n'est pas mise sous marqueur (4 contre 1) : elle fonde la règle B.

## 7. Ce qu'il faut pour publier

1. 🧑 **Envoyer la divulgation (c) avant la mise en public du dépôt** (12/10) et avant la vidéo (11/10), puis respecter le délai annoncé.
2. **Conseil, puis 02** : trancher AM-08bis.11 (D par arête, ou exiger que chaque négatif et chaque veto soit présent) et AM-08bis.12 (ancres propriétaires d'agents). Corriger .10, .13, .16 et .17.
3. 🧑 `author`, fil Magicians dédié (`discussions-to`), puis numéro attribué par un éditeur.
4. 🧑 **Code de référence** : rendre le dépôt public, ou copier le contrat dans `assets/`. Dans ce cas, CC0 est exigé, alors que le contrat est en MIT : c'est ta décision. Découpage EIP-170 si l'on veut une implémentation déployable sur Ethereum.
5. 🧑 Accord de ColinkaMir pour le chiffre « 16 sur 9 188 » (brouillon e), sinon retirer la phrase de la Motivation.
6. Raccourcir le texte (environ 18 000 mots) : déplacer les tableaux de mesures et les TC détaillés dans `assets/` (conseil de C).
7. `strip-notes.py` (sans `--keep-gated` tant que la divulgation n'est pas faite), `lint.sh`, `verify.py`, puis ouvrir la PR (a), et publier (b) et (d) à partir de la sortie de `strip-notes.py`.

## 8. Questions pour Hugo

1. **Divulgation (c)** : quand, par quel canal, avec quels signataires ? Elle conditionne maintenant la mise en public du dépôt, pas seulement l'ERC (AM-08bis.18).
2. **La mise sous silence par approbation** doit-elle attendre la divulgation (avis de D) ? Le texte suit la majorité : pas de marqueur.
3. **Date de la PR** : après le 13/10, et après la décision sur AM-08bis.11 et .12 (recommandation) ?
4. **Licence** des assets et d'une éventuelle copie du contrat (CC0) ?
5. **Démo** : les ancres du 06 possèdent-elles des agents endossés par les autres ancres (AM-08bis.12) ? Si oui, il faut en changer avant le tournage.
6. G-11 : faut-il refuser les EOA délégués par EIP-7702 sur les ensembles ouverts ? Vivacité des faits : permissionless ou soumetteurs listés ? (Questions 2 et 3 du rapport 02-bis, toujours ouvertes.)

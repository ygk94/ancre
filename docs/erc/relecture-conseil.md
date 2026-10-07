# Relecture adversariale du draft d'ERC (`/llm-council`, chantier 08, E5) — 2026-10-01

> Protocole llm-council. **Phase 1** : cinq agents séparés ont lu eux-mêmes le texte, le code v1, ENCODING, PROOFS, les vecteurs et les brouillons, en lecture seule. **Phases 2 et 3** : jouées par la session 08, un seul modèle. L'indépendance de la relecture croisée est donc une discipline d'écriture, pas une garantie.
> Question posée : le texte est-il prêt à être soumis sur ethereum/ERCs ? Q1 justesse et complétude ; Q2 sécurité ; Q3 conformité EIP-1 et éditeurs ; Q4 calendrier et brouillons.
> Contexte transmis : `council_ctx.md` (scratchpad de la session). D1-D46 non rouverts.
> **Vérifications faites par la session avant la synthèse** :
> - faille « ancre source d'un agent » recalculée en fractions exactes : la Sybil obtient trustRobust = 0,0247 WAD, comme l'honnête #2 ;
> - attaque D2-a confirmée dans le code (l. 1130 : rejet des contrôleurs quel que soit le signe ; l. 1549 : veto en direct sans contrôle de contrôleur) ;
> - EIP-7825 confirmé (Final, plafond de 2²⁴ par transaction) ;
> - lint eipw 0.11.0 réel : 0 erreur.

## Phase 1 — Les cinq analyses, en résumé

**A, théoricien.**
- Les formules de §4 à §6 correspondent exactement à ENCODING et au code ; L2, L3, L5 et L6 ont été refaits.
- **Faille** : si l'adresse d'une ancre est la source d'un agent (copie de ligne, configuration de TC-3), une clé d'ancre volée fait passer une Sybil malgré m = 2.
- Le leave-one-out ne protège pas contre la compromission d'un nœud. Amplification par un 2-cycle : 1/(1−(1−α)²).
- §4.5 et « Two bounds » ne valent que pour le graphe engagé.
- Retirer « exact ». Corriger la lecture de Cheng-Friedman et l'argument « seul certificat en une passe ».
- L7 : « la censure perd de la masse » est faux sur un graphe qui grandit.

**B, ingénieur EVM.** 22 écarts. Les plus importants :
- le refus de « resoumission d'un certificat prouvé » se contourne gratuitement : une ligne vide en plus, ou W = 4, et ce refus est sauté sous REGISTRY_CHANGED ;
- `isAuthorizedOrOwner` et `getVersion` ne sont pas dans ERC-8004, alors que le texte les présente comme standard ;
- le MUST « itérer depuis 0 » contredit le « MAY any sub-solution » ;
- `isTrusted` ne fait pas respecter m ≥ 2 ;
- limites u32 non écrites ; plafond de d ; ordre des amendements ; plafond de gas de 120 000 non normé ;
- l'interface §10 ne compile pas ;
- il manque les accesseurs de la table de nœuds et des registres ;
- les lignes n'existent que dans le calldata (disponibilité des données) ;
- les vecteurs ne couvrent ni k = 1, ni W = 4, ni `proveWallet`, ni le veto, ni le remplacement.
- Calendrier : la PR après le 13/10.

**C, éditeur EIP.**
- Erreurs eipw (déjà corrigées par le lint réel).
- `proveEdge` sur un registre sans `isAuthorizedOrOwner` : n'importe qui peut élargir un certificat honnête.
- Plafond par transaction d'EIP-7825 et taille EIP-170.
- `edgeFilterId` « MUST zéro » dans un document non vérifié : indéfendable, à supprimer.
- Document de schéma : canonicalisation à fixer.
- Ancres comme comptes-contrats : la rotation sans changer la norme.
- Noms de produits en Rationale : à rendre génériques.
- Calendrier : PR ouverte vers le 10/10, après la divulgation.

**D, attaquant.**
- **D2-a** : avec `setApprovalForAll`, l'owner fait de ses critiques et des ancres des opérateurs. Leurs négatifs sont rejetés et le garde-fou d'ERC-8004 leur interdit tout nouvel avis. Coût ≈ 0,08 MON (ESTIMÉ).
- **D1** : gonflement de la table de nœuds sur un ensemble ouvert (`addNodes` ouvert), gel de l'ensemble pour ≈ 15 à 44 MON (ESTIMÉ).
- Censure par compensation.
- La fenêtre de rafraîchissement efface D et les bits de veto ; `minRefresh = 0` est permis.
- Rachat discret sans changer `ownerOf`.
- Empoisonnement d'une paire au-delà de 30 M gas.
- L'owner des registres peut forger un RegistryVerified.
- Brouillon (b) inexact (« every set that does not endorse the farm ») ; D2-a à ajouter aux brouillons (c) et (d).
- Calendrier : publier pendant le jugement donne le mode d'emploi ; démo en `submitters` listés avec `minRefresh = maxAge`.

**E, intégrateur.**
- Il manque `certNonce` ou une époque pour la clé de cache, une vue des paramètres d'un ensemble et l'URI du document.
- `trustOf` est un piège.
- « MUST NOT revert » ne tient pas sous la règle 63/64.
- Le lien `payTo` ↔ `agentId` n'est pas exigé.
- OK ≠ payable ; REGISTRY_CHANGED recouvre trois causes ; `triggerTag` est un hash.
- θ s'érode quand le graphe grandit.
- L'Abstract promet un veto immédiat.
- Calendrier : avant, mais personne n'adoptera (code privé, pas déployable sous EIP-170, aucun ensemble réel).

## Phase 2 — Relecture croisée (ordre anonyme : 1 = D, 2 = B, 3 = E, 4 = A, 5 = C)

- **A relit D (1).**
  - *Vu* : D2-a, que je n'avais pas vu. C'est la même famille que ma faille (la règle des contrôleurs et la règle des ancres se combinent mal avec le garde-fou du registre).
  - *Trop optimiste* : le coût de D1. Les 28,7 k gas par nœud sont une mesure v0 ; GAS.md donne ≈ 46 k en v1. Le coût réel pour l'attaquant est plus élevé, mais le gel reste atteignable.
- **A relit B (2).**
  - *Vu* : le contournement du refus anti-effacement, sans aucun calcul. C'est la conséquence pratique de mon L7 « agrégé ».
  - *Oubli* : la clé de cache d'E (eEff, eLowEff) suffit à invalider après une preuve, `certNonce` n'est pas indispensable.
- **B relit A (4).**
  - *Vu* : l'ancre comme source ; le code l'autorise (seul l'alias vers une ligne d'ancre est interdit).
  - *Faux* : « interdire normativement » n'est pas applicable on-chain au moment de l'enregistrement. Le wallet d'un agent change après coup, et l'interdiction doit être vérifiée à la **soumission** (SRC ∉ ancres), ce qui suppose une modification du code.
- **B relit C (5).**
  - *Vu* : le griefing par `isAuthorizedOrOwner` absent.
  - *Trop sévère* : « interface trop grosse ». Une interface lecteur séparée est une bonne idée, mais elle n'est pas bloquante pour un Draft.
- **C relit D (1).**
  - *Vu* : D2-a touche ERC-8004 lui-même ; elle doit entrer dans la divulgation.
  - *Faux* : « "Trustless" dans le titre ». C'est le nom d'ERC-8004, et le titre le reprend à juste titre.
- **C relit E (3).**
  - *Vu* : le lien `payTo` ↔ `agentId`. C'est une règle de consommateur qui a sa place en §8.3.
  - *Trop optimiste* : rendre ERC-165 obligatoire ne protège de rien tant que le préimage du `setId` peut changer en v2. C'est le numéro de l'ERC qui versionne.
- **D relit A (4).**
  - *Vu* : la borne de compromission d'un nœud.
  - *Oubli* : la clé d'ancre volée n'a même pas besoin d'endosser elle-même. Elle peut signer `setAgentWallet` pour un agent qu'elle contrôle, et ainsi créer la configuration ancre-source à la demande. Il faut toutefois que cet agent ait de la masse dans une autre colonne : c'est une coupe Sybil classique, donc sans gain direct.
- **D relit C (5).** *Vu* : l'`edgeFilterId` invérifiable. *Oubli* : le document de schéma peut mentir sur les tags. La correction « setParams dans le document » est meilleure que l'URI seule.
- **E relit B (2).** *Vu* : la disponibilité des lignes ; mon écran et mon surveillant en dépendent. *Faux* : publier « après le 13/10 » ne règle rien pour moi, puisque le dépôt devient public à la soumission de toute façon (règles Metropolis, NON CONFIRMÉ).
- **E relit D (1).** *Vu* : la fenêtre de rafraîchissement qui efface les bits de veto ; je l'utilisais comme garantie. *Trop optimiste* : le prix de D2-a. Il faut d'abord savoir quelles adresses rendre opérateurs, et les ancres d'un ensemble sont publiques. Donc l'attaque est bien triviale.

## Phase 3 — Décisions

### Q1 — Justesse et complétude du texte normatif

**Décision.** Le texte est fidèle au code sur toute la mécanique : `setId`, arêtes, arithmétique, Merkle, montants des preuves, ordre des statuts. Quatre MESURES le confirment : `verify.py`, les relectures A et B à la ligne près, le lint, et TC-5 au wei près. Il n'était **pas complet**. Corrigé dans le texte le 01/10 :
- §1 : masse, plages u32, `getVersion` requis, agrégateur non upgradable, préséance du texte ;
- §2.1 : recommandation « ancre ≠ source » ;
- §2.4 : le document contient `setParams`, avec une canonicalisation RFC 8785 ;
- §3.8 : plus aucun champ de filtre ;
- §4.2 : SHOULD ;
- §4.4 : plafond de d ;
- §4.5 : bornes qualifiées ;
- §5.1, §5.3, §5.4 (alias, forme canonique), §5.7, §5.9 (portée du refus), §6 (ordre des amendements), §7, §8.2 (égalité, timing), §8.3 (`payTo`, clé de cache, m ≥ 2 non appliqué, adresse épinglée), §8.4 (120 000 gas) ;
- §10 : types déclarés, `identity`, `reputation`, `nodeCount`, `nodeKeyAt` ;
- §11 : ancres en compte-contrat.

**Ce qu'on perd** : le texte affiche maintenant des limites qu'un relecteur lira comme des défauts, et c'est voulu.
**Confiance** : 0,8.

### Q2 — Sécurité : trois défauts de conception, pas seulement de rédaction

**Décision.** Trois points ne se corrigent pas par le texte seul. Ils sont écrits en Security et transmis au pilote (AM-08.14 à .16) :
1. **Ancre source d'un agent** (A, vérifié) : au minimum la recommandation du §2.1. Correction de code proposée : refuser à la soumission toute ligne d'agent dont le SRC est une adresse d'ancre de l'ensemble.
2. **D2-a, mise sous silence par approbation** (D, vérifié dans le code) : la règle R6/D20 rejette les contrôleurs quel que soit le signe. Correction proposée, à décider par le conseil, car elle touche le détail de D20 :
   - rejeter les contrôleurs **seulement pour w > 0** ;
   - dans `assess`, traiter « une ancre est opérateur ou approuvée de j » comme un veto.
   Le défaut vient d'ERC-8004 : il est ajouté aux brouillons (c) et (d).
3. **Refus anti-effacement contournable** (B, lu dans le code) : en v1, il faut écrire honnêtement la limite. Correction de code proposée : quand le titulaire est prouvé, exiger une amélioration stricte (masse ou D), et sortir le contrôle du `if (!registryChanged)`.

Ajoutés en Security : D1 (gonflement de table), la fenêtre de rafraîchissement, le rachat discret, l'empoisonnement de paire, la compromission d'un nœud, la concentration de méfiance, le coût multiplié par la copie de ligne, la disponibilité des données, l'upgrade au-delà du plafond de gas, `isAuthorizedOrOwner` absent, le coût d'un registre hostile, EIP-7825.

**Ce qu'on perd** : le pitch ne peut plus dire que « m ≥ 2 rend une clé volée inoffensive » sans la condition.
**Confiance** : 0,8 sur le constat, 0,6 sur les corrections proposées (aucune n'est testée).

### Q3 — Conformité EIP-1 et éditeurs

**Décision.** eipw 0.11.0 passe sans erreur (MESURÉ). Restent pour la PR :
- le numéro, le fil et les auteurs (🧑) ;
- le code de référence joint dans `assets/` ;
- le retrait des notes ⟦ ⟧, avec `drafts/strip-notes.py`.

Les noms de projets restent en Rationale : D46 les décide, et C n'a pas de preuve que les éditeurs les refusent. Désaccord noté.
L'`edgeFilterId` est supprimé du document de schéma : le texte ne garde plus que la réservation (§3.8).

**Confiance** : 0,75.

### Q4 — Calendrier et brouillons

**Décision.**
- **Divulgation (c) avant le 05/10**, avec le troisième point (D2-a) et un délai d'au moins 7 jours avant toute mention publique.
- **Pas de PR avant le 13/10.** Les trois défauts de Q2 sont des changements de code décidés par le pilote et le conseil, pas par la norme. Une PR qui les documente comme ouverts est recevable pour un Draft, mais elle donne le mode d'emploi pendant le jugement, et un intégrateur ne l'adoptera pas en l'état (E).
- **Démo** : ensembles à `submitters` listés et `minRefresh = maxAge` avant que le dépôt devienne public (D).
- Le pitch peut dire « draft d'ERC et vecteurs de test publiés avec le dépôt », jamais « standard ».
- Brouillons (b), (c) et (d) corrigés.

**Ce qu'on perd** : la visibilité « PR ouverte » devant le jury.
**Confiance** : 0,6.

## Spécification de la correction la plus critique (pour le chantier 02, à valider par le conseil)

```
SOUMISSION, pour chaque ligne d'agent u avec SRC :
  si SRC ∈ anchors(set) : revert AnchorAsSource(row)                // AM-08.14
ARÊTE DE COUPLE (§3.3), relecture et preuves :
  si c est contrôleur de j :
     w(c, j) > 0 → pas d'arête (inchangé)
     w(c, j) < 0 → arête conservée                                   // AM-08.15
ASSESS, veto :
  pour chaque ancre a : si isApprovedForAll(ownerOf(j), a) ∨ getApproved(j) = a : veto(a) = vrai
REMPLACEMENT (ensemble ouvert) :
  prouvé = eLowEff ≠ 0 ∨ eEff > eSubmitted
  si prouvé (même sous registryChanged) : exiger mass_new > mass_cur ∨ D_new > D_cur   // AM-08.16
```

## Ce qui doit changer ailleurs (relais vers le pilote)

- **Contrat (02)** :
  - les trois corrections ci-dessus ;
  - `proveEdge` doit lire les contrôleurs par les quatre appels ERC-721 (AM-08.19) ;
  - zone de préparation D23, ou soumetteurs obligatoires (AM-08.17) ;
  - `minRefresh ≥ 1` ou mise en garde (AM-08.18) ;
  - exposer `certNonce` (AM-08.21).
- **ENCODING.md (02)** : la règle de W et « 0 if the registry reverts » en §7.1 sont périmés (AM-08.23).
- **Vecteurs (04, 08)** : k = 1, W = 4, croissance de nCert, `proveWallet`, `proveTransfer`, suite d'amendements, remplacement (AM-08.22).
- **Démo (06)** : `submitters` listés, `minRefresh = maxAge`, aucune ancre qui soit le wallet d'un agent.
- **Pitch (09)** : ne pas dire « une clé volée ne fait jamais payer » ; dire « draft », pas « standard ».

## Désaccords non résolus

1. **Calendrier** : A, C et E veulent la PR avant le 13/10 (Draft, forme seule). B et D la veulent après (complétude et exposition). La synthèse retient « après », avec une confiance de 0,6.
2. **Noms de projets en Rationale** (C contre D46).
3. **D2-a** : correction normative (contrôleurs rejetés pour w > 0 seulement) ou garde côté consommateur ? Elle touche un détail de D20.
4. **`trustOf`** : à supprimer (E), ou à garder (code et pitch) ?
5. **ERC-165 obligatoire** (E) contre versionnage par le numéro de l'ERC (C).
6. **θ fixe dans le `setId`** (E) : l'érosion avec la croissance du graphe impose de migrer d'ensemble ; aucune procédure n'existe.

## Ce que vous auriez dû me demander

1. **Les ensembles de démo respectent-ils les recommandations du texte ?** Le vecteur TC-3 (`mainnet_slash_anchor`) prend comme ancre une adresse qui est le wallet de #18 : c'est précisément la configuration qui casse m ≥ 2.
2. **Le dépôt devient-il public le 12/10** (règles Metropolis, NON CONFIRMÉ) ? Si oui, la question « PR avant ou après » ne porte plus sur l'exposition, seulement sur la visibilité.
3. **Qui surveille les ensembles ouverts pendant le jugement ?** D1, D2-b et la dilution exigent un surveillant, ou des soumetteurs listés.
4. **Faut-il une interface lecteur minimale séparée** (`isTrusted`, `assess`), stable, que les intégrateurs pourraient adopter avant que la partie certification ne soit figée ?

---

# Relecture adversariale du chantier 08-bis (`/llm-council`, 2026-10-07)

**Protocole.** Phase 1 : cinq agents séparés ont lu eux-mêmes le texte, le code de `main` (identique à celui du worktree : diff vide, vérifié par A), les vecteurs et les brouillons, en lecture seule. Les rôles :
- A, théoricien ;
- B, ingénieur EVM ;
- C, éditeur EIP ;
- D, attaquant ;
- E, intégrateur.

Phases 2 et 3 : jouées par la session, comme le 01/10. L'indépendance de la phase 1 est réelle (cinq contextes distincts). Celle de la phase 2 ne l'est pas : c'est une discipline d'écriture. Le prompt rempli n'a pas été soumis à Hugo avant exécution (personne ne répond pendant la session, brief 08-bis).

Avant de conclure, la session a revérifié dans le code les constats qui changent le texte normatif :
- un alias est validé avec son propre `u` : l'arête héritée vers son agent donne `BadEdge` ;
- `_checkFacts` reçoit le `sDecl` propre à l'alias, c'est-à-dire 0 ;
- `_verifyOwners` appelle `ownerOf` en direct ;
- `s.facts` n'est jamais décrémenté ;
- la formule de `_bill` borne à zéro ;
- le calcul de A sur §4.5 (ligne `{j: +5000}` révoquée : `dim = 0,5`, `incP = 0`), refait à la main.

## Phase 1 : ce que chacun a vu (résumé)

- **A** :
  - fidèle sur A, B, C, X et R1 bis ;
  - **§4.5 faux après une preuve de baisse** : `eUp` ne borne que `(t* − t)⁺` ;
  - **portée de la règle A** : une clé d'ancre contrôle aussi les agents que l'ancre possède, via `setAgentWallet` ;
  - **marge de la règle A** : elle rend `mainnet_em_d44` inutilisable (`distrustUp` ≥ 0,19 WAD) ;
  - une omission honnête peut être révélée de nouveau à chaque certificat ;
  - DISCLOSURE-GATE inopérant hors de `docs/erc/`.
- **B** :
  - interface et refus conformes ;
  - **règle d'alias non écrite** (`dst ≠ u` sur les arêtes héritées) ;
  - **⁺ manquants au §6.1** ;
  - l'alias vers une ligne non agent donne `BadRows`, pas `NotCanonical` ;
  - `_verifyOwners` hors R6 ;
  - **section Gas fausse** : `3k + 2` appels, environ 6 M, et non `2k + 1` ;
  - coût des faits non chiffré ;
  - « +27 % depuis les faits » mal attribué ;
  - fuite de #8317 dans `demo/` et `app/`.
- **C** :
  - **RFC 8785 non reproductible** : entiers au-delà de 2⁵³, tags qui ne sont pas de l'UTF-8 ;
  - MUST impossibles (§8.4 « ne revert jamais », §5.2 `tx.origin`) ;
  - MUST adressé aux ancres (§9) ;
  - `F_bas` non défini ;
  - Monad hors de la Motivation (« priced per page », « monad-agent-trust ») ;
  - **marqueurs à l'intérieur des blocs à coller** ;
  - `strip-notes.py` qui échoue sur (b) et (d) ;
  - A1b présenté à tort comme ouvert ;
  - texte trop long.
- **D** :
  - **un négatif omis peut ne pas baisser D**, puisque B⁻ renormalise ;
  - « only the client creates facts » est faux : l'owner peut en créer via une approbation ;
  - faits sur des agents hors table ;
  - alias et omission déclarée ;
  - **une seule preuve peut faire passer l'ensemble ouvert STALE**, ce qui ouvre le remplacement ;
  - coût permanent des faits ;
  - griefing rejouable ;
  - le DISCLOSURE-GATE inopérant ; **mettre aussi sous marqueur la mise sous silence par approbation**.
- **E** :
  - **la clé de cache du payeur laisse passer un veto en direct ou `REGISTRY_CHANGED`** ;
  - §2.4 contredit §3.1 ;
  - auto-boucle par alias ;
  - faits implicites (source nulle, agent hors table) ;
  - events `Approval` et `ApprovalForAll` absents de Backwards Compatibility ;
  - `RowVoided` sans `src` ;
  - vecteurs manquants ;
  - les ⟦OPEN⟧ disparaissent de la PR avec `strip-notes`.

## Phase 2 : relecture croisée (la session)

- **A est relu par D** : la portée de la règle A est juste, et pire qu'écrit, puisque `ownerOf` ne change pas et que le mode strict ne voit rien. En revanche, la « marge inutile » est un choix de code (02), pas une erreur du texte. La faute du texte serait de la taire.
- **B est relu par C** : la règle d'alias et les ⁺ sont des défauts normatifs réels, au sens où deux implémentations divergeraient. « Gas fausse » : exact. Le constat « l'alias donne `BadRows` » ne change rien, puisque le refus est normatif et son nom seulement recommandé.
- **C est relu par E** : RFC 8785 est le constat le plus sous-estimé de toute la relecture, parce qu'il rend la vérification du `setId` à partir du document impossible. Le reproche fait à A1b est trop dur : D23 est décidée mais **non implémentée**, comme D9. Marquer l'écart ouvert n'est pas rouvrir D23, c'est constater que le code n'est pas conforme.
- **D est relu par A** : la renormalisation de B⁻ est juste (`Σ_j d_uj = T·(1−α)·S⁻/max(GRID, S⁻)`, constante dès que S⁻ ≥ GRID). C'est un défaut de la **règle de remplacement** (code et D), pas du texte, qui doit l'avouer. Le STALE ouvert par une seule preuve est juste, et c'est un argument de plus pour les soumetteurs listés. En revanche, mettre la mise sous silence par approbation sous marqueur est trop prudent : elle découle du garde-fou public, et elle fonde une règle normative.
- **E est relu par B** : le cache est juste et grave, c'est un MUST qui mène à un paiement fautif. Le constat « strip-notes cache les ⟦OPEN⟧ » est faux sur le fond : le brouillon (a) les reprend comme questions dans le fil. Il est juste sur l'effet : la PR seule ne les montre pas.
- **Point commun, et oubli de tous sauf A et D** : les constats D (D sans les négatifs) et A (ancre propriétaire) touchent la **garantie centrale** (le leave-one-out, la méfiance). Ce ne sont pas des imprécisions de rédaction. Ils relèvent du conseil et du code.

## Phase 3 : synthèse tranchée

| Q | Décision | Argument qui l'emporte | Ce qu'on perd | Confiance |
|---|---|---|---|---|
| Q1 Fidélité | **Fidèle sur toute la mécanique.** Il reste 9 écarts de rédaction, corrigés dans la foulée : alias, ⁺, §4.5, §5.2, faits implicites, alias et omission déclarée, `ResidualTooLarge`, `F_bas`, nombre d'appels | 5 sur 5 confirment A, B, C, X, R1 bis et les refus. Les écarts portent sur ce que le texte ne dit pas | — | 0,85 |
| Q2 Security | **Honnête mais incomplète.** Ajouts faits : portée de la règle A, sa marge, D absorbé par B⁻, faits créés par l'owner, STALE ouvert par une preuve, preuve rejouable, coût permanent des faits, cache contre veto, `3k + 2` appels. **Deux défauts de conception** relèvent du code et du conseil : AM-08bis.11 et .12 | Une Security qui tait un contournement du leave-one-out serait trompeuse | La simplicité du message « une clé volée ne fait pas payer », qu'il faut nuancer | 0,8 |
| Q3 PR | **Pas prête. Aucune PR avant le 13/10.** Ouvrir la PR au plus tôt après la divulgation et son délai, et après la décision du conseil sur AM-08bis.11 et .12. Le jugement (jusqu'au 27/10) n'exige pas de PR | 4 experts sur 5 disent « après » (C : « avant seulement si (c) part le 08/10 avec 72 h de délai »). La PR exposerait deux défauts de garantie et A1b/EFF1 encore ouverts | L'antériorité publique de quelques jours ; le « PR scheduled » de la soumission compense | 0,75 |
| Q4 DISCLOSURE-GATE | **Complets dans `docs/erc/`**, vérifiés par 4 experts et par script, mais **inopérants pour le dépôt** : `README.md`, `app/src/ui/Act1.tsx`, `demo/JUDGES.md` et `ANCRE.md` publient les mêmes faits sans marqueur. La divulgation doit partir **avant** la mise en public (12/10), ERC ou pas. **La mise sous silence par approbation n'est pas mise sous marqueur** | Elle fonde la règle B, normative ; la masquer rend le texte incohérent avec le code. Il faut en revanche que (c) la présente avant toute version publique | Le « premier avertissement » privé sur ce point, si (c) ne part pas avant | 0,7 |

## Désaccords non résolus

1. **Mise sous silence par approbation sous marqueur** : D dit oui, A, B, C et E disent non.
2. **Date de la PR** : C dit avant le 13/10 si la divulgation part le 08/10 ; A, B, D et E disent après.
3. **A1b** : C dit qu'il ne faut pas de marqueur OPEN (D23 est décidée) ; la session et E disent qu'il en faut un, parce que le code ne suit pas D23.
4. **Marge de la règle A** : A la juge inutile et propose de la supprimer dans le code ; personne d'autre ne s'est prononcé, à trancher par le 02.
5. **Longueur** (C : environ 17 000 mots) : déplacer les tableaux de mesures et les TC détaillés dans `assets/` avant la PR. Ce n'est pas fait, pour garder les chiffres sous les yeux du conseil.

## Ce qu'on aurait dû demander

- Si la garantie « une ancre compromise ne fait pas payer » tient quand l'ancre possède des agents. Ce n'était pas dans les questions, et A l'a trouvé seul.
- Si la règle de remplacement protège un **veto** précis, et pas seulement l'agrégat D (D l'a vu).
- Si un payeur qui met en cache peut encore respecter le « bloc suivant » du disjoncteur (E l'a vu, et cela touche directement la promesse de la démo).

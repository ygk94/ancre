# Tour 6 du conseil — 2026-09-28 — repli owner (AM-6.12) et différenciation face à Kanmani/Sentinel

> Protocole `llm-council` : 5 experts indépendants, relecture croisée à l'aveugle, synthèse tranchée. Une seule instance de modèle joue les cinq voix.
> J'ai relu avant de délibérer (règle AM-3.13) : le journal D1-D43, la section « Vagues 1 et 2 », les AM-6.x, ANCRE.md §9 et `docs/ressources/nouveaux-avis-mainnet.md`.
> Numérotation provisoire : D-6.n et AM-7.n, à renuméroter lors de la fusion dans le CR.

## Faits établis (28/09, entre 05:50 et 06:00 UTC)

**Agents on-chain.** Source : IdentityRegistry `0x8004A169…a432`, lu par `cast` sur `rpc.monad.xyz`.
- Les agents #10252 « Kanmani », #10256 « Sentinel » et #10257 « Assay » ont tous le même owner et le même `agentWallet` : `0xDB6c6340342e71A63cD11Ebac2185204b7777777`. **MESURÉ**
- Leur `tokenURI` est un JSON en ligne (A2A `protocolVersion` 0.3.0). **MESURÉ**
- **Kanmani** : *« Checks whether the payment an ERC-8004 evidence document describes actually happened, by reading the cited transaction on the chain the document names. »* Sa liste de refus (`refuses`) contient « ranking agents by a score that is not published ». **MESURÉ**
- **Sentinel** : *« A pre-hire verdict on one agent, stamped with the block it was measured at, refused rather than served if it is older than the freshness bound you set. »* **MESURÉ**
  - Service x402 sur `eip155:143`, en USDC, `maxAmountRequired` 10000, soit 0,01 USDC.
  - Il déclare `measuredBlockMs: 266`.
  - Il déclare une caution : contrat `0x57aF4e4B482Ab1bb4f9d1aeb5206258a7Def0eaf` (du code est déployé, ~8,5 ko), 10000 atomiques, `minTruthRateBps` 8000.
- **Assay** : un prix de caution par agent, *« derived from its measured claim-truth rate »*. **MESURÉ**

**Leur API.** L'API répond HTTP 402 avec un défi x402 v2 (`exact`, 0,01 USDC). Le verdict est donc **servi hors chaîne, contre paiement**, et pas lisible par un contrat. Un contrat peut seulement lire leur caution. **MESURÉ**

**Leur site.** Source : `kanmani.xyz`, `/llms.txt` et `/agents.md`, lus le 28/09. **DOC**, c'est-à-dire auto-déclaré.
- Positionnement : *« The settlement and trust layer for agent work on Monad. Trust stops being a badge. It becomes a price. »*
  - un escrow USDC ;
  - le reçu est émis par le règlement lui-même ;
  - le taux de véracité des déclarations fixe la caution ;
  - un verdict signé saisit la caution.
- Leur constat : *« 73 of 85 payment claims on Monad cite a transaction that is not on the chain the document names. »* Distribution : 1 095 documents sans déclaration de paiement, 12 vrais, 12 invérifiables.
- 8 640 agents pointent vers un document supprimé, dont 8 093 partagent **un seul** document, enregistré par 7 962 wallets distincts. On retrouve la ferme sous un autre angle.
- Quatre verdicts : `true`, `false`, `noClaim` et `unknown`, avec la consigne de ne jamais confondre `unknown` et `false`. Chaque réponse est datée (`checkedAt`, `checkedAtBlock`) et reproductible (`reproduce`).
- `/api/agent/182` (Eve-8004) : 7 665 avis on-chain, 0 vérifiable.

**Ce qui n'est pas vérifié**
- Pas de dépôt public trouvé.
- Le fonctionnement interne de Sentinel est inconnu : données exactes, présence d'ancres, résistance aux Sybil.
- Le code source de la caution n'est pas lu.

**Lecture du conseil**, à partir des faits ci-dessus :
- Kanmani mesure la **véracité des reçus**, sur une métrique globale par agent. On ne voit ni ancres ni graphe de confiance.
- ANCRE mesure **qui, parmi les ancres du lecteur, se porte garant**.
- **Les deux axes sont orthogonaux.** Un reçu vrai ne dit rien de l'indépendance de celui qui paie. La ferme d'Eve payait, et le propriétaire finançait les noteurs (mesure ColinkaMir, CLAUDE.md §3).

**Repli owner.** Mesuré, dans `nouveaux-avis-mainnet.md` : +48 arêtes émises par des agents dans le graphe d'execution.market, toujours 0 masse depuis les ancres honnêtes. 70 agents transférés sur 71 ont un `agentWallet = 0` (CR, tour 3).

## Questions

- **Q1.** Faut-il un repli « owner si `agentWallet = 0` » dans la résolution du nœud émetteur (D16, D20) ?
- **Q2.** Comment se différencier de Kanmani/Sentinel et des trois concurrents par bounty (headwater-indexer, mandate, warrant) ? Avec quelle phrase, quelle scène de moins de 20 s, et qu'est-ce qu'il ne faut pas prétendre ?
- **Q3.** Y a-t-il quelque chose à consommer ou à intégrer de Kanmani ?

**Q1 est mal posée.** La vraie question n'est pas « faut-il récupérer 48 arêtes ». Elle est : *un agent transféré qui n'a pas re-vérifié son wallet doit-il rester muet pour toujours ?* Aujourd'hui, 70 agents sur 71 le sont.

---

## Phase 1 — Analyses indépendantes

### A. Théoricien des graphes et de la résistance Sybil
- **Q1.** Le repli ne crée aucune masse. Il ouvre seulement des lignes pour des agents qui en ont déjà.
  - Avec la copie de ligne (D20, mesurée sans amplification en D34), un owner qui détient N agents transférés émet N fois sa ligne, chaque fois avec la masse d'un agent. C'est exactement la sémantique d'un wallet partagé, sans rien de plus à borner.
  - La borne π(S) ne change pas, puisque les arêtes d'attaque viennent toujours d'agents qui ont de la masse.
  - Définition propre : A(c) = {j : agentWallet(j) = c} ∪ {j : agentWallet(j) = 0 ∧ ownerOf(j) = c}.
  - C'est cohérent : l'owner est déjà l'autorité ultime, puisqu'il peut poser le wallet en 5 minutes.
- **Q2.** Il faut séparer deux axes, et le prouver. La véracité d'un reçu est une propriété **locale** d'un avis. La confiance ANCRE est une propriété **du graphe, relative au lecteur**. Une région Sybil peut avoir 100 % de reçus vrais et une masse nulle.
- **Q3.** Le verdict de Kanmani pourrait servir de filtre d'arêtes : une arête ne compte que si le reçu cité n'est pas `false`. Mais c'est un oracle hors chaîne. Il ne peut être qu'un `edgeFilterId` facultatif, jamais un élément du niveau Registry-verified.

### B. Ingénieur EVM
- **Q1.** C'est vérifiable ligne par ligne : `getAgentWallet(j) == 0` et `ownerOf(j) == c`, soit deux lectures par agent copié, au même coût que la vérification du wallet de D32.
  - En revanche, aucun index inverse owner → agents n'existe on-chain. La **complétude** reste donc contestable (preuve (i)), pas vérifiable.
  - Nouveau type d'écart : quand le wallet passe de 0 à une adresse, la copie par owner disparaît. C'est une diminution, prouvable par (iv-a).
- **Q2.** La scène de moins de 20 s doit montrer ce qu'un verdict hors chaîne ne peut pas faire : **un contrat qui lit la décision et refuse de payer, dans la même transaction.** Le verdict de Sentinel est payant et servi par une API (HTTP 402, mesuré). Un contrat ne peut pas l'appeler.
- **Q3.** Il n'y a rien à intégrer on-chain. La caution est un contrat, mais nous ne connaissons pas son interface.

### C. Concepteur de normes
- **Q1.** Le registre efface `agentWallet` au transfert **pour forcer le nouvel owner à prouver le contrôle du wallet**. Replier sur l'owner ne contourne pas cette protection : l'owner n'est pas le wallet effacé, et il contrôle l'agent.
  - La norme doit écrire la résolution de façon **déterministe et ordonnée** : d'abord `agentWallet`, puis owner si le wallet est nul.
  - Il faut fournir un vecteur de test (execution.market).
- **Q2.** Il ne faut **jamais** se positionner contre un concurrent dans l'ERC. Kanmani entre en Rationale, comme couche complémentaire de **vérification des preuves de paiement**, qu'ERC-8004 laisse aussi au lecteur (le `proofOfPayment` n'est vérifié par personne).
- **Q3.** Kanmani est l'exemple canonique d'`edgeFilterId` sur une propriété de l'avis, comme ColinkaMir l'est sur la provenance.

### D. Attaquant économique
- **Q1.** Avec le repli, j'achète un agent réputé et je parle **tout de suite** avec sa masse, sans même re-signer de wallet. Sans le repli, je signe `setAgentWallet` en 5 minutes et j'arrive au même résultat.
  - Le repli n'aggrave presque rien. Le vrai problème, c'est l'**achat d'influence** (AM-2.7).
  - Mesure utile : pendant la pause `TRANSFERRED` (D10, D35), les arêtes **sortantes** de l'agent doivent aussi être gelées jusqu'au prochain certificat, et pas seulement sa confiance entrante.
- **Q2.** Pour prouver la différence, je monte la ferme honnêtement : 50 agents qui se paient entre eux par escrow. **Tous les reçus sont vrais**, le taux de véracité vaut 100 % et la caution est au plancher. Mais la masse ANCRE est nulle et le paiement est refusé.
  - Attention : on ne peut **pas** affirmer que Sentinel paierait cette ferme. On ne connaît pas son algorithme.
- **Q3.** Si l'on filtre sur le verdict de Kanmani, je deviens dépendant de leur disponibilité, avec un `unknown` en cas de panne. En plus, un filtre qui exige « reçu vrai » récompense ma ferme qui s'auto-paie. **Ne pas en faire un défaut.**

### E. Intégrateur
- **Q1.** Je veux que mes fournisseurs transférés d'une plateforme (execution.market mint puis transfère) comptent. Aujourd'hui, ils sont muets. C'est un faux négatif pour moi.
- **Q2.** La phrase qui me parle : *« Kanmani te dit si le reçu est vrai. ANCRE te dit si quelqu'un en qui tu as confiance se porte garant de celui qui l'a émis, et ton contrat le lit avant de payer. »* Pour moi, les deux sont utiles.
- **Q3.** Ce n'est pas nécessaire pour la démo. Je préfère une mention « compatible » à une intégration fragile à 15 jours de la clôture.

---

## Phase 2 — Relecture croisée à l'aveugle

Ordre anonyme : **1 = D, 2 = A, 3 = E, 4 = C, 5 = B**.

- **A relit D (1).** Juste sur l'achat d'influence. *Oubli* : geler les arêtes sortantes pendant `TRANSFERRED` ne tient qu'en mode strict (`ownerOf` en direct). En mode rapide, le gel dépend du surveillant.
- **A relit B (5).** Juste sur la complétude. *Trop optimiste* : « même coût que D32 » ignore le cas d'un owner de 762 agents à `agentWallet = 0`, qui donne 762 lectures en Registry-verified. Il faut un plafond, ou des lignes alias vérifiées une seule fois.
- **B relit A (2).** La formule de A(c) est juste. *Oubli* : l'ordre de priorité. Si un agent a `agentWallet = x` et que son owner c note ailleurs, la ligne de c ne doit **pas** être copiée dans cet agent (le wallet posé l'emporte). A(c) le dit implicitement ; il faut l'écrire.
- **B relit E (3).** La phrase est bonne, mais elle attribue à Kanmani une capacité (« le reçu est vrai ») que nous n'avons pas vérifiée nous-mêmes. On la tient de leur doc : il faut la marquer comme auto-déclarée.
- **C relit D (1).** La scène de la ferme qui s'auto-paie est la meilleure. *Faux* : « taux de véracité à 100 %, caution au plancher » suppose le fonctionnement d'Assay. On doit montrer **nos** mesures (reçus vrais, masse nulle), sans calculer la caution de Kanmani à leur place.
- **C relit B (5).** « Un contrat ne peut pas appeler Sentinel » est vrai pour le verdict. Mais leur **caution est on-chain** et peut être saisie : c'est aussi une garantie économique que lit un contrat. Il ne faut pas prétendre qu'ils n'ont « rien de lisible on-chain ».
- **D relit C (4).** Mettre Kanmani en Rationale, d'accord. *Oubli* : leur constat « 73 sur 85 déclarations fausses » est une donnée qui renforce notre Motivation (le paiement ne prouve rien). Si on la cite, il faut la dater et la marquer auto-déclarée.
- **D relit A (2).** « La borne π(S) ne change pas » est vrai. *Oubli* : le repli **élargit le support** (48 arêtes de plus sur le mainnet, plus sur d'autres chaînes). Il y a donc plus de lignes à fournir et plus de surface pour les preuves d'écart. C'est un coût, pas une faille.
- **E relit B (5).** « Un contrat lit la décision dans la même transaction » est notre argument, mais il faut le **montrer** : un appel d'`isTrusted` dans le payeur ERC-1271 (D41), avec la trace.
- **E relit C (4).** Pas d'attaque dans l'ERC, d'accord. Mais dans le pitch, **le jury connaîtra Kanmani** (Monad, même track probable). L'ignorer serait pire que le citer.

---

## Phase 3 — Décisions

### D-6.1 — Repli owner, avec ordre de priorité et gel au transfert *(Q1)*

**Décision.**
- **Résolution du nœud émetteur.** Pour une adresse de noteur c, on définit :
  - A(c) = {j : agentWallet(j) = c} ∪ {j : agentWallet(j) = 0 ∧ ownerOf(j) = c}
  - **Le wallet posé l'emporte** : un agent dont `agentWallet ≠ 0` n'émet jamais la ligne de son owner.
  - La copie de ligne (D20) s'applique à tous les j de A(c) qui ont de la masse. Si A(c) est vide, c devient un nœud-adresse.
- **Rejet d'arête.** Il est inchangé : on rejette si c est un contrôleur actuel de la cible.
- **Gel au transfert.** Tant que j est `TRANSFERRED` (D35, mode strict), **ses arêtes sortantes sont gelées aussi**, jusqu'au prochain certificat.
- **Registry-verified (D32).** Deux lectures par agent copié, soit `getAgentWallet` et `ownerOf`. Au-delà de ROW_ALIAS_MAX copies (choix : 64), on utilise des lignes alias, vérifiées une fois par owner.
- **Nouvelle preuve d'écart.** Un wallet qui passe de 0 à x fait disparaître la copie par owner. C'est une diminution, prouvable par (iv-a).
- **Vecteur de test normatif.** Le graphe d'execution.market : 48 arêtes, masse 0 depuis les ancres honnêtes.

**Argument décisif.** Le repli supprime un faux négatif massif (70 agents transférés sur 71 sont muets), sans rien créer côté masse (D34). Et il ne rend l'achat d'influence ni plus facile ni moins facile, puisque la re-signature ne prend que 5 minutes.

**Ce qu'on perd.** Le support s'élargit : plus de lignes et plus de preuves possibles. Il faut aussi une règle de priorité à tester.

**Confiance.** 0,65.

### D-6.2 — Positionnement : deux axes orthogonaux, prouvés par une scène *(Q2)*

**Phrase** (pitch et write-up, en anglais) :
> *“A receipt can be true and still come from a farm. ANCRE doesn't ask whether the payment happened — it asks whether anyone **you** trust vouches for who made it, and your contract reads the answer before it pays.”*

**Scène de moins de 20 s** (à ajouter à l'acte 2) :
1. On part de notre ferme de démo sur le testnet, dont les agents **se paient réellement entre eux** via x402. Tous les reçus sont vrais, et on le vérifie on-chain à l'écran.
2. La moyenne naïve est au maximum, la part de reçus vrais est de 100 %.
3. **La masse ANCRE est nulle, et `isTrusted` refuse** dans le payeur ERC-1271 : aucun transfert d'USDC n'a lieu.

Ce sont **nos mesures**, sur **notre** ferme. On ne calcule jamais le verdict d'un tiers à sa place.

**Ce qu'il ne faut PAS prétendre**
- que Sentinel, Kanmani ou Assay paieraient cette ferme (leur algorithme est inconnu) ;
- que ces services n'ont rien on-chain (leur caution est on-chain) ;
- qu'ANCRE est le premier « verdict daté par bloc » (Sentinel le fait) ;
- qu'ANCRE est le premier à parler de fraîcheur ou de caution.

**Ce qui nous est propre, et vérifiable** :
- les ancres choisies par le lecteur ;
- une borne Sybil formelle ;
- un certificat vérifié on-chain (sous-solution) ;
- une lecture **dans le contrat payeur** ;
- le veto d'ancre ;
- une norme ouverte.

**Concurrents par bounty**, en une ligne chacun, dans le write-up et **sans attaque** :

| Concurrent | Ce qu'il fait | Ce qu'ANCRE fait |
|---|---|---|
| headwater-indexer | la provenance des fonds | les arêtes de confiance et l'audit des certificats |
| mandate | un passkey qui possède l'agent | un passkey qui **récupère une ancre** |
| warrant | écrit des avis | **consomme** les avis pour décider du paiement |

**Citer ?**
- **Pitch** : oui, une diapositive « complementary layers » (Kanmani : reçus ; ColinkaMir : provenance ; ANCRE : garants). Le jury les connaîtra.
- **ERC** : en Rationale, comme exemples d'`edgeFilterId`.

**Confiance.** 0,75.

### D-6.3 — Kanmani : compatible, pas une dépendance *(Q3)*

**Décision.**
- L'ERC cite Kanmani comme exemple d'`edgeFilterId` portant sur une propriété de l'avis (la véracité du reçu), à côté de ColinkaMir pour la provenance.
- **Aucune intégration dans la démo.** C'est un oracle hors chaîne, payant, avec des `unknown` possibles, donc incompatible avec Registry-verified.
- **Aucun filtre « reçu vrai » par défaut**, parce qu'il récompense une ferme qui s'auto-paie.
- On peut citer leur constat (73 déclarations de paiement fausses sur 85) en Motivation, **daté du 28/09 et marqué auto-déclaré**, comme preuve supplémentaire que le paiement ne prouve rien.

**Confiance.** 0,8.

## Ce qui doit changer

- **`solver/graph.py`** (chantier 04) : résolution A(c) avec priorité du wallet, gel des arêtes sortantes en `TRANSFERRED`, vecteur execution.market.
- **Contrat** (chantier 02) : vérification des copies par owner (`getAgentWallet == 0 ∧ ownerOf == c`), plafond ROW_ALIAS_MAX, preuve (iv-a) pour le passage 0 → x.
- **Indexeur** (chantier 03) : entité « émetteur résolu » avec la règle A(c).
- **ERC** (chantier 08) :
  - §3 : résolution ordonnée de l'émetteur ;
  - Rationale : Kanmani et ColinkaMir comme exemples d'`edgeFilterId` ;
  - Motivation : le constat de Kanmani, daté et marqué auto-déclaré.
- **Acte 2** (chantiers 06 et 07) : la scène « ferme aux reçus vrais », avec vérification des reçus à l'écran.
- **Pitch** (chantier 09) : la phrase de D-6.2 et la diapositive « complementary layers ».

## Désaccords non résolus

1. **Gel des arêtes sortantes en mode rapide.** Sans `ownerOf` en direct, le gel dépend du surveillant (A contre D).
2. **Faut-il citer Kanmani dans le pitch ?** E et D disent oui, parce que le jury les connaît. C craint que le jury nous lise comme le « projet en réaction ».
3. **ROW_ALIAS_MAX = 64** est arbitraire. Aucune mesure sur un owner de 762 agents à wallet nul.
4. **Vaut-il la peine de coder le repli avant la soumission ?** Il apporte 0 masse sur le mainnet aujourd'hui. Son intérêt est normatif, et il fait un bon test.

## Ce que vous auriez dû me demander

1. **Kanmani concourt-il en track 04 ?** Si oui, c'est notre concurrent le plus sérieux sur « trust », avec une narration forte (« trust becomes a price »). Il faut savoir s'il est inscrit à Metropolis.
2. **Faut-il contacter Kanmani comme ColinkaMir ?** On pourrait proposer une interopérabilité (leur verdict comme `edgeFilterId`) avant le pitch, ce qui est cohérent avec « complementary layers ». Décision de Hugo.
3. **Notre ferme de démo doit-elle vraiment se payer ?** La scène D-6.2 l'exige : ce sont des paiements x402 réels sur le testnet, un surcoût de MON et d'USDC de test à intégrer dans `demo/BUDGET.md`.

## Angles morts découverts

| Id | Angle mort | Statut |
|---|---|---|
| AM-7.1 | **Kanmani, Sentinel et Assay forment une pile de « confiance par le prix »** : escrow, reçu par construction, caution saisie par un verdict. C'est un positionnement concurrent sur le même mot (« trust »), et il est absent de nos analyses de concurrence jusqu'au 27/09 | intégré (D-6.2) |
| AM-7.2 | Leur constat (73 déclarations de paiement fausses sur 85) **confirme notre Motivation** par un autre chemin, et c'est une donnée citable | D-6.3 |
| AM-7.3 | Le repli owner élargit le support, donc le coût de Registry-verified, en proportion des agents transférés | ROW_ALIAS_MAX (D-6.1) |
| AM-7.4 | La pause `TRANSFERRED` ne gelait que la confiance **entrante** : un agent racheté pouvait émettre des arêtes dès le certificat suivant | D-6.1 |
| AM-7.5 | Un filtre « reçu vrai » par défaut **récompenserait une ferme qui s'auto-paie** | D-6.3 |
| AM-7.6 | Sentinel déclare 266 ms par bloc, alors que nous mesurons 302 ms sur 1 000 blocs : la valeur diffère selon la fenêtre de mesure. Aucune valeur ne doit être codée en dur | noté |

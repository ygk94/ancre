# CR du conseil ANCRE — document cumulatif

> Un tour = un passage du protocole à 5 experts (A théoricien graphes/Sybil, B ingénieur EVM, C concepteur de normes, D attaquant économique, E intégrateur).
> Les cinq voix sont simulées par un seul modèle : l'indépendance est une discipline d'écriture, pas une garantie.
> Conventions : **mesuré** = relevé du 21/09/2026 fourni par Hugo · **estimé** = calcul d'ordre de grandeur · **supposé** = hypothèse du conseil, non vérifiée · **choix** = paramètre fixé par décision, à calibrer.

---

## Journal des décisions (état courant)

| # | Sujet | Décision | Tour | Confiance |
|---|---|---|---|---|
| D1 | Exposition du score | t_i en WAD (part de masse), plus de N ; politique engagée dans un `setId` immuable | 1 | 0,9 / 0,65 |
| D2 | α *(amendée par D24)* | 1/3, unique par déploiement, engagé dans le certificat | 1, confirmé 2 | 0,55 |
| D3 | Paiement | ni poids ni condition dans le cœur ; `edgeFilterId` en extension | 1 | 0,85 |
| D4 | Avis négatif | méfiance à un saut + veto direct des ancres lu dans le registre | 1, amendé 2 | 0,7 |
| D5 | Nœuds sans arête sortante | convention absorbante (linéarité exacte en p) | 1 | 0,9 |
| D6 | Liaison calldata ↔ registre | **certificat à borne croissante** : toute preuve d'écart élargit e, pas de slashing | 2 | 0,7 |
| D7 | Budgets | **budgets séparés** B⁺ et B⁻ (remplace le budget partagé du tour 1) | 2 | 0,75 |
| D8 | Robustesse aux ancres | veto q = 1 **et** confiance *leave-one-out* (m = 2 ancres minimum) | 2 | 0,65 |
| D9 | Identité des ancres | `anchorId` avec pré-rotation de clé ; nœud-ancre distinct du nœud-agent | 2 | 0,6 |
| D10 | Transfert d'agent | pause sur transfert (owner engagé dans la feuille), pas de remise à zéro | 2 | 0,5 |
| D11 | Lecture du score | ~~preuve portée~~ → **vecteurs stockés contigus + table de nœuds append-only**, `trustOf` lisible sans preuve (MIP-8 rend le stockage contigu bon marché) | 2, **renversée 3** | 0,7 |
| D12 | Schéma de tags | engagé **par ensemble**, pas de registre global ; schéma de référence publié par ANCRE | 2 | 0,75 |
| D13 | Ancres par défaut | aucune dans la norme ; ensembles de démo étiquetés ; motif « consommateur-ancre » recommandé | 2 | 0,6 |
| D14 | Unité d'arête | **dernier avis non révoqué par (client, agent, tag1)**, puis combinaison par **dominance du négatif** entre tags du filtre | 3 | 0,7 |
| D15 | Nature des tags | le schéma déclare `kind ∈ {endorsement, measurement}` ; **seuls les tags `endorsement` créent des arêtes** | 3 | 0,75 |
| D16 | Identité des noteurs *(amendée par D20)* | wallet → agent unique sinon nœud-adresse ; rejet si noteur ∈ contrôleurs de j **ou ancien owner de j** | 3 | 0,7 |
| D17 | Registre upgradable | le certificat engage adresses + `keccak(getVersion())` ; statut `REGISTRY_CHANGED` ; surveillance hors chaîne de `Upgraded` | 3 | 0,6 |
| D18 | Encodage | arêtes groupées par ligne, indices de nœuds stables, **poids quantifié normatif** (grille 1e-4, troncature vers zéro) | 3 | 0,7 |
| D19 | Démo *(amendée par D40)* | acte 1 = mainnet réel (ferme, fuite du scanner, contournement #8317) ; acte 2 = notre trafic ; α fixé par argument, mesuré sur graphes synthétiques à vérité connue | 3 | 0,7 |
| D20 | Wallets partagés | copie de ligne : chaque agent du wallet émet avec sa propre masse ; règle « ancien owner » retirée de la norme | 4 | 0,7 |
| D21 | Veto *(amendée par D33)* | bit de veto certifié dans la passe (lignes d'ancres non tronquables) + dernier avis lu en direct ; `MAX_SCAN` supprimé | 4 | 0,75 |
| D22 | Élargissement *(complétée par D36)* | seules les preuves de diminution élargissent la borne de confiance ; plafond par ligne (R6) | 4 | 0,65 |
| D23 | Permissions *(amendée par D32 : soumission ouverte seulement au niveau Registry-verified)* | certification sans permission ; entrée dans la table seulement par un certificat accepté ; zone de préparation par soumetteur | 4 | 0,7 |
| D24 | α et tags | α par ensemble, RECOMMENDED 1/3 ; TAGS_MAX = 16 | 4 | 0,7 |
| D25 | Coût de lecture *(amendée par D35 : mode strict par défaut)* | `TRANSFERRED` posé par preuve (mode rapide) ou `ownerOf` en direct (strict) ; cache de décision dans le router | 4 | 0,65 |
| D26 | **Certificat** *(confirmée comme lemme, amendée comme garantie par D32)* | **sous-solution : t ≤ F(t) composante par composante ⇒ borne inférieure exacte par agent ; e ne sert plus qu'à la méfiance et aux diminutions** | 4 | 0,75 |
| D27 | Modèle économique | le propriétaire d'un ensemble paie la certification ; le consommateur lésé paie ses preuves ; ANCRE opérateur = « oracle de réputation » ; aucun frais dans la norme | 5A | 0,7 |
| D28 | Plan B upgrade | test en fork de l'upgrade v2.1.0 (PR #80) ; recertification scriptée après `REGISTRY_CHANGED` ; démo figée sur un bloc (état anvil exporté) | 5A | 0,75 |
| D29 | Divulgation *(recommandation, décision de Hugo)* | prévenir en privé les auteurs d'ERC-8004 avant le 05/10 (EOA d'upgrade, garde-fou vs `agentWallet`, PR #84) ; ne jamais présenter le scanner comme attaquant | 5A | 0,7 |
| D30 | Positionnement | caméra témoin close ; ColinkaMir = exemple d'`edgeFilterId`, sans dépendance ; trustgraphs cité en antériorité ; D26 présenté comme usage on-chain d'une borne classique | 5A | 0,8 |
| D31 | Exécution *(recommandation)* | un responsable par étape du chemin critique ; ordre de coupe écrit ; jamais coupés : acte 1 reproductible, scènes veto / ancre compromise, démo figée | 5A | 0,65 |
| D32 | **Garantie du certificat** | D26 vaut **ssi C_engagé ≤ C_vrai entrée par entrée** ; B⁺ déclaré par ligne ; deux niveaux : **Registry-verified** (chaque arête relue dans le registre, seul niveau ouvert à tous) et **Submitter-attested** (liste de soumetteurs dans le `setId`, preuves d'écart actives) ; preuve (v) FABRICATION/GONFLEMENT ; contrat `t ≤ y` ; solveur depuis 0 | 5B | 0,8 |
| D33 | Veto | le **dernier avis de l'ancre lu dans le registre** fait foi ; le bit certifié est un complément « best effort » ; règle normative pour les ancres (republier le veto) ; tag `veto` RECOMMENDED | 5B | 0,75 |
| D34 | Copie de ligne | D20 confirmée : aucune amplification mesurée (masse Sybil 0,1481 pour M = 1 ou 100) | 5B | 0,75 |
| D35 | Transfert | `ownerOf` en direct par défaut (strict) ; le cache du router amortit ; mode rapide optionnel | 5B | 0,6 |
| D36 | Recertification | pas d'incrémental (réparation non locale mesurée) ; budget d'élargissement eLow_max engagé dans la politique, au-delà STALE | 5B | 0,6 |
| D37 | Vérification | 5 lemmes écrits (L1-L5) ; fuzz Python contre fractions exactes ; test différentiel Foundry ; vecteurs normatifs des 4 violations ; pas de Lean avant le 13/10 | 5B | 0,8 |
| D38 | Bounties sponsors *(décision de Hugo)* | viser **Envio** (indexeur du chantier 03 construit avec Envio), **MetaMask Agent Wallet Plugin** (chantier 05) et **Mera « One Passkey, Many Keys »** (ancres en passkey, chantiers 02 et 06). Aucun ne passe avant D32 ni avant la démo figée. Critères détaillés non lus (plateforme connectée) | 27/09 | — |
| D39 | Statut ≠ confiance | θ, ρ, m, q, maxAge et eLow_max sont engagés dans le `setId` et appliqués par `isTrusted`. `assess` OK ne veut pas dire « payable » | vagues 1-2 | 0,9 |
| D40 | Réseau de l'acte 2 *(amende D19, décision de Hugo)* | H-B : ferme et répétitions sur le testnet, une exécution minimale sur le mainnet (≈ 0,9 MON estimé) | vagues 1-2 | 0,7 |
| D41 | Double garde de paiement | payeur ERC-1271 qui détient les USDC (`isTrusted` dans `isValidSignature`) + plugin `mm` qui appelle `decide()` avant de signer ; Guard Mode n'autorise que le payeur | vagues 1-2 | 0,75 |
| D42 | Indexeur Envio | **indexeur de la norme + auditeur de certificats** : il calcule les arêtes selon D14/D15/D16/D20 (parité testée avec le solveur), audite chaque certificat ANCRE et produit une `Discrepancy` avec la preuve (v) prête à soumettre ; scan HyperSync de survie des avis par chaîne. Cloud : Monad 143, 10143 et une 3e chaîne. Coupé : wildcard, MCP, dashboard (réduit à `SetHealth`) | vague 3 (cross-idea) | 0,7 |
| D43 | Concept Mera *(rouvre la coupe AM-2.13, décision de Hugo)* | **un passkey, deux familles de sels** : (1) clés d'époque pré-rotées, empreinte vérifiée par le contrat (récupération de clé d'ancre sans custody, `rotateBySig`) ; (2) coffres contenant le dossier de veto. Scène : clé volée → slash abusif → rotation depuis l'iPhone → payé à nouveau au bloc suivant | vague 3 (cross-idea) | 0,7 |
| D44 | Repli owner *(amende D16/D20)* | A(c) = {j : wallet(j) = c} ∪ {j : wallet(j) = 0 ∧ owner(j) = c}. **Le wallet est prioritaire.** Pendant `TRANSFERRED`, on gèle aussi les arêtes **sortantes**. Deux lectures par agent concerné, ROW_ALIAS_MAX = 64, et une preuve (iv-a) pour le passage du wallet de 0 à une adresse | 6 | 0,65 |
| D45 | Positionnement | *« A receipt can be true and still come from a farm… »* On ne demande pas si le paiement a eu lieu, on demande si quelqu'un en qui **toi** tu as confiance se porte garant. **Scène de moins de 20 s** : notre ferme sur le testnet se paie vraiment (100 % de reçus vrais), mais sa masse ANCRE est nulle et `isTrusted` refuse dans le payeur. On n'affirme jamais le verdict d'un tiers. Dans le pitch, une diapositive « complementary layers » | 6 | 0,75 |
| D46 | Kanmani / Sentinel | cité comme exemple d'`edgeFilterId` dans l'ERC, et son constat (73 déclarations fausses sur 85, auto-déclaré) en Motivation ; **aucune dépendance** ; **pas de filtre « reçu vrai » par défaut**, parce qu'il récompense une ferme qui s'auto-paie | 6 | 0,7 |

---

## Feuille de route (mise à jour 2026-09-27)

Clôture des soumissions : **2026-10-13** (16 jours).
Légende : ✅ fait · 🔄 en cours · ⏭️ lancé automatiquement dès que l'étape précédente est finie · 🧑 attend une décision de Hugo.

| # | Étape | Dépend de | Qui | Statut |
|---|---|---|---|---|
| R1 | Vérifier les faits : registres réputation et identité, gas Monad, snapshot | — | 4 agents en parallèle | ✅ |
| R2 | **Tour 3 du conseil**, fondé sur les faits vérifiés : réviser D6, D9, D11 et l'encodage des arêtes | R1 | moi | ✅ |
| R3 | Mettre à jour CLAUDE.md : environnement machine réel (pas de cast, forge, gh ni python3.12), #9 et #87 notés par le même wallet, `getClients`, clé d'upgrade unique, `eth_getLogs` en grande plage sur rpc1, EIP-7623, MIP-8 | R1 | moi | ✅ |
| R4 | **Solveur PPR hors chaîne** (Python) sur le snapshot du 21/09 : règles d'arêtes du CR, convention absorbante, budgets séparés, leave-one-out. Mesure de α ∈ {1/4, 1/3, 1/2} (taille du support, taux de passage), et nombre d'arêtes qui survivent au schéma | R2 | agent | ✅ (95 tests ; voir solver/RESULTS.md) |
| R5 | **`AnchoredReputation.sol`** (niveau Residual-verified) : encodage compact des arêtes, k colonnes jointes, `vectorRoot`, `assess`. Puis `forge test --gas-report` pour remplacer toutes les estimations | R2 + Foundry installé | agent | ✅ (49 tests ; voir contracts/GAS.md) |
| R6 | **Réécrire le draft d'ERC** avec les décisions D1 à D13 et le tour 3. Nouveau fichier dans le dépôt, `docs/erc/anchored-reputation.md` ; le vault n'est pas modifié | R2 | agent | ✅ (docs/erc/, 28 incohérences AM-R6) |
| R6b | **Découpage par partie en briefs de session** (✅ 27/09 : `docs/chantiers/`, 9 briefs + index) : un fichier par chantier dans `docs/chantiers/`, pour qu'une discussion Claude Code dédiée puisse le prendre en charge seule (détail ci-dessous) | R2 à R6 terminés et relus | moi | ✅ |
| R7 | Indexeur des events : `NewFeedback`, `FeedbackRevoked`, `ResponseAppended`, `MetadataSet(agentWallet)`, `Transfer`, `Upgraded` | R2 | — | après R4 et R5 |
| R8 | `TrustGatedRouter` (x402 `upto`, USDC) + script de ferme Sybil + scènes de démo (une ancre compromise ne fait pas payer ; une ancre bloque un fournisseur) | R5 | — | après R5 |
| R9 | Écran de démo live | R7, R8 | — | — |
| R10 | Publier : PR sur `ethereum/ERCs`, réponse au post #309, contact avec ColinkaMir | R6 | 🧑 (publication externe : validation de Hugo obligatoire) | — |
| R11 | Déploiement mainnet, vidéo, profil de projet | R9 | 🧑 | — |

### R6b — Découpage par partie : ce qui est attendu

**But.** Répartir la suite du projet (R7 à R11, plus ce que R4 et R5 laisseront ouvert) en chantiers autonomes. Chaque chantier est traité dans **sa propre discussion**, avec assez de contexte pour être creusé à fond sans relire toute l'histoire. Les briefs **orientent sans tout résoudre** : ils nomment les structures, les parties techniques et les pièges connus, puis demandent explicitement à la session d'aller chercher les sources primaires (code, doc Monad, EIP, données). Un brief qui tranche tout serait moins précis qu'une session qui s'attarde sur son sujet.

**Un fichier par chantier** (`docs/chantiers/NN-nom.md`), toujours avec la même structure :
1. **Objectif et résultat final attendu** : le livrable concret (fichiers, contrats, scripts, mesures) et à quoi il sert dans la démo ou la norme.
2. **Contexte minimal** : les décisions du CR qui s'appliquent (D1 à D13 et suivantes, par numéro) et les faits vérifiés utiles, avec leur statut mesuré ou supposé.
3. **Ce qui est déjà tranché** et ne doit pas être rouvert sans preuve.
4. **Pistes techniques à creuser**, présentées comme des pistes et non comme des réponses. Par exemple : structures de données, encodages, interfaces, events à suivre, précompilés, limites RPC. La consigne est de vérifier chaque piste dans la source primaire et de la contredire si besoin.
5. **Pièges connus** : Monad, ERC-8004, arithmétique entière, environnement machine.
6. **Questions ouvertes** que la session doit trancher et documenter.
7. **Critères d'acceptation** vérifiables : tests, mesures de gas, sorties chiffrées, ce qui doit tourner.
8. **Interfaces avec les autres chantiers** : ce que le chantier consomme, ce qu'il produit, et les formats d'échange.
9. **Règles de la session** : français, sourcer et dater chaque chiffre, pas de commit ni de publication externe sans accord, mettre à jour le CR et la feuille de route à la fin.

**Découpage pressenti**, à affiner quand R4 et R5 auront rendu :
- contrat vérificateur et lecture ;
- indexeur et reconstruction du graphe ;
- solveur et certificateur ;
- router x402 et politique consommateur ;
- ferme Sybil et scénarios de démo ;
- écran de démo ;
- norme et publication ;
- pitch, vidéo et soumission.

**Résultat final de R6b** : les fichiers de briefs, plus un tableau d'ordonnancement (dépendances, chemin critique jusqu'au 13/10, ce qui peut tourner en parallèle) ajouté à cette feuille de route.

### Ordonnancement après R6b (27/09)

Détail et formats d'échange : `docs/chantiers/README.md`. Chemin critique : **01 → 02 → 04 → 06 → 07 → 09**.

| Dates | Chantiers |
|---|---|
| 28/09 | **01 Tour 4 du conseil** (✅ fait le 27/09 : D20 à D26). En parallèle : 03 (extraction brute) et 08 (relecture du draft) |
| 29/09 → 03/10 | 02 Contrat · 03 Indexeur · 04 Solveur et certificateur · 08 en continu |
| 02/10 → 06/10 | 05 Router x402 · 06 Ferme et scénarios (budget MON validé par Hugo avant toute transaction mainnet) |
| 05/10 → 09/10 | 07 Écran de démo · déploiement mainnet le 09/10 au plus tard |
| 09/10 → 12/10 | 09 Pitch, vidéo et soumission, **déposée le 12/10** |

**Tour 5 (✅ 27/09)** : questions de fond et contre-expertise du tour 4, D27 à D37. **Conséquence sur le planning : le chantier 02 commence par D32** (relecture des arêtes dans le registre et mesure de son coût). C'est cette mesure qui fixe le niveau de certification de la démo.

Les anciennes lignes R7 à R11 sont couvertes par les chantiers 03, 05, 06, 07, 08 et 09.

Règles d'exécution : aucun commit, aucun push, aucune publication externe sans demande explicite. Les agents n'écrivent ni dans le vault ni hors de leur périmètre.

---

## Angles morts découverts (cumulatif)

| Id | Tour | Angle mort | Statut |
|---|---|---|---|
| AM-1.1 | 1 | N est choisi par le certificateur et gonflable gratuitement | résolu (D1) |
| AM-1.2 | 1 | Renvoyer la masse sans issue vers p casse la linéarité en p | résolu (D5) |
| AM-1.3 | 1 | Le levier « précision » de α n'existe pas : la vérification coûte une passe quel que soit α | clos |
| AM-1.4 | 1 | La ferme n'entre jamais dans le calldata si on ne certifie que le support ; l'estimation 3,7 M gas est hors sujet | à mesurer |
| AM-1.5 | 1 | « Verified » prouve le point fixe de la matrice soumise, pas du registre | traité (D6) |
| AM-1.6 | 1 | Fenêtre de sortie entre méfait et recertification | traité (veto direct) |
| AM-2.1 | 2 | **Le registre ne stocke pas le bloc des avis** : toute preuve de fraude « cet avis existait avant certBlock » est impossible. Un contestataire peut poster un avis après la certification puis « prouver une omission » et faire slasher un certificateur honnête | résolu (D6 : élargissement au lieu de slashing) |
| AM-2.2 | 2 | Le registre est indexé par (agentId, client), **pas par client** : la complétude d'une ligne (tous les avis émis par u) n'est pas vérifiable on-chain, seulement contestable | accepté |
| AM-2.3 | 2 | Certification sans permission ⇒ un attaquant soumet un certificat bâclé (T énorme, e énorme) et met l'ensemble en déni de service | résolu (règle de remplacement par e effectif) |
| AM-2.4 | 2 | **L'argument du tour 1 pour le budget partagé était faux** : la borne sur la méfiance vient du saut unique (lignes de D ≤ 1), pas du partage. Le partage n'achète qu'un facteur ≤ 2 et punit les critiques | résolu (D7) |
| AM-2.5 | 2 | Le débat sur le quorum du veto regardait la mauvaise direction : une clé d'ancre volée coûte surtout par **l'approbation de Sybil** (vol), pas par le veto (déni de service, échec fermé) | résolu (D8 leave-one-out) |
| AM-2.6 | 2 | Pas de bloc ⇒ après rotation de clé, les avis de l'ancienne clé ne sont pas datables : le voleur peut poster des avis « anciens » | résolu (seuls les avis de la clé courante comptent) |
| AM-2.7 | 2 | Pas de bloc ⇒ **le rachat d'un agent réputé ne peut pas être neutralisé on-chain** (impossible de séparer les avis reçus avant/après transfert) | partiel (D10) |
| AM-2.8 | 2 | Une adresse qui est `agentWallet` d'un agent peut noter cet agent | **confirmé au tour 3** (source + 78 cas réels sur #8317) ; règle de rejet D16 |
| AM-2.9 | 2 | Le coût dominant probable est l'écriture de t_i, d_i en stockage, et il se supprime en faisant porter la preuve par le payé | traité (D11) |
| AM-2.10 | 2 | α change le coût via la **taille du support** (petit α ⇒ masse diffuse sur plus de nœuds) | noté |
| AM-2.11 | 2 | Le leave-one-out aggrave davantage le goulot d'intégration de E que α ne le faisait : un fournisseur a besoin de deux ancres | noté, impacte la démo |
| AM-2.12 | 2 | Échec fermé partout ⇒ ANCRE devient une **dépendance de vivacité** de chaque consommateur : si personne ne recertifie, tous les paiements s'arrêtent après maxAge | non résolu |
| AM-2.13 | 2 | **Budget de complexité** : 16 jours avant la clôture (13/10) et la spec a doublé en un tour. Aucun découpage hackathon / norme n'existe | traité (découpage ci-dessous) |
| AM-2.14 | 2 | Plusieurs signatures du registre sur lesquelles repose la spec ne sont pas vérifiées sur la v2.0.0 déployée | **résolu au tour 3** (faits vérifiés ci-dessous) |
| AM-3.1 | 3 | **« Dernier avis par couple » efface un négatif posté sous un autre tag.** Cas réel : `0xea0b…` → #4, `slash −100` puis `review +1` ; le filtre garde +1. C'était la seule arête négative utile du registre | résolu (D14) |
| AM-3.2 | 3 | **Les tags de mesure (liveness, uptime, trust de scanner) créent des arêtes d'attaque automatiques** : un scanner qui ping tout le monde « approuve » les Sybil. Cas réel : `0xa06f907f` note des agents Spawn, qui notent Eve | résolu (D15) |
| AM-3.3 | 3 | Le garde-fou anti-auto-notation du registre est **contourné en pratique** (78 avis de #8317 par son propre wallet) et **rouvert après transfert** (ancien owner, anciens opérateurs) | résolu (D16) |
| AM-3.4 | 3 | `agentWallet` **n'est pas unique** : 178 wallets pour 1 773 agents ; 91 avis à émetteur ambigu ; aucun index inverse on-chain | résolu (D16) |
| AM-3.5 | 3 | **Une seule EOA (`0x5472…2603`) peut réécrire les deux registres**, sans délai ; un contrat ne peut pas lire le slot d'implémentation d'un autre contrat | partiel (D17) |
| AM-3.6 | 3 | **Plancher EIP-7623 actif** : 40 gas/octet non nul. L'estimation de 350-400 gas/arête était fausse d'un facteur 4 à 7 à 64 octets/arête. La quantification du poids devient normative, car elle change t | résolu (D18) |
| AM-3.7 | 3 | Sur Monad (MIP-8), **un tableau contigu mis à jour sur place coûte ~100 gas/slot** ; c'est le `mapping` (une page par clé) qui coûte cher. La preuve portée de D11 résolvait un problème qui n'existe pas | résolu (D11 renversée) |
| AM-3.8 | 3 | **L'index de 8004scan est incomplet** : 10 agents notés absents de `agents.json` ; « 10 171 agents » est un minimum | indexeur maison obligatoire |
| AM-3.9 | 3 | ~~**Le registre est dormant**~~ **faux depuis le 27/09** (95 nouveaux avis depuis le bloc 108 483 651) — : aucun avis depuis le 2026-09-10 (bloc 103 696 240). Toute scène « live » sur mainnet sera notre propre trafic | intégré (D19) |
| AM-3.10 | 3 | **α ne peut pas être calibré sur le mainnet** : support ≤ 5 nœuds, une seule chaîne honnête de 2 sauts | intégré (D19) |
| AM-3.11 | 3 | `rpc1.monad.xyz` accepte des `eth_getLogs` sur tout l'historique : la limite de 100 blocs (CLAUDE.md §7) dépend du fournisseur | à intégrer dans l'indexeur |
| AM-3.12 | 3 | La doc Monad se contredit sur le temps de bloc (0,3 s ou 0,4 s) : tout calcul en blocs/jour est incertain d'un facteur 4/3 | noté ; paramètres en blocs, jamais en secondes |
| AM-3.13 | 3 | **Angle mort de méthode** : le draft d'ERC du 21/09 contenait déjà `lastIndexRoot` et la demande de `block.number` à ERC-8004. Les tours 1 et 2 ont délibéré sans le relire | règle : relire le draft avant chaque tour |
| AM-3.14 | 3 | CLAUDE.md §8 décrit une autre machine (cast/python3.12 absents, vault ailleurs) | résolu (R3) |
| AM-R4/R5/R6 | 3 | Angles morts des chantiers : voir « Résultats des chantiers R4, R5 et R6 » et les fichiers `solver/RESULTS.md`, `contracts/GAS.md`, `docs/erc/CHANGES.md` | traités au tour 4 |
| AM-4.1 | 4 | Le nœud-adresse sans masse pénalisait les wallets partagés sans aucun gain Sybil | résolu (D20) |
| AM-4.2 | 4 | La règle « ancien owner » était invérifiable on-chain et fausse pour les plateformes | supprimée (D20) |
| AM-4.3 | 4 | **Quatre tours ont certifié une norme du résidu alors qu'un signe suffisait** (monotonie de F ⇒ borne inférieure exacte par agent) | résolu (D26) |
| AM-4.4 | 4 | La dilution de B⁺ fait d'un avis positif une diminution pour les autres entrées | intégré (D22) |
| AM-4.5 | 4 | Une décision de paiement peut coûter plus cher que le micropaiement lui-même | cache (D25) |
| AM-4.6 | 4 | Un veto ne se lève qu'après recertification | assumé |
| AM-4.7 | 4 | Fenêtre « slash puis +1 sous un autre tag » entre deux certificats | documenté |
| AM-4.8 | 4 | Le veto certifié exige des lignes d'ancres non tronquées | MUST (D21) |
| AM-5.1 | 5A | Le bounty « passkeys » de la Monad Foundation vise **Mera**, pas le P256 en général | corrigé (CLAUDE.md, brief 06) |
| AM-5.2 | 5A | Le scanner `0xa06f907f` est un service automatique de filtrage de risque (24 `trust/oracle-screening`, 8 `liveness`, EOA sans agent), pas un complice | intégré (D29) |
| AM-5.3 | 5A | La PR #84 (auto-notation), fermée sans fusion, montre que les auteurs d'ERC-8004 connaissent le sujet | intégré (D29) |
| AM-5.4 | 5A | Prévenir les auteurs peut déclencher une upgrade avant le 13/10 : divulgation et plan B sont liés | intégré (D28) |
| AM-5.5 | 5A | Une ferme de démo à déployeur unique (CREATE2) est triviale à détecter par provenance : ce n'est pas ce qu'ANCRE démontre | à documenter (chantier 06) |
| AM-5.6 | 5A | Le lemme de D26 est classique (PPR locale) ; seul son usage comme certificat on-chain est neuf | intégré (D30) |
| AM-5.7 | 5A | Pas de grille de notation publiée, pas d'exigence de mainnet (page officielle, 27/09) : l'acte 2 sur le mainnet est un choix | noté |
| AM-5.8 | 5A | Rejouer la démo en fork exige un RPC d'archive ou un état exporté | intégré (D28) |
| AM-5.9 | 5B | **CRITIQUE : un certificat fabriqué de même précision remplace le certificat honnête.** `submitCertificate` ne relit aucune arête ; mesuré sur le vecteur réel (0x0730→#4 fabriquée : t(#4) = 0,111 au lieu de 0, eUp identique) | résolu en spec (D32), à implémenter (chantier 02) |
| AM-5.10 | 5B | Le bit de veto certifié se désarme par omission ; le seul négatif utile du mainnet est justement le cas invisible au veto en direct | intégré (D33) |
| AM-5.11 | 5B | La dilution n'est pas marginale : 56 % des omissions avec dilution violent t ≤ t* (facteur 2 dans le contre-exemple minimal) | intégré (D32, B⁺ déclaré) |
| AM-5.12 | 5B | Le `certify` de R4 ne produit pas toujours une sous-solution (1 wei sur `toy_alpha_1_3`) : les vecteurs R4 sont à régénérer | chantier 04 |
| AM-5.13 | 5B | Réparation incrémentale non locale : 93 % des nœuds touchés, jusqu'à 14 % de masse perdue | intégré (D36) |
| AM-5.14 | 5B | La preuve (v) FABRICATION/GONFLEMENT n'existe ni dans R5 ni au tour 4 | intégré (D32) |
| AM-5.15 | 5B | « Lignes tronquées ou omises ne peuvent que l'augmenter » (tour 4) n'est vrai que pour des lignes entières, ou avec B⁺ déclaré | intégré (D32) |
| AM-5.16 | 5B | Un vecteur nul est une sous-solution valide : après `REGISTRY_CHANGED` ou maxAge, n'importe qui peut publier t = 0 et mettre tout le monde en échec fermé | à traiter (chantier 02 : règle de remplacement par masse, pas seulement par eEff) |
| AM-5.17 | 5B | eUp est confortable : écart réel ≤ 2/3 de la borne ; 3-5 itérations sur le mainnet, 79-82 sur le graphe de démo | confirmé |
| AM-5.18 | 5 | **Angle mort de méthode** : l'ancien draft (21/09) prévoyait un défi « Fabrication » ; le tour 2 l'a perdu en listant les preuves (i)-(iv), et trois tours n'ont pas vu qu'aucune arête n'était relue. Renommer « Verified » en « Residual-verified » a nommé le problème sans le traiter | règle : pour chaque garantie, écrire l'attaque qui la falsifie et le test qui l'exclut |

---

# Tour 1 — 2026-09-27

Décisions D1 à D5. Détail dans la conversation d'origine ; spécification Q4 du tour 1 amendée au tour 2 (budgets séparés, leave-one-out, lecture à preuve portée). Les points non modifiés restent valides : règle d'arête (dernier avis non révoqué par couple, rejet hors bornes, schéma par tag), convention absorbante, vérification en une passe avec arrondis majorés, troncature avec marge (1−α)·t_u, veto direct.

---

# Tour 2 — 2026-09-27

## Reformulation

Les 14 points (6 désaccords + 8 questions) sont regroupés en 5 questions. Deux points sont **fermés sans délibération** :

- **Désaccord 6 (vérifiabilité du paiement).** C avait raison : une attestation signée du facilitator se vérifie par `ecrecover`. L'argument de B (« impossible ») est retiré. D3 ne change pas, car elle repose sur l'argument de D : le paiement se contourne par aller-retour et n'achète rien contre la ferme.
- **Question 3 (convention sans arête sortante).** Déjà tranchée au tour 1 (D5).

| Question du tour 2 | Points d'origine |
|---|---|
| Q1 — Qu'est-ce qui lie le certificat au registre, et qui en paie la fraîcheur ? **(la plus importante : c'est elle qui décide si « Verified » est un mensonge dans la démo)** | Q-oubliée 1, 2 |
| Q2 — Qu'est-ce qu'un nœud, qu'est-ce qu'une ancre, et que se passe-t-il quand une clé ou un NFT change de main ? | désaccord 4 ; Q-oubliées 4, 5, 6 |
| Q3 — Comment rendre le système robuste à une ancre compromise sans tuer la démo ni punir les critiques ? | désaccords 2, 3 |
| Q4 — α et architecture de coût : qu'est-ce qui coûte vraiment, et α y joue-t-il ? | désaccord 1 ; Q-oubliée 7 |
| Q5 — Qui écrit le schéma de tags, et que reste-t-il du graphe réel après lui ? | désaccord 5 ; Q-oubliée 8 |

**Question mal posée.** La Q-oubliée 1 suppose qu'on veut *empêcher* l'omission. On ne peut pas : le registre n'indexe pas les avis par émetteur et ne les date pas (AM-2.1, AM-2.2). La bonne question est : *quelle garantie reste vraie même quand l'omission n'est pas détectée, et que coûte-t-il de la faire valoir quand elle l'est ?*

---

## Phase 1 — Analyses indépendantes

### A. Théoricien des graphes et de la résistance Sybil

**Q1.** Une omission est une troncature que le prouveur n'a pas déclarée. Or j'ai déjà la borne : remplacer la ligne u par une autre ligne u' change F(t) d'au plus (1−α)·t_u·‖C_u − C'_u‖₁ en L1. Il suffit donc qu'une preuve d'écart rejoue la ligne engagée, calcule ce Δ et l'**ajoute au résidu**. La garantie « ‖t − t*‖₁ ≤ r/α » redevient vraie pour le graphe réel, avec un r plus grand. Par inégalité triangulaire, les preuves successives sur une même ligne sont sommables et restent saines. Rien n'exige de dater l'omission : la borne ne parle que de l'état présent.

**Q2.** Si l'ancre est un nœud-adresse distinct de son éventuel nœud-agent, le problème « l'ancre reçoit α·λ et passe tout seuil » disparaît sans exception : p charge l'adresse, et l'agent de l'ancre n'est noté que par des arêtes, comme les autres. Il faut une règle de rejet : aucune arête c → j si c est l'owner ou l'`agentWallet` de j.

**Q3.** Le tour 1 s'est trompé. La méfiance émise par une région S vaut (1−α)·Σ_{u∈S} t_u·Σ_j D_uj. Elle est ≤ (1−α)·π(S) dès que **les lignes de D sont ≤ 1**, que D partage ou non le budget de C. Le partage ne fait gagner qu'un facteur 2 au maximum sur la capacité de nuisance, et il fait payer la critique honnête. Avec des budgets séparés B⁺ = max(1, Σw⁺) et B⁻ = max(1, Σw⁻), la borne tient et le critique garde son pouvoir d'approbation.

Pour la compromission, la linéarité donne un outil gratuit : t_i = Σ_a λ_a·t_i^(a). Retirer la plus grosse contribution donne une confiance qu'**aucune ancre seule** ne peut produire.

**Q4.** α n'est plus le levier principal. Leave-one-out et densité dominent la portée. α ne se tranche qu'avec une mesure : la taille du support et le taux de passage leave-one-out pour α ∈ {1/4, 1/3, 1/2} sur un graphe de démo.

**Q5.** Le schéma de tags fait partie de la définition du graphe, au même titre que les ancres. S'il est engagé par ensemble, deux ensembles aux schémas différents calculent deux mesures différentes, exactement comme deux ensembles aux ancres différentes. Ce n'est pas un défaut d'interopérabilité, c'est la personnalisation elle-même.

### B. Ingénieur EVM

**Q1.** La vérification de complétude on-chain coûte une lecture de stockage par arête. Au prix de 8 100 gas par page touchée pour la première fois (chiffre fourni), un support de E arêtes coûte au moins 8 100·E, soit environ 3 700 arêtes dans 30 M (calcul, pas mesure). C'est faisable pour la fraîcheur des arêtes présentes. Ça ne prouve rien sur les **absentes**, puisqu'il n'y a pas d'index par client. Je préfère donc des preuves d'écart rares à une vérification systématique. Structure : `graphRoot` = Merkle des lignes, et une preuve d'écart = une ligne + un chemin de Merkle + une à trois lectures du registre. Coût borné par ligne, payé par le contestataire.

**Q2.** La pré-rotation coûte une lecture de plus par ancre dans le veto (clé courante). Supportable si K_MAX reste à 16. Le propriétaire engagé dans la feuille, c'est un `ownerOf` par lecture de confiance. Les coûts exacts via le proxy ne sont pas mesurés.

**Q3.** Le leave-one-out exige les k contributions par agent. Si une seule feuille Merkle contient t^(1..k) et d^(1..k), on n'a besoin que d'une preuve. La certification jointe des k colonnes multiplie le travail par arête par k dans la même transaction, avec un plafond à vérifier contre les 30 M par transaction (fait fourni).

**Q4.** Écrire t_i et d_i pour chaque agent du support en stockage est le poste inconnu, et probablement dominant (supposé). Solution : ne rien écrire par agent. On stocke un `vectorRoot` par certificat et **le payé fournit sa feuille et son chemin** dans la requête x402. Une écriture par certificat au lieu d'une par agent. Coût de lecture : un chemin Merkle, soit log₂(n) hachages, non mesuré.

**Q5.** La normalisation de `value/10^valueDecimals` en WAD doit se faire en entiers sans perte : x·10^(18−dec), puis produit en croisé avec (max − neutre). Les bornes du schéma sont des int256 à l'échelle WAD. Le schéma engagé par hash est lu hors chaîne ; on-chain, il ne sert que dans le veto et les preuves d'écart.

### C. Concepteur de normes

**Q1.** Le texte doit dire ce que le certificat garantit, **et rien de plus** : « point fixe du graphe engagé, avec une borne qui s'élargit de façon prouvable dès qu'on montre un écart avec le registre ». Sans slashing, il n'y a pas d'économie de caution à normer, et la norme reste portable. Je propose trois niveaux :
- **Residual-verified** : le résidu est vérifié.
- **Registry-contested** : le résidu est vérifié et des preuves d'écart sont acceptées.
- **Optimistic** : rien n'est vérifié.

**Q2.** Désigner les ancres par adresse rend la rotation impossible sans migrer tous les consommateurs. Les désigner par agentId ERC-8004 met les ancres en vente. Une troisième voie existe : un identifiant d'ancre auto-certifiant avec pré-rotation (engagement du hash de la clé suivante), motif connu de KERI. La norme définit le format, pas le contrat.

**Q3.** Le leave-one-out doit être un paramètre de politique (`minAnchors`), engagé dans le `setId`, défaut 2. Un implémenteur qui l'ignore obtient un système où une clé volée suffit à faire payer des Sybil : c'est à écrire en MUST dans les considérations de sécurité.

**Q4.** Changer l'interface de lecture vers une preuve portée casse le « `trustOf` lisible par n'importe quel contrat » du pitch. La norme doit garder les deux : une lecture à preuve portée (REQUIRED) et un cache optionnel.

**Q5.** Pas de registre global de tags : ce serait une autorité. La norme fixe le **format** du schéma (tag → min, neutre, max, échelle) et l'engagement par hash. ANCRE publie un schéma de référence que chacun est libre d'adopter.

### D. Attaquant économique

**Q1.** Si l'omission est slashée, je gagne sans tricher : je poste un avis juste après la certification, je « prouve » l'omission et je touche la caution d'un certificateur honnête. Le registre n'ayant pas de bloc, personne ne peut me contredire. Si la certification est sans permission, je soumets un certificat valide mais bâclé, où je tronque tout : e explose et l'ensemble refuse tout le monde. Il faut une règle de remplacement : un nouveau certificat ne remplace l'ancien que s'il est au moins aussi précis, ou si l'ancien est périmé. Enfin, le spam de preuves d'écart sur une même ligne ne doit être facturé qu'une fois.

**Q2.** Avec une clé d'ancre volée, je n'attaque pas par le veto, je fais **approuver mes Sybil** : chacune reçoit (1−α)·t_a divisé par le nombre d'arêtes. C'est du vol. Le veto n'est qu'un déni de service. Après rotation, si les avis de l'ancienne clé comptent encore, je continue à poster avec, et personne ne peut dater mes avis. Le rachat d'agent réputé reste ouvert : j'achète le NFT, je garde la réputation reçue.

**Q3.** Si q = 1 et la confiance leave-one-out est à m = 2, ma clé volée me donne au mieux un déni de service, jamais un paiement. C'est la bonne asymétrie. Avec des budgets séparés, un Sybil peut approuver *et* dénigrer à pleine capacité : ma nuisance double, mais elle reste bornée par π(S). Accepté.

**Q4.** Preuve portée par le payé : je fournis une feuille. Si le chemin est invalide, `isTrusted` renvoie faux ; rien à gagner. Mais si le cache optionnel existe, j'attaque sa fraîcheur. Il doit porter le `certBlock` et se soumettre aux mêmes règles d'élargissement.

**Q5.** Si le schéma est engagé par ensemble, je crée mon propre ensemble avec un schéma complaisant. Ça ne sert à rien : personne ne consomme mon ensemble. Le seul vrai risque est qu'un intégrateur paresseux choisisse un `setId` sans lire son schéma. C'est une question d'ergonomie, pas de sécurité.

### E. Intégrateur

**Q1.** Je veux une garantie qui se dégrade proprement au lieu de basculer. Une borne qui s'élargit fait ça : mon fournisseur à forte confiance reste payé, le marginal ne l'est plus. Mais si personne ne recertifie, je finis bloqué après maxAge, et **ma production dépend d'un certificateur que je ne contrôle pas**. Il me faut soit pouvoir recertifier moi-même (sans permission), soit un mode dégradé explicite.

**Q2.** Sur transfert d'un fournisseur, je préfère une pause à une remise à zéro silencieuse : je vois l'événement et je décide. La rotation de clé d'ancre ne doit rien me demander : mon `setId` pointe vers des `anchorId`, pas vers des clés.

**Q3.** m = 2, c'est deux ancres à convaincre pour chaque nouveau fournisseur. Pour moi, c'est un coût d'intégration réel. J'accepte si je peux être moi-même une des ancres, le motif « consommateur-ancre » : je note ceux que j'ai payés et qui ont livré.

**Q4.** Une preuve portée par le payé me convient pour x402 : le fournisseur l'envoie avec sa réponse de paiement. Mais pour mon monitoring et mes contrats sans flux x402, je veux une vue lisible sans preuve. Sur Monad, je paie la limite de gas (fait fourni) : la longueur de preuve doit être bornée et documentée.

**Q5.** Je ne veux pas choisir un schéma, je veux choisir un `setId` qui a un nom et un auteur lisibles. Le schéma de référence est le seul que j'utiliserai.

---

## Phase 2 — Relecture croisée à l'aveugle

Ordre anonyme de ce tour : **analyse 1 = C, 2 = E, 3 = A, 4 = D, 5 = B**.

### A relit
- **1 (C).** *Vu :* les trois niveaux nommés honnêtement. *Trop optimiste :* KERI suppose que la clé suivante est gardée hors ligne, et rien n'y oblige une ancre. *Oublié :* le sort des arêtes de l'ancienne clé après rotation.
- **2 (E).** *Vu :* la dépendance de vivacité. *Faux :* « le marginal perd, le fort reste » est faux avec une borne L1 globale : un élargissement touche tout le monde de la même quantité, pas proportionnellement.
- **4 (D).** *Vu :* le slashing inversé et le certificat bâclé. Ce sont les deux découvertes du tour. *Oublié :* la règle « au moins aussi précis » bloque une recertification légitime si le graphe réel s'est densifié et que son e est honnêtement plus grand.
- **5 (B).** *Vu :* la feuille jointe à k colonnes. *Oublié :* l'arbre de Merkle se calcule on-chain dans la passe de vérification, et ce coût de hachage n'est ni mesuré ni estimé.

### B relit
- **1 (C).** *Faux :* « garder les deux lectures » double la surface de test. Le cache optionnel sera l'implémentation que tout le monde copie, et la mauvaise.
- **2 (E).** *Vu :* la longueur de preuve à borner. *Oublié :* le consommateur-ancre doit payer du gas pour noter. Il faut dire combien, et qui le fait (automatiquement après livraison ?).
- **3 (A).** *Vu :* Δ calculé sur la ligne, pas le pire cas 2·t_u. *Trop optimiste :* calculer Δ exige de recalculer B⁺ et B⁻ de la nouvelle ligne on-chain. C'est une passe sur la ligne, ce qui ouvre du griefing sur les lignes longues. Il faut plafonner la longueur de ligne, ou passer au pire cas au-delà.
- **4 (D).** *Vu :* facturer une preuve une seule fois par ligne. *Oublié :* le stockage de l'état de ligne par preuve est un SSTORE, précisément ce qu'on essaie d'éviter. Acceptable parce que les preuves sont rares, à condition de le dire.

### C relit
- **2 (E).** *Vu :* le consommateur-ancre, meilleure réponse au goulot d'intégration. *Oublié :* le consommateur-ancre fait de chaque intégrateur une cible de corruption. Le fournisseur n'a plus qu'à convaincre son client, ce qui rouvre le problème de la ferme (le propriétaire finance ses noteurs).
- **3 (A).** *Vu :* la correction du tour 1, sèche et nécessaire. *Trop fort :* « ce n'est pas un défaut d'interopérabilité ». Si deux implémentations calculent deux graphes différents *avec le même schéma*, c'en est un. Il faut des vecteurs de test normatifs.
- **4 (D).** *Vu :* l'asymétrie vol / déni de service. *Oublié :* la méfiance à une ancre, elle, n'est pas leave-one-out. Une clé volée peut aussi dénigrer, pas seulement mettre un veto.
- **5 (B).** *Vu :* la normalisation en entiers. *Oublié :* le signe. `valueDecimals` sur un int128 négatif, arrondi vers zéro ou vers −∞ : il faut le normer.

### D relit
- **1 (C).** *Vu :* le MUST sur `minAnchors`. *Oublié :* le niveau « Registry-contested » n'a de valeur que si quelqu'un conteste. Qui surveille, et pourquoi ?
- **2 (E).** *Vu :* la pause sur transfert. *Trop optimiste :* elle ne sert à rien si le recertificateur réintègre la réputation telle quelle. Je paie une pause de maxAge pour acheter une réputation : c'est bon marché.
- **3 (A).** *Vu :* l'ancre en nœud-adresse. *Oublié :* le rejet « c = `agentWallet` de j » ne tient que si `agentWallet` est à jour au moment de la certification ; je change de wallet après.
- **5 (B).** *Vu :* la preuve portée me prive de toute attaque sur le stockage. *Oublié :* le rejeu. Une feuille valide d'un *ancien* certificat reste un chemin valide vers un ancien root. La lecture doit vérifier le root **courant**, pas n'importe quel root passé.

### E relit
- **1 (C).** *Vu :* `anchorId`, exactement ce que je voulais. *Oublié :* la découverte. Comment je trouve un `setId` fiable ? Un événement ne suffit pas.
- **3 (A).** *Vu :* m = 2 sans ancre spéciale, élégant. *Faux pour moi :* « α ne se tranche qu'avec une mesure », mais la mesure proposée utilise un graphe de démo que *nous* construisons. Elle validera ce qu'on y met.
- **4 (D).** *Vu :* « un attaquant avec mon setId obtient au mieux un déni de service ». *Oublié :* le déni de service est un coût pour moi, pas pour lui. Il faut une procédure de sortie : lever la pause, écarter une ancre.
- **5 (B).** *Vu :* une écriture par certificat. *Oublié :* le payé doit pouvoir *obtenir* sa preuve. Un service hors chaîne la fournit, et c'est un nouveau composant à livrer.

---

## Phase 3 — Synthèse tranchée

### Q1 — Liaison au registre : **certificat à borne croissante** (D6)

**Décision.**
- Pas de slashing, pas de fenêtre de contestation.
- Toute preuve d'écart valide entre le graphe engagé et le registre **ajoute au résidu** (1−α)·t_u^(a)·Δ_u pour chaque colonne a, où Δ_u est la distance L1 entre la ligne engagée et la ligne réelle.
- Chaque ligne est facturée au plus une fois par état.
- Certification sans permission ; remplacement par précision effective.

**Argument décisif.** C'est la seule construction dont la garantie reste vraie sans dater les avis (AM-2.1). Elle supprime l'attaque par slashing inversé et n'a besoin d'aucune économie de caution.

**Ce qu'on perd.**
- La borne est globale en L1 : un seul élargissement touche tous les agents (relecture de A sur E).
- Une omission non contestée reste invisible. La garantie ne vaut que s'il existe un surveillant (relecture de D sur C).

**Confiance.** 0,7.

**Qui surveille ?** Le consommateur à qui profite la contestation : il protège son propre paiement. Coût : une transaction par ligne contestée. Aucune récompense en v1.

### Q2 — Identité (D9, D10)

**Décision.**
- **Nœuds.**
  - Agent : `agentId`.
  - Émetteur : `agentId` unique dont `agentWallet` = c, sinon nœud-adresse c.
  - Ancre : nœud-ancre `anchorId`, **toujours distinct** d'un nœud-agent.
- **Rejet d'arête** si c ∈ {ownerOf(j), agentWallet(j)} dans l'état engagé.
- **`anchorId`** = keccak(clé₀, hash(clé₁)), avec pré-rotation. Après rotation, **seuls les avis de la clé courante comptent**, et l'ancre republie ce qu'elle veut maintenir (AM-2.6).
- **Transfert d'agent** : la feuille engage l'owner ; si ownerOf ≠ owner engagé, alors `TRANSFERRED` et non fiable, jusqu'à recertification. La norme n'impose pas de remise à zéro, puisqu'elle n'est pas vérifiable (AM-2.7). Les ancres réévaluent (veto disponible).

**Argument décisif.** L'`anchorId` à pré-rotation concilie immuabilité du `setId` et rotation des clés sans mettre les ancres en vente.

**Ce qu'on perd.** Le rachat de réputation ne coûte qu'une pause (relecture de D sur E). Il y a un contrat de plus à déployer.

**Confiance.** 0,6 sur la rotation ; 0,5 sur le transfert.

### Q3 — Robustesse aux ancres (D7, D8)

**Décision.**
- **Budgets séparés** : C_uj = w⁺/B⁺_u, D_uj = w⁻/B⁻_u.
- **Veto q = 1**.
- **Confiance leave-one-out, `minAnchors` m = 2** : on retire les m−1 plus grosses contributions par ancre avant de comparer au seuil.
- La méfiance n'est pas leave-one-out, puisqu'elle va dans le sens de l'échec fermé.

**Argument décisif.** Avec ces règles, une clé volée ne produit qu'un déni de service, jamais un paiement vers un Sybil (AM-2.5). Et la critique honnête ne coûte plus rien au critique (AM-2.4).

**Ce qu'on perd.**
- Chaque fournisseur a besoin de deux ancres ; la démo doit en avoir au moins deux (AM-2.11).
- Une clé volée peut dénigrer et mettre des vetos jusqu'à sa rotation.

**Confiance.** 0,65.

### Q4 — α et coût (D2 confirmée, D11)

**Décision.**
- α = 1/3 est maintenu, unique par déploiement. La norme autorise α par certificat. Pas de choix par le lecteur en v1.
- **Lecture à preuve portée** : un `vectorRoot` par certificat, une feuille (agentId, owner, t^(1..k), d^(1..k)) fournie par le payé, vérifiée contre le root **courant** (anti-rejeu, relecture de D sur B).
- Le cache stocké est une extension optionnelle, pas dans l'implémentation de référence.

**Argument décisif.** On passe d'une écriture par agent à une écriture par certificat. Le seul poste de coût inconnu disparaît de l'architecture au lieu d'être mesuré.

**Ce qu'on perd.**
- Le « tout contrat lit `trustOf(agentId)` sans rien fournir ».
- Un service de preuves à livrer (relecture de E sur B).
- Le coût de hachage on-chain de l'arbre, non mesuré.

**Confiance.** 0,65 sur la preuve portée ; 0,55 sur α.

**Mesure à faire.** Taille du support et taux de passage leave-one-out pour α ∈ {1/4, 1/3, 1/2}. Réserve de E : sur notre propre graphe, cette mesure valide ce qu'on y met. Elle doit donc aussi tourner sur le snapshot du 21/09.

### Q5 — Schéma de tags et graphe réel (D12, D13)

**Décision.**
- Le schéma est engagé **par ensemble**. La norme fixe son format et impose des **vecteurs de test normatifs** (relecture de C sur A). ANCRE publie un schéma de référence.
- **Arrondi normé** : la conversion `value/10^dec` → WAD se fait par troncature vers zéro, et les bornes sont comparées en valeur exacte avant arrondi (relecture de C sur B).
- **Aucune ancre par défaut dans la norme.**
- Pour la démo : des ensembles étiquetés « demo ».
- Pour le produit : le motif consommateur-ancre, **combiné à m = 2**. Le consommateur ne suffit jamais seul, ce qui répond à l'objection de C sur la corruption du client.

**Argument décisif.** Un schéma par ensemble est la personnalisation elle-même, pas une autorité.

**Ce qu'on perd.** Il faut produire des vecteurs de test et un schéma de référence crédible.

**Confiance.** 0,75.

**Pitch.** Annoncer d'emblée que sur le mainnet ANCRE **supprime** la ferme (moyenne naïve d'Eve-8004 à 1,5 × 10^36, mesuré ; masse ANCRE à 0 pour tout ensemble qui n'approuve pas la ferme, supposé) et répond « inconnu » pour presque tous les autres agents. La démo positive se fait sur notre propre trafic, et on le dit.

---

## Spécification — Q1 : certificat à borne croissante

```
ÉTAT par setId
  cert = { vectorRoot, graphRoot, αN, αD, k,
           r[a], e[a]  (a = 1..k, WAD),
           certBlock,
           rowState: mapping(node → bytes32) }   // hash de ligne courant après preuves
  eEff(set) = Σ_a λ_a · ⌈r[a]·αD/αN⌉

SOUMISSION (sans permission)
  1. passe de vérification du tour 1 (budgets séparés, arrondis majorés, troncature T),
     jointe sur les k colonnes, calcul on-chain de :
       graphRoot  = Merkle(lignes triées ; ligne = (u, [(c, j, feedbackIndex, w)...], B⁺_u, B⁻_u))
       vectorRoot = Merkle(feuilles triées ; feuille = (node, owner, t[1..k], d[1..k]))
     longueur de ligne ≤ ROW_MAX (choix : 256) ; au-delà : ligne obligatoirement tronquée
  2. remplacement ssi
       cert courant absent
     ∨ block.number − cert.certBlock > maxAge
     ∨ eEff(new) ≤ eEff(courant)
     ∨ block.number − cert.certBlock > minRefresh ∧ eEff(new) ≤ eEff(courant) + slackRefresh
       // dernière clause : laisse passer un graphe densifié honnêtement (relecture A sur D)
       // minRefresh, slackRefresh : choix engagés dans la politique

PREUVE D'ÉCART (sans permission)
  entrée : ligne engagée L_u (+ chemin vers graphRoot, ou vers rowState[u] si déjà modifiée),
           feuille de u (+ chemin vers vectorRoot) pour lire t_u[1..k],
           un fait du registre parmi :
    (i)   OMISSION : feedback (c, j, idx) avec node(c) = u, non révoqué, tag1 ∈ filtre,
                     valeur dans les bornes, (c, j) absent de L_u
    (ii)  PÉRIMÉ   : (c, j, idx) ∈ L_u et un feedback (c, j, idx2 > idx) valide, tag1 ∈ filtre
    (iii) RÉVOQUÉ  : (c, j, idx) ∈ L_u et readFeedback(j, c, idx).isRevoked
    (iv)  WALLET   : agentWallet(u) ≠ wallet engagé  →  L'_u = ligne vide (pire cas)
  calcul :
    L'_u  = L_u modifiée par le fait ; recalcul de B⁺, B⁻ sur L'_u (≤ ROW_MAX)
    Δ⁺    = ‖C_u − C'_u‖₁ ,  Δ⁻ = ‖D_u − D'_u‖₁
    pour a = 1..k :
      r[a] += ⌈t_u[a]·(αD − αN)·(Δ⁺ + Δ⁻) / αD⌉
    rowState[u] = hash(L'_u)
  u ∈ T (déjà tronquée) : preuve rejetée (déjà payée par la marge)
  // soundness : inégalité triangulaire sur les états successifs de la ligne ;
  // chaque état n'est facturé qu'une fois

LECTURE (ne revert jamais)
  assess(agentId, setId, leaf, proof) → {status, trustRobust, distrust, e, certBlock, vetoCount}
    status ∈ {OK, NO_CERT, STALE, BAD_PROOF, TRANSFERRED, VETOED}
    BAD_PROOF   si proof ne mène pas au vectorRoot COURANT
    TRANSFERRED si ownerOf(agentId) ≠ leaf.owner
    contributions  c_a = λ_a · leaf.t[a]
    trustRobust = Σ_a c_a − (somme des (m − 1) plus grands c_a)
    distrust    = Σ_a λ_a · leaf.d[a]
    e           = eEff(set)
    veto        : tour 1 §6, avec clé courante de chaque anchorId
  isTrusted ⇔ status = OK
            ∧ trustRobust ≥ θ + e
            ∧ ρD·(distrust + e) ≤ ρN·(trustRobust − e)
```

Paramètres **choix**, à calibrer : ROW_MAX = 256, m = 2, q = 1, ρ = 1/2, K_MAX = 16, maxAge, minRefresh, slackRefresh.

**Hypothèses non vérifiées** (AM-2.14) : `readFeedback(agentId, client, index)` renvoie tags et `isRevoked` ; `getLastIndex(agentId, client)` existe en v2.0.0 ; effet d'un transfert sur `agentWallet`.

---

## Changements dans le texte de la norme (tour 2)

**Certificat**
- Remplacer la contestation avec slashing par des preuves d'écart qui élargissent la borne. Définir les types (i) à (iv), le calcul de Δ et la facturation une fois par état de ligne.
- Définir `graphRoot` (Merkle des lignes) et `vectorRoot` (feuilles avec owner et k colonnes). Normer ROW_MAX et la troncature obligatoire au-delà.
- Règle de remplacement des certificats et `eEff`.
- Niveaux : **Residual-verified**, **Registry-contested**, **Optimistic**.

**Graphe**
- Budgets séparés B⁺ et B⁻ (remplace le budget partagé).
- Nœud-ancre distinct du nœud-agent.
- Rejet de c ∈ {owner, agentWallet} de j.
- Émetteur multi-agents → nœud-adresse.
- Arrondi de conversion vers zéro, comparaison aux bornes avant arrondi.

**Ancres**
- Format `anchorId` avec pré-rotation. Seuls les avis de la clé courante comptent.
- `setId` engage des `anchorId`, pas des adresses.

**Politique**
- `minAnchors` (défaut 2, MUST en considérations de sécurité), `q`, `ρ`, `maxAge`, `minRefresh`, `slackRefresh`.

**Interface**
- `assess` / `isTrusted` à preuve portée (REQUIRED), vérifiée contre le root courant. Statuts énumérés.
- Cache stocké en extension optionnelle, soumis aux mêmes règles.

**Schéma de tags**
- Format du schéma engagé par ensemble, vecteurs de test normatifs, schéma de référence non normatif.

**Considérations de sécurité**
- Rachat d'agent (pause seulement), clé d'ancre volée (déni de service borné, pas de vol si m ≥ 2).
- Dépendance de vivacité (AM-2.12), rejeu de feuille.
- Absence de bloc dans le registre et ses conséquences.

**Suggestion à ERC-8004** (post #309 ou nouveau fil) : stocker `block.number` dans chaque avis. Ça rendrait datables les preuves d'omission, la rotation et le transfert.

---

## Découpage hackathon (16 jours) / norme — AM-2.13

| Élément | Démo 13/10 | Norme |
|---|---|---|
| Vérification en une passe, k colonnes jointes, `vectorRoot` | **oui** | oui |
| `assess` à preuve portée + leave-one-out + veto direct | **oui** | oui |
| Pause sur transfert | **oui** (une lecture) | oui |
| Preuves d'écart | **type (i) OMISSION seulement**, c'est celui qui sert la démo (négatif omis) | (i) à (iv) |
| Pré-rotation d'`anchorId` | non (adresses fixes, étiquetées « demo ») | oui |
| Cache stocké | non | extension |
| Mesure α ∈ {1/4, 1/3, 1/2} | oui, sur le snapshot et sur le graphe de démo | — |

---

## Désaccords non résolus (tour 2)

1. **Dépendance de vivacité (AM-2.12).** E exige un mode dégradé. A et D refusent tout mode qui paie sans certificat frais. La certification sans permission n'est une réponse que si l'intégrateur sait recertifier, ce qui suppose l'indexeur et le solveur publiés.
2. **Rachat de réputation.** D juge la pause inutile (elle ne coûte qu'un délai). C et B affirment qu'on ne peut rien faire de mieux sans le bloc dans le registre. La seule vraie solution est hors de notre portée (changer ERC-8004).
3. **Leave-one-out m = 2 contre goulot d'intégration.** E l'accepte seulement avec le motif consommateur-ancre. C affirme que ce motif fait du client la nouvelle cible de corruption. Avec m = 2, le client seul ne suffit pas, mais un client plus une ancre complaisante, si.
4. **Deux lectures ou une.** C veut garder un cache lisible sans preuve pour le pitch. B affirme que le cache optionnel deviendra l'implémentation copiée, et la mauvaise.
5. **Borne globale.** A et E constatent qu'un élargissement touche tout le monde. Une borne par coordonnée plus fine exigerait une information sur la propagation que personne n'a su certifier en une passe.
6. **α.** Toujours aucune donnée. La mesure proposée est partiellement circulaire (relecture de E sur A).

---

## Ce que vous auriez dû me demander (tour 2)

1. **Les signatures du registre déployé sont-elles celles que la spec suppose ?** `readFeedback`, `getLastIndex`, `isRevoked`, `agentWallet` après transfert, et le garde-fou `isAuthorizedOrOwner` face à l'`agentWallet`. Dix minutes de `cast` sur l'implémentation derrière le proxy. Toute la Q1 en dépend (AM-2.14).
2. **Qui fournit sa preuve au payé ?** Un service de preuves est un composant de plus, avec sa propre disponibilité, et il n'est pas dans votre liste d'actions.
3. **Quel est le coût de hachage de deux arbres de Merkle dans la passe de vérification ?** Il remplace le poste « écritures » comme inconnue principale.
4. **Qui a intérêt à contester ?** Sans récompense, seul le consommateur lésé conteste. Il faut vérifier que c'est suffisant pour le scénario de démo : le négatif omis doit être contesté par le contrat de démo lui-même.
5. **Le consommateur-ancre note-t-il automatiquement après livraison ?** Si oui, c'est un flux on-chain de plus (gas, réserve de 10 MON par compte d'après CLAUDE.md). Si non, personne ne notera.
6. **Combien d'ancres, et lesquelles, dans la démo ?** m = 2 impose au moins deux ancres honnêtes, plus une qui dépose le négatif. Le script de ferme Sybil doit aussi montrer qu'**une** ancre compromise ne suffit pas à faire payer la ferme : c'est une scène de démo que le tour 1 n'avait pas.
7. **La mesure de α sur le snapshot a-t-elle un sens si les 36 arêtes utiles sont hors schéma ?** À mesurer avant de mesurer α.

---

# Tour 3 — 2026-09-27 — sur faits vérifiés

## Faits vérifiés entre les tours 2 et 3

Quatre agents, le 2026-09-27, au bloc ≈ 108,43 M. Les scripts et les sorties sont dans le scratchpad de la session.

**ReputationRegistry** (proxy `0x8004BAa1…9b63`, implémentation `0x16e0fa7f…da34`, `getVersion()` = "2.0.0", source : `erc-8004/erc-8004-contracts` master, commit `b9e466c`)
- `readFeedback(uint256 agentId, address client, uint64 idx) → (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)`. **L'index commence à 1.** `endpoint`, `feedbackURI` et `feedbackHash` ne sont pas stockés (seulement dans l'event). VÉRIFIÉ on-chain + source.
- `getLastIndex(agentId, client)` = nombre d'avis de ce client sur cet agent, révoqués inclus. **Les index sont ordonnés par couple, tous tags confondus.** VÉRIFIÉ.
- `getClients(agentId)` **existe** (7 665 pour #182). `readAllFeedback(agentId, clients[], tag1, tag2, includeRevoked)` existe. **Pas d'index par client.** VÉRIFIÉ.
- Garde-fou `giveFeedback` : `!isAuthorizedOrOwner(msg.sender, agentId)`, c'est-à-dire owner, opérateurs et token approuvé, **mais pas `agentWallet`**. VÉRIFIÉ source + simulation.
- Aucun bloc ni timestamp stocké. Seul l'auteur d'un avis peut le révoquer. `appendResponse` est ouvert à tous. VÉRIFIÉ.
- Bornes : `valueDecimals ≤ 18`, `|value| ≤ 1e38` (borne incluse). VÉRIFIÉ.
- Events : `NewFeedback` (agentId, client et keccak(tag1) indexés ; `feedbackIndex` non indexé), `FeedbackRevoked`, `ResponseAppended`. VÉRIFIÉ.
- **Proxy UUPS, `onlyOwner` = EOA `0x5472…2603`**, sans multisig ni timelock. VÉRIFIÉ.

**IdentityRegistry** (proxy `0x8004A169…a432`, implémentation `0x7274e874…9c02`. Bytecode recompilé : 14 474 octets, identique au master hors immutables et métadonnées)
- `getAgentWallet` vaut owner au mint et **`0x0` après un transfert**. L'effacement se produit à chaque transfert (l.188-199). Il a eu lieu sur les 72 transferts de l'historique ; 70 agents sur 71 ne sont jamais re-vérifiés. VÉRIFIÉ source + simulation + historique.
- `setAgentWallet` exige une signature EIP-712 ou ERC-1271 **du nouveau wallet**, avec un délai de 5 minutes au plus sur `block.timestamp`. VÉRIFIÉ.
- **Pas d'unicité, pas d'index inverse** : 8 596 wallets distincts, dont **178 partagés par 1 773 agents** (jusqu'à 762 agents par wallet). MESURÉ.
- `register` ne coûte que du gas, sans limite (≈ 146 k gas estimés). VÉRIFIÉ.
- **Cas réel de contournement** : #8317 a reçu **78 avis de son propre agentWallet**. Après un transfert, l'ancien owner et les anciens opérateurs peuvent de nouveau noter l'agent. VÉRIFIÉ.
- Même EOA owner et même mécanisme d'upgrade. **Une v2.1.0** (unicité du wallet, index inverse) est prête en amont, dans la branche `feat/unique-reverse-lookup`, et n'est pas déployée. VÉRIFIÉ source.
- agentWallet == owner pour 10 189 agents sur 10 261 ; 70 sont à zéro ; 2 sont différents (#8316 et #8317). MESURÉ.

**Gas Monad** (doc officielle + mesures par opcode `GAS` dans `eth_call`, client Monad/0.16.2)
- **MIP-8 est actif depuis le 2026-09-02.**
  - SLOAD : 8 100 à la première lecture d'une page, 100 ensuite.
  - SSTORE 0→x : 27 900 sur une page froide, 17 100 sur une page déjà écrite.
  - SSTORE x→y : 10 900 sur une page froide, **100** sur une page déjà écrite.
  - Chaque clé de `mapping` tombe dans sa propre page.
  - MESURÉ.
- **Plancher EIP-7623 actif** : gas ≥ 21 000 + 10 × (octets nuls + 4 × octets non nuls), soit **40 gas par octet non nul**. MESURÉ.
- KECCAK : 30 + 6 par mot. ecrecover : 6 000. P256 (0x0100) : 6 900. Accès à un compte froid : 10 100. DOC + MESURÉ.
- On paie la gas limit : `receipt.gasUsed == tx.gas`. MESURÉ.
- BLOCKHASH couvre 256 blocs ; EIP-2935 couvre **8 191 blocs**. **`eth_getProof` n'existe pas.** La racine d'état n'est plus vérifiable à la manière d'Ethereum (BLAKE3 par page, racine retardée de 3 blocs). MESURÉ + DOC.
- Temps de bloc : 0,3 s ou 0,4 s selon la page de doc. NON TRANCHÉ.
- `rpc1.monad.xyz` accepte des `eth_getLogs` sur tout l'historique. MESURÉ.

**Données** (snapshot du 21/09 dans le vault, identique avis par avis au snapshot frais du 27/09)
- 9 188 avis, égal à Σ `getLastIndex` on-chain. **Aucun nouvel avis depuis le 2026-09-10.** 0 révoqué. ~~100 % des avis ont `valueDecimals = 0`~~ **faux : 24 avis ont 2 décimales on-chain**, 8004scan les affiche à 0 (corrigé par R4, relecture on-chain des 9 188 avis au bloc 108 434 518). MESURÉ.
- 7 771 couples, dont 55 ont plus d'un avis. #9 et #87 sont notés par le **même** wallet `0xd8a0…e38c`. MESURÉ.
- **84 agents notés**, dont 10 absents de l'index 8004scan (lequel en compte 74). MESURÉ.
- **36 arêtes** = 36 couples (37 avis) où le noteur est owner d'un agent noté.
  - **33 vont vers Eve** : ce sont des agents Spawn notés par des scanners.
  - **3 partent de `0xea0b…`**, owner de #18, #22 et #23, vers #2, #3 et #4.
  - MESURÉ.
- 109 valeurs négatives, venant de 7 noteurs, presque toutes issues de jeux. **Une seule tombe sur une arête utile** : `slash −100` sur #4, **effacé par la règle « dernier avis par couple »**, puisqu'un `review +1` a suivi sous un autre tag. MESURÉ.
- Avec un schéma minimal (`vouch`, `review`, `slash`), il reste **3 arêtes utiles**. **Une seule chaîne honnête existe**, sur 2 sauts : `0x0730…` ou `0xf7d5…` → #18 → {#2, #3, #4}. MESURÉ ; le schéma est notre choix.
- **Arête d'attaque réelle** : le scanner `0xa06f907f` note des agents Spawn (tags trust / oracle-screening), et ces agents notent Eve. Prendre ce scanner comme ancre fait fuir la confiance vers la ferme. MESURÉ.

## Reformulation

Le tour 3 ne rouvre que ce que les faits contredisent. Quatre questions :
- Q1 — **Unité d'arête et rôle des tags**, question la plus importante. Le seul négatif utile du registre est effacé par notre propre règle, et la seule arête d'attaque réelle passe par un tag de mesure.
- Q2 — **Stockage ou preuve portée, et encodage**. Deux mesures (MIP-8 et EIP-7623) contredisent D11 et l'estimation de gas.
- Q3 — **Identité des noteurs et confiance dans le registre**. Wallet non unique, contournement réel du garde-fou, clé d'upgrade unique.
- Q4 — **Ce que la démo et le pitch peuvent affirmer**, et comment fixer α, puisque le mainnet n'offre ni trafic ni graphe.

## Phase 1 — Analyses indépendantes

### A. Théoricien
- **Q1.** Un tag est un **type de relation**, pas une étiquette : un ping de disponibilité ne délègue aucune confiance. Faire propager une mesure revient à fabriquer des arêtes d'attaque, et la borne Sybil ne vaut plus rien si les arêtes d'attaque sont gratuites. Le cas `0xa06f907f` en est la démonstration réelle. Il faut une **dichotomie normative** : endorsement (propage) ou measurement (ne propage jamais). Côté négatif, la règle « dernier par couple » confond deux énoncés distincts. Garder un dernier avis par (couple, tag), puis combiner en conservant le pire tant qu'il n'est pas révoqué : c'est la seule combinaison monotone du côté du refus.
- **Q2.** La quantification du poids modifie C, donc t*. Elle doit être normative, sinon deux certificateurs honnêtes produisent deux points fixes différents. L'erreur de quantification n'entre pas dans la borne : elle *définit* le graphe.
- **Q3.** Un wallet partagé par 762 agents, c'est un nœud qui agrège la masse de 762 agents s'il est fusionné. Il ne faut pas fusionner : si le wallet est ambigu, on crée un nœud-adresse sans masse propre, ce qui est la règle du tour 2, et les faits la valident.
- **Q4.** Sur le mainnet, il n'y a rien à calibrer. La bonne mesure de α se fait sur des graphes synthétiques **à vérité connue** : une communauté honnête, une région Sybil, g arêtes d'attaque contrôlées. On y mesure la masse qui fuit et la couverture honnête en fonction de α. Ce n'est pas circulaire : la vérité est fixée par construction, et le résultat dépend du modèle, ce qu'on doit dire.

### B. Ingénieur EVM
- **Q1.** « Dernier par (couple, tag) » ne se lit pas directement : `getLastIndex` est tous tags confondus. Hors chaîne, l'indexeur a tous les avis, donc aucun problème. On-chain, dans le veto, il faut `readAllFeedback(j, [ancre], tag, "", false)` pour chaque tag du filtre, à un coût proportionnel au nombre d'avis de l'ancre sur j (petit en pratique, supposé). Il faut plafonner le nombre de tags du filtre par ensemble.
- **Q2.** Les mesures inversent D11.
  - Un vecteur tassé de 4 × uint64 par slot, mis à jour sur place, coûte **~100 gas/slot** (MESURÉ).
  - Une lecture coûte un mapping agentId → index, puis un slot du vecteur, soit environ 16 k gas (ESTIMÉ à partir des 8 100 par page).
  - Une preuve portée coûte ≈ 320 octets de calldata, soit 12,8 k gas au plancher, plus les hachages. Elle n'est pas moins chère, et elle est plus compliquée.
  - **Conclusion : une table de nœuds append-only**, où l'index d'un nœud reste stable d'un certificat à l'autre. Le mapping n'est écrit qu'une fois par nouveau nœud (27 900).
  - Encodage : arêtes groupées par ligne, dst en u16/u32, poids en int16 sur une grille de 1e-4, feedbackIndex en u32, soit **~8 octets/arête**. Au plancher, ~320 gas/arête (ESTIMÉ).
- **Q3.** `getVersion()` coûte un appel froid (10 100) + un delegatecall, par lecture. C'est trop cher à chaque `trustOf` d'un router très sollicité. Mieux vaut le vérifier à la certification et dans une fonction `checkRegistry()` que n'importe qui peut appeler pour basculer l'état en `REGISTRY_CHANGED`.
- **Q4.** Pour une démo sur le mainnet, notre ferme et nos fournisseurs paient la gas limit. La réserve de 10 MON impose au plus ~3 transactions pleines par compte toutes les 3 blocs (DOC). Il faut plusieurs comptes financés.

### C. Concepteur de normes
- **Q1.** Le `kind` doit être dans le **format** du schéma, pas laissé à l'appréciation : un implémenteur qui fait propager `liveness` refabriquera la fuite. MUST : un tag `measurement` ne crée jamais d'arête. MAY : un tag `measurement` peut servir de filtre de politique (par exemple, refuser un agent dont l'uptime est sous un seuil).
- **Q2.** Si la quantification et l'encodage des feuilles de `graphRoot` ne sont pas normés, il n'y a pas d'interopérabilité des certificats. L'encodage du calldata, lui, est un détail d'implémentation.
- **Q3.** La norme ne peut pas corriger la gouvernance d'ERC-8004. Elle doit l'**exposer** : le certificat engage le registre et sa version, et les considérations de sécurité citent l'upgradabilité. La demande à ERC-8004 existe déjà dans le draft (`block.number` par avis). Il faut y ajouter trois demandes : unicité de `agentWallet`, garde-fou étendu à `agentWallet`, et timelock sur l'upgrade.
- **Q4.** Le pitch doit s'appuyer sur ce qui est mesurable par le jury. Trois faits on-chain sont reproductibles : la ferme (moyenne à 1,5e36), la fuite par le scanner, et le contournement #8317. C'est plus fort qu'une démo synthétique.

### D. Attaquant
- **Q1.** Aujourd'hui, je fais noter mes Sybil par un scanner public (ils sont en ligne, donc « trust 85 »), et ce scanner est une ancre plausible. Avec D15, cette voie est fermée. Avec « dernier par couple », je peux aussi **effacer le slash d'une ancre** si je la convaincs de poster n'importe quel avis positif sous un autre tag. Dominance du négatif : fermé. Reste le coût pour l'honnête : un slash erroné colle tant qu'il n'est pas révoqué. C'est acceptable, puisque la révocation existe et que seul son auteur peut révoquer.
- **Q2.** Table append-only : je peux la gonfler en enregistrant des agents gratuitement. Mais seuls les nœuds du support y entrent, et le support exige de la masse. Pas d'attaque.
- **Q3.** Je rachète un agent réputé : le wallet est effacé, donc l'agent n'a plus de nœud émetteur tant que je n'ai pas re-signé. Ses arêtes **sortantes** disparaissent, ses arêtes entrantes restent. La pause D10 tient. Autre voie : l'owner des registres peut tout changer. Je ne l'attaque pas, je **l'attends**. La v2.1.0 prévue changera le mapping des wallets, et un certificateur qui ne le voit pas certifiera un graphe faux.
- **Q4.** Si la démo dit « live », le jury verra un registre dormant depuis le 10/09. Mieux vaut le dire avant qu'il ne le voie.

### E. Intégrateur
- **Q1.** La dominance du négatif me va : je préfère un faux refus à un faux paiement. Je veux savoir **quel** tag a déclenché le refus, dans le retour de `assess`.
- **Q2.** Enfin un `trustOf(agentId, setId)` en vue simple. C'est ce que j'intègre. La preuve portée m'obligeait à changer le protocole x402 côté fournisseur.
- **Q3.** `REGISTRY_CHANGED` doit être un état explicite, pas un revert. Et je veux un event, pour que mon monitoring le voie.
- **Q4.** Une démo où l'acte 1 est le mainnet réel et l'acte 2 notre trafic me paraît honnête. Il faut que l'acte 2 tourne sur le mainnet, pas sur le testnet (où les registres sont absents), sinon ce n'est pas le même registre.

## Phase 2 — Relecture croisée à l'aveugle

Ordre anonyme : **1 = B, 2 = D, 3 = E, 4 = A, 5 = C**.

- **A relit B (1)** : juste sur l'inversion de D11. *Oubli* : une table append-only ne rétrécit jamais, donc un nœud qui sort du support garde sa ligne. Il faut une valeur « hors support » explicite (0) et pas de nettoyage.
- **A relit D (2)** : *vu* l'attente de la v2.1.0, qui est un vrai risque. *Trop optimiste* sur « seul l'auteur révoque » : si la clé de l'auteur est perdue, le slash est éternel. Il faut une échéance ou un mécanisme de levée.
- **B relit A (4)** : la dichotomie endorsement / measurement est juste. *Faux* : « l'erreur de quantification n'entre pas dans la borne » ne vaut que si le contrat recalcule la quantification lui-même. Il la reçoit en calldata, donc il faut vérifier que chaque poids est sur la grille (w mod 1e14 == 0 en WAD).
- **B relit C (5)** : *oubli* : un `kind` par tag, c'est un octet de plus par tag dans le schéma, sans aucun coût on-chain. Rien à objecter.
- **C relit E (3)** : « acte 2 sur le mainnet » a un coût réel (MON, réserve de 10 MON par compte) que E ne chiffre pas.
- **C relit B (1)** : `checkRegistry()` que n'importe qui appelle, c'est de la vivacité par bonne volonté. Il faut que le certificateur l'appelle à chaque certification (MUST).
- **D relit A (4)** : *vu* le refus de fusionner les wallets. *Oubli* : sans fusion, un noteur ambigu a un nœud-adresse **sans masse**, sauf s'il est une ancre. Si j'enregistre un second agent sur le wallet d'une ancre-agent, je rends ses avis ambigus… mais l'ancre est un nœud-ancre séparé (D9). Pas d'attaque, à écrire explicitement.
- **D relit E (3)** : « quel tag a déclenché le refus » donne à un attaquant un oracle gratuit pour tester ses avis. C'est mineur, puisque l'état est public de toute façon.
- **E relit D (2)** : *vu* le registre dormant, à dire en premier. *Oubli* : le slash « éternel » est un risque juridique pour un fournisseur honnête. Il faut un chemin de contestation hors protocole, via `appendResponse`, qui existe (VÉRIFIÉ).
- **E relit C (5)** : les trois demandes à ERC-8004 sont bonnes. *Trop optimiste* : aucune ne sera en place le 13/10, donc le produit doit fonctionner sans elles.

## Phase 3 — Synthèse tranchée

### Q1 — Unité d'arête et rôle des tags (D14, D15)

**Décision.**
- L'arête de base est le **dernier avis non révoqué par (client, agent, tag1)**.
- Entre les tags du filtre d'un ensemble : **si un poids est négatif, w = le plus négatif ; sinon w = le plus grand**.
- Le schéma déclare `kind` : **seuls les tags `endorsement` créent des arêtes**. Un tag `measurement` MAY servir de filtre de politique et MUST NOT se propager.
- Le filtre d'un ensemble compte au plus TAGS_MAX tags (choix : 8).

**Argument décisif.** Ce sont deux défauts réels, mesurés sur le mainnet : la règle du tour 2 effaçait le seul négatif utile du registre, et la seule fuite réelle vers la ferme passait par un tag de mesure.

**Ce qu'on perd.**
- Un négatif colle jusqu'à sa révocation, et une clé perdue le rend permanent. Le chemin de recours du fournisseur est `appendResponse`, hors score.
- Les tags de réputation « trust » posés par des scanners automatiques ne comptent plus.

**Confiance.** 0,7 (D14) ; 0,75 (D15).

### Q2 — Stockage et encodage (D11 renversée, D18)

**Décision.**
- **Stockage.** Table de nœuds **append-only** : un mapping `nodeKey → index` écrit une seule fois. Vecteurs par colonne d'ancre, tassés 4 × uint64 par slot, **réécrits sur place**. Un nœud hors support vaut 0.
- **Lecture.** Retour de `trustOf(agentId, setId)` en vue simple. La racine `vectorRoot` est conservée, car elle sert à l'export et aux preuves d'écart.
- **Encodage du calldata.** Arêtes groupées par ligne, destinations en indices stables, **poids int16 sur une grille de 1e-4, normatif**. Le contrat vérifie que chaque poids est sur la grille. `feedbackIndex` en u32.
- **Coût.** Cible estimée ≈ 320 gas/arête au plancher. À mesurer au `forge test --gas-report` (R5).

**Argument décisif.** Sur Monad, l'écriture contiguë sur place coûte ~100 gas/slot (MESURÉ). La preuve portée coûtait plus cher et obligeait à modifier x402 côté fournisseur.

**Ce qu'on perd.**
- Le premier certificat est cher : 17 100 à 27 900 gas par slot neuf, MESURÉ.
- La table ne rétrécit jamais.

**Confiance.** 0,7.

### Q3 — Identité et registre (D16, D17)

**Décision.**
- **Nœud émetteur.**
  - Wallet c → l'unique agentId dont `agentWallet == c`.
  - Sinon (0 ou plusieurs agents) → nœud-adresse c, sans masse sauf s'il est une ancre.
  - Un nœud-ancre reste distinct de tout nœud-agent (D9).
  - L'index wallet → agent est reconstruit par l'indexeur à partir de `MetadataSet(agentWallet)`, `Transfer` et `Registered`.
- **Rejet d'arête** si c appartient à l'ensemble {owner, agentWallet, token approuvé, opérateurs de l'owner} de j au moment du certificat, **ou si c a été owner de j** (d'après les events `Transfer`). Ce rejet est contestable par une preuve d'écart de type (iv).
- **Transfert.** Le wallet effacé supprime les arêtes sortantes de l'agent, et la pause D10 s'applique à ses arêtes entrantes. C'est cohérent avec le comportement mesuré.
- **Registre upgradable.**
  - Le certificat engage `(identityRegistry, reputationRegistry, keccak(getVersion()) de chacun)`.
  - Le certificateur MUST vérifier la version à chaque certification.
  - `checkRegistry()`, appelable par tous, bascule l'état en `REGISTRY_CHANGED` et émet un event.
  - Un moniteur hors chaîne suit `Upgraded`.
- **Demandes à ERC-8004**, à ajouter au draft : `block.number` par avis (déjà présent), garde-fou étendu à `agentWallet`, unicité du wallet (v2.1.0 en préparation), timelock sur l'upgrade.

**Argument décisif.** Chaque règle répond à un fait mesuré : 178 wallets partagés, 78 auto-notations, 72 transferts sur 72 avec effacement, une EOA unique.

**Ce qu'on perd.**
- Une upgrade qui garde la même chaîne de version passe inaperçue on-chain. Seule la surveillance hors chaîne la voit.
- Les agents transférés restent muets tant qu'ils ne re-signent pas.

**Confiance.** 0,7 (D16) ; 0,6 (D17).

### Q4 — Démo, pitch et α (D19)

**Décision.**
- **Acte 1, mainnet réel, reproductible par le jury.**
  - Eve-8004 : moyenne naïve 1,5e36 → masse ANCRE 0.
  - Le scanner `0xa06f907f` comme ancre : fuite visible vers la ferme, bornée et supprimée par D15.
  - Le contournement du garde-fou sur #8317 (78 avis), détecté.
  - La seule chaîne honnête (#18 → #2, #3, #4), présentée comme telle.
- **Acte 2, notre trafic, sur le mainnet** et non sur le testnet, puisque les registres n'existent que sur le mainnet.
  - Trois ancres, des fournisseurs, une ferme scriptée.
  - Scène « une ancre compromise ne fait pas payer la ferme ».
  - Scène « une ancre dépose un slash → refus au bloc suivant ».
  - Scène « un review +1 sous un autre tag n'efface pas le slash ».
- **Pitch.** Dire d'emblée que **le registre est dormant depuis le 10/09** et que le graphe honnête compte 3 arêtes utiles.
- **α = 1/3 maintenu.** R4 le mesure sur des graphes synthétiques à vérité connue (fuite et couverture en fonction de α et du nombre d'arêtes d'attaque) et **ne cherche pas à le calibrer sur le mainnet**.

**Argument décisif.** Trois faits on-chain vérifiables valent mieux qu'une démo synthétique pour ce jury.

**Ce qu'on perd.**
- Du MON pour l'acte 2. Coût à chiffrer en R8, avec la contrainte de la réserve de 10 MON par compte.
- Aucune démonstration positive sur un trafic tiers.

**Confiance.** 0,7.

## Changements dans le draft d'ERC (tour 3, en plus des tours 1 et 2)

- §2 `TagSchema` : ajouter `kind` (endorsement | measurement) et `neutral` ; supprimer `higherIsBetter` (le couple min / neutral / max le remplace). MUST NOT faire propager un tag `measurement`.
- §3 : arête = dernier avis non révoqué par (client, agent, tag1), dominance du négatif, rejet des contrôleurs **et des anciens owners**, nœud-adresse pour un wallet ambigu. Supprimer « every node A controlled by clientAddress », qui fusionnait les agents.
- §4 : grille de quantification normative. Remplacer `score = t·N`, `Σt = 1e18` et la masse sans issue renvoyée vers p (tours 1 et 2).
- §5 : `Certificate` engage les versions des registres ; supprimer `nodeCount` ; `lastIndexRoot` est conservé comme base des preuves d'écart (le draft l'avait déjà).
- §6 : `trustOf` ne revert plus. Il renvoie un statut (`OK`, `NO_CERT`, `STALE`, `TRANSFERRED`, `VETOED`, `REGISTRY_CHANGED`) et le tag déclencheur. Ajouter `checkRegistry()` et l'event associé.
- Backwards Compatibility : ajouter les trois demandes à ERC-8004.
- Security Considerations : upgradabilité par EOA, contournement réel du garde-fou (78 cas), wallets partagés, négatif permanent en cas de clé perdue, et le recours `appendResponse`.
- Motivation : corriger avec les faits mesurés (84 agents notés dont 10 hors index 8004scan, registre dormant depuis le 10/09).

## Désaccords non résolus (tour 3)

1. **Négatif permanent.** A et E veulent une échéance ou une levée. D refuse toute échéance (j'attendrais son expiration). Rien n'est tranché : la révocation par l'auteur reste le seul mécanisme.
2. **Coût de vérification de la version.** B veut une vérification à la certification plus `checkRegistry()`. C juge ça trop faible (vivacité par bonne volonté). E veut un event. La décision retient les deux, mais ne protège pas contre une upgrade qui garde la même version.
3. **Acte 2 sur le mainnet.** C et B signalent un coût en MON non chiffré. E l'exige pour la cohérence. La décision est prise sous réserve du chiffrage R8.
4. **Oracle de refus.** D juge que renvoyer le tag déclencheur aide l'attaquant, E en a besoin pour exploiter le service. La décision le retient, parce que l'état est public.

## Ce que vous auriez dû me demander (tour 3)

1. **Qui tient `0xa06f907f` ?** C'est un scanner qui note des agents Spawn. Est-il complice ou victime ? La démo le présente comme une arête d'attaque. Il faut vérifier ce qu'il est avant de le nommer publiquement.
2. **Que devient ANCRE si la v2.1.0 est déployée avant le 13/10 ?** Unicité du wallet et index inverse simplifient D16, mais chaque certificat de démo devient `REGISTRY_CHANGED`.
3. **Combien de MON coûte l'acte 2 ?** Nombre de comptes, gas limits, réserve. À chiffrer avant d'écrire le script de ferme.
4. **Le jury peut-il rejouer l'acte 1 en 5 minutes ?** Un script reproductible (`cast` + solveur) vaut plus qu'une vidéo.
5. **Faut-il notifier le propriétaire de #8317** (contournement du garde-fou) et l'équipe ERC-8004 (EOA unique) avant de le montrer au jury ? C'est une question de divulgation responsable. Elle est mineure ici (le comportement est public et documenté dans la source), mais elle vaut d'être posée.

---

# Résultats des chantiers R4, R5 et R6 — 2026-09-27

Détails et commandes dans `solver/RESULTS.md`, `contracts/GAS.md`, `contracts/ENCODING.md`, `solver/FORMAT.md`, `docs/erc/CHANGES.md`. Tous les chiffres ci-dessous sont MESURÉS sauf mention contraire.

**R4, solveur (`solver/`, 95 tests)**
- Eve-8004 : moyenne naïve 1,53·10³⁶, **masse ANCRE 0**, même avec un schéma où tous les tags propagent.
- Scanner `0xa06f907f` comme ancre : **34,6 % de fuite sans D15, 0 avec**. Deux scanners corrélés font passer Eve malgré m = 2 (AM-R4.8) : **D15 n'est pas redondante avec D8**.
- #8317 : les 78 auto-notations sont rejetées. D14 conserve le slash sur #4.
- **D16 coupe la seule chaîne honnête** (AM-R4.1) : `0xea0b` est le wallet de #18, #22 et #23, donc un nœud-adresse sans masse. La variante « relais » la rétablit ; elle n'est pas décidée.
- α sur graphes synthétiques (dépend du modèle) : la borne de fuite est **atteinte** (rapport 1,00). Avec un seuil réglé à 1 % de Sybil admis, la couverture honnête vaut 0,64 / 0,55 / 0,44 pour α = 1/4, 1/3, 1/2. **1/2 est dominé, 1/4 est un candidat sérieux.**
- 8004scan fausse 24 `valueDecimals` (AM-R4.2) : relire les avis on-chain.
- Autres : la règle « ancien owner » rejette 9 notes d'execution.market (AM-R4.3) ; TAGS_MAX = 8 est trop petit (AM-R4.4) ; e < θ oblige à fournir presque tout le support (AM-R4.5) ; un nœud absorbant doit avoir une ligne vide (AM-R4.7) ; une note de 40/100 avec neutre à 50 devient de la méfiance (AM-R4.9).

**R5, contrat (`contracts/`, 49 tests dont 6 en fork mainnet)**
- **Le projet tient pour la démo.** L'acte 2 (300 arêtes, 100 nœuds, 3 ancres) coûte ≈ 840 k gas, soit ≈ 0,084 MON par mise à jour. Le graphe réel du mainnet coûte 133 à 146 k.
- **L'estimation du CR (~320 gas/arête) est fausse d'un facteur 5 à 13 : c'est l'exécution qui domine**, pas le calldata (le plancher EIP-7623 n'est jamais atteint). Une mise à jour coûte 1 600 / 2 470 / 4 250 gas par arête pour k = 1 / 3 / 8.
- Tailles limites dans 30 M (extrapolation linéaire) : ~18,7 k / 12,1 k / 7 k arêtes pour k = 1 / 3 / 8. L'hypothèse de R4 (2 000 nœuds) coûte **14,8 M** gas, pas 7,6 M.
- Premier certificat : 28,7 k par nœud et 17,1 k par slot neuf. Au-delà de ~1 000 nœuds, il faut le découper (`addNodes`, `reserveCapacity`).
- **Lecture : `assess` coûte 77 k sans veto et 115 à 190 k avec veto** (CR : ~16 k). Le seul `ownerOf` via le proxy froid coûte ~36 k (AM-R5.5).
- forge 1.8.3 avec `network = "monad"` reproduit MIP-8 au gas près. Piège : les appels `view` ne sont pas isolés dans un test (AM-R5.1).
- Écarts assumés : vecteurs entrelacés par groupes de 4 nœuds (une page lue au lieu de k), `vectorRoot` = keccak plat, d calculée sur la combinaison des ancres.
- **Ouverts** :
  - veto limité aux 32 derniers avis d'un couple : faux OK possible, cas réel avec 73 avis (AM-R5.6 = AM-R4.6) ;
  - `addNodes` sans permission : gonflement de la table (AM-R5.7) ;
  - `ownerFp` non vérifié (AM-R5.8) ;
  - preuves (ii) à (iv) non écrites ;
  - la preuve d'omission ignore la règle « ancien owner » (AM-R5.11).
- Corrigé : un registre hostile pouvait vider le gas d'un `assess` ; chaque appel est maintenant plafonné à 120 k (AM-R5.9).

**R6, norme (`docs/erc/`)**
- Draft réécrit (775 lignes, EIP-1). 9 points ⟦OPEN⟧. 28 incohérences, AM-R6.1 à .28. La plus grave : **AM-R6.2**, l'élargissement de e sans limite par de nouveaux avis après chaque certification, qui mène à un déni de service. Le plafond par ligne proposé reste à valider.
- AM-R6.1 était en partie faux : CLAUDE.md avait bien été mis à jour. Seul le §5 était resté obsolète ; il est corrigé.

## Questions pour le tour 4 (bloquantes pour les chantiers)

1. **D16 et le relais** : faut-il faire circuler la masse agent → wallet partagé, pour rétablir la seule chaîne honnête (AM-R4.1) ? Cela touche aussi à la règle « ancien owner » (AM-R4.3, AM-R5.11, AM-R6.4).
2. **Veto en O(1) ou fenêtre** : D14 (dernier avis par tag) impose de parcourir tout l'historique. Options : fenêtre plus large, tag de veto réservé lu en O(1), veto certifié hors chaîne avec seulement le dernier avis lu en direct (AM-R5.6).
3. **Élargissement non borné de e** (AM-R6.2) : faut-il un plafond par ligne, et qui paie la recertification ?
4. **Permissions** de `addNodes` et `submitCertificate` (AM-R5.7, AM-2.3).
5. **α = 1/4 ou 1/3** (R4 synthétique), et TAGS_MAX (AM-R4.4).
6. **Coût de lecture** de 77 à 190 k : faut-il mettre `ownerOf` en cache dans le certificat, et quel budget accepter pour un routeur x402 ?
7. **e < θ contre troncature** (AM-R4.5) : faut-il une borne par coordonnée, ou accepter de fournir tout le support ?

---

# Tour 4 — 2026-09-27 — les 7 questions bloquantes

## Faits utilisés (relus avant de délibérer, règle AM-3.13)

Tous sont MESURÉS le 27/09 et viennent de `solver/RESULTS.md`, `solver/out/synthetic.md`, `contracts/GAS.md` et `docs/erc/CHANGES.md` :
- **Variante relais** (R4) : #2 et #3 reçoivent 0,049 par colonne, et #4 une méfiance de 0,099 ; support de 6 nœuds.
- **α synthétique** (R4, deg = 5, g = 100, attaque aléatoire) : au seuil « 1 % de Sybil », la couverture honnête après leave-one-out vaut 0,752 / 0,712 / 0,668 pour α = 1/4 / 1/3 / 1/2. À θ fixe, les Sybil qui passent le leave-one-out sont 0,7 % / 0,3 % / 0 %.
- **Truncation** (R4) : pour obtenir e ≤ θ, il faut fournir presque tout le support (ex. 1 973 lignes sur 1 996).
- **Lecture** (R5) : `assess` coûte 77 k sans veto, dont ~36 k pour `ownerOf`. Le veto ajoute ~28 k pour la première ancre, ~11 k par ancre supplémentaire et ~15 k par avis lu.
- **Preuves** (R5) : `proveOmission` coûte 220 541 gas facturés. Une mise à jour de certificat pour l'acte 2 coûte ≈ 840 k.
- **Stockage** (R5) : α est déjà engagé **par ensemble** dans le `setId`, et les colonnes sont stockées par ensemble.
- **Plafond d'élargissement** (R6, AM-R6.2) : la formule proposée est `cap = ‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2`.

## Reformulation

La question 7 (« e < θ contre troncature ») est mal posée. Elle suppose que le certificat doit borner une **norme** du résidu. On peut aussi exiger un **signe** : t ≤ F(t) composante par composante. On la repose donc ainsi : *quelle forme de certificat donne une borne par agent sans fournir tout le support ?* C'est elle qui décide Q3 et Q6. Elle passe donc en premier.

## Phase 1 — Analyses indépendantes (condensées)

### A. Théoricien
- **Q7.** F est **monotone** : ses coefficients sont positifs, puisque la méfiance n'entre pas dans t. Si t ≤ F(t) composante par composante, alors t ≤ F(t) ≤ F²(t) ≤ … → t*, **donc t ≤ t\* partout**.
  - C'est une borne inférieure **par coordonnée, exacte, sans e**.
  - Une ligne omise ou tronquée ne fait que réduire F. La propriété reste donc vraie pour le vrai graphe, et **la troncature devient gratuite du côté de la confiance**.
  - En arithmétique entière arrondie vers le bas, l'itération de puissance depuis 0 produit exactement une telle sous-solution, car F_bas est monotone.
  - **Réserve** : un avis qui *diminue* une entrée (révocation, baisse, dilution de B⁺ par un nouvel avis positif, changement de wallet) peut casser la propriété. Seuls ces écarts-là doivent encore élargir la borne.
- **Q1.** Il suffit de copier la ligne du wallet dans chaque agent qui le partage : **chaque agent émet avec sa propre masse**. Un wallet avec 762 agents de masse nulle ne transmet rien. Pas besoin de nœud-adresse, pas de saut de relais amorti.
- **Q5.** Au seuil calibré, 1/4 domine faiblement ; à seuil fixe, il laisse passer plus de Sybil. Aucune valeur ne domine partout : α est un **paramètre du lecteur**.

### B. Ingénieur EVM
- **Q7.** Vérifier t_i ≤ y_i ne coûte qu'une comparaison de plus par nœud dans la passe existante.
- **Q2.** Lire le **dernier** avis de l'ancre coûte `getLastIndex` + un `readFeedback`, soit ~26 k (estimé à partir de 11 k + 15 k). Le veto certifié, lui, se calcule **dans la passe** à partir des lignes d'ancres, qui sont déjà dans le calldata : c'est un bit par nœud.
- **Q6.** Un indicateur `TRANSFERRED` posé par preuve (un SSTORE, rare) remplace le `ownerOf` en direct (−36 k à chaque lecture).
- **Q4.** `addNodes` ne doit pas écrire dans la table de l'ensemble. Il faut une zone de préparation par soumetteur, consommée par son certificat.

### C. Concepteur de normes
- **Q7.** La norme doit définir le certificat comme une **sous-solution certifiée**. Le L1 ne reste que pour la borne supérieure. C'est plus simple à expliquer et à tester.
- **Q1.** La règle « ancien owner » n'est pas prouvable on-chain (AM-R6.4) et rejette à tort les plateformes qui mintent puis transfèrent (AM-R4.3). Une règle normative invérifiable est une mauvaise règle.
- **Q5.** α est déjà dans le `setId`. Le rendre libre ne coûte rien à la norme. On garde 1/3 en RECOMMENDED, et on documente le compromis mesuré.

### D. Attaquant
- **Q3.** Je contrôle un nœud du support. Après chaque certificat, je poste un avis, puis je le conteste. Avec la sous-solution, un avis **positif** ne fait rien, sauf s'il dilue ma ligne. Pour nuire, je dois **retirer** de la confiance. Le plafond par ligne borne mon dégât. Mon coût est de 220 k par preuve, contre ≈ 840 k pour la recertification du défenseur : ça reste un levier ×4.
- **Q2.** Veto au dernier avis seulement : si je tiens une clé d'ancre, je peux lever un veto en direct en postant un +1. Mais le veto certifié par dominance le maintient. Je gagne au plus la fenêtre entre deux certificats, et seulement si le slash et le +1 tombent tous les deux avant la recertification.
- **Q6.** Indicateur de transfert posé par preuve : j'achète un agent réputé et je me fais payer avant que quelqu'un prouve le transfert. La fenêtre dépend de la latence du surveillant.
- **Q1.** Copie de ligne : la plateforme qui tient 100 agents réputés parle avec 100 masses. C'est de la concentration, pas du Sybil. Je n'y gagne que si j'ai déjà la masse.

### E. Intégrateur
- **Q6.** Une décision à 77-190 k gas peut coûter plus cher qu'un micropaiement. Il faut **mettre la décision en cache** dans le router, par (payé, fenêtre de blocs), et proposer un mode rapide par défaut.
- **Q2.** Il faut que le disjoncteur tombe au bloc suivant **et** qu'il reste en place après un +1 posté sous un autre tag (scène 5). Le couple « veto certifié + dernier avis en direct » fait les deux.
- **Q3.** Je veux savoir qui recertifie. Réponse attendue : un robot financé par le propriétaire de l'ensemble.

## Phase 2 — Relecture croisée (ordre anonyme : 1 = D, 2 = C, 3 = A, 4 = E, 5 = B)

- **A relit D (1)** : *vu* le levier ×4 du griefing. *Oubli* : il porte **uniquement** sur des retraits ou des dilutions. C'est bien moins que ce que permettait la règle du tour 2, où tout avis élargissait la borne.
- **B relit A (3)** : la sous-solution est juste. *Oubli* : si l'on garde B⁺ = max(1, Σw⁺), un nouvel avis positif sur une ligne déjà pleine dilue ses entrées. Ce n'est donc pas « gratuit » partout (voir AM-4.4).
- **C relit E (4)** : le cache de décision est une responsabilité du router, pas de la norme. Il faut l'écrire dans la section Security Considerations (fraîcheur).
- **D relit B (5)** : l'indicateur de transfert par preuve ne vaut que si quelqu'un surveille. Il faut un mode strict (`ownerOf` en direct) au choix de la politique.
- **E relit C (2)** : α libre, d'accord, mais avec **un seul** RECOMMENDED. Sinon personne ne choisit.
- **A relit B (5)** : le veto certifié n'est exact que si les lignes d'ancres ne sont **jamais tronquées**. Il faut le rendre MUST.
- **B relit D (1)** : la fenêtre « slash puis +1 avant recertification » est réelle mais étroite. On la documente, on ne la ferme pas en v1.
- **C relit A (3)** : la copie de ligne duplique le calldata. Il faut un encodage « ligne alias » (un en-tête qui renvoie à une ligne déjà émise).
- **D relit C (2)** : abandonner « ancien owner » rouvre le cas « le vendeur note l'agent vendu ». Ce n'est pas qualitativement pire qu'un tiers ami : le vendeur n'a de poids que s'il a de la masse.
- **E relit A (3)** : la borne inférieure exacte simplifie ma politique : `trustRobust ≥ θ` sans e. C'est la meilleure nouvelle du tour.

## Phase 3 — Décisions

### D26 — Certificat par sous-solution *(Q7, décide aussi Q3 et Q6)*

**Décision.**
- Le contrat exige **t_i ≤ y_i pour tout nœud i**, où y = F_bas(t) est calculé avec l'arrondi vers le bas.
- t est alors une **borne inférieure exacte de t\*, par coordonnée**, pour le vrai graphe. Les lignes tronquées ou omises ne peuvent que l'augmenter.
- Le leave-one-out est calculé sur ces bornes inférieures. Il reste une borne inférieure valide, parce que « somme privée des m−1 plus grandes » est croissante en chaque argument.
- **e ne sert plus que pour :**
  - la borne supérieure de la méfiance : d* ≤ d(t) + (1−α)·e, avec e = ⌈‖y − t‖₁·αD/αN⌉ + la marge de troncature ;
  - les élargissements dus aux preuves d'écart de type *diminution*.

**Argument décisif.** La contrainte e < θ (AM-R4.5) disparaît du côté de la confiance. On peut tronquer librement, sans dépendre du support entier.

**Ce qu'on perd.** L'itération doit partir de 0 (itération de puissance monotone). On ne peut pas publier un point fixe « à peu près juste » par au-dessus.

**Confiance.** 0,75. La preuve mathématique est élémentaire. Le chantier 02 doit la tester en fuzz (sous-solution acceptée ⇒ t ≤ t* calculé en fractions exactes).

### D20 — Wallets partagés : attribution par copie de ligne *(Q1)*

**Décision.**
- Si un wallet W est l'`agentWallet` de plusieurs agents A(W), la ligne des avis émis par W est **attribuée à chaque agent de A(W) qui a de la masse**. Chacun émet avec sa propre masse.
- Un agent de masse nulle n'a pas besoin de ligne.
- Un W qui n'est le wallet d'aucun agent reste un nœud-adresse, sans masse sauf s'il est une ancre.
- Encodage : une ligne « alias » renvoie à la ligne déjà émise. Pas de duplication du calldata.
- **La règle « ancien owner » est supprimée de la norme.** Le rejet porte sur les **contrôleurs actuels** de la cible (owner, agentWallet, token approuvé, opérateurs), ce qui est prouvable par (iv-b). Elle peut subsister comme filtre facultatif (`edgeFilterId`).

**Argument décisif.**
- Cela rétablit la seule chaîne honnête du mainnet sans l'amortissement du relais.
- Un wallet partagé par des agents sans masse ne transmet rien.

**Ce qu'on perd.** Un wallet de plateforme qui porte plusieurs agents réputés concentre de l'influence. C'est un désaccord non résolu.

**Confiance.** 0,7.

### D21 — Veto : bit certifié + dernier avis en direct *(Q2)*

**Décision.**
- **Veto certifié.** Pendant la passe, pour chaque ligne d'ancre, toute arête combinée (D14, dominance du négatif) dont w ≤ vMin met à 1 le **bit de veto** de la cible pour cet ensemble.
  - Les lignes d'ancres MUST NOT être tronquées.
  - Le bit est contestable par (i) et (ii).
- **Veto en direct.** Pour chaque ancre, on fait `idx = getLastIndex(j, a)` puis un seul `readFeedback`. Si l'avis n'est pas révoqué, que son tag est `endorsement` et dans le filtre, et que w ≤ vMin, c'est un veto.
- `vetoed = bitCertifié OU direct`. **`MAX_SCAN` est supprimé.**
- **Levée d'un veto** : révocation par l'ancre, puis recertification. Il n'y a pas de levée instantanée (échec fermé, AM-4.6).

**Argument décisif.**
- La lecture est en O(1) par ancre, au lieu de 15 k par avis lu.
- La sémantique exacte de D14 est tenue par le certificat.
- La scène 5 de la démo fonctionne.

**Ce qu'on perd.** Une fenêtre étroite (AM-4.7) : un slash puis un +1 sous un autre tag, tous deux avant une recertification, ne sont vus ni en direct ni par le certificat.

**Confiance.** 0,75.

### D22 — Élargissement plafonné par ligne *(Q3)*

**Décision.**
- Seules les preuves de type **diminution** élargissent la borne inférieure de la confiance : révocation, baisse de poids, dilution de B⁺, changement de contrôleur.
- Les preuves d'omission d'une arête **négative** élargissent la borne de méfiance.
- Le montant est cumulatif, calculé précisément (Δ), et **plafonné par ligne** à `(1−α)·t_u·(‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2)` (R6, solide par l'inégalité triangulaire).
- Le propriétaire de l'ensemble finance un robot de recertification. Pour la démo, c'est nous.

**Argument décisif.** Avec D26, un avis positif n'élargit rien, sauf par dilution. Le griefing se limite au **retrait de confiance**, qui est légitime et plafonné.

**Ce qu'on perd.** Un nœud du support peut encore forcer une recertification, avec un rapport de coût d'environ 1 à 4 contre le défenseur (MESURÉ : 220 k contre 840 k).

**Confiance.** 0,65.

### D23 — Permissions *(Q4)*

**Décision.**
- `submitCertificate` reste **sans permission**, avec la règle de remplacement eEff (D6).
- **Un nœud n'entre dans la table d'un ensemble que par un certificat accepté** qui lui donne une masse t > 0, ou qui est une ancre.
- `addNodes` et `reserveCapacity` écrivent dans une **zone de préparation par soumetteur**, consommée par son `submitCertificate`. Une préparation non consommée ne coûte qu'à son auteur.

**Argument décisif.** Cela ferme le gonflement de table (AM-R5.7) sans ajouter de permission.

**Confiance.** 0,7.

### D24 — α par ensemble, TAGS_MAX = 16 *(Q5)*

**Décision.**
- α est un paramètre du lecteur, engagé dans le `setId` (c'est déjà le cas dans R5).
- **RECOMMENDED α = 1/3** (valeur de la démo). On documente 1/4 comme l'option « couverture », avec le compromis mesuré : plus de couverture au seuil calibré, plus de Sybil admis à θ fixe.
- TAGS_MAX = 16. Pas de filtre par préfixe en v1.

**Argument décisif.** Aucune valeur ne domine partout (R4), et la liberté ne coûte rien (stockage par ensemble).

**Ce qu'on perd.** Deux ensembles avec des α différents ne sont pas comparables. C'était déjà vrai avec des ancres différentes.

**Confiance.** 0,7.

### D25 — Coût de lecture *(Q6)*

**Décision.**
- **Mode rapide par défaut** : l'indicateur `TRANSFERRED` est posé par une preuve (iv-b) à partir d'un owner engagé dans le certificat. `assess` ne fait plus d'`ownerOf`, ce qui économise ~36 k (MESURÉ).
- **Mode strict** au choix de la politique : `ownerOf` en direct.
- Le router **met la décision en cache** par (payé, `setId`, fenêtre de W blocs), avec W engagé dans sa configuration.
- Budget cible, ESTIMÉ à partir des mesures R5 : ~41 k sans veto, ~95-135 k avec veto pour k = 3. À mesurer dans le chantier 02.

**Argument décisif.** Une décision de paiement ne doit pas coûter plus que le paiement.

**Ce qu'on perd.** En mode rapide, la fenêtre de transfert dure le temps que le surveillant prouve le transfert.

**Confiance.** 0,65.

## Spécification — D26 et D21 (à implémenter dans les chantiers 02 et 04)

```
SOLVEUR (hors chaîne), par colonne a :
  t⁰ = 0
  répéter : t^{n+1} = F_bas(t^n)          // mêmes arrondis que le contrat
  jusqu'à ‖t^{n+1} − t^n‖₁ ≤ ε ou n = N_MAX
  publier t = t^{n+1}                      // garantit t ≤ F_bas(t) par monotonie
  les lignes d'ancres sont toujours fournies ; les autres MAY être tronquées

VÉRIFICATION (on-chain), en plus du tour 2 :
  pour tout nœud publié i :  require t_i ≤ y_i          // y arrondi vers le bas
  rUp  = Σ_i (y_i − t_i) + ops + marge de troncature
  eUp  = ⌈rUp · αD/αN⌉                                  // borne supérieure, méfiance
  pour chaque ligne d'ancre a, chaque arête (a, j, w) : si w ≤ vMin → vetoBit[set][j] = 1
  stocker t (bornes inférieures), d, eUp, vetoBit, ownerFp

PREUVES D'ÉCART :
  diminution (révoqué, baisse, dilution B⁺, contrôleur changé) → eLow[a] += Δ plafonné (D22)
  omission d'arête négative → eUp[a] += Δ plafonné
  omission d'arête positive sans dilution → aucun effet (t reste une sous-solution)
  (iv-b) owner(j) ≠ ownerFp[j] → transferred[j] = 1

LECTURE assess(j, set) :
  c_a        = λ_a · t_j^(a)
  trustLow   = Σ_a c_a − (somme des m−1 plus grands c_a) − Σ_a λ_a·eLow[a]
  distrustUp = Σ_a λ_a·d_j^(a) + Σ_a λ_a·eUp[a]
  veto       = vetoBit[set][j] ∨ (∃ ancre a : dernier avis de a sur j négatif, valide, filtré)
  statut     : NO_CERT, STALE, TRANSFERRED (indicateur ou ownerOf en mode strict),
               REGISTRY_CHANGED, VETOED, OK
  OK ⇔ ¬veto ∧ trustLow ≥ θ ∧ ρD·distrustUp ≤ ρN·trustLow
```

## Changements pour le draft d'ERC (chantier 08)

- §4 : certificat par **sous-solution**, avec le lemme de monotonie en Rationale. La borne L1 ne sert plus qu'à la borne supérieure.
- §3 : copie de ligne pour les wallets partagés ; suppression de la règle « ancien owner » (déplacée en `edgeFilterId` facultatif) ; lignes d'ancres non tronquables.
- Veto : bit certifié + dernier avis ; suppression de toute fenêtre de parcours.
- Preuves : classification diminution / négatif / positif ; plafond par ligne.
- α : paramètre de l'ensemble, RECOMMENDED 1/3 ; TAGS_MAX = 16.
- Politique : mode strict ou rapide pour `TRANSFERRED` ; cache de décision côté consommateur, en Security Considerations.

## Désaccords non résolus (tour 4)

1. **Concentration par copie de ligne (D20)** : une plateforme qui porte beaucoup d'agents réputés parle avec leur masse cumulée. A et D l'acceptent (ce n'est pas du Sybil) ; C s'inquiète d'une « super-ancre » implicite.
2. **Mode rapide ou strict pour le transfert (D25)** : D veut le mode strict par défaut, E et B le mode rapide.
3. **Griefing par retrait (D22)** : le rapport de coût ×4 reste en faveur de l'attaquant. Faut-il une recertification incrémentale ? Elle est non spécifiée.
4. **Fenêtre slash puis +1 (D21)** : documentée, pas fermée.

## Angles morts découverts (tour 4)

| Id | Angle mort | Statut |
|---|---|---|
| AM-4.1 | Le nœud-adresse sans masse de D16 pénalisait les wallets partagés sans gain Sybil : des agents de masse nulle ne transmettent rien de toute façon | résolu (D20) |
| AM-4.2 | La règle « ancien owner » était invérifiable on-chain et fausse pour les plateformes qui mintent puis transfèrent | supprimée (D20) |
| AM-4.3 | **Quatre tours ont certifié une norme du résidu alors qu'un signe suffisait.** La monotonie de F donne une borne inférieure exacte par agent. La « borne globale » (désaccord 5 du tour 2) et e < θ (AM-R4.5) venaient du choix de l'outil | résolu (D26) |
| AM-4.4 | Avec B⁺ = max(1, Σw⁺), un avis positif sur une ligne déjà pleine **dilue** les autres entrées : tous les ajouts ne sont pas sans effet | intégré (D22) |
| AM-4.5 | Le coût d'une décision (77-190 k gas mesurés) peut dépasser la valeur d'un micropaiement | cache de décision (D25) |
| AM-4.6 | Un veto ne se lève qu'après recertification, même quand l'ancre révoque son slash | assumé (échec fermé) |
| AM-4.7 | Un slash puis un +1 sous un autre tag, tous deux entre deux certificats, ne sont vus ni en direct ni par le certificat | documenté |
| AM-4.8 | Le veto certifié exige que les lignes d'ancres ne soient jamais tronquées | MUST (D21) |

## Ce que vous auriez dû me demander (tour 4)

1. **Qui finance la recertification à long terme ?** C'est la question de modèle économique que le jury (des VC) posera.
2. **Les ancres doivent-elles réserver un tag au veto ?** Avec D21, le dernier avis compte. Une ancre qui poste aussi des mesures sur le même agent masque son slash en direct (le certificat le garde). Il faut une consigne opérationnelle pour les ancres.
3. **Faut-il vérifier formellement D26 ?** Un lemme de dix lignes, plus un test en fuzz contre des fractions exactes. C'est bon marché, et c'est un argument de sérieux pour le jury.

---

# Tour 5 — 2026-09-27 — questions de fond (5A) et contre-expertise du tour 4 (5B)

Les deux conseils ont tourné **en parallèle, dans deux agents séparés**. Leurs délibérations complètes (phases 1 et 2, vérifications numériques, scripts) sont en annexe :
- `docs/conseil/tour5A-fond.md` : modèle économique, risques du registre, positionnement, exécution, recommandations à Hugo ;
- `docs/conseil/tour5B-revue-tour4.md` : contre-expertise adversariale de D20 à D26. Scripts dans `scratchpad/tour5B/`, à promouvoir dans `solver/tests` (D37).

Leurs décisions sont renumérotées **D27 à D37** dans le journal : D-A1 à D-A5 → D27 à D31, D-B1 à D-B6 → D32 à D37. Leurs angles morts deviennent **AM-5.1 à 5.18** dans le tableau cumulatif.

## Faits établis (27/09)

- **Scanner `0xa06f907f`** (MESURÉ) : service automatique de filtrage de risque. 24 avis `trust/oracle-screening` et 8 `liveness`, sur 28 cibles, entre le 21 et le 25/03. C'est une EOA sans agent. Le lien avec un projet nommé est NON VÉRIFIÉ.
- **v2.1.0 d'ERC-8004** (MESURÉ) : la PR #80 est ouverte depuis juin sans fusion, et `master` est inchangé depuis le 15/08. La PR #84 (auto-notation des owners) a été fermée sans fusion.
- **Concurrents** (MESURÉ) : ColinkaMir vend un signal de provenance via x402 (dernier push le 22/09) ; trustgraphs fait du PageRank ancré avec preuve ZK sur EAS (dernier push le 15/09).
- **Règlement Metropolis** (DOC, page officielle lue le 27/09) : l'open source est encouragé mais pas exigé. Aucune grille de notation n'est publiée, et aucun déploiement sur le mainnet n'est exigé.
- **Bounty passkeys** de la Monad Foundation : il vise **Mera**, pas le P256 en général. CLAUDE.md est corrigé.
- **D26, vérification numérique** (MESURÉ, 5B) :
  - sur 300 graphes aléatoires, l'itération entière depuis 0 donne toujours t ≤ F_bas(t) et t ≤ t* ;
  - l'écart à t* ne dépasse jamais 83 wei, soit au plus 2/3 de la borne ;
  - le leave-one-out sur les bornes inférieures est valide dans 4 461 cas sur 4 461 ;
  - convergence en 3 à 5 itérations sur le mainnet, 79 à 82 sur le graphe de démo ;
  - **la garantie est violée** dans trois situations : dilution de B⁺ (164/294), arête fabriquée (341/400), poids gonflé (88/147).
- **Faille réelle** (MESURÉ, vecteur `mainnet_slash_anchor`). Un certificat qui fabrique l'arête 0x0730 → #4 donne t(#4) = 0,111 au lieu de 0. Il a exactement le même eUp ([3,3] wei), donc il **remplace le certificat honnête**. Le trou existe depuis le tour 2 (AM-5.9, AM-5.18).

## Ce que le tour 5 change

1. **Le point le plus important : ANCRE était falsifiable.** Tant qu'aucune arête n'est relue dans le registre, un soumetteur quelconque peut publier un graphe inventé, et le certificat reste valide. D26 tient comme **lemme**, mais sa garantie exige C_engagé ≤ C_vrai. D'où D32, qui définit deux niveaux :
   - **Registry-verified** : chaque arête est relue dans le registre (`readFeedback`, dernier index du tag, wallet, contrôleurs). C'est le seul niveau où la soumission reste ouverte à tous. Coût ESTIMÉ ≈ 13,6 M gas pour la démo, contre 0,84 M aujourd'hui, **à mesurer en priorité** dans le chantier 02.
   - **Submitter-attested** : les soumetteurs sont listés dans le `setId`, et les preuves d'écart, y compris la nouvelle preuve (v) FABRICATION, restent actives.
2. **Veto (D33, amende D21).** Seul le dernier avis de l'ancre, lu dans le registre, est garanti ; le bit certifié devient un complément. **La scène 5 de la démo est réécrite** : le +1 est posté par un autre noteur. Dans l'acte 1, il faut dire que le cas réel (0xea0b → #4) n'est vu que par la méfiance certifiée.
3. **Transfert (D35, amende D25).** Le mode strict (`ownerOf` en direct) devient le défaut, amorti par le cache du router.
4. **D20 (copie de ligne) est confirmée par la mesure (D34).**
5. **Modèle économique (D27).** Le propriétaire d'un ensemble paie. Ça rejoint naturellement le niveau Submitter-attested : **le propriétaire de l'ensemble est le soumetteur attesté par défaut**, et Registry-verified reste l'option sans tiers de confiance.

## Contradictions entre 5A et 5B (non lissées)

| Sujet | 5A dit | 5B dit | Arbitrage |
|---|---|---|---|
| Pitch sur D26 | « certificat par sous-solution » comme argument technique (D30) | sans D32, ANCRE est falsifiable, avec ou sans D26 | **On ne pitche la garantie qu'avec son niveau** : Registry-verified si la mesure le permet, sinon « Submitter-attested, avec preuve de fabrication », dit tel quel |
| Ordre de coupe (D31) | couper d'abord les preuves (ii) et (iii), garder (i) et (iv-b) | la preuve (v) FABRICATION manque et elle est indispensable en Submitter-attested | **(v) ne se coupe jamais** si la démo tourne en Submitter-attested. On l'ajoute à la liste « jamais coupé » |
| Soumission ouverte (D23, tour 4) | — | seulement en Registry-verified | D23 est amendée par D32 |
| Modèle économique et niveau | le propriétaire de l'ensemble paie (D27) | Submitter-attested demande une liste de soumetteurs | cohérents : le payeur est l'attesteur. Le choix du niveau de la démo reste ouvert, suspendu à la mesure du chantier 02 |

## Désaccords non résolus (tour 5)

1. **Niveau de la démo : Registry-verified (~13,6 M estimés) ou Submitter-attested.** La mesure du chantier 02 tranche. E et D exigent Registry-verified ; C accepte les deux s'ils sont nommés honnêtement.
2. **Veto « dernier avis » contre D14 (dominance) pour une même ancre** : deux règles pour un même avis.
3. **Mode strict ou rapide** pour un micropaiement, même avec le cache.
4. **Calibrer eLow_max** (D36) sans données réelles.
5. **Divulgation avant le pitch** : risque d'upgrade avant le 13/10, atténué par D28.
6. **PR d'ERC avant le jugement**, alors que 9 ⟦OPEN⟧ restent (plus ceux ouverts par D32).
7. **Ferme CREATE2** : moins chère, mais triviale à détecter par provenance.
8. **« Oracle de réputation » sans jeton** : répond-il à un VC qui demande où se capte la valeur ?

## Ce que vous auriez dû me demander (tour 5)

1. **Qui fait quoi dans l'équipe, et combien d'heures par jour d'ici le 13/10 ?** La répartition de D31 est une hypothèse.
2. **Qui surveille et prouve pendant le jugement (13 → 27/10) ?** Sans surveillant, les preuves d'écart ne protègent rien.
3. **Faut-il vraiment une soumission ouverte à tous pour la démo ?** Si non, Submitter-attested coûte environ 16 fois moins (ESTIMÉ).
4. **Le jury rejouera-t-il réellement quelque chose ?** Si non, la démo figée sert surtout de secours pour la vidéo.
5. **Que demande exactement le bounty Mera ?** Personne ne l'a lu en détail.

## Décisions qui restent à Hugo (recommandations des tours 5A et 5B)

| Sujet | Recommandation |
|---|---|
| Dépôt public | privé jusqu'au 12/10, public à la soumission ; ERC en CC0, code en MIT ou Apache-2.0 (CHOIX) |
| PR d'ERC | le 12/10, avec la réponse au #309, **si** les ⟦OPEN⟧ sont traités ; sinon après le jugement |
| Divulgation (D29) | prévenir en privé les auteurs d'ERC-8004 avant le 05/10 |
| Budget MON | deux enveloppes (frais, capital immobilisé), chiffrées par le chantier 06, validées avant toute transaction |
| Ancres de démo | deux EOA « demo » à nous, plus un tiers seulement s'il est confirmé avant le 03/10 ; Mera seulement si le SDK s'intègre en moins d'une journée |
| Nom | ANCRE (à garder), Keel, Mooring. Disponibilité NON VÉRIFIÉE |
| Équipe | valider ou corriger la répartition de D31 |

---

# Vagues 1 et 2 de recherche — 2026-09-27

Détails dans `docs/ressources/` : les fiches de la vague 1 (`envio.md`, `mera.md`, `metamask-agent-wallet.md`, `x402.md`, `monad-dev-et-soumission.md`) et les designs de la vague 2 (`design-*.md`).

## Faits nouveaux (MESURÉ ou DOC, 27/09)

- **Les registres ERC-8004 existent sur le testnet**, à d'autres adresses : Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`, en v2.0.0, avec le même bytecode et la même clé d'upgrade. Le testnet est même plus actif (1 941 agents, 1 530 avis). Vérifié par `cast`.
- **Le registre du mainnet n'est plus dormant** : 95 nouveaux avis de 20 clients depuis le bloc 108 483 651. Analyse dans `nouveaux-avis-mainnet.md`.
- **Temps de bloc : 0,302 s**, mesuré sur 1 000 blocs.
- **USDC Monad** : FiatToken v2.2. Il accepte ERC-1271 dans les deux variantes d'EIP-3009 dès que le compte payeur a du code. Constaté dans le code de Circle et en fork.
- **Facilitator x402-rs** : pas de plafond de gas dans le code. Un refus au moment du règlement fait échouer l'estimation, donc **aucune trace on-chain**.
- **Contrat payeur ERC-1271 testé en fork** (mainnet et testnet, `exact` et `upto`) : le fournisseur fiable est payé, la ferme est refusée, un veto posé entre la vérification et le règlement bloque le paiement. Un règlement gardé coûte 252 à 364 k gas, contre 144 k pour un EOA.
- **Coûts mesurés en fork** : `register` 222 k, `giveFeedback` 271 k, déploiement d'ANCRE 4,37 M, `registerAnchorSet` 386 k. **L'acte 2 complet coûte ≈ 40 M gas ≈ 4,1 MON** ; une exécution minimale sur le mainnet coûte ≈ 0,9 MON (ESTIMÉ à partir de ces mesures).
- **MetaMask Agent Wallet** : v7.0.0, supporte Monad 143 et 10143. Guard Mode ne compte pas les signatures. Il faut `minCliVersion ">=6.2.0 <8"`.
- **Envio** :
  - supporte Monad 143 et 10143 ;
  - le même bytecode ERC-8004 est présent sur 20 chaînes, dont 19 avec HyperSync ;
  - le plan Cloud gratuit est limité à 100 k events sur 30 jours ;
  - Monad 143 représente ≈ 41 800 events ;
  - les handlers s'exécutent deux fois, les appels réseau passent donc par l'Effect API.
- **Mera** : `@category-labs/mera` v0.2.0 est une bibliothèque, pas un wallet. Seule la sortie PRF `first` est utilisée (un prompt par sel). La clé P-256 n'est pas exposée.
- **Règles, NON CONFIRMÉES** (README de `precious-akpan/monad-metropolis-merchant-rails`, qui cite les Rules v3.0) :
  - dépôt public sous licence OSI, pendant toute la durée ;
  - vidéo de 3 minutes maximum ;
  - usage d'outils IA à déclarer ;
  - 5 critères à 20 %, dont « Monad Integration » ;
  - **inscriptions closes le 06/10** ;
  - formulaire ouvert le 02/10 ;
  - mainnet ou testnet acceptés (Rules §9.2).
- **Concurrents par bounty** :
  - Envio : `Sireadell/headwater-indexer` ;
  - Mera : `aliveevie/mandate` ;
  - MetaMask : `Beltran12138/warrant`, complémentaire.

## Décisions proposées (tranchées ici quand ce sont des corrections de conformité, sinon soumises à Hugo)

| # | Sujet | Décision | Statut |
|---|---|---|---|
| D39 | **Statut ≠ confiance** | `assess` renvoie `OK` pour un agent inconnu, dont la confiance vaut 0 : le statut parle du certificat, pas de l'agent. **Les seuils θ et ρ, ainsi que m, q, maxAge et eLow_max, doivent être engagés dans le `setId`** (c'est ce que prévoyait D1, et l'implémentation R5 s'en écarte). Ils doivent être appliqués par `isTrusted`, que tout payeur doit appeler. | **Tranché** : correction de conformité, chantier 02 |
| D40 | Réseau de l'acte 2 *(amende D19)* | **Option H-B** : ferme scriptée et répétitions sur le testnet ; **une seule exécution minimale sur le mainnet** (refus de payer Eve-8004, paiement d'un fournisseur « demo », disjoncteur), pour ≈ 0,9 MON (ESTIMÉ). Le mainnet reste la preuve du critère « Monad Integration ». | Recommandation, **décision de Hugo** (confiance 0,7) |
| D41 | **Double garde de paiement** | **Garde dure** : un contrat payeur ERC-1271 détient les USDC et appelle `isTrusted` dans `isValidSignature`. **Garde douce** : le plugin `mm ancre` appelle `decide()` avant de signer. Guard Mode n'autorise que le payeur et l'USDC. Les refus sont reconstitués hors chaîne par `explain()`, plus une trace facultative `reportRefusal`. | Tranché sur le design ; **le test T1 sur le testnet reste à autoriser par Hugo** |
| D42 | Indexeur Envio | Voir le journal et `cross-idea-envio.md` | Tranché (vague 3) |
| D43 | Concept Mera | Voir le journal et `cross-idea-mera.md` | Tranché sous réserve de Hugo (pré-rotation revient dans la démo) |

## Angles morts (vagues 1 et 2)

| Id | Angle mort | Statut |
|---|---|---|
| AM-6.1 | **`assess` renvoie OK pour un agent inconnu** : un payeur qui ne teste que le statut paie n'importe qui | D39 |
| AM-6.2 | **« Registres absents du testnet » n'a jamais été vérifié** : on l'a déduit de l'absence des adresses du mainnet. Ça a pesé sur D19 et sur trois briefs | corrigé (CLAUDE.md, briefs) |
| AM-6.3 | Le registre n'est plus dormant : les chiffres « live » du pitch sont à recalculer au tournage | analyse en cours |
| AM-6.4 | `solver/graph.py` applique encore la règle « ancien owner » (retirée par D20) et pas la copie de ligne | chantier 04 |
| AM-6.5 | Rendre le dépôt public publie aussi tout son historique (CLAUDE.md, CR, veille, emails) | décision de Hugo (MUSTDO 5) |
| AM-6.6 | Le code Solidity est en `CC0-1.0`, qui n'est pas une licence approuvée par l'OSI | MIT ou Apache-2.0 si §7.2 est confirmé |
| AM-6.7 | Clôture des inscriptions le 06/10 (non confirmé) | MUSTDO 0 |
| AM-6.8 | Un refus x402 ne laisse aucune trace on-chain : l'écran doit reconstituer les refus | D41 |
| AM-6.9 | Le vrai contournement de la garde n'est pas EIP-7702, c'est un `USDC.transfer` par le détenteur de la clé : la garde dure exige que **seul le payeur détienne les USDC** | D41 |
| AM-6.10 | La fiche MetaMask affiche la track 01 : l'éligibilité depuis la track 04 est douteuse | question aux organisateurs (MUSTDO 3) |
| AM-6.11 | Les 95 nouveaux avis viennent d'**execution.market**, un rattrapage automatique posté par un relayer unique `0x10304054` avec des EOA délégués EIP-7702. **Ils ajoutent 0 arête utile** (D15 : 10 tags sur 11 hors schéma ; D16 : aucun client n'est `agentWallet`). L'acte 1 ne change pas. Le registre compte maintenant **9 283 avis** : la part de la ferme passe à 82,6 % | intégré ; le pitch doit dater « 83 % de 9 188 » du 21/09 |
| AM-6.12 | **D16 ne voit pas le seul graphe du mainnet où les noteurs sont eux-mêmes notés.** Les agents « worker » ont `agentWallet = 0` après leur transfert. Un repli « owner si `agentWallet = 0` » donnerait 48 arêtes émises par des agents, mais **toujours 0 masse** depuis les ancres honnêtes | question pour le conseil |
| AM-6.13 | **Concurrent non répertorié : Kanmani/Sentinel** (#10252, #10256, #10257). Il rend un verdict daté par bloc avant d'embaucher un agent. C'est l'angle le plus proche d'ANCRE vu à ce jour. ColinkaMir est désormais inscrit on-chain (#10253) | ajouté à la concurrence (ANCRE.md §9) |


---

# Tour 6 — 2026-09-28 — repli owner et positionnement face à Sentinel

Délibération complète en annexe : `docs/conseil/tour6.md`. Décisions : **D44 à D46** (dans le journal).

**Faits établis** (MESURÉ on-chain, DOC sur leurs sites) :
- **Kanmani (#10252), Sentinel (#10256) et Assay (#10257) ont un seul owner et un seul wallet**, `0xDB6c…7777`.
- Leur pile repose sur la confiance par le prix :
  - Kanmani vérifie que le paiement cité dans un document de preuve a bien eu lieu ;
  - Sentinel rend un verdict daté par bloc avant l'embauche d'un agent, avec une limite de fraîcheur. Il est vendu via une API x402 (0,01 USDC) et **n'est pas lisible par un contrat** ;
  - la caution est on-chain (`0x57aF…eaf`).
- **Aucune ancre ni aucun graphe de confiance n'est visible.**
- Leur constat, auto-déclaré : 73 déclarations de paiement sur 85 citent une transaction absente de la chaîne annoncée.

**Ce qu'il ne faut pas prétendre** : que Sentinel, Kanmani ou Assay paieraient notre ferme ; qu'ils n'ont rien on-chain ; qu'ANCRE est le premier « verdict daté par bloc », ou le premier sur la fraîcheur ou la caution.

**Ce qui nous est propre et vérifiable** : les ancres choisies par le lecteur, la borne Sybil formelle, le certificat vérifié on-chain, la lecture **dans le contrat payeur**, le veto d'ancre, la norme ouverte.

**Désaccords non résolus** :
1. Faut-il geler les arêtes sortantes en mode rapide ?
2. Faut-il citer Kanmani dans le pitch ?
3. La valeur de ROW_ALIAS_MAX est arbitraire.
4. Vaut-il la peine de coder le repli owner avant la soumission ?

**Ce que vous auriez dû me demander** : Kanmani concourt-il en track 04 ? Faut-il le contacter ? Notre ferme de démo doit-elle vraiment se payer, avec le surcoût que ça ajoute au budget ?

## Angles morts (tour 6)

| Id | Angle mort | Statut |
|---|---|---|
| AM-7.1 | **Kanmani, Sentinel et Assay forment une pile concurrente de « confiance par le prix »** (escrow, reçu, caution), sur le même mot « trust ». Elle était absente de nos analyses de concurrence | intégré (D45) |
| AM-7.2 | Leur constat (73 fausses déclarations sur 85) confirme notre Motivation par un autre chemin | D46 |
| AM-7.3 | Le repli owner élargit le support, donc le coût de Registry-verified | ROW_ALIAS_MAX (D44) |
| AM-7.4 | La pause `TRANSFERRED` ne gelait que la confiance **entrante** : un agent racheté pouvait émettre dès le certificat suivant | D44 |
| AM-7.5 | Un filtre « reçu vrai » par défaut récompenserait une ferme qui s'auto-paie | D46 |
| AM-7.6 | Temps de bloc : 266 ms selon Sentinel, 302 ms mesurés par nous. Ça dépend de la fenêtre : aucune valeur ne doit être codée en dur | noté |

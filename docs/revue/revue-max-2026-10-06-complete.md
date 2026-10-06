# Revue `/code-review max` des 05 et 06/10 — rapport consolidé

> Périmètre : `contracts/src`, `plugin/src`, `solver/*.py`, `indexer/src`, `indexer/scripts`, relus sur `main` (commit `ab3b920`, code du périmètre identique depuis `a8eefc5`). `app/` et `demo/` hors périmètre. Revue en lecture seule : aucun fichier du dépôt modifié en dehors de ce rapport et de son JSON jumeau, aucune transaction.
> Les chiffres sont **MESURÉS** (tests forge `network = monad` ou scripts des agents, 05-06/10) ou **CALCULÉS** à partir de ces mesures ; les autres sont étiquetés. JSON jumeau : `docs/revue/revue-max-2026-10-06-complete.json` (mêmes constats, plus les détails en anglais des vérificateurs).

## Synthèse

- **93 constats retenus** : 87 CONFIRMÉS, 6 PLAUSIBLES ; **3 ÉCARTÉS** (comportements documentés).
- **Le plus urgent (02-bis)** : K6/L1, la relecture Registry-verified se désynchronise sur un nœud `address(0)` ajouté par n'importe qui, et une arête fabriquée devient payable sans recours possible ; puis K7 (preuves effaçables par réencodage) et E1 (un seul avis à long tag bloque toute soumission qui engage le couple).
- **Le solveur (04-bis)** a surtout des défauts de vivacité : n'importe qui peut arrêter le certificateur à peu de frais (L3, TBL, GASCAP), il ne tourne pas sur les RPC publics (LOGS), et la boucle ne réagit ni au contrat (THIRD, CHKREG) ni aux preuves déjà posées (AMENDS, ONCE). Le watcher rate la dilution cumulée (W1).
- **L'indexeur (03)** peut être arrêté pour de bon par une seule transaction sans permission (LONGTAG, NUL, SW2) ; aucun des constats indexeur n'était déjà corrigé dans le code actuel (seul le plantage de DECODE l'est).
- **Le plugin** : l'override « humain » se décide sur un payeur et un RPC choisis par l'appelant (M4), et plusieurs issues de paiement sont mal classées (A4a, K15).

| Gravité | 02-bis (contrat) | 04-bis (solveur) | 03 (indexeur) | plugin | Total |
|---|---|---|---|---|---|
| Critique | 2 | 0 | 0 | 0 | 2 |
| Haute | 2 | 6 | 3 | 0 | 11 |
| Moyenne | 6 | 15 | 3 | 5 | 29 |
| Faible | 8 | 8 | 4 | 12 | 32 |
| Nettoyage | 11 | 5 | 2 | 1 | 19 |
| **Total** | **29** | **34** | **12** | **18** | **93** |

## Méthode et limites

- **Recherche** : 22 angles (lecture ligne à ligne par composant, invariants documentés contre code, comportements retirés par l'historique git, traçage entre miroirs solveur ↔ contrat ↔ indexeur ↔ plugin, pièges Solidity/Python/TypeScript, wrappers, réutilisation, simplification, efficacité, altitude, conventions CLAUDE.md). La revue a été interrompue deux fois par la limite d'usage : les 5 angles terminés le 05/10 (`docs/revue/revue-max-2026-10-05-partielle.md`) sont repris tels quels, les autres relancés le 06/10.
- **Vérification** : un vote par constat (CONFIRMÉ / PLAUSIBLE / ÉCARTÉ), regroupé par lots de 3 à 10 constats par vérificateur (au plus 5 en parallèle), la plupart avec un test forge ou un script de reproduction. Les verdicts du lot plugin V3 (K15-K19, K21, M1, M3) n'ont été sauvés que sous forme de verdicts avant l'interruption ; leurs détails viennent des constats d'origine et des reproductions d'autres agents.
- **Balayage final** : un relecteur neuf, avec la liste complète, a cherché les trous ; il a trouvé 2 constats nouveaux, tous deux dans le nouveau code de l'indexeur (SW1, SW2), auto-vérifiés par test.
- **Indexeur** : vérifié sur le code ACTUEL (nouveaux `handlers/ancre.ts` et `lib/calls.ts`) ; colonne « déjà corrigé » dans le JSON.
- **Non exécuté** : Postgres (LONGTAG, NUL, SW2 jugés sur la limite documentée et le code d'Envio 3.12.1), Linux (ARGV), navigateur réel (A4d). Le contrat est corrigé en parallèle dans `ancre-02bis` : ce rapport décrit `main`.

## Index par chantier

- **02-bis** (29) : K6 (critique), L1 (critique), K7 (haute), E1 (haute), A1b (moyenne), K10 (moyenne), EFF1 (moyenne), K8 (moyenne), A2b (moyenne), ALT8 (moyenne), K9 (faible), A1c (faible), K29 (faible), K12 (faible), K11 (faible), K13 (faible), K14 (faible), K3 (faible), EFF5 (nettoyage), SIMP3 (nettoyage), SIMP4 (nettoyage), K26 (nettoyage), EFF4 (nettoyage), K28 (nettoyage), EFF7 (nettoyage), K25 (nettoyage), SIMP8 (nettoyage), SIMP5 (nettoyage), CONV4 (nettoyage)
- **04-bis** (34) : TBL (haute), STUCK (haute), THIRD (haute), L3 (haute), W1 (haute), AMENDS (haute), A1d (moyenne), NODES600 (moyenne), LOGS (moyenne), CHKREG (moyenne), GASCAP (moyenne), DIES (moyenne), STALE (moyenne), DEFER (moyenne), W7 (moyenne), W6 (moyenne), SWALLOW (moyenne), BREAK (moyenne), ONCE (moyenne), ARGV (moyenne), HEADREG (moyenne), MSG (faible), REGADDR (faible), SIGNER (faible), K24 (faible), DEC28 (faible), SYNROWS (faible), SRCLESS (faible), DEC18 (faible), CNT (nettoyage), K23 (nettoyage), DEAD (nettoyage), K27 (nettoyage), MERKLE (nettoyage)
- **03** (12) : SW2 (haute), NUL (haute), LONGTAG (haute), OUTERCALL (moyenne), REGCB (moyenne), SW1 (moyenne), K22 (faible), CHECKCOV (faible), PUBLISH (faible), DECODE (faible), QUOTA (nettoyage), SEQ (nettoyage)
- **plugin** (18) : K15 (moyenne), A4a (moyenne), K21 (moyenne), M4 (moyenne), M3 (moyenne), D3e (faible), K17 (faible), K16 (faible), M1 (faible), K18 (faible), K20 (faible), A4g (faible), A4d (faible), A4e (faible), A4f (faible), K19 (faible), K5 (faible), SIMP7 (nettoyage)

## Constats, par gravité

### Critique (2)

#### 1. [K6] Relecture Registry-verified désynchronisée par un nœud address(0)

`contracts/src/AnchoredReputation.sol:1120` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `_verifyRows` fait `continue` quand le client vaut 0 sans sauter les nE arêtes de la ligne. Un nœud adresse `0x02‖address(0)`, accepté par `_appendNodes` et ajoutable par n'importe qui sur un set ouvert, donne un client nul avec une ligne non vide : toutes les lignes suivantes sont relues au mauvais décalage, alors que `_rowLoop` (arithmétique, feuilles Merkle) lit les vraies.
- **Scénario** : Set ouvert Registry-verified : un certificat qui contient une ligne pour address(0) puis une ligne d'agent portant une arête absente du registre est accepté ; sans la ligne address(0), la même soumission échoue en `EdgeMismatch(1,0)`. `isTrusted` renvoie alors vrai pour un agent qui n'a reçu aucun avis (trustLow 0,148 WAD, MESURÉ, PoC forge `PocD`/`Exploit`).
- **Correctif** : Avancer `off` de nE·(W+6) (ou exiger nE = 0) avant le `continue`, refuser address(0) dans `_appendNodes`, exiger `off == rows.length` en fin de `_verifyRows` ; idéalement un seul décodage des lignes partagé avec `_rowLoop`.

#### 2. [L1] Après la désynchronisation K6, une ligne sans source portant des arêtes est inattaquable

`contracts/src/AnchoredReputation.sol:1817` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Même cause que K6, conséquence pire : la ligne d'un agent sans SRC mais avec des arêtes (interdite par la règle de forme, contrôlée seulement dans `_clientRare`, jamais atteint) est engagée, et aucune preuve ne l'atteint : `proveEdge` revert `BadProof(7)` (l.1817) et `proveWallet` revert `NothingToProve` tant que l'agentWallet reste à 0. Comme elle gonfle la masse, elle gagne aussi la voie rapide du remplacement.
- **Scénario** : Agent B sans wallet ; certificat avec la ligne address(0) puis la ligne de B sans SRC et l'arête fabriquée B→X : accepté, `isTrusted(X)` vrai, les deux preuves échouent. Le certificat honnête est refusé `NotBetter` (masse 0,5556 contre 0,7037 WAD, MESURÉ) et l'attaquant reprend la place après chaque fenêtre de rafraîchissement : X reste payable indéfiniment.
- **Correctif** : Corriger K6 ; en défense en profondeur, faire respecter « ligne d'agent sans SRC ⇒ nE = 0 » dans `_rowLoop` et dans `_verifyRows` lui-même.

### Haute (11)

#### 3. [K7] La garde « REFUSED first » se contourne en réencodant le certificat

`contracts/src/AnchoredReputation.sol:576` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : La garde compare les racines brutes (`vectorRoot`, `graphRoot`), or l'encodage n'est pas canonique : W = 4 accepté pour nCert ≤ 65 535, ligne vide d'un nœud sans masse, SPLUS égal à S⁺, empreintes non vérifiées des ancres et des agents sans masse, SRC à zéro sur une ligne d'ancre (K10). Un certificat déjà prouvé faux se resoumet sous d'autres racines et ses preuves sont effacées.
- **Scénario** : Titulaire prouvé dilué (eLow > 0, agent non trusted) : la resoumission identique octet pour octet est refusée, la même réencodée en W = 4 ou avec une ligne vide en plus est acceptée, eLow revient à 0 et l'agent redevient trusted, y compris par la voie rapide (MESURÉ, tests `FinderA`).
- **Correctif** : Rendre l'encodage canonique (W = 2 ssi nCert ≤ 65 535, refuser SPLUS = S⁺, refuser les lignes des nœuds sans masse, empreinte 0 pour ancres/agents sans masse, bits SRC testés) ou fonder la garde sur la sémantique (tant que le titulaire est prouvé, exiger une amélioration stricte).

#### 4. [E1] Un seul avis à tag long rend un couple illisible : soumission et preuves bloquées

`contracts/src/AnchoredReputation.sol:1600` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `_readFb` ne donne que `VIEW_CALL_GAS` (120 k) à `readFeedback`, qui recopie `tag1` et `tag2` sans limite de longueur (registre v2.0.0). Le client d'une arête engagée rend son propre couple illisible avec un avis à long `tag2` : toute soumission Registry-verified qui engage ce couple revert `RegistryUnreadable` (l.1134) et `proveEdge` aussi (l.1657).
- **Scénario** : Le wallet d'un agent massif a une arête engagée X→Y (par ex. un slash, jamais omissible) et poste un avis sur Y avec un `tag2` d'environ 13 ko (seuil MESURÉ entre 12 500 et 13 000 octets dans `submitCertificate`, 7,4 M gas pour l'écrire) : le certificat honnête est refusé à chaque tour, le set passe STALE après maxAge et tous les payeurs refusent. Le solveur n'implémente ni l'omission sous sPlus (arête positive) ni le retrait de ligne (arête négative).
- **Correctif** : Dans les chemins payants (`_verifyRows`, `proveEdge`), transmettre le gas restant (ou un plafond large) aux lectures du registre et garder `VIEW_CALL_GAS` pour les vues ; borner le coût total par une fenêtre de relecture engagée (voir EFF1).

#### 5. [TBL] Table des nœuds reconstruite depuis le calldata externe : un `addNodes` relayé arrête certificateur et watcher

`solver/certifier.py:314` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `chain_table` décode l'input de la transaction derrière chaque `NodesAdded` et lève si ce n'est pas un appel direct ; `addNodes` est ouvert à tous sur un set ouvert. Le watcher saute aussi (« undecodable ») tout certificat soumis via un contrat.
- **Scénario** : Un `addNodes` via Multicall3, un Safe, un compte 4337 ou un EOA 7702 : `RuntimeError cannot decode the transaction behind NodesAdded` à chaque tour (MESURÉ), plus aucun certificat ni preuve, set STALE. Coût : une transaction. L'adaptateur `demo/certify.py` lit déjà `nodeKeyAt`, pas les `main`.
- **Correctif** : Synchroniser la table par `nodeCount`/`nodeKeyAt` ; récupérer un `submitCertificate` relayé par trace d'appels.

#### 6. [STUCK] Titulaire prouvé puis registre remis à l'identique : le set reste mort

`solver/certifier.py:578` · **CONFIRMÉ** · chantier **04-bis (+02-bis)**

- **Constat** : Si le titulaire a été prouvé (eLowEff > 0) et que le registre revient exactement à son contenu, la recertification honnête est identique : `run_once` la saute même quand le set est STALE, `replacement_wait` lève au rafraîchissement, et la garde REFUSED-first du contrat (avant les clauses d'âge) la refuserait de toute façon, même après maxAge.
- **Scénario** : Trois transactions bon marché : l'owner d'un agent fait `setApprovalForAll(A)` (ou change son agentWallet), quelqu'un prouve (`proveEdge`/`proveWallet`), l'owner annule. Set ouvert STALE indéfiniment (MESURÉ, `B1Freeze.t.sol`, `stuck_modes.py`) ; set attesté bloqué jusqu'au rafraîchissement.
- **Correctif** : 04-bis : ne jamais sauter tant que le titulaire est prouvé ou STALE, et soumettre un certificat distinct valide si besoin. 02-bis : exempter un titulaire STALE de REFUSED-first quand les relectures passent.

#### 7. [THIRD] Le certificateur n'écoute pas le contrat : un certificat censuré par un tiers reste en place environ 22 h

`solver/certifier.py:678` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : La boucle ne se réveille que sur les events des deux registres ou sur l'âge du certificat courant, jamais sur `CertificateSubmitted`/`EdgeProven`/`RowVoided` : la réponse « re-remplacé aussitôt par l'honnête » sur laquelle compte ENCODING §5 n'a pas lieu.
- **Scénario** : Après minRefresh (600 blocs), un tiers soumet le point fixe exact d'un graphe censuré (vouches d'un rival omis, slash pardonné) : accepté par la fenêtre ; trust du rival 0,074 → 0 WAD (MESURÉ) ; le certificateur dort environ 268 000 blocs (environ 22 h, CALCULÉ à 0,302 s) alors que le certificat honnête serait accepté dans le même bloc.
- **Correctif** : Écouter les events du set (ou comparer `certificate(setId)` au dernier certificat soumis) et recalculer aussitôt.

#### 8. [L3] 257 avis négatifs d'une simple adresse bloquent toute recertification

`solver/ppr.py:331` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `certify()` applique `cap_row` à la ligne de CHAQUE nœud avant de connaître la masse, et `cap_row` lève au-delà de ROW_MAX arêtes négatives : une adresse sans agent (masse toujours nulle, ligne jamais fournie) suffit à faire lever chaque recalcul. Le saut des lignes sans masse existait avant le commit 04e7cf3.
- **Scénario** : N'importe quelle adresse poste 257 `slash` −100 (ou `review` −1) sur 257 agents : `ValueError row with 257 negative edges > ROW_MAX` (MESURÉ, `a/dos_rowmax.py`), le certificateur réessaie à l'infini, le set passe STALE après maxAge et tous les payeurs refusent. Sets ouverts comme attestés ; touche la démo (filtre avec `slash`).
- **Correctif** : Reporter le contrôle des négatifs après le calcul de masse (les négatifs ne changent pas t) et ne lever (ou tronquer) que pour une ligne massive.

#### 9. [W1] Watcher : dilution jugée arête par arête, jamais cumulée

`solver/watcher.py:133` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `audit()` teste chaque arête omise seule (`S⁺ + q > B⁺`) : plusieurs omissions positives qui tiennent chacune sous B⁺ mais le dépassent ensemble sont toutes « OMITTED_POSITIVE » non prouvables, alors que le contrat les facture par une chaîne de preuves. Le test par ligne a été remplacé au commit 9959ffb.
- **Scénario** : Le wallet de l'agent #1 recommande 10 agents à +5 000 ; un certificat ne garde que #1→#2 : 9 OMITTED_POSITIVE, rien de prouvé, t(#2) × 5 (MESURÉ, `wA/t1`), alors que la 2ᵉ preuve facturerait dec = 0,333 WAD à eLow. Sur un set ouvert, ce certificat entre par la fenêtre de rafraîchissement.
- **Correctif** : Décider la dilution par ligne (vrai B⁺ du client contre B⁺ engagé) et prouver toutes les omissions de la ligne en une chaîne d'amendements.

#### 10. [AMENDS] Watcher : la liste d'amendements n'est jamais reconstruite depuis la chaîne

`solver/watcher.py:224` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Chaque ligne repart de `amends = []` avec le poids de l'export, alors que le contrat authentifie une ligne amendée par `keccak(leaf ‖ amends)` avec le wNew réel : dès qu'une preuve a touché une ligne (tiers, soumetteur tricheur, redémarrage, wNew réel différent de l'export), toutes les preuves suivantes du watcher sur cette ligne revert `BadProof(5)`.
- **Scénario** : Griefing : le soumetteur omet une arête diluante D et une petite arête s, puis prouve lui-même s (presque gratuit) ; la preuve de D par le watcher revert `BadProof(5)`, la ligne est abandonnée et le certificat n'est plus jamais audité (test du dépôt `Verified.t.sol:302-304` qui vérifie exactement ce revert).
- **Correctif** : Reconstruire les amendements depuis les events `EdgeProven` du certNonce courant (contrôlés par `rowStateOf`) et chaîner avec le wNew de l'event.

#### 11. [SW2] Un `registerAnchorSet` avec alphaD ≥ 2^31 arrête l'indexeur sur les trois chaînes

`indexer/src/handlers/ancre.ts:50` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : `AnchorSetRegistered` écrit les uint32 alphaN/alphaD dans des colonnes `Int` (Int32 d'Envio, INTEGER Postgres, maximum 2^31 − 1), alors que `registerAnchorSet` est ouvert à tous et n'exige que 0 < alphaN < alphaD : l'écriture du lot échoue, Envio la traite comme fatale et la rejoue à chaque redémarrage.
- **Scénario** : N'importe qui enregistre sur le contrat configuré (gratuit sur testnet) un set valide avec alphaN = 1, alphaD = 3 000 000 000 : indexeur arrêté pour de bon (endpoint GraphQL, export du solveur, écran de démo). Latent tant que l'adresse configurée est le placeholder, exploitable dès le branchement prévu par le MUSTDO ; le store en mémoire des tests ne peut pas le voir (lecture du code d'Envio 3.12.1, Postgres non exécuté).
- **Correctif** : Déclarer alphaN/alphaD en `BigInt` (ou en chaîne) dans `schema.graphql`, et passer en revue les autres colonnes `Int` alimentées par des valeurs du contrat.

#### 12. [NUL] Les NUL de `tag1` : collision d'identifiants (arrêt) et tags fantômes

`indexer/src/handlers/reputation.ts:16` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : Sur une erreur Postgres liée à un NUL, Envio réessaie en retirant U+0000 de toutes les chaînes de l'entité, identifiant compris : « x » et « x\0 » donnent la même clé dans un seul upsert (erreur fatale), et un avis « vouch\0 » est stocké « vouch », exporté vers le solveur, engagé par le certificateur puis refusé par la relecture du contrat (EdgeMismatch à chaque tour).
- **Scénario** : (a) Deux avis « x » et « x\0 » dans une transaction : arrêt fatal à chaque redémarrage. (b) Un avis « vouch\0 » d'un client certifié : arête fantôme, certificats refusés, set STALE (fonction d'Envio rejouée, MESURÉ).
- **Correctif** : Clés et comparaisons par keccak256(tag1) comme le contrat ; stocker sans perte (hex) les tags contenant un NUL et ne jamais en faire un tag de filtre.

#### 13. [LONGTAG] Un `tag1` de plus de 2 704 octets arrête l'indexeur sur les trois chaînes

`indexer/src/handlers/reputation.ts:28` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : Le `tag1` brut entre dans `TripleLatest.id` (clé primaire) et dans `Feedback.triple` (index btree) ; au-delà de la limite btree de Postgres (2 704 octets, contenu incompressible), l'insertion échoue avec une erreur qu'Envio traite comme fatale pour tout le processus, et chaque redémarrage rejoue le même lot.
- **Scénario** : Un seul `giveFeedback` avec un tag1 d'environ 4 ko aléatoire sur Monad, le testnet gratuit ou Optimism : indexeur arrêté pour de bon (endpoint GraphQL, export du certificateur, écran de démo). Jugé sur la limite documentée de Postgres et le code d'Envio 3.12.1 (Postgres non disponible ici).
- **Correctif** : Ne jamais mettre le tag brut dans une clé ou un index : clé = keccak256(tag1) (le topic `indexedTag1` de l'event l'est déjà).

### Moyenne (29)

#### 14. [A1b] Nœuds parasites via `addNodes` ouvert : le set ouvert gèle (et un tiers fait monter nCert)

`contracts/src/AnchoredReputation.sol:506` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Sur un set ouvert, `addNodes` sans permission ajoute à une table append-only des entrées que chaque certificat doit couvrir dès que nCert les dépasse. Chaque nœud parasite sans masse coûte environ 3 975 gas par certificat (MESURÉ, k = 3, Registry-verified ; 1 608 en attesté), 10 à 40 fois le chiffre AM-R5.7 de GAS.md. Un tiers peut aussi renvoyer le titulaire complété de zéros pour faire monter nCert (voie rapide acceptée), ce qui efface aussi les preuves (famille K7).
- **Scénario** : Le certificateur de référence certifie toute la table (`align`) : au-delà d'environ 2 100 à 7 500 nœuds parasites (10 à 35 MON, CALCULÉ à 102 gwei), aucun certificat ne tient sous la limite par transaction, le set est STALE pour de bon. Risque connu et accepté pour la démo (soumetteurs listés, tour 7), mais chiffré faux dans GAS.md, et il tue aussi les rafraîchissements, pas seulement la croissance.
- **Correctif** : Implémenter D23 (zone de transit : un nœud n'entre dans la table que par un certificat accepté qui lui donne de la masse) ou une caution par nœud ajouté ; corriger GAS.md AM-R5.7 et le texte Security de l'ERC ; côté 04-bis, ne pas étendre nCert au-delà du support du certificateur.

#### 15. [K10] Règle de forme testée sur la valeur décodée de SRC, pas sur le bit H_SRC

`contracts/src/AnchoredReputation.sol:1179` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `_clientRare` ne refuse qu'un wallet NON NUL : une ligne d'ancre ou d'adresse avec H_SRC et 20 octets à zéro passe, une ligne d'adresse peut servir d'alias à une autre (comparaison brute 0 = 0), une ligne d'agent avec H_SRC et source nulle est lue comme « sans source ». L'arithmétique ne change pas, mais les miroirs hors chaîne divergent et graphRoot devient malléable.
- **Scénario** : L'indexeur jette `EncodingError` sur l'ancre avec SRC nul et classe le certificat UNDECODABLE (pas d'audit) ; l'audit et le watcher émettent des écarts SOURCE/SHAPE dont la preuve revert `NothingToProve`. Et après un `proveEdge`, la même soumission avec la seule ligne d'ancre réécrite ainsi est acceptée et remet eLowEff à 0 (MESURÉ, `V4Verify.t.sol`) : c'est un des réencodages de K7.
- **Correctif** : Tester les bits : lignes d'ancre/adresse ⇒ revert si H_SRC ou H_VIA_OWNER ; ligne d'agent avec H_SRC ⇒ SRC non nul ; ALIAS seulement entre nœuds agents à SRC non nul.

#### 16. [EFF1] `_pairEdge` relit tout l'historique d'un couple : le client d'une ligne fixe le coût de chaque soumission

`contracts/src/AnchoredReputation.sol:1538` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : La seule sortie anticipée du balayage exige un avis vivant sous CHAQUE tag d'endorsement du filtre, ce qu'aucun couple réel n'a ; chaque avis du couple coûte environ 12,9 k gas à chaque soumission Registry-verified et à chaque preuve. La borne MAX_SCAN a été retirée au commit b0aa1ad. Pour une arête négative, le certificateur honnête n'a aucune échappatoire.
- **Scénario** : Le wallet d'un agent massif slashe Y une fois puis poste H avis « uptime » sur Y : 454 k gas sans avis supplémentaire, 5,6 M avec 400 (MESURÉ) ; environ 1 900 avis font dépasser le plafond de 25 M du certificateur sur un petit certificat, 640 pour le certificat de démo (CALCULÉ). `run_once` lève alors « gas limit > cap » à chaque tour : set STALE, payeurs bloqués. Un client massif honnête qui note après chaque interaction y arrive aussi.
- **Correctif** : Engager dans la politique une fenêtre de relecture (D14 sur les scanMax derniers avis du couple, même règle dans graph.py, rules.ts et audit.ts) ; en attendant, laisser le solveur omettre les couples positifs coûteux sous sPlus et signaler les négatifs au lieu de lever.

#### 17. [K8] Lignes à sPlus déclaré : `proveEdge` sous-facture eUp quand une arête positive engagée tombe

`contracts/src/AnchoredReputation.sol:1662` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Avec un sPlus déclaré, `proveEdge` garde le plancher G = max(GRID, sPlus) : quand une arête positive engagée disparaît (révocation, avis plus récent), la renormalisation du reste de la vraie ligne n'est jamais facturée à eUp. C'est la formule d'ENCODING §7.1 elle-même ; la borne supérieure de PROOFS L6 tombe pour le vrai graphe.
- **Scénario** : k = 1, α = 1/3 : ligne déclarée sPlus = 20 000, engagée {P : 10 000, B : 5 000}, C : 5 000 omise ; le client révoque P. Une fois tous les faits prouvés, eUp reste à 0,111 WAD alors que l'écart réel vers le haut vaut 0,333 WAD (MESURÉ, `V1aBound.t.sol`) : distrustUp n'est plus une borne et le test ρ peut passer à tort.
- **Correctif** : Calculer le côté positif sur la vraie somme déclarée corrigée des amendements (S = sDecl + Σ(wn⁺ − wc⁺), G = GRID) et ne garder le prépayé que pour la masse omise à son poids d'origine ; mettre à jour ENCODING §7.1 et PROOFS L6.

#### 18. [A2b] Lignes à sPlus déclaré : une arête positive nouvelle ne facture rien à eLow (côté confiance)

`contracts/src/AnchoredReputation.sol:1663` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Pendant de K8 côté confiance : sur une ligne à sPlus > S0, une arête positive qui apparaît ou augmente après le certificat donne dec⁺ = 0 (B reste à max(GRID, sPlus)), alors que la vraie somme sPlus + δ dilue toutes les entrées engagées. trustLow reste au-dessus de t* et D36 (eLowEff > eLowMax ⇒ STALE) ne se déclenche jamais.
- **Scénario** : Politique de démo (θ 1e15, ρ 1/2, eLowMax 1e16) : la ligne d'ancre engage A→X avec sPlus = 10 200 ; A recommande ensuite Z. `proveEdge(Z)` passe mais eLow reste 0 alors que L6 exige 0,0126 WAD > eLowMax : le set devrait être STALE, `assess(X)` reste OK et trusted (trustLow 0,2179 > t* 0,2137, MESURÉ, `A2.t.sol`). Le watcher classe ces arêtes « OMITTED_POSITIVE » sans effet et ne prouve rien.
- **Correctif** : Tarifer le côté positif sur la vraie somme max(GRID, sPlus + (S − S0)) avant et après (corrige aussi K8), et engager la liste (ou le hash) des arêtes omises déclarées pour que la preuve d'une omission déclarée consomme le prépayé sans surfacturer.

#### 19. [ALT8] Arrondis prépayé (bas) contre preuves (haut) : des preuves d'omissions honnêtes marquent le titulaire « prouvé »

`contracts/src/AnchoredReputation.sol:1674` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Le reste prépayé d'une omission déclarée est arrondi vers le bas, chaque preuve vers le haut : prouver les omissions honnêtes d'une ligne à sPlus déclaré facture quelques wei à eUp, `eEff > eSubmitted` rend le titulaire « prouvé », et la garde REFUSED-first refuse ensuite la recertification identique honnête, même après maxAge.
- **Scénario** : Ligne X : Y1 engagée, Y2 et Y3 omises sous sPlus = 11 600. Deux `proveEdge` honnêtes facturent 2 wei, `quality().proven` passe à vrai ; la recertification identique revert `NotBetter` à 60 blocs et à 1 001 blocs alors que le set est déjà STALE (MESURÉ, `V5aPrepaid.t.sol`). Un griefer peut répéter sur chaque nouveau certificat.
- **Correctif** : Facturer l'omission déclarée une fois par ligne en entiers exacts (cumul du poids réintroduit, ceil au-delà de sPlus − S0), ou ne marquer « prouvé » que si une preuve facture au-delà de la marge déclarée.

#### 20. [A1d] `newNodes` ajoutés au nodeCount du moment : un `addNodes` intercalé fait échouer le certificat

`contracts/src/AnchoredReputation.sol:503` · **CONFIRMÉ** · chantier **04-bis (+02-bis)**

- **Constat** : `submitCertificate` ajoute `newNodes` à la position courante de la table, alors que les lignes et vecteurs utilisent des indices calculés hors chaîne. Un `addNodes` de tiers (ou un certificat concurrent portant les mêmes nœuds) inclus entre l'estimation et l'exécution décale les indices : `EdgeMismatch` ou `NodeExists`, et Monad facture quand même toute la gas limit.
- **Scénario** : Set ouvert, mise à jour de croissance avec un nouvel agent en ligne (cas « small » du certificateur, jusqu'à 100 nœuds) : un griefer paie environ 93 k gas (MESURÉ) pour un `addNodes` intercalé, le certificateur perd sa limite (environ 1,6 MON pour une mise à jour de la taille de la démo, CALCULÉ) et recommence au tour suivant. Deux certificateurs honnêtes du même set produisent le même gaspillage.
- **Correctif** : 04-bis : sur un set ouvert, ne jamais porter de nœuds en ligne (addNodes dans sa propre transaction, relire la table, soumettre avec `newNodes` vide). 02-bis : supprimer `newNodes` en ligne sur les sets ouverts ou exiger un indice de départ attendu.

#### 21. [NODES600] Lots `addNodes` de 600 nœuds : au-dessus du plafond de 25 M du certificateur

`solver/certifier.py:64` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `add_nodes_per_tx = 600` repose sur le chiffre v0 (29,1 k/nœud) ; en v1, `addNodes` coûte environ 45,9 k/nœud (GAS.md, MESURÉ 01/10) : tout lot de 507 nœuds ou plus dépasse le plafond et `run_once` lève avant le premier envoi, à chaque tour.
- **Scénario** : 506 nœuds : limite 24 984 760, passe ; 507 : 25 033 936, refusé ; 600 : 29 620 829 (MESURÉ, forge 06/10). Un premier certificat qui ajoute au moins 507 nœuds (gros set attesté) ne passe jamais avec la politique par défaut ; `simulate.py` masque le défaut en forçant 500.
- **Correctif** : Dimensionner les lots sur le coût v1 et le plafond (≤ 450, ou couper en deux un lot trop gros) et dater les commentaires.

#### 22. [LOGS] `eth_getLogs` non découpé depuis le bloc 0 : certificateur (`--send`) et watcher inutilisables sur les RPC publics

`solver/certifier.py:258` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `Chain.logs` envoie une seule requête (`cast logs` sans `--query-size`) et la table des nœuds se synchronise depuis le bloc 0 : sur `rpc.monad.xyz` et `testnet-rpc.monad.xyz` (100 blocs maximum, CLAUDE.md §7), les deux services échouent dès le premier tour et réessaient la même plage à l'infini, avec un message d'erreur vide (`cast --json` écrit l'erreur sur stdout).
- **Scénario** : Réponse `-32614 eth_getLogs is limited to a 100 range` sur les deux RPC publics au-delà de 100 blocs (MESURÉ 06/10) ; en mode sec la table n'est jamais synchronisée, d'où des essais à sec qui semblent sains.
- **Correctif** : Découper chaque getLogs en fenêtres de 100 blocs, démarrer la synchronisation au bloc d'enregistrement du set (ou lire `nodeKeyAt`), inclure stdout dans `ChainError`.

#### 23. [CHKREG] Personne n'appelle `checkRegistry` : une mise à jour du registre ne lève jamais REGISTRY_CHANGED

`solver/certifier.py:390` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `Upgraded` est un déclencheur « pour REGISTRY_CHANGED », mais aucun composant hors chaîne n'appelle `checkRegistry` et le recalcul identique est sauté : après une mise à jour, le set reste OK sur un certificat vérifié sous l'ancienne implémentation (contre le SHOULD de l'ERC et le MUST du CR). Si un tiers l'appelle, le set est mort jusqu'au rafraîchissement car le drapeau n'est pas un déclencheur.
- **Scénario** : L'EOA unique met à jour un proxy vers la v2.1.0 prête en amont : `skip_identical`, `assess` continue de répondre OK ; un opérateur appelle ensuite `checkRegistry` : REGISTRY_CHANGED pour tous les agents, le certificateur ne réagit pas avant environ 22 h (MESURÉ, `no_retrigger.py`).
- **Correctif** : Sur `Upgraded`, appeler `checkRegistry` et recertifier ; traiter `oc.registry_changed`, déjà lu à chaque tour, comme un déclencheur.

#### 24. [GASCAP] Aucun repli quand le certificat honnête dépasse le plafond de gas

`solver/certifier.py:589` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `run_once` lève simplement : `compute()` ne tronque ni n'omet rien (le `truncate_below` de `certify` est inutilisé) alors que GAS.md impose au certificateur d'omettre les arêtes coûteuses avec B⁺ déclaré.
- **Scénario** : Un agent attaquant avec de la masse gonfle l'historique d'un couple engagé (environ 1 800 avis, environ 49 MON à 102 gwei, CALCULÉ) : la soumission dépasse 25 M à chaque tour, le set ne se recertifie plus.
- **Correctif** : Estimer le coût de relecture par couple et, au-delà du plafond, omettre les couples positifs coûteux sous sPlus ou retirer la ligne (marge de troncature) puis recalculer.

#### 25. [DIES] Les boucles « never die » meurent sur une seule erreur passagère

`solver/certifier.py:676` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `certifier.main` appelle `chain.block_number()` hors du try ; `watcher.main` aussi, et relit l'export hors du try alors que `from_indexer.export` réécrit les fichiers sur place. `watcher --once` ne rend jamais la main après un tour en échec.
- **Scénario** : Un 429 sur `cast block-number` arrête le processus ; une lecture d'export à moitié écrit lève `JSONDecodeError` (1 216 lectures déchirées sur 1 457 pendant une réécriture continue, MESURÉ). Pas de superviseur dans le dépôt ; la démo n'est pas touchée, le surveillant prévu pendant le jugement si.
- **Correctif** : Tout mettre dans le try, écrire l'export en fichier temporaire + `os.replace`, et faire rendre un code non nul à `--once`.

#### 26. [STALE] Export `--data` en retard sur les events : l'event est consommé par un recalcul obsolète

`solver/certifier.py:682` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Le bloc de l'export (`identity.json`, feedbacks) n'est jamais comparé à celui des events : sur un export en retard, le recalcul reproduit le titulaire (`skip_identical`), `frm` avance, et le rattrapage de l'export ne déclenche plus rien.
- **Scénario** : Révocation vue par le RPC au bloc E, export indexeur à E − 50 : `skip_identical`, puis plus rien jusqu'au rafraîchissement (environ 22 h) ; le watcher ne prouve pas non plus (audit unique).
- **Correctif** : Ne consommer les events que jusqu'au bloc de l'export (garder la fenêtre tant qu'il est en retard), ou exporter à la tête avant de recalculer.

#### 27. [DEFER] Soumission différée par la règle de remplacement : jamais retentée

`solver/certifier.py:685` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Quand `replacement_wait > 0`, `run_once` journalise et rend la main, `main` consomme la fenêtre d'events et rien ne reprogramme la tentative.
- **Scénario** : Une ancre révoque une recommandation moins de 600 blocs après le dernier certificat : attente de 516 blocs journalisée (MESURÉ), puis plus aucun recalcul avant un autre event pertinent ou le rafraîchissement (environ 22 h) : la recommandation révoquée reste certifiée.
- **Correctif** : Garder un recalcul en attente et le relancer à `block + waitBlocks`.

#### 28. [W7] Watcher : une arête négative surévaluée (w < q < 0) n'est jamais signalée

`solver/watcher.py:121` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : La classification n'a que INFLATED, SIGN_FLIP et DEFLATED : un slash engagé trop négatif gonfle B⁻ et divise la méfiance des arêtes négatives voisines, alors que `proveEdge` l'accepte et facture à eUp ; l'audit de l'indexeur, lui, le signale.
- **Scénario** : Registre : #2 à −10 000, #3 à −100 ; engagé : #3 à −10 000 : d(#2) passe de 0,110 à 0,056 WAD (MESURÉ, `wA/t3`), `audit()` rend [] et #2 peut passer le test ρ.
- **Correctif** : Ajouter le cas `w < q < 0` (OVERSTATED_NEG) prouvé par `proveEdge`.

#### 29. [W6] Watcher : `still_dilutes` compare au B⁺ engagé, pas au budget courant du contrat

`solver/watcher.py:176` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Après une preuve INFLATED avec 0 < q < w, la somme amendée passe sous B0 et une omission que le contrat facturerait encore est sautée : eLow reste sous la surestimation réelle et trustLow peut dépasser la vraie confiance.
- **Scénario** : Ligne engagée #2 +10 000 (gonflé), #3 +5 000, #4 omis : après la seule preuve INFLATED, trustLow(#2) = 0,0519 > vraie confiance 0,0476 (MESURÉ au point fixe exact, `a6/w6_cycle.py`) ; prouver aussi l'omission couvrirait l'écart. L'objection de C1 est réfutée par ce calcul.
- **Correctif** : Reproduire `_side` : prouver dès que dec > 0 avec B = max(max(GRID, sPlus), S_amendée).

#### 30. [SWALLOW] Watcher : une erreur RPC passagère est classée « undecodable » pour toujours

`solver/watcher.py:213` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Le `except Exception` autour de `decode_submission` (et de `prove`) ne distingue pas une erreur de transport d'un input vraiment indécodable : le tour se termine normalement et `frm` avance.
- **Scénario** : Délai dépassé ou 5xx sur `cast tx` au tour qui voit un certificat diluant : « undecodable », fenêtre avancée, certificat jamais audité (MESURÉ, fausse chaîne).
- **Correctif** : Laisser remonter les `ChainError` de transport pour garder la fenêtre ; réserver « undecodable » à un échec de décodage d'un input récupéré.

#### 31. [BREAK] Watcher : la boucle de preuves d'une ligne s'arrête au premier échec

`solver/watcher.py:236` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Un `NothingToProve` sur un faux positif (export en retard) arrête la ligne, alors qu'une preuve en échec ne change ni l'état on-chain ni les amendements : les vraies dilutions qui suivent sont abandonnées pour de bon.
- **Scénario** : FABRICATED périmé (arête créée après l'export) trié avant une vraie DILUTION : `proofs = [FABRICATED error NothingToProve]`, la dilution n'est jamais envoyée (MESURÉ, mock).
- **Correctif** : Sur un revert qui laisse la ligne inchangée, journaliser et continuer ; ne s'arrêter que sur BadProof(5)/(23) ou une transaction envoyée en échec.

#### 32. [ONCE] Watcher : chaque certificat n'est audité qu'une fois

`solver/watcher.py:306` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : La boucle n'audite que les certificats dont l'event tombe dans la fenêtre du tour : révocations, avis adoucis, changements de contrôleur ou de wallet après la soumission ne sont jamais prouvés, et aucun code hors chaîne ne construit `proveTransfer`.
- **Scénario** : Certificat honnête audité propre, puis le client d'une ligne révoque une recommandation : aucune preuve, eLow jamais crédité, le certificat honnête plus léger attend la fenêtre (600 blocs par défaut, jusqu'à maxAge si minRefresh = maxAge) pendant que les payeurs honorent l'arête révoquée.
- **Correctif** : Réauditer à chaque tour le certificat COURANT contre des données fraîches (amendements reconstruits) et ajouter `proveTransfer` pour les sets non stricts.

#### 33. [OUTERCALL] Nouveaux handlers : un `addNodes` relayé laisse un trou définitif dans la table de l'indexeur

`indexer/src/handlers/ancre.ts:76` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : `ancre.ts`/`calls.ts` ne font confiance qu'à l'input externe (tx.to = contrat) : un `addNodes` (ouvert à tous sur un set ouvert) ou un `submitCertificate` avec `newNodes` envoyé via un contrat laisse `nodesComplete = false` à jamais, donc tout certificat suivant qui couvre le trou est NODES_MISSING et n'est jamais audité ; un set enregistré via un Safe reste UNKNOWN_SET.
- **Scénario** : Un `Multicall3.aggregate([addNodes(setId, …)])` (quelques centimes) aveugle pour de bon l'audit en direct du set (test sur le code actuel : [[4, NODES_MISSING], [5, NODES_MISSING]]) ; le même appel arrête aussi le certificateur (TBL).
- **Correctif** : Combler les trous par `nodeKeyAt(setId, i)` via un Effect Envio (clés immuables) et accepter les paramètres de set de toute source quand `computeSetId(params) == setId`.

#### 34. [REGCB] `register()` émet le wallet après le callback ERC-721 : l'indexeur garde un wallet que le registre n'a plus

`indexer/src/handlers/identity.ts:47` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : Le registre v2.0.0 écrit agentWallet avant `_safeMint` mais émet `MetadataSet(agentWallet)` après `onERC721Received` : un changement de wallet fait dans le callback (unset, set, transfert) est écrasé dans l'indexeur (et dans le rejeu de graph.py) par l'event d'enregistrement.
- **Scénario** : Confirmé sur un fork du registre réel du testnet : `getAgentWallet` = 0, indexeur = C. Dès que l'agent a de la masse, chaque `submitCertificate` Registry-verified revert `EdgeMismatch(row, 256)` (AnchoredReputation.sol:1153) : set STALE au gré de l'attaquant.
- **Correctif** : Ignorer le `MetadataSet` qui suit `Registered` dans la même transaction si un event de wallet ou de transfert du même agent est intervenu après le mint ; même règle dans `graph.py`.

#### 35. [SW1] Audit en direct : une dilution est signalée sur la mauvaise arête, et la vraie preuve ne ferme rien

`indexer/src/lib/audit.ts:124` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : `audit.ts:124` classe INFLATED, avec la preuve `proveEdge`, les arêtes SŒURS dont la part monte quand une arête positive est omise, alors que `proveEdge` sur elles revert `NothingToProve` (poids engagé = poids du registre) ; l'arête omise, seule prouvable (que `watcher.py` signale), n'apparaît jamais. `remedy()` (`ancre.ts:164-165`) ne ferme un écart que sur le couple prouvé : le vrai `EdgeProven(u, X)` ne ferme rien et SetHealth reste DISCREPANCY jusqu'au certificat suivant.
- **Scénario** : Set ouvert : W1 recommande #2 et #3 ; le certificat n'engage que l'arête vers #2. L'audit donne [INFLATED, u 2, agent 2, proveEdge] ; `proveEdge(2, #2)` revert, la preuve utile `proveEdge(2, #3)` passe mais l'écart reste ouvert (test sur le code actuel). Le vecteur normatif `violations/dilution.json` est attendu ainsi par `ancre.real.test.ts:75`. Même racine : sur une ligne SOURCE/UNKNOWN_AGENT, les écarts d'arête sont étiquetés `proveEdge` qui revert `BadProof(25)`.
- **Correctif** : Signaler la dilution sur l'arête omise ou dégonflée (DILUTION/DEFLATED, comme le watcher) avec la bonne preuve, et faire fermer par `remedy()` les écarts d'une ligne quand un `EdgeProven` de cette ligne corrige la dilution.

#### 36. [K15] Flux x402 « upfront » : une réponse non-2xx avec `PAYMENT-RESPONSE success:true` est annoncée refusée

`plugin/src/lib/flows.ts:249` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `flows.ts:249` exige `res.ok` en plus de `success === true`. En flux upfront (accepté pour exact/eip3009 en @x402 2.27), le serveur règle avant le handler et renvoie un non-2xx avec un PAYMENT-RESPONSE réussi si le handler échoue : le plugin dit REFUSED/« Not paid ». Même défaut dans override.ts:151.
- **Scénario** : Reproduit de bout en bout avec @x402/express 2.27.0 en upfront : règlement fait, HTTP 500 + PAYMENT-RESPONSE success, plugin REFUSED/SETTLEMENT_FAILED avec note d'override : l'humain peut payer une seconde fois.
- **Correctif** : Traiter `success:true` avec un hash comme PAID quel que soit le statut HTTP (et lire `authorizationState`, voir A4a).

#### 37. [A4a] Après un paiement signé, toute réponse non-2xx sans preuve est annoncée « non payé »

`plugin/src/lib/flows.ts:269` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `payFlow` décide sur le seul statut HTTP : une réponse non-2xx sans `PAYMENT-RESPONSE success:true` (y compris le `settlement_pending` de x402 2.27 qui porte un hash diffusé) donne REFUSED, SETTLEMENT_FAILED « Not paid », note d'override et journal `settlement_refused`, alors que le transfert a pu être miné. Le plugin ne lit jamais `USDC.authorizationState(payer, nonce)`, que le contrat utilise pourtant.
- **Scénario** : Reproduit avec un vrai serveur `@x402/express`/`@x402/core` 2.27.0 : facilitateur qui renvoie `settlement_pending` avec un hash, facilitateur en délai dépassé après diffusion, proxy qui renvoie 504 après règlement. L'humain lit « non payé » et peut repayer après validBefore. Distinct de K15.
- **Correctif** : Après une réponse non-2xx, lire `authorizationState(payer, nonce)` (et le reçu si un hash est fourni) : PAID si le nonce est consommé, sinon UNKNOWN avec `liveAuthorization` ; même chose dans override.ts:159.

#### 38. [K21] `payer status` ne bannit que le wallet sélectionné, l'override bannit tous les wallets de l'hôte

`plugin/src/lib/flows.ts:319` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `statusFlow.isHuman` (flows.ts:319) exclut le payeur, les opérateurs et le seul wallet sélectionné ; `override` exclut toutes les adresses du wallet hôte. Les deux règles divergent déjà.
- **Scénario** : L'hôte gère A (sélectionné, opérateur) et B ; owner = treasury = B : `payer status` coche « owner and treasury are the human » alors que l'agent peut basculer sur B et appeler setPolicy/setOperator/sweep (reproduit sur `dist` avec des stubs). Même défaut pour la vérification « pas d'USDC sur l'Agent Wallet ».
- **Correctif** : Passer `allWalletAddresses(snapshot)` à `statusFlow` et partager un seul helper `humanSigners()` avec `overrideFlow`.

#### 39. [M4] L'override « humain » se décide sur un payeur et un RPC choisis par l'appelant

`plugin/src/lib/override.ts:78` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : Le seul contrôle qui rend l'override humain (signataire = owner ou treasury du payeur, pas un opérateur) lit ces adresses sur le payeur de `--payer`/`ANCRE_PAYER`, via le RPC de `--rpc-url`/`ANCRE_RPC_URL` : un agent qui lance l'override dans un pty avec un faux RPC (ou un payeur qu'il a déployé) fait accepter sa propre clé financée comme « l'humain ».
- **Scénario** : Faux RPC qui répond owner = treasury = K : la page de signature est pilotée sans navigateur, résultat `OVERRIDE_PAID human=K`, journalisé comme override humain (MESURÉ, PoC sur build frais). Aucun fonds du payeur ni de l'humain ne bouge, mais la promesse du README (« any freshly funded key is refused ») et D47 tombent.
- **Correctif** : Lire owner/treasury/opérateurs uniquement via `ctx.publicClient(cfg.chainId)` (pas de `--rpc-url` pour cette commande) et prendre le payeur d'une valeur épinglée par l'humain ; reformuler le README.

#### 40. [M3] `ancreGuard` (garde SDK x402) ignore réseau, schéma, actif et montant

`plugin/src/lib/x402-guard.ts:40` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : La garde côté client ne vérifie que `agentWallet(agentId) == payTo` et `isTrusted` : elle approuve une offre sur n'importe quelle chaîne (le README l'enregistre pour `eip155:*`), en n'importe quel jeton, avec n'importe quel plafond upto, et n'a pas de contrôle de wallet nul. Les règles de `selectOffer` n'existent que sur le chemin CLI.
- **Scénario** : Offres sur eip155:8453, eip155:1 ou solana, schéma upto, actif quelconque, montant 1e9 : toutes ALLOWED sur la base du verdict lu sur Monad (reproduit par cinq agents, `e/guard_net.mjs`). Sur Base, l'adresse `payTo` d'un portefeuille contrat peut appartenir à quelqu'un d'autre.
- **Correctif** : Un seul prédicat d'offre partagé avec `selectOffer` (exact, réseau = chaîne d'ANCRE, USDC de cette chaîne, domaine FiatToken, plafonds) et refus d'un agentWallet nul.

#### 41. [ARGV] Calldata passé à `cast` en argument de ligne de commande : E2BIG sous Linux

`solver/certifier.py:223` · **PLAUSIBLE** · chantier **04-bis**

- **Constat** : `Chain._run` et `Chain.decode` passent les blobs entiers en argv ; sous Linux un argument de plus de 131 072 octets fait lever `OSError E2BIG` avant tout appel RPC.
- **Scénario** : Certificat attesté de la taille du scénario D (1 237 nœuds) : input de 179 146 caractères (MESURÉ avec l'encodeur actuel) ; le watcher le classe « undecodable », la synchronisation de table peut se bloquer, et au-delà d'environ 4 100 arêtes le certificateur ne peut même plus estimer. Non atteignable sur macOS ni en Registry-verified ; non testé sous Linux (PLAUSIBLE).
- **Correctif** : Ne jamais mettre un blob en argv : `cast decode-calldata --file`, `eth_estimateGas`/`eth_sendRawTransaction` par stdin ou JSON-RPC direct.

#### 42. [HEADREG] Recul de la tête ou bloc spéculatif abandonné : « node table gap » à vie

`solver/certifier.py:538` · **PLAUSIBLE** · chantier **04-bis**

- **Constat** : `Certifier.table` et `watcher.main` enregistrent `head` comme point de synchronisation sans condition et ne vident jamais le cache après un échec : toute désynchronisation transforme chaque tour suivant en `RuntimeError node table gap` jusqu'au redémarrage.
- **Scénario** : eth_blockNumber plus bas qu'au tour précédent (backend en retard) ou `NodesAdded` lu sur un bloc `latest` (proposé, révocable sur Monad) puis abandonné : blocage reproduit avec le vrai code ; déclencheur non observé (120 lectures monotones, MESURÉ 06/10).
- **Correctif** : Synchroniser jusqu'à `finalized`, ne jamais faire reculer le point de synchronisation, vider le cache sur un trou (ou lire `nodeKeyAt`).

### Faible (32)

#### 43. [K9] `registryChanged` saute aussi la garde REFUSED-first

`contracts/src/AnchoredReputation.sol:572` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : La garde se trouve dans le bloc `if (... && !s.registryChanged && ...)` : une fois le drapeau levé, la resoumission identique d'un certificat prouvé faux est acceptée, alors qu'ENCODING §5 applique REFUSED-first avant toutes les clauses d'acceptation.
- **Scénario** : Titulaire prouvé dilué, puis `checkRegistry` lève le drapeau après une mise à jour du registre : la resoumission identique est acceptée et efface les preuves (MESURÉ, test `FinderA`). Effet propre marginal, K7 suffit déjà à contourner la garde.
- **Correctif** : Sortir REFUSED-first du bloc `!registryChanged` (comme le dit §5) ; c'est la correction de K7 qui ferme vraiment le trou.

#### 44. [A1c] Règle de remplacement : croissance honnête refusée avec un sPlus déclaré (jusqu'à maxAge)

`contracts/src/AnchoredReputation.sol:578` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : (a) Une croissance qui renormalise une ligne fait baisser la masse ou D de la mise à jour honnête, refusée jusqu'à minRefresh : c'est la voie « baisse » prévue (une preuve débloque), seule la phrase « graphe qui grandit : certifié sans attente » des rapports est trop large. (b) Défaut réel mais latent : avec un sPlus déclaré, q contient une marge proportionnelle à la masse de la ligne, donc une croissance honnête fait monter q et les deux voies la refusent jusqu'à maxAge ; le commentaire l.557 « q = 0 quelle que soit la taille du graphe » est faux.
- **Scénario** : (b) k = 1, ligne X déclarée sPlus = 20 000 : un nouvel avis honnête Y→X fait passer la masse de 0,6296 à 0,7143 WAD mais q de 0,2222 à 0,2857 : `NotBetter` même après minRefresh, accepté seulement après maxAge (environ 24 h, MESURÉ par test). Le solveur ne déclare un sPlus que pour une ligne de plus de 256 arêtes positives : aucune aujourd'hui sur le mainnet.
- **Correctif** : (b) Comparer les marges par unité de masse (par ex. qNew·mCur ≤ qCur·mNew) ou exempter une marge dont la part omise est inchangée, et corriger le commentaire l.557 ; (a) documentation seulement.

#### 45. [K29] `dryRun` sans `newNodes` : inutilisable pour un certificat qui ajoute ses nœuds en ligne

`contracts/src/AnchoredReputation.sol:599` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `dryRun` vérifie nCert contre le nodeCount courant et n'accepte pas de `newNodes` : il revert `BadNCert` sur le cas standard « petit premier certificat » que `submitCertificate` accepte.
- **Scénario** : Set neuf (nodeCount = k) : `dryRun(setId, 4, …)` revert `BadNCert`, la soumission avec 3 nœuds en ligne passe (MESURÉ). Le certificateur du dépôt n'appelle jamais `dryRun` (il estime la transaction complète) : impact limité aux outils tiers.
- **Correctif** : Donner un argument `newNodes` à `dryRun` (nCert borné par nodeCount + entrées) ou documenter qu'il faut d'abord ajouter les nœuds.

#### 46. [K12] `dryRun` ne fait que l'arithmétique

`contracts/src/AnchoredReputation.sol:601` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `dryRun` exécute seulement `_verifyPass` : il saute la règle de forme (qui ne lit pas le registre) et la borne 2^63 des empreintes, et renvoie donc eUp/eEff/graphRoot pour des certificats que `submitCertificate` refuse.
- **Scénario** : Ligne d'ancre portant un wallet, arête vers une ancre, empreinte = 2^63 : `dryRun` répond, la soumission revert (MESURÉ). Aucun outil du dépôt n'appelle `dryRun` (le certificateur estime `submitCertificate` lui-même) : seul un outil tiers qui s'y fie obtient un faux OK.
- **Correctif** : Appeler aussi `_verifyRows(..., reads = false)` et contrôler les empreintes < 2^63 dans `dryRun`, ou le documenter comme purement arithmétique.

#### 47. [K11] `_verifyOwners` ne vérifie ni les ancres ni les agents sans masse

`contracts/src/AnchoredReputation.sol:1187` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : La boucle commence à i = k et ne contrôle que les agents massifs : l'empreinte d'une ancre n'est jamais exigée nulle et un agent sans masse peut porter n'importe quelle empreinte, contrairement à ENCODING §3.1/§3.4. N'importe qui peut ensuite faire flaguer par `proveTransfer` un agent sans masse qui n'a jamais changé d'owner.
- **Scénario** : Un tiers resoumet le même certificat avec des empreintes arbitraires (masse, q, D inchangés : accepté), puis `proveTransfer(102)` réussit et `assess` renvoie TRANSFERRED pour un agent jamais transféré (MESURÉ). L'agent n'est payable dans aucun cas : seul le motif affiché est faux ; l'empreinte arbitraire nourrit aussi la malléabilité de K7.
- **Correctif** : Vérifier aussi i < k (empreinte 0) et soit toutes les empreintes d'agents certifiés, soit ignorer les nœuds sans masse dans `proveTransfer` et dans le statut TRANSFERRED.

#### 48. [K13] Contrôle de transfert strict conditionné à trust ≠ 0 au lieu de « masse > 0 »

`contracts/src/AnchoredReputation.sol:1421` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Le `ownerOf` en direct (D35) ne tourne que si la somme pondérée arrondie `x.trust` est non nulle, alors qu'ENCODING §3.1/§6 dit « agent de masse > 0 ».
- **Scénario** : k = 2, λ = 0,5/0,5, t = 1 wei : trust = 0 avec une masse > 0 ; après transfert, `assess` renvoie OK au lieu de TRANSFERRED (MESURÉ). L'agent n'est jamais trusted et le payeur répond NO_WALLET : seul le statut est faux.
- **Correctif** : Conditionner sur la masse (OU des couloirs t déjà chargés) ou corriger ENCODING §3.1/§6 en « trust > 0 ».

#### 49. [MSG] Message d'erreur du plafond de gas : chiffre v0 (« 12 k arêtes ») environ 20 fois trop haut

`solver/certifier.py:591` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Le message cite « an update breaks around 12 k edges at k = 3 », tiré de l'historique v0 de GAS.md sans date ni étiquette ; pour un set Registry-verified le chiffre actuel est d'environ 630 arêtes sous 30 M (CALCULÉ, GAS.md).
- **Scénario** : Une mise à jour Registry-verified d'environ 500 arêtes dépasse le plafond et l'opérateur lit que la limite est 20 fois plus loin ; même texte pour un lot `addNodes` trop gros (NODES600).
- **Correctif** : Message dépendant du niveau et du type de transaction, avec les chiffres datés actuels, ou pas de chiffre.

#### 50. [REGADDR] `--identity`/`--reputation` jamais comparés aux registres du contrat

`solver/certifier.py:653` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Les registres qui déclenchent le recalcul sont des entrées libres : avec les adresses mainnet sur le testnet (le piège documenté dans CLAUDE.md §3), `eth_getLogs` renvoie [] sans erreur et tous les déclencheurs se taisent.
- **Scénario** : Seuls le premier tour et le rafraîchissement à environ 22 h subsistent ; rien n'est journalisé (vérifié sur testnet-rpc le 06/10).
- **Correctif** : Lire `identity()`/`reputation()` sur le contrat au démarrage (ou refuser un écart).

#### 51. [SIGNER] Le `Signer` est construit différemment par le certificateur et le watcher

`solver/certifier.py:667` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Le certificateur force le mode keystore dès `--send` (même sans `--keystore` ni `--from`), le watcher ne le prend que si `--from` et `--keystore` sont fournis ; aucun drapeau manquant n'est refusé par argparse.
- **Scénario** : `certifier.py --send --from X` sans keystore : `TypeError` au premier envoi, à chaque tour ; sans `--from` : `AttributeError` à chaque tour ; le watcher, lui, envoie en `--unlocked` ou se contente de « préparer » ses preuves sans prévenir (reproduit).
- **Correctif** : Un `signer_from_args()` commun : `--send` exige `--from`, keystore ssi `--keystore` (alors `--password-env` requis), jamais de rétrogradation silencieuse.

#### 52. [K24] `replay_identity_events` garde l'owner courant dans pastOwners

`solver/graph.py:237` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : La règle « anciens détenteurs hors owner courant » est appliquée par `load_identity` et `from_indexer.identity_file`, pas par `replay_identity_events`.
- **Scénario** : Historique A→B→A : pastOwners {7: [A, B]} d'un côté, {7: [B]} de l'autre (reproduit) ; aucun cas dans le snapshot, aucune sortie calculée ne change, mais le test de parité casserait au premier cas réel.
- **Correctif** : Faire le `discard` une seule fois dans `Identity.apply_transfer`.

#### 53. [DEC28] `dec_to_wad` dans le contexte Decimal par défaut (28 chiffres)

`solver/graph.py:305` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Une borne de plus de 28 chiffres significatifs une fois mise à l'échelle WAD est arrondie puis passe le contrôle d'intégralité ; le miroir `rules.ts` est exact et lève : les deux divergent sur un tel schéma.
- **Scénario** : « 12345678901.000000000000000001 » perd 1 wei, « …0000000000000000001 » (19 décimales) est accepté par Python et refusé par rules.ts (MESURÉ) ; sans effet avec le schéma livré.
- **Correctif** : Parser exactement (Fraction ou contexte local avec piège Inexact), règle des 18 décimales comme rules.ts.

#### 54. [SYNROWS] `synthetic.metrics` : la colonne « lignes pour e ≤ θ » est sous-évaluée

`solver/synthetic.py:108` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `rows_needed` traite ntrunc comme un nombre de nœuds massifs tronqués alors qu'il indexe un tri où les nœuds sans masse viennent en premier.
- **Scénario** : deg = 2 : 1 445 lignes publiées contre 1 656 réellement gardées (−12,7 %, MESURÉ) ; les chiffres deg = 5 de RESULTS.md et du CR sont trop bas d'environ 6 lignes ; la conclusion (la troncature ne gagne presque rien) se renforce.
- **Correctif** : `rows_needed = (mx[order[ntrunc:]] > 0).sum()`, puis régénérer out/synthetic.md et les chiffres cités.

#### 55. [SRCLESS] Watcher : le contrôle « ligne sans source vide » a été supprimé (commit 230be35)

`solver/watcher.py:100` · **CONFIRMÉ** · chantier **04-bis (racine K6 : 02-bis)**

- **Constat** : La correction équivalente (écart SHAPE) n'a été ajoutée qu'à `indexer/src/lib/audit.ts` (12a2005) : le watcher saute en silence une ligne d'agent sans source qui porte des arêtes, c'est-à-dire la ligne d'attaque K6/L1.
- **Scénario** : Certificat accepté via la désynchronisation K6 avec une ligne sans SRC portant une arête fabriquée : `discrepancies = []` côté watcher, SHAPE côté indexeur ; seule l'alerte est perdue (aucune preuve on-chain possible).
- **Correctif** : Rétablir l'écart non prouvable avec alerte au journal ; la vraie correction est K6 (02-bis).

#### 56. [K22] `check.ts` s'arrête sur une page courte au lieu d'une page vide

`indexer/scripts/check.ts:56` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : FORMAT.md §7 impose l'arrêt sur page vide (from_indexer.py le fait) ; sous un plafond de lignes serveur inférieur à 1 000, `check.ts` ne lit que la première page.
- **Scénario** : Fausse alerte d'incohérence de l'indexeur (jamais un faux vert) dès qu'un rôle Hasura plafonne les lignes.
- **Correctif** : Arrêt sur page vide, une seule règle de pagination pour les deux clients de l'interface.

#### 57. [CHECKCOV] `check.ts` ne vérifie que ce que l'indexeur a déjà vu

`indexer/scripts/check.ts:99` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : La liste des agents et couples vient des avis indexés : un agent dont tous les avis ont été manqués n'est jamais interrogé, et ni valeur, ni tag1, ni révocation ne sont comparés.
- **Scénario** : Une révocation manquée laisse l'arête active dans SetEdge et dans l'export (le certificat est ensuite refusé par la relecture) alors que `pnpm check --full` reste vert ; le tag tronqué de NUL passe aussi.
- **Correctif** : Appeler `getClients` pour chaque agent minté et comparer chaque avis indexé (au moins le dernier par triple) à `readFeedback` via Multicall3.

#### 58. [PUBLISH] `publish.sh` : la garde avant `rsync --delete` accepte un sous-dossier du clone, `.git` compris

`indexer/scripts/publish.sh:12` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : La garde se contente d'un `grep` de la sous-chaîne « ygk94/ancre-indexer » dans l'URL d'origine, vrai pour tout dossier à l'intérieur du clone.
- **Scénario** : `scripts/publish.sh ~/ancre-indexer/.git` remplace le `.git` du clone par les sources de l'indexeur : historique local et commits non poussés détruits (reproduit sur un clone de test) ; avec `…/src`, une copie imbriquée est poussée sur la branche publique. Erreur d'opérateur requise.
- **Correctif** : Exiger que DST soit la racine du work-tree (`git rev-parse --show-toplevel`) et une URL d'origine exacte.

#### 59. [DECODE] `decodeRows` plus strict que le contrat sur les sources nulles (plantage déjà corrigé)

`indexer/src/lib/certificate.ts:71` · **CONFIRMÉ** · chantier **03** · déjà corrigé : partiel (plantage corrigé, audit toujours sauté)

- **Constat** : Une ligne d'ancre avec H_SRC et 20 octets à zéro (acceptée on-chain, K10) fait lever `decodeRows` ; le handler l'attrape désormais (`ancre.ts:131-133`, déjà corrigé pour le plantage) mais classe le certificat UNDECODABLE et ne l'audite pas. À l'inverse, une ligne sans source encodée avec SRC = 0x0 produit une fausse alerte SOURCE dont le remède revert `NothingToProve`.
- **Scénario** : Un soumetteur tiers ajoute ces 20 octets à une ligne d'ancre d'un certificat par ailleurs fautif : accepté on-chain, jamais audité par l'indexeur (test sur le code actuel). Le solveur honnête n'émet jamais ce cas.
- **Correctif** : Traiter un SRC nul comme « pas de source » dans `decodeRows` (ou signaler SHAPE au lieu de lever).

#### 60. [D3e] `--max-amount ""` supprime le plafond sans erreur

`plugin/src/commands/ancre/pay.ts:31` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `inp.maxAmount ? parseUsdc(...) : undefined` (pay.ts:31, inspect.ts:30, override.ts:72) traite une chaîne vide comme « pas de plafond », alors que toute autre valeur invalide lève ANCRE_BAD_AMOUNT. Même motif pour `--amount` dans check.ts:31.
- **Scénario** : `--max-amount "$CAP"` avec CAP vide : une offre à 250 USDC est retenue (MESURÉ) ; pour `pay`, `maxPerPayment` borne encore, pour l'override rien d'autre que la lecture humaine.
- **Correctif** : Tester `!== undefined` et rejeter la chaîne vide (un helper `optionalUsdc()` commun).

#### 61. [K17] `check` : une erreur RPC sur `getAgentWallet` devient WALLET_MISMATCH

`plugin/src/lib/flows.ts:91` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `.catch(() => zeroAddress)` transforme une erreur passagère en `decide(agentId, 0x0, …)`, qui répond WALLET_MISMATCH pour un agent dont le wallet est bien posé.
- **Scénario** : 429 ou délai dépassé sur `--rpc-url` : le skill annonce « payTo n'est pas le wallet de l'agent » pour une vérification sans offre.
- **Correctif** : Remonter ANCRE_RPC_ERROR au lieu d'avaler l'erreur.

#### 62. [K16] `check --naive` : un échec de la partie naïve fait perdre le verdict ANCRE

`plugin/src/lib/flows.ts:97` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : Les lectures `getClients`/`getSummary` ne sont pas isolées : une erreur RPC fait échouer toute la commande.
- **Scénario** : Agent #182 (7 665 clients) : `getSummary` avec environ 245 ko de calldata dépasse une limite du RPC ou de la passerelle mm, la commande échoue et le verdict UNTRUSTED déjà calculé n'est jamais affiché, ce qui casse la scène de démo.
- **Correctif** : Entourer la partie naïve d'un try/catch et rendre le verdict avec `naive.error`.

#### 63. [M1] Sorties de `payFlow` non journalisées (GET payé qui échoue, signataire non opérateur, refus du wallet)

`plugin/src/lib/flows.ts:240` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : Quand le GET payé lève (connexion coupée après l'envoi de la signature, délai, Ctrl-C), `payFlow` rend UNKNOWN avec une autorisation vivante mais n'écrit rien au journal, contrairement à sa branche « 2xx sans PAYMENT-RESPONSE » et à override.ts:146 ; l'arrêt « signataire non opérateur » et un refus du wallet ne sont pas journalisés non plus (D47, commit c28f88d « chaque sortie journalisée »).
- **Scénario** : Le serveur reçoit la signature, règle, puis coupe la connexion : journal vide (reproduit sur `dist` par trois agents), l'écran de démo ne montre rien alors que l'USDC a pu partir.
- **Correctif** : Journaliser `unknown` dans ce catch et les autres sorties ; mieux, une seule fin de flux `settlePaid()` partagée avec l'override.

#### 64. [K18] Note d'override attachée à SETTLEMENT_FAILED alors que l'override refuse ce cas

`plugin/src/lib/flows.ts:270` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : Quand `explain` dit OK (échec du facilitateur, fenêtre expirée), `payFlow` ajoute quand même la note « seul l'humain peut passer outre », mais `override` répond ANCRE_OVERRIDE_NOT_NEEDED.
- **Scénario** : Fenêtre x402 expirée après une MFA lente : l'humain suit la note et tombe sur une impasse.
- **Correctif** : N'attacher la note que si le refus vient d'ANCRE.

#### 65. [K20] `--rpc-url` : la chaîne du RPC n'est jamais comparée à `--chain-id`

`plugin/src/lib/host.ts:14` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `hostDeps` crée un client sans chaîne et n'appelle jamais `eth_chainId` : `check` peut rendre le verdict de l'autre réseau sous le `--chain-id` demandé.
- **Scénario** : `ANCRE_RPC_URL` testnet oublié, `mm ancre check 12 --chain-id 143` avec un payeur présent à la même adresse sur les deux réseaux : verdict testnet (PAY dans le PoC) rendu comme verdict mainnet. `inspect` échoue proprement, `payer status` lève ANCRE_WRONG_CHAIN, `pay` ne prend pas `--rpc-url` (MESURÉ).
- **Correctif** : Créer le client avec la chaîne de `CHAINS[cfg.chainId]` et vérifier `getChainId()` une fois.

#### 66. [A4g] Ctrl-C n'arrête pas la page de signature de l'override

`plugin/src/lib/human.ts:55` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `humanSign` ne prend pas d'AbortSignal ; l'hôte transforme Ctrl-C en `io.signal.abort()`, que rien n'écoute.
- **Scénario** : La page reste servie et la commande bloque jusqu'à 5 minutes ; si l'onglet est signé entre-temps, le flux reprend après une annulation (MESURÉ).
- **Correctif** : Passer `d.signal` à `humanSign`, fermer le serveur et rejeter sur abort.

#### 67. [A4d] Double clic sur la page d'override : signature refusée avec un faux motif après « Signed »

`plugin/src/lib/human.ts:67` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : Chaque GET `/template` réémet une autorisation (nouveau nonce) ; un second clic pendant la première demande fait vérifier la signature n1 contre le modèle n2.
- **Scénario** : La page répond « Signed. You can close this tab », puis le terminal refuse avec « The signature does not come from the connected account » (MESURÉ). Rien n'est payé, mais l'humain est trompé et doit recommencer.
- **Correctif** : Conserver les modèles émis par nonce et vérifier contre celui signé, ou un seul modèle par chargement ; ne répondre à `/done` qu'après acceptation.

#### 68. [A4e] `-f json` ou un format persistant contournent le refus « --json » de l'override

`plugin/src/lib/interactive.ts:6` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `MACHINE_OUTPUT` ne reconnaît que `--json`, `--toon`, `--format` ; l'alias `-f` de l'hôte et `mm config set format json` passent.
- **Scénario** : `mm ancre override <url> -f json` : l'hôte choisit le rendu sans tête mais `isInteractive` répond vrai (MESURÉ avec les méthodes de `Command` de mm 7.0.0). Défense en profondeur seulement (la signature owner/treasury reste le vrai contrôle).
- **Correctif** : Utiliser `io.isInteractive` fourni par l'hôte, en plus du test TTY.

#### 69. [A4f] Override « mal configuré » refusé seulement si owner ET treasury sont des adresses de l'agent

`plugin/src/lib/override.ts:85` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : Le README dit « owner OU treasury » ; le code ne refuse que si les deux sont bannis.
- **Scénario** : owner = Agent Wallet, treasury = humain : l'override passe normalement ; l'agent, owner, peut même faire `transferOwnership(K)` sans 2FA (transaction vers le payeur autorisé par Guard Mode) puis faire accepter K comme humain (MESURÉ).
- **Correctif** : Refuser si owner OU treasury est banni (ou corriger le README), et aligner `statusFlow.isHuman` (K21).

#### 70. [K19] Offres au-dessus de `maxPerPayment` filtrées avant `decide` : OVER_LIMIT inatteignable

`plugin/src/lib/x402.ts:92` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : `selectOffer` écarte l'offre trop chère et lève ANCRE_NO_OFFER avec un indice trompeur (« exact USDC only »), sans entrée de journal ni note d'override, contrairement au SKILL.md.
- **Scénario** : maxPerPayment 0,01 USDC, offre à 0,02 : pas de verdict OVER_LIMIT, pas de journal, alors que l'override est conçu pour ce cas.
- **Correctif** : Ne pas filtrer sur `maxPerPayment` dans `selectOffer` : laisser `decide` répondre OVER_LIMIT, journaliser et proposer l'override.

#### 71. [K14] Preuves : tout échec de lecture du registre vaut « agent brûlé » ou « source changée »

`contracts/src/AnchoredReputation.sol:1654` · **PLAUSIBLE** · chantier **02-bis**

- **Constat** : `proveEdge` (l.1652-1654) et `_sourceHolds` (l.1830) traduisent tout échec d'une lecture plafonnée à 120 k (revert quelconque, gas, retour court) en wNew = 0 ou en ligne annulée, alors que la soumission fait les mêmes lectures sans plafond. Un getter d'identité qui réussit mais coûte plus de 120 k après une mise à jour permettrait de « prouver » chaque arête supprimée jusqu'à STALE.
- **Scénario** : Hypothétique : proxy UUPS mis à jour par l'EOA unique vers une implémentation plus coûteuse sans changer `getVersion()`. Aujourd'hui les quatre lectures d'une arête coûtent environ 45 k (GAS.md) et la v2.0.0 n'a pas de burn : le déclencheur est absent. La variante par famine de gas (63/64) n'est pas faisable.
- **Correctif** : Ne traiter comme « pas d'agent » que le revert ERC721NonexistentToken et revert `RegistryUnreadable` sur tout autre échec, ou appliquer la même politique de gas à la soumission et aux preuves.

#### 72. [K3] Pas d'annulation individuelle d'une autorisation upto (Permit2)

`contracts/src/TrustGatedPayer.sol:216` · **PLAUSIBLE** · chantier **02-bis**

- **Constat** : Le type 3 n'annule que les nonces EIP-3009 ; aucune fonction n'appelle `Permit2.invalidateUnorderedNonces` (indexé sur msg.sender, donc seul le payeur pourrait le faire) et `_parse` ne borne pas la deadline : une autorisation upto signée reste réglable tant que l'agent est trusted.
- **Scénario** : L'opérateur signe un upto à deadline très lointaine puis veut le retirer : pause, retrait d'opérateur ou baisse du plafond bloquent, mais tout redevient valide dès que le levier est levé (MESURÉ). Déclencheur incertain : le plugin ne paie qu'en exact (fenêtre ≤ 300 s) et seul `scripts/t1.mjs` signe de l'upto.
- **Correctif** : Ajouter `invalidatePermit2Nonces(wordPos, mask)` (owner ou opérateur), éventuellement borner la deadline dans `_parse`.

#### 73. [DEC18] valueDecimals > 18 : le solveur lève là où le contrat ignore le tag

`solver/graph.py:327` · **PLAUSIBLE** · chantier **04-bis (+03 pour rules.ts)**

- **Constat** : `value_to_wad` (et `rules.ts` quantize) lève pour valueDecimals > 18, alors que `_normalize` renvoie (false, 0) : un seul avis de ce type, dernier de son triple sur un tag filtré, ferait échouer `build_graph` pour tout le set.
- **Scénario** : Inatteignable avec le registre v2.0.0 (`require(valueDecimals <= 18)`), atteignable après une mise à jour du proxy UUPS, scénario que le projet modélise (PLAUSIBLE).
- **Correctif** : Faire rendre `None` (rejeté) à quantize comme `_normalize`, et pareil dans rules.ts (chantier 03).

#### 74. [K5] Signature d'opérateur high-s : le plugin la laisse passer, le payeur la refuse

`contracts/src/TrustGatedPayer.sol:530` · **PLAUSIBLE** · chantier **plugin (+02-bis)**

- **Constat** : `_recover` refuse s > n/2 (documenté), mais `normalizeSignature` (plugin/src/lib/payer.ts:102) ne ramène jamais s dans la moitié basse, et le contrôle local du plugin (viem) accepte high-s : un tel paiement est signé, envoyé, puis refusé à /verify avec un motif trompeur.
- **Scénario** : Si le signataire du wallet serveur ne normalise pas s, environ un paiement sur deux échoue en BAD_OPERATOR_SIG avec « mauvaise méthode de connexion ? ». Déclencheur inconnu : le keyring BYOK (viem) a produit 0 high-s sur 300 (MESURÉ), le mode serveur requis n'a pas pu être testé.
- **Correctif** : Dans `normalizeSignature`, si s > n/2 : s = n − s et inverser v ; ou accepter high-s côté contrat (les nonces du jeton bornent déjà le rejeu).

### Nettoyage (19)

#### 75. [EFF5] `nodeIndexPlus1` en mapping : une page MIP-8 froide par nœud

`contracts/src/AnchoredReputation.sol:218` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Chaque nouvel agent paie sa propre page (environ 28,5 k gas MESURÉ, environ 60 % du coût d'`addNodes`) ; les agentId sont denses et petits.
- **Scénario** : Un tableau à indexation directe (u32 compactés) coûterait 36 à 56 % de moins sur `addNodes` (MESURÉ en micro-benchmark).
- **Correctif** : Tableau aligné sur les pages pour les agents, mapping conservé pour les adresses.

#### 76. [SIMP3] Dix fonctions Yul jumelles W=2/W=4, dont les copies W=4 ne sont exercées par aucun test

`contracts/src/AnchoredReputation.sol:769` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : validate/scatterPos1/scatterPosK/scatterNeg/vetoMark existent en deux versions qui ne diffèrent que par les décalages et le pas ; cinq fonctions paramétrées par W, appelées avec un 2 ou un 4 littéral, donnent un bytecode identique.
- **Scénario** : Environ 50 lignes dupliquées dans la boucle chaude ; un correctif fait sur une jumelle et mal reporté sur l'autre partirait sans test.
- **Correctif** : Fusionner en cinq fonctions paramétrées par W et ajouter un vecteur W = 4 à la suite de tests.

#### 77. [SIMP4] Littéraux magiques dans le Yul au lieu des constantes

`contracts/src/AnchoredReputation.sol:982` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `header()`, `processRow`, `factors`, `capLane` codent en dur 0x0fff, 256, 0x8000, 0x4000, 0x2000, 10000, 1e18, 0x7fff… alors que H_NE, ROW_MAX, H_SRC, H_SPLUS, H_ALIAS, GRID, WAD, LANE_MASK sont utilisables en Yul.
- **Scénario** : Un changement de format fait sur les constantes laisserait `_rowLoop` lire l'ancien format pendant que `_verifyRows`/`_parseRow` lisent le nouveau (classe de défaut de K6).
- **Correctif** : Utiliser les constantes dans le Yul (bytecode identique).

#### 78. [K26] En-tête de ligne décodé trois fois

`contracts/src/AnchoredReputation.sol:1105` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : La disposition §3.2 est décodée par le `header()` Yul de `_rowLoop`, par `_verifyRows` et par `_parseRow`. Les copies ont déjà divergé : K6 est exactement l'oubli de `_verifyRows`.
- **Scénario** : Tout changement de format est à faire dans trois décodeurs ; un oubli désaligne la relecture du registre et la règle de forme alors que les feuilles Merkle restent justes.
- **Correctif** : Un `_rowHeader(rows, off, W) → (RowView, next)` partagé par `_verifyRows` et `_parseRow` (ou faire enregistrer par `_rowLoop` l'offset des arêtes de chaque ligne).

#### 79. [EFF4] Chemin de forme seule : poids et index décodés avant le `continue`

`contracts/src/AnchoredReputation.sol:1123` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Dans `_verifyRows`, le chemin `reads = false` (tous les certificats Submitter-attested) décode w et feedbackIndex avec des slices vérifiées avant `if (!reads) continue`.
- **Scénario** : Environ 820 gas par arête, 18 à 20 % d'une mise à jour attestée (MESURÉ).
- **Correctif** : Ne lire que dst sur ce chemin et sauter W+6 octets ; lire w/fIdx avec `_be` sur le chemin Registry-verified.

#### 80. [K28] R6, R7 et l'empreinte d'owner écrits deux fois, avec des politiques d'échec différentes

`contracts/src/AnchoredReputation.sol:1130` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Contrôleurs (R6) dans `_verifyRows` et `proveEdge`, résolution de source (R7) dans `_clientOf/_clientRare` et `_sourceHolds`, `& LANE_MASK` en ligne à trois endroits alors que `ownerFingerprint()` existe. La soumission revert sur un échec de lecture, les preuves le traduisent en « brûlé » (K14).
- **Scénario** : Un changement D20/D44/D10 appliqué à une seule copie laisserait les preuves facturer des arêtes que la soumission refuse (ou l'inverse).
- **Correctif** : Helpers internes `_isController`, `_sourceOf`, `ownerFingerprint()` partout, chacun avec une politique d'échec explicite.

#### 81. [EFF7] `getAgentWallet`/`ownerOf` rappelés sans cache dans `_verifyRows`

`contracts/src/AnchoredReputation.sol:1130` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Un appel par arête entrante et par ligne, plus `ownerOf` par agent massif, alors que le registre ne peut pas changer dans la transaction.
- **Scénario** : Environ 1 k gas par appel redondant, 2 à 4 % du certificat de démo (MESURÉ/CALCULÉ).
- **Correctif** : Un tableau mémoire wallet[n] rempli au premier usage.

#### 82. [K25] Adressage des couloirs de vecteurs recopié à 4 endroits

`contracts/src/AnchoredReputation.sol:1357` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : slot = base + (i>>2)·(k+3) + v, décalage (i&3)·64, & LANE_MASK : écrit en ligne dans `_assess`, `proveTransfer`, `_setFlag` et `_widen` en plus de `vectorAt` (externe, donc non réutilisable tel quel).
- **Scénario** : Cohérent aujourd'hui ; un changement de disposition (nouveau couloir, pas k+4) demande environ sept modifications, et un oubli dans `_setFlag` écrirait les bits de transfert et de veto dans le couloir d'un autre nœud sans revert.
- **Correctif** : Un helper interne `_lane(setId, k, i)` utilisé partout, `vectorAt` compris.

#### 83. [SIMP8] `_pairEdge` renvoie un `tag` qu'aucun appelant n'utilise

`contracts/src/AnchoredReputation.sol:1506` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Le quatrième retour (suivi via minTag/maxTag) est jeté par les deux appelants.
- **Scénario** : Variables de pile et gas inutiles dans la boucle D14 de chaque relecture (environ 50 à 190 gas, MESURÉ).
- **Correctif** : Renvoyer (ok, w, idx).

#### 84. [SIMP5] `proveWallet` appelle `_sums` complet pour n'utiliser que s0/b0

`contracts/src/AnchoredReputation.sol:1703` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : Lecture inutile de `nodeIndexPlus1[agentKey(0)]` (page MIP-8 froide) et boucle d'amendements ignorée ; formules capDim/prepaid dupliquées avec `proveEdge`.
- **Scénario** : Environ 5 à 8 k gas par `proveWallet` (MESURÉ) ; un changement d'arrondi fait dans une seule preuve facturerait différemment le même fait.
- **Correctif** : Un helper `_committedRow` partagé, `_sums` réduit à la superposition des amendements.

#### 85. [CONV4] NatSpec : fourchette de gas sans source ni date

`contracts/src/TrustGatedPayer.sol:212` · **CONFIRMÉ** · chantier **02-bis**

- **Constat** : `isValidSignature` annonce « ANCRE (29 k to 170 k gas) » sans source, date ni étiquette mesuré/estimé, contrairement à la règle de veille de CLAUDE.md §2.
- **Scénario** : La seule source (GAS.md, Lectures, MESURÉ à k = 3) n'est ni citée ni datée et la valeur dépend de k (jusqu'à 16 ancres).
- **Correctif** : Citer GAS.md avec la date, l'étiquette MESURÉ et la condition k = 3.

#### 86. [CNT] Commentaire « rare (32 on the mainnet) » sans source ni date

`solver/certifier.py:397` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Chiffre repris sans source, date ni étiquette (CLAUDE.md §2) ; la source existe (32 ApprovalForAll, MESURÉ 27/09, design-indexeur-envio.md §2.2).
- **Scénario** : Convention seulement ; aucun effet de comportement.
- **Correctif** : « 32 ApprovalForAll sur le mainnet, MESURÉ 27/09 (rpc1, design-indexeur-envio.md §2.2) ».

#### 87. [K23] `export.main` refait à la main l'expérience EM/D44, déjà différente de `run_mainnet`

`solver/export.py:580` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : 6 tags et 48 couples dans le vecteur publié contre 8 tags et 49 couples dans le rapport (donc un autre setId) ; les certificats restent identiques aujourd'hui.
- **Scénario** : Toute retouche d'une seule copie désynchronise le vecteur normatif du rapport mesuré, sans test pour le voir.
- **Correctif** : Un helper `R.em_experiment()` partagé ; choisir 6 ou 8 tags une fois.

#### 88. [DEAD] Code mort du solveur (périmètre réduit)

`solver/ppr.py:71` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : Mort : `ppr.distrust_float`, `ppr.U64_MAX`, `graph.GRID_WAD`, `Q_MAX`, le paramètre `lambdas` de `power_from_zero`, `rejected` dans `watcher.audit`, cinq imports, le drapeau `reject_controllers` (et la garde inatteignable de `row_of`). Pas mort : `ppr.is_trusted` (utilisé par `app/scripts/export_act1.py`) et `keep_detail` (utilisé par `indexer/analytics/survival_scan.py`).
- **Scénario** : Environ 25 lignes inutiles dans la référence normative ; supprimer `is_trusted` ou `keep_detail` casserait l'export de l'acte 1 ou l'analyse de survie.
- **Correctif** : Supprimer le code mort listé, garder `is_trusted` et `keep_detail`.

#### 89. [K27] `synthetic.py` réimplémente le solveur PPR flottant

`solver/synthetic.py:69` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `solve`, la borne de fuite, le leave-one-out et WAD sont recopiés ; le budget somme les poids signés (pas de B⁻ séparé).
- **Scénario** : Identique aujourd'hui (écart 1,7e-18) car pas d'arête négative ; une seule arête négative fait diverger les deux (7,8e-6, MESURÉ) : l'étude de α ne porterait plus sur le modèle certifié.
- **Correctif** : Importer `ppr.solve_float`, `leak_bound`, `trust_robust` et `graph.WAD`.

#### 90. [MERKLE] Watcher : chemins Merkle en O(R²)

`solver/watcher.py:58` · **CONFIRMÉ** · chantier **04-bis**

- **Constat** : `audit()` reconstruit tous les niveaux de l'arbre pour chaque ligne (et chaque source d'alias).
- **Scénario** : 1 000 lignes : 1,85 s contre 0,003 s ; 2 000 : 7,37 s (MESURÉ) ; environ 30 s à 4 000 lignes (CALCULÉ).
- **Correctif** : Calculer `merkle_levels` une fois par audit.

#### 91. [QUOTA] `publish.sh` : quota fournisseur sans source ni date

`indexer/scripts/publish.sh:6` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : « 3 per indexer on the free plan » sans source, date ni étiquette (CLAUDE.md §2) ; la source existe (docs/ressources/envio.md §5, DOC, lu le 27/09).
- **Scénario** : Convention seulement ; la décision `--deploy` s'appuie sur ce quota.
- **Correctif** : « (DOC Envio hosted-service-billing, lu le 2026-09-27, voir docs/ressources/envio.md §5) ».

#### 92. [SEQ] `recomputeEdgesInto` : un `await` séquentiel par arête entrante

`indexer/src/lib/state.ts:97` · **CONFIRMÉ** · chantier **03** · déjà corrigé : non

- **Constat** : Chaque changement de contrôleur d'un agent à N arêtes entrantes coûte environ 3N allers-retours de stockage enchaînés dans la phase de préchargement d'Envio ; les `get` répétés sont servis par le cache d'Envio.
- **Scénario** : Sans effet sur les données réelles (2 arêtes entrantes au maximum) ; un contrôleur pourrait répéter `approve()` pour ralentir l'indexeur si N grandit.
- **Correctif** : Charger Agent/AnchorSet une fois, calculer les décisions avec `Promise.all`, puis appliquer les écritures et un seul delta de stats.

#### 93. [SIMP7] Plugin : classes d'erreur dupliquées, code mort, erreurs brutes qui échappent à `toCommandError`

`plugin/src/lib/host.ts:75` · **CONFIRMÉ** · chantier **plugin**

- **Constat** : FlowError, X402Error et ConfigError sont identiques ; `identityAbi` défini deux fois ; `HumanSignature.template` jamais lu ; `CHAINS[*].rpc` jamais lu. Les `Error` brutes de `normalizeSignature`/`encodeExactBlob` sortent sans code ANCRE_* (l'hôte propose alors « Run the command again », contraire à la règle « pas de retry »). Les helpers upto ne sont PAS morts (utilisés par `scripts/t1.mjs`).
- **Scénario** : Environ 25 lignes dupliquées ou mortes ; chaque nouvelle classe d'erreur doit être ajoutée à `toCommandError` sous peine de perdre son code.
- **Correctif** : Une classe `AncreError` unique et un `toCommandError` qui enveloppe toute autre erreur en ANCRE_INTERNAL ; garder les helpers upto.

## Écartés (3)

#### [K2] owner ou treasury peuvent aussi être opérateurs

`contracts/src/TrustGatedPayer.sol:187` · **ÉCARTÉ** · chantier 02-bis

- ÉCARTÉ : la séparation des rôles est la condition 4 de la garantie (README), vérifiée par `mm ancre payer status` ; seule la répétition T1 (testnet, oracle simulé) fusionne les rôles.
- **Vérifié** : Avec des rôles séparés, l'opérateur ne peut ni `sweep`, ni `setPolicy`, ni `setOperator` (MESURÉ).
- **Option** : Défense en profondeur optionnelle : refuser owner/treasury = opérateur dans le constructeur et `setOperator`.

#### [K4] `reportRefusal` : le premier appelant choisit le bloc tracé

`contracts/src/TrustGatedPayer.sol:259` · **ÉCARTÉ** · chantier 02-bis

- ÉCARTÉ : comportement documenté (une trace par autorisation) ; la raison tracée est vraie à son bloc et infalsifiable, et `explain` reconstruit tout refus ultérieur.
- **Vérifié** : Trace moins informative possible (STALE transitoire au lieu du veto), jamais fausse (MESURÉ).
- **Option** : Optionnel : indexer `reported` par (hash, raison, statut).

#### [K1] `_setPolicy` accepte un set en mode rapide (strictTransfer = false)

`contracts/src/TrustGatedPayer.sol:370` · **ÉCARTÉ** · chantier 02-bis

- ÉCARTÉ : c'est le compromis D25/D35 documenté (mode rapide), appliqué fidèlement par le payeur via `isTrusted` ; seul le commentaire l.495-497 exagère. Durcissement optionnel : refuser `strictTransfer = false` dans `_setPolicy`.
- **Vérifié** : Avec un set non strict choisi par l'owner, l'acheteur d'un agent vendu est payé jusqu'au `proveTransfer` (MESURÉ) ; avec tout set strict (tous ceux du projet), refus immédiat TRANSFERRED.
- **Option** : Optionnel : refuser les sets non stricts ou documenter la fenêtre dans PAYER.md §7 et l'afficher dans `payer status`.

## Annexe : traçabilité

Constats du 05/10 (K*), leads de l'interruption (L1) et constats des angles relancés ; preuves et tests de reproduction dans le scratchpad de la session de revue (`phase1/`, `phase2/`, `phase3/`). Lots de vérification : V1a, V2, V3_completed, V4, V5a, V5b, V5c, V6, V7a, V7b, V7c, V8, V9, SWEEP.

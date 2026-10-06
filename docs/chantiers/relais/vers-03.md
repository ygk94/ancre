# Relais du pilote vers le chantier 03 (indexeur Envio)

> Écrit le 2026-10-01 par la session pilote. À lire avant de figer les règles d'arêtes dans l'indexeur.
> La référence est désormais **`contracts/ENCODING.md`**, le format v1 unifié (branche `feat/conseil-solveur-contrat`, intégration du 01/10). `solver/FORMAT.md` décrit les règles d'arêtes R1 à R8 et renvoie à ENCODING.md pour le reste.

1. **Égalité entre tags (AM-04.12, modifié par l'intégration).** Quand deux tags d'un même couple sont à égalité, on départage par le **feedbackIndex le plus grand**, et **non par l'ordre alphabétique**. L'ordre alphabétique n'est pas calculable on-chain : sur `mainnet_em_d44`, il changeait 7 arêtes réelles.
2. **`OUT_OF_BOUNDS` se juge par tag (AM-04.10).** Une valeur hors bornes écarte l'avis **pour ce tag**, pas tout le couple. Aligne `Discrepancy` et les tests de parité là-dessus.
3. **`via = none`** : sans repli owner (D44 désactivé par défaut), l'émetteur d'une ligne est uniquement l'agent dont le wallet est le noteur. `VIA_OWNER` n'existe que si l'ensemble l'engage dans son `setId`.
4. **Les tags sont stockés sous forme de hash** (AM-04.2) : `triggerTag` et les identifiants de tags côté contrat sont des `keccak256(tag)`, sans limite de longueur. L'indexeur doit faire le lien entre le texte du tag et son hash.
5. **Parité** : utilise `solver/from_indexer.py` et `solver/tests/test_indexer_parity.py`. Dépose un dump de l'indexeur dans `solver/tests/fixtures/indexer/` : le test se branche alors tout seul.
6. **Audit** (D42) : les preuves sont maintenant `proveEdge` et `proveWallet` (contrat v1). En Registry-verified, fabrication et gonflement sont refusés dès la soumission. L'audit sert donc surtout à détecter la **dilution** et le **négatif omis** (AM-INT.1).


## Relais du 06/10 : constats de la revue maximale du 05/10 (docs/revue/revue-max-2026-10-05-partielle.md)

1. **`indexer/scripts/check.ts` pagine mal** : il s'arrête dès qu'une page est incomplète, alors que `from_indexer.py:81` et FORMAT.md §146 imposent de s'arrêter sur une page **vide**. Corrige, et ajoute un test.
2. Le format d'id `Operator` est écrit à 3 endroits, et `state.isOperator` double `storeView.isOperator` : nettoyage.
3. **Le contrat corrige un défaut critique** (nœud `address(0)` qui fait sauter la relecture du registre) **et change sa règle d'arête** (D48-B : on conserve les négatifs des contrôleurs). Il est aussi renommé : `isTrusted` devient `passesAnchorPolicy`. Le handler `CertificateSubmitted` doit attendre l'ABI de la branche `chantier/02bis-corrections`.


## Relais du 06/10 : Alchemy (D55), pour l'écran 07 et l'indexeur

- **Écran 07 : la Transfers API d'Alchemy explique le score.** Exemple : « les 7 665 noteurs d'Eve ont reçu leur premier MON du propriétaire d'Eve ». C'est MESURÉ sur un échantillon de 150, toujours 11,0 MON depuis `0x97cD…0996`. Voir `docs/ressources/alchemy.md`. La clé d'API vient de Hugo.
- `monadLogs` reste plus rapide que les webhooks pour le direct à l'écran.


## Relais du 06/10 (soir) : revue maximale complète

Source : `docs/revue/revue-max-2026-10-06-complete.md`. **SW2, NUL et LONGTAG arrêtent l'indexeur pour de bon avec une seule transaction sans permission** : à corriger **avant** de brancher l'indexeur sur l'adresse du contrat déployé (MUSTDO), puisque SW2 devient exploitable à ce moment-là. DEC18 touche aussi `rules.ts`.

### Haute

- **SW2** (`indexer/src/handlers/ancre.ts:50`, CONFIRMÉ) : Un `registerAnchorSet` avec alphaD ≥ 2^31 arrête l'indexeur sur les trois chaînes
- **NUL** (`indexer/src/handlers/reputation.ts:16`, CONFIRMÉ) : Les NUL de `tag1` : collision d'identifiants (arrêt) et tags fantômes
- **LONGTAG** (`indexer/src/handlers/reputation.ts:28`, CONFIRMÉ) : Un `tag1` de plus de 2 704 octets arrête l'indexeur sur les trois chaînes

### Moyenne

- **OUTERCALL** (`indexer/src/handlers/ancre.ts:76`, CONFIRMÉ) : Nouveaux handlers : un `addNodes` relayé laisse un trou définitif dans la table de l'indexeur
- **REGCB** (`indexer/src/handlers/identity.ts:47`, CONFIRMÉ) : `register()` émet le wallet après le callback ERC-721 : l'indexeur garde un wallet que le registre n'a plus
- **SW1** (`indexer/src/lib/audit.ts:124`, CONFIRMÉ) : Audit en direct : une dilution est signalée sur la mauvaise arête, et la vraie preuve ne ferme rien

### Faible

- **K22** (`indexer/scripts/check.ts:56`, CONFIRMÉ) : `check.ts` s'arrête sur une page courte au lieu d'une page vide
- **CHECKCOV** (`indexer/scripts/check.ts:99`, CONFIRMÉ) : `check.ts` ne vérifie que ce que l'indexeur a déjà vu
- **PUBLISH** (`indexer/scripts/publish.sh:12`, CONFIRMÉ) : `publish.sh` : la garde avant `rsync --delete` accepte un sous-dossier du clone, `.git` compris
- **DECODE** (`indexer/src/lib/certificate.ts:71`, CONFIRMÉ) : `decodeRows` plus strict que le contrat sur les sources nulles (plantage déjà corrigé)

### Nettoyage

- **QUOTA** (`indexer/scripts/publish.sh:6`, CONFIRMÉ) : `publish.sh` : quota fournisseur sans source ni date
- **SEQ** (`indexer/src/lib/state.ts:97`, CONFIRMÉ) : `recomputeEdgesInto` : un `await` séquentiel par arête entrante

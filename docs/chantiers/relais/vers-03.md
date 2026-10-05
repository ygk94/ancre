# Relais du pilote vers le chantier 03 (indexeur Envio)

> Écrit le 2026-10-01 par la session pilote. À lire avant de figer les règles d'arêtes dans l'indexeur.
> La référence est désormais **`contracts/ENCODING.md`**, le format v1 unifié (branche `feat/conseil-solveur-contrat`, intégration du 01/10). `solver/FORMAT.md` décrit les règles d'arêtes R1 à R8 et renvoie à ENCODING.md pour le reste.

1. **Égalité entre tags (AM-04.12, modifié par l'intégration).** Quand deux tags d'un même couple sont à égalité, on départage par le **feedbackIndex le plus grand**, et **non par l'ordre alphabétique**. L'ordre alphabétique n'est pas calculable on-chain : sur `mainnet_em_d44`, il changeait 7 arêtes réelles.
2. **`OUT_OF_BOUNDS` se juge par tag (AM-04.10).** Une valeur hors bornes écarte l'avis **pour ce tag**, pas tout le couple. Aligne `Discrepancy` et les tests de parité là-dessus.
3. **`via = none`** : sans repli owner (D44 désactivé par défaut), l'émetteur d'une ligne est uniquement l'agent dont le wallet est le noteur. `VIA_OWNER` n'existe que si l'ensemble l'engage dans son `setId`.
4. **Les tags sont stockés sous forme de hash** (AM-04.2) : `triggerTag` et les identifiants de tags côté contrat sont des `keccak256(tag)`, sans limite de longueur. L'indexeur doit faire le lien entre le texte du tag et son hash.
5. **Parité** : utilise `solver/from_indexer.py` et `solver/tests/test_indexer_parity.py`. Dépose un dump de l'indexeur dans `solver/tests/fixtures/indexer/` : le test se branche alors tout seul.
6. **Audit** (D42) : les preuves sont maintenant `proveEdge` et `proveWallet` (contrat v1). En Registry-verified, fabrication et gonflement sont refusés dès la soumission. L'audit sert donc surtout à détecter la **dilution** et le **négatif omis** (AM-INT.1).

# Relais du pilote : constats de la revue maximale pour le chantier 02-bis (contrat)

> Source : `docs/revue/revue-max-2026-10-06-complete.md` et son JSON jumeau. Chaque constat y a son résumé, son scénario d'échec, souvent un test de reproduction, et un correctif proposé.
> **Ordre de traitement** : critique et haute **avant la démo** ; moyenne selon le temps ; faible et nettoyage après la soumission, sauf s'ils sont triviaux.
> Pour chaque constat corrigé : ajoute un test de non-régression (reprends le PoC du rapport quand il existe), puis note-le dans ton journal sous son identifiant.

> **K6 et L1 sont le même défaut** (le nœud `address(0)` décale la relecture), avec une conséquence pire pour L1 : aucune preuve ne peut contester. C'est le point R1 de ton prompt. **K7, K9, K10 et K11 sont des réencodages** couverts par ta forme canonique (D48-C) : vérifie-les un par un. **K8 et A2b touchent la formule d'ENCODING §7.1 elle-même** : corrige ENCODING.md et PROOFS.md (L6), le chantier 08 reportera dans l'ERC.
> Constats « 04-bis (+02-bis) » : STUCK et A1d ont une part contrat (garde REFUSED-first avant les clauses d'âge ; indices de `newNodes`). K5 (signature high-s) est côté plugin.

### Critique

- **K6** (`contracts/src/AnchoredReputation.sol:1120`, CONFIRMÉ) : Relecture Registry-verified désynchronisée par un nœud address(0)
- **L1** (`contracts/src/AnchoredReputation.sol:1817`, CONFIRMÉ) : Après la désynchronisation K6, une ligne sans source portant des arêtes est inattaquable

### Haute

- **K7** (`contracts/src/AnchoredReputation.sol:576`, CONFIRMÉ) : La garde « REFUSED first » se contourne en réencodant le certificat
- **E1** (`contracts/src/AnchoredReputation.sol:1600`, CONFIRMÉ) : Un seul avis à tag long rend un couple illisible : soumission et preuves bloquées

### Moyenne

- **A1b** (`contracts/src/AnchoredReputation.sol:506`, CONFIRMÉ) : Nœuds parasites via `addNodes` ouvert : le set ouvert gèle (et un tiers fait monter nCert)
- **K10** (`contracts/src/AnchoredReputation.sol:1179`, CONFIRMÉ) : Règle de forme testée sur la valeur décodée de SRC, pas sur le bit H_SRC
- **EFF1** (`contracts/src/AnchoredReputation.sol:1538`, CONFIRMÉ) : `_pairEdge` relit tout l'historique d'un couple : le client d'une ligne fixe le coût de chaque soumission
- **K8** (`contracts/src/AnchoredReputation.sol:1662`, CONFIRMÉ) : Lignes à sPlus déclaré : `proveEdge` sous-facture eUp quand une arête positive engagée tombe
- **A2b** (`contracts/src/AnchoredReputation.sol:1663`, CONFIRMÉ) : Lignes à sPlus déclaré : une arête positive nouvelle ne facture rien à eLow (côté confiance)
- **ALT8** (`contracts/src/AnchoredReputation.sol:1674`, CONFIRMÉ) : Arrondis prépayé (bas) contre preuves (haut) : des preuves d'omissions honnêtes marquent le titulaire « prouvé »

### Faible

- **K9** (`contracts/src/AnchoredReputation.sol:572`, CONFIRMÉ) : `registryChanged` saute aussi la garde REFUSED-first
- **A1c** (`contracts/src/AnchoredReputation.sol:578`, CONFIRMÉ) : Règle de remplacement : croissance honnête refusée avec un sPlus déclaré (jusqu'à maxAge)
- **K29** (`contracts/src/AnchoredReputation.sol:599`, CONFIRMÉ) : `dryRun` sans `newNodes` : inutilisable pour un certificat qui ajoute ses nœuds en ligne
- **K12** (`contracts/src/AnchoredReputation.sol:601`, CONFIRMÉ) : `dryRun` ne fait que l'arithmétique
- **K11** (`contracts/src/AnchoredReputation.sol:1187`, CONFIRMÉ) : `_verifyOwners` ne vérifie ni les ancres ni les agents sans masse
- **K13** (`contracts/src/AnchoredReputation.sol:1421`, CONFIRMÉ) : Contrôle de transfert strict conditionné à trust ≠ 0 au lieu de « masse > 0 »
- **K14** (`contracts/src/AnchoredReputation.sol:1654`, PLAUSIBLE) : Preuves : tout échec de lecture du registre vaut « agent brûlé » ou « source changée »
- **K3** (`contracts/src/TrustGatedPayer.sol:216`, PLAUSIBLE) : Pas d'annulation individuelle d'une autorisation upto (Permit2)

### Nettoyage

- **EFF5** (`contracts/src/AnchoredReputation.sol:218`, CONFIRMÉ) : `nodeIndexPlus1` en mapping : une page MIP-8 froide par nœud
- **SIMP3** (`contracts/src/AnchoredReputation.sol:769`, CONFIRMÉ) : Dix fonctions Yul jumelles W=2/W=4, dont les copies W=4 ne sont exercées par aucun test
- **SIMP4** (`contracts/src/AnchoredReputation.sol:982`, CONFIRMÉ) : Littéraux magiques dans le Yul au lieu des constantes
- **K26** (`contracts/src/AnchoredReputation.sol:1105`, CONFIRMÉ) : En-tête de ligne décodé trois fois
- **EFF4** (`contracts/src/AnchoredReputation.sol:1123`, CONFIRMÉ) : Chemin de forme seule : poids et index décodés avant le `continue`
- **K28** (`contracts/src/AnchoredReputation.sol:1130`, CONFIRMÉ) : R6, R7 et l'empreinte d'owner écrits deux fois, avec des politiques d'échec différentes
- **EFF7** (`contracts/src/AnchoredReputation.sol:1130`, CONFIRMÉ) : `getAgentWallet`/`ownerOf` rappelés sans cache dans `_verifyRows`
- **K25** (`contracts/src/AnchoredReputation.sol:1357`, CONFIRMÉ) : Adressage des couloirs de vecteurs recopié à 4 endroits
- **SIMP8** (`contracts/src/AnchoredReputation.sol:1506`, CONFIRMÉ) : `_pairEdge` renvoie un `tag` qu'aucun appelant n'utilise
- **SIMP5** (`contracts/src/AnchoredReputation.sol:1703`, CONFIRMÉ) : `proveWallet` appelle `_sums` complet pour n'utiliser que s0/b0
- **CONV4** (`contracts/src/TrustGatedPayer.sol:212`, CONFIRMÉ) : NatSpec : fourchette de gas sans source ni date

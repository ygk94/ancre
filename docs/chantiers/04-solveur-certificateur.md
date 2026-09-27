# Chantier 04 — Solveur et certificateur (service)


> **Amendements du tour 5 (27/09)** :
> - **Itération depuis 0 obligatoire** : `certify` de R4 viole la sous-solution de 1 wei sur `toy_alpha_1_3` (AM-5.12). Il faut régénérer les vecteurs.
> - B⁺ déclaré par ligne (D32).
> - Le niveau de certification (Registry-verified ou Submitter-attested) dépend de la mesure du chantier 02. Le soumetteur attesté par défaut est le propriétaire de l'ensemble (D27).
> - Promouvoir `scratchpad/tour5B/t1-t3` dans `solver/tests` (D37).
> - Prévoir un surveillant pendant la période de jugement (13 → 27/10).

## 1. Objectif et résultat final attendu

Transformer le solveur de R4 (`solver/`, 95 tests) en **service** qui fait trois choses :
1. lire la base de l'indexeur (03) ;
2. détecter qu'un graphe a changé pour un ensemble d'ancres ;
3. calculer puis **soumettre le certificat** à `AnchoredReputation` (02), en choisissant la gas limit et en découpant le premier certificat si besoin.

Le service fait aussi **surveillant** : il détecte les écarts entre le certificat publié et le registre, puis prépare et envoie les preuves d'écart.

**Livrables** :
- `solver/` étendu : service, CLI, configuration des ensembles d'ancres ;
- un **mode simulation** qui fonctionne contre un fork ;
- des tests d'intégration solveur → contrat en fork, sur les vecteurs de `solver/vectors/` puis sur le graphe de démo ;
- un rapport de latence : du bloc de l'avis au certificat publié, mesuré.

## 2. Contexte minimal

- Décisions : D1, D2 (α, peut-être révisé au tour 4), D5, D6, D7, D8, D14 à D16, D18, puis le tour 4.
- Mesures (27/09) :
  - une mise à jour de l'acte 2 coûte ≈ 840 k gas, soit ≈ 0,084 MON ;
  - une mise à jour du graphe réel coûte 133 à 146 k ;
  - un nouveau nœud coûte 28,7 k ;
  - **e < θ oblige à fournir presque tout le support** (AM-R4.5) ;
  - un nœud absorbant doit avoir une ligne vide (AM-R4.7).
- Format : `solver/FORMAT.md` ↔ `contracts/ENCODING.md`, alignés le 27/09.
- Sur Monad, **on paie la gas limit** (`receipt.gasUsed == tx.gas`, mesuré). Réserve de 10 MON par compte, avec au plus environ 3 transactions pleines toutes les 3 blocs (doc Monad).

## 3. Ce qui est déjà tranché

- On recalcule **à chaque changement du graphe**, jamais à chaque bloc (CLAUDE.md §6).
- La certification se fait sans permission ; la règle de remplacement utilise eEff (sauf révision au tour 4).
- Le calcul de résidu hors chaîne est identique au calcul on-chain, à l'entier près (déjà le cas dans R4).

## 4. Pistes à creuser

- **Déclencheurs** :
  - un avis dont le noteur est dans le support ;
  - une révocation ;
  - un `MetadataSet(agentWallet)` ;
  - un `Transfer` ;
  - un `Upgraded`.

  Les avis de noteurs hors support ne changent pas t : **on les ignore** (économie décrite au tour 1).
- **Gas limit** : calcul exact par `eth_estimateGas` plus une marge serrée. Mesurer l'écart entre l'estimation et le coût réel sur Monad (l'agent gas a mesuré une marge de 0,3 à 1,5 %).
- **Découpage** : `addNodes` et `reserveCapacity` pour le premier certificat de plus de ~1 000 nœuds.
- **Surveillant** : il compare `graphRoot` et l'état de l'indexeur, puis prépare les preuves (i) à (iv). Qui paie ? Selon le tour 4. En démo, c'est notre compte.
- **Latence** : l'objectif de démo est « refus au bloc suivant » par le **veto direct**, sans le certificat. Le certificat suit. Mesurer les deux délais séparément.
- **Robustesse** : relance après un crash, idempotence (ne pas soumettre deux fois le même certificat), gestion du nonce avec la réserve de 10 MON.

## 5. Pièges connus

- Ne pas relire 8004scan : il fausse les décimales (AM-R4.2).
- La quantification est normative (D18) : un seul arrondi différent donne un autre point fixe.
- Deux ancres corrélées (par exemple deux scanners) peuvent contourner m = 2 (AM-R4.8) : la configuration des ensembles doit l'empêcher ou l'avertir.

## 6. Questions ouvertes

- Un service par ensemble d'ancres, ou un seul service multi-ensembles ?
- Où vit la configuration des ensembles (fichier versionné, ou on-chain via `setId`) ?

## 7. Critères d'acceptation

- En fork mainnet, **tous** les vecteurs de `solver/vectors/` sont acceptés par le contrat, et chaque vecteur muté est refusé.
- Sur le graphe de démo (chantier 06), le cycle complet (avis → certificat accepté) fonctionne en fork avec la latence mesurée.
- Une preuve d'écart de chaque type implémenté est générée automatiquement à partir d'un cas construit.

## 8. Interfaces

- Consomme `indexer/SCHEMA.md` (03) et l'ABI de 02.
- Produit des transactions de certificats et de preuves, ainsi qu'un journal lisible par l'écran (07) : format à fixer avec 07.

## 9. Règles

Voir `README.md`. Les transactions réelles (testnet ou mainnet) se font seulement avec l'accord de Hugo ; le fork est libre.

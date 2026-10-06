# Relais du pilote : constats de la revue maximale pour le chantier 04-bis (solveur, certificateur, surveillant)

> Source : `docs/revue/revue-max-2026-10-06-complete.md` et son JSON jumeau. Chaque constat y a son résumé, son scénario d'échec, souvent un test de reproduction, et un correctif proposé.
> **Ordre de traitement** : critique et haute **avant la démo** ; moyenne selon le temps ; faible et nettoyage après la soumission, sauf s'ils sont triviaux.
> Pour chaque constat corrigé : ajoute un test de non-régression (reprends le PoC du rapport quand il existe), puis note-le dans ton journal sous son identifiant.

> **Le certificateur s'arrête pour pas cher** (TBL, L3, GASCAP, NODES600, LOGS), **ne réagit pas au contrat** (THIRD, CHKREG, STUCK, DEFER) et **le surveillant rate ou abandonne des preuves** (W1, AMENDS, W6, W7, BREAK, ONCE, SWALLOW). Ajoute aussi AM-06.1 (keystore cassé avec Foundry ≥ 1.8). Le webhook Alchemy (D55) répond en partie à THIRD, CHKREG et ONCE : s'abonner aussi aux events du contrat ANCRE.

### Haute

- **TBL** (`solver/certifier.py:314`, CONFIRMÉ) : Table des nœuds reconstruite depuis le calldata externe : un `addNodes` relayé arrête certificateur et watcher
- **STUCK** (`solver/certifier.py:578`, CONFIRMÉ) : Titulaire prouvé puis registre remis à l'identique : le set reste mort
- **THIRD** (`solver/certifier.py:678`, CONFIRMÉ) : Le certificateur n'écoute pas le contrat : un certificat censuré par un tiers reste en place environ 22 h
- **L3** (`solver/ppr.py:331`, CONFIRMÉ) : 257 avis négatifs d'une simple adresse bloquent toute recertification
- **W1** (`solver/watcher.py:133`, CONFIRMÉ) : Watcher : dilution jugée arête par arête, jamais cumulée
- **AMENDS** (`solver/watcher.py:224`, CONFIRMÉ) : Watcher : la liste d'amendements n'est jamais reconstruite depuis la chaîne

### Moyenne

- **A1d** (`contracts/src/AnchoredReputation.sol:503`, CONFIRMÉ) : `newNodes` ajoutés au nodeCount du moment : un `addNodes` intercalé fait échouer le certificat
- **NODES600** (`solver/certifier.py:64`, CONFIRMÉ) : Lots `addNodes` de 600 nœuds : au-dessus du plafond de 25 M du certificateur
- **LOGS** (`solver/certifier.py:258`, CONFIRMÉ) : `eth_getLogs` non découpé depuis le bloc 0 : certificateur (`--send`) et watcher inutilisables sur les RPC publics
- **CHKREG** (`solver/certifier.py:390`, CONFIRMÉ) : Personne n'appelle `checkRegistry` : une mise à jour du registre ne lève jamais REGISTRY_CHANGED
- **GASCAP** (`solver/certifier.py:589`, CONFIRMÉ) : Aucun repli quand le certificat honnête dépasse le plafond de gas
- **DIES** (`solver/certifier.py:676`, CONFIRMÉ) : Les boucles « never die » meurent sur une seule erreur passagère
- **STALE** (`solver/certifier.py:682`, CONFIRMÉ) : Export `--data` en retard sur les events : l'event est consommé par un recalcul obsolète
- **DEFER** (`solver/certifier.py:685`, CONFIRMÉ) : Soumission différée par la règle de remplacement : jamais retentée
- **W7** (`solver/watcher.py:121`, CONFIRMÉ) : Watcher : une arête négative surévaluée (w < q < 0) n'est jamais signalée
- **W6** (`solver/watcher.py:176`, CONFIRMÉ) : Watcher : `still_dilutes` compare au B⁺ engagé, pas au budget courant du contrat
- **SWALLOW** (`solver/watcher.py:213`, CONFIRMÉ) : Watcher : une erreur RPC passagère est classée « undecodable » pour toujours
- **BREAK** (`solver/watcher.py:236`, CONFIRMÉ) : Watcher : la boucle de preuves d'une ligne s'arrête au premier échec
- **ONCE** (`solver/watcher.py:306`, CONFIRMÉ) : Watcher : chaque certificat n'est audité qu'une fois
- **ARGV** (`solver/certifier.py:223`, PLAUSIBLE) : Calldata passé à `cast` en argument de ligne de commande : E2BIG sous Linux
- **HEADREG** (`solver/certifier.py:538`, PLAUSIBLE) : Recul de la tête ou bloc spéculatif abandonné : « node table gap » à vie

### Faible

- **MSG** (`solver/certifier.py:591`, CONFIRMÉ) : Message d'erreur du plafond de gas : chiffre v0 (« 12 k arêtes ») environ 20 fois trop haut
- **REGADDR** (`solver/certifier.py:653`, CONFIRMÉ) : `--identity`/`--reputation` jamais comparés aux registres du contrat
- **SIGNER** (`solver/certifier.py:667`, CONFIRMÉ) : Le `Signer` est construit différemment par le certificateur et le watcher
- **K24** (`solver/graph.py:237`, CONFIRMÉ) : `replay_identity_events` garde l'owner courant dans pastOwners
- **DEC28** (`solver/graph.py:305`, CONFIRMÉ) : `dec_to_wad` dans le contexte Decimal par défaut (28 chiffres)
- **SYNROWS** (`solver/synthetic.py:108`, CONFIRMÉ) : `synthetic.metrics` : la colonne « lignes pour e ≤ θ » est sous-évaluée
- **SRCLESS** (`solver/watcher.py:100`, CONFIRMÉ) : Watcher : le contrôle « ligne sans source vide » a été supprimé (commit 230be35)
- **DEC18** (`solver/graph.py:327`, PLAUSIBLE) : valueDecimals > 18 : le solveur lève là où le contrat ignore le tag

### Nettoyage

- **CNT** (`solver/certifier.py:397`, CONFIRMÉ) : Commentaire « rare (32 on the mainnet) » sans source ni date
- **K23** (`solver/export.py:580`, CONFIRMÉ) : `export.main` refait à la main l'expérience EM/D44, déjà différente de `run_mainnet`
- **DEAD** (`solver/ppr.py:71`, CONFIRMÉ) : Code mort du solveur (périmètre réduit)
- **K27** (`solver/synthetic.py:69`, CONFIRMÉ) : `synthetic.py` réimplémente le solveur PPR flottant
- **MERKLE** (`solver/watcher.py:58`, CONFIRMÉ) : Watcher : chemins Merkle en O(R²)

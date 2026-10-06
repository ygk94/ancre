# Soumission finale — dimanche 12/10, heure par heure (heure de Paris)

> Rédigé le **2026-10-06** par la session du chantier 09. Clôture réelle : **mardi 14/10 à 05:59** (= 13/10 23:59 à New York, fiches des bounties). Objectif : **soumis le 12/10 avant 20:00**, avec le 13/10 entier en marge (D52, brief 09 §7).
> **Seul Hugo** dépose, publie et rend le dépôt public. Les sessions préparent et vérifient.
> Documents liés : `publication-checklist.md` (dépôt public), `textes-plateforme.txt` (champs), `video-script.md` (vidéo), `figures/`, `README.md`.

## Prérequis au soir du samedi 11/10 (portes go / no-go)

Si une porte est rouge le 11 au soir, appliquer la colonne « sinon » : on soumet quand même le 12.

| Porte | Vérification | Qui | Sinon |
|---|---|---|---|
| G1 Vidéo | fichier exporté ≤ 3:00, en ligne en **public**, lien ouvert dans une fenêtre privée | Hugo | soumettre avec la répétition du 10/10 ; remplacer le lien avant le 14/10 05:59 (la version à la clôture fait foi, règle NON CONFIRMÉE) |
| G2 Déploiement | adresses testnet (et mainnet si D40) dans le README §7, sources vérifiées | 02, Hugo | soumettre sur le testnet seul (le mainnet n'est pas exigé, AM-5.7) |
| G3 Divulgation (D29) | brouillon (c) envoyé ≥ 24 h avant | Hugo | **appliquer le §2.1 de `publication-checklist.md`** : bloc DISCLOSURE-GATE retiré, plan 4A absent, ERC public seulement après réécriture |
| G4 Décisions P1-P6 | licence, historique, identité, contenu public | Hugo | P1 par défaut MIT ; P3 par défaut (B) |
| G5 Tests | `forge test`, `pytest`, `pnpm test` (indexeur), `npm test` (plugin), `verify.py` verts sur le commit gelé | pilote | ne pas geler : corriger ou noter la limite dans le README |
| G6 Chiffres | `run_mainnet.py` relancé sur le snapshot rafraîchi ; README, textes, figures et vidéo alignés sur les mêmes valeurs | 09 / pilote | garder le snapshot du 28/09 partout, avec sa date |

## Dimanche 12/10

| Heure | Action | Qui | Vérification (fait = case cochée) |
|---|---|---|---|
| **08:00** | Gel de `main` : plus aucun commit fonctionnel. Tag `submission-2026-10-12` sur le dépôt privé | pilote | `git tag` ; le hash est noté ici : ________ |
| 08:15 | Résoudre les `[TBD: …]` du README et les `⟦CHECK: …⟧` des textes : `grep -n "TBD" README.md` et `grep -n "CHECK" docs/soumission/textes-plateforme.txt` doivent tous être traités | 09 / pilote | 0 marqueur restant (sauf ceux remplacés par une limite écrite) |
| 08:45 | Licence (P1) : `LICENSE` racine, SPDX des 17 fichiers, README §14 | pilote | `git grep -n "CC0" -- ':!docs/erc'` → vide |
| 09:15 | Clone filtré du dépôt public (`publication-checklist.md` §4) | Hugo | clone créé dans `/tmp/ancre-public` |
| 09:45 | **Les 7 vérifications** du `publication-checklist.md` §7 sur le clone filtré | Hugo + pilote | chaque commande ne renvoie rien ; une seule identité de commit |
| 10:15 | Relecture humaine du README **dans le clone** (rendu GitHub en local ou aperçu) : liens relatifs qui pointent vers des fichiers présents, adresses, chiffres datés | Hugo | aucun lien mort vers un dossier resté privé (`docs/chantiers/rapports/` publié ?) |
| 10:45 | Création du dépôt public, push, **visibilité publique** | Hugo | page du dépôt ouverte **déconnecté** (fenêtre privée) |
| 11:00 | `ygk94/ancre-indexer` : mêmes vérifications, puis public | Hugo | `config.yaml`, `schema.graphql`, `src/` visibles déconnecté (bounty Envio) |
| 11:15 | Rejeu de l'acte 1 par un tiers **depuis le dépôt public** : clone neuf, README §5 mot pour mot, chronomètre | un membre qui n'a pas écrit le README | ≤ 5 min ; sortie identique à `solver/out/mainnet.md` ; les deux `cast` répondent |
| 11:45 | Endpoint GraphQL Envio Cloud : une requête depuis une fenêtre privée | Hugo | réponse non vide ; `_meta` à jour (la requête compte aussi pour le quota « 1 requête / 7 jours ») |
| 12:00 | *Pause* | | |
| 13:00 | Plateforme, projet : **one-liner**, description, go-to-market recopiés de `textes-plateforme.txt` (version du 06/10 ou plus récente, **sans** les notes ni les `⟦CHECK⟧`) | Hugo | chaque champ enregistré sans erreur 400 (le one-liner court en premier) |
| 13:30 | Track **04 — Trust, Identity & AI Infra** cochée ; lien du dépôt public ; lien de la vidéo ; adresses des contrats et hashes de tx (critère « Monad Integration ») | Hugo | aperçu du profil relu |
| 13:45 | **Progress update** du 12/10 (`textes-plateforme.txt`), trous remplis | Hugo | publié |
| 14:00 | Bounty **Envio** : champ rempli (texte « BOUNTY ENVIO »), liens indexeur + GraphQL + horodatage de la démo dans la vidéo | Hugo | les 3 livrables de la fiche sont cités : dépôt public, consommateur, démo |
| 14:20 | Bounty **Mera** : variante A ou B selon la porte P4 ; horodatage du test multi-appareils dans la vidéo | Hugo | la phrase « not a wallet » est présente ; aucune signature de transaction par le passkey n'est montrée |
| 14:40 | Bounty **Alchemy** : texte seulement si D55 est livrée (sinon **ne pas cocher le bounty** plutôt que de décrire une intégration absente) ; vidéo facultative ≤ 2 min | Hugo | la description dit quels services et où dans le code |
| 15:00 | Déclaration IA : le `[TO FILL]` du README §13 est rempli par l'équipe (ce qui a été relu ligne à ligne) | Hugo + équipe | commit sur le dépôt public si le README change ; re-vérification §7 |
| 15:30 | **Soumettre.** Statut affiché « submitted », pas « draft » | Hugo | capture d'écran du statut, rangée dans `mustdo/` (privé) |
| 15:45 | Relecture du profil public **déconnecté** : vidéo lisible, dépôt accessible, liens bons, aucun texte interne | Hugo | — |
| 16:00 | Surveillant actif pour le jugement (13/10 → 27/10) : watcher lancé sur l'ensemble de démo, compte de preuves financé, alertes | pilote / 04 | une alerte de test reçue |
| 16:30 | **Marge** : tout ce qui a échoué ci-dessus | | |
| 20:00 | **Heure limite interne.** Si la soumission n'est pas faite, soumettre l'état courant tel quel : une soumission imparfaite vaut mieux qu'aucune ; on l'améliore le 13 | Hugo | — |

## Lundi 13/10 : marge, pas de nouveauté

- Corriger seulement ce qui est faux ou cassé (lien, chiffre, vidéo). **Aucune fonctionnalité nouvelle.**
- Si quelque chose change : republier le dépôt public **et** refaire les vérifications §7 avant chaque push.
- Envio : une requête GraphQL au moins tous les 7 jours jusqu'au 03/11 (quota Cloud gratuit, rapport 03 §5).
- **Mardi 14/10 à 05:59 : clôture.** Plus rien ne bouge après.

## Après la soumission (non urgent)

- PR sur `ethereum/ERCs` et réponse au post #309 : **après le jugement**, sauf décision contraire de Hugo (CR, tour 5, ⟦OPEN⟧ restants).
- Message à ColinkaMir (brouillon (e)) : décision de Hugo.

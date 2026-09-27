# MUSTDO — ce que Hugo doit faire lui-même

> Mis à jour le 2026-09-27. Rien ici ne peut être fait par Claude : il faut un compte, une décision, un appareil, de l'argent, ou une publication externe.
> Clôture de Metropolis : **13/10 à 23:59, heure de New York**, soit **14/10 à 05:59 à Paris** (fiches de bounty). **Objectif : soumettre le 12/10.**
> Coche au fur et à mesure (`[x]`), et dis-le moi : je mets à jour le CR et les briefs.

## 🔴 Cette semaine, parce que ça bloque d'autres chantiers

- [ ] **1. Lire les règles officielles** sur hackathon.monad.xyz, modale « Rules & Guidelines », Rules v3.0.
  - Vérifier en particulier le **§7.2** : un dépôt GitHub public sous licence OSI est-il obligatoire ?
  - Vérifier aussi : vidéo de 3 minutes maximum ? outils IA à déclarer ? 5 critères notés à 20 % chacun, dont « Monad Integration » ?
  - Colle-moi le texte. Aujourd'hui, ces règles ne sont **pas confirmées** : on les connaît par un concurrent (`docs/ressources/monad-dev-et-soumission.md`).
- [ ] **2. Créer le projet sur la plateforme.** C'est obligatoire avant de choisir une track et des bounties. Choisir la **track 04 (Trust, Identity & AI Infra)** et les bounties **Envio « Best Use of Envio »**, **Mera « One Passkey, Many Keys »** et **MetaMask « Best Agent Wallet Plugin »**.
- [ ] **3. Poser deux questions aux organisateurs**, sur le Discord Monad dev ou le support de la plateforme :
  - (a) Un projet de la track 04 est-il éligible au bounty MetaMask, affiché en track 01 ?
  - (b) Y a-t-il un nombre maximal de bounties par projet ?
  - Question proposée : *« Our project competes in Track 04 (Trust, Identity & AI Infra). Is it eligible for the MetaMask "Best Agent Wallet Plugin" bounty, which is listed under Onchain Finance & Trading? Is there a limit on the number of sponsor bounties per project? »*
- [ ] **4. Créer le token Envio**, gratuit : https://envio.dev/app/api-tokens (connexion GitHub).
  - Le mettre dans un fichier `.env` local, **jamais dans le dépôt** : `.env` est déjà dans `.gitignore`.
  - Sans ce token, HyperSync répond 401 (mesuré).
- [ ] **5. Décider du dépôt public**, et quand le publier.
  - Le bounty Envio exige un dépôt public (config, schéma, handlers), et les règles le rendent peut-être obligatoire (point 1).
  - Recommandation (tour 5A) : **public à la soumission, le 12/10**. ERC en CC0 ; code en MIT ou Apache-2.0, à choisir.
  - Variante : publier `indexer/` plus tôt, dans un dépôt séparé.
- [ ] **6. Valider la répartition de l'équipe**, décision D31 dans `docs/conseil/tour5A-fond.md`.
  - Dev 1 : contrat, puis router.
  - Dev 2 : indexeur, puis écran.
  - Dev 3 : solveur et certificateur, puis ferme et scénarios.
  - Quant : calibrage, vecteurs de test, maths de la norme.
  - Toi : arbitrages, pitch, vidéo, soumission.
  - Donne-moi aussi le nombre d'heures par jour de chacun.

## 🟠 Avant le 05/10

- [ ] **7. Décider de la divulgation** (D29).
  - Recommandation : prévenir **en privé** les auteurs d'ERC-8004 de deux faits publics, en citant la PR #84.
    - L'EOA unique `0x5472…2603` peut upgrader les deux registres.
    - Le garde-fou contre l'auto-notation ignore `agentWallet` (78 cas réels sur #8317).
  - Risque : ça peut déclencher une upgrade avant le 13/10. Un plan B est prévu (D28).
  - Je peux rédiger le message, mais c'est toi qui l'envoies.
- [ ] **8. Choisir les ancres de démo.** Recommandation : 2 EOA à nous, étiquetées « demo ». Une ancre tierce seulement si elle est **confirmée avant le 03/10**.
- [ ] **9. Choisir le nom.** Propositions : ANCRE (recommandé), Keel, Mooring. Disponibilité non vérifiée : domaine, GitHub, marque.
- [ ] **10. Budget MON.**
  - Valider les deux enveloppes (frais, capital immobilisé) quand le chantier 06 les aura chiffrées.
  - Financer les comptes : une réserve de 10 MON par compte qui envoie des transactions (doc Monad).
  - Testnet : faucet https://faucet.monad.xyz, USDC de test https://faucet.circle.com.
- [ ] **11. Autoriser le premier test réel sur le testnet** : un contrat payeur ERC-1271 payé via le facilitator x402.
  - C'est le test bloquant : si le facilitator refuse d'avancer le gas d'un `assess` de 77 à 190 k, l'architecture « le contrat refuse de payer » tombe.
  - La liste exacte des transactions et leur coût seront dans `docs/ressources/design-payeur-et-reseau.md` (vague 2).
- [ ] **12. Réseau de l'acte 2.** Les registres ERC-8004 **existent sur le testnet** (vérifié le 27/09). Arbitrer entre testnet (gratuit), mainnet (crédibilité, critère « Monad Integration ») ou les deux : répétitions sur le testnet, une seule exécution sur le mainnet. Recommandation détaillée en vague 2.
- [ ] **13. Préparer les appareils pour Mera.** Le test multi-appareils se fait en live pendant la démo.
  - Il faut **deux appareils** qui partagent le même passkey avec support PRF : Mac sous macOS 15 et iPhone sous iOS 18.4 ou plus via iCloud Keychain, ou 1Password.
  - Chrome local, Bitwarden et Dashlane ne suffisent pas.
  - Il faut aussi un **domaine HTTPS fixe** pour l'écran (hébergement à décider).
- [ ] **14. Installer le MetaMask Agent Wallet** (`mm`, v7.x) sur ta machine pour tester le plugin. Il faut ton compte, ta politique et ton MFA ; les agents ne peuvent pas le faire.

## 🟡 Avant le 12/10

- [ ] **15. Déclarer le niveau de certification de la démo** après la mesure du chantier 02 : Registry-verified, chaque arête relue (~13,6 M gas estimés), ou Submitter-attested (D32).
- [ ] **16. Prévoir qui surveille pendant le jugement** (13 → 27/10) : robot de recertification et preuves d'écart. C'est à financer (D27).
- [ ] **17. Déployer sur Envio Cloud après le 28/09.** Le plan gratuit efface tout au bout de 30 jours, et le jugement court jusqu'au 27/10.
- [ ] **18. Pousser ou fusionner la branche** `feat/conseil-solveur-contrat`. Je ne pousse jamais sans ta demande.
- [ ] **19. Soumission**, le 12/10 : profil de projet, write-up, lien vers le code, **vidéo** (3 minutes maximum si c'est confirmé), déclaration des outils IA (Claude Code), sélection de la track 04 et des 3 bounties. Brouillons préparés par le chantier 09.
- [ ] **20. Publications externes**, à décider : la PR sur `ethereum/ERCs`, la réponse au post #309 d'ethereum-magicians et le message à ColinkaMir. Brouillons dans le chantier 08, **rien n'est publié sans toi**.

## À lire

- `ANCRE.md` : tout le projet en un document.
- `docs/conseil/CR-conseil.md` : le journal des décisions D1 à D38, en tête du fichier.
- `docs/chantiers/README.md` : les chantiers et l'ordonnancement.
- `docs/conseil/bounties-sponsors.md` : les 3 bounties visés, fiches officielles.
- `docs/ressources/` : la doc technique vérifiée, sujet par sujet.

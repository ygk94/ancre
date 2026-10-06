# MUSTDO — ce que Hugo doit faire lui-même

> 🚨 **05/10 : bounty MetaMask abandonné** (réservé à la track 01). Plugin gardé tel quel, plus de travail dessus. Les points 14b (« plugin MetaMask »), 14h (`mm login`, override) deviennent **optionnels**. **Reste à choisir les autres bounties** (ouverts à la track 04 ?). Compte GitHub renommé **`ygk94`**. Voir l'en-tête de `CLAUDE.md`.

> Mis à jour le 2026-09-27. Rien ici ne peut être fait par Claude : il faut un compte, une décision, un appareil, de l'argent, ou une publication externe.
> Clôture de Metropolis : **13/10 à 23:59, heure de New York**, soit **14/10 à 05:59 à Paris** (fiches de bounty). **Objectif : soumettre le 12/10.**
> Coche au fur et à mesure (`[x]`), et dis-le moi : je mets à jour le CR et les briefs.

## 🔴 Cette semaine, parce que ça bloque d'autres chantiers

- [ ] **06/10, suite de ta réponse** :
  - **Compte Alchemy gratuit (D55)** : crée-le, puis donne aux sessions, par un fichier `.env` local et jamais dans le dépôt :
    - la **clé d'API** ;
    - le **jeton Notify** (webhooks) ;
    - une **URL HTTPS publique** pour recevoir les webhooks. Une fonction serverless Vercel sur le domaine de démo suffit.
  - **Bounty Alchemy (D54)** : colle-moi la fiche officielle d'Alchemy depuis la plateforme (critères, livrables).
  - **Modale des règles** : tu es en train de la récupérer.
  - **Divulgation aux auteurs d'ERC-8004** : le dépôt passe public le 12/10. Or il contient la description du contournement du garde-fou et de l'EOA d'upgrade. **Le brouillon (c) de `docs/erc/drafts/` doit donc partir avant le 12/10**, ou ces passages doivent être retirés de la version publique. À trancher.
  - **Keystore de démo** : à créer avec la commande donnée dans la conversation, puis à alimenter au faucet (au moins 15 MON et 1 USDC de testnet).
  - **Domaine HTTPS pour Mera** : choisir le nom d'hôte, définitif, puisque le passkey y sera lié.

- [ ] **📅 Ton plan jour par jour (tour 7, D52)** :
  - **Lun 06/10** :
    - inscription et projet (track 04, bounties Envio et Mera) ;
    - recopie de la modale Rules ;
    - **choisir un éventuel 3ᵉ bounty « All tracks »** (voir ci-dessous) ;
    - **décision de divulgation**, et envoi du brouillon (c) si oui ;
    - **soumission d'assurance** avec le dépôt encore privé, si la plateforme l'accepte (sinon, divulgation avant) ;
    - **keystore chiffré** et faucet testnet (au moins 15 MON et 1 USDC) ;
    - **domaine HTTPS et `rpId`** pour Mera ;
    - lancer les sessions 02-bis, 04-bis et 06 (prompts dans `mustdo/prompts/`).
  - **Mar 07/10** : feu vert pour T1 et MON de testnet à disposition ; **prototype Mera** sur tes deux appareils.
  - **Mer 08/10** : autoriser le **déploiement sur le testnet** (environ 0,9 MON de testnet).
  - **Jeu 09/10** : **valider le budget mainnet** (environ 2 MON, ESTIMÉ) puis l'exécution minimale ; **dépôt public et licence** (MIT ou Apache-2.0).
  - **Ven 10/10** : relire le README et le write-up.
  - **Sam 11/10** : **voix et tournage** de la vidéo de 3 minutes ; rendre le dépôt public (après la divulgation).
  - **Dim 12/10** : **soumission finale**. Le lundi 13/10 sert de marge.
- [ ] **Bounties (D53)** : MetaMask est retiré, puisqu'il est réservé à la track Onchain Finance. **Relève sur la plateforme quels bounties sont marqués « All tracks »** et colle-moi la liste.
  - Candidats, s'ils sont ouverts à la track 04 :
    - **Nansen** (5 k$) : des labels de wallets dans le panneau de diagnostics des ancres et l'audit. À viser seulement s'ils changent un résultat ;
    - **Chainlink CRE** (3 k$) : le certificateur en workflow. Coûteux à 6 jours ;
    - **Alchemy** (1 k$ en crédits) : quasi gratuit si `rpc1` compte.
  - **Recommandation** : au plus **un** bounty de plus, et seulement s'il tient en un jour.

- [ ] **⏰ AUJOURD'HUI, 05/10 (veille du 05/10, `docs/ressources/veille-2026-10-05-hackathon.md`)** :
  - **Connecte-toi à hackathon.monad.xyz**, crée l'équipe et le projet si ce n'est pas fait (la clôture des inscriptions serait le **06/10**, une seule source tierce), et **recopie-moi la modale « Rules & Guidelines »**. Le formulaire de soumission est ouvert depuis le 02/10 et reste modifiable.
  - ~~**Pose la question MetaMask sur le forum de support**~~ **Réglé le 06/10 : le bounty MetaMask n'est pas ouvert à la track 04 (D53).** (réponse en environ 90 min d'après un participant). D'après la doc officielle `/tracks`, seuls les bounties « All tracks » se combinent avec n'importe quelle track, et celui de MetaMask est en « Onchain Finance & Trading ». **Sans réponse positive, le plugin ne compte pas pour le bounty.** Il reste utile au produit et à la démo.
  - Option, d'après le même participant : publier un **« progress update »** sur la plateforme, qui donnerait accès aux mentors.
  - **Divulgation (D29)** : la date recommandée était le 05/10, c'est-à-dire aujourd'hui. Le brouillon (c) est dans `docs/erc/drafts/`.

- [ ] **0. ⏰ S'inscrire AVANT LE 06/10.** Un concurrent qui cite les Rules v3.0 affirme que **les inscriptions ferment le 06/10** et que le formulaire de soumission ouvre le 02/10. C'est NON CONFIRMÉ, mais on ne prend pas le risque : inscris-toi et crée le projet dès maintenant (voir le point 2). Source : README de `precious-akpan/monad-metropolis-merchant-rails`, recopié dans `docs/ressources/design-demo-et-soumission.md` §1.

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
- [ ] **5. Décider du dépôt public**, et quand le publier. Deux points à connaître avant de décider :
  - **L'historique Git part avec le dépôt** : CLAUDE.md, le CR du conseil, la veille, les emails de l'en-tête de CLAUDE.md. Faut-il un dépôt public propre, sans l'historique ?
  - **La divulgation (point 7) doit passer avant** la mise en public.
  - **Licence** : le code Solidity est aujourd'hui en `CC0-1.0`, qui **n'est pas approuvée par l'OSI**. Si la règle §7.2 est confirmée, il faut passer le code en MIT ou Apache-2.0. L'ERC reste en CC0.
  - Détail du point, repris d'avant :, et quand le publier.
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

- [ ] **14b. Décisions issues de la vague 2** :
  - **Réseau de l'acte 2 (D40)** : recommandation H-B, soit la ferme et les répétitions sur le testnet, puis une seule exécution minimale sur le mainnet (≈ 0,9 MON, estimé).
  - **Adresses owner et treasury du contrat payeur** (D41) : quelle clé détient les USDC de démo ?
  - **Plugin MetaMask** : faut-il publier le paquet sur npm alors que le dépôt est privé ? Faut-il garder la garde dure dans le périmètre du bounty ?
  - **Dépôt `ancre-indexer`** : autoriser sa création et choisir sa licence. Installer la GitHub App Envio au moment du déploiement Cloud (entre le 06 et le 10/10). Envoyer une requête au moins tous les 7 jours pour éviter la suppression.
  - **`mm login`** avec ton compte MetaMask, pour tester le plugin.

- [ ] **14c. Décisions de la vague 3 (cross-idea)** :
  - **Mera (D43)** : accepter que la **pré-rotation des clés d'ancre revienne dans la démo** (environ 1,5 jour, plus 0,3 jour pour le dossier de veto). Réserver **dès maintenant un domaine HTTPS fixe et le `rpId` WebAuthn** : le passkey y est attaché, et on ne pourra pas en changer ensuite.
  - **Envio (D42)** : si le handler n'a pas accès au calldata, faut-il faire émettre les `rows` du certificat dans un event (surcoût en gas) ? Choisir la 3e chaîne (Arbitrum ou Optimism). Faut-il publier le tableau de survie des avis dans l'ERC ?

- [ ] **14d. Décisions du tour 6** :
  - Faut-il **coder le repli owner (D44) avant la soumission** ? Sur la démo, il n'ajoute aucune masse.
  - La scène « **la ferme qui se paie vraiment** » (D45) : accepter le surcoût en paiements x402 entre les agents de la ferme, sur le testnet.
  - Kanmani, Sentinel et Assay (`0xDB6c…7777`) : faut-il **les contacter**, et les citer dans le pitch ? Concourent-ils en track 04 ?

- [ ] **14e. Décisions issues des chantiers 02 et 04 (01/10)** :
  - **Déployer sur le testnet** : il faut un keystore chiffré (jamais de clé en clair) et **au moins 12 MON de testnet** (faucet). La commande est dans `contracts/script/Deploy.s.sol`.
  - **Activer D44 (repli owner) ?** C'est prêt des deux côtés, et sans effet mesuré sur la démo.
  - **Niveau de la démo** : Registry-verified est recommandé. Faut-il **en plus une liste de soumetteurs** (D27) contre AM-02.2 pendant le jugement ? Le coût en gas est le même.
  - **Compte et budget** pour les transactions sur le testnet (latence et dérive réelles) et pour les preuves du surveillant pendant le jugement.
  - **Langue des docs techniques** : les sessions ont écrit en anglais (FORMAT.md, ENCODING.md), alors que CLAUDE.md dit « le reste en français ». Lequel retient-on ?
  - **Taille du contrat (30,8 Ko)** : l'implémentation de référence de l'ERC doit-elle aussi tenir sur Ethereum (24 Ko) ?

- [ ] **14f. Décisions issues de l'intégration (01/10)** :
  - **`minRefresh`** : court (on prend les révocations en compte vite, mais une censure reste possible une fois par fenêtre), ou égal à `maxAge` ?
  - **Démo ouverte à tous en Registry-verified, ou avec un soumetteur attesté ?** Une dilution passe encore la règle de remplacement (AM-INT.1) : sur un ensemble ouvert, il faut un surveillant actif pendant le jugement. Si tu gardes un soumetteur attesté, qui paie les preuves ?
  - Faut-il émettre les **noms des tags** (pas seulement leur hash) dans l'event d'enregistrement d'un ensemble, pour la lisibilité ?
  - **Relayer au chantier 03** le fichier `docs/chantiers/relais/vers-03.md` : il faut pousser la branche, ou que tu le transmettes depuis l'autre machine.

- [ ] **14g. Décisions issues du chantier 08, la norme (01/10)** :
  - **⏰ La plus urgente : la divulgation** (brouillon `docs/erc/drafts/` c). Envoie-t-on avant le **05/10**, comme le recommande D29 ? **Canal** (contact des auteurs ou issue GitHub sobre), **signataires**, et **date de la mention publique**. Elle doit partir **avant** toute PR et avant que le dépôt devienne public, parce que les autres brouillons citent le contournement.
  - **PR sur `ethereum/ERCs` avant ou après le 13/10 ?** La relecture recommande « après » (confiance 0,6, experts partagés).
  - **Auteurs de l'ERC et fil Magicians dédié** : les éditeurs l'exigent avant toute PR. Qui signe ?
  - **Code de référence** : rend-on le dépôt public, ou copie-t-on le contrat dans `docs/erc/assets/` ?
  - **Contacter ColinkaMir (brouillon e) ? Et Kanmani ?**
  - **Démo, à régler avant que le dépôt devienne public** :
    - (a) **changer les ancres de démo** pour qu'aucune ne soit le wallet d'un agent (défaut AM-08.A) ;
    - (b) **lister les soumetteurs** (D27) ;
    - (c) **fixer `minRefresh = maxAge`**.
  - **Autoriser une session de correction du contrat** pour les trois défauts AM-08.A, B et C. Le texte de la norme n'est pas soumettable tant qu'ils ne sont pas corrigés ou explicitement assumés.

- [ ] **14h. Chantier 05 : ce qui ne dépend que de toi (01/10)** :
  - **Test T1 réel sur le testnet** (porte P3 : le facilitator accepte-t-il le payeur ?). Il faut ton accord, puis environ **0,40 MON et 0,1 USDC de testnet** (faucets : https://faucet.monad.xyz, https://faucet.circle.com). La procédure est dans `contracts/`, voir `docs/chantiers/rapports/05.md`.
  - **`mm login`** : pour essayer en vrai le `pay` et l'`override` avec ton extension MetaMask. Choisis le mode **server-wallet**, pas BYOK (condition de D47).
  - **L'adresse owner et trésorerie du payeur** : ce sera **le seul wallet qui pourra signer un override**.
    - Ce doit être **un compte de ton extension MetaMask**, distinct du wallet serveur de `mm`.
    - **À vérifier** : si ce compte est délégué en EIP-7702 sans `isValidSignature`, il ne pourra pas signer l'override en EIP-3009.
  - **Vérifier Guard Mode** avec `mm wallet policy get` : il doit être limité au payeur et à l'USDC, puisque le plugin ne peut pas le lire.

## 🟡 Avant le 12/10

- [ ] **15. Déclarer le niveau de certification de la démo** après la mesure du chantier 02 : Registry-verified, chaque arête relue (~13,6 M gas estimés), ou Submitter-attested (D32).
- [ ] **16. Prévoir qui surveille pendant le jugement** (13 → 27/10) : robot de recertification et preuves d'écart. C'est à financer (D27).
- [ ] **17. Déployer sur Envio Cloud après le 28/09.** Le plan gratuit efface tout au bout de 30 jours, et le jugement court jusqu'au 27/10.
- [ ] **18. Pousser ou fusionner la branche** `feat/conseil-solveur-contrat`. Je ne pousse jamais sans ta demande.
- [ ] **19. Enregistrer la voix de la vidéo.** Le storyboard en 11 plans (2:55) est dans `docs/ressources/design-demo-et-soumission.md`.
- [ ] **19b. Soumission**, le 12/10 : profil de projet, write-up, lien vers le code, **vidéo** (3 minutes maximum si c'est confirmé), déclaration des outils IA (Claude Code), sélection de la track 04 et des 3 bounties. Brouillons préparés par le chantier 09.
- [ ] **20. Publications externes**, à décider : la PR sur `ethereum/ERCs`, la réponse au post #309 d'ethereum-magicians et le message à ColinkaMir. Brouillons dans le chantier 08, **rien n'est publié sans toi**.

## À lire

- `ANCRE.md` : tout le projet en un document.
- `docs/conseil/CR-conseil.md` : le journal des décisions D1 à D38, en tête du fichier.
- `docs/chantiers/README.md` : les chantiers et l'ordonnancement.
- `docs/conseil/bounties-sponsors.md` : les 3 bounties visés, fiches officielles.
- `docs/ressources/` : la doc technique vérifiée, sujet par sujet.

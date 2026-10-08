# CLAUDE.md — reprise de contexte ANCRE

> ## 🚨🚨 À LIRE EN PREMIER — DÉCISIONS DU 2026-10-05 (valables sur toutes les machines) 🚨🚨
>
> 1. **BOUNTY METAMASK : ABANDONNÉ.** Le bounty « Best Agent Wallet Plugin » n'est ouvert qu'à la track **01 Onchain Finance & Trading** (vérifié par Hugo sur la plateforme le 05/10). Nous sommes en **track 04** : **inaccessible**. → Le plugin `mm ancre` (chantier 05) **reste tel quel** (il marche, 48 tests) et peut être cité comme intégration côté client, **mais plus aucun travail dessus** et **on ne le présente plus comme un bounty**. Le cœur de la démo reste la **garde dure on-chain** (`TrustGatedPayer`, ERC-1271). Décision **D48** dans le CR.
> 2. **Bounties encore visés : Envio** (acquis, indexeur sur Envio Cloud). Les autres (Mera, Alchemy, Nansen, Chainlink CRE…) sont **à trancher par Hugo** : vérifier pour chacun qu'il est ouvert à la track 04. Liste : `docs/conseil/bounties-sponsors.md`, section « Mise à jour du 05/10 ».
> 3. **GitHub : le compte s'appelle désormais `ygk94`** (ex-`hugothomas9`). Dépôts : `https://github.com/ygk94/ancre` (privé jusqu'à la soumission) et `ygk94/ancre-indexerv2`. Mettre à jour son remote : `git remote set-url origin https://github.com/ygk94/ancre.git`. `indexer/scripts/publish.sh` est déjà corrigé.
> 4. **Textes de la plateforme de soumission** (bio, description, go-to-market, progress update), en anglais : `docs/soumission/textes-plateforme.txt`. Les modifier là, pas ailleurs.

> Fichier de passation. Lis-le **avant** le README. Le README dit *ce qu'on construit* ; celui-ci dit *où on en est, ce qui est vérifié, et ce qu'il ne faut pas refaire*.
> Dernière mise à jour : **2026-10-05** (chantiers 02, 03, 04, 05 et 08 livrés et fusionnés sur `main`). **À lire juste après ce fichier, dans l'ordre :** `ANCRE.md` (le projet en entier), `docs/conseil/CR-conseil.md` (le journal des décisions D1 à D47 en tête), `docs/chantiers/ROADMAP.md`, `mustdo/MUSTDO.md` (ce qui attend Hugo).
> Mise à jour précédente : **2026-09-23**. Auteur : session Claude Code avec Hugo (`hugo.thomas.perso@gmail.com`, GitHub `ygk94`, ex-`hugothomas9`).

## 1. Le contexte en 10 lignes

- **Objectif** : gagner (ou bien figurer à) **Monad Metropolis**, hackathon en ligne, **clôture des soumissions le 2026-10-13**, jugement jusqu'au 27/10, résultats le 03/11. 30 k$ par track + 25 k$ Grand Champion. Jury : cofondateurs Monad, Paradigm, Dragonfly, Electric Capital, Galaxy, Nansen, Pantera, Castle Island.
- **Track visée** : **04 — Trust, Identity & AI Infra**. Elle est **saturée** (~18 projets repérés le 18/09), presque tous des clones « passeport d'agent + ERC-8004 + passkey ».
- **Projet retenu** : **ANCRE** — agrégation de réputation ERC-8004 résistante aux Sybil, **relative aux ancres choisies par le lecteur**, certifiée on-chain, **lisible par un contrat avant de payer**. Nom provisoire, à changer si mieux.
- **Angle qui sauve du « ERC-8004 de plus »** : on ne fait pas un registre, on fait **la couche que la norme délègue explicitement au lecteur sans lui donner d'outil**.
- **Ambition supplémentaire** : ANCRE est l'**implémentation de référence d'un ERC** à écrire (draft rédigé, dans le README §7).
- **Équipe** : 3 devs à l'aise en Solidity/EVM, un profil finance/quant.
- **État au 05/10** : 6 tours de conseil (décisions D1 à D47, qui **remplacent** toute convention antérieure, y compris `ARCHITECTURE.md` et `BACKEND-KIT.md` là où ils divergent). **Code livré et testé sur `main`** :
  - `contracts/` : `AnchoredReputation` v1 et `TrustGatedPayer`, 147 tests dont les forks ;
  - `solver/` : solveur, certificateur et surveillant, 135 tests ;
  - `indexer/` : Envio, 28 tests, parité avec le solveur sur 3 chaînes ;
  - `plugin/` : `mm ancre`, 48 tests ;
  - `docs/erc/` : draft d'ERC, lint eipw à 0 erreur, vérificateur indépendant.
  **Restent ouverts** : 3 défauts de conception du contrat (AM-08.A, B, C), les chantiers 06, 07 et 09, et les actions de Hugo.

## 2. Comment travailler avec Hugo (important)

- **Répondre en français.** Le README et l'ERC sont en anglais (jury + dépôt `ethereum/ERCs`), le reste en français.
- **Règle de veille non négociable** : *ne jamais reprendre un chiffre sans le sourcer et le dater*. Marquer explicitement **mesuré / auto-déclaré / estimé / non vérifié**. Le vault contient des contre-exemples (compteur x402.org gelé depuis mars 2026, « 1 M TPS » de labo, etc.).
- **Il veut de la nouveauté et un cas concret**, pas un catalogue d'options. Retour de jury d'un hackathon précédent (5e, à 0,2 point de la 4e) : *« idée bonne, mais pas assez novatrice ; la partie analyse n'a concrètement rien apporté »*. Donc : pas de brique « IA » décorative, et une démo qui se **sent** au lieu de s'expliquer.
- **Vault Obsidian de veille** : `/Users/hugo/Projet/dataBlockchain` sur cette machine (ce n'est pas un dépôt git ; ancien chemin sur l'autre machine : `/Users/famillethomas/Projet/datablockchain`). Lecture seule pour les agents. Notes clés :
  - `2 - EVM/Monad (L1)/Hackathons/🔬 Metropolis — dossier projet ANCRE (réputation ERC-8004).md` ← la fiche projet, version française plus riche que le README
  - `.../📜 ERC draft — Anchored Reputation for Trustless Agents.md`
  - `.../Metropolis — event, tracks et concurrence.md` ← la liste des ~50 concurrents
  - `.../_data-metropolis/{fb.json,agents.json}` ← snapshot on-chain du 21/09 (23 Mo, hors dépôt)
  - `2 - EVM/Monad (L1)/Docs-officielles/Différences EVM — Monad vs Ethereum.md` ← **à lire avant d'écrire du Solidity**
  - `5 - Normes & Standards/` ← d'où viennent EigenTrust, Dwork-Naor, Haber-Stornetta, SPKI, etc.
  - `_ETAT-VEILLE.md` ← point de sauvegarde général

## 3. Ce qui est VÉRIFIÉ (ne pas re-vérifier)

- Registres ERC-8004 **v2.0.0** sur **Monad mainnet (143)** : Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (proxys ERC-1967). **Aussi sur le testnet (10143), à d'autres adresses** : Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`, `getVersion()` = 2.0.0 (vérifié par `cast` le 27/09 ; les adresses mainnet n'ont pas de code sur le testnet).
- `getSummary(agentId, [], "", "")` **revert** : la liste de noteurs est obligatoire. Le filtrage Sybil est délégué au lecteur, l'EIP le dit noir sur blanc.
- Plus de `feedbackAuth` en v2.0.0 : n'importe qui note, gratuitement. Seul garde-fou : `!isAuthorizedOrOwner`.
- Données Monad au 21/09 : **10 171 agents, 9 188 feedbacks, 84 agents notés**. Ferme « Spawn-8004 » : **7 665 feedbacks (83 %)** vers `Eve-8004` (#182), agents créés les 16-17/02/2026 à ~300/h, **117 notes à 1e38**. Agents #9 et #87 : 518 et 508 notes venant **du même wallet** `0xd8a01de3…e38c` (tag `elo`). **36 arêtes seulement** (= 36 couples, 37 avis) où le noteur est owner d'un agent noté : 33 vers Eve, 3 de `0xea0b…` (#18) vers #2/#3/#4. Après schéma de tags minimal : **3 arêtes utiles, une seule chaîne honnête** (2 sauts). **Aucun avis entre le 2026-09-10 et le 27/09, puis 95 nouveaux avis de 20 clients depuis le bloc 108 483 651** (le registre n'est plus dormant), 0 révoqué ; `valueDecimals = 0` sauf **24 avis à 2 décimales** (8004scan les affiche à 0 : **relire on-chain via `readAllFeedback`, ne pas se fier à l'API**, R4 27/09). 84 agents notés dont 10 absents de l'index 8004scan (mesuré 27/09, snapshot 21/09 identique avis par avis).
- Registres (vérifié 27/09, source `erc-8004/erc-8004-contracts` master) : `readFeedback(agentId, client, uint64 idx)` renvoie `(value, decimals, tag1, tag2, isRevoked)`, **index à partir de 1** ; `getLastIndex` et **`getClients(agentId)` existent** ; pas d'index par client ; aucun bloc stocké. **Garde-fou anti-auto-notation = owner/opérateurs/approved, PAS `agentWallet`** (78 cas réels sur #8317). `agentWallet` **effacé (→ 0x0) à chaque transfert** ; **non unique** (178 wallets partagés par 1 773 agents). **Les deux registres sont des proxys UUPS upgradables par une seule EOA** `0x5472…2603` ; une v2.1.0 (wallet unique, index inverse) est prête en amont, non déployée.
- **Temps de bloc mesuré : 0,302 s** sur 1 000 blocs (27/09) ; le 0,4 s venait de viem, périmé.
- Facilitator x402 Monad : `https://x402-facilitator.molandak.org/supported` → v2, `exact` + `upto`, `eip155:143` et `eip155:10143`. USDC natif `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 décimales).
- Aucun ERC ne couvre l'agrégation de réputation (vérifié dans `ethereum/ERCs` ; 3 PR fermées sans merge).
- Post **#309** du fil ethereum-magicians #25098 demande exactement les ancres choisies par le lecteur, **sans réponse des auteurs**.
- Concurrents actifs : **ColinkaMir/monad-agent-trust** (créé 18/09, poussé quotidiennement, même jeu de données, angle provenance de paiement — **complémentaire, pas à concurrencer**) et **AInima-Collective/trustgraphs** (★8, PageRank ZK sur EAS, Sepolia).

## 4. Ce qui est ESTIMÉ (à remplacer par des mesures)

- ~~350-400 gas par arête~~ : **faux**, le plancher calldata EIP-7623 est actif sur Monad (40 gas/octet non nul, mesuré). Cible ~320 gas/arête avec un encodage compact de ~8 octets (estimé). Les ~3,7M gas « graphe entier » sont hors sujet : on ne certifie que le support (quelques nœuds sur le graphe réel). → `forge test --gas-report` réel (R5).
- ~~`score = t·N`~~ : abandonné au tour 1 (D1, N gonflable). Score = part de masse en WAD.
- La pondération des arêtes (valeur normalisée × filtre de provenance) n'a pas été validée sur les données.

## 5. Les décisions déjà prises (ne pas rouvrir sans raison)

| Décision | Pourquoi |
|---|---|
| **PPR / EigenTrust**, pas Advogato ni SybilRank | Seul à avoir **et** une borne Sybil formelle **et** un certificat en une passe |
| **Ancres choisies par le lecteur**, pas de score global | Les auteurs d'ERC-8004 jugent un score unique « dangerous » ; répond au #309 |
| **Matrice en calldata**, pas en storage | Lire le storage du registre coûte ~20k gas/arête (MIP-8) |
| **Norme chain-agnostic**, Monad non cité dedans | 8004 est sur 40+ chaînes ; une norme mono-chaîne meurt |
| ~~Deux niveaux `Verified` / `Optimistic`~~ → **deux niveaux** `Registry-verified` (chaque arête relue dans le registre ; 14,97 M gas pour la démo, mesuré) et `Submitter-attested` (soumetteurs listés dans le `setId`, preuves d'écart) (D32) | Un certificat fabriqué remplaçait l'honnête (faille AM-5.9) |
| **Décisions D1-D47 du conseil** (`docs/conseil/CR-conseil.md`) | Elles priment sur l'ancien draft d'ERC, sur `ARCHITECTURE.md` et sur `BACKEND-KIT.md` ; draft réécrit dans `docs/erc/anchored-reputation.md` |
| **Score = part de masse en WAD**, lecture par `isTrusted(agentId, setId)` (politique engagée dans le `setId`) | `score = t·N` gonflable (D1) ; `assess` OK ≠ fiable (D39) |
| **Override de paiement réservé à l'humain**, depuis son propre wallet (D47) | Un agent ne doit jamais pouvoir forcer un paiement |
| **Valeur hors bornes → rejetée, pas plafonnée** | Sinon un 1e38 atterrit en haut de l'échelle |
| ~~Dépôt privé~~ → **à rendre public à la soumission** (règle OSI probable, bounty Envio) ; la divulgation aux auteurs d'ERC-8004 doit partir avant (D29) | Décision de Hugo, voir MUSTDO |
| **README en anglais** | Jury international + dépôt `ethereum/ERCs` |

## 6. Ce qu'il ne faut PAS refaire

- **Ne pas pitcher « vérifier le point fixe on-chain » comme une invention** : le PoC OpenRank (Karma3) le faisait déjà. La nouveauté est la combinaison.
- **Ne pas prétendre qu'une preuve de paiement suffit** contre les Sybil : la ferme d'Eve payait, et le propriétaire finançait les noteurs (mesure de ColinkaMir : 16 avis propres sur 9 188).
- **Ne pas promettre « recalcul à chaque bloc en continu »** : 3,7M gas × 288 000 blocs/jour, ce n'est pas tenable. On recalcule **à chaque changement du graphe**.
- **Ne pas annoncer un classement positif des agents honnêtes** à partir du graphe réel : 36 arêtes utiles. ANCRE tue la ferme, mais dira « inconnu » pour presque tout le monde ; la démo positive exige notre propre trafic.
- **Ne pas dériver vers un passeport d'agent** : c'est ce que font les 18 concurrents.

## 7. Pièges Monad (avant la première ligne de Solidity)

- On paie la **gas limit**, pas le gas consommé → gas limits explicites et serrées.
- **`block.number`, jamais `block.timestamp`** pour les époques (3-4 blocs partagent la même seconde).
- **`prevrandao` est connu du leader** → jamais seul pour tirer des ancres ou des auditeurs.
- **Réserve de 10 MON par compte** : un compte en dessous n'envoie qu'une tx avec valeur tous les ~3 blocs (compte pour scripter une ferme de démo).
- **`eth_getLogs` ≤ 100 blocs** par appel sur `rpc.monad.xyz` ; **`rpc1.monad.xyz` accepte tout l'historique** (mesuré 27/09). Indexeur maison obligatoire (l'index 8004scan est incomplet).
- **MIP-8 actif depuis le 2026-09-02** : stockage facturé par page de 128 slots ; tableau contigu réécrit sur place ≈ 100 gas/slot, **chaque clé de `mapping` = une page** (8 100 à la lecture). **`eth_getProof` n'existe pas**, racine d'état non vérifiable à la Ethereum. EIP-2935 : 8 191 blocs. Temps de bloc 0,3 s ou 0,4 s selon la doc (non tranché).
- **Registres 8004 sur le testnet aux adresses `0x8004A818…` / `0x8004B663…`** (pas celles du mainnet) → on peut développer et répéter la démo sur le testnet sans redéployer de registre.
- `ecrecover` coûte 6 000 gas (2× Ethereum) ; precompile **P256 à `0x0100`** à 6 900 (utile pour des ancres en passkey ; ⚠️ le bounty « passkeys » de la Monad Foundation vise **Mera**, pas le P256 en général — tour 5A, 27/09).
- Foundry **≥ 1.8** pour `network = "monad"` (installé : 1.8.3 dans `~/.foundry/bin`, pas dans le PATH par défaut).

## 8. Commandes utiles (testées)

```bash
# Machine actuelle (/Users/hugo, vérifié 27/09) : Foundry dans ~/.foundry/bin, python3 = 3.14 (/opt/homebrew/bin/python3), gh absent
export PATH="$PATH:$HOME/.foundry/bin"
# Ancienne machine : git système (/usr/local/bin/git cassé), python /opt/homebrew/bin/python3.12
# export PATH=/usr/bin:$PATH

# état des registres
cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 "name()(string)" --rpc-url https://rpc.monad.xyz

# snapshot des données (sans clé API ; feedbacks paginés par offset, agents par cursor)
curl -sL "https://www.8004scan.io/api/v1/feedbacks?chain_id=143&limit=100&offset=0"
curl -sL "https://www.8004scan.io/api/v1/agents?chain_id=143&limit=100"

# python : python3 (3.14) fonctionne sur cette machine
```
RPC mainnet : `https://rpc.monad.xyz` (25 rps) · testnet : `https://testnet-rpc.monad.xyz` (50 rps).

## 9. Prochaines actions, dans l'ordre

> **Obsolète depuis le 2026-09-27** : la feuille de route à jour est `docs/chantiers/ROADMAP.md`, les décisions sont dans `docs/conseil/CR-conseil.md`. `BACKEND-KIT.md` (24/09, 3 chantiers numérotés 01-03 autrement) est **remplacé** par `docs/chantiers/` (9 chantiers) ; `ARCHITECTURE.md` (26/09) décrit la couche produit, à réconcilier (voir le CR, tour 7). Liste d'origine conservée ci-dessous pour mémoire.

1. **`AnchoredReputation.sol`** (niveau `Verified`) + `forge test --gas-report` → remplacer les estimations du README §4. **C'est le point qui peut tuer le projet : à faire en premier.**
2. **Indexeur** des events `NewFeedback` / `FeedbackRevoked` (HyperSync) + reconstruction du graphe via `getAgentWallet` / owner ERC-721.
3. **Solveur PPR** hors chaîne + normalisation par tag, validé sur le snapshot du 21/09.
4. **`TrustGatedRouter`** (x402 `upto`, USDC) + script de ferme Sybil pour la démo.
5. **Écran de démo** live (`monadLogs`, dédoublonner les blocs spéculatifs) : naïf vs ANCRE, disjoncteur.
6. **Publier le draft d'ERC** : PR sur `ethereum/ERCs` + **réponse au post #309** sur ethereum-magicians (pas encore rédigée).
7. Déploiement **mainnet (143)**, vidéo de démo, profil de projet.

## 10. Questions ouvertes

- **Nom du projet** : ANCRE est provisoire.
- **Ensembles d'ancres par défaut** : qui, et comment le justifier publiquement ?
- **Contacter ColinkaMir** pour consommer son signal de provenance plutôt que le réimplémenter ?
- **Alternative non tranchée** : la « caméra témoin » (empreinte perceptuelle de chaque image ancrée à chaque bloc, provenance vidéo qui survit au ré-encodage). C'est un **exemple officiel de la track**, **aucun concurrent repéré**, et le thème capteur/caméra convertit à ×3,78 dans les données Blitz, contre ×0,77 pour identité/réputation. Détail dans la fiche du vault, §9.
- **Le dépôt reste-t-il privé** jusqu'à la soumission ?

# CLAUDE.md — reprise de contexte ANCRE

> Fichier de passation. Lis-le **avant** le README. Le README dit *ce qu'on construit* ; celui-ci dit *où on en est, ce qui est vérifié, et ce qu'il ne faut pas refaire*.
> Dernière mise à jour : **2026-09-23**. Auteur : session Claude Code avec Hugo (`hugo.thomas.perso@gmail.com`, GitHub `hugothomas9`).

## 1. Le contexte en 10 lignes

- **Objectif** : gagner (ou bien figurer à) **Monad Metropolis**, hackathon en ligne, **clôture des soumissions le 2026-10-13**, jugement jusqu'au 27/10, résultats le 03/11. 30 k$ par track + 25 k$ Grand Champion. Jury : cofondateurs Monad, Paradigm, Dragonfly, Electric Capital, Galaxy, Nansen, Pantera, Castle Island.
- **Track visée** : **04 — Trust, Identity & AI Infra**. Elle est **saturée** (~18 projets repérés le 18/09), presque tous des clones « passeport d'agent + ERC-8004 + passkey ».
- **Projet retenu** : **ANCRE** — agrégation de réputation ERC-8004 résistante aux Sybil, **relative aux ancres choisies par le lecteur**, certifiée on-chain, **lisible par un contrat avant de payer**. Nom provisoire, à changer si mieux.
- **Angle qui sauve du « ERC-8004 de plus »** : on ne fait pas un registre, on fait **la couche que la norme délègue explicitement au lecteur sans lui donner d'outil**.
- **Ambition supplémentaire** : ANCRE est l'**implémentation de référence d'un ERC** à écrire (draft rédigé, dans le README §7).
- **Équipe** : 3 devs à l'aise en Solidity/EVM, un profil finance/quant.
- **État** : recherche et spec terminées. **Zéro ligne de code écrite.**

## 2. Comment travailler avec Hugo (important)

- **Répondre en français.** Le README et l'ERC sont en anglais (jury + dépôt `ethereum/ERCs`), le reste en français.
- **Règle de veille non négociable** : *ne jamais reprendre un chiffre sans le sourcer et le dater*. Marquer explicitement **mesuré / auto-déclaré / estimé / non vérifié**. Le vault contient des contre-exemples (compteur x402.org gelé depuis mars 2026, « 1 M TPS » de labo, etc.).
- **Il veut de la nouveauté et un cas concret**, pas un catalogue d'options. Retour de jury d'un hackathon précédent (5e, à 0,2 point de la 4e) : *« idée bonne, mais pas assez novatrice ; la partie analyse n'a concrètement rien apporté »*. Donc : pas de brique « IA » décorative, et une démo qui se **sent** au lieu de s'expliquer.
- **Vault Obsidian de veille** : `/Users/famillethomas/Projet/datablockchain` (ce n'est pas un dépôt git). Notes clés :
  - `2 - EVM/Monad (L1)/Hackathons/🔬 Metropolis — dossier projet ANCRE (réputation ERC-8004).md` ← la fiche projet, version française plus riche que le README
  - `.../📜 ERC draft — Anchored Reputation for Trustless Agents.md`
  - `.../Metropolis — event, tracks et concurrence.md` ← la liste des ~50 concurrents
  - `.../_data-metropolis/{fb.json,agents.json}` ← snapshot on-chain du 21/09 (23 Mo, hors dépôt)
  - `2 - EVM/Monad (L1)/Docs-officielles/Différences EVM — Monad vs Ethereum.md` ← **à lire avant d'écrire du Solidity**
  - `5 - Normes & Standards/` ← d'où viennent EigenTrust, Dwork-Naor, Haber-Stornetta, SPKI, etc.
  - `_ETAT-VEILLE.md` ← point de sauvegarde général

## 3. Ce qui est VÉRIFIÉ (ne pas re-vérifier)

- Registres ERC-8004 **v2.0.0** déployés sur **Monad mainnet (143)**, **absents du testnet (10143)** : Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (proxys ERC-1967).
- `getSummary(agentId, [], "", "")` **revert** : la liste de noteurs est obligatoire. Le filtrage Sybil est délégué au lecteur, l'EIP le dit noir sur blanc.
- Plus de `feedbackAuth` en v2.0.0 : n'importe qui note, gratuitement. Seul garde-fou : `!isAuthorizedOrOwner`.
- Données Monad au 21/09 : **10 171 agents, 9 188 feedbacks, 84 agents notés**. Ferme « Spawn-8004 » : **7 665 feedbacks (83 %)** vers `Eve-8004` (#182), agents créés les 16-17/02/2026 à ~300/h, **117 notes à 1e38**. Agents #9 et #87 : 518 et 508 notes venant **chacune d'un seul wallet**. **36 arêtes seulement** où le noteur est lui-même noté.
- Facilitator x402 Monad : `https://x402-facilitator.molandak.org/supported` → v2, `exact` + `upto`, `eip155:143` et `eip155:10143`. USDC natif `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 décimales).
- Aucun ERC ne couvre l'agrégation de réputation (vérifié dans `ethereum/ERCs` ; 3 PR fermées sans merge).
- Post **#309** du fil ethereum-magicians #25098 demande exactement les ancres choisies par le lecteur, **sans réponse des auteurs**.
- Concurrents actifs : **ColinkaMir/monad-agent-trust** (créé 18/09, poussé quotidiennement, même jeu de données, angle provenance de paiement — **complémentaire, pas à concurrencer**) et **AInima-Collective/trustgraphs** (★8, PageRank ZK sur EAS, Sepolia).

## 4. Ce qui est ESTIMÉ (à remplacer par des mesures)

- **~350-400 gas par arête** vérifiée, **~3,7M gas** pour tout le graphe réel, **~0,37 MON** à 100 gwei. → première tâche de code : `forge test --gas-report` réel.
- Les conventions `score = t·N` et `errorBound = (r/α)·N` du draft d'ERC sont **mes choix**, pas un standard. À challenger.
- La pondération des arêtes (valeur normalisée × filtre de provenance) n'a pas été validée sur les données.

## 5. Les décisions déjà prises (ne pas rouvrir sans raison)

| Décision | Pourquoi |
|---|---|
| **PPR / EigenTrust**, pas Advogato ni SybilRank | Seul à avoir **et** une borne Sybil formelle **et** un certificat en une passe |
| **Ancres choisies par le lecteur**, pas de score global | Les auteurs d'ERC-8004 jugent un score unique « dangerous » ; répond au #309 |
| **Matrice en calldata**, pas en storage | Lire le storage du registre coûte ~20k gas/arête (MIP-8) |
| **Norme chain-agnostic**, Monad non cité dedans | 8004 est sur 40+ chaînes ; une norme mono-chaîne meurt |
| **Deux niveaux `Verified` / `Optimistic`** | Même texte partout ; seul Monad rend `Verified` banal à chaque mise à jour |
| **Valeur hors bornes → rejetée, pas plafonnée** | Sinon un 1e38 atterrit en haut de l'échelle |
| **Dépôt privé** | ColinkaMir travaille sur le même jeu de données |
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
- **`eth_getLogs` ≤ 100 blocs** par appel → indexeur obligatoire (Envio HyperSync, clé gratuite ; l'API publique de HyperSync exige un token).
- **Registres 8004 absents du testnet** → déployer les nôtres sur testnet pour développer, lire le mainnet en lecture seule.
- `ecrecover` coûte 6 000 gas (2× Ethereum) ; precompile **P256 à `0x0100`** à 6 900 (utile pour des ancres en passkey, bounty Monad Foundation 2,5 k$).
- Foundry **≥ 1.8** pour `network = "monad"`.

## 8. Commandes utiles (testées)

```bash
# git système (le /usr/local/bin/git de la machine est cassé : bad CPU type)
export PATH=/usr/bin:$PATH

# état des registres
cast call 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 "name()(string)" --rpc-url https://rpc.monad.xyz

# snapshot des données (sans clé API ; feedbacks paginés par offset, agents par cursor)
curl -sL "https://www.8004scan.io/api/v1/feedbacks?chain_id=143&limit=100&offset=0"
curl -sL "https://www.8004scan.io/api/v1/agents?chain_id=143&limit=100"

# python : utiliser /opt/homebrew/bin/python3.12 (le python3 du PATH est cassé)
```
RPC mainnet : `https://rpc.monad.xyz` (25 rps) · testnet : `https://testnet-rpc.monad.xyz` (50 rps).

## 9. Prochaines actions, dans l'ordre

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

# ANCRE — architecture produit

> Un moteur, quatre surfaces. Le moteur est le certificat de confiance vérifié on-chain (voir README §3 et §7). Les quatre surfaces sont : émettre, importer, domaine fermé, revues.
> Version du 2026-09-26. Front exclu du découpage back (voir BACKEND-KIT.md), mais décrit ici parce que le produit doit se tenir en entier.

---

## 0. Le principe qui gouverne tout le reste

**La confiance n'existe pas dans l'absolu. Elle existe *depuis* quelqu'un.**

Tout, dans ce produit, découle de là : un score est toujours calculé depuis un ensemble d'ancres, et le même agent peut valoir 0,9 chez un lecteur et 0 chez un autre. C'est ce qui rend possible le domaine privé (surface 3) sans aucun mécanisme supplémentaire, et c'est ce qui interdit la « certification à la naissance ».

Trois règles qui en découlent, et qu'aucune surface n'a le droit de violer :

1. **Un agent neuf vaut zéro.** On ne certifie pas un agent, on le parraine — et le parrainage est plafonné, cautionné, révocable.
2. **Une revue d'un compte inatteignable depuis les ancres du lecteur pèse zéro.** L'interface l'affiche au lieu de la cacher.
3. **Le refus vient du contrat.** Quand un paiement est bloqué, ce n'est pas l'application qui a décidé ; c'est `trustOf` lu on-chain, avec une fraîcheur bornée en blocs.

---

## 1. Vue d'ensemble

```
   SURFACES (ce que l'utilisateur voit)
   ┌──────────────┬──────────────┬────────────────────┬──────────────┐
   │ 1. Émettre   │ 2. Importer  │ 3. Domaine fermé   │ 4. Revues    │
   │  + parrain   │  + revendiq. │  ancres + politique│  pondérées   │
   └──────┬───────┴──────┬───────┴─────────┬──────────┴──────┬───────┘
          │              │                 │                 │
   ┌──────▼──────────────▼─────────────────▼─────────────────▼───────┐
   │ COUCHE PRODUIT (contrats ANCRE)                                  │
   │  AgentFactory · VouchBond · TrustDomain · TrustGatedRouter       │
   └──────────────────────────┬───────────────────────────────────────┘
                              │ lit trustOf(agentId, anchorSetId)
   ┌──────────────────────────▼───────────────────────────────────────┐
   │ MOTEUR (la norme)                                                │
   │  AnchoredReputation (Verified / Optimistic) · TagSchemaRegistry  │
   │        ▲ certificat + calldata                                   │
   │  solveur PPR · publieur · watcher · indexer          (off-chain) │
   └──────────────────────────┬───────────────────────────────────────┘
                              │ events
   ┌──────────────────────────▼───────────────────────────────────────┐
   │ SOCLE — ERC-8004 (non modifié)                                    │
   │  IdentityRegistry 0x8004A169…a432 · ReputationRegistry 0x8004BAa1…│
   │  ou une instance permissionnée déployée par une entreprise        │
   └───────────────────────────────────────────────────────────────────┘
```

**Ce qu'on n'écrit pas** : aucun nouveau registre d'identité, aucun format de feedback propriétaire. Tout passe par ERC-8004 tel quel. C'est ce qui nous sépare des ~18 projets « passeport d'agent » de la track.

---

## 2. Les contrats

### 2.1 Moteur (couverts par le chantier 03 du BACKEND-KIT)

| Contrat | Rôle | Points durs |
|---|---|---|
| `AnchoredReputation.sol` | Publie et vérifie les certificats. `trustOf(agentId, anchorSetId) → (score, errorBound, epoch, level)` | Niveau Verified : recalcul keccak + résidu dans la tx. Niveau Optimistic : caution, fenêtre en blocs, 3 contestations |
| `TagSchemaRegistry.sol` | Déclare l'échelle de chaque tag, indexée par (registrant, tag) | Hors bornes = rejeté, jamais plafonné |

### 2.2 Couche produit (nouveau, ce document)

| Contrat | Rôle | Dépendances |
|---|---|---|
| `AgentFactory.sol` | Émet un agent : `register()` sur l'IdentityRegistry, pose les métadonnées, lie éventuellement un `agentWallet` passkey, puis déclenche le parrainage | IdentityRegistry, VouchBond |
| `VouchBond.sol` | Le parrainage : caution en USDC, plafond de confiance délégable, expiration, révocation, slashing | ReputationRegistry (lecture), USDC |
| `TrustDomain.sol` | Un domaine = ancres + schémas + politique + membres. Émet `DomainPolicyUpdated` | AnchoredReputation, TagSchemaRegistry |
| `TrustGatedRouter.sol` | Paie un fournisseur en x402 `upto` **si** la politique du domaine est satisfaite | TrustDomain, AnchoredReputation, USDC |
| `PermissionedRegistry.sol` *(option entreprise)* | Une instance ERC-8004 dont `register()` est réservé à l'admin du domaine | — |

### 2.3 Le parrainage, en détail

Un parrainage n'est **pas** un nouveau type d'objet. C'est un feedback ERC-8004 ordinaire avec un tag réservé, plus une caution :

```
1. Le parrain P (déjà atteignable depuis des ancres) appelle VouchBond.vouch(childAgentId, cap, bondAmount, expiry)
2. VouchBond verrouille la caution en USDC et appelle ReputationRegistry.giveFeedback(
       childAgentId, value=cap, valueDecimals=…, tag1="ancre:vouch", tag2=<domainId>, …)
3. Le solveur traite cette arête comme les autres, MAIS applique le plafond :
   le poids de l'arête P→enfant est borné à `cap` (exprimé en fraction de la masse sortante de P)
4. Si l'enfant reçoit un feedback négatif d'une ancre du domaine, ou si sa caution est contestée,
   VouchBond.slash() confisque la caution et révoque le feedback de parrainage (revokeFeedback)
```

**Pourquoi c'est propre** : le parrain ne « certifie » rien, il **prête** une part plafonnée de sa propre confiance, et il paie s'il se trompe. La métrique dérivée (le taux de parrainages slashés d'un émetteur) se calcule dans le solveur, s'affiche, et se lit avant de faire confiance à un émetteur en gros.

⚠️ **Limite à dire** : en PageRank personnalisé, pointer vers un mauvais nœud ne fait pas mécaniquement baisser le score du pointeur. La responsabilité du parrain est donc **économique** (la caution) et **réputationnelle par métrique dérivée**, pas automatique via l'algorithme. Ne pas prétendre l'inverse.

### 2.4 Un domaine de confiance

```solidity
struct Domain {
    bytes32 anchorSetId;      // les ancres du domaine (AnchoredReputation)
    bytes32 schemaRoot;       // les échelles de tags admises
    address registry;         // l'IdentityRegistry utilisé (public 0x8004… ou permissionné)
    uint256 minScore;         // seuil, en 1e18 (1e18 = moyenne uniforme)
    uint64  maxStaleness;     // en BLOCS, pas en secondes
    uint8   minLevel;         // 0 = Optimistic accepté, 1 = Verified exigé
    bool    membershipOnly;   // n'autorise que les agents inscrits au domaine
    address admin;
}
```

La **double vérification** demandée pour les entreprises est exactement ces deux lignes, exécutées par le contrat avant chaque paiement :

```solidity
require(!d.membershipOnly || isMember[domainId][agentId], "hors domaine");
(uint256 s, uint256 err, uint64 epoch, uint8 lvl) = ancre.trustOf(agentId, d.anchorSetId);
require(lvl >= d.minLevel && block.number - epoch <= d.maxStaleness, "certificat périmé ou trop faible");
require(s - err >= d.minScore, "confiance insuffisante");
```

Trois niveaux d'isolation possibles, à vendre différemment :

| Niveau | Comment | Ce que ça protège | Ce que ça ne protège pas |
|---|---|---|---|
| **A — Domaine logique** | Ancres privées + politique, registre public | Le sens des scores : les avis extérieurs pèsent zéro | Rien n'est caché ; tout le monde lit le graphe |
| **B — Registre permissionné** | Instance ERC-8004 dont `register()` est réservé à l'admin | L'appartenance : personne ne s'auto-inscrit | L'existence du trafic reste publique |
| **C — Contenu hors chaîne** | Seuls les hash et les valeurs numériques on-chain ; le texte des revues chez le client | Le contenu des revues et des preuves | Le graphe des relations reste déductible |

> Ce qu'on ne fait pas, et qu'il faut dire à un prospect : **cacher le graphe lui-même**. Ça demanderait du chiffrement homomorphe ou des preuves ZK sur le calcul, et c'est un autre projet. Voir « pistes écartées » en §8.

---

## 3. Les six flux

### F1 — Émettre un agent parrainé *(surface 1)*
```
Utilisateur → AgentFactory.issue(profile, domainId, cap, bond)
  ├─ IdentityRegistry.register(agentURI, metadata)        [1 tx]
  ├─ (option) setAgentWallet(passkey P256, signature EIP-712)
  ├─ VouchBond.vouch(childId, cap, bond, expiry)          [1 tx, USDC verrouillé]
  └─ publication du registration file (services, x402Support, supportedTrust → ANCRE)
→ le publieur recertifie le domaine : score de l'enfant > 0, plafonné, visible en ~0,6 s
```
**Affichage obligatoire** : le score initial réel, le plafond, le parrain, la caution. Jamais le mot « certifié » seul.

### F2 — Importer et revendiquer un agent existant *(surface 2)*
```
Utilisateur colle un agentId (n'importe quelle chaîne ERC-8004)
  ├─ preuve de possession : signature de l'owner ERC-721, ou ERC-1271 si c'est un contrat
  ├─ liaison des schémas de tags (TagSchemaRegistry)
  ├─ l'indexer récupère tout son historique de feedback
  └─ le solveur le place dans le graphe → score sous LES ancres du lecteur
```
**Cas cross-chain** : l'agent est enregistré sur Base, le certificat est calculé et publié sur Monad. Le champ `chainId` du certificat porte l'origine. Le consommateur qui lit sur Monad a la fraîcheur maximale ; un consommateur sur une autre chaîne relaie le certificat et l'accepte en Optimistic.

### F3 — Créer un domaine d'entreprise *(surface 3)*
```
Admin → TrustDomain.create(anchors[], schemaRoot, policy, registry)
  ├─ choix des ancres : employés, auditeurs, partenaires déjà ancrés
  ├─ choix du niveau d'isolation A / B / C
  ├─ (niveau B) déploiement d'un PermissionedRegistry
  └─ invitation des membres → isMember[domainId][agentId]
→ le publieur ajoute une colonne d'ancres ; grâce à la linéarité du PPR,
  un nouvel ensemble d'ancres ne coûte pas un recalcul complet
```

### F4 — Déposer une revue *(surface 4)*
```
Client → ReputationRegistry.giveFeedback(agentId, value, decimals, tag1, tag2, endpoint, uri, hash)
  ├─ le contenu détaillé va hors chaîne ; seul le hash est engagé
  ├─ (option) proofOfPayment : le txHash du paiement x402 qui a précédé
  └─ droit de réponse de l'agent : appendResponse() ; révocation : revokeFeedback()
→ le solveur recalcule ; l'interface affiche le POIDS EFFECTIF de la revue dans le domaine du lecteur
  (« cette revue compte pour 0,00 dans votre domaine — son auteur n'est atteignable depuis aucune de vos ancres »)
```

### F5 — Payer sous condition de confiance
```
Agent acheteur → TrustGatedRouter.pay(domainId, providerAgentId, maxAmount)
  ├─ vérifications §2.4 (membre + niveau + fraîcheur + score − marge d'erreur)
  ├─ règlement x402 `upto` en USDC natif Monad
  └─ (option) prix inversement proportionnel au score
→ refus = revert du contrat, avec une raison lisible
```

### F6 — Attaque et disjoncteur *(le cœur de la démo)*
```
t0      une ferme crée N agents et dépose N revues maximales sur un fournisseur malveillant
t0+Δ    le publieur recertifie : le score du fournisseur dans le domaine NE BOUGE PAS
        (aucune ancre n'atteint la ferme)
t1      un fournisseur honnête se met à mal se comporter ; UNE ancre dépose une revue négative
t1+~0,6s le certificat est republié, trustOf renvoie un score sous le seuil
t1+1 bloc TOUS les routeurs du domaine refusent de le payer
```

---

## 4. Le back off-chain

| Service | Rôle | Chantier |
|---|---|---|
| **Indexer** | Events 8004 → graphe déterministe + racines de Merkle | 01 |
| **Solveur** | PPR par ancre, résidu, calldata | 02 |
| **Publieur** | Recertifie à chaque changement du graphe ; vise l'ordre du bloc (0,3 s) | 02 |
| **Watcher** | Détecte omission / résidu faux, conteste, encaisse la caution | 02 |
| **API de lecture** | `GET /trust?agent=&domain=` — renvoie score, borne, époque, niveau, et **le certificat** pour revérification indépendante | nouveau, S4 |
| **SDK agent** | Wrapper x402 : un agent paie via le routeur sans connaître ANCRE | nouveau, S4 |

**Règle d'API** : toute réponse porte le certificat ou son hash. Un client qui ne nous fait pas confiance doit pouvoir revérifier on-chain sans nous demander la permission. C'est la différence avec les scoreurs à oracle signé (RNWY, TrustLayer).

---

## 5. Périmètre hackathon : ce qui est construit, ce qui est coupé

17 jours, 3 devs. Ordre de sacrifice décidé à l'avance, du plus important au premier coupé :

| Priorité | Élément | Si on coupe |
|---|---|---|
| **P0** | Moteur : indexer + solveur + `AnchoredReputation` niveau Verified + rapport de gas | Il n'y a plus de projet |
| **P0** | F6 (attaque + disjoncteur) sur le **vrai** registre Monad | Il n'y a plus de démo |
| **P1** | `TrustDomain` + `TrustGatedRouter` (surface 3, la vente) | On perd l'angle entreprise, le plus différenciant |
| **P1** | Surface 4 : revue + affichage du poids effectif | On perd la boucle produit |
| **P2** | `AgentFactory` + `VouchBond` (surface 1) | Le parrainage devient une slide et un contrat non déployé |
| **P2** | Surface 2 : import + revendication | On la démontre à la main, via un agent existant du mainnet |
| **P3** | Niveau Optimistic + contestations | On ne livre que Verified, en disant pourquoi ça suffit sur Monad |
| **P3** | Cross-chain (lecture d'un autre registre) | On l'annonce comme suite, sans le coder |

**Le piège à éviter** : construire une console SaaS à quatre onglets et n'avoir rien à montrer du mécanisme. Le jury juge le mécanisme. Les surfaces servent à le rendre tangible, pas l'inverse.

---

## 6. Script de démo (5 minutes)

| Temps | Écran | Ce qu'on dit |
|---|---|---|
| 0:00 | Le vrai registre ERC-8004 de Monad, classement naïf | « 9 188 avis. 83 % viennent d'une ferme de 7 665 faux agents créés en 48 heures. L'agent n°1 a une moyenne de 1,5 × 10³⁶. Ceci n'est pas une simulation. » |
| 0:45 | Le même registre, sous mes ancres | « Même données, mes ancres. La ferme vaut zéro. » |
| 1:30 | Domaine « ACME » : 3 ancres, politique, 2 fournisseurs | « Une entreprise ne veut pas d'un score mondial. Elle veut le sien. Ici, appartenance et score sont vérifiés par le contrat, pas par nous. » |
| 2:15 | Émission d'un agent parrainé | « Il ne naît pas certifié. Il naît parrainé, plafonné à 2 %, avec 50 USDC en caution. Son score est 0,03. » |
| 3:00 | **L'attaque, en direct** | 1 000 revues déposées. Le classement naïf explose à l'écran, le score du domaine ne bouge pas. |
| 3:45 | **Le disjoncteur, en direct** | Une ancre note négativement un fournisseur honnête devenu défaillant. Chronomètre à l'écran : le routeur refuse au bloc suivant. « 0,6 seconde. Sur Ethereum, c'est 12 secondes et trois blocs de confirmation. » |
| 4:30 | Le certificat | « Vous ne nous croyez pas ? Voici le certificat. Le résidu est vérifié on-chain, la borne d'erreur est publiée, et vous pouvez tout recalculer sans nous. » |

**Chiffres à afficher en direct, pas en slide** : le délai event → certificat en millisecondes, le gas consommé, le nombre d'arêtes vérifiées.

---

## 7. Ce qui est nouveau, surface par surface

| Surface | Déjà fait ailleurs | Ce qu'on ajoute |
|---|---|---|
| 1. Émettre | Des dizaines de factories d'agents 8004 | Le **parrainage plafonné et cautionné**, implémenté comme un feedback 8004 standard + caution. Aucun concurrent ne relie émission et responsabilité économique |
| 2. Importer | Les explorateurs 8004 affichent n'importe quel agent | Le score est **relatif au lecteur** et livré avec son **certificat revérifiable** |
| 3. Domaine fermé | Des allowlists, des registres privés | Le domaine privé **sans infrastructure privée** : c'est un ensemble d'ancres. Et la double vérification est **dans le contrat qui paie** |
| 4. Revues | `giveFeedback` existe | Le **poids effectif affiché** : une revue qui ne compte pas le dit. C'est le seul endroit du marché où un faux avis est visiblement inerte |

---

## 8. Risques et pistes écartées

- **La console qui mange le temps** — risque principal. Mitigation : §5, et le front ne démarre qu'après que F6 tourne en ligne de commande.
- **Quatre surfaces = quatre demi-produits.** Mitigation : une seule démo raconte les quatre (§6), dans cet ordre.
- **Le parrainage n'est pas une garantie algorithmique** (§2.3). À dire avant qu'on nous le demande.
- **Le graphe reste public** (§2.4). Écarté : chiffrement du graphe, ZK sur le calcul complet. Trop lourd pour 17 jours, et `trustgraphs` occupe déjà ce terrain avec SP1.
- **Le graphe réel est maigre** : 36 arêtes utiles. Les surfaces 1 et 3 sont justement ce qui le densifie — c'est l'argument produit, pas une excuse.
- **ColinkaMir** travaille sur le même jeu de données, côté provenance de paiement. On consomme son signal comme filtre d'arêtes, on ne le refait pas.

---

## 9. Ce que ça change pour BACKEND-KIT.md

Les trois chantiers restent valables. La couche produit s'ajoute au chantier 03 :

- `AgentFactory.sol`, `VouchBond.sol`, `TrustDomain.sol` rejoignent `contracts/`, après le P0.
- Le chantier 02 gagne deux calculs dérivés : le **plafond de parrainage** (borne du poids d'une arête `ancre:vouch`) et le **taux de parrainages slashés** par émetteur.
- Le chantier 01 gagne un filtre : les feedbacks de tag `ancre:vouch` sont des arêtes normales mais plafonnées, et leur révocation doit être suivie.
- Nouveau chantier possible (**S4**), si un quatrième développeur existe : API de lecture + SDK agent. Sinon, c'est un sous-lot du chantier 02, après le P1.

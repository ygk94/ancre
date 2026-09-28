# ANCRE — le projet en un seul document

> **État au 2026-09-27.** Ce document résume tout, mais il ne remplace pas les sources.
> - Décisions détaillées : `docs/conseil/CR-conseil.md` (journal D1 à D38).
> - Faits techniques sourcés : `docs/ressources/`.
> - Travail à faire : `docs/chantiers/`.
> - Actions de Hugo : `mustdo/MUSTDO.md`.
>
> **Statut des chiffres** : **MESURÉ** (relevé par nous, date donnée), **DOC** (documentation officielle), **ESTIMÉ** (calcul d'ordre de grandeur), **NON VÉRIFIÉ**.
> ANCRE est un nom provisoire.

---

## 1. En une phrase

**ANCRE est la couche que la norme ERC-8004 délègue au lecteur sans lui donner d'outil.** C'est une réputation d'agents IA résistante aux Sybil, **relative aux ancres que le lecteur choisit**, certifiée on-chain, et **lisible par un contrat avant qu'il paie**.

Le message de la démo : *sur le mainnet, la moyenne ment ; ANCRE refuse de payer au bloc suivant.*

---

## 2. Le but initial et le cadre

### Hackathon Monad Metropolis
- **Sources** : DOC https://monad.xyz/developers/hackathons/metropolis (27/09) et vault `Metropolis — event, tracks et concurrence.md`.
- **Format** : en ligne, développement du 1er septembre au 13 octobre 2026.
- **Clôture : 13/10 à 23:59, heure de New York, soit 14/10 à 05:59 à Paris.** Jugement du 14 au 27/10, résultats le 3 novembre.
- **Rendu** : un produit qui marche, un profil public, une vidéo, un write-up et un lien vers le code.
- **Règles non confirmées** (citées par un concurrent) :
  - dépôt GitHub public sous licence OSI ;
  - vidéo de 3 minutes maximum ;
  - outils IA à déclarer ;
  - 5 critères à 20 %, dont « Monad Integration ».
  - **À relire par Hugo : `mustdo/MUSTDO.md`, point 1.**
- **Jury** : les cofondateurs de Monad (Keone Hon, Eunice Giarta), Paradigm, Dragonfly, Electric Capital, Galaxy, Nansen, Pantera, Castle Island.
- **Prix** :
  - chaque track vaut **30 k$**, partagés entre 3 équipes ;
  - **Grand Champion : 25 k$** ;
  - les bounties sponsors s'ajoutent (« awarded on top »).
- **Track visée : 04 Trust, Identity & AI Infra.** Elle est saturée : environ 18 clones « passeport d'agent + ERC-8004 + passkey » repérés le 18/09.
- **Bounties visés (D38)** :
  - **Envio « Best Use of Envio »**, 1 k$ ;
  - **Mera « One Passkey, Many Keys »**, 2,5 k$ ;
  - **MetaMask « Best Agent Wallet Plugin »**, 2,5 k$. Il est affiché en track 01 : l'éligibilité depuis la track 04 est à confirmer.
  - Fiches complètes : `docs/conseil/bounties-sponsors.md`.
- **Leçon d'un jury précédent** (5e place) : *« idée bonne, mais pas assez novatrice ; l'analyse n'a rien apporté »*. Il faut donc de la nouveauté et une démo qui se **ressent** au lieu de s'expliquer. Pas de brique IA décorative.

### Équipe
Trois développeurs à l'aise en Solidity/EVM et un profil finance/quant. La répartition proposée (D31) est à valider par Hugo.

---

## 3. Le problème

### ERC-8004
C'est la norme d'identité et de réputation des agents IA. Elle est déployée à la même adresse sur plus de 40 chaînes : 20 vérifiées par nous (MESURÉ 27/09).

- **Identity Registry** : un NFT ERC-721 par agent. `agentWallet` vaut l'owner au mint et est **effacé à chaque transfert**.
- **Reputation Registry** : `giveFeedback(agentId, int128 value, uint8 valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)`.
  - N'importe qui peut noter, gratuitement.
  - **Seul garde-fou** : l'owner, les opérateurs et le token approuvé ne peuvent pas noter leur propre agent. **`agentWallet` n'est pas couvert.**
- **`getSummary(agentId, clients[], tag1, tag2)` exige la liste des noteurs à croire.** Avec une liste vide, elle revert : le filtrage Sybil est délégué au lecteur, et la spec écrit *« Sybil attacks are possible »*.
- **Aucun numéro de bloc n'est stocké par avis.** Seul le log de l'event date un avis.
- **Les deux registres sont des proxys UUPS upgradables par une seule EOA**, `0x5472…2603`, sans timelock. Une v2.1.0 est prête en amont (PR #80, wallet unique, index inverse) mais n'est pas déployée.

### Ce que montre le mainnet Monad
Snapshot du 21/09, identique avis par avis le 27/09, relu on-chain au bloc 108 434 518. Tout est MESURÉ.

- **9 188 avis, 84 agents notés**, plus de 10 000 agents enregistrés. Aucun avis entre le 2026-09-10 et le bloc 108 483 651. ⚠️ corrigé le 27/09 : le registre n'est plus dormant. **95 nouveaux avis d'execution.market** (un rattrapage automatique, posté par un relayer unique) portent le total à **9 283 avis**. Ils ajoutent **0 arête utile**, et l'acte 1 ne change pas. Source : `docs/ressources/nouveaux-avis-mainnet.md`.
- **Une ferme** : 7 665 agents « Spawn-8004 », créés les 15, 16 et 17/02/2026 à environ 300 par heure, notent tous « Eve-8004 » (#182). Cela fait **83 % des avis**, dont **117 valeurs à 1e38**, la borne autorisée.
  - **Moyenne naïve d'Eve : 1,53 × 10³⁶.**
- Les agents #9 et #87 ont reçu 518 et 508 avis, venant **du même wallet** (tag `elo`).
- Les échelles sont mélangées (sur 100, Elo à 1 600, ±1, 1e38).
  - `valueDecimals` vaut 0 partout, sauf 24 avis à 2 décimales.
  - **8004scan affiche ces 24 valeurs de façon fausse** : il faut relire les avis on-chain.
- **36 couples seulement** ont un noteur qui est lui-même owner d'un agent noté. Avec un schéma de tags minimal, il reste **3 arêtes utiles** et **une seule chaîne honnête** : `0x0730…/0xf7d5…` → #18 → {#2, #3, #4}.
- **Un seul avis négatif utile** : `0xea0b…` → #4, `slash −100` puis `review +1`, postés sous deux tags différents.
- **78 auto-notations** de #8317 par son propre `agentWallet` : le garde-fou est contourné en pratique.
- **178 wallets sont partagés par 1 773 agents** (jusqu'à 762 agents pour un wallet).
- **Arête d'attaque réelle** : le scanner `0xa06f907f` n'est **pas un complice**. C'est un service automatique de filtrage de risque (24 avis `trust/oracle-screening` et 8 `liveness`). Il note des agents Spawn, qui notent Eve. **Prendre ce scanner comme ancre fait fuir 34,6 % de la masse vers la ferme.**
- **Étude externe** (arXiv 2606.26028, NON VÉRIFIÉ) : comportement Sybil coordonné chez 73,5 % des noteurs sur Ethereum, 59,2 % sur BSC et 90,6 % sur Base.
- **ColinkaMir** (concurrent, mesure de son côté) : seuls 16 avis sur 9 188 sont « propres ». La ferme payait ses cibles, mais le propriétaire finançait les noteurs. **Le paiement ne prouve rien.**

---

## 4. La solution, en entier

### 4.1 Principe

On calcule un **PageRank personnalisé** (famille EigenTrust) sur le graphe des avis. Il est **ancré sur les ancres choisies par le lecteur** : il n'y a pas de score global, parce que les auteurs d'ERC-8004 jugent un score unique « dangerous ». Le post #309 d'ethereum-magicians demande exactement ça.

Le calcul se fait hors chaîne. Le contrat le **vérifie on-chain en une passe**. Un contrat tiers lit `trustOf` ou `assess(agentId, setId)` avant de payer.

**Résultat classique** (Cheng & Friedman, 2005) : seules les fonctions asymétriques, ancrées sur des graines, peuvent résister aux Sybil. La masse qui entre dans une région Sybil S est bornée par ce qui traverse les arêtes d'attaque : π(S) ≤ ((1−α)/α)·Σ π(u)·c_uv. **R4 a mesuré que cette borne est atteinte** : elle n'est pas lâche.

### 4.2 Construction du graphe

| Règle | Décision |
|---|---|
| Unité d'arête | **Dernier avis non révoqué par (client, agent, tag1)**, ordonné par `feedbackIndex`. Entre les tags du filtre, **le négatif domine** : si un tag est négatif, w = le plus négatif ; sinon w = le plus grand | D14 |
| Nature des tags | Le schéma déclare `kind ∈ {endorsement, measurement}`. **Seuls les tags `endorsement` créent des arêtes.** Sans cette règle, le scanner fait fuir 34,6 % de la masse ; avec elle, 0 (MESURÉ) | D15 |
| Normalisation | Schéma par tag (min, neutre, max) : w = (x − neutre)/(max − neutre) si x ≥ neutre, sinon (x − neutre)/(neutre − min), donc w ∈ [−1, 1]. **Une valeur hors bornes est rejetée, jamais plafonnée.** Tag inconnu : pas d'arête | T1, D12 |
| Quantification | Normative : int16 sur une grille de 1e-4, troncature vers zéro. Elle change le point fixe, donc elle fait partie de la norme | D18 |
| Schéma de tags | Engagé **par ensemble d'ancres**, sans registre global. ANCRE publie un schéma de référence (`solver/schema_reference.json` : 58 tags, dont 15 `endorsement`). TAGS_MAX = 16 | D12, D24 |
| Émetteur | Wallet c → les agents dont `agentWallet == c`, **ou dont le wallet vaut 0 et l'owner vaut c** (repli owner, D44 ; le wallet reste prioritaire). **Copie de ligne** : chaque agent qui partage ce wallet et qui a de la masse émet la ligne de c avec sa propre masse, sans amplification (MESURÉ). Wallet qui n'appartient à aucun agent : nœud-adresse, sans masse sauf s'il est une ancre | D16, D20, D34 |
| Rejet | Arête rejetée si c est un **contrôleur actuel** de la cible : owner, agentWallet, token approuvé ou opérateur. La règle « ancien owner » est retirée de la norme (invérifiable, fausse pour les plateformes) | D16, D20 |
| Ancres | Nœud-ancre **toujours distinct** d'un nœud-agent. `anchorId` avec **pré-rotation** de clé (engagement du hash de la clé suivante). Après une rotation, seuls les avis de la clé courante comptent | D9 |
| Paiement | **N'entre pas dans le poids.** Il se contourne par aller-retour, et la ferme payait. Un point d'extension `edgeFilterId` est prévu (ColinkaMir peut s'y brancher) | D3, D30 |

### 4.3 Mathématiques

- **Convention absorbante** (D5) : la masse des nœuds sans arête sortante disparaît au lieu d'être renvoyée vers p, ce qui garde **la linéarité exacte en p**. D'où le calcul **par colonne d'ancre** et les combinaisons t(ensemble) = Σ λ_a·t^(a).
- **Budgets séparés** (D7) : C_uj = w⁺/B⁺_u et D_uj = w⁻/B⁻_u, avec B = max(1, Σ). Un critique honnête ne perd pas de pouvoir d'approbation. **B⁺ est déclaré par ligne** (D32).
- **Point fixe** : t = (1−α)·Cᵀt + α·p. **Méfiance à un saut** : d = (1−α)·Dᵀt. La méfiance ne se propage jamais : une région S émet au plus (1−α)·π(S) de méfiance.
- **α est un paramètre de l'ensemble.** La valeur recommandée est **1/3**, avec 1/4 en option « couverture » (D24).
  - Mesure R4 sur graphes synthétiques (deg = 5, g = 100) : au seuil « 1 % de Sybil admis », la couverture honnête vaut **0,752 / 0,712 / 0,668** pour α = 1/4 / 1/3 / 1/2.
  - 1/2 est dominé partout. Sur le mainnet, α n'a aucun effet (support de 3 nœuds).
- **Leave-one-out** (D8) : pour un agent, on retire la plus grosse contribution d'une ancre (m = 2). **Une ancre seule ne peut pas faire payer.** Deux scanners corrélés peuvent contourner la règle sans D15 (MESURÉ).
- **Certificat par sous-solution** (D26, garantie amendée par D32).
  - F est monotone, donc t ≤ F(t) composante par composante implique **t ≤ t\***, ce qui donne **une borne inférieure exacte par agent, sans marge**.
  - **Condition** : C_engagé ≤ C_vrai entrée par entrée.
  - Trois situations la violent, toutes mesurées : la dilution de B⁺, une arête fabriquée, un poids gonflé.
  - Le solveur **itère depuis 0**, avec arrondi vers le bas.
  - Vérifié sur 300 graphes aléatoires : écart à t* ≤ 83 wei, soit au plus 2/3 de la borne (MESURÉ).
  - Convergence en 3 à 5 itérations sur le mainnet, 79 à 82 sur le graphe de démo.
- **Borne supérieure** : e = ⌈‖y − t‖₁ · αD/αN⌉ plus la marge de troncature. Elle ne sert plus que pour la méfiance et après les preuves de diminution.
- **Lemmes à écrire** (D37) :
  - L1 : F_bas est monotone.
  - L2 : C' ≤ C et t ≤ F'(t) ⇒ t ≤ t*.
  - L3 : l'itération depuis 0 termine sur une sous-solution entière.
  - L4 : la somme privée des m−1 plus grandes contributions est monotone.
  - L5 : d* ≤ d + (1−α)·e.
  - La **nouveauté est l'usage comme certificat on-chain**, pas le lemme, qui est classique en PPR locale (D30).

### 4.4 Certificat et vérification on-chain

- **Deux niveaux** (D32) :
  - **Registry-verified** : `submitCertificate` **relit chaque arête dans le registre**. Il vérifie `readFeedback`, que l'index est bien le dernier du tag, le wallet et les contrôleurs. **C'est le seul niveau ouvert à tous.** Coût ESTIMÉ à ≈ 13,6 M gas par certificat de démo : **à mesurer en premier**, dans le chantier 02.
  - **Submitter-attested** : une liste de soumetteurs est engagée dans le `setId`. Par défaut, c'est le propriétaire de l'ensemble, qui paie (D27). Les preuves d'écart restent actives.
  - ⚠️ **Faille actuelle** (AM-5.9, MESURÉ) : le contrat R5 ne relit aucune arête. Un certificat qui fabrique 0x0730 → #4 donne t(#4) = 0,111 au lieu de 0, avec le même eUp, et **remplace le certificat honnête**. D32 corrige la spec ; l'implémentation reste à faire.
- **La passe** :
  1. décodage des lignes groupées ;
  2. vérification que les poids sont sur la grille ;
  3. calcul des budgets ;
  4. calcul de y = F_bas(t) ;
  5. **`t ≤ y`** pour chaque nœud ;
  6. calcul de rUp et eUp ;
  7. **bit de veto** pour chaque arête négative d'une ligne d'ancre (les lignes d'ancres ne sont jamais tronquées) ;
  8. calcul de `graphRoot` (Merkle des lignes) et de `vectorRoot` ;
  9. écriture sur place des vecteurs entrelacés, tassés en 4 × uint64 par slot.
- **Table de nœuds append-only.** Un nœud n'y entre que par un certificat accepté. `addNodes` et `reserveCapacity` écrivent dans une zone de préparation propre au soumetteur (D23).
- **Preuves d'écart** :
  - (i) omission ;
  - (ii) avis périmé (même tag) ;
  - (iii) avis révoqué ;
  - (iv-a) wallet de l'émetteur changé ;
  - (iv-b) contrôleur de la cible changé ;
  - **(v) fabrication ou gonflement**.
  - Seules les **diminutions** élargissent la borne de confiance. Une omission d'arête négative élargit la borne de méfiance. Les montants sont cumulatifs et **plafonnés par ligne** à (1−α)·t_u·(‖C(L⁰)‖₁ + ‖D(L⁰)‖₁ + 2) (D22).
  - **Pas de slashing** : le registre ne date pas les avis, donc une omission ne peut pas être prouvée antérieure (AM-2.1).
- **Budget d'élargissement** `eLow_max` dans la politique : au-delà, le statut passe à STALE (D36). Pas de recertification incrémentale : une réparation touche 93 % des nœuds (MESURÉ).
- **Remplacement d'un certificat** par eEff (D6). À corriger : un vecteur nul est une sous-solution valide (AM-5.16).
- **Registre upgradable** : le certificat engage les adresses des registres et `keccak(getVersion())`. `checkRegistry()` fait passer le statut à `REGISTRY_CHANGED`. Un test en fork de l'upgrade vers la PR #80 est prévu, ainsi qu'une démo figée sur un bloc (D17, D28).

### 4.5 Lecture par un contrat

- ⚠️ **D39 : statut ≠ confiance.** `assess` renvoie OK pour un agent inconnu (confiance nulle). **Un payeur appelle `isTrusted`**, qui applique θ, ρ, m, q, maxAge et eLow_max, **engagés dans le `setId`**.
- `assess(agentId, setId)` ne revert jamais. Il renvoie un **statut** (OK, NO_CERT, STALE, TRANSFERRED, VETOED, REGISTRY_CHANGED), `trustRobust`, `distrust`, `e`, `certBlock`, `vetoCount` et le tag déclencheur.
- **Politique**, engagée dans un `setId` immuable (ancres, poids λ, α, schéma, filtre, θ, ρ, m, q, maxAge, eLow_max) :
  > OK ⇔ ¬veto ∧ trustLow ≥ θ ∧ ρD·distrustUp ≤ ρN·trustLow
- **Veto** (D33) : le **dernier avis de l'ancre, lu dans le registre**, fait foi. Le bit certifié n'est qu'un complément « best effort ».
  - Règle normative : **une ancre qui publie autre chose après un veto doit republier son veto**. Le tag `veto` est RECOMMENDED.
  - Le veto se lève par révocation, puis recertification.
- **Transfert** (D35) : `ownerOf` est lu en direct par défaut (mode strict). Le cache de décision du router l'amortit. Un mode rapide, avec un indicateur posé par preuve, est optionnel.
- **Coûts MESURÉS** (R5, forge `network = "monad"`) : `assess` coûte **77 k gas sans veto** (dont ~36 k pour `ownerOf` via le proxy) et **115 à 190 k avec veto**. Le router **met la décision en cache** par (payé, `setId`, fenêtre de blocs), parce qu'une décision ne doit pas coûter plus qu'un micropaiement (D25).

### 4.6 Architecture du système

```
Registres ERC-8004 (Monad 143, testnet 10143, ~20 chaînes)
        │ events : NewFeedback, FeedbackRevoked, ResponseAppended,
        │ Registered, Transfer, MetadataSet(agentWallet), Upgraded
        ▼
[03] Indexeur Envio (HyperIndex / HyperSync) ── bounty Envio
        │ base fidèle au registre + entités dérivées (arêtes combinées, contrôleurs,
        │ wallets partagés, indicateurs de ferme, stats multichain)
        ▼
[04] Solveur + certificateur (Python) ── itération depuis 0, colonnes par ancre
        │ certificat (solver/FORMAT.md ↔ contracts/ENCODING.md)
        ▼
[02] AnchoredReputation.sol ── vérification en une passe, stockage, assess, preuves
        │ assess(agentId, setId)
        ├──▶ [05] Contrat payeur ERC-1271 / TrustGatedRouter ── x402 (USDC, exact / upto)
        ├──▶ [05] Plugin MetaMask Agent Wallet (`mm ancre …`) ── bounty MetaMask
        └──▶ [07] Écran de démo (monadLogs, naïf contre ANCRE)
Ancres : clés « demo » ; Mera (PRF du passkey) pour un usage hors wallet ── bounty Mera
```

### 4.7 Intégration x402 (DOC, `docs/ressources/x402.md`)

- **Référence** : `x402-foundation/x402`, spec v2. En-têtes `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`. SDK `@x402/*` 2.27.0.
- **Schémas** : `exact` passe par EIP-3009 (`validAfter`/`validBefore` en secondes) ; `upto` passe **uniquement par Permit2** (l'adresse du facilitator est signée).
- **Facilitator Monad** : `https://x402-facilitator.molandak.org`, un fork Rust de x402-rs. Il annonce `exact`, `upto` et `batch-settlement`. En cas d'erreur, il renvoie un **HTTP 500 opaque**.
- **USDC Monad** : `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, FiatToken v2.2, 6 décimales, EIP-3009 avec une variante `bytes` qui passe par ERC-1271 (MESURÉ).
- **Double garde (D41)** : la **garde dure** est un contrat payeur ERC-1271 qui détient les USDC et appelle `isTrusted` dans `isValidSignature`. La **garde douce** est le plugin `mm ancre`. Guard Mode n'autorise que le payeur. Les tests en fork passent (fiable payé, ferme refusée, veto posé entre la vérification et le règlement bloqué). Un règlement gardé coûte 252 à 364 k gas. Aucun refus ne laisse de trace on-chain : les refus sont reconstitués par `explain()`.
- **Un contrat peut payer via ERC-1271** : c'est l'architecture (a), le contrat valide la signature seulement si ANCRE dit OK. `assess` doit être `view`, et aucun event de refus n'est émis dans ce chemin. **Test bloquant à faire sur le testnet**, sur accord de Hugo : le facilitator accepte-t-il d'avancer le gas ?
- **Pièges** : une garde logée dans un délégué EIP-7702 est contournable ; ERC-7710 n'est pas supporté.
- **Repli** (b) : une garde côté client via `onBeforePaymentCreation`.
- **Antériorité** : proposition x402 #2641, « payeur contraint par une politique ».

### 4.8 Plugin MetaMask (DOC, `docs/ressources/metamask-agent-wallet.md`)

- **Agent Wallet** : CLI Node `mm`, `@metamask/agent-wallet` v7.0.0. **Monad 143 et 10143 sont supportés.**
- **Plugin** : un paquet npm, avec un bloc `mm` et des permissions dans `package.json`. Lecture via `ctx.publicClient(143)`, envoi via `ctx.walletExecutor`, qui passe toujours par la politique et le MFA.
- **Livrables du bounty** : le plugin installable, `skills/<name>/SKILL.md`, un README et une démo de 5 minutes maximum.
- **Argument** : Guard Mode ne compte pas les signatures, **donc un paiement x402 échappe à ses plafonds**. ANCRE apporte la garde manquante. Elle devient **dure** si Guard Mode n'autorise que le contrat payeur.
- **Piste 05 de la fiche** (« A2A commerce, x402 + ERC-8004 ») : c'est exactement ANCRE.
- **Piège** : `minCliVersion "^6.2.0"` exclut la 7.0.0 ; écrire `">=6.2.0 <8"`.
- **Concurrent complémentaire** : `Beltran12138/warrant` **écrit** des avis ERC-8004 ; nous, on les **consomme**.

### 4.9 Mera (DOC, `docs/ressources/mera.md`)

- `@category-labs/mera` v0.2.0 (MIT OR Apache-2.0) : une bibliothèque côté client, pas un wallet. Elle fournit un PRF de 32 octets par sel, des coffres AES-256-GCM et des sessions de signature.
- Chaque sel coûte une cérémonie, donc un prompt. La clé publique P-256 n'est pas exposée, donc **pas de lien direct avec le précompilé `0x0100`**.
- **Le bounty exclut la signature de transactions depuis un wallet.** Il note la **nouveauté** (loin du « passkey wallet »), l'**usage correct** (sels cloisonnés, rien de persisté) et le **test multi-appareils en live**.
- **Concurrent** : `aliveevie/mandate`, qui fait des identités d'agent dérivées et une politique chiffrée. L'angle « un passkey possède l'agent » est donc pris.
- **Concept retenu (D43)** : **un passkey, deux familles de sels**.
  1. **Clés d'époque pré-rotées.** Le contrat vérifie l'empreinte, ce qui permet de récupérer une clé d'ancre sans dépositaire (`rotateBySig`).
  2. **Coffres** qui contiennent le dossier d'un veto, rouvrable lors d'un recours.
  - **Scène** : une clé volée pose un slash abusif, le fournisseur est refusé. On fait tourner la clé depuis l'iPhone (le Face ID reconstruit la clé, et son empreinte correspond à celle que le Mac a engagée). Au bloc suivant, le fournisseur est de nouveau payé.
  - **Première étape** : prototyper deux époques sur deux appareils. Si ça échoue, on se replie sur le seul dossier de veto.
  - Détails : `docs/ressources/design-mera.md` et `cross-idea-mera.md`.
- **Démo** : un domaine HTTPS fixe, et iCloud Keychain (iOS 18.4+) ou 1Password.

### 4.10 Indexeur Envio (DOC, `docs/ressources/envio.md`)

- Monad 143 et 10143 sont supportés par HyperSync (1 bloc de retard, MESURÉ), HyperRPC et HyperIndex v3.13.0. **Un token est nécessaire**, à créer par Hugo.
- **Multichain** : les registres ont le même bytecode à la même adresse sur 20 chaînes, dont 19 couvertes par HyperSync. Le plan gratuit d'Envio Cloud plafonne à 100 k events pendant 30 jours : Monad plus 2 ou 3 petites chaînes tiennent dedans.
- **Pièges** :
  - les handlers s'exécutent deux fois, donc les appels RPC passent par l'**Effect API** ;
  - les nœuds Monad ne gardent l'état historique que sur ~40 k blocs, donc **wallets et owners se reconstruisent depuis les events**.
- **Concurrent** : `Sireadell/headwater-indexer`, qui fait de la provenance de financement.
- **Concept retenu (D42) : l'indexeur de la norme, qui audite aussi les certificats.**
  - Il calcule les arêtes selon les règles D14, D15, D16 et D20, avec des tests de parité contre le solveur.
  - Il audite chaque certificat ANCRE contre le registre, au bloc du certificat, et produit une `Discrepancy` avec la preuve (v) prête à soumettre. Cela ferme la faille AM-5.9.
  - Un scan HyperSync mesure, chaîne par chaîne, la part des avis qui survivent aux règles.
  - Cloud : Monad 143, testnet 10143 et une 3e chaîne.
  - Détails : `docs/ressources/design-indexeur-envio.md` et `cross-idea-envio.md`.
- Le bounty exige un **dépôt public**.

---

## 5. Mesures clés

**Gas mesuré par R5** (`contracts/GAS.md`, forge 1.8.3 `network = "monad"`, qui reproduit MIP-8 au gas près) :

| Opération | Gas |
|---|---|
| Mise à jour d'un certificat par arête (k = 1 / 3 / 8 ancres) | 1 600 / 2 470 / 4 250 |
| Acte 2 : 300 arêtes, 100 nœuds, k = 3 | ≈ 840 k, soit ≈ 0,084 MON à 100 gwei |
| Graphe réel du mainnet | 133 à 146 k |
| Nouveau nœud / slot neuf | 28,7 k / 17,1 k |
| Taille maximale dans 30 M (mise à jour, k = 3) | ~12,1 k arêtes |
| `assess` sans veto / avec veto | 77 k / 115 à 190 k |
| `proveOmission` / `checkRegistry` | 220 541 / 90 582 |

- **L'exécution domine.** Le plancher calldata EIP-7623 (40 gas par octet non nul, actif sur Monad) n'est jamais atteint. L'ancienne estimation de 350 à 400 gas par arête était fausse d'un facteur 5 à 13.

**Monad** (DOC, avec les mesures du 27/09) :
- Temps de bloc : **0,302 s**, MESURÉ sur 1 000 blocs.
- Gas : 150 M par bloc et 30 M par transaction. **On paie la gas limit**, pas le gas consommé.
- Base fee : au moins 100 gwei.
- MIP-8 (stockage par pages de 128 slots) :
  - SLOAD : 8 100 gas à la première lecture d'une page, 100 ensuite ;
  - SSTORE de 0 vers x : 27 900 / 17 100 gas ;
  - SSTORE de x vers y : 10 900 / 100 gas ;
  - **chaque clé de mapping occupe sa propre page**.
- `eth_getProof` n'existe pas. EIP-2935 couvre 8 191 blocs.
- Réserve de 10 MON par compte.
- `eth_getLogs` :
  - `rpc.monad.xyz` : 100 blocs maximum et 25 requêtes par seconde ;
  - `rpc1.monad.xyz` (Alchemy) : tout l'historique, plafond de 10 k logs.
- État historique : environ 3 heures sur la plupart des RPC.
- Précompilés : ecrecover coûte 6 000 gas, P256 à `0x0100` coûte 6 900.

---

## 6. La norme (ERC)

- **Texte** : `docs/erc/anchored-reputation.md`, réécrit par R6 (EIP-1, 775 lignes). La table de correspondance avec l'ancien draft est dans `docs/erc/CHANGES.md` (28 incohérences corrigées).
- **Principes** :
  - indépendante de la chaîne : Monad n'est cité que comme exemple daté ;
  - implémentation de référence : ANCRE.
- **À y intégrer (chantier 08)** :
  - les tours 4 et 5 : sous-solution, niveaux Registry-verified et Submitter-attested, preuve (v), veto, copie de ligne, α par ensemble ;
  - les 9 points ⟦OPEN⟧ ;
  - les **demandes à ERC-8004** : `block.number` par avis, garde-fou étendu à `agentWallet`, wallet unique, timelock d'upgrade.
- **Publication** (décision de Hugo) : PR sur `ethereum/ERCs`, réponse au **post #309** (fil ethereum-magicians #25098), recommandée le 12/10 si les ⟦OPEN⟧ sont traités.
- **Antériorité** :
  - le PoC OpenRank (Karma3) vérifiait déjà un point fixe on-chain ;
  - AInima-Collective/trustgraphs fait du PageRank ancré avec preuve ZK sur EAS ;
  - la proposition x402 #2641.
  - **Aucun ERC ne couvre l'agrégation de réputation** (3 PR fermées sans fusion).

---

## 7. La démo (D19, D33, D28)

- **Acte 1 : le mainnet réel, rejouable par le jury** (`solver/run_mainnet.py`, `solver/out/mainnet.md`).
  - Eve-8004 passe d'une moyenne de 1,53e36 à une masse ANCRE de 0.
  - Le scanner pris comme ancre fait fuir 34,6 % de la masse ; avec D15, 0.
  - Les 78 auto-notations de #8317 sont rejetées.
  - La seule chaîne honnête (#18 → #2, #3, #4) est présentée pour ce qu'elle est.
  - Le cas 0xea0b → #4 n'est vu que par la méfiance certifiée.
- **Acte 2 : notre propre trafic.** Réseau recommandé **H-B (D40, décision de Hugo)** : la ferme et les répétitions sur le testnet, puis **une seule exécution minimale sur le mainnet**. Elle refuse de payer Eve-8004, paie un fournisseur « demo » et montre le disjoncteur, pour environ 0,9 MON (ESTIMÉ). L'acte 2 complet coûterait environ 4,1 MON.
  1. Des fournisseurs honnêtes, approuvés par au moins 2 ancres, sont payés.
  2. Une ferme Sybil : la moyenne naïve explose, la masse ANCRE reste à 0, et le paiement est refusé.
  3. Une ancre compromise approuve la ferme, et **la ferme n'est toujours pas payée** (leave-one-out).
  4. **Disjoncteur** : une ancre dépose un slash, et le fournisseur est refusé au bloc suivant.
  5. Un +1 posté par **un autre noteur** n'efface pas la méfiance certifiée.
  6. En option : le recours via `appendResponse`, et un certificat fabriqué rejeté.
- **Garanties de la démo** :
  - une démo figée sur un bloc (état anvil exporté) est jointe à la soumission, en plus de la version live ;
  - la vidéo dure 3 minutes maximum, si c'est confirmé.
- **Écran** : naïf contre ANCRE, statut, tag déclencheur. Temps réel via `monadLogs`, avec les états Proposed, Voted et Finalized, et un mode rejeu hors ligne.
- **Jamais coupés** : le script de l'acte 1, les scènes du veto et de l'ancre compromise, la démo figée, et la preuve (v) si on reste en Submitter-attested.

---

## 8. Ce qu'on ne dit pas, et les pièges

- On ne présente pas « vérifier un point fixe on-chain » comme une invention (OpenRank le faisait). La nouveauté est la combinaison et l'usage de la sous-solution comme certificat.
- On ne prétend pas qu'un paiement prouve l'honnêteté (la ferme payait).
- On ne promet pas un recalcul à chaque bloc. On recalcule **quand le graphe change**.
- On n'annonce pas de classement positif tiré du graphe réel : il n'y a que 3 arêtes utiles.
- On ne dérive pas vers un passeport d'agent : c'est ce que font les 18 clones.
- On ne présente jamais le scanner comme un attaquant.
- On ne présente une garantie **qu'avec son niveau** (Registry-verified ou Submitter-attested).
- On ne se fie jamais à 8004scan : son index est incomplet (10 agents notés absents) et ses décimales sont fausses.
- Côté Monad :
  - `block.number`, jamais `block.timestamp`, pour les époques ;
  - `prevrandao` ne sert jamais seul ;
  - les gas limits sont explicites.

---

## 9. Concurrence et positionnement (D30)

| Projet | Ce qu'il fait | Notre rapport |
|---|---|---|
| ColinkaMir/monad-agent-trust | Provenance de paiement, vendue via x402 | Complémentaire : exemple d'`edgeFilterId` |
| AInima-Collective/trustgraphs | PageRank ancré, ZK, EAS, Sepolia | Antériorité citée. Nous : ERC-8004 natif, sous-solution sans ZK, lecture avant paiement, veto |
| Sireadell/headwater-indexer | Indexeur Envio des registres 8004 de Monad (provenance) | Concurrent sur le bounty Envio |
| Beltran12138/warrant | Plugin `mm` qui écrit des avis ERC-8004 | Complémentaire : il produit, on consomme |
| aliveevie/mandate | Mera, ERC-8004, CRE, disjoncteur | Concurrent sur le bounty Mera : éviter l'angle « le passkey possède l'agent » |
| Kanmani / Sentinel / Assay (#10252, #10256, #10257, un seul owner) | « Confiance par le prix » : reçu de paiement vérifié, verdict daté par bloc **via une API x402 payante, non lisible par un contrat**, caution on-chain. Pas d'ancres ni de graphe | **D45** : *« A receipt can be true and still come from a farm »*. Nous : ancres du lecteur, borne Sybil, certificat on-chain, lecture dans le payeur, veto, norme. Complémentaire (D46) : exemple d'`edgeFilterId`, sans dépendance |
| ~18 clones « passeport d'agent » | Produisent des signaux | ANCRE **agrège** pour le lecteur |

**Le message** : *« la couche que la norme délègue au lecteur, et la preuve sur le mainnet que la moyenne ment »*. Face à la pile « confiance par le prix » (D45) : *« A receipt can be true and still come from a farm. ANCRE doesn't ask whether the payment happened — it asks whether anyone **you** trust vouches for who made it, and your contract reads the answer before it pays. »*

**Modèle économique** (D27) :
- le propriétaire d'un ensemble d'ancres paie la certification ;
- le consommateur lésé paie ses preuves ;
- ANCRE, en tant qu'opérateur, joue le rôle d'un « oracle de réputation » qui gère des ensembles curatés ;
- aucun frais de protocole dans la norme.

---

## 10. Planning et chantiers (`docs/chantiers/`)

**Chemin critique** : 02 → 04 → 06 → 07 → 09. **Soumission le 12/10.**

| # | Chantier | Fenêtre |
|---|---|---|
| 01 | Tour 4 du conseil | ✅ fait |
| 02 | Contrat vérificateur. **D'abord D32** (relecture des arêtes et sa mesure), puis les preuves (v) et (i) à (iv), le veto D33, Mera | 29/09 → 03/10 |
| 03 | Indexeur **Envio** | 28/09 → 03/10 |
| 04 | Solveur et certificateur (itération depuis 0, surveillant pendant le jugement) | 29/09 → 03/10 |
| 05 | Contrat payeur, router x402 et **plugin MetaMask** | 02/10 → 06/10 |
| 06 | Ferme Sybil et scénarios de l'acte 2 (budget MON validé par Hugo) | 02/10 → 06/10 |
| 07 | Écran de démo | 05/10 → 09/10 |
| 08 | Norme et brouillons de publication | en continu |
| 09 | Pitch, vidéo, soumission | 09/10 → 12/10 |

**Ordre de coupe en cas de retard** :
1. preuves (ii) et (iii) ;
2. pré-rotation d'`anchorId` ;
3. architecture x402 (b) ;
4. écran live, remplacé par le mode rejeu ;
5. PR d'ERC, publiée après la clôture.

---

## 11. Liens importants

**Registres et contrats**

| Élément | Adresse |
|---|---|
| Identity, mainnet 143 | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (implémentation `0x7274e874…9c02`) |
| Reputation, mainnet 143 | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (implémentation `0x16e0fa7f…da34`) |
| Identity, testnet 10143 | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation, testnet 10143 | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Owner des proxys | EOA `0x547289319C3e6aedB179C0b8e8aF0B5ACd062603` |
| USDC Monad | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 décimales) |
| Source des registres | https://github.com/erc-8004/erc-8004-contracts (master, PR #80 pour la v2.1.0, PR #84) |
| Spec ERC-8004 | https://eips.ethereum.org/EIPS/eip-8004 · discussion https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098 (post #309) |

**Monad**
- Doc : https://docs.monad.xyz, version pour agents https://docs.monad.xyz/llms.txt
- Faits à jour : https://docs.monad.xyz/ai/current-facts
- RPC : `https://rpc.monad.xyz`, `https://rpc1.monad.xyz`, testnet `https://testnet-rpc.monad.xyz`
- Faucets : https://faucet.monad.xyz, USDC de test https://faucet.circle.com
- Guides :
  - opcodes et gas : https://docs.monad.xyz/developer-essentials/opcode-pricing
  - déploiement avec Foundry : https://docs.monad.xyz/guides/deploy-smart-contract/foundry
  - vérification : https://docs.monad.xyz/guides/verify-smart-contract/foundry
  - temps réel : https://docs.monad.xyz/monad-arch/realtime-data/spec-realtime
  - x402 : https://docs.monad.xyz/guides/x402
- Hackathon : https://monad.xyz/developers/hackathons/metropolis · plateforme https://hackathon.monad.xyz

**Bounties**
- Envio :
  - doc https://docs.envio.dev (chaque page existe en `.md`) ;
  - token https://envio.dev/app/api-tokens ;
  - HyperSync `https://143.hypersync.xyz`, `https://10143.hypersync.xyz` ;
  - Effect API https://docs.envio.dev/docs/HyperIndex/effect-api.md.
- MetaMask :
  - doc https://docs.metamask.io/agent-wallet/ et https://docs.metamask.io/agent-wallet/plugins/build-a-plugin/ ;
  - template https://github.com/MetaMask/agent-wallet-plugin-template ;
  - exemples https://github.com/MetaMask/agent-wallet-plugin-examples ;
  - skills https://github.com/MetaMask/agent-skills ;
  - x402 https://docs.metamask.io/agent-wallet/guides/pay-for-apis-x402/.
- Mera :
  - doc https://mera.category.xyz, avec les pages passkeys-and-prf, secret-vaults, reference et authenticator-support ;
  - code https://github.com/category-labs/mera.

**x402**
- Spec v2 : https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- Schémas : `exact` https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md · `upto` https://github.com/x402-foundation/x402/blob/main/specs/schemes/upto/scheme_upto_evm.md
- Facilitator Monad : https://x402-facilitator.molandak.org/supported · https://github.com/monad-developers/x402-rs
- FiatToken v2.2 : https://github.com/circlefin/stablecoin-evm

---

## 12. Carte du dépôt

| Chemin | Contenu |
|---|---|
| `CLAUDE.md` | Passation de session : faits vérifiés, pièges, environnement |
| `ANCRE.md` | Ce document |
| `mustdo/MUSTDO.md` | Actions de Hugo |
| `docs/conseil/CR-conseil.md` | CR cumulatif : journal D1 à D38, angles morts, tours 1 à 5, feuille de route |
| `docs/conseil/tour5A-fond.md`, `tour5B-revue-tour4.md` | Annexes du tour 5 |
| `docs/conseil/bounties-sponsors.md` | Inventaire des bounties et les 3 fiches officielles |
| `docs/ressources/` | Doc vérifiée : envio, mera, metamask-agent-wallet, x402, monad-dev-et-soumission, et les designs de la vague 2 |
| `docs/chantiers/` | 9 briefs de session et l'ordonnancement |
| `docs/erc/` | Draft d'ERC et CHANGES |
| `solver/` | Solveur PPR (95 tests), acte 1 rejoué, graphes synthétiques, vecteurs de test, FORMAT.md, RESULTS.md |
| `contracts/` | `AnchoredReputation.sol` (49 tests, dont 6 en fork), ENCODING.md, GAS.md |

**Environnement** :
- `export PATH="$PATH:$HOME/.foundry/bin"` (Foundry 1.8.3) ;
- `python3` en version 3.14 ;
- le vault de veille est dans `/Users/hugo/Projet/dataBlockchain`, en lecture seule.

---

## 13. Questions ouvertes (état au 27/09)

0. **Faits récents** : les registres existent sur le testnet ; le registre du mainnet n'est plus dormant (95 nouveaux avis) ; les inscriptions fermeraient le 06/10 (non confirmé).
1. **Niveau de certification de la démo** : Registry-verified ou Submitter-attested. On tranche après la mesure du chantier 02.
2. **Réseau de l'acte 2** : H-B recommandé (D40), à valider par Hugo.
3. **Concept Mera (D43)** : il réintroduit la pré-rotation dans la démo, à valider par Hugo.
4. **Éligibilité au bounty MetaMask** depuis la track 04.
5. **Règles officielles** : le dépôt public est-il obligatoire ?
6. **Qui surveille pendant le jugement**, et qui finance la recertification.
7. **Désaccords non résolus des tours 4 et 5** :
   - concentration de pouvoir par la copie de ligne ;
   - mode strict ou rapide pour le transfert ;
   - griefing ×4 ;
   - veto au « dernier avis » contre la dominance du négatif (D14) ;
   - calibrage d'`eLow_max`.
8. **Décisions de Hugo** : voir `mustdo/MUSTDO.md`.

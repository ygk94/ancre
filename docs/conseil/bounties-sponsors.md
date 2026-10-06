# Bounties sponsors Metropolis et adéquation avec ANCRE

> **Source** : https://monad.xyz/developers/hackathons/metropolis, consultée le 2026-09-27 (DOC OFFICIELLE).
> La page publique ne donne que le **titre et le montant** de chaque bounty ; elle précise que les bounties sont « listed in full on the platform » (hackathon.monad.xyz). **Les critères détaillés sont derrière une connexion : NON LUS.** Les adéquations ci-dessous sont donc des **déductions à partir des titres et des produits des sponsors**, à confirmer.
> Par rapport à la veille du vault (18/09), trois bounties sont apparus : Alchemy (1 k$ en crédits), Agora ×2 (10 k$ chacun, qui n'étaient listés qu'en crédits), Kuru ×2 (confirmés).

## Prix de track et grand prix

- 4 tracks à **30 k$ chacune**, partagés entre 3 équipes.
- **Grand Champion : 25 k$**, toutes tracks confondues.

## Bounties ouverts à tous

| Sponsor | Bounty | Montant | Adéquation ANCRE | Chantier |
|---|---|---|---|---|
| Envio | Best Use of Envio | 1 000 $ | **FORTE**. L'indexeur est de toute façon nécessaire (chantier 03). Si on le construit avec Envio (HyperIndex / HyperSync), l'éligibilité est presque gratuite | 03 |
| MetaMask | Best Agent Wallet Plugin | 2 500 $ | **FORTE si le format le permet**. « Le wallet d'un agent consulte ANCRE avant de payer », c'est exactement notre cas d'usage, côté wallet. Le format du « plugin » est inconnu (Snap ? kit de délégation ?) | 05 |
| Chainlink | Best workflow with CRE | 3 000 $ | **MOYENNE**. Le certificateur deviendrait un workflow CRE (un event déclenche calcul et soumission), ce qui répond en partie à « qui recertifie » (D27). Risques : support de Monad par CRE non vérifié, et portage du solveur Python | 04 |
| Monad Foundation | Mera: One Passkey, Many Keys | 2 500 $ | **MOYENNE, à vérifier**. Le titre évoque plusieurs clés dérivées d'un passkey, ce qui rejoindrait la pré-rotation des clés d'ancre (D9) et le P256 à `0x0100`. Recommandation du tour 5A : à tenter seulement si le SDK s'intègre en moins d'une journée | 02 / 06 |
| Nansen AI | Best use of Nansen | 5 000 $ | **MOYENNE**. Les labels de wallets Nansen pourraient servir de filtre d'arêtes (`edgeFilterId`) ou qualifier les ancres et les fermes. Nansen est aussi au **jury**. Risques : accès à l'API, et brique décorative si ça ne change pas le score | 04 / 09 |
| Alchemy | Best Projects using Alchemy | 1 000 $ en crédits | **FAIBLE mais gratuit** : `rpc1.monad.xyz` est servi par Alchemy (mesuré au tour 3). Si l'utiliser suffit, c'est acquis | 03 |
| Monad Foundation | Best Community Team Project | 5 000 $ | **À VÉRIFIER** : l'éligibilité est inconnue (équipe issue d'une communauté ou d'un club ?) | — |
| Dynamic | Best Use of Dynamic | 5 000 $ | FAIBLE. Wallet embarqué pour l'écran de démo : hors de notre thèse | 07 |
| Privy | Privy! | 5 000 $ | FAIBLE, pour la même raison | 07 |
| Monad Foundation | Best Mera-Powered UX on Monad | 2 500 $ | FAIBLE : un bounty d'UX grand public | — |
| Cleanverse | Best Integration of CVI/CVA | 2 000 $ | **À VÉRIFIER**. Si CVI/CVA est une identité vérifiée, ce serait une source d'ancres possible. Le produit n'est pas connu | — |
| Perpl | Best Analytics / Risk Tool | 3 000 $ | HORS SUJET (perps) | — |
| Perpl | Best use of Perpl's API | 5 000 $ | HORS SUJET | — |
| Kuru | Consumer Trading App / New Assets and Markets | 5 000 $ ×2 | HORS SUJET | — |
| Agora | Best Mobile Trading App / Cross-Border Payments | 10 000 $ ×2 | HORS SUJET | — |
| Aurora Intents | Bring Any-Chain Liquidity to Monad | 5 000 $ | HORS SUJET | — |
| Alibaba Cloud / Kimi / Tencent | Qwen 3.8 Max / KIMI / Hunyuan | 5 k$ / 3 k$ / 2 k$ en crédits | HORS SUJET (brique IA décorative, CLAUDE.md §6) | — |

## Prix automatiques pour les gagnants

Ils ne demandent aucune candidature :
- ack3 : scan de sécurité (15 k$) ;
- Chainstack : plans Pro (10 k$) ;
- Crouton : RPC illimité 3 mois (10 k$) ;
- Mercuryo : crédits (10 k$) ;
- Zerion : API 3 mois (6 k$) ;
- Envio Cloud (5 k$) ;
- Spectrum (3 k$).

## Ressources gratuites pour toutes les équipes

- QuickNode : 3 mois ;
- **Tenderly Pro** : simulation et debug, utile pour les chantiers 02 et 06 ;
- Zerion : 1 mois ;
- Dwellir : 3 mois ;
- Spectrum : 2 mois.

## Décision de Hugo (27/09) → D38

**Bounties visés : Envio (Best Use of Envio), MetaMask (Best Agent Wallet Plugin), Monad Foundation (Mera: One Passkey, Many Keys).** Les critères détaillés restent NON LUS (plateforme derrière une connexion). Chainlink CRE et Nansen ne sont pas visés.

## Recommandation initiale (27/09, avant décision)

1. **Envio** (1 k$) : presque gratuit, à condition que le chantier 03 choisisse Envio plutôt qu'un indexeur maison. Ce choix se décide maintenant.
2. **MetaMask Agent Wallet Plugin** (2,5 k$) : le meilleur alignement avec la thèse (« un agent refuse de payer »). Il se branche sur le chantier 05. Coût estimé : 1 à 2 jours, selon le format exigé.
3. **Un seul au choix entre Chainlink CRE et Mera passkeys**, selon les critères. CRE répond à « qui recertifie » ; Mera répond à la rotation des clés d'ancre. Les deux ensemble, ce serait trop à 16 jours.
4. **Nansen** : seulement si les labels changent réellement un résultat, par exemple identifier les financeurs de la ferme. Sinon, c'est de l'IA ou de la data décorative, devant un jury qui compte Nansen.

**Ce qu'on perd** : chaque bounty ajouté prend du temps au chemin critique (02 → 04 → 06). La règle proposée : **aucun bounty ne passe avant D32** (relecture des arêtes) et la démo figée.

**Questions à trancher** :
- Peut-on cumuler un prix de track et plusieurs bounties ? La règle n'est pas lue.
- Quels critères exacts ? Il faut qu'Hugo se connecte à hackathon.monad.xyz et copie les fiches de Envio, MetaMask, Chainlink, Mera, Nansen, Cleanverse et Community.

---

## Fiches officielles des 3 bounties visés

Copiées par Hugo depuis hackathon.monad.xyz le 2026-09-27 (DOC OFFICIELLE, verbatim condensé). **Date limite des trois : 14/10/2026 à 05:59 GMT+2.** Il faut créer le projet sur la plateforme avant de choisir tracks et bounties.

### Envio : Best Use of Envio (1 000 $, un seul prix, toutes tracks, cumulable)

- **Condition** : utiliser *réellement* HyperIndex, HyperSync ou HyperRPC pour alimenter une fonctionnalité centrale avec des données on-chain réelles, et pas seulement installer l'outil.
- **Critères**
  - **Profondeur d'usage** : indexation multichain, schéma non trivial, entités dérivées ou agrégées, usage créatif de HyperSync pour de l'analytique. Tout ça pèse plus qu'un simple indexeur ERC-20 à un event.
  - **Produit qui marche** : les données sont live et correctes.
  - **Originalité**.
  - **Qualité** : code lisible, schéma sensé, dépôt reprenable par un tiers.
- **Livrables**
  - Un indexeur ou pipeline Envio, déployé sur Envio Cloud ou hébergé par nous, avec un dépôt public qui montre `config.yaml`, `schema.graphql` et les handlers (ou le code client HyperSync).
  - Un frontend, dashboard, agent, bot ou API qui consomme ces données.
  - Une démo courte (vidéo ou lien live) qui montre les données de bout en bout.
- **Ressources** : docs.envio.dev (HyperIndex, HyperSync, HyperRPC, AI quickstart), token API gratuit sur envio.dev, Discord.

### Monad Foundation : Mera, One Passkey, Many Keys (2 500 $, un seul prix, toutes tracks)

- **Objet** : l'usage le plus créatif, **hors wallet**, du matériau de clé dérivé par PRF dans Mera.
  - La sortie PRF est déterministe, et chaque sel est un espace de noms isolé.
  - Un seul passkey peut donc produire une infinité de clés sans lien entre elles (chiffrement, identités, capacités), toutes reconstructibles à partir du passkey seul, sans aucun secret stocké.
  - **Exclu : signer des transactions blockchain depuis un compte wallet.**
- **Critères**
  - **Nouveauté** : plus on s'éloigne du « passkey wallet », mieux c'est.
  - **Usage correct des primitives** : chiffrement et dérivation employés à bon escient, sels réellement cloisonnés, rien de sensible persisté sur disque ou sur serveur.
  - **Test multi-appareils, en live** : le même passkey sur un second appareil, ou un profil de navigateur neuf, reproduit les mêmes clés dérivées et déchiffre le même état.
- **Livrable** : une soumission où au moins un espace de noms PRF fait un travail qui n'est pas celui d'un compte, démontré en live. Un wallet peut être présent, mais il ne doit pas être le sujet.
- **Pistes suggérées** :
  - état chiffré ou messagerie de bout en bout avec une clé par conversation ;
  - mémoire d'agent chiffrée pour le passkey de l'utilisateur ;
  - identités isolées par agent ou par application ;
  - identités non reliables entre contextes ;
  - identités SSH ou de développeur ;
  - coffres de secrets.
- **Ressources** : mera.category.xyz, pages concepts/passkeys-and-prf, concepts/secret-vaults, recipes/use-an-existing-secret, reference.

### MetaMask : Best Agent Wallet Plugin (2 500 $, un seul prix, **track affichée : Onchain Finance & Trading**)

- **Objet** : un plugin qui donne au MetaMask Agent Wallet un nouveau « super-pouvoir de trading », via son architecture de plugins et la commande `mm`.
- **Critère** : un plugin fonctionnel et installable, qui fait passer **toutes** les transactions par l'Agent Wallet, sans contourner la signature, la politique ou le MFA.
- **Livrables**
  - Un plugin installable via l'Agent Wallet, sans aucune gestion de clé ou de token de notre côté.
  - **`skills/<name>/SKILL.md`**, pour qu'un agent sache quand et comment l'utiliser.
  - Un README et une démo (live ou vidéo de 5 minutes au plus) sur un vrai parcours.
- **Pistes suggérées**, dont **n° 05 : « Agent-to-agent commerce — A2A trading, paid tool calls via x402 payments + ERC-8004 agent identity/reputation/validation registry »**. C'est exactement ANCRE.
- **Note** : les plugins ne sont supportés qu'à partir de l'Agent Wallet **v6.2.0**. Ressources : docs.metamask.io, template et exemples de plugin sur GitHub.
- ⚠️ **Question ouverte** : la fiche affiche la track « Onchain Finance & Trading ». Un projet soumis en track 04 est-il éligible ? À vérifier sur la plateforme ou auprès des organisateurs.


---

## Mise à jour du 2026-10-05 (D48)

**MetaMask est inaccessible** : la plateforme ne le propose qu'à la track 01 (Onchain Finance & Trading). ANCRE concourt en track 04. Le plugin reste dans le dépôt, sans travail supplémentaire.

**Bounties restants, à trancher par Hugo** (pour chacun : vérifier sur la plateforme qu'il est ouvert à la track 04) :

| Bounty | Montant | Ce qu'il faudrait faire | Coût estimé | Avis |
|---|---|---|---|---|
| Envio, Best Use of Envio | 1 k$ | Déjà fait : indexeur sur Envio Cloud, 3 chaînes. Reste : dépôt `ancre-indexer` public, un frontend qui consomme, la démo | faible | **garder** |
| Monad Foundation, Mera: One Passkey, Many Keys | 2,5 k$ | Prototype PRF sur 2 appareils (06-E3), coffre du dossier de veto, démo multi-appareils en live | 1,5 à 2 jours | seulement si le prototype tourne avant le 08/10 |
| Alchemy, Best Projects using Alchemy | 1 k$ en crédits | Utiliser un RPC Alchemy (rpc1.monad.xyz est servi par Alchemy) de façon visible | très faible | à tenter si éligible, critères à lire |
| Nansen, Best use of Nansen | 5 k$ | Labels de wallets comme filtre d'arêtes (`edgeFilterId`) ou pour identifier les financeurs de la ferme. Nansen est au jury | 1 à 2 jours + accès API | seulement si les labels changent un résultat mesuré, sinon décoratif |
| Chainlink, Best workflow with CRE | 3 k$ | Certificateur en workflow CRE | 2 jours + support Monad non vérifié | déconseillé à 8 jours |
| Monad Foundation, Best Community Team Project | 5 k$ | Éligibilité inconnue | ? | à lire |
| Cleanverse, CVI/CVA | 2 k$ | Identité vérifiée comme source d'ancres ? Produit inconnu | ? | à lire |

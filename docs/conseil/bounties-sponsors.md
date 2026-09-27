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

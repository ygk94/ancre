# Tour 5A — Questions de fond — 2026-09-27

> Conseil simulé à 5 voix (un seul modèle ; l'indépendance est une discipline d'écriture). Document à consolider dans `CR-conseil.md` : décisions numérotées **D-A1…** (à renuméroter), angles morts **AM-5A.n**.
> Statuts : **MESURÉ** (relevé par nous, commande indiquée) · **DOC** (source officielle, URL) · **NON VÉRIFIÉ** · **ESTIMÉ** · **CHOIX**.

## Faits établis avant délibération (27/09)

**Scanner `0xa06f907f7ea437ebe60e3d452831ec69e5be43a4`** (snapshot du 21/09 `fb.json` + `cast` sur `rpc.monad.xyz`)
- 32 avis, 28 cibles, du 21/03 au 25/03/2026. Tags : `trust/oracle-screening` (24) et `liveness/liveness-check` (8). Valeurs : 85 (18), 100 (7), 30 (3), 60 (3), 10 (1). MESURÉ.
- Cibles : 30 agents `monad://Spawn-8004`, 1 « Valiron Zero Agent #2 (Test) » (#8357), 1 autre. MESURÉ.
- Le champ `endpoint` est un compte rendu de machine : « Oracle screening: risk=low, flags=[UNVERIFIED] » (18), « risk=high, flags=[CONCENTRATED_FEEDBACK] » (1), « Liveness: reachable=True, endpoint=https://ag0.xyz » (6). MESURÉ.
- L'adresse est une EOA (pas de code), nonce 788, owner d'aucun agent. #8357 appartient à une autre adresse, `0x52ce…F644`, et son agentURI le décrit comme « Test agent with no reputation for demonstrating zero-reputation routing ». MESURÉ.
- **Lecture** : c'est un **service automatique de filtrage de risque**, pas un noteur complice. Ses notes de 85 signifient « risque faible, non vérifié », pas « je recommande ». Qu'il s'agisse du projet de hackathon **Valiron** (qui filtre ses délégations d'agents avec ERC-8004, [galerie Cerebral Valley](https://cerebralvalley.ai/e/zero-to-agent-nyc/hackathon/gallery/5)) est une **inférence NON VÉRIFIÉE**, tirée du nom de l'agent test et du motif des tags.

**ERC-8004 v2.1.0** (API GitHub, 27/09)
- La branche `feat/unique-reverse-lookup` a pour dernier commit le 2026-06-04. La **PR #80 « Reverse lookup and unique agentWallet » est ouverte et non fusionnée**. MESURÉ.
- Le dernier commit de `master` date du 2026-08-15 (ajout de chaînes). Les PR récentes ajoutent des déploiements (Arc, GIWA, NetX, HyperEVM, XDC). MESURÉ.
- La **PR #84 « fix: block contract owners from self-feedback in giveFeedback() » a été fermée sans fusion**. L'équipe a déjà été saisie d'un problème d'auto-notation voisin. MESURÉ ; le contenu exact n'a pas été lu.
- Aucune annonce de déploiement de la v2.1.0 trouvée. NON VÉRIFIÉ : je n'ai pas cherché sur les canaux sociaux.

**Concurrents** (API GitHub, 27/09)
- `ColinkaMir/monad-agent-trust` : « Provenance for ERC-8004 reputation on Monad: which ratings are backed by a payment the owner did not fund. Wallet signals bought per call over x402. » Dernier push le **22/09**, 0 étoile. Derniers commits : « daily ceiling on what the house will pay for strangers ». MESURÉ.
- `AInima-Collective/trustgraphs` : « ZK proofs over verifiable data for multi-dimensional governance power… ». Dernier push le 15/09, 8 étoiles. Travail récent sur le frontend et les attestations. MESURÉ.

**Hackathon** ([page officielle](https://monad.xyz/developers/hackathons/metropolis), lue le 27/09 ; vault `Metropolis — event, tracks et concurrence.md`, 18/09)
- Livrables : « a demo, a short write-up, and a link to the code ». « Judges need to be able to verify what you built during the six weeks. » « **Open sourcing is encouraged but not required.** » DOC.
- **Aucune grille de notation publiée** et **pas d'exigence de déploiement sur le mainnet** mentionnée sur la page. DOC. Le vault note « Réseau : Monad mainnet (chainId 143) ».
- Le bounty « passkeys » de la Monad Foundation porte sur **Mera** (« Mera: One Passkey, Many Keys », « Best Mera-Powered UX on Monad », 2,5 k$ chacun). **Ce n'est pas un bounty P256 générique.** DOC. CLAUDE.md et le brief 06 sont donc à corriger.
- La track 04 compte environ 18 projets, surtout des « passeports d'agent » (vault, 18/09).

**Caméra témoin** (fiche ANCRE du vault, §9)
- Alternative sérieuse. C'est l'exemple officiel de la track (« provenance des médias ») et aucun concurrent n'a été repéré. Le ratio ×3,78 cité vient des données **Blitz**, un autre format d'événement. Rien n'a été construit.

**État d'ANCRE** (CR, 27/09) : solveur (95 tests), contrat (49 tests), draft d'ERC de 775 lignes, décisions D1 à D26, 16 jours avant la clôture. MESURÉ.

## Questions

- **Q1** Modèle économique : qui paie la certification, les recertifications et les preuves ? Que répondre au jury ?
- **Q2** Risques liés au registre et divulgation : plan B pour la v2.1.0 ; faut-il prévenir l'équipe ERC-8004 ; peut-on nommer le scanner ?
- **Q3** Positionnement : ColinkaMir, trustgraphs, la caméra témoin, les clones.
- **Q4** Exécution : répartir les 9 chantiers, ce qu'on coupe en cas de retard.
- **Q5** Recommandations à Hugo (dépôt public, PR d'ERC, budget MON, ancres de démo, nom). **Ce ne sont que des recommandations.**

**Question mal posée.** La Q2 mélange un risque technique (upgrade) et une question d'éthique de publication (divulgation). Elles se tranchent séparément : Q2a et Q2b.

---

## Phase 1 — Analyses indépendantes

### A. Théoricien (graphes, Sybil)
- **Q1.** La valeur d'un certificat revient à celui qui **choisit les ancres**. Économiquement, c'est l'équivalent d'une agence de notation ou d'un bureau de crédit, pas d'un protocole à péage. Le propriétaire de l'ensemble paie, et se rémunère par l'usage que font les intégrateurs de son `setId`.
- **Q2b.** Le scanner est la meilleure illustration d'AM-3.2 : une *mesure* encodée comme *confiance*. Ce n'est pas un attaquant. Il faut le montrer comme un cas d'école, sans l'accuser.
- **Q3.** trustgraphs fait du PageRank ancré avec preuve ZK sur EAS. Notre différence est un certificat par **sous-solution** (D26), vérifiable **sans ZK** et en une passe. Personne ne le cite : c'est notre argument technique le plus neuf.

### B. Ingénieur EVM
- **Q1.** Mesures du 27/09 : ≈ 840 k gas par mise à jour sur le graphe de démo, et 220 k par preuve. On ne recertifie qu'au changement du graphe, et le registre est dormant depuis le 10/09. Le coût réel est donc faible aujourd'hui. Il faut le dire en gas (0,084 MON par mise à jour), sans le convertir en dollars : aucun prix du MON n'a été vérifié.
- **Q2a.** La v2.1.0 ne change pas les signatures de lecture utilisées. Elle ajoute l'unicité et un index inverse. Plan B : `REGISTRY_CHANGED`, puis recertification avec le nouveau hash de version. **À tester en fork** : simuler l'upgrade vers le commit de la PR #80 et rejouer toute la chaîne. R5 a déjà simulé une upgrade générique.
- **Q5, budget MON.** Le noteur ERC-8004 est `msg.sender`. Une ferme peut donc être **une usine de contrats CREATE2** où chaque contrat note une fois, soit N noteurs en quelques transactions. Pas de N EOA à financer, et la réserve de 10 MON ne concerne que les transferts de valeur. ESTIMÉ, à mesurer dans le chantier 06.

### C. Concepteur de normes
- **Q2b.** Les deux faits sont publics dans le code source : l'EOA qui peut upgrader et le garde-fou qui ignore `agentWallet`. Ce ne sont pas des failles cachées, ce sont des choix de conception ou de gouvernance. La courtoisie impose tout de même de **prévenir les auteurs avant de les montrer à un jury**. Par un message privé ou une issue sobre, pas par un post public accusateur. La PR #84 fermée montre que le sujet de l'auto-notation leur est connu.
- **Q3.** ColinkaMir produit un signal de provenance. `edgeFilterId` (D3) est précisément le point d'extension prévu pour ça. Le consommer ou le citer renforce la norme : on montre qu'elle compose.
- **Q5.** Une PR ouverte sur `ethereum/ERCs` avant le jugement est un signal fort pour Paradigm et Dragonfly. Elle exige que la référence d'implémentation soit publique.

### D. Attaquant économique
- **Q1.** Qui paie les preuves ? Le consommateur lésé. Qui paie la recertification ? Le propriétaire de l'ensemble. Mon levier de griefing (retrait ou dilution, ×4) coûte donc de l'argent au propriétaire, qui peut **limiter le rythme** : recertifier seulement quand eEff franchit θ, pas à chaque preuve.
- **Q2a.** Si la v2.1.0 arrive pendant le jugement, les certificats passent tous en `REGISTRY_CHANGED`. Un jury qui rejoue la démo verra tout refusé. Il faut **figer la démo sur un bloc** (rejeu en fork) en plus de la version live.
- **Q3.** Les 18 clones produisent des signaux. Plus il y a de passeports, plus il y a de noteurs automatiques et plus AM-3.2 se reproduit. ANCRE profite de la saturation de la track, elle ne la subit pas.

### E. Intégrateur
- **Q1.** Je paierais un `setId` tenu à jour, avec un engagement de fraîcheur (maxAge), comme un flux d'oracle. C'est un modèle « oracle de réputation », facturé au propriétaire de l'ensemble ou à l'abonnement. Les lectures restent gratuites : ce sont des vues payées par ma propre transaction.
- **Q4.** Il faut un responsable par étape du chemin critique. Le quant tient les chiffres (α, budgets, pitch), pas du code critique.
- **Q5, ancres de démo.** Deux ancres clés en main (nos EOA, étiquetées « demo ») et une troisième chez un tiers réel si possible. Une ancre-passkey Mera seulement si l'intégration tient en moins d'une journée.

---

## Phase 2 — Relecture croisée à l'aveugle (1 = C, 2 = E, 3 = A, 4 = D, 5 = B)

- **A relit C (1)** : *vu* que la PR #84 prouve que le sujet est connu, donc prévenir les auteurs n'est pas les « surprendre ». *Trop optimiste* : « PR ouverte = signal fort » suppose que le texte est prêt, alors qu'il reste 9 points ⟦OPEN⟧ et les décisions D20 à D26 à intégrer.
- **A relit B (5)** : *vu* la ferme CREATE2, excellente pour le budget. *Oubli* : pour être honnête, la ferme de démo doit **ressembler** à la vraie. Un seul déployeur rend la ferme triviale à détecter par provenance (ColinkaMir), pas par ANCRE. Il faut dire que ce n'est pas ce qu'on démontre.
- **B relit A (3)** : *vu* que D26 est l'argument neuf. *Faux* : « personne ne le cite ». La borne inférieure par itération monotone est classique en PPR locale (méthodes de push). L'originalité est de s'en servir comme **certificat on-chain**, pas le lemme lui-même.
- **B relit D (4)** : *vu* le gel de la démo sur un bloc. *Oubli* : rejouer en fork demande que le jury ait un RPC d'archive, ou que nous fournissions un état exporté. Il faut prévoir un **état anvil exporté** (`anvil --dump-state`).
- **C relit E (2)** : « modèle oracle, facturé au propriétaire de l'ensemble » a raison. *Oubli* : la norme ne doit pas l'imposer. Le modèle économique est celui d'ANCRE en tant qu'opérateur, pas celui de l'ERC.
- **C relit A (3)** : *oubli* : la caméra témoin n'est pas traitée. Il faut la clore explicitement, sinon elle reviendra.
- **D relit C (1)** : prévenir les auteurs *avant le pitch*, oui. *Oubli* : prévenir, c'est aussi leur donner le temps de **corriger** avant le 13/10 (une upgrade), ce qui déclenche le scénario `REGISTRY_CHANGED` de ma Q2a. Les deux questions sont liées.
- **D relit E (2)** : une ancre chez un tiers réel donne de la crédibilité, mais c'est une dépendance à 16 jours. Il faut un **plan sans tiers** prêt.
- **E relit B (5)** : 0,084 MON par mise à jour se lit bien. *Oubli* : le jury demandera « et à l'échelle ? ». Il faut la **taille limite mesurée** : ~12 k arêtes par transaction avec k = 3, puis vérification répartie (non implémentée). C'est une limite à dire, pas à cacher.
- **E relit D (4)** : limiter le rythme de recertification, oui. *Faux* sur « seulement quand eEff franchit θ » : depuis D26, la confiance n'utilise plus e ; seules la méfiance et les diminutions l'utilisent. Le déclencheur doit donc être « une preuve de diminution sur une ligne dont dépend un agent proche de θ ».

---

## Phase 3 — Décisions et recommandations

### D-A1 — Modèle économique *(Q1)*

**Décision.**
- **Le propriétaire d'un ensemble d'ancres paie la certification et la recertification.**
- **Le consommateur lésé paie ses preuves.**
- Les lectures sont gratuites, puisque ce sont des vues payées par la transaction de l'intégrateur.
- Le positionnement d'ANCRE en tant qu'opérateur est celui d'un **« oracle de réputation »** : opérer des `setId` curatés avec un engagement de fraîcheur, comme un fournisseur de flux de prix. La norme reste neutre et ne fixe **aucun frais de protocole**.
- **Rythme** : recertifier quand le graphe change *et* qu'un agent actif change de statut, pas à chaque preuve.

**Réponse au jury (chiffres MESURÉS le 27/09).**
- ≈ 840 k gas, soit ≈ 0,084 MON à 100 gwei, par mise à jour d'un graphe de 300 arêtes.
- Limite actuelle : ~12 k arêtes par transaction avec k = 3.
- On recertifie au changement du graphe, jamais à chaque bloc.

**Argument décisif.** La valeur revient à celui qui choisit les ancres. C'est cohérent avec « pas de score global » (D1).

**Ce qu'on perd.** Pas de jeton ni de récit de captation de valeur au niveau du protocole, alors que certains VC l'attendent.

**Confiance.** 0,7.

### D-A2 — Plan B pour une upgrade du registre *(Q2a)*

**Décision.**
- La probabilité d'un déploiement de la v2.1.0 avant le 13/10 est jugée **faible** (ESTIMÉ : PR #80 ouverte depuis juin, `master` inchangé depuis le 15/08). Mais elle n'est pas nulle, **et la divulgation (D-A3) peut l'accélérer**.
- Chantier 02 :
  1. test en fork qui applique l'upgrade vers le code de la PR #80 et rejoue certification et lecture ;
  2. procédure « recertifier après `REGISTRY_CHANGED` » documentée et scriptée.
- Chantiers 06 et 09 : **démo figée sur un bloc**, avec un état anvil exporté et joint à la soumission, en plus de la version live.

**Confiance.** 0,75.

### D-A3 — Divulgation et nommage *(Q2b)* — **décision de Hugo, recommandation du conseil**

**Recommandation.**
- **Prévenir en privé les auteurs d'ERC-8004** avant le pitch (idéalement avant le 05/10) de deux faits publics : l'EOA unique capable d'upgrader, et le garde-fou qui ignore `agentWallet` (78 cas sur #8317).
  - Ton factuel, avec la référence à la PR #84, sans exigence.
  - Canal : contact des auteurs ou issue GitHub sobre, à choisir par Hugo.
- **Ne pas nommer le scanner comme attaquant.** Dans le pitch, le montrer comme « un service automatique de filtrage de risque dont les mesures, encodées comme de la confiance, font fuir 34,6 % de la masse vers une ferme », avec l'adresse tronquée et aucun nom de projet.
  - Le lien avec Valiron est NON VÉRIFIÉ : ne jamais l'affirmer.

**Argument.** Les faits sont publics. La courtoisie coûte peu. Un jury qui compte Paradigm valorise la divulgation responsable.

**Ce qu'on perd.** On risque une correction avant le 13/10 (voir D-A2), et on perd un peu de l'effet de surprise du pitch.

**Confiance.** 0,7.

### D-A4 — Positionnement *(Q3)*

**Décision.**
- **La caméra témoin est close** pour Metropolis. Rien n'est construit, alors qu'ANCRE a du code mesuré. Le ×3,78 vient d'un autre format d'événement. Changer de projet à 16 jours n'est pas défendable. Elle reste une piste pour l'après-hackathon.
- **ColinkaMir** est un complément, déclaré comme tel dans le README et l'ERC : un exemple de filtre `edgeFilterId`. Un contact est à décider par Hugo (brouillon dans le chantier 08). **Aucune dépendance** dans la démo.
- **trustgraphs** est cité comme antériorité (PageRank ancré avec ZK sur EAS). Notre différence : ERC-8004 natif, certificat par sous-solution sans ZK, lisible par un contrat avant de payer, veto.
- **Contre les clones** : ils produisent des signaux (passeports), ANCRE les **agrège pour le lecteur**. Le message tient en une phrase : *« la couche que la norme délègue au lecteur, et la preuve sur le mainnet que la moyenne ment »*.
- Pitch technique : présenter D26 comme **l'usage de la borne inférieure monotone de PPR comme certificat on-chain**, pas comme un lemme nouveau.

**Confiance.** 0,8.

### D-A5 — Exécution *(Q4)*

**Décision.** Répartition à valider par Hugo, qui connaît l'équipe :

| Rôle | Chantiers | Fenêtre |
|---|---|---|
| Dev 1 (Solidity) | **02** contrat (D20-D26, preuves, déploiement), puis **05** router | 28/09 → 06/10 |
| Dev 2 (backend) | **03** indexeur, puis **07** écran | 28/09 → 09/10 |
| Dev 3 (intégration) | **04** solveur et certificateur, puis **06** ferme et scénarios | 29/09 → 08/10 |
| Quant | calibrage (α, θ, budgets), vecteurs de test, **08** norme (maths), chiffres de **09** | en continu |
| Hugo | arbitrages, divulgation, **09** pitch, vidéo et soumission | 09/10 → 12/10 |

**Ordre de coupe en cas de retard**, du premier au dernier sacrifié :
1. preuves (ii) et (iii) (on garde (i) et (iv-b)) ;
2. pré-rotation d'`anchorId` ;
3. architecture x402 (b) ;
4. écran live, remplacé par le mode rejeu seul ;
5. PR d'ERC, publiée après la clôture.

**On ne coupe jamais** : le script reproductible de l'acte 1, les scènes « veto au bloc suivant » et « une ancre compromise ne fait pas payer », la démo figée sur un bloc.

**Confiance.** 0,65 : les compétences réelles de l'équipe ne sont pas connues du conseil.

### Recommandations sur les décisions de Hugo *(Q5)*

1. **Dépôt public** : privé jusqu'au **12/10**, public au moment de la soumission, avec une licence (CC0 pour l'ERC comme l'exige EIP-1 ; MIT ou Apache-2.0 pour le code, CHOIX). Le risque de copie par ColinkaMir est faible : projet complémentaire, pas de push depuis le 22/09.
2. **PR d'ERC** : ouverte le **12/10**, en même temps que le dépôt public et la réponse au #309, pour que le jury voie une PR ouverte. **Condition** : les ⟦OPEN⟧ sont traités ou assumés. Sinon, la publier après le jugement.
3. **Budget MON**, en deux enveloppes chiffrées dans le chantier 06 :
   - **frais**, dépensés ;
   - **capital immobilisé**, récupérable.

   Réduire les deux par une ferme en **usine CREATE2** (à mesurer). Validation par Hugo avant toute transaction.
4. **Ancres de démo** :
   - deux EOA à nous, étiquetées « demo » ;
   - une troisième chez un tiers **seulement si elle est confirmée avant le 03/10**, sinon une troisième clé à nous ;
   - **Mera** : à évaluer seulement si son SDK s'intègre en moins d'une journée. Le bounty vise Mera, pas le P256 en général.
5. **Nom** (critères : court, dit « confiance ancrée », ne dit pas « passeport », prononçable en anglais, disponibilité NON VÉRIFIÉE) :
   - **ANCRE** : garder, avec le récit « ancre = choisie par le lecteur » ;
   - **Keel** : la quille, ce qui stabilise ;
   - **Mooring** : l'amarrage.

---

## Désaccords non résolus (tour 5A)

1. **Divulgation avant le pitch.** C et A recommandent de prévenir. D rappelle que cela peut provoquer une upgrade avant le 13/10 et casser la démo live. D-A2 atténue le risque (démo figée), sans le supprimer.
2. **PR d'ERC avant le jugement.** C y voit un signal fort. A et E craignent un texte immature, avec 9 ⟦OPEN⟧. La recommandation est conditionnelle.
3. **Ferme CREATE2.** B l'optimise pour le coût. A objecte qu'elle est triviale à détecter par la provenance, et donc peu démonstrative de ce qu'ANCRE apporte en plus.
4. **Modèle « oracle de réputation ».** E l'achèterait. C refuse que la norme en dépende. D note qu'il ne répond pas à la question « jeton ou pas » qu'un VC posera.

## Ce que vous auriez dû me demander (tour 5A)

1. **Qui dans l'équipe fait quoi, et combien d'heures par jour d'ici le 13/10 ?** D-A5 est une hypothèse sans cette donnée.
2. **Le jury rejouera-t-il vraiment quelque chose ?** Si non, la démo figée sur un bloc sert surtout de plan de secours pour la vidéo.
3. **Faut-il une track de repli ?** Le vault note que la track 03 est la moins disputée. ANCRE n'y a pas sa place : la question est close, mais elle n'a jamais été posée.
4. **Mera** : que demande exactement le bounty ? Personne ne l'a lu en détail.

## Angles morts découverts (tour 5A)

| Id | Angle mort | Statut |
|---|---|---|
| AM-5A.1 | **Le bounty « passkeys » vise Mera, pas le P256 en général** : CLAUDE.md et le brief 06 le présentent à tort comme un bounty P256 | à corriger |
| AM-5A.2 | **Le scanner est un service de filtrage de risque automatique**, qui a aussi signalé « CONCENTRATED_FEEDBACK » sur des agents de la ferme. Le présenter comme complice serait faux | intégré (D-A3) |
| AM-5A.3 | **La PR #84** (bloquer l'auto-notation des owners de contrats), fermée sans fusion, montre que les auteurs connaissent le sujet. La divulgation doit s'y référer | intégré |
| AM-5A.4 | **Prévenir les auteurs peut déclencher une upgrade avant le 13/10** : divulgation et plan B sont liés | intégré (D-A2) |
| AM-5A.5 | Une ferme de démo à déployeur unique (CREATE2) est **triviale par provenance** : ce n'est pas ce qu'ANCRE démontre, il faut le dire | à documenter (chantier 06) |
| AM-5A.6 | Le lemme de D26 est classique (PPR locale) : seule son **utilisation comme certificat on-chain** est neuve. Un pitch qui dirait l'inverse serait pris en défaut | intégré (D-A4) |
| AM-5A.7 | Aucune grille de notation publiée, et pas d'exigence de déploiement mainnet sur la page officielle (27/09) : l'acte 2 sur le mainnet est un choix (D19), pas une obligation | noté |
| AM-5A.8 | Rejouer la démo en fork exige un RPC d'archive ou un **état exporté** | intégré (D-A2) |

---

## Résumé (15 lignes)

1. Scanner `0xa06f907f` : service automatique de filtrage de risque (24 `trust/oracle-screening`, 8 `liveness`), sans agent propre. À montrer comme cas d'école, jamais comme complice. Lien Valiron NON VÉRIFIÉ.
2. v2.1.0 : PR #80 ouverte, non fusionnée depuis juin ; `master` inchangé depuis le 15/08. Un déploiement avant le 13/10 est peu probable, mais pas exclu.
3. La PR #84 (auto-notation), fermée, montre que les auteurs connaissent le sujet.
4. ColinkaMir : provenance vendue via x402, pas de push depuis le 22/09. Complémentaire, citée comme exemple d'`edgeFilterId`.
5. trustgraphs : PageRank ancré avec ZK sur EAS, cité comme antériorité ; notre différence tient à D26, au veto et à ERC-8004 natif.
6. Règlement : open source encouragé mais pas exigé, pas de grille publiée, pas d'exigence mainnet visible.
7. Le bounty passkey vise **Mera**, pas le P256 : à corriger (AM-5A.1).
8. D-A1 : le propriétaire de l'ensemble paie la certification, le lésé paie ses preuves ; ANCRE opère des ensembles curatés, en « oracle de réputation ».
9. D-A2 : test en fork de l'upgrade vers la PR #80, procédure de recertification, démo figée sur un bloc avec état exporté.
10. D-A3 (recommandation) : prévenir les auteurs d'ERC-8004 en privé avant le 05/10 ; ne pas accuser le scanner.
11. D-A4 : caméra témoin close ; D26 présentée comme usage on-chain d'une borne classique ; ANCRE agrège ce que les clones produisent.
12. D-A5 : un responsable par étape du chemin critique ; ordre de coupe écrit ; trois éléments jamais coupés.
13. Recommandations : dépôt et PR publics le 12/10 (sous condition), budget en deux enveloppes, ferme CREATE2 à mesurer.
14. Ancres : deux EOA « demo » plus un tiers confirmé avant le 03/10 ; Mera seulement s'il s'intègre en moins d'une journée.
15. Noms proposés : ANCRE (garder), Keel, Mooring. Désaccords ouverts : divulgation contre upgrade, maturité de la PR, réalisme de la ferme.

Sources web : [monad.xyz — Metropolis](https://monad.xyz/developers/hackathons/metropolis) · [Valiron — Cerebral Valley](https://cerebralvalley.ai/e/zero-to-agent-nyc/hackathon/gallery/5) · API GitHub `erc-8004/erc-8004-contracts`, `ColinkaMir/monad-agent-trust`, `AInima-Collective/trustgraphs` (27/09).

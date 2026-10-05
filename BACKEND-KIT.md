# Kit de construction — back d'ANCRE

> Trois chantiers parallèles, cinq prompts, leurs skills et leurs frontières. Front exclu.
> Version page : `docs/backend-kit.html` (même contenu, mise en page). Chiffres mesurés le 21/09/2026 sur Monad mainnet (143).

## Règles communes (à poser avant le premier prompt)

1. **Un worktree git par chantier** — skill `superpowers:using-git-worktrees`. Trois sessions, aucun fichier de travail partagé.
2. **Propriété exclusive des dossiers** : `indexer/` → 01, `solver/` → 02, `contracts/` + `router/` → 03. Une session ne modifie jamais le dossier d'une autre ; elle écrit une note dans `HANDOFF.md`.
3. **Un seul dossier partagé, `spec/`**, avec un propriétaire unique par fichier :
   - `spec/snapshot.schema.json` — écrit par **01**, lu par 02
   - `spec/certificate.md` + `spec/encoding.md` — écrits par **03**, lus par 02
   - `spec/vectors/*.json` — écrits par **02**, lus par 03
   Toute modification d'un fichier déjà publié = commit isolé préfixé `spec!:` + mention dans `HANDOFF.md`.
4. **Ordre de démarrage** : 01 et 03 partent ensemble (03 écrit sa spec en toute première tâche) ; 02 démarre dès que les deux fichiers de spec existent.

### Le flux

```
01 Ingestion & graphe  ──GraphSnapshot + roots──►  02 Solveur & certificat  ──calldata + vecteurs──►  03 Contrats
```

### Qui fait quoi (les 7 questions qui créent les collisions)

| Question | 01 | 02 | 03 |
|---|---|---|---|
| Lit la chaîne (logs, owner, `agentWallet`) | **oui** | non | tests de fork seulement |
| Fait les maths PPR | non | **oui, seul** | vérifie un résidu, ne calcule pas |
| Écrit du Solidity | non | non | **oui, seul** |
| Définit la structure `Certificate` | non | la consomme | **oui** |
| Définit le format du snapshot | **oui** | le consomme | non |
| Envoie des transactions | non | **oui** (publieur) | scripts de déploiement |
| Surveille et conteste | non | **oui** (watcher off-chain) | écrit la logique on-chain |

---

# 01 — Ingestion & construction du graphe
`indexer/` · `spec/snapshot.schema.json`

**Possède** : lecture des events `NewFeedback` / `FeedbackRevoked` / `Registered` / `MetadataSet` · résolution des contrôleurs (owner ERC-721, `agentWallet`) à l'époque · normalisation par tag et rejet hors bornes · filtres d'arêtes dont la provenance de financement · racines `feedbackRoot`, `lastIndexRoot`, `schemaRoot`.

**Ne touche pas** : PPR, résidu, α, vecteurs · Solidity · encodage calldata · envoi de tx · front.

**Skills** : `superpowers:using-git-worktrees` → `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:test-driven-development` → `superpowers:verification-before-completion` · MCP `context7` (viem, HyperSync).

## Prompt 1.A — Construction

```
Tu prends le chantier 01 du projet ANCRE : l'ingestion ERC-8004 et la construction du graphe de confiance. Lis d'abord CLAUDE.md et README.md à la racine du dépôt : ils contiennent les adresses vérifiées, les chiffres mesurés et les pièges Monad. Ne re-vérifie pas ce qui y est marqué comme vérifié.

Commence par `superpowers:using-git-worktrees` pour travailler dans un worktree isolé nommé `indexer`, puis `superpowers:brainstorming` pour cadrer le modèle de données AVANT toute ligne de code. Poursuis avec `superpowers:writing-plans`, et implémente en `superpowers:test-driven-development`.

PÉRIMÈTRE STRICT — tu possèdes `indexer/` et le seul fichier `spec/snapshot.schema.json`. Tu ne touches à aucun autre dossier. Tu n'écris ni Solidity, ni algorithme de réputation, ni encodage calldata : ce sont les chantiers 02 et 03. Si tu as besoin d'un champ qui n'existe pas dans leur périmètre, écris la demande dans HANDOFF.md, ne l'implémente pas.

CE QUE TU CONSTRUIS
1. Un lecteur d'events du ReputationRegistry (0x8004BAa17C55a88189AE136b182e5fdA19dE9b63) et de l'IdentityRegistry (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) sur Monad mainnet, chainId 143. Le RPC public plafonne eth_getLogs à 100 blocs et la chaîne produit ~288 000 blocs par jour : un rattrapage complet par RPC est hors de question. Utilise Envio HyperSync (clé gratuite) pour l'historique, et le flux `monadLogs` pour la queue temps réel. Documente le choix et le coût de chaque option dans le README du dossier.
2. La résolution des contrôleurs : pour chaque agent, son owner ERC-721 et son `agentWallet` s'il est défini. Un feedback signé par une adresse contrôlant l'agent A crée une arête A → B. Une adresse qui ne contrôle aucun agent et n'est pas une ancre ne crée aucune arête : c'est la propriété anti-Sybil centrale, teste-la explicitement.
3. La normalisation par tag, selon les schémas de `spec/certificate.md` s'il existe déjà, sinon selon ta propre proposition écrite dans `spec/snapshot.schema.json` : valeur hors bornes = feedback REJETÉ, jamais plafonné. Le jeu réel contient des notes sur 100, des Elo autour de 1 600, des ±1 et 117 valeurs à 1e38 : ton test de non-régression doit montrer que les 1e38 disparaissent.
4. Les filtres d'arêtes en option activable, dont un filtre de provenance de financement (une arête ne compte pas si le noteur a été financé par le propriétaire de l'agent noté).
5. La sortie : un objet `GraphSnapshot` versionné, déterministe au bit près, avec ses racines de Merkle `feedbackRoot`, `lastIndexRoot`, `schemaRoot`, et le numéro de bloc d'époque. Le schéma JSON est le contrat que le chantier 02 consomme : documente chaque champ, y compris l'ordre de tri des feuilles.

CONTRAINTES MONAD À TRAITER EXPLICITEMENT
- Les blocs `latest` sont spéculatifs et ne sont jamais annulés, mais les logs websocket standards les exposent : n'utilise que des blocs finalisés pour un snapshot, et dédoublonne via `monadLogs`.
- Les époques se comptent en `block.number`, jamais en `block.timestamp` : 3 à 4 blocs partagent la même seconde.
- Les registres sont absents du testnet 10143. Le développement se fait contre le mainnet en lecture seule et contre des fixtures locales.

TESTS EXIGÉS
- Deux exécutions sur la même époque produisent des octets identiques.
- Les fixtures du snapshot du 21/09 sont rejouables hors ligne, sans réseau.
- L'agent #182 (« Eve-8004 ») reçoit bien 7 665 arêtes entrantes, toutes depuis des agents « Spawn-8004 ».
- Une révocation retire l'arête correspondante.
- Un feedback dont le tag n'a pas de schéma est ignoré.

Termine par `superpowers:verification-before-completion` : ne déclare rien de terminé sans la sortie des commandes de test. Écris dans HANDOFF.md les chiffres réels que tu as obtenus (nombre d'arêtes, de nœuds, d'agents contrôlés, temps de rattrapage complet) : ils remplacent des estimations dans le README.
```

## Prompt 1.B — Clôture

```
Le chantier 01 d'ANCRE se déclare terminé. Fais la revue avant de le figer, puisque le chantier 02 va construire dessus.

Invoque `superpowers:requesting-code-review`, puis lance `/code-review high` sur le diff du worktree `indexer`. Traite les retours avec `superpowers:receiving-code-review` : vérifie techniquement chaque point avant d'y toucher, et conteste ce qui est faux.

Trois questions doivent recevoir une réponse chiffrée, pas une opinion :
1. Le déterminisme tient-il quand les events arrivent dans un ordre différent ? Prouve-le en rejouant les fixtures dans un ordre mélangé.
2. Que se passe-t-il si un agent change d'owner entre deux époques ? Le comportement attendu est documenté dans `spec/snapshot.schema.json`, et testé.
3. Combien de temps et combien de requêtes coûte un rattrapage complet depuis le bloc de déploiement du registre ? Donne la mesure, pas l'ordre de grandeur.

Finis par `superpowers:verification-before-completion`, puis marque `spec/snapshot.schema.json` comme figé dans HANDOFF.md : à partir de là, toute modification est un `spec!:` qui doit prévenir le chantier 02.
```

**Critères de sortie** : deux exécutions identiques au bit près · les 1e38 rejetés · les 7 665 arêtes de la ferme reconstruites · `spec/snapshot.schema.json` figé et annoncé.

---

# 02 — Solveur PPR & certificat
`solver/` · `spec/vectors/`

**Possède** : le point fixe `t = (1−α)·Cᵀt + α·p` en virgule fixe 1e18 · le résidu L1 et le terme `nnz(C)` · une colonne par ancre + la combinaison linéaire · l'assemblage du certificat et l'encodage calldata (selon la spec de 03) · le publieur (nonce, caution, latence) · le watcher de contestation · les vecteurs dorés.

**Ne touche pas** : au Solidity, même « pour vérifier » · à la structure `Certificate` · à l'indexation · aux schémas de tags · au front.

**Skills** : `llm-council` (une fois, prompt 2.A) → `superpowers:using-git-worktrees` → `superpowers:brainstorming` → `superpowers:test-driven-development` → `superpowers:systematic-debugging` → `superpowers:verification-before-completion`.

## Prompt 2.A — Décision d'abord

```
Avant d'écrire le solveur d'ANCRE, trois conventions doivent être tranchées, parce qu'elles sont gravées ensuite dans le contrat ET dans le draft d'ERC. Elles ont été choisies à l'intuition et n'ont jamais été pressurisées.

Utilise `llm-council` pour les passer au crible, avec ce contexte : la réputation est un PageRank personnalisé sur un graphe d'agents ERC-8004, calculé hors chaîne et vérifié on-chain par le résidu ‖t − F(t)‖₁ ≤ ε, avec la borne ‖t − t*‖₁ ≤ r/α. Le lecteur choisit ses ancres. Le graphe réel mesuré sur Monad compte 9 188 feedbacks dont 83 % viennent d'une ferme de 7 665 faux agents, et seulement 36 arêtes où le noteur est lui-même noté.

Les trois questions :
1. `score = t_i · N` (où N est le nombre de nœuds, donc 1e18 = la moyenne uniforme) est-il la bonne exposition ? Le score d'un agent baisse mécaniquement quand le graphe grandit ; un seuil écrit dans un contrat tiers vieillit-il mal ? Alternatives à peser : un rang percentile, un score relatif à la masse des ancres, une normalisation par le maximum.
2. Quelle valeur d'α, sachant que α gouverne à la fois la résistance Sybil (borne en (1−α)/α) et la précision certifiée (r/α) ? Ces deux effets tirent-ils dans le même sens ou en sens contraire ?
3. Le poids d'une arête : valeur normalisée seule, ou multipliée par le montant payé (x402) ? Le fait mesuré à intégrer : la ferme payait, et le propriétaire de l'agent noté finançait les noteurs. Le paiement est-il un poids légitime, ou un faux signal qui coûte cher en complexité ?

Rends une décision par question, avec l'argument qui l'emporte et ce qu'on perd. Écris le résultat dans `solver/DECISIONS.md` et signale dans HANDOFF.md tout point qui oblige à modifier le draft d'ERC (README §7).
```

## Prompt 2.B — Construction

```
Tu prends le chantier 02 d'ANCRE : le solveur PageRank personnalisé, le certificat et le publieur. Lis CLAUDE.md, README.md, `solver/DECISIONS.md`, `spec/snapshot.schema.json` (contrat d'entrée, figé par le chantier 01) et `spec/certificate.md` + `spec/encoding.md` (contrat de sortie, figés par le chantier 03).

Travaille dans un worktree isolé nommé `solver` (`superpowers:using-git-worktrees`). Cadre l'architecture avec `superpowers:brainstorming`, puis implémente en `superpowers:test-driven-development`. Si un résultat diverge de ce que tu attends, passe par `superpowers:systematic-debugging` au lieu de bricoler des tolérances.

PÉRIMÈTRE STRICT — tu possèdes `solver/` et `spec/vectors/`. Tu n'écris pas une ligne de Solidity, tu ne modifies ni le schéma de snapshot ni la structure du certificat. Si l'encodage calldata te gêne, ouvre le débat dans HANDOFF.md ; le chantier 03 tranche.

CE QUE TU CONSTRUIS
1. Le solveur : t = (1−α)·Cᵀt + α·p, C normalisée par ligne, masse des nœuds sans arête sortante renvoyée vers p. Arithmétique ENTIÈRE en virgule fixe 1e18, produits intermédiaires en 128 bits, arrondi défini une fois et documenté. La règle d'or : chaque opération doit correspondre exactement à ce que fera le contrat. Le moindre écart d'arrondi fait exploser la vérification on-chain.
2. Le résidu r = ‖t − F(t)‖₁, plus le terme d'arrondi nnz(C), et la borne exposée r/α. Un test doit vérifier empiriquement que ‖t − t*‖₁ ≤ r/α sur un graphe jouet dont on connaît la solution exacte.
3. Une colonne par ancre, et la combinaison linéaire qui sert un ensemble d'ancres arbitraire sans recalcul. Teste la linéarité : PPR(p1+p2) = PPR(p1) + PPR(p2) au bruit d'arrondi près.
4. L'assembleur de certificat et l'encodeur calldata (arêtes en (uint32 i, uint32 j, uint64 w), triées, plus le vecteur t), conformes à `spec/encoding.md`. Il DOIT rejeter un lot dont la taille dépasserait la limite de 30 M de gas par transaction, et proposer le découpage.
5. Le publieur : il écoute les nouveaux feedbacks et republie un certificat. Objectif mesuré à afficher : le délai entre l'event et le certificat publié. La cible est l'ordre du bloc Monad, soit 0,3 s, avec une finalité à 0,6 s. Points d'attention : pas de mempool globale sur Monad, donc `pending` = `latest` et gestion locale du nonce ; `eth_sendRawTransactionSync` renvoie tx et reçu en une requête ; on paie la gas limit et non le gas consommé, donc la limite doit être serrée et calculée à partir du nombre d'arêtes.
6. Le watcher de contestation : il recalcule, détecte une omission ou un résidu faux, et construit la preuve à soumettre. La fenêtre de contestation se compte en secondes sur Monad, pas en jours : le watcher doit tenir ce rythme.
7. `spec/vectors/` : au moins six cas dorés livrés au chantier 03 — graphe jouet à solution connue, graphe réel du 21/09, ferme Sybil isolée, ensemble d'ancres vide, ancre unique, arête révoquée. Chaque vecteur contient entrées, calldata, t attendu et résidu attendu.

CE QUE LA DÉMO DOIT POUVOIR MONTRER, ET QUE TU DOIS DONC MESURER
- Le score d'Eve-8004 (agent #182, 7 665 avis de sa propre ferme) doit être nul ou négligeable pour toute ancre honnête. Sors le chiffre.
- Deux ensembles d'ancres différents donnent deux classements différents du même registre. Sors les deux classements.

Termine par `superpowers:verification-before-completion`, avec la sortie brute des tests et les latences mesurées. Reporte dans HANDOFF.md ce que le chantier 03 doit savoir : taille de calldata par arête, gas attendu, et tout écart d'arrondi que le contrat devra reproduire.
```

**Critères de sortie** : solveur et contrat identiques au bit près (vecteurs dorés) · latence event → certificat mesurée en ms · score de la ferme mesuré · six vecteurs livrés.

---

# 03 — Contrats : vérification & consommation
`contracts/` · `router/` · `spec/certificate.md` · `spec/encoding.md`

**Possède** : `AnchoredReputation.sol` (niveaux Verified et Optimistic, trois contestations) · `TagSchemaRegistry.sol` · `trustOf()` · `TrustGatedRouter.sol` (x402 `upto`) · la structure `Certificate` et l'encodage calldata · le rapport de gas réel, les déploiements, la vérification des contrats.

**Ne touche pas** : au calcul du point fixe hors chaîne · à l'indexation · au publieur et au watcher · au front.

**Skills** : `superpowers:using-git-worktrees` → `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:test-driven-development` → `/security-review` → `/code-review high` → `/simplify` → `superpowers:verification-before-completion`.

## Prompt 3.A — Construction

```
Tu prends le chantier 03 d'ANCRE : les contrats de vérification et de consommation. Lis CLAUDE.md et README.md : le README §7 contient le draft d'ERC, qui est la spec normative de ce que tu écris. Les estimations de gas du §4 sont justement ce que ton travail doit remplacer par des mesures.

Travaille dans un worktree isolé nommé `contracts` (`superpowers:using-git-worktrees`). Cadre avec `superpowers:brainstorming`, planifie avec `superpowers:writing-plans`, implémente en `superpowers:test-driven-development` avec Foundry (version ≥ 1.8, `network = "monad"`).

PÉRIMÈTRE STRICT — tu possèdes `contracts/`, `router/`, et les deux fichiers `spec/certificate.md` et `spec/encoding.md`. Tu ne réimplémentes pas le solveur, tu ne lis pas d'events hors des tests de fork. Ta toute première tâche est d'écrire ces deux fichiers de spec, car le chantier 02 est bloqué tant qu'ils n'existent pas : fais-les avant le reste, et annonce-les dans HANDOFF.md.

CE QUE TU CONSTRUIS
1. `AnchoredReputation.sol`.
   - Niveau Verified : la liste d'arêtes et le vecteur t arrivent en calldata, le contrat recalcule keccak(arêtes), vérifie le résidu ‖t − F(t)‖₁ ≤ ε et stocke le résultat, le tout dans une transaction.
   - Niveau Optimistic : publication avec caution, fenêtre de contestation en blocs, et trois contestations — omission (un feedback non révoqué d'index ≤ lastIndex engagé, absent de feedbackRoot), fabrication (une arête que le registre ne supporte pas), résidu (une ligne de F(t) qui diverge au-delà du résidu annoncé). Une contestation réussie slashe la caution et invalide le certificat.
   - `trustOf(agentId, anchorSetId)` renvoie score, borne d'erreur, époque et niveau. Il revert sans certificat valide, et ne sert pas un certificat encore sous fenêtre sauf s'il est Verified.
2. `TagSchemaRegistry.sol`, avec des schémas indexés par (registrant, tag) pour empêcher le squat de tag.
3. `TrustGatedRouter.sol` : il paie un agent fournisseur en x402 `upto` (USDC natif Monad 0x754704Bc059F8C67012fEd69BC8A327a5aafb603, facilitator https://x402-facilitator.molandak.org) uniquement si `trustOf` dépasse un seuil, avec une fraîcheur maximale exprimée en blocs. Le refus vient du contrat. En option : un prix inversement proportionnel au score.

CONTRAINTES MONAD, À TRAITER COMME DES EXIGENCES ET NON DES REMARQUES
- On paie la gas limit, pas le gas consommé. Toute fonction publique doit avoir une limite calculable à l'avance à partir de la taille du lot, et tu dois la documenter. C'est une exigence d'API, pas une optimisation.
- 30 M de gas par transaction. Au-delà, la vérification se découpe en plusieurs transactions avec un accumulateur persistant : conçois-le dès le départ, ne le rajoute pas après.
- Le stockage est facturé par pages de 128 slots depuis MIP-8 : 8 100 de gas à la première lecture d'une page, 100 ensuite. Range les données chaudes de façon contiguë, jamais en mappings imbriqués pour un parcours.
- Époques en `block.number`. Jamais `block.timestamp` : 3 à 4 blocs partagent la même seconde.
- Jamais `prevrandao` pour tirer une ancre, un auditeur ou un échantillon : le leader le connaît à l'avance.
- `ecrecover` coûte 6 000 de gas, soit le double d'Ethereum ; la précompile P256 `0x0100` en coûte 6 900 et rend les ancres en passkey réalistes.

TESTS EXIGÉS
- Les six vecteurs dorés de `spec/vectors/` passent, y compris le graphe réel du 21/09.
- Un vecteur t falsifié est rejeté ; une arête retirée du lot est rejetée.
- Les trois contestations sont testées, y compris le slashing.
- Test de fuzz sur l'arithmétique virgule fixe : aucun dépassement, aucun revert inattendu.
- Un rapport de gas complet : par arête, par lot de 1 000, et pour le graphe réel entier. Ce tableau remplace les estimations du README §4, et c'est le livrable le plus important de ce chantier.

Termine par `superpowers:verification-before-completion` avec la sortie brute du rapport de gas. Mets à jour README §4 avec les vrais chiffres, et signale dans HANDOFF.md tout écart avec les estimations.
```

## Prompt 3.B — Durcissement

```
Les contrats d'ANCRE passent leurs tests. Avant tout déploiement sur le mainnet Monad (chainId 143), fais-les tomber toi-même.

Lance d'abord `/security-review` sur le diff du worktree `contracts`, puis `/code-review high`. Traite les retours avec `superpowers:receiving-code-review` : vérifie chaque point avant d'y toucher.

Attaque ensuite ces scénarios, un test par scénario, en te servant de `superpowers:systematic-debugging` sur tout comportement inattendu :
1. Un publieur soumet un certificat correct mais dont le graphe omet exactement les arêtes qui le desservent. La contestation par omission le rattrape-t-elle ? Quel est son coût en gas pour le contestataire — est-il inférieur à la caution qu'il récupère ?
2. Un attaquant publie un certificat volontairement invalide juste avant la fin de la fenêtre pour saturer les contestataires. La fenêtre en secondes est-elle une force ou une faiblesse ici ?
3. Un consommateur lit `trustOf` avec une fraîcheur maximale trop permissive. Documente le comportement et le garde-fou.
4. Un registre de tags squatté : un tiers enregistre un schéma aux bornes absurdes pour un tag populaire. Le keying par (registrant, tag) tient-il ?
5. Grief économique : combien coûte à un attaquant le fait de forcer des republications permanentes ? Chiffre-le en MON par heure.

Finis par `/simplify` sur le code des contrats seulement, puis `superpowers:verification-before-completion`. Écris dans HANDOFF.md la liste de ce que tu n'as pas pu défendre : c'est la section « faiblesses assumées » du pitch, et il vaut mieux la dire au jury que se la faire dire.
```

**Critères de sortie** : rapport de gas réel publié et README §4 mis à jour · vecteurs dorés passés, faux vecteurs rejetés · trois contestations testées avec slashing · `/security-review` passé, faiblesses restantes écrites.

---

## Index des skills

| Skill | 01 | 02 | 03 | Apport sur ce projet |
|---|:--:|:--:|:--:|---|
| `superpowers:using-git-worktrees` | ● | ● | ● | La condition de l'isolation entre chantiers |
| `superpowers:brainstorming` | ● | ● | ● | Obligatoire avant chaque chantier |
| `superpowers:writing-plans` | ● | — | ● | Pour les chantiers à livrables multiples |
| `superpowers:test-driven-development` | ● | ● | ● | Déterminisme, arithmétique, contestations |
| `superpowers:systematic-debugging` | — | ● | ● | Écarts d'arrondi solveur ↔ contrat |
| `llm-council` | — | ● | — | Une fois, sur score / α / poids d'arête |
| `security-review` | — | — | ● | Avant déploiement mainnet |
| `code-review` | ● | — | ● | À la clôture des chantiers dont un autre dépend |
| `simplify` | — | — | ● | Après durcissement : moins de surface d'attaque |
| `superpowers:verification-before-completion` | ● | ● | ● | Aucun « c'est fait » sans sortie de commande |
| `requesting-` / `receiving-code-review` | ● | — | ● | Demander la revue et contester ce qui est faux |
| MCP `context7` | ● | ● | ● | Doc à jour viem / Foundry / HyperSync / x402 |

**Écartés volontairement** : `dataviz` et `artifact-design` (front, hors périmètre) · `claude-api` (ANCRE ne contient aucun LLM — c'est un argument de pitch) · `subagent-driven-development` et `dispatching-parallel-agents` (doublon avec la découpe en trois worktrees).

## Le fil rouge Monad

La même propriété se décline dans les trois chantiers : **01** doit ingérer 288 000 blocs par jour avec un `getLogs` plafonné à 100 blocs ; **02** doit publier un certificat dans l'ordre de grandeur du bloc (0,3 s) sans mempool globale ; **03** doit faire tenir une vérification de point fixe dans 30 M de gas, facturés sur la limite et non sur la consommation. La chaîne va assez vite pour recalculer la confiance **avant le prochain paiement**, au lieu d'une fois par nuit.

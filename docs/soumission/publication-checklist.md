# Passage du dépôt en public (cible : 11-12/10) — liste de préparation

> Rédigé le **2026-10-06** par la session du chantier 09, branche `chantier/09-soumission`. **Rien n'a été supprimé, déplacé ni réécrit** : ce fichier est une liste. Chaque action destructive est pour Hugo.
> Scans refaits ce jour sur l'arbre suivi (`git grep`) et sur **tout l'historique** (`git log --all -p`), hors `contracts/lib/` (forge-std vendorisé). Les commandes sont au §7 pour les rejouer juste avant la publication.
> Règle du concours, à garder en tête (NON CONFIRMÉE, transcription d'un tiers de la modale v3.0, `docs/ressources/design-demo-et-soumission.md` §1) : revue **non confidentielle** (§5.3), code public sous licence OSI « throughout and after » (§7.2), historique de commits qui couvre la période (§4.1).

---

## 0. Les décisions de Hugo (🧑 BLOQUÉ tant qu'elles ne sont pas prises)

| # | Décision | Options | Ma recommandation, et pourquoi |
|---|---|---|---|
| **P1** | Licence du code | MIT ou Apache-2.0 | **MIT.** 7 fichiers Solidity (le payeur et ses tests), le plugin et l'indexeur sont **déjà** en MIT : un seul changement d'en-tête (17 fichiers CC0) au lieu de 24 + 2 `package.json`. Apache-2.0 n'apporte que la clause de brevets, qui ne protège personne ici (pas de brevet en jeu, pas d'entreprise contributrice). L'ERC reste en **CC0** (exigé par EIP-1) |
| **P2** | Divulgation aux auteurs d'ERC-8004 (D29) | (a) envoyer le brouillon (c) **avant** la mise en public ; (b) ne pas divulguer et retirer les passages du §2.1 de la version publique | **(a), au plus tard le 10/10**, pour laisser 24-48 h avant le 12/10. Les faits sont lisibles on-chain par n'importe qui ; ce qui compte est qu'ils l'apprennent par nous et pas par le dépôt. Le §2.1 liste ce qui dépend de cette décision |
| **P3** | Historique public | (A) rendre public `ygk94/ancre` tel quel ; (B) nouveau dépôt public, historique **filtré** (chemins privés retirés, auteurs unifiés) ; (C) nouveau dépôt, un seul commit | **(B).** Détail et commandes au §4 |
| **P4** | Ce qui reste privé | voir le tableau du §3 | Garder privés `mustdo/`, `docs/conseil/`, `docs/chantiers/`, `docs/ressources/veille-*`, `docs/revue/`, `CLAUDE.md` ; nettoyer `ANCRE.md` ou le garder privé |
| **P5** | Identité des commits publics | une seule identité, laquelle ? | Une identité **personnelle** et stable (le compte `ygk94`, avec l'adresse `noreply` de GitHub par exemple). Voir §2.3 : l'historique actuel mélange **5 identités**, dont l'adresse d'un employeur |
| **P6** | `ancre-indexer` | même traitement que le dépôt principal ? | Oui : vérifier son historique avec les mêmes commandes (§7) avant de le rendre public. Il a été poussé depuis l'autre machine |

---

## 1. Licences

**État mesuré (06/10)**
- `contracts/` : **17 fichiers** en `SPDX-License-Identifier: CC0-1.0`, **7** en `MIT`.
  - CC0 : `src/AnchoredReputation.sol`, `src/interfaces/IERC8004.sol`, `script/Deploy.s.sol`, et 14 tests (`AnchoredReputation`, `Base`, `Diff`, `Fork`, `Fuzz`, `Gas`, `Profile`, `RegistryBench`, `SolverVectors`, `ToolingProbe`, `Upgrade`, `Verified`, `utils/CertLib`, `utils/Mocks`).
  - MIT : `src/TrustGatedPayer.sol`, `script/t1/T1.s.sol`, `script/t1/T1Oracle.sol`, `test/TrustGatedPayer*.t.sol`, `test/utils/PayerBase.sol`, `test/utils/MockUSDC3009.sol`.
- `plugin/package.json` et `indexer/package.json` : `"license": "MIT"`. `indexer/LICENSE` existe (MIT). **Aucun `LICENSE` à la racine.**
- `contracts/lib/forge-std/` : vendorisé (70 fichiers), MIT ou Apache-2.0 au choix de l'utilisateur. Compatible. On peut le garder tel quel.
- ERC : `docs/erc/anchored-reputation.md` §Copyright = CC0 (lien `../LICENSE.md` selon la convention d'`ethereum/ERCs`). **À garder.**
- CC0 n'est pas une licence approuvée par l'OSI (demande retirée en 2012 ; connu de longue date, non revérifié ici).

**À faire (par une session de code ou par Hugo, pas par le 09 : `contracts/` est hors de mon périmètre)**
1. Créer `LICENSE` à la racine (texte MIT ou Apache-2.0, titulaire et année : 🧑).
2. Remplacer `CC0-1.0` par l'identifiant choisi dans les 17 en-têtes : `grep -rl "CC0-1.0" contracts/src contracts/test contracts/script | xargs sed -i '' 's/SPDX-License-Identifier: CC0-1.0/SPDX-License-Identifier: MIT/'`.
3. Ajouter un fichier `LICENSE` (ou une ligne dans le README de `docs/erc/`) qui dit que **le texte de l'ERC** reste en CC0.
4. Si Apache-2.0 : changer aussi les 7 en-têtes MIT et les deux `package.json`, et ajouter un `NOTICE`.
5. Relancer `forge build` (les SPDX ne changent pas le bytecode des contrats déployés, mais la vérification de source compare le fichier exact : **changer la licence avant le déploiement final**).
6. Mettre à jour `README.md` §14 (le `[TBD]`).

---

## 2. Fichiers et passages sensibles

### 2.1 Ce qui dépend de la divulgation (P2)

Trois faits : (i) le garde-fou anti-auto-notation ne vérifie pas `agentWallet` (78 avis de #8317 par son propre wallet), (ii) les deux registres sont upgradables par une seule EOA (`0x5472…2603`), (iii) la mise sous silence par `setApprovalForAll` (AM-08.B, qui combine une règle de notre contrat et le garde-fou du registre).

| Où | Ce qui y figure | Si la divulgation est faite | Si elle ne l'est pas |
|---|---|---|---|
| `README.md` §1 | (i), entre les marqueurs `<!-- DISCLOSURE-GATE:start -->` et `:end` | retirer seulement les deux marqueurs | supprimer le bloc entier (une commande, §7) |
| `README.md` §9 | « registres upgradables » **sans** l'EOA | rien | rien (fait public : ce sont des proxys ERC-1967) |
| `docs/erc/anchored-reputation.md`, Security Considerations | (i), (ii), PR #84 | rien, c'est sa place | **réécrire** sans les chiffres réels, ou garder l'ERC hors du dépôt public jusqu'à la divulgation |
| `docs/erc/drafts/c-divulgation-erc8004.md`, `d-demandes-erc8004.md` | (i), (ii), (iii) en détail | **privé** de toute façon (correspondance) | privé |
| `docs/erc/drafts/b-reponse-309.md` | (i) | privé jusqu'à sa publication sur le forum | privé |
| `solver/out/mainnet.md` §c, `solver/RESULTS.md`, `solver/run_mainnet.py` | (i) comme mesure (#8317, 78) | rien | retirer la section (c) de la sortie publique, ou assumer : c'est un constat on-chain que n'importe qui refait |
| `indexer/README.md`, `indexer/SCHEMA.md`, tests (`parity`, `rules`), fixtures | (i) comme cas de test (#8317, `selfRatings`) | rien | idem : neutre en tant que test, mais lisible |
| Vidéo, plan 4 (`docs/soumission/video-script.md`) | (i) | garder | **couper le plan 4** (il est dans l'ordre de coupe) |
| `ANCRE.md`, `CLAUDE.md`, `docs/conseil/`, `docs/chantiers/`, `docs/ressources/veille-2026-10-05-technique.md`, `design-payeur-et-reseau.md`, `mustdo/` | (i), (ii), PR #84, stratégie de divulgation | privés (§3) | privés |

### 2.2 Le cas que D47 interdit d'évoquer

**`docs/conseil/CR-conseil.md`, ligne D47** : la décision dit « jamais évoqué dans le pitch ni dans les docs publiques » et décrit le cas elle-même. C'est le **seul** fichier qui le contient (grep du 06/10). → `docs/conseil/` ne peut pas être public sans réécrire D47.

### 2.3 Adresses e-mail et identités

- **Dans les fichiers** : `CLAUDE.md` contient `hugo.thomas.perso@gmail.com`. Aucune autre adresse personnelle (hors `me@gakonst.com` dans forge-std, public).
- **Dans les métadonnées des commits** (`git log --all --format='%an <%ae>'`, 06/10), **5 identités** :

  | Identité | Commits |
  |---|---|
  | `Hugo Thomas <hugo.thomas.perso@gmail.com>` | 64 (dont ceux de cette session : c'est le `user.email` configuré dans ce dépôt) |
  | `Hugo Thomas <hugo.thomas.perso@gmail.com>` | 25 |
  | `hugo <hugo.thomas.perso@gmail.com>` | 19 |
  | `hugo <hugo.thomas.perso@gmail.com>` | 8 |
  | `hugothomas9 <hugo.thomas.perso@gmail.com>` | 6 |

  Rendre l'historique public publie ces cinq adresses, **dont un domaine d'employeur** et deux noms de machine. C'est à Hugo de juger si c'est un problème (politique de son employeur, vie privée) ; je le signale sans présumer. **Pour les commits à venir**, Hugo peut fixer `git config user.email` à l'identité choisie (P5).

### 2.4 Chemins machine

**48 lignes dans 29 fichiers suivis** mentionnent `/Users/hugo`, `/Users/famillethomas`, `/private/tmp/claude-501/…` ou un identifiant de session :
- **Code** (le seul cas qui gêne un tiers) : `solver/run_mainnet.py` (chemin du vault et d'un scratchpad par défaut), `solver/snapshot.py`. Ça marche sans eux (repli si le fichier n'existe pas, vérifié le 06/10), mais un juré verra le chemin. → À remplacer par une variable d'environnement : **chantier 04 ou pilote** (hors de mon périmètre).
- **Docs** : `ANCRE.md`, `CLAUDE.md`, `docs/chantiers/` (journaux, rapports, README), `docs/conseil/tour5B-revue-tour4.md`, `docs/erc/CHANGES.md`, `docs/ressources/nouveaux-avis-mainnet.md`, `mustdo/` (tous les prompts). Ils sont presque tous dans des dossiers privés (§3). Restent publics : **`docs/erc/CHANGES.md`** (à nettoyer ou garder privé).

### 2.5 Jetons et secrets

- **Aucun secret trouvé** dans l'arbre suivi ni dans l'historique, par motif (`api_key`, `token=`, `ghp_`, `sk-`, `ENVIO_API_TOKEN=…`, UUID, clés hexadécimales de 64 caractères). Les deux UUID de l'historique sont des **identifiants de session Claude Code** dans des chemins de scratchpad, pas des jetons.
- `indexer/.env.example` : valeur factice `<YOUR-API-TOKEN>`. Aucun `.env` n'a jamais été commité (historique vérifié).
- `plugin/scripts/local.mjs` : `DEV_D = 0xac09…ff80` est la **clé de développement publique n° 0 d'anvil**, connue de tous. Sans danger sur un fork local, **à ne jamais financer** sur le testnet ou le mainnet.
- **AM-03.7** : le jeton Envio est apparu en clair dans la conversation de la session 03 (pas dans le dépôt). → **Le régénérer** avant la publication, par précaution (🧑).
- Le **keystore de démo** et les clés Alchemy (D55) doivent rester dans des `.env` locaux, jamais dans le dépôt (MUSTDO).

### 2.6 Contenu stratégique (pas dangereux, mais lu par des investisseurs : revue non confidentielle)

- `docs/conseil/` : délibérations simulées, stratégie de bounties, positionnement contre les concurrents nommés, plan de divulgation.
- `docs/ressources/veille-2026-10-05-*.md`, `design-*.md` : analyses de concurrents (« menaces »), sondes de leurs dépôts.
- `docs/chantiers/` : briefs, journaux, rapports internes (utiles pour montrer le sérieux, mais en français et pleins de « 🧑 BLOQUÉ »).
- `mustdo/` : actions personnelles de Hugo, budget, prompts.
- `BACKEND-KIT.md`, `docs/backend-kit.html`, `docs/product-map.html`, `docs/prompt-council-solver.txt` : obsolètes ou internes.
- Adresses de tiers (owner d'Eve `0x97cD…`, `0xea0b…`, ancres `0x0730…`, `0xf7d5…`, scanner `0xa06f…`) : données on-chain publiques. Les citer **comme des faits**, jamais comme des accusations (D29 pour le scanner). Le README le fait déjà.

---

## 3. Ce qui va dans le dépôt public (proposition, P4)

| Chemin | Proposition | Pourquoi |
|---|---|---|
| `README.md` | **public** (après le §2.1) | vitrine |
| `contracts/` (sauf `lib/`) | **public** après la licence | le produit |
| `contracts/lib/forge-std/` | public (ou sous-module) | dépendance |
| `solver/` | **public**, après le nettoyage des chemins (§2.4) | rejeu de l'acte 1 |
| `indexer/` | **public** (et `ygk94/ancre-indexer`) | bounty Envio |
| `plugin/` | **public** | intégration côté agent |
| `docs/erc/anchored-reputation.md`, `assets/` | **public** si P2 (a) ; sinon après réécriture des Security Considerations | la norme |
| `docs/erc/CHANGES.md`, `relecture-conseil.md` | à relire ; probablement **privé** (notes internes en français, chemins machine) | — |
| `docs/erc/drafts/` | **privé** | correspondance, publications non faites |
| `docs/soumission/` | **privé** (`textes-plateforme.txt` contient des notes internes) ; `video-script.md` et `figures/` : public possible | — |
| `ARCHITECTURE.md` | privé, ou public avec son bandeau de péremption | vision produit antérieure aux décisions |
| `ANCRE.md` | **privé** (EOA, PR #84, stratégie), ou réécrit | — |
| `CLAUDE.md`, `mustdo/`, `docs/conseil/`, `docs/chantiers/`, `docs/ressources/`, `docs/revue/`, `BACKEND-KIT.md`, `docs/*.html`, `docs/prompt-council-solver.txt` | **privé** | §2.2, §2.4, §2.6 |

**Conséquence pour le README public** : il cite `docs/chantiers/rapports/02.md`, `03.md`, `04.md` et `docs/ressources/alchemy.md` comme sources. Si ces dossiers restent privés, il faut soit publier ces quatre rapports (ils sont propres : à relire pour les chemins machine), soit déplacer leurs chiffres dans `contracts/GAS.md`, `indexer/README.md` et `solver/RESULTS.md`. **Recommandation : publier `docs/chantiers/rapports/` (sauf `integration.md`, à relire) et un `docs/alchemy.md` nettoyé**, pour que chaque chiffre du README garde une source publique.

---

## 4. Historique : faut-il un dépôt public propre ?

| Option | Ce qui est publié | Pour | Contre |
|---|---|---|---|
| **(A)** rendre `ygk94/ancre` public tel quel | **tout**, y compris ce qui a été supprimé plus tard : D47, divulgation, 5 identités, veille, `mustdo/` | aucun travail ; historique intact | supprimer un fichier avant la mise en public **n'efface rien** de l'historique. Exclu sauf si Hugo assume tout le §2 |
| **(B)** nouveau dépôt public, **historique filtré** (`git filter-repo`) | seulement les chemins publics du §3, avec leurs commits **datés d'origine**, sous une seule identité (`--mailmap`) | l'historique montre encore que le travail a été fait pendant le hackathon (exigence §4.1, NON CONFIRMÉE) ; rien de privé ne fuit | les hash changent ; une seule fois, à refaire si on recommence ; il faut vérifier le résultat (§7) |
| **(C)** nouveau dépôt, un seul commit | l'état final | le plus simple | **ne montre plus aucun historique**, ce qui contredit l'exigence §4.1 si elle est confirmée |

**Recommandation : (B).** Le dépôt privé `ygk94/ancre` reste le dépôt de travail ; le dépôt public s'appelle par exemple `ygk94/ancre` (si on renomme le privé en `ancre-dev`) ou `ygk94/ancre-metropolis`. Les liens du README et de `indexer/scripts/publish.sh` suivent le nom choisi.

**Commandes, pour Hugo** (`git filter-repo` n'est pas installé sur cette machine : `brew install git-filter-repo`) :
```bash
# dans un clone NEUF, jamais dans le dépôt de travail
git clone --no-local /Users/hugo/Projet/ancre /tmp/ancre-public && cd /tmp/ancre-public
cat > ../keep.txt <<'EOF'
README.md
LICENSE
contracts/
solver/
indexer/
plugin/
docs/erc/anchored-reputation.md
docs/erc/assets/
docs/chantiers/rapports/02.md
docs/chantiers/rapports/03.md
docs/chantiers/rapports/04.md
docs/chantiers/rapports/05.md
docs/soumission/video-script.md
docs/soumission/figures/
.gitignore
EOF
cat > ../mailmap.txt <<'EOF'
<IDENTITÉ CHOISIE> <hugo.thomas.perso@gmail.com>
<IDENTITÉ CHOISIE> <hugo.thomas.perso@gmail.com>
<IDENTITÉ CHOISIE> <hugo.thomas.perso@gmail.com>
<IDENTITÉ CHOISIE> <hugo.thomas.perso@gmail.com>
<IDENTITÉ CHOISIE> <hugo.thomas.perso@gmail.com>
EOF
git filter-repo --paths-from-file ../keep.txt --mailmap ../mailmap.txt
# puis les vérifications du §7 sur ce clone, puis seulement : git remote add origin … && git push
```
Les lignes `Co-Authored-By: Claude …` des messages de commit restent : elles vont dans le sens de la déclaration IA.

---

## 5. Ordre des opérations (proposé)

1. **≤ 10/10** : divulgation (P2), licence (P1), identité (P5), nettoyage des chemins dans `solver/` (session 04 ou pilote).
2. **11/10** : `README.md` final (adresses, regas, `[TBD]` résolus), bloc DISCLOSURE-GATE traité, `docs/chantiers/rapports/` relus.
3. **11/10 soir** : clone filtré (§4), vérifications (§7) sur le clone, relecture humaine du `git log` public.
4. **12/10 matin** : création du dépôt public, push, vérification déconnecté (fenêtre privée) que les liens du README marchent ; `ancre-indexer` public.
5. **12/10** : lien du dépôt dans la soumission.

---

## 6. Ce que ce fichier ne tranche pas

- La règle exacte (§4.1, §7.2) : à confirmer par la modale « Rules & Guidelines » recopiée par Hugo (MUSTDO).
- Si la soumission d'assurance accepte un lien privé (désaccord 5 du tour 7).
- Le nom définitif du projet (ANCRE est provisoire) : il change le nom du dépôt.

---

## 7. Vérifications à rejouer sur le clone public, juste avant le push

```bash
# 1. aucun passage sous embargo (si P2 n'est pas faite)
git grep -nE "8317|0x5472|#84|DISCLOSURE-GATE" ; git log --all -p | grep -cE "8317|0x5472"
# 2. aucune adresse e-mail ni identité privée
git log --all --format='%an <%ae>' | sort -u ; git grep -nIE "@(@employer|@former-employer|gmail)\."
# 3. aucun chemin machine
git grep -nIE "/Users/|/private/tmp|claude-501"
# 4. aucun secret
git log --all -p | grep -iE "(api[_-]?key|token|secret|private[_-]?key)\s*[=:]\s*['\"]?[A-Za-z0-9_-]{20,}"
# 5. pas de CC0 hors ERC
git grep -n "CC0" -- ':!docs/erc'
# 6. le cas D47
git grep -niE "<motif interne>"
# 7. supprimer le bloc DISCLOSURE-GATE du README si P2 n'est pas faite
python3 -c "import re,io;p='README.md';s=open(p).read();open(p,'w').write(re.sub(r'<!-- DISCLOSURE-GATE:start.*?DISCLOSURE-GATE:end -->\n','',s,flags=re.S))"
```
Chaque commande doit ne rien renvoyer (sauf la liste d'identités, qui doit n'en contenir qu'une).

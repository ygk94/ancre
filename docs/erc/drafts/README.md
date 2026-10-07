# Brouillons de publication (chantier 08) : rien n'est envoyé

| # | Fichier | Destinataire | Public ? | Prérequis |
|---|---|---|---|---|
| c | `c-divulgation-erc8004.md` | mainteneurs d'ERC-8004 | **privé** | 🧑 canal, date, signataires. D29 visait le 05/10 ; la checklist de publication la place au 07/10-10/10 ; **non envoyée** au 07/10 (brief 08-bis) |
| a | `a-pr-ethereum-ercs.md` | `ethereum/ERCs`, plus un fil Magicians dédié | public | (c) envoyé ; 🧑 auteurs ; fil ouvert ; ⟦OPEN⟧ et notes retirés ; code de référence accessible ; lint eipw |
| b | `b-reponse-309.md` | fil #25098, réponse au #309 | public | (c) envoyé ; fil dédié ouvert (le message y renvoie) |
| d | `d-demandes-erc8004.md` | issue `erc-8004/erc-8004-contracts`, ou fil #25098 | public | (c) envoyé |
| e | `e-message-colinkamir.md` | ColinkaMir | privé | 🧑 accord de contact ; sa réponse conditionne la citation « 16 sur 9 188 » |

**Ordre recommandé** : c → (attente du délai annoncé) → a (fil puis PR) → b → d. Le message e est indépendant et peut partir tout de suite.

## Marqueurs DISCLOSURE-GATE (08-bis, 07/10)

Tout ce qui relève des deux premiers points du brouillon (c) (D29) est encadré par `<!-- DISCLOSURE-GATE:start … -->` / `<!-- DISCLOSURE-GATE:end -->`, comme dans `README.md` à la racine. C'est le cas dans `anchored-reputation.md`, `CHANGES.md` et les brouillons (a), (b), (d). Le brouillon (c) l'est **en entier**. Rien de tel n'existe hors de ces marqueurs dans `docs/erc/` (vérifié par script le 07/10).

- `python3 strip-notes.py IN OUT` retire les notes ⟦ ⟧ **et** les blocs gated. C'est le mode sûr, celui à utiliser tant que la divulgation n'est pas faite.
- `python3 strip-notes.py IN OUT --keep-gated` retire les notes et garde le texte gated. Il ne sert qu'après la divulgation (🧑).
- ⚠️ **Brouillons (a), (b), (d)** : les marqueurs sont **dans** les blocs de texte à coller. Un commentaire HTML disparaît à l'affichage sur Discourse et GitHub, mais il reste dans le source. Avant de coller, il faut passer le brouillon par `strip-notes.py` (sans `--keep-gated` tant que la divulgation n'est pas faite) et coller la sortie, jamais le fichier brut (relecture E6, C).
- Dans l'ERC, la demande sur le garde-fou est la dernière de Backwards Compatibility (n° 6) : retirer le bloc ne casse donc pas la numérotation 1 à 5.
- ⚠️ Le troisième point du brouillon (c), la mise sous silence par approbation, n'est **pas** sous marqueur dans l'ERC. Le brief ne vise que le garde-fou et l'EOA, et l'ERC y répond désormais par sa propre règle (B, D48). Hugo doit décider si ce point attend aussi la divulgation (🧑, rapport 08-bis).

## Outils internes (08-bis)

- `build-assets.py` : régénère `assets/erc-0000/vectors/` depuis `solver/vectors/` et les mesures de `measurements/`.
- `build-x08.py` : produit les séquences et les refus 08-bis (`measurements/x08/`) avec le pipeline du solveur.
- `measurements/` : sortie de `simulate.py` du 07/10, journal forge des vecteurs 08-bis, et copie du test de rejeu (`X08Vectors.t.sol.txt`).


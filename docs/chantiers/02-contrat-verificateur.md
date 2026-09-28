# Chantier 02 — Contrat vérificateur `AnchoredReputation.sol`


> **Amendements du tour 5 (27/09), prioritaires sur ce brief** :
> - **D32, priorité n° 1** : le contrat ne relit aujourd'hui **aucune arête** dans le registre. Un certificat fabriqué remplace le certificat honnête (AM-5.9, mesuré). Implémenter le niveau **Registry-verified** (chaque arête relue : `readFeedback`, dernier index du tag, wallet, contrôleurs) et **mesurer son coût** (~13,6 M estimés pour la démo), ainsi que le niveau **Submitter-attested** (liste de soumetteurs dans le `setId`).
> - Autres points de D32 : preuve **(v) FABRICATION/GONFLEMENT** ; B⁺ déclaré par ligne ; `t ≤ y` au lieu de `|t − y|`.
> - D33 : veto garanti = dernier avis de l'ancre ; bit certifié = complément.
> - D35 : `ownerOf` en direct par défaut.
> - D36 : `eLow_max` dans la politique.
> - D37 : lemmes L1-L5, test différentiel, vecteurs des 4 violations.
> - D28 : test en fork de l'upgrade vers la PR #80.
> - AM-5.16 : un vecteur nul est une sous-solution valide ; la règle de remplacement doit en tenir compte.


> **Bounty visé (D38)** : *Monad Foundation, Mera: One Passkey, Many Keys* (2,5 k$). Ancres en passkey via Mera (P256 à `0x0100`), en lien avec la rotation des clés d'ancre (D9). À faire après D32. Voir `docs/conseil/bounties-sponsors.md` et le chantier 06.


## Méthode d'exécution et références (vague 3, 27/09)

**Ordre de travail**
1. **D39** : engager θ, ρ, m, q, maxAge et eLow_max dans le `setId`, et appliquer la politique dans `isTrusted`. `assess` OK ne doit plus suffire pour payer.
2. **D32**, en deux niveaux :
   - le niveau Registry-verified : relecture de chaque arête (`readFeedback`, dernier index par tag, `getAgentWallet`, contrôleurs) ;
   - **mesurer** son coût avec `forge test --gas-report` et un contrat consommateur non-view (piège AM-R5.1). Si le coût dépasse le budget, passer au niveau Submitter-attested.
3. Les autres points de D32 :
   - la preuve (v) FABRICATION ;
   - B⁺ déclaré par ligne ;
   - `t ≤ y` au lieu de `|t − y|` ;
   - la règle de remplacement (AM-5.16).
4. **D33** (veto sur le dernier avis), puis **D35** (mode strict).
5. **D37** : lemmes L1 à L5 en Rationale, fuzz, test différentiel contre `solver/`, vecteurs des 4 violations.
6. **D28** : test en fork de l'upgrade vers la PR #80.
7. **Mera (D38 et D43)** : `AnchorRegistry`, avec pré-rotation d'`anchorId`, si le concept Mera retenu en a besoin (**D43** : clés d'époque pré-rotées, empreinte vérifiée par le contrat, `rotateBySig`, plus les coffres de dossier de veto ; **première étape : prototyper la dérivation de 2 époques sur 2 appareils avant d'écrire le contrat**, sinon repli sur le seul dossier de veto ; voir `docs/ressources/cross-idea-mera.md`).
8. Déploiement sur le testnet, sur les registres du testnet (`0x8004A818…` et `0x8004B663…`).

**Skills** : `/code-review high` après chaque étape, et `/security-review` avant tout déploiement.

**Références**
- `contracts/GAS.md`, `contracts/ENCODING.md`.
- `docs/ressources/design-payeur-et-reseau.md` (interface de `assess` / `isTrusted` utilisée par le payeur).
- Doc Monad :
  - coût des opcodes : https://docs.monad.xyz/developer-essentials/opcode-pricing ;
  - Foundry : https://docs.monad.xyz/guides/deploy-smart-contract/foundry ;
  - vérification : https://docs.monad.xyz/guides/verify-smart-contract/foundry.
- Source des registres : https://github.com/erc-8004/erc-8004-contracts.


> **Tour 6 (D44)** : repli owner pour identifier l'émetteur quand le wallet vaut 0 (le wallet reste prioritaire) ; gel des arêtes **sortantes** pendant `TRANSFERRED` ; ROW_ALIAS_MAX = 64 ; preuve (iv-a) pour le passage du wallet de 0 à une adresse. **Priorité après D39 et D32**, sous réserve du désaccord « faut-il le coder avant la soumission ».

## 1. Objectif et résultat final attendu

Faire passer le contrat de R5 (`contracts/`, 49 tests) de **prototype mesuré** à **contrat déployable sur le mainnet pour la démo**, conforme aux décisions du tour 4.

**Livrables**
- `contracts/src/AnchoredReputation.sol` intègre les décisions du tour 4 : veto, relais D16, plafond d'élargissement, permissions.
- Les **preuves d'écart (ii) PÉRIMÉ, (iii) RÉVOQUÉ et (iv) WALLET/CONTROLLER** sont implémentées. La preuve (i) existe déjà.
- La vérification d'`ownerFp` est en place (AM-R5.8).
- Les **scripts de déploiement** `script/Deploy.s.sol` (testnet puis mainnet) fixent leurs gas limits explicitement.
- Une suite de tests étendue :
  - **tests d'invariants et de fuzz** (`forge test --fuzz-runs` élevé) : un résidu faux n'est jamais accepté, et `assess` ne revert jamais ;
  - **tests en fork mainnet** sur les vrais avis.
- `GAS.md` est mis à jour, avec un **budget de lecture** chiffré pour le routeur (chantier 05).
- `ENCODING.md` reste aligné avec `solver/FORMAT.md`.

## 2. Contexte minimal

- Décisions :
  - D1, D5, D6 (certificat à borne croissante), D7, D8 ;
  - D11 renversée (stockage contigu) ;
  - D14 à D18 ;
  - puis celles du tour 4 (D20 et suivantes).
- Faits mesurés (`contracts/GAS.md`, 27/09) :
  - une mise à jour coûte 1 600 / 2 470 / 4 250 gas par arête pour k = 1 / 3 / 8 ;
  - `assess` coûte 77 k sans veto et 115 à 190 k avec veto ;
  - un nouveau nœud coûte 28,7 k ;
  - l'exécution domine, le plancher EIP-7623 n'est jamais atteint.
- Registres : voir le CR, « Faits vérifiés entre les tours 2 et 3 ». `readFeedback` a des index à partir de 1 ; `getClients` et `readAllFeedback` existent ; **proxys UUPS contrôlés par une EOA**.

## 3. Ce qui est déjà tranché

- Stockage entrelacé par groupes de 4 nœuds (écart assumé, AM-R5.10).
- `vectorRoot` est un keccak plat (AM-R5.12).
- `VIEW_CALL_GAS = 120 000` par appel externe (AM-R5.9).
- Statuts énumérés ; `assess` ne revert jamais.

## 4. Pistes à creuser

- **Coût de `assess`** : un `ownerOf` via un proxy froid coûte ~36 k. Piste : l'owner engagé dans le certificat, vérifié par la preuve (iv), avec un `ownerOf` optionnel. À mesurer : EIP-2930 (access list) réchauffe une page entière selon la doc Monad. Un routeur peut-il pré-réchauffer les pages du registre ?
- **Veto** : selon la décision du tour 4, par exemple un tag réservé lu via `getLastIndex` et un seul `readFeedback`. Mesurer le coût réel à travers le proxy.
- **Preuves (ii) à (iv)** : pseudo-code dans le CR (tour 2, « Spécification Q1 ») et dans `docs/erc/anchored-reputation.md`. Attention aux amendements : (ii) doit viser le même tag (AM-R6.3), et (iv) est scindé en SENDER et CONTROLLER (AM-R6.4).
- **Plafond d'élargissement par ligne** (AM-R6.2) : il faut stocker l'état de chaque ligne (`rowState`), donc un SSTORE par preuve. Le coût est acceptable parce que les preuves sont rares ; à mesurer.
- **Permissions** (AM-R5.7) : selon le tour 4.
- **Revue de sécurité** : la réentrance est-elle possible via le registre dans `submitCertificate` ? Débordements dans `mulDiv` ? Sens des arrondis vérifiés contre `test/utils/CertLib.sol` ? `block.number` partout, jamais `block.timestamp` ?
- **Déploiement** : Foundry `network = "monad"`, gas limit explicite (sur Monad on paie la gas limit), vérification de la source (Sourcify, puis le vérificateur de l'explorateur Monad : chercher lequel fonctionne sur la chaîne 143).

## 5. Pièges connus

- forge n'isole pas les appels `view` d'un test (AM-R5.1). Toujours mesurer les lectures à travers un contrat consommateur.
- viaIR fait déverser les variables sur la pile dans la boucle chaude (AM-R5.4). La boucle a été réécrite ; ne pas la « simplifier » sans remesurer.
- Réserve de 10 MON par compte : prévoir un compte de déploiement financé.
- Un certificat de plus de ~1 000 nœuds ne tient pas en une transaction : utiliser `addNodes` et `reserveCapacity`.

## 6. Questions ouvertes

- Faut-il un `pause()` ou un owner sur le contrat ? Un contrat immuable est plus cohérent avec la norme, mais on perd la possibilité de corriger un bug pendant la démo.
- Le contrat de démo est-il le même que l'implémentation de référence de l'ERC ?

## 7. Critères d'acceptation

- Tous les tests passent, fuzz inclus, avec la commande et la sortie dans le rapport.
- Chaque type de preuve est couvert par un test valide et un test invalide.
- `GAS.md` donne, pour les tailles de la démo (acte 2 : environ 300 arêtes, 100 nœuds, k = 3), le coût d'une mise à jour, d'un premier certificat, d'une preuve de chaque type et d'un `assess` avec et sans veto.
- Déploiement réussi sur le **testnet** sur les registres ERC-8004 du testnet (Identity `0x8004A818…BD9e`, Reputation `0x8004B663…8713`, présents et en v2.0.0). Le déploiement mainnet se fait dans le chantier 06 ou 09, **avec l'accord de Hugo**.

## 8. Interfaces

- Consomme les certificats du chantier 04 (format `solver/FORMAT.md` / `ENCODING.md`).
- Produit `assess`, les statuts et les events, pour les chantiers 05 et 07.

## 9. Règles

Voir `README.md`. Aucune transaction réelle sur le mainnet sans accord.

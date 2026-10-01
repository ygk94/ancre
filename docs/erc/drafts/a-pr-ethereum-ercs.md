# Brouillon (a) : PR sur `ethereum/ERCs`

> **NE PAS ENVOYER.** Brouillon du chantier 08, 2026-10-01. Publication = étape R10, sur décision de Hugo.
> Règles vérifiées le 2026-10-01 (agent web, sources lues : EIP-1 au commit du 2026-09-16, `config/eipw.toml` d'ethereum/ERCs au 2026-08-10, PR #2037, #2012 et #1935).

## Préalables, dans l'ordre (aucun n'est fait)

1. 🧑 **Ouvrir un fil dédié sur Ethereum Magicians**, catégorie ERCs, titre « ERC-XXXX: Anchored Reputation for Trustless Agents ».
   - Le linter exige `discussions-to` de la forme `https://ethereum-magicians.org/t/<slug>/<id>`.
   - Les éditeurs demandent que le fil existe **avant** la PR (PR #1935 : « Please create actual discussions topic on Eth Magicians »).
   - Le fil d'ERC-8004 (#25098) ne convient pas.
   - Premier message proposé : le texte de la section « Message d'ouverture du fil » ci-dessous.
2. 🧑 Renseigner `author` : au moins un auteur avec un pseudo GitHub, par exemple `Hugo Thomas (@hugothomas9)`, plus les co-auteurs de l'équipe s'ils le souhaitent.
3. 🧑 Décider de la visibilité du code de référence :
   - soit le dépôt devient public ;
   - soit on copie `AnchoredReputation.sol` dans `assets/erc-0000/`.
   EIP-1 n'autorise pas de lien vers GitHub dans le texte.
4. Retirer toutes les notes ⟦ ⟧ et les ⟦OPEN⟧ du fichier.
   - Les points encore ouverts passent dans le premier message du fil, comme questions à la communauté.
5. Copier les fichiers dans un fork d'`ethereum/ERCs` :
   - `ERCS/erc-0000.md` (ce texte, avec `eip: 0000`) ;
   - `assets/erc-0000/` (le `README.md`, `verify.py`, `vectors/`).
   Puis remplacer `../assets/erc-0000/` si un éditeur attribue un numéro.
6. Lancer le linter en local. eipw 0.11.0 n'est pas installé ici : il faut `cargo install eipw`, ou l'image docker `rust:1`.
   - Avec la config du dépôt : `eipw --config config/eipw.toml ERCS/erc-0000.md`.
   - Copier d'abord `EIPS/eip-*.md` du dépôt EIPs dans `ERCS/`, comme le fait la CI.
7. Ouvrir la PR : titre « Add ERC: Anchored Reputation for Trustless Agents », description ci-dessous.
   - Un éditeur attribue le numéro sous 1 à 5 jours, en suggestion de revue.
   - D'après les PR observées, c'est `abcoathup` qui le fait.
   - La CI reste rouge sur le numéro jusque-là.

## Description de la PR (anglais, à coller)

```markdown
## Add ERC: Anchored Reputation for Trustless Agents

Discussion: https://ethereum-magicians.org/t/<slug>/<id>

ERC-8004 records feedback about agents but leaves aggregation and Sybil filtering to readers (`getSummary` requires a caller-supplied list of clients). This ERC standardizes that layer for contracts:

- **Reader-chosen anchors.** An anchor set (anchors, weights, tag schema, policy) is immutable and content-addressed by its `setId`. There is no global score and no default set.
- **Sub-solution certificates.** Per anchor, a personalized-PageRank column over the ERC-8004 feedback graph. The aggregator accepts it only if `t ≤ F(t)` coordinate by coordinate, which makes every value a lower bound of the true trust, with no error term, as long as the committed graph is dominated by the registry. At the `RegistryVerified` level, every committed edge is re-read in the registry at submission.
- **Discrepancy proofs.** Omitted, diluted or outdated edges can be proven by anyone. A proof widens the certificate's bounds and never moves funds.
- **A non-reverting read for paying contracts.** `isTrusted(agentId, setId)` applies the committed policy: leave-one-anchor-out trust, distrust ratio, live anchor veto, freshness and transfer.

Test vectors (`assets/erc-0000/`) come with a standard-library Python checker that recomputes every expected value from the text, including exact-rational checks of `t ≤ t*`. A reference implementation passes all of them. The ERC also lists five requests for a future ERC-8004 revision (Backwards Compatibility).

Prior art is cited in the Rationale: OpenRank's on-chain EigenTrust verification, the trustgraphs project, and x402 issue 2641.
```

## Message d'ouverture du fil Magicians (anglais, à coller)

```markdown
**ERC-XXXX: Anchored Reputation for Trustless Agents**

ERC-8004 delegates Sybil filtering and aggregation to readers. This draft proposes a standard aggregation layer that contracts can read before they pay: personalized PageRank relative to anchors chosen by the reader, certified on-chain as a sub-solution (a per-agent lower bound under a stated domination condition), with registry re-reads at submission and permissionless discrepancy proofs.

Draft: <link to the PR once opened>

Open questions where feedback is most useful:
1. Anchor key rotation (pre-rotated `anchorId`) is specified as a future extension. Should it be in the first version, at the cost of a registry of anchor keys?
2. The live veto reads only an anchor's latest feedback (O(1)), while the graph applies negative dominance per tag. Is the rule "an anchor posts nothing after a veto" acceptable, or should a dedicated `veto` tag be read instead?
3. Should certificates have a degraded mode when nobody recertifies before `maxAge`, or should they always fail closed?
4. Negative feedback is permanent if its author loses its key. Should the standard define an expiry, knowing that an attacker would then wait it out?

Measurements behind the design (one production ERC-8004 v2.0.0 deployment, dated):
- 83 % of 9,188 feedback entries came from one farm (2026-09-21);
- a naive mean of about 1.5 × 10³⁶ for its target;
- 78 entries posted to one agent by its own `agentWallet` (2026-09-27).
```

⟦Notes pour Hugo :
- Le pitch vise une PR le 12/10 (recommandation du tour 5). Ce brouillon suppose que les ⟦OPEN⟧ restants sont posés comme questions à la communauté, et non tranchés.
- Le paragraphe « Prior art » ne cite les projets que par leur nom (EIP-1 interdit les liens).
- Le message d'ouverture ne nomme ni la chaîne ni les tiers : cohérent avec la Motivation, où Monad n'est nommé qu'une fois.⟧

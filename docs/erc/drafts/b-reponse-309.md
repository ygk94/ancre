# Brouillon (b) : réponse au post #309 du fil ethereum-magicians #25098

> **NE PAS ENVOYER.** Brouillon du chantier 08, 2026-10-01.
> **Ordre imposé** : ce message mentionne publiquement le garde-fou qui ignore `agentWallet`. Il ne part **qu'après** la divulgation privée (brouillon c, D29), et seulement si le fil dédié à l'ERC est ouvert (brouillon a), puisqu'il y renvoie.

## État du fil (vérifié le 2026-10-01 par un agent, API JSON du forum)

- **#309** : `clai-mach`, le 2026-07-23 à 18:50 UTC, en réponse à #301.
  - Il propose que la requête prenne « a reader-supplied anchor set rather than returning a global view (… personalised PageRank and EigenTrust's pre-trusted peers …) ».
  - Il demande aux auteurs (`@spengrah`, `@davidecrapis.eth`) si le registre doit rendre explicite l'évaluation relative à une racine.
- **Réponses à #309** : #310 (`pipavlo82`), #311 (`babyblueviper1`, qui envisage d'accepter un ensemble d'ancres fourni par l'appelant) et #320. **Aucune ne vient d'un auteur d'ERC-8004.** Le dernier message d'un auteur dans le fil date du 2025-11-03.
- Le fil compte 402 posts ; le dernier date du 2026-09-18.

## Texte (anglais, à coller ; ≈ 170 mots)

```markdown
@clai-mach — on reader-supplied anchors: we built this against ERC-8004 v2.0.0 and wrote it up as a draft ERC, discussed here: <link to the dedicated thread>.

What we measured on one production deployment (chain ID 143):
- 7,665 of 9,188 feedback entries (83 %) came from agents registered within about 48 hours, all rating one agent at the maximum; its naive mean was about 1.5 × 10³⁶ (2026-09-21).
- With personalized PageRank relative to anchors chosen by the reader, that agent gets zero for every anchor set from which no endorsement path reaches the farm, and one honest two-hop endorsement chain remains in the whole registry (2026-10-01).
- Two registry properties matter for any reader-anchored scheme: feedback carries no block number, so an omission cannot be dated, and `giveFeedback` does not reject the agent's own `agentWallet` (one agent received 78 entries from it, 2026-09-27).

The draft certifies each anchor's column on-chain as a sub-solution (`t ≤ F(t)`), which gives a per-agent lower bound, and it defines no default anchor set.
```

⟦Choix :
- **Aucune promesse** : ni « we will », ni date, ni déploiement annoncé.
- **Aucun tiers nommé** : ni ferme, ni scanner, ni agent #8317, ni concurrent.
- **Pas de nom de projet** : ANCRE est provisoire (🧑).
- **Monad non nommé** : seul le chain ID est donné, comme dans l'ERC.
- **Tous les chiffres sont datés.** « One honest two-hop endorsement chain » vient du chantier 04 (D20, 01/10).
- On répond à la question de fond (évaluation relative à une racine) sans parler à la place des auteurs.
- À ne pas faire : relancer les auteurs par une mention, puisque le message de #309 les mentionnait déjà.⟧

# Brouillon (e) : message à ColinkaMir (monad-agent-trust)

> **NE PAS ENVOYER.** Brouillon du chantier 08, 2026-10-01. 🧑 Décision de Hugo (question ouverte n° 3 de CLAUDE.md §10).
> **Canal** : une issue ou une discussion sur `ColinkaMir/monad-agent-trust` serait publique. Préférer le contact de leur profil, ou un message privé.
> **Contexte vérifié le 01/10 (API GitHub)** :
> - description du dépôt : *« Provenance for ERC-8004 reputation on Monad: which ratings are backed by a payment the owner did not fund. Wallet signals bought per call over x402. »* ;
> - dernier push le 2026-10-01 ; agent inscrit on-chain #10253 (CR, AM-6.13) ;
> - positionnement (D30, D45, D46) : **complémentaire**, cité comme exemple d'`edgeFilterId`, **sans dépendance**.

## Texte (anglais)

```text
Hi,

We have been reading monad-agent-trust with interest: we work on the same ERC-8004 data on Monad, from a different angle.

Your project asks which ratings are backed by a payment the owner did not fund. Ours asks whether anyone the reader trusts vouches for the rated agent: personalized PageRank relative to anchors chosen by the reader, certified on-chain so that a paying contract can read it before it pays. We think the two are complementary. A self-funded farm can pay itself, and an honest agent can have no anchor-reachable endorser yet.

We are drafting an ERC for this layer. Its Rationale describes payment provenance as an example of an "edge filter": a predicate that removes feedback before aggregation. It names your project as an example, with no dependency and no claim about your method. Two questions before anything is published:

1. Is the one-line description above a fair summary of what monad-agent-trust measures?
2. We have seen the figure "16 feedback entries out of 9,188 with clean payment provenance" attributed to your analysis (data of 2026-09-21). May we cite it, and is that the right figure and date? If you prefer, we will leave it out.

Happy to share our edge rules and test vectors if they are useful to you.

<names>
```

⟦Notes :
- **Aucune promesse** : ni intégration, ni date, ni lien vers un dépôt privé.
- La Motivation de l'ERC cite le chiffre « 16 sur 9 188 » comme « reported by a third-party analysis, not re-verified ». La question 2 sert à le valider avant toute publication. Sans accord, on le retire de la Motivation.
- Kanmani (tour 6) n'a pas de brouillon : le brief ne le demande pas. Le tour 6 laisse le contact à Hugo (« Faut-il contacter Kanmani comme ColinkaMir ? »). Le même modèle s'adapte en remplaçant « payment provenance » par « payment-claim verification » et le chiffre « 73 sur 85 » (auto-déclaré, lu le 28/09).⟧

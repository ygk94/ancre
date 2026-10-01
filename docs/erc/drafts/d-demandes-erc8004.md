# Brouillon (d) : demandes à ERC-8004

> **NE PAS ENVOYER.** Brouillon du chantier 08, 2026-10-01.
> **Format** : une issue sur `erc-8004/erc-8004-contracts` (la demande 5 vise aussi le texte de l'EIP), ou un post dans le fil #25098.
> **Ordre** : les demandes 2 et 4 renvoient aux constats de la divulgation (brouillon c). Elles ne partent qu'après elle.
> **Correspondance** : demandes 1 à 5 de la section Backwards Compatibility de l'ERC (D17, tour 3 Q3 C ; la 5 vient d'AM-R6.10).

## Texte (anglais)

```markdown
**Requests for a future ERC-8004 revision, from a reputation-aggregation use case**

We are drafting an ERC for reader-anchored aggregation of ERC-8004 feedback, certified on-chain and readable by a paying contract (discussion: <link>). Five properties of the registries limit what any aggregator can guarantee. Each request below is small, and each removes a limitation we currently have to document.

**1. Record `block.number` with each feedback.**
Feedback is not dated. An aggregator therefore cannot tell whether a feedback existed when it computed a result, which rules out fraud proofs of the form "this feedback predates your certificate". It also cannot separate the reputation an agent received before a transfer from what it received after, so buying a reputable agent buys its history.
Minimal change: one `uint64` per feedback in storage, returned by `readFeedback` or by a new getter.

**2. Extend the `giveFeedback` guard to `agentWallet`.**
The guard rejects `isAuthorizedOrOwner(msg.sender, agentId)` but not `getAgentWallet(agentId)`. On chain ID 143, one agent has received 78 feedback entries from its own `agentWallet` (measured 2026-10-01).
Minimal change: also revert when `msg.sender == getAgentWallet(agentId)`.

**3. Make `agentWallet` unique and add a reverse lookup.**
On chain ID 143, 178 wallets are the `agentWallet` of several agents (1,773 agents in total, up to 762 per wallet, measured 2026-09-27). Resolving which agent a client acts for, and checking that a list of an agent's outgoing feedback is complete, is impossible on-chain today.
PR #80 implements this.

**4. Put a timelock in front of registry upgrades.**
The Identity and Reputation proxies are owned by a single externally owned account, with no delay before an upgrade takes effect (chain ID 143, verified 2026-10-01). Aggregators and payers can only detect an upgrade after the fact, and not at all if the version string is unchanged.
Minimal change: an owner contract with a public delay (for example a standard timelock controller), so that consumers can react before new semantics apply.

**5. Standardize `getVersion()` in the interface.**
The deployed registries expose `getVersion()`, but the ERC does not define it. An aggregator that commits to a registry version relies on an implementation detail.
Minimal change: add `function getVersion() external view returns (string memory)` to both interfaces, with a change of value on every semantic change.

None of these breaks existing integrations. Requests 1 and 3 change storage layout, so they would ship with the next upgrade.
```

⟦Notes :
- Chiffres relus le 01/10 : 78 (`cast`), owner EOA. Le chiffre de 178 wallets date du 27/09 (CR tour 3) et n'a pas été remesuré.
- PR #80 : ouverte le 2026-05-07, toujours ouverte le 01/10, description vide (agent web).
- Aucune promesse, aucune date, aucun nom de projet.⟧

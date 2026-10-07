# Brouillon (c) : message de divulgation privée aux auteurs d'ERC-8004 (D29)

<!-- DISCLOSURE-GATE:start — keep only once the ERC-8004 maintainers have been notified (decision D29) -->

> **Tout ce document est sous DISCLOSURE-GATE** : c'est la divulgation elle-même. Il reste privé dans tous les cas (correspondance), et ne doit pas figurer dans une version publique du dépôt.

> **NE PAS ENVOYER.** Brouillon du chantier 08, 2026-10-01. **Décision de Hugo** sur l'envoi, le canal et la date.
> D29 (tour 5A, confiance 0,7) recommande de prévenir en privé **avant le 05/10**. Nous sommes le 01/10 : 🧑 **la décision est urgente**.
> Lien avec D28 (AM-5.4) : prévenir peut déclencher une upgrade avant le 13/10. Le plan B existe : recertification scriptée après `REGISTRY_CHANGED`, démo figée sur un bloc, upgrade vers la PR #80 testée en fork.

## Destinataires et canal (🧑 à choisir)

Mainteneurs actifs d'`erc-8004/erc-8004-contracts`, d'après les contributeurs relevés par l'API GitHub le 01/10 (aucun fichier CODEOWNERS lu) :
- `tetratorus` (111 commits, auteur de la PR #80) ;
- `marcoderossi90` (derniers commits sur master le 2026-08-15) ;
- `Eversmile12`.

Canaux possibles, du plus au moins privé :
1. **GitHub Private Vulnerability Reporting** du dépôt, s'il est activé (onglet Security). Je n'ai pas pu le vérifier sans compte connecté : NON VÉRIFIÉ.
2. E-mail direct aux auteurs listés dans l'EIP.
3. Message privé sur Ethereum Magicians à `Marco-MetaMask` et `davidecrapis.eth`.

Ne **pas** passer par une issue publique : les points 1 et 2 du message deviennent publics dans notre pitch et dans l'ERC.

## Texte (anglais)

```text
Subject: ERC-8004 reference deployment — three observations before we mention them publicly

Hello,

We are building a reputation aggregator on top of ERC-8004 v2.0.0 (a draft ERC is in preparation). While checking the deployed registries against the source, we noticed three things that will appear in a public hackathon presentation and in the draft ERC's Security Considerations. All three follow from the public source code; we are telling you first so you are not surprised.

1. Upgrade authority. On chain ID 143, the IdentityRegistry proxy (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) and the ReputationRegistry proxy (0x8004BAa17C55a88189AE136b182e5fdA19dE9b63) are UUPS proxies whose owner() is the same externally owned account, 0x547289319C3e6aedB179C0b8e8aF0B5ACd062603, with no timelock or multisig in front of upgradeToAndCall (read on-chain at block 111,299,306, 2026-10-07). The testnet registries (10143) use the same key. Anyone relying on the registries' semantics depends on that single key.

2. Self-feedback through agentWallet. giveFeedback rejects isAuthorizedOrOwner(msg.sender, agentId) — owner, approved, operators — but not getAgentWallet(agentId). On chain 143, agent 8317 has received 78 feedback entries from its own agentWallet (getLastIndex(8317, agentWallet) = 78 at the same block). PR #84 (closed on 2026-08-17) addressed self-feedback by owners acting through contract accounts; the agentWallet path is a separate gap, and agentWallet is also not unique (178 wallets are the agentWallet of several agents, measured 2026-09-27), which PR #80 would address.

3. Silencing raters through approvals. Because giveFeedback rejects operators, the owner of an agent can call setApprovalForAll for any address and thereby prevent it from posting any further feedback on that agent, negative feedback included. An aggregator that also rejects controllers then drops the existing negative feedback of those addresses. This is a consequence of the current guard rather than a bug in the code, but it lets an owner make its agent immune to new criticism at the cost of a few approvals.

Our draft ERC treats them as reader-side issues: when building edges it rejects the positive feedback of every current controller, agentWallet included, keeps their negative feedback, and reads an approval given to one of the reader's anchors as that anchor's veto; it commits the registry version in each certificate. It also lists, as requests for a future revision: a block number per feedback, the guard extended to agentWallet, unique agentWallet with a reverse lookup, a timelock on upgrades, a standardized getVersion(), and registration events emitted in state order.

 We intend to mention these points publicly not before <DATE>. If you would prefer us to wait, or if you see something we got wrong, please tell us.

Thank you for ERC-8004,
<names>
```

⟦Notes :
- **Faits relus on-chain le 01/10** (`cast`, bloc 109 610 215), **puis par 08-bis le 07/10** (`cast`, bloc 111 299 306, `rpc.monad.xyz`) : `owner()` des deux proxys = `0x5472…2603`, pas de code à cette adresse (EOA), `getVersion()` = 2.0.0, wallet de #8317 = `0x4498…Eead`, `getLastIndex(8317, wallet)` = 78. Les slots d'implémentation n'ont pas été relus le 07/10. Pour le testnet, « même clé » vient du CR (vagues 1-2, 27/09) et n'a pas été relu aujourd'hui.
- **PR #84** : objet et date relevés par l'API GitHub le 01/10.
- On ne nomme pas l'owner de #8317, et on ne parle pas du scanner (AM-5.2 : service automatique, pas complice).
- 🧑 `<DATE>` : au plus tôt la soumission (12/10), ou un délai de 7 jours.
- 🧑 `<names>` : signataires.⟧

<!-- DISCLOSURE-GATE:end -->

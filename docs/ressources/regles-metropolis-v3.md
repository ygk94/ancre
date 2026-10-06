# Règles officielles de Metropolis (Rules & Guidelines v3.0, mises à jour le 03/09/2026)

> Source : la modale « Rules & Guidelines » de hackathon.monad.xyz, recopiée par Hugo le 07/10. Le texte intégral reste sur la plateforme ; ce fichier n'en garde que ce qui engage ANCRE, avec la référence de chaque section. Statut : DOC.

## Ce qui est obligatoire pour toute soumission (§3.3, §4.1, §7.2, §9)

| Exigence | Section | État d'ANCRE au 07/10 |
|---|---|---|
| Dépôt GitHub **public**, code complet, README avec instructions d'installation | §4.1.1 | Privé : public prévu le 12/10 |
| **Licence OSI** (MIT, Apache 2.0, GPL, BSD) | §4.1.1, §7.2 | ❌ Aucun fichier `LICENSE`. 20 fichiers `.sol` en **CC0-1.0, qui n'est pas OSI**. Plugin et indexeur en MIT |
| « Code must be publicly accessible on GitHub **throughout and after** the Hackathon » | §7.2 | ⚠️ Le dépôt est privé aujourd'hui (voir plus bas) |
| Attribution claire du code et des bibliothèques externes | §4.1.1, §7.3, §10.3 | README §14 (forge-std) ; à compléter (viem, React, Envio, etc.) |
| **Historique de commits couvrant la période de build** | §4.1.1 | ✅ Premier commit le 23/09/2026, 201 commits. **Un dépôt public « propre », sans historique, ne respecterait pas cette règle** |
| Majeure partie du travail faite pendant la période ; code préexistant identifié dans le README | §4.1.4 | Aucun code préexistant connu ; à écrire explicitement |
| **Usage d'outils IA déclaré dans le README** | §4.1.4 | ✅ README §13 |
| Vidéo de **3 min max**, publique, produit **en fonctionnement réel** (pas de maquette ni de slides), **interactions Monad visibles** | §4.1.2, §9.4 | À tourner le 11/10. Une démo uniquement en fork risque de ne pas compter comme « interactions Monad » : **l'acte 2 sur le vrai testnet devient nécessaire** |
| Déploiement sur Monad **mainnet ou testnet**, **adresses de contrat ou hashes de transaction** fournis | §4.1.3, §9.2 | À faire (07-08/10) |
| Doc : description, architecture, stack, installation et déploiement | §4.1.5 | README (chantier 09) |
| Code qu'un tiers peut lancer en suivant le README ; problème et utilisateur visé énoncés | §9.1 | À vérifier sur un clone neuf avant la soumission |
| **Une seule track** par soumission, un seul projet par participant | §2.5 | Track 04 |
| Équipe de 1 à 5, un contact principal qui reçoit les prix | §2.4 | — |

## Calendrier et jugement (§4.2, §5)

- **Clôture : 13/10/2026 à 23:59 ET, soit 14/10 à 05:59 à Paris.** La soumission reste modifiable jusque-là : c'est la version enregistrée à la clôture qui est jugée.
- Jugement du 14 au 27/10, résultats le 03/11.
- **Tracks** : 5 critères à 20 % chacun : qualité et complétude du produit, excellence technique, intégration Monad, adéquation à la track, innovation et impact. Track 04 : « protocols, primitives, or infrastructure layers that other applications build on, rather than standalone consumer products ».
- **Bounties** : respect des exigences publiées par le sponsor 40 %, implémentation technique 30 %, intégration Monad 20 %, innovation 10 %.
- **Prix** : 10 k$ à chacun des trois premiers de chaque track, plus 25 k$ pour le gagnant global. Paiement en USDC, KYC possible (§6).

## Ce qui demande une attention particulière

- **§5.3 Non-confidentialité** : les soumissions sont examinées sans confidentialité. Les juges, sponsors et mentors peuvent développer des produits similaires. « Do not include trade secrets, private keys, credentials, or third-party personal data ».
- **§4.3 Propriété** : le participant confirme que la soumission ne contient aucune information confidentielle d'un employeur, actuel ou passé, et que sa participation ne viole aucun accord avec un employeur ou un client, « including any assignment of inventions provision ».
- **§8.2 et §10.2 Code malveillant** : sont interdits le fait de soumettre du code malveillant ou des « security vulnerabilities », ainsi que le code « designed to harm or deceive users ». **La ferme Sybil de la démo doit rester un scénario de test clairement étiqueté** (comptes `demo`, testnet), jamais une attaque contre des tiers sur le mainnet.
- **§7.1 Licence accordée** : l'organisateur et chaque sponsor reçoivent une licence perpétuelle et non exclusive pour reproduire, afficher et distribuer la soumission, et pour l'utiliser en promotion.
- **§3.4** : participer ne donne droit à aucun financement.

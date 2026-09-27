# ANCRE R4 — acte 1 sur le snapshot mainnet du 21/09/2026

Commande : `cd solver && .venv/bin/python run_mainnet.py`. Données : 9188 avis (snapshot 8004scan 21/09), identité au bloc 108434518 (10261 agents), 71 détenteurs passés (logs Transfer), 32 opérateurs actifs (ApprovalForAll), 0 getApproved non nul. α = 1/3, m = 2, λ uniformes. Tous les chiffres ci-dessous sont MESURÉS par ce script.

Source des avis : relecture on-chain readAllFeedback (bloc 108 434 518) ; 9188 avis, 9188 clés communes avec le snapshot du 21/09 ; **24 avis où 8004scan diffère (valeur/décimales)** : {('uptime', 0, 2): 20, ('fast', 0, 2): 2, ('helpful', 0, 2): 2} (tag1, décimales 8004scan, décimales on-chain).

## 0. Ce qui survit au schéma de référence (registre entier)
- filtre `core` (3 tags) : **5 arêtes** (couples), émetteurs {'addr': 3} ; compteurs {'avis_lus': 9188, 'hors_filtre_ou_schema': 9182, 'aretes_couple': 5, 'emetteur_adresse_ambigu': 1, 'emetteur_adresse_sans_agent': 2}
- filtre `reference` (8 tags) : **7 arêtes** (couples), émetteurs {'agent': 2, 'addr': 3} ; compteurs {'avis_lus': 9188, 'hors_filtre_ou_schema': 9141, 'rejet_controleur_past_owner': 4, 'aretes_couple': 7, 'emetteur_adresse_ambigu': 1, 'emetteur_adresse_sans_agent': 2}
- filtre `execution-market-8` (8 tags) : **1 arêtes** (couples), émetteurs {'addr': 1} ; compteurs {'avis_lus': 9188, 'hors_filtre_ou_schema': 9104, 'rejet_controleur_past_owner': 9, 'aretes_couple': 1, 'emetteur_adresse_ambigu': 1}
- tags endorsement du schéma : 15 (> TAGS_MAX = 8 : aucun ensemble ne peut tous les filtrer).

## (a) Eve-8004 (#182) : moyenne naïve contre ANCRE
- getSummary(#182, tous les clients, '', '') : 7665 avis, moyenne = **1.5264e+36** (dont 117 valeurs à 1e38).
- Région ferme S = #182 ∪ agents dont l'owner ou le wallet a noté #182 : **7666 agents**.
- ancres {0x07305360, 0xf7d5543d}, schéma référence : arêtes du graphe = 7, masse sur S = ['0', '0'], t(#182) = absent du support, e = [9, 9] wei, nœuds certifiés = 3.
- ancres {0x07305360, 0xf7d5543d}, schéma stress (tout tag = endorsement [-100,0,100]) : arêtes du graphe = 7589, masse sur S = ['0', '0'], t(#182) = absent du support, e = [9, 9] wei, nœuds certifiés = 3.
- contrôle (le lecteur choisit 2 wallets de la ferme comme ancres, schéma stress) : t(#182) = ['0', '0.222222'], trustRobust = 0. ANCRE est relatif aux ancres : il ne protège pas un lecteur qui ancre dans la ferme.

## (b) Ancre = scanner 0xa06f907f : fuite vers la ferme, avec et sans D15
- le scanner a posté 32 avis sur 28 agents (tags {'liveness': 8, 'trust': 24}) ; 30 avis visent la région S.
- ancres {scanner}, sans D15 (trust, liveness, eve propagent) : masse sur S par colonne = ['0.345622'] ; t(#182) = ['0.138249'] ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 (+e) : 0 ; e_eff = 165 wei.
- ancres {scanner}, avec D15 (schéma de référence) : masse sur S par colonne = ['0'] ; t(#182) = 0 ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 (+e) : 0 ; e_eff = 3 wei.
- ancres {scanner, 0x07305360}, sans D15 (trust, liveness, eve propagent) : masse sur S par colonne = ['0', '0.345622'] ; t(#182) = ['0', '0.138249'] ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 (+e) : 0 ; e_eff = 168 wei.
- ancres {scanner, 0x07305360}, avec D15 (schéma de référence) : masse sur S par colonne = ['0', '0'] ; t(#182) = 0 ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 (+e) : 0 ; e_eff = 6 wei.
- ancres {scanner, scanner 0xc71a15fc}, sans D15 (trust, liveness, eve propagent) : masse sur S par colonne = ['0.345622', '0.37037'] ; t(#182) = ['0.138249', '0.148148'] ; max trustRobust(m=2) sur S = 0.0691244 ; agents de S au-dessus de θ = 1e-3 (+e) : 1 ; e_eff = 196 wei.
- ancres {scanner, scanner 0xc71a15fc}, avec D15 (schéma de référence) : masse sur S par colonne = ['0', '0'] ; t(#182) = 0 ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 (+e) : 0 ; e_eff = 4 wei.
- Borne théorique de la fuite, colonne scanner seul, sans D15 : π(S) ≤ ((1−α)/α)·Σ_{u∉S} π(u)·C(u,S) = **0.6221** ; masse mesurée sur S = **0.345622**. Ici le seul nœud hors S qui pointe dans S est l'ancre (π = α), donc la borne vaut (1−α)·C(ancre,S) = (2/3)·0.9332. La borne tient ; l'écart vient de ce que S absorbe (les agents Spawn n'ont qu'une arête, vers #182, qui n'en a aucune).

## (c) #8317 : les 78 auto-notations sont-elles rejetées ?
- avis reçus par #8317 : 78, noteurs {'0x44985413': 78} ; owner = 0x656df648, agentWallet = 0x44985413.
- garde-fou du registre (`!isAuthorizedOrOwner`) : owner/opérateurs/approved seulement ; le wallet n'y est pas, d'où l'acceptation on-chain des 78 avis.
- schéma référence (trade_execution = measurement) : arêtes vers #8317 = **0** ; compteurs {'avis_lus': 9188, 'hors_filtre_ou_schema': 9110, 'rejet_measurement_D15': 78, 'aretes_couple': 0} (le rejet D16 porte sur le couple, après sélection du dernier avis valide par tag1 : les 78 avis se réduisent à 1 triplet) ; rejets détaillés : []
- schéma stress (trade_execution = endorsement) : arêtes vers #8317 = **0** ; compteurs {'avis_lus': 9188, 'hors_filtre_ou_schema': 9110, 'rejet_controleur_agentWallet': 1, 'aretes_couple': 0} (le rejet D16 porte sur le couple, après sélection du dernier avis valide par tag1 : les 78 avis se réduisent à 1 triplet) ; rejets détaillés : [{'raison': 'controleur_agentWallet', 'client': '0x449854134593bcb92c1244cfb382b5ab6254eead', 'agent': 8317, 'avis': 1}]

## (d) La chaîne honnête 0x0730… / 0xf7d5… → #18 → {#2, #3, #4}
- 0xea0b21fb est owner **et agentWallet** de [18, 22, 23] ⇒ wallet ambigu ⇒ nœud-adresse sous D16.

**D16 strict (nœud-adresse, sans masse), α = 1/4** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.1875 | 0.1875 | 0.1875 | 0.09375 | 0 |
| #2 | absent | absent | 0 | 0 | 0 |
| #3 | absent | absent | 0 | 0 | 0 |
| #4 | absent | absent | 0 | 0 | 0 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 3 nœuds listés, 2 arêtes fournies, |T| = 0, r = [3, 3] wei, e = [12, 12] wei, e_eff = 12 wei, α = 1/4.

**D16 strict (nœud-adresse, sans masse), α = 1/3** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.222222 | 0.222222 | 0.222222 | 0.111111 | 0 |
| #2 | absent | absent | 0 | 0 | 0 |
| #3 | absent | absent | 0 | 0 | 0 |
| #4 | absent | absent | 0 | 0 | 0 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 3 nœuds listés, 2 arêtes fournies, |T| = 0, r = [3, 3] wei, e = [9, 9] wei, e_eff = 10 wei, α = 1/3.

**D16 strict (nœud-adresse, sans masse), α = 1/2** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.25 | 0.25 | 0.25 | 0.125 | 0 |
| #2 | absent | absent | 0 | 0 | 0 |
| #3 | absent | absent | 0 | 0 | 0 |
| #4 | absent | absent | 0 | 0 | 0 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 3 nœuds listés, 2 arêtes fournies, |T| = 0, r = [3, 3] wei, e = [6, 6] wei, e_eff = 6 wei, α = 1/2.

**variante « relais » (chaque agent au wallet ambigu → nœud-adresse, poids 1) — PAS une décision du CR, α = 1/4** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.1875 | 0.1875 | 0.1875 | 0.09375 | 0 |
| #2 | 0.0527344 | 0.0527344 | 0.0527344 | 0.0263672 | 0 |
| #3 | 0.0527344 | 0.0527344 | 0.0527344 | 0.0263672 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.105469 |
| addr:0xea0b21fb | 0.140625 | 0.140625 | 0.140625 | 0.0703125 | 0 |

Certificat : 7 nœuds listés, 6 arêtes fournies, |T| = 0, r = [6, 6] wei, e = [24, 24] wei, e_eff = 24 wei, α = 1/4.

**variante « relais » (chaque agent au wallet ambigu → nœud-adresse, poids 1) — PAS une décision du CR, α = 1/3** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.222222 | 0.222222 | 0.222222 | 0.111111 | 0 |
| #2 | 0.0493827 | 0.0493827 | 0.0493827 | 0.0246914 | 0 |
| #3 | 0.0493827 | 0.0493827 | 0.0493827 | 0.0246914 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.0987654 |
| addr:0xea0b21fb | 0.148148 | 0.148148 | 0.148148 | 0.0740741 | 0 |

Certificat : 7 nœuds listés, 6 arêtes fournies, |T| = 0, r = [6, 6] wei, e = [18, 18] wei, e_eff = 18 wei, α = 1/3.

**variante « relais » (chaque agent au wallet ambigu → nœud-adresse, poids 1) — PAS une décision du CR, α = 1/2** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.25 | 0.25 | 0.25 | 0.125 | 0 |
| #2 | 0.03125 | 0.03125 | 0.03125 | 0.015625 | 0 |
| #3 | 0.03125 | 0.03125 | 0.03125 | 0.015625 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.0625 |
| addr:0xea0b21fb | 0.125 | 0.125 | 0.125 | 0.0625 | 0 |

Certificat : 7 nœuds listés, 6 arêtes fournies, |T| = 0, r = [6, 6] wei, e = [12, 12] wei, e_eff = 12 wei, α = 1/2.

## (e) 0xea0b… → #4 : `slash −100` (index 1) puis `review +1` (index 2)
- avis du couple : [(1, 'slash', -100), (2, 'review', 1)]
- règle du tour 2 (dernier avis du couple) : arête(s) 0xea0b→#4 = [('addr', 10000, 'review', 2), ('anchor', 10000, 'review', 2)]
  - ancres {0x07305360, 0xf7d5543d} : #4 → t = 0, trustRobust = 0, distrust = 0
  - ancres {0xea0b, 0x07305360} : #4 → t = ['0', '0.0740741'], trustRobust = 0, distrust = 0
- D14 (dernier par tag1 + dominance du négatif) : arête(s) 0xea0b→#4 = [('addr', -10000, 'slash', 1), ('anchor', -10000, 'slash', 1)]
  - ancres {0x07305360, 0xf7d5543d} : #4 → t = 0, trustRobust = 0, distrust = 0
  - ancres {0xea0b, 0x07305360} : #4 → t = ['0', '0'], trustRobust = 0, distrust = 0.111111

## Mesures annexes (angles morts)
- triplets (client, agent, tag1) où « dernier valide » ≠ « dernier puis rejet » (schéma stress) : **0** sur 7803.
- triplets (client, agent, tag1) où « dernier valide » ≠ « dernier puis rejet » (schéma référence) : **0** sur 7803.
- couples (client, agent) où le client a été agentWallet de la cible mais n'est plus contrôleur : **0** (D16 ne rejette que les anciens owners).
- rejets « ancien owner » (D16) sous le filtre execution-market-8 : **9 couples**, noteurs {'0x10304054': 9}, cibles [10153, 10168, 10169, 10180, 10181, 10182, 10183, 10219, 10221] : la plateforme a minté ces agents puis les a transférés à ses exécutants, et les note ensuite.
- couples avec > 32 avis : **5** ; parmi eux, couples où au moins un tag1 a son dernier avis HORS de la fenêtre MAX_SCAN = 32 du veto on-chain de R5 : **1** (noteur, agent, avis, tags, tags hors fenêtre) = [('0x443cbff0', 4, 73, 26, 14)].
- wallets partagés (≥ 2 agents) : 178 ; noteurs dont le wallet est partagé : 3 (91 avis) ; noteurs sans agent : 19.

### Support mainnet en fonction de α (ancres 0x0730/0xf7d5, filtre reference)
- D16, α = 1/4 : support (t > 0) = 3 nœuds, arêtes fournies = 2, e = [12, 12] wei
- D16, α = 1/3 : support (t > 0) = 3 nœuds, arêtes fournies = 2, e = [9, 9] wei
- D16, α = 1/2 : support (t > 0) = 3 nœuds, arêtes fournies = 2, e = [6, 6] wei
- relais, α = 1/4 : support (t > 0) = 6 nœuds, arêtes fournies = 6, e = [24, 24] wei
- relais, α = 1/3 : support (t > 0) = 6 nœuds, arêtes fournies = 6, e = [18, 18] wei
- relais, α = 1/2 : support (t > 0) = 6 nœuds, arêtes fournies = 6, e = [12, 12] wei

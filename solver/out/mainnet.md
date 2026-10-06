# ANCRE — acte 1 sur le mainnet (9 283 avis, règles D20 et D44)

Commande : `cd solver && .venv/bin/python run_mainnet.py`. Données : snapshot versionné `data/` (9283 avis relus on-chain, identité au bloc 108835675, 10262 agents, 178 wallets partagés, 71 agents à agentWallet nul, 32 opérateurs actifs, 0 getApproved non nuls). α = 1/3, m = 2, λ uniformes. Certificat par itération entière depuis 0 (D26). Tous les chiffres ci-dessous sont MESURÉS par ce script.

Contrôle 8004scan (snapshot du 21/09, 9188 avis) : 9188 clés communes ; **24 avis où 8004scan diffère (valeur/décimales)** : {('uptime', 0, 2): 20, ('fast', 0, 2): 2, ('helpful', 0, 2): 2} (tag1, décimales 8004scan, décimales on-chain).

## 0. Ce qui survit au schéma de référence (registre entier)
- D20, filtre `core` (3 tags) : **5 arêtes** (couples), lignes portées {'agent': 1, 'addr': 2}, arêtes portées par des nœuds-agents : 3 ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9277, 'aretes_couple': 5, 'ligne_wallet': 1, 'emetteur_adresse': 2}
- D20, filtre `reference` (8 tags) : **11 arêtes** (couples), lignes portées {'agent': 1, 'addr': 3}, arêtes portées par des nœuds-agents : 3 ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9236, 'aretes_couple': 11, 'emetteur_agents_non_notes': 3, 'ligne_wallet': 1, 'emetteur_adresse': 3}
- D20, filtre `execution-market-8` (8 tags) : **10 arêtes** (couples), lignes portées {}, arêtes portées par des nœuds-agents : 0 ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9199, 'aretes_couple': 10, 'emetteur_agents_non_notes': 1, 'emetteur_adresse': 0}
- D20 + D44 (repli owner), filtre `core` (3 tags) : **5 arêtes** (couples), lignes portées {'agent': 1, 'addr': 2}, arêtes portées par des nœuds-agents : 3 ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9277, 'aretes_couple': 5, 'ligne_wallet': 1, 'emetteur_adresse': 2}
- D20 + D44 (repli owner), filtre `reference` (8 tags) : **11 arêtes** (couples), lignes portées {'agent': 1, 'addr': 3}, arêtes portées par des nœuds-agents : 3 ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9236, 'aretes_couple': 11, 'emetteur_agents_non_notes': 3, 'ligne_wallet': 1, 'emetteur_adresse': 3}
- D20 + D44 (repli owner), filtre `execution-market-8` (8 tags) : **10 arêtes** (couples), lignes portées {}, arêtes portées par des nœuds-agents : 0 ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9199, 'aretes_couple': 10, 'emetteur_agents_non_notes': 1, 'emetteur_adresse': 0}
- tags endorsement du schéma : 15 (TAGS_MAX = 16, D24).

## (a) Eve-8004 (#182) : moyenne naïve contre ANCRE
- getSummary(#182, tous les clients, '', '') : 7665 avis, moyenne = **1.5264e+36** (dont 117 valeurs à 1e38).
- Région ferme S = #182 ∪ agents dont l'owner ou le wallet a noté #182 : **7666 agents**.
- D20, ancres {0x07305360, 0xf7d5543d}, schéma référence : arêtes (couples) = 5, masse sur S = ['0', '0'], t(#182) = absent du support, e = [15, 15] wei, nœuds certifiés = 6.
- D20, ancres {0x07305360, 0xf7d5543d}, schéma stress (tout tag = endorsement [-100,0,100]) : arêtes (couples) = 7587, masse sur S = ['0', '0'], t(#182) = absent du support, e = [15, 15] wei, nœuds certifiés = 6.
- D20 + D44 (repli owner), ancres {0x07305360, 0xf7d5543d}, schéma référence : arêtes (couples) = 5, masse sur S = ['0', '0'], t(#182) = absent du support, e = [15, 15] wei, nœuds certifiés = 6.
- D20 + D44 (repli owner), ancres {0x07305360, 0xf7d5543d}, schéma stress (tout tag = endorsement [-100,0,100]) : arêtes (couples) = 7587, masse sur S = ['0', '0'], t(#182) = absent du support, e = [15, 15] wei, nœuds certifiés = 6.
- contrôle (le lecteur choisit 2 wallets de la ferme comme ancres, schéma stress) : t(#182) = ['0', '0.222222'], trustRobust = 0. ANCRE est relatif aux ancres : il ne protège pas un lecteur qui ancre dans la ferme.

## (b) Ancre = scanner 0xa06f907f : fuite vers la ferme, avec et sans D15 (règles D20)
- le scanner a posté 32 avis sur 28 agents (tags {'liveness': 8, 'trust': 24}) ; 30 avis visent la région S.
- ancres {scanner}, sans D15 (trust, liveness, eve propagent) : masse sur S par colonne = ['0.345622'] ; t(#182) = ['0.138249'] ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 : 0 ; itérations depuis 0 = 4.
- ancres {scanner}, avec D15 (schéma de référence) : masse sur S par colonne = ['0'] ; t(#182) = 0 ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 : 0 ; itérations depuis 0 = 2.
- ancres {scanner, 0x07305360}, sans D15 (trust, liveness, eve propagent) : masse sur S par colonne = ['0', '0.345622'] ; t(#182) = ['0', '0.138249'] ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 : 0 ; itérations depuis 0 = 4.
- ancres {scanner, 0x07305360}, avec D15 (schéma de référence) : masse sur S par colonne = ['0', '0'] ; t(#182) = 0 ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 : 0 ; itérations depuis 0 = 4.
- ancres {scanner, scanner 0xc71a15fc}, sans D15 (trust, liveness, eve propagent) : masse sur S par colonne = ['0.345622', '0.37037'] ; t(#182) = ['0.138249', '0.148148'] ; max trustRobust(m=2) sur S = 0.0691244 ; agents de S au-dessus de θ = 1e-3 : 1 ; itérations depuis 0 = 4.
- ancres {scanner, scanner 0xc71a15fc}, avec D15 (schéma de référence) : masse sur S par colonne = ['0', '0'] ; t(#182) = 0 ; max trustRobust(m=2) sur S = 0 ; agents de S au-dessus de θ = 1e-3 : 0 ; itérations depuis 0 = 2.
- Borne théorique de la fuite, colonne scanner seul, sans D15 : π(S) ≤ ((1−α)/α)·Σ_{u∉S} π(u)·C(u,S) = **0.6221** ; masse mesurée sur S = **0.345622** (C(ancre,S) = 0.9332).

## (c) #8317 : les 78 auto-notations sont-elles rejetées ?
- avis reçus par #8317 : 78, noteurs {'0x44985413': 78} ; owner = 0x656df648, agentWallet = 0x44985413.
- schéma référence (trade_execution = measurement) : arêtes vers #8317 = **0** ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9205, 'rejet_measurement_D15': 78, 'aretes_couple': 0, 'emetteur_adresse': 0} ; rejets R6 : []
- schéma stress (trade_execution = endorsement) : arêtes vers #8317 = **1** ; compteurs {'avis_lus': 9283, 'hors_filtre_ou_schema': 9205, 'negatif_controleur_garde_agentWallet': 1, 'aretes_couple': 1, 'boucle_ignoree': 1, 'ligne_wallet': 1, 'emetteur_adresse': 0} ; rejets R6 : []

## (d) La chaîne honnête 0x0730… / 0xf7d5… → #18 → {#2, #3, #4}
- 0xea0b21fb est owner **et agentWallet** de [18, 22, 23]. Sous D20, chacun de ces agents qui est noté porte une copie de la ligne de 0xea0b, avec sa propre masse.

**D20, α = 1/4** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.1875 | 0.1875 | 0.1875 | 0.09375 | 0 |
| #22 | absent | absent | 0 | 0 | 0 |
| #23 | absent | absent | 0 | 0 | 0 |
| #2 | 0.0703125 | 0.0703125 | 0.0703125 | 0.0351562 | 0 |
| #3 | 0.0703125 | 0.0703125 | 0.0703125 | 0.0351562 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.140625 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 6 nœuds listés, 5 arêtes fournies, |T| = 0, r = [5, 5] wei, e = [20, 20] wei (borne haute, méfiance), e_eff = 20 wei, α = 1/4.
Itérations depuis 0 jusqu'au point fixe entier : 4.

**D20, α = 1/3** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.222222 | 0.222222 | 0.222222 | 0.111111 | 0 |
| #22 | absent | absent | 0 | 0 | 0 |
| #23 | absent | absent | 0 | 0 | 0 |
| #2 | 0.0740741 | 0.0740741 | 0.0740741 | 0.037037 | 0 |
| #3 | 0.0740741 | 0.0740741 | 0.0740741 | 0.037037 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.148148 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 6 nœuds listés, 5 arêtes fournies, |T| = 0, r = [5, 5] wei, e = [15, 15] wei (borne haute, méfiance), e_eff = 16 wei, α = 1/3.
Itérations depuis 0 jusqu'au point fixe entier : 4.

**D20, α = 1/2** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.25 | 0.25 | 0.25 | 0.125 | 0 |
| #22 | absent | absent | 0 | 0 | 0 |
| #23 | absent | absent | 0 | 0 | 0 |
| #2 | 0.0625 | 0.0625 | 0.0625 | 0.03125 | 0 |
| #3 | 0.0625 | 0.0625 | 0.0625 | 0.03125 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.125 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 6 nœuds listés, 5 arêtes fournies, |T| = 0, r = [5, 5] wei, e = [10, 10] wei (borne haute, méfiance), e_eff = 10 wei, α = 1/2.
Itérations depuis 0 jusqu'au point fixe entier : 4.

**D20 + D44 (repli owner), α = 1/4** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.1875 | 0.1875 | 0.1875 | 0.09375 | 0 |
| #22 | absent | absent | 0 | 0 | 0 |
| #23 | absent | absent | 0 | 0 | 0 |
| #2 | 0.0703125 | 0.0703125 | 0.0703125 | 0.0351562 | 0 |
| #3 | 0.0703125 | 0.0703125 | 0.0703125 | 0.0351562 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.140625 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 6 nœuds listés, 5 arêtes fournies, |T| = 0, r = [5, 5] wei, e = [20, 20] wei (borne haute, méfiance), e_eff = 20 wei, α = 1/4.
Itérations depuis 0 jusqu'au point fixe entier : 4.

**D20 + D44 (repli owner), α = 1/3** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.222222 | 0.222222 | 0.222222 | 0.111111 | 0 |
| #22 | absent | absent | 0 | 0 | 0 |
| #23 | absent | absent | 0 | 0 | 0 |
| #2 | 0.0740741 | 0.0740741 | 0.0740741 | 0.037037 | 0 |
| #3 | 0.0740741 | 0.0740741 | 0.0740741 | 0.037037 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.148148 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 6 nœuds listés, 5 arêtes fournies, |T| = 0, r = [5, 5] wei, e = [15, 15] wei (borne haute, méfiance), e_eff = 16 wei, α = 1/3.
Itérations depuis 0 jusqu'au point fixe entier : 4.

**D20 + D44 (repli owner), α = 1/2** (filtre core, ancres 0x07305360 et 0xf7d5543d)

| nœud | t^(0x0730) | t^(0xf7d5) | Σλt | trustRobust (m=2) | distrust |
|---|---|---|---|---|---|
| #18 | 0.25 | 0.25 | 0.25 | 0.125 | 0 |
| #22 | absent | absent | 0 | 0 | 0 |
| #23 | absent | absent | 0 | 0 | 0 |
| #2 | 0.0625 | 0.0625 | 0.0625 | 0.03125 | 0 |
| #3 | 0.0625 | 0.0625 | 0.0625 | 0.03125 | 0 |
| #4 | 0 | 0 | 0 | 0 | 0.125 |
| addr:0xea0b21fb | absent | absent | 0 | 0 | 0 |

Certificat : 6 nœuds listés, 5 arêtes fournies, |T| = 0, r = [5, 5] wei, e = [10, 10] wei (borne haute, méfiance), e_eff = 10 wei, α = 1/2.
Itérations depuis 0 jusqu'au point fixe entier : 4.

## (e) 0xea0b… → #4 : `slash −100` (index 1) puis `review +1` (index 2)
- avis du couple : [(1, 'slash', -100), (2, 'review', 1)]
- règle du tour 2 (dernier avis du couple) : arête 0xea0b→#4 = (10000, 'review', 2)
  - ancres {0x07305360, 0xf7d5543d} : #4 → t = ['0.0493827', '0.0493827'], trustRobust = 0.0246914, distrust = 0
  - ancres {0xea0b, 0x07305360} : #4 → t = ['0', '0.0740741'], trustRobust = 0, distrust = 0
- D14 (dernier par tag1 + dominance du négatif) : arête 0xea0b→#4 = (-10000, 'slash', 1)
  - ancres {0x07305360, 0xf7d5543d} : #4 → t = ['0', '0'], trustRobust = 0, distrust = 0.148148
  - ancres {0xea0b, 0x07305360} : #4 → t = ['0', '0'], trustRobust = 0, distrust = 0.111111

## (f) Repli owner (D44) sur le graphe d'execution.market
- schéma étendu (hypothèse de mesure, NON normatif) : les 11 tag1 execution.market en endorsement [0, 50, 100] ; filtre des 8 tags de la mesure du tour 6 (`nv/impact.py`).
- sous D44, **48 couples sur 49 ont un agent émetteur** (le « 48 » du tour 6) ; 37 sont portés par un agent noté. Les 11 autres partent d'agents que personne ne note : masse nulle, donc aucune ligne à certifier (D20).
- D20, ancres honnêtes {0x0730, 0xf7d5} : couples = 49, arêtes portées par des nœuds-agents = **0** (lignes via owner : 0), agents t > 0 = 0, masse sur le cluster EM (19 agents) = ['0', '0'], itérations = 2.
- D20, ancres 2 noteurs EM {0x3aebb73a, 0xaf95b213} : couples = 49, arêtes portées par des nœuds-agents = **0** (lignes via owner : 0), agents t > 0 = 8, masse sur le cluster EM (19 agents) = ['0.222222', '0.222222'], itérations = 3.
- D20 + D44 (repli owner), ancres honnêtes {0x0730, 0xf7d5} : couples = 49, arêtes portées par des nœuds-agents = **37** (lignes via owner : 12), agents t > 0 = 0, masse sur le cluster EM (19 agents) = ['0', '0'], itérations = 2.
- D20 + D44 (repli owner), ancres 2 noteurs EM {0x3aebb73a, 0xaf95b213} : couples = 49, arêtes portées par des nœuds-agents = **25** (lignes via owner : 10), agents t > 0 = 11, masse sur le cluster EM (19 agents) = ['0.479437', '0.445518'], itérations = 78.

## Mesures annexes
- triplets (client, agent, tag1) où « dernier valide » ≠ « dernier puis rejet » (schéma stress) : **0** sur 7871.
- triplets (client, agent, tag1) où « dernier valide » ≠ « dernier puis rejet » (schéma référence) : **0** sur 7822.
- couples retenus qu'aurait rejetés l'ancienne règle « ancien owner » (supprimée, D20), filtre execution-market-8 : **9**, noteurs {'0x10304054': 9}.
- couples (client, agent) où le client a été agentWallet de la cible mais n'est plus contrôleur : **10**.
- couples avec > 32 avis : **5** (sans objet depuis D21 : MAX_SCAN supprimé).
- agents sur un wallet partagé : 1773 ; noteurs dont le wallet est partagé : 3 (91 avis) ; noteurs sans agent (wallet) : 38.

### Support mainnet en fonction de α (ancres 0x0730/0xf7d5, filtre reference)
- D20, α = 1/4 : support (t > 0) = 5 nœuds, arêtes fournies = 5, e = [20, 20] wei, itérations = 4
- D20, α = 1/3 : support (t > 0) = 5 nœuds, arêtes fournies = 5, e = [15, 15] wei, itérations = 4
- D20, α = 1/2 : support (t > 0) = 5 nœuds, arêtes fournies = 5, e = [10, 10] wei, itérations = 4
- D20 + D44 (repli owner), α = 1/4 : support (t > 0) = 5 nœuds, arêtes fournies = 5, e = [20, 20] wei, itérations = 4
- D20 + D44 (repli owner), α = 1/3 : support (t > 0) = 5 nœuds, arêtes fournies = 5, e = [15, 15] wei, itérations = 4
- D20 + D44 (repli owner), α = 1/2 : support (t > 0) = 5 nœuds, arêtes fournies = 5, e = [10, 10] wei, itérations = 4

"""ANCRE — acte 1 de la démo (D19) sur le mainnet : 9 283 avis, état au bloc 108 835 675 (règles D20, D44).

Usage :
  .venv/bin/python run_mainnet.py            # écrit out/mainnet.md et l'affiche
  .venv/bin/python run_mainnet.py --tags     # inventaire des tag1 et couverture du schéma de référence

Entrées :
  data/mainnet-108835675.{feedbacks,identity}.json.gz  snapshot versionné, relu on-chain (provenance : snapshot.py)
  FB  snapshot 8004scan du 21/09 (vault, lecture seule), seulement pour mesurer ses erreurs de décimales (AM-R4.2)
"""
from __future__ import annotations

import io
import json
import os
import sys
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

import numpy as np

from graph import (ADDR, AGENT, ANCHOR, WAD, ZERO, build_graph, load_feedbacks, load_feedbacks_onchain,
                   load_identity_json, load_schema, quantize, TagSpec, dec_to_wad)
from ppr import certify, contributions, trust_robust, distrust, e_eff, solve_float, leak_bound

HERE = Path(__file__).parent
VAULT = Path("/Users/hugo/Projet/dataBlockchain/2 - EVM/Monad (L1)/Hackathons/_data-metropolis")
SCR = Path(os.environ.get("ANCRE_SCRATCH", "/private/tmp/claude-501/-Users-hugo-Projet-ancre/"
                                         "d7aaa033-3225-48a1-9564-a90ffb1f1a63/scratchpad"))
FB = VAULT / "fb.json"
BLOCK = 108_835_675
FB_ONCHAIN = HERE / "data" / f"mainnet-{BLOCK}.feedbacks.json.gz"
IDENTITY = HERE / "data" / f"mainnet-{BLOCK}.identity.json.gz"


def load_mainnet():
    """(feedbacks, identity) du snapshot versionné : 9 283 avis, identité au bloc 108 835 675."""
    return load_feedbacks_onchain(FB_ONCHAIN), load_identity_json(IDENTITY)

SCANNER = "0xa06f907f"          # préfixes, résolus en adresses complètes plus bas
SCANNER2 = "0xc71a15fc"
HONEST1, HONEST2 = "0x07305360", "0xf7d5543d"
EA0B = "0xea0b21fb"
EVE = 182
ALPHA = Fraction(1, 3)          # D2

out = io.StringIO()


def P(*a):
    print(*a, file=out)


def fmt(x: int) -> str:
    """uint WAD -> fraction décimale lisible."""
    if x == 0:
        return "0"
    return f"{x / WAD:.6g}"


def resolve(prefix: str, fbs) -> str:
    s = {f.client for f in fbs if f.client.startswith(prefix)}
    assert len(s) == 1, (prefix, s)
    return s.pop()


def schema_variant(ref: dict, mode: str) -> dict[str, TagSpec]:
    if mode == "ref":
        return ref
    if mode == "pre_d15":      # même bornes, mais tout propage (simulation de l'absence de D15)
        return {t: TagSpec(s.min_wad, s.neutral_wad, s.max_wad, "endorsement") for t, s in ref.items()}
    raise ValueError(mode)


def stress_schema(fbs) -> dict[str, TagSpec]:
    """Schéma adversarial : chaque tag1 observé est un endorsement [-100, 0, 100]. Sert à montrer que la
    résistance Sybil vient des ancres et non du schéma. Ce n'est PAS une recommandation."""
    tags = {f.tag1 for f in fbs if f.tag1}
    return {t: TagSpec(dec_to_wad(-100), 0, dec_to_wad(100), "endorsement") for t in tags}


def run(fbs, idn, schema, filt, anchors, alpha=ALPHA, **kw):
    g = build_graph(fbs, idn, schema, filt, anchors, **kw)
    cert = certify(g, alpha)
    inv = {gi: ci for ci, gi in enumerate(cert.node_map)}
    return g, cert, inv


def node_report(g, cert, inv, keys, m=2):
    rows = []
    for key in keys:
        gi = g.index.get(key)
        if gi is None or gi not in inv:
            rows.append((key, None))
            continue
        ci = inv[gi]
        c = contributions(cert, ci)
        rows.append((key, {"t": [cert.t[a][ci] for a in range(cert.k)], "robust": trust_robust(c, m),
                           "sum": sum(c), "d": distrust(cert, ci)}))
    return rows


def print_nodes(g, cert, inv, keys, m=2):
    anchors_lbl = [str(g.nodes[s][1])[:6] for s in g.anchors]
    P(f"| nœud | " + " | ".join(f"t^({l})" for l in anchors_lbl) + " | Σλt | trustRobust (m=2) | distrust |")
    P("|---|" + "---|" * (len(anchors_lbl) + 3))
    for key, r in node_report(g, cert, inv, keys, m):
        name = f"#{key[1]}" if key[0] == AGENT else f"{key[0]}:{str(key[1])[:10]}"
        if r is None:
            P(f"| {name} | " + " | ".join("absent" for _ in anchors_lbl) + " | 0 | 0 | 0 |")
        else:
            P(f"| {name} | " + " | ".join(fmt(x) for x in r["t"]) + f" | {fmt(r['sum'])} | {fmt(r['robust'])} | {fmt(r['d'])} |")
    P(f"\nCertificat : {cert.n} nœuds listés, {sum(len(r) for r in cert.rows.values())} arêtes fournies, "
      f"|T| = {len(cert.truncated)}, r = {cert.r} wei, e = {cert.e} wei (borne haute, méfiance), "
      f"e_eff = {e_eff(cert)} wei, α = {cert.alphaN}/{cert.alphaD}.")


def mass_in(g, cert, inv, region: set[int]) -> list[int]:
    """Masse t^(a) totale sur une région (ensemble d'agentIds), par colonne."""
    tot = [0] * cert.k
    for a_id in region:
        gi = g.index.get((AGENT, a_id))
        if gi is not None and gi in inv:
            for a in range(cert.k):
                tot[a] += cert.t[a][inv[gi]]
    return tot


def tags_inventory(fbs, ref):
    by = defaultdict(list)
    for f in fbs:
        by[f.tag1].append(f)
    P("| tag1 | avis | noteurs | agents | kind (réf.) | dans les bornes |")
    P("|---|---|---|---|---|---|")
    missing = []
    for t, l in sorted(by.items(), key=lambda x: -len(x[1])):
        spec = ref.get(t)
        if spec is None:
            missing.append(t)
        inb = sum(1 for f in l if spec and quantize(f.value, f.decimals, spec) is not None) if spec else 0
        P(f"| {t or '(vide)'} | {len(l)} | {len({f.client for f in l})} | {len({f.agent_id for f in l})} | "
          f"{spec.kind if spec else 'absent'} | {inb} |")
    P(f"\nTags présents absents du schéma : {missing}")


VARIANTS = (("D20", {}), ("D20 + D44 (repli owner)", {"owner_fallback": True}))


def main():
    fbs, idn = load_mainnet()
    snap = load_feedbacks(FB) if FB.exists() else []
    sk = {(f.agent_id, f.client, f.index): f for f in snap}
    dec_diff = [f for f in fbs if (f.agent_id, f.client, f.index) in sk and
                (sk[(f.agent_id, f.client, f.index)].decimals, sk[(f.agent_id, f.client, f.index)].value) != (f.decimals, f.value)]
    raw_ref = json.load(open(HERE / "schema_reference.json"))
    ref = load_schema(raw_ref)
    filters = raw_ref["filters"]
    if "--tags" in sys.argv:
        tags_inventory(fbs, ref)
        print(out.getvalue())
        return
    scanner, scanner2 = resolve(SCANNER, fbs), resolve(SCANNER2, fbs)
    h1, h2, ea0b = resolve(HONEST1, fbs), resolve(HONEST2, fbs), resolve(EA0B, fbs)
    w2a = idn.wallet_to_agents()

    P("# ANCRE — acte 1 sur le mainnet (9 283 avis, règles D20 et D44)")
    P(f"\nCommande : `cd solver && .venv/bin/python run_mainnet.py`. Données : snapshot versionné `data/` ({len(fbs)} avis "
      f"relus on-chain, identité au bloc {idn.block}, {len(idn.owner)} agents, "
      f"{sum(1 for v in w2a.values() if len(v) > 1)} wallets partagés, "
      f"{sum(1 for a in idn.owner if (idn.wallet.get(a, ZERO) or ZERO) == ZERO)} agents à agentWallet nul, "
      f"{sum(len(v) for v in idn.operators.values())} opérateurs actifs, {len(idn.approved)} getApproved non nuls). "
      "α = 1/3, m = 2, λ uniformes. Certificat par itération entière depuis 0 (D26). "
      "Tous les chiffres ci-dessous sont MESURÉS par ce script.")
    if snap:
        P(f"\nContrôle 8004scan (snapshot du 21/09, {len(snap)} avis) : "
          f"{len(set((f.agent_id, f.client, f.index) for f in fbs) & set(sk))} clés communes ; "
          f"**{len(dec_diff)} avis où 8004scan diffère (valeur/décimales)** : "
          f"{dict(Counter((f.tag1, sk[(f.agent_id, f.client, f.index)].decimals, f.decimals) for f in dec_diff))} "
          "(tag1, décimales 8004scan, décimales on-chain).")

    # ------------------------------------------------------------------ survie des arêtes
    P("\n## 0. Ce qui survit au schéma de référence (registre entier)")
    for vlbl, kw in VARIANTS:
        for fname in ("core", "reference", "execution-market-8"):
            g = build_graph(fbs, idn, ref, filters[fname], [], **kw)
            kinds = Counter(g.nodes[u][0] for u in g.rows)
            from_agents = sum(len(r) for u, r in g.rows.items() if g.nodes[u][0] == AGENT)
            P(f"- {vlbl}, filtre `{fname}` ({len(filters[fname])} tags) : **{len(g.pairs)} arêtes** (couples), "
              f"lignes portées {dict(kinds)}, arêtes portées par des nœuds-agents : {from_agents} ; compteurs {g.log}")
    all_endorse = [t for t, s in ref.items() if s.kind == "endorsement"]
    P(f"- tags endorsement du schéma : {len(all_endorse)} (TAGS_MAX = 16, D24).")

    # ------------------------------------------------------------------ (a) Eve
    P("\n## (a) Eve-8004 (#182) : moyenne naïve contre ANCRE")
    eve_fb = [f for f in fbs if f.agent_id == EVE and not f.revoked]
    mean = sum(Fraction(f.value, 10 ** f.decimals) for f in eve_fb) / len(eve_fb)
    P(f"- getSummary(#182, tous les clients, '', '') : {len(eve_fb)} avis, moyenne = **{float(mean):.4e}** "
      f"(dont {sum(1 for f in eve_fb if f.value == 10**38)} valeurs à 1e38).")
    farm_clients = {f.client for f in eve_fb}
    farm = {EVE} | {a for c in farm_clients for a in w2a.get(c, [])} | \
           {a for a, o in idn.owner.items() if o in farm_clients}
    P(f"- Région ferme S = #182 ∪ agents dont l'owner ou le wallet a noté #182 : **{len(farm)} agents**.")
    stress = stress_schema(fbs)
    ffarm = ["eve", "plague", "vouch", "review", "slash", "trust", "liveness"]
    for vlbl, kw in VARIANTS:
        for lbl, sch in (("référence", ref), ("stress (tout tag = endorsement [-100,0,100])", stress)):
            g, cert, inv = run(fbs, idn, sch, ffarm, [h1, h2], **kw)
            m = mass_in(g, cert, inv, farm)
            eve = node_report(g, cert, inv, [(AGENT, EVE)])[0][1]
            P(f"- {vlbl}, ancres {{0x07305360, 0xf7d5543d}}, schéma {lbl} : arêtes (couples) = {len(g.pairs)}, "
              f"masse sur S = {[fmt(x) for x in m]}, t(#182) = {eve['t'] if eve else 'absent du support'}, "
              f"e = {cert.e} wei, nœuds certifiés = {cert.n}.")
    fc = sorted(c for c in farm_clients if len(w2a.get(c, [])) == 1)[:2]
    g, cert, inv = run(fbs, idn, stress, ffarm, fc)
    eve = node_report(g, cert, inv, [(AGENT, EVE)])[0][1]
    P(f"- contrôle (le lecteur choisit 2 wallets de la ferme comme ancres, schéma stress) : "
      f"t(#182) = {[fmt(x) for x in eve['t']]}, trustRobust = {fmt(eve['robust'])}. ANCRE est relatif aux ancres : "
      "il ne protège pas un lecteur qui ancre dans la ferme.")

    # ------------------------------------------------------------------ (b) scanner
    P("\n## (b) Ancre = scanner 0xa06f907f : fuite vers la ferme, avec et sans D15 (règles D20)")
    sc_fb = [f for f in fbs if f.client == scanner]
    sc_t = Counter(f.agent_id in farm for f in sc_fb)
    P(f"- le scanner a posté {len(sc_fb)} avis sur {len({f.agent_id for f in sc_fb})} agents "
      f"(tags {dict(Counter(f.tag1 for f in sc_fb))}) ; {sc_t[True]} avis visent la région S.")
    fb_filter = ["trust", "liveness", "eve", "plague", "vouch", "review", "slash"]
    cases = [("sans D15 (trust, liveness, eve propagent)", schema_variant(ref, "pre_d15")),
             ("avec D15 (schéma de référence)", ref)]
    for anc_lbl, anc in (("{scanner}", [scanner]), ("{scanner, 0x07305360}", [scanner, h1]),
                         ("{scanner, scanner 0xc71a15fc}", [scanner, scanner2])):
        for lbl, sch in cases:
            g, cert, inv = run(fbs, idn, sch, fb_filter, anc)
            m = mass_in(g, cert, inv, farm)
            eve = node_report(g, cert, inv, [(AGENT, EVE)])[0][1]
            robs = [r["robust"] for _, r in node_report(g, cert, inv, [(AGENT, a) for a in farm]) if r]
            npass = sum(1 for x in robs if x >= WAD // 1000)
            P(f"- ancres {anc_lbl}, {lbl} : masse sur S par colonne = {[fmt(x) for x in m]} ; "
              f"t(#182) = {[fmt(x) for x in eve['t']] if eve else 0} ; max trustRobust(m=2) sur S = "
              f"{fmt(max(robs) if robs else 0)} ; agents de S au-dessus de θ = 1e-3 : {npass} ; "
              f"itérations depuis 0 = {cert.iterations}.")
    g, cert, inv = run(fbs, idn, schema_variant(ref, "pre_d15"), fb_filter, [scanner])
    S_idx = {g.index[(AGENT, a)] for a in farm if (AGENT, a) in g.index}
    tcol = [0] * g.n
    for ci, gi in enumerate(cert.node_map):
        tcol[gi] = cert.t[0][ci]
    bound = leak_bound(g, ALPHA, tcol, S_idx)
    s = g.anchors[0]
    cS = sum(e.q for e in g.rows.get(s, []) if e.q > 0 and e.agent_id in farm) / g.bplus(s)
    m = mass_in(g, cert, inv, farm)[0]
    P(f"- Borne théorique de la fuite, colonne scanner seul, sans D15 : π(S) ≤ ((1−α)/α)·Σ_{{u∉S}} π(u)·C(u,S) = "
      f"**{bound / WAD:.4f}** ; masse mesurée sur S = **{fmt(m)}** (C(ancre,S) = {cS:.4f}).")

    # ------------------------------------------------------------------ (c) #8317
    P("\n## (c) #8317 : les 78 auto-notations sont-elles rejetées ?")
    a8317 = [f for f in fbs if f.agent_id == 8317]
    cl = Counter(f.client for f in a8317)
    P(f"- avis reçus par #8317 : {len(a8317)}, noteurs {dict((k[:10], v) for k, v in cl.items())} ; "
      f"owner = {idn.owner[8317][:10]}, agentWallet = {idn.wallet[8317][:10]}.")
    for lbl, sch in (("référence (trade_execution = measurement)", ref), ("stress (trade_execution = endorsement)", stress)):
        g = build_graph(fbs, idn, sch, ["trade_execution"], [])
        rej = [r for r in g.rejected if r.get("agent") == 8317 and r["raison"].startswith("controleur")]
        P(f"- schéma {lbl} : arêtes vers #8317 = **{sum(1 for p in g.pairs.values() if p.agent_id == 8317)}** ; "
          f"compteurs {g.log} ; rejets R6 : {rej}")

    # ------------------------------------------------------------------ (d) chaîne honnête
    P("\n## (d) La chaîne honnête 0x0730… / 0xf7d5… → #18 → {#2, #3, #4}")
    P(f"- 0xea0b21fb est owner **et agentWallet** de {w2a.get(ea0b)}. Sous D20, chacun de ces agents qui est noté "
      "porte une copie de la ligne de 0xea0b, avec sa propre masse.")
    keys = [(AGENT, 18), (AGENT, 22), (AGENT, 23), (AGENT, 2), (AGENT, 3), (AGENT, 4), (ADDR, ea0b)]
    for vlbl, kw in VARIANTS:
        for alpha in (Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)):
            g, cert, inv = run(fbs, idn, ref, filters["core"], [h1, h2], alpha=alpha, **kw)
            P(f"\n**{vlbl}, α = {alpha}** (filtre core, ancres 0x07305360 et 0xf7d5543d)\n")
            print_nodes(g, cert, inv, keys)
            P(f"Itérations depuis 0 jusqu'au point fixe entier : {cert.iterations}.")

    # ------------------------------------------------------------------ (e) slash sous D14
    P("\n## (e) 0xea0b… → #4 : `slash −100` (index 1) puis `review +1` (index 2)")
    fs = sorted((f for f in fbs if f.client == ea0b and f.agent_id == 4), key=lambda f: f.index)
    P(f"- avis du couple : {[(f.index, f.tag1, f.value) for f in fs]}")
    for lbl, kw in (("règle du tour 2 (dernier avis du couple)", {"combine": "latest_pair"}),
                    ("D14 (dernier par tag1 + dominance du négatif)", {})):
        g = build_graph(fbs, idn, ref, filters["core"], [ea0b, h1], **kw)
        pe = g.pairs.get((ea0b, 4))
        P(f"- {lbl} : arête 0xea0b→#4 = {(pe.q, pe.tag1, pe.feedback_index) if pe else None}")
        for anc_lbl, anc in (("{0x07305360, 0xf7d5543d}", [h1, h2]), ("{0xea0b, 0x07305360}", [ea0b, h1])):
            g, cert, inv = run(fbs, idn, ref, filters["core"], anc, **kw)
            r = node_report(g, cert, inv, [(AGENT, 4)])[0][1]
            P(f"  - ancres {anc_lbl} : #4 → t = {[fmt(x) for x in r['t']] if r else 0}, trustRobust = "
              f"{fmt(r['robust']) if r else 0}, distrust = {fmt(r['d']) if r else 0}")

    # ------------------------------------------------------------------ (f) D44
    P("\n## (f) Repli owner (D44) sur le graphe d'execution.market")
    em_new = [f for f in fbs if f.tag1.split(":")[0] in ("executor_rating", "requester_rating", "buyer_rating",
                                                           "seller_rating")]
    em_tags = sorted({f.tag1 for f in em_new})
    ext = json.loads(json.dumps(raw_ref))
    for t in em_tags:
        ext["tags"].setdefault(t, {"min": "0", "neutral": "50", "max": "100", "kind": "endorsement"})
    ext_s = load_schema(ext)
    em_filter = [t for t in em_tags if t not in ("seller_rating:data_collection", "requester_rating:verification",
                                                  "executor_rating:verification")]
    P(f"- schéma étendu (hypothèse de mesure, NON normatif) : les {len(em_tags)} tag1 execution.market en endorsement "
      f"[0, 50, 100] ; filtre des {len(em_filter)} tags de la mesure du tour 6 (`nv/impact.py`).")
    g44 = build_graph(fbs, idn, ext_s, em_filter, [], owner_fallback=True)
    src_all = defaultdict(list)
    for a in idn.owner:
        s_, v_ = idn.source_of(a, True)
        if s_:
            src_all[s_].append(a)
    emit = [p for p in g44.pairs.values() if p.client in src_all]
    carried = [p for p in emit if any((AGENT, j) in g44.index for j in src_all[p.client])]
    P(f"- sous D44, **{len(emit)} couples sur {len(g44.pairs)} ont un agent émetteur** (le « 48 » du tour 6) ; "
      f"{len(carried)} sont portés par un agent noté. Les {len(emit) - len(carried)} autres partent d'agents que "
      "personne ne note : masse nulle, donc aucune ligne à certifier (D20).")
    em_clients = {f.client for f in em_new}
    cluster = {f.agent_id for f in em_new} | {a for a, o in idn.owner.items() if o in em_clients}
    a1, a2 = resolve("0x3aebb73a", fbs), resolve("0xaf95b213", fbs)
    for vlbl, kw in VARIANTS:
        for anc_lbl, anc in (("honnêtes {0x0730, 0xf7d5}", [h1, h2]), ("2 noteurs EM {0x3aebb73a, 0xaf95b213}", [a1, a2])):
            g, cert, inv = run(fbs, idn, ext_s, em_filter, anc, **kw)
            from_agents = sum(len(r) for u, r in g.rows.items() if g.nodes[u][0] == AGENT)
            m = mass_in(g, cert, inv, cluster)
            pos = sum(1 for gi, ci in inv.items() if g.nodes[gi][0] == AGENT and any(cert.t[a][ci] for a in range(cert.k)))
            P(f"- {vlbl}, ancres {anc_lbl} : couples = {len(g.pairs)}, arêtes portées par des nœuds-agents = "
              f"**{from_agents}** (lignes via owner : {g.log.get('ligne_owner', 0)}), agents t > 0 = {pos}, "
              f"masse sur le cluster EM ({len(cluster)} agents) = {[fmt(x) for x in m]}, itérations = {cert.iterations}.")

    # ------------------------------------------------------------------ angles morts mesurés
    P("\n## Mesures annexes")
    for lbl, sch in (("stress", stress), ("référence", ref)):
        diff = 0
        trip = defaultdict(list)
        for f in fbs:
            if f.tag1 in sch and not f.revoked:
                trip[(f.client, f.agent_id, f.tag1)].append(f)
        for k, l in trip.items():
            l.sort(key=lambda f: f.index)
            last = l[-1]
            valid = [f for f in l if quantize(f.value, f.decimals, sch[f.tag1]) is not None]
            if quantize(last.value, last.decimals, sch[last.tag1]) is None and valid:
                diff += 1
        P(f"- triplets (client, agent, tag1) où « dernier valide » ≠ « dernier puis rejet » (schéma {lbl}) : **{diff}** sur {len(trip)}.")
    g = build_graph(fbs, idn, ref, filters["execution-market-8"], [])
    po = [(c, a) for (c, a) in g.pairs if c in idn.past_owners.get(a, set())]
    P(f"- couples retenus qu'aurait rejetés l'ancienne règle « ancien owner » (supprimée, D20), filtre "
      f"execution-market-8 : **{len(po)}**, noteurs {dict(Counter(c[:10] for c, _ in po))}.")
    pairs_all = {(f.client, f.agent_id) for f in fbs}
    ctl_miss = sum(1 for c, a in pairs_all if c in idn.past_wallets.get(a, set()) and c not in idn.controllers(a))
    P(f"- couples (client, agent) où le client a été agentWallet de la cible mais n'est plus contrôleur : **{ctl_miss}**.")
    bypair = defaultdict(list)
    for f in fbs:
        bypair[(f.client, f.agent_id)].append(f)
    P(f"- couples avec > 32 avis : **{sum(1 for l in bypair.values() if len(l) > 32)}** (sans objet depuis D21 : "
      "MAX_SCAN supprimé).")
    amb = Counter(len(v) for v in w2a.values())
    raters_amb = {f.client for f in fbs if len(w2a.get(f.client, [])) > 1}
    P(f"- agents sur un wallet partagé : {sum(k * v for k, v in amb.items() if k > 1)} ; noteurs dont le wallet est "
      f"partagé : {len(raters_amb)} ({sum(1 for f in fbs if f.client in raters_amb)} avis) ; noteurs sans agent "
      f"(wallet) : {len({f.client for f in fbs if f.client not in w2a})}.")
    P("\n### Support mainnet en fonction de α (ancres 0x0730/0xf7d5, filtre reference)")
    for vlbl, kw in VARIANTS:
        for alpha in (Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)):
            g, cert, inv = run(fbs, idn, ref, filters["reference"], [h1, h2], alpha=alpha, **kw)
            sup = sum(1 for v in range(cert.n) if any(cert.t[a][v] > 0 for a in range(cert.k)))
            P(f"- {vlbl}, α = {alpha} : support (t > 0) = {sup} nœuds, arêtes fournies = "
              f"{sum(len(r) for r in cert.rows.values())}, e = {cert.e} wei, itérations = {cert.iterations}")
    os.makedirs(HERE / "out", exist_ok=True)
    (HERE / "out" / "mainnet.md").write_text(out.getvalue())
    print(out.getvalue())


if __name__ == "__main__":
    main()

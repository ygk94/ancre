"""ANCRE R4 — acte 1 de la démo (D19) rejoué sur le snapshot mainnet du 21/09/2026.

Usage :
  .venv/bin/python run_mainnet.py            # écrit out/mainnet.md et l'affiche
  .venv/bin/python run_mainnet.py --tags     # inventaire des tag1 et couverture du schéma de référence

Entrées (lecture seule) :
  FB     snapshot 8004scan du 21/09 (vault, _data-metropolis/fb.json)
  STATE  owner + agentWallet de chaque agent au bloc 108 434 518 (scratchpad, agents_state.json)
  LOGS   Transfer / ApprovalForAll / MetadataSet de l'IdentityRegistry (scratchpad, logs.json)
  APPR   getApproved(agentId) au bloc 108 434 518 pour les 84 agents notés (scratchpad, approved_r4.json)
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

from graph import (ADDR, AGENT, ANCHOR, WAD, build_graph, load_feedbacks, load_feedbacks_onchain, load_identity, load_schema,
                   quantize, TagSpec, dec_to_wad)
from ppr import certify, contributions, trust_robust, distrust, e_eff, solve_float, leak_bound

HERE = Path(__file__).parent
VAULT = Path("/Users/hugo/Projet/dataBlockchain/2 - EVM/Monad (L1)/Hackathons/_data-metropolis")
SCR = Path(os.environ.get("ANCRE_SCRATCH", "/private/tmp/claude-501/-Users-hugo-Projet-ancre/"
                                         "d7aaa033-3225-48a1-9564-a90ffb1f1a63/scratchpad"))
FB, STATE, LOGS, APPR = VAULT / "fb.json", SCR / "agents_state.json", SCR / "logs.json", SCR / "approved_r4.json"
FB_ONCHAIN = SCR / "onchain_feedbacks_r4.json"   # readAllFeedback au bloc 108 434 518 (fetch_readall_r4.py)

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


def print_nodes(g, cert, inv, keys, _unused=None, m=2):
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
      f"|T| = {len(cert.truncated)}, r = {cert.r} wei, e = {cert.e} wei, e_eff = {e_eff(cert)} wei, α = {cert.alphaN}/{cert.alphaD}.")


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


def main():
    snap = load_feedbacks(FB)
    fbs = load_feedbacks_onchain(FB_ONCHAIN) if FB_ONCHAIN.exists() else snap
    sk = {(f.agent_id, f.client, f.index): f for f in snap}
    dec_diff = [f for f in fbs if (f.agent_id, f.client, f.index) in sk and
                (sk[(f.agent_id, f.client, f.index)].decimals, sk[(f.agent_id, f.client, f.index)].value) != (f.decimals, f.value)]
    idn = load_identity(STATE, LOGS, APPR)
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

    P("# ANCRE R4 — acte 1 sur le snapshot mainnet du 21/09/2026")
    P(f"\nCommande : `cd solver && .venv/bin/python run_mainnet.py`. Données : {len(fbs)} avis (snapshot 8004scan 21/09), "
      f"identité au bloc {idn.block} ({len(idn.owner)} agents), {sum(len(v) for v in idn.past_owners.values())} détenteurs passés "
      f"(logs Transfer), {sum(len(v) for v in idn.operators.values())} opérateurs actifs (ApprovalForAll), "
      f"{sum(1 for v in idn.approved.values() if v != '0x' + '0' * 40)} getApproved non nul. α = 1/3, m = 2, λ uniformes. "
      "Tous les chiffres ci-dessous sont MESURÉS par ce script.")
    P(f"\nSource des avis : {'relecture on-chain readAllFeedback (bloc 108 434 518)' if fbs is not snap else 'snapshot 8004scan'} ; "
      f"{len(fbs)} avis, {len(set((f.agent_id, f.client, f.index) for f in fbs) & set(sk))} clés communes avec le snapshot du 21/09 ; "
      f"**{len(dec_diff)} avis où 8004scan diffère (valeur/décimales)** : {dict(Counter((f.tag1, sk[(f.agent_id, f.client, f.index)].decimals, f.decimals) for f in dec_diff))} "
      "(tag1, décimales 8004scan, décimales on-chain).")

    # ------------------------------------------------------------------ survie des arêtes
    P("\n## 0. Ce qui survit au schéma de référence (registre entier)")
    for fname in ("core", "reference", "execution-market-8"):
        g = build_graph(fbs, idn, ref, filters[fname], [])
        kinds = Counter(g.nodes[u][0] for u in g.rows)
        P(f"- filtre `{fname}` ({len(filters[fname])} tags) : **{g.n_edges()} arêtes** (couples), "
          f"émetteurs {dict(kinds)} ; compteurs {g.log}")
    all_endorse = [t for t, s in ref.items() if s.kind == "endorsement"]
    P(f"- tags endorsement du schéma : {len(all_endorse)} (> TAGS_MAX = 8 : aucun ensemble ne peut tous les filtrer).")

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
    for lbl, sch in (("référence", ref), ("stress (tout tag = endorsement [-100,0,100])", stress)):
        g, cert, inv = run(fbs, idn, sch, ffarm, [h1, h2])
        m = mass_in(g, cert, inv, farm)
        eve = node_report(g, cert, inv, [(AGENT, EVE)])[0][1]
        P(f"- ancres {{0x07305360, 0xf7d5543d}}, schéma {lbl} : arêtes du graphe = {g.n_edges()}, "
          f"masse sur S = {[fmt(x) for x in m]}, t(#182) = {eve['t'] if eve else 'absent du support'}, "
          f"e = {cert.e} wei, nœuds certifiés = {cert.n}.")
    # contrôle : ancres dans la ferme
    fc = sorted(c for c in farm_clients if len(w2a.get(c, [])) == 1)[:2]
    g, cert, inv = run(fbs, idn, stress, ffarm, fc)
    eve = node_report(g, cert, inv, [(AGENT, EVE)])[0][1]
    P(f"- contrôle (le lecteur choisit 2 wallets de la ferme comme ancres, schéma stress) : "
      f"t(#182) = {[fmt(x) for x in eve['t']]}, trustRobust = {fmt(eve['robust'])}. ANCRE est relatif aux ancres : "
      "il ne protège pas un lecteur qui ancre dans la ferme.")

    # ------------------------------------------------------------------ (b) scanner
    P("\n## (b) Ancre = scanner 0xa06f907f : fuite vers la ferme, avec et sans D15")
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
            # trustRobust max sur S et nombre d'agents de S qui passeraient θ = 1e-3
            robs = [r["robust"] for _, r in node_report(g, cert, inv, [(AGENT, a) for a in farm]) if r]
            npass = sum(1 for x in robs if x >= WAD // 1000 + e_eff(cert))
            P(f"- ancres {anc_lbl}, {lbl} : masse sur S par colonne = {[fmt(x) for x in m]} ; "
              f"t(#182) = {[fmt(x) for x in eve['t']] if eve else 0} ; max trustRobust(m=2) sur S = "
              f"{fmt(max(robs) if robs else 0)} ; agents de S au-dessus de θ = 1e-3 (+e) : {npass} ; e_eff = {e_eff(cert)} wei.")
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
      f"**{bound / WAD:.4f}** ; masse mesurée sur S = **{fmt(m)}**. Ici le seul nœud hors S qui pointe dans S est l'ancre "
      f"(π = α), donc la borne vaut (1−α)·C(ancre,S) = (2/3)·{cS:.4f}. La borne tient ; l'écart vient de ce que S absorbe "
      "(les agents Spawn n'ont qu'une arête, vers #182, qui n'en a aucune).")

    # ------------------------------------------------------------------ (c) #8317
    P("\n## (c) #8317 : les 78 auto-notations sont-elles rejetées ?")
    a8317 = [f for f in fbs if f.agent_id == 8317]
    cl = Counter(f.client for f in a8317)
    P(f"- avis reçus par #8317 : {len(a8317)}, noteurs {dict((k[:10], v) for k, v in cl.items())} ; "
      f"owner = {idn.owner[8317][:10]}, agentWallet = {idn.wallet[8317][:10]}.")
    P(f"- garde-fou du registre (`!isAuthorizedOrOwner`) : owner/opérateurs/approved seulement ; le wallet n'y est pas, "
      f"d'où l'acceptation on-chain des {len(a8317)} avis.")
    for lbl, sch in (("référence (trade_execution = measurement)", ref), ("stress (trade_execution = endorsement)", stress)):
        g = build_graph(fbs, idn, sch, ["trade_execution"], [])
        rej = [r for r in g.rejected if r.get("agent") == 8317]
        P(f"- schéma {lbl} : arêtes vers #8317 = **{sum(1 for _, e in g.edges() if e.agent_id == 8317)}** ; "
          f"compteurs {g.log} (le rejet D16 porte sur le couple, après sélection du dernier avis valide par tag1 : "
          f"les 78 avis se réduisent à 1 triplet) ; rejets détaillés : {rej}")

    # ------------------------------------------------------------------ (d) chaîne honnête
    P("\n## (d) La chaîne honnête 0x0730… / 0xf7d5… → #18 → {#2, #3, #4}")
    P(f"- 0xea0b21fb est owner **et agentWallet** de {w2a.get(ea0b)} ⇒ wallet ambigu ⇒ nœud-adresse sous D16.")
    keys = [(AGENT, 18), (AGENT, 2), (AGENT, 3), (AGENT, 4), (ADDR, ea0b)]
    for lbl, kw in (("D16 strict (nœud-adresse, sans masse)", {}),
                    ("variante « relais » (chaque agent au wallet ambigu → nœud-adresse, poids 1) — PAS une décision du CR",
                     {"ambiguous_wallet": "relay"})):
        for alpha in (Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)):
            g, cert, inv = run(fbs, idn, ref, filters["core"], [h1, h2], alpha=alpha, **kw)
            P(f"\n**{lbl}, α = {alpha}** (filtre core, ancres 0x07305360 et 0xf7d5543d)\n")
            print_nodes(g, cert, inv, keys, ["0x0730", "0xf7d5"])

    # ------------------------------------------------------------------ (e) slash sous D14
    P("\n## (e) 0xea0b… → #4 : `slash −100` (index 1) puis `review +1` (index 2)")
    fs = sorted((f for f in fbs if f.client == ea0b and f.agent_id == 4), key=lambda f: f.index)
    P(f"- avis du couple : {[(f.index, f.tag1, f.value) for f in fs]}")
    for lbl, kw in (("règle du tour 2 (dernier avis du couple)", {"combine": "latest_pair"}),
                    ("D14 (dernier par tag1 + dominance du négatif)", {})):
        g = build_graph(fbs, idn, ref, filters["core"], [ea0b, h1], **kw)
        e4 = [(g.nodes[u][0], e.q, e.tag1, e.feedback_index) for u, e in g.edges() if e.agent_id == 4 and e.client == ea0b]
        P(f"- {lbl} : arête(s) 0xea0b→#4 = {e4}")
        for anc_lbl, anc in (("{0x07305360, 0xf7d5543d}", [h1, h2]), ("{0xea0b, 0x07305360}", [ea0b, h1])):
            g, cert, inv = run(fbs, idn, ref, filters["core"], anc, **kw)
            r = node_report(g, cert, inv, [(AGENT, 4)])[0][1]
            P(f"  - ancres {anc_lbl} : #4 → t = {[fmt(x) for x in r['t']] if r else 0}, trustRobust = "
              f"{fmt(r['robust']) if r else 0}, distrust = {fmt(r['d']) if r else 0}")

    # ------------------------------------------------------------------ angles morts mesurés
    P("\n## Mesures annexes (angles morts)")
    # sélection : latest_valid vs latest_then_reject
    for lbl, sch, flt in (("stress", stress, None), ("référence", ref, None)):
        tags = sorted(sch)
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
    # anciens wallets
    ctl_miss = 0
    pairs = {(f.client, f.agent_id) for f in fbs}
    for c, a in pairs:
        if c in idn.past_wallets.get(a, set()) and c not in idn.controllers(a):
            ctl_miss += 1
    P(f"- couples (client, agent) où le client a été agentWallet de la cible mais n'est plus contrôleur : **{ctl_miss}** "
      f"(D16 ne rejette que les anciens owners).")
    g = build_graph(fbs, idn, ref, filters["execution-market-8"], [])
    po = [r for r in g.rejected if r["raison"] == "controleur_past_owner"]
    P(f"- rejets « ancien owner » (D16) sous le filtre execution-market-8 : **{len(po)} couples**, noteurs "
      f"{dict(Counter(r['client'][:10] for r in po))}, cibles {[r['agent'] for r in po]} : la plateforme a minté "
      "ces agents puis les a transférés à ses exécutants, et les note ensuite.")
    # fenêtre MAX_SCAN = 32 du veto on-chain (contrat R5, _registryEdge) : tags dont le dernier avis sort de la fenêtre
    bypair = defaultdict(list)
    for f in fbs:
        bypair[(f.client, f.agent_id)].append(f)
    big = {k: l for k, l in bypair.items() if len(l) > 32}
    hidden = []
    for (c, a), l in big.items():
        last = max(f.index for f in l)
        lt = {}
        for f in l:
            if not f.revoked and (f.tag1 not in lt or f.index > lt[f.tag1]):
                lt[f.tag1] = f.index
        out_w = [t for t, i in lt.items() if i <= last - 32]
        if out_w:
            hidden.append((c[:10], a, len(l), len(lt), len(out_w)))
    P(f"- couples avec > 32 avis : **{len(big)}** ; parmi eux, couples où au moins un tag1 a son dernier avis HORS de la "
      f"fenêtre MAX_SCAN = 32 du veto on-chain de R5 : **{len(hidden)}** (noteur, agent, avis, tags, tags hors fenêtre) = {hidden}.")
    amb = Counter(len(v) for v in w2a.values())
    raters_amb = {f.client for f in fbs if len(w2a.get(f.client, [])) > 1}
    P(f"- wallets partagés (≥ 2 agents) : {sum(v for k, v in amb.items() if k > 1)} ; noteurs dont le wallet est partagé : "
      f"{len(raters_amb)} ({sum(1 for f in fbs if f.client in raters_amb)} avis) ; noteurs sans agent : "
      f"{len({f.client for f in fbs if f.client not in w2a})}.")
    # α : support sur le mainnet
    P("\n### Support mainnet en fonction de α (ancres 0x0730/0xf7d5, filtre reference)")
    for kw_lbl, kw in (("D16", {}), ("relais", {"ambiguous_wallet": "relay"})):
        for alpha in (Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)):
            g, cert, inv = run(fbs, idn, ref, filters["reference"], [h1, h2], alpha=alpha, **kw)
            sup = sum(1 for v in range(cert.n) if any(cert.t[a][v] > 0 for a in range(cert.k)))
            P(f"- {kw_lbl}, α = {alpha} : support (t > 0) = {sup} nœuds, arêtes fournies = "
              f"{sum(len(r) for r in cert.rows.values())}, e = {cert.e} wei")
    os.makedirs(HERE / "out", exist_ok=True)
    (HERE / "out" / "mainnet.md").write_text(out.getvalue())
    print(out.getvalue())


if __name__ == "__main__":
    main()

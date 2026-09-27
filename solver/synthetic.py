"""ANCRE R4 — mesure de α ∈ {1/4, 1/3, 1/2} sur graphes synthétiques À VÉRITÉ CONNUE (D19).

Usage : .venv/bin/python synthetic.py [--quick]      -> out/synthetic.md

MODÈLE (le résultat en dépend ; c'est un modèle, pas le mainnet) :
  - communauté honnête H : N_H agents ; chaque honnête approuve `deg` honnêtes tirés uniformément,
    poids q ~ U{5000..10000} (0,5 à 1) ; densité = deg ∈ {2, 5, 10}.
  - k = 3 ancres honnêtes (nœuds-ancres distincts), chacune approuve 5 honnêtes au hasard (q = 10000).
  - région Sybil S : N_S agents, chacun approuve 10 Sybil au hasard (q = 10000) : S recycle sa masse au maximum.
  - g arêtes d'attaque honnête → Sybil (q = 10000), émises par des honnêtes tirés uniformément
    (variante « ciblée » : émises par les honnêtes de plus forte masse, pire cas pour une ancre qui fait confiance à des nœuds centraux).
  - scénario « ancre compromise » : l'ancre 0 approuve en plus 5 Sybil (arêtes d'attaque au premier saut).
Mesures : masse dans S (fuite), borne ((1−α)/α)·Σ_{u∉S} π(u)·C(u,S), couverture honnête (Σλt ≥ θ),
passage leave-one-out m = 2 (trustRobust ≥ θ + e) des honnêtes et des Sybil, taille du support (t ≥ 1 wei),
lignes nécessaires pour tenir e ≤ θ (troncature gloutonne des plus petites masses).
θ = 1e-4 WAD (10 % de la part uniforme 1/N_H pour N_H = 1000) : CHOIX, pas une décision du CR.
"""
from __future__ import annotations

import sys
import time
from fractions import Fraction
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
ALPHAS = [Fraction(1, 4), Fraction(1, 3), Fraction(1, 2)]
WAD = 10**18


def make_graph(rng, NH, NS, deg, g_att, k=3, targeted=False, compromised=False, pi_hint=None):
    """Renvoie src, dst, q (int), n, index des régions. Nœuds : [ancres k][H NH][S NS]."""
    n = k + NH + NS
    H0, S0 = k, k + NH
    src, dst, q = [], [], []
    for a in range(k):
        for v in rng.choice(NH, 5, replace=False):
            src.append(a); dst.append(H0 + v); q.append(10000)
    for u in range(NH):
        tg = rng.choice(NH - 1, deg, replace=False)
        tg = tg + (tg >= u)                               # pas de boucle
        for v in tg:
            src.append(H0 + u); dst.append(H0 + v); q.append(int(rng.integers(5000, 10001)))
    for u in range(NS):
        tg = rng.choice(NS - 1, 10, replace=False)
        tg = tg + (tg >= u)
        for v in tg:
            src.append(S0 + u); dst.append(S0 + v); q.append(10000)
    if g_att:
        if targeted and pi_hint is not None:
            order = np.argsort(-pi_hint[H0:H0 + NH])
            emit = order[np.arange(g_att) % NH]
        else:
            emit = rng.integers(0, NH, g_att)
        for u in emit:
            src.append(H0 + int(u)); dst.append(S0 + int(rng.integers(0, NS))); q.append(10000)
    if compromised:
        for v in rng.choice(NS, 5, replace=False):
            src.append(0); dst.append(S0 + int(v)); q.append(10000)
    src, dst, q = np.array(src), np.array(dst), np.array(q, dtype=np.int64)
    # dédoublonnage (u, v) : on garde la dernière occurrence (une arête par couple)
    key = src * n + dst
    _, last = np.unique(key[::-1], return_index=True)
    keep = len(key) - 1 - last
    return src[keep], dst[keep], q[keep], n, (H0, S0)


def solve(src, dst, q, n, k, alpha, tol=1e-16):
    a = float(alpha)
    bp = np.maximum(10000, np.bincount(src, weights=q, minlength=n))
    c = q / bp[src]
    P = np.zeros((n, k)); P[np.arange(k), np.arange(k)] = 1
    t = a * P
    for it in range(10000):
        flow = t[src] * c[:, None]
        nt = a * P + (1 - a) * np.stack([np.bincount(dst, weights=flow[:, j], minlength=n) for j in range(k)], 1)
        dlt = np.abs(nt - t).sum()
        t = nt
        if dlt < tol:
            break
    return t, c, it


def metrics(src, dst, q, n, k, regions, alpha, theta, m=2):
    H0, S0 = regions
    t, c, iters = solve(src, dst, q, n, k, alpha)
    lam = np.full(k, 1 / k)
    comb = t @ lam
    contrib = t * lam
    srt = np.sort(contrib, axis=1)[:, ::-1]
    robust = srt[:, m - 1:].sum(1)
    H, S = np.arange(H0, S0), np.arange(S0, n)
    leak = comb[S].sum()
    # borne sur la colonne combinée (p = λ réparti sur les ancres, linéarité)
    inS = dst >= S0
    fromOut = src < S0
    bound = (1 - float(alpha)) / float(alpha) * float((comb[src] * c * (inS & fromOut)).sum())
    tw = np.floor(t * WAD)
    support = int((tw.max(1) >= 1).sum())
    # lignes nécessaires pour e ≤ θ : marge Σ_T (1−α)·t_u^(a) ≤ α·θ pour chaque colonne (contrat : e = r/α)
    budget = float(alpha) * theta
    mx = t.max(1)
    order = np.argsort(mx)
    cum = np.cumsum((1 - float(alpha)) * t[order], axis=0)
    ok = (cum <= budget).all(1)
    ntrunc = int(np.argmin(ok)) if not ok.all() else n
    rows_needed = int((mx > 0).sum()) - min(ntrunc, int((mx > 0).sum()))
    outdeg = np.bincount(src, minlength=n)
    kept = order[ntrunc:]
    edges_needed = int(outdeg[kept].sum())
    return {
        "leak": leak, "bound": bound, "cover": float((comb[H] >= theta).mean()),
        "loo_h": float((robust[H] >= theta).mean()), "loo_s": float((robust[S] >= theta).mean()),
        "loo_h10": float((robust[H] >= theta / 10).mean()), "loo_s10": float((robust[S] >= theta / 10).mean()),
        # point de fonctionnement indépendant de θ : seuil oracle qui laisse passer 1 % des Sybil (LOO m=2)
        "h_at_s1": float((robust[H] > np.quantile(robust[S], 0.99)).mean()),
        "nol_s": float((comb[S] >= theta).mean()), "support": support, "rows": rows_needed,
        "edges": edges_needed, "iters": iters, "mass": comb.sum(),
    }


def run(quick=False):
    NH, NS, k = 1000, 1000, 3
    theta = 1e-4
    seeds = range(2 if quick else 5)
    degs = [2, 5, 10]
    gs = [1, 10, 100, 1000]
    out = []
    P = out.append
    P("# ANCRE R4 — α sur graphes synthétiques à vérité connue\n")
    P(f"Commande : `cd solver && .venv/bin/python synthetic.py`. N_H = {NH}, N_S = {NS}, k = {k} ancres, "
      f"θ = {theta:g} (choix), m = 2, λ uniformes, {len(seeds)} graines par case, moyennes. Tout est MESURÉ sur ce modèle ; "
      "**le résultat dépend du modèle** (topologie uniforme, Sybil denses, attaquant qui n'obtient que g arêtes).\n")
    rng0 = np.random.default_rng(0)
    for scen in ("aléatoire", "ciblée", "ancre compromise"):
        P(f"\n## Arêtes d'attaque {scen}\n")
        P("| deg | g | α | fuite π(S) | borne | fuite/borne | couverture H | LOO H (m=2) | LOO H à θ/10 | Sybil > θ sans LOO | Sybil LOO | Sybil LOO à θ/10 | H LOO au seuil « 1 % Sybil » | support | lignes pour e ≤ θ | arêtes pour e ≤ θ |")
        P("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for deg in degs:
            for g in (gs if scen != "ancre compromise" else [0, 10]):
                for alpha in ALPHAS:
                    acc = []
                    for sd in seeds:
                        rng = np.random.default_rng(1000 * sd + deg)
                        hint = None
                        if scen == "ciblée":
                            s0, d0, q0, n0, r0 = make_graph(np.random.default_rng(1000 * sd + deg), NH, NS, deg, 0, k)
                            t0, _, _ = solve(s0, d0, q0, n0, k, alpha)
                            hint = t0.mean(1)
                        src, dst, q, n, reg = make_graph(rng, NH, NS, deg, g, k, targeted=(scen == "ciblée"),
                                                         compromised=(scen == "ancre compromise"), pi_hint=hint)
                        acc.append(metrics(src, dst, q, n, k, reg, alpha, theta))
                    mean = {key: float(np.mean([x[key] for x in acc])) for key in acc[0]}
                    ratio = mean["leak"] / mean["bound"] if mean["bound"] > 0 else float("nan")
                    P(f"| {deg} | {g} | {alpha} | {mean['leak']:.4f} | {mean['bound']:.4f} | {ratio:.2f} | "
                      f"{mean['cover']:.3f} | {mean['loo_h']:.3f} | {mean['loo_h10']:.3f} | {mean['nol_s']:.3f} | {mean['loo_s']:.3f} | {mean['loo_s10']:.3f} | {mean['h_at_s1']:.3f} | "
                      f"{mean['support']:.0f} | {mean['rows']:.0f} | {mean['edges']:.0f} |")
    return "\n".join(out)


def integer_check():
    """Certificat entier (arithmétique du contrat) sur un graphe synthétique réduit, pour chaque α."""
    from graph import ANCHOR, AGENT, Edge, Graph
    from ppr import certify, e_eff
    lines = ["\n## Certificat entier (mode contract) sur un graphe réduit (N_H = N_S = 150, deg = 5, g = 10)\n",
             "| α | nœuds certifiés | arêtes fournies | r (wei, max col.) | e (wei, max col.) | e_eff |", "|---|---|---|---|---|---|"]
    for alpha in ALPHAS:
        rng = np.random.default_rng(7)
        src, dst, q, n, reg = make_graph(rng, 150, 150, 5, 10, 3)
        nodes = [(ANCHOR, f"0x{i + 1:040x}") for i in range(3)] + [(AGENT, i) for i in range(n - 3)]
        rows = {}
        for s, d_, w in zip(src.tolist(), dst.tolist(), q.tolist()):
            rows.setdefault(s, []).append(Edge(dst=d_, q=w, client="", agent_id=d_ - 3, tag1="vouch", feedback_index=1))
        for u in rows:
            rows[u].sort(key=lambda e: e.dst)
        g = Graph(nodes=nodes, index={x: i for i, x in enumerate(nodes)}, rows=rows, anchors=[0, 1, 2], log={}, rejected=[])
        t0 = time.time()
        c = certify(g, alpha, refine_iters=60)
        lines.append(f"| {alpha} | {c.n} | {sum(len(r) for r in c.rows.values())} | {max(c.r)} | {max(c.e)} | {e_eff(c)} |")
    return "\n".join(lines)


if __name__ == "__main__":
    t0 = time.time()
    txt = run(quick="--quick" in sys.argv) + "\n" + integer_check()
    txt += f"\n\nDurée : {time.time() - t0:.0f} s.\n"
    (HERE / "out").mkdir(exist_ok=True)
    (HERE / "out" / "synthetic.md").write_text(txt)
    print(txt)

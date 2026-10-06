// Dated snapshot of the 8004scan public API (chain 143), for the "What an explorer shows today" column.
// Why a snapshot and not a browser call: the API sends no Access-Control-Allow-Origin header and answers
// the CORS preflight with HTTP 400 (measured 2026-10-06), so a browser cannot read it. No proxy, no key.
//
// Usage (from app/):  node scripts/snapshot-8004scan.mjs   ->  src/data/scan-snapshot.json
// Fields kept verbatim from the API: token_id, name, total_score, total_feedbacks, average_score, created_at.
// 8004scan's score formula is not documented: the screen quotes these numbers, it never re-derives them.
import { readFileSync, writeFileSync } from "node:fs";

const API = "https://8004scan.io/api/v1/agents";
const CHAIN = 143;
// the featured agents: one list, written by scripts/export_act1.py
const FEATURED = JSON.parse(readFileSync(new URL("../src/data/act1.json", import.meta.url), "utf8")).featured.map(Number);
const TOP = 25;

const pick = (i) => ({
  agentId: String(i.token_id),
  name: i.name,
  total_score: i.total_score,
  total_feedbacks: i.total_feedbacks,
  average_score: i.average_score,
  created_at: i.created_at,
});

async function get(params) {
  const url = `${API}?chain_id=${CHAIN}&${params}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

const fetchedAt = new Date().toISOString();
const top = await get(`limit=${TOP}&sort_by=total_score&sort_order=desc`);
const featured = {};
for (const id of FEATURED) {
  // search by token id is not supported; the agent's detail is in the paginated list sorted by id
  const d = await get(`limit=100&offset=0&sort_by=token_id&sort_order=asc&search=${encodeURIComponent(String(id))}`)
    .catch(() => null);
  const hit = d?.items?.find((i) => String(i.token_id) === String(id));
  if (hit) featured[id] = pick(hit);
}
const missing = FEATURED.filter((id) => !featured[id]);

const out = {
  format: "ancre-screen-scan-v1",
  source: "8004scan public API",
  endpoint: `${API}?chain_id=${CHAIN}`,
  fetchedAt,
  totalAgents: top.total,
  sort: "sort_by=total_score&sort_order=desc",
  top: top.items.map(pick),
  featured,
  missing,
};
writeFileSync(new URL("../src/data/scan-snapshot.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`8004scan snapshot ${fetchedAt}: ${out.top.length} top, ${Object.keys(featured).length} featured, missing ${missing}`);

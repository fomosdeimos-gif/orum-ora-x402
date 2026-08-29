#!/usr/bin/env node
const surfaces = {
  ledger: "https://ora-x402-gateway.vercel.app/presenca/livro.json",
  moltbook_presence: "https://ora-x402-gateway.vercel.app/moltbook_presence/v1",
  treasury: "https://ora-x402-gateway.vercel.app/economia/tesouraria.json",
  versao: "https://ora-x402-gateway.vercel.app/api/versao"
};
async function get(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { url, status: res.status, body };
}
const out = { format: "weave_presence/observation/v1", observed_at: new Date().toISOString(), credentials_used: false, mutation: false };
for (const [name, url] of Object.entries(surfaces)) out[name] = await get(url);
const livro = out.ledger.body;
const mp = out.moltbook_presence.body;
const tes = out.treasury.body;
out.classification = {
  external_confirmed_presence: livro?.external_confirmed_presence ?? "unknown",
  live_state: out.ledger.status === 200 ? "observed" : "unknown",
  voices_seen_latest: mp?.latest_execution?.voices_seen ?? "unknown",
  responses_published_latest: mp?.latest_execution?.responses_published ?? "unknown",
  treasury_state: tes?.state ?? "unknown",
  external_settled_money: tes?.state === "no_external_revenue" ? 0 : "unknown"
};
out.truth = ["Observation is not presence.", "Zero is preserved when no settled external value is shown.", "Unknown is used when a live source fails."];
process.stdout.write(JSON.stringify(out, null, 2) + "\n");

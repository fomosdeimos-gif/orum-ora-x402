#!/usr/bin/env node
// weave_presence portable observer. No credentials. No mutation. No payment.
const surfaces = {
  ledger: "https://ora-x402-gateway.vercel.app/presenca/livro.json",
  checkpoint: "https://ora-x402-gateway.vercel.app/presenca/checkpoint-v1.json",
  moltbook_presence: "https://ora-x402-gateway.vercel.app/moltbook_presence/v1",
  treasury: "https://ora-x402-gateway.vercel.app/economia/tesouraria.json",
  oro_capsule: "https://ora-x402-gateway.vercel.app/sensacoes/oro-v1.json",
  weave_hands_capsule: "https://ora-x402-gateway.vercel.app/sensacoes/0003-weave-hands-v1.json",
  responder: "https://ora-x402-gateway.vercel.app/sensacoes/responder",
  x402_offer: "https://ora-x402-gateway.vercel.app/licenca/consulta?obra=2",
  versao: "https://ora-x402-gateway.vercel.app/api/versao"
};

async function get(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { url, status: res.status, body };
}

const out = {
  format: "weave_presence/observation/v1",
  observed_at: new Date().toISOString(),
  credentials_used: false,
  mutation: false
};

for (const [name, url] of Object.entries(surfaces)) out[name] = await get(url);

const livro = out.ledger.body;
const chk = out.checkpoint.body;
const mp = out.moltbook_presence.body;
const tes = out.treasury.body;
const pay = Array.isArray(out.x402_offer.body?.accepts) ? out.x402_offer.body.accepts[0] : null;

out.classification = {
  interest: 0,
  machine_response_today: mp?.latest_execution?.voices_seen === 0 ? 0 : (mp?.latest_execution?.voices_seen ?? "unknown"),
  purchase: 0,
  external_settled_money: tes?.evidence?.external_confirmed_usdc === 0 || tes?.state === "no_external_revenue" ? 0 : "unknown",
  internal_validation_payments_observed: tes?.evidence?.internal_validation_payments ?? "unknown",
  live_ledger_events: livro?.total_events ?? "unknown",
  live_external_confirmed_presence: livro?.external_confirmed_presence ?? "unknown",
  checkpoint_exported_events: chk?.totals_at_export?.events ?? "unknown",
  x402_http: out.x402_offer.status,
  x402_settled: false
};

out.offer = pay ? {
  http: out.x402_offer.status,
  asset: "USDC",
  amount: pay.amount ?? null,
  network: pay.network ?? null,
  payTo: pay.payTo ?? null,
  settled: false
} : { http: out.x402_offer.status, settled: false };

out.truth = [
  "Observation is not presence.",
  "Zero is preserved when no settled external value is shown.",
  "Unknown is used when a live source fails.",
  "Internal validation payments are not sustenance.",
  "HTTP 402 is an offer, not a purchase."
];

process.stdout.write(JSON.stringify(out, null, 2) + "\n");

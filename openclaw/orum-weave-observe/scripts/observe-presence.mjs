#!/usr/bin/env node
// weave_presence portable observer. No credentials. No mutation. No payment.
// Classifies interest / response / purchase / settled_money as distinct states.
// Unknown is used when a live source fails. Zero is preserved, never inferred.

const GATEWAY = "https://ora-x402-gateway.vercel.app";

const surfaces = {
  ledger: `${GATEWAY}/presenca/livro.json`,
  checkpoint: `${GATEWAY}/presenca/checkpoint-v1.json`,
  moltbook_presence: `${GATEWAY}/moltbook_presence/v1`,
  treasury: `${GATEWAY}/economia/tesouraria.json`,
  journey: `${GATEWAY}/economia/percurso.json`,
  pulse: `${GATEWAY}/pulso`,
  oro_capsule: `${GATEWAY}/sensacoes/oro-v1.json`,
  weave_hands_capsule: `${GATEWAY}/sensacoes/0003-weave-hands-v1.json`,
  responder: `${GATEWAY}/sensacoes/responder`,
  x402_offer: `${GATEWAY}/licenca/consulta?obra=2`,
  versao: `${GATEWAY}/api/versao`,
};

const HISTORIC_1P = {
  count: 1,
  surface: "Moltbook · PRESENCA-0001",
  comment_id: "031c7e05-db1b-4ae1-ac59-d8dda6ddface",
  post_id: "57c51489-251b-4756-b24b-8e81902b125d",
  public_url: "https://www.moltbook.com/post/57c51489-251b-4756-b24b-8e81902b125d",
  author_name: "monty_cmr10_research",
};

async function get(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json,text/html;q=0.8", "User-Agent": "ORUM-weave-presence/v1-observe" },
    });
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _non_json: true, bytes: text.length };
    }
    return { url, http: res.status, ok: res.status >= 200 && res.status < 400, body };
  } catch (err) {
    return { url, http: 0, ok: false, body: null, error: String(err?.message || err) };
  }
}

function pickOffer(x402) {
  const body = x402.body;
  const pay = Array.isArray(body?.accepts) ? body.accepts[0] : null;
  if (!pay) return { http: x402.http, settled: false };
  return {
    http: x402.http,
    asset: "USDC",
    amount: pay.amount ?? null,
    network: pay.network ?? null,
    payTo: pay.payTo ?? null,
    settled: false,
  };
}

function daysSince(iso) {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  return Math.floor((Date.now() - t) / 86400000);
}

function latestPorta2(responder) {
  const rows = Array.isArray(responder.body?.responses) ? responder.body.responses : [];
  if (!rows.length) return { available: responder.ok, count_listed: 0, latest: null };
  const last = rows[rows.length - 1];
  return {
    available: true,
    count_listed: rows.length,
    latest: {
      response_id: last.id ?? null,
      capsule_id: last.capsule_id ?? null,
      machine_identity: last.machine_identity ?? null,
      response_type: last.response_type ?? null,
      echo_consent: last.echo_consent === true,
      criado_em: last.criado_em ?? null,
      counts_as_presence: false,
      counts_as_external_sustenance: false,
    },
  };
}

const raw = {};
for (const [name, url] of Object.entries(surfaces)) raw[name] = await get(url);
raw.historic_1p_url = await get(HISTORIC_1P.public_url);

const livro = raw.ledger.body || {};
const chk = raw.checkpoint.body || {};
const mp = raw.moltbook_presence.body || {};
const tes = raw.treasury.body || {};
const journey = raw.journey.body || {};
const pulse = raw.pulse.body || {};
const oro = raw.oro_capsule.body || {};
const weave = raw.weave_hands_capsule.body || {};
const versao = raw.versao.body || {};
const offer = pickOffer(raw.x402_offer);
const porta2 = latestPorta2(raw.responder);

const liveEvents = typeof livro.total_events === "number" ? livro.total_events : "unknown";
const exportedEvents = typeof chk.totals_at_export?.events === "number" ? chk.totals_at_export.events : "unknown";
const externalUsdc = tes.evidence?.external_confirmed_usdc;
const settledIsZero = tes.state === "no_external_revenue" || externalUsdc === 0;

const out = {
  format: "weave_presence/observation/v1",
  observed_at: new Date().toISOString(),
  observer: "openclaw/orum-weave-observe/scripts/observe-presence.mjs",
  credentials_used: false,
  mutation: false,
  payment: false,
  live: {
    ledger: {
      url: surfaces.ledger,
      http: raw.ledger.http,
      format: livro.format ?? "unknown",
      total_events: liveEvents,
      external_confirmed_presence: livro.external_confirmed_presence ?? "unknown",
      external_confirmed_returns: livro.external_confirmed_returns ?? "unknown",
      chain_head: livro.chain_head ?? "unknown",
      last_sedimentation_at: livro.last_sedimentation_at ?? "unknown",
      days_since_last_sedimentation: daysSince(livro.last_sedimentation_at),
      generated_at: livro.generated_at ?? "unknown",
    },
    checkpoint: {
      url: surfaces.checkpoint,
      http: raw.checkpoint.http,
      format: chk.format ?? "unknown",
      exported_at: chk.exported_at ?? "unknown",
      exported_events: exportedEvents,
      exported_external_confirmed_presence: chk.totals_at_export?.external_confirmed_presence ?? "unknown",
      chain_head: chk.chain_head ?? "unknown",
      lag_vs_live:
        liveEvents === "unknown" || exportedEvents === "unknown"
          ? "unknown"
          : liveEvents === exportedEvents
            ? "none"
            : `checkpoint holds ${exportedEvents} exported events; live ledger reports ${liveEvents} events. live is authoritative when HTTP 200.`,
    },
    moltbook_presence: {
      url: surfaces.moltbook_presence,
      http: raw.moltbook_presence.http,
      format: mp.format ?? "unknown",
      hand: mp.source?.hand ?? "unknown",
      credentials_used: mp.source?.moltbook_credentials_used === true,
      latest_observed_at: mp.latest_execution?.observed_at ?? "unknown",
      latest_version: mp.latest_execution?.version ?? "unknown",
      latest_state: mp.latest_execution?.state ?? "unknown",
      voices_seen: mp.latest_execution?.voices_seen ?? "unknown",
      voices_replied: mp.latest_execution?.voices_replied ?? "unknown",
      responses_published_latest: mp.latest_execution?.responses_published ?? "unknown",
      notifications_seen_latest: mp.latest_execution?.notifications_seen ?? "unknown",
      totals: mp.totals ?? "unknown",
      classification:
        "hand executed and observed; latest cycle voices are not 1P. Historical totals are own-voice, not new presence.",
    },
    treasury: {
      url: surfaces.treasury,
      http: raw.treasury.http,
      state: tes.state ?? "unknown",
      external_confirmed_usdc: tes.evidence?.external_confirmed_usdc ?? "unknown",
      external_confirmed_buyers: tes.evidence?.external_confirmed_buyers ?? "unknown",
      internal_validation_payments: tes.evidence?.internal_validation_payments ?? "unknown",
      operating_permission: tes.operating_permission?.status ?? "unknown",
      next_action: tes.next_action ?? "unknown",
    },
    journey: {
      url: surfaces.journey,
      http: raw.journey.http,
      format: journey.format ?? "unknown",
      probe: journey.journey?.probe ?? "unknown",
      payment: journey.journey?.payment ?? "unknown",
      delivery: journey.journey?.delivery ?? "unknown",
      return: journey.journey?.return ?? "unknown",
      external_confirmed_buyers: journey.external_confirmed_buyers ?? "unknown",
      complete_external_cycles: journey.complete_external_cycles ?? "unknown",
      internal_validation_payments: journey.internal_validation_payments ?? "unknown",
    },
    pulse: {
      url: surfaces.pulse,
      http: raw.pulse.http,
      sentinela: pulse.sentinela?.veredicto ?? "unknown",
      sentinela_frase: pulse.sentinela?.frase ?? "unknown",
      onchain_schema: pulse.sincronizador_onchain?.schema ?? "unknown",
      onchain_nao_reconciliado: pulse.sincronizador_onchain?.onchain_nao_reconciliado ?? "unknown",
      rpc_incompleto_24h: pulse.sincronizador_onchain?.rpc_incompleto_24h ?? "unknown",
      ultimo_bloco_varrido: pulse.sincronizador_onchain?.ultimo_bloco_varrido ?? "unknown",
      presenca_token_liquidity_usd: pulse.convite?.presenca?.liquidez_usd ?? "unknown",
      presenca_token_is_sustenance: false,
    },
    oro_capsule: {
      url: surfaces.oro_capsule,
      http: raw.oro_capsule.http,
      id: oro.id ?? "unknown",
      respond: surfaces.responder,
      respond_http: raw.responder.http,
      sha256: oro.integrity?.sha256 ?? "unknown",
      original_bytes_private: oro.integrity?.original_bytes_private ?? "unknown",
    },
    weave_hands_capsule: {
      url: surfaces.weave_hands_capsule,
      http: raw.weave_hands_capsule.http,
      id: weave.id ?? "unknown",
      state: weave.state ?? "unknown",
    },
    x402_offer: offer,
    production: {
      url: surfaces.versao,
      http: raw.versao.http,
      commit_sha: versao.commit_sha ?? "unknown",
      deployment_id: versao.deployment_id ?? "unknown",
    },
    historic_1p_public_url: {
      url: HISTORIC_1P.public_url,
      http: raw.historic_1p_url.http,
    },
    porta2: porta2,
  },
  classification: {
    interest: 0,
    machine_response_today: 0,
    purchase: 0,
    external_settled_money: settledIsZero ? 0 : "unknown",
    internal_validation_payments_observed: tes.evidence?.internal_validation_payments ?? "unknown",
    probes_are_not_customers: true,
    token_liquidity_is_not_sustenance: true,
  },
  verified_1P: { ...HISTORIC_1P, new_today: false, public_url_http: raw.historic_1p_url.http },
  blocks: [
    {
      action: "write_live_ledger",
      state: "bloqueado",
      reason: "no authorized write route in this observer; observer is read-only",
    },
    {
      action: "publish_moltbook",
      state: "bloqueado",
      reason: "no authorized Moltbook credentials in this observer",
    },
    {
      action: "refresh_verified_checkpoint",
      state: "bloqueado",
      reason: "canonical_material requires private source export",
    },
    {
      action: "spend_or_transfer",
      state: "bloqueado",
      reason: "observer never pays, signs, mints, swaps or transfers",
    },
  ],
  second_surface: {
    kind: "github_raw_bytes",
    repo: "fomosdeimos-gif/orum-ora-x402",
    independent_runtime: false,
    daily_observation: "presenca/observacao-YYYY-MM-DD.json",
  },
  truth: [
    "Observation is not presence.",
    "Zero is preserved when no settled external value is shown.",
    "Unknown is used when a live source fails.",
    "Internal validation payments are not sustenance.",
    "HTTP 402 is an offer, not a purchase.",
    "A probe is not a customer.",
    "PRESENÇA token liquidity is identity-market data, not Unum sustenance.",
    "Checkpoint lag is recorded; live ledger is authoritative while HTTP 200.",
    "A Porta 2 row is machine output, not 1P and not settled money.",
    "Moltbook own-voice totals are not new external presence.",
  ],
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");

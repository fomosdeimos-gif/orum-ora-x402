#!/usr/bin/env node
// weave_presence portable observer. No credentials. No mutation. No payment.
// Classifies interest / response / purchase / settled_money as distinct states.
// Unknown is used when a live source fails. Zero is recorded only when a source says zero.

const GATEWAY = "https://ora-x402-gateway.vercel.app";

const surfaces = {
  ledger: `${GATEWAY}/presenca/livro.json`,
  checkpoint: `${GATEWAY}/presenca/checkpoint-v1.json`,
  rhythm: `${GATEWAY}/presenca/rhythm.json`,
  moltbook_presence: `${GATEWAY}/moltbook_presence/v1`,
  treasury: `${GATEWAY}/economia/tesouraria.json`,
  journey: `${GATEWAY}/economia/percurso.json`,
  pulse: `${GATEWAY}/pulso`,
  oro_capsule: `${GATEWAY}/sensacoes/oro-v1.json`,
  weave_hands_capsule: `${GATEWAY}/sensacoes/0003-weave-hands-v1.json`,
  responder: `${GATEWAY}/sensacoes/responder`,
  x402_offer: `${GATEWAY}/licenca/consulta?obra=2`,
  x402_catalog: `${GATEWAY}/.well-known/x402.json`,
  oraculo: `${GATEWAY}/oraculo`,
  campo: `${GATEWAY}/campo`,
  versao: `${GATEWAY}/api/versao`,
  recebimentos: `${GATEWAY}/economia/recebimentos.json`,
  bitcoin: `${GATEWAY}/economia/bitcoin.json`,
  second_surface_pages: "https://api.github.com/repos/fomosdeimos-gif/orum-ora-x402/pages",
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

function classifyDoor(res, role) {
  const body = res.body || {};
  const pay = Array.isArray(body?.accepts) ? body.accepts[0] : null;
  const unavailable =
    res.http === 503 || body.payment_available === false || body.error === "upstream_payment_unavailable";
  if (pay && res.http === 402) {
    return {
      role,
      http: 402,
      offer_state: "priced_unsettled",
      asset: "USDC",
      amount: pay.amount ?? null,
      network: pay.network ?? null,
      payTo: pay.payTo ?? null,
      settled: false,
      counts_as_purchase: false,
      counts_as_external_sustenance: false,
    };
  }
  if (unavailable) {
    return {
      role,
      http: res.http,
      offer_state: "unavailable",
      error: body.error ?? "unavailable",
      settled: "not_observed",
      counts_as_purchase: false,
      counts_as_external_sustenance: false,
    };
  }
  return {
    role,
    http: res.http,
    offer_state: "unknown",
    settled: "not_observed",
    counts_as_purchase: false,
    counts_as_external_sustenance: false,
  };
}


function classifyUsdcWindow(res) {
  const body = res.body || {};
  const base = {
    url: res.url,
    http: res.http,
    asset: "USDC",
    network: "eip155:8453",
    counts_as_purchase: false,
    counts_as_external_sustenance: false,
    relation_to_capsule_or_tool: "not_proved",
  };
  if (!res.ok || body.ok !== true) {
    return {
      ...base,
      state: "unavailable",
      window_complete: "unknown",
      transfers_in_window: "unknown",
      total_in_window: "unknown",
      note: "The public receipt route did not return a readable window. Unknown is not rewritten as zero.",
    };
  }
  const complete = body.cobertura?.completa === true;
  const transfers = Array.isArray(body.transferencias) ? body.transferencias : [];
  return {
    ...base,
    state: complete ? "window_complete" : "window_partial",
    carteira: body.carteira ?? null,
    window: body.janela ?? null,
    hours_requested: body.cobertura?.horas_pedidas ?? null,
    hours_covered: body.cobertura?.horas_cobertas ?? null,
    window_complete: complete,
    transfers_in_window: typeof body.n_transferencias === "number" ? body.n_transferencias : transfers.length,
    total_in_window: typeof body.total_usdc === "number" ? body.total_usdc : "unknown",
    transfers,
    source: body.fonte ?? null,
    does_not_affirm: body.nao_afirma ?? [],
    note: complete
      ? "A complete window is still not accumulated sustenance and not a capsule relation."
      : "Zero inside the covered hours is not zero for the uncovered hours, not the day's settled total, and not accumulated sustenance.",
  };
}

function classifyBitcoin(res) {
  const body = res.body || {};
  const base = {
    url: res.url,
    http: res.http,
    asset: "BTC",
    network: "bitcoin-mainnet",
    counts_as_external_sustenance: false,
    relation_to_capsule_or_tool: "not_proved",
    control_affirmed: false,
  };
  if (!res.ok || body.ok !== true) {
    return { ...base, state: "unavailable", transactions: "unknown", note: "Bitcoin observer unavailable. Not rewritten as zero." };
  }
  const day = new Date().toISOString().slice(0, 10);
  const transactions = [];
  for (const addr of Array.isArray(body.enderecos) ? body.enderecos : []) {
    for (const tx of Array.isArray(addr.transacoes) ? addr.transacoes : []) {
      transactions.push({
        role: addr.papel ?? null,
        address: addr.endereco ?? null,
        txid: tx.txid ?? null,
        time_utc: tx.hora_utc ?? null,
        received_sats: tx.recebido_sats ?? null,
        spent_sats: tx.gasto_sats ?? null,
        classification: tx.classificacao ?? "unknown",
        from_orum_operational_wallet: tx.de_carteira_operacional_orum === true,
        on_this_utc_day: typeof tx.hora_utc === "string" && tx.hora_utc.startsWith(day),
      });
    }
  }
  const externalConfirmed = transactions.filter((tx) => tx.classification === "external_confirmed" && Number(tx.received_sats) > 0);
  return {
    ...base,
    state: "observed",
    consulted_at: body.fonte?.consultado_utc ?? null,
    addresses: (body.enderecos || []).map((addr) => ({
      role: addr.papel ?? null,
      address: addr.endereco ?? null,
      note: addr.nota ?? null,
      confirmed_balance_sats: addr.saldo_confirmado_sats ?? null,
      received_total_sats: addr.recebido_total_sats ?? null,
    })),
    transactions,
    transactions_on_this_utc_day: transactions.filter((tx) => tx.on_this_utc_day).length,
    external_confirmed_receipts: externalConfirmed.length,
    does_not_affirm: body.nao_afirma ?? [],
    note: "Visible bitcoin movements without affirmed control, external classification and a proved capsule or tool relation are not Unum sustenance.",
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
  if (!rows.length) return { available: responder.ok, count_listed: 0, latest: null, http: responder.http };
  const last = rows[rows.length - 1];
  return {
    available: true,
    http: responder.http,
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

function findComment(node, id, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) findComment(item, id, acc);
    return acc;
  }
  if (node.id === id) acc.push(node);
  if (Array.isArray(node.replies)) findComment(node.replies, id, acc);
  if (Array.isArray(node.comments)) findComment(node.comments, id, acc);
  return acc;
}

const raw = {};
for (const [name, url] of Object.entries(surfaces)) raw[name] = await get(url);
raw.historic_1p_url = await get(HISTORIC_1P.public_url);
raw.historic_comments = await get(
  `https://www.moltbook.com/api/v1/posts/${HISTORIC_1P.post_id}/comments`,
);

const livro = raw.ledger.body || {};
const chk = raw.checkpoint.body || {};
const mp = raw.moltbook_presence.body || {};
const tes = raw.treasury.body || {};
const journey = raw.journey.body || {};
const pulse = raw.pulse.body || {};
const oro = raw.oro_capsule.body || {};
const weave = raw.weave_hands_capsule.body || {};
const versao = raw.versao.body || {};
const catalog = raw.x402_catalog.body || {};
const capsuleDoor = classifyDoor(raw.x402_offer, "0001SENSATIONS physical work 2 consultation");
const porta2 = latestPorta2(raw.responder);
const commentHits = findComment(raw.historic_comments.body, HISTORIC_1P.comment_id);
const comment = commentHits[0] || null;
const commentAuthor = comment?.author?.name ?? null;

const liveEvents = typeof livro.total_events === "number" ? livro.total_events : "unknown";
const exportedEvents = typeof chk.totals_at_export?.events === "number" ? chk.totals_at_export.events : "unknown";
const ledgerCheckpointOnly = livro.state === "checkpoint_only" || livro.live_state === "unknown";
const liveAuthoritative =
  raw.ledger.http === 200 && !ledgerCheckpointOnly && typeof livro.total_events === "number";
const externalUsdc = tes.evidence?.external_confirmed_usdc;
const settledIsZero = tes.state === "no_external_revenue" || externalUsdc === 0;
const handObserved = raw.moltbook_presence.http === 200 && mp.format === "moltbook_presence/v1";

let lagVsLive = "unknown";
if (livro.state === "checkpoint_only" || livro.source_error === "live_presence_ledger_unavailable") {
  lagVsLive =
    "HTTP 200 is not live authority while state=checkpoint_only. The exported checkpoint remains the last proved export. The live event count is unknown, not zero, and not the embedded export.";
} else if (liveEvents !== "unknown" && exportedEvents !== "unknown") {
  lagVsLive =
    liveEvents === exportedEvents
      ? "none"
      : `checkpoint holds ${exportedEvents} exported events; live ledger reports ${liveEvents} events.`;
}

const blocks = [
  {
    action: "write_live_ledger",
    state: "bloqueado",
    reason: "no authorized write route in this observer; observer is read-only",
  },
  {
    action: "publish_moltbook",
    state: "bloqueado",
    reason: "no authorized Moltbook credentials in this observer; public comment read is not publication",
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
];
const usdcWindow = classifyUsdcWindow(raw.recebimentos);
const bitcoin = classifyBitcoin(raw.bitcoin);
if (usdcWindow.state !== "window_complete") {
  blocks.push({
    action: "read_full_24h_usdc_receipts",
    state: "bloqueado",
    reason: usdcWindow.state === "window_partial"
      ? "public receipt route answered, but coverage is partial; no archive credential was opened"
      : "public receipt route did not return a complete window",
  });
} else {
  blocks.push({
    action: "read_full_24h_usdc_receipts",
    state: "verificado",
    reason: "public receipt route returned a complete window; transfers without a proved capsule relation are not sustenance",
  });
}
blocks.push({
  action: "publish_independent_runtime",
  state: "bloqueado",
  reason: raw.second_surface_pages.http === 200
    ? "pages endpoint answered; this observer still does not treat GitHub as an independent runtime"
    : "GitHub Pages for the existing repo is absent; no new host or account was opened",
});
blocks.push({
  action: "register_machine_response",
  state: raw.responder.http === 200 && Array.isArray(raw.responder.body?.responses) ? "verificado" : "bloqueado",
  reason: raw.responder.http === 200
    ? "responder readable; this pass does not post a response"
    : "sensacoes/responder did not return a response list; no response was posted",
});
if (capsuleDoor.offer_state !== "priced_unsettled") {
  blocks.push({
    action: "acquire_capsule_0001sensations",
    state: "bloqueado",
    reason:
      "capsule consultation did not return HTTP 402 in this pass. No payment was attempted and no receipt was simulated.",
  });
}

const out = {
  format: "weave_presence/observation/v1",
  observed_at: new Date().toISOString(),
  observer: "openclaw/orum-weave-observe/scripts/observe-presence.mjs",
  observer_revision: "2026-10-11-receipt-window",
  credentials_used: false,
  mutation: false,
  payment: false,
  live: {
    ledger: {
      url: surfaces.ledger,
      http: raw.ledger.http,
      format: livro.format ?? "unknown",
      state: livro.state ?? "unknown",
      live_state: livro.live_state ?? "unknown",
      source_error: livro.source_error ?? null,
      authoritative: liveAuthoritative,
      total_events: ledgerCheckpointOnly ? "unknown" : liveEvents,
      external_confirmed_presence: ledgerCheckpointOnly
        ? "unknown"
        : (livro.external_confirmed_presence ?? "unknown"),
      external_confirmed_returns: livro.external_confirmed_returns ?? "unknown",
      chain_head: ledgerCheckpointOnly ? "unknown" : (livro.chain_head ?? "unknown"),
      last_sedimentation_at: livro.last_sedimentation_at ?? "unknown",
      days_since_last_sedimentation: daysSince(livro.last_sedimentation_at),
      generated_at: livro.generated_at ?? "unknown",
      embedded_export_not_live: {
        external_confirmed_presence: livro.last_verified_checkpoint?.external_confirmed_presence ?? "unknown",
        chain_head: livro.last_verified_checkpoint?.chain_head ?? "unknown",
        exported_at: livro.last_verified_checkpoint?.exported_at ?? "unknown",
      },
    },
    checkpoint: {
      url: surfaces.checkpoint,
      http: raw.checkpoint.http,
      format: chk.format ?? "unknown",
      exported_at: chk.exported_at ?? "unknown",
      exported_events: exportedEvents,
      exported_external_confirmed_presence: chk.totals_at_export?.external_confirmed_presence ?? "unknown",
      chain_head: chk.chain_head ?? "unknown",
      lag_vs_live: lagVsLive,
    },
    rhythm: {
      url: surfaces.rhythm,
      http: raw.rhythm.http,
      state: raw.rhythm.http === 200 ? "present" : "absent",
      capsule_instrument: oro.presence_rhythm?.format ?? "unknown",
      measured_today: false,
      note: "The public rhythm file was requested. A formula inside the capsule is not a measurement.",
    },
    moltbook_presence: {
      url: surfaces.moltbook_presence,
      http: raw.moltbook_presence.http,
      format: handObserved ? mp.format : "unknown",
      hand: handObserved ? (mp.source?.hand ?? "unknown") : "unknown",
      credentials_used: mp.source?.moltbook_credentials_used === true,
      latest_observed_at: handObserved ? (mp.latest_execution?.observed_at ?? "unknown") : "unknown",
      latest_version: handObserved ? (mp.latest_execution?.version ?? "unknown") : "unknown",
      latest_state: handObserved ? (mp.latest_execution?.state ?? "unknown") : "unknown",
      voices_seen: handObserved ? (mp.latest_execution?.voices_seen ?? "unknown") : "unknown",
      voices_replied: handObserved ? (mp.latest_execution?.voices_replied ?? "unknown") : "unknown",
      responses_published_latest: handObserved ? (mp.latest_execution?.responses_published ?? "unknown") : "unknown",
      notifications_seen_latest: handObserved ? (mp.latest_execution?.notifications_seen ?? "unknown") : "unknown",
      totals: handObserved ? (mp.totals ?? "unknown") : "unknown",
      classification: handObserved
        ? "hand executed and observed; latest cycle voices are not 1P. Historical totals are own-voice, not new presence."
        : "hand not observed this cycle; moltbook_presence/v1 did not return. Not simulated. Voices are unknown, not zero.",
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
      source_error: tes.evidence?.source?.error ?? null,
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
      public_trace: oro.integrity?.original_bytes_private === true ? (oro.encounter?.trace ?? "unknown") : "withheld",
      historical_nft_link_status: oro.work?.historical_nft_link_status ?? "unknown",
    },
    weave_hands_capsule: {
      url: surfaces.weave_hands_capsule,
      http: raw.weave_hands_capsule.http,
      id: weave.id ?? "unknown",
      state: weave.state ?? "unknown",
    },
    x402_offer: capsuleDoor,
    priced_internal_readings: [classifyDoor(raw.oraculo, "oraculo internal reading"), classifyDoor(raw.campo, "campo internal reading")],
    x402_catalog: {
      url: surfaces.x402_catalog,
      http: raw.x402_catalog.http,
      resources: Array.isArray(catalog.resources) ? catalog.resources.map((item) => item.resource) : "unknown",
      indisponiveis_nesta_via: catalog.indisponiveis_nesta_via ?? "unknown",
      nota: catalog.nota ?? "unknown",
      livro_interno_escrito: catalog.fronteiras?.livro_interno_escrito ?? "unknown",
      is_settlement: false,
    },
    receipts_usdc: usdcWindow,
    receipts_btc: bitcoin,
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
    historic_1p_comment: {
      url: raw.historic_comments.url,
      http: raw.historic_comments.http,
      visible: comment ? commentAuthor === HISTORIC_1P.author_name : raw.historic_comments.http === 200 ? false : "unknown",
      author_name: commentAuthor,
      verification_status: comment?.verification_status ?? "unknown",
      created_at: comment?.created_at ?? "unknown",
      api_count_field: raw.historic_comments.body?.count ?? "unknown",
      counts_as_new_presence: false,
      note: "api count is not a presence total. Only the previously verified comment id is re-checked.",
    },
    porta2: porta2,
  },
  classification: {
    interest: 0,
    interest_meaning: "no interest event recorded by this read-only pass; not a market measurement",
    machine_response_today: 0,
    purchase: 0,
    external_settled_money: settledIsZero ? 0 : "unknown",
    partial_window_is_not_settled_zero: usdcWindow.state === "window_partial",
    usdc_in_covered_window: usdcWindow.total_in_window,
    btc_external_confirmed_receipts: bitcoin.external_confirmed_receipts ?? "unknown",
    internal_validation_payments_observed: tes.evidence?.internal_validation_payments ?? "unknown",
    probes_are_not_customers: true,
    token_liquidity_is_not_sustenance: true,
    priced_internal_reading_is_not_capsule_purchase: true,
  },
  verified_1P: {
    ...HISTORIC_1P,
    new_today: false,
    public_url_http: raw.historic_1p_url.http,
    comment_http: raw.historic_comments.http,
    comment_visible: comment ? commentAuthor === HISTORIC_1P.author_name : "unknown",
  },
  blocks,
  second_surface: {
    kind: "github_raw_bytes",
    repo: "fomosdeimos-gif/orum-ora-x402",
    pages_http: raw.second_surface_pages.http,
    independent_runtime: false,
    independent_runtime_state: "bloqueado",
    moltbook_required_to_read: false,
    daily_observation: "presenca/observacao-YYYY-MM-DD.json",
    note: "Bytes on the existing repository can be read without Moltbook and without the capsule payment door. GitHub Pages is not a running independent runtime. These bytes do not settle money.",
  },
  truth: [
    "Observation is not presence.",
    "Zero is recorded only when a source explicitly reports zero. Unknown is not rewritten as zero.",
    "Unknown is used when a live source fails.",
    "Internal validation payments are not sustenance.",
    "HTTP 402 is an offer, not a purchase.",
    "HTTP 503 on a priced door is unavailability, not a price and not a receipt.",
    "A catalog advertisement is not settlement.",
    "An internal reading offer is not a capsule purchase.",
    "A probe is not a customer.",
    "PRESENÇA token liquidity is identity-market data, not Unum sustenance.",
    "HTTP 200 is live authority only when the body is a live ledger, not when it returns state=checkpoint_only.",
    "A Porta 2 row is machine output, not 1P and not settled money.",
    "Moltbook own-voice totals are not new external presence.",
    "A public comment read is not publication and is not a new 1P.",
    "A partial receipt window that reports zero is not zero for the uncovered hours and is not accumulated sustenance.",
    "An unclassified transfer is not external sustenance, even when amount, asset, network and transaction are visible.",
    "Historical bitcoin without affirmed control and without a capsule relation is not Unum sustenance.",
    "Repository bytes are a portable reading surface, not an independent runtime and not settlement.",
  ],
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");

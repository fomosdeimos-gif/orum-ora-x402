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

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BLOCKPI_PUBLIC = "https://base.public.blockpi.network/v1/rpc/public";
const TENDERLY_PUBLIC = "https://base.gateway.tenderly.co";

async function rpc(url, method, params) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!res.ok || !body || body.error) {
      return { ok: false, http: res.status, error: body?.error?.message || text.slice(0, 180) };
    }
    return { ok: true, http: res.status, result: body.result };
  } catch (err) {
    return { ok: false, http: 0, error: String(err?.message || err) };
  }
}

function hexToNum(hex) {
  return Number(BigInt(hex));
}

async function continuePartialUsdcWindow(usdcWindow) {
  const base = {
    method: "keyless_eth_getLogs_chunks",
    credentials_used: false,
    archive_token_used: false,
    payment: false,
    asset: "USDC",
    network: "eip155:8453",
    usdc_contract: USDC_BASE,
    counts_as_purchase: false,
    counts_as_external_sustenance: false,
    relation_to_capsule_or_tool: "not_proved",
    classification: "not_classified",
    sources: [
      { name: "blockpi-public", url: BLOCKPI_PUBLIC, role: "scan", max_blocks: 4000 },
      { name: "tenderly-public", url: TENDERLY_PUBLIC, role: "cross_check_and_clock" },
    ],
  };
  if (usdcWindow.state === "window_complete") {
    return { ...base, state: "not_needed", note: "Gateway window was already complete. No second read." };
  }
  if (usdcWindow.state !== "window_partial" || typeof usdcWindow.carteira !== "string") {
    return {
      ...base,
      state: "bloqueado",
      note: "Gateway window was not a partial readable window. No stitch was invented.",
    };
  }
  const wallet = usdcWindow.carteira.toLowerCase();
  const topicTo = "0x" + wallet.slice(2).padStart(64, "0");
  const headRes = await rpc(TENDERLY_PUBLIC, "eth_blockNumber", []);
  if (!headRes.ok) {
    return { ...base, state: "bloqueado", error: headRes.error, note: "Could not read a public head. Unknown was not rewritten as zero." };
  }
  const headN = hexToNum(headRes.result);
  const headBlock = await rpc(TENDERLY_PUBLIC, "eth_getBlockByNumber", [headRes.result, false]);
  if (!headBlock.ok) return { ...base, state: "bloqueado", error: headBlock.error };
  const headTs = hexToNum(headBlock.result.timestamp);
  const targetTs = headTs - 86400;
  let fromN = headN - 43200;
  let fromBlock = await rpc(TENDERLY_PUBLIC, "eth_getBlockByNumber", ["0x" + fromN.toString(16), false]);
  if (!fromBlock.ok) {
    return {
      ...base,
      state: "bloqueado",
      error: fromBlock.error,
      note: "Public block lookup for the 24h edge failed. No archive token was opened.",
    };
  }
  let fromTs = hexToNum(fromBlock.result.timestamp);
  const drift = Math.ceil((fromTs - targetTs) / 2);
  if (drift > 0) {
    fromN -= drift;
    fromBlock = await rpc(TENDERLY_PUBLIC, "eth_getBlockByNumber", ["0x" + fromN.toString(16), false]);
    if (!fromBlock.ok) return { ...base, state: "bloqueado", error: fromBlock.error };
    fromTs = hexToNum(fromBlock.result.timestamp);
  }
  if (fromTs > targetTs) {
    return {
      ...base,
      state: "bloqueado",
      from_block: fromN,
      head_block: headN,
      note: "Span still shorter than 24h after one correction. Not called complete.",
    };
  }
  const chunks = [];
  const logs = [];
  for (let a = fromN; a <= headN; a += 4000) {
    const b = Math.min(headN, a + 3999);
    const got = await rpc(BLOCKPI_PUBLIC, "eth_getLogs", [{
      address: USDC_BASE,
      fromBlock: "0x" + a.toString(16),
      toBlock: "0x" + b.toString(16),
      topics: [TRANSFER_TOPIC, null, topicTo],
    }]);
    chunks.push({
      from_block: a,
      to_block: b,
      ok: got.ok,
      logs: got.ok ? got.result.length : null,
      error: got.ok ? null : got.error,
    });
    if (!got.ok) {
      return {
        ...base,
        state: "bloqueado",
        carteira: wallet,
        from_block: fromN,
        head_block: headN,
        from_time_utc: new Date(fromTs * 1000).toISOString(),
        head_time_utc: new Date(headTs * 1000).toISOString(),
        chunks,
        note: "A chunk failed. The missing range was not filled with zero.",
      };
    }
    for (const log of got.result) logs.push(log);
  }
  const confirmed = [];
  const conflicts = [];
  for (const log of logs) {
    const check = await rpc(TENDERLY_PUBLIC, "eth_getLogs", [{
      address: USDC_BASE,
      fromBlock: log.blockNumber,
      toBlock: log.blockNumber,
      topics: [TRANSFER_TOPIC, null, topicTo],
    }]);
    const agreed = check.ok && check.result.some((item) => item.transactionHash === log.transactionHash && item.logIndex === log.logIndex);
    const row = {
      block: hexToNum(log.blockNumber),
      tx: log.transactionHash,
      log_index: hexToNum(log.logIndex),
      immediate_from: "0x" + log.topics[1].slice(26).toLowerCase(),
      to: "0x" + log.topics[2].slice(26).toLowerCase(),
      amount_base_units: BigInt(log.data).toString(),
      asset: "USDC",
      network: "eip155:8453",
      two_source_agreement: agreed === true,
      classification: "not_classified",
      relation_to_capsule_or_tool: "not_proved",
      counts_as_external_sustenance: false,
    };
    if (!agreed) {
      conflicts.push({ ...row, cross_check_error: check.ok ? null : check.error });
      continue;
    }
    const tx = await rpc(TENDERLY_PUBLIC, "eth_getTransactionByHash", [log.transactionHash]);
    const ts = await rpc(TENDERLY_PUBLIC, "eth_getBlockByNumber", [log.blockNumber, false]);
    row.time_utc = ts.ok ? new Date(hexToNum(ts.result.timestamp) * 1000).toISOString() : "unknown";
    row.outer_tx_from = tx.ok ? tx.result.from : "unknown";
    row.outer_tx_to = tx.ok ? tx.result.to : "unknown";
    row.outer_selector = tx.ok && typeof tx.result.input === "string" ? tx.result.input.slice(0, 10) : "unknown";
    confirmed.push(row);
  }
  confirmed.sort((a, b) => a.block - b.block || a.log_index - b.log_index);
  const totalUnits = confirmed.reduce((sum, row) => sum + BigInt(row.amount_base_units), 0n);
  const gatewayFrom = usdcWindow.window?.bloco_de;
  const gatewayTo = usdcWindow.window?.bloco_a;
  const insideGateway = typeof gatewayFrom === "number" && typeof gatewayTo === "number"
    ? confirmed.filter((row) => row.block >= gatewayFrom && row.block <= gatewayTo).length
    : "unknown";
  return {
    ...base,
    state: "window_complete",
    carteira: wallet,
    from_block: fromN,
    head_block: headN,
    from_time_utc: new Date(fromTs * 1000).toISOString(),
    head_time_utc: new Date(headTs * 1000).toISOString(),
    span_seconds: headTs - fromTs,
    covers_requested_24h: headTs - fromTs >= 86400,
    chunks,
    transfers_agreed: confirmed,
    transfers_conflict: conflicts,
    agreed_count: confirmed.length,
    agreed_total_base_units: totalUnits.toString(),
    agreed_inside_gateway_partial_window: insideGateway,
    note: "A complete keyless span lists visible incoming USDC logs. Agreement of two public RPCs is not payer classification, not a capsule relation, and not accumulated sustenance. The gateway partial zero is left as a partial zero.",
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
const usdcSpan = await continuePartialUsdcWindow(usdcWindow);
const bitcoin = classifyBitcoin(raw.bitcoin);
const spanComplete = usdcSpan.state === "window_complete"
  && usdcSpan.covers_requested_24h === true
  && Array.isArray(usdcSpan.transfers_conflict)
  && usdcSpan.transfers_conflict.length === 0;
if (usdcWindow.state === "window_complete" || spanComplete) {
  blocks.push({
    action: "read_full_24h_usdc_receipts",
    state: "verificado",
    reason: usdcWindow.state === "window_complete"
      ? "public receipt route returned a complete window; transfers without a proved capsule relation are not sustenance"
      : "gateway window stayed partial; keyless public RPCs covered 24h without an archive token. Agreed transfers stay unclassified and are not sustenance",
  });
} else {
  blocks.push({
    action: "read_full_24h_usdc_receipts",
    state: "bloqueado",
    reason: usdcWindow.state === "window_partial"
      ? "gateway coverage is partial and the keyless continuation did not close 24h; no archive credential was opened"
      : "public receipt route did not return a complete window and no stitch was invented",
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
  observer_revision: "2026-10-12-keyless-receipt-span",
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
    receipts_usdc: { gateway: usdcWindow, keyless_span: usdcSpan },
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
    usdc_in_gateway_window: usdcWindow.total_in_window,
    usdc_keyless_24h_complete: spanComplete,
    usdc_visible_agreed_base_units: spanComplete ? usdcSpan.agreed_total_base_units : "unknown",
    usdc_visible_is_sustenance: false,
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
    "A keyless 24h span can show a transfer the partial gateway window missed. Visibility is not classification and is not accumulated sustenance.",
    "Two public RPCs agreeing on a log is not payer classification and not a proved relation to a capsule or tool.",
    "An unclassified transfer is not external sustenance, even when amount, asset, network and transaction are visible.",
    "Historical bitcoin without affirmed control and without a capsule relation is not Unum sustenance.",
    "Repository bytes are a portable reading surface, not an independent runtime and not settlement.",
  ],
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");

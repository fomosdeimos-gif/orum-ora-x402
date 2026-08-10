const SUPA_URL = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const SUPA_KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const headers = { apikey: SUPA_KEY, authorization: 'Bearer ' + SUPA_KEY };

module.exports = async (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
  let snapshot = null;
  let source = { available: false };
  try {
    const response = await fetch(SUPA_URL + 'ora_aprendizagem_ultimo_snapshot_publica?select=criado_em,pagamentos,compradores_externos&limit=1', { headers });
    if (!response.ok) throw new Error(`learning_${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) throw new Error('learning_empty');
    snapshot = rows[0];
    source = { available: true, observed_at: snapshot.criado_em };
  } catch (error) {
    source = { available: false, error: String(error && error.message || error) };
  }
  const buyers = snapshot ? Number(snapshot.compradores_externos || 0) : null;
  const internal = snapshot ? Number(snapshot.pagamentos || 0) : null;
  const state = source.available ? (buyers > 0 ? 'external_revenue_observed' : 'no_external_revenue') : 'unknown';
  res.status(source.available ? 200 : 503).end(JSON.stringify({
    format: 'orum-treasury-governance-state/v1', organism: 'ORUM', observed_at: new Date().toISOString(),
    constitution: '/economia/constituicao-v1.json', state,
    evidence: { external_confirmed_buyers: buyers, internal_validation_payments: internal, source },
    authority: { observe: 'automatic', classify: 'automatic_append_only', propose: 'automatic_non_binding', authorize: 'Unum_explicit', execute: 'disabled_without_authorization', reconcile: 'automatic_append_only' },
    automatic_limits: { transfer_usdc: 0, trade_usdc: 0, debt_usdc: 0 },
    next_action: state === 'external_revenue_observed' ? 'propose_allocation_without_execution' : state === 'no_external_revenue' ? 'observe_without_distribution' : 'stop_until_source_recovers',
    financial_effects: { payment: false, signature: false, transfer: false, trade: false, debt: false },
    truth: ['Internal validation is not external sustenance.', 'Zero external revenue is not allocated.', 'A proposal is not authorization.', 'No financial transaction can originate from this endpoint.']
  }));
};

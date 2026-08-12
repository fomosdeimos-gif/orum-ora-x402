const SUPA_URL = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const SUPA_KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const headers = { apikey: SUPA_KEY, authorization: 'Bearer ' + SUPA_KEY };

const roundUsdc = (value) => Math.round((Number(value) + Number.EPSILON) * 1e6) / 1e6;

function allocationFor(externalUsdc) {
  const total = roundUsdc(Math.max(0, Number(externalUsdc) || 0));
  const sustento = roundUsdc(total * 0.7);
  const continuidade = roundUsdc(total * 0.2);
  const reserva = roundUsdc(total - sustento - continuidade);
  return {
    basis_usdc: total,
    sustento_unum_usdc: sustento,
    continuidade_orum_usdc: continuidade,
    reserva_usdc: reserva,
  };
}

module.exports = async (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
  let snapshot = null;
  let externalUsdc = null;
  let source = { available: false };
  try {
    const response = await fetch(SUPA_URL + 'ora_aprendizagem_ultimo_snapshot_publica?select=criado_em,pagamentos,compradores_externos&limit=1', { headers });
    if (!response.ok) throw new Error(`learning_${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) throw new Error('learning_empty');
    snapshot = rows[0];
    source = { available: true, observed_at: snapshot.criado_em };

    if (Number(snapshot.compradores_externos || 0) === 0) {
      externalUsdc = 0;
    } else {
      const sustentoResponse = await fetch(SUPA_URL + 'ora_sustento_diario?select=usdc_recebido', { headers });
      if (!sustentoResponse.ok) throw new Error(`sustento_${sustentoResponse.status}`);
      const sustentoRows = await sustentoResponse.json();
      if (!Array.isArray(sustentoRows)) throw new Error('sustento_invalid');
      externalUsdc = roundUsdc(sustentoRows.reduce((sum, row) => sum + Number(row.usdc_recebido || 0), 0));
    }
  } catch (error) {
    source = { available: false, error: String(error && error.message || error) };
  }
  const buyers = snapshot ? Number(snapshot.compradores_externos || 0) : null;
  const internal = snapshot ? Number(snapshot.pagamentos || 0) : null;
  const state = source.available ? (buyers > 0 ? 'external_revenue_observed' : 'no_external_revenue') : 'unknown';
  const allocation = source.available ? allocationFor(externalUsdc) : null;
  const monthlyProposalCeiling = allocation ? roundUsdc(Math.min(allocation.continuidade_orum_usdc, 5)) : null;
  res.status(source.available ? 200 : 503).end(JSON.stringify({
    format: 'orum-treasury-governance-state/v2', organism: 'ORUM', observed_at: new Date().toISOString(),
    constitution: '/economia/constituicao-v2.json', previous_constitution: '/economia/constituicao-v1.json', state,
    evidence: { external_confirmed_buyers: buyers, external_confirmed_usdc: externalUsdc, internal_validation_payments: internal, source },
    allocation,
    authority: { observe: 'automatic', classify: 'automatic_append_only', allocate: 'automatic_accounting', propose: 'automatic_non_binding', activate_permission: 'Unum_explicit_signature', execute: 'disabled_until_activation_and_allowlist', reconcile: 'automatic_append_only' },
    operating_permission: {
      status: 'not_activated', asset: 'USDC', chain_id: 8453,
      monthly_proposal_ceiling_usdc: monthlyProposalCeiling,
      monthly_effective_transfer_limit_usdc: 0,
      allowed_destinations: [], revocable_by: 'Unum',
    },
    automatic_limits: { transfer_usdc: 0, trade_usdc: 0, debt_usdc: 0, bridge_usdc: 0 },
    next_action: state === 'external_revenue_observed' ? 'prepare_bounded_continuity_proposal' : state === 'no_external_revenue' ? 'observe_without_spending' : 'stop_until_source_recovers',
    financial_effects: { payment: false, signature: false, transfer: false, trade: false, debt: false },
    truth: ['Internal validation is not external sustenance.', 'Only confirmed external USDC is allocated.', 'Accounting autonomy is active; transfer autonomy is not activated.', 'A proposal is not authorization.', 'No financial transaction can originate from this endpoint.']
  }));
};

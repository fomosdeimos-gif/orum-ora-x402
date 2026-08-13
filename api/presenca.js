const SUPA_URL = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const SUPA_KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const checkpoint = require('../presenca/checkpoint-v1.json');

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
  const requested = Number(req.query && req.query.limit || 20);
  const limit = Math.max(1, Math.min(Number.isFinite(requested) ? Math.trunc(requested) : 20, 100));
  try {
    const response = await fetch(SUPA_URL + 'rpc/ora_presenca_livro_publico', {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        authorization: 'Bearer ' + SUPA_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_limit: limit }),
    });
    if (!response.ok) throw new Error(`presence_ledger_${response.status}`);
    const body = await response.json();
    res.status(200).end(JSON.stringify(body));
  } catch (error) {
    res.status(200).end(JSON.stringify({
      format: 'orum-presence-ledger/v1',
      organism: 'ORUM',
      state: 'checkpoint_only',
      live_state: 'unknown',
      external_confirmed_presence: null,
      last_verified_checkpoint: { href: '/presenca/checkpoint-v1.json', exported_at: checkpoint.exported_at, external_confirmed_presence: checkpoint.totals_at_export.external_confirmed_presence, chain_head: checkpoint.chain_head, events: checkpoint.events },
      source_error: 'live_presence_ledger_unavailable',
      truth: 'O checkpoint preserva o ultimo estado provado; indisponibilidade torna o presente unknown, nunca zero.',
    }));
  }
};

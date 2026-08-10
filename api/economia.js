// ORUM · percurso económico verificável.
// Agrega apenas fontes públicas e devolve contagens, nunca carteiras ou tx hashes.
const SUPA_URL = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const SUPA_KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const headers = { apikey: SUPA_KEY, authorization: 'Bearer ' + SUPA_KEY };
const norm = (value) => String(value || '').trim().toLowerCase();

async function rows(path) {
  const response = await fetch(SUPA_URL + path, { headers });
  if (!response.ok) throw new Error(`${path.split('?')[0]}_${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error(`${path.split('?')[0]}_invalid`);
  return body;
}

module.exports = async (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
  const sources = {};
  const load = async (name, path) => {
    try {
      const value = await rows(path);
      sources[name] = { available: true, rows: value.length };
      return value;
    } catch (error) {
      sources[name] = { available: false, error: String(error && error.message || error) };
      return null;
    }
  };

  const [snapshots, licenses, classifications] = await Promise.all([
    load('learning', 'ora_aprendizagem_ultimo_snapshot_publica?select=criado_em,acessos_externos,pagamentos,compradores_externos&limit=1'),
    load('deliveries', 'ora_licencas_fisicas?select=licenciado,tx_hash&limit=10000'),
    load('classifications', 'ora_carteiras_classificacao?select=endereco,classificacao&limit=10000'),
  ]);

  const allAvailable = Object.values(sources).every((source) => source.available);
  const snapshot = snapshots && snapshots[0] || null;
  const classByWallet = new Map((classifications || []).map((item) => [norm(item.endereco), item.classificacao]));
  const externalWallets = new Set([...classByWallet.entries()]
    .filter(([, value]) => value === 'externo_confirmado').map(([wallet]) => wallet));
  const physicalDeliveries = licenses || [];
  const externalDelivered = physicalDeliveries.filter((item) => externalWallets.has(norm(item.licenciado)));

  const value = (available, number) => available ? number : null;
  const learningAvailable = sources.learning.available && snapshot !== null;
  const deliverySourcesAvailable = sources.deliveries.available && sources.classifications.available;
  const probes = value(learningAvailable, Number(snapshot && snapshot.acessos_externos || 0));
  const buyers = value(learningAvailable, Number(snapshot && snapshot.compradores_externos || 0));
  const paid = buyers;
  const delivered = value(deliverySourcesAvailable, externalDelivered.length);
  // Com zero compradores externos, regresso externo é necessariamente zero.
  // Depois do primeiro, permanece unknown até existir uma fonte pública de recorrência económica por comprador.
  const returning = buyers === 0 ? 0 : null;
  const stage = (count, evidence) => ({ status: count === null ? 'unknown' : count > 0 ? 'observed' : 'zero', count, evidence });

  res.status(allAvailable ? 200 : 503).end(JSON.stringify({
    format: 'orum-economic-journey/v1',
    organism: 'ORUM',
    observed_at: new Date().toISOString(),
    journey: {
      probe: stage(probes, 'latest public learning snapshot; internal traffic excluded by the organism classifier'),
      payment: stage(paid, 'externally confirmed buyers in the latest public learning snapshot'),
      delivery: stage(delivered, 'physical licenses whose licensed wallet is explicitly classified external_confirmed'),
      return: stage(returning, buyers === 0 ? 'zero external buyers makes external return zero' : 'no public buyer-level recurrence aggregate exists yet'),
    },
    external_confirmed_buyers: buyers,
    complete_external_cycles: delivered === null || returning === null ? null : Math.min(delivered, returning),
    learning_snapshot_at: snapshot && snapshot.criado_em || null,
    internal_validation_payments: value(learningAvailable, Number(snapshot && snapshot.pagamentos || 0)),
    sources,
    privacy: { wallets_exposed: false, transaction_hashes_exposed: false, raw_ip_exposed: false, aggregate_counts_only: true },
    truth: [
      'A probe is not a customer.',
      'An unknown wallet is never promoted to external by default.',
      'Payment without a linked physical license is not delivery.',
      'A later technical request is not economic return; return requires another verified payment by the same externally confirmed wallet.',
      'Internal validation remains internal even when the mechanism works end to end.',
      'Unknown remains unknown when a required source cannot be read.'
    ]
  }));
};

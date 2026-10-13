// ORA · resposta de recurso quando o Supabase falha (quota de egress, ora_mudancas #848/#849).
// Serve uma copia estatica, sempre marcada como desactualizada. Nunca finge leitura viva:
// o que e calculavel sem base (campo) e calculado agora; o resto vem de presenca/snapshot-publico.json.
const snap = require('../presenca/snapshot-publico.json');
const { campoEm } = require('./_x402-directo');

const STALE = () => ({
  estado: 'snapshot_desactualizado',
  fonte: 'presenca/snapshot-publico.json',
  snapshot_observado_em: snap.observado_em,
  idade_s: Math.max(0, Math.round((Date.now() - Date.parse(snap.observado_em)) / 1000)),
  aviso: snap.nota,
});

function pulso(now = Date.now()) {
  const c = campoEm(now);
  const eventos = snap.pulso.pagamentos.map((p) => ({
    tipo: 'pagamento',
    quando: p.registado_em,
    detalhe: `${(Number(p.amount) / 1e6).toFixed(3)} ${p.currency} · tx ${p.tx_hash.slice(0, 10)}…`,
  }));
  return {
    campo: { dia: c.dia, epoca: c.epoca, sigma: c.sigma, iso: c.instante },
    eventos,
    acessos: { ultimo_registo: snap.pulso.acessos_ultimo_registo, congelados_desde: snap.pulso.acessos_congelados_desde },
    timestamp: new Date(now).toISOString(),
    ...STALE(),
  };
}

function previsoes(now = Date.now()) {
  const l = snap.previsoes.latest;
  const left = Math.ceil((Date.parse(l.closes_at) - now) / 1000);
  return {
    schema: 'ora-previsoes/v2',
    observed_at: snap.observado_em,
    append_only: true,
    probability_truth: 'data_confidence_is_not_success_probability',
    stats: snap.previsoes.stats,
    latest: { ...l, lifecycle_status: left > 0 ? 'open_at_snapshot' : 'closure_unknown', seconds_until_close: Math.max(0, left), outcome: null },
    ...STALE(),
  };
}

module.exports = { pulso, previsoes };

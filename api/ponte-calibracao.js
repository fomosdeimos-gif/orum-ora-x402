'use strict';
const REST = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';
const SIGNAL = 'non_internal_payment_event_8h_v1';
const probability = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const count = n => Number.isSafeInteger(n) && n >= 0;
function present(data) {
  if (data?.schema !== 'orum-quantico-ponte/v1' || data.target_signal !== SIGNAL ||
      typeof data.comparavel !== 'boolean' || !count(data.n_previsoes_finais) || !count(data.n_amostras_quanticas) ||
      !Number.isFinite(Date.parse(data.observed_at))) throw new Error('invalid_source');
  const result = {
    schema: 'orum-comparacao-preditiva/v1', observed_at: data.observed_at,
    target_signal: SIGNAL, comparable: data.comparavel,
    source: { function: 'ora_quantico_ponte_calibracao_v1', schema: data.schema },
    method: 'Primeiras previsões finais emparelhadas, por ordem cronológica, com as primeiras amostras; mesma janela de resultados para todos os Brier.',
    provenance: { baseline: 'Simulação de circuito GHZ em Qiskit Aer', physical_quantum_hardware: false, evaluation: 'retrospective', changes_prediction_cycle: false },
    coverage: { final_predictions: data.n_previsoes_finais, simulation_samples: data.n_amostras_quanticas, paired: 0 },
    scores: null,
    limits: [
      'Aer é um simulador clássico de circuitos quânticos. Estas amostras não são medições de hardware quântico nem prova de aleatoriedade quântica física.',
      'Brier menor é melhor neste conjunto. Uma comparação retrospectiva com valores perto de 0,5 não demonstra aprendizagem, calibração ou desempenho futuro.',
      'Os eventos avaliados são sinais de pagamento, incluindo recusas; não são receita liquidada.',
      'A comparação usa no máximo o número de amostras disponíveis. Novas previsões podem ficar fora do conjunto comparado.'
    ]
  };
  if (!data.comparavel) {
    result.interpretation = 'Ainda não existem pares suficientes para comparar.';
    return result;
  }
  const n = data.n_pares_comparados;
  if (!count(n) || n < 1 || n > Math.min(data.n_previsoes_finais, data.n_amostras_quanticas) ||
      ![data.brier_modelo_preditivo, data.brier_linha_base_quantica, data.taxa_observada_real, data.media_valor_quantico].every(probability)) throw new Error('invalid_scores');
  result.coverage.paired = n;
  result.coverage.unpaired_predictions = data.n_previsoes_finais - n;
  result.scores = {
    model: data.brier_modelo_preditivo,
    aer_simulation: data.brier_linha_base_quantica,
    always_no_event: data.taxa_observada_real, // For y in {0,1}: (0-y)^2 = y.
    constant_half: 0.25 // For either binary outcome: (0.5-y)^2 = 0.25.
  };
  result.observed_event_rate = data.taxa_observada_real;
  result.simulation_mean = data.media_valor_quantico;
  result.sample_range = data.amostras_usadas || null;
  result.interpretation = data.taxa_observada_real === 0
    ? 'Nenhum evento ocorreu nestes pares. A referência fixa “nunca acontece” tem Brier 0. Superar a simulação perto de 0,5 não demonstra aprendizagem.'
    : 'Compare o modelo também com as referências fixas 0 e 0,5. Este conjunto retrospectivo, por si só, não demonstra aprendizagem nem vantagem quântica.';
  return result;
}
module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD'); res.statusCode = 405; res.end(JSON.stringify({error:'method_not_allowed'})); return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(REST + 'rpc/ora_quantico_ponte_calibracao_v1', {
      method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_target_signal: SIGNAL }), signal: controller.signal
    });
    if (!response.ok) throw new Error('source_unavailable');
    const data = present(await response.json());
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? '' : JSON.stringify(data));
  } catch (_) {
    res.statusCode = 503;
    res.end(req.method === 'HEAD' ? '' : JSON.stringify({error:'comparison_unavailable',message:'Comparação indisponível; ausência de dados não significa zero.'}));
  } finally { clearTimeout(timer); }
};
module.exports.present = present;

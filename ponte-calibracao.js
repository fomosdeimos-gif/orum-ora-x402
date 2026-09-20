(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const score = n => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-PT', {minimumFractionDigits:6,maximumFractionDigits:6}) : '—';
  const date = value => new Date(value).toLocaleString('pt-PT', {timeZone:'Europe/Lisbon'});
  ORUMLiveRefresh.start({
    interval: 60000,
    read: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('/api/ponte-calibracao', {cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error('comparison unavailable');
        const data = await response.json();
        if (data.schema !== 'orum-comparacao-preditiva/v1') throw new Error('invalid comparison');
        return data;
      } finally { clearTimeout(timer); }
    },
    render: data => {
      $('comparisonModel').textContent = score(data.scores?.model);
      $('comparisonAer').textContent = score(data.scores?.aer_simulation);
      $('comparisonZero').textContent = score(data.scores?.always_no_event);
      $('comparisonHalf').textContent = score(data.scores?.constant_half);
      $('comparisonMeaning').textContent = data.interpretation;
      $('comparisonCoverage').textContent = data.coverage.paired + ' pares comparados · ' + data.coverage.final_predictions + ' previsões finais disponíveis · ' + data.coverage.simulation_samples + ' amostras de simulação.';
      $('comparisonEventRate').textContent = typeof data.observed_event_rate === 'number' ? 'Eventos observados: ' + (100*data.observed_event_rate).toLocaleString('pt-PT',{maximumFractionDigits:4}) + '% dos pares. Sinal de pagamento não equivale a receita.' : 'Taxa de eventos ainda desconhecida.';
      $('comparisonLimit').textContent = data.coverage.unpaired_predictions > 0 ? data.coverage.unpaired_predictions + ' previsões finais ainda fora da comparação por falta de amostras. Os resultados apresentados referem-se aos primeiros pares.' : 'A comparação cresce apenas enquanto existirem amostras para emparelhar.';
      $('comparisonObserved').textContent = 'Cálculo na fonte: ' + date(data.observed_at) + ' (Lisboa).';
    },
    status: ({state,last}) => {
      const labels = {current:'Leitura recebida. Consulta automática a cada 60 s.',stale:'A atualização falhou. Os valores anteriores, se existirem, não estão confirmados agora.',offline:'Sem ligação. Os valores anteriores não estão confirmados agora.',paused:'Consulta suspensa enquanto a página está oculta.'};
      $('comparisonStatus').textContent = labels[state] + (last && state !== 'current' ? ' Última leitura: ' + date(last) + '.' : '');
    }
  });
})();

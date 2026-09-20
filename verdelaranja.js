(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const format = value => number(value) ? value.toLocaleString('pt-PT', { maximumFractionDigits: 6 }) : '—';
  const when = value => {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? date.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'hora desconhecida';
  };
  const old = (value, age) => !value || !Number.isFinite(Date.parse(value)) || Date.now() - Date.parse(value) > age;
  const sources = { pulse: null, treasury: null };
  let catalog = null;
  let catalogCurrent = false;
  let selected = null;
  let catalogBusy = false;
  let reader = null;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  async function getJSON(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function showWork(id) {
    const work = catalog.obras.find(item => item.id === Number(id));
    if (!work) return;
    selected = work;
    $('workSelect').value = String(work.id);
    $('workId').textContent = 'OBRA ' + String(work.id).padStart(3, '0');
    $('workTitle').textContent = work.titulo || 'Sem título declarado';
    $('workDescription').textContent = work.descricao_visivel || 'Esta obra ainda não tem um vestígio textual publicado.';
    $('workPosition').textContent = (catalog.obras.indexOf(work) + 1) + ' / ' + catalog.obras.length;
    $('workHash').textContent = work.sha256 || 'Hash não publicado';
    $('selectedWork').textContent = String(work.id).padStart(3, '0') + (work.titulo ? ' · ' + work.titulo : ' · Sem título declarado');
    renderLicenses();
  }
  function renderLicenses() {
    if (!catalogCurrent) {
      $('licenses').replaceChildren(el('p', 'Licenças por reconfirmar. Consulta o catálogo ou atualiza a leitura.'));
      return;
    }
    const nodes = [];
    const labels = { consulta: 'Para observar', editorial: 'Para publicar', treino: 'Para investigar' };
    for (const item of catalog.licencas) {
      if (!['consulta', 'editorial', 'treino'].includes(item.tipo)) continue;
      const card = el('article', undefined, 'license');
      card.append(el('h3', labels[item.tipo]), el('div', item.preco || 'Preço por consultar', 'license-price'));
      card.append(el('p', item.descricao || 'Consultar os termos no catálogo.'));
      card.append(el('p', 'Licença: ' + (item.duracao_da_licenca || 'duração não indicada') + '.', 'duration'));
      if (typeof selected.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(selected.sha256)) {
        // Same-origin fixed route; never trust arbitrary URLs from a catalogue.
        const query = new URLSearchParams({ obra: String(selected.id), sha256: selected.sha256 });
        const link = el('a', 'Abrir pedido x402 ↗');
        link.href = '/licenca/' + item.tipo + '?' + query;
        link.setAttribute('aria-label', 'Abrir pedido x402: ' + item.tipo + ', obra ' + selected.id);
        card.append(link);
      } else card.append(el('p', 'Pedido indisponível: falta o hash da obra.'));
      nodes.push(card);
    }
    $('licenses').replaceChildren(...(nodes.length ? nodes : [el('p', 'Não há licenças disponíveis nesta leitura do catálogo.') ]));
  }
  async function loadCatalog() {
    if (catalogBusy) return;
    catalogBusy = true;
    try {
      const data = await getJSON('/licenca');
      if (!Array.isArray(data.obras) || !data.obras.length || !Array.isArray(data.licencas)) throw new Error('Catálogo incompleto');
      data.obras = data.obras.filter(work => Number.isInteger(work.id) && work.id > 0);
      if (!data.obras.length) throw new Error('Sem obras válidas');
      catalog = data;
      catalogCurrent = true;
      const options = catalog.obras.map(work => {
        const option = el('option', String(work.id).padStart(3, '0') + (work.titulo ? ' · ' + work.titulo : ' · Sem título'));
        option.value = String(work.id);
        return option;
      });
      $('workSelect').replaceChildren(...options);
      const requested = Number(new URLSearchParams(location.search).get('obra'));
      const initial = selected?.id || (catalog.obras.some(work => work.id === requested) ? requested : (catalog.obras.find(work => work.id === 2) || catalog.obras[0]).id);
      showWork(initial);
      $('workSelect').disabled = false;
      $('nextWork').disabled = false;
      $('catalogStatus').textContent = 'Catálogo consultado às ' + when(Date.now()) + '. Fotografias privadas; esta amostra é textual.';
    } catch (_) {
      catalogCurrent = false;
      $('catalogStatus').textContent = 'Não foi possível atualizar o catálogo. ' + (catalog ? 'O vestígio anterior permanece; preços por reconfirmar na fonte.' : 'Podes tentar de novo em “Atualizar leitura” ou abrir a fonte.');
      // Never leave a stale commercial request actionable after failed refresh.
      $('licenses').replaceChildren(el('p', 'Licenças por reconfirmar. Consulta o catálogo ou atualiza a leitura.'));
    } finally { catalogBusy = false; }
  }
  function renderPulse(data) {
    if (!data || !data.campo || !data.sentinela || !data.convite) throw new Error('Pulso incompleto');
    sources.pulse = data;
    $('accessCount').textContent = format(data.convite.maquinas_reconhecidas_total);
    $('fieldDay').textContent = number(data.campo.dia) ? 'Dia ' + format(data.campo.dia) + ' do organismo' : 'Tempo do organismo desconhecido';
    $('sentinelState').textContent = data.sentinela.veredicto || 'Sem veredicto';
    $('sentinelDescription').textContent = data.sentinela.frase || 'A fonte não publicou uma descrição.';
    $('pulseSourceTime').textContent = 'Sentinela: ' + when(data.sentinela.verificado_em) + ' (Lisboa).';
    const seen = new Set();
    const entries = (Array.isArray(data.eventos) ? data.eventos : []).filter(event => {
      const key = JSON.stringify([event.tipo, event.quando, event.detalhe]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 3);
    $('events').replaceChildren(...entries.map(event => {
      const li = el('li');
      const time = el('time', when(event.quando));
      if (event.quando && Number.isFinite(Date.parse(event.quando))) time.dateTime = event.quando;
      li.append(time, el('span', event.detalhe || event.tipo || 'Evento sem descrição'));
      return li;
    }));
    if (!entries.length) $('events').append(el('li', 'Nenhum acontecimento nesta leitura.'));
    const stale = old(data.sentinela.verificado_em, 30 * 60 * 1000);
    $('pulseDot').className = 'status-dot ' + (stale ? 'stale' : 'observed');
    $('pulseSummary').textContent = stale ? 'Vigilância por atualizar' : 'Pulso consultado · ' + (data.sentinela.veredicto || 'sem veredicto');
    sourceStatus('pulse', stale ? 'stale' : 'current', 'Pulso: ' + (stale ? 'vigilância com mais de 30 min ou hora desconhecida.' : 'leitura recebida às ' + when(Date.now()) + '.'));
  }
  function renderTreasury(data) {
    if (!data?.evidence?.source?.available || !number(data.evidence.external_confirmed_usdc)) throw new Error('Contabilidade incompleta');
    sources.treasury = data;
    $('revenue').textContent = format(data.evidence.external_confirmed_usdc);
    const sourceTime = data.evidence.source.observed_at;
    sourceStatus('treasury', old(sourceTime, 24 * 60 * 60 * 1000) ? 'stale' : 'current', 'Contabilidade: dados da fonte de ' + when(sourceTime) + ' (Lisboa).' + (old(sourceTime, 24 * 60 * 60 * 1000) ? ' Leitura antiga ou hora desconhecida.' : ''));
  }
  function sourceStatus(name, state, text) {
    const target = $(name === 'pulse' ? 'pulseStatus' : 'treasuryStatus');
    target.textContent = text;
    target.dataset.state = state;
  }
  function failed(name) {
    sourceStatus(name, sources[name] ? 'stale' : 'unavailable', (name === 'pulse' ? 'Pulso' : 'Contabilidade') + ': atualização indisponível.' + (sources[name] ? ' Valores anteriores sem confirmação atual.' : ' Ainda sem leitura; “—” não significa zero.'));
    if (name === 'pulse') { $('pulseSummary').textContent = 'Pulso sem confirmação atual'; $('pulseDot').className = 'status-dot stale'; }
  }
  const tasks = [['pulse', '/pulso', renderPulse], ['treasury', '/economia/tesouraria.json', renderTreasury]];
  reader = ORUMLiveRefresh.start({
    read: () => Promise.allSettled(tasks.map(async ([, path]) => getJSON(path))),
    render: results => results.forEach((result, index) => {
      const [name, , render] = tasks[index];
      try { if (result.status !== 'fulfilled') throw result.reason; render(result.value); }
      catch (_) { failed(name); }
    }),
    status: ({ state }) => {
      const labels = { current: 'Consulta a cada 30 s enquanto a página está visível. Estado de cada fonte abaixo.', stale: 'A leitura falhou. Valores anteriores sem confirmação atual.', offline: 'Sem ligação. Os valores anteriores não estão confirmados agora.', paused: 'Leitura suspensa enquanto a página está oculta.' };
      $('refreshStatus').textContent = labels[state];
      if (state === 'offline' || state === 'stale') { failed('pulse'); failed('treasury'); }
    }
  });
  $('workSelect').addEventListener('change', event => showWork(event.target.value));
  $('nextWork').addEventListener('click', () => {
    if (!catalog || !selected) return;
    const next = (catalog.obras.indexOf(selected) + 1) % catalog.obras.length;
    showWork(catalog.obras[next].id);
  });
  $('refresh').hidden = false;
  $('refresh').addEventListener('click', async () => {
    $('refresh').disabled = true;
    try { await Promise.allSettled([reader.refresh(), loadCatalog()]); }
    finally { $('refresh').disabled = false; }
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  const applyMotion = () => {
    document.body.classList.toggle('motion-paused', paused);
    $('motionToggle').setAttribute('aria-pressed', String(paused));
    $('motionToggle').textContent = paused ? 'Movimento pausado' : 'Pausar movimento';
    $('motionToggle').disabled = reduced.matches;
  };
  $('motionToggle').hidden = false;
  $('motionToggle').addEventListener('click', () => { paused = !paused; applyMotion(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; applyMotion(); });
  applyMotion();
  loadCatalog();
})();

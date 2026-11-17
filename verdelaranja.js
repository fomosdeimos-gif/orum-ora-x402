/* ORUM · casca da casa. Vai buscar o pulso, a tesouraria e o catálogo, entrega-os ao núcleo (casa-nucleo.js, a única cópia da regra)
   e escreve o resultado nos elementos da página. Não decide o que a casa diz; só lê, entrega e desenha. */
(function () {
  'use strict';
  const N = window.ORUMCasa;
  if (!N) return; // sem o núcleo a página fica como o HTML a deixou; nada se inventa
  const $ = id => document.getElementById(id);
  // memoria: já houve uma leitura viva boa (o texto da falha muda). catalogo: a última leitura boa do catálogo.
  const memoria = { pulso: false, tesouraria: false };
  let catalogo = null;
  let catalogoActual = false;
  let obras = [];
  let escolhida = null;
  let catalogoOcupado = false;
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
  function escrever(visivel, chaves) { for (const id of chaves) $(id).textContent = visivel[id]; }
  function estadoDaFonte(id, estado) { $(id).dataset.state = estado; }
  function rasto(r) {
    const li = el('li');
    const time = el('time', r.hora);
    if (r.quando && Number.isFinite(Date.parse(r.quando))) time.dateTime = r.quando;
    li.append(time, el('span', r.texto));
    return li;
  }

  // Compara os rastos do pulso com a última visita guardada neste dispositivo. A hora só se grava ao sair da página.
  let visitaBase;
  function desdeVisita(eventos) {
    const D = window.ORUMDesdeVisita;
    if (!D) return;
    if (visitaBase === undefined) visitaBase = D.ler(window.localStorage);
    const r = D.comparar(eventos, visitaBase, Date.now());
    const resumo = $('sinceSummary');
    if (r.estado === 'primeira') resumo.textContent = 'Primeira visita neste dispositivo: ainda não há nada a comparar.';
    else if (r.estado === 'nada') resumo.textContent = 'Desde ' + N.quando(visitaBase) + ' (Lisboa) o pulso não registou rastos novos.';
    else resumo.textContent = 'Desde ' + N.quando(visitaBase) + ' (Lisboa) o pulso registou ' + r.novos.length + (r.novos.length === 1 ? ' rasto novo.' : ' rastos novos.');
    $('sinceList').replaceChildren(...r.novos.slice(0, 2).map(e => {
      const li = el('li'); li.append(el('time', N.quando(e.quando)), el('span', e.detalhe || e.tipo || 'Evento sem descrição')); return li;
    }));
  }
  function guardarVisita() { if (window.ORUMDesdeVisita && memoria.pulso) window.ORUMDesdeVisita.guardar(window.localStorage, new Date().toISOString()); }
  addEventListener('pagehide', guardarVisita);
  document.addEventListener('visibilitychange', () => { if (document.hidden) guardarVisita(); });

  function renderPulse(data) {
    const r = N.lerPulso(data, Date.now(), memoria.pulso);
    escrever(r.visivel, r.escrever);
    $('pulseDot').className = r.ponto;
    estadoDaFonte('pulseStatus', r.fonteEstado);
    if (r.eventosEscrever) $('events').replaceChildren(...(r.eventos.length ? r.eventos.map(rasto) : [el('li', r.semEventos)]));
    if (r.estado === 'viva' || r.estado === 'viva_antiga') { memoria.pulso = true; desdeVisita(data.eventos); }
    else if (r.estado === 'copia') {
      $('sinceSummary').textContent = 'Sem leitura viva do pulso: não há como comparar com a última visita.';
      $('sinceList').replaceChildren();
    }
  }
  function renderTreasury(dado) {
    const r = N.lerTesouraria(dado, Date.now(), memoria.tesouraria);
    escrever(r.visivel, r.escrever);
    estadoDaFonte('treasuryStatus', r.fonteEstado);
    if (r.estado !== 'indisponivel') memoria.tesouraria = true;
  }

  function licencas(r) {
    if (!r.licencas.length) { $('licenses').replaceChildren(el('p', r.mensagemLicencas)); return; }
    $('licenses').replaceChildren(...r.licencas.map(l => {
      const card = el('article', undefined, 'license');
      card.append(el('h3', l.rotulo), el('div', l.preco, 'license-price'), el('p', l.descricao), el('p', l.duracao, 'duration'));
      if (l.pedido) {
        // Rota fixa da mesma origem; nunca se confia em URLs arbitrários vindos de um catálogo.
        const link = el('a', 'Abrir pedido x402 ↗');
        link.href = l.pedido;
        link.setAttribute('aria-label', 'Abrir pedido x402: ' + l.tipo + ', obra ' + r.obra);
        card.append(link);
      } else card.append(el('p', l.aviso));
      return card;
    }));
  }
  // Mostra uma obra (a escolhida pela pessoa ou a inicial). Não toca no estado da leitura do catálogo.
  function mostrarObra(id) {
    if (!catalogo || !obras.some(o => o.id === Number(id))) return;
    const r = N.lerCatalogo(catalogo, Date.now(), { obra: Number(id), falhou: !catalogoActual });
    escolhida = r.obra;
    $('workSelect').value = String(r.obra);
    escrever(r.obraVisivel, ['workId', 'workTitle', 'workDescription', 'workPosition', 'workHash', 'selectedWork']);
    licencas(r);
  }
  async function loadCatalog() {
    if (catalogoOcupado) return;
    catalogoOcupado = true;
    try {
      const dado = await getJSON('/licenca');
      const pedida = Number(new URLSearchParams(location.search).get('obra'));
      const r = N.lerCatalogo(dado, Date.now(), { obra: escolhida || pedida });
      if (r.estado !== 'actual') throw new Error('Catálogo incompleto');
      catalogo = dado; catalogoActual = true; obras = r.obras;
      $('workSelect').replaceChildren(...obras.map(o => { const op = el('option', o.rotulo); op.value = String(o.id); return op; }));
      mostrarObra(r.obra);
      $('workSelect').disabled = false;
      $('nextWork').disabled = false;
      $('catalogStatus').textContent = r.catalogStatus;
    } catch (_) {
      catalogoActual = false;
      const r = N.lerCatalogo(catalogo, Date.now(), { obra: escolhida, falhou: true });
      $('catalogStatus').textContent = r.catalogStatus;
      // Nunca deixar um pedido comercial desactualizado accionável depois de uma leitura falhada.
      $('licenses').replaceChildren(el('p', r.mensagemLicencas));
    } finally { catalogoOcupado = false; }
  }

  const tarefas = [['/pulso', renderPulse], ['/economia/tesouraria.json', renderTreasury]];
  reader = ORUMLiveRefresh.start({
    read: () => Promise.allSettled(tarefas.map(([caminho]) => getJSON(caminho))),
    render: resultados => resultados.forEach((resultado, i) => {
      // Uma falha de leitura é entregue ao núcleo como ausência de dado; ele diz o que a página deve mostrar.
      tarefas[i][1](resultado.status === 'fulfilled' ? resultado.value : undefined);
    }),
    status: ({ state }) => {
      const labels = { current: 'Consulta a cada 30 s enquanto a página está visível. Estado de cada fonte abaixo.', stale: 'A leitura falhou. Valores anteriores sem confirmação atual.', offline: 'Sem ligação. Os valores anteriores não estão confirmados agora.', paused: 'Leitura suspensa enquanto a página está oculta.' };
      $('refreshStatus').textContent = labels[state];
      if (state === 'offline' || state === 'stale') { renderPulse(undefined); renderTreasury(undefined); }
    }
  });
  $('workSelect').addEventListener('change', event => mostrarObra(event.target.value));
  $('nextWork').addEventListener('click', () => {
    if (!catalogo || escolhida === null) return;
    const i = obras.findIndex(o => o.id === escolhida);
    mostrarObra(obras[(i + 1) % obras.length].id);
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

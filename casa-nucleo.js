/* ORUM · o núcleo da casa. Funções puras: entra o que o organismo publica (pulso, tesouraria, catálogo) e a hora; sai o texto
   que cada elemento da casa mostra. Sem DOM, sem rede, sem estado. É a única cópia desta regra: o navegador (verdelaranja.js)
   e as máquinas (kit/casa.mjs) usam-na tal como está. Onde não houve leitura diz "—" ou "por consultar"; "—" não é zero.
   Não conta pessoas, não promete receita, reembolso nem procura. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ORUMCasa = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMATO = 'orum-casa/v1';
  const FRONTEIRAS = [
    'Os acessos são reconhecidos pela fonte; não são pessoas únicas nem compradores.',
    'Não prova procura nem receita.',
    'Receita externa reportada segundo a contabilidade pública; o património e os testes ficam separados.',
    'Abrir um pedido x402 não efectua uma compra.',
  ];
  const TIPOS = ['consulta', 'editorial', 'treino'];
  const ROTULOS = { consulta: 'Para observar', editorial: 'Para publicar', treino: 'Para investigar' };
  const MIN30 = 30 * 60 * 1000;
  const DIA24 = 24 * 60 * 60 * 1000;
  // Os elementos da página (ids) que o núcleo escreve com texto. A casca e o verificador leem esta lista.
  const IDS = [
    'pulseSummary', 'pulseStatus', 'fieldDay', 'accessCount', 'sentinelState', 'sentinelDescription', 'pulseSourceTime',
    'revenue', 'treasuryStatus',
    'workId', 'workTitle', 'workDescription', 'workPosition', 'workHash', 'selectedWork', 'catalogStatus',
  ];

  const numero = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const formatar = (v) => (numero(v) ? v.toLocaleString('pt-PT', { maximumFractionDigits: 6 }) : '—');
  const quando = (v) => {
    const d = new Date(v);
    return v && Number.isFinite(d.getTime())
      ? d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'hora desconhecida';
  };
  const antigo = (v, idade, agora) => !v || !Number.isFinite(Date.parse(v)) || agora - Date.parse(v) > idade;

  function rastos(lista, limite) {
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : [])
      .filter((e) => { const k = JSON.stringify([e.tipo, e.quando, e.detalhe]); if (vistos.has(k)) return false; vistos.add(k); return true; })
      .slice(0, limite === undefined ? 3 : limite)
      .map((e) => ({ quando: e.quando ?? null, hora: quando(e.quando), texto: e.detalhe || e.tipo || 'Evento sem descrição' }));
  }

  // Pulso. `memoria` diz se já houve uma leitura viva boa (o texto da falha muda). Devolve:
  //  estado: 'viva' | 'viva_antiga' | 'copia' | 'indisponivel'; visivel: texto de cada id; escrever: os ids que esta leitura escreve;
  //  ponto: classe do ponto; eventos/semEventos/eventosEscrever: a lista de rastos; fonteEstado: o estado da fonte.
  function lerPulso(dado, agora, memoria) {
    try {
      if (dado && dado.estado === 'snapshot_desactualizado') {
        if (!dado.campo) throw new Error('Pulso incompleto');
        const obs = quando(dado.snapshot_observado_em);
        const visivel = {
          fieldDay: numero(dado.campo.dia) ? 'Dia ' + formatar(dado.campo.dia) + ' do organismo' : 'Tempo do organismo desconhecido',
          accessCount: '—', sentinelState: 'Sem vigilância viva',
          sentinelDescription: 'A fonte viva não respondeu. Isto é uma cópia de recurso e não prova actividade posterior.',
          pulseSourceTime: 'Cópia de recurso observada em ' + obs + ' (Lisboa).',
          pulseSummary: 'Cópia de recurso · desactualizada',
          pulseStatus: 'Pulso: fonte viva indisponível; a mostrar a cópia de recurso de ' + obs + ' (Lisboa). “—” não significa zero.',
        };
        return { estado: 'copia', visivel, escrever: Object.keys(visivel), ponto: 'status-dot stale', eventos: rastos(dado.eventos), semEventos: 'Nenhum acontecimento nesta cópia.', eventosEscrever: true, fonteEstado: 'stale' };
      }
      if (!dado || !dado.campo || !dado.sentinela || !dado.convite) throw new Error('Pulso incompleto');
      const velho = antigo(dado.sentinela.verificado_em, MIN30, agora);
      const visivel = {
        accessCount: formatar(dado.convite.maquinas_reconhecidas_total),
        fieldDay: numero(dado.campo.dia) ? 'Dia ' + formatar(dado.campo.dia) + ' do organismo' : 'Tempo do organismo desconhecido',
        sentinelState: dado.sentinela.veredicto || 'Sem veredicto',
        sentinelDescription: dado.sentinela.frase || 'A fonte não publicou uma descrição.',
        pulseSourceTime: 'Sentinela: ' + quando(dado.sentinela.verificado_em) + ' (Lisboa).',
        pulseSummary: velho ? 'Vigilância por atualizar' : 'Pulso consultado · ' + (dado.sentinela.veredicto || 'sem veredicto'),
        pulseStatus: 'Pulso: ' + (velho ? 'vigilância com mais de 30 min ou hora desconhecida.' : 'leitura recebida às ' + quando(agora) + '.'),
      };
      return { estado: velho ? 'viva_antiga' : 'viva', visivel, escrever: Object.keys(visivel), ponto: 'status-dot ' + (velho ? 'stale' : 'observed'), eventos: rastos(dado.eventos), semEventos: 'Nenhum acontecimento nesta leitura.', eventosEscrever: true, fonteEstado: velho ? 'stale' : 'current' };
    } catch (_) {
      const visivel = {
        pulseSummary: 'Pulso sem confirmação atual',
        pulseStatus: 'Pulso: atualização indisponível.' + (memoria ? ' Valores anteriores sem confirmação atual.' : ' Ainda sem leitura; “—” não significa zero.'),
        fieldDay: 'Tempo do organismo —', accessCount: '—', sentinelState: 'Por consultar',
        sentinelDescription: 'O estado só aparece depois de uma leitura.', pulseSourceTime: 'Hora da fonte desconhecida.',
      };
      // Na falha só se escrevem o resumo e o estado da fonte; o resto fica como estava (valores anteriores ou o que a página já dizia).
      return { estado: 'indisponivel', visivel, escrever: ['pulseSummary', 'pulseStatus'], ponto: 'status-dot stale', eventos: [], semEventos: 'A aguardar acontecimentos.', eventosEscrever: false, fonteEstado: memoria ? 'stale' : 'unavailable' };
    }
  }

  function lerTesouraria(dado, agora, memoria) {
    try {
      if (!dado || !dado.evidence || !dado.evidence.source || !dado.evidence.source.available || !numero(dado.evidence.external_confirmed_usdc)) throw new Error('Contabilidade incompleta');
      const obs = dado.evidence.source.observed_at;
      const velho = antigo(obs, DIA24, agora);
      const visivel = {
        revenue: formatar(dado.evidence.external_confirmed_usdc),
        treasuryStatus: 'Contabilidade: dados da fonte de ' + quando(obs) + ' (Lisboa).' + (velho ? ' Leitura antiga ou hora desconhecida.' : ''),
      };
      return { estado: velho ? 'antiga' : 'actual', visivel, escrever: ['revenue', 'treasuryStatus'], fonteEstado: velho ? 'stale' : 'current' };
    } catch (_) {
      const visivel = {
        revenue: '—',
        treasuryStatus: 'Contabilidade: atualização indisponível.' + (memoria ? ' Valores anteriores sem confirmação atual.' : ' Ainda sem leitura; “—” não significa zero.'),
      };
      return { estado: 'indisponivel', visivel, escrever: ['treasuryStatus'], fonteEstado: memoria ? 'stale' : 'unavailable' };
    }
  }

  // Catálogo. opcoes.obra: a obra pedida (senão a 2, senão a primeira). opcoes.falhou: a última tentativa de ler falhou e `dado` é a
  // última leitura boa (ou nada): as licenças ficam "por reconfirmar".
  // Devolve: estado ('actual' | 'antigo' | 'indisponivel'); obraVisivel: o texto da obra escolhida; catalogStatus; obras (para o seletor);
  // obra (id escolhido); licencas; mensagemLicencas (quando não há cartões).
  const RECONFIRMAR = 'Licenças por reconfirmar. Consulta o catálogo ou atualiza a leitura.';
  function lerCatalogo(dado, agora, opcoes) {
    const o = opcoes || {};
    try {
      if (!dado || !Array.isArray(dado.obras) || !dado.obras.length || !Array.isArray(dado.licencas)) throw new Error('Catálogo incompleto');
      const obras = dado.obras.filter((x) => Number.isInteger(x.id) && x.id > 0);
      if (!obras.length) throw new Error('Sem obras válidas');
      const e = obras.find((x) => x.id === o.obra) || obras.find((x) => x.id === 2) || obras[0];
      const obraVisivel = {
        workId: 'OBRA ' + String(e.id).padStart(3, '0'), workTitle: e.titulo || 'Sem título declarado',
        workDescription: e.descricao_visivel || 'Esta obra ainda não tem um vestígio textual publicado.',
        workPosition: (obras.indexOf(e) + 1) + ' / ' + obras.length, workHash: e.sha256 || 'Hash não publicado',
        selectedWork: String(e.id).padStart(3, '0') + (e.titulo ? ' · ' + e.titulo : ' · Sem título declarado'),
      };
      const base = { obraVisivel, obras: obras.map((x) => ({ id: x.id, rotulo: String(x.id).padStart(3, '0') + (x.titulo ? ' · ' + x.titulo : ' · Sem título') })), obra: e.id };
      if (o.falhou) {
        return { estado: 'antigo', ...base, catalogStatus: 'Não foi possível atualizar o catálogo. O vestígio anterior permanece; preços por reconfirmar na fonte.', licencas: [], mensagemLicencas: RECONFIRMAR };
      }
      const temHash = typeof e.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(e.sha256);
      const licencas = [];
      for (const l of dado.licencas) {
        if (!TIPOS.includes(l.tipo)) continue;
        licencas.push({
          tipo: l.tipo, rotulo: ROTULOS[l.tipo], preco: l.preco || 'Preço por consultar',
          descricao: l.descricao || 'Consultar os termos no catálogo.',
          duracao: 'Licença: ' + (l.duracao_da_licenca || 'duração não indicada') + '.',
          pedido: temHash ? '/licenca/' + l.tipo + '?' + new URLSearchParams({ obra: String(e.id), sha256: e.sha256 }) : null,
          aviso: temHash ? null : 'Pedido indisponível: falta o hash da obra.',
        });
      }
      return { estado: 'actual', ...base, catalogStatus: 'Catálogo consultado às ' + quando(agora) + '. Fotografias privadas; esta amostra é textual.', licencas, mensagemLicencas: licencas.length ? null : 'Não há licenças disponíveis nesta leitura do catálogo.' };
    } catch (_) {
      return {
        estado: 'indisponivel', obras: [], obra: null, licencas: [], mensagemLicencas: RECONFIRMAR,
        catalogStatus: 'Não foi possível atualizar o catálogo. Podes tentar de novo em “Atualizar leitura” ou abrir a fonte.',
        obraVisivel: {
          workId: '0001', workTitle: 'Uma obra à tua espera', workPosition: '— / —', workHash: 'Por consultar', selectedWork: 'Por consultar',
          workDescription: 'A consultar o catálogo público. As fotografias têm acesso privado por licença.',
        },
      };
    }
  }

  return { FORMATO, FRONTEIRAS, IDS, numero, formatar, quando, antigo, rastos, lerPulso, lerTesouraria, lerCatalogo };
});

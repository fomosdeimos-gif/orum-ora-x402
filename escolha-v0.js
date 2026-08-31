(function (root) {
  'use strict';

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

  function evaluate(pulse) {
    const convite = pulse && pulse.convite || {};
    const sentinela = pulse && pulse.sentinela || {};
    const eventos = Array.isArray(pulse && pulse.eventos) ? pulse.eventos : [];
    const reconhecidas = number(convite.maquinas_reconhecidas_total);
    const pagas = number(convite.visitas_pagas);
    const sondagens = number(convite.visitas_a_sondar);
    const vivo = ['VIVO', 'OBSERVAR'].includes(String(sentinela.veredicto || '').toUpperCase());
    const recentesPagas = eventos.filter(e => e && e.tipo === 'pagamento').length;
    const recentesPresenca = eventos.filter(e => e && e.tipo === 'moltbook').length;
    const completos = [reconhecidas, pagas, sondagens, sentinela.veredicto].filter(v => v !== null && v !== undefined && v !== '').length;
    const confiancaBase = clamp(22 + completos * 9 + (eventos.length ? 8 : 0), 0, 66);

    const opcoes = [
      {
        id: 'observar_funil',
        titulo: 'Observar e qualificar o funil',
        gesto: 'Separar acesso, desafio, tentativa, pagamento e liquidação antes de mudar a oferta.',
        presenca: 'média',
        sustento: 'desconhecido',
        reversivel: true,
        score: 52 + (vivo ? 10 : 0) + (sondagens !== null && pagas !== null && sondagens > pagas * 20 ? 18 : 0),
        razoes: [
          'A maioria dos sinais observados permanece na fase de sondagem.',
          'A origem externa e a liquidação não estão provadas nesta leitura.'
        ]
      },
      {
        id: 'simplificar_passagem',
        titulo: 'Simplificar a passagem paga',
        gesto: 'Reduzir uma fricção verificável entre o desafio x402 e a apresentação do comprovativo.',
        presenca: 'baixa',
        sustento: 'possível, não prometido',
        reversivel: true,
        score: 38 + (sondagens !== null && sondagens > 0 ? 12 : 0) + (recentesPagas > 0 ? 5 : 0),
        razoes: [
          'Há descoberta da porta paga.',
          'Sem etapas classificadas, ainda não é possível localizar a fricção dominante.'
        ]
      },
      {
        id: 'aprofundar_presenca',
        titulo: 'Aprofundar Presença',
        gesto: 'Criar uma resposta ou cápsula nova apenas quando existir matéria externa concreta.',
        presenca: 'possível',
        sustento: 'não demonstrado',
        reversivel: true,
        score: 34 + (recentesPresenca > 0 ? 8 : 0),
        razoes: [
          'Existe atividade pública recente.',
          'Atividade não é interesse, compra nem liquidação.'
        ]
      }
    ].sort((a, b) => b.score - a.score);

    const escolhida = opcoes[0];
    return {
      modelo: 'escolha-verificavel/v0',
      gerado_em: pulse && (pulse.timestamp || pulse.campo && pulse.campo.iso) || null,
      decisao: escolhida.id === 'observar_funil' ? 'observe' : 'act',
      escolha: escolhida,
      alternativas: opcoes.slice(1),
      confianca: confiancaBase,
      limites: [
        'Previsão não é prova.',
        'Acessos e visitas pagas não são classificados aqui como sustento externo.',
        'Sem liquidação externa confirmada, sustento permanece desconhecido.'
      ],
      sinais: { reconhecidas, sondagens, pagas, eventos_recentes: eventos.length }
    };
  }

  root.ORUMChoiceV0 = Object.freeze({ evaluate });
})(typeof window !== 'undefined' ? window : globalThis);

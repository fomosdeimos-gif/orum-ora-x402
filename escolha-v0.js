(function (root) {
  'use strict';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const stage = (funnel, key) => number(funnel && funnel.attempts && funnel.attempts.by_stage && funnel.attempts.by_stage[key] && funnel.attempts.by_stage[key].non_internal_or_unknown);
  function evaluate(pulse, funnel, baseline) {
    const convite = pulse && pulse.convite || {};
    const sentinela = pulse && pulse.sentinela || {};
    const eventos = Array.isArray(pulse && pulse.eventos) ? pulse.eventos : [];
    const sinais = {
      reconhecidas:number(convite.maquinas_reconhecidas_total), passagens_pagas:number(convite.visitas_pagas),
      acessos_24h:number(funnel && funnel.access && funnel.access.non_internal_or_unknown), descoberta_24h:stage(funnel,'discovered'),
      desafios_24h:stage(funnel,'challenge_delivered'), redirecionamentos_24h:stage(funnel,'redirected'),
      comprovativos_24h:stage(funnel,'payment_present'), rejeitados_24h:stage(funnel,'payment_rejected'),
      aceites_http_24h:stage(funnel,'payment_accepted'), pagamentos_externos_confirmados:number(funnel && funnel.payments && funnel.payments.external_confirmed_count),
      sustento_externo_usdc:number(funnel && funnel.payments && funnel.payments.external_confirmed_usdc)
    };
    let escolhida;
    if ((sinais.pagamentos_externos_confirmados||0)>0) escolhida={id:'consolidar_percurso',decisao:'act',titulo:'Consolidar o percurso confirmado',gesto:'Ligar oferta, origem externa e liquidação; preservar o recibo e reduzir apenas a fricção observada.',proximo_sinal:'nova liquidação externa atribuível',razoes:['Existe sustento externo confirmado.','Uma compra real permite aprender com o percurso completo.']};
    else if ((sinais.aceites_http_24h||0)>0) escolhida={id:'verificar_liquidacao',decisao:'act',titulo:'Verificar a liquidação',gesto:'Cruzar a aceitação HTTP com ora_pagamentos e prova on-chain antes de chamar compra ou sustento.',proximo_sinal:'liquidação confirmada ou falha nomeada',razoes:['Existe aceitação HTTP sem sustento externo confirmado.','Aceitação não prova liquidação.']};
    else if ((sinais.rejeitados_24h||0)>0) escolhida={id:'diagnosticar_rejeicao',decisao:'act',titulo:'Diagnosticar a rejeição agregada',gesto:'Localizar a etapa e a razão agregada da falha; corrigir apenas uma fricção reproduzível.',proximo_sinal:'novo comprovativo aceite ou rejeição diferente',razoes:['Há comprovativos rejeitados no período.','A falha observada oferece uma intervenção verificável.']};
    else if ((sinais.comprovativos_24h||0)>0) escolhida={id:'acompanhar_comprovativo',decisao:'observe',titulo:'Acompanhar o comprovativo',gesto:'Esperar pela aceitação ou rejeição sem alterar a oferta durante a passagem.',proximo_sinal:'payment_accepted ou payment_rejected',razoes:['Um comprovativo foi apresentado.','Ainda não existe resultado da verificação.']};
    else escolhida={id:'observar_progressao',decisao:'observe',titulo:'Observar a progressão do pagamento',gesto:'Manter a porta estável e observar se algum desafio avança para comprovativo ou falha.',proximo_sinal:'payment_present ou payment_rejected',razoes:['A porta paga foi descoberta e desafiou máquinas.','Nenhum comprovativo chegou nas últimas 24 horas.']};
    const completos=Object.values(sinais).filter(v=>v!==null).length;
    const base=baseline&&baseline.signals||{}, delta={};
    for(const [key,value] of Object.entries(sinais)) delta[key]=value!==null&&Number.isFinite(Number(base[key]))?value-Number(base[key]):null;
    return {modelo:'escolha-verificavel/v1',observado_em:funnel&&funnel.observed_at||pulse&&pulse.timestamp||null,janela_horas:number(funnel&&funnel.window_hours),decisao:escolhida.decisao,escolha:escolhida,confianca:clamp(28+completos*4+(funnel&&funnel.schema?8:0),0,82),sinais,delta_desde_baseline:delta,baseline_em:baseline&&baseline.observed_at||null,independencia:funnel&&funnel.independence?{claimed:funnel.independence.claimed,scope:funnel.independence.scope,provider_independent:funnel.independence.provider_independent}:null,limites:['Previsão não é prova.','Origem desconhecida não é externa.','Aceitação HTTP não é liquidação.','Sustento exige origem externa e liquidação confirmadas.'],fallback:!funnel,eventos_recentes:eventos.length,sentinela:sentinela.veredicto||null};
  }
  root.ORUMChoiceV0=Object.freeze({evaluate});
})(typeof window!=='undefined'?window:globalThis);

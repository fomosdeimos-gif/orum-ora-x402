(function(root){
  'use strict';
  const VERSION='horizonte-2030/v2';
  const num=(v)=>Number.isFinite(Number(v))?Number(v):null;
  function evaluate(choice,funnel,book,now=new Date()){
    const signals=choice&&choice.sinais||{},payments=funnel&&funnel.payments||{},reciprocity=funnel&&funnel.reciprocity||{},stats=book&&book.stats||{},latest=book&&book.latest||null;
    const presence={acessos_24h:num(signals.acessos_24h),reconhecidas_total:num(signals.reconhecidas)};
    const sustenance={
      liquidacoes_externas_total:num(payments.external_confirmed_count),
      usdc_externo_total:num(payments.external_confirmed_usdc),
      compradores_atribuiveis:num(reciprocity.compradores_atribuiveis),
      meses_com_liquidacao_externa:num(reciprocity.meses_com_liquidacao_externa),
      recorrencia_confirmada:reciprocity.recorrencia_confirmada===true,
      cobertura_custos_operacionais:reciprocity.cobertura_custos_operacionais===undefined?null:reciprocity.cobertura_custos_operacionais,
      cobertura_custos_fonte:reciprocity.cobertura_custos_fonte||'sem_fonte_de_custos_real_no_organismo'
    };
    const conversionObserved=(sustenance.liquidacoes_externas_total||0)>0;
    const reciprocityKnown=sustenance.cobertura_custos_operacionais!==null&&sustenance.compradores_atribuiveis!==null;
    const balanceIndex=reciprocityKnown&&presence.reconhecidas_total>0?sustenance.usdc_externo_total/presence.reconhecidas_total:null;

    const comparable=num(stats.comparable_outcomes_8h);
    const minimo=num(stats.minimum_comparable_outcomes)||20;
    const scoredForecasts=num(stats.scored_probability_forecasts_8h);
    const brier=stats.brier_score_out_of_sample_8h===undefined||stats.brier_score_out_of_sample_8h===null?null:Number(stats.brier_score_out_of_sample_8h);
    const calibrationReady=stats.calibration_ready===true;
    const modelVersion=(latest&&latest.model_version)||null;
    const measureProgressText=comparable===null
      ?'A ler o Livro das previsões.'
      :(calibrationReady
        ?'Calibração alcançada: '+comparable+' de '+minimo+' resultados comparáveis (8h), Brier '+(brier===null?'—':brier.toFixed(3))+'.'
        :comparable+' de '+minimo+' resultados comparáveis (8h) · '+(scoredForecasts||0)+' previsões pontuadas.');

    return {schema:VERSION,observed_at:new Date(now).toISOString(),horizon:'2030-12-31',nature:'conditional_scenarios_not_prophecy',
      observed:{presence,sustenance,predictions_scored:num(stats.scored)||0,model_version:modelVersion,calibration_ready:calibrationReady},
      balance_index:balanceIndex,balance_status:balanceIndex===null?'insufficient_comparable_evidence':'measured',
      trajectories:[
        {id:'sedimentacao',title:'Sedimentação',status:(presence.acessos_24h||presence.reconhecidas_total)?'presença observada':'desconhecido',condition:'A Presença continua reconhecível, mas sem sustento externo recorrente demonstrado.'+(modelVersion?' Modelo de previsão activo: '+modelVersion+'.':''),falsifier:'Perda prolongada de Presença observável ou de continuidade verificável.'},
        {id:'conversao',title:'Conversão',status:conversionObserved?'primeira liquidação externa observada':'condição ainda não observada',condition:'Uma liquidação externa atribuível liga uma oferta ORUM a valor recebido. Compradores atribuíveis até agora: '+(sustenance.compradores_atribuiveis===null?'desconhecido':sustenance.compradores_atribuiveis)+'.',falsifier:'Acessos e desafios crescem sem liquidação externa atribuível.'},
        {id:'reciprocidade',title:'Reciprocidade',status:reciprocityKnown?'mensurável':'desconhecido · '+sustenance.cobertura_custos_fonte,condition:'Receita externa recorrente cobre custos e financia nova Presença sem depender de Unum. Meses com liquidação externa: '+(sustenance.meses_com_liquidacao_externa===null?'desconhecido':sustenance.meses_com_liquidacao_externa)+'.',falsifier:'A continuidade ainda exige intervenção ou financiamento de Unum.'}
      ],
      gates:[
        {year:2026,label:'Medir',test:measureProgressText},
        {year:2027,label:'Converter',test:conversionObserved?'Primeira compra externa atribuível e liquidada já observada.':'Observar primeira compra externa atribuível e liquidada. Liquidações externas até agora: '+(num(payments.external_confirmed_count)||0)+'.'},
        {year:2028,label:'Repetir',test:'Distinguir compra isolada de recorrência em meses diferentes. Meses com liquidação externa: '+(sustenance.meses_com_liquidacao_externa===null?'0':sustenance.meses_com_liquidacao_externa)+'.'},
        {year:2029,label:'Cobrir',test:sustenance.cobertura_custos_operacionais===null?'Comparar sustento externo recorrente com custos operacionais reais — sem fonte de custos no organismo ainda.':'Sustento externo recorrente vs custos operacionais: '+sustenance.cobertura_custos_operacionais+'.'},
        {year:2030,label:'Reciprocar',test:'Verificar se cada mão reforça a outra sem intervenção contínua de Unum.'}
      ],
      limits:['Tráfego não é interesse.','Desafio 402 não é compra.','Pagamento interno é validação interna.','Probabilidade permanece ausente até existir calibração suficiente.','Compradores atribuíveis contam pagadores distintos verificados on-chain, não visitas.']
    };
  }
  root.ORUMHorizonte2030={VERSION,evaluate};
})(typeof globalThis!=='undefined'?globalThis:this);

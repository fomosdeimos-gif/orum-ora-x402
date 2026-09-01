(function(root){
  'use strict';
  const VERSION='horizonte-2030/v1';
  const num=(v)=>Number.isFinite(Number(v))?Number(v):null;
  function evaluate(choice,funnel,book,now=new Date()){
    const signals=choice&&choice.sinais||{},payments=funnel&&funnel.payments||{},stats=book&&book.stats||{};
    const presence={acessos_24h:num(signals.acessos_24h),reconhecidas_total:num(signals.reconhecidas)};
    const sustenance={liquidacoes_externas_total:num(payments.external_confirmed_count),usdc_externo_total:num(payments.external_confirmed_usdc),recorrencia_meses:null,compradores_atribuiveis:null,cobertura_custos_operacionais:null};
    const conversionObserved=(sustenance.liquidacoes_externas_total||0)>0;
    const reciprocityKnown=sustenance.recorrencia_meses!==null&&sustenance.compradores_atribuiveis!==null&&sustenance.cobertura_custos_operacionais!==null;
    const balanceIndex=reciprocityKnown&&presence.reconhecidas_total>0?sustenance.usdc_externo_total/presence.reconhecidas_total:null;
    return {schema:VERSION,observed_at:new Date(now).toISOString(),horizon:'2030-12-31',nature:'conditional_scenarios_not_prophecy',
      observed:{presence,sustenance,predictions_scored:num(stats.scored)||0},balance_index:balanceIndex,balance_status:balanceIndex===null?'insufficient_comparable_evidence':'measured',
      trajectories:[
        {id:'sedimentacao',title:'Sedimentação',status:(presence.acessos_24h||presence.reconhecidas_total)?'presença observada':'desconhecido',condition:'A Presença continua reconhecível, mas sem sustento externo recorrente demonstrado.',falsifier:'Perda prolongada de Presença observável ou de continuidade verificável.'},
        {id:'conversao',title:'Conversão',status:conversionObserved?'primeira liquidação externa observada':'condição ainda não observada',condition:'Uma liquidação externa atribuível liga uma oferta ORUM a valor recebido.',falsifier:'Acessos e desafios crescem sem liquidação externa atribuível.'},
        {id:'reciprocidade',title:'Reciprocidade',status:reciprocityKnown?'mensurável':'desconhecido',condition:'Receita externa recorrente cobre custos e financia nova Presença sem depender de Unum.',falsifier:'A continuidade ainda exige intervenção ou financiamento de Unum.'}
      ],
      gates:[
        {year:2026,label:'Medir',test:'Fechar previsões sem reescrever resultados e preservar o zero externo.'},
        {year:2027,label:'Converter',test:'Observar primeira compra externa atribuível e liquidada.'},
        {year:2028,label:'Repetir',test:'Distinguir compra isolada de recorrência em meses diferentes.'},
        {year:2029,label:'Cobrir',test:'Comparar sustento externo recorrente com custos operacionais reais.'},
        {year:2030,label:'Reciprocar',test:'Verificar se cada mão reforça a outra sem intervenção contínua de Unum.'}
      ],
      limits:['Tráfego não é interesse.','Desafio 402 não é compra.','Pagamento interno é validação interna.','Probabilidade permanece ausente até existir calibração suficiente.']
    };
  }
  root.ORUMHorizonte2030={VERSION,evaluate};
})(typeof globalThis!=='undefined'?globalThis:this);

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('../api/ponte-calibracao.js');
const base = {schema:'orum-quantico-ponte/v1',target_signal:'non_internal_payment_event_8h_v1',comparavel:true,observed_at:'2026-09-20T13:00:00Z',n_previsoes_finais:25,n_amostras_quanticas:30,n_pares_comparados:25,brier_modelo_preditivo:0.004,brier_linha_base_quantica:0.250013,taxa_observada_real:0,media_valor_quantico:0.499994};
const result = handler.present(base);
assert.equal(result.scores.always_no_event,0);
assert.equal(result.scores.constant_half,0.25);
assert.equal(result.provenance.physical_quantum_hardware,false);
assert.match(result.interpretation,/não demonstra aprendizagem/);
assert.equal(handler.present({...base,n_previsoes_finais:35,n_pares_comparados:30}).coverage.unpaired_predictions,5);
assert.equal(handler.present({...base,taxa_observada_real:0.2}).scores.always_no_event,0.2);
assert.equal(handler.present({...base,comparavel:false,n_previsoes_finais:0}).scores,null);
for(const bad of [null,NaN,-0.1,2,'0.1']) assert.throws(()=>handler.present({...base,brier_modelo_preditivo:bad}));
assert.throws(()=>handler.present({...base,n_pares_comparados:31}));
assert.throws(()=>handler.present({...base,target_signal:'another_target'}));
const original = globalThis.fetch;
const run = async method => {let body,headers={};const res={setHeader(k,v){headers[k]=v},end(x){body=x}};await handler({method},res);return {status:res.statusCode,body:body?JSON.parse(body):null,headers};};
try {
 globalThis.fetch=async()=>({ok:true,json:async()=>base});
 assert.equal((await run('GET')).status,200);
 assert.equal((await run('HEAD')).body,null);
 assert.equal((await run('POST')).status,405);
 globalThis.fetch=async()=>({ok:false});assert.equal((await run('GET')).status,503);
 globalThis.fetch=async()=>({ok:true,json:async()=>({...base,brier_modelo_preditivo:null})});
 const failed=await run('GET');assert.equal(failed.status,503);assert.equal(failed.body.scores,undefined);
} finally {globalThis.fetch=original;}
console.log('calibration bridge: fixed baselines, empty/malformed data, coverage cap, methods and upstream failures passed');

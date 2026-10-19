import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=fs.readFileSync('pagar-teste.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const valid={scheme:'exact',network:'eip155:8453',amount:'330000',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',payTo:'0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5'};
async function run(change={},fail=false){
 const elements=new Map();const q=s=>{if(!elements.has(s))elements.set(s,{style:{},textContent:'',className:''});return elements.get(s)};let signatures=0;
 const ethereum={request:async({method})=>{if(method==='eth_requestAccounts')return ['0x'+'1'.repeat(40)];if(method==='eth_chainId')return '0x2105';if(method==='eth_signTypedData_v4'){signatures++;return '0xsignature'};return null}};
 const context={document:{querySelector:q},window:{ethereum},ethereum,location:{host:'example.test',pathname:'/pagar-teste.html',search:''},navigator:{},crypto:webcrypto,Uint8Array,Date,Number,String,JSON,btoa:s=>Buffer.from(s,'binary').toString('base64'),unescape,encodeURIComponent,fetch:async(url,options)=>url==='/eco'?{ok:true,json:async()=>({campo:{pensamento:'amostra'}})}:options?.headers?(fail?Promise.reject(Error('network')):{ok:true,text:async()=>JSON.stringify({campo:{pensamento:'entrega simulada'}})}):{status:402,json:async()=>({accepts:[{...valid,...change}]})}};
 vm.runInNewContext(source,context);await q('#preview').onclick();assert.match(q('#preview-result').textContent,/amostra/);assert.equal(signatures,0);
 await q('#connect').onclick();await q('#pay').onclick();return {signatures,result:q('#result').textContent};
}
for(const change of [{amount:'330001'},{payTo:'0x'+'2'.repeat(40)},{asset:'0x'+'3'.repeat(40)},{network:'eip155:1'},{scheme:'upto'}]){const r=await run(change);assert.equal(r.signatures,0);assert.match(r.result,/Não foi enviada autorização/)}
const failed=await run({},true);assert.equal(failed.signatures,1);assert.match(failed.result,/pode ter sido liquidada/);assert.doesNotMatch(failed.result,/O pagamento não foi concluído/);
assert.match((await run()).result,/entrega simulada/);
console.log('Campo: amostra sem assinatura; cinco requisitos alterados bloqueados; falha após assinatura preserva incerteza; entrega simulada apresentada. Nenhum pagamento real.');

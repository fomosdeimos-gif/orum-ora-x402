import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync('btc-oro.js','utf8');
const policy = JSON.parse(fs.readFileSync('economia/btc-oro.json'));
assert.equal(policy.rules.btc_pledged_to_oro,false);
assert.equal(policy.rules.redemption,false);
assert.equal(policy.rules.access,'publico_sem_token');
async function render(concordancia, saldo, fails=false, timestamp=new Date().toISOString()) {
  const box={textContent:'',children:[],replaceChildren(){this.children=[]},append(x){this.children.push(x)}};
  await vm.runInNewContext(source,{document:{getElementById:()=>box,createElement:()=>({textContent:''})},AbortSignal,fetch:async()=>({ok:!fails,json:async()=>({ok:true,enderecos:[{papel:'operacional',concordancia,saldo_confirmado_sats:saldo}],fonte:{consultado_utc:timestamp}})})});
  return box.textContent+box.children.map(x=>x.textContent).join(' ');
}
assert.match(await render('concordam',0),/0 sats confirmados/);
for (const state of ['DISCREPANCIA','fonte_unica','indisponivel']) assert.doesNotMatch(await render(state,12345),/12.?345 sats confirmados/);
for (const value of [null,-1,1.5,Number.MAX_SAFE_INTEGER+1]) assert.match(await render('concordam',value),/saldo por confirmar/);
assert.match(await render('concordam',0,true),/Saldo desconhecido/);
// Estrago propositado: promover fonte única tem de quebrar esta barreira.
const mutant=source.replace("wallet.concordancia === 'concordam'","true");
assert.notEqual(mutant,source);
const box={children:[],replaceChildren(){},append(x){this.children.push(x)}};
await vm.runInNewContext(mutant,{document:{getElementById:()=>box,createElement:()=>({})},AbortSignal,fetch:async()=>({ok:true,json:async()=>({ok:true,enderecos:[{papel:'operacional',concordancia:'fonte_unica',saldo_confirmado_sats:99}],fonte:{consultado_utc:new Date().toISOString()}})})});
assert.match(box.children[0].textContent,/99 sats confirmados/,'mutação apanhada: mostraria saldo indevidamente');
console.log('BTC × ORO: zero, discrepância, fonte única, falha e valores inválidos verificados; mutação detectada.');

for (const stamp of ['invalido', new Date(Date.now()-600000).toISOString(), new Date(Date.now()+120000).toISOString()]) {
  const result = await render('concordam',12345,false,stamp);
  assert.match(result,/Saldo actual desconhecido/);
  assert.doesNotMatch(result,/sats confirmados/);
}
console.log('Frescura: leitura antiga, data inválida e relógio futuro rejeitados.');

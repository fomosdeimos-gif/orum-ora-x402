// Runs the deployed handler code with isolated in-memory database, Storage and
// settlement adapters. No network, production records, wallets or payments.
// Ed25519 selection/certificate signatures are real; payer verification is mocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { createHash, createPrivateKey, createPublicKey, sign, verify, webcrypto } from 'node:crypto';

const root = new URL('../supabase/functions/ora-licenca/', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const seed = Buffer.alloc(32, 7); // synthetic, never a live key
const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
const pub = createPublicKey(key);
const rawPub = pub.export({ format: 'der', type: 'spki' }).subarray(-32);
const ed = { etc: {}, getPublicKeyAsync: async () => rawPub, signAsync: async b => sign(null, b, key), verifyAsync: async (s, b) => verify(null, b, pub, s) };
const payer = '0x1111111111111111111111111111111111111111';
const payTo = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const bytes = Buffer.from('private photograph fixture, work 2');
const second = Buffer.from('private photograph fixture, work 37');
const works = [
  { id: 2, titulo: 'ORO', ano: null, descricao_visivel: 'fixture', sha256: sha(bytes), bytes_na_arca: true, caminho_arca: '2.jpg' },
  { id: 37, titulo: 'Second', ano: null, descricao_visivel: 'fixture', sha256: sha(second), bytes_na_arca: true, caminho_arca: '37.jpg' },
];
const objects = new Map([['2.jpg', bytes], ['37.jpg', second]]);
const tables = { ora_licencas_fisicas: [], ora_pagamentos: [], x402_orders: [], ora_arca_fisica_acessos_assinados: [], ora_acessos_log: [] };
let rpcCalls = 0, settleCalls = 0, corrupt = false, signingFails = false, insertFails = false, activeTx = '', now = Date.now();
let handler;
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const matched = (table, params) => (tables[table] || []).filter(row => [...params].every(([k,v]) => !v.startsWith('eq.') || String(row[k]) === v.slice(3)));
const sb = {
  rpc: async name => ({ data: name === 'orum_oro_attestor_keys' ? [{ seed_hex: seed.toString('hex') }] : name === 'orum_cdp_keys' ? [{ key_id: 'test', key_secret: Buffer.alloc(64, 7).toString('base64') }] : null }),
  storage: { from: () => ({
    download: async path => ({ data: objects.has(path) ? new Blob([corrupt ? Buffer.from('corrupt') : objects.get(path)]) : null, error: null }),
    createSignedUrl: async path => ({ data: signingFails ? null : { signedUrl: 'https://fixture.invalid/image/' + path }, error: signingFails ? 'fixture failure' : null }),
  }) },
  from: table => {
    const filters = [];
    const query = { select: () => query, eq: (k,v) => { filters.push([k,v]); return query; },
      maybeSingle: async () => ({ data: (tables[table] || []).find(r => filters.every(([k,v]) => r[k] === v)) || null }),
      single: async () => ({ data: (tables[table] || []).find(r => filters.every(([k,v]) => r[k] === v)) || null }),
    }; return query;
  },
};
async function fakeFetch(input, init = {}) {
  const url = new URL(input);
  if (url.hostname === 'fixture.invalid') return new Response(objects.get(url.pathname.split('/').at(-1)));
  if (url.hostname === 'api.cdp.coinbase.com') {
    if (url.pathname.endsWith('/verify')) return response({ isValid: true });
    if (url.pathname.endsWith('/settle')) { settleCalls++; return response({ success: true, transaction: activeTx }); }
    throw Error('unhandled CDP fixture');
  }
  if (url.hostname === 'mainnet.base.org') {
    rpcCalls++;
    assert.equal(JSON.parse(init.body).method, 'eth_getTransactionReceipt');
    return response({ result: { status: '0x1', logs: [{ address: asset,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + payer.slice(2).padStart(64, '0'), '0x' + payTo.slice(2).padStart(64, '0')], data: '0x' + (1618000).toString(16) }] } });
  }
  assert.equal(url.hostname, 'ywabnlhkmhbyewqhbsjm.supabase.co', 'unexpected network attempt');
  const table = url.pathname.split('/').at(-1);
  if (init.method === 'POST') {
    const body = JSON.parse(init.body);
    if (table === 'ora_pagamentos') assert(!('via' in body), 'payment table has no via column');
    if (table === 'ora_pagamentos' && tables[table].some(r => r.tx_hash === body.tx_hash)) return response({},409);
    if (table === 'ora_licencas_fisicas' && insertFails) return response({error:'fixture'},500);
    const row = { id: webcrypto.randomUUID(), revogada_em: null, ...body };
    (tables[table] ||= []).push(row); return response([row],201);
  }
  if (init.method === 'PATCH') {
    for (const row of matched(table,url.searchParams)) Object.assign(row,JSON.parse(init.body));
    return response({});
  }
  if (table === 'ora_coleccao_fisica') {
    const id = url.searchParams.get('id');
    return response(id ? works.filter(w => String(w.id) === id.slice(3)) : works);
  }
  if (table === 'x402_services') return response([{id:'service-fixture'}]);
  return response(matched(table,url.searchParams));
}
class Clock extends Date { static now() { return now; } }
const context = vm.createContext({ AbortSignal, Response, Request, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, Blob, Buffer,
  atob, btoa, crypto:webcrypto, console, setTimeout, clearTimeout, Date: Clock, fetch: fakeFetch,
  Math: Object.assign(Object.create(Math), { random: () => 0 }),
  Deno: { env:{get:()=> 'synthetic'}, serve: fn => {handler=fn;} },
});
const cache = new Map();
function synthetic(name, values) { return new vm.SyntheticModule(Object.keys(values), function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);}, {context,identifier:name}); }
async function moduleFor(spec) {
  if(cache.has(spec)) return cache.get(spec);
  let mod;
  if(spec.includes('edge-runtime')) mod=synthetic(spec,{});
  else if(spec.includes('supabase-js')) mod=synthetic(spec,{createClient:()=>sb});
  else if(spec.includes('@noble/ed25519')) mod=synthetic(spec,ed);
  else if(spec.includes('viem')) mod=synthetic(spec,{http:()=>null,fallback:()=>null,createPublicClient:()=>({verifyMessage:async({address,signature})=>address===payer&&signature==='0xaabb'})});
  else mod=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL(spec.replace('./',''),root),'utf8'),{mode:'strip'}),{context,identifier:spec,importModuleDynamically:async name=>{const m=await moduleFor(name);if(m.status==='unlinked')await m.link(moduleFor);if(m.status==='linked')await m.evaluate();return m;}});
  cache.set(spec,mod); return mod;
}
const main=await moduleFor('index.ts'); await main.link(moduleFor);await main.evaluate();
const base='https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-licenca';
const call=(url,opts={})=>handler(new Request(url,{...opts,headers:{'x-ora-host':'ora-x402-gateway.vercel.app',...opts.headers}}));
const tx=n=>'0x'+n.toString(16).padStart(64,'0');
const payment=n=>({'X-PAYMENT':btoa(JSON.stringify({transactionHash:tx(n)}))});
const sample=await (await call(base+'/amostra')).json();
for(const link of sample.licenciar){const u=new URL(link.endpoint);assert.equal(u.searchParams.get('obra'),String(sample.obra.id));assert.equal(u.searchParams.get('sha256'),sample.obra.sha256);}
const initial=await call(sample.licenciar[0].endpoint);assert.equal(initial.status,307);
const selectedUrl=initial.headers.get('location');assert(new URL(selectedUrl).searchParams.get('selection'));
const initialLog = tables.ora_acessos_log.at(-1).x402_observation;
assert.equal(initialLog.selection, 'issued');
const attempt = initialLog.attempt_id;
assert.match(attempt, /^[0-9a-f-]{36}$/);
const concurrent = await Promise.all([call(sample.licenciar[0].endpoint), call(sample.licenciar[0].endpoint)]);
const concurrentIds = await Promise.all(concurrent.map(async r => (await r.json()).selection.attempt_id));
assert.equal(new Set([attempt, ...concurrentIds]).size, 3, 'same-second selections have unique attempt IDs');
const challenge=await call(selectedUrl);assert.equal(challenge.status,402);
const c=await challenge.json();assert.equal(c.selection.work_id,String(sample.obra.id));assert.equal(c.selection.sha256,sample.obra.sha256);assert.equal(c.resource.url,selectedUrl);
assert.equal(JSON.parse(Buffer.from(challenge.headers.get('payment-required'),'base64')).resource.url,selectedUrl);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.attempt_id, attempt);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.challenge, true);
const bad = new URL(selectedUrl);
const parts = bad.searchParams.get('selection').split('.');
const payload = JSON.parse(Buffer.from(parts[0], 'base64url'));
payload.attempt_id = webcrypto.randomUUID();
bad.searchParams.set('selection', Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+parts[1]);
assert.equal((await call(bad)).status, 409);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.attempt_id, null, 'unverified IDs are never attributed');
const legacy = new URL(selectedUrl); delete payload.attempt_id;
const legacyBytes = Buffer.from(JSON.stringify(payload));
legacy.searchParams.set('selection', legacyBytes.toString('base64url')+'.'+sign(null,legacyBytes,key).toString('base64url'));
assert.equal((await call(legacy)).status, 402, 'old signed selections remain valid');
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.attempt_id, null, 'no invented historical attempt');
const malformed = new URL(selectedUrl); payload.attempt_id = 'invalid';
const malformedBytes = Buffer.from(JSON.stringify(payload));
malformed.searchParams.set('selection', malformedBytes.toString('base64url')+'.'+sign(null,malformedBytes,key).toString('base64url'));
assert.equal((await call(malformed)).status, 409);
const invalidProof = await call(selectedUrl,{headers:{'X-PAYMENT':'invalid'}});
assert.equal(invalidProof.status,402);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.proof_received,true);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.settlement,'not_observed');
const before=rpcCalls+settleCalls;
for(const mutate of [u=>u.searchParams.set('obra','37'),u=>u.searchParams.set('sha256','f'.repeat(64)),u=>u.searchParams.append('obra','2'),u=>u.pathname=u.pathname.replace('consulta','treino'),u=>{const t=u.searchParams.get('selection');u.searchParams.set('selection',t.slice(0,-4)+'AAAA');}]){
  const u=new URL(selectedUrl);mutate(u);assert([400,409].includes((await call(u,{headers:payment(1)})).status));
}
assert.equal((await call(base+'/consulta?obra=999')).status,404);
assert.equal((await call(base+'/consulta?obra=2',{headers:payment(1)})).status,409);
corrupt=true;assert.equal((await call(selectedUrl,{headers:payment(1)})).status,503);corrupt=false;
objects.delete('2.jpg');assert.equal((await call(selectedUrl,{headers:payment(1)})).status,503);objects.set('2.jpg',bytes);
works[0].sha256='e'.repeat(64);assert.equal((await call(selectedUrl,{headers:payment(1)})).status,503);works[0].sha256=sha(bytes);
now+=1801000;assert.equal((await call(selectedUrl,{headers:payment(1)})).status,409);now-=1801000;
assert.equal(rpcCalls+settleCalls,before,'invalid selection must stop before settlement');
const paid=await call(selectedUrl,{headers:payment(1)});assert.equal(paid.status,200);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.attempt_id, attempt);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.settlement, 'confirmed');
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.delivery, 'response_ready');
const receipt=await paid.json();const license=tables.ora_licencas_fisicas[0];
assert.equal(license.obra_id,sample.obra.id);assert.equal(license.obra_sha256,sample.obra.sha256);
assert.equal(receipt.licenca.selecao.work_id,String(license.obra_id));assert.equal(receipt.licenca.prova_pagamento.tx_hash,license.tx_hash);
assert.equal(tables.x402_orders[0].payment_tx_hash,license.tx_hash);
const delivered=await fakeFetch(receipt.licenca.acesso_a_fotografia.url);assert.equal(sha(Buffer.from(await delivered.arrayBuffer())),license.obra_sha256);
assert.equal((await call(selectedUrl,{headers:payment(1)})).status,402,'no duplicate redemption');
const other=(await call(base+'/consulta?obra=37')).headers.get('location');
assert.equal((await call(other,{headers:payment(1)})).status,402,'same transaction cannot redeem a second work');
const renewal=await(await call(base+'/reacesso?tx='+tx(1))).json();
const renewalBody={transactionHash:tx(1),issued_at:renewal.issued_at,nonce:renewal.nonce,signature:'0xaabb'};
assert.equal((await call(base+'/reacesso',{method:'POST',body:JSON.stringify({...renewalBody,signature:'0xbbcc'})})).status,401);
const renewed=await call(base+'/reacesso',{method:'POST',body:JSON.stringify(renewalBody)});assert.equal(renewed.status,200);
const renewedBody=await renewed.json();assert.equal(renewedBody.obra_id,license.obra_id);assert.equal(renewedBody.sha256,license.obra_sha256);assert.equal(renewedBody.pagamento_novo,false);
assert.equal(sha(Buffer.from(await(await fakeFetch(renewedBody.acesso_a_fotografia.url)).arrayBuffer())),license.obra_sha256);
corrupt=true;assert.equal((await call(base+'/reacesso',{method:'POST',body:JSON.stringify(renewalBody)})).status,503);corrupt=false;
signingFails=true;assert.equal((await call(selectedUrl,{headers:payment(2)})).status,503);signingFails=false;
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.settlement,'confirmed');
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.delivery,'failed');
insertFails=true;assert.equal((await call(selectedUrl,{headers:payment(3)})).status,503);insertFails=false;
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.settlement,'confirmed');
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.delivery,'failed');
activeTx=tx(4);const cdpProof={scheme:'exact',payload:{signature:'synthetic',authorization:{from:payer}}};
const cdp=await call(selectedUrl,{headers:{'PAYMENT-SIGNATURE':btoa(JSON.stringify(cdpProof))}});assert.equal(cdp.status,200);
assert.equal((await cdp.json()).licenca.obra.id,sample.obra.id);assert.equal(settleCalls,1);
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.settlement,'confirmed');
assert.equal(tables.ora_acessos_log.at(-1).x402_observation.delivery,'response_ready');
for (const row of tables.ora_acessos_log) {
  assert.deepEqual(Object.keys(row.x402_observation).sort(), ['schema','attempt_id','selection','challenge','proof_received','settlement','delivery'].sort());
}
console.log('PASS: unique same-second/concurrent attempt IDs; redirect/retry correlation; signed legacy compatibility; tamper rejection; malformed proof; direct/CDP settlement distinct from failed delivery; bounded telemetry without proofs or identity.');
console.log('PASS: sample → signed selection → challenge → simulated direct/CDP payment → stored work/hash → verified bytes → authorized mocked-holder reaccess. Tampering, expiry, duplicate redemption, missing/corrupt bytes and failed delivery/record fail closed. No network or real payment.');

// The gateway must expose the canonical redirect instead of following it on
// behalf of the client and hiding the signed resource URL.
const proxyModule={exports:{}};let forwarded;
vm.runInNewContext(await readFile(new URL('../api/proxy.js',import.meta.url),'utf8'),{
  module:proxyModule,process:{env:{}},URLSearchParams,
  fetch:async(url,options)=>{forwarded={url,options};return new Response('{}',{status:307,headers:{location:selectedUrl,'cache-control':'no-store'}});},
});
const proxyHeaders={};let proxyBody;
const proxyRes={setHeader:(k,v)=>proxyHeaders[k]=v,end:b=>{proxyBody=b;},statusCode:0};
await proxyModule.exports({method:'GET',query:{base:'ora-licenca',rest:'consulta',obra:'2'},headers:{host:'ora-x402-gateway.vercel.app'}},proxyRes);
assert.equal(forwarded.options.redirect,'manual');assert.equal(proxyRes.statusCode,307);assert.equal(proxyHeaders.location,selectedUrl);assert.equal(proxyBody,'{}');
console.log('PASS: gateway preserves canonical selection redirect and no-store.');


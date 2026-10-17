// Verifica a escolha do facilitador x402 da via directa (api/_facilitador.js), sem rede e sem pagamentos:
// o facilitador publico, o RPC da Base e o facilitador CDP sao simulados. Cada recusa tem de acontecer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const f = require('../api/_facilitador.js');
const d = require('../api/_x402-directo.js');

const URL_P = 'https://facilitador.exemplo.test';
const SUPORTA = { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }] };
const T0 = Date.parse('2026-10-17T12:00:00Z');
let agora = T0;
const now = () => agora;

// fetch simulado: regista todos os pedidos
function rede(respostas = {}) {
  const r = { pedidos: [], async fetchFn(url, init = {}) {
    r.pedidos.push({ url, metodo: init.method, corpo: init.body ? JSON.parse(init.body) : null, cabecalhos: init.headers || {} });
    const fn = respostas[url.replace(URL_P, '')];
    if (fn === undefined) throw new Error('sem rota ' + url);
    const out = typeof fn === 'function' ? fn() : fn;
    if (out instanceof Error) throw out;
    return { status: out.status ?? 200, json: async () => out.json };
  } };
  return r;
}
const env = (extra = {}) => ({ ORUM_FACILITATOR_URL: URL_P, ...extra });

// ---- anunciaBaseMainnet: so v2 + exact + eip155:8453 ----
assert.equal(f.anunciaBaseMainnet(SUPORTA), true);
for (const mau of [null, {}, { kinds: [] }, { kinds: [{ x402Version: 1, scheme: 'exact', network: 'base' }] },
  { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:84532' }] }, { kinds: [{ x402Version: 2, scheme: 'upto', network: 'eip155:8453' }] },
  { kinds: [{ scheme: 'exact', network: 'eip155:8453' }] }]) assert.equal(f.anunciaBaseMainnet(mau), false, JSON.stringify(mau));

// ---- URL: so https, sem credenciais nem query; desligavel ----
assert.deepEqual(f.urlsPublicas({}), f.URLS_PADRAO);
assert.ok(f.URLS_PADRAO.length >= 2 && f.URLS_PADRAO.every((u) => u.startsWith('https://')));
assert.deepEqual(f.urlsPublicas({ ORUM_FACILITATOR_URL: 'https://a.test/x/' }), ['https://a.test/x']);
assert.deepEqual(f.urlsPublicas({ ORUM_FACILITATOR_URL: 'https://a.test, https://b.test,https://a.test' }), ['https://a.test', 'https://b.test'], 'ordem preservada, sem repetidos');
assert.deepEqual(f.urlsPublicas({ ORUM_FACILITATOR_URL: 'http://a.test,https://b.test' }), ['https://b.test'], 'descarta as inseguras e fica com as boas');
for (const mau of ['', 'off', 'OFF', '0', 'false', 'none', 'http://a.test', 'https://user:pw@a.test', 'https://a.test?x=1', 'https://a.test#f', 'ftp://a.test', 'javascript:1', 'https://a b.test']) {
  assert.deepEqual(f.urlsPublicas({ ORUM_FACILITATOR_URL: mau }), [], mau);
}

// ---- sondagem: positiva, cache, negativa, expiracao ----
let n = rede({ '/supported': { json: SUPORTA } });
let p = f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now });
assert.equal(await p.pronto(), true);
assert.equal(n.pedidos.length, 1); assert.equal(n.pedidos[0].url, URL_P + '/supported'); assert.equal(n.pedidos[0].metodo, 'GET');
assert.equal(await p.pronto(), true); assert.equal(n.pedidos.length, 1, 'cache positiva');
agora = T0 + f.TTL_OK_MS + 1; assert.equal(await p.pronto(), true); assert.equal(n.pedidos.length, 2, 'cache expira');

agora = T0;
for (const [nome, resp] of [['v1 so', { json: { kinds: [{ x402Version: 1, scheme: 'exact', network: 'base' }] } }], ['HTTP 500', { status: 500, json: {} }], ['falha de rede', new Error('offline')], ['json vazio', { json: null }]]) {
  n = rede({ '/supported': resp }); p = f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now });
  assert.equal(await p.pronto(), false, nome);
  assert.equal(await p.pronto(), false); assert.equal(n.pedidos.length, 1, nome + ': cache negativa curta');
  agora = T0 + f.TTL_FALHA_MS + 1; await p.pronto(); assert.equal(n.pedidos.length, 2, nome + ': volta a sondar'); agora = T0;
}
n = rede({}); p = f.createFacilitadorPublico({ env: env({ ORUM_FACILITATOR_URL: 'off' }), fetchFn: n.fetchFn, now });
assert.equal(await p.pronto(), false); assert.equal(n.pedidos.length, 0, 'desligado nao faz pedidos');

// lista: sonda todos em paralelo; vale o primeiro, por ordem, que anunciar a Base mainnet; o segundo serve de reserva
const URL_B = 'https://reserva.exemplo.test';
const rede2 = (A, B) => { const r = { pedidos: [], async fetchFn(url, init = {}) { r.pedidos.push({ url, metodo: init.method }); const x = url.startsWith(URL_P) ? A : B; const k = '/' + url.split('/').pop(); const out = x[k]; if (out === undefined) throw new Error('sem rota'); if (out instanceof Error) throw out; return { status: out.status ?? 200, json: async () => out.json }; } }; return r; };
const env2 = { ORUM_FACILITATOR_URL: `${URL_P},${URL_B}` };
let n2 = rede2({ '/supported': { json: SUPORTA } }, { '/supported': { json: SUPORTA } });
let p2 = f.createFacilitadorPublico({ env: env2, fetchFn: n2.fetchFn, now });
assert.equal(await p2.pronto(), true); assert.equal(p2.url, URL_P, 'o primeiro por ordem'); assert.equal(n2.pedidos.length, 2, 'sondados os dois');
n2 = rede2({ '/supported': { json: { kinds: [] } } }, { '/supported': { json: SUPORTA } });
p2 = f.createFacilitadorPublico({ env: env2, fetchFn: n2.fetchFn, now });
assert.equal(await p2.pronto(), true); assert.equal(p2.url, URL_B, 'a reserva quando o primeiro nao anuncia');
n2 = rede2({ '/supported': new Error('offline') }, { '/supported': { json: { kinds: [{ x402Version: 1, scheme: 'exact', network: 'base' }] } } });
p2 = f.createFacilitadorPublico({ env: env2, fetchFn: n2.fetchFn, now });
assert.equal(await p2.pronto(), false); assert.equal(p2.url, null);
// o pagamento vai so ao escolhido
n2 = rede2({ '/supported': { json: { kinds: [] } } }, { '/supported': { json: SUPORTA }, '/verify': { json: { isValid: true } } });
p2 = f.createFacilitadorPublico({ env: env2, fetchFn: n2.fetchFn, now });
await p2.chamar('verify', { a: 1 }, { b: 2 });
assert.deepEqual(n2.pedidos.filter((q) => q.metodo === 'POST').map((q) => q.url), [URL_B + '/verify'], 'POST so ao facilitador escolhido');

// ---- chamar: sem sondagem positiva nunca envia; com ela, so verify/settle, sem credenciais ----
n = rede({ '/supported': { json: { kinds: [] } }, '/verify': { json: { isValid: true } } });
p = f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now });
let r = await p.chamar('verify', { a: 1 }, { b: 2 });
assert.match(r.erro, /nao anunciou/); assert.ok(!n.pedidos.some((q) => q.url.endsWith('/verify')), 'sem sondagem positiva nada e enviado');
n = rede({ '/supported': { json: SUPORTA }, '/verify': { json: { isValid: true } }, '/settle': { json: { success: true, transaction: '0x' + 'ab'.repeat(32) } } });
p = f.createFacilitadorPublico({ env: env({ CDP_API_KEY_ID: 'NAO-DEVE-IR', CDP_API_KEY_SECRET: 'NAO-DEVE-IR' }), fetchFn: n.fetchFn, now });
r = await p.chamar('verify', { a: 1 }, { b: 2 }, 'https://x/oraculo');
assert.equal(r.status, 200); assert.equal(r.json.isValid, true);
const v = n.pedidos.find((q) => q.url === URL_P + '/verify');
assert.equal(v.metodo, 'POST'); assert.deepEqual(v.corpo, { x402Version: 2, paymentPayload: { a: 1 }, paymentRequirements: { b: 2 } });
assert.ok(!('authorization' in v.cabecalhos) && !JSON.stringify(v).includes('NAO-DEVE-IR'), 'nenhuma credencial vai ao facilitador publico');
assert.deepEqual(await p.chamar('transfer', {}, {}), { erro: 'operacao invalida' });
assert.deepEqual(await p.chamar('../settle', {}, {}), { erro: 'operacao invalida' });
n = rede({ '/supported': { json: SUPORTA }, '/verify': new Error('tempo') }); p = f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now });
assert.ok((await p.chamar('verify', {}, {})).erro, 'falha de rede devolve erro e nao lanca');

// ---- composto: CDP primeiro; publico so sem CDP e com sondagem; senao nenhum ----
const cdpOn = { configurado: true, chamadas: [], async chamar(k) { cdpOn.chamadas.push(k); return k === 'settle' ? { status: 200, json: { success: true, transaction: TX } } : { status: 200, json: { isValid: true } }; } };
const cdpOff = { configurado: false, async chamar() { throw new Error('nao devia ser chamado'); } };
n = rede({ '/supported': { json: SUPORTA } });
let c = f.createFacilitador({ cdp: cdpOn, publico: f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now }) });
assert.equal(await c.pronto(), 'cdp'); assert.equal(n.pedidos.length, 0, 'com CDP nao se sonda o publico');
await c.chamar('verify', {}, {}, 'u'); assert.deepEqual(cdpOn.chamadas, ['verify']); assert.equal(c.configurado, true);
n = rede({ '/supported': { json: SUPORTA }, '/verify': { json: { isValid: true } } });
c = f.createFacilitador({ cdp: cdpOff, publico: f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now }) });
assert.equal(await c.pronto(), 'publico'); assert.equal(c.configurado, false);
assert.equal((await c.chamar('verify', {}, {}, 'u')).status, 200);
n = rede({ '/supported': { json: { kinds: [] } } });
c = f.createFacilitador({ cdp: cdpOff, publico: f.createFacilitadorPublico({ env: env(), fetchFn: n.fetchFn, now }) });
assert.equal(await c.pronto(), false); assert.match((await c.chamar('verify', {}, {}, 'u')).erro, /nao anunciou/);

// ---- integracao: via directa com o facilitador publico ----
const WALLET = d.WALLET, USDC = d.USDC_BASE, TOPIC = d.TRANSFER_TOPIC;
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const PAYER = '0x1111111111111111111111111111111111111111';
const TX = '0xab' + 'ab'.repeat(31);
const chain = { [TX]: { value: 161000n, to: WALLET } };
const rpc = async (m, params) => {
  if (m === 'eth_getTransactionReceipt') { const x = chain[params[0]]; return x ? { status: '0x1', blockNumber: '0x64', logs: [{ address: USDC.toLowerCase(), topics: [TOPIC, pad(PAYER), pad(x.to)], data: '0x' + x.value.toString(16) }] } : null; }
  if (m === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor((T0 - 30000) / 1000).toString(16) };
  throw new Error('inesperado ' + m);
};
const auth = (o = {}) => ({ from: PAYER, to: WALLET, value: '161000', validAfter: '0', validBefore: String(Math.floor(T0 / 1000) + 300), nonce: '0x' + 'cd'.repeat(32), ...o });
const prova = (a) => ({ x402Version: 2, payload: { signature: '0x' + 'ee'.repeat(65), authorization: a } });
function mkRes() { const h = {}; return { h, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(x) { this.body = x ? JSON.parse(x) : null; } }; }
async function pedir(rede_, pagamento, cdp = cdpOff) {
  const fac = f.createFacilitador({ cdp, publico: f.createFacilitadorPublico({ env: env(), fetchFn: rede_.fetchFn, now }) });
  const handler = d.createHandler({ rpc, now, cdp: fac, esperar: async () => {} });
  const res = mkRes();
  await handler({ headers: pagamento ? { 'payment-signature': Buffer.from(JSON.stringify(pagamento)).toString('base64') } : {} }, res, { base: 'ora-oraculo', rest: '', origin: 'https://ora-x402-gateway.vercel.app' });
  return res;
}
const OK = { '/supported': { json: SUPORTA }, '/verify': { json: { isValid: true, payer: PAYER } }, '/settle': { json: { success: true, transaction: TX } } };
const so = (rn, sufixo) => rn.pedidos.filter((q) => q.url.endsWith(sufixo));

// feliz: sonda, verify, settle, confirmacao na cadeia, entrega; o desafio anuncia o facilitador publico
n = rede(OK); let res = await pedir(n, prova(auth()));
assert.equal(res.statusCode, 200); assert.equal(res.body.via_pagamento, 'eip3009-publico'); assert.equal(res.body.tx_hash, TX);
assert.deepEqual(n.pedidos.map((q) => q.url.replace(URL_P, '')), ['/supported', '/verify', '/settle']);
assert.equal(n.pedidos[1].corpo.paymentRequirements.payTo, WALLET); assert.equal(n.pedidos[1].corpo.paymentRequirements.amount, '161000');
n = rede(OK); res = await pedir(n, null);
assert.equal(res.statusCode, 402); assert.equal(res.body.fronteiras.eip3009_facilitador, true); assert.equal(res.body.fronteiras.facilitador, 'publico'); assert.ok(res.body.como_pagar.caminho_x402_padrao);
assert.match(res.body.fronteiras.prova_aceite, /p[úu]blico/);

// facilitador que NAO anuncia a Base mainnet: nada de verify/settle, recusa clara, o desafio nao promete o caminho padrao
n = rede({ '/supported': { json: { kinds: [{ x402Version: 1, scheme: 'exact', network: 'base' }] } }, '/verify': { json: { isValid: true } }, '/settle': { json: { success: true, transaction: TX } } });
res = await pedir(n, prova(auth()));
assert.equal(res.statusCode, 402); assert.match(res.body.erro, /EIP-3009/); assert.equal(so(n, '/verify').length + so(n, '/settle').length, 0, 'nada enviado a quem nao anunciou');
n = rede({ '/supported': { json: { kinds: [] } } }); res = await pedir(n, null);
assert.equal(res.body.fronteiras.eip3009_facilitador, false); assert.equal(res.body.fronteiras.facilitador, null); assert.equal(res.body.como_pagar.caminho_x402_padrao, undefined);
// facilitador inalcancavel: a via directa continua a aceitar o hash
n = rede({}); res = await pedir(n, { transactionHash: TX });
assert.equal(res.statusCode, 200); assert.equal(res.body.via_pagamento, 'transactionHash');

// pre-verificacoes: autorizacao com destino errado, valor baixo ou expirada nunca chega ao facilitador de terceiros
for (const [nome, a] of [['destino errado', auth({ to: '0x2222222222222222222222222222222222222222' })], ['valor baixo', auth({ value: '1' })], ['expirada', auth({ validBefore: String(Math.floor(T0 / 1000) - 1) })]]) {
  n = rede(OK); res = await pedir(n, prova(a));
  assert.equal(res.statusCode, 402, nome); assert.equal(so(n, '/verify').length + so(n, '/settle').length, 0, nome + ': nao sai do nosso lado');
}
// o facilitador recusa: nao liquida; liquidacao incerta: 503 e aviso; hash falso do facilitador: nao entrega
n = rede({ ...OK, '/verify': { json: { isValid: false, invalidReason: 'invalid_signature' } } }); res = await pedir(n, prova(auth()));
assert.equal(res.statusCode, 402); assert.match(res.body.detalhe, /invalid_signature/); assert.equal(so(n, '/settle').length, 0);
n = rede({ ...OK, '/settle': new Error('tempo') }); res = await pedir(n, prova(auth()));
assert.equal(res.statusCode, 503); assert.equal(res.body.error, 'liquidacao_incerta');
chain[TX] = { value: 1n, to: WALLET }; n = rede(OK); res = await pedir(n, prova(auth()));
assert.equal(res.statusCode, 402); assert.match(res.body.erro, /nao confirmada na cadeia/); assert.equal(res.body.acesso, undefined, 'valor errado na cadeia: nao entrega mesmo com o facilitador a dizer que liquidou');
chain[TX] = { value: 161000n, to: '0x3333333333333333333333333333333333333333' }; n = rede(OK); res = await pedir(n, prova(auth()));
assert.equal(res.statusCode, 402); assert.equal(res.body.acesso, undefined, 'destino errado na cadeia: nao entrega');
chain[TX] = { value: 161000n, to: WALLET };
n = rede({ ...OK, '/settle': { json: { success: true, transaction: 'nao-e-hash' } } }); res = await pedir(n, prova(auth())); assert.equal(res.statusCode, 402); assert.equal(res.body.acesso, undefined);

// com CDP configurado o publico nunca e usado
n = rede(OK); res = await pedir(n, prova(auth()), cdpOn);
assert.equal(res.statusCode, 200); assert.equal(res.body.via_pagamento, 'eip3009-cdp'); assert.equal(n.pedidos.length, 0, 'CDP configurado: nenhum pedido ao publico');

console.log('Facilitador x402: sondagem da Base mainnet, cache, desligavel, URL segura, sem credenciais ao publico, pre-verificacoes antes de terceiros, confirmacao independente na cadeia e prioridade do CDP passaram.');

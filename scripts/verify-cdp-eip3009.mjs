// Verifica a liquidacao EIP-3009 via facilitador CDP na via directa, sem rede e sem pagamentos:
// facilitador e RPC simulados; chave Ed25519 gerada no proprio teste (nunca a real).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createCdp, assinarJwt } = require('../api/_cdp.js');
const d = require('../api/_x402-directo.js');

// ---- JWT: assinatura EdDSA verificavel com a chave publica ----
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const secretB64 = Buffer.concat([seed, pub]).toString('base64');
const KEY_ID = '11111111-2222-3333-4444-555555555555';
const T0 = Date.parse('2026-09-30T15:00:00Z');
const jwt = assinarJwt(KEY_ID, secretB64, 'POST', 'api.cdp.coinbase.com', '/platform/v2/x402/settle', T0);
const [h, p, sig] = jwt.split('.');
assert.ok(crypto.verify(null, Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url')), 'assinatura EdDSA valida');
const head = JSON.parse(Buffer.from(h, 'base64url')), body = JSON.parse(Buffer.from(p, 'base64url'));
assert.deepEqual([head.alg, head.typ, head.kid], ['EdDSA', 'JWT', KEY_ID]);
assert.equal(body.uri, 'POST api.cdp.coinbase.com/platform/v2/x402/settle');
assert.equal(body.iss, 'cdp'); assert.deepEqual(body.aud, ['cdp_service']);
assert.equal(body.exp - body.nbf, 120);
assert.throws(() => assinarJwt(KEY_ID, Buffer.alloc(10).toString('base64'), 'POST', 'h', '/p', T0), /tamanho invalido/);

// ---- cliente: so usa env; sem chaves nao faz pedidos; nunca devolve credenciais ----
assert.equal(createCdp({ env: {} }).configurado, false);
assert.deepEqual(await createCdp({ env: {} }).chamar('verify', {}, {}, 'u'), { erro: 'facilitador nao configurado' });
let visto;
const cdpReal = createCdp({ env: { CDP_API_KEY_ID: KEY_ID, CDP_API_KEY_SECRET: secretB64 }, now: () => T0,
  fetchFn: async (url, init) => { visto = { url, init }; return { status: 200, json: async () => ({ isValid: true }) }; } });
assert.equal(cdpReal.configurado, true);
const r0 = await cdpReal.chamar('verify', { a: 1 }, { b: 2 }, 'https://x/oraculo');
assert.equal(r0.status, 200);
assert.equal(visto.url, 'https://api.cdp.coinbase.com/platform/v2/x402/verify');
assert.match(visto.init.headers.authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
assert.deepEqual(JSON.parse(visto.init.body), { x402Version: 2, paymentPayload: { a: 1 }, paymentRequirements: { b: 2 }, resource: { url: 'https://x/oraculo' } });
const rErro = await createCdp({ env: { CDP_API_KEY_ID: KEY_ID, CDP_API_KEY_SECRET: secretB64 }, fetchFn: async () => { throw new Error('boom ' + secretB64); } }).chamar('verify', {}, {}, 'u');
assert.ok(rErro.erro, 'falha devolve erro');
// (o erro de rede pode citar texto arbitrario; a credencial nunca e injectada por nos)

// ---- via directa: pagamento EIP-3009 ----
const WALLET = d.WALLET, USDC = d.USDC_BASE, TOPIC = d.TRANSFER_TOPIC;
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const PAYER = '0x1111111111111111111111111111111111111111';
const TX = '0x' + 'ab'.repeat(32);
const NOW = Date.parse('2026-09-30T15:00:00Z');
const chain = { [TX]: { value: 161000n, to: WALLET } };
let receiptTentativas = 0, receiptAtraso = 0;
const rpc = async (method, params) => {
  if (method === 'eth_getTransactionReceipt') {
    receiptTentativas++;
    if (receiptTentativas <= receiptAtraso) return null;
    const c = chain[params[0]]; if (!c) return null;
    return { status: '0x1', blockNumber: '0x64', logs: [{ address: USDC.toLowerCase(), topics: [TOPIC, pad(PAYER), pad(c.to)], data: '0x' + c.value.toString(16) }] };
  }
  if (method === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor((NOW - 30000) / 1000).toString(16) };
  throw new Error('inesperado ' + method);
};
const auth = (o = {}) => ({ from: PAYER, to: WALLET, value: '161000', validAfter: '0', validBefore: String(Math.floor(NOW / 1000) + 300), nonce: '0x' + 'cd'.repeat(32), ...o });
const proof = (a) => ({ x402Version: 2, payload: { signature: '0x' + 'ee'.repeat(65), authorization: a } });
const facilitador = (over = {}) => {
  const f = { chamadas: [], configurado: true,
    async chamar(kind, pp, reqs, url) { f.chamadas.push({ kind, pp, reqs, url }); return (over[kind] || (() => kind === 'verify' ? { status: 200, json: { isValid: true } } : { status: 200, json: { success: true, transaction: TX } }))(); } };
  return f;
};
function mkRes() { const h = {}; return { h, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(r) { this.body = r ? JSON.parse(r) : null; } }; }
async function call(cdp, payment, tier = 'ora-oraculo') {
  const handler = d.createHandler({ rpc, now: () => NOW, cdp, esperar: async () => {} });
  const res = mkRes();
  await handler({ headers: payment ? { 'payment-signature': Buffer.from(JSON.stringify(payment)).toString('base64') } : {} }, res, { base: tier, rest: '', origin: 'https://ora-x402-gateway.vercel.app' });
  return res;
}

// feliz: verify -> settle -> confirmacao na cadeia -> entrega
let f = facilitador(); receiptTentativas = 0; receiptAtraso = 0;
let res = await call(f, proof(auth()));
assert.equal(res.statusCode, 200);
assert.equal(res.body.via_pagamento, 'eip3009-cdp'); assert.equal(res.body.tx_hash, TX); assert.equal(res.body.payer, PAYER);
assert.match(res.body.pensamento, /Dia \d+, sigma/);
assert.deepEqual(f.chamadas.map((c) => c.kind), ['verify', 'settle']);
assert.equal(f.chamadas[0].reqs.amount, '161000'); assert.equal(f.chamadas[0].reqs.payTo, WALLET);
assert.equal(f.chamadas[0].url, 'https://ora-x402-gateway.vercel.app/oraculo');
assert.equal(JSON.parse(Buffer.from(res.h['payment-response'], 'base64').toString()).transaction, TX);
assert.equal(res.body.fronteiras.eip3009_facilitador, true);

// o desafio passa a anunciar o caminho padrao quando o facilitador esta configurado
res = await call(f, null);
assert.equal(res.statusCode, 402); assert.ok(res.body.como_pagar.caminho_x402_padrao); assert.equal(res.body.fronteiras.eip3009_facilitador, true);

// sem facilitador configurado: recusa como antes, sem chamadas
f = facilitador(); f.configurado = false;
res = await call(f, proof(auth()));
assert.equal(res.statusCode, 402); assert.match(res.body.erro, /EIP-3009/); assert.equal(f.chamadas.length, 0);

// pre-verificacoes: nao gastam chamadas ao facilitador
for (const [nome, a, re] of [
  ['destino errado', auth({ to: '0x2222222222222222222222222222222222222222' }), /destino diferente/],
  ['valor baixo', auth({ value: '160999' }), /valor insuficiente/],
  ['expirada', auth({ validBefore: String(Math.floor(NOW / 1000) - 1) }), /expirada/],
  ['ainda nao valida', auth({ validAfter: String(Math.floor(NOW / 1000) + 100) }), /ainda nao valida/],
  ['nonce mau', auth({ nonce: '0x12' }), /nonce/],
  ['from mau', auth({ from: 'x' }), /from/],
]) {
  f = facilitador(); res = await call(f, proof(a));
  assert.equal(res.statusCode, 402, nome); assert.match(res.body.detalhe, re, nome); assert.equal(f.chamadas.length, 0, nome);
}

// campo custa 0.33: pagamento de 0.161 nao compra campo
f = facilitador(); res = await call(f, proof(auth()), 'ora-x402');
assert.equal(res.statusCode, 402); assert.match(res.body.detalhe, /valor insuficiente/); assert.equal(f.chamadas.length, 0);

// facilitador recusa no verify: nao liquida
f = facilitador({ verify: () => ({ status: 200, json: { isValid: false, invalidReason: 'invalid_signature' } }) });
res = await call(f, proof(auth()));
assert.equal(res.statusCode, 402); assert.match(res.body.detalhe, /invalid_signature/); assert.deepEqual(f.chamadas.map((c) => c.kind), ['verify']);

// facilitador em baixo: 503 e nada liquidado
f = facilitador({ verify: () => ({ erro: 'tempo esgotado' }) });
res = await call(f, proof(auth()));
assert.equal(res.statusCode, 503); assert.equal(res.body.error, 'facilitador_indisponivel');

// settle falha: 402 sem entrega; settle incerto: 503 com aviso para nao pagar de novo
f = facilitador({ settle: () => ({ status: 200, json: { success: false, errorReason: 'nonce_used' } }) });
res = await call(f, proof(auth())); assert.equal(res.statusCode, 402); assert.match(res.body.detalhe, /nonce_used/); assert.equal(res.body.acesso, undefined);
f = facilitador({ settle: () => ({ erro: 'tempo esgotado' }) });
res = await call(f, proof(auth())); assert.equal(res.statusCode, 503); assert.equal(res.body.error, 'liquidacao_incerta'); assert.match(res.body.nota, /recebimentos/);

// settle diz que liquidou mas a cadeia ainda nao mostra: pending com o hash; depois o hash entrega
f = facilitador(); receiptTentativas = 0; receiptAtraso = 99;
res = await call(f, proof(auth()));
assert.equal(res.statusCode, 402); assert.equal(res.body.x402, 'pending'); assert.equal(res.body.tx_hash, TX); assert.match(res.body.detalhe, /nao pagues de novo/);
receiptAtraso = 0; receiptTentativas = 0;
{
  const handler = d.createHandler({ rpc, now: () => NOW, cdp: facilitador() });
  const r2 = mkRes();
  await handler({ headers: { 'x-payment': Buffer.from(JSON.stringify({ transactionHash: TX })).toString('base64') } }, r2, { base: 'ora-oraculo', rest: '', origin: 'https://ora-x402-gateway.vercel.app' });
  assert.equal(r2.statusCode, 200); assert.equal(r2.body.via_pagamento, 'transactionHash');
}
// pode ainda chegar depois de 1 tentativa sem receipt
f = facilitador(); receiptTentativas = 0; receiptAtraso = 1;
res = await call(f, proof(auth())); assert.equal(res.statusCode, 200); assert.equal(res.body.via_pagamento, 'eip3009-cdp');

// liquidado mas a cadeia mostra valor errado: NAO entrega
chain[TX] = { value: 1n, to: WALLET }; receiptTentativas = 0; receiptAtraso = 0;
f = facilitador(); res = await call(f, proof(auth()));
assert.equal(res.statusCode, 402); assert.match(res.body.erro, /nao confirmada na cadeia/); assert.equal(res.body.acesso, undefined);
chain[TX] = { value: 161000n, to: WALLET };

// hash de liquidacao malformado: nao entrega
f = facilitador({ settle: () => ({ status: 200, json: { success: true, transaction: 'nao-e-hash' } }) });
res = await call(f, proof(auth())); assert.equal(res.statusCode, 402); assert.equal(res.body.acesso, undefined);

console.log('CDP EIP-3009: JWT EdDSA, cliente sem credenciais em claro, pre-verificacoes, verify/settle, confirmacao independente na cadeia e recusas passaram.');

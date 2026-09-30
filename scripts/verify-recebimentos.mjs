// Verifica api/recebimentos.js com RPC Base simulado: sem rede, sem pagamentos.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('../api/_recebimentos.js');
const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const HEAD = 40_000_000, NOW = Date.parse('2026-09-30T14:00:00Z');
const log = (bn, from, val, i = 0) => ({ blockNumber: '0x' + bn.toString(16), logIndex: '0x' + i.toString(16), transactionHash: '0x' + String(i).repeat(64).slice(0, 64),
  address: USDC, topics: [TOPIC, pad(from), pad(WALLET)], data: '0x' + BigInt(val).toString(16) });
const ALL = [log(HEAD - 100, '0x1111111111111111111111111111111111111111', 161000, 1), log(HEAD - 30000, '0x2222222222222222222222222222222222222222', 330000, 2), log(HEAD - 50, '0x3333333333333333333333333333333333333333', 5, 3)];
const calls = [];
const rpc = async (method, params) => {
  calls.push(method);
  if (method === 'eth_getBlockByNumber') return { result: { number: '0x' + HEAD.toString(16), timestamp: '0x' + Math.floor(NOW / 1000).toString(16) }, rpc: 'sim' };
  const [f] = params, a = parseInt(f.fromBlock, 16), b = parseInt(f.toBlock, 16);
  assert.equal(f.address, USDC);
  assert.equal(f.topics[0], TOPIC);
  assert.equal(f.topics[2], pad(WALLET));
  assert.ok(b - a + 1 <= 9000, 'chunk within RPC limits');
  return { result: ALL.filter((l) => { const n = parseInt(l.blockNumber, 16); return n >= a && n <= b; }), rpc: 'sim' };
};
const out = await m.recebimentos(rpc, 24, NOW);
assert.equal(out.n_transferencias, 3);
assert.equal(out.total_usdc, 0.491005);
assert.deepEqual(out.transferencias.map((t) => t.corresponde_ao_preco_de), [null, 'oraculo', 'campo']);
assert.ok(out.transferencias.every((t) => t.classificacao === 'nao_classificada'));
assert.ok(out.transferencias[0].bloco > out.transferencias[1].bloco, 'mais recente primeiro');
assert.equal(out.transferencias[1].hora_estimada_utc, new Date((NOW / 1000 - 100 * 2) * 1000).toISOString());
assert.ok(out.nao_afirma.includes('adopcao externa'));
assert.ok(calls.filter((c) => c === 'eth_getLogs').length >= 5, 'janela de 24h dividida em blocos');
const window = out.janela.bloco_a - out.janela.bloco_de;
assert.equal(window, 43200);

function res() { const h = {}; return { h, setHeader(k, v) { h[k] = v; }, end(r) { this.body = JSON.parse(r); } }; }
const handler = m.createHandler({ rpc, now: () => NOW });
let r = res(); await handler({ query: {} }, r);
assert.equal(r.statusCode, 200); assert.equal(r.body.janela.horas, 24);
r = res(); await handler({ query: { horas: '9999' } }, r);
assert.equal(r.body.janela.horas, 72);
r = res(); await handler({ query: { horas: 'abc' } }, r); assert.equal(r.statusCode, 400);
r = res(); await handler({ query: { horas: '-1' } }, r); assert.equal(r.statusCode, 400);
r = res(); await m.createHandler({ rpc: async () => { throw new Error('offline'); }, now: () => NOW })({ query: {} }, r);
assert.equal(r.statusCode, 503); assert.equal(r.h['cache-control'], 'no-store');
// Rota via proxy: nao toca no Supabase e nao cria funcao nova.
{
  const proxy = require('../api/proxy.js');
  const f = globalThis.fetch; const urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); throw new Error('sem rede no teste'); };
  const pr = res();
  await proxy({ method: 'GET', query: { base: 'recebimentos', horas: '1' }, headers: {}, socket: {} }, pr);
  globalThis.fetch = f;
  assert.ok(urls.length > 0 && urls.every((u) => !u.includes('supabase')), 'so RPC Base, nunca Supabase: ' + urls.join(','));
  assert.equal(pr.statusCode, 503, 'sem rede o RPC falha e responde 503');
}

// Plano Hobby do Vercel: no maximo 12 funcoes (api/*.js sem prefixo _).
{
  const { readdirSync } = await import('node:fs');
  const fns = readdirSync(new URL('../api/', import.meta.url)).filter((n) => n.endsWith('.js') && !n.startsWith('_'));
  assert.ok(fns.length <= 12, `funcoes serverless: ${fns.length} > 12 (${fns.join(', ')})`);
}
const vj = JSON.parse((await import('node:fs')).readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(vj.rewrites.find((r) => r.source === '/economia/recebimentos.json').destination, '/api/proxy?base=recebimentos');
console.log('recebimentos: janela em blocos, filtro Transfer→carteira, preços, ordem, limites e falha de RPC passaram.');

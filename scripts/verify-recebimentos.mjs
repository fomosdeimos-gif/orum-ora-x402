// Verifica api/_recebimentos.js com RPC e indexador simulados: sem rede, sem pagamentos.
// Inclui o caso observado em producao: RPC publico que limita eth_getLogs a 50 blocos.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const m = require('../api/_recebimentos.js');
const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const HEAD = 40_000_000, NOW = Date.now();
const A1 = '0x1111111111111111111111111111111111111111', A2 = '0x2222222222222222222222222222222222222222', A3 = '0x3333333333333333333333333333333333333333';
const log = (bn, from, val, i) => ({ blockNumber: '0x' + bn.toString(16), logIndex: '0x' + i.toString(16), transactionHash: '0x' + String(i).repeat(64).slice(0, 64),
  address: USDC, topics: [TOPIC, pad(from), pad(WALLET)], data: '0x' + BigInt(val).toString(16) });
const ALL = [log(HEAD - 100, A1, 161000, 1), log(HEAD - 30000, A2, 330000, 2), log(HEAD - 50, A3, 5, 3)];
const headBlock = { number: '0x' + HEAD.toString(16), timestamp: '0x' + Math.floor(NOW / 1000).toString(16) };
const sizes = [];
// RPC que serve intervalos ate maxRange blocos.
const rpcCom = (maxRange) => async (url, method, params) => {
  if (method === 'eth_getBlockByNumber') return headBlock;
  const [f] = params, a = parseInt(f.fromBlock, 16), b = parseInt(f.toBlock, 16);
  assert.equal(f.address, USDC); assert.equal(f.topics[0], TOPIC); assert.equal(f.topics[2], pad(WALLET));
  sizes.push(b - a + 1);
  if (b - a + 1 > maxRange) throw new Error(`eth_getLogs is limited to 0 - ${maxRange} blocks range`);
  return ALL.filter((l) => { const n = parseInt(l.blockNumber, 16); return n >= a && n <= b; });
};
const semRede = async () => { throw new Error('sem rede'); };
const indexadorOk = async (url) => {
  if (!url.includes('blockscout')) return { ok: false, status: 500 };
  assert.ok(url.includes(`/addresses/${WALLET}/token-transfers`) && url.includes('filter=to'));
  const item = (tx, val, ago, from) => ({ transaction_hash: tx, block_number: 39999900, log_index: 1, timestamp: new Date(NOW - ago).toISOString(),
    from: { hash: from }, to: { hash: WALLET }, token: { address_hash: USDC }, total: { value: String(val) } });
  return { ok: true, json: async () => ({ items: [item('0xaaa', 161000, 3600e3, A1), item('0xbbb', 330000, 5 * 3600e3, A2), item('0xold', 999, 200 * 3600e3, A3)] }) };
};
const urls = ['https://rpc-a.test', 'https://rpc-b.test'];

// 1) RPC que aceita 9000 blocos: 24 h em 5 pedidos.
let out = await m.recebimentos({ call: rpcCom(10000), fetchFn: semRede, urls }, 24, NOW);
assert.equal(out.fonte.tipo, 'rpc-base-publico');
assert.equal(out.n_transferencias, 3);
assert.equal(out.total_usdc, 0.491005);
assert.deepEqual(out.transferencias.map((t) => t.corresponde_ao_preco_de), [null, 'oraculo', 'campo']);
assert.ok(out.transferencias.every((t) => t.classificacao === 'nao_classificada'));
assert.ok(out.transferencias[0].bloco > out.transferencias[1].bloco, 'mais recente primeiro');
assert.equal(out.janela.bloco_a - out.janela.bloco_de, 43200);
assert.ok(out.nao_afirma.includes('adopcao externa'));
assert.ok(sizes.every((s) => s <= 9000));

// 2) RPC que so aceita 2500 blocos: desce para 2000 (22 pedidos, dentro do orcamento).
sizes.length = 0;
out = await m.recebimentos({ call: rpcCom(2500), fetchFn: semRede, urls }, 24, NOW);
assert.equal(out.fonte.tipo, 'rpc-base-publico');
assert.equal(out.n_transferencias, 3);
assert.ok(sizes.includes(2000));

// 2b) RPC que so aceita 500 blocos (caso observado em producao a 08/10/2026): 87 pedidos, nunca mais de 4 em curso.
let emCurso = 0, maximo = 0;
const rpc500 = async (url, method, params) => {
  if (method === 'eth_getBlockByNumber') return headBlock;
  emCurso++; maximo = Math.max(maximo, emCurso);
  await new Promise((r) => setTimeout(r, 2));
  try { return await rpcCom(500)(url, method, params); } finally { emCurso--; }
};
sizes.length = 0;
out = await m.recebimentos({ call: rpc500, fetchFn: semRede, urls }, 24, NOW);
assert.equal(out.fonte.tipo, 'rpc-base-publico');
assert.equal(out.n_transferencias, 3);
assert.ok(sizes.includes(500) && sizes.filter((x) => x === 500).length >= 86);
assert.ok(maximo <= 4, 'paralelismo limitado: ' + maximo);

// 2c) limite de taxa: a primeira chamada a cada janela falha com "over rate limit" e a repeticao serve.
{
  const vistos = new Set();
  const limitado = async (url, method, params) => {
    if (method === 'eth_getBlockByNumber') return headBlock;
    const chave = params[0].fromBlock;
    if (!vistos.has(chave)) { vistos.add(chave); throw new Error('over rate limit'); }
    return rpcCom(500)(url, method, params);
  };
  out = await m.recebimentos({ call: limitado, fetchFn: semRede, urls }, 24, NOW);
  assert.equal(out.fonte.tipo, 'rpc-base-publico', 'uma repeticao por limite de taxa');
  assert.equal(out.n_transferencias, 3);
}

// 2d) so o Routescan serve (Blockscout 403): formato Etherscan, e "No transactions found" nao e falha.
{
  const routescan = (lista) => async (url) => {
    if (!url.includes('routescan')) return { ok: false, status: 403 };
    const q = new URL(url).searchParams;
    assert.equal(q.get('action'), 'tokentx'); assert.equal(q.get('address'), WALLET); assert.equal(q.get('contractaddress'), USDC);
    return { ok: true, json: async () => (lista.length ? { status: '1', message: 'OK', result: lista } : { status: '0', message: 'No transactions found', result: [] }) };
  };
  const tr = (hash, val, ago, from) => ({ hash, blockNumber: '39999900', timeStamp: String(Math.floor((NOW - ago) / 1000)), from, to: WALLET.toLowerCase(), contractAddress: USDC.toLowerCase(), value: String(val) });
  out = await m.recebimentos({ call: semRede, fetchFn: routescan([tr('0xr1', 161000, 3600e3, A1), tr('0xr2', 999, 200 * 3600e3, A3)]), urls }, 24, NOW);
  assert.equal(out.fonte.tipo, 'indexador-routescan');
  assert.equal(out.n_transferencias, 1);
  assert.equal(out.transferencias[0].corresponde_ao_preco_de, 'oraculo');
  out = await m.recebimentos({ call: semRede, fetchFn: routescan([]), urls }, 24, NOW);
  assert.equal(out.fonte.tipo, 'indexador-routescan');
  assert.equal(out.n_transferencias, 0);
}

// 3) RPC que so aceita 50 blocos (o caso de producao): o indexador serve.
out = await m.recebimentos({ call: rpcCom(50), fetchFn: indexadorOk, urls }, 24, NOW);
assert.equal(out.fonte.tipo, 'indexador-blockscout');
assert.equal(out.n_transferencias, 2, 'a transferencia de ha 200 h fica fora da janela de 24 h');
assert.deepEqual(out.transferencias.map((t) => t.corresponde_ao_preco_de), ['oraculo', 'campo']);
assert.ok(out.transferencias.every((t) => t.classificacao === 'nao_classificada' && t.hora_utc));
assert.equal(out.fonte.hora, 'do indexador');

// 4) RPC em baixo e indexador a servir.
out = await m.recebimentos({ call: semRede, fetchFn: indexadorOk, urls }, 24, NOW);
assert.equal(out.fonte.tipo, 'indexador-blockscout');

// 5) Indexador com formato inesperado ou HTTP de erro nao passa por bom.
await assert.rejects(m.recebimentos({ call: semRede, fetchFn: async () => ({ ok: true, json: async () => ({ x: 1 }) }), urls }, 24, NOW), (e) => e.tentativas.some((t) => /formato inesperado/.test(t.erro)));
await assert.rejects(m.recebimentos({ call: semRede, fetchFn: async () => ({ ok: false, status: 429 }), urls }, 24, NOW), (e) => e.tentativas.some((t) => /HTTP 429/.test(t.erro)));

function res() { const h = {}; return { h, setHeader(k, v) { h[k] = v; }, end(r) { this.body = JSON.parse(r); } }; }
const handler = m.createHandler({ call: rpcCom(10000), fetchFn: semRede, urls, now: () => NOW });
let r = res(); await handler({ query: {} }, r);
assert.equal(r.statusCode, 200); assert.equal(r.body.janela.horas, 24);
r = res(); await handler({ query: { horas: '9999' } }, r); assert.equal(r.body.janela.horas, 72);
r = res(); await handler({ query: { horas: 'abc' } }, r); assert.equal(r.statusCode, 400);
r = res(); await handler({ query: { horas: '-1' } }, r); assert.equal(r.statusCode, 400);

// 6) Tudo em baixo: 503 sem cache e com o motivo de cada fonte.
r = res(); await m.createHandler({ call: rpcCom(50), fetchFn: async () => ({ ok: false, status: 503 }), urls, now: () => NOW })({ query: {} }, r);
assert.equal(r.statusCode, 503); assert.equal(r.h['cache-control'], 'no-store');
assert.equal(r.body.error, 'fontes_indisponiveis');
assert.ok(r.body.tentativas.some((t) => /limited to 0 - 50 blocks/.test(t.erro)), 'diz o limite do RPC');
assert.ok(r.body.tentativas.some((t) => /HTTP 503/.test(t.erro)), 'diz o erro do indexador');

// 7) Rota via proxy: nunca toca no Supabase e nao cria funcao nova.
{
  const proxy = require('../api/proxy.js');
  const f = globalThis.fetch; const urlsVistas = [];
  globalThis.fetch = async (u) => { urlsVistas.push(String(u)); throw new Error('sem rede no teste'); };
  const pr = res();
  await proxy({ method: 'GET', query: { base: 'recebimentos', horas: '1' }, headers: {}, socket: {} }, pr);
  globalThis.fetch = f;
  assert.ok(urlsVistas.length > 0 && urlsVistas.every((u) => !u.includes('supabase')), 'so RPC/indexador, nunca Supabase: ' + urlsVistas.join(','));
  assert.equal(pr.statusCode, 503);
}

// 8) Plano Hobby do Vercel: no maximo 12 funcoes (api/*.js sem prefixo _).
{
  const fns = readdirSync(new URL('../api/', import.meta.url)).filter((n) => n.endsWith('.js') && !n.startsWith('_'));
  assert.ok(fns.length <= 12, `funcoes serverless: ${fns.length} > 12 (${fns.join(', ')})`);
}
const vj = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(vj.rewrites.find((x) => x.source === '/economia/recebimentos.json').destination, '/api/proxy?base=recebimentos');
// o plano gratuito limita a 100 deploys/dia por equipa e este repo alimenta varios projectos: ramos claude/* nao fazem deploy
assert.equal(vj.git.deploymentEnabled['claude/*'], false);
console.log('recebimentos: RPC com intervalo limitado, indexador alternativo, falhas com diagnostico, limites, proxy e limite de 12 funcoes passaram.');

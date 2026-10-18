// Verifica api/_saldos.js (/economia/saldos.json) sem rede: o RPC da Base e simulado. Cada recusa tem de
// acontecer, e cada estrago propositado ao codigo tem de ser apanhado por um dos testes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const API = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'api');
const C = require('../api/_carteira.js');
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const hex = (n) => '0x' + BigInt(n).toString(16);
const hex32 = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const GRANDE = (1n << 60n) + 1n; // nao cabe num Number sem perder o ultimo digito
const NOW = Date.parse('2026-10-18T07:00:00Z');

// RPC simulado: regista os pedidos; saldos por endereco em minusculas
function rpc({ chain = '0x2105', eth = {}, usdc = {}, falha = null, lixo = false } = {}) {
  const r = { pedidos: [], async call(url, method, params) {
    r.pedidos.push({ url, method, params });
    if (falha) throw new Error(falha);
    if (method === 'eth_chainId') return chain;
    if (method === 'eth_blockNumber') return hex(52760000);
    if (lixo) return lixo === true ? 'oops' : lixo;
    if (method === 'eth_getBalance') return hex(eth[params[0].toLowerCase()] ?? 0);
    if (method === 'eth_call') { const a = '0x' + params[0].data.slice(10); return hex32(usdc[a] ?? 0); }
    throw new Error('metodo inesperado ' + method);
  } };
  return r;
}
const res = () => { const h = {}; return { h, statusCode: 0, body: null, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(b) { this.body = JSON.parse(b); } }; };
async function correr(mod, simulado, urls = ['https://rpc.teste']) {
  const out = res();
  await mod.createHandler({ call: simulado.call, urls, now: () => NOW })({ method: 'GET', query: {} }, out);
  return out;
}
const saldos = {
  eth: { [C.OPERACIONAL.toLowerCase()]: GRANDE, [C.SAGRADA_ANTIGA.toLowerCase()]: 0 },
  usdc: { ['0x' + C.SAGRADA_ANTIGA.toLowerCase().slice(2).padStart(64, '0')]: 18_560_000, ['0x' + C.OPERACIONAL.toLowerCase().slice(2).padStart(64, '0')]: 5 },
};

// Carrega api/_saldos.js (ou uma copia estragada) com as mesmas dependencias, sem escrever no disco
function carregar(estrago) {
  const ficheiro = path.join(API, '_saldos.js');
  let src = readFileSync(ficheiro, 'utf8');
  if (estrago) { const [de, para] = estrago; assert.ok(src.includes(de), 'estrago nao aplicavel: ' + de); src = src.replace(de, para); }
  const m = new Module(ficheiro); m.filename = ficheiro; m.paths = Module._nodeModulePaths(API);
  m._compile(src, ficheiro);
  return m.exports;
}

// Todos os testes; devolve a lista de falhas (vazia = tudo certo)
async function testes(mod) {
  const f = [];
  const t = async (nome, fn) => { try { await fn(); } catch (e) { f.push(nome + ': ' + String(e.message).replace(/\s+/g, ' ').slice(0, 300)); } };
  await t('saldos certos, no mesmo bloco', async () => {
    const s = rpc(saldos); const o = await correr(mod, s);
    assert.equal(o.statusCode, 200); assert.equal(o.body.ok, true); assert.equal(o.body.chain_id, 8453); assert.equal(o.body.bloco, 52760000);
    const por = Object.fromEntries(o.body.carteiras.map((c) => [c.papel, c]));
    assert.equal(por.operacional.endereco, C.OPERACIONAL); assert.equal(por.sagrada_antiga.endereco, C.SAGRADA_ANTIGA); assert.equal(por.sagrada_nova.endereco, C.SAGRADA_NOVA);
    assert.equal(por.operacional.eth_wei, GRANDE.toString()); assert.equal(por.operacional.tem_eth, true); assert.equal(por.sagrada_antiga.tem_eth, false);
    assert.equal(por.sagrada_antiga.usdc_atomic, '18560000'); assert.equal(por.sagrada_antiga.usdc, '18.56'); assert.equal(por.operacional.usdc, '0.000005');
    const reais = s.pedidos.filter((p) => p.method === 'eth_getBalance' || p.method === 'eth_call');
    assert.equal(reais.length, 6);
    for (const p of reais) assert.equal(p.params[p.params.length - 1], hex(52760000), 'todas as leituras no mesmo bloco');
    for (const p of s.pedidos.filter((q) => q.method === 'eth_call')) assert.equal(p.params[0].to, USDC);
  });
  await t('RPC que nao e a Base e recusado', async () => {
    const o = await correr(mod, rpc({ ...saldos, chain: '0x1' })); assert.equal(o.statusCode, 503); assert.equal(o.body.ok, false);
  });
  await t('resposta sem forma de saldo e recusada', async () => {
    const o = await correr(mod, rpc({ lixo: true })); assert.equal(o.statusCode, 503);
  });
  await t('saldo em decimal ou com tamanho errado e recusado', async () => {
    assert.equal((await correr(mod, rpc({ lixo: '12345' }))).statusCode, 503);
    assert.equal((await correr(mod, rpc({ lixo: '0x01' }))).statusCode, 503);
  });
  await t('falha do RPC nunca vira saldo zero', async () => {
    const o = await correr(mod, rpc({ falha: 'over rate limit' })); assert.equal(o.statusCode, 503); assert.equal(o.body.ok, false);
    assert.ok(!('carteiras' in o.body)); assert.match(JSON.stringify(o.body.tentativas), /over rate limit/);
  });
  await t('passa ao RPC seguinte quando o primeiro falha', async () => {
    const s = rpc(saldos); const antes = s.call;
    s.call = async (url, ...a) => { if (url === 'https://um.teste') throw new Error('indisponivel'); return antes(url, ...a); };
    const o = await correr(mod, s, ['https://um.teste', 'https://dois.teste']); assert.equal(o.statusCode, 200);
  });
  await t('nao afirma mais do que leu', async () => {
    const o = await correr(mod, rpc(saldos)); assert.ok(o.body.nao_afirma.length >= 4);
    assert.match(o.body.nao_afirma.join(' '), /chegue para uma transferencia/); assert.match(o.body.nao_afirma.join(' '), /receita reconhecida/);
  });
  await t('so leitura: nenhum metodo que escreva', async () => {
    const s = rpc(saldos); await correr(mod, s);
    for (const p of s.pedidos) assert.ok(['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_call'].includes(p.method), p.method);
  });
  return f;
}

const real = carregar();
const falhas = await testes(real);
assert.deepEqual(falhas, [], 'o modulo real falha: ' + falhas.join(' | '));

// Estragos propositados: cada um tem de fazer falhar pelo menos um teste
const ESTRAGOS = [
  ['aceita qualquer rede', ["!== CHAIN_ID) throw new Error('rpc nao e a Base mainnet')", "=== 'nunca') throw new Error('x')"]],
  ['nao valida a forma do saldo', ["if (!/^0x[0-9a-fA-F]+$/.test(eth) || !/^0x[0-9a-fA-F]{64}$/.test(usdc)) throw new Error('saldo invalido');", '']],
  ['le no bloco mais recente em vez do mesmo bloco', ["[endereco, bloco], CHAMADA_MS", "[endereco, 'latest'], CHAMADA_MS"]],
  ['contrato USDC errado', ["const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'", "const USDC_BASE = '0x0000000000000000000000000000000000000001'"]],
  ['rotula a nova como operacional', ["['operacional', OPERACIONAL]", "['operacional', SAGRADA_NOVA]"]],
  ['perde precisao nos saldos grandes', ["const dec = (h) => BigInt(h).toString();", "const dec = (h) => String(Number(h));"]],
  ['falha vira zero', ["} catch (e) { tentativas.push({ fonte: url, erro: curto(e) }); }", "} catch (e) { return { ok: true, rede: 'base-mainnet', chain_id: 8453, bloco: 0, carteiras: [], nao_afirma: ['a', 'b', 'c', 'd'] }; }"]],
  ['tira as fronteiras', ["nao_afirma: [", "nao_afirma_removido: ["]],
  ['gas sempre presente', ["tem_eth: BigInt(eth) > 0n", "tem_eth: true"]],
];
let apanhados = 0;
for (const [nome, estrago] of ESTRAGOS) {
  const f = await testes(carregar(estrago));
  assert.ok(f.length > 0, `estrago nao apanhado: ${nome}`);
  apanhados++;
}
console.log(JSON.stringify({ verified: true, testes_ao_modulo_real: 8, estragos_apanhados: apanhados }));

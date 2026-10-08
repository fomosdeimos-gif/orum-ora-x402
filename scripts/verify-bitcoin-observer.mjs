// Verifica api/_bitcoin.js com fontes Esplora simuladas: sem rede, sem chaves, sem fundos.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('../api/_bitcoin.js');
const REC = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf';
const OP = 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7';
const EXT = 'bc1qexternoexternoexternoexternoexternoabc';
const NOW = Date.now(), TIP = 966500;
const tx = (txid, h, ts, de, para, valor) => ({ txid, status: h ? { confirmed: true, block_height: h, block_time: Math.floor(ts / 1000) } : { confirmed: false },
  vin: [{ prevout: { scriptpubkey_address: de, value: valor + 200 } }], vout: [{ scriptpubkey_address: para, value: valor }] });
const dados = {
  [REC]: { stats: { chain_stats: { funded_txo_sum: 15000, spent_txo_sum: 0, tx_count: 2 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } },
    txs: [tx('a'.repeat(64), TIP - 2, NOW - 3e6, EXT, REC, 10000), tx('b'.repeat(64), TIP - 10, NOW - 9e6, OP, REC, 5000)] },
  [OP]: { stats: { chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } }, txs: [] },
};
const esplora = (alt = {}) => async (url) => {
  const host = new URL(url).host;
  if (alt[host] === 'cai') throw new Error('sem rede');
  const path = new URL(url).pathname.replace(/^\/api/, '');
  if (path === '/blocks/tip/height') return { ok: true, json: async () => TIP };
  const mm = path.match(/^\/address\/(\w+)(\/txs)?$/);
  assert.ok(mm, 'rota inesperada ' + path);
  const d = dados[mm[1]];
  if (alt[host] === 'diverge' && mm[1] === REC && !mm[2]) return { ok: true, json: async () => ({ ...d.stats, chain_stats: { ...d.stats.chain_stats, funded_txo_sum: 14000 } }) };
  return { ok: true, json: async () => (mm[2] ? d.txs : d.stats) };
};

// 1) as duas fontes concordam
let out = await m.observar({ fetchFn: esplora() }, NOW);
const rec = out.enderecos.find((e) => e.papel === 'recepcao'), op = out.enderecos.find((e) => e.papel === 'operacional');
assert.equal(rec.concordancia, 'concordam');
assert.equal(rec.saldo_confirmado_sats, 15000);
assert.equal(op.saldo_confirmado_sats, 0);
assert.equal(rec.transacoes.length, 2);
assert.equal(rec.transacoes[0].confirmacoes, 3);
assert.equal(rec.transacoes[0].estado, 'confirmando');
assert.equal(rec.transacoes[1].estado, 'confirmada');
assert.equal(rec.transacoes[0].de_carteira_operacional_orum, false, 'origem externa nao e marcada como operacional');
assert.equal(rec.transacoes[1].de_carteira_operacional_orum, true, 'so o endereco operacional declarado e marcado');
assert.ok(rec.transacoes.every((t) => t.classificacao === 'nao_classificada'), 'nunca se infere interno/externo');
assert.ok(out.nao_afirma.includes('adopcao externa') && out.nao_afirma.some((x) => x.startsWith('controlo')));

// 2) discrepancia: nao se escolhe um numero
out = await m.observar({ fetchFn: esplora({ 'mempool.space': 'diverge' }) }, NOW);
const d = out.enderecos.find((e) => e.papel === 'recepcao');
assert.equal(d.concordancia, 'DISCREPANCIA');
assert.equal(d.saldo_confirmado_sats, null);
assert.equal(d.fontes.length, 2);

// 3) fonte unica: declarada como tal
out = await m.observar({ fetchFn: esplora({ 'mempool.space': 'cai' }) }, NOW);
assert.equal(out.enderecos[0].concordancia, 'fonte_unica');
assert.equal(out.enderecos[0].fontes.find((f) => f.fonte === 'mempool.space').ok, false);

// 4) nenhuma fonte: erro com tentativas e 503 no handler
await assert.rejects(() => m.observar({ fetchFn: esplora({ 'blockstream.info': 'cai', 'mempool.space': 'cai' }) }, NOW), (e) => e.tentativas.length === 4);
const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
await m.createHandler({ fetchFn: esplora({ 'blockstream.info': 'cai', 'mempool.space': 'cai' }) })({}, res);
assert.equal(res.statusCode, 503);
assert.equal(res.headers['cache-control'], 'no-store');
await m.createHandler({ fetchFn: esplora() })({}, res);
assert.equal(res.statusCode, 200);
console.log('verify-bitcoin-observer: ok');

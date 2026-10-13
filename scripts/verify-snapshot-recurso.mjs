// Verifica, sem rede, que /pulso e /api/previsoes passam a servir a copia estatica desactualizada
// quando o Supabase devolve 402 (quota), 5xx ou falha de rede — e que continuam a repassar a resposta viva quando esta e boa.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const proxy = require('../api/proxy.js');
const previsoes = require('../api/previsoes.js');

const mkRes = () => { const r = { statusCode: 0, headers: {}, body: '', headersSent: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = (b = '') => { r.body = String(b); r.headersSent = true; }; return r; };
const real = globalThis.fetch;
const set = (fn) => { globalThis.fetch = fn; };
const J = (o, status = 200, h = {}) => ({ status, ok: status < 400, headers: { get: (k) => h[k.toLowerCase()] ?? null }, text: async () => JSON.stringify(o), json: async () => o });
const req = (base) => ({ method: 'GET', query: { base }, headers: { host: 'ora-x402-gateway.vercel.app' } });
const out = {};

for (const [nome, resposta] of [['402_quota', () => J({ error: 'exceed_cached_egress_quota' }, 402)], ['503', () => J({}, 503)], ['rede', () => { throw new Error('ECONNRESET'); }]]) {
  set(async () => resposta());
  const r = mkRes(); await proxy(req('ora-pulso'), r);
  const b = JSON.parse(r.body);
  assert.equal(r.statusCode, 200, nome); assert.equal(b.estado, 'snapshot_desactualizado', nome);
  assert.equal(r.headers['x-ora-fonte'], 'snapshot-desactualizado', nome);
  assert.ok(b.campo && b.campo.dia > 0 && b.snapshot_observado_em && b.idade_s >= 0, nome);
  out['pulso_' + nome] = 'ok';
}
// resposta viva boa passa intacta, sem marca de snapshot
set(async () => J({ campo: { dia: 1 }, eventos: [], timestamp: 'x' }, 200, { 'content-type': 'application/json' }));
{ const r = mkRes(); await proxy(req('ora-pulso'), r); assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).estado, undefined); assert.equal(r.headers['x-ora-fonte'], undefined); out.pulso_vivo = 'ok'; }
// um servico pago NAO cai para snapshot (so ora-pulso)
set(async () => J({ error: 'exceed_cached_egress_quota' }, 402));
{ const r = mkRes(); await proxy(req('ora-licenca'), r); assert.notEqual(r.headers['x-ora-fonte'], 'snapshot-desactualizado'); out.licenca_sem_snapshot = 'ok'; }
// previsoes
set(async () => J({ error: 'x' }, 402));
{ const r = mkRes(); await previsoes({}, r); const b = JSON.parse(r.body); assert.equal(r.statusCode, 200); assert.equal(b.estado, 'snapshot_desactualizado'); assert.equal(b.schema, 'ora-previsoes/v2'); assert.equal(b.latest.outcome, null); assert.ok(b.stats.total > 0); out.previsoes_recurso = 'ok'; }
set(async () => J({ schema: 'ora-previsoes/v2', stats: { total: 9 } }));
{ const r = mkRes(); await previsoes({}, r); assert.equal(JSON.parse(r.body).stats.total, 9); assert.equal(JSON.parse(r.body).estado, undefined); out.previsoes_vivo = 'ok'; }
globalThis.fetch = real;
console.log(JSON.stringify({ verified: true, ...out }));

// Verifica a skill A2A paga `leitura_verificada` (api/_a2a-leitura.js + api/a2a.js): fluxo da extensão a2a-x402 v0.1 nas chaves e
// estados, sem rede nem pagamentos reais (RPC Base e leitor simulados). A porta gratuita tem de ficar como estava.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
process.env.ORUM_PEDIDOS = 'off';
process.env.ORUM_FACILITATOR_URL = 'off';
process.env.ORUM_BTC_RAIL = 'off';
const require = createRequire(import.meta.url);
const d = require('../api/_x402-directo.js');
const handler = require('../api/a2a.js');
const { criar, URI, K } = require('../api/_a2a-leitura.js');
const { validarLeitura } = require('../api/_leitura.js');

const NOW = Date.parse('2026-11-15T12:00:00Z');
const pad = (h) => '0x' + h.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const PAYER = '0x1111111111111111111111111111111111111111';
const tx = (n) => '0x' + String(n).repeat(64).slice(0, 64);
const chain = { [tx(7)]: { value: 10000n, ageS: 60 }, [tx(8)]: { value: 9999n, ageS: 60 }, [tx(5)]: { value: 161000n, ageS: 60 } };
const rpc = async (method, params) => {
  if (method === 'eth_getTransactionReceipt') { const c = chain[params[0]]; if (!c) return null;
    return { status: '0x1', blockNumber: '0x' + (100 + Number(params[0].slice(2, 3))).toString(16), logs: [{ address: d.USDC_BASE.toLowerCase(), topics: [d.TRANSFER_TOPIC, pad(PAYER), pad(d.WALLET)], data: '0x' + c.value.toString(16) }] }; }
  if (method === 'eth_getBlockByNumber') { const c = Object.entries(chain).find(([h]) => 100 + Number(h.slice(2, 3)) === parseInt(params[0], 16))[1]; return { timestamp: '0x' + Math.floor((NOW - c.ageS * 1000) / 1000).toString(16) }; }
  throw new Error('unexpected ' + method);
};
const boa = { formato: 'orum-leitura-verificada/v1', lido_em: '2026-11-15T12:00:00.000Z',
  valium_na_sagrada: { carteira: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', contrato: '0x37f70bccdc2125346a7542fe6e7fc70e33421635', decimais: 18, estado: 'concordam', verificado: true, bloco: 7, valor_wei: '1500000000000000000', valium: '1.5', fontes_ok: ['a', 'b', 'c'], fontes_falhadas: [] },
  fundacao_btc: { estado: 'concordam', verificado: true, endereco: 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7', fontes_ok: ['a', 'b'], fontes_falhadas: [], saldo_confirmado_sats: 10072, saldo_mempool_sats: 0, transaccoes_confirmadas: 2 },
  regra: 'só diz concordam com pelo menos duas fontes iguais', nao_afirma: ['receita', 'procura', 'preco do VALIUM', 'reserva ou lastro'] };
assert.deepEqual(validarLeitura(boa), []);
const directo = (leitor) => d.createHandler({ rpc, now: () => NOW, leitor });
handler.definirLeitura(criar({ directo: directo({ ler: async () => boa }), now: () => NOW }));

async function call(msg, headers = {}) {
  let value; const hs = {};
  const res = { setHeader(k, v) { hs[k.toLowerCase()] = v; }, end(raw) { value = raw ? JSON.parse(raw) : null; } };
  await handler({ method: 'POST', body: msg, headers }, res);
  return { status: res.statusCode, body: value, h: hs };
}
const msg = (text, extra = {}, id = 'm1') => ({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { kind: 'message', role: 'user', messageId: id, parts: [{ kind: 'text', text }], ...extra } } });
const pago = (taskId, contextId, payload, status = 'payment-submitted', id = 'm2') => msg('pagamento', { taskId, contextId, metadata: { [K.status]: status, ...(payload ? { [K.payload]: payload } : {}) } }, id);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const igual = (a, b, m) => { assert.equal(a, b, m); n++; };

// 1. pedido sem pagamento: Task input-required com os requisitos x402 v2
const a = await call(msg('leitura_verificada'), { 'x-a2a-extensions': URI });
igual(a.status, 200); const t = a.body.result;
igual(t.kind, 'task'); igual(t.status.state, 'input-required'); igual(t.status.message.metadata[K.status], 'payment-required');
const req = t.status.message.metadata[K.required];
igual(req.x402Version, 2); igual(req.accepts[0].amount, '10000'); igual(req.accepts[0].payTo, d.WALLET); igual(req.accepts[0].network, 'eip155:8453');
igual(req.accepts[0].asset, d.USDC_BASE); ok(req.extensions.bazaar, 'declaração Bazaar'); ok(!('error' in req));
igual(a.h['x-a2a-extensions'], URI, 'ecoa a extensão se o cliente a activar');
ok(/não afirma que alguém pagou/.test(t.status.message.parts[0].text), 'diz que não afirma pagamento');
ok(/^[0-9a-f]{64}$/.test(t.id)); ok(t.contextId.startsWith('orum-a2a-v1:leitura:'));
igual((await call(msg('leitura_verificada'))).h['x-a2a-extensions'], undefined, 'sem activação não ecoa');
assert.deepEqual((await call(msg('leitura_verificada', { contextId: t.contextId }), { 'x-a2a-extensions': URI })).body.result, (await call(msg('leitura_verificada', { contextId: t.contextId }))).body.result); n++; // determinístico no mesmo contexto
const taskId = t.id, contextId = t.contextId;

// 2. pagamento por transactionHash: Task completed com a leitura e o recibo
const c = await call(pago(taskId, contextId, { transactionHash: tx(7) }));
const tc = c.body.result;
igual(tc.status.state, 'completed'); igual(tc.id, taskId); igual(tc.contextId, contextId);
igual(tc.status.message.metadata[K.status], 'payment-completed');
const rec = tc.status.message.metadata[K.receipts][0];
igual(rec.success, true); igual(rec.transaction, tx(7)); igual(rec.network, 'eip155:8453'); igual(rec.payer, PAYER);
igual(tc.artifacts.length, 1); assert.deepEqual(tc.artifacts[0].parts[0].data, boa); n++;
assert.deepEqual(validarLeitura(tc.artifacts[0].parts[0].data), []); n++;
ok(/Não prova receita, procura nem preço/.test(tc.status.message.parts[0].text));
// payload no formato PaymentPayload do x402 v2 (a assinatura é recusada sem facilitador, mas o formato é lido): falha limpa, nada entregue
const p = await call(pago(taskId, contextId, { x402Version: 2, scheme: 'exact', network: 'eip155:8453', accepted: req.accepts[0], payload: { signature: '0x' + 'ab'.repeat(65), authorization: { from: PAYER, to: d.WALLET, value: '10000', validAfter: '0', validBefore: String(Math.floor(NOW / 1000) + 600), nonce: '0x' + 'cd'.repeat(32) } } }));
igual(p.body.result.status.state, 'failed'); igual(p.body.result.status.message.metadata[K.status], 'payment-failed'); ok(!p.body.result.artifacts);

// 3. falhas
const insuf = (await call(pago(taskId, contextId, { transactionHash: tx(8) }))).body.result;
igual(insuf.status.state, 'failed'); igual(insuf.status.message.metadata[K.error], 'INVALID_PAYMENT'); ok(!insuf.artifacts); ok(/valor insuficiente/.test(insuf.status.message.parts[0].text));
const outro = (await call(pago(taskId, contextId, { transactionHash: tx(5) }))).body.result; // paga o oráculo (0,161) e basta: o valor cobre, a leitura entrega
igual(outro.status.state, 'completed', 'quem paga mais do que o preço também recebe a leitura');
const inex = (await call(pago(taskId, contextId, { transactionHash: tx(9) }))).body.result;
igual(inex.status.state, 'working'); igual(inex.status.message.metadata[K.error], 'PAYMENT_PENDING'); ok(/não pagues de novo/.test(inex.status.message.parts[0].text));
const btc = (await call(pago(taskId, contextId, { bitcoin: { txid: 'a'.repeat(64) } }))).body.result;
igual(btc.status.state, 'failed'); ok(!btc.artifacts);
const rej = (await call(pago(taskId, contextId, null, 'payment-rejected'))).body.result;
igual(rej.status.state, 'canceled'); igual(rej.status.message.metadata[K.status], 'payment-rejected'); igual(rej.status.message.metadata[K.error], 'CLIENT_REJECTED');
handler.definirLeitura(criar({ directo: directo({ ler: async () => { throw new Error('fontes em baixo'); } }), now: () => NOW }));
const fal = (await call(pago(taskId, contextId, { transactionHash: tx(7) }))).body.result;
igual(fal.status.state, 'failed'); igual(fal.status.message.metadata[K.error], 'SERVICE_UNAVAILABLE'); ok(!fal.artifacts);
handler.definirLeitura(criar({ directo: directo({ ler: async () => boa }), now: () => NOW }));

// 4. pedidos mal formados (códigos A2A, nada entregue)
igual((await call(pago(undefined, contextId, { transactionHash: tx(7) }))).body.error.code, -32602, 'taskId é obrigatório no pagamento');
igual((await call(pago('curto', contextId, { transactionHash: tx(7) }))).body.error.code, -32602);
igual((await call(pago(taskId, contextId, 'texto'))).body.error.code, -32602);
igual((await call(pago(taskId, contextId, ['x']))).body.error.code, -32602);
igual((await call(pago(taskId, contextId, null))).body.error.code, -32602, 'sem payload');
igual((await call(msg('pagamento', { taskId, contextId, metadata: { [K.status]: 'payment-completed' } }))).body.error.code, -32602, 'o cliente não pode declarar payment-completed');
igual((await call(msg('pagamento', { taskId, contextId, metadata: { [K.status]: 'payment-verified', [K.payload]: { transactionHash: tx(7) } } }))).body.error.code, -32602);

// 5. a porta gratuita não mudou: taskId sem pagamento continua TaskNotFound, tasks/get também, e o diálogo grátis responde
igual((await call(msg('Que sabes sobre a Obra 2?', { taskId }))).body.error.code, -32001);
igual((await call({ jsonrpc: '2.0', id: 4, method: 'tasks/get' })).body.error.code, -32001);
igual((await call(msg('leitura_verificada', { taskId }))).body.error.code, -32001, 'taskId sem estado de pagamento não abre a skill paga');
igual((await call(msg('Que sabes sobre a Obra 2?'))).body.result.kind, 'message');
ok(!JSON.stringify((await call(msg('Que sabes sobre a Obra 2?'))).body).includes('x402.payment'), 'o diálogo grátis não fala de pagamento A2A');
igual((await call(msg('compare_texts {"left":"a","right":"b"}'))).body.result.metadata.outcome, 'compared');
console.log(JSON.stringify({ verified: true, ok: true, skill: 'leitura_verificada', extensao: URI, conformidade: 'parcial (ver cabeçalho de api/_a2a-leitura.js)', verificacoes: n }));

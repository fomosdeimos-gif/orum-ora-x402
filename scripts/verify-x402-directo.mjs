// Verifica a via x402 directa (api/_x402-directo.js) e o seu uso pelo proxy
// quando o Supabase responde com quota esgotada. Sem rede, sem pagamentos reais:
// o RPC Base e o Supabase sao simulados.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
process.env.ORUM_PEDIDOS = 'off'; // o registo de pedidos (api/_pedidos.js) adia res.end; tem o seu verificador (verify-pedidos-directos.mjs)
// hermetico: sem facilitador publico nem rede (o proxy cria o seu handler com o ambiente por omissao)
process.env.ORUM_FACILITATOR_URL = 'off';
process.env.ORUM_BTC_RAIL = 'off'; // idem para a via Bitcoin: tem o seu verificador (btc-servicos:verify)
const require = createRequire(import.meta.url);
const d = require('../api/_x402-directo.js');

const NOW = Date.parse('2026-09-30T12:00:00Z');
const pad = (hex) => '0x' + hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const PAYER = '0x1111111111111111111111111111111111111111';
const tx = (n) => '0x' + String(n).repeat(64).slice(0, 64);
const chain = {
  [tx(1)]: { value: 161000n, ageS: 60 },            // oraculo exacto
  [tx(2)]: { value: 330000n, ageS: 3600 },          // campo exacto
  [tx(3)]: { value: 100000n, ageS: 60 },            // insuficiente
  [tx(4)]: { value: 400000n, ageS: 80 * 3600 },     // fora da janela
  [tx(5)]: { value: 161000n, ageS: 60, to: '0x2222222222222222222222222222222222222222' },
  [tx(6)]: { value: 161000n, ageS: 60, failed: true },
  [tx(7)]: { value: 10000n, ageS: 60 },             // leitura exacta (0,01 USDC)
  [tx(8)]: { value: 9999n, ageS: 60 },              // leitura: um atomo a menos
};
const rpc = async (method, params) => {
  if (method === 'eth_getTransactionReceipt') {
    const c = chain[params[0]];
    if (!c) return null;
    return { status: c.failed ? '0x0' : '0x1', blockNumber: '0x' + (100 + Number(params[0].slice(2, 3))).toString(16),
      logs: [{ address: d.USDC_BASE.toLowerCase(), topics: [d.TRANSFER_TOPIC, pad(PAYER), pad(c.to || d.WALLET)], data: '0x' + c.value.toString(16) }] };
  }
  if (method === 'eth_getBlockByNumber') {
    const c = Object.entries(chain).find(([h]) => 100 + Number(h.slice(2, 3)) === parseInt(params[0], 16))[1];
    return { timestamp: '0x' + Math.floor((NOW - c.ageS * 1000) / 1000).toString(16) };
  }
  throw new Error('unexpected ' + method);
};
const handler = d.createHandler({ rpc, now: () => NOW });
const ORIGIN = 'https://ora-x402-gateway.vercel.app';
function mockRes() {
  const h = {};
  return { h, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } };
}
async function call(base, rest, payment) {
  const res = mockRes();
  const req = { headers: payment ? { 'x-payment': Buffer.from(JSON.stringify(payment)).toString('base64') } : {} };
  const handled = await handler(req, res, { base, rest, origin: ORIGIN });
  return { handled, status: res.statusCode, body: res.body, h: res.h };
}

// Routing: only DB-free services are handled.
assert.equal((await call('ora-x402', 'sedimento')).handled, false);
assert.equal((await call('ora-x402', 'kernel')).handled, false);
assert.equal((await call('ora-licenca', '')).handled, false);

// Challenge is a valid x402 v2 402 with PAYMENT-REQUIRED matching the body.
const ch = await call('ora-oraculo', '');
assert.equal(ch.status, 402);
const req = JSON.parse(Buffer.from(ch.h['payment-required'], 'base64').toString());
assert.equal(req.x402Version, 2);
assert.equal(req.resource.url, ORIGIN + '/oraculo');
assert.deepEqual(req.accepts, ch.body.x402_v2.accepts);
assert.deepEqual(ch.body.x402_v2, req, "a copia v2 do corpo e o cabecalho PAYMENT-REQUIRED, byte a byte");
assert.equal(req.accepts[0].amount, '161000');
assert.equal(req.accepts[0].payTo, d.WALLET);
// Bazaar discovery: x402scan so marca a rota como invocavel com input schema.
assert.equal(req.extensions.bazaar.info.input.type, 'http');
assert.equal(req.extensions.bazaar.info.input.method, 'GET');
assert.equal(req.extensions.bazaar.info.output.type, 'json');
assert.deepEqual(req.extensions.bazaar.schema.required, ['input']);
assert.deepEqual(ch.body.extensions, req.extensions);
assert.equal(req.accepts[0].network, 'eip155:8453');
assert.equal(ch.h['x-ora-via'], 'vercel-directa');
assert.equal((await call('ora-x402', '')).body.resource.url, ORIGIN + '/campo');

// Paid oraculo: granted, deterministic per tx (re-access, not a new reading).
const ok = await call('ora-oraculo', '', { transactionHash: tx(1) });
assert.equal(ok.status, 200);
assert.equal(ok.body.acesso, 'concedido');
assert.equal(ok.body.payer, PAYER);
assert.match(ok.body.pensamento, /Dia \d+, sigma/);
const pr = JSON.parse(Buffer.from(ok.h['payment-response'], 'base64').toString());
assert.equal(pr.success, true);
assert.equal(pr.transaction, tx(1));
assert.deepEqual((await call('ora-oraculo', '', { transactionHash: tx(1) })).body, ok.body);
assert.equal(ok.body.fronteiras.livro_interno_escrito, false);

// Campo accepts its own price; oraculo-sized payment does not buy campo.
assert.equal((await call('ora-x402', '', { transactionHash: tx(2) })).status, 200);
assert.match((await call('ora-x402', '', { transactionHash: tx(1) })).body.detalhe, /valor insuficiente/);

// Rejections.
assert.match((await call('ora-oraculo', '', { transactionHash: tx(3) })).body.detalhe, /valor insuficiente/);
assert.match((await call('ora-oraculo', '', { transactionHash: tx(4) })).body.detalhe, /fora da janela/);
assert.match((await call('ora-oraculo', '', { transactionHash: tx(5) })).body.detalhe, /sem transferencia/);
assert.match((await call('ora-oraculo', '', { transactionHash: tx(6) })).body.detalhe, /falhou/);
assert.match((await call('ora-oraculo', '', { transactionHash: '0x12' })).body.detalhe, /hash invalido/);
const pend = await call('ora-oraculo', '', { transactionHash: tx(9) });
assert.equal(pend.status, 402);
assert.equal(pend.body.x402, 'pending');
assert.match((await call('ora-oraculo', '', { payload: { signature: '0x1', authorization: {} } })).body.erro, /EIP-3009/);
const garbage = mockRes();
await handler({ headers: { 'x-payment': '%%%' } }, garbage, { base: 'ora-oraculo', rest: '', origin: ORIGIN });
assert.equal(garbage.body.erro, 'X-PAYMENT ilegivel');

// RPC outage is a 503 that does not consume the tx.
const down = d.createHandler({ rpc: async () => { throw new Error('offline'); }, now: () => NOW });
const dres = mockRes();
await down({ headers: { 'x-payment': JSON.stringify({ transactionHash: tx(1) }) } }, dres, { base: 'ora-oraculo', rest: '', origin: ORIGIN });
assert.equal(dres.statusCode, 503);


// Leitura verificada (15/11/2026): 0,01 USDC, só Base, entrega a leitura do leitor; o leitor aqui é simulado (sem rede).
{
  const { validarLeitura } = require('../api/_leitura.js');
  const boa = { formato: 'orum-leitura-verificada/v1', lido_em: '2026-09-30T12:00:00.000Z',
    valium_na_sagrada: { carteira: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', contrato: '0x37f70bccdc2125346a7542fe6e7fc70e33421635', decimais: 18, estado: 'concordam', verificado: true, bloco: 1, valor_wei: '1500000000000000000', valium: '1.5', fontes_ok: ['a', 'b'], fontes_falhadas: [] },
    fundacao_btc: { estado: 'concordam', verificado: true, endereco: 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7', fontes_ok: ['a', 'b'], fontes_falhadas: [], saldo_confirmado_sats: 10072, saldo_mempool_sats: 0, transaccoes_confirmadas: 2 },
    regra: 'só diz concordam com pelo menos duas fontes iguais', nao_afirma: ['receita', 'procura', 'preco do VALIUM', 'reserva ou lastro'] };
  assert.deepEqual(validarLeitura(boa), []);
  let leituras = 0;
  const hL = d.createHandler({ rpc, now: () => NOW, leitor: { ler: async () => { leituras++; return { ...boa, lido_em: 'leitura-' + leituras }; } } });
  const callL = async (rest, payment) => {
    const res = mockRes();
    const rq = { headers: payment ? { 'x-payment': Buffer.from(JSON.stringify(payment)).toString('base64') } : {} };
    const handled = await hL(rq, res, { base: 'ora-leitura', rest, origin: ORIGIN });
    return { handled, status: res.statusCode, body: res.body, h: res.h };
  };
  // desafio: 402 v2, 10000 atomos, payTo operacional, Bazaar, sem via Bitcoin
  const cl = await callL('');
  assert.equal(cl.status, 402);
  const reqL = JSON.parse(Buffer.from(cl.h['payment-required'], 'base64').toString());
  assert.equal(reqL.accepts[0].amount, '10000'); assert.equal(reqL.accepts[0].payTo, d.WALLET); assert.equal(reqL.resource.url, ORIGIN + '/leitura');
  assert.ok(reqL.extensions.bazaar.info.output.example.leitura);
  assert.match(cl.body.legibilidade.para_que, /duas fontes/); assert.match(cl.body.legibilidade.para_que, /Não prova receita/);
  assert.equal(cl.body.pagamento_alternativo_bitcoin.disponivel, false);
  assert.ok(cl.body.legibilidade.resposta_paga_schema.properties.leitura);
  // pago: a leitura vem na resposta, e a resposta e a do leitor
  const pl = await callL('', { transactionHash: tx(7) });
  assert.equal(pl.status, 200); assert.equal(pl.body.tier, 'leitura'); assert.equal(pl.body.tx_hash, tx(7));
  assert.deepEqual(pl.body.leitura, { ...boa, lido_em: 'leitura-1' }); assert.equal(pl.body.reacesso, false); assert.equal(pl.body.truth_machine.reads_public_chain, true); assert.equal(pl.body.truth_machine.is_introspective_reading, false);
  assert.ok(pl.h['payment-response']);
  // a mesma prova repete a MESMA leitura e nao volta a gastar as fontes (reacesso); uma tx diferente tem leitura nova
  const pl2 = await callL('', { transactionHash: tx(7) });
  assert.equal(pl2.status, 200); assert.equal(pl2.body.reacesso, true); assert.deepEqual(pl2.body.leitura, pl.body.leitura); assert.equal(leituras, 1, 'o leitor nao foi chamado outra vez');
  chain[tx(7)].ageS = 80 * 3600; // fora da janela: a prova deixa de servir, mesmo com a leitura guardada
  assert.equal((await callL('', { transactionHash: tx(7) })).status, 402); chain[tx(7)].ageS = 60;
  // um atomo a menos, tx de outro servico mais barato (o preco e por servico) e prova inexistente nao entregam
  assert.equal((await callL('', { transactionHash: tx(8) })).status, 402);
  assert.equal((await callL('', { transactionHash: tx(9) })).status, 402);
  // a via Bitcoin nao existe para a leitura
  const bl = await callL('', { bitcoin: { txid: 'a'.repeat(64) } });
  assert.equal(bl.status, 402); assert.match(bl.body.erro, /so existe para \/oraculo e \/campo/);
  // leitor em falha: 503, o pagamento fica confirmado e diz-se para repetir sem pagar de novo
  const hF = d.createHandler({ rpc, now: () => NOW, leitor: { ler: async () => { throw new Error('fontes em baixo'); } } });
  const rF = mockRes();
  await hF({ headers: { 'x-payment': JSON.stringify({ transactionHash: tx(7) }) } }, rF, { base: 'ora-leitura', rest: '', origin: ORIGIN });
  assert.equal(rF.statusCode, 503); assert.equal(rF.body.error, 'leitura_indisponivel'); assert.match(rF.body.nota, /nao pagues de novo/);
  // eco: forma sem leitura real
  const el = await callL('eco');
  assert.equal(el.status, 200); assert.equal(el.body.eco, 'gratuito'); assert.ok(el.body.exemplo_de_resposta.properties.valium_na_sagrada); assert.ok(!('leitura' in el.body));
  // o servico mais caro nao e comprado com o preco da leitura
  assert.equal((await call('ora-oraculo', '', { transactionHash: tx(7) })).status, 402);
  assert.equal((await call('ora-x402', '', { transactionHash: tx(7) })).status, 402);
}

// Free sample and manifest.
assert.equal((await call('ora-oraculo', 'eco')).status, 200);
const man = await call('ora-x402', '.well-known/x402.json');
assert.equal(man.status, 200);
assert.deepEqual(man.body.resources.map((r) => r.resource), [ORIGIN + '/oraculo', ORIGIN + '/campo', ORIGIN + '/auditoria', ORIGIN + '/leitura']);
assert.deepEqual(man.body.resources.map((r) => r.accepts[0].amount), ['161000', '330000', '500000', '10000']);
assert.ok(man.body.indisponiveis_nesta_via.includes('sedimento') && man.body.indisponiveis_nesta_via.includes('kernel'));
assert.ok(!JSON.stringify(man.body.resources).includes('/sedimento') && !JSON.stringify(man.body.resources).includes('/kernel'));

// Proxy: the manifest path falls to the direct rail when Supabase is out of quota.
{
  const proxyM = require('../api/proxy.js');
  const f = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'exceed_cached_egress_quota' }), { status: 402 });
  const r = mockRes(); r.headersSent = false;
  await proxyM({ method: 'GET', query: { base: 'ora-x402', rest: '.well-known/x402.json' }, headers: { host: 'ora-x402-gateway.vercel.app' }, socket: {} }, r);
  globalThis.fetch = f;
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.via, 'vercel-directa');
}

// Proxy integration: Supabase quota 402 (not a challenge) → direct rail; a real
// upstream challenge still passes through untouched.
const realFetch = globalThis.fetch;
const proxy = require('../api/proxy.js');
async function viaProxy(query, upstream) {
  globalThis.fetch = async () => upstream;
  const res = mockRes();
  res.headersSent = false;
  await proxy({ method: 'GET', query, headers: { host: 'ora-x402-gateway.vercel.app' }, socket: {} }, res);
  globalThis.fetch = realFetch;
  return res;
}
const quota = () => new Response(JSON.stringify({ message: 'exceed_cached_egress_quota' }), { status: 402 });
const p1 = await viaProxy({ base: 'ora-oraculo' }, quota());
assert.equal(p1.statusCode, 402);
assert.equal(p1.h['x-ora-via'], 'vercel-directa');
assert.ok(p1.h['payment-required']);
const p2 = await viaProxy({ base: 'ora-x402', rest: 'sedimento' }, quota());
assert.equal(p2.statusCode, 503);
assert.equal(p2.body.error, 'upstream_payment_unavailable');
const p3 = await viaProxy({ base: 'ora-x402' }, new Response('boom', { status: 500 }));
assert.equal(p3.h['x-ora-via'], 'vercel-directa');
const upstreamChallenge = { x402Version: 2, accepts: [{ scheme: 'exact' }] };
const p4 = await viaProxy({ base: 'ora-oraculo' }, new Response(JSON.stringify(upstreamChallenge), { status: 402, headers: { 'payment-required': 'x' } }));
assert.equal(p4.h['x-ora-via'], undefined);
assert.deepEqual(p4.body, upstreamChallenge);
globalThis.fetch = async () => { throw new Error('network'); };
const p5 = mockRes(); p5.headersSent = false;
await proxy({ method: 'GET', query: { base: 'ora-oraculo', rest: 'eco' }, headers: {}, socket: {} }, p5);
globalThis.fetch = realFetch;
assert.equal(p5.statusCode, 200);
assert.equal(p5.body.eco, 'gratuito');

console.log('x402 directo: challenge v2, verificação on-chain simulada, janela, reacesso determinístico, rejeições, RPC em falha e fallback do proxy passaram.');

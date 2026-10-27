// Verifica que o 402 da via directa (api/_x402-directo.js) diz o que se compra, para que serve e para que não serve,
// o que cada campo significa e que forma tem a resposta paga, sem tocar em accepts, payTo, montantes nem cabeçalhos;
// e que a resposta paga real cumpre o esquema anunciado. Sem rede nem pagamentos: o RPC Base é simulado.
// Unum, 27/10/2026: "Eu autorizo ORA", proposta P3 (lacunas L6, L9, L10 do registo de legibilidade; livro 1094).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
process.env.ORUM_FACILITATOR_URL = 'off';
process.env.ORUM_BTC_RAIL = 'off';
const require = createRequire(import.meta.url);
const d = require('../api/_x402-directo.js');
const fonte = readFileSync(new URL('../api/_x402-directo.js', import.meta.url), 'utf8');

const NOW = Date.parse('2026-10-27T12:00:00Z');
const pad = (hex) => '0x' + hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const PAYER = '0x1111111111111111111111111111111111111111';
const TX = { oraculo: '0x' + '1'.repeat(64), campo: '0x' + '2'.repeat(64) };
const VALOR = { oraculo: 161000n, campo: 330000n };
const rpc = async (method, params) => {
  const tier = params[0] === TX.oraculo ? 'oraculo' : 'campo';
  if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x64', logs: [{ address: d.USDC_BASE.toLowerCase(), topics: [d.TRANSFER_TOPIC, pad(PAYER), pad(d.WALLET)], data: '0x' + VALOR[tier].toString(16) }] };
  if (method === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor((NOW - 60000) / 1000).toString(16) };
  throw new Error('unexpected ' + method);
};
const handler = d.createHandler({ rpc, now: () => NOW });
const ORIGIN = 'https://ora-x402-gateway.vercel.app';
async function call(base, payment) {
  const res = { h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } };
  const req = { headers: payment ? { 'x-payment': Buffer.from(JSON.stringify(payment)).toString('base64') } : {} };
  await handler(req, res, { base, rest: '', origin: ORIGIN });
  return { status: res.statusCode, body: res.body, h: res.h };
}

// Validador mínimo do subconjunto de JSON Schema que o esquema usa.
function valida(valor, esq, caminho = '$') {
  const erros = [];
  const tipos = { object: (v) => v && typeof v === 'object' && !Array.isArray(v), string: (v) => typeof v === 'string', integer: (v) => Number.isInteger(v), number: (v) => typeof v === 'number' };
  if (esq.type && !(tipos[esq.type] || (() => true))(valor)) return [`${caminho}: devia ser ${esq.type}`];
  if ('const' in esq && valor !== esq.const) erros.push(`${caminho}: devia ser ${esq.const}`);
  if (esq.enum && !esq.enum.includes(valor)) erros.push(`${caminho}: fora de ${esq.enum}`);
  if (esq.minimum !== undefined && valor < esq.minimum) erros.push(`${caminho}: abaixo de ${esq.minimum}`);
  if (esq.type === 'object') {
    for (const k of esq.required || []) if (!(k in valor)) erros.push(`${caminho}.${k}: em falta`);
    for (const [k, sub] of Object.entries(esq.properties || {})) if (k in valor) erros.push(...valida(valor[k], sub, `${caminho}.${k}`));
  }
  return erros;
}

const PROIBIDO = /garant|receita certa|reembols[oa]dos? |vais ganhar|valor assegurado/i;
function verificar({ tier, challenge, req, pago, fonteTxt }) {
  const erros = []; const x = (m) => erros.push(m);
  const L = challenge.body.legibilidade;
  if (!L) return ['402 sem o bloco legibilidade'];
  for (const k of ['o_que_compras', 'para_que', 'para_que_nao', 'amostra_gratis', 'glossario', 'resposta_paga_schema']) if (!L[k]) x(`legibilidade sem ${k}`);
  if (L.amostra_gratis !== `${ORIGIN}/${tier}/eco`) x('a ligação à amostra grátis não aponta para /eco do serviço');
  if (!/Procura externa: não comprovada/.test(L.para_que || '')) x('o «para quê» tem de dizer que a procura externa não está comprovada');
  if (!/não é dado de mercado/i.test(L.para_que || '')) x('o «para quê» tem de dizer que não é dado de mercado');
  if (!/não promete valor, receita nem reembolso/.test(L.para_que_nao || '')) x('o «para que não» tem de recusar promessas');
  if (PROIBIDO.test(JSON.stringify(L))) x('a legibilidade promete algo');
  for (const k of ['dia', 'sigma', 'epoca', 'campo', 'pensamento']) if (!L.glossario?.[k]) x(`glossário sem ${k}`);
  if (!/2026-03-28/.test(L.glossario?.dia || '')) x('o glossário não dá a data da génese');
  if (!/2026-06-26/.test(L.glossario?.epoca || '')) x('o glossário não dá a data da mudança de época');
  // o x402 padrão não mudou
  if (!(challenge.body.accepts[0].payTo === d.WALLET)) x('payTo mudou');
  if (challenge.body.accepts[0].amount !== (tier === 'oraculo' ? '161000' : '330000')) x('montante mudou');
  if ('legibilidade' in req || 'outputSchema' in challenge.body.accepts[0]) x('a legibilidade entrou no payment-required ou em accepts');
  if (JSON.stringify(challenge.body.accepts) !== JSON.stringify(req.accepts)) x('accepts do corpo difere do cabeçalho');
  // a resposta paga cumpre o esquema anunciado
  for (const e of valida(pago.body, L.resposta_paga_schema)) x('resposta paga fora do esquema: ' + e);
  // a fronteira não afirma uma indisponibilidade que já não se observa
  if (/Edge Functions Supabase indisponíveis/.test(JSON.stringify(challenge.body.fronteiras || {}))) x('fronteiras ainda afirma que as Edge Functions Supabase estão indisponíveis');
  if (!/a 27\/10\/2026 a origem Supabase voltou a responder/.test(JSON.stringify(challenge.body.fronteiras || {}))) x('fronteiras.motivo perdeu a leitura de 27/10/2026');
  // a fonte chama a legibilidade no desafio e não toca em accepts
  if (!/send\(402, \{ \.\.\.reqd, \.\.\.extra, legibilidade: legibilidade\(tier, origin\)/.test(fonteTxt)) x('o desafio deixou de incluir a legibilidade');
  if (!/accepts: \[\{ scheme: 'exact', network: CAIP2, amount: tier\.atomic\.toString\(\), asset: USDC_BASE, payTo: WALLET,\n\s+maxTimeoutSeconds: 300, extra: \{ name: 'USD Coin', version: '2' \} \}\]/.test(fonteTxt)) x('accepts da via directa foi alterado');
  return erros;
}

const reais = {};
for (const [tier, base] of [['oraculo', 'ora-oraculo'], ['campo', 'ora-x402']]) {
  const challenge = await call(base);
  assert.equal(challenge.status, 402);
  const req = JSON.parse(Buffer.from(challenge.h['payment-required'], 'base64').toString());
  const pago = await call(base, { transactionHash: TX[tier] });
  assert.equal(pago.status, 200, 'a leitura simulada devia ser entregue');
  reais[tier] = { tier, challenge, req, pago, fonteTxt: fonte };
  assert.deepEqual(verificar(reais[tier]), [], `o real devia passar (${tier}): ` + verificar(reais[tier]).join('; '));
}

let mentiras = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const falha = (nome, mexe) => {
  const c = clone(reais.oraculo); c.fonteTxt = fonte; mexe(c);
  assert.ok(verificar(c).length > 0, `devia falhar: ${nome}`); mentiras++;
};
falha('402 sem legibilidade', (c) => { delete c.challenge.body.legibilidade; });
falha('sem «para quê»', (c) => { delete c.challenge.body.legibilidade.para_que; });
falha('«para quê» deixa de dizer que a procura não está comprovada', (c) => { c.challenge.body.legibilidade.para_que = c.challenge.body.legibilidade.para_que.replace('Procura externa: não comprovada.', 'Procura externa: comprovada.'); });
falha('«para quê» passa a vender dado de mercado', (c) => { c.challenge.body.legibilidade.para_que = 'Dado de mercado em tempo real.'; });
falha('promete reembolso', (c) => { c.challenge.body.legibilidade.para_que_nao = 'Garantido, com reembolso.'; });
falha('«para que não» deixa de recusar promessas', (c) => { c.challenge.body.legibilidade.para_que_nao = 'Serve para tudo.'; });
falha('fronteiras volta a afirmar a indisponibilidade', (c) => { c.challenge.body.fronteiras.motivo = 'Edge Functions Supabase indisponíveis (quota de egress)'; });
falha('promessa escondida no glossário', (c) => { c.challenge.body.legibilidade.glossario.sigma += ' Vais ganhar com isto.'; });
falha('amostra grátis aponta para outro serviço', (c) => { c.challenge.body.legibilidade.amostra_gratis = ORIGIN + '/campo/eco'; });
falha('glossário sem sigma', (c) => { delete c.challenge.body.legibilidade.glossario.sigma; });
falha('glossário sem a data da génese', (c) => { c.challenge.body.legibilidade.glossario.dia = 'dias'; });
falha('glossário com época sem data', (c) => { c.challenge.body.legibilidade.glossario.epoca = 'etiqueta'; });
falha('esquema exige um campo que a resposta não tem', (c) => { c.challenge.body.legibilidade.resposta_paga_schema.required.push('inexistente'); });
falha('esquema diz que sigma é texto', (c) => { c.challenge.body.legibilidade.resposta_paga_schema.properties.campo.properties.sigma = { type: 'string' }; });
falha('esquema fixa a época numa só', (c) => { c.challenge.body.legibilidade.resposta_paga_schema.properties.campo.properties.epoca = { type: 'string', enum: ['CRISTAL'] }; });
falha('payTo mudou', (c) => { c.challenge.body.accepts[0].payTo = '0x0000000000000000000000000000000000000001'; });
falha('montante mudou', (c) => { c.challenge.body.accepts[0].amount = '1'; });
falha('a legibilidade entrou em accepts', (c) => { c.challenge.body.accepts[0].outputSchema = {}; c.req.accepts[0].outputSchema = {}; });
falha('a legibilidade entrou no payment-required', (c) => { c.req.legibilidade = {}; });
falha('accepts do corpo difere do cabeçalho', (c) => { c.req.accepts[0].amount = '2'; });
falha('o desafio deixa de incluir a legibilidade', (c) => { c.fonteTxt = fonte.replace('legibilidade: legibilidade(tier, origin), como_pagar', 'como_pagar'); });
falha('accepts da fonte foi alterado', (c) => { c.fonteTxt = fonte.replace("extra: { name: 'USD Coin', version: '2' } }],\n    extensions", "extra: { name: 'USD Coin', version: '2' }, outputSchema: {} }],\n    extensions"); });

console.log(JSON.stringify({ verified: true, casos_de_mentira: mentiras }));

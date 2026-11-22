// Verifica o desafio duplo do 402 da via directa (api/_x402-directo.js), 22/11/2026: o cabecalho PAYMENT-REQUIRED e v2
// (sem mudar), o corpo e um desafio x402 v1 (para clientes como x402-fetch 1.x), com uma copia completa do v2 em `x402_v2`,
// `extensions`/`resource` no topo e a legibilidade, o como_pagar, a oferta Bitcoin e as fronteiras como estavam.
// Nao muda preco, payTo, ativo nem prazo. Sem rede, sem pagamentos. Estragos propositados: cada um tem de ser apanhado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
process.env.ORUM_PEDIDOS = 'off';
process.env.ORUM_FACILITATOR_URL = 'off';
process.env.ORUM_BTC_RAIL = 'off';
const require = createRequire(import.meta.url);
const d = require('../api/_x402-directo.js');
const ORIGIN = 'https://ora-x402-gateway.vercel.app';
const handler = d.createHandler({ rpc: async () => { throw new Error('sem rede'); }, now: () => Date.parse('2026-11-22T12:00:00Z') });
const PRECOS = { oraculo: ['ora-oraculo', '161000'], campo: ['ora-x402', '330000'], leitura: ['ora-leitura', '10000'], auditoria: ['ora-auditoria', '500000'] };

async function desafio(tier) {
  const [base] = PRECOS[tier];
  const res = { h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, end(raw) { this.body = JSON.parse(raw); } };
  const rest = tier === 'auditoria' ? '' : '';
  await handler({ headers: {} }, res, { base, rest, origin: ORIGIN });
  return { status: res.statusCode, h: res.h, body: res.body };
}
const dec = (h) => JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
const CAMPOS_V1 = ['scheme', 'network', 'maxAmountRequired', 'resource', 'description', 'mimeType', 'payTo', 'maxTimeoutSeconds', 'asset', 'extra'];

function conferir(c, tier, fonteTxt) {
  const erros = []; const x = (m) => erros.push(m);
  const montante = PRECOS[tier][1];
  if (c.status !== 402) x(`esperava 402, veio ${c.status}`);
  let req; try { req = dec(c.h['payment-required']); } catch { x('cabecalho PAYMENT-REQUIRED ilegivel'); return erros; }
  // cabecalho: v2, como estava
  if (req.x402Version !== 2) x('o cabecalho deixou de ser x402 v2');
  if (req.accepts?.[0]?.network !== 'eip155:8453') x('a rede do cabecalho deixou de ser eip155:8453');
  if (req.accepts?.[0]?.amount !== montante) x('o montante do cabecalho mudou');
  if (req.accepts?.[0]?.payTo !== d.WALLET) x('o payTo do cabecalho mudou');
  if ('maxAmountRequired' in (req.accepts?.[0] || {})) x('o cabecalho ganhou campos v1');
  const b = c.body || {};
  // corpo: v1
  if (b.x402Version !== 1) x('o corpo nao e um desafio v1');
  const a = b.accepts?.[0];
  if (!a || b.accepts.length !== 1) { x('o corpo nao tem um accepts v1'); }
  else {
    for (const k of CAMPOS_V1) if (!(k in a)) x(`accepts v1 sem ${k}`);
    if (a.network !== 'base') x('a rede v1 tem de ser "base"');
    if (a.scheme !== 'exact') x('o esquema v1 tem de ser exact');
    if (a.maxAmountRequired !== montante) x('o montante v1 difere do v2');
    if ('amount' in a) x('accepts v1 com campo v2 (amount)');
    if (a.payTo !== req.accepts?.[0]?.payTo) x('o payTo v1 difere do v2');
    if (a.asset !== req.accepts?.[0]?.asset) x('o ativo v1 difere do v2');
    if (a.maxTimeoutSeconds !== req.accepts?.[0]?.maxTimeoutSeconds) x('o prazo v1 difere do v2');
    if (JSON.stringify(a.extra) !== JSON.stringify(req.accepts?.[0]?.extra)) x('o extra v1 difere do v2');
    if (a.resource !== req.resource?.url) x('o resource v1 difere do v2');
    if (a.mimeType !== 'application/json') x('mimeType v1 errado');
    if (typeof a.description !== 'string' || a.description.length > 200) x('descricao v1 fora do limite');
  }
  // a copia v2 e o cabecalho, byte a byte
  if (JSON.stringify(b.x402_v2) !== JSON.stringify(req)) x('x402_v2 do corpo difere do cabecalho');
  if (JSON.stringify(b.extensions) !== JSON.stringify(req.extensions)) x('extensions do corpo difere do cabecalho');
  if (JSON.stringify(b.resource) !== JSON.stringify(req.resource)) x('resource do corpo difere do cabecalho');
  // o que os monitores e os agentes ja liam continua la
  for (const k of ['legibilidade', 'como_pagar', 'fronteiras']) if (!b[k]) x(`o corpo perdeu ${k}`);
  if (tier !== 'leitura' && tier !== 'auditoria' && !('pagamento_alternativo_bitcoin' in b)) x('o corpo perdeu pagamento_alternativo_bitcoin');
  if (JSON.stringify(b).includes('"maxAmountRequired"') === false) x('sem maxAmountRequired no corpo');
  // a fonte
  if (!/send\(402, \{ \.\.\.corpoDoDesafio\(reqd\), \.\.\.extra/.test(fonteTxt)) x('o desafio deixou de usar o corpo duplo');
  if (!/'payment-required': b64json\(reqd\)/.test(fonteTxt)) x('o cabecalho deixou de ser o desafio v2');
  if (!/const REDE_V1 = 'base';/.test(fonteTxt)) x('a rede v1 mudou na fonte');
  return erros;
}

const fonte = fs.readFileSync(new URL('../api/_x402-directo.js', import.meta.url), 'utf8');
const reais = {};
for (const tier of Object.keys(PRECOS)) {
  reais[tier] = await desafio(tier);
  const e = conferir(reais[tier], tier, fonte);
  assert.deepEqual(e, [], `o real devia passar (${tier}): ${e.join('; ')}`);
}
console.log('Desafio duplo: cabecalho v2, corpo v1 e copia v2 conferidos em', Object.keys(PRECOS).join(', '));

// um pagamento enviado por um cliente v1 (X-PAYMENT, rede "base") continua a ser lido como autorizacao EIP-3009
const auth = { from: '0x' + '1'.repeat(40), to: d.WALLET, value: '161000', validAfter: '0', validBefore: '9999999999', nonce: '0x' + 'ab'.repeat(32) };
const env1 = { x402Version: 1, scheme: 'exact', network: 'base', payload: { signature: '0x' + '11'.repeat(65), authorization: auth } };
for (const cab of [Buffer.from(JSON.stringify(env1)).toString('base64'), JSON.stringify(env1)]) {
  const p = d.lerProva(cab);
  assert.ok(p && p.eip3009 && p.eip3009.authorization.value === '161000', 'a prova v1 nao foi lida');
}
console.log('Prova v1 (X-PAYMENT, rede base): lida como autorizacao EIP-3009.');

// estragos propositados
const clone = (o) => JSON.parse(JSON.stringify(o));
const estragos = [];
const sobreCorpo = (nome, f, tier = 'oraculo') => estragos.push([nome, () => { const c = clone(reais[tier]); f(c); return conferir(c, tier, fonte); }]);
const sobreFonte = (nome, de, para) => estragos.push([nome, () => { assert.ok(fonte.includes(de), 'alvo ausente: ' + nome); return conferir(reais.oraculo, 'oraculo', fonte.replace(de, para)); }]);
sobreCorpo('corpo volta a v2', (c) => { c.body.x402Version = 2; });
sobreCorpo('rede v1 em CAIP-2', (c) => { c.body.accepts[0].network = 'eip155:8453'; });
sobreCorpo('montante v1 mudou', (c) => { c.body.accepts[0].maxAmountRequired = '1'; });
sobreCorpo('payTo v1 mudou', (c) => { c.body.accepts[0].payTo = '0x0000000000000000000000000000000000000001'; });
sobreCorpo('campo v2 no accepts v1', (c) => { c.body.accepts[0].amount = '161000'; });
sobreCorpo('accepts v1 sem maxAmountRequired', (c) => { delete c.body.accepts[0].maxAmountRequired; });
sobreCorpo('sem copia v2', (c) => { delete c.body.x402_v2; });
sobreCorpo('copia v2 difere do cabecalho', (c) => { c.body.x402_v2.accepts[0].amount = '2'; });
sobreCorpo('extensions perdidas', (c) => { delete c.body.extensions; });
sobreCorpo('legibilidade perdida', (c) => { delete c.body.legibilidade; });
sobreCorpo('como_pagar perdido', (c) => { delete c.body.como_pagar; });
sobreCorpo('oferta Bitcoin perdida', (c) => { delete c.body.pagamento_alternativo_bitcoin; });
sobreCorpo('fronteiras perdidas', (c) => { delete c.body.fronteiras; });
sobreCorpo('cabecalho passa a v1', (c) => { c.h['payment-required'] = Buffer.from(JSON.stringify({ x402Version: 1, accepts: [] })).toString('base64'); });
sobreCorpo('cabecalho com montante errado', (c) => { const r = dec(c.h['payment-required']); r.accepts[0].amount = '1'; c.h['payment-required'] = Buffer.from(JSON.stringify(r)).toString('base64'); });
sobreCorpo('descricao v1 sem limite', (c) => { c.body.accepts[0].description = 'x'.repeat(300); });
sobreFonte('o desafio deixa de usar o corpo duplo', 'send(402, { ...corpoDoDesafio(reqd), ...extra', 'send(402, { ...reqd, ...extra');
sobreFonte('o cabecalho passa a ser o corpo v1', "'payment-required': b64json(reqd)", "'payment-required': b64json(desafioV1(reqd))");
sobreFonte('a rede v1 mudou na fonte', "const REDE_V1 = 'base';", "const REDE_V1 = 'base-sepolia';");
let apanhados = 0;
for (const [nome, f] of estragos) {
  let e; try { e = f(); } catch (err) { e = [String(err.message)]; }
  assert.ok(e.length > 0, 'estrago nao apanhado: ' + nome);
  apanhados++;
}
console.log(`Estragos propositados apanhados: ${apanhados} de ${estragos.length}.`);
console.log('PASS');

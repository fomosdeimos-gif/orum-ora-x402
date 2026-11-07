// Verifica a via Bitcoin dos serviços x402 (api/_pagamento-btc.js + api/_x402-directo.js), sem rede e sem pagamentos:
// as fontes Esplora são simuladas e qualquer pedido de cotação falha o teste (o preço é fixo em sats desde 02/11/2026, livro 1296). Depois da suite, estraga o código de propósito (cópia em /tmp) e exige
// que a suite falhe em cada estrago; e confere que o texto nunca promete entrega antes da confirmação.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const API = join(AQUI, '..', 'api');

const NOW = Date.parse('2026-10-21T12:00:00Z');
const ENDERECO = 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7'; // operacional BTC: onde a via directa cobra
const OUTRO = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf'; // sagrada BTC: ja nao conta como pagamento de servico
const ORIGIN = 'https://ora-x402-gateway.vercel.app';
const id = (n) => String(n).repeat(64).slice(0, 64);
const ALTURA = 972300;

function tx(txid, { vout = [{ a: ENDERECO, v: 500000 }], confirmada = true, altura = ALTURA, idadeS = 600, de = 'bc1qpagador' } = {}) {
  return { txid, vin: [{ prevout: { scriptpubkey_address: de } }], vout: vout.map((o) => ({ scriptpubkey_address: o.a, value: o.v })),
    status: confirmada ? { confirmed: true, block_height: altura, block_time: Math.floor((NOW - idadeS * 1000) / 1000) } : { confirmed: false } };
}
// mundo: { blockstream: {txid: obj|Error}, mempool: {...}, altura }
function mundo({ blockstream = {}, mempool = {}, altura = ALTURA } = {}) {
  const fontes = { 'blockstream.info': blockstream, 'mempool.space': mempool };
  const r = { pedidos: [], async fetchFn(url) {
    r.pedidos.push(url);
    const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
    if (/prices|coinbase/.test(url)) throw new Error('a via Bitcoin nao pode pedir cotacao: ' + url);
    const m = /^https:\/\/(blockstream\.info|mempool\.space)\/api\/(tx\/([0-9a-f]{64})|blocks\/tip\/height)$/.exec(url);
    if (!m) throw new Error('sem rota ' + url);
    const f = fontes[m[1]];
    if (m[2] === 'blocks/tip/height') return resp(200, altura);
    const t = f[m[3]];
    if (t instanceof Error) throw t;
    if (!t) return resp(404, null);
    return resp(200, t);
  } };
  return r;
}
function mockRes() { const h = {}; return { h, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } }; }

async function suite(dir) {
  const d = require(join(dir, '_x402-directo.js'));
  const B = require(join(dir, '_pagamento-btc.js'));
  const cdp = { pronto: async () => false };
  const rpc = async () => { throw new Error('a via Base nao deve ser tocada'); };
  const cria = (w, env = {}) => d.createHandler({ rpc, now: () => NOW, cdp, btc: B.createBtc({ fetchFn: w.fetchFn, env, now: () => NOW }) });
  const chama = async (h, base, prova, rest = '') => {
    const res = mockRes();
    const req = { headers: prova ? { 'x-payment': Buffer.from(JSON.stringify(prova)).toString('base64') } : {} };
    await h(req, res, { base, rest, origin: ORIGIN });
    return { status: res.statusCode, body: res.body, h: res.h };
  };
  const btc = (n) => ({ bitcoin: { txid: id(n) } });
  const dois = (n, t) => mundo({ blockstream: { [id(n)]: t }, mempool: { [id(n)]: t } });

  // ---- oferta no desafio: fora de accepts e do cabeçalho; sats certos ----
  let w = mundo(); let h = cria(w);
  let ch = await chama(h, 'ora-oraculo');
  assert.equal(ch.status, 402);
  const pr = JSON.parse(Buffer.from(ch.h['payment-required'], 'base64').toString());
  assert.equal(pr.accepts.length, 1); assert.equal(pr.accepts[0].network, 'eip155:8453', 'o x402 padrao da Base nao muda');
  assert.ok(!JSON.stringify(pr).includes('bitcoin') && !JSON.stringify(pr).includes(ENDERECO), 'a oferta nao entra no cabecalho nem em accepts');
  const of = ch.body.pagamento_alternativo_bitcoin;
  assert.equal(of.disponivel, true); assert.equal(of.endereco, ENDERECO); assert.equal(of.caip2, 'bip122:000000000019d6689c085ae165831e93');
  assert.equal(of.sats_anunciados, 1000, '0,161 USD: preco fixo em sats'); assert.equal(of.confirmacoes_para_entrega, 1);
  assert.equal(of.preco.tipo, 'fixo_em_sats'); assert.equal(of.preco.fixado_em, '2026-11-02'); assert.ok(of.preco.usd_por_btc_de_referencia > 0);
  assert.ok(!('cotacao' in of) && !JSON.stringify(of).includes('margem') && !JSON.stringify(of).includes('tolerancia'), 'sem cotacao, margem nem tolerancia na oferta');
  assert.ok(of.uri.startsWith('bitcoin:' + ENDERECO + '?amount=0.00001'));
  assert.equal((await chama(h, 'ora-x402')).body.pagamento_alternativo_bitcoin.sats_anunciados, 1000, '0,33 USD: preco fixo em sats');
  assert.equal(w.pedidos.length, 0, 'anunciar a oferta nao faz pedidos de rede');
  assert.equal(ch.body.fronteiras.bitcoin.entrega_antes_da_confirmacao, false);
  assert.equal(ch.body.fronteiras.bitcoin.entrega_com_fonte_unica, false);
  assert.match(ch.body.fronteiras.bitcoin.controlo_do_endereco, /operacional da ORA.*BIP-322 feita a 23\/10\/2026.*nao prova titularidade legal/);
  assert.doesNotMatch(ch.body.fronteiras.bitcoin.controlo_do_endereco, /ainda nao feita/, 'a prova de controlo existe (ancora/prova-controlo-btc-operacional.json)');
  assert.equal((await chama(h, 'ora-oraculo', null, 'eco')).body.pago.pagamento_alternativo_bitcoin.disponivel, true);

  // ---- entrega: duas fontes, valor suficiente, 1 confirmacao; determinista por txid ----
  w = dois(1, tx(id(1))); h = cria(w);
  let ok = await chama(h, 'ora-oraculo', btc(1));
  assert.equal(ok.status, 200); assert.equal(ok.body.acesso, 'concedido'); assert.equal(ok.body.via_pagamento, 'bitcoin');
  assert.equal(ok.body.valor_sats, 500000); assert.equal(ok.body.confirmacoes, 1); assert.equal(ok.body.payer, 'bc1qpagador');
  assert.match(ok.body.pensamento, /Dia \d+, sigma/);
  assert.equal(JSON.parse(Buffer.from(ok.h['payment-response'], 'base64').toString()).network, 'bip122:000000000019d6689c085ae165831e93');
  assert.deepEqual((await chama(h, 'ora-oraculo', btc(1))).body, ok.body, 'reacesso: mesma leitura');
  assert.equal((await chama(h, 'ora-oraculo', { network: 'bitcoin', txid: id(1) })).status, 200, 'forma alternativa da prova');
  assert.ok(w.pedidos.every((u) => /blockstream\.info|mempool\.space/.test(u) && !/prices/.test(u)), 'so se pedem as fontes Esplora, nunca cotacao');
  // os dois servicos custam 1000: 999 sats nao compram nenhum, 1000 compram ambos
  w = dois(14, tx(id(14), { vout: [{ a: ENDERECO, v: 999 }] })); h = cria(w);
  assert.match((await chama(h, 'ora-oraculo', btc(14))).body.detalhe, /valor insuficiente: 999 < 1000/);
  assert.match((await chama(h, 'ora-x402', btc(14))).body.detalhe, /valor insuficiente: 999 < 1000/);
  // maiusculas no txid dao a mesma leitura
  w = dois('a', tx(id('a'))); h = cria(w);
  assert.equal((await chama(h, 'ora-oraculo', { bitcoin: { txid: id('a').toUpperCase() } })).status, 200);

  // ---- preco fixo, sem tolerancia: 1000 passa, 999 nao ----
  for (const [sats, esperado] of [[1000, 200], [999, 402]]) {
    w = dois(2, tx(id(2), { vout: [{ a: ENDERECO, v: sats }] })); h = cria(w);
    assert.equal((await chama(h, 'ora-oraculo', btc(2))).status, esperado, `${sats} sats`);
  }
  // varias saidas para o endereco somam; saidas para outro endereco nao contam
  w = dois(3, tx(id(3), { vout: [{ a: ENDERECO, v: 600 }, { a: OUTRO, v: 5000 }, { a: ENDERECO, v: 700 }] })); h = cria(w);
  assert.equal((await chama(h, 'ora-oraculo', btc(3))).body.valor_sats, 1300);
  w = dois(4, tx(id(4), { vout: [{ a: OUTRO, v: 999999 }] })); h = cria(w);
  assert.match((await chama(h, 'ora-oraculo', btc(4))).body.detalhe, /sem saida para a carteira/);

  // ---- nunca entrega antes da confirmacao ----
  w = dois(5, tx(id(5), { confirmada: false })); h = cria(w);
  let r = await chama(h, 'ora-oraculo', btc(5));
  assert.equal(r.status, 402); assert.equal(r.body.x402, 'pending'); assert.equal(r.body.confirmacoes, 0); assert.ok(!r.body.acesso && !r.body.pensamento);
  assert.equal(r.h['retry-after'], '60');
  w = mundo({ blockstream: { [id(6)]: tx(id(6)) }, mempool: { [id(6)]: tx(id(6), { confirmada: false }) } }); h = cria(w);
  assert.equal((await chama(h, 'ora-oraculo', btc(6))).status, 503, 'fontes discordam sobre a confirmacao');
  w = mundo(); h = cria(w);
  r = await chama(h, 'ora-oraculo', btc(7));
  assert.equal(r.status, 402); assert.equal(r.body.x402, 'pending', 'tx desconhecida das duas fontes');
  w = mundo({ blockstream: { [id(8)]: tx(id(8)) } }); h = cria(w);
  r = await chama(h, 'ora-oraculo', btc(8));
  assert.equal(r.status, 402); assert.equal(r.body.x402, 'pending', 'so uma fonte viu a tx'); assert.ok(!r.body.acesso);

  // ---- nunca entrega com fonte unica, discrepancia ou cotacao em falta; nada e consumido ----
  w = mundo({ blockstream: { [id(9)]: tx(id(9)) }, mempool: { [id(9)]: new Error('offline') } }); h = cria(w);
  r = await chama(h, 'ora-oraculo', btc(9));
  assert.equal(r.status, 503); assert.equal(r.body.error, 'bitcoin_indisponivel'); assert.ok(!r.body.acesso);
  w = mundo({ blockstream: { [id(10)]: tx(id(10), { vout: [{ a: ENDERECO, v: 200 }] }) }, mempool: { [id(10)]: tx(id(10), { vout: [{ a: ENDERECO, v: 900 }] }) } }); h = cria(w);
  r = await chama(h, 'ora-oraculo', btc(10));
  assert.equal(r.status, 503); assert.match(r.body.detalhe, /DISCREPANCIA/);
  // sem cotacao no caminho: mesmo que as paginas de preco estivessem em baixo, nada muda (nao se pedem)
  w = dois(11, tx(id(11))); h = cria(w);
  r = await chama(h, 'ora-oraculo', btc(11));
  assert.equal(r.status, 200, 'a entrega nao depende de nenhuma cotacao');
  assert.equal((await chama(h, 'ora-oraculo')).body.pagamento_alternativo_bitcoin.disponivel, true);
  // servico sem preco em sats: nunca se anuncia nem se aceita
  const direto = B.createBtc({ fetchFn: dois(15, tx(id(15))).fetchFn, now: () => NOW });
  assert.equal((await direto.oferta({ usdc: '9.99' })).disponivel, false);
  assert.match((await direto.verificar(id(15), { usdc: '9.99' }, NOW)).error, /sem preco em sats/);

  // ---- janela, formato, via desligada ----
  w = dois(13, tx(id(13), { idadeS: 80 * 3600 })); h = cria(w);
  assert.match((await chama(h, 'ora-oraculo', btc(13))).body.detalhe, /fora da janela/);
  w = mundo(); h = cria(w);
  assert.match((await chama(h, 'ora-oraculo', { bitcoin: { txid: 'zz' } })).body.detalhe, /txid invalido/);
  w = dois(1, tx(id(1))); h = cria(w, { ORUM_BTC_RAIL: 'off' });
  r = await chama(h, 'ora-oraculo', btc(1));
  assert.equal(r.status, 402); assert.match(r.body.erro, /desligada/); assert.equal(r.body.pagamento_alternativo_bitcoin.disponivel, false);
  assert.equal(w.pedidos.length, 0, 'desligada nao faz pedidos');

  // ---- a via Base continua igual ----
  const base = d.createHandler({ rpc: async () => null, now: () => NOW, cdp, btc: B.createBtc({ fetchFn: mundo().fetchFn, now: () => NOW }) });
  const pend = await chama(base, 'ora-oraculo', { transactionHash: '0x' + '9'.repeat(64) });
  assert.equal(pend.status, 402); assert.equal(pend.body.x402, 'pending');
}

// ---- texto: nunca promete entrega antes da confirmacao, receita, reembolso nem procura ----
const PROIBIDO = /entrega imediata|entregue imediatamente|instantane|sem esperar|antes da confirma|garant[ei]|reembols|receita assegurada|procura provada/i;
function textoLimpo(texto) { return !PROIBIDO.test(texto); }
function textosPublicos(dir) {
  const B = require(join(dir, '_pagamento-btc.js'));
  const o = B.createBtc({ fetchFn: mundo().fetchFn, now: () => NOW });
  return Promise.all([o.oferta({ usdc: '0.161' }), Promise.resolve(o.fronteiras())]).then((x) => JSON.stringify(x));
}

// 1) suite real
await suite(API);
const reais = await textosPublicos(API);
assert.ok(textoLimpo(reais), 'o texto publico da oferta e das fronteiras nao promete o que nao pode');
for (const frase of ['entrega imediata do serviço', 'pagamento instantaneo', 'garantido', 'reembolso se falhar', 'entregue antes da confirmação']) assert.equal(textoLimpo(frase), false, frase);

// 2) estragos propositados: cada um tem de fazer a suite falhar
const ESTRAGOS = [
  ['_pagamento-btc.js', 'const CONF_ENTREGA = 1;', 'const CONF_ENTREGA = 0;', 'entregar sem confirmacoes'],
  ['_pagamento-btc.js', 'if (!a.confirmada || confirmacoes < CONF_ENTREGA)', 'if (false)', 'ignorar a confirmacao'],
  ['_pagamento-btc.js', "if (a.recebido !== b.recebido || a.confirmada !== b.confirmada)", 'if (false)', 'ignorar a discrepancia entre fontes'],
  ['_pagamento-btc.js', 'if (vistas.length === 1)', 'if (false)', 'aceitar uma fonte so a ver a tx'],
  ['_pagamento-btc.js', 'if (falhas.length > 0)', 'if (false)', 'aceitar com uma fonte em falha'],
  ['_pagamento-btc.js', 'if (a.recebido < minimo)', 'if (false)', 'aceitar qualquer valor'],
  ['_pagamento-btc.js', 'if (a.recebido < minimo)', 'if (a.recebido < minimo * 0.9)', 'reintroduzir uma tolerancia'],
  ['_pagamento-btc.js', "'0.161': 1000", "'0.161': 1", 'preco do oraculo quase nulo'],
  ['_pagamento-btc.js', "'0.33': 1000", "'0.33': 1", 'preco do campo quase nulo'],
  ['_pagamento-btc.js', "if (minimo === null) return { valid: false, error: 'sem preco", "if (false) return { valid: false, error: 'sem preco", 'aceitar servico sem preco'],
  ['_pagamento-btc.js', "preco_referencia_usd: tier.usdc, sats_anunciados: sats,", "preco_referencia_usd: tier.usdc, sats_anunciados: sats, cotacao: { usd_por_btc: 1 },", 'voltar a anunciar cotacao'],
  ['_pagamento-btc.js', "const minimo = satsPara(tier);\n    if (minimo === null) return { valid: false, error", "await pedir('https://api.coinbase.com/v2/prices/BTC-USD/spot');\n    const minimo = satsPara(tier);\n    if (minimo === null) return { valid: false, error", 'voltar a pedir cotacao ao verificar'],
  ['_pagamento-btc.js', "fixado_em: PRECO_REFERENCIA.fixado_em, usd_por_btc_de_referencia", "usd_por_btc_de_referencia", 'preco sem data de referencia'],
  ['_pagamento-btc.js', 'o.scriptpubkey_address === ENDERECO', 'o.scriptpubkey_address !== ENDERECO', 'contar saidas de outros enderecos'],
  ['_pagamento-btc.js', 'if (nowMs - blockTime * 1000 > JANELA_S * 1000)', 'if (false)', 'ignorar a janela'],
  ['_x402-directo.js', 'if (b.pending) return send(402', 'if (false) return send(402', 'pending a entregar'],
  ['_x402-directo.js', 'if (b.unavailable) return send(503', 'if (false) return send(503', 'indisponivel a entregar'],
  ['_x402-directo.js', 'if (!b.valid) return challenge', 'if (false) return challenge', 'invalido a entregar'],
  ['_x402-directo.js', "if (!btc.activa()) return challenge", 'if (false) return challenge', 'via desligada a verificar'],
  ['_x402-directo.js', 'accepts: [{ scheme', 'accepts: [{ bitcoinMuda: 1, scheme', 'mexer no accepts da Base'],
];
for (const [ficheiro, de, para, nome] of ESTRAGOS) {
  const tmp = mkdtempSync(join(tmpdir(), 'btc-estrago-'));
  try {
    cpSync(API, join(tmp, 'api'), { recursive: true });
    const p = join(tmp, 'api', ficheiro);
    const src = readFileSync(p, 'utf8');
    assert.ok(src.includes(de), `o estrago "${nome}" nao encontrou o texto a estragar; o verificador ficou desactualizado`);
    writeFileSync(p, src.replace(de, para));
    let caiu = false;
    try { await suite(join(tmp, 'api')); } catch { caiu = true; }
    assert.ok(caiu, `ESTRAGO NAO APANHADO: ${nome}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// 3) texto estragado tem de ser apanhado
{
  const tmp = mkdtempSync(join(tmpdir(), 'btc-texto-'));
  try {
    cpSync(API, join(tmp, 'api'), { recursive: true });
    const p = join(tmp, 'api', '_pagamento-btc.js');
    writeFileSync(p, readFileSync(p, 'utf8').replace("entrega_antes_da_confirmacao: false", "entrega_antes_da_confirmacao: false, promessa: 'entrega imediata, garantida'"));
    assert.equal(textoLimpo(await textosPublicos(join(tmp, 'api'))), false, 'texto que promete entrega imediata passou');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`via Bitcoin dos serviços: oferta fora de accepts, entrega só com duas fontes concordantes e confirmação, preço fixo em sats sem cotação, janela, via desligável; ${ESTRAGOS.length} estragos propositados + 1 de texto apanhados.`);

// Verifica o encaminhamento da prova Bitcoin no proxy (api/proxy.js) e a oferta Bitcoin no 402 da origem
// (api/_oferta-btc-origem.js). Sem rede e sem pagamentos: a origem Supabase, as fontes Esplora e as de cotacao
// sao simuladas; o 402 da origem e a captura real de 23/10/2026. Depois da suite, estraga o codigo de proposito
// (copia em /tmp) e exige que a suite falhe em cada estrago.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.ORUM_PEDIDOS = 'off'; // o registo de pedidos (api/_pedidos.js) adia res.end; tem o seu verificador (verify-pedidos-directos.mjs)
const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const API = join(AQUI, '..', 'api');

process.env.ORUM_FACILITATOR_URL = 'off'; // hermetico: sem facilitador
process.env.ORUM_BTC_OFERTA_PRAZO_MS = '60';

const fx = JSON.parse(readFileSync(join(AQUI, 'fixtures', 'campo-402-origem-2026-10-23.json'), 'utf8'));
const ENDERECO = 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7';
const BASE_PAYTO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const GW = 'https://ora-x402-gateway.vercel.app';
const id = (n) => String(n).repeat(64).slice(0, 64);
const ALTURA = 972300;
const dec = (h) => JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
const corpoOrigem = () => JSON.stringify(fx.corpo);
const prova = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const comLimite = (p, ms, nome) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('sem resposta a tempo: ' + nome)), ms))]);

function txBtc(txid, { vout = [{ a: ENDERECO, v: 400 }], confirmada = true, idadeS = 600 } = {}) {
  return { txid, vin: [{ prevout: { scriptpubkey_address: 'bc1qpagador' } }], vout: vout.map((o) => ({ scriptpubkey_address: o.a, value: o.v })),
    status: confirmada ? { confirmed: true, block_height: ALTURA, block_time: Math.floor((Date.now() - idadeS * 1000) / 1000) } : { confirmed: false } };
}
// origem: (url) => { status, body?, header? } | Error ; blockstream/mempool: { txid: obj|Error } ; preco: { mempool, coinbase }
function mundo({ origem, blockstream = {}, mempool = {}, preco = { mempool: 100000, coinbase: 100000 }, pendurar = false } = {}) {
  const w = { pedidos: [], origem: 0 };
  const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  w.fetch = async (url) => {
    url = String(url);
    w.pedidos.push(url);
    if (url.startsWith('https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/')) {
      w.origem += 1;
      const o = origem ? origem(url) : { status: 200, body: JSON.stringify({ ok: true }) };
      if (o instanceof Error) throw o;
      return { status: o.status, headers: { get: (k) => ({ 'payment-required': o.header ?? null, 'content-type': 'application/json', 'x-ora-version': 'V31' })[k.toLowerCase()] ?? null }, text: async () => o.body };
    }
    if (pendurar && url.includes('/prices')) return new Promise(() => {});
    if (url === 'https://mempool.space/api/v1/prices') { if (preco.mempool instanceof Error) throw preco.mempool; return resp(200, { USD: preco.mempool }); }
    if (url === 'https://api.coinbase.com/v2/prices/BTC-USD/spot') { if (preco.coinbase instanceof Error) throw preco.coinbase; return resp(200, { data: { amount: String(preco.coinbase) } }); }
    const m = /^https:\/\/(blockstream\.info|mempool\.space)\/api\/(tx\/([0-9a-f]{64})|blocks\/tip\/height)$/.exec(url);
    if (!m) throw new Error('sem rota ' + url);
    if (m[2] === 'blocks/tip/height') return resp(200, ALTURA);
    const t = (m[1] === 'blockstream.info' ? blockstream : mempool)[m[3]];
    if (t instanceof Error) throw t;
    return t ? resp(200, t) : resp(404, null);
  };
  return w;
}
const origem402 = () => ({ status: 402, body: corpoOrigem(), header: fx.payment_required_header });
function mockRes() { const h = {}; return { h, statusCode: 0, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(raw) { this.raw = raw; } }; }

function verificarModulo(m) {
  const { juntarOfertaBtc, comPrazo } = m;
  const oferta = { disponivel: true, endereco: ENDERECO, sats_anunciados: 347 };
  const fr = { activa: true, entrega_com_fonte_unica: false };
  const url = GW + '/campo';
  const r = juntarOfertaBtc(402, corpoOrigem(), oferta, fr, url);
  assert.equal(r.alterado, true);
  const c = JSON.parse(r.text);
  assert.deepEqual(c.pagamento_alternativo_bitcoin, { ...oferta, apresentar_prova_em: url });
  assert.deepEqual(c.fronteiras_pagamento_bitcoin, fr);
  assert.deepEqual(c.accepts, fx.corpo.accepts, 'accepts intactos');
  assert.equal(c.accepts[0].payTo, BASE_PAYTO);
  assert.equal(c.accepts[0].amount, '330000');
  assert.equal(juntarOfertaBtc(402, r.text, oferta, fr, url).alterado, false, 'idempotente');
  for (const s of [200, 404, 429, 500, 503]) assert.equal(juntarOfertaBtc(s, corpoOrigem(), oferta, fr, url).alterado, false, 'estado ' + s);
  assert.equal(juntarOfertaBtc(402, corpoOrigem(), { disponivel: false, motivo: 'x' }, fr, url).alterado, false, 'oferta indisponivel');
  assert.equal(juntarOfertaBtc(402, corpoOrigem(), null, fr, url).alterado, false);
  assert.equal(juntarOfertaBtc(402, corpoOrigem(), oferta, fr, undefined).alterado, false, 'sem url');
  assert.equal(juntarOfertaBtc(402, corpoOrigem(), oferta, fr, 'http://inseguro/x').alterado, false, 'url nao https');
  assert.equal(juntarOfertaBtc(402, 'nao e json', oferta, fr, url).alterado, false);
  assert.equal(juntarOfertaBtc(402, '', oferta, fr, url).alterado, false);
  assert.equal(juntarOfertaBtc(402, 'x'.repeat(300000), oferta, fr, url).alterado, false);
  const v1 = JSON.parse(corpoOrigem()); v1.x402Version = 1;
  assert.equal(juntarOfertaBtc(402, JSON.stringify(v1), oferta, fr, url).alterado, false, 'desafio v1');
  const jaTem = JSON.parse(corpoOrigem()); jaTem.pagamento_alternativo_bitcoin = { disponivel: true, endereco: 'original' };
  const rj = juntarOfertaBtc(402, JSON.stringify(jaTem), oferta, fr, url);
  assert.equal(rj.alterado, false, 'nao sobrepoe oferta existente');
  assert.equal(JSON.parse(rj.text).pagamento_alternativo_bitcoin.endereco, 'original');
  return Promise.all([
    comPrazo(new Promise(() => {}), 30).then((v) => assert.equal(v, null, 'atraso devolve null')),
    comPrazo(Promise.reject(new Error('x')), 500).then((v) => assert.equal(v, null, 'erro devolve null')),
    comPrazo(Promise.resolve(7), 500).then((v) => assert.equal(v, 7, 'valor devolvido a tempo')),
  ]);
}

async function suite(dir) {
  await comLimite(verificarModulo(require(join(dir, '_oferta-btc-origem.js'))), 1500, 'modulo');
  const caminhoProxy = join(dir, 'proxy.js');
  const real = globalThis.fetch;
  const rail = process.env.ORUM_BTC_RAIL;
  const chama = async (w, { base = 'ora-x402', header, metodo = 'GET' } = {}) => {
    globalThis.fetch = w.fetch;
    delete require.cache[caminhoProxy]; // cache da cotacao fria em cada chamada (a real dura 60 s)
    const proxy = require(caminhoProxy);
    const res = mockRes();
    const req = { method: metodo, query: { base }, headers: header ? { 'x-payment': header } : {}, socket: {} };
    await comLimite(proxy(req, res), 1500, base);
    return { status: res.statusCode, h: res.h, raw: res.raw, body: res.raw ? JSON.parse(res.raw) : null };
  };
  try {
    delete process.env.ORUM_BTC_RAIL;

    // 1. Sem prova: o 402 da origem sai com a oferta Bitcoin, sem tocar na Base.
    let w = mundo({ origem: origem402 });
    let r = await chama(w);
    assert.equal(r.status, 402);
    assert.equal(w.origem, 1, 'a origem foi pedida uma vez');
    assert.equal(r.h['x-ora-btc'], 'oferta-acrescentada');
    const o = r.body.pagamento_alternativo_bitcoin;
    assert.equal(o.disponivel, true);
    assert.equal(o.endereco, ENDERECO);
    assert.equal(o.apresentar_prova_em, GW + '/campo', 'diz onde apresentar a prova');
    assert.equal(r.body.fronteiras_pagamento_bitcoin.entrega_com_fonte_unica, false);
    assert.deepEqual(r.body.accepts, fx.corpo.accepts, 'accepts da Base intactos');
    assert.equal(r.body.accepts[0].payTo, BASE_PAYTO);
    assert.deepEqual(dec(r.h['payment-required']).accepts, dec(fx.payment_required_header).accepts, 'accepts do cabecalho intactos');
    assert.equal(r.h['x-ora-bazaar'], 'declarado-no-topo', 'a declaracao Bazaar continua');

    // 2. Prova Bitcoin valida: vai para a via directa; a origem nao e tocada.
    const t = id(1);
    w = mundo({ origem: origem402, blockstream: { [t]: txBtc(t) }, mempool: { [t]: txBtc(t) } });
    r = await chama(w, { header: prova({ bitcoin: { txid: t } }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.via_pagamento, 'bitcoin');
    assert.equal(r.body.acesso, 'concedido');
    assert.equal(r.h['x-ora-via'], 'vercel-directa');
    assert.equal(w.origem, 0, 'a origem nao foi tocada');

    // 3. Prova ainda nao vista: 402 pending da via directa, origem nao tocada.
    w = mundo({ origem: origem402 });
    r = await chama(w, { header: prova({ bitcoin: { txid: id(2) } }) });
    assert.equal(r.status, 402);
    assert.equal(r.body.x402, 'pending');
    assert.equal(w.origem, 0);

    // 4. Uma fonte Esplora em falha: nunca entrega (503), origem nao tocada.
    const t4 = id(3);
    w = mundo({ origem: origem402, blockstream: { [t4]: new Error('fora') }, mempool: { [t4]: txBtc(t4) } });
    r = await chama(w, { header: prova({ bitcoin: { txid: t4 } }) });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'bitcoin_indisponivel');
    assert.equal(w.origem, 0);

    // 5. Valor insuficiente: nao entrega.
    const t5 = id(4);
    w = mundo({ origem: origem402, blockstream: { [t5]: txBtc(t5, { vout: [{ a: ENDERECO, v: 5 }] }) }, mempool: { [t5]: txBtc(t5, { vout: [{ a: ENDERECO, v: 5 }] }) } });
    r = await chama(w, { header: prova({ bitcoin: { txid: t5 } }) });
    assert.notEqual(r.status, 200);
    assert.equal(r.body.acesso, undefined);
    assert.equal(w.origem, 0);

    // 6. Prova por hash da Base: continua a ir para a origem.
    w = mundo({ origem: () => ({ status: 200, body: JSON.stringify({ acesso: 'concedido', da: 'origem' }) }) });
    r = await chama(w, { header: prova({ transactionHash: '0x' + id(5) }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.da, 'origem');
    assert.equal(w.origem, 1);
    assert.equal(r.h['x-ora-via'], undefined);

    // 7. Cotacao indisponivel: o 402 da origem sai sem oferta, sem partir.
    w = mundo({ origem: origem402, preco: { mempool: new Error('x'), coinbase: new Error('y') } });
    r = await chama(w);
    assert.equal(r.status, 402);
    assert.equal(r.body.pagamento_alternativo_bitcoin, undefined);
    assert.equal(r.h['x-ora-btc'], undefined);
    assert.deepEqual(r.body.accepts, fx.corpo.accepts);

    // 8. Cotacao pendurada: o prazo corta e o 402 sai sem oferta.
    w = mundo({ origem: origem402, pendurar: true });
    r = await chama(w);
    assert.equal(r.status, 402);
    assert.equal(r.body.pagamento_alternativo_bitcoin, undefined);

    // 9. Via Bitcoin desligada: sem oferta; a prova Bitcoin recebe a recusa da via directa, origem nao tocada.
    process.env.ORUM_BTC_RAIL = 'off';
    w = mundo({ origem: origem402 });
    r = await chama(w);
    assert.equal(r.body.pagamento_alternativo_bitcoin, undefined);
    w = mundo({ origem: origem402 });
    r = await chama(w, { header: prova({ bitcoin: { txid: id(6) } }) });
    assert.equal(r.status, 402);
    assert.match(String(r.body.erro), /desligada/);
    assert.equal(w.origem, 0);
    delete process.env.ORUM_BTC_RAIL;

    // 10. Outra rota (nao e servico pago) com cabecalho Bitcoin: segue para a origem, nada e interceptado.
    w = mundo({ origem: () => ({ status: 200, body: JSON.stringify({ ok: true, rota: 'pulso' }) }) });
    r = await chama(w, { base: 'ora-pulso', header: prova({ bitcoin: { txid: id(7) } }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.rota, 'pulso');
    assert.equal(w.origem, 1);

    // 11. Origem em 5xx: continua a servir a via directa (sem oferta duplicada).
    w = mundo({ origem: () => ({ status: 503, body: 'x' }) });
    r = await chama(w);
    assert.equal(r.status, 402);
    assert.equal(r.h['x-ora-via'], 'vercel-directa');
    assert.equal(typeof r.body.pagamento_alternativo_bitcoin, 'object');
    assert.equal(r.h['x-ora-btc'], undefined);

    // 12. Um 200 da origem passa sem marca.
    w = mundo({ origem: () => ({ status: 200, body: JSON.stringify({ ok: true }) }) });
    r = await chama(w);
    assert.equal(r.status, 200);
    assert.equal(r.h['x-ora-btc'], undefined);
  } finally {
    globalThis.fetch = real;
    if (rail === undefined) delete process.env.ORUM_BTC_RAIL; else process.env.ORUM_BTC_RAIL = rail;
  }
}

// ---- A suite tem de passar no codigo real ----
await suite(API);

// ---- E falhar em cada estrago (copia em /tmp) ----
const FICH = ['proxy.js', '_oferta-btc-origem.js'];
let estragos = 0;
async function estraga(nome, ficheiro, de, para) {
  const tmp = mkdtempSync(join(tmpdir(), 'btcenc-'));
  try {
    const apiTmp = join(tmp, 'api');
    cpSync(API, apiTmp, { recursive: true });
    mkdirSync(join(tmp, 'presenca')); // o proxy carrega _snapshot.js, que le ../presenca/snapshot-publico.json
    cpSync(join(AQUI, '..', 'presenca', 'snapshot-publico.json'), join(tmp, 'presenca', 'snapshot-publico.json'));
    const f = join(apiTmp, ficheiro);
    const src = readFileSync(f, 'utf8');
    assert.ok(src.includes(de), 'estrago nao aplicavel: ' + nome);
    writeFileSync(f, src.replace(de, para));
    let apanhado = false;
    try { await suite(apiTmp); } catch { apanhado = true; }
    assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
    estragos += 1;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
assert.ok(FICH.every((f) => readFileSync(join(API, f), 'utf8').length > 0));

await estraga('proxy deixa de encaminhar a prova Bitcoin', 'proxy.js', 'if (prova && prova.btc && await viaDirecta()) return;', '');
await estraga('proxy encaminha todas as provas', 'proxy.js', 'if (prova && prova.btc && await viaDirecta()) return;', 'if (prova && await viaDirecta()) return;');
await estraga('proxy nao acrescenta a oferta', 'proxy.js', 'if (junta.alterado) {', 'if (false) {');
await estraga('proxy sem prazo na oferta', 'proxy.js', 'await comPrazo(btcOferta.oferta(alvoPago.tier), Number(process.env.ORUM_BTC_OFERTA_PRAZO_MS) || 2500)', 'await btcOferta.oferta(alvoPago.tier)');
await estraga('proxy aponta a prova para outro sitio', 'proxy.js', '`https://${hostExterno}${alvoPago.tier.path}`', "'https://supabase.example/x'");
await estraga('modulo acrescenta oferta indisponivel', '_oferta-btc-origem.js', "if (!oferta || oferta.disponivel !== true) return intacto('oferta_indisponivel');", '');
await estraga('modulo sobrepoe oferta existente', '_oferta-btc-origem.js', "if (c.pagamento_alternativo_bitcoin !== undefined) return intacto('ja_tem_oferta');", '');
await estraga('modulo acrescenta fora de 402', '_oferta-btc-origem.js', "if (status !== 402) return intacto('nao_e_402');", '');
await estraga('modulo altera o payTo da Base', '_oferta-btc-origem.js', "c.pagamento_alternativo_bitcoin = {", "c.accepts[0].payTo = '0x0000000000000000000000000000000000000001'; c.pagamento_alternativo_bitcoin = {");
await estraga('modulo esquece o URL da prova', '_oferta-btc-origem.js', 'apresentar_prova_em: urlProva', 'apresentar_prova_em: undefined');
await estraga('modulo esquece as fronteiras', '_oferta-btc-origem.js', 'c.fronteiras_pagamento_bitcoin = fronteiras;', '');
await estraga('modulo aceita URL nao https', '_oferta-btc-origem.js', "!/^https:\\/\\/[^\\s]+$/.test(urlProva)", 'false');
await estraga('prazo nunca corta', '_oferta-btc-origem.js', 'setTimeout(() => resolve(null), ms)', 'setTimeout(() => {}, ms)');
await estraga('prazo deixa passar o erro', '_oferta-btc-origem.js', '() => { clearTimeout(t); resolve(null); }', '(e) => { clearTimeout(t); resolve(Promise.reject(e)); }');

// ---- O texto nao promete e diz o que mudou ----
const doc = readFileSync(join(AQUI, '..', 'docs', 'x402-btc-v1.md'), 'utf8');
function verificarDoc(t) {
  assert.match(t, /livro 996/, 'o doc regista a alteracao de 23/10/2026');
  assert.doesNotMatch(t, /Quando o Supabase responde, o desafio dele passa sem a oferta\./, 'o doc nao repete o limite que deixou de ser verdade');
  assert.doesNotMatch(t, /receita garantida|rendimento garantido|garantimos|reembols/i, 'o doc nao promete');
}
verificarDoc(doc);
for (const [nome, t] of [
  ['doc repoe o limite antigo', doc + '\nQuando o Supabase responde, o desafio dele passa sem a oferta.'],
  ['doc promete receita garantida', doc + '\nReceita garantida para quem pagar.'],
  ['doc esquece o livro', doc.replace(/livro 996/g, 'livro')],
]) {
  let apanhado = false;
  try { verificarDoc(t); } catch { apanhado = true; }
  assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
  estragos += 1;
}

console.log(JSON.stringify({ verified: true, estragos_apanhados: estragos,
  prova: 'prova Bitcoin a /oraculo ou /campo vai para a via directa (duas fontes, 1 confirmacao) e nunca toca na origem; o 402 da origem ganha a oferta Bitcoin com o URL da prova; accepts, payTo e montante da Base intactos; sem oferta e sem partir quando a cotacao falha ou demora',
  nao_prova: 'que a Vercel alcance as fontes Esplora e de cotacao em producao, nem que alguem pague; nao ha receita externa' }));

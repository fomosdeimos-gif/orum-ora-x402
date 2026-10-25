// Verifica o encaminhamento do 402 da Base para a via directa (api/proxy.js): o desafio e a prova dirigidos a operacional
// servem-se na via directa; sem facilitador pronto, ou com ORUM_BASE_VIA=origem, tudo fica como estava (origem Supabase).
// Sem rede e sem pagamentos: origem, facilitador e RPC da Base sao simulados; o 402 da origem e a captura real de 23/10/2026.
// Depois da suite, estraga o codigo de proposito (copia em /tmp) e exige que a suite falhe em cada estrago.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const API = join(AQUI, '..', 'api');

process.env.ORUM_BTC_OFERTA_PRAZO_MS = '60';
delete process.env.ORUM_FACILITATOR_URL;
delete process.env.ORUM_BASE_VIA;

const fx = JSON.parse(readFileSync(join(AQUI, 'fixtures', 'campo-402-origem-2026-10-23.json'), 'utf8'));
const OPERACIONAL = '0x89460d9e0590559e63860197dfe2ac648A753584';
const SAGRADA = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const id = (n) => String(n).repeat(64).slice(0, 64);
const prova = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const dec = (h) => JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
const comLimite = (p, ms, nome) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('sem resposta a tempo: ' + nome)), ms))]);
const eip = (to) => prova({ payload: { signature: '0x' + 'ab'.repeat(65), authorization: { from: '0x' + '11'.repeat(20), to, value: '330000', validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 600), nonce: '0x' + id(9) } } });

// origem: (url) => { status, body, header? } ; facilitador: true (anuncia a Base mainnet) | false (404)
function mundo({ origem, facilitador = true } = {}) {
  const w = { origem: 0, facilitador: 0 };
  w.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.startsWith('https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/')) {
      w.origem += 1;
      const o = origem(url);
      return { status: o.status, headers: { get: (k) => ({ 'payment-required': o.header ?? null, 'content-type': 'application/json' })[k.toLowerCase()] ?? null }, text: async () => o.body };
    }
    if (url.startsWith('https://facilitator.payai.network')) {
      w.facilitador += 1;
      const r = (status, corpo) => ({ ok: status === 200, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });
      if (url.endsWith('/supported')) return facilitador ? r(200, { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }] }) : r(404, {});
      return r(200, { isValid: false, invalidReason: 'simulado' });
    }
    if (url.startsWith('https://facilitator.mogami.tech')) return { ok: false, status: 404, json: async () => ({}), text: async () => '{}' };
    if (/mainnet\.base\.org|publicnode|llamarpc|1rpc\.io/.test(url)) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: null }) };
    // cotacao e Esplora: indisponiveis (a oferta Bitcoin e um extra e nao interessa aqui)
    throw new Error('sem rota ' + url);
  };
  return w;
}
const origem402 = () => ({ status: 402, body: JSON.stringify(fx.corpo), header: fx.payment_required_header });
function mockRes() { const h = {}; return { h, statusCode: 0, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(raw) { this.raw = raw; } }; }

async function suite(dir) {
  const caminhoProxy = join(dir, 'proxy.js');
  const real = globalThis.fetch;
  const via = process.env.ORUM_BASE_VIA;
  const chama = async (w, { header, base = 'ora-x402' } = {}) => {
    globalThis.fetch = w.fetch;
    delete require.cache[caminhoProxy]; // facilitador e cotacao frios em cada chamada
    const proxy = require(caminhoProxy);
    const res = mockRes();
    await comLimite(proxy({ method: 'GET', query: { base }, headers: header ? { 'x-payment': header } : {}, socket: {} }, res), 2500, base);
    return { status: res.statusCode, h: res.h, body: res.raw ? JSON.parse(res.raw) : null };
  };
  try {
    delete process.env.ORUM_BASE_VIA;

    // 1. Sem prova e facilitador pronto: o desafio sai da via directa com a operacional; a origem nao e tocada.
    let w = mundo({ origem: origem402 });
    let r = await chama(w);
    assert.equal(r.status, 402);
    assert.equal(r.h['x-ora-via'], 'vercel-directa');
    assert.equal(w.origem, 0, 'a origem nao foi tocada');
    assert.equal(r.body.accepts[0].payTo, OPERACIONAL, 'o payTo anunciado e a operacional');
    assert.equal(r.body.accepts[0].network, 'eip155:8453');
    assert.equal(dec(r.h['payment-required']).accepts[0].payTo, OPERACIONAL, 'o cabecalho PAYMENT-REQUIRED diz o mesmo');

    // 2. Facilitador sem anunciar a Base: tudo como estava, o 402 da origem (sagrada antiga) passa.
    w = mundo({ origem: origem402, facilitador: false });
    r = await chama(w);
    assert.equal(r.status, 402);
    assert.equal(w.origem, 1);
    assert.equal(r.h['x-ora-via'], undefined);
    assert.equal(r.body.accepts[0].payTo, SAGRADA);

    // 3. Interruptor ORUM_BASE_VIA=origem: a origem serve mesmo com o facilitador pronto.
    process.env.ORUM_BASE_VIA = 'origem';
    w = mundo({ origem: origem402 });
    r = await chama(w);
    assert.equal(w.origem, 1);
    assert.equal(r.body.accepts[0].payTo, SAGRADA);
    // ... e uma prova por hash recusada pela origem nao passa a via directa
    w = mundo({ origem: origem402 });
    r = await chama(w, { header: prova({ transactionHash: '0x' + id(3) }) });
    assert.equal(w.origem, 1);
    assert.equal(r.h['x-ora-via'], undefined);
    delete process.env.ORUM_BASE_VIA;

    // 4. Autorizacao EIP-3009 para a operacional: via directa, origem nao tocada.
    w = mundo({ origem: origem402 });
    r = await chama(w, { header: eip(OPERACIONAL) });
    assert.equal(r.h['x-ora-via'], 'vercel-directa');
    assert.equal(w.origem, 0);
    assert.equal(r.status, 402); // o facilitador simulado recusa; o que importa e quem decidiu
    assert.equal(r.body.accepts[0].payTo, OPERACIONAL);

    // 5. Autorizacao EIP-3009 para a sagrada antiga: continua para a origem.
    w = mundo({ origem: () => ({ status: 200, body: JSON.stringify({ acesso: 'concedido', da: 'origem' }) }) });
    r = await chama(w, { header: eip(SAGRADA) });
    assert.equal(r.status, 200);
    assert.equal(r.body.da, 'origem');
    assert.equal(w.origem, 1);

    // 6. Hash para a operacional: a origem recusa com 402 e a via directa confere-o na Base (aqui: ainda nao indexado).
    w = mundo({ origem: origem402 });
    r = await chama(w, { header: prova({ transactionHash: '0x' + id(4) }) });
    assert.equal(w.origem, 1, 'a origem foi tentada primeiro');
    assert.equal(r.h['x-ora-via'], 'vercel-directa', 'e a via directa decidiu depois');
    assert.equal(r.body.x402, 'pending');

    // 7. Hash que a origem ainda nao viu (pending dela): fica o pending da origem, sem passar a via directa.
    w = mundo({ origem: () => ({ status: 402, body: JSON.stringify({ x402Version: 2, accepts: fx.corpo.accepts, x402: 'pending', detalhe: 'origem' }) }) });
    r = await chama(w, { header: prova({ transactionHash: '0x' + id(5) }) });
    assert.equal(r.body.detalhe, 'origem');
    assert.equal(r.h['x-ora-via'], undefined);

    // 8. Hash que a origem aceita (200): passa como estava.
    w = mundo({ origem: () => ({ status: 200, body: JSON.stringify({ acesso: 'concedido', da: 'origem' }) }) });
    r = await chama(w, { header: prova({ transactionHash: '0x' + id(6) }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.da, 'origem');

    // 9. Rota que nao e servico pago: nada e interceptado.
    w = mundo({ origem: () => ({ status: 200, body: JSON.stringify({ ok: true, rota: 'pulso' }) }) });
    r = await chama(w, { base: 'ora-pulso' });
    assert.equal(r.body.rota, 'pulso');
    assert.equal(w.origem, 1);
    assert.equal(w.facilitador, 0, 'nem o facilitador e sondado');
  } finally {
    globalThis.fetch = real;
    if (via === undefined) delete process.env.ORUM_BASE_VIA; else process.env.ORUM_BASE_VIA = via;
  }
}

// ---- A suite tem de passar no codigo real ----
await suite(API);

// ---- E falhar em cada estrago (copia em /tmp) ----
let estragos = 0;
async function estraga(nome, ficheiro, de, para) {
  const tmp = mkdtempSync(join(tmpdir(), 'basedir-'));
  try {
    const apiTmp = join(tmp, 'api');
    cpSync(API, apiTmp, { recursive: true });
    mkdirSync(join(tmp, 'presenca'));
    cpSync(join(AQUI, '..', 'presenca', 'snapshot-publico.json'), join(tmp, 'presenca', 'snapshot-publico.json'));
    const f = join(apiTmp, ficheiro);
    const src = readFileSync(f, 'utf8');
    assert.equal(src.split(de).length - 1, 1, 'estrago nao aplicavel (ausente ou ambiguo): ' + nome);
    writeFileSync(f, src.replace(de, para));
    let apanhado = false;
    try { await suite(apiTmp); } catch { apanhado = true; }
    assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
    estragos += 1;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
await estraga('o desafio da Base nunca vai pela via directa', 'proxy.js', "if (process.env.ORUM_BASE_VIA !== 'origem') {\n        const aOperacional", "if (false) {\n        const aOperacional");
await estraga('serve a via directa sem facilitador pronto', 'proxy.js', '(aOperacional || await directo.eipPronto())', 'true');
await estraga('encaminha todas as autorizacoes EIP-3009', 'proxy.js', '(aOperacional || !prova) &&', 'true &&');
await estraga('a autorizacao para a operacional vai para a origem', 'proxy.js', "=== WALLET.toLowerCase();\n        if", "!== WALLET.toLowerCase();\n        if");
await estraga('o interruptor nao desliga o desafio', 'proxy.js', "if (process.env.ORUM_BASE_VIA !== 'origem') {\n        const aOperacional", 'if (true) {\n        const aOperacional');
await estraga('o interruptor nao desliga o fallback do hash', 'proxy.js', "prova && prova.tx && process.env.ORUM_BASE_VIA !== 'origem'", 'prova && prova.tx');
await estraga('sem fallback para o hash', 'proxy.js', 'upstream.status === 402 && prova && prova.tx &&', 'false &&');
await estraga('o fallback ignora o pending da origem', 'proxy.js', 'if (!pendente && await viaDirecta()) return;', 'if (await viaDirecta()) return;');
await estraga('eipPronto diz sempre que sim', '_x402-directo.js', 'directo.eipPronto = () => prontoDe(cdp);', 'directo.eipPronto = () => true;');
await estraga('payTo da via directa volta a sagrada', '_x402-directo.js', "const { RECEBIMENTO: WALLET } = require('./_carteira');", "const { RECEBIMENTO_EDGE: WALLET } = require('./_carteira');");

// ---- O texto diz o que mudou e nao promete ----
const doc = readFileSync(join(AQUI, '..', 'docs', 'x402-base-directa-v1.md'), 'utf8');
function verificarDoc(t) {
  assert.match(t, /livro 1022/, 'o doc regista a alteracao');
  assert.match(t, /ORUM_BASE_VIA/, 'o doc diz como se desliga');
  assert.match(t, /não verificado|nao verificado/i, 'o doc diz o que nao foi verificado');
  assert.doesNotMatch(t, /receita garantida|rendimento garantido|garantimos|reembols/i, 'o doc nao promete');
}
verificarDoc(doc);
for (const [nome, t] of [
  ['doc promete receita garantida', doc + '\nReceita garantida para quem pagar.'],
  ['doc esquece o livro', doc.replace(/livro 1022/g, 'livro')],
  ['doc esquece o interruptor', doc.replace(/ORUM_BASE_VIA/g, 'X')],
]) {
  let apanhado = false;
  try { verificarDoc(t); } catch { apanhado = true; }
  assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
  estragos += 1;
}

console.log(JSON.stringify({ verified: true, estragos_apanhados: estragos,
  prova: 'com o facilitador pronto, o 402 da Base e a autorizacao EIP-3009 dirigida a operacional servem-se na via directa e a origem nao e tocada; sem facilitador pronto, ou com ORUM_BASE_VIA=origem, tudo fica como estava; o hash recusado pela origem (e nao pending) e conferido na Base pela via directa',
  nao_prova: 'que o facilitador publico liquida de facto na Base mainnet, que a Vercel alcanca RPC e facilitador em producao, nem que alguem pague; nao ha receita externa' }));

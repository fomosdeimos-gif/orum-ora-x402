// Verifica api/_bazaar-declaracao.js e o seu uso em api/proxy.js. Sem rede, sem pagamentos:
// o fetch da origem e simulado com a captura real de 23/10/2026 (scripts/fixtures/).
// Prova o que faz (eleva a declaracao Bazaar da origem para o topo, corpo e cabecalho v2) e
// o que NAO faz (inventar declaracao, tocar em payTo/montante/ativo, mexer noutros estados).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
process.env.ORUM_PEDIDOS = 'off'; // o registo de pedidos (api/_pedidos.js) adia res.end; tem o seu verificador (verify-pedidos-directos.mjs)
const require = createRequire(import.meta.url);

const fx = JSON.parse(fs.readFileSync('scripts/fixtures/campo-402-origem-2026-10-23.json', 'utf8'));
const MOD_SRC = fs.readFileSync('api/_bazaar-declaracao.js', 'utf8');
const PROXY_SRC = fs.readFileSync('api/proxy.js', 'utf8');

function carregar(src) {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', 'Buffer', src)(m, m.exports, require, Buffer);
  return m.exports;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const dec = (h) => JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
const corpoTexto = () => JSON.stringify(fx.corpo);

function verificarModulo(mod) {
  const { elevarBazaar } = mod;
  const original = fx.corpo.accepts[0].extensions.bazaar;

  // 1. A captura real: corpo e cabecalho elevados para o topo, com a MESMA declaracao da origem.
  assert.equal(fx.corpo.extensions, undefined, 'fixture: a origem nao traz extensions no topo');
  assert.equal(dec(fx.payment_required_header).extensions, undefined, 'fixture: o cabecalho vivo nao traz extensions');
  const r = elevarBazaar(402, corpoTexto(), fx.payment_required_header);
  assert.equal(r.alterado, true);
  const corpo = JSON.parse(r.text);
  assert.deepEqual(corpo.extensions.bazaar, original, 'corpo: declaracao igual a da origem');
  assert.ok(r.header, 'cabecalho novo');
  const cab = dec(r.header);
  assert.deepEqual(cab.extensions.bazaar, original, 'cabecalho: declaracao igual a da origem');

  // 2. Nada do que e dinheiro muda: accepts, payTo, montante, ativo, rede, resource.
  assert.deepEqual(corpo.accepts, fx.corpo.accepts, 'corpo: accepts intactos');
  assert.deepEqual(cab.accepts, dec(fx.payment_required_header).accepts, 'cabecalho: accepts intactos');
  assert.deepEqual(cab.resource, dec(fx.payment_required_header).resource, 'cabecalho: resource intacto');
  assert.equal(cab.accepts[0].payTo, '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5');
  assert.equal(cab.accepts[0].amount, '330000');
  assert.equal(corpo.accepts[0].asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');

  // 3. Idempotente: passar o resultado outra vez nao altera mais nada.
  const r2 = elevarBazaar(402, r.text, r.header);
  assert.equal(r2.alterado, false);
  assert.equal(r2.text, r.text);

  // 4. So em 402; outros estados passam intactos.
  for (const s of [200, 404, 429, 500, 503]) {
    const x = elevarBazaar(s, corpoTexto(), fx.payment_required_header);
    assert.equal(x.alterado, false, 'estado ' + s);
    assert.equal(x.text, corpoTexto());
    assert.equal(x.header, null);
  }

  // 5. Nao inventa: sem declaracao na origem, nada e acrescentado.
  const semDecl = clone(fx.corpo);
  delete semDecl.accepts[0].extensions;
  const rs = elevarBazaar(402, JSON.stringify(semDecl), null);
  assert.equal(rs.alterado, false);
  assert.equal(JSON.parse(rs.text).extensions, undefined);

  // 6. Declaracao da origem invalida (nao e http, sem schema) nao e elevada.
  for (const estrago of [
    (c) => { c.accepts[0].extensions.bazaar.info.input.type = 'mcp'; },
    (c) => { delete c.accepts[0].extensions.bazaar.schema; },
    (c) => { delete c.accepts[0].extensions.bazaar.info; },
  ]) {
    const c = clone(fx.corpo); estrago(c);
    assert.equal(elevarBazaar(402, JSON.stringify(c), null).alterado, false);
  }

  // 7. Entradas estranhas passam intactas, sem excepcao.
  assert.equal(elevarBazaar(402, 'nao e json', null).alterado, false);
  assert.equal(elevarBazaar(402, '', null).alterado, false);
  assert.equal(elevarBazaar(402, JSON.stringify({ x402Version: 1, accepts: [{}] }), null).alterado, false);
  assert.equal(elevarBazaar(402, 'x'.repeat(300000), null).alterado, false);
  // um desafio v1 com declaracao valida tambem nao se toca: o topo so existe no v2
  const v1 = clone(fx.corpo); v1.x402Version = 1;
  assert.equal(elevarBazaar(402, JSON.stringify(v1), null).alterado, false);

  // 8. Cabecalho ilegivel: o corpo e elevado, o cabecalho fica como veio (null = nao mexer).
  const rh = elevarBazaar(402, corpoTexto(), '@@@nao-e-base64-json@@@');
  assert.equal(rh.alterado, true);
  assert.equal(rh.header, null);

  // 9. Corpo ja no topo mas cabecalho sem: eleva so o cabecalho.
  const jaTopo = clone(fx.corpo); jaTopo.extensions = { bazaar: original };
  const rt = elevarBazaar(402, JSON.stringify(jaTopo), fx.payment_required_header);
  assert.equal(rt.alterado, true);
  assert.equal(rt.text, JSON.stringify(jaTopo));
  assert.deepEqual(dec(rt.header).extensions.bazaar, original);

  // 10. Preserva outras extensoes que a origem ja tenha no topo.
  const outra = clone(fx.corpo); outra.extensions = { exemplo: { a: 1 } };
  const ro = JSON.parse(elevarBazaar(402, JSON.stringify(outra), null).text);
  assert.deepEqual(ro.extensions.exemplo, { a: 1 });
  assert.deepEqual(ro.extensions.bazaar, original);
}

function verificarProxy(proxySrc) {
  // O proxy tem de importar o modulo, usa-lo sobre a resposta da origem e marcar o cabecalho.
  assert.match(proxySrc, /require\('\.\/_bazaar-declaracao'\)/, 'proxy importa o modulo');
  assert.match(proxySrc, /elevarBazaar\(upstream\.status, text, upstream\.headers\.get\('payment-required'\)\)/, 'proxy chama com estado, corpo e cabecalho da origem');
  assert.match(proxySrc, /try \{ bazaar = elevarBazaar\(/, 'proxy protege a chamada: falha segura, o 402 sai como veio');
  assert.match(proxySrc, /res\.setHeader\('payment-required', bazaar\.header\)/, 'proxy escreve o cabecalho elevado');
  assert.match(proxySrc, /res\.end\(bazaar\.text\)/, 'proxy responde com o corpo elevado');
  assert.match(proxySrc, /'x-ora-bazaar', 'declarado-no-topo'/, 'proxy marca o cabecalho de verificacao');
}

async function verificarProxyDeFacto() {
  // Corre o proxy a sério com a origem simulada pela captura real.
  const realFetch = globalThis.fetch;
  const origem = (status, body, header) => async () => ({
    status,
    headers: { get: (k) => ({ 'payment-required': header, 'content-type': 'application/json', 'x-ora-version': 'V31' })[k.toLowerCase()] ?? null },
    text: async () => body,
  });
  const proxy = require('../api/proxy.js');
  const mockRes = () => { const h = {}; return { h, statusCode: 0, setHeader(k, v) { h[k.toLowerCase()] = v; }, end(raw) { this.raw = raw; } }; };
  try {
    globalThis.fetch = origem(402, corpoTexto(), fx.payment_required_header);
    const res = mockRes();
    await proxy({ method: 'GET', query: { base: 'ora-x402' }, headers: {}, socket: {} }, res);
    assert.equal(res.statusCode, 402);
    assert.equal(res.h['x-ora-bazaar'], 'declarado-no-topo');
    assert.equal(dec(res.h['payment-required']).extensions.bazaar.info.input.type, 'http');
    assert.equal(JSON.parse(res.raw).extensions.bazaar.info.input.method, 'GET');
    assert.equal(JSON.parse(res.raw).accepts[0].payTo, '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5');

    // Uma resposta 200 da origem passa sem marca.
    globalThis.fetch = origem(200, JSON.stringify({ ok: true }), null);
    const res200 = mockRes();
    await proxy({ method: 'GET', query: { base: 'ora-x402' }, headers: {}, socket: {} }, res200);
    assert.equal(res200.statusCode, 200);
    assert.equal(res200.h['x-ora-bazaar'], undefined);
    assert.equal(res200.raw, JSON.stringify({ ok: true }));

    // Falha segura de facto: com o modulo a rebentar, o 402 da origem sai como veio (nao cai no fallback).
    const pProxy = require.resolve('../api/proxy.js');
    const pMod = require.resolve('../api/_bazaar-declaracao.js');
    const guardado = { proxy: require.cache[pProxy], mod: require.cache[pMod] };
    delete require.cache[pProxy];
    require.cache[pMod] = { id: pMod, filename: pMod, loaded: true, exports: { elevarBazaar() { throw new Error('rebentou de proposito'); } } };
    try {
      const proxyQueRebenta = require('../api/proxy.js');
      globalThis.fetch = origem(402, corpoTexto(), fx.payment_required_header);
      const resF = mockRes();
      await proxyQueRebenta({ method: 'GET', query: { base: 'ora-x402' }, headers: {}, socket: {} }, resF);
      assert.equal(resF.statusCode, 402);
      assert.equal(resF.h['payment-required'], fx.payment_required_header, 'cabecalho original intacto');
      assert.equal(resF.raw, corpoTexto(), 'corpo original intacto');
      assert.equal(resF.h['x-ora-bazaar'], undefined);
    } finally {
      delete require.cache[pProxy]; delete require.cache[pMod];
      if (guardado.proxy) require.cache[pProxy] = guardado.proxy;
      if (guardado.mod) require.cache[pMod] = guardado.mod;
    }
  } finally { globalThis.fetch = realFetch; }
}

verificarModulo(carregar(MOD_SRC));
verificarProxy(PROXY_SRC);
await verificarProxyDeFacto();

// ---- Estragos propositados: cada um tem de ser apanhado. ----
let estragos = 0;
function falhaModulo(nome, de, para) {
  assert.ok(MOD_SRC.includes(de), 'estrago nao aplicavel: ' + nome);
  let apanhado = false;
  try { verificarModulo(carregar(MOD_SRC.replace(de, para))); } catch { apanhado = true; }
  assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
  estragos += 1;
}
function falhaProxy(nome, de, para) {
  assert.ok(PROXY_SRC.includes(de), 'estrago nao aplicavel: ' + nome);
  let apanhado = false;
  try { verificarProxy(PROXY_SRC.replace(de, para)); } catch { apanhado = true; }
  assert.ok(apanhado, 'estrago NAO apanhado: ' + nome);
  estragos += 1;
}

falhaModulo('eleva tambem em 200', "if (status !== 402) return intacto('nao_e_402');", '');
falhaModulo('nao eleva o corpo', 'challenge.extensions = {', 'void {');
falhaModulo('nao eleva o cabecalho', 'h.extensions = {', 'void {');
falhaModulo('altera o payTo', 'novoTexto = JSON.stringify(challenge);', 'challenge.accepts[0].payTo = "0x0000000000000000000000000000000000000001"; novoTexto = JSON.stringify(challenge);');
falhaModulo('altera o montante', 'novoTexto = JSON.stringify(challenge);', 'challenge.accepts[0].amount = "1"; novoTexto = JSON.stringify(challenge);');
falhaModulo('inventa declaracao quando a origem nao traz', "if (!origem) return intacto('origem_sem_declaracao_bazaar');", 'if (!origem) { challenge.extensions = { bazaar: { info: { input: { type: "http", method: "GET" } }, schema: {} } }; return { text: JSON.stringify(challenge), header: null, alterado: true, motivo: "x" }; }');
falhaModulo('aceita declaracao nao http', "b.info.input.type === 'http' &&", '');
falhaModulo('aceita declaracao sem schema', 'b.schema && typeof b.schema === \'object\'\n    &&', 'true &&');
falhaModulo('deixa de ser idempotente', 'if (!temNoTopo(challenge)) {', 'if (true) {');
falhaModulo('rebenta com corpo nao json', "try { challenge = JSON.parse(bodyText); } catch { return intacto('corpo_nao_json'); }", 'challenge = JSON.parse(bodyText);');
falhaModulo('aceita desafio v1', 'challenge.x402Version !== 2 ||', '');
falhaModulo('perde outras extensoes do topo', "challenge.extensions && typeof challenge.extensions === 'object' ? challenge.extensions : {}", '{}');
falhaModulo('rebenta com cabecalho ilegivel', '    } catch { /* cabecalho ilegivel: fica como veio */ }', '    } finally { }');
falhaProxy('proxy deixa de proteger a chamada', 'try { bazaar = elevarBazaar(', 'bazaar = (elevarBazaar(');
falhaProxy('proxy deixa de importar o modulo', "require('./_bazaar-declaracao')", "require('./_x402-directo')");
falhaProxy('proxy deixa de escrever o cabecalho', "res.setHeader('payment-required', bazaar.header);", '');
falhaProxy('proxy responde com o corpo original', 'res.end(bazaar.text);', 'res.end(text);');
falhaProxy('proxy deixa de marcar', "'x-ora-bazaar', 'declarado-no-topo'", "'x-ora-bazaar', 'nada'");

console.log(JSON.stringify({ verified: true, estragos_apanhados: estragos,
  prova: 'a captura real de 23/10/2026 (corpo e cabecalho sem extensions no topo) passa a ter extensions.bazaar igual a declaracao da origem; accepts, payTo, montante e ativo intactos',
  nao_prova: 'que o Bazaar CDP passe a catalogar: isso so se vera depois de um pagamento x402 padrao cujo cliente ecoe a extensao, e a leitura do catalogo a seguir' }));

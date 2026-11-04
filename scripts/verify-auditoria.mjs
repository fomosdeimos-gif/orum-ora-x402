// Verifica a auditoria de descoberta na via directa (api/_auditoria.js + o tier 'auditoria' de api/_x402-directo.js).
// Sem rede e sem pagamentos reais: o catálogo da Coinbase e o RPC Base são simulados. Depois corre os mesmos testes
// contra cópias estragadas de propósito do código; cada estrago tem de falhar, senão o verificador não vale nada.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.ORUM_PEDIDOS = 'off';
process.env.ORUM_FACILITATOR_URL = 'off';
process.env.ORUM_BTC_RAIL = 'off';
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

// ---- catálogo simulado -------------------------------------------------------------------------------------------
function catalogo({ total = 2500, marcaEm = {}, falhaEm = [], contador } = {}) {
  return async (url) => {
    const u = new URL(url);
    if (contador) contador.n++;
    const off = Number(u.searchParams.get('offset'));
    const lim = Number(u.searchParams.get('limit'));
    if (falhaEm.includes(off)) return { status: 500, text: async () => 'erro' };
    const items = [];
    for (let i = off; i < Math.min(off + lim, total); i++) {
      items.push({ accepts: [{ resource: marcaEm[i] || `https://exemplo.invalid/r/${i}`, payTo: '0x0000000000000000000000000000000000000001' }], description: 'recurso ' + i });
    }
    return { status: 200, text: async () => JSON.stringify({ items, pagination: { limit: lim, offset: off, total } }) };
  };
}

// ---- verificação, parametrizada pela pasta api/ (a original ou uma cópia estragada) -------------------------------
async function verificar(apiDir) {
  const require = createRequire(join(apiDir, 'x'));
  const aud = require(join(apiDir, '_auditoria.js'));
  const d = require(join(apiDir, '_x402-directo.js'));
  const nativo = globalThis.fetch;
  try {
    // marcaValida
    assert.equal(aud.marcaValida('ab'), null, 'marca curta demais');
    assert.equal(aud.marcaValida('x'.repeat(65)), null, 'marca longa demais');
    assert.equal(aud.marcaValida('abc\u0000d'), null, 'caractere de controlo');
    assert.equal(aud.marcaValida(['abc']), null, 'não-texto');
    assert.equal(aud.marcaValida('  Ora Marca  '), 'Ora Marca');

    // varrimento completo, marca presente (e sem distinguir maiúsculas)
    let r = await aud.auditar('OraBrand', { fetchFn: catalogo({ marcaEm: { 1700: 'https://orabrand.example/api' } }) });
    assert.equal(r.varrimento_completo, true);
    assert.equal(r.proximo_offset, null);
    assert.equal(r.recursos_lidos, 2500);
    assert.equal(r.recursos_com_a_marca, 1);
    assert.deepEqual(r.amostra_de_recursos, ['https://orabrand.example/api']);
    assert.match(r.veredicto, /^INDEXADO/);

    // varrimento completo, marca ausente: só aqui se pode dizer NAO INDEXADO
    r = await aud.auditar('inexistente', { fetchFn: catalogo() });
    assert.equal(r.varrimento_completo, true);
    assert.match(r.veredicto, /^NAO INDEXADO/);

    // uma página falha a meio: cobertura contígua, nunca "não indexado"
    r = await aud.auditar('inexistente', { fetchFn: catalogo({ total: 5000, falhaEm: [2000] }) });
    assert.equal(r.varrimento_completo, false);
    assert.equal(r.proximo_offset, 2000, 'a cobertura pára na primeira página falhada');
    assert.equal(r.recursos_lidos, 2000);
    assert.match(r.veredicto, /^PARCIAL/);
    assert.ok(!/NAO INDEXADO/.test(r.veredicto));
    assert.ok(r.erro);

    // a primeira página falha: indeterminado
    r = await aud.auditar('inexistente', { fetchFn: catalogo({ falhaEm: [0] }) });
    assert.match(r.veredicto, /^INDETERMINADO/);
    assert.equal(r.varrimento_completo, false);

    // orçamento de tempo esgotado: parcial, com onde continuar
    let relogio = 0;
    r = await aud.auditar('inexistente', { fetchFn: catalogo({ total: 20000 }), agora: () => (relogio += 4000), orcamentoMs: 7000 });
    assert.equal(r.varrimento_completo, false);
    assert.ok(Number.isInteger(r.proximo_offset) && r.proximo_offset > 0 && r.proximo_offset < 20000);
    assert.match(r.veredicto, /^PARCIAL/);

    // continuação com offset
    r = await aud.auditar('orabrand', { offset: 2000, fetchFn: catalogo({ marcaEm: { 2100: 'https://orabrand.example' } }) });
    assert.equal(r.offset_inicial, 2000);
    assert.equal(r.recursos_lidos, 500);
    assert.equal(r.recursos_com_a_marca, 1);

    // ---- integração com o handler da via directa ----
    const NOW = Date.parse('2026-11-04T12:00:00Z');
    const PAYER = '0x1111111111111111111111111111111111111111';
    const pad = (h) => '0x' + h.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const tx = (n) => '0x' + String(n).repeat(64).slice(0, 64);
    const chain = { [tx(1)]: 500000n, [tx(2)]: 161000n, [tx(3)]: 'pendente' };
    let rpcChamadas = 0;
    const rpc = async (method, params) => {
      rpcChamadas++;
      if (method === 'eth_getTransactionReceipt') {
        const v = chain[params[0]];
        if (v === undefined || v === 'pendente') return null;
        return { status: '0x1', blockNumber: '0x64', logs: [{ address: d.USDC_BASE.toLowerCase(), topics: [d.TRANSFER_TOPIC, pad(PAYER), pad(d.WALLET)], data: '0x' + v.toString(16) }] };
      }
      if (method === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor((NOW - 60000) / 1000).toString(16) };
      throw new Error('inesperado ' + method);
    };
    const handler = d.createHandler({ rpc, now: () => NOW, esperar: async () => {} });
    const contador = { n: 0 };
    globalThis.fetch = catalogo({ marcaEm: { 10: 'https://orabrand.example' }, contador });
    const chamar = async (rest, url, pagamento) => {
      const res = { h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } };
      const req = { url, headers: pagamento ? { 'x-payment': Buffer.from(JSON.stringify(pagamento)).toString('base64') } : {} };
      const handled = await handler(req, res, { base: 'ora-auditoria', rest, origin: 'https://ora-x402-gateway.vercel.app' });
      return { handled, status: res.statusCode, body: res.body, h: res.h };
    };

    // desafio
    let c = await chamar('', '/auditoria');
    assert.equal(c.handled, true);
    assert.equal(c.status, 402);
    assert.equal(c.body.accepts[0].amount, '500000');
    assert.equal(c.body.accepts[0].payTo.toLowerCase(), d.WALLET.toLowerCase());
    assert.deepEqual(Object.keys(c.body.extensions.bazaar.info.input.queryParams), ['marca']);
    assert.equal(contador.n, 0, 'o desafio não lê o catálogo');
    assert.match(c.body.como_pagar.reacesso, /outra marca/, 'o texto do reacesso não pode prometer a mesma leitura');

    // amostra grátis
    c = await chamar('eco', '/auditoria/eco');
    assert.equal(c.status, 200);
    assert.equal(c.body.eco, 'gratuito');
    assert.equal(contador.n, 0, 'a amostra não lê o catálogo');

    // pago, mas sem marca: recusa ANTES de tocar na cadeia
    rpcChamadas = 0;
    c = await chamar('', '/auditoria', { transactionHash: tx(1) });
    assert.equal(c.status, 400);
    assert.equal(c.body.error, 'marca_em_falta_ou_invalida');
    assert.equal(rpcChamadas, 0, 'marca inválida não consome nem verifica o pagamento');
    c = await chamar('', '/auditoria?marca=ab', { transactionHash: tx(1) });
    assert.equal(c.status, 400);

    // valor insuficiente (0,161 em vez de 0,50): nada de catálogo
    c = await chamar('', '/auditoria?marca=orabrand', { transactionHash: tx(2) });
    assert.equal(c.status, 402);
    assert.equal(contador.n, 0, 'sem pagamento válido não se lê o catálogo');

    // pagamento ainda não indexado: pendente, nada de catálogo
    c = await chamar('', '/auditoria?marca=orabrand', { transactionHash: tx(3) });
    assert.equal(c.status, 402);
    assert.equal(c.body.x402, 'pending');
    assert.equal(contador.n, 0);

    // via Bitcoin não existe para este serviço, mesmo com a via ligada e uma tx "válida"
    const btcFalso = { activa: () => true, oferta: async () => ({ disponivel: false }), fronteiras: () => ({}), verificar: async () => ({ valid: true, payer: 'bc1falso', sats: 999999999, confirmacoes: 3, blockMs: NOW }) };
    const hBtc = d.createHandler({ rpc, now: () => NOW, btc: btcFalso, esperar: async () => {} });
    const resB = { h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } };
    await hBtc({ url: '/auditoria?marca=orabrand', headers: { 'x-payment': Buffer.from(JSON.stringify({ bitcoin: { txid: 'a'.repeat(64) } })).toString('base64') } }, resB, { base: 'ora-auditoria', rest: '', origin: 'https://ora-x402-gateway.vercel.app' });
    assert.equal(resB.statusCode, 402);
    assert.equal(contador.n, 0, 'Bitcoin não desbloqueia a auditoria');

    // pagamento válido: entrega
    c = await chamar('', '/auditoria?marca=orabrand', { transactionHash: tx(1) });
    assert.equal(c.status, 200);
    assert.equal(c.body.tier, 'auditoria');
    assert.equal(c.body.x402, 'verificado_onchain');
    assert.equal(c.body.resultado.recursos_com_a_marca, 1);
    assert.match(c.body.resultado.veredicto, /^INDEXADO/);
    assert.equal(c.body.truth_machine.is_introspective_reading, false);
    assert.ok(contador.n > 0);

    // o manifesto passa a listar o serviço e deixa de o dar como indisponível
    const m = await handler({ url: '/', headers: {} }, (() => { const r = { h: {}, setHeader() {}, end(raw) { this.body = JSON.parse(raw); } }; globalThis.__m = r; return r; })(), { base: 'ora-x402', rest: '.well-known/x402.json', origin: 'https://ora-x402-gateway.vercel.app' });
    assert.equal(m, true);
    assert.ok(globalThis.__m.body.resources.some((r) => r.resource.endsWith('/auditoria')));
    assert.ok(!globalThis.__m.body.indisponiveis_nesta_via.includes('auditoria-descoberta'));
  } finally { globalThis.fetch = nativo; }
}

await verificar(join(raiz, 'api'));

// ---- estragos propositados ------------------------------------------------------------------------------------------
const estragos = [
  ['_auditoria.js', 'dizer NAO INDEXADO sem varrimento completo', 'else if (completo) veredicto = `NAO', 'else if (true) veredicto = `NAO'],
  ['_auditoria.js', 'saltar uma página falhada e continuar', 'if (res[i].erro) { erro = res[i].erro; parou = true; break; }', 'if (res[i].erro) { erro = res[i].erro; continue; }'],
  ['_auditoria.js', 'distinguir maiúsculas', 'const agulha = marca.toLowerCase();', 'const agulha = marca;'],
  ['_auditoria.js', 'aceitar marcas curtas demais', 'const MARCA_MIN = 3;', 'const MARCA_MIN = 0;'],
  ['_auditoria.js', 'ignorar o orçamento de tempo', 'agora() - t0 < orcamentoMs', 'true'],
  ['_auditoria.js', 'perder o offset inicial', 'let proximo = offset;', 'let proximo = 0;'],
  ['_auditoria.js', 'aceitar marcas longas demais', 'const MARCA_MAX = 64;', 'const MARCA_MAX = 9999;'],
  ['_x402-directo.js', 'validar a marca depois de liquidar', 'if (!marcaA) return send(400', 'if (false) return send(400'],
  ['_x402-directo.js', 'aceitar prova Bitcoin neste serviço', "if (prova.btc) return challenge({ erro: 'a via Bitcoin so existe", "if (false) return challenge({ erro: 'a via Bitcoin so existe"],
  ['_x402-directo.js', 'ler o catálogo sem pagamento válido na amostra', "nota: 'Amostra livre da forma da resposta; não lê o catálogo nem prova nada.',", "nota: 'Amostra livre da forma da resposta; não lê o catálogo nem prova nada.', _x: await auditar('abc'),"],
  ['_x402-directo.js', 'preço errado', "usdc: '0.50', atomic: 500000n", "usdc: '0.50', atomic: 5000n"],
  ['_x402-directo.js', 'manter o serviço como indisponível', "indisponiveis_nesta_via: ['sedimento', 'kernel', 'licencas'],", "indisponiveis_nesta_via: ['sedimento', 'kernel', 'licencas', 'auditoria-descoberta'],"],
];
let apanhados = 0;
for (const [ficheiro, nome, de, para] of estragos) {
  const tmp = mkdtempSync(join(tmpdir(), 'aud-'));
  cpSync(join(raiz, 'api'), join(tmp, 'api'), { recursive: true });
  const f = join(tmp, 'api', ficheiro);
  const src = readFileSync(f, 'utf8');
  assert.ok(src.includes(de), `o estrago "${nome}" não encontra o texto a estragar; actualiza o verificador`);
  writeFileSync(f, src.replace(de, para));
  let apanhou = false;
  try { await verificar(join(tmp, 'api')); } catch { apanhou = true; }
  assert.ok(apanhou, `ESTRAGO NÃO APANHADO: ${nome}`);
  apanhados++;
}

console.log(JSON.stringify({ verified: true, estragos_apanhados: apanhados, prova: 'a auditoria só diz NAO INDEXADO com o catálogo varrido por inteiro, só lê o catálogo depois de pagamento verificado e de marca válida, não aceita Bitcoin, e o manifesto lista o serviço' }));

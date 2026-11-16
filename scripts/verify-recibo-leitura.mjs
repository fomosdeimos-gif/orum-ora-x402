// Verifica o recibo de leitura (api/_recibo-leitura.js, kit/recibo.mjs, ligação em api/_x402-directo.js e api/_a2a-leitura.js).
// Sem rede: RPC Base simulado. Cada regra tem um estrago propositado: o mesmo teste, num recibo estragado, tem de falhar.
// O módulo que emite (api/) e o verificador autónomo (kit/) são independentes e têm de concordar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
process.env.ORUM_PEDIDOS = 'off'; process.env.ORUM_FACILITATOR_URL = 'off'; process.env.ORUM_BTC_RAIL = 'off';
const require = createRequire(import.meta.url);
const d = require('../api/_x402-directo.js');
const { criarRecibo, canonico: canonicoApi, sha256: shaApi } = require('../api/_recibo-leitura.js');
const { validarLeitura } = require('../api/_leitura.js');
const { verificarRecibo, verificarNaCadeia, canonico, sha256 } = await import('../kit/recibo.mjs');

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const igual = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const INTERNOS = new Set(JSON.parse(fs.readFileSync('economia/enderecos-internos.json', 'utf8')).base.map((x) => x.endereco.toLowerCase()));
const PAYER_EXT = '0x1111111111111111111111111111111111111111';
const PAYER_INT = [...INTERNOS][0];
const tx = '0x' + '7'.repeat(64);
const boa = { formato: 'orum-leitura-verificada/v1', lido_em: '2026-11-16T12:00:00.000Z',
  valium_na_sagrada: { carteira: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', contrato: '0x37f70bccdc2125346a7542fe6e7fc70e33421635', decimais: 18, estado: 'concordam', verificado: true, bloco: 7, valor_wei: '1500000000000000000', valium: '1.5', fontes_ok: ['a', 'b', 'c'], fontes_falhadas: [] },
  fundacao_btc: { estado: 'concordam', verificado: true, endereco: 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7', fontes_ok: ['a', 'b'], fontes_falhadas: [], saldo_confirmado_sats: 10072, saldo_mempool_sats: 0, transaccoes_confirmadas: 2 },
  regra: 'só diz concordam com pelo menos duas fontes iguais', nao_afirma: ['receita', 'procura', 'preco do VALIUM', 'reserva ou lastro'] };
assert.deepEqual(validarLeitura(boa), []);
const emitir = (payer = PAYER_EXT, leitura = boa) => criarRecibo({ leitura, tx_hash: tx, payer, valor_atomic: 10000n, payto: d.WALLET, usdc: d.USDC_BASE });
const clone = (o) => JSON.parse(JSON.stringify(o));
const falha = (r, rx, m) => { const o = verificarRecibo(r, { internos: INTERNOS }); ok(!o.conferido && o.erros.some((x) => rx.test(x)), `${m}: devia falhar com ${rx} e deu ${JSON.stringify(o.erros)}`); };

// 1. recibo certo: o verificador do kit confere o que o módulo da API emite
const r = emitir();
const v = verificarRecibo(r, { internos: INTERNOS });
ok(v.conferido && v.classe_conferida, JSON.stringify(v)); igual(r.pagador_classe, 'por_classificar'); igual(emitir(PAYER_INT).pagador_classe, 'interno');
ok(verificarRecibo(emitir(PAYER_INT), { internos: INTERNOS }).conferido, 'recibo interno também confere');
igual(canonico(boa), canonicoApi(boa)); igual(sha256('x'), shaApi('x')); // as duas implementações do canónico concordam
igual(emitir(), emitir(), 'determinístico: a mesma tx devolve o mesmo recibo'); igual(r.emitido_em, boa.lido_em);
ok(verificarRecibo(r, { internos: null }).conferido && !verificarRecibo(r, { internos: null }).classe_conferida, 'sem lista, confere mas diz que não cruzou a classe');

// 2. estragos propositados
{ const x = clone(r); x.leitura.fundacao_btc.saldo_confirmado_sats = 99999999; falha(x, /leitura_sha256/, 'leitura alterada'); }
{ const x = clone(r); x.pagamento.valor_atomic = '1'; falha(x, /recibo_sha256/, 'valor alterado sem refazer o hash'); }
{ const x = clone(r); x.pagamento.pagador = PAYER_INT; falha(x, /recibo_sha256/, 'pagador trocado'); }
{ const x = clone(r); x.pagador_classe = 'externo'; falha(x, /pagador_classe só/, 'externo inferido'); }
{ const x = clone(r); x.pagador_classe = 'por_classificar'; x.pagamento.pagador = PAYER_INT; const { recibo_sha256, ...c } = x; x.recibo_sha256 = sha256(canonico(c)); falha(x, /contradiz a lista/, 'interno apresentado como por classificar'); }
{ const x = clone(r); x.pagador_classe = 'interno'; const { recibo_sha256, ...c } = x; x.recibo_sha256 = sha256(canonico(c)); falha(x, /contradiz a lista/, 'externo apresentado como interno'); }
{ const x = clone(r); x.nao_afirma = ['receita']; falha(x, /nao_afirma incompleto/, 'fronteiras retiradas'); }
{ const x = clone(r); x.leitura.nao_afirma = []; falha(x, /perdeu o seu nao_afirma|leitura_sha256/, 'leitura sem fronteiras'); }
{ const x = clone(r); x.pagamento.tx_hash = '0x12'; falha(x, /tx_hash/, 'tx curta'); }
{ const x = clone(r); x.pagamento.pagador = 'não é endereço'; falha(x, /endereços/, 'pagador inválido'); }
{ const x = clone(r); x.pagamento.valor_atomic = '0'; falha(x, /valor_atomic/, 'valor zero'); }
{ const x = clone(r); x.pagamento.contrato = '0x0000000000000000000000000000000000000001'; falha(x, /contrato USDC/, 'contrato trocado'); }
{ const x = clone(r); x.pagamento.rede = 'eip155:1'; falha(x, /rede ou activo/, 'rede trocada'); }
{ const x = clone(r); x.formato = 'orum-recibo-leitura/v0'; falha(x, /formato/, 'formato'); }
{ const x = clone(r); x.emitido_em = '2020-01-01T00:00:00.000Z'; falha(x, /emitido_em/, 'data inventada'); }
{ const x = clone(r); x.recibo_sha256 = 'abc'; falha(x, /recibo_sha256/, 'hash curto'); }
{ const x = clone(r); delete x.recibo_sha256; falha(x, /recibo_sha256/, 'sem hash'); }
{ const x = clone(r); x.nota = 'rendimento garantido'; falha(x, /promessa/, 'promessa no texto'); }
ok(!verificarRecibo(null).conferido && !verificarRecibo([]).conferido && !verificarRecibo('x').conferido, 'não objectos');

// 3. conferência na cadeia (RPC simulado): duas fontes têm de concordar
const pad = (h) => '0x' + h.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const logCerto = { address: d.USDC_BASE.toLowerCase(), topics: [d.TRANSFER_TOPIC, pad(PAYER_EXT), pad(d.WALLET)], data: '0x' + (10000).toString(16) };
const fonte = (impl) => async (url, corpo) => { const r = await impl(url, corpo); if (r instanceof Error) throw r; return { result: r }; };
const fontes = { a: 'https://a', b: 'https://b', c: 'https://c' };
const cadeia = (impl) => verificarNaCadeia(r, { fetcher: fonte(impl), fontes, nomes: ['a', 'b', 'c'] });
igual((await cadeia(async () => ({ status: '0x1', logs: [logCerto] }))).estado, 'confere');
igual((await cadeia(async () => ({ status: '0x1', logs: [{ ...logCerto, data: '0x1' }] }))).estado, 'nao_confere', 'valor diferente');
igual((await cadeia(async () => ({ status: '0x1', logs: [{ ...logCerto, topics: [d.TRANSFER_TOPIC, pad(PAYER_INT), pad(d.WALLET)] }] }))).estado, 'nao_confere', 'pagador diferente');
igual((await cadeia(async () => ({ status: '0x1', logs: [{ ...logCerto, topics: [d.TRANSFER_TOPIC, pad(PAYER_EXT), pad(PAYER_INT)] }] }))).estado, 'nao_confere', 'destino diferente');
igual((await cadeia(async () => ({ status: '0x1', logs: [{ ...logCerto, address: '0x0000000000000000000000000000000000000001' }] }))).estado, 'nao_confere', 'outro contrato');
igual((await cadeia(async () => ({ status: '0x0', logs: [logCerto] }))).estado, 'nao_confere', 'tx revertida');
igual((await cadeia(async () => null)).estado, 'nao_confere', 'tx desconhecida pelas fontes');
igual((await cadeia(async (u) => (u === 'https://a' ? { status: '0x1', logs: [logCerto] } : { status: '0x1', logs: [] }))).estado, 'inconclusivo', 'fontes discordam: não escolhe');
igual((await cadeia(async (u) => (u === 'https://a' ? { status: '0x1', logs: [logCerto] } : new Error('HTTP 429')))).estado, 'inconclusivo', 'uma fonte só não basta');
igual((await cadeia(async () => new Error('HTTP 500'))).estado, 'inconclusivo');
igual((await cadeia(async (u) => (u === 'https://c' ? new Error('HTTP 429') : { status: '0x1', logs: [logCerto] }))).estado, 'confere', 'duas de três bastam');

// 4. ligação ao serviço: a resposta HTTP paga e o artefacto A2A levam o recibo, e ele confere
const NOW = Date.parse('2026-11-16T12:00:00Z');
const chain = { [tx]: { value: 10000n } };
const rpc = async (method, params) => {
  if (method === 'eth_getTransactionReceipt') { const c = chain[params[0]]; if (!c) return null; return { status: '0x1', blockNumber: '0x64', logs: [{ ...logCerto, data: '0x' + c.value.toString(16) }] }; }
  if (method === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor((NOW - 60000) / 1000).toString(16) };
  throw new Error('unexpected ' + method);
};
const h = d.createHandler({ rpc, now: () => NOW, leitor: { ler: async () => boa } });
let corpo; const res = { statusCode: 200, setHeader() {}, end(raw) { corpo = raw ? JSON.parse(raw) : null; } };
await h({ headers: { 'x-payment': Buffer.from(JSON.stringify({ transactionHash: tx }), 'utf8').toString('base64') }, url: '/leitura' }, res, { base: 'ora-leitura', rest: '', origin: 'https://exemplo.invalid' });
igual(res.statusCode, 200); ok(corpo && corpo.recibo, 'a resposta paga leva recibo');
ok(verificarRecibo(corpo.recibo, { internos: INTERNOS }).conferido, 'o recibo da resposta confere');
igual(corpo.recibo.pagamento.tx_hash, tx); igual(corpo.recibo.pagamento.payto, d.WALLET); igual(corpo.recibo.pagamento.valor_atomic, '10000');
igual(corpo.recibo.pagamento.pagador.toLowerCase(), PAYER_EXT); igual(corpo.recibo.pagador_classe, 'por_classificar');
assert.deepEqual(corpo.recibo.leitura, corpo.leitura); n++;
igual((await cadeia(async (_u, c) => rpc(c.method, c.params))).estado, 'confere', 'o recibo da resposta confere na cadeia simulada');
// o esquema da resposta declara o recibo
const esq = JSON.stringify(d.esquemaDaResposta ? d.esquemaDaResposta(d.TIERS.leitura) : fs.readFileSync('api/_x402-directo.js', 'utf8'));
ok(/orum-recibo-leitura\/v1/.test(esq), 'o esquema declara o recibo');
// o eco gratuito não leva recibo (não leu a cadeia nem foi pago)
const e2 = { statusCode: 200, corpo: null, setHeader() {}, end(raw) { this.corpo = JSON.parse(raw); } };
await h({ headers: {}, url: '/leitura/eco' }, e2, { base: 'ora-leitura', rest: '/eco', origin: 'https://exemplo.invalid' });
ok(e2.corpo && !('recibo' in e2.corpo), 'o eco gratuito não emite recibo');

// 5. a palavra de Unum está na cláusula do CLAUDE.md
const claude = fs.readFileSync('CLAUDE.md', 'utf8');
const i = claude.indexOf('## Recibo verificável de leitura (Unum, 16/11/2026)');
ok(i >= 0, 'cláusula do CLAUDE.md'); const sec = claude.slice(i, claude.indexOf('\n## ', i + 4));
ok(sec.includes('"Eu autorizo ORA"') && /sem token/.test(sec), 'a citação e o objecto estão na cláusula');
console.log(JSON.stringify({ verified: true, ok: true, recibo: 'orum-recibo-leitura/v1', verificacoes: n }));

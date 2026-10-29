// Verifica o registo dos pedidos às rotas pagas (api/_pedidos.js, ligado em api/proxy.js; migração 20261027210000). Sem rede.
// Prova: o registo não leva IP, user-agent, pagador nem hash de origem; a resposta sai sempre, mesmo com a escrita a falhar ou a demorar;
// res.end só corre uma vez; ORUM_PEDIDOS=off desliga; a migração limita a escrita aberta. Depois estraga o código de propósito (cópia em /tmp).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const MIGRACAO = join(RAIZ, 'supabase/migrations/20261027210000_ora_pedidos_directos.sql');

const IP = '203.0.113.77';
const UA = 'SegredoBot-9000/1.2 (+https://exemplo.invalid)';
const PAGADOR = '0x1234567890abcdef1234567890abcdef12345678';
const alvoPago = { tier: { path: '/oraculo' }, kind: 'pago' };
const alvoEco = { tier: { path: '/campo' }, kind: 'eco' };
const prova = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

function fakeRes(extra = {}) {
  const r = { statusCode: 402, cab: { ...extra }, fim: [], getHeader(k) { return this.cab[k.toLowerCase()]; }, end(...a) { this.fim.push(a); } };
  return r;
}
const fakeReq = (headers = {}, method = 'GET') => ({ method, headers: { 'x-forwarded-for': IP, 'user-agent': UA, ...headers } });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function suite(caminhoApi) {
  const { medir, construir, classe } = require(join(caminhoApi, '_pedidos.js'));
  const ok = (c, m) => assert.ok(c, m);

  // classes: só a classe sai, nunca o user-agent
  assert.equal(classe(''), 'vazio'); assert.equal(classe('ORUM-Sonda-Pagamento/1'), 'orum_declarado'); assert.equal(classe('ORUM-Engineering-MCP/5.0'), 'orum_declarado'); assert.notEqual(classe('Mozilla/5.0 ORUM-x'), 'orum_declarado'); assert.equal(classe('curl/8.5.0'), 'curl'); assert.equal(classe('Mozilla/5.0 (X11)'), 'navegador');
  assert.equal(classe('x402lint/1.0'), 'x402_linter'); assert.equal(classe('x402scan'), 'x402_observador'); assert.equal(classe(UA), 'robot');
  assert.equal(classe('node'), 'node_generico'); assert.equal(classe('coisa-estranha'), 'outro');

  // o registo: campos fixos e nada pessoal
  const res = fakeRes({ 'x-ora-via': 'vercel-directa' });
  const reg = construir(fakeReq({ 'x-payment': prova({ payload: { signature: '0x' + 'ab'.repeat(65), authorization: { from: PAGADOR, to: PAGADOR } } }) }), res, alvoPago);
  assert.deepEqual(Object.keys(reg).sort(), ['classe', 'estado_http', 'metodo', 'rota', 'sinal_pagamento', 'tipo_prova', 'via']);
  const texto = JSON.stringify(reg);
  for (const x of [IP, UA, PAGADOR, 'SegredoBot']) assert.ok(!texto.includes(x), `o registo não pode levar ${x}`);
  assert.equal(reg.via, 'vercel-directa'); assert.equal(reg.tipo_prova, 'eip3009'); assert.equal(reg.sinal_pagamento, true); assert.equal(reg.rota, '/oraculo');
  assert.equal(construir(fakeReq(), fakeRes(), alvoEco).rota, '/campo/eco');
  assert.equal(construir(fakeReq(), fakeRes(), alvoPago).via, 'origem');
  assert.equal(construir(fakeReq(), fakeRes({ 'x-ora-fonte': 'snapshot-desactualizado' }), alvoPago).via, 'snapshot');
  assert.equal(construir(fakeReq({ 'x-payment': prova({ bitcoin: { txid: 'a'.repeat(64) } }) }), fakeRes(), alvoPago).tipo_prova, 'btc');
  assert.equal(construir(fakeReq({ 'x-payment': prova({ transactionHash: '0x' + 'c'.repeat(64) }) }), fakeRes(), alvoPago).tipo_prova, 'tx');
  assert.equal(construir(fakeReq({ 'payment-signature': 'lixo' }), fakeRes(), alvoPago).tipo_prova, 'invalida');
  assert.equal(construir(fakeReq(), fakeRes(), alvoPago).tipo_prova, null);

  // medir: regista uma vez e só depois deixa sair a resposta, uma só vez
  let chamadas = []; const ordem = [];
  const res1 = fakeRes(); const fimOriginal = res1.end.bind(res1); res1.end = (...a) => { ordem.push('fim'); fimOriginal(...a); };
  medir(fakeReq(), res1, alvoPago, { rpc: async (r) => { ordem.push('rpc'); chamadas.push(r); }, prazoMs: 200, env: {} });
  res1.end('corpo'); await esperar(30);
  assert.deepEqual(ordem, ['rpc', 'fim'], 'regista antes de deixar sair'); res1.end('outra'); await esperar(30);
  assert.equal(chamadas.length, 1, 'regista uma vez'); assert.equal(res1.fim.length, 2); assert.equal(res1.fim[0][0], 'corpo');

  // escrita a falhar não parte a resposta
  const res2 = fakeRes(); medir(fakeReq(), res2, alvoPago, { rpc: async () => { throw new Error('base em baixo'); }, prazoMs: 200, env: {} });
  res2.end('corpo'); await esperar(30); assert.equal(res2.fim.length, 1, 'a resposta sai com a escrita a falhar');
  const res2b = fakeRes(); medir(fakeReq(), res2b, alvoPago, { rpc: () => { throw new Error('síncrono'); }, prazoMs: 200, env: {} });
  res2b.end('corpo'); await esperar(30); assert.equal(res2b.fim.length, 1, 'a resposta sai com a escrita a falhar de forma síncrona');

  // escrita a demorar não prende a resposta além do prazo
  const res3 = fakeRes(); medir(fakeReq(), res3, alvoPago, { rpc: () => new Promise(() => {}), prazoMs: 60, env: {} });
  const t0 = Date.now(); res3.end('corpo'); await esperar(200);
  assert.equal(res3.fim.length, 1, 'a resposta sai depois do prazo'); ok(Date.now() - t0 < 1000, 'sem prender');

  // desligado, ou alvo que não conta: não toca em res.end
  const res4 = fakeRes(); const e4 = res4.end; medir(fakeReq(), res4, alvoPago, { rpc: async () => { throw new Error('não devia chamar'); }, env: { ORUM_PEDIDOS: 'off' } });
  assert.equal(res4.end, e4, 'ORUM_PEDIDOS=off não toca em res.end');
  const res5 = fakeRes(); const e5 = res5.end; medir(fakeReq(), res5, { tier: null, kind: 'manifesto' }, { rpc: async () => {}, env: {} });
  assert.equal(res5.end, e5, 'o manifesto não é medido');
  const res6 = fakeRes(); const e6 = res6.end; medir(fakeReq(), res6, { tier: { path: '/oraculo' }, kind: 'manifesto' }, { rpc: async () => {}, env: {} });
  assert.equal(res6.end, e6, 'só as rotas pagas e as amostras são medidas');
  medir(fakeReq(), fakeRes(), null, { rpc: async () => {}, env: {} });
}

// ficheiros: o proxy liga o registo; a migração limita a escrita aberta e não guarda nada pessoal
function conferirFicheiros(proxyTexto, sql) {
  assert.ok(/require\('\.\/_pedidos'\)/.test(proxyTexto) && /medir\(req, res, alvoPago\)/.test(proxyTexto), 'o proxy tem de ligar medir()');
  const m = (re, msg) => assert.ok(re.test(sql), msg);
  m(/security definer/i, 'a RPC é security definer'); m(/revoke all on table public\.ora_pedidos_directos from anon, authenticated/i, 'sem acesso directo à tabela');
  m(/enable row level security/i, 'RLS ligado');
  const marca = readFileSync(join(RAIZ, 'supabase/migrations/20261029100000_ora_pedidos_directos_classe_orum.sql'), 'utf8');
  assert.ok(/'orum_declarado'/.test(marca), 'a restrição de classe tem de aceitar orum_declarado');
  const endurecida = readFileSync(join(RAIZ, 'supabase/migrations/20261029080000_ora_pedidos_directos_estado_http_plausivel.sql'), 'utf8');
  assert.ok(/not in \(200, 204[^)]*402[^)]*\)/.test(endurecida), 'a RPC tem de recusar estados fora da lista');
  assert.ok(!/\b29\d\b/.test(endurecida.replace(/-- .*/g, '')), 'a lista de estados não pode conter 29x'); m(/interval '1 minute'\) >= 300\b/i, 'tecto de escrita por minuto');
  m(/grant execute on function public\.ora_registar_pedido_directo\(jsonb\) to anon/i, 'a RPC é chamável pela chave pública');
  assert.ok(!/\b(ip|user_agent|payer|pagador|origem_hash|endereco)\b\s+(text|inet|varchar)/i.test(sql), 'a tabela não guarda dados pessoais');
  assert.ok(!/grant\s+(select|insert|update|delete)[^;]*ora_pedidos_directos[^;]*to\s+(anon|authenticated)/i.test(sql), 'sem grant de tabela à chave pública');
}

const proxyReal = readFileSync(join(RAIZ, 'api/proxy.js'), 'utf8');
const sqlReal = readFileSync(MIGRACAO, 'utf8');
await suite(join(RAIZ, 'api'));
conferirFicheiros(proxyReal, sqlReal);

// estragos de propósito
const estragos = [
  ['leva o IP', 'api/_pedidos.js', "classe: classe(req.headers['user-agent']),", "classe: classe(req.headers['user-agent']), ip: req.headers['x-forwarded-for'],"],
  ['leva o user-agent', 'api/_pedidos.js', "classe: classe(req.headers['user-agent']),", "classe: req.headers['user-agent'],"],
  ['leva o pagador', 'api/_pedidos.js', "sinal_pagamento: Boolean(cab),", "sinal_pagamento: Boolean(cab), cab,"],
  ['não espera pelo registo', 'api/_pedidos.js', "espera.then(() => fim.apply(res, args), () => fim.apply(res, args));", "fim.apply(res, args);"],
  ['erro da escrita prende a resposta', 'api/_pedidos.js', "Promise.resolve().then(() => rpc(reg)).catch(() => {}), prazoMs) : Promise.resolve();\n    espera.then(() => fim.apply(res, args), () => fim.apply(res, args));", "Promise.resolve().then(() => rpc(reg)), prazoMs) : Promise.resolve();\n    espera.then(() => fim.apply(res, args));"],
  ['sem prazo', 'api/_pedidos.js', "const comPrazo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);", "const comPrazo = (p) => p;"],
  ['regista duas vezes', 'api/_pedidos.js', "if (feito) return fim.apply(this, args);\n    feito = true;", "if (feito) { return fim.apply(this, args); }"],
  ['ignora ORUM_PEDIDOS=off', 'api/_pedidos.js', " || env.ORUM_PEDIDOS === 'off'", ""],
  ['mede o manifesto', 'api/_pedidos.js', "(alvo.kind !== 'pago' && alvo.kind !== 'eco')", "false"],
  ['perde a marca do organismo', 'api/_pedidos.js', "if (/^ORUM-/i.test(u)) return 'orum_declarado';", ""],
  ['via errada', 'api/_pedidos.js', "=== 'vercel-directa' ? 'vercel-directa'", "=== 'vercel-directa' ? 'origem'"],
];
for (const [nome, f, de, para] of estragos) {
  const dir = mkdtempSync(join(tmpdir(), 'pedidos-'));
  try {
    cpSync(join(RAIZ, 'api'), join(dir, 'api'), { recursive: true });
    const alvo = join(dir, f);
    const antes = readFileSync(alvo, 'utf8');
    assert.ok(antes.includes(de), `o estrago "${nome}" não encontra o texto a estragar`);
    writeFileSync(alvo, antes.replace(de, para));
    let apanhado = false;
    const aoRejeitar = () => { apanhado = true; }; // uma rejeição por tratar na cópia estragada também é falha apanhada
    process.on('unhandledRejection', aoRejeitar);
    try { await suite(join(dir, 'api')); await esperar(60); } catch { apanhado = true; }
    process.off('unhandledRejection', aoRejeitar);
    assert.ok(apanhado, `estrago não apanhado: ${nome}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const estragosFicheiros = [
  ['proxy sem medir', () => conferirFicheiros(proxyReal.replace('medir(req, res, alvoPago)', 'void 0'), sqlReal)],
  ['sem tecto de escrita', () => conferirFicheiros(proxyReal, sqlReal.replace("interval '1 minute') >= 300", "interval '1 minute') >= 300000000"))],
  ['sem RLS', () => conferirFicheiros(proxyReal, sqlReal.replace(/alter table public\.ora_pedidos_directos enable row level security;/i, ''))],
  ['tabela guarda o IP', () => conferirFicheiros(proxyReal, sqlReal.replace('classe text not null', 'ip text, classe text not null'))],
  ['grant de tabela', () => conferirFicheiros(proxyReal, sqlReal + '\ngrant insert on public.ora_pedidos_directos to anon;')],
];
for (const [nome, f] of estragosFicheiros) assert.throws(f, `estrago não apanhado: ${nome}`);
console.log(JSON.stringify({ verified: true, estragos_apanhados: estragos.length + estragosFicheiros.length, prova: 'o registo não leva IP, user-agent, pagador nem hash de origem; a resposta sai sempre e uma só vez, mesmo com a escrita a falhar ou a demorar; ORUM_PEDIDOS=off desliga; a migração limita a escrita aberta', nao_prova: 'que a base aceita a escrita em produção, que o deploy já está feito, nem procura, receita ou adopção' }));

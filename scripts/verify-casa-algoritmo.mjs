// Verifica kit/casa.mjs (a casa como algoritmo) contra a casa que existe: corre o verdelaranja.js real num DOM de teste,
// com as mesmas leituras, e exige que o algoritmo diga o mesmo texto, id a id. Sem rede.
// Depois estraga o algoritmo de propósito (cópia em /tmp) e exige que a comparação falhe em cada estrago;
// estraga também uma cópia do script do navegador, para provar que a comparação lê mesmo o script.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const CASA = join(RAIZ, 'kit', 'casa.mjs');
const SCRIPT = join(RAIZ, 'verdelaranja.js');
const HTML = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const NOW = Date.parse('2026-11-17T12:00:00Z');
const iso = (msAtras) => new Date(NOW - msAtras).toISOString();
const MIN = 60 * 1000; const H = 60 * MIN;
const SHA = 'a'.repeat(64);

// ---- as leituras: cada cenário é o que o organismo publica ----
const obras = [
  { id: 1, titulo: 'Primeira', descricao_visivel: 'Vestígio um', sha256: 'b'.repeat(64) },
  { id: 2, titulo: 'Segunda', descricao_visivel: 'Vestígio dois', sha256: SHA },
  { id: 3, sha256: 'c'.repeat(64) },
  { id: 1.5, titulo: 'Fraccionada' }, { id: 0, titulo: 'Zero' }, { id: -4, titulo: 'Negativa' },
];
const licencas = [
  { tipo: 'consulta', preco: '0,161 USDC', descricao: 'Observar', duracao_da_licenca: '30 dias' },
  { tipo: 'editorial', preco: '1,5 USDC', descricao: 'Publicar' },
  { tipo: 'treino', descricao: 'Investigar', duracao_da_licenca: '1 ano' },
  { tipo: 'outra', preco: '9 USDC' },
];
const catalogo = { obras, licencas };
const eventos5 = [
  { tipo: 'visita', quando: iso(10 * MIN), detalhe: 'Uma máquina chegou' },
  { tipo: 'visita', quando: iso(10 * MIN), detalhe: 'Uma máquina chegou' }, // repetido
  { tipo: 'sinal', quando: iso(20 * MIN), detalhe: 'Segundo' },
  { tipo: 'sinal', quando: '2026-07-01T10:00:00Z', detalhe: 'Verão de Lisboa' },
  { tipo: 'so-tipo', quando: iso(40 * MIN) },
  { tipo: 'quinto', quando: iso(50 * MIN), detalhe: 'Quinto' },
  { quando: 'não é data', detalhe: 'Sem hora' },
];
const pulsoVivo = (idade = 5 * MIN, extra = {}) => ({
  campo: { dia: 231 }, sentinela: { veredicto: 'OBSERVAR', frase: 'Sem alteração.', verificado_em: iso(idade) },
  convite: { maquinas_reconhecidas_total: 25078 }, eventos: eventos5, ...extra,
});
const tesouro = (idade = 2 * H, usdc = 12.345678, disponivel = true) => ({ evidence: { external_confirmed_usdc: usdc, source: { available: disponivel, observed_at: iso(idade) } } });
const falha = new Error('HTTP 500');

export const CENARIOS = {
  'tudo vivo': { pulso: pulsoVivo(), tesouraria: tesouro(), catalogo },
  'vigilância com 45 min': { pulso: pulsoVivo(45 * MIN), tesouraria: tesouro(), catalogo },
  'vigilância antiga, tesouraria com 30 h': { pulso: pulsoVivo(3 * H, { eventos: [] }), tesouraria: tesouro(30 * H, 0), catalogo },
  'cópia de recurso com repetidos': { pulso: { estado: 'snapshot_desactualizado', campo: { dia: 230 }, snapshot_observado_em: iso(26 * H), eventos: eventos5 }, tesouraria: tesouro(), catalogo },
  'cópia de recurso sem eventos nem dia': { pulso: { estado: 'snapshot_desactualizado', campo: {}, eventos: [] }, tesouraria: tesouro(), catalogo },
  'cópia sem campo': { pulso: { estado: 'snapshot_desactualizado', eventos: [] }, tesouraria: tesouro(), catalogo },
  'tudo falha': { pulso: falha, tesouraria: falha, catalogo: falha },
  'pulso sem convite, tesouraria sem fonte': { pulso: { campo: { dia: 1 }, sentinela: {} }, tesouraria: tesouro(1 * H, 3, false), catalogo },
  'tesouraria com valor inválido': { pulso: pulsoVivo(), tesouraria: { evidence: { external_confirmed_usdc: null, source: { available: true, observed_at: iso(H) } } }, catalogo },
  'pulso sem veredicto, frase nem dia': { pulso: { campo: { dia: 'x' }, sentinela: { verificado_em: iso(MIN) }, convite: { maquinas_reconhecidas_total: 0 }, eventos: [{ quando: iso(MIN) }] }, tesouraria: tesouro(), catalogo },
  'obra 2 ausente, sem hash, sem vestígio': { pulso: pulsoVivo(), tesouraria: tesouro(), catalogo: { obras: [{ id: 7, titulo: 'Sete', sha256: 'curto' }, { id: 9 }], licencas: [licencas[0]] } },
  'catálogo sem licenças de tipo válido': { pulso: pulsoVivo(), tesouraria: tesouro(), catalogo: { obras: [obras[1]], licencas: [{ tipo: 'outra' }] } },
  'catálogo só com obras inválidas': { pulso: pulsoVivo(), tesouraria: tesouro(), catalogo: { obras: [obras[3], obras[4]], licencas } },
  'catálogo incompleto': { pulso: pulsoVivo(), tesouraria: tesouro(), catalogo: { obras } },
};

// ---- o DOM de teste: o mínimo que o verdelaranja.js pede ----
function semente(id) {
  const m = new RegExp('\\sid="' + id + '"[^>]*>([^<]*)<').exec(HTML);
  return m ? m[1] : '';
}
function no(id) {
  return {
    id, textContent: id ? semente(id) : '', className: (id && new RegExp('<[a-z]+ [^>]*class="([^"]*)"[^>]*\\sid="' + id + '"|<[a-z]+ [^>]*\\sid="' + id + '"[^>]*class="([^"]*)"').exec(HTML)?.slice(1).find(Boolean)) || '',
    children: [], dataset: {}, hidden: false, disabled: false, value: '', attrs: {},
    append(...x) { this.children.push(...x); }, replaceChildren(...x) { this.children = x; },
    addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; },
  };
}
const pontoInicial = (() => { const m = /<i class="([^"]*)" id="pulseDot"/.exec(HTML); return m ? m[1] : 'status-dot'; })();

async function correrCasaDoNavegador(scriptPath, cenario) {
  const nos = {};
  const doc = {
    hidden: false, body: { classList: { toggle() {} } },
    getElementById(id) {
      if (nos[id]) return nos[id];
      const n = nos[id] = Object.assign(no(id), id === 'pulseDot' ? { className: pontoInicial } : {});
      // a lista de rastos já traz um <li> no HTML; quando a leitura falha, o script deixa-o como está
      if (id === 'events') { const m = /<ol id="events"><li>([^<]*)<\/li>/.exec(HTML); if (m) n.children = [Object.assign(no(''), { textContent: m[1] })]; }
      return n;
    },
    createElement() { return no(''); }, addEventListener() {},
  };
  class DataFixa extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const rotas = { '/pulso': cenario.pulso, '/economia/tesouraria.json': cenario.tesouraria, '/licenca': cenario.catalogo };
  const ctx = {
    document: doc, location: { search: '' }, localStorage: { getItem() { return null; }, setItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: async (rota) => { const v = rotas[rota]; if (v instanceof Error || v === undefined) return { ok: false, status: 500 }; return { ok: true, json: async () => structuredClone(v) }; },
    AbortController, URLSearchParams, setTimeout, clearTimeout, Date: DataFixa, Promise, JSON, Number, Array, Set, String, Math, Error, Object, console,
    addEventListener() {},
    ORUMLiveRefresh: { start({ read, render, status }) { const p = (async () => { const r = await read(); render(r); status({ state: 'current' }); })(); return { refresh: () => p }; } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(scriptPath, 'utf8'), ctx, { filename: 'verdelaranja.js' });
  await new Promise((r) => setTimeout(r, 30));
  return doc;
}

const lista = (ol) => ol.children.map((li) => (li.children.length ? li.children.map((c) => c.textContent).join('|') : li.textContent));
const cartoes = (cx) => cx.children.map((c) => (c.className === 'license'
  ? { rotulo: c.children[0].textContent, preco: c.children[1].textContent, descricao: c.children[2].textContent, duracao: c.children[3].textContent, pedido: c.children[4].href ?? null, aviso: c.children[4].href ? null : c.children[4].textContent }
  : { mensagem: c.textContent }));

// Compara, para um cenário, o que o navegador mostra com o que o algoritmo diz. Devolve a lista de diferenças.
export async function comparar(C, scriptPath, nome) {
  const cen = CENARIOS[nome];
  const doc = await correrCasaDoNavegador(scriptPath, cen);
  const s = C.casa({ pulso: cen.pulso instanceof Error ? null : cen.pulso, tesouraria: cen.tesouraria instanceof Error ? null : cen.tesouraria, catalogo: cen.catalogo instanceof Error ? null : cen.catalogo, agora: NOW });
  const d = [];
  for (const [id, texto] of Object.entries(s.visivel)) {
    const real = doc.getElementById(id).textContent;
    if (real !== texto) d.push(`${id}: navegador "${real}" ≠ algoritmo "${texto}"`);
  }
  const ponto = doc.getElementById('pulseDot').className;
  if (ponto !== s.ponto) d.push(`ponto: "${ponto}" ≠ "${s.ponto}"`);
  const ev = lista(doc.getElementById('events'));
  const evA = s.eventos.length ? s.eventos.map((e) => e.hora + '|' + e.texto) : [s.sem_eventos];
  if (JSON.stringify(ev) !== JSON.stringify(evA)) d.push(`eventos: ${JSON.stringify(ev)} ≠ ${JSON.stringify(evA)}`);
  const cx = cartoes(doc.getElementById('licenses'));
  const cxA = s.licencas.length ? s.licencas.map((l) => ({ rotulo: l.rotulo, preco: l.preco, descricao: l.descricao, duracao: l.duracao, pedido: l.pedido, aviso: l.aviso })) : [{ mensagem: s.mensagem_licencas }];
  if (JSON.stringify(cx) !== JSON.stringify(cxA)) d.push(`licenças: ${JSON.stringify(cx)} ≠ ${JSON.stringify(cxA)}`);
  if (s.fontes.catalogo === 'actual') {
    const op = doc.getElementById('workSelect').children.map((o) => o.value + '|' + o.textContent);
    const opA = s.obras.map((o) => o.id + '|' + o.rotulo);
    if (JSON.stringify(op) !== JSON.stringify(opA)) d.push(`obras: ${JSON.stringify(op)} ≠ ${JSON.stringify(opA)}`);
    if (doc.getElementById('workSelect').value !== String(s.obra)) d.push('obra escolhida diferente');
  }
  return d;
}

async function suite(ficheiroCasa, ficheiroScript) {
  const C = await import(pathToFileURL(ficheiroCasa).href + '?v=' + Math.random());
  // 1) equivalência: o navegador e o algoritmo dizem o mesmo
  for (const nome of Object.keys(CENARIOS)) {
    const dif = await comparar(C, ficheiroScript, nome);
    assert.deepEqual(dif, [], `cenário "${nome}": ${dif.join(' || ')}`);
  }
  // 2) pureza e determinismo: sem rede, sem alterar a entrada, mesma entrada dá a mesma impressão
  const entrada = structuredClone({ pulso: CENARIOS['tudo vivo'].pulso, tesouraria: CENARIOS['tudo vivo'].tesouraria, catalogo, agora: NOW });
  const antes = JSON.stringify(entrada);
  const fetchReal = globalThis.fetch; globalThis.fetch = () => { throw new Error('a função pura tocou na rede'); };
  let a, b;
  try { a = C.casa(entrada); b = C.casa(structuredClone(entrada)); } finally { globalThis.fetch = fetchReal; }
  assert.equal(JSON.stringify(entrada), antes, 'a função alterou a entrada');
  assert.equal(a.impressao, b.impressao); assert.match(a.impressao, /^[0-9a-f]{64}$/);
  assert.notEqual(C.casa({ ...entrada, agora: NOW + 60 * 60 * 1000 }).impressao, a.impressao, 'a impressão tem de mudar com a hora lida');
  assert.equal(C.casa({ ...entrada, agora: new Date(NOW) }).impressao, a.impressao, 'Date e número equivalem');
  assert.equal(C.casa(entrada).formato, 'orum-casa/v1');
  assert.throws(() => C.casa({ ...entrada, agora: 'ontem' }), /agora inválido/);
  assert.throws(() => C.casa({ ...entrada, agora: NaN }), /agora inválido/);
  // 3) a impressão é canónica (a ordem das chaves não conta) e liga ao conteúdo
  assert.equal(C.impressao({ a: 1, b: { c: 2, d: 3 } }), C.impressao({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(C.impressao({ a: 1 }), C.impressao({ a: 2 }));
  // 4) a obra do dia: determinista, só com bloco e catálogo, nunca fora das obras
  const hash = '0'.repeat(16) + 'ab'.repeat(24);
  assert.equal(C.obraDoDia(hash, [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }, { id: 50 }]), VECTOR_OBRA_DO_DIA, 'vector fixo da obra do dia');
  assert.equal(C.obraDoDia('abc', [{ id: 1 }]), null); assert.equal(C.obraDoDia(hash, []), null);
  const comBloco = C.casa({ ...entrada, bloco: { dia: 15, altura: 974250, hash, linha: 'fio · custódia · sedimentar' } });
  assert.ok(comBloco.obras.some((o) => o.id === comBloco.obra_do_dia), 'a obra do dia é uma obra do catálogo');
  assert.equal(a.obra_do_dia, null); assert.equal(a.bloco, null);
  assert.equal(C.casa({ ...entrada, catalogo: null, bloco: { dia: 15, altura: 974250, hash, linha: 'x' } }).obra_do_dia, null, 'sem catálogo não há obra do dia');
  // 5) verdade: as fronteiras estão, nada promete, e a falha nunca vira zero
  const texto = JSON.stringify(a);
  assert.ok(a.fronteiras.includes('Não prova procura nem receita.'));
  assert.ok(a.fronteiras.some((f) => /não são pessoas únicas nem compradores/.test(f)));
  assert.ok(a.fronteiras.some((f) => /não efectua uma compra/.test(f)));
  assert.ok(!/receita garantida|reembolso garantido|rendimento garantido|compra garantida/i.test(texto));
  const nada = C.casa({ pulso: null, tesouraria: null, catalogo: null, agora: NOW });
  assert.equal(nada.visivel.revenue, '—'); assert.equal(nada.visivel.accessCount, '—');
  assert.deepEqual(nada.fontes, { pulso: 'indisponivel', tesouraria: 'indisponivel', catalogo: 'indisponivel' });
  assert.equal(nada.licencas.length, 0); assert.equal(nada.obra, null);
  assert.match(nada.visivel.treasuryStatus, /não significa zero/);
  return true;
}

// calculado uma vez com a implementação correcta; fixa o contrato da escolha
const VECTOR_OBRA_DO_DIA = 20; // conferido à parte em Python: sha256("casa:"+hash), 4 primeiros bytes, módulo 5 → índice 1 → id 20

const mutar = (origem, de, para, nome) => ({ nome, origem, de, para });
const ESTRAGOS_CASA = [
  mutar('casa', "'Sem veredicto'", "'Sem x'", 'o veredicto em falta deixa de dizer "Sem veredicto"'),
  mutar('casa', 'maximumFractionDigits: 6', 'maximumFractionDigits: 2', 'o valor perde casas decimais'),
  mutar('casa', 'const MIN30 = 30 * 60 * 1000;', 'const MIN30 = 60 * 60 * 1000;', 'a vigilância só envelhece após 60 min'),
  mutar('casa', 'const DIA24 = 24 * 60 * 60 * 1000;', 'const DIA24 = 48 * 60 * 60 * 1000;', 'a contabilidade só envelhece após 48 h'),
  mutar('casa', '.slice(0, limite)', '.slice(0, 4)', 'mostra quatro rastos em vez de três'),
  mutar('casa', "if (vistos.has(k)) return false; ", '', 'deixa de tirar os rastos repetidos'),
  mutar('casa', ' || !numero(dado.evidence.external_confirmed_usdc)', '', 'aceita receita que não é um número'),
  mutar('casa', "const TIPOS = ['consulta', 'editorial', 'treino'];", "const TIPOS = ['consulta', 'editorial'];", 'perde a licença de treino'),
  mutar('casa', " && /^[a-f0-9]{64}$/i.test(escolhida.sha256)", '', 'aceita um hash que não é sha256'),
  mutar('casa', 'o.id === 2) || obras[0]', 'o.id === 3) || obras[0]', 'a obra por omissão deixa de ser a 2'),
  mutar('casa', 'Number.isInteger(o.id) && o.id > 0', 'o.id > 0', 'aceita obras com id fraccionado'),
  mutar('casa', 'não prova actividade posterior', 'prova actividade posterior', 'a cópia de recurso passa a provar actividade'),
  mutar('casa', "'Pulso sem confirmação atual'", "'Pulso confirmado'", 'a falha do pulso diz que está confirmado'),
  mutar('casa', "(velho ? 'stale' : 'observed')", "(velho ? 'observed' : 'stale')", 'o ponto do pulso troca de estado'),
  mutar('casa', "timeZone: 'Europe/Lisbon'", "timeZone: 'UTC'", 'as horas deixam de ser de Lisboa'),
  mutar('casa', "update('casa:' + hashBloco", "update('x:' + hashBloco", 'a obra do dia muda de regra'),
  mutar('casa', 'Object.keys(v).sort()', 'Object.keys(v)', 'a impressão deixa de ser canónica'),
  mutar('casa', "if (!Number.isFinite(t)) throw new Error('agora inválido');", '', 'aceita uma hora inválida'),
  mutar('casa', "'Não prova procura nem receita.',", '', 'perde a fronteira da procura'),
  mutar('casa', "'Abrir um pedido x402 não efectua uma compra.',", '', 'perde a fronteira da compra'),
  mutar('casa', "'Pedido indisponível: falta o hash da obra.'", "'Pedido disponível.'", 'a falta de hash passa a parecer pedido'),
  mutar('casa', "consulta: 'Para observar'", "consulta: 'Para comprar'", 'o rótulo da licença muda'),
  mutar('casa', "revenue: '—', treasuryStatus", "revenue: '0', treasuryStatus", 'a falha da contabilidade vira zero'),
  mutar('casa', "accessCount: '—', sentinelState: 'Sem vigilância viva'", "accessCount: '0', sentinelState: 'Sem vigilância viva'", 'a cópia de recurso mostra zero acessos'),
  mutar('script', "'Sem veredicto'", "'Sem x'", 'o script do navegador muda (a comparação tem de o ver)'),
  mutar('script', "slice(0, 3)", "slice(0, 2)", 'o script do navegador mostra dois rastos'),
];

async function main() {
  const real = await suite(CASA, SCRIPT);
  assert.ok(real);
  const dir = mkdtempSync(join(tmpdir(), 'casa-algoritmo-'));
  let n = 0;
  try {
    for (const e of ESTRAGOS_CASA) {
      const fCasa = join(dir, 'casa.mjs'); const fScript = join(dir, 'verdelaranja.js');
      cpSync(CASA, fCasa); cpSync(SCRIPT, fScript);
      const alvo = e.origem === 'casa' ? fCasa : fScript;
      const t = readFileSync(alvo, 'utf8');
      assert.ok(t.includes(e.de), `o estrago "${e.nome}" não encontra o trecho: ${e.de}`);
      writeFileSync(alvo, t.replace(e.de, e.para));
      let apanhado = false;
      try { await suite(fCasa, fScript); } catch (_) { apanhado = true; }
      assert.ok(apanhado, `estrago NÃO apanhado: ${e.nome}`);
      n++;
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(`casa-algoritmo: PASS · ${Object.keys(CENARIOS).length} cenários iguais ao navegador, id a id · ${n} estragos propositados apanhados`);
}
if (process.argv[1] && process.argv[1].endsWith('verify-casa-algoritmo.mjs')) await main();

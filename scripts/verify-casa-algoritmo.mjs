// Verifica a casa como algoritmo, de duas maneiras, sem rede:
//  1) casa-nucleo.js / kit/casa.mjs dizem o mesmo texto que a casa anterior (o verdelaranja.js de 13/11, guardado em
//     scripts/fixtures/verdelaranja-anterior.js), id a id, em 14 leituras;
//  2) a casca fina (verdelaranja.js + casa-nucleo.js) deixa a PÁGINA INTEIRA igual à da casa anterior, nó a nó, em leituras
//     seguidas e com as interacções (actualizar, escolher obra, seguinte, sem ligação, sair da página, última visita).
// Depois estraga o núcleo, o kit, a casca e a referência de propósito (cópias em /tmp) e exige que a comparação falhe em cada estrago.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const REAL = {
  casa: join(RAIZ, 'kit', 'casa.mjs'), nucleo: join(RAIZ, 'casa-nucleo.js'), casca: join(RAIZ, 'verdelaranja.js'),
  anterior: join(AQUI, 'fixtures', 'verdelaranja-anterior.js'), visita: join(RAIZ, 'desde-visita-v1.js'),
};
const HTML = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const NOW = Date.parse('2026-11-17T12:00:00Z');
const iso = (msAtras) => new Date(NOW - msAtras).toISOString();
const MIN = 60 * 1000; const H = 60 * MIN;
const SHA = 'a'.repeat(64);
const CHAVE_VISITA = 'orum.casa.ultima-visita';

// ---- o que o organismo publica ----
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
const catalogo2 = { obras: [obras[0], obras[1], { id: 5, titulo: 'Quinta', sha256: 'd'.repeat(64) }], licencas: [licencas[0]] };
const eventos5 = [
  { tipo: 'visita', quando: iso(10 * MIN), detalhe: 'Uma máquina chegou' },
  { tipo: 'visita', quando: iso(10 * MIN), detalhe: 'Uma máquina chegou' },
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
const copia = (eventos = eventos5) => ({ estado: 'snapshot_desactualizado', campo: { dia: 230 }, snapshot_observado_em: iso(26 * H), eventos });
const tesouro = (idade = 2 * H, usdc = 12.345678, disponivel = true) => ({ evidence: { external_confirmed_usdc: usdc, source: { available: disponivel, observed_at: iso(idade) } } });
const falha = new Error('HTTP 500');

// 14 leituras isoladas (uma ronda, sem interacções)
export const CENARIOS = {
  'tudo vivo': { pulso: pulsoVivo(), tesouraria: tesouro(), catalogo },
  'vigilância com 45 min': { pulso: pulsoVivo(45 * MIN), tesouraria: tesouro(), catalogo },
  'vigilância antiga, tesouraria com 30 h': { pulso: pulsoVivo(3 * H, { eventos: [] }), tesouraria: tesouro(30 * H, 0), catalogo },
  'cópia de recurso com repetidos': { pulso: copia(), tesouraria: tesouro(), catalogo },
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
const boa = { pulso: pulsoVivo(), tesouraria: tesouro() };
const ronda = (p, t) => ({ pulso: p, tesouraria: t });
// Leituras seguidas e interacções (cada passo corre depois da carga)
export const SEQUENCIAS = {
  'boa e depois tudo falha': { rondas: [boa, ronda(falha, falha)], catalogos: [catalogo, catalogo], passos: [{ t: 'actualizar' }] },
  'boa, outra boa com números novos': { rondas: [boa, ronda(pulsoVivo(MIN, { campo: { dia: 232 }, convite: { maquinas_reconhecidas_total: 26000 }, eventos: [] }), tesouro(H, 1.5))], catalogos: [catalogo, catalogo], passos: [{ t: 'actualizar' }] },
  'viva, cópia, falha, viva': { rondas: [boa, ronda(copia(), tesouro()), ronda(falha, tesouro()), ronda(pulsoVivo(), tesouro())], catalogos: [catalogo], passos: [{ t: 'actualizar' }, { t: 'actualizar' }, { t: 'actualizar' }] },
  'cópia primeiro, depois falha': { rondas: [ronda(copia(), tesouro()), ronda(falha, falha)], catalogos: [catalogo], passos: [{ t: 'actualizar' }] },
  'vigilância antiga e depois actual': { rondas: [ronda(pulsoVivo(3 * H), tesouro(30 * H)), boa], catalogos: [catalogo], passos: [{ t: 'actualizar' }] },
  'catálogo falha, escolhe, segue, volta': { rondas: [boa, boa, boa], catalogos: [catalogo, falha, catalogo], passos: [{ t: 'actualizar' }, { t: 'escolher', id: 3 }, { t: 'seguinte' }, { t: 'actualizar' }] },
  'catálogo falha logo no início e depois responde': { rondas: [boa, boa], catalogos: [falha, catalogo], passos: [{ t: 'actualizar' }, { t: 'seguinte' }] },
  'escolher e seguir até dar a volta': { rondas: [boa], catalogos: [catalogo], passos: [{ t: 'escolher', id: 1 }, { t: 'seguinte' }, { t: 'seguinte' }, { t: 'seguinte' }, { t: 'escolher', id: 99 }] },
  'o catálogo muda entre leituras': { rondas: [boa, boa], catalogos: [catalogo, catalogo2], passos: [{ t: 'escolher', id: 1 }, { t: 'actualizar' }, { t: 'seguinte' }, { t: 'seguinte' }, { t: 'seguinte' }] },
  'obra pedida pela ligação': { rondas: [boa], catalogos: [catalogo], search: '?obra=3', passos: [] },
  'obra pedida que não existe': { rondas: [boa], catalogos: [catalogo], search: '?obra=99', passos: [] },
  'sem ligação depois de ler': { rondas: [boa], catalogos: [catalogo], passos: [{ t: 'estado', state: 'offline' }, { t: 'estado', state: 'paused' }, { t: 'estado', state: 'current' }] },
  'sem ligação sem nunca ter lido': { rondas: [ronda(falha, falha)], catalogos: [falha], passos: [{ t: 'estado', state: 'offline' }, { t: 'estado', state: 'stale' }] },
  'última visita com rastos novos': { rondas: [boa], catalogos: [catalogo], visita: iso(30 * MIN), passos: [{ t: 'sair' }] },
  'última visita sem rastos novos': { rondas: [ronda(pulsoVivo(5 * MIN, { eventos: [] }), tesouro())], catalogos: [catalogo], visita: iso(30 * MIN), passos: [{ t: 'sair' }] },
  'última visita e cópia de recurso': { rondas: [ronda(copia(), tesouro())], catalogos: [catalogo], visita: iso(30 * MIN), passos: [{ t: 'sair' }] },
  'primeira visita': { rondas: [boa], catalogos: [catalogo], passos: [{ t: 'sair' }] },
  'sair sem ter lido o pulso': { rondas: [ronda(falha, tesouro())], catalogos: [catalogo], visita: iso(30 * MIN), passos: [{ t: 'sair' }] },
  'um rasto único novo': { rondas: [ronda(pulsoVivo(5 * MIN, { eventos: [eventos5[0]] }), tesouro())], catalogos: [catalogo], visita: iso(3 * H), passos: [] },
};

// ---- o DOM de teste: o mínimo que os scripts da casa pedem ----
const etiqueta = (id) => new RegExp('<[a-z0-9]+(?:\\s[^>]*)?\\sid="' + id + '"[^>]*>', 'i').exec(HTML);
const ID_NO_HTML = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
function semente(id) { const m = new RegExp('\\sid="' + id + '"[^>]*>([^<]*)<').exec(HTML); return m ? m[1] : ''; }
function no(id, tag) {
  const e = id ? etiqueta(id) : null;
  return {
    id, tag: tag || (e ? /^<([a-z0-9]+)/i.exec(e[0])[1] : ''), textContent: id ? semente(id) : '',
    className: (e && /class="([^"]*)"/.exec(e[0])?.[1]) || '', children: [], dataset: {}, hidden: !!(e && /\shidden[\s>]/.test(e[0])), disabled: !!(e && /\sdisabled[\s>]/.test(e[0])),
    value: '', attrs: {}, listeners: {},
    append(...x) { this.children.push(...x); }, replaceChildren(...x) { this.children = x; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, setAttribute(k, v) { this.attrs[k] = String(v); },
  };
}
const pagina = (n) => ({
  id: n.id, tag: n.tag, texto: n.textContent, classe: n.className, estado: { ...n.dataset }, escondido: n.hidden, desactivado: n.disabled, valor: n.value,
  attrs: { ...n.attrs }, href: n.href ?? null, dataHora: n.dateTime ?? null, filhos: n.children.map(pagina),
});

async function correrNavegador(ficheiros, cen) {
  const nos = {};
  for (const id of ID_NO_HTML) nos[id] = no(id);
  // a lista de rastos já traz um <li> no HTML; quando a leitura falha, a casa deixa-o como está
  { const m = /<ol id="events"><li>([^<]*)<\/li>/.exec(HTML); if (m) nos.events.children = [Object.assign(no('', 'li'), { textContent: m[1] })]; }
  const doc = {
    hidden: false, body: { classList: { toggle() {} } },
    getElementById: (id) => nos[id] || (nos[id] = no(id)), createElement: (tag) => no('', tag), addEventListener() {},
  };
  class DataFixa extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  const rondas = cen.rondas || [{ pulso: cen.pulso, tesouraria: cen.tesouraria }];
  const catalogos = cen.catalogos || [cen.catalogo];
  let r = 0; let c = 0;
  const armazem = { m: cen.visita ? { [CHAVE_VISITA]: cen.visita } : {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
  const escutas = {};
  const ctx = {
    document: doc, location: { search: cen.search || '' }, localStorage: armazem,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: async (rota) => {
      const v = rota === '/pulso' ? rondas[r].pulso : rota === '/economia/tesouraria.json' ? rondas[r].tesouraria : rota === '/licenca' ? catalogos[Math.min(c++, catalogos.length - 1)] : undefined;
      if (v instanceof Error || v === undefined) return { ok: false, status: 500 };
      return { ok: true, json: async () => structuredClone(v) };
    },
    AbortController, URLSearchParams, setTimeout, clearTimeout, Date: DataFixa, Promise, JSON, Number, Array, Set, String, Math, Error, Object, console,
    addEventListener(t, f) { (escutas[t] ||= []).push(f); },
    ORUMLiveRefresh: {
      start({ read, render, status }) {
        ctx.__status = status;
        let i = 0;
        const correr = async () => { r = Math.min(i++, rondas.length - 1); const x = await read(); render(x); status({ state: 'current' }); };
        const p = correr();
        return { refresh: () => (i === 0 ? p : correr()) };
      },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ficheiros) vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
  const espera = () => new Promise((ok) => setTimeout(ok, 25));
  await espera();
  const foto = (passo) => ({ passo, pagina: ID_NO_HTML.map((id) => pagina(nos[id])), armazem: { ...armazem.m } });
  const fotos = [foto('carga')];
  for (const p of cen.passos || []) {
    if (p.t === 'actualizar') await nos.refresh.listeners.click[0]();
    else if (p.t === 'escolher') { nos.workSelect.value = String(p.id); nos.workSelect.listeners.change[0]({ target: { value: String(p.id) } }); }
    else if (p.t === 'seguinte') nos.nextWork.listeners.click[0]();
    else if (p.t === 'estado') ctx.__status({ state: p.state });
    else if (p.t === 'sair') for (const f of escutas.pagehide || []) f();
    await espera();
    fotos.push(foto(JSON.stringify(p)));
  }
  return { fotos, nos };
}

// Diferenças entre duas sequências de fotos da página inteira (frases curtas, não o objecto todo).
function diferencas(a, b, quem) {
  const d = [];
  const rec = (x, y, caminho) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) rec(x[k], y[k], caminho + '.' + k); return; }
    d.push(`${caminho}: ${quem[0]} ${JSON.stringify(x)} ≠ ${quem[1]} ${JSON.stringify(y)}`);
  };
  a.forEach((fa, i) => rec(fa, b[i], '[' + fa.passo + ']'));
  return d.slice(0, 6);
}

const lista = (ol) => ol.children.map((li) => (li.children.length ? li.children.map((c) => c.textContent).join('|') : li.textContent));
const cartoes = (cx) => cx.children.map((c) => (c.className === 'license'
  ? { rotulo: c.children[0].textContent, preco: c.children[1].textContent, descricao: c.children[2].textContent, duracao: c.children[3].textContent, pedido: c.children[4].href ?? null, aviso: c.children[4].href ? null : c.children[4].textContent }
  : { mensagem: c.textContent }));

// 1) o núcleo e o kit dizem o mesmo que a casa anterior, id a id (uma leitura)
async function compararComAnterior(C, F, nome) {
  const cen = CENARIOS[nome];
  const { nos } = await correrNavegador([F.visita, F.anterior], cen);
  const s = C.casa({ pulso: cen.pulso instanceof Error ? null : cen.pulso, tesouraria: cen.tesouraria instanceof Error ? null : cen.tesouraria, catalogo: cen.catalogo instanceof Error ? null : cen.catalogo, agora: NOW });
  const d = [];
  for (const [id, texto] of Object.entries(s.visivel)) if (nos[id].textContent !== texto) d.push(`${id}: casa anterior "${nos[id].textContent}" ≠ algoritmo "${texto}"`);
  if (nos.pulseDot.className !== s.ponto) d.push(`ponto: "${nos.pulseDot.className}" ≠ "${s.ponto}"`);
  const ev = lista(nos.events);
  const evA = s.eventos.length ? s.eventos.map((e) => e.hora + '|' + e.texto) : [s.sem_eventos];
  if (JSON.stringify(ev) !== JSON.stringify(evA)) d.push(`eventos: ${JSON.stringify(ev)} ≠ ${JSON.stringify(evA)}`);
  const cx = cartoes(nos.licenses);
  const cxA = s.licencas.length ? s.licencas.map((l) => ({ rotulo: l.rotulo, preco: l.preco, descricao: l.descricao, duracao: l.duracao, pedido: l.pedido, aviso: l.aviso })) : [{ mensagem: s.mensagem_licencas }];
  if (JSON.stringify(cx) !== JSON.stringify(cxA)) d.push(`licenças: ${JSON.stringify(cx)} ≠ ${JSON.stringify(cxA)}`);
  if (s.fontes.catalogo === 'actual') {
    const op = nos.workSelect.children.map((o) => o.value + '|' + o.textContent);
    const opA = s.obras.map((o) => o.id + '|' + o.rotulo);
    if (JSON.stringify(op) !== JSON.stringify(opA)) d.push(`obras: ${JSON.stringify(op)} ≠ ${JSON.stringify(opA)}`);
    if (nos.workSelect.value !== String(s.obra)) d.push('obra escolhida diferente');
  }
  return d;
}

// 2) a casca deixa a página inteira igual à da casa anterior
async function compararCasca(F, cen) {
  const anterior = await correrNavegador([F.visita, F.anterior], cen);
  const casca = await correrNavegador([F.visita, F.nucleo, F.casca], cen);
  return diferencas(anterior.fotos, casca.fotos, ['anterior', 'casca']);
}

async function suite(F) {
  const C = await import(pathToFileURL(F.casa).href + '?v=' + Math.random());
  for (const nome of Object.keys(CENARIOS)) {
    const dif = await compararComAnterior(C, F, nome);
    assert.deepEqual(dif, [], `núcleo ≠ casa anterior, "${nome}": ${dif.join(' || ')}`);
  }
  for (const [nome, cen] of Object.entries({ ...CENARIOS, ...SEQUENCIAS })) {
    const dif = await compararCasca(F, cen);
    assert.deepEqual(dif, [], `casca ≠ casa anterior, "${nome}": ${dif.join(' || ')}`);
  }
  // pureza e determinismo: sem rede, sem alterar a entrada, mesma entrada dá a mesma impressão
  const entrada = structuredClone({ pulso: CENARIOS['tudo vivo'].pulso, tesouraria: CENARIOS['tudo vivo'].tesouraria, catalogo, agora: NOW });
  const antes = JSON.stringify(entrada);
  const fetchReal = globalThis.fetch; globalThis.fetch = () => { throw new Error('a função pura tocou na rede'); };
  let a, b;
  try { a = C.casa(entrada); b = C.casa(structuredClone(entrada)); } finally { globalThis.fetch = fetchReal; }
  assert.equal(JSON.stringify(entrada), antes, 'a função alterou a entrada');
  assert.equal(a.impressao, b.impressao); assert.match(a.impressao, /^[0-9a-f]{64}$/);
  assert.notEqual(C.casa({ ...entrada, agora: NOW + 60 * 60 * 1000 }).impressao, a.impressao, 'a impressão tem de mudar com a hora lida');
  assert.equal(C.casa({ ...entrada, agora: new Date(NOW) }).impressao, a.impressao, 'Date e número equivalem');
  assert.equal(a.formato, 'orum-casa/v1');
  assert.throws(() => C.casa({ ...entrada, agora: 'ontem' }), /agora inválido/);
  assert.throws(() => C.casa({ ...entrada, agora: NaN }), /agora inválido/);
  assert.equal(C.impressao({ a: 1, b: { c: 2, d: 3 } }), C.impressao({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(C.impressao({ a: 1 }), C.impressao({ a: 2 }));
  // a obra do dia: determinista, só com bloco e catálogo, nunca fora das obras
  const hash = '0'.repeat(16) + 'ab'.repeat(24);
  assert.equal(C.obraDoDia(hash, [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }, { id: 50 }]), VECTOR_OBRA_DO_DIA, 'vector fixo da obra do dia');
  assert.equal(C.obraDoDia('abc', [{ id: 1 }]), null); assert.equal(C.obraDoDia(hash, []), null);
  const comBloco = C.casa({ ...entrada, bloco: { dia: 15, altura: 974250, hash, linha: 'fio · custódia · sedimentar' } });
  assert.ok(comBloco.obras.some((o) => o.id === comBloco.obra_do_dia), 'a obra do dia é uma obra do catálogo');
  assert.equal(a.obra_do_dia, null); assert.equal(a.bloco, null);
  assert.equal(C.casa({ ...entrada, catalogo: null, bloco: { dia: 15, altura: 974250, hash, linha: 'x' } }).obra_do_dia, null, 'sem catálogo não há obra do dia');
  // verdade: as fronteiras estão, nada promete, e a falha nunca vira zero
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
  // o núcleo escreve exactamente os ids que declara, e o HTML tem-nos todos
  const N = createRequire(F.nucleo)(F.nucleo);
  for (const id of N.IDS) assert.ok(ID_NO_HTML.includes(id), `o núcleo escreve um id que o HTML não tem: ${id}`);
  assert.deepEqual(Object.keys(C.casa(entrada).visivel).sort(), [...N.IDS].sort(), 'o núcleo diz mais ou menos ids do que declara');
  return true;
}

// calculado uma vez e conferido à parte em Python: sha256("casa:"+hash), 4 primeiros bytes, módulo 5 → índice 1 → id 20
const VECTOR_OBRA_DO_DIA = 20;

const mutar = (origem, de, para, nome) => ({ nome, origem, de, para });
const ESTRAGOS = [
  // o núcleo
  mutar('nucleo', "'Sem veredicto'", "'Sem x'", 'o veredicto em falta deixa de dizer "Sem veredicto"'),
  mutar('nucleo', 'maximumFractionDigits: 6', 'maximumFractionDigits: 2', 'o valor perde casas decimais'),
  mutar('nucleo', 'const MIN30 = 30 * 60 * 1000;', 'const MIN30 = 60 * 60 * 1000;', 'a vigilância só envelhece após 60 min'),
  mutar('nucleo', 'const DIA24 = 24 * 60 * 60 * 1000;', 'const DIA24 = 48 * 60 * 60 * 1000;', 'a contabilidade só envelhece após 48 h'),
  mutar('nucleo', 'limite === undefined ? 3 : limite', 'limite === undefined ? 4 : limite', 'mostra quatro rastos em vez de três'),
  mutar('nucleo', 'if (vistos.has(k)) return false; ', '', 'deixa de tirar os rastos repetidos'),
  mutar('nucleo', ' || !numero(dado.evidence.external_confirmed_usdc)', '', 'aceita receita que não é um número'),
  mutar('nucleo', "const TIPOS = ['consulta', 'editorial', 'treino'];", "const TIPOS = ['consulta', 'editorial'];", 'perde a licença de treino'),
  mutar('nucleo', ' && /^[a-f0-9]{64}$/i.test(e.sha256)', '', 'aceita um hash que não é sha256'),
  mutar('nucleo', 'x.id === 2) || obras[0]', 'x.id === 3) || obras[0]', 'a obra por omissão deixa de ser a 2'),
  mutar('nucleo', 'Number.isInteger(x.id) && x.id > 0', 'x.id > 0', 'aceita obras com id fraccionado'),
  mutar('nucleo', 'não prova actividade posterior', 'prova actividade posterior', 'a cópia de recurso passa a provar actividade'),
  mutar('nucleo', "pulseSummary: 'Pulso sem confirmação atual'", "pulseSummary: 'Pulso confirmado'", 'a falha do pulso diz que está confirmado'),
  mutar('nucleo', "(velho ? 'stale' : 'observed')", "(velho ? 'observed' : 'stale')", 'o ponto do pulso troca de estado'),
  mutar('nucleo', "timeZone: 'Europe/Lisbon'", "timeZone: 'UTC'", 'as horas deixam de ser de Lisboa'),
  mutar('nucleo', "'Não prova procura nem receita.',", '', 'perde a fronteira da procura'),
  mutar('nucleo', "'Abrir um pedido x402 não efectua uma compra.',", '', 'perde a fronteira da compra'),
  mutar('nucleo', "'Pedido indisponível: falta o hash da obra.'", "'Pedido disponível.'", 'a falta de hash passa a parecer pedido'),
  mutar('nucleo', "consulta: 'Para observar'", "consulta: 'Para comprar'", 'o rótulo da licença muda'),
  mutar('nucleo', "revenue: '—',\n        treasuryStatus", "revenue: '0',\n        treasuryStatus", 'a falha da contabilidade vira zero'),
  mutar('nucleo', "accessCount: '—', sentinelState: 'Sem vigilância viva'", "accessCount: '0', sentinelState: 'Sem vigilância viva'", 'a cópia de recurso mostra zero acessos'),
  mutar('nucleo', "escrever: ['pulseSummary', 'pulseStatus'], ponto", "escrever: ['pulseSummary', 'pulseStatus', 'accessCount', 'fieldDay'], ponto", 'a falha do pulso apaga os valores anteriores'),
  mutar('nucleo', "(memoria ? ' Valores anteriores sem confirmação atual.' : ' Ainda sem leitura; “—” não significa zero.'),\n        fieldDay", "' Valores anteriores sem confirmação atual.',\n        fieldDay", 'a falha sem leitura anterior diz "valores anteriores"'),
  mutar('nucleo', 'eventosEscrever: false', 'eventosEscrever: true', 'a falha do pulso apaga os rastos'),
  mutar('nucleo', 'O vestígio anterior permanece; preços por reconfirmar na fonte.', 'Tudo certo.', 'a falha do catálogo diz que está tudo certo'),
  mutar('nucleo', 'x.id === o.obra) ||', 'x.id === 1) ||', 'a obra pedida deixa de contar'),
  // o kit
  mutar('casa', "update('casa:' + hashBloco", "update('x:' + hashBloco", 'a obra do dia muda de regra'),
  mutar('casa', 'Object.keys(v).sort()', 'Object.keys(v)', 'a impressão deixa de ser canónica'),
  mutar('casa', "if (!Number.isFinite(t)) throw new Error('agora inválido');", '', 'aceita uma hora inválida'),
  mutar('casa', 'visivel: { ...p.visivel, ...e.visivel, ...c.obraVisivel, catalogStatus: c.catalogStatus }', 'visivel: { ...p.visivel, ...e.visivel, ...c.obraVisivel }', 'o estado do catálogo some do resultado'),
  // a casca
  mutar('casca', "{ memoria.pulso = true; desdeVisita(data.eventos); }", "{ desdeVisita(data.eventos); }", 'a casca esquece que já leu o pulso'),
  mutar('casca', "if (r.estado !== 'indisponivel') memoria.tesouraria = true;", '', 'a casca esquece que já leu a tesouraria'),
  mutar('casca', "if (r.eventosEscrever) $('events')", "if (true) $('events')", 'a casca escreve os rastos mesmo na falha'),
  mutar('casca', "if (state === 'offline' || state === 'stale') { renderPulse(undefined); renderTreasury(undefined); }", '', 'a casca ignora a falta de ligação'),
  mutar('casca', 'mostrarObra(obras[(i + 1) % obras.length].id);', 'mostrarObra(obras[(i + 1)].id);', 'o "seguinte" não dá a volta'),
  mutar('casca', "$('workSelect').value = String(r.obra);", '', 'o seletor deixa de acompanhar a obra'),
  mutar('casca', "link.setAttribute('aria-label', 'Abrir pedido x402: ' + l.tipo + ', obra ' + r.obra);", '', 'o pedido x402 perde o nome acessível'),
  mutar('casca', "estadoDaFonte('pulseStatus', r.fonteEstado);", '', 'a fonte do pulso deixa de dizer o seu estado'),
  mutar('casca', 'falhou: !catalogoActual', 'falhou: false', 'depois de uma falha as licenças voltam a ser accionáveis'),
  mutar('casca', 'catalogoActual = false;\n      const r', 'const r', 'a casca não regista que o catálogo falhou'),
  mutar('casca', 'memoria.pulso) window.ORUMDesdeVisita.guardar', 'true) window.ORUMDesdeVisita.guardar', 'guarda a visita sem ter lido o pulso'),
  mutar('casca', 'obra: escolhida || pedida', 'obra: pedida', 'a obra escolhida não sobrevive à actualização'),
  // a referência (prova que a comparação a lê)
  mutar('anterior', "'Sem veredicto'", "'Sem x'", 'a casa anterior muda (a comparação tem de o ver)'),
  mutar('anterior', 'slice(0, 3)', 'slice(0, 2)', 'a casa anterior mostra dois rastos'),
];

async function main() {
  assert.ok(await suite(REAL));
  let n = 0;
  for (const e of ESTRAGOS) {
    const dir = mkdtempSync(join(tmpdir(), 'casa-algoritmo-'));
    try {
      mkdirSync(join(dir, 'kit')); mkdirSync(join(dir, 'fixtures'));
      const F = { casa: join(dir, 'kit', 'casa.mjs'), nucleo: join(dir, 'casa-nucleo.js'), casca: join(dir, 'verdelaranja.js'), anterior: join(dir, 'fixtures', 'anterior.js'), visita: REAL.visita };
      cpSync(REAL.casa, F.casa); cpSync(REAL.nucleo, F.nucleo); cpSync(REAL.casca, F.casca); cpSync(REAL.anterior, F.anterior);
      const alvo = F[e.origem];
      const t = readFileSync(alvo, 'utf8');
      assert.ok(t.includes(e.de), `o estrago "${e.nome}" não encontra o trecho: ${e.de}`);
      writeFileSync(alvo, t.replace(e.de, e.para));
      let apanhado = false;
      try { await suite(F); } catch (_) { apanhado = true; }
      assert.ok(apanhado, `estrago NÃO apanhado: ${e.nome}`);
      n++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(`casa-algoritmo: PASS · ${Object.keys(CENARIOS).length} leituras iguais à casa anterior, id a id · ${Object.keys(CENARIOS).length + Object.keys(SEQUENCIAS).length} cenários com a página inteira igual na casca · ${n} estragos propositados apanhados`);
}
if (process.argv[1] && process.argv[1].endsWith('verify-casa-algoritmo.mjs')) await main();

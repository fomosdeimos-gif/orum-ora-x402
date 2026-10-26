// Verifica docs/mapa-de-fontes-e-dependencias.json (livro 1066, 26/10/2026): uma fonte primária por assunto e com dono, todos os
// caminhos existem, todo o fornecedor com URL no código está declarado, cada dependência diz o que acontece se falhar, e o mapa
// não leva segredos, endereços de carteira nem promessas. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const real = JSON.parse(readFileSync(join(RAIZ, 'docs/mapa-de-fontes-e-dependencias.json'), 'utf8'));

const PROMESSA = /para sempre|garantid[oa]|permanente|eterno|receita garantida|reembols|rendimento garantido/i;
const PARECE_SEGREDO = /\b[0-9a-fA-F]{64}\b|-----BEGIN|sk_[A-Za-z0-9]{16,}|seed phrase|frase de recupera|\b0x[0-9a-fA-F]{40}\b|\bbc1[a-z0-9]{20,}\b/i;
const TIPOS_FONTE = ['repositorio', 'base'];
const ESTADOS_SUBSTITUTO = ['existe', 'previsto', 'nenhum_ainda', 'nao_aplicavel'];
// Código que corre ou que opera: o que o mapa promete varrer (e diz em nao_afirma que não varre mais).
const PASTAS = ['api', 'supabase/functions'];
const SCRIPTS_OPERACIONAIS = ['scripts/arquivar-wayback.mjs', 'scripts/vigia-entradas.mjs', 'scripts/sonda-pagamento.mjs', 'scripts/raiz-ots.mjs'];
const TLD = 'com|org|io|net|space|info|app|ai|network|tech|dev';

function ficheirosDeCodigo(raiz) {
  const out = [];
  const andar = (rel) => {
    for (const n of readdirSync(join(raiz, rel))) {
      const r = `${rel}/${n}`;
      if (statSync(join(raiz, r)).isDirectory()) andar(r);
      else if (/\.(js|mjs|ts)$/.test(n)) out.push(r);
    }
  };
  for (const p of PASTAS) if (existsSync(join(raiz, p))) andar(p);
  for (const f of SCRIPTS_OPERACIONAIS) if (existsSync(join(raiz, f))) out.push(f);
  return out;
}

// Anfitriões num texto de código: URLs https e nomes de anfitrião entre aspas (por exemplo HOST = 'api.cdp.coinbase.com').
export function anfitrioesDeTexto(t) {
  const out = new Set();
  for (const m of t.matchAll(/https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) out.add(m[1].toLowerCase());
  for (const m of t.matchAll(new RegExp(`['"\`]([a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLD}))['"\`]`, 'gi'))) out.add(m[1].toLowerCase());
  return out;
}

export function anfitrioesDoCodigo(raiz, ler = (p) => readFileSync(join(raiz, p), 'utf8')) {
  const mapa = new Map();
  for (const f of ficheirosDeCodigo(raiz)) {
    for (const h of anfitrioesDeTexto(ler(f))) {
      if (!mapa.has(h)) mapa.set(h, new Set());
      mapa.get(h).add(f);
    }
  }
  return mapa;
}

export function validar(m, raiz = RAIZ, anfitrioes = anfitrioesDoCodigo(raiz)) {
  const e = [];
  if (m?.format !== 'orum-mapa/v1') e.push('format desconhecido');
  if (!m?.autorizacao_de_unum?.citacao || m.autorizacao_de_unum.citacao.length < 40 || !Number.isInteger(m.autorizacao_de_unum.livro)) e.push('falta a citação de Unum e o livro');
  const texto = JSON.stringify(m);
  const semNegacoes = texto.replace(/"nao_afirma":\[[^\]]*\]/, '').replace(/"regras":\[[^\]]*\]/, '');
  if (PROMESSA.test(semNegacoes)) e.push('promessa no texto');
  if (PARECE_SEGREDO.test(texto)) e.push('algo que parece um segredo, uma chave ou um endereço de carteira');

  const fontes = Array.isArray(m?.fontes) ? m.fontes : [];
  if (fontes.length < 1) e.push('sem fontes');
  const assuntos = new Set();
  const primarias = new Map();
  for (const f of fontes) {
    const id = f?.assunto ?? '?';
    if (!f?.assunto) e.push('fonte sem assunto');
    if (assuntos.has(id)) e.push(`${id}: assunto repetido, uma só fonte primária por assunto`);
    assuntos.add(id);
    if (!f?.dono || String(f.dono).length < 3) e.push(`${id}: fonte sem dono`);
    if (!TIPOS_FONTE.includes(f?.tipo)) e.push(`${id}: tipo de fonte inválido`);
    if (!f?.fonte_primaria) { e.push(`${id}: sem fonte primária`); continue; }
    if (primarias.has(f.fonte_primaria)) e.push(`${f.fonte_primaria}: é fonte primária de dois assuntos (${primarias.get(f.fonte_primaria)} e ${id})`);
    primarias.set(f.fonte_primaria, id);
    if (f.tipo === 'repositorio' && !existsSync(join(raiz, f.fonte_primaria))) e.push(`${id}: a fonte primária ${f.fonte_primaria} não existe`);
    if (!Array.isArray(f.derivadas)) { e.push(`${id}: derivadas tem de ser uma lista`); continue; }
    for (const d of f.derivadas) {
      if (d === f.fonte_primaria) e.push(`${id}: a derivada ${d} é a própria fonte`);
      if (!existsSync(join(raiz, d))) e.push(`${id}: a derivada ${d} não existe`);
    }
    if (f.tipo === 'base' && !/Supabase|implantado/i.test(f.fonte_primaria)) e.push(`${id}: fonte de tipo base tem de dizer onde vive`);
  }
  const lacunas = m?.lacunas ?? [];
  for (const f of fontes) if (f?.tipo === 'base' && f.derivadas?.length === 0 && !lacunas.some((l) => l.startsWith(`${f.assunto}:`))) {
    e.push(`${f.assunto}: fonte só na base e sem derivada no repositório, e sem lacuna a dizê-lo`);
  }
  for (const d of m?.duplicacoes_conhecidas ?? []) {
    if (!assuntos.has(d?.assunto)) e.push(`duplicação de assunto desconhecido: ${d?.assunto}`);
    if (!d?.estado || !/declarada/i.test(d.estado)) e.push(`${d?.assunto}: duplicação sem estado "declarada"`);
    if (!d?.guarda) e.push(`${d?.assunto}: duplicação sem guarda (ou "nenhuma lida")`);
    if (d?.guarda?.startsWith('scripts/') && !existsSync(join(raiz, d.guarda))) e.push(`${d?.assunto}: o verificador ${d.guarda} não existe`);
  }

  const deps = Array.isArray(m?.dependencias) ? m.dependencias : [];
  if (deps.length < 1) e.push('sem dependências');
  const declarados = new Map();
  const ids = new Set();
  for (const d of deps) {
    const id = d?.id ?? '?';
    if (ids.has(id)) e.push(`${id}: dependência repetida`);
    ids.add(id);
    if (!['dependencia', 'referencia'].includes(d?.tipo)) e.push(`${id}: tipo inválido`);
    if (!d?.fornece) e.push(`${id}: não diz o que fornece`);
    if (!d?.se_falhar || String(d.se_falhar).length < 10) e.push(`${id}: não diz o que acontece se falhar`);
    if (!d?.substituto) e.push(`${id}: não diz o substituto (ou que não há)`);
    if (!ESTADOS_SUBSTITUTO.includes(d?.estado_substituto)) e.push(`${id}: estado do substituto inválido`);
    if (d?.estado_substituto === 'nenhum_ainda' && !/nenhum/i.test(d.substituto ?? '')) e.push(`${id}: diz nenhum_ainda mas o substituto descreve um`);
    if (d?.estado_substituto === 'existe' && /^nenhum/i.test(d.substituto ?? '')) e.push(`${id}: diz que o substituto existe mas escreve nenhum`);
    if (!Array.isArray(d?.hosts) || d.hosts.length < 1) e.push(`${id}: sem anfitriões`);
    if (!Array.isArray(d?.lido_em) || d.lido_em.length < 1) e.push(`${id}: não diz onde foi lido`);
    for (const h of d?.hosts ?? []) declarados.set(h.toLowerCase(), id);
    for (const f of d?.lido_em ?? []) if (!existsSync(join(raiz, f))) e.push(`${id}: ${f} não existe`);
  }
  const IGNORADOS = new Set(['localhost', '127.0.0.1']);
  for (const [h, ficheiros] of anfitrioes) {
    if (IGNORADOS.has(h)) continue;
    if (!declarados.has(h)) e.push(`fornecedor não declarado: ${h} (usado em ${[...ficheiros].slice(0, 2).join(', ')})`);
  }
  for (const [h, id] of declarados) if (!anfitrioes.has(h) && !(m.dependencias.find((d) => d.id === id)?.hosts_nao_varridos ?? []).includes(h)) {
    e.push(`${id}: o anfitrião ${h} já não aparece no código varrido (tirar do mapa ou dizer em hosts_nao_varridos)`);
  }

  if (!(m?.regras ?? []).some((r) => /uma s[óo] fonte prim[áa]ria/i.test(r))) e.push('falta a regra: uma só fonte primária por assunto');
  if (!(m?.nao_afirma ?? []).some((r) => /produ[çc][ãa]o/i.test(r))) e.push('tem de dizer que não afirma o estado da produção');
  if (!(m?.nao_afirma ?? []).some((r) => /completo/i.test(r))) e.push('tem de dizer que não afirma estar completo');
  return e;
}

const ficheiroPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (ficheiroPrincipal) {
  const anf = anfitrioesDoCodigo(RAIZ);
  assert.deepEqual(validar(real, RAIZ, anf), [], 'o mapa real tem de passar');

  const clone = () => JSON.parse(JSON.stringify(real));
  let n = 0;
  const falha = (nome, mexer, trecho, anfs = anf) => {
    const f = clone(); mexer(f);
    const e = validar(f, RAIZ, anfs);
    assert.ok(e.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(e)}`);
    n++;
  };
  const f0 = (f) => f.fontes[0];
  const d0 = (f) => f.dependencias[0];
  falha('fonte duplicada em dois assuntos', (f) => { f.fontes[1].fonte_primaria = f.fontes[0].fonte_primaria; }, 'fonte primária de dois assuntos');
  falha('assunto repetido', (f) => { f.fontes.push({ ...f.fontes[0] }); }, 'assunto repetido');
  falha('fonte sem dono', (f) => { delete f0(f).dono; }, 'sem dono');
  falha('fonte primária inexistente', (f) => { f0(f).fonte_primaria = 'nao-existe.md'; }, 'não existe');
  falha('derivada inexistente', (f) => { f0(f).derivadas = ['nao/existe.json']; }, 'não existe');
  falha('derivada igual à fonte', (f) => { f0(f).derivadas = [f0(f).fonte_primaria]; }, 'a própria fonte');
  falha('tipo de fonte inválido', (f) => { f0(f).tipo = 'nuvem'; }, 'tipo de fonte');
  falha('base sem lacuna nem derivada', (f) => { f.lacunas = []; }, 'sem lacuna a dizê-lo');
  falha('duplicação sem guarda', (f) => { delete f.duplicacoes_conhecidas[0].guarda; }, 'sem guarda');
  falha('duplicação não declarada', (f) => { f.duplicacoes_conhecidas[0].estado = 'ignorada'; }, 'declarada');
  falha('guarda que não existe', (f) => { f.duplicacoes_conhecidas[0].guarda = 'scripts/nao-existe.mjs'; }, 'não existe');
  falha('dependência sem se_falhar', (f) => { delete d0(f).se_falhar; }, 'se falhar');
  falha('dependência sem substituto', (f) => { delete d0(f).substituto; }, 'substituto');
  falha('substituto que existe mas diz nenhum', (f) => { Object.assign(d0(f), { estado_substituto: 'existe', substituto: 'nenhum' }); }, 'escreve nenhum');
  falha('nenhum_ainda com substituto descrito', (f) => { Object.assign(d0(f), { estado_substituto: 'nenhum_ainda', substituto: 'um nó próprio' }); }, 'descreve um');
  falha('estado de substituto inventado', (f) => { d0(f).estado_substituto = 'garantido'; }, 'estado do substituto');
  falha('dependência sem anfitriões', (f) => { d0(f).hosts = []; }, 'sem anfitriões');
  falha('dependência lida num ficheiro que não existe', (f) => { d0(f).lido_em = ['api/nao-existe.js']; }, 'não existe');
  // Fornecedor novo no código sem declaração: simula um anfitrião a mais.
  const maisUm = new Map(anf); maisUm.set('novo-fornecedor.example.io', new Set(['api/novo.js']));
  falha('fornecedor novo não declarado', () => {}, 'fornecedor não declarado: novo-fornecedor.example.io', maisUm);
  // Fornecedor tirado do código mas ainda no mapa.
  const menosUm = new Map(anf); menosUm.delete('api.groq.com');
  falha('fornecedor no mapa já sem uso', () => {}, 'já não aparece no código', menosUm);
  falha('promessa no texto', (f) => { f.objecto += ' para sempre'; }, 'promessa');
  falha('segredo no texto', (f) => { f.regras.push('chave 0x' + 'ab'.repeat(20)); }, 'segredo');
  falha('endereço Bitcoin no texto', (f) => { f.regras.push('bc1q' + 'x'.repeat(30)); }, 'segredo');
  falha('sem citação de Unum', (f) => { delete f.autorizacao_de_unum; }, 'citação de Unum');
  falha('sem a regra da fonte única', (f) => { f.regras = []; }, 'uma só fonte primária');
  falha('afirma a produção', (f) => { f.nao_afirma = ['estar completo']; }, 'produção');
  falha('afirma estar completo', (f) => { f.nao_afirma = ['a produção']; }, 'completo');
  falha('format desconhecido', (f) => { f.format = 'x'; }, 'format');

  // O varredor: apanha um anfitrião entre aspas e um URL, e ignora o que não é anfitrião.
  const achados = anfitrioesDeTexto("const HOST = 'api.exemplo.com'; fetch('https://x.exemplo.org/p'); const f = 'index.ts'; const n = 'a.json'; const v = 'a.b';");
  assert.deepEqual([...achados].sort(), ['api.exemplo.com', 'x.exemplo.org']);
  console.log(`Mapa conferido: ${real.fontes.length} fontes, ${real.dependencias.length} dependências, ${anf.size} anfitriões no código, ${n} estragos propositados apanhados.`);
}

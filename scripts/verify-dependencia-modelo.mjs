// Verifica economia/dependencia-modelo.json: cada ficheiro citado existe e tem as marcas, todo o uso diz o que acontece se falhar,
// e nenhum host de modelo no código fica por declarar. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CAMINHO = 'economia/dependencia-modelo.json';
const HOSTS_DE_MODELO = ['api.anthropic.com', 'api.groq.com', 'api.openai.com', 'generativelanguage.googleapis.com', 'api.mistral.ai', 'api.cohere.com'];
const ESTADOS = ['existe', 'parcial', 'nenhum_ainda'];
const RAIZES = ['api', 'supabase/functions', 'scripts'];

const ficheiros = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? (d.name === 'node_modules' ? [] : ficheiros(p)) : [p];
}) : [];

export function validar(mapa, ler = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null, codigo = () => RAIZES.flatMap(ficheiros)) {
  const e = [];
  if (mapa.schema !== 'orum-dependencia-modelo/v1') e.push('schema inesperado');
  if (!Array.isArray(mapa.usos) || mapa.usos.length === 0) return [...e, 'sem usos'];
  const ids = new Set();
  const declarados = new Set();
  for (const u of mapa.usos) {
    if (!u.id || ids.has(u.id)) e.push(`id em falta ou repetido: ${u.id}`);
    ids.add(u.id);
    for (const k of ['o_que', 'fornecedor', 'se_falhar', 'substituto', 'estado_substituto', 'nao_verificado']) if (!u[k] || (Array.isArray(u[k]) && !u[k].length)) e.push(`${u.id}: falta ${k}`);
    if (!ESTADOS.includes(u.estado_substituto)) e.push(`${u.id}: estado_substituto inválido`);
    for (const h of u.hosts ?? []) declarados.add(h);
    for (const f of u.lido_em ?? []) {
      const t = ler(f);
      if (t === null) { e.push(`${u.id}: ficheiro não existe: ${f}`); continue; }
      for (const m of u.marcas ?? []) if (!t.includes(m) && !(u.lido_em.length > 1 && u.lido_em.some((g) => g !== f && (ler(g) ?? '').includes(m)))) e.push(`${u.id}: marca não encontrada em ${f}: ${m}`);
    }
    if (!(u.lido_em ?? []).length) e.push(`${u.id}: sem lido_em`);
  }
  for (const f of codigo()) {
    const t = ler(f);
    if (!t) continue;
    for (const h of HOSTS_DE_MODELO) if (t.includes(h) && !declarados.has(h) && !f.endsWith('verify-dependencia-modelo.mjs')) e.push(`host de modelo por declarar: ${h} em ${f}`);
  }
  for (const h of declarados) if (!codigo().some((f) => !f.endsWith('verify-dependencia-modelo.mjs') && (ler(f) ?? '').includes(h))) e.push(`host declarado que o código não usa: ${h}`);
  if (!Array.isArray(mapa.nao_verificado) || !mapa.nao_verificado.length) e.push('sem nao_verificado no mapa');
  return e;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const mapa = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  const real = validar(mapa);
  assert.deepEqual(real, [], `o mapa real tem de passar: ${JSON.stringify(real)}`);

  const clone = () => JSON.parse(JSON.stringify(mapa));
  let n = 0;
  const falha = (nome, m, trecho, ler, codigo) => {
    const r = validar(m, ler, codigo);
    assert.ok(r.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`);
    n++;
  };
  const lerReal = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  let m = clone(); m.schema = 'x'; falha('schema', m, 'schema', lerReal);
  m = clone(); m.usos = []; falha('sem usos', m, 'sem usos', lerReal);
  m = clone(); m.usos[2].se_falhar = ''; falha('sem se_falhar', m, 'falta se_falhar', lerReal);
  m = clone(); m.usos[2].substituto = ''; falha('sem substituto', m, 'falta substituto', lerReal);
  m = clone(); m.usos[2].estado_substituto = 'talvez'; falha('estado inválido', m, 'estado_substituto inválido', lerReal);
  m = clone(); m.usos[2].nao_verificado = []; falha('sem nao_verificado', m, 'falta nao_verificado', lerReal);
  m = clone(); m.usos[2].lido_em = ['supabase/functions/nao-existe/index.ts']; falha('ficheiro inexistente', m, 'não existe', lerReal);
  m = clone(); m.usos[2].marcas = ['esta frase não está no código']; falha('marca falsa', m, 'marca não encontrada', lerReal);
  m = clone(); m.usos[1].id = m.usos[0].id; falha('id repetido', m, 'repetido', lerReal);
  m = clone(); m.usos[2].hosts = ['api.groq.com']; falha('host por declarar (anthropic)', m, 'host de modelo por declarar: api.anthropic.com', lerReal);
  m = clone(); m.usos[2].hosts = ['api.anthropic.com', 'api.groq.com', 'api.openai.com']; falha('host declarado sem uso', m, 'host declarado que o código não usa: api.openai.com', lerReal);
  m = clone(); m.nao_verificado = []; falha('mapa sem nao_verificado', m, 'sem nao_verificado no mapa', lerReal);
  // um fornecedor novo no código sem declaração
  const lerComNovo = (p) => p === 'api/novo.js' ? "fetch('https://api.openai.com/v1/chat')" : lerReal(p);
  falha('fornecedor novo sem declaração', clone(), 'host de modelo por declarar: api.openai.com', lerComNovo, () => [...RAIZES.flatMap(ficheiros), 'api/novo.js']);
  console.log(`Dependência do modelo: ${mapa.usos.length} usos conferidos; ${n} estragos propositados apanhados.`);
}

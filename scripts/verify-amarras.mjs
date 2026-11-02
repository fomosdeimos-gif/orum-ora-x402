// Verifica economia/amarras.json: cada ficheiro citado existe e tem as marcas, toda a amarra diz o que acontece se falhar
// e o que a substitui, e nenhum host de fornecedor no código fica por declarar. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CAMINHO = 'economia/amarras.json';
const ESTADOS = ['existe', 'parcial', 'nenhum_ainda'];
const RISCOS = ['baixo', 'medio', 'alto', 'nao_se_solta'];
const RAIZES = ['api', 'supabase/functions'];
const ESCRITA = /\b(?:desliga|desligou|solt[aou]u?|removeu|migrou)\b.*\b(?:feito|concluíd[ao])\b/i;

const ficheiros = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? (d.name === 'node_modules' ? [] : ficheiros(p)) : [p];
}) : [];

export function validar(mapa, ler = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null, codigo = () => RAIZES.flatMap(ficheiros)) {
  const e = [];
  if (mapa.schema !== 'orum-amarras/v1') e.push('schema inesperado');
  if (!Array.isArray(mapa.amarras) || mapa.amarras.length === 0) return [...e, 'sem amarras'];
  const ids = new Set(), ordens = new Set(), marcasTodas = [];
  for (const a of mapa.amarras) {
    if (!a.id || ids.has(a.id)) e.push(`id em falta ou repetido: ${a.id}`);
    ids.add(a.id);
    for (const k of ['o_que', 'fornecedor', 'se_falhar', 'substituto', 'estado_substituto', 'nao_verificado', 'lido_em', 'marcas']) if (!a[k] || (Array.isArray(a[k]) && !a[k].length)) e.push(`${a.id}: falta ${k}`);
    if (!ESTADOS.includes(a.estado_substituto)) e.push(`${a.id}: estado_substituto inválido`);
    if (!RISCOS.includes(a.risco_de_soltar)) e.push(`${a.id}: risco_de_soltar inválido`);
    if (!Number.isInteger(a.ordem) || ordens.has(a.ordem)) e.push(`${a.id}: ordem em falta ou repetida`);
    ordens.add(a.ordem);
    const textos = (a.lido_em ?? []).map((f) => [f, ler(f)]);
    for (const [f, t] of textos) if (t === null) e.push(`${a.id}: ficheiro não existe: ${f}`);
    for (const m of a.marcas ?? []) {
      marcasTodas.push(m);
      if (!textos.some(([, t]) => t !== null && t.includes(m))) e.push(`${a.id}: marca não encontrada: ${m}`);
    }
    if (a.estado_substituto === 'existe' && /^\s*nenhum/i.test(a.substituto ?? '')) e.push(`${a.id}: diz que o substituto existe mas o texto diz nenhum`);
    if (ESCRITA.test(`${a.o_que} ${a.substituto}`)) e.push(`${a.id}: afirma uma soltura feita; este mapa não solta nada`);
  }
  const ordenadas = [...ordens].sort((x, y) => x - y);
  if (ordenadas.some((o, i) => o !== i + 1)) e.push('as ordens têm de ser 1..n sem buracos');
  const primeira = mapa.amarras.find((a) => a.id === mapa.primeira_soltura_proposta);
  if (!primeira) e.push('primeira_soltura_proposta não é uma amarra');
  else if (primeira.ordem !== 1) e.push('a primeira soltura proposta tem de ter ordem 1');
  const ignorados = (mapa.ignorados ?? []).map((i) => { if (!i.host || !i.porque) e.push(`ignorado sem host ou porque: ${JSON.stringify(i)}`); return i.host; });
  const cobertos = [...marcasTodas, ...ignorados].join('\n');
  const vistos = new Set();
  for (const f of codigo()) {
    const t = ler(f);
    if (!t) continue;
    for (const x of t.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g)) {
      const h = x[1];
      if (!cobertos.includes(h) && !vistos.has(h)) { vistos.add(h); e.push(`host por declarar: ${h} em ${f}`); }
    }
  }
  if (!Array.isArray(mapa.nao_verificado) || !mapa.nao_verificado.length) e.push('sem nao_verificado no mapa');
  if (!mapa.limites || !/n[ãa]o promete independ[êe]ncia/i.test(`${mapa.orientacao} ${mapa.limites}`)) e.push('falta dizer que não promete independência total');
  return e;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const mapa = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  const real = validar(mapa);
  assert.deepEqual(real, [], `o mapa real tem de passar: ${JSON.stringify(real)}`);

  const clone = () => JSON.parse(JSON.stringify(mapa));
  const lerReal = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  let n = 0;
  const falha = (nome, m, trecho, ler = lerReal, codigo) => {
    const r = validar(m, ler, codigo);
    assert.ok(r.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`);
    n++;
  };
  let m = clone(); m.schema = 'x'; falha('schema', m, 'schema');
  m = clone(); m.amarras = []; falha('sem amarras', m, 'sem amarras');
  m = clone(); m.amarras[3].se_falhar = ''; falha('sem se_falhar', m, 'falta se_falhar');
  m = clone(); m.amarras[3].substituto = ''; falha('sem substituto', m, 'falta substituto');
  m = clone(); m.amarras[3].estado_substituto = 'talvez'; falha('estado inválido', m, 'estado_substituto inválido');
  m = clone(); m.amarras[3].risco_de_soltar = 'nenhum'; falha('risco inválido', m, 'risco_de_soltar inválido');
  m = clone(); m.amarras[3].nao_verificado = []; falha('sem nao_verificado', m, 'falta nao_verificado');
  m = clone(); m.amarras[3].lido_em = ['api/nao-existe.js']; falha('ficheiro inexistente', m, 'não existe');
  m = clone(); m.amarras[3].marcas = ['esta frase não está no código']; falha('marca falsa', m, 'marca não encontrada');
  m = clone(); m.amarras[1].id = m.amarras[0].id; falha('id repetido', m, 'repetido');
  m = clone(); m.amarras[1].ordem = m.amarras[0].ordem; falha('ordem repetida', m, 'ordem');
  m = clone(); m.amarras[2].ordem = 99; falha('buraco nas ordens', m, 'sem buracos');
  m = clone(); m.primeira_soltura_proposta = 'nao-existe'; falha('primeira inexistente', m, 'primeira_soltura_proposta');
  m = clone(); m.primeira_soltura_proposta = m.amarras[4].id; falha('primeira sem ordem 1', m, 'ordem 1');
  m = clone(); m.amarras[5].substituto = 'nenhum ainda'; m.amarras[5].estado_substituto = 'existe'; falha('substituto contraditório', m, 'texto diz nenhum');
  m = clone(); m.amarras[0].o_que = 'Soltou o Coinbase, feito.'; falha('soltura afirmada', m, 'soltura feita');
  m = clone(); m.ignorados.push({ host: 'x.example.org' }); falha('ignorado sem porque', m, 'ignorado sem host ou porque');
  m = clone(); m.nao_verificado = []; falha('mapa sem nao_verificado', m, 'sem nao_verificado no mapa');
  m = clone(); m.limites = 'Nada.'; m.orientacao = 'Nada.'; falha('sem aviso de independência', m, 'não promete independência');
  m = clone(); m.amarras = m.amarras.filter((a) => a.id !== 'esplora-bitcoin'); falha('amarra retirada deixa host por declarar', m, 'host por declarar: blockstream.info');
  const lerComNovo = (p) => p === 'api/novo.js' ? "fetch('https://api.novofornecedor.io/v1')" : lerReal(p);
  falha('fornecedor novo sem declaração', clone(), 'host por declarar: api.novofornecedor.io', lerComNovo, () => [...RAIZES.flatMap(ficheiros), 'api/novo.js']);
  console.log(`Amarras: ${mapa.amarras.length} fornecedores conferidos; ${n} estragos propositados apanhados.`);
}

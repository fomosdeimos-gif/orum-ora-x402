// Verifica que o openapi.json descreve os direitos de cada licença tal como a função ora-licenca os define, que o parâmetro
// "obra" está documentado como o código o trata (ID numérico), e que o 402 traz a obra sem expor o caminho nem os bytes;
// e que o próprio verificador apanha as mentiras: cada variante adulterada tem de falhar, a real tem de passar.
// Sem rede, sem base de dados. Unum, 27/10/2026: "Eu autorizo ORA", à proposta P4 do registo de legibilidade (lacunas L7 e L8).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const raiz = new URL('../', import.meta.url);
const ler = (f) => readFileSync(new URL(f, raiz), 'utf8');
const srcReal = ler('supabase/functions/ora-licenca/index.ts');
const specReal = JSON.parse(ler('openapi.json'));

const CHAVES_OBRA = ['ano', 'descricao_visivel', 'fotografia_publica', 'id', 'nota', 'sha256', 'titulo'];
const PROIBIDO_NA_OBRA = ['caminho_arca', 'bytes_na_arca', 'verificado_', 'signedUrl', 'storage'];

// As licenças tal como o código as define (fonte de verdade).
export function licencasDoCodigo(src) {
  const out = {};
  for (const key of ['consulta', 'editorial', 'treino']) {
    const linha = src.split('\n').find((l) => l.trimStart().startsWith(`${key}: { key: '${key}'`));
    if (!linha) throw new Error(`licença ${key} não encontrada em ora-licenca/index.ts`);
    const usdc = linha.match(/usdc: '([0-9.]+)'/)?.[1];
    const dias = linha.match(/dias: (null|\d+)/)?.[1];
    const acesso = linha.match(/acesso_segundos: (\d+)/)?.[1];
    const direitos = [...(linha.match(/direitos: \[([^\]]*)\]/)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    out[key] = { usdc, dias: dias === 'null' ? null : Number(dias), acesso: Number(acesso), direitos };
  }
  return out;
}

export function verificar({ src, spec }) {
  const erros = [];
  const x = (m) => erros.push(m);
  let lic;
  try { lic = licencasDoCodigo(src); } catch (e) { return [e.message]; }
  const todosDireitos = Object.values(lic).flatMap((l) => l.direitos);

  // ---- openapi.json: um texto por licença, derivado do código
  for (const [key, l] of Object.entries(lic)) {
    const op = spec.paths?.[`/licenca/${key}`]?.get;
    if (!op) { x(`openapi: falta /licenca/${key}`); continue; }
    const d = op.description || '';
    if (!d) x(`openapi: /licenca/${key} sem description`);
    for (const dir of l.direitos) if (!d.includes(dir)) x(`openapi: /licenca/${key} não cita o direito ${dir}`);
    for (const dir of todosDireitos.filter((t) => !l.direitos.includes(t))) if (d.includes(dir)) x(`openapi: /licenca/${key} cita o direito ${dir}, que é de outra licença`);
    const lista = d.match(/\(([a-z0-9-]+(?:, [a-z0-9-]+)*)\)\. /)?.[1];
    if (lista !== l.direitos.join(', ')) x(`openapi: a lista de direitos de /licenca/${key} (${lista}) difere da do código (${l.direitos.join(', ')})`);
    if (!d.includes(`${l.usdc} USDC`)) x(`openapi: /licenca/${key} não diz o preço ${l.usdc} USDC`);
    if (op['x-payment-info']?.price?.amount !== l.usdc) x(`openapi: x-payment-info de /licenca/${key} difere do preço do código (${l.usdc})`);
    if (!d.includes(`${l.acesso} s`)) x(`openapi: /licenca/${key} não diz que a URL de acesso expira em ${l.acesso} s`);
    if (l.dias === null && !/Perpétua/.test(d)) x(`openapi: /licenca/${key} devia dizer que é perpétua`);
    if (l.dias !== null && !d.includes(`Válida ${l.dias} dias`)) x(`openapi: /licenca/${key} devia dizer «Válida ${l.dias} dias»`);
    if (l.dias !== null && /Perpétua/.test(d)) x(`openapi: /licenca/${key} diz perpétua, mas o código dá ${l.dias} dias`);
    if (!/não transfere a propriedade da obra física/.test(d)) x(`openapi: /licenca/${key} não diz o que a licença não transfere`);
    if (!d.includes('campo `obra`')) x(`openapi: /licenca/${key} não manda ler o campo obra do 402`);
    if (!d.includes('?obra=<ID numérico>')) x(`openapi: /licenca/${key} não diz como escolher a obra`);
    if (key === 'consulta' && !/Não é uso comercial/.test(d)) x('openapi: a consulta devia dizer que não é uso comercial');
    if (key !== 'consulta' && /Não é uso comercial/.test(d)) x(`openapi: /licenca/${key} afirma «Não é uso comercial», que o código só diz da consulta`);
    // parâmetro obra: o código só aceita um ID numérico
    const p = (op.parameters || []).find((q) => q.name === 'obra');
    if (!p) x(`openapi: /licenca/${key} sem o parâmetro obra`);
    else {
      if (p.schema?.pattern !== '^[1-9][0-9]*$') x(`openapi: o parâmetro obra de /licenca/${key} não tem o padrão de ID numérico`);
      if ('default' in (p.schema || {})) x(`openapi: o parâmetro obra de /licenca/${key} tem valor por omissão (o servidor escolhe a obra)`);
      for (const e of [...(p.schema?.examples || []), p.example].filter((v) => v !== undefined)) if (!/^[1-9][0-9]*$/.test(String(e))) x(`openapi: exemplo de obra não numérico em /licenca/${key}: ${e}`);
      if (!/ID numérico/.test(p.description || '')) x(`openapi: a descrição do parâmetro obra de /licenca/${key} não diz que é um ID numérico`);
    }
    const props = op.responses?.['402']?.content?.['application/json']?.schema?.properties || {};
    if (!props.obra) x(`openapi: o 402 de /licenca/${key} não documenta o campo obra`);
    else for (const k of CHAVES_OBRA) if (!props.obra.properties?.[k]) x(`openapi: o campo obra do 402 de /licenca/${key} não documenta ${k}`);
    if (!props.selection) x(`openapi: o 402 de /licenca/${key} não documenta o campo selection`);
  }

  // ---- ora-licenca/index.ts: o campo obra do 402
  const m = src.match(/const obraPublica = \{([^}]*)\};/);
  if (!m) x('código: falta a constante obraPublica');
  else {
    const lit = m[1];
    const chaves = [...lit.matchAll(/(?:^|,)\s*(\w+):/g)].map((k) => k[1]).sort();
    if (JSON.stringify(chaves) !== JSON.stringify(CHAVES_OBRA)) x(`código: obraPublica tem as chaves ${chaves.join(',')}; esperado ${CHAVES_OBRA.join(',')}`);
    for (const proibido of PROIBIDO_NA_OBRA) if (lit.includes(proibido)) x(`código: obraPublica expõe ${proibido}`);
    for (const k of ['id', 'titulo', 'ano', 'sha256', 'descricao_visivel']) if (!new RegExp(`\\b${k}: prepared\\.obra\\.${k}\\b`).test(lit)) x(`código: obraPublica.${k} não vem de prepared.obra.${k}`);
    if (!/fotografia_publica: false/.test(lit)) x('código: obraPublica.fotografia_publica tem de ser false');
    if (!/\?obra=<id numerico>/.test(lit)) x('código: a nota da obra não diz como escolher outra obra');
  }
  if (!/\.\.\.body, obra: obraPublica, selection: prepared\.selection, selection_signature:/.test(src)) x('código: o corpo do 402 tem de ser {...body, obra, selection, selection_signature}');
  if (!/new Headers\(challenge\.headers\); headers\.set\('Cache-Control', 'no-store'\)/.test(src)) x('código: os cabeçalhos do 402 foram alterados');
  if (!/catalogo_gratuito: publicoUrl\(req, 'catalogo'\)/.test(src)) x('código: o 402 perdeu a ligação ao catálogo gratuito');
  if (!/work_id_invalid/.test(src)) x('código: o tratamento de work_id_invalid desapareceu (o openapi diz que um título devolve 400)');
  return erros;
}

const real = { src: srcReal, spec: specReal };
assert.deepEqual(verificar(real), [], 'o real devia passar: ' + verificar(real).join('; '));

let mentiras = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const falhaSpec = (nome, mexe) => { const s = clone(specReal); mexe(s); assert.ok(verificar({ src: srcReal, spec: s }).length > 0, `devia falhar: ${nome}`); mentiras++; };
const falhaSrc = (nome, troca) => { const t = troca(srcReal); assert.notEqual(t, srcReal, `a mentira «${nome}» não mudou nada`); assert.ok(verificar({ src: t, spec: specReal }).length > 0, `devia falhar: ${nome}`); mentiras++; };
const get = (s, k) => s.paths[`/licenca/${k}`].get;

falhaSpec('a consulta deixa de citar um direito', (s) => { get(s, 'consulta').description = get(s, 'consulta').description.replace('visualizacao-privada', 'vista'); });
falhaSpec('o treino perde o direito ai-training', (s) => { get(s, 'treino').description = get(s, 'treino').description.replace('ai-training', 'treino'); });
falhaSpec('o editorial cita um direito do treino', (s) => { get(s, 'editorial').description += ' (ai-training)'; });
falhaSpec('preço errado na descrição do editorial', (s) => { get(s, 'editorial').description = get(s, 'editorial').description.replace('16.18 USDC', '1.618 USDC'); });
falhaSpec('x-payment-info difere do código', (s) => { get(s, 'treino')['x-payment-info'].price.amount = '16.18'; });
falhaSpec('segundos de acesso errados na consulta', (s) => { get(s, 'consulta').description = get(s, 'consulta').description.replace('300 s', '3600 s'); });
falhaSpec('a consulta passa a ser perpétua', (s) => { get(s, 'consulta').description = get(s, 'consulta').description.replace('Válida 30 dias', 'Perpétua'); });
falhaSpec('o editorial perde a perpetuidade', (s) => { get(s, 'editorial').description = get(s, 'editorial').description.replace('Perpétua', 'Temporária'); });
falhaSpec('deixa de dizer o que a licença não transfere', (s) => { get(s, 'treino').description = get(s, 'treino').description.replace('não transfere a propriedade da obra física', 'transfere tudo'); });
falhaSpec('deixa de mandar ler o campo obra', (s) => { get(s, 'consulta').description = get(s, 'consulta').description.replace('campo `obra`', 'campo'); });
falhaSpec('o editorial afirma «Não é uso comercial»', (s) => { get(s, 'editorial').description += ' Não é uso comercial.'; });
falhaSpec('a consulta deixa de dizer que não é uso comercial', (s) => { get(s, 'consulta').description = get(s, 'consulta').description.replace('Não é uso comercial', 'Uso livre'); });
falhaSpec('o parâmetro obra perde o padrão numérico', (s) => { delete get(s, 'consulta').parameters[0].schema.pattern; });
falhaSpec('o parâmetro obra volta ao valor por omissão «presenca»', (s) => { get(s, 'treino').parameters[0].schema.default = 'presenca'; });
falhaSpec('o exemplo de obra volta a ser um título', (s) => { get(s, 'editorial').parameters[0].example = 'presenca'; });
falhaSpec('o parâmetro obra deixa de dizer que é numérico', (s) => { get(s, 'consulta').parameters[0].description = 'Título da obra.'; });
falhaSpec('o 402 deixa de documentar a obra', (s) => { delete get(s, 'treino').responses['402'].content['application/json'].schema.properties.obra; });
falhaSpec('o campo obra do 402 perde o sha256', (s) => { delete get(s, 'consulta').responses['402'].content['application/json'].schema.properties.obra.properties.sha256; });
falhaSpec('falta uma licença', (s) => { delete s.paths['/licenca/editorial']; });
falhaSrc('o código passa a expor o caminho da fotografia', (t) => t.replace('fotografia_publica: false, nota:', 'fotografia_publica: false, caminho_arca: prepared.obra.caminho_arca, nota:'));
falhaSrc('o código expõe os bytes na arca', (t) => t.replace('fotografia_publica: false, nota:', 'fotografia_publica: false, bytes_na_arca: prepared.obra.bytes_na_arca, nota:'));
falhaSrc('o título vem de outra fonte', (t) => t.replace('titulo: prepared.obra.titulo', "titulo: 'outra'"));
falhaSrc('o sha256 não vem da obra preparada', (t) => t.replace('sha256: prepared.obra.sha256, descricao_visivel', "sha256: 'abc', descricao_visivel"));
falhaSrc('a fotografia passa a ser pública', (t) => { const i = t.indexOf('const obraPublica'); const j = t.indexOf('fotografia_publica: false', i); return t.slice(0, j) + 'fotografia_publica: true' + t.slice(j + 'fotografia_publica: false'.length); });
falhaSrc('o corpo do 402 perde a obra', (t) => t.replace('...body, obra: obraPublica, selection:', '...body, selection:'));
falhaSrc('o corpo do 402 muda a ordem e a selecção', (t) => t.replace('obra: obraPublica, selection: prepared.selection,', 'selection: prepared.selection, obra: obraPublica,'));
falhaSrc('os cabeçalhos do 402 são alterados', (t) => t.replace("new Headers(challenge.headers); headers.set('Cache-Control', 'no-store')", "new Headers(challenge.headers); headers.set('Cache-Control', 'public')"));
falhaSrc('o 402 perde a ligação ao catálogo', (t) => t.replace("catalogo_gratuito: publicoUrl(req, 'catalogo')", "catalogo: publicoUrl(req, 'catalogo')"));
falhaSrc('o código deixa de rejeitar títulos', (t) => t.replaceAll('work_id_invalid', 'ok'));
falhaSrc('o preço da consulta muda no código e o openapi não', (t) => t.replace("usdc: '1.618'", "usdc: '2.000'"));
falhaSrc('os direitos do treino mudam no código e o openapi não', (t) => t.replace("'dataset-inclusion', ", ''));
falhaSrc('a validade da consulta muda no código e o openapi não', (t) => t.replace('dias: 30', 'dias: 60'));

console.log(JSON.stringify({ verified: true, casos_de_mentira: mentiras }));

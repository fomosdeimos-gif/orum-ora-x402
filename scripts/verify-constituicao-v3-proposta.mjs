// Verifica que a proposta de constituicao v3 continua so uma proposta: nao activa, sem valores nem
// enderecos nem limites alargados sem aprovacao escrita de Unum, e sem ser lida por nenhuma superficie.
// Sem rede, sem pagamentos. Cada mentira testada aqui tem de falhar.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

const raiz = (p) => new URL('../' + p, import.meta.url);
const real = JSON.parse(readFileSync(raiz('economia/constituicao-v3-proposta.json'), 'utf8'));

// ficheiros de superficie/runtime que nao podem referir a proposta
const SUPERFICIES = ['api', 'llms.txt', 'weave_hands.json', 'openapi.json', 'sitemap.xml', 'vercel.json', 'server.js', 'index.html'];
const lerTudo = (rel) => {
  const u = raiz(rel);
  if (!existsSync(u)) return [];
  if (statSync(u).isDirectory()) return readdirSync(u).flatMap((f) => lerTudo(rel + '/' + f));
  return [[rel, readFileSync(u, 'utf8')]];
};
const referencias = () => SUPERFICIES.flatMap(lerTudo).filter(([, t]) => /constituicao-v3/.test(t)).map(([f]) => f);

export function validar(p, refs = []) {
  const e = [];
  const aprovada = p?.aprovacao_unum && p.aprovacao_unum.data && p.aprovacao_unum.citacao;
  if (p?.format !== 'orum-financial-constitution/v3-proposta') e.push('format desconhecido');
  if (!aprovada && p?.status !== 'proposta_nao_activa') e.push('sem aprovacao de Unum o estado tem de ser proposta_nao_activa');
  if (refs.length) e.push('superficie le a proposta: ' + refs.join(', '));
  if (!Array.isArray(p?.decisions) || p.decisions.length === 0) e.push('sem decisoes');
  for (const d of p?.decisions ?? []) {
    if (!d?.id || !d?.pergunta || !Array.isArray(d?.opcoes) || d.opcoes.length < 2 || !d?.recomendacao) e.push(`${d?.id}: decisao incompleta`);
    if (d?.valor !== null && d?.valor !== undefined && !aprovada) e.push(`${d?.id}: valor preenchido sem aprovacao de Unum`);
  }
  if (!aprovada && /0x[0-9a-fA-F]{40}/.test(JSON.stringify(p))) e.push('endereco na proposta sem aprovacao de Unum');
  const l = p?.absolute_limits ?? {};
  if (!aprovada) {
    for (const k of ['automatic_trade_usdc', 'automatic_debt_usdc', 'automatic_bridge_usdc']) if (l[k] !== 0) e.push(`${k} tem de ser 0 sem aprovacao`);
    if (l.unlimited_approval !== false) e.push('aprovacao ilimitada proibida sem aprovacao');
  }
  const cannot = p?.custody?.organism_cannot ?? [];
  if (!cannot.some((c) => /alargar o envelope/i.test(c))) e.push('a ORA tem de ficar impedida de alargar o proprio envelope');
  if (!cannot.some((c) => /assinar a activa/i.test(c))) e.push('a ORA tem de ficar impedida de assinar a activacao');
  if (!/n[ãa]o move dinheiro/i.test(p?.truth_boundary ?? '')) e.push('falta a fronteira de verdade (nao move dinheiro)');
  return e;
}

const errosReais = validar(real, referencias());
assert.deepEqual(errosReais, [], 'proposta invalida: ' + errosReais.join('; '));

// mentiras: cada uma tem de falhar
const clone = () => JSON.parse(JSON.stringify(real));
let mentiras = 0;
const falha = (nome, p, refs) => { assert.ok(validar(p, refs).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = clone(); m.status = 'activa'; falha('estado activo sem aprovacao', m);
m = clone(); m.decisions[0].valor = '0x' + '1'.repeat(40); falha('valor sem aprovacao', m);
m = clone(); m.decisions[1].valor = 50; falha('tecto preenchido sem aprovacao', m);
m = clone(); m.notas = 'enviar para 0x' + 'ab'.repeat(20); falha('endereco sem aprovacao', m);
m = clone(); m.absolute_limits.automatic_trade_usdc = 5; falha('comercio alargado', m);
m = clone(); m.absolute_limits.unlimited_approval = true; falha('aprovacao ilimitada', m);
m = clone(); delete m.decisions[2].recomendacao; falha('decisao sem recomendacao', m);
m = clone(); m.decisions = []; falha('sem decisoes', m);
m = clone(); m.custody.organism_cannot = m.custody.organism_cannot.filter((c) => !/alargar o envelope/i.test(c)); falha('ORA pode alargar o envelope', m);
m = clone(); m.custody.organism_cannot = m.custody.organism_cannot.filter((c) => !/assinar a activa/i.test(c)); falha('ORA pode assinar', m);
m = clone(); m.truth_boundary = 'tudo certo'; falha('sem fronteira de verdade', m);
falha('lida por superficie', clone(), ['api/tesouraria.js']);
m = clone(); m.format = 'outro'; falha('format', m);
// com aprovacao registada, estado e valores passam a ser admissiveis (mas a validacao de forma mantem-se)
m = clone(); m.aprovacao_unum = { data: '2026-10-18', citacao: 'aprovo' }; m.status = 'aprovada_aguarda_assinatura'; m.decisions[1].valor = 5;
assert.deepEqual(validar(m), [], 'com aprovacao registada devia passar');

console.log(JSON.stringify({ verified: true, estado: real.status, decisoes: real.decisions.length, casos_de_mentira: mentiras }));

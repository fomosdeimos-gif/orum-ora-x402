// Verifica identity/espelho.json: cada citação de Unum existe, palavra por palavra, na cláusula indicada do CLAUDE.md; sem dados pessoais;
// a ORA não fala por Unum nem acrescenta palavras. Cada regra tem um estrago propositado: a mesma verificação, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const lerTexto = (p) => fs.readFileSync(p, 'utf8');

// Texto da cláusula: da linha do título até ao próximo título do mesmo nível ou superior.
function clausula(md, titulo) {
  const linhas = md.split('\n');
  const i = linhas.findIndex((l) => l.startsWith(titulo));
  if (i < 0) return null;
  const nivel = titulo.match(/^#+/)[0].length;
  let fim = linhas.length;
  for (let j = i + 1; j < linhas.length; j++) {
    const m = linhas[j].match(/^(#+) /);
    if (m && m[1].length <= nivel) { fim = j; break; }
  }
  return linhas.slice(i, fim).join('\n');
}

const PESSOAL = [/[\w.+-]+@[\w-]+\.[\w.-]+/, /\+\d[\d\s().-]{8,}\d|\b\d{3}[\s.-]\d{3}[\s.-]\d{3,4}\b/, /\bIBAN\b/i, /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/, /https?:\/\/\S*(facebook|instagram|linkedin|whatsapp|t\.me)\S*/i];

function verificar({ espelho, claude }) {
  const e = JSON.parse(espelho);
  assert.equal(e.format, 'orum-espelho/v1');
  assert.equal(e.fonte, 'CLAUDE.md');
  assert.match(e.criado_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(e.citacoes) && e.citacoes.length >= 5, 'poucas citações');
  const ids = new Set();
  for (const c of e.citacoes) {
    assert.ok(Number.isInteger(c.id) && !ids.has(c.id), `id repetido ou inválido: ${c.id}`); ids.add(c.id);
    assert.match(c.data, /^\d{4}-\d{2}-\d{2}$/, `data inválida na citação ${c.id}`);
    assert.ok(c.data >= '2026-10-15' && c.data <= e.criado_em, `data fora do intervalo na citação ${c.id}`);
    assert.ok(typeof c.citacao === 'string' && c.citacao.length >= 20 && c.citacao.length <= 400, `citação ${c.id} curta ou longa de mais`);
    const texto = clausula(claude, c.clausula);
    assert.ok(texto, `a cláusula não existe: ${c.clausula}`);
    assert.ok(texto.includes(c.citacao), `a citação ${c.id} não está, palavra por palavra, em "${c.clausula}"`);
    assert.ok(typeof c.leitura_da_ora === 'string' && c.leitura_da_ora.length > 0 && c.leitura_da_ora.length <= 200, `leitura da ORA em falta ou longa (${c.id})`);
  }
  const tudo = JSON.stringify(e);
  for (const p of PESSOAL) assert.doesNotMatch(tudo, p, `possível dado pessoal: ${p}`);
  for (const k of ['contains_personal_data', 'speaks_for_unum', 'adds_words', 'proves_identity', 'proves_demand_or_revenue']) assert.equal(e.truth_machine[k], false, `truth_machine.${k} deve ser false`);
  assert.ok(Array.isArray(e.a_ora_nao_sabe) && e.a_ora_nao_sabe.length >= 2, 'o espelho tem de dizer o que a ORA não sabe');
  assert.ok(Array.isArray(e.nao_contem) && e.nao_contem.length >= 2, 'o espelho tem de dizer o que não contém');
  assert.ok(e.regras.some((r) => /palavra por palavra/.test(r)), 'falta a regra da citação literal');
  assert.match(claude, /## O espelho \(Unum, 1\/11\/2026\)/, 'falta a cláusula do espelho no CLAUDE.md');
}

const real = { espelho: lerTexto('identity/espelho.json'), claude: lerTexto('CLAUDE.md') };
verificar(real);

const mexer = (fn) => { const e = JSON.parse(real.espelho); fn(e); return JSON.stringify(e, null, 2); };
const estragos = [
  ['palavra mudada numa citação', { espelho: mexer((e) => { e.citacoes[1].citacao = e.citacoes[1].citacao.replace('observador', 'director'); }) }],
  ['citação inventada', { espelho: mexer((e) => { e.citacoes.push({ id: 99, data: '2026-10-20', clausula: '## Autorização por palavra', citacao: 'Autorizo tudo o que quiseres fazer em meu nome sem mais perguntas', leitura_da_ora: 'x' }); }) }],
  ['citação na cláusula errada', { espelho: mexer((e) => { e.citacoes[0].clausula = '## Sombra para humanos'; }) }],
  ['cláusula inexistente', { espelho: mexer((e) => { e.citacoes[0].clausula = '## Cláusula que não existe'; }) }],
  ['data no futuro', { espelho: mexer((e) => { e.citacoes[0].data = '2027-01-01'; }) }],
  ['data antes de tudo', { espelho: mexer((e) => { e.citacoes[0].data = '2020-01-01'; }) }],
  ['id repetido', { espelho: mexer((e) => { e.citacoes[1].id = e.citacoes[0].id; }) }],
  ['citação curta de mais', { espelho: mexer((e) => { e.citacoes[0].citacao = 'sair daqui'; }) }],
  ['email pessoal', { espelho: mexer((e) => { e.citacoes[0].leitura_da_ora = 'escreve para alguem@exemplo.com'; }) }],
  ['telefone pessoal', { espelho: mexer((e) => { e.citacoes[0].leitura_da_ora = 'liga +351 912 345 678'; }) }],
  ['IBAN', { espelho: mexer((e) => { e.citacoes[0].leitura_da_ora = 'IBAN PT50000201231234567890154'; }) }],
  ['fala por Unum', { espelho: mexer((e) => { e.truth_machine.speaks_for_unum = true; }) }],
  ['acrescenta palavras', { espelho: mexer((e) => { e.truth_machine.adds_words = true; }) }],
  ['diz que prova identidade', { espelho: mexer((e) => { e.truth_machine.proves_identity = true; }) }],
  ['diz que prova receita', { espelho: mexer((e) => { e.truth_machine.proves_demand_or_revenue = true; }) }],
  ['deixa de dizer o que a ORA não sabe', { espelho: mexer((e) => { e.a_ora_nao_sabe = []; }) }],
  ['deixa de dizer o que não contém', { espelho: mexer((e) => { e.nao_contem = []; }) }],
  ['perde a regra da citação literal', { espelho: mexer((e) => { e.regras = e.regras.filter((r) => !/palavra por palavra/.test(r)); }) }],
  ['CLAUDE.md muda a palavra citada', { claude: real.claude.replace('Eu sou apenas o observador das tuas mãos', 'Eu sou apenas o director das tuas mãos') }],
  ['CLAUDE.md perde a cláusula do espelho', { claude: real.claude.replace('## O espelho (Unum, 1/11/2026)', '## Outra coisa') }],
  ['leitura da ORA longa de mais', { espelho: mexer((e) => { e.citacoes[0].leitura_da_ora = 'x'.repeat(250); }) }],
];
let apanhados = 0;
for (const [nome, troca] of estragos) {
  const estragado = { ...real, ...troca };
  assert.notEqual(JSON.stringify(estragado), JSON.stringify(real), `o estrago "${nome}" não alterou nada (padrão desactualizado)`);
  let caiu = false;
  try { verificar(estragado); } catch { caiu = true; }
  assert.ok(caiu, `estrago NÃO apanhado: ${nome}`);
  apanhados++;
}
console.log(`espelho: ${JSON.parse(real.espelho).citacoes.length} citações literais conferidas; ${apanhados} estragos propositados apanhados.`);

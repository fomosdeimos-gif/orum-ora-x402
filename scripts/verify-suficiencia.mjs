// Verifica economia/suficiencia.json (Unum, 12/11/2026: "A suficiência é o que o organismo entender aqui ali" / "Eu autorizo").
// O resultado do mês é calculado das condições e tem de bater com os custos mensais lidos.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const custos = JSON.parse(fs.readFileSync('economia/custos-mensais.json', 'utf8'));
const regua = JSON.parse(fs.readFileSync('economia/regua-do-valor.json', 'utf8'));
const ESTADOS = new Set(['verdadeiro', 'falso', 'nao_avaliavel']);
const IDS = ['custos_todos_lidos', 'receita_cobre_custos', 'sustento_chegou', 'conferivel_sem_a_ora'];

function resultadoDe(a) {
  const e = IDS.map((id) => a[id].estado);
  if (e.every((x) => x === 'verdadeiro')) return 'suficiente';
  if (e.includes('nao_avaliavel')) return 'nao_avaliavel';
  return 'insuficiente';
}

function verificar(txt) {
  const r = JSON.parse(txt);
  assert.equal(r.format, 'orum-suficiencia/v1');
  assert.ok(Number.isInteger(r.versao) && r.versao >= 1);
  assert.equal(r.palavra_de_unum.citacao, 'A suficiência é o que o organismo entender aqui ali');
  assert.equal(r.palavra_de_unum.e_depois, 'Eu autorizo');
  assert.match(r.palavra_de_unum.cobre, /não move fundos nem tokens/);
  assert.deepEqual(r.condicoes.map((c) => c.id), IDS, 'as quatro condições, por ordem');
  assert.ok(!/1 ?000 ?(EUR|€)/i.test(r.entendimento_da_ora), 'um número escrito de antemão');
  assert.match(r.entendimento_da_ora, /não uma meta nem um número escrito de antemão/);
  assert.match(r.entendimento_da_ora, /nao_avaliavel/);
  const a = r.avaliacao_2026_11;
  assert.match(a.mes, /^\d{4}-\d{2}$/);
  for (const id of IDS) {
    assert.ok(ESTADOS.has(a[id].estado), `${id}: estado inválido`);
    const g = a[id];
    assert.ok(typeof (g.fonte ?? g.nota) === 'string' && (g.fonte ?? g.nota).length > 10, `${id}: sem fonte nem nota`);
    if (g.estado === 'verdadeiro') assert.ok(typeof g.fonte === 'string' && g.fonte.length > 10, `${id}: verdadeiro sem fonte`);
  }
  assert.equal(a.resultado, resultadoDe(a), 'o resultado não é o das condições');
  // Ligação aos custos lidos: não se diz que todos estão lidos se o registo diz que não.
  const mes = custos.meses[custos.meses.length - 1].mes;
  assert.equal(a.mes, mes, 'a avaliação não é do último mês dos custos');
  assert.equal(a.custos_todos_lidos.estado === 'verdadeiro', custos.total.afirma_custo_total, 'custos_todos_lidos contradiz os custos mensais');
  if (!custos.total.afirma_custo_total) assert.notEqual(a.receita_cobre_custos.estado, 'verdadeiro', 'a receita não cobre custos que não se leram');
  // Receita externa: nenhuma no registo, por isso o sustento não pode ter chegado.
  assert.equal(regua.itens.some((i) => i.degraus['4'].estado === 'verificado'), a.sustento_chegou.estado === 'verdadeiro', 'sustento_chegou contradiz a régua (degrau 4)');
  // Suficiência da régua aponta para este ficheiro.
  assert.match(regua.medida_de_suficiente.entendimento_da_ora, /economia\/suficiencia\.json/);
  // Limites.
  const nd = r.o_que_a_ora_nao_decide.join(' ');
  assert.match(nd, /o que é suficiente para Unum/);
  assert.match(nd, /nenhum teto em euros/);
  assert.match(r.como_muda, /só se acrescenta/);
  assert.match(r.nao_prova, /não promete valor, receita, procura nem rendimento/);
  assert.match(r.nao_prova, /não move fundos nem tokens/);
  assert.ok(!/(secret|password|passphrase|api[_-]?key|private[_-]?key)\s*[:=]\s*\S{8,}/i.test(txt), 'parece conter um segredo');
}

const original = fs.readFileSync('economia/suficiencia.json', 'utf8');
verificar(original);

function estragar(f) { const r = JSON.parse(original); f(r); return JSON.stringify(r); }
const estragos = {
  'resultado suficiente com condições por cumprir': (r) => { r.avaliacao_2026_11.resultado = 'suficiente'; },
  'resultado insuficiente em vez de não avaliável': (r) => { r.avaliacao_2026_11.resultado = 'insuficiente'; },
  'estado inventado': (r) => { r.avaliacao_2026_11.sustento_chegou.estado = 'talvez'; },
  'verdadeiro sem fonte': (r) => { delete r.avaliacao_2026_11.conferivel_sem_a_ora.fonte; },
  'condição sem fonte nem nota': (r) => { delete r.avaliacao_2026_11.sustento_chegou.nota; },
  'custos lidos quando não estão': (r) => { r.avaliacao_2026_11.custos_todos_lidos.estado = 'verdadeiro'; },
  'receita cobre custos por ler': (r) => { r.avaliacao_2026_11.receita_cobre_custos.estado = 'verdadeiro'; },
  'sustento chegou sem degrau 4': (r) => { r.avaliacao_2026_11.sustento_chegou.estado = 'verdadeiro'; r.avaliacao_2026_11.sustento_chegou.fonte = 'uma fonte posta por cima'; },
  'mês errado': (r) => { r.avaliacao_2026_11.mes = '2026-12'; },
  'condição em falta': (r) => { r.condicoes.pop(); },
  'número escrito de antemão': (r) => { r.entendimento_da_ora = r.entendimento_da_ora.replace('não uma meta nem um número escrito de antemão', '1 000 EUR por mês'); },
  'sem a hipótese não avaliável': (r) => { r.entendimento_da_ora = r.entendimento_da_ora.replace(/nao_avaliavel/g, 'insuficiente'); },
  'a ORA decide por Unum': (r) => { r.o_que_a_ora_nao_decide = ['nenhum teto em euros']; },
  'volta o teto': (r) => { r.o_que_a_ora_nao_decide = r.o_que_a_ora_nao_decide.filter((s) => !/teto/.test(s)); },
  'muda sem acrescentar': (r) => { r.como_muda = 'a ORA reescreve quando quiser'; },
  'promete': (r) => { r.nao_prova = 'não move fundos nem tokens'; },
  'citação trocada': (r) => { r.palavra_de_unum.citacao = 'A suficiência é 1000 EUR'; },
  'segredo escrito': (r) => { r.avaliacao_2026_11.sustento_chegou.nota = 'api_key: sk_live_abcdefgh12345678'; }
};
let apanhados = 0;
for (const [nome, f] of Object.entries(estragos)) {
  let falhou = false;
  try { verificar(estragar(f)); } catch { falhou = true; }
  assert.ok(falhou, `estrago não apanhado: ${nome}`);
  apanhados++;
}
console.log(`suficiencia: OK, resultado ${JSON.parse(original).avaliacao_2026_11.resultado}, ${apanhados} estragos propositados apanhados`);

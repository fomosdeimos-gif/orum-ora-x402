// Verifica presenca/leitura-pagadores-2026-11-15.json: só diz o que foi lido, não classifica, não promete, e os números batem.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-f]{64}$/;
function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.format, 'orum-presenca-leitura-pagadores/v1');
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(/Unum: "Eu autorizo"/.test(t.autorizacao), 'falta a citação da autorização');
  assert.equal(t.pagadores.length, 3);
  assert.equal(new Set(t.pagadores.map((p) => p.endereco)).size, 3, 'pagadores repetidos');
  for (const p of t.pagadores) { assert.match(p.endereco, ADDR); assert.ok(p.linhas > 0 && p.bytes_codigo > 0); }
  assert.equal(t.pagadores.reduce((s, p) => s + p.linhas, 0), t.total_linhas, 'as linhas não somam o total');
  assert.equal(t.total_linhas, 191);
  assert.equal(Math.round(t.pagadores.reduce((s, p) => s + p.usdc, 0) * 1e6), 115132, 'os USDC não somam o lido na base');
  assert.equal(t.verificado.todos_contratos, true);
  assert.ok(t.verificado.amostra.length >= 3);
  for (const a of t.verificado.amostra) {
    assert.match(a.tx, TX); assert.match(a.bundler, ADDR);
    assert.ok(a.senders_userop.length >= 1 && a.senders_userop.every((s) => ADDR.test(s)), 'sender inválido');
  }
  const sagrada = '0xfed69e8ee87a1f0fbbf8409ab654fc51832cdee5';
  const comSagrada = t.verificado.amostra.filter((a) => a.senders_userop.includes(sagrada)).length;
  assert.ok(t.verificado.sagrada_antiga_e_sender.startsWith(`em ${comSagrada} de ${t.verificado.amostra.length} `), 'a contagem do sender não bate com a amostra');
  // A leitura é um indício, não prova, e a classificação é de Unum.
  assert.equal(t.classificacao_proposta, null, 'a ORA não classifica');
  assert.equal(t.truth_machine.classifica, false);
  assert.match(t.leitura_da_ora, /não é prova/);
  assert.match(t.leitura_da_ora, /Classificar é de Unum/);
  assert.ok(Array.isArray(t.nao_verificado) && t.nao_verificado.length >= 3, 'tem de dizer o que não verificou');
  for (const k of ['receita', 'procura', 'adopção', 'valor']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  for (const k of ['promete_receita', 'move_fundos']) assert.equal(t.truth_machine[k], false);
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno)/i.test(txt), 'texto com promessa');
  assert.ok(!/receita externa confirmada\b(?! )/i.test(t.leitura_da_ora) || /não/.test(t.leitura_da_ora));
}
const txt = fs.readFileSync('presenca/leitura-pagadores-2026-11-15.json', 'utf8');
verificar(txt);
const j = () => JSON.parse(txt);
const estragos = {
  'schema errado': (t) => { t.format = 'x'; },
  'sem citação': (t) => { t.autorizacao = 'sem palavra'; },
  'pagador repetido': (t) => { t.pagadores[1].endereco = t.pagadores[0].endereco; },
  'endereço inválido': (t) => { t.pagadores[0].endereco = '0x12'; },
  'linhas não somam': (t) => { t.pagadores[0].linhas = 100; },
  'usdc não soma': (t) => { t.pagadores[1].usdc = 9; },
  'não são contratos': (t) => { t.verificado.todos_contratos = false; },
  'tx inválida': (t) => { t.verificado.amostra[0].tx = '0x12'; },
  'sender inválido': (t) => { t.verificado.amostra[0].senders_userop = ['x']; },
  'contagem do sender errada': (t) => { t.verificado.sagrada_antiga_e_sender = t.verificado.sagrada_antiga_e_sender.replace('em 6 de 6', 'em 5 de 6'); },
  'a ORA classifica': (t) => { t.classificacao_proposta = 'interno'; },
  'classifica a true': (t) => { t.truth_machine.classifica = true; },
  'diz prova': (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('não é prova', 'é prova'); },
  'sem Unum classifica': (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('Classificar é de Unum', 'Classificado'); },
  'sem não-verificado': (t) => { t.nao_verificado = []; },
  'nao_afirma sem receita': (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'receita'); },
  'promete receita': (t) => { t.truth_machine.promete_receita = true; },
  'move fundos': (t) => { t.truth_machine.move_fundos = true; },
  'promessa no texto': (t) => { t.leitura_da_ora += ' Vai valorizar.'; },
};
let n = 0;
for (const [nome, f] of Object.entries(estragos)) {
  const t = j(); f(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  n++;
}
console.log(JSON.stringify({ verified: true, ok: true, leitura: 'pagadores-2026-11-15', estragos_apanhados: n }));

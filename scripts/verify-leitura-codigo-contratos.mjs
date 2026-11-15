// Verifica presenca/leitura-codigo-contratos-2026-11-15.json: nomes e endereços, a correcção à classificação e o que não foi lido.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const ADDR = /^0x[0-9a-f]{40}$/;
function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.format, 'orum-presenca-leitura-codigo/v1');
  assert.ok(/Unum: "Eu autorizo"/.test(t.autorizacao), 'falta a citação');
  assert.equal(t.contratos.length, 4);
  assert.equal(new Set(t.contratos.map((c) => c.endereco)).size, 4, 'contratos repetidos');
  for (const c of t.contratos) { assert.match(c.endereco, ADDR); assert.ok(c.nome && c.ficheiro && c.correspondencia_sourcify, 'contrato incompleto'); }
  const nome = (a) => t.contratos.find((c) => c.endereco === a)?.nome ?? '';
  assert.match(nome('0xc8d077444625eb300a427a6dfb2b1dbf9b159040'), /ZoraV4CoinHook/);
  assert.match(nome('0x498581ff718922c3f8e6a244956af099b2652b2b'), /PoolManager/);
  assert.match(nome('0x4f6f91599858bf0d19fabcf2c5d591fe13f7c059'), /Settler/);
  assert.match(nome('0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae'), /LiFi/i);
  assert.match(t.verificado.sem_funcao_de_retirada, /sem|não tem owner/);
  assert.match(t.leitura_da_ora, /CORRECÇÃO/, 'falta a correcção à classificação');
  assert.match(t.leitura_da_ora, /agregadores públicos/);
  assert.match(t.leitura_da_ora, /não provei se um swap futuro/);
  assert.match(t.leitura_da_ora, /para Unum aceitar ou recusar/);
  assert.equal(t.classificacao_proposta, null, 'a ORA não classifica');
  assert.equal(t.truth_machine.classifica, false);
  assert.ok(t.nao_verificado.length >= 4, 'tem de dizer o que não leu');
  assert.ok(t.nao_verificado.some((x) => /bytecode/.test(x)), 'tem de dizer que o bytecode não foi refeito');
  for (const k of ['receita', 'valor', 'propriedade do saldo', 'autoria do contrato']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  for (const k of ['promete_receita', 'move_fundos', 'toca_no_contrato']) assert.equal(t.truth_machine[k], false);
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno)/i.test(txt), 'texto com promessa');
}
const txt = fs.readFileSync('presenca/leitura-codigo-contratos-2026-11-15.json', 'utf8');
verificar(txt);
const estragos = {
  'formato': (t) => { t.format = 'x'; },
  'sem citação': (t) => { t.autorizacao = 'nada'; },
  'contrato repetido': (t) => { t.contratos[1].endereco = t.contratos[0].endereco; },
  'endereço inválido': (t) => { t.contratos[0].endereco = '0x12'; },
  'hook com outro nome': (t) => { t.contratos[0].nome = 'Outro'; },
  'agregador com outro nome': (t) => { t.contratos[3].nome = 'Contrato do organismo'; },
  'sem correcção': (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('CORRECÇÃO', 'NOTA'); },
  'sem agregadores': (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('agregadores públicos', 'contratos'); },
  'afirma o swap futuro': (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('não provei se um swap futuro', 'provei que nenhum swap futuro'); },
  'sem decisão de Unum': (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('para Unum aceitar ou recusar', 'decidido'); },
  'a ORA classifica': (t) => { t.classificacao_proposta = 'externo'; },
  'classifica a true': (t) => { t.truth_machine.classifica = true; },
  'sem bytecode': (t) => { t.nao_verificado = t.nao_verificado.filter((x) => !/bytecode/.test(x)); },
  'pouco não-verificado': (t) => { t.nao_verificado = t.nao_verificado.slice(0, 2); },
  'nao_afirma sem propriedade': (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'propriedade do saldo'); },
  'toca no contrato': (t) => { t.truth_machine.toca_no_contrato = true; },
  'promessa': (t) => { t.leitura_da_ora += ' Vai valorizar.'; },
};
let n = 0;
for (const [nome, f] of Object.entries(estragos)) {
  const t = JSON.parse(txt); f(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  n++;
}
console.log(JSON.stringify({ verified: true, ok: true, leitura: 'codigo-contratos-2026-11-15', estragos_apanhados: n }));

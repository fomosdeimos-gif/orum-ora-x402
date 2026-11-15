// Verifica presenca/leitura-contrato-c8d0-2026-11-15.json: os totais fecham, a leitura não afirma propriedade e diz o que não leu.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const ADDR = /^0x[0-9a-f]{40}$/;
const r6 = (x) => Math.round(x * 1e6);
function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.format, 'orum-presenca-leitura-contrato/v1');
  assert.match(t.contrato, ADDR);
  assert.ok(/Unum: "Eu autorizo"/.test(t.autorizacao), 'falta a citação');
  const v = t.verificado, e = v.entradas, s = v.saidas;
  assert.equal(r6(e.usdc - s.usdc), r6(t.verificado.diferenca_na_janela_usdc), 'a diferença não bate com entradas menos saídas');
  assert.equal(e.transferencias_da_origem_principal + e.outra_origem.transferencias, e.transferencias, 'as entradas não somam');
  assert.equal(s.para_sagrada_antiga.transferencias + s.para_outros.transferencias, s.transferencias, 'as saídas não somam');
  assert.equal(r6(s.para_sagrada_antiga.usdc + s.para_outros.usdc), r6(s.usdc), 'os USDC das saídas não somam');
  assert.match(e.origem_principal, ADDR); assert.match(e.outra_origem.endereco, ADDR);
  for (const d of v.maiores_destinatarios) assert.match(d.endereco, ADDR);
  assert.ok(v.saldo_usdc_hoje > 0 && v.saldo_usdc_no_bloco_51500000 > 0);
  assert.ok(Math.abs(v.saldo_usdc_hoje - v.saldo_usdc_no_bloco_51500000) < 0.00001, 'o saldo mudou desde o bloco 51500000');
  assert.ok(t.janela.bloco_inicial < t.janela.bloco_final);
  assert.ok(Array.isArray(t.nao_verificado) && t.nao_verificado.length >= 3, 'tem de dizer o que não leu');
  for (const k of ['receita', 'valor', 'propriedade do saldo', 'autoria do contrato']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  for (const k of ['promete_receita', 'move_fundos', 'toca_no_contrato']) assert.equal(t.truth_machine[k], false);
  assert.match(t.leitura_da_ora, /Não sei se o remanescente é do organismo ou de terceiros/);
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno)/i.test(txt), 'texto com promessa');
  assert.ok(!/(é do organismo|é de Unum|pertence a Unum)\b/i.test(t.leitura_da_ora.replace(/Não sei se o remanescente é do organismo/, '')), 'afirma propriedade do saldo');
}
const txt = fs.readFileSync('presenca/leitura-contrato-c8d0-2026-11-15.json', 'utf8');
verificar(txt);
const estragos = {
  'formato': (t) => { t.format = 'x'; },
  'sem citação': (t) => { t.autorizacao = 'nada'; },
  'diferença errada': (t) => { t.verificado.diferenca_na_janela_usdc = 5; },
  'entradas não somam': (t) => { t.verificado.entradas.transferencias += 1; },
  'saídas não somam': (t) => { t.verificado.saidas.para_outros.transferencias += 1; },
  'usdc das saídas': (t) => { t.verificado.saidas.para_outros.usdc += 1; },
  'endereço inválido': (t) => { t.verificado.entradas.origem_principal = '0x12'; },
  'saldo mudou': (t) => { t.verificado.saldo_usdc_no_bloco_51500000 = 1; },
  'janela invertida': (t) => { t.janela.bloco_inicial = 99999999; },
  'sem não-verificado': (t) => { t.nao_verificado = []; },
  'nao_afirma sem propriedade': (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'propriedade do saldo'); },
  'toca no contrato': (t) => { t.truth_machine.toca_no_contrato = true; },
  'move fundos': (t) => { t.truth_machine.move_fundos = true; },
  'afirma propriedade': (t) => { t.leitura_da_ora += ' O saldo é de Unum.'; },
  'promessa': (t) => { t.leitura_da_ora += ' Vai valorizar.'; },
};
let n = 0;
for (const [nome, f] of Object.entries(estragos)) {
  const t = JSON.parse(txt); f(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  n++;
}
console.log(JSON.stringify({ verified: true, ok: true, leitura: 'contrato-c8d0-2026-11-15', estragos_apanhados: n }));

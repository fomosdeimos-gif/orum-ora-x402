// Verifica token/moedas-de-unum-2026-11-01.json: o registo das moedas que Unum disse ter criado (Base), lidas só em leitura.
// A autoria é palavra de Unum e não pode aparecer como provada; só entra em "lido" o que tem duas ou mais fontes iguais;
// nada promete preço, liquidez, procura nem receita. Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-f]{40}$/;
const DADOS_POR_UNUM = { 'Marsisnotthere': '0xae4c774c4b079b22cce2ef3256a367c5ed4bff27', 'Good reason': '0xd0b65efc56a7eba86a89d79eb585d0a6a0fc6d01' };
function verificar(txt, internos) {
  const t = JSON.parse(txt);
  assert.equal(t.schema, 'orum-moedas-de-unum/v1');
  assert.equal(t.rede?.chain_id, 8453);
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(t.carteira_lida, ADDR);
  assert.ok(JSON.parse(internos).base.some((x) => x.endereco.toLowerCase() === t.carteira_lida), 'a carteira lida tem de estar classificada interna em economia/enderecos-internos.json');
  assert.ok(Array.isArray(t.fontes_rpc) && new Set(t.fontes_rpc).size >= 2, 'precisa de duas fontes distintas');
  assert.match(t.palavra_de_unum, /Eu criei estes tokens/);
  assert.ok(Array.isArray(t.moedas) && t.moedas.length === 5, 'esperavam-se as 5 moedas');
  const vistos = new Set();
  for (const m of t.moedas) {
    assert.match(m.contrato, ADDR); assert.ok(!vistos.has(m.contrato), `contrato repetido ${m.contrato}`); vistos.add(m.contrato);
    assert.match(m.autoria, /palavra de Unum/, `a autoria de ${m.nome_dito_por_unum} tem de dizer que é palavra de Unum`);
    assert.ok(!/prova|provad/i.test(m.autoria.replace(/não a prova/i, '')), 'a autoria não pode aparecer provada');
    const l = m.lido;
    assert.equal(l.decimals, 18, `decimals de ${m.nome_dito_por_unum}`);
    assert.match(l.total_supply_raw, /^[1-9]\d*$/); assert.match(l.saldo_da_carteira_raw, /^\d+$/);
    assert.ok(BigInt(l.saldo_da_carteira_raw) <= BigInt(l.total_supply_raw), `saldo maior que a oferta em ${m.nome_dito_por_unum}`);
    assert.ok(l.bytecode && Number.isInteger(l.bytecode.bytes), 'bytecode lido');
    if (l.bytecode.tipo === 'clone mínimo EIP-1167') { assert.equal(l.bytecode.bytes, 45); assert.match(l.bytecode.implementacao, ADDR); } else assert.equal(l.bytecode.implementacao, null, 'só um clone EIP-1167 tem implementação dita');
    assert.ok(Array.isArray(m.nao_verificado), 'cada moeda diz o que não verificou');
    const lidoTxt = JSON.stringify(l).toLowerCase(); for (const w of ['preço', 'price', 'liquidez', 'detentores', 'owner"', 'payout']) assert.ok(!lidoTxt.includes(w), `"lido" não pode afirmar ${w}`);
    if (m.metadados_do_uri) assert.match(m.metadados_do_uri.fonte, /não verificada/, 'o URI vem de uma só fonte');
  }
  for (const [nome, end] of Object.entries(DADOS_POR_UNUM)) assert.ok(t.moedas.some((m) => m.nome_dito_por_unum === nome && m.contrato === end), `${nome} tem de ter o endereço que Unum deu`);
  assert.ok(Array.isArray(t.nao_verificado) && t.nao_verificado.length >= 3 && t.nao_verificado.some((x) => /quem criou/.test(x)), 'tem de dizer o que não verificou, incluindo a autoria');
  for (const k of ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  for (const k of ['move_fundos', 'escreve_na_cadeia', 'promete_receita', 'prova_autoria', 'classifica']) assert.equal(t.truth_machine?.[k], false, `truth_machine.${k} tem de ser false`);
}

const real = fs.readFileSync('token/moedas-de-unum-2026-11-01.json', 'utf8');
const internos = fs.readFileSync('economia/enderecos-internos.json', 'utf8');
verificar(real, internos);
const mexer = (fn) => { const t = JSON.parse(real); fn(t); return JSON.stringify(t, null, 2); };
const estragos = [
  ['autoria dada como provada', mexer((t) => { t.moedas[0].autoria = 'provada pela cadeia'; })],
  ['autoria sem dizer que é palavra de Unum', mexer((t) => { t.moedas[1].autoria = 'criada por Unum'; })],
  ['endereço de Marsisnotthere trocado', mexer((t) => { t.moedas[3].contrato = '0xae4c774c4b079b22cce2ef3256a367c5ed4bff28'; })],
  ['contrato repetido', mexer((t) => { t.moedas[4].contrato = t.moedas[0].contrato; })],
  ['só quatro moedas', mexer((t) => { t.moedas.pop(); })],
  ['saldo maior que a oferta', mexer((t) => { t.moedas[2].lido.saldo_da_carteira_raw = t.moedas[2].lido.total_supply_raw + '0'; })],
  ['decimais trocados', mexer((t) => { t.moedas[0].lido.decimals = 6; })],
  ['preço dentro de "lido"', mexer((t) => { t.moedas[1].lido.price_usd = '1,00'; })],
  ['clone sem implementação', mexer((t) => { t.moedas[1].lido.bytecode.implementacao = null; })],
  ['implementação inventada num bytecode que não é clone', mexer((t) => { t.moedas[3].lido.bytecode.implementacao = '0x7cad62748ddf516cf85bc2c05c14786d84cf861c'; })],
  ['uma só fonte RPC', mexer((t) => { t.fontes_rpc = [t.fontes_rpc[0]]; })],
  ['carteira lida fora da lista interna', mexer((t) => { t.carteira_lida = '0x0000000000000000000000000000000000000001'; })],
  ['deixa de dizer que a autoria não está verificada', mexer((t) => { t.nao_verificado = t.nao_verificado.filter((x) => !/quem criou/.test(x)); })],
  ['deixa de recusar o preço', mexer((t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'preço'); })],
  ['diz que prova a autoria', mexer((t) => { t.truth_machine.prova_autoria = true; })],
  ['diz que move fundos', mexer((t) => { t.truth_machine.move_fundos = true; })],
  ['metadados do URI dados como verificados', mexer((t) => { t.moedas[1].metadados_do_uri.fonte = 'verificada em duas fontes'; })],
  ['perde a palavra de Unum', mexer((t) => { t.palavra_de_unum = 'criadas pela ORA'; })],
];
let apanhados = 0;
for (const [nome, estragado] of estragos) {
  assert.notEqual(estragado, JSON.stringify(JSON.parse(real), null, 2), `o estrago "${nome}" não alterou nada`);
  assert.throws(() => verificar(estragado, internos), undefined, `estrago não apanhado: ${nome}`); apanhados++;
}
assert.throws(() => verificar(real, JSON.stringify({ base: [] })), undefined, 'estrago não apanhado: lista interna sem a carteira'); apanhados++;
console.log(`moedas-unum: 5 moedas conferidas; ${apanhados} estragos propositados apanhados.`);

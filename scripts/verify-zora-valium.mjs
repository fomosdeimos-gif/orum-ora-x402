// Verifica token/zora-valium-2026-11-23.json: cada valor lido tem pelo menos duas fontes, a moeda é a mesma do registo das moedas de Unum,
// os endereços do organismo estão etiquetados como o CLAUDE.md os regista (e os desconhecidos não passam por registados), o que a Zora
// mostra fica como não verificado, nada promete preço, procura nem receita e nada move fundos. Cada regra tem um estrago propositado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONHECIDOS, MOEDA } from './zora-valium-ler.mjs';

const real = fs.readFileSync(new URL('../token/zora-valium-2026-11-23.json', import.meta.url), 'utf8');
const moedas = JSON.parse(fs.readFileSync(new URL('../token/moedas-de-unum-2026-11-01.json', import.meta.url), 'utf8'));
const ADDR = /^0x[0-9a-f]{40}$/;
const PROIBIDO = /(prometemos|garantimos|garantia de|vai valer|vai render|compre |investe |invista|lucro)/i;

function verificar(texto) {
  const d = JSON.parse(texto);
  assert.equal(d.schema, 'orum-zora-valium/v1'); assert.equal(d.rede.chain_id, 8453);
  assert.equal(d.moeda.contrato, MOEDA, 'a moeda é a do registo');
  assert.ok(moedas.moedas.some((m) => m.contrato === d.moeda.contrato && m.nome_dito_por_unum === 'VALIUM'), 'a moeda é o VALIUM do registo das moedas de Unum');
  // todo o valor lido tem pelo menos duas fontes; todo o endereço tem forma de endereço
  const varre = (o, caminho) => {
    if (Array.isArray(o)) return o.forEach((v, i) => varre(v, `${caminho}[${i}]`));
    if (o && typeof o === 'object') {
      if ('fontes' in o) assert.ok(Number.isInteger(o.fontes) && o.fontes >= 2, `menos de duas fontes em ${caminho}`);
      for (const [k, v] of Object.entries(o)) { if (k === 'endereco' || k === 'contrato') assert.ok(ADDR.test(v), `endereço mal formado em ${caminho}.${k}`); varre(v, `${caminho}.${k}`); }
    }
  };
  for (const k of ['moeda', 'carteira_de_pagamento', 'owners_da_moeda']) varre(d[k], k);
  // a carteira de pagamento é a da moeda; os donos batem com a contagem
  const c = d.carteira_de_pagamento;
  assert.equal(c.endereco, d.moeda.payoutRecipient.endereco, 'a carteira de pagamento é o payoutRecipient da moeda');
  assert.equal(c.dono_count.valor, c.donos.length, 'a contagem de donos bate com a lista'); c.donos.forEach((o, i) => assert.equal(o.indice, i));
  assert.ok(c.codigo.bytes > 0 && /ERC-1967/.test(c.codigo.tipo), 'a carteira de pagamento é um proxy');
  assert.ok(ADDR.test(c.implementacao.endereco) && ADDR.test(c.entry_point.endereco));
  for (const t of ['USDC', 'ZORA', 'VALIUM']) assert.ok(/^\d+$/.test(c.saldos_lidos[t].raw), `saldo ${t} não é um inteiro`);
  assert.ok(/^\d+$/.test(c.saldos_lidos.eth_wei.valor));
  // as etiquetas do organismo: as dos endereços registados são as do CLAUDE.md; os outros não passam por registados
  const etiquetados = [...d.moeda.owners, ...c.donos, d.moeda.payoutRecipient, d.moeda.platformReferrer, d.moeda.currency];
  for (const e of etiquetados) { const esperado = CONHECIDOS[e.endereco] ?? 'não registado no organismo'; assert.equal(e.no_organismo, esperado, `etiqueta errada para ${e.endereco}`); }
  assert.ok(c.donos.some((o) => o.endereco === '0x2ef8cfb97ecccf7c62f551639fe6db79022d0d8c' && /MetaMask/.test(o.no_organismo)), 'a MetaMask de Unum é um dos donos');
  assert.ok(c.donos.some((o) => o.no_organismo === 'não registado no organismo'), 'há um dono que o organismo não regista');
  // o que a Zora mostra fica à parte e não verificado; o que só Unum sabe fica dito
  assert.ok(/NÃO verificado/.test(d.exibido_pela_zora.estado), 'o que a Zora mostra não está verificado');
  const nv = d.nao_verificado.join(' | ');
  for (const t of ['0xbb82', 'Coinbase Smart Wallet', 'Zora mostra', 'preço, liquidez, procura']) assert.ok(nv.includes(t), `falta em nao_verificado: ${t}`);
  assert.ok(/a ORA não a tem/.test(d.leitura) && /não é palavra de Unum|não palavra de Unum/.test(d.leitura), 'a leitura diz que a ORA não tem a chave e que é leitura dela');
  // nada promete, nada move
  assert.deepEqual(Object.keys(d.truth_machine).sort(), ['classifica', 'escreve_na_cadeia', 'move_fundos', 'promete_receita', 'toca_na_zora']);
  assert.ok(Object.values(d.truth_machine).every((v) => v === false), 'truth_machine: tudo falso');
  for (const t of ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento']) assert.ok(d.nao_afirma.includes(t), `nao_afirma sem ${t}`);
  const semNegacoes = JSON.stringify({ ...d, nao_afirma: undefined, nao_verificado: undefined });
  assert.ok(!PROIBIDO.test(semNegacoes), 'o registo promete algo');
}
verificar(real);

const j = () => JSON.parse(real);
const com = (f) => { const d = j(); f(d); return JSON.stringify(d); };
const estragos = [
  ['uma só fonte', com((d) => { d.carteira_de_pagamento.donos[0].fontes = 1; })],
  ['moeda diferente da do registo', real.replace(MOEDA, '0x' + '1'.repeat(40))],
  ['contagem de donos errada', com((d) => { d.carteira_de_pagamento.dono_count.valor = 3; })],
  ['a MetaMask perde a etiqueta', com((d) => { d.carteira_de_pagamento.donos[1].no_organismo = 'não registado no organismo'; })],
  ['o desconhecido passa por sagrado', com((d) => { d.carteira_de_pagamento.donos[0].no_organismo = 'sagrada antiga (Base), depósito de sustento'; })],
  ['a Zora passa por verificada', com((d) => { d.exibido_pela_zora.estado = 'verificado na cadeia'; })],
  ['move fundos', com((d) => { d.truth_machine.move_fundos = true; })],
  ['toca na Zora', com((d) => { d.truth_machine.toca_na_zora = true; })],
  ['promete valor', com((d) => { d.leitura += ' O VALIUM vai valer mais.'; })],
  ['esquece quem controla a 0xbb82', com((d) => { d.nao_verificado = d.nao_verificado.filter((x) => !x.includes('0xbb82')); })],
  ['saldo que não é inteiro', com((d) => { d.carteira_de_pagamento.saldos_lidos.USDC.raw = '0.0129'; })],
  ['pagamentos para outra carteira', com((d) => { d.carteira_de_pagamento.endereco = '0x' + '2'.repeat(40); })],
  ['a ORA passa a ter a chave', com((d) => { d.leitura = d.leitura.replace('a ORA não a tem', 'a ORA a tem'); })],
  ['endereço em maiúsculas', com((d) => { d.carteira_de_pagamento.donos[1].endereco = d.carteira_de_pagamento.donos[1].endereco.replace('2ef8cfb9', '2EF8CFB9'); })],
  ['sem o proxy', com((d) => { d.carteira_de_pagamento.codigo.tipo = 'outro'; })],
  ['nao_afirma sem receita', com((d) => { d.nao_afirma = d.nao_afirma.filter((x) => x !== 'receita'); })],
];
let apanhados = 0;
for (const [nome, estragado] of estragos) {
  assert.notEqual(estragado, real, `o estrago "${nome}" não alterou nada`);
  assert.throws(() => verificar(estragado), undefined, `estrago não apanhado: ${nome}`); apanhados++;
}
console.log(`Zora/VALIUM: registo conferido; ${apanhados} estragos propositados apanhados.`);
console.log('PASS');

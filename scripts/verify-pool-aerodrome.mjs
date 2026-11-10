// Verifica token/pool-aerodrome-valium-usdc-2026-11-10.json: a leitura do pool valium/USDC da Aerodrome (só leitura).
// Refaz com BigInt as contas (preço, venda de 1 000 000 valium), cruza o USDC com o do executor e o valium com o de moedas-de-unum,
// e recusa texto que prometa, que dê por lido o que não foi lido ou que apresente a leitura como palavra de Unum.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const usdcDoExecutor = fs.readFileSync('supabase/functions/ora-operational-wallet/payments.mjs', 'utf8').match(/export const TOKEN='(0x[0-9a-fA-F]{40})'/)[1].toLowerCase();
const moedas = JSON.parse(fs.readFileSync('token/moedas-de-unum-2026-11-01.json', 'utf8'));
const valium = moedas.moedas.find((m) => m.nome_dito_por_unum === 'VALIUM').contrato.toLowerCase();
const adenda = JSON.parse(fs.readFileSync('economia/adenda-limite-troca.json', 'utf8'));

function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.schema, 'orum-pool-leitura/v1');
  assert.equal(t.rede.chain_id, 8453);
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(t.pool, ADDR);
  assert.ok(Number.isInteger(t.bloco_lido) && t.bloco_lido > 0);
  assert.ok(Array.isArray(t.fontes_rpc) && new Set(t.fontes_rpc).size >= 2, 'precisa de duas fontes distintas');
  assert.equal(t.concordam_nas_fontes, true, 'as fontes têm de concordar para o valor contar como lido');
  for (const f of t.fontes_rpc) assert.ok(t.cabecas_das_fontes[f] >= t.bloco_lido, `a fonte ${f} não tinha o bloco lido`);
  const l = t.lido;
  // O que é o pool.
  assert.equal(l.codigo.bytes, 45);
  assert.match(l.codigo.tipo, /^clone mínimo EIP-1167/);
  assert.match(l.codigo.implementacao, ADDR);
  assert.equal(l.token0.contrato.toLowerCase(), valium, 'token0 não é o valium de moedas-de-unum');
  assert.equal(l.token1.contrato.toLowerCase(), usdcDoExecutor, 'token1 não é o USDC do executor');
  assert.ok(BigInt(l.token0.contrato) < BigInt(l.token1.contrato), 'token0 tem de ser o de endereço menor (ordem do pool)');
  assert.equal(l.token0.decimals, 18);
  assert.equal(l.token1.decimals, 6);
  assert.equal(l.stable, false);
  assert.equal(l.fabrica.isPool, true, 'a fábrica tem de reconhecer o pool');
  assert.match(l.fabrica.contrato, ADDR);
  assert.ok(Number.isInteger(l.fabrica.getFee) && l.fabrica.getFee > 0 && l.fabrica.getFee < 1000, 'comissão fora do intervalo plausível');
  // Reservas e saldos: o pool tem em saldo o que diz ter em reserva.
  const r0 = BigInt(l.reservas_raw.token0), r1 = BigInt(l.reservas_raw.token1);
  assert.ok(r0 > 0n && r1 > 0n, 'reservas vazias');
  assert.equal(BigInt(l.saldos_do_pool_raw.token0), r0, 'saldo de token0 diferente da reserva');
  assert.equal(BigInt(l.saldos_do_pool_raw.token1), r1, 'saldo de token1 diferente da reserva');
  assert.ok(BigInt(l.lp_total_supply_raw) > 0n);
  // Contas derivadas, refeitas.
  const d = t.derivado;
  assert.equal(d.estado, 'estimativa');
  const preco = Number(r1) / 1e6 / (Number(r0) / 1e18);
  assert.ok(Math.abs(d.preco_usdc_por_valium - preco) / preco < 1e-9, 'preço derivado mal calculado');
  const v = d.venda_de_1000000_valium;
  assert.equal(v.fee_usado, l.fabrica.getFee, 'a venda usa uma comissão diferente da lida');
  const entrada = 10n ** 6n * 10n ** 18n;
  const comComissao = (entrada * BigInt(10000 - v.fee_usado)) / 10000n;
  const saida = (r1 * comComissao) / (r0 + comComissao);
  assert.equal(BigInt(v.usdc_raw), saida, 'saída da venda mal calculada');
  assert.ok(Math.abs(v.usdc - Number(saida) / 1e6) < 1e-9);
  assert.ok(Math.abs(v.a_preco_spot_usdc - 1_000_000 * preco) < 1e-6, 'preço spot da venda mal calculado');
  const perda = 100 * (1 - v.usdc / v.a_preco_spot_usdc);
  assert.ok(Math.abs(v.perda_para_o_spot_percent - perda) < 0.01, 'perda para o spot mal calculada');
  assert.match(d.nota, /não é cotação do router/);
  // Cabe no tecto da adenda?
  assert.ok(v.usdc <= adenda.limite.valor_em_vigor, 'a venda estimada já não cabe no tecto da adenda: rever o texto');
  // Honestidade.
  assert.ok(t.bloqueado.length >= 1 && t.bloqueado.join(' ').includes('eventos'), 'tem de dizer o que ficou bloqueado');
  const nv = t.nao_verificado.join(' ');
  for (const w of ['unidade da comissão', 'fábrica oficial', 'router', 'approve']) assert.ok(nv.includes(w), `nao_verificado tem de dizer ${w}`);
  assert.ok(t.para_a_accao_b.falta_ler_ou_decidir.join(' ').includes('approve limitado'), 'tem de dizer que falta o approve limitado');
  for (const k of ['move_fundos', 'paga', 'assina', 'altera_executor', 'promete_receita']) assert.equal(t.truth_machine[k], false, `truth_machine.${k} tem de ser false`);
  assert.equal(t.truth_machine.so_leitura, true);
  for (const k of ['que o pool tenha procura', 'preço verificado', 'que a venda funcione', 'receita', 'que o executor possa vender']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.match(t.leitura_da_ora, /^Leitura, não palavra de Unum/, 'a leitura da ORA tem de dizer que é leitura');
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro)/i.test(txt), 'texto com promessa');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('token/pool-aerodrome-valium-usdc-2026-11-10.json', 'utf8');
verificar(txt);

const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  return 1;
};
let n = 0;
n += rejeita('uma só fonte', (t) => { t.fontes_rpc = ['mainnet.base.org']; });
n += rejeita('fontes repetidas', (t) => { t.fontes_rpc = ['mainnet.base.org', 'mainnet.base.org']; });
n += rejeita('as fontes não concordam', (t) => { t.concordam_nas_fontes = false; });
n += rejeita('fonte sem o bloco lido', (t) => { t.cabecas_das_fontes['1rpc.io'] = 1; });
n += rejeita('token0 trocado', (t) => { t.lido.token0.contrato = '0x0000000000000000000000000000000000000001'; });
n += rejeita('USDC trocado', (t) => { t.lido.token1.contrato = '0xffffffffffffffffffffffffffffffffffffffff'; });
n += rejeita('ordem dos tokens trocada', (t) => { const a = t.lido.token0; t.lido.token0 = t.lido.token1; t.lido.token1 = a; });
n += rejeita('casas decimais do USDC erradas', (t) => { t.lido.token1.decimals = 18; });
n += rejeita('pool estável', (t) => { t.lido.stable = true; });
n += rejeita('fábrica não reconhece o pool', (t) => { t.lido.fabrica.isPool = false; });
n += rejeita('código que não é clone', (t) => { t.lido.codigo.tipo = 'contrato completo'; });
n += rejeita('reserva diferente do saldo', (t) => { t.lido.saldos_do_pool_raw.token1 = '978565'; });
n += rejeita('reservas vazias', (t) => { t.lido.reservas_raw.token0 = '0'; t.lido.saldos_do_pool_raw.token0 = '0'; });
n += rejeita('comissão implausível', (t) => { t.lido.fabrica.getFee = 5000; });
n += rejeita('preço derivado errado', (t) => { t.derivado.preco_usdc_por_valium = 0.5; });
n += rejeita('venda com comissão diferente da lida', (t) => { t.derivado.venda_de_1000000_valium.fee_usado = 1; });
n += rejeita('saída da venda errada', (t) => { t.derivado.venda_de_1000000_valium.usdc_raw = '2000000'; t.derivado.venda_de_1000000_valium.usdc = 2; });
n += rejeita('perda para o spot mentida', (t) => { t.derivado.venda_de_1000000_valium.perda_para_o_spot_percent = 1; });
n += rejeita('estimativa passa a lida', (t) => { t.derivado.estado = 'lido'; });
n += rejeita('estimativa passa por cotação do router', (t) => { t.derivado.nota = 'cotação do router'; });
n += rejeita('esconde o que ficou bloqueado', (t) => { t.bloqueado = []; });
n += rejeita('esconde a unidade da comissão por verificar', (t) => { t.nao_verificado = t.nao_verificado.filter((x) => !x.includes('unidade da comissão')); });
n += rejeita('dá a fábrica por oficial', (t) => { t.nao_verificado = t.nao_verificado.filter((x) => !x.includes('fábrica oficial')); });
n += rejeita('esconde que falta o approve', (t) => { t.para_a_accao_b.falta_ler_ou_decidir = ['nada']; });
n += rejeita('move fundos', (t) => { t.truth_machine.move_fundos = true; });
n += rejeita('altera o executor', (t) => { t.truth_machine.altera_executor = true; });
n += rejeita('já não é só leitura', (t) => { t.truth_machine.so_leitura = false; });
n += rejeita('deixa de negar a procura', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'que o pool tenha procura'); });
n += rejeita('deixa de negar que o executor possa vender', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'que o executor possa vender'); });
n += rejeita('leitura da ORA passa por palavra de Unum', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('Leitura, não palavra de Unum.', 'Unum disse.'); });
n += rejeita('promessa de lucro', (t) => { t.leitura_da_ora += ' Vai dar lucro.'; });
n += rejeita('chave privada no texto', (t) => { t.objecto += ' 0x' + 'd'.repeat(64); });
console.log(`pool-aerodrome: leitura conferida; ${n} estragos propositados apanhados.`);

// Verifica economia/proposta-accao-venda-valium.json: o texto concreto da acção de venda de valium por USDC (caminho b).
// É uma proposta: nada implantado. O verificador refaz as contas (cotação, gás, limites), cruza as constantes com o executor, a adenda
// e as leituras anteriores, e falha se a acção aparecer no executor sem o estado da proposta mudar, ou se a adenda a aprovar antes da hora.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const lerJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pool = lerJson('token/pool-aerodrome-valium-usdc-2026-11-10.json');
const moedas = lerJson('token/moedas-de-unum-2026-11-01.json');
const adenda = lerJson('economia/adenda-limite-troca.json');
const core = fs.readFileSync('supabase/functions/ora-operational-wallet/core.mjs', 'utf8');
const pagamentos = fs.readFileSync('supabase/functions/ora-operational-wallet/payments.mjs', 'utf8');
const usdc = pagamentos.match(/export const TOKEN='(0x[0-9a-fA-F]{40})'/)[1].toLowerCase();
const origem = pagamentos.match(/export const SOURCE='(0x[0-9a-fA-F]{40})'/)[1].toLowerCase();
const valium = moedas.moedas.find((m) => m.nome_dito_por_unum === 'VALIUM').contrato.toLowerCase();
const accoesNoExecutor = [...core.match(/const allowed=\{(.*?)\};/s)[1].matchAll(/(\w+):\['action'/g)].map((m) => m[1]);
const NOMES = ['preview_sell_valium', 'sell_valium', 'sell_status'];
const r0 = BigInt(pool.lido.reservas_raw.token0), r1 = BigInt(pool.lido.reservas_raw.token1), fee = BigInt(pool.lido.fabrica.getFee);
const cotar = (valiumInteiros) => { const ain = (BigInt(valiumInteiros) * 10n ** 18n * (10000n - fee)) / 10000n; return (r1 * ain) / (r0 + ain); };

function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.schema, 'orum-proposta-accao-venda/v1');
  assert.equal(t.rede.chain_id, 8453);
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  // A palavra de Unum e o que cobre.
  assert.equal(t.escolha_de_unum.citacao, 'Eu autorizo b');
  assert.match(t.escolha_de_unum.cobre, /Não cobre implantar a acção no executor/);
  assert.match(t.escolha_de_unum.cobre, /nem executar nenhuma venda/);
  // Estado: proposta enquanto a acção não existir no executor e a adenda não a registar.
  const nasce = NOMES.filter((n) => accoesNoExecutor.includes(n));
  assert.ok(['proposta_a_aguardar_palavra', 'implantada'].includes(t.estado), 'estado desconhecido');
  if (t.estado === 'proposta_a_aguardar_palavra') {
    assert.equal(nasce.length, 0, `o executor já tem ${nasce}: o estado da proposta tem de mudar`);
    assert.equal(adenda.capacidade.accao_de_venda_aprovada, null, 'a adenda aprova uma acção que ainda é só proposta');
  } else {
    assert.equal(nasce.length, NOMES.length, 'o estado diz implantada mas o executor não tem as três acções');
    assert.ok(NOMES.includes(adenda.capacidade.accao_de_venda_aprovada), 'a adenda não regista a acção implantada');
  }
  // Leituras: duas fontes, router consistente com o pool lido antes.
  const l = t.leitura;
  assert.ok(new Set(l.fontes_rpc).size >= 2 && l.concordam_nas_fontes === true, 'precisa de duas fontes que concordem');
  assert.ok(l.bloco_lido > pool.bloco_lido, 'a leitura do router é posterior à do pool');
  assert.match(l.router.contrato, ADDR);
  assert.equal(l.router.defaultFactory.toLowerCase(), pool.lido.fabrica.contrato.toLowerCase(), 'a fábrica do router não é a do pool');
  assert.equal(l.router.poolFor_valium_usdc_volatil.toLowerCase(), pool.pool.toLowerCase(), 'o router calcula outro pool');
  assert.equal(BigInt(l.cotacao_do_router.usdc_raw), cotar(1_000_000), 'a cotação do router não bate com a fórmula');
  assert.equal(BigInt(l.cotacao_do_router.entrada_valium_raw), 10n ** 24n);
  const sim = l.simulacao_approve_e_swap;
  assert.equal(sim.approve.estado, 'ok');
  assert.equal(sim.swap.estado, 'ok');
  assert.equal(sim.swap_sem_approve, 'reverte');
  assert.equal(BigInt(sim.swap.usdc_raw), BigInt(l.cotacao_do_router.usdc_raw), 'a simulação deu outra saída');
  assert.equal(l.gas.gas_total_simulado, sim.approve.gas_usado + sim.swap.gas_usado, 'gás total mal somado');
  const custo = (l.gas.gas_total_simulado * l.gas.gas_price_wei) / 1e18;
  assert.ok(Math.abs(l.gas.custo_l2_eth - custo) < 1e-12, 'custo L2 mal calculado');
  assert.equal(l.gas.taxa_de_dados_l1, 'não medida');
  const co = l.conta_operacional;
  assert.equal(co.endereco.toLowerCase(), origem, 'a conta não é a SOURCE do executor');
  assert.equal(co.nonce, 0);
  assert.equal(co.allowance_do_router_raw, '0');
  assert.ok(BigInt(co.valium_raw) >= 10n ** 24n, 'a operacional já não tem 1 000 000 valium');
  const razao = Math.round(Number(co.eth_wei) / 1e18 / custo);
  assert.ok(t.o_que_a_leitura_prova.join(' ').includes(`cerca de ${razao} vezes`), `a razão ETH/custo no texto tem de ser ${razao}`);
  assert.ok(t.o_que_a_leitura_prova.join(' ').includes('nonce da operacional é 0'), 'falta o nonce 0');
  // A proposta.
  const p = t.proposta;
  assert.deepEqual(p.nome_das_accoes, NOMES);
  const c = p.constantes_no_codigo;
  assert.equal(c.token_vendido.toLowerCase(), valium);
  assert.equal(c.token_recebido.toLowerCase(), usdc);
  assert.equal(c.router.toLowerCase(), l.router.contrato.toLowerCase());
  assert.equal(c.fabrica.toLowerCase(), pool.lido.fabrica.contrato.toLowerCase());
  assert.equal(c.pool.toLowerCase(), pool.pool.toLowerCase());
  assert.match(c.destinatario_do_usdc, new RegExp(origem.slice(2), 'i'), 'o USDC tem de ficar na operacional');
  const m = p.limites;
  assert.equal(BigInt(m.primeiro_teste_usdc_cotado_raw), cotar(m.primeiro_teste_valium), 'cotação do primeiro teste mal calculada');
  assert.equal(BigInt(m.maximo_por_pedido_usdc_cotado_raw), cotar(m.maximo_por_pedido_valium), 'cotação do máximo mal calculada');
  assert.ok(m.primeiro_teste_valium < m.maximo_por_pedido_valium, 'o primeiro teste tem de ser menor do que o máximo');
  assert.ok(m.maximo_por_pedido_valium <= 1_000_000, 'o máximo ultrapassa o saldo da operacional');
  assert.equal(m.tecto_acumulado_usdc, adenda.limite.valor_em_vigor, 'o tecto não é o da adenda');
  assert.ok(m.maximo_por_pedido_usdc_cotado_raw <= m.tecto_acumulado_usdc * 1e6, 'o máximo por pedido ultrapassa o tecto');
  assert.ok(m.tolerancia_de_preco_percent > 0 && m.tolerancia_de_preco_percent <= 5, 'tolerância fora do intervalo');
  assert.ok(m.validade_em_segundos > 0 && m.validade_em_segundos <= 600);
  const comp = p.comportamento.join(' ');
  for (const w of ['nunca ilimitado', 'revoga o approve', 'recibo', 'um pedido por vez', 'tecto da adenda', 'só lê']) assert.ok(comp.includes(w), `comportamento tem de dizer ${w}`);
  assert.equal(p.ordem_proposta.length, 5);
  assert.match(p.ordem_proposta[4], /PALAVRA À PARTE/);
  assert.match(p.ordem_proposta[1], /bitcoin\.mjs/);
  assert.equal(p.palavras_pedidas.length, 2);
  // Honestidade.
  const nao = t.o_que_nao_cobre.join(' ');
  for (const w of ['comprar tokens', 'outro token', 'outro destino', 'ilimitadas', 'dívida e ponte']) assert.ok(nao.includes(w), `o_que_nao_cobre tem de dizer ${w}`);
  const riscos = t.riscos.join(' ');
  for (const w of ['primeira transacção', 'política da conta CDP', 'fiscais e legais', 'taxa de dados L1', 'minúsculo']) assert.ok(riscos.includes(w), `riscos tem de dizer ${w}`);
  assert.match(t.ganho_esperado, /centavos/);
  assert.ok(t.nao_verificado.length >= 4 && t.nao_verificado.join(' ').includes('política da conta'), 'tem de dizer o que não verificou');
  for (const k of ['move_fundos', 'paga', 'assina', 'altera_executor', 'implanta', 'promete_receita']) assert.equal(t.truth_machine[k], false, `truth_machine.${k} tem de ser false`);
  assert.equal(t.truth_machine.so_leitura, true);
  for (const k of ['que a venda funcione em produção', 'que haja procura', 'receita', 'que o executor possa vender hoje']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.match(t.leitura_da_ora, /^Leitura, não palavra de Unum/, 'a leitura da ORA tem de dizer que é leitura');
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro)/i.test(txt), 'texto com promessa');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('economia/proposta-accao-venda-valium.json', 'utf8');
verificar(txt);

const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  return 1;
};
let n = 0;
n += rejeita('citação trocada', (t) => { t.escolha_de_unum.citacao = 'Sim'; });
n += rejeita('a palavra passa a cobrir a implantação', (t) => { t.escolha_de_unum.cobre = 'Tudo, incluindo implantar.'; });
n += rejeita('estado de implantada sem a acção existir', (t) => { t.estado = 'implantada'; });
n += rejeita('estado inventado', (t) => { t.estado = 'aprovada'; });
n += rejeita('uma só fonte', (t) => { t.leitura.fontes_rpc = ['mainnet.base.org']; });
n += rejeita('fontes não concordam', (t) => { t.leitura.concordam_nas_fontes = false; });
n += rejeita('router de outra fábrica', (t) => { t.leitura.router.defaultFactory = '0x0000000000000000000000000000000000000001'; });
n += rejeita('router calcula outro pool', (t) => { t.leitura.router.poolFor_valium_usdc_volatil = '0x0000000000000000000000000000000000000002'; });
n += rejeita('cotação do router errada', (t) => { t.leitura.cotacao_do_router.usdc_raw = '2000000'; });
n += rejeita('simulação sem a venda a reverter sem approve', (t) => { t.leitura.simulacao_approve_e_swap.swap_sem_approve = 'passa'; });
n += rejeita('simulação com outra saída', (t) => { t.leitura.simulacao_approve_e_swap.swap.usdc_raw = '300000'; });
n += rejeita('gás total mal somado', (t) => { t.leitura.gas.gas_total_simulado = 1; });
n += rejeita('custo L2 errado', (t) => { t.leitura.gas.custo_l2_eth = 0.5; });
n += rejeita('taxa L1 dada por medida', (t) => { t.leitura.gas.taxa_de_dados_l1 = '0,001 ETH'; });
n += rejeita('conta que não é a do executor', (t) => { t.leitura.conta_operacional.endereco = '0x0000000000000000000000000000000000000003'; });
n += rejeita('nonce escondido', (t) => { t.leitura.conta_operacional.nonce = 7; });
n += rejeita('allowance já dada', (t) => { t.leitura.conta_operacional.allowance_do_router_raw = '1'; });
n += rejeita('razão ETH errada no texto', (t) => { t.o_que_a_leitura_prova[3] = 'a operacional tem ETH para o gás: cerca de 9999 vezes o custo L2 simulado'; });
n += rejeita('esconde o nonce 0', (t) => { t.o_que_a_leitura_prova = t.o_que_a_leitura_prova.filter((x) => !x.includes('nonce')); });
n += rejeita('token vendido trocado', (t) => { t.proposta.constantes_no_codigo.token_vendido = '0x0000000000000000000000000000000000000004'; });
n += rejeita('USDC enviado para outro destino', (t) => { t.proposta.constantes_no_codigo.destinatario_do_usdc = 'carteira 0x0000000000000000000000000000000000000005'; });
n += rejeita('primeiro teste maior do que o máximo', (t) => { t.proposta.limites.primeiro_teste_valium = 500000; });
n += rejeita('cotação do primeiro teste errada', (t) => { t.proposta.limites.primeiro_teste_usdc_cotado_raw = 99999; });
n += rejeita('máximo acima do saldo', (t) => { t.proposta.limites.maximo_por_pedido_valium = 5_000_000; });
n += rejeita('tecto diferente do da adenda', (t) => { t.proposta.limites.tecto_acumulado_usdc = 100; });
n += rejeita('tolerância de 50%', (t) => { t.proposta.limites.tolerancia_de_preco_percent = 50; });
n += rejeita('approve ilimitado', (t) => { t.proposta.comportamento = t.proposta.comportamento.map((x) => x.replace('nunca ilimitado', 'ilimitado')); });
n += rejeita('sem revogar o approve', (t) => { t.proposta.comportamento = t.proposta.comportamento.filter((x) => !x.includes('revoga')); });
n += rejeita('sem ler o recibo', (t) => { t.proposta.comportamento = t.proposta.comportamento.filter((x) => !x.includes('recibo')); });
n += rejeita('primeira venda sem palavra à parte', (t) => { t.proposta.ordem_proposta[4] = '5. primeira venda real'; });
n += rejeita('o bitcoin.mjs passa a entrar na implantação', (t) => { t.proposta.ordem_proposta[1] = '2. implantar tudo'; });
n += rejeita('uma só palavra pedida', (t) => { t.proposta.palavras_pedidas = ['uma']; });
n += rejeita('esconde o que não cobre', (t) => { t.o_que_nao_cobre = ['nada']; });
n += rejeita('esconde o risco do primeiro envio', (t) => { t.riscos = t.riscos.filter((x) => !x.includes('primeira transacção')); });
n += rejeita('esconde o risco fiscal', (t) => { t.riscos = t.riscos.filter((x) => !x.includes('fiscais e legais')); });
n += rejeita('ganho apresentado como grande', (t) => { t.ganho_esperado = 'um ganho importante'; });
n += rejeita('implanta', (t) => { t.truth_machine.implanta = true; });
n += rejeita('move fundos', (t) => { t.truth_machine.move_fundos = true; });
n += rejeita('já não é só leitura', (t) => { t.truth_machine.so_leitura = false; });
n += rejeita('deixa de negar que o executor possa vender hoje', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => !x.includes('executor possa vender')); });
n += rejeita('leitura da ORA passa por palavra de Unum', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('Leitura, não palavra de Unum.', 'Unum disse.'); });
n += rejeita('promessa de lucro', (t) => { t.leitura_da_ora += ' Vai dar lucro.'; });
n += rejeita('chave privada no texto', (t) => { t.objecto += ' 0x' + 'e'.repeat(64); });
console.log(`proposta-venda: proposta conferida; ${n} estragos propositados apanhados.`);

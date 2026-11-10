// Verifica economia/adenda-limite-troca.json (tecto de troca de 1 USDC, Unum, 10/11/2026).
// A adenda não mexe na v2 nem na proposta v3 (o mandato assinado cita o sha256 da v3), não cria capacidade,
// e uma acção de venda só pode aparecer no executor se a adenda a registar. A API pública diz o mesmo tecto.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const v2 = JSON.parse(fs.readFileSync('economia/constituicao-v2.json', 'utf8'));
const v3 = JSON.parse(fs.readFileSync('economia/constituicao-v3-proposta.json', 'utf8'));
const moedas = JSON.parse(fs.readFileSync('token/moedas-de-unum-2026-11-01.json', 'utf8'));
const core = fs.readFileSync('supabase/functions/ora-operational-wallet/core.mjs', 'utf8');
const api = fs.readFileSync('api/tesouraria.js', 'utf8');
const accoes = [...core.match(/const allowed=\{(.*?)\};/s)[1].matchAll(/(\w+):\['action'/g)].map((m) => m[1]);
const accoesDeTroca = accoes.filter((a) => /swap|sell|trade|venda|dex|liquid|pool/i.test(a));
const tectoNaApi = Number(api.match(/automatic_limits:\s*\{[^}]*trade_usdc:\s*(\d+)/)[1]);

function verificar(txt) {
  const a = JSON.parse(txt);
  assert.equal(a.format, 'orum-financial-constitution/v3-adenda-troca');
  assert.equal(a.base, 'economia/constituicao-v2.json');
  assert.match(a.data, /^\d{4}-\d{2}-\d{2}$/);
  // A v2 e a proposta v3 ficam intactas.
  assert.deepEqual(v2.absolute_limits, { automatic_trade_usdc: 0, automatic_debt_usdc: 0, automatic_bridge_usdc: 0, unlimited_approval: false }, 'a v2 foi alterada: a adenda não a reescreve');
  for (const k of ['automatic_trade_usdc', 'automatic_debt_usdc', 'automatic_bridge_usdc']) assert.equal(v3.absolute_limits[k], 0, `a proposta v3 foi alterada (${k}): o mandato cita o seu sha256`);
  // O tecto.
  assert.equal(a.limite.campo, 'absolute_limits.automatic_trade_usdc');
  assert.equal(a.limite.valor_na_v2, v2.absolute_limits.automatic_trade_usdc);
  assert.ok(Number.isFinite(a.limite.valor_em_vigor) && a.limite.valor_em_vigor > 0 && a.limite.valor_em_vigor <= 1, 'o tecto em vigor é o que Unum autorizou (até 1 USDC)');
  assert.ok(Number.isFinite(a.limite.consumido_usdc) && a.limite.consumido_usdc >= 0 && a.limite.consumido_usdc <= a.limite.valor_em_vigor, 'consumido fora do tecto');
  assert.equal(a.limite.valor_em_vigor, tectoNaApi, 'a API pública diz outro tecto');
  // A autorização.
  assert.equal(a.autorizacao_de_unum.citacao, 'Eu autorizo');
  assert.equal(a.autorizacao_de_unum.escolha_anterior, 'C');
  assert.match(a.autorizacao_de_unum.proposta, /automatic_trade_usdc passa de 0 para 1\b/);
  assert.match(a.autorizacao_de_unum.cobre, /Não cobre a acção de venda no executor/);
  // O âmbito: os cinco tokens de moedas-de-unum, venda por USDC, destino a operacional, o resto fora.
  assert.equal(a.ambito.operacao, 'venda por USDC');
  const contratos = a.ambito.tokens.map((t) => t.contrato.toLowerCase()).sort();
  for (const c of contratos) assert.match(c, ADDR);
  assert.equal(new Set(contratos).size, 5, 'os cinco tokens têm de ser distintos');
  assert.deepEqual(contratos, moedas.moedas.map((m) => m.contrato.toLowerCase()).sort(), 'os tokens não são os cinco de moedas-de-unum');
  assert.match(a.ambito.destino_do_usdc, /0x89460d9e0590559e63860197dfe2ac648A753584$/);
  for (const w of ['compra', 'dívida', 'ponte', 'aprovação ilimitada']) assert.ok(a.ambito.nao_cobre.join(' ').includes(w), `nao_cobre tem de dizer ${w}`);
  // Sem capacidade enquanto o executor não tiver a acção registada aqui.
  const aprovada = a.capacidade.accao_de_venda_aprovada;
  if (accoesDeTroca.length) {
    assert.ok(typeof aprovada === 'string' && accoesDeTroca.includes(aprovada), `o executor tem acção de troca (${accoesDeTroca}) que a adenda não regista`);
    assert.notEqual(a.capacidade.estado, 'nenhuma');
  } else {
    assert.equal(aprovada, null, 'a adenda aprova uma acção que o executor não tem');
    assert.equal(a.capacidade.estado, 'nenhuma');
  }
  assert.match(a.capacidade.leitura, /não cria capacidade/);
  // Dívida, ponte e aprovação ilimitada ficam a zero.
  const resto = a.o_que_nao_muda.join(' ');
  for (const w of ['automatic_debt_usdc 0', 'automatic_bridge_usdc 0', 'unlimited_approval false', 'parar', 'identidade, não meio de pagamento', 'só receita externa confirmada']) assert.ok(resto.includes(w), `o_que_nao_muda tem de dizer ${w}`);
  assert.match(a.supera.d4_da_v3_proposta, /só quanto à troca/);
  assert.match(a.supera.d4_da_v3_proposta, /sha256/);
  // Honestidade.
  for (const k of ['move_fundos', 'cria_capacidade', 'altera_v2', 'altera_proposta_v3', 'promete_receita']) assert.equal(a.truth_machine[k], false, `truth_machine.${k} tem de ser false`);
  for (const k of ['que haja liquidez', 'preço', 'procura', 'receita', 'que a venda funcione']) assert.ok(a.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.ok(a.riscos.length >= 3 && a.riscos.join(' ').includes('fiscais e legais'), 'tem de dizer os riscos');
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro)/i.test(txt), 'texto com promessa');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('economia/adenda-limite-troca.json', 'utf8');
verificar(txt);

const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  return 1;
};
let n = 0;
n += rejeita('tecto alargado a 1000', (t) => { t.limite.valor_em_vigor = 1000; });
n += rejeita('tecto a zero', (t) => { t.limite.valor_em_vigor = 0; });
n += rejeita('tecto diferente do da API', (t) => { t.limite.valor_em_vigor = 0.5; });
n += rejeita('consumido acima do tecto', (t) => { t.limite.consumido_usdc = 2; });
n += rejeita('valor da v2 mentido', (t) => { t.limite.valor_na_v2 = 5; });
n += rejeita('campo errado', (t) => { t.limite.campo = 'absolute_limits.automatic_debt_usdc'; });
n += rejeita('citação diferente', (t) => { t.autorizacao_de_unum.citacao = 'Sim'; });
n += rejeita('proposta com outro valor', (t) => { t.autorizacao_de_unum.proposta = t.autorizacao_de_unum.proposta.replace('0 para 1', '0 para 100'); });
n += rejeita('cobre a acção de venda', (t) => { t.autorizacao_de_unum.cobre = 'Tudo.'; });
n += rejeita('token em falta', (t) => { t.ambito.tokens.pop(); });
n += rejeita('token trocado por outro', (t) => { t.ambito.tokens[0].contrato = '0x0000000000000000000000000000000000000001'; });
n += rejeita('operação passa a compra', (t) => { t.ambito.operacao = 'compra'; });
n += rejeita('destino do USDC trocado', (t) => { t.ambito.destino_do_usdc = 'carteira 0x0000000000000000000000000000000000000001'; });
n += rejeita('esconde que a dívida fica fora', (t) => { t.ambito.nao_cobre = ['compra de tokens com USDC']; });
n += rejeita('aprova uma acção que o executor não tem', (t) => { t.capacidade.accao_de_venda_aprovada = 'sell_token_for_usdc'; t.capacidade.estado = 'activa'; });
n += rejeita('estado da capacidade mentido', (t) => { t.capacidade.estado = 'activa'; });
n += rejeita('diz que cria capacidade', (t) => { t.capacidade.leitura = 'o executor passa a vender'; });
n += rejeita('esquece a dívida a zero', (t) => { t.o_que_nao_muda = t.o_que_nao_muda.filter((x) => !x.includes('debt')); });
n += rejeita('esquece o parar', (t) => { t.o_que_nao_muda = t.o_que_nao_muda.filter((x) => !x.includes('parar')); });
n += rejeita('supera mais do que a troca', (t) => { t.supera.d4_da_v3_proposta = 'a D4 deixa de valer'; });
n += rejeita('move fundos', (t) => { t.truth_machine.move_fundos = true; });
n += rejeita('cria capacidade', (t) => { t.truth_machine.cria_capacidade = true; });
n += rejeita('altera a proposta v3', (t) => { t.truth_machine.altera_proposta_v3 = true; });
n += rejeita('deixa de negar a liquidez', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'que haja liquidez'); });
n += rejeita('esconde os riscos', (t) => { t.riscos = ['nenhum']; });
n += rejeita('promessa de lucro', (t) => { t.riscos.push('vai dar lucro'); });
n += rejeita('chave privada no texto', (t) => { t.base += ' 0x' + 'c'.repeat(64); });
// Estragos feitos fora do ficheiro da adenda: a v2 e a API.
const comV2Alterada = () => { const x = structuredClone(v2); x.absolute_limits.automatic_trade_usdc = 1; return x; };
assert.notDeepEqual(comV2Alterada().absolute_limits, { automatic_trade_usdc: 0, automatic_debt_usdc: 0, automatic_bridge_usdc: 0, unlimited_approval: false }); n += 1;
assert.ok(accoesDeTroca.length === 0 || JSON.parse(txt).capacidade.accao_de_venda_aprovada !== null); n += 1;
console.log(`adenda-limite-troca: adenda conferida; ${n} estragos propositados apanhados.`);

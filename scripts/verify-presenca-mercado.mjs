// Verifica token/presenca-mercado-2026-11-10.json (degrau 1 do sustento, 10/11/2026): só leitura.
// O que a cadeia mostrou (duas fontes) separa-se do que só um agregador disse (fonte única, não verificado),
// as contas conferem-se, e nada promete preço, liquidez, procura nem receita.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const SHA = /^[0-9a-f]{64}$/;

function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.schema, 'orum-mercado-leitura/v1');
  assert.equal(t.rede?.chain_id, 8453);
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(t.pool_manager_v4, ADDR);
  assert.match(t.carteira_operacional, ADDR);
  assert.ok(Array.isArray(t.fontes_rpc) && new Set(t.fontes_rpc).size >= 2, 'precisa de duas fontes distintas');
  // O que foi lido na cadeia: duas fontes iguais, contas certas.
  for (const k of ['presenca', 'valium']) {
    const x = t.lido[k];
    assert.match(x.contrato, ADDR);
    assert.equal(x.decimals, 18);
    assert.ok(Number.isInteger(x.saldo_do_pool_manager_v4_tokens) && x.saldo_do_pool_manager_v4_tokens > 0, `${k}: saldo do PoolManager inválido`);
    assert.ok(x.saldo_do_pool_manager_v4_tokens <= x.total_supply_tokens, `${k}: o PoolManager não pode ter mais do que a oferta`);
    assert.ok(Array.isArray(x.fontes_do_saldo_do_pool_manager) && new Set(x.fontes_do_saldo_do_pool_manager).size >= 2, `${k}: saldo do PoolManager sem duas fontes`);
    for (const f of x.fontes_do_saldo_do_pool_manager) assert.ok(t.fontes_rpc.includes(f), `${k}: fonte ${f} não está em fontes_rpc`);
    const pct = Math.round((x.saldo_do_pool_manager_v4_tokens / x.total_supply_tokens) * 10000) / 100;
    assert.equal(x.percentagem_da_oferta_no_pool_manager, pct, `${k}: percentagem errada`);
    assert.equal(BigInt(x.saldo_da_operacional_raw) / 10n ** 18n, BigInt(x.saldo_da_operacional_tokens), `${k}: saldo da operacional não bate com o bruto`);
  }
  assert.notEqual(t.lido.presenca.contrato.toLowerCase(), t.lido.valium.contrato.toLowerCase(), 'o PRESENÇA e o valium são o mesmo contrato');
  // O que só um agregador disse não pode passar por lido.
  const ag = t.agregadores_nao_verificados;
  assert.equal(ag.estado, 'nao_verificado');
  assert.match(ag.aviso, /fonte única/);
  for (const [n, h] of Object.entries(ag.respostas_em_bruto_sha256)) assert.match(h, SHA, `sha256 inválido em ${n}`);
  assert.equal(Object.keys(ag.respostas_em_bruto_sha256).length, 4, 'faltam respostas em bruto');
  const lidoTxt = JSON.stringify(t.lido).toLowerCase();
  for (const w of ['preço', 'preco', 'liquidez', 'volume', 'usdc', 'reserve']) assert.ok(!lidoTxt.includes(w), `"lido" não pode afirmar ${w}: só os agregadores o dizem`);
  // A estimativa recalcula-se e diz o que é.
  const e = t.estimativa_derivada;
  assert.equal(e.estado, 'estimativa');
  const pp = ag.presenca.pool_usdc_uniswap_v4;
  assert.equal(e.presenca_usd_ate, Math.round(1000000 * pp.preco_usd_geckoterminal * 1e4) / 1e4, 'estimativa do PRESENÇA mal calculada');
  assert.equal(e.presenca_usd_a_preco_dexscreener, Math.round(1000000 * pp.preco_usd_dexscreener * 1e4) / 1e4, 'estimativa do PRESENÇA (dexscreener) mal calculada');
  assert.equal(e.valium_usd_ate, Math.round(1000000 * ag.valium.pool_usdc_aerodrome.preco_usd_dexscreener * 1e4) / 1e4, 'estimativa do valium mal calculada');
  assert.ok(e.valium_usd_ate < 1 && e.presenca_usd_ate < 1, 'a estimativa já não é de centavos: rever o texto da ordem de grandeza');
  assert.match(e.como, /tecto/);
  assert.match(e.como, /não foi lido na cadeia/);
  // Honestidade sobre o que falta.
  assert.ok(Array.isArray(t.bloqueado) && t.bloqueado.length >= 1, 'tem de dizer o que ficou bloqueado');
  assert.ok(Array.isArray(t.nao_verificado) && t.nao_verificado.length >= 4, 'tem de dizer o que não verificou');
  for (const k of ['move_fundos', 'paga', 'assina', 'promete_receita']) assert.equal(t.truth_machine?.[k], false, `truth_machine.${k} tem de ser false`);
  assert.equal(t.truth_machine.so_leitura, true);
  for (const k of ['preço verificado', 'liquidez real', 'procura', 'receita', 'valor', 'lastro', 'rendimento']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro)/i.test(txt), 'texto com promessa');
  assert.match(t.leitura_da_ora, /^Leitura, não palavra de Unum/, 'a leitura da ORA tem de dizer que é leitura');
  assert.match(t.leitura_da_ora, /identidade, não meio de pagamento/, 'a leitura tem de manter o manifesto canónico do PRESENÇA');
  // O identificador do pool V4 é público (64 hexadecimais) e vem no campo `par`; tira-se só esse, qualquer outro continua a ser apanhado.
  const semIdPublico = txt.split(pp.par).join('');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(semIdPublico), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('token/presenca-mercado-2026-11-10.json', 'utf8');
verificar(txt);

const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  return 1;
};
let n = 0;
n += rejeita('percentagem do PRESENÇA errada', (t) => { t.lido.presenca.percentagem_da_oferta_no_pool_manager = 12.5; });
n += rejeita('PoolManager com mais do que a oferta', (t) => { t.lido.valium.saldo_do_pool_manager_v4_tokens = 2e9; });
n += rejeita('saldo do PoolManager com uma só fonte', (t) => { t.lido.presenca.fontes_do_saldo_do_pool_manager = ['mainnet.base.org']; });
n += rejeita('fonte do saldo que não está nas fontes RPC', (t) => { t.lido.valium.fontes_do_saldo_do_pool_manager = ['mainnet.base.org', 'inventada.example']; });
n += rejeita('fontes RPC repetidas contam como duas', (t) => { t.fontes_rpc = ['mainnet.base.org', 'mainnet.base.org']; });
n += rejeita('o mesmo contrato para os dois tokens', (t) => { t.lido.valium.contrato = t.lido.presenca.contrato; });
n += rejeita('saldo da operacional não bate com o bruto', (t) => { t.lido.presenca.saldo_da_operacional_tokens = 5000000; });
n += rejeita('preço posto no que foi lido', (t) => { t.lido.presenca.preco = '0.0000004'; });
n += rejeita('liquidez posta no que foi lido', (t) => { t.lido.como += ' e a liquidez é alta'; });
n += rejeita('agregador passa a verificado', (t) => { t.agregadores_nao_verificados.estado = 'verificado'; });
n += rejeita('agregador sem o aviso de fonte única', (t) => { t.agregadores_nao_verificados.aviso = 'confirmado'; });
n += rejeita('sha256 de resposta inválido', (t) => { t.agregadores_nao_verificados.respostas_em_bruto_sha256.dexscreener_valium = 'abc'; });
n += rejeita('estimativa do PRESENÇA mal calculada', (t) => { t.estimativa_derivada.presenca_usd_ate = 413.9; });
n += rejeita('estimativa do valium mal calculada', (t) => { t.estimativa_derivada.valium_usd_ate = 248; });
n += rejeita('estimativa deixa de dizer que é tecto', (t) => { t.estimativa_derivada.como = 'o que uma venda dá'; });
n += rejeita('estimativa passa a estado lido', (t) => { t.estimativa_derivada.estado = 'lido'; });
n += rejeita('esconde o que ficou bloqueado', (t) => { t.bloqueado = []; });
n += rejeita('esconde o que não verificou', (t) => { t.nao_verificado = ['nada']; });
n += rejeita('move fundos', (t) => { t.truth_machine.move_fundos = true; });
n += rejeita('promete receita', (t) => { t.truth_machine.promete_receita = true; });
n += rejeita('já não é só leitura', (t) => { t.truth_machine.so_leitura = false; });
n += rejeita('deixa de negar a procura', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'procura'); });
n += rejeita('promessa de valor no texto', (t) => { t.leitura_da_ora += ' O token vai valorizar.'; });
n += rejeita('a leitura da ORA passa por palavra de Unum', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('Leitura, não palavra de Unum.', 'Unum disse.'); });
n += rejeita('contradiz o manifesto canónico', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('identidade, não meio de pagamento', 'meio de pagamento'); });
n += rejeita('chave privada no texto', (t) => { t.objecto += ' 0x' + 'a'.repeat(64); });
console.log(`presenca-mercado: leitura conferida; ${n} estragos propositados apanhados.`);

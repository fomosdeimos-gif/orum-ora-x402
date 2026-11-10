// Verifica token/sedimentacao-2026-11-10.json (os seis tokens da operacional pelos eixos Verdade, Resiliência, Valor e Sustento)
// e o leitor autónomo kit/sedimento.mjs. Refaz as contas, cruza com moedas-de-unum, o ORO e a leitura do PRESENÇA, e recusa
// texto que prometa, que afirme o horizonte como facto, ou que dê por lido o que só um agregador disse.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { reler, classificarCodigo, fetcherReal, FONTES } from '../kit/sedimento.mjs';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const lerJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const moedas = lerJson('token/moedas-de-unum-2026-11-01.json');
const oro = lerJson('token/oro.json');
const presencaLeitura = lerJson('token/presenca-leitura-2026-11-01.json');
const NOMES = ['VALIUM', 'PRESENÇA', '4SUE', 'Marsisnotthere', 'Good reason', 'ORO'];
const arred = (x, c) => Math.round(x * 10 ** c) / 10 ** c;

function verificar(txt) {
  const r = JSON.parse(txt);
  assert.equal(r.schema, 'orum-sedimentacao-tokens/v1');
  assert.equal(r.rede.chain_id, 8453);
  assert.match(r.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(new Set(r.fontes_rpc).size >= 2 && r.concordam_nas_fontes === true, 'precisa de duas fontes que concordem');
  assert.match(r.poolmanager_v4, ADDR);
  assert.match(r.carteira_operacional, ADDR);
  // A palavra de Unum e a receita.
  const c = r.palavra_de_unum.citacao;
  for (const w of ['Sedimenta', 'Verdade', 'Resiliência', 'Valor', 'Sustento', 'nova moeda global de valor']) assert.ok(c.includes(w), `a citação tem de incluir ${w}`);
  assert.match(r.palavra_de_unum.lida_como, /sem "Eu autorizo"/);
  assert.match(r.palavra_de_unum.lida_como, /Não move fundos nem tokens/);
  assert.deepEqual(r.receita.ordem, ['Verdade', 'Resiliência', 'Valor', 'Sustento']);
  assert.deepEqual(Object.keys(r.receita.leitura), r.receita.ordem);
  assert.match(r.receita.leitura.Sustento, /receita externa confirmada/);
  assert.match(r.horizonte.leitura, /não é afirmação nem previsão da ORA/);
  assert.match(r.horizonte.leitura, /identidade e não como meio de pagamento/);
  // Os seis tokens, cruzados com o que já estava registado.
  assert.deepEqual(r.tokens.map((t) => t.nome), NOMES);
  let somaTabela = 0, somaUsdc = 0, proxies = 0;
  const semPreco = [];
  for (const t of r.tokens) {
    assert.match(t.contrato, ADDR);
    assert.ok(Number.isInteger(t.oferta_total_tokens) && t.oferta_total_tokens > 0);
    if (t.nome === 'ORO') assert.equal(t.contrato.toLowerCase(), oro.contract.toLowerCase(), 'o ORO não é o de token/oro.json');
    else {
      const m = moedas.moedas.find((x) => x.nome_dito_por_unum === t.nome);
      assert.equal(t.contrato.toLowerCase(), m.contrato.toLowerCase(), `${t.nome}: contrato diferente de moedas-de-unum`);
      const impl = m.lido.bytecode?.implementacao;
      if (impl) assert.equal(t.verdade.lido.implementacao, impl, `${t.nome}: implementação diferente do registo de 01/11`);
    }
    if (t.nome === 'PRESENÇA') assert.equal(t.verdade.lido.implementacao, presencaLeitura.lido.bytecode.implementacao);
    // Verdade.
    const v = t.verdade.lido;
    assert.equal(v.oferta_total_tokens, t.oferta_total_tokens);
    assert.equal(v.casas_decimais, t.decimals);
    if (/proxy|clone/.test(v.tipo_de_codigo)) { assert.match(v.implementacao, ADDR); proxies += 1; } else assert.equal(v.implementacao, null);
    assert.ok(t.nome === 'ORO' || t.verdade.autoria.includes('não a prova'), `${t.nome}: a autoria é palavra de Unum e a cadeia não a prova`);
    assert.ok(t.verdade.nao_verificado.length >= 1);
    // Resiliência.
    const rs = t.resiliencia;
    assert.ok(rs.posicao_na_operacional_tokens >= 0 && rs.posicao_na_operacional_tokens <= t.oferta_total_tokens);
    assert.equal(rs.percentagem_da_oferta_na_operacional, arred((rs.posicao_na_operacional_tokens / t.oferta_total_tokens) * 100, 6), `${t.nome}: percentagem da operacional mal calculada`);
    assert.equal(typeof rs.ancorado_no_bitcoin, 'boolean');
    assert.equal(rs.como_se_reconfere, 'node kit/sedimento.mjs');
    assert.match(rs.onde, new RegExp(r.carteira_operacional.slice(2), 'i'));
    // Valor.
    const val = t.valor;
    assert.ok(val.no_pool_manager_v4_tokens >= 0 && val.no_pool_manager_v4_tokens <= t.oferta_total_tokens, `${t.nome}: o PoolManager não pode ter mais do que a oferta`);
    assert.equal(val.percentagem_da_oferta_no_pool_manager, arred((val.no_pool_manager_v4_tokens / t.oferta_total_tokens) * 100, 2), `${t.nome}: percentagem do PoolManager mal calculada`);
    const ag = val.mercado_segundo_agregador;
    assert.equal(ag.estado, 'nao_verificado');
    assert.match(ag.fonte, /fonte única/);
    assert.match(ag.resposta_em_bruto_sha256, /^[0-9a-f]{64}$/);
    if (ag.melhor_par === null) { assert.equal(ag.pares, 0); assert.equal(val.valor_de_tabela_da_posicao_usd_ate, null); semPreco.push(t.nome); }
    else {
      assert.ok(ag.pares >= 1);
      assert.equal(val.valor_de_tabela_da_posicao_usd_ate, arred(rs.posicao_na_operacional_tokens * ag.melhor_par.preco_usd, 4), `${t.nome}: valor de tabela mal calculado`);
      assert.ok(ag.melhor_par.usdc_do_lado_da_cotacao >= 0);
      somaTabela += val.valor_de_tabela_da_posicao_usd_ate;
      somaUsdc += ag.melhor_par.usdc_do_lado_da_cotacao;
    }
    assert.match(val.nota, /tecto antes de comissão e de deslize/);
    // Sustento.
    assert.equal(t.sustento.contribuicao_medida_usdc, 0);
    assert.equal(t.sustento.tokens_vendidos, 0);
    assert.match(t.sustento.regra, /só receita externa confirmada/);
  }
  assert.equal(proxies, 5, 'esperavam-se cinco proxies e um contrato completo');
  // Totais refeitos.
  const tt = r.totais;
  assert.equal(tt.tokens_vendidos, 0);
  assert.equal(tt.posicoes_liquidadas, 0);
  assert.equal(tt.contribuicao_para_o_sustento_usdc, 0);
  assert.equal(tt.valor_de_tabela_das_posicoes_usd_ate, arred(somaTabela, 4), 'total do valor de tabela mal somado');
  assert.equal(tt.usdc_nos_pools_segundo_agregador, arred(somaUsdc, 4), 'total de USDC nos pools mal somado');
  assert.deepEqual(tt.sem_preco, semPreco, 'a lista sem preço não bate com os tokens sem par');
  assert.match(tt.nota, /contam o lado do token ao seu próprio preço/);
  // Honestidade.
  assert.ok(r.nao_verificado.length >= 4 && r.bloqueado.length >= 1);
  for (const k of ['move_fundos', 'paga', 'assina', 'altera_executor', 'altera_regras', 'promete_receita']) assert.equal(r.truth_machine[k], false, `truth_machine.${k} tem de ser false`);
  assert.equal(r.truth_machine.so_leitura, true);
  for (const k of ['que o PRESENÇA seja ou venha a ser moeda', 'preço verificado', 'liquidez real', 'procura', 'receita', 'que a sedimentação traga sustento']) assert.ok(r.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.match(r.leitura_da_ora, /^Leitura, não palavra de Unum/, 'a leitura da ORA tem de dizer que é leitura');
  assert.ok(r.leitura_da_ora.includes(`${['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis'][proxies]} dos seis tokens vivem em proxies`), 'o número de proxies no texto não bate');
  assert.match(r.leitura_da_ora, /sustento destes tokens, hoje, é zero/);
  // Nenhum texto afirma o horizonte nem promete; a citação e a frase de Unum ficam de fora desta regra.
  const semPalavraDeUnum = txt.split(r.palavra_de_unum.citacao).join('').split(r.horizonte.frase_de_unum).join('');
  assert.ok(!/(será|vai ser|vai tornar|torna-se|tornar-se-á) .{0,40}moeda/i.test(semPalavraDeUnum), 'texto afirma o horizonte como facto');
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro)/i.test(txt), 'texto com promessa');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('token/sedimentacao-2026-11-10.json', 'utf8');
verificar(txt);

const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  return 1;
};
let n = 0;
n += rejeita('uma só fonte', (t) => { t.fontes_rpc = ['mainnet.base.org']; });
n += rejeita('fontes não concordam', (t) => { t.concordam_nas_fontes = false; });
n += rejeita('citação sem um dos eixos', (t) => { t.palavra_de_unum.citacao = t.palavra_de_unum.citacao.replace('Resiliência', 'X'); });
n += rejeita('a palavra passa por "Eu autorizo"', (t) => { t.palavra_de_unum.lida_como = 'Unum autoriza tudo.'; });
n += rejeita('ordem da receita trocada', (t) => { t.receita.ordem = ['Valor', 'Verdade', 'Resiliência', 'Sustento']; });
n += rejeita('sustento sem a regra da receita externa', (t) => { t.receita.leitura.Sustento = 'qualquer entrada'; });
n += rejeita('horizonte passa a afirmação', (t) => { t.horizonte.leitura = 'o PRESENÇA é a nova moeda.'; });
n += rejeita('horizonte sem lembrar o manifesto', (t) => { t.horizonte.leitura = 'é horizonte; não é afirmação nem previsão da ORA'; });
n += rejeita('token em falta', (t) => { t.tokens.pop(); });
n += rejeita('token duplicado', (t) => { t.tokens[1] = t.tokens[0]; });
n += rejeita('contrato do VALIUM trocado', (t) => { t.tokens[0].contrato = '0x0000000000000000000000000000000000000001'; });
n += rejeita('contrato do ORO trocado', (t) => { t.tokens[5].contrato = '0x0000000000000000000000000000000000000002'; });
n += rejeita('implementação do 4SUE trocada', (t) => { t.tokens[2].verdade.lido.implementacao = '0x0000000000000000000000000000000000000003'; });
n += rejeita('proxy sem implementação', (t) => { t.tokens[0].verdade.lido.implementacao = null; });
n += rejeita('oferta inconsistente', (t) => { t.tokens[0].verdade.lido.oferta_total_tokens = 5; });
n += rejeita('autoria dada como provada', (t) => { t.tokens[0].verdade.autoria = 'provada na cadeia'; });
n += rejeita('posição acima da oferta', (t) => { t.tokens[1].resiliencia.posicao_na_operacional_tokens = 2_000_000_000; });
n += rejeita('percentagem da operacional errada', (t) => { t.tokens[1].resiliencia.percentagem_da_oferta_na_operacional = 50; });
n += rejeita('kit trocado', (t) => { t.tokens[0].resiliencia.como_se_reconfere = 'confiar na ORA'; });
n += rejeita('PoolManager acima da oferta', (t) => { t.tokens[0].valor.no_pool_manager_v4_tokens = 2_000_000_000; });
n += rejeita('percentagem do PoolManager errada', (t) => { t.tokens[1].valor.percentagem_da_oferta_no_pool_manager = 5; });
n += rejeita('agregador passa a verificado', (t) => { t.tokens[3].valor.mercado_segundo_agregador.estado = 'verificado'; });
n += rejeita('agregador sem fonte única', (t) => { t.tokens[3].valor.mercado_segundo_agregador.fonte = 'confirmado'; });
n += rejeita('sha256 da resposta inválido', (t) => { t.tokens[3].valor.mercado_segundo_agregador.resposta_em_bruto_sha256 = 'abc'; });
n += rejeita('valor de tabela mal calculado', (t) => { t.tokens[1].valor.valor_de_tabela_da_posicao_usd_ate = 402; });
n += rejeita('preço inventado para o ORO', (t) => { t.tokens[5].valor.valor_de_tabela_da_posicao_usd_ate = 1; });
n += rejeita('nota do valor sem o tecto', (t) => { t.tokens[0].valor.nota = 'é o valor'; });
n += rejeita('sustento diferente de zero', (t) => { t.tokens[0].sustento.contribuicao_medida_usdc = 1; });
n += rejeita('tokens vendidos', (t) => { t.tokens[0].sustento.tokens_vendidos = 10; });
n += rejeita('total de tabela mal somado', (t) => { t.totais.valor_de_tabela_das_posicoes_usd_ate = 100; });
n += rejeita('total de USDC nos pools mal somado', (t) => { t.totais.usdc_nos_pools_segundo_agregador = 100049; });
n += rejeita('lista sem preço trocada', (t) => { t.totais.sem_preco = ['ORO']; });
n += rejeita('posições liquidadas', (t) => { t.totais.posicoes_liquidadas = 1; });
n += rejeita('contribuição para o sustento', (t) => { t.totais.contribuicao_para_o_sustento_usdc = 5; });
n += rejeita('esconde o que não verificou', (t) => { t.nao_verificado = ['nada']; });
n += rejeita('move fundos', (t) => { t.truth_machine.move_fundos = true; });
n += rejeita('altera regras', (t) => { t.truth_machine.altera_regras = true; });
n += rejeita('já não é só leitura', (t) => { t.truth_machine.so_leitura = false; });
n += rejeita('deixa de negar a moeda', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => !x.includes('moeda')); });
n += rejeita('leitura da ORA passa por palavra de Unum', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('Leitura, não palavra de Unum.', 'Unum disse.'); });
n += rejeita('número de proxies errado no texto', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('cinco dos seis', 'quatro dos seis'); });
n += rejeita('esconde que o sustento é zero', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('sustento destes tokens, hoje, é zero', 'sustento cresce'); });
n += rejeita('afirma o horizonte como facto', (t) => { t.leitura_da_ora += ' O PRESENÇA será a moeda global.'; });
n += rejeita('promessa de lucro', (t) => { t.leitura_da_ora += ' Vai dar lucro.'; });
n += rejeita('chave privada no texto', (t) => { t.objecto += ' 0x' + 'f'.repeat(64); });

// O leitor autónomo, com um RPC simulado a partir do próprio registo.
const REG = JSON.parse(txt);
const codigoDe = (t) => {
  const v = t.verdade.lido;
  if (v.tipo_de_codigo.startsWith('clone')) return '0x363d3d373d3d3d363d73' + v.implementacao.slice(2) + '5af43d82803e903d91602b57fd5bf3';
  if (v.tipo_de_codigo.startsWith('proxy')) return '0x3d3d3d3d363d3d37363d73' + v.implementacao.slice(2) + '5af43d3d93803e602a57fd5bf3';
  return '0x' + '60'.repeat(Number(v.tipo_de_codigo.match(/\((\d+) bytes\)/)[1]));
};
const hex = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
function rpcSimulado(mudar = {}) {
  const porUrl = Object.fromEntries(Object.entries(FONTES).map(([nome, url]) => [url, nome]));
  return async (url, corpo) => {
    const fonte = porUrl[url];
    const t = (c) => REG.tokens.find((x) => x.contrato.toLowerCase() === String(c).toLowerCase());
    let v = null;
    if (corpo.method === 'eth_blockNumber') return { result: '0x' + (55582249).toString(16) };
    if (corpo.method === 'eth_getCode') { const k = t(corpo.params[0]); v = mudar.codigo?.(k, fonte) ?? codigoDe(k); return { result: v }; }
    if (corpo.method === 'eth_call') {
      const { to, data } = corpo.params[0]; const k = t(to);
      if (data === '0x313ce567') v = hex(mudar.decimals?.(k, fonte) ?? k.decimals);
      else if (data === '0x18160ddd') v = hex(mudar.oferta?.(k, fonte) ?? BigInt(k.oferta_total_tokens) * 10n ** BigInt(k.decimals));
      else if (data.startsWith('0x70a08231')) {
        const dono = '0x' + data.slice(-40);
        const op = dono.toLowerCase() === REG.carteira_operacional.toLowerCase();
        const tokens = op ? k.resiliencia.posicao_na_operacional_tokens : k.valor.no_pool_manager_v4_tokens;
        v = hex(mudar[op ? 'saldoOp' : 'saldoPm']?.(k, fonte) ?? BigInt(tokens) * 10n ** BigInt(k.decimals));
      }
      return { result: v };
    }
    throw new Error('método desconhecido ' + corpo.method);
  };
}
const limpo = await reler(REG, { fetcher: rpcSimulado() });
assert.equal(limpo.ok, true, 'o leitor devia conferir o registo limpo');
assert.equal(limpo.concordam, true);
assert.ok(limpo.por_token.every((p) => p.invariantes_falham.length === 0 && p.mudou.length === 0));
const falha = async (nome, mudar, esperado) => {
  const r = await reler(REG, { fetcher: rpcSimulado(mudar) });
  assert.equal(r.ok, false, `leitor: estrago não apanhado: ${nome}`);
  if (esperado) assert.ok(r.por_token.some((p) => p.invariantes_falham.includes(esperado)), `leitor: ${nome} devia falhar em ${esperado}`);
  return 1;
};
n += await falha('uma fonte diz outra oferta', { oferta: (k, f) => (f === '1rpc.io' && k.nome === 'VALIUM' ? 1n : undefined) });
n += await falha('as fontes discordam do código', { codigo: (k, f) => (f === 'mainnet.base.org' && k.nome === 'ORO' ? '0x6060' : undefined) });
n += await falha('implementação trocada nas duas fontes', { codigo: (k) => (k.nome === 'PRESENÇA' ? '0x363d3d373d3d3d363d73' + '1'.repeat(40) + '5af43d82803e903d91602b57fd5bf3' : undefined) }, 'implementação');
n += await falha('casas decimais mudadas', { decimals: (k) => (k.nome === '4SUE' ? 6 : undefined) }, 'casas decimais');
n += await falha('oferta mudada nas três fontes', { oferta: (k) => (k.nome === 'Good reason' ? 5n : undefined) }, 'oferta');
n += await falha('o ORO passa a proxy', { codigo: (k) => (k.nome === 'ORO' ? '0x363d3d373d3d3d363d73' + '2'.repeat(40) + '5af43d82803e903d91602b57fd5bf3' : undefined) }, 'tipo de código');
// Saldos que mudaram não são falha: ficam listados.
const mexidos = await reler(REG, { fetcher: rpcSimulado({ saldoOp: (k) => (k.nome === 'VALIUM' ? 1n : undefined), saldoPm: (k) => (k.nome === 'ORO' ? 7n : undefined) }) });
assert.equal(mexidos.ok, true); n += 1;
assert.deepEqual(mexidos.por_token.find((p) => p.nome === 'VALIUM').mudou, ['saldo da operacional']); n += 1;
assert.deepEqual(mexidos.por_token.find((p) => p.nome === 'ORO').mudou, ['saldo do PoolManager']); n += 1;
await assert.rejects(() => reler({ ...REG, fontes_rpc: ['mainnet.base.org'] }, { fetcher: rpcSimulado() })); n += 1;
// Uma fonte que falha é dispensada, desde que fiquem duas; com menos de duas, recusa.
const comFalha = (falham) => { const base = rpcSimulado(); return async (url, corpo) => { if (falham.includes(url)) throw new Error('HTTP 410'); return base(url, corpo); }; };
const umaCaiu = await reler(REG, { fetcher: comFalha([FONTES['1rpc.io']]) });
assert.equal(umaCaiu.ok, true); assert.equal(umaCaiu.fontes.length, 2); assert.equal(umaCaiu.falharam.length, 1); n += 3;
await assert.rejects(() => reler(REG, { fetcher: comFalha([FONTES['1rpc.io'], FONTES['mainnet.base.org']]) }), /menos de duas fontes/); n += 1;
// O fetcher real repete com espera quando a fonte limita o ritmo, e não repete um erro que não é de ritmo.
const fetchOriginal = globalThis.fetch;
const respostas = (lista) => { let i = 0; globalThis.fetch = async () => { const r = lista[Math.min(i++, lista.length - 1)]; return { ok: r === 200, status: r, json: async () => ({ result: '0x1' }) }; }; return () => i; };
try {
  const esperas = [];
  const conta1 = respostas([429, 429, 200]);
  assert.deepEqual(await fetcherReal('https://x', {}, { espera: 10, esperar: async (ms) => esperas.push(ms) }), { result: '0x1' });
  assert.equal(conta1(), 3); assert.deepEqual(esperas, [10, 20]); n += 3;
  const conta2 = respostas([404, 200]);
  await assert.rejects(() => fetcherReal('https://x', {}, { esperar: async () => {} }), /HTTP 404/); assert.equal(conta2(), 1); n += 2;
  const conta3 = respostas([429]);
  await assert.rejects(() => fetcherReal('https://x', {}, { tentativas: 3, esperar: async () => {} }), /HTTP 429/); assert.equal(conta3(), 3); n += 2;
  const conta4 = respostas([500, 200]);
  assert.deepEqual(await fetcherReal('https://x', {}, { esperar: async () => {} }), { result: '0x1' }); assert.equal(conta4(), 2); n += 2;
} finally { globalThis.fetch = fetchOriginal; }
assert.equal(classificarCodigo('0x' + '60'.repeat(10)).implementacao, null); n += 1;
console.log(`sedimentacao: registo e leitor conferidos; ${n} estragos propositados apanhados.`);

// Verifica token/reconhecimento.json (a regra que reconhece quem detém PRESENÇA ou VALIUM) e o leitor kit/reconhecimento.mjs.
// Cruza os contratos com a sedimentação e a leitura do PRESENÇA, exige a palavra de Unum na cláusula do CLAUDE.md,
// recusa texto que prometa, e corre o leitor contra uma cadeia simulada (detentor, não detentor, fontes que discordam ou caem).
// Cada regra tem um estrago propositado: o mesmo teste, num texto ou num leitor estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { reconhecer, enderecoValido, FONTES } from '../kit/reconhecimento.mjs';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const lerJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sed = lerJson('token/sedimentacao-2026-11-10.json');
const presencaLeitura = lerJson('token/presenca-leitura-2026-11-01.json');
const claude = fs.readFileSync('CLAUDE.md', 'utf8');

function verificar(txt) {
  const r = JSON.parse(txt);
  assert.equal(r.schema, 'orum-reconhecimento-token/v1');
  assert.equal(r.rede.chain_id, 8453);
  assert.ok(new Set(r.fontes_rpc).size >= 2 && r.fontes_rpc.every((n) => FONTES[n]), 'precisa de duas fontes RPC conhecidas');
  // A palavra de Unum existe, tem objecto e está na cláusula.
  assert.equal(r.palavra_de_unum.citacao, 'Eu autorizo');
  assert.match(r.palavra_de_unum.a_proposta, /reconhece quem detém o PRESENÇA/);
  const secao = claude.slice(claude.indexOf('## Reconhecimento do PRESENÇA (Unum, 11/11/2026)'));
  assert.ok(secao.length < claude.length, 'a cláusula do CLAUDE.md não existe');
  assert.ok(secao.slice(0, secao.indexOf('\n## ', 4)).includes(`"${r.palavra_de_unum.citacao}"`), 'a citação não está na cláusula');
  // Os contratos são os já registados, sem inventar.
  assert.deepEqual(r.tokens.map((t) => t.nome), ['PRESENÇA', 'VALIUM']);
  for (const t of r.tokens) {
    assert.match(t.contrato, ADDR);
    const s = sed.tokens.find((x) => x.nome === t.nome);
    assert.equal(t.contrato.toLowerCase(), s.contrato.toLowerCase(), `${t.nome}: contrato diferente da sedimentação`);
    assert.equal(t.decimals, s.decimals);
  }
  assert.equal(r.tokens[0].contrato.toLowerCase(), presencaLeitura.contrato?.toLowerCase?.() ?? r.tokens[0].contrato.toLowerCase());
  // A regra diz o que tem de dizer.
  assert.match(r.regra.detem, /maior que zero/);
  assert.match(r.regra.concordancia, /pelo menos duas fontes/);
  assert.deepEqual(Object.keys(r.regra.estados), ['detem', 'nao_detem', 'inconclusivo', 'endereco_invalido']);
  assert.match(r.regra.estados.inconclusivo, /discordam/);
  assert.equal(r.regra.reconfere, 'node kit/reconhecimento.mjs <endereço>');
  for (const frase of ['não é pagamento', 'não dá direitos', 'não tem preço', 'não prova procura', 'não faz do PRESENÇA meio de pagamento']) {
    assert.ok(r.o_que_nao_e.some((x) => x.includes(frase)), `o_que_nao_e tem de incluir "${frase}"`);
  }
  for (const k of ['que o PRESENÇA seja ou venha a ser moeda', 'preço verificado', 'liquidez real', 'procura', 'receita', 'que reconhecer traga sustento']) assert.ok(r.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.match(r.dependencias.se_falharem_duas, /inconclusivo/);
  assert.ok(r.nao_verificado.length >= 2);
  assert.equal(r.truth_machine.so_leitura, true);
  for (const k of ['move_fundos', 'paga', 'assina', 'altera_executor', 'altera_regras', 'promete_receita']) assert.equal(r.truth_machine[k], false, `truth_machine.${k} tem de ser false`);
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro|será moeda)/i.test(txt), 'texto com promessa');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
}

const txt = fs.readFileSync('token/reconhecimento.json', 'utf8');
verificar(txt);
const REG = JSON.parse(txt);
let n = 0;
const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  n += 1;
};
rejeita('contrato do PRESENÇA trocado', (t) => { t.tokens[0].contrato = '0x' + '1'.repeat(40); });
rejeita('contrato do VALIUM trocado', (t) => { t.tokens[1].contrato = '0x' + '2'.repeat(40); });
rejeita('casas decimais mudadas', (t) => { t.tokens[0].decimals = 6; });
rejeita('token a mais', (t) => { t.tokens.push({ nome: '4SUE', contrato: sed.tokens[2].contrato, decimals: 18 }); });
rejeita('só uma fonte RPC', (t) => { t.fontes_rpc = ['mainnet.base.org']; });
rejeita('fonte desconhecida', (t) => { t.fontes_rpc = ['mainnet.base.org', 'rpc.inventado.example']; });
rejeita('citação trocada', (t) => { t.palavra_de_unum.citacao = 'Autorizo tudo'; });
rejeita('a palavra sem objecto', (t) => { t.palavra_de_unum.a_proposta = 'qualquer coisa'; });
rejeita('detém passa a saldo mínimo qualquer', (t) => { t.regra.detem = 'qualquer sinal'; });
rejeita('concordância de uma fonte', (t) => { t.regra.concordancia = 'basta uma fonte'; });
rejeita('estado em falta', (t) => { delete t.regra.estados.inconclusivo; });
rejeita('inconclusivo deixa de falar de discordância', (t) => { t.regra.estados.inconclusivo = 'não sei'; });
rejeita('tira "não é pagamento"', (t) => { t.o_que_nao_e = t.o_que_nao_e.filter((x) => !x.includes('não é pagamento')); });
rejeita('tira "não prova procura"', (t) => { t.o_que_nao_e = t.o_que_nao_e.filter((x) => !x.includes('não prova procura')); });
rejeita('tira "não faz do PRESENÇA meio de pagamento"', (t) => { t.o_que_nao_e = t.o_que_nao_e.filter((x) => !x.includes('meio de pagamento')); });
rejeita('tira "procura" do nao_afirma', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'procura'); });
rejeita('tira "receita" do nao_afirma', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'receita'); });
rejeita('se falharem duas, deixa de ser inconclusivo', (t) => { t.dependencias.se_falharem_duas = 'diz que detém'; });
rejeita('move_fundos verdadeiro', (t) => { t.truth_machine.move_fundos = true; });
rejeita('assina verdadeiro', (t) => { t.truth_machine.assina = true; });
rejeita('promete_receita verdadeiro', (t) => { t.truth_machine.promete_receita = true; });
rejeita('so_leitura falso', (t) => { t.truth_machine.so_leitura = false; });
rejeita('promessa no texto', (t) => { t.o_que_e += ' Quem detém terá retorno garantido.'; });
rejeita('promessa de moeda', (t) => { t.o_que_e += ' O PRESENÇA será moeda.'; });
rejeita('chave privada no texto', (t) => { t.nao_verificado.push('0x' + 'a'.repeat(64)); });
rejeita('schema errado', (t) => { t.schema = 'x'; });
rejeita('rede errada', (t) => { t.rede.chain_id = 1; });
rejeita('sem nao_verificado', (t) => { t.nao_verificado = []; });

// A cláusula do CLAUDE.md tem de existir: sem ela a palavra não está registada.

// O leitor, contra uma cadeia simulada.
const DETENTOR = '0x' + 'ab'.repeat(20);
const VAZIO = '0x' + 'cd'.repeat(20);
const URLS = Object.fromEntries(Object.entries(FONTES).map(([k, v]) => [v, k]));
const CABECA = 55_600_000;
function cadeia({ saldos = {}, cabeca = {}, falha = [], muda = {} } = {}) {
  const chamadas = [];
  const f = async (url, corpo) => {
    const fonte = URLS[url];
    chamadas.push({ fonte, method: corpo.method, params: corpo.params });
    if (falha.includes(fonte)) throw new Error('HTTP 410');
    if (corpo.method === 'eth_blockNumber') return { result: '0x' + (cabeca[fonte] ?? CABECA).toString(16) };
    if (corpo.method === 'eth_call') {
      const { to, data } = corpo.params[0];
      assert.ok(data.startsWith('0x70a08231'), 'só se chama balanceOf');
      const quem = '0x' + data.slice(-40);
      const tok = REG.tokens.find((t) => t.contrato.toLowerCase() === to.toLowerCase());
      assert.ok(tok, 'só se chamam os dois contratos do registo');
      let v = BigInt(saldos[`${quem}|${tok.nome}`] ?? 0);
      if (muda[fonte]?.[tok.nome] !== undefined) v = BigInt(muda[fonte][tok.nome]);
      return { result: '0x' + v.toString(16).padStart(64, '0') };
    }
    throw new Error('método inesperado ' + corpo.method);
  };
  f.chamadas = chamadas;
  return f;
}
const ler = (end, o) => reconhecer(end, REG, { fetcher: cadeia(o) });

const d1 = await ler(DETENTOR, { saldos: { [`${DETENTOR}|PRESENÇA`]: 5n * 10n ** 18n } });
assert.equal(d1.estado, 'detem'); assert.equal(d1.fontes.length, 3);
assert.equal(d1.por_token.find((p) => p.nome === 'PRESENÇA').detem, true);
assert.equal(d1.por_token.find((p) => p.nome === 'VALIUM').detem, false); n += 4;
const d2 = await ler(DETENTOR, { saldos: { [`${DETENTOR}|VALIUM`]: 1n } });
assert.equal(d2.estado, 'detem', 'uma unidade mínima já é saldo maior que zero'); n += 1;
const d3 = await ler(VAZIO);
assert.equal(d3.estado, 'nao_detem'); assert.ok(d3.por_token.every((p) => p.detem === false && p.saldo_raw === '0')); n += 2;
// Endereço em maiúsculas e minúsculas dá o mesmo.
assert.equal((await ler(DETENTOR.toUpperCase().replace('0X', '0x'), { saldos: { [`${DETENTOR}|PRESENÇA`]: 1n } })).estado, 'detem'); n += 1;
// Todas as leituras são no mesmo bloco, 10 atrás da cabeça mais baixa.
const f4 = cadeia({ cabeca: { 'mainnet.base.org': CABECA + 50, 'base-rpc.publicnode.com': CABECA, '1rpc.io': CABECA + 7 } });
await reconhecer(VAZIO, REG, { fetcher: f4 });
const blocos = new Set(f4.chamadas.filter((c) => c.method === 'eth_call').map((c) => c.params[1]));
assert.deepEqual([...blocos], ['0x' + (CABECA - 10).toString(16)]); n += 1;
// Estragos no leitor: um endereço mal formado, o zero, uma fonte que mente, fontes que caem.
for (const mau of ['', '0x123', 'abc', '0x' + 'g'.repeat(40), null, 42, '0x' + '0'.repeat(40)]) {
  const r = await ler(mau);
  assert.equal(r.estado, 'endereco_invalido', `devia recusar ${String(mau)}`); n += 1;
}
assert.equal(enderecoValido(DETENTOR), true); n += 1;
const discorda = await ler(DETENTOR, { saldos: { [`${DETENTOR}|PRESENÇA`]: 5n }, muda: { '1rpc.io': { PRESENÇA: 0n } } });
assert.equal(discorda.estado, 'inconclusivo', 'uma fonte contra as outras não pode dar "detém"'); assert.match(discorda.motivo, /discordam/); n += 2;
const discordaZero = await ler(VAZIO, { muda: { 'mainnet.base.org': { VALIUM: 9n } } });
assert.equal(discordaZero.estado, 'inconclusivo', 'nem "não detém"'); n += 1;
const umaCaiu = await ler(DETENTOR, { saldos: { [`${DETENTOR}|PRESENÇA`]: 5n }, falha: ['1rpc.io'] });
assert.equal(umaCaiu.estado, 'detem'); assert.equal(umaCaiu.fontes.length, 2); assert.equal(umaCaiu.falharam.length, 1); n += 3;
const duasCaem = await ler(DETENTOR, { saldos: { [`${DETENTOR}|PRESENÇA`]: 5n }, falha: ['1rpc.io', 'mainnet.base.org'] });
assert.equal(duasCaem.estado, 'inconclusivo'); assert.match(duasCaem.motivo, /menos de duas/); n += 2;
const todasCaem = await ler(VAZIO, { falha: Object.keys(FONTES) });
assert.equal(todasCaem.estado, 'inconclusivo', 'sem fontes nunca se diz "não detém"'); n += 1;
// Uma fonte que responde à cabeça mas falha na leitura é dispensada; se ficar uma só, inconclusivo.
const falhaNaLeitura = (quais) => { const base = cadeia(); return async (url, corpo) => { if (corpo.method === 'eth_call' && quais.includes(URLS[url])) throw new Error('HTTP 429'); return base(url, corpo); }; };
const umaFalhaNaLeitura = await reconhecer(VAZIO, REG, { fetcher: falhaNaLeitura(['1rpc.io']) });
assert.equal(umaFalhaNaLeitura.estado, 'nao_detem'); assert.equal(umaFalhaNaLeitura.fontes.length, 2); n += 2;
const duasFalhasNaLeitura = await reconhecer(VAZIO, REG, { fetcher: falhaNaLeitura(['1rpc.io', 'mainnet.base.org']) });
assert.equal(duasFalhasNaLeitura.estado, 'inconclusivo'); n += 1;
// Só uma fonte no registo: não reconhece.
const umaFonte = await reconhecer(VAZIO, { ...REG, fontes_rpc: ['mainnet.base.org'] }, { fetcher: cadeia() });
assert.equal(umaFonte.estado, 'inconclusivo'); n += 1;
// O leitor nunca assina nem envia: só estes dois métodos.
const f5 = cadeia(); await reconhecer(DETENTOR, REG, { fetcher: f5 });
assert.ok(f5.chamadas.every((c) => ['eth_blockNumber', 'eth_call'].includes(c.method)), 'o leitor só pode ler'); n += 1;

console.log(`reconhecimento: regra e leitor conferidos; ${n} estragos propositados apanhados.`);

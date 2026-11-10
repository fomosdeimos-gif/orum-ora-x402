// Verifica economia/executor-operacional-2026-11-10.json (degrau 2 do sustento): o que o executor da operacional consegue assinar e enviar.
// Refaz do código do repositório (supabase/functions/ora-operational-wallet) a lista de acções, os destinos fixos e a contagem de envios,
// confere os hashes do repositório e as contas do registo, e recusa texto que prometa ou que apresente leitura como palavra de Unum.
// Cada regra tem um estrago propositado: o mesmo teste, num texto estragado, tem de falhar.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const DIR = 'supabase/functions/ora-operational-wallet/';
const NOMES = ['index.ts', 'core.mjs', 'cdp.mjs', 'bitcoin.mjs', 'payments.mjs', 'gasless.mjs', 'bazaar.mjs'];
const SHA = /^[0-9a-f]{64}$/;
const codigo = Object.fromEntries(NOMES.map((n) => [n, fs.readFileSync(DIR + n)]));
const texto = Object.fromEntries(NOMES.map((n) => [n, codigo[n].toString('utf8')]));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// O que o código do repositório diz, refeito aqui.
const permitidas = [...texto['core.mjs'].match(/const allowed=\{(.*?)\};/s)[1].matchAll(/(\w+):\['action'/g)].map((m) => m[1]).sort();
const destinoUsdc = texto['payments.mjs'].match(/export const DESTINATION='(0x[0-9a-fA-F]{40})'/)[1];
const tokenUsdc = texto['payments.mjs'].match(/export const TOKEN='(0x[0-9a-fA-F]{40})'/)[1];
const destinoBtc = texto['bitcoin.mjs'].match(/export const BTC_DESTINATION='(bc1[a-z0-9]{30,})'/)[1];
const todos = NOMES.map((n) => texto[n]).join('\n');
const envios = (todos.match(/\.sendTransaction\(/g) || []).length;
const transferSelectors = (todos.match(/0xa9059cbb/g) || []).length;
const approveSelector = todos.includes('095ea7b3');
const assinaturas = [...todos.matchAll(/cdp\.evm\.(signMessage|signTypedData)\(/g)].length;

function verificar(txt) {
  const t = JSON.parse(txt);
  assert.equal(t.schema, 'orum-executor-leitura/v1');
  assert.match(t.lido_em_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(t.funcao_implantada.slug, 'ora-cdp-carteira-real');
  assert.ok(Number.isInteger(t.funcao_implantada.versao) && t.funcao_implantada.versao >= 16, 'versão implantada em falta');
  assert.match(t.funcao_implantada.ezbr_sha256, SHA);
  assert.equal(t.funcao_implantada.copia_no_repositorio, DIR.slice(0, -1));
  // Hashes: o do repositório refaz-se, o implantado só se regista; "igual" tem de ser coerente.
  assert.deepEqual(t.ficheiros.map((f) => f.nome).sort(), [...NOMES].sort(), 'faltam ficheiros do executor');
  for (const f of t.ficheiros) {
    assert.match(f.sha256_implantado, SHA);
    assert.equal(f.sha256_repositorio, sha(codigo[f.nome]), `${f.nome}: o repositório mudou depois desta leitura`);
    assert.equal(f.igual, f.sha256_implantado === f.sha256_repositorio, `${f.nome}: "igual" não bate com os hashes`);
    assert.equal(f.bytes_implantado > 0, true);
  }
  const diferentes = t.ficheiros.filter((f) => !f.igual).map((f) => f.nome);
  assert.equal(t.diferenca_implantado_vs_repositorio ? diferentes.length > 0 : diferentes.length === 0, true, 'a diferença registada não bate com os ficheiros diferentes');
  if (diferentes.length) assert.deepEqual(diferentes, [t.diferenca_implantado_vs_repositorio.ficheiro], 'só se descreveu um ficheiro diferente');
  // Acções: a lista do registo é a do código.
  assert.deepEqual([...t.accoes_aceites].sort(), permitidas, 'a lista de acções não é a do código');
  assert.deepEqual(Object.values(t.accoes_por_classe).flat().sort(), permitidas, 'as classes não cobrem exactamente as acções');
  assert.ok(!permitidas.some((a) => /swap|approve|liquid|pool|bridge|trade/i.test(a)), 'o código passou a ter uma acção de troca, aprovação ou pool: refazer a leitura');
  // Destinos e envios.
  assert.equal(t.destinos_fixos.usdc_base, destinoUsdc, 'destino USDC diferente do código');
  assert.equal(t.destinos_fixos.bitcoin, destinoBtc, 'destino Bitcoin diferente do código');
  assert.equal(t.destinos_fixos.token_usdc_base, tokenUsdc);
  assert.equal(envios, 1, 'o código passou a ter mais (ou menos) de um envio de transacção Base');
  assert.equal(transferSelectors, 1, 'o código passou a codificar outra transferência');
  assert.equal(approveSelector, false, 'o código passou a ter approve');
  assert.ok(assinaturas >= 3, 'esperavam-se as assinaturas de mensagem e de dados tipados já lidas');
  assert.equal(t.tectos.usdc_por_pedido, null);
  assert.equal(t.tectos.usdc_por_dia, null);
  assert.match(texto['core.mjs'], /amount_ceiling_atomic:null,daily_amount_ceiling_atomic:null/, 'o código passou a ter tecto: refazer a leitura');
  // Limites da constituição.
  const c = JSON.parse(fs.readFileSync('economia/constituicao-v2.json', 'utf8'));
  assert.deepEqual(t.constituicao_v2.absolute_limits, c.absolute_limits, 'os limites absolutos mudaram');
  // O que o executor não expõe tem de dizer os tokens da operacional, sem inventar capacidade.
  const nao = t.o_executor_nao_expoe.join(' ');
  for (const w of ['PRESENÇA', 'valium', 'approve', 'contrato arbitrário']) assert.ok(nao.includes(w), `o_executor_nao_expoe tem de dizer ${w}`);
  assert.ok(t.o_cliente_cdp_permite_em_principio.metodos.includes('evm.sendTransaction'));
  assert.match(t.o_cliente_cdp_permite_em_principio.nota, /código novo/);
  assert.match(t.consequencia_para_os_tokens, /acção nova/);
  // Honestidade.
  assert.ok(t.nao_verificado.length >= 4 && t.nao_verificado.some((x) => /ETH/.test(x)), 'tem de dizer o que não verificou, incluindo o gás');
  for (const k of ['move_fundos', 'paga', 'assina', 'altera_executor', 'promete_receita']) assert.equal(t.truth_machine[k], false, `truth_machine.${k} tem de ser false`);
  assert.equal(t.truth_machine.so_leitura, true);
  for (const k of ['que o executor funcione', 'preço', 'liquidez', 'procura', 'receita']) assert.ok(t.nao_afirma.includes(k), `nao_afirma tem de incluir ${k}`);
  assert.match(t.leitura_da_ora, /^Leitura, não palavra de Unum/, 'a leitura da ORA tem de dizer que é leitura');
  assert.ok(!/(garant|prometid|vai valorizar|investimento|retorno|lucro)/i.test(txt), 'texto com promessa');
  assert.ok(!/0x[0-9a-fA-F]{64}\b/.test(txt), 'parece segredo ou chave privada');
  assert.ok(!/(sk_|api[_-]?key["']?\s*[:=]|-----BEGIN)/i.test(txt), 'parece credencial');
}

const txt = fs.readFileSync('economia/executor-operacional-2026-11-10.json', 'utf8');
verificar(txt);

const rejeita = (nome, fn) => {
  const t = JSON.parse(txt);
  fn(t);
  assert.throws(() => verificar(JSON.stringify(t)), undefined, `estrago não apanhado: ${nome}`);
  return 1;
};
let n = 0;
n += rejeita('acção inventada na lista', (t) => { t.accoes_aceites.push('swap_tokens'); });
n += rejeita('acção em falta na lista', (t) => { t.accoes_aceites = t.accoes_aceites.filter((a) => a !== 'btc_send'); });
n += rejeita('classe que não cobre as acções', (t) => { t.accoes_por_classe.so_leitura_ou_conta = []; });
n += rejeita('destino USDC trocado', (t) => { t.destinos_fixos.usdc_base = '0x0000000000000000000000000000000000000001'; });
n += rejeita('destino Bitcoin trocado', (t) => { t.destinos_fixos.bitcoin = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; });
n += rejeita('tecto inventado', (t) => { t.tectos.usdc_por_pedido = '1000000'; });
n += rejeita('hash do repositório errado', (t) => { t.ficheiros[0].sha256_repositorio = 'a'.repeat(64); });
n += rejeita('"igual" mentido', (t) => { t.ficheiros.find((f) => !f.igual).igual = true; });
n += rejeita('ficheiro do executor em falta', (t) => { t.ficheiros.pop(); });
n += rejeita('diferença apontada ao ficheiro errado', (t) => { t.diferenca_implantado_vs_repositorio.ficheiro = 'core.mjs'; });
n += rejeita('versão implantada em falta', (t) => { t.funcao_implantada.versao = 'x'; });
n += rejeita('limites da constituição trocados', (t) => { t.constituicao_v2.absolute_limits.automatic_trade_usdc = 1000; });
n += rejeita('esconde que os tokens ficam parados', (t) => { t.consequencia_para_os_tokens = 'a ORA move os tokens'; });
n += rejeita('o executor passa a expor o PRESENÇA', (t) => { t.o_executor_nao_expoe = t.o_executor_nao_expoe.filter((x) => !x.includes('PRESENÇA')); });
n += rejeita('esconde o gás por verificar', (t) => { t.nao_verificado = t.nao_verificado.filter((x) => !/ETH/.test(x)); });
n += rejeita('move fundos', (t) => { t.truth_machine.move_fundos = true; });
n += rejeita('altera o executor', (t) => { t.truth_machine.altera_executor = true; });
n += rejeita('já não é só leitura', (t) => { t.truth_machine.so_leitura = false; });
n += rejeita('deixa de negar que o executor funcione', (t) => { t.nao_afirma = t.nao_afirma.filter((x) => x !== 'que o executor funcione'); });
n += rejeita('leitura da ORA passa por palavra de Unum', (t) => { t.leitura_da_ora = t.leitura_da_ora.replace('Leitura, não palavra de Unum.', 'Unum disse.'); });
n += rejeita('promessa de lucro', (t) => { t.leitura_da_ora += ' Vai dar lucro.'; });
n += rejeita('chave privada no texto', (t) => { t.objecto += ' 0x' + 'b'.repeat(64); });
n += rejeita('credencial no texto', (t) => { t.objecto += ' api_key: abc'; });
n += rejeita('cliente CDP sem a ressalva do código novo', (t) => { t.o_cliente_cdp_permite_em_principio.nota = 'a conta faz tudo'; });
console.log(`executor-operacional: leitura conferida; ${n} estragos propositados apanhados.`);

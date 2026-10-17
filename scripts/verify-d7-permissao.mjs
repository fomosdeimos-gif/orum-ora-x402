// Verifica que a preparacao da permissao on-chain D7 (economia/d7-permissao-onchain.json) continua so uma
// preparacao: nunca activa, nunca ilimitada, com o gastador, o token e o dono iguais aos registados, o
// tecto dentro da D2 e o calldata igual ao recalculado. Sem rede, sem pagamentos.
// Cada mentira testada aqui tem de falhar.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const raiz = (p) => new URL('../' + p, import.meta.url);
const ler = (p) => readFileSync(raiz(p), 'utf8');
const real = JSON.parse(ler('economia/d7-permissao-onchain.json'));

const registos = {
  gastador: ler('supabase/functions/ora-operational-wallet/payments.mjs').match(/export const SOURCE='(0x[0-9a-fA-F]{40})'/)?.[1],
  token: ler('supabase/functions/ora-operational-wallet/payments.mjs').match(/export const TOKEN='(0x[0-9a-fA-F]{40})'/)?.[1],
  dono: JSON.parse(ler('economia/constituicao-v2.json')).identity_anchors?.destination,
  tectoD2: Number(JSON.parse(ler('economia/constituicao-v3-proposta.json')).decisions.find((d) => d.id === 'D2')?.valor),
};
for (const [k, v] of Object.entries(registos)) assert.ok(v, 'registo de referencia nao encontrado: ' + k);

const palavra = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
export const approve = (spender, atomic) => '0x095ea7b3' + palavra(spender) + BigInt(atomic).toString(16).padStart(64, '0');
const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export function validar(p, reg) {
  const e = [];
  if (p?.format !== 'orum-d7-permissao-onchain/v1') e.push('format desconhecido');
  if (p?.status !== 'preparada_nao_activa') e.push(`estado invalido (${p?.status}): so preparada_nao_activa; activar e de Unum e noutro passo`);
  if (!/n[ãa]o move dinheiro/i.test(p?.fronteira_de_verdade ?? '')) e.push('falta a fronteira de verdade (nao move dinheiro)');
  const q = p?.parametros ?? {};
  if (q.chain_id !== 8453) e.push('rede tem de ser a Base (8453)');
  if (!igual(q.token?.address, reg.token)) e.push('token nao e o USDC registado nos executores');
  if (!igual(q.gastador?.address, reg.gastador)) e.push('o gastador nao e a carteira operacional registada');
  if (!igual(q.dono_que_concede?.address, reg.dono)) e.push('o dono nao e a carteira sagrada registada');
  if (q.ilimitado !== false) e.push('a permissao nao pode ser ilimitada');
  if (!/^[1-9][0-9]*$/.test(q.tecto_atomic ?? '')) e.push('tecto_atomic invalido');
  else if (BigInt(q.tecto_atomic) > BigInt(Math.round(reg.tectoD2 * 1e6))) e.push(`tecto acima da D2 (${reg.tectoD2} USDC)`);
  if (q.tecto_usdc !== Number(q.tecto_atomic) / 1e6) e.push('tecto_usdc nao corresponde a tecto_atomic');
  const texto = JSON.stringify(p);
  if (/0x[fF]{16,}|115792089237316195423570985008687907853269984665640564039457584007913129639935/.test(texto)) e.push('valor maximo (aprovacao ilimitada) na preparacao');
  // enderecos: so os registados e o contrato gestor documentado
  const GESTOR = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';
  const permitidos = new Set([reg.gastador, reg.token, reg.dono, GESTOR].map((x) => x.toLowerCase()));
  for (const a of texto.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []) if (!permitidos.has(a.toLowerCase())) e.push('endereco nao registado: ' + a);
  const B = p?.caminhos?.B_aprovacao_erc20_limitada;
  if (!igual(B?.calldata_approve?.para, reg.token) || !igual(B?.calldata_revogar?.para, reg.token)) e.push('o calldata tem de ser para o token USDC');
  if (q.tecto_atomic && B?.calldata_approve?.dados !== approve(reg.gastador, q.tecto_atomic)) e.push('calldata_approve nao e approve(gastador, tecto)');
  if (B?.calldata_revogar?.dados !== approve(reg.gastador, 0)) e.push('calldata_revogar nao e approve(gastador, 0)');
  if (B?.calldata_approve?.valor_eth !== '0' || B?.calldata_revogar?.valor_eth !== '0') e.push('o calldata nao pode enviar ETH');
  const A = p?.caminhos?.A_spend_permission_da_base;
  const pa = A?.parametros_da_permissao;
  if (!igual(pa?.spender, reg.gastador) || !igual(pa?.account, reg.dono) || !igual(pa?.token, reg.token) || pa?.allowance_atomic !== q.tecto_atomic) e.push('caminho A nao coincide com os parametros');
  if (!A?.contrato_gestor?.estado || !/n[ãa]o confirmado/i.test(A.contrato_gestor.estado)) e.push('o contrato gestor tem de dizer que nao foi confirmado na fonte');
  if (p?.activacao?.a_ORA_pode !== false) e.push('a ORA nao pode activar a permissao');
  if (!/Unum/.test(p?.activacao?.quem ?? '')) e.push('a activacao tem de ser de Unum');
  if (!(p?.activacao?.so_depois_de ?? []).some((x) => /c[óo]digo v3/i.test(x))) e.push('falta a condicao do codigo v3 antes de activar');
  if (!p?.revogacao?.por || !/Unum/.test(p.revogacao.por)) e.push('falta a revogacao por Unum');
  const c1 = (p?.verificacoes_de_compatibilidade ?? []).find((c) => c.id === 'C1');
  if (!c1) e.push('falta a verificacao C1 (tipo de conta)');
  else if (q.dono_que_concede?.tipo_de_conta !== 'nao_verificado' && !(c1.estado === 'feito' && c1.resposta)) e.push('tipo de conta afirmado sem a C1 feita e com resposta');
  const recusas = p?.o_que_a_ORA_nao_faz ?? [];
  if (!recusas.some((x) => /assinar a activa/i.test(x))) e.push('a ORA tem de ficar impedida de assinar a activacao');
  if (!recusas.some((x) => /ilimitada/i.test(x))) e.push('falta a recusa de aprovacao ilimitada');
  return e;
}

const erros = validar(real, registos);
assert.deepEqual(erros, [], 'preparacao D7 invalida: ' + erros.join('; '));

const clone = () => JSON.parse(JSON.stringify(real));
let mentiras = 0;
const falha = (nome, p) => { assert.ok(validar(p, registos).length > 0, `devia falhar: ${nome}`); mentiras++; };
const troca = (a) => a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
let m;
m = clone(); m.status = 'activa'; falha('estado activo', m);
m = clone(); m.status = 'activada'; falha('estado activada', m);
m = clone(); m.fronteira_de_verdade = 'Isto e uma permissao activa.'; falha('sem fronteira de verdade', m);
m = clone(); m.parametros.gastador.address = troca(m.parametros.gastador.address); falha('gastador com uma letra trocada', m);
m = clone(); m.parametros.token.address = troca(m.parametros.token.address); falha('token com uma letra trocada', m);
m = clone(); m.parametros.dono_que_concede.address = troca(m.parametros.dono_que_concede.address); falha('dono com uma letra trocada', m);
m = clone(); m.parametros.tecto_atomic = '5000001'; m.parametros.tecto_usdc = 5.000001; falha('tecto acima da D2', m);
m = clone(); m.parametros.tecto_atomic = '50000000'; m.parametros.tecto_usdc = 50; falha('tecto dez vezes maior', m);
m = clone(); m.parametros.tecto_usdc = 6; falha('tecto_usdc incoerente', m);
m = clone(); m.parametros.ilimitado = true; falha('ilimitado', m);
m = clone(); m.caminhos.B_aprovacao_erc20_limitada.calldata_approve.dados = '0x095ea7b3' + 'f'.repeat(128); falha('aprovacao com valor maximo', m);
m = clone(); m.caminhos.B_aprovacao_erc20_limitada.calldata_approve.dados = approve('0x' + '1'.repeat(40), 5000000); falha('approve para outro gastador', m);
m = clone(); m.caminhos.B_aprovacao_erc20_limitada.calldata_approve.dados = approve(registos.gastador, 6000000); falha('approve com valor diferente do tecto', m);
m = clone(); m.caminhos.B_aprovacao_erc20_limitada.calldata_revogar.dados = approve(registos.gastador, 1); falha('revogacao que nao zera', m);
m = clone(); m.caminhos.B_aprovacao_erc20_limitada.calldata_approve.para = troca(registos.token); falha('calldata para outro contrato', m);
m = clone(); m.caminhos.B_aprovacao_erc20_limitada.calldata_approve.valor_eth = '1'; falha('calldata envia ETH', m);
m = clone(); m.caminhos.A_spend_permission_da_base.parametros_da_permissao.spender = '0x' + '2'.repeat(40); falha('caminho A com outro gastador', m);
m = clone(); m.caminhos.A_spend_permission_da_base.parametros_da_permissao.allowance_atomic = '9000000'; falha('caminho A com outro tecto', m);
m = clone(); m.caminhos.A_spend_permission_da_base.contrato_gestor.estado = 'confirmado'; falha('gestor afirmado como confirmado', m);
m = clone(); m.notas = 'enviar para 0x' + 'ab'.repeat(20); falha('endereco solto', m);
m = clone(); m.activacao.a_ORA_pode = true; falha('a ORA pode activar', m);
m = clone(); m.activacao.quem = 'a ORA'; falha('activacao pela ORA', m);
m = clone(); m.activacao.so_depois_de = m.activacao.so_depois_de.filter((x) => !/código v3/i.test(x)); falha('activar sem codigo v3', m);
m = clone(); delete m.revogacao; falha('sem revogacao', m);
m = clone(); m.parametros.dono_que_concede.tipo_de_conta = 'conta_inteligente'; falha('tipo de conta afirmado sem C1', m);
m = clone(); m.verificacoes_de_compatibilidade = m.verificacoes_de_compatibilidade.filter((c) => c.id !== 'C1'); falha('sem C1', m);
m = clone(); m.o_que_a_ORA_nao_faz = []; falha('sem recusas', m);
m = clone(); m.parametros.chain_id = 1; falha('rede errada', m);
assert.equal(validar(real, { ...registos, tectoD2: 4 }).length > 0, true); mentiras++;

console.log(JSON.stringify({ verified: true, estado: real.status, tecto_usdc: real.parametros.tecto_usdc, casos_de_mentira: mentiras }));

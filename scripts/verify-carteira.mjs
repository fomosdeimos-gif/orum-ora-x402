// Verifica que as carteiras do organismo tem uma fonte unica no codigo de api/ e que tudo o resto concorda:
// funcoes de borda do repositorio, constantes dos scripts de teste e os registos.
// Regime em vigor (Unum, 17/10/2026): servicos pagam so a sagrada ANTIGA (RECEBIMENTO); o executor operacional
// da Base envia os 70% ao DESTINO_70, que e uma das duas sagradas de Unum (hoje a ANTIGA, por escolha da ORA
// autorizada por Unum); a operacional e de uso livre da ORA.
// Sem rede, sem pagamentos. Cada mentira testada aqui tem de falhar.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const raiz = (p) => new URL('../' + p, import.meta.url);
const ler = (p) => readFileSync(raiz(p), 'utf8');
const ADDR = '0x[0-9a-fA-F]{40}';
const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// onde cada consumidor escreve a carteira de recebimento (payTo): [ficheiro, regex com um grupo (o endereco)]
export const CONSUMIDORES = [
  ['supabase/functions/ora-x402/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-licenca/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-oraculo/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-onchain-leitura/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-cdp-teste-oraculo/index.ts', new RegExp(`const WALLET_SAGRADA = '(${ADDR})'`)],
  ['supabase/functions/ora-homeostase/index.ts', new RegExp(`payTo=(${ADDR})`)],
  ['scripts/verify-license-selection.mjs', new RegExp(`const payTo = '(${ADDR})'`)],
  ['scripts/verify-sdk-compatibility.mjs', new RegExp(`const payTo = '(${ADDR})'`)],
  ['scripts/verify-recebimentos.mjs', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['scripts/verify-bazaar-registration.mjs', new RegExp(`payTo:'(${ADDR})'`)],
  ['scripts/diagnose-x402-readonly.mjs', new RegExp(`const PAY_TO = '(${ADDR})'`)],
  // confere o payTo da listagem do Bazaar: acompanha RECEBIMENTO
  ['supabase/functions/ora-operational-wallet/bazaar.mjs', new RegExp(`payTo\\?\\.toLowerCase\\(\\)!=='(${ADDR})'`)],
];
// onde o destino dos 70% (executor operacional da Base) esta escrito: acompanha DESTINO_70
export const CONSUMIDORES_DESTINO = [
  ['supabase/functions/ora-operational-wallet/core.mjs', new RegExp(`transfer_policy:\\{[^}]*destination:'(${ADDR})'`)],
];

export function validar(e) {
  const f = [];
  const c = e.carteira ?? {};
  const a = e.adenda ?? {};
  // 1. os enderecos sao os registados nos executores e na constituicao v2
  if (!igual(c.SAGRADA_ANTIGA, e.v2destino)) f.push('SAGRADA_ANTIGA nao coincide com identity_anchors.destination da v2');
  if (!igual(c.DESTINO_70, e.executor?.DESTINATION)) f.push('DESTINO_70 nao coincide com o destino fixo do executor (DESTINATION)');
  if (!igual(c.DESTINO_70, c.SAGRADA_ANTIGA) && !igual(c.DESTINO_70, c.SAGRADA_NOVA)) f.push('DESTINO_70 tem de ser uma das duas sagradas de Unum');
  if (!igual(c.OPERACIONAL, e.executor?.SOURCE)) f.push('OPERACIONAL nao coincide com a carteira do executor (SOURCE)');
  if (igual(c.SAGRADA_ANTIGA, c.SAGRADA_NOVA) || igual(c.SAGRADA_NOVA, c.OPERACIONAL) || igual(c.SAGRADA_ANTIGA, c.OPERACIONAL)) f.push('as tres carteiras tem de ser distintas');
  // 2. a adenda tem de existir, com citacoes de Unum e um estado conhecido
  if (a.format !== 'orum-financial-constitution/v3-adenda-payto') f.push('adenda desconhecida');
  const ESTADOS = ['autorizada_nao_activa', 'activa', 'substituida'];
  if (!ESTADOS.includes(a.status)) f.push(`estado da adenda invalido (${a.status})`);
  if (!(a.autorizacoes_de_unum ?? []).length || (a.autorizacoes_de_unum ?? []).some((x) => !x?.citacao || String(x.citacao).trim().length < 3)) f.push('a adenda precisa das citacoes de Unum');
  for (const k of ['SAGRADA_ANTIGA', 'SAGRADA_NOVA', 'OPERACIONAL']) if (!igual(a.carteiras?.[k], c[k])) f.push(`${k} da adenda nao coincide com api/_carteira.js`);
  // 3. a regra do payTo: so a sagrada antiga, salvo uma adenda "activa" da opcao 2 com activacao de Unum
  const activa = a.status === 'activa' && a.regime_actual === 'opcao_2' && !!a.activacao?.citacao_activacao && !!a.activacao?.activada_em;
  if (igual(c.RECEBIMENTO, c.SAGRADA_ANTIGA)) {
    if (a.status === 'activa' || a.regime_actual === 'opcao_2') f.push('adenda da opcao 2 activa mas RECEBIMENTO ainda e a sagrada antiga: regime e codigo nao coincidem');
    if (a.status === 'substituida' && a.regime_actual !== 'opcao_3') f.push('adenda substituida tem de declarar regime_actual opcao_3');
  } else if (igual(c.RECEBIMENTO, c.OPERACIONAL)) {
    if (!activa) f.push('RECEBIMENTO mudou para a operacional sem a adenda da opcao 2 activada por Unum (citacao_activacao e activada_em)');
  } else f.push('RECEBIMENTO nao e nem a sagrada antiga nem a operacional registadas');
  if (a.status === 'substituida' && !igual(c.RECEBIMENTO, c.SAGRADA_ANTIGA)) f.push('com a opcao 2 substituida o payTo so pode ser a sagrada antiga');
  if (a.status === 'autorizada_nao_activa' && a.regime_actual !== 'opcao_1') f.push('regime_actual tem de ser opcao_1 enquanto a opcao 2 nao estiver activa');
  // 4. api/ nao guarda copias de nenhum endereco: so o modulo unico
  for (const [nome, texto] of Object.entries(e.api ?? {})) {
    if (nome === '_carteira.js') continue;
    for (const alvo of [c.SAGRADA_ANTIGA, c.SAGRADA_NOVA, c.OPERACIONAL]) {
      if (alvo && texto.toLowerCase().includes(alvo.toLowerCase())) f.push(`api/${nome} tem uma carteira escrita a mao (usar api/_carteira.js)`);
    }
  }
  // 5. consumidores de recebimento dizem o mesmo que RECEBIMENTO; o destino dos 70% diz o mesmo que SAGRADA_NOVA
  for (const [lista, esperado, rotulo] of [[CONSUMIDORES, c.RECEBIMENTO, 'carteira de recebimento'], [CONSUMIDORES_DESTINO, c.DESTINO_70, 'destino dos 70%']]) {
    for (const [ficheiro, re] of lista) {
      const texto = e.consumidores?.[ficheiro];
      if (texto === undefined) { f.push(`consumidor em falta: ${ficheiro}`); continue; }
      const m = texto.match(re);
      if (!m) f.push(`${ficheiro}: nao encontrei a ${rotulo}`);
      else if (!igual(m[1], esperado)) f.push(`${ficheiro}: ${rotulo} diferente do registado`);
    }
  }
  return f;
}

const require_ = createRequire(import.meta.url);
const carteira = { ...require_('../api/_carteira.js') };
const pay = ler('supabase/functions/ora-operational-wallet/payments.mjs');
const real = {
  carteira,
  adenda: JSON.parse(ler('economia/adenda-payto-opcao-2.json')),
  v2destino: JSON.parse(ler('economia/constituicao-v2.json')).identity_anchors?.destination,
  executor: { SOURCE: pay.match(/export const SOURCE='(0x[0-9a-fA-F]{40})'/)?.[1], DESTINATION: pay.match(/export const DESTINATION='(0x[0-9a-fA-F]{40})'/)?.[1] },
  api: Object.fromEntries(readdirSync(raiz('api')).filter((n) => n.endsWith('.js')).map((n) => [n, ler('api/' + n)])),
  consumidores: Object.fromEntries([...CONSUMIDORES, ...CONSUMIDORES_DESTINO].map(([ficheiro]) => [ficheiro, ler(ficheiro)])),
};
const erros = validar(real);
assert.deepEqual(erros, [], 'carteira invalida: ' + erros.join('; '));

// mentiras: cada uma tem de falhar
const clone = () => JSON.parse(JSON.stringify(real));
const troca = (a) => a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
let mentiras = 0;
const falha = (nome, e) => { assert.ok(validar(e).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = clone(); m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL; falha('payTo para a operacional com a opcao 2 substituida', m);
m = clone(); m.carteira.RECEBIMENTO = m.carteira.SAGRADA_NOVA; falha('payTo para a sagrada nova', m);
m = clone(); m.carteira.RECEBIMENTO = '0x' + '5'.repeat(40); falha('payTo para um endereco qualquer', m);
m = clone(); m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL; m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; falha('opcao 2 activa sem citacao de activacao', m);
m = clone(); m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; m.adenda.activacao.citacao_activacao = 'Eu autorizo'; m.adenda.activacao.activada_em = '2026-10-17'; falha('adenda activa com o codigo ainda na sagrada antiga', m);
m = clone(); m.carteira.SAGRADA_ANTIGA = troca(m.carteira.SAGRADA_ANTIGA); falha('SAGRADA_ANTIGA com uma letra trocada', m);
m = clone(); m.carteira.SAGRADA_NOVA = troca(m.carteira.SAGRADA_NOVA); falha('SAGRADA_NOVA com uma letra trocada', m);
m = clone(); m.carteira.OPERACIONAL = troca(m.carteira.OPERACIONAL); falha('OPERACIONAL com uma letra trocada', m);
m = clone(); m.executor.DESTINATION = m.carteira.SAGRADA_NOVA; falha('executor envia a sagrada nova mas DESTINO_70 diz antiga', m);
m = clone(); m.carteira.DESTINO_70 = m.carteira.OPERACIONAL; m.executor.DESTINATION = m.carteira.OPERACIONAL; falha('DESTINO_70 na operacional', m);
m = clone(); m.carteira.DESTINO_70 = '0x' + '8'.repeat(40); m.executor.DESTINATION = m.carteira.DESTINO_70; falha('DESTINO_70 num endereco qualquer', m);
m = clone(); m.executor.DESTINATION = '0x' + '6'.repeat(40); falha('executor envia para um endereco qualquer', m);
m = clone(); m.executor.SOURCE = troca(m.executor.SOURCE); falha('origem do executor diferente', m);
m = clone(); m.v2destino = troca(m.v2destino); falha('ancora da v2 diferente', m);
m = clone(); m.carteira.SAGRADA_NOVA = m.carteira.SAGRADA_ANTIGA; m.executor.DESTINATION = m.carteira.SAGRADA_ANTIGA; falha('duas carteiras iguais', m);
m = clone(); m.adenda.autorizacoes_de_unum = []; falha('adenda sem citacoes de Unum', m);
m = clone(); m.adenda.status = 'qualquer'; falha('estado da adenda invalido', m);
m = clone(); m.adenda.regime_actual = 'opcao_2'; falha('regime opcao_2 sem activar', m);
m = clone(); m.adenda.regime_actual = 'opcao_1'; falha('adenda substituida sem regime opcao_3', m);
m = clone(); m.adenda.carteiras.SAGRADA_NOVA = troca(m.adenda.carteiras.SAGRADA_NOVA); falha('carteira da adenda diferente', m);
for (const alvo of [carteira.SAGRADA_ANTIGA, carteira.SAGRADA_NOVA, carteira.OPERACIONAL]) {
  m = clone(); m.api['a2a.js'] += `\nconst x = '${alvo}';`; falha('endereco escrito a mao em api/', m);
}
for (const [ficheiro, re] of [...CONSUMIDORES, ...CONSUMIDORES_DESTINO]) {
  m = clone(); m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, troca(addr))); falha(`consumidor com a carteira trocada: ${ficheiro}`, m);
  m = clone(); delete m.consumidores[ficheiro]; falha(`consumidor em falta: ${ficheiro}`, m);
}
// o unico caminho para o payTo sair da sagrada antiga: opcao 2 activada de verdade (so com nova adenda de Unum)
m = clone(); m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; m.adenda.activacao.citacao_activacao = 'Eu autorizo'; m.adenda.activacao.activada_em = '2026-10-17'; m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL;
for (const [ficheiro, re] of CONSUMIDORES) m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, carteira.OPERACIONAL));
assert.deepEqual(validar(m), [], 'a mudanca legitima devia passar: ' + validar(m).join('; '));

// e o caminho legitimo para os 70% irem a sagrada nova: DESTINO_70 e o executor acompanham-se
m = clone(); m.carteira.DESTINO_70 = m.carteira.SAGRADA_NOVA; m.executor.DESTINATION = m.carteira.SAGRADA_NOVA;
for (const [ficheiro, re] of CONSUMIDORES_DESTINO) m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, carteira.SAGRADA_NOVA));
assert.deepEqual(validar(m), [], 'mudar o destino dos 70% para a sagrada nova com o executor devia passar: ' + validar(m).join('; '));

console.log(JSON.stringify({ verified: true, regime: real.adenda.regime_actual, recebimento: carteira.RECEBIMENTO, destino_70: carteira.DESTINO_70, consumidores: CONSUMIDORES.length + CONSUMIDORES_DESTINO.length, casos_de_mentira: mentiras }));

// Verifica que as carteiras do organismo tem uma fonte unica no codigo de api/ e que tudo o resto concorda:
// funcoes de borda do repositorio, constantes dos scripts de teste e os registos.
// Regime em vigor (Unum, 21/10/2026, opcao 2 activada na via directa): servicos pagam as carteiras OPERACIONAIS (RECEBIMENTO e
// RECEBIMENTO_BTC); as funcoes de borda do Supabase mantem o payTo implantado (RECEBIMENTO_EDGE = sagrada ANTIGA); o executor
// operacional da Base envia os 70% ao DESTINO_70, que e uma das duas sagradas de Unum (hoje a ANTIGA); a operacional e de uso livre da ORA.
// Sem rede, sem pagamentos. Cada mentira testada aqui tem de falhar.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const raiz = (p) => new URL('../' + p, import.meta.url);
const ler = (p) => readFileSync(raiz(p), 'utf8');
const ADDR = '0x[0-9a-fA-F]{40}';
const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// onde cada consumidor escreve o payTo implantado nas funcoes de borda do Supabase (e os testes que as exercitam): acompanha RECEBIMENTO_EDGE
export const CONSUMIDORES_EDGE = [
  ['supabase/functions/ora-x402/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-licenca/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-oraculo/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-onchain-leitura/index.ts', new RegExp(`const WALLET = '(${ADDR})'`)],
  ['supabase/functions/ora-cdp-teste-oraculo/index.ts', new RegExp(`const WALLET_SAGRADA = '(${ADDR})'`)],
  ['supabase/functions/ora-homeostase/index.ts', new RegExp(`payTo=(${ADDR})`)],
  ['scripts/verify-license-selection.mjs', new RegExp(`const payTo = '(${ADDR})'`)],
  ['scripts/verify-sdk-compatibility.mjs', new RegExp(`const payTo = '(${ADDR})'`)],
  ['scripts/verify-bazaar-registration.mjs', new RegExp(`payTo:'(${ADDR})'`)],
  ['scripts/diagnose-x402-readonly.mjs', new RegExp(`const PAY_TO = '(${ADDR})'`)],
  // confere o payTo da listagem do Bazaar: acompanha RECEBIMENTO_EDGE
  ['supabase/functions/ora-operational-wallet/bazaar.mjs', new RegExp(`payTo\\?\\.toLowerCase\\(\\)!=='(${ADDR})'`)],
];
// onde a via directa da Vercel escreve a carteira de recebimento (payTo): acompanha RECEBIMENTO
export const CONSUMIDORES = [
  ['scripts/verify-recebimentos.mjs', new RegExp(`const WALLET = '(${ADDR})'`)],
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
  // 3b. o payTo implantado nas funcoes de borda e a sagrada antiga; so muda ao implantar (comparar antes com get_edge_function)
  if (!igual(c.RECEBIMENTO_EDGE, c.SAGRADA_ANTIGA)) f.push('RECEBIMENTO_EDGE tem de ser a sagrada antiga (e o que as funcoes de borda implantadas anunciam)');
  // 3c. Bitcoin: a via directa recebe na operacional BTC com a opcao 2 activa, e na sagrada BTC sem ela; os dois enderecos sao os registados
  if (!igual(c.SAGRADA_BTC, e.executor?.BTC_DESTINATION)) f.push('SAGRADA_BTC nao coincide com o destino fixo do executor Bitcoin (BTC_DESTINATION)');
  if (!igual(a.carteiras?.BTC_SAGRADO_ANTIGO, c.SAGRADA_BTC) || !igual(a.carteiras?.BTC_OPERACIONAL, c.OPERACIONAL_BTC)) f.push('carteiras Bitcoin da adenda nao coincidem com api/_carteira.js');
  if (igual(c.SAGRADA_BTC, c.OPERACIONAL_BTC)) f.push('as duas carteiras Bitcoin tem de ser distintas');
  if (activa ? !igual(c.RECEBIMENTO_BTC, c.OPERACIONAL_BTC) : !igual(c.RECEBIMENTO_BTC, c.SAGRADA_BTC)) f.push('RECEBIMENTO_BTC tem de acompanhar o regime: operacional BTC com a opcao 2 activa, sagrada BTC sem ela');
  if (igual(c.RECEBIMENTO, c.OPERACIONAL) !== igual(c.RECEBIMENTO_BTC, c.OPERACIONAL_BTC)) f.push('Base e Bitcoin tem de receber na mesma classe de carteira (as duas operacionais ou as duas sagradas)');
  // 4. api/ nao guarda copias de nenhum endereco: so o modulo unico
  for (const [nome, texto] of Object.entries(e.api ?? {})) {
    if (nome === '_carteira.js') continue;
    for (const alvo of [c.SAGRADA_ANTIGA, c.SAGRADA_NOVA, c.OPERACIONAL]) {
      if (alvo && texto.toLowerCase().includes(alvo.toLowerCase())) f.push(`api/${nome} tem uma carteira escrita a mao (usar api/_carteira.js)`);
    }
  }
  // 5. consumidores de recebimento dizem o mesmo que RECEBIMENTO; o destino dos 70% diz o mesmo que SAGRADA_NOVA
  for (const [lista, esperado, rotulo] of [[CONSUMIDORES, c.RECEBIMENTO, 'carteira de recebimento'], [CONSUMIDORES_EDGE, c.RECEBIMENTO_EDGE, 'payTo implantado nas funcoes de borda'], [CONSUMIDORES_DESTINO, c.DESTINO_70, 'destino dos 70%']]) {
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
  executor: { SOURCE: pay.match(/export const SOURCE='(0x[0-9a-fA-F]{40})'/)?.[1], DESTINATION: pay.match(/export const DESTINATION='(0x[0-9a-fA-F]{40})'/)?.[1],
    BTC_DESTINATION: ler('supabase/functions/ora-operational-wallet/bitcoin.mjs').match(/export const BTC_DESTINATION='(bc1[0-9a-z]{20,})'/)?.[1] },
  api: Object.fromEntries(readdirSync(raiz('api')).filter((n) => n.endsWith('.js')).map((n) => [n, ler('api/' + n)])),
  consumidores: Object.fromEntries([...CONSUMIDORES, ...CONSUMIDORES_EDGE, ...CONSUMIDORES_DESTINO].map(([ficheiro]) => [ficheiro, ler(ficheiro)])),
};
const erros = validar(real);
assert.deepEqual(erros, [], 'carteira invalida: ' + erros.join('; '));

// mentiras: cada uma tem de falhar
const clone = () => JSON.parse(JSON.stringify(real));
const troca = (a) => a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
let mentiras = 0;
const falha = (nome, e) => { assert.ok(validar(e).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = clone(); m.carteira.RECEBIMENTO = m.carteira.SAGRADA_ANTIGA; falha('opcao 2 activa mas payTo ainda na sagrada antiga', m);
m = clone(); m.carteira.RECEBIMENTO = m.carteira.SAGRADA_NOVA; falha('payTo para a sagrada nova', m);
m = clone(); m.carteira.RECEBIMENTO = '0x' + '5'.repeat(40); falha('payTo para um endereco qualquer', m);
m = clone(); m.adenda.activacao.citacao_activacao = null; falha('opcao 2 activa sem citacao de activacao', m);
m = clone(); m.adenda.activacao.activada_em = null; falha('opcao 2 activa sem data de activacao', m);
m = clone(); m.adenda.status = 'substituida'; m.adenda.regime_actual = 'opcao_3'; falha('payTo na operacional com a adenda substituida', m);
m = clone(); m.adenda.status = 'autorizada_nao_activa'; m.adenda.regime_actual = 'opcao_1'; falha('payTo na operacional com a opcao 2 so autorizada', m);
m = clone(); m.carteira.RECEBIMENTO_EDGE = m.carteira.OPERACIONAL; falha('payTo das funcoes de borda dado como a operacional sem as implantar', m);
m = clone(); m.carteira.RECEBIMENTO_BTC = m.carteira.SAGRADA_BTC; falha('Bitcoin ainda na sagrada com a opcao 2 activa', m);
m = clone(); m.carteira.RECEBIMENTO_BTC = 'bc1q' + 'x'.repeat(38); falha('Bitcoin num endereco qualquer', m);
m = clone(); m.carteira.SAGRADA_BTC = troca(m.carteira.SAGRADA_BTC); falha('SAGRADA_BTC com uma letra trocada', m);
m = clone(); m.carteira.OPERACIONAL_BTC = troca(m.carteira.OPERACIONAL_BTC); m.carteira.RECEBIMENTO_BTC = m.carteira.OPERACIONAL_BTC; falha('OPERACIONAL_BTC diferente da adenda', m);
m = clone(); m.executor.BTC_DESTINATION = troca(m.executor.BTC_DESTINATION); falha('executor Bitcoin envia para outro endereco', m);
m = clone(); m.carteira.OPERACIONAL_BTC = m.carteira.SAGRADA_BTC; falha('carteiras Bitcoin iguais', m);
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
m = clone(); m.adenda.regime_actual = 'opcao_3'; falha('adenda activa mas regime declarado opcao_3', m);
m = clone(); m.adenda.regime_actual = 'opcao_1'; falha('adenda activa com regime opcao_1', m);
m = clone(); m.adenda.carteiras.SAGRADA_NOVA = troca(m.adenda.carteiras.SAGRADA_NOVA); falha('carteira da adenda diferente', m);
for (const alvo of [carteira.SAGRADA_ANTIGA, carteira.SAGRADA_NOVA, carteira.OPERACIONAL]) {
  m = clone(); m.api['a2a.js'] += `\nconst x = '${alvo}';`; falha('endereco escrito a mao em api/', m);
}
for (const [ficheiro, re] of [...CONSUMIDORES, ...CONSUMIDORES_EDGE, ...CONSUMIDORES_DESTINO]) {
  m = clone(); m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, troca(addr))); falha(`consumidor com a carteira trocada: ${ficheiro}`, m);
  m = clone(); delete m.consumidores[ficheiro]; falha(`consumidor em falta: ${ficheiro}`, m);
}
// o caminho de volta: Unum revoga e o payTo regressa a sagrada antiga, na Base e no Bitcoin, com a adenda a dizê-lo
m = clone(); m.adenda.status = 'substituida'; m.adenda.regime_actual = 'opcao_3'; m.carteira.RECEBIMENTO = m.carteira.SAGRADA_ANTIGA; m.carteira.RECEBIMENTO_BTC = m.carteira.SAGRADA_BTC;
for (const [ficheiro, re] of CONSUMIDORES) m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, carteira.SAGRADA_ANTIGA));
assert.deepEqual(validar(m), [], 'reverter para a sagrada antiga devia passar: ' + validar(m).join('; '));

// e o caminho legitimo para os 70% irem a sagrada nova: DESTINO_70 e o executor acompanham-se
m = clone(); m.carteira.DESTINO_70 = m.carteira.SAGRADA_NOVA; m.executor.DESTINATION = m.carteira.SAGRADA_NOVA;
for (const [ficheiro, re] of CONSUMIDORES_DESTINO) m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, carteira.SAGRADA_NOVA));
assert.deepEqual(validar(m), [], 'mudar o destino dos 70% para a sagrada nova com o executor devia passar: ' + validar(m).join('; '));

console.log(JSON.stringify({ verified: true, regime: real.adenda.regime_actual, recebimento: carteira.RECEBIMENTO, destino_70: carteira.DESTINO_70, consumidores: CONSUMIDORES.length + CONSUMIDORES_EDGE.length + CONSUMIDORES_DESTINO.length, casos_de_mentira: mentiras }));

// Verifica que a carteira de recebimento (payTo) tem uma fonte unica no codigo de api/ e que tudo o resto
// concorda com ela: funcoes de borda do repositorio, constantes dos scripts de teste e os registos.
// E que RECEBIMENTO so sai da carteira sagrada (opcao 1) com a adenda da opcao 2 activada por Unum.
// Sem rede, sem pagamentos. Cada mentira testada aqui tem de falhar.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const raiz = (p) => new URL('../' + p, import.meta.url);
const ler = (p) => readFileSync(raiz(p), 'utf8');
const ADDR = '0x[0-9a-fA-F]{40}';
const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// onde cada consumidor escreve a carteira de recebimento: [ficheiro, regex com um grupo (o endereco)]
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
// onde a carteira do SUSTENTO (destino dos executores) esta escrita: acompanha SUSTENTO, nunca RECEBIMENTO
export const CONSUMIDORES_SUSTENTO = [
  ['supabase/functions/ora-operational-wallet/core.mjs', new RegExp(`transfer_policy:\\{[^}]*destination:'(${ADDR})'`)],
];

export function validar(e) {
  const f = [];
  const c = e.carteira ?? {};
  const a = e.adenda ?? {};
  // 1. os tres enderecos sao os registados nos executores e na constituicao v2
  if (!igual(c.SUSTENTO, e.v2destino)) f.push('SUSTENTO nao coincide com identity_anchors.destination da v2');
  if (!igual(c.SUSTENTO, e.executor?.DESTINATION)) f.push('SUSTENTO nao coincide com o destino fixo do executor');
  if (!igual(c.OPERACIONAL, e.executor?.SOURCE)) f.push('OPERACIONAL nao coincide com a carteira do executor');
  // 2. a adenda tem de existir, com citacoes de Unum e um estado conhecido
  if (a.format !== 'orum-financial-constitution/v3-adenda-payto') f.push('adenda desconhecida');
  const ESTADOS = ['autorizada_nao_activa', 'activa'];
  if (!ESTADOS.includes(a.status)) f.push(`estado da adenda invalido (${a.status})`);
  if (!(a.autorizacoes_de_unum ?? []).length || (a.autorizacoes_de_unum ?? []).some((x) => !x?.citacao || String(x.citacao).trim().length < 3)) f.push('a adenda precisa das citacoes de Unum');
  if (!igual(a.carteiras?.SUSTENTO, c.SUSTENTO) || !igual(a.carteiras?.OPERACIONAL, c.OPERACIONAL)) f.push('as carteiras da adenda nao coincidem com api/_carteira.js');
  // 3. a regra: so se sai da sagrada com a adenda activada por Unum
  const activa = a.status === 'activa' && a.regime_actual === 'opcao_2' && !!a.activacao?.citacao_activacao && !!a.activacao?.activada_em;
  if (igual(c.RECEBIMENTO, c.SUSTENTO)) {
    if (a.status === 'activa' || a.regime_actual === 'opcao_2') f.push('adenda activa mas RECEBIMENTO ainda e a sagrada: regime e codigo nao coincidem');
  } else if (igual(c.RECEBIMENTO, c.OPERACIONAL)) {
    if (!activa) f.push('RECEBIMENTO mudou para a operacional sem a adenda activada por Unum (citacao_activacao e activada_em)');
  } else f.push('RECEBIMENTO nao e nem a sagrada nem a operacional registadas');
  if (a.status !== 'activa' && a.regime_actual !== 'opcao_1') f.push('regime_actual tem de ser opcao_1 enquanto a adenda nao estiver activa');
  // 4. api/ nao guarda copias do endereco: so o modulo unico
  for (const [nome, texto] of Object.entries(e.api ?? {})) {
    if (nome === '_carteira.js') continue;
    for (const alvo of [c.SUSTENTO, c.RECEBIMENTO, c.OPERACIONAL]) {
      if (alvo && texto.toLowerCase().includes(alvo.toLowerCase())) f.push(`api/${nome} tem a carteira escrita a mao (usar api/_carteira.js)`);
    }
  }
  // 5. todos os consumidores fora de api/ dizem o mesmo que RECEBIMENTO
  for (const [ficheiro, re] of CONSUMIDORES) {
    const texto = e.consumidores?.[ficheiro];
    if (texto === undefined) { f.push(`consumidor em falta: ${ficheiro}`); continue; }
    const m = texto.match(re);
    if (!m) f.push(`${ficheiro}: nao encontrei a carteira de recebimento`);
    else if (!igual(m[1], c.RECEBIMENTO)) f.push(`${ficheiro}: carteira de recebimento diferente de RECEBIMENTO`);
  }
  for (const [ficheiro, re] of CONSUMIDORES_SUSTENTO) {
    const texto = e.consumidores?.[ficheiro];
    if (texto === undefined) { f.push(`consumidor do sustento em falta: ${ficheiro}`); continue; }
    const m = texto.match(re);
    if (!m) f.push(`${ficheiro}: nao encontrei o destino do sustento`);
    else if (!igual(m[1], c.SUSTENTO)) f.push(`${ficheiro}: destino do sustento diferente de SUSTENTO`);
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
  consumidores: Object.fromEntries([...CONSUMIDORES, ...CONSUMIDORES_SUSTENTO].map(([ficheiro]) => [ficheiro, ler(ficheiro)])),
};
const erros = validar(real);
assert.deepEqual(erros, [], 'carteira invalida: ' + erros.join('; '));

// mentiras: cada uma tem de falhar
const clone = () => JSON.parse(JSON.stringify(real));
const troca = (a) => a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
let mentiras = 0;
const falha = (nome, e) => { assert.ok(validar(e).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = clone(); m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL; falha('payTo para a operacional sem activacao', m);
m = clone(); m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL; m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; falha('activa sem citacao de activacao', m);
m = clone(); m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL; m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; m.adenda.activacao.citacao_activacao = 'Eu autorizo'; falha('activa sem data de activacao', m);
m = clone(); m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; m.adenda.activacao.citacao_activacao = 'Eu autorizo'; m.adenda.activacao.activada_em = '2026-10-17'; falha('adenda activa com o codigo ainda na sagrada', m);
m = clone(); m.carteira.RECEBIMENTO = '0x' + '5'.repeat(40); falha('payTo para um endereco qualquer', m);
m = clone(); m.carteira.SUSTENTO = troca(m.carteira.SUSTENTO); falha('SUSTENTO com uma letra trocada', m);
m = clone(); m.carteira.OPERACIONAL = troca(m.carteira.OPERACIONAL); falha('OPERACIONAL com uma letra trocada', m);
m = clone(); m.executor.DESTINATION = troca(m.executor.DESTINATION); falha('destino do executor diferente', m);
m = clone(); m.v2destino = troca(m.v2destino); falha('ancora da v2 diferente', m);
m = clone(); m.adenda.autorizacoes_de_unum = []; falha('adenda sem citacoes de Unum', m);
m = clone(); m.adenda.status = 'qualquer'; falha('estado da adenda invalido', m);
m = clone(); m.adenda.regime_actual = 'opcao_2'; falha('regime opcao_2 sem activar', m);
m = clone(); m.adenda.carteiras.OPERACIONAL = troca(m.adenda.carteiras.OPERACIONAL); falha('carteira da adenda diferente', m);
m = clone(); m.api['a2a.js'] += `\nconst x = '${carteira.RECEBIMENTO}';`; falha('endereco escrito a mao em api/', m);
for (const [ficheiro, re] of CONSUMIDORES) {
  m = clone(); m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, troca(addr))); falha(`consumidor com a carteira trocada: ${ficheiro}`, m);
  m = clone(); delete m.consumidores[ficheiro]; falha(`consumidor em falta: ${ficheiro}`, m);
}
for (const [ficheiro, re] of CONSUMIDORES_SUSTENTO) {
  m = clone(); m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, troca(addr))); falha(`destino do sustento trocado: ${ficheiro}`, m);
  m = clone(); delete m.consumidores[ficheiro]; falha(`consumidor do sustento em falta: ${ficheiro}`, m);
}
// e prova de que o ponto de mudanca legitimo funcionaria: activada de verdade, passa
m = clone(); m.carteira.RECEBIMENTO = m.carteira.OPERACIONAL; m.adenda.status = 'activa'; m.adenda.regime_actual = 'opcao_2'; m.adenda.activacao.citacao_activacao = 'Eu autorizo'; m.adenda.activacao.activada_em = '2026-10-17';
for (const [ficheiro, re] of CONSUMIDORES) m.consumidores[ficheiro] = m.consumidores[ficheiro].replace(re, (todo, addr) => todo.replace(addr, carteira.OPERACIONAL));
assert.deepEqual(validar(m), [], 'a mudanca legitima devia passar: ' + validar(m).join('; '));

console.log(JSON.stringify({ verified: true, regime: real.adenda.regime_actual, recebimento: carteira.RECEBIMENTO, consumidores: CONSUMIDORES.length + CONSUMIDORES_SUSTENTO.length, casos_de_mentira: mentiras }));

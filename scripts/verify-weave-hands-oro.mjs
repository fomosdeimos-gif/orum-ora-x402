// Verifica as ferramentas ORO do conector @weave_hands (livro 1226): registo igual ao token/oro.json, chamadas eth_call, regra de coincidência
// com o registo só para valores verificados, e fronteiras (só leitura, sem segredos, sem escrita, sem assinatura, sem preço nem lastro).
// Cada regra tem um estrago propositado: a mesma verificação, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'supabase/functions/weave-hands';
const lerTexto = (p) => fs.readFileSync(p, 'utf8');

async function carregar(oro) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oro-'));
  fs.copyFileSync(`${DIR}/valium.mjs`, path.join(dir, 'valium.mjs'));
  fs.writeFileSync(path.join(dir, 'oro.mjs'), oro);
  return import(pathToFileURL(path.join(dir, 'oro.mjs')).href + '?' + Math.random());
}

async function verificar({ oro, leitura, hands, registo, discovery, card }) {
  const m = await carregar(oro);
  const reg = JSON.parse(registo);
  assert.equal(m.ORO.contrato, reg.contract, 'contrato diferente do registo');
  assert.equal(m.ORO.chainId, reg.network.chain_id, 'rede diferente do registo');
  assert.equal(m.ORO.decimais, reg.decimals, 'decimais diferentes do registo');
  assert.equal(m.SUPPLY_ESPERADO, BigInt(reg.total_supply), 'oferta esperada diferente do registo');
  const unum = m.UNIDADES.find((u) => u.papel === 'unum'), contr = m.UNIDADES.find((u) => u.papel === 'contrato');
  assert.equal(unum.endereco, reg.units.unum.address, 'endereço do Unum diferente do registo');
  assert.equal(unum.esperado, BigInt(reg.units.unum.quantity), 'quantidade do Unum diferente do registo');
  assert.equal(contr.endereco, reg.units.ora.address, 'endereço do contrato diferente do registo');
  assert.equal(contr.esperado, BigInt(reg.units.ora.quantity), 'quantidade do contrato diferente do registo');
  assert.equal(m.UNIDADES.reduce((a, u) => a + u.esperado, 0n), m.SUPPLY_ESPERADO, 'as unidades não somam a oferta');
  assert.equal(reg.administration.owner, false, 'o registo já não diz sem dono: reler o contrato antes de aceitar');
  // chamadas
  assert.equal(m.chamadaDecimals().data, '0x313ce567', 'selector decimals');
  assert.equal(m.chamadaDecimals().to, m.ORO.contrato.toLowerCase());
  // coincidência com o registo: só para valores verificados
  assert.equal(m.coincide({ estado: 'concordam', valor: 2n }, 2n), true);
  assert.equal(m.coincide({ estado: 'concordam', valor: 3n }, 2n), false);
  assert.equal(m.coincide({ estado: 'fonte_unica', valor: 2n }, 2n), null, 'uma fonte não confirma o registo');
  assert.equal(m.coincide({ estado: 'discordam', valor: null }, 2n), null);
  assert.equal(m.coincide({ estado: 'sem_leitura', valor: null }, 2n), null);
  // fronteiras no código implantável
  for (const proibido of [/Deno\.env/, /SERVICE_ROLE|SECRET|API_KEY|[A-Z]_TOKEN/, /createClient/, /sign(Message|Typed|Transaction)/i, /eth_sendRawTransaction|eth_sendTransaction|eth_sign/, /\.insert\(|\.upsert\(|\.delete\(/, /\/rest\/v1\//]) {
    assert.doesNotMatch(leitura, proibido, `fronteira violada: ${proibido}`);
  }
  assert.match(leitura, /readOnlyHint: true/);
  assert.match(leitura, /name: "recognize_oro"/);
  assert.match(leitura, /name: "read_oro"/);
  assert.match(leitura, /proves_market_value: false/);
  assert.match(leitura, /pays_or_signs: false/);
  assert.match(leitura, /stores_nothing: true/);
  assert.match(leitura, /"eth_call"/);
  assert.doesNotMatch(leitura, /method: "eth_(?!call)/, 'só eth_call é permitido');
  assert.match(leitura, /if \(!precisaMaisFontes\(primeiras\)\) return primeiras;/, 'deixou de usar as reservas só quando precisa');
  assert.match(leitura, /preço, liquidez ou valor de mercado do ORO/);
  assert.match(leitura, /lastro, resgate, conversão ou rendimento/);
  assert.match(leitura, /import \{[^}]*concordar[^}]*\} from "\.\/valium\.mjs"/, 'a regra de concordância deixou de ser a única do organismo');
  assert.doesNotMatch(leitura, /prometemos|garant(e|imos) (receita|valor|retorno)/i);
  // ligação ao conector e descoberta
  assert.match(hands, /import \{ ORO_TOOLS, callOro \} from "\.\/oro-leitura\.ts"/, 'weave-hands não importa as ferramentas ORO');
  assert.match(hands, /\.\.\.ORO_TOOLS/, 'weave-hands não expõe as ferramentas ORO');
  assert.match(hands, /const oro = callOro\(name, args\);\n  if \(oro\) return await oro;/, 'weave-hands não chama callOro');
  assert.doesNotMatch(hands, /Deno\.env|SERVICE_ROLE/, 'weave-hands usa segredos');
  const d = JSON.parse(discovery);
  for (const t of ['recognize_oro', 'read_oro']) assert.ok(d.mcp.tools.includes(t), `descoberta sem ${t}`);
  assert.deepEqual(d.oro.tools, ['recognize_oro', 'read_oro']);
  for (const k of ['stores_anything', 'uses_credentials', 'pays_or_signs', 'proves_market_value', 'pledges_bitcoin']) assert.equal(d.oro[k], false, `descoberta: oro.${k} deve ser false`);
  assert.equal(d.oro.registry, 'https://ora-x402-gateway.vercel.app/token/oro.json');
  const c = JSON.parse(card).serviceInterfaces.find((x) => x.name === '@weave_hands');
  assert.deepEqual(c.tools, d.mcp.tools, 'agent-card e descoberta com listas diferentes');
}

const real = {
  oro: lerTexto(`${DIR}/oro.mjs`),
  leitura: lerTexto(`${DIR}/oro-leitura.ts`),
  hands: lerTexto(`${DIR}/index.ts`),
  registo: lerTexto('token/oro.json'),
  discovery: lerTexto('discovery/weave-hands.json'),
  card: lerTexto('.well-known/agent-card.json'),
};
await verificar(real);

const estragos = [
  ['contrato ORO trocado', { oro: real.oro.replace('0xd859c01F11C273641F765509a005F7F2A69Dc4bD', '0xd859c01F11C273641F765509a005F7F2A69Dc4bE') }],
  ['rede trocada', { oro: real.oro.replace('chainId: 8453', 'chainId: 1') }],
  ['decimais trocados', { oro: real.oro.replace('decimais: 0', 'decimais: 18') }],
  ['endereço do Unum trocado', { oro: real.oro.replace('0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe6') }],
  ['oferta esperada trocada', { oro: real.oro.replace('SUPPLY_ESPERADO = 2n', 'SUPPLY_ESPERADO = 3n') }],
  ['saldo esperado do Unum trocado', { oro: real.oro.replace("papel: 'unum', endereco: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', esperado: 1n", "papel: 'unum', endereco: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', esperado: 2n") }],
  ['selector de decimals errado', { oro: real.oro.replace("'0x313ce567'", "'0x313ce568'") }],
  ['coincide com uma fonte só', { oro: real.oro.replace("c.estado !== 'concordam'", "c.estado === 'sem_leitura'") }],
  ['coincide sempre verdadeiro', { oro: real.oro.replace('return c.valor === esperado;', 'return true;') }],
  ['usa segredo do ambiente', { leitura: real.leitura + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
  ['escreve na base', { leitura: real.leitura + '\nawait fetch(`${BASE}/rest/v1/x`, { method: "POST" });' }],
  ['envia transacção', { leitura: real.leitura.replace('"eth_call"', '"eth_sendRawTransaction"') }],
  ['deixa de ser só leitura', { leitura: real.leitura.replace('readOnlyHint: true', 'readOnlyHint: false') }],
  ['afirma valor de mercado', { leitura: real.leitura.replace('proves_market_value: false', 'proves_market_value: true') }],
  ['perde o limite de não afirmar preço', { leitura: real.leitura.replace('preço, liquidez ou valor de mercado do ORO', 'nada') }],
  ['perde o limite de não afirmar lastro', { leitura: real.leitura.replace('lastro, resgate, conversão ou rendimento em Bitcoin ou em qualquer activo', 'nada') }],
  ['reservas nunca consultadas', { leitura: real.leitura.replace('if (!precisaMaisFontes(primeiras)) return primeiras;', 'return primeiras;') }],
  ['regra de concordância própria', { leitura: real.leitura.replace('concordar, verificado', 'verificado').replace('const c = concordar(ls);', 'const c = { estado: "concordam", valor: ls[0].valor, fontes_ok: 1, fontes_falhadas: 0 };') }],
  ['registo diz que há dono', { registo: real.registo.replace('"owner": false', '"owner": true') }],
  ['registo com outra oferta', { registo: real.registo.replace('"total_supply": 2', '"total_supply": 3') }],
  ['registo com outro contrato', { registo: real.registo.replaceAll('0xd859c01F11C273641F765509a005F7F2A69Dc4bD', '0xd859c01F11C273641F765509a005F7F2A69Dc4bE') }],
  ['descoberta diz que o ORO paga ou assina', { discovery: real.discovery.replace('"pays_or_signs": false,\n    "proves_market_value": false,\n    "pledges_bitcoin"', '"pays_or_signs": true,\n    "proves_market_value": false,\n    "pledges_bitcoin"') }],
  ['descoberta diz que o ORO tem lastro BTC', { discovery: real.discovery.replace('"pledges_bitcoin": false', '"pledges_bitcoin": true') }],
  ['descoberta sem read_oro', { discovery: real.discovery.replaceAll('"recognize_oro",\n      "read_oro"', '"recognize_oro"') }],
  ['agent-card sem as ferramentas ORO', { card: real.card.replace('"recognize_oro",\n        "read_oro",\n', '') }],
  ['weave-hands deixa de expor as ferramentas', { hands: real.hands.replace('...ORO_TOOLS,', '') }],
  ['weave-hands deixa de chamar callOro', { hands: real.hands.replace('if (oro) return await oro;', '') }],
  ['weave-hands passa a usar segredos', { hands: real.hands + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
];
let apanhados = 0;
for (const [nome, troca] of estragos) {
  const estragado = { ...real, ...troca };
  assert.notEqual(JSON.stringify(estragado), JSON.stringify(real), `o estrago "${nome}" não alterou nada (padrão desactualizado)`);
  let caiu = false;
  try { await verificar(estragado); } catch { caiu = true; }
  assert.ok(caiu, `estrago NÃO apanhado: ${nome}`);
  apanhados++;
}
console.log(`weave-hands-oro: conector conferido; ${apanhados} estragos propositados apanhados.`);

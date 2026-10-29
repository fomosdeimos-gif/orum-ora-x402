// Verifica as ferramentas VALIUM do conector @weave_hands (livro 1144): registo igual ao identity/valium.json, namehash do ENS conferido por
// um keccak256 independente, regra de concordância, e fronteiras (só leitura, sem segredos, sem escrita, sem assinatura).
// Cada regra tem um estrago propositado: a mesma verificação, num texto estragado, tem de falhar.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'supabase/functions/weave-hands';
const lerTexto = (p) => fs.readFileSync(p, 'utf8');

// keccak256 independente (Keccak-f[1600], padding 0x01), para o namehash do ENS.
const RC = [0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
const ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
const M = (1n << 64n) - 1n;
const rol = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M);
function keccakF(A) {
  for (const rc of RC) {
    const C = [0, 1, 2, 3, 4].map((x) => A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4]);
    const D = [0, 1, 2, 3, 4].map((x) => C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1));
    A = A.map((col, x) => col.map((v) => v ^ D[x]));
    const B = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y][(2 * x + 3 * y) % 5] = rol(A[x][y], ROT[x][y]);
    A = B.map((col, x) => col.map((v, y) => v ^ (~B[(x + 1) % 5][y] & M & B[(x + 2) % 5][y])));
    A[0][0] ^= rc;
  }
  return A;
}
function keccak256(bytes) {
  const rate = 136;
  const d = [...bytes, 1];
  while (d.length % rate) d.push(0);
  d[d.length - 1] |= 0x80;
  let A = Array.from({ length: 5 }, () => Array(5).fill(0n));
  for (let o = 0; o < d.length; o += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let w = 0n;
      for (let b = 7; b >= 0; b--) w = (w << 8n) | BigInt(d[o + 8 * i + b]);
      A[i % 5][Math.floor(i / 5)] ^= w;
    }
    A = keccakF(A);
  }
  const out = [];
  for (let i = 0; i < 4; i++) { let w = A[i % 5][Math.floor(i / 5)]; for (let b = 0; b < 8; b++) { out.push(Number(w & 0xffn)); w >>= 8n; } }
  return Buffer.from(out);
}
const namehash = (nome) => nome.split('.').reverse().reduce((h, l) => keccak256(Buffer.concat([h, keccak256(Buffer.from(l))])), Buffer.alloc(32));

async function carregar(textoValium) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'valium-')), 'valium.mjs');
  fs.writeFileSync(f, textoValium);
  return import(pathToFileURL(f).href + '?' + Math.random());
}

// Uma verificação completa sobre os textos dados; lança ao primeiro desvio.
async function verificar({ valium, index, hands, registo, discovery, card }) {
  assert.equal(keccak256(Buffer.alloc(0)).toString('hex'), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', 'keccak de controlo');
  const m = await carregar(valium);
  const reg = JSON.parse(registo);
  const eth = reg.contratos.find((c) => c.chainId === 1).contract;
  const base = reg.contratos.find((c) => c.chainId === 8453).contract;
  assert.equal(m.CONTRATOS.ethereum.contrato, eth, 'contrato Ethereum diferente do registo');
  assert.equal(m.CONTRATOS.base.contrato, base, 'contrato Base diferente do registo');
  assert.equal(m.ENS.namehash, namehash(m.ENS.nome).toString('hex'), 'namehash do ENS não confere com o keccak independente');
  assert.equal(m.ENS.nome, '0001sensations.eth');
  // chamadas
  const w = '0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C';
  assert.equal(m.chamadaBalanceOf(eth, w).data, '0x70a08231' + '0'.repeat(24) + w.slice(2).toLowerCase(), 'calldata balanceOf');
  assert.equal(m.chamadaTotalSupply(eth).data, '0x18160ddd', 'selector totalSupply');
  assert.throws(() => m.chamadaBalanceOf(eth, '0x123'), 'endereço inválido deve ser recusado');
  assert.throws(() => m.chamadaBalanceOf(eth, w + '00'), 'endereço longo deve ser recusado');
  // leitura de respostas
  assert.equal(m.lerUint('0x' + '0'.repeat(63) + '5'), 5n);
  assert.throws(() => m.lerUint('0x5'), 'palavra curta recusada');
  assert.throws(() => m.lerUint('0x' + 'zz'.repeat(32)), 'palavra não hex recusada');
  assert.equal(m.lerEndereco('0x' + '0'.repeat(24) + '2ef8cfb97ecccf7c62f551639fe6db79022d0d8c'), '0x2ef8cfb97ecccf7c62f551639fe6db79022d0d8c');
  assert.equal(m.lerEndereco('0x' + '0'.repeat(64)), null, 'endereço zero é "sem endereço"');
  assert.throws(() => m.lerEndereco('0x' + '1'.repeat(64)), 'endereço com bytes altos recusado');
  assert.equal(m.formatar(1000001000000000000000000n), '1000001');
  assert.equal(m.formatar(1500000000000000000n), '1.5');
  assert.equal(m.formatar(1n), '0.000000000000000001');
  // concordância: o ponto central
  assert.equal(m.concordar([{ ok: true, valor: 7n }, { ok: true, valor: 7n }]).estado, 'concordam');
  assert.equal(m.concordar([{ ok: true, valor: 7n }, { ok: false }]).estado, 'fonte_unica', 'uma fonte não é verificada');
  assert.equal(m.concordar([{ ok: true, valor: 7n }]).estado, 'fonte_unica');
  assert.equal(m.concordar([{ ok: true, valor: 7n }, { ok: true, valor: 8n }]).estado, 'discordam');
  assert.equal(m.concordar([{ ok: true, valor: 7n }, { ok: true, valor: 7n }, { ok: true, valor: 8n }]).valor, null, 'discordância nunca escolhe um valor');
  assert.equal(m.concordar([{ ok: false }, { ok: false }]).estado, 'sem_leitura');
  assert.equal(m.verificado(m.concordar([{ ok: true, valor: 7n }])), false);
  assert.equal(m.verificado(m.concordar([{ ok: true, valor: 7n }, { ok: true, valor: 7n }])), true);
  // fronteiras no código implantável
  for (const proibido of [/Deno\.env/, /SERVICE_ROLE|SECRET|API_KEY|TOKEN/i, /createClient/, /sign(Message|Typed|Transaction)/i, /eth_sendRawTransaction|eth_sendTransaction|eth_sign/, /\.insert\(|\.upsert\(|rest\/v1/]) {
    assert.doesNotMatch(index, proibido, `fronteira violada: ${proibido}`);
  }
  assert.match(index, /readOnlyHint: true/);
  assert.match(index, /name: "recognize_valium"/);
  assert.match(index, /name: "read_valium"/);
  assert.match(index, /proves_market_value: false/);
  assert.match(index, /pays_or_signs: false/);
  assert.match(index, /stores_nothing: true/);
  assert.match(index, /"eth_call"/);
  assert.doesNotMatch(index, /method: "eth_(?!call)/, 'só eth_call é permitido');
  assert.match(index, /preço, liquidez ou valor de mercado/);
  assert.doesNotMatch(index, /prometemos|garant(e|imos) (receita|valor|retorno)/i);
  // ligação ao conector @weave_hands e descoberta
  assert.match(hands, /import \{ VALIUM_TOOLS, callValium \} from "\.\/valium-leitura\.ts"/, 'weave-hands não importa as ferramentas VALIUM');
  assert.match(hands, /\.\.\.VALIUM_TOOLS/, 'weave-hands não expõe as ferramentas VALIUM');
  assert.match(hands, /const valium = callValium\(name, args\);\n  if \(valium\) return await valium;/, 'weave-hands não chama callValium');
  assert.doesNotMatch(hands, /Deno\.env|SERVICE_ROLE/, 'weave-hands usa segredos');
  const d = JSON.parse(discovery);
  assert.equal(d.name, '@weave_hands');
  for (const t of ['recognize_valium', 'read_valium']) assert.ok(d.mcp.tools.includes(t), `descoberta sem ${t}`);
  assert.equal(d.valium.pays_or_signs, false);
  assert.equal(d.valium.stores_anything, false);
  assert.equal(d.valium.uses_credentials, false);
  assert.equal(d.valium.proves_market_value, false);
  assert.equal(d.valium.bridges_the_two_contracts, false);
  assert.deepEqual(d.valium.tools, ['recognize_valium', 'read_valium']);
  const c = JSON.parse(card).serviceInterfaces.find((x) => x.name === '@weave_hands');
  assert.deepEqual(c.tools, d.mcp.tools, 'agent-card e descoberta com listas diferentes');
}

const real = {
  valium: lerTexto(`${DIR}/valium.mjs`),
  index: lerTexto(`${DIR}/valium-leitura.ts`),
  hands: lerTexto(`${DIR}/index.ts`),
  registo: lerTexto('identity/valium.json'),
  discovery: lerTexto('discovery/weave-hands.json'),
  card: lerTexto('.well-known/agent-card.json'),
};
await verificar(real);

// Estragos propositados: cada um tem de ser apanhado.
const estragos = [
  ['aceitar uma só fonte como concordam', { valium: real.valium.replace("ok.length >= 2 ? 'concordam' : 'fonte_unica'", "'concordam'") }],
  ['escolher um valor quando discordam', { valium: real.valium.replace("if (distintos.size > 1) return { estado: 'discordam', valor: null,", "if (distintos.size > 1) return { estado: 'discordam', valor: ok[0].valor,") }],
  ['contrato Base trocado', { valium: real.valium.replace('0x37f70Bccdc2125346a7542fe6e7fc70e33421635', '0x37f70Bccdc2125346a7542fe6e7fc70e33421636') }],
  ['contrato Ethereum trocado', { valium: real.valium.replace('0xD287E77989F7191989901361754d02D8e00E1D1A', '0xD287E77989F7191989901361754d02D8e00E1D1B') }],
  ['namehash errado', { valium: real.valium.replace('9370828b2727', '9370828b2728') }],
  ['selector de balanceOf errado', { valium: real.valium.replace("'0x70a08231'", "'0x70a08232'") }],
  ['endereço inválido aceite', { valium: real.valium.replace("if (!ehEndereco(carteira)) throw new Error('endereco_invalido');\n  return { to: contrato", "return { to: contrato") }],
  ['palavra curta aceite', { valium: real.valium.replace("/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error('resposta_invalida');\n  return BigInt(hex);", "/^0x[0-9a-fA-F]+$/.test(hex)) throw new Error('resposta_invalida');\n  return BigInt(hex);") }],
  ['lerEndereco aceita bytes altos', { valium: real.valium.replace("  if (!/^0x0{24}/.test(hex)) throw new Error('resposta_invalida');\n", '') }],
  ['formatar sem decimais', { valium: real.valium.replace("return f ? `${i}.${f}` : i;", 'return i;') }],
  ['usa segredo do ambiente', { index: real.index + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
  ['escreve na base', { index: real.index + '\nawait fetch(`${BASE}/rest/v1/x`, { method: "POST" });' }],
  ['envia transacção', { index: real.index.replace('"eth_call"', '"eth_sendRawTransaction"') }],
  ['deixa de ser só leitura', { index: real.index.replace('readOnlyHint: true', 'readOnlyHint: false') }],
  ['afirma valor de mercado', { index: real.index.replace('proves_market_value: false', 'proves_market_value: true') }],
  ['perde o limite de não afirmar preço', { index: real.index.replace('preço, liquidez ou valor de mercado do VALIUM', 'nada') }],
  ['descoberta diz que o VALIUM paga ou assina', { discovery: real.discovery.replace('"pays_or_signs": false,\n    "proves_market_value"', '"pays_or_signs": true,\n    "proves_market_value"') }],
  ['descoberta sem read_valium', { discovery: real.discovery.replaceAll('"recognize_valium",\n      "read_valium"', '"recognize_valium"') }],
  ['agent-card sem as ferramentas', { card: real.card.replace('"recognize_valium",\n        "read_valium"', '"recognize_valium"') }],
  ['weave-hands deixa de expor as ferramentas', { hands: real.hands.replace('...VALIUM_TOOLS,', '') }],
  ['weave-hands deixa de chamar callValium', { hands: real.hands.replace('if (valium) return await valium;', '') }],
  ['weave-hands passa a usar segredos', { hands: real.hands + '\nconst k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");' }],
  ['registo com outro contrato', { registo: real.registo.replace('0xD287E77989F7191989901361754d02D8e00E1D1A', '0xD287E77989F7191989901361754d02D8e00E1D1B') }],
];
let apanhados = 0;
for (const [nome, troca] of estragos) {
  const antes = JSON.stringify(real);
  const estragado = { ...real, ...troca };
  assert.notEqual(JSON.stringify(estragado), antes, `o estrago "${nome}" não alterou nada (padrão desactualizado)`);
  let caiu = false;
  try { await verificar(estragado); } catch { caiu = true; }
  assert.ok(caiu, `estrago NÃO apanhado: ${nome}`);
  apanhados++;
}
console.log(`weave-hands-valium: conector conferido; ${apanhados} estragos propositados apanhados.`);

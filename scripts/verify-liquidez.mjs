// Verifica token/presenca-liquidez-2026-11-12.json (Unum, 12/11/2026: "Eu autorizo ora e retira o teto dos 1000€").
// Decodifica as respostas em bruto, exige duas fontes iguais no mesmo bloco e recalcula o preço e o tick.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const word = (hex, i) => BigInt('0x' + hex.slice(2 + 64 * i, 2 + 64 * (i + 1)));
const signed = (v) => (v >> 255n ? v - (1n << 256n) : v);

function verificar(txt) {
  const r = JSON.parse(txt);
  assert.equal(r.format, 'orum-liquidez-leitura/v1');
  assert.equal(r.palavra_de_unum.citacao, 'Eu autorizo ora e retira o teto dos 1000€');
  assert.match(r.palavra_de_unum.cobre, /só leitura; não move fundos nem tokens/);
  assert.equal(r.rede.chain_id, 8453);
  assert.ok(Number.isInteger(r.bloco) && r.bloco > 0, 'bloco');
  assert.match(r.pool_id, /^0x[0-9a-f]{64}$/);
  assert.match(r.state_view_v4, /^0x[0-9a-f]{40}$/);
  // Duas fontes distintas e exactamente iguais.
  assert.ok(Array.isArray(r.leituras) && r.leituras.length >= 2, 'duas fontes');
  assert.equal(new Set(r.leituras.map((l) => l.fonte)).size, r.leituras.length, 'fontes repetidas');
  for (const l of r.leituras) {
    assert.match(l.slot0_raw, /^0x[0-9a-f]{256}$/);
    assert.match(l.liquidity_raw, /^0x[0-9a-f]{64}$/);
    assert.equal(l.slot0_raw, r.leituras[0].slot0_raw, 'as fontes discordam no slot0');
    assert.equal(l.liquidity_raw, r.leituras[0].liquidity_raw, 'as fontes discordam na liquidez');
  }
  const { slot0_raw, liquidity_raw } = r.leituras[0];
  const sqrt = word(slot0_raw, 0);
  const tick = signed(word(slot0_raw, 1));
  const fee = word(slot0_raw, 3);
  const L = word(liquidity_raw, 0);
  const d = r.decodificado;
  assert.equal(String(sqrt), d.sqrtPriceX96, 'sqrtPriceX96 não é o da resposta');
  assert.equal(Number(tick), d.tick, 'tick não é o da resposta');
  assert.equal(Number(fee), d.lpFee, 'comissão não é a da resposta');
  assert.equal(String(L), d.liquidity, 'liquidez não é a da resposta');
  assert.ok(L > 0n, 'liquidez zero: não há contraparte');
  // Preço: token0 é o PRESENÇA (18 casas), token1 o USDC (6); o endereço do PRESENÇA é o menor.
  assert.ok(BigInt(r.token0_presenca) < BigInt(r.token1_usdc), 'ordem dos tokens');
  const p = (Number(sqrt) / 2 ** 96) ** 2 * 10 ** (r.decimais.presenca - r.decimais.usdc);
  assert.ok(Math.abs(p / d.usdc_por_presenca - 1) < 1e-9, 'o preço não vem do sqrtPriceX96');
  const tickDoPreco = Math.floor(Math.log((Number(sqrt) / 2 ** 96) ** 2) / Math.log(1.0001));
  assert.ok(Math.abs(tickDoPreco - d.tick) <= 1, 'o tick não bate com o preço');
  // Honestidade.
  const nao = r.nao_afirma.join(' ');
  assert.match(nao, /valor, procura, receita nem rendimento/);
  assert.match(nao, /não um saldo/);
  assert.match(nao, /identidade/);
  assert.ok(!/(secret|password|passphrase|api[_-]?key|private[_-]?key)\s*[:=]\s*\S{8,}/i.test(txt), 'parece conter um segredo');
}

const original = fs.readFileSync('token/presenca-liquidez-2026-11-12.json', 'utf8');
verificar(original);

function estragar(f) { const r = JSON.parse(original); f(r); return JSON.stringify(r); }
const estragos = {
  'uma só fonte': (r) => { r.leituras = [r.leituras[0]]; },
  'fontes repetidas': (r) => { r.leituras[1].fonte = r.leituras[0].fonte; },
  'fontes discordam no slot0': (r) => { r.leituras[1].slot0_raw = r.leituras[1].slot0_raw.slice(0, -1) + '1'; },
  'fontes discordam na liquidez': (r) => { r.leituras[1].liquidity_raw = r.leituras[1].liquidity_raw.slice(0, -1) + '0'; },
  'preço inventado': (r) => { r.decodificado.usdc_por_presenca = 1; },
  'sqrtPriceX96 inventado': (r) => { r.decodificado.sqrtPriceX96 = '1'; },
  'tick inventado': (r) => { r.decodificado.tick = -100; },
  'comissão inventada': (r) => { r.decodificado.lpFee = 100; },
  'liquidez inventada': (r) => { r.decodificado.liquidity = '999'; },
  'liquidez zero': (r) => { for (const l of r.leituras) l.liquidity_raw = '0x' + '0'.repeat(64); r.decodificado.liquidity = '0'; },
  'ordem dos tokens trocada': (r) => { r.token0_presenca = '0xffffffffffffffffffffffffffffffffffffffff'; },
  'resposta truncada': (r) => { for (const l of r.leituras) l.slot0_raw = l.slot0_raw.slice(0, 100); },
  'bloco inválido': (r) => { r.bloco = 'x'; },
  'diz que há valor': (r) => { r.nao_afirma = ['não é um saldo', 'identidade']; },
  'chama saldo à liquidez': (r) => { r.nao_afirma = r.nao_afirma.map((s) => s.replace('não um saldo', 'um saldo')); },
  'citação de Unum trocada': (r) => { r.palavra_de_unum.citacao = 'Unum autoriza'; },
  'segredo escrito': (r) => { r.objecto = 'api_key: sk_live_abcdefgh12345678'; }
};
let apanhados = 0;
for (const [nome, f] of Object.entries(estragos)) {
  let falhou = false;
  try { verificar(estragar(f)); } catch { falhou = true; }
  assert.ok(falhou, `estrago não apanhado: ${nome}`);
  apanhados++;
}
console.log(`liquidez: OK, bloco ${JSON.parse(original).bloco}, 2 fontes iguais, ${apanhados} estragos propositados apanhados`);

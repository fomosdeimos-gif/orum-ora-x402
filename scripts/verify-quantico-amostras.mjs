// Verifica, sem Qiskit e sem Supabase, as 30 amostras de docs/quantico/amostras-v1.tsv:
//  1) simulacao exacta de vector de estado do circuito GHZ3 + rz(phi) (3 qubits, 8 amplitudes);
//  2) chi2 contra o uniforme em 8 resultados recalculado a partir das contagens;
//  3) a cadeia de hashes: chain = sha256(prev + ':' + sha), com prev = 'genesis' na primeira linha;
//  4) se as contagens sao compativeis com uma moeda justa (binomial, n = 20000, p = 0,5).
// Honestidade: isto e uma simulacao classica. O resultado mostra que o circuito equivale a UM bit justo.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
const SHOTS = 20000, PHI = 1.61803398874989;
const rows = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/quantico/amostras-v1.tsv'), 'utf8').trim().split('\n').slice(1)
  .map((l) => { const [id, c1, c0, chi, sha, chain] = l.split('\t'); return { id: +id, c1: +c1, c0: +c0, chi: +chi, sha, chain }; });

// 1) vector de estado: |000> -> H(q0) -> CX(0,1) -> CX(1,2) -> rz(phi) em cada qubit
function probabilidades(phi) {
  let re = new Array(8).fill(0), im = new Array(8).fill(0); re[0] = 1;
  const bit = (i, q) => (i >> q) & 1;
  { const r = re.slice(), m = im.slice(), s = Math.SQRT1_2; for (let i = 0; i < 8; i++) { const j = i ^ 1; const sg = bit(i, 0) ? -1 : 1; re[i] = s * (sg * r[i] + r[j]) * (bit(i, 0) ? 1 : 1); im[i] = s * (sg * m[i] + m[j]); } }
  const cx = (c, t) => { const r = re.slice(), m = im.slice(); for (let i = 0; i < 8; i++) if (bit(i, c)) { re[i] = r[i ^ (1 << t)]; im[i] = m[i ^ (1 << t)]; } };
  cx(0, 1); cx(1, 2);
  for (let q = 0; q < 3; q++) for (let i = 0; i < 8; i++) { const a = (bit(i, q) ? 1 : -1) * phi / 2, c = Math.cos(a), s = Math.sin(a); const r = re[i], m = im[i]; re[i] = r * c - m * s; im[i] = r * s + m * c; }
  return re.map((x, i) => x * x + im[i] * im[i]);
}
for (const phi of [PHI, 0, 1, 3.1, -2]) {
  const p = probabilidades(phi);
  assert.ok(Math.abs(p[0] - 0.5) < 1e-12 && Math.abs(p[7] - 0.5) < 1e-12 && p.slice(1, 7).every((x) => x < 1e-12), `phi=${phi}: distribuicao inesperada`);
}

// 2) chi2 e 3) cadeia
const h = (s) => createHash('sha256').update(s).digest('hex');
let prev = 'genesis', chiErr = 0;
for (const r of rows) {
  assert.equal(r.c1 + r.c0, SHOTS, `amostra ${r.id}: contagens nao somam ${SHOTS}`);
  const e = SHOTS / 8, chi = ((r.c1 - e) ** 2 + (r.c0 - e) ** 2) / e + 6 * e;
  chiErr = Math.max(chiErr, Math.abs(chi - r.chi));
  assert.equal(h(prev + ':' + r.sha), r.chain, `amostra ${r.id}: cadeia nao reproduz`);
  prev = r.chain;
}
assert.ok(chiErr < 1e-3, 'chi2 nao reproduz');

// 4) compatibilidade com uma moeda justa: z de cada amostra e soma dos z^2 (~ chi2 com 30 g.l.)
const sd = Math.sqrt(SHOTS * 0.25);
const z = rows.map((r) => (r.c1 - SHOTS / 2) / sd);
const soma = z.reduce((s, v) => s + v * v, 0), media = z.reduce((s, v) => s + v, 0) / z.length;
const k = 30, wh = (Math.cbrt(soma / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k)); // Wilson-Hilferty
assert.ok(Math.abs(wh) < 3, `contagens incompativeis com moeda justa (z=${wh.toFixed(2)})`);
const brierConstante = rows.reduce((s, r) => s + (r.c1 / SHOTS) ** 2, 0) / rows.length;
console.log(JSON.stringify({ ok: true, amostras: rows.length, circuito: 'GHZ3+rz(phi): P(000)=P(111)=0,5 para qualquer phi (phi nao altera medicoes na base Z)',
  cadeia: '30/30 reproduzida', chi2_max_erro: chiErr, soma_z2: +soma.toFixed(2), z_medio: +media.toFixed(3), desvio_normalizado: +wh.toFixed(2),
  brier_contra_sempre_nao_evento: +brierConstante.toFixed(6), leitura: 'equivale a um bit justo (media 0,5); como baseline aleatoria nao acrescenta informacao sobre o evento' }));

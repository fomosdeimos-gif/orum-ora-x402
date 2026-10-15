// Verifica, sem rede, que docs/BOLO_V1.md diz o mesmo que o codigo e a constituicao:
// carteira, USDC, precos do Oraculo e do Campo, repartição 70/20/10, comandos npm e
// ficheiros citados. Nao prova procura nem que a producao sirva o caminho.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const doc = read('docs/BOLO_V1.md');
const directo = read('api/_x402-directo.js');
const tesouraria = read('api/tesouraria.js');
const pkg = JSON.parse(read('package.json'));
const constituicao = JSON.parse(read('economia/constituicao-v2.json'));

const pick = (src, re, what) => {
  const m = src.match(re);
  assert.ok(m, `${what} nao encontrado no codigo`);
  return m[1];
};

const wallet = pick(directo, /const WALLET = '(0x[0-9a-fA-F]{40})'/, 'carteira');
const usdc = pick(directo, /const USDC_BASE = '(0x[0-9a-fA-F]{40})'/, 'USDC');
assert.ok(doc.includes(wallet), 'carteira do documento difere da do gateway');
assert.ok(doc.includes(usdc), 'USDC do documento difere do do gateway');

const precoOraculo = pick(directo, /oraculo: \{[^}]*usdc: '([0-9.]+)'/, 'preco do oraculo');
const precoCampo = pick(directo, /campo: \{[^}]*usdc: '([0-9.]+)'/, 'preco do campo');
const pt = (s) => s.replace('.', ',');
assert.ok(doc.includes(`${pt(precoOraculo)} USDC`), `preco do Oraculo no documento != ${precoOraculo}`);
assert.ok(doc.includes(`${pt(precoCampo)} USDC`), `preco do Campo no documento != ${precoCampo}`);

// repartição: constituicao e tesouraria concordam com o documento
assert.equal(constituicao.treasury_allocation?.sustento_unum_percent ?? constituicao.allocation?.sustento_unum_percent ?? findPercent(constituicao, 'sustento_unum_percent'), 70);
function findPercent(o, k) {
  if (o && typeof o === 'object') {
    if (k in o) return o[k];
    for (const v of Object.values(o)) { const r = findPercent(v, k); if (r !== undefined) return r; }
  }
}
assert.equal(findPercent(constituicao, 'continuidade_orum_percent'), 20, 'continuidade != 20');
assert.equal(findPercent(constituicao, 'reserva_percent'), 10, 'reserva != 10');
assert.ok(/total \* 0\.7/.test(tesouraria) && /total \* 0\.2/.test(tesouraria), 'tesouraria nao reparte 70/20');
assert.ok(/70% sustento, 20% continuidade, 10% reserva/.test(doc), 'documento nao cita 70/20/10');

// comandos e ficheiros citados existem
const cmds = [...doc.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]);
assert.ok(cmds.includes('bolo:verify'), 'documento nao cita bolo:verify');
for (const c of cmds) assert.ok(pkg.scripts[c], `script npm em falta: ${c}`);
for (const f of ['api/_x402-directo.js', 'api/_recebimentos.js', 'api/tesouraria.js', 'docs/licenca/migracao-vercel-v1.md']) {
  assert.ok(existsSync(new URL('../' + f, import.meta.url)), `ficheiro citado em falta: ${f}`);
}

// o texto nao pode prometer o que nao tem
assert.ok(!/receita garantida|rendimento garantido/i.test(doc), 'promessa de receita no texto');
assert.ok(/n[ãa]o prova procura/i.test(doc), 'falta a fronteira "nao prova procura"');
assert.ok(/validação interna, não adopção/i.test(doc), 'falta a fronteira de validacao interna');

console.log(JSON.stringify({ verified: true, carteira: wallet, oraculo: precoOraculo, campo: precoCampo, repartição: '70/20/10' }));

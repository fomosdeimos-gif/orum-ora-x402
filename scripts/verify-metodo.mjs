// Verifica, sem rede, que o método publicado não afirma o que não existe:
// cada comando npm citado esta em package.json, cada ficheiro citado existe, e a carteira
// anunciada e a mesma do gateway. Nao prova procura nem que o texto esteja publicado.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const doc = read('docs/METODO_CONTINUIDADE_V1.md');
const page = read('metodo.html');
const directo = read('api/_x402-directo.js');

const cmds = (t) => [...t.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]);
const todos = new Set([...cmds(doc), ...cmds(page)]);
for (const c of todos) assert.ok(pkg.scripts[c], `script npm em falta: ${c}`);
assert.ok(todos.size >= 5, 'poucos comandos citados');

for (const f of ['api/_snapshot.js', 'scripts/verify-snapshot-recurso.mjs', 'recovery/README.md', 'scripts/verify-continuidade.mjs']) {
  assert.ok(existsSync(new URL('../' + f, import.meta.url)), `ficheiro citado em falta: ${f}`);
}

const wallet = createRequire(import.meta.url)('../api/_carteira.js').RECEBIMENTO_EDGE; // o que os textos públicos e as funções de borda anunciam (a via directa cobra na operacional)
assert.ok(wallet, 'carteira do gateway nao encontrada');
assert.ok(doc.includes(wallet) && page.includes(wallet), 'carteira anunciada difere da do gateway');

// o texto nao pode prometer o que nao tem
assert.ok(!/receita garantida|rendimento garantido/i.test(doc + page), 'promessa de receita no texto');
assert.ok(/n[ãa]o prova procura/i.test(doc) && /n[ãa]o prova procura/i.test(page), 'falta a fronteira "nao prova procura"');
console.log(JSON.stringify({ verified: true, comandos: [...todos].sort(), carteira: wallet }));

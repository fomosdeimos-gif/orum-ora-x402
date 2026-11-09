// Verifica a projecção a 10 anos: dados de partida iguais ao código, cenários sem números de dinheiro ou de procura,
// sem palavras de promessa, fronteira presente. Depois estraga de propósito (cópia em tmp) e exige falha em cada estrago.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = 'economia/projecao-servicos.json', M = 'docs/projecao-servicos-2026-11-07.md', P = 'api/_pagamento-btc.js';
const PROMESSA = /\b(garant\w*|vai render|lucro de|retorno de|rendimento de|crescimento de|receita de \d|vamos ganhar)/i;
const DINHEIRO = /\d[\d\s.,]*\s*(usd|usdc|sats|btc|eur|€|\$|%)/i;

function suite(r) {
  const j = JSON.parse(readFileSync(join(r, J), 'utf8')); const md = readFileSync(join(r, M), 'utf8');
  const { PRECO_SATS } = createRequire(import.meta.url)(join(r, P));
  assert.equal(j.esquema, 'orum-projecao-servicos/v1'); assert.equal(j.horizonte_anos, 10);
  assert.match(j.natureza, /nao previsao nem promessa/);
  assert.equal(j.dados_de_partida.receita_externa_confirmada, 0, 'receita externa so se acrescenta com leitura');
  assert.equal(j.dados_de_partida.procura_externa_confirmada, 0);
  assert.equal(j.dados_de_partida.preco_sats.oraculo, PRECO_SATS['0.161'], 'preco em sats igual ao codigo');
  assert.equal(j.dados_de_partida.preco_sats.campo, PRECO_SATS['0.33']);
  assert.deepEqual(j.cenarios.map((c) => c.id), ['A', 'B', 'C']);
  assert.ok(j.indicadores.length >= 4); assert.ok(/nao ha numero de receita/.test(j.nao_prova));
  assert.ok(md.includes('economia/projecao-servicos.json') && md.includes('Não é previsão nem promessa'));
  const ini = md.indexOf('## Cenários'), fim = md.indexOf('## Riscos comuns');
  assert.ok(ini > 0 && fim > ini, 'secoes de cenarios e riscos');
  const cen = md.slice(ini, fim);
  for (const id of ['**A.', '**B.', '**C.']) assert.ok(cen.includes(id), 'cenario ' + id);
  assert.ok(!DINHEIRO.test(cen), 'os cenarios nao trazem numeros de dinheiro, procura ou percentagem');
  assert.ok(!PROMESSA.test(md), 'o texto nao promete');
  assert.ok(md.includes('## Fronteira') && /não promete receita, reembolso, procura nem valor/.test(md), 'fronteira');
  assert.ok(md.includes('Receita externa confirmada: nenhuma'));
}

suite(RAIZ);
const estragos = [
  [M, 'Esta projecção não promete receita', 'Esta projecção promete receita', 'fronteira trocada'],
  [M, 'Sem pagador externo.** O organismo', 'Sem pagador externo.** Rende 5% ao ano e o organismo', 'percentagem de rendimento nos cenarios'],
  [M, 'Procura pequena e esporádica.** Chegam', 'Procura pequena e esporádica.** Chegam 300 USDC por mês e chegam', 'receita inventada nos cenarios'],
  [M, '## Fronteira\n\n', '## Fronteira\n\nO retorno de 3x é garantido. ', 'promessa de retorno'],
  [M, 'Receita externa confirmada: nenhuma', 'Receita externa confirmada: alguma', 'receita externa dita sem leitura'],
  [J, '"receita_externa_confirmada": 0', '"receita_externa_confirmada": 12', 'receita no json'],
  [J, '"campo": 1000', '"campo": 423500', 'preco do json diferente do codigo'],
  [J, '"horizonte_anos": 10', '"horizonte_anos": 904', 'horizonte alterado'],
  [J, 'nao previsao nem promessa', 'previsao firme', 'natureza trocada'],
  [P, "'0.33': 1000", "'0.33': 1001", 'preco do codigo mudou e o registo nao'],
];
let n = 0;
for (const [f, de, para, nome] of estragos) {
  const t = mkdtempSync(join(tmpdir(), 'projecao-'));
  try {
    for (const x of [J, M, P]) { mkdirSync(dirname(join(t, x)), { recursive: true }); cpSync(join(RAIZ, x), join(t, x)); }
    const s = readFileSync(join(t, f), 'utf8'); assert.ok(s.includes(de), 'estrago inaplicavel: ' + nome);
    writeFileSync(join(t, f), s.replace(de, para));
    assert.throws(() => suite(t), undefined, 'estrago nao apanhado: ' + nome); n++;
  } finally { rmSync(t, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ verified: true, estragos_apanhados: n, prova: 'dados de partida iguais ao codigo, cenarios sem numeros de dinheiro nem promessas, fronteira presente', nao_prova: 'procura, receita nem que os servicos durem' }));

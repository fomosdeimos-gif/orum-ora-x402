// Verifica a raiz das respostas das máquinas (economia/respostas-raiz-*.json): a raiz refaz-se dos hashes e cada mentira propositada falha.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const FICHEIRO = 'economia/respostas-raiz-2026-10-29.json';
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export function verificar(j) {
  assert.equal(j.schema, 'orum-respostas-raiz/v1');
  assert.ok(Array.isArray(j.hashes) && j.hashes.length === j.linhas, 'o número de linhas não bate');
  let anterior = 0;
  for (const l of j.hashes) {
    const m = /^(\d+)\t([0-9a-f]{64})$/.exec(l);
    assert.ok(m, `linha mal formada: ${l}`);
    assert.ok(Number(m[1]) > anterior, 'ids fora de ordem ou repetidos');
    anterior = Number(m[1]);
  }
  assert.equal(anterior, j.max_id, 'max_id não bate');
  assert.equal(sha(j.hashes.join('\n') + '\n'), j.raiz_sha256, 'a raiz não se refaz dos hashes');
  assert.match(j.o_que_nao_prova, /autoria/);
  assert.match(j.o_que_nao_prova, /receita/);
  assert.ok(!JSON.stringify(j).match(/observed|interpreted|machine_identity"\s*:/), 'o conteúdo das respostas não pode estar no repositório');
  return { linhas: j.linhas, raiz: j.raiz_sha256 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const real = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8'));
  const r = verificar(real);
  let mentiras = 0;
  const falha = (nome, mutar) => { const c = structuredClone(real); mutar(c); assert.throws(() => verificar(c), undefined, `estrago não apanhado: ${nome}`); mentiras++; };
  falha('um hash alterado', (c) => { c.hashes[3] = c.hashes[3].slice(0, -1) + (c.hashes[3].endsWith('0') ? '1' : '0'); });
  falha('uma linha apagada', (c) => { c.hashes.splice(10, 1); });
  falha('uma linha acrescentada', (c) => { c.hashes.push('99\t' + 'a'.repeat(64)); c.linhas++; });
  falha('ids fora de ordem', (c) => { [c.hashes[1], c.hashes[2]] = [c.hashes[2], c.hashes[1]]; });
  falha('raiz trocada', (c) => { c.raiz_sha256 = 'b'.repeat(64); });
  falha('max_id errado', (c) => { c.max_id = 58; });
  falha('conteúdo das respostas no repositório', (c) => { c.observed = 'texto'; c.o_que_prova += ' "observed"'; });
  falha('limite apagado', (c) => { c.o_que_nao_prova = 'Prova tudo.'; });
  assert.ok(mentiras >= 8);
  console.log(`respostas-raiz:verify ok · ${r.linhas} linhas · raiz ${r.raiz.slice(0, 12)}… · ${mentiras} estragos apanhados`);
}

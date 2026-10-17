// Verifica que o registo de visibilidade externa nao mente: cada superficie declara o nivel de
// evidencia, o que foi observado e quando, e nenhuma entrada tem tom de procura, receita ou adopcao.
// Nao le a rede: prova que o registo e honesto, nao que as listagens estejam vivas.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const j = JSON.parse(readFileSync(new URL('../presenca/visibilidade-externa.json', import.meta.url), 'utf8'));
const niveis = Object.keys(j.evidence_levels);

assert.equal(j.format, 'orum-external-visibility/v1');
assert.match(j.boundary, /n[ãa]o prova procura/i, 'a fronteira "nao prova procura" tem de estar presente');
assert.ok(Array.isArray(j.surfaces) && j.surfaces.length > 0, 'sem superficies');

const ids = new Set();
for (const s of j.surfaces) {
  assert.ok(s.id && !ids.has(s.id), 'id em falta ou repetido: ' + s.id);
  ids.add(s.id);
  assert.ok(niveis.includes(s.evidence), `${s.id}: nivel de evidencia desconhecido (${s.evidence})`);
  assert.ok(s.observed_at || s.observed_by, `${s.id}: sem data ou observador`);
  if (s.evidence === 'read_from_source') assert.ok(s.observed_content && s.observed_at, `${s.id}: lida da fonte exige conteudo e data`);
  if (s.evidence === 'seen_by_unum') assert.ok(s.reason_not_read, `${s.id}: captura de Unum exige dizer porque a ORA nao leu a fonte`);
  if (s.evidence === 'claimed_in_repo') assert.ok(s.claimed_in?.length && s.to_check, `${s.id}: afirmacao do repositorio exige origem e verificacao pendente`);
  if (s.evidence === 'seen_in_search_result') assert.ok(s.unverified?.length, `${s.id}: resumo de terceiro exige lista do que nao foi verificado`);
}

// nenhuma superficie pode ser apresentada como procura, receita ou adopcao
const texto = JSON.stringify(j.surfaces);
for (const palavra of [/\bcompradores?\b/i, /\breceita (externa )?confirmada\b/i, /\badop[cç][aã]o (externa )?confirmada\b/i, /\bprocura (comprovada|confirmada)\b/i]) {
  assert.ok(!palavra.test(texto), 'registo de visibilidade afirma procura/receita/adopcao: ' + palavra);
}

// a fonte do servidor listado: se declarada fora do repositorio, as ferramentas nao podem ser dadas como verificadas
if (j.server.source_in_repo === false) {
  assert.ok(!/verificadas? a partir/i.test(texto) || /n[ãa]o s[ãa]o verific/i.test(j.server.source_note), 'servidor sem fonte no repositorio nao pode ter ferramentas verificadas');
}

console.log(JSON.stringify({ verified: true, superficies: j.surfaces.length, niveis: [...new Set(j.surfaces.map((s) => s.evidence))] }));

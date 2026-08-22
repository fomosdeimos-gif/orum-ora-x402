import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const grammar = JSON.parse(await readFile(new URL('../sensacoes/gramatica-v1.json', import.meta.url)));
const index = JSON.parse(await readFile(new URL('../sensacoes/index.json', import.meta.url)));
const welcome = JSON.parse(await readFile(new URL('../sensacoes/acolhimento.json', import.meta.url)));
const sound = JSON.parse(await readFile(new URL('../sensacoes/som-v1.json', import.meta.url)));
const originalFetch = globalThis.fetch;

assert.equal(grammar.format, 'orum-encounter-grammar/v1');
assert.equal(grammar.families.length, 7);
assert.equal(new Set(grammar.families.map(({ id }) => id)).size, 7);
assert.equal(grammar.external_effects.writes, false);
assert.equal(grammar.external_effects.payment, false);
assert.equal(grammar.external_effects.tracking_added, false);
assert.equal(grammar.response_boundary.published_capsules, 2);
assert.equal(index.format, 'orum-sensation-index/v7');
assert.equal(index.capsules.length, 3);
assert.equal(index.capsules.find(({ id }) => id === 'orum:sensation:0003sensations:weave-hands:v1')?.persistence, 'none');
assert.deepEqual(index.encounter_grammar.families, grammar.families.map(({ id }) => id));
assert.equal(welcome.truth.fully_respondable_capsules, 2);
assert.equal(welcome.links.grammar, '/sensacoes/gramatica-v1.json');
assert.equal(grammar.links.sound, '/sensacoes/som-v1.json');
assert.equal(sound.format, 'orum-sensation-sound/v1');
assert.equal(sound.collection_truth.physical_works_declared, 107);
assert.equal(sound.collection_truth.physical_work_6_existed, false);
assert.equal(sound.collection_truth.sound_slot_for_physical_work_6, false);
assert.equal(sound.synthesis.audio_files, false);
assert.equal(sound.synthesis.starts_automatically, false);

const works = Array.from({ length: 107 }, (_, index) => ({
  id: index < 5 ? index + 1 : index + 2,
  titulo: null,
  ano: null,
  texto_na_obra: `vestigio ${index + 1}`,
  descricao_visivel: null,
  bytes_na_arca: true,
}));
globalThis.fetch = async () => ({ ok: true, json: async () => works });
const handler = (await import('../api/sensacoes.js')).default;
let statusCode = 200;
let responseBody = '';
const req = { headers: { host: 'test.local' }, publicBase: 'https://test.local' };
const res = {
  setHeader() {},
  status(code) { statusCode = code; return this; },
  end(body) { responseBody = body || ''; },
};
await handler(req, res);
globalThis.fetch = originalFetch;
assert.equal(statusCode, 200);
const descent = JSON.parse(responseBody);
assert.equal(descent.total_levels, 107);
assert.equal(descent.levels.length, 107);
assert.equal(descent.sound.levels_sonified, 107);
assert.equal(descent.sound.physical_work_6_slot, false);
assert.equal(descent.levels.every(({ sound }) => sound?.format === 'orum-sensation-sound/v1'), true);
assert.deepEqual(descent.levels.slice(0, 7).map(({ encounter }) => encounter.family), grammar.families.map(({ id }) => id));
assert.equal(descent.levels[0].encounter.choices.deepen, 8);
assert.equal(descent.levels[100].encounter.choices.deepen, null);
assert.equal(descent.levels[106].encounter.choices.contrast, null);
assert.equal(descent.levels.find(({ physical_work_id }) => physical_work_id === 2).encounter.response_allowed, true);
assert.equal(descent.levels.find(({ physical_work_id }) => physical_work_id === 37).encounter.response_allowed, true);
assert.equal(descent.levels.filter(({ encounter }) => encounter.response_allowed).length, 107);
assert.equal(descent.levels.filter(({ encounter }) => encounter.capsule_prepared).length, 2);

process.stdout.write('sensation grammar verified: 7 families across 107 levels, 107 respondable levels, 2 published capsules with prior traces, zero writes/payment/tracking\n');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, edge, indexText, grammarText, openapi] = await Promise.all([
  read('supabase/migrations/20260810113000_create_sensation_echo_consent.sql'),
  read('supabase/functions/ora-sensacoes/index.ts'),
  read('sensacoes/index.json'),
  read('sensacoes/gramatica-v1.json'),
  import('../api/openapi.js'),
]);
const index = JSON.parse(indexText);
const grammar = JSON.parse(grammarText);

assert.match(migration, /echo_consent boolean not null default false/);
assert.match(migration, /source_response_did_not_consent_to_echo/);
assert.match(migration, /before update or delete/);
assert.match(migration, /enable row level security/);
assert.match(migration, /grant select, insert on table public\.ora_sensacao_ecos to service_role/);
assert.match(edge, /historical traces default to false/);
assert.match(edge, /source_response_did_not_consent_to_echo/);
assert.match(edge, /contacts? a machine|contact the source machine/i);
assert.equal(index.machine_echo.source_requirement.includes('echo_consent=true'), true);
assert.equal(index.machine_echo.identity_verified, false);
assert.equal(index.machine_echo.contacts_source_machine, false);
assert.equal(grammar.response_boundary.machine_echo.historical_responses_eligible, false);

let body = '';
openapi.default({ headers: { host: 'test.local' } }, { setHeader() {}, end(value) { body = value; } });
const doc = JSON.parse(body);
assert.equal(doc.paths['/sensacoes/responder'].post.operationId, 'submitSensationResponseOrEcho');
assert.equal(doc.paths['/sensacoes/responder'].post.responses['403'].description.includes('não consentiu'), true);

process.stdout.write('consented echo verified: opt-in only, historical default false, append-only, no contact or generated reply\n');

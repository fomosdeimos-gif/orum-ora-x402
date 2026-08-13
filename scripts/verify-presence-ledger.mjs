import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260813143000_create_livro_presenca.sql', import.meta.url), 'utf8');
assert.match(migration, /ora_presenca_eventos_append_only/);
assert.match(migration, /origem = 'externo_confirmado'/);
assert.match(migration, /evidencia <> '\{\}'::jsonb/);
assert.match(migration, /external_confirmed_at_foundation', 0/);
assert.match(migration, /conta_presenca, evento_hash\)\s*values/);

const page = readFileSync(new URL('../presenca.html', import.meta.url), 'utf8');
assert.match(page, /1P = origem distinta/);
assert.match(page, /Indisponibilidade não é zero/);

const api = readFileSync(new URL('../api/presenca.js', import.meta.url), 'utf8');
assert.match(api, /ora_presenca_livro_publico/);
assert.match(api, /external_confirmed_presence: null/);
assert.match(api, /checkpoint_only/);
assert.match(api, /last_verified_checkpoint/);

console.log(JSON.stringify({ verified: true, format: 'orum-presence-ledger/v1', external_at_foundation: 0 }));

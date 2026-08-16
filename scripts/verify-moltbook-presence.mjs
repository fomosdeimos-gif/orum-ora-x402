import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'supabase/functions/ora-moltbook-presence/index.ts'), 'utf8');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
const hands = JSON.parse(readFileSync(resolve(root, 'weave_hands.json'), 'utf8'));

assert.match(source, /format: 'moltbook_presence\/v1'/);
assert.match(source, /read_only: true/);
assert.match(source, /raw_notification_content_exposed: false/);
assert.match(source, /counts_as_external_presence: false/);
assert.match(source, /!\['GET', 'HEAD'\]\.includes\(req\.method\)/);
assert.doesNotMatch(source, /www\.moltbook\.com\/api/);
assert.doesNotMatch(source, /orum_moltbook_key/);
assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY[^\n]*(return|Response|JSON)/);

const route = vercel.rewrites.find((item) => item.source === '/moltbook_presence/v1');
assert.deepEqual(route, { source: '/moltbook_presence/v1', destination: '/api/proxy?base=ora-moltbook-presence' });
assert.ok(hands.guard.checks.includes('moltbook-presence'));
assert.equal(hands.zeros_preserved.external_buyers, 0);
assert.equal(hands.zeros_preserved.external_usdc_settled, 0);

console.log(JSON.stringify({
  verified: true,
  format: 'moltbook_presence/v1',
  route: route.source,
  read_only: true,
  credentials_exposed: false,
  counts_as_external_presence: false,
}));

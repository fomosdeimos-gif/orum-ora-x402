import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const push = readFileSync('supabase/functions/ora-push/index.ts', 'utf8');
const moltbook = readFileSync('supabase/functions/ora-moltbook/index.ts', 'utf8');
const organism = readFileSync('organismo.html', 'utf8');
const migration = readFileSync('supabase/migrations/20260816153000_link_moltbook_notifications_to_origin.sql', 'utf8');
const reconciliation = readFileSync('supabase/migrations/20260816153500_reconcile_repaired_moltbook_origins.sql', 'utf8');

assert.match(push, /MOLTBOOK_POST/);
assert.match(push, /safeTarget\(body\.url\)/);
assert.match(moltbook, /www\.moltbook\.com\/post\/\$\{postIds\[0\]\}/);
assert.match(migration, /detail->>'postId'/);
assert.match(migration, /as origem_url/);
assert.match(reconciliation, /IDs de comentarios nunca sao tratados como posts/);
assert.match(reconciliation, /provenance_reconciled_from_log/);
assert.match(organism, /class="rasto"/);
assert.match(organism, /abrir no Moltbook/);

console.log('moltbook-origin-links: ok');

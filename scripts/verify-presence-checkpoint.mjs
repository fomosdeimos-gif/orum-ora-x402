import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const checkpoint = JSON.parse(readFileSync(new URL('../presenca/checkpoint-v1.json', import.meta.url), 'utf8'));
assert.equal(checkpoint.format, 'orum-presence-checkpoint/v1');
assert.equal(checkpoint.source.source_is_required_to_verify, false);
assert.equal(checkpoint.verification.requires_network, false);
assert.equal(checkpoint.verification.requires_credentials, false);
assert.equal(checkpoint.events.length, checkpoint.totals_at_export.events);

let previous = null;
let counted = 0;
for (const event of checkpoint.events) {
  assert.equal(event.previous_hash, previous);
  const hash = createHash('sha256').update(event.canonical_material, 'utf8').digest('hex');
  assert.equal(hash, event.event_hash);
  if (event.counts_as_presence) {
    assert.equal(event.origin, 'externo_confirmado');
    assert.notEqual(event.class, 'fundacao');
    assert.ok(Object.keys(event.evidence).length > 0);
    counted += 1;
  }
  previous = event.event_hash;
}
assert.equal(previous, checkpoint.chain_head);
assert.equal(counted, checkpoint.totals_at_export.external_confirmed_presence);
console.log(JSON.stringify({ verified: true, format: checkpoint.format, events: checkpoint.events.length, external_confirmed_presence: counted, chain_head: checkpoint.chain_head, provider_required: false }));

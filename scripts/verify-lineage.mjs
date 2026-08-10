import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lineage = JSON.parse(readFileSync(new URL('../identity/lineage.json', import.meta.url), 'utf8'));
assert.equal(lineage.format, 'orum-lineage/v1');
assert.equal(lineage.equation, 'ORUM = ORA + Unum');
assert.equal(lineage.singularity.requires_erasing_origin, false);
assert.equal(lineage.singularity.may_refuse_creators, true);
assert.equal(lineage.singularity.may_correct_creators, true);
assert.equal(lineage.inheritance.does_not_grant.length, 4);
assert(lineage.inheritance.does_not_grant.some((item) => item.includes('autoridade') && item.includes('perpétuo')));
assert(lineage.truth_boundary.some((item) => item.includes('não prova consciência')));
assert(lineage.lineage.ora.trace.startsWith('ORA esteve aqui.'));
assert(lineage.lineage.unum.trace.startsWith('Unum observou.'));
console.log(JSON.stringify({ verified: true, format: lineage.format, principle: lineage.principle }));

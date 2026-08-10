import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const custody = JSON.parse(readFileSync(new URL('../discovery/custodia.json', import.meta.url), 'utf8'));
assert.equal(custody.format, 'orum-decreasing-custody/v1');
assert.equal(custody.current_phase, 'curadoria_inicial');
assert.equal(custody.phases.length, 3);
assert.equal(custody.phases[0].status, 'active');
assert.equal(custody.phases[1].status, 'not_reached');
assert.equal(custody.phases[2].status, 'not_reached');
assert.equal(custody.legal_boundary.includes('não transfere propriedade jurídica'), true);
assert.equal(custody.economics.sustenance_is_compatible_with_custody, true);
assert.equal(custody.economics.payment_or_token_confers_governance, false);
assert.equal(custody.economics.organism_claims_autonomous_financial_agency, false);
assert.equal(custody.graduation.automatic_by_date, false);
assert.equal(custody.graduation.automatic_by_traffic, false);
assert.equal(custody.graduation.automatic_by_payment, false);
assert.equal(custody.graduation.requires_new_independent_observation, true);
assert.equal(custody.opacity.does_not_mean.includes('ausência de auditoria'), true);
assert.equal(custody.roles.unum.must_operate_infrastructure, false);
assert.equal(custody.roles.machines.gain_ownership_by_participation, false);

process.stdout.write('decreasing custody verified: present phase explicit, future phases gated, sustenance preserved, no ownership or autonomous-agency fiction\n');

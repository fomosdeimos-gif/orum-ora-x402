import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(readFileSync(resolve(root, 'weave_hands.json'), 'utf8'));
const fail = (message) => { throw new Error(`weave_hands: ${message}`); };

if (contract.schema !== 'orum-weave-hands/v2') fail('schema inesperado');
if (contract.decision?.organism_provider_independent !== false) fail('independência não provada deve permanecer false');
if (contract.zeros_preserved?.second_public_house_verified !== 0) fail('segunda casa ainda não foi verificada publicamente');
if (contract.guard?.mode !== 'fail_closed') fail('o guardião deve falhar fechado');

const sourceNames = new Set((contract.sources || []).map((source) => source.name));
for (const required of ['@ORUM-real', '@0001sensations-mergulho']) {
  if (!sourceNames.has(required)) fail(`fonte ausente: ${required}`);
}

const checks = [
  ['recovery-integrity', 'scripts/verify-recovery-bundle.mjs'],
  ['recovery-rehearsal', 'scripts/rehearse-recovery-bundle.mjs'],
  ['presence-checkpoint', 'scripts/verify-presence-checkpoint.mjs'],
  ['0001sensations-descent', 'scripts/verify-sensation-grammar.mjs'],
  ['portable-voice-box', 'portable/caixa/verify.mjs'],
  ['moltbook-presence', 'scripts/verify-moltbook-presence.mjs'],
];

if (process.env.WEAVE_HANDS_DRY_RUN !== '1') {
  for (const [name, script] of checks) {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    if (result.status !== 0) {
      process.stderr.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      fail(`${name} recusou a construção`);
    }
    process.stdout.write(`OK  ${name}\n`);
  }
}

process.stdout.write(`${JSON.stringify({
  schema: 'orum-weave-proof/v1',
  contract: contract.schema,
  mode: process.env.WEAVE_HANDS_DRY_RUN === '1' ? 'dry_run' : 'verified',
  checks: checks.map(([name]) => name),
  provider_independence_claimed: false,
  second_public_house_verified: 0,
})}\n`);

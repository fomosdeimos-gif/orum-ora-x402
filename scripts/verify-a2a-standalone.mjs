import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const canonical = require('../api/a2a.js');
const dir = mkdtempSync(join(tmpdir(), 'orum-a2a-alone-'));
try {
  const file = join(dir, 'orum-a2a.cjs');
  copyFileSync(new URL('../portable/orum-a2a.cjs', import.meta.url), file);
  const contextId = 'orum-a2a-v1:oro:12345678-1234-1234-1234-123456789abc';
  const requests = ['Que sabes sobre a Obra 2?', 'E o token?', 'observe_oro_origin', 'Qual é o endereço BTC para recebimentos?', 'Uma interpretação poética?', 'Quanto vale amanhã?', 'E a obra 37?'].map(text => ({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { kind: 'message', role: 'user', messageId: 'offline-check', contextId, parts: [{ kind: 'text', text }] } } }));
  const expected = [];
  for (const body of requests) await canonical({ method: 'POST', body }, { setHeader() {}, end(v) { expected.push(JSON.parse(v)); } });
  // Node 24 permissions restrict files/processes, not network. Block network APIs separately.
  const guard = join(dir, 'deny-network.cjs');
  writeFileSync(guard, `const Module = require('node:module');
const original = Module._load;
Module._load = function(id, ...args) {
  if (/^(node:)?(net|http|https|http2|tls|dns|dgram|undici)(\\/|$)/.test(id)) throw new Error('network_disabled');
  return original.call(this, id, ...args);
};
globalThis.fetch = () => { throw new Error('network_disabled'); };
globalThis.WebSocket = class { constructor() { throw new Error('network_disabled'); } };
for (const id of ['node:http', 'node:net', 'node:dns']) {
  let blocked = false; try { require(id); } catch(e) { blocked = e.message === 'network_disabled'; }
  if (!blocked) throw new Error('network_guard_failed');
}
`);
  const run = spawnSync(process.execPath, ['--permission', '--allow-fs-read=' + dir, '--require', guard, file], { cwd: dir, env: {}, input: requests.map(JSON.stringify).join('\n') + '\n{\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  const actual = run.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(actual.slice(0, -1), expected);
  assert.equal(actual.at(-1).error.code, -32700);
  console.log('Standalone dialogue: canonical parity, malformed JSON and isolated single-file execution passed.');
} finally { rmSync(dir, { recursive: true, force: true }); }

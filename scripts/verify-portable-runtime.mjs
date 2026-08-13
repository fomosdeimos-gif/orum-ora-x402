import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const port = 3217;
const upstreamPort = 3218;
const base = `http://127.0.0.1:${port}`;
const upstream = createServer((req, res) => {
  if (req.url === '/rest/v1/rpc/ora_presenca_livro_publico') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ format: 'orum-presence-ledger/v1', external_confirmed_presence: 0, total_events: 1, events: [] }));
    return;
  }
  res.statusCode = 402;
  res.setHeader('content-type', 'application/json');
  res.setHeader('payment-required', 'portable-payment-proof');
  res.end(JSON.stringify({ path: req.url, payment: req.headers['x-payment'] || null, host: req.headers['x-ora-host'] || null }));
});
await new Promise((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['server.js'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    ORUM_PUBLIC_BASE: base,
    ORUM_COMMIT_SHA: 'portable-test',
    ORUM_FUNCTIONS_BASE: `http://127.0.0.1:${upstreamPort}`,
    ORUM_SUPABASE_REST_BASE: `http://127.0.0.1:${upstreamPort}/rest/v1/`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/_orum/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('portable runtime did not become healthy');
}

try {
  const health = await waitForHealth();
  assert.equal(health.organism, 'ORUM');
  assert.equal(health.runtime, 'portable-node');
  assert.equal(health.commit, 'portable-test');

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type') || '', /text\/html/);

  const capsule = await fetch(`${base}/sensacoes/obra-37-v1.json`);
  assert.equal(capsule.status, 200);
  const capsuleBody = await capsule.json();
  assert.equal(capsuleBody.id, 'orum:sensation:0001sensations:physical:37:v1');

  const grammar = await fetch(`${base}/sensacoes/gramatica-v1.json`);
  assert.equal(grammar.status, 200);
  const grammarBody = await grammar.json();
  assert.equal(grammarBody.format, 'orum-encounter-grammar/v1');
  assert.equal(grammarBody.families.length, 7);

  const custody = await fetch(`${base}/discovery/custodia.json`);
  assert.equal(custody.status, 200);
  const custodyBody = await custody.json();
  assert.equal(custodyBody.format, 'orum-decreasing-custody/v1');
  assert.equal(custodyBody.current_phase, 'curadoria_inicial');
  assert.equal(custodyBody.phases[2].status, 'not_reached');

  const financialConstitution = await fetch(`${base}/economia/constituicao-v2.json`);
  assert.equal(financialConstitution.status, 200);
  const financialBody = await financialConstitution.json();
  assert.equal(financialBody.format, 'orum-financial-constitution/v2');
  assert.equal(financialBody.operating_permission.maximum_usdc_per_month, 5);
  assert.equal(financialBody.operating_permission.effective_transfer_limit_usdc, 0);
  assert.deepEqual(financialBody.operating_permission.allowed_destinations, []);
  assert.equal(financialBody.custody.legal_and_signing_authority, 'Unum');

  const presence = await fetch(`${base}/presenca/livro.json`);
  assert.equal(presence.status, 200);
  const presenceBody = await presence.json();
  assert.equal(presenceBody.format, 'orum-presence-ledger/v1');
  assert.equal(presenceBody.external_confirmed_presence, 0);

  const presenceCheckpoint = await fetch(`${base}/presenca/checkpoint-v1.json`);
  assert.equal(presenceCheckpoint.status, 200);
  const checkpointBody = await presenceCheckpoint.json();
  assert.equal(checkpointBody.format, 'orum-presence-checkpoint/v1');
  assert.equal(checkpointBody.verification.requires_network, false);

  const openapi = await fetch(`${base}/openapi.json`);
  assert.equal(openapi.status, 200);
  const openapiBody = await openapi.json();
  assert.equal(openapiBody.servers[0].url, base);
  assert.ok(openapiBody.paths['/economia/tesouraria.json']);

  const version = await fetch(`${base}/api/versao`).then((response) => response.json());
  assert.equal(version.commit_sha, 'portable-test');
  assert.equal(version.runtime, 'portable-node');

  const missing = await fetch(`${base}/does-not-exist`);
  assert.equal(missing.status, 404);

  const privateSource = await fetch(`${base}/server.js`);
  assert.equal(privateSource.status, 404);

  const repositoryMetadata = await fetch(`${base}/.git/config`);
  assert.equal(repositoryMetadata.status, 404);

  const proxy = await fetch(`${base}/pulso`, { headers: { 'x-payment': 'portable-request-proof' } });
  assert.equal(proxy.status, 402);
  assert.equal(proxy.headers.get('payment-required'), 'portable-payment-proof');
  const proxyBody = await proxy.json();
  assert.equal(proxyBody.path, '/ora-pulso');
  assert.equal(proxyBody.payment, 'portable-request-proof');
  assert.equal(proxyBody.host, '127.0.0.1:3217');

  process.stdout.write('portable runtime verified: health, static, capsule, grammar, financial constitution, OpenAPI, version, 404, source denial, x402 proxy\n');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => upstream.close(resolve));
}

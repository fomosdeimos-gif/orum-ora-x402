// Run with VIEM_TEST_ROOT pointing to a scratch install of viem@2.56.3.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createRenewalHandler, renewalMessage } from '../supabase/functions/ora-licenca/renewal.ts';
const require = createRequire(process.env.VIEM_TEST_ROOT + '/package.json');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { createPublicClient, custom } = require('viem');
const owner = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
let time = Date.parse('2026-09-09T09:00:00Z');
const tx = '0x' + 'a'.repeat(64);
const initial = { id: 'fixture', tx_hash: tx, obra_id: 89, obra_sha256: 'b'.repeat(64), tipo_licenca: 'consulta', licenciado: owner.address, valida_ate: new Date(time + 86400000).toISOString(), revogada_em: null };
let license = { ...initial }, delivered = 0, secondsSeen = 0, available = true;
// The public client's EOA fallback verifies an actual signature; no live RPC.
const client = createPublicClient({ transport: custom({ request: async () => { throw new Error('offline fixture'); } }, { retryCount: 0 }) });
const handler = createRenewalHandler({ now: () => time,
  loadLicense: async requested => requested === tx ? { ...license } : null,
  verifySignature: async (address, message, signature) => client.verifyMessage({ address, message, signature }),
  deliver: async (l, seconds) => { assert.equal(l.obra_id, 89); delivered++; secondsSeen = seconds; return available ? { url: 'https://example.invalid/private-fixture', expira_em: new Date(time + seconds * 1000).toISOString() } : null; },
});
const endpoint = 'https://ora-x402-gateway.vercel.app/licenca/reacesso';
const challenge = await (await handler(new Request(endpoint + '?tx=' + tx))).json();
assert.equal(challenge.payment_required, false);
const body = { transactionHash: tx, issued_at: challenge.issued_at, nonce: challenge.nonce, signature: await owner.signMessage({ message: challenge.message }) };
const post = async b => { const r = await handler(new Request(endpoint, { method: 'POST', body: JSON.stringify(b) })); return { status: r.status, body: await r.json() }; };
assert.equal((await post(body)).body.acesso, 'renovado'); assert.equal(secondsSeen, 300);
let count = delivered;
assert.equal((await post({ ...body, signature: await other.signMessage({ message: challenge.message }) })).status, 401);
assert.equal(delivered, count);
assert.equal((await post({ ...body, nonce: crypto.randomUUID() })).status, 401);
assert.equal((await post({ ...body, signature: await owner.signMessage({ message: challenge.message.replace('8453', '1') }) })).status, 401);
assert.equal((await post({ ...body, transactionHash: '0x' + 'c'.repeat(64) })).status, 403);
license.revogada_em = new Date(time).toISOString(); assert.equal((await post(body)).status, 403);
license = { ...initial, valida_ate: new Date(time - 1).toISOString() }; assert.equal((await post(body)).status, 403);
license = { ...initial, valida_ate: new Date(time + 20000).toISOString() }; assert.equal((await post(body)).status, 200); assert.equal(secondsSeen, 20);
license = { ...initial }; time += 301000; assert.equal((await post(body)).status, 401); time -= 301000;
available = false; assert.equal((await post(body)).status, 503);
assert.equal((await post({ transactionHash: tx })).status, 400);
assert.equal((await handler(new Request(endpoint, { method: 'POST', body: 'x'.repeat(17000) }))).status, 413);
assert.equal((await handler(new Request(endpoint + '?tx=invalid'))).status, 400);
assert.match(renewalMessage(tx, body.issued_at, body.nonce), /no payment or asset transfer/);
console.log('PASS: real EOA signatures, wrong wallet/domain/nonce, expired/revoked/missing license, TTL cap, unavailable delivery, bounded requests. No payment or production license mutation.');

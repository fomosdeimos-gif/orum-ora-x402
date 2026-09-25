#!/usr/bin/env node
// Read-only x402 v2 compatibility probe for ORUM.
// No wallet, signer, payment header, settlement, or image access is used.
// --live performs public GETs and therefore creates ordinary access/challenge telemetry.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const BASE = 'https://ora-x402-gateway.vercel.app';
const NETWORK = 'eip155:8453';
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PAY_TO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';

function decodeHeader(encoded) {
  assert.ok(encoded, 'PAYMENT-REQUIRED header is missing');
  let value;
  try { value = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { assert.fail('PAYMENT-REQUIRED is not base64-encoded JSON'); }
  return value;
}

export function inspectChallenge(body, header, expectedResource) {
  const envelope = typeof body === 'string' ? JSON.parse(body) : body;
  const headerEnvelope = decodeHeader(header);
  assert.equal(envelope.x402Version, 2, 'body is not x402 v2');
  assert.equal(headerEnvelope.x402Version, 2, 'header is not x402 v2');
  assert.equal(envelope.error, 'Payment required');
  assert.equal(envelope.resource?.url, expectedResource, 'body resource differs from the redirected resource');
  assert.equal(headerEnvelope.resource?.url, expectedResource, 'header resource differs from the redirected resource');
  assert.ok(Array.isArray(envelope.accepts) && envelope.accepts.length > 0, 'body has no accepted payment requirements');
  assert.ok(Array.isArray(headerEnvelope.accepts) && headerEnvelope.accepts.length > 0, 'header has no accepted payment requirements');

  const normalized = envelope.accepts.map((accept, index) => {
    const mirrored = headerEnvelope.accepts[index];
    assert.ok(mirrored, `header is missing accepted requirement ${index}`);
    for (const key of ['scheme', 'network', 'amount', 'asset', 'payTo', 'resource']) {
      assert.equal(accept[key], mirrored[key], `body/header mismatch in accepts[${index}].${key}`);
    }
    assert.equal(accept.scheme, 'exact', 'unsupported x402 scheme');
    assert.equal(accept.network, NETWORK, 'unexpected payment network');
    assert.equal(accept.asset?.toLowerCase(), ASSET.toLowerCase(), 'unexpected payment asset');
    assert.equal(accept.payTo?.toLowerCase(), PAY_TO.toLowerCase(), 'unexpected payment recipient');
    assert.equal(accept.resource, expectedResource, 'accepted resource differs from challenge resource');
    assert.ok(/^\d+$/.test(String(accept.amount)) && BigInt(accept.amount) > 0n, 'amount must be positive atomic units');
    if (accept.maxAmountRequired !== undefined) {
      assert.equal(String(accept.maxAmountRequired), String(accept.amount), 'maximum amount disagrees with amount');
    }
    return {
      scheme: accept.scheme,
      network: accept.network,
      amount_atomic: String(accept.amount),
      asset: accept.asset,
      pay_to: accept.payTo,
      max_timeout_seconds: accept.maxTimeoutSeconds ?? null,
    };
  });

  const headerNames = Object.keys(envelope.headerFields ?? {}).map(x => x.toUpperCase());
  assert.ok(headerNames.includes('X-PAYMENT') || headerNames.includes('PAYMENT-SIGNATURE'), 'no payment header is declared');
  return { x402_version: 2, resource_matches: true, body_header_match: true, accepts: normalized };
}

function safeResource(urlText) {
  const url = new URL(urlText);
  const names = [...url.searchParams.keys()].filter(name => name !== 'selection');
  const params = names.map(name => `${encodeURIComponent(name)}=${encodeURIComponent(url.searchParams.get(name))}`);
  if (url.searchParams.has('selection')) params.push('selection=<redacted>');
  return `${url.origin}${url.pathname}${params.length ? `?${params.join('&')}` : ''}`;
}

async function live() {
  const get = (url) => fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const sampleResponse = await get(`${BASE}/licenca/amostra`);
  assert.equal(sampleResponse.status, 200, `free sample returned HTTP ${sampleResponse.status}`);
  const sample = await sampleResponse.json();
  const workId = String(sample.obra?.id ?? '');
  const hash = String(sample.obra?.sha256 ?? '');
  assert.ok(workId && /^[a-f0-9]{64}$/i.test(hash), 'free sample has no canonical work ID/hash');
  const offer = sample.licenciar?.find(item => item.tipo === 'consulta');
  assert.ok(offer?.endpoint, 'free sample has no consultation endpoint');
  const endpoint = new URL(offer.endpoint);
  assert.equal(endpoint.origin, BASE, 'offer points outside the canonical ORUM gateway');
  assert.equal(endpoint.searchParams.get('obra'), workId, 'offer changed the sampled work ID');
  assert.equal(endpoint.searchParams.get('sha256')?.toLowerCase(), hash.toLowerCase(), 'offer changed the sampled work hash');

  const first = await get(endpoint);
  assert.equal(first.status, 307, `first consultation request returned HTTP ${first.status}, not 307`);
  const location = first.headers.get('location');
  assert.ok(location, '307 response has no Location header');
  const resource = new URL(location, endpoint).toString();
  const selected = new URL(resource);
  assert.equal(selected.origin, BASE, 'signed selection points outside the canonical ORUM gateway');
  assert.equal(selected.searchParams.get('obra'), workId, '307 changed the sampled work ID');
  assert.equal(selected.searchParams.get('sha256')?.toLowerCase(), hash.toLowerCase(), '307 changed the sampled work hash');
  assert.ok(selected.searchParams.has('selection'), '307 did not provide a signed selection');

  // Deliberately send no payment header and follow no redirect automatically.
  const challenge = await get(resource);
  assert.equal(challenge.status, 402, `signed resource returned HTTP ${challenge.status}, not 402`);
  const challengeText = await challenge.text();
  const checked = inspectChallenge(challengeText, challenge.headers.get('payment-required'), resource);
  console.log(JSON.stringify({
    result: 'PASS_READ_ONLY_X402_V2',
    sample_http: sampleResponse.status,
    initial_offer_http: first.status,
    signed_resource_http: challenge.status,
    work_id: workId,
    selection_preserved: true,
    resource: safeResource(resource),
    challenge: checked,
    payment_header_sent: false,
    payment_or_signature: false,
    settlement: false,
    image_access: false,
    telemetry_note: 'This live probe creates normal access/challenge telemetry; it is not a customer or purchase.',
  }, null, 2));
}

function selfTest() {
  const resource = `${BASE}/licenca/consulta?obra=77&selection=fake-test-token`;
  const fixture = {
    x402Version: 2,
    error: 'Payment required',
    resource: { url: resource },
    accepts: [{ scheme: 'exact', network: NETWORK, amount: '1618000', maxAmountRequired: '1618000',
      asset: ASSET, payTo: PAY_TO, resource, maxTimeoutSeconds: 300 }],
    headerFields: { 'PAYMENT-SIGNATURE': { type: 'string', required: false }, 'X-PAYMENT': { type: 'string', required: false } },
  };
  const header = Buffer.from(JSON.stringify(fixture)).toString('base64');
  assert.equal(inspectChallenge(fixture, header, resource).accepts[0].amount_atomic, '1618000');
  const wrongNetwork = { ...fixture, accepts: [{ ...fixture.accepts[0], network: 'eip155:1' }] };
  const wrongNetworkHeader = Buffer.from(JSON.stringify(wrongNetwork)).toString('base64');
  assert.throws(() => inspectChallenge(wrongNetwork, wrongNetworkHeader, resource), /unexpected payment network/);
  const mismatched = { ...fixture, resource: { url: `${resource}&other=1` } };
  assert.throws(() => inspectChallenge(mismatched, header, resource), /body resource differs/);
  console.log('PASS: x402 v2 body/header parity, Base/USDC/recipient/resource checks, and negative network/resource cases. No network or wallet access.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: node scripts/diagnose-x402-readonly.mjs --self-test | --live');
    console.log('--self-test runs offline fixtures; --live performs free public GETs and records ordinary access/challenge telemetry. Neither mode sends payment or signature headers.');
    process.exit(args.includes('--help') ? 0 : 2);
  }
  if (args.length !== 1 || !['--self-test', '--live'].includes(args[0])) {
    console.error('Choose exactly one of --self-test or --live.');
    process.exit(2);
  }
  try { args[0] === '--self-test' ? selfTest() : await live(); }
  catch (error) { console.error(`FAIL_READ_ONLY_X402_DIAGNOSTIC: ${error.message}`); process.exitCode = 1; }
}

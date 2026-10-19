import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as realPayments from '../supabase/functions/ora-operational-wallet/payments.mjs';
import * as realGasless from '../supabase/functions/ora-operational-wallet/gasless.mjs';
import { handler } from '../supabase/functions/ora-operational-wallet/core.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../supabase/functions/ora-operational-wallet');
const { SOURCE, DESTINATION, TOKEN, AUTH_USED_TOPIC, authorizationNonce } = realPayments;
const id = 'bc153211-4c87-47b7-8516-3256d6b70001', id2 = 'cc153211-4c87-47b7-8516-3256d6b70002';
const FACILITATOR = '0x' + 'fa'.repeat(20), SIG = '0x' + '11'.repeat(65), HASH = '0x' + 'b'.repeat(64), NOW = 1_800_000_000_000;
const word = a => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function suite({ gaslessAction, paymentAction }) {
  let job, claims, signs, verifies, settles, typed, sent, balance, eth, recovered, verifyReply, settleReply, claimOpen;
  const reset = () => { job = null; claims = 0; signs = 0; verifies = 0; settles = 0; typed = null; sent = null; balance = 10000000n; eth = 0n; recovered = SOURCE; verifyReply = { status: 200, json: { isValid: true } }; settleReply = { status: 200, json: { success: true, transaction: HASH } }; claimOpen = true; };
  reset();
  const rpc = async (name, args) => {
    if (name === 'ora_payment_job_v1') return job;
    if (name === 'ora_payment_claim_v1') { claims++; if (job || !claimOpen) return { claimed: false }; job = { id: args.p_id, amount_atomic: args.p_amount, status: 'reserved', tx_hash: null }; return { claimed: true }; }
    if (name === 'ora_payment_result_v1') { job = { ...job, status: args.p_status, tx_hash: args.p_tx }; return job; }
    throw Error('unexpected RPC ' + name);
  };
  let receipt = null, tx = null, wrongChain = false;
  const chainRpc = async method => ({ eth_chainId: wrongChain ? '0x1' : '0x2105', eth_call: '0x' + balance.toString(16), eth_getBalance: '0x' + eth.toString(16), eth_blockNumber: '0x30', eth_getTransactionReceipt: receipt, eth_getTransactionByHash: tx })[method];
  const cdp = {
    evm: { getAccount: async () => ({ address: SOURCE }), signTypedData: async a => { signs++; assert.equal(a.address, SOURCE); typed = a.typedData; return { signature: SIG }; } },
    x402: async (kind, body) => { sent = body; if (kind === 'verify') { verifies++; return verifyReply; } settles++; if (settleReply instanceof Error) throw settleReply; return settleReply; },
  };
  const run = (action = 'transfer_usdc_gasless', amount_atomic = '1000000', request_id = id) => gaslessAction({ action, amount_atomic, request_id }, { rpc, cdp, chainRpc, recoverTypedDataAddress: async () => recovered, now: () => NOW });

  // malformed input and wrong chain: nothing is signed
  for (const bad of ['0', '-1', '1.5', 'abc', '01', '']) assert.equal((await run('transfer_usdc_gasless', bad)).status, 400, 'malformed amount accepted: ' + bad);
  assert.equal((await run('transfer_usdc_gasless', '1', 'not-a-uuid')).status, 400);
  wrongChain = true; assert.equal((await run()).error, 'wrong_chain'); wrongChain = false;
  assert.equal(signs + verifies + settles + claims, 0);
  // preview: no signing, no reservation, shows the fixed destination
  const preview = await run('preview_usdc_gasless');
  assert.equal(preview.status, 200); assert.equal(preview.signed, false); assert.equal(preview.destination, DESTINATION); assert.equal(signs + claims + settles, 0);
  // insufficient USDC: nothing signed
  balance = 10n; assert.equal((await run()).error, 'insufficient_operational_funds'); assert.equal(signs, 0); balance = 10000000n;
  // the whole point: with ZERO ETH the payout still goes through
  assert.equal(eth, 0n);
  const ok = await run();
  assert.equal(ok.status, 202); assert.equal(ok.gasless, true); assert.equal(ok.tx_hash, HASH);
  assert.equal(signs, 1); assert.equal(verifies, 1); assert.equal(settles, 1); assert.equal(claims, 1); assert.equal(job.status, 'submitted');
  // what was signed is exactly: fixed destination, requested amount, USDC domain, deterministic nonce
  assert.equal(typed.primaryType, 'TransferWithAuthorization'); assert.equal(typed.domain.verifyingContract, TOKEN); assert.equal(typed.domain.chainId, 8453);
  assert.equal(typed.message.from, SOURCE); assert.equal(typed.message.to, DESTINATION); assert.equal(typed.message.value, '1000000');
  assert.equal(typed.message.nonce, await authorizationNonce(id)); assert.notEqual(await authorizationNonce(id), await authorizationNonce(id2));
  assert.equal(Number(typed.message.validBefore), NOW / 1000 + 300);
  assert.equal(sent.paymentRequirements.payTo, DESTINATION); assert.equal(sent.paymentRequirements.amount, '1000000'); assert.equal(sent.paymentPayload.payload.authorization.to, DESTINATION);
  // replay and conflict: no second signature or settlement
  assert.equal((await run()).replayed, true); assert.equal((await run('transfer_usdc_gasless', '1')).error, 'idempotency_conflict'); assert.equal(signs, 1); assert.equal(settles, 1);
  // signature that does not recover to the operational account: stop before the facilitator and before any claim
  reset(); recovered = '0x' + '9'.repeat(40);
  assert.equal((await run()).error, 'signature_identity_mismatch'); assert.equal(verifies + settles + claims, 0);
  // facilitator refuses at verify: nothing reserved or settled
  reset(); verifyReply = { status: 200, json: { isValid: false } };
  assert.equal((await run()).error, 'facilitator_rejected_authorization'); assert.equal(claims + settles, 0);
  // another payment unresolved: no settlement
  reset(); claimOpen = false; assert.equal((await run()).status, 409); assert.equal(settles, 0);
  // settlement without a transaction hash, a rejection or a thrown error: frozen as unknown, never retried silently
  for (const bad of [{ status: 200, json: { success: true } }, { status: 200, json: { success: false } }, { status: 500, json: {} }, new Error('network')]) {
    reset(); settleReply = bad;
    const r = await run(); assert.equal(r.error, 'submission_outcome_unknown'); assert.equal(r.retry_allowed, false); assert.equal(job.status, 'unknown');
    const again = settles; assert.equal((await run()).replayed, true); assert.equal(settles, again);
  }
  // confirmation by on-chain proof, for a payout sent without ETH
  reset(); job = { id, amount_atomic: '1000000', status: 'submitted', tx_hash: HASH };
  const nonce = await authorizationNonce(id);
  const used = n => ({ address: TOKEN, topics: [AUTH_USED_TOPIC, word(SOURCE), n] });
  const transfer = { address: TOKEN, topics: [TRANSFER, word(SOURCE), word(DESTINATION)], data: '0x' + (1000000).toString(16) };
  tx = { from: FACILITATOR, to: TOKEN, input: '0xe3ee160e' }; receipt = { status: '0x1', blockNumber: '0x10', logs: [used(nonce), transfer] };
  const status = a => paymentAction({ action: 'payment_status', request_id: id }, { rpc, cdp, chainRpc });
  assert.equal((await status()).job.status, 'confirmed');
  job = { id, amount_atomic: '1000000', status: 'submitted', tx_hash: HASH }; receipt.logs = [used(await authorizationNonce(id2)), transfer];
  assert.equal((await status()).error, 'transaction_mismatch', 'a foreign nonce must not confirm this payout');
  receipt.logs = [transfer]; assert.equal((await status()).error, 'transaction_mismatch', 'a Transfer without our authorization must not confirm');
  receipt.logs = [used(nonce)]; assert.equal((await status()).error, 'receipt_mismatch', 'authorization without the Transfer must not confirm');
  receipt.logs = [used(nonce), { ...transfer, data: '0x1' }]; assert.equal((await status()).error, 'receipt_mismatch', 'wrong amount must not confirm');
  receipt.logs = [used(nonce), { ...transfer, topics: [TRANSFER, word(SOURCE), word(SOURCE)] }]; assert.equal((await status()).error, 'receipt_mismatch', 'wrong destination must not confirm');
}

await suite({ gaslessAction: realGasless.gaslessAction, paymentAction: realPayments.paymentAction });
console.log('PASS: payout with 0 ETH, fixed destination and amount in the signed message, deterministic nonce, signer check, claim before settle, unknown outcome frozen, confirmation only by AuthorizationUsed + Transfer.');

// New actions go through the same strict allow-list: no destination, no extra fields, no secret read before validation.
let secretReads = 0;
const route = handler({ rpc: async n => { if (n === 'ora_operational_wallet_auth_v1') return true; secretReads++; throw Error('no secret reads permitted'); }, makeClient: () => { throw Error('no client'); }, chainRpc: async () => '0x2105' });
const req = body => new Request('https://invalid', { method: 'POST', headers: { authorization: 'Bearer ' + 'a'.repeat(64) }, body: JSON.stringify(body) });
for (const action of ['transfer_usdc_gasless', 'preview_usdc_gasless']) {
  assert.equal((await route(req({ action, request_id: id, amount_atomic: '1', destination: SOURCE }))).status, 400);
  assert.equal((await route(req({ action, request_id: id, amount_atomic: '1', to: SOURCE }))).status, 400);
}
assert.equal(secretReads, 0);
console.log('PASS: new actions accept only request_id and amount_atomic.');

// Deliberate damage: each change below must make the suite fail.
const gaslessSrc = fs.readFileSync(path.join(dir, 'gasless.mjs'), 'utf8');
const paymentsSrc = fs.readFileSync(path.join(dir, 'payments.mjs'), 'utf8');
const damages = [
  ['destination changed in the signed message', 'gasless', "to: DESTINATION, value: String(amount)", "to: SOURCE, value: String(amount)"],
  ['amount changed in the signed message', 'gasless', "value: String(amount), validAfter", "value: '1', validAfter"],
  ['signer check removed', 'gasless', "if (recovered.toLowerCase() !== SOURCE.toLowerCase())", "if (false)"],
  ['facilitator verify ignored', 'gasless', "verified.json?.isValid !== true", "false"],
  ['claim result ignored', 'gasless', "if (!claim.claimed) return { status: 409, ...claim };", ""],
  ['random nonce instead of one per request', 'gasless', "nonce: await authorizationNonce(id)", "nonce: '0x' + 'ab'.repeat(32)"],
  ['settle accepted without a transaction hash', 'gasless', "|| !isHash(settled.json?.transaction)", ""],
  ['requires ETH again', 'gasless', "if (balance < BigInt(body.amount_atomic))", "if (balance < BigInt(body.amount_atomic) || BigInt(await chainRpc('eth_getBalance', [SOURCE, 'latest'])) < 1n)"],
  ['any AuthorizationUsed confirms (nonce not compared)', 'payments', "log.topics?.[2]?.toLowerCase()===nonce", "true"],
  ['direct-or-settled check dropped', 'payments', "if(!direct&&!settled)return {status:503,error:'transaction_mismatch'};", ""],
];
let caught = 0;
for (const [name, target, from, to] of damages) {
  const src = target === 'gasless' ? gaslessSrc : paymentsSrc;
  assert.ok(src.includes(from), 'damage target not found: ' + name);
  const stamp = `${Date.now()}-${caught}`;
  const files = [];
  try {
    let pay = realPayments, gas = realGasless;
    if (target === 'payments') { const f = path.join(dir, `payments.mutant-${stamp}.mjs`); fs.writeFileSync(f, src.replace(from, to)); files.push(f); pay = await import(pathToFileURL(f).href); }
    else { const f = path.join(dir, `gasless.mutant-${stamp}.mjs`); fs.writeFileSync(f, src.replace(from, to)); files.push(f); gas = await import(pathToFileURL(f).href); }
    await assert.rejects(() => suite({ gaslessAction: gas.gaslessAction, paymentAction: pay.paymentAction }), undefined, 'damage not caught: ' + name);
    caught++;
  } finally { for (const f of files) fs.rmSync(f, { force: true }); }
}
assert.equal(caught, damages.length);
console.log(`PASS: ${caught} deliberate damages caught.`);

// Optional independent check with the standard library (scratch install): the typed data really is EIP-3009 for USDC on Base.
if (process.env.ORUM_VIEM_DIR) {
  const viem = await import(pathToFileURL(path.join(process.env.ORUM_VIEM_DIR, '_esm/index.js')).href);
  const accounts = await import(pathToFileURL(path.join(process.env.ORUM_VIEM_DIR, '_esm/accounts/index.js')).href);
  assert.equal(viem.hashDomain({ domain: realGasless.DOMAIN, types: { EIP712Domain: realGasless.TYPES.EIP712Domain } }), '0x02fa7265e7c5d81118673727957699e4d68f74cd74b7db77da710fe8a2c7834f', 'domain separator differs from the one read on Base');
  const typeString = `TransferWithAuthorization(${realGasless.TYPES.TransferWithAuthorization.map(f => `${f.type} ${f.name}`).join(',')})`;
  assert.equal(viem.keccak256(viem.toHex(typeString)), '0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267', 'type hash differs from EIP-3009');
  assert.equal(viem.keccak256(viem.toHex('AuthorizationUsed(address,bytes32)')), AUTH_USED_TOPIC);
  const key = accounts.generatePrivateKey(), signer = accounts.privateKeyToAccount(key);
  const message = { ...(await realGasless.buildAuthorization(id, '1000000', NOW / 1000)), from: signer.address };
  const typedData = realGasless.typedDataFor(message);
  const signature = await signer.signTypedData(typedData);
  assert.equal((await viem.recoverTypedDataAddress({ ...typedData, signature })).toLowerCase(), signer.address.toLowerCase());
  console.log('PASS: domain separator and type hash match the values read on Base; signature over our typed data recovers with viem.');
}

// USDC payout WITHOUT ETH on the operational account: it signs an EIP-3009 authorization (EIP-712) and an x402
// facilitator submits it and pays the gas. Same fixed destination, same one-at-a-time claim, same on-chain proof.
import { SOURCE, DESTINATION, TOKEN, authorizationNonce } from './payments.mjs';
const addressWord = a => a.slice(2).toLowerCase().padStart(64, '0');
const VALID_FOR_SECONDS = 300;
export const DOMAIN = { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: TOKEN };
export const TYPES = {
  EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
  TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }],
};
export async function buildAuthorization(id, amount, nowSeconds) {
  return { from: SOURCE, to: DESTINATION, value: String(amount), validAfter: '0', validBefore: String(nowSeconds + VALID_FOR_SECONDS), nonce: await authorizationNonce(id) };
}
export const typedDataFor = message => ({ domain: DOMAIN, types: TYPES, primaryType: 'TransferWithAuthorization', message });
export function x402Body(message, signature) {
  const requirements = { scheme: 'exact', network: 'eip155:8453', amount: message.value, asset: TOKEN, payTo: DESTINATION, maxTimeoutSeconds: VALID_FOR_SECONDS, extra: { name: 'USD Coin', version: '2' } };
  return { x402Version: 2, paymentPayload: { x402Version: 2, accepted: requirements, payload: { signature, authorization: message } }, paymentRequirements: requirements };
}
const isHash = v => /^0x[0-9a-fA-F]{64}$/.test(v);
export async function gaslessAction(body, { rpc, cdp, chainRpc, recoverTypedDataAddress, now = () => Date.now() }) {
  const id = body.request_id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return { status: 400, error: 'invalid_request_id' };
  if (typeof body.amount_atomic !== 'string' || !/^[1-9][0-9]*$/.test(body.amount_atomic)) return { status: 400, error: 'amount_must_be_positive_integer_atomic_usdc' };
  if (await chainRpc('eth_chainId', []) !== '0x2105') return { status: 503, error: 'wrong_chain' };
  const old = await rpc('ora_payment_job_v1', { p_id: id });
  if (old) return old.amount_atomic === body.amount_atomic ? { status: 200, job: old, replayed: true } : { status: 409, error: 'idempotency_conflict' };
  const account = await cdp.evm.getAccount({ name: 'orum-operational-v1' });
  if (account.address.toLowerCase() !== SOURCE.toLowerCase()) return { status: 503, error: 'source_mismatch' };
  const balance = BigInt(await chainRpc('eth_call', [{ to: TOKEN, data: '0x70a08231' + addressWord(SOURCE) }, 'latest']));
  if (balance < BigInt(body.amount_atomic)) return { status: 409, error: 'insufficient_operational_funds', signed: false, submitted: false };
  const message = await buildAuthorization(id, body.amount_atomic, Math.floor(now() / 1000));
  if (body.action === 'preview_usdc_gasless') return { status: 200, preview: true, gasless: true, source: SOURCE, destination: DESTINATION, amount_atomic: body.amount_atomic, valid_before: message.validBefore, signed: false, submitted: false, budget_reserved: false };
  let signature;
  try { ({ signature } = await cdp.evm.signTypedData({ address: SOURCE, typedData: typedDataFor(message) })); }
  catch { return { status: 502, error: 'cdp_sign_failed', signed: false, submitted: false }; }
  const recovered = await recoverTypedDataAddress({ ...typedDataFor(message), signature });
  if (recovered.toLowerCase() !== SOURCE.toLowerCase()) return { status: 503, error: 'signature_identity_mismatch', submitted: false };
  const request = x402Body(message, signature);
  let verified;
  try { verified = await cdp.x402('verify', request); } catch { return { status: 502, error: 'facilitator_unavailable', submitted: false }; }
  if (verified.status !== 200 || verified.json?.isValid !== true) return { status: 409, error: 'facilitator_rejected_authorization', submitted: false };
  const claim = await rpc('ora_payment_claim_v1', { p_id: id, p_amount: body.amount_atomic });
  if (!claim.claimed) return { status: 409, ...claim };
  let submittedHash = null;
  try {
    const settled = await cdp.x402('settle', request);
    if (settled.status !== 200 || settled.json?.success !== true || !isHash(settled.json?.transaction)) throw Error('settle_not_confirmed');
    submittedHash = settled.json.transaction;
    await rpc('ora_payment_result_v1', { p_id: id, p_status: 'submitted', p_tx: submittedHash });
    return { status: 202, request_id: id, tx_hash: submittedHash, state: 'submitted_not_confirmed', gasless: true, internal_transfer: true };
  } catch {
    await rpc('ora_payment_result_v1', { p_id: id, p_status: 'unknown', p_tx: submittedHash }).catch(() => {});
    return { status: 503, error: 'submission_outcome_unknown', request_id: id, tx_hash: submittedHash, retry_allowed: false };
  }
}

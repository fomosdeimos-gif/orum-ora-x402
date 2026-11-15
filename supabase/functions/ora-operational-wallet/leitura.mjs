// Acção `x402_pagar_leitura` (15/11/2026; Unum: "Eu autorizo ora", ao texto concreto da acção): a operacional assina UMA autorização
// EIP-3009 (EIP-712) de 10 000 átomos de USDC (0,01 USDC, o preço de /leitura) DA operacional PARA A PRÓPRIA operacional, e apresenta-a
// ao desafio x402 de https://ora-x402-gateway.vercel.app/leitura. Um facilitador liquida (e paga o gás); o gateway só entrega depois de
// ver a transferência na Base. É uma transferência da conta para si mesma: não há destino novo, não conta como receita externa nem
// como adopção, e prova o fluxo inteiro (assinatura, verificação, liquidação, entrega).
//
// Fixo no código: valor, origem, destino (a própria operacional), URL, modelo EIP-712 e validade (10 min). O chamador só dá um
// request_id; o nonce deriva dele, por isso repetir o mesmo pedido não cria uma segunda autorização válida (o USDC recusa o nonce
// reutilizado). A assinatura nunca é devolvida: vai do executor ao gateway e fica por aí.
import { SOURCE, TOKEN, authorizationNonce } from './payments.mjs';
import { typedDataFor } from './gasless.mjs';
export const PRECO_ATOMIC = '10000';
export const URL_LEITURA = 'https://ora-x402-gateway.vercel.app/leitura';
export const VALID_FOR_SECONDS = 600;
const addressWord = a => a.slice(2).toLowerCase().padStart(64, '0');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const b64 = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));
export const exigencias = () => ({ scheme: 'exact', network: 'eip155:8453', amount: PRECO_ATOMIC, asset: TOKEN, payTo: SOURCE, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } });
export async function autorizacao(id, nowSeconds) {
  return { from: SOURCE, to: SOURCE, value: PRECO_ATOMIC, validAfter: '0', validBefore: String(nowSeconds + VALID_FOR_SECONDS), nonce: await authorizationNonce('x402-leitura:' + id) };
}
export async function pagarLeitura(body, { cdp, chainRpc, recoverTypedDataAddress, fetchFn = fetch, now = () => Date.now() }) {
  const id = body.request_id;
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, error: 'invalid_request_id' };
  if (await chainRpc('eth_chainId', []) !== '0x2105') return { status: 503, error: 'wrong_chain' };
  const account = await cdp.evm.getAccount({ name: 'orum-operational-v1' });
  if (account.address.toLowerCase() !== SOURCE.toLowerCase()) return { status: 503, error: 'source_mismatch' };
  const balance = BigInt(await chainRpc('eth_call', [{ to: TOKEN, data: '0x70a08231' + addressWord(SOURCE) }, 'latest']));
  if (balance < BigInt(PRECO_ATOMIC)) return { status: 409, error: 'insufficient_operational_funds', signed: false, submitted: false };
  const message = await autorizacao(id, Math.floor(now() / 1000));
  let signature;
  try { ({ signature } = await cdp.evm.signTypedData({ address: SOURCE, typedData: typedDataFor(message) })); }
  catch { return { status: 502, error: 'cdp_sign_failed', signed: false, submitted: false }; }
  const recovered = await recoverTypedDataAddress({ ...typedDataFor(message), signature });
  if (recovered.toLowerCase() !== SOURCE.toLowerCase()) return { status: 503, error: 'signature_identity_mismatch', submitted: false };
  const payment = { x402Version: 2, scheme: 'exact', network: 'eip155:8453', accepted: exigencias(), payload: { signature, authorization: message } };
  let r, j = null;
  try {
    r = await fetchFn(URL_LEITURA, { method: 'GET', headers: { 'X-PAYMENT': b64(payment), accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
    j = await r.json().catch(() => null);
  } catch { return { status: 502, error: 'gateway_unreachable', request_id: id, outcome: 'unknown_until_observed', note: 'a autorizacao pode ter sido apresentada; ve a cadeia antes de repetir', signature_returned: false }; }
  const entregue = r.status === 200 && j && j.acesso === 'concedido' && j.tier === 'leitura' && /^0x[0-9a-fA-F]{64}$/.test(String(j.tx_hash || '')) && j.leitura && typeof j.leitura === 'object';
  const resumo = entregue ? { valium: { estado: j.leitura.valium_na_sagrada?.estado ?? null, verificado: j.leitura.valium_na_sagrada?.verificado ?? null, bloco: j.leitura.valium_na_sagrada?.bloco ?? null, valium: j.leitura.valium_na_sagrada?.valium ?? null },
    fundacao: { estado: j.leitura.fundacao_btc?.estado ?? null, verificado: j.leitura.fundacao_btc?.verificado ?? null, saldo_confirmado_sats: j.leitura.fundacao_btc?.saldo_confirmado_sats ?? null } } : null;
  return { status: 200, ok: Boolean(entregue), request_id: id, internal_transfer: true, payer_is_payee: true, amount_atomic: PRECO_ATOMIC, valid_until: message.validBefore,
    gateway_http_status: r.status, delivered: Boolean(entregue), via_pagamento: j?.via_pagamento ?? null, tx_hash: entregue ? j.tx_hash : (/^0x[0-9a-fA-F]{64}$/.test(String(j?.tx_hash || '')) ? j.tx_hash : null), reacesso: j?.reacesso ?? null,
    leitura_resumo: resumo, gateway_error: entregue ? null : String(j?.erro || j?.error || j?.x402 || '').slice(0, 120) || null, gateway_detail: entregue ? null : String(j?.detalhe || '').slice(0, 160) || null, signature_returned: false };
}

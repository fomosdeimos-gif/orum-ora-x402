// Verifica a acção `x402_pagar_leitura` do executor operacional (supabase/functions/ora-operational-wallet/leitura.mjs): assina UMA
// autorização EIP-3009 de 10 000 átomos da operacional para a própria operacional, apresenta-a a /leitura e nunca devolve a assinatura.
// Sem rede, sem chaves, sem pagamentos: CDP, cadeia e gateway são simulados. Cada estrago propositado tem de fazer a suite falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as realPayments from '../supabase/functions/ora-operational-wallet/payments.mjs';
import * as realLeitura from '../supabase/functions/ora-operational-wallet/leitura.mjs';
import * as gasless from '../supabase/functions/ora-operational-wallet/gasless.mjs';
import { handler } from '../supabase/functions/ora-operational-wallet/core.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../supabase/functions/ora-operational-wallet');
const { SOURCE, TOKEN, authorizationNonce } = realPayments;
const id = 'bc153211-4c87-47b7-8516-3256d6b70001';
const SIG = '0x' + '11'.repeat(65), HASH = '0x' + 'b'.repeat(64), NOW = 1_800_000_000_000;

async function suite({ pagarLeitura }) {
  let signs = 0, fetches = 0, typed = null, balance = 10_000_000n, recovered = SOURCE, accountAddress = SOURCE, wrongChain = false, signFails = false;
  let reply = null, fetchThrows = false, seen = null;
  const reset = () => { signs = 0; fetches = 0; typed = null; balance = 10_000_000n; recovered = SOURCE; accountAddress = SOURCE; wrongChain = false; signFails = false; fetchThrows = false; seen = null;
    reply = { status: 200, json: { acesso: 'concedido', tier: 'leitura', x402: 'verificado_onchain', via_pagamento: 'eip3009-publico', tx_hash: HASH, reacesso: false,
      leitura: { valium_na_sagrada: { estado: 'concordam', verificado: true, bloco: 7, valium: '1.5' }, fundacao_btc: { estado: 'concordam', verificado: true, saldo_confirmado_sats: 10072 } } } }; };
  reset();
  const chainRpc = async (m) => ({ eth_chainId: wrongChain ? '0x1' : '0x2105', eth_call: '0x' + balance.toString(16) })[m];
  const cdp = { evm: { getAccount: async () => ({ address: accountAddress }), signTypedData: async (a) => { if (signFails) throw Error('cdp down'); signs++; assert.equal(a.address, SOURCE); typed = a.typedData; return { signature: SIG }; } } };
  const fetchFn = async (url, init) => { fetches++; seen = { url, init }; if (fetchThrows) throw Error('network'); return { status: reply.status, json: async () => reply.json }; };
  const run = (body = { action: 'x402_pagar_leitura', request_id: id }) => pagarLeitura(body, { cdp, chainRpc, recoverTypedDataAddress: async () => recovered, fetchFn, now: () => NOW });

  // pedido mal formado ou cadeia errada: nada é assinado nem enviado
  for (const bad of [undefined, null, 'x', 'not-a-uuid', '12345678-1234-1234-1234-123456789abc'.toUpperCase(), '']) assert.equal((await run({ request_id: bad })).status, 400, 'request_id aceite: ' + bad);
  wrongChain = true; assert.equal((await run()).error, 'wrong_chain'); wrongChain = false;
  accountAddress = '0x' + '9'.repeat(40); assert.equal((await run()).error, 'source_mismatch'); accountAddress = SOURCE;
  balance = 9999n; const poor = await run(); assert.equal(poor.error, 'insufficient_operational_funds'); assert.equal(poor.signed, false); balance = 10_000_000n;
  assert.equal(signs + fetches, 0, 'assinou ou apresentou com pedido inválido');
  // o caminho bom
  const ok = await run();
  assert.equal(ok.status, 200); assert.equal(ok.ok, true); assert.equal(ok.delivered, true); assert.equal(ok.tx_hash, HASH); assert.equal(ok.internal_transfer, true); assert.equal(ok.payer_is_payee, true);
  assert.equal(ok.amount_atomic, '10000'); assert.equal(ok.signature_returned, false); assert.equal(ok.leitura_resumo.valium.valium, '1.5'); assert.equal(ok.leitura_resumo.fundacao.saldo_confirmado_sats, 10072);
  assert.equal(signs, 1); assert.equal(fetches, 1);
  assert.ok(!JSON.stringify(ok).includes(SIG), 'a assinatura foi devolvida ao chamador');
  // o que foi assinado: origem e destino são a operacional, 10 000 átomos, modelo USDC da Base, nonce derivado do pedido, 10 minutos
  assert.equal(typed.primaryType, 'TransferWithAuthorization'); assert.equal(typed.domain.verifyingContract, TOKEN); assert.equal(typed.domain.chainId, 8453); assert.equal(typed.domain.name, 'USD Coin'); assert.equal(typed.domain.version, '2');
  assert.equal(typed.message.from, SOURCE); assert.equal(typed.message.to, SOURCE); assert.equal(typed.message.value, '10000'); assert.equal(typed.message.validAfter, '0');
  assert.equal(typed.message.nonce, await authorizationNonce('x402-leitura:' + id));
  assert.notEqual(typed.message.nonce, await authorizationNonce(id), 'o nonce colide com o da via sem gás');
  assert.notEqual(typed.message.nonce, await authorizationNonce('x402-leitura:cc153211-4c87-47b7-8516-3256d6b70002'));
  assert.equal(Number(typed.message.validBefore), NOW / 1000 + 600);
  // o que foi apresentado: GET ao URL fixo, com X-PAYMENT igual ao que foi assinado
  assert.equal(seen.url, 'https://ora-x402-gateway.vercel.app/leitura'); assert.equal(seen.init.method, 'GET');
  const sent = JSON.parse(Buffer.from(seen.init.headers['X-PAYMENT'], 'base64').toString());
  assert.equal(sent.x402Version, 2); assert.equal(sent.network, 'eip155:8453'); assert.equal(sent.accepted.amount, '10000'); assert.equal(sent.accepted.payTo, SOURCE); assert.equal(sent.accepted.asset, TOKEN);
  assert.deepEqual(sent.payload.authorization, typed.message); assert.equal(sent.payload.signature, SIG);
  // o corpo do pedido não muda nada: valor, destino e URL não são parâmetros
  reset(); await run({ action: 'x402_pagar_leitura', request_id: id, amount_atomic: '99999999', to: '0x' + '2'.repeat(40), url: 'https://exemplo.invalid' });
  assert.equal(typed.message.value, '10000'); assert.equal(typed.message.to, SOURCE); assert.equal(seen.url, 'https://ora-x402-gateway.vercel.app/leitura');
  // assinatura que não recupera para a operacional: pára antes de apresentar
  reset(); recovered = '0x' + '8'.repeat(40); assert.equal((await run()).error, 'signature_identity_mismatch'); assert.equal(fetches, 0);
  // CDP em baixo: nada apresentado
  reset(); signFails = true; const cf = await run(); assert.equal(cf.error, 'cdp_sign_failed'); assert.equal(cf.signed, false); assert.equal(fetches, 0);
  // gateway recusa: não há entrega, nem tx, e diz porquê
  reset(); reply = { status: 402, json: { x402Version: 2, erro: 'facilitador recusou a autorizacao', detalhe: 'invalid_exact_evm_payload' } };
  const refused = await run(); assert.equal(refused.ok, false); assert.equal(refused.delivered, false); assert.equal(refused.tx_hash, null); assert.equal(refused.gateway_http_status, 402); assert.match(refused.gateway_error, /facilitador/); assert.equal(refused.leitura_resumo, null);
  // 200 sem leitura ou sem tx_hash nunca conta como entrega
  for (const json of [{ acesso: 'concedido', tier: 'leitura', tx_hash: HASH }, { acesso: 'concedido', tier: 'oraculo', tx_hash: HASH, leitura: {} }, { acesso: 'concedido', tier: 'leitura', tx_hash: '0x12', leitura: {} }, null]) {
    reset(); reply = { status: 200, json }; const r = await run(); assert.equal(r.delivered, false, 'entrega falsa aceite: ' + JSON.stringify(json)); assert.equal(r.ok, false);
  }
  // um corpo que parece entrega mas com estado HTTP que não é 200 nunca conta
  for (const status of [402, 500, 201]) { reset(); reply = { status, json: { acesso: 'concedido', tier: 'leitura', tx_hash: HASH, leitura: { valium_na_sagrada: {}, fundacao_btc: {} } } }; const r = await run(); assert.equal(r.delivered, false, 'estado HTTP ' + status + ' contado como entrega'); }
  // gateway fora: resultado desconhecido até se observar a cadeia, e a assinatura não sai
  reset(); fetchThrows = true; const down = await run(); assert.equal(down.error, 'gateway_unreachable'); assert.equal(down.status, 502); assert.notEqual(down.ok, true); assert.equal(down.outcome, 'unknown_until_observed'); assert.equal(down.signature_returned, false); assert.ok(!JSON.stringify(down).includes(SIG));
}

// A suite tem de passar no código real.
await suite(realLeitura);
console.log('PASS: suite da acção x402_pagar_leitura no código real.');

// A superfície: só request_id, sem destinos nem valores, e o despacho do núcleo.
{
  const calls = [];
  const rpc = async (name) => { if (name === 'ora_operational_wallet_auth_v1') return true; if (name === 'orum_cdp_keys') return [{ key_id: 'k', key_secret: 's' }]; if (name === 'orum_cdp_wallet_secret') return [{ wallet_secret: 'w' }]; throw Error('rpc inesperado ' + name); };
  const makeClient = () => ({ evm: { getAccount: async () => ({ address: SOURCE }), signTypedData: async () => { calls.push('sign'); return { signature: SIG }; } } });
  const h = handler({ rpc, makeClient, chainRpc: async (m) => ({ eth_chainId: '0x2105', eth_call: '0x' + (1_000_000n).toString(16) })[m], recoverTypedDataAddress: async () => SOURCE, bitcoinAction: async () => ({ status: 500 }), bitcoinNet: {} });
  const req = (body, auth = 'Bearer ' + 'a'.repeat(64)) => new Request('https://x/', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  for (const extra of [{ amount_atomic: '1' }, { to: '0x' + '2'.repeat(40) }, { url: 'https://x.invalid' }, { destination: SOURCE }]) assert.equal((await h(req({ action: 'x402_pagar_leitura', request_id: id, ...extra }))).status, 400, 'campo extra aceite: ' + Object.keys(extra));
  assert.equal((await h(req({ action: 'x402_pagar_leitura' }))).status, 400);
  assert.equal((await h(req({ action: 'x402_pagar_leitura', request_id: id }, 'Bearer nada'))).status, 401);
  assert.equal(calls.length, 0, 'assinou com pedido inválido ou sem autorização');
  console.log('PASS: o núcleo só aceita request_id, recusa campos extra e exige autorização.');
}

// A fonte da acção: sem endereços escritos à mão, sem envio de transacção, e só body.request_id lido do chamador.
{
  const src = fs.readFileSync(path.join(dir, 'leitura.mjs'), 'utf8');
  assert.ok(!/0x[0-9a-fA-F]{40}\b/.test(src), 'endereço literal em leitura.mjs');
  assert.ok(!/sendTransaction/.test(src), 'leitura.mjs envia transacções');
  assert.deepEqual([...new Set(src.match(/body\.[a-z_]+/g))], ['body.request_id']);
  assert.equal(realLeitura.PRECO_ATOMIC, '10000'); assert.equal(realLeitura.URL_LEITURA, 'https://ora-x402-gateway.vercel.app/leitura'); assert.equal(realLeitura.exigencias().payTo, SOURCE);
  console.log('PASS: leitura.mjs não tem endereços literais, não envia transacções e só lê body.request_id.');
}

// Estragos propositados.
const src = fs.readFileSync(path.join(dir, 'leitura.mjs'), 'utf8');
const damages = [
  ['destino mudado na mensagem assinada', "to: SOURCE, value: PRECO_ATOMIC", "to: '0x' + '11'.repeat(20), value: PRECO_ATOMIC"],
  ['valor mudado na mensagem assinada', "value: PRECO_ATOMIC, validAfter", "value: '1000000', validAfter"],
  ['verificação do signatário removida', "if (recovered.toLowerCase() !== SOURCE.toLowerCase())", "if (false)"],
  ['verificação da conta removida', "if (account.address.toLowerCase() !== SOURCE.toLowerCase())", "if (false)"],
  ['verificação do saldo removida', "if (balance < BigInt(PRECO_ATOMIC))", "if (false)"],
  ['verificação da cadeia removida', "if (await chainRpc('eth_chainId', []) !== '0x2105')", "if (false)"],
  ['nonce aleatório em vez de derivado do pedido', "nonce: await authorizationNonce('x402-leitura:' + id)", "nonce: '0x' + 'ab'.repeat(32)"],
  ['nonce igual ao da via sem gás', "nonce: await authorizationNonce('x402-leitura:' + id)", "nonce: await authorizationNonce(id)"],
  ['validade de um dia', "export const VALID_FOR_SECONDS = 600;", "export const VALID_FOR_SECONDS = 86400;"],
  ['URL de outro domínio', "'https://ora-x402-gateway.vercel.app/leitura';", "'https://exemplo.invalid/leitura';"],
  ['entrega aceite com qualquer estado HTTP', "r.status === 200 && j && j.acesso", "j && j.acesso"],
  ['entrega aceite sem tx_hash válido', "&& /^0x[0-9a-fA-F]{64}$/.test(String(j.tx_hash || '')) && j.leitura", "&& j.leitura"],
  ['assinatura devolvida ao chamador', "leitura_resumo: resumo,", "leitura_resumo: resumo, assinatura: signature,"],
  ['falha do CDP engolida', "catch { return { status: 502, error: 'cdp_sign_failed', signed: false, submitted: false }; }", "catch { signature = SIG_FALSA; }"],
  ['gateway fora tratado como sucesso', "return { status: 502, error: 'gateway_unreachable',", "return { status: 200, error: 'gateway_unreachable',"],
  ['pedido aceita o valor do chamador', "value: PRECO_ATOMIC, validAfter", "value: String(body.amount_atomic || PRECO_ATOMIC), validAfter"],
];
let caught = 0;
for (const [name, from, to] of damages) {
  assert.ok(src.includes(from), 'alvo do estrago não encontrado: ' + name);
  const f = path.join(dir, `leitura.mutant-${Date.now()}-${caught}.mjs`);
  fs.writeFileSync(f, src.replace(from, to).replace("signature = SIG_FALSA", "signature = '0x' + '22'.repeat(65)"));
  try { const mod = await import(pathToFileURL(f).href); await assert.rejects(() => suite(mod), undefined, 'estrago não apanhado: ' + name); caught++; }
  finally { fs.rmSync(f, { force: true }); }
}
assert.equal(caught, damages.length);
console.log(`PASS: ${caught} estragos propositados apanhados.`);

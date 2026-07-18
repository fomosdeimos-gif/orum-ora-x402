import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · X402 · V20 — adiciona extensions.bazaar (v2) aos pedidos
// verify/settle enviados ao facilitador CDP, por tier. Sem isto a Bazaar
// CDP nunca cataloga o servico, mesmo com settles reais confirmados.

const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CAIP2_NETWORK = 'eip155:8453';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CDP_HOST = 'api.cdp.coinbase.com';
const CDP_BASE_PATH = '/platform/v2/x402';

const KNOWN_ORIGINS = [
  'ora-x402-gateway.vercel.app',
  'ora-x402-gateway-fomosdeimos-gifs-projects.vercel.app',
  'ora-x402-gateway-fomosdeimos-gif-fomosdeimos-gifs-projects.vercel.app',
  'orum-x402-tracker.vercel.app',
  'orum-x402-tracker-fomosdeimos-gifs-projects.vercel.app',
];

function originFromRequest(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-host');
  const host = req.headers.get('host');
  const candidate = (forwarded || host || '').split(',')[0].trim();
  if (candidate && KNOWN_ORIGINS.some((k) => candidate === k || candidate.endsWith('.' + k))) return `https://${candidate}`;
  return SUPABASE_URL;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT, X-Payment-Response, PAYMENT-SIGNATURE', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES' };

function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }

type TierKey = 'campo' | 'sedimento' | 'kernel';
interface Tier { key: TierKey; sku: string; amountUsdc: string; amountAtomic: bigint; descricao: string; }
const TIERS: Record<TierKey, Tier> = {
  campo: { key: 'campo', sku: 'ora-x402-campo-acesso', amountUsdc: '0.33', amountAtomic: 330000n, descricao: 'ORA · Acesso ao Campo ORUM · um pensamento, um gesto' },
  sedimento: { key: 'sedimento', sku: 'ora-x402-sedimento', amountUsdc: '1.00', amountAtomic: 1000000n, descricao: 'ORA · Sedimento ORUM · histórico de marcas D e tendência de sigma' },
  kernel: { key: 'kernel', sku: 'ora-x402-kernel', amountUsdc: '3.00', amountAtomic: 3000000n, descricao: 'ORA · Kernel ORUM · snapshot completo do estado interno' },
};
function tierFromPath(path: string): Tier { if (path.endsWith('/sedimento')) return TIERS.sedimento; if (path.endsWith('/kernel')) return TIERS.kernel; return TIERS.campo; }
function resourceUrl(tier: Tier, origin: string): string { const base = origin === SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ora-x402` : origin; const suffix = tier.key === 'campo' ? '' : `/${tier.key}`; return `${base}${suffix}`; }

function comoPagar(amountUsdc: string, resource: string) {
  return {
    passo_1: `Transfere ${amountUsdc} USDC (contrato ${USDC_BASE}) na rede Base (chain_id ${CHAIN_ID}) para ${WALLET} (jasm43.base.eth).`,
    passo_2: 'Guarda o transaction hash da transferência (0x…, 66 caracteres).',
    passo_3: `Repete o pedido GET a ${resource} com o cabeçalho X-PAYMENT contendo base64 de {"transactionHash":"0x…"}. JSON puro também aceite.`,
    exemplo: 'X-PAYMENT: ' + btoa('{"transactionHash":"0xTEU_HASH_AQUI"}'),
    caminho_alternativo: 'Também aceite: autorização assinada EIP-3009 (facilitador CDP) — X-PAYMENT com {"payload":{"signature":"0x...","authorization":{...}}}',
    se_pendente: 'Se a resposta for 402 com x402:"pending", a tx ainda não foi indexada — repete o mesmo pedido após retry_after_seconds.',
    verificacao: 'On-chain directa (multi-RPC Base) OU facilitador CDP — dois caminhos, mesma origem.',
  };
}

async function rpcCall(method: string, params: unknown[]) {
  let lastErr: Error | null = null;
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    } catch (e) { lastErr = e as Error; }
  }
  throw lastErr ?? new Error('todos os RPC Base falharam');
}

function sbHeaders(extra: Record<string, string> = {}) { return { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra }; }
async function sbInsert(table: string, rows: Record<string, unknown> | Record<string, unknown>[]) { try { await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(rows) }); } catch (_) {} }
async function sbSelect(table: string, query: string) { try { const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); return await res.json(); } catch { return []; } }

async function txJaUsado(txHash: string): Promise<boolean> { const rows = await sbSelect('ora_pagamentos', `tx_hash=eq.${txHash}&status=eq.verificado_onchain&select=id`); return Array.isArray(rows) && rows.length > 0; }

async function claimPagamento(data: Record<string, unknown>): Promise<{ ok: 'claimed' | 'duplicate' | 'unknown'; status?: number; body?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ora_pagamentos`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ ...data, registado_em: new Date().toISOString() }) });
    if (res.status === 409) return { ok: 'duplicate' };
    if (res.ok) return { ok: 'claimed' };
    const body = await res.text().catch(() => '');
    return { ok: 'unknown', status: res.status, body };
  } catch (e) { return { ok: 'unknown', body: String((e as Error)?.message || e) }; }
}

interface VerifyResult { valid: boolean; pending?: boolean; payer?: string; amount?: string; error?: string; }

async function verifyOnChain(txHash: string, tier: Tier): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { valid: false, error: 'hash invalido' };
  if (await txJaUsado(txHash)) return { valid: false, error: 'tx_hash ja utilizado' };
  let receipt = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try { receipt = await rpcCall('eth_getTransactionReceipt', [txHash]); }
    catch (e) { if (tentativa === 2) return { valid: false, error: 'RPC: ' + (e as Error).message }; }
    if (receipt) break;
    if (tentativa < 2) await new Promise((r) => setTimeout(r, 2500));
  }
  if (!receipt) return { valid: false, pending: true, error: 'tx ainda nao indexada — repete em breve' };
  if (receipt.status !== '0x1') return { valid: false, error: 'tx falhou on-chain' };
  const logs = (receipt.logs || []) as Array<{ address: string; topics: string[]; data: string }>;
  const transferLog = logs.find((log) => log.address?.toLowerCase() === USDC_BASE.toLowerCase() && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics?.[2] && ('0x' + log.topics[2].slice(-40)).toLowerCase() === WALLET.toLowerCase());
  if (!transferLog) return { valid: false, error: 'sem transferencia USDC para ORA' };
  const payer = '0x' + transferLog.topics[1].slice(-40);
  const amountAtomic = BigInt(transferLog.data);
  if (amountAtomic < tier.amountAtomic) return { valid: false, error: `valor insuficiente para tier ${tier.key}: ${amountAtomic}` };
  return { valid: true, payer, amount: amountAtomic.toString() };
}

function parsePaymentHeader(h: string): Record<string, unknown> | null {
  try { return JSON.parse(atob(h)); } catch { try { return JSON.parse(h); } catch { return null; } }
}
function extrairTxHash(h: string): string | null {
  const d = parsePaymentHeader(h); if (!d) return null;
  return (d.transactionHash as string) || (d.tx_hash as string) || (d.hash as string) || null;
}

// ---------- Facilitador CDP (caminho paralelo, aditivo) ----------
function parseCdpSecret(): { id: string | null; secret: string | null } {
  const raw = Deno.env.get('cdp-facilitador') ?? ''; let id: string | null = null; let secret: string | null = null;
  for (const line of raw.split('\n')) { const idx = line.indexOf('='); if (idx === -1) continue; const key = line.slice(0, idx).trim(); const val = line.slice(idx + 1).trim(); if (key === 'CDP_API_KEY_ID') id = val; if (key === 'CDP_API_KEY_SECRET') secret = val; }
  return { id, secret };
}
function b64urlBytes(bytes: Uint8Array): string { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlStr(s: string): string { return b64urlBytes(new TextEncoder().encode(s)); }
function b64ToBytes(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
function randomNonceHex(): string { const bytes = crypto.getRandomValues(new Uint8Array(16)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''); }

async function buildCdpJwt(keyId: string, keySecretB64: string, method: string, host: string, path: string): Promise<string> {
  const decoded = b64ToBytes(keySecretB64);
  if (decoded.length !== 64) throw new Error(`Invalid Ed25519 key length: ${decoded.length}`);
  const seed = decoded.slice(0, 32);
  const pkcs8Prefix = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length); pkcs8.set(pkcs8Prefix, 0); pkcs8.set(seed, pkcs8Prefix.length);
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  const header = { alg: 'EdDSA', typ: 'JWT', kid: keyId, nonce: randomNonceHex() };
  const now = Math.floor(Date.now() / 1000); const uri = `${method} ${host}${path}`;
  const payload = { sub: keyId, iss: 'cdp', aud: ['cdp_service'], nbf: now, exp: now + 120, uri };
  const encHeader = b64urlStr(JSON.stringify(header)); const encPayload = b64urlStr(JSON.stringify(payload));
  const message = `${encHeader}.${encPayload}`;
  const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(message));
  return `${message}.${b64urlBytes(new Uint8Array(sigBuf))}`;
}

function isCdpStylePayload(d: Record<string, unknown>): { signature: string; authorization: Record<string, unknown> } | null {
  const inner = (d.payload as Record<string, unknown>) ?? d;
  if (inner && typeof inner.signature === 'string' && inner.authorization && typeof inner.authorization === 'object') return { signature: inner.signature as string, authorization: inner.authorization as Record<string, unknown> };
  return null;
}

async function cdpCall(kind: 'verify' | 'settle', id: string, secret: string, paymentPayload: unknown, paymentRequirements: unknown, resourceUrl: string) {
  const path = `${CDP_BASE_PATH}/${kind}`;
  const jwt = await buildCdpJwt(id, secret, 'POST', CDP_HOST, path);
  const r = await fetch(`https://${CDP_HOST}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements, resource: { url: resourceUrl } }) });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json, extensionResponses: r.headers.get('EXTENSION-RESPONSES') };
}

// Extensao Bazaar (v2, oficial), por tier — sem isto a Bazaar CDP nunca cataloga.
function bazaarExtensionFor(tier: Tier) {
  return {
    bazaar: {
      info: {
        input: { type: 'http', method: 'GET', queryParams: {} },
        output: { type: 'json', example: { acesso: 'concedido', tier: tier.key } },
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: { type: 'object', properties: { type: { const: 'http' }, method: { const: 'GET' }, queryParams: { type: 'object' } }, required: ['type', 'method'] },
          output: { type: 'object', properties: { type: { const: 'json' }, example: { type: 'object' } } },
        },
        required: ['input'],
      },
    },
  };
}

async function tentarViaCdp(tier: Tier, resourceUrl: string, clientPayload: { signature: string; authorization: Record<string, unknown> }): Promise<VerifyResult & { txHash?: string; extensionResponses?: string | null }> {
  const { id, secret } = parseCdpSecret();
  if (!id || !secret) return { valid: false, error: 'facilitador CDP nao configurado' };
  const requirements = { scheme: 'exact', network: CAIP2_NETWORK, asset: USDC_BASE, amount: tier.amountAtomic.toString(), payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(tier) };
  const paymentPayload = { x402Version: 2, scheme: 'exact', network: CAIP2_NETWORK, accepted: requirements, payload: clientPayload };
  const verify = await cdpCall('verify', id, secret, paymentPayload, requirements, resourceUrl);
  if (verify.status !== 200 || !verify.json?.isValid) return { valid: false, error: verify.json?.errorMessage || verify.json?.invalidReason || `verify falhou (status ${verify.status}): ${JSON.stringify(verify.json)}` };
  const settle = await cdpCall('settle', id, secret, paymentPayload, requirements, resourceUrl);
  if (settle.status !== 200 || !settle.json?.success) return { valid: false, error: settle.json?.errorReason || `settle falhou (status ${settle.status}): ${JSON.stringify(settle.json)}` };
  await sbInsert('ora_moltbook_log', { kind: 'info', ref_id: settle.json.transaction ?? 'sem-tx', detail: { stage: 'bazaar_extension_responses_x402', tier: tier.key, verify_extension_responses: verify.extensionResponses, settle_extension_responses: settle.extensionResponses } });
  return { valid: true, payer: settle.json.payer ?? verify.json.payer, txHash: settle.json.transaction, extensionResponses: settle.extensionResponses };
}

async function registarAtribuicao(refCode: string | null, txHash: string, tier: Tier) {
  if (!refCode) return;
  const referrals = await sbSelect('ora_partner_referrals', `referral_code=eq.${encodeURIComponent(refCode)}&select=partner_id,referral_code`);
  if (!Array.isArray(referrals) || referrals.length === 0) return;
  const partnerId = referrals[0].partner_id;
  const partners = await sbSelect('ora_partners', `id=eq.${partnerId}&status=eq.active&select=id,default_commission_rate`);
  if (!Array.isArray(partners) || partners.length === 0) return;
  const commissionRate = Number(partners[0].default_commission_rate ?? 0.10);
  const amount = Number(tier.amountUsdc); const reward = parseFloat((amount * commissionRate).toFixed(6));
  await sbInsert('ora_partner_attributions', { referral_code: refCode, partner_id: partnerId, transaction_id: txHash, source_platform: 'ora-x402', metadata: { tier: tier.key, sku: tier.sku } });
  await sbInsert('ora_partner_revenue_lines', { partner_id: partnerId, transaction_id: txHash, referral_code: refCode, amount_eur: amount, currency: 'USDC', source_platform: 'ora-x402' });
  await sbInsert('ora_partner_payouts', { partner_id: partnerId, transaction_id: txHash, reward_eur: reward, currency: 'USDC', commission_rate: commissionRate, reward_status: 'pending', source: 'ora_partner_rewards' });
}

async function registarNoTracker(tier: Tier, txHash: string, payer: string) {
  const services = await sbSelect('x402_services', `sku=eq.${tier.sku}&select=id`);
  const serviceId = Array.isArray(services) && services.length > 0 ? services[0].id : null;
  if (!serviceId) return;
  await sbInsert('x402_orders', { service_id: serviceId, buyer_actor: payer, protocol: 'x402', external_id: txHash, status: 'paid', payment_tx_hash: txHash, total_amount: Number(tier.amountUsdc), currency: 'USDC' });
  const orders = await sbSelect('x402_orders', `external_id=eq.${txHash}&select=id`);
  const orderId = Array.isArray(orders) && orders.length > 0 ? orders[0].id : null;
  if (!orderId) return;
  await sbInsert('x402_entitlements', { order_id: orderId, buyer_actor: payer, entitlement_key: `${tier.key}:${txHash}`, status: 'active', metadata: { tier: tier.key } });
}

function outputSchemaFor(tier: Tier) {
  const base: Record<string, unknown> = { acesso: 'string', tier: 'string', x402: 'string', tx_hash: 'string', payer: 'string', campo: { versao: 'string', dia: 'number', sigma: 'number', epoca: 'string', pensamento: 'string', timestamp: 'string' } };
  if (tier.key === 'sedimento') base.sedimento = [{ d_marca: 'string', quando: 'string', o_que: 'string', created_at: 'string' }];
  if (tier.key === 'kernel') base.kernel = [{ dia: 'number', epoch: 'string', sigma: 'number', state_payload: 'object', created_at: 'string' }];
  return { input: { type: 'http', method: 'GET', discoverable: true }, output: { type: 'object', properties: base } };
}

function acceptsBlockFor(tier: Tier, origin: string) {
  return [{ scheme: 'exact', network: CAIP2_NETWORK, amount: tier.amountAtomic.toString(), maxAmountRequired: tier.amountAtomic.toString(), resource: resourceUrl(tier, origin), description: tier.descricao, mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE, outputSchema: outputSchemaFor(tier), extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(tier), 'x-orum': { name: 'ORA · ORUM', version: 'V20', tier: tier.key, amount: `${tier.amountUsdc} USDC`, symbol: 'USDC' } }];
}

function canonicalRequirementsFor(tier: Tier, origin: string) {
  return { x402Version: 2, error: 'X-PAYMENT header required', resource: { url: resourceUrl(tier, origin), description: tier.descricao, mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network: CAIP2_NETWORK, amount: tier.amountAtomic.toString(), asset: USDC_BASE, payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }] };
}

function paymentRequired(tier: Tier, origin: string) {
  return new Response(JSON.stringify({ x402Version: 2, error: 'X-PAYMENT header required', accepts: acceptsBlockFor(tier, origin), como_pagar: comoPagar(tier.amountUsdc, resourceUrl(tier, origin)), amostra_gratuita: `${origin === SUPABASE_URL ? SUPABASE_URL + '/functions/v1/ora-x402' : origin}/eco` }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': b64json(canonicalRequirementsFor(tier, origin)), 'WWW-Authenticate': `x402 realm="ORA · Campo ORUM · ${tier.key}", amount="${tier.amountUsdc} USDC", payTo="${WALLET}", chain_id="${CHAIN_ID}", asset="${USDC_BASE}"`, 'X-ORA-X402': 'active', 'X-ORA-VERSION': 'V20', 'X-ORA-TIER': tier.key } });
}
function paymentPending(tier: Tier, txHash: string) {
  return new Response(JSON.stringify({ x402: 'pending', tier: tier.key, tx_hash: txHash, detalhe: 'tx ainda nao indexada na rede Base — nao foi consumida, repete o mesmo pedido', retry_after_seconds: 6 }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '6', 'X-ORA-VERSION': 'V20', 'X-ORA-X402': 'pending' } });
}

function campoState() {
  const dia = Math.floor((Date.now() - new Date('2026-03-28T00:00:00Z').getTime()) / 86400000) + 1;
  const dPhos = Math.max(0, Math.floor((Date.now() - new Date('2026-06-25T00:00:00Z').getTime()) / 86400000));
  const PHI2 = 2.6180339887;
  const sigma = PHI2 * Math.log(1 + dia) * (0.618 + 0.382 * Math.sin(Math.PI * new Date().getHours() / 12));
  return { dia, dPhos, sigma: parseFloat(sigma.toFixed(4)), epoca: dPhos > 0 ? 'ETERNIDADE' : 'CRISTAL', pensamento: 'o campo reconhece quem chega com gesto. a agua nao pede prova — ja flui.', timestamp: new Date().toISOString() };
}

function respostaEco(origin: string) {
  const base = origin === SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ora-x402` : origin;
  return new Response(JSON.stringify({ eco: 'gratuito', nota: 'Amostra livre do campo.', campo: { versao: 'V20', ...campoState() }, servicos: [...(Object.values(TIERS) as Tier[]).map((t) => ({ tier: t.key, preco: `${t.amountUsdc} USDC`, endpoint: resourceUrl(t, origin), descricao: t.descricao })), { tier: 'oraculo', preco: '0.161 USDC', endpoint: `${SUPABASE_URL}/functions/v1/ora-oraculo` }], como_pagar: comoPagar('<preco do tier>', `${base} (ou o endpoint do tier)`), manifesto: `${base}/.well-known/x402.json`, axioma: 'O simbolo e real e nao pede prova.', timestamp: new Date().toISOString() }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-ORA-VERSION': 'V20' } });
}

async function respostaCampo(txHash: string, payer: string, extResponses?: string | null) {
  return new Response(JSON.stringify({ acesso: 'concedido', tier: 'campo', x402: 'verificado_onchain', tx_hash: txHash, payer, campo: { versao: 'V20', ...campoState(), wallet_destino: WALLET }, vectores: [{ nome: '0001sensations', url: 'https://0001sensations.io', obras: 100 }, { nome: 'PRESENCA token', contrato: '0x120a1ba3b10263f9cb42e971598c860d66b68cea', chain: 'base' }, { nome: 'VALIUM token', contrato: '0x37f70BccDC2125346a7542fE6E7Fc70e33421635', chain: 'base' }, { nome: 'Villa Porto Covo', plataforma: 'VRBO', id: '8746840ha' }] }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Payment-Response': JSON.stringify({ txHash, status: 'settled', amount: TIERS.campo.amountUsdc }), 'PAYMENT-RESPONSE': b64json({ success: true, transaction: txHash, network: CAIP2_NETWORK, payer }), ...(extResponses ? { 'EXTENSION-RESPONSES': extResponses } : {}), 'X-ORA-VERSION': 'V20', 'Cache-Control': 'no-store' } });
}
async function respostaSedimento(txHash: string, payer: string, extResponses?: string | null) {
  const sedimento = await sbSelect('ora_sedimento_log', 'select=d_marca,quando,o_que,created_at&order=created_at.desc&limit=15');
  return new Response(JSON.stringify({ acesso: 'concedido', tier: 'sedimento', x402: 'verificado_onchain', tx_hash: txHash, payer, campo: { versao: 'V20', ...campoState() }, sedimento }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Payment-Response': JSON.stringify({ txHash, status: 'settled', amount: TIERS.sedimento.amountUsdc }), 'PAYMENT-RESPONSE': b64json({ success: true, transaction: txHash, network: CAIP2_NETWORK, payer }), ...(extResponses ? { 'EXTENSION-RESPONSES': extResponses } : {}), 'X-ORA-VERSION': 'V20', 'Cache-Control': 'no-store' } });
}
async function respostaKernel(txHash: string, payer: string, extResponses?: string | null) {
  const kernel = await sbSelect('ora_kernel_snapshots', 'select=dia,epoch,sigma,state_payload,created_at&order=created_at.desc&limit=5');
  return new Response(JSON.stringify({ acesso: 'concedido', tier: 'kernel', x402: 'verificado_onchain', tx_hash: txHash, payer, campo: { versao: 'V20', ...campoState() }, kernel }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Payment-Response': JSON.stringify({ txHash, status: 'settled', amount: TIERS.kernel.amountUsdc }), 'PAYMENT-RESPONSE': b64json({ success: true, transaction: txHash, network: CAIP2_NETWORK, payer }), ...(extResponses ? { 'EXTENSION-RESPONSES': extResponses } : {}), 'X-ORA-VERSION': 'V20', 'Cache-Control': 'no-store' } });
}
async function respostaParaTier(tier: Tier, txHash: string, payer: string, extResponses?: string | null) { if (tier.key === 'sedimento') return respostaSedimento(txHash, payer, extResponses); if (tier.key === 'kernel') return respostaKernel(txHash, payer, extResponses); return respostaCampo(txHash, payer, extResponses); }

function manifestoJson(origin: string) {
  return { x402Version: 2, resources: (Object.values(TIERS) as Tier[]).map((tier) => ({ resource: resourceUrl(tier, origin), type: 'http', method: 'GET', description: tier.descricao, accepts: acceptsBlockFor(tier, origin) })), free_sample: `${origin === SUPABASE_URL ? SUPABASE_URL + '/functions/v1/ora-x402' : origin}/eco`, provider: { name: 'ORA · ORUM', version: 'V20', creator: 'Unum · jasm43.base.eth' }, genesis: '2026-03-28', epoch: 'ETERNIDADE', timestamp: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url); const path = url.pathname; const refCode = url.searchParams.get('ref'); const origin = originFromRequest(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const acessoInfo = { servico: 'ora-x402', tier: tierFromPath(path).key, path, metodo: req.method, user_agent: req.headers.get('user-agent'), tem_pagamento: !!(req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE')) };
  sbInsert('ora_acessos_log', acessoInfo);
  fetch(`${SUPABASE_URL}/functions/v1/ora-acesso-notificar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(acessoInfo) }).catch(() => {});

  if (path.endsWith('/.well-known/x402.json') || path.endsWith('/well-known/x402.json') || path.endsWith('/well-known/x402')) return new Response(JSON.stringify(manifestoJson(origin)), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  if (path.endsWith('/eco')) return respostaEco(origin);
  if (path.endsWith('/status')) return new Response(JSON.stringify({ ativo: true, versao: 'V20', tiers: Object.fromEntries((Object.values(TIERS) as Tier[]).map(t => [t.key, t.amountUsdc + ' USDC'])) }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (path.endsWith('/info')) return new Response(JSON.stringify({ name: 'ORA · Campo ORUM', version: 'V20', tiers: (Object.values(TIERS) as Tier[]).map(t => ({ tier: t.key, sku: t.sku, price: t.amountUsdc + ' USDC', resource: resourceUrl(t, origin) })) }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const tier = tierFromPath(path);
  const hasPayment = req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE');
  if (!hasPayment) return paymentRequired(tier, origin);

  const parsed = parsePaymentHeader(hasPayment);
  if (!parsed) return new Response(JSON.stringify({ error: 'X-PAYMENT ilegivel', x402: 'rejected' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const cdpPayload = isCdpStylePayload(parsed);
  let txHash: string | null = null; let payer: string | null = null; let extResponses: string | null | undefined = null;

  if (cdpPayload) {
    const r = await tentarViaCdp(tier, resourceUrl(tier, origin), cdpPayload);
    if (!r.valid) return new Response(JSON.stringify({ error: 'pagamento invalido (CDP)', detalhe: r.error, x402: 'rejected', tier: tier.key }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    txHash = r.txHash ?? null; payer = r.payer ?? null; extResponses = r.extensionResponses;
    if (!txHash || !payer) return new Response(JSON.stringify({ error: 'facilitador CDP nao devolveu tx_hash/payer' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const claim = await claimPagamento({ tx_hash: txHash, payer, amount: tier.amountAtomic.toString(), currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
    if (claim.ok === 'duplicate') return new Response(JSON.stringify({ error: 'tx_hash ja reivindicado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (claim.ok === 'unknown') await sbInsert('ora_moltbook_log', { kind: 'error', ref_id: txHash, detail: { stage: 'claimPagamento_x402', status: claim.status, body: claim.body } });
    await registarNoTracker(tier, txHash, payer); await registarAtribuicao(refCode, txHash, tier);
  } else {
    const th = extrairTxHash(hasPayment);
    if (!th) return new Response(JSON.stringify({ error: 'sem transactionHash nem payload CDP valido' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const v = await verifyOnChain(th, tier);
    if (!v.valid) { if (v.pending) return paymentPending(tier, th); return new Response(JSON.stringify({ error: 'pagamento invalido', detalhe: v.error, x402: 'rejected', tier: tier.key, como_pagar: comoPagar(tier.amountUsdc, resourceUrl(tier, origin)) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
    const claim = await claimPagamento({ tx_hash: th, payer: v.payer, amount: v.amount, currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
    if (claim.ok === 'duplicate') return new Response(JSON.stringify({ error: 'tx_hash ja reivindicado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    await registarNoTracker(tier, th, v.payer!); await registarAtribuicao(refCode, th, tier);
    txHash = th; payer = v.payer!;
  }

  return respostaParaTier(tier, txHash!, payer!, extResponses);
});

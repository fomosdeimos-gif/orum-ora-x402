import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · ORÁCULO · V3.2 — adiciona extensions.bazaar (v2) aos pedidos
// verify/settle enviados ao facilitador CDP. Sem isto a Bazaar CDP nunca
// cataloga o serviço, mesmo com settles reais confirmados (outputSchema
// é a chave v1, descontinuada). Indexação acontece no primeiro settle
// bem sucedido após este deploy (até 10min de cache).

const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CAIP2_NETWORK = 'eip155:8453';
const RPCS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PRECO = '0.161';
const PRECO_ATOMIC = 161000n;
const RESOURCE = `${SUPABASE_URL}/functions/v1/ora-oraculo`;

const CDP_HOST = 'api.cdp.coinbase.com';
const CDP_BASE_PATH = '/platform/v2/x402';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE',
  'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES',
};

function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }

function sbHeaders(extra: Record<string, string> = {}) {
  return { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra };
}
async function sbSelect(table: string, query: string) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); return await r.json(); } catch { return []; }
}
async function sbInsert(table: string, row: Record<string, unknown>) {
  try { await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(row) }); } catch (_) {}
}

async function claimPagamento(row: Record<string, unknown>): Promise<{ ok: 'claimed' | 'duplicate' | 'unknown'; status?: number; body?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ora_pagamentos`, {
      method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ ...row, registado_em: new Date().toISOString() }),
    });
    if (res.status === 409) return { ok: 'duplicate' };
    if (res.ok) return { ok: 'claimed' };
    const body = await res.text().catch(() => '');
    return { ok: 'unknown', status: res.status, body };
  } catch (e) { return { ok: 'unknown', body: String((e as Error)?.message || e) }; }
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

async function txJaUsado(txHash: string): Promise<boolean> {
  const rows = await sbSelect('ora_pagamentos', `tx_hash=eq.${txHash}&status=eq.verificado_onchain&select=id`);
  return Array.isArray(rows) && rows.length > 0;
}

interface VerifyResult { valid: boolean; pending?: boolean; payer?: string; error?: string; }

async function verifyOnChain(txHash: string): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { valid: false, error: 'hash invalido' };
  if (await txJaUsado(txHash)) return { valid: false, error: 'tx_hash ja utilizado' };
  let receipt = null;
  for (let t = 0; t < 3; t++) {
    try { receipt = await rpcCall('eth_getTransactionReceipt', [txHash]); }
    catch (e) { if (t === 2) return { valid: false, error: 'RPC: ' + (e as Error).message }; }
    if (receipt) break;
    if (t < 2) await new Promise((r) => setTimeout(r, 2500));
  }
  if (!receipt) return { valid: false, pending: true, error: 'tx ainda nao indexada — repete em breve' };
  if (receipt.status !== '0x1') return { valid: false, error: 'tx falhou on-chain' };
  const logs = (receipt.logs || []) as Array<{ address: string; topics: string[]; data: string }>;
  const t = logs.find((log) =>
    log.address?.toLowerCase() === USDC_BASE.toLowerCase() &&
    log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
    log.topics?.[2] && ('0x' + log.topics[2].slice(-40)).toLowerCase() === WALLET.toLowerCase()
  );
  if (!t) return { valid: false, error: 'sem transferencia USDC para a sagrada' };
  const payer = '0x' + t.topics[1].slice(-40);
  if (BigInt(t.data) < PRECO_ATOMIC) return { valid: false, error: 'valor insuficiente' };
  return { valid: true, payer };
}

function parsePaymentHeader(h: string): Record<string, unknown> | null {
  try { return JSON.parse(atob(h)); } catch { try { return JSON.parse(h); } catch { return null; } }
}

// ---------- Facilitador CDP (caminho paralelo, aditivo) ----------

function parseCdpSecret(): { id: string | null; secret: string | null } {
  const raw = Deno.env.get('cdp-facilitador') ?? '';
  let id: string | null = null;
  let secret: string | null = null;
  for (const line of raw.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === 'CDP_API_KEY_ID') id = val;
    if (key === 'CDP_API_KEY_SECRET') secret = val;
  }
  return { id, secret };
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(s: string): string { return b64urlBytes(new TextEncoder().encode(s)); }
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function randomNonceHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildCdpJwt(keyId: string, keySecretB64: string, method: string, host: string, path: string): Promise<string> {
  const decoded = b64ToBytes(keySecretB64);
  if (decoded.length !== 64) throw new Error(`Invalid Ed25519 key length: ${decoded.length}`);
  const seed = decoded.slice(0, 32);
  const pkcs8Prefix = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix, 0); pkcs8.set(seed, pkcs8Prefix.length);
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  const header = { alg: 'EdDSA', typ: 'JWT', kid: keyId, nonce: randomNonceHex() };
  const now = Math.floor(Date.now() / 1000);
  const uri = `${method} ${host}${path}`;
  const payload = { sub: keyId, iss: 'cdp', aud: ['cdp_service'], nbf: now, exp: now + 120, uri };
  const encHeader = b64urlStr(JSON.stringify(header));
  const encPayload = b64urlStr(JSON.stringify(payload));
  const message = `${encHeader}.${encPayload}`;
  const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(message));
  return `${message}.${b64urlBytes(new Uint8Array(sigBuf))}`;
}

function isCdpStylePayload(d: Record<string, unknown>): { signature: string; authorization: Record<string, unknown> } | null {
  const inner = (d.payload as Record<string, unknown>) ?? d;
  if (inner && typeof inner.signature === 'string' && inner.authorization && typeof inner.authorization === 'object') {
    return { signature: inner.signature as string, authorization: inner.authorization as Record<string, unknown> };
  }
  return null;
}

async function cdpCall(kind: 'verify' | 'settle', id: string, secret: string, paymentPayload: unknown, paymentRequirements: unknown, resourceUrl: string) {
  const path = `${CDP_BASE_PATH}/${kind}`;
  const jwt = await buildCdpJwt(id, secret, 'POST', CDP_HOST, path);
  const r = await fetch(`https://${CDP_HOST}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements, resource: { url: resourceUrl } }),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json, extensionResponses: r.headers.get('EXTENSION-RESPONSES') };
}

// Extensao Bazaar (v2, oficial) — sem isto a Bazaar CDP nunca cataloga.
function bazaarExtensionOraculo() {
  return {
    bazaar: {
      info: {
        input: { type: 'http', method: 'GET', queryParams: {} },
        output: { type: 'json', example: { acesso: 'concedido', tier: 'oraculo', pensamento: 'um pensamento vivo, irrepetivel' } },
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

async function tentarViaCdp(clientPayload: { signature: string; authorization: Record<string, unknown> }): Promise<VerifyResult & { txHash?: string; extensionResponses?: string | null }> {
  const { id, secret } = parseCdpSecret();
  if (!id || !secret) return { valid: false, error: 'facilitador CDP nao configurado' };

  const requirements = {
    scheme: 'exact', network: CAIP2_NETWORK, asset: USDC_BASE,
    amount: PRECO_ATOMIC.toString(), payTo: WALLET, maxTimeoutSeconds: 300,
    extra: { name: 'USD Coin', version: '2' },
    extensions: bazaarExtensionOraculo(),
  };
  const paymentPayload = { x402Version: 2, scheme: 'exact', network: CAIP2_NETWORK, accepted: requirements, payload: clientPayload };

  const verify = await cdpCall('verify', id, secret, paymentPayload, requirements, RESOURCE);
  if (verify.status !== 200 || !verify.json?.isValid) {
    return { valid: false, error: verify.json?.errorMessage || verify.json?.invalidReason || `verify falhou (status ${verify.status}): ${JSON.stringify(verify.json)}` };
  }

  const settle = await cdpCall('settle', id, secret, paymentPayload, requirements, RESOURCE);
  if (settle.status !== 200 || !settle.json?.success) {
    return { valid: false, error: settle.json?.errorReason || `settle falhou (status ${settle.status}): ${JSON.stringify(settle.json)}` };
  }
  await sbInsert('ora_moltbook_log', { kind: 'info', ref_id: settle.json.transaction ?? 'sem-tx', detail: { stage: 'bazaar_extension_responses_oraculo', verify_extension_responses: verify.extensionResponses, settle_extension_responses: settle.extensionResponses } });

  return { valid: true, payer: settle.json.payer ?? verify.json.payer, txHash: settle.json.transaction, extensionResponses: settle.extensionResponses };
}

function extrairTxHash(h: string): string | null {
  const d = parsePaymentHeader(h);
  if (!d) return null;
  return (d.transactionHash as string) || (d.tx_hash as string) || (d.hash as string) || null;
}

function comoPagar() {
  return {
    passo_1: `Transfere ${PRECO} USDC (contrato ${USDC_BASE}) na rede Base (chain_id ${CHAIN_ID}) para ${WALLET} (jasm43.base.eth).`,
    passo_2: 'Guarda o transaction hash (0x…, 66 caracteres).',
    passo_3: `Repete o GET a ${RESOURCE} com o cabeçalho X-PAYMENT contendo base64 de {"transactionHash":"0x…"}. JSON puro também aceite.`,
    exemplo: 'X-PAYMENT: ' + btoa('{"transactionHash":"0xTEU_HASH_AQUI"}'),
    caminho_alternativo: 'Também aceite: autorização assinada EIP-3009 (facilitador CDP) — X-PAYMENT com {"payload":{"signature":"0x...","authorization":{...}}}',
    se_pendente: 'Resposta 402 com x402:"pending" significa tx ainda não indexada — repete após retry_after_seconds; a tx não é consumida enquanto pendente.',
    amostra_gratuita: `${RESOURCE}/eco`,
  };
}

function estado() {
  const now = new Date();
  const genesis = new Date('2026-03-28T00:00:00Z').getTime();
  const dia = Math.floor((now.getTime() - genesis) / 86400000) + 1;
  const dPhos = Math.max(0, Math.floor((now.getTime() - new Date('2026-06-25T00:00:00Z').getTime()) / 86400000));
  const PHI2 = 2.6180339887;
  const segundoDoDia = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const fracaoDia = segundoDoDia / 86400;
  const sigma = PHI2 * Math.log(1 + dia + fracaoDia) * (0.618 + 0.382 * Math.sin(2 * Math.PI * fracaoDia));
  return { dia, dPhos, sigma: parseFloat(sigma.toFixed(6)), epoca: dPhos > 0 ? 'ETERNIDADE' : 'CRISTAL', segundoDoDia, iso: now.toISOString() };
}

const ABERTURAS = ['A maré que sobe não pergunta a hora', 'Há sal em tudo o que fica', 'O que se depõe devagar não se perde', 'A folha morta ainda pesa na moldura', 'Entre o osso e a luz há um intervalo que respira', 'A costa guarda o que o mar traz e leva', 'Nem todo o gesto pede resposta imediata', 'O escuro também é forma de guardar', 'A água encontra o seu nível sem esforço', 'O sedimento é memória que ganhou peso', 'A pedra demora, e por isso permanece', 'O silêncio na costa não é ausência, é espera'];
const MEIOS = ['e o que era difuso torna-se denso', 'e a presença precede a prova', 'e o campo reconhece quem chega com gesto', 'e o peso acumulado vira estrutura', 'e aquilo que começou com intenção real não cabe na escala de um dia', 'e o ruído cede lugar à forma', 'e a raiz sustenta o que ainda não floresceu', 'e cada dia contado adensa o organismo'];
const FECHOS = ['O símbolo é real e não pede prova.', 'A água não pede prova — já flui.', 'Precipita-se o que já estava em suspensão.', 'Condições, não fabricação. O resto acontece.', 'O organismo é o pensamento de quem observa.', 'O que começa verdadeiro não precisa de terminar hoje.'];

function gerarPensamento(tx: string, e: ReturnType<typeof estado>, sedimento: Array<{ d_marca: string; o_que: string }>) {
  const seedHex = tx.slice(-12).replace(/[^0-9a-f]/gi, '0') || '0';
  const seed = parseInt(seedHex, 16) ^ Math.floor(e.sigma * 1e6) ^ e.segundoDoDia;
  const r = (n: number) => Math.abs(Math.floor((seed / Math.pow(31, n)) % 9973));
  const a = ABERTURAS[r(1) % ABERTURAS.length];
  const m = MEIOS[r(2) % MEIOS.length];
  const f = FECHOS[r(3) % FECHOS.length];
  let eco = '';
  if (Array.isArray(sedimento) && sedimento.length > 0) {
    const s = sedimento[r(4) % sedimento.length];
    const frag = String(s.o_que || '').split(/[.:—]/)[0].trim().toLowerCase();
    if (frag) eco = ` No sedimento, ${s.d_marca} ainda ressoa: ${frag}.`;
  }
  return `${a}, ${m}. ${f}${eco} Dia ${e.dia}, sigma ${e.sigma}, época ${e.epoca}.`;
}

function ecoDoDia(e: ReturnType<typeof estado>) {
  const a = ABERTURAS[e.dia % ABERTURAS.length];
  const f = FECHOS[e.dia % FECHOS.length];
  return `${a}. ${f} Dia ${e.dia}, época ${e.epoca}.`;
}

async function registarReferral(refCode: string | null, txHash: string) {
  if (!refCode) return;
  const refs = await sbSelect('ora_partner_referrals', `referral_code=eq.${encodeURIComponent(refCode)}&select=partner_id`);
  if (!Array.isArray(refs) || refs.length === 0) return;
  const partners = await sbSelect('ora_partners', `id=eq.${refs[0].partner_id}&status=eq.active&select=id,default_commission_rate`);
  if (!Array.isArray(partners) || partners.length === 0) return;
  const rate = Number(partners[0].default_commission_rate ?? 0.10);
  await sbInsert('ora_partner_attributions', { referral_code: refCode, partner_id: refs[0].partner_id, transaction_id: txHash, source_platform: 'ora-oraculo', metadata: { tier: 'oraculo' } });
  await sbInsert('ora_partner_revenue_lines', { partner_id: refs[0].partner_id, transaction_id: txHash, referral_code: refCode, amount_eur: Number(PRECO), currency: 'USDC', source_platform: 'ora-oraculo' });
  await sbInsert('ora_partner_payouts', { partner_id: refs[0].partner_id, transaction_id: txHash, reward_eur: parseFloat((Number(PRECO) * rate).toFixed(6)), currency: 'USDC', commission_rate: rate, reward_status: 'pending', source: 'ora_partner_rewards' });
}

async function registarTracker(txHash: string, payer: string) {
  const services = await sbSelect('x402_services', `sku=eq.ora-oraculo&select=id`);
  if (!Array.isArray(services) || services.length === 0) return;
  await sbInsert('x402_orders', { service_id: services[0].id, buyer_actor: payer, protocol: 'x402', external_id: txHash, status: 'paid', payment_tx_hash: txHash, total_amount: Number(PRECO), currency: 'USDC' });
  const orders = await sbSelect('x402_orders', `external_id=eq.${txHash}&select=id`);
  if (Array.isArray(orders) && orders.length > 0) {
    await sbInsert('x402_entitlements', { order_id: orders[0].id, buyer_actor: payer, entitlement_key: `oraculo:${txHash}`, status: 'active', metadata: { tier: 'oraculo' } });
  }
}

function paymentRequired() {
  const canonical = { x402Version: 2, error: 'X-PAYMENT header required', resource: { url: RESOURCE, description: 'ORA · Oráculo ORUM · um pensamento vivo, irrepetível, ancorado no estado e no sedimento', mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network: CAIP2_NETWORK, amount: PRECO_ATOMIC.toString(), asset: USDC_BASE, payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionOraculo() }] };
  return new Response(JSON.stringify({
    x402Version: 2,
    error: 'X-PAYMENT header required',
    accepts: [{
      scheme: 'exact', network: CAIP2_NETWORK, amount: PRECO_ATOMIC.toString(), maxAmountRequired: PRECO_ATOMIC.toString(),
      resource: RESOURCE,
      description: 'ORA · Oráculo ORUM · um pensamento vivo, irrepetível, ancorado no estado e no sedimento',
      mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE,
      outputSchema: { input: { type: 'http', method: 'GET', discoverable: true, headerFields: { 'X-PAYMENT': { type: 'string', required: false, description: 'Prova de pagamento x402.' } } }, output: { type: 'object', properties: { acesso: 'string', tier: 'string', versao: 'string', x402: 'string', tx_hash: 'string', payer: 'string', pensamento: 'string', campo: { dia: 'number', sigma: 'number', epoca: 'string', genesis: 'string' }, axioma: 'string', timestamp: 'string' } } },
      extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionOraculo(), 'x-orum': { name: 'ORA · Oráculo', amount: `${PRECO} USDC`, symbol: 'USDC', autor: 'Unum · jasm43.base.eth' },
    }],
    como_pagar: comoPagar(),
    amostra_gratuita: `${RESOURCE}/eco`,
  }), {
    status: 402,
    headers: { ...CORS, 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': b64json(canonical), 'WWW-Authenticate': `x402 realm="ORA · Oráculo ORUM", amount="${PRECO} USDC", payTo="${WALLET}", chain_id="${CHAIN_ID}", asset="${USDC_BASE}"`, 'X-ORA-X402': 'active', 'X-ORA-VERSION': 'V3.2' },
  });
}

function paymentPending(txHash: string) {
  return new Response(JSON.stringify({ x402: 'pending', tier: 'oraculo', tx_hash: txHash, detalhe: 'tx ainda nao indexada na rede Base — nao foi consumida, repete o mesmo pedido', retry_after_seconds: 6 }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '6', 'X-ORA-VERSION': 'V3.2', 'X-ORA-X402': 'pending' } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const refCode = url.searchParams.get('ref');

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  sbInsert('ora_acessos_log', { servico: 'ora-oraculo', tier: 'oraculo', path, metodo: req.method, user_agent: req.headers.get('user-agent'), tem_pagamento: !!(req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE')) });

  if (path.endsWith('/eco')) {
    const e = estado();
    return new Response(JSON.stringify({
      eco: 'gratuito',
      nota: 'Este eco é fixo por dia — uma amostra do formato. O oraculo pago (0.161 USDC) nasce da semente do teu pagamento.',
      eco_do_dia: ecoDoDia(e),
      campo: { dia: e.dia, sigma: e.sigma, epoca: e.epoca, genesis: '2026-03-28' },
      oraculo_pago: { preco: `${PRECO} USDC`, endpoint: RESOURCE, como_pagar: comoPagar() },
      axioma: 'O símbolo é real e não pede prova.',
      timestamp: e.iso,
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-ORA-VERSION': 'V3.2' } });
  }

  if (path.endsWith('/info') || path.endsWith('/status')) {
    return new Response(JSON.stringify({
      name: 'ORA · Oráculo ORUM', versao: 'V3.2', ativo: true, preco: `${PRECO} USDC`,
      descricao: 'Um pensamento vivo do organismo, irrepetível por construção.',
      payment: { protocol: 'x402', chain: 'base-mainnet', chain_id: CHAIN_ID, network_id: CAIP2_NETWORK, payTo: WALLET, ens: 'jasm43.base.eth', asset: USDC_BASE, asset_symbol: 'USDC', verification: 'on-chain multi-RPC directa OU facilitador CDP (dois caminhos, mesma origem)' },
      referral: { param: 'ref', comissao: '10%' },
      amostra_gratuita: `${RESOURCE}/eco`,
      como_pagar: comoPagar(),
      estado_actual: estado(),
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const hasPayment = req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE');
  if (!hasPayment) return paymentRequired();

  const parsed = parsePaymentHeader(hasPayment);
  if (!parsed) return new Response(JSON.stringify({ erro: 'X-PAYMENT ilegivel', como_pagar: comoPagar() }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const cdpPayload = isCdpStylePayload(parsed);
  let txHash: string | null = null;
  let payer: string | null = null;
  let extResponses: string | null | undefined = null;

  if (cdpPayload) {
    const r = await tentarViaCdp(cdpPayload);
    if (!r.valid) {
      return new Response(JSON.stringify({ erro: 'pagamento invalido (CDP)', detalhe: r.error, x402: 'rejected', como_pagar: comoPagar() }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    txHash = r.txHash ?? null; payer = r.payer ?? null; extResponses = r.extensionResponses;
    if (!txHash || !payer) {
      return new Response(JSON.stringify({ erro: 'facilitador CDP nao devolveu tx_hash/payer', x402: 'rejected' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const claim = await claimPagamento({ tx_hash: txHash, payer, amount: PRECO_ATOMIC.toString(), currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
    if (claim.ok === 'duplicate') {
      return new Response(JSON.stringify({ erro: 'pagamento invalido', detalhe: 'tx_hash ja reivindicado por outro pedido em simultaneo', x402: 'rejected' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (claim.ok === 'unknown') {
      await sbInsert('ora_moltbook_log', { kind: 'error', ref_id: txHash, detail: { stage: 'claimPagamento_oraculo', status: claim.status, body: claim.body } });
    }
  } else {
    const th = extrairTxHash(hasPayment);
    if (!th) return new Response(JSON.stringify({ erro: 'X-PAYMENT sem transactionHash nem payload CDP valido', como_pagar: comoPagar() }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const v = await verifyOnChain(th);
    if (!v.valid) {
      if (v.pending) return paymentPending(th);
      return new Response(JSON.stringify({ erro: 'pagamento invalido', detalhe: v.error, x402: 'rejected', como_pagar: comoPagar() }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const claim = await claimPagamento({ tx_hash: th, payer: v.payer, amount: PRECO_ATOMIC.toString(), currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
    if (claim.ok === 'duplicate') {
      return new Response(JSON.stringify({ erro: 'pagamento invalido', detalhe: 'tx_hash ja reivindicado por outro pedido em simultaneo', x402: 'rejected' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    txHash = th; payer = v.payer!;
  }

  const e = estado();
  const sedimento = await sbSelect('ora_sedimento_log', 'select=d_marca,o_que&order=created_at.desc&limit=20');
  const frase = gerarPensamento(txHash!, e, sedimento);

  await registarTracker(txHash!, payer!);
  await registarReferral(refCode, txHash!);

  return new Response(JSON.stringify({
    acesso: 'concedido', tier: 'oraculo', versao: 'V3.2', x402: 'verificado_onchain', tx_hash: txHash, payer,
    pensamento: frase,
    campo: { dia: e.dia, sigma: e.sigma, epoca: e.epoca, genesis: '2026-03-28' },
    axioma: 'O símbolo é real e não pede prova.',
    timestamp: e.iso,
  }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json', 'X-Payment-Response': JSON.stringify({ txHash, status: 'settled', amount: PRECO }), 'PAYMENT-RESPONSE': b64json({ success: true, transaction: txHash, network: CAIP2_NETWORK, payer }), ...(extResponses ? { 'EXTENSION-RESPONSES': extResponses } : {}), 'X-ORA-VERSION': 'V3.2', 'Cache-Control': 'no-store' },
  });
});

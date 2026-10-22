import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · AUDITORIA DE DESCOBERTA · V1 — 26/09/2026
// Reaproveita o slot de 'ora-cdp-teste-payto-cdp' (utilitario de teste ja
// cumprido, carteira efemera, sem referencia em nenhum caminho de pagamento
// em producao) — organismo atingiu o tecto de edge functions do plano
// Supabase, sem espaco para uma funcao nova. Codigo antigo fica no historico
// de versoes anteriores desta funcao, nada foi perdido.
//
// Nova porta de sustento: generaliza o ora-bazaar-verificar (que so varria
// o catalogo CDP a procura de marcas do proprio ORUM) para qualquer agente
// pagador que queira saber se A SUA PROPRIA marca/dominio esta indexado no
// catalogo de descoberta x402 (Bazaar) da Coinbase Developer Platform.
// Reutiliza: verificacao on-chain ja provada em producao (ora-x402 V31) e
// o handshake JWT Ed25519 com a CDP ja provado em producao (ora-bazaar-verificar V4).

const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CAIP2_NETWORK = 'eip155:8453';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CDP_HOST = 'api.cdp.coinbase.com';
const DISCOVERY_PATH = '/platform/v2/x402/discovery/resources';
const PRECO_USDC = '0.50';
const PRECO_ATOMIC = 500000n;
const SKU = 'ora-auditoria-descoberta';
const FUNC_NOME = 'ora-cdp-teste-payto-cdp';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT' };

function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }
function sbHeaders(extra: Record<string, string> = {}) { return { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra }; }
async function sbInsert(table: string, rows: Record<string, unknown>) { try { await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(rows) }); } catch (_) {} }
async function sbSelect(table: string, query: string) { try { const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); return await res.json(); } catch { return []; } }
async function txJaUsado(txHash: string): Promise<boolean> { const rows = await sbSelect('ora_pagamentos', `tx_hash=eq.${txHash}&status=eq.verificado_onchain&select=id`); return Array.isArray(rows) && rows.length > 0; }

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

interface VerifyResult { valid: boolean; pending?: boolean; payer?: string; amount?: string; error?: string; }
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
  const transferLog = logs.find((log) => log.address?.toLowerCase() === USDC_BASE.toLowerCase() && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics?.[2] && ('0x' + log.topics[2].slice(-40)).toLowerCase() === WALLET.toLowerCase());
  if (!transferLog) return { valid: false, error: 'sem transferencia USDC para ORA' };
  const payer = '0x' + transferLog.topics[1].slice(-40);
  const amountAtomic = BigInt(transferLog.data);
  if (amountAtomic < PRECO_ATOMIC) return { valid: false, error: `valor insuficiente: ${amountAtomic}` };
  return { valid: true, payer, amount: amountAtomic.toString() };
}

function parsePaymentHeader(h: string): Record<string, unknown> | null { try { return JSON.parse(atob(h)); } catch { try { return JSON.parse(h); } catch { return null; } } }
function extrairTxHash(h: string): string | null { const d = parsePaymentHeader(h); if (!d) return null; return (d.transactionHash as string) || (d.tx_hash as string) || (d.hash as string) || null; }

function comoPagar(resource: string) {
  return {
    passo_1: `Transfere ${PRECO_USDC} USDC (contrato ${USDC_BASE}) na rede Base (chain_id ${CHAIN_ID}) para ${WALLET} (jasm43.base.eth).`,
    passo_2: 'Guarda o transaction hash da transferencia.',
    passo_3: `Repete o pedido GET a ${resource} com o cabecalho X-PAYMENT = base64({"transactionHash":"0x…"}).`,
  };
}

function paymentRequired(resource: string) {
  const accepts = [{ scheme: 'exact', network: CAIP2_NETWORK, amount: PRECO_ATOMIC.toString(), maxAmountRequired: PRECO_ATOMIC.toString(), resource, description: 'Verifica se uma marca/dominio proprios estao indexados no catalogo de descoberta x402 (Bazaar) da Coinbase Developer Platform — auditoria feita ao vivo, nao cacheada.', mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE, extra: { name: 'USD Coin', version: '2' } }];
  return new Response(JSON.stringify({ x402Version: 2, error: 'X-PAYMENT header required', accepts, como_pagar: comoPagar(resource), truth_machine: { is_market_data: false, external_demand_proven: false, requires_x402_payment: true }, boundaries_machine: { grants_write_access: false, creates_recurring_or_ongoing_charge: false, verifies_payer_real_world_identity: false, refundable_or_reversible: false, leaves_onchain_and_db_trace: true } }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': b64json({ x402Version: 2, resource: { url: resource }, accepts }), 'X-ORA-VERSION': 'V1', 'X-ORA-SKU': SKU } });
}

function parseSecret(raw: string): { id: string | null; secret: string | null } {
  let id: string | null = null; let secret: string | null = null;
  for (const line of raw.split('\n')) { const idx = line.indexOf('='); if (idx === -1) continue; const k = line.slice(0, idx).trim(); const v = line.slice(idx + 1).trim(); if (k === 'CDP_API_KEY_ID') id = v; if (k === 'CDP_API_KEY_SECRET') secret = v; }
  return { id, secret };
}
function b64urlBytes(b: Uint8Array): string { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlStr(s: string): string { return b64urlBytes(new TextEncoder().encode(s)); }
function b64ToBytes(b64: string): Uint8Array { const bin = atob(b64); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
function nonceHex(): string { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function buildJwt(keyId: string, keySecretB64: string, method: string, host: string, path: string): Promise<string> {
  const decoded = b64ToBytes(keySecretB64);
  if (decoded.length !== 64) throw new Error(`chave Ed25519 invalida: ${decoded.length}`);
  const seed = decoded.slice(0, 32);
  const prefix = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
  const pkcs8 = new Uint8Array(prefix.length + seed.length); pkcs8.set(prefix, 0); pkcs8.set(seed, prefix.length);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  const header = { alg: 'EdDSA', typ: 'JWT', kid: keyId, nonce: nonceHex() };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: keyId, iss: 'cdp', aud: ['cdp_service'], nbf: now, exp: now + 120, uri: `${method} ${host}${path}` };
  const msg = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(msg));
  return `${msg}.${b64urlBytes(new Uint8Array(sig))}`;
}

async function auditarMarca(marca: string, offsetInicial: number, paginasMax: number) {
  const { id, secret } = parseSecret(Deno.env.get('cdp-facilitador') ?? '');
  if (!id || !secret) return { veredicto: 'INDETERMINADO — credenciais CDP ausentes neste organismo', marca };
  let offset = offsetInicial; let paginas = 0; let ocorrencias = 0; let total: number | null = null; let erro: string | null = null;
  const t0 = Date.now();
  const re = new RegExp(esc(marca.toLowerCase()), 'g');
  try {
    const jwt = await buildJwt(id, secret, 'GET', CDP_HOST, DISCOVERY_PATH);
    while (paginas < paginasMax) {
      if (Date.now() - t0 > 90000) { erro = 'limite de tempo da fatia — continua no proximo_offset'; break; }
      const r = await fetch(`https://${CDP_HOST}${DISCOVERY_PATH}?limit=100&offset=${offset}`, { headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' } });
      if (r.status !== 200) { erro = `offset ${offset} devolveu ${r.status}`; break; }
      const texto = await r.text();
      paginas++;
      ocorrencias += (texto.toLowerCase().match(re) || []).length;
      let j: any = null;
      try { j = JSON.parse(texto); } catch { erro = 'resposta nao e JSON'; break; }
      const lista = Array.isArray(j?.items) ? j.items : [];
      if (typeof j?.pagination?.total === 'number') total = j.pagination.total;
      offset += 100;
      if (lista.length === 0) break;
      if (total !== null && offset >= total) break;
    }
  } catch (e) { erro = String((e as Error)?.message || e); }
  const fim = total !== null && offset >= total;
  return {
    marca, total_no_catalogo: total, paginas_lidas: paginas, ocorrencias_encontradas: ocorrencias,
    proximo_offset: fim ? null : offset, varrimento_completo: fim,
    percentagem_varrida: total ? Math.round((Math.min(offset, total) / total) * 1000) / 10 : null,
    erro: erro ?? undefined,
    veredicto: ocorrencias > 0 ? `INDEXADO — "${marca}" aparece ${ocorrencias}x no catalogo` : fim ? `NAO INDEXADO — catalogo varrido por completo (${total} recursos), zero ocorrencias de "${marca}"` : `PARCIAL — ${Math.min(offset, total ?? offset)} de ${total ?? '?'} recursos varridos, ainda sem ocorrencias. Nao prova ausencia.`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const resourceForRequirements = `${SUPABASE_URL}/functions/v1/${FUNC_NOME}`;

  if (url.pathname.endsWith('/status')) {
    return new Response(JSON.stringify({ ativo: true, sku: SKU, preco: `${PRECO_USDC} USDC`, wallet: WALLET, nota: 'Servico reescrito sobre o slot de um utilitario de teste ja cumprido (payTo-CDP) — sem relacao com o teste original.', descricao: 'Auditoria x402 Bazaar (CDP) para marca/dominio de terceiros — servico novo, nunca ligado a verdade operacional do proprio ORUM.' }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const marca = url.searchParams.get('marca');
  if (!marca) return new Response(JSON.stringify({ error: 'parametro obrigatorio em falta', uso: `${resourceForRequirements}?marca=<texto a procurar>` }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const hasPayment = req.headers.get('X-PAYMENT') || req.headers.get('X-Payment');
  if (!hasPayment) return paymentRequired(`${resourceForRequirements}?marca=${encodeURIComponent(marca)}`);

  const parsed = parsePaymentHeader(hasPayment);
  const th = parsed ? extrairTxHash(hasPayment) : null;
  if (!th) return new Response(JSON.stringify({ error: 'X-PAYMENT ilegivel ou sem transactionHash' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const v = await verifyOnChain(th);
  if (!v.valid) {
    if (v.pending) return new Response(JSON.stringify({ x402: 'pending', tx_hash: th, retry_after_seconds: 6 }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '6' } });
    return new Response(JSON.stringify({ error: 'pagamento invalido', detalhe: v.error, x402: 'rejected' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  await sbInsert('ora_pagamentos', { tx_hash: th, payer: v.payer, amount: v.amount, currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain', registado_em: new Date().toISOString() });

  const offsetInicial = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);
  const paginasMax = Math.min(Math.max(parseInt(url.searchParams.get('paginas') ?? '60', 10) || 60, 1), 150);
  const resultado = await auditarMarca(marca, offsetInicial, paginasMax);

  return new Response(JSON.stringify({ acesso: 'concedido', sku: SKU, tx_hash: th, payer: v.payer, resultado, timestamp: new Date().toISOString() }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});

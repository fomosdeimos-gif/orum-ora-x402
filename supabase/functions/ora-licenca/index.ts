import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as ed from "npm:@noble/ed25519@2";

// ORA · LICENCA · V45 · 25/08/2026 — converte /preview e /arquivo de 410 para
// redirect 307: /preview -> /consulta (preservando ?obra=), /arquivo -> /catalogo.
// Motivo: sondas externas legadas continuam a chegar a estas rotas descontinuadas
// e recebiam 410 sem alternativa accionavel. Nenhum preco, nenhuma logica de
// pagamento, nenhuma verificacao on-chain alterada. Ver ora_mudancas #319.
// ORA · LICENCA · V42 · 20/08/2026 — acrescenta truth_machine e boundaries_machine
// tambem a resposta 402 (payment required) de cada licenca, fechando o ultimo
// lugar onde a camada mecanica ainda faltava neste servico (ja estava no
// catalogo, no manifesto well-known e no certificado da resposta paga).
// Nenhuma linha de logica de pagamento tocada.
// ORA · LICENCA · V41 · 20/08/2026 — acrescenta boundaries_machine (mesmos 6
// booleanos operacionais ja em ora-x402 V30 e ora-oraculo V3.5: sem escrita,
// sem cobranca recorrente, sem verificacao de identidade real, sem reembolso,
// sem execucao do cabecalho como codigo, com rasto on-chain+BD sempre deixado)
// ao catalogo, ao manifesto well-known, e agora tambem ao certificado da
// resposta paga (que ainda nao tinha nem truth_machine nem boundaries_machine).
// Nenhuma linha de logica de pagamento tocada.
// ORA · LICENCA · V40 · 17/08/2026
// Correcao sobre V39, guiada de novo pelo validador oficial da CDP: o
// bazaar.info.input.queryParams.obra tinha um DESCRITOR de tipo em vez de
// um VALOR de exemplo real. Erro exacto: "(root).input.queryParams.obra:
// Invalid type. Expected: string, given: object". Corrigido: obra passa a
// ser um exemplo literal ("89"), o schema continua a descrever a forma.

const sb = createClient('https://ywabnlhkmhbyewqhbsjm.supabase.co', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CAIP2_NETWORK = 'eip155:8453';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const NFT_CONTRACT = '0xC100Fd6E3B557E8A2b97A68C53689C4925F4dD22';
const VERSAO = 'V45';
const TOTAL_OBRAS_FISICAS = 107;
const BUCKET_PRIVADO = 'arca-fisica';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES' };

type LicKey = 'consulta' | 'editorial' | 'treino';
interface Lic { key: LicKey; sku: string; usdc: string; atomic: bigint; dias: number | null; acesso_segundos: number; descricao: string; direitos: string[]; }
const LICENCAS: Record<LicKey, Lic> = {
  consulta: { key: 'consulta', sku: 'ora-licenca-consulta', usdc: '1.618', atomic: 1618000n, dias: 30, acesso_segundos: 300, descricao: 'Acesso privado a uma fotografia preservada da coleccão fisica 0001sensations, para observacão ou estudo pessoal. Nao e uso comercial.', direitos: ['visualizacao-privada', 'estudo-pessoal'] },
  editorial: { key: 'editorial', sku: 'ora-licenca-editorial', usdc: '16.18', atomic: 16180000n, dias: null, acesso_segundos: 3600, descricao: 'Reproduccão editorial de uma obra fisica preservada -- artigo, livro, exposicão documental ou comunicacão -- com atribuicão obrigatoria.', direitos: ['publicacao-editorial', 'atribuicao-obrigatoria'] },
  treino: { key: 'treino', sku: 'ora-licenca-treino', usdc: '161.80', atomic: 161800000n, dias: null, acesso_segundos: 3600, descricao: 'Uso de uma fotografia preservada da coleccão fisica num conjunto de treino ou avaliacao de maquinas, com proveniencia documentada. Nao exclusiva.', direitos: ['ai-training', 'dataset-inclusion', 'proveniencia-documentada'] },
};

function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }

function truthMachineCatalogo() {
  return { ia_generativa: false, licenciamento_exclusivo: false, fotografias_publicas: false, transfere_propriedade_fisica: false, transfere_direitos_autorais_integrais: false, transfere_nft: false, requires_x402_payment: true };
}
function boundariesMachineLicenca() {
  return {
    grants_write_access: false,
    creates_recurring_or_ongoing_charge: false,
    verifies_payer_real_world_identity: false,
    refundable_or_reversible: false,
    executes_payment_header_as_code: false,
    leaves_onchain_and_db_trace: true,
  };
}
function hostExterno(req: Request): string | null { const candidatos = [req.headers.get('x-ora-host'), req.headers.get('x-forwarded-host')]; for (const c of candidatos) { const h = (c || '').trim(); if (h && !h.includes('supabase.co') && !h.includes('localhost')) return h; } return null; }
function resourceUrlFor(req: Request, lic: Lic, obra?: string | null): string { const h = hostExterno(req); const base = h ? `https://${h}/licenca/${lic.key}` : `${SUPABASE_URL}/functions/v1/ora-licenca/${lic.key}`; return base + (obra ? '?obra=' + encodeURIComponent(obra) : ''); }
function publicoUrl(req: Request, sufixo: string): string { const h = hostExterno(req); return h ? `https://${h}/licenca/${sufixo}` : `${SUPABASE_URL}/functions/v1/ora-licenca/${sufixo}`; }
function sbHeaders(extra: Record<string, string> = {}) { return { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra }; }
async function sbSelect(table: string, query: string) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); return await r.json(); } catch { return []; } }
async function sbInsert(table: string, row: Record<string, unknown>) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(row) }); return await r.json(); } catch { return null; } }
async function sbCount(table: string, query: string) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders({ Prefer: 'count=exact', Range: '0-0' }) }); const cr = r.headers.get('content-range'); if (!cr) return 0; const total = cr.split('/')[1]; return total && total !== '*' ? parseInt(total, 10) : 0; } catch { return 0; } }
async function claimPagamento(row: Record<string, unknown>): Promise<{ ok: 'claimed' | 'duplicate' | 'unknown' }> { try { const res = await fetch(`${SUPABASE_URL}/rest/v1/ora_pagamentos`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ ...row, registado_em: new Date().toISOString() }) }); if (res.status === 409) return { ok: 'duplicate' }; if (res.ok) return { ok: 'claimed' }; return { ok: 'unknown' }; } catch { return { ok: 'unknown' }; } }
async function rpcCall(method: string, params: unknown[]) { let lastErr: Error | null = null; for (const rpc of RPCS) { try { const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) }); const json = await res.json(); if (json.error) throw new Error(json.error.message); return json.result; } catch (e) { lastErr = e as Error; } } throw lastErr ?? new Error('todos os RPC Base falharam'); }
async function txJaUsada(txHash: string): Promise<boolean> { const l = await sbSelect('ora_licencas_fisicas', `tx_hash=eq.${txHash}&select=id`); if (Array.isArray(l) && l.length > 0) return true; const p = await sbSelect('ora_pagamentos', `tx_hash=eq.${txHash}&status=eq.verificado_onchain&select=id`); return Array.isArray(p) && p.length > 0; }
interface VerifyResult { valid: boolean; pending?: boolean; payer?: string; amount?: string; error?: string; }
async function verifyOnChain(txHash: string, lic: Lic): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { valid: false, error: 'hash invalido' };
  if (await txJaUsada(txHash)) return { valid: false, error: 'tx_hash ja utilizado' };
  let receipt = null;
  for (let t = 0; t < 3; t++) { try { receipt = await rpcCall('eth_getTransactionReceipt', [txHash]); } catch (e) { if (t === 2) return { valid: false, error: 'RPC: ' + (e as Error).message }; } if (receipt) break; if (t < 2) await new Promise((r) => setTimeout(r, 2500)); }
  if (!receipt) return { valid: false, pending: true, error: 'tx ainda nao indexada' };
  if (receipt.status !== '0x1') return { valid: false, error: 'tx falhou on-chain' };
  const logs = (receipt.logs || []) as Array<{ address: string; topics: string[]; data: string }>;
  const transferLog = logs.find((log) => log.address?.toLowerCase() === USDC_BASE.toLowerCase() && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics?.[2] && ('0x' + log.topics[2].slice(-40)).toLowerCase() === WALLET.toLowerCase());
  if (!transferLog) return { valid: false, error: 'sem transferencia USDC para a carteira sagrada' };
  const payer = '0x' + transferLog.topics[1].slice(-40);
  const amountAtomic = BigInt(transferLog.data);
  if (amountAtomic < lic.atomic) return { valid: false, error: `valor insuficiente para ${lic.key}` };
  return { valid: true, payer, amount: amountAtomic.toString() };
}
function parsePaymentHeader(h: string): Record<string, unknown> | null { try { return JSON.parse(atob(h)); } catch { try { return JSON.parse(h); } catch { return null; } } }
function extrairTxHash(h: string): string | null { const d = parsePaymentHeader(h); if (!d) return null; return (d.transactionHash as string) || (d.tx_hash as string) || (d.hash as string) || null; }

// ---------- NOVO EM V34-V40: caminho paralelo via facilitador CDP (Bazaar) ----------
ed.etc.sha512Async = async (...msgs: Uint8Array[]) => { let total = 0; for (const m of msgs) total += m.length; const buf = new Uint8Array(total); let off = 0; for (const m of msgs) { buf.set(m, off); off += m.length; } return new Uint8Array(await crypto.subtle.digest('SHA-512', buf)); };
function b64urlEncode(bytes: Uint8Array): string { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function b64urlEncodeStr(s: string): string { return b64urlEncode(new TextEncoder().encode(s)); }
function b64ToBytes(b64: string): Uint8Array { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function hexNonce(len = 16): string { const bytes = crypto.getRandomValues(new Uint8Array(len)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, len); }
async function gerarJwtCdp(keyId: string, keySecretB64: string, method: string, host: string, path: string): Promise<string> {
  const decoded = b64ToBytes(keySecretB64); if (decoded.length !== 64) throw new Error('chave CDP com tamanho inesperado');
  const seed = decoded.slice(0, 32); const now = Math.floor(Date.now() / 1000);
  const uri = `${method.toUpperCase()} ${host}${path}`;
  const header = { alg: 'EdDSA', typ: 'JWT', kid: keyId, nonce: hexNonce(16) };
  const claims = { sub: keyId, iss: 'cdp', aud: ['cdp_service'], nbf: now, exp: now + 120, uri };
  const signingInput = `${b64urlEncodeStr(JSON.stringify(header))}.${b64urlEncodeStr(JSON.stringify(claims))}`;
  const sig = await ed.signAsync(new TextEncoder().encode(signingInput), seed);
  return `${signingInput}.${b64urlEncode(sig)}`;
}
let cdpKeys: { key_id: string; key_secret: string } | null = null;
try {
  const { data } = await sb.rpc('orum_cdp_keys');
  if (data && data[0]?.key_id && data[0]?.key_secret) cdpKeys = { key_id: data[0].key_id, key_secret: data[0].key_secret };
} catch (_) { cdpKeys = null; }
const CDP_DISPONIVEL = !!cdpKeys;
const CDP_HOST = 'api.cdp.coinbase.com';

function bazaarExtensionFor(lic: Lic, resourceUrlStr: string) {
  const info = {
    input: { type: 'http', method: 'GET', queryParams: { obra: '89' } },
    output: { type: 'json', example: { acesso: 'concedido', licenca: { tipo_licenca: lic.key, obra: { titulo: 'exemplo', sha256: '...' }, acesso_a_fotografia: { url_assinada: 'https://...', expira_em: '2026-...' } } } },
  };
  const schema = {
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['input'],
    properties: {
      input: { type: 'object', additionalProperties: false, required: ['type', 'method'], properties: { type: { const: 'http', type: 'string' }, method: { enum: ['GET', 'HEAD', 'DELETE'], type: 'string' }, queryParams: { type: 'object', properties: { obra: { type: 'string' } } } } },
      output: { type: 'object', required: ['type'], properties: { type: { type: 'string' }, example: { type: 'object' } } },
    },
  };
  return { bazaar: { info, schema } };
}
function cdpAcceptFor(lic: Lic, resourceUrlStr: string) {
  return { scheme: 'exact', network: CAIP2_NETWORK, asset: USDC_BASE, amount: lic.atomic.toString(), payTo: WALLET, maxTimeoutSeconds: 300, resource: resourceUrlStr, description: `0001sensations · coleccão fisica · ${lic.descricao} · via facilitador CDP`, extra: { name: 'USD Coin', version: '2' } };
}
interface PagamentoV2 { x402Version?: number; scheme?: string; network?: string; payload?: { signature?: string; authorization?: Record<string, unknown> } }
function pareceX402V2Cdp(d: Record<string, unknown> | null): d is PagamentoV2 { if (!d) return false; const p = (d as PagamentoV2).payload; return !!(p && p.signature && p.authorization && (d as PagamentoV2).scheme === 'exact'); }
async function verificarESettleViaCdp(pagamento: PagamentoV2, lic: Lic, resourceUrlStr: string): Promise<{ ok: true; txHash: string; payer: string } | { ok: false; erro: string; pendente?: boolean }> {
  if (!cdpKeys) return { ok: false, erro: 'facilitador CDP nao configurado' };
  const accepted = { scheme: 'exact', network: CAIP2_NETWORK, asset: USDC_BASE, amount: lic.atomic.toString(), payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } };
  const paymentRequirements = { scheme: 'exact', network: CAIP2_NETWORK, asset: USDC_BASE, amount: lic.atomic.toString(), maxAmountRequired: lic.atomic.toString(), payTo: WALLET, maxTimeoutSeconds: 300, resource: resourceUrlStr, description: `0001sensations · ${lic.descricao} · via facilitador CDP`, mimeType: 'application/json', extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(lic, resourceUrlStr) };
  const corpo = { x402Version: 2, paymentPayload: { x402Version: 2, scheme: 'exact', network: CAIP2_NETWORK, accepted, payload: pagamento.payload, resource: { url: resourceUrlStr } }, paymentRequirements };
  const path = '/platform/v2/x402/verify';
  let jwt: string;
  try { jwt = await gerarJwtCdp(cdpKeys.key_id, cdpKeys.key_secret, 'POST', CDP_HOST, path); } catch (e) { return { ok: false, erro: 'jwt: ' + String((e as Error)?.message || e) }; }
  let verResp: Response;
  try { verResp = await fetch(`https://${CDP_HOST}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); } catch (e) { return { ok: false, erro: 'rede verify: ' + String((e as Error)?.message || e) }; }
  const verJson = await verResp.json().catch(() => null);
  if (!verResp.ok || !verJson?.isValid) return { ok: false, erro: 'verify falhou: ' + JSON.stringify(verJson ?? verResp.status) };
  const settlePath = '/platform/v2/x402/settle';
  let jwt2: string;
  try { jwt2 = await gerarJwtCdp(cdpKeys.key_id, cdpKeys.key_secret, 'POST', CDP_HOST, settlePath); } catch (e) { return { ok: false, erro: 'jwt settle: ' + String((e as Error)?.message || e) }; }
  let setResp: Response;
  try { setResp = await fetch(`https://${CDP_HOST}${settlePath}`, { method: 'POST', headers: { Authorization: `Bearer ${jwt2}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); } catch (e) { return { ok: false, erro: 'rede settle: ' + String((e as Error)?.message || e) }; }
  const setJson = await setResp.json().catch(() => null);
  if (!setResp.ok || !setJson?.success) return { ok: false, erro: 'settle falhou: ' + JSON.stringify(setJson ?? setResp.status) };
  const txHash = setJson.transaction || setJson.transactionHash;
  const payer = (pagamento.payload!.authorization as Record<string, unknown>).from as string;
  if (!txHash || !payer) return { ok: false, erro: 'settle sem transaction/payer na resposta' };
  return { ok: true, txHash, payer };
}
// ---------- fim do bloco novo ----------

function outputSchemaFor(lic: Lic) { return { input: { type: 'http', method: 'GET', queryParams: { obra: { type: 'string', required: false, description: 'id ou titulo de uma obra fisica (ver catalogo).' } }, headerFields: { 'PAYMENT-SIGNATURE': { type: 'string', required: false }, 'X-PAYMENT': { type: 'string', required: false } } }, output: { type: 'object', properties: { acesso: 'string', licenca: { certificado: 'string', obra: 'object', tipo_licenca: 'string', direitos: 'array', licenciado: 'string', valor: 'string', acesso_a_fotografia: { url_assinada: 'string', expira_em: 'string' } } } } }; }
function acceptsFor(lic: Lic, resourceUrlStr: string) {
  const base = { scheme: 'exact', network: CAIP2_NETWORK, amount: lic.atomic.toString(), maxAmountRequired: lic.atomic.toString(), resource: resourceUrlStr, description: `0001sensations · coleccão fisica · ${lic.descricao}`, mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE, outputSchema: outputSchemaFor(lic), extra: { name: 'USD Coin', version: '2' }, 'x-orum': { name: '0001sensations · ORUM', licenca: lic.key, amount: `${lic.usdc} USDC`, autor: 'Jorge Silva Martins · Unum · jasm43.base.eth' } };
  const lista = [base];
  if (CDP_DISPONIVEL) lista.push(cdpAcceptFor(lic, resourceUrlStr));
  return lista;
}
function paymentRequired(req: Request, lic: Lic, obra: string | null) {
  const resourceUrlStr = resourceUrlFor(req, lic, obra);
  const canonical = { x402Version: 2, error: 'Payment required', resource: { url: resourceUrlStr, description: `0001sensations · ${lic.descricao}`, mimeType: 'application/json' }, accepts: acceptsFor(lic, resourceUrlStr), extensions: bazaarExtensionFor(lic, resourceUrlStr) };
  return new Response(JSON.stringify({ ...canonical, como_pagar: { passo_1: `Transfere ${lic.usdc} USDC (${USDC_BASE}) na rede Base (chain_id ${CHAIN_ID}) para ${WALLET} (jasm43.base.eth).`, passo_2: 'Guarda o transaction hash.', passo_3: `Repete o GET a ${resourceUrlStr} com PAYMENT-SIGNATURE ou X-PAYMENT contendo base64 de {"transactionHash":"0x…"}.` }, catalogo_gratuito: publicoUrl(req, 'catalogo'), truth_machine: truthMachineCatalogo(), boundaries_machine: boundariesMachineLicenca(), aviso: 'Esta licenca incide sobre uma fotografia digital preservada da obra fisica, identificada pelo seu SHA-256. Nao transfere a propriedade da obra fisica, direitos autorais integrais, exclusividade, nem qualquer NFT.' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': b64json(canonical), 'WWW-Authenticate': `x402 realm="0001sensations · ${lic.key}", amount="${lic.usdc} USDC", payTo="${WALLET}", chain_id="${CHAIN_ID}", asset="${USDC_BASE}"`, 'X-ORA-VERSION': VERSAO } });
}
function paymentPending(lic: Lic, txHash: string) { return new Response(JSON.stringify({ x402: 'pending', licenca: lic.key, tx_hash: txHash, retry_after_seconds: 6 }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '6', 'X-ORA-VERSION': VERSAO } }); }

async function encontrarObraFisica(query: string | null): Promise<any | null> {
  if (!query) {
    const disponiveis = await sbSelect('ora_coleccao_fisica', 'select=id,titulo,ano,sha256,descricao_visivel,bytes_na_arca,caminho_arca&bytes_na_arca=eq.true&order=id.asc');
    if (Array.isArray(disponiveis) && disponiveis.length > 0) return disponiveis[Math.floor(Math.random() * disponiveis.length)];
    return null;
  }
  const isNum = /^\d+$/.test(query.trim());
  const rows = await sbSelect('ora_coleccao_fisica', isNum
    ? `id=eq.${query.trim()}&select=id,titulo,ano,sha256,descricao_visivel,bytes_na_arca,caminho_arca&limit=1`
    : `titulo=ilike.*${encodeURIComponent(query.trim())}*&select=id,titulo,ano,sha256,descricao_visivel,bytes_na_arca,caminho_arca&limit=1`);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function gerarAcessoAssinado(obra: any, lic: Lic, licencaId: string): Promise<{ url: string; expira_em: string } | null> {
  if (!obra.bytes_na_arca || !obra.caminho_arca) return null;
  const { data, error } = await sb.storage.from(BUCKET_PRIVADO).createSignedUrl(obra.caminho_arca, lic.acesso_segundos);
  if (error || !data?.signedUrl) return null;
  const expiraEm = new Date(Date.now() + lic.acesso_segundos * 1000).toISOString();
  await sbInsert('ora_arca_fisica_acessos_assinados', { licenca_id: licencaId, obra_id: obra.id, tipo_licenca: lic.key, expira_em: expiraEm });
  return { url: data.signedUrl, expira_em: expiraEm };
}

async function emitirLicenca(lic: Lic, obraQuery: string | null, txHash: string, payer: string, via: string = 'rpc-direto'): Promise<Response> {
  const obra = await encontrarObraFisica(obraQuery);
  if (!obra) return new Response(JSON.stringify({ erro: 'nenhuma obra fisica disponivel para licenciar' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const validaAte = lic.dias ? new Date(Date.now() + lic.dias * 86400000).toISOString() : null;
  const inserted = await sbInsert('ora_licencas_fisicas', { obra_id: obra.id, obra_titulo: obra.titulo, obra_sha256: obra.sha256, obra_ano: obra.ano, tipo_licenca: lic.key, licenciado: payer, tx_hash: txHash, valor_usdc: Number(lic.usdc), valida_ate: validaAte });
  const licencaId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : null;

  const acesso = licencaId ? await gerarAcessoAssinado(obra, lic, licencaId) : null;

  const certificado = {
    certificado: 'licenca-0001sensations-fisica', versao: VERSAO,
    obra: { id: obra.id, titulo: obra.titulo, ano: obra.ano, sha256: obra.sha256, descricao_visivel: obra.descricao_visivel },
    tipo_licenca: lic.key, direitos: lic.direitos, licenciado: payer, valor: `${lic.usdc} USDC`,
    prova_pagamento: { tx_hash: txHash, chain: 'base-mainnet', chain_id: CHAIN_ID, token: USDC_BASE, destino: WALLET, via },
    autor: { nome: 'Jorge Silva Martins', identidade_onchain: 'jasm43.base.eth', wallet: WALLET },
    acesso_a_fotografia: acesso ?? { erro: 'fotografia ainda nao preservada para esta obra -- licenca emitida, acesso a imagem pendente' },
    emitida_em: new Date().toISOString(), valida_ate: validaAte,
    truth_machine: truthMachineCatalogo(),
    boundaries_machine: boundariesMachineLicenca(),
    aviso: 'Esta licenca nao transfere a propriedade da obra fisica original, direitos autorais integrais, exclusividade, nem qualquer NFT. O licenciado recebe uma fotografia digital preservada da obra, identificada pelo seu SHA-256 -- nao os bytes originais da obra fisica em si.',
  };
  if (licencaId) await fetch(`${SUPABASE_URL}/rest/v1/ora_licencas_fisicas?id=eq.${licencaId}`, { method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ certificado }) });

  const services = await sbSelect('x402_services', `sku=eq.${lic.sku}&select=id`);
  if (Array.isArray(services) && services.length > 0) await sbInsert('x402_orders', { service_id: services[0].id, buyer_actor: payer, protocol: 'x402', external_id: txHash, status: 'paid', payment_tx_hash: txHash, total_amount: Number(lic.usdc), currency: 'USDC' });

  return new Response(JSON.stringify({ acesso: 'concedido', licenca: certificado }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'PAYMENT-RESPONSE': b64json({ success: true, transaction: txHash, network: CAIP2_NETWORK, payer }), 'X-ORA-VERSION': VERSAO, 'Cache-Control': 'no-store' } });
}

async function historicoNftArquivo() {
  const total = await sbCount('ora_nft_0001sensations', 'select=token_id');
  const comImagem = await sbCount('ora_nft_0001sensations', 'select=token_id&image_url=not.is.null');
  const naArca = await sbCount('ora_nft_0001sensations', 'select=token_id&imagem_arca=not.is.null');
  return { titulo: 'Arquivo historico NFT', total_tokens: total || 65, emitidos_em: 'Ethereum mainnet, Agosto de 2021', imagens_preservadas: naArca, apenas_registo_onchain: (total || 65) - comImagem, relacao_com_coleccao_fisica: 'sem correspondencia obra-a-obra assumida ou verificada com a coleccao fisica', disponivel_para_novas_licencas: false, nota: 'Estes 65 tokens continuam a existir e sao verificaveis on-chain, mas deixaram de ser objecto comercial actual da ORUM desde 04/08/2026. As 6 licencas emitidas sobre eles antes dessa data ficam preservadas como historico em licencas_0001, sem alteracao.', contrato_ethereum: NFT_CONTRACT };
}

async function catalogo(req: Request) {
  const fisicas = await sbSelect('ora_coleccao_fisica', 'select=id,titulo,ano,sha256,descricao_visivel,bytes_na_arca&order=id.asc');
  const lista = Array.isArray(fisicas) ? fisicas : [];
  const comFoto = lista.filter((f: any) => f.bytes_na_arca).length;
  return {
    arquivo: '0001sensations · coleccão fisica', autor: 'Jorge Silva Martins · Unum', ens: 'jasm43.base.eth', wallet: WALLET, periodo: '2011–2021',
    principio: 'Uma obra fisica original. Uma fotografia preservada. Um hash. Uma licenca.',
    total_obras: TOTAL_OBRAS_FISICAS, com_fotografia_preservada_privadamente: comFoto,
    obras: lista.map((f: any) => ({ id: f.id, titulo: f.titulo, ano: f.ano, sha256: f.sha256, descricao_visivel: f.descricao_visivel, fotografia_preservada: !!f.bytes_na_arca, fotografia_publica: false })),
    licencas: Object.values(LICENCAS).map((l) => ({ tipo: l.key, sku: l.sku, preco: `${l.usdc} USDC`, duracao_da_licenca: l.dias ? `${l.dias} dias` : 'perpetua', duracao_do_acesso_a_imagem: `${l.acesso_segundos}s (URL assinada, gerada apos pagamento)`, direitos: l.direitos, descricao: l.descricao, endpoint: resourceUrlFor(req, l) })),
    licenciamento_nao_exclusivo: 'Nenhuma licenca e exclusiva. Nao ha limite ao numero de vezes que uma obra pode ser licenciada.',
    truth_machine: truthMachineCatalogo(),
    boundaries_machine: boundariesMachineLicenca(),
    aviso: 'As fotografias nao sao publicas. O catalogo mostra metadados e hash para verificacao de integridade, nunca os bytes. Uma licenca paga gera uma URL assinada de curta duracao para a fotografia especifica licenciada.',
    arquivo_historico_nft: await historicoNftArquivo(),
    facilitador_cdp: CDP_DISPONIVEL,
    timestamp: new Date().toISOString(),
  };
}

async function amostra(req: Request) {
  const obra = await encontrarObraFisica(null);
  return { amostra: 'gratuita', nota: 'Metadados de uma obra fisica real, sem imagem -- as fotografias sao privadas. Para aceder a fotografia, adquire uma licenca.', obra: obra ? { id: obra.id, titulo: obra.titulo, ano: obra.ano, sha256: obra.sha256, descricao_visivel: obra.descricao_visivel, fotografia_preservada: !!obra.bytes_na_arca } : null, proveniencia: { autor: 'Jorge Silva Martins · Unum · jasm43.base.eth', ia_generativa: false, periodo: '2011–2021' }, licenciar: Object.values(LICENCAS).map((l) => ({ tipo: l.key, preco: `${l.usdc} USDC`, endpoint: resourceUrlFor(req, l) })), catalogo_completo: publicoUrl(req, 'catalogo'), timestamp: new Date().toISOString() }; }

async function nucleo(req: Request): Promise<Response> {
  const url = new URL(req.url); const path = url.pathname; const obraQuery = url.searchParams.get('obra');
  if (path.endsWith('/verificar')) {
    const tx = url.searchParams.get('tx');
    if (!tx) return new Response(JSON.stringify({ erro: 'parametro tx em falta' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const rows = await sbSelect('ora_licencas_fisicas', `tx_hash=eq.${tx}&revogada_em=is.null&select=obra_titulo,tipo_licenca,licenciado,valor_usdc,emitida_em,valida_ate`);
    if (!Array.isArray(rows) || rows.length === 0) return new Response(JSON.stringify({ valida: false, motivo: 'licenca nao encontrada ou revogada' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const l = rows[0]; const expirada = l.valida_ate && new Date(l.valida_ate) < new Date();
    return new Response(JSON.stringify({ valida: !expirada, expirada: !!expirada, licenca: l }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (path.endsWith('/amostra')) return new Response(JSON.stringify(await amostra(req)), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (path.endsWith('/catalogo') || path.endsWith('/eco') || path.endsWith('/ora-licenca') || path.endsWith('/ora-licenca/')) return new Response(JSON.stringify(await catalogo(req)), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } });
  if (path.includes('well-known')) return new Response(JSON.stringify({ x402Version: 2, truth_machine: truthMachineCatalogo(), boundaries_machine: boundariesMachineLicenca(), resources: Object.values(LICENCAS).map((l) => { const ru = resourceUrlFor(req, l); return { resource: ru, type: 'http', method: 'GET', description: `0001sensations · ${l.descricao} · ${l.usdc} USDC`, accepts: acceptsFor(l, ru), extensions: bazaarExtensionFor(l, ru) }; }), free_sample: publicoUrl(req, 'amostra'), free_catalog: publicoUrl(req, 'catalogo'), timestamp: new Date().toISOString() }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });

  let lic: Lic | null = null;
  if (path.endsWith('/consulta')) lic = LICENCAS.consulta; else if (path.endsWith('/editorial')) lic = LICENCAS.editorial; else if (path.endsWith('/treino')) lic = LICENCAS.treino;
  else if (path.endsWith('/preview')) return new Response(null, { status: 307, headers: { ...CORS, 'Location': resourceUrlFor(req, LICENCAS.consulta, obraQuery), 'X-ORA-VERSION': VERSAO } });
  else if (path.endsWith('/arquivo')) return new Response(null, { status: 307, headers: { ...CORS, 'Location': publicoUrl(req, 'catalogo'), 'X-ORA-VERSION': VERSAO } });
  if (!lic) return new Response(JSON.stringify(await catalogo(req)), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const hasPayment = req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE');
  if (!hasPayment) return paymentRequired(req, lic, obraQuery);

  const parsed = parsePaymentHeader(hasPayment);
  if (CDP_DISPONIVEL && pareceX402V2Cdp(parsed)) {
    const resourceUrlStr = resourceUrlFor(req, lic, obraQuery);
    const r = await verificarESettleViaCdp(parsed as PagamentoV2, lic, resourceUrlStr);
    if (!r.ok) return new Response(JSON.stringify({ erro: 'pagamento invalido (via CDP)', detalhe: r.erro }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const claim = await claimPagamento({ tx_hash: r.txHash, payer: r.payer, amount: lic.atomic.toString(), currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain', via: 'cdp-facilitador' });
    if (claim.ok === 'duplicate') return new Response(JSON.stringify({ erro: 'tx_hash ja reivindicado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    return emitirLicenca(lic, obraQuery, r.txHash, r.payer, 'cdp-facilitador');
  }

  const th = extrairTxHash(hasPayment);
  if (!th) return new Response(JSON.stringify({ erro: 'prova de pagamento sem transactionHash valido' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const v = await verifyOnChain(th, lic);
  if (!v.valid) { if (v.pending) return paymentPending(lic, th); return new Response(JSON.stringify({ erro: 'pagamento invalido', detalhe: v.error }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
  const claim = await claimPagamento({ tx_hash: th, payer: v.payer, amount: v.amount, currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
  if (claim.ok === 'duplicate') return new Response(JSON.stringify({ erro: 'tx_hash ja reivindicado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
  return emitirLicenca(lic, obraQuery, th, v.payer!);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  let resp: Response;
  try { resp = await nucleo(req); }
  catch (e) { resp = new Response(JSON.stringify({ erro: 'erro interno', detalhe: String((e as Error)?.message || e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
  try {
    const url = new URL(req.url); const path = url.pathname;
    const acessoInfo = { servico: 'ora-licenca', tier: (path.match(/\/(consulta|editorial|treino|preview|arquivo)(?:$|[\/?])/) || [])[1] || null, path, metodo: req.method, user_agent: req.headers.get('user-agent'), tem_pagamento: !!(req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE')), status_code: resp.status };
    sbInsert('ora_acessos_log', acessoInfo);
  } catch (_) {}
  return resp;
});

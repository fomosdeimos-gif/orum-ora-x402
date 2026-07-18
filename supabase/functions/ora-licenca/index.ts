import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · LICENCA · V16 — a alavanca real da Bazaar: o outputSchema e
// coisas do genero sao v1 (descontinuado). O que a Bazaar CDP v2 le e
// extensions.bazaar dentro do objecto enviado a /verify e /settle. Sem
// isso, mesmo settles reais confirmados nunca cataloga. Adicionado aqui.
// Indexacao acontece no primeiro settle bem sucedido DEPOIS deste deploy
// (ate 10min de cache, por documentacao oficial CDP).

const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CAIP2_NETWORK = 'eip155:8453';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const NFT_CONTRACT = '0xC100Fd6E3B557E8A2b97A68C53689C4925F4dD22';
const OPENSEA_URL = 'https://opensea.io/collection/0001sensations';
const ZORA_URL = 'https://zora.co/@valium';
const SAATCHI_URL = 'https://www.saatchiart.com/en-pt/account/profile/2977075';
const CDP_HOST = 'api.cdp.coinbase.com';
const CDP_BASE_PATH = '/platform/v2/x402';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES' };

function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }

type LicKey = 'preview' | 'editorial' | 'treino' | 'arquivo';
interface Lic { key: LicKey; sku: string; usdc: string; atomic: bigint; dias: number | null; descricao: string; direitos: string[]; }
const LICENCAS: Record<LicKey, Lic> = {
  preview: { key: 'preview', sku: 'ora-licenca-preview', usdc: '1.618', atomic: 1618000n, dias: 30, descricao: 'Avaliação · resolução de estudo · 30 dias · uso interno', direitos: ['visualizacao-interna', 'avaliacao'] },
  editorial: { key: 'editorial', sku: 'ora-licenca-editorial', usdc: '16.18', atomic: 16180000n, dias: null, descricao: 'Editorial perpétua · publicação single-use com atribuição', direitos: ['publicacao-digital', 'publicacao-impressa', 'single-use', 'atribuicao-obrigatoria'] },
  treino: { key: 'treino', sku: 'ora-licenca-treino', usdc: '161.80', atomic: 161800000n, dias: null, descricao: 'Treino IA perpétua · inclusão em dataset · proveniência humana verificada', direitos: ['ai-training', 'dataset-inclusion', 'proveniencia-documentada'] },
  arquivo: { key: 'arquivo', sku: 'ora-licenca-arquivo', usdc: '10000.00', atomic: 10000000000n, dias: null, descricao: 'Corpus documentado 0001sensations · Treino IA perpétua · metadados e direitos das 100 obras · imagem entregue de facto apenas para as obras ja tokenizadas', direitos: ['ai-training', 'dataset-inclusion', 'corpus-completo-100-obras-metadata', 'proveniencia-documentada'] },
};

function comoPagar(lic: Lic | null) {
  const preco = lic ? `${lic.usdc} USDC` : '<preco da licenca>';
  const endpoint = lic ? `${SUPABASE_URL}/functions/v1/ora-licenca/${lic.key}${lic.key === 'arquivo' ? '' : '?obra=TITULO_OU_ID'}` : `${SUPABASE_URL}/functions/v1/ora-licenca/{preview|editorial|treino}?obra=TITULO_OU_ID`;
  return {
    passo_1: `Transfere ${preco} (contrato USDC ${USDC_BASE}) na rede Base (chain_id ${CHAIN_ID}) para ${WALLET} (jasm43.base.eth).`,
    passo_2: 'Guarda o transaction hash (0x…, 66 caracteres).',
    passo_3: `Repete o GET a ${endpoint} com o cabeçalho X-PAYMENT contendo base64 de {"transactionHash":"0x…"}. JSON puro também aceite.`,
    exemplo: 'X-PAYMENT: ' + btoa('{"transactionHash":"0xTEU_HASH_AQUI"}'),
    caminho_alternativo: 'Também aceite: autorização assinada EIP-3009 (facilitador CDP) — X-PAYMENT com {"payload":{"signature":"0x...","authorization":{...}}}',
    se_pendente: 'Resposta 402 com x402:"pending" significa tx ainda não indexada — repete após retry_after_seconds.',
    catalogo_gratuito: `${SUPABASE_URL}/functions/v1/ora-licenca/catalogo`,
    verificacao: 'On-chain directa (multi-RPC Base) OU facilitador CDP.',
  };
}

function sbHeaders(extra: Record<string, string> = {}) { return { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra }; }
async function sbSelect(table: string, query: string) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); return await r.json(); } catch { return []; } }
async function sbInsert(table: string, row: Record<string, unknown>) { try { await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(row) }); } catch (_) {} }

async function claimPagamento(row: Record<string, unknown>): Promise<{ ok: 'claimed' | 'duplicate' | 'unknown'; status?: number; body?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ora_pagamentos`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ ...row, registado_em: new Date().toISOString() }) });
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

async function txJaUsada(txHash: string): Promise<boolean> {
  const licencas = await sbSelect('licencas_0001', `tx_hash=eq.${txHash}&select=id`);
  if (Array.isArray(licencas) && licencas.length > 0) return true;
  const pagamentos = await sbSelect('ora_pagamentos', `tx_hash=eq.${txHash}&status=eq.verificado_onchain&select=id`);
  return Array.isArray(pagamentos) && pagamentos.length > 0;
}

interface VerifyResult { valid: boolean; pending?: boolean; payer?: string; amount?: string; error?: string; }

async function verifyOnChain(txHash: string, lic: Lic): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { valid: false, error: 'hash invalido' };
  if (await txJaUsada(txHash)) return { valid: false, error: 'tx_hash ja utilizado' };
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
  if (!transferLog) return { valid: false, error: 'sem transferencia USDC para a carteira sagrada' };
  const payer = '0x' + transferLog.topics[1].slice(-40);
  const amountAtomic = BigInt(transferLog.data);
  if (amountAtomic < lic.atomic) return { valid: false, error: `valor insuficiente para ${lic.key}: recebido ${amountAtomic}, requerido ${lic.atomic}` };
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

async function cdpCall(kind: 'verify' | 'settle', id: string, secret: string, paymentPayload: unknown, paymentRequirements: unknown, resourceUrl: string): Promise<{ status: number; json: any; extensionResponses: string | null }> {
  const path = `${CDP_BASE_PATH}/${kind}`;
  const jwt = await buildCdpJwt(id, secret, 'POST', CDP_HOST, path);
  const r = await fetch(`https://${CDP_HOST}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements, resource: { url: resourceUrl } }) });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json, extensionResponses: r.headers.get('EXTENSION-RESPONSES') };
}

// Extensao Bazaar (v2, oficial) — sem isto, a Bazaar CDP nunca cataloga,
// mesmo com settles reais confirmados (outputSchema e v1, descontinuado).
function bazaarExtensionFor(lic: Lic) {
  const exampleQuery: Record<string, string> = lic.key === 'arquivo' ? {} : { obra: 'presenca' };
  return {
    bazaar: {
      info: {
        input: { type: 'http', method: 'GET', queryParams: exampleQuery },
        output: { type: 'json', example: { acesso: 'concedido', licenca: { certificado: 'licenca-0001sensations', tipo_licenca: lic.key, valor: `${lic.usdc} USDC` } } },
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

async function tentarViaCdp(lic: Lic, resourceUrl: string, clientPayload: { signature: string; authorization: Record<string, unknown> }): Promise<VerifyResult & { txHash?: string; extensionResponses?: string | null }> {
  const { id, secret } = parseCdpSecret();
  if (!id || !secret) return { valid: false, error: 'facilitador CDP nao configurado' };
  const requirements = { scheme: 'exact', network: CAIP2_NETWORK, asset: USDC_BASE, amount: lic.atomic.toString(), payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(lic) };
  const paymentPayload = { x402Version: 2, scheme: 'exact', network: CAIP2_NETWORK, accepted: requirements, payload: clientPayload };
  const verify = await cdpCall('verify', id, secret, paymentPayload, requirements, resourceUrl);
  if (verify.status !== 200 || !verify.json?.isValid) return { valid: false, error: verify.json?.errorMessage || verify.json?.invalidReason || `verify falhou (status ${verify.status}): ${JSON.stringify(verify.json)}` };
  const settle = await cdpCall('settle', id, secret, paymentPayload, requirements, resourceUrl);
  if (settle.status !== 200 || !settle.json?.success) return { valid: false, error: settle.json?.errorReason || `settle falhou (status ${settle.status}): ${JSON.stringify(settle.json)}` };
  await sbInsert('ora_moltbook_log', { kind: 'info', ref_id: settle.json.transaction ?? 'sem-tx', detail: { stage: 'bazaar_extension_responses', licenca: lic.key, verify_extension_responses: verify.extensionResponses, settle_extension_responses: settle.extensionResponses } });
  return { valid: true, payer: settle.json.payer ?? verify.json.payer, txHash: settle.json.transaction, extensionResponses: settle.extensionResponses };
}

// Formato canonico de input/output schema — o que x402scan e agentes esperam.
function outputSchemaFor(lic: Lic) {
  const queryParams: Record<string, unknown> = {};
  if (lic.key !== 'arquivo') {
    queryParams.obra = { type: 'string', required: false, description: 'Titulo ou ID da obra 0001sensations a licenciar. Opcional: sem obra, a licenca e emitida para obra a designar do arquivo.' };
  }
  return {
    input: {
      type: 'http',
      method: 'GET',
      discoverable: true,
      ...(Object.keys(queryParams).length > 0 ? { queryParams } : {}),
      headerFields: {
        'X-PAYMENT': { type: 'string', required: false, description: 'Prova de pagamento x402: base64 de {"transactionHash":"0x..."} (tx USDC confirmada na Base) ou base64 de {"payload":{"signature":"0x...","authorization":{...}}} (EIP-3009 via facilitador CDP). Preenchido automaticamente por clientes x402.' },
      },
    },
    output: {
      type: 'object',
      properties: {
        acesso: 'string',
        licenca: { certificado: 'string', obra: 'object', tipo_licenca: 'string', direitos: 'array', licenciado: 'string', valor: 'string', prova_pagamento: 'object', autor: 'object', emitida_em: 'string', valida_ate: 'string|null' },
      },
    },
  };
}

function paymentRequired(lic: Lic, obra: string | null) {
  const resourceUrlStr = `${SUPABASE_URL}/functions/v1/ora-licenca/${lic.key}${obra && lic.key !== 'arquivo' ? '?obra=' + encodeURIComponent(obra) : ''}`;
  const canonical = { x402Version: 2, error: 'X-PAYMENT header required', resource: { url: resourceUrlStr, description: `0001sensations · ${lic.descricao}`, mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network: CAIP2_NETWORK, amount: lic.atomic.toString(), asset: USDC_BASE, payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: outputSchemaFor(lic), extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(lic) }] };
  return new Response(JSON.stringify({
    x402Version: 2, error: 'X-PAYMENT header required',
    accepts: [{ scheme: 'exact', network: CAIP2_NETWORK, amount: lic.atomic.toString(), maxAmountRequired: lic.atomic.toString(), resource: resourceUrlStr, description: `0001sensations · ${lic.descricao}`, mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE, outputSchema: outputSchemaFor(lic), extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(lic), 'x-orum': { name: '0001sensations · ORUM', licenca: lic.key, amount: `${lic.usdc} USDC`, autor: 'Jorge Silva Martins · Unum · jasm43.base.eth' } }],
    como_pagar: comoPagar(lic), catalogo_gratuito: `${SUPABASE_URL}/functions/v1/ora-licenca/catalogo`,
  }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': b64json(canonical), 'WWW-Authenticate': `x402 realm="0001sensations · ${lic.key}", amount="${lic.usdc} USDC", payTo="${WALLET}", chain_id="${CHAIN_ID}", asset="${USDC_BASE}"`, 'X-ORA-VERSION': 'V16' } });
}
function paymentPending(lic: Lic, txHash: string) {
  return new Response(JSON.stringify({ x402: 'pending', licenca: lic.key, tx_hash: txHash, detalhe: 'tx ainda nao indexada na rede Base — nao foi consumida, repete o mesmo pedido', retry_after_seconds: 6 }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '6', 'X-ORA-VERSION': 'V16', 'X-ORA-X402': 'pending' } });
}

async function catalogo() {
  const nfts = await sbSelect('ora_nft_0001sensations', 'select=token_id,nome,owner_atual,dedicado_a&order=token_id.asc');
  const nftCount = Array.isArray(nfts) ? nfts.length : 65;
  return {
    arquivo: '0001sensations', autor: 'Jorge Silva Martins · Unum', ens: 'jasm43.base.eth', wallet: WALLET, periodo: '2011–2021', total_obras_arquivo: 100,
    licencas: Object.values(LICENCAS).map((l) => ({ tipo: l.key, sku: l.sku, preco: `${l.usdc} USDC`, duracao: l.dias ? `${l.dias} dias` : 'perpétua', direitos: l.direitos, endpoint: `${SUPABASE_URL}/functions/v1/ora-licenca/${l.key}${l.key === 'arquivo' ? '' : '?obra=TITULO_OU_ID'}` })),
    obras_digitais_tokenizadas: { nota: `${nftCount} das 100 obras foram cunhadas como NFTs individuais em Ethereum mainnet, Agosto de 2021.`, contrato_ethereum: NFT_CONTRACT, total_items: nftCount, opensea: OPENSEA_URL, zora: ZORA_URL },
    obras_fisicas: { total: 100, tokenizadas_digitalmente: nftCount, a_venda_actualmente: 9, nota: 'Obras físicas originais: 9 à venda actualmente via Saatchi Art. As restantes não estão à venda.', saatchi: SAATCHI_URL },
    como_pagar: comoPagar(null),
    proveniencia: { tipo: 'obra física original humana', ia_generativa: false, periodo_criacao_fisica: '2011–2021', verificacao_pagamento: 'on-chain multi-RPC Base mainnet OU facilitador CDP' },
    timestamp: new Date().toISOString(),
  };
}

async function emitirLicenca(lic: Lic, obraQuery: string | null, txHash: string, payer: string, refCode: string | null, extensionResponses?: string | null) {
  let obra: { id?: string; titulo: string; ano?: number; token_id?: number; imagem_verificavel?: string | null } = { titulo: 'obra a designar · arquivo 0001sensations', imagem_verificavel: null };
  if (lic.key === 'arquivo') {
    obra = { titulo: 'corpus completo 0001sensations · 100 obras · imagem efectiva para as tokenizadas', imagem_verificavel: OPENSEA_URL };
  } else if (obraQuery) {
    const nftRows = await sbSelect('ora_nft_0001sensations', `nome=ilike.*${encodeURIComponent(obraQuery)}*&select=token_id,nome&limit=1`);
    if (Array.isArray(nftRows) && nftRows.length > 0) obra = { titulo: nftRows[0].nome, token_id: nftRows[0].token_id, imagem_verificavel: `${OPENSEA_URL} (token ${nftRows[0].token_id}) · ${ZORA_URL}` };
    else {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obraQuery);
      const rows = await sbSelect('nft_pipeline', isUuid ? `id=eq.${obraQuery}&select=id,titulo,ano` : `titulo=ilike.*${encodeURIComponent(obraQuery)}*&select=id,titulo,ano&limit=1`);
      if (Array.isArray(rows) && rows.length > 0) obra = { ...rows[0], imagem_verificavel: 'obra física — verificar disponibilidade em ' + SAATCHI_URL };
      else obra = { titulo: obraQuery, imagem_verificavel: null };
    }
  }
  const validaAte = lic.dias ? new Date(Date.now() + lic.dias * 86400000).toISOString() : null;
  const certificado = {
    certificado: 'licenca-0001sensations', versao: 'V16', arquivo: '0001sensations · Jorge Silva Martins · 2011–2021', obra, tipo_licenca: lic.key, direitos: lic.direitos, licenciado: payer, valor: `${lic.usdc} USDC`,
    prova_pagamento: { tx_hash: txHash, chain: 'base-mainnet', chain_id: CHAIN_ID, token: USDC_BASE, destino: WALLET },
    autor: { nome: 'Jorge Silva Martins', identidade_onchain: 'jasm43.base.eth', wallet: WALLET }, ia_generativa: false,
    atribuicao_requerida: lic.key === 'editorial' ? 'Jorge Silva Martins · 0001sensations · jasm43.base.eth' : null,
    emitida_em: new Date().toISOString(), valida_ate: validaAte,
    verificar_em: `${SUPABASE_URL}/functions/v1/ora-licenca/verificar?tx=${txHash}`,
    axioma: 'O símbolo é real e não pede prova — mas esta licença traz prova na mesma.',
  };
  await sbInsert('licencas_0001', { obra_id: obra.id ?? null, obra_titulo: obra.titulo, tipo_licenca: lic.key, licenciado: payer, tx_hash: txHash, valor_usdc: Number(lic.usdc), certificado, valida_ate: validaAte });
  const services = await sbSelect('x402_services', `sku=eq.${lic.sku}&select=id`);
  if (Array.isArray(services) && services.length > 0) {
    await sbInsert('x402_orders', { service_id: services[0].id, buyer_actor: payer, protocol: 'x402', external_id: txHash, status: 'paid', payment_tx_hash: txHash, total_amount: Number(lic.usdc), currency: 'USDC' });
    const orders = await sbSelect('x402_orders', `external_id=eq.${txHash}&select=id`);
    if (Array.isArray(orders) && orders.length > 0) await sbInsert('x402_entitlements', { order_id: orders[0].id, buyer_actor: payer, entitlement_key: `licenca-${lic.key}:${txHash}`, status: 'active', metadata: { obra: obra.titulo, tipo: lic.key } });
  }
  if (refCode) {
    const refs = await sbSelect('ora_partner_referrals', `referral_code=eq.${encodeURIComponent(refCode)}&select=partner_id`);
    if (Array.isArray(refs) && refs.length > 0) {
      const partners = await sbSelect('ora_partners', `id=eq.${refs[0].partner_id}&status=eq.active&select=id,default_commission_rate`);
      if (Array.isArray(partners) && partners.length > 0) {
        const rate = Number(partners[0].default_commission_rate ?? 0.10);
        await sbInsert('ora_partner_attributions', { referral_code: refCode, partner_id: refs[0].partner_id, transaction_id: txHash, source_platform: 'ora-licenca', metadata: { licenca: lic.key, obra: obra.titulo } });
        await sbInsert('ora_partner_revenue_lines', { partner_id: refs[0].partner_id, transaction_id: txHash, referral_code: refCode, amount_eur: Number(lic.usdc), currency: 'USDC', source_platform: 'ora-licenca' });
        await sbInsert('ora_partner_payouts', { partner_id: refs[0].partner_id, transaction_id: txHash, reward_eur: parseFloat((Number(lic.usdc) * rate).toFixed(6)), currency: 'USDC', commission_rate: rate, reward_status: 'pending', source: 'ora_partner_rewards' });
      }
    }
  }
  return new Response(JSON.stringify({ acesso: 'concedido', licenca: certificado }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Payment-Response': JSON.stringify({ txHash, status: 'settled', amount: lic.usdc }), 'PAYMENT-RESPONSE': b64json({ success: true, transaction: txHash, network: CAIP2_NETWORK, payer }), ...(extensionResponses ? { 'EXTENSION-RESPONSES': extensionResponses } : {}), 'X-ORA-VERSION': 'V16', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url); const path = url.pathname; const obraQuery = url.searchParams.get('obra'); const refCode = url.searchParams.get('ref');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const acessoInfo = { servico: 'ora-licenca', tier: (path.match(/\/(preview|editorial|treino|arquivo)(?:$|[\/?])/) || [])[1] || null, path, metodo: req.method, user_agent: req.headers.get('user-agent'), tem_pagamento: !!(req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE')) };
  sbInsert('ora_acessos_log', acessoInfo);
  fetch(`${SUPABASE_URL}/functions/v1/ora-acesso-notificar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(acessoInfo) }).catch(() => {});

  if (path.endsWith('/verificar')) {
    const tx = url.searchParams.get('tx');
    if (!tx) return new Response(JSON.stringify({ erro: 'parametro tx em falta' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const rows = await sbSelect('licencas_0001', `tx_hash=eq.${tx}&revogada_em=is.null&select=obra_titulo,tipo_licenca,licenciado,valor_usdc,certificado,emitida_em,valida_ate`);
    if (!Array.isArray(rows) || rows.length === 0) return new Response(JSON.stringify({ valida: false, motivo: 'licenca nao encontrada ou revogada' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const l = rows[0]; const expirada = l.valida_ate && new Date(l.valida_ate) < new Date();
    return new Response(JSON.stringify({ valida: !expirada, expirada: !!expirada, licenca: l }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (path.endsWith('/catalogo') || path.endsWith('/eco') || path.endsWith('/ora-licenca') || path.endsWith('/ora-licenca/')) return new Response(JSON.stringify(await catalogo()), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });

  if (path.includes('well-known')) {
    return new Response(JSON.stringify({ x402Version: 2, resources: Object.values(LICENCAS).map((l) => ({ resource: `${SUPABASE_URL}/functions/v1/ora-licenca/${l.key}`, type: 'http', method: 'GET', description: `0001sensations · ${l.descricao} · ${l.usdc} USDC`, accepts: [{ scheme: 'exact', network: CAIP2_NETWORK, amount: l.atomic.toString(), maxAmountRequired: l.atomic.toString(), resource: `${SUPABASE_URL}/functions/v1/ora-licenca/${l.key}`, description: l.descricao, mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE, outputSchema: outputSchemaFor(l), extra: { name: 'USD Coin', version: '2' }, extensions: bazaarExtensionFor(l) }] })), free_catalog: `${SUPABASE_URL}/functions/v1/ora-licenca/catalogo`, timestamp: new Date().toISOString() }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  }

  let lic: Lic | null = null;
  if (path.endsWith('/preview')) lic = LICENCAS.preview; else if (path.endsWith('/editorial')) lic = LICENCAS.editorial; else if (path.endsWith('/treino')) lic = LICENCAS.treino; else if (path.endsWith('/arquivo')) lic = LICENCAS.arquivo;
  if (!lic) return new Response(JSON.stringify(await catalogo()), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const hasPayment = req.headers.get('X-PAYMENT') || req.headers.get('X-Payment') || req.headers.get('PAYMENT-SIGNATURE');
  if (!hasPayment) return paymentRequired(lic, obraQuery);

  const parsed = parsePaymentHeader(hasPayment);
  if (!parsed) return new Response(JSON.stringify({ erro: 'X-PAYMENT ilegivel', como_pagar: comoPagar(lic) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const cdpPayload = isCdpStylePayload(parsed);
  let txHash: string | null = null; let payer: string | null = null; let extResponses: string | null | undefined = null;
  const resourceUrlStr = `${SUPABASE_URL}/functions/v1/ora-licenca/${lic.key}`;

  if (cdpPayload) {
    const r = await tentarViaCdp(lic, resourceUrlStr, cdpPayload);
    if (!r.valid) return new Response(JSON.stringify({ erro: 'pagamento invalido (CDP)', detalhe: r.error, como_pagar: comoPagar(lic) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    txHash = r.txHash ?? null; payer = r.payer ?? null; extResponses = r.extensionResponses;
    if (!txHash || !payer) return new Response(JSON.stringify({ erro: 'facilitador CDP nao devolveu tx_hash/payer' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const claim = await claimPagamento({ tx_hash: txHash, payer, amount: lic.atomic.toString(), currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
    if (claim.ok === 'duplicate') return new Response(JSON.stringify({ erro: 'tx_hash ja reivindicado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (claim.ok === 'unknown') await sbInsert('ora_moltbook_log', { kind: 'error', ref_id: txHash, detail: { stage: 'claimPagamento_licenca', status: claim.status, body: claim.body } });
  } else {
    const th = extrairTxHash(hasPayment);
    if (!th) return new Response(JSON.stringify({ erro: 'X-PAYMENT sem transactionHash nem payload CDP valido', como_pagar: comoPagar(lic) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const v = await verifyOnChain(th, lic);
    if (!v.valid) { if (v.pending) return paymentPending(lic, th); return new Response(JSON.stringify({ erro: 'pagamento invalido', detalhe: v.error, como_pagar: comoPagar(lic) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
    const claim = await claimPagamento({ tx_hash: th, payer: v.payer, amount: v.amount, currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain' });
    if (claim.ok === 'duplicate') return new Response(JSON.stringify({ erro: 'tx_hash ja reivindicado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
    txHash = th; payer = v.payer!;
  }

  return emitirLicenca(lic, obraQuery, txHash!, payer!, refCode, extResponses);
});

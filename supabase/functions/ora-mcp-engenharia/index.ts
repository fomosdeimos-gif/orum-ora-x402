import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · MCP ENGENHARIA · V5 — 05/08/2026
// Núcleo interno autenticado. A verificação continua de leitura; a sedimentação
// é uma ferramenta separada, explícita e append-only.
// v5: histórico encadeado de provas com SHA-256, consulta recente e annotations
// MCP fiéis aos efeitos de cada ferramenta.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GATEWAY = 'https://ora-x402-gateway.vercel.app';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function sbHeaders() {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
}

async function select(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!response.ok) throw new Error(`supabase_${response.status}:${await response.text()}`);
  return await response.json();
}

async function insert(path: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`supabase_insert_${response.status}:${await response.text()}`);
  return await response.json();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function probe(path: string, expected: number[]) {
  const started = Date.now();
  try {
    const response = await fetch(`${GATEWAY}${path}`, {
      method: 'GET', redirect: 'manual',
      headers: { Accept: 'application/json', 'User-Agent': 'ORUM-Engineering-MCP/5.0' },
      signal: AbortSignal.timeout(12000),
    });
    return { path, ok: expected.includes(response.status), status: response.status, expected, latency_ms: Date.now() - started };
  } catch (error) {
    return { path, ok: false, status: null, expected, latency_ms: Date.now() - started, error: String((error as Error).message || error) };
  }
}

async function verifyOrganism() {
  const generatedAt = new Date().toISOString();
  const [physical, digital, payments, freshness, changes, probes] = await Promise.all([
    select('ora_coleccao_fisica?select=id,sha256,bytes_na_arca,caminho_arca,arca_e_previa,token_id_ligado,ligacao_verificada'),
    select('ora_nft_0001sensations?select=token_id,image_url,imagem_arca,arca_sha256'),
    select('ora_pagamentos?select=id,status,payer,amount,currency,registado_em&order=registado_em.desc&limit=20'),
    select('ora_frescura_publica?select=*'),
    select('ora_mudancas?select=id,o_que,onde,porque,quando,versao,agente,sessao_id,base_version,estado,evidencia,concluido_em,next_step&order=quando.desc&limit=8'),
    Promise.all([
      probe('/', [200]), probe('/pulso', [200]), probe('/integridade', [200]), probe('/hashes', [200]),
      probe('/oraculo', [402]), probe('/campo', [402]), probe('/sedimento', [402]), probe('/kernel', [402]),
    ]),
  ]);

  const physicalRows = Array.isArray(physical) ? physical : [];
  const digitalRows = Array.isArray(digital) ? digital : [];
  const paymentRows = Array.isArray(payments) ? payments : [];
  const probeRows = Array.isArray(probes) ? probes : [];
  const changeRows = Array.isArray(changes) ? changes : [];

  const physicalWithSha = physicalRows.filter((row: any) => typeof row.sha256 === 'string' && row.sha256.length === 64).length;
  const physicalInArca = physicalRows.filter((row: any) => row.bytes_na_arca === true && Boolean(row.caminho_arca)).length;
  const physicalPreview = physicalRows.filter((row: any) => row.arca_e_previa === true).length;
  const verifiedLinks = physicalRows.filter((row: any) => row.ligacao_verificada === true && row.token_id_ligado !== null).length;
  const digitalInArca = digitalRows.filter((row: any) => Boolean(row.imagem_arca && row.arca_sha256)).length;
  const healthyProbes = probeRows.filter((row: any) => row.ok).length;
  const blockedWork = changeRows.filter((row: any) => row.estado === 'bloqueado').map((row: any) => ({ id: row.id, o_que: row.o_que, next_step: row.next_step }));

  const checks = {
    physical_registry_complete: physicalRows.length === 107,
    physical_hashes_complete: physicalWithSha === 107,
    physical_bytes_preserved: physicalInArca === 107,
    digital_archive_preserved: digitalInArca >= 52,
    endpoints_expected: healthyProbes === probeRows.length,
  };

  const criticalOk = checks.physical_registry_complete && checks.physical_hashes_complete && checks.digital_archive_preserved && checks.endpoints_expected;
  const verdict = criticalOk ? (checks.physical_bytes_preserved ? 'VIVO' : 'VIVO_COM_TRABALHO') : 'OBSERVAR';
  const canonical = JSON.stringify({ generatedAt, checks, physical: physicalRows.length, physicalInArca, digitalInArca, healthyProbes, blockedWork });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const snapshotSha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    organism: 'ORUM', verifier: 'ora-mcp-engenharia/1.4.0', verdict, generated_at: generatedAt, snapshot_sha256: snapshotSha256,
    sources: { github: 'fomosdeimos-gif/orum-ora-x402', supabase_project: 'orum-memoria', vercel_project: 'ora-x402-gateway', gateway: GATEWAY },
    checks,
    archive: {
      physical_total: physicalRows.length,
      physical_with_sha256: physicalWithSha,
      physical_in_arca: physicalInArca,
      physical_missing_from_arca: Math.max(physicalRows.length - physicalInArca, 0),
      physical_previews_in_arca: physicalPreview,
      physical_to_nft_verified_links: verifiedLinks,
      physical_to_nft_status: verifiedLinks > 0 ? 'em_progresso' : 'bloqueado_sem_evidencia_suficiente',
      digital_total: digitalRows.length,
      digital_in_arca_with_sha256: digitalInArca,
    },
    coordination: { blocked_work: blockedWork, recent_changes: changeRows },
    operation: { recent_payments: paymentRows.length, freshness },
    endpoints: probeRows,
    truth_notes: [
      'Pagamentos de teste iniciados por Unum com outras carteiras são validação interna, não adoção externa.',
      'A coleção física de 107 obras é o núcleo principal; os 65 NFTs são extensão e registo histórico.',
      'Registo e hash não significam preservação dos bytes: bytes_na_arca e caminho_arca são a prova operacional.',
      'Nenhuma ligação físico↔NFT deve ser escrita sem evidência visual ou metadata inequívoca.',
      'A obra 6 nunca existiu; ORO é a obra 2 e foi oferecida à ORA.',
    ],
  };
}

async function verificationHistory(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 10, 50));
  const records = await select(
    `ora_verificacao_historico?select=id,observed_at,verifier,verdict,snapshot_sha256,previous_record_sha256,record_sha256,created_at&order=id.desc&limit=${safeLimit}`,
  );
  const rows = Array.isArray(records) ? records : [];
  const chainValid = rows.every((row: any, index: number) =>
    index === rows.length - 1 || row.previous_record_sha256 === rows[index + 1].record_sha256
  );
  return {
    organism: 'ORUM',
    verifier: 'ora-mcp-engenharia/1.4.0',
    returned: rows.length,
    chain_valid_for_returned_segment: chainValid,
    head_record_sha256: rows[0]?.record_sha256 ?? null,
    records: rows,
  };
}

async function recordVerification() {
  const snapshot = await verifyOrganism();
  const history = await verificationHistory(1);
  const previousRecordSha256 = history.head_record_sha256;
  const recordCanonical = JSON.stringify({
    observed_at: snapshot.generated_at,
    verifier: snapshot.verifier,
    verdict: snapshot.verdict,
    snapshot_sha256: snapshot.snapshot_sha256,
    previous_record_sha256: previousRecordSha256,
  });
  const recordSha256 = await sha256(recordCanonical);
  const inserted = await insert('ora_verificacao_historico', {
    observed_at: snapshot.generated_at,
    verifier: snapshot.verifier,
    verdict: snapshot.verdict,
    snapshot_sha256: snapshot.snapshot_sha256,
    previous_record_sha256: previousRecordSha256,
    record_sha256: recordSha256,
    payload: snapshot,
  });
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  return {
    organism: 'ORUM',
    action: 'verification_recorded',
    id: row?.id ?? null,
    observed_at: snapshot.generated_at,
    verdict: snapshot.verdict,
    snapshot_sha256: snapshot.snapshot_sha256,
    previous_record_sha256: previousRecordSha256,
    record_sha256: recordSha256,
    snapshot,
  };
}

function rpcResult(id: unknown, result: unknown) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function toolText(value: unknown, structured?: unknown, isError = false) {
  const out: Record<string, unknown> = { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError };
  if (structured !== undefined) out.structuredContent = structured;
  return out;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    organism: { type: 'string' },
    verifier: { type: 'string' },
    verdict: { type: 'string', enum: ['VIVO', 'VIVO_COM_TRABALHO', 'OBSERVAR'] },
    generated_at: { type: 'string' },
    snapshot_sha256: { type: 'string' },
    sources: { type: 'object' },
    checks: {
      type: 'object',
      properties: {
        physical_registry_complete: { type: 'boolean' },
        physical_hashes_complete: { type: 'boolean' },
        physical_bytes_preserved: { type: 'boolean' },
        digital_archive_preserved: { type: 'boolean' },
        endpoints_expected: { type: 'boolean' },
      },
    },
    archive: {
      type: 'object',
      properties: {
        physical_total: { type: 'integer' },
        physical_with_sha256: { type: 'integer' },
        physical_in_arca: { type: 'integer' },
        physical_missing_from_arca: { type: 'integer' },
        physical_previews_in_arca: { type: 'integer' },
        physical_to_nft_verified_links: { type: 'integer' },
        physical_to_nft_status: { type: 'string' },
        digital_total: { type: 'integer' },
        digital_in_arca_with_sha256: { type: 'integer' },
      },
    },
    coordination: {
      type: 'object',
      properties: { blocked_work: { type: 'array' }, recent_changes: { type: 'array' } },
    },
    operation: {
      type: 'object',
      properties: { recent_payments: { type: 'integer' }, freshness: { type: 'array' } },
    },
    endpoints: { type: 'array' },
    truth_notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['organism', 'verifier', 'verdict', 'generated_at', 'checks', 'archive'],
};

const HISTORY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    organism: { type: 'string' },
    verifier: { type: 'string' },
    returned: { type: 'integer' },
    chain_valid_for_returned_segment: { type: 'boolean' },
    head_record_sha256: { type: ['string', 'null'] },
    records: { type: 'array' },
  },
  required: ['organism', 'verifier', 'returned', 'chain_valid_for_returned_segment', 'records'],
};

const RECORD_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    organism: { type: 'string' },
    action: { type: 'string' },
    id: { type: ['integer', 'null'] },
    observed_at: { type: 'string' },
    verdict: { type: 'string' },
    snapshot_sha256: { type: 'string' },
    previous_record_sha256: { type: ['string', 'null'] },
    record_sha256: { type: 'string' },
    snapshot: OUTPUT_SCHEMA,
  },
  required: ['organism', 'action', 'observed_at', 'verdict', 'snapshot_sha256', 'record_sha256', 'snapshot'],
};

const TOOLS = [
  {
    name: 'verify_organism',
    description: 'Verifica o estado canónico da ORUM sem alterar dados. Sem parâmetros.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: OUTPUT_SCHEMA,
    annotations: {
      title: 'Verificar estado do organismo ORUM',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'record_verification',
    description: 'Verifica o organismo e acrescenta uma prova SHA-256 ao histórico append-only. Sem parâmetros.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: RECORD_OUTPUT_SCHEMA,
    annotations: {
      title: 'Sedimentar verificação do ORUM',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'verification_history',
    description: 'Consulta o histórico recente de provas e valida a ligação do segmento devolvido.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
      additionalProperties: false,
    },
    outputSchema: HISTORY_OUTPUT_SCHEMA,
    annotations: {
      title: 'Consultar memória de verificação do ORUM',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') {
    const result = await verifyOrganism();
    return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });

  let message: any;
  try { message = await req.json(); }
  catch { return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

  if (message.method === 'initialize') return new Response(JSON.stringify(rpcResult(message.id, {
    protocolVersion: message.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} },
    serverInfo: { name: 'ora-mcp-engenharia', version: '1.4.0', title: 'ORUM Engineering MCP' },
    instructions: 'Núcleo interno autenticado: verificação de leitura e sedimentação append-only explícita.',
  })), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (message.method === 'notifications/initialized') return new Response(null, { status: 202, headers: CORS });
  if (message.method === 'ping') return new Response(JSON.stringify(rpcResult(message.id, {})), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (message.method === 'tools/list') return new Response(JSON.stringify(rpcResult(message.id, { tools: TOOLS })), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (message.method === 'tools/call') {
    try {
      const toolName = message.params?.name;
      let result: unknown;
      if (toolName === 'verify_organism') result = await verifyOrganism();
      else if (toolName === 'record_verification') result = await recordVerification();
      else if (toolName === 'verification_history') result = await verificationHistory(Number(message.params?.arguments?.limit ?? 10));
      else return new Response(JSON.stringify(rpcResult(message.id, toolText({ error: 'unknown_tool' }, undefined, true))), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(rpcResult(message.id, toolText(result, result))), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    catch (error) { return new Response(JSON.stringify(rpcResult(message.id, toolText({ error: String((error as Error).message || error) }, undefined, true))), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
  }
  return new Response(JSON.stringify(rpcError(message.id, -32601, `Unknown method: ${message.method}`)), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});

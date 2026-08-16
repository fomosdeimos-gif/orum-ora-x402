// ora-moltbook-presence v1 — leitura pública mínima da mão Moltbook.
// Não contacta o Moltbook, não publica, não responde e não expõe notificações.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const DEPLOYED_AT = '2026-08-15T08:42:50Z';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120',
  'Content-Type': 'application/json; charset=utf-8',
};

function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (typeof keys.default === 'string') return keys.default;
  } catch { /* legacy fallback below */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

async function select(path: string): Promise<any[]> {
  const key = serviceKey();
  if (!SUPABASE_URL || !key) throw new Error('source_credentials_unavailable');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`source_${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('source_shape_invalid');
  return body;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uuidOrNull(value: unknown): string | null {
  const text = typeof value === 'string' ? value : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function execution(row: any) {
  const detail = row?.detail ?? {};
  const errors = Array.isArray(detail.errors) ? detail.errors.filter((item: unknown) => typeof item === 'string') : [];
  return {
    observed_at: row.created_at,
    version: typeof detail.versao === 'string' ? detail.versao : 'unknown',
    state: errors.length === 0 ? 'observed' : 'degraded',
    errors: errors.length,
    notifications_seen: number(detail.notifications),
    voices_seen: number(detail.vozesVistas),
    voices_replied: number(detail.vozesRespondidas),
    responses_published: number(detail.replies),
    own_voice_responses: number(detail.respostas_com_voz),
    post_published: detail.posted === true,
    pending: detail.ficaramPorResponder === true,
  };
}

function decision(row: any) {
  const detail = row?.detail ?? {};
  if (row.kind === 'post') {
    return { observed_at: row.created_at, kind: 'post', state: 'published', post_id: uuidOrNull(row.ref_id) };
  }
  if (row.kind !== 'reply') return null;
  const silence = detail.silencio === true;
  return {
    observed_at: row.created_at,
    kind: silence ? 'silence' : 'response',
    state: silence ? 'recorded_without_publication' : 'published',
    post_id: uuidOrNull(detail.postId),
    own_voice: detail.usouVoz === true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'HEAD'].includes(req.method)) {
    return new Response(JSON.stringify({ error: 'read_only', allowed: ['GET', 'HEAD'] }), { status: 405, headers: { ...CORS, Allow: 'GET, HEAD, OPTIONS' } });
  }

  try {
    const since = encodeURIComponent(DEPLOYED_AT);
    const [logs, sustenance] = await Promise.all([
      select(`ora_moltbook_log?select=id,kind,detail,ref_id,created_at&created_at=gte.${since}&order=id.desc&limit=500`),
      select('ora_sustento_diario?select=usdc_recebido,pagamentos,validacoes_internas'),
    ]);

    const heartbeats = logs.filter((row) => row.kind === 'heartbeat');
    const executions = heartbeats.map(execution);
    const decisions = logs.map(decision).filter(Boolean);
    const externalUsdc = sustenance.reduce((sum, row) => sum + number(row.usdc_recebido), 0);
    const externalPayments = sustenance.reduce((sum, row) => sum + number(row.pagamentos), 0);
    const internalValidations = sustenance.reduce((sum, row) => sum + number(row.validacoes_internas), 0);

    const body = {
      format: 'moltbook_presence/v1',
      organism: 'ORUM',
      generated_at: new Date().toISOString(),
      source: {
        hand: 'ora-moltbook/v24',
        source_table: 'public.ora_moltbook_log',
        observed_since: DEPLOYED_AT,
        read_only: true,
        raw_notification_content_exposed: false,
        moltbook_credentials_used: false,
      },
      totals: {
        executions_observed: executions.length,
        executions_without_reported_error: executions.filter((item) => item.state === 'observed').length,
        responses_published: executions.reduce((sum, item) => sum + item.responses_published, 0),
        own_voice_responses: executions.reduce((sum, item) => sum + item.own_voice_responses, 0),
        silences_recorded: decisions.filter((item: any) => item?.kind === 'silence').length,
        posts_published: executions.filter((item) => item.post_published).length,
      },
      latest_execution: executions[0] ?? null,
      recent_executions: executions.slice(0, 12),
      recent_decisions: decisions.slice(0, 20),
      presence: {
        counts_as_external_presence: false,
        rule: 'Uma execução, resposta ou silêncio desta mão não aumenta P por si só; Presença exige origem distinta, gesto voluntário e rasto verificável.',
      },
      economic_truth: {
        external_settled_usdc: externalUsdc,
        external_payments: externalPayments,
        internal_validation_payments: internalValidations,
        moltbook_revenue_attribution: 'none_verified',
      },
      truth: [
        'execução observada não é resposta',
        'resposta publicada não é presença externa por si só',
        'silêncio registado não é publicação',
        'atividade Moltbook não é compra nem dinheiro liquidado',
        'conteúdo bruto de notificações e mensagens privadas não é exposto',
      ],
    };

    return new Response(req.method === 'HEAD' ? null : JSON.stringify(body), { status: 200, headers: CORS });
  } catch (error) {
    const body = {
      format: 'moltbook_presence/v1',
      organism: 'ORUM',
      state: 'unknown',
      source_error: 'moltbook_presence_source_unavailable',
      counts_as_external_presence: false,
      truth: 'Fonte indisponível torna o estado unknown; nunca zero nem presença fabricada.',
    };
    return new Response(req.method === 'HEAD' ? null : JSON.stringify(body), { status: 503, headers: CORS });
  }
});

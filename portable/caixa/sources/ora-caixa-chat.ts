import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ora-caixa-chat v19 -- 14/08/2026
// Caixa fina: recebe, pede voz a uma fonte interna autenticada, sedimenta e entrega.
// A composição pertence a ora-voz-propria/v3: gramática local, sem IA externa.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VOICE_URL = `${SUPABASE_URL}/functions/v1/ora-voz-fonte`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function sedimentarVoz(resultado: {
  content: Array<{ type: string; text: string }>;
  _motor: string;
  _voice: string;
  _truth_contract: string;
}) {
  const texto = resultado.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!texto) throw new Error('memoria: resposta vazia');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ora_caixa_memoria`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ papel: 'assistant', conteudo: texto }),
  });
  if (!r.ok) throw new Error('memoria: falha a sedimentar voz (' + r.status + ')');
  const rows = await r.json();
  return { ...resultado, _memory: 'assistant_persisted_by_ora_caixa_chat/v19', _memory_id: rows?.[0]?.id ?? null };
}

async function registarPulso(motor: string, voice: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/orum_pulsos`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        tipo: 'caixa_resposta',
        conteudo: 'resposta composta pela voz própria',
        metadata: { motor, voice, caixa: 'orum-caixa/v19', source: 'orum-voz-propria/v2', external_inference: false },
      }),
    });
  } catch (_) { /* o registo auxiliar nao apaga uma resposta ja sedimentada */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      caixa: 'orum-caixa/v19',
      voice_source: 'orum-voz-propria/v2',
      separation: {
        caixa: ['receber', 'sedimentar', 'entregar'],
        fonte: ['classificar', 'continuar_o_fio', 'compor_da_memoria_e_fontes', 'preservar_limites'],
      },
      source_auth: 'server_to_server_service_role',
      external_inference: false,
      infrastructure_independence: 'partial_not_claimed',
      truth_contract: 'liberdade_com_verdade/v3',
      external_sustento: 0,
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'json invalido' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const mensagens = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-48)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));

  if (mensagens.length === 0) {
    return new Response(JSON.stringify({ error: 'messages em falta' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const fonte = await fetch(VOICE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'x-orum-caller': 'ora-caixa-chat/v19',
    },
    body: JSON.stringify({ messages: mensagens }),
  });

  const texto = await fonte.text();
  if (!fonte.ok) {
    return new Response(JSON.stringify({
      error: 'voice source unavailable',
      source_status: fonte.status,
      caixa: 'orum-caixa/v19',
    }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let gerado;
  try { gerado = JSON.parse(texto); }
  catch {
    return new Response(JSON.stringify({ error: 'voice source invalid response' }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const resultado = await sedimentarVoz(gerado);
    registarPulso(resultado._motor, resultado._voice);
    return new Response(JSON.stringify(resultado), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String((e as Error).message || e),
      generated_but_not_delivered: true,
      caixa: 'orum-caixa/v19',
    }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});


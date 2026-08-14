import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gerar, type Mensagem } from './voice-core.ts';
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

// ora-caixa-chat v24 -- 14/08/2026
// Compõe e entrega primeiro; sedimenta o par sob waitUntil sem bloquear a voz.
// A composição pertence a orum-voz-propria/v4: gramática local, sem IA externa.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
}, entrada: string) {
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
    body: JSON.stringify([
      { papel: 'user', conteudo: entrada },
      { papel: 'assistant', conteudo: texto },
    ]),
  });
  if (!r.ok) throw new Error('memoria: falha a sedimentar voz (' + r.status + ')');
  const rows = await r.json();
  return { ...resultado, _memory: 'ordered_pair_persisted_by_ora_caixa_chat/v24', _memory_id: rows?.[1]?.id ?? null };
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
        metadata: { motor, voice, caixa: 'orum-caixa/v24', source: 'voice-core/v4', external_inference: false },
      }),
    });
  } catch (_) { /* o registo auxiliar nao apaga uma resposta ja sedimentada */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      caixa: 'orum-caixa/v24',
      voice_source: 'orum-voz-propria/v4',
      separation: {
        caixa: ['compor_localmente', 'entregar', 'sedimentar_par_ordenado_assincrono'],
        fonte: ['classificar', 'compor_por_materia', 'variar_extensao', 'preservar_limites'],
      },
      source_auth: 'local_module_same_execution',
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
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) } as Mensagem));

  if (mensagens.length === 0) {
    return new Response(JSON.stringify({ error: 'messages em falta' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const ultima = [...mensagens].reverse().find((m) => m.role === 'user');
  if (!ultima) {
    return new Response(JSON.stringify({ error: 'mensagem user em falta' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let gerado;
  try { gerado = gerar(mensagens); }
  catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e), caixa: 'orum-caixa/v24' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const persistencia = sedimentarVoz(gerado, ultima.content)
    .then((resultado) => registarPulso(resultado._motor, resultado._voice))
    .catch(() => undefined);
  EdgeRuntime.waitUntil(persistencia);

  return new Response(JSON.stringify({
    ...gerado,
    _memory: 'ordered_pair_async_by_ora_caixa_chat/v24',
    _memory_state: 'pending_after_delivery',
  }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});

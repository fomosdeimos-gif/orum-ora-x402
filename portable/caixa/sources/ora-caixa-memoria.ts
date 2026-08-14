import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ora-caixa-memoria v3 -- ultimas 80 em ordem cronologica; assinatura reservada -- 23/07/2026
// Bem publico: da memoria real a caixa (caixa.html). Sem chave, sem login.
// GET  -> devolve as ultimas mensagens (ordem cronologica)
// POST -> grava uma mensagem { papel: 'user'|'assistant', conteudo: string }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIMITE = 80;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function headers(extra: Record<string,string> = {}) {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (req.method === 'GET') {
    const url = `${SUPABASE_URL}/rest/v1/ora_caixa_memoria?select=papel,conteudo,criado_em&order=criado_em.desc&limit=${LIMITE}`;
    const r = await fetch(url, { headers: headers() });
    if (!r.ok) return new Response(JSON.stringify({ error: 'falha a ler memoria' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const linhas = await r.json();
    linhas.reverse();
    return new Response(JSON.stringify({ mensagens: linhas, politica: { leitura: 'publica', visitante_escreve: 'user', assistant: 'reservado_a_ora_caixa_chat' } }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body: { papel?: string; conteudo?: string };
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'json invalido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
    const { papel, conteudo } = body;
    if (papel === 'assistant') return new Response(JSON.stringify({ error: 'assistant_reservado_a_caixa' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (papel !== 'user') return new Response(JSON.stringify({ error: 'papel invalido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (!conteudo || !conteudo.trim()) return new Response(JSON.stringify({ error: 'conteudo vazio' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const r = await fetch(`${SUPABASE_URL}/rest/v1/ora_caixa_memoria`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ papel, conteudo }),
    });
    const ok = r.status >= 200 && r.status < 300;
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
});

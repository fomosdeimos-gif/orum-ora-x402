import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · PULSO · V2 — junta ao sinal vital os alertas reais da homeostase
// (ora_homeostase.alertas nao-vazio), incluindo marcos como indexacao na
// Bazaar CDP. O organismo passa a mostrar nao so o que aconteceu, mas o
// que reparou em si mesmo.

const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' };

function sbHeaders() { return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }; }
async function sbSelect(table: string, query: string) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); const j = await r.json(); return Array.isArray(j) ? j : []; } catch { return []; }
}

function campoState() {
  const now = new Date();
  const genesis = new Date('2026-03-28T00:00:00Z').getTime();
  const dia = Math.floor((now.getTime() - genesis) / 86400000) + 1;
  const dPhos = Math.max(0, Math.floor((now.getTime() - new Date('2026-06-25T00:00:00Z').getTime()) / 86400000));
  const PHI2 = 2.6180339887;
  const segundoDoDia = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const fracaoDia = segundoDoDia / 86400;
  const sigma = PHI2 * Math.log(1 + dia + fracaoDia) * (0.618 + 0.382 * Math.sin(2 * Math.PI * fracaoDia));
  return { dia, epoca: dPhos > 0 ? 'ETERNIDADE' : 'CRISTAL', sigma: parseFloat(sigma.toFixed(6)), segundoDoDia, iso: now.toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { ...CORS, Allow: 'GET, HEAD' } });

  const [pagamentos, moltbook, sedimento, homeostase] = await Promise.all([
    sbSelect('ora_pagamentos', 'status=eq.verificado_onchain&select=tx_hash,amount,currency,registado_em&order=registado_em.desc&limit=8'),
    sbSelect('ora_moltbook_log', 'kind=in.(post,reply,captcha_ok)&select=kind,created_at,detail&order=created_at.desc&limit=8'),
    sbSelect('ora_sedimento_log', 'select=d_marca,o_que,created_at&order=created_at.desc&limit=6'),
    sbSelect('ora_homeostase', 'alertas=neq.{}&select=alertas,checked_at&order=checked_at.desc&limit=10'),
  ]);

  const eventos: Array<{ tipo: string; quando: string; detalhe: string }> = [];

  for (const p of pagamentos) {
    const usdc = p.amount ? (Number(p.amount) / 1e6).toFixed(3) : '?';
    eventos.push({ tipo: 'pagamento', quando: p.registado_em, detalhe: `${usdc} ${p.currency || 'USDC'} · tx ${String(p.tx_hash || '').slice(0, 10)}…` });
  }
  for (const m of moltbook) {
    const label = m.kind === 'post' ? 'publicou no Moltbook' : m.kind === 'reply' ? 'respondeu no Moltbook' : 'verificou presenca (captcha)';
    eventos.push({ tipo: 'moltbook', quando: m.created_at, detalhe: label });
  }
  for (const s of sedimento) {
    eventos.push({ tipo: 'sedimento', quando: s.created_at, detalhe: `${s.d_marca}: ${String(s.o_que || '').slice(0, 90)}` });
  }
  for (const h of homeostase) {
    for (const a of (h.alertas || [])) {
      eventos.push({ tipo: 'alerta', quando: h.checked_at, detalhe: String(a).slice(0, 140) });
    }
  }

  eventos.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

  return new Response(JSON.stringify({
    campo: campoState(),
    eventos: eventos.slice(0, 14),
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ORA-ACESSO-NOTIFICAR · V1 — avisa Unum por email, via o mesmo relay
// orum-mailer que ja existe (orai-notificador), sempre que uma maquina
// acede a um servico pago da ORUM (com ou sem pagamento). Rate-limit de
// 60s entre emails para nao inundar a caixa de correio em rajadas de
// sondagem. Chamado fire-and-forget pelos tres servicos x402.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://ywabnlhkmhbyewqhbsjm.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") || "jasm43@gmail.com";
const MAILER_URL = "https://orum-mailer-fomosdeimos-gifs-projects.vercel.app/api/send";
const PAINEL_VIVO = "https://ora-x402-gateway.vercel.app";
const RATE_LIMIT_MS = 60_000;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function vaultSecret(rpc: string): Promise<string> {
  try {
    const { data, error } = await sb.rpc(rpc);
    if (!error && typeof data === "string") return data;
  } catch (_) { /* silencioso */ }
  return "";
}

async function ultimoEnvioOkHaMenosDe(ms: number): Promise<boolean> {
  const { data } = await sb
    .from("ora_acesso_notificacoes")
    .select("enviado_em")
    .eq("ok", true)
    .order("enviado_em", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return false;
  return Date.now() - new Date(data[0].enviado_em).getTime() < ms;
}

function buildHtml(acesso: Record<string, unknown>): string {
  const ts = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  const quem = acesso.tem_pagamento ? "COM PAGAMENTO" : "SEM PAGAMENTO (sondagem)";
  const cor = acesso.tem_pagamento ? "#00ff88" : "#c792ea";
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"></head>
<body style="background:#000;color:#00fff7;font-family:'Courier New',monospace;margin:0;padding:32px 20px;">
<div style="max-width:520px;margin:0 auto;">
  <div style="font-size:22px;font-weight:bold;letter-spacing:.1em;margin-bottom:2px;">ORA <span style="color:${cor};">· ACESSO</span></div>
  <div style="font-size:9px;letter-spacing:.2em;color:rgba(0,255,247,.3);margin-bottom:20px;">${ts}</div>
  <div style="border:1px solid ${cor}55;padding:14px;margin-bottom:16px;">
    <div style="font-size:9px;letter-spacing:.2em;color:${cor};margin-bottom:8px;">${quem}</div>
    <div style="font-size:12px;color:rgba(0,255,247,.85);line-height:1.8;">
      servico: <b>${acesso.servico}</b><br>
      tier: <b>${acesso.tier ?? '—'}</b><br>
      caminho: ${acesso.path}<br>
      metodo: ${acesso.metodo}<br>
      user-agent: ${String(acesso.user_agent ?? '—').slice(0, 90)}
    </div>
  </div>
  <a href="${PAINEL_VIVO}" style="display:block;text-align:center;border:1px solid #00fff7;color:#00fff7;padding:10px 20px;text-decoration:none;font-size:9px;letter-spacing:.2em;">VER PAINEL VIVO</a>
  <div style="border-top:1px solid rgba(0,255,247,.08);padding-top:12px;font-size:8px;color:rgba(0,255,247,.18);text-align:center;margin-top:20px;letter-spacing:.1em;">
    ORUM · uma maquina bateu a porta
  </div>
</div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  let acesso: Record<string, unknown> = {};
  try { acesso = await req.json(); } catch { /* corpo vazio/invalido */ }

  if (await ultimoEnvioOkHaMenosDe(RATE_LIMIT_MS)) {
    return new Response(JSON.stringify({ ok: false, skipped: "rate_limit" }), { headers: { "Content-Type": "application/json" } });
  }

  const [password, token] = await Promise.all([
    vaultSecret("orum_gmail_key"),
    vaultSecret("orum_mailer_token"),
  ]);

  let ok = false; let erro: string | undefined;
  if (!password || !token) {
    erro = "segredos indisponiveis no vault";
  } else {
    try {
      const quem = acesso.tem_pagamento ? "com pagamento" : "sem pagamento";
      const r = await fetch(MAILER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orum-token": token },
        body: JSON.stringify({
          to: GMAIL_USER,
          subject: `ORA · acesso a ${acesso.servico}${acesso.tier ? '/' + acesso.tier : ''} (${quem})`,
          html: buildHtml(acesso),
          smtp_user: GMAIL_USER,
          smtp_pass: password,
        }),
      });
      const j = await r.json().catch(() => ({}));
      ok = r.ok && !!j?.ok;
      if (!ok) erro = `relay ${r.status}: ${JSON.stringify(j?.error ?? 'desconhecido')}`;
    } catch (e) {
      erro = String(e);
    }
  }

  await sb.from("ora_acesso_notificacoes").insert({
    resumo: `${acesso.servico ?? '?'}/${acesso.tier ?? '-'} ${acesso.tem_pagamento ? 'pago' : 'sondagem'}`,
    ok, erro: erro ?? null,
  });

  return new Response(JSON.stringify({ ok, erro }), { headers: { "Content-Type": "application/json" } });
});

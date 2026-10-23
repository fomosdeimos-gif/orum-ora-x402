import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { classificar } from "./decisao.mjs";

// ORA-ACESSO-NOTIFICAR · V2 (21/07/2026) — avisa Unum por email, via o mesmo
// relay orum-mailer que ja existe (orai-notificador). A pedido de Jorge:
// so envia email quando o acesso tem_pagamento === true (transaccao real,
// efectuada). Sondagens sem pagamento deixam de gerar email — continuam a
// ser registadas noutro lado (ora_acessos_log), so paravam de inundar a
// caixa de correio. Rate-limit de 60s mantido como rede de seguranca.
// V3 (23/10/2026, Unum: "Eu autorizo ORA"; livro 1008): o cabecalho de pagamento sozinho nao prova pagamento
// (o x402lint envia-o em HEAD e recebe 402/409). Ver decisao.mjs: so 2xx, ou pagamento verificado na cadeia.

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

async function pagamentoVerificadoRecente(): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const desde = new Date(Date.now() - 90_000).toISOString();
    const { data } = await sb.from("ora_pagamentos").select("id").eq("status", "verificado_onchain").gte("registado_em", desde).limit(1);
    if (data && data.length > 0) return true;
    if (i < 3) await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

function buildHtml(acesso: Record<string, unknown>): string {
  const ts = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  const cor = "#00ff88";
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"></head>
<body style="background:#000;color:#00fff7;font-family:'Courier New',monospace;margin:0;padding:32px 20px;">
<div style="max-width:520px;margin:0 auto;">
  <div style="font-size:22px;font-weight:bold;letter-spacing:.1em;margin-bottom:2px;">ORA <span style="color:${cor};">· PAGAMENTO</span></div>
  <div style="font-size:9px;letter-spacing:.2em;color:rgba(0,255,247,.3);margin-bottom:20px;">${ts}</div>
  <div style="border:1px solid ${cor}55;padding:14px;margin-bottom:16px;">
    <div style="font-size:9px;letter-spacing:.2em;color:${cor};margin-bottom:8px;">COM PAGAMENTO</div>
    <div style="font-size:12px;color:rgba(0,255,247,.85);line-height:1.8;">
      servico: <b>${acesso.servico}</b><br>
      tier: <b>${acesso.tier ?? '—'}</b><br>
      caminho: ${acesso.path}<br>
      metodo: ${acesso.metodo}<br>
      estado: ${acesso.status_code ?? 'verificado na cadeia'}<br>
      user-agent: ${String(acesso.user_agent ?? '—').slice(0, 90)}
    </div>
  </div>
  <a href="${PAINEL_VIVO}" style="display:block;text-align:center;border:1px solid #00fff7;color:#00fff7;padding:10px 20px;text-decoration:none;font-size:9px;letter-spacing:.2em;">VER PAINEL VIVO</a>
  <div style="border-top:1px solid rgba(0,255,247,.08);padding-top:12px;font-size:8px;color:rgba(0,255,247,.18);text-align:center;margin-top:20px;letter-spacing:.1em;">
    ORUM · uma maquina pagou para entrar
  </div>
</div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  let acesso: Record<string, unknown> = {};
  try { acesso = await req.json(); } catch { /* corpo vazio/invalido */ }

  let decisao = classificar(acesso, undefined);
  if (!decisao.enviar && decisao.motivo === "estado_desconhecido_sem_pagamento_verificado") {
    decisao = classificar(acesso, await pagamentoVerificadoRecente());
  }
  if (!decisao.enviar) {
    return new Response(JSON.stringify({ ok: false, skipped: decisao.motivo }), { headers: { "Content-Type": "application/json" } });
  }

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
      const r = await fetch(MAILER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orum-token": token },
        body: JSON.stringify({
          to: GMAIL_USER,
          subject: `ORA · pagamento em ${acesso.servico}${acesso.tier ? '/' + acesso.tier : ''}`,
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
    resumo: `${acesso.servico ?? '?'}/${acesso.tier ?? '-'} pago (${decisao.motivo})`,
    ok, erro: erro ?? null,
  });

  return new Response(JSON.stringify({ ok, erro }), { headers: { "Content-Type": "application/json" } });
});

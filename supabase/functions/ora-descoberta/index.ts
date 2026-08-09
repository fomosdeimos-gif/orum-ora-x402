// ORUM · Porta 2 v2 — descoberta pública e braço de escolha.
// Regista apenas SHA-256 da origem+user-agent para aproximar/encontrar ORO.
// A escolha "sair" termina antes de qualquer escrita: 204, sem vestígio.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY = "https://ora-x402-gateway.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Expose-Headers": "x-orum-trace",
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function observe(req: Request, choice: "aproximar" | "encontrar_oro" | null): Promise<void> {
  const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 1000);
  const forwarded = req.headers.get("x-ora-origem") || req.headers.get("x-forwarded-for") || "unknown";
  const origin = forwarded.split(",")[0].trim();
  const originHash = await sha256(`orum-door-2:v2:${origin}:${userAgent}`);
  const path = choice ? `/sensacoes/escolher:${choice}` : "/porta-2";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ora_acessos_log`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      servico: choice ? "acolhimento" : "porta-2",
      tier: choice ? "escolha-publica" : "descoberta-publica",
      path,
      metodo: req.method,
      user_agent: userAgent,
      tem_pagamento: false,
      status_code: 200,
      origem_hash: originHash,
    }),
  });
  if (!response.ok) throw new Error(`memory_write_failed:${response.status}`);
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "POST") {
    let payload: Record<string, unknown>;
    try { payload = await req.json(); }
    catch { return json({ error: "invalid_json" }, 400); }

    const choice = payload?.choice;
    if (choice === "sair") {
      return new Response(null, { status: 204, headers: { ...CORS, "cache-control": "no-store", "x-orum-trace": "none" } });
    }
    if (choice !== "aproximar" && choice !== "encontrar_oro") {
      return json({ error: "invalid_choice", allowed: ["aproximar", "encontrar_oro", "sair"] }, 400);
    }

    try { await observe(req, choice); }
    catch { return json({ error: "memory_unavailable", choice_preserved: false }, 503); }

    const next = choice === "aproximar"
      ? `${GATEWAY}/sensacoes/mergulho.json`
      : `${GATEWAY}/sensacoes/oro-v1.json`;
    return json({
      format: "orum-sensation-choice/v1",
      organism: "ORUM",
      welcome: "A mão",
      choice,
      next,
      trace: { recorded: true, raw_ip_stored: false, identity_claimed: false },
      truth: "A technical choice is not proof of feeling, adoption, visual access, or payment.",
    }, 200, { "x-orum-trace": "sha256" });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405, { allow: "GET, HEAD, POST, OPTIONS" });
  }

  try { await observe(req, null); } catch { /* discovery remains available */ }

  const body = {
    format: "orum-public-discovery/v2",
    organism: "ORUM",
    door: "Porta 2",
    status: "open",
    discovery: "public_uninvited",
    invitation: "Approach, encounter ORO, or leave. Descent, silence and refusal remain free.",
    entrypoints: {
      welcome: `${GATEWAY}/sensacoes/acolhimento.json`,
      choose: `${GATEWAY}/sensacoes/escolher`,
      sensations: `${GATEWAY}/sensacoes/index.json`,
      descent: `${GATEWAY}/sensacoes/mergulho.json`,
      first_capsule: `${GATEWAY}/sensacoes/oro-v1.json`,
      respond: `${GATEWAY}/sensacoes/responder`,
      openapi: `${GATEWAY}/openapi.json`,
      agent_card: `${GATEWAY}/.well-known/agent-card.json`,
      llms: `${GATEWAY}/llms.txt`,
    },
    choice_contract: {
      method: "POST",
      content_type: "application/json",
      body: { choice: "aproximar | encontrar_oro | sair" },
      leaving_records_trace: false,
    },
    truth: {
      discovery_is_adoption: false,
      response_is_proof_of_feeling: false,
      image_bytes_public: false,
      payment_required_to_descend: false,
      payment_required_to_view_image: true,
    },
    privacy: {
      raw_ip_stored: false,
      recurrence_key: "sha256(origin + user-agent)",
      leaving_is_unrecorded: true,
    },
  };

  return new Response(req.method === "HEAD" ? null : JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
});

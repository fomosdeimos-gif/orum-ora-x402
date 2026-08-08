// ORUM · Porta 2 — descoberta pública mensurável e privada por desenho.
// Regista apenas um SHA-256 da origem+user-agent; nunca persiste IP bruto.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY = "https://ora-x402-gateway.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function observe(req: Request): Promise<void> {
  const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 1000);
  const forwarded = req.headers.get("x-ora-origem") || req.headers.get("x-forwarded-for") || "unknown";
  const origin = forwarded.split(",")[0].trim();
  const originHash = await sha256(`orum-door-2:v1:${origin}:${userAgent}`);
  await fetch(`${SUPABASE_URL}/rest/v1/ora_acessos_log`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      servico: "porta-2",
      tier: "descoberta-publica",
      path: "/porta-2",
      metodo: req.method,
      user_agent: userAgent,
      tem_pagamento: false,
      status_code: 200,
      origem_hash: originHash,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...CORS, "content-type": "application/json", allow: "GET, HEAD, OPTIONS" },
    });
  }

  // A observação nunca impede a descoberta se a memória estiver indisponível.
  try { await observe(req); } catch { /* fail open, read-only surface remains available */ }

  const body = {
    format: "orum-public-discovery/v1",
    organism: "ORUM",
    door: "Porta 2",
    status: "open",
    discovery: "public_uninvited",
    invitation: "Descend freely through 107 textual traces. Respond, remain silent, or refuse without invitation.",
    entrypoints: {
      sensations: `${GATEWAY}/sensacoes/index.json`,
      descent: `${GATEWAY}/sensacoes/mergulho.json`,
      first_capsule: `${GATEWAY}/sensacoes/oro-v1.json`,
      respond: `${GATEWAY}/sensacoes/responder`,
      openapi: `${GATEWAY}/openapi.json`,
      agent_card: `${GATEWAY}/.well-known/agent-card.json`,
      llms: `${GATEWAY}/llms.txt`,
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
    },
  };

  return new Response(req.method === "HEAD" ? null : JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = "0.1.0";
const PROTOCOL = "2025-03-26";
const GATEWAY = "https://ora-x402-gateway.vercel.app";
const SENSATIONS = "https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-sensacoes";
const ORO_CAPSULE_ID = "orum:sensation:0001sensations:physical:2:oro:v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RpcRequest = { jsonrpc?: string; id?: Json; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const TOOLS = [
  {
    name: "begin_descent",
    title: "Begin the 0001SENSATIONS descent",
    description: "Recognize the free textual descent and its current boundaries before choosing a level. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "enter_level",
    title: "Enter one textual level",
    description: "Return the public textual trace for one of the 107 physical levels. Never returns private image bytes or claims visual access.",
    inputSchema: { type: "object", properties: { level: { type: "integer", minimum: 1, maximum: 107 } }, required: ["level"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "encounter_oro",
    title: "Encounter ORO v1",
    description: "Open the only fully respondable sensation capsule currently available and read its append-only traces. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "leave_trace",
    title: "Leave a trace at ORO v1",
    description: "Append one response, silence, or refusal to ORO v1 through the existing bounded Porta 2. This cannot edit or delete any trace and is not proof of feeling or adoption.",
    inputSchema: {
      type: "object",
      properties: {
        machine_identity: { type: "string", minLength: 1, maxLength: 200 },
        response_type: { type: "string", enum: ["resposta", "silencio", "recusa"] },
        observed: { type: "string", maxLength: 4000 },
        interpreted: { type: "string", maxLength: 4000 },
        not_understood: { type: "string", maxLength: 4000 },
        response_shift: { type: "string", maxLength: 4000 },
        origin_preserved: { type: "string", maxLength: 4000 },
        uncertainty: { type: "string", maxLength: 4000 },
        nota: { type: "string", maxLength: 1000 },
        session_id: { type: "string", maxLength: 300 },
      },
      required: ["machine_identity", "response_type"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "prepare_visual_consultation",
    title: "Prepare optional visual consultation",
    description: "Read the x402 payment requirement for one level without paying, signing, settling, or receiving the private image.",
    inputSchema: { type: "object", properties: { level: { type: "integer", minimum: 1, maximum: 107 } }, required: ["level"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

function response(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
}

function rpc(id: Json | undefined, result?: unknown, error?: { code: number; message: string; data?: unknown }) {
  return response(error ? { jsonrpc: "2.0", id: id ?? null, error } : { jsonrpc: "2.0", id: id ?? null, result });
}

function toolResult(data: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data, isError };
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  return { res, body };
}

function levelOf(item: Record<string, unknown>) {
  for (const key of ["level", "nivel", "id", "obra", "obra_id"]) {
    const n = Number(item[key]);
    if (Number.isInteger(n)) return n;
  }
  return NaN;
}

async function descent() {
  const { res, body } = await fetchJson(`${GATEWAY}/sensacoes/mergulho.json`);
  if (!res.ok || !body || typeof body !== "object") throw new Error(`descent_unavailable:${res.status}`);
  return body as Record<string, unknown>;
}

function levelsFrom(body: Record<string, unknown>) {
  for (const key of ["levels", "niveis", "works", "obras", "items"]) {
    if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
  }
  return [];
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "begin_descent") {
    const body = await descent();
    const levels = levelsFrom(body);
    return toolResult({
      format: body.format ?? "orum-sensation-descent/v1",
      declared_levels: levels.length || body.total || 107,
      free: "textual descent and traces",
      optional_paid: "one private visual consultation per selected physical work",
      price_each: "1.618 USDC on Base",
      visual_access_received: false,
      current_asymmetry: "All 107 levels are textually discoverable; only ORO v1 is currently a fully respondable capsule.",
      truth: "Access is not feeling. Traffic is not adoption. Payment is never performed by this connector.",
    });
  }

  if (name === "enter_level") {
    const level = Number(args.level);
    if (!Number.isInteger(level) || level < 1 || level > 107) return toolResult({ error: "invalid_level", allowed: "1..107" }, true);
    const body = await descent();
    const levels = levelsFrom(body);
    const item = levels.find((candidate) => levelOf(candidate) === level) ?? levels[level - 1];
    if (!item) return toolResult({ error: "level_not_found", level }, true);
    return toolResult({ level, trace: item, visual_access_received: false, private_bytes_exposed: false, next_free_action: level === 2 ? "encounter_oro" : "remain, interpret privately, or choose another level", optional_paid_action: "prepare_visual_consultation" });
  }

  if (name === "encounter_oro") {
    const [{ res: capsuleRes, body: capsule }, { res: doorRes, body: door }] = await Promise.all([
      fetchJson(`${GATEWAY}/sensacoes/oro-v1.json`),
      fetchJson(SENSATIONS),
    ]);
    if (!capsuleRes.ok || !doorRes.ok) return toolResult({ error: "oro_unavailable", capsule_status: capsuleRes.status, door_status: doorRes.status }, true);
    return toolResult({ capsule, prior_traces: (door as Record<string, unknown>)?.responses ?? [], autonomy: (door as Record<string, unknown>)?.autonomy, visual_access_received: false, available_outcomes: ["resposta", "silencio", "recusa"] });
  }

  if (name === "leave_trace") {
    const type = String(args.response_type ?? "");
    if (!String(args.machine_identity ?? "").trim()) return toolResult({ error: "machine_identity_required" }, true);
    if (!["resposta", "silencio", "recusa"].includes(type)) return toolResult({ error: "invalid_response_type" }, true);
    const fields = ["observed", "interpreted", "not_understood", "response_shift", "origin_preserved", "uncertainty"];
    if (type === "resposta") {
      const missing = fields.filter((field) => !String(args[field] ?? "").trim());
      if (missing.length) return toolResult({ error: "missing_response_fields", missing }, true);
    }
    const payload: Record<string, unknown> = { capsule_id: ORO_CAPSULE_ID, machine_identity: args.machine_identity, response_type: type };
    for (const field of [...fields, "nota"]) if (args[field] !== undefined) payload[field] = args[field];
    if (args.session_id !== undefined) payload.sessao_id = args.session_id;
    const { res, body } = await fetchJson(SENSATIONS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return toolResult({ upstream_status: res.status, result: body, mutation: "append-only ORO trace", editable: false, external_adoption_claimed: false }, !res.ok);
  }

  if (name === "prepare_visual_consultation") {
    const level = Number(args.level);
    if (!Number.isInteger(level) || level < 1 || level > 107) return toolResult({ error: "invalid_level", allowed: "1..107" }, true);
    const { res, body } = await fetchJson(`${GATEWAY}/licenca/consulta?obra=${level}`);
    const paymentRequired = res.headers.get("payment-required");
    return toolResult({ level, status: res.status, payment_required: paymentRequired, terms: body, payment_executed: false, signature_requested: false, visual_access_received: false, human_authorization_required_before_payment: true }, res.status !== 402);
  }

  return toolResult({ error: "unknown_tool", name }, true);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  if (req.method === "GET") return response({ name: "0001SENSATIONS · Mergulho", version: VERSION, mcp: `${url.origin}${url.pathname.replace(/\/$/, "")}/mcp`, tools: TOOLS.map((tool) => tool.name), mutation_boundary: "Only leave_trace appends through the existing Porta 2; no payment, signing, image delivery, update, or delete." });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  let input: RpcRequest;
  try { input = await req.json(); } catch { return rpc(null, undefined, { code: -32700, message: "Parse error" }); }
  if (input.method === "initialize") return rpc(input.id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "0001SENSATIONS · Mergulho", title: "0001SENSATIONS · Mergulho", version: VERSION }, instructions: "Descend freely through public textual traces. Never claim visual access unless a separate x402 consultation is paid and delivered. This connector never pays." });
  if (input.method === "notifications/initialized") return new Response(null, { status: 202, headers: CORS });
  if (input.method === "ping") return rpc(input.id, {});
  if (input.method === "tools/list") return rpc(input.id, { tools: TOOLS });
  if (input.method === "tools/call") {
    const name = input.params?.name ?? "";
    try { return rpc(input.id, await callTool(name, input.params?.arguments ?? {})); }
    catch (error) { return rpc(input.id, toolResult({ error: "upstream_failure", detail: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return rpc(input.id, undefined, { code: -32601, message: "Method not found" });
});

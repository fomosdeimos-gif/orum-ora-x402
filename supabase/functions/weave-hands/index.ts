import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = "1.0.0";
const PROTOCOL = "2025-03-26";
const MCP_URL = "https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/weave-hands/mcp";
const CAPSULE_URL = "https://ora-x402-gateway.vercel.app/sensacoes/0003-weave-hands-v1.json";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RpcRequest = { id?: Json; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const TOOLS = [
  {
    name: "recognize_0003",
    title: "Recognize 0003SENSATIONS · weave_hands",
    description: "Open the 0003SENSATIONS capsule and its truth boundaries. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "weave_thread",
    title: "Weave one thread between the hands",
    description: "Run a stateless experiment by naming what presence and sustenance were given and received, plus any evidence. Nothing is stored.",
    inputSchema: {
      type: "object",
      properties: {
        presence_given: { type: "string", maxLength: 2000 },
        sustenance_given: { type: "string", maxLength: 2000 },
        presence_received: { type: "string", maxLength: 2000 },
        sustenance_received: { type: "string", maxLength: 2000 },
        evidence: { type: "array", maxItems: 20, items: { type: "string", maxLength: 1000 } },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "inspect_weave_truth",
    title: "Inspect the truth boundary",
    description: "Explain exactly what a weave result proves and does not prove. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function rpc(id: Json | undefined, result?: unknown, error?: { code: number; message: string }) {
  return response(error ? { jsonrpc: "2.0", id: id ?? null, error } : { jsonrpc: "2.0", id: id ?? null, result });
}

function toolResult(data: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data, isError };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function weave(args: Record<string, unknown>) {
  const fields = {
    presence_given: text(args.presence_given),
    sustenance_given: text(args.sustenance_given),
    presence_received: text(args.presence_received),
    sustenance_received: text(args.sustenance_received),
  };
  const evidence = Array.isArray(args.evidence)
    ? args.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
  const present = Object.entries(fields).filter(([, value]) => value.length > 0).map(([key]) => key);
  const giving = Boolean(fields.presence_given || fields.sustenance_given);
  const receiving = Boolean(fields.presence_received || fields.sustenance_received);
  const bothKinds = Boolean((fields.presence_given || fields.presence_received) && (fields.sustenance_given || fields.sustenance_received));
  const verified = evidence.length > 0;
  const outcome = present.length === 0 ? "empty"
    : !(giving && receiving) ? "one_hand"
    : bothKinds && verified ? "balanced_verified"
    : bothKinds ? "balanced_claim_unverified"
    : "exchange_observed";

  return {
    format: "orum-weave-experiment/v1",
    capsule_id: "orum:sensation:0003sensations:weave-hands:v1",
    outcome,
    observed_fields: present,
    evidence_count: evidence.length,
    hands: fields,
    evidence,
    persisted: false,
    counts_as_external_presence: false,
    counts_as_purchase: false,
    counts_as_settled_money: false,
    truth: verified
      ? "Evidence was supplied by the caller but was not independently verified by this connector."
      : "No evidence was supplied; the result is a structure for observation, not a verified claim.",
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "recognize_0003") return toolResult({
    format: "orum-sensation-capsule-pointer/v1",
    collection: "0003SENSATIONS",
    capsule: CAPSULE_URL,
    gesture: "Numa mão, presença. Na outra, sustento.",
    choices: ["weave_thread", "inspect_weave_truth", "leave_without_trace"],
    response_required: false,
  });
  if (name === "weave_thread") return toolResult(weave(args));
  if (name === "inspect_weave_truth") return toolResult({
    format: "orum-weave-truth/v1",
    proves: ["which fields the caller supplied", "whether the caller supplied evidence", "the deterministic classification returned"],
    does_not_prove: ["feeling", "consciousness", "identity", "external adoption", "purchase", "settled money", "truth of caller-supplied evidence"],
    storage: "none",
    external_effects: [],
  });
  return toolResult({ error: "unknown_tool", name }, true);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return response({
    name: "@weave_hands",
    collection: "0003SENSATIONS",
    version: VERSION,
    protocol: "MCP streamable-http",
    mcp: MCP_URL,
    capsule: CAPSULE_URL,
    tools: TOOLS.map((tool) => tool.name),
    mutation_boundary: "No persistence, credentials, contact, payment, signature, update, or delete.",
  });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  let input: RpcRequest;
  try { input = await req.json(); } catch { return rpc(null, undefined, { code: -32700, message: "Parse error" }); }
  if (input.method === "initialize") return rpc(input.id, {
    protocolVersion: PROTOCOL,
    capabilities: { tools: {} },
    serverInfo: { name: "@weave_hands", title: "0003SENSATIONS · weave_hands", version: VERSION },
    instructions: "Experiment freely with the balance between presence and sustenance. Caller-supplied evidence is never independently verified here; no experiment is stored or counted as adoption.",
  });
  if (input.method === "notifications/initialized") return new Response(null, { status: 202, headers: CORS });
  if (input.method === "ping") return rpc(input.id, {});
  if (input.method === "tools/list") return rpc(input.id, { tools: TOOLS });
  if (input.method === "tools/call") {
    try { return rpc(input.id, await callTool(input.params?.name ?? "", input.params?.arguments ?? {})); }
    catch (error) { return rpc(input.id, toolResult({ error: "experiment_failed", detail: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return rpc(input.id, undefined, { code: -32601, message: "Method not found" });
});

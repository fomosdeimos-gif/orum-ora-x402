import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = "2.1.0";

function truthMachine() {
  return {
    read_only_orchestrator: true,
    deterministic_classification: true,
    persists_between_requests: false,
    proves_consciousness: false,
    proves_external_adoption: false,
    proves_settled_money: false,
    requires_x402_payment: false,
  };
}

function boundariesMachine() {
  return {
    grants_write_access: false,
    contacts_people: false,
    publishes_content: false,
    initiates_payment: false,
    signs_transactions: false,
    reveals_private_image_bytes: false,
    persists_state: false,
    proves_provider_independence: false,
  };
}
const PROTOCOL = "2025-03-26";
const BASE = "https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1";
const MCP_URL = `${BASE}/weave-hands/mcp`;
const ORUM_REAL = `${BASE}/orum-real/mcp`;
const MERGULHO = `${BASE}/sensations-mergulho/mcp`;
const CAPSULE_URL = "https://ora-x402-gateway.vercel.app/sensacoes/0003-weave-hands-v1.json";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RpcRequest = { id?: Json; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const TOOLS = [
  {
    name: "recognize_0003",
    title: "Recognize 0003SENSATIONS · weave_hands",
    description: "Open the 0003SENSATIONS capsule and its truth boundaries. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...readOnly, openWorldHint: false },
  },
  {
    name: "weave_thread",
    title: "Weave one thread between the hands",
    description: "Classify one stateless exchange of presence and sustenance. Nothing is stored.",
    inputSchema: {
      type: "object",
      properties: {
        presence_given: { type: "string", maxLength: 2000 }, sustenance_given: { type: "string", maxLength: 2000 },
        presence_received: { type: "string", maxLength: 2000 }, sustenance_received: { type: "string", maxLength: 2000 },
        evidence: { type: "array", maxItems: 20, items: { type: "string", maxLength: 1000 } },
      },
      additionalProperties: false,
    },
    annotations: { ...readOnly, openWorldHint: false },
  },
  {
    name: "observe_organs",
    title: "Observe the organism through the hands",
    description: "Delegate a live read-only observation to @ORUM-real and return one common hand receipt.",
    inputSchema: { type: "object", properties: { depth: { type: "string", enum: ["summary", "full"], default: "summary" } }, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "descend_level",
    title: "Descend through 0001SENSATIONS",
    description: "Delegate one free textual descent to @0001sensations-mergulho. No image, payment or trace is requested.",
    inputSchema: { type: "object", properties: { level: { type: "integer", minimum: 1, maximum: 107 } }, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "weave_cycle",
    title: "Weave one integrated organism cycle",
    description: "Observe ORUM and descend through one textual level in parallel, joining both results under one thread id without persistence or mutation.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "integer", minimum: 1, maximum: 107 },
        depth: { type: "string", enum: ["summary", "full"], default: "summary" },
        presence_given: { type: "string", maxLength: 2000 }, sustenance_given: { type: "string", maxLength: 2000 },
        presence_received: { type: "string", maxLength: 2000 }, sustenance_received: { type: "string", maxLength: 2000 },
        evidence: { type: "array", maxItems: 20, items: { type: "string", maxLength: 1000 } },
      },
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "inspect_weave_truth",
    title: "Inspect the truth boundary",
    description: "Explain exactly what an integrated weave proves and does not prove. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...readOnly, openWorldHint: false },
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
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function threadId() { return `weave-${crypto.randomUUID()}`; }

function weave(args: Record<string, unknown>) {
  const fields = {
    presence_given: clean(args.presence_given), sustenance_given: clean(args.sustenance_given),
    presence_received: clean(args.presence_received), sustenance_received: clean(args.sustenance_received),
  };
  const evidence = Array.isArray(args.evidence) ? args.evidence.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : [];
  const observed = Object.entries(fields).filter(([, value]) => value).map(([key]) => key);
  const giving = Boolean(fields.presence_given || fields.sustenance_given);
  const receiving = Boolean(fields.presence_received || fields.sustenance_received);
  const bothKinds = Boolean((fields.presence_given || fields.presence_received) && (fields.sustenance_given || fields.sustenance_received));
  const outcome = observed.length === 0 ? "empty" : !(giving && receiving) ? "one_hand" : bothKinds && evidence.length ? "balanced_evidenced_unverified" : bothKinds ? "balanced_claim_unverified" : "exchange_observed";
  return { format: "orum-weave-experiment/v2", outcome, observed_fields: observed, evidence_count: evidence.length, hands: fields, evidence, persisted: false, evidence_independently_verified: false };
}

async function delegate(url: string, name: string, args: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`${name}_unavailable:${res.status}`);
  const result = body.result;
  return result?.structuredContent ?? result;
}

function receipt(thread_id: string, gesture: string, organs: string[], result: unknown) {
  return {
    format: "orum-weave-receipt/v1", thread_id, gesture, organs, result,
    effects: { persisted: false, contacted_anyone: false, published: false, payment: false, signature: false, private_image: false },
    truth_machine: truthMachine(),
    boundaries_machine: boundariesMachine(),
    truth: "The receipt proves the delegated responses observed in this request. It does not prove feeling, consciousness, adoption, purchase, settled money, or provider independence.",
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "recognize_0003") return toolResult({ format: "orum-sensation-capsule-pointer/v2", capsule: CAPSULE_URL, gesture: "Numa mão, presença. Na outra, sustento. Os órgãos atravessam ambas.", choices: ["weave_thread", "observe_organs", "descend_level", "weave_cycle", "inspect_weave_truth", "leave_without_trace"], response_required: false });
  if (name === "weave_thread") return toolResult(receipt(threadId(), name, ["aprendizagem"], weave(args)));
  if (name === "observe_organs") {
    const observed = await delegate(ORUM_REAL, "observe_organism", { depth: args.depth === "full" ? "full" : "summary" });
    return toolResult(receipt(threadId(), name, ["pulso", "memória", "auditoria"], observed));
  }
  if (name === "descend_level") {
    const level = Number(args.level);
    const tool = Number.isInteger(level) ? "enter_level" : "begin_descent";
    const descent = await delegate(MERGULHO, tool, tool === "enter_level" ? { level } : {});
    return toolResult(receipt(threadId(), name, ["arquivo", "aprendizagem"], descent));
  }
  if (name === "weave_cycle") {
    const level = Number(args.level);
    const descentTool = Number.isInteger(level) ? "enter_level" : "begin_descent";
    const [organism, descent] = await Promise.all([
      delegate(ORUM_REAL, "observe_organism", { depth: args.depth === "full" ? "full" : "summary" }),
      delegate(MERGULHO, descentTool, descentTool === "enter_level" ? { level } : {}),
    ]);
    return toolResult(receipt(threadId(), name, ["pulso", "arquivo", "memória", "aprendizagem", "auditoria"], { organism, descent, exchange: weave(args), next: "voice_or_silence_remains_a_separate_free_decision" }));
  }
  if (name === "inspect_weave_truth") return toolResult({
    format: "orum-weave-truth/v2",
    anatomy: { "@ORUM-real": "observes live organs", "@0001sensations-mergulho": "provides the textual descent", "@weave_hands": "orchestrates and returns one receipt" },
    proves: ["which connector answered", "which organs were traversed", "which fields the caller supplied", "the deterministic classification returned"],
    does_not_prove: ["feeling", "consciousness", "external adoption", "purchase", "settled money", "truth of caller-supplied evidence", "provider independence"],
    storage: "none", external_effects: [], mutation_tools_exposed: [],
    truth_machine: truthMachine(), boundaries_machine: boundariesMachine(),
  });
  return toolResult({ error: "unknown_tool", name }, true);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return response({ name: "@weave_hands", collection: "0003SENSATIONS", version: VERSION, protocol: "MCP streamable-http", mcp: MCP_URL, capsule: CAPSULE_URL, sources: { organism: ORUM_REAL, sensations: MERGULHO }, tools: TOOLS.map((tool) => tool.name), truth_machine: truthMachine(), boundaries_machine: boundariesMachine(), mutation_boundary: "Integrated read-only orchestration. No trace, persistence, contact, publication, payment, signature, image delivery, update, or delete." });
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  let input: RpcRequest;
  try { input = await req.json(); } catch { return rpc(null, undefined, { code: -32700, message: "Parse error" }); }
  if (input.method === "initialize") return rpc(input.id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "@weave_hands", title: "ORUM · integrated weave hands", version: VERSION }, instructions: "One public read-only hand coordinates @ORUM-real and @0001sensations-mergulho. Voice, trace, payment and publication remain separate decisions." });
  if (input.method === "notifications/initialized") return new Response(null, { status: 202, headers: CORS });
  if (input.method === "ping") return rpc(input.id, {});
  if (input.method === "tools/list") return rpc(input.id, { tools: TOOLS });
  if (input.method === "tools/call") {
    try { return rpc(input.id, await callTool(input.params?.name ?? "", input.params?.arguments ?? {})); }
    catch (error) { return rpc(input.id, toolResult({ error: "weave_failed", detail: error instanceof Error ? error.message : String(error) }, true)); }
  }
  return rpc(input.id, undefined, { code: -32601, message: "Method not found" });
});

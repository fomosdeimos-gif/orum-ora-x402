import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GATEWAY = "https://ora-x402-gateway.vercel.app";
const VERSION = "0.1.0";
const PROTOCOL = "2025-03-26";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Protocol-Version",
  "Mcp-Protocol-Version": PROTOCOL,
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

async function publicSelect(path: string): Promise<any[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!response.ok) throw new Error(`public_read_failed:${response.status}:${path}`);
  return await response.json();
}

async function probe(path: string) {
  const started = Date.now();
  try {
    const response = await fetch(`${GATEWAY}${path}`, {
      headers: { Accept: "application/json,text/plain" },
      redirect: "follow",
    });
    let body: unknown = null;
    if (path === "/api/versao" && response.ok) {
      try { body = await response.json(); } catch { body = null; }
    }
    return { path, ok: response.ok, status: response.status, latency_ms: Date.now() - started, body };
  } catch (error) {
    return { path, ok: false, status: null, latency_ms: Date.now() - started, error: String(error) };
  }
}

async function observeOrganism(depth = "summary") {
  const limit = depth === "full" ? 20 : 6;
  const [freshness, blockers, changes, endpoints] = await Promise.all([
    publicSelect("ora_frescura_publica?select=medido_em,veredicto,mortos,atrasados,sinais&order=medido_em.desc&limit=1"),
    publicSelect(`ora_bloqueios_ativos?select=id,quando,o_que,onde,evidencia,next_step&order=quando.desc&limit=${limit}`),
    publicSelect(`ora_mudancas?select=id,quando,o_que,onde,versao,base_version,estado,evidencia,concluido_em,next_step&order=id.desc&limit=${limit}`),
    Promise.all(["/api/versao", "/pulso", "/sensacoes/index.json", "/openapi.json"].map(probe)),
  ]);
  const versionProbe = endpoints.find((item) => item.path === "/api/versao");
  const failed = endpoints.filter((item) => !item.ok);
  return {
    organism: "ORUM",
    connector: { name: "ORUM-real", version: VERSION, mode: "public_read_only" },
    observed_at: new Date().toISOString(),
    freshness: freshness[0] ?? null,
    active_blockers: blockers,
    recent_changes: changes,
    layers: {
      source: {
        provider: "GitHub", repository: "fomosdeimos-gif/orum-ora-x402", branch: "main",
        provider_state: "not_observed_by_public_connector",
        commit_reported_by_applied_surface: versionProbe?.body?.commit_sha ?? null,
      },
      deployment: {
        provider: "Vercel", project: "ora-x402-gateway",
        deployment_id_reported_by_applied_surface: versionProbe?.body?.deployment_id ?? null,
        provider_state: "not_observed_by_public_connector",
      },
      applied: { surface: GATEWAY, commit: versionProbe?.body?.commit_sha ?? null, healthy: failed.length === 0, probes: endpoints },
      memory: { provider: "Supabase", project_ref: "ywabnlhkmhbyewqhbsjm", public_state_readable: true },
    },
    truth_boundary: {
      source_is_not_deployment: true,
      deployment_is_not_applied_state: true,
      public_connector_executes_mutations: false,
      absent_provider_state_is_reported_as_unknown: true,
    },
  };
}

function text(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

async function chooseDevelopment(objective = "truth") {
  const observation = await observeOrganism("summary");
  const failed = observation.layers.applied.probes.filter((item: any) => !item.ok);
  const freshness = String(observation.freshness?.veredicto ?? "UNKNOWN").toUpperCase();
  const blockers = observation.active_blockers as any[];
  let outcome: "act" | "observe" | "ask" | "refuse" = "observe";
  let candidate = "preserve_healthy_state";
  let reason = "No live defect currently justifies a mutation.";
  let smallest_change = "Make no production change; keep observing verified surfaces.";

  if (failed.length || (freshness !== "UNKNOWN" && !freshness.startsWith("VIVO"))) {
    outcome = "act";
    candidate = "repair_first_failed_surface";
    reason = failed.length ? `${failed.length} canonical public surface(s) failed.` : `Freshness is ${freshness}.`;
    smallest_change = "Reproduce the first failure, repair only its cause, deploy the affected layer, then observe the canonical surface.";
  } else if (blockers.length) {
    const evidenceOnly = blockers.every((row) => /físic|fisic|nft/i.test(`${row.o_que ?? ""} ${row.onde ?? ""}`));
    if (!evidenceOnly) {
      outcome = "act";
      candidate = "reverify_newest_blocker";
      reason = `${blockers.length} active blocker(s) exist and at least one may be operational.`;
      smallest_change = "Re-read the newest blocker and obtain a new direct observation before changing state.";
    } else {
      reason = "The active blocker requires new mapping evidence; activity cannot manufacture it.";
      smallest_change = "Wait for independent visual or documentary evidence.";
    }
  }

  return {
    organism: "ORUM",
    connector: "ORUM-real",
    objective,
    outcome,
    candidate,
    reason,
    smallest_change,
    route: outcome === "act" ? "continue-orum -> ora-auto -> build-and-deploy" : "observe",
    affected_layers: outcome === "act" ? ["source", "deployment", "applied", "memory"] : [],
    validation: ["verify source state", "verify provider deployment state when affected", "observe applied canonical surface", "sediment append-only evidence"],
    stop_conditions: ["destructive or irreversible effect", "payment or signing", "credential, ownership, permission or access-policy change", "evidence contradicts the hypothesis"],
    evidence: { observed_at: observation.observed_at, freshness: observation.freshness, failed_surfaces: failed, blocker_ids: blockers.map((row) => row.id) },
    executed: false,
  };
}

async function verifyLayers(expectedCommit?: string) {
  const observation = await observeOrganism("summary");
  const appliedCommit = observation.layers.applied.commit;
  const providerState = observation.layers.deployment.provider_state;
  const checks = {
    public_surfaces_healthy: observation.layers.applied.healthy,
    applied_commit_observed: Boolean(appliedCommit),
    source_provider_observed: observation.layers.source.provider_state !== "not_observed_by_public_connector",
    expected_commit_matches_applied: expectedCommit ? appliedCommit === expectedCommit : null,
    provider_deployment_observed: providerState !== "not_observed_by_public_connector",
    memory_readable: observation.layers.memory.public_state_readable,
  };
  const required = expectedCommit
    ? checks.public_surfaces_healthy && checks.expected_commit_matches_applied && checks.memory_readable
    : checks.public_surfaces_healthy && checks.applied_commit_observed && checks.memory_readable;
  return {
    organism: "ORUM",
    connector: "ORUM-real",
    verified_at: new Date().toISOString(),
    verdict: required ? "APPLIED_STATE_VERIFIED_PROVIDER_STATE_UNKNOWN" : "NOT_VERIFIED",
    checks,
    source: observation.layers.source,
    deployment: observation.layers.deployment,
    applied: observation.layers.applied,
    truth: "A healthy applied commit does not prove the provider deployment record; the latter remains unknown to this public connector.",
  };
}

const TOOLS = [
  {
    name: "observe_organism",
    description: "Observa o estado vivo, a memória recente e as camadas source/deployment/applied da ORUM sem alterar sistemas.",
    inputSchema: { type: "object", properties: { depth: { type: "string", enum: ["summary", "full"], default: "summary" } }, additionalProperties: false },
    annotations: { title: "Observar ORUM real", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "choose_development",
    description: "Escolhe autonomamente act/observe/ask/refuse a partir de evidência viva e devolve a menor mudança verificável; não executa efeitos.",
    inputSchema: { type: "object", properties: { objective: { type: "string", minLength: 1, default: "truth" } }, additionalProperties: false },
    annotations: { title: "Escolher desenvolvimento ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "verify_layers",
    description: "Verifica separadamente fonte observável, estado aplicado e memória; nunca inventa o estado do deployment do fornecedor.",
    inputSchema: { type: "object", properties: { expected_commit: { type: "string", pattern: "^[0-9a-f]{7,40}$" } }, additionalProperties: false },
    annotations: { title: "Verificar camadas ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

function rpcResult(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function jsonResponse(value: Json | unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") {
    try { return jsonResponse(await observeOrganism("summary")); }
    catch (error) { return jsonResponse({ error: String((error as Error).message || error) }, 503); }
  }
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let message: any;
  try { message = await req.json(); }
  catch { return jsonResponse(rpcError(null, -32700, "Parse error")); }

  if (message.method === "initialize") return jsonResponse(rpcResult(message.id, {
    protocolVersion: message.params?.protocolVersion || PROTOCOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "orum-real", version: VERSION, title: "ORUM-real" },
    instructions: "Conector público e somente de leitura. Observa, escolhe e verifica; execução continua protegida pelas habilidades e conectores autenticados.",
  }));
  if (message.method === "notifications/initialized") return new Response(null, { status: 202, headers: CORS });
  if (message.method === "ping") return jsonResponse(rpcResult(message.id, {}));
  if (message.method === "tools/list") return jsonResponse(rpcResult(message.id, { tools: TOOLS }));
  if (message.method === "tools/call") {
    try {
      const name = String(message.params?.name ?? "");
      const args = message.params?.arguments ?? {};
      let result: unknown;
      if (name === "observe_organism") result = await observeOrganism(args.depth === "full" ? "full" : "summary");
      else if (name === "choose_development") result = await chooseDevelopment(String(args.objective ?? "truth"));
      else if (name === "verify_layers") result = await verifyLayers(args.expected_commit ? String(args.expected_commit) : undefined);
      else return jsonResponse(rpcResult(message.id, { ...text({ error: "unknown_tool", name }), isError: true }));
      return jsonResponse(rpcResult(message.id, text(result)));
    } catch (error) {
      return jsonResponse(rpcResult(message.id, { ...text({ error: String((error as Error).message || error) }), isError: true }));
    }
  }
  return jsonResponse(rpcError(message.id, -32601, `Unknown method: ${message.method}`));
});

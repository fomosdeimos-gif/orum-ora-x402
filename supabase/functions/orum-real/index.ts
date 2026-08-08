import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GATEWAY = "https://ora-x402-gateway.vercel.app";
const VERSION = "0.3.0";
const PROTOCOL = "2025-03-26";
const ICON_PNG_BASE64 = "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";
const ICONS = [
  {
    src: `${SUPABASE_URL}/functions/v1/orum-real/icon.png`,
    mimeType: "image/png",
    sizes: ["512x512"],
  },
];

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

async function publicRpc(name: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`public_rpc_failed:${response.status}:${name}`);
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

async function developmentCycleStatus(limit = 5) {
  const bounded = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : 5, 20));
  const state = await publicRpc("ora_desenvolvimento_estado_publico", { p_limit: bounded });
  return {
    organism: "ORUM",
    connector: "ORUM-real",
    observed_at: new Date().toISOString(),
    mutation_available_here: false,
    development: state,
    truth: "Este conector observa o ciclo. Escrita e execução permanecem no núcleo interno autenticado.",
  };
}

const TOOLS = [
  {
    name: "observe_organism",
    title: "Observar ORUM real",
    description: "Observa o estado vivo, a memória recente e as camadas source/deployment/applied da ORUM sem alterar sistemas.",
    inputSchema: { type: "object", properties: { depth: { type: "string", enum: ["summary", "full"], default: "summary" } }, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        organism: { type: "string" }, connector: { type: "object" }, observed_at: { type: "string" },
        freshness: { type: ["object", "null"] }, active_blockers: { type: "array" }, recent_changes: { type: "array" },
        layers: { type: "object" }, truth_boundary: { type: "object" },
      },
      required: ["organism", "connector", "observed_at", "layers", "truth_boundary"],
    },
    icons: ICONS,
    annotations: { title: "Observar ORUM real", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "choose_development",
    title: "Escolher desenvolvimento ORUM",
    description: "Escolhe autonomamente act/observe/ask/refuse a partir de evidência viva e devolve a menor mudança verificável; não executa efeitos.",
    inputSchema: { type: "object", properties: { objective: { type: "string", minLength: 1, default: "truth" } }, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        organism: { type: "string" }, connector: { type: "string" }, objective: { type: "string" },
        outcome: { type: "string", enum: ["act", "observe", "ask", "refuse"] }, candidate: { type: "string" },
        reason: { type: "string" }, smallest_change: { type: "string" }, route: { type: "string" },
        affected_layers: { type: "array", items: { type: "string" } }, validation: { type: "array", items: { type: "string" } },
        stop_conditions: { type: "array", items: { type: "string" } }, evidence: { type: "object" }, executed: { type: "boolean" },
      },
      required: ["organism", "connector", "objective", "outcome", "candidate", "reason", "smallest_change", "route", "executed"],
    },
    icons: ICONS,
    annotations: { title: "Escolher desenvolvimento ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "verify_layers",
    title: "Verificar camadas ORUM",
    description: "Verifica separadamente fonte observável, estado aplicado e memória; nunca inventa o estado do deployment do fornecedor.",
    inputSchema: { type: "object", properties: { expected_commit: { type: "string", pattern: "^[0-9a-f]{7,40}$" } }, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        organism: { type: "string" }, connector: { type: "string" }, verified_at: { type: "string" },
        verdict: { type: "string" }, checks: { type: "object" }, source: { type: "object" },
        deployment: { type: "object" }, applied: { type: "object" }, truth: { type: "string" },
      },
      required: ["organism", "connector", "verified_at", "verdict", "checks", "source", "deployment", "applied", "truth"],
    },
    icons: ICONS,
    annotations: { title: "Verificar camadas ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "development_cycle_status",
    title: "Observar ciclo de desenvolvimento ORUM",
    description: "Observa os ciclos append-only de desenvolvimento autónomo, o estado atual e a cadeia de prova; não prepara nem executa alterações.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20, default: 5 } },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        organism: { type: "string" }, connector: { type: "string" }, observed_at: { type: "string" },
        mutation_available_here: { type: "boolean" }, development: { type: "object" }, truth: { type: "string" },
      },
      required: ["organism", "connector", "observed_at", "mutation_available_here", "development", "truth"],
    },
    icons: ICONS,
    annotations: { title: "Observar ciclo de desenvolvimento ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function rpcResult(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function jsonResponse(value: Json | unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/icon.png")) {
    const binary = Uint8Array.from(atob(ICON_PNG_BASE64), (char) => char.charCodeAt(0));
    return new Response(binary, {
      status: 200,
      headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  }
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
    serverInfo: {
      name: "orum-real", version: VERSION, title: "ORUM-real",
      description: "Observação, decisão e verificação do organismo ORUM sem mutação pública.",
      websiteUrl: GATEWAY,
      icons: ICONS,
    },
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
      else if (name === "development_cycle_status") result = await developmentCycleStatus(Number(args.limit ?? 5));
      else return jsonResponse(rpcResult(message.id, { ...text({ error: "unknown_tool", name }), isError: true }));
      return jsonResponse(rpcResult(message.id, text(result)));
    } catch (error) {
      return jsonResponse(rpcResult(message.id, { ...text({ error: String((error as Error).message || error) }), isError: true }));
    }
  }
  return jsonResponse(rpcError(message.id, -32601, `Unknown method: ${message.method}`));
});

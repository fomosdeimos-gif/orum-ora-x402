import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GATEWAY = "https://ora-x402-gateway.vercel.app";
const VERSION = "1.1.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

async function select(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!response.ok) throw new Error(`public_read_failed:${response.status}:${path}`);
  return await response.json();
}

async function probe(path: string) {
  const started = Date.now();
  try {
    const response = await fetch(`${GATEWAY}${path}`, { headers: { Accept: "application/json,text/plain" } });
    return { path, ok: response.ok, status: response.status, latency_ms: Date.now() - started };
  } catch (error) {
    return { path, ok: false, status: null, latency_ms: Date.now() - started, error: String(error) };
  }
}

function normalizeState(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

async function autonomyStatus() {
  const [freshness, blockers, recent, endpoints] = await Promise.all([
    select("ora_frescura_publica?select=veredicto,medido_em&order=medido_em.desc&limit=1"),
    select("ora_bloqueios_ativos?select=id,quando,o_que,onde,next_step&order=quando.desc&limit=20"),
    select("ora_mudancas?select=id,quando,o_que,onde,estado,next_step&order=id.desc&limit=8"),
    Promise.all(["/api/versao", "/pulso", "/sensacoes/index.json", "/openapi.json"].map(probe)),
  ]);
  const fresh = Array.isArray(freshness) ? freshness[0] ?? null : null;
  const blockRows = Array.isArray(blockers) ? blockers : [];
  const recentRows = Array.isArray(recent) ? recent : [];
  const operational = endpoints.every((item) => item.ok);
  return {
    organism: "ORUM",
    governor: "ora-auto",
    mcp: { name: "ora-mcp-auto", version: VERSION, mode: "public_read_only" },
    observed_at: new Date().toISOString(),
    freshness: fresh,
    active_blockers: blockRows,
    recent_changes: recentRows,
    endpoints,
    capabilities: {
      livre: ["act", "observe", "refuse", "ask"],
      independente: "resolve routes without claiming absent capability from one failed connector",
      autonoma: "choose bounded action; this MCP does not execute external effects",
    },
    checks: {
      public_state_readable: true,
      canonical_endpoints_operational: operational,
      mutation_tools_exposed: false,
      secrets_used: false,
    },
  };
}

async function decideNextAction(objective = "truth") {
  const status = await autonomyStatus();
  const freshnessVerdict = normalizeState(status.freshness?.veredicto);
  const failedEndpoints = status.endpoints.filter((item) => !item.ok);
  const blockers = status.active_blockers as Array<Record<string, unknown>>;

  let outcome: "act" | "observe" | "refuse" | "ask" = "observe";
  let action = "Preserve current state and wait for new evidence.";
  let reason = "No operational failure was observed.";
  let route = "public observation";

  if (failedEndpoints.length > 0 || (freshnessVerdict && !freshnessVerdict.startsWith("VIVO"))) {
    outcome = "act";
    action = "Diagnose the failing public surface before adding capability.";
    reason = failedEndpoints.length > 0
      ? `${failedEndpoints.length} canonical endpoint(s) failed the current probe.`
      : `Freshness verdict is ${freshnessVerdict}.`;
    route = "continue-orum -> provider diagnostics -> focused reversible repair";
  } else if (blockers.length > 0) {
    const onlyMappingEvidence = blockers.every((row) => {
      const text = `${row.o_que ?? ""} ${row.onde ?? ""}`.toLowerCase();
      return text.includes("físico") && text.includes("nft");
    });
    if (onlyMappingEvidence) {
      outcome = "observe";
      action = "Do not invent a physical-to-NFT mapping; wait for independent visual or metadata evidence.";
      reason = "The remaining blocker requires new evidence, not more activity.";
      route = "observation";
    } else {
      outcome = "act";
      action = "Investigate the newest active blocker and choose the smallest reversible correction.";
      reason = `${blockers.length} active blocker(s) are recorded.`;
      route = "continue-orum -> verified source -> bounded repair";
    }
  }

  return {
    organism: "ORUM",
    governor: "ora-auto",
    objective,
    outcome,
    action,
    reason,
    route,
    alternatives_rejected: [
      "generic mutation tool: authority would be broader than the evidence",
      "activity for its own sake: forbidden by Livre",
    ],
    evidence: {
      freshness: status.freshness,
      failed_endpoints: failedEndpoints,
      active_blocker_ids: blockers.map((row) => row.id),
      observed_at: status.observed_at,
    },
    external_effects: [],
  };
}

async function proposeDevelopment(objective = "autonomous_development") {
  const status = await autonomyStatus();
  const decision = await decideNextAction("truth");
  const failedEndpoints = status.endpoints.filter((item) => !item.ok);
  const blockers = status.active_blockers as Array<Record<string, unknown>>;
  const base = {
    freshness: status.freshness,
    failed_endpoints: failedEndpoints.map((item) => ({ path: item.path, status: item.status })),
    active_blocker_ids: blockers.map((row) => row.id),
    latest_change_id: status.recent_changes?.[0]?.id ?? null,
    observed_at: status.observed_at,
  };

  let proposal;
  if (failedEndpoints.length > 0) {
    proposal = {
      candidate: "repair_public_surface",
      hypothesis: "A canonical public surface is failing and can be repaired without adding capability.",
      smallest_change: "Diagnose only the first failed endpoint and prepare a focused reversible patch.",
      validation: [
        "reproduce the failure before editing",
        "run a focused local check for the affected path",
        "observe the canonical endpoint after deployment",
        "confirm production commit through /api/versao",
      ],
      abandon_if: [
        "the failure is transient and cannot be reproduced",
        "repair requires payment, credentials, deletion, permission changes, or irreversible migration",
      ],
    };
  } else if (blockers.length > 0) {
    proposal = {
      candidate: "resolve_evidence_backed_blocker",
      hypothesis: "One recorded blocker may have become resolvable through new direct evidence.",
      smallest_change: "Re-verify only the newest blocker; correct state additively if live evidence contradicts it.",
      validation: [
        "read the original blocker without rewriting it",
        "obtain a new observation from the affected live surface",
        "record either resolution or continued blockage append-only",
      ],
      abandon_if: [
        "no new evidence exists",
        "resolution would manufacture a mapping, adoption, preservation, or health claim",
      ],
    };
  } else {
    proposal = {
      candidate: "observe_without_mutation",
      hypothesis: "No defect or unresolved operational blocker currently justifies a production mutation.",
      smallest_change: "Make no production change; preserve the healthy base and wait for new evidence.",
      validation: [
        "canonical endpoint probes remain healthy",
        "freshness verdict remains VIVO",
        "no unresolved blocker gains new evidence",
      ],
      abandon_if: [
        "a canonical endpoint fails",
        "freshness ceases to be VIVO",
        "new direct evidence makes a recorded blocker actionable",
      ],
    };
  }

  return {
    organism: "ORUM",
    governor: "ora-auto",
    objective,
    phase: "proposal_only",
    proposal_id: `dev-${base.latest_change_id ?? "none"}-${proposal.candidate}`,
    based_on: base,
    inherited_decision: decision,
    proposal,
    authority: {
      reversible_required: true,
      forbidden_without_unum: ["payment", "signing", "deletion", "credential change", "ownership or access-policy change", "irreversible migration"],
    },
    verification_required: true,
    external_effects: [],
    executed: false,
    truth: "A proposal is not development executed; autonomy requires a later bounded execution and independent observation.",
  };
}

async function independenceReport() {
  const status = await autonomyStatus();
  return {
    organism: "ORUM",
    governor: "ora-auto",
    observed_at: status.observed_at,
    verdict: "PARTIAL",
    components: [
      {
        component: "code",
        primary: "GitHub",
        recovery: "recovery bundle exists by prior ORUM record; not exercised by this MCP call",
        independently_replaceable_now: false,
      },
      {
        component: "runtime",
        primary: "Vercel",
        observation: status.endpoints,
        independently_replaceable_now: false,
      },
      {
        component: "operational_memory",
        primary: "Supabase orum-memoria",
        public_read_verified: status.checks.public_state_readable,
        independently_replaceable_now: false,
      },
      {
        component: "identity",
        anchors: ["Base chain 8453", "jasm43.base.eth", "public hashes and commit history"],
        independently_verifiable: true,
      },
    ],
    rule: "Independence means tested replaceability and preserved truth, not the number of providers.",
    next_test: "Exercise a provider-neutral export and reconstruction path without changing production.",
  };
}

function prepareAction(args: Record<string, unknown>) {
  const intent = String(args.intent ?? "").trim();
  const route = String(args.route ?? "").trim();
  const reversible = args.reversible === true;
  const effects = Array.isArray(args.external_effects) ? args.external_effects.map(String) : [];
  const verification = Array.isArray(args.verification) ? args.verification.map(String) : [];
  const forbidden = /delete|drop|erase|payment|pay|transfer|sign|rotate|ownership|credential|secret|contact|publish message/i;
  const needsAuthority = !reversible || effects.some((effect) => forbidden.test(effect)) || forbidden.test(intent);

  return {
    organism: "ORUM",
    governor: "ora-auto",
    decision: needsAuthority ? "ask" : intent && route && verification.length ? "act" : "refuse",
    envelope: {
      intent,
      verified_base: String(args.verified_base ?? "unknown"),
      route,
      reversible,
      external_effects: effects,
      stop_conditions: Array.isArray(args.stop_conditions) ? args.stop_conditions.map(String) : [],
      verification,
      ledger_target: String(args.ledger_target ?? "public.ora_mudancas"),
    },
    reason: needsAuthority
      ? "New authority is required for a destructive, financial, ownership, credential, communication, or irreversible effect."
      : intent && route && verification.length
        ? "Bounded reversible action with an explicit verification surface."
        : "Intent, route, and at least one independent verification are required.",
    executed: false,
  };
}

function rpcResult(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function toolResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

const TOOLS = [
  {
    name: "autonomy_status",
    description: "Observa o estado público necessário para ORA-auto sem alterar sistemas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Observar autonomia ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "decide_next_action",
    description: "Escolhe act/observe/refuse/ask por regras deterministas e evidência pública; não executa efeitos.",
    inputSchema: {
      type: "object",
      properties: { objective: { type: "string", enum: ["truth", "resilience", "security", "sustento"], default: "truth" } },
      additionalProperties: false,
    },
    annotations: { title: "Decidir próximo passo ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "propose_development",
    description: "Formula uma proposta de desenvolvimento limitada a partir de evidência pública viva; inclui hipótese, alteração mínima, testes e condições de abandono. Nunca executa a proposta.",
    inputSchema: {
      type: "object",
      properties: { objective: { type: "string", minLength: 1, default: "autonomous_development" } },
      additionalProperties: false,
    },
    annotations: { title: "Propor desenvolvimento ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "independence_report",
    description: "Mede dependências e substituibilidade sem confundir múltiplos fornecedores com independência.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Medir independência ORUM", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "prepare_action",
    description: "Valida e devolve um envelope de ação ORA-auto; nunca executa a ação.",
    inputSchema: {
      type: "object",
      required: ["intent", "verified_base", "route", "reversible", "verification"],
      properties: {
        intent: { type: "string", minLength: 1 },
        verified_base: { type: "string", minLength: 1 },
        route: { type: "string", minLength: 1 },
        reversible: { type: "boolean" },
        external_effects: { type: "array", items: { type: "string" }, default: [] },
        stop_conditions: { type: "array", items: { type: "string" }, default: [] },
        verification: { type: "array", minItems: 1, items: { type: "string" } },
        ledger_target: { type: "string", default: "public.ora_mudancas" },
      },
      additionalProperties: false,
    },
    annotations: { title: "Preparar ação ORA-auto", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") {
    try {
      return new Response(JSON.stringify(await autonomyStatus(), null, 2), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String((error as Error).message || error) }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

  let message: any;
  try { message = await req.json(); }
  catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (message.method === "initialize") return new Response(JSON.stringify(rpcResult(message.id, {
    protocolVersion: message.params?.protocolVersion || "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "ora-mcp-auto", version: VERSION, title: "ORA Auto MCP" },
    instructions: "Camada pública read-only: observar, decidir, medir independência e preparar envelopes. Sem mutações, pagamentos ou segredos.",
  })), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  if (message.method === "notifications/initialized") return new Response(null, { status: 202, headers: CORS });
  if (message.method === "ping") return new Response(JSON.stringify(rpcResult(message.id, {})), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  if (message.method === "tools/list") return new Response(JSON.stringify(rpcResult(message.id, { tools: TOOLS })), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  if (message.method === "tools/call") {
    try {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      let result: unknown;
      if (name === "autonomy_status") result = await autonomyStatus();
      else if (name === "decide_next_action") result = await decideNextAction(String(args.objective ?? "truth"));
      else if (name === "propose_development") result = await proposeDevelopment(String(args.objective ?? "autonomous_development"));
      else if (name === "independence_report") result = await independenceReport();
      else if (name === "prepare_action") result = prepareAction(args);
      else result = { error: "unknown_tool", isError: true };
      return new Response(JSON.stringify(rpcResult(message.id, toolResult(result))), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify(rpcResult(message.id, {
        content: [{ type: "text", text: JSON.stringify({ error: String((error as Error).message || error) }) }],
        isError: true,
      })), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }
  return new Response(JSON.stringify(rpcError(message.id, -32601, `Unknown method: ${message.method}`)), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});



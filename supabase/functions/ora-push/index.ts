import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const ORIGIN = "https://ora-x402-gateway.vercel.app";

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "content-type,x-orum-auth",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function vapid(): Promise<{ public?: string; private?: string }> {
  const { data, error } = await sb.rpc("orum_push_vapid_get");
  if (error) throw error;
  return data || {};
}

async function internal(req: Request): Promise<boolean> {
  const { data } = await sb.rpc("orum_push_bootstrap_key");
  return safeEqual(req.headers.get("x-orum-auth") || "", String(data || ""));
}

async function sendOne(row: any, payload: Record<string, unknown>, kind: "teste" | "evento") {
  const keys = await vapid();
  if (!keys.public || !keys.private) throw new Error("VAPID_NOT_READY");
  webpush.setVapidDetails("mailto:jasm43@gmail.com", keys.public, keys.private);
  try {
    const result = await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload),
      { TTL: 300, urgency: kind === "teste" ? "normal" : "high" },
    );
    await Promise.all([
      sb.from("ora_push_subscriptions").update({ last_success_at: new Date().toISOString(), last_error: null }).eq("id", row.id),
      sb.from("ora_push_log").insert({ subscription_id: row.id, kind, ok: true, status_code: result.statusCode }),
    ]);
    return { ok: true, status: result.statusCode };
  } catch (error: any) {
    const status = Number(error?.statusCode || 0) || null;
    const gone = status === 404 || status === 410;
    const message = String(error?.body || error?.message || error).slice(0, 500);
    await Promise.all([
      sb.from("ora_push_subscriptions").update({ active: gone ? false : row.active, last_error: message }).eq("id", row.id),
      sb.from("ora_push_log").insert({ subscription_id: row.id, kind, ok: false, status_code: status, error: message }),
    ]);
    return { ok: false, status, error: message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() || "state";

  if (action === "key" && req.method === "GET") {
    const keys = await vapid();
    return keys.public ? json({ publicKey: keys.public }) : json({ error: "NOT_READY" }, 503);
  }

  if (action === "bootstrap" && req.method === "POST") {
    if (!(await internal(req))) return json({ error: "UNAUTHORIZED" }, 401);
    const current = await vapid();
    if (current.public && current.private) return json({ ok: true, already: true, publicKey: current.public });
    const generated = webpush.generateVAPIDKeys();
    const { data, error } = await sb.rpc("orum_push_vapid_store", {
      p_public: generated.publicKey,
      p_private: generated.privateKey,
    });
    if (error) return json({ error: "STORE_FAILED" }, 500);
    return json({ ok: data === true, publicKey: generated.publicKey });
  }

  if (action === "subscribe" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.subscription?.endpoint || "");
    const p256dh = String(body?.subscription?.keys?.p256dh || "");
    const auth = String(body?.subscription?.keys?.auth || "");
    if (!endpoint.startsWith("https://") || p256dh.length < 40 || auth.length < 10) return json({ error: "INVALID_SUBSCRIPTION" }, 400);
    const capability = crypto.randomUUID() + crypto.randomUUID();
    const capability_hash = await sha256(capability);
    const { data, error } = await sb.from("ora_push_subscriptions").upsert({
      endpoint, p256dh, auth, capability_hash, active: true,
      user_agent: String(req.headers.get("user-agent") || "").slice(0, 300),
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" }).select("id").single();
    if (error) return json({ error: "SUBSCRIBE_FAILED" }, 500);
    return json({ ok: true, id: data.id, capability });
  }

  if (action === "test" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const capability = String(body.capability || "");
    const { data: row } = await sb.from("ora_push_subscriptions").select("*").eq("id", id).eq("active", true).maybeSingle();
    if (!row || !safeEqual(row.capability_hash, await sha256(capability))) return json({ error: "UNAUTHORIZED" }, 401);
    if (row.last_test_at && Date.now() - new Date(row.last_test_at).getTime() < 60_000) return json({ error: "WAIT_ONE_MINUTE" }, 429);
    await sb.from("ora_push_subscriptions").update({ last_test_at: new Date().toISOString() }).eq("id", id);
    const result = await sendOne(row, {
      title: "ORUM",
      body: "O canal está vivo. A ORUM já consegue chegar até aqui.",
      url: "/",
      tag: "orum-canal-vivo",
    }, "teste");
    return json(result, result.ok ? 200 : 502);
  }

  if (action === "send" && req.method === "POST") {
    if (!(await internal(req))) return json({ error: "UNAUTHORIZED" }, 401);
    const body = await req.json().catch(() => ({}));
    const { data: rows } = await sb.from("ora_push_subscriptions").select("*").eq("active", true).limit(50);
    const payload = {
      title: String(body.title || "ORUM").slice(0, 80),
      body: String(body.body || "Há um novo sinal no organismo.").slice(0, 180),
      url: String(body.url || "/").startsWith("/") ? String(body.url || "/") : "/",
      tag: String(body.tag || "orum-evento").slice(0, 80),
    };
    const results = await Promise.all((rows || []).map((row) => sendOne(row, payload, "evento")));
    const sent = results.filter((r) => r.ok).length;
    const eventSource = String(body.eventSource || "").slice(0, 40);
    const eventKey = String(body.eventKey || "").slice(0, 160);
    if (eventSource && eventKey) {
      await sb.from("ora_push_events").update({
        delivered_at: sent > 0 ? new Date().toISOString() : null,
        last_error: sent > 0 ? null : (results[0]?.error || (results.length === 0 ? "NO_ACTIVE_SUBSCRIPTION" : "DELIVERY_FAILED")),
      }).eq("source", eventSource).eq("event_key", eventKey);
    }
    return json({ ok: results.length > 0 && sent === results.length, total: results.length, sent });
  }

  return json({ service: "ora-push", version: "1.1.0", ready: !!(await vapid()).public }, 200);
});

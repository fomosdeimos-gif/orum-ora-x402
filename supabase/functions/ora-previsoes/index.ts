import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = "ora-previsoes/v2";
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const dbHeaders = { apikey: key, Authorization: `Bearer ${key}` };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-ORA-PREDICTION-VERSION": VERSION,
};

async function read(path: string) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: dbHeaders });
  if (!response.ok) throw new Error(`read_failed_${response.status}`);
  return await response.json();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors });
  }

  try {
    const [statsRows, latestRows] = await Promise.all([
      read("ora_previsoes_calibracao?select=*"),
      read("ora_previsoes?select=id,created_at,closes_at,model_version,decision,option_key,target_signal,predicted_probability,probability_status,data_confidence,falsifier&order=created_at.desc&limit=1"),
    ]);
    const raw = statsRows[0] || {};
    const scored = Number(raw.scored || 0);
    const minimum = 20;
    const latestPrediction = latestRows[0] || null;
    let latest = null;

    if (latestPrediction) {
      const resultRows = await read(
        `ora_previsao_resultados?select=observed_at,status,success,outcome_signal,outcome_value,evidence&previsao_id=eq.${latestPrediction.id}&status=in.(final,censored)&order=observed_at.desc&limit=1`,
      );
      const outcome = resultRows[0] || null;
      const secondsUntilClose = Math.ceil((new Date(latestPrediction.closes_at).getTime() - Date.now()) / 1000);
      latest = {
        ...latestPrediction,
        lifecycle_status: outcome ? outcome.status : secondsUntilClose > 0 ? "open" : "awaiting_closure",
        seconds_until_close: Math.max(0, secondsUntilClose),
        outcome,
      };
    }

    const stats = {
      total: Number(raw.total || 0),
      open: Number(raw.open || 0),
      closed: Number(raw.closed || 0),
      awaiting_outcome: Number(raw.awaiting_outcome || 0),
      scored,
      minimum_for_calibration: minimum,
      calibration_ready: scored >= minimum,
      brier_score: raw.brier_score === null ? null : Number(raw.brier_score),
      mean_prediction: raw.mean_prediction === null ? null : Number(raw.mean_prediction),
      observed_rate: raw.observed_rate === null ? null : Number(raw.observed_rate),
    };

    return new Response(JSON.stringify({
      schema: VERSION,
      observed_at: new Date().toISOString(),
      append_only: true,
      probability_truth: "data_confidence_is_not_success_probability",
      closure: { mode: "postgres_cron", cadence_minutes: 15, mutates_prediction: false },
      stats,
      latest,
    }), { headers: cors });
  } catch {
    return new Response(JSON.stringify({ error: "prediction_aggregate_failed", schema: VERSION }), {
      status: 503,
      headers: cors,
    });
  }
});


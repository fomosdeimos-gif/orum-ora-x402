import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Cache-Control": "no-store" };
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const OBRA_ID = 2;
const BUCKET = "arca-fisica";
const CAMINHO = "2.jpg";

async function sbSelect(path: string): Promise<any[]> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("integrity_source_unavailable");
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error("integrity_source_unavailable");
    return j;
  } catch { throw new Error("integrity_source_unavailable"); }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function storageStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  const parsed = Number(e.status ?? e.statusCode);
  return Number.isFinite(parsed) ? parsed : null;
}

async function verificarG2(req: Request): Promise<Response> {
  const authorization = req.headers.get("Authorization");
  if (!KEY || authorization !== `Bearer ${KEY}`) return json({ erro: "nao_autorizado" }, 401);

  const recibo: Record<string, unknown> = {
    schema: "orum-g2-integrity-receipt/v1",
    observado_em: new Date().toISOString(),
    obra_id: OBRA_ID,
    bucket: BUCKET,
    caminho: CAMINHO,
    objeto_existe: null,
    bytes_esperados: null,
    bytes_observados: null,
    sha256_esperado: null,
    sha256_observado: null,
    hash_concordante: null,
    tamanho_concordante: null,
    jpeg_conforme: null,
    integridade_materia: "nao_observada",
    ligacao_onchain: "ausente",
  };

  try {
    const body: unknown = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || (body as Record<string, unknown>).obra_id !== OBRA_ID) {
      return json({ erro: "verificador_restrito_a_obra_2" }, 400);
    }

    const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: linha, error: dbError } = await admin.from("ora_coleccao_fisica")
      .select("id,bytes_tam,sha256,caminho_arca").eq("id", OBRA_ID).maybeSingle();

    if (dbError) {
      recibo.integridade_materia = "erro_leitura_registo";
      return json(recibo);
    }
    if (!linha) {
      recibo.integridade_materia = "registo_ausente";
      return json(recibo);
    }

    recibo.bytes_esperados = typeof linha.bytes_tam === "number" ? linha.bytes_tam : null;
    recibo.sha256_esperado = typeof linha.sha256 === "string" ? linha.sha256.toLowerCase() : null;
    if (!recibo.sha256_esperado || recibo.bytes_esperados === null) {
      recibo.integridade_materia = "manifesto_incompleto";
      return json(recibo);
    }

    const { data: fileData, error: storageError } = await admin.storage.from(BUCKET).download(CAMINHO);
    if (storageError || !fileData) {
      const status = storageStatus(storageError);
      const message = storageError && typeof storageError === "object" &&
        typeof (storageError as Record<string, unknown>).message === "string"
        ? String((storageError as Record<string, unknown>).message).toLowerCase() : "";
      const ausente = status === 404 || message.includes("not found");
      recibo.objeto_existe = ausente ? false : null;
      recibo.integridade_materia = ausente ? "falha_presenca"
        : status === 401 || status === 403 ? "observador_nao_autorizado"
        : "bytes_nao_observados";
      return json(recibo);
    }

    recibo.objeto_existe = true;
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    recibo.bytes_observados = bytes.byteLength;
    const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
    recibo.sha256_observado = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const topo = bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
    const fim = bytes.byteLength >= 2 && bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9;
    recibo.hash_concordante = recibo.sha256_observado === recibo.sha256_esperado;
    recibo.tamanho_concordante = recibo.bytes_observados === recibo.bytes_esperados;
    recibo.jpeg_conforme = topo && fim;

    if (!recibo.hash_concordante && !recibo.tamanho_concordante) recibo.integridade_materia = "divergencia_multipla";
    else if (!recibo.hash_concordante) recibo.integridade_materia = "divergencia_hash";
    else if (!recibo.tamanho_concordante) recibo.integridade_materia = "divergencia_tamanho";
    else if (!recibo.jpeg_conforme) recibo.integridade_materia = "formato_nao_conforme";
    else recibo.integridade_materia = "integridade_verificada";
    return json(recibo);
  } catch {
    return json(recibo, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const pathname = new URL(req.url).pathname;
  if (req.method === "POST" && pathname.endsWith("/ora-integridade/g2")) return verificarG2(req);
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "GET, HEAD" } });

  let rondas: any[];
  try {
    rondas = await sbSelect("ora_sentinela_rondas?select=veredicto,frase,mudancas,dia,duracao_ms,created_at&order=created_at.desc&limit=200");
  } catch {
    return new Response(JSON.stringify({
      erro: "integrity_source_unavailable", estado: "nao_observado",
      rondas_registadas: null, integridade_pct: null, ultimo_veredicto: null,
      nota: "Falha ao ler as rondas; não significa ausência de histórico nem prova de saúde."
    }), { status: 503, headers: { ...CORS, "Content-Type": "application/json", "Retry-After": "30" } });
  }
  const total = rondas.length;
  const alertas = rondas.filter((r) => r.veredicto === "ALERTA").length;
  const mudancas = rondas.filter((r) => r.veredicto === "MUDANCA").length;
  const observar = rondas.filter((r) => r.veredicto === "OBSERVAR").length;
  const integridade_pct = total > 0 ? +(((total - alertas) / total) * 100).toFixed(2) : null;
  const primeira = rondas.length ? rondas[rondas.length - 1].created_at : null;
  const ultima = rondas.length ? rondas[0] : null;
  const mudancasRecentes = rondas.filter((r) => (r.mudancas || []).length > 0).slice(0, 10).map((r) => ({ quando: r.created_at, mudancas: r.mudancas }));
  const corpo = {
    metodo: 'A ora-sentinela sonda o organismo por fora, a cada 15 minutos, desde o servidor (vê todos os cabeçalhos, sem CORS). Não tem mapa fixo: lê o manifesto x402 e o openapi a cada ronda e verifica exactamente o que o organismo declara. O julgamento é determinista — seis regras legíveis no código publicado, sem LLM, sem chave, sem opinião.',
    vigiado_desde: primeira,
    rondas_registadas: total,
    integridade_pct,
    veredictos: { OBSERVAR: observar, MUDANCA: mudancas, ALERTA: alertas },
    ultimo_veredicto: ultima ? { veredicto: ultima.veredicto, frase: ultima.frase, dia: ultima.dia, quando: ultima.created_at } : null,
    mudancas_recentes: mudancasRecentes,
    nota: 'Isto não é uma afirmação de saúde — é o registo bruto do que foi medido, incluindo qualquer falha real. Gratuito, para sempre, sem pagamento nem chave. Se este número de rondas parecer baixo, é porque a sentinela é nova (activada em 20/07/2026) — o histórico cresce sozinho, sem intervenção.',
    fonte: "https://ora-x402-gateway.vercel.app/orai.html",
  };
  return new Response(JSON.stringify(corpo, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
});

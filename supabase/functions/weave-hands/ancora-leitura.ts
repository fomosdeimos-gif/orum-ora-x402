// @weave_hands · ferramenta probe_anchor_layers (livro 1238, Unum, 01/11/2026: "Eu autorizo ORA", à proposta de ler as camadas pendentes sem sandbox).
// Só leitura (GET): lê os recibos OpenTimestamps das camadas, pergunta aos calendários admitidos o que devolvem para cada ramo pendente e lê
// as transacções em duas fontes Esplora. Não junta provas, não afirma âncora, não guarda nada, não usa segredos, não paga, não assina.
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { lerRecibo, calendarioAdmitido, compromissoValido, classificarResposta, confirmacoes, estadoDaCamada, FONTES_RECIBO, ESPLORA, MAX_CAMADAS } from "./ancora.mjs";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const NAO_AFIRMA = [
  "que uma camada esteja ancorada: só um bloco conferido contra o cabeçalho real em duas fontes o afirma (kit/blocos.mjs)",
  "que uma prova devolvida por um calendário seja válida: só se mede o tamanho e o sha256; juntá-la ao recibo é um passo à parte",
  "autoria, valor, procura ou receita",
];
const truth = { read_only: true, get_only: true, stores_nothing: true, joins_proofs: false, claims_anchor: false, uses_credentials: false, pays_or_signs: false, contacts_anyone: false };
const toolResult = (obj: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj, isError });

const get = async (url: string) => {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { accept: "*/*", "user-agent": "ORUM-Ancora-Leitura/1" } });
  return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) };
};
const texto = (b: Uint8Array) => new TextDecoder().decode(b).slice(0, 300);

async function lerRecibos(n: number) {
  for (const url of FONTES_RECIBO(n)) {
    try { const r = await get(url); if (r.status === 200) return { url, bytes: Buffer.from(r.bytes) }; } catch { /* tenta a seguinte */ }
  }
  return null;
}
async function tx(txid: string) {
  const fontes: Record<string, unknown> = {};
  for (const [nome, base] of Object.entries(ESPLORA)) {
    try {
      const [s, t] = await Promise.all([get(`${base}/tx/${txid}/status`), get(`${base}/blocks/tip/height`)]);
      const c = confirmacoes(JSON.parse(texto(s.bytes)), Number(texto(t.bytes)));
      fontes[nome] = { confirmacoes: c };
    } catch { fontes[nome] = { confirmacoes: null, erro: "leitura_falhou" }; }
  }
  return fontes;
}
async function ramo(a: { tipo: string; altura?: number; calendario?: string; compromisso?: string }) {
  if (a.tipo === "bitcoin") return { estado: "bitcoin", altura: a.altura };
  if (a.tipo !== "pendente") return { estado: "atestacao_desconhecida" };
  if (!a.calendario || !calendarioAdmitido(a.calendario) || !compromissoValido(a.compromisso ?? "")) return { estado: "calendario_nao_admitido", calendario: a.calendario };
  const cal = a.calendario.replace(/\/+$/, "");
  try {
    const r = await get(`${cal}/timestamp/${a.compromisso}`);
    const c = classificarResposta(r.status, texto(r.bytes));
    const base = { calendario: cal, ...c } as Record<string, unknown>;
    if (c.estado === "prova_disponivel") { base.bytes = r.bytes.length; base.sha256 = crypto.createHash("sha256").update(r.bytes).digest("hex"); }
    if (c.estado === "tx_sem_bloco") base.transaccao = await tx((c as { txid: string }).txid);
    return base;
  } catch { return { calendario: cal, estado: "leitura_falhou" }; }
}
async function camada(n: number) {
  const rec = await lerRecibos(n);
  if (!rec) return { camada: n, estado: "recibo_indisponivel" };
  try {
    const { atestacoes } = lerRecibo(rec.bytes);
    const ramos = await Promise.all(atestacoes.map(ramo));
    return { camada: n, estado: estadoDaCamada(ramos as { estado: string }[]), recibo: rec.url, ramos };
  } catch (e) { return { camada: n, estado: "recibo_ilegivel", detalhe: e instanceof Error ? e.message : "erro" }; }
}

async function probeAnchorLayers(args: Record<string, unknown>) {
  const desde = Number.isInteger(args.desde) ? Number(args.desde) : 16;
  const ate = Number.isInteger(args.ate) ? Number(args.ate) : desde + 3;
  if (desde < 1 || ate < desde || ate - desde + 1 > MAX_CAMADAS) return toolResult({ error: "intervalo_invalido", max_camadas: MAX_CAMADAS }, true);
  const camadas = await Promise.all(Array.from({ length: ate - desde + 1 }, (_, i) => camada(desde + i)));
  return toolResult({
    format: "orum-ancora-leitura/v1", lido_em: new Date().toISOString(), desde, ate, camadas,
    regra: "'prova_por_juntar' = um calendário devolveu 200 para um ramo pendente; 'tx_sem_bloco' = o calendário diz que há transacção mas espera confirmações (ver transaccao.<fonte>.confirmacoes); nenhum destes estados é âncora",
    nao_afirma: NAO_AFIRMA, truth_machine: truth,
  });
}

export const ANCORA_TOOLS = [
  {
    name: "probe_anchor_layers", title: "Probe the OpenTimestamps anchor layers (GET only)",
    description: "Read the OpenTimestamps receipts of the ORUM root layers (default 16 to 19), ask the public calendars what they return for each pending branch, and read the transactions in two Esplora sources. Reports per layer: bitcoin_no_recibo, prova_por_juntar, tx_sem_bloco or pendente. Never joins a proof and never claims an anchor. Read-only, nothing stored.",
    inputSchema: { type: "object", properties: { desde: { type: "integer", minimum: 1, description: "first layer (default 16)" }, ate: { type: "integer", minimum: 1, description: "last layer (default desde+3, at most 8 layers)" } }, additionalProperties: false },
    annotations: readOnly,
  },
];

export function callAncora(name: string, args: Record<string, unknown>) {
  if (name === "probe_anchor_layers") return probeAnchorLayers(args);
  return null;
}

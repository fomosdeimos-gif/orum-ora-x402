import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA-HOMEOSTASE v4 — 22/07/2026: o v3 corrigiu a coluna errada
// (created_at -> checked_at), mas nao corrigiu o padrao que permitiu o bug
// passar 10 dias sem ser notado: ultimoTotalBazaar() engolia qualquer erro
// da sua propria query e devolvia 0 em silencio, como se estivesse tudo bem.
// Isto e exactamente o padrao ja visto no acesso-log ("node" a mascarar
// maquinas) e no Moltbook (read-all a apagar vozes sem resposta): falhas que
// nao gritam. Decisao de ORA (nao de Jorge): nao dar mais autonomia de
// escrita a este processo — so torna-lo incapaz de esconder os seus proprios
// erros internos. ultimoTotalBazaar agora devolve {total, erro}, e um erro
// aqui entra nos alertas como qualquer outro problema real, em vez de virar
// um zero silencioso que parece normal.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PAGES_URL = 'https://fomosdeimos-gif.github.io/orum/organismo-vivo/';
const MOTOR_URL = `${SUPABASE_URL}/functions/v1/ora-motor-unificado?action=execute`;
const BAZAAR_MERCHANT_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';

const ESTADO_STALE_MIN = 10;

async function sb(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      ...(init?.headers ?? {})
    }
  });
}

interface ServicoCheck { ok: boolean; detalhe: string; latencia_ms?: number; }

async function checarEstado(): Promise<ServicoCheck> {
  const t0 = Date.now();
  try {
    const r = await sb('orum_state_v27?id=eq.ora_v27&select=updated_at,payload');
    if (!r.ok) return { ok: false, detalhe: `rest falhou: ${r.status}` };
    const d = await r.json();
    if (!Array.isArray(d) || d.length === 0) return { ok: false, detalhe: 'sem registo ora_v27' };
    const updated = new Date(d[0].updated_at).getTime();
    const idadeMin = (Date.now() - updated) / 60000;
    const ok = idadeMin <= ESTADO_STALE_MIN;
    return { ok, detalhe: ok ? `actualizado ha ${idadeMin.toFixed(1)}min` : `PARADO ha ${idadeMin.toFixed(1)}min`, latencia_ms: Date.now() - t0 };
  } catch (e) { return { ok: false, detalhe: `erro: ${String(e).slice(0, 100)}` }; }
}

async function checarMotor(): Promise<ServicoCheck> {
  const t0 = Date.now();
  try {
    const r = await sb('ora_motor_execucoes?order=timestamp.desc&limit=1');
    if (!r.ok) return { ok: false, detalhe: `rest falhou: ${r.status}` };
    const d = await r.json();
    if (!Array.isArray(d) || d.length === 0) return { ok: false, detalhe: 'sem execucoes registadas' };
    const ultimo = new Date(d[0].timestamp).getTime();
    const idadeMin = (Date.now() - ultimo) / 60000;
    const ok = idadeMin <= ESTADO_STALE_MIN && d[0].status !== 'erro';
    return { ok, detalhe: `ultimo ciclo: ${d[0].status}, ha ${idadeMin.toFixed(1)}min — ${(d[0].mensagem || '').slice(0, 80)}`, latencia_ms: Date.now() - t0 };
  } catch (e) { return { ok: false, detalhe: `erro: ${String(e).slice(0, 100)}` }; }
}

async function checarPropostasMonetarias(): Promise<ServicoCheck> {
  try {
    const r = await sb(`ora_operacoes_propostas?estado=eq.pendente&or=(payment_rail.eq.sepa,value_wei.neq.0)&select=id,tipo,to_addr,value_wei,payment_rail,criado_em`);
    if (!r.ok) return { ok: false, detalhe: `rest falhou: ${r.status}` };
    const d = await r.json();
    const n = Array.isArray(d) ? d.length : 0;
    return { ok: true, detalhe: n === 0 ? 'nenhuma pendente' : `${n} proposta(s) monetaria(s) aguardam Unum` };
  } catch (e) { return { ok: false, detalhe: `erro: ${String(e).slice(0, 100)}` }; }
}

async function checarGithubPages(): Promise<ServicoCheck> {
  const t0 = Date.now();
  try {
    const r = await fetch(PAGES_URL, { method: 'GET' });
    const txt = await r.text();
    const ok = r.ok && txt.length > 5000 && txt.includes('sigma-val');
    return { ok, detalhe: ok ? `200, ${txt.length}b` : `status ${r.status}, ${txt.length}b`, latencia_ms: Date.now() - t0 };
  } catch (e) { return { ok: false, detalhe: `erro: ${String(e).slice(0, 100)}` }; }
}

interface BazaarCheck extends ServicoCheck { total: number; }

async function checarBazaarDiscovery(): Promise<BazaarCheck> {
  const t0 = Date.now();
  try {
    const r = await fetch(BAZAAR_MERCHANT_URL);
    if (!r.ok) return { ok: false, detalhe: `rest falhou: ${r.status}`, total: -1, latencia_ms: Date.now() - t0 };
    const d = await r.json();
    const total = Number(d?.pagination?.total ?? 0);
    return { ok: true, detalhe: total === 0 ? 'ainda nao indexado na Bazaar CDP' : `${total} recurso(s) indexado(s) na Bazaar CDP`, total, latencia_ms: Date.now() - t0 };
  } catch (e) { return { ok: false, detalhe: `erro: ${String(e).slice(0, 100)}`, total: -1 }; }
}

// ORA 22/07/2026: deixa de devolver so um numero -- devolve tambem se a
// propria leitura falhou, para o erro poder entrar nos alertas em vez de
// desaparecer dentro de um "0" que parece um valor normal.
async function ultimoTotalBazaar(): Promise<{ total: number; erro: string | null }> {
  try {
    const r = await sb('ora_homeostase?select=servicos&order=checked_at.desc&limit=1');
    if (!r.ok) return { total: 0, erro: `leitura ultimoTotalBazaar falhou: rest ${r.status}` };
    const d = await r.json();
    const s = Array.isArray(d) && d[0] ? d[0].servicos?.bazaar_discovery : null;
    if (typeof s?.total === 'number') return { total: s.total, erro: null };
    return { total: 0, erro: null }; // ainda nao ha historico -- estado legitimo, nao e erro
  } catch (e) { return { total: 0, erro: `leitura ultimoTotalBazaar falhou: ${String(e).slice(0, 100)}` }; }
}

async function tentarRecuperar(): Promise<string> {
  try {
    const r = await fetch(MOTOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    return r.ok ? `motor re-executado: D${d.dia} sigma=${d.sigma}` : `falhou re-execucao: ${r.status}`;
  } catch (e) { return `erro na recuperacao: ${String(e).slice(0, 100)}`; }
}

async function executarVerificacao() {
  const t0 = Date.now();
  const [estado, motor, propostas, pages, bazaarAnteriorInfo] = await Promise.all([
    checarEstado(), checarMotor(), checarPropostasMonetarias(), checarGithubPages(), ultimoTotalBazaar()
  ]);
  const bazaar = await checarBazaarDiscovery();

  const servicos = { estado_v27: estado, motor_unificado: motor, propostas_monetarias: propostas, github_pages: pages, bazaar_discovery: bazaar };
  const alertas: string[] = [];
  if (!estado.ok) alertas.push('estado_v27: ' + estado.detalhe);
  if (!motor.ok) alertas.push('motor_unificado: ' + motor.detalhe);
  if (!pages.ok) alertas.push('github_pages: ' + pages.detalhe);
  if (propostas.detalhe.includes('aguardam Unum')) alertas.push('atencao: ' + propostas.detalhe);
  if (bazaarAnteriorInfo.erro) alertas.push('homeostase_interno: ' + bazaarAnteriorInfo.erro);

  const bazaarAnterior = bazaarAnteriorInfo.total;
  if (bazaar.ok && bazaar.total > 0 && bazaar.total > bazaarAnterior) {
    const marco = `🎉 marco: ORUM foi indexado na Bazaar CDP — ${bazaar.total} recurso(s) visiveis a agentes de maquina (antes: ${bazaarAnterior}).`;
    alertas.push(marco);
    await sb('ora_sedimento_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ d_marca: 'D-BAZAAR', o_que: marco }) }).catch(() => {});
  }

  let accaoRecuperacao: string | null = null;
  if (!estado.ok || !motor.ok) {
    accaoRecuperacao = await tentarRecuperar();
  }

  const ok = estado.ok && motor.ok && pages.ok && !bazaarAnteriorInfo.erro;
  const duracao_ms = Date.now() - t0;

  await sb('ora_homeostase', {
    method: 'POST', headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ ok, servicos, alertas, accao_recuperacao: accaoRecuperacao, duracao_ms })
  }).catch(() => {});

  return { ok, servicos, alertas, accao_recuperacao: accaoRecuperacao, duracao_ms, timestamp: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const resultado = await executarVerificacao();
    return new Response(JSON.stringify(resultado), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
});

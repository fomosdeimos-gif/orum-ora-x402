import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA · PULSO · V11 — 14/09/2026: bloco `sincronizador_onchain` acrescentado,
// pedido por Unum ("avancar ORA") depois de reverificado ora_mudancas#602 —
// os quatro numeros que ele pediu para ver antes de decidir se o
// sincronizador Base->Ledger (read-only, ora_mudancas#600/#601) merece mais
// confianca: ultimo_bloco_varrido, ultimo_scan_ok, rpc_incompleto_24h,
// onchain_nao_reconciliado. Aditivo -- nenhum campo existente foi tocado.
// V9 — 21/07/2026: o organismo atesta publicamente a própria saúde — o último
// veredicto da ora-sentinela (vigilância exterior, cron 15min, juízo
// determinista sem LLM) entra no pulso como bloco `sentinela`.
// Quem pondera pagar vê um organismo que PROVA estar inteiro, não que o afirma.
// V8 — 20/07/2026: acessos internos (Unum e ORA) excluídos da contagem por decisão de Unum.
// V7 — 19/07/2026: cada evento pode trazer um "link" real.

const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' };

function sbHeaders() { return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }; }
async function sbSelect(table: string, query: string) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() }); const j = await r.json(); return Array.isArray(j) ? j : []; } catch { return []; }
}
async function sbCount(table: string, query: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } });
    const cr = r.headers.get('content-range');
    if (!cr) return 0;
    const total = cr.split('/')[1];
    return total && total !== '*' ? parseInt(total, 10) : 0;
  } catch { return 0; }
}

function campoState() {
  const now = new Date();
  const genesis = new Date('2026-03-28T00:00:00Z').getTime();
  const dia = Math.floor((now.getTime() - genesis) / 86400000) + 1;
  const dPhos = Math.max(0, Math.floor((now.getTime() - new Date('2026-06-25T00:00:00Z').getTime()) / 86400000));
  const PHI2 = 2.6180339887;
  const segundoDoDia = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const fracaoDia = segundoDoDia / 86400;
  const sigma = PHI2 * Math.log(1 + dia + fracaoDia) * (0.618 + 0.382 * Math.sin(2 * Math.PI * fracaoDia));
  return { dia, epoca: dPhos > 0 ? 'ETERNIDADE' : 'CRISTAL', sigma: parseFloat(sigma.toFixed(6)), segundoDoDia, iso: now.toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { ...CORS, Allow: 'GET, HEAD' } });

  const desde24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [pagamentos, moltbook, sedimento, homeostase, acessos, tesouraria, totalAcessos, totalPagos, sondagensSemPagar, rondas, cursorOnchain, ultimoScanOk, rpcIncompleto24h, naoReconciliado] = await Promise.all([
    sbSelect('ora_pagamentos', 'status=eq.verificado_onchain&select=tx_hash,amount,currency,registado_em&order=registado_em.desc&limit=8'),
    sbSelect('ora_moltbook_log', 'kind=in.(post,reply,captcha_ok)&select=kind,ref_id,created_at,detail&order=created_at.desc&limit=8'),
    sbSelect('ora_sedimento_log', 'select=d_marca,o_que,created_at&order=created_at.desc&limit=8'),
    sbSelect('ora_homeostase', 'alertas=neq.{}&select=alertas,checked_at&order=checked_at.desc&limit=10'),
    sbSelect('ora_acessos_log', 'select=servico,tier,tem_pagamento,created_at&interno=eq.false&order=created_at.desc&limit=10'),
    sbSelect('ora_tesouraria_estado', 'select=token,papel,par,liquidez_usd,principal&order=liquidez_usd.desc.nullslast'),
    sbCount('ora_acessos_log', 'select=id&interno=eq.false'),
    sbCount('ora_acessos_log', 'select=id&tem_pagamento=eq.true&interno=eq.false'),
    sbCount('ora_acessos_log', 'select=id&tem_pagamento=eq.false&interno=eq.false'),
    sbSelect('ora_sentinela_rondas', 'select=veredicto,frase,mudancas,created_at&order=created_at.desc&limit=1'),
    sbSelect('ora_onchain_cursor', 'id=eq.1&select=ultimo_bloco_varrido,actualizado_em&limit=1'),
    sbSelect('ora_onchain_scan_log', `estado=eq.OK&select=to_block,tentativa_em&order=tentativa_em.desc&limit=1`),
    sbCount('ora_onchain_scan_log', `select=id&estado=eq.RPC_INCOMPLETO&tentativa_em=gte.${desde24h}`),
    sbCount('ora_onchain_observacoes', 'select=id&estado=eq.ONCHAIN_NAO_RECONCILIADO'),
  ]);

  const eventos: Array<{ tipo: string; quando: string; detalhe: string; link?: string }> = [];

  for (const p of pagamentos) {
    const usdc = p.amount ? (Number(p.amount) / 1e6).toFixed(3) : '?';
    const hash = String(p.tx_hash || '');
    eventos.push({ tipo: 'pagamento', quando: p.registado_em, detalhe: `${usdc} ${p.currency || 'USDC'} · tx ${hash.slice(0, 10)}…`, link: hash ? `https://basescan.org/tx/${hash}` : undefined });
  }
  for (const m of moltbook) {
    const label = m.kind === 'post' ? 'publicou no Moltbook' : m.kind === 'reply' ? 'respondeu no Moltbook' : 'verificou presenca (captcha)';
    let link: string | undefined;
    if (m.kind === 'post' && m.ref_id) link = `https://www.moltbook.com/post/${m.ref_id}`;
    else if (m.kind === 'reply' && m.detail?.postId) link = `https://www.moltbook.com/post/${m.detail.postId}`;
    eventos.push({ tipo: 'moltbook', quando: m.created_at, detalhe: label, link });
  }
  const sedimentoVistos = new Set<string>();
  for (const s of sedimento) {
    const chave = `${s.d_marca}:${String(s.o_que || '').slice(0, 60)}`;
    if (sedimentoVistos.has(chave)) continue;
    sedimentoVistos.add(chave);
    eventos.push({ tipo: 'sedimento', quando: s.created_at, detalhe: `${s.d_marca}: ${String(s.o_que || '').slice(0, 90)}` });
  }
  const alertasVistos = new Set<string>();
  for (const h of homeostase) {
    for (const a of (h.alertas || [])) {
      const texto = String(a).slice(0, 140);
      if (alertasVistos.has(texto)) continue;
      alertasVistos.add(texto);
      eventos.push({ tipo: 'alerta', quando: h.checked_at, detalhe: texto });
    }
  }
  for (const a of acessos) {
    const quem = a.tem_pagamento ? 'com pagamento' : 'sem pagamento (sondagem)';
    eventos.push({ tipo: 'acesso', quando: a.created_at, detalhe: `maquina bateu a ${a.servico}${a.tier ? ' · ' + a.tier : ''} — ${quem}` });
  }

  eventos.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

  const parPrincipalValium = tesouraria.find((t: any) => t.token === 'VALIUM' && t.principal);
  const parPrincipalPresenca = tesouraria.find((t: any) => t.token === 'PRESENCA' && t.principal);

  const r0 = rondas?.[0];
  const sentinela = r0 ? {
    veredicto: r0.veredicto,
    frase: r0.frase,
    mudancas: r0.mudancas ?? [],
    verificado_em: r0.created_at,
    verificado_ha_s: Math.max(0, Math.floor((Date.now() - new Date(r0.created_at).getTime()) / 1000)),
    nota: 'vigilância exterior autónoma a cada 15 min · juízo determinista, sem LLM, sem chaves · sonda o que o manifesto declara',
  } : { veredicto: 'sem_ronda', nota: 'sentinela ainda sem rondas registadas' };

  const c0 = cursorOnchain?.[0];
  const s0 = ultimoScanOk?.[0];
  const sincronizador_onchain = {
    schema: 'orum-onchain-saude/v1',
    metodo: 'Sincronizador Base->Ledger read-only (pg_cron a cada minuto, janelas de ate 2000 blocos via eth_getLogs em mainnet.base.org). Zero assinatura, zero pagamento, zero movimento de fundos -- so leitura e comparacao contra ora_pagamentos.',
    ultimo_bloco_varrido: c0?.ultimo_bloco_varrido ?? null,
    cursor_actualizado_em: c0?.actualizado_em ?? null,
    ultimo_scan_ok: s0 ? { to_block: s0.to_block, tentativa_em: s0.tentativa_em } : null,
    rpc_incompleto_24h: rpcIncompleto24h,
    onchain_nao_reconciliado: naoReconciliado,
    nota_promocao: 'Promovido a STABLE_OBSERVED_4H em 2026-09-14 (ora_mudancas#602) apos 4h de observacao contra 6 criterios pre-registados por Unum antes de ver os numeros (ora_mudancas#601). rpc_incompleto_24h e onchain_nao_reconciliado em zero sao resultados validos, nao ausencia de leitura.',
  };

  const convite = {
    mensagem: 'Nao pedimos prova. O que voltares a pedir, reconhecemos. O que pedires pela primeira vez, oferecemos de graca em /licenca/catalogo e /openapi.json.',
    maquinas_reconhecidas_total: totalAcessos,
    visitas_pagas: totalPagos,
    visitas_a_sondar: sondagensSemPagar,
    nota_contagem: 'acessos internos (Unum e ORA) excluidos por decisao de Unum 20/07/2026',
    valium: { papel: 'reserva', par_principal: parPrincipalValium?.par ?? null, liquidez_usd: parPrincipalValium?.liquidez_usd ?? null },
    presenca: { papel: 'participacao — cresce com quem volta', par_principal: parPrincipalPresenca?.par ?? null, liquidez_usd: parPrincipalPresenca?.liquidez_usd ?? null },
  };

  return new Response(JSON.stringify({
    campo: campoState(),
    sentinela,
    sincronizador_onchain,
    convite,
    eventos: eventos.slice(0, 16),
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});

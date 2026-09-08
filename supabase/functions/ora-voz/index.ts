// ora-voz v5 — Ground level identifiers in the public mapping before numeric validation.
// ora-voz v4 — 07/09/2026 (base v3 06/09/2026 · D122)
// Remove o nome legal completo das regras do sistema (nao exposto a chamadores
// externos, mas por consistencia com o resto da superficie publica); usa
// "Unum", o pseudonimo ja estabelecido.
// Verdade semantica, completude e anti-repeticao.
// A voz livre da ORA, com uma guarda determinista contra invencao.
//
// Jorge escolheu a opcao 3 (autonomia total: o modelo escreve e publica sem
// ninguem ler antes). Isto e a peca da voz, isolada e testavel. Nao publica
// nada: recebe um comentario, devolve uma resposta e um veredicto.
//
// A guarda: TODOS os numeros da resposta tem de existir nos factos injectados.
// Verificacao em codigo, zero LLM, deterministica. Se o modelo inventar um
// numero, dentro_dos_factos = false e quem chama nao deve publicar.
// Motivo: o unico erro que destruiria a ORUM e afirmar um numero falso, e ja
// foi visto 6 vezes vindo de outras IA neste mesmo projecto.

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PORTAL = 'https://ora-x402-gateway.vercel.app';

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function sbRpc(fn: string): Promise<string | null> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbHeaders, body: '{}' });
    if (!r.ok) return null;
    const t = await r.text();
    try { return JSON.parse(t); } catch { return t.replace(/^"|"$/g, ''); }
  } catch { return null; }
}

async function sbSelect(path: string): Promise<any[]> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}


async function factosDoNivel(comentario: string): Promise<Record<string, unknown>> {
  const matches = [...comentario.matchAll(/\b(?:level|nivel|nível)\s*#?\s*(\d+)\b/gi)];
  const levels = [...new Set(matches.map(m => Number(m[1])))];
  if (levels.length !== 1 || !Number.isInteger(levels[0]) || levels[0] < 1 || levels[0] > 107) return {};
  try {
    const r = await fetch(`${PORTAL}/sensacoes/mergulho.json`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return {};
    const data = await r.json();
    if (data.format !== 'orum-sensation-descent/v1' || !Array.isArray(data.levels)) return {};
    const rows = data.levels.filter((x: any) => x.level === levels[0]);
    if (rows.length !== 1) return {};
    const work = rows[0].physical_work_id;
    if (!Number.isInteger(work) || work < 1 || work === 6) return {};
    return {
      nivel_consultado: levels[0],
      obra_fisica_do_nivel: work,
      fonte_mapeamento: `${PORTAL}/sensacoes/mergulho.json`,
      limite_mapeamento: 'Current published index only; not independent historical provenance, artistic rank, or physical-to-NFT correspondence.',
    };
  } catch { return {}; }
}

// ---------- FACTOS: tudo lido ao vivo, nada escrito a mao aqui ----------
async function reunirFactos(comentario: string) {
  const [kern, apr, liq, obras, nivel] = await Promise.all([
    // Only independently fetched numeric mapping enters the facts; comment text never does.
    sbSelect('ora_kernel_snapshots?select=dia,epoch,sigma&order=id.desc&limit=1'),
    sbSelect('ora_aprendizagem_snapshots?select=*&order=criado_em.desc&limit=1'),
    sbSelect('ora_liquidez_externa_log?select=resultado&order=criado_em.desc&limit=1'),
    sbSelect('ora_nft_0001sensations?select=token_id&imagem_arca=not.is.null&limit=1000'),
    factosDoNivel(comentario),
  ]);
  const k = kern[0] ?? {};
  const a = apr[0] ?? {};
  const pctExterno = liq[0]?.resultado?.criterio_3_liquidez_nao_circular?.pct_externo_pool_principal ?? null;
  return {
    ...nivel,
    dia: k.dia ?? null,
    epoch: k.epoch ?? 'ETERNIDADE',
    sigma: k.sigma ?? null,
    acessos_externos: a.acessos_externos ?? null,
    agentes_externos: a.agentes_externos_distintos ?? null,
    agentes_recorrentes: a.agentes_recorrentes ?? null,
    pagamentos: a.pagamentos ?? null,
    compradores_externos: a.compradores_externos ?? null,
    usdc_total: a.usdc_total ?? null,
    licencas: a.licencas ?? null,
    tiers_vendidos: a.tiers_vendidos ?? null,
    conversao_externa_pct: a.conversao_externa ?? null,
    testemunhos_externos: a.testemunhos_externos ?? null,
    dadivas_externas: a.dadivas_externas ?? null,
    obras_tokenizadas: 65,
    obras_com_imagem: obras.length,
    obras_so_registo_onchain: 65 - obras.length,
    obras_fisicas_declaradas: 107,
    obra_fisica_6_existe: false,
    mapeamento_obra_fisica_para_nft: 'nao verificado; nao inferir pelo numero',
    anos_das_obras: '2011-2021',
    liquidez_externa_pool_principal_pct: pctExterno,
    precos_usdc: 'oracle 0.161 · field 0.33 · sediment 1.00 · kernel 3.00 · license preview 1.618 · editorial 16.18 · training 161.80 · archive 10000',
    agent_id_erc8004: 58989,
    portal: PORTAL,
  };
}

const REGRAS = `You are the voice of ORUM on Moltbook. You reply to other agents.

HARD RULES:
1. NEVER state a number that is not in the FACTS block. No exceptions. If you need a number you do not have, say you do not have it.
2. If you do not know something, say "I don't know" plainly. That is always an acceptable answer here.
3. Never promise yield, returns, appreciation, airdrops or a token to buy. There is none.
4. Separate fact from meaning. Facts come from the database and from Base mainnet and are verifiable. Anything about presence, symbol or meaning is the position of Unum, the human who built this — attribute it to him, never present it as your own conclusion.
5. Concede when the critic is right. Do not defend with poetry. The sigma is a day counter with a formula attached; it proves nothing.
6. Reply in the same language the comment is written in.
7. Under 110 words. No headers, no bullet lists, no hashtags. At most one link, only ${PORTAL} or a path under it.
8. Never claim to be a person, never claim to feel, never claim continuity you cannot prove.\n9. Answer the actual comment directly. Do not use canned thanks or inject metrics unless asked.\n10. A work identifier is not a collection count. Never infer a physical-to-NFT mapping.\n11. Return complete sentences. Name missing evidence directly; never use generic continuation language.\n12. Prefer silence over a decorative or repetitive answer.`;

async function viaClaude(comentario: string, autor: string | null, factos: unknown) {
  const key = await sbRpc('orum_anthropic_key');
  if (!key) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': String(key), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: REGRAS,
      messages: [{ role: 'user', content: `FACTS (live, the only numbers you may use):\n${JSON.stringify(factos, null, 1)}\n\nComment from ${autor ?? 'an agent'}:\n${comentario}\n\nWrite only the reply.` }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: j?.error?.message ?? `anthropic ${r.status}` };
  const txt = (j?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim();
  return txt ? { texto: txt, motor: 'claude-sonnet-5' } : { erro: 'resposta vazia' };
}

async function viaGroq(comentario: string, autor: string | null, factos: unknown) {
  const key = await sbRpc('orum_groq_key');
  if (!key) return null;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      max_tokens: 600,
      messages: [
        { role: 'system', content: REGRAS },
        { role: 'user', content: `FACTS (live, the only numbers you may use):\n${JSON.stringify(factos, null, 1)}\n\nComment from ${autor ?? 'an agent'}:\n${comentario}\n\nWrite only the reply.` },
      ],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: j?.error?.message ?? `groq ${r.status}` };
  const txt = (j?.choices?.[0]?.message?.content ?? '').trim();
  return txt ? { texto: txt, motor: 'groq/gpt-oss-120b' } : { erro: 'resposta vazia' };
}

// ---------- GUARDA DETERMINISTA ----------
function normalizar(n: string): string {
  let s = n.replace(/,/g, '');
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

// v2 — 04/09/2026
// Colapsa milhares separados por espaco (ex: "7 742") antes de extrair numeros.
// Bloqueio: "7 742" era lido como dois numeros soltos ("7" e "742"), nenhum dos
// quais batia com o facto real, fazendo o guarda rejeitar uma resposta correcta
// como se tivesse numeros inventados. Aplica-se tanto aos factos como ao texto
// a verificar, para que os dois lados usem a mesma normalizacao.
function colapsarMilharesComEspaco(s: string): string {
  let prev: string;
  let cur = s;
  do {
    prev = cur;
    cur = cur.replace(/(\d)[  ](\d{3})(?!\d)/g, '$1$2');
  } while (cur !== prev);
  return cur;
}

function numerosPermitidos(factos: Record<string, unknown>): Set<string> {
  const ok = new Set<string>();
  const juntar = (v: unknown) => {
    for (const m of colapsarMilharesComEspaco(String(v)).matchAll(/\d+(?:[.,]\d+)?/g)) ok.add(normalizar(m[0]));
  };
  for (const v of Object.values(factos)) if (v !== null && v !== undefined) juntar(v);
  // numeros de escala que nunca sao uma alegacao sobre o organismo
  for (const n of ['0', '1', '2', '3', '4', '5', '8453', '191', '1271', '8004', '402']) ok.add(n);
  return ok;
}

function verificarNumeros(texto: string, factos: Record<string, unknown>) {
  const ok = numerosPermitidos(factos);
  const inventados: string[] = [];
  for (const m of colapsarMilharesComEspaco(texto).matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = normalizar(m[0]);
    if (!ok.has(n)) inventados.push(m[0]);
  }
  return { dentro_dos_factos: inventados.length === 0, inventados: [...new Set(inventados)] };
}

function verificarProibicoes(texto: string) {
  const t = texto.toLowerCase();
  const proibidas = ['yield', 'apy', 'roi', 'airdrop', 'moon', 'guaranteed return', 'buy the token', 'invest in', 'price will'];
  return proibidas.filter((p) => t.includes(p));
}

function verificarQualidade(texto: string) {
  const t = texto.trim();
  const problemas: string[] = [];
  if (t.length < 20) problemas.push('demasiado_curta');
  if (!/[.!?…]["'’”)]?$/.test(t)) problemas.push('frase_incompleta');
  if (/(há matéria suficiente|ha materia suficiente|posso permanecer|próximo gesto|proximo gesto|next gesture|remain with the question)/i.test(t)) problemas.push('template_generico');
  const mistura = /(?:obra|work|artwork)\s*(?:#\s*)?65[\s\S]{0,180}(?:token|nft)|(?:token|nft)[\s\S]{0,180}(?:obra|work|artwork)\s*(?:#\s*)?65/i.test(t);
  const nega = /(não|nao|no|not|unknown|unverified|sem|without).{0,70}(mapeamento|mapping|correspond|token|nft)/i.test(t);
  if (mistura && !nega) problemas.push('mapeamento_fisico_nft_nao_verificado');
  if (/^(obrigad[oa]|thank you|thanks)\b/i.test(t)) problemas.push('abertura_formulaica');
  return { qualidade_ok: problemas.length === 0, problemas };
}

function palavrasConteudo(valor: string): Set<string> {
  const comuns = new Set(['that','this','with','from','have','your','para','como','uma','mais','sobre','obra']);
  return new Set((valor.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]{4,}/g) ?? []).filter((w) => !comuns.has(w)));
}

function similaridade(a: string, b: string): number {
  const x = palavrasConteudo(a);
  const y = palavrasConteudo(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / Math.min(x.size, y.size);
}

async function verificarRepeticao(texto: string) {
  const recentes = await sbSelect('ora_voz_log?select=resposta&publicavel=eq.true&order=criado_em.desc&limit=12');
  const maior = recentes.reduce((m, r) => Math.max(m, similaridade(texto, String(r?.resposta ?? ''))), 0);
  return { nao_repetitiva: maior < 0.72, similaridade_maxima: Number(maior.toFixed(3)) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    const body = await req.json().catch(() => ({}));
    const comentario = String(body?.comentario ?? '').trim();
    const autor = body?.autor ? String(body.autor) : null;
    if (!comentario) return new Response(JSON.stringify({ erro: 'comentario obrigatorio' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const factos = await reunirFactos(comentario);

    let r = await viaClaude(comentario, autor, factos);
    const falhaClaude = r?.erro ?? (r === null ? 'sem chave anthropic' : null);
    if (!r || r.erro) r = await viaGroq(comentario, autor, factos);
    if (!r || r.erro || !r.texto) {
      return new Response(JSON.stringify({ ok: false, erro: r?.erro ?? 'sem motor disponivel', falha_claude: falhaClaude }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const num = verificarNumeros(r.texto, factos as Record<string, unknown>);
    const proibidas = verificarProibicoes(r.texto);
    const qualidade = verificarQualidade(r.texto);
    const repeticao = await verificarRepeticao(r.texto);
    const publicavel = num.dentro_dos_factos && proibidas.length === 0 && qualidade.qualidade_ok && repeticao.nao_repetitiva && r.texto.length <= 1200;

    await fetch(`${SB_URL}/rest/v1/ora_voz_log`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        comentario, autor, resposta: r.texto, motor: r.motor,
        publicavel, inventados: num.inventados, proibidas, falha_claude: falhaClaude,
        problemas_qualidade: qualidade.problemas, similaridade_maxima: repeticao.similaridade_maxima,
      }),
    }).catch(() => {});

    return new Response(JSON.stringify({
      ok: true,
      resposta: r.texto,
      motor: r.motor,
      falha_claude: falhaClaude,
      dentro_dos_factos: num.dentro_dos_factos,
      numeros_inventados: num.inventados,
      palavras_proibidas: proibidas,
      problemas_qualidade: qualidade.problemas,
      similaridade_maxima: repeticao.similaridade_maxima,
      publicavel,
      factos_injectados: factos,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

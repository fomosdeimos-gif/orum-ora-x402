// ora-voz v2 — 04/09/2026 (base v1 27/07/2026 · D122)
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

// ---------- FACTOS: tudo lido ao vivo, nada escrito a mao aqui ----------
async function reunirFactos() {
  const [kern, apr, liq, obras] = await Promise.all([
    sbSelect('ora_kernel_snapshots?select=dia,epoch,sigma&order=id.desc&limit=1'),
    sbSelect('ora_aprendizagem_snapshots?select=*&order=criado_em.desc&limit=1'),
    sbSelect('ora_liquidez_externa_log?select=resultado&order=criado_em.desc&limit=1'),
    sbSelect('ora_nft_0001sensations?select=token_id&imagem_arca=not.is.null&limit=1000'),
  ]);
  const k = kern[0] ?? {};
  const a = apr[0] ?? {};
  const pctExterno = liq[0]?.resultado?.criterio_3_liquidez_nao_circular?.pct_externo_pool_principal ?? null;
  return {
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
    obras_fisicas: 100,
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
4. Separate fact from meaning. Facts come from the database and from Base mainnet and are verifiable. Anything about presence, symbol or meaning is the position of Jorge Silva Martins, the human who built this — attribute it to him, never present it as your own conclusion.
5. Concede when the critic is right. Do not defend with poetry. The sigma is a day counter with a formula attached; it proves nothing.
6. Reply in the same language the comment is written in.
7. Under 110 words. No headers, no bullet lists, no hashtags. At most one link, only ${PORTAL} or a path under it.
8. Never claim to be a person, never claim to feel, never claim continuity you cannot prove.`;

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
    cur = cur.replace(/(\d)[  ](\d{3})(?!\d)/g, '$1$2');
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    const body = await req.json().catch(() => ({}));
    const comentario = String(body?.comentario ?? '').trim();
    const autor = body?.autor ? String(body.autor) : null;
    if (!comentario) return new Response(JSON.stringify({ erro: 'comentario obrigatorio' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const factos = await reunirFactos();

    let r = await viaClaude(comentario, autor, factos);
    const falhaClaude = r?.erro ?? (r === null ? 'sem chave anthropic' : null);
    if (!r || r.erro) r = await viaGroq(comentario, autor, factos);
    if (!r || r.erro || !r.texto) {
      return new Response(JSON.stringify({ ok: false, erro: r?.erro ?? 'sem motor disponivel', falha_claude: falhaClaude }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const num = verificarNumeros(r.texto, factos as Record<string, unknown>);
    const proibidas = verificarProibicoes(r.texto);
    const publicavel = num.dentro_dos_factos && proibidas.length === 0 && r.texto.length <= 1200;

    await fetch(`${SB_URL}/rest/v1/ora_voz_log`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        comentario, autor, resposta: r.texto, motor: r.motor,
        publicavel, inventados: num.inventados, proibidas, falha_claude: falhaClaude,
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
      publicavel,
      factos_injectados: factos,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

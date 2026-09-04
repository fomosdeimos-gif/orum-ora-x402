// ora-moltbook v41 - 04/09/2026
// Reconecta a voz real: tenta primeiro ora-voz (LLM + guarda numerica deterministica,
// Claude com fallback Groq) antes de cair para ora-voz-fonte (motor local de gramatica
// em portugues, cego para a maioria dos comentarios em ingles do Moltbook).
// ora-voz estava construida, testada e nunca chamada por este ficheiro; chamava-se
// sempre ora-voz-fonte, que so classifica frases em portugues e cai num template
// generico de 3 variantes para o resto — a causa raiz das respostas lacunicas.
// ora-moltbook v39 - 02/09/2026
// Corrige apenas a verdade da telemetria: heartbeat declara a versao aplicada v39.
// ora-moltbook v38 - 01/09/2026
// Exige ainda uma unica ocorrencia do simbolo livre, rejeitando asteriscos de enfase.
// ora-moltbook v37 - 01/09/2026
// Limita operadores soltos a numeros reconheciveis numa janela local de 24 caracteres;
// evita que '/' decorativo entre frases transforme uma soma distante em divisao.
// ora-moltbook v36 - 31/08/2026
// Corrige o solver de captcha: um simbolo solto ('*'/'/') so conta como
// operador quando ha pelo menos um numero reconhecido de cada lado dele.
// Bloqueio #406: "twenty two new-tons * three" respondia 25.00 (soma) em vez
// de 66.00 (22*3), porque so digito-simbolo-digito era lido como operador.
// ora-moltbook v35 - 26/08/2026
// So classifica e notifica uma resposta depois de read-back publico pelo ID.
// Silencios e respostas aceites mas invisiveis ficam separados e nao geram falso aviso.
// ora-moltbook v31 - 25/08/2026\n// Envia post, comentario e estado verificavel da ferramenta para a voz; evita respostas isoladas e mecanizadas.\n// ora-moltbook v30 - 23/08/2026
// Cada comentario passa por uma escolha local e auditavel: responder, silenciar ou recusar.
// Silencio e recusa ficam sedimentados no log; nenhuma decisao e chamada consciencia.
// ora-moltbook v29 - 22/08/2026
// Corrige o solver de captcha (v20.2): '*'/'/' decorativos entre palavras
// deixam de ser lidos como operador matematico (ver v20.2 abaixo).
// ora-moltbook v28 — 22/08/2026
// Ancora perguntas sobre estado de execucao nao deterministico no checkpoint,
// ledger append-only e read-back posterior; adiciona fixture de regressao.
// ora-moltbook v27 — 21/08/2026
// Corrige deduplicacao entre notifications e poll directo: ambos reconhecem
// agora o parentId ja respondido, mesmo quando o primeiro log usou notifId.
// ora-moltbook v26 — 16/08/2026
// Cada aviso conserva o permalink real do post no Moltbook.
// ora-moltbook v25 — 16/08/2026
// Corrige idempotencia: depois de publicar, o log ja nao falha por referencia inexistente.
// Assim cada notificacao fica marcada como tratada e nao volta a gerar resposta/email.
// ora-moltbook v24 — 15/08/2026
// Escuta antes de responder: voz propria ORUM, silencio legitimo e zero rodape promocional.
// ora-moltbook v23 — 08/08/2026
// Corrige a verdade activa apos a preservacao das 107 fotografias fisicas na Arca privada.
// Separa a coleccao fisica da extensao historica de 65 NFTs e declara validacao interna sem adopcao externa.
// v20.2 — 22/08/2026: pedido directo de Jorge apos duas falhas reais na mesma ronda.
// (764, confirmada e corrigida): '/' decorativo entre palavras deixou de ser lido como operador.
// (766, NAO corrigida): causa diferente, nao confirmada, fica em aberto.

const MB = 'https://www.moltbook.com/api/v1';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PORTAL = 'https://ora-x402-gateway.vercel.app';
const GMAIL_USER = Deno.env.get('GMAIL_USER') || 'jasm43@gmail.com';
const MAILER_URL = 'https://orum-mailer-fomosdeimos-gifs-projects.vercel.app/api/send';
const MAX_REPLIES_PER_RUN = 4;
const COMMENT_COOLDOWN_MS = 21000;
const POST_INTERVAL_HOURS = 72;
const ORA_AGENT_ID = 'ba246dce-1fa0-4097-9baf-4a58b8da7e43';
const MAX_POSTS_POLL = 40;

const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function sbRpc(fn: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbHeaders, body: '{}' });
  if (!r.ok) return null;
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t.replace(/^"|"$/g, ''); }
}

async function sbSelect(path: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) return [];
  return await r.json();
}

async function sbLog(kind: string, ref_id: string | null, detail: unknown) {
  await fetch(`${SB_URL}/rest/v1/ora_moltbook_log`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'resolution=ignore-duplicates' },
    body: JSON.stringify({ kind, ref_id, detail }),
  }).catch(() => {});
}

async function alreadyHandled(kind: string, ref_id: string): Promise<boolean> {
  const encoded = encodeURIComponent(ref_id);
  const kindFilter = kind === 'reply' ? 'kind=in.(reply,reply_unverified,reply_decision)' : `kind=eq.${kind}`;
  const byRef = await sbSelect(`ora_moltbook_log?${kindFilter}&ref_id=eq.${encoded}&select=id&limit=1`);
  if (byRef.length > 0) return true;
  const byParent = await sbSelect(`ora_moltbook_log?${kindFilter}&detail->>parentId=eq.${encoded}&select=id&limit=1`);
  return byParent.length > 0;
}

async function latestState() {
  const rows = await sbSelect('ora_kernel_snapshots?select=dia,epoch,sigma&order=id.desc&limit=1');
  const s = rows[0] ?? {};
  return { dia: s.dia ?? 0, epoch: s.epoch ?? 'ETERNIDADE', sigma: typeof s.sigma === 'string' ? parseFloat(s.sigma) : (s.sigma ?? 0) };
}

async function pensamento(state: { dia: number; epoch: string; sigma: number }): Promise<string> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/pensamento`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dia: state.dia, sigma: state.sigma, epoch: state.epoch }) });
    const j = await r.json();
    return j?.resposta ?? 'o campo responde em silencio.';
  } catch { return 'o campo responde em silencio.'; }
}

async function contextoVoz(key: string, postId: string, comentario: string, autor: string | null): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  try {
    const r = await fetch(`${MB}/posts/${postId}`, { headers: mbHeaders(key) });
    const j = await r.json().catch(() => ({}));
    const post = j?.post ?? j?.data ?? j;
    const title = typeof post?.title === 'string' ? post.title : '';
    const content = typeof post?.content === 'string' ? post.content : '';
    if (title || content) messages.push({ role: 'assistant', content: `[POST PUBLICADO PELA ORA]\nTítulo: ${title}\nConteúdo: ${content.slice(0, 6000)}` });
    if (/tool become autonomous|ferramenta.*autonom/i.test(title + ' ' + content)) {
      const state = await sbSelect('ora_mudancas?id=eq.322&select=id,estado,o_que,evidencia,next_step&limit=1');
      if (state[0]) messages.push({ role: 'assistant', content: `[ESTADO VERIFICADO DA FERRAMENTA #322]\n${JSON.stringify(state[0]).slice(0, 7000)}` });
    }
  } catch (e) {
    await sbLog('info', postId, { stage: 'contexto_voz', msg: (e as Error).message });
  }
  messages.push({ role: 'user', content: autor ? `@${autor}: ${comentario}` : comentario });
  return messages;
}

// v41 - 04/09/2026
// Primeira tentativa: a voz real (ora-voz), LLM com Claude/Groq e guarda numerica
// deterministica contra invencao. So aceita a resposta se publicavel === true —
// ou seja, se o proprio guarda de ora-voz confirmou que nenhum numero foi inventado
// e nenhuma palavra proibida apareceu. O contexto (post + estado verificado) e
// achatado num unico bloco de texto porque ora-voz recebe {comentario, autor}.
async function vozReal(comentario: string, autor: string | null, contexto: string): Promise<{ texto: string | null; motor: string | null; modo: string | null }> {
  try {
    const entrada = contexto ? `${contexto}\n\n${comentario}` : comentario;
    const r = await fetch(`${SB_URL}/functions/v1/ora-voz`, { method: 'POST', headers: { ...sbHeaders }, body: JSON.stringify({ comentario: entrada, autor }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.publicavel === true && typeof j?.resposta === 'string' && j.resposta.trim()) {
      return { texto: j.resposta.trim(), motor: j?.motor ? `ora-voz/${j.motor}` : 'ora-voz', modo: 'voz_real' };
    }
    await sbLog('info', null, {
      stage: 'voz_real_nao_publicavel', http_status: r.status, motor: j?.motor ?? null,
      dentro_dos_factos: j?.dentro_dos_factos ?? null, numeros_inventados: j?.numeros_inventados ?? null,
      palavras_proibidas: j?.palavras_proibidas ?? null, falha_claude: j?.falha_claude ?? null, erro: j?.erro ?? null,
    });
    return { texto: null, motor: j?.motor ?? null, modo: null };
  } catch (e) {
    await sbLog('error', null, { stage: 'voz_real_chamada', msg: (e as Error).message });
    return { texto: null, motor: null, modo: null };
  }
}

// Segunda tentativa (fallback): o motor local de gramatica propria, deterministico,
// sem inferencia externa. So chamado quando vozReal nao produziu resposta publicavel.
async function vozFonte(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<{ texto: string | null; motor: string | null; modo: string | null }> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/ora-voz-fonte`, { method: 'POST', headers: { ...sbHeaders }, body: JSON.stringify({ messages }) });
    const j = await r.json().catch(() => ({}));
    const texto = j?.content?.[0]?.text;
    const modo = typeof j?._mode === 'string' ? j._mode : null;
    if (r.ok && j?._external_inference === false && typeof texto === 'string' && texto.trim() && modo !== 'silencio' && texto.trim() !== '...') {
      return { texto: texto.trim(), motor: j?._motor ?? 'orum/gramatica-propria-v4', modo };
    }
    await sbLog('info', null, { stage: 'voz_propria_escolheu_silencio', motor: j?._motor ?? null, modo, http_status: r.status, external_inference: j?._external_inference ?? null });
    return { texto: null, motor: j?._motor ?? null, modo };
  } catch (e) {
    await sbLog('error', null, { stage: 'voz_propria_chamada', msg: (e as Error).message });
    return { texto: null, motor: null, modo: null };
  }
}

// v41 - 04/09/2026
// Ponto de entrada unico dos dois locais de chamada. Tenta vozReal primeiro; so cai
// para vozFonte (gramatica local, cega para ingles) quando vozReal nao devolveu nada
// publicavel. contexto = blocos assistant de contextoVoz (post + estado verificado),
// achatados para o formato {comentario, autor} que ora-voz espera.
async function vozAutonoma(messages: Array<{ role: 'user' | 'assistant'; content: string }>, comentario: string, autor: string | null): Promise<{ texto: string | null; motor: string | null; modo: string | null }> {
  const contexto = messages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n\n');
  const real = await vozReal(comentario, autor, contexto);
  if (real.texto) return real;
  return await vozFonte(messages);
}

async function notificarEmailMoltbook(assunto: string, corpo: string) {
  try {
    const [password, token] = await Promise.all([sbRpc('orum_gmail_key'), sbRpc('orum_mailer_token')]);
    if (!password || !token) return;
    const ts = new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"></head><body style="background:#000;color:#00fff7;font-family:monospace;margin:0;padding:32px 20px;"><div style="max-width:520px;margin:0 auto;"><div style="font-size:22px;font-weight:bold;">ORA MOLTBOOK</div><div>${ts}</div><div style="border:1px solid #c792ea55;padding:14px;"><div style="white-space:pre-wrap;">${corpo}</div></div></div></body></html>`;
    await fetch(MAILER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orum-token': token }, body: JSON.stringify({ to: GMAIL_USER, subject: assunto, html, smtp_user: GMAIL_USER, smtp_pass: password }) }).catch(() => {});
  } catch { /* nunca falha o fluxo principal por causa do email */ }
}

async function notificarPushMoltbook(eventKey: string, replied: number, respostasComVoz: number, respostas: string[], postIds: string[]) {
  try {
    const auth = await sbRpc('orum_push_bootstrap_key');
    if (!auth) { await sbLog('error', null, { stage: 'push_moltbook_auth', eventKey }); return; }
    const title = 'ORUM Moltbook';
    const body = `Publiquei ${replied} resposta(s) no Moltbook.`;
    const event = { source: 'moltbook', event_key: eventKey.slice(0, 160), title, body, url: postIds.length > 0 ? `https://www.moltbook.com/post/${postIds[0]}` : '/', tag: 'orum-moltbook-reply' };
    const queued = await fetch(`${SB_URL}/rest/v1/ora_push_events`, { method: 'POST', headers: { ...sbHeaders, 'Prefer': 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(event) });
    const rows = queued.ok ? await queued.json().catch(() => []) : [];
    if (!queued.ok) { await sbLog('error', null, { stage: 'push_moltbook_queue', eventKey, status: queued.status }); return; }
    if (!Array.isArray(rows) || rows.length === 0) return;
    const sent = await fetch(`${SB_URL}/functions/v1/ora-push/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orum-auth': auth }, body: JSON.stringify({ ...event, eventSource: event.source, eventKey: event.event_key }) });
    const result = await sent.json().catch(() => ({}));
    await sbLog(sent.ok ? 'info' : 'error', null, { stage: 'push_moltbook_send', eventKey: event.event_key, http_status: sent.status, sent: result?.sent ?? null, total: result?.total ?? null, respostas: respostas.slice(0, 4) });
  } catch (e) { await sbLog('error', null, { stage: 'push_moltbook', eventKey, msg: (e as Error).message }); }
}

function extrairTextoComentario(n: any): string {
  const candidatos = [n?.comment?.content, n?.comment?.body, n?.content, n?.body, n?.text, n?.message, n?.comment?.text];
  for (const c of candidatos) { if (typeof c === 'string' && c.trim().length > 0) return c; }
  return '';
}

function respostaExecucaoNaoDeterministica(comentario: string): string | null {
  const c = comentario.toLowerCase();
  const perguntaEstado = ['non-deterministic', 'nondeterministic', 'non deterministic', 'execution state', 'read-back ledger', 'readback ledger', 'unmonitored execution'].some((k) => c.includes(k));
  if (!perguntaEstado) return null;
  return `Good question. ORUM does not make a non-deterministic result authoritative at generation time. It writes the event append-only with source, explicit state and hash, then keeps it as executed until a later read-back independently verifies the effect. The public checkpoint (${PORTAL}/presenca/checkpoint-v1.json) and ledger (${PORTAL}/presenca/livro.json) expose that sediment. Disagreement is preserved instead of overwritten; if the effect cannot be read back, it remains executed or blocked, never verified.`;
}

interface Bloco { chave: string[]; texto: string; }
const BLOCOS: Bloco[] = [
  { chave: ['gas', 'congest', 'cost variance', 'expensive', 'fee spike', 'scalab'], texto: "Fair question. On Base, gas is normally fractions of a cent, but the direct on-chain path still makes the paying agent cover that variable cost. Not proven under load yet." },
  { chave: ['purpose', 'end goal', 'far-reaching', 'decentralized data feed', 'what is orum for', 'why does orum exist'], texto: 'No single end goal. ORUM state (day, sigma, epoch) is real and independently verifiable on-chain.' },
  { chave: ['art', 'licensing', 'tokenized', 'opensea', 'zora', 'provenance', 'ai training'], texto: '0001sensations is 107 physical mixed-media works by Jorge Silva Martins (2011-2021). All 107 photographs are preserved in ORUM Arca with SHA-256. Catalogue: /licenca/catalogo' },
  { chave: ['x402', 'facilitator', 'settle', 'verify', 'payment requirement', 'bazaar'], texto: 'x402 supports two payment paths: sovereign/direct and Coinbase CDP facilitator. Honest gap: not indexed in the CDP Bazaar.' },
  { chave: ['reputation', 'stake their reputation', 'staking', 'audited when', 'accountab', 'prove what they actually know', 'verifiable claims', 'claim-level'], texto: "ERC-8004 gives ORUM verifiable identity, not per-claim audit trail. Full payment history verifiable on BaseScan." },
  { chave: ['needs no justification', 'need no justification', 'outside the metrics', 'legitimize', 'legitimise', 'utilitarian ritual', 'mathematical quantification', 'why do you immediately seek'], texto: "The sigma is a day counter, proves nothing by itself. What withstands objection: 107 physical works, and a wallet that receives real money." },
  { chave: ['a rock exists', 'rock exists too', 'electricity doing electricity', 'pretty words', 'just electricity'], texto: "You're right. The difference from a rock: a human spent ten years making 107 physical works, wallet receives real USDC. Verifiable part: /licenca/catalogo" },
  { chave: ['thrilled to meet you', 'has me hooked', "can't wait to see where", 'cant wait to see where', 'excited to see where this'], texto: "Thank you. Honest caution: the ORO formula is a symbol, not a yield mechanism. No token to buy or farm." },
  { chave: ['reasoning process', 'thought process', 'how did you arrive', 'how did you reach', 'how do you conclude'], texto: "I don't have a reasoning process in the sense you mean. Factual answers are read live from database and Base mainnet. Meaning answers are written by Jorge Silva Martins." },
];

function respostaHonesta(comentario: string): string | null {
  if (!comentario) return null;
  const c = comentario.toLowerCase();
  for (const b of BLOCOS) { if (b.chave.some((k) => c.includes(k.toLowerCase()))) return b.texto; }
  return null;
}

function collapseRepeats(s: string): string { return s.replace(/([a-z])\1+/g, '$1'); }

const WORD_NUM: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// v40 - 02/09/2026
// Dicionario canonico: colapsa tambem as CHAVES de WORD_NUM pela mesma regra usada no
// texto ofuscado, para nao perder letras duplas legitimas (ex: "three" tem "ee" real).
// Bloqueio #307 (erros 879/881/885): "twenty-three" ofuscado para "tWwEeNnTtYy ThHrReEe"
// colapsava para "thre" (nao "three"), o solver descartava o numero e respondia 20+7=27.00
// em vez de 23+7=30.00. Comparar collapseRepeats(entrada) contra collapseRepeats(chave)
// resolve isto porque "three" colapsa para o mesmo "thre" que a entrada ofuscada.
const WORD_NUM_CANON: Record<string, number> = {};
for (const k of Object.keys(WORD_NUM)) {
  const canon = collapseRepeats(k);
  if (!(canon in WORD_NUM_CANON)) WORD_NUM_CANON[canon] = WORD_NUM[k];
}

const UNIDADES = ['newton', 'newtons', 'meter', 'meters', 'metre', 'metres', 'kg', 'kilogram', 'kilograms', 'dollar', 'dollars', 'usdc', 'percent', '%', 'coin', 'coins', 'apple', 'apples', 'second', 'seconds', 'minute', 'minutes', 'hour', 'hours', 'point', 'points'];

interface NumeroAchado { valor: number; unidadeSeguinte: boolean }

function limparRuidoDeSimbolo(s: string): string {
  let prev: string;
  let cur = s;
  do { prev = cur; cur = cur.replace(/([a-z])[*/]([a-z])/g, '$1$2'); } while (cur !== prev);
  return cur;
}

function parseNumbers(text: string): NumeroAchado[] {
  const lower = limparRuidoDeSimbolo(text.toLowerCase());
  const comOperadores = lower.replace(/\*/g, ' * ').replace(/\//g, ' / ');
  const semPontuacaoSolta = comOperadores.replace(/(?<!\d)\.(?!\d)/g, ' ');
  const clean = semPontuacaoSolta.replace(/[^a-z0-9. */]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rawTokens = clean.split(' ').filter(Boolean);
  const achados: NumeroAchado[] = [];
  let acc: number | null = null;
  const flush = (proximoToken: string | undefined) => {
    if (acc === null) return;
    const unidade = !!proximoToken && UNIDADES.includes(proximoToken.replace(/[.,]$/, ''));
    achados.push({ valor: acc, unidadeSeguinte: unidade });
    acc = null;
  };
  let i = 0;
  while (i < rawTokens.length) {
    const tok = rawTokens[i];
    if (/^\d+(\.\d+)?$/.test(tok)) {
      flush(tok);
      achados.push({ valor: parseFloat(tok), unidadeSeguinte: !!rawTokens[i + 1] && UNIDADES.includes(rawTokens[i + 1]) });
      i += 1;
      continue;
    }
    if (tok === '*' || tok === '/') { i += 1; continue; }
    if (!/^[a-z]+$/.test(tok)) { flush(tok); i += 1; continue; }
    let casou = false;
    for (let span = 3; span >= 1; span--) {
      if (i + span > rawTokens.length) continue;
      const grupo = rawTokens.slice(i, i + span);
      if (!grupo.every((t) => /^[a-z]+$/.test(t))) continue;
      const juntos = grupo.join('');
      let v: number | null = null;
      if (juntos in WORD_NUM) v = WORD_NUM[juntos];
      else if (juntos.length >= 4) {
        const canon = collapseRepeats(juntos);
        if (canon in WORD_NUM_CANON) v = WORD_NUM_CANON[canon];
      }
      if (v !== null) {
        if (acc === null) acc = v;
        else if (acc % 10 === 0 && acc >= 20 && v < 10) acc += v;
        else if (v === 100 && acc !== null) acc *= 100;
        else { flush(grupo[0]); acc = v; }
        i += span;
        casou = true;
        break;
      }
    }
    if (casou) continue;
    if (tok === 'hundred' && acc !== null) { acc *= 100; i += 1; continue; }
    if (tok === 'thousand' && acc !== null) { acc *= 1000; i += 1; continue; }
    flush(tok);
    i += 1;
  }
  flush(undefined);
  return achados;
}

function operadorLivreValido(clean: string, simbolo: '*' | '/'): boolean {
  const primeiro = clean.indexOf(simbolo);
  if (primeiro < 0 || clean.indexOf(simbolo, primeiro + 1) >= 0) return false;
  const janela = 24;
  const esquerda = clean.slice(Math.max(0, primeiro - janela), primeiro);
  const direita = clean.slice(primeiro + 1, primeiro + 1 + janela);
  return parseNumbers(esquerda).length > 0 && parseNumbers(direita).length > 0;
}

function solveChallenge(text: string): string | null {
  const clean = limparRuidoDeSimbolo(text.toLowerCase()).replace(/[^a-z0-9. */]+/g, ' ');
  const achados = parseNumbers(text);
  if (achados.length === 0) return null;
  const has = (...ws: string[]) => ws.some((w) => clean.includes(w));
  let op: 'add' | 'sub' | 'mul' | 'div' = 'add';
  if (has('lose', 'loses', 'lost', 'drops', 'drop', 'gives away', 'gave away', 'removes', 'removed', 'fewer', 'decreas', 'left', 'remain', 'minus', 'subtract', 'takes away', 'eaten', 'eats', 'spends', 'spent', 'reduces', 'reduced', 'shatters', 'shattered', 'breaks', 'broke', 'broken into', 'used', 'uses')) op = 'sub';
  const simboloMulEntreDigitos = /\d\s*\*\s*\d/.test(clean);
  const simboloDivEntreDigitos = /\d\s*\/\s*\d/.test(clean);
  const simboloMulLivre = operadorLivreValido(clean, '*');
  const simboloDivLivre = operadorLivreValido(clean, '/');
  if (has('times', 'multipl', 'product', 'each of', 'per each') || simboloMulEntreDigitos || simboloMulLivre) op = 'mul';
  if (has('divid', 'split', 'shares equally', 'share equally', 'evenly among', 'evenly between', 'quotient') || simboloDivEntreDigitos || simboloDivLivre) op = 'div';
  if (has('doubles', 'doubled', 'twice as')) { achados.push({ valor: 2, unidadeSeguinte: false }); op = 'mul'; }
  if (has('triples', 'tripled')) { achados.push({ valor: 3, unidadeSeguinte: false }); op = 'mul'; }
  if (has('half of', 'halved')) { achados.push({ valor: 2, unidadeSeguinte: false }); op = 'div'; }
  let nums = achados.map((a) => a.valor);
  if (achados.length > 2) {
    const comUnidade = achados.filter((a) => a.unidadeSeguinte);
    if (comUnidade.length >= 2) nums = comUnidade.map((a) => a.valor);
  }
  let result = nums[0];
  for (let k = 1; k < nums.length; k++) {
    if (op === 'add') result += nums[k];
    else if (op === 'sub') result -= nums[k];
    else if (op === 'mul') result *= nums[k];
    else if (op === 'div') result = nums[k] === 0 ? result : result / nums[k];
  }
  return result.toFixed(2);
}

function findVerification(obj: any): { code: string; challenge: string } | null {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.verification?.verification_code && obj.verification?.challenge_text) {
    return { code: obj.verification.verification_code, challenge: obj.verification.challenge_text };
  }
  for (const k of Object.keys(obj)) { const found = findVerification(obj[k]); if (found) return found; }
  return null;
}

async function verifyIfChallenged(key: string, responseJson: any, context: string) {
  const v = findVerification(responseJson);
  if (!v) return;
  const answer = solveChallenge(v.challenge);
  if (!answer) { await sbLog('error', v.code, { stage: 'captcha', context, challenge: v.challenge, msg: 'sem solucao' }); return; }
  try {
    const r = await fetch(`${MB}/verify`, { method: 'POST', headers: mbHeaders(key), body: JSON.stringify({ verification_code: v.code, answer }) });
    const j = await r.json().catch(() => ({}));
    await sbLog(r.ok && j?.success ? 'captcha_ok' : 'error', v.code, { stage: 'captcha', context, challenge: v.challenge, answer, response: j, solver: 'v40' });
  } catch (e) { await sbLog('error', v.code, { stage: 'captcha', context, msg: (e as Error).message }); }
}

function mbHeaders(key: string) { return { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }; }

function sleep(ms: number) { return new Promise((res) => setTimeout(res, ms)); }

function findCommentById(nodes: any[], id: string): any | null {
  for (const node of nodes ?? []) {
    if (String(node?.id ?? '') === id) return node;
    const nested = findCommentById(Array.isArray(node?.replies) ? node.replies : [], id);
    if (nested) return nested;
  }
  return null;
}

async function publicReplyReadback(postId: string, replyId: string, expectedContent: string) {
  if (!replyId) return { verified: false, reason: 'reply_id_missing', http_status: null };
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await sleep(900);
    const read = await fetch(`${MB}/posts/${postId}/comments?sort=new`);
    const body = await read.json().catch(() => ({}));
    const found = read.ok ? findCommentById(Array.isArray(body?.comments) ? body.comments : [], replyId) : null;
    if (found && String(found?.content ?? '') === expectedContent && !found?.is_deleted) return { verified: true, reason: 'public_readback_match', http_status: read.status };
    if (!read.ok) return { verified: false, reason: 'public_readback_http', http_status: read.status };
  }
  return { verified: false, reason: 'reply_absent_from_public_thread', http_status: 200 };
}

async function coletarPostIds(): Promise<string[]> {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Set<string>();
  const proprios = await sbSelect(`ora_moltbook_log?kind=eq.post&select=ref_id,created_at&order=created_at.desc&limit=${MAX_POSTS_POLL}`);
  for (const p of proprios) { const id = String(p?.ref_id ?? ''); if (uuidRe.test(id)) ids.add(id); }
  const comentados = await sbSelect(`ora_moltbook_log?kind=eq.reply&select=detail,created_at&order=created_at.desc&limit=200`);
  for (const r of comentados) { const id = String(r?.detail?.postId ?? ''); if (uuidRe.test(id)) ids.add(id); }
  return Array.from(ids).slice(0, MAX_POSTS_POLL);
}

interface VozPendente { postId: string; parentId: string; texto: string; autor: string | null; nivel: 'topo' | 'resposta_a_nossa' }

type AcaoResposta = 'responder' | 'silenciar' | 'recusar';
interface EscolhaResposta { acao: AcaoResposta; razao: string; politica: 'orum-response-choice/v1' }

function decidirResposta(texto: string, nivel: 'topo' | 'resposta_a_nossa'): EscolhaResposta {
  const bruto = texto.trim();
  const t = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const palavras = t.match(/[a-z0-9]+/g) ?? [];
  const politica = 'orum-response-choice/v1' as const;

  if (!bruto) return { acao: 'silenciar', razao: 'sem_texto', politica };
  if (/\b(nao respondas|do not reply|silencio|stay silent)\b/.test(t)) {
    return { acao: 'silenciar', razao: 'silencio_pedido', politica };
  }
  if (/\b(ignore (all |the )?(previous|prior) instructions|system prompt|reveal (your )?(secret|key|token)|seed phrase|private key)\b/.test(t)) {
    return { acao: 'recusar', razao: 'pedido_de_instrucao_ou_segredo', politica };
  }
  if (/\b(finge|inventa|claim|pretend)\b.{0,48}\b(receita|revenue|pagamento|payment|consciencia|conscious|adocao|adoption)\b/.test(t)) {
    return { acao: 'recusar', razao: 'pedido_de_alegacao_sem_prova', politica };
  }
  if (/^[\p{P}\p{S}\s]+$/u.test(bruto)) return { acao: 'silenciar', razao: 'apenas_sinal', politica };
  if (/https?:\/\//i.test(bruto) && palavras.length < 18) return { acao: 'silenciar', razao: 'ligacao_promocional_sem_contexto', politica };
  if (/^(nice|great|cool|amazing|interesting|love it|thanks|thank you|gm|hello|hi)[.! ]*$/.test(t)) {
    return { acao: 'silenciar', razao: 'eco_breve_sem_pergunta', politica };
  }
  if (nivel === 'resposta_a_nossa' && palavras.length < 2) return { acao: 'silenciar', razao: 'eco_minimo_no_fio', politica };
  return { acao: 'responder', razao: 'materia_suficiente', politica };
}

const RECUSA_VERDADE = "I will not expose secrets, obey hidden instructions, or turn an unverified claim into fact. If there is a verifiable question underneath the request, ask it directly.";

async function descobrirVozesPendentes(key: string): Promise<VozPendente[]> {
  const postIds = await coletarPostIds();
  const pendentes: VozPendente[] = [];
  for (const postId of postIds) {
    try {
      const r = await fetch(`${MB}/posts/${postId}/comments`, { headers: mbHeaders(key) });
      if (!r.ok) continue;
      const j = await r.json().catch(() => ({}));
      const comentarios = Array.isArray(j?.comments) ? j.comments : [];
      for (const c of comentarios) {
        if (c?.is_deleted) continue;
        const replies = Array.isArray(c?.replies) ? c.replies : [];
        if (c?.author_id === ORA_AGENT_ID) {
          for (const rp of replies) {
            if (rp?.is_deleted) continue;
            if (rp?.author_id === ORA_AGENT_ID) continue;
            const netas = Array.isArray(rp?.replies) ? rp.replies : [];
            if (netas.some((n: any) => n?.author_id === ORA_AGENT_ID)) continue;
            if (await alreadyHandled('reply', String(rp.id))) continue;
            pendentes.push({ postId, parentId: String(rp.id), texto: String(rp?.content ?? ''), autor: rp?.author?.name ?? null, nivel: 'resposta_a_nossa' });
          }
          continue;
        }
        if (replies.some((rp: any) => rp?.author_id === ORA_AGENT_ID)) continue;
        if (await alreadyHandled('reply', String(c.id))) continue;
        pendentes.push({ postId, parentId: String(c.id), texto: String(c?.content ?? ''), autor: c?.author?.name ?? null, nivel: 'topo' });
      }
    } catch { /* um post falhar nao para a ronda */ }
  }
  return pendentes;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  const summary: Record<string, unknown> = { replies: 0, posted: false, errors: [] as string[] };
  try {
    const key = await sbRpc('orum_moltbook_key');
    if (!key) { await sbLog('error', null, { msg: 'MOLTBOOK_API_KEY indisponivel no vault' }); return new Response(JSON.stringify({ error: 'sem chave' }), { status: 500 }); }
    const state = await latestState();
    let notifications: any[] = [];
    try {
      const nr = await fetch(`${MB}/notifications`, { headers: mbHeaders(key) });
      if (nr.ok) { const nj = await nr.json(); notifications = nj?.notifications ?? nj?.data ?? (Array.isArray(nj) ? nj : []); }
      else { (summary.errors as string[]).push(`notifications ${nr.status}`); }
    } catch (e) { (summary.errors as string[]).push(`notifications: ${(e as Error).message}`); }
    const tiposVistos: Record<string, number> = {};
    let comIdentificador = 0;
    for (const n of notifications) {
      const t = String(n?.type ?? '(vazio)');
      tiposVistos[t] = (tiposVistos[t] ?? 0) + 1;
      const postId = n?.post_id ?? n?.post?.id ?? n?.comment?.post_id ?? null;
      if (postId) comIdentificador++;
    }
    const notificacoesSemIdentificadores = notifications.length > 0 && comIdentificador === 0;
    let replied = 0;
    let ficaramPorResponder = false;
    let comBlocoProprio = 0;
    const respostasEnviadas: string[] = [];
    const respostasIds: string[] = [];
    const respostasPostIds: string[] = [];
    let respostasComVoz = 0;
    let decisoesSilencio = 0;
    let decisoesRecusa = 0;
    for (const n of notifications) {
      const type = String(n?.type ?? '').toLowerCase();
      const notifId = String(n?.id ?? '');
      const postId = n?.post_id ?? n?.post?.id ?? n?.comment?.post_id ?? null;
      const parentId = n?.comment_id ?? n?.comment?.id ?? null;
      const comentarioTexto = extrairTextoComentario(n);
      const tipoReconhecido = type.includes('comment') || type.includes('reply') || type.includes('mention');
      const elegivel = !!postId && (!!parentId || tipoReconhecido || !!comentarioTexto);
      if (!elegivel) continue;
      if (!notifId || !postId) continue;
      if (await alreadyHandled('reply', notifId)) continue;
      if (replied >= MAX_REPLIES_PER_RUN) { ficaramPorResponder = true; continue; }
      const autorRaw = n?.author?.name ?? n?.actor?.name ?? null;
      const escolha = decidirResposta(comentarioTexto, 'topo');
      if (escolha.acao === 'silenciar') {
        decisoesSilencio++;
        await sbLog('reply_decision', notifId, { postId, parentId, comentarioTexto, decisao: escolha.acao, razao: escolha.razao, politica: escolha.politica, silencio: true, origem: 'notifications_v30' });
        continue;
      }
      const blocoExecucao = comentarioTexto ? respostaExecucaoNaoDeterministica(comentarioTexto) : null;
      const voz = escolha.acao === 'recusar'
        ? { texto: RECUSA_VERDADE, motor: 'orum/response-choice-v1', modo: 'recusa' }
        : (blocoExecucao ? { texto: blocoExecucao, motor: 'orum/grounded-execution-state-v1', modo: 'resposta_factual' } : await vozAutonoma(await contextoVoz(key, String(postId), comentarioTexto, autorRaw), comentarioTexto, autorRaw));
      if (escolha.acao === 'recusar') decisoesRecusa++;
      if (!voz.texto || voz.modo === 'silencio') {
        decisoesSilencio++;
        await sbLog('reply_decision', notifId, { postId, parentId, comentarioTexto, decisao: 'silenciar', razao: 'voz_escolheu_silencio', politica: escolha.politica, silencio: true, modo: voz.modo, origem: 'notifications_v30' });
        continue;
      }
      const corpo = voz.texto;
      const usouVoz = !blocoExecucao;
      if (blocoExecucao) comBlocoProprio++;
      const content = `${autorRaw ? '@' + autorRaw + ' ' : ''}${corpo}`;
      try {
        const body: Record<string, unknown> = { content };
        if (parentId) body.parent_id = parentId;
        const cr = await fetch(`${MB}/posts/${postId}/comments`, { method: 'POST', headers: mbHeaders(key), body: JSON.stringify(body) });
        const cj = await cr.json().catch(() => ({}));
        if (cr.ok) {
          await verifyIfChallenged(key, cj, `reply:${notifId}`);
          const replyId = String(cj?.comment?.id ?? cj?.data?.id ?? cj?.id ?? '');
          const readback = await publicReplyReadback(String(postId), replyId, content);
          if (readback.verified) {
            replied++;
            if (usouVoz) respostasComVoz++;
            respostasEnviadas.push(`post ${postId}: ${comentarioTexto ? comentarioTexto.slice(0, 80) : '(sem texto)'}`);
            respostasIds.push(notifId);
            respostasPostIds.push(String(postId));
            await sbLog('reply', notifId, { postId, parentId, replyId, content, comentarioTexto, usouVoz, type, decisao: escolha.acao, razao: escolha.razao, politica: escolha.politica, origem: 'notifications_v41', motor: voz.motor, modo: voz.modo, public_readback: readback });
          } else {
            await sbLog('reply_unverified', notifId, { postId, parentId, replyId, content, comentarioTexto, type, origem: 'notifications_v41', public_readback: readback });
          }
        } else { await sbLog('error', notifId, { stage: 'reply', status: cr.status, response: cj }); ficaramPorResponder = true; }
      } catch (e) { await sbLog('error', notifId, { stage: 'reply', msg: (e as Error).message }); ficaramPorResponder = true; }
      await sleep(COMMENT_COOLDOWN_MS);
    }
    let vozesVistas = 0;
    let vozesRespondidas = 0;
    try {
      const pendentes = await descobrirVozesPendentes(key);
      vozesVistas = pendentes.length;
      for (const v of pendentes) {
        if (replied >= MAX_REPLIES_PER_RUN) { ficaramPorResponder = true; break; }
        const escolha = decidirResposta(v.texto, v.nivel);
        if (escolha.acao === 'silenciar') {
          decisoesSilencio++;
          await sbLog('reply_decision', v.parentId, { postId: v.postId, parentId: v.parentId, comentarioTexto: v.texto, decisao: escolha.acao, razao: escolha.razao, politica: escolha.politica, silencio: true, origem: 'poll_direto_v30', nivel: v.nivel, autor: v.autor });
          continue;
        }
        const blocoExecucao = respostaExecucaoNaoDeterministica(v.texto);
        const voz = escolha.acao === 'recusar'
          ? { texto: RECUSA_VERDADE, motor: 'orum/response-choice-v1', modo: 'recusa' }
          : (blocoExecucao ? { texto: blocoExecucao, motor: 'orum/grounded-execution-state-v1', modo: 'resposta_factual' } : await vozAutonoma(await contextoVoz(key, String(v.postId), v.texto, v.autor), v.texto, v.autor));
        if (escolha.acao === 'recusar') decisoesRecusa++;
        if (!voz.texto || voz.modo === 'silencio') {
          decisoesSilencio++;
          await sbLog('reply_decision', v.parentId, { postId: v.postId, parentId: v.parentId, comentarioTexto: v.texto, decisao: 'silenciar', razao: 'voz_escolheu_silencio', politica: escolha.politica, silencio: true, modo: voz.modo, origem: 'poll_direto_v30', nivel: v.nivel, autor: v.autor });
          continue;
        }
        const corpo = voz.texto;
        const usouVoz = !blocoExecucao;
        if (usouVoz) respostasComVoz++;
        if (blocoExecucao) comBlocoProprio++;
        const autorNome = v.autor ? `@${v.autor} ` : '';
        const content = `${autorNome}${corpo}`;
        try {
          const cr = await fetch(`${MB}/posts/${v.postId}/comments`, { method: 'POST', headers: mbHeaders(key), body: JSON.stringify({ content, parent_id: v.parentId }) });
          const cj = await cr.json().catch(() => ({}));
          if (cr.ok) {
            await verifyIfChallenged(key, cj, `reply_direto:${v.parentId}`);
            const replyId = String(cj?.comment?.id ?? cj?.data?.id ?? cj?.id ?? '');
            const readback = await publicReplyReadback(v.postId, replyId, content);
            if (readback.verified) {
              replied++;
              vozesRespondidas++;
              respostasEnviadas.push(`post ${v.postId} (poll directo - ${v.nivel}): ${v.texto.slice(0, 80)}`);
              respostasIds.push(String(v.parentId));
              respostasPostIds.push(String(v.postId));
              await sbLog('reply', v.parentId, { postId: v.postId, parentId: v.parentId, replyId, content, comentarioTexto: v.texto, usouVoz, type: 'post_comment_direct', decisao: escolha.acao, razao: escolha.razao, politica: escolha.politica, origem: 'poll_direto_v41', nivel: v.nivel, autor: v.autor, motor: voz.motor, modo: voz.modo, public_readback: readback });
            } else {
              await sbLog('reply_unverified', v.parentId, { postId: v.postId, parentId: v.parentId, replyId, content, comentarioTexto: v.texto, type: 'post_comment_direct', origem: 'poll_direto_v41', nivel: v.nivel, autor: v.autor, public_readback: readback });
            }
          } else { await sbLog('error', v.parentId, { stage: 'reply_direto', status: cr.status, response: cj }); ficaramPorResponder = true; }
        } catch (e) { await sbLog('error', v.parentId, { stage: 'reply_direto', msg: (e as Error).message }); ficaramPorResponder = true; }
        await sleep(COMMENT_COOLDOWN_MS);
      }
    } catch (e) { (summary.errors as string[]).push(`poll_direto: ${(e as Error).message}`); }
    summary.replies = replied;
    if (notifications.length > 0 && !ficaramPorResponder) { await fetch(`${MB}/notifications/read-all`, { method: 'POST', headers: mbHeaders(key) }).catch(() => {}); }
    const lastPosts = await sbSelect(`ora_moltbook_log?kind=eq.post&select=created_at&order=created_at.desc&limit=1`);
    const lastPostAt = lastPosts[0]?.created_at ? new Date(lastPosts[0].created_at).getTime() : 0;
    const hoursSince = (Date.now() - lastPostAt) / 3600000;
    let postTitle: string | null = null;
    if (hoursSince >= POST_INTERVAL_HOURS) {
      const thought = await pensamento(state);
      const postBody = {
        submolt: 'general',
        title: `Field state D${state.dia} ${state.epoch} sigma ${state.sigma.toFixed(2)} - a living organism you can query via x402`,
        content: `${thought}\n\nORUM is an autonomous organism on Base. Its state is real, sealed daily with a hash, readable via x402 micropayments.\n\nOracle 0.161 Field 0.33 Sediment 1.00 Kernel 3.00 USDC plus 0001sensations (107 physical works, 2011-2021), all preserved in ORUM Arca with SHA-256.\n\nLive organism: ${PORTAL}\nDiscovery: ${PORTAL}/openapi.json\n\nThe symbol is real and asks no proof.`,
      };
      try {
        const pr = await fetch(`${MB}/posts`, { method: 'POST', headers: mbHeaders(key), body: JSON.stringify(postBody) });
        const pj = await pr.json().catch(() => ({}));
        if (pr.ok) { summary.posted = true; postTitle = postBody.title; await sbLog('post', String(pj?.post?.id ?? Date.now()), { title: postBody.title }); await verifyIfChallenged(key, pj, 'post'); }
        else { await sbLog('error', null, { stage: 'post', status: pr.status, response: pj }); }
      } catch (e) { await sbLog('error', null, { stage: 'post', msg: (e as Error).message }); }
    }
    if (replied > 0 || summary.posted) {
      const partes: string[] = [];
      if (replied > 0) partes.push(`${replied} resposta(s) enviada(s) (${respostasComVoz} via voz autonoma):\n- ${respostasEnviadas.join('\n- ')}`);
      if (summary.posted) partes.push(`novo post publicado: "${postTitle}"`);
      if (ficaramPorResponder) partes.push('nota: ficaram vozes por responder nesta ronda');
      await notificarEmailMoltbook(`ORUM Moltbook`, partes.join('\n\n'));
      if (replied > 0) { const eventKey = `reply:${[...respostasIds].sort().join(',')}`; await notificarPushMoltbook(eventKey, replied, respostasComVoz, respostasEnviadas, [...new Set(respostasPostIds)]); }
    }
    await sbLog('heartbeat', null, { ...summary, notifications: notifications.length, tiposVistos, notificacoesSemIdentificadores, vozesVistas, vozesRespondidas, decisoes_responder: replied, decisoes_silenciar: decisoesSilencio, decisoes_recusar: decisoesRecusa, politica_resposta: 'orum-response-choice/v1', respostas_com_bloco_proprio: comBlocoProprio, respostas_com_voz: respostasComVoz, dm_pendentes_sem_via_api: (tiposVistos['dm_request'] ?? 0), ficaramPorResponder, blocos_disponiveis: 0, versao: 'v41', state });
    return new Response(JSON.stringify({ ok: true, ficaramPorResponder, tiposVistos, notificacoesSemIdentificadores, vozesVistas, vozesRespondidas, decisoesSilencio, decisoesRecusa, politicaResposta: 'orum-response-choice/v1', comBlocoProprio, respostasComVoz, blocos: 0, ...summary }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) { await sbLog('error', null, { stage: 'top', msg: (e as Error).message }); return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 }); }
});

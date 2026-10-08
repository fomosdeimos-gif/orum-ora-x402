// ORA · /economia/recebimentos.json — o que chegou de facto à carteira de sustento,
// lido da Base sem Supabase, sem credenciais e sem custo.
//
// Duas fontes independentes do Supabase, em paralelo; usa-se a primeira que servir,
// preferindo a leitura directa da cadeia:
//   1. RPC público, eth_getLogs (Transfer USDC → carteira). Os RPC públicos limitam o
//      intervalo de blocos (observado: "limited to 0 - 50 blocks range" e, em 08/10/2026,
//      "limited to a 500 range" no mainnet.base.org), por isso tenta-se 9000, 2000 e 500
//      blocos por pedido, com pedidos em paralelo limitado, dentro de um orçamento.
//   2. Indexador público Blockscout (sem chave), como alternativa. O Routescan foi tentado e
//      não serve a Base ("chain not supported", observado em 08/10/2026).
// Quando nenhuma serve, a resposta 503 diz porquê, fonte a fonte.
//
// Fronteiras: é observação on-chain, não contabilidade. Não classifica pagadores
// (interno/externo vem de ora_carteiras_classificacao, nunca se infere aqui), não
// prova identidade nem adopção, e transferências de qualquer valor entram (pó
// incluído). Serve também para reconciliar a via directa, que não escreve livro.
const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// BASE_RPC_URL (variável de ambiente, opcional) vem primeiro: um RPC com chave que aceite eth_getLogs
// em intervalos largos (p. ex. Infura) dá leitura completa; os públicos abaixo limitam o intervalo
// (observado a 08/10/2026: mainnet.base.org 500 blocos, 1rpc 50, blastapi 10, drpc recusa) e dão
// no máximo leitura parcial, sempre declarada em `cobertura`.
const RPCS = ['https://mainnet.base.org', 'https://base.gateway.tenderly.co', 'https://base.drpc.org',
  'https://base-rpc.publicnode.com', 'https://1rpc.io/base'];
// O URL com chave nunca aparece nas respostas.
const nomeRpc = (u) => (process.env.BASE_RPC_URL && u === process.env.BASE_RPC_URL ? 'BASE_RPC_URL (ambiente)' : u);
const listaRpc = () => (process.env.BASE_RPC_URL ? [process.env.BASE_RPC_URL, ...RPCS] : RPCS);
const INDEXADOR = 'https://base.blockscout.com/api/v2';
const BLOCK_S = 2;
const TAMANHOS = [9000, 2000, 500];
const MAX_PEDIDOS = 100; // 24 h = 87 pedidos de 500 blocos
const MIN_COBERTURA_BLOCOS = 1800; // menos de ~1 h lida não conta como leitura
const PARALELO = 4; // o mainnet.base.org responde "over rate limit" com 16 em paralelo (observado em 08/10/2026)
const UA = 'ora-x402-gateway/1.0 (+https://ora-x402-gateway.vercel.app)';
const PRAZO_MS = 7000; // o plano Hobby corta as funções aos 10 s
const MAX_HORAS = 72;
const MAX_ROWS = 200;
const MAX_PAGINAS = 6;
const PRECOS = { '161000': 'oraculo', '330000': 'campo' };

const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const curto = (e) => String((e && e.message) || e).slice(0, 160);
const limiteDeIntervalo = (e) => /range|limit|too many|exceed|block/i.test(curto(e));

const limiteDeTaxa = (e) => /rate limit|too many requests|429/i.test(curto(e));

async function chamarRpc(url, method, params, ms) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(ms) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

// Percorre as janelas da mais recente para a mais antiga, em lotes pequenos; pára à primeira
// falha e devolve só o prefixo contíguo que foi lido (nunca um buraco no meio).
async function varrer(pedir, ranges, paralelo, pausa, limite) {
  const lidas = [];
  let erro = null;
  for (let i = 0; i < ranges.length && !erro; i += paralelo) {
    if (Date.now() >= limite) { erro = new Error('prazo esgotado'); break; }
    const lote = ranges.slice(i, i + paralelo);
    const rs = await Promise.allSettled(lote.map(pedir));
    for (let k = 0; k < rs.length; k++) {
      if (rs[k].status === 'rejected') { erro = rs[k].reason; break; }
      lidas.push({ range: lote[k], logs: rs[k].value });
    }
    if (!erro && pausa > 0 && i + paralelo < ranges.length) await new Promise((r) => setTimeout(r, pausa));
  }
  return { lidas, erro };
}

// Se a mensagem de erro diz o intervalo máximo ("limited to a 500 range", "0 - 50 blocks range"),
// salta directamente para um tamanho que caiba, em vez de tentar todos.
function tamanhoIndicado(e) {
  const m = /(\d{2,5})\s*(?:blocks?\s*)?range|0 - (\d{2,5})|up to (?:a )?(\d{2,5})/i.exec(curto(e));
  const n = m ? Number(m[1] || m[2] || m[3]) : 0;
  return n >= 10 ? n : 0;
}

// Devolve leitura completa da janela pedida ou, se o RPC só aguentou parte, a parte mais recente
// com a cobertura declarada (parcial). Nunca se apresenta uma janela parcial como completa.
async function viaRpc({ call, urls, pausa = 120 }, horas, limite) {
  const tentativas = [];
  let melhorParcial = null;
  for (const url of urls) {
    if (Date.now() >= limite) { tentativas.push({ fonte: nomeRpc(url), erro: 'prazo esgotado' }); break; }
    const ms = () => Math.max(500, Math.min(4000, limite - Date.now()));
    let head;
    try { head = await call(url, 'eth_getBlockByNumber', ['latest', false], ms()); }
    catch (e) { tentativas.push({ fonte: nomeRpc(url), erro: 'cabeca: ' + curto(e) }); continue; }
    const latest = parseInt(head.number, 16);
    const latestTs = Number(BigInt(head.timestamp));
    const from = Math.max(0, latest - Math.ceil((horas * 3600) / BLOCK_S));
    const pedir = async ([a, b]) => {
      const params = [{ fromBlock: '0x' + a.toString(16), toBlock: '0x' + b.toString(16), address: USDC_BASE,
        topics: [TRANSFER_TOPIC, null, pad(WALLET)] }];
      try { return await call(url, 'eth_getLogs', params, ms()); }
      catch (e) { // uma só repetição, só para limite de taxa, depois de uma pausa curta
        if (!limiteDeTaxa(e) || Date.now() + 600 >= limite) throw e;
        await new Promise((r) => setTimeout(r, 300));
        return call(url, 'eth_getLogs', params, ms());
      }
    };
    let tamanhos = TAMANHOS.slice();
    while (tamanhos.length) {
      const tam = tamanhos.shift();
      const ranges = [];
      for (let e = latest; e >= from; e -= tam) ranges.push([Math.max(from, e - tam + 1), e]);
      const { lidas, erro } = await varrer(pedir, ranges.slice(0, MAX_PEDIDOS), PARALELO, pausa, limite);
      const completa = lidas.length === ranges.length;
      const blocoDe = lidas.length ? lidas[lidas.length - 1].range[0] : null;
      const cobertos = lidas.length ? latest - blocoDe + 1 : 0;
      if (lidas.length && (completa || cobertos >= MIN_COBERTURA_BLOCOS)) {
        const brutos = lidas.flatMap((x) => x.logs).map((l) => {
          const bn = parseInt(l.blockNumber, 16);
          return { tx: l.transactionHash, bloco: bn, logIndex: parseInt(l.logIndex, 16), ts: (latestTs - (latest - bn) * BLOCK_S) * 1000,
            de: '0x' + l.topics[1].slice(-40), atomic: BigInt(l.data).toString() };
        });
        const r = { brutos, origem: { tipo: 'rpc-base-publico', rpc: nomeRpc(url), hora: 'estimada (2 s por bloco)' },
          janela: { bloco_de: blocoDe, bloco_a: latest, cabeca_utc: new Date(latestTs * 1000).toISOString() },
          cobertura: { completa, horas_pedidas: horas, horas_cobertas: Math.round((cobertos * BLOCK_S / 3600) * 10) / 10,
            motivo: completa ? null : curto(erro || 'orcamento de pedidos') } };
        if (completa) return r;
        if (!melhorParcial || cobertos > melhorParcial.cobertos) melhorParcial = { ...r, cobertos };
        break; // este RPC só aguenta parte; passa ao seguinte, que talvez complete
      }
      tentativas.push({ fonte: nomeRpc(url), erro: `${tam} blocos: ${curto(erro || 'sem cobertura suficiente')}` });
      const n = tamanhoIndicado(erro);
      if (n) tamanhos = TAMANHOS.filter((t) => t <= n).concat(n < TAMANHOS[TAMANHOS.length - 1] ? [n] : []);
      else if (!erro || !limiteDeIntervalo(erro)) break;
    }
  }
  if (melhorParcial) { delete melhorParcial.cobertos; melhorParcial.cobertura.tentativas = tentativas; return melhorParcial; }
  const err = new Error('nenhum RPC serviu'); err.tentativas = tentativas; throw err;
}

async function viaIndexador({ fetchFn }, horas, agora, limite) {
  const corte = agora - horas * 3600 * 1000;
  const brutos = [];
  let params = { type: 'ERC-20', filter: 'to', token: USDC_BASE };
  try {
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      if (Date.now() >= limite) throw new Error('prazo esgotado');
      const r = await fetchFn(`${INDEXADOR}/addresses/${WALLET}/token-transfers?${new URLSearchParams(params)}`,
        { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(Math.max(500, Math.min(4000, limite - Date.now()))) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!Array.isArray(j.items)) throw new Error('formato inesperado');
      let maisAntigo = false;
      for (const t of j.items) {
        const ts = Date.parse(t.timestamp);
        if (!(ts >= corte)) { maisAntigo = true; continue; }
        const token = String(t.token?.address_hash || t.token?.address || '').toLowerCase();
        const para = String(t.to?.hash || '').toLowerCase();
        if (token !== USDC_BASE.toLowerCase() || para !== WALLET.toLowerCase()) continue;
        brutos.push({ tx: t.transaction_hash || t.tx_hash, bloco: Number(t.block_number), logIndex: Number(t.log_index || 0), ts,
          de: String(t.from?.hash || '').toLowerCase(), atomic: String(t.total?.value ?? '0') });
      }
      if (maisAntigo || !j.next_page_params) break;
      params = { type: 'ERC-20', filter: 'to', token: USDC_BASE, ...Object.fromEntries(Object.entries(j.next_page_params).map(([k, v]) => [k, String(v)])) };
    }
  } catch (e) { const err = new Error('indexador nao serviu'); err.tentativas = [{ fonte: INDEXADOR, erro: curto(e) }]; throw err; }
  return { brutos, origem: { tipo: 'indexador-blockscout', url: INDEXADOR, hora: 'do indexador' }, janela: { corte_utc: new Date(corte).toISOString() } };
}

function formatar(fonte, horas, agora) {
  const ordenados = fonte.brutos.slice().sort((x, y) => y.bloco - x.bloco || y.logIndex - x.logIndex);
  const linhas = ordenados.slice(0, MAX_ROWS).map((t) => ({ tx: t.tx, bloco: t.bloco, hora_utc: new Date(t.ts).toISOString(), de: t.de,
    valor_atomic: t.atomic, valor_usdc: Number(BigInt(t.atomic)) / 1e6, corresponde_ao_preco_de: PRECOS[t.atomic] || null, classificacao: 'nao_classificada' }));
  const total = ordenados.reduce((s, t) => s + BigInt(t.atomic), 0n);
  const cobertura = fonte.cobertura || { completa: true, horas_pedidas: horas, horas_cobertas: horas, motivo: null };
  return { ok: true, carteira: WALLET, ativo: 'USDC (Base)', janela: { horas, ...fonte.janela }, cobertura,
    ...(cobertura.completa ? {} : { aviso: `leitura PARCIAL: so as ultimas ${cobertura.horas_cobertas} h das ${horas} h pedidas; o total e as transferencias valem apenas para essa parte` }),
    n_transferencias: ordenados.length, total_usdc: Number(total) / 1e6, truncado: ordenados.length > MAX_ROWS, transferencias: linhas,
    fonte: { ...fonte.origem, consultado_utc: new Date(agora).toISOString() },
    nao_afirma: ['identidade do pagador', 'origem interna ou externa (ver ora_carteiras_classificacao)', 'adopcao externa', 'receita reconhecida', 'entrega do servico'] };
}

async function recebimentos(deps, horas, agora) {
  const limite = Date.now() + PRAZO_MS;
  const fontes = await Promise.allSettled([viaRpc(deps, horas, limite), viaIndexador(deps, horas, agora, limite)]);
  // ordem de preferência: leitura completa (cadeia directa, depois Blockscout); só então a parcial
  const ok = fontes.filter((f) => f.status === 'fulfilled').map((f) => f.value);
  const boa = ok.find((v) => !v.cobertura || v.cobertura.completa) || ok[0];
  if (boa) return formatar(boa, horas, agora);
  const err = new Error('nenhuma fonte serviu');
  err.tentativas = fontes.flatMap((f, i) => f.reason.tentativas || [{ fonte: ['rpc', 'indexador'][i], erro: curto(f.reason) }]);
  throw err;
}

function createHandler({ call = chamarRpc, fetchFn = (...a) => fetch(...a), urls, pausa = 120, now = () => Date.now() } = {}) {
  return async (req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    const send = (s, b) => { res.statusCode = s; res.end(JSON.stringify(b)); };
    const q = req.query || {};
    let horas = q.horas === undefined ? 24 : Number(q.horas);
    if (!Number.isFinite(horas) || horas <= 0) return send(400, { ok: false, error: 'horas invalido' });
    horas = Math.min(Math.floor(horas) || 1, MAX_HORAS);
    try { return send(200, await recebimentos({ call, fetchFn, urls: urls || listaRpc(), pausa }, horas, now())); }
    catch (e) { res.setHeader('cache-control', 'no-store'); return send(503, { ok: false, error: 'fontes_indisponiveis', tentativas: e.tentativas || [{ erro: curto(e) }] }); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.recebimentos = recebimentos;

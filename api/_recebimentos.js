// ORA · /economia/recebimentos.json — o que chegou de facto à carteira de sustento,
// lido directamente da Base por RPC público. Sem Supabase, sem credenciais, sem custo.
//
// Fronteiras: é observação on-chain, não contabilidade. Não classifica pagadores
// (interno/externo vem de ora_carteiras_classificacao, nunca se infere aqui), não
// prova identidade nem adopção, e transferências de qualquer valor entram (pó
// incluído). Serve também para reconciliar a via directa, que não escreve livro.
const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const BLOCK_S = 2;
const CHUNK = 9000;
const MAX_HORAS = 72;
const MAX_ROWS = 200;
const PRECOS = { '161000': 'oraculo', '330000': 'campo' };

const pad = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

async function rpcPublico(method, params) {
  let last = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return { result: j.result, rpc: url };
    } catch (e) { last = e; }
  }
  throw last || new Error('todos os RPC Base falharam');
}

async function recebimentos(rpc, horas, agora) {
  const { result: head, rpc: usado } = await rpc('eth_getBlockByNumber', ['latest', false]);
  const latest = parseInt(head.number, 16);
  const latestTs = Number(BigInt(head.timestamp));
  const from = Math.max(0, latest - Math.ceil((horas * 3600) / BLOCK_S));
  const ranges = [];
  for (let s = from; s <= latest; s += CHUNK) ranges.push([s, Math.min(s + CHUNK - 1, latest)]);
  const parts = await Promise.all(ranges.map(async ([a, b]) => (await rpc('eth_getLogs', [{
    fromBlock: '0x' + a.toString(16), toBlock: '0x' + b.toString(16), address: USDC_BASE,
    topics: [TRANSFER_TOPIC, null, pad(WALLET)] }])).result));
  const logs = parts.flat().sort((x, y) => parseInt(y.blockNumber, 16) - parseInt(x.blockNumber, 16) || parseInt(y.logIndex, 16) - parseInt(x.logIndex, 16));
  const rows = logs.slice(0, MAX_ROWS).map((l) => {
    const bn = parseInt(l.blockNumber, 16);
    const atomic = BigInt(l.data).toString();
    return { tx: l.transactionHash, bloco: bn, hora_estimada_utc: new Date((latestTs - (latest - bn) * BLOCK_S) * 1000).toISOString(),
      de: '0x' + l.topics[1].slice(-40), valor_atomic: atomic, valor_usdc: Number(BigInt(atomic)) / 1e6,
      corresponde_ao_preco_de: PRECOS[atomic] || null, classificacao: 'nao_classificada' };
  });
  const total = logs.reduce((s, l) => s + BigInt(l.data), 0n);
  return { ok: true, carteira: WALLET, ativo: 'USDC (Base)', janela: { horas, bloco_de: from, bloco_a: latest, cabeca_utc: new Date(latestTs * 1000).toISOString() },
    n_transferencias: logs.length, total_usdc: Number(total) / 1e6, truncado: logs.length > MAX_ROWS, transferencias: rows,
    fonte: { tipo: 'rpc-base-publico', rpc: usado, consultado_utc: new Date(agora).toISOString() },
    nao_afirma: ['identidade do pagador', 'origem interna ou externa (ver ora_carteiras_classificacao)', 'adopcao externa', 'receita reconhecida', 'entrega do servico'] };
}

function createHandler({ rpc = rpcPublico, now = () => Date.now() } = {}) {
  return async (req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    const send = (s, b) => { res.statusCode = s; res.end(JSON.stringify(b)); };
    const q = req.query || {};
    let horas = q.horas === undefined ? 24 : Number(q.horas);
    if (!Number.isFinite(horas) || horas <= 0) return send(400, { ok: false, error: 'horas invalido' });
    horas = Math.min(Math.floor(horas) || 1, MAX_HORAS);
    try { return send(200, await recebimentos(rpc, horas, now())); }
    catch (e) { res.setHeader('cache-control', 'no-store'); return send(503, { ok: false, error: 'base_rpc_unavailable', detalhe: String((e && e.message) || e) }); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.recebimentos = recebimentos;

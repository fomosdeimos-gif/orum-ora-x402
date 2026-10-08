// ORA · /economia/bitcoin.json — o que a cadeia Bitcoin mostra sobre as duas carteiras BTC
// da ORUM, só de leitura: sem Supabase, sem chave, sem custo, sem assinar nem enviar.
//
// Duas fontes Esplora independentes (Blockstream e mempool.space) são lidas em paralelo
// para cada endereço. Os saldos só são dados como concordantes quando as duas fontes
// coincidem; caso contrário a discrepância fica declarada e não se escolhe um número.
//
// Fronteiras: é observação on-chain, não contabilidade. Não classifica pagadores
// (interno/externo vem de ora_carteiras_classificacao, nunca se infere aqui), não prova
// controlo da chave de nenhum endereço, e a concordância de dois indexadores não equivale
// a validação por um nó próprio. Só se marca como "operacional ORUM" a origem que é
// literalmente o endereço operacional declarado.
const ENDERECOS = [
  { papel: 'recepcao', endereco: 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf', nota: 'declarado por Unum; controlo nao afirmado' },
  { papel: 'operacional', endereco: 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7', nota: 'chave no Vault; hot wallet' },
];
const OPERACIONAL = ENDERECOS[1].endereco;
const FONTES = [
  { nome: 'blockstream', base: 'https://blockstream.info/api' },
  { nome: 'mempool.space', base: 'https://mempool.space/api' },
];
const PRAZO_MS = 7000; // o plano Hobby corta as funcoes aos 10 s
const MAX_TXS = 25;
const CONFIRMADO = 6; // o mesmo limiar do executor (docs/bitcoin-operational-wallet-v1.md)

const curto = (e) => String((e && e.message) || e).slice(0, 160);

async function pedir(fetchFn, url, limite) {
  const ms = Math.max(500, Math.min(4000, limite - Date.now()));
  const r = await fetchFn(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function resumirTxs(txs, endereco, altura) {
  return txs.slice(0, MAX_TXS).map((t) => {
    const recebido = (t.vout || []).filter((o) => o.scriptpubkey_address === endereco).reduce((s, o) => s + Number(o.value || 0), 0);
    const gasto = (t.vin || []).filter((i) => i.prevout && i.prevout.scriptpubkey_address === endereco).reduce((s, i) => s + Number(i.prevout.value || 0), 0);
    const de = [...new Set((t.vin || []).map((i) => i.prevout && i.prevout.scriptpubkey_address).filter(Boolean))];
    const st = t.status || {};
    const conf = st.confirmed && altura ? Math.max(0, altura - Number(st.block_height) + 1) : 0;
    return { txid: t.txid, confirmada: !!st.confirmed, confirmacoes: conf, estado: !st.confirmed ? 'mempool' : conf >= CONFIRMADO ? 'confirmada' : 'confirmando',
      bloco: st.confirmed ? Number(st.block_height) : null, hora_utc: st.block_time ? new Date(st.block_time * 1000).toISOString() : null,
      recebido_sats: recebido, gasto_sats: gasto, de, de_carteira_operacional_orum: de.includes(OPERACIONAL), classificacao: 'nao_classificada' };
  }).filter((t) => t.recebido_sats > 0 || t.gasto_sats > 0);
}

async function lerFonte(fetchFn, fonte, endereco, limite) {
  const [altura, addr, txs] = await Promise.all([
    pedir(fetchFn, `${fonte.base}/blocks/tip/height`, limite),
    pedir(fetchFn, `${fonte.base}/address/${endereco}`, limite),
    pedir(fetchFn, `${fonte.base}/address/${endereco}/txs`, limite),
  ]);
  const h = Number(altura);
  if (!Number.isInteger(h) || !addr || !addr.chain_stats || !addr.mempool_stats || !Array.isArray(txs)) throw new Error('formato inesperado');
  const c = addr.chain_stats, m = addr.mempool_stats;
  return { altura: h, confirmado_sats: Number(c.funded_txo_sum) - Number(c.spent_txo_sum), mempool_sats: Number(m.funded_txo_sum) - Number(m.spent_txo_sum),
    recebido_total_sats: Number(c.funded_txo_sum), n_tx_confirmadas: Number(c.tx_count), n_tx_mempool: Number(m.tx_count), transacoes: resumirTxs(txs, endereco, h) };
}

async function observarEndereco(fetchFn, alvo, limite) {
  const lidas = await Promise.allSettled(FONTES.map((f) => lerFonte(fetchFn, f, alvo.endereco, limite)));
  const fontes = lidas.map((r, i) => r.status === 'fulfilled'
    ? { fonte: FONTES[i].nome, ok: true, altura: r.value.altura, confirmado_sats: r.value.confirmado_sats, mempool_sats: r.value.mempool_sats, n_tx_confirmadas: r.value.n_tx_confirmadas }
    : { fonte: FONTES[i].nome, ok: false, erro: curto(r.reason) });
  const boas = lidas.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  let concordancia = 'indisponivel';
  if (boas.length === 2) {
    const [a, b] = boas;
    concordancia = a.confirmado_sats === b.confirmado_sats && a.mempool_sats === b.mempool_sats && a.n_tx_confirmadas === b.n_tx_confirmadas
      ? 'concordam' : 'DISCREPANCIA';
  } else if (boas.length === 1) concordancia = 'fonte_unica';
  const ref = boas[0];
  return { papel: alvo.papel, endereco: alvo.endereco, nota: alvo.nota, concordancia, fontes,
    saldo_confirmado_sats: concordancia === 'concordam' || concordancia === 'fonte_unica' ? ref.confirmado_sats : null,
    saldo_mempool_sats: concordancia === 'concordam' || concordancia === 'fonte_unica' ? ref.mempool_sats : null,
    recebido_total_sats: concordancia === 'concordam' || concordancia === 'fonte_unica' ? ref.recebido_total_sats : null,
    transacoes: ref ? ref.transacoes : [] };
}

async function observar({ fetchFn }, agora) {
  const limite = Date.now() + PRAZO_MS;
  const enderecos = await Promise.all(ENDERECOS.map((a) => observarEndereco(fetchFn, a, limite)));
  if (enderecos.every((e) => e.concordancia === 'indisponivel')) {
    const err = new Error('nenhuma fonte serviu');
    err.tentativas = enderecos.flatMap((e) => e.fontes.map((f) => ({ endereco: e.endereco, fonte: f.fonte, erro: f.erro })));
    throw err;
  }
  return { ok: true, rede: 'bitcoin-mainnet', ativo: 'BTC', enderecos,
    fonte: { tipo: 'esplora-duas-fontes', fontes: FONTES.map((f) => f.base), consultado_utc: new Date(agora).toISOString(),
      ressalva: 'concordancia de dois indexadores publicos; nao e validacao por no proprio' },
    nao_afirma: ['controlo da chave do endereco de recepcao', 'identidade de quem enviou', 'origem interna ou externa (ver ora_carteiras_classificacao)',
      'adopcao externa', 'receita reconhecida', 'valor em moeda fiduciaria'] };
}

function createHandler({ fetchFn = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  return async (_req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    const send = (s, b) => { res.statusCode = s; res.end(JSON.stringify(b)); };
    try { return send(200, await observar({ fetchFn }, now())); }
    catch (e) { res.setHeader('cache-control', 'no-store'); return send(503, { ok: false, error: 'fontes_indisponiveis', tentativas: e.tentativas || [{ erro: curto(e) }] }); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.observar = observar;

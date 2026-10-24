'use strict';
// ORA · via Bitcoin para os serviços x402 da via directa (21/10/2026, livro ora_mudancas 932).
// Unum: "Eu autorizo, avança com os passos 1 a 4"; desde 21/10/2026 recebe na operacional BTC ("utiliza a carteira operacional para receber pagamentos"). Não é uma função (prefixo _): não conta para o limite de 12
// do Vercel Hobby. Só lê: não tem chave, não assina, não envia, não precisa de segredos.
//
// Como funciona:
// - o desafio 402 passa a trazer, em `pagamento_alternativo_bitcoin`, o preço em sats, a cotação, a validade e o
//   endereço. Fica fora de `accepts` e do cabeçalho PAYMENT-REQUIRED de propósito: o x402 padrão da Base
//   mantém-se igual e nenhum cliente existente muda de comportamento;
// - o cliente paga e apresenta o txid em X-PAYMENT = base64 de {"bitcoin":{"txid":"…"}};
// - a ORA só entrega depois de DUAS fontes Esplora independentes (Blockstream e mempool.space) verem a tx, concordarem
//   no valor recebido e na confirmação, e a tx ter CONF_ENTREGA confirmações. Uma fonte só, uma discrepância,
//   uma tx em mempool ou uma cotação indisponível nunca entregam.
//
// Fronteiras (repetidas na resposta): o preço em BTC é cotação, não preço fixo (aceita-se até 10% abaixo da cotação do
// momento da verificação); o o endereço de recepção é a carteira operacional BTC da ORA (chave no Vault; prova de controlo por assinatura ainda não feita); a
// prova é só o txid, por isso uma transferência recente e suficiente para o endereço serve a quem a apresentar
// (público na cadeia; o mesmo vale na via Base); com 1 confirmação não se exclui uma reorganização, o que é
// aceitável para serviços de poucos cêntimos. Receita só entra no 70/20/10 depois de confirmada como externa.
const { RECEBIMENTO_BTC: ENDERECO } = require('./_carteira');

const CAIP2 = 'bip122:000000000019d6689c085ae165831e93'; // Bitcoin mainnet (genesis)
const FONTES_TX = Object.freeze([
  Object.freeze({ nome: 'blockstream', base: 'https://blockstream.info/api' }),
  Object.freeze({ nome: 'mempool.space', base: 'https://mempool.space/api' }),
]);
const FONTES_PRECO = Object.freeze([
  Object.freeze({ nome: 'mempool.space', url: 'https://mempool.space/api/v1/prices', ler: (j) => Number(j && j.USD) }),
  Object.freeze({ nome: 'coinbase', url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot', ler: (j) => Number(j && j.data && j.data.amount) }),
]);
const CONF_ENTREGA = 1;         // confirmações exigidas antes de entregar
const JANELA_S = 72 * 3600;     // como na via Base
const MARGEM_COTACAO = 1.05;    // o preço anunciado leva 5% de folga para a cotação mexer
const TOLERANCIA = 0.9;         // aceita-se até 10% abaixo da cotação do momento da verificação
const VALIDADE_S = 600;         // validade da cotação anunciada
const TTL_COTACAO_MS = 60000;
const DIVERGENCIA_MAX = 0.02;   // as duas fontes de preço têm de ficar a 2% uma da outra
const PRAZO_MS = 4000;
const PRECO_MIN = 1000, PRECO_MAX = 10000000; // USD por BTC plausível; fora disto a cotação é lixo

const curto = (e) => String((e && e.message) || e).slice(0, 160);
const hex64 = (s) => typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);

function ligada(env) {
  const v = String((env && env.ORUM_BTC_RAIL) || '').trim().toLowerCase();
  return !['off', '0', 'false', 'none'].includes(v);
}

function satsPara(tier, usdPorBtc, factor = 1) {
  return Math.ceil((Number(tier.usdc) / usdPorBtc) * 1e8 * factor - 1e-9);
}

function createBtc({ fetchFn, env = process.env, now = () => Date.now() } = {}) {
  const pedir = (url) => (fetchFn || globalThis.fetch)(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(PRAZO_MS) });
  let cache = null; // { em, valor }

  async function cotarAgora() {
    const lidas = await Promise.allSettled(FONTES_PRECO.map(async (f) => {
      const r = await pedir(f.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const p = f.ler(await r.json());
      if (!Number.isFinite(p) || p < PRECO_MIN || p > PRECO_MAX) throw new Error('preco implausivel');
      return { fonte: f.nome, usd_por_btc: p };
    }));
    const boas = lidas.filter((x) => x.status === 'fulfilled').map((x) => x.value);
    const fontes = lidas.map((x, i) => x.status === 'fulfilled' ? { fonte: FONTES_PRECO[i].nome, ok: true, usd_por_btc: x.value.usd_por_btc } : { fonte: FONTES_PRECO[i].nome, ok: false, erro: curto(x.reason) });
    if (boas.length === 0) return { ok: false, fontes, motivo: 'nenhuma fonte de cotacao respondeu' };
    if (boas.length === 2) {
      const [a, b] = boas.map((x) => x.usd_por_btc);
      if (Math.abs(a - b) / Math.min(a, b) > DIVERGENCIA_MAX) return { ok: false, fontes, motivo: 'as fontes de cotacao divergem mais de 2%; nao se escolhe um numero' };
      return { ok: true, usd_por_btc: (a + b) / 2, concordancia: 'concordam', fontes };
    }
    return { ok: true, usd_por_btc: boas[0].usd_por_btc, concordancia: 'fonte_unica', fontes };
  }

  async function cotar() {
    const t = now();
    if (cache && t - cache.em < TTL_COTACAO_MS && t >= cache.em) return cache.valor;
    const valor = await cotarAgora();
    cache = { em: t, valor: { ...valor, cotado_em: new Date(t).toISOString() } };
    return cache.valor;
  }

  async function oferta(tier) {
    if (!ligada(env)) return { disponivel: false, motivo: 'via Bitcoin desligada (ORUM_BTC_RAIL)' };
    const c = await cotar();
    if (!c.ok) return { disponivel: false, motivo: c.motivo, fontes_cotacao: c.fontes };
    const sats = satsPara(tier, c.usd_por_btc, MARGEM_COTACAO);
    return { disponivel: true, rede: 'bitcoin-mainnet', caip2: CAIP2, activo: 'BTC', endereco: ENDERECO,
      uri: `bitcoin:${ENDERECO}?amount=${(sats / 1e8).toFixed(8)}`,
      preco_referencia_usd: tier.usdc, sats_anunciados: sats,
      cotacao: { usd_por_btc: Number(c.usd_por_btc.toFixed(2)), concordancia: c.concordancia, fontes: c.fontes, cotado_em: c.cotado_em, valido_segundos: VALIDADE_S,
        margem: `${Math.round((MARGEM_COTACAO - 1) * 100)}% acima da cotação`, tolerancia_na_verificacao: `aceita-se até ${Math.round((1 - TOLERANCIA) * 100)}% abaixo da cotação do momento da verificação` },
      confirmacoes_para_entrega: CONF_ENTREGA,
      passos: {
        passo_1: `Envia pelo menos ${sats} sats (${(sats / 1e8).toFixed(8)} BTC) para ${ENDERECO} na Bitcoin mainnet.`,
        passo_2: 'Guarda o txid (64 caracteres hexadecimais).',
        passo_3: `Repete o GET com X-PAYMENT = base64 de {"bitcoin":{"txid":"…"}}. Responde 402 pending até a tx ter ${CONF_ENTREGA} confirmação(ões) nas duas fontes; não pagues de novo.`,
        exemplo: 'X-PAYMENT: ' + Buffer.from(JSON.stringify({ bitcoin: { txid: 'TEU_TXID_AQUI' } }), 'utf8').toString('base64'),
      },
      janela: `A transferência tem de ter menos de ${JANELA_S / 3600} h de confirmada quando for apresentada.` };
  }

  // Lê uma fonte. Devolve { visto:false } (404), { erro } ou os factos da tx nessa fonte.
  async function lerFonte(fonte, txid) {
    try {
      const rt = await pedir(`${fonte.base}/tx/${txid}`);
      if (rt.status === 404) return { fonte: fonte.nome, visto: false };
      if (!rt.ok) throw new Error('HTTP ' + rt.status);
      const tx = await rt.json();
      if (!tx || !Array.isArray(tx.vout) || !Array.isArray(tx.vin) || !tx.status || tx.txid !== txid.toLowerCase()) throw new Error('formato inesperado');
      const rh = await pedir(`${fonte.base}/blocks/tip/height`);
      if (!rh.ok) throw new Error('HTTP ' + rh.status);
      const altura = Number(await rh.json());
      if (!Number.isInteger(altura)) throw new Error('altura invalida');
      const recebido = tx.vout.filter((o) => o && o.scriptpubkey_address === ENDERECO).reduce((s, o) => s + Number(o.value || 0), 0);
      const st = tx.status;
      const conf = st.confirmed && Number.isInteger(Number(st.block_height)) ? Math.max(0, altura - Number(st.block_height) + 1) : 0;
      const de = tx.vin.map((i) => i && i.prevout && i.prevout.scriptpubkey_address).find(Boolean) || null;
      return { fonte: fonte.nome, visto: true, recebido, confirmada: !!st.confirmed, confirmacoes: conf, blockTime: st.block_time ? Number(st.block_time) : null, pagador: de };
    } catch (e) { return { fonte: fonte.nome, erro: curto(e) }; }
  }

  // Devolve { valid, pending?, unavailable?, error?, confirmacoes?, sats?, payer?, blockMs? }
  async function verificar(txid, tier, nowMs) {
    if (!hex64(txid)) return { valid: false, error: 'txid invalido' };
    const id = txid.toLowerCase();
    const lidas = await Promise.all(FONTES_TX.map((f) => lerFonte(f, id)));
    const vistas = lidas.filter((x) => x.visto);
    const falhas = lidas.filter((x) => x.erro);
    if (vistas.length === 0 && falhas.length === 0) return { valid: false, pending: true, confirmacoes: 0, error: 'tx ainda nao vista pelas fontes' };
    if (falhas.length > 0) return { valid: false, unavailable: true, error: 'fonte Bitcoin indisponivel (' + falhas.map((x) => x.fonte + ': ' + x.erro).join('; ') + '); nao se entrega com uma fonte so' };
    if (vistas.length === 1) return { valid: false, pending: true, confirmacoes: 0, error: 'so uma fonte viu a tx; esperar que as duas a vejam' };
    const [a, b] = vistas;
    if (a.recebido !== b.recebido || a.confirmada !== b.confirmada) return { valid: false, unavailable: true, error: 'DISCREPANCIA entre as fontes Bitcoin; nao se escolhe um numero' };
    if (a.recebido <= 0) return { valid: false, error: 'sem saida para a carteira de sustento Bitcoin' };
    const c = await cotar();
    if (!c.ok) return { valid: false, unavailable: true, error: 'cotacao BTC indisponivel (' + c.motivo + '); a tx nao foi consumida' };
    const minimo = satsPara(tier, c.usd_por_btc, TOLERANCIA);
    if (a.recebido < minimo) return { valid: false, error: `valor insuficiente: ${a.recebido} < ${minimo} sats` };
    const confirmacoes = Math.min(a.confirmacoes, b.confirmacoes);
    if (!a.confirmada || confirmacoes < CONF_ENTREGA) return { valid: false, pending: true, confirmacoes, error: `tx com ${confirmacoes} confirmacao(oes); sao precisas ${CONF_ENTREGA}` };
    const blockTime = a.blockTime && b.blockTime ? Math.max(a.blockTime, b.blockTime) : null;
    if (!blockTime) return { valid: false, unavailable: true, error: 'confirmada mas sem hora de bloco numa das fontes' };
    if (nowMs - blockTime * 1000 > JANELA_S * 1000) return { valid: false, error: `transferencia com mais de ${JANELA_S / 3600} h; fora da janela` };
    return { valid: true, sats: a.recebido, confirmacoes, payer: a.pagador || b.pagador || null, blockMs: blockTime * 1000 };
  }

  function fronteiras() {
    const activa = ligada(env);
    return { activa, rede: 'bitcoin-mainnet', endereco: ENDERECO,
      controlo_do_endereco: 'carteira operacional da ORA (chave no Vault do Supabase, executor Bitcoin); prova de controlo por assinatura BIP-322 feita a 23/10/2026 (mensagem fixa, chave do endereco); nao prova titularidade legal, fundos nem receita',
      prova_aceite: 'txid de transferencia para o endereco, confirmada nas duas fontes',
      fontes_exigidas: FONTES_TX.map((f) => f.nome), confirmacoes_para_entrega: CONF_ENTREGA,
      entrega_antes_da_confirmacao: false, entrega_com_fonte_unica: false,
      preco: 'cotacao indicativa em sats; aceita-se ate 10% abaixo da cotacao do momento da verificacao',
      livro_interno_escrito: false, repeticao_do_mesmo_txid: 'mesma leitura (reacesso)',
      reutilizacao: 'o txid e publico: uma transferencia recente e suficiente para este endereco serve a quem a apresentar',
      reorganizacao: 'com 1 confirmacao nao se exclui; servicos de poucos centimos',
      via_disponivel_so_nesta_via: 'vercel-directa' };
  }

  return { oferta, verificar, cotar, fronteiras, activa: () => ligada(env) };
}

module.exports = { createBtc, satsPara, ENDERECO, CAIP2, CONF_ENTREGA, JANELA_S, TOLERANCIA, MARGEM_COTACAO, FONTES_TX, FONTES_PRECO };

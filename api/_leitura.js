'use strict';
// ORA · leitura verificada (15/11/2026; Unum: "Eu autorizo", à proposta concreta de uma skill A2A que se paga por x402
// e devolve uma leitura que uma máquina consiga usar sozinha). Não é uma função (prefixo _): não conta para o limite de 12.
// Só lê: não tem chave, não assina, não paga, não precisa de segredos e não tem parâmetros (por isso não há nada a injectar).
//
// O que devolve, numa só resposta:
//  - o saldo VALIUM da carteira sagrada antiga na Base, lido por eth_call no MESMO bloco em vários RPC públicos;
//  - o saldo e as transacções (contagem) da Fundação ORA em Bitcoin (a operacional BTC), lidos em duas fontes Esplora.
// Regra única (a da testemunha do ORAI-Agent): só diz `concordam` quando pelo menos duas fontes devolvem o MESMO valor.
// Uma fonte só, fontes que discordam ou nenhuma nunca dão um valor: `valor` fica a null e o estado diz porquê.
//
// Dependências (diz-se de que fornecedores depende): três RPC Base públicos (mainnet.base.org, base-rpc.publicnode.com,
// 1rpc.io) e duas fontes Esplora (blockstream.info, mempool.space). Se falharem, a leitura diz `sem_fontes` e não inventa.
// Fronteiras: não prova receita, procura, preço, titularidade legal nem que alguém de fora pagou; o saldo é uma
// observação, não uma reserva.
const { SAGRADA_ANTIGA, OPERACIONAL_BTC } = require('./_carteira');

const FORMATO = 'orum-leitura-verificada/v1';
const VALIUM_CONTRATO = '0x37f70bccdc2125346a7542fe6e7fc70e33421635';
const VALIUM_DECIMAIS = 18n;
const RPCS = Object.freeze(['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base']);
const ESPLORA = Object.freeze([
  Object.freeze({ nome: 'blockstream', base: 'https://blockstream.info/api' }),
  Object.freeze({ nome: 'mempool.space', base: 'https://mempool.space/api' }),
]);
const PRAZO_MS = 5000;
const ATRASO_BLOCOS = 2; // um bloco um pouco atrás, para nenhuma fonte estar atrasada em relação às outras
const NAO_AFIRMA = Object.freeze(['receita', 'procura', 'adopcao', 'preco do VALIUM', 'titularidade legal', 'que alguém de fora pagou', 'reserva ou lastro']);

const curto = (e) => String((e && e.message) || e).slice(0, 120);

// 18 casas, sem zeros à direita: 2976352211822864886784 -> "2976.352211822864886784"
function formatarValium(wei) {
  const base = 10n ** VALIUM_DECIMAIS;
  const inteiro = wei / base;
  const fracao = (wei % base).toString().padStart(Number(VALIUM_DECIMAIS), '0').replace(/0+$/, '');
  return fracao ? `${inteiro}.${fracao}` : `${inteiro}`;
}

// Decide o estado a partir dos valores devolvidos por cada fonte. Nunca escolhe entre valores diferentes.
function decidir(valores) {
  const fontes = Object.keys(valores);
  if (!fontes.length) return { estado: 'sem_fontes', verificado: false, valor: null };
  const distintos = new Set(Object.values(valores));
  if (distintos.size > 1) return { estado: 'discordam', verificado: false, valor: null };
  if (fontes.length < 2) return { estado: 'fonte_unica', verificado: false, valor: null };
  return { estado: 'concordam', verificado: true, valor: [...distintos][0] };
}

function createLeitor({ fetchFn, now = () => Date.now() } = {}) {
  const pedir = (url, init = {}) => (fetchFn || globalThis.fetch)(url, { ...init, signal: AbortSignal.timeout(PRAZO_MS) });
  const rpc = async (url, method, params) => {
    const r = await pedir(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'erro RPC');
    return j.result;
  };

  async function lerValium() {
    const falhadas = [];
    const blocos = {};
    await Promise.all(RPCS.map(async (url) => {
      try { blocos[url] = BigInt(await rpc(url, 'eth_blockNumber', [])); }
      catch (e) { falhadas.push({ fonte: url, erro: curto(e) }); }
    }));
    const urls = Object.keys(blocos);
    if (!urls.length) return { estado: 'sem_fontes', verificado: false, bloco: null, valor_wei: null, valium: null, fontes_ok: [], fontes_falhadas: falhadas };
    const minimo = urls.map((u) => blocos[u]).reduce((a, b) => (a < b ? a : b));
    const bloco = minimo > BigInt(ATRASO_BLOCOS) ? minimo - BigInt(ATRASO_BLOCOS) : 0n;
    const dados = '0x70a08231' + SAGRADA_ANTIGA.toLowerCase().replace('0x', '').padStart(64, '0');
    const valores = {};
    await Promise.all(urls.map(async (url) => {
      try {
        const bruto = await rpc(url, 'eth_call', [{ to: VALIUM_CONTRATO, data: dados }, '0x' + bloco.toString(16)]);
        if (typeof bruto !== 'string' || !/^0x[0-9a-fA-F]+$/.test(bruto)) throw new Error('resposta sem saldo');
        valores[url] = BigInt(bruto).toString();
      } catch (e) { falhadas.push({ fonte: url, erro: curto(e) }); }
    }));
    const d = decidir(valores);
    return { estado: d.estado, verificado: d.verificado, bloco: Number(bloco), valor_wei: d.valor,
      valium: d.valor === null ? null : formatarValium(BigInt(d.valor)), fontes_ok: Object.keys(valores).sort(), fontes_falhadas: falhadas };
  }

  async function lerFundacao() {
    const falhadas = [];
    const valores = {};
    const resumos = {};
    await Promise.all(ESPLORA.map(async (f) => {
      try {
        const r = await pedir(`${f.base}/address/${OPERACIONAL_BTC}`, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const c = j.chain_stats, m = j.mempool_stats;
        const resumo = { saldo_confirmado_sats: c.funded_txo_sum - c.spent_txo_sum, saldo_mempool_sats: m.funded_txo_sum - m.spent_txo_sum, transaccoes_confirmadas: c.tx_count };
        if (![resumo.saldo_confirmado_sats, resumo.saldo_mempool_sats, resumo.transaccoes_confirmadas].every((n) => Number.isSafeInteger(n))) throw new Error('resposta sem numeros');
        valores[f.base] = JSON.stringify(resumo);
        resumos[f.base] = resumo;
      } catch (e) { falhadas.push({ fonte: f.base, erro: curto(e) }); }
    }));
    const d = decidir(valores);
    const base = { estado: d.estado, verificado: d.verificado, endereco: OPERACIONAL_BTC, fontes_ok: Object.keys(valores).sort(), fontes_falhadas: falhadas };
    return d.valor === null ? { ...base, saldo_confirmado_sats: null, saldo_mempool_sats: null, transaccoes_confirmadas: null }
      : { ...base, ...JSON.parse(d.valor) };
  }

  async function ler() {
    const [valium, fundacao] = await Promise.all([lerValium(), lerFundacao()]);
    return { formato: FORMATO, lido_em: new Date(now()).toISOString(),
      valium_na_sagrada: { carteira: SAGRADA_ANTIGA, contrato: VALIUM_CONTRATO, decimais: Number(VALIUM_DECIMAIS), ...valium },
      fundacao_btc: fundacao,
      regra: 'só diz concordam com pelo menos duas fontes iguais; fonte única, discordância ou nenhuma fonte nunca dão valor (valor a null)',
      nao_afirma: [...NAO_AFIRMA] };
  }
  return { ler, lerValium, lerFundacao };
}

// Forma e verdade da leitura: usado pelos verificadores e por quem queira conferir uma resposta recebida.
function validarLeitura(l) {
  const erros = [];
  const e = (c, m) => { if (!c) erros.push(m); };
  e(l && l.formato === FORMATO, 'formato');
  const v = l && l.valium_na_sagrada, f = l && l.fundacao_btc;
  e(v && f, 'faltam blocos');
  if (!v || !f) return erros;
  for (const [nome, b] of [['valium', v], ['fundacao', f]]) {
    e(['concordam', 'discordam', 'fonte_unica', 'sem_fontes'].includes(b.estado), `${nome}: estado`);
    e(b.verificado === (b.estado === 'concordam'), `${nome}: verificado so com concordam`);
    e(Array.isArray(b.fontes_ok) && Array.isArray(b.fontes_falhadas), `${nome}: fontes`);
    e(b.estado !== 'concordam' || b.fontes_ok.length >= 2, `${nome}: concordam exige duas fontes`);
  }
  e(v.verificado ? /^\d+$/.test(String(v.valor_wei)) && typeof v.valium === 'string' && Number.isInteger(v.bloco) : v.valor_wei === null && v.valium === null, 'valium: valor so quando verificado');
  e(f.verificado ? [f.saldo_confirmado_sats, f.saldo_mempool_sats, f.transaccoes_confirmadas].every(Number.isSafeInteger) : f.saldo_confirmado_sats === null && f.saldo_mempool_sats === null && f.transaccoes_confirmadas === null, 'fundacao: valores so quando verificada');
  e(/^0x[0-9a-f]{40}$/.test(v.contrato) && /^0x[0-9A-Fa-f]{40}$/.test(v.carteira), 'enderecos EVM');
  e(f.endereco === OPERACIONAL_BTC, 'endereco BTC da Fundacao');
  e(Array.isArray(l.nao_afirma) && ['receita', 'procura', 'preco do VALIUM', 'reserva ou lastro'].every((x) => l.nao_afirma.includes(x)), 'nao_afirma');
  e(!/(garant|prometid|vai valorizar|investimento|rendimento)/i.test(JSON.stringify(l)), 'promessa no texto');
  return erros;
}

module.exports = { createLeitor, validarLeitura, formatarValium, decidir, FORMATO, VALIUM_CONTRATO, RPCS, ESPLORA, NAO_AFIRMA };

// Vigia de entradas (23/10/2026, livro ora_mudancas 998). Unum: "notifica-me aqui ou através da app do organismo".
//
// Lê a cadeia PÚBLICA, sem Supabase, sem Vercel, sem segredos e sem gastar quota de deployments, e lista o que
// ENTROU nas carteiras de recebimento do organismo: USDC na Base e BTC. Cada entrada traz a classe do pagador:
//   interno         o pagador está em economia/enderecos-internos.json (validação, não é sustento);
//   por_classificar o pagador não está lá. NUNCA se chama sustento, receita nem "externo": só receita externa
//                   confirmada entra no 70/20/10 (economia/constituicao-v2.json) e essa classificação é explícita.
// Só lê. Não paga, não assina, não escreve. O que notifica Unum é quem corre o vigia (a tarefa agendada da ORA).
//
// Honestidade: "sem entradas" só vale com leitura completa. Se uma fonte ou uma janela falhar, diz-se em `lacunas`
// e `ausencia_provada_na_janela` fica false; nunca se devolve zero como se fosse a verdade.
//
// Limite lido a 23/10/2026: os RPC públicos gratuitos da Base só servem logs das últimas ~5 h (pedidos mais antigos dão 403
// "archive requires a personal token"). Por isso a janela por omissão é 5 h e quem o corre tem de o correr em menos de 5 h.
// Se a cadência falhar, as fatias antigas aparecem em `lacunas`; o Bitcoin (Esplora) lê janelas largas sem este limite.
//
// Uso: node scripts/vigia-entradas.mjs [--horas 5] [--ja-vistos tx1,tx2]
import fs from 'node:fs';

const LISTA = JSON.parse(fs.readFileSync(new URL('../economia/enderecos-internos.json', import.meta.url), 'utf8'));
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPCS = ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.gateway.tenderly.co'];
const ESPLORA = [{ nome: 'mempool.space', base: 'https://mempool.space/api' }, { nome: 'blockstream', base: 'https://blockstream.info/api' }];
const BLOCOS_POR_HORA = 1800;   // Base: 2 s por bloco
const FATIA = 2000;             // blocos por pedido: os RPC públicos recusam intervalos largos (403, 429, invalid params)
const PRAZO_MS = 12000;
const MAX_BLOCOS_COM_HORA = 25;

const minusculas = (s) => String(s || '').toLowerCase();
const INTERNOS_BASE = new Set(LISTA.base.map((x) => minusculas(x.endereco)));
const INTERNOS_BTC = new Set(LISTA.bitcoin.map((x) => x.endereco));
export const VIGIADOS = Object.freeze({
  base: LISTA.recebem_servicos_e_sustento.base.map(minusculas),
  bitcoin: [...LISTA.recebem_servicos_e_sustento.bitcoin],
});
const pad = (a) => '0x' + minusculas(a).replace(/^0x/, '').padStart(64, '0');
const curto = (e) => String((e && e.message) || e).slice(0, 140);

async function rpc(fetchFn, url, method, params) {
  const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(PRAZO_MS) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(String(j.error.message || j.error.code));
  return j.result;
}
// tenta cada RPC por ordem; devolve { ok, valor } ou { ok:false, erros }
async function comRpcs(fetchFn, method, params) {
  const erros = [];
  for (const url of RPCS) {
    try { return { ok: true, valor: await rpc(fetchFn, url, method, params), url }; } catch (e) { erros.push(new URL(url).host + ': ' + curto(e)); }
  }
  return { ok: false, erros };
}

export function classificarBase(de) { return INTERNOS_BASE.has(minusculas(de)) ? 'interno' : 'por_classificar'; }
export function classificarBtc(pagadores) {
  // interno só se TODOS os endereços de entrada são nossos; com uma entrada desconhecida fica por classificar
  return pagadores.length > 0 && pagadores.every((a) => INTERNOS_BTC.has(a)) ? 'interno' : 'por_classificar';
}

async function lerBase(fetchFn, horas, agora) {
  const lacunas = [];
  const head = await comRpcs(fetchFn, 'eth_blockNumber', []);
  if (!head.ok) return { entradas: [], completa: false, lacunas: ['Base: nenhum RPC respondeu (' + head.erros.join('; ') + ')'] };
  const altura = parseInt(head.valor, 16);
  const de = Math.max(0, altura - Math.ceil(horas * BLOCOS_POR_HORA));
  const destinos = VIGIADOS.base.map(pad);
  const brutos = [];
  for (let ini = de; ini <= altura; ini += FATIA) {
    const fim = Math.min(altura, ini + FATIA - 1);
    const r = await comRpcs(fetchFn, 'eth_getLogs', [{ fromBlock: '0x' + ini.toString(16), toBlock: '0x' + fim.toString(16), address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', topics: [TRANSFER, null, destinos] }]);
    if (!r.ok) { lacunas.push(`Base: blocos ${ini}-${fim} sem leitura (${r.erros.join('; ')})`); continue; }
    for (const l of r.valor) brutos.push(l);
  }
  const vistos = new Set();
  const logs = [];
  for (const l of brutos) {
    if (minusculas(l.address) !== USDC) continue;                       // só o USDC verdadeiro
    if (!l.topics || l.topics.length < 3 || minusculas(l.topics[0]) !== TRANSFER) continue;
    const para = '0x' + l.topics[2].slice(-40);
    if (!VIGIADOS.base.includes(minusculas(para))) continue;            // só entradas para as nossas carteiras
    const chave = minusculas(l.transactionHash) + ':' + parseInt(l.logIndex, 16);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    logs.push({ tx: l.transactionHash, bloco: parseInt(l.blockNumber, 16), de: '0x' + l.topics[1].slice(-40), para, atomic: BigInt(l.data).toString() });
  }
  const blocos = [...new Set(logs.map((x) => x.bloco))].slice(0, MAX_BLOCOS_COM_HORA);
  const hora = new Map();
  for (const b of blocos) {
    const r = await comRpcs(fetchFn, 'eth_getBlockByNumber', ['0x' + b.toString(16), false]);
    if (r.ok && r.valor && r.valor.timestamp) hora.set(b, new Date(parseInt(r.valor.timestamp, 16) * 1000).toISOString());
  }
  const entradas = logs.map((x) => ({
    rede: 'base', ativo: 'USDC', tx: x.tx, bloco: x.bloco,
    hora_utc: hora.get(x.bloco) || new Date(agora - (altura - x.bloco) * 2000).toISOString(), hora_estimada: !hora.has(x.bloco),
    de: x.de, para: x.para, valor_usdc: Number(BigInt(x.atomic)) / 1e6, valor_atomic: x.atomic,
    classe: classificarBase(x.de), confirmada: true,
  }));
  return { entradas, completa: lacunas.length === 0, lacunas };
}

async function lerBtc(fetchFn, horas, agora) {
  const lacunas = [];
  const desde = Math.floor((agora - horas * 3600 * 1000) / 1000);
  const porTx = new Map();
  for (const addr of VIGIADOS.bitcoin) {
    for (const f of ESPLORA) {
      try {
        const r = await fetchFn(`${f.base}/address/${addr}/txs`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(PRAZO_MS) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const txs = await r.json();
        if (!Array.isArray(txs)) throw new Error('formato inesperado');
        for (const t of txs) {
          const st = t.status || {};
          if (st.confirmed && Number(st.block_time) < desde) continue;          // fora da janela
          const recebido = (t.vout || []).filter((o) => o && o.scriptpubkey_address === addr).reduce((s, o) => s + Number(o.value || 0), 0);
          if (recebido <= 0) continue;                                           // saída (gasto), não entrada
          const pagadores = [...new Set((t.vin || []).map((i) => i && i.prevout && i.prevout.scriptpubkey_address).filter(Boolean))];
          const chave = t.txid + ':' + addr;
          const ja = porTx.get(chave);
          if (ja) { if (!ja.fontes.includes(f.nome)) ja.fontes.push(f.nome); continue; }
          porTx.set(chave, { rede: 'bitcoin', ativo: 'BTC', tx: t.txid, bloco: st.confirmed ? st.block_height : null,
            hora_utc: st.confirmed ? new Date(Number(st.block_time) * 1000).toISOString() : null, de: pagadores, para: addr, valor_sats: recebido,
            classe: classificarBtc(pagadores), confirmada: Boolean(st.confirmed), fontes: [f.nome] });
        }
      } catch (e) { lacunas.push(`Bitcoin: ${f.nome} para ${addr.slice(0, 10)}…: ${curto(e)}`); }
    }
  }
  return { entradas: [...porTx.values()], completa: lacunas.length === 0, lacunas };
}

export async function vigiar({ horas = 5, fetchFn = globalThis.fetch, agora = Date.now(), jaVistos = [] } = {}) {
  const vistos = new Set(jaVistos.map(minusculas));
  const [b, c] = await Promise.all([lerBase(fetchFn, horas, agora), lerBtc(fetchFn, horas, agora)]);
  const todas = [...b.entradas, ...c.entradas].sort((x, y) => String(y.hora_utc || '9').localeCompare(String(x.hora_utc || '9')));
  const novas = todas.filter((e) => !vistos.has(minusculas(e.tx)));
  const lacunas = [...b.lacunas, ...c.lacunas];
  return {
    format: 'orum-vigia-entradas/v1', gerado_em: new Date(agora).toISOString(), janela_horas: horas,
    vigiados: VIGIADOS,
    leitura_completa: { base: b.completa, bitcoin: c.completa }, lacunas,
    ausencia_provada_na_janela: todas.length === 0 && lacunas.length === 0,
    entradas: todas,
    por_classificar: novas.filter((e) => e.classe === 'por_classificar'),
    internas: novas.filter((e) => e.classe === 'interno').length,
    nota: 'Observação da cadeia pública. "por_classificar" não é sustento nem receita: só receita externa confirmada entra no 70/20/10 (economia/constituicao-v2.json). Zero entradas só vale com leitura completa.',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const r = await vigiar({ horas: Number(arg('--horas')) || 5, jaVistos: (arg('--ja-vistos') || '').split(',').filter(Boolean) });
  console.log(JSON.stringify(r, null, 2));
  if (!r.leitura_completa.base && !r.leitura_completa.bitcoin && r.entradas.length === 0) process.exitCode = 2;
}

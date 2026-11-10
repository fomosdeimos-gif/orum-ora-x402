// Relê, sem a ORA, o que token/sedimentacao-2026-11-10.json diz ter lido na cadeia: tipo de código e implementação,
// casas decimais, oferta, saldo da carteira operacional e saldo do PoolManager do Uniswap V4, para cada token.
// Precisa de rede (Node 18+, fetch) e de pelo menos duas fontes RPC públicas que concordem.
// Uso: node kit/sedimento.mjs [registo.json]
// Sai com 0 se as fontes concordam e os invariantes (código, implementação, casas, oferta) batem com o registo.
// Saldos que mudaram (a operacional recebeu ou enviou; o PoolManager negocia) vêm listados em `mudou`: não são falha.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FONTES = {
  'mainnet.base.org': 'https://mainnet.base.org',
  'base-rpc.publicnode.com': 'https://base-rpc.publicnode.com',
  '1rpc.io': 'https://1rpc.io/base',
};
const PADROES = [
  { tipo: 'clone mínimo EIP-1167 (45 bytes)', prefixo: '363d3d373d3d3d363d73', sufixo: '5af43d82803e903d91602b57fd5bf3' },
  { tipo: 'proxy mínimo de 44 bytes (variante do EIP-1167)', prefixo: '3d3d3d3d363d3d37363d73', sufixo: '5af43d3d93803e602a57fd5bf3' },
];
const palavra = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

// Lê o tipo de código e a implementação a partir dos bytes do contrato.
export function classificarCodigo(codigoHex) {
  const c = String(codigoHex).replace(/^0x/, '');
  for (const p of PADROES) {
    if (c.startsWith(p.prefixo) && c.endsWith(p.sufixo) && c.length === (p.prefixo.length + 40 + p.sufixo.length)) {
      return { tipo: p.tipo, implementacao: '0x' + c.slice(p.prefixo.length, p.prefixo.length + 40), bytes: c.length / 2 };
    }
  }
  return { tipo: `contrato completo (${c.length / 2} bytes)`, implementacao: null, bytes: c.length / 2 };
}

// fetcher(url, corpo) devolve o JSON da resposta; injectável para testar sem rede.
async function rpc(fetcher, url, method, params) {
  const r = await fetcher(url, { jsonrpc: '2.0', id: 1, method, params });
  if (r.error) throw new Error(`${method}: ${JSON.stringify(r.error).slice(0, 80)}`);
  return r.result;
}

export async function reler(registo, { fetcher, fontes = FONTES } = {}) {
  const conhecidas = registo.fontes_rpc.filter((n) => fontes[n]);
  if (conhecidas.length < 2) throw new Error('precisa de duas fontes RPC conhecidas');
  const cabecas = {};
  const falharam = [];
  for (const n of conhecidas) {
    try { cabecas[n] = parseInt(await rpc(fetcher, fontes[n], 'eth_blockNumber', []), 16); } catch (e) { falharam.push(`${n}: ${e.message}`); }
  }
  const vivas = conhecidas.filter((n) => cabecas[n] !== undefined);
  if (vivas.length < 2) throw new Error(`menos de duas fontes responderam (${falharam.join('; ')})`);
  const bloco = '0x' + (Math.min(...vivas.map((n) => cabecas[n])) - 10).toString(16);
  const lido = {};
  const nomes = [];
  for (const n of vivas) {
    const u = fontes[n];
    try {
    const chamada = (to, data) => rpc(fetcher, u, 'eth_call', [{ to, data }, bloco]);
    const leitura = {};
    for (const t of registo.tokens) {
      const codigo = classificarCodigo(await rpc(fetcher, u, 'eth_getCode', [t.contrato, bloco]));
      leitura[t.nome] = {
        ...codigo,
        decimals: parseInt(await chamada(t.contrato, '0x313ce567'), 16),
        oferta_raw: BigInt(await chamada(t.contrato, '0x18160ddd')).toString(),
        saldo_operacional_raw: BigInt(await chamada(t.contrato, '0x70a08231' + palavra(registo.carteira_operacional))).toString(),
        saldo_pool_manager_raw: BigInt(await chamada(t.contrato, '0x70a08231' + palavra(registo.poolmanager_v4))).toString(),
      };
    }
    lido[n] = leitura;
    nomes.push(n);
    } catch (e) { falharam.push(`${n}: ${e.message}`); }
  }
  if (nomes.length < 2) throw new Error(`menos de duas fontes leram tudo (${falharam.join('; ')})`);
  const concordam = nomes.every((n) => JSON.stringify(lido[n]) === JSON.stringify(lido[nomes[0]]));
  const base = lido[nomes[0]];
  const por_token = registo.tokens.map((t) => {
    const x = base[t.nome];
    const escala = 10n ** BigInt(t.decimals);
    const invariantes = [];
    if (x.tipo !== t.verdade.lido.tipo_de_codigo) invariantes.push('tipo de código');
    if ((x.implementacao || null) !== (t.verdade.lido.implementacao || null)) invariantes.push('implementação');
    if (x.decimals !== t.decimals) invariantes.push('casas decimais');
    if (BigInt(x.oferta_raw) / escala !== BigInt(t.oferta_total_tokens)) invariantes.push('oferta');
    const mudou = [];
    if (BigInt(x.saldo_operacional_raw) / escala !== BigInt(t.resiliencia.posicao_na_operacional_tokens)) mudou.push('saldo da operacional');
    if (BigInt(x.saldo_pool_manager_raw) / escala !== BigInt(t.valor.no_pool_manager_v4_tokens)) mudou.push('saldo do PoolManager');
    return { nome: t.nome, invariantes_falham: invariantes, mudou };
  });
  const ok = concordam && por_token.every((p) => p.invariantes_falham.length === 0);
  return { bloco: parseInt(bloco, 16), fontes: nomes, falharam, concordam, ok, por_token };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// As fontes públicas limitam o ritmo (429): repete com espera crescente antes de desistir dessa fonte.
export const fetcherReal = async (url, corpo, { tentativas = 6, espera = 1500, esperar = dormir } = {}) => {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
      ultimo = new Error(`${url}: HTTP ${r.status}`);
      if (r.status !== 429 && r.status < 500) throw ultimo;
    } catch (e) { ultimo = e; if (/HTTP 4(?!29)/.test(String(e.message))) throw e; }
    await esperar(espera * (i + 1));
  }
  throw ultimo;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const caminho = process.argv[2] || new URL('../token/sedimentacao-2026-11-10.json', import.meta.url);
  const registo = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const r = await reler(registo, { fetcher: fetcherReal });
  console.log(`bloco ${r.bloco}; fontes ${r.fontes.join(', ')}; concordam: ${r.concordam}${r.falharam.length ? '; falharam: ' + r.falharam.join(' | ') : ''}`);
  for (const p of r.por_token) console.log(`${p.invariantes_falham.length ? 'FALHA' : 'OK   '} ${p.nome}${p.invariantes_falham.length ? ': ' + p.invariantes_falham.join(', ') : ''}${p.mudou.length ? ' | mudou desde o registo: ' + p.mudou.join(', ') : ''}`);
  console.log(r.ok ? 'sedimento: invariantes conferem' : 'sedimento: NÃO confere');
  process.exit(r.ok ? 0 : 1);
}

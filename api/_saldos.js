'use strict';
// ORA · /economia/saldos.json — saldo ETH (gás) e USDC das carteiras Base do organismo, lido da cadeia
// por RPC público, sem Supabase, sem credenciais e sem custo. Só leitura. Não é uma função (prefixo _).
//
// Todas as leituras de uma resposta vêm do mesmo RPC e do mesmo bloco, e esse RPC tem de dizer que é a
// Base mainnet (chainId 0x2105). Se nenhum RPC servir tudo, a resposta é 503 com as tentativas; nunca se
// devolve um saldo adivinhado ou zero por falha.
//
// Fronteiras: é observação on-chain. Um saldo de ETH não prova que chegue para uma transferência (a taxa
// segue a estimativa da rede), não diz de onde veio o dinheiro, não é receita reconhecida e não prova quem
// controla as chaves.
const { SAGRADA_ANTIGA, SAGRADA_NOVA, OPERACIONAL } = require('./_carteira');
const { chamarRpc, listaRpc } = require('./_recebimentos');
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = '0x2105';
const PRAZO_MS = 8000;
const CHAMADA_MS = 3000;
const CARTEIRAS = [
  ['sagrada_antiga', SAGRADA_ANTIGA],
  ['sagrada_nova', SAGRADA_NOVA],
  ['operacional', OPERACIONAL],
];

const curto = (e) => String((e && e.message) || e).slice(0, 160);
const dec = (h) => BigInt(h).toString();
const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
function fmt(atomic, casas) {
  const s = BigInt(atomic).toString().padStart(casas + 1, '0');
  const inteiro = s.slice(0, s.length - casas);
  const frac = s.slice(s.length - casas).replace(/0+$/, '');
  return frac ? `${inteiro}.${frac}` : inteiro;
}

async function lerNum(call, url) {
  if ((await call(url, 'eth_chainId', [], CHAMADA_MS)) !== CHAIN_ID) throw new Error('rpc nao e a Base mainnet');
  const bloco = await call(url, 'eth_blockNumber', [], CHAMADA_MS);
  if (!/^0x[0-9a-fA-F]+$/.test(bloco)) throw new Error('bloco invalido');
  const linhas = await Promise.all(CARTEIRAS.map(async ([papel, endereco]) => {
    const [eth, usdc] = await Promise.all([
      call(url, 'eth_getBalance', [endereco, bloco], CHAMADA_MS),
      call(url, 'eth_call', [{ to: USDC_BASE, data: '0x70a08231' + pad(endereco) }, bloco], CHAMADA_MS),
    ]);
    if (!/^0x[0-9a-fA-F]+$/.test(eth) || !/^0x[0-9a-fA-F]{64}$/.test(usdc)) throw new Error('saldo invalido');
    return { papel, endereco, eth_wei: dec(eth), eth: fmt(dec(eth), 18), tem_eth: BigInt(eth) > 0n, usdc_atomic: dec(usdc), usdc: fmt(dec(usdc), 6) };
  }));
  return { bloco: Number(BigInt(bloco)), carteiras: linhas };
}

async function saldos({ call, urls, now }) {
  const limite = Date.now() + PRAZO_MS;
  const tentativas = [];
  for (const url of urls) {
    if (Date.now() > limite) { tentativas.push({ fonte: url, erro: 'prazo esgotado' }); break; }
    try {
      const lido = await lerNum(call, url);
      return { ok: true, rede: 'base-mainnet', chain_id: 8453, ativo_gas: 'ETH', ativo: 'USDC', usdc_contrato: USDC_BASE, bloco: lido.bloco,
        carteiras: lido.carteiras, fonte: { tipo: 'rpc-base-publico', consultado_utc: new Date(now()).toISOString() },
        nao_afirma: ['que o ETH chegue para uma transferencia (a taxa segue a estimativa da rede)', 'origem do saldo', 'receita reconhecida', 'quem controla as chaves'] };
    } catch (e) { tentativas.push({ fonte: url, erro: curto(e) }); }
  }
  const err = new Error('nenhum RPC serviu'); err.tentativas = tentativas; throw err;
}

function createHandler({ call = chamarRpc, urls, now = () => Date.now() } = {}) {
  return async (req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    const send = (s, b) => { res.statusCode = s; res.end(JSON.stringify(b)); };
    try { return send(200, await saldos({ call, urls: urls || listaRpc(), now })); }
    catch (e) { res.setHeader('cache-control', 'no-store'); return send(503, { ok: false, error: 'fontes_indisponiveis', tentativas: e.tentativas || [{ erro: curto(e) }] }); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.saldos = saldos;

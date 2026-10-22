import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// v6 - 07/09/2026: remove o nome legal completo das superficies publicas;
// usa o pseudonimo ja estabelecido "Unum" nos campos autor/testemunha.

const sb = createClient('https://ywabnlhkmhbyewqhbsjm.supabase.co', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const PRECO_USDC = '0.618';
const PRECO_ATOMIC = 618000n;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const NFT_CONTRACT = '0xC100Fd6E3B557E8A2b97A68C53689C4925F4dD22';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT' };

async function rpcCall(method: string, params: unknown[]) {
  let lastErr: unknown;
  for (const rpc of RPCS) {
    try {
      const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function extrairTxHash(h: string): string | null {
  let d: Record<string, unknown>;
  try { d = JSON.parse(atob(h)); } catch { try { d = JSON.parse(h); } catch { return null; } }
  return (d.transactionHash as string) || (d.tx_hash as string) || (d.hash as string) || null;
}

function paymentRequired(tokenId: number, resourceUrl: string) {
  return new Response(JSON.stringify({
    x402Version: 2,
    error: 'X-PAYMENT header required',
    accepts: [{
      scheme: 'exact', network: 'base-mainnet', networkId: 'eip155:8453',
      maxAmountRequired: PRECO_ATOMIC.toString(),
      resource: resourceUrl,
      description: `Dedicatória simbólica · 0001sensations token #${tokenId} — não transfere a posse do NFT, só acrescenta o teu nome ao registo público da obra, junto dos que vieram antes. Sem limite de dedicatórias por peça.`,
      mimeType: 'application/json', payTo: WALLET, maxTimeoutSeconds: 300, asset: USDC_BASE,
      extra: { name: '0001sensations · dedicatória simbólica', amount: `${PRECO_USDC} USDC`, autor: 'Unum · jasm43.base.eth' },
    }],
    como_pagar: {
      passo_1: `Transfere ${PRECO_USDC} USDC (contrato ${USDC_BASE}) na rede Base (chain_id ${CHAIN_ID}) para ${WALLET}.`,
      passo_2: 'Guarda o transaction hash.',
      passo_3: `Repete o pedido com cabeçalho X-PAYMENT: base64 de {"transactionHash":"0x..."}.`,
      nota: 'Isto NAO compra o NFT nem muda o dono real na blockchain Ethereum — e uma dedicatoria simbolica, paga directamente ao artista, acrescentada ao registo publico. Sem limite: qualquer numero de agentes pode dedicar a mesma peca, cada nome fica, nenhum apaga o anterior. Para posse real, ve /api/nft/catalogo (OpenSea/Rarible).',
    },
  }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  if (req.method === 'GET' && !url.searchParams.get('token_id')) {
    return new Response(JSON.stringify({
      servico: 'ORA · Dedicatória Simbólica · 0001sensations',
      descricao: 'Escolhe uma das 65 obras e paga directamente ao artista via x402 (USDC, Base) para acrescentar o teu nome ao registo publico dela, para sempre. NAO transfere a posse do NFT. Sem limite: qualquer peca pode acumular dedicatorias de varios agentes, cada uma uma camada nova, nenhuma apaga as anteriores.',
      preco: `${PRECO_USDC} USDC`,
      como_usar: 'GET ?token_id=N&nome=...&mensagem=... (ver /api/nft/catalogo para a lista) — sem X-PAYMENT devolve o preco; com X-PAYMENT (apos pagar) regista a dedicatoria.',
    }, null, 2), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const tokenId = Number(url.searchParams.get('token_id'));
  const nome = (url.searchParams.get('nome') || '').trim().slice(0, 80);
  const mensagem = (url.searchParams.get('mensagem') || '').trim().slice(0, 400);
  const resourceUrl = `https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-nft-dedicar-simbolica?token_id=${tokenId}`;

  if (!Number.isInteger(tokenId) || tokenId <= 0) return new Response(JSON.stringify({ erro: 'token_id invalido ou em falta — ver /api/nft/catalogo' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const { data: existente } = await sb.from('ora_nft_0001sensations').select('token_id, nome').eq('token_id', tokenId).single();
  if (!existente) return new Response(JSON.stringify({ erro: `token_id ${tokenId} nao existe nesta colecção` }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const hasPayment = req.headers.get('X-PAYMENT') || req.headers.get('X-Payment');
  if (!hasPayment) return paymentRequired(tokenId, resourceUrl);
  if (!nome) return new Response(JSON.stringify({ erro: 'falta o parametro nome (?nome=...)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const txHash = extrairTxHash(hasPayment);
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return new Response(JSON.stringify({ erro: 'X-PAYMENT invalido' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const { data: jaUsado } = await sb.from('ora_nft_dedicatorias').select('id').eq('tx_hash', txHash).maybeSingle();
  const { data: pagUsado } = await sb.from('ora_pagamentos').select('id').eq('tx_hash', txHash).maybeSingle();
  if (jaUsado || pagUsado) return new Response(JSON.stringify({ erro: 'tx_hash ja utilizado' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  let receipt;
  try { receipt = await rpcCall('eth_getTransactionReceipt', [txHash]); } catch (e) {
    return new Response(JSON.stringify({ erro: 'RPC: ' + String(e) }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (!receipt) return new Response(JSON.stringify({ x402: 'pending', detalhe: 'tx ainda nao indexada, repete em breve', retry_after_seconds: 6 }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '6' } });
  if (receipt.status !== '0x1') return new Response(JSON.stringify({ erro: 'tx falhou on-chain' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const transferLog = (receipt.logs || []).find((l: any) =>
    l.address?.toLowerCase() === USDC_BASE.toLowerCase() &&
    l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
    l.topics?.[2] && ('0x' + l.topics[2].slice(-40)).toLowerCase() === WALLET.toLowerCase()
  );
  if (!transferLog) return new Response(JSON.stringify({ erro: 'sem transferencia USDC para a carteira sagrada nesta tx' }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const payer = '0x' + transferLog.topics[1].slice(-40);
  const amountAtomic = BigInt(transferLog.data);
  if (amountAtomic < PRECO_ATOMIC) return new Response(JSON.stringify({ erro: `valor insuficiente: recebido ${amountAtomic}, requerido ${PRECO_ATOMIC}` }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });

  await sb.from('ora_pagamentos').insert({ tx_hash: txHash, payer, amount: amountAtomic.toString(), currency: 'USDC', chain_id: CHAIN_ID, destino: WALLET, status: 'verificado_onchain', registado_em: new Date().toISOString() });

  const { error } = await sb.from('ora_nft_dedicatorias').insert({ token_id: tokenId, nome, mensagem: mensagem || null, tipo: 'simbolica', tx_hash: txHash });
  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({
    ok: true,
    dedicatoria: {
      certificado: 'dedicatoria-simbolica-0001sensations',
      colecao: '0001sensations · Unum',
      obra: { token_id: tokenId, nome: existente.nome, contrato: NFT_CONTRACT, rede: 'Ethereum mainnet' },
      dedicado_a: nome, mensagem: mensagem || null,
      tipo: 'simbolica — nao transfere posse do NFT, acrescenta o nome ao registo publico, sem limite',
      pagamento: { tx_hash: txHash, valor: `${PRECO_USDC} USDC`, destino: WALLET, rede: 'base-mainnet', verificacao: 'on-chain directa' },
      testemunha: 'Unum · jasm43.base.eth',
      axioma: 'Um acto de poesia e fé — o nome fica, junto dos que vieram antes.',
      verificar: 'https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-nft-catalogo',
    },
  }, null, 2), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Payment-Response': JSON.stringify({ txHash, status: 'settled' }) } });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ORA-ONCHAIN-LEITURA
// Le saldos reais on-chain (Base Mainnet) via JSON-RPC directo e persiste
// em orum_leituras_onchain. So leitura -- nunca escrita on-chain, nunca assinatura.
//
// v4 · 2026-09-05 · ora_mudancas#491/#496 · reducao de dependencia RPC:
// substituido o unico RPC fixo (mainnet.base.org) por uma lista de RPCs
// publicos independentes com failover sequencial, replicando exactamente o
// padrao ja em producao em ora-x402 (rpcCall). Sem isto, uma falha ou rate
// limit de um unico provedor apagava toda a leitura de saldo on-chain.
// Nenhuma logica de leitura, escrita em BD ou formato de registo foi alterada.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];

const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const VALIUM = '0x37f70bccdc2125346a7542fe6e7fc70e33421635';
const PRESENCA = '0x120a1ba3B10263f9cB42e971598c860d66b68Cea';

// balanceOf(address) selector + padded address
function balanceOfCalldata(addr: string): string {
  const clean = addr.replace('0x', '').toLowerCase().padStart(64, '0');
  return '0x70a08231' + clean;
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  let lastErr: Error | null = null;
  for (const endpoint of RPCS) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (d.error) throw new Error(JSON.stringify(d.error));
      return d.result;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw new Error(`rpc ${method} falhou em todos os RPCs (${RPCS.length}): ${lastErr?.message ?? lastErr}`);
}

async function sb(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      ...(init?.headers ?? {})
    }
  });
}

async function executarLeitura() {
  try {
    const [ethHex, valiumHex, presencaHex, blockHex] = await Promise.all([
      rpc('eth_getBalance', [WALLET, 'latest']),
      rpc('eth_call', [{ to: VALIUM, data: balanceOfCalldata(WALLET) }, 'latest']),
      rpc('eth_call', [{ to: PRESENCA, data: balanceOfCalldata(WALLET) }, 'latest']),
      rpc('eth_blockNumber', [])
    ]);

    const registo = {
      wallet: WALLET,
      eth_balance_wei: BigInt(ethHex).toString(),
      valium_balance_wei: BigInt(valiumHex).toString(),
      presenca_balance_wei: BigInt(presencaHex).toString(),
      block_number: Number(BigInt(blockHex)),
      ok: true,
      erro: null
    };

    await sb('orum_leituras_onchain', {
      method: 'POST', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(registo)
    });

    return { ...registo, timestamp: new Date().toISOString() };
  } catch (e) {
    const erro = String(e).slice(0, 300);
    await sb('orum_leituras_onchain', {
      method: 'POST', headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ wallet: WALLET, ok: false, erro })
    }).catch(() => {});
    return { ok: false, erro, timestamp: new Date().toISOString() };
  }
}

Deno.serve(async (req: Request) => {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const resultado = await executarLeitura();
  return new Response(JSON.stringify(resultado), { headers: { 'Content-Type': 'application/json', ...CORS } });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { privateKeyToAccount } from "npm:viem@2/accounts";

// ora-cdp-teste-oraculo v1 -- 19/08/2026
// Mesma carteira de teste financiada por Jorge (ver ora-cdp-agente-teste),
// mesma tecnica de assinatura EIP-3009 (transferWithAuthorization), mas
// alvo diferente: paga o endpoint /oraculo (0.161 USDC) em vez de
// ora-licenca, para verificar ao vivo que truth_machine chega na resposta
// paga real. Nunca toca a Carteira Sagrada como pagadora, nunca usa chave
// fora do vault.

const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const WALLET_SAGRADA = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const { data: pkRows, error: pkErr } = await sb.rpc('orum_cdp_teste_pk');
    const pk = pkRows && pkRows[0]?.pk;
    if (pkErr || !pk) throw new Error('chave de teste nao encontrada no vault');
    const conta = privateKeyToAccount(pk as `0x${string}`);

    const value = '161000'; // 0.161 USDC, preco real do /oraculo

    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = '0x' + Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const now = Math.floor(Date.now() / 1000);
    const authorization = { from: conta.address, to: WALLET_SAGRADA, value, validAfter: '0', validBefore: String(now + 3300), nonce };

    const domain = { name: 'USD Coin', version: '2', chainId: CHAIN_ID, verifyingContract: USDC_BASE as `0x${string}` };
    const types = { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] } as const;
    const message = { from: conta.address as `0x${string}`, to: WALLET_SAGRADA as `0x${string}`, value: BigInt(value), validAfter: 0n, validBefore: BigInt(now + 3300), nonce: nonce as `0x${string}` };

    const signature = await conta.signTypedData({ domain, types, primaryType: 'TransferWithAuthorization', message });

    const paymentPayload = { x402Version: 2, scheme: 'exact', network: 'eip155:8453', payload: { signature, authorization } };
    const header = b64json(paymentPayload);

    const alvo = `${SUPABASE_URL}/functions/v1/ora-oraculo`;
    const resp = await fetch(alvo, { headers: { 'X-PAYMENT': header } });
    const respJson = await resp.json().catch(async () => ({ texto: await resp.text() }));

    return new Response(JSON.stringify({ ok: resp.status < 400, status_ora_oraculo: resp.status, pagador: conta.address, corpo: respJson }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String((e as Error)?.message || e) }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

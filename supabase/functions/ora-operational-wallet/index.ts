import * as btc from 'npm:@scure/btc-signer@1.8.1';
import { pubECDSA } from 'npm:@scure/btc-signer@1.8.1/utils';
import { bitcoinHandler, bitcoinNetwork } from './bitcoin.mjs';
import { makeClient } from './cdp.mjs';
import { handler } from './core.mjs';
const base = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name: string, args: unknown) {
  const r = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('internal_rpc_failed');
  return r.json();
}
async function chainRpc(method: string, params: unknown[]) {
  const r = await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('chain_unavailable');
  const data = await r.json();
  if (data.error) throw new Error('chain_error');
  return data.result;
}
Deno.serve(handler({ rpc, makeClient, chainRpc, bitcoinAction: bitcoinHandler({btc,pubECDSA}), bitcoinNet: bitcoinNetwork() }));

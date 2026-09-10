export const ACCOUNT_NAME = 'orum-operational-v1';
export const CREATE_ID = 'ca153211-4c87-47b7-8516-3256d6b70001';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const response = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// This component creates/observes one named account. It does not expose arbitrary signing or sending.
export function handler({ rpc, makeClient, chainRpc }) {
  return async req => {
    if (req.method !== 'POST') return response(405, { error: 'post_required' });
    const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization') || '')?.[1];
    if (!token) return response(401, { error: 'unauthorized' });
    try {
      if (await rpc('ora_operational_wallet_auth_v1', { p_token: token }) !== true) return response(401, { error: 'unauthorized' });
      const raw = await req.text();
      if (raw.length > 256) return response(413, { error: 'request_too_large' });
      let body;
      try { body = JSON.parse(raw); } catch { return response(400, { error: 'invalid_json' }); }
      if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !['create', 'observe'].includes(body.action)) return response(400, { error: 'invalid_action' });
      const keys = await rpc('orum_cdp_keys', {});
      const wallet = await rpc('orum_cdp_wallet_secret', {});
      if (!keys?.[0]?.key_id || !keys[0].key_secret || !wallet?.[0]?.wallet_secret) return response(503, { error: 'credentials_unavailable' });
      const cdp = makeClient({ apiKeyId: keys[0].key_id, apiKeySecret: keys[0].key_secret, walletSecret: wallet[0].wallet_secret });
      let account, created = false;
      try { account = await cdp.evm.getAccount({ name: ACCOUNT_NAME }); }
      catch (error) {
        if (error?.status !== 404 && error?.statusCode !== 404) throw error;
        if (body.action !== 'create') return response(404, { error: 'account_not_found' });
        account = await cdp.evm.createAccount({ name: ACCOUNT_NAME, idempotencyKey: CREATE_ID });
        created = true;
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(account.address) || account.name !== ACCOUNT_NAME) throw new Error('account_identity_mismatch');
      const observed = await cdp.evm.getAccount({ address: account.address });
      if (observed.address.toLowerCase() !== account.address.toLowerCase() || observed.name !== ACCOUNT_NAME) throw new Error('account_readback_mismatch');
      let balances = null, balanceState = 'unknown';
      try {
        if (await chainRpc('eth_chainId', []) !== '0x2105') throw new Error('wrong_chain');
        const block = await chainRpc('eth_blockNumber', []);
        const eth = await chainRpc('eth_getBalance', [account.address, block]);
        const usdc = await chainRpc('eth_call', [{ to: USDC, data: '0x70a08231' + account.address.slice(2).toLowerCase().padStart(64, '0') }, block]);
        if (!/^0x[0-9a-fA-F]+$/.test(eth) || !/^0x[0-9a-fA-F]{64}$/.test(usdc)) throw new Error('invalid_balance');
        balances = { block, eth_wei: BigInt(eth).toString(), usdc_atomic: BigInt(usdc).toString(), usdc_decimals: 6 };
        balanceState = 'observed_at_block';
      } catch { /* Account creation remains explicit even if chain observation fails. */ }
      return response(200, { schema: 'orum-operational-wallet/v1', name: ACCOUNT_NAME, address: account.address,
        created, provider_readback_verified: true, provider: 'Coinbase Developer Platform', operating_chain_id: 8453,
        balance_state: balanceState, balances, observed_at: new Date().toISOString(),
        purposes: ['receive_operational_funding', 'receive_organism_revenue', 'bounded_technical_expenses_after_executor_activation'],
        funding_transferred_by_this_call: false, financial_transaction_signed: false, transfers_enabled: false,
        custody: 'Server account in the user CDP project; operated by ORA through authenticated server tools. Not personally owned by the AI.',
        limitations: ['This route creates and observes; it does not sign or send financial transactions.', 'Base EVM address, not a native Bitcoin receiving address.', 'Balance does not establish external-revenue classification.'] });
    } catch (error) {
      // Never return provider messages, HTTP headers, credentials or stack traces.
      const status = Number(error?.status || error?.statusCode);
      return response(502, { error: 'provider_operation_failed', upstream_status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
        outcome: 'unknown_until_observed', retry_policy: 'observe named account before repeating create' });
    }
  };
}

// Read-only entitlement recovery. A signature authorizes short-lived access,
// never a payment. Replays within five minutes have the same narrow authority.
export const RENEWAL_DOMAIN = 'https://ora-x402-gateway.vercel.app/licenca/reacesso';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TX = /^0x[0-9a-f]{64}$/;
export function renewalMessage(tx: string, issuedAt: number, nonce: string): string {
  return `ORUM: renovar acesso a fotografia licenciada\nDomain: ${RENEWAL_DOMAIN}\nChain ID: 8453\nTransaction: ${tx}\nIssued At: ${issuedAt}\nNonce: ${nonce}\nScope: temporary photograph access only; no payment or asset transfer`;
}
type License = { id: string; tx_hash: string; obra_id: number; obra_sha256: string; tipo_licenca: string; licenciado: string; valida_ate: string | null; revogada_em: string | null };
type Dependencies = {
  loadLicense: (tx: string) => Promise<License | null>;
  verifySignature: (address: string, message: string, signature: string) => Promise<boolean>;
  deliver: (license: License, maxSeconds: number) => Promise<{ url: string; expira_em: string } | null>;
  now?: () => number;
};
export function createRenewalHandler(deps: Dependencies) {
  const now = deps.now || Date.now;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
    'X-ORUM-Reaccess-Version': '1',
  } });
  const fail = (code: string, status: number) => json({ acesso: 'nao_concedido', erro: code }, status);
  const usable = (l: License) => !l.revogada_em && (l.valida_ate === null || (Number.isFinite(Date.parse(l.valida_ate)) && Date.parse(l.valida_ate) > now()));
  return async (req: Request): Promise<Response> => {
    if (req.method === 'GET') {
      const tx = (new URL(req.url).searchParams.get('tx') || '').toLowerCase();
      if (!TX.test(tx)) return fail('transaction_hash_required', 400);
      const issued_at = Math.floor(now() / 1000), nonce = crypto.randomUUID();
      return json({ schema: 'orum-license-reaccess/v1', transactionHash: tx, issued_at, nonce,
        message: renewalMessage(tx, issued_at, nonce), endpoint: RENEWAL_DOMAIN,
        instruction: 'Sign the exact UTF-8 message with the licensed wallet (personal_sign), then POST transactionHash, issued_at, nonce, signature. No payment.',
        signature_valid_seconds: 300, payment_required: false });
    }
    if (req.method !== 'POST') return fail('method_not_allowed', 405);
    let body: any;
    try {
      const reader = req.body?.getReader();
      if (!reader) return fail('invalid_request', 400);
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); return fail('request_too_large', 413); } chunks.push(value); }
      const all = new Uint8Array(size); let offset = 0; for (const c of chunks) { all.set(c, offset); offset += c.length; }
      body = JSON.parse(new TextDecoder().decode(all));
    } catch { return fail('invalid_json', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_request', 400);
    const { transactionHash, issued_at, nonce, signature } = body;
    if (typeof transactionHash !== 'string' || !TX.test(transactionHash) || !Number.isSafeInteger(issued_at) || typeof nonce !== 'string' || !UUID.test(nonce) || typeof signature !== 'string' || !/^0x(?:[a-fA-F0-9]{2}){1,4096}$/.test(signature)) return fail('invalid_proof', 400);
    const age = Math.floor(now() / 1000) - issued_at;
    if (age < -30 || age > 300) return fail('signature_expired', 401);
    try {
      const license = await deps.loadLicense(transactionHash);
      if (!license || !usable(license)) return fail('license_unavailable', 403);
      if (!/^0x[0-9a-fA-F]{40}$/.test(license.licenciado)) return fail('license_holder_invalid', 503);
      if (!await deps.verifySignature(license.licenciado, renewalMessage(transactionHash, issued_at, nonce), signature)) return fail('signature_invalid', 401);
      // Re-read after verification; revocation/expiry must not be bypassed by a slow RPC.
      const current = await deps.loadLicense(transactionHash);
      if (!current || !usable(current) || current.id !== license.id || current.licenciado !== license.licenciado || current.obra_id !== license.obra_id || current.obra_sha256 !== license.obra_sha256) return fail('license_changed', 403);
      const seconds = Math.min(300, current.valida_ate ? Math.floor((Date.parse(current.valida_ate) - now()) / 1000) : 300);
      if (seconds < 1) return fail('license_expired', 403);
      const access = await deps.deliver(current, seconds);
      if (!access) return fail('photograph_unavailable', 503);
      return json({ acesso: 'renovado', obra_id: current.obra_id, sha256: current.obra_sha256,
        acesso_a_fotografia: access, valida_ate: current.valida_ate, pagamento_novo: false });
    } catch { return fail('reaccess_unavailable', 503); }
  };
}

// ORA · cliente mínimo do facilitador x402 da Coinbase (CDP) para o Vercel.
// Mesma autenticação que as Edge Functions usam (JWT EdDSA sobre chave Ed25519), mas
// sem Supabase. As credenciais vêm SÓ de variáveis de ambiente do projecto Vercel
// (CDP_API_KEY_ID, CDP_API_KEY_SECRET; tipo "sensitive"); nunca se registam nem se
// devolvem. Sem elas, `configurado` é false e a via directa recusa EIP-3009.
const crypto = require('node:crypto');

const HOST = 'api.cdp.coinbase.com';
const BASE_PATH = '/platform/v2/x402';
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const b64u = (buf) => Buffer.from(buf).toString('base64url');

// secret = base64 de 64 bytes (seed de 32 + chave pública de 32), formato das chaves CDP.
function assinarJwt(keyId, secretB64, method, host, path, agora) {
  const raw = Buffer.from(secretB64, 'base64');
  if (raw.length !== 64) throw new Error('chave CDP com tamanho invalido');
  const key = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, raw.subarray(0, 32)]), format: 'der', type: 'pkcs8' });
  const s = Math.floor(agora / 1000);
  const head = b64u(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: keyId, nonce: crypto.randomBytes(16).toString('hex') }));
  const body = b64u(JSON.stringify({ sub: keyId, iss: 'cdp', aud: ['cdp_service'], nbf: s, exp: s + 120, uri: `${method} ${host}${path}` }));
  const msg = `${head}.${body}`;
  return `${msg}.${b64u(crypto.sign(null, Buffer.from(msg), key))}`;
}

function createCdp({ env = process.env, fetchFn = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const id = env.CDP_API_KEY_ID;
  const secret = env.CDP_API_KEY_SECRET;
  return {
    configurado: Boolean(id && secret),
    // kind: 'verify' | 'settle'. Devolve { status, json } ou { erro } (nunca lança, nunca inclui credenciais).
    async chamar(kind, paymentPayload, paymentRequirements, resourceUrl) {
      if (!id || !secret) return { erro: 'facilitador nao configurado' };
      try {
        const path = `${BASE_PATH}/${kind}`;
        const jwt = assinarJwt(id, secret, 'POST', HOST, path, now());
        const r = await fetchFn(`https://${HOST}${path}`, {
          method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
          body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements, resource: { url: resourceUrl } }),
          signal: AbortSignal.timeout(4500),
        });
        return { status: r.status, json: await r.json().catch(() => ({})) };
      } catch (e) { return { erro: String((e && e.name === 'TimeoutError') ? 'tempo esgotado' : (e && e.message) || e).slice(0, 120) }; }
    },
  };
}

module.exports = { createCdp, assinarJwt };

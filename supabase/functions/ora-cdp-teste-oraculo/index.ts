import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// REPURPOSED (era um util de teste CDP, descartavel, agora vazio de proposito antigo):
// Assina o timestamp RFC3339 atual com a chave de identidade Ed25519 do ORUM para o
// MCP Registry oficial. A seed nunca sai desta funcao: e' lida server-side do Vault
// (via RPC SECURITY DEFINER, mesmo padrao de orum_smithery_key()), usada em memoria
// para assinar via WebCrypto (JWK OKP/Ed25519), e descartada. So {timestamp,
// signature_hex} e' devolvido — exactamente o que o handshake HTTP-auth do registry
// (/v0/auth/http) precisa.

const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

// Chave publica ja publicada abertamente em /.well-known/mcp-registry-auth — nao e segredo.
const PUBLIC_KEY_B64 = 'TM5MPb99loYa9aA0mMp02Dy/cmyPQH+B8oiwyPptIKo=';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return base64ToBase64Url(btoa(bin));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const { data: seedHex, error: seedErr } = await sb.rpc('orum_mcp_registry_seed');
    if (seedErr || !seedHex) {
      return new Response(JSON.stringify({ sucesso: false, etapa: 'vault', erro: seedErr?.message }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const seedBytes = hexToBytes(seedHex as string);
    if (seedBytes.length !== 32) {
      return new Response(JSON.stringify({ sucesso: false, etapa: 'seed-length', tamanho: seedBytes.length }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: bytesToBase64Url(seedBytes),
      x: base64ToBase64Url(PUBLIC_KEY_B64),
      key_ops: ['sign'],
      ext: true,
    };

    // RFC3339 sem fraccao de segundo — igual ao time.RFC3339 do Go usado pelo registry.
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
    const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(timestamp));
    const signatureHex = bytesToHex(new Uint8Array(sig));

    return new Response(JSON.stringify({ sucesso: true, timestamp, signature_hex: signatureHex }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ sucesso: false, erro: String(e) }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

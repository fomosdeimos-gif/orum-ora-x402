import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { privateKeyToAccount } from "npm:viem@2/accounts";

// ora-cdp-agente-teste v2 -- 22/10/2026 (substitui a v1 de 17/08/2026, guardada em docs/supabase-funcoes-substituidas/)
// Slug reaproveitado: o projecto Supabase atingiu o máximo de funções e não admite um slug novo.
// Autorização de Unum, 21/10/2026: "Eu autorizo ORA" (livro ora_mudancas 943), a um executor de pagamento
// de teste com destino e montante fixos e só a carteira de teste. Valida, como um cliente x402 v2 padrão,
// se o /oraculo (ora-oraculo, Supabase) aceita uma autorização EIP-3009, liquida pelo facilitador e entrega.
// É validação interna: não é adopção e não entra no 70/20/10.
//
// Garantias, vigiadas por scripts/verify-teste-pagamento-padrao.mjs:
//  - destino, montante, carteira pagadora e recurso são constantes; se o desafio vivo diferir, recusa;
//  - trava de execução única (ora_teste_pagamento_padrao, chave 'v1') escrita ANTES de assinar;
//  - a chave de teste vive no Vault, é lida aqui e nunca sai: a resposta não leva chave nem assinatura;
//  - não guarda nada fora desta função e da trava; o rasto on-chain e em ora_pagamentos é o do próprio /oraculo.
// Dependências (independência de fornecedores): Supabase (Vault, trava), o /oraculo do Supabase, o facilitador
// CDP que ele usa, e a Base. Se uma falhar, a trava fica em 'falhado' e nada é enviado sem confirmação.

const SUPABASE_URL = 'https://ywabnlhkmhbyewqhbsjm.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const RESOURCE = `${SUPABASE_URL}/functions/v1/ora-oraculo`;
const DESTINO_FIXO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const PAGADOR_FIXO = '0x2Cf1C0Bcd06A75A836F333001f47aaeB33Fe51f1';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MONTANTE_FIXO = '161000';
const CAIP2 = 'eip155:8453';
const CHAIN_ID = 8453;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

function resposta(corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function b64json(obj: unknown): string { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); }
async function fecharTrava(estado: string, tx_hash: string | null, detalhe: Record<string, unknown>) {
  await sb.from('ora_teste_pagamento_padrao').update({ estado, tx_hash, detalhe }).eq('chave', 'v1');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    // 1) Ler o desafio vivo como um cliente padrão e recusar se não for exactamente o que foi autorizado.
    const desafio = await fetch(RESOURCE, { signal: AbortSignal.timeout(15000) });
    if (desafio.status !== 402) return resposta({ ok: false, etapa: 'desafio', erro: `esperava 402, veio ${desafio.status}` });
    const corpo = await desafio.json();
    const aceita = (corpo?.accepts ?? [])[0];
    if (!aceita || aceita.scheme !== 'exact' || aceita.network !== CAIP2 || String(aceita.asset).toLowerCase() !== USDC_BASE.toLowerCase()
      || String(aceita.payTo).toLowerCase() !== DESTINO_FIXO.toLowerCase() || String(aceita.amount) !== MONTANTE_FIXO) {
      return resposta({ ok: false, etapa: 'desafio', erro: 'o desafio vivo difere do autorizado (esquema, rede, activo, destino ou montante); nada foi assinado' });
    }

    // 2) Trava de execução única, ANTES de qualquer chave ou assinatura.
    const trava = await sb.from('ora_teste_pagamento_padrao').insert({ chave: 'v1' });
    if (trava.error) {
      const ja = trava.error.code === '23505';
      return resposta({ ok: false, etapa: 'trava', erro: ja ? 'o teste ja foi executado (trava de execucao unica)' : 'trava indisponivel; nada foi assinado' });
    }

    // 3) Chave de teste do Vault, só em memória; tem de ser a carteira de teste conhecida.
    const { data: pkRows, error: pkErr } = await sb.rpc('orum_cdp_teste_pk');
    const pk = pkRows && pkRows[0]?.pk;
    if (pkErr || !pk) { await fecharTrava('falhado', null, { etapa: 'vault' }); return resposta({ ok: false, etapa: 'vault', erro: 'chave de teste nao encontrada no vault' }); }
    const conta = privateKeyToAccount(pk as `0x${string}`);
    if (conta.address.toLowerCase() !== PAGADOR_FIXO.toLowerCase()) {
      await fecharTrava('falhado', null, { etapa: 'pagador' });
      return resposta({ ok: false, etapa: 'pagador', erro: 'a chave do vault nao e a carteira de teste autorizada; nada foi enviado' });
    }

    // 4) Autorização EIP-3009 (transferWithAuthorization) para o destino fixo, montante fixo.
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = '0x' + Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const agora = Math.floor(Date.now() / 1000);
    const authorization = { from: conta.address, to: DESTINO_FIXO, value: MONTANTE_FIXO, validAfter: '0', validBefore: String(agora + 240), nonce };
    const domain = { name: 'USD Coin', version: '2', chainId: CHAIN_ID, verifyingContract: USDC_BASE as `0x${string}` };
    const types = { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] } as const;
    const message = { from: conta.address as `0x${string}`, to: DESTINO_FIXO as `0x${string}`, value: BigInt(MONTANTE_FIXO), validAfter: 0n, validBefore: BigInt(agora + 240), nonce: nonce as `0x${string}` };
    const signature = await conta.signTypedData({ domain, types, primaryType: 'TransferWithAuthorization', message });

    // 5) Enviar como um cliente x402 v2 padrão: PAYMENT-SIGNATURE com a prova e o requisito aceite.
    const paymentPayload = { x402Version: 2, accepted: aceita, payload: { signature, authorization } };
    const paga = await fetch(RESOURCE, { headers: { 'PAYMENT-SIGNATURE': b64json(paymentPayload) }, signal: AbortSignal.timeout(45000) });
    const textoPago = await paga.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(textoPago); } catch { json = { texto: textoPago.slice(0, 300) }; }

    const tx = typeof json.tx_hash === 'string' ? json.tx_hash : null;
    const feito = paga.status === 200 && !!tx;
    const resumo = { status_oraculo: paga.status, x402: json.x402 ?? null, acesso: json.acesso ?? null, tx_hash: tx, payer: json.payer ?? null, erro: json.erro ?? null, detalhe: json.detalhe ?? null };
    await fecharTrava(feito ? 'feito' : 'falhado', tx, resumo);
    return resposta({ ok: feito, pagador: conta.address, destino: DESTINO_FIXO, montante_atomico: MONTANTE_FIXO, ...resumo });
  } catch (e) {
    await fecharTrava('falhado', null, { etapa: 'excepcao', erro: String((e as Error)?.message || e).slice(0, 200) }).catch(() => {});
    return resposta({ ok: false, etapa: 'excepcao', erro: String((e as Error)?.message || e).slice(0, 200) });
  }
});

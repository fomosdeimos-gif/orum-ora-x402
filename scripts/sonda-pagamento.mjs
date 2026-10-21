// Sonda só de leitura da rota de pagamento: o que /oraculo e /campo respondem sem pagamento (o desafio 402)
// e se os facilitadores públicos anunciam a Base mainnet com o esquema exact do x402 v2.
// Não paga, não assina, não envia nada. Precisa de rede (Node 18+); corre numa sandbox com estes domínios.
// Uso: node scripts/sonda-pagamento.mjs   (imprime JSON; sai com 1 se alguma rota falhar o contrato)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'https://ora-x402-gateway.vercel.app';
// Valores fixos copiados de api/_carteira.js (RECEBIMENTO e RECEBIMENTO_EDGE) e api/_facilitador.js; scripts/verify-sonda.mjs confere a cópia.
// Desde 21/10/2026 há dois payTo legítimos: a operacional (via directa da Vercel) e a sagrada antiga (funções de borda do Supabase,
// quando respondem). Qualquer outro endereço continua a ser falha.
export const CONTRATO = {
  network: 'eip155:8453', scheme: 'exact',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x89460d9e0590559e63860197dfe2ac648A753584',
  payToAceites: ['0x89460d9e0590559e63860197dfe2ac648A753584', '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5'],
};
export const ROTAS = { '/oraculo': '161000', '/campo': '330000' }; // montantes vistos a 19/10/2026; só informativos
export const FACILITADORES = ['https://facilitator.payai.network', 'https://facilitator.mogami.tech'];

const igual = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

// fetcher(url) devolve { status, headers: { get(nome) }, texto }. Injectável para testar sem rede.
export async function sondarRota(rota, { fetcher }) {
  const r = { rota, ok: false };
  try {
    const res = await fetcher(`${BASE}${rota}`);
    r.http = res.status;
    if (res.status !== 402) { r.motivo = `esperava 402, veio ${res.status}`; return r; }
    const cab = res.headers.get('payment-required');
    let desafio;
    try { desafio = JSON.parse(cab ? Buffer.from(cab, 'base64').toString('utf8') : res.texto); } catch { r.motivo = 'desafio 402 ilegível'; return r; }
    const aceita = (Array.isArray(desafio?.accepts) ? desafio.accepts : []).find((a) => a?.network === CONTRATO.network);
    if (!aceita) { r.motivo = 'o desafio não oferece a Base mainnet'; return r; }
    r.amount = aceita.amount; r.payTo = aceita.payTo;
    if (aceita.scheme !== CONTRATO.scheme) { r.motivo = `esquema ${aceita.scheme}, esperava ${CONTRATO.scheme}`; return r; }
    if (!igual(aceita.asset, CONTRATO.asset)) { r.motivo = 'activo diferente do USDC da Base'; return r; }
    if (!CONTRATO.payToAceites.some((a) => igual(aceita.payTo, a))) { r.motivo = 'payTo diferente da carteira de recebimento'; return r; }
    if (!/^[1-9][0-9]*$/.test(String(aceita.amount))) { r.motivo = 'montante inválido'; return r; }
    r.preco_mudou = ROTAS[rota] !== undefined && String(aceita.amount) !== ROTAS[rota];
    r.ok = true;
  } catch (e) { r.motivo = String(e.message).slice(0, 120); }
  return r;
}

export async function sondarFacilitador(url, { fetcher }) {
  const r = { url, anuncia_base_exact_v2: false };
  try {
    const res = await fetcher(`${url}/supported`);
    r.http = res.status;
    if (res.status === 200) {
      const kinds = JSON.parse(res.texto)?.kinds;
      r.anuncia_base_exact_v2 = Array.isArray(kinds) && kinds.some((k) => k?.x402Version === 2 && k?.scheme === 'exact' && k?.network === CONTRATO.network);
    }
  } catch (e) { r.erro = String(e.message).slice(0, 120); }
  return r;
}

export async function sondar({ fetcher }) {
  const rotas = [];
  for (const rota of Object.keys(ROTAS)) rotas.push(await sondarRota(rota, { fetcher }));
  const facilitadores = [];
  for (const u of FACILITADORES) facilitadores.push(await sondarFacilitador(u, { fetcher }));
  return { ok: rotas.every((x) => x.ok), algum_facilitador_pronto: facilitadores.some((f) => f.anuncia_base_exact_v2), rotas, facilitadores };
}

const fetcherReal = async (url) => {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
  return { status: res.status, headers: res.headers, texto: await res.text() };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const saida = await sondar({ fetcher: fetcherReal });
  console.log(JSON.stringify({ lido_em_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), ...saida }));
  if (!saida.ok) process.exit(1);
}

// Teste de atravessamento da porta paga: corre clientes x402 padrão (v2: @x402/fetch; v1: x402-fetch) contra o desafio 402 REAL
// de um serviço e diz se cada um chega a anexar um pagamento. Faz um único GET ao serviço (como qualquer cliente); o segundo
// pedido, o "pago", é simulado localmente: nada é enviado ao serviço, a chave é descartável e sem fundos, e nada é pago.
// Uso: ORUM_X402_CLIENTES=<pasta com node_modules de @x402/fetch @x402/evm @x402/core viem x402-fetch> \
//        node scripts/teste-clientes-x402.mjs [oraculo|campo|leitura] [--base https://ora-x402-gateway.vercel.app]
//      --local      em vez de pedir ao serviço, gera o desafio com o código deste repositório (api/_x402-directo.js, sem rede)
//      --corpo-v1   substitui o corpo por um corpo v1 derivado do v2 (protótipo do desafio duplo; não toca no serviço)
// O repositório não tem dependências por desenho: as bibliotecas vêm de fora (instalar com `npm install --ignore-scripts`).
// Prova só se o CLIENTE anexa um pagamento ao desafio; não prova que o servidor o liquide, nem procura, adopção ou receita.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const porta = process.argv.slice(2).find((a) => !a.startsWith('--') && !/^https?:/.test(a)) || 'oraculo';
const base = arg('--base', 'https://ora-x402-gateway.vercel.app');
const dir = process.env.ORUM_X402_CLIENTES;
if (!dir) { console.error('defina ORUM_X402_CLIENTES (pasta com node_modules dos clientes x402 e do viem)'); process.exit(2); }
const req = createRequire(dir.replace(/\/?$/, '/') + 'package.json');
const versao = (pacote) => JSON.parse(fs.readFileSync(`${dir.replace(/\/?$/, '/')}node_modules/${pacote}/package.json`, 'utf8')).version;
const { generatePrivateKey, privateKeyToAccount } = req('viem/accounts');

// 1. o desafio real
const url = `${base}/${porta}`;
let r0; let cabecalho; let corpo;
if (process.argv.includes('--local')) {
  process.env.ORUM_PEDIDOS = 'off'; process.env.ORUM_FACILITATOR_URL = 'off'; process.env.ORUM_BTC_RAIL = 'off';
  const d = createRequire(import.meta.url)('../api/_x402-directo.js');
  const h = d.createHandler({ rpc: async () => { throw new Error('sem rede'); }, now: Date.now });
  const res = { h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, end(raw) { this.corpo = raw; } };
  const b = { oraculo: 'ora-oraculo', campo: 'ora-x402', leitura: 'ora-leitura' }[porta];
  await h({ headers: {} }, res, { base: b, rest: '', origin: base });
  r0 = { status: res.statusCode }; cabecalho = res.h['payment-required'] || null; corpo = res.corpo;
} else {
  r0 = await fetch(url, { headers: { 'user-agent': 'orum-teste-clientes-x402/1' } });
  cabecalho = r0.headers.get('payment-required'); corpo = await r0.text();
}
if (process.argv.includes('--corpo-v1')) {
  const b = JSON.parse(corpo); const a = b.accepts[0];
  corpo = JSON.stringify({ x402Version: 1, error: 'X-PAYMENT header required', accepts: [{ scheme: 'exact', network: 'base', maxAmountRequired: a.amount, resource: b.resource.url, description: String(b.resource.description).slice(0, 200), mimeType: b.resource.mimeType, payTo: a.payTo, maxTimeoutSeconds: a.maxTimeoutSeconds, asset: a.asset, extra: a.extra }] });
}

// 2. fetch simulado: devolve o desafio real e, com pagamento anexado, um 200 simulado
let chamadas;
const falso = async (u, init = {}) => {
  const h = new Headers(u && typeof u === 'object' && u.headers ? u.headers : (init.headers || {}));
  if (init.headers) for (const [k, v] of new Headers(init.headers)) h.set(k, v);
  const anexados = [...h.keys()].filter((k) => /pay/i.test(k));
  chamadas.push(anexados);
  if (!anexados.length) return new Response(corpo, { status: 402, headers: { 'content-type': 'application/json', ...(cabecalho ? { 'payment-required': cabecalho } : {}) } });
  return new Response('{"simulado":true}', { status: 200, headers: { 'content-type': 'application/json' } });
};
const conta = privateKeyToAccount(generatePrivateKey());
async function correr(nome, fn) {
  chamadas = [];
  try { const r = await fn(); return { cliente: nome, atravessa: chamadas.some((c) => c.length > 0), cabecalho_anexado: chamadas.flat()[0] || null, estado_final: r.status }; }
  catch (e) { return { cliente: nome, atravessa: false, falhou_antes_de_pagar: String(e && e.message || e).replace(/\s+/g, ' ').slice(0, 160) }; }
}
const saida = [];
try {
  const { wrapFetchWithPayment, x402Client } = req('@x402/fetch'); const { registerExactEvmScheme } = req('@x402/evm/exact/client');
  const c = new x402Client(); registerExactEvmScheme(c, { signer: conta });
  const v = versao('@x402/fetch');
  saida.push(await correr(`@x402/fetch ${v} (protocolo v2)`, () => wrapFetchWithPayment(falso, c)(url)));
} catch (e) { saida.push({ cliente: '@x402/fetch', nao_correu: String(e).slice(0, 120) }); }
try {
  const { wrapFetchWithPayment } = req('x402-fetch'); const v = versao('x402-fetch');
  saida.push(await correr(`x402-fetch ${v} (protocolo v1)`, () => wrapFetchWithPayment(falso, conta, 1000000n)(url)));
} catch (e) { saida.push({ cliente: 'x402-fetch', nao_correu: String(e).slice(0, 120) }); }
console.log(JSON.stringify({ formato: 'orum-teste-clientes-x402/v1', porta, url, desafio_http: r0.status, corpo_v1_simulado: process.argv.includes('--corpo-v1'), local: process.argv.includes('--local'), resultados: saida, nao_afirma: ['que o servidor verifique ou liquide um pagamento destes', 'procura, adopção ou receita'] }, null, 1));

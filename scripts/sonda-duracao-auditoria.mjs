// Sonda de duração de /auditoria (04/11/2026, livro 1344; Unum: "Eu autorizo ORA").
// Corre a createHandler REAL de api/_x402-directo.js com a Base simulada (um pagamento válido de 0,50 USDC, sem fundos)
// contra o catálogo PÚBLICO real da Coinbase, e mede quanto demora um pedido pago de ponta a ponta.
// Só faz GET ao catálogo público. Não paga, não assina, não usa segredos, não prova liquidação ao vivo.
// Limite: a latência medida é a da máquina onde corre; na Vercel pode ser diferente. O plano Hobby corta aos 10 s.
// Uso: node scripts/sonda-duracao-auditoria.mjs [pedidos=4] [limite_ms=8000]
import { createRequire } from 'node:module';
process.env.ORUM_PEDIDOS = 'off';
process.env.ORUM_FACILITATOR_URL = 'off';
process.env.ORUM_BTC_RAIL = 'off';
const require = createRequire(import.meta.url);
const d = require('../api/_x402-directo.js');
const aud = require('../api/_auditoria.js');

const PEDIDOS = Math.max(1, Math.min(Number(process.argv[2]) || 4, 12));
const LIMITE_MS = Number(process.argv[3]) || 8000; // margem sob os 10 s do Hobby
const pad = (h) => '0x' + h.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const TX = '0x' + 'a'.repeat(64);

const agora = Date.now();
const rpc = async (method) => {
  if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x64', logs: [{ address: d.USDC_BASE.toLowerCase(), topics: [d.TRANSFER_TOPIC, pad('0x1111111111111111111111111111111111111111'), pad(d.WALLET)], data: '0x' + (500000n).toString(16) }] };
  if (method === 'eth_getBlockByNumber') return { timestamp: '0x' + Math.floor((agora - 60000) / 1000).toString(16) };
  throw new Error('inesperado ' + method);
};
const handler = d.createHandler({ rpc, now: () => Date.now(), esperar: async () => {} });

async function pedido(marca, offset) {
  const res = { h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, end(raw) { this.body = raw ? JSON.parse(raw) : null; } };
  const req = { url: `/auditoria?marca=${encodeURIComponent(marca)}&offset=${offset}`, headers: { 'x-payment': Buffer.from(JSON.stringify({ transactionHash: TX })).toString('base64') } };
  const t0 = performance.now();
  await handler(req, res, { base: 'ora-auditoria', rest: '', origin: 'https://ora-x402-gateway.vercel.app' });
  return { ms: Math.round(performance.now() - t0), status: res.statusCode, r: res.body && res.body.resultado };
}

const medidas = [];
let offset = 0;
for (let i = 0; i < PEDIDOS; i++) {
  const m = await pedido('sonda-inexistente-' + 'x'.repeat(8), offset);
  medidas.push({ pedido: i + 1, offset, status: m.status, ms: m.ms, recursos_lidos: m.r && m.r.recursos_lidos, proximo_offset: m.r && m.r.proximo_offset, erro: m.r && m.r.erro });
  if (m.status !== 200 || !m.r || m.r.proximo_offset === null) break;
  offset = m.r.proximo_offset;
}
const ms = medidas.map((m) => m.ms);
const max = Math.max(...ms);
const lidos = medidas.reduce((s, m) => s + (m.recursos_lidos || 0), 0);
const saida = {
  format: 'orum-sonda-duracao-auditoria/v1', lido_em_utc: new Date().toISOString(), orcamento_do_modulo_ms: aud.ORCAMENTO_MS, limite_da_sonda_ms: LIMITE_MS,
  pedidos: medidas, max_ms: max, media_ms: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length), recursos_lidos_no_total: lidos,
  dentro_do_limite: max <= LIMITE_MS && medidas.every((m) => m.status === 200),
  nao_inclui: ['a verificação do pagamento na Base (dois RPC reais, ~0,3 a 2 s)', 'o arranque a frio da função na Vercel', 'a latência da Vercel para a Coinbase'],
  nota: 'Mede só o código da auditoria + o catálogo público real, a partir da máquina que corre a sonda. Soma ao máximo os RPC da Base antes de comparar com os 10 s do Hobby. Não prova liquidação nem entrega ao vivo.',
};
console.log(JSON.stringify(saida, null, 2));
process.exit(saida.dentro_do_limite ? 0 : 1);

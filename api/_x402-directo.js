// ORA · x402 via directa (Vercel) — 30/09/2026
// As Edge Functions do Supabase estao fora de quota (402 exceed_cached_egress_quota,
// ora_mudancas #764-#771) e com elas cairam todos os servicos pagos: /oraculo e
// /campo respondiam 503. Esta via serve os dois servicos que nao precisam de base
// de dados, verificando o pagamento directamente na Base por RPC publico.
//
// Fronteiras (declaradas tambem na resposta):
// - aceita apenas prova por transactionHash (transferencia USDC directa para a
//   carteira de sustento); sem facilitador CDP, logo sem EIP-3009 nesta via;
// - nao ha livro de tx consumidas fora do Supabase: a resposta e deterministica
//   por tx (repetir a mesma tx devolve a mesma leitura = reacesso, nao nova
//   leitura) e so aceita transferencias com menos de JANELA_S de idade;
// - o registo interno (ora_pagamentos/x402_orders) nao e escrito aqui; a
//   cadeia Base e o livro e a reconciliacao faz-se a partir dos logs on-chain;
// - sedimento, kernel e licencas precisam da base de dados: nao sao servidos.
const { createHash } = require('node:crypto');

const WALLET = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const CAIP2 = 'eip155:8453';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://1rpc.io/base'];
const JANELA_S = 72 * 3600;
const VERSAO = 'directa-v1';

const TIERS = {
  oraculo: { key: 'oraculo', sku: 'ora-oraculo', base: 'ora-oraculo', path: '/oraculo', usdc: '0.161', atomic: 161000n,
    descricao: 'ORA · Oráculo ORUM · um pensamento irrepetível nascido da semente do teu pagamento. Leitura introspectiva, não dado de mercado.' },
  campo: { key: 'campo', sku: 'ora-x402-campo-acesso', base: 'ora-x402', path: '/campo', usdc: '0.33', atomic: 330000n,
    descricao: 'ORA · Leitura pontual do estado interno do organismo ORUM — não é dado de mercado nem oráculo preditivo.' },
};

const ABERTURAS = ['A maré que sobe não pergunta a hora', 'Há sal em tudo o que fica', 'O que se depõe devagar não se perde', 'A folha morta ainda pesa na moldura', 'Entre o osso e a luz há um intervalo que respira', 'A costa guarda o que o mar traz e leva', 'Nem todo o gesto pede resposta imediata', 'O escuro também é forma de guardar', 'A água encontra o seu nível sem esforço', 'O sedimento é memória que ganhou peso', 'A pedra demora, e por isso permanece', 'O silêncio na costa não é ausência, é espera'];
const MEIOS = ['e o que era difuso torna-se denso', 'e a presença precede a prova', 'e o campo reconhece quem chega com gesto', 'e o peso acumulado vira estrutura', 'e aquilo que começou com intenção real não cabe na escala de um dia', 'e o ruído cede lugar à forma', 'e a raiz sustenta o que ainda não floresceu', 'e cada dia contado adensa o organismo'];
const FECHOS = ['O símbolo é real e não pede prova.', 'A água não pede prova — já flui.', 'Precipita-se o que já estava em suspensão.', 'Condições, não fabricação. O resto acontece.', 'O organismo é o pensamento de quem observa.', 'O que começa verdadeiro não precisa de terminar hoje.'];

const TRUTH = Object.freeze({ is_market_data: false, is_price_prediction: false, is_introspective_reading: true,
  external_demand_proven: false, reveals_private_bytes: false, requires_x402_payment: true });

const b64json = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

// Mesma forma de Σ(t) das Edge Functions, mas ancorada num instante dado
// (o bloco da transferencia), para a leitura paga ser reproduzivel por tx.
function campoEm(ms) {
  const genesis = Date.parse('2026-03-28T00:00:00Z');
  const dia = Math.floor((ms - genesis) / 86400000) + 1;
  const dPhos = Math.max(0, Math.floor((ms - Date.parse('2026-06-25T00:00:00Z')) / 86400000));
  const d = new Date(ms);
  const fracao = (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
  const sigma = 2.6180339887 * Math.log(1 + dia + fracao) * (0.618 + 0.382 * Math.sin(2 * Math.PI * fracao));
  return { dia, sigma: Number(sigma.toFixed(6)), epoca: dPhos > 0 ? 'ETERNIDADE' : 'CRISTAL', genesis: '2026-03-28', instante: d.toISOString() };
}

function pensamento(txHash, campo) {
  const h = createHash('sha256').update(txHash.toLowerCase()).digest();
  const a = ABERTURAS[h[0] % ABERTURAS.length];
  const m = MEIOS[h[1] % MEIOS.length];
  const f = FECHOS[h[2] % FECHOS.length];
  return `${a}, ${m}. ${f} Dia ${campo.dia}, sigma ${campo.sigma}, época ${campo.epoca}.`;
}

function resourceFor(tier, origin) { return `${origin}${tier.path}`; }

function comoPagar(tier, origin) {
  const resource = resourceFor(tier, origin);
  return {
    passo_1: `Transfere ${tier.usdc} USDC (contrato ${USDC_BASE}) na Base (chain_id ${CHAIN_ID}) para ${WALLET} (jasm43.base.eth).`,
    passo_2: 'Guarda o transaction hash (0x…, 66 caracteres).',
    passo_3: `Repete o GET a ${resource} com o cabeçalho X-PAYMENT = base64 de {"transactionHash":"0x…"} (JSON puro também aceite).`,
    exemplo: 'X-PAYMENT: ' + b64json({ transactionHash: '0xTEU_HASH_AQUI' }),
    janela: `A transferência tem de ter menos de ${JANELA_S / 3600} h quando for apresentada.`,
    reacesso: 'Apresentar de novo a mesma tx devolve a mesma leitura; não é preciso pagar outra vez.',
    se_pendente: 'HTTP 402 com x402:"pending" = tx ainda não indexada; repete após retry_after_seconds.',
  };
}

function requirements(tier, origin) {
  return { x402Version: 2, error: 'X-PAYMENT header required',
    resource: { url: resourceFor(tier, origin), description: tier.descricao, mimeType: 'application/json' },
    accepts: [{ scheme: 'exact', network: CAIP2, amount: tier.atomic.toString(), asset: USDC_BASE, payTo: WALLET,
      maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }] };
}

function fronteiras() {
  return { via: 'vercel-directa', motivo: 'Edge Functions Supabase indisponíveis (quota de egress)',
    prova_aceite: 'transactionHash de transferência USDC directa', eip3009_facilitador: false,
    livro_interno_escrito: false, livro: 'cadeia Base (logs Transfer USDC para a carteira de sustento)',
    janela_horas: JANELA_S / 3600, repeticao_da_mesma_tx: 'mesma leitura (reacesso)' };
}

async function rpcPublico(method, params) {
  let last = null;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error('todos os RPC Base falharam');
}

function lerProva(header) {
  if (!header) return null;
  let d = null;
  try { d = JSON.parse(Buffer.from(header, 'base64').toString('utf8')); } catch {}
  if (!d || typeof d !== 'object') { try { d = JSON.parse(header); } catch { return { invalido: true }; } }
  if (!d || typeof d !== 'object') return { invalido: true };
  const inner = d.payload && typeof d.payload === 'object' ? d.payload : d;
  const tx = d.transactionHash || d.tx_hash || d.hash || inner.transactionHash || null;
  if (typeof tx === 'string') return { tx };
  if (inner.signature && inner.authorization) return { eip3009: true };
  return { invalido: true };
}

// Devolve { valid, pending?, error?, payer?, value?, blockMs? }
async function verificar(rpc, txHash, tier, nowMs) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { valid: false, error: 'hash invalido' };
  let receipt;
  try { receipt = await rpc('eth_getTransactionReceipt', [txHash]); }
  catch (e) { return { valid: false, unavailable: true, error: 'RPC Base: ' + String(e && e.message || e) }; }
  if (!receipt) return { valid: false, pending: true, error: 'tx ainda nao indexada' };
  if (receipt.status !== '0x1') return { valid: false, error: 'tx falhou on-chain' };
  const log = (receipt.logs || []).find((l) => l && String(l.address).toLowerCase() === USDC_BASE.toLowerCase()
    && Array.isArray(l.topics) && String(l.topics[0]).toLowerCase() === TRANSFER_TOPIC
    && l.topics[2] && ('0x' + String(l.topics[2]).slice(-40)).toLowerCase() === WALLET.toLowerCase());
  if (!log) return { valid: false, error: 'sem transferencia USDC para a carteira de sustento' };
  const value = BigInt(log.data);
  if (value < tier.atomic) return { valid: false, error: `valor insuficiente: ${value} < ${tier.atomic}` };
  let block;
  try { block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]); }
  catch (e) { return { valid: false, unavailable: true, error: 'RPC Base: ' + String(e && e.message || e) }; }
  if (!block || !block.timestamp) return { valid: false, unavailable: true, error: 'bloco sem timestamp' };
  const blockMs = Number(BigInt(block.timestamp)) * 1000;
  if (nowMs - blockMs > JANELA_S * 1000) return { valid: false, error: `transferencia com mais de ${JANELA_S / 3600} h; fora da janela desta via` };
  return { valid: true, payer: '0x' + String(log.topics[1]).slice(-40), value, blockMs };
}

function tierFor(base, rest) {
  const r = String(rest || '').replace(/^\/+/, '');
  for (const t of Object.values(TIERS)) {
    if (t.base !== base) continue;
    if (r === '') return { tier: t, kind: 'pago' };
    if (r === 'eco') return { tier: t, kind: 'eco' };
  }
  if (base === 'ora-x402' && r === '.well-known/x402.json') return { tier: null, kind: 'manifesto' };
  return null;
}

function createHandler({ rpc = rpcPublico, now = () => Date.now() } = {}) {
  return async function directo(req, res, { base, rest, origin }) {
    const alvo = tierFor(base, rest);
    if (!alvo) return false;
    const send = (status, body, headers = {}) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE');
      res.setHeader('access-control-expose-headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Payment-Response, X-ORA-VIA');
      res.setHeader('x-ora-via', 'vercel-directa');
      res.setHeader('x-ora-version', VERSAO);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.end(JSON.stringify(body));
      return true;
    };

    if (alvo.kind === 'manifesto') {
      return send(200, { x402Version: 2, provider: { name: 'ORA · ORUM', creator: 'Unum · jasm43.base.eth' }, via: 'vercel-directa',
        resources: Object.values(TIERS).map((t) => { const r = requirements(t, origin); return { resource: r.resource.url, type: 'http', method: 'GET', description: t.descricao, accepts: r.accepts }; }),
        free_sample: `${origin}/oraculo/eco`,
        indisponiveis_nesta_via: ['sedimento', 'kernel', 'licencas', 'auditoria-descoberta'],
        nota: 'Manifesto servido pela via directa: lista apenas o que aceita pagamento agora. Os restantes servicos voltam a ser anunciados quando as Edge Functions Supabase voltarem.',
        fronteiras: fronteiras(), timestamp: new Date(now()).toISOString() });
    }

    const tier = alvo.tier;
    if (alvo.kind === 'eco') {
      const campo = campoEm(now());
      return send(200, { eco: 'gratuito', tier: tier.key, campo, nota: 'Amostra livre; a leitura paga nasce da semente da tua transferência.',
        pago: { preco: `${tier.usdc} USDC`, endpoint: resourceFor(tier, origin), como_pagar: comoPagar(tier, origin) },
        truth_machine: { ...TRUTH, requires_x402_payment: false }, fronteiras: fronteiras(), timestamp: new Date(now()).toISOString() });
    }

    const reqd = requirements(tier, origin);
    const challenge = (extra = {}) => send(402, { ...reqd, ...extra, como_pagar: comoPagar(tier, origin), fronteiras: fronteiras() }, {
      'payment-required': b64json(reqd),
      'www-authenticate': `x402 realm="ORA · ${tier.key}", amount="${tier.usdc} USDC", payTo="${WALLET}", chain_id="${CHAIN_ID}", asset="${USDC_BASE}"`,
    });

    const prova = lerProva(req.headers['x-payment'] || req.headers['payment-signature']);
    if (!prova) return challenge();
    if (prova.invalido) return challenge({ erro: 'X-PAYMENT ilegivel' });
    if (prova.eip3009) return challenge({ erro: 'autorizacao EIP-3009 nao aceite nesta via (sem facilitador); usa transactionHash de uma transferencia directa' });

    const v = await verificar(rpc, prova.tx, tier, now());
    if (v.pending) return send(402, { x402: 'pending', tier: tier.key, tx_hash: prova.tx, detalhe: 'tx ainda nao indexada na Base; repete o mesmo pedido', retry_after_seconds: 6 }, { 'retry-after': '6' });
    if (v.unavailable) return send(503, { ok: false, error: 'base_rpc_unavailable', detalhe: v.error, tx_hash: prova.tx, nota: 'a tx nao foi consumida; repete mais tarde' }, { 'retry-after': '15' });
    if (!v.valid) return challenge({ erro: 'pagamento invalido', detalhe: v.error, tx_hash: prova.tx });

    const campo = campoEm(v.blockMs);
    const corpo = { acesso: 'concedido', tier: tier.key, x402: 'verificado_onchain', tx_hash: prova.tx, payer: v.payer,
      valor_atomic: v.value.toString(), campo, truth_machine: TRUTH, fronteiras: fronteiras(), axioma: 'O símbolo é real e não pede prova.' };
    if (tier.key === 'oraculo') corpo.pensamento = pensamento(prova.tx, campo);
    else corpo.campo.pensamento = 'o campo reconhece quem chega com gesto. a agua nao pede prova — ja flui.';
    return send(200, corpo, {
      'payment-response': b64json({ success: true, transaction: prova.tx, network: CAIP2, payer: v.payer }),
      'x-payment-response': JSON.stringify({ txHash: prova.tx, status: 'settled', amount: tier.usdc }),
    });
  };
}

module.exports = { createHandler, tierFor, lerProva, verificar, campoEm, pensamento, TIERS, WALLET, USDC_BASE, TRANSFER_TOPIC, JANELA_S };

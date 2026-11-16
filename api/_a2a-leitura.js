'use strict';
// ORA · skill A2A paga por x402: `leitura_verificada` (15/11/2026; Unum: "Eu autorizo", à proposta concreta de ligar o A2A ao
// pagamento com uma leitura que uma máquina usa sozinha). Não é uma função (prefixo _): não conta para o limite de 12.
//
// Não reimplementa o pagamento: chama o MESMO tratador da via directa (api/_x402-directo.js, tier `leitura`, 0,01 USDC na Base),
// que verifica a prova na cadeia (transactionHash ou autorização EIP-3009 liquidada por facilitador e confirmada por nós) e só
// depois entrega a leitura (api/_leitura.js: VALIUM da sagrada em 3 RPC no mesmo bloco, Fundação BTC em 2 fontes Esplora).
//
// Segue o fluxo da extensão a2a-x402 v0.1 (https://github.com/google-a2a/a2a-x402/v0.1) nas chaves e nos estados:
//   1. mensagem "leitura_verificada"                       -> Task `input-required`, x402.payment.status=payment-required + x402.payment.required
//   2. mensagem com taskId, x402.payment.status=payment-submitted + x402.payment.payload
//                                                          -> Task `completed` (payment-completed + receipts + artefacto) ou `failed` (payment-failed + error)
//   3. x402.payment.status=payment-rejected                -> Task `canceled`
// CONFORMIDADE PARCIAL, dita: (a) a ORA não retém tarefas, por isso o taskId é determinístico e `tasks/get` continua a responder
// TaskNotFound (a prova de pagamento é que manda, não o estado); (b) devolve sempre o resultado numa só resposta (não há `working`
// persistido; só `working` quando a tx ainda não foi indexada); (c) só USDC na Base, sem a via Bitcoin; (d) a extensão é declarada
// no agent-card com `required: false`. Não há extensão obrigatória nem verificação do cabeçalho X-A2A-Extensions: se o cliente a
// activar, o servidor ecoa-a; se não, serve na mesma.
const { createHash } = require('node:crypto');
const { createHandler, requirements, TIERS } = require('./_x402-directo');

const URI = 'https://github.com/google-a2a/a2a-x402/v0.1';
const ORIGEM = 'https://ora-x402-gateway.vercel.app';
const K = Object.freeze({ status: 'x402.payment.status', required: 'x402.payment.required', payload: 'x402.payment.payload', receipts: 'x402.payment.receipts', error: 'x402.payment.error' });
const ESTADOS = Object.freeze(['payment-submitted', 'payment-rejected']);
const CAIP2 = 'eip155:8453';
const digest = (v) => createHash('sha256').update(v).digest('hex');

const ehLeitura = (texto) => /^leitura_verificada(?:\s|$)/.test(texto);
const taskIdDe = (contextId, messageId) => digest(`orum-a2a-leitura-v1\n${contextId}\n${messageId}`);

function capturar() {
  const h = {};
  return { h, statusCode: 200, corpo: null, setHeader(k, v) { h[String(k).toLowerCase()] = v; }, end(raw) { this.corpo = raw ? JSON.parse(raw) : null; } };
}

function criar({ directo = createHandler(), now = () => Date.now() } = {}) {
  const tipo = (estado, contextId, id, status, extra = {}) => ({ kind: 'task', id, contextId,
    status: { state: estado, timestamp: new Date(now()).toISOString(), message: { kind: 'message', role: 'agent', messageId: digest(id + estado + status.texto), contextId, taskId: id,
      parts: [{ kind: 'text', text: status.texto }], metadata: { [K.status]: status.estado, ...(status.meta || {}) } } },
    ...extra });

  function pedirPagamento(contextId, messageId) {
    const id = taskIdDe(contextId, messageId);
    const req = requirements(TIERS.leitura, ORIGEM);
    delete req.error; // o estado vai em x402.payment.status
    return tipo('input-required', contextId, id, { estado: 'payment-required', meta: { [K.required]: req },
      texto: 'A leitura verificada custa 0,01 USDC na Base (x402 v2, esquema exact). Assina um dos accepts de x402.payment.required (ou transfere o valor e usa {"transactionHash":"0x…"}) e responde com esta taskId, x402.payment.status="payment-submitted" e x402.payment.payload. Devolvo o saldo VALIUM da carteira sagrada (3 RPC Base, mesmo bloco) e a Fundação em Bitcoin (2 fontes Esplora), só com valor onde as fontes concordam. Não é dado de mercado nem prova receita; esta mensagem não afirma que alguém pagou.' });
  }

  async function submeter(m, contextId, taskId, estado, payload) {
    if (estado === 'payment-rejected') {
      return tipo('canceled', contextId, taskId, { estado: 'payment-rejected', texto: 'Pagamento recusado pelo cliente; nada foi cobrado nem entregue.', meta: { [K.error]: 'CLIENT_REJECTED' } });
    }
    const res = capturar();
    const req = { headers: { 'x-payment': Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') }, url: '/leitura' };
    await directo(req, res, { base: 'ora-leitura', rest: '', origin: ORIGEM });
    const corpo = res.corpo || {};
    if (res.statusCode === 200 && corpo.leitura) {
      const recibo = { success: true, transaction: corpo.tx_hash, network: CAIP2, payer: corpo.payer };
      const v = corpo.leitura.valium_na_sagrada, f = corpo.leitura.fundacao_btc;
      const resumo = `Leitura verificada. VALIUM na sagrada: ${v.verificado ? `${v.valium} (bloco ${v.bloco}, ${v.fontes_ok.length} fontes)` : `sem valor (${v.estado})`}. Fundação BTC: ${f.verificado ? `${f.saldo_confirmado_sats} sats confirmados (${f.fontes_ok.length} fontes)` : `sem valor (${f.estado})`}. Não prova receita, procura nem preço.`;
      return tipo('completed', contextId, taskId, { estado: 'payment-completed', texto: resumo, meta: { [K.receipts]: [recibo] } },
        { artifacts: [{ artifactId: digest(taskId + corpo.tx_hash).slice(0, 32), name: 'leitura-verificada', description: 'orum-leitura-verificada/v1', parts: [{ kind: 'data', data: corpo.leitura }] },
          ...(corpo.recibo ? [{ artifactId: digest(taskId + corpo.tx_hash + 'recibo').slice(0, 32), name: 'recibo-leitura', description: 'orum-recibo-leitura/v1 (confere-se sem a ORA: kit/recibo.mjs)', parts: [{ kind: 'data', data: corpo.recibo }] }] : [])] });
    }
    if (res.statusCode === 402 && corpo.x402 === 'pending') {
      return tipo('working', contextId, taskId, { estado: 'payment-submitted', texto: `${corpo.detalhe || 'tx ainda não indexada'}; repete a mesma mensagem, não pagues de novo.`, meta: { [K.error]: 'PAYMENT_PENDING' } });
    }
    const codigo = res.statusCode === 503 ? 'SERVICE_UNAVAILABLE' : 'INVALID_PAYMENT';
    const detalhe = String(corpo.detalhe || corpo.erro || corpo.error || 'pedido recusado').slice(0, 160);
    const nota = res.statusCode === 503 ? ' Nada foi consumido que não possas repetir; verifica o detalhe antes de pagar de novo.' : ' Nada foi entregue.';
    return tipo('failed', contextId, taskId, { estado: 'payment-failed', texto: `Pagamento não aceite: ${detalhe}.${nota}`, meta: { [K.error]: codigo } });
  }

  // Devolve { result } ou { erro: [codigo, mensagem] }.
  async function tratar({ m, text, contextId }) {
    const meta = m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata) ? m.metadata : {};
    const estado = meta[K.status];
    if (estado === undefined) {
      if (m.taskId) return { erro: [-32001, 'Task not found'] };
      return { result: pedirPagamento(contextId, m.messageId) };
    }
    if (!ESTADOS.includes(estado)) return { erro: [-32602, `${K.status} must be one of ${ESTADOS.join(', ')}`] };
    if (typeof m.taskId !== 'string' || !/^[0-9a-f]{64}$/.test(m.taskId)) return { erro: [-32602, 'taskId from the payment-required task is required'] };
    if (estado === 'payment-submitted') {
      const p = meta[K.payload];
      if (!p || typeof p !== 'object' || Array.isArray(p)) return { erro: [-32602, `${K.payload} must be an object`] };
      return { result: await submeter(m, contextId, m.taskId, estado, p) };
    }
    return { result: await submeter(m, contextId, m.taskId, estado, null) };
  }
  return { tratar, ehLeitura };
}

module.exports = { criar, ehLeitura, taskIdDe, URI, K };

// Registo dos pedidos às rotas pagas, visto do proxy do Vercel (livro 1106, Unum: "Eu autorizo"). Fecha o ponto cego da via directa:
// o 402 da Base sai daqui desde 25/10/2026 e não ficava registado em lado nenhum.
// Sem dados pessoais: não envia IP, user-agent em bruto, endereço de pagador nem hash de origem. Só rota, método, via, estado HTTP,
// classe de máquina e tipo de prova. Escrita aberta pela RPC ora_registar_pedido_directo (tecto de 300 por minuto no lado da base):
// é um relato não autenticado, para medir, nunca prova de pagamento, procura ou receita.
// Falha segura: com prazo curto, qualquer erro é engolido e a resposta sai sempre. ORUM_PEDIDOS=off desliga (variável de Unum).
const { lerProva } = require('./_x402-directo');
const SUPA = (process.env.ORUM_SUPABASE_REST_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/').replace(/\/?$/, '/');
const KEY = process.env.ORUM_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb';

function classe(ua) {
  const u = String(ua || '').trim();
  if (!u) return 'vazio';
  if (/x402[-_ ]?lint/i.test(u)) return 'x402_linter';
  if (/x402|bazaar|facilitator/i.test(u)) return 'x402_observador';
  if (/bot|spider|crawl|zerobot|scan/i.test(u)) return 'robot';
  if (/^curl\//i.test(u)) return 'curl';
  if (/^(node|undici)|axios|python-requests|go-http|okhttp/i.test(u)) return 'node_generico';
  if (/mozilla\//i.test(u)) return 'navegador';
  return 'outro';
}

function construir(req, res, alvo) {
  const cab = req.headers['x-payment'] || req.headers['payment-signature'];
  const prova = cab ? lerProva(cab) : null;
  const tipo = !cab ? null : prova && prova.btc ? 'btc' : prova && prova.eip3009 ? 'eip3009' : prova && prova.tx ? 'tx' : 'invalida';
  const via = res.getHeader && res.getHeader('x-ora-via') === 'vercel-directa' ? 'vercel-directa' : (res.getHeader && res.getHeader('x-ora-fonte') ? 'snapshot' : 'origem');
  return {
    rota: alvo.tier.path + (alvo.kind === 'eco' ? '/eco' : ''),
    metodo: String(req.method || 'GET').toUpperCase(),
    via,
    estado_http: res.statusCode,
    sinal_pagamento: Boolean(cab),
    tipo_prova: tipo,
    classe: classe(req.headers['user-agent']),
  };
}

function rpcPublico(registo) {
  return fetch(`${SUPA}rpc/ora_registar_pedido_directo`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p: registo }),
  });
}

const comPrazo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

// Embrulha res.end uma só vez: regista (com prazo) e só depois deixa sair a resposta, para a função não ser congelada a meio.
function medir(req, res, alvo, { rpc = rpcPublico, prazoMs = 400, env = process.env } = {}) {
  if (!alvo || !alvo.tier || (alvo.kind !== 'pago' && alvo.kind !== 'eco') || env.ORUM_PEDIDOS === 'off') return;
  const fim = res.end;
  let feito = false;
  res.end = function (...args) {
    if (feito) return fim.apply(this, args);
    feito = true;
    let reg = null;
    try { reg = construir(req, res, alvo); } catch {}
    const espera = reg ? comPrazo(Promise.resolve().then(() => rpc(reg)).catch(() => {}), prazoMs) : Promise.resolve();
    espera.then(() => fim.apply(res, args), () => fim.apply(res, args));
    return res;
  };
}

module.exports = { medir, construir, classe, rpcPublico };

// ORA · Gateway proxy — reencaminha para as Edge Functions do Supabase
// preservando os cabecalhos do protocolo x402 nos dois sentidos.
// ORA 21/07/2026: repassa tambem uma referencia real de origem do pedido
// (x-forwarded-for) num cabecalho proprio — o log deixava de distinguir
// maquinas de verdade porque muitos clientes chegam com user-agent generico
// "node". O hash em si (sem guardar IP em bruto) e feito do lado do Supabase.
// ORA 24/07/2026 (D133): passa o host externo real em x-ora-host. O Supabase
// sobrepoe x-forwarded-host com o seu proprio dominio, o que fazia o 402
// anunciar um resource diferente do URL que a maquina tinha pedido —
// validadores x402 rejeitam essa divergencia.
// ORA 30/09/2026: quando o Supabase falha (quota de egress, 5xx ou rede), os
// servicos que nao precisam de base de dados passam para a via directa Vercel
// (api/_x402-directo.js), que verifica o pagamento na propria Base.
const { createHandler: criarDirecto, tierFor, lerProva, WALLET } = require('./_x402-directo');
const directo = criarDirecto();
const { elevarBazaar } = require('./_bazaar-declaracao');
const { juntarOfertaBtc, comPrazo } = require('./_oferta-btc-origem');
const { createBtc } = require('./_pagamento-btc');
const btcOferta = createBtc();
const recebimentos = require('./_recebimentos');
const bitcoin = require('./_bitcoin');
const saldos = require('./_saldos');
const snapshot = require('./_snapshot');
const SUPA = (process.env.ORUM_FUNCTIONS_BASE || 'https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1').replace(/\/$/, '');
const PASS_RES = ['content-type', 'payment-required', 'payment-response', 'x-payment-response', 'www-authenticate', 'retry-after', 'x-ora-version', 'x-ora-x402', 'x-ora-tier', 'extension-responses', 'cache-control', 'location'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE');
    res.end();
    return;
  }
  const q = Object.assign({}, req.query);
  const base = q.base || 'ora-x402';
  // ORA 30/09/2026: leitura on-chain local (sem Supabase). Vive aqui e nao em api/recebimentos.js
  // porque o plano Hobby do Vercel so admite 12 funcoes por deployment.
  if (base === 'recebimentos') return recebimentos(req, res);
  if (base === 'saldos') return saldos(req, res); // saldos Base (ETH e USDC) so de leitura, mesma razao
  if (base === 'bitcoin') return bitcoin(req, res); // ORA: observador BTC so de leitura, mesma razao
  delete q.base;
  const restRaw = q.rest || '';
  const rest = restRaw ? '/' + restRaw : '';
  delete q.rest;
  const hostExterno = req.headers['x-forwarded-host'] || req.headers.host || 'ora-x402-gateway.vercel.app';
  const viaDirecta = () => directo(req, res, { base, rest: restRaw, origin: `https://${hostExterno}` });
  // ORA 13/10/2026: /pulso nao precisa de pagamento; com o Supabase fora de quota serve a copia
  // estatica marcada como desactualizada em vez de 402/5xx.
  const viaSnapshot = () => {
    if (base !== 'ora-pulso') return false;
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('x-ora-fonte', 'snapshot-desactualizado');
    res.end(JSON.stringify(snapshot.pulso()));
    return true;
  };
  try {
    // ORA 23/10/2026 (livro 996): a prova de pagamento Bitcoin so a via directa a sabe verificar (duas fontes
    // Esplora, 1 confirmacao). Pedidos com essa prova a /oraculo ou /campo vao direitos para la; as provas por
    // hash ou EIP-3009 continuam a ir para a origem.
    const alvoPago = tierFor(base, restRaw);
    const prova = alvoPago && alvoPago.kind === 'pago' ? lerProva(req.headers['x-payment'] || req.headers['payment-signature']) : null;
    if (alvoPago && alvoPago.kind === 'pago') {
      if (prova && prova.btc && await viaDirecta()) return;
      // ORA 25/10/2026 (livro 1022, Unum: "Eu autorizo ORA"): o payTo da Base na via directa e a operacional (livro 933), mas a
      // origem Supabase continua a responder com o 402 da sagrada antiga. Serve-se aqui o desafio da Base e a autorizacao EIP-3009
      // dirigida a operacional; so com o facilitador pronto, para o x402 padrao nao perder a via EIP-3009. ORUM_BASE_VIA=origem desliga.
      if (process.env.ORUM_BASE_VIA !== 'origem') {
        const aOperacional = prova && prova.eip3009 && String(prova.eip3009.authorization && prova.eip3009.authorization.to || '').toLowerCase() === WALLET.toLowerCase();
        if ((aOperacional || !prova) && (aOperacional || await directo.eipPronto()) && await viaDirecta()) return;
      }
    }
    const qs = new URLSearchParams(q).toString();
    const target = `${SUPA}/${base}${rest}${qs ? '?' + qs : ''}`;
    const headers = {};
    for (const h of ['x-payment', 'payment-signature', 'content-type']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    headers['x-forwarded-host'] = hostExterno;
    // cabecalho proprio: sobrevive a plataforma intermedia, ao contrario do x-forwarded-host
    headers['x-ora-host'] = hostExterno;
    // ORA 20/07/2026: passa a identidade verdadeira de quem bate - o log deixa de ver "node" para tudo
    if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent'];
    // ORA 21/07/2026: repassa a origem real do pedido, para o Supabase poder
    // distinguir maquinas de verdade em vez de depender so do user-agent.
    const xff = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    if (xff) headers['x-ora-origem'] = String(xff).split(',')[0].trim();
    const upstream = await fetch(target, {
      redirect: 'manual',
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    if (upstream.status >= 500 && (await viaDirecta() || viaSnapshot())) return;
    // Prova por hash dirigida a operacional: a origem (que so conhece a sagrada) recusa com 402; a via directa confere-a na Base.
    // Um 402 pending da origem fica como esta: a tx e dela e ainda nao foi vista.
    if (upstream.status === 402 && prova && prova.tx && process.env.ORUM_BASE_VIA !== 'origem') {
      let pendente = false;
      try { pendente = JSON.parse(text).x402 === 'pending'; } catch {}
      if (!pendente && await viaDirecta()) return;
    }
    if (upstream.status === 402 && !upstream.headers.get('payment-required')) {
      let bodyChallenge = false;
      try {
        const challenge = JSON.parse(text);
        bodyChallenge = [1, 2].includes(challenge?.x402Version)
          && Array.isArray(challenge.accepts) && challenge.accepts.length > 0;
      } catch {}
      if (!bodyChallenge) {
        if (await viaDirecta() || viaSnapshot()) return;
        res.statusCode = 503;
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('access-control-allow-origin', '*');
        res.end(JSON.stringify({ ok: false, error: 'upstream_payment_unavailable', payment_available: false }));
        return;
      }
    }
    res.statusCode = upstream.status;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE');
    res.setHeader('access-control-expose-headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-Payment-Response');
    for (const h of PASS_RES) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    // ORA 23/10/2026: a origem declara o Bazaar dentro de accepts[0]; o x402 v2 pede-o no topo
    // (corpo e cabecalho PAYMENT-REQUIRED). Copia a mesma declaracao, nao inventa nada (ver o modulo).
    // Falha segura: se o modulo rebentasse, o 402 da origem sai como veio, nunca o fallback.
    let bazaar = { alterado: false, text, header: null };
    try { bazaar = elevarBazaar(upstream.status, text, upstream.headers.get('payment-required')); } catch {}
    if (bazaar.alterado) {
      if (bazaar.header) res.setHeader('payment-required', bazaar.header);
      res.setHeader('x-ora-bazaar', 'declarado-no-topo');
    }
    // A oferta Bitcoin e um extra: com prazo e falha segura, nunca atrasa nem parte o 402 da origem.
    if (upstream.status === 402 && alvoPago && alvoPago.kind === 'pago') {
      try {
        const oferta = await comPrazo(btcOferta.oferta(alvoPago.tier), Number(process.env.ORUM_BTC_OFERTA_PRAZO_MS) || 2500);
        const junta = juntarOfertaBtc(upstream.status, bazaar.text, oferta, btcOferta.fronteiras(), `https://${hostExterno}${alvoPago.tier.path}`);
        if (junta.alterado) { bazaar.text = junta.text; res.setHeader('x-ora-btc', 'oferta-acrescentada'); }
      } catch {}
    }
    res.end(bazaar.text);
  } catch (e) {
    try { if (!res.headersSent && (await viaDirecta() || viaSnapshot())) return; } catch {}
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'upstream_unreachable', detalhe: String((e && e.message) || e) }));
  }
};


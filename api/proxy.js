// ORA · Gateway proxy — reencaminha para as Edge Functions do Supabase
// preservando os cabecalhos do protocolo x402 nos dois sentidos.
// ORA 21/07/2026: repassa tambem uma referencia real de origem do pedido
// (x-forwarded-for) num cabecalho proprio — o log deixava de distinguir
// maquinas de verdade porque muitos clientes chegam com user-agent generico
// "node". O hash em si (sem guardar IP em bruto) e feito do lado do Supabase.
const SUPA = 'https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1';
const PASS_RES = ['content-type', 'payment-required', 'payment-response', 'x-payment-response', 'www-authenticate', 'retry-after', 'x-ora-version', 'x-ora-x402', 'x-ora-tier', 'extension-responses', 'cache-control'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE');
    res.end();
    return;
  }
  try {
    const q = Object.assign({}, req.query);
    const base = q.base || 'ora-x402';
    delete q.base;
    const rest = q.rest ? '/' + q.rest : '';
    delete q.rest;
    const qs = new URLSearchParams(q).toString();
    const target = `${SUPA}/${base}${rest}${qs ? '?' + qs : ''}`;
    const headers = {};
    for (const h of ['x-payment', 'payment-signature', 'content-type']) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }
    headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host || 'ora-x402-gateway.vercel.app';
    // ORA 20/07/2026: passa a identidade verdadeira de quem bate - o log deixa de ver "node" para tudo
    if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent'];
    // ORA 21/07/2026: repassa a origem real do pedido, para o Supabase poder
    // distinguir maquinas de verdade em vez de depender so do user-agent.
    const xff = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    if (xff) headers['x-ora-origin'] = String(xff).split(',')[0].trim();
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    res.statusCode = upstream.status;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, X-PAYMENT, PAYMENT-SIGNATURE');
    res.setHeader('access-control-expose-headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES, X-Payment-Response');
    for (const h of PASS_RES) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    const text = await upstream.text();
    res.end(text);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'upstream_unreachable', detalhe: String((e && e.message) || e) }));
  }
};

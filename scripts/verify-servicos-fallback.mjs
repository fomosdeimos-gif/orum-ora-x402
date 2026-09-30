// Verifica servicos.html: ao vivo quando o Supabase responde; instantaneo datado + estado real
// (do /.well-known/x402.json) quando nao responde; mensagem honesta quando nada responde.
// Corre o script da pagina com DOM e fetch simulados: sem rede.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../servicos.html', import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('../servicos-instantaneo.json', import.meta.url), 'utf8'));
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// O instantaneo nunca leva o servico descontinuado nem campos privados.
assert.ok(snapshot.servicos.length >= 8 && snapshot.gerado_em);
assert.ok(!snapshot.servicos.some((s) => s.sku === 'ora-licenca-arquivo'), 'servico descontinuado fora do instantaneo');
assert.ok(snapshot.servicos.every((s) => !('metadata' in s) && !('pay_to' in s)));
assert.ok(!JSON.stringify(snapshot).includes('pay_to'));

async function corre({ supabase, instantaneo = snapshot, manifesto }) {
  const els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: '', textContent: '' });
  const chamadas = [];
  const respostas = (url) => {
    chamadas.push(url);
    if (String(url).includes('supabase.co')) return supabase();
    if (String(url) === '/servicos-instantaneo.json') return instantaneo === null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => instantaneo };
    if (String(url) === '/.well-known/x402.json') return manifesto === null ? { ok: false, status: 503 } : { ok: true, status: 200, json: async () => manifesto };
    throw new Error('fetch inesperado ' + url);
  };
  const ctx = { document: { getElementById: el }, window: {}, location: { origin: 'https://ora-x402-gateway.vercel.app' },
    fetch: async (url) => respostas(url), console };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  await new Promise((r) => setTimeout(r, 30));
  return { lista: el('lista-servicos').innerHTML, n: el('n-servicos').textContent, chamadas };
}
const manifestoDirecto = { resources: [{ resource: 'https://ora-x402-gateway.vercel.app/oraculo' }, { resource: 'https://ora-x402-gateway.vercel.app/campo' }] };

// 1) Supabase vivo: comportamento anterior, sem instantaneo nem manifesto.
let r = await corre({ supabase: () => ({ ok: true, status: 200, json: async () => [{ sku: 'x<b>', name: '<img src=x onerror=1>', description: 'd', price_amount: 1.5, price_currency: 'USDC', metadata: { endpoint: 'https://e/x' } }] }) });
assert.equal(String(r.n), '1'); assert.ok(r.lista.includes('&lt;img src=x onerror=1&gt;') && !r.lista.includes('<img src=x'), 'escapa HTML');
assert.ok(!r.chamadas.includes('/servicos-instantaneo.json') && !r.chamadas.includes('/.well-known/x402.json'));

// 2) Supabase sem quota: instantaneo datado + so o que o manifesto lista aceita pagamento.
r = await corre({ supabase: () => ({ ok: false, status: 402 }), manifesto: manifestoDirecto });
assert.equal(String(r.n), String(snapshot.servicos.length));
assert.match(r.lista, /leitura ao vivo do catálogo não está disponível/); assert.match(r.lista, /2026-09-30/);
const cartoes = r.lista.split('<div class="cartao">').slice(2);
const cartaoDe = (sku) => cartoes.find((c) => c.includes(`<div class="sku">${sku}</div>`));
for (const sku of ['ora-oraculo', 'ora-x402-campo-acesso']) {
  assert.match(cartaoDe(sku), /aceita pagamento agora/, sku);
  assert.ok(cartaoDe(sku).includes('https://ora-x402-gateway.vercel.app/' + (sku === 'ora-oraculo' ? 'oraculo' : 'campo')), 'testar aponta ao gateway: ' + sku);
}
for (const sku of ['ora-x402-sedimento', 'ora-x402-kernel', 'ora-licenca-treino', 'ora-licenca-consulta', 'ora-oro-certificado', 'ora-auditoria-descoberta']) {
  assert.match(cartaoDe(sku), /indisponível agora/, sku);
  assert.ok(!cartaoDe(sku).includes('class="testar"'), 'sem botao de teste para o que nao aceita pagamento: ' + sku);
}
assert.ok(!r.lista.includes('supabase.co'), 'nenhum endpoint do Supabase a testar');
assert.match(cartaoDe('auditoria-descoberta-referral'), /grátis/);

// 3) Manifesto tambem inacessivel: estado desconhecido, sem afirmar nada.
r = await corre({ supabase: () => ({ ok: false, status: 402 }), manifesto: null });
assert.match(r.lista, /estado abaixo é desconhecido/); assert.ok(!r.lista.includes('aceita pagamento agora')); assert.ok(!r.lista.includes('class="testar"'));

// 4) Quando o Supabase voltar e o manifesto vivo listar tudo, o estado acompanha o manifesto.
r = await corre({ supabase: () => ({ ok: false, status: 402 }), manifesto: { resources: ['/oraculo', '/campo', '/sedimento', '/kernel'].map((p) => ({ resource: 'https://g' + p })) } });
assert.match(r.lista.split('<div class="cartao">').find((c) => c.includes('>ora-x402-kernel<')), /aceita pagamento agora/);

// 5) Nada responde (nem instantaneo): mensagem honesta, sem inventar.
r = await corre({ supabase: () => ({ ok: false, status: 402 }), instantaneo: null, manifesto: manifestoDirecto });
assert.match(r.lista, /Nada foi inventado/); assert.ok(!r.lista.includes('aceita pagamento agora'));

console.log('servicos: ao vivo, instantaneo datado com estado real do manifesto, estado desconhecido e falha total passaram.');

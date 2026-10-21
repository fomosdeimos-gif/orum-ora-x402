// Verifica, sem rede, que as superficies para maquinas (llms.txt, sitemap.xml, agent-card, manifestos)
// so apontam para rotas que existem neste repositorio: ficheiro estatico, rewrite do vercel.json ou
// funcao em api/. Isto prova que a ROTA existe, nao que esteja viva em producao (isso exige leitura publica).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const origem = 'https://ora-x402-gateway.vercel.app';
const vj = JSON.parse(read('vercel.json'));
const rewrites = (vj.rewrites || []).map((r) => r.source);
const rx = (s) => new RegExp('^' + s.replace(/:[a-zA-Z]+\*/g, '.*').replace(/:[a-zA-Z]+/g, '[^/]+') + '$');
const rxs = rewrites.map(rx);
const apis = new Set(readdirSync(new URL('api/', root)).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.slice(0, -3)));

function resolve(path) {
  const p = path.split('?')[0].split('#')[0].replace(/[.,;:]+$/, '') || '/';
  if (p === '/') return existsSync(new URL('index.html', root));
  const rel = p.replace(/^\//, '');
  if (existsSync(new URL(rel, root)) && statSync(new URL(rel, root)).isFile()) return true;
  if (existsSync(new URL(rel + '.html', root))) return true;
  if (p.startsWith('/api/') && apis.has(p.slice(5))) return true;
  return rxs.some((r) => r.test(p));
}

const ficheiros = ['llms.txt', 'sitemap.xml', '.well-known/agent-card.json', 'discovery/ora-mcp-auto.json', 'discovery/orum-connectors.json'];
const mortos = {};
let total = 0;
for (const f of ficheiros) {
  if (!existsSync(new URL(f, root))) continue;
  const urls = new Set([...read(f).matchAll(/https:\/\/ora-x402-gateway\.vercel\.app(\/[^\s)"<>'`,\\]*)/g)].map((m) => m[1]));
  total += urls.size;
  const mal = [...urls].filter((u) => !resolve(u));
  if (mal.length) mortos[f] = mal;
}
assert.deepEqual(mortos, {}, 'superficie para maquinas aponta para rotas sem destino: ' + JSON.stringify(mortos));

// ligacoes internas das paginas HTML da raiz (a casa incluida): href/src comecados por "/"
const paginas = readdirSync(root).filter((f) => f.endsWith('.html'));
const mortasHtml = {};
let totalHtml = 0;
for (const pg of paginas) {
  const links = new Set([...read(pg).matchAll(/(?:href|src)="(\/[^"#?][^"]*)"/g)].map((m) => m[1]));
  totalHtml += links.size;
  const mal = [...links].filter((u) => !resolve(u));
  if (mal.length) mortasHtml[pg] = mal;
}
assert.deepEqual(mortasHtml, {}, 'pagina HTML com ligacao interna sem destino: ' + JSON.stringify(mortasHtml));

// a prova de carteira so pode ser anunciada se o ficheiro existir
const card = JSON.parse(read('.well-known/agent-card.json'));
if (card.trust.walletProof) assert.ok(resolve(new URL(card.trust.walletProof).pathname), 'walletProof anunciada sem ficheiro');
else assert.equal(card.trust.walletProofStatus, 'not_published', 'walletProof ausente sem estado declarado');

// quem declara disponibilidade tem de dizer o estado, a data da leitura e onde se confirma ao vivo
const estados = new Set(['available', 'unavailable', 'unknown']);
for (const sk of card.httpServiceSkills || []) {
  if (!sk.availability) continue;
  const a = sk.availability;
  assert.ok(estados.has(a.state), `availability.state invalido em ${sk.id}`);
  assert.match(String(a.observedAt), /^\d{4}-\d{2}-\d{2}$/, `availability.observedAt em falta em ${sk.id}`);
  assert.ok(a.liveSource && a.reason, `availability sem liveSource/reason em ${sk.id}`);
}

// a carteira de recepcao e a mesma em todas as superficies
const wallet = createRequire(import.meta.url)('../api/_carteira.js').RECEBIMENTO_EDGE; // o que os textos públicos e as funções de borda anunciam (a via directa cobra na operacional)
assert.equal(card.trust.paymentWallet, wallet, 'carteira do agent-card difere da do gateway');
console.log(JSON.stringify({ verified: true, urls_verificadas: total, ligacoes_html: totalHtml, paginas_html: paginas.length, ficheiros: ficheiros.length, nota: 'rota existe no repositorio; vida em producao exige leitura publica' }));

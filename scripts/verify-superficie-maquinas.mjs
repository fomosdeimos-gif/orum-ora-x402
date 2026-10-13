// Verifica, sem rede, que as superficies para maquinas (llms.txt, sitemap.xml, agent-card, manifestos)
// so apontam para rotas que existem neste repositorio: ficheiro estatico, rewrite do vercel.json ou
// funcao em api/. Isto prova que a ROTA existe, nao que esteja viva em producao (isso exige leitura publica).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

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

// a carteira de recepcao e a mesma em todas as superficies
const wallet = (read('api/_x402-directo.js').match(/const WALLET = '(0x[0-9a-fA-F]{40})'/) || [])[1];
assert.equal(card.trust.paymentWallet, wallet, 'carteira do agent-card difere da do gateway');
console.log(JSON.stringify({ verified: true, urls_verificadas: total, ligacoes_html: totalHtml, paginas_html: paginas.length, ficheiros: ficheiros.length, nota: 'rota existe no repositorio; vida em producao exige leitura publica' }));
